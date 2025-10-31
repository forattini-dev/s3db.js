# 🔐 Authentication

> **Quick Jump:** [🔑 JWT](#jwt-authentication) | [🔒 Basic Auth](#basic-authentication) | [🌐 OIDC/OAuth2](#oauth2--openid-connect-sso-authorization-server) | [🎣 User Hooks](#oidc-authentication-with-user-hooks) | [🛡️ Security](#️-security--validation) | [🛤️ Path Auth](#️-path-based-authentication)

> **Navigation:** [← Back to API Plugin](../api.md) | [Guards →](./guards.md) | [Static Files →](./static-files.md)

---

## Overview

The API Plugin uses a **driver-based authentication system** where you choose ONE authentication driver for your API. This approach ensures consistency and simplicity across your entire API.

**Available drivers:**

| Driver | Use Case | Description | Endpoints |
|--------|----------|-------------|-----------|
| `jwt` | Web/Mobile Apps | Token-based auth with login | `/auth/register`, `/auth/login` |
| `basic` | Simple APIs, Scripts | HTTP Basic Auth (username:password) | None (uses Authorization header) |
| `api-key` | Service-to-Service | Static API keys | None (uses X-API-Key header) |
| `oidc` | Microservices (Resource Server) | Validates OAuth2/OIDC tokens from external provider | None (validates Bearer tokens) |
| `oauth2` | Legacy OAuth2 Clients | Validates OAuth2 tokens (deprecated, use `oidc`) | None (validates Bearer tokens) |

**Choosing a driver:**
- ✅ **JWT** - Most common, best for user-facing apps with registration/login
- ✅ **OIDC** - Best for microservices validating tokens from SSO (IdentityPlugin, Azure AD, Keycloak)
- ✅ **API Key** - Best for service-to-service with static keys
- ✅ **Basic** - Best for simple scripts/tools, backward compatibility
- ⚠️ **OAuth2** - Legacy, use OIDC instead

For OAuth2/OIDC Authorization Server (SSO), see [IdentityPlugin](./identity.md).

**Key features:**
- ✅ Resource-based auth configuration (which resource manages users)
- ✅ Configurable username/password fields (default: `email`/`password`)
- ✅ Automatic `/auth` routes (registration, login for JWT)
- ✅ Per-resource auth requirements

---

## JWT Authentication

JWT (JSON Web Token) provides stateless authentication where users receive a token after login that must be included in subsequent requests.

**Setup:**
```javascript
// Create users resource FIRST (can be named anything)
const users = await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    email: 'string|required|email',
    password: 'password|required|min:8',  // Automatically hashed with bcrypt
    role: 'string|optional',
    active: 'boolean|default:true'
  }
});

// Configure API with JWT driver
await db.usePlugin(new ApiPlugin({
  port: 3000,
  auth: {
    driver: 'jwt',                        // Choose JWT driver
    resource: 'users',                    // Resource that manages auth
    usernameField: 'email',               // Field for username (default: 'email')
    passwordField: 'password',            // Field for password (default: 'password')
  config: {
    jwtSecret: 'your-256-bit-secret',  // Required for JWT
    jwtExpiresIn: '7d',                // Token expiration (default: 7d)
    registration: {
      enabled: true,                  // Enable /auth/register (default: false)
      allowedFields: ['name']         // Optional extra fields accepted during registration
    },
    loginThrottle: {                  // Optional login throttling (defaults shown)
      maxAttempts: 5,
      windowMs: 60000,
      blockDurationMs: 300000
    }
  }
},
  resources: {
    cars: {
      auth: true  // Require authentication for this resource
    }
  }
}));
```

**Generated routes:**
- `POST /auth/register` (when enabled) - Register new user with minimal fields
- `POST /auth/login` - Login and get JWT token
- `POST /auth/token/refresh` - Refresh JWT token
- `GET /auth/me` - Get current user info
- `POST /auth/api-key/regenerate` - Regenerate API key

**Usage flow:**
```bash
# 1. Register new user
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
-d '{
    "email": "john@example.com",
    "password": "secret123",
    "name": "John"
  }'

# Response:
# {
#   "success": true,
#   "data": {
#     "user": { "id": "abc123", "email": "john@example.com", "name": "John", "role": "user" },
#     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
#   }
# }

# 2. Login (if already registered)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "secret123"
  }'

# Response:
# {
#   "success": true,
#   "data": {
#     "user": { "id": "abc123", "email": "john@example.com" },
#     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#     "expiresIn": "7d"
#   }
# }

# 3. Use token to access protected resources
curl http://localhost:3000/cars \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Basic Authentication

HTTP Basic Auth validates credentials on EVERY request by checking username:password against your auth resource.

**Setup:**
```javascript
// Create users resource FIRST
const users = await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    email: 'string|required|email',
    password: 'password|required|min:8',  // Automatically hashed with bcrypt
    active: 'boolean|default:true'
  }
});

