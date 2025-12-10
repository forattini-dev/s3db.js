# OIDC/OAuth2 Debug Logging Guide

Comprehensive debug logging for troubleshooting OIDC and OAuth2 authentication flows.

## Quick Start

Enable debug logging:

```bash
export S3DB_LOG_LEVEL=debug
node your-app.js
```

You'll see detailed logs for all OIDC/OAuth2 operations with the pretty format:

```
[12:34:56.789] INFO (OidcAuth): [OIDC] Login flow initiated
    state: "a1b2c3d4..."
    hasPKCE: true
    returnTo: "/dashboard"
    scopes: "openid profile email"

[12:34:58.123] INFO (OidcAuth): [OIDC] Callback received
    hasCode: true
    hasState: true
    hasError: false
    host: "localhost:3000"

[12:34:58.456] INFO (OidcAuth): [OIDC] Token exchange successful
    hasAccessToken: true
    hasIdToken: true
    hasRefreshToken: true
    tokenType: "Bearer"
    expiresIn: 3600

[12:34:58.789] INFO (OidcAuth): [OIDC] Existing user found, updating
    userId: "john.doe@exampl..."
    email: "john.doe@example.com"
    action: "update"

[12:34:59.012] DEBUG (OidcAuth): [OIDC] User authenticated from session
    userId: "john.doe@exampl..."
    email: "john.doe@example.com"
    authMethod: "oidc"
    sessionValid: true
```

## Log Levels

| Level | Usage | What You'll See |
|-------|-------|-----------------|
| `info` | Default, production | Login/logout, token exchange, user provisioning, errors |
| `debug` | Development, troubleshooting | All of the above + session validation, cookie checks, token expiry, middleware checks |
| `trace` | Deep debugging | Same as debug (currently) |
| `warn` | Issues only | Session expiration, validation failures, PKCE errors |
| `error` | Critical failures | State cookie missing, token exchange failed, validation errors |

## Logged Events

### 1. Login Flow

**Event**: User initiates login

**Log Level**: `INFO`

**Example**:
```
[OIDC] Login flow initiated
  state: "a1b2c3d4..."
  hasPKCE: true
  hasReturnTo: true
  returnTo: "/dashboard?tab=settings"
  continueUrl: "https://example.com/dashboard?tab=settings"
  scopes: "openid profile email offline_access"
```

**What to check**:
- `hasPKCE`: Should be `true` for security (PKCE enabled)
- `returnTo`: The URL user will be redirected to after login
- `scopes`: Requested permissions

---

### 2. Callback Processing

**Event**: IdP redirects back with authorization code

**Log Level**: `INFO`

**Example**:
```
[OIDC] Callback received
  hasCode: true
  hasState: true
  hasError: false
  host: "localhost:3000"
```

**Troubleshooting**:
- `hasCode: false` → Check redirectUri configuration, IdP settings
- `hasError: true` → Check next log for error details
- Missing callback → Check redirectUri domain/path mismatch

---

### 3. State Cookie Validation (CSRF Protection)

**Event**: Validating state parameter against cookie

**Log Level**: `DEBUG` (success) / `ERROR` (failure)

**Example Success**:
```
[OIDC] State cookie validation
  stateCookiePresent: true
  stateCookieName: "oidc_state"
  stateQueryParamPresent: true

[OIDC] State validation successful
```

**Example Failure**:
```
[OIDC] State cookie missing (CSRF protection failed)
  expectedCookieName: "oidc_state"
  hasCookieHeader: true
  redirectUri: "https://example.com/auth/callback"
  host: "example.com"
```

**Common Issues**:
- **State cookie missing**: Cookie domain mismatch, SameSite issues, HTTPS required
- **State mismatch**: Possible replay attack or cookie tampering
- **Solution**: Check `redirectUri` matches exactly between config and IdP

---

### 4. Token Exchange

**Event**: Exchanging authorization code for tokens

**Log Level**: `INFO` (attempt + success) / `ERROR` (failure)

**Example**:
```
[OIDC] Exchanging code for tokens
  hasPKCE: true
  hasCodeVerifier: true
  tokenEndpoint: "https://login.microsoftonline.com/tenant/oauth2/v2.0/token"
  isConfidentialClient: true

[OIDC] Token exchange successful
  hasAccessToken: true
  hasIdToken: true
  hasRefreshToken: true
  tokenType: "Bearer"
  expiresIn: 3600
```

