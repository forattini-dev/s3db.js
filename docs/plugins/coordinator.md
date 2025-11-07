# 🔀 Coordinator Plugin Architecture

> **Distributed coordinator election and heartbeat system for multi-instance deployments.**
>
> **Navigation:** [← Plugin Index](./README.md)

---

## Overview

The **Coordinator Plugin Architecture** is a base class (`CoordinatorPlugin`) that provides distributed coordinator election, heartbeat management, and leadership coordination for plugins that need to run centralized operations across multiple instances.

### Used By

- [S3Queue Plugin](./s3-queue.md) - Ticket publishing and order dispatch
- [TTL Plugin](./ttl.md) - Centralized cleanup intervals
- [Scheduler Plugin](./scheduler.md) - Centralized job scheduling

---

## 🎯 What is Coordinator Mode?

In multi-instance deployments, certain operations should only run on **one instance at a time** to avoid conflicts, duplicates, or race conditions. Coordinator mode automatically elects one instance as the "coordinator" responsible for these centralized tasks.

### Traditional Problem

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

## ✨ Key Features

### 🎯 Core Features

- **Automatic Election**: Deterministic coordinator selection using lexicographic ordering
- **Heartbeat System**: Active workers publish heartbeats to storage every N seconds
- **Epoch-Based Leadership**: Coordinator has guaranteed mandate period (min 60s, default 300s)
- **Cold Start Protection**: 3-phase observation period prevents premature elections
- **Graceful Failover**: Automatic re-election when coordinator fails or stops
- **Zero Configuration**: Works out-of-the-box with sensible defaults

### 🔧 Technical Features

- **PluginStorage**: Uses S3-backed storage with automatic cleanup
- **Observer Pattern**: Workers observe each other during cold start
- **Epoch Validation**: Prevents coordinator overthrow during valid mandate
- **Event-Driven**: Emits events for monitoring coordinator changes
- **Multi-Instance Safe**: Designed specifically for cluster deployments

---

## 🏗️ Architecture

### Election Algorithm

1. **Lexicographic Election**: Coordinator is the worker with alphabetically **first** worker ID
2. **All workers agree**: No voting, no consensus protocol needed
3. **Deterministic**: Given the same set of workers, election result is always the same

```javascript
// Example: 3 workers join
const workers = [
  { workerId: 'worker-1734567890-abc123', lastHeartbeat: Date.now() },
  { workerId: 'worker-1734567891-def456', lastHeartbeat: Date.now() },
  { workerId: 'worker-1734567892-ghi789', lastHeartbeat: Date.now() }
];

// Sort alphabetically
const sortedIds = workers.map(w => w.workerId).sort();
// Result: ['worker-1734567890-abc123', 'worker-1734567891-def456', 'worker-1734567892-ghi789']

// First worker is coordinator
const coordinatorId = sortedIds[0]; // 'worker-1734567890-abc123'
```

### Epoch System

The **epoch** is a timestamp marking when a coordinator assumed leadership. It provides:

- **Guaranteed mandate**: Coordinator cannot be overthrown until epoch expires
- **Minimum term**: Default 60 seconds (prevents flip-flopping)
- **Maximum term**: Default 300 seconds (5 minutes, prevents stale coordinator)
- **Automatic renewal**: Coordinator can renew epoch before expiration

```javascript
// Epoch lifecycle
1. Worker A becomes coordinator → Epoch set to Date.now() + 300000 (5 min)
2. Other workers check epoch before challenging
3. If epoch valid → No election, Worker A remains coordinator
4. If epoch expired → Election triggered, new coordinator elected
5. Worker A can renew epoch (extend by 300s) before expiration
```

### Cold Start Phases

**Problem**: When all instances start simultaneously, how do we prevent premature elections?

**Solution**: 3-phase observation period

```
Phase 1: Observing (15 seconds)
  ├─→ Publish own heartbeat
  ├─→ Observe other workers joining
  └─→ Do NOT elect yet

Phase 2: Election (immediate after observing)
  ├─→ Get all active workers
  ├─→ Elect coordinator (lexicographic)
  └─→ Store epoch if elected

Phase 3: Preparation (5 seconds)
  ├─→ Allow time for other workers to see election result
  └─→ Prevents race conditions

Phase 4: Ready (coordinator work begins)
  └─→ Coordinator starts publishing tickets, running cleanup, etc.
```

**Why 3 phases?**

Without cold start, early workers would immediately elect themselves as coordinator, then get overthrown when later workers join. The observation window ensures **all workers start together** before electing.

**Configuration**:
```javascript
new S3QueuePlugin({
  enableCoordinator: true,
  coldStartObservationWindow: 15000,  // 15s observation (default)
  coldStartPreparationDelay: 5000,    // 5s preparation (default)
  skipColdStart: false                // Set true for testing only
})
```

---

## ⚙️ Configuration

### Coordinator Options

