# S3DB MCP Server

> **Complete documentation has been moved to [`docs/mcp.md`](../docs/mcp.md)**

## ⚡ Quick Start with npx (Recommended)

### For Claude CLI
```bash
# One command setup - no installation needed!
claude mcp add s3db \
  --transport stdio \
  -- npx -y s3db.js s3db-mcp --transport=stdio
```

### For Claude Desktop
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "s3db": {
      "command": "npx",
      "args": ["-y", "s3db.js", "s3db-mcp", "--transport=sse"],
      "env": {
        "S3DB_CONNECTION_STRING": "s3://ACCESS_KEY:SECRET_KEY@bucket/path"
      }
    }
  }
}
```

### Standalone Server
```bash
# Start HTTP server in background
npx s3db.js s3db-mcp --transport=sse
```

📖 **See [NPX_SETUP.md](./NPX_SETUP.md) for complete npx guide**

## Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "s3db": {
      "command": "npx",
      "args": ["s3db-mcp-server", "--transport=sse"],
      "env": {
        "S3DB_CONNECTION_STRING": "s3://ACCESS_KEY:SECRET_KEY@bucket/databases/myapp",
        "S3DB_CACHE_ENABLED": "true",
        "S3DB_COSTS_ENABLED": "true"
      }
    }
  }
}
```

## Available Tools (28 total)

### 🔌 Connection Management
- `dbConnect`, `dbDisconnect`, `dbStatus`

### 📦 Resource Management
- `dbCreateResource`, `dbListResources`, `dbInspectResource`

### 🔍 Debugging Tools
- `dbGetMetadata`, `resourceValidate`, `dbHealthCheck`, `resourceGetRaw`

### 📊 Query & Filtering
- `resourceQuery`, `resourceSearch`, `resourceList`, `resourceCount`

### 🔧 Partition Management
- `resourceListPartitions`, `resourceListPartitionValues`
- `dbFindOrphanedPartitions`, `dbRemoveOrphanedPartitions`

### ✏️ CRUD Operations
- `resourceInsert`, `resourceInsertMany`, `resourceGet`, `resourceGetMany`
- `resourceUpdate`, `resourceUpsert`, `resourceDelete`, `resourceDeleteMany`

### 🚀 Bulk Operations
- `resourceUpdateMany`, `resourceBulkUpsert`, `resourceDeleteAll`

### 💾 Export/Import
- `resourceExport`, `resourceImport`, `dbBackupMetadata`

### 📈 Monitoring
- `dbGetStats`, `resourceGetStats`, `cacheGetStats`, `dbClearCache`

## Full Documentation

For complete documentation including:
- Detailed tool descriptions and parameters
- Configuration examples for AWS, MinIO, DigitalOcean
- Docker deployment guides
- Performance optimization tips
- Troubleshooting guides
- Security best practices

**See [`docs/mcp.md`](../docs/mcp.md)**

## Environment Variables

```bash
# Connection
S3DB_CONNECTION_STRING=s3://key:secret@bucket/prefix

# Cache
S3DB_CACHE_ENABLED=true
S3DB_CACHE_DRIVER=memory  # or 'filesystem'
S3DB_CACHE_MAX_SIZE=1000
S3DB_CACHE_TTL=300000

# Server
MCP_TRANSPORT=sse
MCP_SERVER_HOST=0.0.0.0
MCP_SERVER_PORT=17500
```

## Resources

- [Full MCP Documentation](../docs/mcp.md)
- [S3DB Documentation](../README.md)
- [GitHub Repository](https://github.com/forattini-dev/s3db.js)
- [NPM Package](https://www.npmjs.com/package/s3db.js)