// Configure API with Basic Auth driver
await db.usePlugin(new ApiPlugin({
  port: 3000,
  auth: {
    driver: 'basic',                      // Choose Basic Auth driver
    resource: 'users',                    // Resource that manages auth
    usernameField: 'email',               // Field for username (default: 'email')
    passwordField: 'password',            // Field for password (default: 'password')
  config: {
    realm: 'API Access',                // WWW-Authenticate realm (default: 'API Access')
    registration: {
      enabled: true                    // Enable /auth/register (default: false)
    }
  }
},
  resources: {
    cars: {
      auth: true  // Require authentication
    }
  }
}));
```

**Usage:**
```bash
# 1. Register user (if registration enabled)
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "secret123"
  }'

# 2. Access resources with Basic Auth
curl http://localhost:3000/cars \
  -u john@example.com:secret123

# Or with Authorization header
curl http://localhost:3000/cars \
  -H "Authorization: Basic $(echo -n 'john@example.com:secret123' | base64)"
```

**Note:** Basic Auth validates credentials on every request, so it's simpler but requires sending credentials each time. JWT is more efficient for frequent requests after initial login.

---

## OAuth2 + OpenID Connect (SSO Authorization Server)

For **centralized OAuth2/OIDC Authorization Server** (Single Sign-On server that issues tokens), use the **[IdentityPlugin](./identity.md)**.

**📖 [Complete IdentityPlugin Documentation](./identity.md)** - Full OAuth2/OIDC Authorization Server with Azure AD/Keycloak feature parity

The **IdentityPlugin** is a dedicated plugin for creating OAuth2/OIDC Authorization Servers with:
- ✅ 9 endpoints (Discovery, JWKS, Token, Authorize, UserInfo, Introspect, Revoke, Register)
- ✅ 4 grant types (authorization_code, client_credentials, refresh_token, PKCE)
- ✅ RS256 signing with auto-generated RSA keys
- ✅ Built-in login UI for authorization_code flow
- ✅ Enterprise features (token revocation, dynamic client registration)

**Quick Example:**
```javascript
import { IdentityPlugin } from 's3db.js';

const identityPlugin = new IdentityPlugin({
  port: 4000,
  issuer: 'http://localhost:4000',
  supportedScopes: ['openid', 'profile', 'email', 'read:api', 'write:api'],
  supportedGrantTypes: ['authorization_code', 'client_credentials', 'refresh_token'],
  accessTokenExpiry: '15m'
});

await db.usePlugin(identityPlugin);
// 🎉 You now have a full OAuth2/OIDC Authorization Server!
```

**For Resource Servers (APIs that validate tokens):**

The **ApiPlugin** includes OIDC client support for validating tokens issued by external OAuth2/OIDC providers (like IdentityPlugin, Azure AD, Keycloak):

```javascript
import { ApiPlugin } from 's3db.js';

const apiPlugin = new ApiPlugin({
  port: 3000,
  auth: {
    driver: 'oidc',
    config: {
      issuer: 'http://localhost:4000',  // SSO server URL (IdentityPlugin)
      audience: 'http://localhost:3000',
      jwksCacheTTL: 3600000  // Cache JWKS for 1 hour
    }
  },
  resources: {
    orders: { auth: true }  // Protected by OIDC token validation
  }
});

