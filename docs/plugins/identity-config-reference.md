# Identity Plugin - Configuration Reference

Quick reference for all configuration options.

## Table of Contents

- [Core Settings](#core-settings)
- [Registration](#registration)
- [Password Policy](#password-policy)
- [Session Management](#session-management)
- [UI Customization](#ui-customization)
- [Email Configuration](#email-configuration)
- [Server Settings](#server-settings)

## Core Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `issuer` | string | **required** | OAuth2/OIDC issuer URL (e.g., `http://localhost:4000`) |
| `database` | Database | **required** | S3DB instance |
| `userResource` | string | `'users'` | S3DB resource name for users |
| `supportedScopes` | string[] | `['openid', 'profile', 'email', 'offline_access']` | OAuth2 scopes |
| `supportedGrantTypes` | string[] | `['authorization_code', 'client_credentials', 'refresh_token']` | OAuth2 grant types |
| `supportedResponseTypes` | string[] | `['code', 'token', 'id_token']` | OAuth2 response types |

## Token Expiration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `accessTokenExpiry` | string | `'15m'` | Access token lifetime (e.g., `'1h'`, `'30m'`) |
| `idTokenExpiry` | string | `'15m'` | ID token lifetime |
| `refreshTokenExpiry` | string | `'7d'` | Refresh token lifetime |
| `authCodeExpiry` | string | `'10m'` | Authorization code lifetime |

## Registration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `registration.enabled` | boolean | `true` | Enable/disable public registration |
| `registration.requireEmailVerification` | boolean | `true` | Require email verification before activation |
| `registration.allowedDomains` | string[] \| null | `null` | Whitelist of allowed email domains (null = all) |
| `registration.blockedDomains` | string[] | `[]` | Blacklist of blocked email domains |
| `registration.customMessage` | string \| null | `null` | Custom message when registration is disabled |

**Examples:**

```javascript
// Disable public registration
registration: {
  enabled: false,
  customMessage: 'Contact admin@company.com for access'
}

// Corporate emails only
registration: {
  enabled: true,
  allowedDomains: ['company.com', 'partner.com']
}

// Block temp emails
registration: {
  enabled: true,
  blockedDomains: ['tempmail.com', 'guerrillamail.com']
}
```

## Password Policy

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `passwordPolicy.minLength` | number | `8` | Minimum password length |
| `passwordPolicy.maxLength` | number | `128` | Maximum password length |
| `passwordPolicy.requireUppercase` | boolean | `true` | Require at least one uppercase letter |
| `passwordPolicy.requireLowercase` | boolean | `true` | Require at least one lowercase letter |
| `passwordPolicy.requireNumbers` | boolean | `true` | Require at least one number |
| `passwordPolicy.requireSymbols` | boolean | `false` | Require at least one symbol |
| `passwordPolicy.bcryptRounds` | number | `10` | bcrypt hashing rounds (10-12 recommended) |

**Examples:**

```javascript
// Weak (development only)
passwordPolicy: {
  minLength: 6,
  requireSymbols: false,
  bcryptRounds: 8
}

// Strong (production)
passwordPolicy: {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true,
  bcryptRounds: 12
}

// Maximum security
passwordPolicy: {
  minLength: 16,
  requireSymbols: true,
  bcryptRounds: 14
}
```

## Session Management

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `session.sessionExpiry` | string | `'24h'` | Session lifetime |
| `session.cookieName` | string | `'s3db_session'` | Session cookie name |
| `session.cookiePath` | string | `'/'` | Cookie path |
| `session.cookieHttpOnly` | boolean | `true` | HttpOnly flag (prevents JS access) |
| `session.cookieSecure` | boolean | `false` | Secure flag (requires HTTPS) |
| `session.cookieSameSite` | string | `'Lax'` | SameSite attribute (`Strict`, `Lax`, `None`) |
| `session.cleanupInterval` | number | `3600000` | Cleanup interval in ms (1 hour) |
| `session.enableCleanup` | boolean | `true` | Enable automatic session cleanup |

**Examples:**

```javascript
// Development (HTTP)
session: {
  sessionExpiry: '7d',
  cookieSecure: false,
  cookieSameSite: 'Lax'
}

// Production (HTTPS)
session: {
  sessionExpiry: '8h',
  cookieSecure: true,
  cookieSameSite: 'Strict',
  cleanupInterval: 1800000  // 30 minutes
}
```

## UI Customization

### Branding

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ui.title` | string | `'S3DB Identity'` | Page title suffix |
| `ui.companyName` | string | `'S3DB'` | Company name displayed in header/footer |
| `ui.tagline` | string | `'Secure Identity & Access...'` | Company tagline |
| `ui.logoUrl` | string \| null | `null` | URL to company logo image |
| `ui.favicon` | string \| null | `null` | URL to favicon |

### Colors

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ui.primaryColor` | string | `'#007bff'` | Primary brand color (buttons, links) |
| `ui.secondaryColor` | string | `'#6c757d'` | Secondary color |
| `ui.successColor` | string | `'#28a745'` | Success messages |
| `ui.dangerColor` | string | `'#dc3545'` | Error messages |
| `ui.warningColor` | string | `'#ffc107'` | Warning messages |
| `ui.infoColor` | string | `'#17a2b8'` | Info messages |
| `ui.textColor` | string | `'#212529'` | Primary text color |
| `ui.textMuted` | string | `'#6c757d'` | Muted text color |
| `ui.backgroundColor` | string | `'#ffffff'` | Background color |
| `ui.backgroundLight` | string | `'#f8f9fa'` | Light background (cards) |
| `ui.borderColor` | string | `'#dee2e6'` | Border color |

### Typography

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ui.fontFamily` | string | `-apple-system, ...` | Font family CSS value |
| `ui.fontSize` | string | `'16px'` | Base font size |

### Layout

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ui.borderRadius` | string | `'0.375rem'` | Border radius for elements |
| `ui.boxShadow` | string | `'0 0.125rem ...'` | Box shadow for cards |

### Company Info

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ui.footerText` | string \| null | `null` | Additional footer text |
| `ui.supportEmail` | string \| null | `null` | Support email address |
| `ui.privacyUrl` | string | `'/privacy'` | Privacy policy URL |
| `ui.termsUrl` | string | `'/terms'` | Terms of service URL |

### Social Links

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ui.socialLinks` | object \| null | `null` | Social media links object |
| `ui.socialLinks.github` | string | - | GitHub profile URL |
| `ui.socialLinks.twitter` | string | - | Twitter profile URL |
| `ui.socialLinks.linkedin` | string | - | LinkedIn company URL |

### Advanced

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ui.customCSS` | string \| null | `null` | Custom CSS to inject |
| `ui.customPages` | object | `{}` | Custom page overrides |

**Example:**

```javascript
ui: {
  companyName: 'Acme Corp',
  tagline: 'Secure Cloud Solutions',
  logoUrl: 'https://acme.com/logo.svg',
  primaryColor: '#ff6600',
  successColor: '#00cc66',
  fontFamily: 'Inter, sans-serif',
  footerText: 'Trusted by 10,000+ companies',
  supportEmail: 'support@acme.com',
  socialLinks: {
    github: 'https://github.com/acme',
    twitter: 'https://twitter.com/acme',
    linkedin: 'https://linkedin.com/company/acme'
  },
  customCSS: `
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(255, 102, 0, 0.3);
    }
  `
}
```

## Email Configuration

### Core Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `email.enabled` | boolean | `true` | Enable email service |
| `email.from` | string | `'noreply@s3db.identity'` | From email address |
| `email.replyTo` | string \| null | `null` | Reply-to email address |

### SMTP Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `email.smtp.host` | string | `'localhost'` | SMTP server hostname |
| `email.smtp.port` | number | `587` | SMTP server port |
| `email.smtp.secure` | boolean | `false` | Use TLS (true for port 465) |
| `email.smtp.auth.user` | string | `''` | SMTP username |
| `email.smtp.auth.pass` | string | `''` | SMTP password |
| `email.smtp.tls.rejectUnauthorized` | boolean | `true` | Verify TLS certificates |

### Email Templates

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `email.templates.baseUrl` | string | Server URL | Base URL for email links |
| `email.templates.brandName` | string | UI title | Brand name in emails |
| `email.templates.brandLogo` | string \| null | UI logo | Logo URL for emails |
| `email.templates.brandColor` | string | Primary color | Brand color for emails |
| `email.templates.supportEmail` | string \| null | `null` | Support email in footer |
| `email.templates.customFooter` | string \| null | `null` | Custom footer text |

**Examples:**

```javascript
// Gmail
email: {
  enabled: true,
  from: 'noreply@company.com',
  replyTo: 'support@company.com',
  smtp: {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: 'your-email@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD  // Use app password
    }
  }
}

// SendGrid
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

// AWS SES
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

## Server Settings

### Core

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `server.port` | number | `4000` | HTTP server port |
| `server.host` | string | `'0.0.0.0'` | HTTP server host |
| `server.verbose` | boolean | `false` | Enable verbose logging |

### CORS

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `server.cors.enabled` | boolean | `true` | Enable CORS middleware |
| `server.cors.origin` | string \| string[] | `'*'` | Allowed origins |
| `server.cors.methods` | string[] | `['GET', 'POST', ...]` | Allowed HTTP methods |
| `server.cors.allowedHeaders` | string[] | `['Content-Type', ...]` | Allowed headers |
| `server.cors.credentials` | boolean | `true` | Allow credentials |
| `server.cors.maxAge` | number | `86400` | Preflight cache time (seconds) |

### Security Headers

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `server.security.enabled` | boolean | `true` | Enable security headers |
| `server.security.contentSecurityPolicy` | boolean | `true` | Enable CSP header |
| `server.security.hsts` | boolean | `false` | Enable HSTS (production only) |

### Logging

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `server.logging.enabled` | boolean | `false` | Enable request logging |
| `server.logging.format` | string | `':method :path ...'` | Log format |

**Examples:**

```javascript
// Development
server: {
  port: 4000,
  host: '0.0.0.0',
  verbose: true,
  cors: {
    enabled: true,
    origin: '*',
    credentials: true
  },
  security: {
    enabled: true,
    hsts: false
  },
  logging: {
    enabled: true,
    format: 'dev'
  }
}

// Production
server: {
  port: 443,
  host: '0.0.0.0',
  verbose: false,
  cors: {
    enabled: true,
    origin: [
      'https://app.company.com',
      'https://admin.company.com'
    ],
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

# Sessions
SESSION_SECRET=random-32-char-secret

# Security
NODE_ENV=production
```

## Minimal Configuration

Absolute minimum to get started:

```javascript
new IdentityPlugin({
  issuer: 'http://localhost:4000',
  database: db
})
```

This uses all defaults and creates a working identity server.

## Recommended Production Configuration

```javascript
new IdentityPlugin({
  // Core
  issuer: 'https://auth.company.com',
  database: db,

  // Registration
  registration: {
    enabled: true,
    requireEmailVerification: true,
    allowedDomains: ['company.com']
  },

  // Password
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
})
```

---

**See also:**
- [Identity Plugin Documentation](./identity-plugin.md)
- [Examples Index](./identity-examples.md)
