# Change: Add Coordinator Resilience Features (Inspired by etcd Raft)

## Why

After analyzing etcd's Raft consensus implementation, we identified three resilience patterns that can strengthen the GlobalCoordinatorService without adding consensus complexity:

1. **Epoch Fencing** - Currently, plugins may process stale tasks from previous leaders. etcd rejects any operation from an old "Term" immediately.

2. **Contention Detection** - etcd monitors when heartbeats take >2x expected time, warning of leader overload. We have no such alerting.

3. **Heartbeat Metrics** - etcd tracks election duration, leader changes, and heartbeat performance comprehensively. Our metrics are basic.

These improvements reduce split-brain window, improve observability, and make debugging distributed issues easier.

## What Changes

- **ADDED**: Epoch fencing in task dispatch - plugins reject tasks from stale epochs
- **ADDED**: Contention detection - emit `contention:detected` when heartbeat exceeds 2x interval
- **ADDED**: Enhanced metrics - track heartbeat p99 latency, election duration histogram, epoch drift detection
- **MODIFIED**: `LeaderChangeEvent` includes epoch for downstream validation

## Impact

- Affected specs: `global-coordinator` (new spec)
- Affected code:
  - `src/plugins/concerns/global-coordinator-service.class.ts` (main changes)
  - `src/plugins/concerns/coordinator-plugin.class.ts` (epoch validation)
  - Plugins using coordination: S3QueuePlugin, SchedulerPlugin, TTLPlugin
- Breaking changes: None (additive only)
- Performance: Negligible overhead (one integer comparison per task)
