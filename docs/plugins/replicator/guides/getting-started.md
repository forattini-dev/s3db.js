# 🚀 Getting Started with Replicator Plugin

**Prev:** [← Replicator Plugin](../README.md)
**Next:** [Configuration →](./configuration.md)
**Main:** [← Replicator Plugin](../README.md) | **All guides:** [Index](../README.md#-documentation-guides)

> **In this guide:**
> - What is real-time CDC (Change Data Capture)
> - Installation and dependencies
> - Minimal working example
> - Your first replication setup
> - Monitoring replication

**Time to read:** 10 minutes
**Difficulty:** Beginner

---

## What is Real-Time Replication?

Replicator Plugin provides **real-time CDC** (Change Data Capture):

- ✅ Every insert/update/delete is replicated individually
- ✅ Near real-time (<10ms latency per operation)
- ✅ To multiple destinations simultaneously
- ✅ With automatic retry and error handling
- ✅ With optional data transformation

**Example:**
```javascript
await users.insert({ name: 'John' });
// → Automatically replicated to PostgreSQL in ~2s
// → Automatically replicated to BigQuery in ~2s
// → Automatically replicated to SQS in ~2s
```

No manual ETL scripts. No batch jobs. No data delays.

---

## Installation (2 minutes)

### Step 1: Install Core Library

```bash
pnpm install s3db.js
```

### Step 2: Install Driver(s)

Choose the destination(s) you need:

**PostgreSQL:**
```bash
pnpm install pg
```

**MySQL / MariaDB / PlanetScale:**
```bash
pnpm install mysql2
```

**Google BigQuery:**
```bash
pnpm install @google-cloud/bigquery
```

**AWS SQS:**
```bash
pnpm install @aws-sdk/client-sqs
```

**MongoDB:**
```bash
pnpm install mongodb
```

**DynamoDB:**
```bash
pnpm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

**Turso (SQLite Edge):**
```bash
pnpm install @libsql/client
```

**Webhooks:**
```bash
# No installation needed! Uses Node.js built-in fetch
```

**Another S3DB instance:**
```bash
# No installation needed! Uses same s3db.js
```

### Installation Examples

**Full-stack analytics:**
```bash
pnpm install s3db.js pg @google-cloud/bigquery @aws-sdk/client-sqs
```

**Multi-cloud database:**
```bash
pnpm install s3db.js mongodb @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

**Minimum Node.js:** 18.x (for native fetch, Web Streams)

---

## Quick Start (5 minutes)

### Setup Replicator

```javascript
import { Database, ReplicatorPlugin } from 's3db.js';

// 1. Create database
const db = new Database({
  connectionString: 's3://key:secret@my-bucket'
});
await db.connect();

// 2. Install replicator (replicate to another S3DB instance)
const replicatorPlugin = new ReplicatorPlugin({
  replicators: [{
    driver: 's3db',
    resources: ['users'],  // Replicate this resource
    config: {
      connectionString: 's3://key:secret@backup-bucket'  // To here
    }
  }]
});

await db.usePlugin(replicatorPlugin);

console.log('✅ Replicator running');
```

### Create Resource

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|required',
    active: 'boolean'
  }
});
```

### Use Normally (Replication is Automatic!)

```javascript
// Insert - automatically replicated
await users.insert({
  name: 'Alice',
  email: 'alice@example.com',
  active: true
});
// ✅ Replicated to backup-bucket in ~2 seconds

// Update - automatically replicated
await users.update('user-id-1', {
  name: 'Alice Updated'
});
// ✅ Update replicated in ~2 seconds

// Delete - automatically replicated
await users.delete('user-id-2');
// ✅ Delete replicated in ~2 seconds
```

### Monitor Replication

```javascript
// Track successful replication
replicatorPlugin.on('plg:replicator:replicated', (event) => {
  console.log('✅ Replicated:', {
    operation: event.operation,  // 'inserted', 'updated', 'deleted'
    resource: event.resource,
    recordId: event.recordId,
    duration: event.duration     // milliseconds
  });
});

// Track replication errors
replicatorPlugin.on('plg:replicator:error', (error) => {
  console.error('❌ Replication failed:', error.message);
});
```

---

## Your First Real Replication

Let's set up replication to **PostgreSQL** (most common):

### Step 1: Install Dependencies

```bash
pnpm install s3db.js pg
```

### Step 2: Setup Database

```javascript
import { Database, ReplicatorPlugin } from 's3db.js';

