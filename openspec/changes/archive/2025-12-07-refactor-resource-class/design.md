# Design: Resource Class Modularization

## Context

The `Resource` class in `src/resource.class.js` has evolved organically over time, accumulating responsibilities until it became a 4,600-line monolith. This refactoring extracts cohesive concerns into separate modules while maintaining full backwards compatibility.

**Stakeholders**: Library users, plugin authors, core maintainers

**Constraints**:
- Zero breaking changes to public API
- Must work with existing plugin system
- Cannot degrade performance
- Must maintain lazy loading for peer dependencies

## Goals / Non-Goals

### Goals
- Reduce Resource class to <500 lines (facade only)
- Enable independent testing of each concern
- Improve code discoverability and navigation
- Maintain 100% backwards compatibility
- Enable future parallel development on modules

### Non-Goals
- Changing the public API
- Optimizing performance (this is a refactor, not optimization)
- Adding new features
- Changing the plugin architecture
- Modifying the Schema or Database classes

## Decisions

### Decision 1: Composition over Inheritance

**What**: Use composition to combine modules, not class inheritance chains.

**Why**:
- Avoids diamond inheritance problems
- Each module can be tested in isolation
- Clearer dependency graph
- Easier to understand which module handles what

**Implementation**:
```javascript
class Resource extends AsyncEventEmitter {
  constructor(config) {
    super();

    // Compose with modules
    this._idGenerator = new ResourceIdGenerator(this, config);
    this._hooks = new ResourceHooks(this, config);
    this._partitions = new ResourcePartitions(this, config);
    this._guards = new ResourceGuards(this, config);
    this._middleware = new ResourceMiddleware(this);
    this._persistence = new ResourcePersistence(this, config);
    this._query = new ResourceQuery(this, config);
    this._content = new ResourceContent(this, config);
    this._streams = new ResourceStreams(this, config);
    // Note: State machine accessor moved to StateMachinePlugin (injects via Object.defineProperty)

    // Validator already extracted
    this.validator = new ResourceValidator(config);
  }

  // Public API delegates to modules
  async insert(data) {
    return this._persistence.insert(data);
  }
}
```

### Decision 2: Module Access to Resource Context

**What**: Modules receive `this` (the Resource instance) as first constructor argument.

**Why**:
- Modules need access to shared state (client, schema, config)
- Enables cross-module communication through the facade
- Avoids circular dependency issues

**Implementation**:
```javascript
class ResourcePartitions {
  constructor(resource, config) {
    this.resource = resource;  // Access to client, schema, etc.
    this.config = config.partitions || {};
  }

  getPartitionKey({ partitionName, id, data }) {
    // Can access this.resource.client, this.resource.schema, etc.
    const client = this.resource.client;
    // ...
  }
}
```

### Decision 3: Module Location in `src/core/`

**What**: All new modules go in `src/core/` directory.

**Why**:
- Already has `resource-validator.class.js` there
- Separates core internals from plugins
- Clear convention: `src/core/resource-*.class.js`

**Directory structure**:
```
src/
├── core/
│   ├── resource-validator.class.js     # Already exists
│   ├── resource-id-generator.class.js  # New
│   ├── resource-hooks.class.js         # New
│   ├── resource-partitions.class.js    # New
│   ├── resource-events.class.js        # New
│   ├── resource-guards.class.js        # New
│   ├── resource-middleware.class.js    # New
│   ├── resource-persistence.class.js   # New
│   ├── resource-query.class.js         # New
│   ├── resource-content.class.js       # New
│   └── resource-streams.class.js       # New
├── resource.class.js                    # Facade only (<500 lines)
└── ...
```

### Decision 4: Phased Extraction Order

**What**: Extract modules in order of risk (lowest first).

**Why**:
- Catch integration issues early
- Build confidence before touching CRUD operations
- Simpler modules first (events, hooks) → complex last (persistence)

