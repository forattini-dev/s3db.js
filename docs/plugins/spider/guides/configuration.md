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
  },

  recker: {
    ensureCurlImpersonate: false
  }
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `namespace` | string | `'spider'` | Plugin namespace for storage |
| `patterns` | object | `{}` | URL pattern configurations |
| `discovery` | object | `{}` | Link discovery options |
| `queue` | object | `{}` | Queue processing options |
| `rateLimit` | object | `{}` | Rate limiting via Recker RequestPool |
| `recker` | object | `{}` | Recker transport and curl-impersonate setup options |

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
  robotsUserAgent: '*',
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
| `removeTrackingParams` | boolean | `true` | Strip utm_*, gclid, fbclid, etc. from discovered URLs |
| `respectRobotsTxt` | boolean | `true` | Respect robots.txt rules |
| `robotsUserAgent` | string | `'*'` | User-agent for robots.txt rule matching |
| `robotsCacheTimeout` | number | `3600000` | Robots.txt cache TTL (ms) |
| `useSitemaps` | boolean | `true` | Discover URLs from sitemaps |
| `sitemapMaxUrls` | number | `10000` | Maximum URLs from sitemaps |

---

## Queue Options

```javascript
queue: {
  backend: 's3', // 's3' | 'queue-consumer'
  autoStart: true,
  concurrency: 5,
  maxRetries: 3,
  retryDelay: 1000,

  // Optional S3Queue-specific overrides
  s3: {
    orderingGuarantee: true
  },

  // Optional QueueConsumer backend
  consumer: {
    consumers: [
      {
        driver: 'sqs',
        config: { queueUrl: process.env.SPIDER_QUEUE_URL },
        consumers: [{ resources: 'crawl_jobs' }]
      }
    ]
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `backend` | string | `'s3'` | Queue backend (`'s3'` or `'queue-consumer'`) |
| `autoStart` | boolean | `true` | Start processing automatically |
| `concurrency` | number | `5` | Concurrent URL processing |
| `maxRetries` | number | `3` | Retry failed URLs |
| `retryDelay` | number | `1000` | Delay between retries (ms) |
| `s3` | object | `{}` | S3QueuePlugin-specific overrides |
| `consumer` | object | `{}` | QueueConsumerPlugin backend options |
| `consumers` | array | `[]` | Shortcut for `queue.consumer.consumers` |

---

## Rate Limiting

Spider uses Recker's `RequestPool` (dynamic import from `recker/utils/request-pool`) for sliding-window rate limiting on page navigations.

```javascript
const spider = new SpiderPlugin({
  rateLimit: {
    concurrency: 5,
    requestsPerInterval: 10,
    interval: 1000
  }
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `concurrency` | number | `5` | Maximum parallel requests |
| `requestsPerInterval` | number | `10` | Maximum requests per interval window |
| `interval` | number | `1000` | Sliding window interval in milliseconds |

If `recker/utils/request-pool` is not available, rate limiting is silently disabled.

---

## Recker and curl-impersonate

By default, Spider + Recker keeps transport selection automatic.
You can enable forced curl impersonation only when needed via `useCurl: true`.
If you want automatic installation during plugin boot, set `recker.ensureCurlImpersonate: true`.

### Install curl-impersonate with Recker

```bash
# No global install
npx recker setup

# Or global CLI
rek setup
```

### Auto-ensure at plugin startup

```javascript
const spider = new SpiderPlugin({
  recker: {
    ensureCurlImpersonate: true
  }
})
```

### Force impersonation for specific crawls

```javascript
const context = new CrawlContext({
  useCurl: true,
  proxy: [
    'http://proxy1.example.com:8080',
    'socks5://proxy2.example.com:1080'
  ]
})
```

### Pass complete Recker config

```javascript
const context = new CrawlContext({
  recker: {
    http2: { enabled: true },
    dns: { servers: ['1.1.1.1', '8.8.8.8'] },
    searchParams: { source: 'spider' }
  }
})
```

### Runtime helpers (SpiderPlugin)

```javascript
const status = await spider.getCurlImpersonateStatus()
await spider.installCurlImpersonate()
await spider.ensureCurlImpersonate()
```

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
  useSitemaps: true,
  removeTrackingParams: true  // Strips utm_*, gclid, fbclid, etc. (default: true)
})
```

### RobotsParser

```javascript
import { RobotsParser } from 's3db.js'

