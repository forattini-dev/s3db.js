# 💡 Usage Patterns for Cookie Farm

**Prev:** [← Configuration](./configuration.md)
**Next:** [Best Practices →](./best-practices.md)
**Main:** [← Cookie Farm Plugin](/plugins/cookie-farm/README.md) | **All guides:** [Index](/plugins/cookie-farm/README.md#-documentation-guides)

> **In this guide:**
> - 5 progressive real-world patterns
> - Complete working code for each pattern
> - Copy-paste ready recipes
> - Common patterns comparison

**Time to read:** 20 minutes
**Difficulty:** Intermediate-Advanced

---

## Pattern Overview

| Pattern | Use Case | Workers | Features | Complexity |
|---------|----------|---------|----------|------------|
| **1: Basic** | Simple generation | 1 | Core only | ⭐ Beginner |
| **2: Queue** | Async processing | 5 | Retries, DLQ | ⭐⭐ Intermediate |
| **3: Production** | Full-featured | 10+ | Monitoring, TTL | ⭐⭐⭐ Advanced |
| **4: Multi-Stage** | Complex workflows | 5 | Conditional, delayed | ⭐⭐⭐ Advanced |
| **5: Error Recovery** | Resilient pipelines | 5 | Granular errors, DLQ | ⭐⭐⭐ Advanced |

---

## Pattern 1: Basic Persona Generation

**Use case:** Simple, synchronous generation without queue complexity.

**Best for:**
- ✅ Testing and development
- ✅ One-time persona creation
- ✅ Simple scripts
- ❌ NOT for production (no retry, no DLQ)

### Code

```javascript
import { Database, CookieFarmPlugin } from 's3db.js';

const db = new Database({
  connectionString: process.env.S3DB_CONNECTION
});

// Minimal configuration - no queue
const suite = new CookieFarmPlugin({
  namespace: 'persona',
  queue: { autoStart: false },  // Disable queue
  cookieFarm: {
    generation: { count: 0 },    // No auto-generation
    warmup: { enabled: false }
  },
  puppeteer: {
    pool: { enabled: false }     // Single browser
  }
});

await db.usePlugin(suite);
await db.connect();

// Direct persona generation (bypass queue)
try {
  const result = await suite.cookieFarmPlugin.generatePersonas(5, {
    strategy: 'diverse',
    proxyRotation: true
  });

  console.log(`✅ Generated ${result.personas.length} personas`);
  console.log('Sample personas:');
  for (const p of result.personas) {
    console.log(`  - ${p.email} (${p.userAgent.slice(0, 50)}...)`);
  }
} catch (error) {
  console.error('❌ Generation failed:', error.message);
} finally {
  await db.disconnect();
}
```

### When to Use

- ✅ Testing code locally
- ✅ One-off persona creation
- ✅ Development scripts
- ✅ CLI tools

### Limitations

- ❌ No automatic retry
- ❌ No distributed processing
- ❌ No job tracking
- ❌ No browser pooling overhead

---

## Pattern 2: Queue-Based Processing

**Use case:** Asynchronous job processing with automatic retry and error recovery.

**Best for:**
- ✅ Continuous persona generation
- ✅ High-volume operations
- ✅ Distributed processing
- ✅ Retry logic needed

### Code

```javascript
import { Database, CookieFarmPlugin } from 's3db.js';

const db = new Database({
  connectionString: process.env.S3DB_CONNECTION
});

const suite = new CookieFarmPlugin({
  namespace: 'persona',
  queue: {
    autoStart: true,                  // Start workers automatically
    workers: 5,                       // 5 concurrent workers
    visibilityTimeout: 300000,        // 5 minutes per job
    maxRetries: 3,                    // Retry 3 times
    deadLetterResource: 'persona_dlq' // Store permanent failures
  },
  cookieFarm: {
    generation: { count: 100, batchSize: 10 }
  },
  ttl: {
    queue: { ttl: 86400000 }         // Auto-cleanup after 24 hours
  }
});

await db.usePlugin(suite);
await db.connect();

// Define job processor
suite.setProcessor(async (job, context, { cookieFarm }) => {
  try {
    const result = await cookieFarm.generatePersonas(job.payload.count);
    return { success: true, count: result.personas.length };
  } catch (error) {
    console.error(`Job ${job.id} failed:`, error.message);
    throw error;  // Queue will retry based on maxRetries
  }
});

// Enqueue jobs
for (let i = 0; i < 10; i++) {
  await suite.enqueueJob({
    jobType: 'generate',
    payload: { count: 10, batch: i + 1 }
  });
}

console.log('Enqueued 10 jobs. Workers processing...');

// Monitor progress
suite.on('job.completed', ({ job, result, duration }) => {
  console.log(`✅ Job ${job.id} completed in ${duration}ms`, result);
});

suite.on('job.failed', ({ job, error, attempts }) => {
  console.error(`❌ Job ${job.id} failed (attempt ${attempts}):`, error.message);
});

suite.on('job.dead_letter', ({ job, error }) => {
  console.error(`💀 Job ${job.id} moved to DLQ after max retries:`, error.message);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await suite.stopProcessing();
  await db.disconnect();
  process.exit(0);
});
```

### Monitoring Queue Stats

```javascript
setInterval(async () => {
  const stats = await suite.queuePlugin.getStats();
  console.log('Queue Status:', {
    pending: stats.pending,
    processing: stats.processing,
    completed: stats.completed,
    failed: stats.failed
  });
}, 10000);  // Every 10 seconds
```

### When to Use

- ✅ High-volume operations (100+ jobs/day)
- ✅ Production environments
- ✅ Distributed systems
- ✅ When retry logic matters

---

## Pattern 3: Production Pipeline

**Use case:** Full-featured production setup with monitoring, caching, and metrics.

**Best for:**
- ✅ Mission-critical pipelines
- ✅ 1000+ personas/day
- ✅ Multi-region deployments
- ✅ Compliance requirements

### Code

```javascript
import {
  Database,
  CookieFarmPlugin,
  CachePlugin,
  AuditPlugin,
  MetricsPlugin
} from 's3db.js';

const db = new Database({
  connectionString: process.env.S3DB_CONNECTION
});

// Layer 1: Add caching
await db.usePlugin(new CachePlugin({
  driver: 'memory',
  ttl: 3600000,
  config: {
    maxMemoryPercent: 0.1,
    enableCompression: true
  }
}));

// Layer 2: Add audit trail
await db.usePlugin(new AuditPlugin({
  resource: 'audit_log',
  captureData: true,
  events: ['insert', 'update', 'delete']
}));

// Layer 3: Add metrics
await db.usePlugin(new MetricsPlugin({
  resource: 'metrics',
  interval: 60000,
  aggregations: ['count', 'avg', 'p95', 'p99']
}));

// Layer 4: Setup Cookie Farm Suite
const suite = new CookieFarmPlugin({
  namespace: 'persona',
  queue: {
    autoStart: true,
    workers: 10,
    visibilityTimeout: 300000,
    maxRetries: 3,
    deadLetterResource: 'persona_dlq',
    deduplicationWindow: 600000  // 10 minutes
  },
  cookieFarm: {
    generation: {
      count: 100,
      batchSize: 10,
      strategy: 'diverse'
    },
    warmup: {
      enabled: true,
      strategy: 'gradual',
      interval: 3600000,
      minAge: 86400000  // Warmup after 24 hours
    },
    retirement: {
      enabled: true,
      maxAge: 2592000000  // Retire after 30 days
    }
  },
  puppeteer: {
    pool: {
      enabled: true,
      size: { min: 5, max: 20 },
      timeout: 120000,
      warmup: true
    },
    proxy: {
      enabled: true,
      providers: ['brightdata', 'oxylabs'],
      rotationStrategy: 'round-robin',
      healthCheck: true
    },
    captcha: {
      enabled: true,
      provider: '2captcha',
      apiKey: process.env.CAPTCHA_API_KEY
    }
  },
  ttl: {
    queue: { ttl: 86400000 },        // 24 hours
    personas: { ttl: 2592000000 }    // 30 days
  }
});

await db.usePlugin(suite);
await db.connect();

// Comprehensive processor with error handling
suite.setProcessor(async (job, context, { cookieFarm, puppeteer, enqueue }) => {
  const startTime = Date.now();

  try {
    let result;

    switch (job.jobType) {
      case 'generate':
        result = await cookieFarm.generatePersonas(job.payload.count, {
          strategy: job.payload.strategy || 'diverse',
          proxyRotation: true,
          solveCaptcha: true
        });

        // Enqueue warmup jobs for new personas
        for (const persona of result.personas) {
          await enqueue({
            jobType: 'warmup',
            payload: { personaId: persona.id },
            delayMs: 86400000  // Warmup after 24 hours
          });
        }
        break;

      case 'warmup':
        result = await cookieFarm.warmupPersona(job.payload.personaId, {
          sites: job.payload.sites || ['google', 'facebook', 'twitter'],
          interactions: job.payload.interactions || 10
        });
        break;

      case 'retire':
        result = await cookieFarm.retirePersona(job.payload.personaId);
        break;

      default:
        throw new Error(`Unknown job type: ${job.jobType}`);
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Job ${job.id} completed in ${duration}ms`);

    return { success: true, duration, ...result };

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Job ${job.id} failed after ${duration}ms:`, error.message);

    // Classify errors
    if (error.name === 'BrowserPoolError' || error.name === 'ProxyError') {
      error.retriable = true;   // Retry pool/proxy issues
    } else if (error.name === 'CaptchaError') {
      error.retriable = false;  // Don't retry CAPTCHA API failures
    }

    throw error;
  }
});

// Comprehensive monitoring
suite.on('job.completed', ({ job, result, duration }) => {
  console.log(`✅ [${job.jobType}] completed in ${duration}ms`);

  // Track metrics
  db.metrics.increment('jobs.completed', 1, {
    tags: { jobType: job.jobType }
  });
  db.metrics.histogram('jobs.duration', duration, {
    tags: { jobType: job.jobType }
  });
});

suite.on('job.failed', ({ job, error, attempts }) => {
  console.error(`❌ [${job.jobType}] failed (attempt ${attempts}/${job.maxRetries})`);

  db.metrics.increment('jobs.failed', 1, {
    tags: { jobType: job.jobType, errorType: error.name }
  });
});

suite.on('job.dead_letter', ({ job, error }) => {
  console.error(`💀 [${job.jobType}] moved to DLQ`);

  db.metrics.increment('jobs.dead_letter', 1, {
    tags: { jobType: job.jobType }
  });

  // Alert operations team
  sendAlert({
    level: 'error',
    message: `Job ${job.id} failed permanently`,
    jobType: job.jobType,
    error: error.message
  });
});

// Health check endpoint
setInterval(async () => {
  const stats = await suite.queuePlugin.getStats();
  const browserStats = await suite.puppeteerPlugin.pool.getStats();

  const health = {
    status: 'healthy',
    queue: stats,
    browserPool: browserStats,
    timestamp: new Date().toISOString()
  };

  console.log('Health:', JSON.stringify(health));

  // Check for issues
  if (stats.pending > 1000) {
    console.warn('Queue backlog detected!');
  }
  if (browserStats.active >= browserStats.maxSize) {
    console.warn('Browser pool exhausted!');
  }
}, 30000);  // Every 30 seconds

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await suite.stopProcessing({ timeout: 30000 });
  await db.disconnect();
  process.exit(0);
});
```

