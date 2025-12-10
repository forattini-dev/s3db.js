# 🔧 API Reference

> **Quick Jump:** [Discovery](#1-discovery-endpoint) | [JWKS](#2-jwks-endpoint) | [Token](#3-token-endpoint) | [Authorize](#4-authorization-endpoint-get) | [UserInfo](#6-userinfo-endpoint) | [Introspect](#7-token-introspection) | [Revoke](#8-token-revocation) | [Register](#9-dynamic-client-registration)

> **Navigation:** [← Back to Identity Plugin](./README.md) | [← Architecture](./architecture.md) | [Integration →](./integration.md)

---

## Overview

Complete API reference for all 9 OAuth2/OIDC endpoints provided by the Identity Plugin. Includes request/response examples and authentication methods.

---

## 9 OAuth2/OIDC Endpoints

The IdentityPlugin automatically creates these endpoints:

### 9 OAuth2/OIDC Endpoints

The IdentityPlugin automatically creates these endpoints:

#### 1. Discovery Endpoint

**GET `/.well-known/openid-configuration`**

Returns OIDC Discovery document with metadata about the authorization server.

```bash
curl http://localhost:4000/.well-known/openid-configuration
```

**Response:**
```json
{
  "issuer": "http://localhost:4000",
  "authorization_endpoint": "http://localhost:4000/oauth/authorize",
  "token_endpoint": "http://localhost:4000/oauth/token",
  "userinfo_endpoint": "http://localhost:4000/oauth/userinfo",
  "jwks_uri": "http://localhost:4000/.well-known/jwks.json",
  "introspection_endpoint": "http://localhost:4000/oauth/introspect",
  "revocation_endpoint": "http://localhost:4000/oauth/revoke",
  "registration_endpoint": "http://localhost:4000/oauth/register",
  "scopes_supported": ["openid", "profile", "email", "read:api", "write:api"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "client_credentials", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "code_challenge_methods_supported": ["S256"]
}
```

#### 2. JWKS Endpoint

**GET `/.well-known/jwks.json`**

Returns JSON Web Key Set (JWKS) with public keys for token verification.

```bash
curl http://localhost:4000/.well-known/jwks.json
```

**Response:**
```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "kid": "2024-01-15T10:30:00.000Z",
      "alg": "RS256",
      "n": "xGOXUw...",
      "e": "AQAB"
    }
  ]
}
```

#### 3. Token Endpoint

**POST `/oauth/token`**

Issues access tokens, ID tokens, and refresh tokens. Supports multiple grant types.

**Client Credentials Grant:**
```bash
curl -X POST http://localhost:4000/oauth/token \
  -H "Authorization: Basic $(echo -n 'app-client-123:super-secret-key-456' | base64)" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&scope=read:api write:api"
```

**Authorization Code Grant:**
```bash
curl -X POST http://localhost:4000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=AUTH_CODE" \
  -d "redirect_uri=http://localhost:3000/callback" \
  -d "client_id=app-client-123" \
  -d "client_secret=super-secret-key-456"
```

**Refresh Token Grant:**
```bash
curl -X POST http://localhost:4000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "refresh_token=REFRESH_TOKEN" \
  -d "client_id=app-client-123" \
  -d "client_secret=super-secret-key-456"
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjIwMjQtMDEtMTV...",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "read:api write:api",
  "id_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjIwMjQtMDEtMTV...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjIwMjQtMDEtMTV..."
}
```

#### 4. Authorization Endpoint (GET)

**GET `/oauth/authorize`**

Displays login form for authorization_code flow.

```bash
# Browser navigation:
http://localhost:4000/oauth/authorize?response_type=code&client_id=app-client-123&redirect_uri=http://localhost:3000/callback&scope=openid%20profile&state=xyz123
```

**Query Parameters:**
- `response_type` (required): "code" for authorization_code flow
- `client_id` (required): Registered client identifier
- `redirect_uri` (required): Callback URL (must match registered URI)
- `scope` (optional): Space-separated scopes (default: "openid")
- `state` (recommended): CSRF protection token
- `nonce` (optional): Replay attack protection
- `code_challenge` (PKCE): Base64-URL encoded SHA256 hash
- `code_challenge_method` (PKCE): "S256"

**Response:**
- HTML login form with email/password fields
- On success: Redirects to `redirect_uri?code=AUTH_CODE&state=xyz123`
- On error: Redirects to `redirect_uri?error=invalid_request&error_description=...`

#### 5. Authorization Endpoint (POST)

**POST `/oauth/authorize`**

Processes login form submission.

```bash
curl -X POST http://localhost:4000/oauth/authorize \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=admin@sso.local" \
  -d "password=Admin123!" \
  -d "client_id=app-client-123" \
  -d "redirect_uri=http://localhost:3000/callback" \
  -d "scope=openid profile" \
  -d "state=xyz123" \
  -d "response_type=code"
```

#### 6. UserInfo Endpoint

**GET `/oauth/userinfo`**

Returns user profile information (OIDC standard).

```bash
curl http://localhost:4000/oauth/userinfo \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

**Response:**
```json
{
  "sub": "user-id-123",
  "email": "admin@sso.local",
  "name": "Admin User",
  "email_verified": false,
  "iss": "http://localhost:4000",
  "aud": "app-client-123"
}
```

#### 7. Token Introspection

**POST `/oauth/introspect`**

Validates and returns token metadata (RFC 7662).

```bash
curl -X POST http://localhost:4000/oauth/introspect \
  -H "Authorization: Basic $(echo -n 'app-client-123:super-secret-key-456' | base64)" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=ACCESS_TOKEN"
```

**Response (active token):**
```json
{
  "active": true,
  "scope": "read:api write:api",
  "client_id": "app-client-123",
  "sub": "user-id-123",
  "exp": 1705332000,
  "iat": 1705331100,
  "iss": "http://localhost:4000",
  "aud": "app-client-123"
}
```

**Response (inactive token):**
```json
{
  "active": false
}
```

#### 8. Token Revocation

**POST `/oauth/revoke`**

Revokes access or refresh tokens (RFC 7009).

```bash
curl -X POST http://localhost:4000/oauth/revoke \
  -H "Authorization: Basic $(echo -n 'app-client-123:super-secret-key-456' | base64)" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=ACCESS_TOKEN" \
  -d "token_type_hint=access_token"
```

**Response:**
```
200 OK (always returns 200 for security)
```

#### 9. Dynamic Client Registration

**POST `/oauth/register`**

Dynamically registers new OAuth2 clients (RFC 7591).

```bash
curl -X POST http://localhost:4000/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "My New App",
    "redirect_uris": ["http://localhost:3002/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "scope": "openid profile email"
  }'
```

**Response:**
```json
{
  "client_id": "auto-generated-client-id",
  "client_secret": "auto-generated-client-secret",
  "client_name": "My New App",
  "redirect_uris": ["http://localhost:3002/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "client_secret_basic",
  "created_at": "2024-01-15T10:30:00.000Z"
}
```

### Client Management Methods

Auto-created resource: `plg_oauth_clients`

```javascript
const clientsResource = db.resources.plg_oauth_clients;

// Create client manually
const client = await clientsResource.insert({
  clientId: 'my-app-123',
  clientSecret: 'my-super-secret-key',
  name: 'My Application',
  redirectUris: ['http://localhost:3000/callback'],
  allowedScopes: ['openid', 'profile', 'email'],
  grantTypes: ['authorization_code', 'refresh_token'],
  active: true
});

// Rotate client secret
const newSecret = crypto.randomBytes(32).toString('base64url');
await clientsResource.update(clientId, { clientSecret: newSecret });

// Deactivate client
await clientsResource.update(clientId, { active: false });

// Delete client
await clientsResource.delete(clientId);
```

---

## 🎯 Summary

**All 9 endpoints at a glance:**
1. **Discovery** - Auto-configuration metadata
2. **JWKS** - Public keys for token verification
3. **Token** - Issue access/ID/refresh tokens
4. **Authorize (GET)** - Login UI for authorization_code flow
5. **Authorize (POST)** - Process login form
6. **UserInfo** - Get user profile
7. **Introspect** - Validate token metadata
8. **Revoke** - Revoke tokens
9. **Register** - Dynamic client registration

**Next Steps:**
1. Integrate Resource Server: [Integration Guide →](./integration.md)
2. Solve common issues: [Troubleshooting →](./troubleshooting.md)

---

## 🔗 See Also

**Related Documentation:**
- [Configuration Reference](./configuration.md) - Configure endpoints and features
- [Architecture & Token Flow](./architecture.md) - Understand how tokens flow
- [Integration Guide](./integration.md) - Connect your apps
- [Troubleshooting](./troubleshooting.md) - Common errors and solutions
- [Identity Plugin Main](./README.md) - Overview and quickstart

**Examples:**
- [e80-sso-oauth2-server.js](/examples/e80-sso-oauth2-server.js) - Complete SSO server
- [e81-oauth2-resource-server.js](/examples/e81-oauth2-resource-server.js) - Resource Server validating tokens
- [e82-oidc-web-app.js](/examples/e82-oidc-web-app.js) - Web app integration

---

> **Navigation:** [↑ Top](#) | [← Architecture](./architecture.md) | [Integration →](./integration.md) | [← Back to Identity Plugin](./README.md)
