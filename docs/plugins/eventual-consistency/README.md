# EventualConsistency Plugin

> **Auditable numeric transactions with automatic consolidation and analytics.**

---

## TLDR

Plugin for numeric fields with **auditable transactions** and **pre-calculated analytics** by hour/day/week/month.

**3 lines to get started:**
```javascript
await db.usePlugin(new EventualConsistencyPlugin({ resources: { wallets: ['balance'] } }));
await wallets.insert({ id: 'w1', balance: 0 });
await wallets.add('w1', 'balance', 100);  // Creates transaction and consolidates automatically
```

**Main features:**
- Atomic transactions (add/sub/set) with complete history
- Sync (immediate) or async (eventual) mode with auto-consolidation
- Pre-calculated analytics (hour → day → week → month)
- Optimized partitions (O(1) query by originalId + applied status)
- Nested fields support with dot notation

**When to use:**
- Balances/wallets (sync mode)
- Counters/metrics (async mode)
- Dashboards with pre-calculated analytics

**Access:**
```javascript
const wallet = await wallets.get('w1');
console.log(wallet.balance); // 100

// Analytics
const plugin = db.plugins.find(p => p instanceof EventualConsistencyPlugin);
const stats = await plugin.getLastNDays('wallets', 'balance', 7);
```

---

## Quick Start

```javascript
import { S3db, EventualConsistencyPlugin } from 's3db.js';

const db = new S3db({ connectionString: '...' });
await db.connect();

// Configure plugin
await db.usePlugin(new EventualConsistencyPlugin({
  resources: {
    wallets: ['balance'],
    users: ['points', 'credits']
  },
  consolidation: { mode: 'sync', auto: true }
}));

// Create resource
const wallets = await db.createResource({
  name: 'wallets',
  attributes: {
    id: 'string|required',
    balance: 'number|default:0'
  }
});

// Use
await wallets.insert({ id: 'wallet-1', balance: 0 });
await wallets.add('wallet-1', 'balance', 100);
await wallets.sub('wallet-1', 'balance', 50);

// Or use shorthand methods
await wallets.increment('wallet-1', 'balance'); // +1
await wallets.decrement('wallet-1', 'balance'); // -1

const wallet = await wallets.get('wallet-1');
console.log(wallet.balance); // 50
```

---

## Dependencies

**Zero external dependencies** - built into s3db.js core.

**What's Included:**
- Transaction logging
- Consolidation engine
- Analytics aggregation
- Distributed locking (PluginStorage)
- Cohort partitioning
- Garbage collection

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](/plugins/eventual-consistency/guides/configuration.md) | All options, consolidation, analytics, API reference |
| [Usage Patterns](/plugins/eventual-consistency/guides/usage-patterns.md) | Wallets, counters, analytics, nested fields |
| [Best Practices](/plugins/eventual-consistency/guides/best-practices.md) | Troubleshooting, events, FAQ |

---

## Quick Reference

### Core Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `resources` | Object | **Required** | Map of resource names to field arrays |
| `consolidation.mode` | String | `'async'` | `'sync'` or `'async'` |
| `consolidation.auto` | Boolean | `true` | Auto-consolidation |
| `consolidation.interval` | Number | `300` | Interval in seconds |
| `analytics.enabled` | Boolean | `false` | Enable analytics |
| `analytics.periods` | Array | `['hour', 'day', 'month']` | Time periods |

### Resource Methods

```javascript
await resource.set(id, field, value)     // Set absolute value
await resource.add(id, field, amount)    // Add
await resource.sub(id, field, amount)    // Subtract
await resource.increment(id, field)      // +1
await resource.decrement(id, field)      // -1
await resource.consolidate(id, field)    // Manual consolidate
```

### Analytics API

```javascript
// Last N periods
await plugin.getLastNHours('resource', 'field', 24);
await plugin.getLastNDays('resource', 'field', 7);
await plugin.getLastNWeeks('resource', 'field', 4);
await plugin.getLastNMonths('resource', 'field', 12);

// Time range breakdown
await plugin.getDayByHour('resource', 'field', '2025-10-09');
await plugin.getWeekByDay('resource', 'field', '2025-W42');
await plugin.getMonthByDay('resource', 'field', '2025-10');
await plugin.getYearByMonth('resource', 'field', 2025);
```

### Sync vs Async Mode

| Mode | Use Case | Behavior |
|------|----------|----------|
| **sync** | Wallets, payments | Immediate consolidation, blocks |
| **async** | Counters, metrics | Eventual consolidation, non-blocking |

### Resources Created

For each tracked field:
- `plg_{resource}_tx_{field}` - Transaction log
- `plg_{resource}_an_{field}` - Analytics (if enabled)

---

## How It Works

### 1. Transactions

Every operation creates a transaction:

```javascript
await wallets.add('wallet-1', 'balance', 100);
// Creates: { operation: 'add', value: 100, applied: false }
```

### 2. Consolidation

Applies pending transactions and updates the original field:

```javascript
await wallets.consolidate('wallet-1', 'balance');
// 1. Reads pending transactions
// 2. Applies reducer (sum by default)
// 3. Updates wallet.balance
// 4. Marks transactions as applied: true
```

### 3. Analytics (Optional)

Creates aggregations by period:
- Metrics: count, sum, avg, min, max
- Periods: hour, day, week, month

---

## Important Notes

- **DOES NOT create records**: Transactions remain pending until you create the record
- **Always create record first**: `insert()` before `add()`/`sub()`
- **Nested fields**: Use dot notation for JSON fields (`utmResults.medium`)

---

## See Also

- [Replicator Plugin](/plugins/replicator/README.md) - Replicate to other databases
- [Audit Plugin](/plugins/audit/README.md) - Full audit trail
- [Cache Plugin](/plugins/cache/README.md) - Cache consolidated values
