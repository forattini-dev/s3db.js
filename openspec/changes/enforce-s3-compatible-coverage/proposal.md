# Enforce Coverage Against S3-Compatible Backends

**Change ID:** `enforce-s3-compatible-coverage`
**Status:** Proposed
**Created:** 2025-11-06

## Overview

Introduce a testing strategy that exercises s3db.js against a live S3-compatible bucket (e.g., MinIO, LocalStack, AWS S3) and enforces a ≥90% project-wide coverage threshold. This change will ensure the 2,600+ existing Jest specs validate real S3-compatible I/O paths instead of relying solely on the in-memory client, while keeping daily feedback loops fast and reliable.

## Problem Statement

- Integration realism is low: most suites instantiate the in-memory client by default, bypassing our S3-compatible client code paths that ship to production.
- Coverage metrics are not enforced: Istanbul coverage reports are optional, so regressions slip into CI without failing builds even when new code is untested.
- Test utilities (`tests/config.js#createDatabaseForTest`) expose S3-compatible helpers, but suites rarely opt in because setup expectations are undocumented and there is no shared fixture for connection credentials.
- We need meaningful signals from the >2,600 tests before expanding feature work or schema changes.

## Goals

1. Enforce ≥90% global line/branch/function coverage at the package level.
2. Exercise critical S3-compatible integration flows in CI and local runs using the existing `createDatabaseForTest` helper.
3. Provide deterministic lifecycle management (health checks, seed, teardown) for S3-compatible buckets that suites can consume without duplicating boilerplate.
4. Document the new testing contract so contributors know how to run the suites with or without an S3-compatible backend locally.

## Non-Goals

- Replacing Jest or Istanbul tooling.
- Refactoring every existing test file in this change; we focus on infrastructure, coverage gating, and high-risk suites first.
- Making S3-compatible backends mandatory for lightweight smoke tests; the memory client remains available for targeted unit specs.

## Proposed Solution

### 1. Standardize S3-Compatible Test Harness
- Add a shared helper (e.g., `tests/s3-compatible/index.js`) that uses `tests/config.js#createDatabaseForTest` with a `BUCKET_CONNECTION_STRING` pointing at an S3-compatible endpoint (supporting MinIO, LocalStack, or real S3).
- Provide lifecycle hooks to bootstrap and purge buckets/prefixes before/after suites, reusing the existing prefix isolation logic.
- Supply a `.env.test.local` template describing required S3-compatible variables (endpoint, access key, secret key, bucket, region).

### 2. Coverage Enforcement
- Update Jest configuration to require ≥90% statements, branches, functions, and lines via `coverageThreshold`.
- Publish coverage reports automatically in CI (`pnpm run test:coverage`) and fail builds when the threshold is unmet.
- Gate merge requests by wiring coverage artifacts to the existing CI pipeline (document the required job updates in `docs/testing.md`).

- Identify integration suites touching S3 persistence, replication, and streaming to migrate first to the S3-compatible harness (minimum: database CRUD, replication plugins, streaming writes).
- Add representative scenarios ensuring S3-compatible-backed CRUD, pagination, and eventual consistency behaviours are asserted.
- Backfill assertions around error handling paths (timeouts, permission errors) only reachable through the S3 client layer.

### 4. Contributor Guidance
- Extend `docs/testing.md` (or create it if missing) with sections for "Running tests with S3-compatible backends" and "Coverage expectations".
- Update `CLAUDE.md`/AI assistant guidance to point at the new testing standard.

## Success Criteria

- Jest fails when global coverage drops below 90% across statements, branches, functions, and lines.
- Integration suites execute against S3-compatible buckets using `createDatabaseForTest`, with documentation explaining required environment variables.
- CI publishes coverage reports and blocks merges below threshold.
- Developer onboarding doc includes steps to run MinIO or other S3-compatible services locally and switch between memory and S3-backed clients.

## Risks & Mitigations

- **Longer test times**: S3-compatible I/O may increase run time. Mitigate with selective runs (e.g., tag critical suites) and retain memory client for unit tests.
- **Flaky infrastructure**: S3-compatible services (MinIO, LocalStack) could fail builds. Add health checks and retries when initializing the connection string.
- **Coverage noise**: Enforcing coverage might require refactoring brittle or low-value files. Plan phased adoption by decorating legacy areas with TODOs and tracked tickets.

## Open Questions

1. Do we need isolated S3-compatible endpoints or buckets per worker to avoid contention in CI?
2. Should coverage enforcement allow temporary waivers for experimental plugins? If yes, document an approval workflow.
