# 🗃️ s3db.js

<p align="center">
  <img width="200" src="https://img.icons8.com/fluency/200/database.png" alt="s3db.js">
</p>

<p align="center">
  <strong>Transform AWS S3 into a powerful document database</strong><br>
  <em>Zero-cost storage • Automatic encryption • ORM-like interface • Streaming API</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/s3db.js"><img src="https://img.shields.io/npm/v/s3db.js.svg?style=flat&color=brightgreen" alt="npm version"></a>
  &nbsp;
  <a href="https://github.com/forattini-dev/s3db.js"><img src="https://img.shields.io/github/stars/forattini-dev/s3db.js?style=flat&color=yellow" alt="GitHub stars"></a>
  &nbsp;
  <a href="https://github.com/forattini-dev/s3db.js/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Unlicense-blue.svg?style=flat" alt="License"></a>
  &nbsp;
  <a href="https://api.codeclimate.com/v1/badges/26e3dc46c42367d44f18/maintainability"><img src="https://api.codeclimate.com/v1/badges/26e3dc46c42367d44f18/maintainability" alt="Maintainability"></a>
  &nbsp;
  <a href="https://coveralls.io/github/forattini-dev/s3db.js?branch=main"><img src="https://coveralls.io/repos/github/forattini-dev/s3db.js/badge.svg?branch=main&style=flat" alt="Coverage Status"></a>
</p>

<p align="center">
  <a href="https://github.com/forattini-dev/s3db.js"><img src="https://img.shields.io/badge/Built_with-Node.js-339933.svg?style=flat&logo=node.js" alt="Built with Node.js"></a>
  &nbsp;
  <a href="https://aws.amazon.com/s3/"><img src="https://img.shields.io/badge/Powered_by-AWS_S3-FF9900.svg?style=flat&logo=amazon-aws" alt="Powered by AWS S3"></a>
  &nbsp;
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Runtime-Node.js-339933.svg?style=flat&logo=node.js" alt="Node.js Runtime"></a>
</p>

<br>

## 🚀 What is s3db.js?

**s3db.js** is a revolutionary document database that transforms AWS S3 into a fully functional database using S3's metadata capabilities. Instead of traditional storage methods, it stores document data in S3's metadata fields (up to 2KB), making it incredibly cost-effective while providing a familiar ORM-like interface.

**Perfect for:**
- 🌐 **Serverless applications** - No database servers to manage
- 💰 **Cost-conscious projects** - Pay only for what you use
- 🔒 **Secure applications** - Built-in encryption and validation
- 📊 **Analytics platforms** - Efficient data streaming and processing
- 🚀 **Rapid prototyping** - Get started in minutes, not hours

---

## ✨ Key Features

<table>
<tr>
<td width="50%">

### 🎯 **Database Operations**
- **ORM-like Interface** - Familiar CRUD operations
- **Schema Validation** - Automatic data validation
- **Streaming API** - Handle large datasets efficiently
- **Event System** - Real-time notifications

</td>
<td width="50%">

### 🔐 **Security & Performance**
- **Field-level Encryption** - Secure sensitive data
- **Intelligent Caching** - Reduce API calls
- **Auto-generated Passwords** - Secure by default
- **Cost Tracking** - Monitor AWS expenses

</td>
</tr>
<tr>
<td width="50%">

### 📦 **Data Management**
- **Partitions** - Organize data efficiently
- **Bulk Operations** - Handle multiple records
- **Nested Objects** - Complex data structures
- **Automatic Timestamps** - Track changes

</td>
<td width="50%">

### 🔧 **Extensibility**
- **Custom Behaviors** - Handle large documents
- **Hooks System** - Custom business logic
- **Plugin Architecture** - Extend functionality
- **Event System** - Real-time notifications

</td>
</tr>
</table>

---

## 📋 Table of Contents

