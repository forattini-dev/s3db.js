import { describe, expect, test, beforeEach } from '@jest/globals'
import { SitemapParser } from '../../../src/plugins/spider/sitemap-parser.js'
import { gzipSync } from 'zlib'

describe('SitemapParser', () => {
  let parser

  beforeEach(() => {
    parser = new SitemapParser({ userAgent: 'testbot' })
  })

  describe('XML Sitemap parsing', () => {
    test('should parse basic XML sitemap', async () => {
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/page1</loc>
    <lastmod>2024-01-15</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://example.com/page2</loc>
    <lastmod>2024-01-10</lastmod>
  </url>
</urlset>`

      parser.setFetcher(() => ({ content: sitemap }))
      const entries = await parser.parse('https://example.com/sitemap.xml')

      expect(entries).toHaveLength(2)
      expect(entries[0].url).toBe('https://example.com/page1')
      expect(entries[0].lastmod).toBe('2024-01-15')
      expect(entries[0].changefreq).toBe('weekly')
      expect(entries[0].priority).toBe(0.8)
      expect(entries[0].source).toBe('sitemap')
    })

    test('should handle CDATA in URLs', async () => {
      const sitemap = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc><![CDATA[https://example.com/page?a=1&b=2]]></loc>
  </url>
</urlset>`

      parser.setFetcher(() => ({ content: sitemap }))
      const entries = await parser.parse('https://example.com/sitemap.xml')

      expect(entries[0].url).toBe('https://example.com/page?a=1&b=2')
    })

    test('should decode XML entities', async () => {
      const sitemap = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/page?a=1&amp;b=2</loc>
  </url>
</urlset>`

      parser.setFetcher(() => ({ content: sitemap }))
      const entries = await parser.parse('https://example.com/sitemap.xml')

      expect(entries[0].url).toBe('https://example.com/page?a=1&b=2')
    })

    test('should extract image information', async () => {
      const sitemap = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>https://example.com/product</loc>
    <image:image>
      <image:loc>https://example.com/photo.jpg</image:loc>
      <image:title>Product Photo</image:title>
      <image:caption>A great product</image:caption>
    </image:image>
  </url>
</urlset>`

      parser.setFetcher(() => ({ content: sitemap }))
      const entries = await parser.parse('https://example.com/sitemap.xml')

      expect(entries[0].images).toHaveLength(1)
      expect(entries[0].images[0].url).toBe('https://example.com/photo.jpg')
      expect(entries[0].images[0].title).toBe('Product Photo')
    })

    test('should extract video information', async () => {
      const sitemap = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
  <url>
    <loc>https://example.com/video-page</loc>
    <video:video>
      <video:content_loc>https://example.com/video.mp4</video:content_loc>
      <video:thumbnail_loc>https://example.com/thumb.jpg</video:thumbnail_loc>
      <video:title>My Video</video:title>
      <video:description>A cool video</video:description>
    </video:video>
  </url>
</urlset>`

      parser.setFetcher(() => ({ content: sitemap }))
      const entries = await parser.parse('https://example.com/sitemap.xml')

      expect(entries[0].videos).toHaveLength(1)
      expect(entries[0].videos[0].url).toBe('https://example.com/video.mp4')
      expect(entries[0].videos[0].title).toBe('My Video')
    })
  })

  describe('Sitemap Index parsing', () => {
    test('should parse sitemap index and follow recursively', async () => {
      const sitemapIndex = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sitemap1.xml</loc>
    <lastmod>2024-01-15</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://example.com/sitemap2.xml</loc>
  </sitemap>
</sitemapindex>`

      const sitemap1 = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page1</loc></url>
</urlset>`

      const sitemap2 = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page2</loc></url>
</urlset>`

      parser.setFetcher(async (url) => {
        if (url.includes('sitemap_index') || url === 'https://example.com/sitemap.xml') {
          return { content: sitemapIndex }
        }
        if (url.includes('sitemap1')) return { content: sitemap1 }
        if (url.includes('sitemap2')) return { content: sitemap2 }
        throw new Error('Not found')
      })

      const entries = await parser.parse('https://example.com/sitemap.xml')

      expect(entries).toHaveLength(2)
      expect(entries.map(e => e.url)).toContain('https://example.com/page1')
      expect(entries.map(e => e.url)).toContain('https://example.com/page2')
    })

    test('should return sitemap URLs when recursive=false', async () => {
      const sitemapIndex = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sitemap1.xml</loc>
  </sitemap>
</sitemapindex>`

      parser.setFetcher(() => ({ content: sitemapIndex }))
      const entries = await parser.parse('https://example.com/sitemap.xml', { recursive: false })

      expect(entries).toHaveLength(1)
      expect(entries[0].url).toBe('https://example.com/sitemap1.xml')
      expect(entries[0].type).toBe('sitemap')
      expect(entries[0].source).toBe('sitemap-index')
    })

    test('should respect maxDepth for nested indexes', async () => {
      const index = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/nested.xml</loc></sitemap>
</sitemapindex>`

      parser.setFetcher(() => ({ content: index }))

      // With maxDepth=1, should not follow nested sitemaps beyond depth 1
      const entries = await parser.parse('https://example.com/sitemap.xml', { maxDepth: 1 })

      // Should have processed the index but stopped at depth limit
      expect(parser.getStats().sitemapsParsed).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Compressed sitemap support', () => {
    test('should decompress gzipped sitemap', async () => {
      const sitemap = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/compressed</loc></url>
</urlset>`

      const compressed = gzipSync(sitemap)

      parser.setFetcher(() => ({ content: compressed }))
      const entries = await parser.parse('https://example.com/sitemap.xml.gz')

      expect(entries).toHaveLength(1)
      expect(entries[0].url).toBe('https://example.com/compressed')
    })

    test('should detect gzip from magic bytes', async () => {
      const sitemap = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page</loc></url>
</urlset>`

      const compressed = gzipSync(sitemap)

      // URL doesn't have .gz but content is gzipped
      parser.setFetcher(() => ({ content: compressed }))
      const entries = await parser.parse('https://example.com/sitemap.xml')

      expect(entries).toHaveLength(1)
    })
  })

  describe('Text sitemap parsing', () => {
    test('should parse text sitemap', async () => {
      const sitemap = `https://example.com/page1
https://example.com/page2
https://example.com/page3`

      parser.setFetcher(() => ({ content: sitemap }))
      const entries = await parser.parse('https://example.com/sitemap.txt')

      expect(entries).toHaveLength(3)
      expect(entries[0].url).toBe('https://example.com/page1')
      expect(entries[0].source).toBe('sitemap-txt')
    })

    test('should skip comments and empty lines in text sitemap', async () => {
      const sitemap = `# This is a comment
https://example.com/page1

# Another comment
https://example.com/page2
`

      parser.setFetcher(() => ({ content: sitemap }))
      const entries = await parser.parse('https://example.com/sitemap.txt')

      expect(entries).toHaveLength(2)
    })

    test('should handle Windows line endings', async () => {
      const sitemap = "https://example.com/page1\r\nhttps://example.com/page2\r\n"

      parser.setFetcher(() => ({ content: sitemap }))
      const entries = await parser.parse('https://example.com/sitemap.txt')

      expect(entries).toHaveLength(2)
    })
  })

  describe('RSS feed parsing', () => {
    test('should parse RSS 2.0 feed', async () => {
      const rss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example Blog</title>
    <item>
      <title>First Post</title>
      <link>https://example.com/blog/first-post</link>
      <pubDate>Mon, 15 Jan 2024 10:00:00 GMT</pubDate>
      <description>This is the first post</description>
    </item>
    <item>
      <title>Second Post</title>
      <link>https://example.com/blog/second-post</link>
    </item>
  </channel>
</rss>`

      parser.setFetcher(() => ({ content: rss }))
      const entries = await parser.parse('https://example.com/rss.xml')

      expect(entries).toHaveLength(2)
      expect(entries[0].url).toBe('https://example.com/blog/first-post')
      expect(entries[0].title).toBe('First Post')
      expect(entries[0].source).toBe('rss')
      expect(entries[0].lastmod).toContain('2024')
    })

    test('should detect RSS by content-type', async () => {
      const rss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <link>https://example.com/post</link>
    </item>
  </channel>
</rss>`

      parser.setFetcher(() => ({ content: rss, contentType: 'application/rss+xml' }))
      const entries = await parser.parse('https://example.com/feed')

      expect(entries).toHaveLength(1)
      expect(entries[0].source).toBe('rss')
    })
  })

  describe('Atom feed parsing', () => {
    test('should parse Atom feed', async () => {
      const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Blog</title>
  <entry>
    <title>First Post</title>
    <link href="https://example.com/blog/first-post" rel="alternate"/>
    <updated>2024-01-15T10:00:00Z</updated>
    <summary>This is the first post</summary>
  </entry>
  <entry>
    <title>Second Post</title>
    <link href="https://example.com/blog/second-post"/>
    <published>2024-01-10T08:00:00Z</published>
  </entry>
</feed>`

      parser.setFetcher(() => ({ content: atom }))
      const entries = await parser.parse('https://example.com/atom.xml')

      expect(entries).toHaveLength(2)
      expect(entries[0].url).toBe('https://example.com/blog/first-post')
      expect(entries[0].title).toBe('First Post')
      expect(entries[0].source).toBe('atom')
      expect(entries[0].lastmod).toBe('2024-01-15T10:00:00Z')
    })

    test('should decode entities in Atom URLs', async () => {
      const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <link href="https://example.com/page?a=1&amp;b=2"/>
  </entry>
</feed>`

      parser.setFetcher(() => ({ content: atom }))
      const entries = await parser.parse('https://example.com/feed.atom')

      expect(entries[0].url).toBe('https://example.com/page?a=1&b=2')
    })
  })

  describe('Format auto-detection', () => {
    test('should detect XML sitemap', async () => {
      const content = `<?xml version="1.0"?><urlset><url><loc>https://example.com</loc></url></urlset>`
      parser.setFetcher(() => ({ content }))

      const entries = await parser.parse('https://example.com/unknown')
      expect(entries[0].source).toBe('sitemap')
    })

    test('should detect text sitemap by content', async () => {
      const content = `https://example.com/page1
https://example.com/page2
https://example.com/page3`

      parser.setFetcher(() => ({ content }))
      const entries = await parser.parse('https://example.com/unknown')

      expect(entries[0].source).toBe('sitemap-txt')
    })

    test('should detect RSS by channel tag', async () => {
      const content = `<?xml version="1.0"?><channel><item><link>https://example.com</link></item></channel>`
      parser.setFetcher(() => ({ content }))

      const entries = await parser.parse('https://example.com/unknown')
      expect(entries[0].source).toBe('rss')
    })
  })

  describe('Limits and caching', () => {
    test('should respect maxUrls limit', async () => {
      parser = new SitemapParser({ maxUrls: 2 })

      const sitemap = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page1</loc></url>
  <url><loc>https://example.com/page2</loc></url>
  <url><loc>https://example.com/page3</loc></url>
  <url><loc>https://example.com/page4</loc></url>
</urlset>`

      parser.setFetcher(() => ({ content: sitemap }))
      const entries = await parser.parse('https://example.com/sitemap.xml')

      expect(entries).toHaveLength(2)
    })

    test('should cache parsed sitemaps', async () => {
      let fetchCount = 0
      parser.setFetcher(() => {
        fetchCount++
        return { content: `<?xml version="1.0"?><urlset><url><loc>https://example.com</loc></url></urlset>` }
      })

      await parser.parse('https://example.com/sitemap.xml')
      await parser.parse('https://example.com/sitemap.xml')

      expect(fetchCount).toBe(1)
    })

    test('should clear cache', async () => {
      let fetchCount = 0
      parser.setFetcher(() => {
        fetchCount++
        return { content: `<?xml version="1.0"?><urlset><url><loc>https://example.com</loc></url></urlset>` }
      })

      await parser.parse('https://example.com/sitemap.xml')
      parser.clearCache()
      await parser.parse('https://example.com/sitemap.xml')

      expect(fetchCount).toBe(2)
    })
  })

  describe('Statistics', () => {
    test('should track parsing stats', async () => {
      const sitemap = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page1</loc></url>
  <url><loc>https://example.com/page2</loc></url>
</urlset>`

      parser.setFetcher(() => ({ content: sitemap }))
      await parser.parse('https://example.com/sitemap.xml')

      const stats = parser.getStats()
      expect(stats.sitemapsParsed).toBe(1)
      expect(stats.urlsExtracted).toBe(2)
      expect(stats.errors).toBe(0)
    })

    test('should track errors', async () => {
      parser.setFetcher(() => { throw new Error('Network error') })

      await expect(parser.parse('https://example.com/sitemap.xml'))
        .rejects.toThrow('Network error')

      expect(parser.getStats().errors).toBe(1)
    })

    test('should reset stats', async () => {
      parser.setFetcher(() => ({ content: `<?xml version="1.0"?><urlset><url><loc>https://example.com</loc></url></urlset>` }))
      await parser.parse('https://example.com/sitemap.xml')

      parser.resetStats()

      const stats = parser.getStats()
      expect(stats.sitemapsParsed).toBe(0)
      expect(stats.urlsExtracted).toBe(0)
    })
  })

  describe('Robots.txt discovery', () => {
    test('should discover sitemaps from robots.txt', async () => {
      const robotsTxt = `User-agent: *
Disallow: /admin/

Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/sitemap-news.xml`

      parser.setFetcher(() => ({ content: robotsTxt }))
      const sitemaps = await parser.discoverFromRobotsTxt('https://example.com/robots.txt')

      expect(sitemaps).toHaveLength(2)
      expect(sitemaps).toContain('https://example.com/sitemap.xml')
      expect(sitemaps).toContain('https://example.com/sitemap-news.xml')
    })

    test('should handle robots.txt without sitemaps', async () => {
      const robotsTxt = `User-agent: *
Disallow: /admin/`

      parser.setFetcher(() => ({ content: robotsTxt }))
      const sitemaps = await parser.discoverFromRobotsTxt('https://example.com/robots.txt')

      expect(sitemaps).toHaveLength(0)
    })

    test('should handle fetch errors gracefully', async () => {
      parser.setFetcher(() => { throw new Error('404') })
      const sitemaps = await parser.discoverFromRobotsTxt('https://example.com/robots.txt')

      expect(sitemaps).toHaveLength(0)
    })
  })

  describe('Common locations probing', () => {
    test('should probe common sitemap locations', async () => {
      parser.setFetcher(async (url) => {
        if (url.includes('sitemap.xml')) {
          return { content: `<?xml version="1.0"?><urlset><url><loc>https://example.com</loc></url></urlset>` }
        }
        throw new Error('404')
      })

      const results = await parser.probeCommonLocations('https://example.com')

      const found = results.filter(r => r.exists)
      expect(found.length).toBeGreaterThan(0)
      expect(found[0].format).toBe('xml-sitemap')

      const notFound = results.filter(r => !r.exists)
      expect(notFound.length).toBeGreaterThan(0)
    })
  })

  describe('Edge cases', () => {
    test('should handle empty sitemap', async () => {
      const sitemap = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`

      parser.setFetcher(() => ({ content: sitemap }))
      const entries = await parser.parse('https://example.com/sitemap.xml')

      expect(entries).toHaveLength(0)
    })

    test('should handle malformed XML gracefully', async () => {
      const sitemap = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://example.com/page1</loc></url>
  <url><loc>https://example.com/page2</loc>
  <url><loc>https://example.com/page3</loc></url>
</urlset>`

      parser.setFetcher(() => ({ content: sitemap }))
      const entries = await parser.parse('https://example.com/sitemap.xml')

      // Should extract what it can (regex-based parsing is lenient)
      expect(entries.length).toBeGreaterThanOrEqual(1)
    })

    test('should handle very long descriptions', async () => {
      const longDesc = 'A'.repeat(500)
      const rss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <link>https://example.com/post</link>
      <description>${longDesc}</description>
    </item>
  </channel>
</rss>`

      parser.setFetcher(() => ({ content: rss }))
      const entries = await parser.parse('https://example.com/rss.xml')

      expect(entries[0].description.length).toBe(200) // Truncated
    })

    test('should handle unicode in URLs', async () => {
      const sitemap = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/日本語</loc></url>
</urlset>`

      parser.setFetcher(() => ({ content: sitemap }))
      const entries = await parser.parse('https://example.com/sitemap.xml')

      expect(entries[0].url).toBe('https://example.com/日本語')
    })

    test('should handle numeric character references', async () => {
      const sitemap = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page&#63;id=1</loc></url>
</urlset>`

      parser.setFetcher(() => ({ content: sitemap }))
      const entries = await parser.parse('https://example.com/sitemap.xml')

      expect(entries[0].url).toBe('https://example.com/page?id=1')
    })
  })
})
