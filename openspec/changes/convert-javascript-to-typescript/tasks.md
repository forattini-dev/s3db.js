# Tasks: JavaScript to TypeScript Migration

**Total Files**: 436 source files
**Total Lines**: ~355,586 lines of code
**Estimated Duration**: 15-20 weeks (part-time)

---

## Phase 0: Preparation

**Goal**: Set up TypeScript infrastructure without breaking anything.

### 0.1 Install Dependencies
- [ ] Add `typescript@^5.9.0` to devDependencies
- [ ] Add `@rollup/plugin-typescript@^11.0.0`
- [ ] Add `rollup-plugin-dts@^6.0.0`
- [ ] Add `type-coverage@^2.27.0`
- [ ] Add `@arethetypeswrong/cli@^0.15.0`
- [ ] Run `pnpm install`

### 0.2 TypeScript Configuration
- [ ] Create `tsconfig.json` with strict settings (see design.md)
- [ ] Create `tsconfig.build.json` for production builds
- [ ] Update `package.json` with TypeScript scripts:
  ```json
  {
    "scripts": {
      "build:ts": "tsc -p tsconfig.build.json",
      "typecheck": "tsc --noEmit",
      "build:types": "rollup -c rollup.dts.config.js"
    }
  }
  ```

### 0.3 Build Pipeline Setup
- [ ] Update `rollup.config.js` to support `.ts` files
- [ ] Configure sourcemap generation
- [ ] Create `rollup.dts.config.js` for type bundling
- [ ] Verify dual ESM/CJS output works
- [ ] Test build with single converted file

### 0.4 CI/CD Updates
- [ ] Add `typecheck` job to GitHub Actions
- [ ] Add type coverage reporting
- [ ] Configure build caching for TypeScript
- [ ] Update `.gitignore` for TypeScript artifacts

### 0.5 IDE Configuration
- [ ] Create `.vscode/settings.json` for TypeScript
- [ ] Add recommended extensions
- [ ] Configure import path autocomplete

---

## Phase 1: Foundation (8 files, ~1,000 lines)

**Goal**: Convert leaf nodes with no internal dependencies.

### 1.1 Type Definitions Setup
- [ ] Create `src/types/` directory
- [ ] Create `src/types/index.ts` - Re-exports
- [ ] Create `src/types/common.types.ts` - DeepPartial, MaybeAsync, etc.
- [ ] Create `src/types/config.types.ts` - LogLevel, LoggerOptions

### 1.2 Error Classes (Start Here)
- [ ] Convert `src/errors.js` -> `src/errors.ts` (~300 lines)
  - [ ] Type `ErrorContext` interface
  - [ ] Type `BaseError` class
  - [ ] Type all specific error classes
  - [ ] Ensure backward compatibility
  - [ ] Run tests: `pnpm test -- errors`

### 1.3 Simple Concerns (Leaf Nodes)
- [ ] Convert `src/concerns/try-fn.js` -> `.ts` (~50 lines)
- [ ] Convert `src/concerns/id.js` -> `.ts` (~100 lines)
- [ ] Convert `src/concerns/base62.js` -> `.ts` (~80 lines)
- [ ] Convert `src/concerns/ip.js` -> `.ts` (~150 lines)
- [ ] Convert `src/concerns/money.js` -> `.ts` (~100 lines)
- [ ] Convert `src/concerns/flatten.js` -> `.ts` (~80 lines)
- [ ] Convert `src/concerns/binary.js` -> `.ts` (~120 lines)
- [ ] Run all concern tests

### 1.4 Validation
- [ ] Run `pnpm typecheck`
- [ ] Run full test suite
- [ ] Create git tag: `ts-phase-1-foundation`

---

## Phase 2: Core Classes (18 files, ~12,000 lines)

**Goal**: Convert the critical path classes.

### 2.1 Type Definitions
- [ ] Create `src/types/database.types.ts`
  - [ ] `ExecutorPoolConfig` interface
  - [ ] `DatabaseConfig` interface
  - [ ] `DatabaseEventMap` type
  - [ ] `SavedMetadata` type
