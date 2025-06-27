# s3db.js

[![license: unlicense](https://img.shields.io/badge/license-Unlicense-blue.svg)](http://unlicense.org/) [![npm version](https://img.shields.io/npm/v/s3db.js.svg?style=flat)](https://www.npmjs.com/package/s3db.js) [![Maintainability](https://api.codeclimate.com/v1/badges/26e3dc46c42367d44f18/maintainability)](https://codeclimate.com/github/forattini-dev/s3db.js/maintainability) [![Coverage Status](https://coveralls.io/repos/github/forattini-dev/s3db.js/badge.svg?branch=main)](https://coveralls.io/github/forattini-dev/s3db.js?branch=main)

**A document-based database built on AWS S3 with a powerful ORM-like interface**

Transform AWS S3 into a fully functional document database with automatic validation, encryption, caching, and streaming capabilities.

## 🚀 Quick Start

```bash
npm i s3db.js
```

```javascript
import { S3db } from "s3db.js";

// Connect to your S3 database
const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp"
});

await s3db.connect();

// Create a resource (collection)
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string|min:2|max:100",
    email: "email|unique",
    age: "number|integer|positive",
    isActive: "boolean",
    createdAt: "date"
  }
});

// Insert data
const user = await users.insert({
  name: "John Doe",
  email: "john@example.com",
  age: 30,
  isActive: true,
  createdAt: new Date()
});

// Query data
const foundUser = await users.get(user.id);
console.log(foundUser.name); // "John Doe"
```

## 📋 Table of Contents

- [🎯 What is s3db.js?](#-what-is-s3dbjs)
- [💡 How it Works](#-how-it-works)
- [⚡ Installation & Setup](#-installation--setup)
- [🔧 Configuration](#-configuration)
- [📚 Core Concepts](#-core-concepts)
- [🛠️ API Reference](#️-api-reference)
- [📊 Examples](#-examples)
- [🔄 Streaming](#-streaming)
- [🔐 Security & Encryption](#-security--encryption)
- [💰 Cost Analysis](#-cost-analysis)
- [🎛️ Advanced Features](#️-advanced-features)
- [🚨 Limitations & Best Practices](#-limitations--best-practices)
- [🧪 Testing](#-testing)
- [📅 Version Compatibility](#-version-compatibility)

## 🎯 What is s3db.js?

`s3db.js` is a document database that leverages AWS S3's metadata capabilities to store structured data. Instead of storing data in file bodies, it uses S3's metadata fields (up to 2KB) to store document data, making it extremely cost-effective for document storage.

### Key Features

- **🔄 ORM-like Interface**: Familiar database operations (insert, get, update, delete)
- **✅ Automatic Validation**: Built-in schema validation using fastest-validator
- **🔐 Encryption**: Optional field-level encryption for sensitive data
- **⚡ Streaming**: Handle large datasets with readable/writable streams
- **💾 Caching**: Reduce API calls with intelligent caching
- **📊 Cost Tracking**: Monitor AWS costs with built-in plugins
- **🛡️ Type Safety**: Full TypeScript support
- **🔧 Robust Serialization**: Advanced handling of arrays and objects with edge cases
- **📝 Comprehensive Testing**: Complete test suite with journey-based scenarios
- **🕒 Automatic Timestamps**: Optional createdAt/updatedAt fields
- **📦 Partitions**: Organize data by fields for efficient queries
- **🎣 Hooks**: Custom logic before/after operations
- **🔌 Plugins**: Extensible architecture

## 💡 How it Works

### The Magic Behind s3db.js

AWS S3 allows you to store metadata with each object:
- **Metadata**: Up to 2KB of UTF-8 encoded data

`s3db.js` cleverly uses these fields to store document data instead of file contents, making each S3 object act as a database record.

### Data Storage Strategy

```javascript
// Your document
{
  id: "user-123",
  name: "John Doe",
  email: "john@example.com",
  age: 30
}

// Stored in S3 as:
// Key: users/user-123
// Metadata: { "name": "John Doe", "email": "john@example.com", "age": "30", "id": "user-123" }
```

## ⚡ Installation & Setup

### Install

```bash
npm i s3db.js
# or
pnpm add s3db.js
# or
yarn add s3db.js
```

### Basic Setup

```javascript
import { S3db } from "s3db.js";

const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp"
});

await s3db.connect();
console.log("Connected to S3 database!");
```

### Environment Variables Setup

```javascript
import * as dotenv from "dotenv";
dotenv.config();

import { S3db } from "s3db.js";

const s3db = new S3db({
  uri: `s3://${process.env.AWS_ACCESS_KEY_ID}:${process.env.AWS_SECRET_ACCESS_KEY}@${process.env.AWS_BUCKET}/databases/${process.env.DATABASE_NAME}`
});
```

## �� Configuration

### Database Connection Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `uri` | `string` | **required** | S3 connection string |
| `parallelism` | `number` | `10` | Concurrent operations |
| `passphrase` | `string` | `"secret"` | Encryption key |
| `cache` | `boolean` | `false` | Enable caching |
| `ttl` | `number` | `86400` | Cache TTL in seconds |
| `plugins` | `array` | `[]` | Custom plugins |
| `endpoint` | `string` | `undefined` | Custom S3 endpoint (for MinIO, etc.) |
| `verbose` | `boolean` | `false` | Enable verbose logging |
| `client` | `object` | `undefined` | Custom S3 client instance |

### Resource Creation Options

When creating resources, you can specify additional options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | **required** | Resource name |
| `attributes` | `object` | **required** | Schema definition |
| `behavior` | `string` | `"user-management"` | How to handle 2KB metadata limit |
| `options` | `object` | `{}` | Additional resource options |

#### Behavior Options

| Behavior | Description | Use Case |
|----------|-------------|----------|
| `user-management` | Warns but allows operation (default) | Development, when you want to handle limits manually |
| `enforce-limits` | Throws error when limit exceeded | Strict applications requiring data integrity |
| `data-truncate` | Truncates data to fit within limit | When partial data is acceptable |
| `body-overflow` | Stores excess data in S3 object body | When complete data preservation is required |

#### Resource Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timestamps` | `boolean` | `false` | Auto-add createdAt/updatedAt fields |
| `partitions` | `object` | `{}` | Define data partitions for efficient queries |
| `hooks` | `object` | `{}` | Custom logic before/after operations |
| `cache` | `boolean` | `false` | Enable resource-level caching |
| `autoDecrypt` | `boolean` | `true` | Auto-decrypt secret fields |
| `paranoid` | `boolean` | `true` | Security flag for dangerous operations |

#### Schema Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoEncrypt` | `boolean` | `true` | Auto-encrypt secret fields |
| `autoDecrypt` | `boolean` | `true` | Auto-decrypt secret fields |
| `arraySeparator` | `string` | `"|"` | Separator for array serialization |
| `generateAutoHooks` | `boolean` | `true` | Auto-generate field transformation hooks |
| `hooks` | `object` | `{}` | Custom schema transformation hooks |

### 🔐 Authentication & Connectivity

`s3db.js` supports multiple authentication methods and can connect to various S3-compatible services:

#### Connection String Format

```
s3://[ACCESS_KEY:SECRET_KEY@]BUCKET_NAME[/PREFIX]
```

#### 1. AWS S3 with Access Keys

```javascript
const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp"
});
```

#### 2. AWS S3 with IAM Roles (EC2/EKS)

```javascript
// No credentials needed - uses IAM role permissions
const s3db = new S3db({
  uri: "s3://BUCKET_NAME/databases/myapp"
});
```

#### 3. MinIO or S3-Compatible Services

```javascript
const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  endpoint: "http://localhost:9000" // MinIO default endpoint
});
```

#### 4. Environment-Based Configuration

```javascript
const s3db = new S3db({
  uri: `s3://${process.env.AWS_ACCESS_KEY_ID}:${process.env.AWS_SECRET_ACCESS_KEY}@${process.env.AWS_BUCKET}/databases/${process.env.DATABASE_NAME}`,
  endpoint: process.env.S3_ENDPOINT
});
```

#### Security Best Practices

- **IAM Roles**: Use IAM roles instead of access keys when possible (EC2, EKS, Lambda)
- **Environment Variables**: Store credentials in environment variables, not in code
- **Bucket Permissions**: Ensure your IAM role/user has the necessary S3 permissions:
  - `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket`, `s3:GetBucketLocation`

### Advanced Configuration

```javascript
import fs from "fs";

const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  parallelism: 25,                    // Handle 25 concurrent operations
  passphrase: fs.readFileSync("./cert.pem"), // Custom encryption key
  cache: true,                        // Enable caching
  ttl: 3600,                         // 1 hour cache TTL
  plugins: [CostsPlugin]              // Enable cost tracking
});
```

## 📚 Core Concepts

### 1. Database

A database is a logical container for your resources, stored in a specific S3 prefix.

```javascript
// This creates/connects to a database at:
// s3://bucket/databases/myapp/
const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp"
});
```

### 2. Resources (Collections)

Resources are like tables in traditional databases - they define the structure of your documents.

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string|min:2|max:100",
    email: "email|unique",
    age: "number|integer|positive",
    profile: {
      bio: "string|optional",
      avatar: "url|optional"
    },
    tags: "array|items:string",
    metadata: "object|optional"
  }
});
```

#### Automatic Timestamps

If you enable the `timestamps` option, `s3db.js` will automatically add `createdAt` and `updatedAt` fields to your resource, and keep them updated on insert and update operations.

```js
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string", email: "email" },
  options: { timestamps: true }
});

const user = await users.insert({ name: "John", email: "john@example.com" });
console.log(user.createdAt); // e.g. "2024-06-27T12:34:56.789Z"
console.log(user.updatedAt); // same as createdAt on insert
```

### 3. Schema Validation

`s3db.js` uses [fastest-validator](https://github.com/icebob/fastest-validator) for schema validation with robust handling of edge cases:

```javascript
const attributes = {
  // Basic types
  name: "string|min:2|max:100|trim",
  email: "email|nullable",
  age: "number|integer|positive",
  isActive: "boolean",
  
  // Advanced types
  website: "url",
  uuid: "uuid",
  createdAt: "date",
  price: "currency|symbol:$",
  
  // Custom s3db types
  password: "secret",  // Encrypted field
  
  // Nested objects (supports empty objects and null values)
  address: {
    street: "string",
    city: "string",
    country: "string",
    zipCode: "string|optional"
  },
  
  // Arrays (robust serialization with special character handling)
  tags: "array|items:string|unique",        // Handles empty arrays: []
  scores: "array|items:number|min:1",       // Handles null arrays
  categories: "array|items:string",         // Handles arrays with pipe characters: ['tag|special', 'normal']
  
  // Multiple types
  id: ["string", "number"],
  
  // Complex nested structures
  metadata: {
    settings: "object|optional",     // Can be empty: {}
    preferences: "object|optional"   // Can be null
  }
};
```

### Enhanced Array and Object Handling

s3db.js now provides robust serialization for complex data structures:

```javascript
// ✅ Supported: Empty arrays and objects
const user = await users.insert({
  name: "John Doe",
  tags: [],              // Empty array - properly serialized
  metadata: {},          // Empty object - properly handled
  preferences: null      // Null object - correctly preserved
});

// ✅ Supported: Arrays with special characters
const product = await products.insert({
  name: "Widget",
  categories: ["electronics|gadgets", "home|office"],  // Pipe characters escaped
  tags: ["tag|with|pipes", "normal-tag"]               // Multiple pipes handled
});
```

## 🛠️ API Reference

### Database Operations

#### Connect to Database

```javascript
await s3db.connect();
// Emits 'connected' event when ready
```

#### Create Resource

```javascript
const resource = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string",
    email: "email"
  }
});
```

#### Get Resource Reference

```javascript
const users = s3db.resource("users");
// or 
const users = s3db.resources.users
```

### Resource Operations

#### Insert Document

```javascript
// With custom ID
const user = await users.insert({
  id: "user-123",
  name: "John Doe",
  email: "john@example.com"
});

// Auto-generated ID
const user = await users.insert({
  name: "Jane Doe",
  email: "jane@example.com"
});
// ID will be auto-generated using nanoid
```

#### Get Document

```javascript
const user = await users.get("user-123");
console.log(user.name); // "John Doe"
```

#### Update Document

```javascript
const updatedUser = await users.update("user-123", {
  name: "John Smith",
  age: 31
});
// Only specified fields are updated
```

#### Upsert Document

```javascript
// Insert if doesn't exist, update if exists
const user = await users.upsert("user-123", {
  name: "John Doe",
  email: "john@example.com",
  age: 30
});
```

#### Delete Document

```javascript
await users.delete("user-123");
```

#### Count Documents

```javascript
const count = await users.count();
console.log(`Total users: ${count}`);
```

### Bulk Operations

#### Insert Many

```javascript
const users = [
  { name: "User 1", email: "user1@example.com" },
  { name: "User 2", email: "user2@example.com" },
  { name: "User 3", email: "user3@example.com" }
];

await users.insertMany(users);
```

#### Get Many

```javascript
const userList = await users.getMany(["user-1", "user-2", "user-3"]);
```

#### Delete Many

```javascript
await users.deleteMany(["user-1", "user-2", "user-3"]);
```

#### Get All

```javascript
const allUsers = await users.getAll();
// Returns all documents in the resource
```

#### List IDs

```javascript
const userIds = await users.listIds();
// Returns array of all document IDs
```

#### Delete All

```javascript
await users.deleteAll();
// ⚠️ Destructive operation - removes all documents
```

## 📊 Examples

### E-commerce Application

```javascript
// Create product resource
const products = await s3db.createResource({
  name: "products",
  attributes: {
    name: "string|min:2|max:200",
    description: "string|optional",
    price: "number|positive",
    category: "string",
    tags: "array|items:string",
    inStock: "boolean",
    images: "array|items:url",
    metadata: "object|optional"
  }
});

// Create order resource
const orders = await s3db.createResource({
  name: "orders",
  attributes: {
    customerId: "string",
    products: "array|items:string",
    total: "number|positive",
    status: "string|enum:pending,paid,shipped,delivered",
    shippingAddress: {
      street: "string",
      city: "string",
      country: "string",
      zipCode: "string"
    },
    createdAt: "date"
  }
});

// Insert products
const product = await products.insert({
  name: "Wireless Headphones",
  description: "High-quality wireless headphones",
  price: 99.99,
  category: "electronics",
  tags: ["wireless", "bluetooth", "audio"],
  inStock: true,
  images: ["https://example.com/headphones.jpg"]
});

// Create order
const order = await orders.insert({
  customerId: "customer-123",
  products: [product.id],
  total: 99.99,
  status: "pending",
  shippingAddress: {
    street: "123 Main St",
    city: "New York",
    country: "USA",
    zipCode: "10001"
  },
  createdAt: new Date()
});
```

### User Authentication System

```javascript
// Create users resource with encrypted password
const users = await s3db.createResource({
  name: "users",
  attributes: {
    username: "string|min:3|max:50|unique",
    email: "email|unique",
    password: "secret",  // Encrypted field
    role: "string|enum:user,admin,moderator",
    isActive: "boolean",
    lastLogin: "date|optional",
    profile: {
      firstName: "string",
      lastName: "string",
      avatar: "url|optional",
      bio: "string|optional"
    }
  }
});

// Create sessions resource
const sessions = await s3db.createResource({
  name: "sessions",
  attributes: {
    userId: "string",
    token: "secret",  // Encrypted session token
    expiresAt: "date",
    userAgent: "string|optional",
    ipAddress: "string|optional"
  }
});

// Register user
const user = await users.insert({
  username: "john_doe",
  email: "john@example.com",
  password: "secure_password_123",
  role: "user",
  isActive: true,
  profile: {
    firstName: "John",
    lastName: "Doe"
  }
});

// Create session
const session = await sessions.insert({
  userId: user.id,
  token: "jwt_token_here",
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
  userAgent: "Mozilla/5.0...",
  ipAddress: "192.168.1.1"
});
```

## 🔄 Streaming

For large datasets, use streams to process data efficiently:

### Readable Stream

```javascript
const readableStream = await users.readable();

readableStream.on("id", (id) => {
  console.log("Processing user ID:", id);
});

readableStream.on("data", (user) => {
  console.log("User:", user.name);
  // Process each user
});

readableStream.on("end", () => {
  console.log("Finished processing all users");
});

readableStream.on("error", (error) => {
  console.error("Stream error:", error);
});
```

### Writable Stream

```javascript
const writableStream = await users.writable();

// Write data to stream
writableStream.write({
  name: "User 1",
  email: "user1@example.com"
});

writableStream.write({
  name: "User 2", 
  email: "user2@example.com"
});

// End stream
writableStream.end();
```

### Stream to CSV

```javascript
import fs from "fs";
import { createObjectCsvWriter } from "csv-writer";

const csvWriter = createObjectCsvWriter({
  path: "users.csv",
  header: [
    { id: "id", title: "ID" },
    { id: "name", title: "Name" },
    { id: "email", title: "Email" }
  ]
});

const readableStream = await users.readable();
const records = [];

readableStream.on("data", (user) => {
  records.push(user);
});

readableStream.on("end", async () => {
  await csvWriter.writeRecords(records);
  console.log("CSV file created successfully");
});
```

## 🔐 Security & Encryption

### Field-Level Encryption

Use the `"secret"` type for sensitive data:

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: {
    username: "string",
    email: "email",
    password: "secret",        // Encrypted
    apiKey: "secret",          // Encrypted
    creditCard: "secret"       // Encrypted
  }
});

// Data is automatically encrypted/decrypted
const user = await users.insert({
  username: "john_doe",
  email: "john@example.com",
  password: "my_secure_password",  // Stored encrypted
  apiKey: "sk_live_123456789",     // Stored encrypted
  creditCard: "4111111111111111"   // Stored encrypted
});

// Retrieved data is automatically decrypted
const retrieved = await users.get(user.id);
console.log(retrieved.password); // "my_secure_password" (decrypted)
```

### Custom Encryption Key

```javascript
import fs from "fs";

const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  passphrase: fs.readFileSync("./private-key.pem") // Custom encryption key
});
```

## 💰 Cost Analysis

### Understanding S3 Costs

- **PUT Requests**: $0.000005 per 1,000 requests
- **GET Requests**: $0.0000004 per 1,000 requests  
- **Data Transfer**: $0.09 per GB
- **Storage**: $0.023 per GB (but s3db.js uses 0-byte files)

### Cost Examples

#### Small Application (1,000 users)

```javascript
// Setup cost (one-time)
const setupCost = 0.005; // 1,000 PUT requests

// Monthly read cost
const monthlyReadCost = 0.0004; // 1,000 GET requests

console.log(`Setup: $${setupCost}`);
console.log(`Monthly reads: $${monthlyReadCost}`);
```

#### Large Application (1,000,000 users)

```javascript
// Setup cost (one-time)
const setupCost = 5.00; // 1,000,000 PUT requests

// Monthly read cost
const monthlyReadCost = 0.40; // 1,000,000 GET requests

console.log(`Setup: $${setupCost}`);
console.log(`Monthly reads: $${monthlyReadCost}`);
```

### Cost Tracking Plugin

```javascript
import { CostsPlugin } from "s3db.js";

const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [CostsPlugin]
});

// After operations
console.log("Total cost:", s3db.client.costs.total.toFixed(4), "USD");
console.log("Requests made:", s3db.client.costs.requests.total);
```

## 🎛️ Advanced Features

### AutoEncrypt / AutoDecrypt

Fields with the type `secret` are automatically encrypted and decrypted using the resource's passphrase. This ensures sensitive data is protected at rest.

```js
const users = await s3db.createResource({
  name: "users",
  attributes: {
    username: "string",
    password: "secret" // Will be encrypted
  }
});

const user = await users.insert({
  username: "john_doe",
  password: "my_secret_password"
});

// The password is stored encrypted in S3, but automatically decrypted when retrieved
const retrieved = await users.get(user.id);
console.log(retrieved.password); // "my_secret_password"
```

### Resource Events

All resources emit events for key operations. You can listen to these events for logging, analytics, or custom workflows.

```js
users.on("insert", (data) => console.log("User inserted:", data.id));
users.on("get", (data) => console.log("User retrieved:", data.id));
users.on("update", (attrs, data) => console.log("User updated:", data.id));
users.on("delete", (id) => console.log("User deleted:", id));
```

### Resource Schema Export/Import

You can export and import resource schemas for backup, migration, or versioning purposes.

```js
// Export schema
const schemaData = users.schema.export();

// Import schema
const importedSchema = Schema.import(schemaData);
```

## Partitions

`s3db.js` supports **partitions** to organize and query your data efficiently. Partitions allow you to group documents by one or more fields, making it easy to filter, archive, or manage large datasets.

### Defining partitions

You can define partitions when creating a resource using the `options.partitions` property:

```js
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string",
    email: "email",
    region: "string",
    ageGroup: "string"
  },
  options: {
    partitions: {
      byRegion: {
        fields: { region: "string" }
      },
      byAgeGroup: {
        fields: { ageGroup: "string" }
      }
    }
  }
});
```

### Querying by partition

```js
// Find all users in the 'south' region
const usersSouth = await users.query({ region: "south" });

