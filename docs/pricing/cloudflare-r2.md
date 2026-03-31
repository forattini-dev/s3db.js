# Cloudflare R2 Pricing

> Collected on **2026-03-31** from [developers.cloudflare.com/r2/pricing](https://developers.cloudflare.com/r2/pricing/) and [developers.cloudflare.com/r2/platform/limits](https://developers.cloudflare.com/r2/platform/limits/).

## Pricing Model

R2 charges for **storage** and **requests**. There are **no egress fees** — data transfer out to the internet is always free. There is no base monthly fee.

R2 supports two storage classes: **Standard** and **Infrequent Access**. s3db.js uses Standard storage by default.

## Storage

| Storage Class | $/GB-month | Minimum Storage Duration |
|---------------|-----------|--------------------------|
| **Standard** | **$0.015** | None |
| Infrequent Access | $0.01 | 30 days |

R2 Standard is cheaper than S3 Standard ($0.023/GB) — roughly 35% less.

Free tier: **10 GB-month/month** (Standard only).

Storage is billed as GB-month, calculated by averaging peak storage per day over 30 days. For example, storing 1 GB for 5 days then 3 GB for 25 days = 2.66 GB-month.

## Requests

R2 divides operations into two classes:

| Class | Operations | Free | Standard | Infrequent Access |
|-------|-----------|------|----------|-------------------|
| **Class A** (writes) | PUT, POST, COPY, LIST, CreateMultipartUpload, UploadPart, CompleteMultipartUpload, LifecycleStorageTierTransition, PutBucketEncryption, PutBucketCors, PutBucketLifecycleConfiguration | 1M/month | **$4.50 / million** | $9.00 / million |
| **Class B** (reads) | GET, HEAD, GetBucketEncryption, GetBucketLocation, GetBucketCors, GetBucketLifecycleConfiguration, UsageSummary | 10M/month | **$0.36 / million** | $0.90 / million |
| **Free** | DELETE, AbortMultipartUpload | Always free | Always free | Always free |

### Per-operation cost (Standard)

| | Cost |
|---|------|
| 1 PUT (Class A) | $0.0000045 |
| 1 GET (Class B) | $0.00000036 |
| 1 million PUTs | $4.50 |
| 1 million GETs | $0.36 |

### Data Retrieval (Infrequent Access only)

| | Cost |
|---|------|
| Data retrieval (processing) | **$0.01 / GB** |

Standard storage has no data retrieval fees. Infrequent Access charges $0.01/GB when objects are read or copied.

## Data Transfer (Egress)

| | Cost |
|---|------|
| Data transfer OUT to internet | **Free** |
| Data transfer IN from internet | **Free** |

This is R2's biggest advantage over S3. No egress fees, ever. You are not charged for unauthorized requests (401 responses).

## Free Tier (permanent)

| | Included |
|---|---------|
| Storage | 10 GB-month/month (Standard only) |
| Class A requests | 1,000,000/month |
| Class B requests | 10,000,000/month |
| Egress | Always free |

Unlike AWS S3, R2's free tier does not expire after 12 months. The free tier does not apply to Infrequent Access storage.

## Billing Rounding

Cloudflare rounds up usage to the next billing unit:
- 1,000,001 operations → billed as 2,000,000
- 1.1 GB-month → billed as 2 GB-month
- 1.1 GB data retrieval → billed as 2 GB

## Limits

> Collected on **2026-03-31** from [developers.cloudflare.com/r2/platform/limits](https://developers.cloudflare.com/r2/platform/limits/).

### Bucket Limits

| Limit | Value |
|-------|-------|
| Data storage per bucket | **Unlimited** |
| Objects per bucket | **Unlimited** |
| Buckets per account | 1,000,000 |
| Bucket management operations rate | 50/second per bucket |
| Custom domains per bucket | 50 |

### Object Limits

| Limit | Value |
|-------|-------|
| Object key length | **1,024 bytes** |
| Object metadata size | **8,192 bytes** (8 KB) |
| Maximum object size | **5 TiB** |
| Maximum single-part upload | 5 GiB |
| Maximum multi-part upload | 4.995 TiB |
| Maximum upload parts | 10,000 |
| Concurrent writes to same key | 1/second |

### What This Means for s3db.js

| Limit | Impact |
|-------|--------|
| Unlimited storage per bucket | No storage ceiling — R2 can handle any dataset size. |
| 8 KB object metadata | s3db.js uses S3 metadata for field values. The 8 KB limit is more generous than S3's 2 KB limit, so s3db.js's `body-overflow` behavior is less likely to trigger. |
| 1,024 byte key length | s3db.js object keys include resource name + ID + partition path. Plenty of room for typical keys. |
| 5 TiB max object | No practical limit for s3db.js objects. |
| 1 write/second to same key | Concurrent updates to the same record are limited. s3db.js uses `ifMatch`/`ifNoneMatch` for optimistic concurrency, so this aligns with expected behavior. |

### r2.dev Rate Limiting

The managed `r2.dev` subdomain is for **testing only** and has variable rate limits (hundreds of requests/second). For production, use a custom domain. This does not apply when accessing R2 via the S3-compatible API (which is how s3db.js connects).

## How s3db.js Uses R2

R2 is S3-compatible, so s3db.js uses the same `S3Client`. Operation mapping is identical to S3:

| s3db operation | R2 calls | Class | Estimated cost |
|----------------|----------|-------|----------------|
| `get(id)` | 1 GET | B | $0.00000036 |
| `insert(data)` | 1 PUT | A | $0.0000045 |
| `update(id, data)` | 1 GET + 1 PUT | B + A | $0.00000486 |
| `patch(id, data)` | 1 HEAD + 1 COPY | B + A | $0.00000486 |
| `replace(id, data)` | 1 PUT | A | $0.0000045 |
| `delete(id)` | 1 DELETE | Free | Free |
| `list()` | 1 LIST + N GETs | A + N×B | Depends on size |

### R2 vs S3: metadata advantage

R2 allows **8 KB of object metadata** vs S3's **2 KB limit**. This means s3db.js's `body-overflow` behavior (which stores field values in the object body when metadata is full) activates less often on R2. More data fits in metadata, which means fewer bytes in the body and faster HEAD-based operations like `patch()`.

## R2 Billing Examples

### Asset hosting (100K files, 300M reads/month)

| Usage | Free Tier | Billable | Cost |
|-------|-----------|----------|------|
| Storage (100K × 100 KB) | 10 GB | 0 GB | $0.00 |
| Class A (100K writes) | 1M | 0 | $0.00 |
| Class B (300M reads) | 10M | 290M | $104.40 |
| **Total** | | | **$104.40** |

### Data storage (1 TB, 1K writes/month, 1M reads/month)

| Usage | Free Tier | Billable | Cost |
|-------|-----------|----------|------|
| Storage | 10 GB | 990 GB | $14.85 |
| Class A (1K writes) | 1M | 0 | $0.00 |
| Class B (1M reads) | 10M | 0 | $0.00 |
| **Total** | | | **$14.85** |

## Data Migration Tools

| Tool | Cost | Use Case |
|------|------|----------|
| **Super Slurper** | Free (only Class A ops to R2) | One-time migration from S3/GCS to R2 |
| **Sippy** | Free (only Class A ops to R2) | Incremental migration — copies objects on first access |

Both tools may incur charges on the source bucket (e.g., S3 egress fees).

## Connection Strings

```javascript
// Cloudflare R2
'https://ACCESS_KEY:SECRET_KEY@ACCOUNT_ID.r2.cloudflarestorage.com/my-bucket'
```

R2 uses the S3-compatible API, so no special client is needed — the same `S3Client` works for both AWS S3 and R2.

## See Also

- [Choosing a Backend](/guides/choosing-a-backend.md) — Scenario comparisons
- [S3Client docs](/clients/s3-client.md) — Client configuration (same client for R2)
- [Cloudflare R2 Pricing (official)](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare R2 Limits (official)](https://developers.cloudflare.com/r2/platform/limits/)
- [Cloudflare D1 Pricing](cloudflare-d1.md) — Compare with D1 for different workloads
