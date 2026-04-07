# DatabaseManager

`DatabaseManager` orchestrates multiple named `Database` instances, each with its own connection string and storage backend. You get a unified API to create and look up resources across different backends.

**When to use it:** The `Database` class binds to a single connection string. When you need resources spread across different backends (e.g., main data in S3, analytics in RedDB, cache in SQLite), `DatabaseManager` coordinates them without changes to the core.

If all your resources live on the same backend, use `Database` directly.

## Quick Start

```javascript
import { DatabaseManager } from 's3db.js';

const manager = new DatabaseManager({
  defaults: { logLevel: 'info', security: { passphrase: 'my-secret' } },
  connections: {
    primary: {
      connectionString: 's3://KEY:SECRET@main-bucket?region=us-east-1',
      plugins: [new CachePlugin()],
    },
    analytics: { connectionString: 'reddb://localhost:8080' },
    cache: { connectionString: 'sqlite:///tmp/cache.db' },
  },
  default: 'primary',
});

await manager.connect();

const users = await manager.createResource({
  name: 'users',
  connection: 'primary',
  attributes: { email: 'email|required', name: 'string' },
});

const events = await manager.createResource({
  name: 'events',
  connection: 'analytics',
  attributes: { type: 'string', data: 'json' },
});

// Access any resource by name, regardless of backend
const user = await manager.resource('users').insert({ email: 'alice@acme.com', name: 'Alice' });
const event = await manager.resource('events').insert({ type: 'signup', data: { userId: user.id } });

await manager.disconnect();
```

## Constructor Options

```javascript
const manager = new DatabaseManager({
  // Shared defaults — applied to all connections (connection-specific values override)
  defaults: {
    logLevel: 'silent',
    security: { passphrase: 'my-secret' },
    strictValidation: true,
  },

  // Required: at least one named connection
  connections: {
    primary: {
      connectionString: 's3://...',
      plugins: [new CachePlugin(), new MetricsPlugin()],
    },
    analytics: {
      connectionString: 'reddb://...',
      plugins: [new CostsPlugin()],
      logLevel: 'debug',  // overrides defaults.logLevel for this connection
    },
    cache: {
      connectionString: 'sqlite:///tmp/cache.db',
      // no plugins — inherits defaults only
    },
  },

  // Optional: which connection to use when none is specified (defaults to first)
  default: 'primary',
});
```

Each value in `connections` is a standard `DatabaseOptions` object -- the same options you pass to `new Database()`. See [Database](/core/database.md) for all available options.

### Defaults vs Connection Options

`defaults` sets shared configuration applied to every connection. Connection-specific values override defaults.

| Option | Where to set | Why |
|--------|-------------|-----|
| `logLevel`, `security`, `strictValidation` | `defaults` | Same across all backends |
| `connectionString` | per-connection | Each backend has its own |
| `plugins` | per-connection | Each backend has different needs |
| `client` | per-connection | Pre-built client for a specific backend |

`defaults` deliberately excludes `connectionString`, `client`, and `plugins` — these are always per-connection.

## Core Methods

### Connection Lifecycle

```javascript
// Connect all databases in parallel
await manager.connect();

// Check if all databases are connected
manager.isConnected();  // boolean

// Disconnect all databases in parallel
await manager.disconnect();
```

### Creating Resources

Pass a `connection` field to target a specific backend. Without it, the resource goes to the default connection.

```javascript
// Explicit backend
const users = await manager.createResource({
  name: 'users',
  connection: 'primary',
  attributes: { email: 'email|required', name: 'string' },
});

// Uses default connection
const settings = await manager.createResource({
  name: 'settings',
  attributes: { key: 'string', value: 'json' },
});
```

Resource names must be globally unique across all connections. Creating a resource with a name that already exists on a different connection throws a `DatabaseError`.

### Looking Up Resources

```javascript
// By name (resolves across all connections)
const users = manager.resource('users');
const events = manager.resource('events');

// Merged view of all resources
const all = manager.resources;
// { users: Resource, events: Resource, settings: Resource }

// All resource names
manager.resourceNames;  // ['users', 'events', 'settings']
```

### Accessing Databases Directly