// Find all users in the 'adult' age group
const adults = await users.query({ ageGroup: "adult" });
```

### Example: Time-based partition

```js
const logs = await s3db.createResource({
  name: "logs",
  attributes: {
    message: "string",
    level: "string",
    createdAt: "date"
  },
  options: {
    partitions: {
      byDate: {
        fields: { createdAt: "date|maxlength:10" }
      }
    }
  }
});

// Query logs for a specific day
const logsToday = await logs.query({ createdAt: "2024-06-27" });
```

## Hooks

`s3db.js` provides a powerful hooks system to let you run custom logic before and after key operations on your resources. Hooks can be used for validation, transformation, logging, or any custom workflow.

### Supported hooks
- `preInsert` / `afterInsert`
- `preUpdate` / `afterUpdate`
- `preDelete` / `afterDelete`

### Registering hooks
You can register hooks when creating a resource or dynamically:

```js
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string", email: "email" },
  options: {
    hooks: {
      preInsert: [async (data) => {
        if (!data.email.includes("@")) throw new Error("Invalid email");
        return data;
      }],
      afterInsert: [async (data) => {
        console.log("User inserted:", data.id);
      }]
    }
  }
});

// Or dynamically:
users.addHook('preInsert', async (data) => {
  // Custom logic
  return data;
});
```

### Hook execution order
- Internal hooks run first, user hooks run last (in the order they were added).
- Hooks can be async and can modify the data (for `pre*` hooks).
- If a hook throws, the operation is aborted.

## Plugins

`s3db.js` supports plugins to extend or customize its behavior. Plugins can hook into lifecycle events, add new methods, or integrate with external systems.

### Example: Custom plugin

```js
const MyPlugin = {
  setup(s3db) {
    console.log("Plugin setup");
  },
  start() {
    console.log("Plugin started");
  },
  onUserCreated(user) {
    console.log("New user created:", user.id);
  }
};

