# 🕷️ SpiderPlugin

> **All-in-one web crawler suite bundling Puppeteer, S3Queue, and TTL for distributed crawling workloads.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

**Integrated crawler bundle** that combines browser automation, distributed queueing, and TTL management under one namespace.

**1 line to get started:**
```javascript
await db.usePlugin(new SpiderPlugin({ namespace: 'crawler' }));
```

**Production-ready setup:**
```javascript
await db.usePlugin(new SpiderPlugin({
  namespace: 'crawler',              // Shared namespace
  queue: {
    autoStart: true,                 // Start workers automatically
    concurrency: 5                   // Parallel workers
  },
  puppeteer: {
    pool: { enabled: true, size: 3 } // Browser pool
  },
  ttl: {
    queue: { ttl: 3600 }             // 1-hour TTL for stale tasks
  },
  processor: async (task, ctx, { puppeteer }) => {
    const page = await puppeteer.open(task.url);
    const title = await page.title();
    await page.close();
    return { url: task.url, title };
  }
}));

// Enqueue crawl targets
const spider = db.plugins['crawler-suite'];
await spider.enqueueTarget({ url: 'https://example.com' });
```

**Key features:**
- ✅ **Integrated Browser Automation** - PuppeteerPlugin with sensible defaults
- ✅ **Distributed Queue** - S3QueuePlugin for scalable task processing
- ✅ **Automatic TTL Cleanup** - Optional TTL management for stale tasks
- ✅ **SEO Analysis** - Meta tags, OpenGraph, Twitter Cards, assets, links
- ✅ **Technology Fingerprinting** - Detect 100+ frameworks, analytics, CDN
- ✅ **Security Analysis** - Headers, CSP, CORS, WebSockets, vulnerabilities
- ✅ **Visual Capture** - Screenshot capture with configurable format/quality
- ✅ **Performance Metrics** - Core Web Vitals, navigation timing, memory
- ✅ **Data Persistence** - Configurable opt-in storage to S3
- ✅ **Namespaced Resources** - Isolated crawler data (`<namespace>_targets`)
- ✅ **Simple API** - Unified interface hiding complexity
- ✅ **Production Ready** - Error handling, retries, and monitoring built-in
- ✅ **Horizontal Scaling** - Multiple workers across processes/machines

**Performance comparison:**
```javascript
// ❌ Without SpiderPlugin: Manual setup
await db.usePlugin(new PuppeteerPlugin({ namespace: 'pup' }));
await db.usePlugin(new S3QueuePlugin({ namespace: 'queue', resource: 'pup_targets' }));
await db.usePlugin(new TTLPlugin({ resources: [{ name: 'pup_targets', ttl: 3600 }] }));
// 30+ lines to wire everything together

// ✅ With SpiderPlugin: One-liner setup
await db.usePlugin(new SpiderPlugin({
  namespace: 'crawler',
  queue: { autoStart: true, concurrency: 5 },
  puppeteer: { pool: { enabled: true } },
  ttl: { queue: { ttl: 3600 } }
}));
// Everything wired and ready to crawl!
```

---

## 📦 Dependencies

**Required:**
```bash
pnpm install s3db.js puppeteer
```

**Peer Dependencies:**
- `puppeteer` (required) - Browser automation engine
- `@aws-sdk/client-s3` (required) - S3 storage backend

**What You Get:**

SpiderPlugin is a **meta-plugin** that bundles three plugins under one namespace:

1. **PuppeteerPlugin** - Browser automation (Chromium pool)
2. **S3QueuePlugin** - Distributed task queue
3. **TTLPlugin** (optional) - Automatic cleanup of stale tasks

**Automatic Setup:**
- Creates namespaced resources: `<namespace>_targets`, `<namespace>_ttl_cohorts`
- Wires queue processor to Puppeteer instance
- Configures TTL cleanup if enabled
- Provides unified API for common operations

**Why Bundle These?**

Web crawling requires:
- **Browser automation** - Puppeteer for rendering JavaScript
- **Distributed queuing** - S3Queue for horizontal scaling
- **Task expiration** - TTL to prevent infinite retries

SpiderPlugin eliminates 100+ lines of boilerplate setup.

---

## 📑 Table of Contents

