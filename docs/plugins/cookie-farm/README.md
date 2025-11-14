# 🍪 Cookie Farm Plugin

> **Unified persona generation pipeline combining Cookie Farm, Puppeteer, S3Queue, and TTL.**
>
> **Navigation:** [← Plugin Index](../README.md) | [Guides ↓](#-documentation-index) | [FAQ ↓](#-quick-faq)

---

## ⚡ TLDR

**Bundled plugin orchestrating 4 sub-plugins** for end-to-end persona generation:
- **CookieFarmPlugin** - Generate realistic browser personas
- **PuppeteerPlugin** - Browser automation & pooling
- **S3QueuePlugin** - Distributed job queue
- **TTLPlugin** - Auto-cleanup

**Get started in 1 line:**
```javascript
const suite = new CookieFarmPlugin({ namespace: 'persona' });
await db.usePlugin(suite);
suite.setProcessor(async (job, context, { cookieFarm }) => {
  return await cookieFarm.generatePersonas(job.payload.count);
});
await suite.startProcessing();
```

**Key benefits:**
- ✅ Single namespace for all resources
- ✅ Automatic retry with exponential backoff
- ✅ Dead letter queue for failures
- ✅ Browser pooling for concurrency
- ✅ Multi-stage workflows (generate → verify → warmup → retire)
- ✅ Zero configuration needed

**Performance:**
- ~2-10 personas/minute per worker
- 5-20 concurrent browsers typical
- Automatic error recovery
- Distributed locking across instances

---

## 📦 Dependencies

**Required:**
```bash
pnpm install s3db.js
```

**Optional (install what you need):**
```bash
pnpm install puppeteer         # Browser automation
pnpm install proxy-chain       # Proxy support
pnpm install 2captcha-api      # CAPTCHA solving
pnpm install pg                # PostgreSQL sync
pnpm install @google-cloud/bigquery  # BigQuery sync
```

All bundled plugins are built-in. Only install peer dependencies you actually use.

---

## 📑 Documentation Index

### Quick Start (10 min)
- **[Getting Started](./guides/getting-started.md)** - Installation, setup, first pipeline
  - What is Cookie Farm Suite
  - Minimal working example
  - Understanding namespaces
  - Common mistakes

### Configuration (15 min)
- **[Configuration Guide](./guides/configuration.md)** - All options & patterns
  - Default configuration object
  - 6 configuration patterns (dev, staging, prod, cost-optimized, high-scale, audit)
  - Browser pool, proxy, CAPTCHA settings
  - Performance tuning guide

### Usage Examples (20 min)
- **[Usage Patterns](./guides/usage-patterns.md)** - 5 real-world patterns
  - Pattern 1: Basic generation (direct API)
  - Pattern 2: Queue-based processing
  - Pattern 3: Production pipeline
  - Pattern 4: Multi-stage workflows
  - Pattern 5: Error recovery with DLQ
  - Copy-paste recipes

### Best Practices (25 min)
- **[Best Practices & Troubleshooting](./guides/best-practices.md)** - Production deployment
  - 6 essential best practices
  - Common mistakes & fixes
  - Error handling strategies
  - Troubleshooting guide
  - 20+ FAQ entries

---

## 🎯 Key Features

### Unified Namespace
All resources prefixed with your namespace:
```javascript
const suite = new CookieFarmPlugin({ namespace: 'persona' });
// Creates: persona_persona_jobs, persona_personas, persona_dlq
```

### Automatic Retry & Recovery
```javascript
queue: {
  maxRetries: 3,                          // Retry 3 times
  deadLetterResource: 'persona_dlq',      // Store permanent failures
  retryStrategy: 'exponential'            // Smart backoff
}
```

### Browser Pooling
```javascript
puppeteer: {
  pool: {
    enabled: true,
    size: { min: 5, max: 20 }  // 5-20 concurrent browsers
  }
}
```

### Multi-Stage Workflows
```javascript
// Generate → Verify → Warmup → Monitor → Retire
await enqueue({ jobType: 'generate', payload: { count: 10 } });
// Automatically enqueues verification jobs after generation
// Automatically enqueues warmup jobs after verification
```

---

## ⚡ Quick Start Example

```javascript
import { Database, CookieFarmPlugin } from 's3db.js';

const db = new Database({
  connectionString: 's3://key:secret@bucket/path'
});

// Configure suite
const suite = new CookieFarmPlugin({
  namespace: 'persona',
  queue: {
    autoStart: true,
    workers: 5,
    maxRetries: 3,
    deadLetterResource: 'persona_dlq'
  },
  puppeteer: {
    pool: { enabled: true, size: { min: 2, max: 10 } }
  },
  ttl: {
    queue: { ttl: 86400000 }  // Auto-cleanup after 24 hours
  }
});

await db.usePlugin(suite);
await db.connect();

// Set processor
suite.setProcessor(async (job, context, { cookieFarm }) => {
  if (job.jobType === 'generate') {
    return await cookieFarm.generatePersonas(job.payload.count);
  }
  throw new Error(`Unknown job type: ${job.jobType}`);
});

// Enqueue jobs
await suite.enqueueJob({
  jobType: 'generate',
  payload: { count: 10 }  // Generate 10 personas
});

// Monitor
suite.on('job.completed', ({ job, result, duration }) => {
  console.log(`✅ Job completed in ${duration}ms:`, result);
});

suite.on('job.dead_letter', ({ job, error }) => {
  console.error(`💀 Job failed permanently:`, error.message);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await suite.stopProcessing({ timeout: 30000 });
  await db.disconnect();
  process.exit(0);
});
```

---

## 📊 Configuration Patterns

| Pattern | Workers | Pool | Proxies | CAPTCHA | Use Case |
|---------|---------|------|---------|---------|----------|
| **Dev** | 1 | ❌ | ❌ | ❌ | Local testing |
| **Test** | 2 | ✅ | ❌ | ❌ | CI/CD |
| **Staging** | 5 | ✅ | ✅ | ❌ | Pre-production |
| **Prod** | 20 | ✅ | ✅ | ✅ | Full-featured |
| **Budget** | 2 | ❌ | ❌ | ❌ | Cost-optimized |

**→ See [Configuration Guide](./guides/configuration.md) for complete patterns**

---

## 🔄 Typical Workflows

### 1. Batch Persona Generation
```javascript
// Generate 100 personas in 10-minute batches
for (let i = 0; i < 100; i += 10) {
  await suite.enqueueJob({
    jobType: 'generate',
    payload: { count: 10 }
  });
}
```

### 2. Persona Lifecycle (Generate → Warmup → Retire)
```javascript
// On generation completion, auto-enqueue warmup jobs
suite.setProcessor(async (job, context, { cookieFarm, enqueue }) => {
  if (job.jobType === 'generate') {
    const result = await cookieFarm.generatePersonas(job.payload.count);

    // Auto-enqueue warmup after 24 hours
    for (const persona of result.personas) {
      await enqueue({
        jobType: 'warmup',
        payload: { personaId: persona.id },
        delayMs: 86400000  // 24 hours
      });
    }
    return result;
  }
  // ... other job types
});
```

### 3. Replicate to PostgreSQL
```javascript
// Setup replication (will auto-sync all personas)
await db.usePlugin(new ReplicatorPlugin({
  replicators: [{
    driver: 'postgresql',
    resources: ['persona_personas'],
    config: {
      connectionString: process.env.POSTGRES_URL,
      schemaSync: { enabled: true }
    }
  }]
}));
```

---

## ❓ Quick FAQ

**Q: What's the difference between basic generation and queue-based?**

A: Basic generation runs synchronously (blocking). Queue-based processes async with automatic retry and distributed workers. Use queue-based for production.

→ **[Full FAQ](./guides/best-practices.md#-faq)**

---

**Q: How many workers should I use?**

A: Start with `workers = (CPU cores) * 2`. Monitor queue depth and adjust:
- Queue backing up → Increase workers
- High CPU → Decrease workers

---

**Q: What happens if a job fails?**

A: Automatically retried based on `maxRetries` (default 3). After max retries, moved to DLQ for manual handling.

---

**Q: Can I use the same namespace in dev and prod?**

A: **No!** Always use environment-specific namespaces:
```javascript
namespace: `${process.env.NODE_ENV}_persona`  // dev_persona, prod_persona
```

---

**Q: How do I monitor job failures?**

A: Check DLQ periodically:
```javascript
setInterval(async () => {
  const dlq = await db.getResource('persona_dlq');
  const failed = await dlq.query({ status: 'failed' });
  console.log(`${failed.items.length} jobs in DLQ`);
}, 300000);  // Every 5 minutes
```

---

**Q: Can I run multiple instances?**

A: Yes! Each instance uses the same namespace and resources. They automatically coordinate through distributed locking.

---

## 📚 Learning Path

**Total time: ~60 minutes**

1. **Read TLDR above** (2 min) - Understand what it is
2. **Follow Getting Started guide** (10 min) - See it in action
3. **Skim Configuration guide** (10 min) - Know what's available
4. **Review Usage Patterns** (20 min) - See real-world code
5. **Check Best Practices** (20 min) - Before going to production

---

## 🔗 Related Plugins

- **[Puppeteer Plugin](../puppeteer/README.md)** - Browser automation details
- **[S3 Queue Plugin](../s3-queue/README.md)** - Queue infrastructure
- **[TTL Plugin](../ttl/README.md)** - Auto-cleanup
- **[Replicator Plugin](../replicator/README.md)** - Sync personas to databases
- **[Cache Plugin](../cache.md)** - Speed up lookups
- **[Audit Plugin](../audit.md)** - Compliance tracking

---

## 🚀 Next Steps

1. **[Getting Started](./guides/getting-started.md)** - Install and setup
2. **[Configuration](./guides/configuration.md)** - Configure for your needs
3. **[Usage Patterns](./guides/usage-patterns.md)** - See real-world examples
4. **[Best Practices](./guides/best-practices.md)** - Production deployment

---

## 💬 Help & Support

- 📖 **Quick answers?** Check [FAQ](./guides/best-practices.md#-faq)
- ⚙️ **Configuration help?** See [Configuration Guide](./guides/configuration.md)
- 💡 **Code examples?** See [Usage Patterns](./guides/usage-patterns.md)
- 🐛 **Troubleshooting?** See [Best Practices](./guides/best-practices.md#troubleshooting-guide)

---

**Start:** [Getting Started Guide →](./guides/getting-started.md)
