# 🔄 Replicator Plugin

## ⚡ TLDR

**Real-time CDC** (Change Data Capture) replication to multiple destinations - **each operation is replicated individually** in near real-time.

**1 line to get started:**
```javascript
await db.usePlugin(new ReplicatorPlugin({ replicators: [{ driver: 's3db', resources: ['users'], config: { connectionString: 's3://...' }}] }));
```

**Key features:**
- ✅ **Real-Time CDC**: Each insert/update/delete replicated individually (<10ms latency)
- ✅ Multi-target: S3DB, BigQuery, PostgreSQL, MySQL, MariaDB, PlanetScale, Turso, DynamoDB, MongoDB, SQS, Webhooks
- ✅ Data transformation with custom functions
- ✅ Automatic retry with exponential backoff
- ✅ Dead letter queue for failures
- ✅ Complete event monitoring

**When to use:**
- 📊 Real-time analytics pipelines
- 🔄 Event sourcing / message queues
- 🌍 Multi-destination sync
- 📈 Continuous audit trail

**Performance & Maintenance:**
```javascript
// ❌ Without replicator: Manual cron job exporting to PostgreSQL
// - Runs once daily at midnight
// - Data always 24h delayed
// - Breaks when schema changes
// - 4 hours/week maintenance

// ✅ With replicator: Automatic real-time sync
await users.insert({ name: 'John' }); // Automatically replicated
// - Data available in ~2 seconds
// - Zero maintenance
// - Doesn't break with schema changes (with transform)
// - Multiple simultaneous destinations
```

---

## 🆚 ReplicatorPlugin vs BackupPlugin

**ReplicatorPlugin** provides **real-time CDC** (Change Data Capture):
- ✅ Replicates **each operation** individually (insert/update/delete)
- ✅ Near real-time (<10ms latency per operation)
- ✅ Processes 1 record at a time
- ✅ Multiple destinations: PostgreSQL, MySQL, MariaDB, PlanetScale, Turso, DynamoDB, MongoDB, BigQuery, SQS, Webhooks
- ✅ Perfect for: analytics pipelines, event sourcing, multi-destination sync

**BackupPlugin** creates **periodic snapshots** (batch):
- ✅ Complete snapshots of ALL resources at specific timestamps
- ✅ Scheduled (cron) or manual (daily/weekly/monthly)
- ✅ Exports entire datasets with streaming (constant ~10KB memory)
- ✅ JSONL.gz format for portability
- ✅ Perfect for: disaster recovery, compliance, point-in-time recovery

| Aspect | ReplicatorPlugin | BackupPlugin |
|--------|-----------------|--------------|
| **Timing** | Every operation | Scheduled (hourly/daily) |
| **Granularity** | 1 record at a time | All resources at once |
| **Latency** | Milliseconds | Minutes/hours |
| **Use Case** | Real-time analytics | Disaster recovery |
| **Destinations** | PostgreSQL, MySQL, DynamoDB, MongoDB, BigQuery, SQS, etc | JSONL.gz files |

**Key Difference:**
```javascript
// ReplicatorPlugin: Every operation is replicated
await users.insert({ name: 'John' });  // → Replicated to all destinations in ~2s
await users.update('1', { name: 'Jane' });  // → Replicated in ~2s
await users.delete('2');  // → Replicated in ~2s

// BackupPlugin: Scheduled snapshots of entire database
await backupPlugin.backup('full');  // → Snapshot of ALL resources at this moment
```

**Use Both Together:**
```javascript
// ReplicatorPlugin for real-time analytics
new ReplicatorPlugin({
  replicators: [{
    driver: 'bigquery',
    resources: ['events', 'users'],
    config: { projectId: 'my-project', dataset: 'analytics' }
  }]
})

// BackupPlugin for disaster recovery
new BackupPlugin({
  driver: 's3',
  config: { bucket: 'backups' },
  schedule: { daily: '0 2 * * *' }  // 2am daily
})
```

📚 See [BackupPlugin docs](./backup.md) for periodic snapshots and disaster recovery.

---

## 🔧 Schema Sync (Auto-create Tables)

**Automatically create and sync SQL database tables** based on your S3DB resource schemas. No manual DDL required!

**Supported databases:** PostgreSQL, MySQL, MariaDB, **BigQuery**, **PlanetScale** (MySQL serverless), **Turso** (SQLite edge)

### Quick Example

```javascript
new ReplicatorPlugin({
  replicators: [{
    driver: 'postgres',
    config: {
      connectionString: 'postgresql://user:pass@localhost/db',
      schemaSync: {
        enabled: true,              // Enable schema sync
        strategy: 'alter',          // 'alter' | 'drop-create' | 'validate-only'
        onMismatch: 'error',        // 'error' | 'warn' | 'ignore'
        autoCreateTable: true,      // Create table if missing
        autoCreateColumns: true     // Add missing columns
      }
    },
    resources: { users: 'users_table' }
  }]
})
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable automatic schema management |
| `strategy` | `string` | `'alter'` | Sync strategy (see below) |
| `onMismatch` | `string` | `'error'` | Action on schema mismatch |
| `autoCreateTable` | `boolean` | `true` | Auto-create table if not exists |
| `autoCreateColumns` | `boolean` | `true` | Auto-add missing columns (with `alter`) |
| `dropMissingColumns` | `boolean` | `false` | Remove extra columns (dangerous!) |

### Strategies

**`alter`** - Incremental changes (recommended):
- Creates table if missing
- Adds missing columns via `ALTER TABLE`
- Preserves existing data
- Safe for production

**`drop-create`** - Full recreate (dangerous):
- Drops entire table and recreates
- **Loses all existing data!**
- Use only in development/testing

**`validate-only`** - Check only:
- Validates schema matches
- Throws error if mismatch detected
- Never modifies database
- Use in strict production environments

### onMismatch Behaviors

| Value | Behavior |
|-------|----------|
| `error` | Throws error and stops initialization |
| `warn` | Logs warning but continues |
| `ignore` | Silently ignores mismatch |

### Type Mapping

| S3DB Type | PostgreSQL | MySQL/MariaDB | BigQuery |
|-----------|------------|---------------|----------|
| `string` | `TEXT` | `TEXT` | `STRING` |
| `string\|maxlength:255` | `VARCHAR(255)` | `VARCHAR(255)` | `STRING` |
| `number` | `DOUBLE PRECISION` | `DOUBLE` | `FLOAT64` / `INT64` |
| `boolean` | `BOOLEAN` | `TINYINT(1)` | `BOOL` |
| `object` / `json` | `JSONB` | `JSON` | `JSON` |
| `array` | `JSONB` | `JSON` | `JSON` |
| `embedding:1536` | `JSONB` | `JSON` | `JSON` |
| `ip4` | `INET` | `VARCHAR(15)` | `STRING` |
| `ip6` | `INET` | `VARCHAR(45)` | `STRING` |
| `secret` | `TEXT` | `TEXT` | `STRING` |
| `uuid` | `UUID` | `CHAR(36)` | `STRING` |
| `date` | `DATE` | `DATE` | `DATE` |
| `datetime` | `TIMESTAMPTZ` | `DATETIME` | `TIMESTAMP` |

### Events

Listen to schema sync events:

```javascript
replicator.on('table_created', ({ tableName, attributes }) => {
  console.log(`Table ${tableName} created with columns: ${attributes.join(', ')}`);
});

replicator.on('table_altered', ({ tableName, addedColumns }) => {
  console.log(`Added ${addedColumns} column(s) to ${tableName}`);
});

replicator.on('table_recreated', ({ tableName }) => {
  console.log(`Table ${tableName} dropped and recreated`);
});

replicator.on('schema_sync_completed', ({ resources }) => {
  console.log(`Schema sync completed for: ${resources.join(', ')}`);
});
```

### Complete Example

```javascript
// Define S3DB resource
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|maxlength:255',
    name: 'string|required',
    age: 'number',
    active: 'boolean',
    metadata: 'json'
  }
});

