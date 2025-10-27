# Identity Plugin - Architecture

Technical architecture and implementation details.

## Table of Contents

- [System Architecture](#system-architecture)
- [S3DB Resources](#s3db-resources)
- [Token Lifecycle](#token-lifecycle)
- [Email Flow](#email-flow)
- [Session Management](#session-management)
- [OAuth2 Implementation](#oauth2-implementation)

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Identity Provider                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  OAuth2/OIDC │  │  UI/Auth     │  │  Admin Panel │ │
│  │  Endpoints   │  │  Pages       │  │  Management  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Session & Token Management              │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │                S3DB Resources                     │  │
│  │  • Users          • Sessions      • Clients      │  │
│  │  • Auth Codes     • RSA Keys      • Tokens       │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Components

**1. OAuth2/OIDC Server**
- Authorization endpoints (`/oauth/authorize`, `/oauth/token`)
- Token generation and validation (JWT with RSA signatures)
- PKCE support (RFC 7636)
- Client credentials management
- Token introspection and revocation

**2. UI/Auth Pages**
- Server-side rendered pages (Hono + html templates)
- Login, registration, profile, password reset
- White-label customization support
- Custom page overrides via JavaScript functions

**3. Admin Panel**
- User management (CRUD, status, roles)
- OAuth2 client management
- Session monitoring
- Dashboard with statistics

**4. Session Manager**
- Cookie-based sessions
- Device tracking (IP, user agent)
- Automatic cleanup of expired sessions
- Session resource stored in S3DB

**5. Email Service**
- SMTP integration (nodemailer)
- Email verification tokens
- Password reset tokens
- Customizable templates

**6. S3DB Integration**
- All data stored in S3DB resources
- Metadata-driven schema
- Automatic timestamps
- Query and filtering support

## S3DB Resources

The Identity Plugin creates and manages these resources:

### `plg_oauth_keys`

**Purpose:** RSA key pairs for signing OAuth2 tokens

**Schema:**
```javascript
{
  id: 'string',              // Key ID (kid)
  publicKey: 'string',       // RSA public key (PEM format)
  privateKey: 'string',      // RSA private key (PEM format, encrypted)
  algorithm: 'string',       // Signing algorithm (RS256)
  createdAt: 'timestamp',
  expiresAt: 'timestamp'     // Key rotation
}
```

**Notes:**
- Keys generated on first initialize
- Rotated periodically (configurable)
- Private key encrypted at rest

### `plg_oauth_clients`

**Purpose:** Registered OAuth2 clients

**Schema:**
```javascript
{
  clientId: 'string',              // Unique client ID
  clientSecret: 'string',          // bcrypt hashed secret
  name: 'string',                  // Client display name
  description: 'string',           // Client description
  redirectUris: 'array<string>',   // Allowed redirect URIs
  allowedScopes: 'array<string>',  // Allowed OAuth2 scopes
  grantTypes: 'array<string>',     // Allowed grant types
  status: 'string',                // active | inactive
  createdAt: 'timestamp',
  updatedAt: 'timestamp'
}
```

**Notes:**
- Client secret hashed with bcrypt
- Multiple redirect URIs supported
- Can be created via admin panel or API

### `plg_auth_codes`

**Purpose:** Short-lived authorization codes

**Schema:**
```javascript
{
  id: 'string',                    // Authorization code
  clientId: 'string',              // OAuth2 client
  userId: 'string',                // User who authorized
  redirectUri: 'string',           // Callback URL
  scope: 'string',                 // Granted scopes
  codeChallenge: 'string',         // PKCE challenge
  codeChallengeMethod: 'string',   // S256 or plain
  expiresAt: 'timestamp',          // Expiration (10 minutes)
  used: 'boolean',                 // Single-use flag
  createdAt: 'timestamp'
}
```

**Notes:**
- Expires after 10 minutes (configurable)
- Single-use (deleted after token exchange)
- PKCE support optional

### `plg_sessions`

**Purpose:** User authentication sessions

**Schema:**
```javascript
{
  id: 'string',              // Session ID (stored in cookie)
  userId: 'string',          // User ID
  ipAddress: 'string',       // Client IP
  userAgent: 'string',       // Client user agent
  expiresAt: 'timestamp',    // Session expiration
  createdAt: 'timestamp'
}
```

**Notes:**
- Session ID stored in httpOnly cookie
- Automatic cleanup of expired sessions
- Device tracking for security

### `plg_password_reset_tokens`

**Purpose:** Password reset tokens

**Schema:**
```javascript
{
  id: 'string',              // Reset token
  userId: 'string',          // User requesting reset
  expiresAt: 'timestamp',    // Token expiration (1 hour)
  used: 'boolean',           // Single-use flag
  createdAt: 'timestamp'
}
```

**Notes:**
- Expires after 1 hour
- Single-use (deleted after reset)
- Sent via email

### `users`

**Purpose:** User accounts

**Schema:**
```javascript
{
  id: 'string',              // User ID
  email: 'string',           // Email (unique)
  name: 'string',            // Display name
  passwordHash: 'string',    // bcrypt hashed password
  status: 'string',          // active | suspended | pending_verification
  emailVerified: 'boolean',  // Email verification status
  role: 'string',            // user | admin
  isAdmin: 'boolean',        // Alternative admin flag
  createdAt: 'timestamp',
  updatedAt: 'timestamp'
}
```

**Notes:**
- Email must be unique
- Password hashed with bcrypt
- Status controls login access
- Admin role grants access to admin panel

## Token Lifecycle

### 1. User Login → Session

```
User → POST /login (email, password)
         ↓
    Validate credentials
         ↓
    Create session record
         ↓
    Set session cookie
         ↓
    Redirect to /profile
```

**Session Cookie:**
```
Set-Cookie: s3db_session=SESSION_ID; HttpOnly; Secure; SameSite=Strict; Max-Age=86400
```

### 2. OAuth2 Authorization

```
Client → GET /oauth/authorize (client_id, redirect_uri, scope, state)
           ↓
      Check user session (redirect to /login if not authenticated)
           ↓
      Show consent screen
           ↓
      User approves
           ↓
      Create authorization code
           ↓
      Redirect to callback (code, state)
```

**Authorization Code:**
- Stored in `plg_auth_codes`
- Expires in 10 minutes
- Single-use only

### 3. Token Exchange

```
Client → POST /oauth/token (grant_type=authorization_code, code, client_id, client_secret)
           ↓
      Validate client credentials
           ↓
      Validate authorization code
           ↓
      Generate tokens:
        • Access Token (JWT, 15 minutes)
        • ID Token (JWT, 15 minutes, if 'openid' scope)
        • Refresh Token (opaque, 7 days, if 'offline_access' scope)
           ↓
      Mark code as used
           ↓
      Return tokens
```

**Access Token (JWT):**
```json
{
  "iss": "http://localhost:4000",
  "sub": "user-id",
  "aud": "client-id",
  "exp": 1234567890,
  "iat": 1234567000,
  "scope": "openid profile email"
}
```

**ID Token (JWT):**
```json
{
  "iss": "http://localhost:4000",
  "sub": "user-id",
  "aud": "client-id",
  "exp": 1234567890,
  "iat": 1234567000,
  "email": "user@example.com",
  "email_verified": true,
  "name": "User Name"
}
```

### 4. Token Usage

```
Client → GET /api/resource
         Authorization: Bearer ACCESS_TOKEN
           ↓
      Validate JWT signature (using public key from JWKS)
           ↓
      Check expiration
           ↓
      Extract user ID from 'sub' claim
           ↓
      Authorize request
```

### 5. Token Refresh

```
Client → POST /oauth/token (grant_type=refresh_token, refresh_token, client_id, client_secret)
           ↓
      Validate refresh token
           ↓
      Generate new access token
           ↓
      Optionally rotate refresh token
           ↓
      Return new tokens
```

### 6. Logout

```
User → POST /logout
         ↓
    Delete session from plg_sessions
         ↓
    Clear session cookie
         ↓
    Redirect to /login
```

**Note:** OAuth2 tokens remain valid until expiration. To revoke, use `/oauth/revoke`.

## Email Flow

### Registration Flow

```
User → POST /register (name, email, password)
         ↓
    Validate input (password policy, email format)
         ↓
    Check domain restrictions (allowedDomains, blockedDomains)
         ↓
    Create user (status: pending_verification)
         ↓
    Generate verification token
         ↓
    Send verification email
         ↓
    Redirect to /login (success message)
```

**Verification Email:**
- Link: `http://localhost:4000/verify-email?token=TOKEN`
- Expires: Never (user can request new token)
- Template: Customizable via `email.templates`

### Email Verification

```
User clicks link → GET /verify-email?token=TOKEN
                      ↓
                 Validate token
                      ↓
                 Update user (emailVerified: true, status: active)
                      ↓
                 Delete verification token
                      ↓
                 Redirect to /login (success message)
```

### Password Reset Flow

```
User → POST /forgot-password (email)
         ↓
    Find user by email
         ↓
    Generate reset token
         ↓
    Send reset email
         ↓
    Redirect to /login (success message)
```

**Reset Email:**
- Link: `http://localhost:4000/reset-password?token=TOKEN`
- Expires: 1 hour
- Single-use only

### Password Reset

```
User clicks link → GET /reset-password?token=TOKEN
                      ↓
                 Validate token (not expired, not used)
                      ↓
                 Show reset form
                      ↓
User submits → POST /reset-password (token, password)
                      ↓
                 Validate password (policy)
                      ↓
                 Update password hash
                      ↓
                 Delete reset token
                      ↓
                 Redirect to /login (success message)
```

## Session Management

### Session Creation

```javascript
// 1. Generate session ID
const sessionId = crypto.randomBytes(32).toString('hex');

// 2. Store session
await sessionsResource.insert({
  id: sessionId,
  userId: user.id,
  ipAddress: request.ip,
  userAgent: request.headers['user-agent'],
  expiresAt: new Date(Date.now() + sessionExpiry),
  createdAt: new Date()
});

// 3. Set cookie
response.cookie('s3db_session', sessionId, {
  httpOnly: true,
  secure: cookieSecure,
  sameSite: cookieSameSite,
  maxAge: sessionExpiry,
  path: cookiePath
});
```

### Session Validation

```javascript
// 1. Get session ID from cookie
const sessionId = request.cookies.s3db_session;

// 2. Fetch session from S3DB
const session = await sessionsResource.get(sessionId);

// 3. Check expiration
if (session.expiresAt < new Date()) {
  throw new Error('Session expired');
}

// 4. Get user
const user = await usersResource.get(session.userId);

// 5. Check user status
if (user.status !== 'active') {
  throw new Error('User suspended');
}

// 6. Attach to request
request.user = user;
request.session = session;
```

### Session Cleanup

```javascript
// Automatic cleanup runs every cleanupInterval (default: 1 hour)
async function cleanupExpiredSessions() {
  const now = new Date();

  // Query expired sessions
  const expired = await sessionsResource.query({
    expiresAt: { $lt: now.toISOString() }
  });

  // Delete in batch
  for (const session of expired) {
    await sessionsResource.delete(session.id);
  }

  console.log(`Cleaned up ${expired.length} expired sessions`);
}
```

## OAuth2 Implementation

### JWT Token Generation

```javascript
import jwt from 'jsonwebtoken';

// 1. Get private key
const keyPair = await keysResource.list();
const privateKey = keyPair[0].privateKey;

// 2. Create payload
const payload = {
  iss: config.issuer,           // Issuer
  sub: user.id,                 // Subject (user ID)
  aud: client.clientId,         // Audience (client ID)
  exp: Math.floor(Date.now() / 1000) + accessTokenExpiry,
  iat: Math.floor(Date.now() / 1000),
  scope: grantedScopes
};

// 3. Sign token
const accessToken = jwt.sign(payload, privateKey, {
  algorithm: 'RS256',
  keyid: keyPair[0].id
});
```

### JWT Token Validation

```javascript
import jwt from 'jsonwebtoken';

// 1. Get public key
const keyPair = await keysResource.list();
const publicKey = keyPair[0].publicKey;

// 2. Verify signature and decode
try {
  const decoded = jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer: config.issuer
  });

  // 3. Check expiration (automatic in jwt.verify)
  // 4. Check audience
  if (decoded.aud !== expectedClientId) {
    throw new Error('Invalid audience');
  }

  return decoded;
} catch (error) {
  throw new Error('Invalid token');
}
```

### PKCE Validation

```javascript
import crypto from 'crypto';

// 1. Get code challenge from authorization request
const { codeChallenge, codeChallengeMethod } = authCode;

// 2. Compute challenge from verifier
let computedChallenge;
if (codeChallengeMethod === 'S256') {
  computedChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
} else {
  computedChallenge = codeVerifier;  // plain method
}

// 3. Compare
if (computedChallenge !== codeChallenge) {
  throw new Error('PKCE validation failed');
}
```

## Performance Considerations

### Database Queries

- **Session validation**: O(1) lookup by session ID
- **User lookup**: O(1) lookup by user ID
- **Email lookup**: O(n) scan (consider partition by email domain)
- **Client lookup**: O(1) lookup by client ID

### Caching

Consider caching:
- Public keys (JWKS) - rarely change
- User data - for token generation
- Client data - for validation

```javascript
// Example: Cache public keys
let cachedKeys = null;
let cacheExpiry = null;

async function getPublicKeys() {
  if (cachedKeys && cacheExpiry > Date.now()) {
    return cachedKeys;
  }

  cachedKeys = await keysResource.list();
  cacheExpiry = Date.now() + 3600000;  // 1 hour

  return cachedKeys;
}
```

### Token Generation

- **bcrypt**: Slow by design (use 10-12 rounds in production)
- **JWT signing**: Fast (<1ms with RSA-2048)
- **Session creation**: Fast (<10ms)

## See Also

- [Configuration](./configuration.md) - Configuration reference
- [OAuth2/OIDC](./oauth2-oidc.md) - OAuth2 implementation details
- [Security](./security.md) - Security best practices
- [Main Documentation](../identity-plugin.md) - Overview and quick start
