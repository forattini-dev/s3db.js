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

- [🚀 Quick Start](#-quick-start)
- [💾 Installation](#-installation)
- [🎯 Core Concepts](#-core-concepts)
- [⚡ Advanced Features](#-advanced-features)
- [🔄 Resource Versioning System](#-resource-versioning-system)
- [🆔 Custom ID Generation](#-custom-id-generation)
- [🔌 Plugin System](#-plugin-system)
- [🎛️ Advanced Behaviors](#️-advanced-behaviors)
- [🔄 Advanced Streaming API](#-advanced-streaming-api)
- [📁 Binary Content Management](#-binary-content-management)
- [🗂️ Advanced Partitioning](#️-advanced-partitioning)
- [🎣 Advanced Hooks System](#-advanced-hooks-system)
- [📖 API Reference](#-api-reference)
- [🎨 Examples](#-examples)
- [🔐 Security](#-security)
- [⚙️ Advanced Configuration Options](#️-advanced-configuration-options)
- [📡 Events and Emitters](#-events-and-emitters)
- [🔧 Troubleshooting](#-troubleshooting)
- [💰 Cost Analysis](#-cost-analysis)
- [🚨 Best Practices](#-best-practices)
- [🧪 Testing](#-testing)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

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
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp"
});

await s3db.connect();
console.log("🎉 Connected to S3 database!");
```

### 3. Create your first resource

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string|min:2|max:100",
    email: "email|unique",
    age: "number|integer|positive",
    isActive: "boolean",
    createdAt: "date"
  },
  timestamps: true,
  behavior: "user-management",
  partitions: {
    byRegion: { fields: { region: "string" } }
  },
  paranoid: true,
  autoDecrypt: true,
  cache: false,
  parallelism: 10,
  hooks: {
    preInsert: [async (data) => {
      console.log("Pre-insert:", data);
      return data;
    }]
  }
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
  uri: `s3://${process.env.AWS_ACCESS_KEY_ID}:${process.env.AWS_SECRET_ACCESS_KEY}@${process.env.AWS_BUCKET}/databases/${process.env.DATABASE_NAME}`
});
```

### Authentication Methods

<details>
<summary><strong>🔑 Multiple authentication options</strong></summary>

#### 1. Access Keys (Development)
```javascript
const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp"
});
```

#### 2. IAM Roles (Production - Recommended)
```javascript
// No credentials needed - uses IAM role permissions
const s3db = new S3db({
  uri: "s3://BUCKET_NAME/databases/myapp"
});
```

#### 3. S3-Compatible Services (MinIO, etc.)
```javascript
const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
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
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp"
});
// Creates/connects to: s3://bucket/databases/myapp/
```

### 📋 Resources (Collections)
Resources define the structure of your documents, similar to tables in traditional databases.

#### New Configuration Structure

The Resource class now uses a unified configuration object where all options are passed directly in the config object:

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: {
    // Basic types
    name: "string|min:2|max:100",
    email: "email|unique",
    age: "number|integer|positive",
    isActive: "boolean",
    
    // Nested objects
    profile: {
      bio: "string|optional",
      avatar: "url|optional",
      preferences: {
        theme: "string|enum:light,dark|default:light",
        notifications: "boolean|default:true"
      }
    },
    
    // Arrays
    tags: "array|items:string|unique",
    
    // Encrypted fields
    password: "secret"
  },
  // All options are now at the root level
  timestamps: true,    // Automatic createdAt/updatedAt
  behavior: "user-management", // How to handle large documents
  partitions: {        // Organize data for efficient queries
    byRegion: { fields: { region: "string" } }
  },
  paranoid: true,      // Security flag for dangerous operations
  autoDecrypt: true,   // Auto-decrypt secret fields
  cache: false,        // Enable caching
  parallelism: 10,     // Parallelism for bulk operations
  hooks: {             // Custom hooks
    preInsert: [async (data) => {
      console.log("Pre-insert:", data);
      return data;
    }]
  }
});
```

### 🔍 Schema Validation
Built-in validation using [@icebob/fastest-validator](https://github.com/icebob/fastest-validator) for resource creation and partition validation. This powerful validation engine provides comprehensive rule support, excellent performance, and detailed error reporting for all your data validation needs.

```javascript
const product = await products.insert({
  name: "Wireless Headphones",
  price: 99.99,
  category: "electronics",
  features: ["bluetooth", "noise-cancellation"],
  specifications: {
    battery: "30 hours",
    connectivity: "Bluetooth 5.0"
  }
});
```

**Validation Features powered by fastest-validator:**
- ✅ **Comprehensive Rules** - String, number, array, object, date validation
- ✅ **Nested Objects** - Deep validation for complex data structures  
- ✅ **Custom Rules** - Extend with your own validation logic
- ✅ **Performance** - Optimized validation engine for speed
- ✅ **Error Messages** - Detailed validation error reporting

---

## ⚡ Advanced Features

s3db.js leverages [@icebob/fastest-validator](https://github.com/icebob/fastest-validator) as its core validation engine for both resource schemas and partition field validation, ensuring high-performance data validation with comprehensive rule support.

### 📦 Partitions

Organize data efficiently with partitions for faster queries:

```javascript
const analytics = await s3db.createResource({
  name: "analytics",
  attributes: {
    userId: "string",
    event: "string",
    timestamp: "date",
    utm: {
      source: "string",
      medium: "string",
      campaign: "string"
    }
  },
  partitions: {
    byDate: { fields: { timestamp: "date|maxlength:10" } },
    byUtmSource: { fields: { "utm.source": "string" } },
    byUserAndDate: { 
      fields: { 
        userId: "string", 
        timestamp: "date|maxlength:10" 
      } 
    }
  }
});

// Query by partition for better performance
const googleEvents = await analytics.list({
  partition: "byUtmSource",
  partitionValues: { "utm.source": "google" }
});

const todayEvents = await analytics.count({
  partition: "byDate",
  partitionValues: { timestamp: "2024-01-15" }
});
```

### 🎣 Hooks System

Add custom logic with pre/post operation hooks:

```javascript
const products = await s3db.createResource({
  name: "products",
  attributes: {
    name: "string",
    price: "number",
    category: "string"
  },
  hooks: {
    preInsert: [
      async (data) => {
        // Auto-generate SKU
        data.sku = `${data.category.toUpperCase()}-${Date.now()}`;
        return data;
      }
    ],
    afterInsert: [
      async (data) => {
        console.log(`📦 Product ${data.name} created with SKU: ${data.sku}`);
        // Send notification, update cache, etc.
      }
    ],
    preUpdate: [
      async (id, data) => {
        // Log price changes
        if (data.price) {
          console.log(`💰 Price update for ${id}: $${data.price}`);
        }
        return data;
      }
    ]
  },
  
  // Optional: Security settings (default: true)
  paranoid: true,
  
  // Optional: Schema options (default: false)
  allNestedObjectsOptional: false,
  
  // Optional: Encryption settings (default: true)
  autoDecrypt: true,
  
  // Optional: Caching (default: false)
  cache: false
});
```

### 🔄 Streaming API

Handle large datasets efficiently with streams:

```javascript
// Export all users to CSV
const readableStream = await users.readable();
const csvWriter = createObjectCsvWriter({
  path: "users_export.csv",
  header: [
    { id: "id", title: "ID" },
    { id: "name", title: "Name" },
    { id: "email", title: "Email" }
  ]
});

const records = [];
readableStream.on("data", (user) => {
  records.push(user);
});

readableStream.on("end", async () => {
  await csvWriter.writeRecords(records);
  console.log("✅ Export completed: users_export.csv");
});

// Bulk import from stream
const writableStream = await users.writable();
importData.forEach(userData => {
  writableStream.write(userData);
});
writableStream.end();
```

### 🛡️ Document Behaviors

Handle documents that exceed S3's 2KB metadata limit:

```javascript
// Preserve all data by storing overflow in S3 body
const blogs = await s3db.createResource({
  name: "blogs",
  attributes: {
    title: "string",
    content: "string", // Can be very large
    author: "string"
  },
  behavior: "body-overflow" // Handles large content automatically
});

// Strict validation - throws error if limit exceeded
const settings = await s3db.createResource({
  name: "settings",
  attributes: {
    key: "string",
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
  behavior: "data-truncate" // Truncates to fit within limits
});
```

### 🔄 Resource Versioning System

s3db.js includes a powerful versioning system that automatically manages schema evolution and data migration:

#### Enable Versioning

```javascript
// Enable versioning at database level
const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  versioningEnabled: true // Enable versioning for all resources
});

// Create versioned resource
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string|required",
    email: "string|required",
    status: "string|required"
  },
  versioningEnabled: true // Enable for this specific resource
});
```

#### Automatic Version Management

```javascript
// Initial version (v0) - basic user data
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string|required",
    email: "string|required"
  },
  versioningEnabled: true
});

// Insert users in v0
const user1 = await users.insert({
  name: "John Doe",
  email: "john@example.com"
});

// Update schema - automatically creates v1
const updatedUsers = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string|required",
    email: "string|required",
    age: "number|optional",        // New field
    profile: "object|optional"     // New nested object
  },
  versioningEnabled: true
});

// User1 now has _v: "v0" metadata
// New users will have _v: "v1" metadata
const user2 = await updatedUsers.insert({
  name: "Jane Smith",
  email: "jane@example.com",
  age: 30,
  profile: { bio: "Software developer" }
});
```

#### Automatic Data Migration

```javascript
// Get user from old version - automatically migrated
const migratedUser = await updatedUsers.get(user1.id);
console.log(migratedUser._v); // "v1" - automatically migrated
console.log(migratedUser.age); // undefined (new field)
console.log(migratedUser.profile); // undefined (new field)

// Update user - migrates to current version
const updatedUser = await updatedUsers.update(user1.id, {
  name: "John Doe",
  email: "john@example.com",
  age: 35, // Add new field
  profile: { bio: "Updated bio" }
});

console.log(updatedUser._v); // "v1" - now on current version
console.log(updatedUser.age); // 35
console.log(updatedUser.profile); // { bio: "Updated bio" }
```

#### Historical Data Preservation

```javascript
// When versioning is enabled, old versions are preserved
// Historical data is stored in: ./resource=users/historical/id=user1

// The system automatically:
// 1. Detects schema changes via hash comparison
// 2. Increments version number (v0 → v1 → v2...)
// 3. Preserves old data in historical storage
// 4. Migrates data when accessed or updated
```

#### Version Partitions

```javascript
// Automatic version partition is created when versioning is enabled
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string|required",
    email: "string|required"
  },
  partitions: {
    byStatus: { fields: { status: "string" } }
  },
  versioningEnabled: true
});

// Automatically adds: byVersion: { fields: { _v: "string" } }
console.log(users.config.partitions.byVersion); // { fields: { _v: "string" } }

// Query by version
const v0Users = await users.list({
  partition: "byVersion",
  partitionValues: { _v: "v0" }
});

const v1Users = await users.list({
  partition: "byVersion", 
  partitionValues: { _v: "v1" }
});
```

### 🆔 Custom ID Generation

s3db.js supports flexible ID generation strategies:

#### Built-in ID Sizes

```javascript
// Default 22-character IDs
const defaultUsers = await s3db.createResource({
  name: "users",
  attributes: { name: "string|required" }
  // Uses default 22-character nanoid
});

// Custom size IDs
const shortUsers = await s3db.createResource({
  name: "short-users",
  attributes: { name: "string|required" },
  idSize: 8 // Generate 8-character IDs
});

const longUsers = await s3db.createResource({
  name: "long-users", 
  attributes: { name: "string|required" },
  idSize: 32 // Generate 32-character IDs
});
```

#### UUID Support

```javascript
import { v4 as uuidv4, v1 as uuidv1 } from 'uuid';

// UUID v4 (random)
const uuidUsers = await s3db.createResource({
  name: "uuid-users",
  attributes: { name: "string|required" },
  idGenerator: uuidv4 // Pass UUID function directly
});

// UUID v1 (time-based)
const timeUsers = await s3db.createResource({
  name: "time-users",
  attributes: { name: "string|required" },
  idGenerator: uuidv1
});
```

#### Custom ID Functions

```javascript
// Timestamp-based IDs
const timestampUsers = await s3db.createResource({
  name: "timestamp-users",
  attributes: { name: "string|required" },
  idGenerator: () => `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
});

// Sequential IDs
let counter = 0;
const sequentialUsers = await s3db.createResource({
  name: "sequential-users",
  attributes: { name: "string|required" },
  idGenerator: () => `USER_${String(++counter).padStart(6, '0')}`
});

// Prefixed IDs
const prefixedUsers = await s3db.createResource({
  name: "prefixed-users",
  attributes: { name: "string|required" },
  idGenerator: () => `CUSTOM_${Math.random().toString(36).substr(2, 10).toUpperCase()}`
});
```

#### ID Generator Priority

```javascript
// Priority order: idGenerator function > idGenerator number > idSize > default
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string|required" },
  idGenerator: () => "custom-id", // This takes precedence
  idSize: 16 // This is ignored
});
```

### 🔌 Plugin System

Extend s3db.js functionality with plugins:

#### Built-in Plugins

```javascript
import { CachePlugin, CostsPlugin } from 's3db.js';

// Enable caching and cost tracking
const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [CachePlugin, CostsPlugin]
});
```

#### Cache Plugin

```javascript
// Automatic caching for read operations
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string|required" }
});

// These operations are automatically cached:
await users.count();           // Cached count
await users.list();           // Cached list
await users.getMany([...]);   // Cached bulk get
await users.page({...});      // Cached pagination

// Write operations automatically clear cache:
await users.insert({...});    // Clears cache
await users.update(id, {...}); // Clears cache
await users.delete(id);       // Clears cache
```

#### Costs Plugin

```javascript
// Track AWS S3 costs in real-time
const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [CostsPlugin]
});

// Monitor costs during operations
await users.insert({ name: "John" });
await users.get("user-123");
await users.list();

// Check current costs
console.log(s3db.client.costs);
// {
//   total: 0.000009,
//   requests: { total: 3, put: 1, get: 2 },
//   events: { PutObjectCommand: 1, GetObjectCommand: 1, HeadObjectCommand: 1 }
// }
```

#### Custom Plugins

```javascript
// Create custom plugin
const MyCustomPlugin = {
  async setup(database) {
    this.database = database;
    console.log('Custom plugin setup');
  },
  
  async start() {
    console.log('Custom plugin started');
  },
  
  async stop() {
    console.log('Custom plugin stopped');
  }
};

// Use custom plugin
const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [MyCustomPlugin, CachePlugin]
});
```

### 🎛️ Advanced Behaviors

Choose the right behavior strategy for your use case:

#### Behavior Comparison

| Behavior | Use Case | 2KB Limit | Data Loss | Performance |
|----------|----------|------------|-----------|-------------|
| `user-management` | Development/Testing | Warns | No | High |
| `enforce-limits` | Production/Strict | Throws Error | No | High |
| `data-truncate` | Content Management | Truncates | Yes | High |
| `body-overflow` | Large Documents | Uses S3 Body | No | Medium |

#### User Management Behavior (Default)

```javascript
// Flexible behavior - warns but doesn't block
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string", bio: "string" },
  behavior: "user-management" // Default
});

// Listen for limit warnings
users.on('exceedsLimit', (data) => {
  console.warn(`Data exceeds 2KB limit by ${data.excess} bytes`);
});

// Operation continues despite warning
await users.insert({
  name: "John",
  bio: "A".repeat(3000) // > 2KB
});
```

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
  behavior: "data-truncate"
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
| `readable(options?)` | Create readable stream | `await users.readable({batchSize: 50})` |
| `writable(options?)` | Create writable stream | `await users.writable({batchSize: 25})` |



---

## 🎨 Examples

### 📝 Blog Platform

```javascript
// Create blog posts with body-overflow behavior for long content
const posts = await s3db.createResource({
  name: "posts",
  attributes: {
    title: "string|min:5|max:200",
    content: "string",
    author: "string",
    tags: "array|items:string",
    published: "boolean|default:false",
    publishedAt: "date|optional"
  },
  behavior: "body-overflow", // Handle long content
  timestamps: true,
  partitions: {
    byAuthor: { fields: { author: "string" } },
    byTag: { fields: { "tags.0": "string" } }
  }
});

// Create a blog post
const post = await posts.insert({
  title: "Getting Started with s3db.js",
  content: "This is a comprehensive guide to using s3db.js for your next project...",
  author: "john_doe",
  tags: ["tutorial", "database", "s3"],
  published: true,
  publishedAt: new Date()
});

// Query posts by author
const johnsPosts = await posts.list({
  partition: "byAuthor",
  partitionValues: { author: "john_doe" }
});

// Get all posts (simple approach)
const allPosts = await posts.getAll();
console.log(`Total posts: ${allPosts.length}`);

// Get posts with pagination (advanced approach)
const firstPage = await posts.list({ limit: 10, offset: 0 });
const secondPage = await posts.list({ limit: 10, offset: 10 });
```

### 🛒 E-commerce Store

```javascript
// Products with detailed specifications
const products = await s3db.createResource({
  name: "products",
  attributes: {
    name: "string|min:2|max:200",
    description: "string",
    price: "number|positive",
    category: "string",
    inventory: {
      stock: "number|integer|min:0",
      reserved: "number|integer|min:0|default:0"
    },
    specifications: "object|optional",
    images: "array|items:url"
  },
  behavior: "body-overflow",
  timestamps: true,
  partitions: {
    byCategory: { fields: { category: "string" } }
  }
});

// Orders with customer information
const orders = await s3db.createResource({
  name: "orders",
  attributes: {
    customerId: "string",
    items: "array|items:object",
    total: "number|positive",
    status: "string|enum:pending,processing,shipped,delivered",
    shipping: {
      address: "string",
      city: "string",
      country: "string",
      zipCode: "string"
    }
  },
  behavior: "enforce-limits",
  timestamps: true
});

// Create a product
const product = await products.insert({
  name: "Premium Wireless Headphones",
  description: "High-quality audio with active noise cancellation",
  price: 299.99,
  category: "electronics",
  inventory: { stock: 50 },
  specifications: {
    brand: "AudioTech",
    model: "AT-WH1000",
    features: ["ANC", "Bluetooth 5.0", "30h battery"]
  },
  images: ["https://example.com/headphones-1.jpg"]
});

// Get all products (simple listing)
const allProducts = await products.getAll();
console.log(`Total products: ${allProducts.length}`);

// Get products by category (partitioned listing)
const electronics = await products.list({
  partition: "byCategory",
  partitionValues: { category: "electronics" }
});

// Create an order
const order = await orders.insert({
  customerId: "customer-123",
  items: [
    { productId: product.id, quantity: 1, price: 299.99 }
  ],
  total: 299.99,
  status: "pending",
  shipping: {
    address: "123 Main St",
    city: "New York",
    country: "USA",
    zipCode: "10001"
  }
});
```

### 👥 User Management System

```javascript
// Users with authentication
const users = await s3db.createResource({
  name: "users",
  attributes: {
    username: "string|min:3|max:50|unique",
    email: "email|unique",
    password: "secret", // Automatically encrypted
    role: "string|enum:user,admin,moderator|default:user",
    profile: {
      firstName: "string",
      lastName: "string",
      avatar: "url|optional",
      bio: "string|max:500|optional"
    },
    preferences: {
      theme: "string|enum:light,dark|default:light",
      language: "string|default:en",
      notifications: "boolean|default:true"
    },
    lastLogin: "date|optional"
  },
  behavior: "enforce-limits",
  timestamps: true,
  hooks: {
    preInsert: [async (data) => {
      // Auto-generate secure password if not provided
      if (!data.password) {
        data.password = generateSecurePassword();
      }
      return data;
    }],
    afterInsert: [async (data) => {
      console.log(`Welcome ${data.username}! 🎉`);
    }]
  }
});

// Register a new user
const user = await users.insert({
  username: "jane_smith",
  email: "jane@example.com",
  profile: {
    firstName: "Jane",
    lastName: "Smith"
  },
  preferences: {
    theme: "dark",
    notifications: true
  }
});

// Password was auto-generated and encrypted
console.log("Generated password:", user.password);
```

---

## 🔐 Security

### 🔒 Field-Level Encryption

Sensitive data is automatically encrypted using the `"secret"` type:

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: {
    email: "email",
    password: "secret",    // 🔐 Encrypted
    apiKey: "secret",      // 🔐 Encrypted
    creditCard: "secret"   // 🔐 Encrypted
  }
});

const user = await users.insert({
  email: "john@example.com",
  password: "my_secure_password",
  apiKey: "sk_live_123456789",
  creditCard: "4111111111111111"
});

// Data is automatically decrypted when retrieved
const retrieved = await users.get(user.id);
console.log(retrieved.password); // "my_secure_password" ✅
```

### 🎲 Auto-Generated Secure Passwords

s3db.js automatically generates secure passwords for `secret` fields when not provided:

```javascript
const accounts = await s3db.createResource({
  name: "accounts",
  attributes: {
    name: "string",
    password: "secret",     // Auto-generated if not provided
    apiKey: "secret"        // Auto-generated if not provided
  }
});

const account = await accounts.insert({
  name: "Service Account"
  // password and apiKey will be auto-generated
});

console.log(account.password); // "Ax7Kp9mN2qR3" (12-char secure password)
console.log(account.apiKey);   // "Bc8Lq0nO3sS4" (12-char secure key)
```

**Features:**
- 🎯 **12-character passwords** with cryptographically secure randomness
- 🚫 **No confusing characters** (excludes 0, O, 1, l, I)
- 🔄 **Unique every time** using nanoid generation
- 🛡️ **Custom passwords supported** when explicitly provided

### 🔑 Custom Encryption Keys

```javascript
import fs from "fs";

const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  passphrase: fs.readFileSync("./private-key.pem") // Custom encryption key
});
```

### ⚙️ Advanced Configuration Options

#### Database Configuration

```javascript
const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  
  // Versioning
  versioningEnabled: true,           // Enable versioning for all resources
  
  // Performance
  parallelism: 25,                   // Concurrent operations (default: 10)
  
  // Plugins
  plugins: [CachePlugin, CostsPlugin], // Enable plugins
  
  // Security
  passphrase: "custom-secret-key",   // Encryption key
  
  // Debugging
  verbose: true,                     // Enable verbose logging
});
```

#### Resource Configuration

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string", email: "string" },
  
  // ID Generation
  idGenerator: uuidv4,               // Custom ID generator function
  idSize: 16,                        // Custom ID size (if no idGenerator)
  
  // Versioning
  versioningEnabled: true,           // Enable for this resource
  
  // Behavior Strategy
  behavior: "body-overflow",         // How to handle large data
  
  // Schema Options
  allNestedObjectsOptional: true,    // Make nested objects optional
  autoDecrypt: true,                 // Auto-decrypt secret fields
  
  // Security
  paranoid: true,                    // Security flag for dangerous operations
  
  // Performance
  cache: false,                      // Enable caching for this resource
  parallelism: 10,                   // Resource-specific parallelism
});
```

---

## 💰 Cost Analysis

### 📊 Understanding S3 Costs

s3db.js is incredibly cost-effective because it uses S3 metadata instead of file storage:

| Operation | AWS Cost | s3db.js Usage |
|-----------|----------|---------------|
| **PUT Requests** | $0.0005 per 1,000 | Document inserts/updates |
| **GET Requests** | $0.0004 per 1,000 | Document retrievals |
| **Storage** | $0.023 per GB | ~$0 (uses 0-byte files) |
| **Data Transfer** | $0.09 per GB | Minimal (metadata only) |

### 💡 Cost Examples

<details>
<summary><strong>📈 Small Application (1,000 users)</strong></summary>

```javascript
// One-time setup cost
const setupCost = 0.0005; // 1,000 PUT requests = $0.0005