- [ ] Create `src/types/resource.types.ts`
  - [ ] `ResourceConfig` interface
  - [ ] `BehaviorName` type
  - [ ] `IdGenerator` type
  - [ ] `HookConfig` interface
  - [ ] `PartitionConfig` interface
  - [ ] `ResourceEventMap` type
- [ ] Create `src/types/schema.types.ts`
  - [ ] `FieldTypeString` type
  - [ ] `FieldDefinition` type
  - [ ] `SchemaAttributes` type
  - [ ] `ParsedField` interface
- [ ] Create `src/types/client.types.ts`
  - [ ] `ClientInterface` interface
  - [ ] `S3ClientType` type

### 2.2 Connection String
- [ ] Convert `src/connection-string.class.js` -> `.ts` (~350 lines)
- [ ] Type `ConnectionString` class
- [ ] Type parsing methods
- [ ] Run tests

### 2.3 Schema Class
- [ ] Convert `src/schema.class.js` -> `.ts` (1,630 lines)
- [ ] Type attribute parsing
- [ ] Type validation methods
- [ ] Type mapper/unmapper functions
- [ ] Type encoding/decoding
- [ ] Run tests: `pnpm test -- schema`

### 2.4 Core Resource Modules (12 files)

**Order matters - dependencies flow down:**

1. [ ] `src/core/resource-config-validator.js` -> `.ts` (~150 lines)
2. [ ] `src/core/resource-id-generator.class.js` -> `.ts` (~250 lines)
3. [ ] `src/core/resource-validator.class.js` -> `.ts` (~200 lines)
4. [ ] `src/core/resource-events.class.js` -> `.ts` (~300 lines)
5. [ ] `src/core/resource-middleware.class.js` -> `.ts` (~200 lines)
6. [ ] `src/core/resource-hooks.class.js` -> `.ts` (~400 lines)
7. [ ] `src/core/resource-guards.class.js` -> `.ts` (~300 lines)
8. [ ] `src/core/resource-content.class.js` -> `.ts` (~400 lines)
9. [ ] `src/core/resource-partitions.class.js` -> `.ts` (~600 lines)
10. [ ] `src/core/resource-streams.class.js` -> `.ts` (~300 lines)
11. [ ] `src/core/resource-query.class.js` -> `.ts` (~800 lines)
12. [ ] `src/core/resource-persistence.class.js` -> `.ts` (1,377 lines)

### 2.5 Main Classes
- [ ] Convert `src/database.class.js` -> `.ts` (2,182 lines)
  - [ ] Type constructor options
  - [ ] Type event emitter
  - [ ] Type plugin management
  - [ ] Type resource creation
  - [ ] Type metadata operations
- [ ] Convert `src/resource.class.js` -> `.ts` (1,916 lines)
  - [ ] Type facade pattern delegation
  - [ ] Type CRUD operations
  - [ ] Type query/list/page operations
  - [ ] Add generic type support `Resource<T>`

### 2.6 Validation
- [ ] Run `pnpm typecheck`
- [ ] Run full test suite
- [ ] Run benchmarks to verify no regression
- [ ] Create git tag: `ts-phase-2-core`

---

## Phase 3: Infrastructure (55 files, ~18,000 lines)

**Goal**: Convert clients, behaviors, streams, and remaining concerns.

### 3.1 Clients (4 files)
- [ ] Convert `src/clients/s3-client.class.js` -> `.ts` (~800 lines)
  - [ ] Type AWS SDK interactions
  - [ ] Type event emissions
- [ ] Convert `src/clients/memory-client.class.js` -> `.ts` (~400 lines)
  - [ ] Implement `ClientInterface`
- [ ] Convert `src/clients/filesystem-client.class.js` -> `.ts` (~300 lines)
  - [ ] Implement `ClientInterface`
- [ ] Convert `src/clients/filesystem-storage.class.js` -> `.ts` (1,226 lines)
- [ ] Run all client tests

### 3.2 Behaviors (6 files)
- [ ] Create `src/types/behavior.types.ts`
- [ ] Convert `src/behaviors/index.js` -> `.ts`
- [ ] Convert `src/behaviors/body-overflow.js` -> `.ts`
- [ ] Convert `src/behaviors/body-only.js` -> `.ts`
- [ ] Convert `src/behaviors/enforce-limits.js` -> `.ts`
- [ ] Convert `src/behaviors/truncate-data.js` -> `.ts`
- [ ] Convert `src/behaviors/user-managed.js` -> `.ts`
- [ ] Run behavior tests