const s3db = new S3db({
  uri: "s3://...",
  plugins: [MyPlugin]
});
```

## Resource Behaviors

`s3db.js` provides **Resource Behaviors** to handle the 2KB S3 metadata limit in different ways. When your document data exceeds this limit, you can choose how the system should respond.

### Available Behaviors

| Behavior | Description | Use Case |
|----------|-------------|----------|
| `user-management` | Warns but allows operation (default) | Development, when you want to handle limits manually |
| `enforce-limits` | Throws error when limit exceeded | Strict applications requiring data integrity |
| `data-truncate` | Truncates data to fit within limit | When partial data is acceptable |
| `body-overflow` | Stores excess data in S3 object body | When complete data preservation is required |

### Setting Behavior

You can set the behavior when creating a resource:

```js
const users = await s3db.createResource({
  name: "users",
  behavior: "body-overflow", // Choose your behavior
  attributes: {
    name: "string",
    email: "email",
    bio: "string|optional",
    description: "string|optional"
  }
});
```

### 1. User Management Behavior (Default)

The default behavior that warns you when data exceeds the 2KB limit but doesn't block operations.

```js
const users = await s3db.createResource({
  name: "users",
  behavior: "user-management", // Default behavior
  attributes: {
    name: "string",
    email: "email",
    bio: "string|optional"
  }
});

