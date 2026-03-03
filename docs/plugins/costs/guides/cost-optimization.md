# Cost Optimization

> Practical actions to reduce S3 request volume and total cost.

**Navigation:** [← Back to Costs Plugin](/plugins/costs/README.md) | [Usage Patterns](/plugins/costs/guides/usage-patterns.md)

---

## Priority Order

| Priority | Action | Typical Impact |
|---|---|---|
| 1 | Remove offset/list scans in hot paths | High |
| 2 | Add caching for read-heavy routes | High |
| 3 | Tune polling plugins (`s3-queue`) | High |
| 4 | Avoid unnecessary `HEAD` after `GET` | Medium |
| 5 | Reduce transfer payload size | Medium |
| 6 | Data lifecycle cleanup | Medium |

---

## 1. Eliminate Expensive Pagination Patterns

Use cursor/token flow in APIs and internals where possible.

Why:
- offset-like behavior over S3 often causes extra list scans
- list scans amplify request and transfer cost

Measure with:
```javascript
const before = db.plugins.CostsPlugin.snapshot({ windowMs: 30 * 60 * 1000 });
// deploy cursor pagination
const after = db.plugins.CostsPlugin.snapshot({ windowMs: 30 * 60 * 1000 });
```

---

## 2. Cache Aggregated Reads

Read-heavy endpoints benefit from cache plugins:
- list pages
- count-like dashboards
- repeated lookups by id

Target:
- lower `get/head/list` counts in `snapshot().byMethod`.

---

## 3. Tune Queue Polling

For queue-like plugins:
- increase idle interval bounds (`maxPollInterval`)
- avoid excessive worker concurrency for low traffic
- limit ticket scans

Track impact:
```javascript
const queueView = db.plugins.CostsPlugin.snapshot({
  windowMs: 24 * 60 * 60 * 1000,
  plugin: 's3-queue'
});
console.log(queueView.byMethod, queueView.totalRequests);
```

---

## 4. Remove Redundant Round-Trips

Common wins:
- avoid `GET + HEAD` when a single response already carries needed metadata
- avoid read-before-write when not required for consistency semantics
- batch deletes and writes when behavior allows

---

## 5. Reduce Transfer Size

Use:
- compact payloads
- selective projection
- compression for large objects when appropriate

This reduces `bytesOut` and `estimatedDataTransferOutCost` in snapshots.

---

## 6. Apply Lifecycle Policies

Retain only necessary records:
- TTL
- archival
- periodic cleanup jobs

This keeps storage growth and future list/read operations under control.

---

## Optimization Workflow

1. Capture baseline:
```javascript
const baseline = db.plugins.CostsPlugin.estimate({ days: 30 });
```
2. Apply one optimization.
3. Re-run the same workload.
4. Compare:
`projected.totalRequests`, `projected.totalCost`, `observed.byMethod`.
5. Keep only changes with measurable gain.

---

## What “Good” Looks Like

- Request growth is proportional to business volume, not super-linear.
- `list/head` ratio remains stable under scale.
- Queue idle traffic stays bounded.
- Monthly projection remains within budget envelope with headroom.
