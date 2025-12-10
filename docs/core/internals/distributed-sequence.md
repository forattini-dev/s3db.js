# Distributed Sequence

> S3-based atomic sequence generation for distributed ID generation.

[← Distributed Lock](distributed-lock.md) | [JSON Recovery →](json-recovery.md)

---

## Overview

`DistributedSequence` provides atomic distributed sequences using S3 storage with locking. It enables safe increment operations across multiple processes, perfect for generating unique IDs.

## Key Features

- **Atomic increment** with distributed locking
- **Resource-scoped or plugin-scoped** paths
- **Pre-increment returns** (returns value before incrementing)
- **Metadata support** for tracking sequence context

## Quick Start

```javascript
import { DistributedSequence, createSequence } from 's3db.js/concerns/distributed-sequence.js';

// Resource-scoped sequence (recommended)
const seq = createSequence(storage, { resourceName: 'orders' });

// Get next ID (returns 1, stores 2)
const orderId = await seq.next('id', { initialValue: 1 });
console.log(orderId); // 1

// Get current value without incrementing
const current = await seq.get('id');
console.log(current); // 2

// Reset sequence
await seq.reset('id', 1000);
```

## API Reference

### Constructor

```javascript
new DistributedSequence(storage, options?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `storage` | `Object` | Storage adapter with `get`, `set`, `delete` methods |
| `options.valueKeyGenerator` | `Function` | Generate value key. Default: `(name) => \`sequences/${name}/value\`` |
| `options.lockKeyGenerator` | `Function` | Generate lock key. Default: `(name) => \`sequences/${name}/lock\`` |
| `options.defaults` | `Object` | Default options for operations |

### next(name, options?)

Get next value from sequence (atomic, returns pre-increment value).

```javascript
const id = await seq.next('counter', {
  initialValue: 1,    // Starting value if doesn't exist (default: 1)
  increment: 1,       // Amount to increment (default: 1)
  lockTimeout: 5000,  // Max wait for lock in ms (default: 5000)
  lockTTL: 10,        // Lock TTL in seconds (default: 10)
  metadata: { /* custom data */ }
});
```

**Returns:** The sequence value BEFORE incrementing.

### get(name)

Get current value without incrementing.

```javascript
const current = await seq.get('counter');
// Returns number or null if sequence doesn't exist
```

### getData(name)

Get full sequence data including metadata.

```javascript
const data = await seq.getData('counter');
// { value: 42, name: 'counter', createdAt: ..., updatedAt: ... }
```

### reset(name, value, options?)

Reset sequence to specific value.

```javascript
await seq.reset('counter', 1000, {
  lockTimeout: 5000,
  lockTTL: 10,
  metadata: { resetBy: 'admin' }
});
```

### set(name, value, options?)

Alias for `reset()` with metadata support.

```javascript
await seq.set('counter', 500, { metadata: { reason: 'migration' } });
```

### delete(name)

Delete a sequence entirely.

```javascript
await seq.delete('counter');
```

### exists(name)

Check if sequence exists.

```javascript
const exists = await seq.exists('counter'); // true or false
```

### increment(name, options?)

Increment and return NEW value (post-increment).

```javascript
// Unlike next() which returns pre-increment
const newValue = await seq.increment('counter');
// If current was 5, returns 6 (not 5)
```

## Factory Function

### createSequence(storage, options)

Create a sequence with appropriate key generators.

```javascript
import { createSequence } from 's3db.js/concerns/distributed-sequence.js';

// Resource-scoped
const seq = createSequence(storage, { resourceName: 'orders' });
// Keys: resource=orders/sequence=counter/value
//       resource=orders/sequence=counter/lock

// Plugin-scoped
const seq = createSequence(storage, { pluginSlug: 'audit' });
// Keys: plugin=audit/sequence=counter/value
//       plugin=audit/sequence=counter/lock

// Resource + Plugin scoped
const seq = createSequence(storage, {
  resourceName: 'orders',
  pluginSlug: 'backup'
});
// Keys: resource=orders/plugin=backup/sequence=counter/value

// Custom prefix
const seq = createSequence(storage, { prefix: 'my-app/' });
// Keys: my-app/sequence=counter/value
```

## Storage Structure

```
resource={resourceName}/
└── sequence={sequenceName}/
    ├── value    # { value: N, name, createdAt, updatedAt, ...metadata }
    └── lock     # Distributed lock with TTL
```

## How It Works

```
Process A                                     S3
    │                                          │
    ├─── ACQUIRE LOCK (sequence/counter/lock) ─►
    │◄── Lock acquired ───────────────────────┤
    │                                          │
    ├─── GET (sequence/counter/value) ────────►
    │◄── { value: 5 } ────────────────────────┤
    │                                          │
    ├─── SET (sequence/counter/value) ────────►
    │    { value: 6 }                          │
    │◄── OK ──────────────────────────────────┤
    │                                          │
    ├─── RELEASE LOCK ────────────────────────►
    │◄── OK ──────────────────────────────────┤
    │                                          │
    │ Returns: 5 (pre-increment)               │
```

## Use Cases

### Auto-Incrementing IDs

```javascript
const seq = createSequence(storage, { resourceName: 'invoices' });

async function createInvoice(data) {
  const invoiceNumber = await seq.next('number', {
    initialValue: 1000,
    metadata: { format: 'INV-%04d' }
  });

  return {
    id: `INV-${String(invoiceNumber).padStart(4, '0')}`,
    ...data
  };
}
```

### Counters

```javascript
const seq = createSequence(storage, { pluginSlug: 'metrics' });

async function trackPageView(page) {
  const count = await seq.increment(`views:${page}`);
  console.log(`Page ${page} viewed ${count} times`);
}
```

### Batch Reservations

```javascript
// Reserve a batch of IDs for bulk insert
const seq = createSequence(storage, { resourceName: 'products' });

async function reserveBatch(count) {
  const start = await seq.next('id', { increment: count });
  return Array.from({ length: count }, (_, i) => start + i);
}

const ids = await reserveBatch(100); // [1, 2, 3, ..., 100]
```

## Error Handling

```javascript
try {
  const id = await seq.next('counter', { lockTimeout: 1000 });
} catch (err) {
  if (err.message.includes('Failed to acquire lock')) {
    // Lock timeout - high contention or slow storage
    console.error('Sequence busy, try again');
  }
  throw err;
}
```

## Best Practices

### Do's

- **Use appropriate scope** - Resource-scoped for per-resource sequences
- **Set reasonable lockTimeout** - 5000ms is usually sufficient
- **Use metadata** - Track sequence purpose and context
- **Handle lock failures** - Contention can cause timeouts

### Don'ts

- **Don't share sequences** - Each resource should have its own
- **Don't reset in production** - Can cause duplicate IDs
- **Don't use for high-frequency** - Consider `fast` mode for bulk operations

## Performance Considerations

| Scenario | Latency | Recommendation |
|----------|---------|----------------|
| Low contention | ~20-50ms | Standard mode |
| High contention | ~50-200ms | Increase lockTimeout |
| Bulk operations | ~1ms/ID | Use [Incremental IDs fast mode](/core/schema.md#incremental-ids) |

## Usage in s3db.js

`DistributedSequence` is used by:

- **IncrementalSequence** - `idGenerator: 'incremental'`
- **PluginStorage** - `nextSequence()` method
- **Audit Plugin** - Event sequence numbers

## See Also

- [Distributed Lock](/core/internals/distributed-lock.md) - Underlying locking mechanism
- [Schema](/core/schema.md) - Incremental ID configuration
- [Global Coordinator](/core/internals/global-coordinator.md) - Leader election using sequences