// Listen for warning events
users.on("exceedsLimit", (context) => {
  console.log(`⚠️  Warning: Metadata size exceeds limit!`);
  console.log(`   Operation: ${context.operation}`);
  console.log(`   Size: ${context.totalSize} bytes (limit: ${context.limit} bytes)`);
  console.log(`   Excess: ${context.excess} bytes`);
});

// Insert large data (will emit warning but succeed)
const user = await users.insert({
  name: "John Doe",
  email: "john@example.com",
  bio: "A".repeat(1000) // Large bio that exceeds limit
});
```

### 2. Enforce Limits Behavior

Strict behavior that throws an error when data exceeds the 2KB limit.

```js
const users = await s3db.createResource({
  name: "users",
  behavior: "enforce-limits",
  attributes: {
    name: "string",
    email: "email",
    bio: "string|optional"
  }
});

try {
  const user = await users.insert({
    name: "John Doe",
    email: "john@example.com",
    bio: "A".repeat(1000) // Large bio
  });
} catch (error) {
  console.log("Insert failed:", error.message);
  // Error: S3 metadata size exceeds 2KB limit. Current size: 2049 bytes, limit: 2048 bytes
}
```

### 3. Data Truncate Behavior

Automatically truncates data to fit within the 2KB limit, prioritizing smaller attributes.

```js
const users = await s3db.createResource({
  name: "users",
  behavior: "data-truncate",
  attributes: {
    name: "string",
    email: "email",
    bio: "string|optional",
    description: "string|optional"
  }
});

