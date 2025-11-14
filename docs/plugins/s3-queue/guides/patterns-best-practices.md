## 💡 Patterns & Best Practices

### Pattern 1: Idempotent Handlers

Always make handlers idempotent (safe to retry):

```javascript
// ❌ BAD: Not idempotent
onMessage: async (order) => {
  await inventory.decrement(order.productId, order.quantity);
  await payments.charge(order.userId, order.total);
}

// ✅ GOOD: Idempotent with checks
onMessage: async (order) => {
  // Check if already processed
  const existing = await processedOrders.get(order.id);
  if (existing) {
    return { skipped: true, reason: 'already processed' };
  }

  // Process with transaction
  const result = await db.transaction(async (tx) => {
    await tx.inventory.decrement(order.productId, order.quantity);
    const payment = await tx.payments.charge(order.userId, order.total);
    await tx.processedOrders.insert({ id: order.id, paymentId: payment.id });
    return payment;
  });

  return result;
}
```

### Pattern 2: Graceful Shutdown

Handle shutdown signals properly:

```javascript
import { PluginError } from 's3db.js';

let isShuttingDown = false;

process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  isShuttingDown = true;

  // Stop accepting new messages
  await queue.stopProcessing();

  // Wait for current tasks to finish
  console.log('⏳ Waiting for tasks to complete...');

  // Disconnect
  await db.disconnect();

  console.log('✅ Shutdown complete');
  process.exit(0);
});

const queue = new S3QueuePlugin({
  resource: 'tasks',
  onMessage: async (task) => {
    // Check if shutting down
    if (isShuttingDown) {
      throw new PluginError('Worker shutting down, please retry later', {
        statusCode: 503,
        retriable: true,
        suggestion: 'S3Queue will release the invisibility timeout; no manual action required.'
      });
    }

    await processTask(task);
  }
});
```

### Pattern 3: Priority Queues

Implement priority processing:

```javascript
// High priority queue
const highPriorityQueue = new S3QueuePlugin({
  resource: 'tasks',
  concurrency: 10,
  pollInterval: 100,  // Fast polling
  onMessage: async (task) => {
    if (task.priority !== 'high') return { skipped: true };
    await processTask(task);
  }
});

// Low priority queue
const lowPriorityQueue = new S3QueuePlugin({
  resource: 'tasks',
  concurrency: 2,
  pollInterval: 5000,  // Slow polling
  onMessage: async (task) => {
    if (task.priority === 'high') return { skipped: true };
    await processTask(task);
  }
});

await db.usePlugin(highPriorityQueue);
await db.usePlugin(lowPriorityQueue);
```

### Pattern 4: Batch Processing

Process messages in batches:

```javascript
const batchQueue = new S3QueuePlugin({
  resource: 'notifications',
  concurrency: 1,
  onMessage: async (notification) => {
    // Collect batch
    const batch = [notification];

    // Wait a bit for more messages
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get more pending messages
    const pending = await notifications.query({
      where: { status: 'pending' },
      limit: 99
    });

    batch.push(...pending);

    // Send batch
    await sendBulkNotifications(batch);

    return { batchSize: batch.length };
  }
});
```

### Pattern 5: Circuit Breaker

Prevent cascading failures:

```javascript
import { PluginError } from 's3db.js';

class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failures = 0;
    this.threshold = threshold;
    this.timeout = timeout;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.openUntil = null;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      throw new PluginError('Circuit breaker is OPEN', {
        statusCode: 429,
        retriable: true,
        suggestion: `Wait ${Math.round((this.openUntil - Date.now()) / 1000)}s before retrying.`,
        metadata: { failures: this.failures }
      });
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
    }
  }

  onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      this.openUntil = Date.now() + this.timeout;
      setTimeout(() => {
        this.state = 'HALF_OPEN';
        this.failures = 0;
        this.openUntil = null;
      }, this.timeout);
    }
  }
}

const breaker = new CircuitBreaker(5, 60000);

const queue = new S3QueuePlugin({
  resource: 'api_calls',
  onMessage: async (call) => {
    return await breaker.execute(async () => {
      const response = await externalAPI.call(call.endpoint, call.data);
      return response;
    });
  },
  onError: (error, call) => {
    if (error.message === 'Circuit breaker is OPEN') {
      console.warn('⚠️ Circuit breaker open, service unavailable');
      // Will retry later
    }
  }
});
```

### Pattern 6: Rate Limiting

Control request rate to external services:

```javascript
class RateLimiter {
  constructor(maxPerSecond) {
    this.maxPerSecond = maxPerSecond;
    this.requests = [];
  }

  async acquire() {
    const now = Date.now();

    // Remove requests older than 1 second
    this.requests = this.requests.filter(t => now - t < 1000);

    // Check if limit reached
    if (this.requests.length >= this.maxPerSecond) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = 1000 - (now - oldestRequest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.requests.push(Date.now());
  }
}

const limiter = new RateLimiter(10); // 10 requests per second

const queue = new S3QueuePlugin({
  resource: 'api_requests',
  concurrency: 20,  // High concurrency
  onMessage: async (request) => {
    await limiter.acquire();
    const response = await fetch(request.url);
    return response;
  }
});
```

