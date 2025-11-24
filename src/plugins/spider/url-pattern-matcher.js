/**
 * URL Pattern Matcher - Express-style path matching with parameter extraction
 *
 * Supports:
 * - Express-style patterns: '/dp/:asin', '/products/:id/reviews'
 * - Wildcards: '/dp/:asin/*', '/category/*'
 * - Optional segments: '/products/:id?'
 * - Query string patterns: '/search?q=:query&page=:page'
 * - Pure regex patterns: /\/dp\/([A-Z0-9]{10})/
 * - Glob patterns: '**.amazon.com/dp/*'
 */

export class URLPatternMatcher {
  constructor(patterns = {}) {
    this.patterns = new Map()
    this.defaultPattern = null

    // Process and compile patterns
    for (const [name, config] of Object.entries(patterns)) {
      if (name === 'default') {
        this.defaultPattern = {
          name: 'default',
          ...config
        }
      } else {
        this.patterns.set(name, this._compilePattern(name, config))
      }
    }
  }

  /**
   * Compile a pattern configuration into a matcher
   * @private
   */
  _compilePattern(name, config) {
    const pattern = {
      name,
      original: config.match,
      activities: config.activities || [],
      extract: config.extract || {},
      priority: config.priority || 0,
      metadata: config.metadata || {},
      regex: null,
      paramNames: []
    }

    if (config.match instanceof RegExp) {
      // Already a regex
      pattern.regex = config.match
      // Extract param names from extract config
      pattern.paramNames = Object.keys(config.extract || {})
    } else if (typeof config.match === 'string') {
      // Convert Express-style pattern to regex
      const { regex, paramNames } = this._pathToRegex(config.match)
      pattern.regex = regex
      pattern.paramNames = paramNames
    }

    return pattern
  }

