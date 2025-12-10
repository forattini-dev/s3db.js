# 💡 Usage Patterns & Real-World Scenarios

**Prev:** [← Configuration](/plugins/replicator/guides/configuration.md)
**Next:** [Best Practices →](/plugins/replicator/guides/best-practices.md)
**Main:** [← Replicator Plugin](/plugins/replicator/README.md) | **All guides:** [Index](/plugins/replicator/README.md#-documentation-guides)

> **In this guide:**
> - 6 progressive patterns (Beginner → Advanced)
> - Complete working code for each
> - Real-world use cases
> - Copy-paste ready examples
> - Performance tips

**Time to read:** 25 minutes
**Difficulty:** Intermediate → Advanced

---

## Quick Reference

| Level | Use Case | Complexity | Time |
|-------|----------|-----------|------|
| **1** | Simple backup | Beginner | 5 min |
| **2** | Data transformation | Intermediate | 10 min |
| **3** | Multi-destination | Intermediate | 10 min |
| **4** | Error handling | Intermediate | 10 min |
| **5** | Selective replication | Intermediate | 10 min |
| **6** | Production setup | Advanced | 15 min |

---

## Pattern 1: Simple Backup (S3DB → S3DB)

**Perfect for:** Development, disaster recovery, basic data backup

### Setup

```javascript
import { Database, ReplicatorPlugin } from 's3db.js';

const db = new Database({
  connectionString: 's3://key:secret@production-bucket'
});
await db.connect();

// Step 1: Install replicator (backup to another bucket)
const replicatorPlugin = new ReplicatorPlugin({
  replicators: [{
    driver: 's3db',
    resources: ['users', 'orders'],  // What to replicate
    config: {
      connectionString: 's3://key:secret@backup-bucket'  // Where
    }
  }]
});

await db.usePlugin(replicatorPlugin);

console.log('✅ Backup replicator running');
```

### Usage

```javascript
// Step 2: Create resources
const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|required'
  }
});

const orders = await db.createResource({
  name: 'orders',
  attributes: {
    userId: 'string|required',
    total: 'number'
  }
});

// Step 3: All operations automatically replicate!
await users.insert({ name: 'Alice', email: 'alice@example.com' });
// ✅ Automatically replicated to backup-bucket

await orders.insert({ userId: 'user-1', total: 99.99 });
// ✅ Automatically replicated to backup-bucket

// Check backup
const backupDb = new Database({
  connectionString: 's3://key:secret@backup-bucket'
});
await backupDb.connect();

const backupUsers = await backupDb.resources.users.query({});
console.log('Backed up users:', backupUsers.length);
```

**What you get:** Real-time backup, zero maintenance, instant disaster recovery.

---

## Pattern 2: Add Data Transformation

**Perfect for:** Data cleaning, PII removal, field mapping, enrichment

### Setup

```javascript
const replicatorPlugin = new ReplicatorPlugin({
  replicators: [{
    driver: 's3db',
    resources: {
      users: {
        resource: 'users_backup',           // Destination resource
        transform: (data) => ({
          // Keep only public data
          id: data.id,
          name: data.name,
          email: data.email,
          createdAt: data.createdAt,

          // Omit: password, apiKey, sessionTokens, internalNotes

          // Add computed fields
          domain: data.email?.split('@')[1],
          created_date: data.createdAt?.split('T')[0],
          is_admin: data.role === 'admin'
        }),
        actions: ['inserted', 'updated']  // Don't replicate deletes
      }
    },
    config: { connectionString: 's3://backup-bucket' }
  }]
});

await db.usePlugin(replicatorPlugin);
```

### Usage

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|required',
    password: 'secret|required',        // Never replicated (removed by transform)
    role: 'string',
    apiKey: 'string',                   // Never replicated
    internalNotes: 'string'             // Never replicated
  }
});

// Insert with sensitive data
await users.insert({
  name: 'Bob',
  email: 'bob@example.com',
  password: 'super-secret-hash',
  role: 'admin',
  apiKey: 'sk_live_abc123...',
  internalNotes: 'VIP customer - priority support'
});

