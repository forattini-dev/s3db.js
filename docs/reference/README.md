# Reference Documentation

Complete reference documentation for s3db.js tools and APIs.

## Contents

### [CLI Reference](cli.md)

Command-line interface for managing s3db databases.

```bash
s3db list                           # List resources
s3db query users                    # Query records
s3db insert users -d '{"name":"John"}'  # Insert record
s3db export users -o users.json     # Export data
```

### [MCP Server](mcp.md)

Model Context Protocol server for AI tool integration.

```bash
# For Claude Desktop / local tools
s3db-mcp --transport=stdio

# For HTTP/SSE clients
s3db-mcp --transport=http --port=17500
```

### [Connection Strings](connection-strings.md)

Complete reference for connection string formats.

```bash
# AWS S3
s3://KEY:SECRET@bucket?region=us-east-1

# MinIO
http://KEY:SECRET@localhost:9000/bucket

# Memory (testing)
memory://bucket/prefix

# Filesystem
file:///path/to/data
```

### [Errors Reference](errors.md)

All error codes, causes, and solutions.

```javascript
import { ResourceNotFound, ValidationError, DatabaseError } from 's3db.js';

try {
  await resource.get('non-existent-id');
} catch (error) {
  if (error instanceof ResourceNotFound) {
    console.log('Record not found');
  }
}
```

## Quick Links

- [Core Documentation](/core/) - Database, Resource, Schema
- [Plugins](/plugins/) - 36+ plugins
- [Examples](/examples/) - 177 working examples
- [AWS Costs](/aws/) - Pricing and limits
