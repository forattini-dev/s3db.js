# OpenSpec Proposal: Convert JavaScript to TypeScript

**Status**: Draft
**Author**: AI Assistant
**Created**: 2025-12-07
**Updated**: 2025-12-08
**Target Version**: v19.0.0

## Summary

Migrate the entire s3db.js codebase from JavaScript to TypeScript, replacing the manually maintained `s3db.d.ts` (1,700+ lines) with proper TypeScript source files that generate accurate type definitions automatically.

## Why

### Current Pain Points

1. **Manual Type Maintenance**: The current `src/s3db.d.ts` file (1,704 lines) is manually maintained and frequently becomes out of sync with the actual implementation.

2. **No Compile-Time Safety**: JavaScript allows runtime errors that TypeScript would catch at compile time:
   - Undefined property access
   - Incorrect function signatures
   - Missing interface implementations
   - Type mismatches in plugin configurations

3. **Developer Experience**: Contributors face a steep learning curve without type information:
   - No inline documentation in IDEs
   - Manual lookup of method signatures
   - Guessing at configuration shapes
   - No autocomplete for complex nested options

4. **Plugin System Complexity**: 20+ plugins with intricate configuration options and interdependencies are difficult to document and use correctly without types.

5. **Refactoring Risk**: Large-scale refactoring (like the recent Resource class refactor: 4,600 -> 1,905 lines) is risky without type checking.

### Benefits of TypeScript Migration

1. **Automatic Type Generation**: `.d.ts` files generated from source, always in sync.
2. **Catch Bugs Early**: 10-20% of runtime bugs caught at compile time (industry studies).
3. **Improved Refactoring**: IDE support for safe renames, method extraction, and interface changes.
4. **Better Documentation**: Types serve as living documentation, reducing need for separate API docs.
5. **Ecosystem Alignment**: Modern Node.js ecosystem heavily favors TypeScript.
6. **AI Integration**: Better type information improves AI-assisted development and MCP integrations.

## What Changes

### Complete File Inventory

**Total Codebase Statistics:**
| Metric | Count |
|--------|-------|
| Source Files (.js) | 436 |
| Total Lines of Code | 355,586 |
| Average Lines per File | 815 |
| Manual Type Definitions | 1,704 lines |

### Directory Breakdown

| Directory | Files | Est. Lines | Complexity | Priority |
|-----------|-------|------------|------------|----------|
| `src/` (root) | 6 | ~8,000 | High | P0 |
| `src/core/` | 12 | ~12,000 | High | P0 |
| `src/concerns/` | 37 | ~12,000 | Medium | P1 |
| `src/clients/` | 4 | ~4,000 | Medium | P1 |
| `src/behaviors/` | 6 | ~2,500 | Low | P1 |
| `src/stream/` | 6 | ~2,000 | Low | P1 |
| `src/tasks/` | 5 | ~5,000 | Medium | P2 |
| `src/cli/` | 15 | ~4,000 | Medium | P3 |
| `src/plugins/` (root) | 42 | ~25,000 | High | P2 |
| `src/plugins/api/` | 82 | ~35,000 | Very High | P3 |
| `src/plugins/identity/` | 38 | ~18,000 | Very High | P3 |
| `src/plugins/recon/` | 33 | ~12,000 | High | P3 |
| `src/plugins/cloud-inventory/` | 15 | ~8,000 | High | P3 |
| `src/plugins/spider/` | 13 | ~6,000 | Medium | P3 |
| `src/plugins/eventual-consistency/` | 12 | ~5,000 | Medium | P3 |
| `src/plugins/tfstate/` | 5 | ~4,000 | Medium | P3 |
| `src/plugins/ml/` | 5 | ~3,000 | Medium | P3 |
| `src/plugins/` (other subdirs) | 80 | ~25,000 | Medium | P3 |
| `mcp/` | 10 | ~3,000 | Medium | P4 |

### Largest Files (Require Most Attention)

