## 🏗️ Architecture Deep Dive

### The Three Resources

S3Queue creates three S3DB resources for each queue:

```
┌─────────────────────────────────────────────────────────┐
│                    S3Queue Resources                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Original Resource (tasks)                           │
│     └─ Your actual data                                 │
│                                                          │
│  2. Queue Resource (tasks_queue)                        │
│     ├─ Queue metadata                                   │
│     ├─ status: pending/processing/completed/dead       │
│     ├─ attempts: retry count                            │
│     ├─ visibleAt: visibility timeout                    │
│     └─ ETag: for atomic claims                          │
│                                                          │
│  3. Plugin Storage Locks                                │
│     ├─ Stored under `plugin=s3-queue/locks/*`           │
│     ├─ workerId/token metadata for ownership            │
│     ├─ Auto-expire based on TTL                         │
│     └─ No extra resource clutter                        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Message Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                     Complete Message Flow                        │
└─────────────────────────────────────────────────────────────────┘

1️⃣  ENQUEUE
    │
    ├─► Create record in 'tasks' resource
    │   { id: 'task-1', type: 'send-email', data: {...} }
    │
    └─► Create queue entry in 'tasks_queue' resource
        { id: 'queue-1', originalId: 'task-1', status: 'pending',
          visibleAt: 0, attempts: 0 }

2️⃣  POLL (by Worker A)
    │
    └─► Query 'tasks_queue' for pending messages
        WHERE status='pending' AND visibleAt <= now

3️⃣  ACQUIRE LOCK
    │
    ├─► Use PluginStorage: storage.acquireLock('msg-queue-1', { ttl: 5 })
    │   { name: 'msg-queue-1', token: 'xyz', workerId: 'worker-A' }
    │
    ├─► If returns null → Skip (another worker processed)
    └─► If lock object returned → Worker A owns the lock ✓

4️⃣  CHECK CACHE (while holding lock)
    │
    ├─► Is queue-1 flagged in the distributed cache?
    │   └─► Yes → Release lock, skip message
    │   └─► No → Add marker (PluginStorage + local), continue
    │
    └─► Release lock with storage.releaseLock(lock) (cache updated)

5️⃣  CLAIM WITH ETAG
    │
    ├─► Fetch queue entry with ETag
    │   { id: 'queue-1', _etag: '"abc123"', status: 'pending' }
    │
    └─► Conditional update (atomic):
        UPDATE tasks_queue SET
          status='processing',
          claimedBy='worker-A',
          visibleAt=now+30000,
          attempts=1
        WHERE id='queue-1' AND _etag='"abc123"'

        Only ONE worker succeeds ✓

6️⃣  PROCESS
    │
    ├─► Load original record: tasks.get('task-1')
    │
    ├─► Execute handler: onMessage(task, context)
    │
    └─► Result:
        ├─► Success → Mark completed
        ├─► Error → Retry or dead letter
        └─► Timeout → Becomes visible again

7️⃣  COMPLETE
    │
    └─► Update queue entry:
        { status: 'completed', result: {...}, completedAt: now }

8️⃣  RETRY (if failed)
    │
    ├─► Calculate backoff: Math.min(2^attempts * 1000, 30000)
    │
    └─► Update queue entry:
        { status: 'pending', visibleAt: now+backoff, attempts: 2 }

9️⃣  DEAD LETTER (if max attempts exceeded)
    │
    ├─► Update queue entry:
    │   { status: 'dead', error: 'Max attempts exceeded' }
    │
    └─► Create entry in 'failed_tasks' resource:
        { originalId: 'task-1', error: '...', attempts: 3, data: {...} }
```

### Lock Mechanism Details

```javascript
// How locks prevent race conditions

Worker A                          Worker B
   │                                 │
   ├─► Try create lock-msg-1        │
   │   ✓ SUCCESS                     │
   │                                 ├─► Try create lock-msg-1
   │                                 │   ✗ FAIL (already exists)
   │                                 │
   ├─► Check cache (protected)      │
   │   Not in cache ✓                │
   │                                 └─► Skip message
   ├─► Add to cache                 │
   │                                 │
   ├─► Release lock                 │
   │                                 │
   ├─► Claim with ETag              │
   │   ✓ SUCCESS (unique)            │
   │                                 │
   ├─► Process message              │
   │                                 │
   └─► Complete                     │
```

### ETag Atomicity

S3 ETags provide strong consistency guarantees:

```javascript
// Two workers try to claim simultaneously

┌─────────────────────────────────────────────────────────┐
│ Queue Entry State                                        │
├─────────────────────────────────────────────────────────┤
│ { id: 'msg-1', status: 'pending', _etag: '"v1"' }      │
└─────────────────────────────────────────────────────────┘

Worker A                          Worker B
   │                                 │
   ├─► GET msg-1                    │
   │   Returns: _etag="v1"           │
   │                                 ├─► GET msg-1
   │                                 │   Returns: _etag="v1"
   │                                 │
   ├─► UPDATE msg-1                 │
   │   WHERE _etag="v1"              │
   │   ✓ SUCCESS                     │
   │   New ETag: "v2"                │
   │                                 │
   │                                 ├─► UPDATE msg-1
   │                                 │   WHERE _etag="v1"
   │                                 │   ✗ FAIL (ETag mismatch)
   │                                 │   Current ETag is "v2"
   │                                 │
   └─► Processes message            └─► Skips (failed claim)

Result: Only Worker A processes ✓
```

---

## 📡 API Reference

### Plugin Methods

#### `startProcessing(handler?, options?)`

Start processing messages with workers.

```javascript
await queue.startProcessing();

// With custom handler
await queue.startProcessing(async (record) => {
  console.log('Custom handler:', record);
  return { done: true };
});

// With options
await queue.startProcessing(null, {
  concurrency: 10
});
```

#### `stopProcessing()`

Stop all workers gracefully (waits for current tasks).

```javascript
await queue.stopProcessing();
console.log('All workers stopped');
```

#### `getStats()`

Get detailed queue statistics.

```javascript
const stats = await queue.getStats();
console.log(stats);
// {
//   total: 100,
//   pending: 10,
//   processing: 5,
//   completed: 80,
//   failed: 3,
//   dead: 2
// }
```

### Resource Methods

These methods are added to your resource:

#### `resource.enqueue(data)`

Add a message to the queue.

```javascript
const message = await tasks.enqueue({
  type: 'send-email',
  to: 'user@example.com'
});

console.log(message.id); // 'task-123'
```

#### `resource.queueStats()`

Get queue statistics for this resource.

```javascript
const stats = await tasks.queueStats();
console.log(stats);
```

#### `resource.startProcessing(handler, options?)`

Start processing with a custom handler.

```javascript
await tasks.startProcessing(
  async (task) => {
    await processTask(task);
  },
  { concurrency: 5 }
);
```

#### `resource.stopProcessing()`

Stop processing for this resource.

```javascript
await tasks.stopProcessing();
```

#### `resource.extendQueueVisibility(queueId, extraMs)`

Extend the visibility timeout for a specific queue entry. Useful when the handler knows it will take longer than the original `visibilityTimeout`.

```javascript
await tasks.extendQueueVisibility(queueId, 5 * 60 * 1000); // add 5 minutes
```

Returns `true` when the update succeeds.

#### `resource.clearQueueCache()`

Clear the local in-memory deduplication cache (useful during debugging or when tuning `processedCacheTTL`).

```javascript
await tasks.clearQueueCache();
```

### Handler Context

The `onMessage` handler receives a context object:

```javascript
onMessage: async (record, context) => {
  console.log(context);
  // {
  //   workerId: 'worker-abc123',
  //   attempts: 1,
  //   maxAttempts: 3,
  //   queueId: 'queue-entry-id'
  // }
}
```

---

## 🎭 Event System

### Available Events

```javascript
const queue = new S3QueuePlugin({ ... });

// Message enqueued
queue.on('plg:s3-queue:message-enqueued', (event) => {
  console.log(`📨 Enqueued: ${event.id}`);
  // { id, queueId }
});

// Message claimed by worker
queue.on('plg:s3-queue:message-claimed', (event) => {
  console.log(`🔒 Claimed: ${event.queueId}`);
  // { queueId, workerId, attempts }
});

// Processing started
queue.on('plg:s3-queue:message-processing', (event) => {
  console.log(`⚙️ Processing: ${event.queueId}`);
  // { queueId, workerId }
});

// Message recovered after visibility timeout
queue.on('plg:s3-queue:message-recovered', (event) => {
  console.log(`🛠 Recovered: ${event.queueId}`);
  // { queueId, originalId }
});

// Message completed
queue.on('plg:s3-queue:message-completed', (event) => {
  console.log(`✅ Completed in ${event.duration}ms`);
  // { queueId, duration, attempts, result }
});

// Retry scheduled
queue.on('plg:s3-queue:message-retry', (event) => {
  console.log(`🔄 Retry ${event.attempts}/${event.maxAttempts}`);
  // { queueId, error, attempts, maxAttempts, nextVisibleAt }
});

// Moved to dead letter queue
queue.on('plg:s3-queue:message-dead', (event) => {
  console.log(`💀 Dead letter: ${event.queueId}`);
  // { queueId, originalId, error, attempts }
});

// Workers started
queue.on('plg:s3-queue:workers-started', (event) => {
  console.log(`🚀 Started ${event.concurrency} workers`);
  // { concurrency, workerId }
});

// Workers stopped
queue.on('plg:s3-queue:workers-stopped', (event) => {
  console.log(`🛑 Workers stopped`);
  // { workerId }
});
```

### Event-Driven Monitoring

```javascript
// Real-time monitoring dashboard
const metrics = {
  enqueued: 0,
  completed: 0,
  failed: 0,
  totalDuration: 0
};

queue.on('plg:s3-queue:message-enqueued', () => {
  metrics.enqueued++;
  updateDashboard();
});

queue.on('plg:s3-queue:message-completed', (event) => {
  metrics.completed++;
  metrics.totalDuration += event.duration;
  updateDashboard();
});

queue.on('plg:s3-queue:message-dead', () => {
  metrics.failed++;
  updateDashboard();
  alertAdmins();
});

function updateDashboard() {
  console.log({
    ...metrics,
    avgDuration: metrics.totalDuration / metrics.completed,
    successRate: (metrics.completed / metrics.enqueued) * 100
  });
}
```

---