// Monthly operations (10 reads per user)
const monthlyReads = 0.004; // 10,000 GET requests = $0.004
const monthlyUpdates = 0.0005; // 1,000 PUT requests = $0.0005

const totalMonthlyCost = monthlyReads + monthlyUpdates;
console.log(`Monthly cost: $${totalMonthlyCost.toFixed(4)}`); // $0.0045
```

</details>

<details>
<summary><strong>🚀 Large Application (1,000,000 users)</strong></summary>

```javascript
// One-time setup cost
const setupCost = 0.50; // 1,000,000 PUT requests = $0.50

// Monthly operations (10 reads per user)
const monthlyReads = 4.00; // 10,000,000 GET requests = $4.00
const monthlyUpdates = 0.50; // 1,000,000 PUT requests = $0.50

const totalMonthlyCost = monthlyReads + monthlyUpdates;
console.log(`Monthly cost: $${totalMonthlyCost.toFixed(2)}`); // $4.50
```

</details>

### 📈 Cost Tracking

Monitor your expenses with the built-in cost tracking plugin:

```javascript
import { CostsPlugin } from "s3db.js";

const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [CostsPlugin]
});

// After operations
console.log("💰 Total cost:", s3db.client.costs.total.toFixed(4), "USD");
console.log("📊 Requests made:", s3db.client.costs.requests.total);
console.log("📈 Cost breakdown:", s3db.client.costs.breakdown);
```

---

## 🚨 Best Practices

### ✅ Do's

#### **🎯 Design for Document Storage**
```javascript
// ✅ Good: Well-structured documents
const user = {
  id: "user-123",
  name: "John Doe",
  profile: {
    bio: "Software developer",
    preferences: { theme: "dark" }
  }
};
```

#### **📈 Use Sequential IDs for Performance**
```javascript
// ✅ Best: Sequential IDs
const productIds = ["00001", "00002", "00003"];