await db.usePlugin(apiPlugin);
```

**When to use:**
- ✅ **IdentityPlugin** - Create SSO server (Authorization Server that issues tokens)
- ✅ **ApiPlugin with OIDC driver** - Create Resource Server (API that validates tokens from SSO)

**See also:**
- **[IdentityPlugin Documentation](./identity.md)** - Authorization Server documentation
- **[OAuth2/OIDC Guide](../oauth2-guide.md)** - Complete OAuth2 architecture guide
- **[Example 80](../examples/e80-sso-oauth2-server.js)** - SSO Server with IdentityPlugin
- **[Example 81](../examples/e81-oauth2-resource-server.js)** - Resource Server with ApiPlugin + OIDC driver
- **[Example 82](../examples/e82-oidc-web-app.js)** - Web App with Authorization Code Flow

---

## OIDC Authentication with User Hooks

When using OIDC for **web application login** (Authorization Code Flow), you can execute custom logic after a user authenticates using the `onUserAuthenticated` hook. This is useful for:
- Creating user profiles with extra data not in the IDP
- Sending welcome emails to new users
- Logging authentication events for audit
- Initializing user preferences/settings
- Setting cookies for API token management

**Configuration:**

```javascript
import { ApiPlugin } from 's3db.js';

const apiPlugin = new ApiPlugin({
  port: 3000,
  auth: {
    drivers: [
      {
        driver: 'oidc',
        config: {
          // OIDC/OAuth2 Configuration
          issuer: 'https://accounts.google.com',
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          redirectUri: 'http://localhost:3000/auth/oidc/callback',
          scopes: ['openid', 'profile', 'email'],

          // Session Configuration
          cookieSecret: 'my-super-secret-cookie-key-minimum-32-chars!!!',
          rollingDuration: 86400000,  // 24 hours
          absoluteDuration: 604800000, // 7 days

          // Auto-create user in database
          autoCreateUser: true,

          // 🎯 Hook: Called after user authentication
          onUserAuthenticated: async ({ user, created, claims, tokens, context }) => {
            console.log('User authenticated:', user.email);

            // 1. Create profile if new user
            if (created) {
              await db.resources.profiles.insert({
                id: `profile-${user.id}`,
                userId: user.id,
                bio: '',
                company: '',
                preferences: {
                  theme: 'light',
                  language: 'en',
                  notifications: true
                }
              });

              // 2. Send welcome email
              await sendWelcomeEmail(user.email, claims.name);

              // 3. Log first login event
              await db.resources.auth_events.insert({
                id: generateId(),
                userId: user.id,
                event: 'first_login',
                provider: claims.iss,
                metadata: {
                  name: claims.name,
                  picture: claims.picture,
                  locale: claims.locale
                }
              });
            } else {
              // Existing user - log regular login
              await db.resources.auth_events.insert({
                id: generateId(),
                userId: user.id,
                event: 'login',
                provider: claims.iss
              });
            }

            // 4. Set cookie with API token (for independent API usage)
            if (user.apiToken) {
              context.cookie('api_token', user.apiToken, {
                httpOnly: true,        // Cannot be accessed by JavaScript
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Lax',       // CSRF protection
                maxAge: 7 * 24 * 60 * 60,  // 7 days in seconds
                path: '/'
              });
            }
          }
        }
      }
    ],
    resource: 'users'
  }
}));

