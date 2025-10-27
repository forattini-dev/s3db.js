# Identity Provider Plugin

Complete OAuth2/OpenID Connect Identity Provider built on S3DB.

## TL;DR

Transform S3DB into a production-ready identity provider in 5 minutes:

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

**That's it!** You now have:
- ✅ Login/registration at `http://localhost:4000`
- ✅ OAuth2/OIDC server with PKCE
- ✅ Admin panel at `/admin`
- ✅ White-label UI customization
- ✅ Email verification & password reset

## Quick Start

### 1. Installation

```bash
npm install s3db.js
```

### 2. Basic Setup

```javascript
import { Database } from 's3db.js';
import { IdentityPlugin } from 's3db.js/plugins/identity';

const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/myapp'
});

await db.initialize();

const identityPlugin = new IdentityPlugin({
  issuer: 'http://localhost:4000',
  database: db,
  server: { port: 4000 }
});

await identityPlugin.initialize();

console.log('Identity Provider: http://localhost:4000/login');
```

### 3. Create Admin User

```javascript
import bcrypt from 'bcrypt';

const usersResource = db.resources.users;
const passwordHash = await bcrypt.hash('SecurePass123!', 10);

await usersResource.insert({
  email: 'admin@example.com',
  name: 'Admin User',
  passwordHash: passwordHash,
  status: 'active',
  emailVerified: true,
  role: 'admin'
});
```

### 4. Access Points

- **Login**: http://localhost:4000/login
- **Register**: http://localhost:4000/register
- **Profile**: http://localhost:4000/profile
- **Admin**: http://localhost:4000/admin
- **OIDC Discovery**: http://localhost:4000/.well-known/openid-configuration

## Documentation

### Core Guides

| Guide | Description |
|-------|-------------|
| **[Configuration](./identity/configuration.md)** | Complete configuration reference with all options |
| **[UI Customization](./identity/ui-customization.md)** | White-label branding and custom page overrides |
| **[Admin Panel](./identity/admin-panel.md)** | User and OAuth2 client management |
| **[OAuth2/OIDC](./identity/oauth2-oidc.md)** | OAuth2 endpoints and integration examples |
| **[Security](./identity/security.md)** | Production security best practices |
| **[Troubleshooting](./identity/troubleshooting.md)** | Common issues and solutions |
| **[Architecture](./identity/architecture.md)** | Technical implementation details |

### Reference Docs

- **[Configuration Reference](./identity-config-reference.md)** - Quick lookup tables for all options
- **[Examples Index](./identity-examples.md)** - All examples with descriptions and use cases
- **[Plugin README](../src/plugins/identity/README.md)** - Plugin-specific quick start

## Main Features

### 🔐 Authentication & Authorization

- **Login/Logout** - Session-based authentication with device tracking
- **Registration** - Self-service with email verification
- **Password Reset** - Secure token-based recovery
- **OAuth2** - Authorization code, client credentials, refresh tokens
- **OpenID Connect** - Full OIDC compliance
- **PKCE** - Enhanced security for public clients

### 👤 User Management

- **User Profiles** - Update name, email, password
- **Email Verification** - Required before activation
- **Session Management** - View and logout active sessions
- **Admin Panel** - Full CRUD for users and OAuth2 clients

### 🎨 UI/UX Customization

- **White-Label** - 30+ theme options (colors, fonts, logo)
- **Custom Pages** - Replace any page with your HTML/CSS
- **Responsive** - Mobile-first design
- **Social Links** - GitHub, Twitter, LinkedIn integration

### 🔒 Security & Controls

- **Password Policy** - Configurable strength requirements
- **Registration Toggle** - Enable/disable public signup
- **Domain Restrictions** - Whitelist/blacklist email domains
- **bcrypt** - Secure password hashing
- **CSRF Protection** - Form-based tokens

### 📧 Email & Notifications

- **SMTP Integration** - Gmail, SendGrid, AWS SES support
- **Email Templates** - Customizable HTML templates
- **Brand Customization** - Logo and colors in emails

## Examples

Run examples to see features in action:

```bash
# Complete white-label branding
node docs/examples/e85-identity-whitelabel.js

# Custom login page
node docs/examples/e86-custom-login-page.js

# Disabled registration (enterprise)
node docs/examples/e87-identity-no-registration.js
```

**See [Examples Index](./identity-examples.md)** for detailed descriptions and more examples.

## FAQ

### How do I customize the look and feel?

Use the `ui` configuration object for white-label branding:

```javascript
ui: {
  companyName: 'My Company',
  primaryColor: '#ff6600',
  logoUrl: 'https://example.com/logo.svg'
}
```

