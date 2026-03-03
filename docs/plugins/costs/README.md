# 💸 Costs Plugin

> Real-time usage and cost visibility for requests, storage, and transfer.
>
> **Navigation:** [← Plugin Index](/plugins/README.md) | [Guides ↓](#-documentation-index)

---

## ⚡ TLDR

Use `CostsPlugin` to answer three questions in production:
1. How many S3 operations are we doing?
2. What is the estimated USD impact?
3. Which resources/plugins are driving cost?

```javascript
import { Database, CostsPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://KEY:SECRET@bucket/app' });
await db.usePlugin(new CostsPlugin({ considerFreeTier: true }));
await db.connect();

const costsPlugin = db.plugins.CostsPlugin;
const last24h = costsPlugin.snapshot({ windowMs: 24 * 60 * 60 * 1000 });
const monthProjection = costsPlugin.estimate({ days: 30, includePluginEstimates: true });
```

---

## 🚀 Quick Start

```javascript
import { Database, CostsPlugin } from 's3db.js';

const db = new Database({
  connectionString: 's3://ACCESS:SECRET@my-bucket/prod'
});

await db.usePlugin(new CostsPlugin({
  considerFreeTier: true,
  historyRetentionMs: 30 * 24 * 60 * 60 * 1000
}));

await db.connect();

// ... normal operations
const users = db.resources.users;
await users.insert({ id: 'u1', name: 'Ana' });
await users.get('u1');

const costs = db.client.costs;
console.log('Total USD:', costs.total);
console.log('Requests by method:', costs.requests.counts);
console.log('Usage by resource:', costs.usage.byResource);
```

---

## 📦 What the Plugin Tracks

1. Requests:
`put`, `copy`, `list`, `get`, `head`, `delete` counters and subtotal.
2. Storage:
tracked bytes, GB, and estimated monthly storage subtotal.
3. Data transfer:
`inBytes`/`outBytes` and transfer subtotal (with optional free-tier mode).
4. Usage dimensions:
history points by timestamp with `resource`, `plugin`, `method`, `command`.
5. Estimation:
window snapshots and forward projections with optional plugin-level estimates.

---

## 📋 Documentation Index

| Guide | Focus |
|-------|-------|
| [Configuration](/plugins/costs/guides/configuration.md) | Options, pricing tables, and data model |
| [Usage Patterns](/plugins/costs/guides/usage-patterns.md) | `snapshot()` and `estimate()` in real workflows |
| [Cost Optimization](/plugins/costs/guides/cost-optimization.md) | Concrete actions to reduce request volume/cost |
| [Best Practices](/plugins/costs/guides/best-practices.md) | Production checklist, pitfalls, FAQ |

---

## 🔎 Core APIs

```javascript
const costsPlugin = db.plugins.CostsPlugin;

// Raw session counters (live object)
db.client.costs;

// Windowed observed usage
costsPlugin.snapshot({
  windowMs: 60 * 60 * 1000, // last hour
  resource: 'users',         // optional
  plugin: 's3-queue'         // optional
});

// Projection for planning
costsPlugin.estimate({
  days: 30,
  observedWindowMs: 24 * 60 * 60 * 1000,
  requestMultiplier: 1.2,
  includePluginEstimates: true
});
```

---

## 📚 See Also

- [S3 Queue Plugin](/plugins/s3-queue/README.md)
- [Cache Plugin](/plugins/cache/README.md)
- [TTL Plugin](/plugins/ttl/README.md)
