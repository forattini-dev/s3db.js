# Quick Reference: OperationsPool Architecture

## High-Level Architecture Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                      User Application                          │
│         (e.g., Database.insert(), Database.update())          │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────┐
│                  Database Class                              │
│  (src/database.class.js)                                     │
│  - Defines Resource schema                                  │
│  - High-level CRUD operations                               │
│  - Uses @supercharge/promise-pool for batches               │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────┐
│                   S3Client Class                             │
│  (src/clients/s3-client.class.js)                           │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  _executeOperation(fn, options)                      │  │
│  │  _executeBatch(fns, options)                         │  │
│  │                                                       │  │
│  │  Routes ALL operations through pool                  │  │
│  └──────────────────┬─────────────────────────────────┘  │
│                     │                                     │
│  ┌──────────────────▼─────────────────────────────────┐  │
│  │    OperationsPool Instance                         │  │
│  │    (per S3Client)                                  │  │
│  │    - Concurrency: 10 (default)                    │  │
│  │    - Enabled by default                           │  │
│  │    - Independent per client                       │  │
│  └──────────────────┬─────────────────────────────────┘  │
│                     │                                     │
└────────────────────┬─────────────────────────────────────┘
                     │
        ┌────────────┴────────────┬──────────────────┐
        │                         │                  │
┌───────▼────────┐      ┌────────▼─────┐   ┌─────────▼──────┐
│ PriorityQueue  │      │  Task Retry  │   │  Metrics &     │
│                │      │  Logic       │   │  Monitoring    │
│ - Heap-based   │      │              │   │                │
│ - Priority     │      │ - Exponential│   │ - RollingMetr. │
│   aging        │      │   backoff    │   │ - RollingWindow│
│ - O(log n)     │      │ - Timeout    │   │ - MemorySamp.  │
│   ops          │      │ - Abort sig  │   │ - TaskMetrics  │
└────────────────┘      └──────────────┘   └────────────────┘
        │                       │                  │
        └───────────┬───────────┴──────────────────┘
                    │
        ┌───────────▼──────────────┐
        │  AdaptiveTuning (opt.)   │
        │                          │
        │ Auto-adjust concurrency  │
        │ based on:                │
        │ - Latency                │
        │ - Memory usage           │
        │ - Throughput             │
        └──────────────────────────┘
```

## Data Flow: Single Operation

```
User Code
    │
    ├─> db.users.insert({name: 'John'})
    │
    ├─> Resource.insert()
    │
    ├─> S3Client.putObject()
    │
    ├─> S3Client._executeOperation(fn)
    │
    ├─> OperationsPool.enqueue(fn, options)
    │
    ├─> PriorityTaskQueue.enqueue(task)
    │   └─> Heap insertion O(log n)
    │
    ├─> processNext() [scheduled via queueMicrotask]
    │
    ├─> _drainQueue()
    │   └─> While (concurrency not exceeded):
    │       ├─> dequeue() next highest-priority task
    │       ├─> _executeTaskWithRetry()
    │       └─> Track in active map
    │
    ├─> _executeTaskWithRetry()
    │   └─> For attempt 0..retries:
    │       ├─> _executeWithTimeout()
    │       ├─> Promise.race(operation, timeout)
    │       └─> On error: check retryable + backoff delay
    │
    ├─> _recordTaskCompletion()
    │   ├─> Update metrics
    │   ├─> Feed to AdaptiveTuning (if enabled)
    │   └─> Emit events (pool:taskCompleted)
    │
    └─> User receives result

Time: ~0-100ms (depending on S3 latency)
```

## Data Flow: Batch Operations

```
User Code
    │
    ├─> S3Client.deleteObjects([{Key: 'a'}, {Key: 'b'}, ...])
    │   or
    │   Resource.query().delete()
    │   or
    │   Database batch operations
    │
    ├─> S3Client._executeBatch([fn1, fn2, fn3, ...])
    │
    ├─> OperationsPool.addBatch(fns, options)
    │
    ├─> For each fn, enqueue(fn) with {batchId, index}
    │
    ├─> processNext() [all at once]
    │
    ├─> _drainQueue() [batches execute respecting concurrency]
    │   └─> Max concurrent = concurrency limit
    │       ├─> Callbacks fired per item:
    │       │   ├─> onItemComplete(item, result)
    │       │   └─> onItemError(item, error)
    │       └─> All tracked in results/errors arrays
    │
    └─> Promise.allSettled() waits for all
        └─> {results: [...], errors: [...]}
```

## Configuration Examples

### Minimal (defaults)
```javascript
const db = new Database({
  connectionString: 's3://bucket/path'
});
// Pool enabled, concurrency=10, retries=3, timeout=30s
```

### Explicit Configuration
```javascript
const db = new Database({
  connectionString: 's3://bucket/path',
  operationsPool: {
    enabled: true,
    concurrency: 25,
    retries: 5,
    retryDelay: 500,
    timeout: 60000,
    retryableErrors: ['NetworkingError', 'SlowDown']
  }
});
```

### Auto-tuning
```javascript
const db = new Database({
  connectionString: 's3://bucket/path',
  operationsPool: {
    enabled: true,
    concurrency: 'auto',  // Uses AdaptiveTuning
    autoTuning: {
      minConcurrency: 5,
      maxConcurrency: 100,
      targetLatency: 200,
      targetMemoryPercent: 0.7
    }
  }
});
```

### Disabled
```javascript
const db = new Database({
  connectionString: 's3://bucket/path',
  operationsPool: false  // No pool, direct execution
});
```

## Event Monitoring

```javascript
const db = new Database({...});
const client = db.client;  // Access S3Client

