/**
 * CookieManager - Manages cookie farming, rotation, and reputation tracking
 *
 * Strategies:
 * 1. Warmup Sessions - Visit trusted sites to build cookie reputation
 * 2. Reputation Tracking - Monitor success rates and retire bad cookies
 * 3. Age-Based Rotation - Older cookies are more trustworthy
 */
import { CookieManagerError } from '../puppeteer.errors.js';

export class CookieManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.config = plugin.config.cookies;
    this.storage = null;
    this.cookiePool = new Map(); // sessionId -> cookie data
  }

  /**
   * Initialize cookie manager
   */
  async initialize() {
    this.storage = await this.plugin.database.getResource(this.config.storage.resource);

    // Load existing cookies into pool if enabled
    if (this.config.farming.enabled) {
      await this._loadCookiePool();
    }
  }

  /**
   * Load cookie pool from storage
   * @private
   */
  async _loadCookiePool() {
    const limit = this.config.farming.rotation.poolSize;
    const cookies = await this.storage.list({ limit });

    for (const cookie of cookies) {
      this.cookiePool.set(cookie.sessionId, cookie);
    }

    this.plugin.emit('cookieManager.poolLoaded', {
      size: this.cookiePool.size
    });
  }

  /**
   * Load cookies into page
   * @param {Page} page - Puppeteer page
   * @param {string} sessionId - Session identifier
   */
  async loadSession(page, sessionId) {
    // Try to get from pool first
    let session = this.cookiePool.get(sessionId);

    // If not in pool, try to get from storage
    if (!session) {
      try {
        session = await this.storage.get(sessionId);
        this.cookiePool.set(sessionId, session);
      } catch (err) {
        // Session doesn't exist yet
        return;
      }
    }

    // Set cookies
    if (session.cookies && session.cookies.length > 0) {
      await page.setCookie(...session.cookies);
    }

    // Set user agent if available
    if (session.userAgent) {
      await page.setUserAgent(session.userAgent);
    }

    // Set viewport if available
    if (session.viewport) {
      await page.setViewport(session.viewport);
    }

    // Update last used timestamp
    session.metadata.lastUsed = Date.now();
    session.metadata.requestCount = (session.metadata.requestCount || 0) + 1;

    this.plugin.emit('cookieManager.sessionLoaded', {
      sessionId,
      cookieCount: session.cookies.length
    });
  }

  /**
   * Save cookies from page
   * @param {Page} page - Puppeteer page
   * @param {string} sessionId - Session identifier
   * @param {Object} options - Save options
   */
  async saveSession(page, sessionId, options = {}) {
    const { success = true } = options;

    // Get cookies from page
    const cookies = await page.cookies();

    // Get existing session or create new
    let session = this.cookiePool.get(sessionId) || {
      sessionId,
      cookies: [],
      userAgent: page._userAgent,
      viewport: page._viewport,
      proxyId: page._proxyId || null, // IMMUTABLE: Proxy binding
      domain: this._extractMainDomain(cookies),
      date: new Date().toISOString().split('T')[0],  // YYYY-MM-DD
      reputation: {
        successCount: 0,
        failCount: 0,
        successRate: 1.0,
        lastUsed: Date.now()
      },
      metadata: {
        createdAt: Date.now(),
        expiresAt: Date.now() + this.config.farming.rotation.maxAge,
        requestCount: 0,
        age: 0
      }
    };

    // Update cookies
    session.cookies = cookies;

    // Update domain (in case it changed)
    session.domain = this._extractMainDomain(cookies);
    session.date = new Date().toISOString().split('T')[0];

    // Update reputation
    if (this.config.farming.reputation.enabled && this.config.farming.reputation.trackSuccess) {
      if (success) {
        session.reputation.successCount++;
      } else {
        session.reputation.failCount++;
      }

      const total = session.reputation.successCount + session.reputation.failCount;
      session.reputation.successRate = session.reputation.successCount / total;
    }

    // Update age
    session.metadata.age = Date.now() - session.metadata.createdAt;

    // Save to storage if auto-save enabled
    if (this.config.storage.autoSave) {
      try {
        const existing = await this.storage.get(sessionId);
        await this.storage.update(sessionId, session);
      } catch (err) {
        await this.storage.insert(session);
      }
    }

    // Update pool
    this.cookiePool.set(sessionId, session);

    this.plugin.emit('cookieManager.sessionSaved', {
      sessionId,
      cookieCount: cookies.length,
      reputation: session.reputation
    });
  }

  /**
   * Farm cookies for a session
   * @param {string} sessionId - Session identifier
   * @returns {Promise<void>}
   */
  async farmCookies(sessionId) {
    if (!this.config.farming.enabled || !this.config.farming.warmup.enabled) {
      throw new CookieManagerError('Cookie farming is not enabled', {
        operation: 'farmCookies',
        retriable: false,
        suggestion: 'Enable config.farming.enabled and config.farming.warmup.enabled to farm cookies.'
      });
    }

    const warmupConfig = this.config.farming.warmup;
    const pages = [...warmupConfig.pages];

    // Randomize order if enabled
    if (warmupConfig.randomOrder) {
      pages.sort(() => Math.random() - 0.5);
    }

    this.plugin.emit('cookieManager.farmingStarted', {
      sessionId,
      pages: pages.length
    });

    // Visit each warmup page
    for (const url of pages) {
      try {
        const page = await this.plugin.navigate(url, { useSession: sessionId });

        // Wait random time on page
        const timeOnPage = warmupConfig.timePerPage.min +
          Math.random() * (warmupConfig.timePerPage.max - warmupConfig.timePerPage.min);

        // Perform interactions if enabled
        if (warmupConfig.interactions.scroll) {
          await this._randomScroll(page);
        }

        if (warmupConfig.interactions.hover) {
          await this._randomHover(page);
        }

        if (warmupConfig.interactions.click) {
          await this._randomClick(page);
        }

        // Wait remaining time
        await this._delay(timeOnPage);

        // Save cookies with success=true
        await this.saveSession(page, sessionId, { success: true });

        // Close page
        await page.close();

        this.plugin.emit('cookieManager.warmupPageCompleted', {
          sessionId,
          url
        });
      } catch (err) {
        this.plugin.emit('cookieManager.warmupPageFailed', {
          sessionId,
          url,
          error: err.message
        });
      }
    }

    this.plugin.emit('cookieManager.farmingCompleted', { sessionId });
  }

  /**
   * Get best cookie from pool based on reputation
   * @param {Object} options - Selection options
   * @returns {Promise<Object>}
   */
  async getBestCookie(options = {}) {
    if (!this.config.farming.enabled || !this.config.farming.reputation.enabled) {
      throw new CookieManagerError('Cookie farming reputation must be enabled to select best cookies', {
        operation: 'getBestCookie',
        retriable: false,
        suggestion: 'Enable config.farming.reputation.enabled before calling getBestCookie().' 
      });
    }

    const candidates = Array.from(this.cookiePool.values())
      .filter(session => {
        // Filter out retired cookies
        if (session.reputation.successRate < this.config.farming.reputation.retireThreshold) {
          return false;
        }

        // Filter out expired cookies
        if (Date.now() > session.metadata.expiresAt) {
          return false;
        }

        // Filter out overused cookies
        if (session.metadata.requestCount >= this.config.farming.rotation.requestsPerCookie) {
          return false;
        }

        return true;
      });

    if (candidates.length === 0) {
      return null;
    }

    // Score cookies based on reputation and age
    const scored = candidates.map(session => {
      let score = session.reputation.successRate;

      // Age boost - older cookies are more trustworthy
      if (this.config.farming.reputation.ageBoost) {
        const ageInHours = session.metadata.age / (1000 * 60 * 60);
        const ageBoost = Math.min(ageInHours / 24, 1) * 0.2; // Up to 20% boost
        score += ageBoost;
      }

      return { session, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored[0].session;
  }

  /**
   * Rotate cookies - remove expired/overused cookies
   * @returns {Promise<number>}
   */
  async rotateCookies() {
    if (!this.config.farming.enabled || !this.config.farming.rotation.enabled) {
      return 0;
    }

    let removed = 0;
    const now = Date.now();

    for (const [sessionId, session] of this.cookiePool.entries()) {
      let shouldRemove = false;

      // Check expiration
      if (now > session.metadata.expiresAt) {
        shouldRemove = true;
      }

      // Check request count
      if (session.metadata.requestCount >= this.config.farming.rotation.requestsPerCookie) {
        shouldRemove = true;
      }

      // Check reputation
      if (this.config.farming.reputation.enabled &&
          session.reputation.successRate < this.config.farming.reputation.retireThreshold) {
        shouldRemove = true;
      }

      if (shouldRemove) {
        this.cookiePool.delete(sessionId);

        // Remove from storage
        try {
          await this.storage.remove(sessionId);
        } catch (err) {
          // Ignore errors
        }

        removed++;
      }
    }

    if (removed > 0) {
      this.plugin.emit('cookieManager.cookiesRotated', { removed });
    }

    return removed;
  }

  /**
   * Get cookie pool statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const sessions = Array.from(this.cookiePool.values());

    const stats = {
      total: sessions.length,
      healthy: 0,
      expired: 0,
      overused: 0,
      lowReputation: 0,
      averageAge: 0,
      averageSuccessRate: 0,
      averageRequestCount: 0
    };

    if (sessions.length === 0) {
      return stats;
    }

    const now = Date.now();
    let totalAge = 0;
    let totalSuccessRate = 0;
    let totalRequestCount = 0;

    for (const session of sessions) {
      // Count expired
      if (now > session.metadata.expiresAt) {
        stats.expired++;
        continue;
      }

      // Count overused
      if (session.metadata.requestCount >= this.config.farming.rotation.requestsPerCookie) {
        stats.overused++;
        continue;
      }

      // Count low reputation
      if (session.reputation.successRate < this.config.farming.reputation.retireThreshold) {
        stats.lowReputation++;
        continue;
      }

      // Count healthy
      stats.healthy++;

      // Accumulate metrics
      totalAge += session.metadata.age;
      totalSuccessRate += session.reputation.successRate;
      totalRequestCount += session.metadata.requestCount;
    }

    // Calculate averages
    stats.averageAge = totalAge / stats.healthy || 0;
    stats.averageSuccessRate = totalSuccessRate / stats.healthy || 0;
    stats.averageRequestCount = totalRequestCount / stats.healthy || 0;

    return stats;
  }

  /**
   * Random scroll helper
   * @private
   */
  async _randomScroll(page) {
    const scrollDistance = Math.floor(Math.random() * 500) + 200;
    await page.evaluate((distance) => {
      window.scrollBy(0, distance);
    }, scrollDistance);
  }

  /**
   * Random hover helper
   * @private
   */
  async _randomHover(page) {
    try {
      const elements = await page.$$('a, button');
      if (elements.length > 0) {
        const randomElement = elements[Math.floor(Math.random() * elements.length)];
        await randomElement.hover();
      }
    } catch (err) {
      // Ignore errors
    }
  }

  /**
   * Random click helper
   * @private
   */
  async _randomClick(page) {
    try {
      // Find clickable elements that won't navigate away
      const elements = await page.$$('button:not([type="submit"]), div[role="button"]');
      if (elements.length > 0) {
        const randomElement = elements[Math.floor(Math.random() * elements.length)];
        await randomElement.click();
      }
    } catch (err) {
      // Ignore errors
    }
  }

  /**
   * Extract main domain from cookies
   * @private
   */
  _extractMainDomain(cookies) {
    if (!cookies || cookies.length === 0) {
      return 'unknown';
    }

    // Get most common domain from cookies
    const domains = {};
    cookies.forEach(cookie => {
      const domain = cookie.domain || 'unknown';
      domains[domain] = (domains[domain] || 0) + 1;
    });

    // Return domain with most cookies
    return Object.entries(domains)
      .sort((a, b) => b[1] - a[1])[0][0]
      .replace(/^\./, '');  // Remove leading dot
  }

  /**
   * Delay helper
   * @private
   */
  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default CookieManager;