### 3.3 Streams (6 files)
- [ ] Create `src/types/stream.types.ts`
- [ ] Convert `src/stream/index.js` -> `.ts`
- [ ] Convert `src/stream/resource-reader.class.js` -> `.ts`
- [ ] Convert `src/stream/resource-writer.class.js` -> `.ts`
- [ ] Convert `src/stream/resource-ids-reader.class.js` -> `.ts`
- [ ] Convert `src/stream/resource-ids-page-reader.class.js` -> `.ts`
- [ ] Run stream tests

### 3.4 Remaining Concerns (29 files)

**Crypto & Encoding:**
- [ ] Convert `src/concerns/crypto.js` -> `.ts` (~500 lines)
- [ ] Convert `src/concerns/password-hashing.js` -> `.ts` (~150 lines)
- [ ] Convert `src/concerns/metadata-encoding.js` -> `.ts` (~400 lines)
- [ ] Convert `src/concerns/optimized-encoding.js` -> `.ts` (~300 lines)
- [ ] Convert `src/concerns/dictionary-encoding.js` -> `.ts` (~200 lines)
- [ ] Convert `src/concerns/geo-encoding.js` -> `.ts` (~200 lines)

**Events:**
- [ ] Convert `src/concerns/safe-event-emitter.js` -> `.ts` (~150 lines)
- [ ] Convert `src/concerns/async-event-emitter.js` -> `.ts` (~100 lines)

**Concurrency:**
- [ ] Convert `src/concerns/distributed-lock.js` -> `.ts` (~300 lines)
- [ ] Convert `src/concerns/distributed-sequence.js` -> `.ts` (~250 lines)
- [ ] Convert `src/concerns/incremental-sequence.js` -> `.ts` (~300 lines)
- [ ] Convert `src/concerns/map-with-concurrency.js` -> `.ts` (~100 lines)
- [ ] Convert `src/concerns/partition-queue.js` -> `.ts` (~200 lines)

**Monitoring:**
- [ ] Convert `src/concerns/logger.js` -> `.ts` (~300 lines)
- [ ] Convert `src/concerns/logger-redact.js` -> `.ts` (~100 lines)
- [ ] Convert `src/concerns/performance-monitor.js` -> `.ts` (~200 lines)
- [ ] Convert `src/concerns/memory-profiler.js` -> `.ts` (~150 lines)
- [ ] Convert `src/concerns/benchmark.js` -> `.ts` (~200 lines)

**Scheduling:**
- [ ] Convert `src/concerns/cron-manager.js` -> `.ts` (~250 lines)
- [ ] Convert `src/concerns/process-manager.js` -> `.ts` (~300 lines)

**Storage:**
- [ ] Convert `src/concerns/plugin-storage.js` -> `.ts` (1,155 lines)

**Other:**
- [ ] Convert `src/concerns/calculator.js` -> `.ts` (~150 lines)
- [ ] Convert `src/concerns/validator-cache.js` -> `.ts` (~100 lines)
- [ ] Convert `src/concerns/error-classifier.js` -> `.ts` (~150 lines)
- [ ] Convert `src/concerns/http-client.js` -> `.ts` (~300 lines)
- [ ] Convert `src/concerns/adaptive-tuning.js` -> `.ts` (~200 lines)
- [ ] Convert `src/concerns/failban-manager.js` -> `.ts` (~200 lines)
- [ ] Convert `src/concerns/high-performance-inserter.js` -> `.ts` (~300 lines)
- [ ] Convert `src/concerns/index.js` -> `.ts`

### 3.5 Tasks Module (5 files)
- [ ] Create `src/types/tasks.types.ts`
- [ ] Convert `src/tasks/tasks-runner.class.js` -> `.ts` (1,215 lines)
- [ ] Convert `src/tasks/tasks-pool.class.js` -> `.ts` (1,453 lines)
- [ ] Convert remaining task files

