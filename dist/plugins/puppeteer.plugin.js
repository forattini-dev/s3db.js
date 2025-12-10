import { Plugin } from './plugin.class.js';
import { requirePluginDependency } from './concerns/plugin-dependencies.js';
import { resolveResourceNames } from './concerns/resource-names.js';
import { getValidatedNamespace } from './namespace.js';
import tryFn from '../concerns/try-fn.js';
import { PluginError } from '../errors.js';
export class PuppeteerPlugin extends Plugin {
    _resourceDescriptors;
    resourceNames;
    browserPool;
    tabPool;
    browserIdleTimers;
    dedicatedBrowsers;
    puppeteer;
    UserAgent;
    createGhostCursor;
    cookieManager;
    proxyManager;
    performanceManager;
    networkMonitor;
    consoleMonitor;
    storageManager;
    antiBotDetector;
    webrtcStreamsDetector;
    initialized;
    constructor(options = {}) {
        super(options);
        this.namespace = getValidatedNamespace(options, '');
        this.config = {
            logLevel: this.logLevel,
            pool: {
                enabled: true,
                maxBrowsers: 5,
                maxTabsPerBrowser: 10,
                reuseTab: false,
                closeOnIdle: true,
                idleTimeout: 300000,
                ...options.pool
            },
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
            viewport: {
                width: 1920,
                height: 1080,
                deviceScaleFactor: 1,
                randomize: true,
                presets: ['desktop', 'laptop', 'tablet'],
                ...options.viewport
            },
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
            stealth: {
                enabled: true,
                enableEvasions: true,
                ...options.stealth
            },
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
                        maxAge: 86400000,
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
            networkMonitor: {
                enabled: false,
                persist: false,
                filters: {
                    types: null,
                    statuses: null,
                    minSize: null,
                    maxSize: null,
                    saveErrors: true,
                    saveLargeAssets: true,
                    ...options.networkMonitor?.filters
                },
                compression: {
                    enabled: true,
                    threshold: 10240,
                    ...options.networkMonitor?.compression
                },
                ...options.networkMonitor
            },
            consoleMonitor: {
                enabled: false,
                persist: false,
                filters: {
                    levels: null,
                    excludePatterns: [],
                    includeStackTraces: true,
                    includeSourceLocation: true,
                    captureNetwork: false,
                    ...options.consoleMonitor?.filters
                },
                ...options.consoleMonitor
            },
            screenshot: {
                fullPage: false,
                type: 'png',
                ...options.screenshot
            },
            proxy: {
                enabled: false,
                list: [],
                selectionStrategy: 'round-robin',
                bypassList: [],
                healthCheck: {
                    enabled: true,
                    interval: 300000,
                    testUrl: 'https://www.google.com',
                    timeout: 10000,
                    successRateThreshold: 0.3
                },
                server: null,
                username: null,
                password: null,
                ...options.proxy
            },
            retries: {
                enabled: true,
                maxAttempts: 3,
                backoff: 'exponential',
                initialDelay: 1000,
                ...options.retries
            },
            debug: {
                enabled: false,
                screenshots: false,
                console: false,
                network: false,
                ...options.debug
            }
        };
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
        if (this.config.cookies && !this.config.cookies.storage) {
            this.config.cookies.storage = {
                resource: this.resourceNames.cookies,
                autoSave: true,
                autoLoad: true,
                encrypt: true
            };
        }
        else if (this.config.cookies && this.config.cookies.storage) {
            this.config.cookies.storage.resource = this.resourceNames.cookies;
        }
        if (this.config.proxy && !this.config.proxy.selectionStrategy) {
            this.config.proxy.selectionStrategy = 'round-robin';
        }
        this.browserPool = [];
        this.tabPool = new Map();
        this.browserIdleTimers = new Map();
        this.dedicatedBrowsers = new Set();
        this.UserAgent = null;
        this.cookieManager = null;
        this.proxyManager = null;
        this.performanceManager = null;
        this.networkMonitor = null;
        this.consoleMonitor = null;
        this.storageManager = null;
        this.antiBotDetector = null;
        this.webrtcStreamsDetector = null;
        this.initialized = false;
        if (this.config.pool.reuseTab) {
            this.emit('puppeteer.configWarning', {
                setting: 'pool.reuseTab',
                message: 'pool.reuseTab is not supported yet and will be ignored.'
            });
        }
        if (options.proxy?.server || options.proxy?.username || options.proxy?.password) {
            this.logger.warn('[PuppeteerPlugin] DEPRECATED: The single proxy config (server, username, password) is deprecated. ' +
                'Use the proxy.list array with proxy objects instead. Example: proxy: { list: [{ proxy: "http://host:port", username: "user", password: "pass" }] }. ' +
                'This will be removed in v17.0.');
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
    async onInstall() {
        requirePluginDependency('puppeteer', this.name);
        requirePluginDependency('puppeteer-extra', this.name);
        requirePluginDependency('puppeteer-extra-plugin-stealth', this.name);
        requirePluginDependency('user-agents', this.name);
        requirePluginDependency('ghost-cursor', this.name);
        if (this.config.cookies.enabled) {
            await this._setupCookieStorage();
        }
        this.emit('puppeteer.installed');
    }
    async onStart() {
        if (this.initialized)
            return;
        await this._importDependencies();
        if (this.config.cookies.enabled) {
            await this._initializeCookieManager();
        }
        if (this.config.proxy.enabled) {
            await this._initializeProxyManager();
        }
        await this._initializePerformanceManager();
        if (this.config.networkMonitor.enabled) {
            await this._initializeNetworkMonitor();
        }
        if (this.config.consoleMonitor.enabled) {
            await this._initializeConsoleMonitor();
        }
        if (this.config.pool.enabled) {
            await this._warmupBrowserPool();
        }
        this.initialized = true;
        this.emit('puppeteer.started');
    }
    async onStop() {
        await this._closeBrowserPool();
        await this._closeDedicatedBrowsers();
        this.initialized = false;
        this.emit('puppeteer.stopped');
    }
    async onUninstall(_options = {}) {
        await this.onStop();
        this.emit('puppeteer.uninstalled');
    }
    async _importDependencies() {
        const puppeteerModule = await import('puppeteer-extra');
        const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
        // @ts-ignore - user-agents doesn't have type definitions
        const UserAgent = (await import('user-agents')).default;
        const { createCursor } = await import('ghost-cursor');
        this.puppeteer = (puppeteerModule.default || puppeteerModule);
        if (this.config.stealth.enabled) {
            this.puppeteer.use(StealthPlugin());
        }
        if (this.config.userAgent.enabled && this.config.userAgent.random) {
            this.UserAgent = UserAgent;
        }
        this.createGhostCursor = createCursor;
    }
    async _setupCookieStorage() {
        const resourceName = this.config.cookies.storage.resource;
        try {
            await this.database.getResource(resourceName);
            return;
        }
        catch {
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
    async _initializeProxyManager() {
        const { ProxyManager } = await import('./puppeteer/proxy-manager.js');
        this.proxyManager = new ProxyManager(this);
        await this.proxyManager.initialize();
    }
    async _initializeCookieManager() {
        const { CookieManager } = await import('./puppeteer/cookie-manager.js');
        this.cookieManager = new CookieManager(this);
        await this.cookieManager.initialize();
    }
    async _initializePerformanceManager() {
        const { PerformanceManager } = await import('./puppeteer/performance-manager.js');
        this.performanceManager = new PerformanceManager(this);
        this.emit('puppeteer.performanceManager.initialized');
    }
    async _initializeNetworkMonitor() {
        const { NetworkMonitor } = await import('./puppeteer/network-monitor.js');
        this.networkMonitor = new NetworkMonitor(this);
        if (this.config.networkMonitor.persist) {
            await this.networkMonitor.initialize();
        }
        this.emit('puppeteer.networkMonitor.initialized');
    }
    async _initializeConsoleMonitor() {
        const { ConsoleMonitor } = await import('./puppeteer/console-monitor.js');
        this.consoleMonitor = new ConsoleMonitor(this);
        if (this.config.consoleMonitor.persist) {
            await this.consoleMonitor.initialize();
        }
        this.emit('puppeteer.consoleMonitor.initialized');
        const { captureLocalStorage, captureSessionStorage, captureIndexedDB, captureAllStorage } = await import('./puppeteer/storage-manager.js');
        this.storageManager = {
            captureLocalStorage,
            captureSessionStorage,
            captureIndexedDB,
            captureAllStorage
        };
        const { detectAntiBotServices, detectFingerprinting, detectBlockingSignals, detectAntiBotsAndFingerprinting } = await import('./puppeteer/anti-bot-detector.js');
        this.antiBotDetector = {
            detectAntiBotServices,
            detectFingerprinting,
            detectBlockingSignals,
            detectAntiBotsAndFingerprinting
        };
        const { detectWebRTC, detectMediaStreams, detectStreamingProtocols, detectWebRTCAndStreams } = await import('./puppeteer/webrtc-streams-detector.js');
        this.webrtcStreamsDetector = {
            detectWebRTC,
            detectMediaStreams,
            detectStreamingProtocols,
            detectWebRTCAndStreams
        };
    }
    async _warmupBrowserPool() {
        const poolSize = Math.min(this.config.pool.maxBrowsers, 2);
        for (let i = 0; i < poolSize; i++) {
            await this._createBrowser();
        }
        this.emit('puppeteer.poolWarmed', { size: this.browserPool.length });
    }
    async _createBrowser(proxy = null) {
        const launchOptions = {
            ...this.config.launch,
            args: [...(this.config.launch.args || [])]
        };
        if (proxy && this.proxyManager) {
            const proxyArgs = this.proxyManager.getProxyLaunchArgs(proxy);
            launchOptions.args.push(...proxyArgs);
        }
        else if (this.config.proxy.enabled && this.config.proxy.server) {
            launchOptions.args.push(`--proxy-server=${this.config.proxy.server}`);
        }
        const browser = await this.puppeteer.launch(launchOptions);
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
    async _getBrowser(proxy = null) {
        if (proxy) {
            return await this._createBrowser(proxy);
        }
        if (this.config.pool.enabled) {
            for (const browser of this.browserPool) {
                const tabs = this.tabPool.get(browser);
                if (!tabs || tabs.size < this.config.pool.maxTabsPerBrowser) {
                    return browser;
                }
            }
            if (this.browserPool.length < this.config.pool.maxBrowsers) {
                return await this._createBrowser();
            }
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
        }
        else {
            return await this._createBrowser();
        }
    }
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
                        if (typeof page.isClosed === 'function' && page.isClosed()) {
                            continue;
                        }
                        try {
                            await this.cookieManager.saveSession(page, page._sessionId, {
                                success: !!page._navigationSuccess
                            });
                            page._sessionSaved = true;
                        }
                        catch (err) {
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
            }
            catch {
                // Ignore errors during cleanup
            }
        }
        this.browserPool = [];
        this.tabPool.clear();
    }
    _clearIdleTimer(browser) {
        const timer = this.browserIdleTimers.get(browser);
        if (timer) {
            clearTimeout(timer);
            this.browserIdleTimers.delete(browser);
        }
    }
    _scheduleIdleCloseIfNeeded(browser) {
        if (!this.config.pool.closeOnIdle)
            return;
        const tabs = this.tabPool.get(browser);
        if (!tabs || tabs.size > 0)
            return;
        if (this.browserIdleTimers.has(browser))
            return;
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
    async _retireIdleBrowser(browser) {
        this.tabPool.delete(browser);
        const index = this.browserPool.indexOf(browser);
        if (index > -1) {
            this.browserPool.splice(index, 1);
        }
        try {
            await browser.close();
            this.emit('puppeteer.browserRetired', { pooled: true });
        }
        catch (err) {
            this.emit('puppeteer.browserRetiredError', {
                pooled: true,
                error: err.message
            });
        }
    }
    async _closeDedicatedBrowsers() {
        for (const browser of Array.from(this.dedicatedBrowsers)) {
            try {
                await browser.close();
            }
            catch {
                // Ignore errors during cleanup
            }
            finally {
                this.dedicatedBrowsers.delete(browser);
            }
        }
    }
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
    _generateViewport() {
        if (!this.config.viewport.randomize) {
            return {
                width: this.config.viewport.width,
                height: this.config.viewport.height,
                deviceScaleFactor: this.config.viewport.deviceScaleFactor
            };
        }
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
        const categories = this.config.viewport.presets || ['desktop'];
        const availablePresets = categories.flatMap(cat => presets[cat] || []);
        return availablePresets[Math.floor(Math.random() * availablePresets.length)];
    }
    async navigate(url, options = {}) {
        const { useSession = null, screenshot = false, waitUntil = 'networkidle2', timeout = 30000 } = options;
        let proxy = null;
        let proxyId = null;
        if (useSession && this.proxyManager) {
            proxy = this.proxyManager.getProxyForSession(useSession, true);
            proxyId = proxy?.id || null;
        }
        const browser = await this._getBrowser(proxy);
        const page = await browser.newPage();
        const isPooledBrowser = !proxy && this.config.pool.enabled;
        if (isPooledBrowser) {
            const tabs = this.tabPool.get(browser);
            if (tabs) {
                tabs.add(page);
                this._clearIdleTimer(browser);
            }
        }
        else {
            this.dedicatedBrowsers.add(browser);
            browser.once('disconnected', () => {
                this.dedicatedBrowsers.delete(browser);
            });
        }
        if (proxy && this.proxyManager) {
            await this.proxyManager.authenticateProxy(page, proxy);
        }
        const viewport = this._generateViewport();
        await page.setViewport(viewport);
        const userAgent = this._generateUserAgent();
        if (userAgent) {
            await page.setUserAgent(userAgent);
        }
        if (this.config.performance.blockResources.enabled) {
            await page.setRequestInterception(true);
            page.on('request', (request) => {
                const req = request;
                if (this.config.performance.blockResources.types.includes(req.resourceType())) {
                    req.abort();
                }
                else {
                    req.continue();
                }
            });
        }
        if (useSession && this.cookieManager) {
            await this.cookieManager.loadSession(page, useSession);
        }
        let cursor = null;
        if (this.config.humanBehavior.enabled && this.config.humanBehavior.mouse.enabled) {
            cursor = this.createGhostCursor(page);
        }
        let navigationSuccess = false;
        try {
            await page.goto(url, { waitUntil, timeout });
            navigationSuccess = true;
            if (proxyId && this.proxyManager) {
                this.proxyManager.recordProxyUsage(proxyId, true);
            }
        }
        catch (err) {
            if (proxyId && this.proxyManager) {
                this.proxyManager.recordProxyUsage(proxyId, false);
            }
            throw err;
        }
        if (screenshot) {
            const screenshotBuffer = await page.screenshot(this.config.screenshot);
            page._screenshot = screenshotBuffer;
        }
        page._cursor = cursor || undefined;
        page._userAgent = userAgent || undefined;
        page._viewport = viewport;
        page._proxyId = proxyId;
        page._sessionId = useSession;
        page._navigationSuccess = navigationSuccess;
        page._sessionSaved = false;
        if (this.config.humanBehavior.enabled) {
            this._attachHumanBehaviorMethods(page);
        }
        let hasSavedSession = false;
        let browserClosed = false;
        const originalClose = page.close?.bind(page) || (async () => { });
        const shouldAutoCloseBrowser = !isPooledBrowser;
        page.on('close', () => {
            if (isPooledBrowser) {
                const tabs = this.tabPool.get(browser);
                tabs?.delete(page);
                this._scheduleIdleCloseIfNeeded(browser);
            }
            else {
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
                }
                catch (err) {
                    this.emit('puppeteer.cookieSaveFailed', {
                        sessionId: useSession,
                        error: err.message
                    });
                    page._sessionSaved = true;
                }
                finally {
                    hasSavedSession = true;
                }
            }
            try {
                await originalClose(...closeArgs);
            }
            finally {
                if (isPooledBrowser) {
                    const tabs = this.tabPool.get(browser);
                    tabs?.delete(page);
                    this._scheduleIdleCloseIfNeeded(browser);
                }
                else if (shouldAutoCloseBrowser && !browserClosed) {
                    try {
                        await browser.close();
                        this.emit('puppeteer.browserClosed', { pooled: false });
                    }
                    catch (err) {
                        this.emit('puppeteer.browserCloseFailed', {
                            pooled: false,
                            error: err.message
                        });
                    }
                    finally {
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
    async withSession(sessionId, handler, options) {
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
        }
        catch (err) {
            handlerError = err;
            throw err;
        }
        finally {
            try {
                await page.close();
            }
            catch (err) {
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
    _attachHumanBehaviorMethods(page) {
        page.humanClick = async (selector, _options = {}) => {
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
                await page._cursor.moveTo(selector);
                await page._cursor.click();
            }
            else {
                await element.click();
            }
        };
        page.humanMoveTo = async (selector, _options = {}) => {
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
        page.humanType = async (selector, text, _options = {}) => {
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
                await this._typeWithMistakes(page, text);
            }
            else {
                const [min, max] = this.config.humanBehavior.typing.delayRange;
                await page.type(selector, text, {
                    delay: min + Math.random() * (max - min)
                });
            }
        };
        page.humanScroll = async (options = {}) => {
            const { distance = null, direction = 'down' } = options;
            if (distance) {
                await page.evaluate(((dist, dir) => {
                    window.scrollBy(0, dir === 'down' ? dist : -dist);
                }), distance, direction);
            }
            else {
                await this._scrollWithStops(page, direction);
            }
        };
    }
    async _typeWithMistakes(page, text) {
        const words = text.split(' ');
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if (Math.random() < 0.2 && word.length > 3) {
                const wrongPos = Math.floor(Math.random() * word.length);
                const wrongChar = String.fromCharCode(97 + Math.floor(Math.random() * 26));
                const wrongWord = word.slice(0, wrongPos) + wrongChar + word.slice(wrongPos + 1);
                await page.keyboard.type(wrongWord, { delay: 100 });
                await this._randomDelay(200, 500);
                for (let j = 0; j < wrongWord.length; j++) {
                    await page.keyboard.press('Backspace');
                    await this._randomDelay(50, 100);
                }
                await page.keyboard.type(word, { delay: 100 });
            }
            else {
                await page.keyboard.type(word, { delay: 100 });
            }
            if (i < words.length - 1) {
                await page.keyboard.press('Space');
                await this._randomDelay(100, 300);
            }
        }
    }
    async _scrollWithStops(page, direction = 'down') {
        const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
        const viewportHeight = await page.evaluate(() => window.innerHeight);
        const steps = Math.floor(scrollHeight / viewportHeight);
        for (let i = 0; i < steps; i++) {
            await page.evaluate(((dir, vh) => {
                window.scrollBy(0, dir === 'down' ? vh : -vh);
            }), direction, viewportHeight);
            await this._randomDelay(500, 1500);
            if (this.config.humanBehavior.scrolling.backScroll && Math.random() < 0.1) {
                await page.evaluate(() => window.scrollBy(0, -100));
                await this._randomDelay(200, 500);
            }
        }
    }
    async _randomDelay(min, max) {
        const delay = min + Math.random() * (max - min);
        return new Promise(resolve => setTimeout(resolve, delay));
    }
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
    async captureAllStorage(page) {
        if (!this.storageManager) {
            throw new PluginError('Storage manager not initialized', {
                pluginName: 'PuppeteerPlugin',
                operation: 'captureAllStorage',
                statusCode: 500,
                retriable: false,
                suggestion: 'Ensure plugin is fully initialized before capturing storage.'
            });
        }
        return await this.storageManager.captureAllStorage(page);
    }
    async captureLocalStorage(page) {
        if (!this.storageManager) {
            throw new PluginError('Storage manager not initialized', {
                pluginName: 'PuppeteerPlugin',
                operation: 'captureLocalStorage',
                statusCode: 500,
                retriable: false,
                suggestion: 'Ensure plugin is fully initialized before capturing storage.'
            });
        }
        return await this.storageManager.captureLocalStorage(page);
    }
    async captureSessionStorage(page) {
        if (!this.storageManager) {
            throw new PluginError('Storage manager not initialized', {
                pluginName: 'PuppeteerPlugin',
                operation: 'captureSessionStorage',
                statusCode: 500,
                retriable: false,
                suggestion: 'Ensure plugin is fully initialized before capturing storage.'
            });
        }
        return await this.storageManager.captureSessionStorage(page);
    }
    async captureIndexedDB(page) {
        if (!this.storageManager) {
            throw new PluginError('Storage manager not initialized', {
                pluginName: 'PuppeteerPlugin',
                operation: 'captureIndexedDB',
                statusCode: 500,
                retriable: false,
                suggestion: 'Ensure plugin is fully initialized before capturing storage.'
            });
        }
        return await this.storageManager.captureIndexedDB(page);
    }
    async detectAntiBotServices(page) {
        if (!this.antiBotDetector) {
            throw new PluginError('Anti-bot detector not initialized', {
                pluginName: 'PuppeteerPlugin',
                operation: 'detectAntiBotServices',
                statusCode: 500,
                retriable: false,
                suggestion: 'Ensure plugin is fully initialized before detecting anti-bot services.'
            });
        }
        return await this.antiBotDetector.detectAntiBotServices(page);
    }
    async detectFingerprinting(page) {
        if (!this.antiBotDetector) {
            throw new PluginError('Anti-bot detector not initialized', {
                pluginName: 'PuppeteerPlugin',
                operation: 'detectFingerprinting',
                statusCode: 500,
                retriable: false,
                suggestion: 'Ensure plugin is fully initialized before detecting fingerprinting.'
            });
        }
        return await this.antiBotDetector.detectFingerprinting(page);
    }
    async detectAntiBotsAndFingerprinting(page) {
        if (!this.antiBotDetector) {
            throw new PluginError('Anti-bot detector not initialized', {
                pluginName: 'PuppeteerPlugin',
                operation: 'detectAntiBotsAndFingerprinting',
                statusCode: 500,
                retriable: false,
                suggestion: 'Ensure plugin is fully initialized before detecting anti-bot and fingerprinting.'
            });
        }
        return await this.antiBotDetector.detectAntiBotsAndFingerprinting(page);
    }
    async detectWebRTC(page) {
        if (!this.webrtcStreamsDetector) {
            throw new PluginError('WebRTC/Streams detector not initialized', {
                pluginName: 'PuppeteerPlugin',
                operation: 'detectWebRTC',
                statusCode: 500,
                retriable: false,
                suggestion: 'Ensure plugin is fully initialized before detecting WebRTC.'
            });
        }
        return await this.webrtcStreamsDetector.detectWebRTC(page);
    }
    async detectMediaStreams(page) {
        if (!this.webrtcStreamsDetector) {
            throw new PluginError('WebRTC/Streams detector not initialized', {
                pluginName: 'PuppeteerPlugin',
                operation: 'detectMediaStreams',
                statusCode: 500,
                retriable: false,
                suggestion: 'Ensure plugin is fully initialized before detecting media streams.'
            });
        }
        return await this.webrtcStreamsDetector.detectMediaStreams(page);
    }
    async detectStreamingProtocols(page) {
        if (!this.webrtcStreamsDetector) {
            throw new PluginError('WebRTC/Streams detector not initialized', {
                pluginName: 'PuppeteerPlugin',
                operation: 'detectStreamingProtocols',
                statusCode: 500,
                retriable: false,
                suggestion: 'Ensure plugin is fully initialized before detecting streaming protocols.'
            });
        }
        return await this.webrtcStreamsDetector.detectStreamingProtocols(page);
    }
    async detectWebRTCAndStreams(page) {
        if (!this.webrtcStreamsDetector) {
            throw new PluginError('WebRTC/Streams detector not initialized', {
                pluginName: 'PuppeteerPlugin',
                operation: 'detectWebRTCAndStreams',
                statusCode: 500,
                retriable: false,
                suggestion: 'Ensure plugin is fully initialized before detecting WebRTC and streaming.'
            });
        }
        return await this.webrtcStreamsDetector.detectWebRTCAndStreams(page);
    }
}
export default PuppeteerPlugin;
//# sourceMappingURL=puppeteer.plugin.js.map