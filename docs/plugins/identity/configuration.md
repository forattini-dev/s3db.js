# Identity Plugin - Configuration

Complete configuration reference for the Identity Provider plugin.

## Table of Contents

- [Core Settings](#core-settings)
- [Token Expiration](#token-expiration)
- [Registration](#registration)
- [Password Policy](#password-policy)
- [Session Management](#session-management)
- [UI Configuration](#ui-configuration)
- [Email Configuration](#email-configuration)
- [Server Settings](#server-settings)
- [Complete Example](#complete-example)

## Core Settings

```javascript
{
  // OAuth2/OIDC Configuration
  issuer: 'http://localhost:4000',  // Required - OAuth2 issuer URL
  database: db,                      // Required - S3DB instance
  userResource: 'users',             // S3DB resource name for users

  // Supported OAuth2 Features
  supportedScopes: ['openid', 'profile', 'email', 'offline_access'],
  supportedGrantTypes: ['authorization_code', 'client_credentials', 'refresh_token'],
  supportedResponseTypes: ['code', 'token', 'id_token']
}
```

## Token Expiration

Configure token lifetimes using human-readable durations:

```javascript
{
  accessTokenExpiry: '15m',      // Access token lifetime (default: 15 minutes)
  idTokenExpiry: '15m',          // ID token lifetime (default: 15 minutes)
  refreshTokenExpiry: '7d',      // Refresh token lifetime (default: 7 days)
  authCodeExpiry: '10m'          // Authorization code lifetime (default: 10 minutes)
}
```

**Supported formats:**
- `15m` - 15 minutes
- `1h` - 1 hour
- `24h` - 24 hours
- `7d` - 7 days
- `30d` - 30 days

**Recommendations:**
- **Access tokens**: 15-60 minutes
- **ID tokens**: 15-60 minutes (matches access token)
- **Refresh tokens**: 7-30 days
- **Auth codes**: 5-10 minutes (short-lived, single use)

## Registration

Control public registration and email domain restrictions.

### Basic Configuration

```javascript
registration: {
  enabled: true,                      // Enable/disable public registration
  requireEmailVerification: true,     // Require email verification
  allowedDomains: null,               // null = all domains allowed
  blockedDomains: [],                 // Block specific domains
  customMessage: null                 // Custom message when disabled
}
```

### Scenario 1: Disable Public Registration

Enterprise/B2B environments where admins create all users:

```javascript
registration: {
  enabled: false,
  customMessage: 'Registration is disabled. Please contact your administrator for access.'
}
```

**Result:**
- `/register` redirects to `/login` with custom message
- "Register" links hidden throughout UI
- Only admins can create users via admin panel

### Scenario 2: Corporate Emails Only

Allow only specific email domains:

```javascript
registration: {
  enabled: true,
  requireEmailVerification: true,
  allowedDomains: ['company.com', 'partner.com'],
  customMessage: 'Please use your corporate email address'
}
```

**Result:**
- Only `@company.com` and `@partner.com` can register
- Other domains rejected with error message
- Email verification required before activation

### Scenario 3: Block Temporary Emails

Block disposable email services:

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

**Result:**
- Blocked domains cannot register
- Error: "Registration with this email domain is not allowed"

### Scenario 4: Combined (Whitelist + Blacklist)

```javascript
registration: {
  enabled: true,
  requireEmailVerification: true,
  allowedDomains: ['company.com'],      // Only corporate
  blockedDomains: ['tempmail.com'],     // Extra safety
  customMessage: 'Corporate email required'
}
```

## Password Policy

Configure password strength requirements:

```javascript
passwordPolicy: {
  minLength: 8,              // Minimum password length (default: 8)
  maxLength: 128,            // Maximum password length (default: 128)
  requireUppercase: true,    // Require at least one uppercase letter
  requireLowercase: true,    // Require at least one lowercase letter
  requireNumbers: true,      // Require at least one number
  requireSymbols: false,     // Require at least one symbol (!@#$%^&*)
  bcryptRounds: 10           // bcrypt hashing rounds (default: 10)
}
```

### Development (Weak)

```javascript
passwordPolicy: {
  minLength: 6,
  requireSymbols: false,
  bcryptRounds: 8
}
```

### Production (Strong)

```javascript
passwordPolicy: {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true,
  bcryptRounds: 12
}
```

### Maximum Security

```javascript
passwordPolicy: {
  minLength: 16,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true,
  bcryptRounds: 14
}
```

**bcrypt Rounds:**
- `8-10`: Development (faster, less secure)
- `10-12`: Production (balanced)
- `12-14`: High security (slower, more secure)

## Session Management

Configure session behavior and cookie settings:

```javascript
session: {
  sessionExpiry: '24h',           // Session lifetime (default: 24 hours)
  cookieName: 's3db_session',     // Session cookie name
  cookiePath: '/',                // Cookie path
  cookieHttpOnly: true,           // HttpOnly flag (prevents JS access)
  cookieSecure: false,            // Secure flag (requires HTTPS)
  cookieSameSite: 'Lax',          // SameSite attribute (Strict/Lax/None)
  cleanupInterval: 3600000,       // Cleanup interval in ms (1 hour)
  enableCleanup: true             // Enable automatic session cleanup
}
```

### Development (HTTP)

```javascript
session: {
  sessionExpiry: '7d',
  cookieSecure: false,
  cookieSameSite: 'Lax'
}
```

### Production (HTTPS)

```javascript
session: {
  sessionExpiry: '8h',              // Shorter for production
  cookieHttpOnly: true,
  cookieSecure: true,               // Requires HTTPS
  cookieSameSite: 'Strict',         // Maximum security
  cleanupInterval: 1800000          // 30 minutes
}
```

**SameSite Options:**
- `Strict`: Maximum security, may break some OAuth2 flows
- `Lax`: Balanced (recommended for most cases)
- `None`: Required for cross-site OAuth2 (requires `cookieSecure: true`)

## UI Configuration

See [UI Customization](./ui-customization.md) for complete white-label options.

Quick reference:

```javascript
ui: {
  // Branding
  companyName: 'My Company',
  tagline: 'Secure Identity Management',
  logoUrl: 'https://example.com/logo.svg',

  // Colors
  primaryColor: '#007bff',
  successColor: '#28a745',
  dangerColor: '#dc3545',

  // Company Info
  supportEmail: 'support@example.com',
  privacyUrl: '/privacy',
  termsUrl: '/terms'
}
```

## Email Configuration

Configure SMTP for email verification and password reset:

### Basic SMTP

```javascript
email: {
  enabled: true,
  from: 'noreply@example.com',
  replyTo: 'support@example.com',
  smtp: {
    host: 'smtp.example.com',
    port: 587,
    secure: false,          // true for port 465
    auth: {
      user: 'your-email@example.com',
      pass: 'your-password'
    },
    tls: {
      rejectUnauthorized: true
    }
  }
}
```

### Gmail

```javascript
email: {
  enabled: true,
  from: 'noreply@company.com',
  smtp: {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: 'your-email@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD  // Use app password!
    }
  }
}
```

**Gmail Setup:**
1. Enable 2FA on your Google account
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Use app password (not your regular password)

### SendGrid

```javascript
email: {
  enabled: true,
  from: 'noreply@company.com',
  smtp: {
    host: 'smtp.sendgrid.net',
    port: 587,
    auth: {
      user: 'apikey',
      pass: process.env.SENDGRID_API_KEY
    }
  }
}
```

### AWS SES

```javascript
email: {
  enabled: true,
  from: 'noreply@company.com',
  smtp: {
    host: 'email-smtp.us-east-1.amazonaws.com',
    port: 587,
    auth: {
      user: process.env.AWS_SES_USER,
      pass: process.env.AWS_SES_PASSWORD
    }
  }
}
```

### Email Templates

Customize email appearance:

```javascript
email: {
  enabled: true,
  from: 'noreply@company.com',
  templates: {
    baseUrl: 'https://auth.company.com',
    brandName: 'My Company',
    brandLogo: 'https://company.com/logo.png',
    brandColor: '#007bff',
    supportEmail: 'support@company.com',
    customFooter: 'My Company - Secure Identity Solutions'
  }
}
```

### Disable Email (Development)

```javascript
email: {
  enabled: false
}
```

**Note:** When disabled:
- Email verification not sent (users must be manually activated)
- Password reset requires admin intervention
- Useful for development/testing

## Server Settings

Configure HTTP server, CORS, security headers, and logging:

### Basic Server

```javascript
server: {
  port: 4000,
  host: '0.0.0.0',
  verbose: true
}
```

### CORS Configuration

```javascript
server: {
  cors: {
    enabled: true,
    origin: '*',                    // Development
    // origin: ['https://app.company.com'],  // Production
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
    maxAge: 86400
  }
}
```

### Security Headers

```javascript
server: {
  security: {
    enabled: true,
    contentSecurityPolicy: true,
    hsts: false                     // Set true in production with HTTPS
  }
}
```

### Logging

```javascript
server: {
  logging: {
    enabled: true,
    format: ':method :path :status :response-time ms'
    // format: 'combined'           // Apache combined log format
  }
}
```

### Complete Server Config

```javascript
server: {
  port: 4000,
  host: '0.0.0.0',
  verbose: true,

  cors: {
    enabled: true,
    origin: ['https://app.company.com'],
    credentials: true
  },

  security: {
    enabled: true,
    contentSecurityPolicy: true,
    hsts: true
  },

  logging: {
    enabled: true,
    format: 'combined'
  }
}
```

## Complete Example

### Minimal Configuration

```javascript
import { Database } from 's3db.js';
import { IdentityPlugin } from 's3db.js/plugins/identity';

const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/myapp'
});

await db.initialize();

const identityPlugin = new IdentityPlugin({
  issuer: 'http://localhost:4000',
  database: db
});

await identityPlugin.initialize();
```

### Production Configuration

```javascript
import { Database } from 's3db.js';
import { IdentityPlugin } from 's3db.js/plugins/identity';

const db = new Database({
  connectionString: process.env.MRT_CONNECTION_STRING
});

await db.initialize();

const identityPlugin = new IdentityPlugin({
  // Core
  issuer: 'https://auth.company.com',
  database: db,

  // Registration
  registration: {
    enabled: true,
    requireEmailVerification: true,
    allowedDomains: ['company.com']
  },

  // Password Policy
  passwordPolicy: {
    minLength: 12,
    requireSymbols: true,
    bcryptRounds: 12
  },

  // Session
  session: {
    sessionExpiry: '8h',
    cookieSecure: true,
    cookieSameSite: 'Strict'
  },

  // Email
  email: {
    enabled: true,
    from: 'noreply@company.com',
    smtp: {
      host: process.env.SMTP_HOST,
      port: 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    }
  },

  // UI
  ui: {
    companyName: 'My Company',
    primaryColor: '#007bff',
    supportEmail: 'support@company.com'
  },

  // Server
  server: {
    port: 443,
    cors: {
      origin: ['https://app.company.com']
    },
    security: {
      enabled: true,
      hsts: true
    }
  }
});

await identityPlugin.initialize();
```

## Environment Variables

Recommended environment variables for production:

```bash
# Database
MRT_CONNECTION_STRING=s3://ACCESS_KEY:SECRET_KEY@bucket/path

# Email (Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Email (SendGrid)
SENDGRID_API_KEY=your-sendgrid-api-key

# Server
IDENTITY_PORT=4000
IDENTITY_ISSUER=https://auth.company.com

# Security
NODE_ENV=production
```

## See Also

- [UI Customization](./ui-customization.md) - White-label branding and custom pages
- [Registration Controls](./registration-controls.md) - Detailed registration scenarios
- [Security Best Practices](./security.md) - Production security guide
- [Main Documentation](../identity-plugin.md) - Overview and quick start
