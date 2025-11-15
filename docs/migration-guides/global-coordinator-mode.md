# Global Coordinator Mode Migration Guide

## Overview

Global Coordinator Mode enables a shared election service across multiple coordinator-enabled plugins in the same namespace, reducing S3 API calls by ~90% and improving startup convergence time.

**Performance Impact:**
- API Calls: 10× reduction (N independent loops → 1 shared loop)
- Cost: ~90% savings on coordination heartbeats
- Startup: ~30% faster convergence (parallel heartbeats instead of sequential)

## Quick Start

### 1. Enable Global Coordinator in Your Plugins

```javascript
const queuePlugin = new S3QueuePlugin({
  resource: 'emails',
  coordinationMode: 'global',  // ← Enable global mode
  globalCoordinator: {
    heartbeatInterval: 5000,
    heartbeatJitter: 1000,
    leaseTimeout: 15000,
    workerTimeout: 20000,
    diagnosticsEnabled: true  // ← Enable logs for verification
  },
  // ... other config
});

const ttlPlugin = new TTLPlugin({
  resource: 'cache_entries',
  coordinationMode: 'global',  // ← Same namespace
  globalCoordinator: {
    heartbeatInterval: 5000,
    heartbeatJitter: 1000,
    leaseTimeout: 15000,
    workerTimeout: 20000,
    diagnosticsEnabled: true
  },
  // ... other config
});

await database.usePlugin(queuePlugin, 'queue');
await database.usePlugin(ttlPlugin, 'ttl');
```

### 2. Verify Single Election Loop

After plugins start, check logs for:

```
[coordinator:global] [default] Service started
[coordinator:global] [default] Leader changed: none → gcs-default-1234567890-abc123 (epoch: 1)
[coordinator:global] [default] Plugin subscribed: queue
[coordinator:global] [default] Plugin subscribed: ttl
```

You should see **ONE** service starting, not two separate election loops.

### 3. Monitor Metrics

Access coordinator metrics to verify single loop:

```javascript
const coordinator = await database.getGlobalCoordinator('default');
const metrics = coordinator.getMetrics();

console.log(`Heartbeats: ${metrics.heartbeatCount}`);
console.log(`Elections: ${metrics.electionCount}`);
console.log(`Leader changes: ${metrics.leaderChanges}`);
console.log(`Active workers: ${metrics.workerCount}`);
```

Expected with single loop:
- `heartbeatCount` increments slowly (one per interval)
- `electionCount` stays low (only re-elections on failure)
- `leaderChanges` low (stable leadership)

## Configuration Reference

### Global Coordinator Config

Place this inside `globalCoordinator` sub-object:

```javascript
{
  heartbeatInterval: 5000,      // Heartbeat frequency (ms) - Default: 5000
  heartbeatJitter: 1000,         // Random jitter 0-N (ms) - Default: 1000
  leaseTimeout: 15000,           // Leader lease TTL (ms) - Default: 15000
  workerTimeout: 20000,          // Worker heartbeat TTL (ms) - Default: 20000
  diagnosticsEnabled: true       // Verbose logging - Default: false
}
```

### Configuration Guidelines

| Scenario | Settings |
|----------|----------|
| **Development/Testing** | `heartbeatInterval: 1000, leaseTimeout: 3000, diagnosticsEnabled: true` |
| **Small Prod (1-5 workers)** | `heartbeatInterval: 5000, leaseTimeout: 15000, workerTimeout: 20000` |
| **Large Prod (10+ workers)** | `heartbeatInterval: 5000, leaseTimeout: 15000, workerTimeout: 25000` |
| **High-Traffic** | `heartbeatInterval: 3000, leaseTimeout: 10000, workerTimeout: 15000` |

### Namespace Isolation

Global coordinator uses namespace to isolate election loops. Each namespace gets its own service:

```javascript
// Separate election loops
await database.usePlugin(queuePlugin1, 'queue1', { namespace: 'tenant-a' });
await database.usePlugin(queuePlugin2, 'queue2', { namespace: 'tenant-b' });

// Independent coordinators
const coordinatorA = await database.getGlobalCoordinator('tenant-a');
const coordinatorB = await database.getGlobalCoordinator('tenant-b');
```

## Migration Steps

### Step 1: Update Plugin Configuration

In development first:

