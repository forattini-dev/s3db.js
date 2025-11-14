# 📖 Usage Patterns & API Reference

**Prev:** [Configuration](./configuration.md)
**Next:** [Best Practices](./best-practices.md)
**Main:** [README](../README.md) | **All guides:** [Index](../README.md#-documentation-index)

> **In this guide:**
> - Basic usage patterns
> - Complete API reference
> - Real-world examples
> - Edge cases and variations
> - Performance considerations

**Time to read:** 20 minutes
**Difficulty:** Beginner → Intermediate

---

## Quick Reference

| Method | Purpose | Returns | Async |
|--------|---------|---------|-------|
| `doSomething()` | [Description](#dosomething) | Result | ✅ |
| `doAnother()` | [Description](#doanother) | Result | ✅ |
| `getStatus()` | [Description](#getstatus) | Status | ❌ |
| `setConfig()` | [Description](#setconfig) | void | ❌ |

---

## Pattern 1: Basic Usage

**When to use:** Just getting started with the plugin

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 's3://bucket/db',
  plugins: [{
    name: 'my-plugin',
    config: { timeout: 5000, retries: 3 }
  }]
});

await db.connect();

// Use the plugin
const result = await db.myPlugin.doSomething('input');
console.log(result);  // { success: true, data: ... }
```

**When to use this:**
- ✅ Initial setup
- ✅ Simple, one-off operations
- ✅ Learning the API

---

## Pattern 2: With Error Handling

**When to use:** Production code that needs robust error handling

```javascript
import { Database } from 's3db.js';

const db = new Database({...});
await db.connect();

try {
  const result = await db.myPlugin.doSomething('input');
  console.log('Success:', result);
} catch (error) {
  if (error.code === 'TIMEOUT') {
    console.error('Operation timed out, retrying...');
  } else if (error.code === 'INVALID_INPUT') {
    console.error('Invalid input:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

**Common error codes:**
- `TIMEOUT` - Operation took too long
- `INVALID_INPUT` - Input validation failed
- `PLUGIN_DISABLED` - Plugin is disabled
- `RATE_LIMITED` - Too many requests

---

## Pattern 3: Batch Operations

**When to use:** Processing multiple items efficiently

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 's3://bucket/db',
  plugins: [{
    name: 'my-plugin',
    config: {
      timeout: 10000,
      batchSize: 100   // Process 100 items at once
    }
  }]
});

await db.connect();

// Process array of items
const items = ['item1', 'item2', 'item3'];
const results = await Promise.all(
  items.map(item => db.myPlugin.doSomething(item))
);

console.log(`Processed ${results.length} items`);
```

**Optimization tips:**
- ✅ Increase `batchSize` for better throughput
- ✅ Use `Promise.all()` for parallel processing
- ✅ Monitor memory usage with large batches

---

## Pattern 4: With Caching

**When to use:** Same operation called multiple times

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 's3://bucket/db',
  plugins: [{
    name: 'my-plugin',
    config: {
      cacheResults: true,  // Enable caching
      timeout: 5000
    }
  }]
});

await db.connect();

// First call - hits the actual operation
const result1 = await db.myPlugin.doSomething('key');
console.log(result1);  // { cached: false, ... }

// Second call - returns from cache
const result2 = await db.myPlugin.doSomething('key');
console.log(result2);  // { cached: true, ... }
```

**When caching helps:**
- ✅ Read-heavy operations
- ✅ Static data that doesn't change often
- ✅ Expensive computations

---

## API Reference

### doSomething()

Perform the main operation.

**Signature:**
```typescript
doSomething(input: string, options?: DoSomethingOptions): Promise<DoSomethingResult>
```

**Parameters:**
- `input` (string) - Required. The input data
- `options` (object) - Optional. Override defaults

**Options:**
```javascript
{
  timeout: 5000,      // Override default timeout
  cache: true,        // Use cached result if available
  force: false        // Ignore cache, always compute fresh
}
```

**Returns:**
```javascript
{
  success: boolean,
  data: any,
  cached: boolean,
  duration: number    // How long the operation took (ms)
}
```

**Examples:**

```javascript
// Basic
const result = await db.myPlugin.doSomething('hello');

// With options
const result = await db.myPlugin.doSomething('hello', {
  timeout: 10000,
  force: true  // Bypass cache
});

// Handle different outcomes
const result = await db.myPlugin.doSomething('hello');
if (result.success) {
  console.log('Computed value:', result.data);
} else {
  console.log('Operation failed');
}
```

**Errors:**
- `INVALID_INPUT` - Input is not a string
- `TIMEOUT` - Operation exceeded timeout
- `PLUGIN_DISABLED` - Plugin is disabled

---

### doAnother()

Perform another operation.

**Signature:**
```typescript
doAnother(input: object): Promise<DoAnotherResult>
```

**Parameters:**
- `input` (object) - Required. Configuration object

**Options in input:**
```javascript
{
  fieldA: string,     // Required. Some field
  fieldB: number,     // Optional. Another field
  fieldC: boolean     // Optional. Some flag
}
```

**Returns:**
```javascript
{
  success: boolean,
  message: string,
  count: number
}
```

**Examples:**

```javascript
// Minimal
const result = await db.myPlugin.doAnother({
  fieldA: 'value'
});

// Full options
const result = await db.myPlugin.doAnother({
  fieldA: 'value',
  fieldB: 42,
  fieldC: true
});

// Using result
if (result.success) {
  console.log(`Processed ${result.count} items`);
} else {
  console.log(`Error: ${result.message}`);
}
```

---

### getStatus()

Get current plugin status.

**Signature:**
```typescript
getStatus(): PluginStatus
```

**Returns:**
```javascript
{
  enabled: boolean,
  connected: boolean,
  uptime: number,     // Milliseconds since plugin started
  operations: {
    total: number,
    successful: number,
    failed: number,
    cached: number
  },
  config: {...}       // Current configuration
}
```

**Example:**

```javascript
const status = db.myPlugin.getStatus();

console.log(`Plugin: ${status.enabled ? 'Enabled' : 'Disabled'}`);
console.log(`Uptime: ${status.uptime}ms`);
console.log(`Success rate: ${(status.operations.successful / status.operations.total * 100).toFixed(2)}%`);
```

---

### setConfig()

Change configuration at runtime.

**Signature:**
```typescript
setConfig(options: Partial<PluginConfig>): void
```

**Parameters:**
- `options` (object) - Options to update

**Updateable options:**
- `timeout` ✅
- `retries` ✅
- `batchSize` ✅
- `cacheResults` ✅
- `asyncEvents` ✅

**Non-updateable:**
- `enabled` ❌ (can't change after init)

**Example:**

```javascript
// Get current config
console.log(db.myPlugin.getConfig());

// Update config
db.myPlugin.setConfig({
  timeout: 10000,
  retries: 5
});

// Verify change
console.log(db.myPlugin.getConfig());
```

---

## Advanced Patterns

### Pattern 5: Monitoring & Metrics

Track plugin performance:

```javascript
const db = new Database({...});
await db.connect();

// Get initial status
const startStatus = db.myPlugin.getStatus();

// Do some operations
for (let i = 0; i < 100; i++) {
  await db.myPlugin.doSomething(`item-${i}`);
}

// Get final status
const endStatus = db.myPlugin.getStatus();

// Calculate metrics
const duration = endStatus.uptime - startStatus.uptime;
const operations = endStatus.operations.total - startStatus.operations.total;
const throughput = operations / (duration / 1000);

console.log(`Throughput: ${throughput.toFixed(2)} ops/sec`);
console.log(`Success rate: ${(endStatus.operations.successful / operations * 100).toFixed(2)}%`);
```

### Pattern 6: Conditional Logic

Make decisions based on results:

```javascript
async function processWithFallback(input) {
  try {
    // Try primary operation
    const result = await db.myPlugin.doSomething(input, { timeout: 2000 });
    if (result.success) return result.data;
  } catch (error) {
    console.warn('Primary failed, trying fallback...');
  }

  // Fallback: try with different options
  const result = await db.myPlugin.doSomething(input, {
    timeout: 10000,
    force: true  // Bypass cache
  });
  return result.data;
}

const data = await processWithFallback('input');
```

### Pattern 7: Rate Limiting

Control request rate:

```javascript
const pLimit = require('p-limit');
const limit = pLimit(5);  // Max 5 concurrent operations

const items = Array.from({ length: 1000 }, (_, i) => `item-${i}`);

const results = await Promise.all(
  items.map(item =>
    limit(() => db.myPlugin.doSomething(item))
  )
);

console.log(`Processed ${results.length} items with rate limiting`);
```

---

## Common Mistakes

### ❌ Mistake 1: Ignoring async/await

```javascript
// ❌ Wrong - won't work
const result = db.myPlugin.doSomething('input');
console.log(result.data);  // undefined!

// ✅ Correct
const result = await db.myPlugin.doSomething('input');
console.log(result.data);  // Works!
```

### ❌ Mistake 2: No error handling

```javascript
// ❌ Wrong - errors uncaught
await db.myPlugin.doSomething('invalid').doAnother({});

// ✅ Correct
try {
  await db.myPlugin.doSomething('invalid');
  await db.myPlugin.doAnother({});
} catch (error) {
  console.error('Error:', error);
}
```

### ❌ Mistake 3: Timeout too short

```javascript
// ❌ Wrong - times out before completing
const db = new Database({
  plugins: [{
    name: 'my-plugin',
    config: { timeout: 100 }  // Way too short!
  }]
});

// ✅ Correct
const db = new Database({
  plugins: [{
    name: 'my-plugin',
    config: { timeout: 5000 }  // Reasonable default
  }]
});
```

---

## Performance Tips

### Tip 1: Use batch operations

```javascript
// ❌ Slower - many small operations
for (const item of items) {
  await db.myPlugin.doSomething(item);
}

// ✅ Faster - parallel operations
await Promise.all(items.map(item => db.myPlugin.doSomething(item)));
```

### Tip 2: Enable caching for reads

```javascript
// ✅ Good for read-heavy workloads
const db = new Database({
  plugins: [{
    name: 'my-plugin',
    config: { cacheResults: true }
  }]
});
```

### Tip 3: Tune timeout based on data size

```javascript
// Small data = short timeout
{ timeout: 2000 }

// Large data = long timeout
{ timeout: 30000 }
```

---

## 📚 See Also

- **[Configuration Guide](./configuration.md)** - All configuration options
- **[Best Practices](./best-practices.md)** - Tips, tricks, and troubleshooting
- **[API Reference](../api/core-methods.md)** - Detailed method signatures
- **[Troubleshooting](./best-practices.md#troubleshooting)** - Common problems and solutions

---

**Still have questions?** → [See FAQ](./best-practices.md#-faq)
