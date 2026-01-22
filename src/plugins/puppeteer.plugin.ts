import { Plugin } from './plugin.class.js';
import { requirePluginDependency } from './concerns/plugin-dependencies.js';
import { resolveResourceNames } from './concerns/resource-names.js';
import { getValidatedNamespace } from './namespace.js';
import tryFn from '../concerns/try-fn.js';
import { PluginError } from '../errors.js';
import type { CookieManager, CookieStats } from './puppeteer/cookie-manager.js';
import type { ProxyManager, ProxyConfig, ProxyStatResult, SessionBinding, HealthCheckResult } from './puppeteer/proxy-manager.js';
import type { PerformanceManager, PerformanceReport, ComparisonResult } from './puppeteer/performance-manager.js';
import type { NetworkMonitor, NetworkStats, NetworkSession } from './puppeteer/network-monitor.js';
import type { ConsoleMonitor, ConsoleStats, ConsoleSession } from './puppeteer/console-monitor.js';
import type {
  captureLocalStorage as CaptureLocalStorageFn,
  captureSessionStorage as CaptureSessionStorageFn,
  captureIndexedDB as CaptureIndexedDBFn,
  captureAllStorage as CaptureAllStorageFn,
  StorageData,
  IndexedDBResult,
  AllStorageResult
} from './puppeteer/storage-manager.js';
import type {
  detectAntiBotServices as DetectAntiBotServicesFn,
  detectFingerprinting as DetectFingerprintingFn,
  detectBlockingSignals as DetectBlockingSignalsFn,
  detectAntiBotsAndFingerprinting as DetectAntiBotsAndFingerprintingFn,
  AntiBotDetectionResult,
  FingerprintingResult,
  BlockingSignalsResult,
  AntiBotAndFingerprintingResult
} from './puppeteer/anti-bot-detector.js';
import type {
  detectWebRTC as DetectWebRTCFn,
  detectMediaStreams as DetectMediaStreamsFn,
  detectStreamingProtocols as DetectStreamingProtocolsFn,
  detectWebRTCAndStreams as DetectWebRTCAndStreamsFn,
  WebRTCDetectionResult,
  MediaStreamsDetectionResult,
  StreamingProtocolsDetectionResult,
  WebRTCAndStreamsResult
} from './puppeteer/webrtc-streams-detector.js';

export interface PoolConfig {
  enabled: boolean;
  maxBrowsers: number;
  maxTabsPerBrowser: number;
  reuseTab: boolean;
  closeOnIdle: boolean;
  idleTimeout: number;
}

export interface LaunchConfig {
  headless: boolean;
  args: string[];
  ignoreHTTPSErrors: boolean;
}

export interface ViewportConfig {
  width: number;
  height: number;
  deviceScaleFactor: number;
  randomize: boolean;
  presets: string[];
}

export interface UserAgentFilters {
  deviceCategory: string;
}

export interface UserAgentConfig {
  enabled: boolean;
  random: boolean;
  filters: UserAgentFilters;
  custom: string | null;
}

export interface StealthConfig {
  enabled: boolean;
  enableEvasions: boolean;
}

export interface MouseConfig {
  enabled: boolean;
  bezierCurves: boolean;
  overshoot: boolean;
  jitter: boolean;
  pathThroughElements: boolean;
}

export interface TypingConfig {
  enabled: boolean;
  mistakes: boolean;
  corrections: boolean;
  pauseAfterWord: boolean;
  speedVariation: boolean;
  delayRange: [number, number];
}

export interface ScrollingConfig {
  enabled: boolean;
  randomStops: boolean;
  backScroll: boolean;
  horizontalJitter: boolean;
}

export interface HumanBehaviorConfig {
  enabled: boolean;
  mouse: MouseConfig;
  typing: TypingConfig;
  scrolling: ScrollingConfig;
}

export interface CookieStorageConfig {
  resource: string;
  autoSave: boolean;
  autoLoad: boolean;
  encrypt: boolean;
}

export interface CookieWarmupConfig {
  enabled: boolean;
  pages: string[];
  randomOrder: boolean;
  timePerPage: { min: number; max: number };
  interactions: { scroll: boolean; click: boolean; hover: boolean };
}