---

## ⚡ Performance & Tuning

### Throughput Benchmarks

Real-world performance with LocalStack:

```
┌─────────────────────────────────────────────────────────┐
│              S3Queue Performance Metrics                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Concurrency: 3 workers                                 │
│  Throughput:  ~10-20 messages/second                    │
│  Latency:     ~150-300ms per message                    │
│                                                          │
│  Concurrency: 10 workers                                │
│  Throughput:  ~30-50 messages/second                    │
│  Latency:     ~200-400ms per message                    │
│                                                          │
│  Concurrency: 20 workers                                │
│  Throughput:  ~50-100 messages/second                   │
│  Latency:     ~300-500ms per message                    │
│                                                          │
│  Concurrency: 50 workers                                │
│  Throughput:  ~100-150 messages/second                  │
│  Latency:     ~400-600ms per message                    │
│                                                          │
└─────────────────────────────────────────────────────────┘

Note: Latency includes S3 operations + handler execution time
```

### Tuning Guide

```javascript
// === HIGH THROUGHPUT ===
// Use case: Analytics, logs, non-critical tasks
{
  concurrency: 50,        // Many workers
  pollInterval: 100,      // Fast polling
  visibilityTimeout: 5000, // Short timeout
  maxAttempts: 1          // Don't retry
}

// === BALANCED ===
// Use case: General purpose, emails, notifications
{
  concurrency: 10,
  pollInterval: 1000,
  visibilityTimeout: 30000,
  maxAttempts: 3
}

// === RELIABLE ===
// Use case: Payments, orders, critical operations
{
  concurrency: 2,          // Conservative
  pollInterval: 5000,      // Slower polling
  visibilityTimeout: 300000, // 5 minutes
  maxAttempts: 5           // Multiple retries
}

// === HEAVY PROCESSING ===
// Use case: Video encoding, large exports
{
  concurrency: 1,           // One at a time
  pollInterval: 10000,      // Check every 10s
  visibilityTimeout: 1800000, // 30 minutes
  maxAttempts: 2
}
```

### S3 Request Costs

Approximate S3 requests per message:

```
Enqueue:        2 requests  (PUT record + PUT queue entry)
Process:        7 requests  (GET queue, GET/PUT locks, GET record,
                             PUT claim, PUT complete)
Retry:          4 requests  (GET queue, GET/PUT locks, PUT retry)
Dead Letter:    3 requests  (PUT dead letter, PUT queue status)

Total per successful message: ~9 requests
Total per failed message (3 attempts): ~21 requests
```

### Optimization Tips

```javascript
// 1. Use Local Caching
const cache = new Map();

onMessage: async (task) => {
  // Cache frequently accessed data
  let config = cache.get('app-config');
  if (!config) {
    config = await loadConfig();
    cache.set('app-config', config);
  }

  await processTask(task, config);
}

// 2. Batch External Calls
const pendingCalls = [];

onMessage: async (task) => {
  pendingCalls.push(task);

  if (pendingCalls.length >= 10) {
    const batch = pendingCalls.splice(0, 10);
    await externalAPI.batchCall(batch);
  }
}

// 3. Use Connection Pooling
const pool = new Pool({
  host: 'database',
  max: 20
});

onMessage: async (task) => {
  const client = await pool.connect();
  try {
    await client.query('...');
  } finally {
    client.release();
  }
}

// 4. Avoid Heavy Operations in Handler
// ❌ Don't do this
onMessage: async (image) => {
  const processed = await heavyImageProcessing(image);
  return processed;
}

// ✅ Do this instead - offload to another service
onMessage: async (image) => {
  await processingService.submit(image);
  return { submitted: true };
}
```

---

## 🌐 Scalability & Multi-Pod Deployment

### Scaling to 100+ Pods

**Short Answer:** Yes, coordinator mode scales to 100 pods with proper configuration. The architecture handles horizontal scaling through deterministic election, distributed coordination, and adaptive polling.

### How It Works at Scale

With coordinator mode enabled, S3Queue uses a **single-leader topology**:

```
┌────────────────────────────────────────────────────────┐
│              100-Pod Architecture                      │
├────────────────────────────────────────────────────────┤
│                                                         │
│  Coordinator Pod (elected)                             │
│    ├─ Publishes dispatch tickets every 100ms          │
│    ├─ Maintains worker registry                        │
│    └─ Runs recovery for stalled tickets                │
│                                                         │
│  Worker Pods (99 remaining)                            │
│    ├─ Claim tickets from shared pool                   │
│    ├─ Process messages in parallel                     │
│    ├─ Send heartbeats every 10s                        │
│    └─ Fall back to direct claiming if no tickets       │
│                                                         │
└────────────────────────────────────────────────────────┘
```

### Where Pressure Builds

