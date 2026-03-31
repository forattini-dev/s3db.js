# Cloudflare Durable Objects Pricing

> Collected on **2026-03-31** from [developers.cloudflare.com/durable-objects/platform/pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Why This Page Exists

s3db.js does not directly support Durable Objects as a storage backend. However, Durable Objects are relevant for two reasons:

1. **D1 is built on Durable Objects** — understanding DO pricing helps contextualize D1's architecture and limits (each D1 database is backed by a single Durable Object).
2. **SQLite-backed Durable Objects share D1's row-based billing** — if you need per-user or per-entity databases inside Cloudflare Workers, Durable Objects with SQLite is an alternative to D1 with different trade-offs.

## Pricing Model

Durable Objects incur two types of billing: **compute** (requests + duration) and **storage** (rows read/written + stored data).

Available on both Workers Free and Workers Paid plans. Free plan only supports SQLite storage backend.

## Compute Billing

Durable Objects are billed for wall-clock time while actively running or idle in memory but unable to hibernate. Objects using the [WebSocket Hibernation API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/#websocket-hibernation) are not billed for duration while hibernating.

| | Free | Paid |
|---|------|------|
| Requests | 100,000/day | 1 million/month, + **$0.15/million** |
| Duration | 13,000 GB-s/day | 400,000 GB-s/month, + **$12.50/million GB-s** |

Requests include: HTTP requests, RPC sessions, WebSocket messages (20:1 billing ratio), and alarm invocations.

Duration is billed at 128 MB per Durable Object, regardless of actual memory usage. Multiple instances of the same class may share memory on the same machine but are still billed individually.

### WebSocket Billing

- Creating a WebSocket connection = 1 request
- Incoming WebSocket messages use a **20:1 ratio** (100 messages = 5 billed requests)
- Outgoing WebSocket messages and protocol pings are free
- `state.setWebSocketAutoResponse()` does not incur duration charges

## Storage Billing

### SQLite Storage Backend (recommended)

SQLite-backed Durable Objects use **row-based billing that matches D1 pricing**:

| | Free | Paid |
|---|------|------|
| Rows read | 5 million/day | 25 billion/month, + **$0.001/million rows** |
| Rows written | 100,000/day | 50 million/month, + **$1.00/million rows** |
| Stored data | 5 GB total | 5 GB-month, + **$0.20/GB-month** |

Key differences from D1:
- Storage overage is **$0.20/GB-month** (vs D1's $0.75/GB-month) — significantly cheaper
- Key-value methods (`get()`, `put()`, `delete()`, `list()`) operate on a hidden SQLite table and are billed as rows
- Each `setAlarm()` = 1 row written
- Deletes count as rows written

### Key-Value Storage Backend (Paid only)

| | Included | Overage |
|---|---------|---------|
| Read request units (4 KB each) | 1 million | + $0.20/million |
| Write request units (4 KB each) | 1 million | + $1.00/million |
| Delete requests | 1 million | + $1.00/million |
| Stored data | 1 GB | + $0.20/GB-month |

Request units are 4 KB. A 9 KB write = 3 write units. List operations are billed by data examined.

## Compute Billing Examples

### Example 1: HTTP coordination service

- 1.5M requests/month, active 1M seconds

| | Calculation | Cost |
|---|------------|------|
| Requests | (1.5M - 1M included) × $0.15/M | $0.075 |
| Duration | 1M s × 128 MB = 128K GB-s (under 400K free) | $0.00 |
| **Total** | + $5/mo Workers Paid | **~$5.08** |

### Example 2: WebSocket chat (100 DOs, 50 connections each)

- 50 connections × 100 DOs, 1 msg/min, 8 hours/day

| | Calculation | Cost |
|---|------------|------|
| Requests | 150K connections + 72M messages ÷ 20 = 3.75M | $0.41 |
| Duration | 100 DOs × 8h × 30d = 86.4M s → 11M GB-s | $133.24 |
| **Total** | + $5/mo | **~$138.65** |

### Example 3: WebSocket with Hibernation (same traffic as Example 2 but with hibernation)

- 100 DOs, 100 connections each, 1 msg/min, 10ms processing

| | Calculation | Cost |
|---|------------|------|
| Requests | 10K connections + 432M messages ÷ 20 = 21.6M | $3.09 |
| Duration | 100 DOs × 1s/min × 24h × 30d = 4.3M s → 553K GB-s | $1.91 |
| **Total** | + $5/mo | **~$10.00** |

WebSocket Hibernation reduced compute duration from $133 to $1.91 — a **98.6% reduction**.

## Limits

> Collected on **2026-03-31** from [developers.cloudflare.com/durable-objects/platform/limits](https://developers.cloudflare.com/durable-objects/platform/limits/).

Durable Objects are a special kind of Worker, so [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) also apply.

### SQLite-Backed Durable Objects

| Limit | Free | Paid |
|-------|------|------|
| Number of Objects | Unlimited | Unlimited |
| Maximum DO classes per account | 100 | 500 |
| Storage per account | 5 GB | **Unlimited** |
| Storage per class | — | Unlimited |
| **Storage per Durable Object** | — | **10 GB** |
| Key + value combined size | 2 MB | 2 MB |
| WebSocket message size (received) | 32 MiB | 32 MiB |
| CPU per request | 30s (configurable to 5 min) | 30s (configurable to 5 min) |

### SQL Limits (SQLite backend)

These are identical to D1's SQL limits:

| Limit | Value |
|-------|-------|
| Maximum columns per table | 100 |
| Maximum rows per table | Unlimited (within storage limits) |
| Maximum row size (string, BLOB, or row) | **2 MB** |
| Maximum SQL statement length | **100 KB** |
| Maximum bound parameters per query | 100 |
| Maximum arguments per SQL function | 32 |
| Maximum LIKE / GLOB pattern | 50 bytes |

### Key-Value Backed Durable Objects (Paid only)

| Limit | Value |
|-------|-------|
| Number of Objects | Unlimited |
| Maximum DO classes per account | 500 |
| Storage per account | 50 GB (can be raised) |
| Storage per class | Unlimited |
| Storage per Durable Object | Unlimited |
| Key size | 2 KiB (2,048 bytes) |
| Value size | 128 KiB (131,072 bytes) |
| WebSocket message size (received) | 32 MiB |
| CPU per request | 30s |

### Throughput & Concurrency

Each individual Durable Object is **single-threaded** with a soft limit of **~1,000 requests/second**.

- Simple `get()` on small values may achieve higher throughput
- Complex operations (serialization, multiple `list()` calls) may be lower
- Objects that receive too many requests queue them, then return "overloaded" errors

### Wall Time Limits

| Invocation Type | Wall Time Limit |
|----------------|-----------------|
| Incoming HTTP request | **Unlimited** (while client connected) |
| Durable Objects (RPC / HTTP) | **Unlimited** (while caller connected) |
| Cron Triggers | 15 minutes |
| Queue consumers | 15 minutes |
| DO alarm handlers | 15 minutes |
| Workflows (per step) | Unlimited |

After client disconnect, tasks are canceled unless `waitUntil()` extends execution by up to 30 seconds.

### Storage Full Behavior

When a SQLite-backed DO reaches its 10 GB limit, writes fail with `SQLITE_FULL`:
- **Reads** (SELECT, `get()`, `list()`) continue to work
- **Deletes** succeed (to free up space)
- **Writes** (INSERT, UPDATE, `put()`, `sql.exec()`) fail

### Key Differences from D1 Limits

| | D1 | Durable Objects (SQLite) |
|---|-----|------------------------|
| Max database/object size | 10 GB (hard, cannot increase) | 10 GB per object (hard) |
| Storage per account | 1 TB | **Unlimited** (paid) |
| Queries per invocation | 1,000 (paid) / 50 (free) | No specific limit (CPU-bound) |
| Simultaneous connections | 6 per Worker invocation | N/A (direct access) |
| External HTTP API | Yes | No (Workers only) |
| PITR | 30 days (paid) | Not built-in |

## Durable Objects vs D1

Both D1 and SQLite-backed Durable Objects use SQLite under the hood with identical row-based billing. The key differences:

| | D1 | Durable Objects (SQLite) |
|---|-----|------------------------|
| **Architecture** | Managed database service | Compute + storage primitive |
| **Access** | HTTP API + Worker bindings | Worker bindings only |
| **Storage pricing** | $0.75/GB-month | **$0.20/GB-month** (3.7x cheaper) |
| **Row read/write pricing** | Same | Same |
| **Max database size** | 10 GB (hard limit) | Per-object limits |
| **Scale model** | Single database, read replicas | Many independent objects |
| **Tooling** | Schema management, import/export, query insights | DIY |
| **External access** | HTTP API from any environment | Workers only |
| **PITR** | 30 days (paid) | Not built-in |
| **s3db.js support** | `sqlite+d1://` | Not supported |

**Key insight**: If storage cost is a concern and you are already inside Cloudflare Workers, Durable Objects with SQLite backend is **3.7x cheaper per GB** than D1. But you lose D1's managed tooling and external API access, and s3db.js does not currently have a Durable Objects client.

## When to Consider Durable Objects

| Use Case | Better Choice |
|----------|--------------|
| Standard database from any environment | **D1** (has HTTP API, s3db.js supports it) |
| Per-user / per-tenant isolated databases | **Durable Objects** (each object = independent SQLite) |
| Real-time WebSocket applications | **Durable Objects** (built-in WebSocket + hibernation) |
| Cheap storage inside Cloudflare | **Durable Objects** ($0.20/GB vs D1's $0.75/GB) |
| Access from Node.js / non-Worker environments | **D1** (HTTP API) or **Turso** |
| s3db.js backend | **D1** or **Turso** (Durable Objects not supported) |

## See Also

- [Cloudflare D1 Pricing](cloudflare-d1.md) — D1 comparison (built on Durable Objects)
- [Cloudflare R2 Pricing](cloudflare-r2.md) — Object storage alternative
- [Choosing a Backend](/guides/choosing-a-backend.md) — Full backend comparison
- [Durable Objects Pricing (official)](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Cloudflare: Choose a data or storage product](https://developers.cloudflare.com/workers/platform/storage-options/)
