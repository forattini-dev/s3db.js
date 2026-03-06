# Configuration

This guide documents the configuration surface of the current EventualConsistencyPlugin runtime. It covers the real top-level options used by the code today, the nested compatibility aliases that still work, and the settings that matter for analytics, coordinator mode, tickets, and retention.

**Navigation:** [← Back to EventualConsistency Plugin](/plugins/eventual-consistency/README.md) | [Analytics & History](/plugins/eventual-consistency/guides/analytics-history.md)

## TLDR

- `resources` is the only required option.
- The runtime normalizes several top-level options such as `mode`, `autoConsolidate`, `consolidationInterval`, `enableAnalytics`, and `enableCoordinator`.
- Nested aliases like `consolidation.mode` and `analytics.enabled` still work, but the top-level names are clearer as canonical documentation.
- If you care about dashboards, history retention, or distributed workers, read the analytics/coordinator sections carefully.

---

## Core Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `resources` | `Record<string, (string \| FieldConfig)[]>` or `ResourceConfig[]` | **Required** | Resource-to-field mapping |
| `mode` | `sync \| async` | `'async'` | Consolidation mode |
| `autoConsolidate` | Boolean | `true` | Enable automatic consolidation |
| `consolidationInterval` | Number | `60` | Consolidation interval in seconds |
| `consolidationWindow` | Number | `24` | Window in hours for pending transaction scans |
| `transactionRetention` | Number | `7` | Retention days for transaction history |
| `gcInterval` | Number | `3600` | Garbage collection interval in seconds |
| `enableAnalytics` | Boolean | `false` | Enable analytics resources and rollups |
| `enableCoordinator` | Boolean | `true` | Enable coordinator/ticket workflow |
| `debug` | Boolean | `false` | Enable additional debug mode |
| `logLevel` | String | inherited | Plugin log level |

**Example:**
```javascript
new EventualConsistencyPlugin({
  resources: {
    wallets: ['balance'],
    users: [
      'points',
      { field: 'credits', initialValue: 100 }
    ]
  },
  mode: 'sync',
  autoConsolidate: true,
  enableAnalytics: true
})
```

---

## Resource Field Configuration

Each field can be a string or a configuration object.

```javascript
new EventualConsistencyPlugin({
  resources: {
    wallets: [
      'balance',
      {
        field: 'availableCredit',
        initialValue: 0,
        reducer: (current, incoming) => current + incoming,
        cohort: {
          timezone: 'America/Sao_Paulo'
        }
      }
    ]
  }
});
```

| Field option | Description |
| --- | --- |
| `field` | Field name or canonical tracked field |
| `fieldPath` | Optional nested path for dot-notation usage |
| `initialValue` | Initial numeric baseline |
| `reducer` | Custom reducer for consolidation |
| `cohort` | Per-field cohort override |

---

## Consolidation Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mode` | String | `'async'` | `'sync'` (immediate) or `'async'` (eventual) |
| `autoConsolidate` | Boolean | `true` | Auto-consolidation |
| `consolidationInterval` | Number | `60` | Auto-consolidation interval in seconds |
| `consolidationWindow` | Number | `24` | Scan window in hours |

**Example:**
```javascript
new EventualConsistencyPlugin({
  resources: { wallets: ['balance'] },
  mode: 'sync',
  autoConsolidate: true,
  consolidationInterval: 300,
  consolidationWindow: 24
})
```

---

## Analytics Options

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `enableAnalytics` | Boolean | `false` | Enable analytics resources |
| `analyticsConfig.rollupStrategy` | `incremental \| full` | `'incremental'` | How higher periods are rolled up |
| `analyticsConfig.retentionDays` | Number | `365` | Analytics retention horizon |
| `cohort.timezone` | String | `'UTC'` | Cohort bucketing timezone |
| `cohort.granularity` | `hour \| day \| week \| month` | `'hour'` | Default cohort granularity |

**Example:**
```javascript
new EventualConsistencyPlugin({
  resources: { wallets: ['balance'] },
  enableAnalytics: true,
  analyticsConfig: {
    rollupStrategy: 'incremental',
    retentionDays: 365
  },
  cohort: {
    timezone: 'UTC'
  }
})
```

Read [Analytics & History](/plugins/eventual-consistency/guides/analytics-history.md) for the behavior of rollups, raw events, chart queries, and gap filling.

---

