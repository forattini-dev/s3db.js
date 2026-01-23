# 🔄 Replicator Plugin

> **Real-time change data capture (CDC) to PostgreSQL, BigQuery, SQS, webhooks, and more.**
>
> **Navigation:** [Getting Started →](/plugins/replicator/guides/getting-started.md) | [Configuration →](/plugins/replicator/guides/configuration.md) | [Usage Patterns →](/plugins/replicator/guides/usage-patterns.md) | [Best Practices →](/plugins/replicator/guides/best-practices.md)

---

## ⚡ TLDR

**Real-time CDC** (Change Data Capture) replication to multiple destinations - **each operation replicated individually** in near real-time.

```javascript
import { Database } from 's3db.js';
import { ReplicatorPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

// One line to replicate everything!
await db.usePlugin(new ReplicatorPlugin({
  replicators: [{
    driver: 'postgresql',           // Or: bigquery, sqs, webhook, etc.
    resources: ['users', 'orders'],
    config: {
      connectionString: process.env.DATABASE_URL,
      schemaSync: { enabled: true }  // Auto-create tables
    }
  }]
}));

// All operations automatically replicated!
const users = await db.resources.users;
await users.insert({ name: 'Alice', email: 'alice@example.com' });
// ✅ Replicated to PostgreSQL in ~2 seconds
```

**Key features:**
- ✅ **Real-Time CDC**: Each insert/update/delete replicated individually (<10ms latency)
- ✅ **Multi-target**: S3DB, BigQuery, PostgreSQL, MySQL, DynamoDB, MongoDB, SQS, Webhooks
- ✅ **Data transformation** with custom functions
- ✅ **Automatic retry** with exponential backoff
- ✅ **Schema sync** - Auto-create and update database tables
- ✅ **Selective replication** - Replicate only what's needed
- ✅ **Event monitoring** - Track all operations

---

## 📦 Dependencies

**Required:**
```bash
pnpm install s3db.js
```

**Optional Drivers (install what you need):**

```bash
# PostgreSQL
pnpm install pg

# MySQL / MariaDB / PlanetScale
pnpm install mysql2

# Google BigQuery
pnpm install @google-cloud/bigquery

# AWS SQS
pnpm install @aws-sdk/client-sqs

# MongoDB
pnpm install mongodb

# AWS DynamoDB
pnpm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb

# Turso (SQLite Edge)
pnpm install @libsql/client

# Webhooks & S3DB: No installation needed!
```

---

## 🚀 Quick Start (3 minutes)

### 1. Install Dependencies

```bash
pnpm install s3db.js pg
```

### 2. Setup Replicator

```javascript
import { Database } from 's3db.js';
import { ReplicatorPlugin } from 's3db.js';

const db = new Database({
  connectionString: 's3://key:secret@my-bucket'
});
await db.connect();

await db.usePlugin(new ReplicatorPlugin({
  replicators: [{
    driver: 'postgresql',
    resources: ['users', 'orders'],
    config: {
      connectionString: 'postgresql://user:pass@localhost/analytics',
      schemaSync: { enabled: true }  // Auto-create tables
    }
  }]
}));

console.log('✅ Replication running');
```

### 3. Use Normally (Replication is Automatic!)

```javascript
const users = await db.resources.users;

// Insert - automatically replicated
await users.insert({ name: 'Bob', email: 'bob@example.com' });
// ✅ Appeared in PostgreSQL in ~2s

// Update - automatically replicated
await users.update('user-id', { name: 'Bob Updated' });
// ✅ Updated in PostgreSQL in ~2s
```

---

## 📚 Documentation Guides

All documentation is organized into focused guides:

### 🎯 For First-Time Users
- **[Getting Started](/plugins/replicator/guides/getting-started.md)** (10 min) - Installation, quick start, common targets
  - What is real-time CDC
  - Installation & dependencies
  - 5-minute quick start
  - Your first replication setup
  - Common replication targets
  - Error handling basics

### ⚙️ Configuration & Setup
- **[Configuration Guide](/plugins/replicator/guides/configuration.md)** (15 min) - All configuration options & drivers
  - Default configuration object
  - Plugin-level options
  - 3 configuration patterns (Development, PostgreSQL, Multi-destination)
  - Schema sync setup
  - Complete driver reference (S3DB, PostgreSQL, BigQuery, SQS, Webhook, etc.)
  - Resource mapping options
  - Performance tuning

