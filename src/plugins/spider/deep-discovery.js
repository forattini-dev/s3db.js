/**
 * Deep Discovery - Advanced website intelligence gathering
 *
 * Implements comprehensive discovery strategies:
 * - Sitemap variants (numbered, subdomain, categorized, localized)
 * - Google News sitemaps (time-sensitive, last 2 days)
 * - Google Images sitemaps (image:image extension)
 * - Google Videos sitemaps + mRSS (video:video extension)
 * - Sitemap indexes (references multiple sitemaps)
 * - API endpoint detection (REST, GraphQL, JSON)
 * - Feed discovery (RSS, Atom, JSON Feed, mRSS)
 * - Static JSON/config files
 * - Framework detection (Next.js, Nuxt, Angular, React)
 * - robots.txt analysis for exposed paths
 * - E-commerce specific patterns (Shopify, Magento, WooCommerce)
 * - News portal patterns (WordPress, CMS APIs)
 *
 * Google Sitemap Extensions Supported:
 * - Standard sitemaps (sitemaps.org protocol)
 * - Google News: xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
 * - Google Images: xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
 * - Google Videos: xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"
 * - hreflang (localization): xmlns:xhtml="http://www.w3.org/1999/xhtml"
 * - mRSS (Media RSS): xmlns:media="http://search.yahoo.com/mrss/"
 *
 * Based on red team reconnaissance best practices.
 */

export class DeepDiscovery {
  constructor(config = {}) {
    this.config = {
      userAgent: config.userAgent || 's3db-spider',
      timeout: config.timeout || 10000,
      maxConcurrent: config.maxConcurrent || 10,
      checkSubdomains: config.checkSubdomains !== false,
      detectFrameworks: config.detectFrameworks !== false,
      detectEcommerce: config.detectEcommerce !== false,
      detectCMS: config.detectCMS !== false,
      fetcher: config.fetcher || null,
      ...config
    }

    this.discovered = {
      sitemaps: [],
      feeds: [],
      apis: [],
      staticFiles: [],
      frameworks: [],
      platforms: [],
      subdomains: [],
      exposedPaths: [],
      ampPages: [],           // NEW: AMP detection
      robotsDirectives: {}    // NEW: crawl-delay, Host, etc.
    }

    this.stats = {
      urlsProbed: 0,
      urlsFound: 0,
      errors: 0
    }

    // Crawler compatibility tracking
    this.crawlerCompatibility = {
      google: { score: 0, strengths: [], warnings: [] },
      bing: { score: 0, strengths: [], warnings: [] },
      yandex: { score: 0, strengths: [], warnings: [] },
      baidu: { score: 0, strengths: [], warnings: [] },
      duckduckgo: { score: 0, strengths: [], warnings: [] }
    }
  }

  /**
   * Run complete deep discovery on a domain
   *
   * @param {string} baseUrl - Base URL to discover (e.g., 'https://example.com')
   * @param {Object} options - Discovery options
   * @returns {Promise<DiscoveryReport>}
   */
  async discover(baseUrl, options = {}) {
    const opts = {
      includeSitemaps: options.includeSitemaps !== false,
      includeFeeds: options.includeFeeds !== false,
      includeAPIs: options.includeAPIs !== false,
      includeStatic: options.includeStatic !== false,
      analyzeRobots: options.analyzeRobots !== false,
      detectPlatform: options.detectPlatform !== false,
      ...options
    }

    const urlObj = new URL(baseUrl)
    const domain = `${urlObj.protocol}//${urlObj.host}`

    // Reset discovered data
    this.discovered = {
      sitemaps: [],
      feeds: [],
      apis: [],
      staticFiles: [],
      frameworks: [],
      platforms: [],
      subdomains: [],
      exposedPaths: []
    }

    // 1. Analyze robots.txt first (reveals structure)
    if (opts.analyzeRobots) {
      await this._analyzeRobotsTxt(domain)
    }

    // 2. Discover sitemaps (primary source)
    if (opts.includeSitemaps) {
      await this._discoverSitemaps(domain)
    }

    // 3. Discover feeds
    if (opts.includeFeeds) {
      await this._discoverFeeds(domain)
    }

    // 4. Detect platform and framework
    if (opts.detectPlatform) {
      await this._detectPlatform(domain)
    }

    // 5. Discover API endpoints
    if (opts.includeAPIs) {
      await this._discoverAPIs(domain)
    }

    // 6. Discover static files
    if (opts.includeStatic) {
      await this._discoverStaticFiles(domain)
    }

    // 7. Check subdomains if enabled
    if (this.config.checkSubdomains && opts.includeSubdomains) {
      await this._checkSubdomains(urlObj.host)
    }

    return this._generateReport(domain)
  }

