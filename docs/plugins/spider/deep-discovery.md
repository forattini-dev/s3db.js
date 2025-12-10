# 🔍 DeepDiscovery - Advanced Website Intelligence

> **Comprehensive web reconnaissance with crawler compatibility analysis for Google, Bing, Yandex, Baidu, and DuckDuckGo**

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Core Features](#core-features)
4. [Crawler Compatibility Analysis](#crawler-compatibility-analysis)
5. [Discovery Strategies](#discovery-strategies)
6. [Configuration](#configuration)
7. [API Reference](#api-reference)
8. [Output Structure](#output-structure)
9. [Best Practices](#best-practices)
10. [FAQ](#faq)

---

## Overview

DeepDiscovery is an advanced website intelligence gathering tool that analyzes how different search engine crawlers will interact with your site. It goes beyond basic sitemap detection to provide actionable insights about crawler compatibility, crawl budget, and optimization opportunities.

### What Makes It Unique

Unlike basic crawlers, DeepDiscovery:

- **Analyzes crawler-specific behavior** - Google, Bing, Yandex, Baidu, DuckDuckGo
- **Scores compatibility (0-10)** - Know exactly how well your site works with each crawler
- **Detects Bing-specific features** - `<priority>`, `<changefreq>` tags
- **Identifies Yandex directives** - `Host:`, `Crawl-delay:`
- **Estimates crawl budget** - Time required per search engine
- **Detects JavaScript/SPA issues** - Warnings for Baidu/Yandex
- **Finds AMP pages** - Google News optimization
- **Discovers 100+ sitemap variants** - Standard, News, Images, Videos, Localized

---

## Quick Start

```javascript
import { DeepDiscovery } from 's3db.js/plugins/spider'

const discoverer = new DeepDiscovery({
  userAgent: 's3db-deep-discovery/1.0',
  timeout: 10000,
  maxConcurrent: 10
})

const report = await discoverer.discover('https://example.com', {
  analyzeRobots: true,
  includeSitemaps: true,
  includeFeeds: true,
  includeAPIs: true,
  detectPlatform: true
})

// Crawler compatibility scores
console.log('Google:', report.crawlerCompatibility.google.score)  // 8.5/10
console.log('Bing:', report.crawlerCompatibility.bing.score)      // 7.0/10
console.log('Yandex:', report.crawlerCompatibility.yandex.score)  // 6.5/10
console.log('Baidu:', report.crawlerCompatibility.baidu.score)    // 4.0/10

// Crawl budget
console.log('Estimated crawl time:')
console.log('  Google:', report.crawlBudget.estimatedCrawlTime.google)  // "43min"
console.log('  Bing:', report.crawlBudget.estimatedCrawlTime.bing)      // "2.6h"
```

---

## Core Features

### 1. **Google Sitemap Extensions**

Detects and analyzes all Google-specific sitemap types:

| Sitemap Type | Priority | Description | Crawlers |
|-------------|----------|-------------|----------|
| **Sitemap Index** | 10 | References multiple sitemaps | All |
| **Google News** | 9 | Time-sensitive (2 days window) | Google (excelente), Yandex (funciona), Bing (fraco) |
| **Google Images** | 8 | Image-specific metadata | Google, Bing, Yandex |
| **Google Videos** | 8 | Video-specific metadata | Google, Bing (Baidu instável) |
| **mRSS** | 8 | Media RSS (video alternative) | Google, Bing |
| **Products** | 7 | E-commerce critical | All |
| **Localized** | 4 | Language variants (en, pt, es, etc.) | All |

**Supported Extensions:**
```xml
<!-- Google News -->
<urlset xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">

<!-- Google Images -->
<urlset xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">

<!-- Google Videos -->
<urlset xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">

<!-- hreflang (Localization) -->
<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml">

<!-- mRSS (Media RSS) -->
<rss xmlns:media="http://search.yahoo.com/mrss/">
```

### 2. **robots.txt Advanced Directives**

Detects crawler-specific directives:

```text
User-agent: *
Disallow: /admin/
Allow: /public/
Crawl-delay: 2          # Bing ✅, Yandex ✅, Google ❌
Host: www.example.com   # Yandex-exclusive ✅
Sitemap: https://example.com/sitemap.xml
```

**Compatibility Matrix:**

| Directive | Google | Bing | Yandex | Baidu | DuckDuckGo |
|-----------|--------|------|--------|-------|------------|
| `Disallow:` | ✅ | ✅ | ✅ | ⚠️ Parcial | ✅ |
| `Allow:` | ✅ | ✅ | ✅ | ⚠️ Parcial | ✅ |
| `Crawl-delay:` | ❌ Ignora | ✅ Respeita | ✅ Respeita | ❌ Ignora | ✅ Respeita |
| `Host:` | ❌ | ❌ | ✅ Exclusivo | ❌ | ❌ |
| `Noindex:` | ⚠️ Deprecated | ❌ | ❌ | ❌ | ❌ |

### 3. **Bing-Specific Sitemap Features**

Detects `<priority>` and `<changefreq>` tags that Bing uses but Google ignores:

```xml
<url>
  <loc>https://example.com/page</loc>
  <lastmod>2024-11-24</lastmod>
  <changefreq>daily</changefreq>   <!-- Bing ✅, Google ❌ -->
  <priority>0.8</priority>          <!-- Bing ✅, Google ❌ -->
</url>
```

**Scoring Impact:**
- ✅ **Bing:** +0.5 points for each present
- ⚠️ **Google:** Warning that they're ignored
- ✅ **Yandex:** +0.5 points for each present

### 4. **AMP Pages Detection**

Finds Accelerated Mobile Pages for Google News optimization:

```javascript
discovered.ampPages = [
  { url: "https://example.com/amp/article-123", source: "sitemap" },
  { url: "https://example.com/news/story.amp.html", source: "sitemap" }
]
```

**Detection Patterns:**
- `/amp/` path segment
- `.amp.html` file extension
- Automatic extraction from sitemaps

### 5. **JavaScript/SPA Detection**

Detects Single Page Applications and warns about crawler compatibility:

**Detected Frameworks:**
- React
- Next.js
- Nuxt.js
- Angular
- Vue.js

**Automatic Warnings:**
```javascript
// SPA detected → Automatic scoring
google.strengths.push("Renderiza JavaScript (SPA/React/Next.js)")
bing.warnings.push("JS rendering fraco - use prerendering/SSR")
yandex.warnings.push("Zero JS rendering - site HTML estático recomendado")
baidu.warnings.push("Renderiza JS muito mal - precisa HTML direto")
```

### 6. **Crawl Budget Analysis**

Estimates time required for each search engine to crawl your site:

```javascript
crawlBudget: {
  estimatedPageCount: 5150,
  crawlDelay: 2,  // from robots.txt
  estimatedCrawlTime: {
    google: "43min",      // 0.5s per URL (fast, no delay)
    bing: "2.6h",         // 1s + delay per URL
    yandex: "3.4h",       // 2s + delay per URL (slowest)
    baidu: "1.5h",        // 1.5s per URL (ignores delay)
    duckduckgo: "2.6h"    // same as Bing
  }
}
```

**Calculation Formula:**
- **Google:** `pages × 0.5s` (ignores crawl-delay)
- **Bing:** `pages × (1s + crawl-delay)`
- **Yandex:** `pages × (2s + crawl-delay)` (slowest crawler)
- **Baidu:** `pages × 1.5s` (ignores crawl-delay)
- **DuckDuckGo:** Same as Bing

---

## Crawler Compatibility Analysis

### Scoring System (0-10)

Each crawler receives a compatibility score based on:

- **Base score:** 5.0
- **Strengths:** +0.5 per strength (max +5)
- **Warnings:** -0.5 per warning (max -5)
- **Final range:** 0-10

### Scoring Examples

#### 🔍 **Google (Typical: 7-9)**

**Strengths (+):**
- News sitemap presente
- Image/Video sitemaps
- Renderiza JavaScript
- `<lastmod>` presente

**Warnings (-):**
- `Crawl-delay` ignorado
- `<priority>` ignorado
- `<changefreq>` ignorado

#### 🦋 **Bing (Typical: 6-8)**

**Strengths (+):**
- `Crawl-delay` respeitado
- `<priority>` usado
- `<changefreq>` usado
- Sitemap index bem estruturado

**Warnings (-):**
- JS rendering fraco
- News sitemap fraco

#### 🇷🇺 **Yandex (Typical: 5-7)**

**Strengths (+):**
- `Crawl-delay` respeitado
- `Host:` directive presente
- HTML tradicional (sem SPA)

**Warnings (-):**
- Zero JS rendering
- Fora da Rússia: crawl lento

#### 🇨🇳 **Baidu (Typical: 3-5)**

**Strengths (+):**
- HTML direto detectado
- E-commerce chinês

**Warnings (-):**
- Renderiza JS muito mal
- Sitemaps grandes quebram
- Sitemap index instável
- Video sitemaps instáveis

#### 🦆 **DuckDuckGo (Typical: 6-8)**

- **Herda do Bing** (usa resultados do Bing)
- Adiciona warning: "Usa resultados do Bing"

---

## Discovery Strategies

DeepDiscovery implements 7 core strategies:

### 1. **Sitemap Variants Discovery**

Probes 100+ sitemap locations:

**Standard:**
- `/sitemap.xml`, `/sitemap_index.xml`
- `/sitemaps/sitemap.xml`

**Numbered:**
- `/sitemap1.xml` ... `/sitemap10.xml`
- `/sitemap-1.xml` ... `/sitemap-10.xml`

**Categorized:**
- `/sitemap-products.xml`, `/sitemap-news.xml`
- `/sitemap-images.xml`, `/sitemap-videos.xml`
- `/product-sitemap.xml`, `/news-sitemap.xml`

**Google-specific:**
- `/news-sitemap.xml`, `/google-news-sitemap.xml`
- `/image-sitemap.xml`, `/images-sitemap.xml`
- `/video-sitemap.xml`, `/videositemap.xml`
- `/mrss.xml`, `/media-rss.xml`

**Compressed:**
- `/sitemap.xml.gz`, `/sitemap_index.xml.gz`

**Localized:**
- `/sitemap-en.xml`, `/sitemap-pt.xml`, `/sitemap-es.xml`
- `/en/sitemap.xml`, `/pt/sitemap.xml`

**CMS-specific:**
- `/wp-sitemap.xml` (WordPress)
- `/wp-sitemap-posts-post-1.xml`

### 2. **robots.txt Intelligence**

Extracts:
- Sitemap references
- `Crawl-delay` (Bing/Yandex)
- `Host:` directive (Yandex)
- `Noindex:` (deprecated)
- Disallowed paths (reveals API structure)
- Allowed paths

### 3. **Feed Discovery**

Finds RSS/Atom/JSON feeds:

**Generic:**
- `/feed`, `/feeds`, `/rss`, `/rss.xml`, `/atom.xml`

**News:**
- `/news/feed`, `/news/rss`, `/latest.json`
- `/breaking-news.json`

**Blog:**
- `/blog/feed`, `/blog/rss`, `/blog/atom.xml`

**WordPress:**
- `/feed/`, `/?feed=rss2`, `/?feed=atom`

**JSON Feed:**
- `/feed.json`, `/feeds/all.json`, `/api/feed.json`

### 4. **Platform Detection**

Detects e-commerce, CMS, and frameworks:

**E-commerce:**
- Shopify: `/products.json`, `/cart.json`
- Magento: `/rest/V1/products`, `/graphql`
- WooCommerce: `/wp-json/wc/v3/products`
- PrestaShop: `/api/`, `/modules/`
- BigCommerce: `/api/v2/products`

**CMS:**
- WordPress: `/wp-json/wp/v2/posts`, `/wp-admin`
- Drupal: `/jsonapi`, `/node`
- Joomla: `/api/`, `/administrator`
- Ghost: `/ghost/api/v3/content/`

**Frameworks:**
- Next.js: `/_next/data`, `/_next/static`
- Nuxt: `/_nuxt/`, `/.nuxt/`
- Angular: `/main.js`, `/polyfills.js`
- React: `/static/js/main`, `/static/js/bundle`
- Vue: `/js/app.js`, `/js/chunk-vendors`

### 5. **API Endpoint Discovery**

Probes for REST/GraphQL/WordPress APIs:

**Generic REST:**
- `/api`, `/api/v1`, `/api/v2`, `/api/v3`
- `/rest`, `/rest/v1`, `/rest/V1`

**GraphQL:**
- `/graphql`, `/gql`, `/api/graphql`

**Search/Autocomplete:**
- `/api/search`, `/search/suggest.json`
- `/autocomplete`, `/api/suggest`

**Data endpoints:**
- `/api/data`, `/api/config`, `/data.json`

**WordPress:**
- `/wp-json`, `/wp-json/wp/v2`
- `/wp-json/wp/v2/posts`, `/wp-json/wp/v2/pages`

**Shopify:**
- `/cart.json`, `/cart/add.js`
- `/recommendations/products.json`

### 6. **Static Files Discovery**

Finds configuration and manifest files:

**Configs:**
- `/config.json`, `/settings.json`, `/app.json`

**Manifests:**
- `/manifest.json`, `/package.json`, `/composer.json`

**Data:**
- `/data.json`, `/db.json`, `/menu.json`, `/routes.json`

**Well-known:**
- `/.well-known/assetlinks.json`
- `/.well-known/apple-app-site-association`
- `/.well-known/security.txt`

**Build info:**
- `/build-manifest.json`, `/asset-manifest.json`

### 7. **Subdomain Discovery**

Checks common subdomains for sitemaps:

- `www`, `blog`, `news`, `shop`, `store`
- `api`, `cdn`, `static`, `assets`, `media`

---

## Configuration

### Constructor Options

```javascript
const discoverer = new DeepDiscovery({
  // Network
  userAgent: 's3db-deep-discovery/1.0',
  timeout: 10000,                    // Request timeout (ms)
  maxConcurrent: 10,                 // Max parallel requests

  // Discovery options
  checkSubdomains: true,             // Check subdomain sitemaps
  detectFrameworks: true,            // Detect JS frameworks
  detectEcommerce: true,             // Detect e-commerce platforms
  detectCMS: true,                   // Detect CMS platforms

  // Custom fetcher (for testing)
  fetcher: async (url) => { /* ... */ }
})
```

### Discovery Options

```javascript
await discoverer.discover('https://example.com', {
  // Core strategies
  analyzeRobots: true,        // robots.txt analysis
  includeSitemaps: true,      // Sitemap discovery
  includeFeeds: true,         // RSS/Atom/JSON feeds
  includeAPIs: true,          // API endpoint detection
  includeStatic: true,        // Static files
  detectPlatform: true,       // Platform/framework detection
  includeSubdomains: true     // Subdomain sitemaps
})
```

---

## API Reference

### Methods

#### `discover(baseUrl, options)`

Main discovery method. Returns complete report.

**Parameters:**
- `baseUrl` (string): Target URL (e.g., `'https://example.com'`)
- `options` (object): Discovery options (see above)

**Returns:** Promise<DiscoveryReport>

```javascript
const report = await discoverer.discover('https://example.com', {
  analyzeRobots: true,
  includeSitemaps: true
})
```

#### `getStats()`

Returns discovery statistics.

**Returns:** Object with `{ urlsProbed, urlsFound, errors }`

```javascript
const stats = discoverer.getStats()
console.log(`Probed: ${stats.urlsProbed}, Found: ${stats.urlsFound}`)
```

---

## Output Structure

### Complete Report Schema

```javascript
{
  // Metadata
  domain: "https://example.com",
  timestamp: "2024-11-24T17:00:00.000Z",

  // Discovery statistics
  stats: {
    urlsProbed: 150,
    urlsFound: 23,
    errors: 2
  },

  // Discovered resources
  discovered: {
    // Sitemaps (sorted by priority)
    sitemaps: [
      {
        url: "https://example.com/sitemap_index.xml",
        type: "sitemap-index",        // Type classification
        contentType: "application/xml",
        source: "probe",              // "probe" | "robots.txt"
        priority: 10,                 // 0-10
        hasPriority: false,           // <priority> tag present?
        hasChangefreq: false,         // <changefreq> tag present?
        hasLastmod: true,             // <lastmod> tag present?
        urlCount: 5000                // Number of URLs
      }
    ],

    // Feeds
    feeds: [
      {
        url: "https://example.com/feed",
        type: "rss",                  // "rss" | "atom" | "json" | "mrss"
        contentType: "application/rss+xml",
        source: "probe"
      }
    ],

    // APIs
    apis: [
      {
        url: "https://example.com/graphql",
        type: "graphql",              // "graphql" | "rest" | "wordpress-rest"
        contentType: "application/json",
        source: "probe"
      }
    ],

    // Static files
    staticFiles: [
      {
        url: "https://example.com/manifest.json",
        contentType: "application/json",
        source: "probe"
      }
    ],

    // Platforms (sorted by confidence)
    platforms: [
      {
        type: "ecommerce",            // "ecommerce" | "cms" | "framework"
        platform: "shopify",
        confidence: 0.67,             // 0.0-1.0
        paths: [
          "https://example.com/products.json",
          "https://example.com/cart.json"
        ]
      }
    ],

    // Subdomains
    subdomains: [
      {
        subdomain: "blog.example.com",
        url: "https://blog.example.com/sitemap.xml",
        source: "subdomain-probe"
      }
    ],

    // Exposed paths from robots.txt
    exposedPaths: [
      {
        path: "/api/v1/",
        type: "api",                  // "api" | "path"
        source: "robots.txt"
      }
    ],

    // AMP pages
    ampPages: [
      {
        url: "https://example.com/amp/article-123",
        source: "sitemap"
      }
    ],

    // robots.txt directives
    robotsDirectives: {
      crawlDelay: 2,                 // seconds (Bing/Yandex)
      yandexHost: "www.example.com", // Yandex-specific
      noindex: false                 // deprecated
    }
  },

  // Crawler compatibility scores
  crawlerCompatibility: {
    google: {
      score: 8.5,                    // 0-10
      strengths: [
        "News sitemap presente (excelente)",
        "Renderiza JavaScript (SPA/React/Next.js)",
        "<lastmod> presente e confiável"
      ],
      warnings: [
        "Crawl-delay ignorado pelo Google",
        "<priority> ignorado pelo Google"
      ]
    },
    bing: { score: 7.0, strengths: [...], warnings: [...] },
    yandex: { score: 6.5, strengths: [...], warnings: [...] },
    baidu: { score: 4.0, strengths: [], warnings: [...] },
    duckduckgo: { score: 7.0, strengths: [...], warnings: [...] }
  },

  // Crawl budget estimation
  crawlBudget: {
    estimatedPageCount: 5150,
    crawlDelay: 2,
    estimatedCrawlTime: {
      google: "43min",
      bing: "2.6h",
      yandex: "3.4h",
      baidu: "2.1h",
      duckduckgo: "2.6h"
    }
  },

  // Summary metrics
  summary: {
    sitemapCount: 15,
    feedCount: 3,
    apiCount: 5,
    staticFileCount: 4,
    platformCount: 2,
    subdomainCount: 3,
    exposedPathCount: 12,
    ampPageCount: 12,
    totalFound: 23,
    totalProbed: 150,
    successRate: "15.33%"
  }
}
```

---

## Best Practices

### 1. **Optimize for All Crawlers**

Don't just optimize for Google:

```javascript
// ✅ GOOD: Include Bing-specific features
<url>
  <loc>...</loc>
  <lastmod>2024-11-24</lastmod>
  <changefreq>daily</changefreq>  <!-- Bing uses this -->
  <priority>0.8</priority>         <!-- Bing uses this -->
</url>

// ✅ GOOD: Add Yandex Host directive
Host: www.example.com

// ✅ GOOD: Respect Crawl-delay for Bing/Yandex
Crawl-delay: 2
```

### 2. **Use Appropriate Sitemap Types**

Match sitemap type to content:

```javascript
// News sites
/news-sitemap.xml        // Google News (2-day window)
/feed                    // RSS for discovery

// E-commerce
/sitemap-products.xml    // Product-specific
/sitemap-images.xml      // Product images
/sitemap-categories.xml  // Navigation structure

// Media sites
/video-sitemap.xml       // Video metadata
/mrss.xml                // Media RSS alternative
```

### 3. **Handle JavaScript Properly**

If you use SPA/React/Next.js:

```javascript
// ✅ BEST: Use SSR (Server-Side Rendering)
// Next.js with getServerSideProps/getStaticProps

// ✅ GOOD: Use Prerendering
// Generate static HTML for crawlers

// ⚠️ ACCEPTABLE: Provide HTML fallbacks
// Ensure critical content is in initial HTML

// ❌ BAD: Client-only rendering
// Baidu/Yandex will fail completely
```

### 4. **Monitor Compatibility Scores**

Set score thresholds:

```javascript
const report = await discoverer.discover(url)

// Alert if scores drop
if (report.crawlerCompatibility.google.score < 7.0) {
  alert('Google compatibility degraded!')
}

if (report.crawlerCompatibility.bing.score < 6.0) {
  alert('Bing compatibility issues!')
}
```

### 5. **Crawl Budget Optimization**

Reduce crawl time:

```javascript
// Use sitemap indexes to split large sitemaps
/sitemap_index.xml
  ├─ /sitemap-products-1.xml   (50k URLs)
  ├─ /sitemap-products-2.xml   (50k URLs)
  └─ /sitemap-news.xml          (1k URLs)

// Set appropriate crawl-delay
Crawl-delay: 1  # Don't overload, but don't slow down unnecessarily
```

### 6. **Regular Audits**

Run discovery periodically:

```javascript
// Weekly audit
const report = await discoverer.discover(url)

// Track changes over time
const scoreHistory = {
  '2024-11-01': { google: 8.5, bing: 7.0 },
  '2024-11-08': { google: 8.3, bing: 7.2 },
  '2024-11-15': { google: 8.7, bing: 7.5 }
}
```

---

## FAQ

### **Q: Why are my Bing scores lower than Google?**

**A:** Bing relies more on traditional signals:
- Add `<priority>` and `<changefreq>` to sitemaps
- Set `Crawl-delay` in robots.txt
- Bing has weaker JavaScript rendering
- Consider server-side rendering or prerendering

### **Q: How do I optimize for Yandex?**

**A:** Yandex-specific optimizations:
```text
# robots.txt
Host: www.example.com    # Preferred domain
Crawl-delay: 2           # Yandex respects this

# Avoid JavaScript
- Use traditional HTML (no SPA)
- Server-side rendering if needed
- Yandex has ZERO JavaScript rendering
```

### **Q: Should I care about Baidu if I'm not in China?**

**A:** Probably not, unless:
- You target Chinese users
- You have Chinese e-commerce presence
- You're multilingual with Chinese content

**Note:** Baidu is notoriously bad with modern websites.

### **Q: What's the difference between `<priority>` and sitemap priority?**

**A:**
- **`<priority>` tag** (in sitemap XML): Bing uses, Google ignores
- **Sitemap priority** (in DeepDiscovery): Internal scoring (0-10) for discovery order

### **Q: Why does DuckDuckGo have the same score as Bing?**

**A:** DuckDuckGo uses Bing's search results. They don't have their own crawler, so compatibility is identical (plus a note that it uses Bing).

### **Q: How accurate is the crawl budget estimation?**

**A:** It's an **estimate** based on:
- Known crawler speeds from documentation
- Your crawl-delay settings
- Number of URLs in sitemaps

Real crawl time varies based on:
- Server response time
- Network latency
- Crawler load balancing
- Geographic distribution

### **Q: What does "News sitemap fraco no Bing" mean?**

**A:** Bing has weak support for Google News sitemaps compared to Google. If you're a news site targeting Bing:
- Use RSS feeds (Bing prefers these)
- Include standard sitemaps with `<lastmod>`
- Don't rely solely on news sitemaps

### **Q: Can I test without making real HTTP requests?**

**A:** Yes, use a custom fetcher:

```javascript
const mockFetcher = async (url) => {
  if (url.includes('robots.txt')) {
    return 'User-agent: *\nCrawl-delay: 2\nSitemap: ...'
  }
  throw new Error('Not found')
}

const discoverer = new DeepDiscovery({ fetcher: mockFetcher })
```

### **Q: What's the performance impact?**

**A:** DeepDiscovery probes 100+ URLs:
- **Default:** 10 concurrent requests
- **Time:** 30-60 seconds (depending on response times)
- **Bandwidth:** Minimal (mostly HEAD requests)

Adjust `maxConcurrent` for faster/slower discovery.

### **Q: How do I interpret warnings?**

**A:** Warnings are actionable insights:

```javascript
// Warning: "JS rendering fraco - use prerendering/SSR"
// Action: Implement server-side rendering or prerendering

// Warning: "<priority> ignorado pelo Google"
// Action: That's fine, it helps Bing. No action needed.

// Warning: "Sitemap grande (5000 URLs) - Baidu pode quebrar"
// Action: Split into smaller sitemaps using sitemap index
```

### **Q: Does it detect canonical URLs?**

**A:** Not currently. DeepDiscovery focuses on:
- Sitemap discovery
- robots.txt analysis
- Platform detection
- Crawler compatibility

For canonical URL analysis, use SEO-specific tools.

### **Q: Can I use this in CI/CD?**

**A:** Yes! Monitor crawler compatibility in automated tests:

```javascript
// In your CI pipeline
const report = await discoverer.discover(stagingUrl)

// Fail build if compatibility drops
if (report.crawlerCompatibility.google.score < 7.0) {
  throw new Error('Google compatibility regression!')
}
```

---

## Related Documentation

- **[Spider Plugin](/plugins/spider/README.md)** - Main plugin documentation
- **[Link Discoverer](/plugins/spider/spider-full.md#link-discovery)** - HTML link extraction
- **[Robots Parser](/plugins/spider/spider-full.md#robotstxt-parser)** - RFC 9309 compliance
- **[Sitemap Parser](/plugins/spider/spider-full.md#sitemap-parser)** - Multi-format support
- **[Example: e105-deep-discovery.js](/examples/e105-deep-discovery.js)** - Complete usage examples

---

**Last Updated:** 2024-11-24
**Version:** 18.0.9+
**License:** MIT

