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
**Version**: 1.0.0 (with SEO & Tech Detection)