1. [⚡ TLDR](#-tldr)
2. [📦 Dependencies](#-dependencies)
3. [⚡ Quickstart](#-quickstart)
4. [Usage Journey](#usage-journey)
   - [Level 1: Basic Crawling](#level-1-basic-crawling)
   - [Level 2: Queue Management](#level-2-queue-management)
   - [Level 3: Advanced Crawling](#level-3-advanced-crawling)
   - [Level 4: Production Setup](#level-4-production-setup)
   - [Level 5: Multi-Worker Distributed](#level-5-multi-worker-distributed)
5. [📊 Configuration Reference](#-configuration-reference)
6. [📚 Configuration Examples](#-configuration-examples)
7. [🔧 API Reference](#-api-reference)
8. [✅ Best Practices](#-best-practices)
9. [🚨 Error Handling](#-error-handling)
10. [🔗 See Also](#-see-also)
11. [❓ FAQ](#-faq)

---

## ⚡ Quickstart

```javascript
import { Database } from 's3db.js';
import { SpiderPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: 's3://key:secret@bucket/path'
});

// Create spider with processor
const spider = new SpiderPlugin({
  namespace: 'crawler',
  queue: { autoStart: true, concurrency: 3 },
  processor: async (task, context, helpers) => {
    // Access browser via helpers.puppeteer
    const page = await helpers.puppeteer.open(task.url);

    // Extract data
    const title = await page.title();
    const links = await page.$$eval('a', els => els.map(a => a.href));

    await page.close();

    // Return crawl results
    return { url: task.url, title, linksFound: links.length };
  }
});

await db.usePlugin(spider);
await db.connect();

// Enqueue crawl targets
await spider.enqueueTarget({ url: 'https://example.com', priority: 10 });
await spider.enqueueTarget({ url: 'https://example.com/about', priority: 5 });

// Monitor queue progress
const stats = await spider.queuePlugin.getStats();
console.log(`Pending: ${stats.pending}, Completed: ${stats.completed}`);

await db.disconnect();
```

---

## Usage Journey

### Level 1: Basic Crawling

Start with a simple single-page crawler:

```javascript
import { Database, SpiderPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });

const spider = new SpiderPlugin({
  namespace: 'basic-crawler',
  processor: async (task, ctx, { puppeteer }) => {
    const page = await puppeteer.open(task.url);
    const html = await page.content();
    await page.close();

    return { url: task.url, size: html.length };
  }
});

await db.usePlugin(spider);
await db.connect();

// Crawl one page
await spider.enqueueTarget({ url: 'https://example.com' });
await spider.startProcessing();
```

**What's happening:**
- SpiderPlugin creates `basic-crawler_targets` resource
- Processor receives tasks from the queue
- Puppeteer opens the URL and extracts content
- Results are stored in task metadata

---

### Level 2: Queue Management

Control when and how tasks are processed:

```javascript
const spider = new SpiderPlugin({
  namespace: 'managed',
  queue: {
    autoStart: false,  // Manual start
    concurrency: 1,    // Sequential processing
    batchSize: 10      // Process 10 at a time
  }
});

await db.usePlugin(spider);
await db.connect();

// Set processor later
spider.setProcessor(async (task, ctx, { puppeteer, enqueue }) => {
  const page = await puppeteer.open(task.url);

  // Find more URLs to crawl
  const links = await page.$$eval('a', els => els.map(a => a.href));

  await page.close();

  // Enqueue discovered links
  for (const link of links.slice(0, 5)) {
    await enqueue({ url: link, parent: task.url });
  }

  return { crawled: task.url, discovered: links.length };
});

// Enqueue seed URLs
await spider.enqueueTarget({ url: 'https://example.com' });
await spider.enqueueTarget({ url: 'https://example.com/blog' });

// Start when ready
await spider.startProcessing();

// Check progress
setInterval(async () => {
  const stats = await spider.queuePlugin.getStats();
  console.log(`Queue: ${stats.pending} pending, ${stats.processing} active`);
}, 5000);
```

**New concepts:**
- Manual processor registration with `setProcessor()`
- Recursive crawling by enqueueing discovered links
- Queue statistics monitoring
- Manual start control

---

### Level 3: Advanced Crawling

Add browser pool, retries, and error handling:

```javascript
const spider = new SpiderPlugin({
  namespace: 'advanced',
  queue: {
    autoStart: true,
    concurrency: 5,
    maxRetries: 3,
    retryDelay: 1000
  },
  puppeteer: {
    pool: {
      enabled: true,
      size: 3,              // 3 browser instances
      maxPagesPerBrowser: 5 // 5 pages per browser
    },
    launchOptions: {
      headless: true,
      args: ['--no-sandbox']
    }
  },
  processor: async (task, ctx, { puppeteer }) => {
    const page = await puppeteer.open(task.url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    try {
      // Wait for specific content
      await page.waitForSelector('article', { timeout: 5000 });

      // Extract structured data
      const data = await page.evaluate(() => ({
        title: document.querySelector('h1')?.innerText,
        content: document.querySelector('article')?.innerText,
        images: Array.from(document.querySelectorAll('img'))
          .map(img => img.src)
      }));

      return { url: task.url, ...data };
    } finally {
      await page.close();
    }
  }
});

await db.usePlugin(spider);
await db.connect();

// Crawl with priorities
await spider.enqueueTarget({ url: 'https://example.com', priority: 10 });
await spider.enqueueTarget({ url: 'https://example.com/blog', priority: 5 });
```

**New concepts:**
- Browser pooling for performance
- Retry logic for transient failures
- Page wait strategies
- Structured data extraction
- Priority-based processing

---

### Level 4: Production Setup

Add TTL cleanup, monitoring, and graceful shutdown:

```javascript
const spider = new SpiderPlugin({
  namespace: 'production',
  queue: {
    autoStart: true,
    concurrency: 10,
    maxRetries: 5,
    retryDelay: 2000
  },
  puppeteer: {
    pool: { enabled: true, size: 5 }
  },
  ttl: {
    queue: {
      ttl: 3600,              // 1-hour TTL for stale tasks
      onExpire: 'hard-delete', // Delete expired tasks
      checkInterval: 300       // Check every 5 minutes
    }
  },
  processor: async (task, ctx, { puppeteer, resource }) => {
    const startTime = Date.now();

    try {
      const page = await puppeteer.open(task.url, { timeout: 30000 });

      const data = await page.evaluate(() => ({
        title: document.title,
        links: Array.from(document.querySelectorAll('a'))
          .map(a => a.href)
          .filter(href => href.startsWith('http'))
      }));

      await page.close();

      // Log metrics
      ctx.logger.info({
        url: task.url,
        duration: Date.now() - startTime,
        linksFound: data.links.length
      });

      return { success: true, ...data };
    } catch (error) {
      ctx.logger.error({
        url: task.url,
        error: error.message,
        duration: Date.now() - startTime
      });
      throw error; // Let queue handle retry
    }
  }
});

await db.usePlugin(spider);
await db.connect();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down spider...');
  await spider.stopProcessing();
  await db.disconnect();
  process.exit(0);
});

// Enqueue batch of URLs
const urls = [
  'https://example.com',
  'https://example.com/blog',
  'https://example.com/about'
];

for (const url of urls) {
  await spider.enqueueTarget({ url, timestamp: Date.now() });
}

// Monitor continuously
setInterval(async () => {
  const stats = await spider.queuePlugin.getStats();
  const resource = await db.getResource(`${spider.namespace}_targets`);
  const totalJobs = await resource.query({});

  console.log({
    pending: stats.pending,
    processing: stats.processing,
    completed: stats.completed,
    total: totalJobs.length
  });
}, 10000);
```

**New concepts:**
- TTL-based cleanup of stale tasks
- Structured logging with context
- Graceful shutdown handling
- Batch enqueueing
- Continuous monitoring

---

### Level 5: Multi-Worker Distributed

Scale horizontally across multiple processes or machines:

```javascript
// worker-1.js (Machine 1)
const spider = new SpiderPlugin({
  namespace: 'distributed',
  queue: {
    autoStart: true,
    concurrency: 5,
    workerId: 'worker-1' // Unique worker ID
  },
  puppeteer: {
    pool: { enabled: true, size: 3 }
  },
  processor: async (task, ctx, { puppeteer }) => {
    ctx.logger.info(`[Worker 1] Processing: ${task.url}`);
    // ... crawl logic
  }
});

await db.usePlugin(spider);
await db.connect();

// worker-2.js (Machine 2)
const spider = new SpiderPlugin({
  namespace: 'distributed',
  queue: {
    autoStart: true,
    concurrency: 5,
    workerId: 'worker-2' // Different worker ID
  },
  puppeteer: {
    pool: { enabled: true, size: 3 }
  },
  processor: async (task, ctx, { puppeteer }) => {
    ctx.logger.info(`[Worker 2] Processing: ${task.url}`);
    // ... same crawl logic
  }
});

await db.usePlugin(spider);
await db.connect();

// coordinator.js (Enqueues jobs)
const db = new Database({ connectionString: 's3://...' });
await db.connect();

const resource = await db.getResource('distributed_targets');

// Enqueue 1000 URLs
const urls = await fetchUrlsFromSitemap();
for (const url of urls) {
  await resource.enqueue({ url, priority: Math.floor(Math.random() * 10) });
}

console.log(`Enqueued ${urls.length} URLs for distributed processing`);
```

**New concepts:**
- Unique worker IDs for distributed processing
- Shared queue across multiple workers
- Coordinator pattern for job distribution
- Horizontal scaling across machines
- Load balancing via S3Queue

---

## 📊 Configuration Reference

Complete configuration object with all options:

```javascript
new SpiderPlugin({
  // ============================================
  // SECTION 1: Core Settings
  // ============================================
  namespace: 'spider',                    // Namespace for all resources (required)
  targetsResource: 'spider_targets',      // Resource name for queue (auto-generated from namespace)

  // ============================================
  // SECTION 2: Queue Configuration
  // ============================================
  queue: {
    autoStart: false,                     // Start processing automatically (default: false)
    concurrency: 3,                       // Number of parallel workers (default: 3)
    maxRetries: 3,                        // Max retry attempts per task (default: 3)
    retryDelay: 1000,                     // Delay between retries in ms (default: 1000)
    batchSize: 10,                        // Tasks to process per batch (default: 10)
    workerId: 'worker-1',                 // Unique worker ID for distributed setups (optional)
    visibilityTimeout: 30                 // Task lock duration in seconds (default: 30)
  },

  // ============================================
  // SECTION 3: Puppeteer Configuration
  // ============================================
  puppeteer: {
    pool: {
      enabled: false,                     // Enable browser pooling (default: false)
      size: 3,                            // Number of browser instances (default: 3)
      maxPagesPerBrowser: 5,              // Max pages per browser (default: 5)
      launchTimeout: 30000,               // Browser launch timeout (default: 30000)
      closeTimeout: 5000                  // Browser close timeout (default: 5000)
    },
    launchOptions: {
      headless: true,                     // Run in headless mode (default: true)
      args: ['--no-sandbox'],             // Chrome launch args (default: [])
      defaultViewport: {
        width: 1920,
        height: 1080
      }
    }
  },

  // ============================================
  // SECTION 4: TTL Configuration (Optional)
  // ============================================
  ttl: {
    queue: {
      ttl: 3600,                          // TTL in seconds for queue tasks (default: null, disabled)
      onExpire: 'hard-delete',            // Action on expiration: 'soft-delete', 'hard-delete', 'callback' (default: 'soft-delete')
      checkInterval: 300,                 // Cleanup interval in seconds (default: 300)
      field: 'createdAt'                  // Field to check for expiration (default: 'createdAt')
    }
  },

  // ============================================
  // SECTION 5: Processor Function
  // ============================================
  processor: async (task, context, helpers) => {
    // task: { url, priority, metadata, ... }
    // context: { logger, db, resource }
    // helpers: { puppeteer, queue, enqueue, resource }

    const page = await helpers.puppeteer.open(task.url);
    const data = await page.evaluate(() => ({ title: document.title }));
    await page.close();

    return data;
  },

  // ============================================
  // SECTION 6: Advanced Analysis Features
  // ============================================

  // SEO Analysis
  seo: {
    enabled: true,                      // Enable SEO analysis
    extractMetaTags: true,              // Extract meta tags
    extractOpenGraph: true,             // Extract OpenGraph tags
    extractTwitterCard: true,           // Extract Twitter Card tags
    extractAssets: true,                // Extract CSS, JS, images
    assetMetadata: true                 // Collect asset metadata
  },

  // Technology Detection
  techDetection: {
    enabled: true,                      // Enable tech fingerprinting
    detectFrameworks: true,             // React, Vue, Angular, etc.
    detectAnalytics: true,              // Google Analytics, Amplitude, etc.
    detectMarketing: true,              // Facebook Pixel, LinkedIn, etc.
    detectCDN: true,                    // Cloudflare, CloudFront, etc.
    detectWebServer: true,              // Nginx, Apache, IIS, etc.
    detectCMS: true                     // WordPress, Shopify, etc.
  },

  // Screenshot Capture
  screenshot: {
    enabled: true,                      // Enable screenshot capture
    captureFullPage: true,              // Full page or viewport
    quality: 80,                        // Quality 0-100 (JPEG only)
    format: 'jpeg',                     // 'jpeg' or 'png'
    maxWidth: 1920,                     // Screenshot width
    maxHeight: 1080                     // Screenshot height
  },

  // Security Analysis
  security: {
    enabled: true,                      // Enable security analysis
    analyzeSecurityHeaders: true,       // HTTP security headers
    analyzeCSP: true,                   // Content Security Policy
    analyzeCORS: true,                  // CORS configuration
    captureConsoleLogs: true,           // Browser console logs
    consoleLogLevels: ['error', 'warn'],// Log levels to capture
    maxConsoleLogLines: 100,            // Max console logs
    analyzeTLS: true,                   // TLS/HTTPS verification
    checkVulnerabilities: true,         // Security vulnerability detection
    captureWebSockets: true,            // WebSocket detection
    maxWebSocketMessages: 50            // Max WebSocket messages
  },

  // Performance Metrics
  performance: {
    enabled: true,                      // Enable performance collection
    collectCoreWebVitals: true,         // LCP, FID, CLS
    collectNavigationTiming: true,      // Page load timing
    collectResourceTiming: true,        // Resource timing
    collectMemory: true                 // Memory usage
  },

  // Data Persistence
  persistence: {
    enabled: false,                     // Enable data persistence (opt-in)
    saveResults: true,                  // Save main crawl results
    saveSEOAnalysis: true,              // Save SEO analysis
    saveTechFingerprint: true,          // Save technology fingerprints
    saveSecurityAnalysis: true,         // Save security analysis
    saveScreenshots: true,              // Save captured screenshots
    savePerformanceMetrics: true        // Save performance metrics
  }
})
```

**Configuration Validation:**

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `namespace` | string | ✅ Yes | `'spider'` | Must be alphanumeric + hyphens |
| `targetsResource` | string | ❌ No | `{namespace}_targets` | Must be valid resource name |
| `queue.autoStart` | boolean | ❌ No | `false` | - |
| `queue.concurrency` | number | ❌ No | `3` | Must be > 0 |
| `puppeteer.pool.enabled` | boolean | ❌ No | `false` | - |
| `ttl.queue.ttl` | number | ❌ No | `null` | Must be > 0 if provided |
| `processor` | function | ❌ No | `null` | Must be async function if provided |

---

## 📚 Configuration Examples

### Example 1: Simple Website Crawler

```javascript
new SpiderPlugin({
  namespace: 'simple',
  queue: { autoStart: true, concurrency: 2 },
  processor: async (task, ctx, { puppeteer }) => {
    const page = await puppeteer.open(task.url);
    const title = await page.title();
    await page.close();
    return { url: task.url, title };
  }
})
```

---

### Example 2: High-Performance Crawler

```javascript
new SpiderPlugin({
  namespace: 'fast',
  queue: {
    autoStart: true,
    concurrency: 10,
    maxRetries: 5
  },
  puppeteer: {
    pool: {
      enabled: true,
      size: 5,
      maxPagesPerBrowser: 10
    }
  }
})
```

---

### Example 3: Crawler with TTL Cleanup

```javascript
new SpiderPlugin({
  namespace: 'ttl-enabled',
  queue: { autoStart: true },
  ttl: {
    queue: {
      ttl: 7200,              // 2 hours
      onExpire: 'hard-delete',
      checkInterval: 600      // Check every 10 minutes
    }
  }
})
```

---

### Example 4: Distributed Crawler

```javascript
new SpiderPlugin({
  namespace: 'distributed',
  queue: {
    autoStart: true,
    concurrency: 5,
    workerId: process.env.WORKER_ID,  // Unique per instance
    visibilityTimeout: 60             // 1-minute lock
  },
  puppeteer: {
    pool: { enabled: true, size: 3 }
  }
})
```

---

### Example 5: Screenshot Crawler

```javascript
new SpiderPlugin({
  namespace: 'screenshots',
  processor: async (task, ctx, { puppeteer }) => {
    const page = await puppeteer.open(task.url);
    const screenshot = await page.screenshot({ fullPage: true });
    await page.close();

    // Upload screenshot to S3
    const key = `screenshots/${task.url.replace(/[^a-z0-9]/gi, '_')}.png`;
    await ctx.db.client.putObject({
      bucket: ctx.db.bucket,
      key,
      body: screenshot
    });

    return { url: task.url, screenshot: key };
  }
})
```

---

## 🔧 API Reference

### SpiderPlugin Methods

#### `new SpiderPlugin(options): SpiderPlugin`

Creates a new SpiderPlugin instance.

**Parameters:**
- `options` (object, required): Configuration object (see Configuration Reference)

**Returns:** `SpiderPlugin` instance

**Example:**
```javascript
const spider = new SpiderPlugin({
  namespace: 'crawler',
  queue: { autoStart: true }
});
```

---

#### `setProcessor(fn, options?): void`

Sets or replaces the queue processor function.

**Parameters:**
- `fn` (function, required): Async processor function `(task, context, helpers) => result`
- `options` (object, optional):
  - `autoStart` (boolean): Start processing immediately (default: false)
  - `concurrency` (number): Override queue concurrency

**Returns:** `void`

**Example:**
```javascript
spider.setProcessor(async (task, ctx, { puppeteer }) => {
  const page = await puppeteer.open(task.url);
  const data = await page.evaluate(() => ({ title: document.title }));
  await page.close();
  return data;
}, { autoStart: true });
```

**Throws:**
- `PluginError` - If processor is not a function

---

#### `enqueueTarget(data, options?): Promise<string>`

Enqueues a new crawl target.

**Parameters:**
- `data` (object, required): Task data (must include `url` field)
- `options` (object, optional):
  - `priority` (number): Task priority (higher = sooner, default: 5)
  - `metadata` (object): Additional metadata

**Returns:** `Promise<string>` - Task ID

**Example:**
```javascript
const taskId = await spider.enqueueTarget({
  url: 'https://example.com',
  priority: 10,
  metadata: { source: 'sitemap' }
});
```

**Throws:**
- `PluginError` - If `url` field is missing
- `ResourceError` - If targets resource doesn't exist

---

#### `startProcessing(options?): Promise<void>`

Starts queue processing with registered processor.

**Parameters:**
- `options` (object, optional):
  - `concurrency` (number): Override default concurrency

**Returns:** `Promise<void>`

**Example:**
```javascript
await spider.startProcessing({ concurrency: 10 });
```

**Throws:**
- `PluginError` - If no processor is set

---

#### `stopProcessing(): Promise<void>`

Stops queue processing gracefully.

**Returns:** `Promise<void>`

**Example:**
```javascript
await spider.stopProcessing();
```

---

### Processor Helpers

The processor function receives a `helpers` object with:

| Helper | Type | Description |
|--------|------|-------------|
| `puppeteer` | PuppeteerPlugin | Namespaced Puppeteer instance |
| `queue` | S3QueuePlugin | Queue plugin instance |
| `enqueue` | function | Helper to enqueue new tasks |
| `resource` | Resource | Direct access to targets resource |

**Example:**
```javascript
processor: async (task, ctx, helpers) => {
  // helpers.puppeteer - Browser automation
  const page = await helpers.puppeteer.open(task.url);

  // helpers.enqueue - Add more tasks
  await helpers.enqueue({ url: 'https://example.com/next' });

  // helpers.resource - Direct resource access
  const allTasks = await helpers.resource.query({});

  // helpers.queue - Queue management
  const stats = await helpers.queue.getStats();
}
```

---

### Events

SpiderPlugin emits events from child plugins:

#### `queue.task.start`

Emitted when a task starts processing.

**Payload:**
```javascript
{
  taskId: 'task-123',
  url: 'https://example.com',
  timestamp: 1234567890
}
```

**Example:**
```javascript
spider.queuePlugin.on('queue.task.start', ({ taskId, url }) => {
  console.log(`Started: ${taskId} - ${url}`);
});
```

---

#### `queue.task.complete`

Emitted when a task completes successfully.

**Payload:**
```javascript
{
  taskId: 'task-123',
  url: 'https://example.com',
  result: { title: 'Example' },
  duration: 1234
}
```

---

#### `queue.task.error`

Emitted when a task fails.

**Payload:**
```javascript
{
  taskId: 'task-123',
  url: 'https://example.com',
  error: Error,
  retryCount: 2
}
```

---

## ✅ Best Practices

### Do's ✅

1. **Always close pages**
   ```javascript
   // ✅ Good - Always close pages
   processor: async (task, ctx, { puppeteer }) => {
     const page = await puppeteer.open(task.url);
     try {
       return await extractData(page);
     } finally {
       await page.close(); // Always close!
     }
   }
   ```

2. **Use browser pooling for high concurrency**
   ```javascript
   // ✅ Good - Pool for parallel processing
   puppeteer: {
     pool: {
       enabled: true,
       size: 5,              // 5 browsers
       maxPagesPerBrowser: 10 // 50 total pages
     }
   },
   queue: { concurrency: 50 } // Match capacity
   ```

3. **Set appropriate TTL for tasks**
   ```javascript
   // ✅ Good - Clean up stale tasks
   ttl: {
     queue: {
       ttl: 3600,              // 1 hour
       onExpire: 'hard-delete'
     }
   }
   ```

4. **Use priority for important URLs**
   ```javascript
   // ✅ Good - Prioritize seed URLs
   await spider.enqueueTarget({ url: seedUrl, priority: 10 });
   await spider.enqueueTarget({ url: discoveredUrl, priority: 5 });
   ```

5. **Implement graceful shutdown**
   ```javascript
   // ✅ Good - Clean shutdown
   process.on('SIGTERM', async () => {
     await spider.stopProcessing();
     await db.disconnect();
   });
   ```

---

### Don'ts ❌

1. **Don't forget to handle errors**
   ```javascript
   // ❌ Bad - Unhandled errors crash worker
   processor: async (task, ctx, { puppeteer }) => {
     const page = await puppeteer.open(task.url);
     return await page.evaluate(() => document.title);
   }

   // ✅ Correct - Handle errors gracefully
   processor: async (task, ctx, { puppeteer }) => {
     try {
       const page = await puppeteer.open(task.url);
       const title = await page.evaluate(() => document.title);
       await page.close();
       return { title };
     } catch (error) {
       ctx.logger.error({ url: task.url, error: error.message });
       throw error; // Let queue retry
     }
   }
   ```

2. **Don't use autoStart without processor**
   ```javascript
   // ❌ Bad - autoStart with no processor
   new SpiderPlugin({
     queue: { autoStart: true }  // Will throw error!
   })

   // ✅ Correct - Provide processor or use manual start
   new SpiderPlugin({
     queue: { autoStart: false },
     processor: async (task, ctx, helpers) => { /* ... */ }
   })
   ```

3. **Don't exceed concurrency without pooling**
   ```javascript
   // ❌ Bad - High concurrency without pool
   queue: { concurrency: 50 },
   puppeteer: { pool: { enabled: false } } // Only 1 browser!

   // ✅ Correct - Match concurrency to pool size
   queue: { concurrency: 50 },
   puppeteer: {
     pool: { enabled: true, size: 10, maxPagesPerBrowser: 5 }
   }
   ```

4. **Don't ignore queue stats**
   ```javascript
   // ❌ Bad - Enqueue without monitoring
   for (let i = 0; i < 10000; i++) {
     await spider.enqueueTarget({ url: urls[i] });
   }

   // ✅ Correct - Monitor queue depth
   const stats = await spider.queuePlugin.getStats();
   if (stats.pending < 100) {
     await spider.enqueueTarget({ url: nextUrl });
   }
   ```

5. **Don't mix namespace across workers**
   ```javascript
   // ❌ Bad - Different namespaces won't share queue
   // Worker 1
   new SpiderPlugin({ namespace: 'crawler-1' })

   // Worker 2
   new SpiderPlugin({ namespace: 'crawler-2' })

   // ✅ Correct - Same namespace, different worker IDs
   // Worker 1
   new SpiderPlugin({ namespace: 'crawler', queue: { workerId: 'w1' } })

   // Worker 2
   new SpiderPlugin({ namespace: 'crawler', queue: { workerId: 'w2' } })
   ```

---

### Performance Tips

- **Batch enqueue**: Enqueue multiple URLs in parallel
- **Tune concurrency**: Match queue concurrency to browser pool capacity
- **Use headless mode**: 2-3x faster than headed browsers
- **Enable pooling**: Reuse browsers across pages for 10x speedup
- **Set reasonable timeouts**: Avoid hanging on slow pages

---

### Security Considerations

- **Sanitize URLs**: Validate URLs before enqueueing
- **Limit recursion depth**: Prevent infinite crawling loops
- **Set max retries**: Avoid retry storms on broken sites
- **Use TTL**: Clean up stale/zombie tasks automatically
- **Validate extracted data**: Don't trust page content blindly

---

## 🚨 Error Handling

### Common Errors

#### Error 1: `Processor function is missing`

**Problem**: Attempted to start processing without setting a processor.

**Solution:**
```javascript
// ❌ Bad
const spider = new SpiderPlugin({ namespace: 'test' });
await spider.startProcessing(); // Error!

// ✅ Good - Set processor first
spider.setProcessor(async (task, ctx, helpers) => { /* ... */ });
await spider.startProcessing();

// ✅ Better - Provide processor in constructor
const spider = new SpiderPlugin({
  namespace: 'test',
  processor: async (task, ctx, helpers) => { /* ... */ }
});
await spider.startProcessing();
```

---

#### Error 2: `Resource not found`

**Problem**: Targets resource doesn't exist.

**Diagnosis:**
1. Check if `initialize()` was called
2. Verify namespace is correct
3. Check if resource was created manually

**Fix:**
```javascript
// SpiderPlugin auto-creates resources during initialize()
await db.usePlugin(spider); // Calls initialize()
await db.connect();

// Verify resource exists
const resources = await db.listResources();
console.log('Available:', resources.map(r => r.name));
```

---

#### Error 3: `Browser pool exhausted`

**Problem**: All browser instances are busy.

**Diagnosis:**
1. Check `puppeteer.pool.size` vs `queue.concurrency`
2. Look for unclosed pages
3. Check if browsers are crashing

**Fix:**
```javascript
// ✅ Increase pool size
puppeteer: {
  pool: {
    size: 10,              // More browsers
    maxPagesPerBrowser: 5  // 50 total capacity
  }
},
queue: { concurrency: 50 } // Match capacity

// ✅ Always close pages
processor: async (task, ctx, { puppeteer }) => {
  const page = await puppeteer.open(task.url);
  try {
    return await process(page);
  } finally {
    await page.close(); // Critical!
  }
}
```

---

#### Error 4: `TTL cleanup failed`

**Problem**: TTL plugin can't delete expired tasks.

**Diagnosis:**
1. Check S3 permissions
2. Verify TTL resource exists
3. Check TTL cohort partitions

**Fix:**
```javascript
// Ensure S3 permissions include DeleteObject
// Verify TTL is properly configured
ttl: {
  queue: {
    ttl: 3600,
    onExpire: 'hard-delete', // Requires delete permissions
    checkInterval: 300
  }
}
```

---

### Troubleshooting

#### Issue 1: Slow Crawling Performance

**Diagnosis:**
1. Check `queue.concurrency` setting
2. Verify browser pool is enabled
3. Monitor CPU/memory usage

**Fix:**
```javascript
// Increase parallelism
queue: { concurrency: 20 },
puppeteer: {
  pool: { enabled: true, size: 5, maxPagesPerBrowser: 4 }
}

// Use headless mode
puppeteer: {
  launchOptions: { headless: true }
}
```

---

#### Issue 2: Memory Leaks

**Diagnosis:**
1. Monitor memory over time
2. Check for unclosed pages
3. Look for large data structures

**Fix:**
```javascript
// Always close pages
finally { await page.close(); }

// Disable browser cache
puppeteer: {
  launchOptions: {
    args: ['--disable-dev-shm-usage', '--disable-setuid-sandbox']
  }
}
```

---

#### Issue 3: Tasks Stuck in Processing

**Diagnosis:**
1. Check `queue.visibilityTimeout`
2. Look for infinite loops in processor
3. Check for unhandled promise rejections

**Fix:**
```javascript
// Set appropriate visibility timeout
queue: {
  visibilityTimeout: 60, // 1 minute
  maxRetries: 3          // Retry failed tasks
}

// Add timeout to processor
processor: async (task, ctx, helpers) => {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), 30000)
  );

  const work = async () => {
    const page = await helpers.puppeteer.open(task.url);
    // ... process
  };

  return Promise.race([work(), timeout]);
}
```

---

## 🎯 Activity System

The Activity System allows you to **selectively execute specific analyses** on each crawled URL instead of running everything. Choose what to do on each target—screenshots, security headers, SEO analysis, tech fingerprinting, performance metrics, or custom combinations.

### Why Use Activities?

✅ **Performance** - Skip unnecessary analyses, crawl faster
✅ **Cost Control** - Only capture what you need
✅ **Flexibility** - Different URLs can have different analysis sets
✅ **Composability** - Mix and match individual activities
✅ **Presets** - Use pre-defined combinations for common use cases

### Available Activities

Activities are organized into **6 categories**:

#### Visual (Screenshots)
- `screenshot_full` - Full page screenshot (scrollable)
- `screenshot_viewport` - Viewport-only screenshot (1920x1080)

#### Security (4 Header Analysis + Real-time)
- `security_headers` - HTTP security headers
- `security_csp` - Content Security Policy analysis
- `security_cors` - CORS configuration
- `security_tls` - TLS/SSL verification
- `security_console_logs` - Browser console logs
- `security_websockets` - WebSocket connections
- `security_captcha` - CAPTCHA detection
- `security_vulnerabilities` - Vulnerability scanning

#### SEO (7 Analyses)
- `seo_meta_tags` - Meta tags extraction
- `seo_opengraph` - OpenGraph tags
- `seo_twitter_card` - Twitter Card tags
- `seo_links_analysis` - Internal/external links
- `seo_content_analysis` - Content analysis
- `seo_accessibility` - WCAG accessibility
- `seo_heading_structure` - Heading hierarchy

#### Technology (7 Detection Types)
- `tech_frameworks` - Frameworks (React, Vue, Angular, etc.)
- `tech_analytics` - Analytics platforms
- `tech_marketing` - Marketing pixels
- `tech_cdn` - CDN providers
- `tech_web_server` - Web servers
- `tech_cms` - CMS platforms
- `tech_libraries` - JavaScript libraries

#### Performance (4 Metrics)
- `performance_core_web_vitals` - LCP, FID, CLS
- `performance_navigation_timing` - Page load timing
- `performance_resource_timing` - Individual resource timing
- `performance_memory` - Memory usage

#### Assets (5 Types)
- `assets_css` - CSS analysis
- `assets_javascript` - JavaScript analysis
- `assets_images` - Image analysis
- `assets_videos` - Video analysis
- `assets_audios` - Audio analysis

#### Storage (3 Activities)
- `storage_localstorage` - Extract all localStorage key-value pairs
- `storage_indexeddb` - Extract IndexedDB databases and structure
- `storage_sessionstorage` - Extract all sessionStorage key-value pairs

#### Content & Embeds (2 Activities)
- `content_iframes` - Analyze embedded iframes (categorize by type)
- `content_tracking_pixels` - Detect tracking pixels and analytics pixels

### Activity Presets

Use presets for quick, pre-configured activity combinations:

```javascript
// Minimal - only basic data (fast & lightweight)
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'minimal'
  // Equivalent to: ['screenshot_viewport', 'tech_frameworks', 'seo_meta_tags']
});

// Basic - standard crawl with SEO and tech
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'basic'
  // Equivalent to: screenshot_full, SEO (3 types), tech (3 types)
});

// Security - focused on security analysis
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'security'
  // All security_* activities
});

// SEO Complete - all SEO-related activities
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'seo_complete'
  // All seo_* activities
});

// Performance - all performance metrics
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'performance'
  // All performance_* activities
});

// Full - all available activities (default)
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'full'
  // Equivalent to default behavior
});

// Reconnaissance - deep analysis including storage and tracking
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'reconnaissance'
  // 19 activities: screenshots, security, SEO, tech, iframes, tracking pixels, storage
});
```

### Custom Activity Lists

Choose specific activities by name:

```javascript
// Security + SEO + Screenshots
await spider.enqueueTarget({
  url: 'https://example.com',
  activities: [
    'screenshot_full',
    'screenshot_viewport',
    'security_headers',
    'security_csp',
    'security_cors',
    'seo_meta_tags',
    'seo_opengraph',
    'seo_twitter_card'
  ]
});

// Tech detection only
await spider.enqueueTarget({
  url: 'https://example.com',
  activities: [
    'tech_frameworks',
    'tech_analytics',
    'tech_cdn',
    'tech_web_server'
  ]
});

// Screenshot + Core Web Vitals
await spider.enqueueTarget({
  url: 'https://example.com',
  activities: [
    'screenshot_full',
    'performance_core_web_vitals',
    'performance_memory'
  ]
});
```

### Batch Enqueue with Default Activities

Set default activities for all targets in a batch:

```javascript
// All targets use 'basic' preset
const results = await spider.enqueueBatch(
  [
    { url: 'https://example.com' },
    { url: 'https://example.com/about' },
    { url: 'https://example.com/blog' }
  ],
  { activityPreset: 'basic' }
);

// Mixed: default preset + target-specific overrides
const results = await spider.enqueueBatch(
  [
    { url: 'https://example.com', activityPreset: 'security' }, // Override
    { url: 'https://example.com/about' }, // Use default
    { url: 'https://example.com/blog', activities: ['screenshot_viewport'] } // Override
  ],
  { activityPreset: 'basic' } // Default for all
);
```

### Activity API Methods

Query available activities at runtime:

```javascript
// Get all activities
const all = spider.getAvailableActivities();
// Returns: [ { name: 'screenshot_full', label: 'Full Page Screenshot', ... }, ... ]

// Get activities by category
const security = spider.getActivitiesByCategory('security');
// Returns: Array of all security_* activities

// Get categories with nested activities
const categories = spider.getActivityCategories();
// Returns: { visual: { name: 'visual', label: '...', activities: [...] }, ... }

// Get all presets
const presets = spider.getActivityPresets();
// Returns: { minimal: { ... }, basic: { ... }, ... }

// Get specific preset
const basicPreset = spider.getPresetByName('basic');
// Returns: { name: 'basic', label: '...', activities: [...] }

// Validate activity list
const validation = spider.validateActivityList(['screenshot_full', 'seo_meta_tags']);
// Returns: { valid: true, invalid: [] }

const invalid = spider.validateActivityList(['screenshot_full', 'invalid_activity']);
// Returns: { valid: false, invalid: ['invalid_activity'] }
```

### Activity Execution Logic

During queue processing, **only requested activities are executed**:

```javascript
// This target will only run:
// - Screenshot capture
// - Tech detection
// - SEO analysis
// ❌ Security analysis will be SKIPPED (not in activities)
await spider.enqueueTarget({
  url: 'https://example.com',
  activities: ['screenshot_full', 'tech_frameworks', 'seo_meta_tags']
});

// This target runs EVERYTHING (no activities specified = default to 'full' preset)
await spider.enqueueTarget({
  url: 'https://example.com'
  // Same as: activities: [...all 40+ activities...]
});
```

The processor checks `task.activities` and conditionally executes:

```
if task.activities is empty or includes visual_* activities
  → Run screenshot capture

if task.activities is empty or includes seo_* activities
  → Run SEO analysis

if task.activities is empty or includes security_* activities
  → Run security analysis

if task.activities is empty or includes technology_* activities
  → Run tech fingerprinting

if task.activities is empty or includes performance_* activities
  → Run performance metrics collection

if task.activities is empty or includes assets_* activities
  → Run asset analysis
```

---

## 🔗 See Also

### Related Plugins
- **[Puppeteer Plugin](./puppeteer/README.md)** - Browser automation, pooling, proxy configuration, anti-bot detection
- **[Cookie Farm Plugin](./cookie-farm/README.md)** - Automated cookie farming and persona management for anti-bot evasion

### Supporting Plugins
- [S3 Queue Plugin](./s3-queue/) - Distributed queue implementation
- [TTL Plugin](./ttl/) - TTL management and automatic cleanup

### Examples
- [Example: e30-spider-basic.js](../examples/e30-spider-basic.js) - Basic spider example
- [Example: e31-spider-distributed.js](../examples/e31-spider-distributed.js) - Multi-worker setup

---

## ❓ FAQ

### General

**Q: What is SpiderPlugin and when should I use it?**

A: SpiderPlugin is a **meta-plugin** that bundles PuppeteerPlugin, S3QueuePlugin, and TTLPlugin under one namespace for web crawling. Use it when you need:

- Distributed web scraping across multiple workers
- Browser automation with queueing
- Automatic cleanup of stale crawl tasks
- Simplified setup (100+ lines of boilerplate → 10 lines)

**Don't use it if:**
- You only need browser automation (use PuppeteerPlugin alone)
- You don't need distributed processing (use Puppeteer directly)
- You're not crawling the web (use appropriate plugin)

```javascript
// ✅ Perfect for SpiderPlugin
// - Multi-page crawling
// - Distributed workers
// - Queue management needed
const spider = new SpiderPlugin({
  namespace: 'crawler',
  queue: { autoStart: true, concurrency: 10 }
});

// ❌ Overkill for SpiderPlugin
// - Single page scraping
// - One-off automation
// Use PuppeteerPlugin alone instead
```

---

**Q: How is SpiderPlugin different from PuppeteerPlugin?**

A: SpiderPlugin **includes** PuppeteerPlugin plus adds queuing and TTL:

| Feature | PuppeteerPlugin | SpiderPlugin |
|---------|----------------|--------------|
| Browser automation | ✅ Yes | ✅ Yes |
| Distributed queue | ❌ No | ✅ Yes (S3Queue) |
| TTL cleanup | ❌ No | ✅ Yes (optional) |
| Setup complexity | Low | Very Low |
| Use case | Single worker | Multi-worker |

**Example comparison:**
```javascript
// PuppeteerPlugin alone (manual queue setup)
await db.usePlugin(new PuppeteerPlugin({ namespace: 'pup' }));
await db.usePlugin(new S3QueuePlugin({ resource: 'tasks' }));
// ... wire them together manually (30+ lines)

// SpiderPlugin (automatic)
await db.usePlugin(new SpiderPlugin({ namespace: 'spider' }));
// Everything wired and ready!
```

---

**Q: Can I use SpiderPlugin without TTL?**

A: **Yes!** TTL is completely optional:

```javascript
// Without TTL
const spider = new SpiderPlugin({
  namespace: 'crawler',
  queue: { autoStart: true }
  // No ttl config = TTLPlugin not installed
});

// With TTL
const spider = new SpiderPlugin({
  namespace: 'crawler',
  queue: { autoStart: true },
  ttl: { queue: { ttl: 3600 } } // Enables TTL cleanup
});
```

**When to use TTL:**
- ✅ Long-running crawls (prevent zombie tasks)
- ✅ Tasks with expiration dates
- ✅ Retry limits reached (clean up failures)

**When to skip TTL:**
- ❌ Short-lived crawls (< 1 hour)
- ❌ All tasks must complete (no expiration)
- ❌ Manual cleanup preferred

---

**Q: How do I scale SpiderPlugin horizontally?**

A: Run multiple workers with the **same namespace** but **different worker IDs**:

**Worker 1:**
```javascript
const spider = new SpiderPlugin({
  namespace: 'distributed',
  queue: { workerId: 'worker-1', concurrency: 5 }
});
```

**Worker 2:**
```javascript
const spider = new SpiderPlugin({
  namespace: 'distributed',
  queue: { workerId: 'worker-2', concurrency: 5 }
});
```

**Worker 3:**
```javascript
const spider = new SpiderPlugin({
  namespace: 'distributed',
  queue: { workerId: 'worker-3', concurrency: 5 }
});
```

All three workers share the same queue (`distributed_targets`) and process tasks in parallel. S3Queue handles distributed locking automatically.

**Coordinator (optional):**
```javascript
// Enqueue jobs without processing
const db = new Database({ connectionString: 's3://...' });
await db.connect();

const resource = await db.getResource('distributed_targets');
for (const url of urls) {
  await resource.enqueue({ url });
}
```

---

### Configuration

**Q: What's the difference between `queue.concurrency` and `puppeteer.pool.size`?**

A: They control different aspects:

- **`queue.concurrency`**: How many tasks process **simultaneously**
- **`puppeteer.pool.size`**: How many **browser instances** exist

**Rule of thumb:**
```javascript
// queue.concurrency <= (pool.size × maxPagesPerBrowser)

// ✅ Good - Concurrency matches capacity
queue: { concurrency: 20 },
puppeteer: {
  pool: { size: 5, maxPagesPerBrowser: 4 } // 5 × 4 = 20 capacity
}

// ❌ Bad - Concurrency exceeds capacity
queue: { concurrency: 50 },
puppeteer: {
  pool: { size: 2, maxPagesPerBrowser: 5 } // 2 × 5 = 10 capacity
}
// 40 workers will be blocked waiting for browsers!
```

---

**Q: Should I use `autoStart: true` or start manually?**

A: Depends on your setup:

**Use `autoStart: true`** when:
- Processor is provided in constructor
- Simple single-worker setup
- Want immediate processing

```javascript
// ✅ AutoStart - Simple setup
const spider = new SpiderPlugin({
  namespace: 'simple',
  queue: { autoStart: true },
  processor: async (task, ctx, helpers) => { /* ... */ }
});
// Starts processing immediately after usePlugin()
```

**Use `autoStart: false`** (manual) when:
- Setting processor dynamically
- Coordinating multiple workers
- Need to enqueue seed URLs first

```javascript
// ✅ Manual start - More control
const spider = new SpiderPlugin({
  namespace: 'controlled',
  queue: { autoStart: false }
});

await db.usePlugin(spider);
await db.connect();

// Enqueue seed URLs first
await spider.enqueueTarget({ url: 'https://example.com' });

// Set processor
spider.setProcessor(async (task, ctx, helpers) => { /* ... */ });

// Start when ready
await spider.startProcessing();
```

---

**Q: How do I change concurrency at runtime?**

A: Use `startProcessing()` with override:

```javascript
// Initial concurrency: 5
const spider = new SpiderPlugin({
  namespace: 'dynamic',
  queue: { concurrency: 5 }
});

// Later - increase concurrency
await spider.stopProcessing();
await spider.startProcessing({ concurrency: 10 });

// Or change via setProcessor
spider.setProcessor(
  async (task, ctx, helpers) => { /* ... */ },
  { concurrency: 15, autoStart: true }
);
```

---

### Queue Management

**Q: How do I check queue status?**

A: Use `queuePlugin.getStats()`:

```javascript
const stats = await spider.queuePlugin.getStats();

console.log({
  pending: stats.pending,        // Tasks waiting
  processing: stats.processing,  // Tasks in progress
  completed: stats.completed,    // Tasks finished
  failed: stats.failed          // Tasks that failed
});

// Or access resource directly
const resource = await db.getResource(`${spider.namespace}_targets`);
const allTasks = await resource.query({});
console.log(`Total tasks: ${allTasks.length}`);
```

---

**Q: How do I implement priority queuing?**

A: Use the `priority` field when enqueueing:

```javascript
// Higher priority = processed sooner
await spider.enqueueTarget({ url: 'https://important.com', priority: 10 });
await spider.enqueueTarget({ url: 'https://normal.com', priority: 5 });
await spider.enqueueTarget({ url: 'https://low.com', priority: 1 });

// S3Queue processes in priority order
// Order: important.com → normal.com → low.com
```

---

**Q: How do I prevent duplicate URLs from being crawled?**

A: Check before enqueueing:

```javascript
// Method 1: Query resource before enqueue
processor: async (task, ctx, { enqueue, resource }) => {
  const links = await extractLinks(task.url);

  for (const link of links) {
    // Check if already exists
    const existing = await resource.query({ url: link });
    if (existing.length === 0) {
      await enqueue({ url: link });
    }
  }
}

// Method 2: Use metadata to track visited
const visited = new Set();

processor: async (task, ctx, { enqueue }) => {
  const links = await extractLinks(task.url);

  for (const link of links) {
    if (!visited.has(link)) {
      visited.add(link);
      await enqueue({ url: link });
    }
  }
}
```

---

**Q: How do I handle rate limiting?**

A: Implement delays and retry logic:

```javascript
processor: async (task, ctx, { puppeteer }) => {
  try {
    const page = await puppeteer.open(task.url);
    const data = await extractData(page);
    await page.close();

    // Add delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));

    return data;
  } catch (error) {
    if (error.message.includes('429')) {
      // Rate limited - throw to trigger retry
      ctx.logger.warn('Rate limited, retrying...');
      throw error; // Queue will retry with backoff
    }
    throw error;
  }
}
```

---

### Browser & Performance

**Q: How many browsers should I run?**

A: Depends on your resources:

**General formula:**
```
pool.size = ceil(queue.concurrency / maxPagesPerBrowser)
```

**Examples:**

| Concurrency | Pages/Browser | Pool Size | Total Capacity |
|-------------|---------------|-----------|----------------|
| 10 | 5 | 2 | 10 |
| 50 | 10 | 5 | 50 |
| 100 | 5 | 20 | 100 |

**Resource constraints:**
- **CPU**: Each browser ≈ 1-2 cores (headless)
- **Memory**: Each browser ≈ 100-500MB
- **Disk**: Each browser ≈ 200MB (cache)

**Example for 4-core machine:**
```javascript
puppeteer: {
  pool: {
    size: 2,              // 2 browsers × 2 cores = 4 cores
    maxPagesPerBrowser: 5 // 10 total pages
  }
},
queue: { concurrency: 10 }
```

---

**Q: Should I use headless or headed browsers?**

A: Almost always **headless**:

| Mode | Speed | Resources | Use Case |
|------|-------|-----------|----------|
| Headless | 2-3x faster | Low memory | Production |
| Headed | Slower | High memory | Debugging |

```javascript
// ✅ Production - Headless
puppeteer: {
  launchOptions: { headless: true }
}

// 🐛 Development - Headed for debugging
puppeteer: {
  launchOptions: {
    headless: false,
    devtools: true
  }
}
```

---

**Q: How do I optimize crawling speed?**

A: Multiple strategies:

**1. Increase parallelism:**
```javascript
queue: { concurrency: 50 },
puppeteer: {
  pool: { size: 10, maxPagesPerBrowser: 5 }
}
```

**2. Disable unnecessary features:**
```javascript
puppeteer: {
  launchOptions: {
    args: [
      '--disable-images',       // Don't load images
      '--disable-javascript',   // If JS not needed
      '--disable-setuid-sandbox'
    ]
  }
}
```

**3. Use waitUntil wisely:**
```javascript
processor: async (task, ctx, { puppeteer }) => {
  // ❌ Slow - Wait for everything
  const page = await puppeteer.open(task.url, {
    waitUntil: 'networkidle0' // Wait for ALL network idle
  });

  // ✅ Fast - Wait for DOM only
  const page = await puppeteer.open(task.url, {
    waitUntil: 'domcontentloaded' // DOM ready, skip images
  });
}
```

**4. Reuse pages when possible:**
```javascript
processor: async (task, ctx, { puppeteer }) => {
  const page = await puppeteer.open(task.url);

  // Extract multiple things without reopening
  const title = await page.title();
  const links = await page.$$eval('a', els => els.map(a => a.href));
  const meta = await page.$eval('meta', el => el.content);

  await page.close();
  return { title, links, meta };
}
```

---

### Error Handling & Debugging

**Q: How do I debug processor errors?**

A: Add comprehensive logging:

```javascript
processor: async (task, ctx, { puppeteer }) => {
  ctx.logger.info(`[START] ${task.url}`);
  const startTime = Date.now();

  try {
    const page = await puppeteer.open(task.url);
    ctx.logger.debug(`[OPENED] ${task.url}`);

    const data = await page.evaluate(() => ({
      title: document.title
    }));
    ctx.logger.debug(`[EXTRACTED] ${task.url}`, { data });

    await page.close();
    ctx.logger.info(`[SUCCESS] ${task.url} (${Date.now() - startTime}ms)`);

    return data;
  } catch (error) {
    ctx.logger.error(`[ERROR] ${task.url}`, {
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime
    });
    throw error;
  }
}
```

---

**Q: What happens when a task fails?**

A: S3Queue retries based on `maxRetries`:

1. Task fails → retry count increments
2. If `retryCount < maxRetries` → task re-queued with delay
3. If `retryCount >= maxRetries` → task marked as failed

```javascript
queue: {
  maxRetries: 3,      // Retry up to 3 times
  retryDelay: 1000    // Wait 1s between retries
}

// Monitor failures
spider.queuePlugin.on('queue.task.error', ({ taskId, error, retryCount }) => {
  console.log(`Task ${taskId} failed (attempt ${retryCount}): ${error.message}`);
});

spider.queuePlugin.on('queue.task.failed', ({ taskId, error }) => {
  console.log(`Task ${taskId} permanently failed after max retries`);
  // Handle permanent failures (e.g., log to error resource)
});
```

---

**Q: How do I handle timeouts?**

A: Set timeouts at multiple levels:

```javascript
// 1. Browser launch timeout
puppeteer: {
  pool: { launchTimeout: 30000 } // 30s to launch browser
}

// 2. Page load timeout
processor: async (task, ctx, { puppeteer }) => {
  const page = await puppeteer.open(task.url, {
    timeout: 15000 // 15s to load page
  });
}

// 3. Overall task timeout
processor: async (task, ctx, { puppeteer }) => {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Task timeout')), 30000)
  );

  const work = async () => {
    const page = await puppeteer.open(task.url);
    const data = await page.evaluate(() => ({ title: document.title }));
    await page.close();
    return data;
  };

  return Promise.race([work(), timeout]);
}
```

---

### Advanced Usage

**Q: Can I crawl sites requiring authentication?**

A: Yes, use cookies or credentials:

```javascript
processor: async (task, ctx, { puppeteer }) => {
  const page = await puppeteer.open('https://example.com/login');

  // Method 1: Fill login form
  await page.type('#username', 'user');
  await page.type('#password', 'pass');
  await page.click('button[type="submit"]');
  await page.waitForNavigation();

  // Method 2: Set cookies directly
  await page.setCookie({
    name: 'sessionId',
    value: 'abc123',
    domain: 'example.com'
  });

  // Now navigate to protected page
  await page.goto(task.url);
  const data = await extractData(page);
  await page.close();

  return data;
}
```

---

**Q: How do I extract data from infinite scroll pages?**

A: Scroll programmatically:

```javascript
processor: async (task, ctx, { puppeteer }) => {
  const page = await puppeteer.open(task.url);

  let items = [];
  let previousHeight = 0;

  while (true) {
    // Extract current items
    const newItems = await page.$$eval('.item', els =>
      els.map(el => ({ title: el.textContent }))
    );
    items.push(...newItems);

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if more content loaded
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    if (currentHeight === previousHeight) break; // No more content
    previousHeight = currentHeight;
  }

  await page.close();
  return { url: task.url, items };
}
```

---

**Q: Can I take screenshots during crawling?**

A: Yes, use `page.screenshot()`:

```javascript
processor: async (task, ctx, { puppeteer }) => {
  const page = await puppeteer.open(task.url);

  // Take screenshot
  const screenshot = await page.screenshot({
    fullPage: true,
    type: 'png'
  });

  // Upload to S3
  const key = `screenshots/${task.url.replace(/[^a-z0-9]/gi, '_')}.png`;
  await ctx.db.client.putObject({
    bucket: ctx.db.bucket,
    key,
    body: screenshot
  });

  await page.close();
  return { url: task.url, screenshot: key };
}
```

---

**Q: How do I implement breadth-first vs depth-first crawling?**

A: Control via priorities:

**Breadth-first** (same priority for all):
```javascript
processor: async (task, ctx, { puppeteer, enqueue }) => {
  const page = await puppeteer.open(task.url);
  const links = await extractLinks(page);
  await page.close();

  // All links same priority = breadth-first
  for (const link of links) {
    await enqueue({ url: link, priority: 5 });
  }
}
```

**Depth-first** (higher priority for child links):
```javascript
processor: async (task, ctx, { puppeteer, enqueue }) => {
  const page = await puppeteer.open(task.url);
  const links = await extractLinks(page);
  await page.close();

  // Child links get higher priority = depth-first
  const childPriority = (task.priority || 5) + 1;
  for (const link of links) {
    await enqueue({ url: link, priority: childPriority });
  }
}
```

---

### Troubleshooting

**Q: Why are my workers not processing tasks?**

A: Check these common issues:

1. **No processor set**:
   ```javascript
   // ❌ Forgot to set processor
   const spider = new SpiderPlugin({ namespace: 'test' });
   await spider.startProcessing(); // Error!

   // ✅ Set processor first
   spider.setProcessor(async (task, ctx, helpers) => { /* ... */ });
   ```

2. **autoStart without processor**:
   ```javascript
   // ❌ autoStart with no processor
   new SpiderPlugin({ queue: { autoStart: true } }); // Error!

   // ✅ Provide processor
   new SpiderPlugin({
     queue: { autoStart: true },
     processor: async (task, ctx, helpers) => { /* ... */ }
   });
   ```

3. **Queue empty**:
   ```javascript
   // No tasks in queue!
   await spider.enqueueTarget({ url: 'https://example.com' });
   ```

4. **Processing not started**:
   ```javascript
   await spider.startProcessing(); // Don't forget this!
   ```

---

**Q: Why is memory usage increasing?**

A: Common causes:

1. **Unclosed pages**:
   ```javascript
   // ✅ Always close pages
   try {
     const page = await puppeteer.open(task.url);
     return await process(page);
   } finally {
     await page.close(); // Critical!
   }
   ```

2. **Large data in memory**:
   ```javascript
   // Store in S3, not memory
   const screenshot = await page.screenshot({ fullPage: true });

   // ❌ Don't store in task result
   return { screenshot }; // Can be huge!

   // ✅ Upload to S3, return key only
   const key = `screenshots/${taskId}.png`;
   await uploadToS3(key, screenshot);
   return { screenshotKey: key };
   ```

3. **Too many browsers**:
   ```javascript
   // Reduce pool size
   puppeteer: {
     pool: { size: 3 } // Instead of 10
   }
   ```

---

**Q: Tasks are timing out - what should I do?**

A: Increase timeouts and optimize selectors:

```javascript
// 1. Increase page load timeout
processor: async (task, ctx, { puppeteer }) => {
  const page = await puppeteer.open(task.url, {
    timeout: 60000 // 60 seconds
  });
}

// 2. Use faster waitUntil
const page = await puppeteer.open(task.url, {
  waitUntil: 'domcontentloaded' // Instead of 'networkidle0'
});

// 3. Add timeout to specific operations
await page.waitForSelector('.content', { timeout: 10000 });
```

---

### Activities

**Q: What is the Activity System and why should I use it?**

A: The Activity System lets you **choose which analyses to run** on each crawled URL. Instead of always running everything (screenshots, security, SEO, tech detection, performance), you can:

- Pick specific activities (e.g., only screenshots + tech detection)
- Use presets for common combinations (minimal, basic, security, seo_complete, performance, full)
- Optimize for speed: skip unnecessary analyses
- Optimize for cost: only capture what you need

```javascript
// ❌ Without activities: ALWAYS runs everything
await spider.enqueueTarget({ url: 'https://example.com' });
// Executes: screenshot_full, security_*, seo_*, tech_*, performance_*, assets_*

// ✅ With activities: only run what you need
await spider.enqueueTarget({
  url: 'https://example.com',
  activities: ['screenshot_viewport', 'tech_frameworks', 'seo_meta_tags']
});
// Executes: screenshot_viewport, tech_frameworks, seo_meta_tags only
// Skips: All other analyses
```

---

**Q: What's the difference between `activities` and `activityPreset`?**

A: Both control what executes, but used differently:

| Feature | `activities` | `activityPreset` |
|---------|------------|-----------------|
| Type | Array of activity names | String (preset name) |
| Values | `['screenshot_full', 'seo_meta_tags', ...]` | `'minimal'`, `'basic'`, `'security'`, etc. |
| When to use | Custom combinations | Quick selections |
| Flexibility | High (any combination) | Lower (predefined) |

```javascript
// Custom combination with activities
await spider.enqueueTarget({
  url: 'https://example.com',
  activities: ['screenshot_full', 'security_headers', 'seo_opengraph']
});

// Quick selection with preset
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'security' // All security_* activities
});

// If you provide both, activities takes precedence
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'basic', // Ignored
  activities: ['screenshot_viewport'] // Used instead
});
```

---

**Q: How many activities are available?**

A: **40+ activities** organized into **6 categories**:

| Category | Count | Examples |
|----------|-------|----------|
| Visual | 2 | screenshot_full, screenshot_viewport |
| Security | 8 | security_headers, security_csp, security_cors, security_tls, security_console_logs, security_websockets, security_captcha, security_vulnerabilities |
| SEO | 7 | seo_meta_tags, seo_opengraph, seo_twitter_card, seo_links_analysis, seo_content_analysis, seo_accessibility, seo_heading_structure |
| Technology | 7 | tech_frameworks, tech_analytics, tech_marketing, tech_cdn, tech_web_server, tech_cms, tech_libraries |
| Performance | 4 | performance_core_web_vitals, performance_navigation_timing, performance_resource_timing, performance_memory |
| Assets | 5 | assets_css, assets_javascript, assets_images, assets_videos, assets_audios |

Use `spider.getAvailableActivities()` to list all at runtime.

---

**Q: What are the activity presets and when should I use each?**

A: Presets are pre-configured combinations for common use cases:

| Preset | Best For | Activities |
|--------|----------|-----------|
| `minimal` | Speed (fast baseline) | screenshot_viewport, tech_frameworks, seo_meta_tags |
| `basic` | General crawling | screenshot_full, SEO (3), tech (3) |
| `security` | Security audits | All security_* activities |
| `seo_complete` | SEO analysis | All seo_* activities |
| `performance` | Performance testing | All performance_* activities |
| `full` | Complete analysis (default) | All 40+ activities |

```javascript
// Fast lightweight crawl
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'minimal' // 3 activities
});

// Standard crawl
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'basic' // ~9 activities
});

// Security-focused
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'security' // 8 activities
});

// No preset = default to 'full' (all activities)
await spider.enqueueTarget({
  url: 'https://example.com'
  // Same as activityPreset: 'full'
});
```

---

**Q: Can I set default activities for all targets in a batch?**

A: **Yes!** Use the second parameter of `enqueueBatch()`:

```javascript
// All use 'basic' preset
const results = await spider.enqueueBatch(
  [
    { url: 'https://example.com' },
    { url: 'https://example.com/about' },
    { url: 'https://example.com/blog' }
  ],
  { activityPreset: 'basic' } // Default for all
);

// Can also override per-target
const results = await spider.enqueueBatch(
  [
    { url: 'https://example.com', activityPreset: 'security' }, // Override
    { url: 'https://example.com/about' }, // Use default
    { url: 'https://example.com/blog', activities: ['screenshot_viewport'] } // Override
  ],
  { activityPreset: 'basic' } // Default
);
```

---

**Q: How do I validate activity names before queueing?**

A: Use `validateActivityList()` to check activity names:

```javascript
// Valid
const validation = spider.validateActivityList([
  'screenshot_full',
  'seo_meta_tags',
  'security_headers'
]);
// Result: { valid: true, invalid: [] }

// Invalid
const validation = spider.validateActivityList([
  'screenshot_full',
  'invalid_activity_name'
]);
// Result: { valid: false, invalid: ['invalid_activity_name'] }

// Use in try-catch
try {
  const validation = spider.validateActivityList(userActivities);
  if (!validation.valid) {
    throw new Error(`Invalid activities: ${validation.invalid.join(', ')}`);
  }
  await spider.enqueueTarget({ url, activities: userActivities });
} catch (error) {
  console.error(error);
}
```

---

**Q: How do I list all available activities programmatically?**

A: Use the activity query methods:

```javascript
// Get all activities
const allActivities = spider.getAvailableActivities();
allActivities.forEach(a => {
  console.log(`${a.name}: ${a.label}`);
});
// Output:
// screenshot_full: Full Page Screenshot
// screenshot_viewport: Viewport Screenshot
// ... 38 more

// Get activities by category
const securityActivities = spider.getActivitiesByCategory('security');
// Returns: [ security_headers, security_csp, security_cors, ... ]

// Get categories with nested activities
const categories = spider.getActivityCategories();
categories.security.activities.forEach(a => {
  console.log(`${a.name}: ${a.label}`);
});

// Get presets
const presets = spider.getActivityPresets();
Object.keys(presets).forEach(name => {
  console.log(`${name}: ${presets[name].label}`);
});
// Output:
// minimal: Minimal Crawl
// basic: Basic Crawl
// security: Security Audit
// ...
```

---

**Q: Do activities affect performance or cost?**

A: **Significantly!** Activities directly control what runs:

```javascript
// ✅ Fast (only 3 activities, ~5-10 seconds per URL)
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'minimal'
});

// ⚠️ Medium (basic analysis, ~15-30 seconds per URL)
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'basic'
});

// 🔴 Slow (comprehensive, ~60+ seconds per URL)
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'full'
});
```

**Cost optimization:**
- Screenshot only: ~1-2 sec, ~50KB per URL
- Security analysis: ~5-10 sec, depends on findings
- Full analysis: ~60+ sec, depends on content size

---

**Q: What happens if I don't specify activities?**

A: Defaults to the `'full'` preset (all 40+ activities):

```javascript
// These are equivalent:
await spider.enqueueTarget({ url: 'https://example.com' });

await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'full'
});

await spider.enqueueTarget({
  url: 'https://example.com',
  activities: ['screenshot_full', 'screenshot_viewport', 'security_headers', ...]
  // All 40+ activities
});
```

---

## FAQ - Storage & Content Activities

**Q: What's the difference between `storage_localstorage`, `storage_sessionstorage`, and `storage_indexeddb`?**

A: They capture different browser storage mechanisms:

- **`storage_localstorage`**: Persistent key-value pairs stored per domain, survives browser restart
- **`storage_sessionstorage`**: Session-only key-value pairs, cleared when tab closes
- **`storage_indexeddb`**: Large structured databases with object stores, indexes, and transactions

Example use cases:
```javascript
// Get all three storage types
await spider.enqueueTarget({
  url: 'https://example.com',
  activities: ['storage_localstorage', 'storage_sessionstorage', 'storage_indexeddb']
});
```

The results show item counts, data keys, and for IndexedDB: database version, object store names, and record counts.

---

**Q: Why would I capture browser storage data?**

A: Storage analysis reveals:

- **Authentication tokens** (stored in localStorage or sessionStorage)
- **User preferences and settings** (localStorage)
- **Cached data** (IndexedDB for offline-capable apps)
- **Application state** (session state in sessionStorage)
- **Analytics or tracking IDs** (persistent identifiers)
- **API credentials** (sometimes insecurely stored)
- **Feature flags and configuration** (cached from server)

This helps identify what data the application persists locally and how.

---

**Q: What does the `content_iframes` activity capture?**

A: It detects all embedded iframes on the page and categorizes them:

```javascript
{
  iframes: [
    {
      src: 'https://ads.example.com/frame',
      category: 'advertising',    // advertising, analytics, social, embedded_content, unknown
      title: 'Advertisement',
      name: 'ad_frame',
      sandbox: 'allow-scripts allow-same-origin',
      allow: 'payment *'
    },
    // ... more iframes
  ],
  totalCount: 5,
  categorized: {
    advertising: 2,
    analytics: 1,
    social: 1,
    embedded_content: 1,
    unknown: 0
  }
}
```

**Categories**:
- **advertising**: Ad networks (Google AdSense, AppNexus, etc.)
- **analytics**: Analytics platforms (Google Analytics, Mixpanel, etc.)
- **social**: Social media embeds (Facebook, Twitter, LinkedIn)
- **embedded_content**: Maps, videos, documents
- **unknown**: Unable to classify

---

**Q: What does the `content_tracking_pixels` activity detect?**

A: It finds tracking pixels and analytics tracking mechanisms:

```javascript
{
  trackingPixels: [
    {
      type: 'pixel',                    // pixel, script, html_attribute
      src: 'https://analytics.example.com/track.gif?id=123',
      service: 'Google Analytics',
      visible: false                    // Usually 1x1 and hidden
    },
    {
      type: 'script',
      src: 'https://cdn.segment.com/analytics.js',
      service: 'Segment'
    }
  ],
  detectedServices: ['Google Analytics', 'Facebook Pixel', 'LinkedIn Insight Tag'],
  totalCount: 8
}
```

**Tracked services** (30+): Google Analytics, Facebook Pixel, LinkedIn, Twitter, TikTok, HubSpot, Mixpanel, Amplitude, Segment, Hotjar, Crazy Egg, Mouseflow, FullStory, Drift, Intercom, Zendesk, Qualtrics, Google AdSense, AppNexus, Criteo, Rubicon, and more.

---

**Q: How is tracking detected? Can it be bypassed?**

A: Detection uses multiple methods:

1. **Pattern matching**: Known tracking pixel URLs and script sources
2. **IFrame categorization**: Analytics and advertising iframes
3. **Inline scripts**: gtag(), analytics.push() calls
4. **HTML attributes**: data-track, data-analytics, data-event attributes
5. **Common library detection**: Popular analytics library CDN URLs

**Limitations**:
- Can't detect obfuscated or custom analytics implementations
- May miss tracking if:
  - URLs are proxied or rewritten
  - Analytics loaded dynamically after page load
  - Custom tracking implementations
  - Encrypted or hidden in minified JavaScript

**Note**: Detection runs synchronously on initial page content. Server-side or dynamically-loaded tracking may not be detected.

---

**Q: What's the "reconnaissance" preset used for?**

A: It's a comprehensive data collection preset with 19 activities designed for deep security and infrastructure analysis:

```javascript
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'reconnaissance'  // Captures 19 key activities
});
```

**Activities included**:
- Visual: Full screenshot, viewport screenshot
- Security: Headers, SSL/TLS, CSP, DNS, security DNS records
- SEO: Page title, meta description, Open Graph, robots.txt
- Technology: Technology stack detection, JavaScript libs, frameworks
- Storage: localStorage, sessionStorage, IndexedDB
- Content: iframes, tracking pixels

**Use case**: Initial security assessment, compliance checks, third-party risk analysis.

**Performance**: ~30-45 seconds per URL (slower than minimal/basic presets, but comprehensive).

---

**Q: Can I combine storage and content activities with screenshots?**

A: Yes! Mix and match any activities:

```javascript
await spider.enqueueTarget({
  url: 'https://example.com',
  activities: [
    'screenshot_full',
    'screenshot_viewport',
    'storage_localstorage',
    'storage_indexeddb',
    'content_iframes',
    'content_tracking_pixels',
    'security_headers',
    'technology_stack'
  ]
});
```

This runs all 8 activities and returns aggregated results with both visual (screenshots) and data analysis (storage, content).

---

**Q: Where are storage and content activity results stored?**

A: Results are stored in separate resources:

- **`storageAnalysis` resource**: Storage data (localStorage, sessionStorage, IndexedDB)
- **`contentAnalysis` resource**: Content analysis (iframes, tracking pixels)
- Linked to the **`crawlResults` resource** via the task ID

Access results:
```javascript
const storageData = await spider.resource('storageAnalysis').get(taskId);
const contentData = await spider.resource('contentAnalysis').get(taskId);
```

---

**Q: Is capturing storage data safe? Privacy concerns?**

A: **Important considerations**:

1. **Only access your own sites** - Only crawl URLs you own or have permission to crawl
2. **Data sensitivity** - Storage may contain:
   - Authentication tokens
   - Personally identifiable information (PII)
   - Passwords or API keys (if insecurely stored)
3. **GDPR/Privacy compliance** - Ensure crawling complies with:
   - Site's Terms of Service
   - Privacy regulations (GDPR, CCPA, etc.)
   - User consent requirements
4. **Data retention** - Implement appropriate retention policies for captured storage data

**Best practice**: Use for security audits of your own applications, not for unauthorized data collection.

---

**Q: Why isn't my storage data being captured?**

A: Several reasons:

1. **Storage doesn't exist**: Page uses no localStorage/sessionStorage/IndexedDB
2. **Access denied**: CORS restrictions or same-origin policy prevents access
3. **Timing issue**: Storage populated after page fully loads
4. **Sandboxed iframes**: Content in sandboxed iframes can't be accessed from main page

**Debugging**:
```javascript
// Capture with debugging
const result = await spider.captureAllStorage(page);

if (!result.localStorage.present) {
  console.log('No localStorage data found');
}

if (result.indexedDB.databases.length === 0) {
  console.log('No IndexedDB databases detected');
}
```

---

**Q: How do I use storage data for debugging?**

A: Common debugging use cases:

```javascript
// Check for auth tokens
const token = storageData.localStorage.data['auth_token'];
if (token) console.log('Auth token found:', token.substring(0, 20) + '...');

// Find cached API responses
const apiCache = Object.keys(storageData.localStorage.data)
  .filter(key => key.includes('api_cache_'));

// Check user preferences
const preferences = storageData.localStorage.data['user_preferences'];
if (preferences) {
  const parsed = JSON.parse(preferences);
  console.log('Theme:', parsed.theme);
}

// Find IndexedDB stores
const dbStores = storageData.indexedDB.databases
  .flatMap(db => db.stores)
  .map(store => store.name);
```

---

**Q: Which tracking services are detected?**

A: The plugin detects 30+ major tracking services:

**Analytics**:
- Google Analytics, Google Tag Manager
- Mixpanel, Amplitude, Segment
- Hotjar, Crazy Egg, Mouseflow, FullStory

**Marketing & Social**:
- Facebook Pixel, LinkedIn Insight Tag
- Twitter/X Pixel, TikTok Pixel
- Pinterest Tag, Snapchat Pixel

**Customer Intelligence**:
- HubSpot, Drift, Intercom
- Zendesk, Qualtrics
- VWO (Visual Website Optimizer)

**Ad Networks**:
- Google AdSense, AppNexus
- Criteo, Rubicon Project
- OpenX, AdRoll/RollWorks

**Other**:
- Sentry (error tracking)
- New Relic (monitoring)
- Datadog (monitoring)
- Many more via pattern matching

---

**Q: Can I exclude certain activities to improve performance?**

A: Yes, use the `'minimal'` preset or specify only needed activities:

```javascript
// Minimal - fastest, visual only
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'minimal'  // ~5-10 seconds
});

// Custom - only what you need
await spider.enqueueTarget({
  url: 'https://example.com',
  activities: [
    'screenshot_viewport',
    'storage_localstorage',
    'content_iframes'
  ]
  // ~15-20 seconds, custom selection
});

// Basic - balanced
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'basic'  // ~15-25 seconds
});
```

**Performance by preset**:
- `minimal`: ~5-10 seconds (visual only)
- `basic`: ~15-25 seconds (visual + headers + tech)
- `security`: ~20-30 seconds (security focused)
- `seo_complete`: ~20-30 seconds (SEO analysis)
- `performance`: ~25-35 seconds (performance metrics)
- `reconnaissance`: ~30-45 seconds (comprehensive)
- `full`: ~60+ seconds (all activities)

---

## Contributing

Found a bug or have a feature request? Open an issue at:
https://github.com/forattini-dev/s3db.js/issues

---

## License

MIT - Same as s3db.js

---

**Made with ❤️ for the s3db.js community**

🕷️ **Happy crawling!**
