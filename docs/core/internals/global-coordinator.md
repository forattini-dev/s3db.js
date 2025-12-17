# Global Coordinator

> Shared leader election service for distributed plugin coordination.

[← JSON Recovery](/core/internals/json-recovery.md) | [Back to Core →](/core/README.md)

---

## Overview

`GlobalCoordinatorService` provides a single leader election loop that serves multiple coordinator-enabled plugins in the same namespace. This reduces S3 API calls by ~N× where N is the number of plugins.

## Key Features

- **Lazy instantiation** - One coordinator per namespace per Database
- **Atomic heartbeat** - Single heartbeat serves all plugins
- **Event-driven** - Plugins subscribe to leader changes
- **Deterministic election** - Lexicographically first worker ID wins
- **Graceful shutdown** - Clean deregistration on stop
- **Circuit breaker** - Protects against S3 outages
- **Contention detection** - Alerts when heartbeats are slow (inspired by etcd)
- **Epoch fencing** - Prevents split-brain scenarios (inspired by etcd Raft Terms)
- **Enhanced metrics** - Latency percentiles (p50/p95/p99) for observability

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Database Instance                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           GlobalCoordinatorService                    │   │
│  │                (namespace: 'default')                 │   │
│  │                                                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │   │
│  │  │  S3Queue    │  │    TTL      │  │  Scheduler  │   │   │
│  │  │  Plugin     │  │   Plugin    │  │   Plugin    │   │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘   │   │
│  │         │                │                │           │   │
│  │         └────────────────┼────────────────┘           │   │
│  │                          ▼                            │   │
│  │              ┌───────────────────────┐                │   │
│  │              │  Single Heartbeat     │                │   │
│  │              │  Loop (5s interval)   │                │   │
│  │              └───────────────────────┘                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │       S3         │
                    │ plugin=coordinator│
                    └──────────────────┘
