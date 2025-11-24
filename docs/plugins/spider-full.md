# 🕷️ Spider Plugin - Complete Documentation

> Advanced web crawling with URL pattern matching, robots.txt compliance, and sitemap discovery

## Table of Contents

1. [Overview](#overview)
2. [URL Pattern Matching](#url-pattern-matching)
3. [Link Discovery](#link-discovery)
4. [Robots.txt Parser](#robotstxt-parser)
5. [Sitemap Parser](#sitemap-parser)
6. [Configuration](#configuration)
7. [API Reference](#api-reference)
8. [Examples](#examples)
9. [FAQ](#faq)

## Overview

The Spider Plugin provides comprehensive web crawling capabilities with:

- **URL Pattern Matching** - Express-style patterns with parameter extraction
- **Link Discovery** - Automatic crawling with domain/pattern filtering
- **Robots.txt Compliance** - RFC 9309 compliant parser with caching
- **Sitemap Support** - XML, gzip, text, RSS, Atom formats
- **Queue Processing** - Priority-based URL processing

## URL Pattern Matching

### Express-Style Patterns

```javascript
patterns: {
  product: {
    match: '/products/:productId',
    activities: ['seo', 'screenshot'],
    priority: 10
  },
  
  blogPost: {
    match: '/blog/:year/:month/:slug',
    activities: ['content']
  },
  
  category: {
    match: '/category/*',      // Single segment wildcard
    activities: ['links']
  },
  
  docs: {
    match: '/docs/**',          // Multi-segment wildcard
    activities: ['basic']
  }
}
```

### Regex Patterns

```javascript
patterns: {
  apiDocs: {
    match: /\/api\/v(\d+)\/(.*)/,
    activities: ['docs'],
    priority: 15
  }
}
```

### Query String Extraction

```javascript
patterns: {
  search: {
    match: '/search',
    extract: {
      query: 'q',
      page: 'page'
    },
    activities: ['search_results']
  }
}
```

## Link Discovery

### Basic Usage

```javascript
import { LinkDiscoverer } from 's3db.js/plugins/spider'

const discoverer = new LinkDiscoverer({
  enabled: true,
  maxDepth: 3,
  maxUrls: 1000,
  sameDomainOnly: true,
  respectRobotsTxt: true,
  useSitemaps: true
})

// Extract links from HTML
const links = discoverer.extractLinks(html, baseUrl, depth)

// Or use async with robots.txt checking
const links = await discoverer.extractLinksAsync(html, baseUrl, depth)
```

### Domain Filtering

```javascript
{
  sameDomainOnly: true,
  includeSubdomains: true,
  allowedDomains: ['example.com', 'partner.com'],
  blockedDomains: ['ads.example.com']
}
```

### Pattern-Based Filtering

```javascript
{
  followPatterns: ['product', 'category'],
  followRegex: /\/(products|category)\//,
  ignoreRegex: /\/(api|admin)\//
}
```

## Robots.txt Parser

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

### Supported Directives

```text
User-agent: *
Disallow: /admin/
Disallow: /private/*.pdf
Allow: /public/
Crawl-delay: 2
Sitemap: https://example.com/sitemap.xml
```

### Wildcards

- `*` - Matches any sequence of characters
- `$` - End anchor (e.g., `/*.php$` matches only `.php` endings)

## Sitemap Parser

### Supported Formats

| Format | Extension | Description |
|--------|-----------|-------------|
| XML | `.xml` | Standard sitemaps.org |
| XML Index | `.xml` | Multiple sitemaps |
| Compressed | `.xml.gz` | Gzipped XML |
| Text | `.txt` | One URL per line |
| RSS | `.rss` | RSS 2.0 feeds |
| Atom | `.atom` | Atom feeds |

### Basic Usage

```javascript
import { SitemapParser } from 's3db.js/plugins/spider'

const parser = new SitemapParser({
  userAgent: 's3db-spider',
  maxUrls: 50000
})

const entries = await parser.parse('https://example.com/sitemap.xml')
```

### Integration with LinkDiscoverer

```javascript
const links = await discoverer.discoverFromSitemaps('https://example.com', {
  autoDiscover: true,   // Find sitemaps in robots.txt
  checkRobots: true     // Filter by robots.txt rules
})
```

## Configuration

### Complete Options

```javascript
const spider = new SpiderPlugin({
  namespace: 'crawler',
  
  patterns: {
    product: {
      match: '/products/:id',
      activities: ['seo'],
      metadata: { type: 'product' },
      priority: 10
    }
  },
  
  discovery: {
    enabled: true,
    maxDepth: 3,
    maxUrls: 1000,
    sameDomainOnly: true,
    includeSubdomains: true,
    followPatterns: ['product'],
    respectRobotsTxt: true,
    robotsUserAgent: 's3db-spider',
    robotsCacheTimeout: 3600000,
    useSitemaps: true,
    sitemapMaxUrls: 10000
  },
  
  queue: {
    autoStart: true,
    concurrency: 5,
    retryAttempts: 3
  }
})
```

## API Reference

### SpiderPlugin

```javascript
// Enqueue URLs
await spider.enqueueTarget({ url, activities, metadata, priority })
await spider.enqueueBatch([{ url, activities }, ...])

// Process queue
const target = await spider.dequeueTarget()
await spider.completeTarget(id, result)
await spider.failTarget(id, error)

// Pattern matching
const match = spider.matchUrl(url)
spider.addPattern(name, config)
spider.removePattern(name)
const patterns = spider.getPatternNames()
```

### LinkDiscoverer

```javascript
// Extract links
const links = discoverer.extractLinks(html, baseUrl, depth)
const links = await discoverer.extractLinksAsync(html, baseUrl, depth)

// Sitemaps
const links = await discoverer.discoverFromSitemaps(url, options)
const entries = await discoverer.parseSitemap(url)
const locations = await discoverer.probeSitemapLocations(url)

// Stats
const stats = discoverer.getStats()
discoverer.reset({ clearRobotsCache, clearSitemapCache })
```

### RobotsParser

```javascript
// Check URLs
const result = await parser.isAllowed(url)
const delay = await parser.getCrawlDelay(domain)
const sitemaps = await parser.getSitemaps(domain)

// Cache management
await parser.preload(domain)
parser.clearCache(domain)
const stats = parser.getCacheStats()
```

### SitemapParser

```javascript
// Parse sitemaps
const entries = await parser.parse(url, options)
const sitemaps = await parser.discoverFromRobotsTxt(robotsUrl)
const locations = await parser.probeCommonLocations(baseUrl)

// Stats
const stats = parser.getStats()
parser.clearCache(url)
parser.resetStats()
```

## Examples

See `docs/examples/e104-spider-pattern-matching.js` for complete working example.

### URL Pattern Matching

```javascript
const spider = new SpiderPlugin({
  patterns: {
    product: { match: '/products/:id', activities: ['seo'] },
    category: { match: '/category/*', activities: ['links'] }
  }
})

const match = spider.matchUrl('https://example.com/products/123')
console.log(match.params.id)  // '123'
```

### Link Discovery with Robots.txt

```javascript
const discoverer = new LinkDiscoverer({
  respectRobotsTxt: true,
  robotsUserAgent: 'my-bot'
})

const links = await discoverer.extractLinksAsync(html, baseUrl, 0)
// Automatically filters disallowed URLs
```

### Sitemap Discovery

```javascript
const links = await discoverer.discoverFromSitemaps('https://example.com', {
  autoDiscover: true,  // Find sitemaps in robots.txt
  checkRobots: true    // Respect robots.txt
})

console.log(links[0].metadata.fromSitemap)  // true
console.log(links[0].metadata.lastmod)      // '2024-01-15'
```

## FAQ

**Q: What formats does the sitemap parser support?**
A: XML, XML index, gzipped XML, text (.txt), RSS 2.0, and Atom feeds.

**Q: Does it respect robots.txt?**
A: Yes, when `respectRobotsTxt: true` (default). Supports all standard directives including wildcards.

**Q: How do I avoid getting blocked?**
A: 1) Respect robots.txt, 2) Use crawl delays, 3) Limit concurrency, 4) Use descriptive user-agent.

**Q: Can I use custom user-agents?**
A: Yes, set `robotsUserAgent` and/or `sitemapUserAgent` in config.

**Q: How does pattern priority work?**
A: Higher priority values match first. Same priority = more specific patterns win.

**Q: Can I combine pattern matching with regex?**
A: Yes, patterns support both Express-style and pure regex.

**Q: Does it cache robots.txt and sitemaps?**
A: Yes, both are cached with configurable TTL (default 1 hour).

**Q: How do I handle large sitemaps?**
A: Set `maxUrls` limits and use sitemap indexes to split data.

**Q: Can I test without making HTTP requests?**
A: Yes, use custom fetchers for testing:
```javascript
new RobotsParser({ fetcher: async () => 'User-agent: *\nDisallow:' })
new SitemapParser({ fetcher: async () => ({ content: '<urlset>...</urlset>' }) })
```

**Q: What's the performance?**
A: Pattern matching: 1-5ms/URL, Sitemap parsing: 1K-10K URLs/sec, Robots.txt: cached for 1hr.

---

**Last Updated:** 2024-11-24  
**Version:** 18.0.9+