export interface CookieRotationConfig {
  enabled: boolean;
  requestsPerCookie: number;
  maxAge: number;
  poolSize: number;
}

export interface CookieReputationConfig {
  enabled: boolean;
  trackSuccess: boolean;
  retireThreshold: number;
  ageBoost: boolean;
}

export interface CookieFarmingConfig {
  enabled: boolean;
  warmup: CookieWarmupConfig;
  rotation: CookieRotationConfig;
  reputation: CookieReputationConfig;
}

export interface CookiesConfig {
  enabled: boolean;
  storage: CookieStorageConfig;
  farming: CookieFarmingConfig;
}

export interface BlockResourcesConfig {
  enabled: boolean;
  types: string[];
}

export interface PerformanceConfig {
  blockResources: BlockResourcesConfig;
  cacheEnabled: boolean;
  javascriptEnabled: boolean;
}

export interface NetworkFiltersConfig {
  types: string[] | null;
  statuses: number[] | null;
  minSize: number | null;
  maxSize: number | null;
  saveErrors: boolean;
  saveLargeAssets: boolean;
}

export interface NetworkCompressionConfig {
  enabled: boolean;
  threshold: number;
}

export interface NetworkMonitorConfig {
  enabled: boolean;
  persist: boolean;
  filters: NetworkFiltersConfig;
  compression: NetworkCompressionConfig;
}

export interface ConsoleFiltersConfig {
  levels: string[] | null;
  excludePatterns: string[];
  includeStackTraces: boolean;
  includeSourceLocation: boolean;
  captureNetwork: boolean;
}

export interface ConsoleMonitorConfig {
  enabled: boolean;
  persist: boolean;
  filters: ConsoleFiltersConfig;
}

export interface ScreenshotConfig {
  fullPage: boolean;
  type: 'png' | 'jpeg' | 'webp';
}

export interface ProxyHealthCheckConfig {
  enabled: boolean;
  interval: number;
  testUrl: string;
  timeout: number;
  successRateThreshold: number;
}

export interface ProxyPluginConfig {
  enabled: boolean;
  list: (string | Partial<ProxyConfig>)[];
  selectionStrategy: 'round-robin' | 'random' | 'least-used' | 'best-performance';
  bypassList: string[];
  healthCheck: ProxyHealthCheckConfig;
}

export interface RetriesConfig {
  enabled: boolean;
  maxAttempts: number;
  backoff: 'exponential' | 'linear' | 'fixed';
  initialDelay: number;
}

export interface DebugConfig {
  enabled: boolean;
  screenshots: boolean;
  console: boolean;
  network: boolean;
}

export interface PuppeteerPluginConfig {
  logLevel: string;
  pool: PoolConfig;
  launch: LaunchConfig;
  viewport: ViewportConfig;
  userAgent: UserAgentConfig;
  stealth: StealthConfig;
  humanBehavior: HumanBehaviorConfig;
  cookies: CookiesConfig;
  performance: PerformanceConfig;
  networkMonitor: NetworkMonitorConfig;
  consoleMonitor: ConsoleMonitorConfig;
  screenshot: ScreenshotConfig;
  proxy: ProxyPluginConfig;
  retries: RetriesConfig;
  debug: DebugConfig;
}

export interface PuppeteerPluginOptions extends Partial<PuppeteerPluginConfig> {
  resourceNames?: {
    cookies?: string;
    consoleSessions?: string;
    consoleMessages?: string;
    consoleErrors?: string;
    networkSessions?: string;
    networkRequests?: string;
    networkErrors?: string;
  };
}

export interface ResourceDescriptor {
  defaultName: string;
  override?: string;
}

export interface ResourceNames {
  cookies: string;
  consoleSessions: string;
  consoleMessages: string;
  consoleErrors: string;
  networkSessions: string;
  networkRequests: string;
  networkErrors: string;
}

export interface NavigateOptions {
  useSession?: string | null;
  screenshot?: boolean;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  timeout?: number;
}

export interface WithSessionOptions extends NavigateOptions {
  url: string;
}

