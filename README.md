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

#### List, ListIds, Count, Page, Query (Novo Formato)

Todos os métodos de listagem, paginação e contagem agora recebem um único objeto de parâmetros:

```js
// Listar todos os usuários
const allUsers = await users.list();

// Listar usuários de uma partição
const googleUsers = await users.list({
  partition: 'byUtmSource',
  partitionValues: { 'utm.source': 'google' }
});

// Listar IDs de uma partição
const googleUserIds = await users.listIds({
  partition: 'byUtmSource',
  partitionValues: { 'utm.source': 'google' }
});

// Paginar resultados com contagem total
const page = await users.page({
  partition: 'byUtmSource',
  partitionValues: { 'utm.source': 'google' },
  offset: 0,
  size: 10
});
console.log(page.items); // Array de usuários
console.log(page.totalItems, page.totalPages); // Contagem total e páginas
console.log(page.page, page.pageSize); // Página atual e tamanho

// Paginar resultados sem contagem total (mais rápido para grandes coleções)
const fastPage = await users.page({
  partition: 'byUtmSource',
  partitionValues: { 'utm.source': 'google' },
  offset: 0,
  size: 10,
  skipCount: true // Pula a contagem total para melhor performance
});
console.log(fastPage.items); // Array de usuários
console.log(fastPage.totalItems); // null (não contado)
console.log(fastPage._debug); // Informações de debug

// Contar documentos em uma partição
const count = await users.count({
  partition: 'byUtmSource',
  partitionValues: { 'utm.source': 'google' }
});

// Query com filtro e paginação
const filtered = await users.query(
  { isActive: true },
  { partition: 'byUtmSource', partitionValues: { 'utm.source': 'google' }, limit: 5, offset: 0 }
);
```

#### Partições com Campos Aninhados

Você pode usar dot notation para acessar campos aninhados em partições:

```js
const users = await s3db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    utm: { source: 'string|required', medium: 'string|required' },
    address: { country: 'string|required', city: 'string|required' }
  },
  options: {
    partitions: {
      byUtmSource: { fields: { 'utm.source': 'string' } },
      byCountry: { fields: { 'address.country': 'string' } }
    }
  }
});

// Listar por campo aninhado
const usUsers = await users.list({
  partition: 'byCountry',
  partitionValues: { 'address.country': 'US' }
});
```

#### getPartitionKey e getFromPartition

```js
// Gerar chave de partição
const key = users.getPartitionKey({
  partitionName: 'byUtmSource',
  id: 'user-123',
  data: { utm: { source: 'google' } }
});

// Buscar diretamente de uma partição
const user = await users.getFromPartition({
  id: 'user-123',
  partitionName: 'byUtmSource',
  partitionValues: { 'utm.source': 'google' }
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

#### Resource Behaviors

`s3db.js` provides a powerful behavior system to handle how your data is managed when it approaches or exceeds S3's 2KB metadata limit. Each behavior implements different strategies for handling large documents.

##### Available Behaviors

| Behavior | Description | Use Case |
|----------|-------------|----------|
| `user-management` | **Default** - Emits warnings but allows operations | Development and testing |
| `enforce-limits` | Throws errors when limit is exceeded | Strict data size control |
| `data-truncate` | Truncates data to fit within limits | Preserve structure, lose data |
| `body-overflow` | Stores excess data in S3 object body | Preserve all data |

##### Behavior Configuration

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string|min:2|max:100",
    email: "email|unique",
    bio: "string|optional",
    preferences: "object|optional"
  },
  options: {
    behavior: "body-overflow",  // Choose behavior strategy
    timestamps: true,           // Enable automatic timestamps
    partitions: {               // Define data partitions
      byRegion: {
        fields: { region: "string" }
      }
    },
    hooks: {                    // Custom operation hooks
      preInsert: [async (data) => {
        // Custom validation logic
        return data;
      }],
      afterInsert: [async (data) => {
        console.log("User created:", data.id);
      }]
    }
  }
});
```

##### 1. User Management Behavior (Default)

The default behavior that gives you full control over data size management:

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string", email: "email" },
  options: { behavior: "user-management" }
});

