# EventualConsistencyPlugin - Consistency Guarantees 💯

## 🎯 How to Ensure Consistency ALWAYS

The s3db.js EventualConsistencyPlugin was designed with multiple protection layers to guarantee **strong eventual consistency**. This document explains all mechanisms and best practices.

---

## 📋 Table of Contents

1. [Fundamental Guarantees](#fundamental-guarantees)
2. [Protection Mechanisms](#protection-mechanisms)
3. [Best Practices](#best-practices)
4. [Critical Configurations](#critical-configurations)
5. [Monitoring and Debugging](#monitoring-and-debugging)
6. [Failure and Recovery Scenarios](#failure-and-recovery-scenarios)
7. [Production Checklist](#production-checklist)

---

## 🛡️ Fundamental Guarantees

### 1. **Transaction Atomicity**
Each operation generates an atomic transaction that is:
- ✅ **Durable**: Persisted to S3 immediately
- ✅ **Ordered**: Precise timestamp (milliseconds)
- ✅ **Traceable**: Unique ID + complete metadata
- ✅ **Immutable**: Never modified, only applied

### 2. **Guaranteed Idempotency**
- Transactions have unique IDs
- Consolidation automatically detects duplicates
- Applying the same transaction multiple times = same result

### 3. **Eventual Consistency with Configurable Timing**
- **Default**: 30 seconds
- **Production recommended**: 5-10 seconds
- **High performance**: 1-2 seconds (requires more resources)

### 4. **Race Condition Protection**
- Distributed lock system
- Consolidation per record ID (one at a time)
- Automatic cleanup of orphaned locks

---

## 🔒 Protection Mechanisms

### 1. Distributed Locking System

```javascript
// File: src/plugins/eventual-consistency/locks.js

// Each record is consolidated with exclusive lock
const lockId = `${config.resource}-${config.field}-${recordId}`;

// Automatic timeout prevents deadlocks
lockTimeout: 300 // 5 minutes (default)

// Orphaned lock cleanup
cleanupStaleLocks() // Runs periodically
```

**How it works:**
1. Before consolidating, attempts to acquire lock via `insert(lockId)`
2. If lock exists, another worker is processing → skip
3. After consolidation, lock is removed
4. If worker crashes, lock automatically expires after `lockTimeout`

**Recommended configuration:**
```javascript
{
  lockTimeout: 300, // 5 minutes for normal operations
  // For very heavy operations:
  lockTimeout: 900  // 15 minutes
}
```

### 2. Partition-Based Isolation

```javascript
// Transactions are partitioned by hour
partition: `cohortHour=${cohortHour}`

// Consolidation processes only last N hours
hoursToCheck: config.consolidationWindow || 24
```

**Benefits:**
- ✅ O(1) queries instead of O(n)
- ✅ Temporal isolation (old transactions don't interfere)
- ✅ Efficient garbage collection

### 3. Transaction Ordering

```javascript
// Transactions are always ordered by timestamp
transactions.sort((a, b) => a.timestamp - b.timestamp);

// Applied sequentially
for (const tx of transactions) {
  await applyTransaction(tx);
}
```

**Guarantee:** Even with race conditions, temporal order is preserved.

### 4. Retry with Exponential Backoff

```javascript
// In consolidation.js
const MAX_RETRIES = 3;
const BACKOFF_MS = 1000;

for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  try {
    await consolidateRecord(recordId);
    break;
  } catch (error) {
    if (attempt < MAX_RETRIES - 1) {
      await sleep(BACKOFF_MS * Math.pow(2, attempt));
    }
  }
}
```

**Protects against:**
- Temporary network failures
- S3 rate limiting
- Resource contention

---

## 🎯 Best Practices

### 1. **Production Configuration**

```javascript
const db = new Database({ /* ... */ });

await db.registerPlugin(new EventualConsistencyPlugin({
  resource: 'users',
  field: 'balance',

  // ✅ CRITICAL: Production configurations
  consolidationInterval: 5,      // 5 seconds (not 30!)
  consolidationWindow: 48,        // 48 hours of history
  lockTimeout: 300,               // 5 minutes
  maxRetries: 5,                  // More retries in prod

  // ✅ RECOMMENDED: Monitoring
  verbose: false,                 // false in prod (use external logs)
  enableMetrics: true,            // collect metrics

  // ✅ PERFORMANCE: Batch processing
  batchSize: 100,                 // process 100 records at a time
  concurrency: 10,                // 10 records in parallel

  // ✅ CLEANUP: Garbage collection
  retentionDays: 30,              // keep transactions for 30 days
  cleanupInterval: 3600,          // cleanup every hour
}));
```

### 2. **Robust Field Handlers**

```javascript
const fieldHandlers = {
  balance: {
    // ✅ ALWAYS return number (never undefined/null)
    get: (record) => record?.balance ?? 0,

    // ✅ ALWAYS validate input
    set: (record, value) => {
      const numValue = Number(value);
      if (!isFinite(numValue)) {
        throw new Error(`Invalid balance value: ${value}`);
      }
      record.balance = Math.max(0, numValue); // never negative
    },

    // ✅ ALWAYS return number as default
    default: () => 0,

    // ✅ OPERATIONS must be pure (no side effects)
    increment: (current, delta) => {
      const result = (current ?? 0) + (delta ?? 0);
      return Math.max(0, result); // never negative
    },

    decrement: (current, delta) => {
      const result = (current ?? 0) - (delta ?? 0);
      return Math.max(0, result); // never negative
    }
  }
};
```

**Golden Rules:**
1. **Always return a value** (never undefined/null)
2. **Validate all inputs** (type checking + range checking)
3. **Operations must be pure** (same input = same output)
4. **Use safe default values** (0 for numbers, [] for arrays)

### 3. **Safe Transactions**

```javascript
// ✅ GOOD: Atomic operations
await resource.update(userId, {
  balance: { $increment: 100 }  // EventualConsistency processes
});

// ✅ GOOD: Multiple fields
await resource.update(userId, {
  balance: { $increment: 100 },
  points: { $increment: 10 }
});

// ❌ BAD: Modify directly without plugin
const user = await resource.get(userId);
user.balance += 100;  // RACE CONDITION!
await resource.update(userId, user);

// ❌ BAD: Manual read-modify-write
const user = await resource.get(userId);
const newBalance = user.balance + 100;
await resource.update(userId, { balance: newBalance });  // RACE!
```

### 4. **Forced Consolidation (when necessary)**

```javascript
// Force immediate consolidation of a record
await plugin.consolidateRecord('user-123');

// Force consolidation of all pending
await plugin.runConsolidationNow();

// ⚠️ Use sparingly! Automatic consolidation is more efficient
```

**When to use:**
- Before critical operations (payments, transfers)
- In tests (ensure consistent state)
- Debugging consistency issues
- Migrations or maintenance

---

## ⚙️ Critical Configurations

### Configuration Table by Environment

| Config | Dev | Staging | Production | High-Volume |
|--------|-----|---------|----------|-------------|
| `consolidationInterval` | 30s | 10s | 5s | 2s |
| `consolidationWindow` | 24h | 48h | 48h | 72h |
| `lockTimeout` | 300s | 300s | 300s | 600s |
| `maxRetries` | 3 | 5 | 5 | 10 |
| `batchSize` | 50 | 100 | 100 | 200 |
| `concurrency` | 5 | 10 | 10 | 20 |
| `retentionDays` | 7 | 30 | 90 | 365 |
| `cleanupInterval` | 7200s | 3600s | 3600s | 1800s |
| `verbose` | true | false | false | false |

### Resource Calculation

**Formula to estimate load:**
```javascript
// Transactions per second
const txPerSecond = writesPerSecond * fieldsWithEC;

// Records consolidated per interval
const recordsPerCycle = txPerSecond * consolidationInterval;

// Required throughput
const throughput = recordsPerCycle / consolidationInterval;

// Example: 1000 writes/s, 2 fields EC, 5s interval
// = 2000 tx/s * 5s = 10,000 records per cycle
// = 10,000 / 5 = 2,000 records/s throughput needed
```

**Recommended resources:**
- **CPU**: 2 cores per 10,000 tx/s
- **Memory**: 512MB per 100,000 records in cache
- **S3 Ops**: ~3-5 ops per consolidation (query + update + cleanup)

---

## 📊 Monitoring and Debugging

### 1. Essential Metrics

```javascript
// Collect metrics via plugin
const metrics = await plugin.getMetrics();

console.log({
  pendingTransactions: metrics.pending,
  consolidatedLast24h: metrics.consolidated,
  averageLatency: metrics.avgLatency,
  failureRate: metrics.failures / metrics.total,

  // ⚠️ ALERTS if:
  pendingTooHigh: metrics.pending > 10000,
  latencyTooHigh: metrics.avgLatency > 60000, // > 1 min
  failureRateTooHigh: (metrics.failures / metrics.total) > 0.01 // > 1%
});
```

### 2. Consistency Debugging

```javascript
// Check record state
const debug = await plugin.debugRecord('user-123');

console.log({
  currentValue: debug.value,
  pendingTransactions: debug.pending,
  lastConsolidation: debug.lastConsolidated,
  locks: debug.locks,

  // Detect issues
  isStale: debug.pending.length > 100,
  isLocked: debug.locks.length > 0,
  needsConsolidation: Date.now() - debug.lastConsolidated > 60000
});

// If issue found, force consolidation
if (debug.pending.length > 0) {
  await plugin.consolidateRecord('user-123');
}
```

### 3. Structured Logs

```javascript
// Enable verbose in dev
verbose: true

// In production, use external log system
const winston = require('winston');

await db.registerPlugin(new EventualConsistencyPlugin({
  // ... config
  onTransaction: (tx) => {
    winston.info('EC:Transaction', {
      recordId: tx.recordId,
      field: tx.field,
      operation: tx.operation,
      value: tx.value,
      timestamp: tx.timestamp
    });
  },

  onConsolidation: (recordId, result) => {
    winston.info('EC:Consolidation', {
      recordId,
      transactionsApplied: result.count,
      duration: result.duration,
      finalValue: result.value
    });
  },

  onError: (error, context) => {
    winston.error('EC:Error', {
      error: error.message,
      recordId: context.recordId,
      operation: context.operation,
      stack: error.stack
    });
  }
}));
```

---

## 🚨 Failure and Recovery Scenarios

### Scenario 1: Worker Crash During Consolidation

**Problem:**
Worker acquires lock → crashes before completing → lock becomes orphaned

**Protection:**
```javascript
// lockTimeout ensures lock expires
lockTimeout: 300 // 5 minutes

// Automatic orphaned lock cleanup
cleanupInterval: 3600 // every hour
```

**Recovery:**
- Wait `lockTimeout` seconds
- Next worker will automatically pick up the record
- Transactions are not lost (persisted in S3)

### Scenario 2: S3 Rate Limiting

**Problem:**
Many simultaneous operations → S3 returns 503 SlowDown

**Protection:**
```javascript
maxRetries: 5,
retryBackoff: 'exponential',
concurrency: 10 // limits parallel operations
```

**Recovery:**
- Automatic retry with backoff
- If fails after 5 retries, transaction stays pending
- Next consolidation will try again

### Scenario 3: Accumulated Transactions (Backlog)

**Problem:**
Consolidation can't keep up with write volume → backlog grows

**Detection:**
```javascript
const pending = await plugin.getPendingCount();
if (pending > 10000) {
  console.warn('BACKLOG DETECTED!', pending);
}
```

**Recovery:**
```javascript
// Option 1: Reduce interval temporarily
consolidationInterval: 2 // from 5s to 2s

// Option 2: Increase concurrency
concurrency: 20 // from 10 to 20

// Option 3: Run extra consolidation
await plugin.runConsolidationNow();

// Option 4: Scale horizontally (more workers)
// Each worker processes different partitions
```

### Scenario 4: Inconsistent Values

**Problem:**
Final value doesn't match sum of transactions

**Debugging:**
```javascript
// 1. Check all transactions
const txs = await plugin.getTransactions('user-123');
const expectedSum = txs.reduce((sum, tx) =>
  tx.operation === 'increment' ? sum + tx.value : sum - tx.value,
  0
);

// 2. Compare with current value
const record = await resource.get('user-123');
const diff = record.balance - expectedSum;

if (diff !== 0) {
  console.error('INCONSISTENCY!', {
    expected: expectedSum,
    actual: record.balance,
    diff
  });

  // 3. Force recalculation
  await plugin.recalculate('user-123', { force: true });
}
```

**Common causes:**
1. Incorrect field handler (doesn't return default)
2. Duplicate transaction applied
3. Direct record modification (bypassing plugin)

---

## ✅ Production Checklist

### Before Deploy

- [ ] `consolidationInterval` ≤ 10 seconds
- [ ] `lockTimeout` configured (recommended: 300s)
- [ ] `maxRetries` ≥ 5
- [ ] `retentionDays` adequate for compliance
- [ ] Field handlers tested with edge case values (null, undefined, 0, negative)
- [ ] Field handlers are **pure** (no side effects)
- [ ] Monitoring metrics configured
- [ ] Alerts configured (pending > threshold, latency > threshold)
- [ ] Structured logging enabled
- [ ] Load tests executed (1000+ tx/s)
- [ ] Rollback plan defined

### In Production

- [ ] Monitor `pendingTransactions` daily
- [ ] Monitor `consolidationLatency` (should be < 2x interval)
- [ ] Monitor `failureRate` (should be < 1%)
- [ ] Verify garbage collection (old transactions being removed)
- [ ] Check orphaned locks (should be rare)
- [ ] Regular transaction backups (for audit trail)
- [ ] Test recovery procedures monthly

### Quick Troubleshooting

```bash
# 1. Check pending transactions
curl http://api/admin/ec/metrics

# 2. Check active locks
curl http://api/admin/ec/locks

# 3. Force consolidation of specific record
curl -X POST http://api/admin/ec/consolidate/user-123

# 4. Manually clean orphaned locks
curl -X POST http://api/admin/ec/cleanup-locks

# 5. Recalculate record value
curl -X POST http://api/admin/ec/recalculate/user-123
```

---

## 🎓 Fundamental Principles

### 1. **Never Modify Directly**
```javascript
// ❌ NEVER
user.balance += 100;
await resource.update(userId, user);

// ✅ ALWAYS
await resource.update(userId, {
  balance: { $increment: 100 }
});
```

### 2. **Trust the Process**
- Automatic consolidation works
- Don't force consolidation unnecessarily
- Eventual consistency is eventual, not instantaneous

### 3. **Idempotency is King**
- Every operation must be repeatable
- Field handlers must be deterministic
- Same transaction applied 2x = same result

### 4. **Monitor, Don't Guess**
- Use metrics for decisions
- Structured logs for debugging
- Proactive alerts for issues

---

## 📚 Additional Resources

- **Tests**: `tests/plugins/eventual-consistency-*.test.js` (122 suites, 2700+ tests)
- **Examples**: `docs/examples/e52-eventual-consistency-analytics.js`
- **Source**: `src/plugins/eventual-consistency/`
- **Benchmarks**: `docs/benchmarks/eventual-consistency-performance.md`

---

## 🏆 Summary: How to Ensure Consistency ALWAYS

1. **Configure properly** (interval ≤ 10s in prod)
2. **Robust field handlers** (always return values, validate input)
3. **Monitor actively** (pending, latency, failures)
4. **Never bypass plugin** (always use $increment/$decrement)
5. **Test extensively** (load, race conditions, failures)
6. **Scale horizontally** when needed (multiple workers)

**Following these practices, you'll have strong eventual consistency with mathematical guarantees! 💯**