| File | Lines | Complexity | Notes |
|------|-------|------------|-------|
| `plugins/identity/ui/routes.js` | 2,711 | Very High | UI routing, many conditional types |
| `plugins/tfstate/index.js` | 2,609 | High | Terraform state parsing |
| `plugins/cloud-inventory/drivers/aws-driver.js` | 2,586 | Very High | AWS SDK interactions |
| `plugins/s3-queue.plugin.js` | 2,308 | High | Queue coordination |
| `plugins/api/auth/oidc-auth.js` | 2,266 | Very High | OIDC protocol implementation |
| `plugins/api/utils/openapi-generator.js` | 2,248 | High | OpenAPI spec generation |
| `database.class.js` | 2,182 | High | Core class, many dependencies |
| `plugins/ml.plugin.js` | 2,139 | High | ML model integration |
| `resource.class.js` | 1,916 | High | Core class, facade pattern |
| `plugins/identity/index.js` | 1,790 | High | Identity plugin orchestration |
| `schema.class.js` | 1,630 | High | Schema validation, encoding |
| `plugins/metrics.plugin.js` | 1,626 | Medium | Metrics collection |
| `plugins/puppeteer.plugin.js` | 1,607 | High | Browser automation |
| `plugins/state-machine.plugin.js` | 1,572 | Medium | FSM implementation |

### Core Classes (12 files)

| File | Lines | Dependencies | Critical Path |
|------|-------|--------------|---------------|
| `src/database.class.js` | 2,182 | clients, schema, concerns | Yes |
| `src/resource.class.js` | 1,916 | core modules, behaviors | Yes |
| `src/schema.class.js` | 1,630 | concerns/crypto, validator | Yes |
| `src/connection-string.class.js` | 350 | None | Yes |
| `src/errors.js` | 300 | None | Yes (start here) |
| `src/index.js` | 150 | All | Yes (last) |

### Core Modules (12 files in `src/core/`)

| File | Lines | Responsibility |
|------|-------|----------------|
| `resource-persistence.class.js` | 1,377 | CRUD operations |
| `resource-query.class.js` | ~800 | Query/list/page |
| `resource-partitions.class.js` | ~600 | Partition management |
| `resource-hooks.class.js` | ~400 | Before/after hooks |
| `resource-guards.class.js` | ~300 | Permission guards |
| `resource-events.class.js` | ~300 | Event emission |
| `resource-content.class.js` | ~400 | Content/body handling |
| `resource-streams.class.js` | ~300 | Streaming API |
| `resource-middleware.class.js` | ~200 | Middleware chain |
| `resource-id-generator.class.js` | ~250 | ID generation |
| `resource-validator.class.js` | ~200 | Input validation |
| `resource-config-validator.js` | ~150 | Config validation |

### Concerns (37 files in `src/concerns/`)

| Category | Files | Notes |
|----------|-------|-------|
| **Crypto** | `crypto.js`, `password-hashing.js`, `base62.js` | AES-256, Argon2 |
| **Encoding** | `metadata-encoding.js`, `optimized-encoding.js`, `dictionary-encoding.js`, `geo-encoding.js` | S3 metadata compression |
| **Events** | `safe-event-emitter.js`, `async-event-emitter.js` | EventEmitter wrappers |
| **Concurrency** | `distributed-lock.js`, `distributed-sequence.js`, `incremental-sequence.js`, `map-with-concurrency.js` | S3-based coordination |
| **Scheduling** | `cron-manager.js`, `process-manager.js` | Background tasks |
| **Monitoring** | `logger.js`, `performance-monitor.js`, `memory-profiler.js`, `benchmark.js` | Observability |
| **Utilities** | `id.js`, `try-fn.js`, `calculator.js`, `ip.js`, `money.js`, `flatten.js`, `binary.js` | General helpers |
| **Storage** | `plugin-storage.js` | Plugin state persistence |
| **Validation** | `validator-cache.js`, `error-classifier.js` | Input validation |
| **HTTP** | `http-client.js` | HTTP client wrapper |
| **Other** | `adaptive-tuning.js`, `failban-manager.js`, `partition-queue.js`, `typescript-generator.js` | Specialized |

### Plugin Categories

#### 1. Core Plugins (Always Used)
| Plugin | Files | Lines | External Dependencies |
|--------|-------|-------|----------------------|
| `plugin.class.js` | 1 | 400 | None |
| `cache.plugin.js` | 3 | 1,500 | Optional: ioredis |
| `ttl.plugin.js` | 1 | 500 | None |
| `audit.plugin.js` | 1 | 600 | None |
| `metrics.plugin.js` | 1 | 1,626 | None |

