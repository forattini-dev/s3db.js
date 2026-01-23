# 🔒 S3Queue Plugin

> **Distributed worker queues backed by S3 with zero-duplication guarantees.**
>
> **Navigation:** [← Plugin Index](/plugins/README.md) | [Guides ↓](#-documentation-index) | [FAQ ↓](/plugins/s3-queue/guides/patterns-best-practices.md#-faq)

---

## 📋 Documentation Index

Complete documentation organized by topic. Start here to find what you need.

### Quick Start
- [⚡ TLDR](#-tldr) - 30-second overview
- [🚀 Quick Start](#-quick-start) - Get running in minutes
- [📦 Dependencies](#-dependencies) - What you need

### By Guide

| Guide | Focus |
|-------|-------|
| **[onMessage Handler](./guides/onmessage-handler.md)** | Writing message processing logic |
| **[Configuration](./guides/configuration.md)** | Plugin options & real-world setups |
| **[Architecture](./guides/architecture.md)** | Internal design & event system |
| **[Performance & Scalability](./guides/performance-scalability.md)** | Optimization & multi-pod deployment |
| **[Patterns & Best Practices](./guides/patterns-best-practices.md)** | FAQ, troubleshooting, patterns |

### Getting Help

1. **Quick questions?** Check [FAQ](./guides/patterns-best-practices.md#-faq)
2. **Message processing?** See [onMessage Handler Guide](./guides/onmessage-handler.md)
3. **Configuration help?** See [Configuration Guide](./guides/configuration.md)
4. **Production scaling?** See [Performance & Scalability Guide](./guides/performance-scalability.md)
5. **Troubleshooting?** See [Patterns Guide](./guides/patterns-best-practices.md#-troubleshooting)

---

## ⚡ TLDR

**Distributed queue system** using S3 as backend, with zero duplication guarantee.

**3 lines to get started:**
```javascript
const queue = new S3QueuePlugin({ resource: 'tasks', onMessage: async (task) => { console.log('Processing:', task); } });
await db.usePlugin(queue);
await tasks.enqueue({ type: 'send-email', data: {...} });
```

> 🧩 **Namespaces**: Provide `namespace: 'emails'` (or pass an alias via `db.usePlugin`) to run multiple S3QueuePlugin instances. Queue/dead-letter resources will be emitted as `plg_emails_…`.

**Key features:**
- ✅ Zero duplication (distributed locks + ETag + cache)
- ✅ Visibility timeout (like AWS SQS)
- ✅ Automatic retry with exponential backoff
- ✅ Dead letter queue
- ✅ Configurable worker pool

**When to use:**
- 📧 Email/SMS queues
- 🎬 Media processing
- 📊 Report generation
- 🔄 Background jobs
- 🔔 Webhook delivery

---

## 📦 Dependencies

**Required:**
```bash
pnpm install s3db.js
```

**NO Peer Dependencies!**

S3QueuePlugin is **built into s3db.js core** with zero external dependencies!

**Why Zero Dependencies?**

- ✅ Pure JavaScript implementation (no external libraries)
- ✅ Works instantly after installing s3db.js
- ✅ No version conflicts or compatibility issues
- ✅ Lightweight and fast (~20KB plugin code)
- ✅ Perfect for serverless (AWS Lambda, Cloudflare Workers, Vercel)

**What's Included:**

- **Queue Management**: Enqueue, dequeue, visibility timeout, message lifecycle
- **Worker Pool**: Configurable concurrent worker threads with graceful shutdown
- **Distributed Locks**: ETag-based pessimistic locking for zero-duplication guarantee
- **Dead Letter Queue**: Automatic failed message handling with retry logic
- **Exponential Backoff**: Intelligent retry delays (2s → 4s → 8s → 16s → 32s)
- **Event System**: Leverages s3db.js resource events for monitoring
- **Cache Integration**: Uses CachePlugin for deduplication tracking (optional)

**Architecture:**

S3QueuePlugin uses s3db.js core primitives:
- **Resources**: Queue and dead-letter resources auto-created
- **Metadata**: Message status, retry count, visibility timeout stored in S3 metadata
- **Partitions**: Status-based partitions for O(1) pending message lookup
- **TTL**: Optional TTLPlugin integration for auto-cleanup of processed messages
- **Locks**: PluginStorage with ETag validation for distributed locking

**Minimum Node.js Version:** 18.x (for async/await, worker threads, native performance)

**Platform Support:**
- ✅ Node.js 18+ (server-side, recommended)
- ✅ AWS Lambda (serverless functions)
- ✅ Cloudflare Workers (edge computing)
- ✅ Vercel Edge Functions
- ⚠️ Browser (limited - no worker pool, single-threaded polling only)

**Production Recommendations:**

1. **Use TTLPlugin** for automatic cleanup of processed messages (prevent S3 bloat)
2. **Configure worker pool size** based on your workload (default: 3 workers)
3. **Set visibility timeout** appropriate for your task duration (default: 30s)
4. **Enable cache** for deduplication tracking (CachePlugin recommended)
5. **Monitor events** for queue health (`plg:queue:stats`, `plg:queue:error`)

```javascript
// Production-ready configuration
import { Database } from 's3db.js';
import { S3QueuePlugin, CachePlugin, TTLPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://key:secret@bucket' });

// Add cache for deduplication
await db.usePlugin(new CachePlugin({ driver: 'memory', ttl: 3600000 }));

// Add TTL for auto-cleanup (processed messages deleted after 7 days)
await db.usePlugin(new TTLPlugin({ defaultTTL: 604800000 }));

// Create queue
const queue = new S3QueuePlugin({
  resource: 'tasks',
  workers: 5,              // 5 concurrent workers
  visibilityTimeout: 300,  // 5 minutes per task
  maxRetries: 3,           // Retry 3 times before DLQ
  onMessage: async (task) => {
    // Process task
    console.log('Processing:', task);
  }
});

await db.usePlugin(queue);
await db.connect();
```

---

## 🔀 Coordinator Mode

### Why Coordinator Mode?

In multi-pod/multi-instance deployments, we need **exactly one instance** to publish dispatch tickets to avoid:
- ❌ Duplicate ticket publishing
- ❌ Race conditions in FIFO/LIFO ordering
- ❌ Wasted resources from redundant coordination work

**Coordinator Mode solves this** by automatically electing one instance as the "coordinator" responsible for publishing tickets. All other instances remain workers that process messages.

### Key Benefits

- ✅ **Automatic Election**: No manual configuration, works out-of-the-box
- ✅ **Fault Tolerance**: If coordinator dies, new one is elected automatically
- ✅ **Zero Duplication**: Only coordinator publishes tickets
- ✅ **Scalable**: Add/remove instances without breaking coordination
- ✅ **Battle-Tested**: Uses epoch-based leadership with cold start protection

### Quick Example

```javascript
// Multi-instance deployment - NO changes needed!
// Instance 1
const queueA = new S3QueuePlugin({
  resource: 'tasks',
  enableCoordinator: true,  // Enabled by default
  onMessage: async (task) => { /* process */ }
});

// Instance 2 (same config)
const queueB = new S3QueuePlugin({
  resource: 'tasks',
  enableCoordinator: true,
  onMessage: async (task) => { /* process */ }
});

// Result: Only ONE instance publishes tickets, both process messages
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableCoordinator` | boolean | `true` | Enable coordinator mode |
| `heartbeatInterval` | number | `30000` | Heartbeat frequency (ms) |
| `dispatchInterval` | number | `5000` | How often coordinator publishes tickets (ms) |
| `ticketBatchSize` | number | `10` | Messages per ticket batch |
| `coldStartObservationWindow` | number | `15000` | Observation phase duration (ms) |
| `skipColdStart` | boolean | `false` | Skip cold start (testing only!) |

### Coordinator Events

```javascript
queue.on('plg:s3-queue:coordinator-elected', ({ workerId, epoch }) => {
  console.log(`New coordinator: ${workerId}`);
});

queue.on('plg:s3-queue:coordinator-promoted', ({ workerId }) => {
  console.log(`This worker is now coordinator`);
});

queue.on('plg:s3-queue:tickets-published', ({ count, coordinatorId }) => {
  console.log(`Coordinator published ${count} tickets`);
});
```

### Learn More

📚 **[Full Coordinator Documentation →](./coordinator.md)**

Comprehensive guide covering:
- Election algorithm (lexicographic ordering)
- Epoch system (guaranteed leadership terms)
- Cold start phases (prevents race conditions)
- Troubleshooting multi-instance issues
- Implementation details for plugin developers

---

## ✨ Key Features

### 🎯 Zero Duplication Guarantee

Unlike traditional queues that guarantee "at-least-once" delivery, S3Queue achieves **exactly-once processing** through a combination of:

```
┌──────────────────────────────────────────────────┐
│          Zero Duplication Architecture           │
├──────────────────────────────────────────────────┤
│                                                   │
│  Layer 1: PluginStorage Locks                   │
│            ↓ Prevents concurrent cache checks    │
│                                                   │
│  Layer 2: Deduplication Cache (Distributed)      │
│            ↓ PluginStorage + local TTL cache     │
│                                                   │
│  Layer 3: ETag Atomicity (S3 Native)             │
│            ↓ Atomic claim via conditional update │
│                                                   │
│         Result: 0% Duplication Rate 🎉           │
│                                                   │
└──────────────────────────────────────────────────┘
```

See [Architecture Guide](./guides/architecture.md) for complete details.

### 🔐 Distributed Locking

Each message gets a distributed lock during claim. See [Architecture Guide](./guides/architecture.md#-distributed-locking) for the complete flow.

### 🛠 Automatic Recovery (Visibility TTL)

Long-running handlers sometimes crash before completing. S3Queue continuously scans for stuck messages and automatically requeues them. See [Configuration Guide](./guides/configuration.md) for tuning options.

### 🚦 Adaptive Polling

Workers gradually back off when the queue is empty, reducing S3 requests. See [Performance Guide](./guides/performance-scalability.md#-performance--tuning) for optimization details.

### ⏱️ Visibility Timeout Pattern

Just like AWS SQS - messages become invisible while being processed. See [onMessage Handler Guide](./guides/onmessage-handler.md) for usage patterns.

### 🔁 Automatic Retries with Exponential Backoff

```javascript
Attempt 1: Fail ──► Wait 1 second  ──► Retry
Attempt 2: Fail ──► Wait 2 seconds ──► Retry
Attempt 3: Fail ──► Wait 4 seconds ──► Retry
Attempt 4: Fail ──► Move to Dead Letter Queue ☠️
```

See [Configuration Guide](./guides/configuration.md#real-world-use-cases) for retry configuration.

---

## 🚀 Quick Start

### Installation

```bash
npm install s3db
# or
pnpm add s3db
```

### 30-Second Setup

```javascript
import { Database, S3QueuePlugin } from 's3db';

// 1. Connect to S3
const db = new Database({
  connection: 's3://KEY:SECRET@localhost:9000/my-bucket'
});
await db.connect();

// 2. Create resource
const tasks = await db.createResource({
  name: 'tasks',
  attributes: {
    id: 'string|required',
    type: 'string|required',
    data: 'json'
  }
});

// 3. Setup queue
const queue = new S3QueuePlugin({
  resource: 'tasks',
  onMessage: async (task) => {
    console.log('Processing:', task.type);
    // Your logic here
    return { done: true };
  }
});

await db.usePlugin(queue);

// 4. Enqueue tasks
await tasks.enqueue({
  type: 'send-email',
  data: { to: 'user@example.com' }
});

// That's it! Workers are already processing 🎉
```

### Next Steps

- **Write your first handler**: [onMessage Handler Guide](./guides/onmessage-handler.md)
- **Configure for production**: [Configuration Guide](./guides/configuration.md)
- **Learn the architecture**: [Architecture Guide](./guides/architecture.md)
- **Scale to multiple pods**: [Performance & Scalability Guide](./guides/performance-scalability.md)
- **Troubleshoot issues**: [Patterns & Best Practices Guide](./guides/patterns-best-practices.md)

---

## See Also

- [Coordinator Mode Documentation](./coordinator.md) - Multi-pod coordination
- [Configuration Guide](./guides/configuration.md) - All plugin options
- [Architecture Guide](./guides/architecture.md) - How it works internally
- [FAQ](./guides/patterns-best-practices.md#-faq) - Common questions & answers