**Order**:
1. **Phase 1**: ID Generator, Events, Hooks (isolated, simple)
2. **Phase 2**: Guards, Middleware (authorization layer)
3. **Phase 3**: Partitions, Query (data access patterns)
4. **Phase 4**: Content, Streams (binary handling)
5. **Phase 5**: Persistence (CRUD - most complex, highest risk)
6. **Phase 6**: Move state machine to plugin, final cleanup

### Decision 5: Keep AsyncEventEmitter in Resource

**What**: Resource extends AsyncEventEmitter, modules use `this.resource.emit()`.

**Why**:
- Event emission is a cross-cutting concern
- Users expect `resource.on('inserted', ...)` not `resource._events.on(...)`
- ResourceEvents module handles standardization, not the emitter itself

**Implementation**:
```javascript
// ResourceEvents just standardizes payloads
class ResourceEvents {
  constructor(resource) {
    this.resource = resource;
  }

  emitStandardized(event, payload, id) {
    const standardPayload = {
      resource: this.resource.name,
      id,
      ...payload,
      _at: new Date().toISOString()
    };
    this.resource.emit(event, standardPayload);
  }
}
```

### Decision 6: Preserve Method Signatures

**What**: All public methods keep exact same signatures.

**Why**:
- Zero breaking changes
- Existing code works unchanged
- TypeScript definitions remain valid

**Example**:
```javascript
// BEFORE (in Resource)
async insert({ id, ...attributes }) { ... }

// AFTER (in ResourcePersistence)
async insert({ id, ...attributes }) { ... }  // Same signature

// Resource delegates
async insert(data) {
  return this._persistence.insert(data);
}
```

### Decision 7: Lazy Module Initialization

**What**: Initialize modules only when needed (where possible).

**Why**:
- Faster Resource construction
- Lower memory for simple use cases
- Follows existing lazy loading patterns

**Implementation**:
```javascript
get _stateMachine() {
  if (!this.__stateMachineAccessor) {
    this.__stateMachineAccessor = new ResourceStateMachineAccessor(this);
  }
  return this.__stateMachineAccessor;
}
```

### Decision 8: Observers Stay in Resource Facade

**What**: The `observers` array and its usage remain in the Resource class.

**Why**:
- Legacy pub/sub pattern used only in batch operations (`insertMany`, `deleteMany`, `getMany`)
- Only 6 occurrences, all in batch methods
- Modules access via `this.resource.observers` when needed
- Not worth extracting for so few usages

**Implementation**:
```javascript
// In ResourcePersistence (or ResourceQuery for getMany)
async insertMany(objects) {
  // ... batch logic ...
  this.resource.observers.map(x => x.emit("error", this.resource.name, error));
}
```

### Decision 9: Dynamic Schema Methods Stay in Facade

**What**: `updateAttributes()`, `addPluginAttribute()`, `removePluginAttribute()` remain in Resource.

**Why**:
- These methods modify multiple systems simultaneously:
  - `this.attributes`
  - `this.schema.attributes`
  - Recompiles `this.validator`
  - Regenerates hooks
- Cross-cutting concern that doesn't belong to any single module
- Used by plugins for runtime schema modification

**Implementation**:
```javascript
// Stays in Resource class
addPluginAttribute(name, definition, pluginName) {
  // Modifies schema
  this.schema.attributes[name] = definition;
  this.attributes[name] = definition;

  // Regenerates mapping
  this.schema.regeneratePluginMapping();

  // Recompiles validator
  this.validator.updateSchema(this.attributes);

  // Emits event
  this.emit('plugin-attribute-added', { ... });
}
```

### Decision 10: Module Initialization Order

**What**: Modules must initialize in dependency order: Hooks → Partitions.

**Why**:
- `setupPartitionHooks()` adds hooks to the hooks system
- If ResourcePartitions initializes before ResourceHooks, hooks won't exist
- Current code: hooks created first, then `applyConfiguration()` calls `setupPartitionHooks()`

