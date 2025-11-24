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

    // Discovered URLs tracking
    this.discovered = new Set()
    this.queued = new Set()

    // Robots.txt cache
    this.robotsCache = new Map()
  }

  /**
   * Set the URL pattern matcher
   * @param {URLPatternMatcher} matcher
   */
  setPatternMatcher(matcher) {
    this.patternMatcher = matcher
  }

  /**
   * Extract links from HTML content
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

    // Extract href attributes
    const hrefRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi
    let match

    while ((match = hrefRegex.exec(html)) !== null) {
      const href = match[0]
      const url = match[1]

      if (!url || url.trim() === '') continue

      try {
        // Resolve relative URLs
        const resolvedUrl = new URL(url, baseUrl)

        // Normalize URL
        const normalizedUrl = this._normalizeUrl(resolvedUrl)

        // Skip if already discovered
        if (this.discovered.has(normalizedUrl)) continue

        // Apply filters
        if (!this._shouldFollow(resolvedUrl, baseUrlObj)) continue

        // Extract anchor text
        const anchorMatch = href.match(/>([^<]*)</i)
        const anchorText = anchorMatch ? anchorMatch[1].trim() : ''

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
      maxUrls: this.config.maxUrls,
      maxDepth: this.config.maxDepth,
      remaining: this.config.maxUrls - this.discovered.size
    }
  }

  /**
   * Reset discovery state
   */
  reset() {
    this.discovered.clear()
    this.queued.clear()
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
