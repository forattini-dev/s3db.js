# 🕷️ Spider Plugin

> **Advanced web crawling with URL pattern matching, robots.txt compliance, and sitemap discovery.**

---

## Quick Start

```javascript
import { Database } from 's3db.js'
import { SpiderPlugin } from 's3db.js/plugins'

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
await spider.enqueueTarget({
  url: 'https://example.com/products/123',
  activities: ['seo']
})
```

## Features

- **🎯 URL Pattern Matching** - Express-style patterns with parameter extraction
- **🤖 Robots.txt Compliance** - RFC 9309 compliant parser
- **🗺️ Sitemap Discovery** - XML, gzip, text, RSS, Atom support
- **🔗 Link Discovery** - Auto-crawl with filtering
- **⚙️ Queue Processing** - Priority-based URL processing
- **🔍 Deep Discovery** - Crawler compatibility analysis (Google, Bing, Yandex, Baidu)

## Documentation

📖 **[Complete Documentation →](./spider-full.md)**

### Quick Links

- [URL Pattern Matching](./spider-full.md#url-pattern-matching) - Express patterns, regex, wildcards
- [Link Discovery](./spider-full.md#link-discovery) - Auto-crawl configuration
- [Robots.txt Parser](./spider-full.md#robotstxt-parser) - RFC compliance
- [Sitemap Parser](./spider-full.md#sitemap-parser) - Multi-format support
- **[🔍 Deep Discovery](./spider/deep-discovery.md)** - **Crawler compatibility analysis** (NEW!)
- [Configuration](./spider-full.md#configuration) - All options
- [API Reference](./spider-full.md#api-reference) - Methods and events
- [Examples](./spider-full.md#examples) - Working code
- [FAQ](./spider-full.md#faq) - Common questions

## Components

### SpiderPlugin
Main plugin for queue-based URL processing with pattern matching.

### DeepDiscovery ⭐ **NEW**
Advanced website intelligence with crawler compatibility analysis for Google, Bing, Yandex, Baidu, and DuckDuckGo. Detects 100+ sitemap variants, analyzes robots.txt directives, scores crawler compatibility (0-10), estimates crawl budget, and identifies platform-specific optimizations.

**[📖 Full Documentation →](./spider/deep-discovery.md)**

### LinkDiscoverer
Extract and filter links from HTML pages with robots.txt and sitemap support.

### RobotsParser
Parse and respect robots.txt rules (User-agent, Allow, Disallow, Crawl-delay, Sitemap).

### SitemapParser
Parse sitemaps in multiple formats (XML, gzip, text, RSS, Atom).

## Examples

```javascript
// URL Pattern Matching
const match = spider.matchUrl('https://example.com/products/123')
console.log(match.params)      // { id: '123' }
console.log(match.activities)  // ['seo', 'screenshot']

// Link Discovery with Robots.txt
const discoverer = new LinkDiscoverer({ respectRobotsTxt: true })
const links = await discoverer.extractLinksAsync(html, baseUrl, 0)

// Sitemap Discovery
const links = await discoverer.discoverFromSitemaps('https://example.com')
console.log(links[0].metadata.fromSitemap)  // true

// Deep Discovery (NEW!)
import { DeepDiscovery } from 's3db.js/plugins/spider'

const deepDiscovery = new DeepDiscovery()
const report = await deepDiscovery.discover('https://example.com')

console.log('Google score:', report.crawlerCompatibility.google.score)  // 8.5/10
console.log('Bing score:', report.crawlerCompatibility.bing.score)      // 7.0/10
console.log('Crawl time:', report.crawlBudget.estimatedCrawlTime.google) // "43min"
```

**Examples:**
- `docs/examples/e104-spider-pattern-matching.js` - Pattern matching
- `docs/examples/e105-deep-discovery.js` - Deep discovery (11 examples)

## Performance

- Pattern matching: **~1-5ms per URL**
- Sitemap parsing: **1,000-10,000 URLs/sec**
- Robots.txt caching: **1 hour TTL**

## Tests

**139 tests** covering all components:
- 26 tests - URL Pattern Matcher
- 48 tests - Link Discoverer  
- 30 tests - Robots.txt Parser
- 35 tests - Sitemap Parser

---

📖 **[Read Full Documentation →](./spider-full.md)**
