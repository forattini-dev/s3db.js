# AWS S3 Pricing

> Collected on **2026-03-31** from [aws.amazon.com/s3/pricing](https://aws.amazon.com/s3/pricing/).
> Region: **US East (N. Virginia)**. Prices vary by region.

## Pricing Model

S3 charges for **storage**, **requests**, and **data transfer (egress)**. There is no base monthly fee — you pay only for what you use.

## Storage

| Tier | First 50 TB/mo | Next 450 TB/mo | Over 500 TB/mo |
|------|----------------|----------------|-----------------|
| **S3 Standard** | $0.023/GB | $0.022/GB | $0.021/GB |
| S3 Intelligent-Tiering (Frequent) | $0.023/GB | $0.022/GB | $0.021/GB |
| S3 Intelligent-Tiering (Infrequent) | $0.0125/GB | — | — |
| S3 Standard-IA | $0.0125/GB | — | — |
| S3 One Zone-IA | $0.01/GB | — | — |
| S3 Glacier Instant Retrieval | $0.004/GB | — | — |
| S3 Glacier Flexible Retrieval | $0.0036/GB | — | — |
| S3 Glacier Deep Archive | $0.00099/GB | — | — |

s3db.js uses **S3 Standard** by default.

## Requests

| Operation | S3 Standard | S3 Standard-IA |
|-----------|-------------|----------------|
| PUT, COPY, POST, LIST (per 1,000) | **$0.005** | $0.01 |
| GET, SELECT, and all other (per 1,000) | **$0.0004** | $0.001 |
| DELETE | Free | Free |

### Per-operation cost (S3 Standard)

| | Cost |
|---|------|
| 1 PUT | $0.000005 |
| 1 GET | $0.0000004 |
| 1 million PUTs | $5.00 |
| 1 million GETs | $0.40 |

## Data Transfer (Egress)

| Tier | $/GB |
|------|------|
| Data transfer IN (from internet) | **Free** |
| First 100 GB/mo OUT (aggregated across all AWS services) | **Free** |
| First 10 TB/mo OUT | **$0.09/GB** |
| Next 40 TB/mo OUT | $0.085/GB |
| Next 100 TB/mo OUT | $0.07/GB |
| Over 150 TB/mo OUT | $0.05/GB |
| To CloudFront | Free |
| To same region AWS services | Free |

## Free Tier (first 12 months)

| | Included |
|---|---------|
| Storage | 5 GB (S3 Standard) |
| GET requests | 20,000/month |
| PUT requests | 2,000/month |

After 12 months, there is no permanent free tier.

## How s3db.js Uses S3

Each s3db.js CRUD operation maps to S3 API calls:

| s3db operation | S3 calls | Estimated cost |
|----------------|----------|----------------|
| `get(id)` | 1 GET | $0.0000004 |
| `insert(data)` | 1 PUT | $0.000005 |
| `update(id, data)` | 1 GET + 1 PUT | $0.0000054 |
| `patch(id, data)` | 1 HEAD + 1 COPY | $0.0000054 |
| `replace(id, data)` | 1 PUT | $0.000005 |
| `delete(id)` | 1 DELETE | Free |
| `list()` | 1 LIST + N GETs | $0.005/1K + $0.0004/1K per object |
| `query(filter)` without partition | LIST + N GETs | Full scan — cost scales with resource size |
| `query(filter)` with partition | 1 LIST (scoped) + N GETs | Scoped scan — cost scales with partition size |

**Key cost driver**: `list()` and `query()` without partitions trigger full scans. Use [partitions](/core/partitions.md) to keep read costs predictable.

## Connection Strings

```javascript
// AWS S3
's3://ACCESS_KEY:SECRET_KEY@my-bucket?region=us-east-1'

// With key prefix
's3://ACCESS_KEY:SECRET_KEY@my-bucket/prefix?region=us-east-1'

// IAM role (EC2, ECS, Lambda — no credentials needed)
's3://my-bucket?region=us-east-1'
```

## See Also

- [Choosing a Backend](/guides/choosing-a-backend.md) — Scenario comparisons
- [S3Client docs](/clients/s3-client.md) — Client configuration reference
- [Detailed AWS S3 cost notes](/aws/aws-s3-costs-details.md) — Raw pricing data
- [AWS S3 Pricing (official)](https://aws.amazon.com/s3/pricing/)