const user = await users.insert({
  name: "John Doe",
  email: "john@example.com",
  bio: "A".repeat(1000), // Will be truncated
  description: "B".repeat(1000) // Will be truncated
});

// Retrieve the truncated data
const retrieved = await users.get(user.id);
console.log(retrieved.bio); // "AAA...AAA..." (truncated with "..." suffix)
console.log(retrieved.description); // May be completely removed if no space
```

### 4. Body Overflow Behavior

Stores excess data in the S3 object body, preserving complete data integrity.

```js
const users = await s3db.createResource({
  name: "users",
  behavior: "body-overflow",
  attributes: {
    name: "string",
    email: "email",
    bio: "string|optional",
    description: "string|optional"
  }
});

const user = await users.insert({
  name: "John Doe",
  email: "john@example.com",
  bio: "A".repeat(1000), // Stored in body
  description: "B".repeat(1000) // Stored in body
});

// Retrieve complete data (no loss)
const retrieved = await users.get(user.id);
console.log(retrieved.bio.length); // 1000 (complete)
console.log(retrieved.description.length); // 1000 (complete)
```

### Behavior Comparison

| Aspect | user-management | enforce-limits | data-truncate | body-overflow |
|--------|----------------|----------------|---------------|---------------|
| **Data Loss** | None | None | Partial | None |
| **Error Handling** | Warnings | Errors | None | None |
| **Performance** | Fast | Fast | Fast | Slower (body I/O) |
| **Storage Cost** | Low | Low | Low | Higher (body storage) |
| **Use Case** | Development | Strict apps | Partial data OK | Complete data required |

### Best Practices

#### Choose the Right Behavior

```js
// Development/Testing
const devUsers = await s3db.createResource({
  name: "users_dev",
  behavior: "user-management" // Get warnings to understand data size
});