- [🚀 What is s3db.js?](#-what-is-s3dbjs)
- [✨ Key Features](#-key-features)
- [🚀 Quick Start](#-quick-start)
- [💾 Installation](#-installation)
- [🎯 Core Concepts](#-core-concepts)
- [⚡ Advanced Features](#-advanced-features)
- [🔄 Resource Versioning System](#-resource-versioning-system)
- [🆔 Custom ID Generation](#-custom-id-generation)
- [🔌 Plugin System](#-plugin-system)
- [🔄 Replicator System](#-replicator-system)
- [🎛️ Resource Behaviors](#️-resource-behaviors)
- [🔄 Advanced Streaming API](#-advanced-streaming-api)
- [📁 Binary Content Management](#-binary-content-management)
- [🗂️ Advanced Partitioning](#️-advanced-partitioning)
- [🎣 Advanced Hooks System](#-advanced-hooks-system)
- [🧩 Resource Middlewares](#-resource-middlewares)
- [📖 API Reference](#-api-reference)

---

## 🚀 Quick Start

Get up and running in less than 5 minutes!

### 1. Install s3db.js

```bash
npm install s3db.js
```

### 2. Connect to your S3 database

```javascript
import { S3db } from "s3db.js";

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp"
});

await s3db.connect();
console.log("🎉 Connected to S3 database!");
```

> **ℹ️ Note:** You do **not** need to provide `ACCESS_KEY` and `SECRET_KEY` in the connection string if your environment already has S3 permissions (e.g., via IAM Role on EKS, EC2, Lambda, or other compatible clouds). s3db.js will use the default AWS credential provider chain, so credentials can be omitted for role-based or environment-based authentication. This also applies to S3-compatible clouds (MinIO, DigitalOcean Spaces, etc.) if they support such mechanisms.

---

### 3. Create your first resource

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string|min:2|max:100",
    email: "email|unique",
    age: "number|integer|positive",
    isActive: "boolean"
  },
  timestamps: true
});
```

### 4. Start storing data

```javascript
// Insert a user
const user = await users.insert({
  name: "John Doe",
  email: "john@example.com",
  age: 30,
  isActive: true,
  createdAt: new Date()
});

// Query the user
const foundUser = await users.get(user.id);
console.log(`Hello, ${foundUser.name}! 👋`);

// Update the user
await users.update(user.id, { age: 31 });

// List all users
const allUsers = await users.list();
console.log(`Total users: ${allUsers.length}`);
```

**That's it!** You now have a fully functional document database running on AWS S3. 🎉

---

## 💾 Installation

### Package Manager

```bash
# npm
npm install s3db.js
# pnpm
pnpm add s3db.js
# yarn
yarn add s3db.js
```

### 📦 Optional Dependencies

Some features require additional dependencies to be installed manually:

#### replicator Dependencies

If you plan to use the replicator system with external services, install the corresponding dependencies:

```bash
# For SQS replicator (AWS SQS queues)
npm install @aws-sdk/client-sqs

# For BigQuery replicator (Google BigQuery)
npm install @google-cloud/bigquery

# For PostgreSQL replicator (PostgreSQL databases)
npm install pg
```

**Why manual installation?** These are marked as `peerDependencies` to keep the main package lightweight. Only install what you need!

### Environment Setup

Create a `.env` file with your AWS credentials:

```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_BUCKET=your_bucket_name
DATABASE_NAME=myapp
```

Then initialize s3db.js:

```javascript
import { S3db } from "s3db.js";
import dotenv from "dotenv";

dotenv.config();

const s3db = new S3db({
  connectionString: `s3://${process.env.AWS_ACCESS_KEY_ID}:${process.env.AWS_SECRET_ACCESS_KEY}@${process.env.AWS_BUCKET}/databases/${process.env.DATABASE_NAME}`
});
```

### Authentication Methods

<details>
<summary><strong>🔑 Multiple authentication options</strong></summary>

#### 1. Access Keys (Development)
```javascript
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp"
});
```

#### 2. IAM Roles (Production - Recommended)
```javascript
// No credentials needed - uses IAM role permissions
const s3db = new S3db({
  connectionString: "s3://BUCKET_NAME/databases/myapp"
});
```

#### 3. S3-Compatible Services (MinIO, etc.)
```javascript
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  endpoint: "http://localhost:9000"
});
```

</details>

---

## 🎯 Core Concepts

### 🗄️ Database
A logical container for your resources, stored in a specific S3 prefix.

```javascript
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp"
});
```

### 📋 Resources (Collections)
Resources define the structure of your documents, similar to tables in traditional databases.

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string|min:2|max:100",
    email: "email|unique",
    age: "number|integer|positive",
    isActive: "boolean",
    profile: {
      bio: "string|optional",
      avatar: "url|optional"
    },
    tags: "array|items:string|unique",
    password: "secret"
  },
  timestamps: true,
        behavior: "user-managed",
  partitions: {
    byRegion: { fields: { region: "string" } }
  }
});
```

### 🔍 Schema Validation
Built-in validation using [@icebob/fastest-validator](https://github.com/icebob/fastest-validator) with comprehensive rule support and excellent performance.

---

## ⚡ Advanced Features

### 📦 Partitions

Organize data efficiently with partitions for faster queries:

```javascript
const analytics = await s3db.createResource({
  name: "analytics",
  attributes: {
    userId: "string",
    event: "string",
    timestamp: "date"
  },
  partitions: {
    byDate: { fields: { timestamp: "date|maxlength:10" } },
    byUserAndDate: { fields: { userId: "string", timestamp: "date|maxlength:10" } }
  }
});

// Query by partition for better performance
const todayEvents = await analytics.list({
  partition: "byDate",
  partitionValues: { timestamp: "2024-01-15" }
});
```

### 🎣 Hooks System

Add custom logic with pre/post operation hooks:

```javascript
const products = await s3db.createResource({
  name: "products",
  attributes: { name: "string", price: "number" },
  hooks: {
    preInsert: [async (data) => {
      data.sku = `${data.category.toUpperCase()}-${Date.now()}`;
      return data;
    }],
    afterInsert: [async (data) => {
      console.log(`📦 Product ${data.name} created`);
    }]
  }
});
```

### 🔄 Streaming API

Handle large datasets efficiently:

```javascript
// Export to CSV
const readableStream = await users.readable();
const records = [];
readableStream.on("data", (user) => records.push(user));
readableStream.on("end", () => console.log("✅ Export completed"));

// Bulk import
const writableStream = await users.writable();
importData.forEach(userData => writableStream.write(userData));
writableStream.end();
```
    value: "string"
  },
  behavior: "enforce-limits" // Ensures data stays within 2KB
});

// Smart truncation - preserves structure, truncates content
const summaries = await s3db.createResource({
  name: "summaries",
  attributes: {
    title: "string",
    description: "string"
  },
  behavior: "truncate-data" // Truncates to fit within limits
});
```

### 🔄 Resource Versioning System

Automatically manages schema evolution and data migration:

```javascript
// Enable versioning
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  versioningEnabled: true
});

// Create versioned resource
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string|required",
    email: "string|required"
  },
  versioningEnabled: true
});

// Insert in version 0
const user1 = await users.insert({
  name: "John Doe",
  email: "john@example.com"
});

// Update schema - creates version 1
const updatedUsers = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string|required",
    email: "string|required",
    age: "number|optional"
  },
  versioningEnabled: true
});

// Automatic migration
const migratedUser = await updatedUsers.get(user1.id);
console.log(migratedUser._v); // "1" - automatically migrated

// Query by version
const version0Users = await users.list({
  partition: "byVersion",
  partitionValues: { _v: "0" }
});
```

### 🆔 Custom ID Generation

Flexible ID generation strategies:

```javascript
// Custom size IDs
const shortUsers = await s3db.createResource({
  name: "short-users",
  attributes: { name: "string|required" },
  idSize: 8 // Generate 8-character IDs
});

// UUID support
import { v4 as uuidv4 } from 'uuid';
const uuidUsers = await s3db.createResource({
  name: "uuid-users",
  attributes: { name: "string|required" },
  idGenerator: uuidv4
});

// UUID v1 (time-based)
const timeUsers = await s3db.createResource({
  name: "time-users",
  attributes: { name: "string|required" },
  idGenerator: uuidv1
});