### 💡 Real-World Scenarios
- **[Usage Patterns](/plugins/replicator/guides/usage-patterns.md)** (25 min) - 6 progressive patterns with complete code
  - Pattern 1: Simple Backup (S3DB → S3DB)
  - Pattern 2: Data Transformation
  - Pattern 3: Multi-Destination Replication
  - Pattern 4: Error Handling & Monitoring
  - Pattern 5: Selective Replication with Filters
  - Pattern 6: Production Multi-Region Sync
  - Copy-paste recipes

### ✅ Best Practices & Troubleshooting
- **[Best Practices & FAQ](/plugins/replicator/guides/best-practices.md)** (25 min) - Production deployment
  - 6 essential best practices with code examples
  - Error handling strategies
  - Common issues & solutions
  - 20+ FAQ entries across 5 categories
  - Production deployment checklist

---

## 🎯 Key Features

### Real-Time CDC

Every database operation replicated immediately:

```javascript
// All these are replicated in near real-time
await users.insert(newUser);      // ~2 seconds to PostgreSQL
await users.update(id, changes);  // ~2 seconds to PostgreSQL
await users.delete(id);           // ~2 seconds to PostgreSQL
```

### Multi-Destination

Replicate to 4+ targets with different transformations:

```javascript
new ReplicatorPlugin({
  replicators: [
    // Backup to S3DB
    { driver: 's3db', resources: ['users'], config: { ... } },
    // Analytics to PostgreSQL
    { driver: 'postgresql', resources: ['users'], config: { ... } },
    // Dashboards to BigQuery
    { driver: 'bigquery', resources: ['users'], config: { ... } },
    // Events to SQS
    { driver: 'sqs', resources: ['users'], config: { ... } }
  ]
})
```

### Schema Sync

Automatically create and update database tables:

```javascript
{
  driver: 'postgresql',
  config: {
    connectionString: '...',
    schemaSync: {
      enabled: true,           // Auto-create tables
      strategy: 'alter',       // Add missing columns
      onMismatch: 'warn'       // Warn on schema mismatch
    }
  }
}
```

### Data Transformation

Transform data before replication:

```javascript
{
  resources: {
    users: {
      resource: 'user_profiles',  // Different table name
      transform: (data) => ({
        user_id: data.id,
        email: data.email,
        // Omit: password, apiKey, sensitive fields
        created_date: new Date(data.createdAt).toISOString().split('T')[0]
      })
    }
  }
}
```

### Selective Actions & Filtering

Replicate only what you need:

```javascript
{
  resources: {
    users: {
      actions: ['inserted'],    // Only new users
      shouldReplicate: (data) => data.active === true  // Only active
    },
    logs: {
      actions: []               // Never replicate logs
    }
  }
}
```

---

## 🔄 Typical Workflows

### 1. Analytics Pipeline

Replicate operational data to PostgreSQL for analytics:

```javascript
{
  driver: 'postgresql',
  resources: {
    orders: { resource: 'analytics_orders' },
    users: { resource: 'analytics_users' }
  },
  config: { connectionString: process.env.ANALYTICS_DB }
}
```

### 2. Event Streaming

Stream events to SQS for microservices:

```javascript
{
  driver: 'sqs',
  resources: ['orders', 'payments'],
  config: {
    queueUrl: process.env.SQS_URL,
    region: 'us-east-1'
  }
}
```

### 3. Real-Time Backup

Backup to another S3 bucket:

```javascript
{
  driver: 's3db',
  resources: ['users', 'orders'],
  config: { connectionString: 's3://backup-bucket' }
}
```

### 4. Multi-Region HA

Backup to multiple regions:

```javascript
[
  { driver: 's3db', resources: [...], config: { connectionString: 's3://us-east-1-backup' } },
  { driver: 's3db', resources: [...], config: { connectionString: 's3://eu-west-1-backup' } }
]
```

---

## ❓ Quick FAQ

<details>
<summary><strong>Q: What's the difference between Replicator and Backup plugins?</strong></summary>

**Replicator:** Real-time per-operation sync (fast, multiple destinations)
**Backup:** Periodic snapshots (slow, disaster recovery)

