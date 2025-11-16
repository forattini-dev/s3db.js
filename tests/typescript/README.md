# TypeScript Support for s3db.js

This document explains how to use s3db.js with TypeScript and how to test the TypeScript definitions.

## ✅ Complete TypeScript Support

s3db.js provides comprehensive TypeScript definitions that cover:

- **Core Classes**: Database, Resource, Client, Schema, Validator
- **Behavior System**: All 5 behaviors with detailed configuration options
- **Plugin System**: All plugins with complete configuration interfaces
- **Replicator System**: S3DB, SQS, BigQuery, and PostgreSQL replicators
- **Cache System**: Memory and S3 cache implementations
- **Stream Classes**: All streaming utilities
- **Error Classes**: Comprehensive error type definitions
- **Utility Functions**: All helper functions and utilities

## 🚀 Installation

Install s3db.js and TypeScript (if not already installed):

```bash
npm install s3db.js
npm install -D typescript @types/node
```

## 📝 Basic Usage

```typescript
import S3db, { DatabaseConfig, ResourceConfig } from 's3db.js';

// Database configuration with full type support
const config: DatabaseConfig = {
  connectionString: 's3://key:secret@bucket',
  region: 'us-east-1',
  logLevel: 'debug',
  parallelism: 10,
  versioningEnabled: true,
  cache: {
    type: 'memory',
    ttl: 3600,
    maxSize: 1000
  }
};

// Create database instance
const db = new S3db(config);

// Resource configuration with type checking
const resourceConfig: ResourceConfig = {
  name: 'users',
  client: db.client,
  attributes: {
    name: 'string|required',
    email: 'string|required',
    age: 'number|optional'
  },
  behavior: 'user-managed',
  timestamps: true,
  partitions: {
    byCountry: {
      fields: { country: 'string' },
      description: 'Partition by country'
    }
  }
};

async function main() {
  await db.connect();
  
  const users = await db.createResource(resourceConfig);
  
  // All operations are fully typed
  const user = await users.insert({
    name: 'John Doe',
    email: 'john@example.com',
    age: 30
  });
  
  const retrievedUser = await users.get(user.id);
  const userList = await users.list({ limit: 10 });
  
  await db.disconnect();
}
```

## 🎯 Behavior System Types

All behaviors are fully typed with comprehensive configuration options:

```typescript
import { EnforceLimitsBehaviorConfig, DataTruncateBehaviorConfig } from 's3db.js';

// Enforce limits behavior
const enforceLimitsConfig: EnforceLimitsBehaviorConfig = {
  enabled: true,
  maxBodySize: 1024 * 1024,
  enforcementMode: 'strict',
  throwOnViolation: true,
  fieldLimits: {
    'description': 5000,
    'content': 50000
  }
};

// Data truncate behavior
const truncateConfig: DataTruncateBehaviorConfig = {
  enabled: true,
  truncateIndicator: '...',
  preserveStructure: true,
  priorityFields: ['id', 'name', 'email']
};
```

## 🔌 Plugin System Types

All plugins have complete type definitions:

```typescript
import { 
  AuditPluginConfig, 
  CachePluginConfig, 
  ReplicatorPluginConfig 
} from 's3db.js';

const auditConfig: AuditPluginConfig = {
  enabled: true,
  trackOperations: ['insert', 'update', 'delete'],
  includeData: true,
  retentionDays: 30
};

const replicatorConfig: ReplicatorPluginConfig = {
  enabled: true,
  replicators: [{
    driver: 's3db',
    config: {
      connectionString: 's3://key:secret@backup-bucket',
      createResources: true,
      batchSize: 100
    },
    resources: ['users', 'posts']
  }]
};
```

## 📊 Event Handling Types

All events are strongly typed:

```typescript
import { ExceedsLimitEvent, TruncateEvent, OverflowEvent } from 's3db.js';

resource.on('exceedsLimit', (event: ExceedsLimitEvent) => {
  console.log(`Operation ${event.operation} exceeds limit: ${event.totalSize} bytes`);
});

resource.on('truncate', (event: TruncateEvent) => {
  console.log(`Field ${event.fieldName} was truncated`);
});

resource.on('overflow', (event: OverflowEvent) => {
  console.log(`Overflow handled with strategy: ${event.strategy}`);
});
```