  /**
   * Analyze robots.txt for exposed paths and sitemaps
   * @private
   */
  async _analyzeRobotsTxt(domain) {
    try {
      const robotsUrl = `${domain}/robots.txt`
      const content = await this._fetch(robotsUrl)

      if (!content) return

      const lines = content.split(/\r?\n/)
      const paths = new Set()
      const directives = {
        crawlDelay: null,
        yandexHost: null,
        noindex: false
      }

      for (const line of lines) {
        const trimmed = line.trim()

        // Extract sitemaps
        const sitemapMatch = trimmed.match(/^\s*sitemap:\s*(.+)/i)
        if (sitemapMatch) {
          this.discovered.sitemaps.push({
            url: sitemapMatch[1].trim(),
            source: 'robots.txt',
            priority: 10
          })
          continue
        }

        // Crawl-delay (Bing, Yandex) - Google ignores
        const crawlDelayMatch = trimmed.match(/^\s*crawl-delay:\s*(\d+)/i)
        if (crawlDelayMatch) {
          directives.crawlDelay = parseInt(crawlDelayMatch[1], 10)
          continue
        }

        // Host directive (Yandex-specific)
        const hostMatch = trimmed.match(/^\s*host:\s*(.+)/i)
        if (hostMatch) {
          directives.yandexHost = hostMatch[1].trim()
          continue
        }

        // Noindex (deprecated but Google still reads)
        if (trimmed.match(/^\s*noindex:/i)) {
          directives.noindex = true
          continue
        }

        // Extract disallowed paths (often reveal API structure)
        const disallowMatch = trimmed.match(/^\s*disallow:\s*(.+)/i)
        if (disallowMatch) {
          const path = disallowMatch[1].trim()
          if (path && path !== '/' && !path.includes('*')) {
            paths.add(path)
          }
        }

        // Extract allowed paths
        const allowMatch = trimmed.match(/^\s*allow:\s*(.+)/i)
        if (allowMatch) {
          const path = allowMatch[1].trim()
          if (path && path !== '/' && !path.includes('*')) {
            paths.add(path)
          }
        }
      }

      // Store directives
      this.discovered.robotsDirectives = directives

      // Score crawler compatibility based on directives
      if (directives.crawlDelay) {
        this.crawlerCompatibility.bing.strengths.push('Crawl-delay presente (respeitado)')
        this.crawlerCompatibility.yandex.strengths.push('Crawl-delay presente (respeitado)')
        this.crawlerCompatibility.google.warnings.push('Crawl-delay ignorado pelo Google')
      }

      if (directives.yandexHost) {
        this.crawlerCompatibility.yandex.strengths.push(`Host directive: ${directives.yandexHost}`)
      }

      // Analyze paths for API endpoints
      for (const path of paths) {
        if (this._looksLikeAPI(path)) {
          this.discovered.exposedPaths.push({
            path,
            type: 'api',
            source: 'robots.txt'
          })
        } else {
          this.discovered.exposedPaths.push({
            path,
            type: 'path',
            source: 'robots.txt'
          })
        }
      }

    } catch {
      // Ignore robots.txt errors
    }
  }

