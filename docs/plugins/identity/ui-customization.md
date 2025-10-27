# Identity Plugin - UI Customization

[← Back to Identity Plugin](../identity-plugin.md) | [Configuration](./configuration.md) | [Examples →](../identity-examples.md)

Complete guide to white-label branding and custom page overrides.

## Table of Contents

- [White-Label Branding](#white-label-branding)
- [Custom Pages](#custom-pages)
- [Theme Options](#theme-options)
- [Examples](#examples)

## White-Label Branding

The Identity Plugin supports 30+ theme customization options for complete white-label branding.

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

**Result:**
- Company name in header and footer
- Logo displayed in header
- Primary color for buttons and links
- Support email in footer

### Complete Branding Example

```javascript
ui: {
  // Branding
  title: 'Acme Identity',
  companyName: 'Acme Corp',
  tagline: 'Secure Cloud Solutions for Enterprise',
  logoUrl: 'https://acme.com/logo.svg',
  favicon: 'https://acme.com/favicon.ico',

  // Colors
  primaryColor: '#ff6600',
  secondaryColor: '#6c757d',
  successColor: '#00cc66',
  dangerColor: '#ff3333',
  warningColor: '#ffcc00',
  infoColor: '#3399ff',
  textColor: '#212529',
  textMuted: '#6c757d',
  backgroundColor: '#ffffff',
  backgroundLight: '#f8f9fa',
  borderColor: '#dee2e6',

  // Typography
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: '16px',

  // Layout
  borderRadius: '0.5rem',
  boxShadow: '0 0.25rem 0.5rem rgba(0, 0, 0, 0.1)',

  // Company Info
  footerText: 'Trusted by 10,000+ companies worldwide',
  supportEmail: 'support@acme.com',
  privacyUrl: 'https://acme.com/privacy',
  termsUrl: 'https://acme.com/terms',

  // Social Links
  socialLinks: {
    github: 'https://github.com/acme',
    twitter: 'https://twitter.com/acme',
    linkedin: 'https://linkedin.com/company/acme'
  },

  // Custom CSS
  customCSS: `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 12px rgba(255, 102, 0, 0.3);
      transition: all 0.3s ease;
    }

    .auth-card {
      background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
    }
  `
}
```

## Theme Options

### Branding Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | string | `'S3DB Identity'` | Page title suffix |
| `companyName` | string | `'S3DB'` | Company name (header/footer) |
| `tagline` | string | `'Secure Identity...'` | Company tagline |
| `logoUrl` | string \| null | `null` | Logo image URL |
| `favicon` | string \| null | `null` | Favicon URL |

### Color Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `primaryColor` | string | `'#007bff'` | Primary brand color |
| `secondaryColor` | string | `'#6c757d'` | Secondary color |
| `successColor` | string | `'#28a745'` | Success messages |
| `dangerColor` | string | `'#dc3545'` | Error messages |
| `warningColor` | string | `'#ffc107'` | Warning messages |
| `infoColor` | string | `'#17a2b8'` | Info messages |
| `textColor` | string | `'#212529'` | Primary text |
| `textMuted` | string | `'#6c757d'` | Muted text |
| `backgroundColor` | string | `'#ffffff'` | Background |
| `backgroundLight` | string | `'#f8f9fa'` | Light background |
| `borderColor` | string | `'#dee2e6'` | Borders |

### Typography Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `fontFamily` | string | System fonts | Font family CSS |
| `fontSize` | string | `'16px'` | Base font size |

### Layout Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `borderRadius` | string | `'0.375rem'` | Border radius |
| `boxShadow` | string | `'0 0.125rem...'` | Box shadow |

### Company Info Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `footerText` | string \| null | `null` | Additional footer text |
| `supportEmail` | string \| null | `null` | Support email |
| `privacyUrl` | string | `'/privacy'` | Privacy policy URL |
| `termsUrl` | string | `'/terms'` | Terms of service URL |

### Social Links

```javascript
socialLinks: {
  github: 'https://github.com/yourcompany',
  twitter: 'https://twitter.com/yourcompany',
  linkedin: 'https://linkedin.com/company/yourcompany'
}
```

**Result:** Footer displays social media icons with links.

### Custom CSS

Inject custom styles:

```javascript
customCSS: `
  /* Import custom fonts */
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');

  /* Global styles */
  body {
    font-family: 'Poppins', sans-serif;
  }

  /* Button animations */
  .btn-primary {
    transition: all 0.3s ease;
  }

  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(0, 123, 255, 0.3);
  }

  /* Card styles */
  .auth-card {
    border-radius: 1rem;
    overflow: hidden;
  }

  /* Gradient backgrounds */
  .auth-container {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }
`
```

## Custom Pages

Replace any default page with your own HTML/CSS while maintaining backend functionality.

### Available Pages

All pages can be overridden via `ui.customPages`:

- `login` - Login page
- `register` - Registration page
- `profile` - User profile page
- `forgotPassword` - Forgot password page
- `resetPassword` - Reset password page
- `consent` - OAuth2 consent page
- `verifyEmail` - Email verification page

### Creating a Custom Page

```javascript
import { html } from 'hono/html';

function MyCustomLoginPage(props) {
  const { error, success, email, config } = props;

  return html`<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Login - ${config.companyName}</title>
      <style>
        /* Your custom CSS */
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Inter', sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .login-container {
          background: white;
          border-radius: 1rem;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          overflow: hidden;
          display: flex;
          max-width: 900px;
          width: 100%;
        }

        .login-branding {
          flex: 1;
          background: linear-gradient(135deg, ${config.primaryColor} 0%, #764ba2 100%);
          color: white;
          padding: 3rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .login-form {
          flex: 1;
          padding: 3rem;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 600;
        }

        input {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #dee2e6;
          border-radius: 0.5rem;
          font-size: 1rem;
        }

        button {
          width: 100%;
          padding: 0.75rem;
          background: ${config.primaryColor};
          color: white;
          border: none;
          border-radius: 0.5rem;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
        }

        button:hover {
          opacity: 0.9;
        }

        .error {
          background: #dc3545;
          color: white;
          padding: 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1.5rem;
        }
      </style>
    </head>
    <body>
      <div class="login-container">
        <!-- Left: Branding -->
        <div class="login-branding">
          <h1>${config.companyName}</h1>
          <p>${config.tagline}</p>
        </div>

        <!-- Right: Form -->
        <div class="login-form">
          <h2>Welcome Back</h2>

          ${error ? html`<div class="error">${error}</div>` : ''}

          <form method="POST" action="/login">
            <div class="form-group">
              <label for="email">Email Address</label>
              <input
                type="email"
                id="email"
                name="email"
                value="${email}"
                required
                autofocus
              />
            </div>

            <div class="form-group">
              <label for="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                required
              />
            </div>

            <div class="form-group">
              <label>
                <input type="checkbox" name="remember" />
                Remember me
              </label>
            </div>

            <button type="submit">Sign In</button>
          </form>

          <p style="margin-top: 1.5rem; text-align: center;">
            <a href="/forgot-password">Forgot password?</a>
          </p>

          ${config.registrationEnabled !== false ? html`
            <p style="margin-top: 1rem; text-align: center;">
              Don't have an account? <a href="/register">Sign up</a>
            </p>
          ` : ''}
        </div>
      </div>
    </body>
  </html>`;
}
```

### Using Custom Pages

```javascript
import { IdentityPlugin } from 's3db.js/plugins/identity';
import { MyCustomLoginPage } from './custom-pages.js';

const identityPlugin = new IdentityPlugin({
  issuer: 'http://localhost:4000',
  database: db,

  ui: {
    companyName: 'Acme Corp',
    primaryColor: '#ff6600',

    customPages: {
      login: MyCustomLoginPage
    }
  }
});
```

### Page Props Reference

Each page receives specific props from the backend:

#### LoginPage Props

```typescript
{
  error: string | null,       // Error message
  success: string | null,     // Success message
  email: string,              // Pre-filled email
  config: UIConfig            // UI configuration
}
```

#### RegisterPage Props

```typescript
{
  error: string | null,
  email: string,
  name: string,
  passwordPolicy: {
    minLength: number,
    maxLength: number,
    requireUppercase: boolean,
    requireLowercase: boolean,
    requireNumbers: boolean,
    requireSymbols: boolean
  },
  config: UIConfig
}
```

#### ProfilePage Props

```typescript
{
  user: {
    id: string,
    email: string,
    name: string,
    role: string,
    emailVerified: boolean,
    status: string,
    createdAt: string
  },
  sessions: Array<{
    id: string,
    ipAddress: string,
    userAgent: string,
    createdAt: string
  }>,
  error: string | null,
  success: string | null,
  passwordPolicy: PasswordPolicy,
  config: UIConfig
}
```

#### ConsentPage Props

```typescript
{
  client: {
    name: string,
    description: string
  },
  user: User,
  scopes: string[],
  config: UIConfig
}
```

### Important Notes

1. **Return HTML**: Always return complete `<!DOCTYPE html>` document
2. **Use `html` helper**: Import from `hono/html` for proper escaping
3. **Form action**: Forms automatically POST to same URL (e.g., `/login`)
4. **Access config**: All theme options available via `props.config`
5. **Maintain structure**: Keep form field names for backend compatibility

## Examples

### Example 1: S3dbCorp Complete Branding

See `docs/examples/e85-identity-whitelabel.js`:

```bash
node docs/examples/e85-identity-whitelabel.js
```

**Features:**
- Custom S3dbCorp blue theme (#0066CC)
- Company logo and favicon
- Inter font family
- Social media footer
- Custom CSS animations
- Branded email templates

### Example 2: Custom Split-Screen Login

See `docs/examples/e86-custom-login-page.js`:

```bash
node docs/examples/e86-custom-login-page.js
```

**Features:**
- Split-screen layout (left: branding, right: form)
- Gradient backgrounds
- Custom animations
- Mobile responsive
- Professional design

## See Also

- [Configuration](./configuration.md) - Complete configuration reference
- [Examples Index](../identity-examples.md) - All examples with descriptions
- [Main Documentation](../identity-plugin.md) - Overview and quick start
