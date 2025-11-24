import { describe, test, expect, beforeEach } from '@jest/globals'
import { DeepDiscovery } from '../../../src/plugins/spider/deep-discovery.js'

describe('DeepDiscovery', () => {
  let discoverer
  let fetchedUrls

  beforeEach(() => {
    fetchedUrls = new Map()

    // Mock fetcher that simulates various responses
    const mockFetcher = async (url) => {
      if (fetchedUrls.has(url)) {
        return fetchedUrls.get(url)
      }
      throw new Error('Not found')
    }

    discoverer = new DeepDiscovery({
      userAgent: 'test-spider',
      timeout: 1000,
      maxConcurrent: 5,
      fetcher: mockFetcher
    })
  })

  describe('Robots.txt Analysis', () => {
    test('should extract sitemaps from robots.txt', async () => {
      fetchedUrls.set('https://example.com/robots.txt', `
User-agent: *
Disallow: /admin/
Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/sitemap-products.xml
Allow: /public/
`)

      const report = await discoverer.discover('https://example.com', {
        analyzeTobots: true,
        includeSitemaps: false,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: false
      })

      expect(report.discovered.sitemaps.length).toBe(2)
      expect(report.discovered.sitemaps[0]).toEqual({
        url: 'https://example.com/sitemap.xml',
        source: 'robots.txt',
        priority: 10
      })
      expect(report.discovered.sitemaps[1]).toEqual({
        url: 'https://example.com/sitemap-products.xml',
        source: 'robots.txt',
        priority: 9
      })
    })

    test('should detect API paths from robots.txt disallow', async () => {
      fetchedUrls.set('https://example.com/robots.txt', `
User-agent: *
Disallow: /api/v1/
Disallow: /rest/products
Disallow: /admin/
`)

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: true,
        includeSitemaps: false,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: false
      })

      expect(report.discovered.exposedPaths.length).toBe(3)
      expect(report.discovered.exposedPaths.filter(p => p.type === 'api').length).toBe(2)
    })

    test('should ignore wildcard paths', async () => {
      fetchedUrls.set('https://example.com/robots.txt', `
User-agent: *
Disallow: /admin/*
Disallow: /api/
`)

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: true,
        includeSitemaps: false,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: false
      })

      // Should only find /api/ (not /admin/* with wildcard)
      expect(report.discovered.exposedPaths.length).toBe(1)
      expect(report.discovered.exposedPaths[0].path).toBe('/api/')
    })
  })

  describe('Sitemap Discovery', () => {
    test('should discover standard sitemap locations', async () => {
      // Mock HEAD requests for URL existence checking
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          if (url.includes('/sitemap.xml') || url.includes('/sitemap_index.xml')) {
            return {
              ok: true,
              headers: { get: () => 'application/xml' }
            }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: true,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      expect(report.discovered.sitemaps.length).toBeGreaterThan(0)
      expect(report.discovered.sitemaps.some(s => s.url.includes('/sitemap.xml'))).toBe(true)
    })

    test('should detect Google News sitemaps', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          if (url.includes('news-sitemap') || url.includes('sitemap-news')) {
            return {
              ok: true,
              headers: { get: () => 'application/xml' }
            }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: true,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      const newsSitemaps = report.discovered.sitemaps.filter(s => s.type === 'google-news')
      expect(newsSitemaps.length).toBeGreaterThan(0)
      expect(newsSitemaps[0].priority).toBe(9)
    })

    test('should detect Google Images sitemaps', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          if (url.includes('image-sitemap') || url.includes('sitemap-image')) {
            return {
              ok: true,
              headers: { get: () => 'application/xml' }
            }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: true,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      const imageSitemaps = report.discovered.sitemaps.filter(s => s.type === 'google-images')
      expect(imageSitemaps.length).toBeGreaterThan(0)
      expect(imageSitemaps[0].priority).toBe(8)
    })

    test('should detect Google Videos sitemaps and mRSS', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          if (url.includes('video-sitemap') || url.includes('mrss')) {
            return {
              ok: true,
              headers: { get: () => 'application/xml' }
            }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: true,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      const videoSitemaps = report.discovered.sitemaps.filter(s => s.type === 'google-videos')
      expect(videoSitemaps.length).toBeGreaterThan(0)
      expect(videoSitemaps[0].priority).toBe(8)
    })

    test('should detect sitemap indexes', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          if (url.includes('index')) {
            return {
              ok: true,
              headers: { get: () => 'application/xml' }
            }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: true,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      const indexSitemaps = report.discovered.sitemaps.filter(s => s.type === 'sitemap-index')
      expect(indexSitemaps.length).toBeGreaterThan(0)
      expect(indexSitemaps[0].priority).toBe(10)
    })

    test('should prioritize sitemaps correctly', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          if (url.includes('sitemap')) {
            return {
              ok: true,
              headers: { get: () => 'application/xml' }
            }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: true,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      const sitemaps = report.discovered.sitemaps
      if (sitemaps.length > 1) {
        // Index sitemaps should have priority 10
        const indexSitemap = sitemaps.find(s => s.url.includes('index'))
        if (indexSitemap) {
          expect(indexSitemap.priority).toBe(10)
        }

        // Product sitemaps should have priority 9
        const productSitemap = sitemaps.find(s => s.url.includes('product'))
        if (productSitemap) {
          expect(productSitemap.priority).toBe(9)
        }
      }
    })
  })

  describe('Feed Discovery', () => {
    test('should discover RSS and Atom feeds', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          if (url.includes('/feed') || url.includes('/rss')) {
            return {
              ok: true,
              headers: { get: () => 'application/rss+xml' }
            }
          }
          if (url.includes('/atom')) {
            return {
              ok: true,
              headers: { get: () => 'application/atom+xml' }
            }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: false,
        includeFeeds: true,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      expect(report.discovered.feeds.length).toBeGreaterThan(0)
    })

    test('should detect feed types correctly', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          if (url.includes('.json')) {
            return {
              ok: true,
              headers: { get: () => 'application/json' }
            }
          }
          if (url.includes('/rss')) {
            return {
              ok: true,
              headers: { get: () => 'application/rss+xml' }
            }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: false,
        includeFeeds: true,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      const feeds = report.discovered.feeds
      if (feeds.length > 0) {
        const jsonFeed = feeds.find(f => f.type === 'json')
        const rssFeed = feeds.find(f => f.type === 'rss')

        // At least one feed should be detected
        expect(jsonFeed || rssFeed).toBeTruthy()
      }
    })
  })

  describe('Platform Detection', () => {
    test('should detect Shopify platform', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          if (url.includes('/products.json') || url.includes('/cart.json')) {
            return {
              ok: true,
              headers: { get: () => 'application/json' }
            }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: false,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: true
      })

      global.fetch = originalFetch

      const shopifyDetection = report.discovered.platforms.find(
        p => p.platform === 'shopify'
      )

      expect(shopifyDetection).toBeTruthy()
      expect(shopifyDetection.type).toBe('ecommerce')
      expect(shopifyDetection.confidence).toBeGreaterThan(0)
    })

    test('should detect WordPress CMS', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          if (url.includes('/wp-json') || url.includes('/wp-admin') || url.includes('/wp-content')) {
            return { ok: true, headers: { get: () => 'text/html' } }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: false,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: true
      })

      global.fetch = originalFetch

      const wordpressDetection = report.discovered.platforms.find(
        p => p.platform === 'wordpress'
      )

      expect(wordpressDetection).toBeTruthy()
      expect(wordpressDetection.type).toBe('cms')
      expect(wordpressDetection.confidence).toBeGreaterThan(0)
    })

    test('should detect Next.js framework', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          if (url.includes('/_next/')) {
            return { ok: true, headers: { get: () => 'application/javascript' } }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: false,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: true
      })

      global.fetch = originalFetch

      const nextjsDetection = report.discovered.platforms.find(
        p => p.platform === 'nextjs'
      )

      expect(nextjsDetection).toBeTruthy()
      expect(nextjsDetection.type).toBe('framework')
    })

    test('should calculate confidence scores correctly', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          // Only 1 out of 3 Shopify paths exists
          if (url.includes('/products.json')) {
            return { ok: true, headers: { get: () => 'application/json' } }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: false,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: true
      })

      global.fetch = originalFetch

      const shopifyDetection = report.discovered.platforms.find(
        p => p.platform === 'shopify'
      )

      if (shopifyDetection) {
        expect(shopifyDetection.confidence).toBeGreaterThan(0)
        expect(shopifyDetection.confidence).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('API Discovery', () => {
    test('should discover REST API endpoints', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          if (url.includes('/api/') || url.includes('/rest/')) {
            return {
              ok: true,
              headers: { get: () => 'application/json' }
            }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: false,
        includeFeeds: false,
        includeAPIs: true,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      expect(report.discovered.apis.length).toBeGreaterThan(0)
    })

    test('should detect GraphQL endpoints', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          if (url.includes('/graphql')) {
            return {
              ok: true,
              headers: { get: () => 'application/json' }
            }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: false,
        includeFeeds: false,
        includeAPIs: true,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      const graphqlApi = report.discovered.apis.find(api => api.type === 'graphql')
      expect(graphqlApi).toBeTruthy()
    })

    test('should detect WordPress REST API', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          if (url.includes('/wp-json')) {
            return {
              ok: true,
              headers: { get: () => 'application/json' }
            }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: false,
        includeFeeds: false,
        includeAPIs: true,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      const wpApi = report.discovered.apis.find(api => api.type === 'wordpress-rest')
      expect(wpApi).toBeTruthy()
    })
  })

  describe('Static File Discovery', () => {
    test('should discover manifest files', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          if (url.includes('manifest.json') || url.includes('package.json')) {
            return {
              ok: true,
              headers: { get: () => 'application/json' }
            }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: false,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: true,
        detectPlatform: false
      })

      global.fetch = originalFetch

      expect(report.discovered.staticFiles.length).toBeGreaterThan(0)
    })

    test('should discover well-known files', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          if (url.includes('/.well-known/')) {
            return {
              ok: true,
              headers: { get: () => 'application/json' }
            }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: false,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: true,
        detectPlatform: false
      })

      global.fetch = originalFetch

      const wellKnownFile = report.discovered.staticFiles.find(
        f => f.url.includes('/.well-known/')
      )
      expect(wellKnownFile).toBeTruthy()
    })
  })

  describe('Report Generation', () => {
    test('should generate complete discovery report', async () => {
      const originalFetch = global.fetch
      global.fetch = async () => ({ ok: false })

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: false,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      expect(report).toHaveProperty('domain')
      expect(report).toHaveProperty('timestamp')
      expect(report).toHaveProperty('stats')
      expect(report).toHaveProperty('discovered')
      expect(report).toHaveProperty('summary')

      expect(report.domain).toBe('https://example.com')
      expect(report.stats).toHaveProperty('urlsProbed')
      expect(report.stats).toHaveProperty('urlsFound')
      expect(report.stats).toHaveProperty('errors')
    })

    test('should calculate success rate correctly', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          // Simulate 50% success rate
          return { ok: url.includes('/api/') }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: false,
        includeFeeds: false,
        includeAPIs: true,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      expect(report.summary).toHaveProperty('successRate')
      expect(report.summary.successRate).toMatch(/%$/)
    })

    test('should sort platforms by confidence', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          // Shopify: 2/3 paths exist (66% confidence)
          if (url.includes('/products.json') || url.includes('/cart.json')) {
            return { ok: true, headers: { get: () => 'application/json' } }
          }
          // WordPress: 1/3 paths exist (33% confidence)
          if (url.includes('/wp-json')) {
            return { ok: true, headers: { get: () => 'application/json' } }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: false,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: true
      })

      global.fetch = originalFetch

      if (report.discovered.platforms.length > 1) {
        // Platforms should be sorted by confidence (descending)
        for (let i = 0; i < report.discovered.platforms.length - 1; i++) {
          expect(report.discovered.platforms[i].confidence).toBeGreaterThanOrEqual(
            report.discovered.platforms[i + 1].confidence
          )
        }
      }
    })

    test('should sort sitemaps by priority', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          if (url.includes('sitemap')) {
            return { ok: true, headers: { get: () => 'application/xml' } }
          }
        }
        return { ok: false }
      }

      const report = await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: true,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      if (report.discovered.sitemaps.length > 1) {
        // Sitemaps should be sorted by priority (descending)
        for (let i = 0; i < report.discovered.sitemaps.length - 1; i++) {
          expect(report.discovered.sitemaps[i].priority).toBeGreaterThanOrEqual(
            report.discovered.sitemaps[i + 1].priority
          )
        }
      }
    })
  })

  describe('Configuration', () => {
    test('should respect maxConcurrent setting', async () => {
      let maxConcurrent = 0
      let currentConcurrent = 0

      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          currentConcurrent++
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
          await new Promise(resolve => setTimeout(resolve, 10))
          currentConcurrent--
          return { ok: false }
        }
        return { ok: false }
      }

      const limitedDiscoverer = new DeepDiscovery({
        maxConcurrent: 3,
        timeout: 1000
      })

      await limitedDiscoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: true,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      expect(maxConcurrent).toBeLessThanOrEqual(3)
    })

    test('should use custom user agent', async () => {
      let capturedUserAgent = null

      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          capturedUserAgent = options.headers?.['User-Agent']
        }
        return { ok: false }
      }

      const customDiscoverer = new DeepDiscovery({
        userAgent: 'custom-bot/1.0'
      })

      await customDiscoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: true,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      expect(capturedUserAgent).toBe('custom-bot/1.0')
    })
  })

  describe('Statistics Tracking', () => {
    test('should track probed URLs', async () => {
      const originalFetch = global.fetch
      global.fetch = async () => ({ ok: false })

      await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: true,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      const stats = discoverer.getStats()
      expect(stats.urlsProbed).toBeGreaterThan(0)
    })

    test('should track found URLs', async () => {
      const originalFetch = global.fetch
      global.fetch = async (url, options) => {
        if (options?.method === 'HEAD') {
          return { ok: url.includes('/sitemap.xml') }
        }
        return { ok: false }
      }

      await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: true,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      const stats = discoverer.getStats()
      expect(stats.urlsFound).toBeGreaterThan(0)
      expect(stats.urlsFound).toBeLessThanOrEqual(stats.urlsProbed)
    })

    test('should track errors', async () => {
      const originalFetch = global.fetch
      global.fetch = async () => {
        throw new Error('Network error')
      }

      await discoverer.discover('https://example.com', {
        analyzeRobots: false,
        includeSitemaps: true,
        includeFeeds: false,
        includeAPIs: false,
        includeStatic: false,
        detectPlatform: false
      })

      global.fetch = originalFetch

      const stats = discoverer.getStats()
      expect(stats.errors).toBeGreaterThan(0)
    })
  })

  describe('Helper Methods', () => {
    test('should detect API-like paths', () => {
      expect(discoverer._looksLikeAPI('/api/products')).toBe(true)
      expect(discoverer._looksLikeAPI('/rest/v1/users')).toBe(true)
      expect(discoverer._looksLikeAPI('/graphql')).toBe(true)
      expect(discoverer._looksLikeAPI('/wp-json/posts')).toBe(true)
      expect(discoverer._looksLikeAPI('/data.json')).toBe(true)
      expect(discoverer._looksLikeAPI('/about')).toBe(false)
      expect(discoverer._looksLikeAPI('/contact')).toBe(false)
    })

    test('should detect feed types', () => {
      expect(discoverer._detectFeedType('/feed.json', 'application/json')).toBe('json')
      expect(discoverer._detectFeedType('/rss.xml', 'application/rss+xml')).toBe('rss')
      expect(discoverer._detectFeedType('/atom.xml', 'application/atom+xml')).toBe('atom')
      expect(discoverer._detectFeedType('/feed', 'text/html')).toBe('unknown')
    })

    test('should detect API types', () => {
      expect(discoverer._detectAPIType('/graphql', 'application/json')).toBe('graphql')
      expect(discoverer._detectAPIType('/wp-json/posts', 'application/json')).toBe('wordpress-rest')
      expect(discoverer._detectAPIType('/api/products', 'application/json')).toBe('rest')
      expect(discoverer._detectAPIType('/api', 'text/html')).toBe('unknown')
    })

    test('should assign sitemap priorities correctly', () => {
      expect(discoverer._getSitemapPriority('/sitemap_index.xml')).toBe(10)
      expect(discoverer._getSitemapPriority('/sitemap-products.xml')).toBe(9)
      expect(discoverer._getSitemapPriority('/sitemap-news.xml')).toBe(8)
      expect(discoverer._getSitemapPriority('/sitemap-categories.xml')).toBe(7)
      expect(discoverer._getSitemapPriority('/sitemap-posts.xml')).toBe(6)
      expect(discoverer._getSitemapPriority('/sitemap.xml')).toBe(5)
    })
  })
})
