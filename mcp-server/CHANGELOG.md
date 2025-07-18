# Changelog

All notable changes to the S3DB MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Additional tools for advanced S3DB features
- Performance monitoring and metrics
- Enhanced error handling and retry mechanisms

### Changed
- Improved documentation and examples

### Fixed
- Minor bug fixes and optimizations

## [1.0.0] - 2024-01-15

### Added
- **Core MCP Server Implementation**
  - Full Model Context Protocol support
  - SSE and STDIO transport methods
  - Comprehensive tool set for S3DB operations

- **Database Management Tools**
  - `dbConnect` - Connect to S3DB database
  - `dbDisconnect` - Disconnect from database
  - `dbStatus` - Get connection status and info
  - `dbCreateResource` - Create new resources/collections
  - `dbListResources` - List all available resources

- **Document Operations Tools**
  - `resourceInsert` - Insert single documents
  - `resourceInsertMany` - Batch insert multiple documents
  - `resourceGet` - Retrieve documents by ID
  - `resourceGetMany` - Batch retrieve multiple documents
  - `resourceUpdate` - Update existing documents
  - `resourceUpsert` - Insert or update documents
  - `resourceDelete` - Delete documents
  - `resourceDeleteMany` - Batch delete multiple documents

- **Query and Analytics Tools**
  - `resourceExists` - Check document existence
  - `resourceList` - List documents with pagination
  - `resourceListIds` - List document IDs
  - `resourceCount` - Count documents in resources
  - `resourceGetAll` - Retrieve all documents (with warnings)
  - `resourceDeleteAll` - Delete all documents (with confirmation)

- **Advanced Features**
  - Schema validation and enforcement
  - Partition support for data organization
  - Timestamp management (createdAt/updatedAt)
  - Multiple behavior modes (user-managed, body-only, etc.)
  - Field-level encryption support
  - Connection string parsing for multiple S3 providers

- **Docker Support**
  - Complete Docker container support
  - Docker Compose with MinIO and LocalStack
  - Multi-stage builds for optimization
  - Health check endpoints
  - Non-root user security

- **Development Tools**
  - Comprehensive test suite with mock responses
  - Makefile with development commands
  - Environment configuration templates
  - Multiple S3 provider examples (AWS, MinIO, DigitalOcean)

- **Documentation**
  - Comprehensive README with examples
  - Cursor rules for AI agent integration
  - Configuration examples for popular MCP clients
  - Security best practices and IAM policies
  - Troubleshooting guides

- **NPM Package**
  - Global installation support via `npm install -g`
  - NPX support for instant usage
  - Binary executable (`s3db-mcp`)
  - Package distribution ready

### Technical Implementation
- **Node.js 18+ support** with ES modules
- **Error handling** with detailed error responses
- **Environment configuration** via dotenv
- **Health monitoring** with dedicated health check endpoint
- **Graceful shutdown** handling
- **Cross-platform compatibility** (Linux, macOS, Windows)

### Integration Support
- **Claude Desktop** - Full SSE transport support
- **Cursor IDE** - Complete integration with rules
- **STDIO clients** - Desktop application support
- **Custom MCP clients** - Standard protocol compliance

### Security Features
- **IAM role support** for AWS credentials
- **Environment variable protection** for sensitive data
- **Non-root Docker execution** for security
- **CORS handling** for web-based clients
- **Input validation** and sanitization

### Performance Optimizations
- **Batch operations** for improved throughput
- **Connection pooling** and reuse
- **Pagination** for large datasets
- **Streaming support** for large documents
- **Configurable parallelism** for S3 operations

## [0.1.0] - 2024-01-01

### Added
- Initial project structure
- Basic MCP server skeleton
- S3DB integration proof of concept

---

## Release Notes

### Version 1.0.0 - Production Ready

This is the first production-ready release of the S3DB MCP Server. It provides:

- **Complete MCP Implementation**: Full compliance with Model Context Protocol specification
- **Comprehensive S3DB Support**: All major S3DB features exposed through MCP tools
- **Production Ready**: Docker support, health checks, and monitoring
- **Developer Friendly**: Extensive documentation, examples, and development tools
- **Multi-Provider Support**: Works with AWS S3, MinIO, DigitalOcean Spaces, and LocalStack

### Breaking Changes from Beta

- Tool naming convention changed to camelCase (e.g., `db_connect` → `dbConnect`)
- Response format standardized with consistent error handling
- Environment variables renamed for clarity (see migration guide)

### Migration from Beta

1. Update tool names in your MCP client configurations
2. Review and update environment variable names
3. Update Docker configurations if using containers
4. Test connections with new health check endpoints

### Known Issues

- Health check endpoint uses port+1 (8001 by default) due to MCP transport limitations
- Large document support requires adequate memory allocation
- Batch operations have practical limits based on S3 request size limits

### Future Roadmap

- **v1.1.0**: Enhanced query capabilities and filtering
- **v1.2.0**: Real-time subscriptions and webhooks
- **v1.3.0**: Advanced analytics and aggregation tools
- **v2.0.0**: GraphQL interface and advanced querying

---

## Support and Contributions

- **Issues**: [GitHub Issues](https://github.com/forattini-dev/s3db.js/issues)
- **Discussions**: [GitHub Discussions](https://github.com/forattini-dev/s3db.js/discussions)
- **Contributing**: See [Contributing Guide](https://github.com/forattini-dev/s3db.js/blob/main/CONTRIBUTING.md)

## License

This project is licensed under the same license as the parent S3DB project.