// Listen for limit warnings
users.on("exceedsLimit", (info) => {
  console.log(`Document ${info.operation} exceeds 2KB limit:`, {
    totalSize: info.totalSize,
    limit: info.limit,
    excess: info.excess
  });
});

// Operations continue normally even if limit is exceeded
const user = await users.insert({
  name: "John Doe",
  email: "john@example.com",
  largeBio: "Very long bio...".repeat(100) // Will trigger warning but succeed
});
```

##### 2. Enforce Limits Behavior

Strict behavior that prevents operations when data exceeds the limit:

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string", email: "email" },
  options: { behavior: "enforce-limits" }
});

try {
  const user = await users.insert({
    name: "John Doe",
    email: "john@example.com",
    largeBio: "Very long bio...".repeat(100)
  });
} catch (error) {
  console.error("Operation failed:", error.message);
  // Error: S3 metadata size exceeds 2KB limit. Current size: 2500 bytes, limit: 2000 bytes
}
```

##### 3. Data Truncate Behavior

Intelligently truncates data to fit within limits while preserving structure:

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string", email: "email", bio: "string" },
  options: { behavior: "data-truncate" }
});

const user = await users.insert({
  name: "John Doe",
  email: "john@example.com",
  bio: "This is a very long biography that will be truncated to fit within the 2KB metadata limit..."
});

console.log(user.bio); // "This is a very long biography that will be truncated to fit within the 2KB metadata limit..."
// Note: The bio will be truncated with "..." suffix if it exceeds available space
```

##### 4. Body Overflow Behavior

Stores excess data in the S3 object body, preserving all information:

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: { name: "string", email: "email", bio: "string" },
  options: { behavior: "body-overflow" }
});

const user = await users.insert({
  name: "John Doe",
  email: "john@example.com",
  bio: "This is a very long biography that will be stored in the S3 object body..."
});

// All data is preserved and automatically merged when retrieved
console.log(user.bio); // Full biography preserved
```

**How Body Overflow Works:**
- Small attributes stay in metadata for fast access
- Large attributes are moved to S3 object body
- Data is automatically merged when retrieved
- Maintains full data integrity

##### Complete Resource Configuration Reference

