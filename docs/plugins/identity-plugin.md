# Identity Provider Plugin

Complete OAuth2/OpenID Connect Identity Provider built on S3DB.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Quick Start](#quick-start)
- [Configuration Reference](#configuration-reference)
- [UI Customization](#ui-customization)
- [Registration Controls](#registration-controls)
- [Admin Panel](#admin-panel)
- [OAuth2/OIDC Endpoints](#oauth2oidc-endpoints)
- [Examples](#examples)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The Identity Plugin transforms S3DB into a full-featured OAuth2/OpenID Connect Identity Provider with:

- Complete authentication system (login, registration, password reset)
- OAuth2 authorization server with PKCE support
- OpenID Connect (OIDC) identity layer
- White-label UI with custom branding
- Admin panel for user and client management
- Email verification and password reset flows
- Session management with device tracking
- Highly customizable and production-ready

**Architecture:**
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

## Features

### Authentication & Authorization
- ✅ **Login/Logout** - Session-based authentication
- ✅ **Registration** - Self-service account creation with email verification
- ✅ **Password Reset** - Secure token-based password recovery
- ✅ **OAuth2** - Authorization code, client credentials, refresh token grants
- ✅ **OpenID Connect** - Full OIDC compliance with id_token
- ✅ **PKCE** - Proof Key for Code Exchange for public clients

### User Management
- ✅ **User Profiles** - Update name, email, password
- ✅ **Email Verification** - Required before account activation
- ✅ **Session Management** - View and logout active sessions
- ✅ **Device Tracking** - IP address and user agent tracking
- ✅ **Admin Panel** - Full CRUD operations for users and OAuth2 clients

### UI/UX Customization
- ✅ **White-Label Branding** - 30+ theme options (colors, fonts, logo, etc.)
- ✅ **Custom Pages** - Replace any page with your own HTML/CSS
- ✅ **Responsive Design** - Mobile-first, works on all devices
- ✅ **Custom CSS** - Inject your own styles
- ✅ **Social Links** - GitHub, Twitter, LinkedIn integration

### Security & Controls
- ✅ **Password Policy** - Configurable strength requirements
- ✅ **Registration Toggle** - Enable/disable public signup
- ✅ **Domain Restrictions** - Whitelist/blacklist email domains
- ✅ **bcrypt Hashing** - Secure password storage
- ✅ **CSRF Protection** - Form-based CSRF tokens
- ✅ **Rate Limiting** - Configurable request limits (planned)

### Email & Notifications
- ✅ **SMTP Integration** - Send verification and reset emails
- ✅ **Email Templates** - Customizable HTML email templates
- ✅ **Brand Customization** - Logo, colors, footer in emails

## Quick Start

### Installation

```bash
npm install s3db.js
```

### Basic Setup

```javascript
import { Database } from 's3db.js';
import { IdentityPlugin } from 's3db.js/plugins/identity';

// 1. Create database
const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/my-app'
});

await db.initialize();

// 2. Configure Identity Plugin
const identityPlugin = new IdentityPlugin({
  issuer: 'http://localhost:4000',
  database: db,

  server: {
    port: 4000,
    host: '0.0.0.0'
  }
});

// 3. Initialize
await identityPlugin.initialize();

console.log('Identity Provider running on http://localhost:4000');
```

### Access Points

After starting the server:

- **Login**: `http://localhost:4000/login`
- **Register**: `http://localhost:4000/register`
- **Profile**: `http://localhost:4000/profile` (requires login)
- **Admin**: `http://localhost:4000/admin` (requires admin role)
- **OIDC Discovery**: `http://localhost:4000/.well-known/openid-configuration`

### Create Admin User

```javascript
const usersResource = db.resources.users;

await usersResource.insert({
  email: 'admin@example.com',
  name: 'Admin User',
  passwordHash: await hashPassword('SecurePass123!'),
  status: 'active',
  emailVerified: true,
  role: 'admin'  // or isAdmin: true
});
```

## Configuration Reference

### Complete Configuration Object

```javascript
new IdentityPlugin({
  // OAuth2/OIDC Configuration
  issuer: 'http://localhost:4000',
  supportedScopes: ['openid', 'profile', 'email', 'offline_access'],
  supportedGrantTypes: ['authorization_code', 'client_credentials', 'refresh_token'],
  supportedResponseTypes: ['code', 'token', 'id_token'],

  // Token Expiration
  accessTokenExpiry: '15m',
  idTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  authCodeExpiry: '10m',

  // User Resource
  userResource: 'users',  // S3DB resource name for users

  // Database
  database: db,  // S3DB instance (required)

  // Registration Configuration
  registration: {
    enabled: true,
    requireEmailVerification: true,
    allowedDomains: null,  // null = all domains, or ['company.com']
    blockedDomains: [],    // ['tempmail.com', 'guerrillamail.com']
    customMessage: null    // Custom message when disabled
  },

  // Password Policy
  passwordPolicy: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSymbols: false,
    bcryptRounds: 10
  },

  // Session Configuration
  session: {
    sessionExpiry: '24h',
    cookieName: 's3db_session',
    cookiePath: '/',
    cookieHttpOnly: true,
    cookieSecure: false,  // Set true in production with HTTPS
    cookieSameSite: 'Lax',
    cleanupInterval: 3600000,  // 1 hour
    enableCleanup: true
  },

  // UI Configuration (White-Label)
  ui: {
    // Branding
    title: 'My App Identity',
    companyName: 'My Company',
    tagline: 'Secure Identity & Access Management',
    logoUrl: 'https://example.com/logo.svg',
    favicon: 'https://example.com/favicon.ico',

    // Colors
    primaryColor: '#007bff',
    secondaryColor: '#6c757d',
    successColor: '#28a745',
    dangerColor: '#dc3545',
    warningColor: '#ffc107',
    infoColor: '#17a2b8',
    textColor: '#212529',
    textMuted: '#6c757d',
    backgroundColor: '#ffffff',
    backgroundLight: '#f8f9fa',
    borderColor: '#dee2e6',

    // Typography
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '16px',

    // Layout
    borderRadius: '0.375rem',
    boxShadow: '0 0.125rem 0.25rem rgba(0, 0, 0, 0.075)',

    // Company Info
    footerText: 'Trusted by thousands of organizations',
    supportEmail: 'support@example.com',
    privacyUrl: '/privacy',
    termsUrl: '/terms',

    // Social Links
    socialLinks: {
      github: 'https://github.com/mycompany',
      twitter: 'https://twitter.com/mycompany',
      linkedin: 'https://linkedin.com/company/mycompany'
    },

    // Custom CSS
    customCSS: `
      .btn-primary:hover {
        transform: translateY(-1px);
      }
    `,

    // Custom Pages (override default pages)
    customPages: {
      login: MyCustomLoginPage,
      register: MyCustomRegisterPage,
      profile: MyCustomProfilePage,
      // ... any page can be overridden
    }
  },

  // Email Configuration (SMTP)
  email: {
    enabled: true,
    from: 'noreply@example.com',
    replyTo: 'support@example.com',
    smtp: {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: 'your-email@gmail.com',
        pass: 'your-app-password'
      },
      tls: {
        rejectUnauthorized: true
      }
    },
    templates: {
      baseUrl: 'http://localhost:4000',
      brandName: 'My App',
      brandLogo: 'https://example.com/logo.png',
      brandColor: '#007bff',
      supportEmail: 'support@example.com',
      customFooter: 'My Company - Secure Identity'
    }
  },

  // Server Configuration
  server: {
    port: 4000,
    host: '0.0.0.0',
    verbose: true,

    // CORS
    cors: {
      enabled: true,
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
      credentials: true,
      maxAge: 86400
    },

    // Security Headers
    security: {
      enabled: true,
      contentSecurityPolicy: true,
      hsts: false  // Set true in production
    },

    // Logging
    logging: {
      enabled: true,
      format: ':method :path :status :response-time ms'
    }
  }
})
```

## UI Customization

### White-Label Branding

The Identity Plugin supports comprehensive white-label branding with 30+ customization options.

#### Basic Branding

```javascript
ui: {
  companyName: 'Acme Corp',
  tagline: 'Secure Cloud Solutions',
  logoUrl: 'https://acme.com/logo.svg',
  primaryColor: '#ff6600',
  supportEmail: 'support@acme.com'
}
```

#### Complete Theme Example

See `docs/examples/e85-identity-whitelabel.js` for S3dbCorp complete branding example.

**Result:**
- Custom colors throughout the UI
- Company logo in header
- Custom tagline
- Branded footer with social links
- Custom CSS animations

### Custom Pages

Replace any default page with your own HTML/CSS while keeping backend functionality.

#### Creating a Custom Page

```javascript
import { html } from 'hono/html';

function MyCustomLoginPage(props) {
  const { error, success, email, config } = props;

  return html`<!DOCTYPE html>
  <html>
    <head>
      <title>Login - ${config.companyName}</title>
      <style>
        /* Your custom CSS */
        body {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
      </style>
    </head>
    <body>
      ${error ? html`<div class="error">${error}</div>` : ''}

      <form method="POST" action="/login">
        <input type="email" name="email" value="${email}" />
        <input type="password" name="password" />
        <button type="submit">Sign In</button>
      </form>
    </body>
  </html>`;
}
```

#### Using Custom Pages

```javascript
ui: {
  customPages: {
    login: MyCustomLoginPage,
    register: MyCustomRegisterPage,
    profile: MyCustomProfilePage,
    forgotPassword: MyCustomForgotPasswordPage,
    resetPassword: MyCustomResetPasswordPage,
    consent: MyCustomConsentPage,
    verifyEmail: MyCustomVerifyEmailPage
  }
}
```

**Example:** See `docs/examples/e86-custom-login-page.js` for complete split-screen custom login.

### Available Page Props

Each page receives specific props from the backend:

**LoginPage:**
```javascript
{
  error: string | null,
  success: string | null,
  email: string,
  config: UIConfig
}
```

**RegisterPage:**
```javascript
{
  error: string | null,
  email: string,
  name: string,
  passwordPolicy: PasswordPolicy,
  config: UIConfig
}
```

**ProfilePage:**
```javascript
{
  user: User,
  sessions: Session[],
  error: string | null,
  success: string | null,
  passwordPolicy: PasswordPolicy,
  config: UIConfig
}
```

## Registration Controls

Control who can register and from which email domains.

### Disable Public Registration

```javascript
registration: {
  enabled: false,
  customMessage: 'Registration is disabled. Contact admin for access.'
}
```

**Result:**
- `/register` redirects to login with error message
- "Register" link hidden in UI
- Only admins can create users via admin panel

### Domain Whitelist

Allow only specific email domains:

```javascript
registration: {
  enabled: true,
  allowedDomains: ['company.com', 'partner.com']
}
```

**Result:**
- Only `@company.com` and `@partner.com` emails can register
- Other domains get error: "Registration is restricted to specific email domains"

### Domain Blacklist

Block disposable/temporary email services:

```javascript
registration: {
  enabled: true,
  blockedDomains: [
    'tempmail.com',
    'guerrillamail.com',
    '10minutemail.com',
    'mailinator.com'
  ]
}
```

**Result:**
- Blocked domains cannot register
- Error: "Registration with this email domain is not allowed"

### Combined Example

```javascript
registration: {
  enabled: true,
  requireEmailVerification: true,
  allowedDomains: ['company.com'],  // Corporate emails only
  blockedDomains: ['tempmail.com'], // Extra safety
  customMessage: 'Please use your corporate email address'
}
```

**Example:** See `docs/examples/e87-identity-no-registration.js`

## Admin Panel

Comprehensive admin interface for managing users and OAuth2 clients.

### Accessing Admin Panel

1. Login as user with admin role (`role: 'admin'` or `isAdmin: true`)
2. Navigate to `http://localhost:4000/admin`

### Admin Features

#### User Management (`/admin/users`)
- ✅ List all users with search and pagination
- ✅ Create new users
- ✅ Edit user details (name, email)
- ✅ Change user status (active, suspended, pending_verification)
- ✅ Toggle admin role
- ✅ Mark email as verified
- ✅ Send password reset email
- ✅ Delete users

#### OAuth2 Client Management (`/admin/clients`)
- ✅ List all OAuth2 clients
- ✅ Create new clients (generate client_id and client_secret)
- ✅ Edit client details (name, redirect URIs, scopes)
- ✅ Rotate client secret
- ✅ Toggle active/inactive status
- ✅ Delete clients

### Dashboard (`/admin`)

Overview statistics:
- Total users count
- Active users count
- OAuth2 clients count
- Total sessions count
- Recent activity

Quick actions:
- Create new user
- Create new OAuth2 client
- View all users
- View all clients

## OAuth2/OIDC Endpoints

### Discovery Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /.well-known/openid-configuration` | OIDC Discovery (metadata) |
| `GET /.well-known/jwks.json` | JSON Web Key Set (RSA public keys) |

### Authentication Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /oauth/authorize` | OAuth2 authorization (consent screen) |
| `POST /oauth/authorize` | Process authorization decision |
| `POST /oauth/token` | Token endpoint (exchange code for tokens) |
| `GET /oauth/userinfo` | OIDC UserInfo endpoint |
| `POST /oauth/introspect` | Token introspection |
| `POST /oauth/revoke` | Token revocation |
| `POST /oauth/register` | Dynamic client registration |

### Supported Grant Types

- ✅ `authorization_code` - Standard OAuth2 flow with consent
- ✅ `client_credentials` - Machine-to-machine authentication
- ✅ `refresh_token` - Obtain new access tokens

### Supported Scopes

- ✅ `openid` - Enable OIDC (required for id_token)
- ✅ `profile` - Access to name and other profile info
- ✅ `email` - Access to email address
- ✅ `offline_access` - Request refresh token

### PKCE Support

Proof Key for Code Exchange (RFC 7636) is supported for public clients:

- Methods: `S256` (SHA-256), `plain`
- Automatically validated during token exchange
- Recommended for mobile and SPA applications

## Examples

All examples are in `docs/examples/`:

### Basic Examples

| File | Description |
|------|-------------|
| `e85-identity-whitelabel.js` | Complete S3dbCorp white-label branding |
| `e86-custom-login-page.js` | Custom split-screen login page |
| `e87-identity-no-registration.js` | Disabled registration (admin-only) |

### Running Examples

```bash
# Basic identity server
node docs/examples/e85-identity-whitelabel.js

# Custom login page
node docs/examples/e86-custom-login-page.js

# No public registration
node docs/examples/e87-identity-no-registration.js
```

### Example: OAuth2 Client Integration

Create an OAuth2 client and integrate:

```javascript
// 1. Create client via admin panel or programmatically
const clientsResource = db.resources.plg_oauth_clients;
const client = await clientsResource.insert({
  clientId: 'my-app-client',
  clientSecret: 'secret-here',  // Will be hashed
  name: 'My Application',
  redirectUris: ['http://localhost:3000/callback'],
  allowedScopes: ['openid', 'profile', 'email'],
  grantTypes: ['authorization_code', 'refresh_token']
});

// 2. Authorization request
const authUrl = new URL('http://localhost:4000/oauth/authorize');
authUrl.searchParams.set('client_id', 'my-app-client');
authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', 'openid profile email');
authUrl.searchParams.set('state', 'random-state');

// User visits authUrl, consents, redirected to callback with code

// 3. Exchange code for tokens
const tokenResponse = await fetch('http://localhost:4000/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: 'received-code',
    redirect_uri: 'http://localhost:3000/callback',
    client_id: 'my-app-client',
    client_secret: 'secret-here'
  })
});

const tokens = await tokenResponse.json();
// { access_token, id_token, refresh_token, expires_in, token_type }

// 4. Get user info
const userInfo = await fetch('http://localhost:4000/oauth/userinfo', {
  headers: { 'Authorization': `Bearer ${tokens.access_token}` }
});
```

## Security Best Practices

### Production Deployment

#### 1. Use HTTPS

```javascript
session: {
  cookieSecure: true  // Requires HTTPS
},
server: {
  security: {
    hsts: true  // HTTP Strict Transport Security
  }
}
```

#### 2. Strong Password Policy

```javascript
passwordPolicy: {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true,
  bcryptRounds: 12  // Higher for production
}
```

#### 3. Email Verification

```javascript
registration: {
  requireEmailVerification: true
}
```

#### 4. Domain Restrictions

```javascript
registration: {
  allowedDomains: ['yourcompany.com'],  // Corporate only
  blockedDomains: [/* temp email services */]
}
```

#### 5. CORS Configuration

```javascript
server: {
  cors: {
    origin: ['https://app.yourcompany.com'],  // Specific origins
    credentials: true
  }
}
```

#### 6. Session Security

```javascript
session: {
  sessionExpiry: '8h',  // Shorter for production
  cookieHttpOnly: true,
  cookieSecure: true,
  cookieSameSite: 'Strict'
}
```

### Client Secret Management

- Store client secrets hashed (automatic)
- Rotate secrets regularly via admin panel
- Never commit secrets to version control
- Use environment variables for sensitive config

### Rate Limiting

Implement rate limiting at reverse proxy level (nginx, Cloudflare):

- `/login`: 5 requests per minute per IP
- `/register`: 3 requests per hour per IP
- `/forgot-password`: 3 requests per hour per IP

## Troubleshooting

### Common Issues

#### 1. "Registration is disabled" error

**Cause:** `registration.enabled: false`

**Solution:** Enable registration or create users via admin panel

```javascript
registration: {
  enabled: true
}
```

#### 2. Email verification not working

**Cause:** Email service not configured or SMTP credentials wrong

**Solution:** Check email configuration and test SMTP connection

```javascript
email: {
  enabled: true,
  smtp: {
    host: 'smtp.gmail.com',
    port: 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS  // Use app password for Gmail
    }
  }
}
```

#### 3. Session not persisting

**Cause:** Cookie settings incompatible with deployment

**Solution:** Check HTTPS settings match deployment

```javascript
session: {
  cookieSecure: false,  // Development
  // cookieSecure: true,  // Production with HTTPS
  cookieSameSite: 'Lax'
}
```

#### 4. Admin panel not accessible

**Cause:** User doesn't have admin role

**Solution:** Update user with admin role

```javascript
await usersResource.update(userId, {
  role: 'admin'  // or isAdmin: true
});
```

#### 5. Custom page not loading

**Cause:** Custom page function not returning proper HTML

**Solution:** Ensure using `html` helper from Hono

```javascript
import { html } from 'hono/html';

function MyPage(props) {
  return html`<!DOCTYPE html>...`;
}
```

### Debug Mode

Enable verbose logging:

```javascript
server: {
  verbose: true,
  logging: {
    enabled: true,
    format: 'combined'
  }
}
```

### Database Issues

Check S3DB resources were created:

```javascript
console.log(Object.keys(db.resources));
// Should include: plg_oauth_keys, plg_oauth_clients, plg_auth_codes,
//                 plg_sessions, plg_password_reset_tokens, users
```

## Architecture Details

### S3DB Resources

The Identity Plugin creates these resources automatically:

| Resource | Purpose |
|----------|---------|
| `plg_oauth_keys` | RSA key pairs for token signing |
| `plg_oauth_clients` | Registered OAuth2 clients |
| `plg_auth_codes` | Authorization codes (short-lived) |
| `plg_sessions` | User sessions with device tracking |
| `plg_password_reset_tokens` | Password reset tokens |
| `users` | User accounts (or custom via userResource) |

### Token Lifecycle

```
1. User logs in → Session created (cookie)
2. OAuth2 authorize → Authorization code created
3. Token exchange → Access token + ID token + Refresh token
4. API requests → Bearer token validated
5. Token refresh → New access token issued
6. Logout → Session deleted
```

### Email Flow

```
1. Registration → Verification email sent
2. User clicks link → Token validated → Account activated
3. Password reset → Reset token sent
4. User submits new password → Token validated → Password updated
```

## Contributing

The Identity Plugin is part of S3DB. To contribute:

1. Fork the repository
2. Create feature branch
3. Add tests for new features
4. Submit pull request

## License

MIT License - See LICENSE file

## Support

- Documentation: https://github.com/forattini-dev/s3db.js
- Issues: https://github.com/forattini-dev/s3db.js/issues
- Examples: `docs/examples/e85-*.js`

---

**Built with S3DB** - Transform S3 into a database, now with complete identity management! 🚀
