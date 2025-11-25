# Authentication Guide

> Securing WebSocket connections with JWT, API Keys, and OIDC

[← Back to WebSocket Plugin](../README.md)

---

## Table of Contents

- [Overview](#overview)
- [Authentication Flow](#authentication-flow)
- [JWT Authentication](#jwt-authentication)
- [API Key Authentication](#api-key-authentication)
- [OIDC / OAuth2 Authentication](#oidc--oauth2-authentication)
- [Multiple Auth Drivers](#multiple-auth-drivers)
- [User Object](#user-object)
- [Guards and Authorization](#guards-and-authorization)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

The WebSocket plugin supports multiple authentication methods that can be used individually or combined. Authentication happens during the WebSocket handshake (upgrade request).

### Supported Methods

| Method | Use Case | Token Location |
|--------|----------|----------------|
| JWT | User authentication, SPA apps | Query param, Authorization header |
| API Key | Service-to-service, backend scripts | Query param, X-API-Key header |
| OIDC | SSO, enterprise apps | Query param, Authorization header |

---

## Authentication Flow

```
┌────────────┐                         ┌────────────┐
│   Client   │                         │   Server   │
└─────┬──────┘                         └─────┬──────┘
      │                                      │
      │  GET /ws?token=xxx                  │
      │  Upgrade: websocket                 │
      │  ────────────────────────────────>  │
      │                                      │
      │                          ┌──────────┴──────────┐
      │                          │ Validate Token      │
      │                          │ - Check signature   │
      │                          │ - Verify claims     │
      │                          │ - Extract user info │
      │                          └──────────┬──────────┘
      │                                      │
      │  101 Switching Protocols             │
      │  <────────────────────────────────── │  (if valid)
      │                                      │
      │  { type: 'connected', user: {...} } │
      │  <────────────────────────────────── │
      │                                      │
      │  401 Unauthorized                    │
      │  <────────────────────────────────── │  (if invalid)
      │                                      │
```

---

## JWT Authentication

JSON Web Tokens (JWT) are the most common authentication method for web applications.

### Server Configuration

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  auth: {
    required: true,  // Reject unauthenticated connections
    drivers: [{
      driver: 'jwt',
      config: {
        // For HS256 (symmetric key)
        secret: process.env.JWT_SECRET,

        // Optional claim validation
        issuer: 'https://myapp.com',
        audience: 'websocket-api',
        algorithms: ['HS256']  // Allowed algorithms
      }
    }]
  },
  resources: { /* ... */ }
});
```

### Client Connection

```javascript
// Browser - Query parameter (recommended for WebSocket)
const ws = new WebSocket(`ws://localhost:3001?token=${jwtToken}`);

// Node.js - Authorization header
import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3001', {
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  }
});
```

### Token Generation (Server-side)

```javascript
import jwt from 'jsonwebtoken';

function generateToken(user) {
  return jwt.sign(
    {
      sub: user.id,          // Required: user ID
      email: user.email,     // Optional
      role: user.role,       // Optional: for role-based access
      scopes: user.scopes    // Optional: for scope-based access
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '24h',
      issuer: 'https://myapp.com',
      audience: 'websocket-api'
    }
  );
}

// API endpoint to get token
app.post('/api/ws-token', authMiddleware, (req, res) => {
  const token = generateToken(req.user);
  res.json({ token });
});
```

### RS256 (Asymmetric Key)

For production with key rotation:

```javascript
const wsPlugin = new WebSocketPlugin({
  auth: {
    drivers: [{
      driver: 'jwt',
      config: {
        jwksUri: 'https://myapp.com/.well-known/jwks.json',
        issuer: 'https://myapp.com',
        audience: 'websocket-api',
        algorithms: ['RS256', 'ES256']
      }
    }]
  }
});
```

---

## API Key Authentication

API keys are ideal for server-to-server communication and backend services.

### Server Configuration

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  auth: {
    drivers: [{
      driver: 'apiKey',
      config: {
        keys: {
          // Key -> User mapping
          'sk_live_abc123def456': {
            id: 'service-worker',
            role: 'service',
            scopes: ['read', 'write']
          },
          'sk_live_xyz789ghi012': {
            id: 'analytics-service',
            role: 'analytics',
            scopes: ['read']
          },
          [process.env.ADMIN_API_KEY]: {
            id: 'admin-cli',
            role: 'admin',
            scopes: ['*']
          }
        }
      }
    }]
  }
});
```

### Client Connection

```javascript
// Query parameter
const ws = new WebSocket('ws://localhost:3001?token=sk_live_abc123def456');

// X-API-Key header (Node.js)
const ws = new WebSocket('ws://localhost:3001', {
  headers: {
    'X-API-Key': 'sk_live_abc123def456'
  }
});
```

### Generating API Keys

```javascript
import crypto from 'crypto';

function generateApiKey(prefix = 'sk_live') {
  const random = crypto.randomBytes(24).toString('base64url');
  return `${prefix}_${random}`;
}

// Generate a new key
const newKey = generateApiKey();  // sk_live_abc123...
```

---

## OIDC / OAuth2 Authentication

OpenID Connect allows integration with identity providers like Auth0, Okta, Google, etc.

### Server Configuration

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  auth: {
    drivers: [{
      driver: 'oidc',
      config: {
        issuer: 'https://your-tenant.auth0.com',
        clientId: 'your-client-id',
        // audience: 'https://your-api'  // Optional
      }
    }]
  }
});
```

### Client Flow

1. User authenticates with OIDC provider (Auth0, Okta, etc.)
2. Client receives access token
3. Client connects to WebSocket with token

```javascript
// After OIDC authentication
const accessToken = await auth0.getAccessTokenSilently({
  audience: 'https://your-api'
});

const ws = new WebSocket(`ws://localhost:3001?token=${accessToken}`);
```

### Auth0 Example

```javascript
// Server
const wsPlugin = new WebSocketPlugin({
  auth: {
    drivers: [{
      driver: 'oidc',
      config: {
        issuer: 'https://your-tenant.auth0.com/',
        clientId: 'your-client-id'
        // jwksUri is auto-derived from issuer
      }
    }]
  }
});

// Client (React with @auth0/auth0-react)
import { useAuth0 } from '@auth0/auth0-react';

function MyComponent() {
  const { getAccessTokenSilently } = useAuth0();

  useEffect(() => {
    async function connect() {
      const token = await getAccessTokenSilently({
        audience: 'https://your-api'
      });
      const ws = new WebSocket(`ws://localhost:3001?token=${token}`);
    }
    connect();
  }, []);
}
```

### Google OAuth Example

```javascript
// Server
const wsPlugin = new WebSocketPlugin({
  auth: {
    drivers: [{
      driver: 'oidc',
      config: {
        issuer: 'https://accounts.google.com',
        clientId: 'your-client-id.apps.googleusercontent.com'
      }
    }]
  }
});
```

---

## Multiple Auth Drivers

You can configure multiple authentication methods. The server tries each driver in order until one succeeds.

```javascript
const wsPlugin = new WebSocketPlugin({
  auth: {
    required: true,
    drivers: [
      // Try JWT first (for user tokens)
      {
        driver: 'jwt',
        config: {
          secret: process.env.JWT_SECRET
        }
      },
      // Then try OIDC (for SSO tokens)
      {
        driver: 'oidc',
        config: {
          issuer: 'https://auth0.example.com',
          clientId: 'my-client-id'
        }
      },
      // Finally try API key (for services)
      {
        driver: 'apiKey',
        config: {
          keys: {
            [process.env.SERVICE_API_KEY]: {
              id: 'background-worker',
              role: 'service'
            }
          }
        }
      }
    ]
  }
});
```

---

## User Object

After successful authentication, the user object is available in guards and on the connection.

### Structure

```javascript
{
  id: string;           // User identifier (from sub or id claim)
  email?: string;       // Email address (if provided)
  role?: string;        // User role (default: 'user')
  scopes?: string[];    // Permission scopes
}
```

### JWT Claim Mapping

| JWT Claim | User Property | Notes |
|-----------|---------------|-------|
| `sub` | `id` | Standard subject claim |
| `id` | `id` | Fallback if no `sub` |
| `email` | `email` | Optional |
| `role` | `role` | Defaults to 'user' |
| `scopes` | `scopes` | Array of strings |
| `scope` | `scopes` | Space-separated string (split) |

### Accessing User in Guards

```javascript
resources: {
  messages: {
    guard: {
      list: async (user, ctx) => {
        // user is the authenticated user object
        console.log('User:', user);
        // {
        //   id: 'user-123',
        //   email: 'john@example.com',
        //   role: 'admin',
        //   scopes: ['read', 'write']
        // }

        if (!user) {
          return false;  // Unauthenticated
        }

        if (user.role === 'admin') {
          return true;   // Admin sees all
        }

        // Regular user sees only their own
        return { userId: user.id };
      }
    }
  }
}
```

---

## Guards and Authorization

Guards control access at the resource and operation level.

### Role-Based Access Control (RBAC)

```javascript
resources: {
  // Only admins can access
  adminDashboard: {
    auth: ['admin', 'superadmin']
  },

  // Multiple roles
  reports: {
    auth: ['admin', 'analyst', 'manager']
  },

  // Per-operation guards
  users: {
    guard: {
      list: async (user) => user?.role === 'admin',
      get: async (user, ctx) => user?.id === ctx.id || user?.role === 'admin',
      create: async (user) => user?.role === 'admin',
      update: async (user, ctx) => user?.id === ctx.id,
      delete: async (user) => user?.role === 'admin'
    }
  }
}
```

### Scope-Based Access Control

```javascript
resources: {
  documents: {
    guard: {
      list: async (user) => {
        if (!user?.scopes?.includes('documents:read')) {
          return false;
        }
        return true;
      },
      create: async (user) => {
        return user?.scopes?.includes('documents:write');
      }
    }
  }
}
```

### Multi-Tenant Isolation

```javascript
resources: {
  data: {
    guard: {
      // Force tenant filter on all list operations
      list: async (user) => {
        return { tenantId: user.tenantId };
      },

      // Verify tenant on get
      get: async (user, ctx) => {
        const record = await db.resources.data.get(ctx.id);
        return record?.tenantId === user.tenantId;
      },

      // Auto-set tenant on create
      create: async (user, data) => {
        data.tenantId = user.tenantId;
        return true;
      }
    }
  }
}
```

---

## Security Best Practices

### 1. Always Use HTTPS/WSS in Production

```javascript
// Development
const ws = new WebSocket('ws://localhost:3001');

// Production
const ws = new WebSocket('wss://api.myapp.com');
```

### 2. Set Short Token Expiration

```javascript
// Generate short-lived WebSocket tokens
jwt.sign(payload, secret, { expiresIn: '1h' });

// Refresh token before expiration
setInterval(async () => {
  const newToken = await refreshToken();
  reconnectWithNewToken(newToken);
}, 50 * 60 * 1000);  // Refresh at 50 minutes
```

### 3. Validate Token on Every Request (Guards)

```javascript
guard: {
  list: async (user) => {
    // Always check authentication
    if (!user) {
      throw new Error('Authentication required');
    }

    // Validate user is still active
    const dbUser = await db.resources.users.get(user.id);
    if (!dbUser?.active) {
      throw new Error('Account deactivated');
    }

    return true;
  }
}
```

### 4. Use Environment Variables for Secrets

```javascript
// Good
const wsPlugin = new WebSocketPlugin({
  auth: {
    drivers: [{
      driver: 'jwt',
      config: {
        secret: process.env.JWT_SECRET
      }
    }]
  }
});

// Bad - never hardcode secrets
config: { secret: 'my-secret-key' }
```

### 5. Implement Rate Limiting

```javascript
const wsPlugin = new WebSocketPlugin({
  rateLimit: {
    enabled: true,
    windowMs: 60000,
    maxRequests: 100
  }
});
```

### 6. Log Authentication Failures

```javascript
wsPlugin.on('client.connected', ({ clientId, user }) => {
  if (!user) {
    logger.warn({ clientId }, 'Unauthenticated connection');
  }
});
```

---

## Troubleshooting

### Token Not Being Recognized

**Symptoms:**
- Connection closes with 401
- `user` is always `null`

**Solutions:**

1. Check token location:
```javascript
// Query parameter (most reliable for WebSocket)
ws://localhost:3001?token=YOUR_TOKEN

// Authorization header (Node.js only)
headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
```

2. Verify token format:
```javascript
// JWT should have 3 parts separated by dots
eyJhbGciOiJIUzI1NiIs...  // header
.eyJzdWIiOiIxMjM0NTY3...  // payload
.SflKxwRJSMeKKF2QT4fw...  // signature
```

3. Check token expiration:
```javascript
import jwt from 'jsonwebtoken';
const decoded = jwt.decode(token);
console.log('Expires:', new Date(decoded.exp * 1000));
```

### OIDC Token Invalid

**Symptoms:**
- Works with local JWT but not OIDC tokens

**Solutions:**

1. Verify issuer URL:
```javascript
// Must match exactly (including trailing slash)
issuer: 'https://your-tenant.auth0.com/'  // Note trailing slash
```

2. Check JWKS endpoint:
```bash
curl https://your-tenant.auth0.com/.well-known/jwks.json
```

3. Verify audience:
```javascript
// Token audience must match config
config: { audience: 'https://your-api' }
```

### API Key Not Working

**Symptoms:**
- Connection rejected with valid API key

**Solutions:**

1. Check exact key match:
```javascript
// Keys are case-sensitive
'sk_live_ABC123' !== 'sk_live_abc123'
```

2. Verify key is in config:
```javascript
keys: {
  [process.env.API_KEY]: { ... }  // Check env var is set
}
```

### Guards Always Returning False

**Symptoms:**
- All operations return FORBIDDEN

**Solutions:**

1. Log user object:
```javascript
guard: {
  list: async (user) => {
    console.log('User in guard:', user);  // Debug
    return true;
  }
}
```

2. Check guard return value:
```javascript
// Must return true, false, or filter object
guard: {
  list: async (user) => {
    // Bad: returns undefined (falsy)
    if (user.role === 'admin') return true;
    // Missing return for other cases!

    // Good: always return something
    return user.role === 'admin' ? true : { userId: user.id };
  }
}
```

---

[← Back to WebSocket Plugin](../README.md) | [Examples →](../examples/README.md)
