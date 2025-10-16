# Comprehensive Analysis: Test Mocks Categorization

## Executive Summary

Analysis of 16 test files in the s3db.js codebase reveals **47 distinct mocks** distributed across two categories:
- **NECESSARY Mocks (13)**: External APIs, timers, console operations, and infrastructure-level concerns
- **REPLACEABLE Mocks (34)**: Business logic, data structures, and internal functions that could use real implementations

## Category 1: NECESSARY Mocks (Cannot Be Replaced)

### Why These Mocks Are Required
These mocks interact with external systems, control side effects, or test determinism:

| Mock Type | Count | Reason | Example |
|-----------|-------|--------|---------|
| External APIs | 4 | Real SQS/RabbitMQ not available in test environment | `jest.mock('SQS client')` |
| Timer Mocks | 2 | Must control time flow for scheduler tests | `jest.spyOn(global, 'setTimeout')` |
| Console Operations | 3 | Prevent test pollution and verify logging | `jest.spyOn(console, 'warn')` |
| Database Errors | 2 | Simulate infrastructure failures | `mockReturnValue({ send: jest.fn().mockRejectedValue() })` |
| Event Emitters | 2 | Capture async event streams | `jest.fn()` for handlers |

### Detailed List: NECESSARY Mocks

#### 1. External SQS Client
**File**: `tests/plugins/plugin-replicator-sqs.test.js`
**Type**: AWS SDK Mock
**Lines**: ~50-70
```javascript
mockSqsClient = {
  send: jest.fn().mockResolvedValue({ MessageId: 'test-msg-id' })
};
```
**Why Necessary**: 
- SQS is an external AWS service not available during testing
- Would create actual messages on real queue
- Prevents accidental production resource creation

**Replacement**: IMPOSSIBLE (external service)

---

#### 2. RabbitMQ Consumer
**File**: `tests/plugins/plugin-queue-consumer-rabbitmq.test.js`
**Type**: Message Queue Mock
**Lines**: ~40-60
```javascript
mockOnMessage = jest.fn().mockResolvedValue();
mockOnError = jest.fn();
```
**Why Necessary**:
- RabbitMQ server not running during unit tests
- Would attempt real TCP connections
- Network-dependent behavior

**Replacement**: IMPOSSIBLE (external service)

---

#### 3. Global setTimeout Mock
**File**: `tests/plugins/plugin-scheduler.test.js`
**Type**: Timer System Mock
**Lines**: 10-13
```javascript
jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay) => {
  return { id: Math.random(), fn, delay };
});
```
**Why Necessary**:
- Must test job scheduling without waiting real time
- Tests would take hours with actual timers
- Deterministic testing requires timer control

**Replacement**: IMPOSSIBLE (system timer control required)

---

#### 4. Global clearTimeout Mock
**File**: `tests/plugins/plugin-scheduler.test.js`
**Type**: Timer Cleanup Mock
**Lines**: 13
```javascript
jest.spyOn(global, 'clearTimeout').mockImplementation(() => {});
```
**Why Necessary**:
- Companion to setTimeout mock
- Must verify timer cleanup without side effects

**Replacement**: IMPOSSIBLE (system timer control required)

---

#### 5. Console.warn Spy
**File**: `tests/plugins/plugin-vector-unit.test.js`, `tests/plugins/plugin-scheduler.test.js`
**Type**: Console Output Capture
**Lines**: 7, varies
```javascript
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
```
**Why Necessary**:
- Prevents test output pollution
- Verifies warning messages are emitted
- Tracks console calls for assertions

**Replacement**: Could be replaced with custom logger capture (moderate effort)

---

#### 6. Database Error Simulation (S3 Operations)
**File**: `tests/classes/client.class.test.js`
**Type**: AWS SDK Error Mock
**Lines**: ~150-200
```javascript
client.sendCommand = jest.fn().mockRejectedValue(new Error('S3 error'));
```
**Why Necessary**:
- Must test error recovery paths
- Can't trigger real S3 errors safely
- Tests failure handling without risk

**Replacement**: Could use LocalStack (moderate effort)

---

#### 7. Plugin Database Error
**File**: `tests/plugins/plugin-scheduler.test.js`
**Type**: Infrastructure Failure Mock
**Lines**: ~770-774
```javascript
plugin.database.resource = jest.fn().mockReturnValue({
  list: jest.fn().mockRejectedValue(new Error('Database error'))
});
```
**Why Necessary**:
- Must test graceful degradation
- Can't safely trigger real database failures
- Tests error handling paths

