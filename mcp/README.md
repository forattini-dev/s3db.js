# 🗃️ S3DB MCP Server

<p align="center">
  <img width="200" src="https://img.icons8.com/fluency/200/database.png" alt="S3DB MCP Server">
</p>

<p align="center">
  <strong>Model Context Protocol (MCP) server for S3DB</strong><br>
  <em>Transform AWS S3 into a powerful document database accessible by AI agents</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/s3db-mcp-server"><img src="https://img.shields.io/npm/v/s3db-mcp-server.svg?style=flat&color=brightgreen" alt="npm version"></a>
  &nbsp;
  <a href="https://github.com/forattini-dev/s3db.js"><img src="https://img.shields.io/github/stars/forattini-dev/s3db.js?style=flat&color=yellow" alt="GitHub stars"></a>
  &nbsp;
  <a href="https://github.com/forattini-dev/s3db.js/blob/main/UNLICENSE"><img src="https://img.shields.io/badge/license-Unlicense-blue.svg?style=flat" alt="License"></a>
</p>

---

## 🚀 Quick Start (5 minutes)

### 1. Instant Start with NPX
```bash
# Start immediately (no installation required)
npx s3db-mcp-server --transport=sse

# Server running at: http://localhost:17500/sse
```

### 2. Configure Your AI Client

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "s3db": {
      "transport": "sse",
      "url": "http://localhost:17500/sse"
    }
  }
}
```

**Cursor IDE**:
```json
{
  "mcpServers": {
    "s3db": {
      "url": "http://localhost:17500/sse"
    }
  }
}
```

### 3. Test with Your AI Agent
Your agent can now use these commands:
```javascript
// Connect to S3DB
dbConnect({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET/databases/myapp"
})

// Create a collection
dbCreateResource({
  name: "users",
  attributes: { name: "string|required", email: "email|unique" }
})

// Insert data
resourceInsert({
  resourceName: "users", 
  data: { name: "John", email: "john@example.com" }
})
```

---

## 📋 Table of Contents

- [🚀 Quick Start](#-quick-start-5-minutes)
- [💾 Installation](#-installation)
- [⚙️ Configuration](#️-configuration)
- [🛠️ Available Tools](#️-available-tools)
- [📖 Usage Examples](#-usage-examples)
- [🗂️ Partitions & Performance](#️-partitions--performance)
- [🐳 Docker Deployment](#-docker-deployment)
- [🤖 AI Agent Integration](#-ai-agent-integration)
- [🔒 Security](#-security)
- [🚨 Troubleshooting](#-troubleshooting)

---

## 💾 Installation

### Option 1: NPX (Recommended)
```bash
# SSE transport (web clients) - Default port: 17500
npx s3db-mcp-server --transport=sse

# STDIO transport (desktop clients)
npx s3db-mcp-server --transport=stdio
```

### Option 2: Global Installation
```bash
npm install -g s3db-mcp-server
s3db-mcp --transport=sse
```

### Option 3: Docker
```bash
docker run -p 17500:8000 -e S3DB_CONNECTION_STRING="s3://key:secret@bucket/db" s3db-mcp-server
```

---

## ⚙️ Configuration

### 📝 Configuration Overview

The S3DB MCP Server can be configured through multiple methods (in order of precedence):
1. **Command-line arguments** (highest priority)
2. **Environment variables** 
3. **`.env` file**
4. **Default values** (lowest priority)

### 🌐 Server Configuration

#### **Core Server Settings**

| Variable | Default | Description | Example | Notes |
|----------|---------|-------------|---------|-------|
| `NODE_ENV` | `development` | Environment mode | `production`, `development`, `test` | Affects logging verbosity and error details |
| `MCP_SERVER_HOST` | `0.0.0.0` | Server bind address | `localhost`, `127.0.0.1`, `0.0.0.0` | Use `0.0.0.0` to accept connections from any interface |
| `MCP_SERVER_PORT` | `17500` | Server port | Any port 1024-65535 | Changed from 8000 to avoid conflicts |
| `MCP_TRANSPORT` | `sse` | Transport method | `sse`, `stdio` | SSE for web clients, stdio for CLI tools |

#### **Transport Modes Explained**

- **SSE (Server-Sent Events)**: 
  - Best for: Web-based AI clients, Claude Desktop, Cursor IDE
  - Protocol: HTTP/HTTPS
  - URL format: `http://localhost:17500/sse`
  
- **STDIO (Standard Input/Output)**:
  - Best for: CLI tools, shell scripts, pipe-based communication
  - Protocol: JSON-RPC over stdin/stdout
  - No network port required

### 🗄️ S3DB Core Configuration

#### **Essential Database Settings**