#### 1. **Heartbeat + Election**
- Each pod publishes heartbeat to PluginStorage every `heartbeatInterval` (default: 10s)
- 100 pods = 100 small writes every 10s = **10 writes/s** (negligible)
- Election only runs when leader expires or epoch ends (rare)

#### 2. **Dispatch Tickets** (Coordinator Only)
- Coordinator queries queue and publishes up to `ticketBatchSize` tickets every `dispatchInterval`
- With defaults: 10 tickets every 100ms = **100 tickets/s**
- Throughput bottleneck is coordinator capacity, not worker count

#### 3. **Workers Claiming Tickets**
- Each worker scans PluginStorage for available tickets
- 100 workers polling every 1s with 50 tickets = **~100 LIST ops/s + 5000 GET ops/s**
- **This is the main scaling pressure point**

### S3 Operation Limits (AWS)

| Operation Type | AWS Limit (per prefix) |
|----------------|------------------------|
| GET/HEAD       | 5,500 ops/s           |
| PUT/POST/DELETE | 3,500 ops/s          |

**Critical:** With default settings and 100 pods, you may approach GET limits during high ticket churn. Solution: adjust intervals.

### Recommended Configuration for 100 Pods

```javascript
new S3QueuePlugin({
  resource: 'jobs',

  // ============================================
  // COORDINATOR SETTINGS
  // ============================================
  enableCoordinator: true,
  coordinatorElectionInterval: 15000,   // 15s (reduces election frequency)
  coordinatorEpochDuration: 300000,     // 5min (longer leadership)

  // ============================================
  // HEARTBEAT SETTINGS (critical for scale)
  // ============================================
  heartbeatInterval: 15000,             // 15s (was 10s)
  heartbeatTTL: 45,                     // 3× interval for safety

  // ============================================
  // DISPATCH SETTINGS (coordinator only)
  // ============================================
  dispatchInterval: 100,                // 100ms (can stay fast)
  ticketBatchSize: 20,                  // Publish 20 tickets per cycle
  ticketTTL: 60,                        // 60s visibility window

  // ============================================
  // WORKER SETTINGS (critical for scale)
  // ============================================
  pollInterval: 2000,                   // 2s (was 1s) - reduces scan pressure
  maxPollInterval: 30000,               // Adaptive backoff ceiling
  concurrency: 2,                       // 100 pods × 2 = 200 parallel

  // ============================================
  // PERFORMANCE
  // ============================================
  verbose: false,                       // Reduce I/O overhead

  onMessage: async (job, ctx) => {
    // Your processing logic
  }
})
```

**Key Changes:**
- `heartbeatInterval: 15000` - Reduces worker registry writes by 33%
- `pollInterval: 2000` - Reduces ticket scans by 50% (**critical!**)
- `concurrency: 2` - With 100 pods, gives 200 parallel workers

### Expected Throughput

```javascript
// Calculation: pods × concurrency = parallel capacity

// 100 pods × 2 concurrency = 200 messages processing simultaneously

// If each message takes 1 second:
Throughput = 200 msg/s = 12,000 msg/min

// If each message takes 5 seconds:
Throughput = 40 msg/s = 2,400 msg/min

// If each message takes 10 seconds:
Throughput = 20 msg/s = 1,200 msg/min
```

Adjust `concurrency` based on your message processing time and resource limits.

### S3 Operation Estimates (100 Pods, Optimized Config)

| Operation | Default Config | Optimized Config | Reduction |
|-----------|----------------|------------------|-----------|
| Heartbeat PUT | 10/s | 6.7/s | -33% |
| Worker LIST | 100/s | 50/s | -50% |
| Ticket GET | 5000/s | 2500/s | -50% ✅ |
| **Total GET** | ~7000/s 🔴 | ~3200/s ✅ | -55% |

**Result:** Optimized config stays **well under** AWS S3 limits (5500 GET/s).

### Essential Monitoring for Scale

At 100 pods, you **must** monitor these metrics:

```javascript
plugin.on('plg:s3-queue:metrics', ({ metrics }) => {
  const critical = {
    // Cluster Health
    activeWorkers: metrics.activeWorkers,           // Should be ~100
    isCoordinator: metrics.isCoordinator,           // true on 1 pod only

    // Ticket System
    ticketsAvailable: metrics.ticketsAvailable,
    ticketsClaimed: metrics.ticketsClaimed,
    ticketsStalled: metrics.ticketsStalled,         // ⚠️ Should be 0

    // Throughput
    messagesProcessed: metrics.messagesProcessed,
    processingRate: metrics.processingRate,         // msgs/s

    // 🔴 CRITICAL - S3 Pressure
    s3OperationsPerSecond: metrics.s3OpsPerSec,     // Must be < 5000
    throttlingErrors: metrics.throttlingErrors       // Must be 0
  };

  // Alert if throttling detected
  if (critical.throttlingErrors > 0) {
    console.error('🚨 S3 THROTTLING DETECTED');
    console.error('Action: Increase heartbeatInterval or pollInterval');
  }

  // Alert if tickets stalling
  if (critical.ticketsStalled > 10) {
    console.warn('⚠️ Tickets stalling - workers may be overloaded');
  }

  // Alert if coordinator missing
  if (critical.activeWorkers > 0 && !hasCoordinator()) {
    console.error('🚨 NO COORDINATOR - election may be failing');
  }
});

// Alert on S3 throttling
plugin.on('plg:s3-queue:s3-throttled', ({ operation, retryAfter }) => {
  console.error(`⚠️ S3 ${operation} throttled, retry in ${retryAfter}ms`);
  // Metrics alert: increase intervals immediately
});

// Track coordinator transitions
plugin.on('plg:s3-queue:coordinator-promoted', ({ workerId, epoch }) => {
  console.log(`✅ Worker ${workerId} became coordinator (epoch ${epoch})`);
});

plugin.on('plg:s3-queue:coordinator-demoted', ({ workerId }) => {
  console.log(`⚠️ Worker ${workerId} lost coordinator role`);
});
```

### Practical Limits

| Scenario | Status | Notes |
|----------|--------|-------|
| **100 pods** | ✅ **Works well** | With optimized config (15s heartbeat, 2s poll) |
| **200 pods** | ⚠️ **Possible** | Need `heartbeatInterval: 20s`, `pollInterval: 3s` |
| **500 pods** | 🔴 **Consider sharding** | Single queue becomes coordinator bottleneck |
| **1000+ pods** | 🔴 **Use alternatives** | Shard queues or use SQS/Redis hybrid |

### Tuning Guidelines by Scale

```javascript
// ═══════════════════════════════════════════
// 10-25 PODS (Small Cluster)
// ═══════════════════════════════════════════
{
  heartbeatInterval: 10000,     // 10s
  pollInterval: 1000,           // 1s
  concurrency: 3                // 10-25 pods × 3 = 30-75 workers
}

// ═══════════════════════════════════════════
// 25-50 PODS (Medium Cluster)
// ═══════════════════════════════════════════
{
  heartbeatInterval: 12000,     // 12s
  pollInterval: 1500,           // 1.5s
  concurrency: 3                // 25-50 pods × 3 = 75-150 workers
}

// ═══════════════════════════════════════════
// 50-100 PODS (Large Cluster)
// ═══════════════════════════════════════════
{
  heartbeatInterval: 15000,     // 15s
  pollInterval: 2000,           // 2s
  concurrency: 2                // 50-100 pods × 2 = 100-200 workers
}

// ═══════════════════════════════════════════
// 100-200 PODS (Very Large Cluster)
// ═══════════════════════════════════════════
{
  heartbeatInterval: 20000,     // 20s
  pollInterval: 3000,           // 3s
  concurrency: 1-2              // 100-200 pods × 1-2 = 100-400 workers
}
```

**Golden Rule:** As pod count increases, **increase intervals** to reduce S3 operation pressure.

### Future Optimizations (v15+)

These optimizations are planned for even better scalability:

#### 1. **Worker Registry Cache**
```javascript
// Current: All workers list full registry every heartbeatInterval
// Future: Only coordinator lists, workers cache with TTL

// Reduces: O(N²) → O(N) registry reads
// Impact: 67% reduction in LIST operations at 100 pods
```

#### 2. **popTicket() API**
```javascript
// Current: Workers scan all tickets via listWithPrefix()
// Future: Coordinator maintains in-memory ticket queue

await coordinator.popTicket(); // O(1) instead of O(M)

// Reduces: Eliminates worker ticket scans entirely
// Impact: 95% reduction in ticket GET operations
```

#### 3. **Ticket Partitioning**
```javascript
// Future: Shard tickets by worker ID hash
// tickets/shard-0/* → workers 0-24 scan
// tickets/shard-1/* → workers 25-49 scan
// tickets/shard-2/* → workers 50-74 scan
// tickets/shard-3/* → workers 75-99 scan

// Reduces: O(M) → O(M/shards) per worker
// Impact: 75% reduction in ticket scans (4 shards)
```

### Alternative Patterns for Extreme Scale

If you need to scale beyond 200 pods:

#### Option A: Queue Sharding
```javascript
// Divide load across multiple independent queues
const shardId = podIndex % 4;  // 4 shards

new S3QueuePlugin({
  resource: `jobs-shard-${shardId}`,  // jobs-shard-0, jobs-shard-1, etc.
  enableCoordinator: true,
  // ... same config
})

// Load balancer routes messages to shards
// Each shard: 25-50 pods instead of 200
```

#### Option B: Hybrid SQS Backend
```javascript
// Use S3 for persistence, SQS for coordination
new S3QueuePlugin({
  resource: 'jobs',
  coordinationBackend: 'sqs',          // Worker registry + tickets in SQS
  sqsQueueUrl: process.env.SQS_URL,
  persistToS3: true,                   // Messages stored in S3

  // Drastically reduces S3 operations
  // SQS handles high-frequency coordination
})
```

