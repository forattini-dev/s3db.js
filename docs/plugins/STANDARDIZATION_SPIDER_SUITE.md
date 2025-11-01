# Spider Suite Plugin Standardization - Missing Sections

This file contains ready-to-insert content for Spider Suite Plugin to match PuppeteerPlugin template.

---

## SECTION: Usage Journey

Insert this after "Quick Start" section.

---

## Usage Journey

### Level 1: Basic URL Crawling

Simple URL crawling with Puppeteer integration.

```javascript
import { Database } from 's3db.js';
import { SpiderSuitePlugin } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://...' });

const spider = new SpiderSuitePlugin({
  namespace: 'crawler',
  queue: { autoStart: false }
});

await db.usePlugin(spider);
await db.connect();

// Define processor
spider.setProcessor(async (task, context, helpers) => {
  const { puppeteer } = helpers;

  // Open page
  const page = await puppeteer.getPage();

  try {
    await page.goto(task.url, { waitUntil: 'networkidle2' });

    const title = await page.title();
    console.log(`Visited: ${task.url} - ${title}`);

    return { url: task.url, title, status: 'completed' };
  } finally {
    await puppeteer.releasePage(page);
  }
});

// Enqueue URL
await spider.enqueueTarget({ url: 'https://example.com' });

// Start processing
await spider.startProcessing();
```

**What you get:**
- Basic URL crawling with Puppeteer
- Manual queue management
- Simple page navigation

**What's missing:**
- No link extraction
- No depth control
- No deduplication

---

### Level 2: Link Extraction & Recursive Crawling

Extract links and recursively crawl discovered URLs.

```javascript
const spider = new SpiderSuitePlugin({
  namespace: 'recursive-crawler',
  queue: { autoStart: true, concurrency: 3 }
});

await db.usePlugin(spider);

spider.setProcessor(async (task, context, helpers) => {
  const { puppeteer, enqueue } = helpers;

  const page = await puppeteer.getPage();

  try {
    await page.goto(task.url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Extract page data
    const data = await page.evaluate(() => ({
      title: document.title,
      url: window.location.href,
      links: Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(href => href.startsWith('http'))
    }));

    // Extract and enqueue links (if depth < max)
    const currentDepth = task.depth || 0;
    const maxDepth = 3;

    if (currentDepth < maxDepth) {
      for (const link of data.links) {
        await enqueue({
          url: link,
          depth: currentDepth + 1,
          parent: task.url
        }, { priority: 5 - currentDepth });  // Higher priority for shallow pages
      }
    }

    console.log(`[Depth ${currentDepth}] ${task.url}: Found ${data.links.length} links`);

    return { ...data, depth: currentDepth, status: 'completed' };
  } finally {
    await puppeteer.releasePage(page);
  }
});

// Start crawl
await spider.enqueueTarget({ url: 'https://example.com', depth: 0 });
```

**What you get:**
- Recursive link crawling
- Depth control
- Priority-based queueing

**Performance:**
- 3 concurrent crawlers
- ~1-3 seconds per page
- Depth limit prevents infinite loops

---

### Level 3: Deduplication & URL Filtering

Add deduplication and URL filtering to avoid re-crawling.