// Production with strict requirements
const prodUsers = await s3db.createResource({
  name: "users_prod", 
  behavior: "enforce-limits" // Fail fast on size issues
});

// When partial data is acceptable
const logs = await s3db.createResource({
  name: "logs",
  behavior: "data-truncate" // Truncate long log messages
});

// When complete data is critical
const documents = await s3db.createResource({
  name: "documents",
  behavior: "body-overflow" // Preserve all document content
});
```

#### Monitor Data Size

```js
// Listen for size warnings
users.on("exceedsLimit", (context) => {
  // Log to monitoring system
  console.log(`Resource ${context.resource.name} exceeded limit:`, {
    operation: context.operation,
    size: context.totalSize,
    excess: context.excess,
    timestamp: new Date().toISOString()
  });
  
  // Send alert if needed
  if (context.excess > 500) {
    sendAlert(`Large data detected: ${context.excess} bytes excess`);
  }
});
```

#### Design for Metadata Limits

```js
// ✅ Good: Keep important data small
const user = {
  name: "John Doe",
  email: "john@example.com",
  status: "active",
  // Store large content in separate resource
  profileId: "profile-123" // Reference to profile resource
};

// ❌ Avoid: Large data in main document
const user = {
  name: "John Doe", 
  email: "john@example.com",
  bio: "Very long biography...".repeat(100), // Could exceed limit
  fullProfile: { /* large nested object */ }
};
```

### Behavior Migration

You can change a resource's behavior after creation:

```js
// Create resource with default behavior
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string", email: "email" }
});

