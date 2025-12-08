/**
 * CrawlContext - Shared session state between HTTP client and puppeteer
 *
 * Maintains consistent session across recker (HTTP) and puppeteer (browser):
 * - Cookie synchronization (bidirectional)
 * - Unified User-Agent, headers, proxy settings
 * - Viewport, timezone, locale consistency
 * - Session serialization for persistence
 *
 * @example
 * // Basic usage
 * const context = new CrawlContext({
 *   userAgent: 'MyBot/1.0',
 *   proxy: 'http://proxy:8080'
 * });
 *
 * // Get config for HTTP client
 * const httpConfig = context.getHttpClientConfig('https://example.com');
 *
 * // Configure puppeteer page
 * await context.configurePage(page);
 *
 * // Sync cookies from response
 * context.processResponse(response, url);
 *
 * // Persist session
 * const json = context.toJSON();
 * const restored = CrawlContext.fromJSON(json);
 */
export class CrawlContext {
  /**
   * @param {Object} config - Context configuration
   * @param {string} [config.userAgent] - User-Agent string
   * @param {string} [config.acceptLanguage='en-US,en;q=0.9'] - Accept-Language header
   * @param {string} [config.platform='Windows'] - Navigator platform
   * @param {Object} [config.headers] - Additional headers
   * @param {string} [config.proxy] - Proxy URL
   * @param {Object} [config.viewport] - Viewport dimensions {width, height}
   * @param {Object} [config.screen] - Screen dimensions {width, height}
   * @param {string} [config.timezone='America/New_York'] - Timezone for emulation
   * @param {string} [config.locale='en-US'] - Locale for browser
   */
  constructor(config = {}) {
    this._userAgent = config.userAgent || this._generateUserAgent();
    this._acceptLanguage = config.acceptLanguage || 'en-US,en;q=0.9';
    this._platform = config.platform || 'Windows';

    this._cookies = new Map();

    this._headers = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': this._acceptLanguage,
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      ...config.headers
    };

    this._proxy = config.proxy || null;

    this._viewport = config.viewport || { width: 1920, height: 1080 };
    this._screen = config.screen || { width: 1920, height: 1080 };

    this._timezone = config.timezone || 'America/New_York';
    this._locale = config.locale || 'en-US';

