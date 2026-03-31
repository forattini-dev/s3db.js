# Cost Optimization

> Practical actions to reduce costs across all supported providers.

**Navigation:** [<- Back to Costs Plugin](/plugins/costs/README.md) | [Usage Patterns](/plugins/costs/guides/usage-patterns.md)

---

## Priority by Provider

### Object Storage (S3, R2)

| Priority | Action | Typical Impact |
|---|---|---|
| 1 | Remove offset/list scans in hot paths | High |
| 2 | Add caching for read-heavy routes | High |
| 3 | Tune polling plugins (`s3-queue`) | High |
| 4 | Avoid unnecessary `HEAD` after `GET` | Medium |
| 5 | Reduce transfer payload size (S3 only) | Medium |
| 6 | Data lifecycle cleanup | Medium |

### SQL Backends (D1, Turso)

| Priority | Action | Typical Impact |
|---|---|---|
| 1 | Use `get(id)` instead of `query()` for single records | High |
| 2 | Use partitions to scope `list()` and `query()` | High |
| 3 | Add caching for repeated reads | High |
| 4 | Use `replace()` instead of `update()` when you have full data | Medium |
| 5 | Batch operations where possible | Medium |
| 6 | Monitor row counts with `snapshot().rowsRead` | Low |

---

## 1. Eliminate Expensive Pagination Patterns

Use cursor/token flow in APIs and internals where possible.

Why:
- offset-like behavior causes extra scans (list on S3, SELECT on SQL)
- scans amplify request cost (S3/R2) and row-read cost (D1/Turso)

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
- **S3/R2**: lower `get/head/list` counts in `snapshot().byMethod`
- **D1/Turso**: lower `rowsRead` in `snapshot().rowsRead`

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
- use `replace()` instead of `update()` when you have the full record (saves 1 read)
- batch deletes and writes when behavior allows

For SQL backends, `replace()` is 1 UPSERT (1 write) vs `update()` which is SELECT + UPSERT (1 read + 1 write).

---

## 5. Reduce Transfer Size (S3 Only)

Use:
- compact payloads
- selective projection
- compression for large objects when appropriate

This reduces `bytesOut` and `estimatedDataTransferOutCost` in snapshots.

**Note:** R2, D1, and Turso have zero egress costs, so transfer size does not affect your bill.

---

## 6. Apply Lifecycle Policies

Retain only necessary records:
- TTL
- archival
- periodic cleanup jobs

This keeps storage growth and future list/read operations under control.

**Storage cost varies significantly by provider:**
| Provider | Storage $/GB |
|----------|-------------|
| R2 | $0.015 |
| S3 | $0.023 |
| Turso Scaler | $0.50 |
| D1 / Turso Dev | $0.75 |

For D1/Turso, storage costs per GB are 30-50x higher than object storage. Keep data lean.

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
For row-based: also check `projected.rowsRead`, `projected.rowsWritten`, `projected.rowCost`.
5. Keep only changes with measurable gain.

---

## What "Good" Looks Like

- Request/row growth is proportional to business volume, not super-linear.
- `list/head` ratio remains stable under scale.
- Queue idle traffic stays bounded.
- Monthly projection remains within budget envelope with headroom.
- For D1/Turso: reads stay within included free tier (25B for D1, 100B for Turso Scaler).
