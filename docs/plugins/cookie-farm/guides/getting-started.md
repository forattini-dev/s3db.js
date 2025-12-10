# 🚀 Getting Started with Cookie Farm Plugin

**Prev:** [← Cookie Farm Plugin](/plugins/cookie-farm/README.md)
**Next:** [Configuration →](./configuration.md)
**Main:** [← Cookie Farm Plugin](/plugins/cookie-farm/README.md) | **All guides:** [Index](/plugins/cookie-farm/README.md#-documentation-guides)

> **In this guide:**
> - What is Cookie Farm Suite
> - Installation and dependencies
> - Minimal working example
> - Your first persona generation pipeline
> - Monitoring job execution

**Time to read:** 10 minutes
**Difficulty:** Beginner

---

## What is Cookie Farm Suite?

Cookie Farm Suite is a **unified persona generation pipeline** that combines four powerful plugins under a single namespace:

1. **CookieFarmPlugin** - Generates realistic browser personas (email, cookies, user agents)
2. **PuppeteerPlugin** - Automates browser interactions and pooling
3. **S3QueuePlugin** - Distributes work across multiple workers
4. **TTLPlugin** - Auto-cleans expired jobs and personas

**Key benefit:** Instead of managing 4 plugins separately, you configure one `CookieFarmPlugin` that orchestrates everything.

### When to use Cookie Farm

- ✅ Generating realistic browser personas for testing
- ✅ Automating web scraping or API testing
- ✅ Persona warmup (visiting sites, accumulating history)
- ✅ Large-scale persona lifecycle management
- ✅ Multi-stage workflows (generate → verify → warmup → retire)

**Performance:**
- ~2-10 personas/minute per worker (depends on generation strategy)
- 5-20 concurrent browsers typical
- Automatic retry with exponential backoff
- Zero duplicate execution with distributed locking

---

## 📦 Dependencies

### Required

```bash
pnpm install s3db.js
```

The Cookie Farm Suite plugin itself is built into s3db.js core with zero external dependencies.

### Optional Dependencies

Install these based on what you need:

```bash
# For browser automation (highly recommended)
pnpm install puppeteer

# For distributed scraping with proxy rotation
pnpm install proxy-chain

# For CAPTCHA solving in automated workflows
pnpm install 2captcha-api

# For backup/analytics to PostgreSQL
pnpm install pg

# For analytics to BigQuery
pnpm install @google-cloud/bigquery
```

**Peer Dependency Strategy:**
- Core s3db.js stays lightweight (~500KB)
- Install only what you need
- Lazy loading ensures missing dependencies don't break other features
- Perfect for serverless (Lambda, Vercel) with selective features

---

## ⚡ Quick Start (2 minutes)

Here's a minimal persona generation setup:

```javascript
import { Database, CookieFarmPlugin } from 's3db.js';

// Step 1: Create database
const db = new Database({
  connectionString: 's3://key:secret@bucket/path'
});
await db.connect();

// Step 2: Create and configure suite
const suite = new CookieFarmPlugin({
  namespace: 'persona',  // All resources prefixed with 'persona_'
  queue: {
    autoStart: false,    // Manual start
    workers: 1           // Single worker for testing
  }
});

await db.usePlugin(suite);

// Step 3: Define what to do with jobs
suite.setProcessor(async (job, context, { cookieFarm }) => {
  if (job.jobType === 'generate') {
    const result = await cookieFarm.generatePersonas(job.payload.count);
    console.log(`✅ Generated ${result.personas.length} personas`);
    return result;
  }
  throw new Error(`Unknown job type: ${job.jobType}`);
});

// Step 4: Enqueue a job
await suite.enqueueJob({
  jobType: 'generate',
  payload: { count: 5 }  // Generate 5 personas
});

// Step 5: Start workers
await suite.startProcessing();

// Step 6: Monitor results
suite.on('job.completed', ({ job, result, duration }) => {
  console.log(`✅ Job ${job.id} completed in ${duration}ms`);
  console.log('Generated personas:', result.personas);
});

suite.on('job.failed', ({ job, error }) => {
  console.error(`❌ Job ${job.id} failed:`, error.message);
});

// Step 7: Stop when done
await suite.stopProcessing();
await db.disconnect();
```

**What just happened:**
1. Created a Cookie Farm Suite with single worker
2. Defined processor to handle "generate" jobs
3. Enqueued a job to generate 5 personas
4. Started workers to process the queue
5. Monitored job execution with events
6. Gracefully shutdown

---

## Your First Real Pipeline

Let's build a production-ready persona generation pipeline:

### Step 1: Configure Suite

```javascript
import { Database, CookieFarmPlugin } from 's3db.js';

const db = new Database({
  connectionString: process.env.S3DB_CONNECTION
});

// Full configuration with all features
const suite = new CookieFarmPlugin({
  namespace: 'persona',
  queue: {
    autoStart: true,                  // Start workers automatically
    workers: 5,                       // 5 concurrent workers
    visibilityTimeout: 300000,        // 5 minutes per job
    maxRetries: 3,                    // Retry failed jobs 3 times
    deadLetterResource: 'persona_dlq' // DLQ for permanent failures
  },
  cookieFarm: {
    generation: {
      count: 100,       // Generate 100 personas per batch
      batchSize: 10,    // 10 personas per S3 operation
      strategy: 'diverse'  // Generate diverse personas
    },
    warmup: {
      enabled: true,
      strategy: 'gradual',
      interval: 3600000  // Check every hour
    }
  },
  puppeteer: {
    pool: {
      enabled: true,
      size: { min: 2, max: 10 }  // 2-10 concurrent browsers
    }
  },
  ttl: {
    queue: { ttl: 86400000 }      // Auto-cleanup jobs after 24 hours
  }
});

await db.usePlugin(suite);
await db.connect();
```

### Step 2: Define Job Processor

```javascript
suite.setProcessor(async (job, context, { cookieFarm, enqueue }) => {
  try {
    console.log(`Processing: ${job.jobType}`, job.payload);

    if (job.jobType === 'generate') {
      // Generate new personas
      const result = await cookieFarm.generatePersonas(job.payload.count, {
        strategy: job.payload.strategy || 'standard'
      });

      console.log(`✅ Generated ${result.personas.length} personas`);

      // Optionally: Enqueue warmup jobs for new personas
      for (const persona of result.personas) {
        await enqueue({
          jobType: 'warmup',
          payload: { personaId: persona.id },
          delayMs: 86400000  // Warmup after 24 hours
        });
      }

      return result;
    }

    if (job.jobType === 'warmup') {
      // Warmup persona by visiting sites
      const result = await cookieFarm.warmupPersona(job.payload.personaId);
      console.log(`✅ Warmed up persona ${job.payload.personaId}`);
      return result;
    }

    if (job.jobType === 'retire') {
      // Retire old persona
      await cookieFarm.retirePersona(job.payload.personaId);
      console.log(`✅ Retired persona ${job.payload.personaId}`);
      return { retired: true };
    }

    throw new Error(`Unknown job type: ${job.jobType}`);

  } catch (error) {
    console.error(`❌ Job failed:`, error.message);
    throw error;  // Queue will retry
  }
});

// Start workers
await suite.startProcessing();
```

### Step 3: Enqueue Jobs

```javascript
// Generate 10 personas
await suite.enqueueJob({
  jobType: 'generate',
  payload: { count: 10, strategy: 'diverse' }
});

console.log('Job enqueued! Workers are processing...');
```

### Step 4: Monitor Execution

```javascript
// Track completed jobs
suite.on('job.completed', ({ job, result, duration }) => {
  console.log(`✅ [${job.jobType}] completed in ${duration}ms`);

  if (job.jobType === 'generate') {
    console.log(`  Generated: ${result.personas.length} personas`);
  }
});

// Track failed jobs
suite.on('job.failed', ({ job, error, attempts, willRetry }) => {
  console.error(`❌ [${job.jobType}] failed (attempt ${attempts}):`, error.message);
  if (willRetry) {
    console.log(`  Will retry...`);
  }
});

// Track jobs moved to DLQ
suite.on('job.dead_letter', ({ job, error }) => {
  console.error(`💀 [${job.jobType}] moved to DLQ after max retries`);
  sendAlert({
    level: 'error',
    message: `Job ${job.id} failed permanently`,
    jobType: job.jobType,
    error: error.message
  });
});
```

### Step 5: Graceful Shutdown

```javascript
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');

  // Stop processing new jobs
  await suite.stopProcessing({ timeout: 60000 });

  // Disconnect database
  await db.disconnect();

  console.log('Shutdown complete');
  process.exit(0);
});
```

---

## Understanding Namespaces

All Cookie Farm resources are prefixed with your namespace:

```javascript
const suite = new CookieFarmPlugin({
  namespace: 'persona'
});

// Creates these resources:
// - persona_persona_jobs        (job queue)
// - persona_personas            (persona storage)
// - persona_persona_dlq         (dead letter queue)
// - persona_warmup_log          (warmup history - optional)
```

**Why namespaces?**
- ✅ Run multiple independent pipelines
- ✅ Separate dev/staging/prod personas
- ✅ Zero collisions in shared database
- ✅ Easy cleanup (all resources prefixed)

```javascript
// Production
const prodSuite = new CookieFarmPlugin({
  namespace: 'prod_persona'
});

// Staging
const stagingSuite = new CookieFarmPlugin({
  namespace: 'stg_persona'
});

// Development
const devSuite = new CookieFarmPlugin({
  namespace: 'dev_persona'
});
```

---

## Common Mistakes

### ❌ Mistake 1: Not Setting Processor

```javascript
// ❌ WRONG - No processor set!
const suite = new CookieFarmPlugin({ namespace: 'persona' });
await suite.startProcessing();  // Throws QueueError!
```

**Fix:**
```javascript
// ✅ CORRECT
suite.setProcessor(async (job, context, helpers) => {
  // Process job...
});
await suite.startProcessing();
```

---

### ❌ Mistake 2: Forgetting to Await Async Operations

```javascript
// ❌ WRONG - Missing await
suite.setProcessor((job) => {
  cookieFarm.generatePersonas(5);  // No await!
  return { success: true };
});
```

**Fix:**
```javascript
// ✅ CORRECT
suite.setProcessor(async (job, context, { cookieFarm }) => {
  const result = await cookieFarm.generatePersonas(5);  // Await!
  return result;
});
```

---

### ❌ Mistake 3: Using Same Namespace Across Environments

```javascript
// ❌ WRONG - Will collide between dev/prod
const devSuite = new CookieFarmPlugin({ namespace: 'persona' });
const prodSuite = new CookieFarmPlugin({ namespace: 'persona' });
// Both use the same resources!
```

**Fix:**
```javascript
// ✅ CORRECT
const suite = new CookieFarmPlugin({
  namespace: `${process.env.NODE_ENV}_persona`  // dev_persona, prod_persona
});
```

---

## Job Types Reference

Cookie Farm Suite supports these standard job types:

| Job Type | Purpose | Payload | Example |
|----------|---------|---------|---------|
| `generate` | Generate new personas | `{ count, strategy?, batchSize? }` | `{ count: 10, strategy: 'diverse' }` |
| `warmup` | Warmup persona on sites | `{ personaId, sites?, interactions? }` | `{ personaId: 'p123', sites: ['google', 'facebook'] }` |
| `verify` | Verify persona credentials | `{ personaId }` | `{ personaId: 'p123' }` |
| `retire` | Retire old persona | `{ personaId }` | `{ personaId: 'p123' }` |

You can add custom job types in your processor!

---

## Next Steps

1. **Configure your setup** → [Configuration Guide](./configuration.md)
2. **See usage patterns** → [Usage Patterns](./usage-patterns.md)
3. **Production setup** → [Best Practices](./best-practices.md)

---

**Prev:** [← Cookie Farm Plugin](/plugins/cookie-farm/README.md)
**Next:** [Configuration →](./configuration.md)
**Main:** [← Cookie Farm Plugin](/plugins/cookie-farm/README.md)
