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

## 🔧 Configuration

### Connection Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `uri` | `string` | **required** | S3 connection string |
| `parallelism` | `number` | `10` | Concurrent operations |
| `passphrase` | `string` | `"secret"` | Encryption key |
| `cache` | `boolean` | `false` | Enable caching |
| `ttl` | `number` | `86400` | Cache TTL in seconds |
| `plugins` | `array` | `[]` | Custom plugins |

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

### 3. Schema Validation

`s3db.js` uses [fastest-validator](https://github.com/icebob/fastest-validator) for schema validation:

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
  
  // Nested objects
  address: {
    street: "string",
    city: "string",
    country: "string",
    zipCode: "string|optional"
  },
  
  // Arrays
  tags: "array|items:string|unique",
  scores: "array|items:number|min:1",
  
  // Multiple types
  id: ["string", "number"]
};
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
// Creates new document if ID doesn't exist, updates existing one if it does
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

### Content Management System

```javascript
// Create articles resource
const articles = await s3db.createResource({
  name: "articles",
  attributes: {
    title: "string|min:5|max:200",
    slug: "string|unique",
    content: "string|min:10",
    excerpt: "string|optional",
    authorId: "string",
    status: "string|enum:draft,published,archived",
    tags: "array|items:string",
    category: "string",
    featuredImage: "url|optional",
    publishedAt: "date|optional",
    viewCount: "number|integer|positive",
    seo: {
      metaTitle: "string|optional",
      metaDescription: "string|optional",
      keywords: "array|items:string|optional"
    }
  }
});

// Create comments resource
const comments = await s3db.createResource({
  name: "comments",
  attributes: {
    articleId: "string",
    authorName: "string",
    authorEmail: "email",
    content: "string|min:1|max:1000",
    isApproved: "boolean",
    createdAt: "date"
  }
});

// Insert article
const article = await articles.insert({
  title: "Getting Started with s3db.js",
  slug: "getting-started-with-s3db-js",
  content: "s3db.js is a powerful document database...",
  excerpt: "Learn how to use s3db.js to build scalable applications",
  authorId: "author-123",
  status: "published",
  tags: ["database", "aws", "javascript"],
  category: "tutorial",
  featuredImage: "https://example.com/s3db-article.jpg",
  publishedAt: new Date(),
  viewCount: 0,
  seo: {
    metaTitle: "Getting Started with s3db.js - Complete Guide",
    metaDescription: "Learn how to use s3db.js to build scalable applications with AWS S3",
    keywords: ["s3db", "aws", "database", "javascript"]
  }
});

// Add comment
const comment = await comments.insert({
  articleId: article.id,
  authorName: "Jane Smith",
  authorEmail: "jane@example.com",
  content: "Great article! Very helpful for my project.",
  isApproved: true,
  createdAt: new Date()
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

### Events

All classes emit events for monitoring:

```javascript
// Database events
s3db.on("connected", () => console.log("Database connected"));
s3db.on("error", (error) => console.error("Database error:", error));

// Resource events
const users = s3db.resource("users");

users.on("insert", (data) => console.log("User inserted:", data.id));
users.on("get", (data) => console.log("User retrieved:", data.id));
users.on("update", (attrs, data) => console.log("User updated:", data.id));
users.on("delete", (id) => console.log("User deleted:", id));

// Client events
s3db.client.on("request", (action, params) => {
  console.log(`S3 ${action} request:`, params);
});

s3db.client.on("response", (action, params, response) => {
  console.log(`S3 ${action} response:`, response.statusCode);
});
```

### Custom Plugins

```javascript
const MyPlugin = {
  setup(s3db) {
    console.log("Plugin setup");
  },
  
  start() {
    console.log("Plugin started");
  },
  
  // Hook into events
  onUserCreated(user) {
    console.log("New user created:", user.id);
  }
};

const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [MyPlugin]
});
```

### S3 Client

Direct access to S3 operations:

```javascript
import { S3Client } from "s3db.js";

const client = new S3Client({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME"
});

// Upload file
await client.putObject({
  key: "uploads/file.txt",
  contentType: "text/plain",
  body: "Hello World",
  metadata: { author: "John Doe" }
});

// Download file
const { Body, Metadata } = await client.getObject({
  key: "uploads/file.txt"
});

