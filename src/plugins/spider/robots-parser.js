/**
 * Robots.txt Parser - Parses and evaluates robots.txt rules
 *
 * Features:
 * - Parse robots.txt format (User-agent, Allow, Disallow, Crawl-delay)
 * - Support for wildcard patterns (* and $)
 * - User-agent matching with inheritance
 * - Caching of parsed rules per domain
 * - Sitemap extraction
 */

export class RobotsParser {
  constructor(config = {}) {
    this.config = {
      userAgent: config.userAgent || 's3db-spider',
      defaultAllow: config.defaultAllow !== false,
      cacheTimeout: config.cacheTimeout || 3600000, // 1 hour
      fetchTimeout: config.fetchTimeout || 10000,   // 10 seconds
      ...config
    }

    // Cache parsed robots.txt per domain
    this.cache = new Map()

    // Custom fetcher (for testing)
    this.fetcher = config.fetcher || null
  }

  /**
   * Set custom fetcher function for testing
   * @param {Function} fetcher - async (url) => string
   */
  setFetcher(fetcher) {
    this.fetcher = fetcher
  }

  /**
   * Check if a URL is allowed by robots.txt
   *
   * @param {string} url - Full URL to check
   * @returns {Promise<{allowed: boolean, crawlDelay?: number, source: string}>}
   */
  async isAllowed(url) {
    try {
      const urlObj = new URL(url)
      const domain = `${urlObj.protocol}//${urlObj.host}`
      const path = urlObj.pathname + urlObj.search

      // Get or fetch robots.txt rules
      const rules = await this._getRules(domain)

      if (!rules) {
        return { allowed: this.config.defaultAllow, source: 'no-robots-txt' }
      }

      // Find matching user-agent rules
      const agentRules = this._findAgentRules(rules)

      if (!agentRules || agentRules.length === 0) {
        return { allowed: this.config.defaultAllow, source: 'no-matching-agent' }
      }

      // Check path against rules
      const result = this._checkPath(path, agentRules)

      return {
        allowed: result.allowed,
        crawlDelay: result.crawlDelay,
        source: 'robots-txt'
      }

    } catch (error) {
      // On error, use default behavior
      return {
        allowed: this.config.defaultAllow,
        source: 'error',
        error: error.message
      }
    }
  }

  /**
   * Get or fetch robots.txt rules for a domain
   * @private
   */
  async _getRules(domain) {
    // Check cache
    const cached = this.cache.get(domain)
    if (cached && Date.now() - cached.timestamp < this.config.cacheTimeout) {
      return cached.rules
    }

    // Fetch robots.txt
    const robotsUrl = `${domain}/robots.txt`
    let content = null

    try {
      if (this.fetcher) {
        content = await this.fetcher(robotsUrl)
      } else {
        content = await this._fetchRobotsTxt(robotsUrl)
      }
    } catch (error) {
      // robots.txt not found or error - cache as null
      this.cache.set(domain, { rules: null, timestamp: Date.now() })
      return null
    }

    // Parse content
    const rules = this._parse(content)

    // Cache rules
    this.cache.set(domain, { rules, timestamp: Date.now() })

    return rules
  }

