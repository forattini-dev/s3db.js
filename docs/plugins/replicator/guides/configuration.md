# ⚙️ Configuration Guide

**Prev:** [← Getting Started](./getting-started.md)
**Next:** [Usage Patterns →](./usage-patterns.md)
**Main:** [← Replicator Plugin](../README.md) | **All guides:** [Index](../README.md#-documentation-guides)

> **In this guide:**
> - Default configuration object
> - All plugin-level options
> - All driver configurations
> - Schema sync setup
> - Performance tuning

**Time to read:** 15 minutes
**Difficulty:** Intermediate

---

## Default Configuration

```javascript
new ReplicatorPlugin({
  // Enable/disable
  enabled: true,

  // Error handling
  maxRetries: 3,
  timeout: 30000,

  // Logging
  logLevel: 'silent',
  persistReplicatorLog: false,
  replicatorLogResource: 'plg_replicator_logs',
  logErrors: true,

  // Performance
  replicatorConcurrency: 5,
  stopConcurrency: 5,
  batchSize: 100,

  // Your replicators (REQUIRED)
  replicators: [
    // Add one or more replicators here
    // See sections below for each driver
  ]
})
```

---

## Plugin-Level Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable all replication |
| `logLevel` | boolean | `false` | Log all replication attempts |
| `persistReplicatorLog` | boolean | `false` | Store logs in database |
| `replicatorLogResource` | string | `'plg_replicator_logs'` | Log resource name |
| `logErrors` | boolean | `true` | Log failed operations |
| `replicatorConcurrency` | number | `5` | Max parallel replicators per event |
| `stopConcurrency` | number | `5` | Max parallel stop operations |
| `batchSize` | number | `100` | Batch size for sync operations |
| `maxRetries` | number | `3` | Retry attempts for failures |
| `timeout` | number | `30000` | Per-operation timeout (ms) |
| `replicators` | array | `[]` | Array of replicator configs (REQUIRED) |

### Concurrency Options

Control how many replicators process events in parallel:

```javascript
new ReplicatorPlugin({
  // Default: 5 replicators processing simultaneously
  replicatorConcurrency: 5,

  // For high-volume: increase concurrency
  replicatorConcurrency: 20,

  // For low-resource: decrease concurrency
  replicatorConcurrency: 1,

  // Shutdown: stop replicators in parallel
  stopConcurrency: 5
})
```

### Logging Options

```javascript
new ReplicatorPlugin({
  // Console logging
  logLevel: 'debug',  // Detailed logs for every operation

  // Database logging
  persistReplicatorLog: true,  // Store in database
  logErrors: true,             // Log failures only (or all?)

  // Custom log resource name
  replicatorLogResource: 'etl_replication_logs'
})
```

### Retry Strategy

```javascript
new ReplicatorPlugin({
  maxRetries: 3,        // Retry 3 times
  timeout: 30000        // 30 second timeout

  // Retry strategy (exponential backoff)
  // Attempt 1: Immediate
  // Attempt 2: ~1 second delay
  // Attempt 3: ~2 second delay
  // Attempt 4: ~4 second delay
})
```

---

## Driver Configuration Patterns

### Pattern 1: S3DB Backup

Simple backup to another S3 bucket:

```javascript
new ReplicatorPlugin({
  replicators: [{
    driver: 's3db',
    resources: ['users', 'orders'],
    config: {
      connectionString: 's3://key:secret@backup-bucket/database'
    }
  }]
})
```

### Pattern 2: PostgreSQL Analytics

Real-time analytics with schema sync:

```javascript
new ReplicatorPlugin({
  replicators: [{
    driver: 'postgresql',
    resources: {
      orders: 'analytics_orders',  // Map to different table
      users: 'analytics_users'
    },
    config: {
      connectionString: process.env.ANALYTICS_DB,
      schemaSync: {
        enabled: true,             // Auto-create tables
        strategy: 'alter',         // Add missing columns
        onMismatch: 'warn'         // Warn on mismatch
      }
    }
  }]
})
```

### Pattern 3: Multi-Destination

Replicate to multiple targets:

```javascript
new ReplicatorPlugin({
  replicators: [
    // S3DB backup
    {
      driver: 's3db',
      resources: ['users', 'orders'],
      config: { connectionString: 's3://backup/db' }
    },
    // PostgreSQL analytics
    {
      driver: 'postgresql',
      resources: ['orders'],
      config: { connectionString: process.env.POSTGRES_URL }
    },
    // BigQuery dashboards
    {
      driver: 'bigquery',
      resources: ['orders'],
      config: { projectId: 'my-project', dataset: 'dashboards' }
    },
    // SQS events
    {
      driver: 'sqs',
      resources: ['orders'],
      config: { queueUrl: process.env.SQS_URL, region: 'us-east-1' }
    }
  ]
})
```

---

## Schema Sync Configuration

### Enable Schema Sync

Automatically create and sync database tables:

```javascript
{
  driver: 'postgresql',
  config: {
    connectionString: 'postgresql://...',
    schemaSync: {
      enabled: true,              // Enable auto-sync
      strategy: 'alter',          // How to sync
      onMismatch: 'error',        // What to do on mismatch
      autoCreateTable: true,      // Create table if missing
      autoCreateColumns: true     // Add missing columns
    }
  }
}
```

### Sync Strategies

**`alter` (recommended):**
- Creates table if missing
- Adds missing columns via `ALTER TABLE`
- Preserves existing data
- Safe for production

**`drop-create`:**
- Drops and recreates table
- **Loses all data!**
- Only for development

**`validate-only`:**
- Checks schema matches
- Never modifies database
- Fails if mismatch detected

### Schema Mismatch Behavior

| Value | Behavior |
|-------|----------|
| `error` | Throws error, stops initialization |
| `warn` | Logs warning, continues anyway |
| `ignore` | Silently ignores mismatch |

### Type Mapping

**S3DB → PostgreSQL:**

| S3DB Type | PostgreSQL | Notes |
|-----------|-----------|-------|
| `string` | `TEXT` | Unlimited length |
| `string\|maxlength:255` | `VARCHAR(255)` | Fixed length |
| `number` | `DOUBLE PRECISION` | Floating point |
| `boolean` | `BOOLEAN` | True/False |
| `object` / `json` | `JSONB` | JSON binary |
| `array` | `JSONB` | JSON binary |
| `embedding:1536` | `JSONB` | JSON binary |
| `ip4` | `INET` | IPv4 address |
| `ip6` | `INET` | IPv6 address |
| `secret` | `TEXT` | Encrypted |
| `uuid` | `UUID` | UUID type |
| `date` | `DATE` | Date only |
| `datetime` | `TIMESTAMPTZ` | Timestamp with timezone |

**S3DB → MySQL:**

| S3DB Type | MySQL | Notes |
|-----------|-------|-------|
| `string` | `TEXT` | Unlimited |
| `string\|maxlength:255` | `VARCHAR(255)` | Fixed |
| `number` | `DOUBLE` | Floating point |
| `boolean` | `TINYINT(1)` | 0 or 1 |
| `object` / `json` | `JSON` | JSON type |
| `array` | `JSON` | JSON type |
| `embedding:1536` | `JSON` | JSON type |

**S3DB → BigQuery:**

| S3DB Type | BigQuery | Notes |
|-----------|----------|-------|
| `string` | `STRING` | Text |
| `number` | `INT64` / `FLOAT64` | Integer or float |
| `boolean` | `BOOL` | True/False |
| `object` / `json` | `JSON` | JSON type |
| `array` | `JSON` | JSON type |
| `embedding:1536` | `JSON` | JSON type |
| `date` | `DATE` | Date |
| `datetime` | `TIMESTAMP` | Timestamp |

### Complete Schema Sync Example

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email|maxlength:255',
    name: 'string|required',
    age: 'number',
    active: 'boolean',
    metadata: 'json',
    ipAddress: 'ip4'
  }
});

