# Configuration Reference

> Complete reference for all WebSocketPlugin configuration options

[← Back to WebSocket Plugin](../README.md)

---

## Table of Contents

- [Overview](#overview)
- [Server Options](#server-options)
- [Connection Options](#connection-options)
- [Authentication Options](#authentication-options)
- [Rate Limiting Options](#rate-limiting-options)
- [CORS Options](#cors-options)
- [Resource Options](#resource-options)
- [Complete Example](#complete-example)

---

## Overview

The WebSocketPlugin accepts a configuration object with the following top-level sections:

```javascript
new WebSocketPlugin({
  // Server configuration
  port: 3001,
  host: '0.0.0.0',

  // Connection settings
  heartbeatInterval: 30000,
  heartbeatTimeout: 10000,
  maxPayloadSize: 1048576,

  // Authentication
  auth: { /* ... */ },

  // Rate limiting
  rateLimit: { /* ... */ },

  // CORS
  cors: { /* ... */ },

  // Resources
  resources: { /* ... */ }
});
```

---

## Server Options

### `port`

| Type | Default | Required |
|------|---------|----------|
| `number` | `3001` | No |

The port number for the WebSocket server to listen on.

```javascript
port: 8080
```

**Notes:**
- Ensure the port is not in use by another process
- Use `0` to let the OS assign a random available port
- Ports below 1024 require root privileges on Linux

### `host`

| Type | Default | Required |
|------|---------|----------|
| `string` | `'0.0.0.0'` | No |

The network interface to bind the server to.

```javascript
host: '127.0.0.1'  // Only accept local connections
host: '0.0.0.0'    // Accept connections from any interface
```

**Common values:**
- `'0.0.0.0'` - All interfaces (default, allows external connections)
- `'127.0.0.1'` or `'localhost'` - Local only (secure for development)
- Specific IP - Bind to a specific network interface

### `startupBanner`

| Type | Default | Required |
|------|---------|----------|
| `boolean` | `true` | No |

Whether to log a startup message when the server starts.

```javascript
startupBanner: false  // Disable startup log
```

### `logLevel`

| Type | Default | Required |
|------|---------|----------|
| `string` | `'info'` | No |

Controls the verbosity of plugin logging.

```javascript
logLevel: 'debug'  // Enable debug logs
```

**Valid values:**
- `'silent'` - No logging
- `'error'` - Only errors
- `'warn'` - Warnings and errors
- `'info'` - Info, warnings, and errors (default)
- `'debug'` - All messages including debug

---

## Connection Options

### `heartbeatInterval`

| Type | Default | Required |
|------|---------|----------|
| `number` | `30000` | No |

Interval in milliseconds between ping messages sent to clients.

```javascript
heartbeatInterval: 15000  // Ping every 15 seconds
```

**Notes:**
- Lower values detect disconnections faster but increase traffic
- Higher values reduce overhead but may delay disconnect detection
- Recommended range: 10000-60000ms

### `heartbeatTimeout`

| Type | Default | Required |
|------|---------|----------|
| `number` | `10000` | No |

Time in milliseconds to wait for a pong response before considering the client disconnected.

```javascript
heartbeatTimeout: 5000  // 5 second timeout
```

**Notes:**
- Should be less than `heartbeatInterval`
- Consider network latency when setting this value
- Too low may cause false disconnections on slow networks

### `maxPayloadSize`

| Type | Default | Required |
|------|---------|----------|
| `number` | `1048576` (1MB) | No |

Maximum size of incoming WebSocket messages in bytes.

```javascript
maxPayloadSize: 5 * 1024 * 1024  // 5MB
```

**Notes:**
- Protects against memory exhaustion attacks
- Messages exceeding this limit will be rejected
- Consider your use case when increasing (e.g., file uploads)

---

## Authentication Options

### `auth.required`

| Type | Default | Required |
|------|---------|----------|
| `boolean` | `false` | No |

Whether authentication is required for all connections.

```javascript
auth: {
  required: true  // Reject unauthenticated connections
}
```

### `auth.drivers`

| Type | Default | Required |
|------|---------|----------|
| `array` | `[]` | No |

Array of authentication driver configurations.

```javascript
auth: {
  drivers: [
    { driver: 'jwt', config: { /* ... */ } },
    { driver: 'apiKey', config: { /* ... */ } }
  ]
}
```

**Supported drivers:**
- `jwt` - JSON Web Token authentication
- `apiKey` - Static API key authentication
- `oidc` - OpenID Connect (translated to JWT with JWKS)

#### JWT Driver

```javascript
{
  driver: 'jwt',
  config: {
    // For HS256 (symmetric)
    secret: 'your-secret-key',

    // OR for RS256/ES256 (asymmetric)
    jwksUri: 'https://auth.example.com/.well-known/jwks.json',

    // Optional validation
    issuer: 'https://auth.example.com',
    audience: 'my-api',
    algorithms: ['HS256', 'RS256']
  }
}
```

**Token payload mapping:**
| JWT Claim | User Property |
|-----------|---------------|
| `sub` or `id` | `user.id` |
| `email` | `user.email` |
| `role` | `user.role` |
| `scopes` or `scope` | `user.scopes` |

#### API Key Driver

```javascript
{
  driver: 'apiKey',
  config: {
    keys: {
      'api_key_123': {
        id: 'service-1',
        role: 'admin',
        scopes: ['read', 'write']
      },
      'api_key_456': {
        id: 'service-2',
        role: 'user',
        scopes: ['read']
      }
    }
  }
}
```

#### OIDC Driver

```javascript
{
  driver: 'oidc',
  config: {
    issuer: 'https://accounts.google.com',
    clientId: 'your-client-id',
    // jwksUri is auto-derived from issuer/.well-known/jwks.json
  }
}
```

---

## Rate Limiting Options

### `rateLimit.enabled`

| Type | Default | Required |
|------|---------|----------|
| `boolean` | `false` | No |

Enable or disable rate limiting.

```javascript
rateLimit: {
  enabled: true
}
```

### `rateLimit.windowMs`

| Type | Default | Required |
|------|---------|----------|
| `number` | `60000` | No |

Time window in milliseconds for rate limit counting.

```javascript
rateLimit: {
  enabled: true,
  windowMs: 30000  // 30 second window
}
```

### `rateLimit.maxRequests`

| Type | Default | Required |
|------|---------|----------|
| `number` | `100` | No |

Maximum number of messages allowed per window per client.

```javascript
rateLimit: {
  enabled: true,
  maxRequests: 50  // 50 messages per window
}
```

**Notes:**
- Applies per client connection
- When exceeded, client receives `RATE_LIMIT_EXCEEDED` error
- Counter resets when window expires

---

## CORS Options

### `cors.enabled`

| Type | Default | Required |
|------|---------|----------|
| `boolean` | `true` | No |

Enable CORS headers for the HTTP upgrade request.

```javascript
cors: {
  enabled: false  // Disable CORS
}
```

### `cors.origin`

| Type | Default | Required |
|------|---------|----------|
| `string` | `'*'` | No |

Allowed origin for CORS requests.

```javascript
cors: {
  enabled: true,
  origin: 'https://myapp.com'
}
```

**Values:**
- `'*'` - Allow all origins (default)
- Specific origin - Only allow that origin
- Note: For production, specify exact origins

---

## Resource Options

### Resource Configuration

Each resource in the `resources` object can be configured with:

```javascript
resources: {
  resourceName: {
    auth: ['admin', 'user'],           // Allowed roles
    protected: ['field1', 'field2'],   // Hidden fields
    events: ['insert', 'update'],      // Broadcast events
    guard: { /* ... */ },              // Row-level security
    publishAuth: ['admin']             // Roles that can publish
  }
}
```

### Simple Enable

```javascript
resources: {
  messages: true  // Enable with default settings
}
```

### Disable Resource

```javascript
resources: {
  internalLogs: false  // Not accessible via WebSocket
}
```

### `auth`

| Type | Default | Required |
|------|---------|----------|
| `string[]` | `null` | No |

Array of roles that can access this resource.

```javascript
resources: {
  adminData: {
    auth: ['admin', 'superadmin']
  }
}
```

**Notes:**
- `null` or omitted - No role restriction
- Empty array `[]` - Block all access
- Array of strings - Only listed roles can access

### `protected`

| Type | Default | Required |
|------|---------|----------|
| `string[]` | `[]` | No |

Fields to remove from all responses.

```javascript
resources: {
  users: {
    protected: [
      'password',
      'apiToken',
      'metadata.internal',      // Nested field
      'settings.privateKey'     // Nested field
    ]
  }
}
```

**Notes:**
- Supports dot notation for nested fields
- Applied to all operations (get, list, events)
- Does NOT affect direct Resource access, only WebSocket responses

### `events`

| Type | Default | Required |
|------|---------|----------|
| `string[]` | `['insert', 'update', 'delete']` | No |

Events to broadcast to subscribers.

```javascript
resources: {
  auditLog: {
    events: ['insert']  // Only broadcast new entries
  }
}
```

**Valid events:**
- `'insert'` - New record created
- `'update'` - Record modified
- `'delete'` - Record removed

### `guard`

| Type | Default | Required |
|------|---------|----------|
| `object` | `{}` | No |

Functions for row-level security per operation.

```javascript
resources: {
  documents: {
    guard: {
      subscribe: async (user, filter) => { /* ... */ },
      list: async (user, ctx) => { /* ... */ },
      get: async (user, ctx) => { /* ... */ },
      create: async (user, data) => { /* ... */ },
      update: async (user, ctx) => { /* ... */ },
      delete: async (user, ctx) => { /* ... */ }
    }
  }
}
```

#### Guard Return Values

| Return | Effect |
|--------|--------|
| `true` | Allow operation |
| `false` | Deny operation (FORBIDDEN error) |
| `{ field: value }` | Apply filter (for list operations) |
| Throw Error | Deny with custom message |

#### Guard Parameters

| Guard | Parameters |
|-------|------------|
| `subscribe` | `(user, filter)` - User object and subscription filter |
| `list` | `(user, ctx)` - User and `{ filter, partition }` |
| `get` | `(user, ctx)` - User and `{ id, partition }` |
| `create` | `(user, data)` - User and record data |
| `update` | `(user, ctx)` - User and `{ id, data, partition }` |
| `delete` | `(user, ctx)` - User and `{ id, partition }` |

---

## Complete Example

```javascript
import { WebSocketPlugin } from 's3db.js';

const wsPlugin = new WebSocketPlugin({
  // Server
  port: 3001,
  host: '0.0.0.0',
  startupBanner: true,
  logLevel: 'info',

  // Connection
  heartbeatInterval: 30000,
  heartbeatTimeout: 10000,
  maxPayloadSize: 2 * 1024 * 1024,  // 2MB

  // Authentication
  auth: {
    required: true,
    drivers: [
      {
        driver: 'jwt',
        config: {
          secret: process.env.JWT_SECRET,
          issuer: 'https://myapp.com',
          audience: 'websocket-api'
        }
      },
      {
        driver: 'apiKey',
        config: {
          keys: {
            [process.env.SERVICE_API_KEY]: {
              id: 'background-service',
              role: 'service',
              scopes: ['read', 'write']
            }
          }
        }
      }
    ]
  },

  // Rate Limiting
  rateLimit: {
    enabled: true,
    windowMs: 60000,
    maxRequests: 100
  },

  // CORS
  cors: {
    enabled: true,
    origin: process.env.ALLOWED_ORIGIN || '*'
  },

  // Resources
  resources: {
    // Public resource - read only
    announcements: {
      events: ['insert'],
      guard: {
        create: async (user) => user?.role === 'admin',
        update: async (user) => user?.role === 'admin',
        delete: async (user) => user?.role === 'admin'
      }
    },

    // User data - ownership based
    messages: {
      protected: ['metadata.ip'],
      guard: {
        subscribe: async (user, filter) => {
          if (!user) return false;
          if (user.role === 'admin') return true;
          return { ...filter, userId: user.id };
        },
        list: async (user) => {
          if (user.role === 'admin') return true;
          return { userId: user.id };
        },
        get: async (user, ctx) => {
          return user?.role === 'admin' || ctx.userId === user?.id;
        },
        create: async (user, data) => {
          return data.userId === user.id;
        },
        update: async (user, ctx) => {
          return ctx.userId === user.id || user.role === 'admin';
        },
        delete: async (user, ctx) => {
          return user.role === 'admin';
        }
      }
    },

    // Admin only
    systemLogs: {
      auth: ['admin'],
      events: ['insert']
    }
  }
});
```

---

[← Back to WebSocket Plugin](../README.md) | [Authentication Guide →](../guides/authentication.md)