### 3.6 Validation
- [ ] Run `pnpm typecheck`
- [ ] Run full test suite
- [ ] Create git tag: `ts-phase-3-infra`

---

## Phase 4: Plugin System (50 files, ~30,000 lines)

**Goal**: Convert plugin base and core plugins.

### 4.1 Plugin Base
- [ ] Create `src/types/plugin.types.ts`
  - [ ] `PluginInterface` interface
  - [ ] `PluginConfig` interface
  - [ ] `PluginDefinition` type
  - [ ] `PluginRegistry` interface
- [ ] Convert `src/plugins/plugin.class.js` -> `.ts` (~400 lines)
- [ ] Convert `src/plugins/plugin.obj.js` -> `.ts`
- [ ] Convert `src/plugins/namespace.js` -> `.ts`
- [ ] Convert `src/plugins/index.js` -> `.ts` (lazy loaders)
  - [ ] Type-safe plugin registry
  - [ ] Preserve dynamic imports

### 4.2 Plugin Errors (12 files)
- [ ] Convert `src/plugins/audit.errors.js` -> `.ts`
- [ ] Convert `src/plugins/backup.errors.js` -> `.ts`
- [ ] Convert `src/plugins/cache.errors.js` -> `.ts`
- [ ] Convert `src/plugins/fulltext.errors.js` -> `.ts`
- [ ] Convert `src/plugins/queue.errors.js` -> `.ts`
- [ ] Convert `src/plugins/replicator.errors.js` -> `.ts`
- [ ] Convert `src/plugins/metrics.errors.js` -> `.ts`
- [ ] Convert `src/plugins/scheduler.errors.js` -> `.ts`
- [ ] Convert `src/plugins/state-machine.errors.js` -> `.ts`
- [ ] Convert `src/plugins/cookie-farm.errors.js` -> `.ts`
- [ ] Convert `src/plugins/ml.errors.js` -> `.ts`
- [ ] Convert `src/plugins/puppeteer.errors.js` -> `.ts`
- [ ] Convert `src/plugins/graph.errors.js` -> `.ts`

### 4.3 Cache Plugin (3 files)
- [ ] Create `src/types/cache.types.ts`
- [ ] Convert `src/plugins/cache.plugin.js` -> `.ts` (1,219 lines)
- [ ] Convert `src/plugins/cache/` subdirectory

### 4.4 Core Plugins
- [ ] Convert `src/plugins/ttl.plugin.js` -> `.ts` (~500 lines)
- [ ] Convert `src/plugins/audit.plugin.js` -> `.ts` (~600 lines)
- [ ] Convert `src/plugins/metrics.plugin.js` -> `.ts` (1,626 lines)
- [ ] Convert `src/plugins/scheduler.plugin.js` -> `.ts` (~800 lines)
- [ ] Convert `src/plugins/costs.plugin.js` -> `.ts` (~500 lines)

### 4.5 Data Plugins
- [ ] Convert `src/plugins/state-machine.plugin.js` -> `.ts` (1,572 lines)
- [ ] Convert `src/plugins/fulltext.plugin.js` -> `.ts` (~600 lines)
- [ ] Convert `src/plugins/geo.plugin.js` -> `.ts` (~500 lines)
- [ ] Convert `src/plugins/vector.plugin.js` -> `.ts` (~400 lines)
- [ ] Convert `src/plugins/graph.plugin.js` -> `.ts` (~500 lines)
- [ ] Convert `src/plugins/tournament.plugin.js` -> `.ts` (~300 lines)

### 4.6 Replicators (8 files)
- [ ] Create `src/types/replicator.types.ts`
- [ ] Convert `src/plugins/replicator.plugin.js` -> `.ts` (1,257 lines)
- [ ] Convert `src/plugins/replicators/index.js` -> `.ts`
- [ ] Convert `src/plugins/replicators/base-replicator.class.js` -> `.ts`
- [ ] Convert `src/plugins/replicators/s3db-replicator.class.js` -> `.ts`
- [ ] Convert `src/plugins/replicators/sqs-replicator.class.js` -> `.ts`
- [ ] Convert `src/plugins/replicators/bigquery-replicator.class.js` -> `.ts`
- [ ] Convert `src/plugins/replicators/postgres-replicator.class.js` -> `.ts`
- [ ] Convert `src/plugins/replicators/webhook-replicator.class.js` -> `.ts`