// Custom ID function
const timestampUsers = await s3db.createResource({
  name: "timestamp-users",
  attributes: { name: "string|required" },
  idGenerator: () => `user_${Date.now()}`
});
```

#### 📏 **Intelligent Data Compression**

s3db.js automatically compresses numeric data using **Base62 encoding** to maximize your S3 metadata space (2KB limit):

| Data Type | Original | Compressed | Space Saved |
|-----------|----------|------------|-------------|
| `10000` | `10000` (5 digits) | `2Bi` (3 digits) | **40%** |
| `123456789` | `123456789` (9 digits) | `8m0Kx` (5 digits) | **44%** |
| Large arrays | `[1,2,3,999999]` (13 chars) | `1,2,3,hBxM` (9 chars) | **31%** |

**Performance Benefits:**
- ⚡ **5x faster** encoding for large numbers vs Base36
- 🗜️ **41% compression** for typical numeric data  
- 🚀 **Space efficient** - more data fits in S3 metadata
- 🔄 **Automatic** - no configuration required

### 🔌 Plugin System

Extend functionality with powerful plugins. s3db.js supports multiple plugins working together seamlessly:

```javascript
import { 
  CachePlugin, 
  CostsPlugin, 
  FullTextPlugin, 
  MetricsPlugin, 
  ReplicatorPlugin, 
  AuditPlugin 
} from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [
    new CachePlugin({ enabled: true }), // CachePlugin needs instantiation
    CostsPlugin, // CostsPlugin is a static object
    new FullTextPlugin({ fields: ['name', 'description'] }),
    new MetricsPlugin({ enabled: true }),
    new ReplicatorPlugin({ 
      enabled: true, 
      replicators: [
        {
          driver: 's3db',
          resources: ['users', 'products'],
          config: {
            connectionString: "s3://BACKUP_KEY:BACKUP_SECRET@BACKUP_BUCKET/backup"
          }
        }
      ]
    }),
    new AuditPlugin({ enabled: true })
  ]
});

// All plugins work together seamlessly
await users.insert({ name: "John", email: "john@example.com" });
// - Cache: Caches the operation
// - Costs: Tracks S3 costs
// - FullText: Indexes the data for search
// - Metrics: Records performance metrics
// - replicator: Syncs to configured replicators
// - Audit: Logs the operation
```

### 🔄 Replicator System

The replicator Plugin now supports a flexible driver-based system for replicating data to different targets. Each replicator driver handles a specific type of target system.

#### Available Replicators

**S3DB Replicator** - Replicates data to another s3db instance:
```javascript
{
  driver: 's3db',
  resources: ['users', 'products'], // <-- root level
  config: {
    connectionString: "s3://BACKUP_KEY:BACKUP_SECRET@BACKUP_BUCKET/backup",
  }
}
```

**SQS Replicator** - Sends data to AWS SQS queues:
```javascript
{
  driver: 'sqs',
  resources: ['orders'],
  config: {
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue',
    region: 'us-east-1',
    messageGroupId: 's3db-replicator', // For FIFO queues
    deduplicationId: true // Enable deduplication
  }
}
```

**BigQuery Replicator** - Sends data to Google BigQuery:
```javascript
{
  driver: 'bigquery',
  config: {
    projectId: 'my-project',
    datasetId: 'analytics',
    location: 'US',
    logTable: 's3db_replicator_log',
    credentials: {
      // Your Google Cloud service account credentials
      client_email: 'service-account@project.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\n...'
    }
  },
  resources: {
    users: [
      { actions: ['insert', 'update', 'delete'], table: 'users_table' },
    ],
    orders: [
      { actions: ['insert'], table: 'orders_table' },
      { actions: ['insert'], table: 'orders_analytics' }, // Also replicate to analytics table
    ],
    products: 'products_table' // Short form: equivalent to { actions: ['insert'], table: 'products_table' }
  }
}
```

**PostgreSQL Replicator** - Sends data to PostgreSQL databases:
```javascript
{
  driver: 'postgres',
  config: {
    connectionString: 'postgresql://user:pass@localhost:5432/analytics',
    // OR individual parameters:
    // host: 'localhost',
    // port: 5432,
    // database: 'analytics',
    // user: 'user',
    // password: 'pass',
    ssl: false,
    logTable: 's3db_replicator_log'
  },
  resources: {
    users: [
      { actions: ['insert', 'update', 'delete'], table: 'users_table' },
    ],
    orders: [
      { actions: ['insert'], table: 'orders_table' },
      { actions: ['insert'], table: 'orders_analytics' }, // Also replicate to analytics table
    ],
    products: 'products_table' // Short form: equivalent to { actions: ['insert'], table: 'products_table' }
  }
}
```

#### Replicator Features

- **Resource Filtering**: Each replicator can be configured to handle specific resources only
- **Event Emission**: All replicators emit events for monitoring and debugging
- **Connection Testing**: Test connections to replicators before use
- **Batch Operations**: Support for batch replicator operations
- **Error Handling**: Comprehensive error handling and retry logic
- **Status Monitoring**: Get detailed status and statistics for each replicator


**⚠️ Important:** These dependencies are marked as `peerDependencies` in the package.json, which means they are not automatically installed with s3db.js. You must install them manually if you plan to use the corresponding replicators. If you don't install the required dependency, the replicator will throw an error when trying to initialize.

**Example error without dependency:**
```
Error: Cannot find module '@aws-sdk/client-sqs'
```

**Solution:** Install the missing dependency as shown above.

#### Example Usage

See `examples/e34-replicators.js` for a complete example using all four replicator types.

**Prerequisites:** Make sure to install the required dependencies before running the example:

```bash
# Install all replicator dependencies for the full example
npm install @aws-sdk/client-sqs @google-cloud/bigquery pg
```

#### 🔄 Cache Plugin
Intelligent caching to reduce API calls and improve performance:

```javascript
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new CachePlugin({
    enabled: true,
    ttl: 300000, // 5 minutes cache
    maxSize: 1000, // Max 1000 items in cache
    driverType: 'memory' // 'memory' or 's3'
  })]
});

// Automatic caching for reads
await users.count(); // Cached for 5 minutes
await users.list();  // Cached for 5 minutes
await users.insert({...}); // Automatically clears cache
```

#### 💰 Costs Plugin
Track and monitor AWS S3 costs in real-time:

```javascript
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [CostsPlugin]
});

// Track costs automatically
await users.insert({ name: "John", email: "john@example.com" });
await users.list();

// Get cost information
console.log(s3db.client.costs); 
// { total: 0.000009, requests: { total: 3, get: 1, put: 1, list: 1 } }
```

#### 🔍 Full-Text Search Plugin
Powerful text search with automatic indexing:

```javascript
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new FullTextPlugin({
    enabled: true,
    fields: ['name', 'description', 'content'], // Fields to index
    minWordLength: 3,
    maxResults: 50,
    language: 'en-US'
  })]
});

