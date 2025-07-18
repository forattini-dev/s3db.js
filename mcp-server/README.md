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

<p align="center">
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Runtime-Node.js-339933.svg?style=flat&logo=node.js" alt="Node.js Runtime"></a>
  &nbsp;
  <a href="https://aws.amazon.com/s3/"><img src="https://img.shields.io/badge/Powered_by-AWS_S3-FF9900.svg?style=flat&logo=amazon-aws" alt="Powered by AWS S3"></a>
  &nbsp;
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/Protocol-MCP-007ACC.svg?style=flat" alt="MCP Protocol"></a>
</p>

---

## 🚀 What is S3DB MCP Server?

The **S3DB MCP Server** is a Model Context Protocol implementation that allows AI agents to interact with S3DB databases through a standardized interface. S3DB transforms AWS S3 into a powerful document database, and this MCP server exposes all its capabilities to AI assistants and agents.

**Perfect for:**
- 🤖 **AI Agent Applications** - Give your agents persistent memory and data storage
- 🌐 **Serverless AI Systems** - No database servers to manage, just S3
- 💰 **Cost-Effective AI Solutions** - Pay only for what you store and access
- 🔒 **Secure AI Data** - Built-in encryption and AWS security
- 📊 **AI Analytics** - Efficient data processing and streaming
- 🚀 **Rapid AI Prototyping** - Get started in minutes, not hours

---

## ✨ Key Features

<table>
<tr>
<td width="50%">

### 🎯 **Database Operations**
- **Connect/Disconnect** - Manage database connections
- **Resource Management** - Create and manage collections
- **Status Monitoring** - Real-time connection status
- **Multi-tenant Support** - Namespace isolation

</td>
<td width="50%">

### 📝 **CRUD Operations**
- **Insert/Update/Delete** - Full document lifecycle
- **Batch Operations** - Handle multiple documents
- **Upsert Support** - Insert or update in one call
- **Existence Checking** - Verify document presence

</td>
</tr>
<tr>
<td width="50%">

### 🔍 **Query & Retrieval**
- **Pagination** - Efficient large dataset handling
- **Partition Filtering** - Organized data access
- **Count Operations** - Quick statistics
- **Bulk Retrieval** - Get multiple documents

</td>
<td width="50%">

### 🔧 **Advanced Features**
- **Schema Validation** - Automatic data validation
- **Partitioning** - Organized data storage
- **Timestamps** - Automatic time tracking
- **Encryption** - Field-level security

</td>
</tr>
</table>

---

## 📋 Table of Contents