| Variable | Default | Required | Description | Example Values |
|----------|---------|----------|-------------|----------------|
| `S3DB_CONNECTION_STRING` | - | ✅ Yes | Complete S3 connection URL | See [Connection String Formats](#connection-string-formats) below |
| `S3DB_VERBOSE` | `false` | No | Enable detailed operation logs | `true` for debugging, `false` for production |
| `S3DB_PARALLELISM` | `10` | No | Max concurrent S3 operations | `5` (conservative), `20` (aggressive), `50` (high-performance) |
| `S3DB_PASSPHRASE` | `secret` | No | Encryption key for sensitive fields | Any strong passphrase (min 12 chars recommended) |
| `S3DB_VERSIONING_ENABLED` | `false` | No | Track resource schema versions | `true` for production, `false` for development |

#### **Performance Tuning Guidelines**

```bash
# Development (fast iteration, verbose logging)
S3DB_VERBOSE=true
S3DB_PARALLELISM=5
S3DB_VERSIONING_ENABLED=false

# Staging (balanced performance)
S3DB_VERBOSE=false
S3DB_PARALLELISM=10
S3DB_VERSIONING_ENABLED=true

# Production (optimized for scale)
S3DB_VERBOSE=false
S3DB_PARALLELISM=20
S3DB_VERSIONING_ENABLED=true
```

### 🔌 Plugin Configuration

#### **Cache Plugin Settings**

| Variable | Default | Description | When to Change | Impact |
|----------|---------|-------------|----------------|--------|
| `S3DB_CACHE_ENABLED` | `true` | Master cache toggle | Set `false` only for debugging | 70-90% performance improvement when enabled |
| `S3DB_CACHE_DRIVER` | `memory` | Cache storage backend | Use `filesystem` for persistent cache | Memory: faster, Filesystem: survives restarts |
| `S3DB_CACHE_MAX_SIZE` | `1000` | Max cached items (memory only) | Increase for read-heavy workloads | Each item ~1-10KB RAM |
| `S3DB_CACHE_TTL` | `300000` | Cache lifetime (ms) | Decrease for frequently changing data | 5 min default, 0 = no expiry |
| `S3DB_CACHE_DIRECTORY` | `./cache` | Filesystem cache location | Use SSD path for best performance | Only for filesystem driver |
| `S3DB_CACHE_PREFIX` | `s3db` | Cache file prefix | Change for multiple instances | Prevents cache conflicts |

#### **Cache Strategy Examples**

```bash
# High-traffic read-heavy API
S3DB_CACHE_DRIVER=memory
S3DB_CACHE_MAX_SIZE=5000
S3DB_CACHE_TTL=600000  # 10 minutes

# Data analytics workload
S3DB_CACHE_DRIVER=filesystem
S3DB_CACHE_DIRECTORY=/mnt/ssd/cache
S3DB_CACHE_TTL=3600000  # 1 hour

# Real-time application
S3DB_CACHE_DRIVER=memory
S3DB_CACHE_MAX_SIZE=500
S3DB_CACHE_TTL=30000  # 30 seconds
```

#### **Cost Tracking Plugin**

| Variable | Default | Description | Use Case |
|----------|---------|-------------|----------|
| `S3DB_COSTS_ENABLED` | `true` | Track S3 API costs | Disable for local MinIO/testing |

Cost tracking provides:
- Per-operation cost breakdown
- Daily/monthly projections
- Request type statistics
- Data transfer metrics

### 🔐 AWS & S3-Compatible Configuration

#### **AWS Credentials**

| Variable | Default | Description | Priority Order |
|----------|---------|-------------|----------------|
| `AWS_ACCESS_KEY_ID` | - | AWS access key | 1. Env var, 2. IAM role, 3. Connection string |
| `AWS_SECRET_ACCESS_KEY` | - | AWS secret key | Required if using access key |
| `AWS_SESSION_TOKEN` | - | Temporary credentials | For STS/assumed roles |
| `AWS_REGION` | `us-east-1` | AWS region | Must match bucket region |

#### **S3-Compatible Services**

| Variable | Default | Description | Services |
|----------|---------|-------------|----------|
| `S3_ENDPOINT` | - | Custom S3 API endpoint | MinIO, DigitalOcean, Backblaze, Wasabi |
| `S3_FORCE_PATH_STYLE` | `false` | URL style | Required for MinIO, LocalStack |

### 🔗 Connection String Formats

#### **Anatomy of a Connection String**

```
s3://[ACCESS_KEY:SECRET_KEY@]BUCKET[/PATH][?PARAMS]
```

Components:
- `ACCESS_KEY:SECRET_KEY` - Optional inline credentials
- `BUCKET` - S3 bucket name
- `PATH` - Optional path prefix for organization
- `PARAMS` - Query parameters for advanced config

#### **Real-World Examples**

```bash
# AWS S3 - Production with IAM role (recommended)
S3DB_CONNECTION_STRING="s3://my-prod-bucket/databases/main"

# AWS S3 - Development with credentials
S3DB_CONNECTION_STRING="s3://AKIA...:wJal...@my-dev-bucket/databases/dev"

# MinIO - Local development
S3DB_CONNECTION_STRING="s3://minioadmin:minioadmin123@localhost:17998/s3db?forcePathStyle=true"

# DigitalOcean Spaces
S3DB_CONNECTION_STRING="s3://DO_KEY:DO_SECRET@nyc3.digitaloceanspaces.com/space-name/databases/prod"

# Backblaze B2
S3DB_CONNECTION_STRING="s3://KEY_ID:APP_KEY@s3.us-west-002.backblazeb2.com/bucket-name/db"

# Wasabi
S3DB_CONNECTION_STRING="s3://ACCESS_KEY:SECRET_KEY@s3.wasabisys.com/bucket-name/databases/app"

# LocalStack (testing)
S3DB_CONNECTION_STRING="s3://test:test@localhost:4566/test-bucket/db?forcePathStyle=true"
```

### 📁 Complete Configuration Examples

#### **Development Setup (.env)**

```bash
# Server
NODE_ENV=development
MCP_SERVER_PORT=17500
MCP_TRANSPORT=sse

# S3DB
S3DB_CONNECTION_STRING=s3://minioadmin:minioadmin123@localhost:9000/dev-bucket/db
S3DB_VERBOSE=true
S3DB_PARALLELISM=5

# Cache
S3DB_CACHE_ENABLED=true
S3DB_CACHE_DRIVER=memory
S3DB_CACHE_MAX_SIZE=100
S3DB_CACHE_TTL=60000

# Costs
S3DB_COSTS_ENABLED=false
```

#### **Production Setup (.env)**

```bash
# Server
NODE_ENV=production
MCP_SERVER_PORT=17500
MCP_TRANSPORT=sse

# S3DB (using IAM role)
S3DB_CONNECTION_STRING=s3://prod-data-bucket/databases/main
S3DB_VERBOSE=false
S3DB_PARALLELISM=20
S3DB_PASSPHRASE=${SECRET_PASSPHRASE}
S3DB_VERSIONING_ENABLED=true

# Cache
S3DB_CACHE_ENABLED=true
S3DB_CACHE_DRIVER=filesystem
S3DB_CACHE_DIRECTORY=/var/cache/s3db
S3DB_CACHE_TTL=1800000
S3DB_CACHE_PREFIX=prod

# Costs
S3DB_COSTS_ENABLED=true

# AWS
AWS_REGION=us-east-1
```

### 🚀 Command Line Options

```bash
# Basic usage
npx s3db-mcp-server [OPTIONS]

# Transport selection
npx s3db-mcp-server --transport=sse      # Web clients (default)
npx s3db-mcp-server --transport=stdio    # CLI/pipe communication

# Network configuration
npx s3db-mcp-server --host=0.0.0.0 --port=17500

# Override environment variables
npx s3db-mcp-server --transport=sse \
  --host=127.0.0.1 \
  --port=18000

# Combined with environment variables
S3DB_CONNECTION_STRING="s3://..." \
S3DB_CACHE_DRIVER=filesystem \
npx s3db-mcp-server --transport=sse

# Debug mode with verbose output
S3DB_VERBOSE=true \
NODE_ENV=development \
npx s3db-mcp-server --transport=stdio
```

### 🔍 Configuration Validation

The server validates configuration on startup and will:
1. Check for required `S3DB_CONNECTION_STRING`
2. Test S3 connectivity
3. Verify bucket permissions
4. Initialize cache directory (if using filesystem)
5. Report configuration summary

Example startup log:
```
S3DB MCP Server v1.0.0 started
Transport: sse
Port: 17500
Cache: memory (1000 items, 5 min TTL)
Costs tracking: enabled
Connected to: s3://my-bucket/databases/main
Ready for connections...
```

---

## 🛠️ Available Tools

### Database Management

| Tool | Description | Parameters |
|------|-------------|------------|
| `dbConnect` | Connect to S3DB database with costs & cache | `connectionString`, `verbose?`, `parallelism?`, `passphrase?`, `versioningEnabled?`, `enableCache?`, `enableCosts?`, `cacheDriver?`, `cacheMaxSize?`, `cacheTtl?`, `cacheDirectory?`, `cachePrefix?` |
| `dbDisconnect` | Disconnect from database | - |
| `dbStatus` | Get connection status | - |
| `dbCreateResource` | Create resource/collection | `name`, `attributes`, `behavior?`, `timestamps?`, `partitions?`, `paranoid?` |
| `dbListResources` | List all resources | - |
| `dbGetStats` | Get database statistics (costs, cache, resources) | - |
| `dbClearCache` | Clear cache data | `resourceName?` (optional - clears all if not provided) |

### Document Operations

| Tool | Description | Parameters |
|------|-------------|------------|
| `resourceInsert` | Insert single document | `resourceName`, `data` |
| `resourceInsertMany` | Insert multiple documents | `resourceName`, `data[]` |
| `resourceGet` | Get document by ID | `resourceName`, `id` |
| `resourceGetMany` | Get multiple documents | `resourceName`, `ids[]` |
| `resourceUpdate` | Update document | `resourceName`, `id`, `data` |
| `resourceUpsert` | Insert or update | `resourceName`, `data` |
| `resourceDelete` | Delete document | `resourceName`, `id` |
| `resourceDeleteMany` | Delete multiple documents | `resourceName`, `ids[]` |

### Query Operations

| Tool | Description | Parameters |
|------|-------------|------------|
| `resourceExists` | Check if document exists | `resourceName`, `id` |
| `resourceList` | List with pagination | `resourceName`, `limit?`, `offset?`, `partition?`, `partitionValues?` |
| `resourceListIds` | List document IDs only | `resourceName`, `limit?`, `offset?` |
| `resourceCount` | Count documents | `resourceName`, `partition?`, `partitionValues?` |
| `resourceGetAll` | Get all documents | `resourceName` |
| `resourceDeleteAll` | Delete all documents | `resourceName`, `confirm: true` |

---

## 📖 Usage Examples

### Basic CRUD Operations

```javascript
// 1. Connect to database with automatic cache and costs tracking
await agent.callTool('dbConnect', {
  connectionString: 's3://ACCESS_KEY:SECRET_KEY@bucket/databases/blog',
  verbose: false,
  parallelism: 10,
  enableCache: true,        // Cache enabled by default
  enableCosts: true,        // Costs tracking enabled by default
  cacheDriver: 'memory',    // 'memory' or 'filesystem'
  cacheMaxSize: 1000,       // Cache up to 1000 items (memory only)
  cacheTtl: 300000,         // 5 minute cache TTL
  cacheDirectory: './cache', // Directory for filesystem cache
  cachePrefix: 's3db'       // Prefix for cache files
});

// 2. Create a resource with schema validation
await agent.callTool('dbCreateResource', {
  name: 'posts',
  attributes: {
    title: 'string|required|min:3|max:200',
    content: 'string|required',
    author: 'string|required',
    tags: 'array|items:string',
    published: 'boolean',
    publishDate: 'date',
    metadata: {
      views: 'number|positive',
      likes: 'number|positive'
    }
  },
  behavior: 'user-managed',
  timestamps: true,  // Adds createdAt/updatedAt automatically
  paranoid: true     // Soft deletes
});

// 3. Insert a blog post
const post = await agent.callTool('resourceInsert', {
  resourceName: 'posts',
  data: {
    title: 'Getting Started with S3DB MCP',
    content: 'S3DB transforms AWS S3 into a powerful document database...',
    author: 'john-doe',
    tags: ['tutorial', 's3db', 'mcp', 'ai'],
    published: true,
    publishDate: '2024-01-15',
    metadata: {
      views: 0,
      likes: 0
    }
  }
});

// 4. Update the post
await agent.callTool('resourceUpdate', {
  resourceName: 'posts',
  id: post.data.id,
  data: {
    metadata: {
      views: 150,
      likes: 12
    }
  }
});

// 5. Query posts with pagination
const posts = await agent.callTool('resourceList', {
  resourceName: 'posts',
  limit: 10,
  offset: 0
});

// 6. Check if post exists
const exists = await agent.callTool('resourceExists', {
  resourceName: 'posts',
  id: post.data.id
 });

// 7. Check performance statistics
const stats = await agent.callTool('dbGetStats');
console.log('Cache hits:', stats.stats.cache.size);
console.log('S3 costs:', stats.stats.costs.estimatedCostUSD);
console.log('Total requests:', stats.stats.costs.totalRequests);

// 8. Clear cache if needed
await agent.callTool('dbClearCache', {
  resourceName: 'posts'  // Clear cache for specific resource
});
```

### Performance & Costs Monitoring

```javascript
// Monitor database performance and costs
const stats = await agent.callTool('dbGetStats');

console.log('Database Stats:', {
  resources: stats.stats.database.resources,
  totalCosts: `$${stats.stats.costs.estimatedCostUSD.toFixed(6)}`,
  cacheHitRate: `${stats.stats.cache.keyCount}/${stats.stats.cache.maxSize}`,
  s3Operations: stats.stats.costs.requestsByType
});

// Cache performance
if (stats.stats.cache.enabled) {
  console.log('Cache Performance:', {
    driver: stats.stats.cache.driver,
    itemsCached: stats.stats.cache.size,
    maxCapacity: stats.stats.cache.maxSize,
    ttl: `${stats.stats.cache.ttl / 1000}s`,
    sampleKeys: stats.stats.cache.sampleKeys
  });
}

// S3 costs breakdown
if (stats.stats.costs) {
  console.log('S3 Costs Breakdown:', {
    totalRequests: stats.stats.costs.totalRequests,
    getRequests: stats.stats.costs.requestsByType.get,
    putRequests: stats.stats.costs.requestsByType.put,
    listRequests: stats.stats.costs.requestsByType.list,
    estimatedCost: `$${stats.stats.costs.estimatedCostUSD.toFixed(6)}`
  });
}

// Clear cache for performance reset
await agent.callTool('dbClearCache');  // Clear all cache
// or
await agent.callTool('dbClearCache', { resourceName: 'posts' });  // Clear specific resource
```

### Batch Operations

```javascript
// Insert multiple documents at once
await agent.callTool('resourceInsertMany', {
  resourceName: 'posts',
  data: [
    {
      title: 'AI and Databases',
      content: 'Exploring the intersection...',
      author: 'jane-smith',
      published: true
    },
    {
      title: 'S3DB Performance Tips',
      content: 'Best practices for...',
      author: 'bob-wilson',
      published: false
    }
  ]
});

// Get multiple documents by ID
const multiplePosts = await agent.callTool('resourceGetMany', {
  resourceName: 'posts',
  ids: ['post_123', 'post_456', 'post_789']
});

// Delete multiple documents
await agent.callTool('resourceDeleteMany', {
  resourceName: 'posts',
  ids: ['post_old1', 'post_old2']
});
```

### E-commerce Example with Complex Schema

```javascript
// Create products resource
await agent.callTool('dbCreateResource', {
  name: 'products',
  attributes: {
    sku: 'string|required|unique',
    name: 'string|required|min:2|max:200',
    description: 'string|required',
    price: 'number|positive|required',
    category: 'string|required',
    subcategory: 'string|optional',
    inStock: 'boolean',
    inventory: {
      quantity: 'number|integer|min:0',
      reserved: 'number|integer|min:0',
      warehouse: 'string|required'
    },
    specifications: {
      weight: 'number|positive|optional',
      dimensions: {
        length: 'number|positive',
        width: 'number|positive', 
        height: 'number|positive'
      },
      color: 'string|optional',
      material: 'string|optional'
    },
    pricing: {
      cost: 'number|positive',
      markup: 'number|positive',
      discountPercent: 'number|min:0|max:100'
    },
    tags: 'array|items:string',
    images: 'array|items:url'
  },
  partitions: {
    byCategory: {
      fields: { category: 'string' },
      description: 'Partition products by main category'
    },
    byCategoryAndSubcategory: {
      fields: { 
        category: 'string',
        subcategory: 'string'
      },
      description: 'Fine-grained category partitioning'
    }
  },
  timestamps: true
});

// Insert a complex product
await agent.callTool('resourceInsert', {
  resourceName: 'products',
  data: {
    sku: 'LAP-GAMING-001',
    name: 'Gaming Laptop Pro 15"',
    description: 'High-performance gaming laptop with RTX graphics',
    price: 1299.99,
    category: 'electronics',
    subcategory: 'laptops',
    inStock: true,
    inventory: {
      quantity: 25,
      reserved: 3,
      warehouse: 'US-WEST-1'
    },
    specifications: {
      weight: 2.3,
      dimensions: {
        length: 35.5,
        width: 25.0,
        height: 2.2
      },
      color: 'black',
      material: 'aluminum'
    },
    pricing: {
      cost: 850.00,
      markup: 0.53,
      discountPercent: 0
    },
    tags: ['gaming', 'laptop', 'rtx', 'high-performance'],
    images: [
      'https://example.com/laptop-1.jpg',
      'https://example.com/laptop-2.jpg'
    ]
  }
});
```

---

## 🗂️ Partitions & Performance

Partitions organize data for better performance and logical separation.

### Creating Partitioned Resources

```javascript
await agent.callTool('dbCreateResource', {
  name: 'orders',
  attributes: {
    orderId: 'string|required|unique',
    customerId: 'string|required',
    amount: 'number|positive|required',
    status: 'string|enum:pending,paid,shipped,delivered,cancelled',
    region: 'string|required',
    orderDate: 'date|required',
    items: 'array|items:object'
  },
  partitions: {
    // Single field partitions
    byRegion: {
      fields: { region: 'string' },
      description: 'Geographic distribution'
    },
    byStatus: {
      fields: { status: 'string' },
      description: 'Order status tracking'
    },
    byMonth: {
      fields: { orderDate: 'date|maxlength:7' }, // YYYY-MM format
      description: 'Monthly order archives'
    },
    
    // Multi-field partitions
    byRegionAndStatus: {
      fields: { 
        region: 'string',
        status: 'string'
      },
      description: 'Regional status tracking'
    },
    byRegionAndMonth: {
      fields: {
        region: 'string',
        orderDate: 'date|maxlength:7'
      },
      description: 'Regional monthly reports'
    }
  },
  timestamps: true
});
```

### Querying with Partitions

```javascript
// Query specific partition - much faster than full scan
const northernOrders = await agent.callTool('resourceList', {
  resourceName: 'orders',
  partition: 'byRegion',
  partitionValues: { region: 'north' },
  limit: 100
});

// Multi-field partition query
const northPendingOrders = await agent.callTool('resourceList', {
  resourceName: 'orders', 
  partition: 'byRegionAndStatus',
  partitionValues: {
    region: 'north',
    status: 'pending'
  }
});

// Time-based partition query
const januaryOrders = await agent.callTool('resourceList', {
  resourceName: 'orders',
  partition: 'byMonth', 
  partitionValues: { orderDate: '2024-01' }
});

// Count documents in partition
const pendingCount = await agent.callTool('resourceCount', {
  resourceName: 'orders',
  partition: 'byStatus',
  partitionValues: { status: 'pending' }
});
```

### Automatic Partition Migration (v9.2.2+)

**🎯 NEW FEATURE**: Records automatically move between partitions when you update partition fields!

```javascript
// 1. Insert order with status 'pending' - goes to 'pending' partition
const order = await agent.callTool('resourceInsert', {
  resourceName: 'orders',
  data: {
    orderId: 'ORD-001',
    customerId: 'CUST-123',
    amount: 299.99,
    status: 'pending',  // Goes to 'pending' partition
    region: 'north'
  }
});

// 2. Update status to 'shipped' - AUTOMATICALLY moves to 'shipped' partition!
await agent.callTool('resourceUpdate', {
  resourceName: 'orders',
  id: order.id,
  data: {
    ...order,
    status: 'shipped'  // Automatically moved from 'pending' to 'shipped' partition
  }
});

// The record is now:
// ✅ In the 'shipped' partition
// ❌ NOT in the 'pending' partition anymore (automatically cleaned up!)
```

### Partition Best Practices

**Common Partition Patterns:**
- **By Date**: `{ orderDate: 'date|maxlength:10' }` (YYYY-MM-DD)
- **By Month**: `{ orderDate: 'date|maxlength:7' }` (YYYY-MM)
- **By Category**: `{ category: 'string' }`
- **By User**: `{ userId: 'string' }`
- **By Status**: `{ status: 'string' }`
- **By Geographic Region**: `{ region: 'string', country: 'string' }`

**Performance Benefits:**
- ⚡ **Faster queries** - scans only relevant partition
- 💰 **Lower S3 costs** - fewer requests and data transfer
- 📊 **Better analytics** - efficient aggregations
- 🔄 **Easier maintenance** - targeted operations

---

## 🐳 Docker Deployment

### Quick Start with Docker Compose

```bash
# 1. Create project directory
mkdir s3db-mcp && cd s3db-mcp

# 2. Create docker-compose.yml
curl -o docker-compose.yml https://raw.githubusercontent.com/forattini-dev/s3db.js/main/mcp-server/docker-compose.yml

# 3. Create .env file
curl -o .env.example https://raw.githubusercontent.com/forattini-dev/s3db.js/main/mcp-server/.env.example
cp .env.example .env

# 4. Edit .env with your configuration
# 5. Start services
docker compose up
```

### Production Docker Setup

```yaml
services:
  s3db-mcp-server:
    image: s3db-mcp-server:latest
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - S3DB_CONNECTION_STRING=s3://bucket/databases/prod
      - MCP_TRANSPORT=sse
      - MCP_SERVER_PORT=17500
    ports:
      - "17500:8000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Local Development with MinIO

```bash
# Start with MinIO for local S3 testing
docker compose --profile local-testing up

# Access:
# - MCP Server: http://localhost:17500/sse  
# - MinIO Console: http://localhost:9001 (minioadmin/minioadmin)
# - Health Check: http://localhost:8001/health
```

### Docker Environment Variables

All the configuration variables mentioned above can be used in Docker:

```bash
docker run -p 17500:8000 \
  -e S3DB_CONNECTION_STRING="s3://key:secret@bucket/db" \
  -e S3DB_VERBOSE=true \
  -e S3DB_PARALLELISM=20 \
  -e MCP_TRANSPORT=sse \
  s3db-mcp-server
```

---

## 🤖 AI Agent Integration

### Claude Desktop Integration

1. **Locate config file:**
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. **Add S3DB MCP server:**
```json
{
  "mcpServers": {
    "s3db": {
      "transport": "sse",
      "url": "http://localhost:17500/sse"
    }
  }
}
```

3. **For STDIO transport:**
```json
{
  "mcpServers": {
    "s3db": {
      "transport": "stdio",
      "command": "npx",
      "args": ["s3db-mcp-server", "--transport=stdio"],
      "env": {
        "S3DB_CONNECTION_STRING": "s3://bucket/databases/myapp"
      }
    }
  }
}
```

### Cursor IDE Integration

Add to your MCP settings:
```json
{
  "mcpServers": {
    "s3db": {
      "url": "http://localhost:17500/sse"
    }
  }
}
```

### AI Agent Usage Rules

**Before any task:**
1. Always use `dbConnect` first to establish connection (cache and costs tracking are enabled by default)
2. Use `dbStatus` to verify connection and see resources
3. Use `dbListResources` to see available collections

**For data operations:**
1. Use `resourceExists` to check if documents exist before operations
2. Prefer batch operations (`resourceInsertMany`, `resourceGetMany`) for efficiency
3. Use partitions for performance when querying large datasets
4. Always use pagination (`resourceList` with `limit`/`offset`) for large results

**Schema design:**
- Define validation rules: `"email": "email|required|unique"`
- Use nested objects for complex data structures
- Enable timestamps for audit trails
- Consider partitioning strategy upfront

**Performance monitoring:**
- Use `dbGetStats` to monitor S3 costs and cache performance
- Cache is automatically enabled for read operations (get, list, count)
- Use `dbClearCache` to reset cache when needed
- Monitor costs to optimize S3 usage patterns

**Error handling:**
- Check connection status before operations
- Validate data structure matches schema
- Handle resource not found errors gracefully
- Use appropriate error messages for users

---

## 🔒 Security

### AWS IAM Policy

Minimal S3 permissions required:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:HeadObject"
      ],
      "Resource": [
        "arn:aws:s3:::your-s3db-bucket",
        "arn:aws:s3:::your-s3db-bucket/*"
      ]
    }
  ]
}
```

### Security Best Practices

1. **Use IAM roles** when possible instead of access keys
2. **Rotate credentials** regularly  
3. **Use environment variables** never hardcode credentials
4. **Enable S3 bucket encryption** and versioning
5. **Monitor access logs** and set up CloudTrail
6. **Use strong passphrases** for S3DB encryption
7. **Restrict network access** with security groups
8. **Enable HTTPS** for all connections

### Field-Level Encryption

```javascript
await agent.callTool('dbCreateResource', {
  name: 'sensitive_data',
  attributes: {
    publicInfo: 'string',
    privateData: 'secret',  // Automatically encrypted
    ssn: 'secret',          // Encrypted with passphrase
    creditCard: 'secret'    // Encrypted
  }
});
```

---

## 🚨 Troubleshooting

### Common Issues

**Connection Problems:**
```bash
# Check if server is running
curl http://localhost:8001/health

# Check MCP endpoint
curl http://localhost:17500/sse

# View server logs
docker compose logs -f s3db-mcp-server
```

**S3 Access Issues:**
```bash
# Test S3 connection
aws s3 ls s3://your-bucket

# Check credentials
aws sts get-caller-identity

# Test with MinIO
mc alias set local http://localhost:9000 minioadmin minioadmin
mc ls local
```

**Performance Issues:**
- Increase `S3DB_PARALLELISM` for better throughput
- Use partitions to reduce query scope
- Implement proper pagination 
- Monitor S3 request patterns

**Memory Issues:**
- Avoid `resourceGetAll` on large datasets
- Use `resourceList` with pagination instead
- Increase Docker memory limits if needed

### Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Database not connected" | No `dbConnect` called | Call `dbConnect` tool first |
| "Resource not found" | Invalid resource name | Check with `dbListResources` |
| "Validation failed" | Data doesn't match schema | Review attribute definitions |
| "Connection string invalid" | Malformed connection string | Check format: `s3://key:secret@bucket/path` |
| "Health check failed" | Server not responding | Check if process is running on correct port |

### Debug Mode

Enable verbose logging:
```bash
# Environment variable
export S3DB_VERBOSE=true

# Command line
s3db-mcp --transport=sse

# Docker
docker run -e S3DB_VERBOSE=true s3db-mcp-server
```

### Health Monitoring

```bash
# Check server health
curl http://localhost:8001/health

# Response includes:
{
  "status": "healthy",
  "database": {
    "connected": true,
    "bucket": "my-bucket", 
    "resourceCount": 5
  },
  "memory": { "rss": 45000000 },
  "uptime": 3600
}
```

---

## 🔌 Built-in Performance Features

The S3DB MCP Server includes **automatic performance optimizations**:

### **🏎️ Configurable Cache (Enabled by Default)**
- **Two cache drivers**: Memory (fast, temporary) and Filesystem (persistent)
- **Automatic caching** of read operations (get, list, count, exists)
- **Partition-aware** caching for optimized queries
- **Configurable TTL** and size limits
- **Cache invalidation** on write operations
- **Performance monitoring** via `dbGetStats`

#### **Memory Cache**
- ⚡ **Fastest performance** for frequently accessed data
- 🔄 **Lost on restart** - ideal for temporary caching
- 📊 **Size-limited** by number of items

#### **Filesystem Cache**  
- 💾 **Persistent across restarts** - cache survives server restarts
- 🗜️ **Automatic compression** to save disk space
- 🧹 **Automatic cleanup** of expired files
- 📁 **Configurable directory** and file naming

### **💰 Costs Tracking (Enabled by Default)**
- **Real-time S3 costs** calculation
- **Request counting** by operation type
- **Cost estimation** in USD
- **Performance analytics** for optimization

### **Configuration Options**
```javascript
// Connect with memory cache (fast, temporary)
await agent.callTool('dbConnect', {
  connectionString: 's3://...',
  enableCache: true,        // Default: true
  enableCosts: true,        // Default: true  
  cacheDriver: 'memory',    // Fast but lost on restart
  cacheMaxSize: 2000,       // Default: 1000
  cacheTtl: 600000          // Default: 300000 (5 min)
});

// Connect with filesystem cache (persistent)
await agent.callTool('dbConnect', {
  connectionString: 's3://...',
  enableCache: true,
  cacheDriver: 'filesystem', // Survives restarts
  cacheDirectory: './data/cache',
  cachePrefix: 'myapp',
  cacheTtl: 1800000          // 30 minutes
});

// Monitor performance
const stats = await agent.callTool('dbGetStats');
console.log('Cache size:', stats.stats.cache.size);
console.log('Cache driver:', stats.stats.cache.driver);
console.log('S3 costs:', stats.stats.costs.estimatedCostUSD);

// Clear cache when needed
await agent.callTool('dbClearCache', { resourceName: 'users' });
```

### **Environment Variables**
```bash
S3DB_CACHE_ENABLED=true           # Enable/disable cache
S3DB_CACHE_DRIVER=memory          # Cache driver: 'memory' or 'filesystem'
S3DB_CACHE_MAX_SIZE=1000          # Cache capacity (memory driver)
S3DB_CACHE_TTL=300000             # 5 minute TTL
S3DB_CACHE_DIRECTORY=./cache      # Filesystem cache directory
S3DB_CACHE_PREFIX=s3db            # Filesystem cache file prefix
S3DB_COSTS_ENABLED=true           # Enable/disable costs tracking
```

---

## 🚀 **Cache Strategy Guide**

Choose the right cache driver for your use case:

### **When to Use Memory Cache**
- ⚡ **Development & Testing** - fastest performance, no setup required
- 🔄 **Short-lived processes** - containers that restart frequently  
- 📊 **High-frequency reads** - when you need maximum speed
- 💰 **Cost optimization** - minimize S3 requests for hot data
- ⚠️ **Limitation**: Cache is lost on restart

### **When to Use Filesystem Cache**
- 💾 **Production environments** - cache survives server restarts
- 🔄 **Long-running processes** - persistent data across deployments
- 📦 **Containerized deployments** - mount cache volume for persistence
- 🔧 **Development consistency** - maintain cache between code changes
- 🗂️ **Large datasets** - no memory size limitations

### **Configuration Examples**

```javascript
// High-performance temporary cache
await agent.callTool('dbConnect', {
  cacheDriver: 'memory',
  cacheMaxSize: 5000,
  cacheTtl: 600000  // 10 minutes
});

// Production persistent cache
await agent.callTool('dbConnect', {
  cacheDriver: 'filesystem',
  cacheDirectory: './data/cache',
  cachePrefix: 'prod',
  cacheTtl: 3600000  // 1 hour
});
```

### **Docker Volume Setup**
```yaml
# docker-compose.yml
volumes:
  - ./cache-data:/app/cache  # Persistent filesystem cache
environment:
  - S3DB_CACHE_DRIVER=filesystem
  - S3DB_CACHE_DIRECTORY=/app/cache
```

---

## 📊 Performance Tips

1. **Choose appropriate cache** - memory for speed, filesystem for persistence
2. **Leverage built-in cache** - read operations are automatically cached
3. **Use partitions** for large datasets to improve cache efficiency
4. **Monitor costs** with `dbGetStats` to optimize S3 usage
5. **Batch operations** when possible to reduce S3 requests
6. **Proper pagination** - don't load everything at once
7. **Connection reuse** - keep connections alive
8. **Appropriate parallelism** - tune `S3DB_PARALLELISM`

---

## 🔗 Resources

- **S3DB Documentation**: [github.com/forattini-dev/s3db.js](https://github.com/forattini-dev/s3db.js)
- **Model Context Protocol**: [modelcontextprotocol.io](https://modelcontextprotocol.io/)
- **Issues & Support**: [GitHub Issues](https://github.com/forattini-dev/s3db.js/issues)
- **Discussions**: [GitHub Discussions](https://github.com/forattini-dev/s3db.js/discussions)

---

## 📄 License

This project is licensed under the same license as the parent S3DB project.

---

<p align="center">
  <strong>🎉 Ready to supercharge your AI agents with persistent data storage!</strong><br>
  <em>Start building with S3DB MCP Server today</em>
</p>