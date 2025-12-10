/// <reference lib="dom" />

import { Plugin, type PluginConfig } from './plugin.class.js';
import { requirePluginDependency } from './concerns/plugin-dependencies.js';
import { getValidatedNamespace } from './namespace.js';
import { PuppeteerPlugin } from './puppeteer.plugin.js';
import { S3QueuePlugin } from './s3-queue.plugin.js';
import { TTLPlugin } from './ttl.plugin.js';
import tryFn from '../concerns/try-fn.js';
import { PluginError } from '../errors.js';
import { createLogger } from '../concerns/logger.js';
import {
  AVAILABLE_ACTIVITIES,
  ACTIVITY_CATEGORIES,
  ACTIVITY_PRESETS,
  getActivitiesByCategory,
  getAllActivities,
  getCategoriesWithActivities,
  validateActivities,
  getPreset
} from './spider/task-activities.js';
import { analyzeIFrames, detectTrackingPixels } from './spider/content-analyzer.js';
import { analyzeAllStorage } from './spider/storage-analyzer.js';
import { URLPatternMatcher } from './spider/url-pattern-matcher.js';
import { LinkDiscoverer } from './spider/link-discoverer.js';
import { DeepDiscovery } from './spider/deep-discovery.js';

export interface SpiderPluginConfig {
  logLevel?: string;
  namespace?: string;
  resourcePrefix?: string;
  puppeteer?: Record<string, any>;
  queue?: Record<string, any>;
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
  logger?: any;
}

export class SpiderPlugin extends Plugin {
  config: any;
  resourceNames: Record<string, string>;
  puppeteerPlugin: PuppeteerPlugin | null;
  queuePlugin: S3QueuePlugin | null;
  ttlPlugin: TTLPlugin | null;
  seoAnalyzer: any | null;
  techDetector: any | null;
  securityAnalyzer: any | null;
  patternMatcher: URLPatternMatcher | null;
  linkDiscoverer: LinkDiscoverer | null;
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
        autoStart: true,
        concurrency: 5,
        maxRetries: 3,
        retryDelay: 1000,
        ...options.queue
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
    this.ttlPlugin = null;

    // SEO and tech detection modules
    this.seoAnalyzer = null;
    this.techDetector = null;
    this.securityAnalyzer = null;

    // Pattern matching and discovery
    this.patternMatcher = null;
    this.linkDiscoverer = null;

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