```javascript
const spider = new SpiderSuitePlugin({
  namespace: 'smart-crawler',
  queue: { autoStart: true, concurrency: 5 }
});

await db.usePlugin(spider);

// Track visited URLs (in-memory or use S3DB resource)
const visitedUrls = new Set();

spider.setProcessor(async (task, context, helpers) => {
  const { puppeteer, enqueue, resource } = helpers;

  // Normalize URL (remove fragments, trailing slashes)
  const normalizeUrl = (url) => {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href.replace(/\/$/, '');
  };

  const normalizedUrl = normalizeUrl(task.url);

  // Skip if already visited
  if (visitedUrls.has(normalizedUrl)) {
    console.log(`⏭️  Skipping (already visited): ${task.url}`);
    return { url: task.url, status: 'skipped', reason: 'duplicate' };
  }

  visitedUrls.add(normalizedUrl);

  const page = await puppeteer.getPage();

  try {
    await page.goto(task.url, { waitUntil: 'networkidle2', timeout: 30000 });

    const data = await page.evaluate(() => ({
      title: document.title,
      url: window.location.href,
      links: Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(href => href.startsWith('http'))
    }));

    // Filter links (same domain only)
    const baseDomain = new URL(task.url).hostname;
    const filteredLinks = data.links.filter(link => {
      try {
        return new URL(link).hostname === baseDomain;
      } catch {
        return false;
      }
    });

    // Enqueue unique links
    const currentDepth = task.depth || 0;
    const maxDepth = 3;

    if (currentDepth < maxDepth) {
      for (const link of filteredLinks) {
        const normalized = normalizeUrl(link);
        if (!visitedUrls.has(normalized)) {
          await enqueue({
            url: link,
            depth: currentDepth + 1,
            parent: task.url
          });
        }
      }
    }

    console.log(`✓ [${currentDepth}] ${task.url}: ${filteredLinks.length} new links`);

    return { ...data, depth: currentDepth, status: 'completed' };
  } catch (error) {
    console.error(`✗ Failed to crawl ${task.url}:`, error.message);
    throw error;  // Let queue handle retry
  } finally {
    await puppeteer.releasePage(page);
  }
});

await spider.enqueueTarget({ url: 'https://example.com', depth: 0 });
```

**What you get:**
- URL deduplication
- Same-domain filtering
- URL normalization
- Skip visited pages

---

### Level 4: Data Extraction & Storage

Extract structured data and store in S3DB.

```javascript
import { Database } from 's3db.js';
import { SpiderSuitePlugin } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://...' });

// Create resource for crawled data
await db.createResource({
  name: 'crawled_pages',
  attributes: {
    url: 'string|required',
    title: 'string',
    description: 'string',
    content: 'string',
    links: 'array',
    images: 'array',
    depth: 'number',
    crawledAt: 'number'
  },
  partitions: {
    byDomain: {
      fields: { domain: 'string' }
    }
  }
});

const spider = new SpiderSuitePlugin({
  namespace: 'data-crawler',
  queue: { autoStart: true, concurrency: 5 }
});

await db.usePlugin(spider);
await db.connect();

spider.setProcessor(async (task, context, helpers) => {
  const { puppeteer } = helpers;

  const page = await puppeteer.getPage();

  try {
    await page.goto(task.url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Extract structured data
    const data = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content || '',
      content: document.body.innerText,
      links: Array.from(document.querySelectorAll('a[href]')).map(a => ({
        text: a.textContent.trim(),
        href: a.href
      })),
      images: Array.from(document.querySelectorAll('img[src]')).map(img => ({
        src: img.src,
        alt: img.alt
      }))
    }));

    // Store in S3DB
    const domain = new URL(task.url).hostname;
    await db.resources.crawled_pages.insert({
      ...data,
      domain,
      depth: task.depth || 0,
      crawledAt: Date.now()
    });

    console.log(`✓ Stored: ${task.url}`);

    return { url: task.url, status: 'completed' };
  } finally {
    await puppeteer.releasePage(page);
  }
});

await spider.enqueueTarget({ url: 'https://example.com', depth: 0 });

// Query crawled data
const pages = await db.resources.crawled_pages.listPartition('byDomain', {
  domain: 'example.com'
});

console.log(`Crawled ${pages.length} pages from example.com`);
```

**What you get:**
- Structured data extraction
- S3DB storage with partitions
- Queryable crawl results
- Historical data tracking

---

### Level 5: Error Handling & Retries

Add comprehensive error handling and retry logic.

