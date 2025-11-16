# Using Identity Plugin as an OIDC Provider

The Identity plugin is a **full OAuth2/OIDC authorization server** compatible with standard OIDC clients. It can be used exactly like Google, Azure AD, Keycloak, or any other OIDC provider.

---

## 🌐 Standard OIDC Integration

### Discovery Document

Identity exposes standard OIDC discovery at:
```
GET /.well-known/openid-configuration
```

Example response:
```json
{
  "issuer": "https://auth.example.com",
  "authorization_endpoint": "https://auth.example.com/oauth/authorize",
  "token_endpoint": "https://auth.example.com/oauth/token",
  "userinfo_endpoint": "https://auth.example.com/oauth/userinfo",
  "jwks_uri": "https://auth.example.com/.well-known/jwks.json",
  "registration_endpoint": "https://auth.example.com/oauth/register",
  "introspection_endpoint": "https://auth.example.com/oauth/introspect",
  "revocation_endpoint": "https://auth.example.com/oauth/revoke",

  "scopes_supported": ["openid", "profile", "email", "offline_access"],
  "response_types_supported": ["code", "token", "id_token"],
  "grant_types_supported": ["authorization_code", "client_credentials", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],

  "claims_supported": [
    "sub", "iss", "aud", "exp", "iat",
    "email", "name", "given_name", "family_name",
    "client_id", "scope",
    "token_use", "service_account", "user", "tenantId", "roles"
  ]
}
```

---

## 🔧 Configuring OIDC Clients

### Example 1: S3DB API Plugin

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  auth: {
    drivers: [
      {
        driver: 'oidc',
        config: {
          issuer: 'https://auth.example.com',
          clientId: 'api-client-123',
          clientSecret: process.env.OIDC_CLIENT_SECRET,
          redirectUri: 'https://api.example.com/auth/callback',
          scopes: ['openid', 'profile', 'email']
        }
      }
    ]
  }
}));
```

That's it! No special configuration needed. The API plugin will:
1. Fetch `/.well-known/openid-configuration`
2. Download JWKS from `jwks_uri`
3. Validate tokens using public keys
4. Extract claims from validated tokens

### Example 2: External Node.js App

```javascript
import { Issuer } from 'openid-client';

// Discover Identity endpoints
const issuer = await Issuer.discover('https://auth.example.com');

// Create OIDC client
const client = new issuer.Client({
  client_id: 'my-app',
  client_secret: process.env.CLIENT_SECRET,
  redirect_uris: ['https://myapp.com/callback'],
  response_types: ['code']
});

// Authorization code flow
const authUrl = client.authorizationUrl({
  scope: 'openid email profile',
  state: 'random-state',
});

// Exchange code for tokens
const tokenSet = await client.callback(
  'https://myapp.com/callback',
  { code: 'auth-code' }
);

console.log(tokenSet.access_token);
console.log(tokenSet.id_token);
console.log(tokenSet.claims()); // { sub, email, name, ... }
```

### Example 3: Python App (authlib)

```python
from authlib.integrations.requests_client import OAuth2Session

client = OAuth2Session(
    client_id='my-app',
    client_secret=os.environ['CLIENT_SECRET'],
    redirect_uri='https://myapp.com/callback'
)

# Discover endpoints
client.fetch_jwks_uri('https://auth.example.com/.well-known/openid-configuration')

# Authorization URL
authorization_url, state = client.create_authorization_url(
    'https://auth.example.com/oauth/authorize',
    scope='openid email profile'
)

# Exchange code for token
token = client.fetch_token(
    'https://auth.example.com/oauth/token',
    authorization_response='https://myapp.com/callback?code=...'
)

print(token['access_token'])
```

---

## 🤖 Service Accounts (Client Credentials Flow)

Service accounts use the standard OAuth2 `client_credentials` grant type.

### 1. Create OAuth Client

Via UI: `https://auth.example.com/admin` → OAuth Clients → Create

Or via API:
```bash
curl -X POST https://auth.example.com/oauth/register \
  -H "Authorization: Basic $(echo -n 'admin:password' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Background Worker",
    "grant_types": ["client_credentials"],
    "scope": "api:read api:write"
  }'
```

Response:
```json
{
  "client_id": "xyz123",
  "client_secret": "abc456...",
  "client_name": "Background Worker",
  "grant_types": ["client_credentials"],
  "scope": "api:read api:write"
}
```

⚠️ **Store `client_secret` securely** - it's only shown once!

### 2. Obtain Access Token

```bash
curl -X POST https://auth.example.com/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=xyz123" \
  -d "client_secret=abc456..." \
  -d "scope=api:read api:write"
```

