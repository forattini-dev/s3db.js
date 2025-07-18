# 🚀 S3DB MCP Server - Quick Start Guide

Get your AI agents connected to S3DB in under 5 minutes!

## 🎯 Instant Start (NPX)

```bash
# Start the MCP server instantly (no installation required)
npx s3db-mcp-server --transport=sse

# Server will be running at: http://localhost:8000/sse
```

## 🔧 Configure Your AI Client

### Claude Desktop
Edit your `claude_desktop_config.json`:
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

### Cursor IDE
Edit your MCP configuration:
```json
{
  "mcpServers": {
    "s3db": {
      "url": "http://localhost:8000/sse"
    }
  }
}
```

## 📝 Basic Usage

Your AI agent can now:

1. **Connect to S3DB**:
   ```javascript
   dbConnect({
     connectionString: "s3://YOUR_KEY:YOUR_SECRET@YOUR_BUCKET/databases/myapp"
   })
   ```

2. **Create a Resource**:
   ```javascript
   dbCreateResource({
     name: "users",
     attributes: {
       name: "string|required",
       email: "email|required|unique"
     },
     timestamps: true
   })
   ```

3. **Insert Data**:
   ```javascript
   resourceInsert({
     resourceName: "users",
     data: {
       name: "John Doe",
       email: "john@example.com"
     }
   })
   ```

4. **Query Data**:
   ```javascript
   resourceList({
     resourceName: "users",
     limit: 10
   })
   ```

## 🐳 Docker Quick Start

```bash
# 1. Clone and run with Docker Compose
git clone https://github.com/forattini-dev/s3db.js.git
cd s3db.js/mcp-server

# 2. Copy environment template
cp .env.example .env

# 3. Edit .env with your S3 configuration
# 4. Start with local MinIO for testing
docker compose --profile local-testing up
```

Access:
- **MCP Server**: http://localhost:8000/sse
- **MinIO Console**: http://localhost:9001 (admin/minioadmin)

## 🧪 Test Your Setup

```bash
# Test the mock functionality
node examples/test-mcp.js

# Show configuration examples
node examples/test-mcp.js --config
```

## 🔑 S3 Configuration Examples

### AWS S3
```env
S3DB_CONNECTION_STRING=s3://ACCESS_KEY:SECRET_KEY@bucket/databases/myapp
```

### MinIO (Local Development)
```env
S3DB_CONNECTION_STRING=s3://minioadmin:minioadmin@test-bucket/databases/dev?endpoint=http://localhost:9000&forcePathStyle=true
```

### DigitalOcean Spaces
```env
S3DB_CONNECTION_STRING=s3://DO_KEY:DO_SECRET@space-name/databases/prod?endpoint=https://nyc3.digitaloceanspaces.com
```

## 🛠️ Available Tools

| Category | Tools | Description |
|----------|-------|-------------|
| **Database** | `dbConnect`, `dbStatus`, `dbCreateResource` | Manage connections and resources |
| **Documents** | `resourceInsert`, `resourceGet`, `resourceUpdate`, `resourceDelete` | CRUD operations |
| **Queries** | `resourceList`, `resourceCount`, `resourceExists` | Data retrieval and analysis |
| **Batch** | `resourceInsertMany`, `resourceGetMany`, `resourceDeleteMany` | Bulk operations |

## 🔍 Next Steps

1. **Configure S3**: Set up your S3 bucket and credentials
2. **Test Connection**: Use `dbConnect` tool to verify setup
3. **Create Resources**: Define your data schemas
4. **Build Your AI App**: Start storing and querying data!

## 📚 Learn More

- [📖 Full Documentation](README.md)
- [🤖 AI Agent Rules](cursor_rules.md)
- [🔧 Configuration Guide](.env.example)
- [📋 Examples](examples/)

## ❓ Troubleshooting

### Connection Issues
```bash
# Check if server is running
curl http://localhost:8001/health

# View logs
docker compose logs -f s3db-mcp-server
```

### Common Problems
- **Port conflicts**: Change `MCP_SERVER_PORT` in .env
- **S3 access**: Verify your connection string and credentials
- **Docker issues**: Ensure Docker is running and ports are available

## 🤝 Support

- **Issues**: [GitHub Issues](https://github.com/forattini-dev/s3db.js/issues)
- **Discussions**: [GitHub Discussions](https://github.com/forattini-dev/s3db.js/discussions)

---

**Happy coding with S3DB and AI agents! 🎉**