#### 2. API Plugin (82 files)
| Subdirectory | Files | Purpose |
|--------------|-------|---------|
| `api/auth/` | 15 | OAuth2, OIDC, JWT, API Key |
| `api/utils/` | 8 | OpenAPI, validation |
| `api/middleware/` | 6 | Rate limiting, CORS |
| `api/routes/` | 10 | CRUD routes |
| `api/` (root) | 43 | App, server, guards |

#### 3. Identity Plugin (38 files)
| Subdirectory | Files | Purpose |
|--------------|-------|---------|
| `identity/ui/` | 12 | Login pages, SSR |
| `identity/` (root) | 26 | OAuth2 server, session |

#### 4. Recon Plugin (33 files)
| Subdirectory | Files | Purpose |
|--------------|-------|---------|
| `recon/stages/` | 18 | DNS, ports, web, osint |
| `recon/config/` | 2 | Defaults, presets |
| `recon/` (root) | 13 | Orchestration |

#### 5. Cloud Inventory (15 files)
| Subdirectory | Files | Purpose |
|--------------|-------|---------|
| `cloud-inventory/drivers/` | 8 | AWS, Azure, GCP, Vultr |
| `cloud-inventory/` (root) | 7 | Base driver, sync |

#### 6. Replicators (8 files)
| File | Target | External Deps |
|------|--------|---------------|
| `s3db-replicator.class.js` | Another S3DB | None |
| `postgres-replicator.class.js` | PostgreSQL | pg |
| `bigquery-replicator.class.js` | BigQuery | @google-cloud/bigquery |
| `sqs-replicator.class.js` | AWS SQS | @aws-sdk/client-sqs |
| `webhook-replicator.class.js` | HTTP webhooks | None |

### Files NOT Converted

| Category | Count | Reason |
|----------|-------|--------|
| Tests (`tests/`) | ~345 files | Remain as `.js` using Vitest |
| Examples (`docs/examples/`) | ~60 files | Remain as `.js` for simplicity |
| Documentation | N/A | Unchanged |
| Config files | ~10 | `.config.js` files remain JS |

## Migration Strategy: Incremental Adoption

### Phase 0: Preparation (1 week)
**Goal**: Establish foundation without breaking anything.

1. **Configure TypeScript**
   - Create `tsconfig.json` with strict settings
   - Create `tsconfig.build.json` for production
   - Add TypeScript 5.9+ to devDependencies

2. **Update Build Pipeline**
   - Rollup config for `.ts` files
   - Sourcemap configuration
   - `.d.ts` bundling setup

3. **CI/CD Updates**
   - Add `typecheck` job to GitHub Actions
   - Type coverage reporting
   - Build caching for TypeScript

### Phase 1: Foundation (2 weeks)
**Goal**: Convert leaf nodes with no internal dependencies.

**Files to Convert (in order):**
1. `src/errors.js` -> `src/errors.ts` (300 lines)
2. `src/concerns/try-fn.js` -> `.ts` (50 lines)
3. `src/concerns/id.js` -> `.ts` (100 lines)
4. `src/concerns/base62.js` -> `.ts` (80 lines)
5. `src/concerns/ip.js` -> `.ts` (150 lines)
6. `src/concerns/money.js` -> `.ts` (100 lines)
7. `src/concerns/flatten.js` -> `.ts` (80 lines)
8. `src/concerns/binary.js` -> `.ts` (120 lines)

**Type Definitions:**
- Create `src/types/index.ts`
- Create `src/types/common.types.ts`
- Create `src/types/config.types.ts`

### Phase 2: Core Classes (3 weeks)
**Goal**: Convert the critical path classes.

**Order of Conversion:**
1. `src/connection-string.class.js` (350 lines)
2. `src/schema.class.js` (1,630 lines) - requires types/schema.types.ts
3. `src/core/` modules (12 files, ~6,000 lines total)
4. `src/database.class.js` (2,182 lines)
5. `src/resource.class.js` (1,916 lines)