All plugins extending `CoordinatorPlugin` support these options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableCoordinator` | boolean | `true` | Enable coordinator mode |
| `heartbeatInterval` | number | `30000` | Heartbeat frequency (ms) |
| `workerTimeout` | number | `90000` | Worker considered dead after this |
| `minEpochDuration` | number | `60000` | Minimum coordinator term (ms) |
| `maxEpochDuration` | number | `300000` | Maximum coordinator term (ms) |
| `coldStartObservationWindow` | number | `15000` | Observation phase duration (ms) |
| `coldStartPreparationDelay` | number | `5000` | Preparation phase duration (ms) |
| `skipColdStart` | boolean | `false` | Skip cold start (testing only!) |

### Worker ID

Each instance generates a unique `workerId`:
```javascript
workerId = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
// Example: 'worker-1734567890-abc123'
```

**Properties**:
- Timestamp prefix ensures chronological ordering
- Random suffix prevents collisions
- Lexicographically sortable for deterministic election

---

## 📡 Events

### Coordinator Events

```javascript
plugin.on('coord:worker-heartbeat', ({ workerId, timestamp }) => {
  console.log(`Worker ${workerId} sent heartbeat`);
});

plugin.on('coord:coordinator-elected', ({ workerId, epoch, activeWorkers }) => {
  console.log(`New coordinator: ${workerId}, epoch valid until ${new Date(epoch)}`);
});

plugin.on('coord:coordinator-promoted', ({ workerId, timestamp }) => {
  console.log(`This worker is now coordinator: ${workerId}`);
});

plugin.on('coord:coordinator-demoted', ({ workerId, reason }) => {
  console.log(`This worker is no longer coordinator: ${workerId}, reason: ${reason}`);
});

plugin.on('coord:coordinator-epoch-renewed', ({ workerId, newEpoch }) => {
  console.log(`Coordinator ${workerId} renewed epoch until ${new Date(newEpoch)}`);
});

plugin.on('coord:cold-start-phase-changed', ({ phase, duration }) => {
  console.log(`Cold start phase: ${phase}, waited ${duration}ms`);
});
```

### Plugin-Specific Events

Each plugin re-emits coordinator events with plugin-specific names for backward compatibility:

**S3QueuePlugin**:
```javascript
plugin.on('plg:s3-queue:coordinator-elected', (data) => {});
plugin.on('plg:s3-queue:coordinator-promoted', (data) => {});
```

**TTLPlugin**:
```javascript
plugin.on('plg:ttl:coordinator-elected', (data) => {});
plugin.on('plg:ttl:coordinator-promoted', (data) => {});
```

**SchedulerPlugin**:
```javascript
plugin.on('plg:scheduler:coordinator-elected', (data) => {});
plugin.on('plg:scheduler:coordinator-promoted', (data) => {});
```

---

## 💡 Best Practices

### 1. Configure Appropriate Timeouts

```javascript
// ✅ Good: Reasonable defaults
{
  heartbeatInterval: 30000,  // 30s heartbeat
  workerTimeout: 90000,      // 90s timeout (3x heartbeat)
  maxEpochDuration: 300000   // 5 min max term
}

// ❌ Bad: Too short (causes flip-flopping)
{
  heartbeatInterval: 1000,   // 1s heartbeat (too frequent)
  workerTimeout: 2000,       // 2s timeout (too short)
  minEpochDuration: 5000     // 5s term (too short)
}
```

### 2. Monitor Coordinator Elections

```javascript
// Track coordinator changes
let coordinatorChanges = 0;

plugin.on('coord:coordinator-elected', ({ workerId }) => {
  coordinatorChanges++;

  if (coordinatorChanges > 5) {
    console.warn('Too many coordinator changes! Check worker health.');
  }
});
```

### 3. Graceful Shutdown

```javascript
// Ensure clean shutdown
process.on('SIGTERM', async () => {
  await plugin.stop();  // Stops heartbeats, releases coordination
  process.exit(0);
});
```

### 4. Cold Start in Production

```javascript
// ✅ Good: Keep cold start enabled
{
  skipColdStart: false,  // Default - prevents race conditions
  coldStartObservationWindow: 15000  // 15s observation
}

// ❌ Bad: Skip cold start in production
{
  skipColdStart: true  // Only for testing! Causes race conditions
}
```

### 5. Test Coordinator Behavior

```javascript
// For testing, you can skip cold start
const plugin = new S3QueuePlugin({
  resource: 'tasks',
  enableCoordinator: true,
  skipColdStart: true,  // Faster tests
  coldStartObservationWindow: 0
});