```javascript
const resource = await s3db.createResource({
  // Required: Resource name (unique within database)
  name: "users",
  
  // Required: Schema definition
  attributes: {
    // Basic types
    name: "string|min:2|max:100",
    email: "email|unique",
    age: "number|integer|positive",
    isActive: "boolean",
    
    // Advanced types
    website: "url",
    uuid: "uuid",
    createdAt: "date",
    price: "currency|symbol:$",
    
    // Encrypted fields
    password: "secret",
    apiKey: "secret",
    
    // Nested objects
    address: {
      street: "string",
      city: "string",
      country: "string",
      zipCode: "string|optional"
    },
    
    // Complex nested structures
    profile: {
      bio: "string|max:500|optional",
      avatar: "url|optional",
      birthDate: "date|optional",
      preferences: {
        theme: "string|enum:light,dark|default:light",
        language: "string|enum:en,es,fr|default:en",
        notifications: "boolean|default:true"
      }
    },
    
    // Nested objects with validation
    contact: {
      phone: {
        mobile: "string|pattern:^\\+?[1-9]\\d{1,14}$|optional",
        work: "string|pattern:^\\+?[1-9]\\d{1,14}$|optional"
      },
      social: {
        twitter: "string|optional",
        linkedin: "url|optional",
        github: "url|optional"
      }
    },
    
    // Arrays
    tags: "array|items:string|unique",
    scores: "array|items:number|min:1",
    
    // Multiple types
    id: ["string", "number"],
    
    // Complex nested structures
    metadata: {
      settings: "object|optional",
      preferences: "object|optional"
    },
    
    // Analytics and tracking
    analytics: {
      utm: {
        source: "string|optional",
        medium: "string|optional",
        campaign: "string|optional",
        term: "string|optional",
        content: "string|optional"
      },
      events: "array|items:object|optional",
      lastVisit: "date|optional"
    }
  },
  
  // Optional: Resource configuration
  options: {
    // Behavior strategy for handling 2KB metadata limits
    behavior: "user-management", // "user-management" | "enforce-limits" | "data-truncate" | "body-overflow"
    
    // Enable automatic timestamps
    timestamps: true, // Adds createdAt and updatedAt fields
    
    // Define data partitions for efficient querying
    partitions: {
      byRegion: {
        fields: { region: "string" }
      },
      byAgeGroup: {
        fields: { ageGroup: "string" }
      },
      byDate: {
        fields: { createdAt: "date|maxlength:10" }
      }
    },
    
    // Custom operation hooks
    hooks: {
      // Pre-operation hooks (can modify data)
      preInsert: [
        async (data) => {
          // Validate or transform data before insert
          if (!data.email.includes("@")) {
            throw new Error("Invalid email format");
          }
          return data;
        }
      ],
      preUpdate: [
        async (id, data) => {
          // Validate or transform data before update
          return data;
        }
      ],
      preDelete: [
        async (id) => {
          // Validate before deletion
          return true; // Return false to abort
        }
      ],
      
      // Post-operation hooks (cannot modify data)
      afterInsert: [
        async (data) => {
          console.log("User created:", data.id);
        }
      ],
      afterUpdate: [
        async (id, data) => {
          console.log("User updated:", id);
        }
      ],
      afterDelete: [
        async (id) => {
          console.log("User deleted:", id);
        }
      ]
    }
  }
});
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

#### Nested Object Validation

Nested objects support comprehensive validation rules at each level:

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string|min:2|max:100",
    email: "email|unique",
    
    // Simple nested object
    profile: {
      bio: "string|max:500|optional",
      avatar: "url|optional",
      birthDate: "date|optional"
    },
    
    // Complex nested structure with validation
    contact: {
      phone: {
        mobile: "string|pattern:^\\+?[1-9]\\d{1,14}$|optional",
        work: "string|pattern:^\\+?[1-9]\\d{1,14}$|optional"
      },
      social: {
        twitter: "string|optional",
        linkedin: "url|optional"
      }
    },
    
    // Nested object with arrays
    preferences: {
      categories: "array|items:string|unique|optional",
      notifications: {
        email: "boolean|default:true",
        sms: "boolean|default:false",
        push: "boolean|default:true"
      }
    },
    
    // Deep nesting with validation
    analytics: {
      tracking: {
        utm: {
          source: "string|optional",
          medium: "string|optional",
          campaign: "string|optional"
        },
        events: "array|items:object|optional"
      }
    }
  }
});

// Insert data with complex nested structure
const user = await users.insert({
  name: "John Doe",
  email: "john@example.com",
  profile: {
    bio: "Software developer with 10+ years of experience",
    avatar: "https://example.com/avatar.jpg",
    birthDate: new Date("1990-01-15")
  },
  contact: {
    phone: {
      mobile: "+1234567890",
      work: "+1987654321"
    },
    social: {
      twitter: "@johndoe",
      linkedin: "https://linkedin.com/in/johndoe"
    }
  },
  preferences: {
    categories: ["technology", "programming", "web-development"],
    notifications: {
      email: true,
      sms: false,
      push: true
    }
  },
  analytics: {
    tracking: {
      utm: {
        source: "google",
        medium: "organic",
        campaign: "brand"
      },
      events: [
        { type: "page_view", timestamp: new Date() },
        { type: "signup", timestamp: new Date() }
      ]
    }
  }
});
```

#### Enhanced Array and Object Handling

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

#### Check Resource Existence

```javascript
// Check if a resource exists by name
const exists = s3db.resourceExists("users");
console.log(exists); // true or false
```

#### Create Resource If Not Exists

```javascript
// Create a resource only if it doesn't exist with the same definition hash
const result = await s3db.createResourceIfNotExists({
  name: "users",
  attributes: {
    name: "string|required",
    email: "email|required"
  },
  options: { timestamps: true },
  behavior: "user-management"
});

console.log(result);
// {
//   resource: Resource,
//   created: true, // or false if already existed
//   reason: "New resource created" // or "Resource already exists with same definition hash"
// }

// If the resource already exists with the same hash, it returns the existing resource
const result2 = await s3db.createResourceIfNotExists({
  name: "users",
  attributes: {
    name: "string|required",
    email: "email|required"
  }
});

console.log(result2.created); // false
console.log(result2.reason); // "Resource already exists with same definition hash"
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

#### Page Documents

The `page()` method provides efficient pagination with optional total count for performance optimization.

```javascript
// Basic pagination with total count
const page = await users.page({
  offset: 0,
  size: 10
});

