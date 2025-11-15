# Global Coordinator Troubleshooting Guide

## Quick Diagnosis

Before diving into specific issues, run these diagnostic commands:

```javascript
// Check if global coordinator is running
const coordinator = await database.getGlobalCoordinator('default');
console.log('Running:', coordinator.isRunning);
console.log('Leader:', await coordinator.getLeader());

// Get metrics
const metrics = coordinator.getMetrics();
console.log('Metrics:', metrics);

// Check active workers
const workers = await coordinator.getActiveWorkers();
console.log('Workers:', workers);

// Check subscribed plugins
console.log('Subscribed plugins:', Array.from(coordinator.subscribedPlugins.keys()));
```

Expected output:
```
Running: true
Leader: gcs-default-1234567890-abc123
Metrics: { heartbeatCount: 42, electionCount: 1, leaderChanges: 0, ... }
Workers: [ { workerId: 'gcs-default-...', lastHeartbeat: 1234567890, ... } ]
Subscribed plugins: [ 'queue', 'ttl' ]
```

---

## Common Issues & Solutions

### 1. Service Not Starting

**Problem:** `coordinator.isRunning` is `false` or global coordinator not initialized

**Symptoms:**
```
[QueuePlugin] Global coordination initialized for namespace 'default'
[QueuePlugin] Global coordinator unavailable, falling back to per-plugin mode
```

**Causes & Solutions:**

| Cause | Check | Fix |
|-------|-------|-----|
| Database not connected | `await database.connect()` before plugins | Connect database first |
| Missing IAM permissions | Check S3 bucket permissions | Add `s3:GetObject`, `s3:PutObject` for `plg_coordinator_global/*` |
| Wrong bucket | Connection string | Verify bucket path in connection string |
| Storage unreachable | Try manual S3 operation | Test S3 connectivity with AWS CLI |

**Diagnostic Code:**
```javascript
try {
  const coordinator = await database.getGlobalCoordinator('default');
  await coordinator.start();
  console.log('✅ Coordinator started');
} catch (err) {
  console.error('❌ Failed to start:', err.message);
  // Check: database.client, bucket name, IAM permissions
}
```

---

### 2. Multiple Leaders

**Problem:** Two or more workers claim leadership simultaneously

**Symptoms:**
```
Worker A: [coordinator:global] Leader changed: none → worker-A (epoch: 1)
Worker B: [coordinator:global] Leader changed: none → worker-B (epoch: 1)
Jobs running on both A and B
```

**Root Cause:** Typically clock skew or short lease timeout

**Solutions:**

**Solution A: Sync System Clocks**
```bash
# On each worker:
ntpdate -s time.nist.gov
chronyc makestep  # For chrony daemon
```

**Solution B: Increase Lease Timeout**
```javascript
globalCoordinator: {
  leaseTimeout: 20000,      // Increased from 15000
  workerTimeout: 25000      // Keep proportional
}
```

**Solution C: Check S3 Consistency**
```javascript
// S3 eventual consistency can cause issues
// Verify with a test write
const testKey = 'plg_coordinator_global/test-consistency.json';
await database.client.putObject({ key: testKey, body: 'test' });
const result = await database.client.getObject(testKey);
console.log('Consistency OK:', result.body === 'test');
```

---

### 3. Rapid Leader Changes

**Problem:** Leadership changing every few seconds

**Symptoms:**
```
[coordinator:global] Leader changed: A → B (epoch: 1)
[coordinator:global] Leader changed: B → C (epoch: 2)
[coordinator:global] Leader changed: C → A (epoch: 3)
```

**Root Causes:**

| Cause | Indicator | Fix |
|-------|-----------|-----|
| S3 latency > lease timeout | S3 requests taking > 5s | Increase `leaseTimeout` to 20000+ |
| Worker heartbeat failing | Logs: `Failed to register worker` | Check worker resources, S3 quota |
| Network issues | Intermittent S3 timeouts | Check network connectivity |
| High server load | CPU/Memory near 100% | Scale up resources |