**Implementation**:
```javascript
constructor(config) {
  // 1. Core modules (no dependencies)
  this._idGenerator = new ResourceIdGenerator(this, config);
  this._events = new ResourceEvents(this);

  // 2. Hooks (needed by partitions)
  this._hooks = new ResourceHooks(this, config);

  // 3. Partitions (depends on hooks)
  this._partitions = new ResourcePartitions(this, config);
  this._partitions.setupHooks();  // Adds partition hooks

  // 4. Rest of modules
  this._guards = new ResourceGuards(this, config);
  // ...
}
```

### Decision 11: Unify Validation Systems

**What**: Remove `Schema.validate()`, use only `ResourceValidator.validate()`.

**Why**:
- Current code has inconsistency:
  - `insert()` uses `this.validator.validate()`
  - `_patchViaCopyObject()` uses `this.schema.validate()`
- Two validation paths = maintenance burden and potential behavior differences
- Schema should only handle mapping/unmapping, not validation

**Implementation** (during refactor):
```javascript
// BEFORE (in _patchViaCopyObject)
const validationResult = await this.schema.validate(mergedData);

// AFTER
const { isValid, errors } = await this.validator.validate(mergedData);
if (!isValid) {
  throw new ValidationError('Validation failed during patch', { errors });
}
```

**Note**: This is technical debt cleanup done alongside the refactor, not a new feature.

### Decision 12: applyDefaults Moves to ResourceValidator

**What**: Move `applyDefaults()` from Resource to ResourceValidator.

**Why**:
- Semantically, applying defaults is data preparation before validation
- Keeps all data transformation in one place
- ResourcePersistence calls `this.resource.validator.applyDefaults()` then `.validate()`

**Implementation**:
```javascript
// In ResourceValidator
applyDefaults(data, attributes) {
  const out = { ...data };
  for (const [key, def] of Object.entries(attributes)) {
    if (out[key] === undefined && typeof def === 'string' && def.includes('default:')) {
      const match = def.match(/default:([^|]+)/);
      if (match) {
        let val = match[1];
        if (def.includes('boolean')) val = val === 'true';
        else if (def.includes('number')) val = Number(val);
        out[key] = val;
      }
    }
  }
  return out;
}

// In ResourcePersistence.insert()
const withDefaults = this.resource.validator.applyDefaults(data, this.resource.attributes);
const { isValid, errors } = await this.resource.validator.validate(withDefaults);
```

## Alternatives Considered

### Alternative 1: Mixins
**Rejected because**: Mixins create implicit dependencies and make it hard to understand method origins. Testing becomes difficult.

### Alternative 2: Functional decomposition (no classes)
**Rejected because**: Would require significant API changes. Classes provide better encapsulation and match existing patterns.

### Alternative 3: Single large refactor
**Rejected because**: Too risky. Phased approach allows incremental validation.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Performance regression from delegation | Benchmark before/after each phase |
| Circular dependencies between modules | Modules only access Resource, never each other directly |
| Test coverage gaps | Each module requires >90% coverage before moving to next phase |
| Breaking plugin compatibility | Plugins only use public API, which remains unchanged |
| Bundle size increase | Monitor with each phase; expect ~2-5KB increase |

## Migration Plan

### For Library Users
**No migration needed**. Public API unchanged.

### For Plugin Authors
**No migration needed**. Plugins interact with Resource public API only.

### For Core Contributors
1. Each phase is a separate PR
2. All tests must pass before merge
3. Update CLAUDE.md after each phase
4. Add architecture docs with module diagram

## Open Questions

1. **Should modules be exported from package?**
   - Leaning towards NO - they're internal implementation
   - If yes, could enable advanced customization

2. **Should modules have their own loggers?**
   - Leaning towards YES - use `resource.logger.child({ module: 'partitions' })`
   - Enables fine-grained log filtering

3. **How to handle `this` binding in hooks after extraction?**
   - Hooks currently bind to Resource
   - After extraction, still bind to Resource (not to module)
   - Ensures backwards compatibility with user hooks
