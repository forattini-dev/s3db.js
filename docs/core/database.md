# Database

The `Database` class is the main entry point for s3db.js. It manages connections, resources, and plugins.

## Quick Start

```javascript
import { Database } from 's3db.js';

// Using connection string
const db = new Database({
  connectionString: 's3://ACCESS_KEY:SECRET_KEY@mybucket?region=us-east-1'
});

await db.connect();

// Create a resource
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    name: 'string|required',
    age: 'number|optional'
  }
});

// Use the resource
await users.insert({ email: 'john@example.com', name: 'John', age: 30 });
```

## Constructor Options

```javascript
const db = new Database({
  // Connection (choose one)
  connectionString: 'string',           // Recommended
  // OR individual params:
  bucket: 'string',
  region: 'string',
  accessKeyId: 'string',
  secretAccessKey: 'string',
  endpoint: 'string',                   // For MinIO, DigitalOcean, etc.

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent',
  logger: PinoLogger,                   // Custom Pino instance
  loggerOptions: { level, ... },        // Pino options

  // Performance
  executorPool: {
    concurrency: 10,                    // Parallel operations
    retries: 3,
    retryDelay: 1000,
    timeout: 30000,
    autotune: { ... }                   // Auto-tuning config
  },

  // Security
  passphrase: 'string',                 // For 'secret' field encryption
  bcryptRounds: 10,                     // For password hashing

  // Behavior
  versioningEnabled: false,             // Enable S3 versioning integration
  strictValidation: true,               // Strict schema validation
  strictHooks: false,                   // Fail on hook errors
  disableResourceEvents: false,         // Disable event emission

  // Advanced
  cache: CacheConfig,                   // Global cache config
  plugins: [Plugin, ...],               // Plugins to install
  deferMetadataWrites: false,           // Debounce metadata writes
  metadataWriteDelay: 100,              // Debounce delay (ms)
  exitOnSignal: true,                   // Auto-cleanup on exit
});
```

## Connection Strings

See [Connection Strings](../reference/connection-strings.md) for full documentation.

| Protocol | Example | Client |
|----------|---------|--------|
| `s3://` | `s3://KEY:SECRET@bucket?region=us-east-1` | S3Client |
| `http://` | `http://KEY:SECRET@localhost:9000/bucket` | S3Client (MinIO) |
| `file://` | `file:///path/to/data` | FileSystemClient |
| `memory://` | `memory://mybucket/prefix` | MemoryClient |

## Core Methods

### Connection

```javascript
// Connect to storage
await db.connect();

// Check connection status
db.isConnected();  // boolean

// Disconnect (cleanup)
await db.disconnect();
```

### Resource Management

```javascript
// Create new resource
const resource = await db.createResource({
  name: 'users',
  attributes: { ... },
  behavior: 'body-overflow',
  timestamps: true,
  partitions: { ... }
});

// Get existing resource
const users = await db.getResource('users');

// List all resources
const resources = db.listResources();  // string[]

// Access via proxy (shorthand)
const users = db.resources.users;
```

### Metadata

```javascript
// Upload metadata to S3 (s3db.json)
await db.uploadMetadataFile();

// Download metadata from S3
await db.downloadMetadataFile();

// Get current metadata
const metadata = db.getMetadata();
```

### Plugins

```javascript
// Install plugin
await db.usePlugin(new CachePlugin({ ... }), 'cache');

// Get plugin instance
const cache = db.getPlugin('cache');

// List installed plugins
const plugins = Object.keys(db.pluginRegistry);
```

### Global Coordinator

For distributed coordination across multiple processes:

```javascript
// Get or create coordinator for namespace
const coordinator = await db.getGlobalCoordinator('default');

// Check leadership
const isLeader = await coordinator.isLeader();
const leader = await coordinator.getLeader();

// Get active workers
const workers = await coordinator.getActiveWorkers();

// Listen for leadership changes
coordinator.on('leader:changed', ({ previousLeader, newLeader, epoch }) => {
  console.log(`New leader: ${newLeader}`);
});
```

## Events

Database extends `SafeEventEmitter`:

```javascript
db.on('resource:created', ({ resource }) => {
  console.log(`Resource created: ${resource.name}`);
});

db.on('plugin:installed', ({ plugin, name }) => {
  console.log(`Plugin installed: ${name}`);
});

db.on('error', (err) => {
  console.error('Database error:', err);
});
```

## Hooks

Database supports lifecycle hooks:

```javascript
const db = new Database({
  connectionString: '...',
  hooks: {
    beforeConnect: async () => { /* ... */ },
    afterConnect: async () => { /* ... */ },
    beforeDisconnect: async () => { /* ... */ },
    afterDisconnect: async () => { /* ... */ },
    beforeCreateResource: async ({ config }) => { /* ... */ },
    afterCreateResource: async ({ resource }) => { /* ... */ }
  }
});
```

## Client Access

```javascript
// Direct client access
const client = db.client;

// Get bucket info
console.log(db.bucket);      // Bucket name
console.log(db.keyPrefix);   // Key prefix (if any)

// Raw S3 operations
await client.putObject({ Key: 'custom/key', Body: 'data' });
```

## Child Loggers

Create scoped loggers for components:

```javascript
const resourceLogger = db.getChildLogger('MyResource');
resourceLogger.info('Resource initialized');
```

## Process Management

Database automatically handles:

- **Exit signals**: Cleanup on SIGINT, SIGTERM
- **Memory cleanup**: Auto-remove event listeners
- **Connection pooling**: Reuse connections efficiently

```javascript
// Manual cleanup
await db.disconnect();

// Access process manager
const pm = db.processManager;
pm.registerCleanup('myHandler', async () => { ... });
```

## Example: Full Setup

```javascript
import { Database } from 's3db.js';
import { CachePlugin, TTLPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: process.env.S3_CONNECTION_STRING,
  logLevel: 'info',
  executorPool: { concurrency: 20 },
  passphrase: process.env.ENCRYPTION_KEY,
  plugins: [
    new CachePlugin({ driver: 'memory', ttl: 300000 }),
    new TTLPlugin({ defaultTTL: 86400000 })
  ]
});

await db.connect();

// Create resources
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    name: 'string|required',
    password: 'secret|required',
    status: 'string|default:active'
  },
  behavior: 'body-overflow',
  timestamps: true,
  partitions: {
    byStatus: { fields: { status: 'string' } }
  }
});

// Use the database
const user = await users.insert({
  email: 'alice@example.com',
  name: 'Alice',
  password: 'secret123'
});

console.log('User created:', user.id);

// Cleanup on shutdown
process.on('SIGTERM', async () => {
  await db.disconnect();
  process.exit(0);
});
```

## See Also

- [Resource](./resource.md) - CRUD operations
- [Schema](./schema.md) - Field types and validation
- [Behaviors](./behaviors.md) - 2KB metadata strategies
- [Connection Strings](../reference/connection-strings.md) - Connection formats