### When to Use

- ✅ Production environments
- ✅ 1000+ personas/day
- ✅ Monitoring requirements
- ✅ Multi-region deployments

---

## Pattern 4: Multi-Stage Workflows

**Use case:** Complex persona lifecycle with dependencies between stages.

**Best for:**
- ✅ Persona generation → verification → warmup
- ✅ Conditional stage transitions
- ✅ Long-running processes (days/weeks)
- ✅ Monitoring at each stage

### Code

```javascript
import { Database, CookieFarmPlugin } from 's3db.js';

const db = new Database({
  connectionString: process.env.S3DB_CONNECTION
});

const suite = new CookieFarmPlugin({
  namespace: 'persona',
  queue: { autoStart: true, workers: 5 }
});

await db.usePlugin(suite);
await db.connect();

// Multi-stage processor with state transitions
suite.setProcessor(async (job, context, { cookieFarm, enqueue }) => {
  const stage = job.payload.stage || 'generate';

  switch (stage) {
    case 'generate':
      // Stage 1: Generate personas
      console.log(`🔵 Stage 1: Generating personas...`);
      const personas = await cookieFarm.generatePersonas(job.payload.count);

      // Enqueue Stage 2 jobs for each persona
      for (const persona of personas.personas) {
        await enqueue({
          jobType: 'multi-stage',
          payload: { stage: 'verify', personaId: persona.id }
        });
      }

      console.log(`✅ Stage 1: Generated ${personas.personas.length} personas`);
      return { stage: 'generate', count: personas.personas.length };

    case 'verify':
      // Stage 2: Verify persona credentials
      console.log(`🟡 Stage 2: Verifying persona ${job.payload.personaId}...`);
      await cookieFarm.verifyPersona(job.payload.personaId);

      // Enqueue Stage 3 job
      await enqueue({
        jobType: 'multi-stage',
        payload: { stage: 'warmup', personaId: job.payload.personaId },
        delayMs: 3600000  // Warmup after 1 hour
      });

      console.log(`✅ Stage 2: Verified persona ${job.payload.personaId}`);
      return { stage: 'verify', personaId: job.payload.personaId };

    case 'warmup':
      // Stage 3: Warmup persona on target sites
      console.log(`🟠 Stage 3: Warming up persona ${job.payload.personaId}...`);
      await cookieFarm.warmupPersona(job.payload.personaId, {
        sites: ['google', 'facebook', 'amazon'],
        interactions: 20
      });

      // Enqueue Stage 4 job
      await enqueue({
        jobType: 'multi-stage',
        payload: { stage: 'monitor', personaId: job.payload.personaId },
        delayMs: 86400000  // Monitor after 24 hours
      });

      console.log(`✅ Stage 3: Warmed up persona ${job.payload.personaId}`);
      return { stage: 'warmup', personaId: job.payload.personaId };

    case 'monitor':
      // Stage 4: Monitor persona health
      console.log(`🔴 Stage 4: Monitoring persona ${job.payload.personaId}...`);
      const health = await cookieFarm.checkPersonaHealth(job.payload.personaId);

      if (!health.healthy) {
        // Re-warmup if unhealthy
        console.log(`⚠️ Persona unhealthy, re-warming...`);
        await enqueue({
          jobType: 'multi-stage',
          payload: { stage: 'warmup', personaId: job.payload.personaId }
        });
      } else {
        // Schedule next health check
        await enqueue({
          jobType: 'multi-stage',
          payload: { stage: 'monitor', personaId: job.payload.personaId },
          delayMs: 86400000  // Check again in 24 hours
        });
      }

      console.log(`✅ Stage 4: Monitored persona ${job.payload.personaId}`, health);
      return { stage: 'monitor', personaId: job.payload.personaId, health };

    default:
      throw new Error(`Unknown stage: ${stage}`);
  }
});

// Monitor progress through stages
const stageProgress = {};

suite.on('job.completed', ({ job, result }) => {
  const key = result.personaId || 'batch';
  if (!stageProgress[key]) stageProgress[key] = [];

  stageProgress[key].push({
    stage: result.stage,
    timestamp: new Date().toISOString()
  });

  console.log(`Progress [${key}]:`, stageProgress[key]);
});

// Start pipeline by generating 10 personas
await suite.enqueueJob({
  jobType: 'multi-stage',
  payload: { stage: 'generate', count: 10 }
});

console.log('Multi-stage pipeline started!');
console.log('Flow: Generate → Verify → Warmup → Monitor → ...');
```