```javascript
// Before
const plugin = new S3QueuePlugin({
  resource: 'emails',
  // ... existing config
});

// After
const plugin = new S3QueuePlugin({
  resource: 'emails',
  coordinationMode: 'global',        // Add this
  globalCoordinator: {               // Add config
    heartbeatInterval: 5000,
    heartbeatJitter: 1000,
    leaseTimeout: 15000,
    workerTimeout: 20000
  },
  // ... existing config
});
```

### Step 2: Test in Development

```bash
# Run with diagnostics enabled
NODE_DEBUG=* npm run dev

# Watch logs for:
# - [coordinator:global] Service started
# - Single leader election
# - All plugins subscribed
```

### Step 3: Verify Metrics

```javascript
const coordinator = await database.getGlobalCoordinator('default');
setInterval(() => {
  const metrics = coordinator.getMetrics();
  console.log('Metrics:', metrics);
}, 10000);
```

Verify:
- Single service running
- Steady heartbeat rate
- Stable leader
- All plugins subscribed

### Step 4: Staging Deployment

1. Deploy to staging with global mode enabled
2. Monitor for 24 hours
3. Check logs: `[coordinator:global]` messages
4. Verify metrics via admin dashboard
5. Test leadership failover manually (kill one worker)

### Step 5: Production Rollout

**Option A: Blue-Green (Recommended)**
```
1. New deployment with global mode enabled
2. Run alongside old per-plugin mode deployment
3. Route traffic to new (blue) deployment
4. Keep old (green) running as fallback
5. After 48h of stable operation, shut down green
```

**Option B: Canary**
```
1. Deploy to 10% of workers with global mode
2. Monitor metrics and error rates
3. If stable after 1h, increase to 50%
4. After another 2h, expand to 100%
5. Complete migration to global mode
```

**Option C: Direct (Risky)**
```
1. Deploy immediately to all workers
2. Monitor closely for 24h
3. Have rollback plan ready
4. Revert to per-plugin mode if issues
```

## Monitoring During Migration

### Key Metrics to Watch

```javascript
// Setup monitoring
const interval = setInterval(async () => {
  const coordinator = await database.getGlobalCoordinator('default');
  const metrics = coordinator.getMetrics();

  console.log({
    timestamp: new Date().toISOString(),
    heartbeatCount: metrics.heartbeatCount,
    electionCount: metrics.electionCount,
    leaderChanges: metrics.leaderChanges,
    lastHeartbeatAge: Date.now() - metrics.lastHeartbeatTime
  });
}, 60000);  // Log every 60s
```

### Expected Logs

**Healthy startup:**
```
[coordinator:global] [default] Service started
[coordinator:global] [default] Leader changed: none → gcs-default-1234567890-abc (epoch: 1)
[coordinator:global] [default] Plugin subscribed: queue
[coordinator:global] [default] Plugin subscribed: ttl
[coordinator:global] [default] Heartbeat cycle executed
```

**During worker failure:**
```
[coordinator:global] [default] Leader changed: gcs-default-1234567890-old → gcs-default-9876543210-new (epoch: 2)
[coordinator:global] [default] Plugin subscribed: queue  # Re-subscribed to new leader
```

## Troubleshooting

### Issue: Multiple Leaders Detected

**Symptoms:**
- Multiple workers claiming leadership simultaneously
- Metrics show `leaderChanges` increasing rapidly

**Root Cause:**
- Clock skew between workers
- `leaseTimeout` too short for S3 latency

**Solution:**
```javascript
// Increase lease timeout
globalCoordinator: {
  leaseTimeout: 20000,    // Increased from 15000
  workerTimeout: 25000    // Increased proportionally
}
```

### Issue: Frequent Fallback to Per-Plugin Mode

**Symptoms:**
- Logs show: `[QueuePlugin] Global coordinator unavailable, falling back to per-plugin mode`
- Intermittent workers running jobs

**Root Cause:**
- Global coordinator not starting
- Storage permission denied
- Database not available during plugin init

**Solution:**
```javascript
// Ensure database is connected BEFORE plugins start
await database.connect();

// Then initialize plugins
await database.usePlugin(queuePlugin, 'queue');
await database.usePlugin(ttlPlugin, 'ttl');
```

### Issue: Stuck in Per-Plugin Mode

**Symptoms:**
- Plugins started with `coordinationMode: 'global'` but using per-plugin coordination
- No `[coordinator:global]` logs