- [🚀 Quick Start](#-quick-start)
- [💾 Installation](#-installation)
- [🎯 Usage](#-usage)
- [🐳 Docker Deployment](#-docker-deployment)
- [🔧 Configuration](#-configuration)
- [🛠️ Available Tools](#️-available-tools)
- [🤖 AI Agent Integration](#-ai-agent-integration)
- [📖 Examples](#-examples)
- [🔒 Security](#-security)
- [🚀 Development](#-development)

---

## 🚀 Quick Start

Get your AI agents connected to S3DB in less than 5 minutes!

### 1. Install via NPX (Recommended)

```bash
# Start the MCP server instantly
npx s3db-mcp-server --transport=sse
```

### 2. Or Install Globally

```bash
# Install globally
npm install -g s3db-mcp-server

# Start the server
s3db-mcp --transport=sse
```

### 3. Configure Your AI Client

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

### 4. Start Using S3DB

Your AI agent can now:
- Connect to S3DB databases
- Create and manage document collections
- Perform CRUD operations
- Query and analyze data

---

## 💾 Installation

### NPX (No Installation Required)

```bash
# SSE transport (recommended for web clients)
npx s3db-mcp-server --transport=sse

# STDIO transport (for desktop clients)
npx s3db-mcp-server --transport=stdio
```

### Global Installation

```bash
npm install -g s3db-mcp-server
```

### Local Project Installation

```bash
npm install s3db-mcp-server
```

### Docker Installation

```bash
# Quick start with Docker
docker run -p 8000:8000 -e S3DB_CONNECTION_STRING="your-connection-string" s3db-mcp-server

# Or use Docker Compose
docker compose up
```

---

## 🎯 Usage

### Command Line Options

```bash
# Start with SSE transport (HTTP-based)
s3db-mcp --transport=sse --host=0.0.0.0 --port=8000

# Start with STDIO transport (pipe-based)
s3db-mcp --transport=stdio

# Development mode with auto-reload
npm run dev
```

### Environment Variables

Create a `.env` file:

```env
# S3DB Configuration
S3DB_CONNECTION_STRING=s3://ACCESS_KEY:SECRET_KEY@BUCKET/databases/myapp
S3DB_VERBOSE=false
S3DB_PARALLELISM=10

# Server Configuration
MCP_SERVER_HOST=0.0.0.0
MCP_SERVER_PORT=8000
MCP_TRANSPORT=sse
```

### Basic Workflow

1. **Connect to Database**
   ```javascript
   // AI agent calls dbConnect tool
   {
     "name": "dbConnect",
     "arguments": {
       "connectionString": "s3://key:secret@bucket/databases/myapp"
     }
   }
   ```

2. **Create a Resource**
   ```javascript
   // AI agent calls dbCreateResource tool
   {
     "name": "dbCreateResource", 
     "arguments": {
       "name": "users",
       "attributes": {
         "name": "string|required",
         "email": "email|unique", 
         "age": "number|positive"
       },
       "timestamps": true
     }
   }
   ```

3. **Insert Data**
   ```javascript
   // AI agent calls resourceInsert tool
   {
     "name": "resourceInsert",
     "arguments": {
       "resourceName": "users",
       "data": {
         "name": "John Doe",
         "email": "john@example.com",
         "age": 30
       }
     }
   }
   ```

4. **Query Data**
   ```javascript
   // AI agent calls resourceList tool
   {
     "name": "resourceList",
     "arguments": {
       "resourceName": "users",
       "limit": 10,
       "offset": 0
     }
   }
   ```

---

## 🐳 Docker Deployment

### Quick Start with Docker

```bash
# 1. Clone or create directory
mkdir s3db-mcp && cd s3db-mcp

# 2. Download docker-compose.yml
curl -O https://raw.githubusercontent.com/forattini-dev/s3db.js/main/mcp-server/docker-compose.yml

# 3. Create .env file
cp .env.example .env
# Edit .env with your configuration

# 4. Start services
docker compose up
```

### Production Docker Setup

```yaml
services:
  s3db-mcp-server:
    image: s3db-mcp-server:latest
    restart: unless-stopped
    environment:
      - S3DB_CONNECTION_STRING=s3://bucket/databases/prod
      - NODE_ENV=production
      - MCP_TRANSPORT=sse
    ports:
      - "8000:8000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Local Development with MinIO

```bash
# Start with local MinIO for testing
docker compose --profile local-testing up
```

This includes:
- S3DB MCP Server on port 8000
- MinIO S3-compatible storage on port 9000
- MinIO Console on port 9001

---

## 🔧 Configuration

### Connection Strings

S3DB supports various S3 providers through connection strings:

```bash
# AWS S3 with credentials
S3DB_CONNECTION_STRING="s3://ACCESS_KEY:SECRET_KEY@bucket-name/databases/myapp"

# AWS S3 with IAM roles (no credentials needed)
S3DB_CONNECTION_STRING="s3://bucket-name/databases/myapp"

# MinIO (local development)
S3DB_CONNECTION_STRING="s3://minioadmin:minioadmin@test-bucket/databases/dev?endpoint=http://localhost:9000&forcePathStyle=true"

# DigitalOcean Spaces
S3DB_CONNECTION_STRING="s3://DO_KEY:DO_SECRET@space-name/databases/prod?endpoint=https://nyc3.digitaloceanspaces.com"

# LocalStack (local AWS simulation)
S3DB_CONNECTION_STRING="s3://test:test@test-bucket/databases/local?endpoint=http://localhost:4566&forcePathStyle=true"
```

### Advanced Configuration

```env
# Performance tuning
S3DB_PARALLELISM=20
S3DB_VERBOSE=true

# Security
S3DB_PASSPHRASE=your-strong-encryption-passphrase
S3DB_VERSIONING_ENABLED=true

# Networking
MCP_SERVER_HOST=0.0.0.0
MCP_SERVER_PORT=8000
MCP_TRANSPORT=sse
```

---

## 🛠️ Available Tools

The S3DB MCP Server exposes the following tools to AI agents:

### Database Management

| Tool | Description | Required Args |
|------|-------------|---------------|
| `dbConnect` | Connect to S3DB database | `connectionString` |
| `dbDisconnect` | Disconnect from database | - |
| `dbStatus` | Get connection status | - |
| `dbCreateResource` | Create new resource/collection | `name`, `attributes` |
| `dbListResources` | List all resources | - |

### Document Operations

| Tool | Description | Required Args |
|------|-------------|---------------|
| `resourceInsert` | Insert new document | `resourceName`, `data` |
| `resourceInsertMany` | Insert multiple documents | `resourceName`, `data[]` |
| `resourceGet` | Get document by ID | `resourceName`, `id` |
| `resourceGetMany` | Get multiple documents | `resourceName`, `ids[]` |
| `resourceUpdate` | Update document | `resourceName`, `id`, `data` |
| `resourceUpsert` | Insert or update document | `resourceName`, `data` |
| `resourceDelete` | Delete document | `resourceName`, `id` |
| `resourceDeleteMany` | Delete multiple documents | `resourceName`, `ids[]` |

### Query Operations

| Tool | Description | Required Args |
|------|-------------|---------------|
| `resourceExists` | Check if document exists | `resourceName`, `id` |
| `resourceList` | List documents with pagination | `resourceName` |
| `resourceListIds` | List document IDs | `resourceName` |
| `resourceCount` | Count documents | `resourceName` |
| `resourceGetAll` | Get all documents (use carefully) | `resourceName` |
| `resourceDeleteAll` | Delete all documents | `resourceName`, `confirm: true` |

---

## 🤖 AI Agent Integration

### Claude Desktop Integration

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

### Cursor IDE Integration

```json
{
  "mcpServers": {
    "s3db": {
      "url": "http://localhost:8000/sse"
    }
  }
}
```

### STDIO Transport (Desktop Clients)

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

---

## 📖 Examples

### Basic Usage Example

```javascript
// 1. Connect to database
await agent.callTool('dbConnect', {
  connectionString: 's3://bucket/databases/blog'
});

// 2. Create a posts resource
await agent.callTool('dbCreateResource', {
  name: 'posts',
  attributes: {
    title: 'string|required',
    content: 'string|required', 
    author: 'string|required',
    tags: 'array|items:string',
    published: 'boolean'
  },
  timestamps: true
});

// 3. Insert a blog post
const post = await agent.callTool('resourceInsert', {
  resourceName: 'posts',
  data: {
    title: 'Getting Started with S3DB',
    content: 'S3DB is a powerful document database...',
    author: 'John Doe',
    tags: ['tutorial', 's3db', 'database'],
    published: true
  }
});

// 4. Query posts
const posts = await agent.callTool('resourceList', {
  resourceName: 'posts',
  limit: 10
});
```

### E-commerce Example

```javascript
// Create products resource with partitioning
await agent.callTool('dbCreateResource', {
  name: 'products',
  attributes: {
    name: 'string|required',
    price: 'number|positive|required',
    category: 'string|required',
    sku: 'string|required|unique',
    inStock: 'boolean'
  },
  partitions: {
    byCategory: {
      fields: { category: 'string' }
    }
  },
  timestamps: true
});

// Insert products
await agent.callTool('resourceInsertMany', {
  resourceName: 'products',
  data: [
    {
      name: 'Laptop Pro',
      price: 1299.99,
      category: 'electronics',
      sku: 'LAP-001',
      inStock: true
    },
    {
      name: 'Coffee Mug',
      price: 15.99,
      category: 'kitchen',
      sku: 'MUG-001', 
      inStock: true
    }
  ]
});

// Query electronics products
const electronics = await agent.callTool('resourceList', {
  resourceName: 'products',
  partition: 'byCategory',
  partitionValues: { category: 'electronics' }
});
```

### User Management Example

```javascript
// Create users resource
await agent.callTool('dbCreateResource', {
  name: 'users',
  attributes: {
    username: 'string|required|unique',
    email: 'email|required|unique',
    profile: {
      firstName: 'string|required',
      lastName: 'string|required',
      bio: 'string|optional'
    },
    settings: {
      theme: 'string|enum:light,dark',
      notifications: 'boolean'
    }
  },
  behavior: 'enforce-limits',
  timestamps: true
});

// Create user
const user = await agent.callTool('resourceInsert', {
  resourceName: 'users',
  data: {
    username: 'johndoe',
    email: 'john@example.com',
    profile: {
      firstName: 'John',
      lastName: 'Doe',
      bio: 'Software developer and AI enthusiast'
    },
    settings: {
      theme: 'dark',
      notifications: true
    }
  }
});

// Update user profile
await agent.callTool('resourceUpdate', {
  resourceName: 'users',
  id: user.data.id,
  data: {
    profile: {
      bio: 'Senior software developer and AI researcher'
    }
  }
});
```

---

## 🔒 Security

### Best Practices

1. **Use IAM Roles** when possible instead of access keys
2. **Rotate credentials** regularly
3. **Use least-privilege** access policies
4. **Enable encryption** with strong passphrases
5. **Monitor access** logs and CloudTrail events
6. **Use HTTPS** for all connections
7. **Secure environment** variables and configuration

### IAM Policy Example

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
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-s3db-bucket",
        "arn:aws:s3:::your-s3db-bucket/*"
      ]
    }
  ]
}
```

### Encryption

S3DB supports field-level encryption:

```javascript
await agent.callTool('dbCreateResource', {
  name: 'sensitive_data',
  attributes: {
    publicData: 'string',
    secretData: 'secret' // Automatically encrypted
  },
  passphrase: 'your-strong-encryption-key'
});
```

---

## 🚀 Development

### Local Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/forattini-dev/s3db.js.git
cd s3db.js/mcp-server

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env
# Edit .env with your configuration

# 4. Start development server
npm run dev
```

### Testing with MinIO

```bash
# Start MinIO and MCP server
docker compose --profile local-testing up

# MinIO Console: http://localhost:9001
# MCP Server: http://localhost:8000/sse
```

### Building Docker Image

```bash
# Build image
npm run docker:build

# Run container
npm run docker:run
```

### Testing the MCP Server

```bash
# Test SSE endpoint
curl http://localhost:8000/sse

# Test with MCP client
npx @modelcontextprotocol/inspector http://localhost:8000/sse
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

## 📄 License

This project is licensed under the same license as the parent S3DB project.

---

## 🤝 Support

- **Documentation**: [S3DB.js Documentation](https://github.com/forattini-dev/s3db.js)
- **Issues**: [GitHub Issues](https://github.com/forattini-dev/s3db.js/issues)
- **Discussions**: [GitHub Discussions](https://github.com/forattini-dev/s3db.js/discussions)

---

## 🌟 Acknowledgments

- Built on top of [S3DB.js](https://github.com/forattini-dev/s3db.js)
- Implements [Model Context Protocol](https://modelcontextprotocol.io/)
- Powered by [AWS S3](https://aws.amazon.com/s3/) and compatible services

---

<p align="center">
  <strong>Transform your AI agents with persistent, scalable data storage!</strong><br>
  <em>Start using S3DB MCP Server today</em>
</p>