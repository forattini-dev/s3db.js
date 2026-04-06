/// <reference lib="dom" />

import { Plugin, type PluginConfig } from './plugin.class.js';
import { requirePluginDependency } from './concerns/plugin-dependencies.js';
import { getValidatedNamespace } from './namespace.js';
import { PuppeteerPlugin } from './puppeteer.plugin.js';
import { S3QueuePlugin } from './s3-queue.plugin.js';
import { QueueConsumerPlugin, type QueueConsumerPluginOptions, type DriverDefinition } from './queue-consumer.plugin.js';
import { TTLPlugin } from './ttl.plugin.js';
import tryFn from '../concerns/try-fn.js';
import { PluginError } from '../errors.js';
import { createLogger } from '../concerns/logger.js';
import {
  ensureReckerCurlImpersonate,
  getReckerCurlImpersonateStatus,
  installReckerCurlImpersonate
} from '../concerns/http-client.js';
import {
  AVAILABLE_ACTIVITIES,
  ACTIVITY_CATEGORIES,
  ACTIVITY_PRESETS,
  type Activity,
  type ActivityCategoryWithActivities,
  type ActivityPreset,
  type ValidationResult,
  getActivitiesByCategory,
  getAllActivities,
  getCategoriesWithActivities,
  validateActivities,
  getPreset
} from './spider/task-activities.js';
import { analyzeIFrames, detectTrackingPixels } from './spider/content-analyzer.js';
import { analyzeAllStorage } from './spider/storage-analyzer.js';
import { URLPatternMatcher, type FilteredUrl } from './spider/url-pattern-matcher.js';
import { LinkDiscoverer, type DiscoveryStats } from './spider/link-discoverer.js';
import { DeepDiscovery } from './spider/deep-discovery.js';
import type { AdapterDriverConfig } from './spider/adapters/index.js';

type SpiderQueueBackend = 's3' | 'queue-consumer';
type SpiderQueueProcessor = (task: any, context: any) => Promise<any>;

interface SpiderQueueConsumerOptions extends QueueConsumerPluginOptions {
  autoStart?: boolean;
}

class SpiderQueueConsumerBridge extends QueueConsumerPlugin {
  private processor: SpiderQueueProcessor | null = null;

  setProcessor(processor: SpiderQueueProcessor): void {
    this.processor = processor;
  }

  override async onInstall(): Promise<void> {
    // Startup is controlled by SpiderPlugin.startProcessing().
  }

  override async onStart(): Promise<void> {
    if (this.consumers.length === 0) {
      await super.onInstall();
    }
  }

  override async _handleMessage(msg: any, configuredResource: string): Promise<unknown> {
    if (!this.processor) {
      throw new PluginError('Spider queue processor is not configured for QueueConsumer backend');
    }

    const payload = (msg && typeof msg === 'object' && msg.$body) ? msg.$body : msg;
    const taskCandidate = payload && typeof payload === 'object'
      && payload.data && typeof payload.data === 'object'
      ? payload.data
      : payload;

    if (!taskCandidate || typeof taskCandidate !== 'object' || typeof taskCandidate.url !== 'string') {
      throw new PluginError(
        `QueueConsumer message for resource '${configuredResource}' must contain a task object with "url"`
      );
    }

    return await this.processor(taskCandidate, {
      backend: 'queue-consumer',
      resource: configuredResource,
      message: msg
    });
  }

  async getStatus(): Promise<SpiderQueueStatus> {
    return {
      backend: 'queue-consumer',
      activeConsumers: this.consumers.length,
      running: this.consumers.length > 0
    };
  }
}

export interface SpiderQueueConfig {
  backend?: SpiderQueueBackend | 'consumer' | 'queueconsumer' | 'queue-consumer';
  autoStart?: boolean;
  concurrency?: number;
  maxRetries?: number;
  retryDelay?: number;
  s3?: Record<string, any>;
  consumer?: SpiderQueueConsumerOptions;
  drivers?: DriverDefinition[];
  /** @deprecated Use `drivers` instead */
  consumers?: QueueConsumerPluginOptions['consumers'];
  [key: string]: any;
}

export interface SpiderPluginConfig {
  logLevel?: string;
  namespace?: string;
  resourcePrefix?: string;
  puppeteer?: Record<string, any>;
  queue?: SpiderQueueConfig;
  recker?: {
    ensureCurlImpersonate?: boolean;
    [key: string]: any;
  };
  ttl?: {
    enabled?: boolean;
    queue?: { ttl?: number; [key: string]: any };
    [key: string]: any;
  };
  seo?: {
    enabled?: boolean;
    extractMetaTags?: boolean;
    extractOpenGraph?: boolean;
    extractTwitterCard?: boolean;
    extractAssets?: boolean;
    assetMetadata?: boolean;
    [key: string]: any;
  };
  techDetection?: {
    enabled?: boolean;
    detectFrameworks?: boolean;
    detectAnalytics?: boolean;
    detectMarketing?: boolean;
    detectCDN?: boolean;
    detectWebServer?: boolean;
    detectCMS?: boolean;
    [key: string]: any;
  };
  screenshot?: {
    enabled?: boolean;
    captureFullPage?: boolean;
    quality?: number;
    format?: 'jpeg' | 'png';
    maxWidth?: number;
    maxHeight?: number;
    [key: string]: any;
  };
  persistence?: {
    enabled?: boolean;
    saveResults?: boolean;
    saveSEOAnalysis?: boolean;
    saveTechFingerprint?: boolean;
    saveSecurityAnalysis?: boolean;
    saveScreenshots?: boolean;
    savePerformanceMetrics?: boolean;
    [key: string]: any;
  };
  performance?: {
    enabled?: boolean;
    collectCoreWebVitals?: boolean;
    collectNavigationTiming?: boolean;
    collectResourceTiming?: boolean;
    collectMemory?: boolean;
    [key: string]: any;
  };
  security?: {
    enabled?: boolean;
    analyzeSecurityHeaders?: boolean;
    analyzeCSP?: boolean;
    analyzeCORS?: boolean;
    captureConsoleLogs?: boolean;
    consoleLogLevels?: string[];
    maxConsoleLogLines?: number;
    analyzeTLS?: boolean;
    checkVulnerabilities?: boolean;
    captureWebSockets?: boolean;
    maxWebSocketMessages?: number;
    [key: string]: any;
  };
  rateLimit?: {
    concurrency?: number;
    requestsPerInterval?: number;
    interval?: number;
  };
  patterns?: Record<string, any>;
  discovery?: {
    enabled?: boolean;
    maxDepth?: number;
    maxUrls?: number;
    sameDomainOnly?: boolean;
    includeSubdomains?: boolean;
    allowedDomains?: string[];
    blockedDomains?: string[];
    followPatterns?: string[];
    followRegex?: RegExp | null;
    ignoreRegex?: RegExp | null;
    respectRobotsTxt?: boolean;
    ignoreQueryString?: boolean;
    [key: string]: any;
  };
  crawlQueue?: AdapterDriverConfig;
  crawlStorage?: AdapterDriverConfig;
  proxy?: AdapterDriverConfig;
  processing?: {
    autoStart?: boolean;
    concurrency?: number;
    maxRetries?: number;
    retryDelay?: number;
  };
  logger?: any;
}

export type SpiderDiscoveryStatus =
  | { enabled: false }
  | ({ enabled: true } & DiscoveryStats);

export interface SpiderQueueStatus {
  backend: SpiderQueueBackend;
  running: boolean;
  activeConsumers?: number;
  total?: number;
  pending?: number;
  processing?: number;
  completed?: number;
  failed?: number;
  dead?: number;
}

export interface SpiderPersistenceConfig {
  enabled: boolean;
  saveResults: boolean;
  saveSEOAnalysis: boolean;
  saveTechFingerprint: boolean;
  saveSecurityAnalysis: boolean;
  saveScreenshots: boolean;
  savePerformanceMetrics: boolean;
}

