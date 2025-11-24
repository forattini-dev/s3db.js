/**
 * Security Analyzer - Analyzes security headers, CSP, CORS, and console logs
 *
 * Analyzes:
 * - HTTP security headers (X-Frame-Options, X-Content-Type-Options, etc.)
 * - Content Security Policy (CSP)
 * - Cross-Origin Resource Sharing (CORS)
 * - Console logs, warnings, errors captured during page load
 * - TLS/SSL certificate information
 * - Security misconfigurations and vulnerabilities
 */
export class SecurityAnalyzer {
  constructor(config = {}) {
    this.config = {
      // Security headers analysis
      analyzeSecurityHeaders: config.analyzeSecurityHeaders !== false,

      // CSP analysis
      analyzeCSP: config.analyzeCSP !== false,

      // CORS analysis
      analyzeCORS: config.analyzeCORS !== false,

      // Console logs
      captureConsoleLogs: config.captureConsoleLogs !== false,
      consoleLogLevels: config.consoleLogLevels || ['error', 'warn', 'log'],
      maxConsoleLogLines: config.maxConsoleLogLines || 100,

      // TLS/SSL
      analyzeTLS: config.analyzeTLS !== false,

      // WebSockets
      captureWebSockets: config.captureWebSockets !== false,
      maxWebSocketMessages: config.maxWebSocketMessages || 50,

      // Vulnerabilities
      checkVulnerabilities: config.checkVulnerabilities !== false
    }
  }

  /**
   * Selective security analysis based on requested activities
   *
   * @param {Object} page - Puppeteer page object
   * @param {string} baseUrl - Base URL
   * @param {string} html - HTML content (optional)
   * @param {Array<string>} activities - List of activity names to execute
   * @returns {Object} Security analysis results
   */
  async analyzeSelective(page, baseUrl, html = null, activities = []) {
    // If no activities specified, run all
    if (!activities || activities.length === 0) {
      return this.analyze(page, baseUrl, html)
    }

    const result = {
      securityHeaders: null,
      csp: null,
      cors: null,
      consoleLogs: null,
      tls: null,
      captcha: null,
      websockets: null,
      vulnerabilities: [],
      securityScore: 0
    }

    try {
      // Capture response headers from first request
      let responseHeaders = {}
      const captureHeaders = async (response) => {
        if (response.url() === baseUrl || response.url().startsWith(baseUrl)) {
          const headers = response.headers()
          responseHeaders = { ...headers }
        }
      }

      page.on('response', captureHeaders)

      // Capture console logs if requested
      let consoleLogs = []
      if (activities.includes('security_console_logs')) {
        page.on('console', (msg) => {
          consoleLogs.push({
            type: msg.type(),
            text: msg.text(),
            location: msg.location(),
            args: msg.args().length
          })
        })
      }

      // Map activities to analysis functions
      if (activities.includes('security_headers')) {
        result.securityHeaders = this._analyzeSecurityHeaders(responseHeaders)
      }

      if (activities.includes('security_csp')) {
        result.csp = this._analyzeCSP(responseHeaders)
      }

      if (activities.includes('security_cors')) {
        result.cors = this._analyzeCORS(responseHeaders, baseUrl)
      }

      if (activities.includes('security_console_logs') && consoleLogs.length > 0) {
        result.consoleLogs = {
          total: consoleLogs.length,
          byType: this._groupByType(consoleLogs),
          logs: consoleLogs.slice(0, this.config.maxConsoleLogLines)
        }
      }

      if (activities.includes('security_tls')) {
        result.tls = this._analyzeTLS(baseUrl, responseHeaders)
      }

      if (activities.includes('security_websockets')) {
        result.websockets = await this._captureWebSockets(page)
      }

      if (activities.includes('security_captcha')) {
        const pageContent = html || (await page.content())
        result.captcha = this._detectCaptcha(pageContent)
      }

      if (activities.includes('security_vulnerabilities')) {
        result.vulnerabilities = this._checkVulnerabilities(responseHeaders, result)
      }

      // Calculate security score
      result.securityScore = this._calculateSecurityScore(result)

      page.removeListener('response', captureHeaders)

      return result
    } catch (error) {
      return result
    }
  }

