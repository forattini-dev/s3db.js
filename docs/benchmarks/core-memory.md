# Core Memory Benchmark

## Executive Summary

The reports about "100 MB per resource" did not hold up under isolated
measurement.

The main issues were:

- high baseline memory from eager imports in the `Database` core
- leaked `Schema` / validator references in the eager `Resource` path
- packaging and release smoke checks that were not strong enough to guard these regressions

After the fixes, the `dist/` build measured in fresh Node.js processes showed:

| Scenario | Heap Delta (MB) | RSS Delta (MB) |
|----------|----------------:|---------------:|
| `import-database-class` | 2.01 | 14.50 |
| `database-lifecycle` | 6.58 | 31.96 |
| `resources-same-eager` (20 resources) | 6.69 | 24.72 |
| `resources-same-lazy` (20 resources) | 5.55 | 22.41 |
| `resources-different-eager` (20 resources) | 7.40 | 25.30 |

The validator cache now returns to `totalReferences = 0` after
`disconnect()`, which confirms that the eager-resource leak was removed.

## Methodology

- Script: [`scripts/benchmark-memory-core.mjs`](../../scripts/benchmark-memory-core.mjs)
- Build target: `dist/`
- Runtime: `node --expose-gc`
- Isolation: every scenario runs in a fresh subprocess
- Resource count: `20` by default, configurable with
  `S3DB_MEMORY_RESOURCE_COUNT`

Measured scenarios:

1. Import `database.class`
2. Construct `Database`, then `connect()`, then `disconnect()`
3. Create 20 eager resources with the same schema
4. Create 20 lazy resources with the same schema
5. Create 20 eager resources with different schemas

Each scenario captures:

- `heapUsed`
- `heapTotal`
- `rss`
- `external`
- `arrayBuffers`

For resource scenarios the benchmark also records validator cache state before
and after disconnect.

## Findings

### 1. The old perception was dominated by baseline cost

Importing the core database module used to pull in heavy runtime dependencies
eagerly, including storage clients and hot-path helpers that were not needed in
many deployments.

The main remediation was to lazy-load client and resource-related paths in the
database core.

### 2. There was a real eager-path leak

`Resource` could replace its `Schema` instance without disposing the previous
one, which left validator cache references behind.

That leak is now covered by lifecycle tests and by the benchmark guardrail.

### 3. Incremental resource cost is real, but far below 100 MB per instance

In the current `dist/` build, 20 eager resources add roughly 25 MB RSS total in
the benchmark environment, not 2 GB.

That means the main operational risk for small containers is the combination of:

- baseline runtime cost
- actual workload memory
- plugin overhead
- container memory limits

not "100 MB per resource" as a standalone rule.

## Guardrails

Two commands are available:

- `pnpm run benchmark:memory:core`
- `pnpm run benchmark:memory:core:assert`

The `assert` mode enforces conservative budgets and fails if validator
references remain after disconnect.

Current default budgets:

| Scenario | Heap Budget (MB) | RSS Budget (MB) |
|----------|-----------------:|----------------:|
| `import-database-class` | 4 | 28 |
| `database-lifecycle` | 10 | 48 |
| `resources-same-eager` | 12 | 36 |
| `resources-same-lazy` | 10 | 34 |
| `resources-different-eager` | 12 | 36 |

Budgets can be overridden with environment variables such as:

```bash
S3DB_MEMORY_BUDGET_IMPORT_DATABASE_CLASS_RSS_MB=32 \
pnpm run benchmark:memory:core:assert
```

## Practical Takeaways

- The current code no longer supports the claim that each resource costs 100 MB.
- Small containers can still fail if the service combines many plugins,
  background tasks, or other application memory on top of the database layer.
- The benchmark should be run against the production image when sizing memory
  limits, because Node.js version, allocator behavior, and plugin mix can shift
  RSS noticeably.