export class SpiderPlugin extends Plugin {
  config: any;
  resourceNames: Record<string, string>;
  puppeteerPlugin: PuppeteerPlugin | null;
  queuePlugin: S3QueuePlugin | SpiderQueueConsumerBridge | null;
  queueBackend: SpiderQueueBackend;
  queueProcessor: SpiderQueueProcessor | null;
  ttlPlugin: TTLPlugin | null;
  seoAnalyzer: any | null;
  techDetector: any | null;
  securityAnalyzer: any | null;
  patternMatcher: URLPatternMatcher | null;
  linkDiscoverer: LinkDiscoverer | null;
  _requestPool: any | null;
  _crawlQueueAdapter: any | null;
  _crawlStorageAdapter: any | null;
  _proxyAdapter: any | null;
  initialized: boolean = false;
  override namespace: string;

  constructor(options: SpiderPluginConfig = {}) {
    super(options as PluginConfig);

    // Validate namespace
    this.namespace = getValidatedNamespace(options, 'spider');

    // 🪵 Logger initialization
    if (options.logger) {
      this.logger = options.logger;
    } else {
      const logLevel = (this as any).logLevel || 'info';
      this.logger = createLogger({ name: 'SpiderPlugin', level: logLevel });
    }

    // Configuration
    this.config = {
      logLevel: (this as any).logLevel,

      // Namespacing
      namespace: this.namespace,
      resourcePrefix: options.resourcePrefix || `plg_${this.namespace}`,

      // Puppeteer configuration
      puppeteer: {
        pool: {
          enabled: true,
          maxBrowsers: 3,
          ...options.puppeteer?.pool
        },
        launch: options.puppeteer?.launch || {},
        viewport: options.puppeteer?.viewport || {},
        stealth: {
          enabled: true,
          ...options.puppeteer?.stealth
        },
        ...options.puppeteer
      },

      // Queue configuration
      queue: {
        backend: 's3',
        autoStart: true,
        concurrency: 5,
        maxRetries: 3,
        retryDelay: 1000,
        ...options.queue
      },

      recker: {
        ensureCurlImpersonate: options.recker?.ensureCurlImpersonate === true,
        ...options.recker
      },

      // TTL configuration (optional)
      ttl: {
        enabled: options.ttl?.enabled !== false,
        queue: {
          ttl: 86400000, // 24 hours
          ...options.ttl?.queue
        },
        ...options.ttl
      },

      // SEO analysis configuration
      seo: {
        enabled: true,
        extractMetaTags: true,
        extractOpenGraph: true,
        extractTwitterCard: true,
        extractAssets: true,
        assetMetadata: true,
        ...options.seo
      },

      // Tech detection configuration
      techDetection: {
        enabled: true,
        detectFrameworks: true,
        detectAnalytics: true,
        detectMarketing: true,
        detectCDN: true,
        detectWebServer: true,
        detectCMS: true,
        ...options.techDetection
      },

      // Screenshot configuration
      screenshot: {
        enabled: options.screenshot?.enabled !== false,
        captureFullPage: options.screenshot?.captureFullPage !== false,
        quality: options.screenshot?.quality || 80,
        format: options.screenshot?.format || 'jpeg',
        maxWidth: options.screenshot?.maxWidth || 1920,
        maxHeight: options.screenshot?.maxHeight || 1080,
        ...options.screenshot
      },

      // Persistence configuration
      persistence: {
        enabled: options.persistence?.enabled === true,
        saveResults: options.persistence?.saveResults !== false,
        saveSEOAnalysis: options.persistence?.saveSEOAnalysis !== false,
        saveTechFingerprint: options.persistence?.saveTechFingerprint !== false,
        saveSecurityAnalysis: options.persistence?.saveSecurityAnalysis !== false,
        saveScreenshots: options.persistence?.saveScreenshots !== false,
        savePerformanceMetrics: options.persistence?.savePerformanceMetrics !== false,
        ...options.persistence
      },

      // Performance metrics
      performance: {
        enabled: true,
        collectCoreWebVitals: true,
        collectNavigationTiming: true,
        collectResourceTiming: true,
        collectMemory: true,
        ...options.performance
      },

      // Security analysis configuration
      security: {
        enabled: options.security?.enabled !== false,
        analyzeSecurityHeaders: options.security?.analyzeSecurityHeaders !== false,
        analyzeCSP: options.security?.analyzeCSP !== false,
        analyzeCORS: options.security?.analyzeCORS !== false,
        captureConsoleLogs: options.security?.captureConsoleLogs !== false,
        consoleLogLevels: options.security?.consoleLogLevels || ['error', 'warn'],
        maxConsoleLogLines: options.security?.maxConsoleLogLines || 100,
        analyzeTLS: options.security?.analyzeTLS !== false,
        checkVulnerabilities: options.security?.checkVulnerabilities !== false,
        captureWebSockets: options.security?.captureWebSockets !== false,
        maxWebSocketMessages: options.security?.maxWebSocketMessages || 50,
        ...options.security
      },

      // Rate limiting configuration
      rateLimit: {
        concurrency: options.rateLimit?.concurrency ?? 5,
        requestsPerInterval: options.rateLimit?.requestsPerInterval ?? 10,
        interval: options.rateLimit?.interval ?? 1000,
      },

      // URL Patterns configuration
      patterns: options.patterns || {},

      // Auto-discovery configuration
      discovery: {
        enabled: options.discovery?.enabled || false,
        maxDepth: options.discovery?.maxDepth || 3,
        maxUrls: options.discovery?.maxUrls || 1000,
        sameDomainOnly: options.discovery?.sameDomainOnly !== false,
        includeSubdomains: options.discovery?.includeSubdomains !== false,
        allowedDomains: options.discovery?.allowedDomains || [],
        blockedDomains: options.discovery?.blockedDomains || [],
        followPatterns: options.discovery?.followPatterns || [],
        followRegex: options.discovery?.followRegex || null,
        ignoreRegex: options.discovery?.ignoreRegex || null,
        respectRobotsTxt: options.discovery?.respectRobotsTxt !== false,
        ignoreQueryString: options.discovery?.ignoreQueryString || false,
        ...options.discovery
      }
    };

    // Resource names
    this.resourceNames = {
      targets: `${this.config.resourcePrefix}_targets`,
      results: `${this.config.resourcePrefix}_results`,
      ttlCohorts: `${this.config.resourcePrefix}_ttl_cohorts`,
      seoAnalysis: `${this.config.resourcePrefix}_seo_analysis`,
      techFingerprint: `${this.config.resourcePrefix}_tech_fingerprint`,
      securityAnalysis: `${this.config.resourcePrefix}_security_analysis`,
      screenshots: `${this.config.resourcePrefix}_screenshots`,
      contentAnalysis: `${this.config.resourcePrefix}_content_analysis`,
      storageAnalysis: `${this.config.resourcePrefix}_storage_analysis`,
      assetsAnalysis: `${this.config.resourcePrefix}_assets_analysis`
    };

    // Plugin instances
    this.puppeteerPlugin = null;
    this.queuePlugin = null;
    this.queueBackend = this._resolveQueueBackend(this.config.queue.backend);
    this.queueProcessor = null;
    this.ttlPlugin = null;

    // SEO and tech detection modules
    this.seoAnalyzer = null;
    this.techDetector = null;
    this.securityAnalyzer = null;

    // Pattern matching and discovery
    this.patternMatcher = null;
    this.linkDiscoverer = null;
    this._requestPool = null;

    // Adapter instances (recker pluggable interfaces)
    this._crawlQueueAdapter = null;
    this._crawlStorageAdapter = null;
    this._proxyAdapter = null;

    // Initialize pattern matcher if patterns configured
    if (Object.keys(this.config.patterns).length > 0) {
      this.patternMatcher = new URLPatternMatcher(this.config.patterns);
    }

    // Initialize link discoverer if discovery enabled
    if (this.config.discovery.enabled) {
      this.linkDiscoverer = new LinkDiscoverer(this.config.discovery);
      if (this.patternMatcher) {
        this.linkDiscoverer.setPatternMatcher(this.patternMatcher);
      }
    }
  }

