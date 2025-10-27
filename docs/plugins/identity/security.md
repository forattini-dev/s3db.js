# Identity Plugin - Security Best Practices

Security guidelines and best practices for production deployment.

## Table of Contents

- [Production Checklist](#production-checklist)
- [HTTPS & Certificates](#https--certificates)
- [Password Security](#password-security)
- [Session Security](#session-security)
- [CORS Configuration](#cors-configuration)
- [Rate Limiting](#rate-limiting)
- [Secret Management](#secret-management)
- [Monitoring & Auditing](#monitoring--auditing)

## Production Checklist

Before deploying to production:

- [ ] **HTTPS enabled** with valid SSL certificate
- [ ] **Strong password policy** (12+ chars, symbols required)
- [ ] **Email verification** required
- [ ] **Domain restrictions** configured (if applicable)
- [ ] **Secure cookie settings** (`cookieSecure: true`, `cookieSameSite: 'Strict'`)
- [ ] **HSTS enabled** (HTTP Strict Transport Security)
- [ ] **CORS restricted** to specific origins
- [ ] **Rate limiting** configured at reverse proxy
- [ ] **Secrets in environment variables** (not hardcoded)
- [ ] **Session expiry** set to reasonable value (8h)
- [ ] **Admin access** limited to authorized users
- [ ] **Monitoring & logging** enabled

## HTTPS & Certificates

### Why HTTPS is Required

- **Secure cookies** require HTTPS (`cookieSecure: true`)
- **Credential protection** from man-in-the-middle attacks
- **OIDC compliance** requires secure channels
- **Browser security** flags non-HTTPS login forms

### Configuration

```javascript
session: {
  cookieSecure: true,  // Requires HTTPS
  cookieSameSite: 'Strict'
},

server: {
  security: {
    hsts: true,  // HTTP Strict Transport Security
    contentSecurityPolicy: true
  }
}
```

### SSL Termination

Use reverse proxy (nginx, Cloudflare) for SSL termination:

```nginx
server {
  listen 443 ssl http2;
  server_name auth.company.com;

  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;

  # HSTS
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

  location / {
    proxy_pass http://localhost:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Password Security

### Strong Password Policy

```javascript
passwordPolicy: {
  minLength: 12,              // Minimum 12 characters
  requireUppercase: true,     // At least one uppercase letter
  requireLowercase: true,     // At least one lowercase letter
  requireNumbers: true,       // At least one number
  requireSymbols: true,       // At least one symbol (!@#$%^&*)
  bcryptRounds: 12            // High bcrypt rounds for production
}
```

### bcrypt Rounds

| Rounds | Time | Security | Use Case |
|--------|------|----------|----------|
| 8 | ~50ms | Low | Development only |
| 10 | ~100ms | Medium | Balanced |
| 12 | ~400ms | High | Production (recommended) |
| 14 | ~1.6s | Very High | High security |

**Recommendation:** Use 12 rounds for production.

### Password Reset Security

```javascript
// Password reset tokens expire after 1 hour
// Tokens are single-use (deleted after reset)
// Email verification required before reset
```

**Best Practices:**
- Limit password reset requests (3 per hour via rate limiting)
- Use secure token generation (crypto.randomBytes)
- Delete used tokens immediately
- Log all password reset attempts

## Session Security

### Secure Cookie Settings

```javascript
session: {
  sessionExpiry: '8h',           // Shorter for production
  cookieHttpOnly: true,          // Prevent XSS access
  cookieSecure: true,            // Require HTTPS
  cookieSameSite: 'Strict',      // CSRF protection
  enableCleanup: true,           // Auto-cleanup expired sessions
  cleanupInterval: 1800000       // 30 minutes
}
```

### SameSite Options

| Value | Security | OAuth2 Compatibility | Use Case |
|-------|----------|---------------------|----------|
| `Strict` | Highest | Limited | Same-domain only |
| `Lax` | High | Good | Most applications |
| `None` | Medium | Full | Cross-site OAuth2 (requires `cookieSecure: true`) |

**Recommendation:** Use `Strict` for same-domain, `Lax` for most cases.

### Session Expiry

```javascript
// Development: Long sessions for convenience
sessionExpiry: '7d'

// Production: Shorter sessions for security
sessionExpiry: '8h'

// High security: Very short sessions
sessionExpiry: '1h'
```

**Best Practice:** Balance security and UX. 8 hours is reasonable for most applications.

### Device Tracking

Sessions include:
- IP address
- User agent
- Creation timestamp

Use for:
- Detecting suspicious logins
- Showing active sessions to users
- Revoking specific sessions

## CORS Configuration

### Development

```javascript
server: {
  cors: {
    origin: '*',  // Allow all origins
    credentials: true
  }
}
```

### Production

```javascript
server: {
  cors: {
    origin: [
      'https://app.company.com',
      'https://admin.company.com'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }
}
```

**Important:** Never use `origin: '*'` with `credentials: true` in production.

## Rate Limiting

Implement at reverse proxy level (nginx, Cloudflare, AWS ALB):

### nginx Rate Limiting

```nginx
# Define rate limit zones
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=register:10m rate=3r/h;
limit_req_zone $binary_remote_addr zone=reset:10m rate=3r/h;

server {
  # Login endpoint: 5 requests per minute
  location /login {
    limit_req zone=login burst=10 nodelay;
    proxy_pass http://localhost:4000;
  }

  # Registration: 3 requests per hour
  location /register {
    limit_req zone=register burst=2 nodelay;
    proxy_pass http://localhost:4000;
  }

  # Password reset: 3 requests per hour
  location /forgot-password {
    limit_req zone=reset burst=2 nodelay;
    proxy_pass http://localhost:4000;
  }
}
```

### Recommended Limits

| Endpoint | Rate Limit | Reason |
|----------|------------|--------|
| `/login` | 5 per minute | Prevent brute force |
| `/register` | 3 per hour | Prevent spam accounts |
| `/forgot-password` | 3 per hour | Prevent abuse |
| `/oauth/token` | 10 per minute | Prevent token abuse |
| `/oauth/authorize` | 20 per minute | Normal OAuth2 flow |

## Secret Management

### Environment Variables

**Never hardcode secrets:**

```javascript
// ❌ BAD
email: {
  smtp: {
    auth: {
      user: 'admin@company.com',
      pass: 'hardcoded-password'  // NEVER DO THIS!
    }
  }
}

// ✅ GOOD
email: {
  smtp: {
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  }
}
```

### Environment Variables Template

```bash
# Database
MRT_CONNECTION_STRING=s3://ACCESS_KEY:SECRET_KEY@bucket/path

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Server
IDENTITY_ISSUER=https://auth.company.com
IDENTITY_PORT=4000

# Node
NODE_ENV=production
```

### Secret Rotation

Regularly rotate:
- **OAuth2 client secrets** (every 90 days)
- **SMTP passwords** (every 90 days)
- **S3 access keys** (every 90 days)

## Registration Controls

### Disable Public Registration

Enterprise environments:

```javascript
registration: {
  enabled: false,
  customMessage: 'Contact IT for account access'
}
```

### Corporate Emails Only

```javascript
registration: {
  enabled: true,
  requireEmailVerification: true,
  allowedDomains: ['company.com', 'partner.com']
}
```

### Block Disposable Emails

```javascript
registration: {
  enabled: true,
  blockedDomains: [
    'tempmail.com',
    'guerrillamail.com',
    '10minutemail.com',
    'mailinator.com',
    'throwaway.email'
  ]
}
```

## Monitoring & Auditing

### Logging

Enable comprehensive logging:

```javascript
server: {
  verbose: true,
  logging: {
    enabled: true,
    format: 'combined'  // Apache combined log format
  }
}
```

### Audit Trail

Implement audit logging for:
- User logins
- Password changes
- Admin actions (user creation, deletion)
- OAuth2 client creation/deletion
- Failed login attempts

```javascript
// Example audit logging
const auditLog = await db.resources.audit_log.insert({
  eventType: 'USER_LOGIN',
  userId: user.id,
  ipAddress: request.ip,
  userAgent: request.headers['user-agent'],
  success: true,
  timestamp: new Date().toISOString()
});
```

### Alerting

Set up alerts for:
- Multiple failed login attempts (brute force)
- Admin account creation
- Suspicious IP addresses
- OAuth2 client secret rotations
- Email verification failures

### Metrics

Track:
- Login success/failure rate
- Registration rate
- OAuth2 token issuance rate
- Session count
- Active users

## Security Headers

### Content Security Policy

```javascript
server: {
  security: {
    contentSecurityPolicy: true
  }
}
```

**Default CSP:**
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'
```

### HSTS (HTTP Strict Transport Security)

```javascript
server: {
  security: {
    hsts: true
  }
}
```

**Header:**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## Vulnerability Prevention

### XSS (Cross-Site Scripting)

**Protections:**
- `cookieHttpOnly: true` (prevents JavaScript access)
- CSP headers
- Input sanitization (automatic via Hono)
- Output encoding (automatic via `html` helper)

### CSRF (Cross-Site Request Forgery)

**Protections:**
- `cookieSameSite: 'Strict'` or `'Lax'`
- State parameter in OAuth2 flows
- Form tokens (planned feature)

### SQL Injection

**Not applicable** - S3DB uses S3 metadata, not SQL.

### Brute Force

**Protections:**
- Rate limiting (nginx/Cloudflare)
- Account lockout (planned feature)
- bcrypt password hashing (slow by design)

## Compliance

### GDPR

For GDPR compliance:
- Allow users to download their data
- Allow users to delete their accounts
- Log data processing activities
- Implement data retention policies

### SOC 2

For SOC 2 compliance:
- Enable audit logging
- Implement access controls (admin roles)
- Regular security reviews
- Incident response plan

## Incident Response

### Security Incident Checklist

1. **Identify** the incident type
2. **Contain** the threat (disable accounts, revoke tokens)
3. **Investigate** logs and audit trail
4. **Remediate** vulnerabilities
5. **Document** incident details
6. **Review** and improve procedures

### Emergency Actions

**Compromised Admin Account:**
```javascript
// Immediately revoke admin role
await usersResource.update(userId, { role: 'user' });

// Delete all sessions
await sessionsResource.delete({ userId });
```

**Compromised OAuth2 Client:**
```javascript
// Immediately deactivate client
await clientsResource.update(clientId, { status: 'inactive' });

// Rotate secret
const newSecret = crypto.randomBytes(32).toString('hex');
await clientsResource.update(clientId, {
  clientSecret: await bcrypt.hash(newSecret, 10)
});
```

## See Also

- [Configuration](./configuration.md) - Security-related configuration
- [Admin Panel](./admin-panel.md) - Admin access control
- [OAuth2/OIDC](./oauth2-oidc.md) - OAuth2 security
- [Main Documentation](../identity-plugin.md) - Overview and quick start
