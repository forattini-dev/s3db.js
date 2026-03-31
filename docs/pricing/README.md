# Pricing Reference

Detailed pricing data for each storage backend supported by s3db.js.

Each page documents the provider's pricing model, tiers, included quotas, and overage costs. Prices were collected on the date noted in each page — always check the official source for the latest values.

## Providers

| Provider | Type | Pricing Page |
|----------|------|-------------|
| [AWS S3](aws-s3.md) | Object storage | [aws.amazon.com/s3/pricing](https://aws.amazon.com/s3/pricing/) |
| [Cloudflare R2](cloudflare-r2.md) | S3-compatible object storage | [developers.cloudflare.com/r2/pricing](https://developers.cloudflare.com/r2/pricing/) |
| [Cloudflare D1](cloudflare-d1.md) | Serverless SQLite (edge) | [developers.cloudflare.com/d1/platform/pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| [Cloudflare Durable Objects](cloudflare-durable-objects.md) | Stateful compute + SQLite | [developers.cloudflare.com/durable-objects/platform/pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) |
| [Turso](turso.md) | Remote SQLite (libsql) | [turso.tech/pricing](https://turso.tech/pricing) |

For self-hosted backends (MinIO, local SQLite, Memory, Filesystem) there are no provider fees — you pay only for the underlying infrastructure.

## Quick Comparison

See [Choosing a Backend](/guides/choosing-a-backend.md) for scenario-based cost analysis and decision guidance.

## How s3db.js Operations Map to Costs

See the [operation cost mapping](/guides/choosing-a-backend.md#how-s3dbjs-maps-operations-to-backend-costs) section in the backend guide.
