# Usage Patterns

> **In this guide:** Crawling patterns, link discovery, robots.txt compliance, sitemap handling, and real-world examples.

**Navigation:** [← Back to Spider Plugin](/plugins/spider/README.md) | [Configuration](/plugins/spider/guides/configuration.md)

---

## Basic Crawling

### URL Pattern Matching

```javascript
import { Database } from 's3db.js'
import { SpiderPlugin } from 's3db.js/plugins'

const spider = new SpiderPlugin({
  namespace: 'crawler',
  patterns: {
    product: {
      match: '/products/:id',
      activities: ['seo', 'screenshot'],
      priority: 10
    },
    category: {
      match: '/category/*',
      activities: ['links']
    }
  }
})

await db.usePlugin(spider)

// Match URL and extract parameters
const match = spider.matchUrl('https://example.com/products/123')
console.log(match.params)      // { id: '123' }
console.log(match.activities)  // ['seo', 'screenshot']
```

### Enqueue and Process URLs

```javascript
// Enqueue a single URL
await spider.enqueueTarget({
  url: 'https://example.com/products/123',
  activities: ['seo'],
  priority: 10
})

// Enqueue multiple URLs
await spider.enqueueBatch([
  { url: 'https://example.com/products/1', activities: ['seo'] },
  { url: 'https://example.com/products/2', activities: ['seo'] },
  { url: 'https://example.com/products/3', activities: ['seo'] }
])

// Process queue
const target = await spider.dequeueTarget()
// ... process target ...
await spider.completeTarget(target.id, { result: 'success' })
```

---

## Link Discovery

### Basic Link Extraction

```javascript
import { LinkDiscoverer } from 's3db.js/plugins/spider'

const discoverer = new LinkDiscoverer({
  enabled: true,
  maxDepth: 3,
  maxUrls: 1000,
  sameDomainOnly: true
})

// Extract links from HTML
const html = await fetch(url).then(r => r.text())
const links = discoverer.extractLinks(html, url, 0)

for (const link of links) {
  console.log(link.url, link.depth)
}
```

### With Robots.txt Compliance

```javascript
const discoverer = new LinkDiscoverer({
  respectRobotsTxt: true,
  robotsUserAgent: 'my-bot'
})

// Async extraction checks robots.txt
const links = await discoverer.extractLinksAsync(html, baseUrl, 0)
// Automatically filters disallowed URLs
```

### Domain Filtering

```javascript
const discoverer = new LinkDiscoverer({
  sameDomainOnly: true,
  includeSubdomains: true,
  allowedDomains: ['example.com', 'partner.com'],
  blockedDomains: ['ads.example.com']
})
```

### Pattern-Based Filtering

```javascript
const discoverer = new LinkDiscoverer({
  followPatterns: ['product', 'category'],
  followRegex: /\/(products|category)\//,
  ignoreRegex: /\/(api|admin)\//
})
```

---

## Robots.txt Handling

### Basic Usage

```javascript
import { RobotsParser } from 's3db.js/plugins/spider'

const parser = new RobotsParser({
  userAgent: 's3db-spider',
  defaultAllow: true
})

const result = await parser.isAllowed('https://example.com/page')
console.log(result.allowed)      // true/false
console.log(result.crawlDelay)   // milliseconds
```

### Get Crawl Delay

```javascript
const delay = await parser.getCrawlDelay('example.com')
if (delay > 0) {
  await sleep(delay)
}
```

### Get Sitemaps from Robots.txt

```javascript
const sitemaps = await parser.getSitemaps('example.com')
for (const sitemap of sitemaps) {
  console.log(sitemap)  // https://example.com/sitemap.xml
}
```

### Preload for Performance

```javascript
// Preload robots.txt before crawling
await parser.preload('example.com')

// Now isAllowed() uses cache
const allowed = await parser.isAllowed('https://example.com/page1')
```

---

## Sitemap Parsing

### Basic Parsing

```javascript
import { SitemapParser } from 's3db.js/plugins/spider'

const parser = new SitemapParser({
  userAgent: 's3db-spider',
  maxUrls: 50000
})

const entries = await parser.parse('https://example.com/sitemap.xml')

for (const entry of entries) {
  console.log(entry.loc)       // URL
  console.log(entry.lastmod)   // Last modified date
  console.log(entry.priority)  // Priority (0.0-1.0)
  console.log(entry.changefreq) // Change frequency
}
```

### Discover from Robots.txt

```javascript
const sitemaps = await parser.discoverFromRobotsTxt('https://example.com/robots.txt')
```

### Probe Common Locations

```javascript
const locations = await parser.probeCommonLocations('https://example.com')
// Checks: /sitemap.xml, /sitemap_index.xml, /sitemap-index.xml, etc.
```

### Integration with LinkDiscoverer

```javascript
const links = await discoverer.discoverFromSitemaps('https://example.com', {
  autoDiscover: true,   // Find sitemaps in robots.txt
  checkRobots: true     // Filter by robots.txt rules
})

console.log(links[0].metadata.fromSitemap)  // true
console.log(links[0].metadata.lastmod)      // '2024-01-15'
```

---

## Deep Discovery

### Crawler Compatibility Analysis

```javascript
import { DeepDiscovery } from 's3db.js/plugins/spider'

const deepDiscovery = new DeepDiscovery()
const report = await deepDiscovery.discover('https://example.com')

// Crawler compatibility scores (0-10)
console.log('Google:', report.crawlerCompatibility.google.score)
console.log('Bing:', report.crawlerCompatibility.bing.score)
console.log('Yandex:', report.crawlerCompatibility.yandex.score)
console.log('Baidu:', report.crawlerCompatibility.baidu.score)

// Crawl budget estimates
console.log('Crawl time:')
console.log('  Google:', report.crawlBudget.estimatedCrawlTime.google)
console.log('  Bing:', report.crawlBudget.estimatedCrawlTime.bing)
```

