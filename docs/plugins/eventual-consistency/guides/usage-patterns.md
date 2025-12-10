# Usage Patterns

> **In this guide:** Examples for wallets, counters, analytics, and nested fields.

**Navigation:** [← Back to EventualConsistency Plugin](/plugins/eventual-consistency/README.md) | [Configuration](/plugins/eventual-consistency/guides/configuration.md)

---

## Wallet System (Sync Mode)

For critical financial data with immediate consistency:

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

---

## Counters with Increment/Decrement

For login counts, page views, attempts:

```javascript
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

---

## URL Shortener (Async Mode + Analytics)

For high-volume metrics with analytics dashboards:

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

---

## Nested Fields Support

Operate on nested fields inside JSON objects with dot notation:

### Basic Nested Fields

```javascript
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

const url = await urls.get('url-1');
console.log(url.utmResults); // { medium: 5, google: 3 }
```

### Rules and Limits

**1. Nesting Limit After `json`:**
```javascript
// Allowed: 1 level after 'json'
{ utmResults: 'json' }
// → utmResults.medium ✅
// → utmResults.google ✅

// Rejected: 2 levels after 'json'
// → utmResults.medium.google ❌
```

**2. Nested JSON in Objects:**
```javascript
// Allowed: 1 level after nested 'json'
{
  utmResults: {
    $$type: 'object',
    medium: 'json'
  }
}
// → utmResults.medium.google ✅ (1 level after 'json')
// → utmResults.medium.google.ads ❌ (2 levels after 'json')
```

**3. Fully Typed Objects:**
```javascript
// Allowed: any depth explicitly defined
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

### Multiple Independent Nested Paths

Each nested path is consolidated independently:

```javascript
await urls.insert({ id: 'url-1', link: 'https://example.com', utmResults: {} });

// Increment multiple paths
await urls.add('url-1', 'utmResults.medium', 10);
await urls.add('url-1', 'utmResults.source', 5);
await urls.add('url-1', 'utmResults.campaign', 3);

// Each path maintains its own value
const url = await urls.get('url-1');
console.log(url.utmResults); // { medium: 10, source: 5, campaign: 3 }
```

---

## Analytics API

### Query Methods

```javascript
const plugin = db.plugins.find(p => p instanceof EventualConsistencyPlugin);

// Generic query
await plugin.getAnalytics('resource', 'field', { period: 'hour', date: '2025-10-09' });

// Time range breakdown
await plugin.getDayByHour('resource', 'field', '2025-10-09');       // Day → 24 hours
await plugin.getWeekByDay('resource', 'field', '2025-W42');         // Week → 7 days
await plugin.getWeekByHour('resource', 'field', '2025-W42');        // Week → 168 hours
await plugin.getMonthByDay('resource', 'field', '2025-10');         // Month → ~30 days
await plugin.getMonthByHour('resource', 'field', '2025-10');        // Month → ~720 hours
await plugin.getMonthByWeek('resource', 'field', '2025-10');        // Month → 4-5 weeks
await plugin.getYearByDay('resource', 'field', 2025);               // Year → 365/366 days
await plugin.getYearByWeek('resource', 'field', 2025);              // Year → 52-53 weeks
await plugin.getYearByMonth('resource', 'field', 2025);             // Year → 12 months

// Last N periods (convenience)
await plugin.getLastNHours('resource', 'field', 24);
await plugin.getLastNDays('resource', 'field', 7);
await plugin.getLastNWeeks('resource', 'field', 4);
await plugin.getLastNMonths('resource', 'field', 12);

// Top records by volume
await plugin.getTopRecords('resource', 'field', {
  period: 'day',
  cohort: '2025-10-09',
  limit: 10,
  sortBy: 'transactionCount'  // or 'totalValue'
});
```

### Gap Filling

Fill missing periods with zeros for continuous time series:

```javascript
// Without gaps (sparse data only)
const data = await plugin.getLastNHours('urls', 'clicks', 24);

// With gaps (continuous series with zeros)
const data = await plugin.getLastNHours('urls', 'clicks', 24, { fillGaps: true });
```

### Chart-Ready Format

All functions return data ready for charting:

```javascript
[
  {
    cohort: '2025-10-11T14',  // Time identifier (x-axis)
    count: 145,               // Transaction count
    sum: 52834.50,           // Total value (y-axis for bar/area)
    avg: 364.38,             // Average value (y-axis for line)
    min: -500.00,
    max: 10000.00,
    recordCount: 23,
    operations: {
      add: { count: 120, sum: 60000 },
      sub: { count: 25, sum: -7165.50 }
    }
  }
]
```

**Direct chart usage:**
- **Bar charts**: `data.map(d => ({ x: d.cohort, y: d.sum }))`
- **Line charts**: `data.map(d => ({ x: d.cohort, y: d.avg }))`
- **Area charts**: `data.map(d => ({ x: d.cohort, y1: d.operations.add.sum, y2: d.operations.sub.sum }))`

---

## Sync vs Async Mode

### Sync Mode

- Immediate consolidation
- Blocks until complete
- Consistency guarantee
- Slower on high volume

**Use for:** Bank balances, inventory, payments

### Async Mode (Default)

- Eventual consolidation
- Non-blocking
- Periodic auto-consolidation
- High volume (millions of transactions)
- Value may be outdated

**Use for:** Counters, metrics, points, analytics

---

## See Also

- [Configuration](/plugins/eventual-consistency/guides/configuration.md) - All options and API reference
- [Best Practices](/plugins/eventual-consistency/guides/best-practices.md) - Troubleshooting and FAQ
