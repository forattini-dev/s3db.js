# Cloudflare D1 Pricing

> Collected on **2026-03-31** from [developers.cloudflare.com/d1/platform/pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [developers.cloudflare.com/d1/platform/limits](https://developers.cloudflare.com/d1/platform/limits/).

## Pricing Model

D1 charges based on **rows read**, **rows written**, and **storage**. It is scale-to-zero — if you are not running queries, you are not billed for compute. There are **no egress fees**.

D1 pricing is part of the Cloudflare Workers platform. The Workers Paid plan ($5/month) unlocks D1's paid tier limits.

## Plans

| | Workers Free | Workers Paid ($5/mo) |
|---|-------------|---------------------|
| Rows read | 5 million/day | 25 billion/month included |
| Rows written | 100,000/day | 50 million/month included |
| Storage | 5 GB total | 5 GB included |

## Overage (Workers Paid)

| Metric | Overage cost |
|--------|-------------|
| Rows read | **$0.001 / million rows** |
| Rows written | **$1.00 / million rows** |
| Storage | **$0.75 / GB-month** |

### Per-operation cost (after free quota)

| | Cost |
|---|------|
| 1 row read | $0.000000001 |
| 1 million rows read | $0.001 |
| 1 row written | $0.000001 |
| 1 million rows written | $1.00 |

## Data Transfer (Egress)

| | Cost |
|---|------|
| Data transfer OUT to internet | **Free** |
| Data transfer IN from internet | **Free** |
| Read replicas | No extra charge |

## Free Tier

| | Workers Free |
|---|-------------|
| Rows read | 5 million/day (~150M/month) |
| Rows written | 100,000/day (~3M/month) |
| Storage | 5 GB total |
| Resets | Daily at 00:00 UTC |

The free tier resets daily. When limits are hit, queries return errors until the next day.

## Limits

> Collected on **2026-03-31** from [developers.cloudflare.com/d1/platform/limits](https://developers.cloudflare.com/d1/platform/limits/).

### Database Limits

| Limit | Workers Free | Workers Paid |
|-------|-------------|-------------|
| Databases per account | 10 | 50,000 |
| Maximum database size | **500 MB** | **10 GB** |
| Maximum storage per account | 5 GB | **1 TB** |
| Time Travel (PITR) duration | 7 days | 30 days |
| Time Travel restore operations | 10 per 10 minutes per database | 10 per 10 minutes per database |

The **10 GB per-database limit cannot be increased**. D1 is designed for horizontal scale-out across many smaller databases (per-user, per-tenant, per-entity), not for single large databases.

### Query & Schema Limits

| Limit | Value |
|-------|-------|
| Maximum columns per table | 100 |
| Maximum rows per table | Unlimited (within storage limits) |
| Maximum row size (string, BLOB, or table row) | **2 MB** (2,000,000 bytes) |
| Maximum SQL statement length | **100 KB** (100,000 bytes) |
| Maximum bound parameters per query | 100 |
| Maximum arguments per SQL function | 32 |
| Maximum characters in a LIKE or GLOB pattern | 50 bytes |
| Maximum SQL query duration | **30 seconds** |
| Maximum file import size (`d1 execute`) | 5 GB |

### Runtime Limits

| Limit | Workers Free | Workers Paid |
|-------|-------------|-------------|
| Queries per Worker invocation | 50 | 1,000 |
| Simultaneous connections per Worker invocation | 6 | 6 |
| Maximum bindings per Worker script | ~5,000 | ~5,000 |

Batch limits: individual query limits apply to each statement inside a `db.batch()`.

### Concurrency & Throughput

Each individual D1 database is **single-threaded** and processes queries one at a time.

Throughput is directly related to query duration:
- 1 ms average query → ~1,000 queries/second
- 100 ms average query → ~10 queries/second
- With [read replication](https://developers.cloudflare.com/d1/configuration/read-replication/), each replica is independent and adds its own throughput

If a database receives too many concurrent requests, it queues them. If the queue fills, D1 returns an "overloaded" error.

### Query Performance Guidelines

| Operation | Typical SQL Duration |
|-----------|---------------------|
| Indexed read (`SELECT ... WHERE id = ?`) | < 1 ms |
| Write (INSERT, UPDATE) | Several ms (writes are durably persisted across locations) |
| Large data migration | Must be batched (~1,000 rows at a time) |

A single query that modifies hundreds of thousands of rows or hundreds of MB at once will exceed execution limits. Break work into smaller chunks.

### What This Means for s3db.js

| Limit | Impact |
|-------|--------|
| 10 GB max per database | s3db.js resources sharing one D1 database cannot exceed 10 GB total. For larger datasets, use S3/R2 or split across multiple D1 databases. |
| 2 MB max row size | s3db.js objects (metadata + body) stored in a single row must stay under 2 MB. Large objects require a different backend. |
| 100 bound parameters | Batch operations in s3db.js are safe — each operation uses 7-9 parameters. |
| 30 second query timeout | Large `list()` or `count()` operations on resources with millions of records may hit this limit. Use pagination. |
| Single-threaded | Under high concurrency, D1 queues requests. For high-throughput workloads, read replication helps reads but writes remain single-threaded. |
| 1,000 queries per invocation (paid) | A Worker that does many s3db.js operations in a single request should stay within this. Each `get()` = 1 query, `update()` = 2 queries. |

## How Rows Are Counted

- **Rows read**: Number of rows a query scans, not the number returned. A `SELECT *` on a 5,000-row table counts as 5,000 rows read even if you only use 10.
- **Rows written**: Each INSERT, UPDATE, DELETE counts the affected rows. An `INSERT` of 10 rows = 10 rows written.
- **Indexes**: Reading via an indexed column reduces rows read. Writing to an indexed column adds 1 extra row written (for the index update).
- **Row size**: Does not affect billing. A 1 KB row and a 100 KB row both count as 1 row.
- **DDL operations** (CREATE, ALTER, DROP): Contribute to a mix of read and write rows.

## How s3db.js Uses D1

s3db.js stores all data in a single `objects` table via `RemoteSqliteClient`. Each CRUD operation maps to SQL:

| s3db operation | SQL | D1 billing |
|----------------|-----|------------|
| `get(id)` | `SELECT ... WHERE bucket=? AND key=?` | 1 row read |
| `insert(data)` | `INSERT ... ON CONFLICT DO UPDATE` | 1 row written |
| `update(id, data)` | 1 SELECT + 1 UPSERT | 1 row read + 1 row written |
| `patch(id, data)` | 1 SELECT + 1 UPSERT | 1 row read + 1 row written |
| `replace(id, data)` | 1 UPSERT | 1 row written |
| `delete(id)` | `DELETE WHERE bucket=? AND key=?` | 1 row written |
| `list()` | `SELECT ... WHERE key LIKE ?` | N rows read |
| `count()` | `SELECT COUNT(*)` | N rows read (table scan) |

All operations on D1 use the primary key `(bucket, key)`, so single-record lookups are always 1 row read — unlike S3 where `query()` without a partition scans all objects.

## Current s3db.js Integration

s3db.js connects to D1 via the **HTTP REST API** (`https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{db}/query`). This works from any Node.js environment but adds ~50-200ms latency per operation.

The connection string `sqlite+d1://binding/DB` is parsed for future **native Worker binding** support, which would reduce latency to ~1-5ms. This is not yet implemented.

The D1 billing (rows read/written) is the same regardless of whether you use the REST API or Worker bindings.

## D1 vs Other Cloudflare Storage

Cloudflare offers several storage products. Here is how they compare for s3db.js use cases:

| Product | Best For | s3db.js Support |
|---------|----------|----------------|
| **D1** | Relational data, read-heavy workloads, serverless SQLite | `sqlite+d1://` via RemoteSqliteClient |
| **R2** | Large objects, blob storage, zero egress | `https://...r2.cloudflarestorage.com` via S3Client |
| **Workers KV** | Configuration, session data, high-read key-value | Not supported |
| **Durable Objects** | Real-time collaboration, stateful serverless | Not supported |
| **Hyperdrive** | Accelerating existing Postgres/MySQL | Not supported (s3db.js is its own database) |

For applications that need both large object storage and fast queries, you can use **R2 for the s3db.js backend** (large data) and **D1 for lightweight metadata or user state** (separate database instance).

## Connection Strings

```javascript
// D1 via HTTP API (from any Node.js environment)
'sqlite+d1://ACCOUNT_ID/DATABASE_ID?apiToken=YOUR_TOKEN'

// Worker binding (parsed, not yet implemented)
'sqlite+d1://binding/DB'
```

## See Also

- [Choosing a Backend](/guides/choosing-a-backend.md) — Scenario comparisons
- [SqliteClient docs](/clients/sqlite-client.md) — Client configuration reference
- [Cloudflare D1 Pricing (official)](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare D1 Limits (official)](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare: Choose a data or storage product](https://developers.cloudflare.com/workers/platform/storage-options/)