```javascript
const spider = new SpiderSuitePlugin({
  namespace: 'robust-crawler',
  queue: {
    autoStart: true,
    concurrency: 5,
    retries: {
      maxAttempts: 3,
      backoff: 'exponential',
      initialDelay: 1000
    }
  }
});

await db.usePlugin(spider);

spider.setProcessor(async (task, context, helpers) => {
  const { puppeteer } = helpers;
  const { attempt } = context;

  console.log(`[Attempt ${attempt}] Crawling: ${task.url}`);

  const page = await puppeteer.getPage();

  try {
    // Navigate with timeout
    await page.goto(task.url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for content
    await page.waitForSelector('body', { timeout: 5000 });

    // Extract data
    const data = await page.evaluate(() => ({
      title: document.title,
      url: window.location.href
    }));

    console.log(`✓ [${attempt}] Success: ${task.url}`);

    return { ...data, status: 'completed', attempts: attempt };

  } catch (error) {
    // Handle specific errors
    if (error.message.includes('timeout')) {
      console.warn(`⏱️  [${attempt}] Timeout: ${task.url}`);
      throw error;  // Retry
    }

    if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
      console.error(`🚫 [${attempt}] DNS error (no retry): ${task.url}`);
      return { url: task.url, status: 'failed', error: 'dns_error', attempts: attempt };
    }

    if (error.message.includes('404')) {
      console.warn(`🔍 [${attempt}] 404 Not Found (no retry): ${task.url}`);
      return { url: task.url, status: 'failed', error: '404', attempts: attempt };
    }

    // Unknown error - retry
    console.error(`❌ [${attempt}] Error: ${task.url} -`, error.message);
    throw error;

  } finally {
    await puppeteer.releasePage(page);
  }
});

// Monitor failures
spider.queuePlugin.on('task.failed', ({ task, error, attempts }) => {
  console.error(`🚨 Task permanently failed after ${attempts} attempts:`, task.url);
  console.error(`   Reason: ${error.message}`);
});

await spider.enqueueTarget({ url: 'https://example.com' });
```

**What you get:**
- Automatic retries (3 attempts)
- Exponential backoff
- Specific error handling (timeout, DNS, 404)
- Failure tracking

---

### Level 6: Rate Limiting & Politeness

Add rate limiting to be respectful to target sites.

```javascript
const spider = new SpiderSuitePlugin({
  namespace: 'polite-crawler',
  queue: {
    autoStart: true,
    concurrency: 2,  // Lower concurrency
    rateLimit: {
      enabled: true,
      requestsPerMinute: 20,  // Max 20 pages/min
      delayBetweenRequests: 3000  // 3 seconds between pages
    }
  },
  puppeteer: {
    performance: {
      blockResources: {
        enabled: true,
        types: ['image', 'stylesheet', 'font', 'media']  // Faster crawling
      }
    }
  }
});

await db.usePlugin(spider);

spider.setProcessor(async (task, context, helpers) => {
  const { puppeteer } = helpers;

  // Add random delay (jitter) to avoid detection
  const jitter = Math.random() * 2000;  // 0-2 seconds
  await new Promise(resolve => setTimeout(resolve, jitter));

  const page = await puppeteer.getPage();

  try {
    await page.goto(task.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const data = await page.evaluate(() => ({
      title: document.title,
      url: window.location.href
    }));

    console.log(`✓ Crawled: ${task.url}`);

    return { ...data, status: 'completed' };
  } finally {
    await puppeteer.releasePage(page);
  }
});

// Monitor rate limiting
spider.queuePlugin.on('queue.rate-limit-delay', ({ delayMs }) => {
  console.log(`⏳ Rate limit: waiting ${delayMs}ms`);
});

await spider.enqueueTarget({ url: 'https://example.com' });
```

**What you get:**
- Rate limiting (20 requests/min)
- Delay between requests (3 seconds)
- Random jitter (0-2 seconds)
- Resource blocking (50-70% faster)

---

### Level 7: Production Setup

Complete production crawler with monitoring, TTL, and storage.

