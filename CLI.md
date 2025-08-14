# S3DB CLI Documentation

The S3DB CLI provides an easy way to start MCP (Model Context Protocol) servers and test connections.

## Installation

Install globally via npm:
```bash
npm install -g s3db.js
```

Or use with npx (no installation required):
```bash
npx s3db.js --help
```

## Available Commands

### `mcp` (alias: `server`)
Start the S3DB MCP server for integration with Claude Desktop and other MCP clients.

```bash
s3db.js mcp [options]
```

**Options:**
- `-p, --port <port>` - Port for SSE transport (default: 8000)
- `-h, --host <host>` - Host address to bind (default: 0.0.0.0)  
- `-t, --transport <type>` - Transport type: stdio or sse (default: stdio)
- `-c, --connection-string <string>` - S3DB connection string (auto-detected if not provided)
- `-v, --verbose` - Enable verbose logging

**Examples:**
```bash
# Start with stdio transport (for MCP clients)
s3db.js mcp

# Start with SSE transport on port 8888
s3db.js mcp --transport sse --port 8888

# Start with explicit connection string
s3db.js mcp -c "s3://key:secret@bucket?region=us-east-1"
```

### `test`
Test S3DB connection and basic operations.

```bash
s3db.js test [options]
```

**Options:**
- `-c, --connection-string <string>` - S3DB connection string (auto-detected if not provided)
- `-v, --verbose` - Enable verbose output

**Examples:**
```bash
# Test with auto-detected connection
s3db.js test

# Test with explicit connection string
s3db.js test -c "s3://key:secret@bucket"

# Test with verbose output
s3db.js test --verbose
```

### `config`
Display current configuration and auto-detected settings.

```bash
s3db.js config
```

Shows:
- Package information
- Connection string detection status
- Environment variables
- Configuration file locations

### `examples`
Show usage examples and common patterns.

```bash
s3db.js examples
```

## Connection String Auto-Detection

The CLI automatically detects connection strings from multiple sources in this priority order:

1. **Environment Variables:**
   - `S3DB_CONNECTION_STRING`
   - `S3_CONNECTION_STRING` 
   - `DATABASE_URL`

2. **AWS Environment Variables:**
   - `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_S3_BUCKET` + `AWS_REGION`

3. **MCP Configuration File:**
   - `~/.config/mcp/config.json`

4. **Local .env File:**
   - `.env` in current directory

## Connection String Formats

### AWS S3
```
s3://accessKey:secretKey@bucketName?region=us-east-1
```

### MinIO
```  
http://accessKey:secretKey@localhost:9000/bucketName
```

### DigitalOcean Spaces
```
https://accessKey:secretKey@nyc3.digitaloceanspaces.com/bucketName
```

### Other S3-Compatible Services
```
https://accessKey:secretKey@endpoint/bucketName
```

## Environment Variables

Set these environment variables for auto-detection:

```bash
# Direct connection string
export S3DB_CONNECTION_STRING="s3://key:secret@bucket"

# Or individual AWS credentials
export AWS_ACCESS_KEY_ID="your_access_key"
export AWS_SECRET_ACCESS_KEY="your_secret_key" 
export AWS_S3_BUCKET="your_bucket"
export AWS_REGION="us-east-1"
```

## MCP Integration

### Claude Desktop
Add to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "s3db": {
      "command": "npx",
      "args": ["s3db.js", "mcp"],
      "env": {
        "S3DB_CONNECTION_STRING": "s3://key:secret@bucket"
      }
    }
  }
}
```

### SSE Mode for Web Clients
```bash
s3db.js mcp --transport sse --port 8000
```

Server will be available at: `http://localhost:8000/sse`

## Executable Names

The package provides multiple executable names:

- `s3db.js` - Main CLI (recommended)
- `s3db` - Short alias
- `s3db-mcp` - Legacy MCP server direct access

## Error Handling

The CLI provides helpful error messages for common issues:

- Invalid connection string formats
- Missing connection strings  
- Connection failures
- Server startup issues

Use `--verbose` flag for detailed error information and stack traces.

## Examples

```bash
# Quick start with auto-detection
s3db.js mcp

# Custom port and verbose logging
s3db.js mcp -t sse -p 9000 -v

# Test connection
s3db.js test

# View current configuration  
s3db.js config

# See all examples
s3db.js examples
```