### 4.7 Consumers (4 files)
- [ ] Create `src/types/consumer.types.ts`
- [ ] Convert `src/plugins/queue-consumer.plugin.js` -> `.ts`
- [ ] Convert `src/plugins/consumers/index.js` -> `.ts`
- [ ] Convert `src/plugins/consumers/sqs-consumer.js` -> `.ts`
- [ ] Convert `src/plugins/consumers/rabbitmq-consumer.js` -> `.ts`

### 4.8 Complex Queue Plugin
- [ ] Convert `src/plugins/s3-queue.plugin.js` -> `.ts` (2,308 lines)
  - [ ] Type message structure
  - [ ] Type coordination
  - [ ] Preserve async patterns

### 4.9 Eventual Consistency (12 files)
- [ ] Create `src/types/eventual-consistency.types.ts`
- [ ] Convert `src/plugins/eventual-consistency/` directory
  - [ ] `index.js` -> `.ts`
  - [ ] `analytics.js` -> `.ts` (1,425 lines)
  - [ ] Remaining files

### 4.10 Backup Plugin (2 files)
- [ ] Convert `src/plugins/backup.plugin.js` -> `.ts`
- [ ] Convert `src/plugins/backup/` subdirectory

### 4.11 Tree Plugin
- [ ] Convert `src/plugins/tree/` directory

### 4.12 Validation
- [ ] Run `pnpm typecheck`
- [ ] Run full test suite
- [ ] Test lazy loading works
- [ ] Create git tag: `ts-phase-4-plugins`

---

## Phase 5: Large Plugins (200+ files, ~100,000 lines)

**Goal**: Convert the largest and most complex plugins.

### 5.1 API Plugin (82 files)

**Types:**
- [ ] Create `src/types/api.types.ts`
  - [ ] `ApiPluginConfig` interface
  - [ ] `RouteConfig` type
  - [ ] `GuardConfig` type
  - [ ] `AuthConfig` types

**Core:**
- [ ] Convert `src/plugins/api/app.class.js` -> `.ts` (1,320 lines)
- [ ] Convert `src/plugins/api/server.js` -> `.ts`

**Utils (8 files):**
- [ ] Convert `src/plugins/api/utils/openapi-generator.js` -> `.ts` (2,248 lines)
- [ ] Convert remaining utils

**Middleware (6 files):**
- [ ] Convert `src/plugins/api/middleware/` directory

**Routes (10 files):**
- [ ] Convert `src/plugins/api/routes/` directory

**Auth (15 files):**
- [ ] Convert `src/plugins/api/auth/oidc-auth.js` -> `.ts` (2,266 lines)
- [ ] Convert `src/plugins/api/auth/oauth2-auth.js` -> `.ts`
- [ ] Convert `src/plugins/api/auth/jwt-auth.js` -> `.ts`
- [ ] Convert `src/plugins/api/auth/oidc-client.js` -> `.ts`
- [ ] Convert remaining auth files

**Guards & Other (~40 files):**
- [ ] Convert remaining API plugin files

### 5.2 Identity Plugin (38 files)

**Types:**
- [ ] Create `src/types/identity.types.ts`
  - [ ] `IdentityPluginConfig` interface
  - [ ] `SessionConfig` type
  - [ ] `OAuth2Config` types

**Core:**
- [ ] Convert `src/plugins/identity/index.js` -> `.ts` (1,790 lines)
- [ ] Convert `src/plugins/identity/oauth2-server.js` -> `.ts` (1,545 lines)
- [ ] Convert `src/plugins/identity/session.js` -> `.ts`

**UI (12 files):**
- [ ] Convert `src/plugins/identity/ui/routes.js` -> `.ts` (2,711 lines)
- [ ] Convert remaining UI files

**Other (~20 files):**
- [ ] Convert remaining identity files

### 5.3 Cloud Inventory Plugin (15 files)

**Types:**
- [ ] Create `src/types/cloud-inventory.types.ts`
  - [ ] `CloudResource` interface
  - [ ] `CloudProvider` type
  - [ ] `DriverConfig` interface