  /**
   * Comprehensive security analysis
   *
   * @param {Object} page - Puppeteer page object
   * @param {string} baseUrl - Base URL
   * @param {string} html - HTML content (optional, for offline analysis)
   * @returns {Object} Security analysis results
   */
  async analyze(page, baseUrl, html = null) {
    const result = {
      securityHeaders: null,
      csp: null,
      cors: null,
      consoleLogs: null,
      tls: null,
      captcha: null,
      websockets: null,
      vulnerabilities: [],
      securityScore: 0
    }

    try {
      // Capture response headers from first request
      let responseHeaders = {}
      const captureHeaders = async (response) => {
        if (response.url() === baseUrl || response.url().startsWith(baseUrl)) {
          const headers = response.headers()
          responseHeaders = { ...headers }
        }
      }

      page.on('response', captureHeaders)

      // Capture console logs
      let consoleLogs = []
      if (this.config.captureConsoleLogs) {
        page.on('console', (msg) => {
          consoleLogs.push({
            type: msg.type(),
            text: msg.text(),
            location: msg.location(),
            args: msg.args().length
          })
        })
      }

      // Analyze security headers
      if (this.config.analyzeSecurityHeaders) {
        result.securityHeaders = this._analyzeSecurityHeaders(responseHeaders)
      }

      // Analyze CSP
      if (this.config.analyzeCSP) {
        result.csp = this._analyzeCSP(responseHeaders)
      }

      // Analyze CORS
      if (this.config.analyzeCORS) {
        result.cors = this._analyzeCORS(responseHeaders, baseUrl)
      }

      // Store console logs
      if (this.config.captureConsoleLogs && consoleLogs.length > 0) {
        result.consoleLogs = {
          total: consoleLogs.length,
          byType: this._groupByType(consoleLogs),
          logs: consoleLogs.slice(0, this.config.maxConsoleLogLines)
        }
      }

      // Analyze TLS/SSL
      if (this.config.analyzeTLS) {
        result.tls = this._analyzeTLS(baseUrl, responseHeaders)
      }

      // Capture WebSockets
      if (this.config.captureWebSockets) {
        result.websockets = await this._captureWebSockets(page)
      }

      // Detect CAPTCHA
      const pageContent = html || (await page.content())
      result.captcha = this._detectCaptcha(pageContent)

      // Check for vulnerabilities
      if (this.config.checkVulnerabilities) {
        result.vulnerabilities = this._checkVulnerabilities(responseHeaders, result)
      }

      // Calculate security score
      result.securityScore = this._calculateSecurityScore(result)

      page.removeListener('response', captureHeaders)

      return result
    } catch (error) {
      this.logger.error('[SecurityAnalyzer] Error during analysis:', error)
      return result
    }
  }

  /**
   * Analyze security headers
   * @private
   */
  _analyzeSecurityHeaders(headers) {
    const analysis = {
      present: [],
      missing: [],
      details: {}
    }

    const securityHeaders = {
      'x-frame-options': {
        name: 'X-Frame-Options',
        importance: 'critical',
        recommended: 'DENY or SAMEORIGIN',
        description: 'Prevents clickjacking attacks'
      },
      'x-content-type-options': {
        name: 'X-Content-Type-Options',
        importance: 'critical',
        recommended: 'nosniff',
        description: 'Prevents MIME sniffing attacks'
      },
      'strict-transport-security': {
        name: 'Strict-Transport-Security',
        importance: 'critical',
        recommended: 'max-age=31536000; includeSubDomains',
        description: 'Forces HTTPS connections'
      },
      'x-xss-protection': {
        name: 'X-XSS-Protection',
        importance: 'high',
        recommended: '1; mode=block',
        description: 'Protects against XSS attacks'
      },
      'referrer-policy': {
        name: 'Referrer-Policy',
        importance: 'medium',
        recommended: 'strict-no-referrer or no-referrer',
        description: 'Controls referrer information'
      },
      'permissions-policy': {
        name: 'Permissions-Policy',
        importance: 'medium',
        recommended: 'geolocation=(), microphone=(), camera=()',
        description: 'Controls browser feature access'
      }
    }

    for (const [headerKey, headerInfo] of Object.entries(securityHeaders)) {
      const value = headers[headerKey]

      if (value) {
        analysis.present.push(headerInfo.name)
        analysis.details[headerInfo.name.toLowerCase()] = {
          value,
          importance: headerInfo.importance,
          description: headerInfo.description
        }
      } else {
        analysis.missing.push({
          header: headerInfo.name,
          importance: headerInfo.importance,
          recommended: headerInfo.recommended,
          description: headerInfo.description
        })
      }
    }

    return analysis
  }

