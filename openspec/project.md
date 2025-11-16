# Project Context

## Purpose
`s3db.js` turns AWS S3 (and S3‑compatible stores) into a document database with an ORM‑like interface, schema validation, encryption, and a plugin system. It provides the shared data layer and optional HTTP API used by services in this workspace (e.g., `mrt-shortner`). The library prioritizes reliability, cost‑efficiency, and simple operational overhead by leveraging S3 durability and metadata.

Core goals:
- Provide a simple, ergonomic CRUD API over S3 with validation and hooks
- Optimize for S3 performance and cost (metadata encoding, caching, batching)
- Offer extensibility via plugins (API server, identity, replication, cache, etc.)
- Ship as ESM with CJS bundles, plus first‑class TypeScript types

## Tech Stack
- **Runtime**: Node.js 18+ (ES Modules; current version 16.2.0)
- **Language**: JavaScript with bundled TypeScript definitions (`dist/s3db.d.ts`)
- **Bundler**: Rollup v4 (ESM + CJS outputs under `dist/`)
- **Package manager**: pnpm (workspace enabled, monorepo structure)
- **Testing**: Jest v30 (90% coverage threshold) + TypeScript compile check via `tsc`
- **Validation**: fastest-validator v1.19+ (schema definitions and runtime checks)
- **AWS SDK**: AWS SDK v3 (`@aws-sdk/client-s3` v3.928+) with tuned `@smithy/node-http-handler` agents
- **HTTP API (plugin)**: Hono v4+ (`hono`, `@hono/node-server`, `@hono/swagger-ui`)
- **Crypto & security**: bcrypt v5-6 (password hashing), AES‑256‑GCM for `secret` fields, `jose` v5-6 for JWT/OIDC
- **CLI**: Commander v14 based CLI in `bin/cli.js`
- **MCP Server**: Model Context Protocol server via `@modelcontextprotocol/sdk` v1.21+ in `mcp/entrypoint.js`
- **Utilities**: nanoid v5.1.6 (ID generation), lodash-es v4.17, json-stable-stringify, @supercharge/promise-pool

Reference commands (see `package.json`):
- **Build**: `pnpm run build:core` (rollup) • `pnpm run dev` (watch mode)
- **Tests**: `pnpm run test` (JS + TS) • `pnpm run test:core` (no plugins) • `pnpm run test:plugins` (plugin tests)
- **Coverage**: `pnpm run test:coverage` (enforces ≥90% threshold) • `pnpm run test:quick` (smoke tests)
- **Types validation**: `pnpm run validate:types` (tsc compile check)
- **Install helpers**: `pnpm run install:dev:minimal` (core only) • `pnpm run install:dev:common` (core + plugins) • `pnpm run install:dev:full` (all deps)

## Project Conventions

### Code Style
- ES Modules, 2‑space indentation, Prettier defaults (via editor)
- Naming: camelCase for variables/functions; PascalCase for classes/plugins (`*Plugin`)
- Keep imports semantically sorted; prefer small, focused modules
- Do not edit `dist/` by hand; build with rollup

### Architecture Patterns
- **Core classes**: `Database`, `Resource`, `Schema`, `Validator` (see `src/*.class.js`)
- **Storage clients**: `S3Client` (AWS S3), `MemoryClient` (tests/dev), `FileSystemClient` (local) under `src/clients/`
- **Concerns**: Shared utilities (encryption, ids, money, geo/ip, event emitters) under `src/concerns/`
- **Streams**: High‑level readers/writers for resources in `src/stream/`
- **Plugins**: Modular capabilities under `src/plugins/` (20+ plugins available). All follow base `Plugin` class pattern.
  - **Lazy loading**: Plugin peer dependencies use lazy loading (v14.1.6+) to prevent "module not found" errors
  - **External dependencies**: Marked as `external` in `rollup.config.js` and `peerDependencies` with `optional: true`
  - **Plugin list**: API, Identity, Cache, Replicator, TTL, Audit, Metrics, Costs, ML, Vector, Puppeteer, CloudInventory, KubernetesInventory, Backup, Importer, CookieFarm, GeoPlugin, FullText, Relation, Scheduler, StateMachine, QueueConsumer, S3Queue, Recon, EventualConsistency
