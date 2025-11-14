# ✅ Cookie Farm Best Practices & Troubleshooting

**Prev:** [← Usage Patterns](./usage-patterns.md)
**Main:** [← Cookie Farm Plugin](../README.md) | **All guides:** [Index](../README.md#-documentation-guides)

> **In this guide:**
> - 6 essential best practices
> - Common mistakes & fixes
> - Error handling strategies
> - Troubleshooting scenarios
> - 20+ FAQ entries

**Time to read:** 25 minutes
**Difficulty:** Advanced

---

## 6 Essential Best Practices

### 1. Always Set Processor Before Starting Workers

**❌ Wrong:**
```javascript
const suite = new CookieFarmPlugin({ namespace: 'persona' });
await db.usePlugin(suite);

await suite.startProcessing();  // ❌ QueueError: No processor set!
```

**✅ Correct:**
```javascript
const suite = new CookieFarmPlugin({ namespace: 'persona' });
await db.usePlugin(suite);

// Set processor FIRST
suite.setProcessor(async (job, context, { cookieFarm }) => {
  return await cookieFarm.generatePersonas(job.payload.count);
});

// THEN start workers
await suite.startProcessing();  // ✅ Works!
```

**Why:** The queue needs to know how to process jobs before workers start. Without a processor, jobs would be enqueued but never processed.

---

### 2. Use Environment-Specific Namespaces

**❌ Wrong:**
```javascript
// All environments use the same namespace = resource collisions
const suite = new CookieFarmPlugin({ namespace: 'persona' });

// In dev and prod, they interfere with each other
```

**✅ Correct:**
```javascript
const suite = new CookieFarmPlugin({
  namespace: `${process.env.NODE_ENV}_persona`
  // dev_persona, stg_persona, prod_persona
});

// Each environment has isolated resources
```

**Why:** Namespaces isolate resources. Using the same namespace in dev and prod causes:
- ❌ Jobs getting mixed up
- ❌ Personas in the wrong environment
- ❌ Hard-to-debug issues

---

### 3. Configure Visibility Timeout Based on Job Complexity

**❌ Wrong:**
```javascript
const suite = new CookieFarmPlugin({
  queue: {
    visibilityTimeout: 60000  // 1 minute - too short!
  }
});
```

**✅ Correct:**
```javascript
const suite = new CookieFarmPlugin({
  queue: {
    visibilityTimeout: 300000  // 5 minutes - reasonable for most jobs
  }
});

// For CAPTCHA-heavy: use 600000 (10 minutes)
// For simple generation: use 120000 (2 minutes)
```

**Why:** If a job takes longer than the visibility timeout, it gets requeued as failed. This can cause duplicates.

---

### 4. Classify Errors for Smart Retry Logic

**❌ Wrong:**
```javascript
suite.setProcessor(async (job, context, { cookieFarm }) => {
  try {
    return await cookieFarm.generatePersonas(job.payload.count);
  } catch (error) {
    throw error;  // ❌ All errors retried equally
  }
});
```

**✅ Correct:**
```javascript
suite.setProcessor(async (job, context, { cookieFarm }) => {
  try {
    return await cookieFarm.generatePersonas(job.payload.count);
  } catch (error) {
    // Classify transient vs permanent errors
    if (error.name === 'RateLimitError' || error.name === 'ProxyError') {
      error.retriable = true;   // ✅ Retry transient errors
    } else if (error.name === 'ValidationError') {
      error.retriable = false;  // ✅ Don't retry invalid payloads
    }
    throw error;
  }
});
```

**Why:** Different errors need different handling:
- **Transient errors** (rate limits, proxy issues) → Retry
- **Permanent errors** (invalid input, auth failure) → DLQ immediately

---

### 5. Monitor Queue Health Proactively

**❌ Wrong:**
```javascript
// No monitoring - problems discovered too late
const suite = new CookieFarmPlugin({...});
await suite.startProcessing();
// No health checks
```

**✅ Correct:**
```javascript
const suite = new CookieFarmPlugin({...});
await suite.startProcessing();

// Monitor queue health every 30 seconds
setInterval(async () => {
  const stats = await suite.queuePlugin.getStats();

  console.log('Queue Health:', {
    pending: stats.pending,
    processing: stats.processing,
    completed: stats.completed,
    failed: stats.failed
  });

  // Alert if backlog grows
  if (stats.pending > 1000) {
    sendAlert({
      level: 'warning',
      message: 'Queue backlog detected',
      pending: stats.pending
    });
  }
}, 30000);
```

**Why:** Monitoring helps you catch issues early:
- Queue backlog → Add more workers
- High failure rate → Check error types
- Memory leak → Check browser pool

---

### 6. Implement Graceful Shutdown

**❌ Wrong:**
```javascript
// ❌ Abrupt shutdown - jobs lost
process.on('SIGTERM', () => {
  process.exit(0);  // Just exit!
});
```

**✅ Correct:**
```javascript
// ✅ Graceful shutdown - finish active jobs
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');

  // Stop accepting new jobs
  await suite.stopProcessing({
    timeout: 60000  // Wait up to 60s for jobs to finish
  });

  // Close database connections
  await db.disconnect();

  console.log('Shutdown complete');
  process.exit(0);
});
```

**Why:** Graceful shutdown ensures:
- ✅ Active jobs finish properly
- ✅ No data loss
- ✅ Proper cleanup
- ✅ No dead letter queue accumulation

---

## Common Mistakes & Fixes

### Mistake 1: Workers Not Processing Jobs

**Symptoms:**
- Jobs enqueued but stuck in `pending`
- No `job.started` events
- Queue stats show high `pending` count

**Cause:**
```javascript
// ❌ No processor set
const suite = new CookieFarmPlugin({...});
await suite.startProcessing();  // Throws!
```

**Fix:**
```javascript
// ✅ Set processor before starting
suite.setProcessor(async (job) => { /* process */ });
await suite.startProcessing();
```

---

### Mistake 2: High Job Failure Rate

**Symptoms:**
- Many jobs moving to DLQ
- Repeated failures of same job
- Error messages in logs

**Cause:**
```javascript
// ❌ Not checking job payload
suite.setProcessor(async (job) => {
  // Might be undefined!
  return await cookieFarm.generatePersonas(job.payload.count);
});
```

**Fix:**
```javascript
// ✅ Validate payload first
suite.setProcessor(async (job) => {
  if (!job.payload || job.payload.count < 1) {
    throw new Error('Invalid payload: count required and >= 1');
  }
  return await cookieFarm.generatePersonas(job.payload.count);
});
```

---

### Mistake 3: Browser Pool Exhaustion

**Symptoms:**
- `BrowserPoolError: No available browsers`
- Jobs timing out
- High variance in job duration

**Cause:**
```javascript
// ❌ Pool too small for worker count
const suite = new CookieFarmPlugin({
  queue: { workers: 20 },       // 20 workers
  puppeteer: {
    pool: { size: { min: 1, max: 5 } }  // Only 5 browsers!
  }
});
```

**Fix:**
```javascript
// ✅ Size pool = workers * 2
const suite = new CookieFarmPlugin({
  queue: { workers: 20 },
  puppeteer: {
    pool: { size: { min: 10, max: 40 } }  // 10-40 browsers
  }
});
```

**or reduce workers:**
```javascript
const suite = new CookieFarmPlugin({
  queue: { workers: 5 },  // Fewer workers
  puppeteer: {
    pool: { size: { min: 2, max: 10 } }
  }
});
```

---

### Mistake 4: Using Same Namespace Across Environments

**Symptoms:**
- Jobs in dev affect prod
- Personas get mixed up
- Unpredictable behavior

**Cause:**
```javascript
// ❌ Same namespace everywhere
const devSuite = new CookieFarmPlugin({ namespace: 'persona' });
const prodSuite = new CookieFarmPlugin({ namespace: 'persona' });
// Both modify the same resources!
```

**Fix:**
```javascript
// ✅ Environment-specific namespaces
const suite = new CookieFarmPlugin({
  namespace: `${process.env.NODE_ENV}_persona`
});
// dev_persona, stg_persona, prod_persona
```

---

### Mistake 5: Not Handling DLQ Jobs

**Symptoms:**
- DLQ accumulates jobs forever
- No visibility into permanent failures
- Lost jobs

**Cause:**
```javascript
// ❌ DLQ configured but not monitored
const suite = new CookieFarmPlugin({
  queue: {
    deadLetterResource: 'persona_dlq'
  }
});
// No DLQ processor!
```

**Fix:**
```javascript
// ✅ Monitor and process DLQ
const dlqResource = await db.getResource('persona_dlq');

setInterval(async () => {
  const failed = await dlqResource.query({ status: 'failed' });

  for (const job of failed.items) {
    console.error(`Failed job ${job.id}:`, job.data.error);

    // Analyze and potentially retry
    if (shouldRetry(job)) {
      await suite.enqueueJob(job.data);
      await dlqResource.delete(job.id);
    }
  }
}, 300000);
```

---

## Error Handling Strategy

### Error Classification

```javascript
suite.setProcessor(async (job, context, { cookieFarm }) => {
  try {
    return await cookieFarm.generatePersonas(job.payload.count);

  } catch (error) {
    switch (error.name) {
      case 'RateLimitError':
        // API rate limit → Retry after delay
        error.retriable = true;
        error.retryDelayMs = error.retryAfter || 60000;
        break;

      case 'ProxyError':
        // Proxy connection issue → Retry with rotation
        error.retriable = true;
        break;

      case 'CaptchaError':
        // CAPTCHA service failure → Don't retry
        error.retriable = false;
        break;

      case 'ValidationError':
        // Invalid input → Don't retry
        error.retriable = false;
        break;

      case 'BrowserPoolError':
        // Pool exhaustion → Retry when available
        error.retriable = true;
        break;

      default:
        // Unknown → Retry cautiously
        error.retriable = true;
    }

    throw error;
  }
});
```

### Error Response Template

```javascript
suite.on('job.failed', ({ job, error, attempts, willRetry }) => {
  const response = {
    jobId: job.id,
    jobType: job.jobType,
    error: {
      name: error.name,
      message: error.message,
      retriable: error.retriable
    },
    attempts: attempts,
    willRetry: willRetry
  };

  // Log for debugging
  console.error('Job Error:', response);

  // Send to monitoring
  if (willRetry) {
    metrics.increment('jobs.will_retry');
  } else {
    metrics.increment('jobs.will_dlq');
  }
});
```

---

## Troubleshooting Guide

### Issue: Memory Usage Growing

**Solution:**
1. Enable TTL cleanup:
   ```javascript
   const suite = new CookieFarmPlugin({
     ttl: {
       queue: { ttl: 86400000 },      // Clean up jobs
       personas: { ttl: 2592000000 }  // Clean up personas
     }
   });
   ```

2. Limit browser pool:
   ```javascript
   puppeteer: {
     pool: {
       maxIdleTime: 300000  // Close idle browsers
     }
   }
   ```

3. Monitor event listeners:
   ```javascript
   console.log('Listeners:', suite.listenerCount('job.completed'));
   ```

---

### Issue: Slow Job Processing

**Solution:**
1. Increase workers:
   ```javascript
   queue: { workers: 20 }  // More concurrent jobs
   ```

2. Enable browser pooling:
   ```javascript
   puppeteer: { pool: { enabled: true, warmup: true } }
   ```

3. Check job duration:
   ```javascript
   const durations = [];
   suite.on('job.completed', ({ duration }) => {
     durations.push(duration);
     if (durations.length === 100) {
       console.log('p95:', durations.sort()[94]);
     }
   });
   ```

---

### Issue: Jobs Stuck in Queue

**Solution:**
1. Check visibility timeout:
   ```javascript
   // If jobs consistently fail after N seconds,
   // increase visibilityTimeout
   queue: { visibilityTimeout: 600000 }  // 10 minutes
   ```

2. Check processor for infinite loops:
   ```javascript
   suite.setProcessor(async (job) => {
     console.log('Job started:', job.id);
     // Make sure this completes!
     return result;
   });
   ```

3. Check database connectivity:
   ```javascript
   const stats = await suite.queuePlugin.getStats();
   // If stats call fails, database issue
   ```

---

## Production Deployment Checklist

- ✅ Processor is set before starting workers
- ✅ Use environment-specific namespace
- ✅ Configure visibility timeout (300000 = 5 min default)
- ✅ Set maxRetries (3-5 typical)
- ✅ Configure deadLetterResource
- ✅ Enable TTL for automatic cleanup
- ✅ Size browser pool = workers * 2
- ✅ Set up DLQ monitoring
- ✅ Add health check endpoint
- ✅ Implement graceful shutdown
- ✅ Configure error classification
- ✅ Set up alerting for DLQ jobs
- ✅ Monitor queue stats (pending, failed, etc)

---

## ❓ FAQ

### Configuration Questions

**Q: What's the recommended number of workers?**

A: Start with `workers = (CPU cores) * 2`. Monitor queue depth and adjust:
- Queue backlog growing → Increase workers
- High CPU/memory → Decrease workers

```javascript
const cpuCount = require('os').cpus().length;
const workers = cpuCount * 2;  // Good starting point
```

---

**Q: How much memory do browsers use?**

A: ~100-150 MB per browser. Calculate:
```javascript
const maxMemory = 2048;  // MB
const browserMemory = 100;
const maxBrowsers = Math.floor(maxMemory / browserMemory);  // ~20
```

---

**Q: Can I change configuration at runtime?**

A: Partial changes possible:

```javascript
// ✅ Can increase workers
await suite.startProcessing({ workers: 10 });

// ❌ Can't change these after start:
// - Queue resource name
// - DLQ resource name
// - Plugin dependencies
```

---

### Performance Questions

**Q: How fast can Cookie Farm generate personas?**

A: ~2-10 personas/minute per worker, depending on:
- Strategy (diverse = slower)
- Browser pool enabled
- Proxy rotation enabled
- CAPTCHA solving enabled

```javascript
// Fast (direct generation)
const result = await cookieFarm.generatePersonas(100);
// ~100 personas in 10-15 minutes

// Slow (with CAPTCHA)
queue: { workers: 5 },
puppeteer: { captcha: { enabled: true } }
// ~5 personas/minute
```

---

**Q: What's the maximum queue size?**

A: No fixed limit, but recommend:
- **Comfortable:** <10,000 pending jobs
- **Warning:** 10,000-100,000 jobs
- **Critical:** >100,000 jobs

Monitor with health checks and scale workers accordingly.

---

### Error Handling Questions

**Q: What happens when a job hits DLQ?**

A: Permanent failure - not retried automatically. You must:
1. Analyze the error
2. Decide if it's retriable
3. Manually re-enqueue with `enqueueJob()`

```javascript
// Check DLQ
const dlqResource = await db.getResource('persona_dlq');
const job = await dlqResource.get('job_id');

// Fix and retry
if (isRetriable(job)) {
  await suite.enqueueJob(job.data);
  await dlqResource.delete(job.id);
}
```

---

**Q: Can I have custom retry logic?**

A: Yes, classify errors in processor:

```javascript
suite.setProcessor(async (job) => {
  try {
    return await cookieFarm.generatePersonas(job.payload.count);
  } catch (error) {
    if (error.name === 'RateLimitError') {
      error.retryDelayMs = 120000;  // Custom delay
    }
    throw error;
  }
});
```

---

**Q: How do I debug a failing job?**

A: Check error details:

```javascript
suite.on('job.failed', ({ job, error, attempts }) => {
  console.error({
    jobId: job.id,
    jobType: job.jobType,
    payload: job.payload,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    attempts: attempts
  });
});
```

---

### Operational Questions

**Q: How do I safely stop workers?**

A: Use graceful shutdown:

```javascript
await suite.stopProcessing({
  timeout: 60000  // Wait up to 60 seconds
});

// After this:
// - No new jobs started
// - Active jobs given time to finish
// - If timeout, jobs marked as failed
```

---

**Q: How do I clean up old personas?**

A: Use TTL or manual cleanup:

```javascript
// Option 1: TTL (automatic)
const suite = new CookieFarmPlugin({
  ttl: { personas: { ttl: 2592000000 } }  // 30 days
});

// Option 2: Manual cleanup
const personas = await db.getResource('persona_personas');
const old = await personas.query({
  createdAt: { $lt: Date.now() - 86400000 * 30 }  // Older than 30 days
});

for (const persona of old.items) {
  await personas.delete(persona.id);
}
```

---

**Q: Can I run multiple instances?**

A: Yes, with namespace isolation:

```javascript
// Instance 1 (dev machine)
const suite1 = new CookieFarmPlugin({
  namespace: 'dev_persona'
});

// Instance 2 (production)
const suite2 = new CookieFarmPlugin({
  namespace: 'prod_persona'
});

// They don't interfere
```

---

### Scaling Questions

**Q: When should I increase workers?**

A: Monitor these metrics:

```javascript
const stats = await suite.queuePlugin.getStats();

if (stats.pending > 500 && stats.processing < workers) {
  // Increase workers - jobs backing up
  workers += 5;
}

if (stats.pending < 100 && stats.processing < workers / 2) {
  // Decrease workers - wasting resources
  workers -= 2;
}
```

---

**Q: How do I shard across multiple databases?**

A: Use different databases with same namespace:

```javascript
// Database 1 (shard 1)
const db1 = new Database({ connectionString: 's3://...' });
const suite1 = new CookieFarmPlugin({ namespace: 'shard1_persona' });

// Database 2 (shard 2)
const db2 = new Database({ connectionString: 's3://...' });
const suite2 = new CookieFarmPlugin({ namespace: 'shard2_persona' });

// Each shard operates independently
```

---

**Q: What about multi-region deployment?**

A: Use region-aware namespaces:

```javascript
const region = process.env.AWS_REGION;
const suite = new CookieFarmPlugin({
  namespace: `${region}_persona`
  // us-east-1_persona, eu-west-1_persona
});

// Each region has isolated resources
// Optionally replicate between regions with ReplicatorPlugin
```

---

**Prev:** [← Usage Patterns](./usage-patterns.md)
**Main:** [← Cookie Farm Plugin](../README.md)