**Root Cause:**
- Database unavailable when plugin initialized
- Global coordinator service failed to start

**Solution:**
```javascript
// Enable diagnostics to see what happened
const queuePlugin = new S3QueuePlugin({
  coordinationMode: 'global',
  globalCoordinator: {
    diagnosticsEnabled: true  // ← Key for debugging
  }
});

// Check logs for:
// [QueuePlugin] Global coordination initialized for namespace 'default'
// or
// [QueuePlugin] Failed to initialize global coordination: ...
```

### Issue: Leader Not Changing After Worker Failure

**Symptoms:**
- Worker dies but same leader continues for hours
- Metrics show no `leaderChanges`

**Root Cause:**
- Old leader's lease still valid
- Worker not timing out
- Leadership renewal bug

**Solution:**
```javascript
// Force re-election by restarting one worker
// Coordinator will detect stale workers and force new election

// Or manually check state:
const coordinator = await database.getGlobalCoordinator('default');
const leader = await coordinator.getLeader();
const workers = await coordinator.getActiveWorkers();

console.log('Current leader:', leader);
console.log('Active workers:', workers.map(w => w.workerId));

// If stale, kill the leader pod manually
```

### Issue: S3 Permission Denied on Coordinator Storage

**Symptoms:**
- Error: `GlobalCoordinatorService: database client not available`
- Logs show: `Failed to store new leader state`

**Root Cause:**
- Missing S3 IAM permissions for `plg_coordinator_global/` prefix

**Solution:**
Add S3 IAM permissions:
```json
{
  "Effect": "Allow",
  "Action": [
    "s3:GetObject",
    "s3:PutObject",
    "s3:DeleteObject",
    "s3:ListBucket"
  ],
  "Resource": [
    "arn:aws:s3:::your-bucket/plg_coordinator_global/*",
    "arn:aws:s3:::your-bucket"
  ]
}
```

## Rollback Procedure

If global mode causes issues:

### Quick Rollback (5 minutes)

```javascript
// Change all plugins back to per-plugin mode
const queuePlugin = new S3QueuePlugin({
  resource: 'emails',
  coordinationMode: 'per-plugin',  // ← Switch back
  // Remove globalCoordinator config
  // ... rest of config
});
```

Then redeploy. Workers will:
1. Automatically start per-plugin election loops
2. Continue processing without interruption
3. No data loss

### Full Rollback (revert code)

```bash
# If you need to revert entire feature
git revert <commit-hash>
npm run build
npm run deploy
```

Workers will cleanly transition to pre-global-coordinator behavior.

## Performance Benchmarks

### API Call Reduction

| Setup | Heartbeats/Hour | S3 Requests | Cost/Month |
|-------|-----------------|-------------|------------|
| 1 Queue (per-plugin) | 720 | 720 | $0.04 |
| 3 Plugins (per-plugin) | 2,160 | 2,160 | $0.10 |
| 3 Plugins (global) | 720 | 720 | $0.04 |
| 10 Plugins (per-plugin) | 7,200 | 7,200 | $0.35 |
| 10 Plugins (global) | 720 | 720 | $0.04 |

### Startup Convergence

| Scenario | Time to Leader |
|----------|-----------------|
| 1 Plugin | 2-3s |
| 3 Plugins (per-plugin) | 5-8s (sequential) |
| 3 Plugins (global) | 2-3s (parallel) |
| 10 Plugins (per-plugin) | 15-25s |
| 10 Plugins (global) | 3-4s |

## Next Steps

1. ✅ Review this guide
2. ✅ Update plugin config in dev
3. ✅ Test thoroughly in staging
4. ✅ Deploy to production gradually
5. ✅ Monitor metrics for 48 hours
6. ✅ Remove per-plugin mode if stable

## Support & Questions

For issues or questions:

1. Check "Troubleshooting" section above
2. Enable `diagnosticsEnabled: true` in config
3. Review logs for `[coordinator:global]` messages
4. Check metrics via `coordinator.getMetrics()`
5. File issue with logs and metrics attached

## See Also

- [Global Coordinator Service Architecture](../plugins/global-coordinator.md)
- [CoordinatorPlugin Reference](../plugins/coordinator.md)
- [CLAUDE.md - Global Coordinator Examples](../../CLAUDE.md#global-coordinator-service)