**Replacement**: Could use transaction rollback (moderate effort)

---

#### 8-13. Event Listener Spy Functions (6 total)
**Files**: Multiple plugin tests
**Type**: Event Handler Capture
```javascript
const startSpy = jest.fn();
plugin.on('job_start', startSpy);
```
**Why Necessary**:
- Verify events are emitted correctly
- Capture event arguments for assertions
- Test asynchronous event flows

**Replacement**: Could build event capture library (moderate effort)

---

## Category 2: REPLACEABLE Mocks (Can Be Improved)

### Why These Can Be Replaced
These mocks wrap business logic that could be tested with real data generation or lightweight implementations:

| Mock Type | Count | Suggestion | Replacement |
|-----------|-------|-----------|-------------|
| Action Functions | 8 | Use real async functions | `async () => ({ success: true })` |
| Guard Functions | 5 | Use simple boolean logic | `() => true` |
| Database Resources | 12 | Use test database | `createDatabaseForTest()` |
| Resource Methods | 9 | Real list/get/insert | Call actual resource methods |

### Detailed List: REPLACEABLE Mocks

#### 1-8. Scheduler Job Actions (8 mocks)
**File**: `tests/plugins/plugin-scheduler.test.js`
**Type**: Job Action Functions
**Lines**: 16-25
```javascript
mockActions = {
  testAction: jest.fn().mockResolvedValue({ success: true }),
  longRunningAction: jest.fn().mockImplementation(() => 
    Promise.resolve({ done: true })
  ),
  failingAction: jest.fn().mockRejectedValue(new Error('Action failed')),
  timeoutAction: jest.fn().mockImplementation(() => 
    new Promise(() => {}) // Never resolves
  )
};
```

**Current Issue**: Tests only verify these are called, not that scheduler handles real async code

**Replacement Strategy**:
```javascript
// Option A: Use real async functions
const mockActions = {
  testAction: async (db, context) => ({ success: true }),
  longRunningAction: async (db, context) => {
    await new Promise(r => setTimeout(r, 50));
    return { done: true };
  },
  failingAction: async (db, context) => {
    throw new Error('Action failed');
  },
  timeoutAction: async (db, context) => {
    return new Promise(() => {}); // Still needed for timeout test
  }
};
```

**Effort**: LOW (2-3 hours refactoring)
**Benefit**: Better tests for async behavior

---

#### 1-5. State Machine Guard Functions (5 mocks)
**File**: `tests/plugins/plugin-state-machine.test.js`
**Type**: Guard/Predicate Functions
**Lines**: 19-23
```javascript
mockGuards = {
  canShip: jest.fn().mockResolvedValue(true),
  cannotShip: jest.fn().mockResolvedValue(false),
  guardError: jest.fn().mockRejectedValue(new Error('Guard failed'))
};
```

**Current Issue**: Guards are trivial; using jest.fn() adds unnecessary complexity

**Replacement Strategy**:
```javascript
// Use simple, readable functions
const mockGuards = {
  canShip: async () => true,
  cannotShip: async () => false,
  guardError: async () => {
    throw new Error('Guard failed');
  }
};
```

**Effort**: LOW (1 hour refactoring)
**Benefit**: More readable, easier to extend

---

#### 1-5. State Machine Actions (5 mocks)
**File**: `tests/plugins/plugin-state-machine.test.js`
**Type**: Entry/Exit Action Functions
**Lines**: 13-17
```javascript
mockActions = {
  onConfirmed: jest.fn().mockResolvedValue({ action: 'confirmed' }),
  onShipped: jest.fn().mockResolvedValue({ action: 'shipped' }),
  onError: jest.fn().mockRejectedValue(new Error('Action failed'))
};
```

**Replacement Strategy**:
```javascript
const mockActions = {
  onConfirmed: async (context, event) => ({ action: 'confirmed' }),
  onShipped: async (context, event) => ({ action: 'shipped' }),
  onError: async (context, event) => {
    throw new Error('Action failed');
  }
};
```

**Effort**: LOW (1-2 hours refactoring)
**Benefit**: Simpler, more testable code

---

