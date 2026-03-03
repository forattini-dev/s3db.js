# Usage Patterns

> Practical patterns for monitoring and forecasting cost.

**Navigation:** [← Back to Costs Plugin](/plugins/costs/README.md) | [Configuration](/plugins/costs/guides/configuration.md)

---

## 1. Live Session Tracking

```javascript
const costs = db.client.costs;

console.log('USD total:', costs.total);
console.log('Requests:', costs.requests.total);
console.log('By method:', costs.requests.counts);
console.log('By resource:', costs.usage.byResource);
console.log('By plugin:', costs.usage.byPlugin);
```

Use this for:
- real-time dashboards
- local profiling
- quick smoke checks after a feature rollout

---

## 2. Snapshot by Window

```javascript
const costsPlugin = db.plugins.CostsPlugin;

const lastHour = costsPlugin.snapshot({ windowMs: 60 * 60 * 1000 });
const lastDay = costsPlugin.snapshot({ windowMs: 24 * 60 * 60 * 1000 });

console.log(lastHour.totalRequests, lastHour.estimatedTotal);
console.log(lastDay.byMethod, lastDay.byResource);
```

Use this for:
- “last 1h vs last 24h” trend
- request spikes
- anomaly detection

---

## 3. Snapshot with Filters

```javascript
const costsPlugin = db.plugins.CostsPlugin;

const userResourceCost = costsPlugin.snapshot({
  windowMs: 24 * 60 * 60 * 1000,
  resource: 'users'
});

const queueCost = costsPlugin.snapshot({
  windowMs: 24 * 60 * 60 * 1000,
  plugin: 's3-queue'
});
```

Use this for:
- chargeback by bounded context
- identifying expensive plugin behavior

---

## 4. Monthly Projection

```javascript
const costsPlugin = db.plugins.CostsPlugin;

const projection = costsPlugin.estimate({
  days: 30,
  observedWindowMs: 24 * 60 * 60 * 1000,
  requestMultiplier: 1.15
});

console.log(projection.projected.totalCost);
console.log(projection.projected.totalRequests);
```

Use this for:
- budget planning
- forecasting growth after product campaigns
- environment sizing (dev/staging/prod)

---

## 5. Combine with Plugin Forecasts

If other plugins expose `estimateUsage()`, `CostsPlugin` can aggregate them:

```javascript
const result = db.plugins.CostsPlugin.estimate({
  days: 30,
  includePluginEstimates: true,
  pluginAssumptions: {
    S3QueuePlugin: {
      processedMessagesPerSecond: 0.4,
      retriesPerMessage: 0.05
    }
  }
});

console.log(result.projected.pluginProjectedRequests);
console.log(result.pluginEstimates);
```

---

## 6. Budget Guardrail

```javascript
const BUDGET_USD_MONTH = 150;

setInterval(() => {
  const estimate = db.plugins.CostsPlugin.estimate({
    days: 30,
    includePluginEstimates: true
  });

  if (estimate.projected.totalCost > BUDGET_USD_MONTH) {
    console.warn('Projected monthly budget exceeded:', estimate.projected.totalCost);
  }
}, 60_000);
```

---

## 7. Before/After Optimization Comparison

```javascript
const costsPlugin = db.plugins.CostsPlugin;

const before = costsPlugin.snapshot({ windowMs: 15 * 60 * 1000 });

// Deploy optimization (cursor pagination, cache, etc)
await runWorkload();

const after = costsPlugin.snapshot({ windowMs: 15 * 60 * 1000 });

console.log({
  requestsDelta: after.totalRequests - before.totalRequests,
  estimatedCostDelta: after.estimatedTotal - before.estimatedTotal
});
```

---

## Notes

1. `snapshot()` reflects observed events in memory for the current process.
2. `estimate()` scales observed behavior; quality depends on window quality.
3. For finance-grade reporting, export snapshots periodically to durable storage.
