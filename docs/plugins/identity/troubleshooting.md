# 🐛 Troubleshooting

> **Quick Jump:** [Error Handling](#error-handling) | [Common Errors](#common-errors) | [Recovery Patterns](#error-recovery-patterns) | [Performance](#performance-optimization) | [Issues](#common-issues)

> **Navigation:** [← Back to Identity Plugin](./README.md) | [← Integration](./integration.md)

---

## Overview

Comprehensive troubleshooting guide for Identity Plugin. Covers error handling, common issues, recovery patterns, and performance optimization.

---

## 🚨 Error Handling

### IdentityError

All Identity Plugin operations throw `IdentityError` instances:

```javascript
try {
  await identityPlugin.oauth2.generateToken({});
} catch (error) {
  console.error(error.name);        // 'IdentityError'
  console.error(error.message);     // Brief error summary
   console.error(error.statusCode); // HTTP-style status code
   console.error(error.description); // Detailed explanation
  console.error(error.context);     // Operation context
  console.error(error.retriable);   // Retry hint
  console.error(error.suggestion);  // Human-readable fix
}
```

### Structured Plugin Errors

Session management, OAuth2, and OIDC helpers now throw `PluginError` (or subclasses) with HTTP-style metadata:

```javascript
try {
  await identityPlugin.sessionManager.createSession({});
} catch (error) {
  console.log(error.statusCode); // e.g. 400
  console.log(error.retriable);  // boolean
  console.log(error.suggestion); // human-friendly fix
  console.log(error.docs);       // Optional reference docs
}
```

| Component | Status | Retriable? | Message | Suggested Fix |
|-----------|--------|------------|---------|---------------|
| SessionManager | 400 | `false` | `SessionManager requires a sessionResource` | Pass a S3DB resource when constructing the plugin. |
| SessionManager | 400 | `false` | `userId is required to create a session` | Provide `data.userId` when calling `createSession`. |
| SessionManager | 500 | `true` | `Failed to create/update session: ...` | Inspect the `original` error for database issues (permissions, connectivity). |
| OAuth2Server | 400 | `false` | `Issuer URL is required for OAuth2Server` | Configure `issuer`, `keyResource`, and `userResource` in the constructor. |
| OIDC Discovery | 400 | `false` | `Issuer URL is required for OIDC discovery` | Ensure the discovery handler receives the same `issuer` used by the server. |
| Session Cookie helpers | 400 | `false` | `Unsupported response object` | Use an HTTP response object that supports `setHeader()`/`header()`. |

All identity-related errors support `error.toJson()`—pipe it to your observability tooling so operators receive the embedded `hint` and `docs` fields.

### OAuth2Error

OAuth2-specific errors follow RFC 6749 standard error codes:

```javascript
// Standard OAuth2 error response
{
  "error": "invalid_grant",
  "error_description": "Authorization code has expired",
  "error_uri": "https://tools.ietf.org/html/rfc6749#section-5.2"
}
```

### Common Errors

#### invalid_client

**When:** Client authentication failed
**Causes:**
- ❌ Invalid client_id
- ❌ Invalid client_secret
- ❌ Client not found
- ❌ Client inactive

**Recovery:**
```javascript
// Verify client credentials
const client = await clientsResource.query({ clientId: 'app-123' });
console.log('Client active:', client.active);
console.log('Client grants:', client.grantTypes);
```

#### invalid_grant

**When:** Authorization code/refresh token invalid
**Causes:**
- ❌ Code expired (default: 10 minutes)
- ❌ Code already used
- ❌ Refresh token expired
- ❌ Refresh token revoked

**Recovery:**
```javascript
// Restart authorization flow
window.location = '/oauth/authorize?...';
```

#### invalid_scope

**When:** Requested scope not allowed
**Causes:**
- ❌ Scope not in `supportedScopes`
- ❌ Scope not in client's `allowedScopes`
- ❌ User doesn't have scope

**Recovery:**
```javascript
// Check user scopes
const user = await usersResource.get(userId);
console.log('User scopes:', user.scopes);

// Add missing scope
await usersResource.update(userId, {
  scopes: [...user.scopes, 'orders:write']
});
```

#### invalid_request

**When:** Missing required parameters
**Causes:**
- ❌ Missing grant_type
- ❌ Missing client_id
- ❌ Missing redirect_uri
- ❌ Invalid redirect_uri

**Recovery:**
```javascript
// Verify all required parameters are present
const params = {
  grant_type: 'authorization_code',
  code: authCode,
  redirect_uri: 'http://localhost:3000/callback',
  client_id: 'app-123',
  client_secret: 'secret'
};
```

#### unauthorized_client

**When:** Client not authorized for grant type
**Causes:**
- ❌ Grant type not in client's `grantTypes`

**Recovery:**
```javascript
// Update client grant types
await clientsResource.update(clientId, {
  grantTypes: ['authorization_code', 'refresh_token', 'client_credentials']
});
```

### Error Recovery Patterns

#### Graceful Degradation

```javascript
async function getTokenWithFallback() {
  try {
    return await getAccessToken();
  } catch (error) {
    if (error.error === 'invalid_grant') {
      console.warn('Token expired, redirecting to login');
      window.location = '/oauth/authorize?...';
    } else {
      throw error;
    }
  }
}
```

#### Token Refresh on Expiration

```javascript
async function callAPIWithAutoRefresh(url) {
  let token = req.session.accessToken;

  try {
    return await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
  } catch (error) {
    if (error.status === 401) {
      // Token expired, refresh it
      const refreshResponse = await fetch('/oauth/token', {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: req.session.refreshToken,
          client_id: 'app-123',
          client_secret: 'secret'
        })
      });

      const tokens = await refreshResponse.json();
      req.session.accessToken = tokens.access_token;

      // Retry with new token
      return await fetch(url, {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` }
      });
    }
    throw error;
  }
}
```

---

> **Section Navigation:** [↑ Top](#) | [← Error Handling](#-error-handling) | [Troubleshooting →](#-troubleshooting)

---

## 🐛 Troubleshooting

### Issue 1: "Invalid token signature"

**Cause:** Resource Server has cached old JWKS.

**Solution:**
```javascript
// Set lower JWKS cache TTL
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:4000',
  jwksCacheTTL: 300000  // 5 minutes (default: 1 hour)
});