// Create resource with searchable fields
const products = await s3db.createResource({
  name: "products",
  attributes: {
    name: "string|required",
    description: "string",
    content: "string"
  }
});

// Insert data (automatically indexed)
await products.insert({
  name: "JavaScript Book",
  description: "Learn JavaScript programming",
  content: "Comprehensive guide to modern JavaScript"
});

// Search across all indexed fields
const results = await s3db.plugins.fulltext.searchRecords('products', 'javascript');
console.log(results); // Returns products with search scores

// Example of search results:
// [
//   {
//     id: "prod-123",
//     name: "JavaScript Book",
//     description: "Learn JavaScript programming",
//     content: "Comprehensive guide to modern JavaScript",
//     _searchScore: 0.85,
//     _matchedFields: ["name", "description", "content"],
//     _matchedWords: ["javascript"]
//   },
//   {
//     id: "prod-456", 
//     name: "Web Development Guide",
//     description: "Includes JavaScript, HTML, and CSS",
//     content: "Complete web development with JavaScript",
//     _searchScore: 0.72,
//     _matchedFields: ["description", "content"],
//     _matchedWords: ["javascript"]
//   }
// ]
```

#### 📊 Metrics Plugin
Monitor performance and usage metrics:

```javascript
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new MetricsPlugin({
    enabled: true,
    collectPerformance: true,
    collectErrors: true,
    collectUsage: true,
    flushInterval: 60000 // Flush every minute
  })]
});

// Metrics are collected automatically
await users.insert({ name: "John" });
await users.list();

// Get metrics
const metrics = await s3db.plugins.metrics.getMetrics();
console.log(metrics); // Performance and usage data

// Example of metrics object:
// {
//   performance: {
//     averageResponseTime: 245, // milliseconds
//     totalRequests: 1250,
//     requestsPerSecond: 12.5,
//     slowestOperations: [
//       { operation: "list", resource: "users", avgTime: 450, count: 50 },
//       { operation: "get", resource: "products", avgTime: 320, count: 200 }
//     ]
//   },
//   usage: {
//     resources: {
//       users: { inserts: 150, updates: 75, deletes: 10, reads: 800 },
//       products: { inserts: 300, updates: 120, deletes: 25, reads: 1200 }
//     },
//     totalOperations: 2680,
//     mostActiveResource: "products",
//     peakUsageHour: "14:00"
//   },
//   errors: {
//     total: 15,
//     byType: {
//       "ValidationError": 8,
//       "NotFoundError": 5,
//       "PermissionError": 2
//     },
//     byResource: {
//       users: 10,
//       products: 5
//     }
//   },
//   cache: {
//     hitRate: 0.78, // 78% cache hit rate
//     totalHits: 980,
//     totalMisses: 270,
//     averageCacheTime: 120 // milliseconds
//   }
// }
```

#### 🔄 replicator Plugin
Replicate data to other buckets or regions:

```javascript
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new ReplicatorPlugin({
    enabled: true,
    replicators: [
      {
        driver: 's3db',
        resources: ['users', 'products'],
        config: {
          connectionString: "s3://BACKUP_KEY:BACKUP_SECRET@BACKUP_BUCKET/backup"
        }
      },
      {
        driver: 'sqs',
        resources: ['orders', 'users', 'products'],
        config: {
          // Resource-specific queues
          queues: {
            users: 'https://sqs.us-east-1.amazonaws.com/123456789012/users-events.fifo',
            orders: 'https://sqs.us-east-1.amazonaws.com/123456789012/orders-events.fifo',
            products: 'https://sqs.us-east-1.amazonaws.com/123456789012/products-events.fifo'
          },
          // Fallback queue for unspecified resources
          defaultQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/default-events.fifo',
          messageGroupId: 's3db-replicator', // For FIFO queues
          deduplicationId: true // Enable deduplication
        }
      },
      {
        driver: 'bigquery',
        resources: ['users', 'orders'],
        config: {
          projectId: 'my-project',
          datasetId: 'analytics',
          tableId: 's3db_replicator'
        }
      },
      {
        driver: 'postgres',
        resources: ['users'],
        config: {
          connectionString: 'postgresql://user:pass@localhost:5432/analytics',
          tableName: 's3db_replicator'
        }
      }
    ],
    syncInterval: 300000 // Sync every 5 minutes
  })]
});

// Data is automatically replicated to all configured targets
await users.insert({ name: "John" }); // Synced to all replicators
```

**SQS Message Structure:**

The SQS replicator sends standardized messages with the following structure:

```javascript
// INSERT operation
{
  resource: "users",
  action: "insert",
  data: { _v: 0, id: "user-001", name: "John", email: "john@example.com" },
  timestamp: "2024-01-01T10:00:00.000Z",
  source: "s3db-replicator"
}

// UPDATE operation (includes before/after data)
{
  resource: "users",
  action: "update",
  before: { _v: 0, id: "user-001", name: "John", age: 30 },
  data: { _v: 1, id: "user-001", name: "John", age: 31 },
  timestamp: "2024-01-01T10:05:00.000Z",
  source: "s3db-replicator"
}

// DELETE operation
{
  resource: "users",
  action: "delete",
  data: { _v: 1, id: "user-001", name: "John", age: 31 },
  timestamp: "2024-01-01T10:10:00.000Z",
  source: "s3db-replicator"
}
```

**Queue Routing:**
- Each resource can have its own dedicated queue
- Unspecified resources use the default queue
- FIFO queues supported with deduplication
- Messages are automatically routed to the appropriate queue

#### 📝 Audit Plugin
Log all operations for compliance and traceability:

```javascript
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new AuditPlugin({
    enabled: true,
    trackOperations: ['insert', 'update', 'delete', 'get'],
    includeData: false, // Don't log sensitive data
    retentionDays: 90
  })]
});

// All operations are logged
await users.insert({ name: "John" });
await users.update(userId, { age: 31 });