#### Option C: Redis Coordination Layer
```javascript
// Use Redis for coordination, S3 for message storage
new S3QueuePlugin({
  resource: 'jobs',
  coordinationBackend: 'redis',
  redisUrl: process.env.REDIS_URL,

  // Worker registry → Redis
  // Tickets → Redis
  // Messages → S3

  // Near-zero S3 coordination overhead
})
```

### Deployment Best Practices

#### 1. **Resource Allocation**
```yaml
# Kubernetes deployment example
apiVersion: apps/v1
kind: Deployment
metadata:
  name: s3queue-workers
spec:
  replicas: 100
  template:
    spec:
      containers:
      - name: worker
        image: my-app:latest
        resources:
          requests:
            cpu: 250m        # Adjust based on message workload
            memory: 512Mi
          limits:
            cpu: 500m
            memory: 1Gi
        env:
        - name: CONCURRENCY
          value: "2"         # 100 pods × 2 = 200 workers
        - name: HEARTBEAT_INTERVAL
          value: "15000"     # 15s for 100-pod scale
        - name: POLL_INTERVAL
          value: "2000"      # 2s for 100-pod scale
```

#### 2. **Graceful Scaling**
```javascript
// On pod shutdown (SIGTERM)
process.on('SIGTERM', async () => {
  console.log('🛑 Graceful shutdown initiated');

  // 1. Stop accepting new work
  await plugin.stopProcessing();

  // 2. Remove from worker registry
  await plugin.unregisterWorker();

  // 3. Wait for in-flight messages (up to visibilityTimeout)
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 4. Disconnect
  await db.disconnect();

  process.exit(0);
});
```

#### 3. **Health Checks**
```javascript
// Kubernetes liveness probe
app.get('/health', (req, res) => {
  const isHealthy = plugin.isRunning &&
                    plugin.lastHeartbeat > Date.now() - 60000;

  if (isHealthy) {
    res.status(200).json({ status: 'healthy' });
  } else {
    res.status(503).json({ status: 'unhealthy', reason: 'Worker stalled' });
  }
});

// Kubernetes readiness probe
app.get('/ready', (req, res) => {
  const isReady = plugin.isRunning &&
                  plugin.coordinatorElected;

  if (isReady) {
    res.status(200).json({ status: 'ready' });
  } else {
    res.status(503).json({ status: 'not ready', reason: 'Waiting for coordinator' });
  }
});
```

### Summary: Can I Run 100 Pods?

| Question | Answer |
|----------|--------|
| **Does it scale to 100 pods?** | ✅ **Yes** - with optimized config |
| **What config is required?** | ⚠️ `heartbeatInterval: 15s`, `pollInterval: 2s` |
| **What throughput can I expect?** | ✅ 200 parallel workers (with `concurrency: 2`) |
| **Will I hit S3 limits?** | ✅ **No** - ~3200 GET/s < 5500 limit |
| **What should I monitor?** | ⚠️ S3 throttling, stalled tickets, coordinator health |
| **What about 200+ pods?** | 🟡 Consider queue sharding or hybrid backends |

**Bottom Line:** 100 pods is the **sweet spot** for coordinator mode with S3 backend. Beyond that, evaluate sharding or alternative coordination layers (SQS/Redis).

---

## 🐛 Troubleshooting

### Common Issues

#### Issue 1: No Messages Being Processed

**Symptoms:**
- Messages enqueued but never processed
- Queue stats show pending messages

**Solutions:**

```javascript
// Check 1: Are workers started?
const stats = await queue.getStats();
console.log('Is running:', queue.isRunning);

if (!queue.isRunning) {
  await queue.startProcessing();
}

// Check 2: Is autoStart enabled?
const queue = new S3QueuePlugin({
  resource: 'tasks',
  autoStart: true,  // ← Make sure this is true
  onMessage: async (task) => { ... }
});

// Check 3: Are messages visible?
const queueEntries = await db.resources.tasks_queue.list();
console.log(queueEntries.map(e => ({
  id: e.id,
  status: e.status,
  visibleAt: e.visibleAt,
  now: Date.now(),
  visible: e.visibleAt <= Date.now()
})));
```

#### Issue 2: High Duplication Rate

**Symptoms:**
- Messages processed multiple times
- Duplication rate > 0%

**Solutions:**

```javascript
// Check 1: Inspect PluginStorage locks
const storage = queue.getStorage();
const lockKeys = await storage.list('locks');
console.log('Active locks:', lockKeys);

if (!lockKeys.length) {
  console.warn('No lock keys found - ensure workers are running and TTL not expiring immediately.');
}

// Check 2: Enable verbose mode
const queue = new S3QueuePlugin({
  resource: 'tasks',
  verbose: true,  // See detailed logs
  onMessage: async (task) => { ... }
});

// Check 3: Verify ETag support
const queueEntry = await db.resources.tasks_queue.get('entry-1');
console.log('Has ETag:', !!queueEntry._etag);
```

