# Design: Coordinator Resilience Features

## Context

The GlobalCoordinatorService provides leader election for distributed plugins using S3 as a shared arbiter. After studying etcd's Raft implementation, we identified resilience patterns applicable to our simpler coordination model.

**Key Difference from etcd:**
- etcd: Peer-to-peer consensus with quorum voting
- s3db: Storage-based coordination with deterministic leader selection

We cannot adopt Raft's voting mechanism (requires direct peer communication), but we can adopt its safety and observability patterns.

## Goals / Non-Goals

**Goals:**
- Prevent stale leader tasks from executing (epoch fencing)
- Alert operators when coordination is degraded (contention detection)
- Provide metrics for debugging distributed issues (enhanced observability)

**Non-Goals:**
- Implementing consensus algorithm (too complex for our use case)
- Changing election mechanism (lexicographic ordering works well)
- Adding peer-to-peer communication (S3 as arbiter is simpler)

## Decisions

### Decision 1: Epoch Fencing at Task Dispatch

**What:** Every task dispatched to plugins includes the current epoch. Plugins reject tasks with epoch < currentKnownEpoch.

**Why:** Prevents split-brain scenarios where an old leader's in-flight tasks execute after a new leader is elected.

**Implementation:**
```typescript
// In coordinator-plugin.class.ts
protected validateEpoch(taskEpoch: number): boolean {
  if (taskEpoch < this._lastKnownEpoch) {
    this.logger.warn({ taskEpoch, currentEpoch: this._lastKnownEpoch },
      'Rejecting task from stale epoch');
    return false;
  }
  this._lastKnownEpoch = Math.max(this._lastKnownEpoch, taskEpoch);
  return true;
}
```

**Alternatives Considered:**
- Timestamp-based fencing: Rejected (clock skew issues)
- Version vectors: Rejected (overkill for single-leader model)

### Decision 2: Contention Detection via Heartbeat Latency

**What:** Track heartbeat cycle duration. If duration > 2x heartbeatInterval, emit `contention:detected` event.

**Why:** etcd uses this to detect leader overload. Helps operators identify when coordination is degraded before failures occur.

**Implementation:**
```typescript
// In _heartbeatCycle
const cycleStart = Date.now();
// ... heartbeat logic ...
const cycleDuration = Date.now() - cycleStart;

if (cycleDuration > 2 * this.config.heartbeatInterval) {
  this.emit('contention:detected', {
    namespace: this.namespace,
    duration: cycleDuration,
    expected: this.config.heartbeatInterval,
    ratio: cycleDuration / this.config.heartbeatInterval
  });
}
```

**Threshold Choice:** 2x is etcd's default. Configurable via `contentionThreshold` option.

### Decision 3: Enhanced Metrics Structure

**What:** Expand CoordinatorMetrics with:
- `heartbeatLatencyP99`: Rolling p99 of last 100 heartbeats
- `electionDurationHistogram`: Bucketed election times
- `epochDriftEvents`: Count of epoch fencing rejections

**Why:** Current metrics are counters only. Latency distribution helps identify intermittent issues.

**Implementation:** Use simple ring buffer for latency tracking (no external dependency):
```typescript
interface EnhancedMetrics extends CoordinatorMetrics {
  heartbeatLatencies: number[];  // Ring buffer, last 100
  heartbeatLatencyP99: number;
  epochDriftEvents: number;
  contentionEvents: number;
}
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Epoch fencing rejects valid tasks during leader transition | Grace period: accept epoch ± 1 during transitions |
| Contention events spam logs | Rate limit to 1 event per 30 seconds |
| Ring buffer memory overhead | Fixed 100 entries = ~800 bytes per coordinator |

## Migration Plan

1. Add new metrics fields with defaults (backward compatible)
2. Add epoch to LeaderChangeEvent (additive)
3. Add validateEpoch() to CoordinatorPlugin base class (opt-in via override)
4. Add contention detection to heartbeat cycle
5. Plugins can adopt epoch fencing incrementally

**Rollback:** All features are additive. Disable via config flags if issues arise:
- `epochFencingEnabled: false`
- `contentionDetectionEnabled: false`

## Open Questions

1. Should epoch fencing be opt-in or opt-out for existing plugins?
   - **Recommendation:** Opt-in initially, opt-out after one release cycle

2. Should contention threshold be configurable per-namespace?
   - **Recommendation:** Yes, via `GlobalCoordinatorConfig.contentionThreshold`