### Discovery Options

```javascript
const report = await deepDiscovery.discover('https://example.com', {
  analyzeRobots: true,        // robots.txt analysis
  includeSitemaps: true,      // Sitemap discovery
  includeFeeds: true,         // RSS/Atom/JSON feeds
  includeAPIs: true,          // API endpoint detection
  detectPlatform: true,       // Platform/framework detection
  includeSubdomains: true     // Subdomain sitemaps
})
```

### Platform Detection

```javascript
// Detects e-commerce, CMS, and frameworks
const platforms = report.discovered.platforms

for (const platform of platforms) {
  console.log(platform.type)       // 'ecommerce', 'cms', 'framework'
  console.log(platform.platform)   // 'shopify', 'wordpress', 'nextjs'
  console.log(platform.confidence) // 0.0-1.0
}
```

---

## Real-World Examples

### E-commerce Product Crawler

```javascript
const spider = new SpiderPlugin({
  namespace: 'ecommerce-crawler',
  patterns: {
    product: {
      match: '/products/:slug',
      activities: ['scrape', 'screenshot'],
      priority: 10
    },
    category: {
      match: '/collections/:category',
      activities: ['discover-links'],
      priority: 5
    },
    pagination: {
      match: '/collections/:category/page/:page',
      activities: ['discover-links'],
      priority: 3
    }
  },
  discovery: {
    maxDepth: 5,
    maxUrls: 10000,
    followPatterns: ['product', 'category', 'pagination'],
    respectRobotsTxt: true
  }
})

// Start crawl
await spider.enqueueTarget({
  url: 'https://shop.example.com/',
  activities: ['discover-links']
})
```

### News Site Crawler

```javascript
const spider = new SpiderPlugin({
  namespace: 'news-crawler',
  patterns: {
    article: {
      match: '/news/:year/:month/:slug',
      activities: ['content', 'metadata'],
      priority: 10
    },
    section: {
      match: '/news/:section',
      activities: ['discover'],
      priority: 5
    }
  },
  discovery: {
    useSitemaps: true,
    respectRobotsTxt: true,
    ignoreRegex: /\/(video|audio|live)\//
  }
})

// Discover from news sitemap
const discoverer = new LinkDiscoverer({ useSitemaps: true })
const newsUrls = await discoverer.discoverFromSitemaps('https://news.example.com')

await spider.enqueueBatch(newsUrls.map(u => ({
  url: u.url,
  activities: ['content'],
  metadata: { lastmod: u.metadata.lastmod }
})))
```

### SEO Audit Crawler

```javascript
const deepDiscovery = new DeepDiscovery({
  maxConcurrent: 5,
  timeout: 15000
})

// Audit multiple sites
const sites = ['https://example1.com', 'https://example2.com']

for (const site of sites) {
  const report = await deepDiscovery.discover(site)

  console.log(`\n${site}:`)
  console.log(`  Sitemaps: ${report.summary.sitemapCount}`)
  console.log(`  Google score: ${report.crawlerCompatibility.google.score}/10`)
  console.log(`  Bing score: ${report.crawlerCompatibility.bing.score}/10`)

  // Warnings
  for (const warning of report.crawlerCompatibility.google.warnings) {
    console.log(`  Warning: ${warning}`)
  }
}
```

### Respect Rate Limits

```javascript
const parser = new RobotsParser({ userAgent: 'my-bot' })

async function crawlWithRateLimit(urls) {
  for (const url of urls) {
    const domain = new URL(url).hostname

    // Check if allowed
    const result = await parser.isAllowed(url)
    if (!result.allowed) {
      console.log(`Skipping ${url} (disallowed)`)
      continue
    }

    // Respect crawl delay
    const delay = await parser.getCrawlDelay(domain)
    if (delay > 0) {
      await sleep(delay)
    }

    // Crawl
    await crawlUrl(url)
  }
}
```

### CI/CD Integration

```javascript
// In your CI pipeline
const deepDiscovery = new DeepDiscovery()
const report = await deepDiscovery.discover(stagingUrl)

// Fail build if compatibility drops
if (report.crawlerCompatibility.google.score < 7.0) {
  throw new Error('Google compatibility regression!')
}

if (report.crawlerCompatibility.bing.score < 6.0) {
  throw new Error('Bing compatibility issues!')
}

console.log('SEO audit passed!')
```

---

## Testing

### Mock HTTP Requests

```javascript
// Test robots.txt parsing without network
const mockFetcher = async (url) => {
  return 'User-agent: *\nDisallow: /admin/\nCrawl-delay: 2'
}

const parser = new RobotsParser({ fetcher: mockFetcher })
const result = await parser.isAllowed('https://example.com/page')
```

### Mock Sitemap Parsing

```javascript
const mockFetcher = async (url) => ({
  content: `
    <?xml version="1.0"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/page1</loc></url>
      <url><loc>https://example.com/page2</loc></url>
    </urlset>
  `
})

const parser = new SitemapParser({ fetcher: mockFetcher })
const entries = await parser.parse('https://example.com/sitemap.xml')
```

---

## See Also

- [Configuration](/plugins/spider/guides/configuration.md) - All options and API reference
- [Best Practices](/plugins/spider/guides/best-practices.md) - Performance, troubleshooting, FAQ
- [Deep Discovery](/plugins/spider/deep-discovery.md) - Advanced crawler compatibility analysis