console.log(page.items); // Array of user objects
console.log(page.totalItems); // Total number of items
console.log(page.totalPages); // Total number of pages
console.log(page.page); // Current page number (0-based)
console.log(page.pageSize); // Items per page
console.log(page._debug); // Debug information

// Pagination with partition filtering
const googleUsersPage = await users.page({
  partition: 'byUtmSource',
  partitionValues: { 'utm.source': 'google' },
  offset: 0,
  size: 5
});

// Skip total count for better performance on large collections
const fastPage = await users.page({
  offset: 0,
  size: 100,
  skipCount: true // Skips counting total items
});

console.log(fastPage.totalItems); // null (not counted)
console.log(fastPage.totalPages); // null (not calculated)
console.log(fastPage._debug.skipCount); // true
```

**Page Response Structure:**

```javascript
{
  items: Array,           // Array of document objects
  totalItems: number,     // Total count (null if skipCount: true)
  page: number,           // Current page number (0-based)
  pageSize: number,       // Number of items per page
  totalPages: number,     // Total pages (null if skipCount: true)
  _debug: {               // Debug information
    requestedSize: number,
    requestedOffset: number,
    actualItemsReturned: number,
    skipCount: boolean,
    hasTotalItems: boolean
  }
}
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `offset` | `number` | `0` | Number of items to skip |
| `size` | `number` | `100` | Number of items per page |
| `partition` | `string` | `null` | Partition name to filter by |
| `partitionValues` | `object` | `{}` | Partition field values |
| `skipCount` | `boolean` | `false` | Skip total count for performance |

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
// Create product resource with body-overflow behavior for long descriptions
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
  },
  options: {
    behavior: "body-overflow",  // Handle long product descriptions
    timestamps: true            // Track creation and update times
  }
});

// Create order resource with enforce-limits for strict data control
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
  },
  options: {
    behavior: "enforce-limits",  // Strict validation for order data
    timestamps: true
  }
});

// Insert products (long descriptions will be handled by body-overflow)
const product = await products.insert({
  name: "Wireless Headphones",
  description: "High-quality wireless headphones with noise cancellation, 30-hour battery life, premium comfort design, and crystal-clear audio quality. Perfect for music lovers, professionals, and gamers alike. Features include Bluetooth 5.0, active noise cancellation, touch controls, and a premium carrying case.",
  price: 99.99,
  category: "electronics",
  tags: ["wireless", "bluetooth", "audio", "noise-cancellation"],
  inStock: true,
  images: ["https://example.com/headphones.jpg"]
});

// Create order (enforce-limits ensures data integrity)
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
// Create users resource with encrypted password and strict validation
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
  },
  options: {
    behavior: "enforce-limits",  // Strict validation for user data
    timestamps: true             // Track account creation and updates
  }
});

// Create sessions resource with body-overflow for session data
const sessions = await s3db.createResource({
  name: "sessions",
  attributes: {
    userId: "string",
    token: "secret",  // Encrypted session token
    expiresAt: "date",
    userAgent: "string|optional",
    ipAddress: "string|optional",
    sessionData: "object|optional"  // Additional session metadata
  },
  options: {
    behavior: "body-overflow",  // Handle large session data
    timestamps: true
  }
});

// Register user (enforce-limits ensures data integrity)
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

// Create session (body-overflow preserves all session data)
const session = await sessions.insert({
  userId: user.id,
  token: "jwt_token_here",
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  ipAddress: "192.168.1.1",
  sessionData: {
    preferences: { theme: "dark", language: "en" },
    lastActivity: new Date(),
    deviceInfo: { type: "desktop", os: "Windows" }
  }
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
    ageGroup: "string",
    createdAt: "date"
  },
  options: {
    partitions: {
      byRegion: {
        fields: { region: "string" }
      },
      byAgeGroup: {
        fields: { ageGroup: "string" }
      },
      byDate: {
        fields: { createdAt: "date|maxlength:10" }
      }
    }
  }
});
```

### Querying by partition

Partitions are automatically created when you insert documents, and you can query them using specific methods that accept partition parameters:

#### List IDs by partition

```js
// Get all user IDs in the 'south' region
const userIds = await users.listIds({ 
  partition: "byRegion", 
  partitionValues: { region: "south" } 
});