// Configure replicator with schema sync
await db.usePlugin(new ReplicatorPlugin({
  replicators: [{
    driver: 'postgres',
    config: {
      connectionString: 'postgresql://localhost/analytics',
      schemaSync: {
        enabled: true,
        strategy: 'alter',
        onMismatch: 'error'
      }
    },
    resources: { users: 'users_table' }
  }]
}));

// Table automatically created:
// CREATE TABLE users_table (
//   id VARCHAR(255) PRIMARY KEY,
//   email VARCHAR(255) NOT NULL,
//   name TEXT NOT NULL,
//   age DOUBLE PRECISION,
//   active BOOLEAN,
//   metadata JSONB,
//   created_at TIMESTAMPTZ DEFAULT NOW(),
//   updated_at TIMESTAMPTZ DEFAULT NOW()
// );

// Add new field to resource
await users.updateAttributes({
  ...users.attributes,
  phoneNumber: 'string|maxlength:20'  // NEW FIELD
});

// Re-initialize replicator
// → Column "phoneNumber" automatically added via ALTER TABLE

await users.insert({ email: 'john@example.com', name: 'John' });
// → Automatically replicated to PostgreSQL
```

📚 See [Example 46](../examples/e46-replicator-schema-sync.js) for complete schema sync demonstration.

---

## ⚡ Quick Start

Get started with real-time replication in under 2 minutes:

```javascript
import { Database, ReplicatorPlugin } from 's3db.js';

// Step 1: Create database
const db = new Database({ connectionString: 's3://key:secret@bucket' });
await db.connect();

// Step 2: Configure replicator (replicate to another S3DB instance)
const replicatorPlugin = new ReplicatorPlugin({
  replicators: [{
    driver: 's3db',
    resources: ['users'],  // Which resources to replicate
    config: {
      connectionString: 's3://key:secret@replica-bucket'  // Destination S3DB
    }
  }]
});

await db.usePlugin(replicatorPlugin);

// Step 3: Create resource
const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|required'
  }
});

// Step 4: All operations are automatically replicated!
await users.insert({ name: 'Alice', email: 'alice@example.com' });
// → Replicated to replica-bucket in ~2s

await users.insert({ name: 'Bob', email: 'bob@example.com' });
// → Replicated to replica-bucket in ~2s

await users.update('user-1', { name: 'Alice Updated' });
// → Update replicated in ~2s

await users.delete('user-2');
// → Delete replicated in ~2s

// Step 5: Monitor replication status
replicatorPlugin.on('plg:replicator:replicated', (event) => {
  console.log('Replicated:', event);
  // { operation: 'inserted', resource: 'users', recordId: 'user-1', duration: 156 }
});

replicatorPlugin.on('replicationError', (error) => {
  console.error('Replication failed:', error);
});

console.log('All operations replicated in real-time! ✅');
```

**What just happened:**
1. ✅ ReplicatorPlugin installed with s3db driver
2. ✅ Configured to replicate `users` resource to another S3DB instance
3. ✅ All insert/update/delete operations automatically replicated
4. ✅ Near real-time sync (<10ms latency per operation)

**Next steps:**
- Try other drivers: PostgreSQL, BigQuery, SQS (see [Replicator Drivers](#replicator-drivers))
- Add data transformation (see [Usage Examples](#usage-examples))
- Configure retry and dead letter queue (see [Configuration Options](#configuration-options))

---

## 📋 Table of Contents

- [Overview](#overview)
- [Usage Journey](#usage-journey) - **Start here for step-by-step learning**
- [Installation & Setup](#installation--setup)
- [Configuration Options](#configuration-options)
- [Replicator Drivers](#replicator-drivers)
  - [S3DB Replicator](#️-s3db-replicator) - Replicate to another S3DB instance
  - [SQS Replicator](#-sqs-replicator) - Send to AWS SQS queues
  - [Webhook Replicator](#-webhook-replicator) - HTTP/HTTPS webhooks
  - [BigQuery Replicator](#-bigquery-replicator) - Google BigQuery integration
  - [MySQL / MariaDB Replicator](#-mysql--mariadb-replicator) - MySQL & MariaDB database integration
  - [DynamoDB Replicator](#-dynamodb-replicator) - AWS DynamoDB integration
  - [MongoDB Replicator](#-mongodb-replicator) - MongoDB database integration
  - [PostgreSQL Replicator](#-postgresql-replicator) - PostgreSQL database integration
- [API Reference](#api-reference)
- [Best Practices](#best-practices)

---

## Overview

The Replicator Plugin provides **enterprise-grade data replication** that synchronizes your s3db data in real-time to multiple targets including other S3DB instances, SQS queues, relational databases (PostgreSQL, MySQL, MariaDB), NoSQL databases (DynamoDB, MongoDB), BigQuery, and more. It features robust error handling, advanced transformation capabilities, and comprehensive monitoring.

### How It Works

1. **Real-time Monitoring**: Listens to all database operations (insert, update, delete)
2. **Near Real-Time CDC**: Replicates each record individually as operations occur (<10ms latency)
3. **Multi-Target Support**: Replicates to multiple destinations simultaneously
4. **Data Transformation**: Transform data before replication using custom functions
5. **Error Resilience**: Automatic retries and comprehensive error reporting
6. **Flexible Configuration**: Multiple resource mapping syntaxes for complex scenarios

> 🔄 **Real-Time CDC**: ReplicatorPlugin provides Change Data Capture - every insert/update/delete is replicated individually in near real-time.

---

## Usage Journey

### Level 1: Simple Backup (S3DB → S3DB)

Start here for basic backup between buckets:

```javascript
// Step 1: Configure backup to another bucket
new ReplicatorPlugin({
  replicators: [{
    driver: 's3db',
    resources: ['users'],  // Replicate only users
    config: {
      connectionString: 's3://KEY:SECRET@backup-bucket/database'
    }
  }]
})

// Step 2: Use normally - backup is automatic
await users.insert({ name: 'John', email: 'john@example.com' });
// Automatically replicated to backup-bucket in ~2s
```

**What you get:** Automatic real-time backup, zero additional code.

### Level 2: Add Data Transformation

When you need to transform data before replicating:

```javascript
new ReplicatorPlugin({
  replicators: [{
    driver: 's3db',
    resources: {
      users: {
        resource: 'users_backup',  // Different name in destination
        transform: (data) => ({
          id: data.id,
          name: data.name,
          email: data.email,
          // Remove sensitive fields
          // password: OMITTED
          created_at: new Date().toISOString()
        }),
        actions: ['inserted', 'updated']  // Don't replicate deletes
      }
    },
    config: { connectionString: 's3://...' }
  }]
})
```

**What you get:** Full control over what and how is replicated.

### Level 3: Multi-Destination Replication

For analytics, webhooks and multiple systems:

```javascript
new ReplicatorPlugin({
  replicators: [
    // 1. Backup to S3
    {
      driver: 's3db',
      resources: ['users', 'orders'],
      config: { connectionString: 's3://backup-bucket/...' }
    },

    // 2. Analytics in PostgreSQL
    {
      driver: 'postgresql',
      resources: {
        orders: {
          resource: 'analytics_orders',
          transform: (data) => ({
            order_id: data.id,
            total: data.total,
            created_at: data.createdAt,
            // Fields optimized for analytics
          })
        }
      },
      config: {
        connectionString: process.env.POSTGRES_URL
      }
    },

    // 3. Event stream to SQS
    {
      driver: 'sqs',
      resources: ['orders'],
      config: {
        queueUrl: process.env.SQS_QUEUE_URL,
        region: 'us-east-1'
      }
    },

    // 4. Webhook to external CRM
    {
      driver: 'webhook',
      resources: {
        users: {
          actions: ['inserted'],  // Only new users
          transform: (data) => ({
            user_id: data.id,
            email: data.email,
            name: data.name
          })
        }
      },
      config: {
        url: 'https://crm.example.com/api/users',
        headers: { 'Authorization': `Bearer ${process.env.CRM_TOKEN}` }
      }
    }
  ]
})
```

**What you get:** One write, four destinations. Zero ETL script maintenance.

### Level 4: Error Handling & Monitoring

Add resilience and observability:

```javascript
new ReplicatorPlugin({
  verbose: true,  // Detailed logs
  persistReplicatorLog: true,  // Store logs in database
  maxRetries: 3,  // 3 attempts before failing

  replicators: [{
    driver: 'postgresql',
    resources: ['orders'],
    config: { connectionString: process.env.POSTGRES_URL }
  }]
})