  /**
   * Fetch robots.txt content
   * @private
   */
  async _fetchRobotsTxt(url) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.fetchTimeout)

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.config.userAgent
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return await response.text()
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * Parse robots.txt content
   * @param {string} content - robots.txt content
   * @returns {Object} Parsed rules by user-agent
   */
  _parse(content) {
    const rules = {
      agents: new Map(),
      sitemaps: []
    }

    if (!content || typeof content !== 'string') {
      return rules
    }

    const lines = content.split(/\r?\n/)
    let currentAgents = []

    for (let line of lines) {
      // Remove comments
      const commentIndex = line.indexOf('#')
      if (commentIndex !== -1) {
        line = line.slice(0, commentIndex)
      }

      line = line.trim()
      if (!line) continue

      // Parse directive
      const colonIndex = line.indexOf(':')
      if (colonIndex === -1) continue

      const directive = line.slice(0, colonIndex).trim().toLowerCase()
      const value = line.slice(colonIndex + 1).trim()

      switch (directive) {
        case 'user-agent':
          // New user-agent starts a new block
          if (currentAgents.length > 0 && this._hasRules(rules, currentAgents)) {
            currentAgents = []
          }
          currentAgents.push(value.toLowerCase())

          // Initialize agent rules if not exists
          for (const agent of currentAgents) {
            if (!rules.agents.has(agent)) {
              rules.agents.set(agent, {
                allow: [],
                disallow: [],
                crawlDelay: null
              })
            }
          }
          break

        case 'allow':
          if (value && currentAgents.length > 0) {
            for (const agent of currentAgents) {
              const agentRules = rules.agents.get(agent)
              agentRules.allow.push(this._compilePattern(value))
            }
          }
          break

        case 'disallow':
          if (currentAgents.length > 0) {
            for (const agent of currentAgents) {
              const agentRules = rules.agents.get(agent)
              // Empty disallow means allow all
              if (value) {
                agentRules.disallow.push(this._compilePattern(value))
              }
            }
          }
          break

        case 'crawl-delay':
          if (currentAgents.length > 0) {
            const delay = parseFloat(value)
            if (!isNaN(delay) && delay >= 0) {
              for (const agent of currentAgents) {
                const agentRules = rules.agents.get(agent)
                agentRules.crawlDelay = delay * 1000 // Convert to ms
              }
            }
          }
          break

        case 'sitemap':
          if (value) {
            rules.sitemaps.push(value)
          }
          break
      }
    }

    return rules
  }

  /**
   * Check if agents have any rules defined
   * @private
   */
  _hasRules(rules, agents) {
    for (const agent of agents) {
      const agentRules = rules.agents.get(agent)
      if (agentRules && (agentRules.allow.length > 0 || agentRules.disallow.length > 0)) {
        return true
      }
    }
    return false
  }

  /**
   * Compile a robots.txt pattern to regex
   * Supports * (any chars) and $ (end of string)
   * @private
   */
  _compilePattern(pattern) {
    // Escape regex special chars except * and $
    let escaped = pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&')

    // Convert * to regex (.*?)
    escaped = escaped.replace(/\*/g, '.*')

    // Handle $ at end (exact match)
    if (escaped.endsWith('$')) {
      escaped = escaped.slice(0, -1) + '$'
    } else {
      // Without $, pattern is a prefix match
      escaped = escaped + '.*'
    }

    return {
      original: pattern,
      regex: new RegExp(`^${escaped}$`, 'i'),
      length: pattern.replace(/\*/g, '').length // For specificity
    }
  }

  /**
   * Find rules for our user-agent
   * Priority: exact match > partial match > wildcard (*)
   * @private
   */
  _findAgentRules(rules) {
    const userAgent = this.config.userAgent.toLowerCase()

    // 1. Check for exact match
    if (rules.agents.has(userAgent)) {
      return this._combineRules(rules.agents.get(userAgent))
    }

    // 2. Check for partial match (agent name contains our UA or vice versa)
    for (const [agent, agentRules] of rules.agents) {
      if (agent !== '*' && (agent.includes(userAgent) || userAgent.includes(agent))) {
        return this._combineRules(agentRules)
      }
    }

    // 3. Use wildcard rules
    if (rules.agents.has('*')) {
      return this._combineRules(rules.agents.get('*'))
    }

    return null
  }

  /**
   * Combine allow/disallow rules into a single list with type
   * @private
   */
  _combineRules(agentRules) {
    const combined = []

    for (const rule of agentRules.allow) {
      combined.push({ type: 'allow', ...rule })
    }

    for (const rule of agentRules.disallow) {
      combined.push({ type: 'disallow', ...rule })
    }

    // Sort by specificity (longer patterns first)
    combined.sort((a, b) => b.length - a.length)

    return {
      rules: combined,
      crawlDelay: agentRules.crawlDelay
    }
  }

  /**
   * Check if path is allowed
   * Most specific matching rule wins
   * @private
   */
  _checkPath(path, agentRules) {
    const { rules, crawlDelay } = agentRules

    // Empty rules = allow all
    if (rules.length === 0) {
      return { allowed: true, crawlDelay }
    }

    // Find first matching rule (sorted by specificity)
    for (const rule of rules) {
      if (rule.regex.test(path)) {
        return {
          allowed: rule.type === 'allow',
          crawlDelay,
          matchedRule: rule.original
        }
      }
    }

    // No match = allow
    return { allowed: true, crawlDelay }
  }

  /**
   * Get sitemaps from robots.txt
   *
   * @param {string} domain - Domain URL (e.g., 'https://example.com')
   * @returns {Promise<string[]>} Array of sitemap URLs
   */
  async getSitemaps(domain) {
    const rules = await this._getRules(domain)
    return rules?.sitemaps || []
  }

  /**
   * Get crawl delay for a domain
   *
   * @param {string} domain - Domain URL
   * @returns {Promise<number|null>} Crawl delay in milliseconds, or null
   */
  async getCrawlDelay(domain) {
    const rules = await this._getRules(domain)
    if (!rules) return null

    const agentRules = this._findAgentRules(rules)
    return agentRules?.crawlDelay || null
  }

  /**
   * Preload robots.txt for a domain
   *
   * @param {string} domain - Domain URL
   */
  async preload(domain) {
    await this._getRules(domain)
  }

  /**
   * Clear cache for a domain or all domains
   *
   * @param {string} [domain] - Domain to clear, or all if not specified
   */
  clearCache(domain) {
    if (domain) {
      this.cache.delete(domain)
    } else {
      this.cache.clear()
    }
  }

  /**
   * Get cache statistics
   *
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      domains: [...this.cache.keys()]
    }
  }
}

export default RobotsParser
