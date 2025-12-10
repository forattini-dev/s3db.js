# Best Practices & FAQ

> **In this guide:** Configuration best practices, troubleshooting, and comprehensive FAQ.

**Navigation:** [← Back to Coordinator Plugin](/plugins/coordinator/README.md) | [Configuration](/plugins/coordinator/guides/configuration.md)

---

## Best Practices

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
process.on('SIGTERM', async () => {
  await plugin.stop();  // Stops heartbeats, releases coordination
  process.exit(0);
});
```

### 4. Keep Cold Start in Production

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
// For testing, skip cold start
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

## Troubleshooting

### No Coordinator Elected

**Symptoms:** Workers running but no coordinator

**Solutions:**
1. Check `enableCoordinator: true`
2. Verify workers are sending heartbeats (check PluginStorage)
3. Ensure cold start completed (`coord:cold-start-phase-changed` event)
4. Check for errors in coordinator election logic

### Frequent Coordinator Changes

**Symptoms:** Coordinator changes every few minutes

**Solutions:**
1. Increase `workerTimeout` (workers timing out too fast)
2. Increase `minEpochDuration` (prevent premature overthrow)
3. Check network stability (heartbeats failing)
4. Monitor worker health (workers crashing?)

### Cold Start Taking Too Long

**Symptoms:** Workers idle for >20 seconds after startup

**Solutions:**
1. Reduce `coldStartObservationWindow` (default 15s)
2. Reduce `coldStartPreparationDelay` (default 5s)
3. For single-instance deployments, skip cold start entirely

### Coordinator Not Doing Work

**Symptoms:** Coordinator elected but tasks not processing

**Solutions:**
1. Check `isCoordinator` property is `true`
2. Verify plugin's `coordinatorWork()` method is implemented
3. Check for errors in coordinator work logic
4. Monitor plugin-specific events (tickets-published, cleanup-started, etc.)

---

## FAQ

### General

**Q: What is coordinator mode?**

A: In multi-instance deployments, coordinator mode automatically elects one instance as the "coordinator" responsible for centralized tasks. This prevents duplicate work and race conditions.

**Q: How does coordinator election work?**

A: Lexicographic ordering of worker IDs. All workers get active workers, sort IDs alphabetically, and the first ID is coordinator. Fully deterministic, no voting needed.

**Q: What happens if coordinator crashes?**

A: Other workers detect missing heartbeats (after `workerTimeout`). Next scheduled heartbeat interval, they re-elect a new coordinator automatically.

**Q: Is coordinator mode required?**

A: No, you can disable it:
```javascript
{ enableCoordinator: false }
```
But it's **highly recommended** for multi-instance deployments.

### Configuration

**Q: How often are heartbeats sent?**

A: Every `heartbeatInterval` milliseconds (default 30s). Heartbeats are lightweight S3 PUT operations (metadata only).

**Q: Can I force a specific worker to be coordinator?**

A: Yes, for testing:
```javascript
await plugin.ensureCoordinator({
  force: true,
  desiredCoordinator: 'worker-1234567890-abc123'
});
```

**Q: What's stored in PluginStorage for coordination?**

A:
```javascript
{
  workerId: 'worker-1234567890-abc123',
  lastHeartbeat: 1734567890123,
  epoch: 1734568190123,  // Only for coordinator
  isCoordinator: true    // Only for coordinator
}
```

### Performance

**Q: What's the storage cost of coordination?**

A: Minimal:
- 1 heartbeat per worker per `heartbeatInterval` (default 30s)
- Each heartbeat is ~100 bytes
- For 10 workers: ~$0.005/month

**Q: Can workers communicate with each other?**

A: No direct communication. Workers only communicate via:
1. Heartbeats (stored in PluginStorage)
2. Shared state (queue, locks, etc.)

This design ensures scalability and fault tolerance.

### Cold Start

**Q: Why is cold start needed?**

A: Without cold start, early workers would immediately elect themselves as coordinator, then get overthrown when later workers join. The observation window ensures all workers start together before electing.

**Q: Can I skip cold start?**

A: Only for testing! In production, cold start prevents race conditions during cluster startup.

### Plugins Using Coordinator

**Q: Which plugins use coordinator mode?**

A:
- **S3QueuePlugin** - Ticket publishing and order dispatch
- **TTLPlugin** - Centralized cleanup intervals
- **SchedulerPlugin** - Centralized job scheduling

**Q: Can I create my own plugin with coordinator mode?**

A: Yes! Extend `CoordinatorPlugin` and implement the abstract methods:
```javascript
class MyPlugin extends CoordinatorPlugin {
  async onBecomeCoordinator() { /* ... */ }
  async onStopBeingCoordinator() { /* ... */ }
  async coordinatorWork() { /* ... */ }
}
```

---

## See Also

- [Configuration](/plugins/coordinator/guides/configuration.md) - All options and API reference
- [Usage Patterns](/plugins/coordinator/guides/usage-patterns.md) - Multi-instance patterns, monitoring, testing
- [S3Queue Plugin](/plugins/s3-queue/README.md) - Uses coordinator for ticket publishing
- [TTL Plugin](/plugins/ttl/README.md) - Uses coordinator for cleanup
- [Scheduler Plugin](/plugins/scheduler/README.md) - Uses coordinator for job scheduling