**Core:**
- [ ] Convert `src/plugins/cloud-inventory.plugin.js` -> `.ts` (1,446 lines)

**Drivers (8 files):**
- [ ] Convert `src/plugins/cloud-inventory/drivers/base-driver.js` -> `.ts`
- [ ] Convert `src/plugins/cloud-inventory/drivers/aws-driver.js` -> `.ts` (2,586 lines)
- [ ] Convert `src/plugins/cloud-inventory/drivers/azure-driver.js` -> `.ts`
- [ ] Convert `src/plugins/cloud-inventory/drivers/gcp-driver.js` -> `.ts`
- [ ] Convert `src/plugins/cloud-inventory/drivers/vultr-driver.js` -> `.ts`
- [ ] Convert remaining drivers

### 5.4 Recon Plugin (33 files)

**Types:**
- [ ] Create `src/types/recon.types.ts`
  - [ ] `ReconPluginConfig` interface
  - [ ] `StageResult` type
  - [ ] `FeatureConfig` types

**Core:**
- [ ] Convert `src/plugins/recon.plugin.js` -> `.ts`
- [ ] Convert `src/plugins/recon/command-runner.js` -> `.ts`
- [ ] Convert `src/plugins/recon/dependency-manager.js` -> `.ts`

**Config (2 files):**
- [ ] Convert `src/plugins/recon/config/defaults.js` -> `.ts`
- [ ] Convert `src/plugins/recon/config/presets.js` -> `.ts`

**Stages (18 files):**
- [ ] Convert `src/plugins/recon/stages/dns-stage.js` -> `.ts`
- [ ] Convert `src/plugins/recon/stages/ports-stage.js` -> `.ts`
- [ ] Convert `src/plugins/recon/stages/subdomains-stage.js` -> `.ts`
- [ ] Convert `src/plugins/recon/stages/web-stage.js` -> `.ts`
- [ ] Convert `src/plugins/recon/stages/osint-stage.js` -> `.ts`
- [ ] Convert `src/plugins/recon/stages/vulnerability-stage.js` -> `.ts`
- [ ] Convert remaining stage files

### 5.5 Spider Plugin (13 files)

**Types:**
- [ ] Create `src/types/spider.types.ts`

**Core:**
- [ ] Convert `src/plugins/spider.plugin.js` -> `.ts` (1,513 lines)
- [ ] Convert `src/plugins/spider/seo-analyzer.js` -> `.ts` (1,321 lines)
- [ ] Convert `src/plugins/spider/robots-parser.js` -> `.ts`
- [ ] Convert `src/plugins/spider/sitemap-parser.js` -> `.ts`
- [ ] Convert `src/plugins/spider/deep-discovery.js` -> `.ts`
- [ ] Convert remaining spider files

### 5.6 TFState Plugin (5 files)
- [ ] Convert `src/plugins/tfstate/index.js` -> `.ts` (2,609 lines)
- [ ] Convert remaining tfstate files

### 5.7 ML Plugin (5 files)
- [ ] Convert `src/plugins/ml.plugin.js` -> `.ts` (2,139 lines)
- [ ] Convert `src/plugins/ml/` subdirectory

### 5.8 Puppeteer Plugin (2 files)
- [ ] Convert `src/plugins/puppeteer.plugin.js` -> `.ts` (1,607 lines)
- [ ] Convert `src/plugins/puppeteer/` subdirectory

### 5.9 Other Plugins

**WebSocket (3 files):**
- [ ] Convert `src/plugins/websocket/server.js` -> `.ts` (1,303 lines)
- [ ] Convert remaining websocket files

**Cookie Farm (2 files):**
- [ ] Convert `src/plugins/cookie-farm.plugin.js` -> `.ts`
- [ ] Convert `src/plugins/cookie-farm-suite.plugin.js` -> `.ts`

**Kubernetes Inventory:**
- [ ] Convert `src/plugins/kubernetes-inventory.plugin.js` -> `.ts`
- [ ] Convert `src/plugins/kubernetes-inventory/` directory

**SMTP:**
- [ ] Convert `src/plugins/smtp.plugin.js` -> `.ts`
- [ ] Convert `src/plugins/smtp/` directory