// Get all user IDs in the 'adult' age group
const adultIds = await users.listIds({ 
  partition: "byAgeGroup", 
  partitionValues: { ageGroup: "adult" } 
});
```

#### Count documents by partition

```js
// Count users in the 'south' region
const count = await users.count({ 
  partition: "byRegion", 
  partitionValues: { region: "south" } 
});

// Count adult users
const adultCount = await users.count({ 
  partition: "byAgeGroup", 
  partitionValues: { ageGroup: "adult" } 
});
```

#### List objects by partition

```js
// Get all users in the 'south' region
const usersSouth = await users.listByPartition({ 
  partition: "byRegion", 
  partitionValues: { region: "south" } 
});

// Get all adult users with pagination
const adultUsers = await users.listByPartition(
  { partition: "byAgeGroup", partitionValues: { ageGroup: "adult" } },
  { limit: 10, offset: 0 }
);
```

#### Page through partition data

```js
// Get first page of users in 'south' region
const page = await users.page(0, 10, { 
  partition: "byRegion", 
  partitionValues: { region: "south" } 
});

console.log(page.items); // Array of user objects
console.log(page.totalItems); // Total count in this partition
console.log(page.totalPages); // Total pages available
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

// Insert logs (partitions are created automatically)
await logs.insert({
  message: "User login",
  level: "info",
  createdAt: new Date("2024-06-27")
});

// Query logs for a specific day
const logsToday = await logs.listByPartition({ 
  partition: "byDate", 
  partitionValues: { createdAt: "2024-06-27" } 
});

// Count logs for a specific day
const count = await logs.count({ 
  partition: "byDate", 
  partitionValues: { createdAt: "2024-06-27" } 
});
```

### Partitions with Nested Fields

`s3db.js` supports partitions using nested object fields using dot notation, just like the schema mapper:

```js
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string|required",
    utm: {
      source: "string|required",
      medium: "string|required",
      campaign: "string|required"
    },
    address: {
      country: "string|required",
      state: "string|required",
      city: "string|required"
    },
    metadata: {
      category: "string|required",
      priority: "string|required"
    }
  },
  options: {
    partitions: {
      byUtmSource: {
        fields: {
          "utm.source": "string"
        }
      },
      byAddressCountry: {
        fields: {
          "address.country": "string|maxlength:2"
        }
      },
      byAddressState: {
        fields: {
          "address.country": "string|maxlength:2",
          "address.state": "string"
        }
      },
      byUtmAndAddress: {
        fields: {
          "utm.source": "string",
          "utm.medium": "string",
          "address.country": "string|maxlength:2"
        }
      }
    }
  }
});

// Insert user with nested data
await users.insert({
  name: "John Doe",
  utm: {
    source: "google",
    medium: "cpc",
    campaign: "brand"
  },
  address: {
    country: "US",
    state: "California",
    city: "San Francisco"
  },
  metadata: {
    category: "premium",
    priority: "high"
  }
});

// Query by nested UTM source
const googleUsers = await users.listIds({
  partition: "byUtmSource",
  partitionValues: { "utm.source": "google" }
});

// Query by nested address country
const usUsers = await users.listIds({
  partition: "byAddressCountry",
  partitionValues: { "address.country": "US" }
});

// Query by multiple nested fields
const usCaliforniaUsers = await users.listIds({
  partition: "byAddressState",
  partitionValues: { 
    "address.country": "US", 
    "address.state": "California" 
  }
});

// Complex query with UTM and address
const googleCpcUsUsers = await users.listIds({
  partition: "byUtmAndAddress",
  partitionValues: { 
    "utm.source": "google", 
    "utm.medium": "cpc", 
    "address.country": "US" 
  }
});

// Count and list operations work the same way
const googleCount = await users.count({
  partition: "byUtmSource",
  partitionValues: { "utm.source": "google" }
});