// Monitor errors
db.on('replicator:error', ({ error, resource, data }) => {
  console.error(`Failed to replicate ${resource}:`, error.message);
  // Send to Sentry/DataDog
  Sentry.captureException(error, { extra: { resource, data } });
});

// Monitor success
db.on('replicator:success', ({ resource, destination }) => {
  console.log(`✓ ${resource} replicated to ${destination}`);
});

// View persisted logs
const logs = await db.resources.replicator_log;
const errors = await logs.query({ status: 'error' });
console.log(`${errors.length} replication errors`);
```

**What you get:** Complete visibility, easy debugging.

### Level 5: Selective Replication with Filters

Fine-grained control over what replicates:

```javascript
new ReplicatorPlugin({
  replicators: [{
    driver: 'postgresql',
    resources: {
      orders: {
        // Only replicate completed orders
        shouldReplicate: (data, action) => {
          if (action === 'deleted') return false;  // Never replicate deletes
          if (data.status !== 'completed') return false;  // Only completed
          if (data.total < 100) return false;  // Only orders > $100
          return true;
        },

        transform: (data) => ({
          id: data.id,
          total: data.total,
          status: data.status,
          completed_at: new Date().toISOString()
        })
      }
    },
    config: { connectionString: process.env.ANALYTICS_DB }
  }]
})
```

**What you get:** Replicate only what's needed, save storage and processing.

### Level 6: Production - Multi-Region Sync

For high availability and disaster recovery:

```javascript
new ReplicatorPlugin({
  replicators: [
    // Primary backup (same region)
    {
      driver: 's3db',
      resources: ['users', 'orders', 'products'],
      config: {
        connectionString: 's3://us-east-1-backup/...'
      }
    },

    // Secondary backup (different region)
    {
      driver: 's3db',
      resources: ['users', 'orders', 'products'],
      config: {
        connectionString: 's3://eu-west-1-backup/...'
      }
    },

    // Analytics (BigQuery)
    {
      driver: 'bigquery',
      resources: {
        orders: {
          resource: 'analytics.orders',
          transform: (data) => ({
            // Schema optimized for BigQuery
            order_id: data.id,
            total_usd: parseFloat(data.total),
            created_timestamp: new Date(data.createdAt).getTime(),
            customer_id: data.customerId
          })
        }
      },
      config: {
        projectId: process.env.GCP_PROJECT,
        credentials: JSON.parse(process.env.GCP_CREDENTIALS)
      }
    }
  ],

  // Monitor health
  verbose: true,
  persistReplicatorLog: true
})

// Health check endpoint
app.get('/health/replication', async (req, res) => {
  const logs = await db.resources.replicator_log;
  const recentErrors = await logs.query({
    status: 'error',
    timestamp: { $gte: Date.now() - 3600000 }  // Last hour
  });

  if (recentErrors.length > 10) {
    return res.status(500).json({ status: 'unhealthy', errors: recentErrors.length });
  }

  res.json({ status: 'healthy', errors: recentErrors.length });
});
```

**What you get:** Multi-region, multi-destination, production-ready with monitoring.

---

## Installation & Setup

### 📦 Required Dependencies

**Important:** Some replicator drivers require additional dependencies. The s3db.js core package **does not include** these dependencies to keep the package lightweight.

**Install only what you need:**

```bash
# For PostgreSQL replication
pnpm add pg

# For BigQuery replication
pnpm add @google-cloud/bigquery

# For SQS replication
pnpm add @aws-sdk/client-sqs
```

| Driver | Package | Version | Install Command |
|--------|---------|---------|-----------------|
| `postgresql` | `pg` | `^8.0.0` | `pnpm add pg` |
| `bigquery` | `@google-cloud/bigquery` | `^7.0.0` | `pnpm add @google-cloud/bigquery` |
| `sqs` | `@aws-sdk/client-sqs` | `^3.0.0` | `pnpm add @aws-sdk/client-sqs` |
| `s3db` | *(built-in)* | - | No installation needed |
| `webhook` | *(built-in)* | - | No installation needed |
| `csv`, `jsonl`, `parquet`, `excel` | *(built-in)* | - | No installation needed |

**Automatic Validation:** When you use a replicator, s3db.js automatically validates dependencies at runtime. If a dependency is missing, you'll get a clear error message with installation instructions.

**Example Error:**

```bash
Error: PostgreSQL Replicator - Missing dependencies detected!

❌ Missing dependency: pg
   Description: PostgreSQL client for Node.js
   Required: ^8.0.0
   Install: pnpm add pg
```

---

### Basic Setup

```javascript
import { S3db, ReplicatorPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new ReplicatorPlugin({
    verbose: true, // Enable detailed logging for debugging
    replicators: [
      {
        driver: 's3db',
        resources: ['users'],
        config: {
          connectionString: "s3://BACKUP_KEY:BACKUP_SECRET@BACKUP_BUCKET/backup"
        }
      }
    ]
  })]
});

await s3db.connect();

