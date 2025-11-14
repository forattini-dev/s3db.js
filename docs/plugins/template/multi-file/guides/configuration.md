# ⚙️ Configuration Guide

**Prev:** [Quick Start](../README.md#-quick-start-2-minutes)
**Next:** [Usage Patterns](./usage-patterns.md)
**Main:** [README](../README.md) | **All guides:** [Index](../README.md#-documentation-index)

> **In this guide:**
> - Basic plugin configuration
> - All available options explained
> - Configuration patterns and examples
> - Performance tuning
> - Troubleshooting config issues

**Time to read:** 10 minutes
**Difficulty:** Beginner

---

## Default Configuration

Every option with its default value:

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 's3://bucket/db',
  plugins: [
    {
      name: 'my-plugin',
      config: {
        // Basic options
        enabled: true,              // Enable/disable plugin
        timeout: 5000,              // Request timeout in ms
        retries: 3,                 // Number of retries

        // Advanced options
        batchSize: 100,             // Process N items at once
        cacheResults: true,         // Cache operation results
        asyncEvents: true,          // Emit events asynchronously

        // Feature flags
        enableFeatureX: true,
        enableFeatureY: false
      }
    }
  ]
});

await db.connect();
```

---

## Option Reference

### Basic Options

#### `enabled`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Enable or disable the plugin
- **When to change:** Disable for testing, disable specific features
- **Example:**
  ```javascript
  { enabled: process.env.NODE_ENV === 'production' }
  ```

#### `timeout`
- **Type:** `number` (milliseconds)
- **Default:** `5000`
- **Range:** 100 - 60000
- **Description:** How long to wait before timing out operations
- **When to change:** Increase for slow networks, decrease for fast responses
- **Example:**
  ```javascript
  { timeout: 10000 }  // 10 second timeout for slow operations
  ```

#### `retries`
- **Type:** `number`
- **Default:** `3`
- **Range:** 0 - 10
- **Description:** How many times to retry failed operations
- **When to change:** Increase for unreliable networks, decrease for speed
- **Example:**
  ```javascript
  { retries: 5 }  // More resilient to failures
  ```

### Advanced Options

#### `batchSize`
- **Type:** `number`
- **Default:** `100`
- **Range:** 1 - 10000
- **Description:** Number of items to process in each batch
- **When to change:** Increase for large datasets (memory vs speed trade-off)
- **Example:**
  ```javascript
  { batchSize: 500 }  // Process 500 items per batch
  ```

#### `cacheResults`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Cache operation results in memory
- **When to change:** Disable if memory is limited, disable for fresh data always
- **Example:**
  ```javascript
  { cacheResults: false }  // Always fetch fresh data
  ```

#### `asyncEvents`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Emit events asynchronously (non-blocking) or synchronously
- **When to change:** Set to false if you need strict ordering
- **Example:**
  ```javascript
  { asyncEvents: false }  // Events must complete before returning
  ```

---

## Configuration Patterns

### Pattern 1: Development Setup

For local development with lots of debugging:

```javascript
{
  enabled: true,
  timeout: 10000,        // Generous timeout for debugging
  retries: 1,            // Fail fast to see errors
  cacheResults: false,   // Always fresh data
  asyncEvents: true      // Non-blocking
}
```

### Pattern 2: Production Setup

For production with stability focus:

```javascript
{
  enabled: true,
  timeout: 5000,         // Reasonable timeout
  retries: 5,            // Retry more to handle transient failures
  cacheResults: true,    // Cache for performance
  asyncEvents: true      // Non-blocking for responsiveness
}
```

### Pattern 3: High-Volume Processing

For processing lots of data:

```javascript
{
  enabled: true,
  timeout: 30000,        // Long timeout for large batches
  retries: 3,
  batchSize: 1000,       // Process many items at once
  cacheResults: false,   // Don't cache large batches
  asyncEvents: false     // Maintain order
}
```

### Pattern 4: Resource-Constrained

For low-memory environments:

```javascript
{
  enabled: true,
  timeout: 10000,
  retries: 2,
  batchSize: 10,         // Small batches
  cacheResults: false,   // No caching
  asyncEvents: true
}
```

---

## Environment-Based Configuration

Load config from environment variables:

```javascript
const db = new Database({
  plugins: [
    {
      name: 'my-plugin',
      config: {
        enabled: process.env.PLUGIN_ENABLED === 'true',
        timeout: parseInt(process.env.PLUGIN_TIMEOUT || '5000'),
        retries: parseInt(process.env.PLUGIN_RETRIES || '3'),
        batchSize: parseInt(process.env.PLUGIN_BATCH_SIZE || '100'),
        cacheResults: process.env.PLUGIN_CACHE === 'true'
      }
    }
  ]
});
```

**.env file:**
```
PLUGIN_ENABLED=true
PLUGIN_TIMEOUT=10000
PLUGIN_RETRIES=5
PLUGIN_BATCH_SIZE=500
PLUGIN_CACHE=true
```

---

## Runtime Configuration Changes

Some options can be changed after initialization:

```javascript
const db = new Database({...});
await db.connect();