const db = new Database({
  connectionString: 's3://key:secret@my-bucket'
});
await db.connect();

// Install replicator
const replicatorPlugin = new ReplicatorPlugin({
  replicators: [{
    driver: 'postgresql',
    resources: {
      users: 'users_table',        // Map: S3DB resource → table name
      orders: 'orders_table'
    },
    config: {
      connectionString: 'postgresql://user:pass@localhost:5432/analytics',
      schemaSync: {
        enabled: true,             // Auto-create tables
        strategy: 'alter',         // Add missing columns
        onMismatch: 'error'        // Fail if schema mismatch
      }
    }
  }]
});

await db.usePlugin(replicatorPlugin);

console.log('✅ PostgreSQL replication running');
```

### Step 3: Create S3DB Resources

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required',
    name: 'string|required',
    age: 'number',
    active: 'boolean'
  }
});

const orders = await db.createResource({
  name: 'orders',
  attributes: {
    userId: 'string|required',
    total: 'number|required',
    status: 'string'  // pending, shipped, delivered
  }
});
```

### Step 4: Operations Replicate Automatically

```javascript
// All these operations automatically replicate to PostgreSQL

// Insert user
const user = await users.insert({
  email: 'john@example.com',
  name: 'John Doe',
  age: 30,
  active: true
});
// ✅ Inserted into PostgreSQL's `users_table`

// Insert order
const order = await orders.insert({
  userId: user.id,
  total: 99.99,
  status: 'pending'
});
// ✅ Inserted into PostgreSQL's `orders_table`

// Update order
await orders.update(order.id, {
  status: 'shipped'
});
// ✅ Updated in PostgreSQL in real-time

// Delete (if enabled)
await orders.delete(order.id);
// ✅ Deleted from PostgreSQL in real-time
```

### Step 5: Check PostgreSQL

```sql
-- Tables auto-created!
SELECT * FROM users_table;
-- | id | email | name | age | active | created_at | updated_at |
-- | -- | ----- | ---- | --- | ------ | ---------- | ---------- |
-- | 1  | john@example.com | John Doe | 30 | true | 2024-11-14 | 2024-11-14 |

SELECT * FROM orders_table;
-- | id | userId | total | status | created_at | updated_at |
-- | -- | ------ | ----- | ------ | ---------- | ---------- |
-- | 1  | 1 | 99.99 | shipped | 2024-11-14 | 2024-11-14 |
```

---

## Common Replication Targets

### S3DB (Backup to Another Bucket)

```javascript
new ReplicatorPlugin({
  replicators: [{
    driver: 's3db',
    resources: ['users', 'orders'],
    config: {
      connectionString: 's3://key:secret@backup-bucket'
    }
  }]
})
```

### SQS (Event Stream)

```javascript
new ReplicatorPlugin({
  replicators: [{
    driver: 'sqs',
    resources: ['orders'],
    config: {
      queueUrl: process.env.SQS_QUEUE_URL,
      region: 'us-east-1'
    }
  }]
})

// Each order insert/update/delete becomes a message in SQS
// Perfect for event-driven architectures
```

### Webhook (HTTP Callback)

```javascript
new ReplicatorPlugin({
  replicators: [{
    driver: 'webhook',
    resources: ['users'],
    config: {
      url: 'https://crm.example.com/api/sync',
      headers: {
        'Authorization': `Bearer ${process.env.WEBHOOK_TOKEN}`
      }
    }
  }]
})

// Each operation POSTs to your webhook
// Perfect for CRM/analytics integration
```

### BigQuery (Analytics)

```javascript
new ReplicatorPlugin({
  replicators: [{
    driver: 'bigquery',
    resources: ['events', 'users'],
    config: {
      projectId: 'my-gcp-project',
      dataset: 'analytics',
      location: 'US'
    }
  }]
})

// Real-time data warehouse population
```

---

## Data Transformation

Transform data before replication:

```javascript
new ReplicatorPlugin({
  replicators: [{
    driver: 'postgresql',
    resources: {
      users: {
        resource: 'users_table',
        transform: (data) => ({
          // Keep only public fields
          user_id: data.id,
          email: data.email,
          name: data.name,
          // Omit: password, apiKey, tokens
          // Add: computed fields
          created_date: data.createdAt?.split('T')[0]
        })
      }
    },
    config: { connectionString: process.env.POSTGRES_URL }
  }]
})
```