## Coordinator, Tickets, and Worker Options

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `enableCoordinator` | Boolean | `true` | Enable distributed coordinator mode |
| `ticketBatchSize` | Number | `100` | Number of records per ticket creation batch |
| `ticketTTL` | Number | `300000` | Ticket TTL in milliseconds |
| `workerClaimLimit` | Number | `1` | How many tickets a worker claims at once |
| `ticketMaxRetries` | Number | `3` | Ticket retry attempts |
| `ticketRetryDelayMs` | Number | `1000` | Delay before retry |
| `ticketScanPageSize` | Number | `100` | Page size when scanning tickets |
| `heartbeatInterval` | Number | `5000` | Coordinator heartbeat interval |
| `heartbeatTTL` | Number | `3` | Coordinator heartbeat TTL multiplier |
| `epochDuration` | Number | `300000` | Coordinator epoch duration |
| `coordinatorWorkInterval` | Number | `60000` | Leader work interval |
| `workerInterval` | Number | `10000` | Worker loop interval |

**Example:**
```javascript
new EventualConsistencyPlugin({
  resources: { wallets: ['balance'] },
  enableCoordinator: true,
  ticketBatchSize: 200,
  workerClaimLimit: 2,
  ticketMaxRetries: 5,
  heartbeatInterval: 3000,
  coordinator: {
    ticketBatchSize: 200,
    workerClaimLimit: 2
  }
})
```

---

## Retention and Cleanup Options

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `transactionRetention` | Number | `7` | Days to retain old transaction history |
| `gcInterval` | Number | `3600` | Garbage collection interval in seconds |
| `analyticsConfig.retentionDays` | Number | `365` | Analytics retention horizon |

These options influence how much history remains available for audit, replay, and dashboard backfills.

---

## Compatibility Aliases

The current runtime still accepts some nested aliases. They are useful for backwards compatibility, but the top-level options above are the clearer source of truth.

| Alias | Canonical option |
| --- | --- |
| `consolidation.mode` | `mode` |
| `consolidation.auto` / `consolidation.autoConsolidate` | `autoConsolidate` |
| `analytics.enabled` | `enableAnalytics` |
| `coordinator.enableCoordinator` | `enableCoordinator` |
| `coordinator.ticketBatchSize` | `ticketBatchSize` |
| `coordinator.workerClaimLimit` | `workerClaimLimit` |

---

## Complete Configuration Example

```javascript
const plugin = new EventualConsistencyPlugin({
  resources: {
    wallets: ['balance'],
    urls: [
      'clicks',
      {
        field: 'views',
        initialValue: 0,
        cohort: { timezone: 'America/Sao_Paulo' }
      }
    ]
  },

  mode: 'async',
  autoConsolidate: true,
  consolidationInterval: 60,
  consolidationWindow: 24,
  transactionRetention: 14,
  gcInterval: 3600,

  enableAnalytics: true,
  analyticsConfig: {
    rollupStrategy: 'incremental',
    retentionDays: 365
  },
  cohort: {
    timezone: 'UTC',
    granularity: 'hour'
  },

  enableCoordinator: true,
  ticketBatchSize: 100,
  workerClaimLimit: 1,
  ticketMaxRetries: 3,
  ticketRetryDelayMs: 1000,
  ticketScanPageSize: 100,
  heartbeatInterval: 5000,
  heartbeatTTL: 3,
  epochDuration: 300000,
  coordinatorWorkInterval: 60000,
  workerInterval: 10000,

  logLevel: 'debug',
  debug: false
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

// Analytics
await plugin.getAnalytics('wallets', 'balance', { period: 'day', startDate: '2025-10-01', endDate: '2025-10-31' })
await plugin.getRawEvents('wallets', 'balance', { recordId: 'w1' })
await plugin.getTopRecords('wallets', 'balance', { period: 'day', date: '2025-10-09' })
```

---

## Resources Created

For each field, the plugin creates:

1. **`plg_{resource}_tx_{field}`** - Transaction log
   - Attributes: `id`, `originalId`, `field`, `value`, `operation`, `timestamp`, `cohortDate`, `cohortHour`, `cohortWeek`, `cohortMonth`, `applied`
   - Partitions: `byOriginalIdAndApplied` (optimized consolidation), `byHour`, `byDay`, `byWeek`, `byMonth`

2. **`plg_{resource}_{field}_tickets`** - Coordinator ticket queue (if coordinator mode enabled)

3. **Locks via PluginStorage** - Distributed locks with automatic TTL

4. **`plg_{resource}_an_{field}`** - Analytics (if enabled)
   - Partitions: `byPeriod`, `byPeriodCohort`, `byFieldPeriod`
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

- [Analytics & History](/plugins/eventual-consistency/guides/analytics-history.md) - Rollups, raw events, chart queries, gap filling
- [Usage Patterns](/plugins/eventual-consistency/guides/usage-patterns.md) - Examples and use cases
- [Best Practices](/plugins/eventual-consistency/guides/best-practices.md) - Troubleshooting and FAQ