  /**
   * Discover all sitemap variants including Google News, Images, Videos
   * @private
   */
  async _discoverSitemaps(domain) {
    const variants = [
      // Standard locations
      '/sitemap.xml',
      '/sitemap_index.xml',
      '/sitemap-index.xml',
      '/sitemaps/sitemap.xml',
      '/sitemap/sitemap.xml',

      // Numbered variants (try 1-10)
      ...Array.from({ length: 10 }, (_, i) => `/sitemap${i + 1}.xml`),
      ...Array.from({ length: 10 }, (_, i) => `/sitemap-${i + 1}.xml`),
      ...Array.from({ length: 10 }, (_, i) => `/sitemap_${i + 1}.xml`),

      // Categorized sitemaps
      '/sitemap-products.xml',
      '/sitemap-categories.xml',
      '/sitemap-pages.xml',
      '/sitemap-posts.xml',
      '/sitemap-news.xml',
      '/sitemap-images.xml',
      '/sitemap-videos.xml',
      '/product-sitemap.xml',
      '/category-sitemap.xml',
      '/post-sitemap.xml',
      '/news-sitemap.xml',
      '/image-sitemap.xml',
      '/video-sitemap.xml',

      // Google News specific (últimos 2 dias)
      '/news-sitemap.xml',
      '/sitemap-news.xml',
      '/google-news-sitemap.xml',
      '/gnews-sitemap.xml',

      // Google Images specific
      '/image-sitemap.xml',
      '/images-sitemap.xml',
      '/sitemap-images.xml',
      '/sitemap-image.xml',

      // Google Videos specific
      '/video-sitemap.xml',
      '/videos-sitemap.xml',
      '/sitemap-videos.xml',
      '/sitemap-video.xml',
      '/videositemap.xml',

      // mRSS (alternativa a video sitemap)
      '/mrss.xml',
      '/feed/video',
      '/media-rss.xml',

      // Compressed
      '/sitemap.xml.gz',
      '/sitemap_index.xml.gz',
      '/news-sitemap.xml.gz',
      '/image-sitemap.xml.gz',
      '/video-sitemap.xml.gz',

      // Text format
      '/sitemap.txt',
      '/urls.txt',

      // CMS specific
      '/wp-sitemap.xml',
      '/wp-sitemap-posts-post-1.xml',
      '/sitemap_index.xml.xsl',
      '/sitemap.xsl',

      // Localized sitemaps
      '/sitemap-en.xml',
      '/sitemap-pt.xml',
      '/sitemap-es.xml',
      '/en/sitemap.xml',
      '/pt/sitemap.xml',
      '/es/sitemap.xml'
    ]

    const results = await this._probeUrls(domain, variants)

    for (const { url, exists, contentType } of results) {
      if (exists) {
        const sitemapType = this._detectSitemapType(url)

        // Fetch sitemap content to analyze priority/changefreq
        const sitemapAnalysis = await this._analyzeSitemapContent(url)

        this.discovered.sitemaps.push({
          url,
          type: sitemapType,
          contentType,
          source: 'probe',
          priority: this._getSitemapPriority(url, sitemapType),
          ...sitemapAnalysis
        })

        // Update crawler compatibility based on sitemap features
        this._scoreSitemapCompatibility(sitemapType, sitemapAnalysis)
      }
    }
  }

  /**
   * Discover RSS/Atom/JSON feeds
   * @private
   */
  async _discoverFeeds(domain) {
    const feedPaths = [
      // Generic feeds
      '/feed',
      '/feeds',
      '/rss',
      '/rss.xml',
      '/atom.xml',
      '/feed.xml',
      '/feed.json',

      // News feeds
      '/news/feed',
      '/news/rss',
      '/latest.xml',
      '/latest.json',
      '/breaking-news.json',
      '/api/articles/latest',

      // Blog feeds
      '/blog/feed',
      '/blog/rss',
      '/blog/atom.xml',

      // Category feeds
      '/category/feed',
      '/tag/feed',

      // WordPress
      '/feed/',
      '/?feed=rss2',
      '/?feed=atom',
      '/comments/feed',

      // JSON Feed
      '/feed.json',
      '/feeds/all.json',
      '/api/feed.json'
    ]

    const results = await this._probeUrls(domain, feedPaths)

    for (const { url, exists, contentType } of results) {
      if (exists) {
        const feedType = this._detectFeedType(url, contentType)
        this.discovered.feeds.push({
          url,
          type: feedType,
          contentType,
          source: 'probe'
        })
      }
    }
  }