await db.usePlugin(apiPlugin);
```

**Hook Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `user` | Object | User object from the users resource (after create/update) |
| `created` | Boolean | `true` if this is a new user, `false` if existing user |
| `claims` | Object | ID token claims from the IDP (email, name, picture, etc.) |
| `tokens` | Object | OAuth2 tokens: `{ access_token, id_token, refresh_token }` |
| `context` | HonoContext | Hono request/response context for cookie/header manipulation |

**Common Use Cases:**

**1. Create User Profile**
```javascript
onUserAuthenticated: async ({ user, created, claims }) => {
  if (created) {
    await db.resources.profiles.insert({
      id: `profile-${user.id}`,
      userId: user.id,
      bio: '',
      avatar: claims.picture,
      locale: claims.locale || 'en'
    });
  }
}
```

**2. Send Welcome Email**
```javascript
onUserAuthenticated: async ({ user, created, claims }) => {
  if (created) {
    await emailService.send({
      to: user.email,
      subject: 'Welcome!',
      template: 'welcome',
      data: { name: claims.name }
    });
  }
}
```

**3. Set API Token Cookie**
```javascript
// This pattern allows users to login once via OIDC, then use your API
// independently without re-authenticating with the IDP
onUserAuthenticated: async ({ user, context }) => {
  // Get user with API token (generated by database event hook)
  const updatedUser = await db.resources.users.get(user.id);

  // Set secure cookie
  context.cookie('api_token', updatedUser.apiToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 7 * 24 * 60 * 60
  });
}
```

**4. Log Authentication Events**
```javascript
onUserAuthenticated: async ({ user, created, claims }) => {
  await db.resources.auth_events.insert({
    id: generateId(),
    userId: user.id,
    event: created ? 'first_login' : 'login',
    provider: claims.iss,
    metadata: {
      ip: context.req.header('x-forwarded-for'),
      userAgent: context.req.header('user-agent')
    }
  });
}
```

**Cookie Manipulation:**

The `context` parameter is a Hono context object, giving you full control over cookies and headers:

```javascript
onUserAuthenticated: async ({ context }) => {
  // Set cookie
  context.cookie('session_id', 'abc123', {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 3600  // seconds
  });

  // Delete cookie
  context.cookie('old_session', '', { maxAge: 0 });

  // Set custom header
  context.header('X-User-ID', user.id);
}
```

**Error Handling:**

If the hook fails, authentication continues but the error is logged. This ensures that hook failures don't block user login.

```javascript
onUserAuthenticated: async ({ user, created }) => {
  try {
    // Your custom logic
    await db.resources.profiles.insert({ ... });
  } catch (err) {
    console.error('Hook failed:', err);
    // Authentication continues despite error
  }
}
```

**Examples:**

- **[Example 86: OIDC User Hooks](../examples/e86-oidc-user-hooks.js)** - Profile creation, welcome emails, event logging
- **[Example 87: OIDC + API Token Cookie](../examples/e87-oidc-api-token-cookie.js)** - Complete flow: OIDC login → generate API token → set cookie → independent API usage

---

## Custom Username/Password Fields

You can use any field names for username and password:

```javascript
// Example: Using 'username' instead of 'email'
const accounts = await db.createResource({
  name: 'accounts',
  attributes: {
    id: 'string|required',
    username: 'string|required',        // Custom username field
    secretKey: 'secret|required',       // Custom password field
    isActive: 'boolean|default:true'
  }
});