  _resolveQueueBackend(value: unknown): SpiderQueueBackend {
    if (value === 'consumer' || value === 'queueconsumer' || value === 'queue-consumer') {
      return 'queue-consumer';
    }
    return 's3';
  }

  _migrateQueueConfig(): void {
    if (this.config.crawlQueue) return;

    const queue = this.config.queue;
    if (!queue || !queue.backend) {
      this.config.crawlQueue = { driver: 'memory' };
      this.config.crawlStorage = this.config.crawlStorage || { driver: 'memory' };
      return;
    }

    const backend = this._resolveQueueBackend(queue.backend);

    if (backend === 's3') {
      this.config.crawlQueue = { driver: 's3', config: { ...(queue.s3 || {}) } };
      this.config.crawlStorage = this.config.crawlStorage || { driver: 's3' };
    } else {
      const consumers = queue.consumer?.consumers || queue.consumers || [];
      const firstConsumer = consumers[0] as any;
      const driver = firstConsumer?.driver || 'sqs';
      this.config.crawlQueue = {
        driver,
        config: { ...(firstConsumer?.config || {}), consumers }
      };
      this.config.crawlStorage = this.config.crawlStorage || { driver: 's3' };
    }

    this.config.processing = {
      autoStart: queue.autoStart,
      concurrency: queue.concurrency,
      maxRetries: queue.maxRetries,
      retryDelay: queue.retryDelay,
    };

    this.logger.warn('SpiderPlugin "queue" config is deprecated. Use "crawlQueue", "crawlStorage", and "proxy" instead.');
  }

  async _initializeAdapters(): Promise<void> {
    const database = (this as any).database;
    const context = { database, namespace: this.namespace, logger: this.logger };

    this._migrateQueueConfig();

    const queueCfg = this.config.crawlQueue || { driver: 'memory' };
    const { createCrawlQueue } = await import('./spider/adapters/crawl-queue/index.js');
    this._crawlQueueAdapter = await createCrawlQueue(queueCfg.driver, queueCfg.config || {}, context);

    const storageCfg = this.config.crawlStorage || { driver: 'memory' };
    const { createCrawlStorage } = await import('./spider/adapters/crawl-storage/index.js');
    this._crawlStorageAdapter = await createCrawlStorage(storageCfg.driver, storageCfg.config || {}, context);

    if (this.config.proxy) {
      const { createProxyAdapter } = await import('./spider/adapters/proxy/index.js');
      this._proxyAdapter = await createProxyAdapter(
        this.config.proxy.driver,
        this.config.proxy.config || {},
        context
      );
    }

    this.logger.debug({
      crawlQueue: queueCfg.driver,
      crawlStorage: storageCfg.driver,
      proxy: this.config.proxy?.driver || 'none',
    }, 'Spider adapters initialized');
  }

  async _initializeQueuePlugin(): Promise<void> {
    const queueConfig = this.config.queue || {};
    const backend = this._resolveQueueBackend(queueConfig.backend);
    this.queueBackend = backend;

    const { backend: _backend, s3, consumer, consumers, ...queueBaseConfig } = queueConfig;

    if (backend === 'queue-consumer') {
      const consumerConfig = {
        ...queueBaseConfig,
        ...(consumer || {})
      };
      const consumerDefinitions = consumerConfig.consumers || consumers || [];

      if (!Array.isArray(consumerDefinitions) || consumerDefinitions.length === 0) {
        throw new PluginError(
          'SpiderPlugin queue.consumer.consumers (or queue.consumers) is required when queue.backend is "queue-consumer"'
        );
      }

      this.queuePlugin = new SpiderQueueConsumerBridge({
        ...consumerConfig,
        autoStart: false,
        consumers: consumerDefinitions,
        namespace: this.namespace,
        logLevel: (this as any).logLevel
      } as SpiderQueueConsumerOptions);

      if (this.queueProcessor) {
        (this.queuePlugin as SpiderQueueConsumerBridge).setProcessor(this.queueProcessor);
      }

      await this.queuePlugin.install((this as any).database);
      return;
    }

    const s3Config = {
      ...queueBaseConfig,
      ...(s3 || {})
    };

    this.queuePlugin = new S3QueuePlugin({
      ...s3Config,
      namespace: this.namespace,
      resource: this.resourceNames.targets,
      autoStart: false,
      maxAttempts: s3Config.maxAttempts ?? s3Config.maxRetries ?? 3,
      onMessage: this.queueProcessor || undefined,
      logLevel: (this as any).logLevel
    });

    await this.queuePlugin.install((this as any).database);
  }

  override async onInstall(): Promise<void> {
    await this.initialize();
  }

  override async onStop(): Promise<void> {
    await this.stopProcessing();
  }

  override async onUninstall(_options: { purgeData?: boolean } = {}): Promise<void> {
    await this.destroy();
  }

  async getCurlImpersonateStatus(): Promise<any> {
    return await getReckerCurlImpersonateStatus();
  }

  async installCurlImpersonate(): Promise<any> {
    return await installReckerCurlImpersonate(this.logger);
  }

  async ensureCurlImpersonate(): Promise<any> {
    return await ensureReckerCurlImpersonate({
      installIfMissing: true,
      logger: this.logger
    });
  }

