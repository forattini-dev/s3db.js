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
  logLevel: 'silent',                       // Reduce I/O overhead

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

### Future Optimizations

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