    this._lastUrl = null;
    this._referer = null;
  }

  /**
   * Get User-Agent string
   * @returns {string}
   */
  get userAgent() {
    return this._userAgent;
  }

  /**
   * Set User-Agent string
   * @param {string} ua
   */
  set userAgent(ua) {
    this._userAgent = ua;
  }

  /**
   * Get viewport dimensions
   * @returns {Object}
   */
  get viewport() {
    return this._viewport;
  }

  /**
   * Get timezone
   * @returns {string}
   */
  get timezone() {
    return this._timezone;
  }

  /**
   * Add cookies to the context
   * @param {Array<Object>} cookies - Array of cookie objects
   * @param {string} [source='manual'] - Source identifier ('recker', 'puppeteer', 'manual')
   */
  setCookies(cookies, source = 'manual') {
    for (const cookie of cookies) {
      const domain = cookie.domain || this._extractDomain(cookie.url);
      if (!domain) continue;

      const normalizedDomain = domain.replace(/^\./, '');

      if (!this._cookies.has(normalizedDomain)) {
        this._cookies.set(normalizedDomain, []);
      }

      const existing = this._cookies.get(normalizedDomain);
      const idx = existing.findIndex(c => c.name === cookie.name && c.path === (cookie.path || '/'));

      const cookieData = {
        name: cookie.name,
        value: cookie.value,
        domain: normalizedDomain,
        path: cookie.path || '/',
        expires: cookie.expires,
        secure: cookie.secure || false,
        httpOnly: cookie.httpOnly || false,
        sameSite: cookie.sameSite || 'Lax',
        _source: source,
        _updatedAt: Date.now()
      };

      if (idx >= 0) {
        existing[idx] = cookieData;
      } else {
        existing.push(cookieData);
      }
    }
  }

  /**
   * Parse and add cookies from Set-Cookie header(s)
   * @param {string|Array<string>} setCookieHeader - Set-Cookie header value(s)
   * @param {string} url - URL the cookies came from
   */
  setCookiesFromHeader(setCookieHeader, url) {
    if (!setCookieHeader) return;

    const headers = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader];

    const cookies = headers.map(h => this._parseSetCookie(h, url)).filter(Boolean);
    this.setCookies(cookies, 'recker');
  }

  /**
   * Get Cookie header value for a URL
   * @param {string} url - Target URL
   * @returns {string} Cookie header value or empty string if no cookies
   */
  getCookieHeader(url) {
    const cookies = this._getMatchingCookies(url);

    if (cookies.length === 0) return '';

    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  /**
   * Get cookies in puppeteer format
   * @param {string} url - Target URL
   * @returns {Array<Object>} Cookies formatted for puppeteer
   */
  getCookiesForPuppeteer(url) {
    const urlObj = new URL(url);

    return this._getMatchingCookies(url).map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain.startsWith('.') ? c.domain : '.' + c.domain,
      path: c.path || '/',
      expires: c.expires ? Math.floor(c.expires / 1000) : -1,
      httpOnly: c.httpOnly || false,
      secure: c.secure || false,
      sameSite: this._normalizeSameSite(c.sameSite),
      url: `${urlObj.protocol}//${c.domain}${c.path || '/'}`
    }));
  }

  /**
   * Get all cookies (for debugging/export)
   * @returns {Array<Object>}
   */
  getAllCookies() {
    const result = [];
    for (const [domain, cookies] of this._cookies) {
      result.push(...cookies);
    }
    return result;
  }

  /**
   * Get cookies for a specific domain
   * @param {string} domain - Domain to get cookies for
   * @returns {Array<Object>}
   */
  getCookiesForDomain(domain) {
    const normalizedDomain = domain.replace(/^\./, '');
    const result = [];

    for (const [cookieDomain, cookies] of this._cookies) {
      if (this._domainMatches(normalizedDomain, cookieDomain) ||
          this._domainMatches(cookieDomain, normalizedDomain)) {
        for (const cookie of cookies) {
          result.push({ ...cookie, source: cookie._source });
        }
      }
    }

    return result;
  }

  /**
   * Clear cookies - all or for a specific domain
   * @param {string} [domain] - Optional domain to clear
   */
  clearCookies(domain) {
    if (domain) {
      const normalizedDomain = domain.replace(/^\./, '');
      this._cookies.delete(normalizedDomain);
    } else {
      this._cookies.clear();
    }
  }

  /**
   * Import cookies from puppeteer page or array
   * @param {Object|Array} pageOrCookies - Puppeteer page object or array of cookies
   */
  async importFromPuppeteer(pageOrCookies) {
    let cookies;

    if (Array.isArray(pageOrCookies)) {
      cookies = pageOrCookies.map(c => ({
        ...c,
        expires: c.expires > 0 ? c.expires * 1000 : undefined
      }));
    } else {
      const rawCookies = await pageOrCookies.cookies();
      cookies = rawCookies.map(c => ({
        ...c,
        expires: c.expires > 0 ? c.expires * 1000 : undefined
      }));
    }

    this.setCookies(cookies, 'puppeteer');
  }

  /**
   * Export cookies to puppeteer page
   * @param {Object} page - Puppeteer page object
   * @param {string} [url] - Optional URL to get cookies for
   */
  async exportToPuppeteer(page, url) {
    const targetUrl = url || page.url();
    if (!targetUrl || targetUrl === 'about:blank') return;

    const cookies = this.getCookiesForPuppeteer(targetUrl);
    if (cookies.length > 0) {
      await page.setCookie(...cookies);
    }
  }

  /**
   * Get configuration for createHttpClient
   * @param {string} url - Target URL
   * @returns {Object} HTTP client configuration
   */
  getHttpClientConfig(url) {
    const config = {
      headers: {
        ...this._headers,
        'User-Agent': this._userAgent
      },
      timeout: 30000,
      retry: {
        maxAttempts: 3,
        delay: 1000,
        backoff: 'exponential',
        jitter: true,
        retryAfter: true,
        retryOn: [429, 500, 502, 503, 504]
      }
    };

    const cookieHeader = this.getCookieHeader(url);
    if (cookieHeader) {
      config.headers['Cookie'] = cookieHeader;
    }

    if (this._referer) {
      config.headers['Referer'] = this._referer;
    }

    if (this._proxy) {
      config.proxy = this._proxy;
    }

    return config;
  }

  /**
   * Get configuration for puppeteer.launch()
   * @returns {Object} Puppeteer launch options
   */
  getLaunchConfig() {
    const args = [
      `--window-size=${this._viewport.width},${this._viewport.height}`,
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-infobars',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ];

    if (this._proxy) {
      args.push(`--proxy-server=${this._proxy}`);
    }

    return {
      headless: 'new',
      args,
      defaultViewport: this._viewport,
      ignoreDefaultArgs: ['--enable-automation']
    };
  }

  /**
   * Configure a puppeteer page with context settings
   * @param {Object} page - Puppeteer page object
   * @returns {Object} The configured page
   */
  async configurePage(page) {
    await page.setUserAgent(this._userAgent);

    await page.setViewport(this._viewport);

    try {
      await page.emulateTimezone(this._timezone);
    } catch (e) {
      // Timezone emulation may not be available in all puppeteer versions
    }

    await page.setExtraHTTPHeaders({
      'Accept-Language': this._acceptLanguage
    });

    await page.evaluateOnNewDocument((config) => {
      Object.defineProperty(navigator, 'platform', { get: () => config.platform });
      Object.defineProperty(navigator, 'language', { get: () => config.locale });
      Object.defineProperty(navigator, 'languages', { get: () => [config.locale, 'en'] });

      Object.defineProperty(screen, 'width', { get: () => config.screen.width });
      Object.defineProperty(screen, 'height', { get: () => config.screen.height });
      Object.defineProperty(screen, 'availWidth', { get: () => config.screen.width });
      Object.defineProperty(screen, 'availHeight', { get: () => config.screen.height - 40 });

      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      window.chrome = { runtime: {} };

      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters)
      );
    }, {
      platform: this._platform,
      locale: this._locale,
      screen: this._screen
    });

    const currentUrl = page.url();
    if (currentUrl && currentUrl !== 'about:blank') {
      await this.exportToPuppeteer(page, currentUrl);
    }

    page.on('response', async (response) => {
      try {
        const headers = response.headers();
        const setCookie = headers['set-cookie'];
        if (setCookie) {
          this.setCookiesFromHeader(setCookie, response.url());
        }
      } catch (e) {
        // Ignore errors from detached frames
      }
    });

    return page;
  }

  /**
   * Process HTTP response and extract cookies
   * @param {Object} response - Fetch response object
   * @param {string} url - Request URL
   */
  processResponse(response, url) {
    if (!response || !response.headers) return;

    let setCookies = null;

    if (typeof response.headers.getSetCookie === 'function') {
      setCookies = response.headers.getSetCookie();
    } else if (typeof response.headers.get === 'function') {
      setCookies = response.headers.get('set-cookie');
    } else {
      setCookies = response.headers['set-cookie'];
    }

    if (setCookies) {
      this.setCookiesFromHeader(setCookies, url);
    }

    this._lastUrl = url;
    this._referer = url;
  }

  /**
   * Update referer for next request
   * @param {string} url
   */
  setReferer(url) {
    this._referer = url;
  }

  /**
   * Serialize context to JSON
   * @returns {Object}
   */
  toJSON() {
    const cookies = this.getAllCookies();

    return {
      userAgent: this._userAgent,
      acceptLanguage: this._acceptLanguage,
      platform: this._platform,
      cookies,
      headers: this._headers,
      proxy: this._proxy,
      viewport: this._viewport,
      screen: this._screen,
      timezone: this._timezone,
      locale: this._locale,
      lastUrl: this._lastUrl,
      referer: this._referer
    };
  }

  /**
   * Create context from JSON
   * @param {Object} json - Serialized context
   * @returns {CrawlContext}
   */
  static fromJSON(json) {
    if (!json) json = {};

    const ctx = new CrawlContext({
      userAgent: json.userAgent,
      acceptLanguage: json.acceptLanguage,
      platform: json.platform,
      headers: json.headers,
      proxy: json.proxy,
      viewport: json.viewport,
      screen: json.screen,
      timezone: json.timezone,
      locale: json.locale
    });

    if (json.cookies) {
      if (Array.isArray(json.cookies)) {
        ctx.setCookies(json.cookies, 'restored');
      } else {
        ctx._cookies = new Map(Object.entries(json.cookies));
      }
    }

    ctx._lastUrl = json.lastUrl;
    ctx._referer = json.referer;

    return ctx;
  }

  /**
   * Generate a realistic User-Agent string
   * @returns {string}
   * @private
   */
  _generateUserAgent() {
    const chromeVersion = '120.0.6099.109';
    const platforms = {
      'Windows': 'Windows NT 10.0; Win64; x64',
      'Mac': 'Macintosh; Intel Mac OS X 10_15_7',
      'Linux': 'X11; Linux x86_64'
    };

    const platform = platforms[this._platform] || platforms['Windows'];

    return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  }

  /**
   * Extract domain from URL
   * @param {string} url
   * @returns {string|null}
   * @private
   */
  _extractDomain(url) {
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  /**
   * Parse Set-Cookie header string
   * @param {string} header - Set-Cookie header value
   * @param {string} url - URL the cookie came from
   * @returns {Object|null} Parsed cookie or null
   * @private
   */
  _parseSetCookie(header, url) {
    if (!header || typeof header !== 'string') return null;

    const parts = header.split(';').map(p => p.trim());
    if (parts.length === 0) return null;

    const [nameValue, ...attrs] = parts;
    const eqIndex = nameValue.indexOf('=');
    if (eqIndex === -1) return null;

    const name = nameValue.slice(0, eqIndex).trim();
    const value = nameValue.slice(eqIndex + 1).trim();

    if (!name) return null;

    const cookie = {
      name,
      value,
      domain: this._extractDomain(url),
      path: '/',
      secure: false,
      httpOnly: false,
      sameSite: 'Lax'
    };

    for (const attr of attrs) {
      const attrLower = attr.toLowerCase();
      const eqIdx = attr.indexOf('=');

      if (eqIdx === -1) {
        if (attrLower === 'secure') cookie.secure = true;
        else if (attrLower === 'httponly') cookie.httpOnly = true;
      } else {
        const key = attr.slice(0, eqIdx).trim().toLowerCase();
        const val = attr.slice(eqIdx + 1).trim();

        switch (key) {
          case 'domain':
            cookie.domain = val.replace(/^\./, '');
            break;
          case 'path':
            cookie.path = val || '/';
            break;
          case 'expires':
            try {
              cookie.expires = new Date(val).getTime();
            } catch {}
            break;
          case 'max-age':
            const maxAge = parseInt(val, 10);
            if (!isNaN(maxAge)) {
              cookie.expires = Date.now() + maxAge * 1000;
            }
            break;
          case 'samesite':
            cookie.sameSite = val;
            break;
        }
      }
    }

    return cookie;
  }

  /**
   * Get cookies matching a URL
   * @param {string} url
   * @returns {Array<Object>}
   * @private
   */
  _getMatchingCookies(url) {
    if (!url) return [];

    let urlObj;
    try {
      urlObj = new URL(url);
    } catch {
      return [];
    }

    const domain = urlObj.hostname;
    const path = urlObj.pathname;
    const isSecure = urlObj.protocol === 'https:';
    const now = Date.now();

    const result = [];

    for (const [cookieDomain, cookies] of this._cookies) {
      if (!this._domainMatches(domain, cookieDomain)) continue;

      for (const cookie of cookies) {
        if (cookie.expires && cookie.expires < now) continue;

        if (cookie.secure && !isSecure) continue;

        if (!path.startsWith(cookie.path)) continue;

        result.push(cookie);
      }
    }

    return result;
  }

  /**
   * Check if domain matches cookie domain
   * @param {string} requestDomain
   * @param {string} cookieDomain
   * @returns {boolean}
   * @private
   */
  _domainMatches(requestDomain, cookieDomain) {
    if (requestDomain === cookieDomain) return true;

    if (requestDomain.endsWith('.' + cookieDomain)) return true;

    return false;
  }

  /**
   * Normalize SameSite value for puppeteer
   * @param {string} value
   * @returns {string}
   * @private
   */
  _normalizeSameSite(value) {
    if (!value) return 'Lax';

    const normalized = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

    if (['Strict', 'Lax', 'None'].includes(normalized)) {
      return normalized;
    }

    return 'Lax';
  }
}

export default CrawlContext;
