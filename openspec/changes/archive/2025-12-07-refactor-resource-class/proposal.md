# Change: Refactor Resource Class into Modular Components

## Why

The `Resource` class has grown to **~4,600 lines** with **12+ distinct responsibilities** mixed together:
- CRUD operations (insert, get, update, patch, replace, delete)
- Validation (delegated to ResourceValidator, but still intertwined)
- Hooks system (before/after for all operations)
- Partition management (indexing, references, queries)
- Event emission (AsyncEventEmitter)
- Guards system (RBAC authorization)
- Middleware system (method wrapping)
- State machine integration
- Binary content handling
- Streaming (readable/writable)
- ID generation (sync, async, incremental)
- Query/list operations

This monolithic structure causes:
1. **Cognitive overload** - Impossible to understand the full class at once
2. **Testing difficulty** - Can't unit test individual concerns
3. **Change risk** - Modifications can break unrelated features
4. **Performance debugging** - Hard to profile specific operations
5. **Onboarding friction** - New contributors struggle to find relevant code

## What Changes

Extract responsibilities into focused, composable classes:

| New Class | Responsibility | ~Lines |
|-----------|---------------|--------|
| `ResourcePersistence` | CRUD operations (insert, get, update, patch, replace, delete) | ~800 |
| `ResourceHooks` | Hook registration, execution, binding | ~150 |
| `ResourcePartitions` | Partition key generation, references, queries | ~400 |
| `ResourceEvents` | Event emission, standardized payloads | ~100 |
| `ResourceGuards` | Guard normalization, execution, RBAC checks | ~100 |
| `ResourceMiddleware` | Middleware registration, dispatch chain | ~100 |
| `ResourceContent` | Binary content (setContent, content, deleteContent) | ~100 |
| `ResourceStreams` | readable(), writable() stream factories | ~50 |
| `ResourceIdGenerator` | ID generation strategies (sync, async, incremental) | ~100 |
| `ResourceQuery` | query(), list(), count(), page(), getMany() | ~300 |

The `Resource` class becomes a **facade** that:
1. Instantiates and wires internal modules
2. Exposes the public API (delegating to modules)
3. Maintains backwards compatibility
4. Keeps cross-cutting concerns that affect multiple modules

**Stays in Resource facade** (not extracted):
- `observers` - Legacy pub/sub pattern used by batch operations
- `updateAttributes()`, `addPluginAttribute()`, `removePluginAttribute()` - Dynamic schema modification affects Schema + Validator + Hooks
- `applyDefaults()` - Will be delegated to ResourceValidator (data preparation)
- State machine accessor - Moved to StateMachinePlugin

**Technical debt addressed**:
- Unify `Schema.validate()` and `ResourceValidator.validate()` (currently inconsistent)

**BREAKING**: None. Public API remains identical.

**Plugin changes**: StateMachinePlugin will inject `resource.state` accessor via `Object.defineProperty` instead of relying on Resource internal code. This is a plugin-internal change with no user-facing impact.

## Impact

- **Affected specs**: `resource` (new capability)
- **Affected code**:
  - `src/resource.class.js` → Split into modules
  - `src/core/` → New module classes
  - Tests → Update imports, add per-module tests
- **Performance**: Negligible (same code, different organization)
- **Bundle size**: Slight increase (~2-5KB) due to class overhead

## Success Criteria

1. All 150+ existing Resource tests pass unchanged
2. Resource public API remains 100% compatible
3. Each new module has >90% test coverage
4. Resource class reduced to <500 lines (facade only)
5. No performance regression in benchmarks
