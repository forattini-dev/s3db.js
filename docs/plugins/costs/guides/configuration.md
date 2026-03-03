# Configuration

> Plugin options, pricing behavior, and data structure.

**Navigation:** [← Back to Costs Plugin](/plugins/costs/README.md)

---

## Plugin Options

```javascript
import { CostsPlugin } from 's3db.js';

await db.usePlugin(new CostsPlugin({
  considerFreeTier: true,
  region: 'us-east-1',
  historyRetentionMs: 30 * 24 * 60 * 60 * 1000,
  estimateDefaultWindowMs: 24 * 60 * 60 * 1000,
  maxHistoryPoints: 200000
}));
```

| Option | Type | Default | Purpose |
|-------|------|---------|---------|
| `considerFreeTier` | `boolean` | `false` | Applies free-tier deduction on transfer-out estimate |
| `region` | `string` | `us-east-1` | Region tag for your pricing context |
| `historyRetentionMs` | `number` | `30 days` | Retention for usage points used in snapshots |
| `estimateDefaultWindowMs` | `number` | `24h` | Default observed window for `estimate()` |
| `maxHistoryPoints` | `number` | `200000` | Safety cap for in-memory usage history |

---

## Pricing Model Used by Default

### Request pricing
- `put/copy/list/post`: `0.005 / 1000`
- `get/select/head/delete`: `0.0004 / 1000`

### Storage pricing (S3 Standard reference)
- Tier 1: first `50 TB` at `0.023 / GB`
- Tier 2: next `450 TB` at `0.022 / GB`
- Tier 3: above `500 TB` at `0.021 / GB`

### Transfer-out pricing
- Tier 1: first `10 TB` at `0.09 / GB`
- Tier 2: next `40 TB` at `0.085 / GB`
- Tier 3: next `100 TB` at `0.07 / GB`
- Tier 4: above `150 TB` at `0.05 / GB`

If `considerFreeTier=true`, the plugin applies free-tier deduction on transfer-out calculation.

---

## Overriding Prices

You can adjust request prices at runtime for your environment.

```javascript
const costs = db.plugins.CostsPlugin.getCosts();

costs.requests.prices.get = 0.0005 / 1000;
costs.requests.prices.put = 0.006 / 1000;
```

Use this when:
- your provider is not AWS S3 Standard
- your contract has custom pricing
- you want tighter internal forecasting

---

## Data Structure

Main access point:

```javascript
const costs = db.client.costs;
```

Top-level fields:
- `costs.total`
- `costs.requests`
- `costs.storage`
- `costs.dataTransfer`
- `costs.usage`

`costs.usage` contains:
- `totalEvents`
- `byResource`
- `byPlugin`
- `points` (windowed history entries)
- `lastUpdatedAt`

---

## Key APIs

```javascript
const costsPlugin = db.plugins.CostsPlugin;

// Windowed observed usage
const oneHour = costsPlugin.snapshot({ windowMs: 60 * 60 * 1000 });

// Projection
const nextMonth = costsPlugin.estimate({
  days: 30,
  includePluginEstimates: true
});
```

---

## Notes

1. `snapshot()` and `estimate()` are in-memory/session-based.
2. Restarting your process resets history unless you persist `client.costs`.
3. `estimate()` is a planning tool, not an invoice replacement.