**Importer:**
- [ ] Convert `src/plugins/importer/` directory

**Shared & Concerns:**
- [ ] Convert `src/plugins/shared/` directory
- [ ] Convert `src/plugins/concerns/` directory

### 5.10 Validation
- [ ] Run `pnpm typecheck`
- [ ] Run full test suite
- [ ] Test all lazy loading patterns
- [ ] Create git tag: `ts-phase-5-large-plugins`

---

## Phase 6: Integrations & Cleanup (25 files, ~10,000 lines)

**Goal**: CLI, MCP, and final cleanup.

### 6.1 CLI (15 files)
- [ ] Create `src/types/cli.types.ts`
- [ ] Convert `src/cli/index.js` -> `.ts` (1,345 lines)
- [ ] Convert CLI command handlers
- [ ] Type commander.js integration
- [ ] Preserve bin script compatibility

### 6.2 MCP Server (10 files)
- [ ] Create `mcp/types/` directory
- [ ] Convert `mcp/entrypoint.js` -> `.ts`
- [ ] Type tool definitions
- [ ] Type transport handlers
- [ ] Convert remaining MCP files

### 6.3 Main Index
- [ ] Convert `src/index.js` -> `src/index.ts`
- [ ] Export all types
- [ ] Verify all re-exports work
- [ ] Test import paths

### 6.4 Remove Manual Types
- [ ] Delete `src/s3db.d.ts` (1,704 lines)
- [ ] Delete `src/concerns/typescript-generator.d.ts` if exists
- [ ] Update rollup config to remove type copying

### 6.5 Type Declaration Bundle
- [ ] Generate single `dist/s3db.d.ts`
- [ ] Verify all exports are properly typed
- [ ] Test with `@arethetypeswrong/cli`
- [ ] Validate with `tsc --noEmit`

### 6.6 Documentation Updates
- [ ] Update `CLAUDE.md` with TypeScript patterns
- [ ] Update `README.md` with TypeScript examples
- [ ] Add TypeScript usage guide to docs
- [ ] Update API documentation

### 6.7 Quality Assurance
- [ ] Run full test suite
- [ ] Run type coverage analysis (target: > 95%)
- [ ] Run bundle size comparison
- [ ] Run performance benchmarks
- [ ] Test in real-world project

### 6.8 Release Preparation
- [ ] Update CHANGELOG.md
- [ ] Update version to v19.0.0
- [ ] Create migration guide for v18 -> v19
- [ ] Prepare release notes
- [ ] Create git tag: `ts-phase-6-final`
- [ ] Tag release: `v19.0.0`

---

## File Conversion Tracking

### Conversion Status Legend
- `[ ]` - Not started
- `[~]` - In progress
- `[x]` - Completed
- `[!]` - Blocked

### Core Files (6 files)
| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `src/index.js` | 150 | [ ] | Last to convert |
| `src/database.class.js` | 2,182 | [ ] | Phase 2 |
| `src/resource.class.js` | 1,916 | [ ] | Phase 2 |
| `src/schema.class.js` | 1,630 | [ ] | Phase 2 |
| `src/connection-string.class.js` | 350 | [ ] | Phase 2 |
| `src/errors.js` | 300 | [ ] | Phase 1 (start) |

### Core Modules (12 files)
| File | Lines | Status | Depends On |
|------|-------|--------|------------|
| `resource-config-validator.js` | 150 | [ ] | None |
| `resource-id-generator.class.js` | 250 | [ ] | concerns |
| `resource-validator.class.js` | 200 | [ ] | schema |
| `resource-events.class.js` | 300 | [ ] | None |
| `resource-middleware.class.js` | 200 | [ ] | None |
| `resource-hooks.class.js` | 400 | [ ] | events |
| `resource-guards.class.js` | 300 | [ ] | None |
| `resource-content.class.js` | 400 | [ ] | schema |
| `resource-partitions.class.js` | 600 | [ ] | query |
| `resource-streams.class.js` | 300 | [ ] | query |
| `resource-query.class.js` | 800 | [ ] | client |
| `resource-persistence.class.js` | 1,377 | [ ] | all above |