// ✅ Good: UUIDs with sufficient entropy
const userIds = ["a1b2c3d4", "e5f6g7h8", "i9j0k1l2"];
```

#### **🔄 Leverage Streaming for Large Operations**
```javascript
// ✅ Good: Process large datasets with streams
const stream = await users.readable();
stream.on("data", (user) => {
  // Process each user individually
});
```

#### **🎛️ Choose the Right Behavior Strategy**
```javascript
// ✅ Development: Flexible with warnings
{ behavior: "user-management" }

// ✅ Production: Strict validation
{ behavior: "enforce-limits" }

// ✅ Content: Preserve all data
{ behavior: "body-overflow" }
```

### ❌ Don'ts

#### **🚫 Avoid Large Arrays in Documents**
```javascript
// ❌ Bad: Large arrays can exceed 2KB limit
const user = {
  name: "John",
  purchaseHistory: [/* hundreds of orders */]
};

// ✅ Better: Use separate resource with references
const user = { name: "John", id: "user-123" };
const orders = [
  { userId: "user-123", product: "...", date: "..." },
  // Store orders separately
];
```

#### **🚫 Don't Load Everything at Once**
```javascript
// ❌ Bad: Memory intensive
const allUsers = await users.getAll();

// ✅ Better: Use pagination or streaming
const page = await users.page({ offset: 0, size: 100 });
```

### 🎯 Performance Tips

1. **Enable caching** for frequently accessed data:
   ```javascript
   const s3db = new S3db({
     uri: "s3://...",
     cache: true,
     ttl: 3600 // 1 hour
   });
   ```

2. **Adjust parallelism** for bulk operations:
   ```javascript
   const s3db = new S3db({
     uri: "s3://...",
     parallelism: 25 // Handle 25 concurrent operations
   });
   ```

3. **Use partitions** for efficient queries:
   ```javascript
   // Query specific partitions instead of scanning all data
   const results = await users.list({
     partition: "byRegion",
     partitionValues: { region: "us-east" }
   });
   ```

### 🔧 Troubleshooting

#### Common Issues and Solutions

**1. Data Exceeds 2KB Limit**
```javascript
// Problem: "S3 metadata size exceeds 2KB limit"
// Solution: Use appropriate behavior strategy
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string", bio: "string" },
  behavior: "body-overflow" // Handles large data automatically
});
```

**2. Version Conflicts**
```javascript
// Problem: Objects not migrating between versions
// Solution: Ensure versioning is enabled and update objects
const users = await s3db.createResource({
  name: "users",
  versioningEnabled: true
});