  /**
   * Initialize SpiderPlugin
   * Creates and initializes bundled plugins
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Verify Puppeteer dependency
      requirePluginDependency('puppeteer', 'SpiderPlugin');

      if (this.config.recker.ensureCurlImpersonate) {
        const ensured = await ensureReckerCurlImpersonate({
          installIfMissing: true,
          logger: this.logger
        });
        this.logger.info(
          {
            available: ensured.available,
            path: ensured.path,
            source: ensured.source
          },
          'curl-impersonate check completed'
        );
      } else {
        const status = await getReckerCurlImpersonateStatus();
        if (status.available) {
          this.logger.debug(
            { path: status.path, source: status.source },
            'curl-impersonate available for Recker'
          );
        } else {
          this.logger.warn(
            {
              suggestion: 'Run `npx recker setup` (or `rek setup`) to install curl-impersonate for protected targets.'
            },
            'curl-impersonate not available'
          );
        }
      }

      // Initialize RequestPool for rate limiting
      try {
        const { RequestPool } = await import('recker/utils/request-pool');
        this._requestPool = new RequestPool({
          concurrency: this.config.rateLimit.concurrency,
          requestsPerInterval: this.config.rateLimit.requestsPerInterval,
          interval: this.config.rateLimit.interval,
        });
        this.logger.debug(
          { concurrency: this.config.rateLimit.concurrency, rps: this.config.rateLimit.requestsPerInterval },
          'RequestPool initialized for rate limiting'
        );
      } catch {
        this.logger.warn('recker RequestPool not available, rate limiting disabled');
      }

      // 🪵 Debug: initializing bundled plugins
      this.logger.debug('Initializing bundled plugins (Puppeteer, Queue, TTL)');

      // Initialize PuppeteerPlugin
      this.puppeteerPlugin = new PuppeteerPlugin({
        ...this.config.puppeteer,
        namespace: this.namespace,
        logLevel: (this as any).logLevel
      });
      await this.puppeteerPlugin.install((this as any).database);
      await this.puppeteerPlugin.start();

      // Initialize TTLPlugin if enabled
      if (this.config.ttl.enabled) {
        const targetsResourceName = this.resourceNames.targets as string;
        this.ttlPlugin = new TTLPlugin({
          resources: {
            [targetsResourceName]: {
              ttl: this.config.ttl.queue.ttl
            }
          } as any,
          logLevel: (this as any).logLevel
        });
        await this.ttlPlugin.install((this as any).database);
        await this.ttlPlugin.start();
      }

      // Load SEO analyzer, tech detector, and security analyzer
      const { SEOAnalyzer } = await import('./spider/seo-analyzer.js');
      const { TechDetector } = await import('./spider/tech-detector.js');
      const { SecurityAnalyzer } = await import('./spider/security-analyzer.js');

      this.seoAnalyzer = new SEOAnalyzer(this.config.seo);
      this.techDetector = new TechDetector(this.config.techDetection);
      this.securityAnalyzer = new SecurityAnalyzer(this.config.security);

      // Initialize adapters (crawlQueue, crawlStorage, proxy)
      await this._initializeAdapters();

      // Create resources
      await this._createResources();

      // Set queue processor
      await this._setupQueueProcessor();

      // Initialize queue backend
      await this._initializeQueuePlugin();

      const autoStart = this.config.processing?.autoStart ?? this.config.queue?.autoStart ?? true;
      if (autoStart !== false) {
        await this.startProcessing();
      }

      this.initialized = true;

      // 🪵 Debug: initialized successfully
      this.logger.debug('Initialized successfully');
    } catch (error: any) {
      throw new PluginError(
        `SpiderPlugin initialization failed: ${error.message}`,
        { cause: error }
      );
    }
  }

  /**
   * Create required resources
   */
  async _createResources(): Promise<void> {
    const resourceConfig: Record<string, any> = {
      targets: {
        name: this.resourceNames.targets,
        attributes: {
          url: 'string|required',
          status: 'string',
          priority: 'number',
          retries: 'number',
          metadata: 'object',
          activities: 'array|items:string',
          activityPreset: 'string',
          createdAt: 'datetime'
        },
        behavior: 'body-overflow',
        timestamps: true
      },
      results: {
        name: this.resourceNames.results,
        attributes: {
          targetId: 'string|required',
          url: 'string|required',
          statusCode: 'number',
          title: 'string',
          seoAnalysis: 'object',
          techFingerprint: 'object',
          performanceMetrics: 'object',
          screenshot: 'string',
          error: 'string',
          createdAt: 'datetime',
          processingTime: 'number'
        },
        behavior: 'body-only',
        timestamps: true
      },
      seoAnalysis: {
        name: this.resourceNames.seoAnalysis,
        attributes: {
          targetId: 'string|required',
          url: 'string|required',
          metaTags: 'object',
          openGraph: 'object',
          twitterCard: 'object',
          assets: 'object',
          createdAt: 'datetime'
        },
        behavior: 'body-only',
        timestamps: true
      },
      techFingerprint: {
        name: this.resourceNames.techFingerprint,
        attributes: {
          targetId: 'string|required',
          url: 'string|required',
          frameworks: 'array|items:string',
          analytics: 'array|items:string',
          marketing: 'array|items:string',
          cdn: 'array|items:string',
          webServers: 'array|items:string',
          cms: 'array|items:string',
          libraries: 'array|items:string',
          createdAt: 'datetime'
        },
        behavior: 'body-only',
        timestamps: true
      },
      securityAnalysis: {
        name: this.resourceNames.securityAnalysis,
        attributes: {
          targetId: 'string|required',
          url: 'string|required',
          securityHeaders: 'object',
          csp: 'object',
          cors: 'object',
          consoleLogs: 'object',
          tls: 'object',
          websockets: 'object',
          vulnerabilities: 'array',
          securityScore: 'number',
          createdAt: 'datetime'
        },
        behavior: 'body-only',
        timestamps: true
      },
      screenshots: {
        name: this.resourceNames.screenshots,
        attributes: {
          targetId: 'string|required',
          url: 'string|required',
          screenshot: 'string',
          screenshotMimeType: 'string',
          width: 'number',
          height: 'number',
          format: 'string',
          quality: 'number',
          capturedAt: 'datetime'
        },
        behavior: 'body-only',
        timestamps: true
      },
      contentAnalysis: {
        name: this.resourceNames.contentAnalysis,
        attributes: {
          targetId: 'string|required',
          url: 'string|required',
          iframes: 'object',
          trackingPixels: 'object',
          createdAt: 'datetime'
        },
        behavior: 'body-only',
        timestamps: true
      },
      storageAnalysis: {
        name: this.resourceNames.storageAnalysis,
        attributes: {
          targetId: 'string|required',
          url: 'string|required',
          localStorage: 'object',
          sessionStorage: 'object',
          indexedDB: 'object',
          summary: 'object',
          createdAt: 'datetime'
        },
        behavior: 'body-only',
        timestamps: true
      },
      assetsAnalysis: {
        name: this.resourceNames.assetsAnalysis,
        attributes: {
          targetId: 'string|required',
          url: 'string|required',
          stylesheets: 'array',
          scripts: 'array',
          images: 'array',
          videos: 'array',
          audios: 'array',
          summary: 'object',
          createdAt: 'datetime'
        },
        behavior: 'body-only',
        timestamps: true
      }
    };

    for (const [key, config] of Object.entries(resourceConfig)) {
      const [ok, err] = await tryFn(async () => {
        return await (this as any).database.createResource(config);
      });

      if (ok) {
        // 🪵 Debug: created resource
        this.logger.debug({ resourceName: config.name }, `Created resource: ${config.name}`);
      } else if ((err as any)?.code !== 'ResourceAlreadyExists') {
        throw err;
      }
    }
  }

  /**
   * Check if a specific activity should be executed
   */
  _shouldExecuteActivity(task: any, activityName: string): boolean {
    if (!task.activities || task.activities.length === 0) {
      return true; // Default to all if no activities specified
    }
    return task.activities.includes(activityName);
  }

  /**
   * Check if ANY activity from a category should be executed
   */
  _shouldExecuteCategory(task: any, category: string): boolean {
    if (!task.activities || task.activities.length === 0) {
      return true; // Default to all if no activities specified
    }

    const categoryActivities = getActivitiesByCategory(category);
    return categoryActivities.some((activity) => task.activities.includes(activity.name));
  }

  /**
   * Get which specific activities from a category should run
   */
  _getRequestedActivities(task: any, category: string): string[] {
    if (!task.activities || task.activities.length === 0) {
      // Return all activities from category
      return getActivitiesByCategory(category).map((activity) => activity.name);
    }

    const categoryActivities = getActivitiesByCategory(category);
    return categoryActivities
      .filter((activity) => task.activities.includes(activity.name))
      .map((activity) => activity.name);
  }