// Monitor pool events
client.on('pool:taskStarted', (task) => {
  console.log('Task started:', task.id);
});

client.on('pool:taskCompleted', (task, result) => {
  console.log('Task completed:', task.id);
});

client.on('pool:taskError', (task, error) => {
  console.log('Task failed:', task.id, error.message);
});

client.on('pool:taskRetry', (task, attempt) => {
  console.log(`Task retry attempt ${attempt}`);
});

client.on('pool:taskMetrics', (metrics) => {
  console.log('Task metrics:', metrics);
});

// Check stats
const stats = client.getQueueStats();
console.log(`Queue: ${stats.queueSize}, Active: ${stats.activeCount}`);

const metrics = client.getAggregateMetrics();
console.log(`Avg execution: ${metrics.avgExecution}ms`);
console.log(`Error rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
```

## Performance Tuning Guidelines

### High Throughput (Many Small Operations)
```javascript
operationsPool: {
  concurrency: 50,  // Higher concurrency
  retryDelay: 500,  // Shorter backoff
  timeout: 10000,   // Shorter timeout
  monitoring: { mode: 'light' }  // Reduce overhead
}
```

### High Reliability (Few Large Operations)
```javascript
operationsPool: {
  concurrency: 10,  // Lower concurrency, less resource contention
  retries: 5,       // More retries
  retryDelay: 2000, // Longer backoff for transient errors
  timeout: 60000,   // Longer timeout
  monitoring: { mode: 'full' }  // Detailed metrics
}
```

### Memory-Constrained Environment
```javascript
operationsPool: {
  concurrency: 5,   // Lower concurrency
  monitoring: {
    mode: 'light',  // No memory sampling
    collectMetrics: false  // No metrics storage
  }
}
```

### Auto-Tuning (Recommended Default)
```javascript
operationsPool: {
  concurrency: 'auto',  // System-aware initial concurrency
  autoTuning: {
    targetLatency: 300,
    targetMemoryPercent: 0.75,
    adjustmentInterval: 3000  // Check every 3s
  }
}
```

## Debugging Common Issues

### High Queue Size
- Increase `concurrency`
- Reduce operation `timeout` (if slow operations)
- Check for stuck operations (use `pool:taskStarted` events)

### High Error Rate
- Check `retryableErrors` configuration
- Increase `retryDelay` for transient errors
- Monitor S3 service status

### Memory Pressure
- Decrease `concurrency`
- Set `monitoring.mode` to 'light'
- Enable `autoTuning` for automatic adjustment

### Slow Operations
- Check operation execution time via `getAggregateMetrics()`
- Look at `p95Execution` / `p99Execution` percentiles
- Check if operations are timing out and retrying

## Key Methods Cheat Sheet

```javascript
// Configuration
db.client.operationsPool.setConcurrency(n)

// Monitoring
db.client.getQueueStats()           // Real-time state
db.client.getAggregateMetrics()     // Performance stats
db.client.operationsPool.getTaskMetrics(taskId)  // Per-task details

// Lifecycle
db.client.pausePool()               // Pause execution
db.client.resumePool()              // Resume execution
db.client.drainPool()               // Wait for all to complete
db.client.stopPool()                // Cancel pending, complete active

// Events
client.on('pool:taskStarted', handler)
client.on('pool:taskCompleted', handler)
client.on('pool:taskError', handler)
client.on('pool:taskRetry', handler)
client.on('pool:taskMetrics', handler)
```

## Architecture Summary

| Layer | Technology | Responsibility |
|-------|------------|---|
| User | App code | Calls Database/Resource methods |
| Database | Resource.class.js | ORM layer, schema validation |
| Client | S3Client | S3 operations, HTTP abstraction |
| Execution | OperationsPool | Concurrency, queuing, retry logic |
| Queue | PriorityTaskQueue | Heap-based priority + aging |
| Resilience | Retry logic | Exponential backoff, abort support |
| Monitoring | Metrics classes | Performance tracking, event emission |
| Auto-tuning | AdaptiveTuning | Dynamic concurrency adjustment |

## Cross-Database Coordination

Current: None (each database has independent pool)

```
Database 1 ─┬─> S3Client ─> OperationsPool (concurrency=10)
            └─> ...

Database 2 ─┬─> S3Client ─> OperationsPool (concurrency=10)
            └─> ...

Total concurrent S3 ops: Could be up to 20 (2 × 10)
Global limit: None (potential improvement area)
```

For global coordination, would need:
- Shared pool manager
- Operation priority across databases
- Fair scheduling