// Force refresh JWKS
await oidcClient.fetchJWKS(true);
```

### Issue 2: "Invalid redirect_uri"

**Cause:** Redirect URI doesn't match registered URI exactly (including trailing slash).

**Solution:**
```javascript
// Client registration
redirectUris: [
  'http://localhost:3000/callback',  // No trailing slash
  'https://myapp.com/auth/callback'  // Exact match required
]

// Authorization request - must match exactly
redirect_uri: 'http://localhost:3000/callback'  // ← Same as registered
```

### Issue 3: "Insufficient scopes"

**Cause:** User doesn't have requested scopes.

**Solution:**
```javascript
// Check user scopes
const user = await usersResource.get(userId);
console.log('User scopes:', user.scopes);

// Add missing scopes
await usersResource.update(userId, {
  scopes: [...user.scopes, 'read:api', 'write:api']
});
```

### Issue 4: "Token expired"

**Cause:** Access token expired (15 minutes by default).

**Solution:** Use refresh token to get new access token:
```bash
curl -X POST http://localhost:4000/oauth/token \
  -d "grant_type=refresh_token" \
  -d "refresh_token=REFRESH_TOKEN" \
  -d "client_id=app-client-123" \
  -d "client_secret=super-secret-key-456"
```

### Issue 5: "CORS error"

**Cause:** Resource Server not allowed in CORS config.

**Solution:**
```javascript
const identityPlugin = new IdentityPlugin({
  cors: {
    enabled: true,
    origin: [
      'http://localhost:3000',  // Add your Resource Server
      'http://localhost:3001',
      'http://localhost:3002'
    ],
    credentials: true
  }
});
```

### Issue 6: "Public key not found for kid"

**Cause:** Key rotation occurred, old key not in JWKS.

**Solution:**
```javascript
// Debug: List all cached keys
const jwks = oidcClient.getJWKS();
console.log('Available kids:', jwks.keys.map(k => k.kid));