await db.usePlugin(new ReplicatorPlugin({
  replicators: [{
    driver: 'postgresql',
    config: {
      connectionString: 'postgresql://user:pass@localhost/analytics',
      schemaSync: {
        enabled: true,
        strategy: 'alter',
        onMismatch: 'error'
      }
    },
    resources: { users: 'users_table' }
  }]
}));

// PostgreSQL table created automatically:
// CREATE TABLE users_table (
//   id VARCHAR(255) PRIMARY KEY,
//   email VARCHAR(255) NOT NULL,
//   name TEXT NOT NULL,
//   age DOUBLE PRECISION,
//   active BOOLEAN,
//   metadata JSONB,
//   ip_address INET,
//   created_at TIMESTAMPTZ DEFAULT NOW(),
//   updated_at TIMESTAMPTZ DEFAULT NOW()
// );

// Add new field to S3DB resource
await users.updateAttributes({
  ...users.attributes,
  phoneNumber: 'string|maxlength:20'
});

// Re-initialize replicator
// → Column "phone_number" automatically added
```

---

## Driver Configuration Reference

### S3DB (Cloud Backup)

```javascript
{
  driver: 's3db',
  resources: ['users', 'orders'],
  config: {
    connectionString: 's3://key:secret@bucket/database'
  }
}
```

### PostgreSQL

```javascript
{
  driver: 'postgresql',
  resources: { users: 'users_table' },
  config: {
    connectionString: 'postgresql://user:pass@localhost/db',
    schemaSync: {
      enabled: true,
      strategy: 'alter',
      onMismatch: 'warn'
    }
  }
}
```

### MySQL / MariaDB / PlanetScale

```javascript
{
  driver: 'mysql',
  resources: ['users', 'orders'],
  config: {
    connectionString: 'mysql://user:pass@localhost/db'
  }
}
```

### BigQuery

```javascript
{
  driver: 'bigquery',
  resources: ['orders', 'users'],
  config: {
    projectId: 'my-gcp-project',
    dataset: 'analytics',
    location: 'US',
    credentials: JSON.parse(process.env.GCP_CREDENTIALS),
    mutabilityMode: 'append-only'  // or 'mutable', 'immutable'
  }
}
```

### SQS (Event Queue)

```javascript
{
  driver: 'sqs',
  resources: ['orders'],
  config: {
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456/queue.fifo',
    region: 'us-east-1',
    messageGroupId: 's3db-events',
    deduplicationId: true
  }
}
```

### Webhook

```javascript
{
  driver: 'webhook',
  resources: ['users'],
  config: {
    url: 'https://api.example.com/webhook',
    method: 'POST',  // HTTP method (default: POST)

    // Authentication (bearer, basic, or apikey)
    auth: {
      type: 'bearer',
      token: process.env.WEBHOOK_TOKEN
    },

    // Custom headers
    headers: {
      'X-Custom-Header': 'value'
    },

    // Timeouts and retries
    timeout: 5000,
    retries: 3,
    retryDelay: 1000,
    retryStrategy: 'exponential',  // 'fixed' or 'exponential'
    retryOnStatus: [429, 500, 502, 503, 504],

    // Batch mode (optional)
    batch: false,
    batchSize: 100
  }
}
```

#### Webhook Authentication Types

```javascript
// Bearer Token
auth: { type: 'bearer', token: 'your-token' }

