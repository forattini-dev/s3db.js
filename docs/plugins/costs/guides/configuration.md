# Configuration

> Plugin options, provider pricing, and data structure.

**Navigation:** [<- Back to Costs Plugin](/plugins/costs/README.md)

---

## Plugin Options

```javascript
import { CostsPlugin } from 's3db.js';

await db.usePlugin(new CostsPlugin({
  considerFreeTier: true,
  region: 'us-east-1',
  historyRetentionMs: 30 * 24 * 60 * 60 * 1000,
  estimateDefaultWindowMs: 24 * 60 * 60 * 1000,
  maxHistoryPoints: 200000,
  provider: 'cloudflare-r2',   // optional: skip auto-detection
  tursoPlan: 'scaler'          // optional: Turso plan tier
}));
```

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `considerFreeTier` | `boolean` | `false` | Applies free-tier deduction on transfer-out estimate |
| `region` | `string` | `us-east-1` | Region tag for your pricing context |
| `historyRetentionMs` | `number` | `30 days` | Retention for usage points used in snapshots |
| `estimateDefaultWindowMs` | `number` | `24h` | Default observed window for `estimate()` |
| `maxHistoryPoints` | `number` | `200000` | Safety cap for in-memory usage history |
| `provider` | `CostsProvider` | auto-detected | Force a specific provider instead of auto-detecting |
| `tursoPlan` | `TursoPlan` | `'developer'` | Turso plan tier (affects row pricing and free tier) |

### Provider Values

`CostsProvider`: `'aws-s3'` | `'cloudflare-r2'` | `'cloudflare-d1'` | `'turso'` | `'self-hosted'`

### Turso Plan Values

`TursoPlan`: `'free'` | `'developer'` | `'scaler'` | `'pro'`

---

## Provider Pricing Tables

The plugin auto-detects the provider and applies the correct pricing. You can also override via the `provider` option.

### Request-Based Providers (S3, R2)

#### AWS S3 (us-east-1)

| Method | Cost per 1,000 |
|--------|---------------|
| `put` / `copy` / `list` / `post` | $0.005 |
| `get` / `select` / `head` | $0.0004 |
| `delete` | Free |

Storage tiers: $0.023/GB (first 50 TB), $0.022/GB (next 450 TB), $0.021/GB (over 500 TB).
Egress: $0.09/GB (first 10 TB), tiered down to $0.05/GB.

#### Cloudflare R2

| Class | Operations | Cost per million |
|-------|-----------|-----------------|
| Class A (writes) | PUT, COPY, LIST, POST | $4.50 |
| Class B (reads) | GET, HEAD | $0.36 |
| Free | DELETE | Free |

Storage: flat $0.015/GB.
Egress: **always free**.
Free tier (permanent): 10 GB storage, 1M Class A ops, 10M Class B ops.

### Row-Based Providers (D1, Turso)

#### Cloudflare D1

| Metric | Cost |
|--------|------|
| Rows read | $0.001 per million |
| Rows written | $1.00 per million |
| Storage | $0.75/GB |
| Egress | Free |

Free tier (Workers Paid plan, permanent): 25B reads/month, 50M writes/month, 5 GB storage.

#### Turso (varies by plan)

| Metric | Developer | Scaler | Pro |
|--------|-----------|--------|-----|
| Rows read (per million) | $0.001 | $0.0008 | $0.00075 |
| Rows written (per million) | $1.00 | $0.80 | $0.75 |
| Storage (per GB) | $0.75 | $0.50 | $0.45 |
| Reads included | 2.5B | 100B | 250B |
| Writes included | 25M | 100M | 250M |
| Base cost/month | $4.99 | $24.92 | $416.58 |

Egress: **always free** (all plans).

### Self-Hosted (MinIO, SQLite, Memory, Filesystem)

All costs are $0. The plugin still tracks operation counts for observability.

---

## Overriding Prices at Runtime

You can adjust pricing tables at runtime for custom contracts or non-standard pricing:

```javascript
const costs = db.plugins.CostsPlugin.getCosts();

// Override request prices
costs.requests.prices.get = 0.0005 / 1000;
costs.requests.prices.put = 0.006 / 1000;

// Override row prices (for D1/Turso)
costs.rows.prices.readPerMillion = 0.0005;
costs.rows.prices.writtenPerMillion = 0.50;
```

`getCosts()` preserves live references for pricing tables, so runtime adjustments apply immediately.

---

## Data Structure

### `getCosts()` Return Shape

```typescript
interface CostsData {
  provider: CostsProvider | null;          // detected or overridden provider
  pricingModel: 'request-based' | 'row-based';

  total: number;                           // total estimated USD

  requests: {
    prices: RequestPrices;                 // per-method pricing (live, mutable)
    counts: RequestCounts;                 // per-method counters
    events: RequestEvents;                 // per-command counters
    totalEvents: number;
    subtotal: number;                      // USD from requests (request-based only)
  };

  rows: {
    prices: { readPerMillion: number; writtenPerMillion: number };
    counts: { read: number; written: number };
    subtotal: number;                      // USD from rows (row-based only)
  };

  storage: {
    totalBytes: number;
    totalGB: number;
    tiers: StorageTier[];
    currentTier: number;
    subtotal: number;
  };

  dataTransfer: {
    inBytes: number; outBytes: number;
    inGB: number; outGB: number;
    tiers: DataTransferTier[];             // empty for R2/D1/Turso
    freeTierGB: number;
    subtotal: number;
  };

  usage: {
    totalEvents: number;
    byResource: Record<string, number>;
    byPlugin: Record<string, number>;
    points: CostUsagePoint[];              // windowed history
    lastUpdatedAt: string | null;          // ISO 8601
  };
}
```

### Usage Point Shape

Each tracked operation creates a usage point:

```typescript
interface CostUsagePoint {
  timestamp: string;         // ISO 8601
  command: string;           // 'PutObjectCommand', 'GetObjectCommand', etc.
  method: string;            // 'put', 'get', 'list', etc.
  requestCost: number;       // USD for this request (0 for row-based)
  bytesIn: number;
  bytesOut: number;
  rowsRead: number;          // rows read (SQL backends)
  rowsWritten: number;       // rows written (SQL backends)
  key: string | null;
  resource: string | null;
  plugin: string | null;
}
```

---

## Key APIs

```javascript
const costsPlugin = db.plugins.CostsPlugin;

// Windowed observed usage (includes rows for SQL backends)
const oneHour = costsPlugin.snapshot({ windowMs: 60 * 60 * 1000 });
oneHour.rowsRead;      // total rows read in window
oneHour.rowsWritten;   // total rows written in window
oneHour.rowCost;       // estimated USD from rows

// Projection (includes rows for SQL backends)
const nextMonth = costsPlugin.estimate({ days: 30, includePluginEstimates: true });
nextMonth.projected.rowsRead;
nextMonth.projected.rowsWritten;
nextMonth.projected.rowCost;
nextMonth.projected.totalCost;  // uses rowCost for row-based, requestCost for request-based
```

---

## Notes

1. `snapshot()` and `estimate()` are in-memory/session-based.
2. Restarting your process resets history unless you persist `client.costs`.
3. `estimate()` is a planning tool, not an invoice replacement.
4. For row-based providers, `requests.subtotal` is always $0 — costs come from `rows.subtotal`.
5. For request-based providers, `rows.subtotal` is always $0 — costs come from `requests.subtotal`.
6. `total` always reflects the correct cost model for the detected provider.