**Troubleshooting**:
- `hasAccessToken: false` → Check token endpoint, client credentials
- `hasRefreshToken: false` → Add `offline_access` scope
- Token exchange failed → Check client secret, redirectUri, network connectivity

---

### 5. ID Token Validation

**Event**: Validating claims in ID token

**Log Level**: `DEBUG` (attempt) / `WARN` (failure)

**Example Success**:
```
[OIDC] Validating ID token claims
  iss: "https://login.microsoftonline.com/tenant/v2.0"
  aud: "client-id-here"
  exp: 1234567890
  sub: "user-sub-id..."
  hasNonce: true

[OIDC] ID token validation successful
```

**Example Failure**:
```
[OIDC] ID token validation failed
  errors: [
    "Invalid issuer: expected 'https://idp.example.com', got 'https://wrong-idp.com'",
    "Token expired at 2025-01-15T12:00:00.000Z"
  ]
  iss: "https://wrong-idp.com"
  aud: "client-id-here"
```

**Common Errors**:
- **Invalid issuer**: Config `issuer` doesn't match token
- **Token expired**: Clock skew or old token
- **Invalid audience**: `clientId` mismatch
- **Missing nonce**: Replay attack protection failed

---

### 6. User Lookup & Provisioning

**Event**: Finding or creating user from ID token claims

**Log Level**: `DEBUG` (lookup) / `INFO` (create/update)

**Example - User Found**:
```
[OIDC] User lookup starting
  candidateIds: ["john.doe@exampl...", "jdoe@example..."]
  lookupFields: ["email", "preferred_username"]
  autoCreateUser: true
  userIdClaim: "sub"

[OIDC] Existing user found, updating
  userId: "john.doe@exampl..."
  email: "john.doe@example.com"
  action: "update"
```

**Example - User Created**:
```
[OIDC] Creating new user
  userId: "john.doe@exampl..."
  email: "john.doe@example.com"
  action: "create"
  hasUserMapping: false
```

**Example - Auto-Create Disabled**:
```
[OIDC] User not found and autoCreateUser is disabled
```

**Troubleshooting**:
- User not found → Check `userIdClaim`, `fallbackIdClaims`, `lookupFields`
- Duplicate users → Claims changed, lookup failing
- Auto-create disabled → Enable or manually create users

---

### 7. Middleware Authentication Check

**Event**: Every protected request

**Log Level**: `DEBUG`

**Example**:
```
[OIDC] Middleware check
  path: "/api/users"
  isAuthPath: false
  hasProtectedPaths: true

[OIDC] Protected path check
  path: "/api/users"
  isProtected: true
  protectedPatterns: ["/api/*", "/dashboard"]

[OIDC] Session cookie check
  hasSessionCookie: true
  cookieName: "oidc_session"
  cookieLength: 1456
```

**What to check**:
- `isAuthPath`: Should be `false` for protected paths
- `isProtected`: Should be `true` if path requires auth
- `hasSessionCookie`: Should be `true` for authenticated requests

---

### 8. Session Validation

**Event**: Validating session duration (rolling + absolute)

**Log Level**: `DEBUG` (valid) / `WARN` (expired)

**Example Valid**:
```
[OIDC] Session validation
  valid: true
  reason: "valid"
```

**Example Expired**:
```
[OIDC] Session validation
  valid: false
  reason: "Rolling session expired (no activity for 24h)"

[OIDC] Session expired
  reason: "Rolling session expired (no activity for 24h)"
  userId: "john.doe@exampl..."
```

**Reasons for Expiration**:
- `"Absolute session expired (max duration reached)"` - User must re-login (7 days default)
- `"Rolling session expired (no activity for Xh)"` - User inactive too long (24h default)

---

### 9. Token Refresh (Auto-Refresh)

**Event**: Refreshing access token before expiry

**Log Level**: `DEBUG`

**Example**:
```
[OIDC] Token expiry check
  timeUntilExpirySeconds: 240
  thresholdSeconds: 300
  willRefresh: true

[OIDC] Token refresh successful
  newExpiresIn: 3600
  hasNewRefreshToken: true
  hasNewIdToken: false
```

**What to check**:
- `willRefresh: true` → Token will be refreshed silently
- `willRefresh: false` → Token still valid, no refresh needed
- Refresh threshold: Default 5 minutes (300 seconds)

---

### 10. Authenticated User Context

**Event**: User successfully authenticated from session

**Log Level**: `DEBUG`