See [detailed comparison](/plugins/replicator/guides/best-practices.md#-faq) for more.
</details>

<details>
<summary><strong>Q: How fast is replication?</strong></summary>

Near real-time: ~2-5 seconds from insert to destination.
Minimal latency (<10ms) to start replication process.

For analytics that's real-time enough!
</details>

<details>
<summary><strong>Q: Can I replicate to multiple PostgreSQL databases?</strong></summary>

Yes! Just configure multiple replicators:

```javascript
new ReplicatorPlugin({
  replicators: [
    { driver: 'postgresql', resources: [...], config: { connectionString: 'db1' } },
    { driver: 'postgresql', resources: [...], config: { connectionString: 'db2' } }
  ]
})
```
</details>

<details>
<summary><strong>Q: What if destination goes down?</strong></summary>

Automatic retry with exponential backoff (up to 3 times by default).
Failed operations stored in log resource.

**[→ See recovery strategies](/plugins/replicator/guides/best-practices.md#error-handling-strategies)**
</details>

<details>
<summary><strong>Q: Can I skip certain records?</strong></summary>

Yes, use `shouldReplicate` filter:

```javascript
{
  resources: {
    orders: {
      shouldReplicate: (data) => data.total > 100  // Only large orders
    }
  }
}
```
</details>

---

## 🗂️ Common Use Cases

| Use Case | Driver | Guide |
|----------|--------|-------|
| **Dev/Testing** | S3DB | [Getting Started](/plugins/replicator/guides/getting-started.md) |
| **Analytics** | PostgreSQL | [Usage Patterns](/plugins/replicator/guides/usage-patterns.md#pattern-3-multi-destination-replication) |
| **Dashboards** | BigQuery | [Usage Patterns](/plugins/replicator/guides/usage-patterns.md#pattern-3-multi-destination-replication) |
| **Event Stream** | SQS | [Usage Patterns](/plugins/replicator/guides/usage-patterns.md#pattern-3-multi-destination-replication) |
| **Backup** | S3DB | [Getting Started](/plugins/replicator/guides/getting-started.md) |
| **Production** | Multi-target | [Best Practices](/plugins/replicator/guides/best-practices.md#production-deployment-checklist) |

---

## 🚀 Next Steps

1. **New to replication?** → [Getting Started](/plugins/replicator/guides/getting-started.md)
2. **Want to configure?** → [Configuration Guide](/plugins/replicator/guides/configuration.md)
3. **Need code examples?** → [Usage Patterns](/plugins/replicator/guides/usage-patterns.md)
4. **Going to production?** → [Best Practices](/plugins/replicator/guides/best-practices.md)
5. **Troubleshooting?** → [Best Practices FAQ](/plugins/replicator/guides/best-practices.md#-faq)

---

## 📖 Full Documentation Index

| Topic | Guide | Time |
|-------|-------|------|
| **Setup** | [Getting Started](/plugins/replicator/guides/getting-started.md) | 10 min |
| **Configuration** | [Configuration Guide](/plugins/replicator/guides/configuration.md) | 15 min |
| **Examples** | [Usage Patterns](/plugins/replicator/guides/usage-patterns.md) | 25 min |
| **Production** | [Best Practices](/plugins/replicator/guides/best-practices.md) | 25 min |

**Total Reading Time: ~75 minutes for complete understanding**

---

## 🔗 Related Plugins

- **[Backup Plugin](/plugins/backup/README.md)** - Periodic snapshots for disaster recovery
- **[TTL Plugin](/plugins/ttl/README.md)** - Auto-expire old data
- **[Audit Plugin](/plugins/audit/README.md)** - Track all changes
- **[Cache Plugin](/plugins/cache/README.md)** - Speed up queries

---

## 💬 Need Help?

- 📖 Check the [FAQ](/plugins/replicator/guides/best-practices.md#-faq) - Most questions answered
- 🔍 Read the [guide index](#-documentation-guides) - Find what you need
- 🎯 Try [usage patterns](/plugins/replicator/guides/usage-patterns.md) - Copy-paste solutions
- 🐛 Found a bug? Open an issue on GitHub
- 💡 Have a question? Check detailed guides or ask the community

---

**Ready to replicate?** Start with [Getting Started →](/plugins/replicator/guides/getting-started.md)