// Data is automatically replicated with detailed error reporting
const users = s3db.resources.users;
await users.insert({ name: 'John', email: 'john@example.com' });
// This insert is automatically replicated to the backup database
```

---

## Configuration Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable replication globally |
| `replicators` | array | `[]` | Array of replicator configurations (required) |
| `verbose` | boolean | `false` | Enable detailed console logging for debugging |
| `persistReplicatorLog` | boolean | `false` | Store replication logs in database resource |
| `replicatorLogResource` | string | `'replicator_log'` | Name of log resource for persistence |
| `logErrors` | boolean | `true` | Log errors to replication log resource |
| `batchSize` | number | `100` | Batch size for bulk replication operations |
| `maxRetries` | number | `3` | Maximum retry attempts for failed replications |
| `timeout` | number | `30000` | Timeout for replication operations (ms) |

---

## Replicator Drivers

### 🗃️ S3DB Replicator

Replicate to another S3DB instance with **advanced resource mapping and transformation capabilities**. Supports multiple configuration syntaxes for maximum flexibility.

#### Basic Configuration

```javascript
{
  driver: 's3db',
  config: {
    connectionString: "s3://BACKUP_KEY:BACKUP_SECRET@BACKUP_BUCKET/backup"
  },
  resources: {
    // Simple resource mapping (replicate to same name)
    users: 'users',
    
    // Map source → destination resource name
    products: 'backup_products',
    
    // Advanced mapping with transform function
    orders: {
      resource: 'order_backup',
      transform: (data) => ({
        ...data,
        backup_timestamp: new Date().toISOString(),
        original_source: 'production',
        migrated_at: new Date().toISOString()
      }),
      actions: ['inserted', 'updated', 'deleted']
    }
  }
}
```

#### Resource Configuration Syntaxes

The S3DB replicator supports **multiple configuration syntaxes** for maximum flexibility:

##### 1. Array of Resource Names
**Use case**: Simple backup/clone scenarios
```javascript
resources: ['users', 'products', 'orders']
// Replicates each resource to itself in the destination database
```

##### 2. Simple Object Mapping
**Use case**: Rename resources during replication
```javascript
resources: { 
  users: 'people',           // users → people
  products: 'items',         // products → items  
  orders: 'order_history'    // orders → order_history
}
```

##### 3. Object with Transform Function
**Use case**: Data transformation during replication (RECOMMENDED)
```javascript
resources: { 
  users: { 
    resource: 'people',     // Destination resource name
    transform: (data) => ({  // Data transformation function
      ...data, 
      fullName: `${data.firstName} ${data.lastName}`,
      migrated_at: new Date().toISOString(),
      source_system: 'production'
    }),
    actions: ['inserted', 'updated', 'deleted']  // Optional: which operations to replicate
  }
}
```

##### 4. Function-Only Transformation
**Use case**: Transform data without changing resource name
```javascript
resources: { 
  users: (data) => ({ 
    ...data, 
    processed: true,
    backup_date: new Date().toISOString(),
    hash: crypto.createHash('md5').update(JSON.stringify(data)).digest('hex')
  })
}
```

##### 5. Multi-Destination Replication
**Use case**: Send data to multiple targets with different transformations
```javascript
resources: { 
  users: [
    'people',                    // Simple copy to 'people'
    { 
      resource: 'user_analytics', 
      transform: (data) => ({    // Transformed copy to 'user_analytics'
        id: data.id,
        signup_date: data.createdAt,
        user_type: data.role || 'standard',
        last_activity: new Date().toISOString()
      })
    },
    {
      resource: 'audit_trail',
      transform: (data) => ({    // Audit copy to 'audit_trail'
        user_id: data.id,
        action: 'user_replicated',
        timestamp: new Date().toISOString(),
        data_hash: crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex')
      })
    }
  ]
}
```

### 📬 SQS Replicator

**Real-time event streaming** to AWS SQS queues for microservices integration and event-driven architectures.

**Required Dependency:**
```bash
pnpm add @aws-sdk/client-sqs
```

#### Basic Configuration

```javascript
{
  driver: 'sqs',
  resources: ['orders', 'users'],
  config: {
    region: 'us-east-1',
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/events.fifo',
    messageGroupId: 's3db-events',
    deduplicationId: true
  }
}
```

#### Advanced Configuration

```javascript
{
  driver: 'sqs',
  config: {
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    
    // Resource-specific queue URLs
    queues: {
      orders: 'https://sqs.us-east-1.amazonaws.com/123456789012/order-events.fifo',
      users: 'https://sqs.us-east-1.amazonaws.com/123456789012/user-events.fifo',
      payments: 'https://sqs.us-east-1.amazonaws.com/123456789012/payment-events.fifo'
    },
    
    // Default queue for resources not specifically mapped
    defaultQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/general-events.fifo',
    
    // FIFO queue settings
    messageGroupId: 's3db-replicator',
    deduplicationId: true,
    
    // Message attributes (applied to all messages)
    messageAttributes: {
      source: { StringValue: 'production-db', DataType: 'String' },
      version: { StringValue: '1.0', DataType: 'String' },
      environment: { StringValue: process.env.NODE_ENV || 'development', DataType: 'String' }
    }
  },
  resources: {
    orders: true,
    users: true,
    payments: {
      transform: (data) => ({
        payment_id: data.id,
        amount: data.amount,
        currency: data.currency || 'USD',
        customer_id: data.userId,
        payment_method: data.method,
        status: data.status,
        timestamp: new Date().toISOString(),
        amount_usd: data.currency === 'USD' ? data.amount : data.amount * (data.exchange_rate || 1),
        is_large_payment: data.amount > 1000,
        risk_score: data.amount > 5000 ? 'high' : data.amount > 1000 ? 'medium' : 'low'
      })
    }
  }
}
```

### 📡 Webhook Replicator

**HTTP webhook integration** for sending database changes to external APIs and services with comprehensive authentication support.

#### Basic Configuration

```javascript
{
  driver: 'webhook',
  config: {
    url: 'https://api.example.com/webhook',
    method: 'POST',  // Default: POST
    timeout: 5000,    // Request timeout in ms (default: 5000)
    retries: 3,       // Number of retry attempts (default: 3)
  },
  resources: ['users', 'orders']
}
```

#### Authentication Methods

##### 1. Bearer Token Authentication
```javascript
{
  driver: 'webhook',
  config: {
    url: 'https://api.example.com/webhook',
    auth: {
      type: 'bearer',
      token: process.env.WEBHOOK_TOKEN
    }
  }
}
```

##### 2. Basic Authentication
```javascript
{
  driver: 'webhook',
  config: {
    url: 'https://api.example.com/webhook',
    auth: {
      type: 'basic',
      username: 'api_user',
      password: process.env.API_PASSWORD
    }
  }
}
```

##### 3. API Key Authentication
```javascript
{
  driver: 'webhook',
  config: {
    url: 'https://api.example.com/webhook',
    auth: {
      type: 'apikey',
      header: 'X-API-Key',  // Custom header name
      value: process.env.API_KEY
    }
  }
}
```

#### Advanced Configuration

```javascript
{
  driver: 'webhook',
  config: {
    url: 'https://api.example.com/webhook',
    method: 'POST',

    // Custom headers
    headers: {
      'Content-Type': 'application/json',
      'X-Custom-Header': 'value',
      'X-Environment': process.env.NODE_ENV
    },

    // Authentication
    auth: {
      type: 'bearer',
      token: process.env.WEBHOOK_TOKEN
    },

    // Timeout and retry configuration
    timeout: 10000,         // 10 seconds
    retries: 3,             // Retry up to 3 times
    retryDelay: 1000,       // Initial delay between retries (ms)
    retryStrategy: 'exponential',  // 'exponential' or 'fixed'
    retryOnStatus: [429, 500, 502, 503, 504],  // HTTP status codes to retry

    // Batch mode (optional)
    batch: true,            // Send multiple records in one request
    batchSize: 100         // Max records per batch
  },
  resources: {
    users: true,
    orders: {
      transform: (data) => ({
        order_id: data.id,
        customer: data.userId,
        total: data.total,
        items: data.items,
        timestamp: new Date().toISOString(),
        // Add custom fields
        webhook_version: '1.0',
        environment: process.env.NODE_ENV
      })
    }
  }
}
```

#### Webhook Payload Format

The webhook receives a standardized payload:

```json
{
  "resource": "users",
  "action": "insert",
  "timestamp": "2025-10-18T10:30:00.000Z",
  "source": "s3db-webhook-replicator",
  "data": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

For update operations:
```json
{
  "resource": "users",
  "action": "update",
  "timestamp": "2025-10-18T10:30:00.000Z",
  "source": "s3db-webhook-replicator",
  "before": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "data": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john.doe@example.com"
  }
}
```

#### Batch Mode Payload

When `batch: true` is enabled:
```json
{
  "batch": [
    {
      "resource": "users",
      "action": "insert",
      "timestamp": "2025-10-18T10:30:00.000Z",
      "source": "s3db-webhook-replicator",
      "data": { "id": "user_123", "name": "John Doe" }
    },
    {
      "resource": "users",
      "action": "update",
      "timestamp": "2025-10-18T10:30:01.000Z",
      "source": "s3db-webhook-replicator",
      "before": { "id": "user_124", "name": "Jane" },
      "data": { "id": "user_124", "name": "Jane Doe" }
    }
  ]
}
```

#### Retry Strategy

**Exponential Backoff** (default):
- Attempt 1: Immediate
- Attempt 2: 1s delay
- Attempt 3: 2s delay
- Attempt 4: 4s delay

**Fixed Delay**:
- All retries use the same `retryDelay` value

#### Use Cases

**1. Third-party Integrations**
```javascript
// Notify external CRM when users are created/updated
{
  driver: 'webhook',
  config: {
    url: 'https://crm.example.com/api/users/sync',
    auth: { type: 'apikey', header: 'X-API-Key', value: process.env.CRM_API_KEY }
  },
  resources: ['users']
}
```

**2. Slack/Discord Notifications**
```javascript
// Send notifications to Slack
{
  driver: 'webhook',
  config: {
    url: process.env.SLACK_WEBHOOK_URL,
    headers: { 'Content-Type': 'application/json' }
  },
  resources: {
    orders: {
      transform: (data) => ({
        text: `New order #${data.id} - Total: $${data.total}`,
        channel: '#orders',
        username: 's3db-bot'
      })
    }
  }
}
```

**3. Analytics/Monitoring**
```javascript
// Send events to analytics platform
{
  driver: 'webhook',
  config: {
    url: 'https://analytics.example.com/events',
    auth: { type: 'bearer', token: process.env.ANALYTICS_TOKEN },
    batch: true,
    batchSize: 100
  },
  resources: ['users', 'orders', 'events']
}
```

### 📊 BigQuery Replicator

**Data warehouse integration** for Google BigQuery with advanced transformation capabilities.

**Required Dependency:**
```bash
pnpm add @google-cloud/bigquery
```

#### Basic Configuration

```javascript
{
  driver: 'bigquery',
  config: {
    projectId: 'my-analytics-project',
    datasetId: 'production_data',
    location: 'US',
    credentials: {
      // Service account key or application default credentials
    }
  },
  resources: {
    users: 'user_profiles',
    orders: 'order_history'
  }
}
```

#### Mutability Modes

BigQuery has a **90-minute streaming buffer window** where recently inserted data cannot be updated or deleted. To handle this, the BigQuery replicator supports three mutability modes:

**⚡ append-only** (default) - **Most performant, no streaming buffer issues**
- Updates and deletes become INSERT operations with change tracking
- Adds fields: `_operation_type`, `_operation_timestamp`
- Perfect for analytics workloads where you want history
- Zero waiting for streaming buffer

```javascript
{
  driver: 'bigquery',
  config: {
    projectId: 'analytics',
    datasetId: 'events',
    mutability: 'append-only'  // Default
  },
  resources: {
    users: 'users_table'
  }
}

