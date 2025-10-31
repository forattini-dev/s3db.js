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

## 📚 Related Plugins

- [Puppeteer Plugin](./puppeteer/README.md) – full browser automation API
- [S3 Queue Plugin](./s3-queue.md) – distributed queue implementation
- [TTL Plugin](./ttl.md) – resource TTL management