// Decode token to see kid
const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64'));
console.log('Token kid:', header.kid);

// Force refresh JWKS
await oidcClient.fetchJWKS(true);
```

### Issue 7: "JWKS endpoint not accessible"

**Cause:** SSO server not running or network issues.

**Solution:**
```bash
# Test JWKS endpoint
curl http://localhost:4000/.well-known/jwks.json

# Expected: JSON with keys array
# {
#   "keys": [{
#     "kty": "RSA",
#     "kid": "abc123",
#     ...
#   }]
# }

# Verify SSO server is running
curl http://localhost:4000/.well-known/openid-configuration
```

### Issue 8: "Clock skew - token not yet valid"

**Cause:** Time difference between SSO and Resource Server.

**Solution:**
```javascript
// Increase clock tolerance
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:4000',
  clockTolerance: 300  // 5 minutes tolerance
});

// Sync server clocks with NTP
sudo ntpdate pool.ntp.org
```

### Performance Optimization

**JWKS Caching:**
```javascript
// Aggressive caching (1 hour)
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:4000',
  jwksCacheTTL: 3600000,  // 1 hour
  autoRefreshJWKS: true   // Auto-refresh in background
});

// Impact:
// Without cache: ~50-100ms per request (network + verify)
// With cache: <1ms per request (verify only)
```

**Token Expiry Trade-offs:**
```javascript
// Short-lived (more secure, more token requests)
const identityPlugin = new IdentityPlugin({
  accessTokenExpiry: '5m',
  refreshTokenExpiry: '1d'
});

// Long-lived (less secure, fewer token requests)
const identityPlugin = new IdentityPlugin({
  accessTokenExpiry: '1h',
  refreshTokenExpiry: '30d'
});

// Recommendation: 15 minutes access, 7 days refresh
```

---

> **Section Navigation:** [↑ Top](#) | [← Troubleshooting](#-troubleshooting) | [FAQ →](#-faq)

---

---

## 🎯 Summary

**Troubleshooting checklist:**
- ✅ Use `IdentityError` and `OAuth2Error` for structured error handling
- ✅ Check JWKS cache when signature validation fails
- ✅ Verify redirect URIs match exactly (including trailing slash)
- ✅ Ensure user has required scopes
- ✅ Use refresh tokens for expired access tokens
- ✅ Configure CORS for all Resource Servers
- ✅ Sync server clocks to prevent clock skew errors
- ✅ Optimize JWKS caching for performance

**Next Steps:**
1. Review configuration: [Configuration Reference →](./configuration.md)
2. Understand architecture: [Architecture & Token Flow →](./architecture.md)
3. Explore integration patterns: [Integration Guide →](./integration.md)

---

## 🔗 See Also

**Related Documentation:**
- [Configuration Reference](./configuration.md) - All configuration options
- [Architecture & Token Flow](./architecture.md) - System design and flows
- [API Reference](./api-reference.md) - All endpoints
- [Integration Guide](./integration.md) - Resource Server and client integration
- [Identity Plugin Main](./README.md) - Overview and quickstart

**Examples:**
- [e80-sso-oauth2-server.js](../../examples/e80-sso-oauth2-server.js) - Complete SSO server
- [e81-oauth2-resource-server.js](../../examples/e81-oauth2-resource-server.js) - Resource Server
- [e60-oauth2-microservices.js](../../examples/e60-oauth2-microservices.js) - Microservices setup

---

> **Navigation:** [↑ Top](#) | [← Integration](./integration.md) | [← Back to Identity Plugin](./README.md)
