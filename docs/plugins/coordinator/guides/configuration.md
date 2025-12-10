# Configuration

> **In this guide:** All configuration options, election algorithm, epoch system, and API reference.

**Navigation:** [← Back to Coordinator Plugin](/plugins/coordinator/README.md)

---

## Plugin Options

```javascript
new CoordinatorPlugin({
  enableCoordinator: true,              // Enable coordinator mode
  heartbeatInterval: 30000,             // Heartbeat frequency (ms)
  workerTimeout: 90000,                 // Worker dead threshold (ms)
  minEpochDuration: 60000,              // Minimum coordinator term (ms)
  maxEpochDuration: 300000,             // Maximum coordinator term (ms)
  coldStartObservationWindow: 15000,    // Observation phase duration (ms)
  coldStartPreparationDelay: 5000,      // Preparation phase duration (ms)
  skipColdStart: false                  // Skip cold start (testing only)
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableCoordinator` | boolean | `true` | Enable coordinator mode |
| `heartbeatInterval` | number | `30000` | Heartbeat frequency (ms) |
| `workerTimeout` | number | `90000` | Worker considered dead after this (ms) |
| `minEpochDuration` | number | `60000` | Minimum coordinator term (ms) |
| `maxEpochDuration` | number | `300000` | Maximum coordinator term (5 min) |
| `coldStartObservationWindow` | number | `15000` | Observation phase duration (ms) |
| `coldStartPreparationDelay` | number | `5000` | Preparation phase duration (ms) |
| `skipColdStart` | boolean | `false` | Skip cold start (testing only!) |

---

## Election Algorithm

The coordinator is elected using **lexicographic ordering** of worker IDs:

1. All workers publish heartbeats to shared storage
2. Each worker retrieves active workers (within `workerTimeout`)
3. Sort worker IDs alphabetically
4. First worker ID is the coordinator

```javascript
// Example: 3 workers
const workers = [
  { workerId: 'worker-1734567890-abc123', lastHeartbeat: Date.now() },
  { workerId: 'worker-1734567891-def456', lastHeartbeat: Date.now() },
  { workerId: 'worker-1734567892-ghi789', lastHeartbeat: Date.now() }
];

// Sort alphabetically
const sortedIds = workers.map(w => w.workerId).sort();
// ['worker-1734567890-abc123', 'worker-1734567891-def456', 'worker-1734567892-ghi789']

// First worker is coordinator
const coordinatorId = sortedIds[0]; // 'worker-1734567890-abc123'
```

**Advantages:**
- Fully deterministic - no voting needed
- All workers agree on coordinator
- No consensus protocol overhead

---

## Worker ID

Each instance generates a unique `workerId`:

```javascript
workerId = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
// Example: 'worker-1734567890-abc123'
```

**Properties:**
- Timestamp prefix ensures chronological ordering
- Random suffix prevents collisions
- Lexicographically sortable for deterministic election

---

## Epoch System

The **epoch** is a timestamp marking when a coordinator assumed leadership:

```javascript
// Epoch lifecycle
1. Worker A becomes coordinator → Epoch set to Date.now() + 300000 (5 min)
2. Other workers check epoch before challenging
3. If epoch valid → No election, Worker A remains coordinator
4. If epoch expired → Election triggered, new coordinator elected
5. Worker A can renew epoch (extend by 300s) before expiration
```

**Epoch provides:**
- **Guaranteed mandate**: Coordinator cannot be overthrown until epoch expires
- **Minimum term**: Default 60 seconds (prevents flip-flopping)
- **Maximum term**: Default 300 seconds (prevents stale coordinator)
- **Automatic renewal**: Coordinator can renew before expiration

---

## Cold Start Phases

When all instances start simultaneously, the 3-phase observation period prevents premature elections:

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
  └─→ Coordinator starts centralized tasks
```

**Configuration:**
```javascript
{
  coldStartObservationWindow: 15000,  // 15s observation (default)
  coldStartPreparationDelay: 5000,    // 5s preparation (default)
  skipColdStart: false                // Set true for testing only
}
```

---

## Events

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
  console.log(`This worker is no longer coordinator: ${workerId}`);
});

plugin.on('coord:coordinator-epoch-renewed', ({ workerId, newEpoch }) => {
  console.log(`Coordinator ${workerId} renewed epoch until ${new Date(newEpoch)}`);
});

plugin.on('coord:cold-start-phase-changed', ({ phase, duration }) => {
  console.log(`Cold start phase: ${phase}, waited ${duration}ms`);
});
```

### Plugin-Specific Events

Each plugin re-emits coordinator events with plugin-specific names:

**S3QueuePlugin:**
```javascript
plugin.on('plg:s3-queue:coordinator-elected', (data) => {});
plugin.on('plg:s3-queue:coordinator-promoted', (data) => {});
```

**TTLPlugin:**
```javascript
plugin.on('plg:ttl:coordinator-elected', (data) => {});
plugin.on('plg:ttl:coordinator-promoted', (data) => {});
```

**SchedulerPlugin:**
```javascript
plugin.on('plg:scheduler:coordinator-elected', (data) => {});
plugin.on('plg:scheduler:coordinator-promoted', (data) => {});
```

---

## Storage Format

Heartbeat records stored in PluginStorage:

```javascript
{
  workerId: 'worker-1234567890-abc123',
  lastHeartbeat: 1734567890123,
  epoch: 1734568190123,  // Only for coordinator
  isCoordinator: true    // Only for coordinator
}
```

---

## Extending CoordinatorPlugin

Plugins extend `CoordinatorPlugin` and implement 3 abstract methods:

```javascript
import { CoordinatorPlugin } from '../concerns/coordinator-plugin.class.js';

export class MyPlugin extends CoordinatorPlugin {
  constructor(config = {}) {
    super(config);
  }

  // Called when this worker becomes coordinator
  async onBecomeCoordinator() {
    console.log(`[MyPlugin] Became coordinator`);
    await this._startPeriodicTasks();
  }

  // Called when this worker stops being coordinator
  async onStopBeingCoordinator() {
    console.log(`[MyPlugin] No longer coordinator`);
    await this._stopPeriodicTasks();
  }

  // Periodic work done by coordinator
  async coordinatorWork() {
    await this._doCoordinatorTask();
  }
}
```

---

## Coordinator Lifecycle

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

- [Usage Patterns](/plugins/coordinator/guides/usage-patterns.md) - Multi-instance patterns, monitoring, testing
- [Best Practices](/plugins/coordinator/guides/best-practices.md) - Performance, troubleshooting, FAQ