const googleUsersData = await users.listByPartition({
  partition: "byUtmSource",
  partitionValues: { "utm.source": "google" }
});
```

**Key features of nested field partitions:**

- **Dot notation**: Use `"parent.child"` to access nested fields
- **Multiple levels**: Support for deeply nested objects like `"address.country.state"`
- **Mixed partitions**: Combine nested and flat fields in the same partition
- **Rules support**: Apply maxlength, date formatting, etc. to nested fields
- **Automatic flattening**: Uses the same flattening logic as the schema mapper

### Partition rules and transformations

Partitions support various field rules that automatically transform values:

```js
const products = await s3db.createResource({
  name: "products",
  attributes: {
    name: "string",
    category: "string",
    price: "number",
    createdAt: "date"
  },
  options: {
    partitions: {
      byCategory: {
        fields: { category: "string" }
      },
      byDate: {
        fields: { createdAt: "date|maxlength:10" } // Truncates to YYYY-MM-DD
      }
    }
  }
});

// Date values are automatically formatted
await products.insert({
  name: "Widget",
  category: "electronics",
  price: 99.99,
  createdAt: new Date("2024-06-27T15:30:00Z") // Will be stored as "2024-06-27"
});
```

### Important notes about partitions

1. **Automatic creation**: Partitions are automatically created when you insert documents
2. **Performance**: Partition queries are more efficient than filtering all documents
3. **Storage**: Each partition creates additional S3 objects, increasing storage costs
4. **Consistency**: Partition data is automatically kept in sync with main resource data
5. **Field requirements**: All partition fields must exist in your resource attributes

### Available partition-aware methods

| Method | Description | Partition Support |
|--------|-------------|-------------------|
| `listIds()` | Get array of document IDs | ✅ `{ partition, partitionValues }` |
| `count()` | Count documents | ✅ `{ partition, partitionValues }` |
| `listByPartition()` | List documents by partition | ✅ `{ partition, partitionValues }` |
| `page()` | Paginate documents | ✅ `{ partition, partitionValues, skipCount }` |
| `getFromPartition()` | Get single document from partition | ✅ Direct partition access |
| `query()` | Filter documents in memory | ❌ No partition support |

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

## 🚨 Limitations & Best Practices

### Limitations

1. **Document Size**: Maximum ~2KB per document (metadata only) - **💡 Use behaviors to handle larger documents**
2. **No Complex Queries**: No SQL-like WHERE clauses or joins
3. **No Indexes**: No automatic indexing for fast lookups
4. **Sequential IDs**: Best performance with sequential IDs (00001, 00002, etc.)
5. **No Transactions**: No ACID transactions across multiple operations
6. **S3 Pagination**: S3 lists objects in pages of 1000 items maximum, and these operations are not parallelizable, which can make listing large datasets slow

**💡 Overcoming the 2KB Limit**: Use resource behaviors to handle documents that exceed the 2KB metadata limit:
- **`body-overflow`**: Stores excess data in S3 object body (preserves all data)
- **`data-truncate`**: Intelligently truncates data to fit within limits
- **`enforce-limits`**: Strict validation to prevent oversized documents
- **`user-management`**: Default behavior with warnings and monitoring

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

#### 6. Choose the Right Behavior Strategy

```javascript
// ✅ For development and testing - allows flexibility
const devUsers = await s3db.createResource({
  name: "users",
  attributes: { name: "string", email: "email" },
  options: { behavior: "user-management" }
});

// ✅ For production with strict data control
const prodUsers = await s3db.createResource({
  name: "users",
  attributes: { name: "string", email: "email" },
  options: { behavior: "enforce-limits" }
});

// ✅ For preserving all data with larger documents
const blogPosts = await s3db.createResource({
  name: "posts",
  attributes: { title: "string", content: "string", author: "string" },
  options: { behavior: "body-overflow" }
});

// ✅ For structured data where truncation is acceptable
const productDescriptions = await s3db.createResource({
  name: "products",
  attributes: { name: "string", description: "string", price: "number" },
  options: { behavior: "data-truncate" }
});
```

**Behavior Selection Guide:**
- **`user-management`**: Development, testing, or when you want full control
- **`enforce-limits`**: Production systems requiring strict data validation
- **`body-overflow`**: When data integrity is critical and you need to preserve all information
- **`data-truncate`**: When you can afford to lose some data but want to maintain structure

### Performance Tips

1. **Enable Caching**: Use `cache: true` for frequently accessed data
2. **Adjust Parallelism**: Increase `parallelism`