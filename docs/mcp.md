# 🗃️ S3DB MCP Server

<p align="center">
  <img width="200" src="https://img.icons8.com/fluency/200/database.png" alt="S3DB MCP Server">
</p>

<p align="center">
  <strong>Model Context Protocol (MCP) server for S3DB</strong><br>
  <em>Transform AWS S3 into a powerful document database accessible by AI agents</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/s3db-mcp"><img src="https://img.shields.io/npm/v/s3db-mcp.svg?style=flat&color=brightgreen" alt="npm version"></a>
  &nbsp;
  <a href="https://github.com/forattini-dev/s3db.js"><img src="https://img.shields.io/github/stars/forattini-dev/s3db.js?style=flat&color=yellow" alt="GitHub stars"></a>
  &nbsp;
  <a href="https://github.com/forattini-dev/s3db.js/blob/main/UNLICENSE"><img src="https://img.shields.io/badge/license-Unlicense-blue.svg?style=flat" alt="License"></a>
</p>

---

## ⚡ TL;DR

**Quick Start - 3 Steps:**
```bash
# 1. Start MCP server (local)
npx -y s3db-mcp

# 2. Or start with HTTP (remote)
npx -y s3db-mcp --transport=http

# 3. Add to Claude Desktop config
{
  "mcpServers": {
    "s3db": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "s3db-mcp"],
      "env": {
        "S3DB_CONNECTION_STRING": "s3://key:secret@bucket/databases/myapp"
      }
    }
  }
}
```

**What you get:**
- 📖 **Built-in AI documentation** - `s3dbQueryDocs("How do I use partitions?")`
- 🗄️ **41+ database tools** - Connect, create resources, insert, query, update, delete
- ⚡ **Auto-caching** - 70-90% performance boost with memory/filesystem cache
- 💰 **Cost tracking** - Real-time S3 costs monitoring
- 🗂️ **Partitions** - O(1) queries with automatic partition migration

**Two transports:**
- **stdio** (default): Local integration → `npx -y s3db-mcp`
- **http**: Remote access → `npx -y s3db-mcp --transport=http`
  → Server runs on `http://localhost:17500/mcp`

**One-liner for Claude Code CLI:**
```bash
# Local stdio (recommended)
claude mcp add s3db npx -y s3db-mcp

# Or remote HTTP
npx -y s3db-mcp --transport=http &
claude mcp add --transport http s3db http://localhost:17500/mcp
```

**Read on for full documentation ↓**

---

## 🤖 **NEW: Built-in Documentation Assistant for AI Agents!**

> **AI agents can now ask questions about s3db.js directly through MCP - no manual documentation needed!**

Before you start working with s3db.js, use these tools to learn about any feature:

| Tool | Use When | Example |
|------|----------|---------|
| **`s3dbQueryDocs`** | You need to learn how to use a feature | `"How do I use the CachePlugin?"` |
| **`s3dbListTopics`** | You want to see what features are available | Browse all topics by category |

### Quick Example

```javascript
// Ask any question about s3db.js features
await agent.callTool('s3dbQueryDocs', {
  query: 'How do I create partitioned resources?'
});
// → Returns relevant documentation sections with code examples

// Get help with troubleshooting
await agent.callTool('s3dbQueryDocs', {
  query: 'How do I fix orphaned partitions?'
});
// → Returns recovery workflow from documentation

// Browse all available topics
await agent.callTool('s3dbListTopics');
// → Returns organized list of all 54+ topics
```

**Why this matters:**
- ✅ **Self-learning AI agents** - No need for extensive prompts or manuals
- ✅ **Natural language queries** - Ask questions like you would ask a human
- ✅ **Up-to-date answers** - Searches all documentation in real-time
- ✅ **Fast integration** - Reduces onboarding time from hours to minutes