export interface ViewportResult {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

interface GhostCursor {
  moveTo(selector: string): Promise<void>;
  move(position: { x: number; y: number }): Promise<void>;
  click(): Promise<void>;
}

interface ElementHandle {
  click(): Promise<void>;
  hover(): Promise<void>;
}

interface PageRequest {
  resourceType(): string;
  abort(): void;
  continue(): void;
}

interface PageKeyboard {
  type(text: string, options?: { delay?: number }): Promise<void>;
  press(key: string): Promise<void>;
}

interface Page {
  setViewport(viewport: ViewportResult): Promise<void>;
  setUserAgent(userAgent: string): Promise<void>;
  setRequestInterception(enabled: boolean): Promise<void>;
  on(event: string, handler: (arg: unknown) => void): void;
  once(event: string, handler: () => void): void;
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<void>;
  screenshot(options?: Record<string, unknown>): Promise<Buffer>;
  close(...args: unknown[]): Promise<void>;
  isClosed(): boolean;
  $(selector: string): Promise<ElementHandle | null>;
  type(selector: string, text: string, options?: { delay?: number }): Promise<void>;
  evaluate<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<T>;
  keyboard: PageKeyboard;

  _cursor?: GhostCursor;
  _userAgent?: string;
  _viewport?: ViewportResult;
  _proxyId?: string | null;
  _sessionId?: string | null;
  _navigationSuccess?: boolean;
  _sessionSaved?: boolean;
  _screenshot?: Buffer;

  humanClick?(selector: string, options?: Record<string, unknown>): Promise<void>;
  humanMoveTo?(selector: string, options?: Record<string, unknown>): Promise<void>;
  humanType?(selector: string, text: string, options?: Record<string, unknown>): Promise<void>;
  humanScroll?(options?: { distance?: number | null; direction?: 'up' | 'down' }): Promise<void>;
}

interface Browser {
  newPage(): Promise<Page>;
  close(): Promise<void>;
  on(event: string, handler: () => void): void;
  once(event: string, handler: () => void): void;
}

interface PuppeteerInstance {
  launch(options: Record<string, unknown>): Promise<Browser>;
  use(plugin: unknown): void;
}

interface UserAgentClass {
  new (filters?: Record<string, unknown>): { toString(): string };
}

type CreateCursorFn = (page: Page) => GhostCursor;

interface Database {
  createResource(config: Record<string, unknown>): Promise<unknown>;
  getResource(name: string): Promise<unknown>;
  resources?: Record<string, unknown>;
}

interface StorageManagerInstance {
  captureLocalStorage: typeof CaptureLocalStorageFn;
  captureSessionStorage: typeof CaptureSessionStorageFn;
  captureIndexedDB: typeof CaptureIndexedDBFn;
  captureAllStorage: typeof CaptureAllStorageFn;
}

interface AntiBotDetectorInstance {
  detectAntiBotServices: typeof DetectAntiBotServicesFn;
  detectFingerprinting: typeof DetectFingerprintingFn;
  detectBlockingSignals: typeof DetectBlockingSignalsFn;
  detectAntiBotsAndFingerprinting: typeof DetectAntiBotsAndFingerprintingFn;
}

interface WebRTCStreamsDetectorInstance {
  detectWebRTC: typeof DetectWebRTCFn;
  detectMediaStreams: typeof DetectMediaStreamsFn;
  detectStreamingProtocols: typeof DetectStreamingProtocolsFn;
  detectWebRTCAndStreams: typeof DetectWebRTCAndStreamsFn;
}

export class PuppeteerPlugin extends Plugin {
  declare namespace: string;
  declare config: PuppeteerPluginConfig;

  _resourceDescriptors: Record<string, ResourceDescriptor>;
  resourceNames: ResourceNames;

  browserPool: Browser[];
  tabPool: Map<Browser, Set<Page>>;
  browserIdleTimers: Map<Browser, ReturnType<typeof setTimeout>>;
  dedicatedBrowsers: Set<Browser>;

  puppeteer!: PuppeteerInstance;
  UserAgent: UserAgentClass | null;
  createGhostCursor!: CreateCursorFn;