// Replicated (transformed):
// {
//   id: 'user-1',
//   name: 'Bob',
//   email: 'bob@example.com',
//   domain: 'example.com',
//   created_date: '2024-11-14',
//   is_admin: true
//   // password, apiKey, internalNotes REMOVED
// }
```

**What you get:** Clean backup with sensitive data stripped, enriched fields, selective actions.

---

## Pattern 3: Multi-Destination Replication

**Perfect for:** Analytics, webhooks, microservices, event sourcing

### Setup

```javascript
const replicatorPlugin = new ReplicatorPlugin({
  replicators: [
    // Destination 1: S3DB backup
    {
      driver: 's3db',
      resources: ['users', 'orders'],
      config: { connectionString: 's3://backup-bucket' }
    },

    // Destination 2: PostgreSQL analytics
    {
      driver: 'postgresql',
      resources: {
        orders: {
          resource: 'analytics_orders',
          transform: (data) => ({
            order_id: data.id,
            total_usd: data.total,
            created_at: data.createdAt,
            // Optimized for analytics queries
          })
        }
      },
      config: { connectionString: process.env.POSTGRES_URL }
    },

    // Destination 3: SQS event stream
    {
      driver: 'sqs',
      resources: ['orders'],
      config: {
        queueUrl: process.env.SQS_QUEUE_URL,
        region: 'us-east-1'
      }
    },

    // Destination 4: Webhook to CRM
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
        auth: { type: 'bearer', token: process.env.CRM_TOKEN }
      }
    }
  ]
});

await db.usePlugin(replicatorPlugin);
```

### Usage

```javascript
// One write → Four destinations!

const users = await db.createResource({
  name: 'users',
  attributes: { name: 'string', email: 'string' }
});

const orders = await db.createResource({
  name: 'orders',
  attributes: { userId: 'string', total: 'number' }
});

// Insert user
const user = await users.insert({ name: 'Carol', email: 'carol@example.com' });
// ✅ Replicated to S3DB backup
// ✅ Replicated to CRM webhook
// (No PostgreSQL or SQS - only orders replicate there)

// Insert order
const order = await orders.insert({ userId: user.id, total: 249.99 });
// ✅ Replicated to S3DB backup
// ✅ Replicated to PostgreSQL analytics table
// ✅ Replicated to SQS queue
// ✅ NOT to CRM (only users → CRM)
```

**What you get:** One write, multiple destinations, different transformations per target, selective routing.

---

## Pattern 4: Error Handling & Monitoring

**Perfect for:** Production deployments, debugging, alerting

### Setup

```javascript
const replicatorPlugin = new ReplicatorPlugin({
  // Enable logging and persistence
  logLevel: 'silent',                   // Set to true in development
  persistReplicatorLog: true,       // Store in database
  logErrors: true,
  maxRetries: 3,
  timeout: 30000,

  replicators: [{
    driver: 'postgresql',
    resources: ['orders'],
    config: { connectionString: process.env.ANALYTICS_DB }
  }]
});

await db.usePlugin(replicatorPlugin);
```

### Monitoring

```javascript
// Track successful replication
replicatorPlugin.on('plg:replicator:replicated', (event) => {
  console.log('✅ Replicated:', {
    operation: event.operation,  // inserted, updated, deleted
    resource: event.resource,
    recordId: event.recordId,
    duration: event.duration,    // milliseconds
    destination: event.destination
  });

  // Send to monitoring service
  metrics.recordReplication({
    operation: event.operation,
    duration: event.duration
  });
});

// Track failures
replicatorPlugin.on('plg:replicator:error', (error) => {
  console.error('❌ Replication failed:', {
    resource: error.resource,
    recordId: error.recordId,
    operation: error.operation,
    reason: error.message,
    willRetry: error.retryCount < 3
  });

  // Alert on persistent failures
  if (error.retryCount >= 3) {
    alerting.sendAlert({
      severity: 'critical',
      title: 'Replication permanently failed',
      details: `${error.resource}: ${error.message}`
    });
  }
});

// Query logs
const logs = await db.resources.plg_replicator_logs;

// Recent errors
const errors = await logs.query({
  status: 'failed',
  timestamp: { $gte: Date.now() - 3600000 }  // Last hour
});
console.log(`${errors.length} errors in last hour`);