  /**
   * Setup queue processor function
   */
  async _setupQueueProcessor(): Promise<void> {
    const processor = async (task: any, context: any) => {
      const startTime = Date.now();

      try {
        // 🪵 Debug: processing URL
        this.logger.debug({ url: task.url, activities: task.activities }, `Processing: ${task.url}`);
        if (task.activities && task.activities.length > 0) {
          this.logger.debug({ activities: task.activities }, `Activities: ${task.activities.join(', ')}`);
        }

        // Open browser page using navigate method (rate-limited if RequestPool available)
        const navigateFn = () => this.puppeteerPlugin!.navigate(task.url, {
          waitUntil: 'networkidle2'
        });
        const page = this._requestPool
          ? await this._requestPool.run(navigateFn)
          : await navigateFn();

        // Collect data
        const html = await (page as any).content();
        const statusCode = (page as any).response?.()?.status() || 200;
        const title = await (page as any).title();

        // SEO Analysis - only if SEO activities are requested
        let seoAnalysis = null;
        if (this.config.seo.enabled && this._shouldExecuteCategory(task, 'seo')) {
          const seoActivities = this._getRequestedActivities(task, 'seo');
          seoAnalysis = this.seoAnalyzer.analyzeSelective(html, task.url, seoActivities);
          // 🪵 Debug: executed SEO analysis
          this.logger.debug({ url: task.url, activities: seoActivities }, `Executed SEO analysis for ${task.url}`);
        }

        // Tech Detection - only if technology activities are requested
        let techFingerprint = null;
        if (this.config.techDetection.enabled && this._shouldExecuteCategory(task, 'technology')) {
          const techActivities = this._getRequestedActivities(task, 'technology');
          techFingerprint = this.techDetector.fingerprintSelective(html, techActivities);
          // 🪵 Debug: executed tech detection
          this.logger.debug({ url: task.url, activities: techActivities }, `Executed tech detection for ${task.url}`);
        }

        // Performance Metrics - only if performance activities are requested
        let performanceMetrics = null;
        if (this.config.performance.enabled && this._shouldExecuteCategory(task, 'performance')) {
          performanceMetrics = await (this.puppeteerPlugin as any)?.performanceManager?.collectMetrics(page as any);
          // 🪵 Debug: collected performance metrics
          this.logger.debug({ url: task.url }, `Collected performance metrics for ${task.url}`);
        }

        // Security Analysis - only if security activities are requested
        let securityAnalysis = null;
        if (this.config.security.enabled && this._shouldExecuteCategory(task, 'security')) {
          const securityActivities = this._getRequestedActivities(task, 'security');
          securityAnalysis = await this.securityAnalyzer.analyzeSelective(page, task.url, html, securityActivities);
          // 🪵 Debug: executed security analysis
          this.logger.debug({ url: task.url, activities: securityActivities }, `Executed security analysis for ${task.url}`);
        }

        // Screenshot Capture - only if screenshot activities are requested
        let screenshotData: any = null;
        if (this.config.screenshot.enabled && this._shouldExecuteCategory(task, 'visual')) {
          try {
            const screenshotBuffer = await page.screenshot({
              fullPage: this.config.screenshot.captureFullPage,
              type: this.config.screenshot.format,
              quality: this.config.screenshot.format === 'jpeg' ? this.config.screenshot.quality : undefined
            });

            // Convert to base64 for storage
            const screenshotBase64 = screenshotBuffer.toString('base64');
            const mimeType = this.config.screenshot.format === 'jpeg' ? 'image/jpeg' : 'image/png';

            screenshotData = {
              screenshot: screenshotBase64,
              screenshotMimeType: mimeType,
              width: this.config.screenshot.maxWidth,
              height: this.config.screenshot.maxHeight,
              format: this.config.screenshot.format,
              quality: this.config.screenshot.quality
            };

            // 🪵 Debug: captured screenshot
            this.logger.debug({ url: task.url, format: this.config.screenshot.format }, `Captured screenshot for ${task.url}`);
          } catch (error) {
            this.logger.error({ err: error }, '[SpiderPlugin] Failed to capture screenshot for ${task.url}');
          }
        }

        // Content Analysis - only if content activities are requested
        let contentAnalysis = null;
        if (this._shouldExecuteCategory(task, 'content')) {
          try {
            const [iframes, trackingPixels] = await Promise.all([
              analyzeIFrames(page as any),
              detectTrackingPixels(page as any)
            ]);

            contentAnalysis = {
              iframes,
              trackingPixels
            };

            // 🪵 Debug: analyzed content (iframes/tracking)
            this.logger.debug({ url: task.url }, `Analyzed content (iframes/tracking) for ${task.url}`);
          } catch (error) {
            this.logger.error({ err: error }, '[SpiderPlugin] Failed to analyze content for ${task.url}');
          }
        }

        // Storage Analysis - only if storage activities are requested
        let storageAnalysis = null;
        if (this._shouldExecuteCategory(task, 'storage')) {
          try {
            const storage = await analyzeAllStorage(page as any);
            storageAnalysis = storage;

            // 🪵 Debug: analyzed storage (localStorage/IndexedDB/sessionStorage)
            this.logger.debug({ url: task.url }, `Analyzed storage (localStorage/IndexedDB/sessionStorage) for ${task.url}`);
          } catch (error) {
            this.logger.error({ err: error }, '[SpiderPlugin] Failed to analyze storage for ${task.url}');
          }
        }

        // Assets Analysis - extract from SEO analysis or run separately
        let assetsAnalysis = null;
        if (this._shouldExecuteCategory(task, 'assets')) {
          try {
            // Assets are already extracted by SEO analyzer, but we can also extract directly
            if (seoAnalysis && seoAnalysis.assets) {
              assetsAnalysis = seoAnalysis.assets;
            } else {
              // Extract assets directly from HTML if SEO analysis wasn't run
              assetsAnalysis = this.seoAnalyzer._extractAssets(
                new DOMParser().parseFromString(html, 'text/html'),
                task.url
              );
            }
            // 🪵 Debug: analyzed assets
            this.logger.debug({ url: task.url }, `Analyzed assets (CSS/JS/images/videos/audios) for ${task.url}`);
          } catch (error) {
            this.logger.error({ err: error }, '[SpiderPlugin] Failed to analyze assets for ${task.url}');
          }
        }

        const persistedAt = new Date().toISOString();

        // Create result record
        const result = {
          targetId: task.id,
          url: task.url,
          statusCode,
          title,
          seoAnalysis,
          techFingerprint,
          performanceMetrics,
          securityAnalysis,
          screenshot: screenshotData ? screenshotData.screenshot : null,
          createdAt: persistedAt,
          processingTime: Date.now() - startTime
        };

        // Store results based on persistence configuration
        if (this.config.persistence.enabled) {
          // Store main result if enabled
          if (this.config.persistence.saveResults) {
            const resultsResource = await (this as any).database.getResource(this.resourceNames.results);
            await tryFn(async () => {
              return await resultsResource.insert(result);
            });
          }

          // Store SEO analysis separately if available and enabled
          if (seoAnalysis && this.config.persistence.saveSEOAnalysis) {
            const seoResource = await (this as any).database.getResource(this.resourceNames.seoAnalysis);
            await tryFn(async () => {
              return await seoResource.insert({
                targetId: task.id,
                url: task.url,
                ...seoAnalysis,
                createdAt: persistedAt
              });
            });
          }

          // Store tech fingerprint separately if available and enabled
          if (techFingerprint && this.config.persistence.saveTechFingerprint) {
            const techResource = await (this as any).database.getResource(this.resourceNames.techFingerprint);
            await tryFn(async () => {
              return await techResource.insert({
                targetId: task.id,
                url: task.url,
                ...techFingerprint,
                createdAt: persistedAt
              });
            });
          }

          // Store security analysis separately if available and enabled
          if (securityAnalysis && this.config.persistence.saveSecurityAnalysis) {
            const securityResource = await (this as any).database.getResource(this.resourceNames.securityAnalysis);
            await tryFn(async () => {
              return await securityResource.insert({
                targetId: task.id,
                url: task.url,
                ...securityAnalysis,
                createdAt: persistedAt
              });
            });
          }

          // Store screenshot separately if available and enabled
          if (screenshotData && this.config.persistence.saveScreenshots) {
            const screenshotResource = await (this as any).database.getResource(this.resourceNames.screenshots);
            await tryFn(async () => {
              return await screenshotResource.insert({
                targetId: task.id,
                url: task.url,
                ...screenshotData,
                capturedAt: persistedAt
              });
            });
          }

          // Store performance metrics if available and enabled
          if (performanceMetrics && this.config.persistence.savePerformanceMetrics) {
            // Performance metrics are already included in results, but can be logged separately
            // 🪵 Debug: persisted performance metrics
            this.logger.debug({ url: task.url }, `Persisted performance metrics for ${task.url}`);
          }

          // Store content analysis (iframes, tracking pixels) if available
          if (contentAnalysis) {
            const contentResource = await (this as any).database.getResource(this.resourceNames.contentAnalysis);
            await tryFn(async () => {
              return await contentResource.insert({
                targetId: task.id,
                url: task.url,
                ...contentAnalysis,
                createdAt: persistedAt
              });
            });
          }

          // Store storage analysis (localStorage, IndexedDB, sessionStorage) if available
          if (storageAnalysis) {
            const storageResource = await (this as any).database.getResource(this.resourceNames.storageAnalysis);
            await tryFn(async () => {
              return await storageResource.insert({
                targetId: task.id,
                url: task.url,
                ...storageAnalysis,
                createdAt: persistedAt
              });
            });
          }

          // Store assets analysis (CSS, JS, images, videos, audios) if available
          if (assetsAnalysis) {
            const assetsResource = await (this as any).database.getResource(this.resourceNames.assetsAnalysis);
            await tryFn(async () => {
              return await assetsResource.insert({
                targetId: task.id,
                url: task.url,
                ...assetsAnalysis,
                createdAt: persistedAt
              });
            });
          }
        } else {
          // If persistence disabled, store minimal data (for queue tracking)
          // 🪵 Debug: persistence disabled
          this.logger.debug({ url: task.url }, `Persistence disabled, skipping storage for ${task.url}`);
        }

        // Auto-discovery: extract and enqueue new links
        if (this.linkDiscoverer && this.config.discovery.enabled) {
          const currentDepth = task.depth || 0;
          if (currentDepth < this.config.discovery.maxDepth && !this.linkDiscoverer.isLimitReached()) {
            try {
              const discoveredLinks = this.linkDiscoverer.extractLinks(html, task.url, currentDepth);

              if (discoveredLinks.length > 0) {
                this.logger.debug(
                  { url: task.url, count: discoveredLinks.length },
                  `Discovered ${discoveredLinks.length} links from ${task.url}`
                );

                // Enqueue discovered links
                for (const link of discoveredLinks) {
                  if (!this.linkDiscoverer.isQueued(link.url)) {
                    await this.enqueueTarget({
                      url: link.url,
                      depth: link.depth,
                      activities: link.activities.length > 0 ? link.activities : undefined,
                      metadata: link.metadata
                    });
                  }
                }
              }
            } catch (error: any) {
              this.logger.warn({ url: task.url, error: error.message }, `Failed to discover links from ${task.url}`);
            }
          }
        }

        // Close page
        await page.close();

        return result;
      } catch (error) {
        this.logger.error({ err: error }, `[SpiderPlugin] Error processing ${task.url}`);
        throw error;
      }
    };

    this.queueProcessor = processor;

    if (this.queuePlugin && typeof (this.queuePlugin as any).setProcessor === 'function') {
      (this.queuePlugin as any).setProcessor(processor);
    }
  }

