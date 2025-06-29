# 🗃️ s3db.js

<p align="center">
  <img width="200" src="https://img.icons8.com/fluency/200/database.png" alt="s3db.js">
</p>

<p align="center">
  <strong>Transform AWS S3 into a powerful document database</strong><br>
  <em>Zero-cost storage • Automatic encryption • TypeScript ready • ORM-like interface</em>
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
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-Ready-3178C6.svg?style=flat&logo=typescript" alt="TypeScript Ready"></a>
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
- **TypeScript Support** - Full type safety
- **Streaming API** - Handle large datasets efficiently

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
- [📖 API Reference](#-api-reference)
- [🎨 Examples](#-examples)
- [🔐 Security](#-security)
- [💰 Cost Analysis](#-cost-analysis)
- [⚡ Advanced Features](#-advanced-features)
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
  options: {
    timestamps: true,    // Automatic createdAt/updatedAt
    behavior: "user-management", // How to handle large documents
    partitions: {        // Organize data for efficient queries
      byRegion: { fields: { region: "string" } }
    }
  }
});
```

### 🔍 Schema Validation
Built-in validation using [fastest-validator](https://github.com/icebob/fastest-validator):

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

### 📊 Query Operations

| Method | Description | Example |
|--------|-------------|---------|
| `list(options?)` | List documents | `await users.list()` |
| `listIds(options?)` | List document IDs | `await users.listIds()` |
| `count(options?)` | Count documents | `await users.count()` |
| `page(options)` | Paginate results | `await users.page({offset: 0, size: 10})` |
| `query(filter, options?)` | Filter documents | `await users.query({isActive: true})` |

### 🚀 Bulk Operations

| Method | Description | Example |
|--------|-------------|---------|
| `insertMany(docs)` | Insert multiple | `await users.insertMany([{...}, {...}])` |
| `getMany(ids)` | Get multiple | `await users.getMany(["id1", "id2"])` |
| `deleteMany(ids)` | Delete multiple | `await users.deleteMany(["id1", "id2"])` |
| `getAll()` | Get all documents | `await users.getAll()` |
| `deleteAll()` | Delete all documents | `await users.deleteAll()` |

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
  options: {
    behavior: "body-overflow", // Handle long content
    timestamps: true,
    partitions: {
      byAuthor: { fields: { author: "string" } },
      byTag: { fields: { "tags.0": "string" } }
    }
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
  options: {
    behavior: "body-overflow",
    timestamps: true,
    partitions: {
      byCategory: { fields: { category: "string" } }
    }
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
  options: {
    behavior: "enforce-limits",
    timestamps: true
  }
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
  options: {
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

## ⚡ Advanced Features

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
  options: {
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
  options: {
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
    }
  }
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
  options: {
    behavior: "body-overflow" // Handles large content automatically
  }
});

// Strict validation - throws error if limit exceeded
const settings = await s3db.createResource({
  name: "settings",
  attributes: {
    key: "string",
    value: "string"
  },
  options: {  
    behavior: "enforce-limits" // Ensures data stays within 2KB
  }
});

// Smart truncation - preserves structure, truncates content
const summaries = await s3db.createResource({
  name: "summaries",
  attributes: {
    title: "string",
    description: "string"
  },
  options: {
    behavior: "data-truncate" // Truncates to fit within limits
  }
});
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
  <sub>Built with Node.js • Powered by AWS S3 • TypeScript Ready</sub>
</p>