// Error rate by resource
const orderErrors = await logs.query({
  resource: 'orders',
  status: 'failed'
});
console.log(`Orders: ${orderErrors.length} failed replications`);

// Health endpoint
app.get('/health/replication', async (req, res) => {
  const recentErrors = await logs.query({
    status: 'failed',
    timestamp: { $gte: Date.now() - 300000 }  // Last 5 minutes
  });

  if (recentErrors.length > 5) {
    return res.status(503).json({
      status: 'unhealthy',
      errors: recentErrors.length
    });
  }

  res.json({ status: 'healthy' });
});
```

**What you get:** Complete visibility, easy debugging, production monitoring, health checks.

---

## Pattern 5: Selective Replication with Filters

**Perfect for:** High-volume data, compliance, performance optimization

### Setup

```javascript
const replicatorPlugin = new ReplicatorPlugin({
  replicators: [{
    driver: 'postgresql',
    resources: {
      // Replicate all completed orders > $100
      orders: {
        resource: 'premium_orders',
        shouldReplicate: (data, action) => {
          // Never replicate deletes
          if (action === 'deleted') return false;

          // Only orders > $100
          if (data.total < 100) return false;

          // Only completed orders
          if (data.status !== 'completed') return false;

          return true;
        },
        transform: (data) => ({
          order_id: data.id,
          total: data.total,
          status: data.status,
          completed_at: new Date().toISOString()
        })
      },

      // Replicate only VIP customers
      users: {
        resource: 'vip_users',
        shouldReplicate: (data) => {
          return data.tier === 'vip' || data.lifetime_value > 10000;
        },
        transform: (data) => ({
          user_id: data.id,
          email: data.email,
          tier: data.tier,
          ltv: data.lifetime_value
        })
      }
    },
    config: { connectionString: process.env.ANALYTICS_DB }
  }]
});

await db.usePlugin(replicatorPlugin);
```

### Usage

```javascript
const orders = await db.createResource({
  name: 'orders',
  attributes: {
    total: 'number',
    status: 'string'  // pending, completed, cancelled
  }
});

const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string',
    tier: 'string',  // standard, vip, enterprise
    lifetime_value: 'number'
  }
});

// Insert small order
await orders.insert({ total: 50, status: 'completed' });
// ❌ NOT replicated (total < 100)

// Insert large order
await orders.insert({ total: 500, status: 'completed' });
// ✅ Replicated to analytics

// Insert pending order
await orders.insert({ total: 500, status: 'pending' });
// ❌ NOT replicated (not completed)

// Insert standard user
await users.insert({ email: 'john@example.com', tier: 'standard', lifetime_value: 100 });
// ❌ NOT replicated

// Insert VIP user
await users.insert({ email: 'vip@example.com', tier: 'vip', lifetime_value: 50000 });
// ✅ Replicated to vip_users table
```

**What you get:** Reduced storage, better performance, compliance (only replicate what's needed).

---

## Pattern 6: Production - Multi-Region Sync

**Perfect for:** High availability, disaster recovery, compliance

### Setup

```javascript
const replicatorPlugin = new ReplicatorPlugin({
  logLevel: 'silent',
  persistReplicatorLog: true,
  maxRetries: 3,
  replicatorConcurrency: 10,

  replicators: [
    // Primary backup (same region, fast failover)
    {
      driver: 's3db',
      resources: ['users', 'orders', 'products'],
      config: {
        connectionString: 's3://us-east-1-backup/...'
      }
    },

    // Secondary backup (different region, true DR)
    {
      driver: 's3db',
      resources: ['users', 'orders', 'products'],
      config: {
        connectionString: 's3://eu-west-1-backup/...'
      }
    },

    // Analytics (BigQuery for dashboards)
    {
      driver: 'bigquery',
      resources: {
        orders: {
          resource: 'analytics.orders',
          transform: (data) => ({
            order_id: data.id,
            total_usd: parseFloat(data.total),
            status: data.status,
            created_timestamp: new Date(data.createdAt).getTime()
          })
        },
        users: {
          resource: 'analytics.users'
        }
      },
      config: {
        projectId: process.env.GCP_PROJECT,
        dataset: 'dashboards'
      }
    },

    // Event stream (SQS for microservices)
    {
      driver: 'sqs',
      resources: ['orders'],
      config: {
        queueUrl: process.env.SQS_QUEUE_URL,
        region: 'us-east-1'
      }
    }
  ]
});