- **API plugin**: Built on Hono with route helpers, guards, auth strategies (JWT/OIDC/API key/basic), Swagger UI, rate limiting and failban
- **Data encoding**: Space‑optimized custom types (e.g., `secret`, `password`, `embedding`, `ip4/ip6`, `geoLat/geoLon`) to fit S3's 2KB metadata limits
  - ISO timestamps → Unix Base62 (67% savings)
  - UUIDs → Binary Base64 (33% savings)
  - Dictionary encoding for common values (95% savings)
  - Vector embeddings → Fixed-point Base62 (77% savings)
- **Events & lifecycle**: Safe event emitters, cron manager, process manager to avoid leaks

### Testing Strategy
- **Test runner**: Jest v30 with 90% global and plugin coverage thresholds (statements/branches/functions/lines)
- **Coverage enforcement**: `pnpm run test:coverage` enforces ≥90% on all metrics (see `jest.config.js`)
- **Type checks**: `tsc` compile of `tests/typescript/` via `pnpm run test:ts`
- **Testing clients**: Use `MemoryClient` (100-1000x faster, zero deps) for unit tests; S3Client for integration tests
- **Test organization**: Suites live under `tests/` and mirror source paths; TypeScript samples under `tests/typescript/`
- **Performance**: Jest configured with 50% CPU workers, 512MB memory limit per worker, 10s default timeout
- **Reporters**: Default + custom progress reporter (`tests/reporters/progress-reporter.cjs`)
- **Commands**:
  - `pnpm run test` (JS + TS combined)
  - `pnpm run test:core` (exclude plugin tests)
  - `pnpm run test:plugins` (plugin tests only, 60s timeout)
  - `pnpm run test:quick` (smoke tests, bail on first failure)
  - `pnpm run test:serial` (run in-band for debugging)
- **Plugin testing**: Set `logLevel: 'silent'` when instantiating plugins in tests unless testing logging behavior

### Git Workflow
- Commits: Conventional Commits (e.g., `feat: add cloud inventory plugin`)
- PRs: Include summary, motivation, testing notes, and logs/screenshots for CLI/API output changes; keep diffs focused and update docs/peer notes when behavior changes
- Spec‑driven changes: Use OpenSpec (see `openspec/AGENTS.md`) for new capabilities, breaking changes, or architecture shifts before implementation

## Domain Context
- **Monorepo structure**: This repo (`s3db.js`) is part of a larger monorepo at `/home/ff/work/martech/shortner/`
  - `s3db.js/` - This library (database layer)
  - `mrt-shortner/` - URL shortener application (uses s3db.js)
- **Shared database layer**: s3db.js is the shared database/API surface used by platform services
  - Changes to s3db.js can impact dependent projects (e.g., `mrt-shortner`)
  - Schema/API changes should be treated as **cross‑repo breaking changes**
  - Test changes in dependent projects before release
- **Connection between projects**:
  - `mrt-shortner` uses s3db.js for all database operations
  - Resources: `users_v1`, `urls_v1`, `clicks_v1`, `views_v1`, `shares_v1`, `notifications_v1`, `attempts_v1`
  - Connection string format: `http://user:pass@host:port/bucket`
  - Event-driven architecture: S3DB events auto-sync to SQS for analytics workers
- **Testing local changes**:
  ```bash
  # In s3db.js/
  pnpm run build
  pnpm link

  # In mrt-shortner/
  pnpm link s3db.js
  # Test changes, then unlink when done
  pnpm unlink s3db.js && pnpm install
  ```
- **Front‑end alignment**: Clients consuming the API should align with the Jade design system (`jade-web`, `jade-design-tokens`)
- **Typical usage patterns**: serverless apps, cost‑sensitive workloads, secure storage of secrets/passwords, analytics replication, and high‑throughput ingestion with partitioning

## Important Constraints
- **S3 metadata limit** (~2KB/key): Library uses compact encodings and spills to object body when needed
  - Behaviors control overflow: `body-overflow` (default), `body-only`, `truncate-data`, `enforce-limits`, `user-managed`
  - Advanced encoding reduces metadata size: timestamps (67% savings), UUIDs (33%), vectors (77%), IPs (44-47%)
- **Security**: Passwords are one‑way hashed (`password` type via bcrypt); reversible secrets must use `secret` (AES‑256‑GCM). Avoid storing plaintext PII
- **Performance**: AWS SDK v3 with keep‑alive agents; batch operations and caching are available to reduce API calls
  - Use `patch()` for metadata-only updates (40-60% faster than `update()`)
  - Use `replace()` for full replacement (30-40% faster, no merge)
  - Use partitions for O(1) lookups vs O(n) scans