  /**
   * Full-site crawl using recker's Spider engine.
   * Passes the s3db adapters (crawlQueue, crawlStorage, proxy) to recker,
   * inheriting all anti-bot, retry, and transport fallback features.
   */
  async crawl(startUrl: string, options: Record<string, any> = {}): Promise<any> {
    const { Spider } = await import('recker/scrape') as any;

    const spiderOptions: Record<string, any> = {
      maxDepth: options.maxDepth ?? this.config.discovery?.maxDepth ?? 3,
      maxPages: options.maxPages ?? this.config.discovery?.maxUrls ?? 100,
      sameDomain: options.sameDomain ?? this.config.discovery?.sameDomainOnly ?? true,
      concurrency: options.concurrency ?? this.config.rateLimit?.concurrency ?? 5,
      delay: options.delay ?? (this.config.rateLimit?.interval ?? 100),
      timeout: options.timeout ?? 10000,
      respectRobotsTxt: options.respectRobotsTxt ?? this.config.discovery?.respectRobotsTxt ?? true,
      useSitemap: options.useSitemap ?? false,
      rotateUserAgent: options.rotateUserAgent ?? true,
      randomizeHeaders: options.randomizeHeaders ?? true,
      ...options,
    };

    if (this._crawlQueueAdapter) {
      spiderOptions.crawlQueue = this._crawlQueueAdapter;
    }

    if (this._crawlStorageAdapter) {
      spiderOptions.crawlStorage = this._crawlStorageAdapter;
    }

    if (this._proxyAdapter) {
      spiderOptions.proxy = this._proxyAdapter;
    }

    if (options.extract) {
      spiderOptions.extract = options.extract;
    }

    if (options.onPage) {
      spiderOptions.onPage = options.onPage;
    }

    if (options.onProgress) {
      spiderOptions.onProgress = options.onProgress;
    }

    const spider = new Spider(spiderOptions);

    this.logger.info({ startUrl, maxPages: spiderOptions.maxPages, maxDepth: spiderOptions.maxDepth }, 'Starting recker Spider crawl');

    const result = await spider.crawl(startUrl);

    this.logger.info({
      pages: result.pages?.length ?? 0,
      errors: result.errors?.length ?? 0,
      duration: result.duration,
    }, 'Recker Spider crawl completed');

    return result;
  }

