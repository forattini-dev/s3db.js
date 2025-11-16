# API Plugin: Plugin-Level vs Driver-Specific Configuration

## 📋 Overview

The API Plugin has **two levels of configuration**:

1. **Plugin-Level Config** - Shared across all drivers and the entire API
2. **Driver-Specific Config** - Unique to each authentication driver

---

## 🌍 Plugin-Level Configuration (Shared)

These settings apply to the **entire API Plugin**, not specific to any auth driver:

### Server & Routing
```javascript
{
  port: 3000,                    // HTTP server port
  host: '0.0.0.0',              // Bind address
  basePath: '/api',             // Base path for all routes
  versionPrefix: false,         // Global versioning (true/false/'v1')
  startupBanner: true           // Show startup ASCII banner
}
```

### Documentation (OpenAPI)
```javascript
{
  docs: {
    enabled: true,              // Enable /docs and /openapi.json
    ui: 'redoc',               // 'redoc' or 'swagger'
    title: 's3db.js API',      // API title
    version: '1.0.0',          // API version
    description: 'Auto-generated REST API',
    csp: null                  // Custom CSP for docs page
  }
}
```

### Security & HTTP Features
```javascript
{
  cors: {
    enabled: true,
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true
  },

  rateLimit: {
    enabled: true,
    windowMs: 60000,           // 1 minute
    maxRequests: 100,
    rules: []                  // Per-path rate limits
  },

  compression: {
    enabled: true,
    threshold: 1024,           // 1KB
    level: 6                   // Compression level
  },

  security: {
    enabled: true,
    contentSecurityPolicy: { /* ... */ },
    frameguard: { action: 'deny' },
    hsts: { maxAge: 15552000 },
    noSniff: true,
    // ... other security headers
  }
}
```

### Logging & Monitoring
```javascript
{
  logLevel: 'info',            // 'trace' | 'debug' | 'info' | 'warn' | 'error'

  logging: {
    enabled: true,
    format: ':verb :url => :status',
    colorize: true,
    excludePaths: ['/health', '/metrics']
  },

  metrics: {
    enabled: true              // Request metrics
  },

  events: {
    enabled: true              // Event emitter
  },

  health: {
    enabled: true              // /health endpoint
  }
}
```

### Templates & Static Files
```javascript
{
  templates: {
    enabled: false,
    engine: 'jsx',             // 'jsx' | 'ejs' | 'custom'
    templatesDir: './views'
  },

  static: [
    { path: '/public', dir: './public' }
  ]
}
```

### Request Processing
```javascript
{
  maxBodySize: 10485760,       // 10MB
  validation: {
    enabled: true,
    validateOnInsert: true,
    validateOnUpdate: true
  },
  requestId: { enabled: false },
  sessionTracking: { enabled: false }
}
```

### Custom Routes & Middlewares
```javascript
{
  routes: {                    // Plugin-level custom routes
    'GET /status': async (c) => c.json({ ok: true })
  },

  middlewares: [               // Global middlewares
    async (c, next) => { /* ... */ }
  ]
}
```

---

## 🔐 Authentication Configuration (Plugin-Level)

These auth settings are **shared across all drivers**:

```javascript
{
  auth: {
    // Strategy & Routing
    strategy: 'any',           // 'any' (OR) | 'priority' (waterfall)
    priorities: {              // Priority order for 'priority' strategy
      jwt: 1,
      oidc: 2,
      basic: 3
    },

    // Path-based auth rules (applies to all drivers)
    pathRules: [
      {
        path: '/admin/**',
        drivers: ['oidc'],     // Only OIDC for admin
        required: true
      },
      {
        path: '/api/**',
        drivers: ['jwt', 'apiKey'],  // JWT or API Key for API
        required: true
      }
    ],

    // Global registration settings
    registration: {
      enabled: true,
      allowedFields: ['email', 'name'],
      defaultRole: 'user'
    },

    // Login throttling (brute-force protection)
    loginThrottle: {
      enabled: true,
      maxAttempts: 5,
      windowMs: 60000,         // 1 minute
      blockDurationMs: 300000  // 5 minutes
    },

    // Global resource creation setting
    createResource: true,      // Auto-create auth resources

    // DRIVERS ARRAY (driver-specific configs below)
    drivers: [/* ... */]
  }
}
```

---

## 🎯 Driver-Specific Configuration

Each driver in the `drivers` array has its **own configuration**:

### JWT Driver
```javascript
{
  driver: 'jwt',
  config: {
    // Driver-specific resource
    resource: 'admin_users',   // Resource for this driver only

    // JWT settings
    secret: 'my-jwt-secret',
    expiresIn: '7d',
    algorithm: 'HS256',

    // Field mappings
    userField: 'email',        // Username field
    passwordField: 'password',

    // Encryption
    passphrase: 'secret',

    // Cookie fallback
    cookieName: 'jwt_token',   // Optional cookie auth

    // Optional auth
    optional: false
  }
}
```

### API Key Driver
```javascript
{
  driver: 'apiKey',
  config: {
    resource: 'api_clients',

    // Header configuration
    headerName: 'X-Custom-API-Key',  // Custom header name

    // Query parameter fallback
    queryParam: 'api_key',           // Optional query param

    // Field mapping
    keyField: 'apiKey',

    optional: false
  }
}
```