**Critical Type Definitions:**
- `src/types/database.types.ts`
- `src/types/resource.types.ts`
- `src/types/schema.types.ts`
- `src/types/events.types.ts`

### Phase 3: Infrastructure (2 weeks)
**Goal**: Convert clients, behaviors, streams.

**Clients (4 files):**
1. Create `src/types/client.types.ts` - interface
2. `src/clients/s3-client.class.js`
3. `src/clients/memory-client.class.js`
4. `src/clients/filesystem-client.class.js`
5. `src/clients/filesystem-storage.class.js`

**Behaviors (6 files):**
1. `src/behaviors/index.js`
2. All 5 behavior implementations

**Streams (6 files):**
1. `src/stream/` - all files

**Remaining Concerns (~25 files):**
- Prioritize by dependency count
- crypto.js, logger.js have most dependents

### Phase 4: Plugin System (4 weeks)
**Goal**: Convert plugin base and core plugins.

**Week 1: Plugin Base**
1. `src/types/plugin.types.ts`
2. `src/plugins/plugin.class.js`
3. `src/plugins/index.js` (lazy loaders)
4. `src/plugins/namespace.js`

**Week 2: Core Plugins**
1. `cache.plugin.js` + `cache/`
2. `ttl.plugin.js`
3. `audit.plugin.js`
4. `metrics.plugin.js`
5. `scheduler.plugin.js`

**Week 3: Data Plugins**
1. `replicator.plugin.js` + `replicators/`
2. `queue-consumer.plugin.js` + `consumers/`
3. `state-machine.plugin.js`
4. `fulltext.plugin.js`
5. `geo.plugin.js`
6. `vector.plugin.js`
7. `graph.plugin.js`

**Week 4: Complex Plugins**
1. `s3-queue.plugin.js` (2,308 lines)
2. `eventual-consistency.plugin.js` + `eventual-consistency/`
3. `costs.plugin.js`
4. `backup.plugin.js`

### Phase 5: Large Plugins (4 weeks)
**Goal**: Convert the largest and most complex plugins.

**Week 1-2: API Plugin (82 files)**
1. Types: `src/types/api.types.ts`
2. `api/app.class.js`
3. `api/utils/` (OpenAPI generator, validation)
4. `api/middleware/`
5. `api/routes/`
6. `api/auth/` (OIDC, OAuth2, JWT)

**Week 3: Identity Plugin (38 files)**
1. Types: `src/types/identity.types.ts`
2. `identity/index.js`
3. `identity/oauth2-server.js`
4. `identity/ui/`

**Week 4: Other Large Plugins**
1. `cloud-inventory.plugin.js` + drivers (15 files)
2. `recon.plugin.js` + stages (33 files)
3. `spider.plugin.js` + components (13 files)
4. `tfstate/` (5 files)
5. `ml.plugin.js` + `ml/` (5 files)
6. `puppeteer.plugin.js`

### Phase 6: Integrations & Cleanup (2 weeks)

**Week 1: CLI & MCP**
1. `src/cli/index.js` + commands
2. `mcp/entrypoint.js` + tools
3. `src/tasks/` (task runner)

**Week 2: Cleanup**
1. Delete `src/s3db.d.ts`
2. Update `src/index.ts` exports
3. Generate rolled-up `.d.ts`
4. Update documentation
5. Performance benchmarks
6. Release v19.0.0

## Key Technical Decisions

### 1. TypeScript Version: 5.9+

**Rationale:**
- Native decorator support
- Improved type inference
- Better ESM support
- `satisfies` operator for config validation

### 2. Module System: NodeNext

```json
{
  "module": "NodeNext",
  "moduleResolution": "NodeNext"
}
```

**Rationale:**
- Native ESM with CJS fallback
- Proper `.js` extensions in imports
- Best Node.js 18+ compatibility

### 3. Strict Mode: Full

```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "strictFunctionTypes": true,
  "noUncheckedIndexedAccess": true
}
```

**Rationale:**
- Catch most type errors
- Better IDE support
- Safer refactoring

### 4. Lazy Loading Preservation