// Force migration by updating the object
await users.update(userId, { ...existingData, newField: "value" });
```

**3. Partition Validation Errors**
```javascript
// Problem: "Partition uses field that does not exist"
// Solution: Ensure partition fields match attributes
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string",
    email: "string",
    profile: { country: "string" }
  },
  partitions: {
    byEmail: { fields: { email: "string" } },           // ✅ Valid
    byCountry: { fields: { "profile.country": "string" } } // ✅ Valid
    // byInvalid: { fields: { invalid: "string" } }     // ❌ Invalid
  }
});

// Use standard list() method with partition parameters
const results = await users.list({
  partition: "byEmail",
  partitionValues: { email: "user@example.com" }
});
```

**4. ID Generation Issues**
```javascript
// Problem: Custom ID generator not working
// Solution: Check priority order and function signature
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string" },
  idGenerator: () => `user_${Date.now()}`, // Must return string
  // idSize: 16 // This is ignored when idGenerator is provided
});
```

**5. Plugin Setup Issues**
```javascript
// Problem: Plugins not working
// Solution: Ensure proper import and setup
import { CachePlugin, CostsPlugin } from 's3db.js';

const s3db = new S3db({
  uri: "s3://...",
  plugins: [CachePlugin, CostsPlugin] // Array of plugin classes/functions
});

