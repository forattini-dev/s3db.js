# Identity Plugin - Troubleshooting

[← Back to Identity Plugin](../identity-plugin.md) | [Security](./security.md) | [Architecture →](./architecture.md)

Common issues and solutions for the Identity Provider plugin.

## Table of Contents

- [Registration Issues](#registration-issues)
- [Email Issues](#email-issues)
- [Session Issues](#session-issues)
- [Admin Panel Issues](#admin-panel-issues)
- [OAuth2 Issues](#oauth2-issues)
- [Database Issues](#database-issues)
- [Performance Issues](#performance-issues)

## Registration Issues

### "Registration is disabled" Error

**Symptoms:** Users cannot access `/register`, redirected to `/login` with error.

**Cause:** `registration.enabled` is set to `false`.

**Solution 1:** Enable registration

```javascript
registration: {
  enabled: true
}
```

**Solution 2:** Keep disabled, create users via admin panel

```javascript
// This is intentional for enterprise environments
// Create users via /admin/users/create
```

### "Registration is restricted to specific email domains"

**Symptoms:** Users with certain email domains cannot register.

**Cause:** `registration.allowedDomains` whitelist configured.

**Check configuration:**

```javascript
registration: {
  allowedDomains: ['company.com', 'partner.com']
}
```

**Solutions:**
1. Add user's domain to whitelist
2. Remove whitelist (`allowedDomains: null`)
3. Create user manually via admin panel

### "Registration with this email domain is not allowed"

**Symptoms:** Specific domains blocked from registration.

**Cause:** `registration.blockedDomains` blacklist configured.

**Check configuration:**

```javascript
registration: {
  blockedDomains: ['tempmail.com', 'guerrillamail.com']
}
```

**Solutions:**
1. Remove domain from blacklist
2. Create user manually via admin panel

### Password Validation Fails

**Symptoms:** "Password does not meet requirements" error.

**Cause:** Password doesn't meet policy requirements.

**Check policy:**

```javascript
passwordPolicy: {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true
}
```

**Solutions:**
1. Use stronger password meeting all requirements
2. Relax policy (not recommended for production)

```javascript
passwordPolicy: {
  minLength: 8,
  requireSymbols: false
}
```

## Email Issues

### Emails Not Sending

**Symptoms:** Email verification/password reset emails not received.

**Possible Causes:**

#### 1. Email Service Disabled

```javascript
email: {
  enabled: false  // ❌ Emails disabled
}
```

**Solution:** Enable email service

```javascript
email: {
  enabled: true
}
```

#### 2. Invalid SMTP Configuration

**Check SMTP settings:**

```javascript
email: {
  smtp: {
    host: process.env.SMTP_HOST,     // Correct hostname?
    port: parseInt(process.env.SMTP_PORT),  // Correct port (587 or 465)?
    auth: {
      user: process.env.SMTP_USER,   // Correct username?
      pass: process.env.SMTP_PASS    // Correct password?
    }
  }
}
```

**Common Issues:**
- Wrong hostname (e.g., `smtp.gmail.com` not `mail.gmail.com`)
- Wrong port (587 for TLS, 465 for SSL)
- Missing/incorrect credentials
- Gmail: Not using app password

#### 3. Gmail App Password Not Used

**Gmail requires app passwords** when 2FA is enabled.

**Steps:**
1. Enable 2FA: https://myaccount.google.com/security
2. Generate app password: https://myaccount.google.com/apppasswords
3. Use app password (not regular password)

```javascript
email: {
  smtp: {
    host: 'smtp.gmail.com',
    port: 587,
    auth: {
      user: 'your-email@gmail.com',
      pass: 'xxxx xxxx xxxx xxxx'  // 16-char app password
    }
  }
}
```

#### 4. Firewall Blocking SMTP

**Check firewall allows outbound SMTP:**

```bash
# Test SMTP connection
telnet smtp.gmail.com 587

# Should see:
# 220 smtp.gmail.com ESMTP
```

**Solution:** Allow outbound port 587 (or 465) in firewall.

### Testing Email Configuration

Use MailHog for development:

```bash
# Run MailHog
docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog

# Configure Identity Plugin
email: {
  smtp: {
    host: 'localhost',
    port: 1025,
    secure: false
  }
}

# View emails: http://localhost:8025
```

## Session Issues

### Session Not Persisting

**Symptoms:** User logged out immediately after login.

**Possible Causes:**

#### 1. Cookie Secure Mismatch

**Development (HTTP):**

```javascript
session: {
  cookieSecure: false  // ✅ Correct for HTTP
}
```

**Production (HTTPS):**

```javascript
session: {
  cookieSecure: true  // ✅ Correct for HTTPS
}
```

**Problem:** `cookieSecure: true` on HTTP → cookie rejected.

**Solution:** Match `cookieSecure` to your deployment protocol.

#### 2. SameSite Too Strict

```javascript
session: {
  cookieSameSite: 'Strict'  // May break cross-site flows
}
```

**Solution:** Use `Lax` for better compatibility:

```javascript
session: {
  cookieSameSite: 'Lax'
}
```

#### 3. Domain Mismatch

Cookie domain must match request domain.

**Check:** Browser DevTools → Application → Cookies

**Solution:** Ensure `issuer` matches your domain:

```javascript
issuer: 'http://localhost:4000'  // Development
// issuer: 'https://auth.company.com'  // Production
```

### Sessions Expire Too Quickly

**Cause:** Short session expiry

```javascript
session: {
  sessionExpiry: '1h'  // Too short?
}
```

**Solution:** Increase expiry

```javascript
session: {
  sessionExpiry: '24h'  // Development
  // sessionExpiry: '8h'  // Production
}
```

## Admin Panel Issues

### "Admin" Link Not Showing

**Symptoms:** No "Admin" link in navigation after login.

**Cause:** User doesn't have admin role.

**Check user role:**

```javascript
const user = await usersResource.get(userId);
console.log(user.role);        // Should be 'admin'
console.log(user.isAdmin);     // Or true
```

**Solution:** Grant admin role

```javascript
await usersResource.update(userId, { role: 'admin' });
// or
await usersResource.update(userId, { isAdmin: true });
```

### Cannot Access `/admin`

**Symptoms:** Redirected to `/login` when visiting `/admin`.

**Possible Causes:**

#### 1. Not Logged In

**Solution:** Login first at `/login`.

#### 2. Session Expired

**Solution:** Login again.

#### 3. Not Admin User

**Solution:** Grant admin role (see above).

### Admin Panel Empty

**Symptoms:** Admin panel loads but no users/clients shown.

**Cause:** S3DB resources not created or empty.

**Check resources:**

```javascript
console.log('Resources:', Object.keys(db.resources));

// Should include:
// - users
// - plg_oauth_clients
// - plg_sessions
```

**Solution:** Ensure database initialized:

```javascript
await db.initialize();
await identityPlugin.initialize();
```

## OAuth2 Issues

### "Invalid client credentials"

**Symptoms:** Token endpoint returns 401 error.

**Possible Causes:**

#### 1. Wrong Client ID or Secret

**Check credentials match registered client:**

```javascript
const client = await db.resources.plg_oauth_clients.get(clientId);
console.log('Client exists:', !!client);

// Verify secret (bcrypt compare)
const valid = await bcrypt.compare(clientSecret, client.clientSecret);
console.log('Secret valid:', valid);
```

#### 2. Client Inactive

```javascript
console.log('Client status:', client.status);
// Should be 'active'
```

**Solution:** Activate client

```javascript
await db.resources.plg_oauth_clients.update(clientId, {
  status: 'active'
});
```

### "Invalid redirect_uri"

**Symptoms:** Authorization fails with redirect_uri error.

**Cause:** Redirect URI not registered for client.

**Check registered URIs:**

```javascript
const client = await db.resources.plg_oauth_clients.get(clientId);
console.log('Registered URIs:', client.redirectUris);
```

**Solution:** Add redirect URI to client

```javascript
await db.resources.plg_oauth_clients.update(clientId, {
  redirectUris: [
    ...client.redirectUris,
    'http://localhost:3000/callback'
  ]
});
```

### "Invalid authorization code"

**Symptoms:** Token exchange fails.

**Possible Causes:**

#### 1. Code Already Used

Authorization codes are single-use.

**Solution:** Request new authorization code.

#### 2. Code Expired

Codes expire after `authCodeExpiry` (default: 10 minutes).

**Solution:** Increase expiry or request new code faster:

```javascript
authCodeExpiry: '15m'  // Increase to 15 minutes
```

#### 3. PKCE Verifier Mismatch

**Cause:** `code_verifier` doesn't match original `code_challenge`.

**Solution:** Use same `code_verifier` from authorization request.

## Database Issues

### "Resource not found"

**Symptoms:** Error accessing users or other resources.

**Cause:** S3DB resources not created.

**Check resources:**

```javascript
console.log('Available resources:', Object.keys(db.resources));
```

**Solution:** Initialize database and plugin:

```javascript
await db.initialize();
await identityPlugin.initialize();
```

### S3 Connection Errors

**Symptoms:** Cannot connect to S3/MinIO.

**Check connection string:**

```javascript
// MinIO local
connectionString: 'http://minioadmin:minioadmin@localhost:9000/bucket'

// AWS S3
connectionString: 's3://ACCESS_KEY:SECRET_KEY@bucket?region=us-east-1'
```

**Test connection:**

```bash
# MinIO
curl http://localhost:9000/minio/health/live

# AWS S3
aws s3 ls s3://bucket --region us-east-1
```

### Metadata File Corrupted

**Symptoms:** Database fails to load metadata.

**Check metadata:**

```javascript
try {
  await db.initialize();
} catch (error) {
  console.error('Metadata error:', error.message);
}
```

**Solution:** Restore from backup or recreate:

```javascript
// S3DB automatically creates backups
// Check: s3://bucket/.s3db/metadata.json.backup-TIMESTAMP

// Or recreate from scratch (CAUTION: data loss!)
await db.dropDatabase();
await db.initialize();
```

## Performance Issues

### Slow Login/Registration

**Possible Causes:**

#### 1. High bcrypt Rounds

```javascript
passwordPolicy: {
  bcryptRounds: 14  // Very slow (~1.6s)
}
```

**Solution:** Reduce rounds for development:

```javascript
passwordPolicy: {
  bcryptRounds: 10  // ~100ms
}
```

**Note:** Keep 12 for production.

#### 2. S3 Latency

**Check S3 response times:**

```bash
time curl http://localhost:9000/bucket/
```

**Solutions:**
- Use local MinIO for development
- Use S3 in same region as application
- Enable S3 Transfer Acceleration

### Memory Issues

**Symptoms:** High memory usage, OOM errors.

**Possible Causes:**

#### 1. Session Cleanup Disabled

```javascript
session: {
  enableCleanup: false  // ❌ Sessions never deleted
}
```

**Solution:** Enable cleanup

```javascript
session: {
  enableCleanup: true,
  cleanupInterval: 3600000  // 1 hour
}
```

#### 2. Too Many Sessions

**Check session count:**

```javascript
const sessions = await db.resources.plg_sessions.list();
console.log('Total sessions:', sessions.length);
```

**Solution:** Reduce session expiry

```javascript
session: {
  sessionExpiry: '8h'  // Shorter than 24h
}
```

## Debug Mode

Enable verbose logging for troubleshooting:

```javascript
server: {
  verbose: true,
  logging: {
    enabled: true,
    format: 'combined'
  }
}
```

**Output:**
```
POST /login 200 234ms
GET /profile 200 45ms
POST /oauth/token 200 123ms
```

## Getting Help

If issues persist:

1. **Check logs:** Enable verbose mode
2. **Check S3DB docs:** https://github.com/forattini-dev/s3db.js
3. **Open issue:** https://github.com/forattini-dev/s3db.js/issues
4. **Provide details:**
   - Node version
   - S3DB version
   - Configuration (sanitized)
   - Error messages
   - Steps to reproduce

## See Also

- [Configuration](./configuration.md) - Configuration reference
- [Security](./security.md) - Security best practices
- [Admin Panel](./admin-panel.md) - Admin panel guide
- [Main Documentation](../identity-plugin.md) - Overview and quick start
