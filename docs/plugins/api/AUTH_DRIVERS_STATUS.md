# API Plugin - Auth Drivers Status & Analysis

## 📊 Driver Overview

| Driver | Lines | Status | Resource Support | Field Mapping | Notes |
|--------|-------|--------|------------------|---------------|-------|
| **OIDC** | 1646 | ✅ Production-ready | ❌ Uses authResource param | ✅ Has userMapping | Most complete driver |
| **OAuth2** | 282 | ✅ Working | ❌ Uses usersResource param | ⚠️ Hardcoded fields | Resource server mode |
| **JWT** | 226 | ✅ Working | ❌ Uses authResource param | ⚠️ Hardcoded email/password | Simple implementation |
| **Basic** | 152 | ✅ Working | ❌ Uses authResource param | ✅ Has userField/passwordField | Already configurable |
| **API Key** | 92 | ✅ Working | ❌ Uses usersResource param | ⚠️ Hardcoded apiKey field | Very simple |

## 🔍 Detailed Analysis

### 1. OIDC Driver ✅ (Most Advanced)

**File:** `src/plugins/api/auth/oidc-auth.js`

**Current Signature:**
```javascript
createOIDCHandler(config, app, authResource, events)
```

**Features:**
- ✅ Full OpenID Connect Authorization Code Flow
- ✅ Auto user creation/update from token claims
- ✅ Session management (rolling + absolute duration)
- ✅ Token refresh before expiry
- ✅ IdP logout support (Azure AD/Entra compatible)
- ✅ Startup configuration validation
- ✅ User mapping configuration (userMapping option)
- ✅ Provider presets (Azure, Google, Keycloak, etc.)
- ✅ Hooks: onUserAuthenticated

**What Needs Updating:**
```javascript
// BEFORE
createOIDCHandler(config, app, authResource, events)

// AFTER (use config.resource)
const authResource = database.resources[config.resource || 'users'];
createOIDCHandler(config, app, authResource, events)
```

**Config Structure:**
```javascript
{
  driver: 'oidc',
  config: {
    // ✅ ALREADY HAS resource-like concept via authResource
    issuer: 'https://...',
    clientId: '...',
    clientSecret: '...',
    redirectUri: '...',

    // ✅ ALREADY HAS field mapping
    userMapping: {
      id: 'sub',           // Map OIDC 'sub' claim to user.id
      email: 'email',      // Map OIDC 'email' claim
      username: 'preferred_username',
      role: 'role'
    },

    // 🆕 ADD: Explicit resource name
    resource: 'users', // Which resource to store users in

    autoCreateUser: true,
    onUserAuthenticated: async ({ user, created, claims }) => {...}
  }
}
```

---

### 2. OAuth2 Driver ✅ (Resource Server)

**File:** `src/plugins/api/auth/oauth2-auth.js`

**Current Signature:**
```javascript
createOAuth2Handler(config, usersResource)
```

**Features:**
- ✅ JWT access token validation
- ✅ JWKS endpoint fetching and caching
- ✅ Token introspection support (optional)
- ✅ Auto user lookup from database or token claims
- ⚠️ Hardcoded field mapping (sub → id, email, scopes, role)

**What Needs Updating:**
```javascript
// BEFORE
createOAuth2Handler(config, usersResource)
// Hardcoded: payload.sub, payload.email, payload.preferred_username

// AFTER
{
  driver: 'oauth2',
  config: {
    resource: 'users',  // 🆕 ADD

    // 🆕 ADD: Field mapping from token claims
    userMapping: {
      id: 'sub',
      email: 'email',
      username: 'preferred_username',
      role: 'role'
    },

    issuer: '...',
    jwksUri: '...',
    audience: 'my-api',
    algorithms: ['RS256']
  }
}
```

**Changes Needed:**
1. Accept `config.resource` instead of `usersResource` parameter
2. Add `config.userMapping` for flexible field mapping
3. Resolve resource internally: `database.resources[config.resource]`

---

### 3. JWT Driver ✅ (Simple)

**File:** `src/plugins/api/auth/jwt-auth.js`

**Current Signature:**
```javascript
jwtAuth({
  authResource,
  secret,
  optional,
  cookieName,
  expiresIn
})
```

