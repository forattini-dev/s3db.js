# Coordinator Plugin

> **Distributed coordinator election and heartbeat system for multi-instance deployments.**

---

## TLDR

**Automatic leader election for centralized operations in multi-instance deployments.**

**1 line to get started:**
```javascript
const plugin = new S3QueuePlugin({ resource: 'tasks', enableCoordinator: true });
```

**Key features:**
- Automatic election using lexicographic ordering
- Epoch-based leadership with guaranteed mandate
- Cold start protection prevents premature elections
- Graceful failover on coordinator failure
- Zero configuration with sensible defaults

**Used by:**
- S3Queue Plugin - Ticket publishing and order dispatch
- TTL Plugin - Centralized cleanup intervals
- Scheduler Plugin - Centralized job scheduling

---

## Quick Start

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

// Check coordinator status
if (queuePlugin.isCoordinator) {
  console.log('This instance is the coordinator');
}

// Monitor elections
queuePlugin.on('coord:coordinator-elected', ({ workerId }) => {
  console.log(`New coordinator: ${workerId}`);
});
```

---

## Dependencies

**Zero external dependencies** - built directly into s3db.js core.

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](/plugins/coordinator/guides/configuration.md) | All options, election algorithm, epoch system, events, API reference |
| [Usage Patterns](/plugins/coordinator/guides/usage-patterns.md) | Multi-instance deployment, monitoring, testing, real-world examples |
| [Best Practices](/plugins/coordinator/guides/best-practices.md) | Configuration best practices, troubleshooting, FAQ |

---

## Quick Reference

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│               With Coordinator (Solved!)                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Instance A ──→ COORDINATOR ──→ Cleanup Job                 │
│  Instance B ──→ Worker (idle for this task)                │
│  Instance C ──→ Worker (idle for this task)                │
│                                                              │
│  Result: Only one instance does the work, no conflicts      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableCoordinator` | boolean | `true` | Enable coordinator mode |
| `heartbeatInterval` | number | `30000` | Heartbeat frequency (ms) |
| `workerTimeout` | number | `90000` | Worker considered dead after this (ms) |
| `minEpochDuration` | number | `60000` | Minimum coordinator term (ms) |
| `maxEpochDuration` | number | `300000` | Maximum coordinator term (5 min) |
| `coldStartObservationWindow` | number | `15000` | Observation phase duration (ms) |
| `skipColdStart` | boolean | `false` | Skip cold start (testing only!) |

### Key Events

```javascript
// Coordinator elected (any worker)
plugin.on('coord:coordinator-elected', ({ workerId, epoch, activeWorkers }) => {});

// This worker became coordinator
plugin.on('coord:coordinator-promoted', ({ workerId, timestamp }) => {});

// This worker lost coordination
plugin.on('coord:coordinator-demoted', ({ workerId, reason }) => {});

// Cold start phase changed
plugin.on('coord:cold-start-phase-changed', ({ phase, duration }) => {});
```

### Election Algorithm

1. All workers publish heartbeats to shared storage
2. Each worker retrieves active workers (within `workerTimeout`)
3. Sort worker IDs alphabetically
4. First worker ID is the coordinator

```javascript
const workers = ['worker-1734567890-abc', 'worker-1734567891-def'];
const coordinator = workers.sort()[0]; // 'worker-1734567890-abc'
```

### Extending CoordinatorPlugin

```javascript
import { CoordinatorPlugin } from '../concerns/coordinator-plugin.class.js';

class MyPlugin extends CoordinatorPlugin {
  async onBecomeCoordinator() {
    console.log('Became coordinator');
    await this._startPeriodicTasks();
  }

  async onStopBeingCoordinator() {
    console.log('No longer coordinator');
    await this._stopPeriodicTasks();
  }

  async coordinatorWork() {
    await this._doCoordinatorTask();
  }
}
```

---

## Configuration Examples

### Production Setup

```javascript
const plugin = new S3QueuePlugin({
  resource: 'tasks',
  enableCoordinator: true,
  heartbeatInterval: 30000,    // 30s heartbeat
  workerTimeout: 90000,        // 90s timeout (3x heartbeat)
  maxEpochDuration: 300000,    // 5 min max term
  coldStartObservationWindow: 15000
});
```

### Testing Setup

```javascript
const plugin = new S3QueuePlugin({
  resource: 'tasks',
  enableCoordinator: true,
  skipColdStart: true,         // Faster tests
  coldStartObservationWindow: 0
});

// Force election
await plugin.ensureCoordinator({ force: true });
```

### Single Instance (Disabled)

```javascript
const plugin = new S3QueuePlugin({
  resource: 'tasks',
  enableCoordinator: false     // No coordination needed
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

---

## See Also

- [S3Queue Plugin](/plugins/s3-queue/README.md) - Uses coordinator for ticket publishing
- [TTL Plugin](/plugins/ttl/README.md) - Uses coordinator for cleanup intervals
- [Scheduler Plugin](/plugins/scheduler/README.md) - Uses coordinator for job scheduling
- [Plugin Development](/plugins/plugin-development.md) - Create your own plugins

