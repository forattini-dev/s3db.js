# Choosing a Backend

s3db.js supports multiple storage backends. This guide helps you choose the right one based on your workload, budget, and deployment target.

For detailed per-provider pricing, see the [Pricing Reference](/pricing/README.md).

## Backend Overview

| Backend | Protocol | Type | Best For |
|---------|----------|------|----------|
| [AWS S3](#aws-s3) | `s3://` | Object storage (cloud) | Production, distributed, large datasets |
| [Cloudflare R2](#cloudflare-r2) | `https://...r2.cloudflarestorage.com` | S3-compatible object storage | Production with zero egress costs |
| [Cloudflare D1](#cloudflare-d1) | `sqlite+d1://` | Serverless SQLite (edge) | Read-heavy workloads, small-medium datasets |
| [Turso / libsql](#turso--libsql) | `sqlite+libsql://` | Remote SQLite | Edge reads, embedded replicas, multi-runtime |
| [MinIO](#minio) | `http://` | S3-compatible object storage | Self-hosted, on-premise, local dev |
| [SQLite (local)](#sqlite-local) | `sqlite://` | Embedded SQLite | Local dev, CI, single-process services |
| [Memory](#memory) | `memory://` | In-memory | Tests (100-1000x faster) |
| [Filesystem](#filesystem) | `file://` | Local files | Local dev, edge deployments |

## Decision Flowchart

```
                        What's your use case?
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                  ▼
       ┌─────────┐      ┌─────────┐        ┌─────────┐
       │ Testing │      │  Local  │        │Production│
       │         │      │   Dev   │        │         │
       └────┬────┘      └────┬────┘        └────┬────┘
            │                │                   │
            ▼                ▼                   │
     ┌────────────┐   ┌────────────┐             │
     │  Memory    │   │  SQLite or │      ┌──────┴──────┐
     │  Client    │   │   MinIO    │      │             │
     └────────────┘   └────────────┘      ▼             ▼
                                    Data < 50GB?   Data > 50GB?
                                         │              │
                                    ┌────┴────┐    ┌────┴────┐
                                    │Read or  │    │ S3 / R2 │
                                    │query    │    │         │
                                    │heavy?   │    └─────────┘
                                    └────┬────┘
                               ┌────────┴──┐
                               ▼           ▼
                          ┌─────────┐ ┌─────────┐
                          │ D1 or   │ │ R2 / S3 │
                          │ Turso   │ │         │
                          └─────────┘ └─────────┘
```

## Pricing Summary

All prices are monthly, pay-as-you-go. For full details see each provider's pricing page.

### Storage

| Backend | $/GB/month | Free Tier |
|---------|-----------|-----------|
| Cloudflare R2 | **$0.015** | 10 GB |
| AWS S3 Standard | **$0.023** | 5 GB (first 12 months) |
| Turso (Scaler) | **$0.50** | 24 GB included |
| Cloudflare D1 | **$0.75** | 5 GB |
| Turso (Developer) | **$0.75** | 9 GB included |

### Reads

| Backend | Cost per 1M operations | Free Tier |
|---------|----------------------|-----------|
| D1 | **$0.001** / 1M rows | 25B rows/month |
| Turso Dev | **$0.001** / 1M rows | 2.5B rows/month |
| Turso Scaler | **$0.0008** / 1M rows | 100B rows/month |
| R2 | **$0.36** / 1M GETs | 10M/month |
| AWS S3 | **$0.40** / 1M GETs | — |

### Writes

| Backend | Cost per 1M operations | Free Tier |
|---------|----------------------|-----------|
| Turso Scaler | **$0.80** / 1M rows | 100M rows/month |
| D1 | **$1.00** / 1M rows | 50M rows/month |
| Turso Dev | **$1.00** / 1M rows | 25M rows/month |
| R2 | **$4.50** / 1M PUTs | 1M/month |
| AWS S3 | **$5.00** / 1M PUTs | — |

### Egress

| Backend | $/GB (to internet) |
|---------|-------------------|
| Cloudflare R2 | **$0.00** |
| Cloudflare D1 | **$0.00** |
| Turso | **$0.00** |
| MinIO | **$0.00** (self-hosted) |
| AWS S3 | **$0.09** (first 10 TB) |

### Base Plan Cost

| Backend | Monthly fee |
|---------|------------|
| AWS S3 | $0 (pay per use) |
| Cloudflare R2 | $0 (pay per use) |
| Cloudflare D1 | ~$5 (Workers Paid plan) |
| Turso Developer | $4.99 |
| Turso Scaler | $24.92 |
| Turso Pro | $416.58 |

## Scenario Comparisons

### Small app (10 GB, 1M reads/month, 100K writes/month)

| | AWS S3 | R2 | D1 | Turso Dev |
|---|--------|-----|-----|-----------|
| Base | — | — | ~$5 | $4.99 |
| Storage | $0.23 | $0.15 | $3.75 | $0.75 |
| Reads | $0.40 | $0.00 | included | included |
| Writes | $0.50 | $0.00 | included | included |
| Egress (~5 GB) | $0.45 | $0.00 | $0.00 | $0.00 |
| **Total** | **$1.58** | **$0.15** | **~$8.75** | **$5.74** |

Winner: **R2** (cheapest by far). S3 second if no plan fee is acceptable.

### Medium app (100 GB, 50M reads/month, 5M writes/month)

| | AWS S3 | R2 | D1 | Turso Scaler |
|---|--------|-----|-----|-------------|
| Base | — | — | ~$5 | $24.92 |
| Storage | $2.30 | $1.50 | $71.25 | $38.00 |
| Reads | $20.00 | $1.80 | included | included |
| Writes | $25.00 | $22.50 | included | included |
| Egress (~50 GB) | $4.50 | $0.00 | $0.00 | $0.00 |
| **Total** | **$51.80** | **$25.80** | **~$76.25** | **$62.92** |

Winner: **R2**. Storage cost dominates for D1/Turso at this volume.

### Read-heavy app (10 GB, 1B reads/month, 100K writes/month)

| | AWS S3 | R2 | D1 | Turso Dev |
|---|--------|-----|-----|-----------|
| Base | — | — | ~$5 | $4.99 |
| Storage | $0.23 | $0.15 | $3.75 | $0.75 |
| Reads | $400.00 | $360.00 | included | included |
| Writes | $0.50 | $0.00 | included | included |
| Egress (~100 GB) | $9.00 | $0.00 | $0.00 | $0.00 |
| **Total** | **$409.73** | **$360.15** | **~$8.75** | **$5.74** |

Winner: **Turso Dev** / **D1**. SQL backends destroy object storage on reads because single-record lookups are always 1 row vs 1 API request, and the free quotas are massive.

### Ultra-read-heavy app (10 GB, 100B reads/month, 1M writes/month)

| | AWS S3 | D1 | Turso Dev | Turso Scaler |
|---|--------|-----|-----------|--------------|
| Base | — | ~$5 | $4.99 | $24.92 |
| Storage | $0.23 | $3.75 | $0.75 | included |
| Reads | $40,000 | $75.00 | $97.50 | included |
| Writes | $5.00 | included | included | included |
| Egress | $90.00 | $0.00 | $0.00 | $0.00 |
| **Total** | **$40,095** | **~$83.75** | **$103.24** | **$24.92** |

Winner: **Turso Scaler** — 100B reads included for $24.92/month is unbeatable at this volume.

### Write-heavy app (10 GB, 10M reads/month, 50M writes/month)

| | AWS S3 | D1 | Turso Dev | Turso Scaler |
|---|--------|-----|-----------|--------------|
| Base | — | ~$5 | $4.99 | $24.92 |
| Storage | $0.23 | $3.75 | $0.75 | included |
| Reads | $4.00 | included | included | included |
| Writes | $250.00 | included | $25.00 | included |
| Egress | $9.00 | $0.00 | $0.00 | $0.00 |
| **Total** | **$263.23** | **~$8.75** | **$30.74** | **$24.92** |

Winner: **D1** (50M writes included). Turso Scaler close second (100M writes included but higher base cost).

### Large dataset (1 TB, 500M reads/month, 50M writes/month)

| | AWS S3 | R2 | D1 | Turso Scaler |
|---|--------|-----|-----|--------------|
| Base | — | — | ~$5 | $24.92 |
| Storage | $23.55 | $15.36 | $764.25 | $500.00 |
| Reads | $200.00 | $180.00 | included | included |
| Writes | $250.00 | $225.00 | included | included |
| Egress (~200 GB) | $18.00 | $0.00 | $0.00 | $0.00 |
| **Total** | **$491.55** | **$420.36** | **~$769.25** | **$524.92** |

Winner: **R2** for cost. **S3** if you need the AWS ecosystem. SQL backends lose at this storage volume.

## When to Use What

| Situation | Best Backend | Why |
|-----------|-------------|-----|
| Read-heavy, < 50 GB | **D1 or Turso** | Reads are essentially free at this scale |
| Ultra-high reads (100B+/month) | **Turso Scaler** | 100B reads included for $24.92 |
| Write-heavy, < 50 GB | **D1** | 50M writes included in base plan |
| Large dataset (100 GB+) | **S3 or R2** | Storage 15-32x cheaper |
| Zero egress costs | **R2, D1, or Turso** | All three have $0 egress |
| Inside Cloudflare Workers | **D1** | Native binding = ~1-5ms latency |
| Any runtime, edge reads | **Turso** | Embedded replicas for 0ms local reads |
| Self-hosted / air-gapped | **MinIO** | Full control, S3-compatible |
| Compliance (HIPAA/SOC2) | **Turso Pro** or **S3** | Turso Pro has built-in; S3 needs manual config |
| Local dev | **SQLite or MinIO** | Zero cost, zero network |
| Tests | **Memory** | 100-1000x faster |

## Data Size × Workload Matrix

This section helps you choose the optimal backend based on two dimensions: **how big your records are** and **what your access pattern looks like**.

### Understanding Data Size Tiers

s3db.js stores each record as a storage object. On object-storage backends (S3, R2), the record's fields are encoded into **object metadata** first. When metadata is full, remaining fields overflow to the **object body**.

| Tier | Record Size | What Happens | Metadata Behavior |
|------|------------|--------------|-------------------|
| **Small** | < 2 KB | Fits entirely in S3/R2 metadata | All fields in metadata. `patch()` uses HEAD+COPY (no body fetch). Fastest possible. |
| **Medium** | 2 KB – 8 KB | Overflows on S3, fits on R2 | **S3**: `body-overflow` triggers — partial metadata + body JSON. `patch()` falls back to GET+PUT. **R2**: still fits in 8 KB metadata — no overflow, same speed as Small. |
| **Large** | 8 KB – 2 MB | Overflows on all object-storage backends | Body always needed. `body-only` behavior recommended. On D1/Turso: single row, still 1 read. **D1 hard limit: 2 MB per row**. |
| **Extra Large** | 2 MB+ | Binary attachments, files, images | Exceeds D1 row limit. Only S3/R2 can handle this natively (up to 5 TB). |

**Metadata limits by backend**:

| Backend | Metadata Limit | Max Object/Row Size | Notes |
|---------|---------------|---------------------|-------|
| AWS S3 | **2 KB** (2,047 bytes) | 5 TB | Overflow to body after ~2 KB |
| Cloudflare R2 | **8 KB** (8,192 bytes) | 5 TiB | 4x more metadata than S3 — fewer overflows |
| Cloudflare D1 | N/A (single row) | **2 MB per row** | Metadata + body in one SQL row |
| Turso | N/A (single row) | ~2 GB (SQLite limit) | Practical, but very large rows hurt performance |
| RemoteSqliteClient default | 2 KB (configurable) | 5 GB (configurable) | `metadataLimit` and `maxObjectSize` in config |

### The Matrix

Each cell shows the **recommended backend** and the estimated monthly cost for the scenario. Assumptions: 10 GB stored data, costs based on paid tier pricing.

#### Small Records (< 2 KB per record)

All fields fit in metadata on every backend. This is the cheapest tier — operations are minimal, no body overhead.

| | Balanced (1M reads, 1M writes/mo) | Heavy Read (1B reads, 100K writes/mo) | Heavy Write (100K reads, 10M writes/mo) |
|---|---|---|---|
| **Best backend** | **R2** | **D1 or Turso** | **D1** |
| R2 cost | storage $0.15 + reads $0.36 + writes $4.50 = **$5.01** | storage $0.15 + reads $360 = **$360** | storage $0.15 + writes $45 = **$45** |
| S3 cost | $0.23 + $0.40 + $5.00 + egress = **~$7** | $0.23 + $400 + egress = **~$420** | $0.23 + $50 + egress = **~$55** |
| D1 cost | ~$5 base + $3.75 storage = **~$9** (all ops included) | **~$9** (1B reads within 25B free) | **~$9** (10M writes within 50M free) |
| Turso Dev | $4.99 + $0.75 = **~$6** (all ops included) | **~$6** (1B within 2.5B free) | $4.99 + $0.75 = **~$6** (10M within 25M free) |

**Why**: Small records are where SQL backends shine brightest — every `get()` is 1 row read, every `insert()` is 1 row written. On S3/R2, small records fit in metadata so `patch()` uses the fast HEAD+COPY path. But the per-request cost of object storage still adds up at volume.

**Key insight**: For balanced small workloads, R2 wins on raw cost ($5). For read-heavy, SQL backends win by 40-60x.

#### Medium Records (2 KB – 8 KB per record)

This is where the **R2 metadata advantage** matters most.

| | Balanced (1M reads, 1M writes/mo) | Heavy Read (1B reads, 100K writes/mo) | Heavy Write (100K reads, 10M writes/mo) |
|---|---|---|---|
| **Best backend** | **R2** | **D1 or Turso** | **D1** |
| R2 cost | **~$5** (same as Small — no overflow with 8 KB metadata) | **~$360** | **~$45** |
| S3 cost | **~$12** (overflow = `patch()` becomes GET+PUT = 2x write cost) | **~$420** (GET includes body = larger transfer) | **~$105** (every write is full PUT with body) |
| D1 cost | **~$9** (same as Small — row size doesn't affect billing) | **~$9** | **~$9** |
| Turso Dev | **~$6** (same as Small — row billing, not size) | **~$6** | **~$6** |

**Why R2 wins for object storage at this tier**: R2's 8 KB metadata means medium records still fit without body-overflow. On S3, every record overflows, which means:
- `patch()` can't use HEAD+COPY — falls back to GET+PUT (2x the write cost)
- Every GET transfers the body too (more data, slightly slower)
- Every PUT must include the body (slightly more data written)

**Why SQL backends are unaffected**: D1 and Turso store the entire record in a single SQL row. Whether the record is 500 bytes or 5 KB, it's still 1 row read / 1 row written. Row size does not affect billing.

#### Large Records (8 KB – 2 MB per record)

Body is always involved. `body-only` behavior recommended. **D1 has a hard 2 MB row limit** — records near this boundary need care.

| | Balanced (1M reads, 1M writes/mo) | Heavy Read (100M reads, 100K writes/mo) | Heavy Write (100K reads, 1M writes/mo) |
|---|---|---|---|
| **Best backend** | **R2** (cost) or **D1/Turso** (reads) | **D1 or Turso** | **R2** |
| R2 cost | ~$5 ops + $0.15 storage = **~$5** | 100M reads × $0.36/M = **~$36** | 1M writes × $4.50/M = **~$5** |
| S3 cost | **~$7** + egress | **~$42** + egress | **~$7** + egress |
| D1 cost | **~$9** (all included) | **~$9** (100M within 25B free) | **~$9** (1M within 50M free) |
| Turso Dev | **~$6** (all included) | **~$6** (100M within 2.5B free) | **~$6** (1M within 25M free) |

**D1 limit warning**: D1 rows cannot exceed **2 MB**. If your records approach this, you must either:
- Use a different backend (R2/S3 for large objects)
- Split the record (store binary data separately)
- Use `body-only` behavior + monitor record size

**Turso advantage**: No hard row size limit (SQLite allows much larger rows). But very large rows (hundreds of KB) hurt query performance.

**Write cost note**: At this tier, write costs become significant on object storage because every PUT transfers the full body. SQL backends still bill per-row regardless of size.

#### Extra Large Records (2 MB+ per record — binary attachments)

Binary files, images, PDFs, media. **Only object-storage backends can handle this natively.**

| | Balanced | Heavy Read | Heavy Write |
|---|---|---|---|
| **Best backend** | **R2** | **R2** | **R2** |
| **Cannot use** | D1 (2 MB row limit), Turso (impractical) | D1, Turso | D1, Turso |

| | R2 (50 GB stored, 10M reads, 1M writes/mo) | S3 (same) |
|---|---|---|
| Storage | 40 GB × $0.015 = $0.60 | 50 GB × $0.023 = $1.15 |
| Reads | $3.60 | $4.00 |
| Writes | $4.50 | $5.00 |
| Egress (~100 GB) | **$0** | $9.00 |
| **Total** | **$8.70** | **$19.15** |

**R2 is the clear winner** for extra-large records because:
- Zero egress (binary files are often served to users/browsers)
- Cheapest storage ($0.015/GB)
- 8 KB metadata (useful for storing file metadata alongside binary body)
- S3-compatible API (same `S3Client`, no code changes)

**Hybrid pattern for apps with mixed sizes**: Use R2 for binary attachments and D1/Turso for structured data:

```javascript
// Structured data (users, orders, config) → D1 or Turso
const db = new Database({
  connectionString: 'sqlite+d1://ACCOUNT/DB?apiToken=TOKEN'
})

// Binary storage (uploads, images, files) → R2
const mediaDb = new Database({
  connectionString: 'https://KEY:SECRET@ACCOUNT.r2.cloudflarestorage.com/media-bucket'
})
```

### Matrix Summary Table

| | Small (< 2 KB) | Medium (2-8 KB) | Large (8 KB-2 MB) | Extra Large (2 MB+) |
|---|---|---|---|---|
| **Balanced** | R2 ($5) | R2 ($5) | R2 ($5) or D1 ($9) | R2 only |
| **Heavy Read** | D1/Turso (~$6-9) | D1/Turso (~$6-9) | D1/Turso (~$6-9) | R2 only |
| **Heavy Write** | D1 (~$9) | D1 (~$9) | R2 ($5) | R2 only |

### Key Patterns

1. **SQL backends (D1, Turso) don't care about record size** — billing is per-row, not per-byte. A 100-byte record and a 1 MB record both cost 1 row read. This makes them ideal for any size up to 2 MB.

2. **R2's 8 KB metadata is a significant advantage over S3** — records up to 8 KB avoid body-overflow on R2 but trigger it at 2 KB on S3. This means R2's `patch()` stays on the fast HEAD+COPY path 4x longer.

3. **For mixed workloads, combine backends** — use D1/Turso for hot structured data and R2 for large objects or binary attachments. s3db.js makes this trivial since you just change the connection string per database instance.

4. **D1's 2 MB row limit is a hard boundary** — if any record could exceed this, plan for it upfront. Either use Turso (no hard limit) or R2 (5 TiB max).

5. **Egress is the hidden cost killer on S3** — serving binary data to users at $0.09/GB adds up fast. R2 eliminates this entirely.

## Backend Details

### AWS S3

The default production backend. Battle-tested, virtually unlimited scale.

```javascript
const db = new Database({
  connectionString: 's3://ACCESS_KEY:SECRET_KEY@my-bucket?region=us-east-1'
})
```

**Strengths**: Unlimited scale, mature tooling, strong consistency, multi-region replication.
**Weaknesses**: Egress costs, request-based pricing on reads, no native query support (use partitions).
**When to use**: Default for production. Best for large datasets (100 GB+) and AWS-native stacks.

Full pricing: [AWS S3 Pricing](/pricing/aws-s3.md)

### Cloudflare R2

S3-compatible object storage with zero egress. Drop-in replacement — uses the same `S3Client`.

```javascript
const db = new Database({
  connectionString: 'https://ACCESS_KEY:SECRET_KEY@ACCOUNT_ID.r2.cloudflarestorage.com/my-bucket'
})
```

**Strengths**: S3-compatible API, zero egress, cheapest storage ($0.015/GB).
**Weaknesses**: Smaller ecosystem than AWS, same scan limitations as S3.
**When to use**: When egress costs matter or you serve data to browsers frequently.

Full pricing: [Cloudflare R2 Pricing](/pricing/cloudflare-r2.md)

### Cloudflare D1

Serverless SQLite at the edge. Scale-to-zero, zero egress, massive read free tier.

```javascript
const db = new Database({
  connectionString: 'sqlite+d1://ACCOUNT_ID/DATABASE_ID?apiToken=YOUR_TOKEN'
})
```

**Strengths**: Scale-to-zero, zero egress, 25B reads/month included, ACID transactions, 30-day PITR.
**Weaknesses**: Expensive storage ($0.75/GB), **hard 10 GB limit per database** (cannot be increased), 2 MB max row size, single-threaded per database, current s3db.js integration uses HTTP API (~50-200ms latency vs ~1-5ms with native Worker bindings).
**When to use**: Read-heavy workloads with compact data (< 10 GB). Best inside Cloudflare Workers.

Full pricing: [Cloudflare D1 Pricing](/pricing/cloudflare-d1.md)

### Turso / libsql

Remote SQLite with edge replicas. Works in any runtime, not tied to Cloudflare.

```javascript
const db = new Database({
  connectionString: 'sqlite+libsql://my-db-my-org.turso.io?authToken=YOUR_TOKEN'
})
```

Requires `@libsql/client`:

```bash
pnpm add @libsql/client
```

**Strengths**: Embedded replicas (0ms local reads), works anywhere, PITR up to 90 days, Turso Scaler has 100B reads/month included.
**Weaknesses**: Base plan cost ($4.99-$416.58/mo), storage at $0.50-$0.75/GB.
**When to use**: Edge reads outside Cloudflare, embedded replica workflows, compliance-heavy apps (HIPAA/SOC2 on Pro).

**Unique feature — Embedded Replicas**: Local SQLite file syncs with remote Turso primary. Reads are local (zero latency), writes go remote. Sync traffic billed separately.

Full pricing: [Turso Pricing](/pricing/turso.md)

### MinIO

Self-hosted S3-compatible storage. Uses the same `S3Client`.

```javascript
const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/my-bucket'
})
```

**Strengths**: Full control, no provider fees, runs anywhere.
**Weaknesses**: You manage infrastructure, no managed scaling.
**When to use**: Local dev, CI, on-premise, air-gapped environments.

### SQLite (local)

Embedded SQLite. No network, no credentials.

```javascript
const db = new Database({
  connectionString: 'sqlite:///tmp/s3db.sqlite'
})
```

**Strengths**: Zero latency, zero cost, works offline.
**Weaknesses**: Single process only, not for distributed production.
**When to use**: Local dev, CI, single-process services, migration rehearsals.

See [SqliteClient docs](/clients/sqlite-client.md).

### Memory

In-memory storage. 100-1000x faster than any other backend.

```javascript
const db = new Database({
  connectionString: 'memory://my-bucket/test-db'
})
```

**When to use**: Unit and integration tests.

### Filesystem

Local filesystem storage.

```javascript
const db = new Database({
  connectionString: 'file:///path/to/data'
})
```

**When to use**: Local dev, debugging, edge deployments with local disk.

## How s3db.js Maps Operations to Backend Costs

### S3 / R2 / MinIO (object storage)

| s3db operation | S3 calls | Cost category |
|----------------|----------|---------------|
| `get(id)` | 1 GET | Class B read |
| `insert(data)` | 1 PUT | Class A write |
| `update(id, data)` | 1 GET + 1 PUT | 1 read + 1 write |
| `patch(id, data)` | 1 HEAD + 1 COPY | 1 read + 1 write |
| `replace(id, data)` | 1 PUT | Class A write |
| `delete(id)` | 1 DELETE | Free |
| `list()` | 1 LIST + N GETs | 1 write-class + N reads |
| `query(filter)` | LIST + N GETs | Full scan without partition |
| `query(filter)` with partition | 1 LIST (scoped) + N GETs | Partition = O(1) lookup |

Use [partitions](/core/partitions.md) to avoid full scans.

### D1 / Turso / SQLite (SQL backends)

| s3db operation | SQL calls | Billing |
|----------------|-----------|---------|
| `get(id)` | 1 SELECT (by PK) | 1 row read |
| `insert(data)` | 1 INSERT | 1 row written |
| `update(id, data)` | 1 SELECT + 1 UPSERT | 1 row read + 1 row written |
| `patch(id, data)` | 1 SELECT + 1 UPSERT | 1 row read + 1 row written |
| `replace(id, data)` | 1 UPSERT | 1 row written |
| `delete(id)` | 1 DELETE | 1 row written |
| `list()` | 1 SELECT with LIKE | N rows read |
| `count()` | 1 SELECT COUNT | N rows read (table scan) |

On SQL backends, `get(id)` is always 1 row read (primary key lookup). On S3, `query()` without a partition scans all objects. This is why SQL backends are dramatically cheaper for read-heavy workloads.

## Switching Backends

s3db.js code is backend-portable. Only the connection string changes:

```javascript
// Development
const db = new Database({
  connectionString: 'sqlite:///tmp/dev.sqlite'
})

// Staging (Turso)
const db = new Database({
  connectionString: process.env.S3DB_CONNECTION_STRING
  // sqlite+libsql://my-db.turso.io?authToken=...
})

// Production (S3)
const db = new Database({
  connectionString: process.env.S3DB_CONNECTION_STRING
  // s3://KEY:SECRET@bucket?region=us-east-1
})
```

No code changes. Resources, schemas, partitions, and plugins work identically across backends.

## See Also

- [Pricing Reference](/pricing/README.md) — Per-provider pricing details
- [Storage Clients](/clients/README.md) — Client configuration reference
- [Connection Strings](/reference/connection-strings.md) — All connection string formats
- [Partitions](/core/partitions.md) — Reduce read costs on S3/R2 backends
