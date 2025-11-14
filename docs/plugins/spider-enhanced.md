# 🕷️ SpiderPlugin - Enhanced Web Crawler

> **All-in-one web crawler suite with SEO analysis and technology fingerprinting.**
>
> Bundles Puppeteer (browser automation), S3Queue (distributed task queue), and TTL (automatic cleanup) with advanced capabilities for extracting SEO metadata, analyzing assets, and detecting technologies used on web pages.
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [API ↓](#-api-reference) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

**One-line crawling with SEO & tech analysis:**
```javascript
await db.usePlugin(new SpiderPlugin({
  namespace: 'crawler',
  seo: { enabled: true },           // Enable SEO analysis
  techDetection: { enabled: true }  // Enable tech fingerprinting
}));
```

**Production setup with all features:**
```javascript
await db.usePlugin(new SpiderPlugin({
  namespace: 'crawler',
  queue: { autoStart: true, concurrency: 5 },
  puppeteer: { pool: { enabled: true, size: 3 } },
  seo: {
    enabled: true,
    extractMetaTags: true,
    extractOpenGraph: true,
    extractAssets: true,
    assetMetadata: true
  },
  techDetection: {
    enabled: true,
    detectFrameworks: true,
    detectAnalytics: true,
    detectMarketing: true
  },
  performance: { enabled: true }
}));

// Crawl targets
await spider.enqueueTarget({ url: 'https://example.com' });

// Get results with SEO analysis
const results = await spider.getResults();
const seo = await spider.getSEOAnalysis();
const tech = await spider.getTechFingerprints();
```

**Key features:**
- ✅ **SEO Extraction** - Meta tags, OpenGraph, Twitter Cards, canonical links
- ✅ **Asset Analysis** - CSS, JS, images, videos, audios with metadata
- ✅ **Tech Fingerprinting** - Frameworks (React, Vue, Angular), analytics, CDN, CMS
- ✅ **Performance Metrics** - Core Web Vitals, navigation timing, memory usage
- ✅ **Distributed Queue** - Horizontal scaling across workers
- ✅ **Browser Pool** - Efficient resource management with Chromium pool
- ✅ **Auto Cleanup** - TTL-based expiration of stale tasks
- ✅ **Multi-modal** - Relay mode (external SMTP) or Server mode (in-process listener)

**Performance comparison:**
```javascript
// ❌ Without SpiderPlugin: Manual setup
await db.usePlugin(new PuppeteerPlugin({ namespace: 'pup' }));
await db.usePlugin(new S3QueuePlugin({ namespace: 'queue' }));
const page = await puppeteer.open(url);
const html = await page.content();
// Extract SEO manually...
// Detect tech manually...
// ~100 lines of boilerplate

// ✅ With SpiderPlugin: Unified API
await db.usePlugin(new SpiderPlugin({ namespace: 'crawler', seo: { enabled: true } }));
const seo = (await spider.getSEOAnalysis())[0]; // Pre-extracted!
const tech = (await spider.getTechFingerprints())[0];
// Everything automated!
```

---

## 📦 Dependencies

**Required:**
```bash
pnpm install puppeteer
```

**Bundled Plugins:**
- **PuppeteerPlugin** - Browser automation with pool management
- **S3QueuePlugin** - Distributed task queue
- **TTLPlugin** (optional) - Auto-cleanup of stale tasks

**What You Get:**

SpiderPlugin is a **meta-plugin** that bundles three powerful plugins:

1. **PuppeteerPlugin** - Headless browser automation
   - Chromium pool with tab recycling
   - Anti-bot detection (stealth mode)
   - Human behavior simulation
   - Cookie management

2. **S3QueuePlugin** - Distributed task queue
   - Scalable task processing
   - Retry logic with exponential backoff
   - Priority-based execution
   - Multi-worker support

3. **TTLPlugin** (optional) - Automatic cleanup
   - Partition-based expiration
   - O(1) cleanup performance
   - Configurable TTL per task

---

## ⚡ Quickstart

```javascript
import { Database } from 's3db.js';
import { SpiderPlugin } from 's3db.js';

const db = new Database({
  connectionString: 's3://key:secret@bucket/path'
});

await db.connect();

// Create spider with SEO & tech analysis
const spider = new SpiderPlugin({
  namespace: 'crawler',
  queue: { autoStart: true, concurrency: 3 },
  seo: { enabled: true },
  techDetection: { enabled: true },
  performance: { enabled: true }
});

await db.usePlugin(spider);

// Enqueue URLs to crawl
await spider.enqueueTarget({
  url: 'https://example.com',
  priority: 10,
  metadata: { category: 'homepage' }
});

await spider.enqueueTarget({
  url: 'https://example.com/about',
  priority: 5
});

// Monitor progress
const stats = await spider.getQueueStatus();
console.log(`Queue: pending=${stats.pending}, completed=${stats.completed}`);

// Get results
const results = await spider.getResults();
console.log(results);
// [
//   {
//     targetId: 'abc123',
//     url: 'https://example.com',
//     statusCode: 200,
//     title: 'Example Domain',
//     seoAnalysis: { metaTags: {...}, openGraph: {...}, assets: {...} },
//     techFingerprint: { frameworks: ['react'], analytics: ['google-analytics'] },
//     performanceMetrics: { ... },
//     processingTime: 2500
//   },
//   ...
// ]

// Get SEO data only
const seoAnalysis = await spider.getSEOAnalysis({ url: 'https://example.com' });
console.log(seoAnalysis[0].metaTags);
// { title: 'Example Domain', description: '...', keywords: '...' }

// Get technology fingerprints
const fingerprints = await spider.getTechFingerprints();
console.log(fingerprints[0]);
// {
//   frameworks: ['react', 'nextjs'],
//   analytics: ['google-analytics', 'mixpanel'],
//   marketing: ['facebook-pixel'],
//   cdn: ['cloudflare'],
//   webServers: ['nginx'],
//   cms: []
// }

await db.disconnect();
```

---

## Usage Journey

### Level 1: Basic SEO Extraction

Extract meta tags from pages:

```javascript
const spider = new SpiderPlugin({
  namespace: 'seo-crawler',
  seo: {
    enabled: true,
    extractMetaTags: true,
    extractOpenGraph: true
  }
});

await db.usePlugin(spider);

await spider.enqueueTarget({ url: 'https://example.com' });
const seo = await spider.getSEOAnalysis();

console.log(seo[0].metaTags);
// {
//   title: 'Example',
//   description: 'Example description',
//   keywords: 'example,keywords',
//   author: 'Author Name',
//   viewport: 'width=device-width, initial-scale=1'
// }

console.log(seo[0].openGraph);
// {
//   title: 'Example Page',
//   description: 'Page description',
//   image: 'https://example.com/og-image.jpg',
//   url: 'https://example.com',
//   type: 'website'
// }
```

### Level 2: Asset Inventory

Catalog all assets (CSS, JS, images):

```javascript
const spider = new SpiderPlugin({
  namespace: 'asset-analyzer',
  seo: {
    enabled: true,
    extractAssets: true,
    assetMetadata: true
  }
});

await db.usePlugin(spider);
await spider.enqueueTarget({ url: 'https://example.com' });

const seo = await spider.getSEOAnalysis();
const assets = seo[0].assets;

console.log(assets.summary);
// {
//   totalStylesheets: 5,
//   totalScripts: 12,
//   totalImages: 48,
//   totalVideos: 2,
//   totalAudios: 1,
//   scriptTypes: { 'text/javascript': 12 },
//   imageFormats: { 'jpg': 30, 'png': 15, 'webp': 3 }
// }

console.log(assets.stylesheets);
// [
//   { href: '/css/main.css', media: 'all', type: 'text/css' },
//   { href: '/css/mobile.css', media: '(max-width: 768px)' }
// ]

console.log(assets.images.slice(0, 2));
// [
//   { src: '/images/hero.jpg', alt: 'Hero', width: '1200', height: '600' },
//   { src: '/images/logo.png', alt: 'Logo' }
// ]
```

### Level 3: Technology Fingerprinting

Detect frameworks and tools used:

```javascript
const spider = new SpiderPlugin({
  namespace: 'tech-detector',
  techDetection: {
    enabled: true,
    detectFrameworks: true,
    detectAnalytics: true,
    detectMarketing: true,
    detectCDN: true
  }
});

await db.usePlugin(spider);
await spider.enqueueTarget({ url: 'https://example.com' });

const fingerprints = await spider.getTechFingerprints();
const tech = fingerprints[0];

console.log(tech.frameworks);
// ['react', 'nextjs', 'webpack']

console.log(tech.analytics);
// ['google-analytics', 'amplitude', 'mixpanel']

console.log(tech.marketing);
// ['facebook-pixel', 'linkedin-insight', 'google-ads']

console.log(tech.cdn);
// ['cloudflare']
```

### Level 4: Complete Web Analysis

Combine all features for comprehensive site analysis:

```javascript
const spider = new SpiderPlugin({
  namespace: 'full-analyzer',
  queue: { concurrency: 5, autoStart: true },
  seo: { enabled: true },
  techDetection: { enabled: true },
  performance: { enabled: true }
});

await db.usePlugin(spider);

// Batch enqueue
await spider.enqueueBatch([
  { url: 'https://example.com' },
  { url: 'https://example.com/about' },
  { url: 'https://example.com/blog' }
]);

// Wait for completion
await spider.queuePlugin.drain();

// Comprehensive results
const results = await spider.getResults();
const seoData = await spider.getSEOAnalysis();
const techData = await spider.getTechFingerprints();

// Analyze
for (const result of results) {
  console.log(`${result.url}:`);
  console.log(`  - Status: ${result.statusCode}`);
  console.log(`  - Frameworks: ${result.techFingerprint.frameworks.join(', ')}`);
  console.log(`  - Processing time: ${result.processingTime}ms`);

  const seo = seoData.find(s => s.url === result.url);
  if (seo) {
    console.log(`  - Assets: ${seo.assets.summary.totalImages} images, ${seo.assets.summary.totalScripts} scripts`);
  }
}
```

### Level 5: Production Distributed Crawling

Multi-worker deployment:

```javascript
// Worker 1: Enqueue URLs
const spider1 = new SpiderPlugin({
  namespace: 'prod-crawler',
  queue: { autoStart: false }, // Manual control
  puppeteer: { pool: { enabled: true, size: 3 } },
  seo: { enabled: true },
  techDetection: { enabled: true }
});

await db.usePlugin(spider1);

// Load URLs from database
const urls = await urlDatabase.query({ status: 'pending' });
for (const url of urls) {
  await spider1.enqueueTarget({ url: url.href, metadata: url });
}

// Worker 2-N: Process tasks
const spider2 = new SpiderPlugin({
  namespace: 'prod-crawler',
  queue: { autoStart: true, concurrency: 5 },
  puppeteer: { pool: { enabled: true, size: 3 } },
  seo: { enabled: true },
  techDetection: { enabled: true }
});

await db.usePlugin(spider2);

// Automatic processing across workers
// Queue is shared via S3DB resources
```

---

## 📊 Configuration Reference

```javascript
new SpiderPlugin({
  // Namespace for all resources
  namespace: 'spider',

  // Resource naming prefix
  resourcePrefix: 'plg_spider',

  // Puppeteer configuration
  puppeteer: {
    pool: {
      enabled: true,           // Enable browser pool
      maxBrowsers: 3,         // Max Chromium instances
      maxTabsPerBrowser: 10,  // Tabs per browser
      reuseTab: false,        // Recycle tabs
      closeOnIdle: true,      // Close browsers when idle
      idleTimeout: 300000     // 5 minutes
    },
    launch: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage'
      ]
    },
    viewport: {
      width: 1920,
      height: 1080,
      randomize: true
    },
    stealth: {
      enabled: true
    }
  },

  // Queue configuration
  queue: {
    autoStart: true,         // Auto-start processing
    concurrency: 5,          // Concurrent workers
    maxRetries: 3,          // Max retry attempts
    retryDelay: 1000        // Base retry delay (ms)
  },

  // TTL configuration (optional cleanup)
  ttl: {
    enabled: true,
    queue: {
      ttl: 86400000          // 24 hours
    }
  },

  // SEO analysis configuration
  seo: {
    enabled: true,
    extractMetaTags: true,      // title, description, keywords, etc.
    extractOpenGraph: true,     // og:* tags
    extractTwitterCard: true,   // twitter:* tags
    extractAssets: true,        // CSS, JS, images, videos, audios
    assetMetadata: true         // Count and summarize assets
  },

  // Technology detection configuration
  techDetection: {
    enabled: true,
    detectFrameworks: true,     // React, Vue, Angular, etc.
    detectAnalytics: true,      // GA, Amplitude, Mixpanel, etc.
    detectMarketing: true,      // Facebook, LinkedIn, Google Ads
    detectCDN: true,           // Cloudflare, CloudFront, etc.
    detectWebServer: true,     // Nginx, Apache, IIS, etc.
    detectCMS: true            // WordPress, Shopify, etc.
  },

  // Security analysis configuration
  security: {
    enabled: true,
    analyzeSecurityHeaders: true,      // HTTP security headers
    analyzeCSP: true,                  // Content Security Policy
    analyzeCORS: true,                 // CORS configuration
    captureConsoleLogs: true,          // Browser console logs
    consoleLogLevels: ['error', 'warn'],  // Log levels to capture
    maxConsoleLogLines: 100,           // Max console logs to store
    analyzeTLS: true,                  // TLS/HTTPS verification
    checkVulnerabilities: true,        // Security vulnerability detection
    captureWebSockets: true,           // WebSocket detection
    maxWebSocketMessages: 50           // Max WebSocket messages to capture
  },

  // Performance metrics configuration
  performance: {
    enabled: true,
    collectCoreWebVitals: true,     // LCP, FID, CLS
    collectNavigationTiming: true,  // Page load timing
    collectResourceTiming: true,    // Individual resource timing
    collectMemory: true             // Memory usage
  }
})
```

---

## 📚 Configuration Examples

### Example 1: SEO-Only Analysis

Focus on meta tags and assets:

```javascript
new SpiderPlugin({
  namespace: 'seo',
  seo: {
    enabled: true,
    extractMetaTags: true,
    extractOpenGraph: true,
    extractAssets: true,
    assetMetadata: true
  },
  techDetection: { enabled: false },
  performance: { enabled: false }
})
```

### Example 2: Technology Stack Detection

Analyze what tech is used:

```javascript
new SpiderPlugin({
  namespace: 'tech',
  seo: { enabled: false },
  techDetection: {
    enabled: true,
    detectFrameworks: true,
    detectAnalytics: true,
    detectMarketing: true,
    detectCDN: true
  },
  queue: { concurrency: 10 } // Higher concurrency for detection-only
})
```

### Example 3: Performance Analysis

Collect Web Vitals and timing data:

```javascript
new SpiderPlugin({
  namespace: 'perf',
  seo: { enabled: false },
  techDetection: { enabled: false },
  performance: {
    enabled: true,
    collectCoreWebVitals: true,
    collectNavigationTiming: true,
    collectResourceTiming: true,
    collectMemory: true
  }
})
```

### Example 4: Complete Analysis

Gather everything:

```javascript
new SpiderPlugin({
  namespace: 'full',
  queue: { concurrency: 5, autoStart: true },
  puppeteer: {
    pool: { enabled: true, size: 5 },
    stealth: { enabled: true }
  },
  seo: { enabled: true },
  techDetection: { enabled: true },
  performance: { enabled: true },
  ttl: { enabled: true }
})
```

### Example 5: High-Performance Crawling

Distributed setup with multiple workers:

```javascript
new SpiderPlugin({
  namespace: 'distributed',
  queue: {
    autoStart: true,
    concurrency: 20         // High concurrency
  },
  puppeteer: {
    pool: {
      enabled: true,
      maxBrowsers: 10,      // More browsers
      maxTabsPerBrowser: 5  // Fewer tabs per browser
    }
  },
  seo: { enabled: true },
  techDetection: { enabled: true }
})
```

---

## 🔧 API Reference

### Configuration Methods

#### `enqueueTarget(target)`

Enqueue a single crawl target.

```javascript
/**
 * @param {Object} target - Target configuration
 * @param {string} target.url - URL to crawl (required)
 * @param {number} [target.priority=0] - Task priority (higher = first)
 * @param {Object} [target.metadata] - Custom metadata
 * @returns {Promise<Object>} Queued task
 */

await spider.enqueueTarget({
  url: 'https://example.com',
  priority: 10,
  metadata: { source: 'sitemap', category: 'homepage' }
})
```

#### `enqueueBatch(targets)`

Enqueue multiple targets at once.

```javascript
/**
 * @param {Array<Object>} targets - Array of target configurations
 * @returns {Promise<Array>} Array of queued tasks
 */

await spider.enqueueBatch([
  { url: 'https://example.com/page1' },
  { url: 'https://example.com/page2', priority: 5 },
  { url: 'https://example.com/page3', metadata: { category: 'blog' } }
])
```

### Query Methods

#### `getResults(query)`

Get crawl results.

```javascript
/**
 * @param {Object} [query] - Query parameters
 * @returns {Promise<Array>} Array of results with SEO and tech data
 */

const results = await spider.getResults();
const homepageResults = await spider.getResults({ url: 'https://example.com' });

// Results include:
// {
//   targetId: string,
//   url: string,
//   statusCode: number,
//   title: string,
//   seoAnalysis: Object,
//   techFingerprint: Object,
//   performanceMetrics: Object,
//   processingTime: number
// }
```

#### `getSEOAnalysis(query)`

Get SEO analysis data.

```javascript
/**
 * @param {Object} [query] - Query parameters
 * @returns {Promise<Array>} Array of SEO analysis records
 */

const seoData = await spider.getSEOAnalysis();

// Records include:
// {
//   targetId: string,
//   url: string,
//   metaTags: { title, description, keywords, ... },
//   openGraph: { title, image, description, ... },
//   twitterCard: { card, title, image, ... },
//   assets: {
//     stylesheets: Array,
//     scripts: Array,
//     images: Array,
//     videos: Array,
//     audios: Array,
//     summary: { totalImages, totalScripts, ... }
//   }
// }
```

#### `getTechFingerprints(query)`

Get technology fingerprints.

```javascript
/**
 * @param {Object} [query] - Query parameters
 * @returns {Promise<Array>} Array of tech fingerprint records
 */

const fingerprints = await spider.getTechFingerprints();

// Records include:
// {
//   targetId: string,
//   url: string,
//   frameworks: Array,          // [react, nextjs, ...]
//   analytics: Array,           // [google-analytics, ...]
//   marketing: Array,           // [facebook-pixel, ...]
//   cdn: Array,                // [cloudflare, ...]
//   webServers: Array,         // [nginx, ...]
//   cms: Array,                // [wordpress, ...]
//   libraries: Array           // [jquery, bootstrap, ...]
// }
```

### Queue Management

#### `getQueueStatus()`

Get queue statistics.

```javascript
/**
 * @returns {Promise<Object>} Queue status
 */

const status = await spider.getQueueStatus();
// {
//   pending: 50,
//   completed: 150,
//   failed: 5,
//   activeWorkers: 3,
//   totalProcessed: 155
// }
```

#### `startProcessing()`

Start queue processing (if autoStart is false).

```javascript
await spider.startProcessing();
```

#### `stopProcessing()`

Stop queue processing gracefully.

```javascript
await spider.stopProcessing();
```

#### `clear()`

Clear all crawl data and results.

```javascript
await spider.clear();
```

### Lifecycle

#### `initialize()`

Initialize the plugin (called automatically by db.usePlugin).

```javascript
await spider.initialize(database);
```

#### `destroy()`

Cleanup resources and close browsers.

```javascript
await spider.destroy();
```

---

## 📄 Content Analysis & Structure

SpiderPlugin includes **intelligent content detection** that automatically distinguishes actual article content from navigation, sidebars, and boilerplate. This is critical for SEO analysis and content quality metrics.

### How Content Detection Works

The content analyzer uses a **priority-based selector strategy** to find main content containers. It progressively moves through increasingly specific and fuzzy selectors until it finds a match:

#### Container Detection Priority List

The plugin searches for content containers in this exact order:

```javascript
// 1. SEMANTIC HTML (BEST) - ⭐⭐⭐
<main>                              // Pure semantic
<article>                           // Article semantic
<div role="main">                   // ARIA landmark

// 2. MICRODATA - ⭐⭐
[itemtype*="Article"]               // Schema.org Article markup

// 3. WORDPRESS PATTERNS - ⭐⭐
<div class="post-content">          // WordPress standard
<div class="entry-content">         // WordPress alternative
<div class="the-content">           // WordPress function output
<article class="post">              // Common blog pattern

// 4. COMMON PATTERNS - ⭐
<div class="article-content">
<div class="article">
<div class="content">
<div class="main-content">
<div class="container">             // Bootstrap pattern

// 5. FUZZY MATCHING - ⭐
div[class*="content"]               // Any class containing "content"
div[class*="article"]               // Any class containing "article"
div[class*="main"]                  // Any class containing "main"
```

**Why Priority Matters**: Semantic HTML is reliable across different sites, while class names vary. Starting with semantic ensures consistent, high-quality detection.

### Content Metrics Structure

When SEO analysis is enabled, each page includes detailed `contentMetrics`:

```javascript
{
  // Basic counts
  totalWordCount: 5432,              // All words in body (nav, sidebar, footer, etc.)
  mainContentWordCount: 3200,        // Only words from detected content container
  characterCount: 24500,             // Total characters in main content

  // Quality assessment
  quality: "comprehensive",          // "short" (<300), "medium" (300-1000), "comprehensive" (1000+)
  contentRatio: 0.589,              // mainContent / total (0-1 scale)

  // Detection details
  detectedContentContainers: [
    {
      selector: "main",
      wordCount: 3200,
      matchType: "semantic"          // semantic | aria | microdata | non-semantic
    },
    {
      selector: "div.post-content",
      wordCount: 3200,
      matchType: "non-semantic"
    }
  ],

  // Actionable suggestions
  suggestions: [
    "Excellent content ratio - main content dominates the page",
    "Content length is good - consider expanding for better ranking potential"
  ]
}
```

### Content Ratio Assessment

The **contentRatio** metric (main content / total content) is a key indicator of page quality from an SEO perspective:

| Ratio | Quality | Interpretation | SEO Impact |
|-------|---------|-----------------|-----------|
| < 30% | 🔴 POOR | Too much navigation, sidebars, boilerplate | Low; page bloated with noise |
| 30-50% | 🟡 MODERATE | Some optimization possible | Medium; acceptable but improvable |
| 50-70% | 🟢 GOOD | Good balance | Good; content-focused |
| 70%+ | 🟢 EXCELLENT | Main content dominates | Excellent; user-focused page |

**Example**: A page with 5000 total words but only 1500 main content words has a ratio of 0.3 (30%) - indicating excessive navigation and footer content that dilutes the page's focus.

### Content Length Recommendations

Based on `mainContentWordCount`, the plugin provides specific suggestions:

```javascript
// Content too short - critical for SEO
< 300 words →
  "Content is too short - aim for 300+ words for basic SEO coverage"
  Status: 🔴 CRITICAL

// Acceptable medium-length content
300-1000 words →
  "Content length is good (medium) - consider expanding to 1000+ words
   for better ranking potential"
  Status: 🟡 GOOD

// Optimal comprehensive content
1000+ words →
  (No warning - optimal for most topics)
  Status: 🟢 EXCELLENT
```

### Fallback Estimation Method

If no content container is found via selectors, the plugin estimates main content by summing words from semantic content elements:

```javascript
// Fallback counts words in these elements
1. <p> tags              (paragraphs)
2. <h1-h6> tags         (headers)
3. <li> tags            (list items)
4. <blockquote> tags    (quotes)
5. <table> tags         (tables)

// Minimum: 30% of total word count
// This ensures pages without explicit containers still get analyzed
```

### Structure Recommendations

The analyzer provides recommendations based on container detection:

```javascript
// If NO containers detected
"Use semantic HTML: wrap content in <main>, <article>,
 or <div role=\"main\">"

// If non-semantic container found
"Consider replacing 'div.post-content' with semantic <main>
 or <article> tag for better SEO and accessibility"

// Best practices always included
✅ Use <main> for primary content
✅ Use <article> for blog posts/articles
✅ Use <div role="main"> as ARIA fallback
✅ Avoid generic <div class="container">
```

### Integration with SEO Analysis

Content metrics are included in the complete `onPageSEO` analysis:

```javascript
const results = await spider.getResults();
const seo = await spider.getSEOAnalysis();

// Structure:
{
  url: "https://example.com/article",
  metaTags: { /* ... */ },
  openGraph: { /* ... */ },
  onPageSEO: {
    title: { /* ... */ },
    h1: { /* ... */ },
    headingStructure: { /* ... */ },
    paragraphs: { /* ... */ },
    contentMetrics: {
      totalWordCount: 5432,
      mainContentWordCount: 3200,
      contentRatio: 0.589,
      characterCount: 24500,
      quality: "comprehensive",
      detectedContentContainers: [ /* ... */ ],
      suggestions: [ /* ... */ ]
    },
    recommendations: [
      "Content is short - aim for 500+ words",
      "Main content dominates (59%) - good focus"
    ]
  },
  accessibility: { /* ... */ },
  internalLinks: { /* ... */ },
  keywordOptimization: { /* ... */ }
}
```

### Example: Content Analysis Output

```javascript
// Analyzing a typical blog post
const page = {
  totalWordCount: 2850,
  mainContentWordCount: 2100,    // 73.7% ratio
  characterCount: 15400,
  quality: "comprehensive",
  contentRatio: 0.737,

  detectedContentContainers: [
    {
      selector: "article",
      wordCount: 2100,
      matchType: "semantic"
    }
  ],

  suggestions: [
    "Excellent content ratio - main content dominates the page",
    "Great content length for a blog post - well-optimized for SEO"
  ]
}

// Analyzing a poorly structured page
const page2 = {
  totalWordCount: 8000,
  mainContentWordCount: 1200,    // 15% ratio
  characterCount: 7500,
  quality: "medium",
  contentRatio: 0.15,

  detectedContentContainers: [
    {
      selector: "div[class*='content']",
      wordCount: 1200,
      matchType: "non-semantic"    // Fuzzy match
    }
  ],

  suggestions: [
    "Low content ratio (15%) - reduce navigation/sidebar/boilerplate",
    "Content length is medium - consider expanding to 1000+ words"
  ]
}
```

### Link Analysis & Strategy

SpiderPlugin automatically analyzes all links on a page and categorizes them intelligently:

#### Link Categories

The plugin separates links into three categories for detailed analysis:

```javascript
{
  // Links to same domain (same subdomain as current page)
  sameDomain: {
    count: 24,
    links: [
      {
        href: "https://example.com/blog/article",
        text: "Read our guide",
        quality: "descriptive",
        hostname: "example.com",
        isSubdomain: false,
        referral: {
          nofollow: false,
          noopener: false,
          noreferrer: false,
          sponsored: false,
          ugc: false,
          external: false,
          target: null,
          rel: null
        }
      },
      // ... more links
    ]
  },

  // Links to subdomains of same domain
  subdomains: {
    count: 3,
    list: ["docs.example.com", "api.example.com"],
    links: [
      {
        href: "https://docs.example.com/api",
        text: "API Documentation",
        quality: "descriptive",
        hostname: "docs.example.com",
        isSubdomain: true,
        referral: {
          nofollow: false,
          noopener: false,
          noreferrer: false,
          sponsored: false,
          ugc: false,
          external: false,
          target: null,
          rel: null
        }
      }
    ]
  },

  // Links to external websites
  external: {
    count: 12,
    domains: {
      "github.com": 3,
      "stackoverflow.com": 2,
      "npmjs.com": 1
      // ... other domains
    },
    links: [
      {
        href: "https://github.com/project/repo",
        text: "View on GitHub",
        domain: "github.com",
        quality: "descriptive",
        referral: {
          nofollow: false,
          noopener: true,
          noreferrer: true,
          sponsored: false,
          ugc: false,
          external: false,
          target: "_blank",
          rel: "noopener noreferrer"
        }
      }
    ]
  },

  // Referral attributes summary
  referralAttributes: {
    total: 36,
    nofollow: 2,           // Links passing no page authority
    noopener: 8,           // Security - prevent window.opener
    noreferrer: 8,         // Privacy - hide referrer info
    sponsored: 1,          // Sponsored/ad links
    ugc: 3,                // User-generated content
    externalAttr: 0,       // rel="external"
    targetBlank: 8,        // Links opening in new tab
    hasRel: 12,            // Links with rel attribute
    followable: 34         // Links without nofollow
  }
}
```

#### Link Strategy Insights

**Same Domain Links (Most Important)**
- Links to content on the same domain/subdomain
- Build topical authority and establish information hierarchy
- Distribute page authority throughout site
- Critical for SEO - shows related content structure

**External Links (Trust & Authority)**
- Links to external domains
- Provide context and credibility
- Show engagement with the wider web
- Too few external links suggests isolated content

**Subdomain Links (Ecosystem)**
- Links to other subdomains of same domain
- Separate properties: docs, blog, api, etc.
- Useful for large site networks
- Tracked separately for subdomain ecosystem analysis

#### Referral Attributes Analysis

Each link is analyzed for referral control attributes that affect SEO and security:

```javascript
referral: {
  // SEO & Authority Control
  nofollow: false,        // rel="nofollow" - Don't pass page authority
  sponsored: false,       // rel="sponsored" - Mark paid/sponsored links
  ugc: false,             // rel="ugc" - Mark user-generated content links
  external: false,        // rel="external" - Mark external links

  // Security & Privacy
  noopener: true,         // rel="noopener" - Prevent window.opener access
  noreferrer: true,       // rel="noreferrer" - Hide referrer info

  // Navigation
  target: "_blank",       // target="_blank" - Open in new tab/window
  rel: "noopener noreferrer"  // Full rel attribute value
}
```

**Referral Attributes Summary:**
```javascript
referralAttributes: {
  total: 36,           // Total links analyzed
  nofollow: 2,         // Links NOT passing authority (× 2 links)
  noopener: 8,         // Security-protected links
  noreferrer: 8,       // Privacy-protected links
  sponsored: 1,        // Sponsored/paid links
  ugc: 3,              // User-generated content links
  externalAttr: 0,     // Marked as external
  targetBlank: 8,      // Opens in new tab
  hasRel: 12,          // Has rel attribute
  followable: 34       // Passes authority (no nofollow)
}
```

**What Each Attribute Means:**

- **nofollow** - Don't pass PageRank/authority. Use for:
  - Comments, forum posts (untrusted content)
  - Paid links, sponsorships
  - User-generated links
  - Affiliate links (if not using `rel="sponsored"`)

- **sponsored** - Marks paid/sponsored links (Google best practice):
  - Replaces nofollow for ads
  - More honest than nofollow
  - Preferred for sponsored content

- **ugc** - Marks user-generated content links:
  - Comments, forum posts
  - Reviews, testimonials
  - User submissions
  - Better than nofollow for UGC

- **noopener** - Security protection:
  - Prevents linked site from accessing `window.opener`
  - Required for `target="_blank"` links
  - Prevents malicious redirect attacks

- **noreferrer** - Privacy protection:
  - Hides referrer information
  - Combined with noopener for full protection
  - Shows as (direct) traffic in analytics

**SEO Impact by Attribute:**

| Attribute | Authority | Recommendation | Example Use |
|-----------|-----------|-----------------|-------------|
| None | ✅ Passes | Best for trusted links | Links to internal pages, partner sites |
| nofollow | ❌ Blocks | Limited use (UGC, comments) | Forum posts, user comments |
| sponsored | ❌ Blocks | Paid/sponsored links | Ads, sponsorships, affiliate |
| ugc | ❌ Blocks | User content | Comments, reviews, forum posts |
| noopener | - | Required for `_blank` | All external links in new tabs |
| noreferrer | - | Privacy control | Sensitive link destinations |

#### Anchor Text Quality

Links are analyzed for anchor text quality:

```javascript
anchorTextQuality: {
  total: 36,          // All anchor text instances
  descriptive: 30,    // Good descriptive text
  poor: 6,            // Generic/vague text
  examples: [
    "click here",     // Generic - bad for SEO
    "more",           // Vague - doesn't describe content
    "link"            // Too generic
  ]
}
```

**Good Anchor Text Examples:**
- "Learn about SEO best practices"
- "How to optimize images"
- "View API documentation"
- "Complete guide to accessibility"

**Bad Anchor Text (Avoid):**
- "Click here"
- "Read more"
- "More"
- "Link"
- Empty text

**SEO Impact:**
- Descriptive text helps search engines understand linked content
- Poor anchor text wastes SEO potential
- Descriptive text improves CTR and user experience

#### Topical Clusters

Internal links form topical clusters - groups of related content:

```javascript
topicalClusters: {
  clusters: ["/blog", "/guides", "/tutorials"],
  strength: [12, 8, 5],  // Number of links in each cluster
  recommendation: "Strengthen cluster coverage"
}
```

This shows:
- Which content sections are linked together
- Strength of each topic cluster
- Opportunities to create better information architecture

#### Broken Anchors (Orphaned Content)

The analyzer detects broken anchor links (links to IDs that don't exist):

```javascript
orphaned: 2  // 2 anchor links point to non-existent IDs

// Example problems:
// <a href="#missing-section">Jump to section</a>  <!-- ID doesn't exist -->
```

This causes broken navigation and poor UX.

#### Recommendations Generated

Based on link analysis, the system provides recommendations:

```javascript
recommendations: [
  "Use more descriptive anchor text - avoid 'click here'",
  "Add links to authoritative external sources",
  "Consider linking to related blog posts for topical clusters",
  "Fix 2 broken anchor links to missing IDs"
]
```

### Performance Characteristics

Content and link analysis is highly optimized:

- **Analysis time per page**: < 100ms
- **Memory overhead**: Minimal
- **DOM queries**: ~15-20 selectors for content, ~1 for links
- **Regex operations**: Word splitting only (no complex patterns)

This means enabling full analysis has negligible performance impact even on large crawls.

### SEO Implications

Understanding content metrics is crucial for SEO:

```javascript
// WORD COUNT MATTERS
< 300 words    → Poor SEO, minimal ranking potential
300-600 words  → Baseline, limited competitive potential
600-1000 words → Good, competitive
1000+ words    → Excellent, strong ranking potential
2000+ words    → Very strong, authority content

// CONTENT RATIO MATTERS
High ratio (70%+)    → Page focused on value, good UX
Low ratio (<30%)     → Page bloated with noise, poor UX
                     → Affects Core Web Vitals, bounce rate, engagement

// CONTAINER MATTERS
Semantic HTML  → Search engines understand content clearly
ARIA roles     → Good SEO with explicit landmarks
Generic divs   → Engines must guess, ambiguous
No container   → Confusion, missed content opportunities
```

---

## ✅ Best Practices

### 1. Use Appropriate Concurrency

```javascript
// Development/testing
new SpiderPlugin({ queue: { concurrency: 2 } })

// Standard crawling
new SpiderPlugin({ queue: { concurrency: 5 } })

// High-performance
new SpiderPlugin({ queue: { concurrency: 20 } })
```

### 2. Enable Only Needed Features

```javascript
// This is slower
new SpiderPlugin({
  seo: { enabled: true },
  techDetection: { enabled: true },
  performance: { enabled: true }
})

// This is faster (only what you need)
new SpiderPlugin({
  seo: { enabled: true },
  techDetection: { enabled: false },
  performance: { enabled: false }
})
```

### 3. Monitor Queue Progress

```javascript
const monitor = setInterval(async () => {
  const status = await spider.getQueueStatus();
  console.log(`Progress: ${status.completed}/${status.pending + status.completed}`);

  if (status.pending === 0 && status.activeWorkers === 0) {
    clearInterval(monitor);
  }
}, 5000);
```

### 4. Handle Large-Scale Crawls

```javascript
// Stream results instead of loading all at once
const page = 0;
const pageSize = 100;

while (true) {
  const batch = await spider.getResults({ limit: pageSize, offset: page * pageSize });
  if (batch.length === 0) break;

  // Process batch
  await processBatch(batch);

  page++;
}
```

### 5. Use Metadata for Organization

```javascript
await spider.enqueueTarget({
  url: 'https://example.com/page',
  metadata: {
    source: 'sitemap',
    category: 'blog',
    priority: 'high',
    crawlDate: new Date().toISOString()
  }
});

// Query by metadata later
const blogResults = await spider.getResults({ category: 'blog' });
```

---

## 🚨 Error Handling

### Common Issues

#### Issue: No Data in Results

```javascript
// ❌ Wrong: autoStart = false but never calling start()
const spider = new SpiderPlugin({ queue: { autoStart: false } });
await db.usePlugin(spider);
// Nothing processes!

// ✅ Correct: Either set autoStart: true or manually start
const spider = new SpiderPlugin({ queue: { autoStart: true } });
// OR
await spider.startProcessing();
```

#### Issue: Out of Memory with Large Crawls

```javascript
// ❌ Too many browsers
new SpiderPlugin({
  puppeteer: { pool: { maxBrowsers: 100 } }
})

// ✅ Reasonable browser pool
new SpiderPlugin({
  puppeteer: { pool: { maxBrowsers: 5 } },
  queue: { concurrency: 10 } // More queue workers, fewer browsers
})
```

#### Issue: Slow Performance

```javascript
// ❌ Processing features you don't need
new SpiderPlugin({
  seo: { enabled: true },
  techDetection: { enabled: true },
  performance: { enabled: true }
})

// ✅ Disable unnecessary features
new SpiderPlugin({
  seo: { enabled: true },
  techDetection: { enabled: false },
  performance: { enabled: false }
})
```

### Error Recovery

```javascript
const spider = new SpiderPlugin({
  queue: {
    maxRetries: 5,        // Retry failed tasks
    retryDelay: 2000      // Exponential backoff
  }
});

// Monitor errors
spider.on('error', (error, task) => {
  console.error(`Failed to process ${task.url}:`, error);
  // Can implement custom retry logic here
});
```

---

## 🔗 See Also

- **[PuppeteerPlugin](./puppeteer.md)** - Browser automation details
- **[S3QueuePlugin](./s3-queue.md)** - Queue management reference
- **[TTLPlugin](./ttl.md)** - Auto-cleanup documentation
- **[Performance Metrics](./puppeteer/PERFORMANCE.md)** - Detailed metrics collection

---

## ❓ FAQ

### General

**Q: What's the difference between SpiderPlugin and PuppeteerPlugin?**
A: PuppeteerPlugin is just browser automation. SpiderPlugin adds distributed queuing, task retry logic, SEO analysis, and tech fingerprinting - making it a complete web crawling solution.

**Q: Can I use SpiderPlugin without S3 backend?**
A: Yes! Use memory:// connection string for testing:
```javascript
const db = new Database({ connectionString: 'memory://test/db' });
```

**Q: Is SpiderPlugin production-ready?**
A: Yes! It's designed for production with error handling, retries, monitoring, and horizontal scaling.

### SEO Analysis

**Q: What meta tags are extracted?**
A: title, description, keywords, author, viewport, robots, charset, language, rating, revisit-after, and custom meta tags.

**Q: Does it extract JSON-LD structured data?**
A: Current version focuses on meta tags and OpenGraph. For structured data, parse JSON-LD separately:
```javascript
const page = await spider.puppeteerPlugin.openPage({ url });
const json = await page.$eval('script[type="application/ld+json"]', el => JSON.parse(el.innerHTML));
```

**Q: Can I extract custom data?**
A: Yes, extend the processor:
```javascript
spider.queuePlugin.setProcessor(async (task, ctx) => {
  const page = await spider.puppeteerPlugin.openPage({ url: task.url });
  const customData = await page.evaluate(() => {
    return { something: document.querySelector('.custom').textContent };
  });
  // ... existing processing
});
```

### Tech Detection

**Q: What technologies are detected?**
A: Frameworks (React, Vue, Angular, etc.), analytics (GA, Amplitude, etc.), marketing pixels, CDN, web servers, CMS, and JS libraries.

**Q: How accurate is tech detection?**
A: It looks for script tags, meta tags, and URL patterns. Accuracy is ~95% for popular frameworks. Custom/internal tools may not be detected.

**Q: Can I add custom tech detection?**
A: Yes, extend TechDetector:
```javascript
const { TechDetector } = await import('./spider/tech-detector.js');
const detector = new TechDetector();

detector.signatures.custom = {
  myTool: {
    indicators: ['my-tool', 'myToolVersion'],
    patterns: [/my-tool[\\/]/i]
  }
};
```

### Content Analysis

**Q: What does "content ratio" mean?**
A: Content ratio (0-1 scale) = mainContentWordCount / totalWordCount. It measures what percentage of page is actual content vs navigation/boilerplate:
- < 0.3 (30%): Too much navigation/footer
- 0.3-0.5 (30-50%): Moderate
- 0.5-0.7 (50-70%): Good
- 0.7+ (70%+): Excellent

**Q: How does the plugin detect main content?**
A: It uses priority-based selector matching:
1. Semantic HTML first (<main>, <article>, <div role="main">)
2. Then Schema.org markup ([itemtype*="Article"])
3. Then WordPress patterns (div.post-content, div.entry-content)
4. Then common patterns (div.article, div.content)
5. Finally fuzzy matching on class names (div[class*="content"])

If none found, it estimates from <p>, <h1-h6>, <li>, <blockquote>, and <table> elements.

**Q: Why is content ratio important for SEO?**
A: Pages with low content ratio (< 30%) indicate bloated navigation, sidebars, and footers. This:
- Dilutes page focus and keyword relevance
- Increases bounce rate (users see boilerplate first)
- Hurts Core Web Vitals metrics
- Signals poor UX to search engines

**Q: What's the minimum content length?**
A: Generally:
- < 300 words: Too short, poor SEO ranking potential
- 300-600 words: Baseline minimum for competitive keywords
- 600-1000 words: Good, competitive
- 1000+ words: Excellent, authority content

**Q: Can pages have multiple content containers?**
A: Yes! The plugin detects all matching containers and reports them in `detectedContentContainers`. For example, a page might have both `<main>` (primary) and `<div class="sidebar-content">` (secondary). The highest-scoring container is used for analysis.

**Q: How does the plugin handle content-heavy sites (docs, wikis)?**
A: The priority system automatically favors semantic HTML and WordPress patterns, which these sites typically use:
- Docs sites usually have proper <main> tags
- Wikis typically use semantic article markup
- All get high accuracy detection

**Q: What if a page has no content container at all?**
A: The plugin uses fallback estimation:
1. Counts words in all paragraphs, headers, lists, quotes, tables
2. Takes minimum 30% of total word count
3. Reports in suggestions: "Use semantic HTML to wrap content in <main>, <article>, or <div role=\"main\">"

**Q: Can I customize content detection selectors?**
A: Currently, selectors are built-in and optimized. To customize, extend SEOAnalyzer:
```javascript
const analyzer = new SEOAnalyzer();
// Modify selector priority list
analyzer.containerSelectors = [
  'div.custom-main',  // Your custom container first
  'main',             // Then fallback to standard
  // ... rest of selectors
];
```

**Q: Does content analysis affect crawl performance?**
A: Minimal impact:
- DOM analysis: ~15-20 selector queries
- Word counting: Simple regex split, no complex patterns
- Total per-page overhead: < 100ms
- Enabling it has negligible performance cost even on large crawls

**Q: How are suggestions generated?**
A: Based on:
1. **Content length**: < 300 (critical), 300-1000 (good), 1000+ (excellent)
2. **Content ratio**: < 30% (improve structure), 30-70% (optimize), 70%+ (excellent)
3. **Container type**: Semantic (good), non-semantic (recommend upgrade)
4. **Structure patterns**: Proper hierarchy, readable paragraphs, lists

All are actionable and specific to the page's actual metrics.

### Internal Linking & Link Analysis

**Q: What's the difference between sameDomain and subdomains?**
A: `sameDomain` = links to the same hostname (e.g., example.com → example.com). `subdomains` = links to different subdomains of the same main domain (e.g., example.com → docs.example.com). This distinction helps analyze your site's network structure:
- Strengthening sameDomain links builds content authority
- Subdomains represent separate properties (blog, docs, api)

**Q: How are external links counted?**
A: All links to different main domains are counted as external. The `domains` object shows a frequency count:
```javascript
external: {
  domains: {
    "github.com": 3,      // 3 links to GitHub
    "stackoverflow.com": 2 // 2 links to SO
  }
}
```

**Q: Why does link quality matter?**
A: Anchor text quality signals:
- **Descriptive text** ("Learn SEO tips") → Helps search engines understand target page content → Better SEO
- **Generic text** ("Click here", "More") → Wasted SEO potential → Engines can't understand target → No ranking benefit

Example impact:
```javascript
// ❌ Bad SEO value
<a href="/seo-guide">click here</a>

// ✅ Good SEO value
<a href="/seo-guide">complete guide to SEO optimization</a>
```

**Q: What are topical clusters and why are they important?**
A: Topical clusters are groups of related content linked together:
- Example: /blog section with 12 internal links = strong cluster
- Shows information architecture to search engines
- Builds topical authority (signals expertise on topic)
- Improves user navigation and discovery

**Q: What does "orphaned content" mean?**
A: Anchor links that point to non-existent IDs:
```javascript
<!-- Page has this link -->
<a href="#missing-id">Jump to section</a>

<!-- But no element with id="missing-id" exists -->
<!-- This breaks navigation and is bad UX -->
```

**Q: Why should I have external links?**
A: External links indicate:
- Engagement with the wider web (not isolated content)
- Respect for authoritative sources
- Credibility and trust signals
- Too few external links suggests thin content

**Q: How do I improve internal linking strategy?**
A: Focus on the three golden rules:
1. **Link to sister pages** - Create topical clusters with descriptive anchor text
2. **Use descriptive anchors** - Never "click here" or "read more"
3. **Build pillar pages** - Create strong, comprehensive content hubs that gather and distribute authority

**Q: Can I have too many links on a page?**
A: More links is generally better for internal linking (distributes authority), but:
- Avoid link spam or manipulation (100+ links to same destination)
- Keep link density reasonable for readability
- Focus on relevance and user experience
- Each link should add value

**Q: How is subdomain structure beneficial?**
A: Separate subdomains help with:
- **docs.example.com** - Separate documentation hub
- **blog.example.com** - Separate blog with SEO focus
- **api.example.com** - API reference and developer resources
- Allows independent optimization while sharing domain authority

**Q: Should external links open in new tabs?**
A: Generally yes, for user experience:
```html
<!-- Opens in new tab, keeps your page open -->
<a href="https://external.com" target="_blank" rel="noopener noreferrer">
  External link
</a>

<!-- rel="noopener noreferrer" protects security and SEO -->
```

### Referral Attributes & SEO

**Q: What's the difference between nofollow, sponsored, and ugc?**
A: All three block PageRank passing, but signal different intentions to search engines:

- **rel="nofollow"** (older, generic): Don't pass authority. Generic catch-all.
- **rel="sponsored"** (preferred): Paid/advertising links. More honest and specific.
- **rel="ugc"** (preferred): User-generated content. Forums, reviews, comments.

Google prefers `sponsored` and `ugc` over `nofollow` because they're more honest about link intent.

**Q: Should I use nofollow on comments and UGC?**
A: Yes! Use the most specific rel attribute:
```html
<!-- User comment with link -->
<a href="https://example.com" rel="ugc">Check this out</a>

<!-- Sponsored/affiliate link -->
<a href="https://product.com" rel="sponsored">Product recommendation</a>

<!-- Generic untrusted link -->
<a href="https://unknown.com" rel="nofollow">External reference</a>
```

This tells Google: "I link to these, but don't vouch for them" → No spam credit given to the linked site.

**Q: When do I need rel="noopener noreferrer"?**
A: Always use for external links opening in new tabs:

```javascript
// ❌ Vulnerable to attack
<a href="https://external.com" target="_blank">
  External link
</a>

// ✅ Secure
<a href="https://external.com" target="_blank" rel="noopener noreferrer">
  External link
</a>

// What noopener does:
// - Prevents linked site accessing window.opener
// - Blocks malicious page redirects
// - Required for security best practices

// What noreferrer does:
// - Hides referrer information
// - Shows as (direct) traffic in their analytics
// - Privacy protection
```

**Q: What does "followable" mean in referralAttributes?**
A: Links WITHOUT `rel="nofollow"` that pass PageRank:
```javascript
followable: 34  // 34 out of 36 links pass authority

// Example:
// Total links: 36
// Links with nofollow: 2
// Followable: 34 (36 - 2)

// These 34 links contribute to page authority distribution
```

**Q: How much should I use nofollow?**
A: Generally:
- **Internal links**: Should have 0 nofollow (pass all authority)
- **External trusted links**: Should have 0 nofollow (you vouch for them)
- **Affiliate links**: Use `rel="sponsored"` (not nofollow)
- **User comments/UGC**: Use `rel="ugc"` (prevents spam)
- **Untrusted sources**: Use `rel="nofollow"` (generic safety)

Too many nofollows = wasted linking potential and less SEO value.

**Q: Does target="_blank" affect SEO?**
A: No direct SEO impact, but:
- **Usability**: Keep your page open (good UX)
- **Analytics**: Referrer info (with noreferrer, shows as direct)
- **Security**: MUST use `rel="noopener noreferrer"`

Best practice:
```html
<!-- All external links in new tab with security -->
<a href="https://external.com" target="_blank" rel="noopener noreferrer">
  External link
</a>

<!-- Internal links same tab (expected behavior) -->
<a href="/page">Internal link</a>
```

**Q: What's rel="external"?**
A: Older HTML attribute marking external links. Modern practice:
- Not standard
- Doesn't affect SEO
- Replaced by `rel="nofollow"`, `rel="sponsored"`, `rel="ugc"`

Use the more specific attributes instead.

**Q: Should I add rel attributes to all internal links?**
A: No! Internal links should have NO rel attributes:

```javascript
// ✅ Correct - pass full authority internally
<a href="/blog/post">Related blog post</a>

// ❌ Wrong - why block internal authority?
<a href="/blog/post" rel="nofollow">Related blog post</a>
```

Internal links distribute your site's authority. Never nofollow internal links.

**Q: How do referral attributes affect page authority?**
A: Authority distribution:

```javascript
// Scenario: Page with 10 links

1. All followable (0 nofollow)
   → Full authority distributed among 10 links

2. 2 nofollow + 8 followable
   → Authority distributed among 8 links only
   → Other 2 links get NO authority

// Formula (simplified):
// Authority per link = Page authority / followable links
//
// Example: Page with 100 authority
// - 10 followable links → 10 authority each
// - 5 followable links → 20 authority each
```

Using nofollow strategically reduces wasted authority on unreliable links!

### Performance

**Q: How many pages can I crawl?**
A: Depends on concurrency and server. With concurrency=10 and avg 2s/page, expect ~5 pages/second = 18,000 pages/hour.

**Q: Is Puppeteer fast enough?**
A: Puppeteer adds overhead (launching Chromium). For API scraping, consider lighter alternatives. For JavaScript-heavy sites, it's necessary.

**Q: How do I improve crawl speed?**
A:
- Increase concurrency (more workers)
- Increase browser pool size
- Disable unnecessary features (SEO, tech detection)
- Use faster disks for S3 backend
- Distribute across multiple machines

### Integration

**Q: Can I use SpiderPlugin with existing databases?**
A: Yes! Results are stored in regular S3DB resources. Query with your existing DB:
```javascript
const results = await spider.getResults();
await myDatabase.importResults(results);
```

**Q: How do I export results?**
A: Standard S3DB exports:
```javascript
const resultsResource = await db.getResource('plg_spider_results');
const data = await resultsResource.list({ limit: 1000 });

// Export to CSV
const csv = Papa.unparse(data);
fs.writeFileSync('results.csv', csv);

// Export to JSON
fs.writeFileSync('results.json', JSON.stringify(data, null, 2));
```

**Q: Can I run multiple SpiderPlugin instances?**
A: Yes! Use different namespaces:
```javascript
const seoSpider = new SpiderPlugin({ namespace: 'seo', seo: { enabled: true } });
const techSpider = new SpiderPlugin({ namespace: 'tech', techDetection: { enabled: true } });

await db.usePlugin(seoSpider);
await db.usePlugin(techSpider);
```

### Security Analysis & WebSockets

**Q: What security headers are analyzed?**
A: The following critical security headers:
- `X-Frame-Options` - Prevents clickjacking attacks
- `X-Content-Type-Options` - Prevents MIME sniffing
- `Strict-Transport-Security (HSTS)` - Forces HTTPS
- `X-XSS-Protection` - XSS attack protection
- `Referrer-Policy` - Controls referrer information
- `Permissions-Policy` - Controls browser feature access

**Q: What does CSP analysis detect?**
A: Content Security Policy analysis includes:
- Policy directives and their values
- Unsafe patterns (unsafe-inline, unsafe-eval, wildcards)
- CSP strength rating (strong/moderate/weak)
- Specific recommendations for improvement

**Q: How are WebSockets detected and captured?**
A: WebSocket detection works by:
1. Injecting WebSocket tracking code before page load
2. Intercepting WebSocket constructor calls
3. Capturing connection URLs and protocols
4. Logging sent and received messages
5. Tracking connection state changes

Example output:
```javascript
websockets: {
  present: true,
  count: 2,
  connections: [
    {
      url: 'wss://api.example.com/realtime',
      protocols: ['chat'],
      messageCount: 15,
      readyState: 1,  // 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
      messages: [
        { type: 'sent', data: '{"action":"subscribe"}', timestamp: 1234567890 },
        { type: 'received', data: '{"status":"connected"}', timestamp: 1234567891 }
      ]
    }
  ]
}
```

**Q: What's captured in console logs?**
A: By default, captures `error` and `warn` level logs:
- Log type (error, warn, info, debug, log)
- Log message text
- Source location (file:line)
- Number of arguments
- Timestamp

**Q: How do I disable specific security checks?**
A: Use configuration flags:
```javascript
new SpiderPlugin({
  security: {
    enabled: true,
    analyzeSecurityHeaders: false,    // Skip headers
    analyzeCSP: false,                // Skip CSP
    analyzeCORS: false,               // Skip CORS
    captureConsoleLogs: false,        // Skip console logs
    analyzeTLS: false,                // Skip HTTPS check
    checkVulnerabilities: false,      // Skip vuln detection
    captureWebSockets: false          // Skip WebSocket capture
  }
});
```

**Q: Can I increase the WebSocket message capture limit?**
A: Yes, use `maxWebSocketMessages` config:
```javascript
new SpiderPlugin({
  security: {
    captureWebSockets: true,
    maxWebSocketMessages: 200  // Capture up to 200 messages per connection
  }
});
```

**Q: How is security score calculated?**
A: Security score (0-100) is calculated from:
- Security headers: 30 points (30% of score)
- CSP strength: 20 points (strong=20, moderate=10, none=0)
- CORS validation: 20 points (proper config=20, issues=10, none=0)
- TLS/HTTPS: 15 points (HTTPS+HSTS=15, HTTPS=10)
- Vulnerabilities: Negative points per issue
- Console errors: Small penalty (max -5 points)

### Troubleshooting

**Q: Getting "Chromium not found" error?**
A: Puppeteer needs to download Chromium:
```bash
npm install puppeteer  # Downloads chromium automatically
# Or manually download
npx puppeteer browsers install chrome
```

**Q: Tasks are queued but not processing?**
A: Check queue settings:
```javascript
// Queue needs autoStart: true or manual start()
new SpiderPlugin({ queue: { autoStart: true } });

// Or manually
await spider.startProcessing();
```

**Q: Running out of memory?**
A: Reduce browser pool and increase queue workers:
```javascript
new SpiderPlugin({
  puppeteer: { pool: { maxBrowsers: 2, maxTabsPerBrowser: 3 } },
  queue: { concurrency: 10 }  // More queue workers
});
```

**Q: Results show null for SEO/tech data?**
A: Check if features are enabled:
```javascript
const spider = new SpiderPlugin({
  seo: { enabled: true },        // Must be true!
  techDetection: { enabled: true }
});
```

---

**Last Updated**: 2025-11-14
**Status**: Production Ready
**Version**: 1.1.0 (with SEO, Tech Detection, Security Analysis & WebSocket Detection)
