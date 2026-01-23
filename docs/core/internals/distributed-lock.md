# Distributed Lock

> S3-based distributed locking for atomic coordination across processes.

[← Back to Core](/core/README.md) | [Distributed Sequence →](/core/internals/distributed-sequence.md)

---

## Overview

`DistributedLock` provides atomic distributed locking using S3 conditional writes (`ifNoneMatch: '*'`). This ensures that only one process can hold a lock at a time, even across multiple servers or containers.

## Key Features

- **Atomic acquisition** using S3 preconditions (412 PreconditionFailed)
- **TTL-based auto-expiration** prevents deadlocks from crashed processes
- **Exponential backoff with jitter** reduces contention
- **Token-based ownership** ensures only the owner can release

## Quick Start

```javascript
import { DistributedLock } from 's3db.js/src/concerns/distributed-lock.js';

const lock = new DistributedLock(storage, {
  keyGenerator: (name) => `locks/${name}`
});

// Acquire and release manually
const handle = await lock.acquire('my-resource', { ttl: 30, timeout: 5000 });
if (handle) {
  try {
    // Critical section - only one process executes this
    await doWork();
  } finally {
    await lock.release(handle);
  }
}

// Or use withLock helper (recommended)
const result = await lock.withLock('my-resource', { ttl: 30 }, async () => {
  return await computeValue();
});
```

## API Reference

### Constructor

```javascript
new DistributedLock(storage, options?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `storage` | `Object` | Storage adapter with `get`, `set`, `delete` methods |
| `options.keyGenerator` | `Function` | Generate lock key from name. Default: `(name) => \`locks/${name}\`` |
| `options.defaults` | `Object` | Default options for `acquire()` |

### acquire(lockName, options?)

Acquire a distributed lock.

```javascript
const handle = await lock.acquire('order-123', {
  ttl: 30,           // Lock TTL in seconds (default: 30)
  timeout: 5000,     // Max wait time in ms (0 = no wait, default: 0)
  workerId: 'pod-1', // Worker identifier for debugging
  retryDelay: 100,   // Base retry delay in ms (default: 100)
  maxRetryDelay: 1000 // Max retry delay in ms (default: 1000)
});
```

**Returns:** Lock handle object or `null` if couldn't acquire.

Lock handle structure:
```javascript
{
  name: 'order-123',
  key: 'locks/order-123',
  token: 'abc123xyz',      // Unique token for ownership verification
  workerId: 'pod-1',
  expiresAt: 1699876543000,
  etag: '"abc123"'
}
```

### release(lock, token?)

Release a distributed lock.

```javascript
// Using handle (recommended)
await lock.release(handle);

// Using name + token
await lock.release('order-123', 'abc123xyz');
```

Only the owner (matching token) can release the lock.

### withLock(lockName, options, callback)

Execute callback while holding lock. Automatically releases on completion or error.

```javascript
const result = await lock.withLock('order-123', { ttl: 30 }, async (handle) => {
  console.log('Lock acquired:', handle.token);
  return await processOrder();
});

if (result === null) {
  console.log('Could not acquire lock');
}
```

### isLocked(lockName)

Check if lock is currently held.

```javascript
const locked = await lock.isLocked('order-123');
// true if locked, false otherwise
```

### getLockInfo(lockName)

Get lock information without acquiring.

```javascript
const info = await lock.getLockInfo('order-123');
// { workerId, token, acquiredAt, _expiresAt } or null
```

## How It Works

```
Process A                         S3                           Process B
    │                              │                               │
    ├─── PUT lock (ifNoneMatch:*) ─►                               │
    │◄── 200 OK ──────────────────┤                               │
    │    (acquired)                │                               │
    │                              │◄── PUT lock (ifNoneMatch:*) ──┤
    │                              ├─── 412 PreconditionFailed ───►│
    │                              │                               │
    │    [work in critical section]│         [wait & retry]        │
    │                              │                               │
    ├─── DELETE lock ─────────────►│                               │
    │◄── 200 OK ──────────────────┤                               │
    │                              │◄── PUT lock (ifNoneMatch:*) ──┤
    │                              ├─── 200 OK ───────────────────►│
    │                              │                   (acquired)  │
```

### Contention Handling

When a lock is held by another process:

1. **Check timeout** - If exceeded, return `null`
2. **Read lock** - Check if it exists or expired
3. **Clean expired** - Delete if TTL passed
4. **Backoff** - Wait with exponential backoff + jitter
5. **Retry** - Try again

```javascript
// Backoff formula
const delay = min(baseDelay * 2^attempt, maxDelay) + random(0, baseDelay/2)
```

## Helper Functions

### computeBackoff(attempt, baseDelay, maxDelay)

Calculate exponential backoff with jitter.

```javascript
import { computeBackoff } from 's3db.js/src/concerns/distributed-lock.js';

const delay = computeBackoff(3, 100, 1000); // ~400-450ms
```

### sleep(ms)

Promise-based delay.

```javascript
import { sleep } from 's3db.js/src/concerns/distributed-lock.js';

await sleep(1000); // Wait 1 second
```

### isPreconditionFailure(err)

Check if error is 412 PreconditionFailed.

```javascript
import { isPreconditionFailure } from 's3db.js/src/concerns/distributed-lock.js';

try {
  await storage.set(key, data, { ifNoneMatch: '*' });
} catch (err) {
  if (isPreconditionFailure(err)) {
    console.log('Object already exists');
  }
}
```

### createLockedFunction(lock, lockName, options?)

Create a reusable locked function.

```javascript
import { createLockedFunction } from 's3db.js/src/concerns/distributed-lock.js';

const lockedProcess = createLockedFunction(lock, 'order-processing', { ttl: 60 });

// Use it multiple times
await lockedProcess(async () => await processOrder(order1));
await lockedProcess(async () => await processOrder(order2));
```

## Best Practices

### Do's

- **Set appropriate TTL** - Long enough for work, short enough for recovery
- **Use `withLock`** - Ensures lock is always released
- **Include workerId** - Helps debugging in distributed systems
- **Handle null returns** - Lock might not be acquired

### Don'ts

- **Don't hold locks too long** - Blocks other processes
- **Don't ignore timeouts** - Can cause cascading failures
- **Don't assume immediate acquisition** - Always check return value

## Error Handling

```javascript
try {
  const result = await lock.withLock('resource', { ttl: 30, timeout: 5000 }, async () => {
    return await riskyOperation();
  });

  if (result === null) {
    // Lock not acquired within timeout
    throw new Error('Resource busy - try again later');
  }

  return result;
} catch (err) {
  if (err.message.includes('storage')) {
    // Storage failure - S3 unavailable
  }
  throw err;
}
```

## Usage in s3db.js

`DistributedLock` is used internally by:

- **PluginStorage** - Atomic operations on plugin data
- **DistributedSequence** - Atomic sequence increments
- **IncrementalSequence** - Auto-incrementing IDs
- **GlobalCoordinatorService** - Leader election

## See Also

- [Distributed Sequence](distributed-sequence.md) - Atomic sequence generation
- [Global Coordinator](global-coordinator.md) - Leader election service
