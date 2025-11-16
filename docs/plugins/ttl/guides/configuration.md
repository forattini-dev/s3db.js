# ⚙️ Configuration Guide

**Prev:** [Quick Start](../README.md#-quick-start)
**Next:** [Usage Patterns](./usage-patterns.md)
**Main:** [README](../README.md) | **All guides:** [Index](../README.md#-documentation-index)

> **In this guide:**
> - All configuration options explained
> - Plugin-level and resource-level settings
> - Custom cleanup schedules with cron
> - Configuration patterns for different scenarios
> - Performance tuning strategies

**Time to read:** 10 minutes
**Difficulty:** Beginner

---

## Default Configuration

Every plugin-level and resource-level option with its default value:

```javascript
import { TTLPlugin } from 's3db.js';

const ttlPlugin = new TTLPlugin({
  // Plugin-level options
  batchSize: 100,              // Records to process per batch
  logLevel: 'silent',              // Enable logging

  // Resource-specific TTL configurations
  resources: {
    resource_name: {
      ttl: 86400,              // TTL in seconds (24 hours)
      field: '_createdAt',     // Timestamp field (default)
      onExpire: 'soft-delete',  // Strategy: soft-delete | hard-delete | archive | callback

      // Strategy-specific options
      deleteField: 'deletedat', // For soft-delete
      archiveResource: 'archive', // For archive
      keepOriginalId: false,    // For archive
      callback: async (record) => {} // For callback
    }
  },

  // Optional: Override cleanup schedules per granularity (cron expressions)
  schedules: {
    minute: '*/10 * * * * *',   // Every 10 seconds
    hour: '*/10 * * * *',       // Every 10 minutes
    day: '0 0 * * *',           // Daily at midnight
    week: '0 0 * * 0'           // Weekly on Sunday
  },

  // Multi-pod/multi-instance deployments
  enableCoordinator: true       // Enable coordinator mode
});

await db.usePlugin(ttlPlugin);
```

---

## Option Reference

### Plugin-Level Options

#### `batchSize`
- **Type:** `number`
- **Default:** `100`
- **Range:** 1 - 10000
- **Description:** Number of records to process in each cleanup batch
- **When to change:**
  - Increase for large datasets (better throughput)
  - Decrease for large records (reduce memory)
  - Decrease for constrained environments
- **Example:**
  ```javascript
  { batchSize: 500 }  // Process 500 records at a time
  ```

#### `logLevel`
- **Type:** `boolean`
- **Default:** `false`
- **Description:** Enable detailed console logging
- **When to change:**
  - Set to `true` during development
  - Enable in production for debugging
  - Disable in production for performance
- **Example:**
  ```javascript
  { logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'info' }
  ```

#### `resources`
- **Type:** `object`
- **Default:** `{}`
- **Description:** Resource-specific TTL configurations
- **When to change:** Add resource configs as you add TTL management to resources
- **Example:**
  ```javascript
  {
    resources: {
      sessions: { ttl: 1800, onExpire: 'soft-delete' },
      temp_files: { ttl: 3600, onExpire: 'hard-delete' }
    }
  }
  ```

#### `schedules`
- **Type:** `object`
- **Default:** `{}`
- **Description:** Override cleanup schedules with cron expressions (supports second-level granularity!)
- **When to change:** Customize for your performance/cost requirements
- **Supported granularities:** `minute`, `hour`, `day`, `week`
- **Example:**
  ```javascript
  {
    schedules: {
      minute: '*/30 * * * * *',   // Every 30 seconds
      hour: '*/15 * * * *',       // Every 15 minutes
      day: '0 2 * * *'            // Daily at 2 AM
    }
  }
  ```

#### `enableCoordinator`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Enable coordinator mode for multi-pod deployments
- **When to change:**
  - Keep enabled in Kubernetes/multi-instance (automatic election)
  - Set to `false` only for single-instance environments
- **Example:**
  ```javascript
  {
    enableCoordinator: process.env.NODE_ENV === 'production'
  }
  ```

---

### Resource-Level Options

#### `ttl`
- **Type:** `number` (seconds)
- **Required:** ✅ (unless `field` is set)
- **Description:** Time-to-live in seconds. Plugin auto-detects granularity based on TTL value.
- **Granularity auto-detection:**
  - `< 60s`: 'minute' (checks every 10 seconds)
  - `60s - 3600s`: 'minute' (checks every 10 seconds)
  - `3600s - 86400s`: 'hour' (checks every 10 minutes)
  - `> 86400s`: 'day' (checks daily at midnight)
- **Example:**
  ```javascript
  {
    ttl: 1800  // 30 minutes → uses 'hour' granularity
  }
  ```

#### `field`
- **Type:** `string`
- **Default:** `'_createdAt'`
- **Required:** ❌ (optional, used if set)
- **Description:** Field containing the timestamp to check for expiration
- **Behavior:** TTL is added to this field's value to calculate expiration time
- **Use when:** You want expiration relative to a custom field (e.g., `lastActivity`, `completedAt`, `expiresAt`)
- **Example:**
  ```javascript
  {
    field: 'lastActivity'  // Expire 24 hours after last activity
  }
  ```

#### `onExpire`
- **Type:** `string`
- **Default:** ❌ (REQUIRED)
- **Valid values:** `'soft-delete'`, `'hard-delete'`, `'archive'`, `'callback'`
- **Description:** Strategy to execute when a record expires
- **Example:**
  ```javascript
  { onExpire: 'soft-delete' }  // Mark as deleted
  ```

#### `deleteField` (soft-delete only)
- **Type:** `string`
- **Default:** `'deletedat'`
- **Description:** Field to mark deletion timestamp
- **When to change:** Use a custom field name if preferred
- **Example:**
  ```javascript
  { deleteField: 'deletedAt' }  // Use 'deletedAt' field instead
  ```

#### `archiveResource` (archive only)
- **Type:** `string`
- **Required:** ✅ (for archive strategy)
- **Description:** Destination resource for archived records
- **Behavior:** Records are copied here before deletion from source
- **Example:**
  ```javascript
  { archiveResource: 'archive_orders' }
  ```

#### `keepOriginalId` (archive only)
- **Type:** `boolean`
- **Default:** `false`
- **Description:** Whether to keep the original record ID in archive
- **When to change:**
  - Set to `true` if you need to track original ID
  - Helps with recovery/audit trails
- **Example:**
  ```javascript
  { keepOriginalId: true }
  ```

#### `callback` (callback only)
- **Type:** `async function`
- **Required:** ✅ (for callback strategy)
- **Signature:** `async (record, resource) => boolean`
- **Returns:** `true` to delete record, `false` to keep
- **Description:** Custom function to handle expired records
- **Example:**
  ```javascript
  {
    callback: async (record) => {
      if (record.status === 'paid') {
        await sendNotification(record);
        return true;  // Delete after notification
      }
      return false;  // Keep for now
    }
  }
  ```

---

## Configuration Patterns

### Pattern 1: Development Setup

For local development with quick iteration:

```javascript
new TTLPlugin({
  batchSize: 50,              // Smaller batches
  logLevel: 'debug',              // Show all logs

  resources: {
    sessions: {
      ttl: 300,               // 5 minutes (test quickly)
      onExpire: 'soft-delete'
    }
  },

  schedules: {
    minute: '*/5 * * * * *'    // Check every 5 seconds (fast)
  }
});
```

**Use when:** Testing TTL behavior locally

---

### Pattern 2: Production Setup

For production with reliability focus:

```javascript
new TTLPlugin({
  batchSize: 500,             // Larger batches for efficiency
  logLevel: 'silent',             // No logging overhead

  resources: {
    sessions: {
      ttl: 86400,             // 24 hours
      onExpire: 'soft-delete'
    },
    temp_files: {
      ttl: 3600,              // 1 hour
      onExpire: 'hard-delete'
    }
  },

  schedules: {
    minute: '*/30 * * * * *',  // Check every 30 seconds
    hour: '*/15 * * * *'       // Check every 15 minutes
  },

  enableCoordinator: true      // Avoid duplicate cleanup in multi-pod
});
```

**Use when:** Running in production with multiple instances

---

### Pattern 3: Cost-Optimized Setup

For minimizing S3 API calls:

```javascript
new TTLPlugin({
  batchSize: 1000,            // Large batches

  resources: {
    old_logs: {
      ttl: 604800,            // 7 days
      onExpire: 'archive',
      archiveResource: 'archive_logs'
    }
  },

  schedules: {
    day: '0 2 * * *'          // Check once daily at 2 AM
  }
});
```

**Use when:** Cost is primary concern, faster cleanup not needed

---

### Pattern 4: High-Volume Setup

For processing many resources efficiently:

```javascript
new TTLPlugin({
  batchSize: 2000,            // Very large batches

  resources: {
    // Minute-granularity resources
    verification_codes: { ttl: 900, onExpire: 'hard-delete' },
    reset_tokens: { ttl: 1800, onExpire: 'hard-delete' },

    // Hour-granularity resources
    sessions: { ttl: 3600, onExpire: 'soft-delete' },
    temp_uploads: { ttl: 7200, onExpire: 'hard-delete' },

    // Day-granularity resources
    orders: { ttl: 2592000, onExpire: 'archive', archiveResource: 'old_orders' }
  },

  schedules: {
    minute: '*/20 * * * * *',   // Every 20 seconds (fewer API calls)
    hour: '*/20 * * * *',       // Every 20 minutes
    day: '0 3 * * *'            // Daily at 3 AM
  }
});
```

**Use when:** Managing many resources with different TTL requirements

---

## Environment-Based Configuration

Load configuration from environment variables:

```javascript
const ttlPlugin = new TTLPlugin({
  batchSize: parseInt(process.env.TTL_BATCH_SIZE || '100'),
  logLevel: process.env.TTL_VERBOSE === 'true' ? 'debug' : 'info',

  resources: {
    sessions: {
      ttl: parseInt(process.env.SESSION_TTL || '86400'),
      onExpire: process.env.SESSION_EXPIRE_STRATEGY || 'soft-delete'
    }
  },

  enableCoordinator: process.env.NODE_ENV === 'production'
});
```

**.env file example:**
```bash
TTL_BATCH_SIZE=500
TTL_VERBOSE=false
SESSION_TTL=86400
SESSION_EXPIRE_STRATEGY=soft-delete
```

---

## Granularity Auto-Detection

TTL Plugin automatically detects cleanup granularity based on TTL value:

| TTL Range | Granularity | Checks Every | Use Case |
|-----------|------------|--------------|----------|
| < 60 seconds | minute | 10 seconds | Tokens, codes |
| 60s - 3600s | minute | 10 seconds | Quick cleanup |
| 3600s - 86400s | hour | 10 minutes | Sessions, temp files |
| > 86400s | day | Daily at midnight | Archive, long-term |

**Override granularity** with custom schedules:

```javascript
new TTLPlugin({
  resources: {
    verification_codes: { ttl: 300, onExpire: 'hard-delete' }
  },

  schedules: {
    // Override to check minute-granularity every 30 seconds instead of default 10s
    minute: '*/30 * * * * *'
  }
});
```

---

## Custom Cleanup Schedules

Use cron expressions to customize when cleanup runs. **Supports second-level granularity!**

### Cron Expression Format

```
┌───────────── second (0 - 59)
│ ┌───────────── minute (0 - 59)
│ │ ┌───────────── hour (0 - 23)
│ │ │ ┌───────────── day of month (1 - 31)
│ │ │ │ ┌───────────── month (1 - 12)
│ │ │ │ │ ┌───────────── day of week (0 - 6) (0 = Sunday)
│ │ │ │ │ │
│ │ │ │ │ │
* * * * * *
```

### Common Schedule Examples

```javascript
schedules: {
  // Every 10 seconds (minute granularity)
  minute: '*/10 * * * * *',

  // Every 5 minutes (hour granularity)
  hour: '*/5 * * * *',

  // Daily at 2 AM (day granularity)
  day: '0 2 * * *',

  // Sundays at 3 AM (week granularity)
  week: '0 3 * * 0',

  // Weekdays only (Mon-Fri)
  minute: '*/10 * * * * 1-5',

  // Business hours only (9 AM - 5 PM weekdays)
  hour: '0 9-17 * * 1-5',

  // Every 30 seconds
  minute: '*/30 * * * * *',

  // Every hour at :15
  hour: '15 * * * *',

  // Midnight daily
  day: '0 0 * * *',

  // Every 6 hours
  day: '0 */6 * * *'
}
```

### When to Customize Schedules

- **More frequent:** Reduce cleanup delay for time-sensitive data
  ```javascript
  minute: '*/5 * * * * *'    // Every 5 seconds (very aggressive)
  ```
- **Less frequent:** Reduce S3 API calls for large datasets
  ```javascript
  day: '0 */6 * * *'         // Every 6 hours
  ```
- **Specific times:** Run cleanup during off-peak hours
  ```javascript
  day: '0 2 * * *'           // Daily at 2 AM
  ```
- **Business hours only:** Configure weekday/hour restrictions
  ```javascript
  hour: '0 9-17 * * 1-5'     // Mon-Fri, 9 AM - 5 PM
  ```

---

## Runtime Configuration

Configuration cannot be changed after plugin initialization. Set all options during plugin creation:

```javascript
// ✅ Correct: Set during plugin creation
const ttlPlugin = new TTLPlugin({
  batchSize: 200,
  resources: { ... }
});
await db.usePlugin(ttlPlugin);

// ❌ Wrong: Cannot modify after initialization
ttlPlugin.batchSize = 300;  // Won't work!
```

---

## Configuration Validation

The plugin validates configuration at startup:

```javascript
// ✅ Valid
new TTLPlugin({
  batchSize: 100,
  resources: {
    sessions: { ttl: 3600, onExpire: 'soft-delete' }
  }
});

// ❌ Invalid - will throw error
new TTLPlugin({
  batchSize: 'hundred',    // Must be number
  resources: {
    sessions: { onExpire: 'invalid-strategy' }  // Invalid strategy
  }
});
```

**Common validation errors:**
```
Error: Invalid batchSize: must be 1-10000
Error: Invalid onExpire strategy: must be one of 'soft-delete', 'hard-delete', 'archive', 'callback'
Error: TTL must be positive number or provide field name
Error: archiveResource required for 'archive' strategy
Error: callback function required for 'callback' strategy
```

---

## Performance Tuning

### Optimize for Speed

If cleanup frequency is critical:

```javascript
{
  batchSize: 1000,            // Larger batches
  schedules: {
    minute: '*/5 * * * * *',  // Very frequent checks
    hour: '*/5 * * * *'       // Every 5 minutes
  }
}
```

### Optimize for Cost

If S3 API costs are a concern:

```javascript
{
  batchSize: 2000,            // Larger batches (fewer calls)
  schedules: {
    day: '0 3 * * *'          // Once daily
  }
}
```

### Optimize for Memory

If running in memory-constrained environment:

```javascript
{
  batchSize: 50,              // Smaller batches
  logLevel: 'silent',             // No logging overhead
  schedules: {
    hour: '*/30 * * * *'      // Less frequent checks
  }
}
```

---

## Coordinator Mode Configuration

For multi-pod/multi-instance deployments:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableCoordinator` | boolean | `true` | Enable automatic coordinator election |
| `heartbeatInterval` | number | `30000` | Heartbeat frequency (ms) |
| `coldStartObservationWindow` | number | `15000` | Cold start observation phase duration (ms) |
| `skipColdStart` | boolean | `false` | Skip cold start (testing only!) |

```javascript
new TTLPlugin({
  enableCoordinator: true,
  heartbeatInterval: 30000,
  coldStartObservationWindow: 15000,

  resources: { ... }
});
```

**Learn more:** See [Coordinator Mode](../README.md#-coordinator-mode) for multi-pod election details.

---

## ✅ Configuration Checklist

Before deploying, verify:

- [ ] All resource TTLs are set correctly
- [ ] All `onExpire` strategies are valid
- [ ] Archive resources exist (if using `archive` strategy)
- [ ] Callback functions are defined (if using `callback` strategy)
- [ ] Schedules use valid cron expressions
- [ ] `batchSize` is appropriate for your data volume
- [ ] Coordinator mode is enabled for multi-pod deployments
- [ ] Environment variables are correctly set
- [ ] TTL values make sense for your use case
- [ ] No sensitive data in debug logs (if enabled)

---

## 📚 See Also

- **[Usage Patterns](./usage-patterns.md)** - Examples and learning journey
- **[Best Practices](./best-practices.md)** - Tips, troubleshooting, FAQ
- **[API Reference](../README.md#-api-reference)** - Plugin methods
- **[Coordinator Mode](../README.md#-coordinator-mode)** - Multi-pod deployment

---

**Questions about configuration?** → Check [FAQ](./best-practices.md#-faq)