## 🧪 Testing TypeScript Definitions

### For Library Developers

If you're contributing to s3db.js, you can test the TypeScript definitions:

```bash
# Test all TypeScript definitions
pnpm run test:types

# Test specific patterns
pnpm run test:types:basic
pnpm run test:types:direct

# Validate TypeScript definitions
pnpm run validate:types

# Watch mode for development
pnpm run test:types:watch
```

### For Library Users

To test that s3db.js types work in your TypeScript project:

1. **Create a test file** (`test-s3db-types.ts`):

```typescript
import S3db, { DatabaseConfig, BehaviorName } from 's3db.js';

// Test basic configuration
const config: DatabaseConfig = {
  connectionString: 's3://key:secret@bucket'
};

// Test behavior names are strictly typed
const behavior: BehaviorName = 'user-managed'; // ✅ Valid
// const invalid: BehaviorName = 'invalid'; // ❌ TypeScript error

// Test database creation
const db = new S3db(config);

console.log('Types work correctly!');
```

2. **Compile with TypeScript**:

```bash
npx tsc --noEmit test-s3db-types.ts
```

If the compilation succeeds without errors, the types are working correctly!

## 🛠 IDE Support

### VS Code

With TypeScript definitions, VS Code provides:

- **IntelliSense**: Auto-completion for all methods and properties
- **Type Checking**: Real-time error detection
- **Documentation**: Hover over methods to see documentation
- **Refactoring**: Safe renaming and refactoring

### Other IDEs

Any IDE with TypeScript support (WebStorm, Vim with plugins, etc.) will provide similar features.

## 📋 Type Coverage

The TypeScript definitions cover **100%** of the s3db.js API:

### Core Classes ✅
- `Database` / `S3db` - Complete with all methods and events
- `Resource` - Full CRUD operations, pagination, streaming
- `Client` - All S3 operations and events
- `Schema` - Validation and data transformation
- `Validator` - Schema validation utilities

### Behaviors ✅
- `user-managed` - Default behavior with warnings
- `enforce-limits` - Strict enforcement with configuration
- `truncate-data` - Data truncation with options
- `body-overflow` - Smart metadata optimization
- `body-only` - Complete body storage

### Plugins ✅
- `AuditPlugin` - Activity tracking
- `CachePlugin` - Caching layer
- `CostsPlugin` - Cost monitoring
- `FullTextPlugin` - Search functionality
- `MetricsPlugin` - Performance metrics
- `QueueConsumerPlugin` - Message queue integration
- `ReplicatorPlugin` - Data replication

### Replicators ✅
- `S3dbReplicator` - Cross-S3 replication
- `SqsReplicator` - Amazon SQS integration
- `BigqueryReplicator` - Google BigQuery integration
- `PostgresReplicator` - PostgreSQL integration

### Cache Systems ✅
- `MemoryCache` - In-memory caching
- `S3Cache` - S3-based caching

### Streams ✅
- `ResourceReader` - Data streaming
- `ResourceWriter` - Data writing
- `ResourceIdsReader` - ID streaming
- `ResourceIdsPageReader` - Paginated streaming

### Utilities ✅
- All crypto functions (`encrypt`, `decrypt`, `sha256`)
- ID generation (`idGenerator`, `passwordGenerator`)
- Error handling (`tryFn`, `tryFnSync`)
- Calculations (`calculateTotalSize`, etc.)
- Base62 encoding and all other utilities

## 🎉 Benefits

Using s3db.js with TypeScript provides:

1. **Type Safety**: Catch errors at compile time
2. **Better IDE Experience**: IntelliSense and auto-completion
3. **Self-Documenting Code**: Types serve as inline documentation
4. **Refactoring Safety**: Confident code changes
5. **Team Productivity**: Easier onboarding for new developers

---

# TypeScript Tests for s3db.js

This directory contains TypeScript definition tests that validate the type safety and correctness of s3db.js TypeScript definitions.