// Result in BigQuery:
// | id | name  | _operation_type | _operation_timestamp |
// |----|-------|-----------------|---------------------|
// | u1 | John  | insert          | 2024-01-01 10:00:00 |
// | u1 | Jane  | update          | 2024-01-01 11:00:00 |
// | u1 | null  | delete          | 2024-01-01 12:00:00 |
```

**🔄 mutable** - Traditional UPDATE/DELETE behavior
- Uses standard SQL UPDATE and DELETE statements
- Includes retry logic for streaming buffer errors (30s delay, 2 attempts)
- May fail or delay if data is in streaming buffer

```javascript
{
  driver: 'bigquery',
  config: {
    projectId: 'analytics',
    datasetId: 'events',
    mutability: 'mutable'
  },
  resources: {
    users: 'users_table'
  }
}
```

**📜 immutable** - Full audit trail
- All operations (insert/update/delete) tracked as INSERTs
- Adds fields: `_operation_type`, `_operation_timestamp`, `_is_deleted`, `_version`
- Complete version history with automatic version counter
- Perfect for compliance and audit requirements

```javascript
{
  driver: 'bigquery',
  config: {
    projectId: 'analytics',
    datasetId: 'audit',
    mutability: 'immutable'
  },
  resources: {
    transactions: 'transactions_history'
  }
}

// Result in BigQuery:
// | id | amount | _operation_type | _operation_timestamp | _is_deleted | _version |
// |----|--------|-----------------|---------------------|-------------|----------|
// | t1 | 100    | insert          | 2024-01-01 10:00:00 | false       | 1        |
// | t1 | 150    | update          | 2024-01-01 11:00:00 | false       | 2        |
// | t1 | 150    | delete          | 2024-01-01 12:00:00 | true        | 3        |
```

**Per-Resource Override:**
```javascript
{
  driver: 'bigquery',
  config: {
    projectId: 'analytics',
    datasetId: 'mixed',
    mutability: 'append-only'  // Global default
  },
  resources: {
    // Use default append-only
    events: 'events_table',

    // Override to immutable for audit trail
    transactions: {
      table: 'transactions_audit',
      mutability: 'immutable',
      actions: ['inserted', 'updated', 'deleted']
    },

    // Override to mutable for traditional behavior
    cache: {
      table: 'cache_table',
      mutability: 'mutable',
      actions: ['inserted', 'updated', 'deleted']
    }
  }
}
```

**Schema Sync:**

When `schemaSync.enabled: true`, tracking fields are automatically added based on mutability mode:

```javascript
{
  driver: 'bigquery',
  config: {
    projectId: 'analytics',
    datasetId: 'events',
    mutability: 'append-only',
    schemaSync: {
      enabled: true,
      strategy: 'alter',
      autoCreateTable: true,
      autoCreateColumns: true
    }
  },
  resources: {
    users: 'users_table'
  }
}

// Table schema will include:
// - id (STRING, REQUIRED)
// - ...user attributes...
// - _operation_type (STRING, NULLABLE)      // Added for append-only/immutable
// - _operation_timestamp (TIMESTAMP, NULLABLE)  // Added for append-only/immutable
// - _is_deleted (BOOL, NULLABLE)            // Added for immutable only
// - _version (INT64, NULLABLE)              // Added for immutable only
```

**Best Practices:**

| Use Case | Recommended Mode | Why |
|----------|-----------------|-----|
| Analytics/Events | `append-only` | Track all changes, no streaming buffer issues |
| Audit/Compliance | `immutable` | Complete history with version tracking |
| Cache/Session | `mutable` | Traditional behavior, data can be updated |
| Real-time Dashboard | `append-only` | No delays from streaming buffer |

---

### 🐬 MySQL / MariaDB Replicator

**Relational database integration** for MySQL and MariaDB with connection pooling and optional replication logging.

**Required Dependency:**
```bash
pnpm add mysql2
```

#### Basic Configuration

```javascript
{
  driver: 'mysql',  // or 'mariadb' (uses same mysql2 driver)
  config: {
    host: 'localhost',
    port: 3306,
    database: 'production_db',
    user: 'replicator_user',
    password: 'secure_password',
    connectionLimit: 10,  // Connection pool size
    ssl: {  // Optional SSL configuration
      rejectUnauthorized: true
    },
    logTable: 'replication_log'  // Optional: log all operations
  },
  resources: {
    users: 'users_table',
    orders: 'orders_table'
  }
}
```

#### Advanced Configuration

```javascript
{
  driver: 'mysql',
  config: {
    host: 'mysql.example.com',
    port: 3306,
    database: 'analytics',
    user: 'replicator',
    password: process.env.MYSQL_PASSWORD,
    connectionLimit: 20,
    ssl: {
      ca: fs.readFileSync('ca-cert.pem'),
      cert: fs.readFileSync('client-cert.pem'),
      key: fs.readFileSync('client-key.pem')
    },
    logTable: 'replication_audit'  // Track all replicated operations
  },
  resources: {
    // Simple mapping
    users: 'users',

    // Multiple actions
    products: [{
      table: 'products',
      actions: ['inserted', 'updated', 'deleted']
    }],

    // Multiple tables for same resource
    orders: [
      { table: 'orders_current', actions: ['inserted', 'updated'] },
      { table: 'orders_archive', actions: ['inserted'] }
    ]
  }
}
```

#### Features

- ✅ **Connection Pooling**: Configurable pool size (default: 10 connections)
- ✅ **SSL/TLS Support**: Secure connections with certificate validation
- ✅ **Replication Logging**: Optional audit table for all operations
- ✅ **Parameterized Queries**: SQL injection protection
- ✅ **Insert, Update, Delete**: Full CRUD operation support
- ✅ **Multi-Table Replication**: Same resource → multiple MySQL tables
- ✅ **MariaDB Compatible**: Use same driver for MariaDB

---

### ⚡ DynamoDB Replicator

**NoSQL database integration** for AWS DynamoDB with support for composite keys and DynamoDB Local.

**Required Dependencies:**
```bash
pnpm add @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

#### Basic Configuration

```javascript
{
  driver: 'dynamodb',
  config: {
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: 'http://localhost:8000'  // Optional: for DynamoDB Local
  },
  resources: {
    users: 'UsersTable',
    sessions: 'SessionsTable'
  }
}
```

#### Advanced Configuration with Composite Keys

```javascript
{
  driver: 'dynamodb',
  config: {
    region: 'us-west-2',
    // Uses AWS SDK default credential chain if not specified
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN  // Optional for temporary credentials
    }
  },
  resources: {
    // Simple mapping (uses default 'id' as primary key)
    users: 'UsersTable',

    // Custom primary key
    products: {
      table: 'ProductsTable',
      primaryKey: 'productId',
      actions: ['inserted', 'updated', 'deleted']
    },

    // Composite key (partition key + sort key)
    orders: {
      table: 'OrdersTable',
      primaryKey: 'customerId',  // Partition key
      sortKey: 'orderId',        // Sort key
      actions: ['inserted', 'updated', 'deleted']
    },

    // Multiple tables
    analytics: [
      { table: 'Analytics_Current', primaryKey: 'eventId', actions: ['inserted'] },
      { table: 'Analytics_Archive', primaryKey: 'eventId', actions: ['inserted'] }
    ]
  }
}
```

