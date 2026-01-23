# Spider Plugin

> **Advanced web crawling with URL pattern matching, robots.txt compliance, and sitemap discovery.**

---

## TLDR

**Complete web crawling toolkit with pattern matching, robots.txt compliance, and crawler compatibility analysis.**

**1 line to get started:**
```javascript
await db.usePlugin(new SpiderPlugin({ patterns: { product: { match: '/products/:id' } } }))
```

**Key features:**
- Express-style URL pattern matching with parameter extraction
- RFC 9309 compliant robots.txt parser
- Multi-format sitemap support (XML, gzip, RSS, Atom)
- Link discovery with domain/pattern filtering
- DeepDiscovery: Crawler compatibility analysis for Google, Bing, Yandex, Baidu

**Use cases:**
- SEO auditing and monitoring
- E-commerce product scraping
- News/content aggregation
- Sitemap validation

---

## Quick Start

```javascript
import { Database } from 's3db.js';
import { SpiderPlugin } from 's3db.js';

const spider = new SpiderPlugin({
  namespace: 'crawler',
  patterns: {
    product: {
      match: '/products/:id',
      activities: ['seo', 'screenshot']
    }
  },
  discovery: {
    respectRobotsTxt: true,
    useSitemaps: true
  }
})

await db.usePlugin(spider)

// Match URL and extract parameters
const match = spider.matchUrl('https://example.com/products/123')
console.log(match.params)      // { id: '123' }
console.log(match.activities)  // ['seo', 'screenshot']

// Enqueue for processing
await spider.enqueueTarget({
  url: 'https://example.com/products/123',
  activities: ['seo']
})
```

---

## Dependencies

**Zero external dependencies** - built directly into s3db.js core.

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](./guides/configuration.md) | All options, pattern types, component options, API reference |
| [Usage Patterns](./guides/usage-patterns.md) | Crawling, link discovery, robots.txt, sitemaps, real-world examples |
| [Best Practices](./guides/best-practices.md) | Polite crawling, performance, troubleshooting, FAQ |
| [Deep Discovery](./deep-discovery.md) | Advanced crawler compatibility analysis (Google, Bing, Yandex, Baidu) |

---

## Quick Reference

### Components

| Component | Description |
|-----------|-------------|
| **SpiderPlugin** | Queue-based URL processing with pattern matching |
| **LinkDiscoverer** | Extract and filter links from HTML |
| **RobotsParser** | Parse and respect robots.txt rules |
| **SitemapParser** | Parse sitemaps (XML, gzip, RSS, Atom) |
| **DeepDiscovery** | Crawler compatibility analysis |

### Pattern Types

```javascript
patterns: {
  // Named parameters
  product: { match: '/products/:id' },

  // Single wildcard
  category: { match: '/category/*' },

  // Multi-segment wildcard
  docs: { match: '/docs/**' },

  // Regex
  api: { match: /\/api\/v(\d+)\/(.*)/ }
}
```

### Core Methods

```javascript
// SpiderPlugin
await spider.enqueueTarget({ url, activities, priority })
const match = spider.matchUrl(url)

// LinkDiscoverer
const links = await discoverer.extractLinksAsync(html, baseUrl, depth)
const sitemapLinks = await discoverer.discoverFromSitemaps(url)

// RobotsParser
const result = await parser.isAllowed(url)
const delay = await parser.getCrawlDelay(domain)

// SitemapParser
const entries = await parser.parse(sitemapUrl)

// DeepDiscovery
const report = await deepDiscovery.discover(url)
```

---

## Configuration Examples

### E-commerce Crawler

```javascript
const spider = new SpiderPlugin({
  patterns: {
    product: { match: '/products/:slug', priority: 10 },
    category: { match: '/collections/:category', priority: 5 }
  },
  discovery: {
    maxDepth: 5,
    maxUrls: 10000,
    respectRobotsTxt: true
  }
})
```

### SEO Audit

```javascript
import { DeepDiscovery } from 's3db.js'

const discovery = new DeepDiscovery()
const report = await discovery.discover('https://example.com')

console.log('Google score:', report.crawlerCompatibility.google.score)
console.log('Bing score:', report.crawlerCompatibility.bing.score)
console.log('Crawl time:', report.crawlBudget.estimatedCrawlTime.google)
```

### Polite Crawling

```javascript
const spider = new SpiderPlugin({
  discovery: {
    respectRobotsTxt: true,
    robotsUserAgent: 'MyBot/1.0 (+https://example.com/bot)'
  },
  queue: {
    concurrency: 3,
    retryAttempts: 3
  }
})
```

---

## Performance

| Operation | Performance |
|-----------|-------------|
| Pattern matching | ~1-5ms per URL |
| Sitemap parsing | 1,000-10,000 URLs/sec |
| Robots.txt | Cached for 1 hour |

---

## Tests

**139 tests** covering all components:
- 26 tests - URL Pattern Matcher
- 48 tests - Link Discoverer
- 30 tests - Robots.txt Parser
- 35 tests - Sitemap Parser

---

## See Also

- [Cache Plugin](/plugins/cache/README.md) - Cache crawl results
- [Queue Consumer Plugin](/plugins/queue-consumer/README.md) - Process URLs from SQS/RabbitMQ