```javascript
import { Database } from 's3db.js';
import { SpiderSuitePlugin, TTLPlugin, MetricsPlugin } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://...' });

// Create crawl resources
await db.createResource({
  name: 'crawled_pages',
  attributes: {
    url: 'string|required',
    title: 'string',
    content: 'string',
    status: 'string',
    depth: 'number',
    crawledAt: 'number'
  }
});

// Spider Suite with TTL
const spider = new SpiderSuitePlugin({
  namespace: 'production-crawler',
  queue: {
    autoStart: true,
    concurrency: 10,
    retries: { maxAttempts: 3, backoff: 'exponential' },
    rateLimit: { enabled: true, requestsPerMinute: 60 }
  },
  puppeteer: {
    pool: { enabled: true, maxBrowsers: 5 },
    stealth: { enabled: true },
    performance: {
      blockResources: { enabled: true, types: ['image', 'font', 'media'] }
    }
  },
  ttl: {
    queue: {
      ttl: 86400000,  // 24 hours for queue entries
      onExpire: 'hard-delete'
    }
  }
});

// TTL for crawled pages
const ttl = new TTLPlugin({
  resources: {
    crawled_pages: { ttl: 2592000000 }  // 30 days
  }
});

// Metrics
const metrics = new MetricsPlugin({ enabled: true });

await db.usePlugin(spider);
await db.usePlugin(ttl);
await db.usePlugin(metrics);
await db.connect();

// Track visited URLs
const visitedUrls = new Set();

spider.setProcessor(async (task, context, helpers) => {
  const { puppeteer, enqueue } = helpers;
  const { attempt } = context;

  const normalizedUrl = task.url.replace(/\/$/, '');

  if (visitedUrls.has(normalizedUrl)) {
    return { url: task.url, status: 'skipped', reason: 'duplicate' };
  }

  visitedUrls.add(normalizedUrl);

  const page = await puppeteer.getPage();

  try {
    await page.goto(task.url, { waitUntil: 'networkidle2', timeout: 30000 });

    const data = await page.evaluate(() => ({
      title: document.title,
      url: window.location.href,
      content: document.body.innerText.substring(0, 10000),  // First 10KB
      links: Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(href => href.startsWith('http'))
    }));

    // Store in S3DB
    await db.resources.crawled_pages.insert({
      url: data.url,
      title: data.title,
      content: data.content,
      status: 'completed',
      depth: task.depth || 0,
      crawledAt: Date.now()
    });

    // Enqueue links (if depth < max)
    const currentDepth = task.depth || 0;
    const maxDepth = 3;

    if (currentDepth < maxDepth) {
      const baseDomain = new URL(task.url).hostname;
      const sameOriginLinks = data.links.filter(link => {
        try {
          return new URL(link).hostname === baseDomain;
        } catch {
          return false;
        }
      });

      for (const link of sameOriginLinks.slice(0, 50)) {  // Max 50 links per page
        const normalized = link.replace(/\/$/, '');
        if (!visitedUrls.has(normalized)) {
          await enqueue({ url: link, depth: currentDepth + 1, parent: task.url });
        }
      }
    }

    return { url: task.url, status: 'completed', linksFound: data.links.length };

  } catch (error) {
    if (attempt < 3) throw error;  // Retry

    // Permanent failure
    await db.resources.crawled_pages.insert({
      url: task.url,
      status: 'failed',
      error: error.message,
      depth: task.depth || 0,
      crawledAt: Date.now()
    });

    return { url: task.url, status: 'failed', error: error.message };
  } finally {
    await puppeteer.releasePage(page);
  }
});

// Monitor progress
spider.queuePlugin.on('task.completed', ({ task, result, duration }) => {
  console.log(`✓ [${duration}ms] ${task.url}: ${result.status}`);
});

spider.queuePlugin.on('task.failed', ({ task, error, attempts }) => {
  console.error(`✗ [${attempts} attempts] ${task.url}: ${error.message}`);
});

// Start crawl
await spider.enqueueTarget({ url: 'https://example.com', depth: 0 });

// Query stats
const stats = await spider.queuePlugin.getStats();
console.log('Queue stats:', stats);

const pages = await db.resources.crawled_pages.list({ limit: 100 });
console.log(`Crawled ${pages.length} pages`);
```

**Production Checklist:**
- ✅ Browser pooling (5 browsers)
- ✅ Stealth mode enabled
- ✅ Resource blocking (50-70% faster)
- ✅ Rate limiting (60 req/min)
- ✅ Retry logic (3 attempts, exponential backoff)
- ✅ TTL for queue cleanup (24 hours)
- ✅ TTL for crawled pages (30 days)
- ✅ Deduplication
- ✅ Depth control (max 3 levels)
- ✅ Error handling
- ✅ Metrics tracking
- ✅ Event monitoring

---

## SECTION: Configuration Examples

Insert this after "Configuration" section.

---

## 📚 Configuration Examples

### Example 1: Lightweight Crawler (Minimal Resources)

```javascript
new SpiderSuitePlugin({
  namespace: 'lightweight',
  queue: {
    autoStart: true,
    concurrency: 2  // Low concurrency
  },
  puppeteer: {
    pool: { enabled: false },  // No pooling
    performance: {
      blockResources: {
        enabled: true,
        types: ['image', 'stylesheet', 'font', 'media']
      }
    }
  }
})
```

