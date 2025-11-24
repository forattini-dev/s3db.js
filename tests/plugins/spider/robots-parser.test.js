import { describe, expect, test, beforeEach } from '@jest/globals'
import { RobotsParser } from '../../../src/plugins/spider/robots-parser.js'

describe('RobotsParser', () => {
  let parser

  beforeEach(() => {
    parser = new RobotsParser({ userAgent: 'testbot' })
  })

  describe('Basic parsing', () => {
    test('should parse simple disallow rule', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /admin/
`
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      const result = await parser.isAllowed('https://example.com/admin/dashboard')
      expect(result.allowed).toBe(false)
      expect(result.source).toBe('robots-txt')
    })

    test('should parse simple allow rule', async () => {
      const robotsTxt = `
User-agent: *
Allow: /public/
Disallow: /
`
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      const allowed = await parser.isAllowed('https://example.com/public/page')
      expect(allowed.allowed).toBe(true)

      const disallowed = await parser.isAllowed('https://example.com/private/page')
      expect(disallowed.allowed).toBe(false)
    })

    test('should handle empty disallow (allow all)', async () => {
      const robotsTxt = `
User-agent: *
Disallow:
`
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      const result = await parser.isAllowed('https://example.com/anything')
      expect(result.allowed).toBe(true)
    })

    test('should parse crawl-delay', async () => {
      const robotsTxt = `
User-agent: *
Crawl-delay: 2
Disallow: /admin/
`
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      const result = await parser.isAllowed('https://example.com/page')
      expect(result.allowed).toBe(true)
      expect(result.crawlDelay).toBe(2000) // Converted to ms
    })

    test('should parse sitemap directives', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /admin/
Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/sitemap-news.xml
`
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      const sitemaps = await parser.getSitemaps('https://example.com')
      expect(sitemaps).toHaveLength(2)
      expect(sitemaps).toContain('https://example.com/sitemap.xml')
      expect(sitemaps).toContain('https://example.com/sitemap-news.xml')
    })
  })

  describe('User-agent matching', () => {
    test('should match specific user-agent', async () => {
      parser = new RobotsParser({ userAgent: 'testbot' })

      const robotsTxt = `
User-agent: testbot
Disallow: /secret/

User-agent: *
Disallow: /admin/
`
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      // testbot should follow testbot rules
      const secret = await parser.isAllowed('https://example.com/secret/page')
      expect(secret.allowed).toBe(false)

      // testbot should be allowed in /admin/ (no rule for testbot)
      const admin = await parser.isAllowed('https://example.com/admin/page')
      expect(admin.allowed).toBe(true)
    })

    test('should fall back to wildcard user-agent', async () => {
      parser = new RobotsParser({ userAgent: 'unknownbot' })

      const robotsTxt = `
User-agent: googlebot
Disallow: /private/

User-agent: *
Disallow: /admin/
`
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      // unknownbot should use * rules
      const admin = await parser.isAllowed('https://example.com/admin/page')
      expect(admin.allowed).toBe(false)

      // unknownbot should be allowed in /private/
      const privateUrl = await parser.isAllowed('https://example.com/private/page')
      expect(privateUrl.allowed).toBe(true)
    })

    test('should handle case-insensitive user-agent', async () => {
      parser = new RobotsParser({ userAgent: 'TestBot' })

      const robotsTxt = `
User-agent: testbot
Disallow: /secret/
`
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      const result = await parser.isAllowed('https://example.com/secret/page')
      expect(result.allowed).toBe(false)
    })
  })

  describe('Pattern matching', () => {
    test('should match * wildcard', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /private/*.pdf
`
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      const pdf = await parser.isAllowed('https://example.com/private/doc.pdf')
      expect(pdf.allowed).toBe(false)

      const html = await parser.isAllowed('https://example.com/private/page.html')
      expect(html.allowed).toBe(true)
    })

    test('should match $ end anchor', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /*.php$
`
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      const php = await parser.isAllowed('https://example.com/script.php')
      expect(php.allowed).toBe(false)

      // .php in middle of URL should be allowed
      const phpParam = await parser.isAllowed('https://example.com/script.php?id=1')
      expect(phpParam.allowed).toBe(true)
    })

    test('should use most specific rule', async () => {
      const robotsTxt = `
User-agent: *
Allow: /page
Disallow: /
`
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      const page = await parser.isAllowed('https://example.com/page')
      expect(page.allowed).toBe(true)

      const other = await parser.isAllowed('https://example.com/other')
      expect(other.allowed).toBe(false)
    })

    test('should prefer longer patterns', async () => {
      const robotsTxt = `
User-agent: *
Allow: /products/featured
Disallow: /products/
`
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      const featured = await parser.isAllowed('https://example.com/products/featured')
      expect(featured.allowed).toBe(true)

      const other = await parser.isAllowed('https://example.com/products/other')
      expect(other.allowed).toBe(false)
    })
  })

  describe('Caching', () => {
    test('should cache robots.txt', async () => {
      let fetchCount = 0
      parser.setFetcher(() => {
        fetchCount++
        return Promise.resolve('User-agent: *\nDisallow: /admin/')
      })

      await parser.isAllowed('https://example.com/page1')
      await parser.isAllowed('https://example.com/page2')
      await parser.isAllowed('https://example.com/page3')

      expect(fetchCount).toBe(1) // Only one fetch
    })

    test('should cache per domain', async () => {
      let fetchCount = 0
      parser.setFetcher(() => {
        fetchCount++
        return Promise.resolve('User-agent: *\nDisallow: /admin/')
      })

      await parser.isAllowed('https://example.com/page')
      await parser.isAllowed('https://other.com/page')

      expect(fetchCount).toBe(2) // Two different domains
    })

    test('should clear cache', async () => {
      let fetchCount = 0
      parser.setFetcher(() => {
        fetchCount++
        return Promise.resolve('User-agent: *\nDisallow: /admin/')
      })

      await parser.isAllowed('https://example.com/page')
      parser.clearCache()
      await parser.isAllowed('https://example.com/page')

      expect(fetchCount).toBe(2) // Re-fetched after clear
    })

    test('should return cache stats', async () => {
      parser.setFetcher(() => Promise.resolve('User-agent: *\nDisallow:'))

      await parser.isAllowed('https://example.com/page')
      await parser.isAllowed('https://other.com/page')

      const stats = parser.getCacheStats()
      expect(stats.size).toBe(2)
      expect(stats.domains).toContain('https://example.com')
      expect(stats.domains).toContain('https://other.com')
    })
  })

  describe('Error handling', () => {
    test('should handle missing robots.txt', async () => {
      parser.setFetcher(() => Promise.reject(new Error('404')))

      const result = await parser.isAllowed('https://example.com/page')
      expect(result.allowed).toBe(true) // Default allow
      expect(result.source).toBe('no-robots-txt')
    })

    test('should handle fetch timeout', async () => {
      parser.setFetcher(() => new Promise((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), 100)
      }))

      const result = await parser.isAllowed('https://example.com/page')
      expect(result.allowed).toBe(true)
    })

    test('should handle malformed robots.txt', async () => {
      parser.setFetcher(() => Promise.resolve('not valid robots.txt content'))

      const result = await parser.isAllowed('https://example.com/page')
      expect(result.allowed).toBe(true) // No matching rules
    })

    test('should handle empty robots.txt', async () => {
      parser.setFetcher(() => Promise.resolve(''))

      const result = await parser.isAllowed('https://example.com/page')
      expect(result.allowed).toBe(true)
    })

    test('should use defaultAllow config on error', async () => {
      parser = new RobotsParser({
        userAgent: 'testbot',
        defaultAllow: false
      })
      parser.setFetcher(() => Promise.reject(new Error('error')))

      const result = await parser.isAllowed('https://example.com/page')
      expect(result.allowed).toBe(false)
    })
  })

  describe('Comments and whitespace', () => {
    test('should ignore comments', async () => {
      const robotsTxt = `
# This is a comment
User-agent: * # inline comment
Disallow: /admin/ # disallow admin
`
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      const result = await parser.isAllowed('https://example.com/admin/page')
      expect(result.allowed).toBe(false)
    })

    test('should handle various line endings', async () => {
      const robotsTxt = 'User-agent: *\r\nDisallow: /admin/\r\n'
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      const result = await parser.isAllowed('https://example.com/admin/page')
      expect(result.allowed).toBe(false)
    })

    test('should handle extra whitespace', async () => {
      const robotsTxt = `
User-agent:   *
Disallow:   /admin/
`
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      const result = await parser.isAllowed('https://example.com/admin/page')
      expect(result.allowed).toBe(false)
    })
  })

  describe('Multiple user-agents in one block', () => {
    test('should handle multiple user-agents', async () => {
      const robotsTxt = `
User-agent: bot1
User-agent: bot2
Disallow: /private/
`
      parser = new RobotsParser({ userAgent: 'bot2' })
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      const result = await parser.isAllowed('https://example.com/private/page')
      expect(result.allowed).toBe(false)
    })
  })

  describe('Real-world robots.txt examples', () => {
    test('should handle Google-style robots.txt', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /search
Allow: /search/about
Disallow: /sdch
Disallow: /groups
Disallow: /index.html?
Disallow: /?
Allow: /?hl=
Sitemap: https://www.google.com/sitemap.xml
`
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      expect((await parser.isAllowed('https://example.com/search')).allowed).toBe(false)
      expect((await parser.isAllowed('https://example.com/search/about')).allowed).toBe(true)
      expect((await parser.isAllowed('https://example.com/groups')).allowed).toBe(false)
      expect((await parser.isAllowed('https://example.com/page')).allowed).toBe(true)
    })

    test('should handle Amazon-style robots.txt', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /exec/obidos/account-access-login
Disallow: /gp/cart
Disallow: /gp/flex/sign-in
Allow: /gp/product/
Disallow: /gp/
`
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      expect((await parser.isAllowed('https://example.com/gp/cart')).allowed).toBe(false)
      expect((await parser.isAllowed('https://example.com/gp/product/B08XYZ')).allowed).toBe(true)
      expect((await parser.isAllowed('https://example.com/gp/other')).allowed).toBe(false)
    })
  })

  describe('getCrawlDelay', () => {
    test('should return crawl delay for domain', async () => {
      const robotsTxt = `
User-agent: *
Crawl-delay: 5
Disallow:
`
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      const delay = await parser.getCrawlDelay('https://example.com')
      expect(delay).toBe(5000)
    })

    test('should return null when no crawl delay', async () => {
      const robotsTxt = `
User-agent: *
Disallow:
`
      parser.setFetcher(() => Promise.resolve(robotsTxt))

      const delay = await parser.getCrawlDelay('https://example.com')
      expect(delay).toBeNull()
    })
  })

  describe('preload', () => {
    test('should preload robots.txt', async () => {
      let fetched = false
      parser.setFetcher(() => {
        fetched = true
        return Promise.resolve('User-agent: *\nDisallow:')
      })

      await parser.preload('https://example.com')
      expect(fetched).toBe(true)

      const stats = parser.getCacheStats()
      expect(stats.size).toBe(1)
    })
  })
})