  /**
   * Detect platform and framework
   * @private
   */
  async _detectPlatform(domain) {
    const detections = []

    // E-commerce platforms
    const ecommercePaths = {
      shopify: ['/products.json', '/cart.json', '/collections.json'],
      magento: ['/rest/V1/products', '/graphql', '/customer/account'],
      woocommerce: ['/wp-json/wc/v3/products', '/wp-json/wc/store/products'],
      prestashop: ['/api/', '/modules/'],
      bigcommerce: ['/api/v2/products', '/api/v3/catalog/products']
    }

    // CMS platforms
    const cmsPaths = {
      wordpress: ['/wp-json/wp/v2/posts', '/wp-admin', '/wp-content'],
      drupal: ['/jsonapi', '/node'],
      joomla: ['/api/', '/administrator'],
      ghost: ['/ghost/api/v3/content/', '/members/api']
    }

    // Frameworks
    const frameworkPaths = {
      nextjs: ['/_next/data', '/_next/static'],
      nuxt: ['/_nuxt/', '/.nuxt/'],
      angular: ['/main.js', '/polyfills.js', '/runtime.js'],
      react: ['/static/js/main', '/static/js/bundle'],
      vue: ['/js/app.js', '/js/chunk-vendors']
    }

    // Probe e-commerce
    for (const [platform, paths] of Object.entries(ecommercePaths)) {
      const results = await this._probeUrls(domain, paths)
      const foundCount = results.filter(r => r.exists).length

      if (foundCount > 0) {
        detections.push({
          type: 'ecommerce',
          platform,
          confidence: foundCount / paths.length,
          paths: results.filter(r => r.exists).map(r => r.url)
        })
      }
    }

    // Probe CMS
    for (const [platform, paths] of Object.entries(cmsPaths)) {
      const results = await this._probeUrls(domain, paths)
      const foundCount = results.filter(r => r.exists).length

      if (foundCount > 0) {
        detections.push({
          type: 'cms',
          platform,
          confidence: foundCount / paths.length,
          paths: results.filter(r => r.exists).map(r => r.url)
        })
      }
    }

    // Probe frameworks
    let spaDetected = false
    for (const [framework, paths] of Object.entries(frameworkPaths)) {
      const results = await this._probeUrls(domain, paths)
      const foundCount = results.filter(r => r.exists).length

      if (foundCount > 0) {
        detections.push({
          type: 'framework',
          platform: framework,
          confidence: foundCount / paths.length,
          paths: results.filter(r => r.exists).map(r => r.url)
        })

        // SPA frameworks trigger warnings for Baidu/Yandex
        spaDetected = true
      }
    }

    this.discovered.platforms = detections

    // Score platform compatibility
    if (spaDetected) {
      this.crawlerCompatibility.google.strengths.push('Renderiza JavaScript (SPA/React/Next.js)')
      this.crawlerCompatibility.bing.warnings.push('JS rendering fraco - use prerendering/SSR')
      this.crawlerCompatibility.yandex.warnings.push('Zero JS rendering - site HTML estático recomendado')
      this.crawlerCompatibility.baidu.warnings.push('Renderiza JS muito mal - precisa HTML direto')
    }

    // WordPress/traditional CMS gets bonus for Yandex/Baidu
    const traditionalCMS = detections.filter(d =>
      d.type === 'cms' && ['wordpress', 'drupal', 'joomla'].includes(d.platform)
    )
    if (traditionalCMS.length > 0 && !spaDetected) {
      this.crawlerCompatibility.yandex.strengths.push('HTML tradicional (sem SPA)')
      this.crawlerCompatibility.baidu.strengths.push('HTML direto detectado')
    }
  }

