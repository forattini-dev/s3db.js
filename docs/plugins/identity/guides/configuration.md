# ⚙️ Configuration Guide

**Prev:** [← Getting Started](/plugins/identity/guides/getting-started.md)
**Next:** [Usage Patterns →](/plugins/identity/guides/usage-patterns.md)
**Main:** [← Identity Plugin](/plugins/identity/README.md) | **All guides:** [Index](/plugins/identity/README.md#-documentation-hub)

> **In this guide:**
> - Default configuration object
> - All configuration options with types and defaults
> - 4 real-world configuration patterns
> - Performance tuning recommendations
> - Security considerations

**Time to read:** 10 minutes
**Difficulty:** Intermediate

---

## Default Configuration

```javascript
import { Database } from 's3db.js';
import { IdentityPlugin } from 's3db.js';

const db = new Database({
  connectionString: 's3://...',
  encryptionKey: 'your-32-char-encryption-key!'
});

await db.usePlugin(new IdentityPlugin({
  // Server
  port: 4000,
  host: '0.0.0.0',
  issuer: 'http://localhost:4000',  // MUST match public URL
  logLevel: 'silent',

  // Resources
  userResource: 'users',
  resourceNames: {
    // auto-generated: plg_identity_*
    // Can override: plg_identity_oauth_keys, plg_identity_auth_codes, etc.
  },

  // OAuth2/OIDC
  supportedScopes: ['openid'],
  supportedGrantTypes: ['authorization_code', 'client_credentials', 'refresh_token'],
  supportedResponseTypes: ['code'],

  // Token Expiry
  accessTokenExpiry: '15m',    // Access token lifetime
  idTokenExpiry: '15m',         // ID token lifetime
  refreshTokenExpiry: '7d',     // Refresh token lifetime
  authCodeExpiry: '10m',        // Authorization code lifetime

  // Security
  security: {
    enabled: true,
    contentSecurityPolicy: {},
    hsts: {}
  },

  // CORS
  cors: {
    enabled: true,
    origin: '*',               // Set to specific domains in production!
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  },

  // Rate Limiting
  rateLimit: {
    enabled: true,
    login: { windowMs: 60000, max: 10 },      // 10 attempts per minute per IP
    token: { windowMs: 60000, max: 60 },      // 60 requests per minute per IP
    authorize: { windowMs: 60000, max: 30 }   // 30 requests per minute per IP
  },

  // Compression
  compression: {
    enabled: false,
    threshold: 1024,            // Compress if > 1KB
    level: 6,                   // Compression level (0-9)
    preferBrotli: true          // Use Brotli over gzip
  },

  // Logging
  logging: {
    enabled: false,
    format: ':method :path :status :response-time ms'
  },

  // Features
  features: {
    tokenRevocation: true,                    // RFC 7009
    dynamicClientRegistration: true,          // RFC 7591
    pkce: true,                               // PKCE support
    refreshTokenRotation: false,              // Rotate on refresh
    multiAudience: false                      // Support multiple audiences
  },

  // Authentication
  authDrivers: {
    disableBuiltIns: false,
    password: {
      identifierField: 'email',               // or 'username'
      caseInsensitive: true                   // Important for emails!
    },
    drivers: []                               // Custom drivers
  }
}));
```

**That's all the options!** Sensible defaults for most use cases. Customize only what you need.

---

## Configuration Options Reference

### Server Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | number | `4000` | Port to listen on |
| `host` | string | `'0.0.0.0'` | Host to bind to |
| `issuer` | string | **required** | Public issuer URL (MUST match clients' view) |
| `logLevel` | boolean | `false` | Enable debug logging |

**Important: `issuer` must exactly match how clients access your server:**
```javascript
// ❌ Wrong - doesn't match actual access URL
issuer: 'http://localhost:4000',  // But clients access via IP

// ✅ Correct
issuer: 'https://sso.example.com'  // Matches client access URL
```

### Resource Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `userResource` | string | `'users'` | Name of user authentication resource |
| `resourceNames` | object | auto-generated | Override internal resource names |

**Internal resources** (auto-generated):
- `plg_identity_oauth_keys` - RSA key storage
- `plg_identity_auth_codes` - Authorization codes
- `plg_identity_sessions` - Active sessions
- `plg_identity_password_reset_tokens` - Password reset links
- `plg_identity_mfa_devices` - 2FA device registry

### OAuth2/OIDC Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `supportedScopes` | string[] | `['openid']` | Allowed permission scopes |
| `supportedGrantTypes` | string[] | `['authorization_code', 'client_credentials', 'refresh_token']` | Allowed flows |
| `supportedResponseTypes` | string[] | `['code']` | OAuth2 response types |

**Standard scopes:**
- `openid` - Required for OIDC, must be included
- `profile` - User name, picture, etc.
- `email` - User email and verification status
- `offline_access` - Issue refresh tokens
- Custom scopes: `read:api`, `write:api`, `admin:all`

**Grant types:**
- `authorization_code` - Web apps (with login UI)
- `client_credentials` - Service-to-service
- `refresh_token` - Get new access token

### Token Expiry Options

| Option | Type | Default | Use Case |
|--------|------|---------|----------|
| `accessTokenExpiry` | string | `'15m'` | Short-lived access tokens (15m standard) |
| `idTokenExpiry` | string | `'15m'` | ID token lifetime |
| `refreshTokenExpiry` | string | `'7d'` | Long-lived refresh tokens (7d common) |
| `authCodeExpiry` | string | `'10m'` | Auth code lifetime (10m standard) |

**Format:** `'15m'`, `'1h'`, `'7d'`, `'30s'`

**Security guidelines:**
- **Access tokens**: 15-30 minutes (short, limits damage if stolen)
- **Refresh tokens**: 7 days to 1 year (long, allows user to stay logged in)
- **Auth codes**: 10-15 minutes (short, one-time use)

### Security Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `security.enabled` | boolean | `true` | Enable security headers |
| `security.contentSecurityPolicy` | object | `{}` | CSP directives |
| `security.hsts` | object | `{}` | HSTS configuration |

**CSP Example:**
```javascript
security: {
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "https://fonts.googleapis.com"]
  }
}
```

**HSTS Example (production):**
```javascript
security: {
  hsts: {
    maxAge: 31536000,        // 1 year
    includeSubDomains: true,
    preload: true            // Include in HSTS preload list
  }
}
```

### CORS Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cors.enabled` | boolean | `true` | Enable CORS |
| `cors.origin` | string/array | `'*'` | Allowed origins |
| `cors.credentials` | boolean | `true` | Allow cookies/auth headers |
| `cors.methods` | string[] | `['GET', 'POST', 'PUT', 'DELETE']` | Allowed HTTP methods |
| `cors.allowedHeaders` | string[] | `['Content-Type', 'Authorization']` | Allowed request headers |

**Development (permissive):**
```javascript
cors: {
  enabled: true,
  origin: '*'  // Allow any origin
}
```

**Production (restrictive):**
```javascript
cors: {
  enabled: true,
  origin: ['https://app.example.com', 'https://admin.example.com'],
  credentials: true
}
```

### Rate Limiting Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rateLimit.enabled` | boolean | `true` | Enable rate limiting |
| `rateLimit.login.windowMs` | number | `60000` | Login window (ms) |
| `rateLimit.login.max` | number | `10` | Max login attempts per window |
| `rateLimit.token.windowMs` | number | `60000` | Token endpoint window (ms) |
| `rateLimit.token.max` | number | `60` | Max token requests per window |
| `rateLimit.authorize.windowMs` | number | `60000` | Authorize window (ms) |
| `rateLimit.authorize.max` | number | `30` | Max authorize requests per window |

**Sliding window**: Resets continuously, not at fixed times.

**Examples:**
```javascript
// Aggressive (security-first)
rateLimit: {
  enabled: true,
  login: { windowMs: 60000, max: 5 },    // 5 per minute
  token: { windowMs: 60000, max: 30 },   // 30 per minute
  authorize: { windowMs: 60000, max: 20 }
}

// Permissive (high-volume)
rateLimit: {
  enabled: true,
  login: { windowMs: 60000, max: 50 },   // 50 per minute
  token: { windowMs: 60000, max: 200 },  // 200 per minute
  authorize: { windowMs: 60000, max: 100 }
}
```

### Compression Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `compression.enabled` | boolean | `false` | Enable gzip/brotli compression |
| `compression.threshold` | number | `1024` | Compress if response > N bytes |
| `compression.level` | number | `6` | Compression level (0-9) |
| `compression.preferBrotli` | boolean | `true` | Prefer Brotli over gzip |

**Tradeoff:** CPU cost vs bandwidth savings. Typically:
- Level 6 = good balance
- Level 9 = maximum compression, slower
- Enable only if bandwidth is constraint

### Logging Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `logging.enabled` | boolean | `false` | Enable request logging |
| `logging.format` | string | default | Log format string |
| `logging.tokens` | object | `{}` | Custom log tokens |

**Format tokens:**
- `:method` - HTTP method
- `:path` - Request path
- `:status` - Response status
- `:response-time` - Duration in ms
- `:user` - Custom token

### Features Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `features.tokenRevocation` | boolean | `true` | RFC 7009 token revocation |
| `features.dynamicClientRegistration` | boolean | `true` | RFC 7591 client registration |
| `features.pkce` | boolean | `true` | PKCE for public clients |
| `features.refreshTokenRotation` | boolean | `false` | Rotate refresh tokens on use |
| `features.multiAudience` | boolean | `false` | Support multiple audiences |

### Authentication Driver Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `authDrivers.disableBuiltIns` | boolean | `false` | Disable password + client_credentials |
| `authDrivers.password.identifierField` | string | `'email'` | Login field (email or username) |
| `authDrivers.password.caseInsensitive` | boolean | `true` | Case-insensitive lookup |
| `authDrivers.drivers` | array | `[]` | Custom AuthDriver instances |

---

## Configuration Patterns

### Pattern 1: Development (Minimal Setup)

Perfect for local development with permissive settings:

```javascript
const identityPlugin = new IdentityPlugin({
  port: 4000,
  issuer: 'http://localhost:4000',
  supportedScopes: ['openid', 'profile', 'email'],
  logLevel: 'debug',                        // Debug logs
  cors: { origin: '*' },               // Allow any origin
  rateLimit: { enabled: false }        // No rate limiting
});
```

**Characteristics:**
- Loose CORS (accept all origins)
- Debug logging
- No rate limiting
- All features enabled
- Perfect for testing

### Pattern 2: Production (Enterprise Setup)

Hardened configuration for production deployments:

```javascript
const identityPlugin = new IdentityPlugin({
  port: 443,
  host: '0.0.0.0',
  issuer: 'https://sso.example.com',

  supportedScopes: [
    'openid', 'profile', 'email',
    'offline_access',
    'read:api', 'write:api', 'admin:all'
  ],

  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',

  security: {
    enabled: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  },

  cors: {
    enabled: true,
    origin: ['https://app.example.com', 'https://admin.example.com'],
    credentials: true
  },

  rateLimit: {
    enabled: true,
    login: { windowMs: 120000, max: 10 },
    token: { windowMs: 60000, max: 120 },
    authorize: { windowMs: 60000, max: 40 }
  },

  compression: {
    enabled: true,
    preferBrotli: true
  },

  features: {
    tokenRevocation: true,
    dynamicClientRegistration: true,
    pkce: true,
    refreshTokenRotation: true,
    multiAudience: true
  }
});
```

**Characteristics:**
- Restricted CORS (specific domains only)
- HSTS enforced
- Aggressive rate limiting
- All security features enabled
- Compression enabled

### Pattern 3: Mobile Apps (PKCE-Focused)

Optimized for mobile and SPA clients using PKCE:

```javascript
const identityPlugin = new IdentityPlugin({
  port: 4000,
  issuer: 'https://api.example.com',

  supportedScopes: ['openid', 'profile', 'offline_access'],
  supportedGrantTypes: ['authorization_code', 'refresh_token'],

  features: {
    pkce: true,                   // PKCE mandatory
    refreshTokenRotation: true,   // Rotate on each use
    tokenRevocation: true
  },

  cors: {
    enabled: true,
    origin: ['myapp://', 'https://app.example.com'],
    credentials: true
  },

  rateLimit: {
    enabled: true,
    login: { windowMs: 60000, max: 20 },
    authorize: { windowMs: 60000, max: 50 }
  }
});
```

**Characteristics:**
- PKCE mandatory for public clients
- Refresh token rotation
- Support for deep links (myapp://)
- No client_credentials flow (mobile = public)

### Pattern 4: Multi-Tenant SaaS (Multiple Instances)

Different SSO servers for different tenants:

```javascript
// Tenant A
await db.usePlugin(
  new IdentityPlugin({
    port: 4000,
    issuer: 'https://tenant-a.example.com',
    userResource: 'tenant_a_users',
    supportedScopes: ['openid', 'profile', 'email']
  }),
  { alias: 'tenant-a' }  // Namespace all resources
);

// Tenant B
await db.usePlugin(
  new IdentityPlugin({
    port: 4001,
    issuer: 'https://tenant-b.example.com',
    userResource: 'tenant_b_users',
    supportedScopes: ['openid', 'profile', 'email']
  }),
  { alias: 'tenant-b' }
);
```

**Resource organization:**
- Tenant A: `plg_tenant-a_identity_*`
- Tenant B: `plg_tenant-b_identity_*`
- Completely isolated

---

## Performance Tuning

### Token Expiry & Refresh

**Trade-off: Security vs User Experience**

```javascript
// Security-first (shorter tokens)
{
  accessTokenExpiry: '5m',        // Force refresh every 5 minutes
  refreshTokenExpiry: '1d'        // User re-authenticates daily
}

// User-friendly (longer tokens)
{
  accessTokenExpiry: '1h',        // Less frequent refresh
  refreshTokenExpiry: '30d'       // Users stay logged in longer
}
```

**Recommendation:** 15m access, 7d refresh (default)

### Rate Limiting Tuning

**For high-volume APIs:**
```javascript
rateLimit: {
  login: { windowMs: 60000, max: 100 },    // Increase limits
  token: { windowMs: 60000, max: 500 },
  authorize: { windowMs: 60000, max: 200 }
}
```

**For security-sensitive services:**
```javascript
rateLimit: {
  login: { windowMs: 60000, max: 5 },      // Aggressive limits
  token: { windowMs: 60000, max: 30 },
  authorize: { windowMs: 60000, max: 20 }
}
```

### Compression

**Enable for large JWT responses:**
```javascript
compression: {
  enabled: true,
  threshold: 1024,      // Compress if > 1KB
  level: 6              // Good balance
}
```

---

## Common Configuration Mistakes

### ❌ Mistake 1: Wrong Issuer URL

```javascript
// Wrong - doesn't match how clients access server
issuer: 'http://localhost:4000'  // But clients use IP address or domain

// Client gets tokens with mismatched issuer
// → Token validation fails in clients
```

**Fix:** Issuer MUST match public URL:
```javascript
issuer: 'https://sso.example.com'  // Must be how clients access it
```

### ❌ Mistake 2: CORS set to '*' in Production

```javascript
// Dangerous in production
cors: {
  origin: '*'  // Any website can make requests!
}
```

**Fix:** Restrict to specific domains:
```javascript
cors: {
  origin: ['https://app.example.com', 'https://admin.example.com']
}
```

### ❌ Mistake 3: No Rate Limiting

```javascript
// Default allows unlimited requests
rateLimit: { enabled: false }
// → Vulnerable to brute force attacks
```

**Fix:** Enable and tune rate limits:
```javascript
rateLimit: {
  enabled: true,
  login: { windowMs: 60000, max: 10 }
}
```

---

## Validation Checklist

**Before deploying to production, verify:**

- ✅ `issuer` matches public URL exactly
- ✅ CORS origin restricted to trusted domains
- ✅ Rate limiting enabled and tuned appropriately
- ✅ Security headers enabled (HSTS for HTTPS)
- ✅ Token expiry times reasonable (15m-1h access, 7d refresh)
- ✅ PKCE enabled for public clients
- ✅ Encryption key is 32+ characters
- ✅ HTTPS used in production (not HTTP)
- ✅ All required scopes configured
- ✅ Custom domains in redirectUris match registered clients

---

## Next Steps

1. **Set up your server** - Use one of the patterns above
2. **Configure scopes** - Define what permissions your API needs
3. **Create users and clients** - See [Getting Started](/plugins/identity/guides/getting-started.md)
4. **Test login flow** - Verify authorization_code flow works
5. **Deploy to production** - Use Pattern 2 configuration

---

**Prev:** [← Getting Started](/plugins/identity/guides/getting-started.md)
**Next:** [Usage Patterns →](/plugins/identity/guides/usage-patterns.md)
**Main:** [← Identity Plugin](/plugins/identity/README.md)
