# EventualConsistencyPlugin

> **Auditable numeric transactions with automatic consolidation and analytics.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

Plugin for numeric fields with **auditable transactions** and **pre-calculated analytics** by hour/day/week/month.

**3 lines to get started:**
```javascript
await db.usePlugin(new EventualConsistencyPlugin({ resources: { wallets: ['balance'] } }));
await wallets.insert({ id: 'w1', balance: 0 });
await wallets.add('w1', 'balance', 100);  // Creates transaction and consolidates automatically
```

**Main features:**
- ✅ Atomic transactions (add/sub/set) with complete history
- ✅ Sync (immediate) or async (eventual) mode with auto-consolidation
- ✅ Pre-calculated analytics (hour → day → **week** → month)
- ✅ Optimized partitions (O(1) query by originalId + applied status)
- ✅ 85.8% test coverage + modular architecture (11 modules)

**When to use:**
- 💰 Balances/wallets (sync mode)
- 📊 Counters/metrics (async mode)
- 📈 Dashboards with pre-calculated analytics

---

## 📋 Table of Contents

- [TL;DR](#-tldr)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Configuration Reference](#-configuration-reference)
- [API](#api)
- [Examples](#examples)
- [Analytics API](#analytics-api)
- [Sync vs Async Mode](#sync-vs-async-mode)
- [Events](#events)
- [FAQ](#-faq)

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

  consolidation: {
    mode: 'sync',  // or 'async'
    auto: true
  }
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

// Or use shorthand methods for +1/-1
await wallets.increment('wallet-1', 'balance'); // +1
await wallets.decrement('wallet-1', 'balance'); // -1

const wallet = await wallets.get('wallet-1');
console.log(wallet.balance); // 50 ✅
```

---

## How It Works

### 1. Transactions
Every operation creates a transaction in `plg_{resource}_tx_{field}`:

```javascript
await wallets.add('wallet-1', 'balance', 100);
// Creates: { operation: 'add', value: 100, applied: false }
```

### 2. Consolidation
Applies pending transactions and **updates the original field**:

```javascript
await wallets.consolidate('wallet-1', 'balance');
// 1. Reads pending transactions
// 2. Applies reducer (sum by default)
// 3. Updates wallet.balance
// 4. Marks transactions as applied: true
```

> **⚠️ IMPORTANT**: The plugin **DOES NOT create records** that don't exist. Transactions remain pending until you create the record.

### 3. Analytics (Optional)
Creates aggregations in `plg_{resource}_an_{field}`:
- Metrics: count, sum, avg, min, max
- Periods: hour, day, month

---

## ⚙️ Configuration Reference

### Core Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `resources` | Object | **Required** | Map of resource names to array of field names to track |
| `verbose` | Boolean | `true` | Enable detailed logging |
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

### Consolidation Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `consolidation.mode` | String | `'async'` | Consolidation mode: `'sync'` (immediate) or `'async'` (eventual) |
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

### Analytics Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `analytics.enabled` | Boolean | `false` | Enable pre-calculated analytics |
| `analytics.periods` | Array&lt;String&gt; | `['hour', 'day', 'month']` | Time periods to calculate: `'hour'`, `'day'`, `'week'`, `'month'` |
| `analytics.metrics` | Array&lt;String&gt; | `['count', 'sum', 'avg', 'min', 'max']` | Metrics to calculate |

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

### Advanced Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `locks.timeout` | Number | `300` | Lock timeout in seconds |
| `garbageCollection.enabled` | Boolean | `true` | Enable garbage collection for old transactions |
| `garbageCollection.interval` | Number | `86400` | GC interval in seconds (24 hours) |
| `garbageCollection.retention` | Number | `30` | Retention days for applied transactions |
| `checkpoints.enabled` | Boolean | `true` | Enable checkpoints for recovery |
| `checkpoints.strategy` | String | `'hourly'` | Checkpoint strategy |
| `checkpoints.retention` | Number | `90` | Checkpoint retention in days |
| `cohort.timezone` | String | `'UTC'` | Timezone for analytics (or use `TZ` env var) |

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

### Complete Configuration Example

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
  verbose: true,
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

## API

### Resource Methods

```javascript
// Set absolute value
await resource.set(id, field, value)

// Add
await resource.add(id, field, amount)

// Subtract
await resource.sub(id, field, amount)

// Increment by 1 (shorthand for add(id, field, 1))
await resource.increment(id, field)

// Decrement by 1 (shorthand for sub(id, field, 1))
await resource.decrement(id, field)

// Consolidate
await resource.consolidate(id, field)

// Get consolidated value (without applying)
await resource.getConsolidatedValue(id, field, options)

// Recalculate from scratch
await resource.recalculate(id, field)
```

---

## Examples

### Wallet System (Sync Mode)

```javascript
await db.usePlugin(new EventualConsistencyPlugin({
  resources: { wallets: ['balance'] },
  consolidation: { mode: 'sync', auto: false }
}));

const wallets = await db.createResource({
  name: 'wallets',
  attributes: {
    id: 'string|required',
    balance: 'number|default:0'
  }
});

await wallets.insert({ id: 'w1', balance: 0 });
await wallets.add('w1', 'balance', 1000);
await wallets.sub('w1', 'balance', 250);

const wallet = await wallets.get('w1');
console.log(wallet.balance); // 750
```

### Counters with Increment/Decrement

```javascript
// Perfect for login counts, page views, attempts, etc.
await db.usePlugin(new EventualConsistencyPlugin({
  resources: { users: ['loginCount', 'remainingAttempts'] },
  consolidation: { mode: 'sync' }
}));

const users = await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    loginCount: 'number|default:0',
    remainingAttempts: 'number|default:3'
  }
});

await users.insert({ id: 'user-1', loginCount: 0, remainingAttempts: 3 });

// Track logins
await users.increment('user-1', 'loginCount');

// Track failed attempts
await users.decrement('user-1', 'remainingAttempts');
await users.decrement('user-1', 'remainingAttempts');

const user = await users.get('user-1');
console.log(user.loginCount);          // 1
console.log(user.remainingAttempts);   // 1
```

### URL Shortener (Async Mode + Analytics)

```javascript
await db.usePlugin(new EventualConsistencyPlugin({
  resources: { urls: ['clicks', 'views'] },

  consolidation: {
    mode: 'async',
    auto: true,
    interval: 60  // 1 minute
  },

  analytics: {
    enabled: true,
    periods: ['hour', 'day', 'month'],
    metrics: ['count', 'sum']
  }
}));

const urls = await db.createResource({
  name: 'urls',
  attributes: {
    id: 'string|required',
    clicks: 'number|default:0',
    views: 'number|default:0'
  }
});

// Hook for auto-increment
const clicks = await db.createResource({ name: 'clicks', ... });
clicks.addHook('afterInsert', async ({ record }) => {
  await urls.add(record.urlId, 'clicks', 1);
});

// Analytics
const plugin = db.plugins.find(p => p instanceof EventualConsistencyPlugin);
const stats = await plugin.getLastNDays('urls', 'clicks', 7);
```

### 🆕 Nested Fields Support

The plugin now supports **dot notation** to operate on nested fields inside JSON objects!

#### How It Works

```javascript
// Create resource with JSON field
const urls = await db.createResource({
  name: 'urls',
  attributes: {
    id: 'string|required',
    link: 'string|required',
    utmResults: 'json'  // JSON field allows nested paths
  }
});

// Use dot notation to increment nested fields
await urls.insert({ id: 'url-1', link: 'https://example.com', utmResults: {} });
await urls.add('url-1', 'utmResults.medium', 5);
await urls.add('url-1', 'utmResults.google', 3);

// Get values
const url = await urls.get('url-1');
console.log(url.utmResults); // { medium: 5, google: 3 }
```

#### Rules and Limits

**1. Nesting Limit After `json`:**

```javascript
// ✅ Allowed: 1 level after 'json'
{ utmResults: 'json' }
// → utmResults.medium ✅
// → utmResults.google ✅

// ❌ Rejected: 2 levels after 'json'
// → utmResults.medium.google ❌
```

**2. Nested JSON in Objects:**

```javascript
// ✅ Allowed: 1 level after nested 'json'
{
  utmResults: {
    $$type: 'object',
    medium: 'json'  // JSON nested in object
  }
}
// → utmResults.medium.google ✅ (1 level after 'json')
// → utmResults.medium.google.ads ❌ (2 levels after 'json')
```

**3. Fully Typed Objects:**

```javascript
// ✅ Allowed: any depth explicitly defined
{
  utmResults: {
    $$type: 'object',
    medium: {
      $$type: 'object',
      google: 'number|default:0'
    }
  }
}
// → utmResults.medium.google ✅ (explicit structure)
```

#### Multiple Independent Nested Paths

Each nested path is consolidated **independently**:

```javascript
await urls.insert({ id: 'url-1', link: 'https://example.com', utmResults: {} });

// Increment multiple paths
await urls.add('url-1', 'utmResults.medium', 10);
await urls.add('url-1', 'utmResults.source', 5);
await urls.add('url-1', 'utmResults.campaign', 3);

// Each path maintains its own value
const url = await urls.get('url-1');
console.log(url.utmResults); // { medium: 10, source: 5, campaign: 3 }

// Incrementing one path doesn't affect others
await urls.add('url-1', 'utmResults.medium', 5);
const url2 = await urls.get('url-1');
console.log(url2.utmResults); // { medium: 15, source: 5, campaign: 3 }
```

#### Analytics with Nested Fields

Analytics **aggregate by root field**, independent of nested path:

```javascript
// All these transactions are aggregated together in analytics:
await urls.add('url-1', 'utmResults.medium', 10);  // → field: 'utmResults'
await urls.add('url-1', 'utmResults.google', 5);   // → field: 'utmResults'
await urls.add('url-1', 'utmResults.facebook', 3); // → field: 'utmResults'

// Analytics show the TOTAL activity on field 'utmResults':
const stats = await plugin.getLastNDays('urls', 'utmResults', 7);
// { count: 3, sum: 18, avg: 6, ... }  ← Total of all transactions
```

**This is correct!** Analytics should show the total volume of activity on the field, not individual values per nested path.

#### Supported Operations

All operations support nested fields:

```javascript
// Set (sets absolute value)
await urls.set('url-1', 'utmResults.clicks', 100);

// Add (increments)
await urls.add('url-1', 'utmResults.clicks', 50);

// Sub (decrements)
await urls.sub('url-1', 'utmResults.clicks', 20);

// Result: 100 + 50 - 20 = 130
const url = await urls.get('url-1');
console.log(url.utmResults.clicks); // 130
```

#### Error Validation

The plugin validates nested paths and returns clear errors:

```javascript
// ❌ Exceed nesting limit
await urls.add('url-1', 'utmResults.medium.google', 5);
// Error: Path "utmResults.medium.google" exceeds 1 level after 'json' field.
//        Maximum nesting after 'json' is 1 level.

// ❌ Field doesn't exist
await urls.add('url-1', 'utmResults.invalid.path', 5);
// Error: Field "invalid" not found in "utmResults"

// ❌ Incompatible type
await urls.add('url-1', 'link.nested', 5);  // 'link' is string, not object
// Error: Field "link" is type "string" and cannot be nested
```

#### Transaction Resource Schema

Internally, transactions store both the root field and nested path:

```javascript
{
  id: 'txn_abc123',
  originalId: 'url-1',
  field: 'utmResults',              // ← Root field (for analytics)
  fieldPath: 'utmResults.medium',   // ← Full path (for consolidation)
  value: 5,
  operation: 'add',
  // ... cohort info ...
}
```

---

## Analytics API

```javascript
const plugin = db.plugins.find(p => p instanceof EventualConsistencyPlugin);

// Generic query
await plugin.getAnalytics('resource', 'field', { period: 'hour', date: '2025-10-09' });

// Time range breakdown (specific period)
await plugin.getDayByHour('resource', 'field', '2025-10-09');       // Day → 24 hours
await plugin.getWeekByDay('resource', 'field', '2025-W42');         // 🆕 Week → 7 days (ISO 8601)
await plugin.getWeekByHour('resource', 'field', '2025-W42');        // 🆕 Week → 168 hours
await plugin.getMonthByDay('resource', 'field', '2025-10');         // Month → ~30 days
await plugin.getMonthByHour('resource', 'field', '2025-10');        // Month → ~720 hours
await plugin.getMonthByWeek('resource', 'field', '2025-10');        // Month → 4-5 weeks
await plugin.getYearByDay('resource', 'field', 2025);               // 🆕 Year → 365/366 days
await plugin.getYearByWeek('resource', 'field', 2025);              // Year → 52-53 weeks
await plugin.getYearByMonth('resource', 'field', 2025);             // Year → 12 months

// Last N periods (convenience functions)
await plugin.getLastNHours('resource', 'field', 24);                // 🆕 Last 24 hours
await plugin.getLastNDays('resource', 'field', 7);                  // Last 7 days
await plugin.getLastNWeeks('resource', 'field', 4);                 // 🆕 Last 4 weeks
await plugin.getLastNMonths('resource', 'field', 12);               // 🆕 Last 12 months

// Top records by volume
await plugin.getTopRecords('resource', 'field', {
  period: 'day',
  cohort: '2025-10-09',
  limit: 10,
  sortBy: 'transactionCount'  // or 'totalValue'
});
```

### Gap Filling

All functions support `fillGaps` option for continuous time series:

```javascript
// Without gaps (sparse data only)
const data = await plugin.getLastNHours('urls', 'clicks', 24);
// Returns only hours with actual data

// With gaps (continuous series with zeros)
const data = await plugin.getLastNHours('urls', 'clicks', 24, { fillGaps: true });
// Returns all 24 hours, filling missing periods with zeros
```

### 🆕 Complete Analytics Functions

The plugin now provides **15 analytics functions** covering all time range and granularity combinations:

#### By Time Range + Granularity

| Function | Time Range | Granularity | Records | Example |
|----------|-----------|-------------|---------|---------|
| `getDayByHour()` | Single day | Hours | 24 | `'2025-10-09'` |
| `getWeekByDay()` | Single week | Days | 7 | `'2025-W42'` |
| `getWeekByHour()` | Single week | Hours | 168 | `'2025-W42'` |
| `getMonthByDay()` | Single month | Days | 28-31 | `'2025-10'` |
| `getMonthByHour()` | Single month | Hours | 672-744 | `'2025-10'` |
| `getMonthByWeek()` | Single month | Weeks | 4-5 | `'2025-10'` |
| `getYearByDay()` | Single year | Days | 365-366 | `2025` |
| `getYearByWeek()` | Single year | Weeks | 52-53 | `2025` |
| `getYearByMonth()` | Single year | Months | 12 | `2025` |

#### Last N Periods (Convenience)

| Function | Description | Default | Example |
|----------|-------------|---------|---------|
| `getLastNHours()` | Last N hours | 24 | Last 24 hours |
| `getLastNDays()` | Last N days | 7 | Last 7 days |
| `getLastNWeeks()` | Last N weeks | 4 | Last 4 weeks |
| `getLastNMonths()` | Last N months | 12 | Last 12 months |

#### Example Usage

```javascript
// Get year breakdown by days (365/366 records)
const yearDays = await plugin.getYearByDay('products', 'sold', 2025);
// [
//   { cohort: '2025-01-01', count: 50, sum: 5000, avg: 100, ... },
//   { cohort: '2025-01-02', count: 75, sum: 7500, avg: 100, ... },
//   ...
//   { cohort: '2025-12-31', count: 100, sum: 10000, avg: 100, ... }
// ]

// Get week breakdown by days (7 records, ISO 8601)
const weekDays = await plugin.getWeekByDay('urls', 'clicks', '2025-W42', { fillGaps: true });
// [
//   { cohort: '2025-10-13', count: 0, sum: 0, ... },  // Monday
//   { cohort: '2025-10-14', count: 150, sum: 1500, ... },
//   ...
//   { cohort: '2025-10-19', count: 200, sum: 2000, ... }  // Sunday
// ]

// Get week breakdown by hours (168 records)
const weekHours = await plugin.getWeekByHour('wallets', 'balance', '2025-W42');

// Get last 24 hours
const last24h = await plugin.getLastNHours('apis', 'requests', 24, { fillGaps: true });

// Get last 4 weeks
const last4Weeks = await plugin.getLastNWeeks('sales', 'revenue', 4);

// Get last 12 months
const last12Months = await plugin.getLastNMonths('users', 'signups', 12, { fillGaps: true });
```

#### Data Format (Chart-Ready)

All functions return the same structure, ready for charting:

```javascript
[
  {
    cohort: '2025-10-11T14',  // Time identifier (x-axis)
    count: 145,                // Transaction count
    sum: 52834.50,            // Total value (y-axis for bar/area charts)
    avg: 364.38,              // Average value (y-axis for line charts)
    min: -500.00,             // Minimum value
    max: 10000.00,            // Maximum value
    recordCount: 23,          // Unique records affected
    operations: {             // Breakdown by operation type
      add: { count: 120, sum: 60000 },
      sub: { count: 25, sum: -7165.50 }
    }
  }
]
```

**Direct chart usage** (no processing needed):
- **Bar charts**: `data.map(d => ({ x: d.cohort, y: d.sum }))`
- **Line charts**: `data.map(d => ({ x: d.cohort, y: d.avg }))`
- **Area charts**: `data.map(d => ({ x: d.cohort, y1: d.operations.add.sum, y2: d.operations.sub.sum }))`
- **Range charts**: `data.map(d => ({ x: d.cohort, min: d.min, max: d.max }))`

### 🆕 Week Analytics (ISO 8601)

The plugin now supports **weekly aggregations (ISO 8601)**:

```javascript
// Get entire year divided by weeks (52-53 weeks)
const yearWeeks = await plugin.getYearByWeek('products', 'sold', 2025);
// [
//   { cohort: '2025-W01', count: 150, sum: 15000, avg: 100, ... },
//   { cohort: '2025-W02', count: 200, sum: 20000, avg: 100, ... },
//   ...
//   { cohort: '2025-W53', count: 100, sum: 10000, avg: 100, ... }
// ]

// Get month divided by weeks (4-5 weeks)
const monthWeeks = await plugin.getMonthByWeek('products', 'views', '2025-10');
// [
//   { cohort: '2025-W40', count: 500, sum: 5000, ... },
//   { cohort: '2025-W41', count: 700, sum: 7000, ... },
//   ...
// ]
```

**ISO 8601 Format:**
- `YYYY-Www` (example: `2025-W42` = week 42 of 2025)
- Week starts on **Monday**
- First week of year contains January 4th
- Years can have 52 or 53 weeks

**Rollup Hierarchy:**
```
Transaction (timestamp)
  ↓
HOUR cohort (2025-10-11T14)
  ↓ rollup
DAY cohort (2025-10-11)
  ↓ rollup (🆕)
WEEK cohort (2025-W42)
  ↓ rollup
MONTH cohort (2025-10)
```

**Analytics Structure:**
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

## Sync vs Async Mode

### Sync Mode
- ✅ Immediate consolidation
- ✅ Blocks until complete
- ✅ Consistency guarantee
- ❌ Slower on high volume

**Use for:** Bank balances, inventory, payments

### Async Mode (Default)
- ✅ Eventual consolidation
- ✅ Non-blocking
- ✅ Periodic auto-consolidation
- ✅ High volume (millions of transactions)
- ❌ Value may be outdated

**Use for:** Counters, metrics, points, analytics

---

## Resources Created

For each field, the plugin creates:

1. **`plg_{resource}_tx_{field}`** - Transaction log
   - Attributes: `id`, `originalId`, `field`, `value`, `operation`, `timestamp`, `cohortDate`, `cohortHour`, **`cohortWeek`**, `cohortMonth`, `applied`
   - Partitions: `byOriginalIdAndApplied` (optimized consolidation), `byHour`, `byDay`, **`byWeek`**, `byMonth`

2. **Locks via PluginStorage** - Distributed locks with automatic TTL (doesn't use resource)

3. **`plg_{resource}_an_{field}`** - Analytics (if enabled)
   - Periods: `hour`, `day`, **`week`**, `month`

---

## Best Practices

### ✅ Recommendations
- Use **sync mode** for critical data (money, inventory)
- Use **async mode** for metrics and counters
- Enable **analytics** for dashboards
- Use **hooks** for auto-increment
- Always **create the record first** before incrementing
- Configure `asyncPartitions: true` on resource (70-100% faster)

### ⚠️ Cautions
- **Batch mode** loses data on crash
- **Custom reducers** must be pure functions
- **Timezone** affects cohort partitioning

---

## Troubleshooting

### Transactions don't consolidate
```javascript
// Check mode
console.log(plugin.config.mode);  // 'async' or 'sync'

// Consolidate manually
await resource.consolidate(id, field);

// Check auto-consolidation
console.log(plugin.config.autoConsolidate);  // true?
```

### Slow performance
```javascript
// Enable async partitions
await db.createResource({
  name: 'wallets',
  asyncPartitions: true  // ← 70-100% faster
});

// ✅ Increase consolidation concurrency
{ consolidation: { concurrency: 10 } }  // default: 5

// ✅ Increase mark applied concurrency
{ consolidation: { markAppliedConcurrency: 100 } }  // default: 50

// Reduce window
{ consolidation: { window: 12 } }  // default: 24h
```

### Missing analytics
```javascript
// Check configuration
console.log(plugin.config.enableAnalytics);

// Check resource created
console.log(db.resources.plg_wallets_an_balance);
```

---

---

## What Changed

### 🎯 Main Changes

1. **Nested Structure**: Config organized in sections (`consolidation`, `analytics`, `locks`, etc)
2. **Multi-Field**: Support for multiple fields per resource
3. **Modular Architecture**: 11 modules instead of 1 monolithic file
4. **Doesn't Create Records**: Plugin doesn't create non-existent records (avoids errors with required fields)
5. **Composite Partition**: 1000x faster query with `byOriginalIdAndApplied`
6. **UTC Timezone**: UTC default instead of automatic detection

### 📦 Architecture

```
src/plugins/eventual-consistency/
├── index.js              # Main class
├── config.js             # Configuration
├── consolidation.js      # Consolidation
├── transactions.js       # Transactions
├── analytics.js          # Analytics
├── locks.js              # Distributed locks
├── garbage-collection.js # GC
├── helpers.js            # add/sub/set
├── setup.js              # Setup
├── utils.js              # Utilities
└── partitions.js         # Partitions
```

### 🔧 Correct Flow

```javascript
// ✅ ALWAYS create the record first
await urls.insert({
  id: 'url-123',
  link: 'https://example.com',
  clicks: 0
});

// ✅ Then increment
await urls.add('url-123', 'clicks', 1);

// ✅ Sync mode consolidates automatically
const url = await urls.get('url-123');
console.log(url.clicks); // 1 ✅
```

---

## New Fixes

### 1. Complete Debug Mode for Troubleshooting

Extensive instrumentation to debug value persistence issues.

#### Problem Investigated

Users reported that `resource.update()` returned `updateOk: true` but the value didn't persist to S3:

```javascript
await urls.add('abc123', 'clicks', 2);
await urls.consolidate('abc123', 'clicks');

const result = await urls.get('abc123');
console.log(result.clicks); // ❌ 0 (expected: 2)
```

#### Solution: Complete Logging

The plugin now shows detailed logs at **THREE moments**:

**1. BEFORE update:**
```javascript
🔥 [DEBUG] BEFORE targetResource.update() {
  originalId: 'abc123',
  field: 'clicks',
  consolidatedValue: 2,
  currentValue: 0
}
```

**2. AFTER update:**
```javascript
🔥 [DEBUG] AFTER targetResource.update() {
  updateOk: true,
  updateErr: undefined,
  updateResult: { clicks: 0 },  // ← Shows actual return!
  hasField: 0
}
```

**3. VERIFICATION (fresh from S3, no cache):**
```javascript
🔥 [DEBUG] VERIFICATION (fresh from S3, no cache) {
  verifyOk: true,
  verifiedRecord[clicks]: 2,
  expectedValue: 2,
  ✅ MATCH: true
}
```

**4. Automatic Bug Detection:**

If the value doesn't match, you'll see:

```javascript
❌ [CRITICAL BUG] Update reported success but value not persisted!
  Resource: urls
  Field: clicks
  Record ID: abc123
  Expected: 2
  Actually got: 0
  This indicates a bug in s3db.js resource.update()
```

#### How to Use

```javascript
// verbose: true is now the default!
const plugin = new EventualConsistencyPlugin({
  resources: { urls: ['clicks'] },
  // Don't need to pass verbose: true (already default)
});

// Or use debug mode for additional logs
const plugin = new EventualConsistencyPlugin({
  resources: { urls: ['clicks'] },
  debug: true
});
```

#### What the Logs Reveal

The logs allow identifying if the problem is in:
- ✅ `resource.update()` returns wrong value but persists correctly → Return bug
- ✅ `resource.update()` returns correctly but doesn't persist → Persistence bug
- ✅ Cache serving stale data → Cache bug
- ✅ S3 eventual consistency → Propagation delay

### 2. Analytics "Field Required" Error Fix

#### Problem

When enabling analytics, the error `InvalidResourceItem: The 'field' field is required` appeared randomly:

```javascript
const plugin = new EventualConsistencyPlugin({
  resources: { urls: ['clicks', 'views'] },
  analytics: { enabled: true }
});

// Random error:
// InvalidResourceItem: The 'field' field is required
```

#### Root Cause

Race condition where multiple handlers share the same mutable `config` object:

```javascript
// Handler 1 (urls.clicks) starts:
this.config.field = 'clicks';

// Handler 2 (urls.views) overwrites concurrently:
this.config.field = 'views';

// Handler 1 tries to insert analytics:
await analyticsResource.insert({
  field: config.field,  // ← 'views' (WRONG! Should be 'clicks')
  // ...
});
// ❌ Error: Record has field='views' but should be 'clicks'
```

#### Solution: Critical Validation

Added validation at the beginning of `updateAnalytics()` that detects when the race condition occurs:

```javascript
import { PluginError } from 's3db.js';

if (!config.field) {
  throw new PluginError('[EventualConsistency] CRITICAL BUG: config.field is undefined in updateAnalytics()', {
    statusCode: 500,
    retriable: true,
    suggestion: 'Investigate concurrent handlers mutating shared config objects; ensure each handler clones the config.',
    metadata: {
      resource: config.resource,
      field: config.field,
      transactionsCount: transactions.length,
      analyticsResource: analyticsResource?.name
    }
  });
}
```

#### Detailed Error Message

Now when the bug occurs, you'll see:

```
CRITICAL BUG: config.field is undefined in updateAnalytics()!
This indicates a race condition in the plugin where multiple handlers
are sharing the same config object.
Config: {"resource":"urls","field":undefined,"verbose":false}
Transactions count: 5
AnalyticsResource: plg_urls_an_clicks
```

This helps identify the exact moment when the race condition happens and which handler was running.

### 3. Verbose Mode Enabled by Default

#### Change

`verbose: true` is the default (before it was `false`).

**Before:**
```javascript
// No logs
const plugin = new EventualConsistencyPlugin({
  resources: { urls: ['clicks'] }
});
```

**Now:**
```javascript
// WITH logs by default
const plugin = new EventualConsistencyPlugin({
  resources: { urls: ['clicks'] }
});

// To disable explicitly:
const plugin = new EventualConsistencyPlugin({
  verbose: false,  // ← Now need to disable explicitly
  resources: { urls: ['clicks'] }
});
```

#### Benefits

- ✅ Debug out-of-the-box (no need to add `verbose: true`)
- ✅ Facilitates troubleshooting in production
- ✅ Aligned with user expectations for critical plugin

### 4. New Option: Debug Mode

In addition to `verbose`, there's now a `debug` option (works the same, but separate):

```javascript
const plugin = new EventualConsistencyPlugin({
  debug: true,    // ← New option (equivalent to verbose)
  verbose: true,  // ← Original option
  resources: { urls: ['clicks'] }
});
```

All logs respond to **both** `verbose` and `debug`:

```javascript
if (config.verbose || config.debug) {
  console.log('🔥 [DEBUG] ...');
}
```

### How to Test the Fixes

#### 1. Test Debug Mode

```javascript
const plugin = new EventualConsistencyPlugin({
  // verbose: true is already the default!
  resources: { urls: ['clicks', 'views'] },
  analytics: { enabled: true }
});

await db.usePlugin(plugin);

// Execute operations and observe logs
await urls.add('test123', 'clicks', 2);
await urls.consolidate('test123', 'clicks');
```

**Expected logs:**
```
🔥 [DEBUG] BEFORE targetResource.update() {...}
🔥 [DEBUG] AFTER targetResource.update() {...}
🔥 [DEBUG] VERIFICATION {...}
```

If you see `❌ [CRITICAL BUG]`, it means the update() bug is happening!

#### 2. Verify Analytics Race Condition

If the analytics error appears:
```
InvalidResourceItem: The 'field' field is required
```

Now you'll see the detailed message:
```
CRITICAL BUG: config.field is undefined in updateAnalytics()!
This indicates a race condition...
Config: {"resource":"urls","field":undefined}
```

This confirms the bug is the shared config race condition.


---

## ❓ FAQ

### For Developers

**Q: What's the difference between sync and async mode?**
**A:**
- **Sync mode**: Consolidation happens immediately when you call `add()`/`sub()`. Good for critical data like wallets/balances where you need immediate accuracy.
- **Async mode**: Consolidation happens eventually (background job every 5 minutes by default). Good for non-critical data like counters/metrics where eventual accuracy is acceptable.

```javascript
// Sync mode (wallets, balances)
new EventualConsistencyPlugin({
  resources: { wallets: ['balance'] },
  consolidation: { mode: 'sync', auto: false }  // Manual control
});

// Async mode (counters, metrics)
new EventualConsistencyPlugin({
  resources: { posts: ['views'] },
  consolidation: { mode: 'async', auto: true, interval: 300 }  // Auto every 5min
});
```

**Q: Does the plugin create records automatically?**
**A:** No! The plugin DOES NOT create records. Transactions remain pending until you create the record manually. This prevents accidental record creation from transactions.

```javascript
// ❌ This won't work - no record exists
await wallets.add('new-wallet-id', 'balance', 100);

// ✅ This works - create record first
await wallets.insert({ id: 'new-wallet-id', balance: 0 });
await wallets.add('new-wallet-id', 'balance', 100);
```

**Q: How do I handle race conditions with concurrent add() calls?**
**A:** The plugin uses transactions to handle concurrency:
1. Each `add()`/`sub()` creates a transaction
2. Consolidation reads all pending transactions
3. All transactions are applied atomically
4. Transactions are marked as applied

This ensures all operations are eventually consistent, even with concurrent calls.

**Q: Can I use nested fields?**
**A:** Yes! Use dot notation for nested paths:

```javascript
new EventualConsistencyPlugin({
  resources: {
    users: ['profile.stats.totalPosts', 'metrics.engagement.likes']
  }
});

await users.add('user-123', 'profile.stats.totalPosts', 1);
```

**Q: How do I query analytics data?**
**A:** Use the analytics API methods:

```javascript
// Last 7 days
const last7Days = await plugin.getLastNPeriods(
  'posts', 'views', 'day', 7
);

// Specific time range
const analytics = await plugin.getAnalyticsByTimeRange(
  'posts', 'views', 'hour',
  { start: '2024-01-01', end: '2024-01-31' }
);

// Chart-ready format
console.log(analytics);
// [{
//   period: '2024-01-01T00:00:00Z',
//   count: 1500,
//   sum: 50000,
//   avg: 33.33
// }, ...]
```

**Q: What's the performance impact of analytics?**
**A:** Analytics are pre-calculated in the background, so queries are O(1) lookups:
- Hour analytics: ~720 records per month per field
- Day analytics: ~30 records per month per field
- Week analytics: ~52 records per year per field
- Month analytics: ~12 records per year per field

Queries are partition-based for fast access.

### For AI Agents

**Q: What problem does this plugin solve?**
**A:** Provides atomic transactions (add/sub/set) for numeric fields with complete audit trail, eventual consistency guarantees, and pre-calculated time-series analytics by hour/day/week/month.

**Q: What are the minimum required parameters?**
**A:** Only `resources` is required:

```javascript
new EventualConsistencyPlugin({
  resources: { wallets: ['balance'] }
})
```

All other options have sensible defaults.

**Q: What are the default values for all configurations?**
**A:**
```javascript
{
  resources: {},              // Required
  consolidation: {
    mode: 'async',            // Eventual consolidation
    auto: true,               // Auto-consolidate
    interval: 300,            // Every 5 minutes
    window: 24,               // Last 24 hours
    concurrency: 5,           // 5 parallel consolidations
    markAppliedConcurrency: 50
  },
  analytics: {
    enabled: false,           // Disabled by default
    periods: ['hour', 'day', 'month'],
    metrics: ['count', 'sum', 'avg', 'min', 'max']
  },
  verbose: true,              // Logging enabled
  debug: false,
  locks: { timeout: 300 },
  garbageCollection: { enabled: true, interval: 86400, retention: 30 },
  checkpoints: { enabled: true, strategy: 'hourly', retention: 90 },
  cohort: { timezone: 'UTC' }
}
```

**Q: What events does this plugin emit?**
**A:** The plugin doesn't emit custom events. It uses standard s3db resource events (insert, update, delete) on the 3 created resources:
- `plg_{resource}_tx_{field}` - Transaction resource
- `plg_{resource}_an_{field}` - Analytics resource (if enabled)
- Original resource - Updated values after consolidation

**Q: How do I debug issues with this plugin?**
**A:** Enable verbose logging (enabled by default):

```javascript
const plugin = new EventualConsistencyPlugin({
  verbose: true,    // Already default
  debug: true,      // Additional debug info
  resources: { wallets: ['balance'] }
});
```

All operations will log detailed information to console.

**Q: What resources are created automatically?**
**A:** For each tracked field, the plugin creates:
1. **Transaction resource**: `plg_{resourceName}_tx_{fieldName}` - Stores all add/sub/set transactions
2. **Analytics resource** (if enabled): `plg_{resourceName}_an_{fieldName}` - Pre-calculated time-series data

Example for `wallets.balance`:
- `plg_wallets_tx_balance` - All balance transactions
- `plg_wallets_an_balance` - Balance analytics (if enabled)

**Q: Can I use custom reducers?**
**A:** Yes! The default reducer is `sum`, but you can implement custom logic:

```javascript
import { ValidationError } from 's3db.js';

// The consolidation process:
// 1. Fetches all pending transactions
// 2. Applies reducer (sum by default)
// 3. Updates original field
// 4. Marks transactions as applied

// For custom behavior, use hooks:
await db.createResource({
  name: 'wallets',
  hooks: {
    beforeUpdate: [(data) => {
      // Custom validation or transformation
      if (data.balance < 0) {
        throw new ValidationError('Balance cannot be negative', {
          statusCode: 422,
          retriable: false,
          suggestion: 'Ensure debits do not exceed credits before updating wallets.balance.',
          metadata: { attemptedBalance: data.balance }
        });
      }
      return data;
    }]
  }
});
```

---

## Events

The EventualConsistencyPlugin emits the following events that you can listen to:

### `plg:eventual-consistency:started`

Emitted when consolidation or garbage collection starts for a resource/field.

```javascript
plugin.on('plg:eventual-consistency:started', (data) => {
  console.log(`Started for ${data.resource}.${data.field}`);
  console.log(`Cohort config:`, data.cohort);
});
```

**Payload:**
- `resource` (string): Resource name
- `field` (string): Field name
- `cohort` (object): Cohort configuration

### `plg:eventual-consistency:stopped`

Emitted when consolidation/garbage collection stops for a resource/field.

```javascript
plugin.on('plg:eventual-consistency:stopped', (data) => {
  console.log(`Stopped for ${data.resource}.${data.field}`);
});
```

**Payload:**
- `resource` (string): Resource name
- `field` (string): Field name

### `plg:eventual-consistency:consolidated`

Emitted after each successful consolidation run.

```javascript
plugin.on('plg:eventual-consistency:consolidated', (data) => {
  console.log(`Consolidated ${data.recordCount} records in ${data.duration}ms`);
  console.log(`Success: ${data.successCount}, Errors: ${data.errorCount}`);
});
```

**Payload:**
- `resource` (string): Resource name
- `field` (string): Field name
- `recordCount` (number): Total records processed
- `successCount` (number): Successfully consolidated records
- `errorCount` (number): Failed records
- `duration` (number): Duration in milliseconds

### `plg:eventual-consistency:consolidation-error`

Emitted when consolidation encounters an error.

```javascript
plugin.on('plg:eventual-consistency:consolidation-error', (error) => {
  console.error('Consolidation error:', error);
});
```

**Payload:**
- `error` (Error): The error object

### `plg:eventual-consistency:gc-completed`

Emitted after garbage collection completes.

```javascript
plugin.on('plg:eventual-consistency:gc-completed', (data) => {
  console.log(`GC deleted ${data.deletedCount} old transactions`);
});
```

**Payload:**
- `resource` (string): Resource name
- `field` (string): Field name
- `deletedCount` (number): Number of transactions deleted
- `errorCount` (number): Number of errors during deletion

### `plg:eventual-consistency:gc-error`

Emitted when garbage collection encounters an error.

```javascript
plugin.on('plg:eventual-consistency:gc-error', (error) => {
  console.error('GC error:', error);
});
```

**Payload:**
- `error` (Error): The error object

---

## See Also

- [Replicator Plugin](./replicator.md) - Replicate to other databases
- [Audit Plugin](./audit.md) - Audit trail
- [Cache Plugin](./cache.md) - Cache consolidated values