// List files
const response = await client.listObjects({
  prefix: "uploads/"
});

// Count files
const count = await client.count({
  prefix: "uploads/"
});
```

## 🚨 Limitations & Best Practices

### Limitations

1. **Document Size**: Maximum ~2KB per document (metadata only)
2. **No Complex Queries**: No SQL-like WHERE clauses or joins
3. **No Indexes**: No automatic indexing for fast lookups
4. **Sequential IDs**: Best performance with sequential IDs (00001, 00002, etc.)
5. **No Transactions**: No ACID transactions across multiple operations
6. **S3 Pagination**: S3 lists objects in pages of 1000 items maximum, and these operations are not parallelizable, which can make listing large datasets slow

### ⚠️ Critical: Resource Schema Versioning

**🚨 IMPORTANT**: Resource schema versioning is planned for future releases but is **NOT CURRENTLY SUPPORTED**. Once you create a resource, **DO NOT MODIFY ITS STRUCTURE** in production.

**What this means:**
- You cannot add, remove, or modify attributes in existing resources
- Schema changes require creating new resources with different names
- Data migration between resource versions must be handled manually

**Example of proper versioning approach:**

```javascript
// Version 1: Basic user resource
const usersV1 = await s3db.createResource({
  name: "users_v1",
  attributes: {
    name: "string|min:2|max:100",
    email: "email|unique",
    age: "number|integer|positive"
  }
});

// Version 2: Enhanced user resource with new fields
const usersV2 = await s3db.createResource({
  name: "users_v2", 
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

// Migration script using streams
const migrateUsersV1ToV2 = async () => {
  const readableStream = await usersV1.readable();
  const writableStream = await usersV2.writable();
  
  readableStream.on("data", async (userV1) => {
    // Transform V1 data to V2 format
    const userV2 = {
      id: userV1.id,
      name: userV1.name,
      email: userV1.email,
      age: userV1.age,
      phone: null,  // New field with default value
      address: {    // New nested object with default values
        street: "",
        city: "",
        country: ""
      }
    };
    
    // Write to V2 resource
    writableStream.write(userV2);
  });
  
  readableStream.on("end", () => {
    writableStream.end();
    console.log("Migration completed!");
  });
  
  readableStream.on("error", (error) => {
    console.error("Migration error:", error);
    writableStream.destroy(error);
  });
};

// Run migration
await migrateUsersV1ToV2();
```

**Roadmap**: Resource schema versioning with automatic migration tools is planned for future releases.

### 🔮 Roadmap: Object Tags Support

**Future Enhancement**: In upcoming versions, s3db.js will support AWS S3 Object Tags as an additional storage option, configurable per resource.

```javascript
// Future configuration example
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string|min:2|max:100",
    email: "email|unique",
    age: "number|integer|positive"
  },
  storage: {
    useObjectTags: true,  // Future option to enable object tags
    metadataLimit: 2048,  // Metadata limit in bytes
    tagsLimit: 2560       // Tags limit in bytes (10 key-value pairs)
  }
});
```

**Why Object Tags Might Not Be Ideal for Large Projects:**

1. **AWS Cost Reports**: Object tags appear in AWS cost allocation reports, potentially cluttering billing data
2. **Tag Management**: AWS has a limit of 50 tags per object across all services
3. **Reporting Complexity**: Large numbers of tagged objects can make cost analysis more complex
4. **Performance**: Additional API calls may be required for tag operations

**Recommendation**: For enterprise applications or large-scale projects, consider keeping object tags disabled to maintain clean AWS cost reporting and avoid potential tag management overhead.

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

**Note**: You can use any type of ID, but remember that random IDs with low combinations can generate collisions. For better performance, sequential IDs are recommended, but if using random IDs, ensure they have sufficient uniqueness (e.g., using nanoid or similar libraries).

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

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/forattini-dev/s3db.js.git
cd s3db.js
npm install
npm test
```

## 📄 License

This project is licensed under the Unlicense - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

**Important**: This library is designed for educational and experimental purposes. While it can be used in production, please:

1. Understand the limitations and costs involved
2. Test thoroughly with your specific use case
3. Monitor AWS costs carefully
4. Consider traditional databases for critical applications

Use at your own risk! 🚀
