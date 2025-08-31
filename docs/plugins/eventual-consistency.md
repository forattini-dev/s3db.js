# 🔄 Eventual Consistency Plugin

<p align="center">
  <strong>Implement eventual consistency for numeric fields with transaction history</strong><br>
  <em>Perfect for counters, balances, points, and other accumulator fields</em>
</p>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Installation & Setup](#installation--setup)
- [API Reference](#api-reference)
- [Configuration Options](#configuration-options)
- [Usage Examples](#usage-examples)
- [Advanced Patterns](#advanced-patterns)
- [Best Practices](#best-practices)

---

## Overview

The Eventual Consistency Plugin provides a robust solution for managing numeric fields that require:
- **Transaction history** - Every change is recorded
- **Atomic operations** - Add, subtract, and set operations
- **Eventual consistency** - Asynchronous consolidation of values
- **Partition support** - Time-based cohorts for efficient querying
- **Custom reducers** - Flexible consolidation logic

> **Important**: This plugin uses explicit methods (`add`, `sub`, `set`, `consolidate`) instead of intercepting regular insert/update operations. This design provides better control and predictability.
>
> **Multi-field Support**: When multiple fields have eventual consistency on the same resource, the field parameter becomes required in method calls. With a single field, the field parameter is optional for cleaner syntax.

### How It Works

1. **Explicit Operations**: Instead of direct updates, use `add()`, `sub()`, and `set()` methods
2. **Transaction Log**: All operations create transactions in a dedicated resource (`{resource}_transactions_{field}`)
3. **Consolidation**: Transactions are periodically consolidated into the final value
4. **Flexibility**: Choose between sync (immediate) or async (eventual) consistency
5. **Deferred Setup**: Plugin can be added before the target resource exists

---

## Key Features

### 🎯 Core Features
- **Atomic Operations**: `add()`, `sub()`, `set()`
- **Transaction History**: Complete audit trail of all changes
- **Flexible Modes**: Sync (immediate) or Async (eventual) consistency
- **Custom Reducers**: Define how transactions consolidate
- **Time-based Partitions**: Automatic day and month partitions for efficient querying

### 🔧 Technical Features
- **Non-blocking**: Operations don't interfere with normal CRUD
- **Batch Support**: Batch multiple transactions for efficiency
- **Auto-consolidation**: Periodic background consolidation
- **Dual Partitions**: Both `byDay` and `byMonth` partitions for flexible querying
- **Timezone Support**: Cohorts respect local timezone for accurate daily/monthly grouping
- **Deferred Setup**: Works with resources created before or after plugin initialization

---

## Installation & Setup

```javascript
import { S3db, EventualConsistencyPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET/path"
});

await s3db.connect();

// Option 1: Add plugin before resource exists (deferred setup)
const plugin = new EventualConsistencyPlugin({
  resource: 'wallets',  // Resource doesn't exist yet
  field: 'balance',
  mode: 'async',
  cohort: {
    timezone: 'America/Sao_Paulo'  // Optional, defaults to UTC
  }
});

await s3db.usePlugin(plugin); // Plugin waits for resource

// Create resource - plugin automatically sets up
const walletsResource = await s3db.createResource({
  name: 'wallets',
  attributes: {
    id: 'string|required',
    userId: 'string|required',
    balance: 'number|required',
    currency: 'string|required'
  }
});

// Methods are now available
await walletsResource.add('wallet-1', 100);

// Option 2: Add plugin after resource exists
// const resource = await s3db.createResource({ ... });
// const plugin = new EventualConsistencyPlugin({ ... });
// await s3db.usePlugin(plugin); // Immediate setup
```

---

## API Reference

### Constructor Options

```javascript
new EventualConsistencyPlugin({
  // Required
  resource: 'resourceName',     // Name of the resource
  field: 'fieldName',           // Numeric field to manage
  
  // Optional
  mode: 'async',                // 'async' (default) or 'sync'
  autoConsolidate: true,        // Enable auto-consolidation
  consolidationInterval: 3600000, // Consolidation interval (ms)
  
  // Cohort configuration  
  cohort: {
    timezone: 'UTC'             // Timezone for cohorts (default: UTC)
  },
  
  // Batching
  batchTransactions: false,     // Enable transaction batching
  batchSize: 100,              // Batch size before flush
  
  // Custom reducer
  reducer: (transactions) => {
    // Custom consolidation logic
    return transactions.reduce((sum, t) => {
      if (t.operation === 'set') return t.value;
      if (t.operation === 'add') return sum + t.value;
      if (t.operation === 'sub') return sum - t.value;
      return sum;
    }, 0);
  }
});
```

### Generated Methods

The plugin adds these methods to your resource. The method signatures adapt based on the number of fields with eventual consistency:

#### Single Field Syntax
When only **one** field has eventual consistency, the field parameter is optional:

```javascript
// Simple, clean syntax for single field
await wallets.set('wallet-123', 1000);     // Set to 1000
await wallets.add('wallet-123', 50);       // Add 50
await wallets.sub('wallet-123', 25);       // Subtract 25
await wallets.consolidate('wallet-123');   // Consolidate
```

#### Multiple Fields Syntax
When **multiple** fields have eventual consistency, the field parameter is **required**:

```javascript
// Must specify which field when multiple exist
await accounts.set('acc-1', 'balance', 1000);   // Set balance
await accounts.add('acc-1', 'points', 100);     // Add points
await accounts.sub('acc-1', 'credits', 50);     // Subtract credits
await accounts.consolidate('acc-1', 'balance'); // Consolidate specific field
```

#### Method Reference

##### `set(id, [field], value)`
Sets the absolute value of the field.
- **Single field**: `set(id, value)`
- **Multiple fields**: `set(id, field, value)`

##### `add(id, [field], amount)`
Adds to the current value.
- **Single field**: `add(id, amount)`
- **Multiple fields**: `add(id, field, amount)`

##### `sub(id, [field], amount)`
Subtracts from the current value.
- **Single field**: `sub(id, amount)`
- **Multiple fields**: `sub(id, field, amount)`

##### `consolidate(id, [field])`
Manually triggers consolidation.
- **Single field**: `consolidate(id)`
- **Multiple fields**: `consolidate(id, field)`

---

## Configuration Options

### Mode: Async vs Sync

```javascript
// Async Mode (default) - Better performance
{
  mode: 'async'
  // Operations return immediately
  // Consolidation happens periodically
  // Best for high-throughput scenarios
}

// Sync Mode - Immediate consistency
{
  mode: 'sync'
  // Operations wait for consolidation
  // Value is always up-to-date
  // Best for critical financial operations
}
```

### Partition Structure

```javascript
// Transaction resources are automatically partitioned by:
{
  byDay: { fields: { cohortDate: 'string' } },    // YYYY-MM-DD format
  byMonth: { fields: { cohortMonth: 'string' } }  // YYYY-MM format
}
```

This dual-partition structure enables:
- Efficient daily transaction queries
- Monthly aggregation and reporting
- Optimized storage and retrieval
- Timezone-aware cohort grouping for accurate local-time analytics

### Timezone Configuration

```javascript
{
  cohort: {
    timezone: 'America/Sao_Paulo' // Group transactions by Brazilian time
  }
}
```

Supported timezones:
- `'UTC'` (default)
- `'America/New_York'`, `'America/Chicago'`, `'America/Los_Angeles'`
- `'America/Sao_Paulo'`
- `'Europe/London'`, `'Europe/Paris'`, `'Europe/Berlin'`
- `'Asia/Tokyo'`, `'Asia/Shanghai'`
- `'Australia/Sydney'`

### Custom Reducers

Define how transactions are consolidated:

```javascript
// Example: Sum all operations
reducer: (transactions) => {
  return transactions.reduce((total, t) => {
    return total + (t.operation === 'sub' ? -t.value : t.value);
  }, 0);
}

// Example: Use last set, then apply increments
reducer: (transactions) => {
  let base = 0;
  let lastSetIndex = -1;
  
  transactions.forEach((t, i) => {
    if (t.operation === 'set') lastSetIndex = i;
  });
  
  if (lastSetIndex >= 0) {
    base = transactions[lastSetIndex].value;
    transactions = transactions.slice(lastSetIndex + 1);
  }
  
  return transactions.reduce((sum, t) => {
    if (t.operation === 'add') return sum + t.value;
    if (t.operation === 'sub') return sum - t.value;
    return sum;
  }, base);
}
```

---

## Usage Examples

### Basic Wallet System (Single Field)

```javascript
// Setup with one field
const plugin = new EventualConsistencyPlugin({
  resource: 'wallets',
  field: 'balance',
  mode: 'sync'  // Immediate consistency
});

await s3db.usePlugin(plugin);

// Create a wallet
await wallets.insert({
  id: 'wallet-001',
  userId: 'user-123',
  balance: 0,
  currency: 'USD'
});

// Simple syntax - no field parameter needed
await wallets.set('wallet-001', 1000);  // Set to 1000
await wallets.add('wallet-001', 250);   // Add 250
await wallets.sub('wallet-001', 100);   // Subtract 100

// Consolidate and check
const balance = await wallets.consolidate('wallet-001');
console.log(`Current balance: $${balance}`); // 1150
```

### Multi-Currency Account (Multiple Fields)

```javascript
// Setup with multiple fields
const accounts = await s3db.createResource({
  name: 'accounts',
  attributes: {
    id: 'string|required',
    userId: 'string|required',
    balance: 'number|default:0',
    points: 'number|default:0',
    credits: 'number|default:0'
  }
});

// Add plugins for each field
await s3db.usePlugin(new EventualConsistencyPlugin({
  resource: 'accounts',
  field: 'balance',
  mode: 'sync'
}));

await s3db.usePlugin(new EventualConsistencyPlugin({
  resource: 'accounts',
  field: 'points',
  mode: 'sync'
}));

// Create account
await accounts.insert({
  id: 'acc-001',
  userId: 'user-123',
  balance: 1000,
  points: 500
});

// Multiple fields require field parameter
await accounts.add('acc-001', 'balance', 300);  // Add to balance
await accounts.add('acc-001', 'points', 150);   // Add to points
await accounts.sub('acc-001', 'balance', 100);  // Subtract from balance

// Consolidate specific fields
const balance = await accounts.consolidate('acc-001', 'balance');
const points = await accounts.consolidate('acc-001', 'points');
console.log(`Balance: $${balance}, Points: ${points}`);
```

### Points System with Custom Reducer

```javascript
const plugin = new EventualConsistencyPlugin({
  resource: 'users',
  field: 'points',
  reducer: (transactions) => {
    // Points can only increase
    return transactions.reduce((total, t) => {
      if (t.operation === 'set') return Math.max(total, t.value);
      if (t.operation === 'add') return total + t.value;
      // Ignore subtractions for points
      return total;
    }, 0);
  }
});

// Usage (single field, simple syntax)
await users.add('user-123', 100);  // Award points
await users.add('user-123', 50);   // More points
// sub would be ignored by reducer
```

### Inventory Counter with Sync Mode

```javascript
const plugin = new EventualConsistencyPlugin({
  resource: 'inventory',
  field: 'quantity',
  mode: 'sync', // Immediate consistency
  cohort: {
    timezone: 'America/New_York' // Group by EST/EDT
  }
});

// Every operation immediately updates the database
await inventory.sub('item-001', 5); // Sold 5 items
const remaining = await inventory.consolidate('item-001');
// 'remaining' is guaranteed to be accurate
```

### Analytics with Cohort Statistics

```javascript
// Get statistics for a specific day
const today = new Date().toISOString().split('T')[0];
const stats = await plugin.getCohortStats(today);

console.log(`
  Date: ${stats.date}
  Total Transactions: ${stats.transactionCount}
  Operations: 
    - Sets: ${stats.byOperation.set}
    - Adds: ${stats.byOperation.add}
    - Subs: ${stats.byOperation.sub}
  Total Value Changed: ${stats.totalValue}
`);
```

---

## Advanced Patterns

### Deferred Setup Pattern

The plugin supports being added before the target resource exists:

```javascript
// 1. Create database and connect
const s3db = new S3db({ connectionString: '...' });
await s3db.connect();

// 2. Add plugin for a resource that doesn't exist yet
const plugin = new EventualConsistencyPlugin({
  resource: 'future_resource',
  field: 'counter'
});
await s3db.usePlugin(plugin); // Plugin enters deferred mode

// 3. Do other work...
await s3db.createResource({ name: 'other_resource', ... });

// 4. Create the target resource
const futureResource = await s3db.createResource({
  name: 'future_resource',
  attributes: {
    id: 'string|required',
    counter: 'number|default:0'
  }
});

// 5. Methods are automatically available
await futureResource.addCounter('rec-1', 10);
```

This pattern is useful for:
- Plugin configuration in application setup
- Modular initialization
- Dynamic resource creation

### Dynamic Field Detection Example

```javascript
// Start with single field
const wallets = await s3db.createResource({
  name: 'wallets',
  attributes: {
    id: 'string|required',
    balance: 'number|default:0'
  }
});

// Add first plugin
await s3db.usePlugin(new EventualConsistencyPlugin({
  resource: 'wallets',
  field: 'balance'
}));

// Simple syntax works
await wallets.add('w-1', 100);  // No field parameter needed

// Later, add a second field with eventual consistency
await s3db.usePlugin(new EventualConsistencyPlugin({
  resource: 'wallets',
  field: 'points'
}));

// Now field parameter is required
try {
  await wallets.add('w-1', 100);  // ERROR!
} catch (error) {
  // "Multiple fields have eventual consistency. Please specify the field"
}

// Must specify field now
await wallets.add('w-1', 'balance', 100);  // OK
await wallets.add('w-1', 'points', 50);    // OK
```

### Transaction Batching for High Volume

```javascript
const plugin = new EventualConsistencyPlugin({
  resource: 'metrics',
  field: 'count',
  batchTransactions: true,
  batchSize: 500, // Batch 500 transactions
  consolidationInterval: 60000 // Consolidate every minute
});

// Transactions are batched automatically
for (let i = 0; i < 1000; i++) {
  await metrics.addCount(`metric-${i % 10}`, 1);
  // Batched in groups of 500
}
```

### Parallel Operations Example

```javascript
// Setup resource with multiple fields
const metrics = await s3db.createResource({
  name: 'metrics',
  attributes: {
    id: 'string|required',
    views: 'number|default:0',
    clicks: 'number|default:0'
  }
});

// Add plugins
await s3db.usePlugin(new EventualConsistencyPlugin({
  resource: 'metrics',
  field: 'views',
  mode: 'async'
}));

await s3db.usePlugin(new EventualConsistencyPlugin({
  resource: 'metrics',
  field: 'clicks',
  mode: 'async'
}));

// Parallel operations on different fields
const operations = [
  metrics.add('page-1', 'views', 100),
  metrics.add('page-1', 'views', 200),
  metrics.add('page-1', 'clicks', 10),
  metrics.add('page-1', 'clicks', 20)
];

await Promise.all(operations);

// Consolidate both fields
const views = await metrics.consolidate('page-1', 'views');
const clicks = await metrics.consolidate('page-1', 'clicks');
```

### Manual Consolidation Control

```javascript
const plugin = new EventualConsistencyPlugin({
  resource: 'accounts',
  field: 'balance',
  autoConsolidate: false // Disable auto-consolidation
});

// Manually trigger consolidation when needed
await accounts.consolidate('account-001');

// Useful for:
// - Batch processing
// - Scheduled consolidation
// - Controlled timing
```

---

## Best Practices

### 1. Choose the Right Mode

- **Use Async Mode** for:
  - High-throughput operations
  - Non-critical counters
  - Analytics and metrics
  - User points/rewards

- **Use Sync Mode** for:
  - Financial transactions
  - Inventory management
  - Critical counters
  - Real-time requirements

### 2. Leverage Partition Structure

```javascript
// Query by day for recent transactions (respects timezone)
const todayTransactions = await db.resources.wallets_transactions_balance.query({
  cohortDate: '2024-01-15'  // In configured timezone
});

// Query by month for reporting
const monthTransactions = await db.resources.wallets_transactions_balance.query({
  cohortMonth: '2024-01'
});

// Both partitions are always available for flexible querying
```

### 3. Choose the Right Timezone

```javascript
// For global applications - use UTC
{ cohort: { timezone: 'UTC' } }

// For regional applications - use local timezone
{ cohort: { timezone: 'America/Sao_Paulo' } }  // Brazil
{ cohort: { timezone: 'America/New_York' } }   // US East Coast
{ cohort: { timezone: 'Asia/Tokyo' } }         // Japan

// Timezone affects cohort grouping for daily/monthly partitions
```

### 3. Design Reducers Carefully

```javascript
// Always handle all operation types
reducer: (transactions) => {
  return transactions.reduce((acc, t) => {
    switch(t.operation) {
      case 'set': return t.value;
      case 'add': return acc + t.value;
      case 'sub': return acc - t.value;
      default: return acc; // Handle unknown operations
    }
  }, 0);
}
```

### 4. Monitor Transaction Growth

```javascript
// Periodically clean up old transactions
const oldDate = new Date();
oldDate.setMonth(oldDate.getMonth() - 3); // 3 months ago

const oldTransactions = await s3db.resources.wallets_transactions.query({
  applied: true,
  timestamp: { $lt: oldDate.toISOString() }
});

// Archive or delete old transactions
```

### 5. Error Handling

```javascript
// Listen for transaction errors
plugin.on('eventual-consistency.transaction-error', (error) => {
  console.error('Transaction failed:', error);
  // Implement retry logic or alerting
});

// Monitor consolidation
plugin.on('eventual-consistency.consolidated', (stats) => {
  console.log(`Consolidated ${stats.recordCount} records`);
});
```

### 6. Testing Strategies

```javascript
// Use sync mode for tests
const testPlugin = new EventualConsistencyPlugin({
  resource: 'testResource',
  field: 'value',
  mode: 'sync' // Predictable for tests
});

// Single field - simple syntax
await resource.set('test-1', 100);
await resource.add('test-1', 50);
const result = await resource.consolidate('test-1');
expect(result).toBe(150);
```

---

## Transaction Resource Schema

The plugin creates a `${resource}_transactions_${field}` resource for each field with this schema:

```javascript
{
  id: 'string|required',         // Transaction ID
  originalId: 'string|required', // Parent record ID
  field: 'string|required',      // Field name
  value: 'number|required',      // Transaction value
  operation: 'string|required',  // 'set', 'add', or 'sub'
  timestamp: 'string|required',  // ISO timestamp
  cohortDate: 'string|required', // YYYY-MM-DD
  cohortMonth: 'string|optional',// YYYY-MM
  source: 'string|optional',     // Operation source
  applied: 'boolean|optional'    // Consolidation status
}
```

This resource is automatically partitioned by both `cohortDate` (byDay) and `cohortMonth` (byMonth) for efficient querying.

**Notes**: 
- The transaction resource uses `asyncPartitions: true` by default for better write performance
- Each field gets its own transaction resource (e.g., `wallets_transactions_balance`, `wallets_transactions_points`)
- Transaction resources are created automatically when the plugin initializes

---

## Troubleshooting

### Issue: Balance doesn't update immediately
**Solution**: You're using async mode. Either switch to sync mode or manually call `consolidate()`.

### Issue: Too many transactions accumulating
**Solution**: Reduce consolidation interval or implement transaction archiving.

### Issue: Consolidation taking too long
**Solution**: Use smaller cohort intervals or optimize your reducer function.

### Issue: Methods not available on resource
**Solution**: 
- Ensure plugin is added via `s3db.usePlugin(plugin)`
- Verify database is connected before adding plugin
- If using deferred setup, confirm resource name matches exactly
- Check that the resource has been created if plugin was added first

### Issue: "Multiple fields have eventual consistency" error
**Solution**: When multiple fields have eventual consistency, you must specify the field parameter:
```javascript
// Wrong
await resource.add('id', 100);

// Correct
await resource.add('id', 'fieldName', 100);
```

---

## Migration Guide

### From Direct Updates to Eventual Consistency

```javascript
// Before: Direct updates
await wallets.update({
  id: 'wallet-001',
  balance: 1000
});

// After: Using eventual consistency (single field)
await wallets.set('wallet-001', 1000);

// For increments
// Before:
const wallet = await wallets.get('wallet-001');
await wallets.update({
  id: 'wallet-001',
  balance: wallet.balance + 100
});

// After (single field):
await wallets.add('wallet-001', 100);

// After (multiple fields):
await wallets.add('wallet-001', 'balance', 100);
```

---

## See Also

- [Plugin Development Guide](./plugin-development.md)
- [Audit Plugin](./audit.md) - For complete operation logging
- [Metrics Plugin](./metrics.md) - For performance monitoring
- [State Machine Plugin](./state-machine.md) - For state transitions