**Use case:** Small crawls, limited resources, single-page scraping

---

### Example 2: High-Volume Crawler (Maximum Throughput)

```javascript
new SpiderSuitePlugin({
  namespace: 'high-volume',
  queue: {
    autoStart: true,
    concurrency: 20  // High concurrency
  },
  puppeteer: {
    pool: {
      enabled: true,
      maxBrowsers: 10,
      maxTabsPerBrowser: 20
    },
    performance: {
      blockResources: { enabled: true }
    }
  }
})
```

**Use case:** Large-scale crawling, high throughput, fast scraping

---

### Example 3: Polite Crawler (Respectful to Targets)

```javascript
new SpiderSuitePlugin({
  namespace: 'polite',
  queue: {
    autoStart: true,
    concurrency: 2,
    rateLimit: {
      enabled: true,
      requestsPerMinute: 20,
      delayBetweenRequests: 3000
    }
  },
  puppeteer: {
    stealth: { enabled: true },
    humanBehavior: { enabled: true }
  }
})
```

**Use case:** Authorized crawling, avoid detection, respectful scraping

---

### Example 4: With TTL Cleanup (Auto-Delete Old Queue Entries)

```javascript
new SpiderSuitePlugin({
  namespace: 'crawler',
  queue: { autoStart: true, concurrency: 5 },
  ttl: {
    queue: {
      ttl: 86400000,  // 24 hours
      onExpire: 'hard-delete'
    }
  }
})
```

**Use case:** Long-running crawlers, prevent queue bloat

---

## SECTION: Best Practices

Insert this after "Configuration Examples" section.

---

## ✅ Best Practices

### Do's ✅

1. **Always release pages**
   ```javascript
   const page = await puppeteer.getPage();
   try {
     await page.goto(task.url);
   } finally {
     await puppeteer.releasePage(page);  // CRITICAL
   }
   ```

2. **Use deduplication**
   ```javascript
   const visitedUrls = new Set();

   spider.setProcessor(async (task) => {
     if (visitedUrls.has(task.url)) {
       return { status: 'skipped', reason: 'duplicate' };
     }
     visitedUrls.add(task.url);
     // ... crawl
   });
   ```

3. **Set depth limits**
   ```javascript
   const maxDepth = 3;

   if (task.depth < maxDepth) {
     await enqueue({ url: link, depth: task.depth + 1 });
   }
   ```

4. **Enable rate limiting**
   ```javascript
   queue: {
     rateLimit: {
       enabled: true,
       requestsPerMinute: 20
     }
   }
   ```

5. **Use resource blocking for speed**
   ```javascript
   puppeteer: {
     performance: {
       blockResources: {
         enabled: true,
         types: ['image', 'stylesheet', 'font', 'media']
       }
     }
   }
   ```

6. **Store crawl results**
   ```javascript
   await db.resources.crawled_pages.insert({
     url: data.url,
     title: data.title,
     crawledAt: Date.now()
   });
   ```

7. **Use TTL for queue cleanup**
   ```javascript
   ttl: {
     queue: { ttl: 86400000 }  // 24 hours
   }
   ```

---

### Don'ts ❌

1. **Don't forget to handle errors**
   ```javascript
   // ❌ No error handling
   await page.goto(task.url);

   // ✅ With error handling
   try {
     await page.goto(task.url, { timeout: 30000 });
   } catch (error) {
     console.error(`Failed to crawl ${task.url}:`, error.message);
     throw error;  // Let queue retry
   }
   ```

2. **Don't crawl without deduplication**
   ```javascript
   // ❌ Infinite loops possible
   await enqueue({ url: link });

   // ✅ With deduplication
   if (!visitedUrls.has(link)) {
     await enqueue({ url: link });
   }
   ```

3. **Don't use unlimited depth**
   ```javascript
   // ❌ Can crawl entire internet
   await enqueue({ url: link, depth: task.depth + 1 });

   // ✅ With depth limit
   if (task.depth < 3) {
     await enqueue({ url: link, depth: task.depth + 1 });
   }
   ```