  /**
   * Initialize SpiderPlugin
   * Creates and initializes bundled plugins
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Verify Puppeteer dependency
      requirePluginDependency('puppeteer', 'SpiderPlugin');

      // 🪵 Debug: initializing bundled plugins
      this.logger.debug('Initializing bundled plugins (Puppeteer, S3Queue, TTL)');

      // Initialize PuppeteerPlugin
      this.puppeteerPlugin = new PuppeteerPlugin({
        ...this.config.puppeteer,
        namespace: this.namespace,
        logLevel: (this as any).logLevel
      });
      await (this.puppeteerPlugin as any).initialize((this as any).database);

      // Initialize S3QueuePlugin
      this.queuePlugin = new S3QueuePlugin({
        ...this.config.queue,
        namespace: this.namespace,
        resource: this.resourceNames.targets,
        logLevel: (this as any).logLevel
      });
      await (this.queuePlugin as any).initialize((this as any).database);

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
        await (this.ttlPlugin as any).initialize((this as any).database);
      }

      // Load SEO analyzer, tech detector, and security analyzer
      const { SEOAnalyzer } = await import('./spider/seo-analyzer.js');
      const { TechDetector } = await import('./spider/tech-detector.js');
      const { SecurityAnalyzer } = await import('./spider/security-analyzer.js');

      this.seoAnalyzer = new SEOAnalyzer(this.config.seo);
      this.techDetector = new TechDetector(this.config.techDetection);
      this.securityAnalyzer = new SecurityAnalyzer(this.config.security);

      // Create resources
      await this._createResources();

      // Set queue processor
      await this._setupQueueProcessor();

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
          createdAt: 'number'
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
          createdAt: 'number',
          processingTime: 'number'
        },
        behavior: 'body-overflow',
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
          createdAt: 'number'
        },
        behavior: 'body-overflow',
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
          createdAt: 'number'
        },
        behavior: 'body-overflow',
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
          createdAt: 'number'
        },
        behavior: 'body-overflow',
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
          capturedAt: 'number'
        },
        behavior: 'body-overflow',
        timestamps: true
      },
      contentAnalysis: {
        name: this.resourceNames.contentAnalysis,
        attributes: {
          targetId: 'string|required',
          url: 'string|required',
          iframes: 'object',
          trackingPixels: 'object',
          createdAt: 'number'
        },
        behavior: 'body-overflow',
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
          createdAt: 'number'
        },
        behavior: 'body-overflow',
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
          createdAt: 'number'
        },
        behavior: 'body-overflow',
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
    return categoryActivities.some((activity: any) => task.activities.includes(activity.name));
  }

  /**
   * Get which specific activities from a category should run
   */
  _getRequestedActivities(task: any, category: string): string[] {
    if (!task.activities || task.activities.length === 0) {
      // Return all activities from category
      return getActivitiesByCategory(category).map((a: any) => a.name);
    }

    const categoryActivities = getActivitiesByCategory(category);
    return categoryActivities
      .filter((activity: any) => task.activities.includes(activity.name))
      .map((a: any) => a.name);
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

        // Open browser page using navigate method
        const page = await this.puppeteerPlugin!.navigate(task.url, {
          waitUntil: 'networkidle2'
        });

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
                ...seoAnalysis
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
                ...techFingerprint
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
                ...securityAnalysis
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
                capturedAt: Date.now()
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
                ...contentAnalysis
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
                ...storageAnalysis
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
                ...assetsAnalysis
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

    // Set processor on queue plugin
    (this.queuePlugin as any).setProcessor(processor);
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
      status: 'pending'
    };

    // Mark as queued in discoverer (if enabled)
    if (this.linkDiscoverer) {
      this.linkDiscoverer.markQueued(target.url);
    }

    const targetsResource = await (this as any).database.getResource(this.resourceNames.targets);
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
  filterUrlsByPattern(urls: string[], patternNames: string[] = []): Array<{ url: string; match: any }> {
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
  getDiscoveryStats(): any {
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
  async getQueueStatus(): Promise<any> {
    if (!this.queuePlugin) return null;
    return await (this.queuePlugin as any).getStatus?.() ?? (this.queuePlugin as any).getStats?.();
  }

  /**
   * Start queue processing
   */
  async startProcessing(): Promise<void> {
    if (!this.queuePlugin) return;
    return await this.queuePlugin.start();
  }

  /**
   * Stop queue processing
   */
  async stopProcessing(): Promise<void> {
    if (!this.queuePlugin) return;
    return await this.queuePlugin.stop();
  }

  /**
   * Get persistence configuration
   */
  getPersistenceConfig(): any {
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
  getAvailableActivities(): any[] {
    return getAllActivities();
  }

  /**
   * Get activities by category
   */
  getActivitiesByCategory(category: string): any[] {
    return getActivitiesByCategory(category);
  }

  /**
   * Get all activity categories with their activities
   */
  getActivityCategories(): any {
    return getCategoriesWithActivities();
  }

  /**
   * Get all available activity presets
   */
  getActivityPresets(): Record<string, any> {
    return ACTIVITY_PRESETS;
  }

  /**
   * Get a specific preset by name
   */
  getPresetByName(presetName: string): any | null {
    return getPreset(presetName);
  }

  /**
   * Validate a list of activity names
   */
  validateActivityList(activityNames: string[]): { valid: boolean; message?: string; invalidActivities?: string[] } {
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
        await (this.queuePlugin as any).destroy?.();
      }

      if (this.puppeteerPlugin) {
        await (this.puppeteerPlugin as any).destroy?.();
      }

      if (this.ttlPlugin) {
        await (this.ttlPlugin as any).destroy?.();
      }

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