- **Distribution**: ESM/CJS bundles emitted to `dist/`; **NEVER edit generated files directly**
  - Source files in `src/`, build outputs in `dist/`
  - Rollup handles bundling and TypeScript definitions
- **Testing**: Maintain ≥90% coverage on ALL metrics (statements/branches/functions/lines)
  - Add integration tests for plugin APIs or cross‑plugin flows
  - Use `MemoryClient` for unit tests (100-1000x faster)
  - Set `logLevel: 'silent'` in plugin instantiation unless testing logging
- **Dependency policy**: Many features are optional via peerDependencies to keep the core light (~500KB)
  - Core dependencies: AWS S3 SDK, fastest-validator, nanoid, lodash-es
  - Plugin dependencies: Install only what you need via `pnpm run install:dev:*`
  - All peer dependencies are marked `optional: true` and lazy-loaded (v14.1.6+)
- **Lazy loading** (CRITICAL): All plugin peer dependencies use lazy loading to prevent "module not found" errors
  - Pattern: Use dynamic imports (`import()`) in loader functions, not static imports
  - All peer dependencies MUST be in `external` array in `rollup.config.js`
  - See `src/plugins/index.js`, `src/plugins/replicators/index.js` for patterns
- **Validation engine**: Uses `fastest-validator` for all schema validation
  - Magic auto-detect: Nested objects don't need `$$type` (e.g., `profile: { bio: 'string' }`)
  - Three formats: Magic (preferred), $$type (control), Explicit (advanced)
  - See `docs/fastest-validator.md` for complete reference

## External Dependencies
- **AWS S3 or S3‑compatible storage** (primary data store) - required, part of core dependencies
- **Optional plugin dependencies** (install on demand via `pnpm run install:dev:*`):
  - **Replicators**: PostgreSQL (`pg`), BigQuery (`@google-cloud/bigquery` + `google-auth-library`), SQS (`@aws-sdk/client-sqs`), PlanetScale (`@planetscale/database`), Turso (`@libsql/client`), RabbitMQ (`amqplib`)
  - **API server**: Hono v4+ (`hono`, `@hono/node-server`, `@hono/swagger-ui`), template engines (EJS/Pug for views)
  - **Identity/OIDC**: `jose` v5-6, `bcrypt` v5-6, email via `nodemailer` v6-7
  - **ML/Vector**: TensorFlow.js (`@tensorflow/tfjs-node` v4+), Xenova Transformers (`@xenova/transformers`)
  - **Puppeteer**: `puppeteer` v24+, `puppeteer-extra`, `puppeteer-extra-plugin-stealth`, `user-agents`, `ghost-cursor`
  - **Cloud Inventory**: 40+ AWS SDK clients (EC2, Lambda, RDS, etc.), GCP SDKs, Azure SDKs, Digital Ocean, Linode, Vultr, OCI, Hetzner, Cloudflare, MongoDB Atlas
  - **Kubernetes**: `@kubernetes/client-node`
  - **Cache**: `ioredis` v5+ for Redis cache driver
  - **Scheduler**: `node-cron` v4+ for cron-based scheduling
- **Install helpers**: See `package.json` scripts for grouped installation
  - `install:dev:minimal` - Core only
  - `install:dev:common` - Core + replicators + plugins
  - `install:dev:full` - All dependencies (15+ cloud providers, all plugins)

