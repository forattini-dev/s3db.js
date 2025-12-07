<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

AI guidance for s3db.js - S3-based document database.

## Critical Policies

**Lazy Loading (v14.1.6+):** All plugin peer dependencies use dynamic imports to prevent "module not found" errors. See pattern in `src/plugins/index.js`.

**Commenting:** No inline comments. Use JSDoc blocks before classes/functions/methods only.

**Validation:** Uses [fastest-validator](https://github.com/icebob/fastest-validator). Nested objects auto-detect - just write `profile: { bio: 'string' }`. Full docs: `docs/fastest-validator.md`

## Quick Reference

### Core API

| Method | Module | Usage |
|--------|--------|-------|
| `insert()` | `_persistence` | `await resource.insert({ name: 'John' })` |
| `get()` | `_persistence` | `await resource.get(id)` |
| `update()` | `_persistence` | GET+PUT merge (baseline) |
| `patch()` | `_persistence` | HEAD+COPY merge (40-60% faster) |
| `replace()` | `_persistence` | PUT only (30-40% faster) |
| `list()` | `_query` | `await resource.list({ limit: 100 })` |
| `query()` | `_query` | `await resource.query({ status: 'active' })` |

### Resource Architecture (Facade Pattern)

```
Resource → _persistence, _query, _partitions, _content, _streams,
           _hooks, _guards, _middleware, _eventsModule, _idGenerator, validator
```

Modules in `src/core/`: ResourcePersistence, ResourceQuery, ResourcePartitions, etc.

### Behaviors (2KB Metadata Limit)

| Behavior | Use Case |
|----------|----------|
| `body-overflow` | Default, auto overflow to body |
| `body-only` | Large data (>2KB) |
| `truncate-data` | Accept data loss for speed |
| `enforce-limits` | Production, strict validation |
| `user-managed` | Custom handling via events |

### Field Types

| Type | Example | Notes |
|------|---------|-------|
| `string` | `name: 'string\|required'` | Basic |
| `number` | `age: 'number\|min:0'` | Integer/float |
| `secret` | `password: 'secret'` | AES-256-GCM encrypted |
| `embedding:N` | `vector: 'embedding:1536'` | 77% compression |
| `ip4`/`ip6` | `ip: 'ip4'` | 44-47% compression |
| `object` | `{ bio: 'string' }` | Auto-detected nested |

### Plugins

| Plugin | Purpose |
|--------|---------|
| `ApiPlugin` | REST API with guards, OpenAPI docs |
| `TTLPlugin` | Auto-cleanup (O(1) partition-based) |
| `CachePlugin` | Memory/S3/filesystem cache |
| `AuditPlugin` | Track all changes |
| `ReplicatorPlugin` | Sync to PostgreSQL/BigQuery/SQS |

### Connection Strings

```
s3://KEY:SECRET@bucket?region=us-east-1     # AWS S3
http://KEY:SECRET@localhost:9000/bucket     # MinIO
memory://bucket/path                        # MemoryClient (testing)
file:///tmp/s3db                            # FileSystemClient (testing)
```

## Commands

```bash
pnpm install && pnpm run build    # Development
s3db list                         # List resources
s3db query <resource>             # Query records
```

## Testing

**ALL tests run inside Docker container:**

```bash
# Start container
docker compose --profile test up -d test-runner

# Run specific test (PREFERRED)
docker compose --profile test exec test-runner pnpm vitest run tests/core/path/to/test.js

# Run directory
docker compose --profile test exec test-runner pnpm vitest run tests/core/

# Stop
docker compose --profile test down
```

**Client Selection:**
| Client | Use Case |
|--------|----------|
| FileSystemClient | Default for tests (safe parallelism) |
| MemoryClient | Single-file only (RAM explosion risk!) |
| S3Client | Integration tests |

**Mock Utilities:** `tests/mocks/` - MockClient, factories, fixtures, spies

## Key Locations

| What | Where |
|------|-------|
| Core modules | `src/core/` |
| Utilities | `src/concerns/` |
| Plugins | `src/plugins/` |
| Tests | `tests/core/`, `tests/plugins/` |
| Examples | `docs/examples/eXX-*.js` |
| MCP Server | `mcp/entrypoint.js` |

## Incremental IDs

```javascript
idGenerator: 'incremental'           // 1, 2, 3...
idGenerator: 'incremental:1000'      // Start at 1000
idGenerator: 'incremental:ORD-0001'  // Prefixed
idGenerator: 'incremental:fast'      // ~1ms/ID (batch mode)
```

## Global Coordinator

All coordinator plugins share `GlobalCoordinatorService` for leader election. One heartbeat loop per namespace (10x fewer API calls).

```javascript
const coordinator = await database.getGlobalCoordinator('default');
console.log('Leader:', await coordinator.getLeader());
```

Plugins with coordination: S3QueuePlugin, SchedulerPlugin, TTLPlugin, EventualConsistencyPlugin

## Constraints

- **S3**: 2KB metadata limit (use behaviors), no transactions, no indexes (use partitions)
- **Security**: `secret` fields auto-encrypted, credentials need URL encoding
- **patch()**: Falls back to update() for body behaviors

## Documentation

- **Plugin Docs Standard:** `docs/plugin-docs-standard.md`
- **Testing Guide:** `docs/testing.md`
- **AWS Costs:** `docs/aws/`
- **Benchmarks:** `docs/benchmarks/`
- **Plugin Guides:** `docs/plugins/`
