# Costs Plugin

> Real-time usage and cost visibility for requests, storage, and transfer — with automatic provider detection.
>
> **Navigation:** [<- Plugin Index](/plugins/README.md) | [Guides](#-documentation-index)

---

## TLDR

`CostsPlugin` auto-detects your storage provider from the connection string and applies the correct pricing model:

- **AWS S3** — request-based (PUT/GET/LIST pricing + egress tiers)
- **Cloudflare R2** — request-based (Class A/B pricing, zero egress)
- **Cloudflare D1** — row-based (rows read/written pricing, zero egress)
- **Turso** — row-based (plan-based pricing with Developer/Scaler/Pro tiers)
- **MinIO / SQLite / Memory / Filesystem** — self-hosted ($0)

```javascript
import { Database, CostsPlugin } from 's3db.js';

// Auto-detects provider from connection string
const db = new Database({ connectionString: 'https://KEY:SECRET@ACCT.r2.cloudflarestorage.com/bucket' });
await db.usePlugin(new CostsPlugin({ considerFreeTier: true }));
await db.connect();

const costs = db.plugins.CostsPlugin.getCosts();
console.log(costs.provider);      // 'cloudflare-r2'
console.log(costs.pricingModel);  // 'request-based'
console.log(costs.total);         // estimated USD

const last24h = db.plugins.CostsPlugin.snapshot({ windowMs: 24 * 60 * 60 * 1000 });
const monthProjection = db.plugins.CostsPlugin.estimate({ days: 30, includePluginEstimates: true });
```

---

## Quick Start

### Object Storage (S3, R2)

```javascript
const db = new Database({
  connectionString: 's3://ACCESS:SECRET@my-bucket/prod'
});

await db.usePlugin(new CostsPlugin({ considerFreeTier: true }));
await db.connect();

// ... normal operations
await users.insert({ id: 'u1', name: 'Ana' });
await users.get('u1');

const costs = db.plugins.CostsPlugin.getCosts();
console.log('Total USD:', costs.total);
console.log('Requests:', costs.requests.counts);
```

### SQL Backend (D1, Turso)

```javascript
const db = new Database({
  connectionString: 'sqlite+d1://ACCOUNT/DB?apiToken=TOKEN'
});

await db.usePlugin(new CostsPlugin({ considerFreeTier: true }));
await db.connect();

await users.insert({ id: 'u1', name: 'Ana' });
await users.get('u1');

const costs = db.plugins.CostsPlugin.getCosts();
console.log('Provider:', costs.provider);       // 'cloudflare-d1'
console.log('Pricing:', costs.pricingModel);    // 'row-based'
console.log('Rows read:', costs.rows.counts.read);
console.log('Rows written:', costs.rows.counts.written);
console.log('Row cost:', costs.rows.subtotal);
```

### Manual Provider Override

```javascript
// Skip auto-detection, force Turso Scaler pricing
await db.usePlugin(new CostsPlugin({
  provider: 'turso',
  tursoPlan: 'scaler'
}));
```

---

## What the Plugin Tracks

### All Providers

1. **Requests**: `put`, `copy`, `list`, `get`, `head`, `delete` counters and event totals.
2. **Storage**: tracked bytes, GB, and estimated monthly storage subtotal.
3. **Usage dimensions**: history points by timestamp with `resource`, `plugin`, `method`, `command`.

### Request-Based Providers (S3, R2, self-hosted)

4. **Request costs**: per-method pricing (Class A for writes, Class B for reads).
5. **Data transfer**: `inBytes`/`outBytes` and transfer subtotal (with optional free-tier deduction).

### Row-Based Providers (D1, Turso)

4. **Row costs**: `rows.counts.read`, `rows.counts.written`, and `rows.subtotal`.
5. **Zero egress**: data transfer is always free.

---

## Provider Detection

The plugin detects the provider from the connection string during `onInstall`:

| Connection String | Detected Provider |
|---|---|
| `s3://KEY:SECRET@bucket` | `aws-s3` |
| `https://...r2.cloudflarestorage.com/bucket` | `cloudflare-r2` |
| `https://...amazonaws.com/bucket` | `aws-s3` |
| `sqlite+d1://accountId/dbId?apiToken=...` | `cloudflare-d1` |
| `sqlite+libsql://db-org.turso.io?authToken=...` | `turso` |
| `sqlite+libsql://localhost:8080` | `self-hosted` |
| `memory://bucket`, `file://...`, `sqlite://...` | `self-hosted` |
| `http://localhost:9000/bucket` | `self-hosted` |

---

## Documentation Index

| Guide | Focus |
|-------|-------|
| [Configuration](/plugins/costs/guides/configuration.md) | Options, provider pricing tables, and data model |
| [Usage Patterns](/plugins/costs/guides/usage-patterns.md) | `snapshot()` and `estimate()` in real workflows |
| [Cost Optimization](/plugins/costs/guides/cost-optimization.md) | Concrete actions to reduce request volume/cost |
| [Best Practices](/plugins/costs/guides/best-practices.md) | Production checklist, pitfalls, FAQ |

---

## Core APIs

```javascript
const costsPlugin = db.plugins.CostsPlugin;

// Full cost data with provider info
const costs = costsPlugin.getCosts();
costs.provider;      // 'aws-s3' | 'cloudflare-r2' | 'cloudflare-d1' | 'turso' | 'self-hosted'
costs.pricingModel;  // 'request-based' | 'row-based'
costs.rows;          // { prices, counts, subtotal } — active for D1/Turso
costs.requests;      // { prices, counts, events, subtotal }

// Windowed observed usage
costsPlugin.snapshot({
  windowMs: 60 * 60 * 1000,  // last hour
  resource: 'users',          // optional
  plugin: 's3-queue'          // optional
});
// Returns: { totalRequests, requestCost, rowsRead, rowsWritten, rowCost, ... }

// Projection for planning
costsPlugin.estimate({
  days: 30,
  observedWindowMs: 24 * 60 * 60 * 1000,
  requestMultiplier: 1.2,
  includePluginEstimates: true
});
// Returns: { projected: { totalCost, requestCost, rowCost, rowsRead, rowsWritten, ... } }
```

---

## See Also

- [Choosing a Backend](/guides/choosing-a-backend.md) — Scenario-based backend comparisons with pricing
- [Pricing Reference](/pricing/README.md) — Per-provider pricing details
- [S3 Queue Plugin](/plugins/s3-queue/README.md)
- [Cache Plugin](/plugins/cache/README.md)
- [TTL Plugin](/plugins/ttl/README.md)
