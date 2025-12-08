/**
 * HybridFetcher - Smart routing between HTTP client and puppeteer
 *
 * Intelligently routes requests:
 * - Uses recker/fetch for static HTML pages (fast, low resources)
 * - Uses puppeteer for JavaScript-heavy SPAs (full rendering)
 * - Auto-detects which approach is needed
 *
 * @example
 * // Basic usage
 * const fetcher = new HybridFetcher();
 * const { html, source } = await fetcher.fetch('https://example.com');
 * console.log(`Fetched with ${source}`); // 'recker' or 'puppeteer'
 *
 * @example
 * // With shared context
 * const context = new CrawlContext({ userAgent: 'MyBot/1.0' });
 * const fetcher = new HybridFetcher({ context });
 *
 * // Login via HTTP (fast)
 * await fetcher.post('https://example.com/login', { body: credentials });
 *
 * // Fetch dashboard with puppeteer (cookies shared automatically)
 * const { html } = await fetcher.fetchWithPuppeteer('https://example.com/dashboard');
 *
 * @example
 * // Force specific strategy
 * const fetcher = new HybridFetcher({ strategy: 'puppeteer-only' });
 */

import { CrawlContext } from './crawl-context.js';
import { createHttpClient } from '#src/concerns/http-client.js';

export class HybridFetcher {
  /**
   * @param {Object} config - Fetcher configuration
   * @param {CrawlContext} [config.context] - Shared crawl context
   * @param {string} [config.strategy='auto'] - Strategy: 'auto', 'recker-only', 'puppeteer-only'
   * @param {number} [config.timeout=30000] - Request timeout in ms
   * @param {number} [config.navigationTimeout=30000] - Page navigation timeout in ms
   * @param {Object} [config.puppeteerOptions] - Additional puppeteer launch options
   * @param {Object} [config.httpClient] - Custom HTTP client (for testing)
   * @param {Array<RegExp>} [config.jsDetectionPatterns] - Custom patterns for JS detection
   */
  constructor(config = {}) {
    this.context = config.context || new CrawlContext(config);
    this.strategy = config.strategy || 'auto';
    this.timeout = config.timeout || 30000;
    this.navigationTimeout = config.navigationTimeout || 30000;
    this.puppeteerOptions = config.puppeteerOptions || {};
    this._customHttpClient = config.httpClient || null;

    this._httpClient = null;
    this._browser = null;
    this._puppeteer = null;

    this._jsPatterns = config.jsDetectionPatterns || [
      /<div\s+id=["']root["']\s*>\s*<\/div>/i,
      /<div\s+id=["']app["']\s*>\s*<\/div>/i,
      /<div\s+id=["']__next["']\s*>/i,
      /__NEXT_DATA__/,
      /__NUXT__/,
      /window\.__INITIAL_STATE__/,
      /window\.__PRELOADED_STATE__/,
      /ng-app|ng-controller|ng-view/,
      /\sv-cloak[\s>]|\sv-if=|\sv-for=/,
      /data-reactroot/,
      /data-react-helmet/,
      /<body[^>]*>\s*<noscript>/i,
      /<body[^>]*>\s*<div[^>]*>\s*<\/div>\s*<script/i
    ];

    this.stats = {
      reckerRequests: 0,
      puppeteerRequests: 0,
      fallbacks: 0,
      errors: 0
    };
  }

  /**
   * Get or create HTTP client
   * @param {string} [url] - URL for config
   * @returns {Promise<Object>}
   * @private
   */
  async _getHttpClient(url) {
    if (this._customHttpClient) {
      return this._customHttpClient;
    }

    if (!this._httpClient) {
      const config = this.context.getHttpClientConfig(url || 'https://example.com');
      config.timeout = this.timeout;
      this._httpClient = await createHttpClient(config);
    }
    return this._httpClient;
  }

  /**
   * Get or create puppeteer browser
   * @returns {Promise<Object>}
   * @private
   */
  async _getBrowser() {
    if (!this._browser) {
      if (!this._puppeteer) {
        try {
          this._puppeteer = await import('puppeteer');
        } catch (e) {
          try {
            this._puppeteer = await import('puppeteer-core');
          } catch (e2) {
            throw new Error('Neither puppeteer nor puppeteer-core is installed. Install one to use browser features.');
          }
        }
      }

      const config = {
        ...this.context.getLaunchConfig(),
        ...this.puppeteerOptions
      };

      this._browser = await this._puppeteer.default.launch(config);
    }
    return this._browser;
  }

  /**
   * Check if HTML appears to need JavaScript rendering
   * @param {string} html - HTML content
   * @returns {boolean}
   * @private
   */
  _needsJavaScript(html) {
    if (!html || typeof html !== 'string' || html.trim() === '') return true;

    for (const pattern of this._jsPatterns) {
      if (pattern.test(html)) {
        return true;
      }
    }

    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      const bodyContent = bodyMatch[1].replace(/<script[\s\S]*?<\/script>/gi, '').trim();
      const textContent = bodyContent.replace(/<[^>]+>/g, '').trim();

      if (textContent.length < 100 && html.includes('<script')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Fetch URL using HTTP client (recker/fetch)
   * @param {string} url - URL to fetch
   * @param {Object} [options] - Fetch options
   * @returns {Promise<Object>} { html, response, source: 'recker' }
   */
  async fetchWithRecker(url, options = {}) {
    const client = await this._getHttpClient(url);

    const headers = {
      ...this.context._headers,
      'User-Agent': this.context.userAgent,
      ...options.headers
    };

    const cookieHeader = this.context.getCookieHeader(url);
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    if (this.context._referer) {
      headers['Referer'] = this.context._referer;
    }

    let response;
    const method = (options.method || 'GET').toLowerCase();

    if (method === 'get') {
      response = await client.get(url, { headers });
    } else if (method === 'post') {
      response = await client.post(url, { headers, body: options.body });
    } else {
      response = await client.request(url, { ...options, headers });
    }

    this.context.processResponse(response, url);
    this.stats.reckerRequests++;

    const html = await response.text();

    return {
      html,
      response,
      url,
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      source: 'recker',
      method: 'http'
    };
  }

  /**
   * Fetch URL using puppeteer
   * @param {string} url - URL to fetch
   * @param {Object} [options] - Fetch options
   * @returns {Promise<Object>} { html, page, source: 'puppeteer' }
   */
  async fetchWithPuppeteer(url, options = {}) {
    const browser = await this._getBrowser();
    const page = await browser.newPage();

    try {
      await this.context.configurePage(page);

      const waitUntil = options.waitUntil || 'networkidle2';
      const timeout = options.timeout || this.timeout;

      const response = await page.goto(url, { waitUntil, timeout });

      await this.context.importFromPuppeteer(page);
      this.context.setReferer(url);
      this.stats.puppeteerRequests++;

      const html = await page.content();

      if (options.keepPage) {
        return {
          html,
          page,
          response,
          status: response?.status(),
          source: 'puppeteer'
        };
      }

      await page.close();

      return {
        html,
        response,
        status: response?.status(),
        source: 'puppeteer'
      };

    } catch (error) {
      await page.close().catch(() => {});
      throw error;
    }
  }

  /**
   * Smart fetch - auto-selects recker or puppeteer
   * @param {string} url - URL to fetch
   * @param {Object} [options] - Fetch options
   * @returns {Promise<Object>} { html, source: 'recker' | 'puppeteer' }
   */
  async fetch(url, options = {}) {
    try {
      if (this.strategy === 'puppeteer-only') {
        return await this.fetchWithPuppeteer(url, options);
      }

      if (this.strategy === 'recker-only') {
        return await this.fetchWithRecker(url, options);
      }

      const result = await this.fetchWithRecker(url, options);

      if (this._needsJavaScript(result.html)) {
        this.stats.fallbacks++;
        try {
          return await this.fetchWithPuppeteer(url, options);
        } catch (e) {
          console.warn(`Puppeteer fallback failed for ${url}: ${e.message}`);
          return result;
        }
      }

      return result;

    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * POST request via HTTP client
   * @param {string} url - URL
   * @param {Object} [options] - Request options
   * @returns {Promise<Object>}
   */
  async post(url, options = {}) {
    return this.fetchWithRecker(url, { ...options, method: 'POST' });
  }

  /**
   * HEAD request via HTTP client
   * @param {string} url - URL
   * @param {Object} [options] - Request options
   * @returns {Promise<Object>}
   */
  async head(url, options = {}) {
    const client = await this._getHttpClient(url);

    const headers = {
      'User-Agent': this.context.userAgent,
      ...options.headers
    };

    const response = await client.request(url, { method: 'HEAD', headers });

    return {
      status: response.status,
      headers: response.headers,
      ok: response.ok
    };
  }

  /**
   * Check if URL needs puppeteer (pre-flight check)
   * @param {string} url - URL to check
   * @returns {Promise<boolean>}
   */
  async needsPuppeteer(url) {
    try {
      const result = await this.fetchWithRecker(url);
      return this._needsJavaScript(result.html);
    } catch {
      return true;
    }
  }

  /**
   * Get fetcher statistics
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      browserActive: !!this._browser,
      httpClientActive: !!this._httpClient
    };
  }

  /**
   * Close browser and cleanup resources
   */
  async close() {
    if (this._browser) {
      await this._browser.close();
      this._browser = null;
    }
    this._httpClient = null;
  }

  /**
   * Check if puppeteer is available
   * @returns {Promise<boolean>}
   */
  async isPuppeteerAvailable() {
    try {
      await import('puppeteer');
      return true;
    } catch {
      try {
        await import('puppeteer-core');
        return true;
      } catch {
        return false;
      }
    }
  }
}

export default HybridFetcher;