**Features:**
- ✅ Simple HS256 JWT implementation (createToken/verifyToken)
- ✅ Token verification caching (LRU cache, 40-60% performance boost)
- ✅ Cookie fallback support
- ⚠️ Hardcoded field lookup: `email` and `password`

**What Needs Updating:**
```javascript
// BEFORE
jwtAuth({ authResource, secret })
// Hardcoded: users.query({ email })

// AFTER
{
  driver: 'jwt',
  config: {
    resource: 'users',       // 🆕 ADD
    userField: 'email',      // 🆕 ADD (which field to match username/email)
    passwordField: 'password', // 🆕 ADD

    secret: 'my-jwt-secret',
    expiresIn: '7d',
    algorithm: 'HS256',
    cookieName: 'jwt_token', // Optional cookie fallback
    optional: false
  }
}
```

**Changes Needed:**
1. Accept `config.resource` instead of `authResource` parameter
2. Add `config.userField` (default: 'email')
3. Add `config.passwordField` (default: 'password')
4. Update query: `usersResource.query({ [config.userField]: username })`

---

### 4. Basic Auth Driver ✅ (Already Configurable!)

**File:** `src/plugins/api/auth/basic-auth.js`

**Current Signature:**
```javascript
basicAuth({
  authResource,
  usernameField = 'email',   // ✅ ALREADY HAS THIS!
  passwordField = 'password', // ✅ ALREADY HAS THIS!
  realm,
  passphrase,
  optional,
  cookieName,
  tokenField
})
```

**Features:**
- ✅ HTTP Basic Authentication (username:password)
- ✅ Password verification with crypto.decrypt
- ✅ Cookie fallback support (apiToken field)
- ✅ **ALREADY has userField/passwordField configuration!**
- ✅ Admin user bypass support

**What Needs Updating:**
```javascript
// BEFORE
basicAuth({ authResource, usernameField: 'email', passwordField: 'password' })

// AFTER
{
  driver: 'basic',
  config: {
    resource: 'users',      // 🆕 ADD (only this!)
    usernameField: 'email', // ✅ ALREADY EXISTS
    passwordField: 'password', // ✅ ALREADY EXISTS

    realm: 'API',
    passphrase: 'secret',
    optional: false,
    cookieName: 'api_token', // Fallback to apiToken field
    tokenField: 'apiToken'
  }
}
```