await s3db.connect(); // Plugins are initialized during connect
```

**6. Streaming Performance Issues**
```javascript
// Problem: Streams too slow or memory intensive
// Solution: Adjust batch size and concurrency
const stream = await users.readable({
  batchSize: 10,    // Smaller batches for memory
  concurrency: 5    // Fewer concurrent operations
});
```

**7. Hook Execution Problems**
```javascript
// Problem: Hooks not executing or context issues
// Solution: Use proper function binding and error handling
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string" },
  hooks: {
    preInsert: [
      async function(data) { // Use function() for proper 'this' binding
        console.log('Resource name:', this.name);
        return data;
      }
    ]
  }
});
```

### 📡 Events and Emitters

s3db.js uses Node.js EventEmitter for real-time notifications:

#### Resource Events

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string", email: "string" }
});

// Listen for resource operations
users.on('insert', (data) => {
  console.log('User inserted:', data.name);
});

users.on('update', (oldData, newData) => {
  console.log('User updated:', newData.name);
});

users.on('delete', (id) => {
  console.log('User deleted:', id);
});

users.on('get', (data) => {
  console.log('User retrieved:', data.name);
});
```

#### Versioning Events

```javascript
// Listen for version changes
users.on('versionUpdated', ({ oldVersion, newVersion }) => {
  console.log(`Resource updated from ${oldVersion} to ${newVersion}`);
});
```