// Basic Auth
auth: { type: 'basic', username: 'user', password: 'pass' }

// API Key
auth: { type: 'apikey', header: 'X-API-Key', value: 'your-key' }
```

#### Retry Configuration

The webhook replicator uses smart retry logic with:
- **Exponential backoff** with jitter to prevent thundering herd
- **Retry-After header** support for rate limiting
- **Configurable status codes** to retry on

```javascript
{
  retries: 3,                // Max retry attempts
  retryDelay: 1000,          // Initial delay in ms
  retryStrategy: 'exponential',  // Doubles delay each retry
  retryOnStatus: [429, 500, 502, 503, 504]
}
```

> **Note:** If you have `recker` installed, the webhook replicator will use it for enhanced HTTP features (connection pooling, keep-alive). Otherwise, it falls back to native fetch.

### MongoDB

```javascript
{
  driver: 'mongodb',
  resources: {
    users: 'users_collection',
    orders: 'orders_collection'
  },
  config: {
    connectionString: 'mongodb://user:pass@localhost/database',
    database: 'myapp'
  }
}
```

### DynamoDB

```javascript
{
  driver: 'dynamodb',
  resources: {
    users: 'users_table',
    orders: 'orders_table'
  },
  config: {
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET
    }
  }
}
```

### Turso (SQLite Edge)

```javascript
{
  driver: 'turso',
  resources: ['users', 'orders'],
  config: {
    url: 'libsql://your-database-url.turso.io',
    authToken: process.env.TURSO_AUTH_TOKEN
  }
}
```

---

## Resource Configuration Options

### Simple Array Syntax

Replicate resources with same name:

```javascript
resources: ['users', 'orders', 'products']
```

### Object Mapping Syntax

Map source → destination:

```javascript
resources: {
  users: 'people',
  orders: 'order_history',
  products: 'items'
}
```

### Advanced Configuration

```javascript
resources: {
  users: {
    resource: 'people_table',           // Destination name
    actions: ['inserted', 'updated'],   // Only these operations
    transform: (data) => ({             // Transform data
      user_id: data.id,
      email: data.email,
      name: `${data.firstName} ${data.lastName}`
    }),
    shouldReplicate: (data) => {        // Filter records
      return data.active === true;
    }
  }
}
```

### Transformation Example

```javascript
resources: {
  orders: {
    resource: 'analytics_orders',
    transform: (data) => ({
      order_id: data.id,
      total_usd: parseFloat(data.total),
      customer_id: data.userId,
      created_date: new Date(data.createdAt).toISOString().split('T')[0],
      status_upper: data.status.toUpperCase(),
      // Omit: sensitive fields, internal data
    })
  }
}
```

### Filtering Example

```javascript
resources: {
  orders: {
    resource: 'premium_orders',
    shouldReplicate: (data) => {
      // Only replicate orders > $1000
      return data.total > 1000;
    }
  }
}
```

### Selective Actions

```javascript
resources: {
  users: {
    actions: ['inserted']             // Only new users
  },
  orders: {
    actions: ['inserted', 'updated']  // New and updates, not deletes
  },
  logs: {
    actions: []                       // Don't replicate at all
  }
}
```

---

## Performance Tuning

### Batch Size

Adjust for large bulk operations:

```javascript
new ReplicatorPlugin({
  batchSize: 500,  // Default: 100
  // Larger = more memory, faster bulk operations
  // Smaller = less memory, slower bulk operations
})
```

### Concurrency

Control parallel replicators:

```javascript
new ReplicatorPlugin({
  replicatorConcurrency: 20,  // Default: 5
  // More = faster replication
  // Less = lower CPU/memory usage
})
```

### Timeout

Adjust for slow networks:

```javascript
new ReplicatorPlugin({
  timeout: 60000  // 60 seconds (default: 30s)
})
```

---

## Production Checklist

- ✅ Test all replicators work
- ✅ Configure `maxRetries` appropriately
- ✅ Enable `persistReplicatorLog` for debugging
- ✅ Set `logLevel: 'silent'` (only enable in dev)
- ✅ Configure appropriate `replicatorConcurrency`
- ✅ Test schema sync if using SQL databases
- ✅ Setup monitoring on replication errors
- ✅ Plan for retry/recovery of failed operations
- ✅ Document which resources replicate where
- ✅ Test failover scenarios

---

**Prev:** [← Getting Started](./getting-started.md)
**Next:** [Usage Patterns →](./usage-patterns.md)
**Main:** [← Replicator Plugin](../README.md)
