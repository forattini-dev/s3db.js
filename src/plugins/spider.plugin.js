import { Plugin } from './plugin.class.js'
import { requirePluginDependency } from './concerns/plugin-dependencies.js'
import { getValidatedNamespace } from './namespace.js'
import { PuppeteerPlugin } from './puppeteer.plugin.js'
import { S3QueuePlugin } from './s3-queue.plugin.js'
import { TTLPlugin } from './ttl.plugin.js'
import tryFn from '../concerns/try-fn.js'
import { PluginError } from '../errors.js'

/**
 * SpiderPlugin - All-in-one web crawler suite
 *
 * Meta-plugin bundling:
 * - PuppeteerPlugin (browser automation)
 * - S3QueuePlugin (distributed queue)
 * - TTLPlugin (auto cleanup)
 *
 * Features:
 * - SEO analysis (meta tags, OpenGraph, Twitter Cards)
 * - Asset extraction (CSS, JS, images, videos, audios)
 * - Technology fingerprinting (frameworks, analytics, CDN, etc.)
 * - Performance metrics collection
 * - Distributed crawling with auto-retry
 *
 * @extends Plugin
 */
export class SpiderPlugin extends Plugin {
  constructor(options = {}) {
    super(options)

    // Validate namespace
    this.namespace = getValidatedNamespace(options, 'spider')

    // Configuration
    this.config = {
      verbose: this.verbose,

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
      }
    }

    // Resource names
    this.resourceNames = {
      targets: `${this.config.resourcePrefix}_targets`,
      results: `${this.config.resourcePrefix}_results`,
      ttlCohorts: `${this.config.resourcePrefix}_ttl_cohorts`,
      seoAnalysis: `${this.config.resourcePrefix}_seo_analysis`,
      techFingerprint: `${this.config.resourcePrefix}_tech_fingerprint`,
      securityAnalysis: `${this.config.resourcePrefix}_security_analysis`,
      screenshots: `${this.config.resourcePrefix}_screenshots`
    }

    // Plugin instances
    this.puppeteerPlugin = null
    this.queuePlugin = null
    this.ttlPlugin = null

