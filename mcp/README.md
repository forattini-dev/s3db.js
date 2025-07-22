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

# Server running at: http://localhost:8000/sse
```

### 2. Configure Your AI Client

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "s3db": {
      "transport": "sse",
      "url": "http://localhost:8000/sse"
    }
  }
}
```

**Cursor IDE**:
```json
{
  "mcpServers": {
    "s3db": {
      "url": "http://localhost:8000/sse"
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
# SSE transport (web clients)
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
docker run -p 8000:8000 -e S3DB_CONNECTION_STRING="s3://key:secret@bucket/db" s3db-mcp-server
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file or set these environment variables:

#### **Server Configuration**
| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `MCP_SERVER_HOST` | `0.0.0.0` | Server bind address |
| `MCP_SERVER_PORT` | `8000` | Server port |
| `MCP_TRANSPORT` | `sse` | Transport method (`sse` or `stdio`) |

#### **S3DB Configuration**
| Variable | Default | Description |
|----------|---------|-------------|
| `S3DB_CONNECTION_STRING` | **Required** | S3DB connection string |
| `S3DB_VERBOSE` | `false` | Enable verbose logging |
| `S3DB_PARALLELISM` | `10` | Number of parallel S3 operations |
| `S3DB_PASSPHRASE` | `secret` | Encryption passphrase |
| `S3DB_VERSIONING_ENABLED` | `false` | Enable resource versioning |

#### **Plugin Configuration**
| Variable | Default | Description |
|----------|---------|-------------|
| `S3DB_COSTS_ENABLED` | `true` | Enable automatic S3 costs tracking |
| `S3DB_CACHE_ENABLED` | `true` | Enable cache for performance |
| `S3DB_CACHE_DRIVER` | `memory` | Cache driver: `memory` or `filesystem` |
| `S3DB_CACHE_MAX_SIZE` | `1000` | Maximum items in memory cache (memory driver only) |
| `S3DB_CACHE_TTL` | `300000` | Cache TTL in milliseconds (5 minutes) |
| `S3DB_CACHE_DIRECTORY` | `./cache` | Directory for filesystem cache (filesystem driver only) |
| `S3DB_CACHE_PREFIX` | `s3db` | Prefix for cache files (filesystem driver only) |

#### **AWS Configuration**
| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_ACCESS_KEY_ID` | - | AWS access key (optional with IAM roles) |
| `AWS_SECRET_ACCESS_KEY` | - | AWS secret key (optional with IAM roles) |
| `AWS_SESSION_TOKEN` | - | AWS session token (for temporary credentials) |
| `AWS_REGION` | `us-east-1` | AWS region |

#### **S3-Compatible Services**
| Variable | Default | Description |
|----------|---------|-------------|
| `S3_ENDPOINT` | - | Custom S3 endpoint (MinIO, DigitalOcean, etc.) |
| `S3_FORCE_PATH_STYLE` | `false` | Use path-style URLs |

### Connection String Examples

```bash
# AWS S3 with credentials
S3DB_CONNECTION_STRING="s3://ACCESS_KEY:SECRET_KEY@bucket-name/databases/myapp"

# AWS S3 with IAM roles (no credentials needed)
S3DB_CONNECTION_STRING="s3://bucket-name/databases/myapp"

# MinIO (local development)
S3DB_CONNECTION_STRING="s3://minioadmin:minioadmin@test-bucket/databases/dev?endpoint=http://localhost:9000&forcePathStyle=true"

# DigitalOcean Spaces
S3DB_CONNECTION_STRING="s3://DO_KEY:DO_SECRET@space-name/databases/prod?endpoint=https://nyc3.digitaloceanspaces.com"

# LocalStack (AWS simulation)
S3DB_CONNECTION_STRING="s3://test:test@test-bucket/databases/local?endpoint=http://localhost:4566&forcePathStyle=true"
```

### Command Line Options

```bash
# Transport options
s3db-mcp --transport=sse          # HTTP-based transport
s3db-mcp --transport=stdio        # Pipe-based transport

# Network options  
s3db-mcp --host=0.0.0.0 --port=8000

# Example with environment
S3DB_CONNECTION_STRING="s3://..." s3db-mcp --transport=sse
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
      - MCP_SERVER_PORT=8000
    ports:
      - "8000:8000"
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
# - MCP Server: http://localhost:8000/sse  
# - MinIO Console: http://localhost:9001 (minioadmin/minioadmin)
# - Health Check: http://localhost:8001/health
```

### Docker Environment Variables

All the configuration variables mentioned above can be used in Docker:

```bash
docker run -p 8000:8000 \
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
      "url": "http://localhost:8000/sse"
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
      "url": "http://localhost:8000/sse"
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
curl http://localhost:8000/sse

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