### Clients (4 files)
| File | Lines | Status |
|------|-------|--------|
| `s3-client.class.js` | 800 | [ ] |
| `memory-client.class.js` | 400 | [ ] |
| `filesystem-client.class.js` | 300 | [ ] |
| `filesystem-storage.class.js` | 1,226 | [ ] |

### Behaviors (6 files)
| File | Lines | Status |
|------|-------|--------|
| `behaviors/index.js` | 50 | [ ] |
| `body-overflow.js` | 300 | [ ] |
| `body-only.js` | 200 | [ ] |
| `enforce-limits.js` | 200 | [ ] |
| `truncate-data.js` | 200 | [ ] |
| `user-managed.js` | 150 | [ ] |

### Concerns (37 files)
| Category | Files | Total Lines | Status |
|----------|-------|-------------|--------|
| Crypto | 3 | ~800 | [ ] |
| Encoding | 4 | ~1,100 | [ ] |
| Events | 2 | ~250 | [ ] |
| Concurrency | 5 | ~1,150 | [ ] |
| Monitoring | 5 | ~950 | [ ] |
| Scheduling | 2 | ~550 | [ ] |
| Utilities | 8 | ~600 | [ ] |
| Storage | 1 | 1,155 | [ ] |
| Other | 7 | ~1,500 | [ ] |

### Plugins Summary
| Category | Files | Total Lines | Status |
|----------|-------|-------------|--------|
| Plugin base | 4 | ~600 | [ ] |
| Plugin errors | 12 | ~1,200 | [ ] |
| Core plugins | 10 | ~8,000 | [ ] |
| Data plugins | 8 | ~4,500 | [ ] |
| Replicators | 8 | ~4,000 | [ ] |
| Consumers | 4 | ~1,500 | [ ] |
| Queue plugins | 2 | ~3,500 | [ ] |
| Eventual consistency | 12 | ~5,000 | [ ] |
| API plugin | 82 | ~35,000 | [ ] |
| Identity plugin | 38 | ~18,000 | [ ] |
| Cloud inventory | 15 | ~8,000 | [ ] |
| Recon plugin | 33 | ~12,000 | [ ] |
| Spider plugin | 13 | ~6,000 | [ ] |
| Other plugins | 80 | ~25,000 | [ ] |

---

## Progress Summary

| Phase | Total Tasks | Completed | Progress |
|-------|-------------|-----------|----------|
| Phase 0: Preparation | 15 | 0 | 0% |
| Phase 1: Foundation | 20 | 0 | 0% |
| Phase 2: Core Classes | 25 | 0 | 0% |
| Phase 3: Infrastructure | 60 | 0 | 0% |
| Phase 4: Plugin System | 70 | 0 | 0% |
| Phase 5: Large Plugins | 120 | 0 | 0% |
| Phase 6: Cleanup | 20 | 0 | 0% |
| **Total** | **330** | **0** | **0%** |

---

## Notes

### Conversion Best Practices

1. **Start with leaf nodes**: Files with no internal dependencies
2. **Follow dependency order**: Convert dependencies before dependents
3. **Keep tests passing**: Run tests after each file conversion
4. **Preserve patterns**: Dynamic imports, EventEmitter, Facade pattern
5. **Type gradually**: Start with `any`, refine types over time
6. **Use `// @ts-expect-error` sparingly**: Only for known issues

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Circular imports | Use `import type` for types only |
| Optional peer deps | Keep dynamic imports |
| EventEmitter typing | Use `TypedEventEmitter` wrapper |
| Generic class constraints | Use `extends Record<string, unknown>` |
| Implicit any in callbacks | Add explicit parameter types |

### Testing After Each Conversion

```bash
# After each file conversion
pnpm typecheck                    # Check TypeScript compiles
pnpm test -- <related-test>       # Run related tests
pnpm test:fs:core                 # Run core tests (if core file)

# After each phase
pnpm test                         # Run all tests
pnpm run benchmark               # Check performance
```

### Rollback Commands

```bash
# Revert single file
git checkout HEAD~1 -- src/path/file.ts
mv src/path/file.ts src/path/file.js

# Revert entire phase
git checkout ts-phase-X-name
```