**Example**:
```
[OIDC] User authenticated from session
  userId: "john.doe@exampl..."
  email: "john.doe@example.com"
  authMethod: "oidc"
  sessionValid: true
```

**What's Happening**:
- User context set in request (`c.get('user')`)
- Session cookie refreshed with updated `last_activity`
- Request proceeds to route handler

---

### 11. Logout

**Event**: User initiates logout

**Log Level**: `INFO` (initiation) / `DEBUG` (redirect)

**Example Local Logout**:
```
[OIDC] Logout initiated
  hasSession: true
  hasIdToken: true
  idpLogoutEnabled: false
  willRedirectToIdP: false

[OIDC] Local logout, redirecting
  redirectTo: "/"
```

**Example IdP Logout**:
```
[OIDC] Logout initiated
  hasSession: true
  hasIdToken: true
  idpLogoutEnabled: true
  willRedirectToIdP: true

[OIDC] Redirecting to IdP logout
  logoutEndpoint: "https://login.microsoftonline.com/tenant/oauth2/v2.0/logout"
  postLogoutRedirectUri: "https://example.com/"
```

**What to check**:
- `willRedirectToIdP: true` → Single sign-out (logs out from IdP too)
- `hasIdToken: false` → Can't do IdP logout without id_token

---

## Common Troubleshooting Scenarios

### Scenario 1: Login redirects but callback fails

**Logs to check**:
```
[OIDC] Login flow initiated
[OIDC] Callback received
[OIDC] State cookie missing (CSRF protection failed)
```

**Solution**:
1. Check `redirectUri` config matches IdP exactly
2. Verify cookie domain (localhost vs 127.0.0.1)
3. Check HTTPS requirement (SameSite=None needs Secure)
4. Verify proxy isn't stripping cookies

---

### Scenario 2: Token exchange fails

**Logs to check**:
```
[OIDC] Exchanging code for tokens
[OIDC] Token exchange failed
  status: 400
  error: "invalid_client"
```

**Solution**:
1. Verify `clientId` and `clientSecret` are correct
2. Check `redirectUri` matches between config and IdP
3. Verify `tokenEndpoint` is accessible
4. Check network connectivity / firewall

---

### Scenario 3: User not found

**Logs to check**:
```
[OIDC] User lookup starting
[OIDC] User not found and autoCreateUser is disabled
```

**Solution**:
1. Enable `autoCreateUser: true` in config
2. Or manually create user with matching `sub` claim
3. Check `userIdClaim`, `fallbackIdClaims`, `lookupFields`

---

### Scenario 4: Session keeps expiring

**Logs to check**:
```
[OIDC] Session validation
  valid: false
  reason: "Rolling session expired (no activity for 24h)"
```

**Solution**:
1. Increase `rollingDuration` (default: 24h)
2. Increase `absoluteDuration` (default: 7 days)
3. Check browser isn't clearing cookies
4. Verify clock sync between server and client

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `S3DB_LOG_LEVEL` | `info` | Log level (`debug`, `info`, `warn`, `error`) |
| `S3DB_LOG_FORMAT` | `pretty` | Log format (`pretty`, `json`) |

## Log Prefixes

All OIDC logs use the `[OIDC]` prefix for easy filtering:

```bash
# Filter OIDC logs only
node app.js | grep '\[OIDC\]'

# Filter errors only
node app.js | grep 'ERROR.*\[OIDC\]'

# Filter specific operation
node app.js | grep '\[OIDC\] Token'
```

## Security Notes

**Logs DO NOT expose**:
- Full tokens (access_token, refresh_token, id_token)
- Client secrets
- Passwords
- Full user IDs (truncated to first 15 chars + '...')

**Logs DO expose** (in DEBUG mode):
- Issuer URLs
- Client IDs (not secrets)
- Email addresses
- Redirect URIs
- Scopes requested

**Production recommendation**: Use `info` level to avoid verbose debug output.

## Related Files

- `src/plugins/api/auth/oidc-auth.js` - Main OIDC driver (with all login/callback/logout logs)
- `src/plugins/api/concerns/oidc-validator.js` - Token validation logs
- `docs/logging.md` - General logging configuration
- `docs/examples/e200-pretty-logging.js` - Pretty logging example

## See Also

- [OIDC Auth Documentation](/plugins/api/auth/oidc.md)
- [Logging Guide](/logging.md)
- [Troubleshooting Guide](/troubleshooting/oidc.md)