// Get audit logs
const logs = await s3db.plugins.audit.getAuditLogs({
  resourceName: 'users',
  operation: 'insert'
});
console.log(logs); // Audit trail
```

### 🎛️ Resource Behaviors

Choose the right behavior strategy for your use case:

#### Behavior Comparison

| Behavior         | Enforcement | Data Loss | Event Emission | Use Case                |
|------------------|-------------|-----------|----------------|-------------------------|
| `user-managed`   | None        | Possible  | Warns          | Dev/Test/Advanced users |
| `enforce-limits` | Strict      | No        | Throws         | Production              |
| `truncate-data`  | Truncates   | Yes       | Warns          | Content Mgmt            |
| `body-overflow`  | Truncates/Splits | Yes   | Warns          | Large objects           |
| `body-only`      | Unlimited   | No        | No             | Large JSON/Logs         |

#### User Managed Behavior (Default)

The `user-managed` behavior is the default for s3db resources. It provides no automatic enforcement of S3 metadata or body size limits, and does not modify or truncate data. Instead, it emits warnings via the `exceedsLimit` event when S3 metadata limits are exceeded, but allows all operations to proceed.

**Purpose & Use Cases:**
- For development, testing, or advanced users who want full control over resource metadata and body size.
- Useful when you want to handle S3 metadata limits yourself, or implement custom logic for warnings.
- Not recommended for production unless you have custom enforcement or validation in place.

**How It Works:**
- Emits an `exceedsLimit` event (with details) when a resource's metadata size exceeds the S3 2KB limit.
- Does NOT block, truncate, or modify data—operations always proceed.
- No automatic enforcement of any limits; user is responsible for handling warnings and data integrity.

**Event Emission:**
- Event: `exceedsLimit`
- Payload:
  - `operation`: 'insert' | 'update' | 'upsert'
  - `id` (for update/upsert): resource id
  - `totalSize`: total metadata size in bytes
  - `limit`: S3 metadata limit (2048 bytes)
  - `excess`: number of bytes over the limit
  - `data`: the offending data object

```javascript
// Flexible behavior - warns but doesn't block
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string", bio: "string" },
  behavior: "user-managed" // Default
});

// Listen for limit warnings
users.on('exceedsLimit', (data) => {
  console.warn(`Data exceeds 2KB limit by ${data.excess} bytes`, data);
});

// Operation continues despite warning
await users.insert({
  name: "John",
  bio: "A".repeat(3000) // > 2KB
});
```

**Best Practices & Warnings:**
- Exceeding S3 metadata limits will cause silent data loss or errors at the storage layer.
- Use this behavior only if you have custom logic to handle warnings and enforce limits.
- For production, prefer `enforce-limits` or `truncate-data` to avoid data loss.

**Migration Tips:**
- To migrate to a stricter behavior, change the resource's behavior to `enforce-limits` or `truncate-data`.
- Review emitted warnings to identify resources at risk of exceeding S3 limits.

#### Enforce Limits Behavior

```javascript
// Strict validation - throws error if limit exceeded
const settings = await s3db.createResource({
  name: "settings",
  attributes: { key: "string", value: "string" },
  behavior: "enforce-limits"
});

// Throws error if data > 2KB
await settings.insert({
  key: "large_setting",
  value: "A".repeat(3000) // Throws: "S3 metadata size exceeds 2KB limit"
});
```

#### Data Truncate Behavior

```javascript
// Smart truncation - preserves structure, truncates content
const summaries = await s3db.createResource({
  name: "summaries",
  attributes: {
    title: "string",
    description: "string",
    content: "string"
  },
  behavior: "truncate-data"
});

// Automatically truncates to fit within 2KB
const result = await summaries.insert({
  title: "Short Title",
  description: "A".repeat(1000),
  content: "B".repeat(2000) // Will be truncated with "..."
});

// Retrieved data shows truncation
const retrieved = await summaries.get(result.id);
console.log(retrieved.content); // "B...B..." (truncated)
```

#### Body Overflow Behavior

```javascript
// Preserve all data by using S3 object body
const blogs = await s3db.createResource({
  name: "blogs",
  attributes: {
    title: "string",
    content: "string", // Can be very large
    author: "string"
  },
  behavior: "body-overflow"
});

// Large content is automatically split between metadata and body
const blog = await blogs.insert({
  title: "My Blog Post",
  content: "A".repeat(5000), // Large content
  author: "John Doe"
});

// All data is preserved and accessible
const retrieved = await blogs.get(blog.id);
console.log(retrieved.content.length); // 5000 (full content preserved)
console.log(retrieved._hasContent); // true (indicates body usage)
```

#### Body Only Behavior

```javascript
// Store all data in S3 object body as JSON, keeping only version in metadata
const documents = await s3db.createResource({
  name: "documents",
  attributes: {
    title: "string",
    content: "string", // Can be extremely large
    metadata: "object"
  },
  behavior: "body-only"
});

// Store large documents without any size limits
const document = await documents.insert({
  title: "Large Document",
  content: "A".repeat(100000), // 100KB content
  metadata: {
    author: "John Doe",
    tags: ["large", "document"],
    version: "1.0"
  }
});

// All data is stored in the S3 object body
const retrieved = await documents.get(document.id);
console.log(retrieved.content.length); // 100000 (full content preserved)
console.log(retrieved.metadata.author); // "John Doe"
console.log(retrieved._hasContent); // true (indicates body usage)

// Perfect for storing large JSON documents, logs, or any large content
const logEntry = await documents.insert({
  title: "Application Log",
  content: JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "INFO",
    message: "Application started",
    details: {
      // ... large log details
    }
  }),
  metadata: { source: "api-server", environment: "production" }
});
```

### 🔄 Advanced Streaming API

Handle large datasets efficiently with advanced streaming capabilities:

#### Readable Streams

```javascript
// Configure streaming with custom batch size and concurrency
const readableStream = await users.readable({
  batchSize: 50,      // Process 50 items per batch
  concurrency: 10     // 10 concurrent operations
});

// Process data as it streams
readableStream.on('data', (user) => {
  console.log(`Processing user: ${user.name}`);
  // Process each user individually
});

readableStream.on('error', (error) => {
  console.error('Stream error:', error);
});

readableStream.on('end', () => {
  console.log('Stream completed');
});

// Pause and resume streaming
readableStream.pause();
setTimeout(() => readableStream.resume(), 1000);
```

#### Writable Streams

```javascript
// Configure writable stream for bulk operations
const writableStream = await users.writable({
  batchSize: 25,      // Write 25 items per batch
  concurrency: 5      // 5 concurrent writes
});

