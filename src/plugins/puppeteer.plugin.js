import { Plugin } from './plugin.class.js';
import { requirePluginDependency } from './concerns/plugin-dependencies.js';
import { resolveResourceNames } from './concerns/resource-names.js';
import { getValidatedNamespace } from './namespace.js';
import tryFn from '../concerns/try-fn.js';
import { PluginError } from '../errors.js';

/**
 * PuppeteerPlugin - Headless browser automation with anti-bot detection
 *
 * Features:
 * - Browser pool management with tab recycling
 * - Cookie farming and session management
 * - Human behavior simulation (ghost-cursor)
 * - Anti-detection (puppeteer-extra-plugin-stealth)
 * - Random user agent generation
 * - Performance optimization (resource blocking)
 * - Proxy support
 *
 * @extends Plugin
 */
export class PuppeteerPlugin extends Plugin {
  constructor(options = {}) {
    super(options);

    // Validate and set namespace (standardized)
    this.namespace = getValidatedNamespace(options, '');

    // Default configuration
    this.config = {
      verbose: this.verbose,
      // Browser Pool
      pool: {
        enabled: true,
        maxBrowsers: 5,
        maxTabsPerBrowser: 10,
        reuseTab: false,
        closeOnIdle: true,
        idleTimeout: 300000, // 5 minutes
        ...options.pool
      },

      // Browser Launch Options
      launch: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
        ignoreHTTPSErrors: true,
        ...options.launch
      },

      // Viewport & User Agent
      viewport: {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        randomize: true,
        presets: ['desktop', 'laptop', 'tablet'],
        ...options.viewport
      },

      // User Agent Management
      userAgent: {
        enabled: true,
        random: true,
        filters: {
          deviceCategory: 'desktop',
          ...options.userAgent?.filters
        },
        custom: options.userAgent?.custom || null,
        ...options.userAgent
      },

      // Stealth Mode (Anti-Detection)
      stealth: {
        enabled: true,
        enableEvasions: true,
        ...options.stealth
      },

      // Human Behavior Simulation
      humanBehavior: {
        enabled: true,
        mouse: {
          enabled: true,
          bezierCurves: true,
          overshoot: true,
          jitter: true,
          pathThroughElements: true,
          ...options.humanBehavior?.mouse
        },
        typing: {
          enabled: true,
          mistakes: true,
          corrections: true,
          pauseAfterWord: true,
          speedVariation: true,
          delayRange: [50, 150],
          ...options.humanBehavior?.typing
        },
        scrolling: {
          enabled: true,
          randomStops: true,
          backScroll: true,
          horizontalJitter: true,
          ...options.humanBehavior?.scrolling
        },
        ...options.humanBehavior
      },

      // Cookie Management & Farming
      cookies: {
        enabled: true,
        storage: {
          resource: 'plg_puppeteer_cookies',
          autoSave: true,
          autoLoad: true,
          encrypt: true,
          ...options.cookies?.storage
        },
        farming: {
          enabled: true,
          warmup: {
            enabled: true,
            pages: ['https://www.google.com', 'https://www.youtube.com', 'https://www.wikipedia.org'],
            randomOrder: true,
            timePerPage: { min: 5000, max: 15000 },
            interactions: { scroll: true, click: true, hover: true },
            ...options.cookies?.farming?.warmup
          },
          rotation: {
            enabled: true,
            requestsPerCookie: 100,
            maxAge: 86400000, // 24 hours
            poolSize: 10,
            ...options.cookies?.farming?.rotation
          },
          reputation: {
            enabled: true,
            trackSuccess: true,
            retireThreshold: 0.5,
            ageBoost: true,
            ...options.cookies?.farming?.reputation
          },
          ...options.cookies?.farming
        },
        ...options.cookies
      },

      // Performance Optimization
      performance: {
        blockResources: {
          enabled: true,
          types: ['image', 'stylesheet', 'font', 'media'],
          ...options.performance?.blockResources
        },
        cacheEnabled: true,
        javascriptEnabled: true,
        ...options.performance
      },

      // Network Monitoring (CDP)
      networkMonitor: {
        enabled: false,                  // Disabled by default (adds overhead)
        persist: false,                  // Save to S3DB
        filters: {
          types: null,                   // ['image', 'script'] or null for all
          statuses: null,                // [404, 500] or null for all
          minSize: null,                 // Only requests >= size (bytes)
          maxSize: null,                 // Only requests <= size (bytes)
          saveErrors: true,              // Always save failed requests
          saveLargeAssets: true,         // Always save assets > 1MB
          ...options.networkMonitor?.filters
        },
        compression: {
          enabled: true,
          threshold: 10240,              // Compress payloads > 10KB
          ...options.networkMonitor?.compression
        },
        ...options.networkMonitor
      },

      // Console Monitoring
      consoleMonitor: {
        enabled: false,                  // Disabled by default
        persist: false,                  // Save to S3DB
        filters: {
          levels: null,                  // ['error', 'warning'] or null for all
          excludePatterns: [],           // Regex patterns to exclude
          includeStackTraces: true,
          includeSourceLocation: true,
          captureNetwork: false,         // Also capture network errors
          ...options.consoleMonitor?.filters
        },
        ...options.consoleMonitor
      },

      // Screenshot & Recording
      screenshot: {
        fullPage: false,
        type: 'png',
        ...options.screenshot
      },

      // Proxy Support
      proxy: {
        enabled: false,
        list: [], // Array of proxy URLs or objects
        selectionStrategy: 'round-robin', // 'round-robin' | 'random' | 'least-used' | 'best-performance'
        bypassList: [], // Domains to bypass proxy
        healthCheck: {
          enabled: true,
          interval: 300000, // 5 minutes
          testUrl: 'https://www.google.com',
          timeout: 10000,
          successRateThreshold: 0.3
        },
        // Legacy single proxy support (deprecated)
        server: null,
        username: null,
        password: null,
        ...options.proxy
      },

      // Error Handling & Retries
      retries: {
        enabled: true,
        maxAttempts: 3,
        backoff: 'exponential',
        initialDelay: 1000,
        ...options.retries
      },

      // Logging & Debugging
      debug: {
        enabled: false,
        screenshots: false,
        console: false,
        network: false,
        ...options.debug
      },
      ...options
    };

