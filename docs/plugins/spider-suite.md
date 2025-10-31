# 🕷️ Spider Suite Plugin

Bundle that wires **Puppeteer**, **S3 Queue**, and optional **TTL** under a single namespace for crawling workloads.

---

## ⚡ TL;DR

```javascript
import { SpiderSuitePlugin } from 's3db.js/plugins';

await db.usePlugin(new SpiderSuitePlugin({
  namespace: 'spider',
  queue: { autoStart: false },
  processor: async (task, context, { puppeteer }) => {
    // implement your crawl here
    return { url: task.url, status: 'queued' };
  }
}));

const spiderSuite = db.plugins['spider-suite'];
await spiderSuite.enqueueTarget({ url: 'https://example.com' });
await spiderSuite.startProcessing();
```

**What you get instantly**

- ✅ Namespaced **PuppeteerPlugin** with pool disabled by default
- ✅ Dedicated resources for crawl targets (`<namespace>_targets`)
- ✅ S3Queue with helpers (`enqueue`, `startProcessing`, `queueStats`)
- ✅ Optional TTL wiring for queue housekeeping (`ttl.queue` configuration)

---

## 🔧 Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `namespace` | string | `'spider'` | Shared namespace for all bundled plugins |
| `targetsResource` | string | `${namespace}_targets` | Resource used as the queue source |
| `queue.autoStart` | boolean | `false` | Start workers automatically when a processor is provided |
| `queue.concurrency` | number | `3` | Worker concurrency passed to `S3QueuePlugin` |
| `puppeteer` | object | `{ pool: { enabled: false } }` | Overrides forwarded to `PuppeteerPlugin` |
| `ttl.queue.ttl` | number | `null` | When set, installs `TTLPlugin` and wires the queue resource |
| `processor(record, context, helpers)` | function | `null` | Queue handler. Call `setProcessor` later if you prefer |

**Helpers passed to your processor**

- `puppeteer`: the namespaced `PuppeteerPlugin` instance
- `queue`: the `S3QueuePlugin` instance
- `enqueue(data, options)`: helper that reuses the targets resource helper
- `resource`: direct handle to the targets resource (`db.resources[...]`)

### Dependency Graph

```mermaid
flowchart TB
  Suite[SpiderSuite Plugin]
  Puppeteer[PuppeteerPlugin]
  Queue[S3QueuePlugin]
  TTL[TTLPlugin]

  Suite --> Puppeteer
  Suite --> Queue
  Suite -- optional --> TTL
```

---

## 🧩 Usage Patterns

### Registering the processor later

```javascript
const suite = new SpiderSuitePlugin({ namespace: 'crawler' });
await db.usePlugin(suite, 'crawler-suite');

suite.setProcessor(async (task, ctx, helpers) => {
  // use helpers.puppeteer as needed
  return { crawled: task.url };
});

await suite.startProcessing();
```

### Enqueuing targets

```javascript
await suite.enqueueTarget({
  url: 'https://example.com',
  priority: 5,
  metadata: { source: 'sitemap' }
});

const stats = await suite.queuePlugin.getStats();
console.log('Pending jobs:', stats.pending);
```

### Wiring TTL for stale queue entries

```javascript
await db.usePlugin(new SpiderSuitePlugin({
  namespace: 'spider',
  ttl: { queue: { ttl: 3600, onExpire: 'hard-delete' } }
}));
```

---

## 🔄 Lifecycle Helpers

The suite exposes a few convenience methods:

| Method | Description |
|--------|-------------|
| `setProcessor(fn, { autoStart, concurrency })` | Register/replace the queue handler |
| `enqueueTarget(data, options)` | Adds a crawl target (wraps `resource.enqueue`) |
| `startProcessing(options)` | Starts workers with the registered handler |
| `stopProcessing()` | Stops the bundled `S3QueuePlugin` workers |

---

## 🚨 Error Handling

Spider Suite simply forwards the structured errors produced by its child plugins. Handle them by checking `error.name`, `statusCode`, and `retriable`:

```javascript
suite.setProcessor(async (task, context, helpers) => {
  try {
    return await crawl(task.url, helpers.puppeteer);
  } catch (error) {
    if (error.name === 'BrowserPoolError') {
      // PuppeteerPlugin: usually retriable, inspect `error.hint`
      context.logger.warn(error.suggestion);
      throw error; // propagate so S3Queue decides whether to retry
    }
    if (error.name === 'QueueError') {
      // S3QueuePlugin: misconfigured queue or malformed task
      context.logger.error(error.toJson());
      throw error;
    }

    // Any other PluginError keeps the structured metadata
    throw error;
  }
});
```

| Source | Status | Retriable? | Message | Suggested Fix |
|--------|--------|------------|---------|---------------|
| `QueueError` | 400 | `false` | `Processor function is missing` | Call `setProcessor()` before `startProcessing()` or provide `processor` in the constructor. |
| `QueueError` | 404 | `false` | `plg_spider_targets resource not found` | Create the targets resource or change `targetsResource`. |
| `BrowserPoolError` | 503 | `true` | `No healthy browser instances available` | Relax proxy health thresholds or increase `puppeteer.pool.size`. |
| `TTLPluginError` | 500 | `true` | `Failed to schedule TTL cleanup` | Review S3 permissions for the TTL namespace and retry. |

Log `error.toJson()` so operators receive the embedded `suggestion` and `docs` URLs.

---

## 📚 Related Plugins

- [Puppeteer Plugin](./puppeteer/README.md) – full browser automation API
- [S3 Queue Plugin](./s3-queue.md) – distributed queue implementation
- [TTL Plugin](./ttl.md) – resource TTL management