4. **Don't ignore rate limiting**
   ```javascript
   // ❌ Can overload target site
   queue: { concurrency: 50 }

   // ✅ Respectful crawling
   queue: {
     concurrency: 5,
     rateLimit: { enabled: true, requestsPerMinute: 20 }
   }
   ```

5. **Don't forget to clean up**
   ```javascript
   // ❌ Queue entries accumulate
   // No TTL

   // ✅ Auto-cleanup
   ttl: { queue: { ttl: 86400000 } }
   ```

---

## SECTION: Complete API Reference

Insert this after "Best Practices" section.

---

## 🔧 API Reference

### Plugin Methods

#### `setProcessor(fn, options): void`

Register or replace the queue processor function.

**Signature:**
```javascript
spider.setProcessor(fn, options)
```

**Parameters:**
- `fn` (function, required): Processor function `(task, context, helpers) => Promise<any>`
  - `task` (object): Queue task data
  - `context` (object): Execution context (attempt, logger, etc.)
  - `helpers` (object): Helper utilities
    - `puppeteer`: PuppeteerPlugin instance
    - `queue`: S3QueuePlugin instance
    - `enqueue`: Helper to enqueue new tasks
    - `resource`: Direct handle to targets resource
- `options` (object, optional): Processing options
  - `autoStart` (boolean): Auto-start processing (default: `false`)
  - `concurrency` (number): Override concurrency (default: from config)

**Returns:** void

**Example:**
```javascript
spider.setProcessor(async (task, context, helpers) => {
  const { puppeteer } = helpers;
  const { attempt } = context;

  console.log(`[Attempt ${attempt}] Processing: ${task.url}`);

  const page = await puppeteer.getPage();
  try {
    await page.goto(task.url);
    return { url: task.url, status: 'completed' };
  } finally {
    await puppeteer.releasePage(page);
  }
}, { autoStart: true, concurrency: 5 });
```

---

#### `enqueueTarget(data, options): Promise<string>`

Enqueue a new crawl target.

**Signature:**
```javascript
await spider.enqueueTarget(data, options)
```

**Parameters:**
- `data` (object, required): Target data
  - `url` (string, required): URL to crawl
  - `depth` (number, optional): Current depth level
  - `parent` (string, optional): Parent URL
  - `metadata` (object, optional): Custom metadata
- `options` (object, optional): Queue options
  - `priority` (number): Task priority (default: `0`)
  - `delay` (number): Delay before execution (ms)

**Returns:** Promise resolving to task ID

**Example:**
```javascript
// Basic enqueue
await spider.enqueueTarget({ url: 'https://example.com' });

// With depth and priority
await spider.enqueueTarget({
  url: 'https://example.com/page',
  depth: 1,
  parent: 'https://example.com'
}, { priority: 5 });

// With metadata
await spider.enqueueTarget({
  url: 'https://example.com',
  metadata: { source: 'sitemap', category: 'products' }
});
```

---

#### `startProcessing(options): Promise<void>`

Start queue workers to process enqueued tasks.

**Signature:**
```javascript
await spider.startProcessing(options)
```

**Parameters:**
- `options` (object, optional): Processing options
  - `concurrency` (number): Override concurrency

**Returns:** Promise resolving to void

**Example:**
```javascript
// Start with default concurrency
await spider.startProcessing();

// Override concurrency
await spider.startProcessing({ concurrency: 10 });
```

**Events:**
```javascript
spider.queuePlugin.on('queue.started', ({ concurrency }) => {
  console.log(`Queue started with ${concurrency} workers`);
});
```

---

#### `stopProcessing(): Promise<void>`

Stop all queue workers.

**Signature:**
```javascript
await spider.stopProcessing()
```

**Returns:** Promise resolving to void

**Example:**
```javascript
await spider.stopProcessing();
console.log('Queue workers stopped');
```

**Events:**
```javascript
spider.queuePlugin.on('queue.stopped', () => {
  console.log('Queue stopped');
});
```

---

#### `getStats(): Promise<Object>`

Get queue statistics.

**Signature:**
```javascript
await spider.queuePlugin.getStats()
```

**Returns:** Promise resolving to stats object

**Example:**
```javascript
const stats = await spider.queuePlugin.getStats();
console.log(stats);
// {
//   pending: 45,
//   active: 5,
//   completed: 120,
//   failed: 3,
//   total: 173
// }
```

