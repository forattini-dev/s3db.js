# Guides

Practical guides for common s3db.js tasks and patterns.

## Available Guides

### [Getting Started](getting-started.md)

Complete tutorial from zero to production-ready database.

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 's3://KEY:SECRET@my-bucket?region=us-east-1'
});

await db.connect();

const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|email|required'
  }
});

await users.insert({ name: 'John', email: 'john@example.com' });
```

### [Performance Tuning](performance-tuning.md)

Optimize s3db.js for your workload.

**Key Topics:**
- Behavior selection for your data size
- Partitioning strategies for O(1) lookups
- Async partitions for faster writes
- Batch operations and streaming
- Caching strategies

### [Testing Strategies](testing-strategies.md)

Best practices for testing s3db.js applications.

```javascript
import { Database } from 's3db.js';

// Use MemoryClient for blazing-fast tests
const db = new Database({
  connectionString: 'memory://test-bucket/test-db'
});

// 100-1000x faster than real S3
// Zero network latency
// No AWS credentials needed
```

### [Security Best Practices](security-best-practices.md)

Secure your s3db.js deployment.

**Topics:**
- Field-level encryption with AES-256-GCM
- S3 server-side encryption
- IAM policies and bucket policies
- Protected fields in API responses
- Audit logging

### [Multi-Tenancy](multi-tenancy.md)

Patterns for multi-tenant applications.

**Approaches:**
- Namespace isolation (separate prefixes)
- Partition-based tenant isolation
- Cross-tenant queries and aggregations

### [Migration Guide v15 → v16](migration-v15-to-v16.md)

Upgrade path for major version changes.

## Quick Links

- [Core Documentation](/core/) - Database, Resource, Schema fundamentals
- [Storage Clients](/clients/) - S3, Memory, Filesystem clients
- [Plugins](/plugins/) - Extend functionality with 36+ plugins
- [Examples](/examples/) - 177 working examples