// Later, update the behavior
await s3db.createResource({
  name: "users", // Same name
  behavior: "body-overflow" // New behavior
});
```

**⚠️ Note**: Changing behavior affects new operations but doesn't migrate existing data. Existing documents retain their original storage format.

## 🚨 Limitations & Best Practices

### Limitations

1. **Document Size**: Maximum ~2KB per document (metadata only)
2. **No Complex Queries**: No SQL-like WHERE clauses or joins
3. **No Indexes**: No automatic indexing for fast lookups
4. **Sequential IDs**: Best performance with sequential IDs (00001, 00002, etc.)
5. **No Transactions**: No ACID transactions across multiple operations
6. **S3 Pagination**: S3 lists objects in pages of 1000 items maximum, and these operations are not parallelizable, which can make listing large datasets slow

### ✅ Recent Improvements

**🔧 Enhanced Data Serialization (v3.3.2+)**

s3db.js now handles complex data structures robustly:

- **Empty Arrays**: `[]` correctly serialized and preserved
- **Null Arrays**: `null` values maintained without corruption  
- **Special Characters**: Arrays with pipe `|` characters properly escaped
- **Empty Objects**: `{}` correctly mapped and stored
- **Null Objects**: `null` object values preserved during serialization
- **Nested Structures**: Complex nested objects with mixed empty/null values supported

### Best Practices

#### 1. Design for Document Storage

```javascript
// ✅ Good: Nested structure is fine
const user = {
  id: "user-123",
  name: "John Doe",
  email: "john@example.com",
  profile: {
    bio: "Software developer",
    avatar: "https://example.com/avatar.jpg",
    preferences: {
      theme: "dark",
      notifications: true
    }
  }
};

// ❌ Avoid: Large arrays in documents
const user = {
  id: "user-123",
  name: "John Doe",
  // This could exceed metadata limits
  purchaseHistory: [
    { id: "order-1", date: "2023-01-01", total: 99.99 },
    { id: "order-2", date: "2023-01-15", total: 149.99 },
    // ... many more items
  ]
};
```

#### 2. Use Sequential IDs

```javascript
// ✅ Good: Sequential IDs for better performance
const users = ["00001", "00002", "00003", "00004"];

// ⚠️ Acceptable: Random IDs (but ensure sufficient uniqueness)
const users = ["abc123", "def456", "ghi789", "jkl012"];

// ❌ Avoid: Random IDs with low combinations (risk of collisions)
const users = ["a1", "b2", "c3", "d4"]; // Only 26*10 = 260 combinations
```

#### 3. Optimize for Read Patterns

```javascript
// ✅ Good: Store frequently accessed data together
const order = {
  id: "order-123",
  customerId: "customer-456",
  customerName: "John Doe",  // Denormalized for quick access
  items: ["product-1", "product-2"],
  total: 99.99
};

// ❌ Avoid: Requiring multiple lookups
const order = {
  id: "order-123",
  customerId: "customer-456",  // Requires separate lookup
  items: ["product-1", "product-2"]
};
```

#### 4. Use Streaming for Large Datasets

```javascript
// ✅ Good: Use streams for large operations
const readableStream = await users.readable();
readableStream.on("data", (user) => {
  // Process each user individually
});

// ❌ Avoid: Loading all data at once
const allUsers = await users.getAll(); // May timeout with large datasets
```

#### 5. Implement Proper Error Handling

```javascript
// Method 1: Try-catch with get()
try {
  const user = await users.get("non-existent-id");
} catch (error) {
  if (error.message.includes("does not exist")) {
    console.log("User not found");
  } else {
    console.error("Unexpected error:", error);
  }
}

// Method 2: Check existence first (⚠️ Additional request cost)
const userId = "user-123";
if (await users.exists(userId)) {
  const user = await users.get(userId);
  console.log("User found:", user.name);
} else {
  console.log("User not found");
}
```

**⚠️ Cost Warning**: Using `exists()` creates an additional S3 request. For high-volume operations, prefer the try-catch approach to minimize costs.

### Performance Tips

1. **Enable Caching**: Use `cache: true` for frequently accessed data
2. **Adjust Parallelism**: Increase `parallelism` for bulk operations
3. **Use Streams**: For datasets larger than 1,000 records
4. **Batch Operations**: Use `insertMany()` instead of multiple `insert()` calls
5. **Monitor Costs**: Use the CostsPlugin to track AWS expenses
6. **Understand S3 Limits**: S3 paginates results in 1000-item chunks and these operations are sequential, not parallel. For very large datasets (>10,000 items), consider using streams or implementing custom pagination strategies

## 🧪 Testing

s3db.js includes a comprehensive test suite organized as journey-based scenarios that demonstrate real-world usage patterns.

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- tests/schema.test.js      # Schema validation and serialization
npm test -- tests/validator.test.js  # Field validation and encryption
npm test -- tests/crypto.test.js     # Encryption/decryption functions
npm test -- tests/bundle.test.js     # Package exports verification

# Tests requiring S3 configuration
npm test -- tests/resource.test.js   # Resource operations (needs S3)
npm test -- tests/client.test.js     # S3 client operations (needs S3)
npm test -- tests/database.test.js   # Database operations (needs S3)
```