await db.usePlugin(new ApiPlugin({
  auth: {
    driver: 'jwt',
    resource: 'accounts',              // Different resource name
    usernameField: 'username',         // Use 'username' field
    passwordField: 'secretKey',        // Use 'secretKey' field
    config: {
      jwtSecret: 'your-secret',
      jwtExpiresIn: '30d'
    }
  }
}));
```

---

## Public vs Protected Resources

Control authentication per resource:

```javascript
resources: {
  // Public resource - no auth required
  products: {
    auth: false,
    methods: ['GET']  // Read-only public access
  },

  // Protected resource - auth required
  orders: {
    auth: true,       // Requires authentication
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
}
```

---

## 🛡️ Security & Validation

The API Plugin implements industry-standard security practices to protect your data and routes.

### ✅ Security Guarantees

**JWT Driver Protection:**
- ✅ All HTTP methods (GET, POST, PUT, DELETE) blocked without valid token (401 Unauthorized)
- ✅ Malformed tokens rejected (invalid structure, missing Bearer prefix, empty token)
- ✅ Invalid signatures rejected (tampered tokens, wrong secret, modified payload)
- ✅ Expired tokens rejected automatically
- ✅ Public routes accessible without authentication

**Basic Auth Driver Protection:**
- ✅ All HTTP methods blocked without credentials (401 + WWW-Authenticate header)
- ✅ Wrong username/password combinations rejected
- ✅ Malformed Authorization headers rejected
- ✅ Credentials validated on every request (stateless)
- ✅ Public routes accessible without authentication

### 🔐 Best Practices

**JWT Authentication:**
```javascript
auth: {
  driver: 'jwt',
  config: {
    jwtSecret: process.env.JWT_SECRET,        // Use environment variables
    jwtExpiresIn: '1h',                       // Short expiration for sensitive apps
  }
}
```

**Basic Authentication:**
```javascript
auth: {
  driver: 'basic',
  config: {
    realm: 'Production API',                   // Descriptive realm name
    passphrase: process.env.ENCRYPTION_KEY     // Secure passphrase
  }
}
```

**Resource Protection:**
```javascript
resources: {
  // Protect sensitive resources
  payments: {
    auth: true,  // ✅ Requires authentication
    methods: ['GET', 'POST']
  },

  // Public data can be open
  products: {
    auth: false,  // ✅ Public read access
    methods: ['GET']
  }
}
```

### ⚠️ Security Notes

1. **Always use HTTPS in production** - Authentication headers can be intercepted over HTTP
2. **Store JWT secrets securely** - Use environment variables, never commit secrets to git
3. **Use strong passwords** - Minimum 8 characters enforced by default
4. **Rotate secrets regularly** - Update `jwtSecret` and `passphrase` periodically
5. **Monitor failed login attempts** - Implement rate limiting for `/auth/login`
6. **Validate token expiration** - Shorter expiration = better security (trade-off with UX)

---

## 🛤️ Path-Based Authentication

**Path-based authentication** allows you to apply different authentication rules to different URL patterns. This is useful for scenarios like:
- Protecting admin panels with different authentication
- Serving public static files alongside protected APIs
- Mixing authenticated and unauthenticated routes
- Implementing different auth strategies for different parts of your app

### Configuration

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  auth: {
    drivers: [
      {
        driver: 'jwt',
        config: { secret: 'jwt-secret' }
      },
      {
        driver: 'apiKey',
        config: {
          headerName: 'X-API-Key',
          cookieName: 'api_token',
          tokenField: 'apiToken'
        }
      }
    ],
    resource: 'users',

    // 🔥 pathAuth: Define authentication per URL pattern
    pathAuth: [
      // Public routes - no authentication
      {
        pattern: '/health/**',
        required: false
      },

      // Auth endpoints - public (for login/register)
      {
        pattern: '/auth/**',
        required: false
      },

      // Protected API - requires JWT
      {
        pattern: '/api/**',
        drivers: ['jwt'],
        required: true
      },

      // Admin panel - requires API Key
      {
        pattern: '/admin/**',
        drivers: ['apiKey'],
        required: true
      },

      // Static files - public
      {
        pattern: '/public/**',
        required: false
      }
    ]
  }
}));
```

### Pattern Matching

Patterns support wildcards:
- `*` - Matches any single path segment (e.g., `/users/*` matches `/users/123` but not `/users/123/posts`)
- `**` - Matches any path including sub-paths (e.g., `/api/**` matches `/api/v1/users`, `/api/v1/users/123/posts`, etc.)

**Examples:**

| Pattern | Matches | Doesn't Match |
|---------|---------|---------------|
| `/api/*` | `/api/users`, `/api/orders` | `/api/v1/users` (nested) |
| `/api/**` | `/api/users`, `/api/v1/users`, `/api/v1/users/123/posts` | `/apiv1/users` (no slash) |
| `/admin/*/dashboard` | `/admin/123/dashboard` | `/admin/123/reports/dashboard` |
| `/files/*.pdf` | `/files/report.pdf` | `/files/2024/report.pdf` |

### Evaluation Order

Path patterns are evaluated **in the order they are defined**. The first matching pattern wins.

```javascript
pathAuth: [
  // More specific patterns first
  {
    pattern: '/api/admin/**',
    drivers: ['apiKey'],
    required: true
  },

  // Less specific patterns later
  {
    pattern: '/api/**',
    drivers: ['jwt'],
    required: true
  },

  // Catch-all public
  {
    pattern: '/**',
    required: false
  }
]
```

### Driver Selection

You can specify which authentication drivers to use for each pattern:

```javascript
pathAuth: [
  // Use JWT for API
  {
    pattern: '/api/**',
    drivers: ['jwt'],  // Only JWT driver
    required: true
  },

  // Use API Key for admin
  {
    pattern: '/admin/**',
    drivers: ['apiKey'],  // Only API Key driver
    required: true
  },

  // Use either JWT or API Key for internal
  {
    pattern: '/internal/**',
    drivers: ['jwt', 'apiKey'],  // Try JWT first, then API Key
    required: true
  }
]
```

### Use Cases

**1. Protected SPA with Public Login**
```javascript
pathAuth: [
  {
    pattern: '/auth/**',
    required: false  // Login page public
  },
  {
    pattern: '/app/**',
    drivers: ['jwt'],
    required: true   // React app protected
  }
]
```

**2. Mixed Public/Protected API**
```javascript
pathAuth: [
  {
    pattern: '/api/public/**',
    required: false  // Public product catalog
  },
  {
    pattern: '/api/**',
    drivers: ['jwt'],
    required: true   // Protected user data
  }
]
```

**3. Multi-Level Authentication**
```javascript
pathAuth: [
  {
    pattern: '/api/admin/**',
    drivers: ['apiKey'],
    required: true   // Admin: API Key only
  },
  {
    pattern: '/api/**',
    drivers: ['jwt', 'apiKey'],
    required: true   // API: JWT or API Key
  }
]
```

### Examples

- **[Example 85: Protected SPA](../examples/e85-protected-spa.js)** - Protect React app with JWT using pathAuth
- **[Example 87: OIDC + API Token Cookie](../examples/e87-oidc-api-token-cookie.js)** - Login via OIDC, use API token cookie for subsequent requests

---

## 🎯 Summary

You learned:
- ✅ **JWT Authentication** - Token-based auth with registration/login endpoints
- ✅ **Basic Authentication** - HTTP Basic Auth for simple APIs and scripts
- ✅ **OIDC/OAuth2** - Validating tokens from external providers (SSO, Azure AD, Keycloak)
- ✅ **User Hooks** - Custom logic after OIDC authentication (profiles, emails, cookies)
- ✅ **Path-Based Auth** - Different authentication rules for different URL patterns
- ✅ **Security Best Practices** - HTTPS, strong secrets, token expiration, rate limiting

**Next Steps:**
1. Add authorization logic: [Guards →](./guards.md)
2. Serve static files: [Static Files →](./static-files.md)
3. Try JWT example: [Example 47](../../examples/e47-api-plugin-basic.js)
4. Try OIDC example: [Example 86](../../examples/e86-oidc-user-hooks.js)
5. Create SSO server: [Identity Plugin →](../identity.md)

---

## 🔗 See Also

**Related Documentation:**
- [API Plugin](../api.md) - Main API Plugin documentation
- [Guards](./guards.md) - Row-level security and authorization
- [Static Files](./static-files.md) - Serve React/Vue/Angular apps with auth
- [Identity Plugin](../identity.md) - OAuth2/OIDC Authorization Server (SSO)
- [Configuration](./configuration.md) - Complete configuration reference

**Examples:**
- [e47-api-plugin-basic.js](../../examples/e47-api-plugin-basic.js) - JWT basic usage
- [e49-api-plugin-complete.js](../../examples/e49-api-plugin-complete.js) - All auth drivers
- [e80-sso-oauth2-server.js](../../examples/e80-sso-oauth2-server.js) - SSO server with IdentityPlugin
- [e81-oauth2-resource-server.js](../../examples/e81-oauth2-resource-server.js) - Resource server (API)
- [e86-oidc-user-hooks.js](../../examples/e86-oidc-user-hooks.js) - OIDC with user hooks
- [e87-oidc-api-token-cookie.js](../../examples/e87-oidc-api-token-cookie.js) - OIDC + API token cookie

---

> **Navigation:** [← Back to API Plugin](../api.md) | [Guards →](./guards.md) | [Static Files →](./static-files.md)