#### Issue 3: Messages Stuck in Processing

**Symptoms:**
- Messages never complete
- Processing count keeps growing

**Solutions:**

```javascript
// Check 1: Worker crashed?
// Check logs for uncaught exceptions

// Check 2: Visibility timeout too short?
const queue = new S3QueuePlugin({
  resource: 'tasks',
  visibilityTimeout: 60000,  // Increase if tasks take longer
  onMessage: async (task) => {
    // Add logging
    console.log('Started processing:', task.id);
    await processTask(task);
    console.log('Completed processing:', task.id);
  }
});

// Check 3: Handler errors not thrown?
onMessage: async (task) => {
  try {
    await processTask(task);
  } catch (error) {
    console.error('Handler error:', error);
    throw error;  // ← Make sure errors are re-thrown
  }
}

// Solution: Reset stuck messages
const queueEntries = await db.resources.tasks_queue.list();
const stuck = queueEntries.filter(e =>
  e.status === 'processing' &&
  Date.now() - e.claimedAt > 300000 // Stuck for 5+ minutes
);

for (const entry of stuck) {
  await db.resources.tasks_queue.update(entry.id, {
    status: 'pending',
    visibleAt: 0,
    claimedBy: null
  });
}
```

#### Issue 4: High Memory Usage

**Symptoms:**
- Memory usage grows over time
- Out of memory errors

**Solutions:**

```javascript
// Solution 1: Clear local cache periodically
setInterval(() => {
  queue.clearProcessedCache();
  console.log('Local queue cache cleared');
}, 3600000); // Every hour

// Solution 2: Reduce concurrency
const queue = new S3QueuePlugin({
  resource: 'tasks',
  concurrency: 3,  // Lower concurrency
  onMessage: async (task) => { ... }
});

// Solution 3: Shorten processed cache TTL (default: 30s)
const fastQueue = new S3QueuePlugin({
  resource: 'low_latency',
  processedCacheTTL: 15000
});

// Solution 4: Avoid keeping large objects in memory
onMessage: async (task) => {
  // ❌ Don't do this
  const largeData = await loadLargeFile();
  globalArray.push(largeData);

  // ✅ Do this
  const largeData = await loadLargeFile();
  await processData(largeData);
  // Let GC collect largeData
}
```

#### Issue 5: Dead Letter Queue Growing

**Symptoms:**
- Many messages in dead letter queue
- High failure rate

**Solutions:**

```javascript
// Analyze dead letters
const deadLetters = await db.resources.failed_tasks.list();

// Group by error type
const errorGroups = deadLetters.reduce((acc, dl) => {
  const errorType = dl.error.split(':')[0];
  acc[errorType] = (acc[errorType] || 0) + 1;
  return acc;
}, {});

console.log('Error distribution:', errorGroups);

// Fix root cause and reprocess
for (const dl of deadLetters) {
  // Investigate error
  console.log(dl.error);
  console.log(dl.data);

  // After fixing, re-enqueue
  await tasks.enqueue(dl.data);

  // Delete from dead letter
  await db.resources.failed_tasks.delete(dl.id);
}
```

### Debug Mode

Enable comprehensive logging:

```javascript
const queue = new S3QueuePlugin({
  resource: 'tasks',
  verbose: true,  // Enable all logs
  onMessage: async (task, context) => {
    console.log('=== Processing Start ===');
    console.log('Task:', task);
    console.log('Context:', context);
    console.log('Worker:', context.workerId);
    console.log('Attempt:', context.attempts);

    try {
      const result = await processTask(task);
      console.log('=== Processing Success ===');
      console.log('Result:', result);
      return result;
    } catch (error) {
      console.log('=== Processing Error ===');
      console.log('Error:', error.message);
      console.log('Stack:', error.stack);
      throw error;
    }
  }
});

// Monitor all events
queue.on('plg:s3-queue:message-enqueued', e => console.log('📨 Enqueued:', e));
queue.on('plg:s3-queue:message-claimed', e => console.log('🔒 Claimed:', e));
queue.on('plg:s3-queue:message-processing', e => console.log('⚙️ Processing:', e));
queue.on('plg:s3-queue:message-completed', e => console.log('✅ Completed:', e));
queue.on('plg:s3-queue:message-retry', e => console.log('🔄 Retry:', e));
queue.on('plg:s3-queue:message-dead', e => console.log('💀 Dead:', e));
```

---

## ❓ FAQ

### General Questions

**Q: Do I need AWS SQS or RabbitMQ?**
A: No! S3Queue works entirely with S3DB. No additional services required.

**Q: Does it work with MinIO/LocalStack?**
A: Yes! Fully compatible with MinIO, LocalStack, and any S3-compatible storage.

**Q: Can I use it in production?**
A: Yes! S3Queue is production-ready with 0% duplication and comprehensive error handling.

**Q: How many workers can I run?**
A: As many as you want! Works across multiple processes, containers, and servers.