  /**
   * Analyze Content Security Policy
   * @private
   */
  _analyzeCSP(headers) {
    const analysis = {
      present: false,
      value: null,
      directives: {},
      issues: [],
      strength: 'none'
    }

    const cspHeader = headers['content-security-policy']
    if (!cspHeader) {
      analysis.issues.push('No Content Security Policy defined')
      return analysis
    }

    analysis.present = true
    analysis.value = cspHeader

    // Parse CSP directives
    const directives = cspHeader.split(';').map((d) => d.trim()).filter(Boolean)

    for (const directive of directives) {
      const [key, ...values] = directive.split(/\s+/)
      analysis.directives[key] = values.join(' ')
    }

    // Check for unsafe directives
    const unsafePatterns = ['unsafe-inline', 'unsafe-eval']
    for (const [key, value] of Object.entries(analysis.directives)) {
      for (const unsafe of unsafePatterns) {
        if (value.includes(unsafe)) {
          analysis.issues.push(`${key} contains ${unsafe} - reduces security`)
        }
      }
    }

    // Check for wildcard
    if (cspHeader.includes('*')) {
      analysis.issues.push('CSP contains wildcard (*) - may allow untrusted sources')
    }

    // Determine strength
    if (analysis.issues.length === 0) {
      analysis.strength = 'strong'
    } else if (analysis.issues.length <= 2) {
      analysis.strength = 'moderate'
    } else {
      analysis.strength = 'weak'
    }

    return analysis
  }

  /**
   * Analyze CORS headers
   * @private
   */
  _analyzeCORS(headers, baseUrl) {
    const analysis = {
      corsEnabled: false,
      allowOrigin: null,
      allowMethods: null,
      allowHeaders: null,
      exposeHeaders: null,
      maxAge: null,
      credentials: false,
      issues: []
    }

    const allowOrigin = headers['access-control-allow-origin']
    if (!allowOrigin) {
      analysis.issues.push('No CORS policy configured')
      return analysis
    }

    analysis.corsEnabled = true
    analysis.allowOrigin = allowOrigin
    analysis.allowMethods = headers['access-control-allow-methods']
    analysis.allowHeaders = headers['access-control-allow-headers']
    analysis.exposeHeaders = headers['access-control-expose-headers']
    analysis.credentials = headers['access-control-allow-credentials'] === 'true'
    analysis.maxAge = headers['access-control-max-age']

    // Security checks
    if (allowOrigin === '*') {
      analysis.issues.push('Allow-Origin is * - allows any origin (security risk)')
    }

    if (allowOrigin === '*' && analysis.credentials) {
      analysis.issues.push('Allow-Origin is * with credentials - invalid and insecure')
    }

    if (!analysis.allowMethods) {
      analysis.issues.push('No Access-Control-Allow-Methods specified')
    }

    if (analysis.allowMethods && analysis.allowMethods.includes('*')) {
      analysis.issues.push('Allow-Methods contains * - allows all HTTP methods')
    }

    return analysis
  }

  /**
   * Check for vulnerabilities
   * @private
   */
  _checkVulnerabilities(headers, analysis) {
    const vulnerabilities = []

    // Missing critical headers
    if (!headers['x-frame-options']) {
      vulnerabilities.push({
        type: 'clickjacking',
        severity: 'high',
        message: 'Missing X-Frame-Options header - vulnerable to clickjacking attacks',
        recommendation: 'Add X-Frame-Options: DENY or SAMEORIGIN'
      })
    }

    if (!headers['x-content-type-options']) {
      vulnerabilities.push({
        type: 'mime-sniffing',
        severity: 'high',
        message: 'Missing X-Content-Type-Options header - vulnerable to MIME sniffing',
        recommendation: 'Add X-Content-Type-Options: nosniff'
      })
    }

    if (!headers['strict-transport-security']) {
      vulnerabilities.push({
        type: 'ssl-downgrade',
        severity: 'high',
        message: 'Missing HSTS header - vulnerable to SSL/TLS downgrade attacks',
        recommendation: 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains'
      })
    }

    // CSP issues
    if (analysis.csp && analysis.csp.issues.length > 0) {
      vulnerabilities.push({
        type: 'csp-weak',
        severity: 'medium',
        message: `Weak Content Security Policy: ${analysis.csp.issues[0]}`,
        recommendation: 'Strengthen CSP with specific directives and remove unsafe-*'
      })
    }

    // CORS issues
    if (analysis.cors && analysis.cors.issues.length > 0) {
      vulnerabilities.push({
        type: 'cors-misconfiguration',
        severity: 'medium',
        message: `CORS misconfiguration: ${analysis.cors.issues[0]}`,
        recommendation: 'Restrict CORS to specific trusted origins'
      })
    }

    // Console errors
    if (analysis.consoleLogs) {
      const errors = analysis.consoleLogs.byType.error || []
      if (errors.length > 5) {
        vulnerabilities.push({
          type: 'console-errors',
          severity: 'low',
          message: `${errors.length} console errors detected - possible runtime issues`,
          recommendation: 'Review and fix console errors for better stability'
        })
      }
    }

    return vulnerabilities
  }