  /**
   * Convert Express-style path to regex
   * Supports: :param, :param?, *, **
   * @private
   */
  _pathToRegex(path) {
    const paramNames = []
    let regexStr = path

    // Handle query string patterns separately
    let queryPattern = ''
    const queryIndex = path.indexOf('?')
    if (queryIndex !== -1) {
      queryPattern = path.slice(queryIndex + 1)
      regexStr = path.slice(0, queryIndex)
    }

    // First, replace our special patterns with placeholders to protect them
    // Replace ** first (before escaping)
    regexStr = regexStr.replace(/\*\*/g, '___DOUBLE_STAR___')

    // Replace * (before escaping)
    regexStr = regexStr.replace(/\*/g, '___SINGLE_STAR___')

    // Replace :param? (before escaping)
    regexStr = regexStr.replace(/:(\w+)\?/g, (_, name) => {
      paramNames.push(name)
      return '___OPT_PARAM___'
    })

    // Replace :param (before escaping)
    regexStr = regexStr.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name)
      return '___REQ_PARAM___'
    })

    // Now escape special regex characters
    regexStr = regexStr.replace(/[.+^${}()|[\]\\]/g, '\\$&')

    // Restore placeholders with actual regex patterns
    regexStr = regexStr.replace(/___DOUBLE_STAR___/g, '.*')
    regexStr = regexStr.replace(/___SINGLE_STAR___/g, '[^/]+')
    regexStr = regexStr.replace(/___OPT_PARAM___/g, '([^/]*)')
    regexStr = regexStr.replace(/___REQ_PARAM___/g, '([^/]+)')

    // Handle query string parameters
    if (queryPattern) {
      // Make query string optional in matching
      let queryRegex = '(?:\\?'

      // Parse query params
      const queryParts = queryPattern.split('&')
      const queryRegexParts = []

      for (const part of queryParts) {
        const [key, value] = part.split('=')
        if (value && value.startsWith(':')) {
          const paramName = value.slice(1)
          paramNames.push(paramName)
          // Match this query param anywhere in the query string
          queryRegexParts.push(`(?:.*[?&]${key}=([^&]+))`)
        }
      }

      if (queryRegexParts.length > 0) {
        // Use lookahead to match query params in any order
        queryRegex = '(?:\\?.*)?'
        // We'll extract query params separately
      }

      regexStr += queryRegex
    }

    // Allow optional trailing slash and anchor the pattern
    const regex = new RegExp(`^${regexStr}\\/?(?:[?#].*)?$`, 'i')

    return { regex, paramNames }
  }

  /**
   * Match a URL against all patterns
   * Returns the best matching pattern with extracted params
   *
   * @param {string} url - Full URL or path to match
   * @returns {Object|null} Match result with pattern name, params, activities
   */
  match(url) {
    let urlObj
    try {
      urlObj = new URL(url)
    } catch {
      // If not a valid URL, treat as path
      urlObj = { pathname: url, search: '', searchParams: new URLSearchParams() }
    }

    const path = urlObj.pathname
    const matches = []

    // Test all patterns
    for (const [name, pattern] of this.patterns) {
      const match = pattern.regex.exec(path)
      if (match) {
        const params = this._extractParams(match, pattern, urlObj)
        matches.push({
          pattern: name,
          params,
          activities: pattern.activities,
          metadata: { ...pattern.metadata, ...params },
          priority: pattern.priority,
          config: pattern
        })
      }
    }

    // Sort by priority (highest first) and specificity
    matches.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      // More specific patterns (more params) win
      return Object.keys(b.params).length - Object.keys(a.params).length
    })

    if (matches.length > 0) {
      return matches[0]
    }

    // Return default pattern if no match
    if (this.defaultPattern) {
      return {
        pattern: 'default',
        params: {},
        activities: this.defaultPattern.activities || [],
        metadata: this.defaultPattern.metadata || {},
        priority: -1,
        config: this.defaultPattern,
        isDefault: true
      }
    }

    return null
  }

  /**
   * Extract parameters from regex match and query string
   * @private
   */
  _extractParams(match, pattern, urlObj) {
    const params = {}

    // Extract from path regex groups
    for (let i = 0; i < pattern.paramNames.length; i++) {
      const name = pattern.paramNames[i]
      const value = match[i + 1]
      if (value !== undefined) {
        params[name] = decodeURIComponent(value)
      }
    }

    // Extract from query string if pattern has extract config
    if (pattern.extract && urlObj.searchParams) {
      for (const [paramName, queryKey] of Object.entries(pattern.extract)) {
        if (typeof queryKey === 'string') {
          const value = urlObj.searchParams.get(queryKey)
          if (value) {
            params[paramName] = value
          }
        }
      }
    }

    return params
  }

  /**
   * Check if a URL matches any pattern (quick check)
   *
   * @param {string} url - URL to check
   * @returns {boolean}
   */
  matches(url) {
    const result = this.match(url)
    return result !== null && !result.isDefault
  }

  /**
   * Get all pattern names
   * @returns {string[]}
   */
  getPatternNames() {
    return [...this.patterns.keys()]
  }

  /**
   * Add a new pattern at runtime
   *
   * @param {string} name - Pattern name
   * @param {Object} config - Pattern configuration
   */
  addPattern(name, config) {
    if (name === 'default') {
      this.defaultPattern = { name: 'default', ...config }
    } else {
      this.patterns.set(name, this._compilePattern(name, config))
    }
  }

  /**
   * Remove a pattern
   *
   * @param {string} name - Pattern name
   */
  removePattern(name) {
    if (name === 'default') {
      this.defaultPattern = null
    } else {
      this.patterns.delete(name)
    }
  }

  /**
   * Filter URLs that match specific patterns
   *
   * @param {string[]} urls - URLs to filter
   * @param {string[]} patternNames - Pattern names to match (optional, all if empty)
   * @returns {Array<{url: string, match: Object}>}
   */
  filterUrls(urls, patternNames = []) {
    const results = []

    for (const url of urls) {
      const match = this.match(url)
      if (match && !match.isDefault) {
        if (patternNames.length === 0 || patternNames.includes(match.pattern)) {
          results.push({ url, match })
        }
      }
    }

    return results
  }
}

export default URLPatternMatcher
