# Partitions

Partitions enable O(1) lookups instead of O(n) full scans by organizing data into logical groups based on field values.

## Why Partitions?

S3 doesn't have indexes. Without partitions, every query scans ALL objects:

```javascript
// Without partitions: O(n) - scans ALL users
await users.query({ status: 'active' });  // 10,000 users = 10,000 S3 LIST calls

// With partitions: O(1) - direct lookup
await users.listPartition('byStatus', { status: 'active' });  // ~1 S3 LIST call
```

## Basic Usage

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required',
    status: 'string|required',
    country: 'string|required'
  },
  partitions: {
    byStatus: {
      fields: { status: 'string' }
    },
    byCountry: {
      fields: { country: 'string' }
    },
    byStatusAndCountry: {
      fields: { status: 'string', country: 'string' }
    }
  }
});
```

## Storage Structure

Partitions create additional S3 keys that reference the main object:

```
resource=users/
├── id=user123                           # Main object
├── partition=byStatus/status=active/id=user123      # Partition reference
├── partition=byCountry/country=US/id=user123        # Partition reference
└── partition=byStatusAndCountry/status=active/country=US/id=user123
```

## Partition Methods

### listPartition

List all records matching partition values:

```javascript
// Single field partition
const activeUsers = await users.listPartition('byStatus', { status: 'active' });

// Multi-field partition
const activeUSUsers = await users.listPartition('byStatusAndCountry', {
  status: 'active',
  country: 'US'
});

// With options
const results = await users.listPartition('byStatus', { status: 'active' }, {
  limit: 100,
  startAfter: 'lastId'
});
```

### getFromPartition

Get a specific record from a partition:

```javascript
const user = await users.getFromPartition('byStatus', {
  status: 'active',
  id: 'user123'
});
```

### getPartitionKey

Get the S3 key for a partition:

```javascript
const key = users.getPartitionKey('byStatus', { status: 'active', id: 'user123' });
// "resource=users/partition=byStatus/status=active/id=user123"
```

## Async Partitions

By default, partition updates are synchronous (blocking). Enable async for faster writes:

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: { ... },
  partitions: { ... },
  asyncPartitions: true  // 70-100% faster writes
});
```

**Trade-offs:**
- Sync (default): Guaranteed consistency, slower writes
- Async: Faster writes, eventual consistency for partition queries

## Multi-Field Partitions

Combine multiple fields for compound lookups:

```javascript
partitions: {
  byRegionAndStatus: {
    fields: {
      region: 'string',
      status: 'string'
    }
  }
}

// Query requires ALL partition fields
await users.listPartition('byRegionAndStatus', {
  region: 'US',
  status: 'active'
});
```

**Field Order**: Partitions use alphabetical field ordering internally. `{ status, region }` and `{ region, status }` produce the same key structure.

## Nested Field Partitions

Partition by nested object fields using dot notation:

```javascript
const events = await db.createResource({
  name: 'events',
  attributes: {
    metadata: {
      source: 'string',
      category: 'string'
    }
  },
  partitions: {
    bySource: {
      fields: { 'metadata.source': 'string' }
    }
  }
});

await events.listPartition('bySource', { 'metadata.source': 'web' });
```

## Automatic Partition Updates

Partitions are automatically maintained on CRUD operations:

```javascript
// Insert: Creates main object + all partition references
await users.insert({ email: 'a@b.com', status: 'active', country: 'US' });

// Update: Updates partition references if partition fields changed
await users.update('user123', { status: 'inactive' });
// Old: partition=byStatus/status=active/id=user123 (deleted)
// New: partition=byStatus/status=inactive/id=user123 (created)

// Delete: Removes main object + all partition references
await users.delete('user123');
```

## Orphaned Partitions

Orphaned partitions occur when partition fields are removed from the schema but references remain:

```javascript
// Detect orphaned partitions
const orphans = await users.findOrphanedPartitions();
console.log(orphans);
// [{ partition: 'byStatus', field: 'status', reason: 'field_not_in_schema' }]

// Clean up orphaned partitions
await users.removeOrphanedPartitions();
```

**Recovery from orphaned partitions:**

```javascript
// If operations are blocked due to orphaned partitions:
const resource = await db.getResource('users', { strictValidation: false });
await resource.removeOrphanedPartitions();
await db.uploadMetadataFile();
```

## Partition Hooks

Execute code when partition references are updated:

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: { ... },
  partitions: { byStatus: { fields: { status: 'string' } } },
  hooks: {
    afterPartitionCreate: async ({ partition, values, id }) => {
      console.log(`Partition created: ${partition}`, values);
    },
    afterPartitionDelete: async ({ partition, values, id }) => {
      console.log(`Partition deleted: ${partition}`, values);
    }
  }
});
```

## Best Practices

### DO

```javascript
// Partition by high-cardinality lookup fields
partitions: {
  byStatus: { fields: { status: 'string' } },      // Few values (active/inactive)
  byCategory: { fields: { category: 'string' } }   // ~10-100 values
}

// Use partitions for frequent queries
await orders.listPartition('byStatus', { status: 'pending' });
```

### DON'T

```javascript
// Don't partition by unique fields (defeats the purpose)
partitions: {
  byEmail: { fields: { email: 'string' } }  // Bad: 1 record per partition
}

// Don't partition by high-cardinality fields
partitions: {
  byTimestamp: { fields: { createdAt: 'date' } }  // Bad: millions of partitions
}
```

## Performance Comparison

| Operation | Without Partition | With Partition |
|-----------|-------------------|----------------|
| Query by status | O(n) LIST calls | O(1) LIST call |
| Query by status + country | O(n) LIST calls | O(1) LIST call |
| Insert | 1 PUT | 1 PUT + n partition PUTs |
| Update (partition field) | 1 PUT | 1 PUT + DEL/PUT per partition |
| Delete | 1 DELETE | 1 DELETE + n partition DELETEs |

**Rule of thumb**: Use partitions when query frequency > write frequency for that field.

## Validating Partitions

Check partition configuration:

```javascript
// Validate all partitions reference existing fields
const validation = await users.validatePartitions();
if (!validation.valid) {
  console.error('Partition errors:', validation.errors);
}
```

## Example: E-commerce Orders

```javascript
const orders = await db.createResource({
  name: 'orders',
  attributes: {
    customerId: 'string|required',
    status: 'string|required',
    total: 'number|required',
    createdAt: 'date|default:now'
  },
  timestamps: true,
  partitions: {
    byCustomer: { fields: { customerId: 'string' } },
    byStatus: { fields: { status: 'string' } },
    byCustomerAndStatus: {
      fields: { customerId: 'string', status: 'string' }
    }
  },
  asyncPartitions: true  // Fast writes, eventual consistency
});

// Fast lookups
const customerOrders = await orders.listPartition('byCustomer', {
  customerId: 'cust123'
});

const pendingOrders = await orders.listPartition('byStatus', {
  status: 'pending'
});

const customerPendingOrders = await orders.listPartition('byCustomerAndStatus', {
  customerId: 'cust123',
  status: 'pending'
});
```

## See Also

- [Resource](./resource.md) - CRUD operations
- [Schema](./schema.md) - Field types
- [Performance Tuning](../guides/performance-tuning.md) - Optimization strategies
