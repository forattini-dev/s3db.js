# 🏗️ Architecture & Token Flow

> **Quick Jump:** [System Arch](#system-architecture) | [SSO Flow](#complete-sso-flow) | [Grant Types](#grant-types-explained) | [Token Structure](#token-structure) | [RS256 vs HS256](#rs256-vs-hs256-security-model)

> **Navigation:** [← Back to Identity Plugin](./README.md) | [← Configuration](./configuration.md) | [API Reference →](./api-reference.md)

---

## Overview

Deep dive into Identity Plugin architecture, OAuth2/OIDC flows, and security models. Understand how tokens flow through your microservices ecosystem.

---

### System Architecture

```mermaid
graph TB
    Client[Client Application]
    SSO[SSO Server<br/>Port 4000<br/>Authorization Server]
    Orders[Orders API<br/>Port 3001<br/>Resource Server]
    Products[Products API<br/>Port 3002<br/>Resource Server]
    Payments[Payments API<br/>Port 3003<br/>Resource Server]

    Client -->|1. POST /oauth/token<br/>client_id + client_secret| SSO
    SSO -->|2. Access Token<br/>RS256 signed JWT| Client

    Client -->|3. GET /orders<br/>Bearer token| Orders
    Client -->|3. GET /products<br/>SAME token| Products
    Client -->|3. POST /payments<br/>SAME token| Payments

    SSO -.->|JWKS<br/>Public Keys| Orders
    SSO -.->|JWKS<br/>Public Keys| Products
    SSO -.->|JWKS<br/>Public Keys| Payments

```

**Key Benefits:**
- ✅ Centralized authentication (single SSO service)
- ✅ Distributed authorization (APIs validate independently)
- ✅ No shared secrets (APIs only need public keys)
- ✅ One token, multiple services

### Complete SSO Flow

```mermaid
sequenceDiagram
    participant Client
    participant SSO as SSO Server<br/>(Port 4000)
    participant Orders as Orders API<br/>(Port 3001)

    Note over SSO: Initialization
    SSO->>SSO: Generate RSA key pair<br/>(private + public)
    SSO->>SSO: Store in plg_oauth_keys<br/>(private key encrypted)

    Note over Orders: Resource Server Init
    Orders->>SSO: GET /.well-known/jwks.json
    SSO-->>Orders: Public keys (JWKS)
    Orders->>Orders: Cache JWKS (1 hour)

    Note over Client,SSO: Step 1: Get Token
    Client->>SSO: POST /oauth/token<br/>grant_type=client_credentials<br/>client_id + client_secret
    SSO->>SSO: Validate client credentials
    SSO->>SSO: Create JWT payload<br/>{iss, sub, aud, scope, exp}
    SSO->>SSO: Sign with PRIVATE key (RS256)
    SSO-->>Client: access_token: eyJhbGci...

    Note over Client,Orders: Step 2: Access Orders API
    Client->>Orders: GET /orders<br/>Authorization: Bearer eyJhbGci...
    Orders->>Orders: Extract token from header
    Orders->>Orders: Decode JWT header<br/>Extract kid (key ID)
    Orders->>Orders: Get public key from JWKS cache
    Orders->>Orders: Verify signature with PUBLIC key
    Orders->>Orders: Validate claims<br/>(iss, aud, exp)
    Orders->>Orders: Check scope: orders:read ✓
    Orders-->>Client: { orders: [...] }

    Note over Orders: NO communication with SSO!<br/>Validation is 100% local!
```

### Grant Types Explained

#### 1. Client Credentials (Service-to-Service)

**Use Case:** Backend services authenticating with each other (no user involved).

**Flow:**
```
Service A → POST /oauth/token (client_id + client_secret)
         ← Access Token (no refresh token)
```

**Token Payload:**
```json
{
  "sub": "service-a",
  "aud": "http://localhost:4000",
  "iss": "http://localhost:4000",
  "scope": "read:api",
  "client_id": "service-a",
  "exp": 1705332000,
  "iat": 1705331100
}
```

#### 2. Authorization Code (Web Apps)

**Use Case:** Web applications with a backend server (user login flow).

**Flow:**
```
1. User → GET /oauth/authorize?... (browser)
2. User logs in with email/password
3. SSO → Redirect to callback?code=AUTH_CODE
4. App → POST /oauth/token (code + client_secret)
5. SSO → Access Token + ID Token + Refresh Token
```

#### 3. Refresh Token (Token Renewal)

**Use Case:** Renew expired access tokens without re-authentication.

**Flow:**
```
App → POST /oauth/token (refresh_token + client_secret)
    ← New Access Token + New Refresh Token
```

#### 4. PKCE (Proof Key for Code Exchange)

**Use Case:** Mobile apps and SPAs (public clients without client_secret).

**Flow:**
```
1. App generates code_verifier (random 43-128 chars)
2. App generates code_challenge = base64url(sha256(code_verifier))
3. App → GET /oauth/authorize?...&code_challenge=CHALLENGE&code_challenge_method=S256
4. SSO → Redirect with authorization code
5. App → POST /oauth/token (code + code_verifier)
```

**Why PKCE?**
- ✅ Prevents authorization code interception attacks
- ✅ Required for mobile and SPA applications
- ✅ Works without client secret (public clients)

### Token Structure

**Access Token (JWT Payload):**
```json
{
  "iss": "http://localhost:4000",           // Issuer (SSO server)
  "sub": "user-abc123",                     // Subject (user ID)
  "aud": "http://localhost:3001",           // Audience (target API)
  "scope": "orders:read orders:write",      // Permissions
  "exp": 1234567890,                        // Expiration (Unix timestamp)
  "iat": 1234567000,                        // Issued at
  "client_id": "mobile-app"                 // OAuth client
}
```

**ID Token (OIDC - User Identity):**
```json
{
  "iss": "http://localhost:4000",
  "sub": "user-abc123",
  "aud": "webapp",
  "exp": 1234567890,
  "iat": 1234567000,
  "name": "John Doe",
  "email": "john@example.com",
  "email_verified": true,
  "picture": "https://example.com/avatar.jpg"
}
```

### Scopes and Permissions

```javascript
// SSO Server - Define supported scopes
const identityPlugin = new IdentityPlugin({
  supportedScopes: [
    // OIDC standard scopes
    'openid',          // Required for OIDC
    'profile',         // User profile (name, picture)
    'email',           // User email
    'offline_access',  // Refresh tokens

    // Custom resource scopes
    'orders:read',
    'orders:write',
    'orders:delete',
    'products:read',
    'products:write',
    'payments:process',
    'admin:all'        // Full admin access
  ]
});

// Resource Server - Check scopes
api.addRoute({
  path: '/orders/:id',
  method: 'DELETE',
  handler: async (req, res) => {
    const scopes = req.user.scope.split(' ');

    // Require specific scope
    if (!scopes.includes('orders:delete')) {
      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: 'Requires scope: orders:delete'
      });
    }

    // Check admin scope
    if (scopes.includes('admin:all')) {
      // Admin can delete any order
    } else {
      // Regular user can only delete own orders
      const order = await ordersResource.get(req.params.id);
      if (order.userId !== req.user.sub) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    await ordersResource.delete(req.params.id);
    res.status(204).send();
  },
  auth: 'oidc'
});
```

### RS256 vs HS256 Security Model

```mermaid
graph LR
    subgraph "HS256 (Symmetric) - DON'T USE"
        SSO_H[SSO Server<br/>shared secret]
        API_H[All APIs<br/>shared secret]

        SSO_H -.->|Same secret<br/>everywhere| API_H

    end

    subgraph "RS256 (Asymmetric) - CORRECT"
        SSO_R[SSO Server<br/>PRIVATE key]
        API_R[All APIs<br/>PUBLIC key]

        SSO_R -->|JWKS<br/>public keys only| API_R

    end
```

**Why RS256 is superior:**

| Aspect | HS256 (Symmetric) | RS256 (Asymmetric) |
|--------|-------------------|-------------------|
| **Secret Distribution** | ❌ Shared secret on ALL services | ✅ Private key ONLY on SSO |
| **Security Risk** | ❌ One leak compromises EVERYTHING | ✅ Public key leak is safe |
| **Token Creation** | ❌ Any service can create fake tokens | ✅ Only SSO can create tokens |
| **Key Rotation** | ❌ Update ALL services | ✅ Update SSO, APIs auto-fetch JWKS |
| **Use Case** | Single service | Microservices, SSO |


---

## 🎯 Summary

**Key architecture takeaways:**
- ✅ Centralized authentication with distributed authorization
- ✅ RS256 (asymmetric) is superior to HS256 for microservices
- ✅ 4 grant types cover all authentication scenarios
- ✅ JWKS enables zero-trust token validation
- ✅ Scopes provide fine-grained access control

**Next Steps:**
1. Explore all endpoints: [API Reference →](./api-reference.md)
2. Integrate with your apps: [Integration Guide →](./integration.md)
3. Solve common issues: [Troubleshooting →](./troubleshooting.md)

---

## 🔗 See Also

**Related Documentation:**
- [Configuration Reference](./configuration.md) - All configuration options
- [API Reference](./api-reference.md) - All 9 endpoints documented
- [Integration Guide](./integration.md) - Resource Server and client integration
- [Troubleshooting](./troubleshooting.md) - Common errors and solutions
- [Identity Plugin Main](./README.md) - Overview and quickstart

**Examples:**
- [e80-sso-oauth2-server.js](/examples/e80-sso-oauth2-server.js) - Complete SSO server
- [e81-oauth2-resource-server.js](/examples/e81-oauth2-resource-server.js) - Resource Server
- [e60-oauth2-microservices.js](/examples/e60-oauth2-microservices.js) - Microservices setup

---

> **Navigation:** [↑ Top](#) | [← Configuration](./configuration.md) | [API Reference →](./api-reference.md) | [← Back to Identity Plugin](./README.md)