const parser = new RobotsParser({
  userAgent: '*',
  defaultAllow: true,
  cacheTimeout: 3600000
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `userAgent` | string | `'*'` | User-agent for robots.txt rule matching |
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
  userAgent: '*',
  maxUrls: 50000,
  timeout: 30000
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `userAgent` | string | `'*'` | User-agent for robots.txt rule matching |
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

### CrawlContext

```javascript
import { CrawlContext } from 's3db.js'

const context = new CrawlContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  platform: 'Windows',
  proxy: 'http://proxy:8080',
  randomizeHeaders: true,  // Vary Sec-CH-UA, Accept-Language per request
  viewport: { width: 1920, height: 1080 },
  timezone: 'America/New_York'
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `userAgent` | string | Auto-generated Chrome UA | HTTP User-Agent string |
| `platform` | string | `'Windows'` | Platform for UA and Sec-CH-UA-Platform |
| `proxy` | string/string[] | `null` | Proxy URL(s) |
| `randomizeHeaders` | boolean | `false` | Randomize Sec-CH-UA and Accept-Language per request |
| `viewport` | object | `{ width: 1920, height: 1080 }` | Browser viewport size |
| `timezone` | string | `'America/New_York'` | Timezone emulation |
| `useCurl` | boolean | `undefined` | Force curl-impersonate transport |
| `recker` | object | `undefined` | Recker HTTP client options |

### HybridFetcher

```javascript
import { HybridFetcher } from 's3db.js'

const fetcher = new HybridFetcher({
  context: new CrawlContext({ randomizeHeaders: true }),
  strategy: 'auto',
  detectBlocks: true,  // Detect Cloudflare, Akamai, WAF blocks (default: true)
  timeout: 30000
})

// Fetch with CSS data extraction
const result = await fetcher.fetch('https://example.com', {
  extract: { title: 'h1', price: '.price' }
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `context` | CrawlContext | Auto-created | Shared session state |
| `strategy` | string | `'auto'` | `'auto'`, `'recker-only'`, or `'puppeteer-only'` |
| `detectBlocks` | boolean | `true` | Detect WAF/CDN blocks via `recker/utils/block-detector` |
| `timeout` | number | `30000` | Request timeout (ms) |
| `navigationTimeout` | number | `30000` | Puppeteer navigation timeout (ms) |
| `puppeteerOptions` | object | `{}` | Puppeteer launch options |
| `jsDetectionPatterns` | RegExp[] | Built-in SPA patterns | Patterns to detect JS-rendered pages |

**FetchOptions:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `method` | string | `'GET'` | HTTP method |
| `headers` | object | `{}` | Extra headers |
| `body` | unknown | `undefined` | Request body |
| `timeout` | number | Fetcher timeout | Per-request timeout |
| `keepPage` | boolean | `false` | Keep puppeteer page open |
| `extract` | object | `undefined` | CSS selector schema for data extraction |

**FetchResult fields:**

| Field | Type | Description |
|-------|------|-------------|
| `html` | string | Page HTML content |
| `source` | string | `'recker'` or `'puppeteer'` |
| `status` | number | HTTP status code |
| `blocked` | boolean | `true` if WAF/CDN block detected |
| `blockReason` | string | `'cloudflare'`, `'akamai'`, `'datadome'`, `'waf'`, `'rate-limit'` |
| `captcha` | boolean | `true` if CAPTCHA detected |
| `captchaProvider` | string | `'recaptcha'`, `'hcaptcha'`, `'turnstile'`, `'funcaptcha'` |
| `extracted` | object | CSS-extracted data (when `extract` option is used) |

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

// curl-impersonate lifecycle (Recker)
const impersonate = await spider.getCurlImpersonateStatus()
await spider.installCurlImpersonate()
await spider.ensureCurlImpersonate()
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

### HybridFetcher

```javascript
// Fetch with auto strategy (HTTP → puppeteer fallback on JS/block)
const result = await fetcher.fetch(url, options)

// Force HTTP-only or puppeteer-only
const result = await fetcher.fetchWithRecker(url, options)
const result = await fetcher.fetchWithPuppeteer(url, options)

// CSS data extraction on raw HTML
const data = await fetcher.extract(html, { title: 'h1', price: '.price' })

// HEAD request
const head = await fetcher.head(url)

// Check if URL needs puppeteer
const needsJs = await fetcher.needsPuppeteer(url)

// Stats and cleanup
const stats = fetcher.getStats()
await fetcher.close()
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
