# Coordinator Plugin Design - Global-Only Architecture

## Philosophy: One Way To Do It

s3db uses a **single, elegant coordination model**: all plugins that need distributed coordination use `GlobalCoordinatorService`. No options, no fallbacks, no per-plugin mode.

```
┌─────────────────────────────────────────────────────┐
│  GlobalCoordinatorService (per namespace)            │
│  - Single heartbeat cycle (5s)                       │
│  - Deterministic leader election                     │
│  - Event-driven leader:changed notifications         │
└─────────────────────────────────────────────────────┘
         ↓ Events only (no polling)
    ┌────────────────────────────────────┐
    │  CoordinatorPlugin (thin wrapper)   │
    │  - Startup jitter                   │
    │  - Cold start observation           │
    │  - Coordinator work scheduling      │
    └────────────────────────────────────┘
         ↓ Extends
    ├── S3QueuePlugin
    ├── SchedulerPlugin
    ├── TTLPlugin
    └── EventualConsistencyPlugin
```

## Why This Design?

### 1. **Simplicity**
- Before: CoordinatorPlugin had 939 lines (with fallback + per-plugin mode)
- After: CoordinatorPlugin is 503 lines (thin wrapper only)
- 46% code reduction, 100% easier to understand

### 2. **Performance**
- **Before**: Each plugin had independent heartbeat loop = N API calls/hour (where N = number of plugins)
- **After**: 1 shared heartbeat = 720 API calls/hour regardless of plugin count
- **Result**: 10× fewer API calls with 10 plugins, 90% cost savings

### 3. **Reliability**
- Single source of truth for leader election
- No race conditions between independent election loops
- Consistent leadership across all plugins in a namespace
- Event-driven (no polling needed)

### 4. **Maintainability**
- One code path to maintain
- No fallback logic
- No compatibility layers
- Clear responsibility separation

## Architecture Details

### GlobalCoordinatorService
**Location**: `src/plugins/concerns/global-coordinator-service.class.js`

Handles:
- Worker registration via heartbeat
- Leader election (lexicographic ordering)
- Lease management (atomic operations)
- Event emission on leader changes
- Worker timeout detection

### CoordinatorPlugin
**Location**: `src/plugins/concerns/coordinator-plugin.class.js`

Wrapper responsibilities:
- Startup jitter (thundering herd prevention)
- Cold start observation period
- Lifecycle hooks (`onBecomeCoordinator`, `onStopBeingCoordinator`)
- Coordinator work scheduling
- Event listener setup/teardown

## Configuration

```javascript
const plugin = new S3QueuePlugin({
  // Core coordination
  enableCoordinator: true,              // Enable/disable coordination

  // Startup behavior
  startupJitterMin: 0,                  // Minimum startup delay (ms)
  startupJitterMax: 5000,               // Maximum startup delay (ms)

  // Discovery phase
  coldStartDuration: 0,                 // Observation period before leader election (ms)
  skipColdStart: false,                 // Skip observation if true

  // Work scheduling
  coordinatorWorkInterval: null,        // Coordinator work frequency (ms), null = disabled

  // GlobalCoordinatorService parameters
  heartbeatInterval: 5000,              // Heartbeat frequency (ms)
  heartbeatJitter: 1000,                // Random jitter per heartbeat (ms)
  leaseTimeout: 15000,                  // Leader lease duration (ms)
  workerTimeout: 20000                  // Worker registration TTL (ms)
});
```

## Lifecycle Flow

### 1. Plugin Initialization
```
new S3QueuePlugin({ enableCoordinator: true, ... })
  ↓
Plugin.initialize() called by database
  ↓
plugin.startCoordination()
```

### 2. Startup Phase
```
Apply startup jitter (0-5000ms)
  ↓ (prevents thundering herd on pod restarts)
Initialize GlobalCoordinatorService (per namespace)
  ↓ (lazy instantiation, cached per namespace)
Cold start observation (if configured)
  ↓ (3-phase discovery + election)
Setup leader change listener
  ↓
Monitor leader:changed events
```

### 3. Leader Change Detection
```
GlobalCoordinatorService emits 'leader:changed' event
  ↓
CoordinatorPlugin._setupLeaderChangeListener() receives event
  ↓
Compare: wasLeader vs isNowLeader
  ├─ None → Leader: Call onBecomeCoordinator()
  ├─ Leader → None: Call onStopBeingCoordinator()
  └─ No change: Ignore
```

### 4. Coordinator Work (if configured)
```
Only on leader worker:

onBecomeCoordinator()
  ↓
_startCoordinatorWork() (if coordinatorWorkInterval set)
  ↓
coordinatorWork() called every N milliseconds
  ↓
onStopBeingCoordinator() (if leadership lost)
```

## Design Patterns

### 1. Startup Jitter (Thundering Herd Prevention)
**Problem**: All pods restart simultaneously → all hit S3 at same time → rate limiting

