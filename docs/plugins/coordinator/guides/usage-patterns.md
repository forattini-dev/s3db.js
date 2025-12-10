# Usage Patterns

> **In this guide:** Multi-instance deployment, monitoring, testing, and real-world examples.

**Navigation:** [← Back to Coordinator Plugin](/plugins/coordinator/README.md) | [Configuration](/plugins/coordinator/guides/configuration.md)

---

## Problem and Solution

### Traditional Problem

In multi-instance deployments, certain operations should only run on **one instance at a time**:

```
┌─────────────────────────────────────────────────────────────┐
│              Without Coordinator (Problems)                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Instance A ──→ Cleanup Job ──→ Deletes record X           │
│  Instance B ──→ Cleanup Job ──→ Deletes record X (duplicate!)│
│  Instance C ──→ Cleanup Job ──→ Deletes record X (duplicate!)│
│                                                              │
│  Result: Wasted resources, duplicate work, race conditions  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Coordinator Solution

```
┌─────────────────────────────────────────────────────────────┐
│               With Coordinator (Solved!)                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Instance A ──→ 👑 COORDINATOR ──→ Cleanup Job             │
│  Instance B ──→ Worker (idle for this task)                │
│  Instance C ──→ Worker (idle for this task)                │
│                                                              │
│  Result: Only one instance does the work, no conflicts      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Basic Usage

### Enable Coordinator Mode

```javascript
import { Database, S3QueuePlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

const queuePlugin = new S3QueuePlugin({
  resource: 'tasks',
  enableCoordinator: true,
  heartbeatInterval: 30000,
  workerTimeout: 90000
});

await db.usePlugin(queuePlugin);
```

### Check Coordinator Status

```javascript
// Check if this instance is coordinator
if (queuePlugin.isCoordinator) {
  console.log('This instance is the coordinator');
}

// Get worker ID
console.log(`Worker ID: ${queuePlugin.workerId}`);
```

---

## Monitoring Coordinator Elections

### Track Coordinator Changes

```javascript
let coordinatorChanges = 0;

plugin.on('coord:coordinator-elected', ({ workerId, activeWorkers }) => {
  coordinatorChanges++;
  console.log(`New coordinator: ${workerId}`);
  console.log(`Active workers: ${activeWorkers.length}`);

  if (coordinatorChanges > 5) {
    console.warn('Too many coordinator changes! Check worker health.');
  }
});

plugin.on('coord:coordinator-promoted', ({ workerId }) => {
  console.log(`This worker became coordinator: ${workerId}`);
});

plugin.on('coord:coordinator-demoted', ({ workerId, reason }) => {
  console.log(`This worker lost coordination: ${reason}`);
});
```

### Monitor Cold Start

```javascript
plugin.on('coord:cold-start-phase-changed', ({ phase, duration }) => {
  console.log(`Cold start phase: ${phase}`);
  // Phase values: 'observing', 'electing', 'preparing', 'ready'
});
```

### Monitor Heartbeats

```javascript
plugin.on('coord:worker-heartbeat', ({ workerId, timestamp }) => {
  console.log(`Heartbeat from ${workerId} at ${new Date(timestamp)}`);
});

plugin.on('coord:coordinator-epoch-renewed', ({ workerId, newEpoch }) => {
  console.log(`Epoch renewed until ${new Date(newEpoch)}`);
});
```

---

## Graceful Shutdown

### Proper Shutdown Pattern

```javascript
// Ensure clean shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down...');

  // Stop coordinator activities
  await plugin.stop();

  // Disconnect database
  await db.disconnect();

  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down...');
  await plugin.stop();
  await db.disconnect();
  process.exit(0);
});
```

---

## Testing Coordinator Behavior

### Skip Cold Start for Tests

```javascript
const plugin = new S3QueuePlugin({
  resource: 'tasks',
  enableCoordinator: true,
  skipColdStart: true,  // Faster tests
  coldStartObservationWindow: 0
});
```

### Force Coordinator Election

```javascript
// Manually trigger election
await plugin.ensureCoordinator({ force: true });

// Force specific worker as coordinator (testing only)
await plugin.ensureCoordinator({
  force: true,
  desiredCoordinator: 'worker-1234567890-abc123'
});
```

### Disable Coordinator for Single Instance

```javascript
const plugin = new S3QueuePlugin({
  resource: 'tasks',
  enableCoordinator: false  // Single-instance mode
});
```

---

## Real-World Examples

### S3Queue with Coordinator

```javascript
import { S3QueuePlugin } from 's3db.js';

const queuePlugin = new S3QueuePlugin({
  resource: 'tasks',
  enableCoordinator: true,
  ticketInterval: 5000,  // Coordinator publishes tickets every 5s
  heartbeatInterval: 30000
});

// Only coordinator publishes tickets
queuePlugin.on('plg:s3-queue:tickets-published', ({ count }) => {
  console.log(`Coordinator published ${count} tickets`);
});
```

### TTL Cleanup with Coordinator

```javascript
import { TTLPlugin } from 's3db.js';

const ttlPlugin = new TTLPlugin({
  resources: ['sessions'],
  enableCoordinator: true,
  cleanupInterval: 60000  // Coordinator runs cleanup every 60s
});

// Only coordinator runs cleanup
ttlPlugin.on('plg:ttl:cleanup-completed', ({ deleted, duration }) => {
  console.log(`Coordinator deleted ${deleted} expired records in ${duration}ms`);
});
```

### Scheduler with Coordinator

```javascript
import { SchedulerPlugin } from 's3db.js';

const schedulerPlugin = new SchedulerPlugin({
  jobs: {
    'daily-report': {
      schedule: '0 0 * * *',  // Midnight
      action: async () => {
        await generateDailyReport();
      }
    }
  },
  enableCoordinator: true  // Only coordinator runs jobs
});

schedulerPlugin.on('plg:scheduler:job-executed', ({ jobId, duration }) => {
  console.log(`Coordinator executed job ${jobId} in ${duration}ms`);
});
```

---

## Multi-Instance Deployment

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: s3db-workers
spec:
  replicas: 3  # Multiple instances
  template:
    spec:
      containers:
        - name: worker
          env:
            - name: ENABLE_COORDINATOR
              value: "true"
            - name: HEARTBEAT_INTERVAL
              value: "30000"
            - name: WORKER_TIMEOUT
              value: "90000"
```

### Environment-Based Configuration

```javascript
const plugin = new S3QueuePlugin({
  resource: 'tasks',
  enableCoordinator: process.env.ENABLE_COORDINATOR === 'true',
  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '30000'),
  workerTimeout: parseInt(process.env.WORKER_TIMEOUT || '90000')
});
```

---

## Storage Cost

Coordination overhead is minimal:

| Metric | Value |
|--------|-------|
| Heartbeat size | ~100 bytes |
| Heartbeat frequency | Every 30s (default) |
| Cost per worker | ~$0.0005/month |
| 10 workers | ~$0.005/month |

**Calculation:**
- 10 workers × 2 heartbeats/min × 60 min × 24 hours × 30 days = 864,000 PUTs
- S3 PUT cost: $0.005 per 1,000 requests
- Total: 864 × $0.005 = ~$4.32/month (worst case, usually much less)

---

## See Also

- [Configuration](/plugins/coordinator/guides/configuration.md) - All options and API reference
- [Best Practices](/plugins/coordinator/guides/best-practices.md) - Performance, troubleshooting, FAQ
