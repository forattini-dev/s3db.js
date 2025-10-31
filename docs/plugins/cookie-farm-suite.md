# 🍪 Cookie Farm Suite Plugin

Bundle that orchestrates **CookieFarmPlugin**, **PuppeteerPlugin**, **S3QueuePlugin**, and optional **TTL** under a single namespace for persona generation pipelines.

---

## ⚡ TL;DR

```javascript
import { CookieFarmSuitePlugin } from 's3db.js/plugins';

const suite = new CookieFarmSuitePlugin({
  namespace: 'persona',
  queue: { autoStart: false },
  cookieFarm: {
    generation: { count: 0 },
    warmup: { enabled: false }
  }
});

await db.usePlugin(suite, 'persona-suite');

suite.setProcessor(async (job, context, { cookieFarm }) => {
  if (job.jobType === 'generate') {
    return { scheduled: true, count: job.payload?.count ?? 1 };
  }
  throw new Error(`Unsupported job type: ${job.jobType}`);
});

await suite.enqueueJob({ jobType: 'generate', payload: { count: 5 } });
await suite.startProcessing();
```

**What’s bundled**

- ✅ Namespaced `PuppeteerPlugin` (pool disabled by default)
- ✅ Namespaced `CookieFarmPlugin` sharing the same namespace
- ✅ Queue resource `<namespace>_persona_jobs` with helpers (`enqueue`, `startProcessing`)
- ✅ Optional TTL wiring for the queue (`ttl.queue` settings)

---

## 🔧 Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `namespace` | string | `'persona'` | Shared namespace for all bundled plugins |
| `jobsResource` | string | `${namespace}_persona_jobs` | Source resource used by `S3QueuePlugin` |
| `queue.autoStart` | boolean | `false` | Automatically start workers when a processor exists |
| `cookieFarm` | object | `{}` | Options forwarded to `CookieFarmPlugin` |
| `puppeteer` | object | `{ pool: { enabled: false } }` | Options forwarded to `PuppeteerPlugin` |
| `ttl.queue.ttl` | number | `null` | Wires `TTLPlugin` to the queue resource when set |
| `processor(job, context, helpers)` | function | `null` | Queue handler; can be registered later via `setProcessor` |

**Helpers passed to the processor**

- `cookieFarm`: the bundled `CookieFarmPlugin`
- `puppeteer`: the namespaced `PuppeteerPlugin`
- `queue`: the `S3QueuePlugin` instance
- `enqueue(data, options)`: helper to push new jobs
- `resource`: direct handle to the jobs resource

---

## 📬 Enqueuing Jobs

```javascript
await suite.enqueueJob({
  jobType: 'warmup',
  payload: { personaId: 'persona_123' },
  requestedBy: 'ops'
});

const stats = await suite.queuePlugin.getStats();
console.log(stats);
```

You decide how to interpret `jobType`/`payload`. A common pattern is:

- `generate` – trigger `cookieFarm.generatePersonas(count, options)`
- `warmup` – call `cookieFarm.warmupPersona(id)`
- `retire` – call `cookieFarm.retirePersona(id)`

---

## 🧩 API Helpers

| Method | Description |
|--------|-------------|
| `setProcessor(fn, { autoStart, concurrency })` | Register/replace the queue handler |
| `enqueueJob(data, options)` | Enqueue a persona job (wraps `resource.enqueue`) |
| `startProcessing(options)` | Starts bundled queue workers |
| `stopProcessing()` | Stops queue workers |

---

## 📚 Related Plugins

- [Cookie Farm Plugin](./cookie-farm.plugin.md) – Persona generation internals
- [Puppeteer Plugin](./puppeteer/README.md) – Browser automation utilities
- [S3 Queue Plugin](./s3-queue.md) – Queue infrastructure
- [TTL Plugin](./ttl.md) – Automatic cleanup support