**Diagnostic Code:**
```javascript
const coordinator = await database.getGlobalCoordinator('default');

// Monitor leader changes
let lastLeader = null;
const leaderChangeCount = { value: 0 };

coordinator.on('leader:changed', (event) => {
  if (lastLeader === event.newLeader) {
    leaderChangeCount.value++;
    if (leaderChangeCount.value > 3) {
      console.warn('⚠️ Rapid leader changes detected!');
    }
  }
  lastLeader = event.newLeader;
});

// Monitor S3 latency
const startTime = Date.now();
await coordinator._heartbeatCycle();
const duration = Date.now() - startTime;
console.log(`Heartbeat cycle took ${duration}ms`);
if (duration > 5000) {
  console.warn('⚠️ Slow heartbeat - increase leaseTimeout');
}
```

---

### 4. Worker Not Registering

**Problem:** `getActiveWorkers()` returns empty or missing workers

**Symptoms:**
```
Active workers: []
Leader: undefined
Error: electCoordinator returned null (no workers available)
```

**Root Causes:**

| Cause | Check | Fix |
|-------|-------|-----|
| Heartbeat not running | Logs: `Heartbeat cycle` | Ensure `await coordinator.start()` called |
| Storage permission denied | S3 errors in logs | Add IAM permissions for `plg_coordinator_global/workers/` |
| Worker timeout expired | Worker age > `workerTimeout` | Increase `workerTimeout` or fix heartbeat |
| Wrong namespace | Check coordinator namespace | Ensure plugins use same namespace |

**Diagnostic Code:**
```javascript
const coordinator = await database.getGlobalCoordinator('default');

// Check storage directly
const workerKey = coordinator._getWorkerKey(coordinator.workerId);
console.log('Worker key:', workerKey);

try {
  const worker = await database.client.getObject(workerKey);
  console.log('✅ Worker registered:', worker);
} catch (err) {
  console.error('❌ Worker not found:', err.message);
}

// Check timeout calculation
const metrics = coordinator.getMetrics();
const age = Date.now() - metrics.lastHeartbeatTime;
console.log(`Last heartbeat ${age}ms ago (timeout: ${coordinator.config.workerTimeout}ms)`);
```

---

### 5. Plugins Not Subscribed

**Problem:** `subscribedPlugins` is empty or missing plugins

**Symptoms:**
```
Subscribed plugins: []
No leadership notifications to plugins
```

**Root Causes:**

| Cause | Check | Fix |
|-------|-------|-----|
| Plugin not initialized with global mode | Plugin config | Set `coordinationMode: 'global'` |
| Plugin failed to subscribe | Logs: `Failed to initialize global coordination` | Check database.client availability |
| Plugin stopped before subscribe | Logs during plugin init | Ensure plugins start AFTER database ready |

**Diagnostic Code:**
```javascript
const coordinator = await database.getGlobalCoordinator('default');

console.log('Subscribed plugins:', {
  count: coordinator.subscribedPlugins.size,
  names: Array.from(coordinator.subscribedPlugins.keys()),
  plugins: Array.from(coordinator.subscribedPlugins.entries()).map(([name, plugin]) => ({
    name,
    type: plugin.constructor.name
  }))
});

// Check if plugin has callback
const queue = coordinator.subscribedPlugins.get('queue');
if (queue) {
  console.log('Queue plugin methods:', {
    hasOnGlobalLeaderChange: typeof queue.onGlobalLeaderChange === 'function'
  });
}
```

---

### 6. Fallback to Per-Plugin Mode

**Problem:** Plugins using global coordinator config but falling back to per-plugin mode

**Symptoms:**
```
[QueuePlugin] Global coordinator unavailable, falling back to per-plugin mode
Multiple election loops running (one per plugin)
```

**Troubleshooting:**

1. **Enable Diagnostics**
```javascript
globalCoordinator: {
  diagnosticsEnabled: true  // ← Add this
}
```