```typescript
const PLUGIN_LOADERS: Record<string, () => Promise<typeof BasePlugin>> = {
  api: () => import('./api.plugin.js').then(m => m.ApiPlugin),
  cache: () => import('./cache.plugin.js').then(m => m.CachePlugin),
};
```

**Rationale:**
- Optional dependencies remain optional
- Startup time unchanged
- Bundle size controlled

### 5. Test Compatibility

- Tests remain as `.js` files
- Import compiled TypeScript modules
- No test framework changes required

## Impact

### Breaking Changes

**NONE** - This is a pure refactoring with no API changes.

1. **API Stability**: All public APIs remain identical
2. **Runtime Behavior**: No functional changes
3. **Import Paths**: Same paths work

### Non-Breaking Additions

1. **Better Types**: More complete type definitions
2. **Generic Support**: `Resource<T>` for typed resources
3. **Type Exports**: Additional type exports available

```typescript
import type {
  DatabaseConfig,
  ResourceConfig,
  PluginInterface,
  TypedResource
} from 's3db.js';
```

### Migration for Users

- **JavaScript Users**: Zero changes required
- **TypeScript Users**:
  - Better type inference
  - More complete type definitions
  - Generic support for custom schemas

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Build complexity increases | Medium | High | Comprehensive CI/CD, pre-commit hooks |
| Type definition gaps | Low | Medium | Phase-by-phase validation with tests |
| Performance regression | Low | Low | Benchmark suite before/after each phase |
| Plugin lazy loading breaks | High | Low | Test dynamic imports in each phase |
| Large PR reviews | High | High | Atomic per-component PRs, max 500 LOC |
| External dependency typing | Medium | Medium | Use existing `@types/*` packages |
| Contributor learning curve | Low | Medium | TypeScript migration guide in docs |

### Rollback Strategy

1. **Per-file**: Revert `.ts` to `.js` via git
2. **Per-phase**: Git tags at each phase completion
3. **Build fallback**: Keep JS-only Rollup config
4. **Version pinning**: Users can pin to v18.x

## Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Files converted | 436/436 | Count `.ts` files |
| Type coverage | > 95% | `type-coverage` package |
| Test pass rate | 100% | CI/CD pipeline |
| Bundle size increase | < 15% | Compare dist sizes |
| Build time increase | < 3x | CI build timing |
| Runtime performance | < 5% variance | Benchmark suite |
| Manual `.d.ts` lines | 0 | Delete file |

## Dependencies

### New DevDependencies

```json
{
  "devDependencies": {
    "typescript": "^5.9.0",
    "rollup-plugin-dts": "^6.0.0",
    "@rollup/plugin-typescript": "^11.0.0",
    "type-coverage": "^2.27.0",
    "@arethetypeswrong/cli": "^0.15.0"
  }
}
```

### Existing Type Dependencies

These `@types/*` packages may be needed:
- `@types/node`
- `@types/pg` (for postgres-replicator)
- AWS SDK v3 (includes types)
- ioredis (includes types)

## Alternatives Considered

### 1. Keep JavaScript + Manual Types
- **Pros**: No migration effort
- **Cons**: Continued maintenance burden, type drift, contributor friction
- **Decision**: Rejected - unsustainable at current scale (1,700 lines manual types)

### 2. JSDoc-Only Types
- **Pros**: Minimal code changes
- **Cons**: Limited type expressiveness, no generics, verbose annotations
- **Decision**: Rejected - doesn't solve core problems

### 3. Big Bang Migration
- **Pros**: Single PR, faster completion
- **Cons**: High risk, blocks other work, difficult reviews
- **Decision**: Rejected - incremental approach safer for 436 files

### 4. Gradual @ts-check + JSDoc
- **Pros**: Can start immediately
- **Cons**: Half-measures, still need manual types, limited IDE support
- **Decision**: Rejected - full TypeScript provides better long-term value

## References

- [TypeScript Migration Guide](https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html)
- [Node.js TypeScript Support](https://nodejs.org/docs/latest/api/typescript.html)
- [Rollup TypeScript Plugin](https://github.com/rollup/plugins/tree/master/packages/typescript)
- Current manual types: `src/s3db.d.ts` (1,704 lines)
- Related spec: Resource class refactor (archived 2025-12-07)