    this.config.verbose = this.verbose;

    const resourceNamesOption = options.resourceNames || {};
    this._resourceDescriptors = {
      cookies: {
        defaultName: 'plg_puppeteer_cookies',
        override: resourceNamesOption.cookies || options.cookies?.storage?.resource
      },
      consoleSessions: {
        defaultName: 'plg_puppeteer_console_sessions',
        override: resourceNamesOption.consoleSessions
      },
      consoleMessages: {
        defaultName: 'plg_puppeteer_console_messages',
        override: resourceNamesOption.consoleMessages
      },
      consoleErrors: {
        defaultName: 'plg_puppeteer_console_errors',
        override: resourceNamesOption.consoleErrors
      },
      networkSessions: {
        defaultName: 'plg_puppeteer_network_sessions',
        override: resourceNamesOption.networkSessions
      },
      networkRequests: {
        defaultName: 'plg_puppeteer_network_requests',
        override: resourceNamesOption.networkRequests
      },
      networkErrors: {
        defaultName: 'plg_puppeteer_network_errors',
        override: resourceNamesOption.networkErrors
      }
    };
    this.resourceNames = this._resolveResourceNames();

    // Ensure cookies.storage exists before setting resource name
    // (user may have passed cookies: { enabled: false } without storage property)
    if (this.config.cookies && !this.config.cookies.storage) {
      this.config.cookies.storage = {
        resource: this.resourceNames.cookies,
        autoSave: true,
        autoLoad: true,
        encrypt: true
      };
    } else if (this.config.cookies && this.config.cookies.storage) {
      this.config.cookies.storage.resource = this.resourceNames.cookies;
    }

    // Ensure proxy.selectionStrategy exists (user may have passed proxy: {} without selectionStrategy)
    if (this.config.proxy && !this.config.proxy.selectionStrategy) {
      this.config.proxy.selectionStrategy = 'round-robin';
    }

    // Internal state
    this.browserPool = [];
    this.tabPool = new Map(); // Browser instance -> Set<Page>
    this.browserIdleTimers = new Map(); // Browser instance -> timeout id
    this.dedicatedBrowsers = new Set(); // Non-pooled browsers for cleanup
    this.userAgentGenerator = null;
    this.ghostCursor = null;
    this.cookieManager = null;
    this.proxyManager = null;
    this.performanceManager = null;
    this.networkMonitor = null;
    this.consoleMonitor = null;
    this.initialized = false;

    if (this.config.pool.reuseTab) {
      this.emit('puppeteer.configWarning', {
        setting: 'pool.reuseTab',
        message: 'pool.reuseTab is not supported yet and will be ignored.'
      });
    }