  /**
   * Analyze TLS/SSL configuration
   * @private
   */
  _analyzeTLS(baseUrl, headers) {
    const url = new URL(baseUrl)
    const isHTTPS = url.protocol === 'https:'

    return {
      isHTTPS,
      hasHSTS: !!headers['strict-transport-security'],
      hstsValue: headers['strict-transport-security'] || null,
      issues: !isHTTPS ? ['Site is not using HTTPS'] : []
    }
  }

  /**
   * Detect CAPTCHA implementations
   * @private
   */
  _detectCaptcha(html) {
    const analysis = {
      present: false,
      providers: [],
      details: []
    }

    if (!html) {
      return analysis
    }

    const htmlLower = html.toLowerCase()

    // Google reCAPTCHA detection
    if (htmlLower.includes('recaptcha') || htmlLower.includes('google.com/recaptcha')) {
      if (htmlLower.includes('recaptcha.net') || htmlLower.includes('recaptcha.net/')) {
        analysis.providers.push('reCAPTCHA v3')
        analysis.details.push({
          provider: 'Google',
          type: 'reCAPTCHA v3',
          version: 3,
          method: 'invisible',
          description: 'Google reCAPTCHA v3 - invisible verification'
        })
      } else if (htmlLower.includes('grecaptcha')) {
        analysis.providers.push('reCAPTCHA v2')
        analysis.details.push({
          provider: 'Google',
          type: 'reCAPTCHA v2',
          version: 2,
          method: 'checkbox',
          description: 'Google reCAPTCHA v2 - "I\'m not a robot" checkbox'
        })
      }
      analysis.present = true
    }

    // hCaptcha detection
    if (htmlLower.includes('hcaptcha') || htmlLower.includes('hcaptcha.com')) {
      analysis.providers.push('hCaptcha')
      analysis.details.push({
        provider: 'hCaptcha',
        type: 'hCaptcha',
        version: 1,
        method: 'interactive',
        description: 'hCaptcha - Privacy-focused CAPTCHA alternative'
      })
      analysis.present = true
    }

    // Cloudflare Turnstile detection
    if (htmlLower.includes('turnstile') || htmlLower.includes('challenges.cloudflare.com')) {
      analysis.providers.push('Cloudflare Turnstile')
      analysis.details.push({
        provider: 'Cloudflare',
        type: 'Turnstile',
        version: 1,
        method: 'interactive/invisible',
        description: 'Cloudflare Turnstile - CAPTCHA alternative'
      })
      analysis.present = true
    }

    // AWS WAF CAPTCHA detection
    if (htmlLower.includes('awswaf') || htmlLower.includes('akamai')) {
      analysis.providers.push('AWS WAF')
      analysis.details.push({
        provider: 'AWS',
        type: 'WAF CAPTCHA',
        version: 1,
        method: 'challenge',
        description: 'AWS WAF - Web Application Firewall CAPTCHA'
      })
      analysis.present = true
    }

    // Akamai Bot Manager detection
    if (htmlLower.includes('akam') || htmlLower.includes('akamai')) {
      if (!analysis.providers.includes('AWS WAF')) {
        analysis.providers.push('Akamai')
        analysis.details.push({
          provider: 'Akamai',
          type: 'Bot Manager',
          version: 1,
          method: 'behavioral',
          description: 'Akamai Bot Manager - Behavioral analysis'
        })
        analysis.present = true
      }
    }

    // Custom/generic CAPTCHA patterns
    const customPatterns = [
      { pattern: /data-sitekey|g-recaptcha-response|grecaptcha/i, name: 'Generic reCAPTCHA marker' },
      { pattern: /captcha|verification|challenge/i, name: 'Generic CAPTCHA indicator' },
      { pattern: /<iframe[^>]*captcha|<div[^>]*id="captcha"/i, name: 'Embedded CAPTCHA iframe' }
    ]

    for (const { pattern, name } of customPatterns) {
      if (pattern.test(html) && !analysis.present) {
        analysis.present = true
        // Only add if not already detected as a known provider
        if (!analysis.details.some((d) => d.description.toLowerCase().includes('captcha'))) {
          analysis.details.push({
            provider: 'Unknown',
            type: 'Generic CAPTCHA',
            version: null,
            method: 'unknown',
            description: name
          })
        }
      }
    }

    return analysis
  }