#### Behavior Events

```javascript
// Listen for data limit warnings
users.on('exceedsLimit', (data) => {
  console.warn(`Data exceeds 2KB limit by ${data.excess} bytes`);
  console.log('Operation:', data.operation);
  console.log('Resource ID:', data.id);
});
```

#### Database Events

```javascript
// Listen for database-level events
s3db.on('s3db.resourceCreated', (resourceName) => {
  console.log(`Resource created: ${resourceName}`);
});

s3db.on('s3db.resourceUpdated', (resourceName) => {
  console.log(`Resource updated: ${resourceName}`);
});

s3db.on('metadataUploaded', (metadata) => {
  console.log('Database metadata updated');
});
```

#### Plugin Events

```javascript
// Listen for plugin-specific events
s3db.on('cache.hit', (key) => {
  console.log('Cache hit:', key);
});

s3db.on('cache.miss', (key) => {
  console.log('Cache miss:', key);
});
```

---

## 🧪 Testing

s3db.js includes a comprehensive test suite. Run tests with:

```bash
# Run all tests
npm test

# Run specific test file
npm test -- --testNamePattern="Resource"

# Run with coverage
npm run test:coverage
```

### Test Coverage

- ✅ **Unit Tests** - Individual component testing
- ✅ **Integration Tests** - End-to-end workflows
- ✅ **Behavior Tests** - Document handling strategies
- ✅ **Performance Tests** - Large dataset operations
- ✅ **Security Tests** - Encryption and validation