**Changes Needed:**
1. Accept `config.resource` instead of `authResource` parameter (THAT'S IT!)

---

### 5. API Key Driver ✅ (Very Simple)

**File:** `src/plugins/api/auth/api-key-auth.js`

**Current Signature:**
```javascript
apiKeyAuth({
  usersResource,
  headerName = 'X-API-Key',
  optional
})
```

**Features:**
- ✅ Simple header-based API key auth
- ✅ Validates against `apiKey` field in users resource
- ⚠️ Hardcoded field: `apiKey`
- ✅ Generates random API keys (generateApiKey function)

**What Needs Updating:**
```javascript
// BEFORE
apiKeyAuth({ usersResource, headerName: 'X-API-Key' })
// Hardcoded: usersResource.query({ apiKey })

// AFTER
{
  driver: 'apiKey',
  config: {
    resource: 'users',          // 🆕 ADD
    keyField: 'apiKey',         // 🆕 ADD (which field has the API key)

    headerName: 'X-API-Key',    // ✅ ALREADY EXISTS
    queryParam: 'api_key',      // 🆕 ADD (optional fallback)
    optional: false
  }
}
```

**Changes Needed:**
1. Accept `config.resource` instead of `usersResource` parameter
2. Add `config.keyField` (default: 'apiKey')
3. Add `config.queryParam` for optional query string fallback
4. Update query: `usersResource.query({ [config.keyField]: apiKey })`

---

## 🎯 Migration Strategy

### Phase 1: Add config.resource Support (All Drivers)

**Change all driver functions to:**
```javascript
// BEFORE: Resource passed as parameter
function createDriver(config, resource) { ... }

// AFTER: Resource resolved from config
function createDriver(config, database) {
  const resource = database.resources[config.resource || 'users'];
  if (!resource) {
    throw new Error(`Resource '${config.resource}' not found`);
  }
  // ... rest of logic
}
```

### Phase 2: Add Field Mapping (Per Driver)

#### JWT & API Key (Simple drivers)
- Add `userField`, `passwordField`, `keyField` to config
- Replace hardcoded field names in queries

#### OAuth2 (Token-based)
- Add `userMapping` object for claim-to-field mapping
- Default to OIDC standard claims

#### OIDC (Already has userMapping)
- Just add `resource` config option
- Keep existing `userMapping` structure

#### Basic Auth (Already done!)
- Already has `usernameField` and `passwordField`
- Just needs `resource` config option

### Phase 3: Update Factory & Strategies

**File:** `src/plugins/api/auth/strategies/factory.class.js`

Update driver instantiation:
```javascript
// BEFORE
const authResource = database.resources[auth.resource];
const middleware = jwtAuth({ authResource, secret });

// AFTER
const middleware = jwtAuth({ ...config, database });
```

---

## 📋 Implementation Checklist

### API Key Driver
- [ ] Add `config.resource` support
- [ ] Add `config.keyField` (default: 'apiKey')
- [ ] Add `config.queryParam` for query string fallback
- [ ] Update field query to use dynamic field name
- [ ] Add tests

### JWT Driver
- [ ] Add `config.resource` support
- [ ] Add `config.userField` (default: 'email')
- [ ] Add `config.passwordField` (default: 'password')
- [ ] Update field query to use dynamic field names
- [ ] Add tests

### Basic Auth Driver
- [ ] Add `config.resource` support (ONLY CHANGE NEEDED!)
- [ ] Keep existing `usernameField`/`passwordField`
- [ ] Add tests

### OAuth2 Driver
- [ ] Add `config.resource` support
- [ ] Add `config.userMapping` for claim mapping
- [ ] Update user lookup logic
- [ ] Add tests

### OIDC Driver
- [ ] Add `config.resource` support
- [ ] Keep existing `userMapping` structure
- [ ] Resolve resource internally
- [ ] Add tests

### Strategy Factory
- [ ] Update driver instantiation to pass `database` instead of `authResource`
- [ ] Add validation for missing resources
- [ ] Add tests

---

## 🚀 Recommended Order

1. **API Key** (simplest - good warm-up)
2. **Basic Auth** (almost done - only needs resource)
3. **JWT** (straightforward - similar to API Key)
4. **OAuth2** (moderate - needs userMapping)
5. **OIDC** (complex - but already has most features)

---

## 💡 Design Principles

### 1. Backward Compatibility
All drivers should maintain backward compatibility:
```javascript
// OLD (still works with deprecation warning)
auth: {
  resource: 'users',
  drivers: [{ driver: 'jwt', config: { secret: 'x' } }]
}

// NEW (recommended)
auth: {
  drivers: [{
    driver: 'jwt',
    config: {
      resource: 'users',
      userField: 'email',
      secret: 'x'
    }
  }]
}
```

### 2. Smart Defaults
Each driver should have sensible defaults:
- `resource: 'users'`
- `userField: 'email'` (JWT)
- `usernameField: 'email'` (Basic)
- `keyField: 'apiKey'` (API Key)
- `userMapping: { id: 'sub', email: 'email' }` (OAuth2)

### 3. Validation
All drivers should validate:
- Resource exists in database
- Required fields exist in resource schema
- Configuration is valid at startup

### 4. Error Messages
Clear, actionable error messages:
```javascript
throw new Error(
  `JWT driver: Resource '${config.resource}' not found in database. ` +
  `Available resources: ${Object.keys(database.resources).join(', ')}`
);
```

---

## 📚 Documentation Needed

For each driver, create:
1. **Configuration Reference** - All config options
2. **Field Mapping Guide** - How to map fields
3. **Migration Guide** - Old → New config
4. **Examples** - Common use cases
5. **Troubleshooting** - Common errors

Example structure:
```
docs/plugins/api/auth/
├── README.md              # Overview of all drivers
├── jwt.md                 # JWT driver docs
├── basic.md               # Basic auth docs
├── apikey.md              # API Key docs
├── oauth2.md              # OAuth2 docs
├── oidc.md                # OIDC docs
└── migration-guide.md     # How to migrate configs
```
