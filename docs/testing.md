# Testing Guide

This guide explains how to run the s3db.js test suites locally and in CI with
real S3-compatible storage as well as the new coverage expectations.

## Quick Start

- `pnpm run test:quick` – memory-backed smoke tests (fast feedback).
- `pnpm run test:js` – full JavaScript suite (uses configured backend).
- `pnpm run test:coverage` – enforces ≥90 % coverage and runs in-band.

> **Tip:** The memory client is still available for targeted unit tests, but
> critical integration suites now require an S3-compatible backend.

## S3-Compatible Testing

1. Start the storage service. The repository ships with MinIO and LocalStack
   definitions:
   ```bash
   docker compose up -d minio minio-init      # MinIO 9000/9001
   # or
   docker compose up -d localstack            # LocalStack 4566
   ```
2. Copy the example environment file and adjust credentials as needed:
   ```bash
   cp tests/.env.test.local.example tests/.env.test.local
   ```
3. Export any overrides (optional) and run the desired test command.

### Required Environment Variables

`tests/jest.setup.js` automatically loads `.env`, `.env.test.local`, and
`tests/.env.test.local`. The harness will read the following variables:

| Variable | Description |
|----------|-------------|
| `S3_COMPAT_ENDPOINT` | Base URL (`http://localhost:9100` for MinIO, `http://localhost:4566` for LocalStack). |
| `S3_COMPAT_ACCESS_KEY` | Access key / user. |
| `S3_COMPAT_SECRET_KEY` | Secret key / password. |
| `S3_COMPAT_BUCKET` | Bucket to use (will be created if missing). |
| `S3_COMPAT_REGION` | Optional region (defaults to `us-east-1`). |
| `S3_COMPAT_FORCE_PATH_STYLE` | Optional flag (`true` recommended for MinIO/LocalStack). |
| `S3_COMPAT_CONNECTION_STRING` | Optional full connection string that overrides the individual values. |

The helper automatically sets `BUCKET_CONNECTION_STRING` when provisioning a
database so existing tests keep working.

### Harness Utilities

`tests/s3-compatible/index.js` exposes utilities for suites:

- `createS3CompatibleDatabase(testName, { databaseOptions })` – wraps
  `createDatabaseForTest`, ensures the bucket exists, and automatically purges
  the generated key prefix on disconnect.
- `ensureS3CompatibleEnvironment(overrides)` – performs a bucket health check
  without creating a database.
- `cleanupS3Prefix(connectionString)` – removes all objects created under a
  specific prefix (used internally but exported for manual cleanups).

Integration suites that exercise persistence, replication, or streaming should
import `createS3CompatibleDatabase` instead of accessing `tests/config.js`
directly.

## Coverage Requirements

- Jest now enforces **≥90 %** statements, branches, functions, and lines across
  the entire project (`coverageThreshold.global`).
- `pnpm run test:coverage` collects coverage, runs tests in-band, and will fail
  if the threshold is not met. The command also runs in CI.
- Coverage reports are written to `coverage/`. Open
  `coverage/lcov-report/index.html` for a detailed breakdown.

## Plugin Verbosity in Tests

- Every plugin now supports a shared options contract (`verbose`, `resources`,
  `database`, `client`) normalized via `normalizePluginOptions`.
- CI and local tests MUST run plugins with `verbose: false` unless a test is
  explicitly exercising logging behavior. When creating plugins in tests, pass
  `verbose: false` (or use helpers that do so) to keep output clean.
- The base `Plugin` class defaults `verbose` to `false`, but tests should still
  set the flag explicitly to document intent and prevent noisy regressions.

### Handling Temporary Exceptions

If a change cannot immediately meet the threshold, document the outstanding
work in your proposal or PR description and secure approval before merging.
Permanent exclusions belong in `jest.config.js`'s `collectCoverageFrom` /
`coveragePathIgnorePatterns` with a comment explaining why.

## CI Notes

- Ensure the CI job exports the same variables listed above. Secrets should be
  stored in the CI provider and injected at runtime.
- Provision the S3-compatible service (e.g., `docker compose up -d minio
  minio-init`) before running `pnpm run test:coverage`.
- Publish the `coverage/` directory when available so reviewers can inspect the
  report.