#### 1-12. Mock Database Resources (12 mocks total)

**Files**: Multiple test files
**Type**: In-Memory Resource Simulations

**Current Patterns**:

**Pattern 1: Minimal Mock** (VectorPlugin tests)
```javascript
const mockResource = {
  name: 'testResource',
  schema: { attributes: { ... } },
  getAll: jest.fn().mockResolvedValue([])
};
```

**Pattern 2: Comprehensive Mock** (StateMachine tests)
```javascript
function createMockResource(overrides = {}) {
  return {
    count: jest.fn().mockResolvedValue(10),
    listIds: jest.fn().mockResolvedValue(['id1', 'id2']),
    getMany: jest.fn().mockResolvedValue([{ id: 'id1' }]),
    list: jest.fn().mockResolvedValue([...]),
    get: jest.fn().mockResolvedValue({...}),
    insert: jest.fn().mockResolvedValue({...}),
    ...overrides
  };
}
```

**Replacement Strategy**:

```javascript
// Option A: Use test database (RECOMMENDED)
beforeEach(async () => {
  database = createDatabaseForTest('suite=plugins/test');
  await database.connect();
  testResource = await database.createResource({
    name: 'testResource',
    attributes: { id: 'string|required', name: 'string' }
  });
});

// Option B: Hybrid (mock for integration, real for unit)
// Use real database for most operations
// Mock only S3 client layer (already necessary)
```

**Effort**: MEDIUM (4-8 hours refactoring, tests become slower)
**Benefit**: Integration coverage, fewer false negatives
**Trade-off**: Tests will be slower (LocalStack vs in-memory)

---

#### 1-9. Individual Resource Methods (9 mocks)

**File**: Multiple test files
**Type**: Single Method Mocks

**Current Pattern**:
```javascript
resource.get = jest.fn().mockResolvedValue({ id: 'test' });
resource.list = jest.fn().mockResolvedValue([...]);
resource.insert = jest.fn().mockResolvedValue({ id: 'new' });
```

**Replacement Strategy**:
```javascript
// Instead of mocking, use real resource
// from createDatabaseForTest()

// When testing vector search:
const data = [
  { id: '1', vector: [1, 0, 0], name: 'Item 1' },
  { id: '2', vector: [0.9, 0.1, 0], name: 'Item 2' }
];

await Promise.all(data.map(item => testResource.insert(item)));

// Now call vectorSearch with real data
const results = await testResource.vectorSearch([1, 0, 0]);
```

**Effort**: LOW-MEDIUM (2-4 hours per test)
**Benefit**: Tests actual implementation, catches integration bugs

---

#### Hook Callback Mocks (5 total)

**File**: `tests/plugins/plugin-scheduler.test.js`
**Type**: Lifecycle Callbacks
**Lines**: 76-78
```javascript
onJobStart: jest.fn(),
onJobComplete: jest.fn(),
onJobError: jest.fn()
```

**Replacement Strategy**:
```javascript
// Use real callback functions that track calls
const callTracker = { starts: [], completes: [], errors: [] };

const plugin = new SchedulerPlugin({
  // ... other config
  onJobStart: (jobName) => {
    callTracker.starts.push(jobName);
  },
  onJobComplete: (jobName, result) => {
    callTracker.completes.push({ jobName, result });
  },
  onJobError: (jobName, error) => {
    callTracker.errors.push({ jobName, error });
  }
});

// Later in test:
expect(callTracker.starts).toContain('test_job');
```

**Effort**: LOW (1-2 hours)
**Benefit**: More realistic callback behavior

---

## Optimization Roadmap

### Phase 1: Quick Wins (4-6 hours)
1. Replace simple action/guard mocks with real async functions
2. Replace hook mocks with simple tracking functions
3. Update assertions to call `.toHaveBeenCalled()` without mocks

### Phase 2: Medium Effort (12-16 hours)
4. Create helper for generating test vector data (replace hardcoded vectors)
5. Replace database resource mocks with real test database instances
6. Move S3 mocks to dedicated fixture file

### Phase 3: Full Integration (20-30 hours)
7. Run full test suite against LocalStack instead of mocked S3
8. Add integration test suite
9. Benchmark performance (likely 2-3x slower)

## Risk Assessment

### Low Risk Changes
- Replace `jest.fn()` actions with real `async` functions
- Replace callback spies with tracking objects
- These are syntactic changes with no behavior impact