  /**
   * Discover API endpoints
   * @private
   */
  async _discoverAPIs(domain) {
    const apiPaths = [
      // Generic REST
      '/api',
      '/api/v1',
      '/api/v2',
      '/api/v3',
      '/rest',
      '/rest/v1',
      '/rest/V1',

      // GraphQL
      '/graphql',
      '/gql',
      '/api/graphql',

      // Search & autocomplete
      '/api/search',
      '/search/suggest.json',
      '/autocomplete',
      '/api/suggest',

      // Data endpoints
      '/api/data',
      '/api/config',
      '/api/settings',
      '/data.json',
      '/config.json',

      // Product endpoints (e-commerce)
      '/api/products',
      '/api/catalog',
      '/api/items',
      '/products.json',
      '/collections.json',

      // Content endpoints
      '/api/articles',
      '/api/posts',
      '/api/content',
      '/api/pages',

      // WordPress REST
      '/wp-json',
      '/wp-json/wp/v2',
      '/wp-json/wp/v2/posts',
      '/wp-json/wp/v2/pages',
      '/wp-json/wp/v2/categories',
      '/wp-json/wp/v2/tags',

      // Shopify
      '/cart.json',
      '/cart/add.js',
      '/recommendations/products.json',

      // Static data
      '/static/data',
      '/assets/data',
      '/.well-known'
    ]

    const results = await this._probeUrls(domain, apiPaths)

    for (const { url, exists, contentType } of results) {
      if (exists) {
        const apiType = this._detectAPIType(url, contentType)
        this.discovered.apis.push({
          url,
          type: apiType,
          contentType,
          source: 'probe'
        })
      }
    }
  }

  /**
   * Discover static JSON and config files
   * @private
   */
  async _discoverStaticFiles(domain) {
    const staticPaths = [
      // Configs
      '/config.json',
      '/settings.json',
      '/app.json',
      '/site.json',

      // Manifests
      '/manifest.json',
      '/package.json',
      '/composer.json',

      // Data files
      '/data.json',
      '/db.json',
      '/content.json',
      '/menu.json',
      '/navigation.json',
      '/routes.json',

      // Well-known
      '/.well-known/assetlinks.json',
      '/.well-known/apple-app-site-association',
      '/.well-known/security.txt',

      // Next.js
      '/_next/static/chunks/pages/_app.js',

      // Build info
      '/build-manifest.json',
      '/asset-manifest.json',
      '/version.json'
    ]

    const results = await this._probeUrls(domain, staticPaths)

    for (const { url, exists, contentType } of results) {
      if (exists) {
        this.discovered.staticFiles.push({
          url,
          contentType,
          source: 'probe'
        })
      }
    }
  }

  /**
   * Check common subdomains for sitemaps
   * @private
   */
  async _checkSubdomains(host) {
    const commonSubdomains = ['www', 'blog', 'news', 'shop', 'store', 'api', 'cdn', 'static', 'assets', 'media']
    const protocol = 'https://'

    const subdomainSitemaps = []

    for (const sub of commonSubdomains) {
      const subDomain = `${sub}.${host}`
      const url = `${protocol}${subDomain}/sitemap.xml`

      try {
        const exists = await this._urlExists(url)
        if (exists) {
          subdomainSitemaps.push({
            subdomain: subDomain,
            url,
            source: 'subdomain-probe'
          })
        }
      } catch {
        // Ignore errors
      }
    }

    this.discovered.subdomains = subdomainSitemaps
  }