```

## Quick Start

```javascript
import { Database, S3QueuePlugin, TTLPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

// Both plugins share ONE coordinator service
const queuePlugin = new S3QueuePlugin({
  resource: 'emails',
  enableCoordinator: true,
  heartbeatInterval: 5000
});

const ttlPlugin = new TTLPlugin({
  resource: 'cache_entries',
  enableCoordinator: true
});

await db.usePlugin(queuePlugin, 'queue');
await db.usePlugin(ttlPlugin, 'ttl');

// Access the shared coordinator
const coordinator = await db.getGlobalCoordinator('default');
console.log('Leader:', await coordinator.getLeader());
console.log('Workers:', await coordinator.getActiveWorkers());
```

## Configuration

### Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableCoordinator` | `boolean` | `false` | Enable coordination for plugin |
| `heartbeatInterval` | `number` | `5000` | Heartbeat frequency in ms |
| `heartbeatJitter` | `number` | `1000` | Random jitter per heartbeat in ms |
| `leaseTimeout` | `number` | `15000` | Leader lease duration in ms |
| `workerTimeout` | `number` | `20000` | Worker registration TTL in ms |
| `startupJitterMin` | `number` | `0` | Min startup delay in ms |
| `startupJitterMax` | `number` | `5000` | Max startup delay in ms |
| `metricsBufferSize` | `number` | `100` | Rolling window size for latency metrics |

### Contention Detection (etcd-inspired)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `contention.enabled` | `boolean` | `true` | Enable contention detection |
| `contention.threshold` | `number` | `2.0` | Emit event when heartbeat takes >Nx expected time |
| `contention.rateLimitMs` | `number` | `30000` | Min interval between contention events |

### Circuit Breaker

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `circuitBreaker.failureThreshold` | `number` | `5` | Failures before opening circuit |
| `circuitBreaker.resetTimeout` | `number` | `30000` | Time before trying half-open |
| `circuitBreaker.halfOpenMaxAttempts` | `number` | `1` | Attempts during half-open |

### Epoch Fencing (Plugin-level)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `epochFencingEnabled` | `boolean` | `true` | Enable epoch validation |
| `epochGracePeriodMs` | `number` | `5000` | Grace period for epoch-1 tasks |

## Storage Structure

```
plugin=coordinator/namespace={name}/
├── state.json                    # Leader lease: { leaderId, epoch, leaseExpiresAt }
├── workers/
│   ├── worker={id1}.json         # { workerId, lastHeartbeat, registeredAt }
│   ├── worker={id2}.json
│   └── worker={id3}.json
└── metadata.json                 # Service metadata
```

## Leader Election

Election uses deterministic ordering:

1. **All workers heartbeat** - Register in `workers/` directory
2. **List workers** - Get all active workers
3. **Filter expired** - Remove workers past `workerTimeout`
4. **Sort lexicographically** - Order by worker ID
5. **First wins** - Lexicographically first ID becomes leader

```javascript
// Example with 3 workers
const workers = ['pod-abc', 'pod-def', 'pod-123'];
workers.sort(); // ['pod-123', 'pod-abc', 'pod-def']
const leader = workers[0]; // 'pod-123'
```

This ensures:
- **Deterministic** - Same input always elects same leader
- **Stable** - Leader doesn't change unless they fail
- **Fast** - No consensus protocol needed

## Events

### leader:changed

Emitted when leadership changes.

```javascript
coordinator.on('leader:changed', ({ namespace, previousLeader, newLeader, epoch }) => {
  console.log(`Leader: ${previousLeader} → ${newLeader} (epoch: ${epoch})`);
});
```

### workers:updated

Emitted when worker list changes.

```javascript
coordinator.on('workers:updated', ({ namespace, workers }) => {
  console.log(`Active workers: ${workers.length}`);
});
```

### contention:detected

Emitted when heartbeat takes longer than expected (inspired by etcd).

```javascript
coordinator.on('contention:detected', (event) => {
  console.log(`Contention: heartbeat took ${event.ratio.toFixed(1)}x longer`);
  console.log(`Duration: ${event.duration}ms (expected: ${event.expected}ms)`);

  // Alert ops team
  alerting.warn({
    title: 'Coordinator Contention Detected',
    message: `Heartbeat latency ${event.ratio.toFixed(1)}x above threshold`,
    namespace: event.namespace
  });
});
```

### circuitBreaker:open

Emitted when circuit breaker opens due to repeated S3 failures.

```javascript
coordinator.on('circuitBreaker:open', ({ namespace, failureCount }) => {
  console.log(`Circuit breaker opened after ${failureCount} failures`);
});
```

## Resilience Features

### Contention Detection (etcd-inspired)

Monitors heartbeat cycle duration and alerts when coordination is degraded:

```javascript
const coordinator = await db.getGlobalCoordinator('default', {
  config: {
    heartbeatInterval: 5000,
    contention: {
      enabled: true,
      threshold: 2.0,        // Alert when heartbeat takes >2x expected
      rateLimitMs: 30000     // Max 1 alert per 30s
    }
  }
});

// React to degradation
coordinator.on('contention:detected', (event) => {
  metrics.gauge('coordinator.contention_ratio', event.ratio);

  if (event.ratio > 5) {
    // Severe contention - consider scaling or investigating S3
    pagerduty.alert('Severe coordinator contention detected');
  }
});
```

### Epoch Fencing (etcd Raft-inspired)

Prevents split-brain scenarios by rejecting tasks from stale leaders:

```javascript
// In your plugin
class MyQueuePlugin extends CoordinatorPlugin {
  async processTask(task) {
    // Validate task epoch before processing
    if (!this.isEpochValid(task.epoch, task.createdAt)) {
      this.logger.warn({ taskEpoch: task.epoch }, 'Rejecting stale task');
      return; // Skip task from old leader
    }

    // Safe to process
    await this.doWork(task);
  }
}
```

**How it works:**

```
Timeline:
─────────────────────────────────────────────────────────────────────►

Pod A (Leader, epoch=5)                Pod B (Follower)
       │                                     │
       │ dispatch task T1 (epoch=5)          │
       │ ─────────────────────────────────►  │
       │                                     │
       │      ☠️ Pod A crashes               │
       │                                     │
       │                              [Election: epoch=6]
       │                              Pod B becomes leader
       │                                     │
       │  T1 arrives late (epoch=5)          │
       │  ◄───────────────────────────────── │
       │                                     │
       │  validateEpoch(5) → REJECTED        │
       │  (current epoch is 6)               │
       ▼                                     ▼
   Split-brain prevented!
```

**Grace period**: Tasks from `epoch-1` are accepted if they arrive within `epochGracePeriodMs` of the epoch change.

### Circuit Breaker

Protects against cascading failures during S3 outages:

```javascript
const status = coordinator.getCircuitBreakerStatus();
// {
//   state: 'closed' | 'open' | 'half-open',
//   failureCount: 0,
//   failureThreshold: 5,
//   resetTimeout: 30000,
//   trips: 0
// }

if (status.state === 'open') {
  console.log('Circuit breaker open - heartbeats skipped');
}
```

## API Reference

### getLeader()

Get current leader ID.

```javascript
const leaderId = await coordinator.getLeader();
// 'pod-123' or null
```

### isLeader(workerId?)

Check if worker is leader.

```javascript
const amILeader = await coordinator.isLeader();
const isOtherLeader = await coordinator.isLeader('pod-456');
```

### getActiveWorkers()

Get list of active workers.

```javascript
const workers = await coordinator.getActiveWorkers();
// ['pod-123', 'pod-456', 'pod-789']
```

### getMetrics()

Get coordinator metrics.

```javascript
const metrics = coordinator.getMetrics();
// {
//   heartbeatCount: 1234,
//   electionCount: 3,
//   electionDurationMs: 45,
//   leaderChanges: 2,
//   workerRegistrations: 5,
//   workerTimeouts: 1,
//   startTime: 1699876543000,
//   lastHeartbeatTime: 1699876598000
// }
```

### subscribe(plugin)

Subscribe plugin to leader events.

```javascript
coordinator.subscribe(myPlugin);
// Plugin will receive onBecomeCoordinator/onStopBeingCoordinator calls
```

## Plugin Integration

Plugins extending `CoordinatorPlugin` automatically integrate:

```javascript
import { CoordinatorPlugin } from 's3db.js';

class MyPlugin extends CoordinatorPlugin {
  async onBecomeCoordinator() {
    // Called when this worker becomes leader
    this.logger.info('I am now the coordinator!');
    this.startBackgroundWork();
  }

  async onStopBeingCoordinator() {
    // Called when leadership is lost
    this.logger.info('No longer coordinator');
    this.stopBackgroundWork();
  }

  async coordinatorWork() {
    // Called periodically when leader
    await this.processQueue();
  }
}
```

### Plugins Using Global Coordinator

| Plugin | Purpose |
|--------|---------|
| `S3QueuePlugin` | Queue message processing |
| `SchedulerPlugin` | Cron job execution |
| `TTLPlugin` | Expired record cleanup |
| `EventualConsistencyPlugin` | Counter consolidation |

## Performance

### Before (per-plugin coordinators)

```
10 plugins × 720 heartbeats/hour = 7,200 API calls/hour
Monthly cost: ~$0.35
```

### After (global coordinator)

```
1 coordinator × 720 heartbeats/hour = 720 API calls/hour
Monthly cost: ~$0.04
```

**Savings: 90% reduction in API calls**

## Startup Jitter

Prevents thundering herd when many workers start simultaneously:

```javascript
// 100 workers with 5s jitter spread load over 5 seconds
{
  startupJitterMin: 0,
  startupJitterMax: 5000
}

// Each worker delays: random(0, 5000) ms before first heartbeat
```

## Namespace Isolation

Different namespaces have independent coordinators:

```javascript
const prodCoordinator = await db.getGlobalCoordinator('production');
const stagingCoordinator = await db.getGlobalCoordinator('staging');

// Each namespace has its own leader election
console.log('Prod leader:', await prodCoordinator.getLeader());
console.log('Staging leader:', await stagingCoordinator.getLeader());
```

## Troubleshooting

### No leader elected

```javascript
// Check workers are registering
const workers = await coordinator.getActiveWorkers();
if (workers.length === 0) {
  console.log('No active workers - check heartbeat');
}

// Check metrics
const metrics = coordinator.getMetrics();
console.log('Heartbeats:', metrics.heartbeatCount);
```

### Frequent leader changes

```javascript
// Check for worker timeouts
const metrics = coordinator.getMetrics();
if (metrics.workerTimeouts > metrics.leaderChanges) {
  console.log('Workers timing out - check network/S3 latency');
}

// Increase timeouts
{
  leaseTimeout: 30000,   // 30s instead of 15s
  workerTimeout: 45000   // 45s instead of 20s
}
```

### High latency

```javascript
// Check election duration
const metrics = coordinator.getMetrics();
if (metrics.electionDurationMs > 1000) {
  console.log('Slow elections - check S3 performance');
}
```

## Best Practices

### Do's

- **Use one namespace** - Unless you need isolation
- **Monitor metrics** - Track heartbeats and elections
- **Handle events** - React to leader changes gracefully
- **Set appropriate timeouts** - Based on your network conditions

### Don'ts

- **Don't create per-plugin coordinators** - Use global service
- **Don't ignore worker timeouts** - Indicates infrastructure issues
- **Don't set TTL too short** - Causes unnecessary leader changes

## See Also

- [Distributed Lock](/core/internals/distributed-lock.md) - Underlying locking mechanism
- [S3Queue Plugin](/plugins/s3-queue/README.md) - Queue processing with coordination
- [Scheduler Plugin](/plugins/scheduler/README.md) - Cron jobs with coordination