### Pipeline Flow Visualization

```
Generate (10 personas)
  ├─ Verify (Job 1)
  │  ├─ Warmup (Job 2, delayed 1 hour)
  │  │  └─ Monitor (Job 3, delayed 24 hours)
  │  │     ├─ Monitor (again, if healthy)
  │  │     └─ Warmup (again, if unhealthy)
  ├─ Verify (Job 4)
  │  └─ ...
  └─ Verify (Job 10)
     └─ ...
```

### When to Use

- ✅ Multi-stage processes
- ✅ Conditional branching
- ✅ Delayed execution needed
- ✅ Long-running workflows (days/weeks)

---

## Pattern 5: Error Recovery

**Use case:** Robust error handling with custom retry strategies and DLQ processing.

**Best for:**
- ✅ Unreliable environments (proxies, networks)
- ✅ External API dependencies
- ✅ Manual intervention needed
- ✅ Compliance tracking

### Code

```javascript
import { Database, CookieFarmPlugin } from 's3db.js';

const db = new Database({
  connectionString: process.env.S3DB_CONNECTION
});

const suite = new CookieFarmPlugin({
  namespace: 'persona',
  queue: {
    autoStart: true,
    workers: 5,
    visibilityTimeout: 300000,
    maxRetries: 5,                    // Retry up to 5 times
    deadLetterResource: 'persona_dlq',
    retryStrategy: 'exponential'      // 2s → 4s → 8s → 16s → 32s
  }
});

await db.usePlugin(suite);
await db.connect();

// Processor with granular error handling
suite.setProcessor(async (job, context, { cookieFarm }) => {
  try {
    return await cookieFarm.generatePersonas(job.payload.count);

  } catch (error) {
    // Classify error type
    if (error.name === 'RateLimitError') {
      // Retriable: wait for rate limit to reset
      console.warn(`Rate limit hit for job ${job.id}, will retry`);
      error.retriable = true;
      error.retryDelayMs = error.retryAfter || 60000;
      throw error;

    } else if (error.name === 'ProxyError') {
      // Retriable: proxy rotation needed
      console.warn(`Proxy error for job ${job.id}, rotating proxy`);
      error.retriable = true;
      throw error;

    } else if (error.name === 'CaptchaError') {
      // Non-retriable: CAPTCHA API failure
      console.error(`CAPTCHA API failure for job ${job.id}`);
      error.retriable = false;
      throw error;

    } else if (error.name === 'ValidationError') {
      // Non-retriable: invalid job payload
      console.error(`Invalid payload for job ${job.id}:`, error.message);
      error.retriable = false;
      throw error;

    } else {
      // Unknown error: retry with caution
      console.error(`Unknown error for job ${job.id}:`, error);
      error.retriable = true;
      throw error;
    }
  }
});

// DLQ processor: handle permanently failed jobs
const dlqResource = await db.getResource('persona_dlq');

setInterval(async () => {
  const failedJobs = await dlqResource.query(
    { status: 'failed' },
    { limit: 100 }
  );

  for (const job of failedJobs.items) {
    console.log(`Processing DLQ job ${job.id}:`, {
      jobType: job.data.jobType,
      payload: job.data.payload,
      error: job.data.error,
      attempts: job.data.retryCount
    });

    // Analyze failure reason
    if (job.data.error?.name === 'CaptchaError') {
      // Alert: CAPTCHA API may be down
      sendAlert({
        level: 'critical',
        message: 'CAPTCHA API failures detected',
        count: failedJobs.items.filter(
          j => j.data.error?.name === 'CaptchaError'
        ).length
      });
    }

    // Optionally: Manual retry with modified payload
    if (shouldRetryManually(job)) {
      console.log(`Manual retry scheduled for job ${job.id}`);
      await suite.enqueueJob({
        ...job.data,
        payload: { ...job.data.payload, manualRetry: true }
      });
      await dlqResource.delete(job.id);
    }
  }
}, 300000);  // Check DLQ every 5 minutes

function shouldRetryManually(job) {
  // Retry if:
  // 1. Error was retriable but max retries exceeded
  // 2. Job is less than 24 hours old
  // 3. Payload is still valid
  const age = Date.now() - new Date(job.createdAt).getTime();
  return (
    job.data.error?.retriable &&
    age < 86400000 &&
    validatePayload(job.data.payload)
  );
}

function validatePayload(payload) {
  // Check if payload is still valid
  return payload && payload.count > 0;
}

// Error statistics
const errorStats = {};

suite.on('job.failed', ({ job, error }) => {
  const errorName = error.name || 'Unknown';
  errorStats[errorName] = (errorStats[errorName] || 0) + 1;

  console.log('Error distribution:', errorStats);
});
```

