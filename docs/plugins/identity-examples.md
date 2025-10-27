# Identity Plugin - Examples Index

Complete list of Identity Plugin examples with descriptions and use cases.

## Quick Navigation

- [Basic Examples](#basic-examples)
- [White-Label & Branding](#white-label--branding)
- [Registration Controls](#registration-controls)
- [Running Examples](#running-examples)

## Basic Examples

### e85-identity-whitelabel.js

**Complete S3dbCorp White-Label Branding Example**

Demonstrates comprehensive white-label theme customization with:
- Custom brand colors (S3dbCorp Blue #0066CC)
- Company logo and favicon
- Custom typography (Inter font family)
- Social media integration (GitHub, Twitter, LinkedIn)
- Custom CSS with animations and hover effects
- Email template customization
- Complete production configuration

**Features Shown:**
- 30+ UI configuration options
- Custom color palette
- Gradient backgrounds
- Social media footer
- Branded email templates
- Password policy configuration
- Session management

**Use Cases:**
- SaaS platforms with white-label requirements
- Enterprise identity servers
- Multi-tenant applications
- Branded authentication experiences

**Run:**
```bash
node docs/examples/e85-identity-whitelabel.js
```

**Access:**
- Login: http://localhost:4000/login
- Dashboard: http://localhost:4000/admin

---

### e86-custom-login-page.js

**Custom Login Page with Complete HTML Override**

Shows how to create a completely custom login page with split-screen design:
- Custom HTML structure
- Custom CSS (gradient backgrounds, animations)
- Full control over layout
- Maintains backend functionality (form POST works automatically)

**Features Shown:**
- `ui.customPages.login` override
- Custom HTML/CSS design
- Props passed from backend (error, success, email, config)
- Split-screen layout (left: branding, right: form)
- Professional gradient design
- Mobile-responsive

**Technical Details:**
- Uses Hono's `html` helper
- Returns complete `<!DOCTYPE html>` document
- Form action `/login` still works
- Access to all theme config via `props.config`

**Use Cases:**
- Unique brand experiences
- Custom authentication flows
- Marketing-driven designs
- A/B testing different layouts

**Run:**
```bash
node docs/examples/e86-custom-login-page.js
```

**Access:**
- Custom Login: http://localhost:4000/login

---

### e87-identity-no-registration.js

**Disabled Public Registration (Admin-Only User Creation)**

Enterprise/B2B configuration with disabled self-registration:
- Public registration disabled
- Custom message when users try to register
- Admin-only user creation via admin panel
- Password policy still enforced
- Email verification for admin-created users

**Features Shown:**
- `registration.enabled: false`
- `registration.customMessage`
- Admin panel user creation
- Enterprise password policy (12+ chars, symbols required)
- Production security settings

**Configuration:**
```javascript
registration: {
  enabled: false,
  customMessage: 'Account registration is disabled. Please contact your administrator.'
}
```

**Use Cases:**
- Enterprise environments (IT provisions users)
- Invite-only applications
- Closed beta/private apps
- B2B SaaS (sales-managed accounts)
- Membership organizations

**How to Create Users:**
1. Login as admin
2. Go to http://localhost:4000/admin/users
3. Click "Create New User"
4. Or programmatically:

```javascript
await usersResource.insert({
  email: 'user@company.com',
  name: 'New User',
  passwordHash: await hashPassword('TempPass123!'),
  status: 'active',
  emailVerified: true
});
```

**Run:**
```bash
node docs/examples/e87-identity-no-registration.js
```

**Try:**
- Visit /register → redirected to /login with error
- No "Register" link in UI

---

## White-Label & Branding

### Color Customization

**Example:** S3dbCorp theme (e85)

```javascript
ui: {
  primaryColor: '#0066CC',      // S3dbCorp Blue
  secondaryColor: '#6c757d',
  successColor: '#00B894',
  dangerColor: '#D63031',
  warningColor: '#FDCB6E',
  infoColor: '#74B9FF'
}
```

**Result:** All buttons, links, alerts use custom colors

### Typography

**Example:** Inter font (e85)

```javascript
ui: {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: '16px'
}
```

**Custom CSS:**
```javascript
ui: {
  customCSS: `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 12px rgba(0, 102, 204, 0.3);
    }
  `
}
```

### Social Media Integration

**Example:** Footer with social links (e85)

```javascript
ui: {
  socialLinks: {
    github: 'https://github.com/s3dbcorp',
    twitter: 'https://twitter.com/s3dbcorp',
    linkedin: 'https://linkedin.com/company/s3dbcorp'
  }
}
```

**Result:** Footer displays social icons with links

### Company Branding

**Example:** Complete branding (e85)

```javascript
ui: {
  companyName: 'S3dbCorp',
  tagline: 'Secure Cloud Identity Solutions',
  logoUrl: 'https://s3dbcorp.com/logo.svg',
  favicon: 'https://s3dbcorp.com/favicon.ico',
  footerText: 'Trusted by thousands of organizations worldwide',
  supportEmail: 'support@s3dbcorp.com',
  privacyUrl: 'https://s3dbcorp.com/privacy',
  termsUrl: 'https://s3dbcorp.com/terms'
}
```

## Registration Controls

### Scenario 1: No Public Registration

**Example:** e87-identity-no-registration.js

```javascript
registration: {
  enabled: false,
  customMessage: 'Contact admin for access'
}
```

**Behavior:**
- /register redirects to /login with error
- No register links in UI
- Admin creates users via panel

---

### Scenario 2: Corporate Emails Only

```javascript
registration: {
  enabled: true,
  allowedDomains: ['company.com', 'partner.com'],
  customMessage: 'Please use your corporate email address'
}
```

**Behavior:**
- Only @company.com and @partner.com can register
- Other domains get error message
- Email verification required

---

### Scenario 3: Block Temporary Emails

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

**Behavior:**
- Blocked domains cannot register
- Error: "Registration with this email domain is not allowed"

---

### Scenario 4: Whitelist + Blacklist

```javascript
registration: {
  enabled: true,
  allowedDomains: ['company.com'],
  blockedDomains: ['tempmail.com'],  // Extra safety
  requireEmailVerification: true
}
```

**Behavior:**
- Only @company.com allowed
- Temp emails blocked (redundant but safe)
- Email verification required

## Running Examples

### Prerequisites

1. **MinIO** (for S3DB storage):
```bash
docker run -d -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  quay.io/minio/minio server /data --console-address ":9001"
```

2. **SMTP** (optional, for emails):
   - Use Gmail with app password
   - Or use MailHog for testing:
```bash
docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog
```

### Running an Example

```bash
# Navigate to examples directory
cd docs/examples

# Run example
node e85-identity-whitelabel.js

# Or with custom connection string
MRT_CONNECTION_STRING=http://minioadmin:minioadmin@localhost:9000/myapp \
  node e85-identity-whitelabel.js
```

### Testing Flows

#### Registration Flow
1. Visit http://localhost:4000/register
2. Fill in name, email, password
3. Agree to terms
4. Submit form
5. Check email for verification link
6. Click link to activate account
7. Login at /login

#### Login Flow
1. Visit http://localhost:4000/login
2. Enter email and password
3. Optionally check "Remember me"
4. Submit form
5. Redirected to /profile

#### Password Reset Flow
1. Visit http://localhost:4000/forgot-password
2. Enter email address
3. Check email for reset link
4. Click link
5. Enter new password
6. Submit
7. Login with new password

#### Admin Flow
1. Create admin user (see e87 example)
2. Login as admin
3. Visit http://localhost:4000/admin
4. Manage users and OAuth2 clients

### Troubleshooting Examples

#### Port Already in Use

```bash
# Change port
PORT=5000 node e85-identity-whitelabel.js

# Or kill existing process
lsof -ti:4000 | xargs kill
```

#### Connection Refused

```bash
# Check MinIO is running
docker ps | grep minio

# Or start MinIO
docker start <container-id>
```

#### Email Not Sending

```bash
# Check SMTP configuration
# Use MailHog for testing:
SMTP_HOST=localhost SMTP_PORT=1025 \
  node e85-identity-whitelabel.js

# View emails at http://localhost:8025
```

## Creating Your Own Example

### Template

```javascript
/**
 * Example: [Your Title]
 *
 * [Description of what this demonstrates]
 *
 * Usage:
 *   node docs/examples/eXX-your-example.js
 */

import { Database } from '../../src/index.js';
import { IdentityPlugin } from '../../src/plugins/identity/index.js';

const db = new Database({
  connectionString: process.env.MRT_CONNECTION_STRING ||
    'http://minioadmin:minioadmin@localhost:9000/example-app'
});

async function main() {
  await db.initialize();

  const identityPlugin = new IdentityPlugin({
    issuer: 'http://localhost:4000',
    database: db,

    // Your custom configuration here
    ui: {
      companyName: 'My Company',
      // ...
    },

    server: {
      port: 4000,
      host: '0.0.0.0',
      verbose: true
    }
  });

  await identityPlugin.initialize();

  console.log('\\nIdentity Provider Started!');
  console.log('Login: http://localhost:4000/login\\n');
}

main().catch(console.error);
```

### Best Practices

1. **Clear description** at the top
2. **Usage instructions** in comments
3. **Environment variable** for connection string
4. **Verbose mode** for debugging
5. **Console output** with useful URLs
6. **Error handling** with `.catch()`

---

**See also:**
- [Identity Plugin Documentation](./identity-plugin.md)
- [Configuration Reference](./identity-config-reference.md)