### Basic Auth Driver
```javascript
{
  driver: 'basic',
  config: {
    resource: 'users',

    // Realm
    realm: 'Admin Area',

    // Field mappings
    usernameField: 'email',
    passwordField: 'password',

    // Encryption
    passphrase: 'secret',

    // Cookie fallback
    cookieName: 'api_token',
    tokenField: 'apiToken',

    // Admin bypass
    adminUser: {
      enabled: true,
      username: 'admin',
      password: 'secret',
      scopes: ['admin']
    },

    optional: false
  }
}
```

### OAuth2 Driver (Resource Server)
```javascript
{
  driver: 'oauth2',
  config: {
    resource: 'users',

    // OAuth2 settings
    issuer: 'https://auth.example.com',
    jwksUri: 'https://auth.example.com/.well-known/jwks.json',
    audience: 'my-api',
    algorithms: ['RS256', 'ES256'],

    // User mapping
    userMapping: {
      id: 'sub',
      email: 'email',
      username: 'preferred_username',
      role: 'role'
    },

    // Caching
    cacheTTL: 3600000,         // 1 hour

    // User sync
    fetchUserInfo: true,

    // Introspection (for opaque tokens)
    introspection: {
      enabled: true,
      endpoint: 'https://auth.example.com/oauth/introspect',
      clientId: 'client-id',
      clientSecret: 'client-secret'
    }
  }
}
```

### OIDC Driver (Authorization Code Flow)
```javascript
{
  driver: 'oidc',
  config: {
    resource: 'users',

    // OIDC provider
    issuer: 'https://auth.example.com',
    clientId: 'my-client-id',
    clientSecret: 'my-client-secret',

    // URLs
    redirectUri: 'http://localhost:3000/auth/callback',
    openIdConnectUrl: 'https://auth.example.com/.well-known/openid-configuration',

    // Scopes
    scope: 'openid profile email',

    // Session
    sessionSecret: 'session-secret',
    sessionCookie: 'oidc_session',

    // User sync
    syncUser: true,
    autoCreateUser: true
  }
}
```

---

## 🔄 Complete Example: Plugin-Level + Driver-Specific

```javascript
const apiPlugin = new ApiPlugin({
  // ========================================
  // PLUGIN-LEVEL (shared across all drivers)
  // ========================================
  port: 3000,
  basePath: '/api',
  logLevel: 'info',

  docs: {
    enabled: true,
    title: 'My API',
    ui: 'redoc'
  },

  cors: { enabled: true },
  rateLimit: { enabled: true, maxRequests: 100 },
  compression: { enabled: true },
  security: { enabled: true },

  logging: {
    enabled: true,
    excludePaths: ['/health']
  },

  // ========================================
  // AUTH CONFIGURATION
  // ========================================
  auth: {
    // Plugin-level auth settings
    strategy: 'any',           // Shared strategy
    createResource: true,      // Shared setting

    registration: {            // Shared registration
      enabled: true,
      defaultRole: 'user'
    },

    pathRules: [               // Shared path rules
      {
        path: '/admin/**',
        drivers: ['oidc'],
        required: true
      }
    ],

    // ========================================
    // DRIVER-SPECIFIC CONFIGS
    // ========================================
    drivers: [
      {
        driver: 'jwt',
        config: {
          resource: 'admin_users',  // JWT-specific resource
          secret: 'jwt-secret',     // JWT-specific secret
          expiresIn: '7d'
        }
      },
      {
        driver: 'apiKey',
        config: {
          resource: 'api_clients',  // API Key-specific resource
          headerName: 'X-API-Key',  // API Key-specific header
          queryParam: 'key'
        }
      },
      {
        driver: 'basic',
        config: {
          resource: 'users',        // Basic-specific resource
          realm: 'Admin',           // Basic-specific realm
          cookieName: 'api_token'
        }
      }
    ]
  }
});
```

---

## 📊 Quick Reference Table

| Config | Scope | Example |
|--------|-------|---------|
| `port`, `host`, `basePath` | Plugin | Shared server config |
| `docs`, `cors`, `security` | Plugin | Shared HTTP features |
| `logLevel`, `logging` | Plugin | Shared logging |
| `auth.strategy` | Plugin | Shared auth strategy |
| `auth.pathRules` | Plugin | Shared routing rules |
| `auth.drivers[].driver` | Driver | Which auth method |
| `auth.drivers[].config.resource` | Driver | Driver's resource |
| `auth.drivers[].config.secret` | Driver | JWT-specific |
| `auth.drivers[].config.headerName` | Driver | API Key-specific |
| `auth.drivers[].config.realm` | Driver | Basic-specific |
| `auth.drivers[].config.issuer` | Driver | OAuth2/OIDC-specific |

---

## 🎯 Key Takeaways

1. **Plugin-Level** = One config for the entire API
   - Server, docs, CORS, rate limiting, logging
   - Shared auth strategy and path rules

2. **Driver-Specific** = Each driver has its own config
   - Each driver can use a different resource
   - Each driver has unique settings (secret, realm, issuer, etc.)
   - Multiple drivers can coexist with different configs

3. **OpenAPI Generation** uses BOTH:
   - Plugin-level: Base URL, server info, tags
   - Driver-specific: Security schemes with driver configs

4. **Best Practice**:
   - Configure shared features at plugin-level
   - Configure auth specifics per-driver
   - Use different resources for different security contexts