2. **Check Logs**
```
[QueuePlugin] Global coordination initialized for namespace 'default'
[QueuePlugin] Failed to initialize global coordination: ...
```

3. **Common Errors:**

**Error: "database client not available"**
```javascript
// Ensure database is connected BEFORE plugins init
await database.connect();
const client = await database.client;  // Should not be null
console.log('Client ready:', !!client);
```

**Error: "Cannot acquire lock"**
```javascript
// Check S3 permissions for lock operations
// Verify IAM includes:
{
  "Action": [
    "s3:GetObject",
    "s3:PutObject",
    "s3:DeleteObject"
  ],
  "Resource": "arn:aws:s3:::bucket/plg_coordinator_global/*"
}
```

**Error: "Storage initialization failed"**
```javascript
// Check database is fully initialized
console.log('Database ready:', database.isConnected());
console.log('Client type:', database.client.constructor.name);
console.log('Bucket:', database.bucket);
console.log('Key prefix:', database.keyPrefix);
```

---

### 7. High Memory Usage

**Problem:** Memory increases over time, eventually crashes

**Symptoms:**
```
RSS: 500MB → 1GB → 2GB (keeps growing)
Heartbeat cycle slows down
```

**Root Causes:**
- Event listener leak
- Unclosed timers in coordinator
- Plugin subscription not cleaned up

**Solutions:**

**Solution A: Proper Cleanup**
```javascript
// On shutdown:
await coordinator.stop();
await database.disconnect();

// This should:
// 1. Stop heartbeat timers
// 2. Clear all subscriptions
// 3. Remove event listeners
```

**Solution B: Monitor Memory**
```javascript
setInterval(() => {
  const mem = process.memoryUsage();
  console.log('Memory:', {
    rss: Math.round(mem.rss / 1024 / 1024) + 'MB',
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB'
  });
}, 60000);
```

**Solution C: Force Cleanup**
```javascript
// If memory still leaks after stop:
coordinator.subscribedPlugins.clear();
coordinator.removeAllListeners();
```

---

### 8. Leadership Not Transferring on Failure

**Problem:** Leader worker dies but leadership doesn't transfer for minutes

**Symptoms:**
```
Worker A (leader) crashes
Queue jobs pile up for 10+ minutes
Then leadership transfers to B
```

**Root Cause:** Old leader's lease still valid

**Solution: Reduce Lease Timeout**
```javascript
globalCoordinator: {
  leaseTimeout: 10000,      // Reduced from 15000
  workerTimeout: 15000      // Keep proportional (1.5x lease)
}
```

**Tradeoff:**
- Pro: Faster failover (10s instead of 15s)
- Con: More prone to split-brain if S3 slow

**Alternative: Explicit Leader Reset**
```javascript
// If stuck, manually reset leader
const stateKey = coordinator._getStateKey();
await database.client.delete(stateKey);

// Next heartbeat will force new election
// (don't do this without coordinating all workers!)
```

---

### 9. Metrics Not Incrementing

**Problem:** Metrics show 0 for all counters

**Symptoms:**
```
Metrics: { heartbeatCount: 0, electionCount: 0, ... }
Stays at 0 for minutes
```

**Root Cause:** Heartbeat cycle not running

**Check:**
```javascript
const coordinator = await database.getGlobalCoordinator('default');

// Is it started?
console.log('Running:', coordinator.isRunning);

// Are timers active?
console.log('Heartbeat timer:', coordinator.heartbeatTimer);
console.log('Election timer:', coordinator.electionTimer);

// Is start() being called?
if (!coordinator.isRunning) {
  await coordinator.start();  // ← This must be called!
}
```

---

### 10. Storage Key Collisions

**Problem:** Multiple namespaces interfering with each other

**Symptoms:**
```
[namespace-a] Leader changed: X → Y
[namespace-b] Leader changed: X → Y  (same leader!)
Both claim leadership
```

**Root Cause:** Storage keys not properly namespaced