  /**
   * Probe multiple URLs concurrently
   * @private
   */
  async _probeUrls(domain, paths) {
    const results = []

    // Process in batches for concurrency control
    for (let i = 0; i < paths.length; i += this.config.maxConcurrent) {
      const batch = paths.slice(i, i + this.config.maxConcurrent)

      const batchResults = await Promise.all(
        batch.map(async (path) => {
          const url = domain + path
          this.stats.urlsProbed++

          try {
            const exists = await this._urlExists(url)
            if (exists) this.stats.urlsFound++

            return {
              url,
              path,
              exists,
              contentType: exists ? await this._getContentType(url) : null
            }
          } catch {
            this.stats.errors++
            return { url, path, exists: false, contentType: null }
          }
        })
      )

      results.push(...batchResults)
    }

    return results
  }

  /**
   * Check if URL exists (HEAD request)
   * @private
   */
  async _urlExists(url) {
    if (this.config.fetcher) {
      try {
        await this.config.fetcher(url)
        return true
      } catch {
        return false
      }
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.config.timeout)

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'User-Agent': this.config.userAgent }
      })

      clearTimeout(timeout)
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Get content-type of URL
   * @private
   */
  async _getContentType(url) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: { 'User-Agent': this.config.userAgent }
      })
      return response.headers.get('content-type') || 'unknown'
    } catch {
      return 'unknown'
    }
  }

  /**
   * Fetch URL content
   * @private
   */
  async _fetch(url) {
    if (this.config.fetcher) {
      const result = await this.config.fetcher(url)
      return result.content || result
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': this.config.userAgent }
      })

      if (!response.ok) return null
      return await response.text()
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * Check if path looks like an API
   * @private
   */
  _looksLikeAPI(path) {
    const apiPatterns = [
      /\/api\//i,
      /\/rest\//i,
      /\/graphql/i,
      /\/wp-json/i,
      /\.json$/i,
      /\/v\d+\//i
    ]

    return apiPatterns.some(pattern => pattern.test(path))
  }

  /**
   * Detect sitemap type from URL
   * @private
   */
  _detectSitemapType(url) {
    const urlLower = url.toLowerCase()

    // Sitemap Index (highest priority - references multiple sitemaps)
    if (urlLower.includes('index')) return 'sitemap-index'

    // Google News (time-sensitive, last 2 days)
    if (urlLower.includes('news') || urlLower.includes('gnews')) return 'google-news'

    // Google Images
    if (urlLower.includes('image')) return 'google-images'

    // Google Videos or mRSS
    if (urlLower.includes('video') || urlLower.includes('mrss') || urlLower.includes('media-rss')) {
      return 'google-videos'
    }

    // Categorized
    if (urlLower.includes('product')) return 'products'
    if (urlLower.includes('categor')) return 'categories'
    if (urlLower.includes('post')) return 'posts'
    if (urlLower.includes('page')) return 'pages'

    // Localized
    if (/\/(en|pt|es|fr|de|it|ja|zh|ko)\//.test(urlLower) ||
        /sitemap-(en|pt|es|fr|de|it|ja|zh|ko)\.xml/.test(urlLower)) {
      return 'localized'
    }

    // Compressed
    if (urlLower.endsWith('.gz')) return 'compressed'

    // Text format
    if (urlLower.endsWith('.txt')) return 'text'

    return 'standard'
  }

  /**
   * Get sitemap priority based on type and name
   * @private
   */
  _getSitemapPriority(url, type) {
    // Type-based priority (Google recommendations)
    switch (type) {
      case 'sitemap-index': return 10  // Highest - references all others
      case 'google-news': return 9     // Time-sensitive (2 days)
      case 'google-videos': return 8   // Rich media, high engagement
      case 'google-images': return 8   // Rich media, high engagement
      case 'products': return 7        // E-commerce critical
      case 'categories': return 6
      case 'posts': return 5
      case 'pages': return 5
      case 'localized': return 4
      default: return 5
    }
  }

  /**
   * Detect feed type
   * @private
   */
  _detectFeedType(url, contentType) {
    if (url.includes('.json') || contentType?.includes('json')) return 'json'
    if (url.includes('atom') || contentType?.includes('atom')) return 'atom'
    if (url.includes('rss') || contentType?.includes('rss')) return 'rss'
    if (url.includes('mrss') || contentType?.includes('media-rss')) return 'mrss'
    return 'unknown'
  }

  /**
   * Detect API type
   * @private
   */
  _detectAPIType(url, contentType) {
    if (url.includes('graphql')) return 'graphql'
    if (url.includes('wp-json')) return 'wordpress-rest'
    if (contentType?.includes('json')) return 'rest'
    return 'unknown'
  }

  /**
   * Analyze sitemap content for Bing-specific features
   * @private
   */
  async _analyzeSitemapContent(url) {
    try {
      const content = await this._fetch(url)
      if (!content) return {}

      const analysis = {
        hasPriority: content.includes('<priority>'),
        hasChangefreq: content.includes('<changefreq>'),
        hasLastmod: content.includes('<lastmod>'),
        urlCount: (content.match(/<loc>/g) || []).length
      }

      // Detect AMP pages in sitemap
      if (content.includes('/amp/') || content.includes('.amp.html')) {
        const ampUrls = content.match(/<loc>([^<]*(?:\/amp\/|\.amp\.html)[^<]*)<\/loc>/gi) || []
        for (const match of ampUrls) {
          const urlMatch = match.match(/<loc>([^<]+)<\/loc>/i)
          if (urlMatch) {
            this.discovered.ampPages.push({
              url: urlMatch[1],
              source: 'sitemap'
            })
          }
        }
      }

      return analysis
    } catch {
      return {}
    }
  }

  /**
   * Score crawler compatibility based on sitemap features
   * @private
   */
  _scoreSitemapCompatibility(type, analysis) {
    // Google scoring
    if (type === 'google-news') {
      this.crawlerCompatibility.google.strengths.push('News sitemap presente (excelente)')
      this.crawlerCompatibility.bing.warnings.push('News sitemap fraco no Bing')
      this.crawlerCompatibility.yandex.strengths.push('News sitemap funciona')
    }

    if (type === 'google-images') {
      this.crawlerCompatibility.google.strengths.push('Image sitemap presente')
    }

    if (type === 'google-videos') {
      this.crawlerCompatibility.google.strengths.push('Video sitemap presente')
      this.crawlerCompatibility.baidu.warnings.push('Suporte instável a video sitemaps')
    }

    if (type === 'sitemap-index') {
      this.crawlerCompatibility.google.strengths.push('Sitemap index bem estruturado')
      this.crawlerCompatibility.bing.strengths.push('Sitemap index bem estruturado')
      this.crawlerCompatibility.baidu.warnings.push('Sitemap index pode quebrar no Baidu')
    }

    // Bing-specific
    if (analysis.hasPriority) {
      this.crawlerCompatibility.bing.strengths.push('<priority> presente (Bing usa)')
      this.crawlerCompatibility.google.warnings.push('<priority> ignorado pelo Google')
    }

    if (analysis.hasChangefreq) {
      this.crawlerCompatibility.bing.strengths.push('<changefreq> presente (Bing usa)')
      this.crawlerCompatibility.google.warnings.push('<changefreq> ignorado pelo Google')
    }

    // Lastmod (important for all)
    if (analysis.hasLastmod) {
      this.crawlerCompatibility.google.strengths.push('<lastmod> presente e confiável')
      this.crawlerCompatibility.bing.strengths.push('<lastmod> presente')
    }

    // Large sitemaps
    if (analysis.urlCount > 10000) {
      this.crawlerCompatibility.baidu.warnings.push(`Sitemap grande (${analysis.urlCount} URLs) - Baidu pode quebrar`)
    }
  }

  /**
   * Calculate crawler compatibility scores
   * @private
   */
  _calculateCrawlerScores() {
    for (const crawler of Object.keys(this.crawlerCompatibility)) {
      const compat = this.crawlerCompatibility[crawler]
      let score = 5.0 // baseline

      // Add points for strengths (max +5)
      score += Math.min(compat.strengths.length * 0.5, 5)

      // Subtract points for warnings (max -5)
      score -= Math.min(compat.warnings.length * 0.5, 5)

      // Cap between 0-10
      compat.score = Math.max(0, Math.min(10, score))
    }

    // DuckDuckGo inherits from Bing
    this.crawlerCompatibility.duckduckgo = {
      score: this.crawlerCompatibility.bing.score,
      strengths: [...this.crawlerCompatibility.bing.strengths],
      warnings: [...this.crawlerCompatibility.bing.warnings, 'Usa resultados do Bing']
    }
  }

  /**
   * Estimate crawl budget and time
   * @private
   */
  _estimateCrawlBudget() {
    const totalUrls = this.discovered.sitemaps.reduce((sum, s) => sum + (s.urlCount || 0), 0)
    const crawlDelay = this.discovered.robotsDirectives.crawlDelay || 0

    return {
      estimatedPageCount: totalUrls,
      crawlDelay: crawlDelay,
      estimatedCrawlTime: {
        google: this._formatTime(totalUrls * 0.5), // 0.5s per URL (fast, no delay)
        bing: this._formatTime(totalUrls * (1 + crawlDelay)), // respects delay
        yandex: this._formatTime(totalUrls * (2 + crawlDelay)), // slower + delay
        baidu: this._formatTime(totalUrls * 1.5), // medium speed, ignores delay
        duckduckgo: this._formatTime(totalUrls * (1 + crawlDelay)) // same as Bing
      }
    }
  }

  /**
   * Format seconds to human-readable time
   * @private
   */
  _formatTime(seconds) {
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}min`
    return `${(seconds / 3600).toFixed(1)}h`
  }

  /**
   * Generate discovery report
   * @private
   */
  _generateReport(domain) {
    // Calculate final scores
    this._calculateCrawlerScores()

    // Estimate crawl budget
    const crawlBudget = this._estimateCrawlBudget()

    return {
      domain,
      timestamp: new Date().toISOString(),
      stats: { ...this.stats },
      discovered: {
        sitemaps: this.discovered.sitemaps.sort((a, b) => b.priority - a.priority),
        feeds: this.discovered.feeds,
        apis: this.discovered.apis,
        staticFiles: this.discovered.staticFiles,
        platforms: this.discovered.platforms.sort((a, b) => b.confidence - a.confidence),
        subdomains: this.discovered.subdomains,
        exposedPaths: this.discovered.exposedPaths,
        ampPages: this.discovered.ampPages,
        robotsDirectives: this.discovered.robotsDirectives
      },
      crawlerCompatibility: this.crawlerCompatibility,
      crawlBudget,
      summary: {
        sitemapCount: this.discovered.sitemaps.length,
        feedCount: this.discovered.feeds.length,
        apiCount: this.discovered.apis.length,
        staticFileCount: this.discovered.staticFiles.length,
        platformCount: this.discovered.platforms.length,
        subdomainCount: this.discovered.subdomains.length,
        exposedPathCount: this.discovered.exposedPaths.length,
        ampPageCount: this.discovered.ampPages.length,
        totalFound: this.stats.urlsFound,
        totalProbed: this.stats.urlsProbed,
        successRate: ((this.stats.urlsFound / this.stats.urlsProbed) * 100).toFixed(2) + '%'
      }
    }
  }

  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    return { ...this.stats }
  }
}

/**
 * @typedef {Object} DiscoveryReport
 * @property {string} domain - Target domain
 * @property {string} timestamp - Discovery timestamp
 * @property {Object} stats - Discovery statistics
 * @property {Object} discovered - Discovered resources
 * @property {Object} summary - Summary metrics
 */

export default DeepDiscovery
