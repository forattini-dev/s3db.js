# 🔌 WebSocket Plugin

> Real-time communication for s3db.js resources via WebSocket

[← Back to Plugins](../README.md) | [Configuration](./reference/configuration.md) | [Examples](./examples/README.md) | [FAQ](./faq.md)

---

## Documentation

| Document | Description |
|----------|-------------|
| **[Configuration Reference](./reference/configuration.md)** | Complete options reference |
| **[Client Protocol Guide](./guides/client-protocol.md)** | WebSocket message protocol |
| **[Authentication Guide](./guides/authentication.md)** | JWT, API Key, OIDC setup |
| **[Health Checks Guide](./guides/health-checks.md)** | Kubernetes-compatible health endpoints |
| **[Examples](./examples/README.md)** | Real-world use cases |
| **[FAQ](./faq.md)** | Frequently asked questions |

---

## TLDR

```javascript
import { Database, WebSocketPlugin } from 's3db.js';

const db = new Database({ connectionString: 'http://localhost:9000/bucket' });
await db.connect();

const wsPlugin = new WebSocketPlugin({
  port: 3001,
  auth: {
    drivers: [{ driver: 'jwt', config: { secret: 'my-secret' } }]
  },
  resources: {
    users: { protected: ['password'] },
    messages: true
  }
});

await db.usePlugin(wsPlugin);
// WebSocket server running at ws://localhost:3001
```

**Key Features:**
- Real-time subscriptions to resource changes (insert/update/delete)
- Multiple authentication methods (JWT, API Key, OIDC)
- Guards for row-level security
- Protected fields filtering
- Rate limiting & heartbeat
- Custom message publishing

**Performance:**
| Metric | Value |
|--------|-------|
| Concurrent connections | 10,000+ |
| Message latency | <5ms |
| Memory per connection | ~2KB |