#### DynamoDB Local (Development)

```javascript
{
  driver: 'dynamodb',
  config: {
    region: 'us-east-1',
    endpoint: 'http://localhost:8000',  // DynamoDB Local
    // No credentials needed for local
  },
  resources: {
    users: {
      table: 'Users',
      primaryKey: 'id'
    }
  }
}
```

#### Features

- ✅ **AWS SDK v3**: Latest DynamoDB client with improved performance
- ✅ **Composite Keys**: Support for partition key + sort key tables
- ✅ **Custom Keys**: Configurable primary key field names
- ✅ **DynamoDB Local**: Perfect for local development and testing
- ✅ **Expression Builders**: Safe update expressions with attribute names/values
- ✅ **AWS Credentials**: Supports access keys, IAM roles, session tokens
- ✅ **Multi-Region**: Deploy to any AWS region

---

### 🍃 MongoDB Replicator

**Document database integration** for MongoDB with support for standalone, replica sets, and MongoDB Atlas.

**Required Dependency:**
```bash
pnpm add mongodb
```

#### Basic Configuration

```javascript
{
  driver: 'mongodb',
  config: {
    host: 'localhost',
    port: 27017,
    database: 'production_db',
    username: 'replicator_user',
    password: 'secure_password',
    logCollection: 'replication_log'  // Optional: log all operations
  },
  resources: {
    users: 'users_collection',
    products: 'products_collection'
  }
}
```

#### MongoDB Atlas Configuration

```javascript
{
  driver: 'mongodb',
  config: {
    connectionString: 'mongodb+srv://user:pass@cluster0.mongodb.net/mydb?retryWrites=true&w=majority',
    database: 'production',
    logCollection: 'replication_audit'
  },
  resources: {
    users: 'users',
    orders: 'orders',
    analytics: 'events'
  }
}
```

#### Advanced Configuration

```javascript
{
  driver: 'mongodb',
  config: {
    // Connection string (supports all MongoDB connection formats)
    connectionString: 'mongodb://admin:secret@host1:27017,host2:27017,host3:27017/mydb?replicaSet=rs0',

    // Or individual parameters
    host: 'mongodb.example.com',
    port: 27017,
    database: 'analytics',
    username: 'replicator',
    password: process.env.MONGO_PASSWORD,

    // MongoDB client options
    options: {
      useUnifiedTopology: true,
      useNewUrlParser: true,
      maxPoolSize: 50,
      minPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    },

    logCollection: 'replication_log'
  },
  resources: {
    // Simple mapping
    users: 'users',

    // Multiple actions
    products: {
      collection: 'products',
      actions: ['inserted', 'updated', 'deleted']
    },

    // Multiple collections
    orders: [
      { collection: 'orders_active', actions: ['inserted', 'updated'] },
      { collection: 'orders_archive', actions: ['inserted'] }
    ]
  }
}
```

#### Replica Set Configuration

```javascript
{
  driver: 'mongodb',
  config: {
    connectionString: 'mongodb://host1:27017,host2:27017,host3:27017/mydb?replicaSet=myReplicaSet&readPreference=primaryPreferred',
    options: {
      w: 'majority',  // Write concern
      j: true,        // Journal acknowledgment
      wtimeout: 5000  // Write timeout
    }
  },
  resources: {
    users: 'users',
    sessions: 'sessions'
  }
}
```

#### Features

- ✅ **Multiple Formats**: Connection string or host/port configuration
- ✅ **MongoDB Atlas**: Full support for cloud-hosted MongoDB
- ✅ **Replica Sets**: Automatic failover and high availability
- ✅ **Replication Logging**: Optional audit collection with indexes
- ✅ **_id Preservation**: Keeps MongoDB _id field intact
- ✅ **Connection Options**: Full MongoDB client options support
- ✅ **Insert, Update, Delete**: Full CRUD operation support
- ✅ **Multi-Collection**: Same resource → multiple MongoDB collections

---

## Usage Examples

### Multi-Target Replication Setup

```javascript
const replicatorPlugin = new ReplicatorPlugin({
  verbose: true,
  persistReplicatorLog: true,
  replicators: [
    // Backup to another S3DB
    {
      driver: 's3db',
      resources: ['users', 'products', 'orders'],
      config: {
        connectionString: "s3://BACKUP_KEY:BACKUP_SECRET@BACKUP_BUCKET/backup"
      }
    },
    
    // Stream events to SQS
    {
      driver: 'sqs',
      resources: {
        orders: {
          transform: (data) => ({
            order_id: data.id,
            customer_id: data.userId,
            amount: data.amount,
            status: data.status,
            event_timestamp: new Date().toISOString()
          })
        }
      },
      config: {
        region: 'us-east-1',
        queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/order-events.fifo',
        messageGroupId: 'order-events'
      }
    },
    
    // Analytics to BigQuery
    {
      driver: 'bigquery',
      resources: {
        users: {
          resource: 'user_analytics',
          transform: (data) => ({
            user_id: data.id,
            signup_date: data.createdAt,
            user_type: data.role || 'standard',
            email_domain: data.email?.split('@')[1] || 'unknown',
            created_timestamp: new Date().toISOString()
          })
        }
      },
      config: {
        projectId: 'analytics-project',
        datasetId: 'user_data',
        location: 'US'
      }
    }
  ]
});
```

### Advanced Data Transformations

```javascript
// Complex transformation examples
const transformationExamples = {
  // Field mapping and enrichment
  users: {
    resource: 'customer_profiles',
    transform: (data) => ({
      id: data.id,
      customer_name: `${data.firstName} ${data.lastName}`,
      email_domain: data.email?.split('@')[1] || 'unknown',
      created_timestamp: Date.now(),
      source: 'production-db'
    })
  },
  
  // Conditional logic
  orders: {
    resource: 'processed_orders',
    transform: (data) => {
      if (data.type === 'premium') {
        return { ...data, priority: 'high', sla: '4hours' };
      }
      return { ...data, priority: 'normal', sla: '24hours' };
    }
  },
  
  // Data validation and filtering
  products: {
    resource: 'validated_products',
    transform: (data) => {
      // Skip replication for invalid data
      if (!data.name || !data.price) return null;
      
      return {
        ...data,
        name: data.name.trim(),
        price: parseFloat(data.price),
        validated: true
      };
    }
  },
  
  // Computed fields
  customer_analytics: {
    resource: 'customer_insights',
    transform: (data) => ({
      ...data,
      age: data.birthDate ? 
        Math.floor((Date.now() - new Date(data.birthDate)) / (1000 * 60 * 60 * 24 * 365)) : null,
      account_value: (data.orders || []).reduce((sum, order) => sum + order.amount, 0),
      last_activity: new Date().toISOString()
    })
  }
};
```

### Event Monitoring and Debugging

```javascript
// Event system for monitoring and debugging
const replicatorPlugin = s3db.plugins.find(p => p.constructor.name === 'ReplicatorPlugin');

// Success events
replicatorPlugin.on('plg:replicator:replicated', (data) => {
  console.log(`✅ Replicated: ${data.operation} on ${data.resourceName} to ${data.replicator}`);
});

// Error events
replicatorPlugin.on('plg:replicator:error', (data) => {
  console.error(`❌ Replication failed: ${data.error} (${data.resourceName})`);
});

// Log resource errors
replicatorPlugin.on('replicator_log_error', (data) => {
  console.warn(`⚠️ Failed to log replication: ${data.logError}`);
});

// Setup errors
replicatorPlugin.on('replicator_log_resource_creation_error', (data) => {
  console.error(`🚨 Log resource creation failed: ${data.error}`);
});

// Cleanup errors
replicatorPlugin.on('replicator_cleanup_error', (data) => {
  console.warn(`🧹 Cleanup failed for ${data.replicator}: ${data.error}`);
});
```

---

## API Reference

### Plugin Constructor