await db.usePlugin(replicatorPlugin);
```

### Health Monitoring

```javascript
// Comprehensive health check
app.get('/health/replication', async (req, res) => {
  const logs = await db.resources.plg_replicator_logs;

  // Check errors in last 5 minutes
  const recentErrors = await logs.query({
    status: 'failed',
    timestamp: { $gte: Date.now() - 300000 }
  });

  // Check errors by destination
  const s3Errors = recentErrors.filter(e => e.destination === 's3db');
  const bqErrors = recentErrors.filter(e => e.destination === 'bigquery');
  const sqsErrors = recentErrors.filter(e => e.destination === 'sqs');

  const status = {
    overall: recentErrors.length <= 5 ? 'healthy' : 'degraded',
    errors: {
      total: recentErrors.length,
      s3db: s3Errors.length,
      bigquery: bqErrors.length,
      sqs: sqsErrors.length
    },
    timestamp: new Date().toISOString()
  };

  const httpStatus = recentErrors.length <= 5 ? 200 : 503;
  res.status(httpStatus).json(status);
});

// Alerting
replicatorPlugin.on('plg:replicator:error', (error) => {
  // Alert on destination-specific failures
  const key = `replication_error:${error.destination}`;
  const count = incrementCounter(key, 5 * 60);  // 5 minute window

  if (count >= 10) {
    // 10+ errors in 5 minutes
    alerting.critical({
      title: `Replication failures to ${error.destination}`,
      details: `${count} errors in last 5 minutes`
    });
  }
});

// Scheduled recovery job
setInterval(async () => {
  const logs = await db.resources.plg_replicator_logs;
  const failedOps = await logs.query({
    status: 'failed',
    retryCount: { $lt: 3 }
  });

  console.log(`Retrying ${failedOps.length} failed replications...`);
  // Retry implementation
}, 60000);  // Every minute
```

**What you get:** True disaster recovery, multi-region redundancy, comprehensive monitoring, production reliability.

---

## Common Patterns Comparison

| Pattern | Targets | Complexity | Best For |
|---------|---------|-----------|----------|
| **1** | 1 (backup) | Low | Simple backup |
| **2** | 1 (transformed) | Low | Data cleaning |
| **3** | 4+ | Medium | Analytics + webhooks |
| **4** | 4+ | Medium | Production monitoring |
| **5** | 1-2 | Medium | Performance optimization |
| **6** | 4+ | High | Enterprise HA |

---

## Copy-Paste Recipes

### Recipe 1: PostgreSQL + BigQuery

```javascript
new ReplicatorPlugin({
  replicators: [
    {
      driver: 'postgresql',
      resources: ['orders', 'users'],
      config: { connectionString: process.env.POSTGRES_URL }
    },
    {
      driver: 'bigquery',
      resources: ['orders', 'users'],
      config: {
        projectId: process.env.GCP_PROJECT,
        dataset: 'analytics'
      }
    }
  ]
})
```

### Recipe 2: S3DB Backup + SQS Events

```javascript
new ReplicatorPlugin({
  replicators: [
    {
      driver: 's3db',
      resources: ['orders'],
      config: { connectionString: 's3://backup-bucket' }
    },
    {
      driver: 'sqs',
      resources: ['orders'],
      config: { queueUrl: process.env.SQS_URL, region: 'us-east-1' }
    }
  ]
})
```

### Recipe 3: PostgreSQL with Transform

```javascript
new ReplicatorPlugin({
  replicators: [{
    driver: 'postgresql',
    resources: {
      users: {
        resource: 'analytics_users',
        transform: (data) => ({
          user_id: data.id,
          email: data.email,
          signup_date: data.createdAt
        })
      }
    },
    config: { connectionString: process.env.POSTGRES_URL }
  }]
})
```

---

**Prev:** [← Configuration](/plugins/replicator/guides/configuration.md)
**Next:** [Best Practices →](/plugins/replicator/guides/best-practices.md)
**Main:** [← Replicator Plugin](/plugins/replicator/README.md)