---

## SECTION: FAQ

Insert this at the end of the document.

---

## ❓ FAQ

### General

**Q: What's the difference between SpiderSuitePlugin and using PuppeteerPlugin + S3QueuePlugin separately?**

A:
- **SpiderSuitePlugin** - Pre-wired bundle with namespace isolation, shared configuration, helper utilities
- **Manual setup** - More flexibility but requires manual wiring

```javascript
// ✅ SpiderSuitePlugin (recommended)
const spider = new SpiderSuitePlugin({ namespace: 'crawler' });
await db.usePlugin(spider);

// vs.

// ❌ Manual setup (more work)
const puppeteer = new PuppeteerPlugin({ namespace: 'crawler' });
const queue = new S3QueuePlugin({ namespace: 'crawler' });
await db.usePlugin(puppeteer);
await db.usePlugin(queue);
// ... manual wiring
```

---

**Q: How do I prevent infinite crawl loops?**

A: Use deduplication and depth limits:

```javascript
const visitedUrls = new Set();
const maxDepth = 3;

spider.setProcessor(async (task, context, helpers) => {
  // Check if already visited
  if (visitedUrls.has(task.url)) {
    return { status: 'skipped', reason: 'duplicate' };
  }
  visitedUrls.add(task.url);

  // Check depth limit
  if (task.depth >= maxDepth) {
    return { status: 'skipped', reason: 'max_depth' };
  }

  // ... crawl and enqueue links
});
```

---

**Q: How many concurrent crawlers should I use?**

A: Depends on your use case:

| Scenario | Concurrency | Notes |
|----------|-------------|-------|
| Small crawls (< 100 pages) | 2-5 | Low resource usage |
| Medium crawls (100-1000 pages) | 5-10 | Balanced performance |
| Large crawls (> 1000 pages) | 10-20 | High throughput |
| Polite crawling (external sites) | 2-3 | Respectful to targets |

```javascript
// Small crawl
queue: { concurrency: 2 }

// Medium crawl
queue: { concurrency: 5 }

// Large crawl
queue: { concurrency: 10 }
```

---

### Crawling Strategies

**Q: How do I crawl only same-origin links?**

A:

```javascript
spider.setProcessor(async (task, context, helpers) => {
  const { puppeteer, enqueue } = helpers;

  const page = await puppeteer.getPage();
  await page.goto(task.url);

  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
  );

  // Filter same-origin links
  const baseDomain = new URL(task.url).hostname;
  const sameOriginLinks = links.filter(link => {
    try {
      return new URL(link).hostname === baseDomain;
    } catch {
      return false;
    }
  });

  for (const link of sameOriginLinks) {
    await enqueue({ url: link, depth: (task.depth || 0) + 1 });
  }

  await puppeteer.releasePage(page);
});
```

---

**Q: How do I extract structured data while crawling?**

A:

```javascript
spider.setProcessor(async (task, context, helpers) => {
  const { puppeteer } = helpers;

  const page = await puppeteer.getPage();
  await page.goto(task.url);

  // Extract structured data
  const data = await page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content,
    headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => ({
      level: h.tagName,
      text: h.textContent.trim()
    })),
    images: Array.from(document.querySelectorAll('img[src]')).map(img => ({
      src: img.src,
      alt: img.alt
    })),
    links: Array.from(document.querySelectorAll('a[href]')).map(a => ({
      text: a.textContent.trim(),
      href: a.href
    }))
  }));

  // Store in S3DB
  await db.resources.crawled_pages.insert({
    ...data,
    url: task.url,
    crawledAt: Date.now()
  });

  await puppeteer.releasePage(page);
});
```

---

**Q: How do I handle JavaScript-heavy pages?**

A:

```javascript
spider.setProcessor(async (task, context, helpers) => {
  const { puppeteer } = helpers;

  const page = await puppeteer.getPage();

  // Wait for JavaScript to load
  await page.goto(task.url, {
    waitUntil: 'networkidle2',  // Wait for network to be idle
    timeout: 60000
  });

  // Wait for specific selector
  await page.waitForSelector('.content', { timeout: 10000 });

  // Or wait for custom condition
  await page.waitForFunction(() => {
    return document.querySelector('.loaded') !== null;
  }, { timeout: 10000 });

  // Extract data
  const data = await page.evaluate(() => ({
    title: document.title
  }));

  await puppeteer.releasePage(page);
  return data;
});
```

