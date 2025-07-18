# S3DB MCP Server Rules for AI Agents

## Before Starting Any Task

1. **Always connect first**: Use the `dbConnect` tool to establish a database connection before performing any operations.
2. **Check status**: Use the `dbStatus` tool to verify the connection and see available resources.
3. **List resources**: Use `dbListResources` to see existing collections before creating new ones.

## Database Connection Guidelines

### Initial Connection
- Always start with `dbConnect` using a proper S3DB connection string
- Connection string format: `s3://ACCESS_KEY:SECRET_KEY@BUCKET/databases/namespace`
- For IAM roles: `s3://BUCKET/databases/namespace`
- Include proper error handling for connection failures

### Connection Management
- Use `dbStatus` to check connection health
- Always `dbDisconnect` when finishing operations (optional but clean)
- Handle connection timeouts and retries gracefully

## Resource (Collection) Management

### Creating Resources
- Use `dbCreateResource` with descriptive names and proper schema
- Define clear attributes with validation rules (e.g., `"email": "email|required|unique"`)
- Consider enabling timestamps for audit trails
- Use partitions for large datasets and better organization
- Choose appropriate behaviors: `user-managed`, `body-only`, `body-overflow`, `enforce-limits`, `truncate-data`

### Schema Design Best Practices
- Define required fields explicitly with `|required`
- Use validation rules: `string|min:2|max:100`, `number|positive`, `email`, `date`
- Nested objects are supported: `{ profile: { firstName: "string", lastName: "string" } }`
- Use `secret` type for encrypted fields
- Mark fields as `|unique` when needed

## CRUD Operations

### Inserting Data
- Use `resourceInsert` for single documents
- Use `resourceInsertMany` for batch operations (more efficient)
- Validate data structure matches the schema before insertion
- Handle validation errors gracefully

### Retrieving Data
- Use `resourceGet` for single documents by ID
- Use `resourceGetMany` for multiple specific documents
- Use `resourceList` with pagination for browsing collections
- Use `resourceCount` to get dataset statistics
- Be cautious with `resourceGetAll` - only use for small datasets

### Updating Data
- Use `resourceUpdate` for partial updates
- Use `resourceUpsert` when you want insert-or-update behavior
- Always include the document ID for updates
- Handle cases where documents don't exist

### Deleting Data
- Use `resourceDelete` for single documents
- Use `resourceDeleteMany` for batch deletions
- Use `resourceDeleteAll` only with explicit confirmation (`confirm: true`)
- Consider soft deletes in production environments

## Pagination and Performance

### Efficient Data Access
- Always use pagination with `limit` and `offset` parameters
- Default limits: 100 for `resourceList`, 1000 for `resourceListIds`
- Use `resourceCount` to understand dataset size before listing
- Implement cursor-based pagination for large datasets

### Partitioning Strategy
- Create partitions for logical data organization
- Common partition patterns: by date, by category, by user
- Use partition filtering in queries for better performance
- Example: `partition: "byCategory", partitionValues: { category: "electronics" }`

## Error Handling

### Common Error Patterns
- **Connection errors**: Always check if database is connected
- **Resource not found**: Verify resource exists with `dbListResources`
- **Validation errors**: Check schema compliance before operations
- **Authentication errors**: Verify S3 credentials and permissions

### Graceful Degradation
- Provide meaningful error messages to users
- Suggest corrective actions when possible
- Log errors appropriately for debugging
- Implement retry logic for transient failures

## Data Organization Patterns

### Timestamping
- Enable `timestamps: true` for audit trails
- Automatic `createdAt` and `updatedAt` fields
- Use for tracking data lifecycle and changes

### Encryption
- Use `secret` field type for sensitive data
- Configure strong passphrases via `S3DB_PASSPHRASE`
- Consider field-level encryption for compliance

### Versioning
- Enable `versioningEnabled: true` for data history
- Useful for rollbacks and change tracking
- Consider storage implications for large datasets

## Performance Optimization

### Batch Operations
- Prefer `resourceInsertMany` over multiple `resourceInsert` calls
- Use `resourceGetMany` instead of multiple `resourceGet` calls
- Batch deletes with `resourceDeleteMany`

### Query Optimization
- Use partitions to reduce scan scope
- Implement proper pagination to avoid large result sets
- Cache frequently accessed data when possible
- Use `resourceExists` for existence checks instead of full retrieval

## Security Best Practices

### Access Control
- Use IAM roles instead of access keys when possible
- Implement least-privilege access policies
- Rotate credentials regularly
- Monitor access logs and usage patterns

### Data Protection
- Use strong encryption passphrases
- Enable S3 bucket encryption
- Implement proper backup strategies
- Consider data retention policies

## Development Workflows

### Local Development
- Use MinIO or LocalStack for local S3 simulation
- Test with small datasets before production deployment
- Validate schemas thoroughly in development
- Use verbose logging for debugging

### Production Deployment
- Use environment-specific connection strings
- Enable comprehensive monitoring and alerting
- Implement proper error logging and tracking
- Set up health checks and status monitoring

## Common Use Cases

### User Management System
```javascript
// Create users resource
await callTool('dbCreateResource', {
  name: 'users',
  attributes: {
    username: 'string|required|unique',
    email: 'email|required|unique',
    profile: {
      firstName: 'string|required',
      lastName: 'string|required'
    }
  },
  timestamps: true
});
```

### Content Management
```javascript
// Create posts with partitioning
await callTool('dbCreateResource', {
  name: 'posts',
  attributes: {
    title: 'string|required',
    content: 'string|required',
    status: 'string|enum:draft,published,archived'
  },
  partitions: {
    byStatus: { fields: { status: 'string' } }
  },
  timestamps: true
});
```

### E-commerce Inventory
```javascript
// Create products with validation
await callTool('dbCreateResource', {
  name: 'products',
  attributes: {
    sku: 'string|required|unique',
    name: 'string|required',
    price: 'number|positive|required',
    category: 'string|required',
    inStock: 'boolean'
  },
  partitions: {
    byCategory: { fields: { category: 'string' } }
  }
});
```

## Troubleshooting

### Connection Issues
1. Verify S3 credentials and permissions
2. Check bucket existence and access rights
3. Validate connection string format
4. Test network connectivity to S3 endpoint

### Performance Issues
1. Review query patterns and add partitions
2. Implement proper pagination
3. Check for large document sizes
4. Monitor S3 request patterns and costs

### Data Issues
1. Validate schema definitions
2. Check for data type mismatches
3. Review validation rules and constraints
4. Verify unique constraints aren't violated

## Best Practices Summary

1. **Always connect before operations**
2. **Use descriptive resource names and schemas**
3. **Implement proper error handling**
4. **Use pagination for large datasets**
5. **Enable timestamps for audit trails**
6. **Use partitions for organization**
7. **Batch operations when possible**
8. **Implement proper security practices**
9. **Test thoroughly in development**
10. **Monitor and log in production**

Remember: S3DB transforms S3 into a document database, so treat it with the same care and consideration you would any production database system.