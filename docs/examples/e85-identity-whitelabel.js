/**
 * Example: Identity Provider with White-Label Theme (S3dbCorp)
 *
 * Demonstrates comprehensive white-label branding configuration
 * for the Identity Provider plugin, including colors, logos, typography,
 * company information, and social links.
 *
 * Usage:
 *   node docs/examples/e85-identity-whitelabel.js
 */

import { Database } from '../../src/index.js';
import { IdentityPlugin } from '../../src/plugins/identity/index.js';

const db = new Database({
  connectionString: process.env.MRT_CONNECTION_STRING || 'http://minioadmin:minioadmin@localhost:9100/s3db-identity-demo'
});

async function main() {
  await db.initialize();

  // Create Identity Plugin with S3dbCorp White-Label Theme
  const identityPlugin = new IdentityPlugin({
    issuer: 'http://localhost:4000',
    database: db,

    // Email Configuration (optional)
    email: {
      enabled: true,
      from: 'noreply@s3dbcorp.com',
      replyTo: 'support@s3dbcorp.com',
      smtp: {
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || ''
        }
      },
      templates: {
        baseUrl: 'http://localhost:4000',
        brandName: 'S3dbCorp',
        brandLogo: 'https://s3dbcorp.com/logo.png',
        brandColor: '#0066CC',
        supportEmail: 'support@s3dbcorp.com',
        customFooter: 'S3dbCorp - Secure Cloud Identity Solutions'
      }
    },

    // 🎨 WHITE-LABEL THEME CONFIGURATION
    ui: {
      // Company Branding
      title: 'S3dbCorp Identity',
      companyName: 'S3dbCorp',
      tagline: 'Secure Cloud Identity Solutions',

      // Logo & Favicon
      logoUrl: 'https://s3dbcorp.com/assets/logo.svg',
      favicon: 'https://s3dbcorp.com/assets/favicon.ico',

      // 🎨 COLOR PALETTE - S3dbCorp Brand Colors
      // Primary colors for buttons, links, headers
      primaryColor: '#0066CC',       // S3dbCorp Blue
      secondaryColor: '#6c757d',     // Neutral Gray

      // Status colors
      successColor: '#00B894',       // Success Green
      dangerColor: '#D63031',        // Error Red
      warningColor: '#FDCB6E',       // Warning Yellow
      infoColor: '#74B9FF',          // Info Blue

      // Text colors
      textColor: '#2D3436',          // Dark Gray for body text
      textMuted: '#636E72',          // Muted Gray for secondary text

      // Background colors
      backgroundColor: '#FFFFFF',     // Pure White
      backgroundLight: '#F5F6FA',    // Light Gray for cards/sections
      borderColor: '#DFE6E9',        // Border Gray

      // 📝 TYPOGRAPHY
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fontSize: '16px',

      // 🎨 LAYOUT & DESIGN
      borderRadius: '0.5rem',        // Rounded corners
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.06)',

      // 🏢 COMPANY INFORMATION
      footerText: 'Trusted by thousands of organizations worldwide',
      supportEmail: 'support@s3dbcorp.com',
      privacyUrl: 'https://s3dbcorp.com/privacy',
      termsUrl: 'https://s3dbcorp.com/terms',

      // 🌐 SOCIAL MEDIA LINKS
      socialLinks: {
        github: 'https://github.com/s3dbcorp',
        twitter: 'https://twitter.com/s3dbcorp',
        linkedin: 'https://linkedin.com/company/s3dbcorp'
      },

      // 🎨 CUSTOM CSS (optional)
      customCSS: `
        /* S3dbCorp Custom Styles */

        /* Add Google Font */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        /* Custom button hover effects */
        .btn-primary:hover {
          background-color: #0052A3;
          transform: translateY(-1px);
          box-shadow: 0 6px 12px rgba(0, 102, 204, 0.3);
        }

        /* Smooth transitions */
        .btn, .card, a {
          transition: all 0.2s ease-in-out;
        }

        /* Card hover effect */
        .card:hover {
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
        }

        /* Header gradient background */
        .header {
          background: linear-gradient(135deg, #0066CC 0%, #0052A3 100%);
          color: white;
        }

        .header a {
          color: white !important;
        }

        .header .nav a:hover {
          background-color: rgba(255, 255, 255, 0.1);
        }

        /* Footer background */
        .footer {
          background-color: #F5F6FA;
          border-top: 2px solid #0066CC;
        }

        /* Form focus states */
        .form-control:focus {
          border-color: #0066CC;
          box-shadow: 0 0 0 0.2rem rgba(0, 102, 204, 0.25);
        }

        /* Logo animation */
        .logo img {
          transition: transform 0.3s ease;
        }

        .logo:hover img {
          transform: scale(1.05);
        }

        /* Badge styles */
        .badge {
          font-weight: 600;
          padding: 0.35rem 0.65rem;
          border-radius: 0.25rem;
        }

        /* Alert styles */
        .alert {
          border-radius: 0.5rem;
          border-left-width: 4px;
        }

        .alert-success {
          background-color: #E8F8F5;
          border-left-color: #00B894;
          color: #00695C;
        }

        .alert-danger {
          background-color: #FEF0F0;
          border-left-color: #D63031;
          color: #B71C1C;
        }

        /* Responsive improvements */
        @media (max-width: 768px) {
          .header-content {
            flex-direction: column;
            gap: 1rem;
          }

          .nav {
            flex-direction: column;
            width: 100%;
          }

          .footer > div > div {
            grid-template-columns: 1fr;
          }
        }
      `
    },

    // Password Policy
    passwordPolicy: {
      minLength: 12,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      bcryptRounds: 12
    },

    // Session Configuration
    session: {
      expiresIn: '7d',
      renewBeforeExpiry: '1d',
      cookieName: 's3dbcorp_session',
      secure: false, // Set to true in production with HTTPS
      sameSite: 'lax'
    },

    // Server Configuration
    server: {
      port: 4000,
      host: '0.0.0.0',
      verbose: true,

      // CORS Configuration
      cors: {
        enabled: true,
        origin: ['http://localhost:3000', 'https://s3dbcorp.com'],
        credentials: true
      },

      // Security Headers
      security: {
        enabled: true,
        contentSecurityPolicy: true,
        hsts: false // Set to true in production
      },

      // Request Logging
      logging: {
        enabled: true,
        format: 'combined'
      }
    }
  });

  await identityPlugin.initialize();

  console.log('\n🎨 S3dbCorp Identity Provider Started!');
  console.log('━'.repeat(60));
  console.log('');
  console.log('🌐  Server:        http://localhost:4000');
  console.log('🔐  Login:         http://localhost:4000/login');
  console.log('📝  Register:      http://localhost:4000/register');
  console.log('👤  Profile:       http://localhost:4000/profile');
  console.log('⚙️   Admin:         http://localhost:4000/admin');
  console.log('');
  console.log('🎨  THEME: S3dbCorp Branding');
  console.log('   • Primary Color:    #0066CC (S3dbCorp Blue)');
  console.log('   • Font:             Inter');
  console.log('   • Logo:             https://s3dbcorp.com/assets/logo.svg');
  console.log('   • Company:          S3dbCorp');
  console.log('   • Tagline:          Secure Cloud Identity Solutions');
  console.log('');
  console.log('📧  Email:          support@s3dbcorp.com');
  console.log('🔗  Social:         GitHub, Twitter, LinkedIn');
  console.log('');
  console.log('━'.repeat(60));
  console.log('\nPress Ctrl+C to stop the server\n');
}

main().catch(console.error);