**Q: Is it serverless-friendly?**
A: Yes! Works great with AWS Lambda, Cloud Functions, etc.

### Performance Questions

**Q: What's the maximum throughput?**
A: Depends on concurrency and S3 latency. Typically 10-150 messages/second.

**Q: How does it compare to AWS SQS?**
A: SQS is faster but costs more. S3Queue is perfect for moderate throughput (< 1000 msg/s).

**Q: Can I process millions of messages?**
A: Yes! S3Queue scales horizontally by adding more workers.

**Q: What about latency?**
A: Typical latency is 150-600ms depending on S3 backend and concurrency.

### Technical Questions

**Q: How does it guarantee zero duplication?**
A: Combination of distributed locks (prevents cache races), deduplication cache (fast checks), and ETag atomicity (prevents double claims).

**Q: What happens if a worker crashes?**
A: Messages become visible again after visibility timeout and get reprocessed.

**Q: Can I manually retry failed messages?**
A: Yes! Query the dead letter queue and re-enqueue messages.

**Q: Does it preserve message order?**
A: No. Messages are processed in parallel. Use `concurrency: 1` for sequential processing.

**Q: Can I prioritize certain messages?**
A: Yes! Use separate queues with different polling intervals or filter in handler.

**Q: How are retries handled?**
A: Automatic exponential backoff: 1s, 2s, 4s, 8s, etc. up to max attempts.

**Q: What's the difference from Queue Consumer Plugin?**
A: Queue Consumer Plugin reads from external queues (SQS, RabbitMQ). S3Queue Plugin creates queues using S3DB.

### Integration & Deployment

**Q: Can I use S3Queue with multiple databases/buckets?**

**A:** Yes! Create separate queue instances with different connection strings:

```javascript
// Queue 1: Production tasks
const db1 = new Database({ connectionString: 's3://key:secret@prod-bucket' });
const queue1 = new S3QueuePlugin({ resource: 'tasks', onMessage: handleTask });
await db1.usePlugin(queue1);

// Queue 2: Analytics jobs
const db2 = new Database({ connectionString: 's3://key:secret@analytics-bucket' });
const queue2 = new S3QueuePlugin({ resource: 'jobs', onMessage: handleJob });
await db2.usePlugin(queue2);
```

**Q: How do I deploy S3Queue in AWS Lambda?**

**A:** S3Queue works great in Lambda with a few considerations:

```javascript
// Lambda handler
import { Database, S3QueuePlugin } from 's3db.js';

// Initialize outside handler (reused across invocations)
const db = new Database({ connectionString: process.env.S3DB_CONNECTION });
const queue = new S3QueuePlugin({
  resource: 'tasks',
  workers: 1,              // Single worker in Lambda
  pollInterval: 5000,      // Poll every 5 seconds
  onMessage: async (task) => {
    // Process task
  }
});
await db.usePlugin(queue);
await db.connect();

export const handler = async (event) => {
  // Queue automatically polls in background
  // Or manually trigger: await queue.processNext();
  return { statusCode: 200 };
};
```

**Important Lambda considerations:**
- Set `workers: 1` (Lambda is single-threaded)
- Use environment variable for connection string
- Increase Lambda timeout to match visibility timeout
- Consider using EventBridge scheduled rule to trigger polling

**Q: Can I monitor queue health in production?**

**A:** Yes! Subscribe to queue events for monitoring:

```javascript
// Track queue statistics
db.on('plg:queue:stats', ({ pending, processing, failed, dlq }) => {
  console.log(`Queue health: ${pending} pending, ${processing} processing, ${failed} failed, ${dlq} in DLQ`);

  // Send to monitoring service (Datadog, CloudWatch, etc.)
  metrics.gauge('queue.pending', pending);
  metrics.gauge('queue.processing', processing);
  metrics.gauge('queue.dlq', dlq);
});

// Alert on errors
db.on('plg:queue:error', ({ error, message }) => {
  console.error('Queue error:', error);
  alerts.notify(`Queue error: ${error.message}`);
});

// Track processing time
db.on('plg:queue:message:complete', ({ message, duration }) => {
  metrics.histogram('queue.processing_time', duration);
});
```

**Q: How do I gracefully shutdown workers?**

**A:** S3Queue provides automatic graceful shutdown:

```javascript
const queue = new S3QueuePlugin({
  resource: 'tasks',
  onMessage: async (task) => { /* process */ }
});
await db.usePlugin(queue);

// Graceful shutdown on SIGTERM/SIGINT
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');

  // 1. Stop accepting new messages
  await queue.stop();

  // 2. Wait for in-flight messages to complete (up to visibility timeout)
  await queue.drain();

  // 3. Disconnect database
  await db.disconnect();

  console.log('Shutdown complete');
  process.exit(0);
});
```

The `drain()` method waits for all in-flight messages to complete before returning.

### Advanced Use Cases

**Q: Can I implement priority queues?**

**A:** Yes! Use multiple queues with different polling strategies:

```javascript
// High-priority queue (poll frequently)
const highPriorityQueue = new S3QueuePlugin({
  resource: 'high_priority_tasks',
  pollInterval: 1000,      // Poll every 1 second
  workers: 10,
  onMessage: handleHighPriority
});

// Low-priority queue (poll less frequently)
const lowPriorityQueue = new S3QueuePlugin({
  resource: 'low_priority_tasks',
  pollInterval: 30000,     // Poll every 30 seconds
  workers: 2,
  onMessage: handleLowPriority
});

await db.usePlugin(highPriorityQueue, 'high');
await db.usePlugin(lowPriorityQueue, 'low');
```

Alternatively, add priority metadata and filter in the handler:

```javascript
await tasks.enqueue({ type: 'email', priority: 'high', ... });
await tasks.enqueue({ type: 'report', priority: 'low', ... });

const queue = new S3QueuePlugin({
  resource: 'tasks',
  onMessage: async (task) => {
    if (task.priority === 'high') {
      // Process immediately
      await processHighPriority(task);
    } else {
      // Process in background
      setTimeout(() => processLowPriority(task), 5000);
    }
  }
});
```

**Q: How do I handle scheduled/delayed messages?**

**A:** Use TTLPlugin or custom scheduling:

```javascript
// Option 1: Use TTL for delayed processing
import { TTLPlugin } from 's3db.js/plugins';

await db.usePlugin(new TTLPlugin());

// Enqueue message with future visibility
await tasks.insert({
  type: 'send-reminder',
  data: { userId: 123 },
  status: 'scheduled',
  visibleAt: Date.now() + (24 * 60 * 60 * 1000)  // 24 hours from now
});

// Queue polls only for visible messages
const queue = new S3QueuePlugin({
  resource: 'tasks',
  onMessage: async (task) => {
    if (Date.now() < task.visibleAt) {
      return; // Not ready yet
    }
    await processTask(task);
  }
});

// Option 2: Use partitions for scheduled messages
const tasks = await db.createResource({
  name: 'tasks',
  attributes: {
    type: 'string|required',
    status: 'string|required',
    scheduledFor: 'number'
  },
  partitions: {
    byStatus: { fields: { status: 'string' } }
  }
});

// Query only scheduled messages that are ready
const ready = await tasks.query({
  status: 'scheduled',
  scheduledFor: { $lte: Date.now() }
});
```

---

## 📊 Comparison with Other Queues

### Feature Matrix

| Feature | S3Queue | AWS SQS | RabbitMQ | Redis Queue |
|---------|---------|---------|----------|-------------|
| **Setup** | Zero config | AWS account | Server setup | Redis server |
| **Cost** | S3 only (~$0.005/1K) | $0.40/million | Server costs | Server costs |
| **Throughput** | 10-150 msg/s | 3000+ msg/s | 20000+ msg/s | 10000+ msg/s |
| **Latency** | 150-600ms | 10-50ms | 1-10ms | 1-5ms |
| **Atomicity** | ✅ ETag + Locks | ✅ Native | ✅ Native | ✅ Lua scripts |
| **Durability** | ✅ S3 (99.999999999%) | ✅ High | ⚠️ Configurable | ⚠️ Persistence mode |
| **Visibility Timeout** | ✅ | ✅ | ✅ | ✅ |
| **Dead Letter Queue** | ✅ | ✅ | ✅ | ✅ |
| **Message Ordering** | ❌ | ⚠️ FIFO queues | ✅ | ⚠️ Single consumer |
| **Multi-region** | ✅ S3 replication | ⚠️ Cross-region | ⚠️ Federation | ⚠️ Clustering |
| **Monitoring** | ✅ Events | ✅ CloudWatch | ⚠️ Management UI | ⚠️ CLI/GUI tools |
| **Serverless** | ✅ | ✅ | ❌ | ❌ |

### When to Use Each

```
Use S3Queue when:
  ✅ Already using S3DB
  ✅ Don't want to manage additional services
  ✅ Throughput < 1000 messages/second
  ✅ Cost is a concern
  ✅ Need simple setup

Use AWS SQS when:
  ✅ Need very high throughput (> 1000 msg/s)
  ✅ Need low latency (< 50ms)
  ✅ Already on AWS
  ✅ Need FIFO guarantees

Use RabbitMQ when:
  ✅ Need ultra-high throughput (> 10000 msg/s)
  ✅ Need complex routing
  ✅ Need message ordering
  ✅ On-premise infrastructure

Use Redis Queue when:
  ✅ Need lowest latency (< 5ms)
  ✅ Already using Redis
  ✅ Need in-memory speed
  ✅ Durability not critical
```

### Cost Comparison (1 million messages)

```
S3Queue (LocalStack):    FREE (development)
S3Queue (AWS S3):        ~$5    (9M S3 requests)
AWS SQS:                 $0.40  (1M requests)
RabbitMQ (EC2 t3.small): ~$15   (monthly server cost)
Redis (ElastiCache):     ~$12   (monthly server cost)
```

---