### Error Handling Strategy Table

| Error Type | Retriable? | Action | Retry Delay |
|------------|-----------|--------|-------------|
| `RateLimitError` | ✅ Yes | Wait for reset | Custom (from API) |
| `ProxyError` | ✅ Yes | Rotate proxy | Exponential backoff |
| `CaptchaError` | ❌ No | Move to DLQ, alert | N/A |
| `ValidationError` | ❌ No | Move to DLQ | N/A |
| `BrowserPoolError` | ✅ Yes | Wait for browser | Exponential backoff |
| Unknown | ✅ Yes (cautious) | Retry with backoff | Exponential backoff |

### When to Use

- ✅ External API dependencies
- ✅ Resource contention scenarios
- ✅ Unreliable infrastructure
- ✅ Manual intervention required

---

## Copy-Paste Recipes

### Recipe 1: PostgreSQL Analytics Sync

Generate personas and sync to PostgreSQL:

```javascript
import { Database, CookieFarmPlugin, ReplicatorPlugin } from 's3db.js';

const db = new Database({
  connectionString: process.env.S3DB_CONNECTION
});

// Setup Replicator to sync to PostgreSQL
await db.usePlugin(new ReplicatorPlugin({
  replicators: [{
    driver: 'postgresql',
    resources: ['persona_personas'],  // Sync generated personas
    config: {
      connectionString: process.env.POSTGRES_URL,
      schemaSync: { enabled: true }
    }
  }]
}));

// Setup Cookie Farm
const suite = new CookieFarmPlugin({
  namespace: 'persona',
  queue: { autoStart: true, workers: 5 }
});

await db.usePlugin(suite);
await db.connect();

suite.setProcessor(async (job, context, { cookieFarm }) => {
  return await cookieFarm.generatePersonas(job.payload.count);
});

// Enqueue and generate
await suite.enqueueJob({
  jobType: 'generate',
  payload: { count: 100 }
});

console.log('Personas will be auto-synced to PostgreSQL!');
```

### Recipe 2: BigQuery Analytics + SQS Events

```javascript
import { Database, CookieFarmPlugin, ReplicatorPlugin } from 's3db.js';

const db = new Database({
  connectionString: process.env.S3DB_CONNECTION
});

// Replicate to BigQuery + SQS
await db.usePlugin(new ReplicatorPlugin({
  replicators: [
    // BigQuery for analytics
    {
      driver: 'bigquery',
      resources: ['persona_personas'],
      config: {
        projectId: 'my-project',
        dataset: 'analytics'
      }
    },
    // SQS for events
    {
      driver: 'sqs',
      resources: ['persona_personas'],
      config: {
        queueUrl: process.env.SQS_URL,
        region: 'us-east-1'
      }
    }
  ]
}));

// Rest of setup...
```

---

## Next Steps

1. **Learn best practices** → [Best Practices](./best-practices.md)

---

**Prev:** [← Configuration](./configuration.md)
**Next:** [Best Practices →](./best-practices.md)
**Main:** [← Cookie Farm Plugin](/plugins/cookie-farm/README.md)