// Manually trigger election
await plugin.ensureCoordinator({ force: true });
```

---

## 🐛 Troubleshooting

### Issue: No coordinator elected

**Symptoms**: Workers running but no coordinator

**Solutions**:
1. Check `enableCoordinator: true`
2. Verify workers are sending heartbeats (check PluginStorage)
3. Ensure cold start completed (`coord:cold-start-phase-changed` event)
4. Check for errors in coordinator election logic

### Issue: Frequent coordinator changes

**Symptoms**: Coordinator changes every few minutes

**Solutions**:
1. Increase `workerTimeout` (workers timing out too fast)
2. Increase `minEpochDuration` (prevent premature overthrow)
3. Check network stability (heartbeats failing)
4. Monitor worker health (workers crashing?)

### Issue: Cold start taking too long

**Symptoms**: Workers idle for >20 seconds after startup

**Solutions**:
1. Reduce `coldStartObservationWindow` (default 15s)
2. Reduce `coldStartPreparationDelay` (default 5s)
3. For single-instance deployments, skip cold start entirely

### Issue: Coordinator not doing work

**Symptoms**: Coordinator elected but tasks not processing

**Solutions**:
1. Check `isCoordinator` property is `true`
2. Verify plugin's `coordinatorWork()` method is implemented
3. Check for errors in coordinator work logic
4. Monitor plugin-specific events (tickets-published, cleanup-started, etc.)

---

## ❓ FAQ

**Q: How does coordinator election work?**

A: Lexicographic ordering of worker IDs. All workers get active workers, sort IDs alphabetically, and the first ID is coordinator. Fully deterministic, no voting needed.

**Q: What happens if coordinator crashes?**

A: Other workers detect missing heartbeats (after `workerTimeout`). Next scheduled heartbeat interval, they re-elect a new coordinator automatically.

**Q: Can I force a specific worker to be coordinator?**

A: Yes, for testing:
```javascript
await plugin.ensureCoordinator({
  force: true,
  desiredCoordinator: 'worker-1234567890-abc123'
});
```

**Q: How often are heartbeats sent?**

A: Every `heartbeatInterval` milliseconds (default 30s). Heartbeats are lightweight S3 PUT operations (metadata only).

**Q: What's stored in PluginStorage for coordination?**

A: Heartbeat records:
```javascript
{
  workerId: 'worker-1234567890-abc123',
  lastHeartbeat: 1734567890123,
  epoch: 1734568190123,  // Only for coordinator
  isCoordinator: true    // Only for coordinator
}
```

**Q: Is coordinator mode required?**

A: No, you can disable it:
```javascript
{
  enableCoordinator: false  // Single-instance mode
}
```

But it's **highly recommended** for multi-instance deployments to prevent duplicate work.

**Q: What's the storage cost of coordination?**

A: Minimal:
- 1 heartbeat per worker per `heartbeatInterval` (default 30s)
- Each heartbeat is a tiny S3 PUT (~100 bytes)
- For 10 workers: 10 PUTs per 30s = 20 PUTs/min = 1,200 PUTs/hour = ~$0.005/month

**Q: Can workers communicate with each other?**

A: No direct communication. Workers only communicate via:
1. Heartbeats (stored in PluginStorage)
2. Shared state (queue, locks, etc.)

This design ensures scalability and fault tolerance.

---

## 📚 Implementation Guide

### Extending CoordinatorPlugin

Plugins extend `CoordinatorPlugin` and implement 3 abstract methods:

```javascript
import { CoordinatorPlugin } from '../concerns/coordinator-plugin.class.js';

export class MyPlugin extends CoordinatorPlugin {
  constructor(config = {}) {
    super(config);
    this.myPluginState = {};
  }

  // Called when this worker becomes coordinator
  async onBecomeCoordinator() {
    console.log(`[MyPlugin] Became coordinator`);

    // Start coordinator-only work
    await this._startPeriodicTasks();

    // Emit plugin-specific event
    this.emit('plg:myplugin:coordinator-promoted', {
      workerId: this.workerId,
      timestamp: Date.now()
    });
  }

  // Called when this worker stops being coordinator
  async onStopBeingCoordinator() {
    console.log(`[MyPlugin] No longer coordinator`);

    // Stop coordinator-only work
    await this._stopPeriodicTasks();
  }

  // Periodic work done by coordinator
  async coordinatorWork() {
    // This is called regularly by the base class
    // Implement your coordinator-specific logic here

    // Example: Publish tickets, run cleanup, schedule jobs, etc.
    await this._doCoordinatorTask();
  }
}
```

### Coordinator Lifecycle

```
1. Plugin initialized → startCoordination() called
2. Cold start begins (if enabled)
3. Workers publish heartbeats
4. After observation window → Election
5. Coordinator elected → onBecomeCoordinator() called
6. coordinatorWork() called periodically
7. Heartbeats continue, epoch renewed
8. If coordinator fails → Re-election
9. New coordinator → onBecomeCoordinator() called
10. Plugin stop() → onStopBeingCoordinator() called
```

---

## See Also

- [S3Queue Plugin](./s3-queue.md) - Uses coordinator for ticket publishing
- [TTL Plugin](./ttl.md) - Uses coordinator for cleanup intervals
- [Scheduler Plugin](./scheduler.md) - Uses coordinator for job scheduling
- [Plugin Development Guide](./plugin-development.md) - Create your own plugins

---

**Need help?** Check the [main documentation](../../README.md) or [open an issue](https://github.com/forattini-dev/s3db.js/issues).