    // SEO and tech detection modules
    this.seoAnalyzer = null
    this.techDetector = null
  }

  /**
   * Initialize SpiderPlugin
   * Creates and initializes bundled plugins
   */
  async initialize() {
    if (this.initialized) return

    try {
      // Verify Puppeteer dependency
      requirePluginDependency('puppeteer', 'SpiderPlugin')

      if (this.verbose) {
        console.log('[SpiderPlugin] Initializing bundled plugins...')
      }

      // Initialize PuppeteerPlugin
      this.puppeteerPlugin = new PuppeteerPlugin({
        ...this.config.puppeteer,
        namespace: this.namespace,
        verbose: this.verbose
      })
      await this.puppeteerPlugin.initialize(this.database)

      // Initialize S3QueuePlugin
      this.queuePlugin = new S3QueuePlugin({
        ...this.config.queue,
        namespace: this.namespace,
        resource: this.resourceNames.targets,
        verbose: this.verbose
      })
      await this.queuePlugin.initialize(this.database)

      // Initialize TTLPlugin if enabled
      if (this.config.ttl.enabled) {
        this.ttlPlugin = new TTLPlugin({
          resources: [
            {
              name: this.resourceNames.targets,
              ttl: this.config.ttl.queue.ttl
            }
          ],
          verbose: this.verbose
        })
        await this.ttlPlugin.initialize(this.database)
      }

      // Load SEO analyzer, tech detector, and security analyzer
      const { SEOAnalyzer } = await import('./spider/seo-analyzer.js')
      const { TechDetector } = await import('./spider/tech-detector.js')
      const { SecurityAnalyzer } = await import('./spider/security-analyzer.js')

      this.seoAnalyzer = new SEOAnalyzer(this.config.seo)
      this.techDetector = new TechDetector(this.config.techDetection)
      this.securityAnalyzer = new SecurityAnalyzer(this.config.security)

      // Create resources
      await this._createResources()

      // Set queue processor
      await this._setupQueueProcessor()

      this.initialized = true

      if (this.verbose) {
        console.log('[SpiderPlugin] Initialized successfully')
      }
    } catch (error) {
      throw new PluginError(
        `SpiderPlugin initialization failed: ${error.message}`,
        { cause: error }
      )
    }
  }

  /**
   * Create required resources
   * @private
   */
  async _createResources() {
    const resourceConfig = {
      targets: {
        name: this.resourceNames.targets,
        attributes: {
          url: 'string|required',
          status: 'string',
          priority: 'number',
          retries: 'number',
          metadata: 'object',
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
      }
    }

    for (const [key, config] of Object.entries(resourceConfig)) {
      const [ok, err] = await tryFn(async () => {
        return await this.database.createResource(config)
      })

      if (ok) {
        if (this.verbose) {
          console.log(`[SpiderPlugin] Created resource: ${config.name}`)
        }
      } else if (err?.code !== 'ResourceAlreadyExists') {
        throw err
      }
    }
  }

  /**
   * Setup queue processor function
   * @private
   */
  async _setupQueueProcessor() {
    const processor = async (task, context) => {
      const startTime = Date.now()

      try {
        if (this.verbose) {
          console.log(`[SpiderPlugin] Processing: ${task.url}`)
        }

        // Open browser page
        const page = await this.puppeteerPlugin.openPage({
          url: task.url,
          waitUntil: 'networkidle2'
        })

        // Collect data
        const html = await page.content()
        const statusCode = page.response()?.status() || 200
        const title = await page.title()

        // SEO Analysis
        let seoAnalysis = null
        if (this.config.seo.enabled) {
          seoAnalysis = this.seoAnalyzer.analyze(html, task.url)
        }

        // Tech Detection
        let techFingerprint = null
        if (this.config.techDetection.enabled) {
          techFingerprint = this.techDetector.fingerprint(html)
        }

        // Performance Metrics
        let performanceMetrics = null
        if (this.config.performance.enabled) {
          performanceMetrics = await this.puppeteerPlugin.performanceManager.collectMetrics(page)
        }

        // Security Analysis
        let securityAnalysis = null
        if (this.config.security.enabled) {
          securityAnalysis = await this.securityAnalyzer.analyze(page, task.url, html)
        }

        // Screenshot Capture
        let screenshotData = null
        if (this.config.screenshot.enabled) {
          try {
            const screenshotBuffer = await page.screenshot({
              fullPage: this.config.screenshot.captureFullPage,
              type: this.config.screenshot.format,
              quality: this.config.screenshot.format === 'jpeg' ? this.config.screenshot.quality : undefined
            })

            // Convert to base64 for storage
            const screenshotBase64 = screenshotBuffer.toString('base64')
            const mimeType = this.config.screenshot.format === 'jpeg' ? 'image/jpeg' : 'image/png'

            screenshotData = {
              screenshot: screenshotBase64,
              screenshotMimeType: mimeType,
              width: this.config.screenshot.maxWidth,
              height: this.config.screenshot.maxHeight,
              format: this.config.screenshot.format,
              quality: this.config.screenshot.quality
            }
          } catch (error) {
            console.error(`[SpiderPlugin] Failed to capture screenshot for ${task.url}:`, error)
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
        }

        // Store results based on persistence configuration
        if (this.config.persistence.enabled) {
          // Store main result if enabled
          if (this.config.persistence.saveResults) {
            const resultsResource = await this.database.getResource(this.resourceNames.results)
            await tryFn(async () => {
              return await resultsResource.insert(result)
            })
          }

          // Store SEO analysis separately if available and enabled
          if (seoAnalysis && this.config.persistence.saveSEOAnalysis) {
            const seoResource = await this.database.getResource(this.resourceNames.seoAnalysis)
            await tryFn(async () => {
              return await seoResource.insert({
                targetId: task.id,
                url: task.url,
                ...seoAnalysis
              })
            })
          }

          // Store tech fingerprint separately if available and enabled
          if (techFingerprint && this.config.persistence.saveTechFingerprint) {
            const techResource = await this.database.getResource(this.resourceNames.techFingerprint)
            await tryFn(async () => {
              return await techResource.insert({
                targetId: task.id,
                url: task.url,
                ...techFingerprint
              })
            })
          }

          // Store security analysis separately if available and enabled
          if (securityAnalysis && this.config.persistence.saveSecurityAnalysis) {
            const securityResource = await this.database.getResource(this.resourceNames.securityAnalysis)
            await tryFn(async () => {
              return await securityResource.insert({
                targetId: task.id,
                url: task.url,
                ...securityAnalysis
              })
            })
          }

          // Store screenshot separately if available and enabled
          if (screenshotData && this.config.persistence.saveScreenshots) {
            const screenshotResource = await this.database.getResource(this.resourceNames.screenshots)
            await tryFn(async () => {
              return await screenshotResource.insert({
                targetId: task.id,
                url: task.url,
                ...screenshotData,
                capturedAt: Date.now()
              })
            })
          }

          // Store performance metrics if available and enabled
          if (performanceMetrics && this.config.persistence.savePerformanceMetrics) {
            // Performance metrics are already included in results, but can be logged separately
            if (this.verbose) {
              console.log(`[SpiderPlugin] Persisted performance metrics for ${task.url}`)
            }
          }
        } else {
          // If persistence disabled, store minimal data (for queue tracking)
          if (this.verbose) {
            console.log(`[SpiderPlugin] Persistence disabled, skipping storage for ${task.url}`)
          }
        }

        // Close page
        await page.close()

        return result
      } catch (error) {
        console.error(`[SpiderPlugin] Error processing ${task.url}:`, error)
        throw error
      }
    }

    // Set processor on queue plugin
    this.queuePlugin.setProcessor(processor)
  }

  /**
   * Enqueue a crawl target
   *
   * @param {Object} target - Target configuration
   * @param {string} target.url - URL to crawl
   * @param {number} [target.priority=0] - Task priority
   * @param {Object} [target.metadata] - Custom metadata
   * @returns {Promise<Object>} Queued task
   */
  async enqueueTarget(target) {
    if (!target.url) {
      throw new PluginError('Target must have a url property')
    }

    const task = {
      url: target.url,
      priority: target.priority || 0,
      metadata: target.metadata || {},
      status: 'pending'
    }

    const targetsResource = await this.database.getResource(this.resourceNames.targets)
    return await targetsResource.insert(task)
  }

  /**
   * Enqueue multiple targets
   *
   * @param {Array<Object>} targets - Array of target configurations
   * @returns {Promise<Array>} Array of queued tasks
   */
  async enqueueBatch(targets) {
    const results = []

    for (const target of targets) {
      const result = await this.enqueueTarget(target)
      results.push(result)
    }

    return results
  }

  /**
   * Get results for a crawl
   *
   * @param {Object} [query] - Query parameters
   * @returns {Promise<Array>} Array of results
   */
  async getResults(query = {}) {
    const resultsResource = await this.database.getResource(this.resourceNames.results)
    return await resultsResource.query(query)
  }

  /**
   * Get SEO analysis for URLs
   *
   * @param {Object} [query] - Query parameters
   * @returns {Promise<Array>} Array of SEO analysis records
   */
  async getSEOAnalysis(query = {}) {
    const seoResource = await this.database.getResource(this.resourceNames.seoAnalysis)
    return await seoResource.query(query)
  }

  /**
   * Get technology fingerprints
   *
   * @param {Object} [query] - Query parameters
   * @returns {Promise<Array>} Array of tech fingerprint records
   */
  async getTechFingerprints(query = {}) {
    const techResource = await this.database.getResource(this.resourceNames.techFingerprint)
    return await techResource.query(query)
  }

  /**
   * Get screenshots
   *
   * @param {Object} [query] - Query parameters
   * @returns {Promise<Array>} Array of screenshot records
   */
  async getScreenshots(query = {}) {
    const screenshotResource = await this.database.getResource(this.resourceNames.screenshots)
    return await screenshotResource.query(query)
  }

  /**
   * Get queue status
   *
   * @returns {Promise<Object>} Queue statistics
   */
  async getQueueStatus() {
    return await this.queuePlugin.getStatus()
  }

  /**
   * Start queue processing
   *
   * @returns {Promise<void>}
   */
  async startProcessing() {
    return await this.queuePlugin.start()
  }

  /**
   * Stop queue processing
   *
   * @returns {Promise<void>}
   */
  async stopProcessing() {
    return await this.queuePlugin.stop()
  }

  /**
   * Get persistence configuration
   *
   * @returns {Object} Persistence settings
   */
  getPersistenceConfig() {
    return {
      enabled: this.config.persistence.enabled,
      saveResults: this.config.persistence.saveResults,
      saveSEOAnalysis: this.config.persistence.saveSEOAnalysis,
      saveTechFingerprint: this.config.persistence.saveTechFingerprint,
      saveSecurityAnalysis: this.config.persistence.saveSecurityAnalysis,
      saveScreenshots: this.config.persistence.saveScreenshots,
      savePerformanceMetrics: this.config.persistence.savePerformanceMetrics
    }
  }

  /**
   * Enable persistence
   *
   * @param {Object} [config] - Partial persistence configuration
   * @returns {void}
   */
  enablePersistence(config = {}) {
    this.config.persistence.enabled = true
    if (config.saveResults !== undefined) this.config.persistence.saveResults = config.saveResults
    if (config.saveSEOAnalysis !== undefined) this.config.persistence.saveSEOAnalysis = config.saveSEOAnalysis
    if (config.saveTechFingerprint !== undefined) this.config.persistence.saveTechFingerprint = config.saveTechFingerprint
    if (config.saveSecurityAnalysis !== undefined) this.config.persistence.saveSecurityAnalysis = config.saveSecurityAnalysis
    if (config.saveScreenshots !== undefined) this.config.persistence.saveScreenshots = config.saveScreenshots
    if (config.savePerformanceMetrics !== undefined) this.config.persistence.savePerformanceMetrics = config.savePerformanceMetrics

    if (this.verbose) {
      console.log('[SpiderPlugin] Persistence enabled with config:', this.getPersistenceConfig())
    }
  }

  /**
   * Disable persistence
   *
   * @returns {void}
   */
  disablePersistence() {
    this.config.persistence.enabled = false

    if (this.verbose) {
      console.log('[SpiderPlugin] Persistence disabled')
    }
  }

  /**
   * Clear all crawl data
   *
   * @returns {Promise<void>}
   */
  async clear() {
    // Truncate resources
    for (const [key, resourceName] of Object.entries(this.resourceNames)) {
      const [ok] = await tryFn(async () => {
        const resource = await this.database.getResource(resourceName)
        const allRecords = await resource.list()
        for (const record of allRecords) {
          await resource.delete(record.id)
        }
      })
    }
  }

  /**
   * Destroy SpiderPlugin
   * Closes browsers and stops processing
   */
  async destroy() {
    try {
      if (this.queuePlugin) {
        await this.queuePlugin.destroy()
      }

      if (this.puppeteerPlugin) {
        await this.puppeteerPlugin.destroy()
      }

      if (this.ttlPlugin) {
        await this.ttlPlugin.destroy()
      }

      this.initialized = false
    } catch (error) {
      console.error('[SpiderPlugin] Destroy error:', error)
    }
  }
}

export default SpiderPlugin
