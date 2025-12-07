# Core Internals

Advanced internal mechanisms for contributors and power users.

## Overview

These components power s3db.js's distributed capabilities. Understanding them helps with debugging, performance tuning, and contributing to the codebase.

## Components

### [Distributed Lock](distributed-lock.md)

S3-based atomic locking using conditional writes.

```javascript
const lock = new DistributedLock(storage);

await lock.withLock('my-resource', { ttl: 30 }, async () => {
  // Only one process executes this
  await criticalOperation();
});
```

**Used by:** PluginStorage, DistributedSequence, IncrementalSequence

---

### [Distributed Sequence](distributed-sequence.md)

Atomic sequence generation for distributed ID generation.

```javascript
const seq = createSequence(storage, { resourceName: 'orders' });

const orderId = await seq.next('id'); // 1, 2, 3, ...
```

**Used by:** IncrementalSequence, PluginStorage, Audit Plugin

---

### [JSON Recovery](json-recovery.md)

Self-healing mechanisms for corrupted metadata.

```javascript
// Automatic on connect - no code needed
db.on('db:metadata-healed', ({ healingLog }) => {
  console.log('Healed:', healingLog);
});
```

**Fixes:** Trailing commas, missing quotes, invalid structures

---

### [Global Coordinator](global-coordinator.md)

Shared leader election for plugin coordination.

```javascript
const coordinator = await db.getGlobalCoordinator('default');

coordinator.on('leader:changed', ({ newLeader }) => {
  console.log('New leader:', newLeader);
});
```

**Used by:** S3QueuePlugin, TTLPlugin, SchedulerPlugin, EventualConsistencyPlugin

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Database                              │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                   S3 Storage                            │ │
│  │  ┌──────────────┬──────────────┬──────────────────────┐│ │
│  │  │  Metadata    │   Records    │    Plugin Data       ││ │
│  │  │  s3db.json   │  resource=X  │   plugin=Y           ││ │
│  │  └──────────────┴──────────────┴──────────────────────┘│ │
│  └────────────────────────────────────────────────────────┘ │
│                            │                                 │
│         ┌──────────────────┼──────────────────┐             │
│         ▼                  ▼                  ▼             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐   │
│  │ Distributed │   │ Distributed │   │    Global       │   │
│  │    Lock     │   │  Sequence   │   │  Coordinator    │   │
│  │             │   │             │   │                 │   │
│  │ ifNoneMatch │   │ lock+get+   │   │  heartbeat +    │   │
│  │ precondition│   │ set atomic  │   │  leader elect   │   │
│  └─────────────┘   └─────────────┘   └─────────────────┘   │
│         │                  │                  │             │
│         └──────────────────┼──────────────────┘             │
│                            ▼                                 │
│                  ┌─────────────────┐                        │
│                  │  JSON Recovery  │                        │
│                  │  (on connect)   │                        │
│                  └─────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

## When to Use What

| Need | Component |
|------|-----------|
| Mutual exclusion | Distributed Lock |
| Unique IDs | Distributed Sequence |
| Corrupted recovery | JSON Recovery (automatic) |
| Leader election | Global Coordinator |

## Performance Impact

| Component | Latency | API Calls |
|-----------|---------|-----------|
| Lock acquire | 20-50ms | 1-3 |
| Sequence next | 30-80ms | 2-4 |
| JSON Recovery | On demand | 2-5 |
| Coordinator heartbeat | 5000ms | 1/beat |

## See Also

- [Core Documentation](../README.md) - Database, Resource, Schema
- [Plugin System](../../plugins/README.md) - Plugin architecture
- [Performance Tuning](../../guides/performance-tuning.md) - Optimization tips
