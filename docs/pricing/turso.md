# Turso Pricing

> Collected on **2026-03-31** from [turso.tech/pricing](https://turso.tech/pricing).
> Prices below are for **yearly billing**. Monthly billing is slightly higher.

## Pricing Model

Turso charges a **base plan fee** plus usage-based overages for storage, rows read, rows written, and embedded syncs. There are **no egress fees**.

Unlike Cloudflare D1 (which is bundled into the Workers platform), Turso is a standalone service with its own plan tiers.

## Plans

| | Free | Developer | Scaler | Pro |
|---|------|-----------|--------|-----|
| **Price/month** | $0 | $4.99 | $24.92 | $416.58 |
| **Databases** | 100 | Unlimited | Unlimited | Unlimited |
| **Active DBs/month** | 100 | 500 | 2,500 | 10,000 |
| **Storage included** | 5 GB | 9 GB | 24 GB | 50 GB |
| **Rows read/month** | 500M | 2.5B | 100B | 250B |
| **Rows written/month** | 10M | 25M | 100M | 250M |
| **Embedded syncs** | 3 GB | 10 GB | 24 GB | 100 GB |
| **Point-in-Time Restore** | 1 day | 10 days | 30 days | 90 days |
| **Audit logs** | — | 3 days | 14 days | 30 days |
| **Teams** | — | — | Yes | Yes |
| **DPA** | — | — | Yes | Yes |
| **SSO** | — | — | — | Yes |
| **BYOK Encryption** | — | — | — | Yes |
| **HIPAA / SOC2** | — | — | — | Yes |
| **Support** | Community | Community | Community | Priority Email & Slack |

## Overage Costs

| Metric | Developer | Scaler | Pro |
|--------|-----------|--------|-----|
| Active databases | $0.20/db | $0.05/db | $0.025/db |
| Storage | **$0.75/GB** | **$0.50/GB** | **$0.45/GB** |
| Rows read | **$1.00/billion** | **$0.80/billion** | **$0.75/billion** |
| Rows written | **$1.00/million** | **$0.80/million** | **$0.75/million** |
| Embedded syncs | $0.35/GB | $0.25/GB | $0.15/GB |

### Normalized overage per operation

| Metric | Developer | Scaler | Pro |
|--------|-----------|--------|-----|
| Per 1M rows read | $0.001 | $0.0008 | $0.00075 |
| Per 1M rows written | $1.00 | $0.80 | $0.75 |
| Per 1 row read | $0.000000001 | $0.0000000008 | $0.00000000075 |
| Per 1 row written | $0.000001 | $0.0000008 | $0.00000075 |

## Data Transfer (Egress)

| | Cost |
|---|------|
| Data transfer OUT to internet | **Free** |
| Data transfer IN from internet | **Free** |

## Free Tier

| | Included |
|---|---------|
| Databases | 100 |
| Active databases/month | 100 |
| Storage | 5 GB |
| Rows read | 500 million/month |
| Rows written | 10 million/month |
| Embedded syncs | 3 GB/month |
| Point-in-Time Restore | 1 day |

The free tier is permanent (does not expire). When limits are hit, queries are blocked until the next billing cycle or you upgrade.

## Embedded Replicas (Unique Feature)

Turso's embedded replicas let you run a local SQLite file that syncs with the remote Turso database. Reads go to the local file (zero network latency), writes go to the remote primary.

```javascript
import { createClient } from '@libsql/client'

const client = createClient({
  url: 'file:local-replica.db',
  syncUrl: 'libsql://my-db-my-org.turso.io',
  authToken: 'YOUR_TOKEN'
})

await client.sync() // Pull latest from remote
```

Sync traffic is billed separately under "Monthly Syncs". This is useful for applications that need sub-millisecond read latency while maintaining a remote primary for durability.

## Turso vs Cloudflare D1 (Head to Head)

Comparing Turso Developer ($4.99/mo) vs D1 Workers Paid ($5/mo):

| Metric | Turso Developer | Cloudflare D1 | Winner |
|--------|----------------|---------------|--------|
| Base cost | $4.99/mo | ~$5/mo | Tie |
| Storage included | **9 GB** | 5 GB | Turso |
| Storage overage | $0.75/GB | $0.75/GB | Tie |
| Reads included | 2.5B/mo | **25B/mo** | D1 (10x more) |
| Writes included | 25M/mo | **50M/mo** | D1 (2x more) |
| Read overage | $0.001/M | $0.001/M | Tie |
| Write overage | $1.00/M | $1.00/M | Tie |
| Egress | Free | Free | Tie |
| Embedded replicas | **Yes** | No | Turso |
| Worker binding latency | N/A | ~1-5ms | D1 |
| Point-in-Time Restore | **10 days** | No | Turso |
| Works outside Cloudflare | **Yes** | No | Turso |

**Key differences**:
- D1 includes 10x more reads and 2x more writes in the base plan
- Turso includes more storage (9 GB vs 5 GB)
- Turso has embedded replicas for zero-latency local reads
- Turso works in any runtime; D1 is fastest inside Cloudflare Workers
- Turso has PITR; D1 does not

At higher tiers, Turso Scaler ($24.92/mo) includes 100B reads/month — far more than D1's 25B — making it better for ultra-read-heavy workloads.

## How s3db.js Uses Turso

s3db.js connects to Turso via `@libsql/client` through the `RemoteSqliteClient`. The operation mapping is the same as D1:

| s3db operation | SQL | Turso billing |
|----------------|-----|---------------|
| `get(id)` | `SELECT ... WHERE bucket=? AND key=?` | 1 row read |
| `insert(data)` | `INSERT ... ON CONFLICT DO UPDATE` | 1 row written |
| `update(id, data)` | 1 SELECT + 1 UPSERT | 1 row read + 1 row written |
| `patch(id, data)` | 1 SELECT + 1 UPSERT | 1 row read + 1 row written |
| `replace(id, data)` | 1 UPSERT | 1 row written |
| `delete(id)` | `DELETE WHERE bucket=? AND key=?` | 1 row written |
| `list()` | `SELECT ... WHERE key LIKE ?` | N rows read |
| `count()` | `SELECT COUNT(*)` | N rows read (table scan) |

## Connection Strings

```javascript
// Turso cloud
'sqlite+libsql://my-db-my-org.turso.io?authToken=YOUR_TOKEN'

// Self-hosted libsql server
'sqlite+libsql://localhost:8080'
```

Requires `@libsql/client` as a peer dependency:

```bash
pnpm add @libsql/client
```

## See Also

- [Choosing a Backend](/guides/choosing-a-backend.md) — Scenario comparisons
- [SqliteClient docs](/clients/sqlite-client.md) — Client configuration reference
- [Cloudflare D1 Pricing](cloudflare-d1.md) — D1 comparison
- [Turso Pricing (official)](https://turso.tech/pricing)