👉 **See [Documentation & Discovery Tools](#-documentation--discovery) section below for complete details**

---

## 🚀 Quick Start

### Option A: Claude Code CLI (Easiest)

**One command to add S3DB MCP:**
```bash
claude mcp add s3db npx -y s3db-mcp
```

**Then configure your connection string:**
```bash
# Edit .claude/mcp-servers.json and add:
"env": {
  "S3DB_CONNECTION_STRING": "s3://key:secret@bucket/databases/myapp"
}
```

**Test it:**
```bash
claude mcp status
```

---

### Option B: Claude Desktop

#### Prerequisites
Before starting, ensure you have:
1. **Claude Desktop** installed (version 0.7.0 or later)
2. **Node.js** installed (version 18+ recommended)
3. **S3 Bucket** or S3-compatible storage (MinIO, etc.)
4. **Credentials** for your S3 service

#### Step 1: Locate Claude Desktop Configuration

The configuration file location depends on your operating system:

```bash
# macOS
~/Library/Application Support/Claude/claude_desktop_config.json

# Windows
%APPDATA%\Claude\claude_desktop_config.json

# Linux
~/.config/Claude/claude_desktop_config.json
```

#### Step 2: Configure Claude Desktop

Open the configuration file and add the S3DB MCP server:

```json
{
  "mcpServers": {
    "s3db": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "s3db-mcp", "--transport=stdio"],
      "env": {
        "S3DB_CONNECTION_STRING": "s3://ACCESS_KEY:SECRET_KEY@bucket/databases/myapp",
        "S3DB_CACHE_ENABLED": "true",
        "S3DB_CACHE_DRIVER": "memory",
        "S3DB_CACHE_MAX_SIZE": "1000",
        "S3DB_CACHE_TTL": "300000",
        "S3DB_VERBOSE": "false",
        "S3DB_COSTS_ENABLED": "true"
      }
    }
  }
}
```

#### Step 3: Restart Claude Desktop

After saving the configuration:
1. Completely quit Claude Desktop (not just close the window)
2. Restart Claude Desktop
3. The MCP server should start automatically

#### Step 4: Test Your Setup

In Claude Desktop, test with these commands:

```javascript
// 0. FIRST: Learn about s3db.js features (NEW!)
"Can you help me learn about s3db.js? What features are available?"
// Or ask specific questions:
"How do I use partitions?"
"What plugins are available?"
"How do I configure caching?"

// 1. Test connection
"Can you connect to the S3DB database and show me the status?"

// 2. Create a resource
"Please create a new resource called 'users' with these fields:
- name (string, required)
- email (string, required, unique)
- age (number)
- active (boolean, default true)"

// 3. Insert data
"Insert a new user with name 'John Doe', email 'john@example.com', age 30"

// 4. Query data
"Show me all users in the database"

// 5. Check statistics
"Can you show me the database statistics including cache hits and S3 costs?"
```

> 💡 **Pro Tip**: Before performing any operations, ask questions using the documentation tools! Example: *"How do I create resources with partitions?"* or *"What's the best caching strategy?"*

---

## 📋 Table of Contents

- [🚀 Quick Start with Claude Desktop](#-quick-start-with-claude-desktop)
- [💾 Alternative Installation Methods](#-alternative-installation-methods)
- [⚙️ Configuration Examples](#️-configuration-examples)
- [🛠️ Available Tools](#️-available-tools)
- [📖 Command Line Examples](#-command-line-examples)
- [🗂️ Partitions & Performance](#️-partitions--performance)
- [🐳 Docker Deployment](#-docker-deployment)
- [🔧 Advanced Configuration](#-advanced-configuration)
- [🔒 Security](#-security)
- [🚨 Troubleshooting](#-troubleshooting)

---

## 💾 Alternative Installation Methods

### Option 1: NPX (Recommended)
```bash
# Streamable HTTP transport (remote clients) - Default port: 17500
npx -y s3db-mcp --transport=http

# STDIO transport (local clients, default)
npx -y s3db-mcp
# or explicitly:
npx -y s3db-mcp --transport=stdio
```

**Note**: The `-y` flag automatically confirms package installation without prompting.

**Transport Options**:
- **stdio** (default): For local integration (Claude Desktop, VS Code, etc.) - no network port required
- **http**: For remote access via Streamable HTTP - runs on port 17500

### Option 2: Global Installation
```bash
npm install -g s3db-mcp
s3db-mcp --transport=http  # For remote access
# or
s3db-mcp  # stdio (default)
```

### Option 3: Docker
```bash
docker run -p 17500:17500 -e S3DB_CONNECTION_STRING="s3://key:secret@bucket/db" s3db-mcp
```

### Option 4: Standalone Server
```bash
# Start the server (it will run in the foreground)
npx -y s3db-mcp --transport=http

# With environment variables
cat > s3db-mcp.env << EOF
S3DB_CONNECTION_STRING=s3://ACCESS_KEY:SECRET_KEY@bucket-name/databases/myapp
S3DB_CACHE_ENABLED=true
S3DB_CACHE_DRIVER=memory
S3DB_CACHE_MAX_SIZE=1000
EOF

env $(cat s3db-mcp.env | xargs) npx -y s3db-mcp --transport=http
```

### Option 5: Background Process
```bash
# Using nohup (Linux/macOS)
nohup npx -y s3db-mcp --transport=http > s3db-mcp.log 2>&1 &
echo $! > s3db-mcp.pid

# To stop later
kill $(cat s3db-mcp.pid)
```

### Option 6: Using PM2 Process Manager
```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start npx --name "s3db-mcp" -- -y s3db-mcp --transport=http

# View logs
pm2 logs s3db-mcp

# Stop/restart
pm2 stop s3db-mcp
pm2 restart s3db-mcp
```

---

## ⚙️ Configuration Examples

### 🏠 Local Development with MinIO

```json
{
  "mcpServers": {
    "s3db-local": {
      "command": "npx",
      "args": ["-y", "s3db-mcp", "--transport=http"],
      "env": {
        "S3DB_CONNECTION_STRING": "http://minioadmin:minioadmin123@localhost:9000/dev-bucket?forcePathStyle=true",
        "S3DB_VERBOSE": "true",
        "S3DB_CACHE_ENABLED": "true",
        "S3DB_COSTS_ENABLED": "false",
        "NODE_ENV": "development"
      }
    }
  }
}
```

### ☁️ Production with AWS S3

```json
{
  "mcpServers": {
    "s3db-prod": {
      "command": "npx",
      "args": ["-y", "s3db-mcp", "--transport=http"],
      "env": {
        "S3DB_CONNECTION_STRING": "s3://prod-data-bucket/databases/main",
        "AWS_REGION": "us-east-1",
        "AWS_ACCESS_KEY_ID": "AKIA...",
        "AWS_SECRET_ACCESS_KEY": "wJal...",
        "S3DB_CACHE_DRIVER": "filesystem",
        "S3DB_CACHE_DIRECTORY": "/var/cache/s3db",
        "S3DB_CACHE_TTL": "1800000",
        "S3DB_PASSPHRASE": "your-strong-passphrase-here",
        "S3DB_VERSIONING_ENABLED": "true",
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 🌊 DigitalOcean Spaces

```json
{
  "mcpServers": {
    "s3db-do": {
      "command": "npx",
      "args": ["-y", "s3db-mcp", "--transport=http"],
      "env": {
        "S3DB_CONNECTION_STRING": "https://DO_ACCESS_KEY:DO_SECRET_KEY@nyc3.digitaloceanspaces.com/space-name/databases/app",
        "S3_ENDPOINT": "https://nyc3.digitaloceanspaces.com",
        "S3DB_CACHE_ENABLED": "true"
      }
    }
  }
}
```

### 🔧 Multiple Environments

```json
{
  "mcpServers": {
    "s3db-dev": {
      "command": "npx",
      "args": ["-y", "s3db-mcp", "--transport=http", "--port=17500"],
      "env": {
        "S3DB_CONNECTION_STRING": "http://minioadmin:minioadmin123@localhost:9000/dev-bucket?forcePathStyle=true"
      }
    },
    "s3db-staging": {
      "command": "npx",
      "args": ["-y", "s3db-mcp", "--transport=http", "--port=17501"],
      "env": {
        "S3DB_CONNECTION_STRING": "s3://staging-bucket/databases/staging",
        "AWS_REGION": "us-east-1"
      }
    },
    "s3db-prod": {
      "command": "npx",
      "args": ["-y", "s3db-mcp", "--transport=http", "--port=17502"],
      "env": {
        "S3DB_CONNECTION_STRING": "s3://prod-bucket/databases/production",
        "AWS_REGION": "us-east-1",
        "S3DB_CACHE_DRIVER": "filesystem"
      }
    }
  }
}
```

## ⚙️ Configuration Reference

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
| `MCP_TRANSPORT` | `stdio` | Transport method | `http`, `stdio` | `http` for remote access, `stdio` for local (default) |

#### **Transport Modes Explained**

- **Streamable HTTP** (remote access):
  - Best for: Remote AI clients, web-based integrations, multi-client scenarios
  - Protocol: HTTP/HTTPS with Streamable HTTP transport
  - URL format: `http://localhost:17500/mcp`
  - Health check: `http://localhost:17500/health`
  - Features: CORS enabled, stateless mode, browser-compatible

- **STDIO (Standard Input/Output)** (default, local):
  - Best for: Claude Desktop, VS Code, local CLI tools, shell scripts
  - Protocol: JSON-RPC over stdin/stdout
  - No network port required
  - Features: Fastest, most secure for local use

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

#### **Understanding Connection String Protocols**

S3DB supports **two connection string formats** depending on your storage provider:

| Format | Use For | Authentication |
|--------|---------|----------------|
| `s3://` | **AWS S3 only** | IAM roles, AWS credentials, or inline keys |
| `http://` or `https://` | **Non-AWS S3-compatible services** (MinIO, DigitalOcean, Backblaze, Wasabi) | Inline credentials required |

**⚠️ Important**: While `s3://` works for AWS S3, non-AWS services should use `http://` or `https://` for clarity and to specify the endpoint directly.

#### **Connection String Anatomy**

**AWS S3 Format:**
```
s3://[ACCESS_KEY:SECRET_KEY@]BUCKET[/PATH][?PARAMS]
```

**Non-AWS Format:**
```
http(s)://[ACCESS_KEY:SECRET_KEY@]ENDPOINT/BUCKET[/PATH][?PARAMS]
```

Components:
- `ACCESS_KEY:SECRET_KEY` - Optional inline credentials (required for non-AWS)
- `BUCKET` - S3 bucket name or Space name
- `ENDPOINT` - Full hostname for non-AWS services
- `PATH` - Optional path prefix for organization
- `PARAMS` - Query parameters (e.g., `forcePathStyle=true` for MinIO)

#### **Real-World Examples**

**AWS S3 (use `s3://` protocol):**
```bash
# Production with IAM role (recommended - no inline credentials)
S3DB_CONNECTION_STRING="s3://my-prod-bucket/databases/main"
# Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables

# Development with inline credentials
S3DB_CONNECTION_STRING="s3://AKIA...:wJal...@my-dev-bucket/databases/dev"
```

**MinIO (use `http://` or `https://`):**
```bash
# Local development
S3DB_CONNECTION_STRING="http://minioadmin:minioadmin123@localhost:9000/dev-bucket?forcePathStyle=true"

# Production MinIO with HTTPS
S3DB_CONNECTION_STRING="https://ACCESS_KEY:SECRET_KEY@minio.example.com/bucket-name/databases/app?forcePathStyle=true"
```

**DigitalOcean Spaces (use `https://`):**
```bash
S3DB_CONNECTION_STRING="https://DO_ACCESS_KEY:DO_SECRET_KEY@nyc3.digitaloceanspaces.com/space-name/databases/prod"
# Also set: S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
```

**Backblaze B2 (use `https://`):**
```bash
S3DB_CONNECTION_STRING="https://KEY_ID:APP_KEY@s3.us-west-002.backblazeb2.com/bucket-name/db"
```

**Wasabi (use `https://`):**
```bash
S3DB_CONNECTION_STRING="https://ACCESS_KEY:SECRET_KEY@s3.wasabisys.com/bucket-name/databases/app"
```

**LocalStack (use `http://` for testing):**
```bash
S3DB_CONNECTION_STRING="http://test:test@localhost:4566/test-bucket/db?forcePathStyle=true"
```

### 📁 Complete Configuration Examples

#### **Development Setup (.env)**

```bash
# Server
NODE_ENV=development
MCP_SERVER_PORT=17500
MCP_TRANSPORT=http

# S3DB - MinIO local development
S3DB_CONNECTION_STRING=http://minioadmin:minioadmin123@localhost:9000/dev-bucket/db?forcePathStyle=true
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
MCP_TRANSPORT=http

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
npx -y s3db-mcp [OPTIONS]

# Transport selection
npx -y s3db-mcp --transport=http      # Web clients (default)
npx -y s3db-mcp --transport=stdio    # CLI/pipe communication

# Network configuration
npx -y s3db-mcp --host=0.0.0.0 --port=17500

# Override environment variables
npx -y s3db-mcp --transport=http \
  --host=127.0.0.1 \
  --port=18000

# Combined with environment variables
S3DB_CONNECTION_STRING="s3://..." \
S3DB_CACHE_DRIVER=filesystem \
npx -y s3db-mcp --transport=http

# Debug mode with verbose output
S3DB_VERBOSE=true \
NODE_ENV=development \
npx -y s3db-mcp --transport=stdio
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
Transport: http
Port: 17500
Cache: memory (1000 items, 5 min TTL)
Costs tracking: enabled
Connected to: s3://my-bucket/databases/main
Ready for connections...
```

---

## 🛠️ Available Tools

### 📖 Documentation & Discovery

> **🎯 START HERE: Use these tools to learn about s3db.js before doing anything else!**

**NEW**: Built-in AI-powered documentation assistant - ask questions in natural language!

| Tool | Description | Parameters |
|------|-------------|------------|
| `s3dbQueryDocs` | **Search s3db.js documentation** - Ask ANY question about features, plugins, configuration, troubleshooting, or best practices. Returns relevant documentation sections with code examples. | `query` (string - your question), `maxResults?` (number, default: 5) |
| `s3dbListTopics` | **List all available topics** - Browse 54+ documentation topics organized by 8 categories (core, operations, plugins, performance, etc.) | - |

#### 💡 When to Use These Tools

**Use `s3dbQueryDocs` whenever you need to:**
- ✅ Learn how to use any feature ("How do I use partitions?")
- ✅ Understand configuration options ("What are the CachePlugin memory limits?")
- ✅ Find best practices ("What is the best partitioning strategy?")
- ✅ Troubleshoot issues ("How do I fix orphaned partitions?")
- ✅ Compare options ("Memory cache vs filesystem cache?")
- ✅ Get code examples ("How do I create a resource with geo partitions?")

**Use `s3dbListTopics` when you want to:**
- ✅ See what features/plugins are available
- ✅ Browse documentation by category
- ✅ Discover capabilities you didn't know existed

#### 📚 Example Queries

```javascript
// === LEARNING ABOUT FEATURES ===
await agent.callTool('s3dbQueryDocs', {
  query: 'How do I use the CachePlugin?'
});
// → Returns: CachePlugin documentation with memory/filesystem config examples

await agent.callTool('s3dbQueryDocs', {
  query: 'What plugins are available?'
});
// → Returns: List of all 8+ plugins with descriptions

await agent.callTool('s3dbQueryDocs', {
  query: 'How do I create partitioned resources?'
});
// → Returns: Partition configuration examples and best practices

// === CONFIGURATION & SETUP ===
await agent.callTool('s3dbQueryDocs', {
  query: 'What are the CachePlugin memory limits?'
});
// → Returns: Configuration table with maxSize, TTL, memory options

await agent.callTool('s3dbQueryDocs', {
  query: 'How do I configure filesystem cache?'
});
// → Returns: Filesystem cache setup with directory and compression options

// === BEST PRACTICES ===
await agent.callTool('s3dbQueryDocs', {
  query: 'What is the best partitioning strategy?'
});
// → Returns: Partition patterns and performance considerations

await agent.callTool('s3dbQueryDocs', {
  query: 'Should I use memory or filesystem cache?'
});
// → Returns: Cache strategy guide with use cases

// === TROUBLESHOOTING ===
await agent.callTool('s3dbQueryDocs', {
  query: 'How do I fix orphaned partitions?'
});
// → Returns: Complete recovery workflow with code examples

await agent.callTool('s3dbQueryDocs', {
  query: 'What does PartitionError mean?'
});
// → Returns: Error explanation and solutions

// === BROWSING TOPICS ===
await agent.callTool('s3dbListTopics');
// → Returns: All 54+ topics organized by category
//   Categories: core, operations, partitioning, plugins, performance, mcp, advanced, troubleshooting
```

#### 🎯 What You'll Get Back

When you call `s3dbQueryDocs`, you receive:
```javascript
{
  success: true,
  found: true,
  query: "How do I use the CachePlugin?",
  resultCount: 3,  // Total matching files
  showing: 3,      // Files returned
  results: [
    {
      file: "docs/plugins/cache.md",
      relevanceScore: 1250,  // Higher = more relevant
      sections: [
        {
          header: "## Configuration",
          content: "... code examples and explanations ..."
        },
        {
          header: "## Usage Journey",
          content: "... step-by-step guide ..."
        }
      ]
    }
    // ... more results
  ]
}
```

#### 📊 Documentation Coverage

The search covers **ALL** s3db.js documentation:
- ✅ **Core Guides**: CLAUDE.md, README.md, schema.md, client.md, mcp.md
- ✅ **8+ Plugins**: cache, geo, audit, replicator, backup, costs, metrics, fulltext
- ✅ **Performance**: Benchmarks, partitions, encoding, compression guides
- ✅ **45+ Examples**: e01-e45 covering all features
- ✅ **Total**: 27 markdown files, 54+ indexed topics

#### 🚀 Benefits for AI Agents

| Benefit | Description | Impact |
|---------|-------------|--------|
| **Self-learning** | AI agents can learn on demand without manual prompts | Reduces prompt engineering time by 80% |
| **Natural language** | Ask questions like you would ask a human | No need to know documentation structure |
| **Always up-to-date** | Searches live documentation files | Always get current information |
| **Fast integration** | Learn features as you need them | Reduces onboarding from hours to minutes |
| **Contextual help** | Get relevant sections, not entire files | Saves token usage and time |

#### 💡 Pro Tips

1. **Start with `s3dbListTopics`** to see what's available
2. **Ask specific questions** for better results ("How do I..." vs "Tell me about...")
3. **Use before connecting** to learn setup and configuration
4. **Use during development** to learn features on-demand
5. **Use for troubleshooting** to find recovery workflows

> **Remember**: These tools are specifically designed to help AI agents integrate with s3db.js quickly. Use them liberally!

---

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

## 📖 Command Line Examples

### 📝 Basic CRUD Operations

```bash
# Connect to database
"Please connect to the S3DB database using the connection string: s3://my-bucket/databases/app"

# Create a blog posts resource
"Create a resource named 'posts' with fields: title (string, required), content (string), author (string), published (boolean), tags (array of strings)"

# Insert a blog post
"Insert a new post with title 'Getting Started with S3DB', content 'S3DB is amazing...', author 'john-doe', published true, and tags ['tutorial', 's3db']"

# Query posts
"List all published posts"
"Find posts by author 'john-doe'"
"Count how many posts have the tag 'tutorial'"

# Update a post
"Update the post with ID 'post-123' to set published to false"

# Delete a post
"Delete the post with ID 'post-456'"
```

### 🔍 Advanced Queries with Partitions

```bash
# Create partitioned resource
"Create an 'orders' resource with:
- orderId (string, required, unique)
- customerId (string, required)
- amount (number, required)
- status (string: pending, processing, shipped, delivered)
- region (string)
- orderDate (date)
And create partitions by status and region"

# Query specific partition
"Show me all orders with status 'pending' in the 'north' region"

# Count by partition
"Count orders by status"

# List with pagination
"List the first 10 orders, then get the next 10"
```

### 🛠️ Database Management

```bash
# Check connection status
"Show me the current database connection status"

# List all resources
"What resources/collections exist in the database?"

# Get statistics
"Show database statistics including cache performance and S3 costs"

# Clear cache
"Clear the cache for the 'users' resource"
"Clear all cached data"

# Bulk operations
"Insert 100 test users with random data"
"Delete all users where active is false"
```

### 📊 Reporting and Analytics

```bash
# Cost analysis
"How much are we spending on S3 operations today?"
"Show me a breakdown of S3 costs by operation type"

# Performance metrics
"What's the cache hit ratio?"
"Which queries are slowest?"

# Data overview
"Give me a summary of all resources: total records, size, last modified"
"Which partitions have the most data?"
```

## 📖 API Usage Examples

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
  s3db-mcp:
    image: s3db-mcp:latest
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - S3DB_CONNECTION_STRING=s3://bucket/databases/prod
      - MCP_TRANSPORT=http
      - MCP_SERVER_PORT=17500
    ports:
      - "17500:8000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:17500/health"]
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
# - Health Check: http://localhost:17500/health
```

### Docker Environment Variables

All the configuration variables mentioned above can be used in Docker:

```bash
docker run -p 17500:8000 \
  -e S3DB_CONNECTION_STRING="s3://key:secret@bucket/db" \
  -e S3DB_VERBOSE=true \
  -e S3DB_PARALLELISM=20 \
  -e MCP_TRANSPORT=http \
  s3db-mcp
```

---

## 🤖 AI Agent Integration

### Claude Desktop Integration

1. **Locate config file:**
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. **For STDIO transport (recommended for local use):**
```json
{
  "mcpServers": {
    "s3db": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "s3db-mcp"],
      "env": {
        "S3DB_CONNECTION_STRING": "s3://bucket/databases/myapp"
      }
    }
  }
}
```

3. **For Streamable HTTP transport (remote server):**
```json
{
  "mcpServers": {
    "s3db": {
      "transport": "streamable-http",
      "url": "http://localhost:17500/mcp"
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
      "url": "http://localhost:17500/mcp"
    }
  }
}
```

### AI Agent Usage Rules

#### 🎯 STEP 0: Learn About s3db.js First (MOST IMPORTANT!)

> **⚠️ ALWAYS start by using the documentation tools before attempting any operations!**

**📖 Use Documentation Tools First:**
1. **`s3dbQueryDocs`** - Ask ANY question about features you want to use:
   ```javascript
   // Before creating resources, ask:
   "How do I create a resource with partitions?"
   "What attributes can I use in schema?"

   // Before implementing caching, ask:
   "What is the best caching strategy?"
   "How do I configure the CachePlugin?"

   // Before working with geospatial data, ask:
   "How do I use the GeoPlugin?"
   "What's the best way to query locations?"

   // When you encounter errors, ask:
   "How do I fix orphaned partitions?"
   "What does ValidationError mean?"
   ```

2. **`s3dbListTopics`** - Browse all available features:
   ```javascript
   // See what's available before starting
   await agent.callTool('s3dbListTopics');
   // Returns: 54+ topics in 8 categories
   ```

**Why this matters:**
- ✅ Learn the correct way to use features from the start
- ✅ Avoid common mistakes and anti-patterns
- ✅ Discover features you didn't know existed
- ✅ Save time by not reinventing solutions
- ✅ Get code examples and best practices

---

#### STEP 1: Connect to Database

**Before any database task:**
1. Always use `dbConnect` first to establish connection (cache and costs tracking are enabled by default)
2. Use `dbStatus` to verify connection and see resources
3. Use `dbListResources` to see available collections

**Example flow:**
```javascript
// 1. Learn how to connect (if needed)
await agent.callTool('s3dbQueryDocs', {
  query: 'How do I connect to s3db?'
});

// 2. Connect to database
await agent.callTool('dbConnect', {
  connectionString: 's3://...',
  enableCache: true,
  enableCosts: true
});

// 3. Verify connection
await agent.callTool('dbStatus');
```

---

#### STEP 2: For Data Operations

**For data operations:**
1. **Ask documentation first** if you're unsure how to do something
2. Use `resourceExists` to check if documents exist before operations
3. Prefer batch operations (`resourceInsertMany`, `resourceGetMany`) for efficiency
4. Use partitions for performance when querying large datasets
5. Always use pagination (`resourceList` with `limit`/`offset`) for large results

**Example flow:**
```javascript
// 1. Learn about the feature first
await agent.callTool('s3dbQueryDocs', {
  query: 'How do I create partitioned resources?'
});

// 2. Create resource based on documentation
await agent.callTool('dbCreateResource', {
  name: 'locations',
  attributes: { ... },
  partitions: { ... }  // Using what you learned from docs
});

// 3. Insert data
await agent.callTool('resourceInsert', { ... });
```

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

## 🔧 Advanced Usage

### 🔄 Auto-restart on Failure

Using systemd (Linux):
```ini
# /etc/systemd/system/s3db-mcp.service
[Unit]
Description=S3DB MCP Server
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser
ExecStart=/usr/bin/npx -y s3db-mcp --transport=http
Restart=always
RestartSec=10
Environment="S3DB_CONNECTION_STRING=s3://..."

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable s3db-mcp
sudo systemctl start s3db-mcp
sudo systemctl status s3db-mcp
```

### 🔐 Secure Credential Management

Instead of hardcoding credentials:

**Option 1: Use AWS Credentials File**
```json
{
  "mcpServers": {
    "s3db": {
      "command": "npx",
      "args": ["-y", "s3db-mcp", "--transport=http"],
      "env": {
        "S3DB_CONNECTION_STRING": "s3://bucket/databases/app",
        "AWS_PROFILE": "production"
      }
    }
  }
}
```

**Option 2: Use Environment Variables**
```bash
# Set in your shell profile
export S3DB_CONNECTION_STRING="s3://..."
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
```

```json
{
  "mcpServers": {
    "s3db": {
      "command": "npx",
      "args": ["s3db-mcp", "--transport=http"]
      // No env section - uses system environment
    }
  }
}
```

### 🎯 Performance Optimization

For production workloads:
```json
{
  "mcpServers": {
    "s3db-optimized": {
      "command": "npx",
      "args": ["-y", "s3db-mcp", "--transport=http"],
      "env": {
        "S3DB_PARALLELISM": "20",
        "S3DB_CACHE_DRIVER": "filesystem",
        "S3DB_CACHE_DIRECTORY": "/mnt/ssd/s3db-cache",
        "S3DB_CACHE_MAX_SIZE": "10000",
        "S3DB_CACHE_TTL": "3600000",
        "NODE_ENV": "production"
      }
    }
  }
}
```

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

### ❌ Common Issues and Solutions

#### 1. MCP Server Not Starting

**Issue**: Claude Desktop can't connect to MCP server

**Solution**:
```bash
# Check if port is already in use
lsof -i :17500  # macOS/Linux
netstat -an | findstr :17500  # Windows

# Use a different port
{
  "mcpServers": {
    "s3db": {
      "command": "npx",
      "args": ["-y", "s3db-mcp", "--transport=http", "--port=18000"],
      "env": {
        "MCP_SERVER_PORT": "18000"
      }
    }
  }
}
```

#### 2. Connection String Issues

**Issue**: "Invalid connection string" error

**Solution**:
```bash
# Test connection string directly
export S3DB_CONNECTION_STRING="s3://..."
npx -y s3db-mcp --transport=http

# Common fixes:
# 1. URL-encode special characters in credentials
# 2. Add forcePathStyle=true for MinIO
# 3. Ensure bucket exists
```

#### 3. Permission Errors

**Issue**: "Access Denied" when accessing S3

**Solution**:
```json
{
  "env": {
    // Ensure credentials are correct
    "AWS_ACCESS_KEY_ID": "your-key",
    "AWS_SECRET_ACCESS_KEY": "your-secret",
    "AWS_REGION": "correct-region"
  }
}
```

#### 4. Cache Not Working

**Issue**: Slow performance, no cache hits

**Solution**:
```json
{
  "env": {
    "S3DB_CACHE_ENABLED": "true",  // Must be string "true"
    "S3DB_CACHE_DRIVER": "memory",
    "S3DB_CACHE_MAX_SIZE": "5000",  // Increase size
    "S3DB_CACHE_TTL": "600000"      // 10 minutes
  }
}
```

### 🔍 Debugging

Enable verbose logging:
```json
{
  "mcpServers": {
    "s3db": {
      "command": "npx",
      "args": ["-y", "s3db-mcp", "--transport=http"],
      "env": {
        "S3DB_VERBOSE": "true",
        "NODE_ENV": "development",
        "DEBUG": "true"
      }
    }
  }
}
```

View MCP logs in Claude Desktop:
1. Open Developer Tools: `Cmd+Option+I` (Mac) or `Ctrl+Shift+I` (Windows)
2. Go to Console tab
3. Filter for "mcp" messages

### S3 Access Issues

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
s3db-mcp --transport=http

# Docker
docker run -e S3DB_VERBOSE=true s3db-mcp
```

### Health Monitoring

```bash
# Check server health
curl http://localhost:17500/health

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

### 🎉 Success Indicators

You know your setup is working when:
1. ✅ Claude Desktop shows "Connected to s3db" in the MCP status
2. ✅ You can run database commands without errors
3. ✅ Cache statistics show hits after repeated queries
4. ✅ Cost tracking shows S3 operation counts

### 💡 Pro Tips

1. **Start simple**: Test with MinIO locally before using AWS S3
2. **Monitor costs**: Use `dbGetStats` regularly to track S3 expenses
3. **Optimize partitions**: Design partitions based on query patterns
4. **Cache wisely**: Filesystem cache survives restarts, memory cache is faster
5. **Use batch operations**: `insertMany` is much faster than multiple `insert` calls

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

## 📚 Additional Resources

- [S3DB Documentation](https://github.com/forattini-dev/s3db.js)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [Claude Desktop Downloads](https://claude.ai/download)
- [GitHub Issues](https://github.com/forattini-dev/s3db.js/issues)
- [NPM Package](https://www.npmjs.com/package/s3db-mcp)

Need help? Check the [Troubleshooting](#troubleshooting) section or file an issue on [GitHub](https://github.com/forattini-dev/s3db.js/issues).

---

## 📄 License

This project is licensed under the same license as the parent S3DB project.

---

<p align="center">
  <strong>🎉 Ready to supercharge your AI agents with persistent data storage!</strong><br>
  <em>Start building with S3DB MCP Server today</em>
</p>