**See [UI Customization](./identity/ui-customization.md)** for 30+ options.

### How do I disable public registration?

Set `registration.enabled` to `false`:

```javascript
registration: {
  enabled: false,
  customMessage: 'Contact admin for access'
}
```

Users can only be created via admin panel. **See [Configuration](./identity/configuration.md)** for more registration controls.

### How do I restrict registration to corporate emails?

Use `allowedDomains` whitelist:

```javascript
registration: {
  enabled: true,
  allowedDomains: ['company.com', 'partner.com']
}
```

**See [Configuration](./identity/configuration.md)** for domain restrictions.

### How do I integrate with my application (OAuth2)?

Create an OAuth2 client via admin panel, then use authorization code flow:

```javascript
// 1. Redirect user to authorization endpoint
const authUrl = `http://localhost:4000/oauth/authorize?
  client_id=my-app&
  redirect_uri=http://localhost:3000/callback&
  response_type=code&
  scope=openid profile email&
  state=random-state`;

// 2. Exchange code for tokens
const tokens = await fetch('http://localhost:4000/oauth/token', {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: receivedCode,
    redirect_uri: 'http://localhost:3000/callback',
    client_id: 'my-app',
    client_secret: 'secret'
  })
});
```

**See [OAuth2/OIDC](./identity/oauth2-oidc.md)** for complete integration guide.

### How do I configure email (SMTP)?

Configure SMTP settings:

```javascript
email: {
  enabled: true,
  from: 'noreply@company.com',
  smtp: {
    host: 'smtp.gmail.com',
    port: 587,
    auth: {
      user: 'your-email@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD  // Use app password
    }
  }
}
```

**See [Configuration](./identity/configuration.md)** for Gmail, SendGrid, AWS SES examples.

### How do I create an admin user?

Insert user with `role: 'admin'`:

```javascript
import bcrypt from 'bcrypt';

const passwordHash = await bcrypt.hash('SecurePass123!', 10);

await usersResource.insert({
  email: 'admin@example.com',
  name: 'Admin User',
  passwordHash: passwordHash,
  status: 'active',
  emailVerified: true,
  role: 'admin'
});
```

**See [Admin Panel](./identity/admin-panel.md)** for more details.

### How do I replace the default login page?

Use `customPages` to override:

```javascript
import { html } from 'hono/html';

function MyCustomLoginPage(props) {
  return html`<!DOCTYPE html>
    <html>
      <head><title>Login - ${props.config.companyName}</title></head>
      <body>
        <form method="POST" action="/login">
          <input type="email" name="email" />
          <input type="password" name="password" />
          <button type="submit">Sign In</button>
        </form>
      </body>
    </html>`;
}

ui: {
  customPages: {
    login: MyCustomLoginPage
  }
}
```

**See [UI Customization](./identity/ui-customization.md)** for complete custom pages guide.

### Sessions not persisting?

Check cookie settings match your deployment:

```javascript
session: {
  cookieSecure: false,  // Development (HTTP)
  // cookieSecure: true,  // Production (HTTPS)
  cookieSameSite: 'Lax'
}
```

**See [Troubleshooting](./identity/troubleshooting.md)** for more solutions.

### How do I secure for production?

Follow the production checklist:

```javascript
{
  issuer: 'https://auth.company.com',  // HTTPS

  registration: {
    requireEmailVerification: true,
    allowedDomains: ['company.com']
  },

  passwordPolicy: {
    minLength: 12,
    requireSymbols: true,
    bcryptRounds: 12
  },

  session: {
    sessionExpiry: '8h',
    cookieSecure: true,
    cookieSameSite: 'Strict'
  },

  server: {
    cors: { origin: ['https://app.company.com'] },
    security: { hsts: true }
  }
}
```

**See [Security](./identity/security.md)** for complete production guide.

### Where can I find more examples?

Check the `docs/examples/` directory:

- `e85-identity-whitelabel.js` - Complete S3dbCorp branding
- `e86-custom-login-page.js` - Custom split-screen login
- `e87-identity-no-registration.js` - Disabled registration

**See [Examples Index](./identity-examples.md)** for all examples.

## Architecture Overview

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

**See [Architecture](./identity/architecture.md)** for detailed technical documentation.

## Support

- **Documentation**: Complete guides in `docs/plugins/identity/`
- **Examples**: `docs/examples/e8*-identity-*.js`
- **Issues**: https://github.com/forattini-dev/s3db.js/issues
- **Repository**: https://github.com/forattini-dev/s3db.js

## License

MIT License - See LICENSE file

---

**Built with S3DB** - Transform S3 into a database with complete identity management! 🚀
