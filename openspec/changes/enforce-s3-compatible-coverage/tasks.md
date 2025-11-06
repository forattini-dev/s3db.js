# Implementation Tasks

**Change ID:** `enforce-s3-compatible-coverage`

## Overview

Roadmap for enforcing ≥90% coverage and exercising S3-compatible persistence in automated tests.

## Phase 1 – Harness & Tooling

### Task 1: Ship S3-Compatible Test Harness

- [ ] Create `tests/s3-compatible/index.js` (or equivalent) that wraps `createDatabaseForTest` and wires an S3-compatible connection via `BUCKET_CONNECTION_STRING` (supports MinIO, LocalStack, AWS S3).
- [ ] Add lifecycle utilities (health check, bucket cleanup) and export them for suites.
- [ ] Provide `.env.test.local.example` with required S3-compatible variables (endpoint, region, access key, secret key, bucket name).
- **Validation:** Harness helper can be imported by Jest suites, spins up database handles against the configured endpoint, and cleans them on teardown.

### Task 2: Enforce Coverage Thresholds

- [ ] Update Jest config (`jest.config.js` or package.json) with `coverageThreshold` ≥90% for statements, branches, functions, lines.
- [ ] Ensure `pnpm run test:coverage` fails locally when threshold unmet.
- [ ] Document override/waiver process (if any) inside proposal notes or docs.
- **Validation:** Running coverage locally with intentionally skipped files fails the build; thresholds visible in config.

## Phase 2 – Suite Migration

### Task 3: Migrate High-Value Suites

- [ ] Identify and tag the top S3 integration suites (database CRUD, replication, streaming).
- [ ] Update them to use the S3-compatible harness helpers.
- [ ] Add assertions for S3-compatible behaviors (permissions, pagination, multipart writes as applicable).
- **Validation:** Suites pass against the S3-compatible backend locally and in CI; logs confirm S3Client path executed.

### Task 4: Reduce Coverage Gaps

- [ ] Run coverage report and catalogue files below 90% coverage.
- [ ] Add targeted tests or refactor to cover low-scoring areas (especially error paths).
- [ ] Track remaining gaps in TODO list or issue tracker if deferral needed.
- **Validation:** Coverage report shows ≥90% across all global metrics; documentation lists any accepted deferrals.

## Phase 3 – Documentation & CI

### Task 5: Update Contributor Docs

- [ ] Add "S3-compatible testing" and "Coverage requirements" sections to `docs/testing.md` (create if missing).
- [ ] Update `CLAUDE.md` testing guidance.
- [ ] Link docs from repo README/testing section if applicable.
- **Validation:** Documentation exists, contributors can follow steps to run tests against an S3-compatible service.

### Task 6: Wire CI Enforcement

- [ ] Ensure CI pipeline exports required S3-compatible env vars (use secrets or defaults) and runs/depends on the selected service.
- [ ] Confirm coverage gates fail the pipeline when thresholds unmet.
- [ ] Publish coverage artifact/results for review (e.g., `coverage/lcov-report`).
- **Validation:** CI run demonstrates the S3-compatible integration job passes and fails when coverage dipped below 90% during test run.

## Success Criteria

- All tasks checked above.
- Global coverage ≥90% enforced in CI.
- Key integration suites run against an S3-compatible backend by default.
- Documentation aligned with new workflow.