// Write data to stream
const userData = [
  { name: 'User 1', email: 'user1@example.com' },
  { name: 'User 2', email: 'user2@example.com' },
  // ... thousands more
];

userData.forEach(user => {
  writableStream.write(user);
});

// End stream and wait for completion
writableStream.on('finish', () => {
  console.log('All users written successfully');
});

writableStream.on('error', (error) => {
  console.error('Write error:', error);
});

writableStream.end();
```

#### Stream Error Handling

```javascript
// Handle errors gracefully in streams
const stream = await users.readable();

stream.on('error', (error, item) => {
  console.error(`Error processing item:`, error);
  console.log('Problematic item:', item);
  // Continue processing other items
});

// Custom error handling for specific operations
stream.on('data', async (user) => {
  try {
    await processUser(user);
  } catch (error) {
    console.error(`Failed to process user ${user.id}:`, error);
  }
});
```

### 📁 Binary Content Management

Store and manage binary content alongside your metadata:

#### Set Binary Content

```javascript
import fs from 'fs';

// Set image content for user profile
const imageBuffer = fs.readFileSync('profile.jpg');
await users.setContent({
  id: 'user-123',
  buffer: imageBuffer,
  contentType: 'image/jpeg'
});

// Set document content
const documentBuffer = fs.readFileSync('document.pdf');
await users.setContent({
  id: 'user-123',
  buffer: documentBuffer,
  contentType: 'application/pdf'
});

// Set text content
await users.setContent({
  id: 'user-123',
  buffer: 'Hello World',
  contentType: 'text/plain'
});
```

#### Retrieve Binary Content

```javascript
// Get binary content
const content = await users.content('user-123');

if (content.buffer) {
  console.log('Content type:', content.contentType);
  console.log('Content size:', content.buffer.length);
  
  // Save to file
  fs.writeFileSync('downloaded.jpg', content.buffer);
} else {
  console.log('No content found');
}
```

#### Content Management

```javascript
// Check if content exists
const hasContent = await users.hasContent('user-123');
console.log('Has content:', hasContent);

// Delete content but preserve metadata
await users.deleteContent('user-123');
// User metadata remains, but binary content is removed
```

### 🗂️ Advanced Partitioning

Organize data efficiently with complex partitioning strategies:

#### Composite Partitions

```javascript
// Partition with multiple fields
const analytics = await s3db.createResource({
  name: "analytics",
  attributes: {
    userId: "string",
    event: "string",
    timestamp: "date",
    region: "string",
    device: "string"
  },
  partitions: {
    // Single field partition
    byEvent: { fields: { event: "string" } },
    
    // Two field partition
    byEventAndRegion: { 
      fields: { 
        event: "string",
        region: "string" 
      } 
    },
    
    // Three field partition
    byEventRegionDevice: {
      fields: {
        event: "string",
        region: "string", 
        device: "string"
      }
    }
  }
});
```

#### Nested Field Partitions

```javascript
// Partition by nested object fields
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string",
    profile: {
      country: "string",
      city: "string",
      preferences: {
        theme: "string"
      }
    }
  },
  partitions: {
    byCountry: { fields: { "profile.country": "string" } },
    byCity: { fields: { "profile.city": "string" } },
    byTheme: { fields: { "profile.preferences.theme": "string" } }
  }
});

// Query by nested field
const usUsers = await users.list({
  partition: "byCountry",
  partitionValues: { "profile.country": "US" }
});

// Note: The system automatically manages partition references internally
// Users should use standard list() method with partition parameters

#### Automatic Timestamp Partitions

```javascript
// Enable automatic timestamp partitions
const events = await s3db.createResource({
  name: "events",
  attributes: {
    name: "string",
    data: "object"
  },
  timestamps: true // Automatically adds byCreatedDate and byUpdatedDate
});

// Query by creation date
const todayEvents = await events.list({
  partition: "byCreatedDate",
  partitionValues: { createdAt: "2024-01-15" }
});

// Query by update date
const recentlyUpdated = await events.list({
  partition: "byUpdatedDate", 
  partitionValues: { updatedAt: "2024-01-15" }
});
```

#### Partition Validation

```javascript
// Partitions are automatically validated against attributes
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string",
    email: "string",
    status: "string"
  },
  partitions: {
    byStatus: { fields: { status: "string" } }, // ✅ Valid
    byEmail: { fields: { email: "string" } }    // ✅ Valid
    // byInvalid: { fields: { invalid: "string" } } // ❌ Would throw error
  }
});
```

### 🎣 Advanced Hooks System

Extend functionality with comprehensive hook system:

#### Hook Execution Order

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string", email: "string" },
  hooks: {
    preInsert: [
      async (data) => {
        console.log('1. Pre-insert hook 1');
        data.timestamp = new Date().toISOString();
        return data;
      },
      async (data) => {
        console.log('2. Pre-insert hook 2');
        data.processed = true;
        return data;
      }
    ],
    afterInsert: [
      async (data) => {
        console.log('3. After-insert hook 1');
        await sendWelcomeEmail(data.email);
      },
      async (data) => {
        console.log('4. After-insert hook 2');
        await updateAnalytics(data);
      }
    ]
  }
});

// Execution order: preInsert hooks → insert → afterInsert hooks
```

#### Version-Specific Hooks

```javascript
// Hooks that respond to version changes
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string", email: "string" },
  versioningEnabled: true,
  hooks: {
    preInsert: [
      async (data) => {
        // Access resource context
        console.log('Current version:', this.version);
        return data;
      }
    ]
  }
});

// Listen for version updates
users.on('versionUpdated', ({ oldVersion, newVersion }) => {
  console.log(`Resource updated from ${oldVersion} to ${newVersion}`);
});
```

#### Error Handling in Hooks

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string", email: "string" },
  hooks: {
    preInsert: [
      async (data) => {
        try {
          // Validate external service
          await validateEmail(data.email);
          return data;
        } catch (error) {
          // Transform error or add context
          throw new Error(`Email validation failed: ${error.message}`);
        }
      }
    ],
    afterInsert: [
      async (data) => {
        try {
          await sendWelcomeEmail(data.email);
        } catch (error) {
          // Log but don't fail the operation
          console.error('Failed to send welcome email:', error);
        }
      }
    ]
  }
});
```