    // Deprecation warning for legacy single proxy config
    if (options.proxy?.server || options.proxy?.username || options.proxy?.password) {
      console.warn(
        '[PuppeteerPlugin] DEPRECATED: The single proxy config (server, username, password) is deprecated. ' +
        'Use the proxy.list array with proxy objects instead. Example: proxy: { list: [{ proxy: "http://host:port", username: "user", password: "pass" }] }. ' +
        'This will be removed in v17.0.'
      );
    }
  }

  _resolveResourceNames() {
    return resolveResourceNames('puppeteer', this._resourceDescriptors, {
      namespace: this.namespace
    });
  }

  onNamespaceChanged() {
    this.resourceNames = this._resolveResourceNames();
    if (this.config?.cookies?.storage) {
      this.config.cookies.storage.resource = this.resourceNames.cookies;
    }
  }

  /**
   * Install plugin and validate dependencies
   */
  async onInstall() {
    // Validate required dependencies
    requirePluginDependency('puppeteer', this.name);
    requirePluginDependency('puppeteer-extra', this.name);
    requirePluginDependency('puppeteer-extra-plugin-stealth', this.name);
    requirePluginDependency('user-agents', this.name);
    requirePluginDependency('ghost-cursor', this.name);

    // Create cookie storage resource if enabled
    if (this.config.cookies.enabled) {
      await this._setupCookieStorage();
    }

    this.emit('puppeteer.installed');
  }

  /**
   * Start plugin and initialize browser pool
   */
  async onStart() {
    if (this.initialized) return;

    // Import dependencies
    await this._importDependencies();

    // Initialize cookie manager
    if (this.config.cookies.enabled) {
      await this._initializeCookieManager();
    }

    // Initialize proxy manager (requires cookie storage for binding restore)
    if (this.config.proxy.enabled) {
      await this._initializeProxyManager();
    }

    // Initialize performance manager
    await this._initializePerformanceManager();

    // Initialize network monitor
    if (this.config.networkMonitor.enabled) {
      await this._initializeNetworkMonitor();
    }

    // Initialize console monitor
    if (this.config.consoleMonitor.enabled) {
      await this._initializeConsoleMonitor();
    }

    // Pre-warm browser pool if enabled
    if (this.config.pool.enabled) {
      await this._warmupBrowserPool();
    }

    this.initialized = true;
    this.emit('puppeteer.started');
  }

  /**
   * Stop plugin and cleanup resources
   */
  async onStop() {
    await this._closeBrowserPool();
    await this._closeDedicatedBrowsers();
    this.initialized = false;
    this.emit('puppeteer.stopped');
  }

  /**
   * Uninstall plugin
   */
  async onUninstall(options = {}) {
    await this.onStop();
    this.emit('puppeteer.uninstalled');
  }

  /**
   * Import required dependencies (lazy loading)
   * @private
   */
  async _importDependencies() {
    const puppeteerModule = await import('puppeteer-extra');
    const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
    const UserAgent = (await import('user-agents')).default;
    const { createCursor } = await import('ghost-cursor');

    // Setup puppeteer with stealth plugin
    this.puppeteer = puppeteerModule.default || puppeteerModule;

    if (this.config.stealth.enabled) {
      this.puppeteer.use(StealthPlugin());
    }

    // Setup user agent generator
    if (this.config.userAgent.enabled && this.config.userAgent.random) {
      this.UserAgent = UserAgent;
    }

    // Store ghost-cursor factory
    this.createGhostCursor = createCursor;
  }

  /**
   * Setup cookie storage resource
   * @private
   */
  async _setupCookieStorage() {
    const resourceName = this.config.cookies.storage.resource;

    try {
      await this.database.getResource(resourceName);
      return;
    } catch (err) {
      // Resource missing, will create below
    }

    const [created, createErr] = await tryFn(() => this.database.createResource({
      name: resourceName,
      attributes: {
        sessionId: 'string|required',
        cookies: 'array|required',
        userAgent: 'string',
        viewport: 'object',
        proxyId: 'string|optional',
        domain: 'string',
        date: 'string',
        reputation: {
          successCount: 'number',
          failCount: 'number',
          successRate: 'number',
          lastUsed: 'number'
        },
        metadata: {
          createdAt: 'number',
          expiresAt: 'number',
          requestCount: 'number',
          age: 'number'
        }
      },
      timestamps: true,
      behavior: 'body-only',
      partitions: {
        byProxy: { fields: { proxyId: 'string' } },
        byDate: { fields: { date: 'string' } },
        byDomain: { fields: { domain: 'string' } }
      }
    }));

    if (!created) {
      const existing = this.database.resources?.[resourceName];
      if (!existing) {
        throw createErr;
      }
    }
  }

  /**
   * Initialize proxy manager
   * @private
   */
  async _initializeProxyManager() {
    const { ProxyManager } = await import('./puppeteer/proxy-manager.js');
    this.proxyManager = new ProxyManager(this);
    await this.proxyManager.initialize();
  }

  /**
   * Initialize cookie manager
   * @private
   */
  async _initializeCookieManager() {
    const { CookieManager } = await import('./puppeteer/cookie-manager.js');
    this.cookieManager = new CookieManager(this);
    await this.cookieManager.initialize();
  }

  /**
   * Initialize performance manager
   * @private
   */
  async _initializePerformanceManager() {
    const { PerformanceManager } = await import('./puppeteer/performance-manager.js');
    this.performanceManager = new PerformanceManager(this);
    this.emit('puppeteer.performanceManager.initialized');
  }

  /**
   * Initialize network monitor
   * @private
   */
  async _initializeNetworkMonitor() {
    const { NetworkMonitor } = await import('./puppeteer/network-monitor.js');
    this.networkMonitor = new NetworkMonitor(this);

    // Initialize S3DB resources if persistence enabled
    if (this.config.networkMonitor.persist) {
      await this.networkMonitor.initialize();
    }

    this.emit('puppeteer.networkMonitor.initialized');
  }

  /**
   * Initialize console monitor
   * @private
   */
  async _initializeConsoleMonitor() {
    const { ConsoleMonitor } = await import('./puppeteer/console-monitor.js');
    this.consoleMonitor = new ConsoleMonitor(this);

    // Initialize S3DB resources if persistence enabled
    if (this.config.consoleMonitor.persist) {
      await this.consoleMonitor.initialize();
    }

    this.emit('puppeteer.consoleMonitor.initialized');
  }

  /**
   * Warmup browser pool
   * @private
   */
  async _warmupBrowserPool() {
    const poolSize = Math.min(this.config.pool.maxBrowsers, 2); // Start with 2 browsers

    for (let i = 0; i < poolSize; i++) {
      await this._createBrowser();
    }

    this.emit('puppeteer.poolWarmed', { size: this.browserPool.length });
  }

  /**
   * Create a new browser instance
   * @private
   * @param {Object} proxy - Optional proxy configuration
   * @returns {Promise<Browser>}
   */
  async _createBrowser(proxy = null) {
    const launchOptions = {
      ...this.config.launch,
      args: [...(this.config.launch.args || [])]
    };

    // Add proxy args if provided
    if (proxy && this.proxyManager) {
      const proxyArgs = this.proxyManager.getProxyLaunchArgs(proxy);
      launchOptions.args.push(...proxyArgs);
    } else if (this.config.proxy.enabled && this.config.proxy.server) {
      // Legacy single proxy support (deprecated)
      launchOptions.args.push(`--proxy-server=${this.config.proxy.server}`);
    }

    const browser = await this.puppeteer.launch(launchOptions);

    // Only add to pool if no specific proxy (shared browser)
    if (!proxy && this.config.pool.enabled) {
      this.browserPool.push(browser);
      this.tabPool.set(browser, new Set());

      browser.on('disconnected', () => {
        const index = this.browserPool.indexOf(browser);
        if (index > -1) {
          this.browserPool.splice(index, 1);
        }
        this.tabPool.delete(browser);
        this._clearIdleTimer(browser);
        this.dedicatedBrowsers.delete(browser);
      });
    }
    return browser;
  }

  /**
   * Get or create a browser instance
   * @private
   * @param {Object} proxy - Optional proxy configuration
   * @returns {Promise<Browser>}
   */
  async _getBrowser(proxy = null) {
    // If proxy specified, create dedicated browser (not pooled)
    if (proxy) {
      return await this._createBrowser(proxy);
    }
    if (this.config.pool.enabled) {
      // Find browser with available capacity
      for (const browser of this.browserPool) {
        const tabs = this.tabPool.get(browser);
        if (!tabs || tabs.size < this.config.pool.maxTabsPerBrowser) {
          return browser;
        }
      }

      // Create new browser if pool not full
      if (this.browserPool.length < this.config.pool.maxBrowsers) {
        return await this._createBrowser();
      }

      // Use least loaded browser
      let targetBrowser = this.browserPool[0];
      let minTabs = this.tabPool.get(targetBrowser)?.size || 0;

      for (const browser of this.browserPool.slice(1)) {
        const tabs = this.tabPool.get(browser)?.size || 0;
        if (tabs < minTabs) {
          targetBrowser = browser;
          minTabs = tabs;
        }
      }

      return targetBrowser;
    } else {
      // No pooling - create new browser every time
      return await this._createBrowser();
    }
  }

  /**
   * Close all browsers in pool
   * @private
   */
  async _closeBrowserPool() {
    for (const browser of this.browserPool) {
      this._clearIdleTimer(browser);
      if (this.cookieManager) {
        const tabs = this.tabPool.get(browser);
        if (tabs) {
          for (const page of tabs) {
            if (!page || page._sessionSaved || !page._sessionId) {
              continue;
            }

            // Skip if page already closed
            if (typeof page.isClosed === 'function' && page.isClosed()) {
              continue;
            }

            try {
              await this.cookieManager.saveSession(page, page._sessionId, {
                success: !!page._navigationSuccess
              });
              page._sessionSaved = true;
            } catch (err) {
              page._sessionSaved = true;
              this.emit('puppeteer.cookieSaveFailed', {
                sessionId: page._sessionId,
                error: err.message
              });
            }
          }
        }
      }

      try {
        await browser.close();
      } catch (err) {
        // Ignore errors during cleanup
      }
    }
    this.browserPool = [];
    this.tabPool.clear();
  }

  /**
   * Clear idle timer for pooled browser
   * @private
   */
  _clearIdleTimer(browser) {
    const timer = this.browserIdleTimers.get(browser);
    if (timer) {
      clearTimeout(timer);
      this.browserIdleTimers.delete(browser);
    }
  }

  /**
   * Schedule pooled browser retirement when idle
   * @private
   */
  _scheduleIdleCloseIfNeeded(browser) {
    if (!this.config.pool.closeOnIdle) return;
    const tabs = this.tabPool.get(browser);
    if (!tabs || tabs.size > 0) return;
    if (this.browserIdleTimers.has(browser)) return;

    const timeout = this.config.pool.idleTimeout || 300000;
    const timer = setTimeout(async () => {
      this.browserIdleTimers.delete(browser);
      const currentTabs = this.tabPool.get(browser);
      if (currentTabs && currentTabs.size === 0) {
        await this._retireIdleBrowser(browser);
      }
    }, timeout);

    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    this.browserIdleTimers.set(browser, timer);
  }

  /**
   * Retire pooled browser if still idle
   * @private
   * @param {Browser} browser
   */
  async _retireIdleBrowser(browser) {
    this.tabPool.delete(browser);
    const index = this.browserPool.indexOf(browser);
    if (index > -1) {
      this.browserPool.splice(index, 1);
    }

    try {
      await browser.close();
      this.emit('puppeteer.browserRetired', { pooled: true });
    } catch (err) {
      this.emit('puppeteer.browserRetiredError', {
        pooled: true,
        error: err.message
      });
    }
  }

  /**
   * Close dedicated (non-pooled) browsers
   * @private
   */
  async _closeDedicatedBrowsers() {
    for (const browser of Array.from(this.dedicatedBrowsers)) {
      try {
        await browser.close();
      } catch (err) {
        // Ignore errors during cleanup
      } finally {
        this.dedicatedBrowsers.delete(browser);
      }
    }
  }

  /**
   * Generate random user agent
   * @private
   * @returns {string}
   */
  _generateUserAgent() {
    if (this.config.userAgent.custom) {
      return this.config.userAgent.custom;
    }

    if (this.config.userAgent.random && this.UserAgent) {
      const userAgent = new this.UserAgent(this.config.userAgent.filters);
      return userAgent.toString();
    }

    return null;
  }

  /**
   * Generate random viewport
   * @private
   * @returns {Object}
   */
  _generateViewport() {
    if (!this.config.viewport.randomize) {
      return {
        width: this.config.viewport.width,
        height: this.config.viewport.height,
        deviceScaleFactor: this.config.viewport.deviceScaleFactor
      };
    }

    // Predefined viewport presets
    const presets = {
      desktop: [
        { width: 1920, height: 1080, deviceScaleFactor: 1 },
        { width: 1680, height: 1050, deviceScaleFactor: 1 },
        { width: 1600, height: 900, deviceScaleFactor: 1 },
        { width: 1440, height: 900, deviceScaleFactor: 1 },
        { width: 1366, height: 768, deviceScaleFactor: 1 }
      ],
      laptop: [
        { width: 1440, height: 900, deviceScaleFactor: 1 },
        { width: 1366, height: 768, deviceScaleFactor: 1 },
        { width: 1280, height: 800, deviceScaleFactor: 1 }
      ],
      tablet: [
        { width: 1024, height: 768, deviceScaleFactor: 2 },
        { width: 768, height: 1024, deviceScaleFactor: 2 }
      ]
    };

    // Select preset categories
    const categories = this.config.viewport.presets || ['desktop'];
    const availablePresets = categories.flatMap(cat => presets[cat] || []);

    return availablePresets[Math.floor(Math.random() * availablePresets.length)];
  }

  /**
   * PUBLIC API
   */

  /**
   * Navigate to URL with human behavior
   * @param {string} url - URL to navigate to
   * @param {Object} options - Navigation options
   * @returns {Promise<Page>}
   */
  async navigate(url, options = {}) {
    const {
      useSession = null,
      screenshot = false,
      waitUntil = 'networkidle2',
      timeout = 30000
    } = options;

    // IMMUTABLE PROXY BINDING: Get proxy for session if proxy is enabled
    let proxy = null;
    let proxyId = null;

    if (useSession && this.proxyManager) {
      proxy = this.proxyManager.getProxyForSession(useSession, true);
      proxyId = proxy?.id || null;
    }

    // Get browser (with proxy if needed)
    const browser = await this._getBrowser(proxy);
    const page = await browser.newPage();
    const isPooledBrowser = !proxy && this.config.pool.enabled;

    if (isPooledBrowser) {
      const tabs = this.tabPool.get(browser);
      if (tabs) {
        tabs.add(page);
        this._clearIdleTimer(browser);
      }
    } else {
      this.dedicatedBrowsers.add(browser);
      browser.once('disconnected', () => {
        this.dedicatedBrowsers.delete(browser);
      });
    }

    // Authenticate proxy if needed
    if (proxy && this.proxyManager) {
      await this.proxyManager.authenticateProxy(page, proxy);
    }

    // Setup viewport
    const viewport = this._generateViewport();
    await page.setViewport(viewport);

    // Setup user agent
    const userAgent = this._generateUserAgent();
    if (userAgent) {
      await page.setUserAgent(userAgent);
    }

    // Setup resource blocking for performance
    if (this.config.performance.blockResources.enabled) {
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (this.config.performance.blockResources.types.includes(request.resourceType())) {
          request.abort();
        } else {
          request.continue();
        }
      });
    }

    // Load cookies from session
    if (useSession && this.cookieManager) {
      await this.cookieManager.loadSession(page, useSession);
    }

    // Setup ghost cursor for human behavior
    let cursor = null;
    if (this.config.humanBehavior.enabled && this.config.humanBehavior.mouse.enabled) {
      cursor = this.createGhostCursor(page);
    }

    // Navigate with error handling for proxy
    let navigationSuccess = false;
    try {
      await page.goto(url, { waitUntil, timeout });
      navigationSuccess = true;

      // Record successful proxy usage
      if (proxyId && this.proxyManager) {
        this.proxyManager.recordProxyUsage(proxyId, true);
      }
    } catch (err) {
      // Record failed proxy usage
      if (proxyId && this.proxyManager) {
        this.proxyManager.recordProxyUsage(proxyId, false);
      }
      throw err;
    }

    // Take screenshot if requested
    if (screenshot) {
      const screenshotBuffer = await page.screenshot(this.config.screenshot);
      page._screenshot = screenshotBuffer;
    }

    // Attach helper methods to page
    page._cursor = cursor;
    page._userAgent = userAgent;
    page._viewport = viewport;
    page._proxyId = proxyId; // IMMUTABLE: Proxy binding stored on page
    page._sessionId = useSession;
    page._navigationSuccess = navigationSuccess;
    page._sessionSaved = false;

    // Add human behavior methods
    if (this.config.humanBehavior.enabled) {
      this._attachHumanBehaviorMethods(page);
    }

    let hasSavedSession = false;
    let browserClosed = false;
    const originalClose = page.close?.bind(page) || (async () => {});
    const shouldAutoCloseBrowser = !isPooledBrowser;

    page.on('close', () => {
      if (isPooledBrowser) {
        const tabs = this.tabPool.get(browser);
        tabs?.delete(page);
        this._scheduleIdleCloseIfNeeded(browser);
      } else {
        this.dedicatedBrowsers.delete(browser);
      }
    });

    page.close = async (...closeArgs) => {
      if (!hasSavedSession && useSession && this.cookieManager && !page._sessionSaved) {
        try {
          await this.cookieManager.saveSession(page, useSession, {
            success: navigationSuccess
          });
          page._sessionSaved = true;
        } catch (err) {
          this.emit('puppeteer.cookieSaveFailed', {
            sessionId: useSession,
            error: err.message
          });
          page._sessionSaved = true;
        } finally {
          hasSavedSession = true;
        }
      }

      try {
        const result = await originalClose(...closeArgs);
        return result;
      } finally {
        if (isPooledBrowser) {
          const tabs = this.tabPool.get(browser);
          tabs?.delete(page);
          this._scheduleIdleCloseIfNeeded(browser);
        } else if (shouldAutoCloseBrowser && !browserClosed) {
          try {
            await browser.close();
            this.emit('puppeteer.browserClosed', { pooled: false });
          } catch (err) {
            this.emit('puppeteer.browserCloseFailed', {
              pooled: false,
              error: err.message
            });
          } finally {
            browserClosed = true;
            this.dedicatedBrowsers.delete(browser);
          }
        }
      }
    };

    this.emit('puppeteer.navigate', {
      url,
      userAgent,
      viewport,
      proxyId,
      sessionId: useSession
    });

    return page;
  }

  /**
   * Run handler with session-aware navigation helper
   * @param {string} sessionId - Session identifier
   * @param {Function} handler - Async function receiving the page instance
   * @param {Object} options - Navigate options (requires url)
   * @returns {Promise<*>}
   */
  async withSession(sessionId, handler, options = {}) {
    if (!sessionId) {
      throw new PluginError('withSession requires a sessionId', {
        pluginName: 'PuppeteerPlugin',
        operation: 'withSession',
        statusCode: 400,
        retriable: false,
        suggestion: 'Pass a sessionId when invoking withSession so cookies/proxies can be resolved.'
      });
    }
    if (typeof handler !== 'function') {
      throw new TypeError('withSession handler must be a function');
    }

    const { url, ...navigateOptions } = options;
    if (!url) {
      throw new PluginError('withSession requires an options.url value', {
        pluginName: 'PuppeteerPlugin',
        operation: 'withSession',
        statusCode: 400,
        retriable: false,
        suggestion: 'Provide options.url to navigate before executing the session handler.'
      });
    }

    this.emit('puppeteer.withSession.start', { sessionId, url });

    const page = await this.navigate(url, {
      ...navigateOptions,
      useSession: sessionId
    });

    let handlerError = null;

    try {
      const result = await handler(page, this);
      return result;
    } catch (err) {
      handlerError = err;
      throw err;
    } finally {
      try {
        await page.close();
      } catch (err) {
        this.emit('puppeteer.withSession.cleanupFailed', {
          sessionId,
          url,
          error: err.message
        });
      }

      this.emit('puppeteer.withSession.finish', {
        sessionId,
        url,
        error: handlerError ? handlerError.message : null
      });
    }
  }

  /**
   * Attach human behavior methods to page
   * @private
   */
  _attachHumanBehaviorMethods(page) {
    // Human click
    page.humanClick = async (selector, options = {}) => {
      const element = await page.$(selector);
      if (!element) {
        throw new PluginError(`Element not found: ${selector}`, {
          pluginName: 'PuppeteerPlugin',
          operation: 'humanClick',
          statusCode: 404,
          retriable: false,
          suggestion: 'Ensure the selector matches an element on the page before invoking humanClick.',
          metadata: { selector }
        });
      }

      if (this.config.humanBehavior.mouse.pathThroughElements && page._cursor) {
        // Move through elements to destination
        await page._cursor.moveTo(selector);
        await page._cursor.click();
      } else {
        await element.click();
      }
    };

    // Human move
    page.humanMoveTo = async (selector, options = {}) => {
      if (!page._cursor) {
        throw new PluginError('Ghost cursor not initialized', {
          pluginName: 'PuppeteerPlugin',
          operation: 'humanMoveTo',
          statusCode: 500,
          retriable: false,
          suggestion: 'Enable humanBehavior.mouse.enableGhostCursor in configuration before using humanMoveTo.'
        });
      }

      await page._cursor.moveTo(selector);
    };

    // Human type
    page.humanType = async (selector, text, options = {}) => {
      const element = await page.$(selector);
      if (!element) {
        throw new PluginError(`Element not found: ${selector}`, {
          pluginName: 'PuppeteerPlugin',
          operation: 'humanMoveTo',
          statusCode: 404,
          retriable: false,
          suggestion: 'Ensure the selector is present on the page when calling humanMoveTo.',
          metadata: { selector }
        });
      }

      await element.click();

      if (this.config.humanBehavior.typing.mistakes) {
        // Type with mistakes and corrections
        await this._typeWithMistakes(page, text, options);
      } else {
        // Normal typing with delays
        const [min, max] = this.config.humanBehavior.typing.delayRange;
        await page.type(selector, text, {
          delay: min + Math.random() * (max - min)
        });
      }
    };

    // Human scroll
    page.humanScroll = async (options = {}) => {
      const { distance = null, direction = 'down' } = options;

      if (distance) {
        await page.evaluate((dist, dir) => {
          window.scrollBy(0, dir === 'down' ? dist : -dist);
        }, distance, direction);
      } else {
        // Scroll to bottom with random stops
        await this._scrollWithStops(page, direction);
      }
    };
  }

  /**
   * Type with random mistakes and corrections
   * @private
   */
  async _typeWithMistakes(page, text, options = {}) {
    const words = text.split(' ');

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // 20% chance of making a mistake
      if (Math.random() < 0.2 && word.length > 3) {
        // Type wrong letter
        const wrongPos = Math.floor(Math.random() * word.length);
        const wrongChar = String.fromCharCode(97 + Math.floor(Math.random() * 26));
        const wrongWord = word.slice(0, wrongPos) + wrongChar + word.slice(wrongPos + 1);

        await page.keyboard.type(wrongWord, { delay: 100 });
        await this._randomDelay(200, 500);

        // Delete and retype
        for (let j = 0; j < wrongWord.length; j++) {
          await page.keyboard.press('Backspace');
          await this._randomDelay(50, 100);
        }

        await page.keyboard.type(word, { delay: 100 });
      } else {
        await page.keyboard.type(word, { delay: 100 });
      }

      // Add space between words
      if (i < words.length - 1) {
        await page.keyboard.press('Space');
        await this._randomDelay(100, 300);
      }
    }
  }

  /**
   * Scroll with random stops
   * @private
   */
  async _scrollWithStops(page, direction = 'down') {
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const steps = Math.floor(scrollHeight / viewportHeight);

    for (let i = 0; i < steps; i++) {
      await page.evaluate((dir, vh) => {
        window.scrollBy(0, dir === 'down' ? vh : -vh);
      }, direction, viewportHeight);

      await this._randomDelay(500, 1500);

      // Random back scroll
      if (this.config.humanBehavior.scrolling.backScroll && Math.random() < 0.1) {
        await page.evaluate(() => window.scrollBy(0, -100));
        await this._randomDelay(200, 500);
      }
    }
  }

  /**
   * Random delay helper
   * @private
   */
  async _randomDelay(min, max) {
    const delay = min + Math.random() * (max - min);
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Farm cookies for a session
   * @param {string} sessionId - Session identifier
   * @returns {Promise<void>}
   */
  async farmCookies(sessionId) {
    if (!this.cookieManager) {
      throw new PluginError('Cookie manager not initialized', {
        pluginName: 'PuppeteerPlugin',
        operation: 'farmCookies',
        statusCode: 500,
        retriable: false,
        suggestion: 'Enable cookieManager during plugin initialization before calling farmCookies.'
      });
    }

    return await this.cookieManager.farmCookies(sessionId);
  }

  /**
   * Get cookie pool statistics
   * @returns {Promise<Object>}
   */
  async getCookieStats() {
    if (!this.cookieManager) {
      throw new PluginError('Cookie manager not initialized', {
        pluginName: 'PuppeteerPlugin',
        operation: 'getCookieStats',
        statusCode: 500,
        retriable: false,
        suggestion: 'Ensure cookieManager is configured before requesting cookie stats.'
      });
    }

    return await this.cookieManager.getStats();
  }

  /**
   * Get proxy pool statistics
   * @returns {Array}
   */
  getProxyStats() {
    if (!this.proxyManager) {
      throw new PluginError('Proxy manager not initialized', {
        pluginName: 'PuppeteerPlugin',
        operation: 'getProxyStats',
        statusCode: 500,
        retriable: false,
        suggestion: 'Configure proxyManager before attempting to read proxy statistics.'
      });
    }

    return this.proxyManager.getProxyStats();
  }

  /**
   * Get session-proxy bindings
   * @returns {Array}
   */
  getSessionProxyBindings() {
    if (!this.proxyManager) {
      throw new PluginError('Proxy manager not initialized', {
        pluginName: 'PuppeteerPlugin',
        operation: 'getSessionProxyBindings',
        statusCode: 500,
        retriable: false,
        suggestion: 'Initialize proxyManager before retrieving session-proxy bindings.'
      });
    }

    return this.proxyManager.getSessionBindings();
  }

  /**
   * Check health of all proxies
   * @returns {Promise<Object>}
   */
  async checkProxyHealth() {
    if (!this.proxyManager) {
      throw new PluginError('Proxy manager not initialized', {
        pluginName: 'PuppeteerPlugin',
        operation: 'checkProxyHealth',
        statusCode: 500,
        retriable: false,
        suggestion: 'Set up proxyManager before running health checks.'
      });
    }

    return await this.proxyManager.checkAllProxies();
  }
}

export default PuppeteerPlugin;
