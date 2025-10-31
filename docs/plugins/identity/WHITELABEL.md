# Identity Plugin - White-Label Configuration

The **Identity Plugin** is 100% **white-label**, allowing you to completely customize the appearance, branding, and behavior of the identity server for your company or client.

## 🎨 Customization Capabilities

### 1. Complete Branding

```javascript
ui: {
  // Visual Identity
  title: 'Your Company Identity',
  companyName: 'Your Company',
  tagline: 'Your tagline here',

  // Logos and Icons
  logoUrl: 'https://yourcompany.com/logo.svg',
  favicon: 'https://yourcompany.com/favicon.ico',

  // Footer
  footerText: 'Custom footer text',
  supportEmail: 'support@yourcompany.com',
  privacyUrl: '/privacy',
  termsUrl: '/terms'
}
```

### 2. Complete Color Palette

All colors are customizable via CSS variables:

```javascript
ui: {
  // Primary Colors
  primaryColor: '#0066CC',      // Buttons, links, headers
  secondaryColor: '#6c757d',    // Secondary elements

  // Status Colors
  successColor: '#28a745',      // Success messages
  dangerColor: '#dc3545',       // Errors and alerts
  warningColor: '#ffc107',      // Warnings
  infoColor: '#17a2b8',         // Information

  // Text Colors
  textColor: '#212529',         // Main text
  textMuted: '#6c757d',         // Secondary text

  // Background Colors
  backgroundColor: '#ffffff',    // Main background
  backgroundLight: '#f8f9fa',   // Card/section background
  borderColor: '#dee2e6'        // Borders
}
```

### 3. Custom Typography

```javascript
ui: {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: '16px'
}
```

**Google Fonts:**
```javascript
ui: {
  customCSS: `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  `
}
```

### 4. Custom CSS (Total Power!)

You can inject **any custom CSS**:

```javascript
ui: {
  customCSS: `
    /* Your CSS here */

    /* Custom buttons */
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      transition: transform 0.2s;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
    }

    /* Cards with glassmorphism effect */
    .card {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    /* Custom animations */
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .login-form {
      animation: fadeInUp 0.6s ease-out;
    }

    /* Dark themes */
    @media (prefers-color-scheme: dark) {
      :root {
        --color-bg: #1a1a2e;
        --color-text: #eee;
      }
    }
  `
}
```

### 5. Layout and Design

```javascript
ui: {
  borderRadius: '0.5rem',       // Rounded corners
  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'  // Shadows
}
```

### 6. Social Links

```javascript
ui: {
  socialLinks: {
    github: 'https://github.com/yourcompany',
    twitter: 'https://twitter.com/yourcompany',
    linkedin: 'https://linkedin.com/company/yourcompany',
    facebook: 'https://facebook.com/yourcompany',
    instagram: 'https://instagram.com/yourcompany'
  }
}
```

## 📐 CSS Architecture

### CSS Variables (`:root`)

BaseLayout injects all configurations as CSS variables:

```css
:root {
  --color-primary: #0066CC;
  --color-secondary: #6c757d;
  --color-success: #28a745;
  --color-danger: #dc3545;
  --color-warning: #ffc107;
  --color-info: #17a2b8;

  --color-text: #212529;
  --color-text-muted: #6c757d;

  --color-bg: #ffffff;
  --color-light: #f8f9fa;
  --color-border: #dee2e6;

  --font-family: 'Inter', sans-serif;
  --font-size-base: 16px;

  --border-radius: 0.375rem;
  --box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
}
```

### Tailwind 4 CDN

All pages use **Tailwind 4 via CDN** (`@tailwindcss/browser@4`):

```html
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
```

**Tailwind Configuration:**
```javascript
window.tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        surface: 'var(--color-card-bg)'
      },
      fontFamily: {
        display: ['var(--font-family)'],
        body: ['var(--font-family)']
      }
    }
  }
};
```

### CSS Loading Order

1. **CSS Variables** (`:root`) - Plugin configurations
2. **main.css** - Identity Plugin base styles
3. **customCSS** - Your custom CSS (overrides everything)

```html
<style>:root { /* variables */ }</style>
<style>/* main.css */</style>
<style>/* customCSS here */</style>
```

## 🎯 Use Cases

### B2B SaaS Company

```javascript
ui: {
  title: 'Acme Corp SSO',
  companyName: 'Acme Corp',
  primaryColor: '#FF6B6B',
  fontFamily: "'Poppins', sans-serif",
  logoUrl: 'https://acme.com/logo.svg',
  customCSS: `
    .login-form {
      border-left: 4px solid #FF6B6B;
    }
  `
}
```

### Fintech

```javascript
ui: {
  title: 'SecureBank Identity',
  companyName: 'SecureBank',
  primaryColor: '#2ECC71',
  secondaryColor: '#34495E',
  fontFamily: "'Roboto', sans-serif",
  customCSS: `
    /* Professional banking theme */
    body {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    .card {
      border-top: 5px solid #2ECC71;
    }
  `
}
```

### E-commerce

```javascript
ui: {
  title: 'ShopHub Account',
  companyName: 'ShopHub',
  primaryColor: '#E91E63',
  successColor: '#4CAF50',
  fontFamily: "'Montserrat', sans-serif",
  customCSS: `
    /* Vibrant e-commerce theme */
    .btn-primary {
      background: linear-gradient(45deg, #E91E63, #F06292);
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 1px;
    }

    .header {
      background: #000;
      color: #fff;
    }
  `
}
```

### Healthcare/Medical

```javascript
ui: {
  title: 'MedSecure Patient Portal',
  companyName: 'MedSecure',
  primaryColor: '#0288D1',
  successColor: '#00BCD4',
  dangerColor: '#E53935',
  fontFamily: "'Open Sans', sans-serif",
  customCSS: `
    /* Clean and professional healthcare theme */
    body {
      background: #FAFAFA;
    }

    .card {
      border-radius: 8px;
      border: 1px solid #E0E0E0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }

    .btn-primary {
      border-radius: 4px;
      font-weight: 600;
    }
  `
}
```

## 🚀 Complete Example

See the complete example at:
```
docs/examples/e85-identity-whitelabel.js
```

Run:
```bash
node docs/examples/e85-identity-whitelabel.js
```

## 📝 Important Notes

### ✅ What you CAN do:

- ✅ Change all colors
- ✅ Use any font (Google Fonts, Adobe Fonts, etc.)
- ✅ Inject any custom CSS
- ✅ Customize logos and favicons
- ✅ Add CSS animations
- ✅ Implement dark mode
- ✅ Use CSS frameworks via CDN (as long as they don't conflict with Tailwind)
- ✅ Override any Identity Plugin style

### ⚠️ Limitations:

- ⚠️ Cannot change HTML structure of pages (only CSS)
- ⚠️ Tailwind 4 CDN is mandatory (but you can use other libraries via customCSS)
- ⚠️ Logos must be served via URL (doesn't support inline base64 for performance)

### 💡 Tips:

1. **Use CSS Variables**: They are reactive and work with Tailwind
2. **Test Responsiveness**: Always test on mobile/tablet/desktop
3. **Performance**: Avoid importing many fonts (maximum 2-3 weights)
4. **Dark Mode**: Use `@media (prefers-color-scheme: dark)` in customCSS
5. **Accessibility**: Maintain adequate contrast (WCAG AA: 4.5:1)

## 🎨 Useful Tools

- **Coolors**: https://coolors.co/ (color palettes)
- **Google Fonts**: https://fonts.google.com/
- **CSS Gradient**: https://cssgradient.io/
- **Shadow Generator**: https://shadows.brumm.af/
- **Color Contrast Checker**: https://webaim.org/resources/contrastchecker/

## 📚 References

- `src/plugins/identity/ui/layouts/base.js` - BaseLayout implementation
- `src/plugins/identity/ui/styles/main.css` - Base styles
- `docs/examples/e85-identity-whitelabel.js` - Complete example
- Tailwind 4 Docs: https://tailwindcss.com/docs