**Check:**
```javascript
const coorA = await database.getGlobalCoordinator('namespace-a');
const coorB = await database.getGlobalCoordinator('namespace-b');

console.log('A state key:', coorA._getStateKey());
console.log('B state key:', coorB._getStateKey());

// Should be different!
// plg_coordinator_global/namespace-a/state.json
// plg_coordinator_global/namespace-b/state.json
```

---

## Log Analysis

### What Healthy Logs Look Like

```
✅ Startup:
[coordinator:global] [default] Service started
[coordinator:global] [default] Worker registered
[coordinator:global] [default] Leader changed: none → worker-123 (epoch: 1)
[coordinator:global] [default] Plugin subscribed: queue
[coordinator:global] [default] Plugin subscribed: ttl
[coordinator:global] [default] Heartbeat cycle executed

✅ Steady State (every 5s):
[coordinator:global] [default] Heartbeat cycle executed
[coordinator:global] [default] Heartbeat cycle executed

✅ Leadership Renewal (every ~1 min):
[coordinator:global] [default] Coordinator epoch renewed
```

### Red Flags in Logs

| Log Pattern | Issue | Action |
|------------|-------|--------|
| `Service already running` | Duplicate start attempts | Check init code |
| `Failed to register worker` | S3 write failing | Check IAM & network |
| `Failed to conduct election` | S3 read failing | Check S3 status |
| `Multiple leaders detected` | Race condition | Increase lease timeout |
| `Worker timeout: X workers` | Old workers not cleaning up | Increase worker timeout |
| `No active workers` | All workers dead | Check worker heartbeats |

---

## Recovery Procedures

### Stuck Leader (Not Stepping Down)

```javascript
// Manually force re-election
const coordinator = await database.getGlobalCoordinator('default');
const stateKey = coordinator._getStateKey();

// Remove old leader state
await database.client.delete(stateKey);

// Next heartbeat forces new election
await coordinator._heartbeatCycle();
const newLeader = await coordinator.getLeader();
console.log('New leader:', newLeader);
```

### Corrupted State

```javascript
// Clear all coordinator state (careful!)
const coordinator = await database.getGlobalCoordinator('default');
const prefix = 'plg_coordinator_global/default/';

// Delete all state files
await database.client.delete(prefix + 'state.json');
// Workers will re-register automatically
// New election happens on next heartbeat
```

### Clean Shutdown

```javascript
// Proper shutdown sequence
await coordinator.stop();           // Stop heartbeat
coordinator.subscribedPlugins.clear();  // Clear subscriptions
await database.disconnect();        // Close S3 connection
```

---

## Getting Help

If issue persists:

1. **Collect diagnostics:**
   ```javascript
   const diag = {
     coordinator: {
       running: coordinator.isRunning,
       leader: await coordinator.getLeader(),
       workers: await coordinator.getActiveWorkers(),
       metrics: coordinator.getMetrics()
     },
     plugins: Array.from(coordinator.subscribedPlugins.keys()),
     config: coordinator.config
   };
   console.log(JSON.stringify(diag, null, 2));
   ```

2. **Enable verbose logging:**
   ```javascript
   globalCoordinator: { diagnosticsEnabled: true }
   ```

3. **Check S3 connectivity:**
   ```bash
   aws s3 ls s3://your-bucket/plg_coordinator_global/
   aws s3 cp test.txt s3://your-bucket/plg_coordinator_global/test.txt
   aws s3 rm s3://your-bucket/plg_coordinator_global/test.txt
   ```

4. **File issue with:**
   - Diagnostic output (above)
   - Recent logs (last 100 lines)
   - Configuration (sanitized)
   - S3 region and bucket name

---

## See Also

- [Migration Guide](../migration-guides/global-coordinator-mode.md) - How to enable
- [CoordinatorPlugin Reference](../plugins/coordinator.md) - API details
- [GlobalCoordinatorService Architecture](../plugins/global-coordinator.md) - Design docs