**Solution**: Random delay before starting coordination
```javascript
const jitterMs = startupJitterMin +
  Math.random() * (startupJitterMax - startupJitterMin);

// Spreads load over time window (e.g., 0-5s)
await new Promise(resolve => setTimeout(resolve, jitterMs));
```

**Tuning**:
- Small clusters (< 10 workers): Set `startupJitterMax: 0`
- Medium clusters (10-50): Use defaults (5000ms)
- Large clusters (> 50): Increase to 15000-30000ms

### 2. Cold Start (Worker Discovery)
**Problem**: Worker needs to know about other workers before election

**Solution**: Observation period in 3 phases
1. **Observing** (1/3 of duration): Workers discover each other via heartbeats
2. **Election** (1/3 of duration): Leader election happens
3. **Preparation** (1/3 of duration): Elected leader prepares

### 3. Event-Driven Coordination
**No polling**. GlobalCoordinatorService emits events:
- `leader:changed` - Leadership transition
- Plugins subscribe and react immediately

## Performance Characteristics

### API Call Reduction
| Configuration | Heartbeats/Hour | API Calls |
|---|---|---|
| 1 plugin (per-plugin mode) | 720 | 720 |
| 3 plugins (per-plugin) | 2,160 | 2,160 |
| 3 plugins (global) | 720 | 720 |
| 10 plugins (per-plugin) | 7,200 | 7,200 |
| 10 plugins (global) | 720 | 720 |

### Startup Time
| Configuration | Leader Election Time |
|---|---|
| 1 plugin | 2-3s |
| 3 plugins (per-plugin) | 5-8s |
| 3 plugins (global) | 2-3s |
| 10 plugins (per-plugin) | 15-25s |
| 10 plugins (global) | 3-4s |

## Debugging & Monitoring

### Check Coordinator Status
```javascript
const coordinator = await database.getGlobalCoordinator('default');

// Is it running?
console.log('Running:', coordinator.isRunning);

// Who is the leader?
const leader = await coordinator.getLeader();
console.log('Leader:', leader);

// Active workers?
const workers = await coordinator.getActiveWorkers();
console.log('Workers:', workers.length);

// Metrics
const metrics = coordinator.getMetrics();
console.log('Heartbeats:', metrics.heartbeatCount);
console.log('Elections:', metrics.electionCount);
console.log('Leader changes:', metrics.leaderChanges);
```

### Enable Verbose Logging
```javascript
const plugin = new S3QueuePlugin({
  verbose: true,  // Enable debug logs
  enableCoordinator: true,
  // ...
});
```

Logs will show:
```
[S3QueuePlugin] Startup jitter: 2341ms
[S3QueuePlugin] Connected to global coordinator (namespace: default)
[S3QueuePlugin] Cold start phase: observing
[S3QueuePlugin] Discovered 3 worker(s)
[S3QueuePlugin] Cold start phase: election
[S3QueuePlugin] Leader elected: worker-xxx (this: YES)
[S3QueuePlugin] Cold start phase: preparation
[S3QueuePlugin] Became leader (workerId: worker-xxx)
[S3QueuePlugin] Cold start completed in 9043ms
[S3QueuePlugin] Coordination started (workerId: worker-xxx)
[S3QueuePlugin] Coordinator work started (interval: 60000ms)
[S3QueuePlugin] Leader: worker-yyy → worker-xxx (epoch: 2)
```

## Implementation Guide

### For Plugin Authors
All plugins that extend `CoordinatorPlugin` automatically get:
- ✅ Global coordination (no setup needed)
- ✅ Leader change notifications (via `leader:changed` events)
- ✅ Startup jitter prevention
- ✅ Cold start observation

Just implement:
```javascript
class MyPlugin extends CoordinatorPlugin {
  async onBecomeCoordinator() {
    // Start coordinator-only work
  }

  async onStopBeingCoordinator() {
    // Cleanup coordinator work
  }

  async coordinatorWork() {
    // Periodic work (only runs on leader)
  }
}
```

### For Operations
Monitor these metrics:
- **Heartbeat count**: Should increase steadily (1 per interval)
- **Election count**: Should be low (only on leadership changes)
- **Leader changes**: Should be rare (stable leadership)
- **Active workers**: Should be consistent

## Migration Notes

**Breaking Change**: Per-plugin coordination mode removed.

All plugins now use:
- `GlobalCoordinatorService` for shared leader election
- Event-driven coordination (no polling)
- Mandatory global coordinator per namespace

**Impact**: Configuration simplified, no code changes needed in plugins.

## See Also
- [Global Coordinator Service API](./global-coordinator-api.md)
- [Migration Guide](../migration-guides/global-coordinator-mode.md)
- [Troubleshooting Guide](../troubleshooting/global-coordinator.md)
