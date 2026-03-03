# Best Practices

> Production checklist, troubleshooting, and FAQ for Costs Plugin.

**Navigation:** [← Back to Costs Plugin](/plugins/costs/README.md) | [Usage Patterns](/plugins/costs/guides/usage-patterns.md)

---

## Production Checklist

1. Install plugin explicitly:
`await db.usePlugin(new CostsPlugin(...))`
2. Define a standard observed window:
`24h` is usually a good starting point.
3. Track daily snapshots externally if you need history across restarts.
4. Set budget alarms from `estimate({ days: 30 })`.
5. Review `byResource` and `byPlugin` every release.
6. Recalibrate request prices if you are not on standard AWS pricing.

---

## Common Pitfalls

1. Treating projection as invoice:
`estimate()` is directional and depends on observed behavior quality.
2. Using very small observed windows:
short windows can overfit spikes.
3. Ignoring idle traffic:
polling plugins can dominate cost even with low business traffic.
4. Not capping history:
large unbounded history increases memory footprint.

---

## Troubleshooting

### Costs stay near zero
Check:
1. Plugin is installed before workload starts.
2. Operations are actually hitting S3-backed client paths.
3. You are reading from `db.client.costs` in the same process.

### Projection looks too high
Check:
1. `observedWindowMs` is long enough to smooth bursts.
2. `requestMultiplier` is not inflated.
3. Plugin assumptions passed to `estimate()` are realistic.

### Resource/plugin breakdown is empty
Breakdown depends on key patterns that include `resource=` and/or `plugin=` segments.
If keys do not follow those prefixes, totals still work, but dimensions may be sparse.

---

## FAQ

### How do I read current totals?

```javascript
const costs = db.client.costs;
console.log(costs.total);
console.log(costs.requests.counts);
```

### How do I get last 24h only?

```javascript
const snap = db.plugins.CostsPlugin.snapshot({
  windowMs: 24 * 60 * 60 * 1000
});
```

### How do I project the next month?

```javascript
const projection = db.plugins.CostsPlugin.estimate({
  days: 30,
  includePluginEstimates: true
});
```

### Can I customize prices?

Yes, by mutating the request price table:

```javascript
const costs = db.plugins.CostsPlugin.getCosts();
costs.requests.prices.get = 0.0005 / 1000;
```

### Can I reset counters?

There is no dedicated reset API today.
The common approach is restarting the process or reinitializing the database/plugin instance.

### Is this compatible with non-AWS S3 providers?

Yes for usage counting.
For cost fidelity, you should adapt the price tables to your provider contract.