#### Hook Context and Binding

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string", email: "string" },
  hooks: {
    preInsert: [
      async function(data) {
        // 'this' is bound to the resource instance
        console.log('Resource name:', this.name);
        console.log('Resource version:', this.version);
        
        // Access resource methods
        const exists = await this.exists(data.id);
        if (exists) {
          throw new Error('User already exists');
        }
        
        return data;
      }
    ]
  }
});
```

### 🧩 Resource Middlewares

The Resource class supports a powerful middleware system, similar to Express/Koa, allowing you to intercept, modify, or extend the behavior of core methods like `insert`, `get`, `update`, `delete`, `list`, and more.

**Supported methods for middleware:**
- `get`
- `list`
- `listIds`
- `getAll`
- `count`
- `page`
- `insert`
- `update`
- `delete`
- `deleteMany`
- `exists`
- `getMany`

#### Middleware Signature
```js
async function middleware(ctx, next) {
  // ctx.resource: Resource instance
  // ctx.args: arguments array (for the method)
  // ctx.method: method name (e.g., 'insert')
  // next(): calls the next middleware or the original method
}
```

#### Example: Logging Middleware for Insert
```js
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string", email: "string" }
});

users.useMiddleware('insert', async (ctx, next) => {
  console.log('Before insert:', ctx.args[0]);
  // You can modify ctx.args if needed
  ctx.args[0].name = ctx.args[0].name.toUpperCase();
  const result = await next();
  console.log('After insert:', result);
  return result;
});

await users.insert({ name: "john", email: "john@example.com" });
// Output:
// Before insert: { name: 'john', email: 'john@example.com' }
// After insert: { id: '...', name: 'JOHN', email: 'john@example.com', ... }
```

#### Example: Validation or Metrics Middleware
```js
users.useMiddleware('update', async (ctx, next) => {
  if (!ctx.args[1].email) throw new Error('Email is required for update!');
  const start = Date.now();
  const result = await next();
  const duration = Date.now() - start;
  console.log(`Update took ${duration}ms`);
  return result;
});
```

#### 🔒 Complete Example: Authentication & Audit Middleware

Here's a practical example showing how to implement authentication and audit logging with middleware:

```js
import s3db from 's3db.js';

// Create database and resources
const database = new s3db.Database('s3://my-bucket/my-app');
await database.connect();

const orders = await database.createResource({
  name: 'orders',
  attributes: {
    id: 'string|required',
    customerId: 'string|required', 
    amount: 'number|required',
    status: 'string|required'
  }
});

// Authentication middleware - runs on all operations
['insert', 'update', 'delete', 'get'].forEach(method => {
  orders.useMiddleware(method, async (ctx, next) => {
    // Extract user from context (e.g., from JWT token)
    const user = ctx.user || ctx.args.find(arg => arg?.userId);
    
    if (!user || !user.userId) {
      throw new Error(`Authentication required for ${method} operation`);
    }
    
    // Add user info to context for other middlewares
    ctx.authenticatedUser = user;
    
    return await next();
  });
});

// Audit logging middleware - tracks all changes
['insert', 'update', 'delete'].forEach(method => {
  orders.useMiddleware(method, async (ctx, next) => {
    const startTime = Date.now();
    const user = ctx.authenticatedUser;
    
    try {
      const result = await next();
      
      // Log successful operation
      console.log(`[AUDIT] ${method.toUpperCase()}`, {
        resource: 'orders',
        userId: user.userId,
        method,
        args: ctx.args,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        success: true
      });
      
      return result;
    } catch (error) {
      // Log failed operation
      console.log(`[AUDIT] ${method.toUpperCase()} FAILED`, {
        resource: 'orders',
        userId: user.userId,
        method,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        success: false
      });
      
      throw error;
    }
  });
});

// Permission middleware for sensitive operations
orders.useMiddleware('delete', async (ctx, next) => {
  const user = ctx.authenticatedUser;
  
  if (user.role !== 'admin') {
    throw new Error('Only admins can delete orders');
  }
  
  return await next();
});

// Usage examples
try {
  // This will require authentication and log the operation
  const order = await orders.insert(
    { 
      id: 'order-123',
      customerId: 'cust-456', 
      amount: 99.99, 
      status: 'pending' 
    },
    { user: { userId: 'user-789', role: 'customer' } }
  );
  
  // This will fail - only admins can delete
  await orders.delete('order-123', { 
    user: { userId: 'user-789', role: 'customer' } 
  });
  
} catch (error) {
  console.error('Operation failed:', error.message);
}