---

## Selective Actions

Replicate only certain operations:

```javascript
new ReplicatorPlugin({
  replicators: [{
    driver: 'webhook',
    resources: {
      users: {
        actions: ['inserted']  // Only new users
      },
      orders: {
        actions: ['inserted', 'updated']  // New and updated, not deletes
      }
    },
    config: { url: 'https://api.example.com/sync' }
  }]
})
```

---

## Error Handling

Add retry and error logging:

```javascript
const replicatorPlugin = new ReplicatorPlugin({
  maxRetries: 3,                    // Retry 3 times
  retryBackoffMs: 1000,            // Start with 1s delay
  persistReplicatorLog: true,       // Store logs in database
  verbose: true,                   // Debug logging

  replicators: [{
    driver: 'postgresql',
    resources: ['orders'],
    config: { connectionString: process.env.POSTGRES_URL }
  }]
});

// Handle errors
replicatorPlugin.on('plg:replicator:error', (error) => {
  console.error('Replication failed:', {
    resource: error.resource,
    operation: error.operation,
    reason: error.message,
    willRetry: error.retryCount < 3
  });
});

// Check logs
const logs = await db.resources.plg_replicator_logs;
const errors = await logs.query({ status: 'failed' });
console.log(`${errors.length} replication errors`);
```

---

## Multi-Destination Replication

Replicate to multiple places simultaneously:

```javascript
new ReplicatorPlugin({
  replicators: [
    // Destination 1: PostgreSQL for analytics
    {
      driver: 'postgresql',
      resources: ['orders'],
      config: { connectionString: process.env.POSTGRES_URL }
    },
    // Destination 2: BigQuery for dashboards
    {
      driver: 'bigquery',
      resources: ['orders'],
      config: { projectId: 'my-project', dataset: 'dashboards' }
    },
    // Destination 3: SQS for event processing
    {
      driver: 'sqs',
      resources: ['orders'],
      config: { queueUrl: process.env.SQS_URL, region: 'us-east-1' }
    },
    // Destination 4: Webhook to CRM
    {
      driver: 'webhook',
      resources: {
        orders: {
          actions: ['inserted'],  // Only new orders
          transform: (data) => ({ order_id: data.id, total: data.total })
        }
      },
      config: { url: 'https://crm.example.com/orders' }
    }
  ]
})

// One write to S3DB → Four destinations!
```

---

## Common Mistakes

### ❌ Mistake 1: Driver Not Installed

```javascript
// Error: Cannot find module 'pg'
new ReplicatorPlugin({
  replicators: [{
    driver: 'postgresql',
    resources: ['users'],
    config: { connectionString: '...' }
  }]
})

// Fix: Install driver first
// pnpm install pg
```

### ❌ Mistake 2: Forgetting to Check Permissions

```javascript
// PostgreSQL connection fails silently
new ReplicatorPlugin({
  replicators: [{
    driver: 'postgresql',
    resources: ['users'],
    config: {
      connectionString: 'postgresql://user:WRONG_PASSWORD@localhost/db'
    }
  }]
})

// Fix: Test connection separately
// psql postgresql://user:password@localhost/db
```

### ❌ Mistake 3: Resource Name Mismatch

```javascript
// Replicating from 'users' but destination expects 'app_users'
new ReplicatorPlugin({
  replicators: [{
    driver: 'postgresql',
    resources: ['users'],  // S3DB resource
    config: { ... }
  }]
})

// Fix: Map explicitly
new ReplicatorPlugin({
  replicators: [{
    driver: 'postgresql',
    resources: {
      users: 'app_users'  // S3DB: users → PostgreSQL: app_users
    },
    config: { ... }
  }]
})
```

---

## Next Steps

1. **Configure your setup** → [Configuration Guide](./configuration.md)
2. **See usage patterns** → [Usage Patterns](./usage-patterns.md)
3. **Setup production** → [Best Practices](./best-practices.md)

---

**Prev:** [← Replicator Plugin](../README.md)
**Next:** [Configuration →](./configuration.md)
**Main:** [← Replicator Plugin](../README.md)