## Project Structure (high level)
```
s3db.js/
├── src/                           # Core library source
│   ├── *.class.js                # Core classes (Database, Resource, Schema, Validator, Client)
│   ├── clients/                  # Storage backends (S3Client, MemoryClient, FileSystemClient)
│   ├── concerns/                 # Shared utilities (crypto, encoding, geo, money, etc.)
│   ├── plugins/                  # 20+ plugins (API, Identity, Cache, Replicator, etc.)
│   │   ├── api/                  # Hono-based HTTP API plugin
│   │   ├── identity/             # User authentication and authorization
│   │   ├── replicators/          # Data sync to PostgreSQL, BigQuery, SQS
│   │   ├── consumers/            # Queue consumers (SQS, RabbitMQ)
│   │   └── *-plugin.js           # Individual plugin implementations
│   ├── stream/                   # Streaming readers/writers
│   └── index.js                  # Main entry point
├── dist/                          # Build outputs (generated, do not edit)
│   ├── s3db.es.js               # ESM bundle
│   ├── s3db.cjs                 # CommonJS bundle
│   └── s3db.d.ts                # TypeScript definitions
├── bin/                           # CLI tools
│   └── cli.js                    # Commander-based CLI (`s3db` command)
├── mcp/                           # Model Context Protocol server
│   └── entrypoint.js             # MCP server entry point (`s3db-mcp` command)
├── tests/                         # Jest test suites
│   ├── classes/                  # Core class tests
│   ├── plugins/                  # Plugin tests (60s timeout)
│   ├── typescript/               # TypeScript compile checks
│   └── reporters/                # Custom Jest reporters
├── docs/                          # Documentation
│   ├── examples/                 # Example scripts (e01-e50+)
│   ├── benchmarks/               # Performance benchmarks
│   ├── plugins/                  # Plugin documentation
│   └── *.md                      # Guides (client.md, resource.md, etc.)
├── openspec/                      # OpenSpec change management
│   ├── project.md                # This file
│   ├── AGENTS.md                 # OpenSpec workflow guide
│   └── changes/                  # Change proposals
├── rollup.config.js              # Build configuration
├── jest.config.js                # Test configuration
└── package.json                  # Dependencies and scripts
```

## Key Files Reference

### Core Implementation
- **Database**: `src/database.class.js` - Main database class, resource management, self-healing JSON
- **Resource**: `src/resource.class.js` - CRUD operations, partitioning, validation
  - `insert()` (line 717) - Create records
  - `update()` (line 884) - GET+PUT merge
  - `patch()` (line 1282) - HEAD+COPY (40-60% faster)
  - `replace()` (line 1432) - PUT only (30-40% faster)
  - `get()` (line 1144), `list()` (line 1384), `query()` (line 1616)
- **Schema**: `src/schema.class.js` - Schema validation and encoding/decoding
- **Validator**: `src/validator.class.js` - fastest-validator integration
- **Clients**: `src/clients/s3-client.class.js`, `src/clients/memory-client.class.js`

### Critical Utilities
- **Calculator**: `src/concerns/calculator.js:125` - UTF-8 byte counting for metadata limits
- **Crypto**: `src/concerns/crypto.js` - AES-256-GCM encryption for `secret` fields
- **tryFn**: `src/concerns/try-fn.js` - `[ok, err, data]` error handling pattern
- **Error mapping**: `src/errors.js:190` - AWS error translator with actionable suggestions
- **Plugin storage**: `src/concerns/plugin-storage.js` - HEAD+COPY optimizations for plugins
- **Plugin dependencies**: `src/plugins/concerns/plugin-dependencies.js` - Runtime dependency validation

### Plugin Architecture
- **Base plugin**: `src/plugins/plugin.class.js` - Base class for all plugins
- **Plugin loader**: `src/plugins/index.js` - Lazy loading implementation
- **Replicator loaders**: `src/plugins/replicators/index.js` - Async replicator creation
- **Consumer loaders**: `src/plugins/consumers/index.js` - Async consumer creation
- **Cloud drivers**: `src/plugins/cloud-inventory/index.js` - Lazy cloud driver loading

### Configuration Files
- **Build**: `rollup.config.js` - Bundling, external dependencies, version replacement
- **Tests**: `jest.config.js` - Coverage thresholds, worker config, reporters
- **Package**: `package.json` - Dependencies, scripts, peer dependencies
- **Types**: `src/s3db.d.ts` (source) → `dist/s3db.d.ts` (build output)

### Documentation
- **Main README**: `README.md` - Comprehensive library documentation
- **CLAUDE.md**: `CLAUDE.md` - AI guidance (this is duplicated in root and here)
- **Plugin docs**: `docs/plugins/` - Individual plugin documentation
- **Examples**: `docs/examples/eXX-*.js` - 50+ working examples
- **Testing guide**: `docs/testing.md` - S3-compatible setup, coverage policy
- **Fastest validator**: `docs/fastest-validator.md` - Complete validation reference

## OpenSpec Usage
- When planning features or breaking changes, create a change proposal under `openspec/changes/` and validate with `openspec validate <change-id> --strict` before coding
- Follow `openspec/AGENTS.md` for format and workflow
- Always consult project.md (this file) for tech stack, conventions, and constraints before implementation
