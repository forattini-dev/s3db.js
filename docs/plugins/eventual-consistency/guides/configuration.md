# Configuration

> **In this guide:** All configuration options, consolidation settings, analytics configuration, and advanced options.

**Navigation:** [← Back to EventualConsistency Plugin](/plugins/eventual-consistency/README.md)

---

## Core Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `resources` | Object | **Required** | Map of resource names to array of field names to track |
| `logLevel` | Boolean | `true` | Enable detailed logging |
| `debug` | Boolean | `false` | Enable additional debug mode |

**Example:**
```javascript
new EventualConsistencyPlugin({
  resources: {
    wallets: ['balance'],
    users: ['points', 'credits']
  }
})
```

---

## Consolidation Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `consolidation.mode` | String | `'async'` | `'sync'` (immediate) or `'async'` (eventual) |
| `consolidation.auto` | Boolean | `true` | Enable auto-consolidation |
| `consolidation.interval` | Number | `300` | Auto-consolidation interval in seconds |
| `consolidation.window` | Number | `24` | Consolidation window in hours |
| `consolidation.concurrency` | Number | `5` | Number of parallel consolidations |
| `consolidation.markAppliedConcurrency` | Number | `50` | Concurrency for marking transactions as applied |

**Example:**
```javascript
new EventualConsistencyPlugin({
  resources: { wallets: ['balance'] },
  consolidation: {
    mode: 'sync',      // Immediate consolidation
    auto: true,        // Auto-consolidate
    interval: 300,     // Every 5 minutes
    window: 24,        // Last 24 hours
    concurrency: 10    // 10 parallel consolidations
  }
})
```

---

## Analytics Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `analytics.enabled` | Boolean | `false` | Enable pre-calculated analytics |
| `analytics.periods` | Array | `['hour', 'day', 'month']` | Time periods: `'hour'`, `'day'`, `'week'`, `'month'` |
| `analytics.metrics` | Array | `['count', 'sum', 'avg', 'min', 'max']` | Metrics to calculate |

**Example:**
```javascript
new EventualConsistencyPlugin({
  resources: { wallets: ['balance'] },
  analytics: {
    enabled: true,
    periods: ['hour', 'day', 'week', 'month'],
    metrics: ['count', 'sum', 'avg', 'min', 'max']
  }
})
```

---

## Advanced Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `locks.timeout` | Number | `300` | Lock timeout in seconds |
| `garbageCollection.enabled` | Boolean | `true` | Enable garbage collection |
| `garbageCollection.interval` | Number | `86400` | GC interval in seconds (24 hours) |
| `garbageCollection.retention` | Number | `30` | Retention days for applied transactions |
| `checkpoints.enabled` | Boolean | `true` | Enable checkpoints for recovery |
| `checkpoints.strategy` | String | `'hourly'` | Checkpoint strategy |
| `checkpoints.retention` | Number | `90` | Checkpoint retention in days |
| `cohort.timezone` | String | `'UTC'` | Timezone for analytics |

**Example:**
```javascript
new EventualConsistencyPlugin({
  resources: { wallets: ['balance'] },
  locks: { timeout: 600 },
  garbageCollection: {
    enabled: true,
    interval: 43200,   // 12 hours
    retention: 60      // 60 days
  },
  checkpoints: {
    enabled: true,
    strategy: 'hourly',
    retention: 180     // 180 days
  },
  cohort: { timezone: 'America/New_York' }
})
```

---

## Complete Configuration Example

```javascript
const plugin = new EventualConsistencyPlugin({
  // Required
  resources: {
    wallets: ['balance'],
    users: ['points', 'credits']
  },

  // Consolidation
  consolidation: {
    mode: 'async',
    auto: true,
    interval: 300,
    window: 24,
    concurrency: 5,
    markAppliedConcurrency: 50
  },

  // Analytics
  analytics: {
    enabled: true,
    periods: ['hour', 'day', 'week', 'month'],
    metrics: ['count', 'sum', 'avg', 'min', 'max']
  },

  // Debug
  logLevel: 'debug',
  debug: false,

  // Advanced
  locks: { timeout: 300 },
  garbageCollection: { enabled: true, interval: 86400, retention: 30 },
  checkpoints: { enabled: true, strategy: 'hourly', retention: 90 },
  cohort: { timezone: 'UTC' }
});

await db.usePlugin(plugin);
```

---

## API Reference

### Resource Methods

```javascript
// Set absolute value
await resource.set(id, field, value)

// Add
await resource.add(id, field, amount)

// Subtract
await resource.sub(id, field, amount)

// Increment by 1 (shorthand)
await resource.increment(id, field)

// Decrement by 1 (shorthand)
await resource.decrement(id, field)

// Consolidate
await resource.consolidate(id, field)

// Get consolidated value (without applying)
await resource.getConsolidatedValue(id, field, options)

// Recalculate from scratch
await resource.recalculate(id, field)
```

---

## Resources Created

For each field, the plugin creates:

1. **`plg_{resource}_tx_{field}`** - Transaction log
   - Attributes: `id`, `originalId`, `field`, `value`, `operation`, `timestamp`, `cohortDate`, `cohortHour`, `cohortWeek`, `cohortMonth`, `applied`
   - Partitions: `byOriginalIdAndApplied` (optimized consolidation), `byHour`, `byDay`, `byWeek`, `byMonth`

2. **Locks via PluginStorage** - Distributed locks with automatic TTL

3. **`plg_{resource}_an_{field}`** - Analytics (if enabled)
   - Periods: `hour`, `day`, `week`, `month`

---

## Analytics Data Structure

```javascript
{
  id: 'hour-2025-10-09T14',
  period: 'hour',            // 'hour', 'day', 'week', 'month'
  cohort: '2025-10-09T14',   // or '2025-W42' for week
  transactionCount: 150,
  totalValue: 5000,
  avgValue: 33.33,
  minValue: 10,
  maxValue: 500,
  recordCount: 25,           // Distinct originalIds
  operations: {
    add: { count: 120, sum: 6000 },
    sub: { count: 30, sum: -1000 }
  }
}
```

---

## See Also

- [Usage Patterns](/plugins/eventual-consistency/guides/usage-patterns.md) - Examples and use cases
- [Best Practices](/plugins/eventual-consistency/guides/best-practices.md) - Troubleshooting and FAQ
