# Configuration

> **In this guide:** All configuration options, pattern types, component options, and API reference.

**Navigation:** [← Back to Spider Plugin](/plugins/spider/README.md)

---

## Plugin Options

```javascript
const spider = new SpiderPlugin({
  namespace: 'crawler',

  patterns: {
    product: {
      match: '/products/:id',
      activities: ['seo', 'screenshot'],
      metadata: { type: 'product' },
      priority: 10
    }
  },

  discovery: {
    enabled: true,
    maxDepth: 3,
    maxUrls: 1000,
    sameDomainOnly: true,
    respectRobotsTxt: true,
    useSitemaps: true
  },

  queue: {
    autoStart: true,
    concurrency: 5,
    retryAttempts: 3
  }
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `namespace` | string | `'spider'` | Plugin namespace for storage |
| `patterns` | object | `{}` | URL pattern configurations |
| `discovery` | object | `{}` | Link discovery options |
| `queue` | object | `{}` | Queue processing options |

---

## URL Patterns

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

| Pattern Type | Example | Matches |
|-------------|---------|---------|
| Named parameter | `:id` | `/products/123` → `{ id: '123' }` |
| Single wildcard | `*` | `/category/electronics` |
| Multi-segment | `**` | `/docs/api/v1/users` |

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

### Pattern Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `match` | string/RegExp | required | Pattern to match URL path |
| `activities` | string[] | `[]` | Activities to run on match |
| `metadata` | object | `{}` | Custom metadata for matched URLs |
| `priority` | number | `0` | Higher priority patterns match first |
| `extract` | object | `null` | Query string parameters to extract |

---

## Discovery Options

```javascript
discovery: {
  enabled: true,
  maxDepth: 3,
  maxUrls: 1000,
  sameDomainOnly: true,
  includeSubdomains: true,
  allowedDomains: ['example.com', 'partner.com'],
  blockedDomains: ['ads.example.com'],
  followPatterns: ['product', 'category'],
  followRegex: /\/(products|category)\//,
  ignoreRegex: /\/(api|admin)\//,
  respectRobotsTxt: true,
  robotsUserAgent: 's3db-spider',
  robotsCacheTimeout: 3600000,
  useSitemaps: true,
  sitemapMaxUrls: 10000
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable link discovery |
| `maxDepth` | number | `3` | Maximum crawl depth |
| `maxUrls` | number | `1000` | Maximum URLs to discover |
| `sameDomainOnly` | boolean | `true` | Only crawl same domain |
| `includeSubdomains` | boolean | `true` | Include subdomains |
| `allowedDomains` | string[] | `[]` | Whitelist of allowed domains |
| `blockedDomains` | string[] | `[]` | Blacklist of blocked domains |
| `followPatterns` | string[] | `[]` | Only follow URLs matching these patterns |
| `followRegex` | RegExp | `null` | Regex filter for URLs to follow |
| `ignoreRegex` | RegExp | `null` | Regex filter for URLs to ignore |
| `respectRobotsTxt` | boolean | `true` | Respect robots.txt rules |
| `robotsUserAgent` | string | `'s3db-spider'` | User-agent for robots.txt |
| `robotsCacheTimeout` | number | `3600000` | Robots.txt cache TTL (ms) |
| `useSitemaps` | boolean | `true` | Discover URLs from sitemaps |
| `sitemapMaxUrls` | number | `10000` | Maximum URLs from sitemaps |

---

## Queue Options

```javascript
queue: {
  autoStart: true,
  concurrency: 5,
  retryAttempts: 3,
  retryDelay: 1000
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoStart` | boolean | `true` | Start processing automatically |
| `concurrency` | number | `5` | Concurrent URL processing |
| `retryAttempts` | number | `3` | Retry failed URLs |
| `retryDelay` | number | `1000` | Delay between retries (ms) |

---

## Component Configuration

### LinkDiscoverer

```javascript
import { LinkDiscoverer } from 's3db.js'

const discoverer = new LinkDiscoverer({
  enabled: true,
  maxDepth: 3,
  maxUrls: 1000,
  sameDomainOnly: true,
  respectRobotsTxt: true,
  useSitemaps: true
})
```

### RobotsParser

```javascript
import { RobotsParser } from 's3db.js'

const parser = new RobotsParser({
  userAgent: 's3db-spider',
  defaultAllow: true,
  cacheTimeout: 3600000
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `userAgent` | string | `'s3db-spider'` | User-agent for matching rules |
| `defaultAllow` | boolean | `true` | Default if no rules match |
| `cacheTimeout` | number | `3600000` | Cache TTL (ms) |

**Supported Directives:**

```text
User-agent: *
Disallow: /admin/
Disallow: /private/*.pdf
Allow: /public/
Crawl-delay: 2
Sitemap: https://example.com/sitemap.xml
```

### SitemapParser

```javascript
import { SitemapParser } from 's3db.js'

const parser = new SitemapParser({
  userAgent: 's3db-spider',
  maxUrls: 50000,
  timeout: 30000
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `userAgent` | string | `'s3db-spider'` | HTTP user-agent |
| `maxUrls` | number | `50000` | Maximum URLs to parse |
| `timeout` | number | `30000` | Request timeout (ms) |

**Supported Formats:**

| Format | Extension | Description |
|--------|-----------|-------------|
| XML | `.xml` | Standard sitemaps.org |
| XML Index | `.xml` | Multiple sitemaps |
| Compressed | `.xml.gz` | Gzipped XML |
| Text | `.txt` | One URL per line |
| RSS | `.rss` | RSS 2.0 feeds |
| Atom | `.atom` | Atom feeds |

### DeepDiscovery

```javascript
import { DeepDiscovery } from 's3db.js'

const discoverer = new DeepDiscovery({
  userAgent: 's3db-deep-discovery/1.0',
  timeout: 10000,
  maxConcurrent: 10,
  checkSubdomains: true,
  detectFrameworks: true,
  detectEcommerce: true,
  detectCMS: true
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `userAgent` | string | `'s3db-deep-discovery/1.0'` | HTTP user-agent |
| `timeout` | number | `10000` | Request timeout (ms) |
| `maxConcurrent` | number | `10` | Max parallel requests |
| `checkSubdomains` | boolean | `true` | Check subdomain sitemaps |
| `detectFrameworks` | boolean | `true` | Detect JS frameworks |
| `detectEcommerce` | boolean | `true` | Detect e-commerce platforms |
| `detectCMS` | boolean | `true` | Detect CMS platforms |

---

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

### DeepDiscovery

```javascript
// Run discovery
const report = await discoverer.discover(baseUrl, {
  analyzeRobots: true,
  includeSitemaps: true,
  includeFeeds: true,
  includeAPIs: true,
  detectPlatform: true,
  includeSubdomains: true
})

// Stats
const stats = discoverer.getStats()
```

---

## See Also

- [Usage Patterns](/plugins/spider/guides/usage-patterns.md) - Crawling patterns, discovery, real-world examples
- [Best Practices](/plugins/spider/guides/best-practices.md) - Performance, troubleshooting, FAQ
- [Deep Discovery](/plugins/spider/deep-discovery.md) - Advanced crawler compatibility analysis