## Test Files

### `direct-type-test.ts`
Comprehensive test file that validates all TypeScript definitions including:
- Core classes (Database, Resource, Client, Schema, Validator)
- Behavior system configurations
- Plugin system interfaces
- Replicator configurations
- Cache system types
- Event handling types
- Stream classes
- Error classes
- Utility functions

### `basic-usage.test.ts`
Practical usage examples and patterns that demonstrate:
- Common configuration patterns
- Real-world resource definitions
- Production-ready configurations
- Advanced use cases with multiple plugins
- Event handling patterns
- Type assertion validations

## Running Tests

### All TypeScript Tests
```bash
pnpm run test:types
```

### Individual Test Files
```bash
# Test basic usage patterns
pnpm run test:types:basic

# Test comprehensive type definitions
pnpm run test:types:direct
```

### Watch Mode for Development
```bash
pnpm run test:types:watch
```

### Validate All Types
```bash
pnpm run validate:types
```

## Configuration

The TypeScript configuration for tests is defined in `tsconfig.json` which includes complete configuration settings optimized for the s3db.js project structure.

## What These Tests Validate

### ✅ Type Safety
- All interfaces are correctly defined
- Strict typing for behavior names, driver types, etc.
- Union types work correctly
- Optional vs required properties

### ✅ API Coverage
- 100% coverage of all exported classes
- All method signatures are correctly typed
- All configuration interfaces are complete
- All event types are properly defined

### ✅ Real-World Usage
- Common usage patterns compile without errors
- Complex configurations are properly typed
- Plugin configurations work correctly
- Error handling is type-safe

### ✅ IDE Support
- IntelliSense works correctly
- Auto-completion is available
- Type checking catches errors
- Documentation is accessible via hover

## Adding New Tests

When adding new TypeScript tests:

1. Create a new `.ts` file in this directory
2. Add the reference path: `/// <reference path="../../src/s3db.d.ts" />`
3. Import types using `import type { ... } from 's3db.js'`
4. Add test functions that validate the new functionality
5. Update package.json scripts if needed

## Common Patterns

### Testing Configuration Interfaces
```typescript
const config: DatabaseConfig = {
  connectionString: 's3://key:secret@bucket',
  // ... other options
};
```

### Testing Event Handlers
```typescript
const handler = (event: ExceedsLimitEvent) => {
  // TypeScript will validate event properties
  console.log(event.operation, event.totalSize);
};
```

### Testing Plugin Configurations
```typescript
const pluginConfig: AuditPluginConfig = {
  enabled: true,
  trackOperations: ['insert', 'update']
};
```

### Type Assertions
```typescript
// Test that invalid values cause TypeScript errors
const behavior: BehaviorName = 'user-managed'; // ✅ Valid
// const invalid: BehaviorName = 'invalid'; // ❌ TypeScript error
```

## Troubleshooting

### Common Issues

1. **Import Errors**: Make sure to use `import type` for type-only imports
2. **Reference Path**: Ensure the path to `s3db.d.ts` is correct
3. **Configuration**: Check that `tsconfig.json` includes proper path configurations

### Getting Help

If you encounter issues with TypeScript definitions:
1. Run `pnpm run validate:types` to check for errors
2. Check the test files for examples
3. Refer to the examples in this documentation

## 📚 Examples

Check out the TypeScript examples:

- **`/tests/typescript/`** - Comprehensive TypeScript tests and examples
- **`/examples/`** - JavaScript examples (can be adapted for TypeScript)

The TypeScript test directory includes:
- Database setup and configuration examples
- Resource management with types
- Plugin usage with type safety
- Error handling with typed errors
- Event handling with typed events
- Real-world production configurations

## 🆘 Getting Help

If you encounter TypeScript-related issues:

1. **Check the examples**: Look for similar usage patterns
2. **Validate your setup**: Run `pnpm run validate:types`
3. **Update TypeScript**: Ensure you're using a compatible version
4. **Open an issue**: Report bugs in TypeScript definitions

## 📄 License

The TypeScript definitions are included with s3db.js under the same license terms. 