  cookieManager: CookieManager | null;
  proxyManager: ProxyManager | null;
  performanceManager: PerformanceManager | null;
  networkMonitor: NetworkMonitor | null;
  consoleMonitor: ConsoleMonitor | null;
  storageManager: StorageManagerInstance | null;
  antiBotDetector: AntiBotDetectorInstance | null;
  webrtcStreamsDetector: WebRTCStreamsDetectorInstance | null;

  initialized: boolean;

  constructor(options: PuppeteerPluginOptions = {}) {
    super(options as any);

    this.namespace = getValidatedNamespace(options as any, '');

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
      } as UserAgentConfig,

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
      } as HumanBehaviorConfig,

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
      } as CookiesConfig,

      performance: {
        blockResources: {
          enabled: true,
          types: ['image', 'stylesheet', 'font', 'media'],
          ...options.performance?.blockResources
        },
        cacheEnabled: true,
        javascriptEnabled: true,
        ...options.performance
      } as PerformanceConfig,

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
      } as NetworkMonitorConfig,

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
      } as ConsoleMonitorConfig,

      screenshot: {
        fullPage: false,
        type: 'png',
        ...options.screenshot
      } as ScreenshotConfig,

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
        ...options.proxy
      } as ProxyPluginConfig,

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
    } else if (this.config.cookies && this.config.cookies.storage) {
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

  }

  _resolveResourceNames(): ResourceNames {
    return resolveResourceNames('puppeteer', this._resourceDescriptors, {
      namespace: this.namespace
    }) as unknown as ResourceNames;
  }

  override onNamespaceChanged(): void {
    this.resourceNames = this._resolveResourceNames();
    if (this.config?.cookies?.storage) {
      this.config.cookies.storage.resource = this.resourceNames.cookies;
    }
  }

  override async onInstall(): Promise<void> {
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

  override async onStart(): Promise<void> {
    if (this.initialized) return;

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

  override async onStop(): Promise<void> {
    await this._closeBrowserPool();
    await this._closeDedicatedBrowsers();
    this.initialized = false;
    this.emit('puppeteer.stopped');
  }

  override async onUninstall(_options: import('./plugin.class.js').UninstallOptions = {}): Promise<void> {
    await this.onStop();
    this.emit('puppeteer.uninstalled');
  }

  private async _importDependencies(): Promise<void> {
    const puppeteerModule = await import('puppeteer-extra');
    const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
    // @ts-ignore - user-agents doesn't have type definitions
    const UserAgent = ((await import('user-agents')) as any).default;
    const { createCursor } = await import('ghost-cursor');

    this.puppeteer = (puppeteerModule.default || puppeteerModule) as unknown as PuppeteerInstance;

    if (this.config.stealth.enabled) {
      this.puppeteer.use(StealthPlugin());
    }

    if (this.config.userAgent.enabled && this.config.userAgent.random) {
      this.UserAgent = UserAgent as unknown as UserAgentClass;
    }

    this.createGhostCursor = createCursor as unknown as CreateCursorFn;
  }

  private async _setupCookieStorage(): Promise<void> {
    const resourceName = this.config.cookies.storage.resource;

    try {
      await this.database.getResource(resourceName);
      return;
    } catch {
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

  private async _initializeProxyManager(): Promise<void> {
    const { ProxyManager } = await import('./puppeteer/proxy-manager.js');
    this.proxyManager = new ProxyManager(this);
    await this.proxyManager.initialize();
  }

  private async _initializeCookieManager(): Promise<void> {
    const { CookieManager } = await import('./puppeteer/cookie-manager.js');
    this.cookieManager = new CookieManager(this);
    await this.cookieManager.initialize();
  }

  private async _initializePerformanceManager(): Promise<void> {
    const { PerformanceManager } = await import('./puppeteer/performance-manager.js');
    this.performanceManager = new PerformanceManager(this);
    this.emit('puppeteer.performanceManager.initialized');
  }

  private async _initializeNetworkMonitor(): Promise<void> {
    const { NetworkMonitor } = await import('./puppeteer/network-monitor.js');
    this.networkMonitor = new NetworkMonitor(this);

    if (this.config.networkMonitor.persist) {
      await this.networkMonitor.initialize();
    }

    this.emit('puppeteer.networkMonitor.initialized');
  }

  private async _initializeConsoleMonitor(): Promise<void> {
    const { ConsoleMonitor } = await import('./puppeteer/console-monitor.js');
    this.consoleMonitor = new ConsoleMonitor(this);

    if (this.config.consoleMonitor.persist) {
      await this.consoleMonitor.initialize();
    }

    this.emit('puppeteer.consoleMonitor.initialized');

    const {
      captureLocalStorage,
      captureSessionStorage,
      captureIndexedDB,
      captureAllStorage
    } = await import('./puppeteer/storage-manager.js');
    this.storageManager = {
      captureLocalStorage,
      captureSessionStorage,
      captureIndexedDB,
      captureAllStorage
    };

    const {
      detectAntiBotServices,
      detectFingerprinting,
      detectBlockingSignals,
      detectAntiBotsAndFingerprinting
    } = await import('./puppeteer/anti-bot-detector.js');
    this.antiBotDetector = {
      detectAntiBotServices,
      detectFingerprinting,
      detectBlockingSignals,
      detectAntiBotsAndFingerprinting
    };

    const {
      detectWebRTC,
      detectMediaStreams,
      detectStreamingProtocols,
      detectWebRTCAndStreams
    } = await import('./puppeteer/webrtc-streams-detector.js');
    this.webrtcStreamsDetector = {
      detectWebRTC,
      detectMediaStreams,
      detectStreamingProtocols,
      detectWebRTCAndStreams
    };
  }

  private async _warmupBrowserPool(): Promise<void> {
    const poolSize = Math.min(this.config.pool.maxBrowsers, 2);

    for (let i = 0; i < poolSize; i++) {
      await this._createBrowser();
    }

    this.emit('puppeteer.poolWarmed', { size: this.browserPool.length });
  }

  private async _createBrowser(proxy: ProxyConfig | null = null): Promise<Browser> {
    const launchOptions: Record<string, unknown> = {
      ...this.config.launch,
      args: [...(this.config.launch.args || [])]
    };

    if (proxy && this.proxyManager) {
      const proxyArgs = this.proxyManager.getProxyLaunchArgs(proxy);
      (launchOptions.args as string[]).push(...proxyArgs);
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

  private async _getBrowser(proxy: ProxyConfig | null = null): Promise<Browser> {
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

      let targetBrowser = this.browserPool[0]!;
      let minTabs = this.tabPool.get(targetBrowser)?.size || 0;

      for (const browser of this.browserPool.slice(1)) {
        const tabs = this.tabPool.get(browser)?.size || 0;
        if (tabs < minTabs) {
          targetBrowser = browser;
          minTabs = tabs;
        }
      }

      return targetBrowser!;
    } else {
      return await this._createBrowser();
    }
  }

  private async _closeBrowserPool(): Promise<void> {
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
              await this.cookieManager.saveSession(page as unknown as Parameters<CookieManager['saveSession']>[0], page._sessionId, {
                success: !!page._navigationSuccess
              });
              page._sessionSaved = true;
            } catch (err) {
              page._sessionSaved = true;
              this.emit('puppeteer.cookieSaveFailed', {
                sessionId: page._sessionId,
                error: (err as Error).message
              });
            }
          }
        }
      }

      try {
        await browser.close();
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.browserPool = [];
    this.tabPool.clear();
  }

  private _clearIdleTimer(browser: Browser): void {
    const timer = this.browserIdleTimers.get(browser);
    if (timer) {
      clearTimeout(timer);
      this.browserIdleTimers.delete(browser);
    }
  }

  private _scheduleIdleCloseIfNeeded(browser: Browser): void {
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

  private async _retireIdleBrowser(browser: Browser): Promise<void> {
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
        error: (err as Error).message
      });
    }
  }

  private async _closeDedicatedBrowsers(): Promise<void> {
    for (const browser of Array.from(this.dedicatedBrowsers)) {
      try {
        await browser.close();
      } catch {
        // Ignore errors during cleanup
      } finally {
        this.dedicatedBrowsers.delete(browser);
      }
    }
  }

  private _generateUserAgent(): string | null {
    if (this.config.userAgent.custom) {
      return this.config.userAgent.custom;
    }

    if (this.config.userAgent.random && this.UserAgent) {
      const userAgent = new this.UserAgent(this.config.userAgent.filters as any);
      return userAgent.toString();
    }

    return null;
  }

  private _generateViewport(): ViewportResult {
    if (!this.config.viewport.randomize) {
      return {
        width: this.config.viewport.width,
        height: this.config.viewport.height,
        deviceScaleFactor: this.config.viewport.deviceScaleFactor
      };
    }

    const presets: Record<string, ViewportResult[]> = {
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

    return availablePresets[Math.floor(Math.random() * availablePresets.length)]!;
  }

  async navigate(url: string, options: NavigateOptions = {}): Promise<Page> {
    const {
      useSession = null,
      screenshot = false,
      waitUntil = 'networkidle2',
      timeout = 30000
    } = options;

    let proxy: ProxyConfig | null = null;
    let proxyId: string | null = null;

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
    } else {
      this.dedicatedBrowsers.add(browser);
      browser.once('disconnected', () => {
        this.dedicatedBrowsers.delete(browser);
      });
    }

    if (proxy && this.proxyManager) {
      await this.proxyManager.authenticateProxy(page as unknown as Parameters<ProxyManager['authenticateProxy']>[0], proxy);
    }

    const viewport = this._generateViewport();
    await page.setViewport(viewport);

    const userAgent = this._generateUserAgent();
    if (userAgent) {
      await page.setUserAgent(userAgent);
    }

    if (this.config.performance.blockResources.enabled) {
      await page.setRequestInterception(true);
      page.on('request', (request: unknown) => {
        const req = request as PageRequest;
        if (this.config.performance.blockResources.types.includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });
    }

    if (useSession && this.cookieManager) {
      await this.cookieManager.loadSession(page as unknown as Parameters<CookieManager['loadSession']>[0], useSession);
    }

    let cursor: GhostCursor | null = null;
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
    } catch (err) {
      if (proxyId && this.proxyManager) {
        this.proxyManager.recordProxyUsage(proxyId, false);
      }
      throw err;
    }

    if (screenshot) {
      const screenshotBuffer = await page.screenshot(this.config.screenshot as any);
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

    page.close = async (...closeArgs: unknown[]): Promise<void> => {
      if (!hasSavedSession && useSession && this.cookieManager && !page._sessionSaved) {
        try {
          await this.cookieManager.saveSession(page as unknown as Parameters<CookieManager['saveSession']>[0], useSession, {
            success: navigationSuccess
          });
          page._sessionSaved = true;
        } catch (err) {
          this.emit('puppeteer.cookieSaveFailed', {
            sessionId: useSession,
            error: (err as Error).message
          });
          page._sessionSaved = true;
        } finally {
          hasSavedSession = true;
        }
      }

      try {
        await originalClose(...closeArgs);
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
              error: (err as Error).message
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

  async withSession<T>(
    sessionId: string,
    handler: (page: Page, plugin: PuppeteerPlugin) => Promise<T>,
    options: WithSessionOptions
  ): Promise<T> {
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

    let handlerError: Error | null = null;

    try {
      const result = await handler(page, this);
      return result;
    } catch (err) {
      handlerError = err as Error;
      throw err;
    } finally {
      try {
        await page.close();
      } catch (err) {
        this.emit('puppeteer.withSession.cleanupFailed', {
          sessionId,
          url,
          error: (err as Error).message
        });
      }

      this.emit('puppeteer.withSession.finish', {
        sessionId,
        url,
        error: handlerError ? handlerError.message : null
      });
    }
  }

  private _attachHumanBehaviorMethods(page: Page): void {
    page.humanClick = async (selector: string, _options: Record<string, unknown> = {}) => {
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
      } else {
        await element.click();
      }
    };

    page.humanMoveTo = async (selector: string, _options: Record<string, unknown> = {}) => {
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

    page.humanType = async (selector: string, text: string, _options: Record<string, unknown> = {}) => {
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
      } else {
        const [min, max] = this.config.humanBehavior.typing.delayRange;
        await page.type(selector, text, {
          delay: min + Math.random() * (max - min)
        });
      }
    };

    page.humanScroll = async (options: { distance?: number | null; direction?: 'up' | 'down' } = {}) => {
      const { distance = null, direction = 'down' } = options;

      if (distance) {
        await page.evaluate(((dist: number, dir: string) => {
          window.scrollBy(0, dir === 'down' ? dist : -dist);
        }) as (...args: unknown[]) => void, distance, direction);
      } else {
        await this._scrollWithStops(page, direction);
      }
    };
  }

  private async _typeWithMistakes(page: Page, text: string): Promise<void> {
    const words = text.split(' ');

    for (let i = 0; i < words.length; i++) {
      const word = words[i]!;

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
      } else {
        await page.keyboard.type(word, { delay: 100 });
      }

      if (i < words.length - 1) {
        await page.keyboard.press('Space');
        await this._randomDelay(100, 300);
      }
    }
  }

  private async _scrollWithStops(page: Page, direction: 'up' | 'down' = 'down'): Promise<void> {
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const steps = Math.floor(scrollHeight / viewportHeight);

    for (let i = 0; i < steps; i++) {
      await page.evaluate(((dir: string, vh: number) => {
        window.scrollBy(0, dir === 'down' ? vh : -vh);
      }) as (...args: unknown[]) => void, direction, viewportHeight);

      await this._randomDelay(500, 1500);

      if (this.config.humanBehavior.scrolling.backScroll && Math.random() < 0.1) {
        await page.evaluate(() => window.scrollBy(0, -100));
        await this._randomDelay(200, 500);
      }
    }
  }

  private async _randomDelay(min: number, max: number): Promise<void> {
    const delay = min + Math.random() * (max - min);
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  async farmCookies(sessionId: string): Promise<void> {
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

  async getCookieStats(): Promise<CookieStats> {
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

  getProxyStats(): ProxyStatResult[] {
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

  getSessionProxyBindings(): SessionBinding[] {
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

  async checkProxyHealth(): Promise<HealthCheckResult> {
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

  async captureAllStorage(page: Page): Promise<AllStorageResult> {
    if (!this.storageManager) {
      throw new PluginError('Storage manager not initialized', {
        pluginName: 'PuppeteerPlugin',
        operation: 'captureAllStorage',
        statusCode: 500,
        retriable: false,
        suggestion: 'Ensure plugin is fully initialized before capturing storage.'
      });
    }

    return await this.storageManager.captureAllStorage(page as unknown as Parameters<typeof CaptureAllStorageFn>[0]);
  }

  async captureLocalStorage(page: Page): Promise<StorageData> {
    if (!this.storageManager) {
      throw new PluginError('Storage manager not initialized', {
        pluginName: 'PuppeteerPlugin',
        operation: 'captureLocalStorage',
        statusCode: 500,
        retriable: false,
        suggestion: 'Ensure plugin is fully initialized before capturing storage.'
      });
    }

    return await this.storageManager.captureLocalStorage(page as unknown as Parameters<typeof CaptureLocalStorageFn>[0]);
  }

  async captureSessionStorage(page: Page): Promise<StorageData> {
    if (!this.storageManager) {
      throw new PluginError('Storage manager not initialized', {
        pluginName: 'PuppeteerPlugin',
        operation: 'captureSessionStorage',
        statusCode: 500,
        retriable: false,
        suggestion: 'Ensure plugin is fully initialized before capturing storage.'
      });
    }

    return await this.storageManager.captureSessionStorage(page as unknown as Parameters<typeof CaptureSessionStorageFn>[0]);
  }

  async captureIndexedDB(page: Page): Promise<IndexedDBResult> {
    if (!this.storageManager) {
      throw new PluginError('Storage manager not initialized', {
        pluginName: 'PuppeteerPlugin',
        operation: 'captureIndexedDB',
        statusCode: 500,
        retriable: false,
        suggestion: 'Ensure plugin is fully initialized before capturing storage.'
      });
    }

    return await this.storageManager.captureIndexedDB(page as unknown as Parameters<typeof CaptureIndexedDBFn>[0]);
  }

  async detectAntiBotServices(page: Page): Promise<AntiBotDetectionResult> {
    if (!this.antiBotDetector) {
      throw new PluginError('Anti-bot detector not initialized', {
        pluginName: 'PuppeteerPlugin',
        operation: 'detectAntiBotServices',
        statusCode: 500,
        retriable: false,
        suggestion: 'Ensure plugin is fully initialized before detecting anti-bot services.'
      });
    }

    return await this.antiBotDetector.detectAntiBotServices(page as unknown as Parameters<typeof DetectAntiBotServicesFn>[0]);
  }

  async detectFingerprinting(page: Page): Promise<FingerprintingResult> {
    if (!this.antiBotDetector) {
      throw new PluginError('Anti-bot detector not initialized', {
        pluginName: 'PuppeteerPlugin',
        operation: 'detectFingerprinting',
        statusCode: 500,
        retriable: false,
        suggestion: 'Ensure plugin is fully initialized before detecting fingerprinting.'
      });
    }

    return await this.antiBotDetector.detectFingerprinting(page as unknown as Parameters<typeof DetectFingerprintingFn>[0]);
  }

  async detectAntiBotsAndFingerprinting(page: Page): Promise<AntiBotAndFingerprintingResult> {
    if (!this.antiBotDetector) {
      throw new PluginError('Anti-bot detector not initialized', {
        pluginName: 'PuppeteerPlugin',
        operation: 'detectAntiBotsAndFingerprinting',
        statusCode: 500,
        retriable: false,
        suggestion: 'Ensure plugin is fully initialized before detecting anti-bot and fingerprinting.'
      });
    }

    return await this.antiBotDetector.detectAntiBotsAndFingerprinting(page as unknown as Parameters<typeof DetectAntiBotsAndFingerprintingFn>[0]);
  }

  async detectWebRTC(page: Page): Promise<WebRTCDetectionResult> {
    if (!this.webrtcStreamsDetector) {
      throw new PluginError('WebRTC/Streams detector not initialized', {
        pluginName: 'PuppeteerPlugin',
        operation: 'detectWebRTC',
        statusCode: 500,
        retriable: false,
        suggestion: 'Ensure plugin is fully initialized before detecting WebRTC.'
      });
    }

    return await this.webrtcStreamsDetector.detectWebRTC(page as unknown as Parameters<typeof DetectWebRTCFn>[0]);
  }

  async detectMediaStreams(page: Page): Promise<MediaStreamsDetectionResult> {
    if (!this.webrtcStreamsDetector) {
      throw new PluginError('WebRTC/Streams detector not initialized', {
        pluginName: 'PuppeteerPlugin',
        operation: 'detectMediaStreams',
        statusCode: 500,
        retriable: false,
        suggestion: 'Ensure plugin is fully initialized before detecting media streams.'
      });
    }

    return await this.webrtcStreamsDetector.detectMediaStreams(page as unknown as Parameters<typeof DetectMediaStreamsFn>[0]);
  }

  async detectStreamingProtocols(page: Page): Promise<StreamingProtocolsDetectionResult> {
    if (!this.webrtcStreamsDetector) {
      throw new PluginError('WebRTC/Streams detector not initialized', {
        pluginName: 'PuppeteerPlugin',
        operation: 'detectStreamingProtocols',
        statusCode: 500,
        retriable: false,
        suggestion: 'Ensure plugin is fully initialized before detecting streaming protocols.'
      });
    }

    return await this.webrtcStreamsDetector.detectStreamingProtocols(page as unknown as Parameters<typeof DetectStreamingProtocolsFn>[0]);
  }

  async detectWebRTCAndStreams(page: Page): Promise<WebRTCAndStreamsResult> {
    if (!this.webrtcStreamsDetector) {
      throw new PluginError('WebRTC/Streams detector not initialized', {
        pluginName: 'PuppeteerPlugin',
        operation: 'detectWebRTCAndStreams',
        statusCode: 500,
        retriable: false,
        suggestion: 'Ensure plugin is fully initialized before detecting WebRTC and streaming.'
      });
    }

    return await this.webrtcStreamsDetector.detectWebRTCAndStreams(page as unknown as Parameters<typeof DetectWebRTCAndStreamsFn>[0]);
  }
}

export default PuppeteerPlugin;