  /**
   * Enqueue a crawl target
   */
  async enqueueTarget(target: any): Promise<any> {
    if (!target.url) {
      throw new PluginError('Target must have a url property');
    }

    // Match URL against patterns (if configured)
    let patternMatch: any = null;
    if (this.patternMatcher) {
      patternMatch = this.patternMatcher.match(target.url);
    }

    // Resolve activities: explicit > preset > pattern > default
    let activities: string[] = [];
    let activityPreset: string | null = null;

    if (target.activities && Array.isArray(target.activities) && target.activities.length > 0) {
      // User provided explicit activity list (highest priority)
      const validation = validateActivities(target.activities);
      if (!validation.valid) {
        throw new PluginError(validation.message || 'Invalid activities');
      }
      activities = target.activities;
    } else if (target.activityPreset) {
      // User provided a preset name
      const preset = getPreset(target.activityPreset);
      if (!preset) {
        throw new PluginError(`Unknown activity preset: ${target.activityPreset}. Available: ${Object.keys(ACTIVITY_PRESETS).join(', ')}`);
      }
      activities = preset.activities;
      activityPreset = target.activityPreset;
    } else if (patternMatch && patternMatch.activities && patternMatch.activities.length > 0) {
      // Pattern defines activities
      activities = patternMatch.activities;
    } else {
      // Default to 'full' preset if nothing specified
      activities = getAllActivities().map((a: any) => a.name);
      activityPreset = 'full';
    }

    // Merge metadata: target.metadata > pattern.params > pattern.metadata
    const metadata = {
      ...(patternMatch?.metadata || {}),
      ...(patternMatch?.params || {}),
      ...(target.metadata || {})
    };

    // Add pattern info to metadata if matched
    if (patternMatch && !patternMatch.isDefault) {
      metadata._pattern = patternMatch.pattern;
      metadata._params = patternMatch.params;
    }

    const task = {
      url: target.url,
      priority: target.priority || 0,
      metadata,
      activities,
      activityPreset,
      pattern: patternMatch?.pattern || null,
      params: patternMatch?.params || {},
      depth: target.depth || 0,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    // Mark as queued in discoverer (if enabled)
    if (this.linkDiscoverer) {
      this.linkDiscoverer.markQueued(target.url);
    }

    const targetsResource = await (this as any).database.getResource(this.resourceNames.targets);

    if (
      this.queueBackend === 's3'
      && targetsResource
      && typeof targetsResource.enqueue === 'function'
    ) {
      return await targetsResource.enqueue(task, {
        maxAttempts: this.config.queue.maxAttempts ?? this.config.queue.maxRetries ?? 3
      });
    }

    return await targetsResource.insert(task);
  }

  /**
   * Enqueue multiple targets
   */
  async enqueueBatch(targets: any[], defaultConfig: any = {}): Promise<any[]> {
    const results = [];

    for (const target of targets) {
      // Merge default config with target-specific config (target takes precedence)
      const mergedTarget = {
        ...defaultConfig,
        ...target,
        // Explicitly override activities if both are provided
        activities: target.activities || defaultConfig.activities,
        activityPreset: target.activityPreset || defaultConfig.activityPreset
      };

      const result = await this.enqueueTarget(mergedTarget);
      results.push(result);
    }

    return results;
  }

  /**
   * Get results for a crawl
   */
  async getResults(query: any = {}): Promise<any[]> {
    const resultsResource = await (this as any).database.getResource(this.resourceNames.results);
    return await resultsResource.query(query);
  }

  /**
   * Get SEO analysis for URLs
   */
  async getSEOAnalysis(query: any = {}): Promise<any[]> {
    const seoResource = await (this as any).database.getResource(this.resourceNames.seoAnalysis);
    return await seoResource.query(query);
  }

  /**
   * Get technology fingerprints
   */
  async getTechFingerprints(query: any = {}): Promise<any[]> {
    const techResource = await (this as any).database.getResource(this.resourceNames.techFingerprint);
    return await techResource.query(query);
  }

  /**
   * Get screenshots
   */
  async getScreenshots(query: any = {}): Promise<any[]> {
    const screenshotResource = await (this as any).database.getResource(this.resourceNames.screenshots);
    return await screenshotResource.query(query);
  }

  /**
   * Get security analysis records
   */
  async getSecurityAnalysis(query: any = {}): Promise<any[]> {
    const securityResource = await (this as any).database.getResource(this.resourceNames.securityAnalysis);
    return await securityResource.query(query);
  }

  /**
   * Get content analysis records (iframes, tracking pixels)
   */
  async getContentAnalysis(query: any = {}): Promise<any[]> {
    const contentResource = await (this as any).database.getResource(this.resourceNames.contentAnalysis);
    return await contentResource.query(query);
  }

  /**
   * Get storage analysis records (localStorage, IndexedDB, sessionStorage)
   */
  async getStorageAnalysis(query: any = {}): Promise<any[]> {
    const storageResource = await (this as any).database.getResource(this.resourceNames.storageAnalysis);
    return await storageResource.query(query);
  }

  /**
   * Get performance metrics records
   */
  async getPerformanceMetrics(query: any = {}): Promise<any[]> {
    const resultsResource = await (this as any).database.getResource(this.resourceNames.results);
    const results = await resultsResource.query(query);
    return results.filter((r: any) => r.performanceMetrics).map((r: any) => ({
      targetId: r.targetId,
      url: r.url,
      ...r.performanceMetrics
    }));
  }

  /**
   * Get assets analysis records (CSS, JS, images, videos, audios)
   */
  async getAssetsAnalysis(query: any = {}): Promise<any[]> {
    const assetsResource = await (this as any).database.getResource(this.resourceNames.assetsAnalysis);
    return await assetsResource.query(query);
  }

  // ============================================
  // PUPPETEER DETECTION API (exposed from PuppeteerPlugin)
  // ============================================

  /**
   * Detect anti-bot services and CAPTCHA implementations on a page
   */
  async detectAntiBotServices(page: any): Promise<any> {
    if (!this.puppeteerPlugin?.antiBotDetector) {
      throw new PluginError('Anti-bot detector not initialized. Ensure PuppeteerPlugin is initialized with consoleMonitor enabled.');
    }
    return await this.puppeteerPlugin.detectAntiBotServices(page);
  }

  /**
   * Detect browser fingerprinting capabilities and attempts
   */
  async detectFingerprinting(page: any): Promise<any> {
    if (!this.puppeteerPlugin?.antiBotDetector) {
      throw new PluginError('Anti-bot detector not initialized. Ensure PuppeteerPlugin is initialized with consoleMonitor enabled.');
    }
    return await this.puppeteerPlugin.detectFingerprinting(page);
  }

  /**
   * Comprehensive anti-bot and fingerprinting detection
   */
  async detectAntiBotsAndFingerprinting(page: any): Promise<any> {
    if (!this.puppeteerPlugin?.antiBotDetector) {
      throw new PluginError('Anti-bot detector not initialized. Ensure PuppeteerPlugin is initialized with consoleMonitor enabled.');
    }
    return await this.puppeteerPlugin.detectAntiBotsAndFingerprinting(page);
  }

  /**
   * Detect WebRTC peer connections and ICE candidates
   */
  async detectWebRTC(page: any): Promise<any> {
    if (!this.puppeteerPlugin?.webrtcStreamsDetector) {
      throw new PluginError('WebRTC/Streams detector not initialized. Ensure PuppeteerPlugin is initialized with consoleMonitor enabled.');
    }
    return await this.puppeteerPlugin.detectWebRTC(page);
  }

  /**
   * Detect media streams (audio, video, display capture)
   */
  async detectMediaStreams(page: any): Promise<any> {
    if (!this.puppeteerPlugin?.webrtcStreamsDetector) {
      throw new PluginError('WebRTC/Streams detector not initialized. Ensure PuppeteerPlugin is initialized with consoleMonitor enabled.');
    }
    return await this.puppeteerPlugin.detectMediaStreams(page);
  }

  /**
   * Detect streaming protocols (HLS, DASH, RTMP, etc.)
   */
  async detectStreamingProtocols(page: any): Promise<any> {
    if (!this.puppeteerPlugin?.webrtcStreamsDetector) {
      throw new PluginError('WebRTC/Streams detector not initialized. Ensure PuppeteerPlugin is initialized with consoleMonitor enabled.');
    }
    return await this.puppeteerPlugin.detectStreamingProtocols(page);
  }

  /**
   * Comprehensive WebRTC and streaming detection
   */
  async detectWebRTCAndStreams(page: any): Promise<any> {
    if (!this.puppeteerPlugin?.webrtcStreamsDetector) {
      throw new PluginError('WebRTC/Streams detector not initialized. Ensure PuppeteerPlugin is initialized with consoleMonitor enabled.');
    }
    return await this.puppeteerPlugin.detectWebRTCAndStreams(page);
  }

  /**
   * Capture all storage data (localStorage, sessionStorage, IndexedDB) from page
   */
  async captureAllStorage(page: any): Promise<any> {
    if (!this.puppeteerPlugin?.storageManager) {
      throw new PluginError('Storage manager not initialized. Ensure PuppeteerPlugin is initialized with consoleMonitor enabled.');
    }
    return await this.puppeteerPlugin.captureAllStorage(page);
  }

  /**
   * Get access to the underlying PuppeteerPlugin for advanced usage
   */
  getPuppeteerPlugin(): PuppeteerPlugin | null {
    return this.puppeteerPlugin;
  }

  /**
   * Navigate to a URL using the underlying PuppeteerPlugin
   */
  async navigate(url: string, options: any = {}): Promise<any> {
    if (!this.puppeteerPlugin) {
      throw new PluginError('PuppeteerPlugin not initialized');
    }
    return await this.puppeteerPlugin.navigate(url, options);
  }

  // ============================================
  // PATTERN MATCHING API
  // ============================================

  /**
   * Match a URL against configured patterns
   */
  matchUrl(url: string): any | null {
    if (!this.patternMatcher) {
      return null;
    }
    return this.patternMatcher.match(url);
  }

  /**
   * Check if a URL matches any pattern (quick check)
   */
  urlMatchesPattern(url: string): boolean {
    if (!this.patternMatcher) {
      return false;
    }
    return this.patternMatcher.matches(url);
  }

  /**
   * Add a new URL pattern at runtime
   */
  addPattern(name: string, config: any): void {
    if (!this.patternMatcher) {
      this.patternMatcher = new URLPatternMatcher({});
    }
    this.patternMatcher.addPattern(name, config);

    // Update link discoverer if active
    if (this.linkDiscoverer) {
      this.linkDiscoverer.setPatternMatcher(this.patternMatcher);
    }
  }

  /**
   * Remove a URL pattern
   */
  removePattern(name: string): void {
    if (this.patternMatcher) {
      this.patternMatcher.removePattern(name);
    }
  }

  /**
   * Get all configured pattern names
   */
  getPatternNames(): string[] {
    if (!this.patternMatcher) {
      return [];
    }
    return this.patternMatcher.getPatternNames();
  }

  /**
   * Filter URLs that match specific patterns
   */
  filterUrlsByPattern(urls: string[], patternNames: string[] = []): FilteredUrl[] {
    if (!this.patternMatcher) {
      return [];
    }
    return this.patternMatcher.filterUrls(urls, patternNames);
  }

  // ============================================
  // DISCOVERY API
  // ============================================

  /**
   * Get discovery statistics
   */
  getDiscoveryStats(): SpiderDiscoveryStatus {
    if (!this.linkDiscoverer) {
      return { enabled: false };
    }
    return {
      enabled: true,
      ...this.linkDiscoverer.getStats()
    };
  }

  /**
   * Reset discovery state (clear discovered/queued URLs)
   */
  resetDiscovery(): void {
    if (this.linkDiscoverer) {
      this.linkDiscoverer.reset();
    }
  }

  /**
   * Enable or configure auto-discovery at runtime
   */
  enableDiscovery(config: any = {}): void {
    const discoveryConfig = {
      ...this.config.discovery,
      ...config,
      enabled: true
    };

    this.config.discovery = discoveryConfig;

    if (!this.linkDiscoverer) {
      this.linkDiscoverer = new LinkDiscoverer(discoveryConfig);
      if (this.patternMatcher) {
        this.linkDiscoverer.setPatternMatcher(this.patternMatcher);
      }
    }
  }

  /**
   * Disable auto-discovery
   */
  disableDiscovery(): void {
    this.config.discovery.enabled = false;
  }

  /**
   * Get queue status
   */
  async getQueueStatus(): Promise<SpiderQueueStatus | null> {
    if (!this.queuePlugin) return null;

    const status = await (this.queuePlugin as any).getStatus?.()
      ?? await (this.queuePlugin as any).getStats?.()
      ?? {};

    return {
      ...status,
      backend: this.queueBackend,
      running: this.queueBackend === 'queue-consumer'
        ? (status.running ?? (this.queuePlugin as SpiderQueueConsumerBridge).consumers.length > 0)
        : (status.running ?? (this.queuePlugin as S3QueuePlugin).isRunning)
    };
  }

  /**
   * Start queue processing
   */
  async startProcessing(): Promise<void> {
    if (!this.queuePlugin) return;
    if (this.queueBackend === 's3' && this.queuePlugin instanceof S3QueuePlugin) {
      await this.queuePlugin.startProcessing(this.queueProcessor, {
        concurrency: this.config.queue.concurrency
      });
      return;
    }

    await this.queuePlugin.start();
  }

  /**
   * Stop queue processing
   */
  async stopProcessing(): Promise<void> {
    if (!this.queuePlugin) return;
    if (this.queueBackend === 's3' && this.queuePlugin instanceof S3QueuePlugin) {
      await this.queuePlugin.stopProcessing();
      return;
    }

    await this.queuePlugin.stop();
  }

  /**
   * Get persistence configuration
   */
  getPersistenceConfig(): SpiderPersistenceConfig {
    return {
      enabled: this.config.persistence.enabled,
      saveResults: this.config.persistence.saveResults,
      saveSEOAnalysis: this.config.persistence.saveSEOAnalysis,
      saveTechFingerprint: this.config.persistence.saveTechFingerprint,
      saveSecurityAnalysis: this.config.persistence.saveSecurityAnalysis,
      saveScreenshots: this.config.persistence.saveScreenshots,
      savePerformanceMetrics: this.config.persistence.savePerformanceMetrics
    };
  }

  /**
   * Enable persistence
   */
  enablePersistence(config: any = {}): void {
    this.config.persistence.enabled = true;
    if (config.saveResults !== undefined) this.config.persistence.saveResults = config.saveResults;
    if (config.saveSEOAnalysis !== undefined) this.config.persistence.saveSEOAnalysis = config.saveSEOAnalysis;
    if (config.saveTechFingerprint !== undefined) this.config.persistence.saveTechFingerprint = config.saveTechFingerprint;
    if (config.saveSecurityAnalysis !== undefined) this.config.persistence.saveSecurityAnalysis = config.saveSecurityAnalysis;
    if (config.saveScreenshots !== undefined) this.config.persistence.saveScreenshots = config.saveScreenshots;
    if (config.savePerformanceMetrics !== undefined) this.config.persistence.savePerformanceMetrics = config.savePerformanceMetrics;

    // 🪵 Debug: persistence enabled
    this.logger.debug({ persistenceConfig: this.getPersistenceConfig() }, 'Persistence enabled with config');
  }

  /**
   * Disable persistence
   */
  disablePersistence(): void {
    this.config.persistence.enabled = false;

    // 🪵 Debug: persistence disabled
    this.logger.debug('Persistence disabled');
  }

  // ============================================
  // ACTIVITY MANAGEMENT API
  // ============================================

  /**
   * Get all available activities
   */
  getAvailableActivities(): Activity[] {
    return getAllActivities();
  }

  /**
   * Get activities by category
   */
  getActivitiesByCategory(category: string): Activity[] {
    return getActivitiesByCategory(category);
  }

  /**
   * Get all activity categories with their activities
   */
  getActivityCategories(): Record<string, ActivityCategoryWithActivities> {
    return getCategoriesWithActivities();
  }

  /**
   * Get all available activity presets
   */
  getActivityPresets(): Record<string, ActivityPreset> {
    return ACTIVITY_PRESETS;
  }

  /**
   * Get a specific preset by name
   */
  getPresetByName(presetName: string): ActivityPreset | null {
    return getPreset(presetName);
  }

  /**
   * Validate a list of activity names
   */
  validateActivityList(activityNames: string[]): ValidationResult {
    return validateActivities(activityNames);
  }

  /**
   * Clear all crawl data
   */
  async clear(): Promise<void> {
    // Truncate resources
    for (const [key, resourceName] of Object.entries(this.resourceNames)) {
      const [ok] = await tryFn(async () => {
        const resource = await (this as any).database.getResource(resourceName);
        const allRecords = await resource.list();
        for (const record of allRecords) {
          await resource.delete(record.id);
        }
      });
    }
  }

  /**
   * Destroy SpiderPlugin
   * Closes browsers and stops processing
   */
  async destroy(): Promise<void> {
    try {
      if (this.queuePlugin) {
        await this.stopProcessing();
        await (this.queuePlugin as any).destroy?.();
      }

      if (this.puppeteerPlugin) {
        await this.puppeteerPlugin.stop();
        await (this.puppeteerPlugin as any).destroy?.();
      }

      if (this.ttlPlugin) {
        await this.ttlPlugin.stop();
        await (this.ttlPlugin as any).destroy?.();
      }

      await this._crawlQueueAdapter?.close?.();
      await this._crawlStorageAdapter?.close?.();
      await this._proxyAdapter?.close?.();

      this._crawlQueueAdapter = null;
      this._crawlStorageAdapter = null;
      this._proxyAdapter = null;

      this.initialized = false;
    } catch (error) {
      this.logger.error({ err: error }, '[SpiderPlugin] Destroy error');
    }
  }
}

export default SpiderPlugin;

// Export spider components for standalone use
export {
  LinkDiscoverer,
  DeepDiscovery,
  URLPatternMatcher,
  AVAILABLE_ACTIVITIES,
  ACTIVITY_CATEGORIES,
  ACTIVITY_PRESETS,
  getActivitiesByCategory,
  getAllActivities,
  getCategoriesWithActivities,
  validateActivities,
  getPreset
};