/*
Expected output:
[AUDIT] INSERT {
  resource: 'orders',
  userId: 'user-789', 
  method: 'insert',
  args: [{ id: 'order-123', customerId: 'cust-456', amount: 99.99, status: 'pending' }],
  duration: 245,
  timestamp: '2024-01-15T10:30:45.123Z',
  success: true
}

Operation failed: Only admins can delete orders
[AUDIT] DELETE FAILED {
  resource: 'orders',
  userId: 'user-789',
  method: 'delete', 
  error: 'Only admins can delete orders',
  duration: 12,
  timestamp: '2024-01-15T10:30:45.456Z',
  success: false
}
*/
```

**Key Benefits of This Approach:**
- 🔐 **Centralized Authentication**: One middleware handles auth for all operations
- 📊 **Comprehensive Auditing**: All operations are logged with timing and user info  
- 🛡️ **Granular Permissions**: Different rules for different operations
- ⚡ **Performance Tracking**: Built-in timing for operation monitoring
- 🔧 **Easy to Maintain**: Add/remove middlewares without changing business logic

- **Chaining:** You can add multiple middlewares for the same method; they run in registration order.
- **Control:** You can short-circuit the chain by not calling `next()`, or modify arguments/results as needed.

This system is ideal for cross-cutting concerns like logging, access control, custom validation, metrics, or request shaping.

---

### 🧩 Hooks vs Middlewares: Differences, Usage, and Coexistence

s3db.js supports **both hooks and middlewares** for resources. They are complementary tools for customizing and extending resource behavior.

#### **What are Hooks?**
- Hooks are functions that run **before or after** specific operations (e.g., `beforeInsert`, `afterUpdate`).
- They are ideal for **side effects**: logging, notifications, analytics, validation, etc.
- Hooks **cannot block or replace** the original operation—they can only observe or modify the data passed to them.
- Hooks are registered with `addHook(event, fn)` or via the `hooks` config.

**Example:**
```js
users.addHook('afterInsert', async (data) => {
  await sendWelcomeEmail(data.email);
  return data;
});
```

#### **What are Middlewares?**
- Middlewares are functions that **wrap** the entire method call (like Express/Koa middlewares).
- They can **intercept, modify, block, or replace** the operation.
- Middlewares can transform arguments, short-circuit the call, or modify the result.
- Middlewares are registered with `useMiddleware(method, fn)`.

**Example:**
```js
users.useMiddleware('insert', async (ctx, next) => {
  if (!ctx.args[0].email) throw new Error('Email required');
  ctx.args[0].name = ctx.args[0].name.toUpperCase();
  const result = await next();
  return result;
});
```

#### **Key Differences**
| Feature         | Hooks                        | Middlewares                  |
|----------------|------------------------------|------------------------------|
| Placement      | Before/after operation       | Wraps the entire method      |
| Control        | Cannot block/replace op      | Can block/replace op         |
| Use case       | Side effects, logging, etc.  | Access control, transform    |
| Registration   | `addHook(event, fn)`         | `useMiddleware(method, fn)`  |
| Data access    | Receives data only           | Full context (args, method)  |
| Chaining       | Runs in order, always passes | Runs in order, can short-circuit |

#### **How They Work Together**
Hooks and middlewares can be used **together** on the same resource and method. The order of execution is:

1. **Middlewares** (before the operation)
2. **Hooks** (`beforeX`)
3. **Original operation**
4. **Hooks** (`afterX`)
5. **Middlewares** (after the operation, as the call stack unwinds)

**Example: Using Both**
```js
// Middleware: transforms input and checks permissions
users.useMiddleware('insert', async (ctx, next) => {
  if (!userHasPermission(ctx.args[0])) throw new Error('Unauthorized');
  ctx.args[0].name = ctx.args[0].name.toUpperCase();
  const result = await next();
  return result;
});

// Hook: sends notification after insert
users.addHook('afterInsert', async (data) => {
  await sendWelcomeEmail(data.email);
  return data;
});

await users.insert({ name: 'john', email: 'john@example.com' });
// Output:
// Middleware runs (transforms/checks)
// Hook runs (sends email)
```

#### **When to Use Each**
- Use **hooks** for: logging, analytics, notifications, validation, side effects.
- Use **middlewares** for: access control, input/output transformation, caching, rate limiting, blocking or replacing operations.
- Use **both** for advanced scenarios: e.g., middleware for access control + hook for analytics.

#### **Best Practices**
- Hooks are lightweight and ideal for observing or reacting to events.
- Middlewares are powerful and ideal for controlling or transforming operations.
- You can safely combine both for maximum flexibility.

---

## 📖 API Reference

### 🔌 Database Operations

| Method | Description | Example |
|--------|-------------|---------|
| `connect()` | Connect to database | `await s3db.connect()` |
| `createResource(config)` | Create new resource | `await s3db.createResource({...})` |
| `resource(name)` | Get resource reference | `const users = s3db.resource("users")` |
| `resourceExists(name)` | Check if resource exists | `s3db.resourceExists("users")` |

### 📝 Resource Operations

| Method | Description | Example |
|--------|-------------|---------|
| `insert(data)` | Create document | `await users.insert({name: "John"})` |
| `get(id)` | Retrieve document | `await users.get("user-123")` |
| `update(id, data)` | Update document | `await users.update("user-123", {age: 31})` |
| `upsert(id, data)` | Insert or update | `await users.upsert("user-123", {...})` |
| `delete(id)` | Delete document | `await users.delete("user-123")` |
| `exists(id)` | Check existence | `await users.exists("user-123")` |
| `setContent({id, buffer, contentType})` | Set binary content | `await users.setContent({id: "123", buffer: imageBuffer})` |
| `content(id)` | Get binary content | `await users.content("user-123")` |
| `hasContent(id)` | Check if has content | `await users.hasContent("user-123")` |
| `deleteContent(id)` | Remove content | `await users.deleteContent("user-123")` |

### 📊 Query Operations

| Method | Description | Example |
|--------|-------------|---------|
| `list(options?)` | List documents with pagination & partitions | `await users.list({limit: 10, offset: 0})` |
| `listIds(options?)` | List document IDs | `await users.listIds()` |
| `count(options?)` | Count documents | `await users.count()` |
| `page(options)` | Paginate results | `await users.page({offset: 0, size: 10})` |
| `query(filter, options?)` | Filter documents | `await users.query({isActive: true})` |

#### 📋 List vs GetAll - When to Use Each

**`list(options?)`** - Advanced listing with full control:
```javascript
// Simple listing (equivalent to getAll)
const allUsers = await users.list();

// With pagination
const first10 = await users.list({ limit: 10, offset: 0 });

// With partitions
const usUsers = await users.list({ 
  partition: "byCountry", 
  partitionValues: { "profile.country": "US" } 
});
```

**`getAll()`** - Simple listing for all documents:
```javascript
// Get all documents (no options, no pagination)
const allUsers = await users.getAll();
console.log(`Total users: ${allUsers.length}`);
```

**Choose `getAll()` when:**
- ✅ You want all documents without pagination
- ✅ You don't need partition filtering
- ✅ You prefer simplicity over flexibility

**Choose `list()` when:**
- ✅ You need pagination control
- ✅ You want to filter by partitions
- ✅ You need more control over the query

### 🚀 Bulk Operations

| Method | Description | Example |
|--------|-------------|---------|
| `insertMany(docs)` | Insert multiple | `await users.insertMany([{...}, {...}])` |
| `getMany(ids)` | Get multiple | `await users.getMany(["id1", "id2"])` |
| `deleteMany(ids)` | Delete multiple | `await users.deleteMany(["id1", "id2"])` |
| `getAll()` | Get all documents | `await users.getAll()` |
| `deleteAll()` | Delete all documents | `await users.deleteAll()` |

### 🔄 Streaming Operations

| Method | Description | Example |
|--------|-------------|---------|
| `