# S3-Compatible Test Coverage

**Capability:** testing
**Change:** enforce-s3-compatible-coverage
**Type:** ADDED

## ADDED Requirements

### Requirement: Coverage Threshold Enforcement

Jest-based test runs MUST enforce a global ≥90% threshold across statements, branches, functions, and lines.

#### Scenario: Coverage Fails When Below Threshold

```markdown
Given `pnpm run test:coverage` executes in any environment (local or CI)
When global coverage for statements, branches, functions, or lines drops below 90%
Then the command MUST exit with a non-zero status code
And the CI pipeline MUST mark the job as failed
And the coverage report MUST highlight the files responsible for the drop
```

### Requirement: S3-Compatible Test Harness

Integration suites MUST use a shared S3-compatible harness that provisions databases through `tests/config.js#createDatabaseForTest` when exercising S3 persistence code paths.

#### Scenario: S3-Compatible Harness Initialization

```markdown
Given a Jest integration suite imports the shared S3-compatible helper
When the suite calls the helper to create a database for a test
Then the helper MUST set `BUCKET_CONNECTION_STRING` to the configured S3-compatible endpoint
And it MUST return a database instance created via `createDatabaseForTest`
And it MUST register teardown hooks that delete created buckets/prefixes after the suite completes
```

### Requirement: Documented Contributor Workflow

Contributors MUST have documented steps to run tests with S3-compatible services locally and understand coverage expectations.

#### Scenario: Contributor Reads Testing Guide

```markdown
Given a contributor opens `docs/testing.md`
When they read the "S3-compatible testing" section
Then they MUST find instructions for configuring S3-compatible environment variables (including MinIO and LocalStack), starting the service, and running the suites
And they MUST find the coverage expectations and troubleshooting guidance for coverage failures
And the document MUST reference the shared S3-compatible helper module
```

## Cross-References

- **Depends on:** tests/config.js (provides `createDatabaseForTest` helper)
- **Related to:** CI pipeline configuration enforcing coverage thresholds
