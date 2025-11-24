/**
 * Link Discoverer - Extracts and filters links from pages for auto-crawling
 *
 * Features:
 * - Extract all links from a page
 * - Filter by pattern matching
 * - Filter by domain (same-domain, subdomains, specific domains)
 * - Respect robots.txt
 * - Track crawl depth
 * - Deduplicate URLs
 */

import { RobotsParser } from './robots-parser.js'

export class LinkDiscoverer {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled !== false,
      maxDepth: config.maxDepth || 3,
      maxUrls: config.maxUrls || 1000,
      sameDomainOnly: config.sameDomainOnly !== false,
      includeSubdomains: config.includeSubdomains !== false,
      allowedDomains: config.allowedDomains || [],
      blockedDomains: config.blockedDomains || [],
      followPatterns: config.followPatterns || [],     // Pattern names to follow
      followRegex: config.followRegex || null,         // Regex to match URLs
      ignoreRegex: config.ignoreRegex || null,         // Regex to ignore URLs
      respectRobotsTxt: config.respectRobotsTxt !== false,
      ignoreQueryString: config.ignoreQueryString || false,
      ignoreHash: config.ignoreHash !== false,
      // Robots.txt configuration
      robotsUserAgent: config.robotsUserAgent || 's3db-spider',
      robotsCacheTimeout: config.robotsCacheTimeout || 3600000, // 1 hour
      // Default ignore patterns (common non-content pages)
      defaultIgnore: config.defaultIgnore || [
        /\.(css|js|json|xml|ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot|pdf|zip|tar|gz)$/i,
        /^mailto:/i,
        /^tel:/i,
        /^javascript:/i,
        /^#/,
        /\/login/i,
        /\/logout/i,
        /\/signin/i,
        /\/signout/i,
        /\/cart/i,
        /\/checkout/i,
        /\/account/i,
        /\/privacy/i,
        /\/terms/i,
        /\/cookie/i
      ]
    }

    // URL pattern matcher reference (set by SpiderPlugin)
    this.patternMatcher = null

    // Robots.txt parser
    this.robotsParser = config.respectRobotsTxt !== false
      ? new RobotsParser({
          userAgent: this.config.robotsUserAgent,
          cacheTimeout: this.config.robotsCacheTimeout,
          fetcher: config.robotsFetcher || null
        })
      : null

    // Discovered URLs tracking
    this.discovered = new Set()
    this.queued = new Set()

    // URLs blocked by robots.txt
    this.blockedByRobots = new Set()
  }

  /**
   * Set the URL pattern matcher
   * @param {URLPatternMatcher} matcher
   */
  setPatternMatcher(matcher) {
    this.patternMatcher = matcher
  }

  /**
   * Set custom robots.txt fetcher (for testing)
   * @param {Function} fetcher - async (url) => string
   */
  setRobotsFetcher(fetcher) {
    if (this.robotsParser) {
      this.robotsParser.setFetcher(fetcher)
    }
  }

  /**
   * Extract links from HTML content (sync version - no robots.txt check)
   *
   * @param {string} html - HTML content
   * @param {string} baseUrl - Base URL for resolving relative links
   * @param {number} currentDepth - Current crawl depth
   * @returns {Array<Object>} Discovered links with metadata
   */
  extractLinks(html, baseUrl, currentDepth = 0) {
    if (!this.config.enabled) return []
    if (currentDepth >= this.config.maxDepth) return []
    if (this.discovered.size >= this.config.maxUrls) return []

    const links = []
    const baseUrlObj = new URL(baseUrl)

    // Extract href attributes and anchor text
    const hrefRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi
    let match

    while ((match = hrefRegex.exec(html)) !== null) {
      const url = match[1]
      const anchorText = match[2] ? match[2].trim() : ''

      if (!url || url.trim() === '') continue

      // Skip hash-only links (e.g., #section)
      if (url.startsWith('#')) continue

      try {
        // Resolve relative URLs
        const resolvedUrl = new URL(url, baseUrl)

        // Normalize URL
        const normalizedUrl = this._normalizeUrl(resolvedUrl)

        // Skip if already discovered
        if (this.discovered.has(normalizedUrl)) continue

        // Apply filters
        if (!this._shouldFollow(resolvedUrl, baseUrlObj)) continue

        // Match against patterns
        let patternMatch = null
        if (this.patternMatcher) {
          patternMatch = this.patternMatcher.match(normalizedUrl)
        }

        // Check if we should follow based on pattern
        if (!this._shouldFollowPattern(patternMatch)) continue

        // Mark as discovered
        this.discovered.add(normalizedUrl)

        links.push({
          url: normalizedUrl,
          anchorText,
          depth: currentDepth + 1,
          sourceUrl: baseUrl,
          pattern: patternMatch?.pattern || null,
          params: patternMatch?.params || {},
          activities: patternMatch?.activities || [],
          metadata: {
            ...patternMatch?.metadata,
            discoveredFrom: baseUrl,
            depth: currentDepth + 1,
            anchorText
          }
        })

        // Check max URLs limit
        if (this.discovered.size >= this.config.maxUrls) break

      } catch (e) {
        // Invalid URL, skip
        continue
      }
    }

    return links
  }

  /**
   * Extract links from HTML content with robots.txt checking
   *
   * @param {string} html - HTML content
   * @param {string} baseUrl - Base URL for resolving relative links
   * @param {number} currentDepth - Current crawl depth
   * @returns {Promise<Array<Object>>} Discovered links with metadata
   */
  async extractLinksAsync(html, baseUrl, currentDepth = 0) {
    // First extract all links (sync)
    const links = this.extractLinks(html, baseUrl, currentDepth)

    // If no robots.txt checking, return as-is
    if (!this.robotsParser || !this.config.respectRobotsTxt) {
      return links
    }

    // Filter by robots.txt (in parallel for performance)
    const results = await Promise.all(
      links.map(async (link) => {
        const result = await this.robotsParser.isAllowed(link.url)
        return { link, allowed: result.allowed, crawlDelay: result.crawlDelay }
      })
    )

    // Return only allowed links, track blocked ones
    const allowedLinks = []
    for (const { link, allowed, crawlDelay } of results) {
      if (allowed) {
        if (crawlDelay) {
          link.metadata.crawlDelay = crawlDelay
        }
        allowedLinks.push(link)
      } else {
        this.blockedByRobots.add(link.url)
      }
    }

    return allowedLinks
  }

  /**
   * Check if a single URL is allowed by robots.txt
   *
   * @param {string} url - URL to check
   * @returns {Promise<{allowed: boolean, crawlDelay?: number}>}
   */
  async isAllowedByRobots(url) {
    if (!this.robotsParser || !this.config.respectRobotsTxt) {
      return { allowed: true }
    }
    return await this.robotsParser.isAllowed(url)
  }

  /**
   * Preload robots.txt for a domain
   *
   * @param {string} url - Any URL from the domain
   */
  async preloadRobots(url) {
    if (!this.robotsParser) return

    try {
      const urlObj = new URL(url)
      const domain = `${urlObj.protocol}//${urlObj.host}`
      await this.robotsParser.preload(domain)
    } catch {
      // Invalid URL, ignore
    }
  }

  /**
   * Get sitemaps from robots.txt for a domain
   *
   * @param {string} url - Any URL from the domain
   * @returns {Promise<string[]>} Array of sitemap URLs
   */
  async getSitemaps(url) {
    if (!this.robotsParser) return []

    try {
      const urlObj = new URL(url)
      const domain = `${urlObj.protocol}//${urlObj.host}`
      return await this.robotsParser.getSitemaps(domain)
    } catch {
      return []
    }
  }

  /**
   * Normalize URL for deduplication
   * @private
   */
  _normalizeUrl(urlObj) {
    let normalized = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`

    // Remove trailing slash
    if (normalized.endsWith('/') && normalized.length > 1) {
      normalized = normalized.slice(0, -1)
    }

    // Include query string unless configured to ignore
    if (!this.config.ignoreQueryString && urlObj.search) {
      // Sort query params for consistent deduplication
      const params = new URLSearchParams(urlObj.search)
      const sortedParams = new URLSearchParams([...params.entries()].sort())
      const queryString = sortedParams.toString()
      if (queryString) {
        normalized += '?' + queryString
      }
    }

    return normalized
  }

  /**
   * Check if URL should be followed based on domain and filters
   * @private
   */
  _shouldFollow(urlObj, baseUrlObj) {
    // Check default ignore patterns
    for (const pattern of this.config.defaultIgnore) {
      if (pattern.test(urlObj.href)) return false
    }

    // Check ignore regex
    if (this.config.ignoreRegex && this.config.ignoreRegex.test(urlObj.href)) {
      return false
    }

    // Check blocked domains
    for (const blocked of this.config.blockedDomains) {
      if (urlObj.hostname.includes(blocked)) return false
    }

    // Check same domain
    if (this.config.sameDomainOnly) {
      const baseDomain = this._getMainDomain(baseUrlObj.hostname)
      const linkDomain = this._getMainDomain(urlObj.hostname)

      if (this.config.includeSubdomains) {
        // Allow subdomains of same main domain
        if (baseDomain !== linkDomain) return false
      } else {
        // Exact domain match only
        if (baseUrlObj.hostname !== urlObj.hostname) return false
      }
    }

    // Check allowed domains
    if (this.config.allowedDomains.length > 0) {
      const allowed = this.config.allowedDomains.some(domain =>
        urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
      )
      if (!allowed) return false
    }

    // Check follow regex
    if (this.config.followRegex && !this.config.followRegex.test(urlObj.href)) {
      return false
    }

    return true
  }

  /**
   * Check if URL should be followed based on pattern matching
   * @private
   */
  _shouldFollowPattern(patternMatch) {
    // If no pattern matcher or no follow patterns configured, allow all
    if (!this.patternMatcher) return true
    if (this.config.followPatterns.length === 0) return true

    // If URL doesn't match any pattern, check if default is allowed
    if (!patternMatch || patternMatch.isDefault) {
      return this.config.followPatterns.includes('default')
    }

    // Check if pattern is in follow list
    return this.config.followPatterns.includes(patternMatch.pattern)
  }

  /**
   * Get main domain from hostname (removes subdomains)
   * @private
   */
  _getMainDomain(hostname) {
    const parts = hostname.split('.')
    if (parts.length <= 2) return hostname
    return parts.slice(-2).join('.')
  }

  /**
   * Mark URL as queued (to avoid re-queueing)
   * @param {string} url
   */
  markQueued(url) {
    this.queued.add(this._normalizeUrl(new URL(url)))
  }

  /**
   * Check if URL is already queued
   * @param {string} url
   * @returns {boolean}
   */
  isQueued(url) {
    try {
      return this.queued.has(this._normalizeUrl(new URL(url)))
    } catch {
      return false
    }
  }

  /**
   * Get discovery statistics
   * @returns {Object}
   */
  getStats() {
    return {
      discovered: this.discovered.size,
      queued: this.queued.size,
      blockedByRobots: this.blockedByRobots.size,
      maxUrls: this.config.maxUrls,
      maxDepth: this.config.maxDepth,
      remaining: this.config.maxUrls - this.discovered.size,
      robotsCacheSize: this.robotsParser?.getCacheStats()?.size || 0
    }
  }

  /**
   * Reset discovery state
   * @param {Object} options - Reset options
   * @param {boolean} options.clearRobotsCache - Also clear robots.txt cache
   */
  reset(options = {}) {
    this.discovered.clear()
    this.queued.clear()
    this.blockedByRobots.clear()

    if (options.clearRobotsCache && this.robotsParser) {
      this.robotsParser.clearCache()
    }
  }

  /**
   * Check if discovery limit reached
   * @returns {boolean}
   */
  isLimitReached() {
    return this.discovered.size >= this.config.maxUrls
  }
}

export default LinkDiscoverer