---

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
3. [Configuration](#configuration)
4. [Authentication](#authentication)
5. [Resources](#resources)
6. [Client Protocol](#client-protocol)
7. [API Reference](#api-reference)
8. [Examples](#examples)
9. [Best Practices](#best-practices)
10. [FAQ](#faq)

---

## Installation

```bash
# Install peer dependencies
pnpm add ws jose

# Or with npm
npm install ws jose
```

**Peer Dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| `ws` | ^8.0.0 | WebSocket server implementation |
| `jose` | ^5.0.0 or ^6.0.0 | JWT token validation |

---

## Quick Start

### Basic Server

```javascript
import { Database, WebSocketPlugin } from 's3db.js';

const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/mybucket'
});

await db.connect();

// Create a resource
await db.createResource({
  name: 'messages',
  attributes: {
    content: 'string|required',
    author: 'string|required',
    channel: 'string|required'
  },
  timestamps: true
});

// Setup WebSocket plugin
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  resources: {
    messages: true // Enable real-time for this resource
  }
});

await db.usePlugin(wsPlugin);

console.log('WebSocket server running at ws://localhost:3001');
```

### Browser Client

```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.onopen = () => {
  // Subscribe to messages
  ws.send(JSON.stringify({
    type: 'subscribe',
    resource: 'messages',
    filter: { channel: 'general' }
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'event') {
    console.log(`New ${msg.event}:`, msg.data);
  }
};
```

---

## Configuration

### Full Configuration Reference

```javascript
const wsPlugin = new WebSocketPlugin({
  // Server settings
  port: 3001,                    // WebSocket port (default: 3001)
  host: '0.0.0.0',               // Bind address (default: '0.0.0.0')
  startupBanner: true,           // Log startup message (default: true)
  logLevel: 'info',              // Log level: 'silent'|'debug'|'info'|'warn'|'error'

  // Connection settings
  heartbeatInterval: 30000,      // Ping interval in ms (default: 30000)
  heartbeatTimeout: 10000,       // Pong timeout in ms (default: 10000)
  maxPayloadSize: 1024 * 1024,   // Max message size in bytes (default: 1MB)

  // Authentication
  auth: {
    required: true,              // Require auth for all connections (default: false)
    drivers: [
      {
        driver: 'jwt',
        config: {
          secret: 'my-secret',   // JWT secret for HS256
          // OR for RS256/OIDC:
          jwksUri: 'https://auth.example.com/.well-known/jwks.json',
          issuer: 'https://auth.example.com',
          audience: 'my-api'
        }
      },
      {
        driver: 'apiKey',
        config: {
          keys: {
            'sk_live_abc123': { id: 'user1', role: 'admin' },
            'sk_live_xyz789': { id: 'user2', role: 'user' }
          }
        }
      }
    ]
  },

  // Rate limiting
  rateLimit: {
    enabled: true,               // Enable rate limiting (default: false)
    windowMs: 60000,             // Window size in ms (default: 60000)
    maxRequests: 100             // Max requests per window (default: 100)
  },

  // CORS for HTTP upgrade
  cors: {
    enabled: true,               // Enable CORS (default: true)
    origin: '*'                  // Allowed origins (default: '*')
  },

  // Resource configuration
  resources: {
    users: {
      auth: ['admin'],           // Only admin role can access
      protected: ['password', 'apiToken'],  // Hidden fields
      events: ['insert', 'update', 'delete'],  // Events to broadcast
      guard: {
        list: async (user, ctx) => {
          if (user?.role === 'admin') return true;
          return { userId: user.id };  // Filter by ownership
        },
        get: async (user, ctx) => true,
        create: async (user, data) => user?.role === 'admin',
        update: async (user, ctx) => ctx.id === user?.id,
        delete: async (user, ctx) => user?.role === 'admin'
      }
    },
    messages: true,              // Simple enable (no restrictions)
    notifications: {
      events: ['insert']         // Only broadcast inserts
    }
  }
});
```

---

## Authentication

### JWT Authentication

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  auth: {
    required: true,
    drivers: [{
      driver: 'jwt',
      config: {
        secret: process.env.JWT_SECRET
      }
    }]
  },
  resources: { messages: true }
});

// Client connects with token in query string
const ws = new WebSocket('ws://localhost:3001?token=eyJhbGciOiJIUzI1NiIs...');

// Or via Authorization header (Node.js client)
const ws = new WebSocket('ws://localhost:3001', {
  headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIs...' }
});
```

### OIDC/OAuth2

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  auth: {
    drivers: [{
      driver: 'oidc',
      config: {
        issuer: 'https://auth0.example.com',
        clientId: 'my-client-id'
      }
    }]
  },
  resources: { users: true }
});
```

### API Key Authentication

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  auth: {
    drivers: [{
      driver: 'apiKey',
      config: {
        keys: {
          'api_key_123': { id: 'service1', role: 'service', scopes: ['read'] },
          'api_key_456': { id: 'service2', role: 'admin', scopes: ['read', 'write'] }
        }
      }
    }]
  },
  resources: { metrics: true }
});

// Client connects with API key
const ws = new WebSocket('ws://localhost:3001?token=api_key_123');
```

---

## Resources

### Resource Configuration

```javascript
resources: {
  // Simple enable - all operations allowed, all events broadcast
  messages: true,

  // Disable resource
  internal_logs: false,

  // Full configuration
  users: {
    // Role-based access
    auth: ['admin', 'user'],

    // Fields to hide from responses
    protected: ['password', 'apiToken', 'metadata.internal'],

    // Events to broadcast (default: all)
    events: ['insert', 'update', 'delete'],

    // Row-level security guards
    guard: {
      subscribe: async (user, filter) => {
        // Control who can subscribe
        return user?.role === 'admin' || filter?.userId === user?.id;
      },
      list: async (user, ctx) => {
        // Return filter object for non-admins
        if (user?.role === 'admin') return true;
        return { userId: user?.id };
      },
      get: async (user, ctx) => {
        return ctx.id === user?.id || user?.role === 'admin';
      },
      create: async (user, data) => {
        return user !== null;  // Authenticated users only
      },
      update: async (user, ctx) => {
        return ctx.id === user?.id || user?.role === 'admin';
      },
      delete: async (user, ctx) => {
        return user?.role === 'admin';
      }
    }
  }
}
```

---

## Client Protocol

### Message Format

All messages are JSON objects with a `type` field:

```typescript
interface Message {
  type: string;
  requestId?: string;  // Optional, echoed in response
  [key: string]: any;
}
```

### Connection Flow

```
Client                              Server
  |                                    |
  |--- WebSocket Connect ------------->|
  |<-- { type: 'connected', ... } -----|
  |                                    |
  |--- { type: 'subscribe', ... } ---->|
  |<-- { type: 'subscribed', ... } ----|
  |                                    |
  |<-- { type: 'event', ... } ---------|  (broadcast)
  |                                    |
  |--- { type: 'ping' } -------------->|
  |<-- { type: 'pong' } ---------------|
  |                                    |
```

### Client Messages

#### Subscribe to Resource

```javascript
// Subscribe to all changes
ws.send(JSON.stringify({
  type: 'subscribe',
  requestId: '1',
  resource: 'messages'
}));

// Subscribe with filter
ws.send(JSON.stringify({
  type: 'subscribe',
  requestId: '2',
  resource: 'messages',
  filter: { channel: 'general' },
  events: ['insert', 'update']
}));
```

#### Unsubscribe

```javascript
ws.send(JSON.stringify({
  type: 'unsubscribe',
  requestId: '3',
  resource: 'messages',
  filter: { channel: 'general' }
}));
```

#### CRUD Operations

```javascript
// Get single record
ws.send(JSON.stringify({
  type: 'get',
  requestId: '4',
  resource: 'users',
  id: 'user123'
}));

// List records
ws.send(JSON.stringify({
  type: 'list',
  requestId: '5',
  resource: 'messages',
  filter: { channel: 'general' },
  limit: 50,
  cursor: 'last-id'
}));

// Insert record
ws.send(JSON.stringify({
  type: 'insert',
  requestId: '6',
  resource: 'messages',
  data: { content: 'Hello!', channel: 'general' }
}));

// Update record
ws.send(JSON.stringify({
  type: 'update',
  requestId: '7',
  resource: 'messages',
  id: 'msg123',
  data: { content: 'Updated!' }
}));

// Delete record
ws.send(JSON.stringify({
  type: 'delete',
  requestId: '8',
  resource: 'messages',
  id: 'msg123'
}));
```

#### Custom Messages (Publish)

```javascript
// Publish to channel
ws.send(JSON.stringify({
  type: 'publish',
  requestId: '9',
  channel: 'notifications',
  message: { type: 'alert', text: 'New feature!' }
}));
```

### Server Messages

#### Connection Established

```javascript
{
  type: 'connected',
  clientId: 'abc123xyz',
  user: { id: 'user1', role: 'admin' },  // null if not authenticated
  timestamp: '2024-01-15T10:30:00.000Z'
}
```

#### Subscription Confirmed

```javascript
{
  type: 'subscribed',
  requestId: '1',
  resource: 'messages',
  filter: { channel: 'general' },
  events: ['insert', 'update', 'delete']
}
```

#### Resource Event (Broadcast)

```javascript
{
  type: 'event',
  event: 'insert',  // 'insert' | 'update' | 'delete'
  resource: 'messages',
  data: { id: 'msg456', content: 'Hello!', ... },
  timestamp: '2024-01-15T10:31:00.000Z'
}
```

#### Data Response

```javascript
{
  type: 'data',
  requestId: '4',
  resource: 'users',
  data: { id: 'user123', name: 'John', ... }
}

// List response
{
  type: 'data',
  requestId: '5',
  resource: 'messages',
  data: [{ id: 'msg1', ... }, { id: 'msg2', ... }],
  cursor: 'msg2'  // For pagination
}
```

#### Error Response

```javascript
{
  type: 'error',
  requestId: '4',
  code: 'NOT_FOUND',
  message: 'Record not found'
}
```

**Error Codes:**
| Code | Description |
|------|-------------|
| `INVALID_JSON` | Message is not valid JSON |
| `UNKNOWN_MESSAGE_TYPE` | Unknown message type |
| `RESOURCE_NOT_FOUND` | Resource not configured |
| `NOT_FOUND` | Record not found |
| `FORBIDDEN` | Access denied |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `INTERNAL_ERROR` | Server error |

---

## API Reference

### WebSocketPlugin

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | `number` | `3001` | WebSocket server port |
| `host` | `string` | `'0.0.0.0'` | Bind address |
| `logLevel` | `string` | `'info'` | Log level |
| `startupBanner` | `boolean` | `true` | Show startup message |
| `heartbeatInterval` | `number` | `30000` | Ping interval (ms) |
| `heartbeatTimeout` | `number` | `10000` | Pong timeout (ms) |
| `maxPayloadSize` | `number` | `1048576` | Max message size (bytes) |
| `auth` | `object` | `{}` | Authentication config |
| `rateLimit` | `object` | `{}` | Rate limiting config |
| `cors` | `object` | `{}` | CORS config |
| `resources` | `object` | `{}` | Resource configurations |

#### Methods

```javascript
// Get server info
wsPlugin.getServerInfo();
// Returns: { isRunning: true, port: 3001, clients: 42, ... }

// Get connected clients
wsPlugin.getClients();
// Returns: [{ id, user, subscriptions, connectedAt, metadata }]

// Broadcast to all clients
wsPlugin.broadcast({ type: 'announcement', message: 'Hello!' });

// Broadcast with filter
wsPlugin.broadcast(
  { type: 'alert', message: 'Admin only' },
  (client) => client.user?.role === 'admin'
);

// Send to specific client
wsPlugin.sendToClient('clientId123', { type: 'private', data: '...' });

// Broadcast to resource subscribers
wsPlugin.broadcastToResource('messages', { type: 'custom', data: '...' });

// Get metrics
wsPlugin.getMetrics();
// Returns: { connections, disconnections, messagesReceived, messagesSent, broadcasts, errors }
```

#### Events

```javascript
wsPlugin.on('plugin.started', ({ port, host }) => {
  console.log(`WebSocket server started on ${host}:${port}`);
});

wsPlugin.on('server.started', ({ port, host }) => {});
wsPlugin.on('server.stopped', () => {});

wsPlugin.on('client.connected', ({ clientId, user }) => {
  console.log(`Client ${clientId} connected`, user);
});

wsPlugin.on('client.disconnected', ({ clientId, code, reason }) => {
  console.log(`Client ${clientId} disconnected: ${reason}`);
});
```

---

## Examples

### Chat Application

```javascript
import { Database, WebSocketPlugin } from 's3db.js';

const db = new Database({ connectionString: process.env.DB_URL });
await db.connect();

await db.createResource({
  name: 'chat_messages',
  attributes: {
    roomId: 'string|required',
    userId: 'string|required',
    username: 'string|required',
    content: 'string|required|maxlength:2000',
    type: 'string|default:text'
  },
  timestamps: true,
  partitions: {
    byRoom: { fields: { roomId: 'string' } }
  }
});

const wsPlugin = new WebSocketPlugin({
  port: 3001,
  auth: {
    drivers: [{ driver: 'jwt', config: { secret: process.env.JWT_SECRET } }]
  },
  resources: {
    chat_messages: {
      guard: {
        subscribe: async (user, filter) => {
          // Users can only subscribe to rooms they're members of
          const membership = await checkRoomMembership(user.id, filter.roomId);
          return membership;
        },
        create: async (user, data) => {
          // Ensure userId matches authenticated user
          return data.userId === user.id;
        }
      }
    }
  }
});

await db.usePlugin(wsPlugin);
```

### Real-time Dashboard

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  resources: {
    metrics: {
      auth: ['admin', 'analyst'],
      events: ['insert'],  // Only broadcast new metrics
      protected: ['internalData']
    },
    alerts: {
      auth: ['admin'],
      events: ['insert', 'update']
    }
  }
});

// Server-side: push metrics
setInterval(async () => {
  await db.resources.metrics.insert({
    cpu: getCpuUsage(),
    memory: getMemoryUsage(),
    timestamp: new Date().toISOString()
  });
  // Automatically broadcast to all subscribed dashboard clients
}, 5000);
```

### Multi-tenant Application

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  auth: { required: true, drivers: [/* ... */] },
  resources: {
    documents: {
      guard: {
        subscribe: async (user, filter) => {
          // Force tenant filter
          return { ...filter, tenantId: user.tenantId };
        },
        list: async (user, ctx) => ({ tenantId: user.tenantId }),
        get: async (user, ctx) => {
          const doc = await db.resources.documents.get(ctx.id);
          return doc?.tenantId === user.tenantId;
        },
        create: async (user, data) => {
          data.tenantId = user.tenantId;  // Auto-set tenant
          return true;
        },
        update: async (user, ctx) => {
          const doc = await db.resources.documents.get(ctx.id);
          return doc?.tenantId === user.tenantId;
        },
        delete: async (user, ctx) => {
          const doc = await db.resources.documents.get(ctx.id);
          return doc?.tenantId === user.tenantId && user.role === 'admin';
        }
      }
    }
  }
});
```

---

## Best Practices

### Do's ✅

1. **Always authenticate in production**
   ```javascript
   auth: { required: true, drivers: [...] }
   ```

2. **Use guards for sensitive resources**
   ```javascript
   guard: {
     list: async (user) => ({ userId: user.id })
   }
   ```

3. **Filter sensitive fields**
   ```javascript
   protected: ['password', 'apiToken', 'internalMetadata']
   ```

4. **Enable rate limiting**
   ```javascript
   rateLimit: { enabled: true, maxRequests: 100 }
   ```

5. **Handle reconnection on client**
   ```javascript
   ws.onclose = () => setTimeout(connect, 1000);
   ```

### Don'ts ❌

1. **Don't expose internal resources**
   ```javascript
   // Bad: exposes all resources
   resources: Object.fromEntries(
     Object.keys(db.resources).map(k => [k, true])
   )
   ```

2. **Don't skip validation in guards**
   ```javascript
   // Bad: trusts client data
   guard: { create: async () => true }
   ```

3. **Don't forget to unsubscribe**
   ```javascript
   // Client should unsubscribe before disconnect
   ws.send(JSON.stringify({ type: 'unsubscribe', resource: 'messages' }));
   ```

---

## FAQ

### How do I handle connection errors?

```javascript
ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = (event) => {
  if (event.code !== 1000) {
    // Abnormal close, reconnect
    setTimeout(connect, 1000);
  }
};
```

### Can I use with the API Plugin?

Yes! They can run on different ports:

```javascript
const apiPlugin = new ApiPlugin({ port: 3000 });
const wsPlugin = new WebSocketPlugin({ port: 3001 });

await db.usePlugin(apiPlugin);
await db.usePlugin(wsPlugin);
```

### How do I scale horizontally?

Use a message broker like Redis Pub/Sub to sync events across instances:

```javascript
// TODO: Built-in Redis adapter coming soon
// For now, use custom event forwarding
wsPlugin.on('client.connected', () => {
  // Publish to Redis
});
```

### What's the connection limit?

Default Node.js can handle ~10,000 concurrent connections. For more:
- Increase `ulimit -n` (file descriptors)
- Use clustering or load balancing
- Consider a dedicated WebSocket service

### How do I debug connection issues?

```javascript
const wsPlugin = new WebSocketPlugin({
  logLevel: 'debug',  // Enable debug logs
  // ...
});
```

---

## Troubleshooting

### Connection refused

1. Check if port is available: `lsof -i :3001`
2. Verify firewall rules
3. Check `host` binding (use `0.0.0.0` for external access)

### Authentication failing

1. Verify token format (Bearer prefix for headers)
2. Check JWT secret matches
3. Verify token expiration

### Messages not broadcasting

1. Ensure resource is configured in `resources`
2. Check if client is subscribed
3. Verify guards aren't blocking

### High memory usage

1. Reduce `maxPayloadSize`
2. Implement connection limits
3. Enable message compression (coming soon)

---

[← Back to Plugins](../README.md) | [FAQ →](./faq.md) | [Top ↑](#-websocket-plugin)