---

## 🤝 Contributing

We'd love your help making s3db.js even better! Here's how you can contribute:

### 🛠️ Development Setup

```bash
# Clone the repository
git clone https://github.com/forattini-dev/s3db.js.git
cd s3db.js

# Install dependencies
npm install

# Run tests
npm test

# Start development server
npm run dev
```

### 📋 Contribution Guidelines

1. **🍴 Fork** the repository
2. **🌿 Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **✨ Make** your changes with tests
4. **✅ Ensure** all tests pass (`npm test`)
5. **📝 Commit** your changes (`git commit -m 'Add amazing feature'`)
6. **🚀 Push** to your branch (`git push origin feature/amazing-feature`)
7. **🔄 Open** a Pull Request

### 🐛 Bug Reports

Found a bug? Please open an issue with:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Your environment details

### 💡 Feature Requests

Have an idea? We'd love to hear it! Open an issue describing:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

---

## 📄 License

This project is licensed under the **Unlicense** - see the [LICENSE](LICENSE) file for details.

This means you can use, modify, and distribute this software for any purpose without any restrictions. It's truly free and open source! 🎉

---

<p align="center">
  <strong>Made with ❤️ by developers, for developers</strong><br>
  <a href="https://github.com/forattini-dev/s3db.js">⭐ Star us on GitHub</a> •
  <a href="https://www.npmjs.com/package/s3db.js">📦 View on NPM</a> •
  <a href="https://github.com/forattini-dev/s3db.js/issues">🐛 Report Issues</a>
</p>

<p align="center">
  <sub>Built with Node.js • Powered by AWS S3 • Streaming Ready</sub>
</p>