```javascript
// Get a Database instance by name
const analyticsDb = manager.connection('analytics');
analyticsDb.resources;  // only resources on this connection

// Default connection
manager.defaultConnection;  // Database instance

// All connection names
manager.connectionNames;  // ['primary', 'analytics', 'cache']

// Which connection owns a resource
manager.getConnectionForResource('events');  // 'analytics'
```

## Events

`DatabaseManager` extends `EventEmitter`. Events from child databases are forwarded in two forms:

```javascript
// Prefixed with connection name
manager.on('analytics:db:resource-created', (resourceName) => {
  console.log(`Resource created on analytics: ${resourceName}`);
});

// Generic form with connection name as first argument
manager.on('db:resource-created', (connectionName, resourceName) => {
  console.log(`Resource created on ${connectionName}: ${resourceName}`);
});
```

### Forwarded Events

| Event | Arguments |
|-------|-----------|
| `db:connected` | (connectionName) |
| `db:disconnected` | (connectionName) |
| `db:resource-created` | (connectionName, resourceName) |
| `db:resource-updated` | (connectionName, resourceName) |
| `db:resource-deleted` | (connectionName, resourceName) |
| `db:metadata-uploaded` | (connectionName) |

## TypeScript Interfaces

```typescript
interface DatabaseManagerOptions {
  connections: Record<string, DatabaseOptions>;
  defaults?: Omit<DatabaseOptions, 'connectionString' | 'client' | 'plugins'>;
  default?: string;
}

interface ManagerCreateResourceConfig extends CreateResourceConfig {
  connection?: string;  // Which connection to use (defaults to manager's default)
}
```

All three types (`DatabaseManager`, `DatabaseManagerOptions`, `ManagerCreateResourceConfig`) are exported from `s3db.js`.

## Design Details

- **Full isolation** -- each `Database` has its own metadata file (`s3db.json`), plugins, client, and executor pool. There is no cross-contamination between connections.
- **Plugins are per-connection** -- configure plugins inside each connection's `DatabaseOptions`, not on the manager itself.
- **Parallel lifecycle** -- `connect()` and `disconnect()` run across all databases in parallel via `Promise.all`.
- **Lazy index** -- the resource-to-connection index is rebuilt on `connect()` and updated lazily on `resource()` lookups. Calling `disconnect()` clears it.

## Example: Multi-Backend Setup

```javascript
import { Database, DatabaseManager, CachePlugin, TTLPlugin } from 's3db.js';

const manager = new DatabaseManager({
  connections: {
    main: {
      connectionString: process.env.S3_CONNECTION_STRING,
      security: { passphrase: process.env.ENCRYPTION_KEY },
      plugins: [
        new CachePlugin({ driver: 'memory', ttl: 300000 }),
      ],
    },
    ephemeral: {
      connectionString: 'file:///tmp/s3db-ephemeral',
      plugins: [
        new TTLPlugin({ defaultTTL: 3600000 }),
      ],
    },
  },
  default: 'main',
});

await manager.connect();

// Persistent data on S3
const users = await manager.createResource({
  name: 'users',
  connection: 'main',
  attributes: {
    email: 'email|required',
    name: 'string|required',
    password: 'password|required|min:8',
  },
  timestamps: true,
});

// Short-lived data on local filesystem
const sessions = await manager.createResource({
  name: 'sessions',
  connection: 'ephemeral',
  attributes: {
    userId: 'string|required',
    token: 'secret',
    expiresAt: 'datetime',
  },
});

// Both accessible through the same manager
const user = await manager.resource('users').insert({
  email: 'bob@acme.com',
  name: 'Bob',
  password: 'securepassword',
});

await manager.resource('sessions').insert({
  userId: user.id,
  token: 'session-token',
  expiresAt: new Date(Date.now() + 3600000),
});

// Cleanup
process.on('SIGTERM', async () => {
  await manager.disconnect();
  process.exit(0);
});
```

## See Also

- [Database](/core/database.md) -- Single-connection setup, constructor options, plugins
- [Resource](/core/resource.md) -- CRUD operations on resources
- [Connection Strings](/reference/connection-strings.md) -- Supported protocols and formats
