# 📋 Cookie Farm Plugin - FAQ

> **Comprehensive answers to common questions about CookieFarmPlugin and CookieFarmSuite.**
>
> **Navigation:** [← Plugin Index](/plugins/README.md) | [Configuration ↓](#configuration) | [Troubleshooting ↓](#troubleshooting)

---

## General

**Q: What is CookieFarmSuite Plugin and why use it instead of individual plugins?**

A: CookieFarmSuite is a **bundle plugin** that orchestrates CookieFarmPlugin, PuppeteerPlugin, S3QueuePlugin, and TTLPlugin under a single namespace. Benefits:

- ✅ **Unified Configuration**: Single configuration object for all plugins
- ✅ **Shared Namespace**: All plugins use `<namespace>` prefix for consistent resource naming
- ✅ **Automatic Wiring**: Queue automatically uses Cookie Farm + Puppeteer
- ✅ **Helper Methods**: `enqueueJob()`, `startProcessing()`, `stopProcessing()`
- ✅ **Event Propagation**: All plugin events available via suite
- ✅ **Less Boilerplate**: ~50 lines of orchestration code → 10 lines

```javascript
// ❌ Without CookieFarmSuite (manual orchestration)
const cookieFarm = new CookieFarmPlugin({ namespace: 'cf' });
const puppeteer = new PuppeteerPlugin({ namespace: 'pup' });
const queue = new S3QueuePlugin({ resource: 'jobs' });
const ttl = new TTLPlugin({ resources: { jobs: { ttl: 86400000 } } });
await db.usePlugin(cookieFarm);
await db.usePlugin(puppeteer);
await db.usePlugin(queue);
await db.usePlugin(ttl);
// + 40 more lines of wiring...

// ✅ With CookieFarmSuite
const suite = new CookieFarmPlugin({
  namespace: 'persona',
  ttl: { queue: { ttl: 86400000 } }
});
await db.usePlugin(suite);
suite.setProcessor(processJob);
await suite.startProcessing();
```

---

**Q: Can I use Cookie Farm without the queue?**

A: Yes! Disable the queue and call Cookie Farm methods directly:

```javascript
const suite = new CookieFarmPlugin({
  namespace: 'persona',
  queue: { autoStart: false }  // Don't start queue
});

await db.usePlugin(suite);
await db.connect();

// Direct persona generation (no queue)
const result = await suite.cookieFarmPlugin.generatePersonas(10, {
  strategy: 'diverse'
});

console.log(`Generated ${result.personas.length} personas`);
```

Use this for:
- ✅ Testing and development
- ✅ Synchronous workflows
- ✅ Small-scale operations (<100 personas)
- ❌ NOT for production high-volume scenarios

---

**Q: What's the difference between `jobType` and `payload`?**

A:
- **`jobType`** (string, required): Identifies the **type** of job (e.g., `'generate'`, `'warmup'`, `'retire'`)
- **`payload`** (object, optional): Contains **data** specific to that job type

Think of `jobType` as the "command" and `payload` as the "arguments".

```javascript
await suite.enqueueJob({
  jobType: 'generate',     // Command: generate personas
  payload: {               // Arguments:
    count: 10,              //   - Generate 10 personas
    strategy: 'diverse'     //   - Use diverse strategy
  }
});

await suite.enqueueJob({
  jobType: 'warmup',       // Command: warmup persona
  payload: {               // Arguments:
    personaId: 'persona_abc123',  //   - Warmup this persona
    sites: ['google', 'facebook'] //   - On these sites
  }
});
```

You define how to interpret each `jobType` in your processor:

```javascript
suite.setProcessor(async (job, context, { cookieFarm }) => {
  if (job.jobType === 'generate') {
    return await cookieFarm.generatePersonas(job.payload.count, {
      strategy: job.payload.strategy
    });
  }
  if (job.jobType === 'warmup') {
    return await cookieFarm.warmupPersona(job.payload.personaId, {
      sites: job.payload.sites
    });
  }
  throw new Error(`Unknown job type: ${job.jobType}`);
});
```

---

**Q: How do I monitor the queue?**

A: Use `queuePlugin.getStats()` and event listeners:

```javascript
// Get stats manually
const stats = await suite.queuePlugin.getStats();
console.log('Queue stats:', {
  pending: stats.pending,        // Jobs waiting
  processing: stats.processing,  // Jobs in progress
  completed: stats.completed,    // Jobs finished
  failed: stats.failed,          // Jobs failed
  workers: stats.workers         // Active workers
});

// Or use event listeners
suite.on('job.queued', ({ job }) => {
  console.log(`Job ${job.id} queued`);
});

suite.on('job.started', ({ job, worker }) => {
  console.log(`Job ${job.id} started on ${worker}`);
});

suite.on('job.completed', ({ job, duration }) => {
  console.log(`Job ${job.id} completed in ${duration}ms`);
});

suite.on('job.failed', ({ job, error, attempts }) => {
  console.error(`Job ${job.id} failed (attempt ${attempts}):`, error.message);
});

// Periodic monitoring
setInterval(async () => {
  const stats = await suite.queuePlugin.getStats();
  if (stats.pending > 1000) {
    console.warn('Queue backlog detected!', stats);
  }
}, 30000);  // Every 30 seconds
```

---

**Q: Can I use multiple CookieFarmSuite instances in the same application?**

A: Yes, but use **different namespaces** to avoid resource conflicts:

```javascript
// Suite 1: For user-facing operations
const userSuite = new CookieFarmPlugin({
  namespace: 'user_persona',
  queue: { workers: 10 }
});

// Suite 2: For admin operations
const adminSuite = new CookieFarmPlugin({
  namespace: 'admin_persona',
  queue: { workers: 5 }
});

await db.usePlugin(userSuite, 'user-suite');
await db.usePlugin(adminSuite, 'admin-suite');

// Each suite has independent:
// - Queue resources (user_persona_persona_jobs, admin_persona_persona_jobs)
// - Workers
// - Configuration
```

---

## Configuration

**Q: What's the recommended worker count for production?**

A: It depends on your workload and infrastructure:

| Workload | Workers | Browser Pool | Rationale |
|----------|---------|--------------|-----------|
| **Light** (<100 jobs/hour) | 2-5 | `{ min: 1, max: 5 }` | Low concurrency, minimal resources |
| **Medium** (100-1000 jobs/hour) | 5-10 | `{ min: 5, max: 15 }` | Balanced throughput/cost |
| **Heavy** (1000-10000 jobs/hour) | 10-20 | `{ min: 10, max: 30 }` | High throughput |
| **Very Heavy** (>10000 jobs/hour) | 20-50 | `{ min: 20, max: 50 }` | Maximum concurrency |

**Guidelines:**
- Start conservative (5-10 workers) and monitor CPU/memory
- Match browser pool size to worker count (pool ≥ workers * 1.5)
- Increase gradually based on queue backlog
- Monitor queue stats every 30-60 seconds

```javascript
const suite = new CookieFarmPlugin({
  queue: {
    workers: 10,  // Start here
    visibilityTimeout: 300000
  },
  puppeteer: {
    pool: {
      size: { min: 5, max: 15 }  // 1.5x workers
    }
  }
});

// Monitor and adjust
setInterval(async () => {
  const stats = await suite.queuePlugin.getStats();
  if (stats.pending > 100 && stats.workers < 20) {
    console.warn('Consider increasing workers', stats);
  }
}, 60000);
```

---

**Q: How do I configure TTL for different resources?**

A: Use the `ttl` option to specify TTL per resource type:

```javascript
const suite = new CookieFarmPlugin({
  namespace: 'persona',
  ttl: {
    queue: { ttl: 86400000 },        // Queue jobs: 24 hours
    personas: { ttl: 2592000000 },    // Personas: 30 days
    sessions: { ttl: 3600000 }       // Sessions: 1 hour
  }
});
```

**TTL values** (milliseconds):
- 1 hour: `3600000`
- 12 hours: `43200000`
- 24 hours: `86400000`
- 7 days: `604800000`
- 30 days: `2592000000`
- `null`: Never expire (manual cleanup)

**Best practices:**
- Set `queue.ttl` to clean up completed jobs (24-48 hours)
- Set `personas.ttl` based on persona lifecycle (7-30 days)
- Use `null` for compliance/audit requirements
- Test TTL in staging before production

---

**Q: What visibility timeout should I use?**

A: Set visibility timeout based on your job complexity:

| Job Type | Duration | Visibility Timeout | Rationale |
|----------|----------|-------------------|-----------|
| **Fast** (<30s) | 10-30s | 60000ms (1 min) | Quick operations |
| **Medium** (30s-2min) | 30s-2min | 180000ms (3 min) | Normal workflows |
| **Slow** (2-5min) | 2-5min | 300000ms (5 min) | Complex operations |
| **Very Slow** (>5min) | >5min | 600000ms (10 min) | Browser automation, CAPTCHA |

**Formula:** `visibilityTimeout = avgJobDuration * 2 + 60000`

Example:
```javascript
// Average job duration: 90 seconds
// visibility Timeout = 90*2 + 60 = 240 seconds = 240000ms

const suite = new CookieFarmPlugin({
  queue: {
    visibilityTimeout: 240000  // 4 minutes
  }
});
```

**Warning:** If visibility timeout is too short:
- Jobs may be marked as failed prematurely
- Duplicate processing (job reappears while still running)
- Wasted resources

---

**Q: How do I enable proxy support?**

A: Configure puppeteer proxy settings:

```javascript
const suite = new CookieFarmPlugin({
  namespace: 'persona',
  puppeteer: {
    proxy: {
      enabled: true,
      providers: ['brightdata', 'oxylabs', 'smartproxy'],
      rotationStrategy: 'round-robin',  // or 'least-used', 'random'
      healthCheck: true,
      healthCheckInterval: 300000,      // 5 minutes
      config: {
        brightdata: {
          host: 'proxy.brightdata.com',
          port: 22225,
          username: process.env.BRIGHTDATA_USER,
          password: process.env.BRIGHTDATA_PASS
        },
        oxylabs: {
          host: 'proxy.oxylabs.io',
          port: 7777,
          username: process.env.OXYLABS_USER,
          password: process.env.OXYLABS_PASS
        }
      }
    }
  }
});
```

**Rotation strategies:**
- `round-robin`: Cycle through proxies sequentially (default)
- `least-used`: Use proxy with lowest usage count
- `random`: Random proxy selection
- `health-based`: Use healthiest proxies first

**Health checks:**
- Automatically detect failed proxies
- Remove unhealthy proxies from rotation
- Re-check after `healthCheckInterval`

---

**Q: How do I handle CAPTCHA challenges?**

A: Enable CAPTCHA solving via 2captcha or similar services:

```javascript
const suite = new CookieFarmPlugin({
  namespace: 'persona',
  puppeteer: {
    captcha: {
      enabled: true,
      provider: '2captcha',                   // or 'anticaptcha', 'deathbycaptcha'
      apiKey: process.env.CAPTCHA_API_KEY,
      timeout: 120000,                        // 2 minutes per CAPTCHA
      maxRetries: 2,
      types: ['recaptcha-v2', 'recaptcha-v3', 'hcaptcha']
    }
  },
  queue: {
    workers: 5,                               // Lower concurrency (CAPTCHA rate limits)
    visibilityTimeout: 600000                 // 10 minutes (CAPTCHA takes time)
  }
});
```

**CAPTCHA providers:**
- **2captcha**: Most popular, $2.99/1000 CAPTCHAs
- **AntiCaptcha**: Fast, $1-3/1000 CAPTCHAs
- **DeathByCaptcha**: Premium, $1.39/1000 CAPTCHAs

**Best practices:**
- Lower worker concurrency (5-10) to avoid rate limits
- Increase visibility timeout (10+ minutes)
- Handle `CaptchaError` (non-retriable)
- Monitor CAPTCHA API quota/costs

---

## Queue & Jobs

**Q: How do I prioritize certain jobs over others?**

A: Use the `priority` option when enqueuing:

```javascript
// High priority job (processed first)
await suite.enqueueJob({
  jobType: 'generate',
  payload: { count: 10, urgent: true }
}, {
  priority: 100  // Higher priority
});

// Normal priority job
await suite.enqueueJob({
  jobType: 'warmup',
  payload: { personaId: 'persona_abc' }
}, {
  priority: 10  // Normal priority
});

// Low priority job (processed last)
await suite.enqueueJob({
  jobType: 'cleanup',
  payload: { olderThan: 30 }
}, {
  priority: 1  // Low priority
});
```

**Priority values:**
- Higher number = higher priority
- Default: `0`
- Range: `-999` to `999`

Jobs are processed in priority order (highest first), then FIFO within same priority.

---

**Q: Can I delay job execution?**

A: Yes, use `delayMs` option:

```javascript
// Execute immediately
await suite.enqueueJob({
  jobType: 'generate',
  payload: { count: 10 }
});

// Execute after 1 hour
await suite.enqueueJob({
  jobType: 'warmup',
  payload: { personaId: 'persona_abc' }
}, {
  delayMs: 3600000  // 1 hour delay
});

// Execute after 24 hours
await suite.enqueueJob({
  jobType: 'cleanup',
  payload: { olderThan: 30 }
}, {
  delayMs: 86400000  // 24 hour delay
});
```

**Use cases:**
- Schedule warmup after persona generation
- Delayed cleanup jobs
- Retry with exponential backoff
- Rate limiting

---

**Q: How do I prevent duplicate jobs?**

A: Use `deduplicationKey`:

```javascript
// Without deduplication (creates 3 separate jobs)
for (let i = 0; i < 3; i++) {
  await suite.enqueueJob({
    jobType: 'generate',
    payload: { count: 10 }
  });
}
// Result: 3 jobs created

// With deduplication (creates 1 job)
for (let i = 0; i < 3; i++) {
  await suite.enqueueJob({
    jobType: 'generate',
    payload: { count: 10 }
  }, {
    deduplicationKey: 'generate-10'  // Same key = deduplicated
  });
}
// Result: 1 job created (duplicates ignored)
```

**Deduplication window:**
Configure how long to track duplicates:

```javascript
const suite = new CookieFarmPlugin({
  queue: {
    deduplicationWindow: 600000  // 10 minutes
  }
});
```

After 10 minutes, the same `deduplicationKey` can create a new job.

---

**Q: What happens to failed jobs?**

A: Failed jobs follow this flow:

1. **Retriable error** → Retry with exponential backoff
2. **Max retries exceeded** → Move to Dead Letter Queue (DLQ)
3. **Non-retriable error** → Move to DLQ immediately

```javascript
suite.setProcessor(async (job, context, { cookieFarm }) => {
  try {
    return await cookieFarm.generatePersonas(job.payload.count);
  } catch (error) {
    // Classify error
    if (error.name === 'RateLimitError') {
      error.retriable = true;  // Retry with backoff
      throw error;
    }
    if (error.name === 'ValidationError') {
      error.retriable = false;  // Don't retry, move to DLQ
      throw error;
    }
    throw error;  // Default: retriable
  }
});
```

**DLQ Processing:**
```javascript
// Check DLQ every 5 minutes
setInterval(async () => {
  const dlqResource = await db.getResource('persona_dlq');
  const failedJobs = await dlqResource.query({ status: 'failed' }, { limit: 100 });

  for (const job of failedJobs.items) {
    console.log('Failed job:', {
      id: job.id,
      jobType: job.data.jobType,
      error: job.data.error,
      attempts: job.data.retryCount
    });

    // Analyze and potentially retry manually
    if (shouldRetry(job)) {
      await suite.enqueueJob(job.data);
      await dlqResource.delete(job.id);
    }
  }
}, 300000);
```

---

**Q: How do I stop processing gracefully?**

A: Use `stopProcessing()` with timeout:

```javascript
// Graceful shutdown (wait for jobs to finish)
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down...');

  // Stop accepting new jobs
  await suite.stopProcessing({
    timeout: 30000  // Wait up to 30 seconds
  });

  // Disconnect database
  await db.disconnect();

  console.log('Shutdown complete');
  process.exit(0);
});

// Force shutdown (immediate)
process.on('SIGKILL', async () => {
  console.log('Received SIGKILL, force stopping...');

  await suite.stopProcessing({ force: true });
  await db.disconnect();

  process.exit(1);
});
```

**What happens during graceful shutdown:**
1. Stop dequeuing new jobs
2. Wait for in-progress jobs to complete (up to `timeout`)
3. Return unfinished jobs to queue
4. Close worker threads

---

## Performance & Scaling

**Q: How many personas can I generate per hour?**

A: Depends on your configuration and infrastructure:

| Configuration | Personas/Hour | Cost Estimate |
|---------------|---------------|---------------|
| **Minimal** (2 workers, no proxy) | 50-100 | ~$1/month (S3 only) |
| **Small** (5 workers, 1 proxy) | 200-500 | ~$20/month |
| **Medium** (10 workers, 3 proxies) | 1000-2000 | ~$100/month |
| **Large** (20 workers, 10 proxies) | 5000-10000 | ~$500/month |
| **Enterprise** (50 workers, 30 proxies) | 20000-50000 | ~$2000/month |

**Bottlenecks:**
- Worker concurrency (more workers = higher throughput)
- Browser pool size (pool exhaustion slows down)
- Proxy availability (no proxies = slow/blocked)
- CAPTCHA solving (adds 30-120s per persona)
- S3 write throughput (3500 PUT/s per prefix)

---

**Q: What's the difference between browser pool min/max sizes?**

A:
- **`min`**: Minimum browsers kept **warm** (always running)
- **`max`**: Maximum browsers allowed **total** (warm + cold)

```javascript
const suite = new CookieFarmPlugin({
  puppeteer: {
    pool: {
      size: { min: 5, max: 20 }
    }
  }
});
```

**What happens:**
1. Plugin starts: Create 5 browsers immediately (min)
2. High load: Create up to 20 browsers total (max)
3. Low load: Keep 5 browsers warm, close extras
4. Pool exhausted: Wait for available browser or throw `BrowserPoolError`

**Guidelines:**
- `min` = baseline load (e.g., 5 for 5-10 workers)
- `max` = peak load (e.g., 20 for 20 workers)
- `min` too high = wasted resources (unused browsers)
- `max` too low = pool exhaustion, slow jobs

---

**Q: How do I reduce memory usage?**

A: Several strategies:

**1. Enable TTL for automatic cleanup**
```javascript
const suite = new CookieFarmPlugin({
  ttl: {
    queue: { ttl: 86400000 },      // 24 hours
    personas: { ttl: 2592000000 }   // 30 days
  }
});
```

**2. Limit browser pool size**
```javascript
const suite = new CookieFarmPlugin({
  puppeteer: {
    pool: {
      size: { min: 2, max: 10 },   // Fewer browsers
      maxIdleTime: 600000           // Close idle after 10 min
    }
  }
});
```

**3. Reduce worker concurrency**
```javascript
const suite = new CookieFarmPlugin({
  queue: {
    workers: 5  // Fewer workers = less memory
  }
});
```

**4. Manual cleanup**
```javascript
setInterval(async () => {
  const queueResource = await db.getResource(suite.jobsResource);
  const completed = await queueResource.query(
    { status: 'completed' },
    { limit: 1000 }
  );

  for (const job of completed.items) {
    await queueResource.delete(job.id);
  }

  console.log(`Cleaned up ${completed.items.length} jobs`);
}, 3600000);  // Every hour
```

---

**Q: Can I distribute workers across multiple servers?**

A: Yes! CookieFarmSuite works great in distributed environments:

```javascript
// Server 1
const suite1 = new CookieFarmPlugin({
  namespace: 'persona',
  queue: {
    autoStart: true,
    workers: 10
  }
});

// Server 2 (same namespace, different workers)
const suite2 = new CookieFarmPlugin({
  namespace: 'persona',  // Same namespace!
  queue: {
    autoStart: true,
    workers: 10
  }
});

// Both servers process from the same queue
// Total: 20 workers across 2 servers
```

**Key points:**
- ✅ Same `namespace` = shared queue
- ✅ Workers coordinate via S3 metadata (ETag locking)
- ✅ Zero-duplication guarantee (pessimistic locking)
- ✅ Automatic load balancing (workers grab available jobs)
- ⚠️ Ensure visibility timeout > network latency + job duration

---

## Troubleshooting

**Q: Why are my jobs stuck in "pending" state?**

A: Common causes:

1. **No processor set**
   ```javascript
   // Fix: Set processor
   suite.setProcessor(processJob);
   await suite.startProcessing();
   ```

2. **Workers not started**
   ```javascript
   // Fix: Start workers
   await suite.startProcessing();
   ```

3. **Queue resource not found**
   ```javascript
   // Fix: Verify resource exists
   const resources = await db.listResources();
   console.log('Resources:', resources.map(r => r.name));
   ```

4. **Visibility timeout too short**
   ```javascript
   // Fix: Increase timeout
   const suite = new CookieFarmPlugin({
     queue: {
       visibilityTimeout: 300000  // 5 minutes
     }
   });
   ```

---

**Q: Why am I seeing `BrowserPoolError: No available browsers`?**

A: Browser pool exhaustion. Solutions:

1. **Increase pool size**
   ```javascript
   const suite = new CookieFarmPlugin({
     puppeteer: {
       pool: {
         size: { min: 10, max: 30 }  // Increase max
       }
     }
   });
   ```

2. **Reduce workers**
   ```javascript
   const suite = new CookieFarmPlugin({
     queue: {
       workers: 5  // Match pool size
     }
   });
   ```

3. **Ensure browsers are released**
   ```javascript
   suite.setProcessor(async (job, context, { puppeteer }) => {
     const browser = await puppeteer.acquire();
     try {
       // Use browser...
     } finally {
       await puppeteer.release(browser);  // Always release!
     }
   });
   ```

---

**Q: How do I debug slow job processing?**

A: Profile your processor:

```javascript
suite.setProcessor(async (job, context, helpers) => {
  const startTime = Date.now();
  console.log(`[${job.id}] Started`);

  const step1Start = Date.now();
  await step1();
  console.log(`[${job.id}] Step 1: ${Date.now() - step1Start}ms`);

  const step2Start = Date.now();
  await step2();
  console.log(`[${job.id}] Step 2: ${Date.now() - step2Start}ms`);

  const totalTime = Date.now() - startTime;
  console.log(`[${job.id}] Total: ${totalTime}ms`);

  return { duration: totalTime };
});
```

Common slow operations:
- Browser launch/page creation (30-60s)
- Proxy connection (5-30s)
- CAPTCHA solving (30-120s)
- Network requests (1-10s each)
- S3 writes (100-500ms each)

---

**Q: What does "Queue backlog detected" mean?**

A: Too many pending jobs relative to processing capacity.

**Diagnosis:**
```javascript
const stats = await suite.queuePlugin.getStats();
console.log('Queue health:', {
  pending: stats.pending,
  processing: stats.processing,
  workers: stats.workers,
  ratio: stats.pending / stats.processing  // > 10 = backlog
});
```

**Solutions:**

1. **Increase workers**
   ```javascript
   await suite.stopProcessing();
   await suite.startProcessing({ workers: 20 });  // Increase from 10
   ```

2. **Scale horizontally** (add more servers)
   ```javascript
   // Deploy suite on additional servers with same namespace
   ```

3. **Optimize job processing**
   ```javascript
   // Enable browser pooling, proxy rotation, batching
   ```

4. **Reduce incoming job rate**
   ```javascript
   // Rate limit job enqueueing
   ```

---

**Q: How do I test CookieFarmSuite locally?**

A: Use minimal configuration and MemoryClient:

```javascript
import { Database } from 's3db.js';
import { CookieFarmPlugin } from 's3db.js';

// Use memory client for testing (no S3 required)
const db = new Database({
  connectionString: 'memory://test/db'
});

// Minimal suite for testing
const suite = new CookieFarmPlugin({
  namespace: 'test',
  queue: {
    autoStart: false,  // Manual start
    workers: 1         // Single worker
  },
  puppeteer: {
    pool: { enabled: false },  // No pooling
    headless: false            // See browser (useful for debugging)
  }
});

await db.usePlugin(suite);
await db.connect();

// Test job processor
suite.setProcessor(async (job, context, helpers) => {
  console.log('Processing job:', job);
  return { success: true };
});

// Enqueue test job
await suite.enqueueJob({
  jobType: 'test',
  payload: { message: 'Hello, world!' }
});

// Process manually
await suite.startProcessing();

// Wait a bit...
await new Promise(resolve => setTimeout(resolve, 5000));

// Check results
const stats = await suite.queuePlugin.getStats();
console.log('Test results:', stats);

await suite.stopProcessing();
await db.disconnect();
```

---

**Q: Can I integrate CookieFarmSuite with AWS Lambda?**

A: Yes, but with limitations:

```javascript
// Lambda handler
import { Database } from 's3db.js';
import { CookieFarmPlugin } from 's3db.js';

// Initialize outside handler (reused across invocations)
const db = new Database({
  connectionString: process.env.S3DB_CONNECTION
});

const suite = new CookieFarmPlugin({
  namespace: 'lambda_persona',
  queue: {
    workers: 1,              // Lambda is single-threaded
    autoStart: false         // Manual trigger
  },
  puppeteer: {
    pool: { enabled: false },
    headless: true,
    launchOptions: {
      executablePath: '/opt/chrome/chrome',  // Chromium Layer
      args: ['--disable-dev-shm-usage', '--no-sandbox']
    }
  }
});

await db.usePlugin(suite);
await db.connect();

suite.setProcessor(processJob);

export const handler = async (event) => {
  // Enqueue jobs from event
  for (const item of event.Records) {
    await suite.enqueueJob(JSON.parse(item.body));
  }

  // Process one job per invocation
  await suite.queuePlugin.processNext();

  return { statusCode: 200 };
};
```

**Lambda limitations:**
- Single-threaded (workers: 1)
- No browser pooling
- 15-minute max execution time
- 10GB max memory
- Requires Chromium Layer (adds ~300MB)
