# 🔄 Eventual Consistency Plugin

<p align="center">
  <strong>Implement eventual consistency for numeric fields with transaction history</strong><br>
  <em>Perfect for counters, balances, points, and other accumulator fields</em>
</p>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Installation & Setup](#installation--setup)
- [API Reference](#api-reference)
- [📊 Analytics API](#-analytics-api) ⭐ **NEW**
- [Configuration Options](#configuration-options)
- [Usage Examples](#usage-examples)
- [Advanced Patterns](#advanced-patterns)
- [Best Practices](#best-practices)

---

## Overview

The Eventual Consistency Plugin provides a robust solution for managing numeric fields that require:
- **Transaction history** - Every change is recorded
- **Atomic operations** - Add, subtract, and set operations
- **Eventual consistency** - Asynchronous consolidation of values
- **Partition support** - Time-based cohorts for efficient querying
- **Custom reducers** - Flexible consolidation logic

> **Important**: This plugin uses explicit methods (`add`, `sub`, `set`, `consolidate`) instead of intercepting regular insert/update operations. This design provides better control and predictability.
>
> **Multi-field Support**: When multiple fields have eventual consistency on the same resource, the field parameter becomes required in method calls. With a single field, the field parameter is optional for cleaner syntax.

### How It Works

1. **Explicit Operations**: Instead of direct updates, use `add()`, `sub()`, and `set()` methods
2. **Transaction Log**: All operations create transactions in a dedicated resource (`{resource}_transactions_{field}`)
3. **Consolidation**: Transactions are periodically consolidated into the final value
4. **Flexibility**: Choose between sync (immediate) or async (eventual) consistency
5. **Deferred Setup**: Plugin can be added before the target resource exists

---

## Key Features

### 🎯 Core Features
- **Atomic Operations**: `add()`, `sub()`, `set()` with distributed locking
- **Transaction History**: Complete audit trail of all changes
- **Flexible Modes**: Sync (immediate) or Async (eventual) consistency
- **Custom Reducers**: Define how transactions consolidate
- **Time-based Partitions**: Automatic day and month partitions for efficient querying
- **📊 Analytics API**: Pre-calculated transaction analytics for instant reporting ⭐ **NEW**

### 🔧 Technical Features
- **Distributed Locking**: Prevents race conditions in concurrent consolidation
- **Non-blocking**: Operations don't interfere with normal CRUD
- **Batch Support**: Batch multiple transactions for efficiency with parallel inserts
- **Auto-consolidation**: Periodic background consolidation with configurable concurrency
- **Dual Partitions**: Both `byDay` and `byMonth` partitions for flexible querying
- **Timezone Support**: Cohorts respect local timezone for accurate daily/monthly grouping
- **Deferred Setup**: Works with resources created before or after plugin initialization
- **Zero Duplication**: Guaranteed unique transaction IDs using nanoid

### 🚀 Performance Improvements
- **Parallel Consolidation**: Process multiple records concurrently (configurable)
- **Parallel Transaction Inserts**: Batch operations execute in parallel
- **Lock-based Atomicity**: Prevents duplicate consolidation without blocking reads

---

## Installation & Setup

```javascript
import { S3db, EventualConsistencyPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET/path"
});

await s3db.connect();

// Option 1: Add plugin before resource exists (deferred setup)
const plugin = new EventualConsistencyPlugin({
  resource: 'wallets',  // Resource doesn't exist yet
  field: 'balance',
  mode: 'async',
  cohort: {
    timezone: 'America/Sao_Paulo'  // Optional, defaults to UTC
  }
});

await s3db.usePlugin(plugin); // Plugin waits for resource

// Create resource - plugin automatically sets up
const walletsResource = await s3db.createResource({
  name: 'wallets',
  attributes: {
    id: 'string|required',
    userId: 'string|required',
    balance: 'number|required',
    currency: 'string|required'
  }
});

// Methods are now available
await walletsResource.add('wallet-1', 100);

// Option 2: Add plugin after resource exists
// const resource = await s3db.createResource({ ... });
// const plugin = new EventualConsistencyPlugin({ ... });
// await s3db.usePlugin(plugin); // Immediate setup
```

---

## API Reference

### Constructor Options

```javascript
new EventualConsistencyPlugin({
  // Required
  resource: 'resourceName',     // Name of the resource
  field: 'fieldName',           // Numeric field to manage

  // Optional
  mode: 'async',                      // 'async' (default) or 'sync'
  autoConsolidate: true,              // Enable auto-consolidation
  consolidationInterval: 300,         // Consolidation interval (seconds, default: 300 = 5min)
  consolidationWindow: 24,            // Hours to look back for consolidation (default: 24h)
  consolidationConcurrency: 5,        // Parallel consolidation limit (default: 5)
  lateArrivalStrategy: 'warn',        // 'ignore', 'warn' (default), or 'process'
  lockTimeout: 300,                   // Lock timeout (seconds, default: 300 = 5min)
  transactionRetention: 30,           // Days to keep applied transactions (default: 30)
  gcInterval: 86400,                  // Garbage collection interval (seconds, default: 86400 = 24h)

  // Cohort configuration
  cohort: {
    timezone: 'America/Sao_Paulo'     // Timezone for cohorts (auto-detected or UTC)
  },

  // Batching
  batchTransactions: false,     // Enable transaction batching
  batchSize: 100,              // Batch size before flush

  // Custom reducer
  reducer: (transactions) => {
    // Custom consolidation logic
    // Note: Transactions may include synthetic transactions with { synthetic: true }
    return transactions.reduce((sum, t) => {
      if (t.operation === 'set') return t.value;
      if (t.operation === 'add') return sum + t.value;
      if (t.operation === 'sub') return sum - t.value;
      return sum;
    }, 0);
  },

  // Analytics configuration (NEW in v10.1.0)
  enableAnalytics: false,           // Enable pre-calculated analytics
  analyticsConfig: {
    periods: ['hour', 'day', 'month'],  // Which aggregations to create
    metrics: ['count', 'sum', 'avg', 'min', 'max'],  // Metrics to calculate
    rollupStrategy: 'incremental',   // 'incremental' or 'batch'
    retentionDays: 365              // Days to keep analytics (default: 365)
  }
});
```

### Generated Methods

The plugin adds these methods to your resource. The method signatures adapt based on the number of fields with eventual consistency:

#### Single Field Syntax
When only **one** field has eventual consistency, the field parameter is optional:

```javascript
// Simple, clean syntax for single field
await wallets.set('wallet-123', 1000);     // Set to 1000
await wallets.add('wallet-123', 50);       // Add 50
await wallets.sub('wallet-123', 25);       // Subtract 25
await wallets.consolidate('wallet-123');   // Consolidate
```

#### Multiple Fields Syntax
When **multiple** fields have eventual consistency, the field parameter is **required**:

```javascript
// Must specify which field when multiple exist
await accounts.set('acc-1', 'balance', 1000);   // Set balance
await accounts.add('acc-1', 'points', 100);     // Add points
await accounts.sub('acc-1', 'credits', 50);     // Subtract credits
await accounts.consolidate('acc-1', 'balance'); // Consolidate specific field
```

#### Method Reference

##### `set(id, [field], value)`
Sets the absolute value of the field.
- **Single field**: `set(id, value)`
- **Multiple fields**: `set(id, field, value)`

##### `add(id, [field], amount)`
Adds to the current value.
- **Single field**: `add(id, amount)`
- **Multiple fields**: `add(id, field, amount)`

##### `sub(id, [field], amount)`
Subtracts from the current value.
- **Single field**: `sub(id, amount)`
- **Multiple fields**: `sub(id, field, amount)`

##### `consolidate(id, [field])`
Manually triggers consolidation.
- **Single field**: `consolidate(id)`
- **Multiple fields**: `consolidate(id, field)`

---

## 📊 Analytics API

**New in v10.1.0**: Pre-calculated transaction analytics for instant reporting without scanning millions of transactions.

### Overview

The Analytics API automatically aggregates transaction data during consolidation, providing:

- **📈 Pre-calculated metrics**: count, sum, avg, min, max
- **🔄 Hierarchical roll-ups**: hour → day → month
- **⚡ O(1) queries**: Instant reports vs O(n) transaction scans
- **🎯 Operation breakdowns**: Statistics by add/sub/set operations
- **🏆 Top N analysis**: Highest volume records by count or value
- **💾 Efficient storage**: 24 records/day vs 1000s of transactions

### Enable Analytics

```javascript
new EventualConsistencyPlugin({
  resource: 'wallets',
  field: 'balance',

  // Enable analytics
  enableAnalytics: true,
  analyticsConfig: {
    periods: ['hour', 'day', 'month'],  // Which aggregations to create
    metrics: ['count', 'sum', 'avg', 'min', 'max'],
    rollupStrategy: 'incremental',  // 'incremental' or 'batch'
    retentionDays: 365  // Keep analytics for 1 year
  }
})
```

### Analytics Resource

When enabled, creates `{resource}_analytics_{field}` with this structure:

```javascript
{
  id: 'hour-2025-10-09T14',
  period: 'hour',  // 'hour', 'day', or 'month'
  cohort: '2025-10-09T14',  // ISO format timestamp

  // Pre-calculated metrics
  transactionCount: 150,
  totalValue: 5000,
  avgValue: 33.33,
  minValue: -100,
  maxValue: 500,

  // Operation breakdown
  operations: {
    add: { count: 120, sum: 6000 },
    sub: { count: 30, sum: -1000 },
    set: { count: 0, sum: 0 }
  },

  // Metadata
  recordCount: 45,  // Distinct originalIds
  consolidatedAt: '2025-10-09T14:55:00Z',
  updatedAt: '2025-10-09T14:55:00Z'
}
```

### Query Analytics

#### `getAnalytics(resourceName, field, options)`

Get aggregated analytics for a period:

```javascript
const plugin = s3db.plugins.find(p => p instanceof EventualConsistencyPlugin);

// Hourly analytics for a specific day
const hourly = await plugin.getAnalytics('wallets', 'balance', {
  period: 'hour',
  date: '2025-10-09'
});

console.log('Hourly stats:', hourly);
// [
//   { cohort: '2025-10-09T00', count: 50, sum: 1000, avg: 20, min: -10, max: 100 },
//   { cohort: '2025-10-09T01', count: 30, sum: 600, avg: 20, min: 5, max: 50 },
//   ...
// ]

// Daily analytics for a date range
const daily = await plugin.getAnalytics('wallets', 'balance', {
  period: 'day',
  startDate: '2025-10-01',
  endDate: '2025-10-31'
});

console.log(`October had ${daily.length} days with transactions`);

// Monthly analytics for a year
const monthly = await plugin.getAnalytics('wallets', 'balance', {
  period: 'month',
  year: 2025
});

console.log('Monthly totals:', monthly.map(m => ({
  month: m.cohort,
  transactions: m.count,
  totalValue: m.sum
})));
// [
//   { month: '2025-01', transactions: 15000, totalValue: 300000 },
//   { month: '2025-02', transactions: 14000, totalValue: 280000 },
//   ...
// ]
```

#### Operation Breakdown

Get statistics by operation type (add/sub/set):

```javascript
const operations = await plugin.getAnalytics('wallets', 'balance', {
  period: 'day',
  date: '2025-10-09',
  breakdown: 'operations'
});

console.log('Operation breakdown:', operations[0]);
// {
//   cohort: '2025-10-09',
//   add: { count: 400, sum: 8000 },
//   sub: { count: 100, sum: -2000 },
//   set: { count: 5, sum: 5000 }
// }
```

#### `getTopRecords(resourceName, field, options)`

Find top N records by volume:

```javascript
// Top 10 wallets by transaction count
const topByCount = await plugin.getTopRecords('wallets', 'balance', {
  period: 'day',
  date: '2025-10-09',
  metric: 'transactionCount',
  limit: 10
});

console.log('Most active wallets:', topByCount);
// [
//   { recordId: 'wallet-123', count: 50, sum: 1000 },
//   { recordId: 'wallet-456', count: 45, sum: 900 },
//   ...
// ]

// Top 10 wallets by total value
const topByValue = await plugin.getTopRecords('wallets', 'balance', {
  period: 'day',
  date: '2025-10-09',
  metric: 'totalValue',
  limit: 10
});

console.log('Highest value wallets:', topByValue);
// [
//   { recordId: 'wallet-789', count: 10, sum: 50000 },
//   { recordId: 'wallet-101', count: 25, sum: 25000 },
//   ...
// ]
```

### Helper Methods for Common Patterns

The plugin provides convenient helper methods for common granularity queries.

**🎨 Chart-Ready Data with `fillGaps`**

All helper methods support a `fillGaps` option to create continuous time series perfect for charts:

```javascript
// Without fillGaps (sparse data - only periods with transactions)
const data = await plugin.getMonthByDay('wallets', 'balance', '2025-10');
// Returns: [{ cohort: '2025-10-01', ... }, { cohort: '2025-10-05', ... }]
// Missing: days 2, 3, 4

// With fillGaps (continuous data - all periods filled with zeros)
const chartData = await plugin.getMonthByDay('wallets', 'balance', '2025-10', {
  fillGaps: true
});
// Returns: All 31 days, missing days have count: 0, sum: 0
// Ready for Chart.js, D3.js, etc.
```

**Benefits:**
- ✅ No gaps in time series
- ✅ Direct use in charting libraries
- ✅ Consistent array length (predictable)
- ✅ Missing periods filled with zeros

#### `getMonthByDay(resourceName, field, month, options)`

Get entire month broken down by days:

```javascript
// October 2025, day by day (sparse - only days with transactions)
const octoberByDay = await plugin.getMonthByDay('wallets', 'balance', '2025-10');

// October 2025, day by day (continuous - all 31 days, gaps filled with zeros)
const chartData = await plugin.getMonthByDay('wallets', 'balance', '2025-10', {
  fillGaps: true  // Perfect for charts!
});

console.log('October day by day:');
chartData.forEach(day => {
  console.log(`${day.cohort}: ${day.count} txns, $${day.sum}`);
});
// Output (guaranteed 31 days):
// 2025-10-01: 150 txns, $5000
// 2025-10-02: 0 txns, $0       ← Filled gap
// 2025-10-03: 120 txns, $4100
// ...
// 2025-10-31: 95 txns, $3200
```

#### `getDayByHour(resourceName, field, date, options)`

Get entire day broken down by hours:

```javascript
// Today, hour by hour (all 24 hours, gaps filled)
const today = new Date().toISOString().substring(0, 10);
const todayByHour = await plugin.getDayByHour('wallets', 'balance', today, {
  fillGaps: true  // Get all 24 hours
});

console.log('Today hour by hour:');
todayByHour.forEach(hour => {
  const time = hour.cohort.substring(11);  // Extract hour
  console.log(`${time}:00 - ${hour.count} txns, $${hour.sum}`);
});
// Output (guaranteed 24 hours):
// 00:00 - 12 txns, $500
// 01:00 - 0 txns, $0       ← No activity
// 02:00 - 5 txns, $150
// ...
// 23:00 - 8 txns, $400
```

#### `getLastNDays(resourceName, field, days, options)`

Get last N days, broken down by days:

```javascript
// Last 7 days, day by day (all 7 days guaranteed)
const last7Days = await plugin.getLastNDays('wallets', 'balance', 7, {
  fillGaps: true  // Perfect for weekly charts
});

console.log('Last 7 days:');
last7Days.forEach(day => {
  console.log(`${day.cohort}: ${day.count} txns, $${day.sum}`);
});
// Output (guaranteed 7 days):
// 2025-10-03: 45 txns, $2000
// 2025-10-04: 0 txns, $0       ← Weekend, no activity
// 2025-10-05: 0 txns, $0       ← Weekend, no activity
// 2025-10-06: 120 txns, $5500
// ...

// Last 30 days (all 30 days)
const last30Days = await plugin.getLastNDays('wallets', 'balance', 30, {
  fillGaps: true
});
```

#### `getYearByMonth(resourceName, field, year, options)`

Get entire year broken down by months:

```javascript
// 2025, month by month (all 12 months guaranteed)
const year2025 = await plugin.getYearByMonth('wallets', 'balance', 2025, {
  fillGaps: true  // All 12 months, even if no transactions
});

console.log('2025 month by month:');
year2025.forEach(month => {
  console.log(`${month.cohort}: ${month.count} txns, $${month.sum}`);
});
// Output (guaranteed 12 months):
// 2025-01: 15000 txns, $300000
// 2025-02: 14000 txns, $280000
// 2025-03: 0 txns, $0           ← No activity
// ...
// 2025-12: 18000 txns, $350000
```

#### `getMonthByHour(resourceName, field, month, options)`

Get entire month broken down by hours:

```javascript
// October 2025, hour by hour (all 744 hours = 24×31)
const octoberByHour = await plugin.getMonthByHour('wallets', 'balance', '2025-10', {
  fillGaps: true  // Perfect for detailed monthly charts
});

console.log('October 2025 hour by hour:');
octoberByHour.slice(0, 24).forEach(hour => {  // First day
  console.log(`${hour.cohort}: ${hour.count} txns, $${hour.sum}`);
});
// Output (744 hours total):
// 2025-10-01T00: 12 txns, $500
// 2025-10-01T01: 0 txns, $0     ← Night time
// 2025-10-01T02: 0 txns, $0
// ...
// 2025-10-31T23: 15 txns, $800

// Or use 'last' for previous month
const lastMonthByHour = await plugin.getMonthByHour('wallets', 'balance', 'last', {
  fillGaps: true
});
console.log(`Last month: ${lastMonthByHour.length} hours`);  // 672-744 depending on month
```

**Note**: With `fillGaps: true`, this returns exactly 744 hours for 31-day months (696 for February, etc.). Perfect for continuous time series but large data set.

### Chart Integration Examples

The `fillGaps` option makes it trivial to integrate with popular charting libraries:

#### Chart.js Integration

```javascript
// Get chart-ready data
const last30Days = await plugin.getLastNDays('wallets', 'balance', 30, {
  fillGaps: true  // Continuous data
});

// Prepare Chart.js data
const chartData = {
  labels: last30Days.map(d => d.cohort),  // ['2025-10-01', '2025-10-02', ...]
  datasets: [{
    label: 'Transaction Count',
    data: last30Days.map(d => d.count),   // [150, 0, 120, ...]
    borderColor: 'rgb(75, 192, 192)',
    tension: 0.1
  }, {
    label: 'Total Value',
    data: last30Days.map(d => d.sum),     // [5000, 0, 4100, ...]
    borderColor: 'rgb(255, 99, 132)',
    yAxisID: 'y1'
  }]
};

// Create chart
new Chart(ctx, {
  type: 'line',
  data: chartData,
  options: {
    responsive: true,
    scales: {
      y: { type: 'linear', position: 'left' },
      y1: { type: 'linear', position: 'right' }
    }
  }
});
```

#### Recharts (React) Integration

```jsx
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';

function TransactionChart() {
  const [data, setData] = useState([]);

  useEffect(() => {
    async function loadData() {
      const plugin = s3db.plugins.find(p => p instanceof EventualConsistencyPlugin);
      const analytics = await plugin.getLastNDays('wallets', 'balance', 30, {
        fillGaps: true  // No gaps in chart
      });
      setData(analytics);  // Direct use!
    }
    loadData();
  }, []);

  return (
    <LineChart width={800} height={400} data={data}>
      <XAxis dataKey="cohort" />
      <YAxis />
      <Tooltip />
      <Legend />
      <Line type="monotone" dataKey="count" stroke="#8884d8" name="Transactions" />
      <Line type="monotone" dataKey="sum" stroke="#82ca9d" name="Total Value" />
    </LineChart>
  );
}
```

#### D3.js Integration

```javascript
// Get chart-ready data
const hourlyData = await plugin.getDayByHour('wallets', 'balance', '2025-10-09', {
  fillGaps: true  // All 24 hours
});

// D3 setup
const margin = {top: 20, right: 20, bottom: 30, left: 50};
const width = 960 - margin.left - margin.right;
const height = 500 - margin.top - margin.bottom;

const x = d3.scaleTime()
  .domain(d3.extent(hourlyData, d => new Date(d.cohort)))
  .range([0, width]);

const y = d3.scaleLinear()
  .domain([0, d3.max(hourlyData, d => d.count)])
  .range([height, 0]);

const line = d3.line()
  .x(d => x(new Date(d.cohort)))
  .y(d => y(d.count));

// Draw chart
svg.append("path")
  .datum(hourlyData)
  .attr("class", "line")
  .attr("d", line);
```

#### ApexCharts Integration

```javascript
// Get chart-ready data
const monthData = await plugin.getMonthByDay('wallets', 'balance', '2025-10', {
  fillGaps: true  // All 31 days
});

// ApexCharts configuration
const options = {
  chart: { type: 'area', height: 350 },
  series: [{
    name: 'Transactions',
    data: monthData.map(d => d.count)
  }, {
    name: 'Total Value',
    data: monthData.map(d => d.sum)
  }],
  xaxis: {
    categories: monthData.map(d => d.cohort),
    type: 'datetime'
  }
};

const chart = new ApexCharts(document.querySelector("#chart"), options);
chart.render();
```

#### Real-Time Dashboard Pattern

```javascript
// Update dashboard every minute
setInterval(async () => {
  const plugin = s3db.plugins.find(p => p instanceof EventualConsistencyPlugin);

  // Today's hourly breakdown
  const today = new Date().toISOString().substring(0, 10);
  const hourlyData = await plugin.getDayByHour('wallets', 'balance', today, {
    fillGaps: true  // All 24 hours, current hour included
  });

  // Update Chart.js
  myChart.data.labels = hourlyData.map(d => d.cohort.substring(11) + ':00');
  myChart.data.datasets[0].data = hourlyData.map(d => d.count);
  myChart.update();
}, 60000);  // Every minute
```

### Manual Granularity Control

For custom date ranges, use `getAnalytics` directly:

```javascript
// Custom week (Mon-Sun)
const weeklyStats = await plugin.getAnalytics('wallets', 'balance', {
  period: 'day',
  startDate: '2025-10-07',  // Monday
  endDate: '2025-10-13'     // Sunday
});

// Custom hours (9am-5pm)
const businessHours = await plugin.getAnalytics('wallets', 'balance', {
  period: 'hour',
  date: '2025-10-09'
});
const filtered = businessHours.filter(h => {
  const hour = parseInt(h.cohort.substring(11, 13));
  return hour >= 9 && hour <= 17;
});

// Quarter (3 months)
const q4 = await plugin.getAnalytics('wallets', 'balance', {
  period: 'month',
  startDate: '2025-10',
  endDate: '2025-12'
});
```

### Use Cases

**📊 Transaction Reports**
```javascript
// Daily summary report
const today = new Date().toISOString().substring(0, 10);
const dailyStats = await plugin.getAnalytics('wallets', 'balance', {
  period: 'day',
  date: today
});

const report = dailyStats[0];
console.log(`
Daily Transaction Report - ${report.cohort}
${'='.repeat(50)}
Total Transactions: ${report.count}
Total Value: $${report.sum}
Average Transaction: $${report.avg.toFixed(2)}
Largest Transaction: $${report.max}
Smallest Transaction: $${report.min}
`);
```

**📈 Trend Analysis**
```javascript
// Weekly trend
const last7Days = Array.from({ length: 7 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - i);
  return date.toISOString().substring(0, 10);
}).reverse();

const weekData = await plugin.getAnalytics('wallets', 'balance', {
  period: 'day',
  startDate: last7Days[0],
  endDate: last7Days[6]
});

console.log('7-Day Trend:');
weekData.forEach(day => {
  console.log(`${day.cohort}: ${day.count} txns ($${day.sum})`);
});
```

**🏆 Top Customer Analysis**
```javascript
// Monthly top customers
const topCustomers = await plugin.getTopRecords('wallets', 'balance', {
  period: 'month',
  date: '2025-10',
  metric: 'totalValue',
  limit: 20
});

console.log('Top 20 Customers by Value (October):');
topCustomers.forEach((customer, idx) => {
  console.log(`${idx + 1}. ${customer.recordId}: $${customer.sum} (${customer.count} txns)`);
});
```

**💡 Operation Insights**
```javascript
// Analyze deposit vs withdrawal patterns
const ops = await plugin.getAnalytics('wallets', 'balance', {
  period: 'month',
  month: '2025-10',
  breakdown: 'operations'
});

const { add, sub } = ops[0];
console.log(`
October Operation Insights:
${'='.repeat(50)}
Deposits (add):
  Count: ${add.count}
  Total: $${add.sum}
  Average: $${(add.sum / add.count).toFixed(2)}

Withdrawals (sub):
  Count: ${sub.count}
  Total: $${Math.abs(sub.sum)}
  Average: $${Math.abs(sub.sum / sub.count).toFixed(2)}

Net Flow: $${add.sum + sub.sum}
`);
```

### Performance Benefits

**Before Analytics (Slow):**
```javascript
// Scan all transactions ❌
const transactions = await transactionsResource.list();
const dailyTxns = transactions.filter(t => t.cohortDate === today);
const totalValue = dailyTxns.reduce((sum, t) => sum + t.value, 0);
// Time: 180ms+ (scales with transaction count)
```

**With Analytics (Fast):**
```javascript
// Pre-calculated aggregation ✅
const stats = await plugin.getAnalytics('wallets', 'balance', {
  period: 'day',
  date: today
});
const totalValue = stats[0].sum;
// Time: 2ms (constant, regardless of transaction count)
```

**Scaling Comparison:**

| Transactions | Direct Scan | Analytics | Speedup |
|-------------|-------------|-----------|---------|
| 1,000 | 50ms | 2ms | 25x |
| 10,000 | 180ms | 2ms | 90x |
| 100,000 | 1,800ms | 2ms | 900x |
| 1,000,000 | 18,000ms | 2ms | 9,000x |

### Best Practices

**1. Enable analytics for high-volume fields**

```javascript
// Good: High transaction volume
enableAnalytics: true  // For wallets, points, usage counters

// Skip: Low volume
enableAnalytics: false  // For infrequent fields
```

**2. Choose appropriate retention**

```javascript
// Short-term analytics
retentionDays: 90  // Last 3 months

// Long-term analytics
retentionDays: 365  // Full year for compliance

// Permanent analytics
retentionDays: Infinity  // Never delete
```

**3. Query by period efficiently**

```javascript
// ✅ Efficient: Query specific period
{ period: 'day', date: '2025-10-09' }

// ❌ Inefficient: Query all periods
{ period: 'hour' }  // Returns all hours ever
```

**4. Use top records for dashboards**

```javascript
// Dashboard: Top 5 customers this week
const topWeekly = await plugin.getTopRecords('wallets', 'balance', {
  period: 'day',
  date: today,
  metric: 'totalValue',
  limit: 5
});
```

### Limitations

- **recordCount** is approximate (max per batch, not total unique)
- **Roll-ups** may have slight delays (eventual consistency)
- **Late arrivals** outside consolidation window won't update analytics
- **Storage**: 24 records/day per field (negligible but measurable)

---

## Configuration Options

### Mode: Async vs Sync

```javascript
// Async Mode (default) - Better performance
{
  mode: 'async'
  // Operations return immediately
  // Consolidation happens periodically
  // Best for high-throughput scenarios
}

// Sync Mode - Immediate consistency
{
  mode: 'sync'
  // Operations wait for consolidation
  // Value is always up-to-date
  // Best for critical financial operations
}
```

### Partition Structure

```javascript
// Transaction resources are automatically partitioned by:
{
  byHour: { fields: { cohortHour: 'string' } },   // YYYY-MM-DDTHH format (e.g., 2025-10-08T14)
  byDay: { fields: { cohortDate: 'string' } },    // YYYY-MM-DD format
  byMonth: { fields: { cohortMonth: 'string' } }  // YYYY-MM format
}
```

This triple-partition structure enables:
- **O(1) hourly queries** for consolidation (most efficient)
- Efficient daily transaction queries
- Monthly aggregation and reporting
- Optimized storage and retrieval
- Timezone-aware cohort grouping for accurate local-time analytics

### Timezone Configuration

```javascript
{
  cohort: {
    timezone: 'America/Sao_Paulo' // Group transactions by Brazilian time
  }
}
```

**Auto-Detection:**
If no timezone is specified, the plugin uses a 3-level detection strategy:
1. **TZ environment variable** (common in Docker/Kubernetes)
2. **Intl API** (system timezone detection)
3. **UTC fallback** (if detection fails)

```javascript
// Auto-detect from environment
const plugin = new EventualConsistencyPlugin({
  resource: 'wallets',
  field: 'balance'
  // timezone auto-detected from TZ env var or system
});

// Explicit timezone
const plugin = new EventualConsistencyPlugin({
  resource: 'wallets',
  field: 'balance',
  cohort: { timezone: 'America/New_York' }
});
```

**Supported Timezones:**
All IANA timezones are supported (~600 timezones). Common examples:
- `'UTC'` (default if detection fails)
- `'America/New_York'`, `'America/Chicago'`, `'America/Los_Angeles'`, `'America/Sao_Paulo'`
- `'Europe/London'`, `'Europe/Paris'`, `'Europe/Berlin'`
- `'Asia/Tokyo'`, `'Asia/Shanghai'`, `'Asia/Singapore'`
- `'Australia/Sydney'`

**Daylight Saving Time (DST):**
The plugin uses the Intl API for timezone offset calculation, which **automatically handles DST transitions**. Cohort dates remain accurate throughout DST changes.

### Custom Reducers

Define how transactions are consolidated:

```javascript
// Example: Sum all operations
reducer: (transactions) => {
  return transactions.reduce((total, t) => {
    return total + (t.operation === 'sub' ? -t.value : t.value);
  }, 0);
}

// Example: Use last set, then apply increments
reducer: (transactions) => {
  let base = 0;
  let lastSetIndex = -1;

  transactions.forEach((t, i) => {
    if (t.operation === 'set') lastSetIndex = i;
  });

  if (lastSetIndex >= 0) {
    base = transactions[lastSetIndex].value;
    transactions = transactions.slice(lastSetIndex + 1);
  }

  return transactions.reduce((sum, t) => {
    if (t.operation === 'add') return sum + t.value;
    if (t.operation === 'sub') return sum - t.value;
    return sum;
  }, base);
}
```

**Understanding Synthetic Transactions:**

When consolidating records that have a current value but no 'set' operations in pending transactions, the plugin creates a **synthetic transaction** to ensure the reducer starts from the correct base value.

Synthetic transactions have these properties:
- `synthetic: true` - Flag to identify synthetic transactions
- `operation: 'set'` - Always a 'set' operation
- `value: <currentValue>` - The current value from the database record
- `timestamp: '1970-01-01T00:00:00.000Z'` - Very old timestamp to ensure it's processed first

**Example:**
```javascript
// Record has balance: 1000
// Pending transactions: [add(50), add(30)]
//
// Reducer receives:
// [
//   { synthetic: true, operation: 'set', value: 1000, timestamp: '1970-01-01T00:00:00.000Z' },
//   { operation: 'add', value: 50, timestamp: '2024-01-15T10:00:00.000Z' },
//   { operation: 'add', value: 30, timestamp: '2024-01-15T10:01:00.000Z' }
// ]
//
// Result: 1000 + 50 + 30 = 1080 ✓

// Custom reducers can check for synthetic transactions if needed:
reducer: (transactions) => {
  return transactions.reduce((sum, t) => {
    // Skip synthetic transactions if you want different behavior
    if (t.synthetic) {
      return t.value; // Or handle differently
    }

    if (t.operation === 'set') return t.value;
    if (t.operation === 'add') return sum + t.value;
    if (t.operation === 'sub') return sum - t.value;
    return sum;
  }, 0);
}
```

---

## Usage Examples

### Basic Wallet System (Single Field)

```javascript
// Setup with one field
const plugin = new EventualConsistencyPlugin({
  resource: 'wallets',
  field: 'balance',
  mode: 'sync'  // Immediate consistency
});

await s3db.usePlugin(plugin);

// Create a wallet
await wallets.insert({
  id: 'wallet-001',
  userId: 'user-123',
  balance: 0,
  currency: 'USD'
});

// Simple syntax - no field parameter needed
await wallets.set('wallet-001', 1000);  // Set to 1000
await wallets.add('wallet-001', 250);   // Add 250
await wallets.sub('wallet-001', 100);   // Subtract 100

// Consolidate and check
const balance = await wallets.consolidate('wallet-001');
console.log(`Current balance: $${balance}`); // 1150
```

### Multi-Currency Account (Multiple Fields)

```javascript
// Setup with multiple fields
const accounts = await s3db.createResource({
  name: 'accounts',
  attributes: {
    id: 'string|required',
    userId: 'string|required',
    balance: 'number|default:0',
    points: 'number|default:0',
    credits: 'number|default:0'
  }
});

// Add plugins for each field
await s3db.usePlugin(new EventualConsistencyPlugin({
  resource: 'accounts',
  field: 'balance',
  mode: 'sync'
}));

await s3db.usePlugin(new EventualConsistencyPlugin({
  resource: 'accounts',
  field: 'points',
  mode: 'sync'
}));

// Create account
await accounts.insert({
  id: 'acc-001',
  userId: 'user-123',
  balance: 1000,
  points: 500
});

// Multiple fields require field parameter
await accounts.add('acc-001', 'balance', 300);  // Add to balance
await accounts.add('acc-001', 'points', 150);   // Add to points
await accounts.sub('acc-001', 'balance', 100);  // Subtract from balance

// Consolidate specific fields
const balance = await accounts.consolidate('acc-001', 'balance');
const points = await accounts.consolidate('acc-001', 'points');
console.log(`Balance: $${balance}, Points: ${points}`);
```

### Points System with Custom Reducer

```javascript
const plugin = new EventualConsistencyPlugin({
  resource: 'users',
  field: 'points',
  reducer: (transactions) => {
    // Points can only increase
    return transactions.reduce((total, t) => {
      if (t.operation === 'set') return Math.max(total, t.value);
      if (t.operation === 'add') return total + t.value;
      // Ignore subtractions for points
      return total;
    }, 0);
  }
});

// Usage (single field, simple syntax)
await users.add('user-123', 100);  // Award points
await users.add('user-123', 50);   // More points
// sub would be ignored by reducer
```

### Inventory Counter with Sync Mode

```javascript
const plugin = new EventualConsistencyPlugin({
  resource: 'inventory',
  field: 'quantity',
  mode: 'sync', // Immediate consistency
  cohort: {
    timezone: 'America/New_York' // Group by EST/EDT
  }
});

// Every operation immediately updates the database
await inventory.sub('item-001', 5); // Sold 5 items
const remaining = await inventory.consolidate('item-001');
// 'remaining' is guaranteed to be accurate
```

### Analytics with Cohort Statistics

```javascript
// Get statistics for a specific day
const today = new Date().toISOString().split('T')[0];
const stats = await plugin.getCohortStats(today);

console.log(`
  Date: ${stats.date}
  Total Transactions: ${stats.transactionCount}
  Operations: 
    - Sets: ${stats.byOperation.set}
    - Adds: ${stats.byOperation.add}
    - Subs: ${stats.byOperation.sub}
  Total Value Changed: ${stats.totalValue}
`);
```

---

## Advanced Patterns

### Deferred Setup Pattern

The plugin supports being added before the target resource exists:

```javascript
// 1. Create database and connect
const s3db = new S3db({ connectionString: '...' });
await s3db.connect();

// 2. Add plugin for a resource that doesn't exist yet
const plugin = new EventualConsistencyPlugin({
  resource: 'future_resource',
  field: 'counter'
});
await s3db.usePlugin(plugin); // Plugin enters deferred mode

// 3. Do other work...
await s3db.createResource({ name: 'other_resource', ... });

// 4. Create the target resource
const futureResource = await s3db.createResource({
  name: 'future_resource',
  attributes: {
    id: 'string|required',
    counter: 'number|default:0'
  }
});

// 5. Methods are automatically available
await futureResource.addCounter('rec-1', 10);
```

This pattern is useful for:
- Plugin configuration in application setup
- Modular initialization
- Dynamic resource creation

### Dynamic Field Detection Example

```javascript
// Start with single field
const wallets = await s3db.createResource({
  name: 'wallets',
  attributes: {
    id: 'string|required',
    balance: 'number|default:0'
  }
});

// Add first plugin
await s3db.usePlugin(new EventualConsistencyPlugin({
  resource: 'wallets',
  field: 'balance'
}));

// Simple syntax works
await wallets.add('w-1', 100);  // No field parameter needed

// Later, add a second field with eventual consistency
await s3db.usePlugin(new EventualConsistencyPlugin({
  resource: 'wallets',
  field: 'points'
}));

// Now field parameter is required
try {
  await wallets.add('w-1', 100);  // ERROR!
} catch (error) {
  // "Multiple fields have eventual consistency. Please specify the field"
}

// Must specify field now
await wallets.add('w-1', 'balance', 100);  // OK
await wallets.add('w-1', 'points', 50);    // OK
```

### Transaction Batching for High Volume

```javascript
const plugin = new EventualConsistencyPlugin({
  resource: 'metrics',
  field: 'count',
  batchTransactions: true,
  batchSize: 500, // Batch 500 transactions
  consolidationInterval: 60000 // Consolidate every minute
});

// Transactions are batched automatically
for (let i = 0; i < 1000; i++) {
  await metrics.addCount(`metric-${i % 10}`, 1);
  // Batched in groups of 500
}
```

### Parallel Operations Example

```javascript
// Setup resource with multiple fields
const metrics = await s3db.createResource({
  name: 'metrics',
  attributes: {
    id: 'string|required',
    views: 'number|default:0',
    clicks: 'number|default:0'
  }
});

// Add plugins
await s3db.usePlugin(new EventualConsistencyPlugin({
  resource: 'metrics',
  field: 'views',
  mode: 'async'
}));

await s3db.usePlugin(new EventualConsistencyPlugin({
  resource: 'metrics',
  field: 'clicks',
  mode: 'async'
}));

// Parallel operations on different fields
const operations = [
  metrics.add('page-1', 'views', 100),
  metrics.add('page-1', 'views', 200),
  metrics.add('page-1', 'clicks', 10),
  metrics.add('page-1', 'clicks', 20)
];

await Promise.all(operations);

// Consolidate both fields
const views = await metrics.consolidate('page-1', 'views');
const clicks = await metrics.consolidate('page-1', 'clicks');
```

### Manual Consolidation Control

```javascript
const plugin = new EventualConsistencyPlugin({
  resource: 'accounts',
  field: 'balance',
  autoConsolidate: false // Disable auto-consolidation
});

// Manually trigger consolidation when needed
await accounts.consolidate('account-001');

// Useful for:
// - Batch processing
// - Scheduled consolidation
// - Controlled timing
```

---

## Consolidation Strategy

### How Consolidation Works

The EventualConsistencyPlugin uses a **watermark-based consolidation strategy**, inspired by Apache Flink and Kafka Streams. This approach handles late-arriving transactions while maintaining high performance.

#### Key Concepts

**1. Event Time vs Processing Time**
- **Event Time**: When the transaction happened (`cohortHour`)
- **Processing Time**: When consolidation runs (now)

**2. Watermark (Consolidation Window)**
- `consolidationWindow: 24` = "Accept late arrivals up to 24h ago"
- Transactions **inside** the watermark: always re-consolidated
- Transactions **outside** the watermark: handled by `lateArrivalStrategy`

**3. Idempotency**
- Consolidation can run multiple times on the same hour
- Doesn't duplicate values because transactions are marked `applied: true`
- Next consolidation only picks `applied: false`

### Practical Example: Wallet Balance

```javascript
new EventualConsistencyPlugin({
  resource: 'wallets',
  field: 'balance',
  consolidationInterval: 300,  // 5 min (seconds)
  consolidationWindow: 24,     // 24 hours
  lateArrivalStrategy: 'warn'
})
```

**Timeline:**

```
14:00 - Transactions arrive
  14:15 → wallet.add('user1', 100)  // cohortHour: 2025-10-08T14
  14:30 → wallet.add('user1', 50)   // cohortHour: 2025-10-08T14
  14:45 → wallet.add('user1', 25)   // cohortHour: 2025-10-08T14

14:05 - First Consolidation
  Query: cohortHour=2025-10-08T14, applied=false
  Found: 2 transactions (14:15, 14:30)
  Consolidated: 0 + 100 + 50 = 150
  Marked applied: true
  → wallet.balance = 150 ✅

14:50 - Second Consolidation
  Query: cohortHour=2025-10-08T14, applied=false
  Found: 1 transaction (14:45 - arrived late)
  Consolidated: 150 + 25 = 175
  Marked applied: true
  → wallet.balance = 175 ✅ (Updated!)

15:30 - Third Consolidation
  Query: cohortHour=2025-10-08T14, applied=false
  Found: 0 transactions (all applied)
  Skip hour 14 ✅
  Process hour 15...
```

### Late Arrivals

#### Within Watermark (<24h)
```javascript
// Time: 10:00 (next day)
// Late arrival: transaction for 14:00 (yesterday) = 20h ago
// 20h < 24h watermark ✅

wallet.add('user1', 10) // cohortHour: 2025-10-08T14 (yesterday)
// Next consolidation: picks this txn and re-consolidates hour 14
// wallet.balance = 175 + 10 = 185 ✅
```

#### Outside Watermark (>24h)
```javascript
// Time: 15:00 (next day)
// Late arrival: transaction for 14:00 (yesterday) = 25h ago
// 25h > 24h watermark ❌

wallet.add('user1', 10) // cohortHour: 2025-10-08T14 (yesterday)

// Strategy: 'ignore'
// ❌ Transaction rejected
// wallet.balance = 175 (unchanged)

// Strategy: 'warn'
// ⚠️ Warning logged, transaction created
// But consolidation won't pick it up (outside window)
// wallet.balance = 175 (unchanged in practice)

// Strategy: 'process'
// ✅ Transaction created AND forced in next consolidation
// Requires extra logic (not recommended)
```

### Late Arrival Strategies

#### 1. `ignore` (Most Performant)
```javascript
lateArrivalStrategy: 'ignore'

// Late arrivals > watermark are rejected
// Doesn't create transaction
// Maximum performance ✅
// Use when: Financial data with strict SLA
```

#### 2. `warn` (Default - Auditable)
```javascript
lateArrivalStrategy: 'warn'

// Late arrivals > watermark generate warning
// Transaction is created (for audit)
// But consolidation won't pick it up (outside window)
// Use when: Need to audit late arrivals
```

#### 3. `process` (Most Complex)
```javascript
lateArrivalStrategy: 'process'

// Late arrivals always processed
// Requires manual consolidation or infinite window
// Lower performance ⚠️
// Use when: Critical data, no arrival deadline
```

### Performance by Configuration

#### High Frequency (Real-time)
```javascript
{
  consolidationInterval: 60,   // 1 min
  consolidationWindow: 2,      // 2 hours
  lateArrivalStrategy: 'ignore'
}

// Queries: 2 partitions per hour
// Late arrival tolerance: 2h
// Use: Gaming, IoT, real-time dashboards
```

#### Medium Frequency (Near real-time)
```javascript
{
  consolidationInterval: 300,  // 5 min
  consolidationWindow: 24,     // 24 hours
  lateArrivalStrategy: 'warn'
}

// Queries: 24 partitions per hour
// Late arrival tolerance: 24h
// Use: E-commerce, fintech, analytics
```

#### Low Frequency (Batch)
```javascript
{
  consolidationInterval: 3600, // 1 hour
  consolidationWindow: 168,    // 7 days
  lateArrivalStrategy: 'warn'
}

// Queries: 168 partitions per hour
// Late arrival tolerance: 7 days
// Use: Reports, data warehouse, ML
```

### Consolidation Best Practices

#### 1. Choose Watermark Based on SLA
```javascript
// SLA: "99% of transactions arrive within 1h"
consolidationWindow: 2  // 2h watermark (covers 99% + safety margin)

// SLA: "95% of transactions arrive within 30min"
consolidationWindow: 1  // 1h watermark
```

#### 2. Balance Consolidation Interval × Window
```javascript
// ❌ BAD: Too frequent with large window
consolidationInterval: 60,   // 1 min
consolidationWindow: 168     // 7 days
// Problem: Query 168 partitions every 1 min!

// ✅ GOOD: Frequent with small window
consolidationInterval: 60,   // 1 min
consolidationWindow: 2       // 2 hours
// Query only 2 partitions every 1 min
```

#### 3. Late Arrival Strategy
```javascript
// Production: Prefer 'warn' or 'ignore'
// Development: Use 'warn' for debugging
// Critical: Only use 'process' if truly necessary
```

### Monitoring Metrics

**Important Metrics:**
1. **Late Arrival Rate**: % of transactions outside watermark
2. **Consolidation Latency**: Time until transaction is applied
3. **Window Coverage**: % of transactions inside watermark

**Logs with verbose: true:**
```
[EventualConsistency] Late arrival detected: transaction for 2025-10-08T14
is 25h late (watermark: 24h). Processing anyway, but consolidation may not pick it up.
```

### Summary

**How it works:**
1. Transactions have `cohortHour` (event time)
2. Consolidation queries last N hours (watermark)
3. Transactions within watermark: always re-consolidated
4. Transactions outside watermark: late arrival strategy

**Doesn't accumulate by hour!**
- Each consolidation recalculates from zero
- Uses `applied: false` to know what to process
- Is idempotent (can run N times)

**Best practice:**
- Window = arrival SLA + safety margin
- Strategy = 'warn' (default, auditable)
- Interval = Based on write frequency

**Performance:**
- Hourly partitions = O(1) lookup
- Small window = Fewer partitions = Faster
- Idempotency = Can run as many times as needed

---

## Distributed Environment

### Multi-Container Safety

The EventualConsistencyPlugin is **safe for distributed environments** with multiple containers/processes running in parallel. It uses S3-based distributed locks to prevent race conditions and data corruption.

#### Distributed Locks for Consolidation

When multiple containers try to consolidate the same record simultaneously:

```javascript
// Container 1 and Container 2 both try to consolidate 'wallet-123'
await wallets.consolidate('wallet-123'); // Both containers

// What happens:
// 1. Both try to acquire lock: `lock-consolidation-wallets-wallet-123-balance`
// 2. Only ONE succeeds (S3 insert is atomic via ETag)
// 3. Winner runs consolidation
// 4. Loser skips (lock already exists)
// 5. Winner releases lock when done
```

**Configuration:**
```javascript
{
  lockTimeout: 300  // 5 minutes (configurable)
}
```

If a container crashes during consolidation, the lock will be cleaned up automatically after the timeout period.

#### Distributed Locks for Garbage Collection

Garbage collection runs periodically to delete old applied transactions:

```javascript
// Multiple containers, but only ONE runs GC at a time
// Automatic via distributed lock: `lock-gc-{resource}-{field}`

{
  transactionRetention: 30,  // Keep transactions for 30 days
  gcInterval: 86400          // Run GC every 24 hours
}
```

**How it works:**
1. Container A starts GC, acquires `lock-gc-wallets-balance`
2. Container B tries to start GC, lock insert fails → skips
3. Container A deletes transactions older than 30 days
4. Container A releases lock
5. Next GC runs 24 hours later (any container can run it)

#### Distributed Lock Cleanup

Stale locks (from crashed containers) are cleaned up automatically:

```javascript
// Runs before each consolidation
// Uses its own distributed lock: `lock-cleanup-{resource}-{field}`

// Finds locks older than lockTimeout
// Deletes them
// Only one container runs cleanup at a time
```

### Transaction Lifecycle in Distributed Environment

```
Container 1: wallet.add('user1', 100)
  ↓
  Transaction created: { applied: false, cohortHour: '2025-10-08T14' }
  ↓
Container 2: Runs consolidation (scheduled or manual)
  ↓
  Acquires lock: `lock-consolidation-wallets-user1-balance`
  ↓
  Queries: { cohortHour: '2025-10-08T14', applied: false }
  ↓
  Consolidates: wallet.balance = old + 100
  ↓
  Marks: { applied: true }
  ↓
  Releases lock
  ↓
Container 3: Runs GC (24h later)
  ↓
  Acquires lock: `lock-gc-wallets-balance`
  ↓
  Deletes transactions older than 30 days (applied: true)
  ↓
  Releases lock
```

### Best Practices for Distributed Deployments

#### 1. Configure Appropriate Lock Timeout

```javascript
// Short timeout for high-frequency operations
{
  consolidationInterval: 60,   // 1 min
  lockTimeout: 120             // 2 min (2x interval)
}

// Longer timeout for heavy consolidations
{
  consolidationInterval: 3600, // 1 hour
  lockTimeout: 7200            // 2 hours
}
```

**Rule of thumb**: Lock timeout should be at least 2x consolidation interval.

#### 2. Don't Use Batching in Production

```javascript
// ❌ BAD: In-memory batching loses data on container crash
{
  batchTransactions: true  // Stores transactions in memory
}

// ✅ GOOD: Direct writes survive container crashes
{
  batchTransactions: false  // Default
}
```

**Why**: Batched transactions are stored in memory and lost if the container crashes before flush.

#### 3. Monitor Lock Contention

```javascript
{
  verbose: true  // Enable to see lock messages
}

// Logs:
// [EventualConsistency] Consolidation already running on another container
// [EventualConsistency] GC already running in another container
```

If you see many "already running" messages, consider:
- Increasing consolidation interval
- Reducing number of containers
- Checking for slow consolidations (optimize reducer)

#### 4. Garbage Collection Timing

```javascript
// Low-traffic periods
{
  gcInterval: 86400  // Run GC once daily (default)
}

// High-traffic with many transactions
{
  gcInterval: 43200,         // Run GC twice daily
  transactionRetention: 7    // Keep only 7 days
}
```

**Note**: GC only deletes `applied: true` transactions, so it's safe to run frequently.

---

## Best Practices

### 1. Choose the Right Mode

- **Use Async Mode** for:
  - High-throughput operations
  - Non-critical counters
  - Analytics and metrics
  - User points/rewards

- **Use Sync Mode** for:
  - Financial transactions
  - Inventory management
  - Critical counters
  - Real-time requirements

### 2. Leverage Partition Structure

```javascript
// Query by day for recent transactions (respects timezone)
const todayTransactions = await db.resources.wallets_transactions_balance.query({
  cohortDate: '2024-01-15'  // In configured timezone
});

// Query by month for reporting
const monthTransactions = await db.resources.wallets_transactions_balance.query({
  cohortMonth: '2024-01'
});

// Both partitions are always available for flexible querying
```

### 3. Choose the Right Timezone

```javascript
// For global applications - use UTC
{ cohort: { timezone: 'UTC' } }

// For regional applications - use local timezone
{ cohort: { timezone: 'America/Sao_Paulo' } }  // Brazil
{ cohort: { timezone: 'America/New_York' } }   // US East Coast
{ cohort: { timezone: 'Asia/Tokyo' } }         // Japan

// Timezone affects cohort grouping for daily/monthly partitions
```

### 3. Design Reducers Carefully

```javascript
// Always handle all operation types
reducer: (transactions) => {
  return transactions.reduce((acc, t) => {
    switch(t.operation) {
      case 'set': return t.value;
      case 'add': return acc + t.value;
      case 'sub': return acc - t.value;
      default: return acc; // Handle unknown operations
    }
  }, 0);
}
```

### 4. Monitor Transaction Growth

```javascript
// Periodically clean up old transactions
const oldDate = new Date();
oldDate.setMonth(oldDate.getMonth() - 3); // 3 months ago

const oldTransactions = await s3db.resources.wallets_transactions.query({
  applied: true,
  timestamp: { $lt: oldDate.toISOString() }
});

// Archive or delete old transactions
```

### 5. Error Handling

```javascript
// Listen for transaction errors
plugin.on('eventual-consistency.transaction-error', (error) => {
  console.error('Transaction failed:', error);
  // Implement retry logic or alerting
});

// Monitor consolidation
plugin.on('eventual-consistency.consolidated', (stats) => {
  console.log(`Consolidated ${stats.recordCount} records`);
});
```

### 6. Testing Strategies

```javascript
// Use sync mode for tests
const testPlugin = new EventualConsistencyPlugin({
  resource: 'testResource',
  field: 'value',
  mode: 'sync' // Predictable for tests
});

// Single field - simple syntax
await resource.set('test-1', 100);
await resource.add('test-1', 50);
const result = await resource.consolidate('test-1');
expect(result).toBe(150);
```

---

## Transaction Resource Schema

The plugin creates a `${resource}_transactions_${field}` resource for each field with this schema:

```javascript
{
  id: 'string|required',         // Transaction ID
  originalId: 'string|required', // Parent record ID
  field: 'string|required',      // Field name
  value: 'number|required',      // Transaction value
  operation: 'string|required',  // 'set', 'add', or 'sub'
  timestamp: 'string|required',  // ISO timestamp
  cohortHour: 'string|required', // YYYY-MM-DDTHH (e.g., 2025-10-08T14)
  cohortDate: 'string|required', // YYYY-MM-DD
  cohortMonth: 'string|optional',// YYYY-MM
  source: 'string|optional',     // Operation source
  applied: 'boolean|optional'    // Consolidation status
}
```

This resource is automatically partitioned by `cohortHour` (byHour), `cohortDate` (byDay), and `cohortMonth` (byMonth) for efficient querying.

**Notes**: 
- The transaction resource uses `asyncPartitions: true` by default for better write performance
- Each field gets its own transaction resource (e.g., `wallets_transactions_balance`, `wallets_transactions_points`)
- Transaction resources are created automatically when the plugin initializes

---

## Troubleshooting

### Issue: Balance doesn't update immediately
**Solution**: You're using async mode. Either switch to sync mode or manually call `consolidate()`.

### Issue: Too many transactions accumulating
**Solution**: Reduce consolidation interval or implement transaction archiving.

### Issue: Consolidation taking too long
**Solution**: Use smaller cohort intervals or optimize your reducer function.

### Issue: Methods not available on resource
**Solution**: 
- Ensure plugin is added via `s3db.usePlugin(plugin)`
- Verify database is connected before adding plugin
- If using deferred setup, confirm resource name matches exactly
- Check that the resource has been created if plugin was added first

### Issue: "Multiple fields have eventual consistency" error
**Solution**: When multiple fields have eventual consistency, you must specify the field parameter:
```javascript
// Wrong
await resource.add('id', 100);

// Correct
await resource.add('id', 'fieldName', 100);
```

---

## Migration Guide

### From Direct Updates to Eventual Consistency

```javascript
// Before: Direct updates
await wallets.update({
  id: 'wallet-001',
  balance: 1000
});

// After: Using eventual consistency (single field)
await wallets.set('wallet-001', 1000);

// For increments
// Before:
const wallet = await wallets.get('wallet-001');
await wallets.update({
  id: 'wallet-001',
  balance: wallet.balance + 100
});

// After (single field):
await wallets.add('wallet-001', 100);

// After (multiple fields):
await wallets.add('wallet-001', 'balance', 100);
```

---

## See Also

- [Plugin Development Guide](./plugin-development.md)
- [Audit Plugin](./audit.md) - For complete operation logging
- [Metrics Plugin](./metrics.md) - For performance monitoring
- [State Machine Plugin](./state-machine.md) - For state transitions