Response:
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "api:read api:write"
}
```

### 3. Use Token

```bash
curl https://api.example.com/resources \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..."
```

Token payload:
```json
{
  "iss": "https://auth.example.com",
  "sub": "xyz123",
  "aud": "https://auth.example.com",
  "client_id": "xyz123",
  "scope": "api:read api:write",
  "token_use": "service",
  "service_account": {
    "client_id": "xyz123",
    "name": "Background Worker",
    "scopes": ["api:read", "api:write"],
    "audiences": ["https://auth.example.com"]
  },
  "exp": 1234567890,
  "iat": 1234567000
}
```

---

## 🧑 User Authentication (Authorization Code Flow)

Standard OIDC authorization code flow for human users.

### 1. Register OAuth Client

```bash
curl -X POST https://auth.example.com/oauth/register \
  -H "Authorization: Basic $(echo -n 'admin:password' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Web App",
    "grant_types": ["authorization_code", "refresh_token"],
    "redirect_uris": ["https://webapp.example.com/callback"],
    "scope": "openid profile email"
  }'
```

### 2. Authorization URL

```
https://auth.example.com/oauth/authorize
  ?response_type=code
  &client_id=abc123
  &redirect_uri=https://webapp.example.com/callback
  &scope=openid profile email
  &state=random-state
```

User logs in → redirected to:
```
https://webapp.example.com/callback?code=xyz789&state=random-state
```

### 3. Exchange Code for Tokens

```bash
curl -X POST https://auth.example.com/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=xyz789" \
  -d "client_id=abc123" \
  -d "client_secret=secret123" \
  -d "redirect_uri=https://webapp.example.com/callback"
```

Response:
```json
{
  "access_token": "eyJhbGci...",
  "id_token": "eyJhbGci...",
  "refresh_token": "def456...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

Access token payload:
```json
{
  "iss": "https://auth.example.com",
  "sub": "user-123",
  "aud": "abc123",
  "client_id": "abc123",
  "email": "user@example.com",
  "name": "John Doe",
  "token_use": "user",
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "tenantId": "tenant-456",
    "roles": ["admin"]
  },
  "tenantId": "tenant-456",
  "exp": 1234567890,
  "iat": 1234567000
}
```

---

## 📋 Extended Claims

Identity includes non-standard claims that are documented in `claims_supported`:

| Claim | Type | Present In | Description |
|-------|------|-----------|-------------|
| `token_use` | string | All tokens | Type: `"service"`, `"user"`, or `"refresh"` |
| `service_account` | object | Service accounts | Metadata: `client_id`, `name`, `scopes`, `audiences` |
| `user` | object | User tokens | Profile: `id`, `email`, `tenantId`, `roles`, `metadata` |
| `tenantId` | string | User tokens | Tenant ID for multi-tenancy |
| `roles` | array | User tokens | User roles |
| `client_id` | string | All tokens | OAuth client identifier |

**Detecting Service Accounts**:
```javascript
// Option 1: Check token_use
if (claims.token_use === 'service') {
  const { client_id, name } = claims.service_account;
}

// Option 2: Check service_account presence
if (claims.service_account) {
  // It's a service account
}

// Option 3: Check email absence
if (!claims.email) {
  // Likely a service account (users always have email)
}
```

---

## 🔐 Token Validation

Any OIDC library can validate Identity tokens:

### Node.js (jose)
```javascript
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://auth.example.com/.well-known/jwks.json')
);

const { payload } = await jwtVerify(token, JWKS, {
  issuer: 'https://auth.example.com',
  audience: 'my-api-client-id'
});

console.log(payload);
```

### Python (PyJWT)
```python
import jwt
from jwt import PyJWKClient

jwks_client = PyJWKClient('https://auth.example.com/.well-known/jwks.json')
signing_key = jwks_client.get_signing_key_from_jwt(token)

payload = jwt.decode(
    token,
    signing_key.key,
    algorithms=['RS256'],
    issuer='https://auth.example.com',
    audience='my-api-client-id'
)
```

### Go (go-oidc)
```go
import "github.com/coreos/go-oidc/v3/oidc"

provider, _ := oidc.NewProvider(ctx, "https://auth.example.com")

verifier := provider.Verifier(&oidc.Config{
    ClientID: "my-api-client-id",
})

idToken, _ := verifier.Verify(ctx, rawIDToken)
```

---

## 🚀 Why This Approach?

**Standard OIDC = Universal Compatibility**

- ✅ Works with **any** OIDC library (Passport.js, Spring Security, Django OAuth Toolkit)
- ✅ Can replace Google, Azure AD, Keycloak without code changes
- ✅ Documented via standard discovery endpoint
- ✅ No vendor lock-in - just standard OAuth2/OIDC

**Extended Claims = Enhanced Functionality**

- Service accounts are first-class citizens
- Multi-tenancy built-in
- Rich metadata without breaking standards

**Best of both worlds**: Standard protocols + powerful extensions.

---

## 📚 Further Reading

- [OpenID Connect Discovery Spec](https://openid.net/specs/openid-connect-discovery-1_0.html)
- [OAuth 2.0 RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [Identity Plugin API Reference](./README.md)