```javascript
new ReplicatorPlugin({
  enabled?: boolean,
  replicators: ReplicatorConfig[],
  verbose?: boolean,
  persistReplicatorLog?: boolean,
  replicatorLogResource?: string,
  logErrors?: boolean,
  batchSize?: number,
  maxRetries?: number,
  timeout?: number
})
```

### Replicator Configuration

```javascript
interface ReplicatorConfig {
  driver: 's3db' | 'sqs' | 'bigquery' | 'postgresql' | string;
  resources: ResourceMapping;
  config: DriverConfig;
  enabled?: boolean;
}
```

### Transform Function Features

Transform functions provide powerful data manipulation capabilities:

```javascript
// Return null to skip replication
transform: (data) => {
  if (data.status === 'deleted') return null;
  return data;
}

// Preserve the id field unless mapping to different field
transform: (data) => ({
  id: data.id,
  customer_id: data.id, // Map to different field name
  ...data
})

// Handle edge cases
transform: (data) => ({
  ...data,
  name: data.name?.trim() || 'Unknown',
  email: data.email?.toLowerCase() || null,
  age: data.birthDate ? calculateAge(data.birthDate) : null
})

// Add metadata fields
transform: (data) => ({
  ...data,
  replicated_at: new Date().toISOString(),
  source_system: 'production',
  version: '1.0'
})
```

---

## Best Practices

### 1. Design Robust Transform Functions

```javascript
// Good: Handle edge cases and validation
transform: (data) => {
  // Validation
  if (!data.id || !data.email) return null;
  
  // Safe property access
  const firstName = data.firstName?.trim() || '';
  const lastName = data.lastName?.trim() || '';
  
  // Computed fields with fallbacks
  const fullName = firstName && lastName ? 
    `${firstName} ${lastName}` : 
    firstName || lastName || 'Unknown';
  
  return {
    ...data,
    fullName,
    email: data.email.toLowerCase(),
    processed_at: new Date().toISOString()
  };
}
```

### 2. Implement Selective Replication

```javascript
// Replicate only specific operations
{
  resources: {
    users: {
      resource: 'user_backup',
      actions: ['inserted', 'updated'], // Skip deletes
      transform: (data) => ({ ...data, backup_timestamp: Date.now() })
    }
  }
}
```

### 3. Monitor Replication Health

```javascript
// Set up comprehensive monitoring
const replicationMetrics = {
  successful: 0,
  failed: 0,
  skipped: 0,
  startTime: Date.now()
};

replicatorPlugin.on('plg:replicator:replicated', () => {
  replicationMetrics.successful++;
});

replicatorPlugin.on('plg:replicator:error', (data) => {
  replicationMetrics.failed++;
  
  // Alert on high error rates
  const totalAttempts = replicationMetrics.successful + replicationMetrics.failed;
  const errorRate = replicationMetrics.failed / totalAttempts;
  
  if (errorRate > 0.1 && totalAttempts > 10) {
    console.error(`🚨 High replication error rate: ${(errorRate * 100).toFixed(1)}%`);
  }
});

// Periodic health check
setInterval(() => {
  const uptime = Date.now() - replicationMetrics.startTime;
  const successRate = replicationMetrics.successful / 
    (replicationMetrics.successful + replicationMetrics.failed) * 100;
  
  console.log(`Replication health: ${successRate.toFixed(1)}% success rate over ${Math.round(uptime / 60000)} minutes`);
}, 300000); // Every 5 minutes
```

### 4. Use Environment-Specific Configuration

```javascript
// Different configurations per environment
const getReplicatorConfig = () => {
  const env = process.env.NODE_ENV;
  
  if (env === 'production') {
    return {
      replicators: [
        // Production backup
        { driver: 's3db', resources: ['users', 'orders'], config: { ... } },
        // Analytics pipeline
        { driver: 'bigquery', resources: { orders: 'order_analytics' }, config: { ... } },
        // Event streaming
        { driver: 'sqs', resources: ['orders'], config: { ... } }
      ]
    };
  }
  
  if (env === 'staging') {
    return {
      replicators: [
        // Staging backup only
        { driver: 's3db', resources: ['users'], config: { ... } }
      ]
    };
  }
  
  // Development - no replication
  return { enabled: false };
};
```

### 5. Handle Sensitive Data

```javascript
// Strip sensitive data before replication
{
  resources: {
    users: {
      resource: 'user_profiles',
      transform: (data) => {
        const { password, ssn, creditCard, ...safeData } = data;
        
        return {
          ...safeData,
          // Hash sensitive fields if needed for analytics
          email_hash: crypto.createHash('sha256').update(data.email).digest('hex'),
          has_payment_method: !!creditCard,
          processed_at: new Date().toISOString()
        };
      }
    }
  }
}
```

### 6. Optimize for Performance

```javascript
// Batch configuration for high-volume scenarios
{
  batchSize: 500,        // Larger batches for better throughput
  maxRetries: 5,         // More retries for transient failures
  timeout: 60000,        // Longer timeout for batch operations
  
  replicators: [
    {
      driver: 'bigquery',
      resources: ['orders'],
      config: {
        // BigQuery-specific optimizations
        insertMethod: 'streaming', // or 'batch'
        ignoreUnknownValues: true,
        maxRetries: 3
      }
    }
  ]
}
```

---

## 🚨 Error Handling

The Replicator Plugin uses standardized error classes with comprehensive context and recovery guidance:

### ReplicatorError

All replication operations throw `ReplicatorError` instances with detailed context:

```javascript
try {
  await replicatorPlugin.replicateBatch('users', records);
} catch (error) {
  console.error(error.name);        // 'ReplicatorError'
  console.error(error.message);     // Brief error summary
  console.error(error.description); // Detailed explanation with guidance
  console.error(error.context);     // Replicator, resource, operation details
}
```

### Common Errors

#### Replicator Not Found

**When**: Referencing non-existent replicator ID
**Error**: `Replicator not found: {replicatorId}`
**Recovery**:
```javascript
// Bad
await replicatorPlugin.syncAllData('nonexistent-id');  // Throws

// Good - List available replicators
const replicators = await replicatorPlugin.listReplicators();
console.log('Available replicators:', replicators.map(r => r.id));

// Good - Check replicator exists
if (replicators.find(r => r.id === 'my-replicator')) {
  await replicatorPlugin.syncAllData('my-replicator');
}
```

#### Transform Function Errors

**When**: Transform function throws or returns invalid data
**Error**: `Transform function failed for resource '{resourceName}': {errorMessage}`
**Recovery**:
```javascript
// Robust transform functions
resources: {
  users: {
    resource: 'user_profiles',
    transform: (data) => {
      try {
        // Validate required fields
        if (!data.id || !data.email) {
          console.warn(`Skipping invalid user:`, data);
          return null;  // Skip this record
        }

        // Safe transformations
        return {
          id: data.id,
          name: data.name?.trim() || 'Unknown',
          email: data.email.toLowerCase(),
          created_at: new Date().toISOString()
        };
      } catch (error) {
        console.error(`Transform error for user ${data.id}:`, error);
        return null;  // Skip on error
      }
    }
  }
}

// Monitor transform failures
replicatorPlugin.on('plg:replicator:error', (data) => {
  if (data.error.includes('Transform function failed')) {
    console.error(`Transform failed for ${data.resourceName}:`, data.error);
    // Log to external monitoring
  }
});
```

#### Destination Connection Errors

**When**: Cannot connect to replication target
**Error**: `Failed to replicate to {driver}: Connection failed`
**Recovery**:
```javascript
// Monitor connection errors
replicatorPlugin.on('plg:replicator:error', async (data) => {
  if (data.error.includes('Connection failed')) {
    console.error(`Replicator ${data.replicator} connection failed`);

    // Implement circuit breaker
    const failureCount = (connectionFailures.get(data.replicator) || 0) + 1;
    connectionFailures.set(data.replicator, failureCount);

    if (failureCount >= 5) {
      console.error(`Disabling replicator ${data.replicator} after ${failureCount} failures`);
      await replicatorPlugin.disableReplicator(data.replicator);

      // Alert operations team
      await sendAlert({
        title: 'Replicator Disabled',
        message: `Replicator ${data.replicator} disabled due to connection failures`
      });
    }
  }
});
```