  /**
   * Group console logs by type
   * @private
   */
  _groupByType(logs) {
    const grouped = {}

    for (const log of logs) {
      if (!grouped[log.type]) {
        grouped[log.type] = []
      }
      grouped[log.type].push(log)
    }

    return grouped
  }

  /**
   * Capture WebSocket connections and messages
   * @private
   */
  async _captureWebSockets(page) {
    const websockets = []
    const wsMessages = new Map() // URL -> messages array

    try {
      // Intercept WebSocket connections via console messages
      // This detects WebSocket activity and allows us to track connections
      const wsDetectionCode = `
        (function() {
          const wsConnections = [];
          const originalWebSocket = window.WebSocket;

          window.WebSocket = class extends originalWebSocket {
            constructor(url, protocols) {
              super(url, protocols);
              const wsInfo = {
                url: url,
                protocols: Array.isArray(protocols) ? protocols : protocols ? [protocols] : [],
                messages: [],
                readyState: this.readyState,
                timestamp: Date.now()
              };
              wsConnections.push(wsInfo);

              // Capture sent messages
              const originalSend = this.send.bind(this);
              this.send = function(data) {
                wsInfo.messages.push({
                  type: 'sent',
                  data: typeof data === 'string' ? data : '[binary data]',
                  timestamp: Date.now()
                });
                return originalSend(data);
              };

              // Capture received messages
              this.addEventListener('message', (event) => {
                wsInfo.messages.push({
                  type: 'received',
                  data: typeof event.data === 'string' ? event.data : '[binary data]',
                  timestamp: Date.now()
                });
              });

              // Track state changes
              this.addEventListener('open', () => {
                wsInfo.readyState = 1;
              });
              this.addEventListener('close', () => {
                wsInfo.readyState = 3;
              });
            }
          };

          // Expose for collection
          window.__wsConnections = wsConnections;
        })();
      `;

      // Inject WebSocket tracking code
      await page.evaluateOnNewDocument(wsDetectionCode)

      // Wait a moment for page interactions
      await page.waitForTimeout(100)

      // Collect WebSocket information
      const wsData = await page.evaluate(() => {
        return window.__wsConnections || []
      }).catch(() => [])

      // Process and limit messages
      for (const wsInfo of wsData) {
        const limitedMessages = wsInfo.messages.slice(0, this.config.maxWebSocketMessages)
        websockets.push({
          url: wsInfo.url,
          protocols: wsInfo.protocols,
          messageCount: wsInfo.messages.length,
          readyState: wsInfo.readyState,
          messages: limitedMessages,
          timestamp: wsInfo.timestamp
        })
      }

      return websockets.length > 0 ? {
        present: true,
        count: websockets.length,
        connections: websockets
      } : null
    } catch (error) {
      this.logger.error('[SecurityAnalyzer] Error capturing WebSockets:', error)
      return null
    }
  }

  /**
   * Calculate overall security score (0-100)
   * @private
   */
  _calculateSecurityScore(analysis) {
    let score = 50 // Start at 50

    // Security headers (30 points max)
    if (analysis.securityHeaders) {
      const present = analysis.securityHeaders.present.length
      const total = present + analysis.securityHeaders.missing.length
      score += (present / total) * 30
    }

    // CSP (20 points)
    if (analysis.csp) {
      if (analysis.csp.strength === 'strong') {
        score += 20
      } else if (analysis.csp.strength === 'moderate') {
        score += 10
      }
    }

    // CORS (20 points)
    if (analysis.cors) {
      if (analysis.cors.corsEnabled && analysis.cors.issues.length === 0) {
        score += 20
      } else if (analysis.cors.corsEnabled && analysis.cors.issues.length <= 1) {
        score += 10
      }
    }

    // TLS (15 points)
    if (analysis.tls) {
      if (analysis.tls.isHTTPS && analysis.tls.hasHSTS) {
        score += 15
      } else if (analysis.tls.isHTTPS) {
        score += 10
      }
    }

    // Vulnerabilities (penalty)
    if (analysis.vulnerabilities && analysis.vulnerabilities.length > 0) {
      const highSeverity = analysis.vulnerabilities.filter((v) => v.severity === 'high').length
      const mediumSeverity = analysis.vulnerabilities.filter((v) => v.severity === 'medium').length

      score -= highSeverity * 10
      score -= mediumSeverity * 3
    }

    // Console errors (small penalty)
    if (analysis.consoleLogs && analysis.consoleLogs.byType.error) {
      const errorCount = analysis.consoleLogs.byType.error.length
      score -= Math.min(errorCount * 0.5, 5)
    }

    return Math.max(0, Math.min(100, score))
  }
}

export default SecurityAnalyzer