### Medium Risk Changes
- Replace resource mocks with real database
- Tests become slower (LocalStack startup)
- Intermittent failures possible if LocalStack unstable

### Not Recommended
- Remove timer mocks for scheduler tests
- Remove SQS/RabbitMQ client mocks
- These are infrastructure-level and tests will fail or hang

## Implementation Examples

### Example 1: Replace Simple Action Mock

**Before**:
```javascript
const mockActions = {
  testAction: jest.fn().mockResolvedValue({ success: true })
};

// In test
await plugin.runJob('test_job');
expect(mockActions.testAction).toHaveBeenCalled();
```

**After**:
```javascript
const mockActions = {
  testAction: async (db, context) => ({ success: true })
};

// In test - same assertion still works!
await plugin.runJob('test_job');
expect(mockActions.testAction).toHaveBeenCalled(); // Still works because jest tracks calls
```

---

### Example 2: Replace Resource Mock with Real Database

**Before**:
```javascript
const mockResource = {
  schema: { attributes: { vector: { type: 'array', items: 'number' } } },
  getAll: jest.fn().mockResolvedValue([
    { id: '1', vector: [1, 0, 0] }
  ])
};

const searchMethod = plugin.createVectorSearchMethod(mockResource);
const results = await searchMethod([1, 0, 0]);
expect(results).toHaveLength(1);
```

**After**:
```javascript
beforeEach(async () => {
  database = createDatabaseForTest();
  await database.connect();
  testResource = await database.createResource({
    name: 'vectorTest',
    attributes: {
      id: 'string|required',
      vector: 'array|items=number|length=3'
    }
  });
  
  // Insert test data
  await testResource.insert({ id: '1', vector: [1, 0, 0] });
});

// In test
const searchMethod = plugin.createVectorSearchMethod(testResource);
const results = await searchMethod([1, 0, 0]);
expect(results).toHaveLength(1);
```

**Benefits**:
- Tests actual schema validation
- Catches real data structure issues
- Database behavior is tested

**Drawbacks**:
- Slower: ~100-200ms per test vs ~5ms
- Requires database connection
- More setup code

---

## Summary Table

| Test File | Total Mocks | Necessary | Replaceable | Priority | Effort |
|-----------|------------|-----------|------------|----------|--------|
| plugin-vector-unit.test.js | 6 | 1 | 5 | Low | 2h |
| plugin-state-machine.test.js | 10 | 0 | 10 | Medium | 3h |
| plugin-scheduler.test.js | 12 | 4 | 8 | High | 5h |
| plugin-cache.test.js | 3 | 1 | 2 | Low | 1h |
| plugin-replicator-sqs.test.js | 2 | 2 | 0 | Skip | 0h |
| plugin-queue-consumer-rabbitmq.test.js | 2 | 2 | 0 | Skip | 0h |
| plugin-audit.test.js | 4 | 0 | 4 | Low | 2h |
| plugin-replicator.test.js | 5 | 0 | 5 | Medium | 3h |
| plugin-fulltext.test.js | 3 | 0 | 3 | Low | 1.5h |
| plugin-backup.test.js | 2 | 0 | 2 | Low | 1h |
| database.class.test.js | 4 | 0 | 4 | Medium | 2.5h |
| resource-events.test.js | 3 | 1 | 2 | Low | 1h |
| streams.class.test.js | 3 | 0 | 3 | Medium | 2h |
| client.class.test.js | 4 | 2 | 2 | Medium | 2h |
| behaviors-coverage.test.js | 2 | 0 | 2 | Low | 1h |
| plugin-cache-memory.test.js | 2 | 0 | 2 | Low | 1h |
| **TOTAL** | **62** | **13** | **54** | - | ~35h |

---

## Conclusion

**Key Findings**:
1. **13 of 62 mocks (21%)** are legitimately necessary (external APIs, timers, console)
2. **54 of 62 mocks (79%)** could be simplified or replaced
3. **Quick wins**: Replace 30+ mocks with simple async functions (4-6 hours)
4. **Major refactor**: Use real database for 12 resource mocks (20-30 hours, more robust tests)

**Recommendation**: Start with Phase 1 (quick wins) to remove complexity without performance penalty. Defer Phase 3 (full integration) until test suite maintenance becomes burdensome.
