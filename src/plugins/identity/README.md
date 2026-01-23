# Identity Provider Plugin

Complete OAuth2/OpenID Connect Identity Provider for S3DB.

## Quick Start

```javascript
import { Database } from 's3db.js';
import { IdentityPlugin } from 's3db.js';

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

Access at: http://localhost:4000/login

## Features

✅ **Complete Authentication System**
- Login/Logout with session management
- User registration with email verification
- Password reset flow
- Profile management

✅ **OAuth2/OpenID Connect Server**
- Authorization code flow with PKCE
- Client credentials flow
- Refresh token support
- Full OIDC compliance

✅ **Admin Panel**
- User management (CRUD, status, roles)
- OAuth2 client management
- Session monitoring

✅ **100% White-Label UI**
- 30+ theme customization options (colors, fonts, logos)
- **Custom CSS injection** - Poder total para customização
- Tailwind 4 CDN - Classes utilitárias prontas
- Custom page overrides
- Responsive design
- Social media integration

✅ **Registration Controls**
- Enable/disable public registration
- Email domain whitelist/blacklist
- Email verification requirement

✅ **Security**
- bcrypt password hashing
- Configurable password policy
- Session management with device tracking
- CSRF protection

## Documentation

- **[Complete Documentation](../../../docs/plugins/identity-plugin.md)** - Full guide with all features
- **[Configuration Reference](../../../docs/plugins/identity-config-reference.md)** - All configuration options
- **[White-Label Guide](../../../docs/plugins/identity/WHITELABEL.md)** - 🎨 Complete branding customization guide
- **[Examples Index](../../../docs/plugins/identity-examples.md)** - Example code and use cases

## Examples

| Example | Description |
|---------|-------------|
| `e85-identity-whitelabel.js` | S3dbCorp complete white-label branding |
| `e86-custom-login-page.js` | Custom login page with HTML override |
| `e87-identity-no-registration.js` | Disabled public registration |

Run examples:
```bash
node docs/examples/e85-identity-whitelabel.js
```

## Basic Configuration

### Minimal Setup

```javascript
new IdentityPlugin({
  issuer: 'http://localhost:4000',
  database: db
})
```

### Production Setup

```javascript
new IdentityPlugin({
  issuer: 'https://auth.company.com',
  database: db,

  registration: {
    enabled: true,
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

  email: {
    enabled: true,
    smtp: {
      host: process.env.SMTP_HOST,
      port: 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    }
  },

  ui: {
    companyName: 'My Company',
    primaryColor: '#0066CC',
    logoUrl: 'https://company.com/logo.svg'
  }
})
```

## Access Points

After starting the server:

- **Login**: `/login`
- **Register**: `/register`
- **Profile**: `/profile` (requires login)
- **Admin**: `/admin` (requires admin role)
- **OIDC Discovery**: `/.well-known/openid-configuration`
- **JWKS**: `/.well-known/jwks.json`

## OAuth2 Endpoints

- `GET /oauth/authorize` - Authorization (consent screen)
- `POST /oauth/token` - Token exchange
- `GET /oauth/userinfo` - OIDC UserInfo
- `POST /oauth/introspect` - Token introspection
- `POST /oauth/revoke` - Token revocation
- `POST /oauth/register` - Client registration

## Admin Panel

Create admin user:

```javascript
const usersResource = db.resources.users;

await usersResource.insert({
  email: 'admin@example.com',
  name: 'Admin User',
  passwordHash: await hashPassword('SecurePass123!'),
  status: 'active',
  emailVerified: true,
  role: 'admin'
});
```

Access admin panel at `/admin` after login.

## White-Label Customization

### Basic Branding

```javascript
ui: {
  companyName: 'Acme Corp',
  tagline: 'Secure Cloud Solutions',
  logoUrl: 'https://acme.com/logo.svg',
  primaryColor: '#ff6600',
  supportEmail: 'support@acme.com'
}
```

### Custom Pages

```javascript
import { html } from 'hono/html';

function MyCustomLoginPage(props) {
  const { error, email, config } = props;

  return html`<!DOCTYPE html>
    <html>
      <head><title>Login - ${config.companyName}</title></head>
      <body>
        <form method="POST" action="/login">
          <input type="email" name="email" value="${email}" />
          <input type="password" name="password" />
          <button>Sign In</button>
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

## Registration Controls

### Disable Public Registration

```javascript
registration: {
  enabled: false,
  customMessage: 'Contact admin for access'
}
```

### Corporate Emails Only

```javascript
registration: {
  enabled: true,
  allowedDomains: ['company.com', 'partner.com']
}
```

### Block Temporary Emails

```javascript
registration: {
  enabled: true,
  blockedDomains: ['tempmail.com', 'guerrillamail.com']
}
```

## Architecture

```
Identity Plugin
├── OAuth2/OIDC Server (authorization, tokens, PKCE)
├── UI Pages (login, register, profile, admin)
├── Session Manager (cookie-based sessions)
├── Email Service (SMTP integration)
└── S3DB Resources
    ├── plg_oauth_keys (RSA keys)
    ├── plg_oauth_clients (registered clients)
    ├── plg_auth_codes (authorization codes)
    ├── plg_sessions (user sessions)
    ├── plg_password_reset_tokens (reset tokens)
    └── users (user accounts)
```

## Security Best Practices

1. **Use HTTPS in production**
   ```javascript
   session: { cookieSecure: true },
   server: { security: { hsts: true } }
   ```

2. **Strong password policy**
   ```javascript
   passwordPolicy: {
     minLength: 12,
     requireSymbols: true,
     bcryptRounds: 12
   }
   ```

3. **Email verification required**
   ```javascript
   registration: { requireEmailVerification: true }
   ```

4. **Restrict origins**
   ```javascript
   server: {
     cors: { origin: ['https://app.company.com'] }
   }
   ```

## Troubleshooting

### Session not persisting

Check cookie settings match deployment (HTTP vs HTTPS):
```javascript
session: {
  cookieSecure: false,  // Development (HTTP)
  // cookieSecure: true,  // Production (HTTPS)
}
```

### Email not sending

Test SMTP connection:
```bash
# Use MailHog for testing
docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog

SMTP_HOST=localhost SMTP_PORT=1025 node your-app.js
```

### Admin panel not accessible

User needs admin role:
```javascript
await usersResource.update(userId, { role: 'admin' });
```

## Resources

- [Full Documentation](../../../docs/plugins/identity-plugin.md)
- [Configuration Reference](../../../docs/plugins/identity-config-reference.md)
- [Examples](../../../docs/plugins/identity-examples.md)
- [S3DB Documentation](../../../README.md)

## License

MIT