### Test Structure

Each test file follows a "journey" pattern that tells a complete story:

```javascript
// Example: Schema Journey
test('Schema Journey: Create → Validate → Map → Serialize → Deserialize → Unmap', async () => {
  // 1. Create Schema with diverse field types
  const schema = new Schema({...});
  
  // 2. Test complex data with edge cases
  const testData = {...};
  
  // 3. Validate the data
  const validationResult = await schema.validate(testData);
  
  // 4. Map the data (apply transformations)
  const mappedData = await schema.mapper(testData);
  
  // 5. Test array edge cases (empty arrays, special characters, null values)
  // 6. Test object edge cases (empty objects, null objects)
  // 7. Unmap the data (reverse transformations)
  // 8. Verify data integrity throughout the process
});
```

### S3 Configuration for Integration Tests

For tests that require S3 access, set these environment variables:

```bash
export BUCKET_CONNECTION_STRING="s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME"
export MINIO_USER="your-minio-username"
export MINIO_PASSWORD="your-minio-password"
```

## 🎛️ Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/forattini-dev/s3db.js.git
cd s3db.js
npm install
npm test
```

### Test Organization

- **Core Tests** (no S3 required): `schema`, `validator`, `crypto`, `connection-string`, `bundle`
- **Integration Tests** (S3 required): `resource`, `client`, `database`, `cache`, `plugins`, `streams`
- **Test Structure**: Journey-based scenarios demonstrating complete workflows
- **Edge Cases**: Comprehensive coverage of array/object serialization edge cases

## 📄 Version Compatibility

### Non-Backward Compatible Versions

| Version | Breaking Changes | Migration Required |
|---------|-----------------|-------------------|
| **v4.0.0** | • Resource paths now versioned: `resource={name}/v={version}/id={id}`<br>• Automatic schema versioning introduced<br>• Cannot read v3.x databases without migration | **YES** - Use migration script |
| **v3.0.0** | • Schema validation improvements<br>• Array/object serialization fixes | No - Data compatible |
| **v2.0.0** | • API restructure<br>• New connection string format | No - Only API changes |

### ⚠️ Important: v4.x Migration Required

If you're upgrading from **v3.x or earlier**, you **MUST** migrate your data using our migration script. v4.x uses a completely different path structure that is not backward compatible.

**Why the breaking change?**
- v4.x introduces automatic schema versioning
- Resources can now evolve over time without breaking existing data
- Better organization with version-based subdirectories
- Improved data integrity and schema management

### 🔄 Migration Guide: v3.x → v4.x

We provide a complete migration script to help you upgrade from v3.x to v4.x:

```bash
# 1. Download the migration script
curl -O https://raw.githubusercontent.com/forattini-dev/s3db.js/main/examples/migrate-v3-to-v4.js

# 2. Install dependencies
npm install @aws-sdk/client-s3

# 3. Configure the script with your S3 credentials and resources
# Edit migrate-v3-to-v4.js and update MIGRATION_CONFIG

# 4. Run a dry run first to test the migration
node migrate-v3-to-v4.js
```

**Migration Process:**
1. **Backup**: Automatically creates backups of your v3.x data
2. **Read**: Extracts data from v3.x format (`resource={name}/id={id}`)
3. **Transform**: Converts metadata format and applies schema validation
4. **Write**: Inserts data into v4.x format (`resource={name}/v={version}/id={id}`)
5. **Validate**: Verifies data integrity and migration success

**⚠️ Important Notes:**
- Always run with `dryRun: true` first to test the migration
- Ensure you have backups before starting the migration
- The script handles large datasets with batching and progress tracking
- Original v3.x data is preserved during migration (you can delete it after verification)

**Current Schema Versioning (v4.0.0+):**

```javascript
// v4.x automatically handles schema versions
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string|min:2|max:100",
    email: "email|unique",
    age: "number|integer|positive"
  }
});
// Stored at: resource=users/v=v0/id={id}

// Schema evolution - s3db automatically creates new version
const updatedUsers = await s3db.createResource({
  name: "users", // Same name!
  attributes: {
    name: "string|min:2|max:100",
    email: "email|unique", 
    age: "number|integer|positive",
    phone: "string|optional",        // New field
    address: {                       // New nested object
      street: "string",
      city: "string", 
      country: "string"
    }
  }
});
// New data stored at: resource=users/v=v1/id={id}
// Old data remains at: resource=users/id={id}
```
