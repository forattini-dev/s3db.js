# Best Practices

> Production checklist, troubleshooting, and FAQ for Costs Plugin.

**Navigation:** [<- Back to Costs Plugin](/plugins/costs/README.md) | [Usage Patterns](/plugins/costs/guides/usage-patterns.md)

---

## Production Checklist

1. Install plugin explicitly:
`await db.usePlugin(new CostsPlugin(...))`
2. Verify detected provider:
`db.plugins.CostsPlugin.getCosts().provider`
3. Define a standard observed window:
`24h` is usually a good starting point.
4. Track daily snapshots externally if you need history across restarts.
5. Set budget alarms from `estimate({ days: 30 })`.
6. Review `byResource` and `byPlugin` every release.
7. For Turso, set the correct plan tier: `new CostsPlugin({ tursoPlan: 'scaler' })`.

---

## Common Pitfalls

1. **Treating projection as invoice:**
`estimate()` is directional and depends on observed behavior quality.
2. **Using very small observed windows:**
short windows can overfit spikes.
3. **Ignoring idle traffic:**
polling plugins can dominate cost even with low business traffic.
4. **Not capping history:**
large unbounded history increases memory footprint.
5. **Wrong Turso plan tier:**
if you don't set `tursoPlan`, it defaults to `'developer'`. Scaler and Pro have different pricing.
6. **Assuming all backends have egress costs:**
R2, D1, and Turso have zero egress. Only AWS S3 charges for data transfer out.

---

## Troubleshooting

### Costs stay near zero
Check:
1. Plugin is installed before workload starts.
2. Operations are actually hitting the backend client (not cached).
3. You are reading from `db.client.costs` in the same process.
4. For SQL backends (D1/Turso): verify `costs.rows.counts` is incrementing.

### Projection looks too high
Check:
1. `observedWindowMs` is long enough to smooth bursts.
2. `requestMultiplier` is not inflated.
3. Plugin assumptions passed to `estimate()` are realistic.

### Resource/plugin breakdown is empty
Breakdown depends on key patterns that include `resource=` and/or `plugin=` segments.
If keys do not follow those prefixes, totals still work, but dimensions may be sparse.

### Provider detected as 'aws-s3' when using R2
Check that your connection string uses the R2 endpoint format:
`https://KEY:SECRET@ACCOUNT_ID.r2.cloudflarestorage.com/bucket`

If the endpoint doesn't contain `.r2.cloudflarestorage.com`, the plugin falls back to AWS S3 pricing. Use the `provider` option to override:
`new CostsPlugin({ provider: 'cloudflare-r2' })`

---

## FAQ

### How do I check which provider was detected?

```javascript
const costs = db.plugins.CostsPlugin.getCosts();
console.log(costs.provider);      // 'aws-s3', 'cloudflare-r2', 'cloudflare-d1', 'turso', 'self-hosted'
console.log(costs.pricingModel);  // 'request-based' or 'row-based'
```

### How do I read current totals?

```javascript
const costs = db.client.costs;
console.log(costs.total);
console.log(costs.requests.counts);  // request-based
console.log(costs.rows.counts);      // row-based
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

Yes, by mutating the pricing tables at runtime:

```javascript
const costs = db.plugins.CostsPlugin.getCosts();

// Request-based providers
costs.requests.prices.get = 0.0005 / 1000;

// Row-based providers
costs.rows.prices.readPerMillion = 0.0005;
```

### Can I force a specific provider?

Yes, use the `provider` option:

```javascript
new CostsPlugin({ provider: 'cloudflare-r2' })
new CostsPlugin({ provider: 'turso', tursoPlan: 'scaler' })
```

### Can I reset counters?

There is no dedicated reset API today.
The common approach is restarting the process or reinitializing the database/plugin instance.

### Is row tracking accurate for SQL backends?

The plugin tracks rows per s3db.js operation:
- `get(id)` = 1 row read
- `insert(data)` = 1 row written (+ 1 row read if checking for existing)
- `update(id, data)` = 1 row read + 1 row written
- `patch(id, data)` = 1 row read + 1 row written
- `delete(id)` = 1 row written
- `list()` = N rows read (N = number of results)

This matches the actual SQL operations performed by RemoteSqliteClient.
