# Quick Reference: Test Mocks Analysis

## Key Statistics
- **Total Mocks Analyzed**: 62 across 16 test files
- **Necessary Mocks**: 13 (21%) - Cannot be replaced
- **Replaceable Mocks**: 54 (79%) - Can be improved
- **Estimated Refactor Time**: ~35 hours total

## Necessary Mocks (Keep These)

1. **SQS Client Mock** - plugin-replicator-sqs.test.js
2. **RabbitMQ Consumer Mock** - plugin-queue-consumer-rabbitmq.test.js
3. **setTimeout/clearTimeout Spies** - plugin-scheduler.test.js
4. **Console.warn Spy** - plugin-vector-unit.test.js, plugin-scheduler.test.js
5. **S3 Error Simulation** - client.class.test.js
6. **Database Error Simulation** - plugin-scheduler.test.js
7. **Event Handler Spies** (6 instances) - Multiple files

## Replaceable Mocks (Priority List)

### HIGH Priority (Quick Wins)
- **Scheduler Job Actions** (8 mocks): Replace `jest.fn().mockResolvedValue()` with real `async` functions
- **State Machine Guards** (5 mocks): Replace with simple `async () => true/false`
- **State Machine Actions** (5 mocks): Replace with real async functions

### MEDIUM Priority
- **Hook Callbacks** (5 mocks): Replace with tracking objects
- **Resource Mocks** (12 instances): Consider using test database

### LOW Priority (Only if time permits)
- **Cache plugin mocks**: 2 instances
- **Audit plugin mocks**: 4 instances
- **Stream mocks**: 3 instances

## Quick Implementation Steps

### Step 1: Replace Scheduler Actions (30 min)
```javascript
// Before
testAction: jest.fn().mockResolvedValue({ success: true })

// After
testAction: async (db, context) => ({ success: true })
```

### Step 2: Replace State Machine Guards (20 min)
```javascript
// Before
canShip: jest.fn().mockResolvedValue(true)

// After
canShip: async () => true
```

### Step 3: Replace Callbacks (20 min)
```javascript
// Before
onJobStart: jest.fn()

// After
const tracker = { called: [] };
onJobStart: (name) => tracker.called.push(name)
```

**Total Quick Win Time**: ~1 hour
**No Performance Penalty**: Tests stay fast

## Files Most Impacted (by replaceable mocks)

1. plugin-scheduler.test.js - 8 replaceable mocks
2. plugin-state-machine.test.js - 10 replaceable mocks
3. plugin-vector-unit.test.js - 5 replaceable mocks
4. database.class.test.js - 4 replaceable mocks
5. resource-events.test.js - 2 replaceable mocks

## Files That Can't Be Improved

1. plugin-replicator-sqs.test.js - All necessary (SQS external service)
2. plugin-queue-consumer-rabbitmq.test.js - All necessary (RabbitMQ external service)

## Resources
- Full detailed report: `/home/ff/work/martech/s3db.js/MOCKS_ANALYSIS_REPORT.md`
- Examples and code snippets available in full report

## Recommendation
Start with Phase 1 (Quick Wins) first. These changes have:
- **No performance impact** (tests stay fast)
- **Low risk** (just syntactic changes)
- **High reward** (cleaner, more readable tests)
