/**
 * ProxyManager - Manages proxy pools and session-proxy binding
 *
 * Key Concept: IMMUTABLE BINDING
 * Once a session is created with a proxy, they are bound forever.
 * This prevents fingerprint leakage and maintains consistency.
 *
 * Features:
 * - Proxy pool management
 * - Round-robin, random, or least-used selection
 * - Health monitoring
 * - Session-proxy immutable binding
 * - Proxy authentication support
 */
import { BrowserPoolError } from '../puppeteer.errors.js';

export class ProxyManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.config = plugin.config.proxy;
    this.storage = null;

    // Proxy pool
    this.proxies = []; // Array of proxy configs
    this.proxyStats = new Map(); // proxyId -> { requests, failures, lastUsed, healthy }

    // Session-Proxy binding (IMMUTABLE!)
    this.sessionProxyMap = new Map(); // sessionId -> proxyId

    // Proxy selection strategy
    this.selectionStrategy = this.config.selectionStrategy || 'round-robin';
    this.currentProxyIndex = 0;
  }

  /**
   * Initialize proxy manager
   */
  async initialize() {
    // Load proxies from config
    if (this.config.enabled && this.config.list && this.config.list.length > 0) {
      this.proxies = this.config.list.map((proxy, index) => ({
        id: `proxy_${index}`,
        ...this._parseProxy(proxy)
      }));

      // Initialize stats for each proxy
      for (const proxy of this.proxies) {
        this.proxyStats.set(proxy.id, {
          requests: 0,
          failures: 0,
          successRate: 1.0,
          lastUsed: 0,
          healthy: true,
          createdAt: Date.now()
        });
      }

      this.plugin.emit('proxyManager.initialized', {
        count: this.proxies.length,
        strategy: this.selectionStrategy
      });
    }

    // Load session-proxy bindings if storage exists
    if (this.plugin.cookieManager && this.plugin.cookieManager.storage) {
      await this._loadSessionProxyBindings();
    }
  }

  /**
   * Parse proxy string or object
   * @private
   */
  _parseProxy(proxy) {
    if (typeof proxy === 'string') {
      // Format: http://user:pass@host:port or http://host:port
      const url = new URL(proxy);
      return {
        protocol: url.protocol.replace(':', ''),
        host: url.hostname,
        port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
        username: url.username || null,
        password: url.password || null,
        url: proxy
      };
    } else {
      // Object format
      const protocol = proxy.protocol || 'http';
      const host = proxy.host;
      const port = proxy.port || (protocol === 'https' ? 443 : 80);
      const username = proxy.username || null;
      const password = proxy.password || null;

      // Build URL
      let url = `${protocol}://`;
      if (username && password) {
        url += `${username}:${password}@`;
      }
      url += `${host}:${port}`;

      return {
        protocol,
        host,
        port,
        username,
        password,
        url
      };
    }
  }

  /**
   * Load session-proxy bindings from storage
   * @private
   */
  async _loadSessionProxyBindings() {
    const storage = this.plugin.cookieManager.storage;
    const sessions = await storage.list({ limit: 1000 });

    for (const session of sessions) {
      if (session.proxyId) {
        this.sessionProxyMap.set(session.sessionId, session.proxyId);
      }
    }

    this.plugin.emit('proxyManager.bindingsLoaded', {
      count: this.sessionProxyMap.size
    });
  }

  /**
   * Get proxy for a session (respecting immutable binding)
   * @param {string} sessionId - Session identifier
   * @param {boolean} createIfMissing - Create new binding if session is new
   * @returns {Object|null} - Proxy config or null
   */
  getProxyForSession(sessionId, createIfMissing = true) {
    if (!this.config.enabled || this.proxies.length === 0) {
      return null;
    }

    // Check if session already has a proxy bound (IMMUTABLE!)
    if (this.sessionProxyMap.has(sessionId)) {
      const proxyId = this.sessionProxyMap.get(sessionId);
      const proxy = this.proxies.find(p => p.id === proxyId);

      if (!proxy) {
        throw new BrowserPoolError(`Proxy ${proxyId} bound to session ${sessionId} not found in pool`, {
          operation: 'getProxyForSession',
          retriable: false,
          suggestion: 'Ensure proxies remain registered while sessions are active.',
          proxyId,
          sessionId
        });
      }

      // Verify proxy is still healthy
      const stats = this.proxyStats.get(proxyId);
      if (!stats || !stats.healthy) {
        throw new BrowserPoolError(`Proxy ${proxyId} bound to session ${sessionId} is unhealthy`, {
          operation: 'getProxyForSession',
          retriable: true,
          suggestion: 'Rebind the session to a healthy proxy or refresh the proxy pool.',
          proxyId,
          sessionId
        });
      }

      return proxy;
    }

    // New session - select proxy if createIfMissing
    if (createIfMissing) {
      const proxy = this._selectProxy();

      if (proxy) {
        // Create IMMUTABLE binding
        this.sessionProxyMap.set(sessionId, proxy.id);

        this.plugin.emit('proxyManager.sessionBound', {
          sessionId,
          proxyId: proxy.id,
          proxyUrl: this._maskProxyUrl(proxy.url)
        });

        return proxy;
      }
    }

    return null;
  }

  /**
   * Select proxy based on strategy
   * @private
   */
  _selectProxy() {
    // Filter healthy proxies only
    const healthyProxies = this.proxies.filter(proxy => {
      const stats = this.proxyStats.get(proxy.id);
      return stats ? stats.healthy : false;
    });

    if (healthyProxies.length === 0) {
      throw new BrowserPoolError('No healthy proxies available', {
        operation: '_selectProxy',
        retriable: true,
        suggestion: 'Add healthy proxies to the configuration or allow existing proxies to recover.',
        available: this.proxies.length
      });
    }

    let selectedProxy;

    switch (this.selectionStrategy) {
      case 'round-robin':
        selectedProxy = healthyProxies[this.currentProxyIndex % healthyProxies.length];
        this.currentProxyIndex++;
        break;

      case 'random':
        selectedProxy = healthyProxies[Math.floor(Math.random() * healthyProxies.length)];
        break;

      case 'least-used':
        // Select proxy with lowest request count
        selectedProxy = healthyProxies.reduce((min, proxy) => {
          const proxyStats = this.proxyStats.get(proxy.id);
          const minStats = this.proxyStats.get(min.id);
          return proxyStats.requests < minStats.requests ? proxy : min;
        });
        break;

      case 'best-performance':
        // Select proxy with highest success rate
        selectedProxy = healthyProxies.reduce((best, proxy) => {
          const proxyStats = this.proxyStats.get(proxy.id);
          const bestStats = this.proxyStats.get(best.id);
          return proxyStats.successRate > bestStats.successRate ? proxy : best;
        });
        break;

      default:
        selectedProxy = healthyProxies[0];
    }

    return selectedProxy;
  }

  /**
   * Record proxy usage
   * @param {string} proxyId - Proxy identifier
   * @param {boolean} success - Whether request succeeded
   */
  recordProxyUsage(proxyId, success = true) {
    const stats = this.proxyStats.get(proxyId);
    if (!stats) return;

    stats.requests++;
    stats.lastUsed = Date.now();

    if (success) {
      // Update success rate with exponential moving average
      stats.successRate = stats.successRate * 0.9 + 0.1;
    } else {
      stats.failures++;
      stats.successRate = stats.successRate * 0.9;

      // Mark unhealthy if success rate drops below threshold
      const threshold = this.config.healthCheck?.successRateThreshold || 0.3;
      if (stats.successRate < threshold) {
        stats.healthy = false;
        this.plugin.emit('proxyManager.proxyUnhealthy', {
          proxyId,
          successRate: stats.successRate
        });
      }
    }
  }

  /**
   * Get proxy statistics
   * @returns {Array}
   */
  getProxyStats() {
    return this.proxies.map(proxy => {
      const stats = this.proxyStats.get(proxy.id);
      return {
        proxyId: proxy.id,
        url: this._maskProxyUrl(proxy.url),
        ...stats,
        boundSessions: Array.from(this.sessionProxyMap.entries())
          .filter(([_, proxyId]) => proxyId === proxy.id)
          .length
      };
    });
  }

  /**
   * Get session-proxy bindings
   * @returns {Array}
   */
  getSessionBindings() {
    return Array.from(this.sessionProxyMap.entries()).map(([sessionId, proxyId]) => {
      const proxy = this.proxies.find(p => p.id === proxyId);
      return {
        sessionId,
        proxyId,
        proxyUrl: proxy ? this._maskProxyUrl(proxy.url) : 'unknown'
      };
    });
  }

  /**
   * Verify session-proxy binding integrity
   * @param {string} sessionId - Session identifier
   * @param {string} proxyId - Proxy identifier
   * @returns {boolean}
   */
  verifyBinding(sessionId, proxyId) {
    if (!this.sessionProxyMap.has(sessionId)) {
      return false;
    }

    const boundProxyId = this.sessionProxyMap.get(sessionId);
    return boundProxyId === proxyId;
  }

  /**
   * Get proxy config for browser launch
   * @param {Object} proxy - Proxy object
   * @returns {Object} - Puppeteer proxy config
   */
  getProxyLaunchArgs(proxy) {
    if (!proxy) return [];

    const args = [`--proxy-server=${proxy.url}`];

    // Add proxy bypass list if configured
    if (this.config.bypassList && this.config.bypassList.length > 0) {
      args.push(`--proxy-bypass-list=${this.config.bypassList.join(';')}`);
    }

    return args;
  }

  /**
   * Authenticate proxy on page
   * @param {Page} page - Puppeteer page
   * @param {Object} proxy - Proxy object
   */
  async authenticateProxy(page, proxy) {
    if (proxy.username && proxy.password) {
      await page.authenticate({
        username: proxy.username,
        password: proxy.password
      });
    }
  }

  /**
   * Check proxy health
   * @param {string} proxyId - Proxy identifier
   * @returns {Promise<boolean>}
   */
  async checkProxyHealth(proxyId) {
    const proxy = this.proxies.find(p => p.id === proxyId);
    if (!proxy) return false;

    const stats = this.proxyStats.get(proxyId);
    if (!stats) return false;

    try {
      // Launch browser with this proxy
      const browser = await this.plugin.puppeteer.launch({
        ...this.plugin.config.launch,
        args: [
          ...this.plugin.config.launch.args,
          ...this.getProxyLaunchArgs(proxy)
        ]
      });

      const page = await browser.newPage();

      // Authenticate if needed
      await this.authenticateProxy(page, proxy);

      // Try to fetch a test page
      const testUrl = this.config.healthCheck?.testUrl || 'https://www.google.com';
      const timeout = this.config.healthCheck?.timeout || 10000;

      await page.goto(testUrl, { timeout });

      await browser.close();

      // Mark as healthy
      stats.healthy = true;
      stats.successRate = Math.min(stats.successRate + 0.1, 1.0);

      this.plugin.emit('proxyManager.healthCheckPassed', {
        proxyId,
        url: this._maskProxyUrl(proxy.url)
      });

      return true;
    } catch (err) {
      // Mark as unhealthy
      stats.healthy = false;
      stats.failures++;

      this.plugin.emit('proxyManager.healthCheckFailed', {
        proxyId,
        url: this._maskProxyUrl(proxy.url),
        error: err.message
      });

      return false;
    }
  }

  /**
   * Run health checks on all proxies
   * @returns {Promise<Object>}
   */
  async checkAllProxies() {
    const results = {
      total: this.proxies.length,
      healthy: 0,
      unhealthy: 0,
      checks: []
    };

    for (const proxy of this.proxies) {
      const isHealthy = await this.checkProxyHealth(proxy.id);
      results.checks.push({
        proxyId: proxy.id,
        url: this._maskProxyUrl(proxy.url),
        healthy: isHealthy
      });

      if (isHealthy) {
        results.healthy++;
      } else {
        results.unhealthy++;
      }
    }

    return results;
  }

  /**
   * Mask proxy URL for logging (hide credentials)
   * @private
   */
  _maskProxyUrl(url) {
    try {
      const parsed = new URL(url);
      if (parsed.username) {
        return `${parsed.protocol}//${parsed.username}:***@${parsed.host}`;
      }
      return url;
    } catch {
      return url;
    }
  }

  /**
   * Remove session-proxy binding (only for cleanup/testing)
   * WARNING: This breaks immutability! Only use when deleting sessions.
   * @param {string} sessionId - Session identifier
   */
  _removeBinding(sessionId) {
    this.sessionProxyMap.delete(sessionId);
    this.plugin.emit('proxyManager.bindingRemoved', { sessionId });
  }
}

export default ProxyManager;