// Change settings at runtime
db.myPlugin.setConfig({
  timeout: 15000,
  retries: 5
});

// Get current config
const config = db.myPlugin.getConfig();
console.log(config);
```

**Note:** Some options (like `enabled`) can't be changed at runtime.

---

## Configuration Validation

The plugin validates config at startup:

```javascript
// ✅ Valid
{
  timeout: 5000,
  retries: 3
}

// ❌ Invalid - will throw error
{
  timeout: -1,        // Must be positive
  retries: 'three'    // Must be number
}
```

**Validation errors:**
```
Error: Invalid configuration for MyPlugin
  - timeout: must be number between 100-60000
  - retries: must be number between 0-10
```

---

## Performance Tuning

### Optimize for Speed

If response time is critical:

```javascript
{
  timeout: 2000,         // Fail fast
  retries: 1,            // Don't retry
  batchSize: 1000,       // Process in large batches
  cacheResults: true,    // Cache everything
  asyncEvents: true      // Non-blocking
}
```

### Optimize for Reliability

If every operation must succeed:

```javascript
{
  timeout: 30000,        // Wait longer
  retries: 10,           // Retry many times
  batchSize: 10,         // Process in small batches
  cacheResults: false,   // Fresh data only
  asyncEvents: false     // Strict ordering
}
```

### Optimize for Memory

If memory is limited:

```javascript
{
  timeout: 10000,
  retries: 3,
  batchSize: 5,          // Tiny batches
  cacheResults: false,   // No cache
  asyncEvents: true      // Async = less memory
}
```

---

## Feature Flags

Enable/disable specific features:

```javascript
{
  enableFeatureX: process.env.FEATURE_X_ENABLED === 'true',
  enableFeatureY: false  // Disabled by default
}
```

**In code:**
```javascript
if (db.myPlugin.config.enableFeatureX) {
  // Use feature X
}
```

---

## 🔧 Troubleshooting Configuration

### Issue: "Invalid timeout value"

**Cause:** timeout must be between 100-60000 ms

**Solution:**
```javascript
// ❌ Wrong
{ timeout: 50 }      // Too small

// ✅ Correct
{ timeout: 5000 }    // 5 seconds
```

### Issue: "Configuration not applied"

**Cause:** Plugin was already initialized before config change

**Solution:**
```javascript
// ❌ Wrong
await db.connect();
db.myPlugin.setConfig({ timeout: 10000 });  // Too late!

// ✅ Correct
const db = new Database({
  plugins: [{
    name: 'my-plugin',
    config: { timeout: 10000 }  // Set before connect
  }]
});
await db.connect();
```

### Issue: "Timeout errors increasing"

**Cause:** timeout is too short for current workload

**Solution:**
```javascript
// Monitor performance
const start = Date.now();
await db.myPlugin.heavyOperation();
console.log(`Took ${Date.now() - start}ms`);

// Increase timeout
{ timeout: 30000 }  // Increase from 5000
```

---

## ✅ Configuration Checklist

Before deploying, verify:

- [ ] `enabled` set to `true` in production
- [ ] `timeout` appropriate for your network (default 5000ms is fine)
- [ ] `retries` set high enough for reliability (default 3 is fine)
- [ ] `batchSize` matches your data volume
- [ ] `cacheResults` enabled for read-heavy workloads
- [ ] Environment variables are correct
- [ ] No hardcoded secrets in config
- [ ] Tested with production data volumes

---

## 📚 See Also

- **[Quick Start](../README.md)** - First time setup
- **[Usage Patterns](./usage-patterns.md)** - How to use the plugin
- **[API Reference](../api/core-methods.md)** - Method signatures
- **[Best Practices](./best-practices.md)** - Tips and tricks
- **[Troubleshooting](./best-practices.md#troubleshooting)** - Common issues

---

**Questions about config?** → [See FAQ](./best-practices.md#-faq)
