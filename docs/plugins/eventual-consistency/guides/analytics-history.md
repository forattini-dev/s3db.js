# Analytics & History

This guide focuses on the part of EventualConsistencyPlugin that is easiest to undersell: the combination of raw transaction history and pre-aggregated analytics. The plugin is not just a numeric counter helper. It is also a time-series and audit substrate for fields that matter operationally.

**Navigation:** [← Back to EventualConsistency Plugin](/plugins/eventual-consistency/README.md) | [Configuration](/plugins/eventual-consistency/guides/configuration.md) | [Usage Patterns](/plugins/eventual-consistency/guides/usage-patterns.md)

## TLDR

- The transaction resource is the source of truth for history.
- The analytics resource is a derived, query-friendly rollup layer.
- You can query both raw events and aggregated cohorts from the same field.
- The plugin already exposes chart-oriented helpers such as `getLastNDays`, `getDayByHour`, `getMonthByDay`, `getTopRecords`, and `fillGaps`.
- Timezone and cohort configuration directly affect what “hour”, “day”, and “week” mean in your dashboards.

## Table of Contents

- [Mental Model](#mental-model)
- [Resources Created](#resources-created)
- [What Analytics Tracks](#what-analytics-tracks)
- [Rollup Model](#rollup-model)
- [Raw Event History](#raw-event-history)
- [Analytics Query Helpers](#analytics-query-helpers)
- [Gap Filling and Charting](#gap-filling-and-charting)
- [Top Records and Breakdown Views](#top-records-and-breakdown-views)
- [Timezone and Cohorts](#timezone-and-cohorts)
- [Retention and Replay](#retention-and-replay)
- [Example Workflow](#example-workflow)

## Mental Model

For each tracked field, the plugin gives you two layers:

1. **raw transactions**
2. **aggregated cohorts**

That split matters:

- raw transactions are for auditability, replay, and debugging
- analytics cohorts are for dashboards, reports, and fast time-range reads

## Resources Created

For a tracked field like `wallets.balance`, the plugin can create:

- `plg_wallets_tx_balance`
- `plg_wallets_an_balance` when analytics is enabled
- `plg_wallets_balance_tickets` when coordinator mode is enabled

### Transaction resource

The transaction resource stores records such as:

- `originalId`
- `field`
- `fieldPath`
- `value`
- `operation`
- `timestamp`
- `cohortDate`
- `cohortHour`
- `cohortWeek`
- `cohortMonth`
- `applied`

This is the historical audit layer.

### Analytics resource

The analytics resource stores period summaries such as:

- `period`
- `cohort`
- `transactionCount`
- `totalValue`
- `avgValue`
- `minValue`
- `maxValue`
- `recordCount`
- `operations`
- `consolidatedAt`
- `updatedAt`

This is the reporting layer.

## What Analytics Tracks

Analytics records summarize applied transactions into time cohorts and operation breakdowns.

```javascript
{
  id: 'hour-2025-10-09T14',
  period: 'hour',
  cohort: '2025-10-09T14',
  transactionCount: 150,
  totalValue: 5000,
  avgValue: 33.33,
  minValue: 10,
  maxValue: 500,
  recordCount: 25,
  operations: {
    add: { count: 120, sum: 6000 },
    sub: { count: 30, sum: -1000 }
  }
}
```

The important detail is `recordCount`: it tells you how many distinct original records contributed to the cohort, not only how many transactions happened.

## Rollup Model

The runtime currently works with these periods:

- `hour`
- `day`
- `week`
- `month`

With `analyticsConfig.rollupStrategy: 'incremental'`, higher-level periods are rolled up from lower-level ones as consolidation happens. That keeps dashboard reads cheap while still allowing replay and recalculation from the transaction layer when needed.

## Raw Event History

Use raw history when you need to inspect what really happened, not only the rollup.

```javascript
const events = await plugin.getRawEvents('wallets', 'balance', {
  recordId: 'w1'
});
```

### Useful raw-event filters

```javascript
await plugin.getRawEvents('wallets', 'balance', {
  recordId: 'w1',
  startDate: '2025-10-01',
  endDate: '2025-10-31'
});

await plugin.getRawEvents('wallets', 'balance', {
  cohortDate: '2025-10-09'
});

await plugin.getRawEvents('wallets', 'balance', {
  cohortHour: '2025-10-09T14'
});
```

Use this layer for:

- debugging unexpected consolidated values
- investigating spikes
- reconstructing a record timeline
- validating rollups during migrations

## Analytics Query Helpers

The plugin already ships with a richer analytics API than the docs previously suggested.

### Generic query

```javascript
await plugin.getAnalytics('urls', 'clicks', {
  period: 'day',
  startDate: '2025-10-01',
  endDate: '2025-10-31',
  fillGaps: true
});
```

### Period breakdowns

```javascript
await plugin.getDayByHour('urls', 'clicks', '2025-10-09');
await plugin.getWeekByDay('urls', 'clicks', '2025-W42');
await plugin.getWeekByHour('urls', 'clicks', '2025-W42');
await plugin.getMonthByDay('urls', 'clicks', '2025-10');
await plugin.getMonthByHour('urls', 'clicks', '2025-10');
await plugin.getMonthByWeek('urls', 'clicks', '2025-10');
await plugin.getYearByDay('urls', 'clicks', 2025);
await plugin.getYearByWeek('urls', 'clicks', 2025);
await plugin.getYearByMonth('urls', 'clicks', 2025);
```

### Last-N helpers

```javascript
await plugin.getLastNHours('urls', 'clicks', 24);
await plugin.getLastNDays('urls', 'clicks', 7);
await plugin.getLastNWeeks('urls', 'clicks', 4);
await plugin.getLastNMonths('urls', 'clicks', 12);
```

These are useful because they return directly consumable cohort series instead of forcing every dashboard to rebuild date windows itself.

## Gap Filling and Charting

Sparse data is common in counters and transactional systems. A dashboard often wants explicit zeroes instead of missing rows.

```javascript
const data = await plugin.getLastNDays('urls', 'clicks', 30, {
  fillGaps: true
});
```

Or explicitly:

```javascript
const filled = plugin.fillGaps(data, 'day', '2025-10-01', '2025-10-31');
```

This is especially useful for:

- line charts
- area charts
- moving averages
- anomaly detection over fixed windows

## Top Records and Breakdown Views

When you need to know not only “how much happened” but also “who drove it”, use `getTopRecords`.

```javascript
await plugin.getTopRecords('urls', 'clicks', {
  period: 'day',
  date: '2025-10-09',
  limit: 10,
  sortBy: 'transactionCount'
});
```

You can also ask analytics queries for operation breakdowns:

```javascript
await plugin.getAnalytics('wallets', 'balance', {
  period: 'day',
  date: '2025-10-09',
  breakdown: 'operations'
});
```

That is valuable when `add`, `sub`, and `set` mean different business events and should be charted separately.

## Timezone and Cohorts

The cohort model depends on timezone:

```javascript
new EventualConsistencyPlugin({
  resources: { urls: ['clicks'] },
  enableAnalytics: true,
  cohort: {
    timezone: 'America/Sao_Paulo'
  }
});
```

If your reporting timezone is wrong, daily and weekly analytics will be “correct” mathematically but wrong for the business.

## Retention and Replay

There are two retention conversations:

- **transaction history retention** via `transactionRetention`
- **analytics retention** via `analyticsConfig.retentionDays`

The first affects audit depth and replay ability. The second affects how far back fast pre-aggregated reads stay available.

If you shorten history too aggressively, you lose replay and deep debugging capability. If you keep everything forever, you grow cost and operational surface. This should be an explicit product decision.

When correctness is in doubt, `recalculate()` is the escape hatch:

```javascript
await resource.recalculate('w1', 'balance');
```

## Example Workflow

```javascript
const plugin = new EventualConsistencyPlugin({
  resources: { urls: ['clicks'] },
  mode: 'async',
  autoConsolidate: true,
  consolidationInterval: 60,
  enableAnalytics: true,
  analyticsConfig: {
    rollupStrategy: 'incremental',
    retentionDays: 365
  },
  cohort: {
    timezone: 'UTC'
  }
});

await db.usePlugin(plugin);

await urls.insert({ id: 'url-1', clicks: 0 });
await urls.add('url-1', 'clicks', 1);
await urls.add('url-1', 'clicks', 1);
await urls.add('url-1', 'clicks', 1);

const last7Days = await plugin.getLastNDays('urls', 'clicks', 7, {
  fillGaps: true
});

const topUrlsToday = await plugin.getTopRecords('urls', 'clicks', {
  period: 'day',
  date: new Date().toISOString().substring(0, 10),
  limit: 10
});

const rawEvents = await plugin.getRawEvents('urls', 'clicks', {
  recordId: 'url-1'
});
```