---

### Performance

**Q: How can I speed up crawling?**

A:

1. **Block unnecessary resources (50-70% faster):**
   ```javascript
   puppeteer: {
     performance: {
       blockResources: {
         enabled: true,
         types: ['image', 'stylesheet', 'font', 'media']
       }
     }
   }
   ```

2. **Increase concurrency:**
   ```javascript
   queue: { concurrency: 10 }
   ```

3. **Use browser pooling:**
   ```javascript
   puppeteer: {
     pool: {
       enabled: true,
       maxBrowsers: 5,
       maxTabsPerBrowser: 20
     }
   }
   ```

4. **Use faster wait conditions:**
   ```javascript
   await page.goto(url, { waitUntil: 'domcontentloaded' });  // Faster
   // vs.
   await page.goto(url, { waitUntil: 'networkidle2' });     // Slower
   ```

---

**Q: How much memory does Spider Suite use?**

A: Depends on configuration:

```javascript
// ❌ Without pooling: ~450 MB per browser
puppeteer: { pool: { enabled: false } }
// 10 concurrent = 4.5 GB

// ✅ With pooling: ~85 MB total
puppeteer: { pool: { enabled: true, maxBrowsers: 5 } }
// 10 concurrent = ~85 MB (reuses browsers)
```

---

### Error Handling

**Q: How do I handle crawl failures?**

A:

```javascript
spider.setProcessor(async (task, context, helpers) => {
  const { puppeteer } = helpers;
  const { attempt } = context;

  try {
    const page = await puppeteer.getPage();
    await page.goto(task.url, { timeout: 30000 });
    await puppeteer.releasePage(page);

    return { url: task.url, status: 'completed' };

  } catch (error) {
    // Timeout errors - retry
    if (error.message.includes('timeout')) {
      if (attempt < 3) throw error;  // Retry
      return { url: task.url, status: 'failed', error: 'timeout' };
    }

    // DNS errors - don't retry
    if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
      return { url: task.url, status: 'failed', error: 'dns_error' };
    }

    // Unknown errors - retry
    throw error;
  }
});

// Monitor failures
spider.queuePlugin.on('task.failed', ({ task, error, attempts }) => {
  console.error(`Failed after ${attempts} attempts:`, task.url);
  console.error(`Reason: ${error.message}`);
});
```

---

**Q: How do I implement retry logic?**

A: Configure retries in queue options:

```javascript
const spider = new SpiderSuitePlugin({
  queue: {
    retries: {
      maxAttempts: 3,
      backoff: 'exponential',  // 'linear', 'exponential', 'fixed'
      initialDelay: 1000        // 1 second
    }
  }
});

// Backoff schedule:
// Attempt 1: immediate
// Attempt 2: 1000ms delay
// Attempt 3: 2000ms delay (exponential)
```

---

### Storage & Cleanup

**Q: How do I prevent queue bloat?**

A: Use TTL plugin for automatic cleanup:

```javascript
const spider = new SpiderSuitePlugin({
  ttl: {
    queue: {
      ttl: 86400000,  // 24 hours
      onExpire: 'hard-delete'
    }
  }
});

// Queue entries older than 24 hours are automatically deleted
```

---

**Q: How do I store crawl results?**

A:

```javascript
// Create resource for crawled pages
await db.createResource({
  name: 'crawled_pages',
  attributes: {
    url: 'string|required',
    title: 'string',
    content: 'string',
    crawledAt: 'number'
  },
  partitions: {
    byDomain: { fields: { domain: 'string' } }
  }
});

spider.setProcessor(async (task, context, helpers) => {
  // ... crawl page

  // Store in S3DB
  await db.resources.crawled_pages.insert({
    url: data.url,
    title: data.title,
    content: data.content,
    crawledAt: Date.now()
  });
});

// Query results
const pages = await db.resources.crawled_pages.listPartition('byDomain', {
  domain: 'example.com'
});
```

---

## License

MIT License - See main s3db.js LICENSE file
