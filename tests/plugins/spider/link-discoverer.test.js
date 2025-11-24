import { describe, expect, test, beforeEach } from '@jest/globals'
import { LinkDiscoverer } from '../../../src/plugins/spider/link-discoverer.js'
import { URLPatternMatcher } from '../../../src/plugins/spider/url-pattern-matcher.js'

describe('LinkDiscoverer', () => {
  let discoverer

  beforeEach(() => {
    discoverer = new LinkDiscoverer()
  })

  describe('Basic link extraction', () => {
    test('should extract links from HTML', () => {
      const html = `
        <html>
          <body>
            <a href="/products">Products</a>
            <a href="/about">About Us</a>
            <a href="https://example.com/contact">Contact</a>
          </body>
        </html>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      expect(links).toHaveLength(3)
      expect(links.map(l => l.url)).toContain('https://example.com/products')
      expect(links.map(l => l.url)).toContain('https://example.com/about')
      expect(links.map(l => l.url)).toContain('https://example.com/contact')
    })

    test('should resolve relative URLs', () => {
      const html = `
        <a href="/page">Page</a>
        <a href="./sub">Sub</a>
        <a href="../parent">Parent</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com/section/', 0)

      expect(links.map(l => l.url)).toContain('https://example.com/page')
      expect(links.map(l => l.url)).toContain('https://example.com/section/sub')
      expect(links.map(l => l.url)).toContain('https://example.com/parent')
    })

    test('should extract anchor text', () => {
      const html = `<a href="/product">Buy Now</a>`

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      expect(links[0].anchorText).toBe('Buy Now')
    })

    test('should track source URL and depth', () => {
      const html = `<a href="/page">Link</a>`

      const links = discoverer.extractLinks(html, 'https://example.com/start', 2)

      expect(links[0].sourceUrl).toBe('https://example.com/start')
      expect(links[0].depth).toBe(3)
    })
  })

  describe('URL filtering', () => {
    test('should ignore static assets', () => {
      const html = `
        <a href="/page.html">Page</a>
        <a href="/style.css">CSS</a>
        <a href="/script.js">JS</a>
        <a href="/image.png">Image</a>
        <a href="/doc.pdf">PDF</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      expect(links).toHaveLength(1)
      expect(links[0].url).toBe('https://example.com/page.html')
    })

    test('should ignore mailto and tel links', () => {
      const html = `
        <a href="/contact">Contact</a>
        <a href="mailto:test@example.com">Email</a>
        <a href="tel:+1234567890">Phone</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      expect(links).toHaveLength(1)
      expect(links[0].url).toBe('https://example.com/contact')
    })

    test('should ignore javascript: links', () => {
      const html = `
        <a href="/page">Page</a>
        <a href="javascript:void(0)">JS Link</a>
        <a href="javascript:alert('test')">Alert</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      expect(links).toHaveLength(1)
    })

    test('should ignore common non-content pages', () => {
      const html = `
        <a href="/products">Products</a>
        <a href="/login">Login</a>
        <a href="/logout">Logout</a>
        <a href="/cart">Cart</a>
        <a href="/checkout">Checkout</a>
        <a href="/account">Account</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      expect(links).toHaveLength(1)
      expect(links[0].url).toBe('https://example.com/products')
    })
  })

  describe('Domain filtering', () => {
    test('should only allow same domain by default', () => {
      const html = `
        <a href="/internal">Internal</a>
        <a href="https://other.com/page">External</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      expect(links).toHaveLength(1)
      expect(links[0].url).toBe('https://example.com/internal')
    })

    test('should include subdomains when configured', () => {
      discoverer = new LinkDiscoverer({
        sameDomainOnly: true,
        includeSubdomains: true
      })

      const html = `
        <a href="https://example.com/page">Main</a>
        <a href="https://shop.example.com/product">Shop</a>
        <a href="https://blog.example.com/post">Blog</a>
        <a href="https://other.com/page">Other</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      expect(links).toHaveLength(3)
      expect(links.map(l => l.url)).not.toContain('https://other.com/page')
    })

    test('should respect allowedDomains whitelist', () => {
      discoverer = new LinkDiscoverer({
        sameDomainOnly: false,
        allowedDomains: ['example.com', 'partner.com']
      })

      const html = `
        <a href="https://example.com/page">Example</a>
        <a href="https://partner.com/page">Partner</a>
        <a href="https://other.com/page">Other</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      expect(links).toHaveLength(2)
      expect(links.map(l => l.url)).not.toContain('https://other.com/page')
    })

    test('should respect blockedDomains blacklist', () => {
      discoverer = new LinkDiscoverer({
        sameDomainOnly: false,
        blockedDomains: ['ads.example.com', 'tracking.com']
      })

      const html = `
        <a href="https://example.com/page">Example</a>
        <a href="https://ads.example.com/banner">Ads</a>
        <a href="https://tracking.com/pixel">Tracking</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      expect(links).toHaveLength(1)
      expect(links[0].url).toBe('https://example.com/page')
    })
  })

  describe('Regex filtering', () => {
    test('should filter by followRegex', () => {
      discoverer = new LinkDiscoverer({
        followRegex: /\/products\//
      })

      const html = `
        <a href="/products/item1">Product 1</a>
        <a href="/products/item2">Product 2</a>
        <a href="/about">About</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      expect(links).toHaveLength(2)
      expect(links.every(l => l.url.includes('/products/'))).toBe(true)
    })

    test('should filter by ignoreRegex', () => {
      discoverer = new LinkDiscoverer({
        ignoreRegex: /\/(api|admin)\//
      })

      const html = `
        <a href="/products">Products</a>
        <a href="/api/data">API</a>
        <a href="/admin/dashboard">Admin</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      expect(links).toHaveLength(1)
      expect(links[0].url).toBe('https://example.com/products')
    })
  })

  describe('Depth and URL limits', () => {
    test('should respect maxDepth', () => {
      discoverer = new LinkDiscoverer({ maxDepth: 2 })

      const html = `<a href="/page">Page</a>`

      // Depth 0 -> should extract
      const depth0 = discoverer.extractLinks(html, 'https://example.com', 0)
      expect(depth0).toHaveLength(1)

      // Reset to test depth 2
      discoverer.reset()

      // Depth 2 (at limit) -> should not extract (next would be depth 3)
      const depth2 = discoverer.extractLinks(html, 'https://example.com', 2)
      expect(depth2).toHaveLength(0)
    })

    test('should respect maxUrls', () => {
      discoverer = new LinkDiscoverer({ maxUrls: 3 })

      const html = `
        <a href="/page1">Page 1</a>
        <a href="/page2">Page 2</a>
        <a href="/page3">Page 3</a>
        <a href="/page4">Page 4</a>
        <a href="/page5">Page 5</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      expect(links).toHaveLength(3)
      expect(discoverer.isLimitReached()).toBe(true)
    })
  })

  describe('Deduplication', () => {
    test('should not return already discovered URLs', () => {
      const html1 = `
        <a href="/page1">Page 1</a>
        <a href="/page2">Page 2</a>
      `

      const html2 = `
        <a href="/page2">Page 2 again</a>
        <a href="/page3">Page 3</a>
      `

      const links1 = discoverer.extractLinks(html1, 'https://example.com', 0)
      expect(links1).toHaveLength(2)

      const links2 = discoverer.extractLinks(html2, 'https://example.com', 0)
      expect(links2).toHaveLength(1)
      expect(links2[0].url).toBe('https://example.com/page3')
    })

    test('should normalize URLs for deduplication', () => {
      const html = `
        <a href="/page">Page</a>
        <a href="/page/">Page with slash</a>
        <a href="/page?">Page with empty query</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      // All three should normalize to same URL
      expect(links).toHaveLength(1)
    })

    test('should sort query params for deduplication', () => {
      discoverer = new LinkDiscoverer({ ignoreQueryString: false })

      const html = `
        <a href="/search?a=1&b=2">Search 1</a>
        <a href="/search?b=2&a=1">Search 2</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      // Same params in different order should dedupe
      expect(links).toHaveLength(1)
    })
  })

  describe('Pattern matching integration', () => {
    test('should integrate with URLPatternMatcher', () => {
      const matcher = new URLPatternMatcher({
        product: {
          match: '/products/:id',
          activities: ['seo'],
          metadata: { type: 'product' }
        }
      })

      discoverer = new LinkDiscoverer()
      discoverer.setPatternMatcher(matcher)

      const html = `
        <a href="/products/123">Product</a>
        <a href="/about">About</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      const productLink = links.find(l => l.url.includes('/products/'))
      expect(productLink.pattern).toBe('product')
      expect(productLink.params.id).toBe('123')
      expect(productLink.activities).toEqual(['seo'])
    })

    test('should filter by followPatterns', () => {
      const matcher = new URLPatternMatcher({
        product: { match: '/products/:id', activities: ['seo'] },
        category: { match: '/category/:name', activities: ['links'] },
        default: { activities: ['basic'] }
      })

      discoverer = new LinkDiscoverer({
        followPatterns: ['product']
      })
      discoverer.setPatternMatcher(matcher)

      const html = `
        <a href="/products/123">Product</a>
        <a href="/category/electronics">Category</a>
        <a href="/about">About</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      expect(links).toHaveLength(1)
      expect(links[0].pattern).toBe('product')
    })

    test('should follow default pattern when configured', () => {
      const matcher = new URLPatternMatcher({
        product: { match: '/products/:id', activities: ['seo'] },
        default: { activities: ['basic'] }
      })

      discoverer = new LinkDiscoverer({
        followPatterns: ['product', 'default']
      })
      discoverer.setPatternMatcher(matcher)

      const html = `
        <a href="/products/123">Product</a>
        <a href="/about">About</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      expect(links).toHaveLength(2)
    })
  })

  describe('Queue tracking', () => {
    test('should track queued URLs', () => {
      expect(discoverer.isQueued('https://example.com/page')).toBe(false)

      discoverer.markQueued('https://example.com/page')

      expect(discoverer.isQueued('https://example.com/page')).toBe(true)
    })

    test('should handle invalid URLs in isQueued', () => {
      expect(discoverer.isQueued('not-a-valid-url')).toBe(false)
    })
  })

  describe('Statistics', () => {
    test('should track discovery stats', () => {
      const html = `
        <a href="/page1">Page 1</a>
        <a href="/page2">Page 2</a>
      `

      discoverer.extractLinks(html, 'https://example.com', 0)

      const stats = discoverer.getStats()

      expect(stats.discovered).toBe(2)
      expect(stats.maxUrls).toBe(1000)
      expect(stats.remaining).toBe(998)
    })

    test('should reset stats', () => {
      const html = `<a href="/page">Page</a>`
      discoverer.extractLinks(html, 'https://example.com', 0)

      expect(discoverer.getStats().discovered).toBe(1)

      discoverer.reset()

      expect(discoverer.getStats().discovered).toBe(0)
    })
  })

  describe('Disabled state', () => {
    test('should return empty array when disabled', () => {
      discoverer = new LinkDiscoverer({ enabled: false })

      const html = `<a href="/page">Page</a>`
      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      expect(links).toHaveLength(0)
    })
  })

  describe('Robots.txt integration', () => {
    test('should filter links by robots.txt with extractLinksAsync', async () => {
      discoverer = new LinkDiscoverer({
        respectRobotsTxt: true,
        robotsFetcher: async () => `
User-agent: *
Disallow: /admin/
Disallow: /private/
`
      })

      const html = `
        <a href="/public">Public</a>
        <a href="/admin/dashboard">Admin</a>
        <a href="/private/data">Private</a>
      `

      const links = await discoverer.extractLinksAsync(html, 'https://example.com', 0)

      expect(links).toHaveLength(1)
      expect(links[0].url).toBe('https://example.com/public')
    })

    test('should track blocked URLs', async () => {
      discoverer = new LinkDiscoverer({
        respectRobotsTxt: true,
        robotsFetcher: async () => `
User-agent: *
Disallow: /admin/
`
      })

      const html = `
        <a href="/public">Public</a>
        <a href="/admin/page">Admin</a>
      `

      await discoverer.extractLinksAsync(html, 'https://example.com', 0)

      const stats = discoverer.getStats()
      expect(stats.blockedByRobots).toBe(1)
    })

    test('should include crawl delay in metadata', async () => {
      discoverer = new LinkDiscoverer({
        respectRobotsTxt: true,
        robotsFetcher: async () => `
User-agent: *
Crawl-delay: 2
Disallow:
`
      })

      const html = `<a href="/page">Page</a>`
      const links = await discoverer.extractLinksAsync(html, 'https://example.com', 0)

      expect(links[0].metadata.crawlDelay).toBe(2000)
    })

    test('should check single URL with isAllowedByRobots', async () => {
      discoverer = new LinkDiscoverer({
        respectRobotsTxt: true,
        robotsFetcher: async () => `
User-agent: *
Disallow: /admin/
`
      })

      const allowed = await discoverer.isAllowedByRobots('https://example.com/public')
      expect(allowed.allowed).toBe(true)

      const disallowed = await discoverer.isAllowedByRobots('https://example.com/admin/page')
      expect(disallowed.allowed).toBe(false)
    })

    test('should preload robots.txt', async () => {
      let fetched = false
      discoverer = new LinkDiscoverer({
        respectRobotsTxt: true,
        robotsFetcher: async () => {
          fetched = true
          return 'User-agent: *\nDisallow:'
        }
      })

      await discoverer.preloadRobots('https://example.com/page')
      expect(fetched).toBe(true)
    })

    test('should get sitemaps from robots.txt', async () => {
      discoverer = new LinkDiscoverer({
        respectRobotsTxt: true,
        robotsFetcher: async () => `
User-agent: *
Disallow:
Sitemap: https://example.com/sitemap.xml
`
      })

      const sitemaps = await discoverer.getSitemaps('https://example.com')
      expect(sitemaps).toContain('https://example.com/sitemap.xml')
    })

    test('should skip robots.txt check when disabled', async () => {
      discoverer = new LinkDiscoverer({
        respectRobotsTxt: false
      })

      const html = `<a href="/admin">Admin</a>`
      const links = await discoverer.extractLinksAsync(html, 'https://example.com', 0)

      expect(links).toHaveLength(1)
    })

    test('should use custom user agent', async () => {
      let receivedUA = null
      discoverer = new LinkDiscoverer({
        respectRobotsTxt: true,
        robotsUserAgent: 'my-custom-bot',
        robotsFetcher: async () => `
User-agent: my-custom-bot
Disallow: /secret/

User-agent: *
Disallow:
`
      })

      const html = `<a href="/secret/page">Secret</a>`
      const links = await discoverer.extractLinksAsync(html, 'https://example.com', 0)

      expect(links).toHaveLength(0) // Blocked for my-custom-bot
    })

    test('should clear robots cache on reset with option', async () => {
      discoverer = new LinkDiscoverer({
        respectRobotsTxt: true,
        robotsFetcher: async () => 'User-agent: *\nDisallow:'
      })

      await discoverer.preloadRobots('https://example.com')
      expect(discoverer.getStats().robotsCacheSize).toBe(1)

      discoverer.reset({ clearRobotsCache: true })
      expect(discoverer.getStats().robotsCacheSize).toBe(0)
    })

    test('should return allowed when robots parser is null', async () => {
      discoverer = new LinkDiscoverer({ respectRobotsTxt: false })

      const result = await discoverer.isAllowedByRobots('https://example.com/page')
      expect(result.allowed).toBe(true)
    })
  })

  describe('Edge cases', () => {
    test('should handle empty href', () => {
      const html = `
        <a href="">Empty</a>
        <a href="   ">Whitespace</a>
        <a href="/valid">Valid</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      expect(links).toHaveLength(1)
      expect(links[0].url).toBe('https://example.com/valid')
    })

    test('should handle malformed URLs gracefully', () => {
      const html = `
        <a href="/valid">Valid</a>
        <a href="://invalid">Invalid</a>
        <a href="http:">Malformed</a>
      `

      // Should not throw
      const links = discoverer.extractLinks(html, 'https://example.com', 0)
      expect(links.length).toBeGreaterThanOrEqual(1)
    })

    test('should handle hash-only links', () => {
      const html = `
        <a href="#section">Section</a>
        <a href="/page#anchor">Page with anchor</a>
      `

      const links = discoverer.extractLinks(html, 'https://example.com', 0)

      // Hash-only links should be ignored
      expect(links).toHaveLength(1)
      expect(links[0].url).toBe('https://example.com/page')
    })
  })
})