#### Batch Replication Errors

**When**: Batch operation fails
**Error**: `replicateBatch() method must be implemented by subclass`
**Recovery**:
```javascript
// Fallback to individual operations
async function safeReplicateBatch(replicator, resourceName, records) {
  try {
    return await replicator.replicateBatch(resourceName, records);
  } catch (error) {
    if (error.message.includes('must be implemented')) {
      // Fallback to individual replication
      console.warn('Batch not supported, using individual operations');

      const results = [];
      for (const record of records) {
        try {
          await replicator.replicate(resourceName, 'inserted', record, record.id);
          results.push({ success: true, id: record.id });
        } catch (err) {
          results.push({ success: false, id: record.id, error: err.message });
        }
      }
      return results;
    }
    throw error;
  }
}
```

### Error Recovery Patterns

#### Dead Letter Queue

Handle persistent failures:
```javascript
// Create dead letter resource for failed replications
await database.createResource({
  name: 'replication_dlq',
  attributes: {
    resource: 'string|required',
    operation: 'string|required',
    data: 'object|required',
    error: 'string|required',
    attempts: 'number',
    failed_at: 'string|required'
  }
});

// Monitor replication errors
replicatorPlugin.on('plg:replicator:error', async (data) => {
  const attempts = (errorAttempts.get(data.recordId) || 0) + 1;
  errorAttempts.set(data.recordId, attempts);

  if (attempts >= 3) {
    // Move to dead letter queue
    await database.resources.replication_dlq.insert({
      id: `dlq_${Date.now()}_${data.recordId}`,
      resource: data.resourceName,
      operation: data.operation,
      data: data.record,
      error: data.error,
      attempts,
      failed_at: new Date().toISOString()
    });

    console.error(`Moved ${data.recordId} to DLQ after ${attempts} attempts`);
    errorAttempts.delete(data.recordId);
  }
});
```

#### Graceful Degradation

Continue operations despite failures:
```javascript
// Wrap replicators in try-catch to prevent cascading failures
const safeReplicators = replicators.map(replicator => ({
  ...replicator,
  replicate: async (resource, operation, data, id) => {
    try {
      return await replicator.replicate(resource, operation, data, id);
    } catch (error) {
      console.error(`Replicator ${replicator.id} failed:`, error);
      // Don't throw - allow other replicators to continue
      return { success: false, error: error.message };
    }
  }
}));
```

#### Retry with Backoff

Implement exponential backoff for transient failures:
```javascript
async function replicateWithRetry(replicator, resource, operation, data, id, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await replicator.replicate(resource, operation, data, id);
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      const delay = Math.pow(2, attempt) * 1000;  // Exponential backoff
      console.log(`Retry ${attempt}/${maxRetries} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

---

## Troubleshooting

### Issue: Replication failing with timeout errors
**Solution**: Increase timeout values, reduce batch sizes, or check network connectivity to target systems.

### Issue: Transform functions causing errors
**Solution**: Add proper error handling and validation in transform functions. Return null to skip problematic records.

### Issue: High memory usage during replication
**Solution**: Reduce batch sizes, implement backpressure controls, or use streaming for large datasets.

### Issue: SQS messages not appearing
**Solution**: Verify queue URLs, check IAM permissions, and ensure correct region configuration.

### Issue: Data inconsistencies in replicated targets
**Solution**: Implement transaction logs, add data validation checks, and consider eventual consistency patterns.

---

## See Also

- [BackupPlugin vs ReplicatorPlugin](./BACKUP_VS_REPLICATOR.md) - When to use each plugin
- [BackupPlugin](./backup.md) - Batch snapshots for disaster recovery
- [Plugin Development Guide](./plugin-development.md)
- [Audit Plugin](./audit.md) - Track replication operations
- [Metrics Plugin](./metrics.md) - Monitor replication performance
- [Queue Consumer Plugin](./queue-consumer.md) - Process replicated events
## ❓ FAQ

### Básico

**P: Para que serve o ReplicatorPlugin?**
R: Replica **cada operação** (insert/update/delete) automaticamente em tempo real para outros destinos. Cada record é processado individualmente com latência <10ms.

**P: Qual a diferença entre ReplicatorPlugin e BackupPlugin?**
R:
- **ReplicatorPlugin**: Real-time CDC - replica cada operação individualmente (1 record por vez)
- **BackupPlugin**: Batch snapshots - exporta TODO o database de uma vez em momentos específicos
Ver [comparação completa](./BACKUP_VS_REPLICATOR.md).

**Q: When to use ReplicatorPlugin vs BackupPlugin?**
R:
- **ReplicatorPlugin**: Analytics em tempo real, event sourcing, sync contínuo
- **BackupPlugin**: Disaster recovery, compliance, point-in-time recovery

**P: Quais drivers estão disponíveis?**
R: `s3db` (outro S3DB), `sqs` (AWS SQS), `webhook` (HTTP/HTTPS), `postgresql`, `bigquery`

**Q: How does resource mapping work?**
R: Você pode mapear recursos 1:1, renomear ou transformar dados:
```javascript
resources: {
  users: 'people',  // Renomeia
  orders: { 
    resource: 'pedidos', 
    transform: (data) => ({ ...data, status: 'novo' }) 
  }
}
```

### Configuração

**P: Como replicar para múltiplos destinos?**
R: Use um array de replicadores:
```javascript
new ReplicatorPlugin({
  replicators: [
    { driver: 's3db', config: {...}, resources: ['users'] },
    { driver: 'sqs', config: {...}, resources: ['events'] }
  ]
})
```

**P: Como configurar retries?**
R: Use `maxRetries`:
```javascript
new ReplicatorPlugin({
  maxRetries: 5,
  timeout: 60000,
  replicators: [...]
})
```

**P: Como persistir logs de replicação?**
R: Configure `persistReplicatorLog: true`:
```javascript
new ReplicatorPlugin({
  persistReplicatorLog: true,
  replicatorLogResource: 'replicator_logs',
  replicators: [...]
})
```

### Operações

**P: Como forçar sync completo dos dados?**
R: A replicação é automática e em tempo real via eventos. Para sincronização manual ou inicial, você pode iterar sobre os recursos e replicar manualmente.

**P: Como obter estatísticas de replicação?**
R: Monitore eventos:
```javascript
replicatorPlugin.on('plg:replicator:replicated', (data) => {
  console.log(`Replicated: ${data.operation} on ${data.resourceName}`);
});

replicatorPlugin.on('plg:replicator:error', (data) => {
  console.error(`Failed: ${data.error}`);
});
```

**P: Como skip replicação para operações específicas?**
R: Use a opção `actions`:
```javascript
resources: {
  users: {
    resource: 'users_backup',
    actions: ['inserted', 'updated']  // Skip deletes
  }
}
```

### Transformação

**P: Como transformar dados antes de replicar?**
R: Use a função `transform`:
```javascript
resources: {
  users: {
    resource: 'customer_profiles',
    transform: (data) => ({
      id: data.id,
      name: `${data.firstName} ${data.lastName}`,
      email_domain: data.email?.split('@')[1],
      created_timestamp: Date.now()
    })
  }
}
```

**P: Como skip replicação para registros específicos?**
R: Retorne `null` na função transform:
```javascript
transform: (data) => {
  if (data.status === 'draft') return null;  // Skip drafts
  return data;
}
```

### Troubleshooting

**P: Replicações estão falhando?**
R: Verifique:
1. Credenciais corretas para o destino
2. Recurso de destino existe
3. Função transform não tem erros
4. Use `verbose: true` para logs detalhados

**P: Como reprocessar replicações falhadas?**
R: Se `persistReplicatorLog: true`, consulte os logs e republique manualmente:
```javascript
const failedLogs = await database.resources.replicator_logs.query({
  where: { status: 'error' }
});
```

**P: A replicação está muito lenta?**
R: Aumente `batchSize` e verifique o `timeout`:
```javascript
new ReplicatorPlugin({
  batchSize: 200,
  timeout: 120000  // 2 minutos
})
```

---
