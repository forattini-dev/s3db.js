# Identity Plugin - OAuth2 & OpenID Connect

[← Back to Identity Plugin](../identity-plugin.md) | [Admin Panel](./admin-panel.md) | [Security →](./security.md)

Complete guide to OAuth2 authorization and OIDC identity features.

## Table of Contents

- [Overview](#overview)
- [Discovery Endpoints](#discovery-endpoints)
- [Grant Types](#grant-types)
- [Endpoints](#endpoints)
- [Integration Examples](#integration-examples)
- [PKCE Support](#pkce-support)

## Overview

The Identity Plugin implements a complete OAuth2/OIDC authorization server:

- **OAuth2** - Authorization framework (RFC 6749)
- **OIDC** - Identity layer on top of OAuth2 (OpenID Connect)
- **PKCE** - Proof Key for Code Exchange (RFC 7636)

**Supported Grant Types:**
- Authorization Code (with PKCE)
- Client Credentials
- Refresh Token

**Supported Scopes:**
- `openid` - Enable OIDC (required for id_token)
- `profile` - Access to name and profile info
- `email` - Access to email address
- `offline_access` - Request refresh token

## Discovery Endpoints

### OIDC Discovery

**Endpoint:** `GET /.well-known/openid-configuration`

Returns OIDC metadata:

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
  "scopes_supported": ["openid", "profile", "email", "offline_access"],
  "response_types_supported": ["code", "token", "id_token"],
  "grant_types_supported": ["authorization_code", "client_credentials", "refresh_token"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic"]
}
```

### JWKS (JSON Web Key Set)

**Endpoint:** `GET /.well-known/jwks.json`

Returns RSA public keys for token verification:

```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "kid": "key-id",
      "n": "modulus...",
      "e": "AQAB"
    }
  ]
}
```

## Grant Types

### Authorization Code Flow

Standard OAuth2 flow with consent screen.

**Step 1: Authorization Request**

```
GET /oauth/authorize?
  client_id=my-app&
  redirect_uri=http://localhost:3000/callback&
  response_type=code&
  scope=openid profile email&
  state=random-state
```

**Parameters:**
- `client_id` - OAuth2 client ID (required)
- `redirect_uri` - Callback URL (required, must match registered)
- `response_type` - `code` for authorization code (required)
- `scope` - Space-separated scopes (required)
- `state` - Random string for CSRF protection (recommended)
- `code_challenge` - PKCE challenge (optional, recommended for public clients)
- `code_challenge_method` - `S256` or `plain` (required if code_challenge present)

**Step 2: User Consent**

User is redirected to login (if not authenticated) and then consent screen.

**Step 3: Authorization Response**

```
HTTP/1.1 302 Found
Location: http://localhost:3000/callback?code=AUTH_CODE&state=random-state
```

**Step 4: Token Exchange**

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=AUTH_CODE&
redirect_uri=http://localhost:3000/callback&
client_id=my-app&
client_secret=secret
```

**Response:**

```json
{
  "access_token": "eyJhbGc...",
  "id_token": "eyJhbGc...",
  "refresh_token": "refresh...",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "openid profile email"
}
```

### Client Credentials Flow

Machine-to-machine authentication (no user involved).

**Request:**

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&
client_id=my-service&
client_secret=secret&
scope=api.read
```

**Response:**

```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "api.read"
}
```

**Note:** No id_token or refresh_token issued.

### Refresh Token Flow

Obtain new access token using refresh token.

**Request:**

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=REFRESH_TOKEN&
client_id=my-app&
client_secret=secret
```

**Response:**

```json
{
  "access_token": "eyJhbGc...",
  "id_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "openid profile email"
}
```

**Note:** New refresh_token may be issued (refresh token rotation).

## Endpoints

### Authorization Endpoint

**URL:** `GET /oauth/authorize`

**Purpose:** Initiate OAuth2 authorization flow

**Query Parameters:**
- `client_id` - OAuth2 client ID (required)
- `redirect_uri` - Callback URL (required)
- `response_type` - `code`, `token`, or `id_token` (required)
- `scope` - Space-separated scopes (required)
- `state` - CSRF protection (recommended)
- `code_challenge` - PKCE challenge (optional)
- `code_challenge_method` - PKCE method (S256 or plain)

**Flow:**
1. Check if user is authenticated (redirect to /login if not)
2. Show consent screen (if client requires consent)
3. Create authorization code
4. Redirect to callback with code

### Token Endpoint

**URL:** `POST /oauth/token`

**Purpose:** Exchange code for tokens, refresh tokens, client credentials

**Content-Type:** `application/x-www-form-urlencoded`

**Parameters:**
- `grant_type` - `authorization_code`, `client_credentials`, or `refresh_token` (required)
- `code` - Authorization code (required for authorization_code)
- `redirect_uri` - Callback URL (required for authorization_code)
- `client_id` - Client ID (required)
- `client_secret` - Client secret (required)
- `refresh_token` - Refresh token (required for refresh_token grant)
- `code_verifier` - PKCE verifier (required if PKCE used)

**Response:**

```json
{
  "access_token": "string",
  "id_token": "string",          // Only if 'openid' scope
  "refresh_token": "string",     // Only if 'offline_access' scope
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "openid profile email"
}
```

### UserInfo Endpoint

**URL:** `GET /oauth/userinfo`

**Purpose:** Get user information (OIDC endpoint)

**Authentication:** Bearer token in Authorization header

**Request:**

```http
GET /oauth/userinfo
Authorization: Bearer ACCESS_TOKEN
```

**Response:**

```json
{
  "sub": "user-id",
  "email": "user@example.com",
  "email_verified": true,
  "name": "User Name",
  "updated_at": 1234567890
}
```

**Scopes:**
- `openid` - Returns `sub` (user ID)
- `profile` - Returns `name`, `updated_at`
- `email` - Returns `email`, `email_verified`

### Introspection Endpoint

**URL:** `POST /oauth/introspect`

**Purpose:** Validate and get info about a token

**Authentication:** Client credentials

**Request:**

```http
POST /oauth/introspect
Content-Type: application/x-www-form-urlencoded

token=ACCESS_TOKEN&
client_id=my-app&
client_secret=secret
```

**Response (Active Token):**

```json
{
  "active": true,
  "client_id": "my-app",
  "username": "user@example.com",
  "scope": "openid profile email",
  "sub": "user-id",
  "exp": 1234567890,
  "iat": 1234567000,
  "token_type": "Bearer"
}
```

**Response (Inactive Token):**

```json
{
  "active": false
}
```

### Revocation Endpoint

**URL:** `POST /oauth/revoke`

**Purpose:** Revoke access or refresh token

**Authentication:** Client credentials

**Request:**

```http
POST /oauth/revoke
Content-Type: application/x-www-form-urlencoded

token=ACCESS_TOKEN&
token_type_hint=access_token&
client_id=my-app&
client_secret=secret
```

**Response:** `200 OK` (no body)

**Note:** Revocation is immediate. Token becomes invalid.

### Dynamic Client Registration

**URL:** `POST /oauth/register`

**Purpose:** Dynamically register OAuth2 client

**Request:**

```http
POST /oauth/register
Content-Type: application/json

{
  "client_name": "My Application",
  "redirect_uris": ["http://localhost:3000/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "scope": "openid profile email"
}
```

**Response:**

```json
{
  "client_id": "generated-client-id",
  "client_secret": "generated-secret",
  "client_name": "My Application",
  "redirect_uris": ["http://localhost:3000/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"]
}
```

**Important:** Save `client_secret` immediately. It cannot be retrieved later.

## Integration Examples

### JavaScript/Node.js Client

```javascript
import fetch from 'node-fetch';

const config = {
  clientId: 'my-app',
  clientSecret: 'secret',
  redirectUri: 'http://localhost:3000/callback',
  authorizationEndpoint: 'http://localhost:4000/oauth/authorize',
  tokenEndpoint: 'http://localhost:4000/oauth/token',
  userInfoEndpoint: 'http://localhost:4000/oauth/userinfo'
};

// Step 1: Generate authorization URL
function getAuthorizationUrl() {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state: crypto.randomBytes(16).toString('hex')
  });

  return `${config.authorizationEndpoint}?${params}`;
}

// Step 2: Exchange code for tokens
async function exchangeCodeForTokens(code) {
  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret
    })
  });

  return await response.json();
}

// Step 3: Get user info
async function getUserInfo(accessToken) {
  const response = await fetch(config.userInfoEndpoint, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  return await response.json();
}

// Usage
const authUrl = getAuthorizationUrl();
console.log('Visit:', authUrl);

// After user authorizes and you receive code:
const tokens = await exchangeCodeForTokens(code);
const userInfo = await getUserInfo(tokens.access_token);
```

### Python Client

```python
import requests
from urllib.parse import urlencode

config = {
    'client_id': 'my-app',
    'client_secret': 'secret',
    'redirect_uri': 'http://localhost:3000/callback',
    'authorization_endpoint': 'http://localhost:4000/oauth/authorize',
    'token_endpoint': 'http://localhost:4000/oauth/token',
    'userinfo_endpoint': 'http://localhost:4000/oauth/userinfo'
}

# Step 1: Generate authorization URL
def get_authorization_url():
    params = {
        'client_id': config['client_id'],
        'redirect_uri': config['redirect_uri'],
        'response_type': 'code',
        'scope': 'openid profile email',
        'state': 'random-state'
    }
    return f"{config['authorization_endpoint']}?{urlencode(params)}"

# Step 2: Exchange code for tokens
def exchange_code_for_tokens(code):
    data = {
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': config['redirect_uri'],
        'client_id': config['client_id'],
        'client_secret': config['client_secret']
    }
    response = requests.post(config['token_endpoint'], data=data)
    return response.json()

# Step 3: Get user info
def get_user_info(access_token):
    headers = {'Authorization': f'Bearer {access_token}'}
    response = requests.get(config['userinfo_endpoint'], headers=headers)
    return response.json()
```

## PKCE Support

PKCE (Proof Key for Code Exchange) adds security for public clients (mobile, SPA).

### Generating PKCE Parameters

```javascript
import crypto from 'crypto';

// Step 1: Generate code verifier (random string)
const codeVerifier = crypto.randomBytes(32).toString('base64url');

// Step 2: Generate code challenge (SHA-256 hash)
const codeChallenge = crypto
  .createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');

const codeChallengeMethod = 'S256';
```

### Authorization with PKCE

```javascript
const authUrl = new URL('http://localhost:4000/oauth/authorize');
authUrl.searchParams.set('client_id', 'my-app');
authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', 'openid profile email');
authUrl.searchParams.set('state', 'random-state');
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
```

### Token Exchange with PKCE

```javascript
const tokenResponse = await fetch('http://localhost:4000/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: 'received-code',
    redirect_uri: 'http://localhost:3000/callback',
    client_id: 'my-app',
    code_verifier: codeVerifier  // Original verifier, not challenge!
  })
});
```

**Note:** Client secret not required when using PKCE.

## See Also

- [Configuration](./configuration.md) - OAuth2/OIDC configuration
- [Security](./security.md) - Security best practices
- [Admin Panel](./admin-panel.md) - Managing OAuth2 clients
- [Main Documentation](../identity-plugin.md) - Overview and quick start
