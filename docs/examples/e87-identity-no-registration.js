/**
 * Example: Identity Provider with Registration Disabled
 *
 * Demonstrates how to disable public self-registration and restrict
 * account creation to administrators only.
 *
 * Use cases:
 * - Enterprise environments where users are provisioned by IT
 * - Invite-only applications
 * - Closed beta/private applications
 * - B2B SaaS with admin-managed accounts
 *
 * Usage:
 *   node docs/examples/e87-identity-no-registration.js
 */

import { Database } from '../../src/index.js';
import { IdentityPlugin } from '../../src/plugins/identity/index.js';

const db = new Database({
  connectionString: process.env.MRT_CONNECTION_STRING || 'http://minioadmin:minioadmin@localhost:9100/s3db-identity-demo'
});

async function main() {
  await db.initialize();

  // Create Identity Plugin with REGISTRATION DISABLED
  const identityPlugin = new IdentityPlugin({
    issuer: 'http://localhost:4000',
    database: db,

    // ============================================================================
    // REGISTRATION CONFIGURATION
    // ============================================================================
    registration: {
      // ❌ Disable public self-registration
      enabled: false,

      // Custom message shown when users try to access /register
      customMessage: 'Account registration is disabled. Please contact your administrator to create an account.',

      // Other options (only apply when enabled: true):
      // requireEmailVerification: true,
      // allowedDomains: ['company.com', 'partner.com'],  // Whitelist specific domains
      // blockedDomains: ['tempmail.com', 'guerrillamail.com']  // Block disposable emails
    },

    // Password Policy (still applies to admin-created users)
    passwordPolicy: {
      minLength: 12,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      bcryptRounds: 12
    },

    // UI Configuration
    ui: {
      title: 'Enterprise Identity',
      companyName: 'EnterpriseApp',
      tagline: 'Secure Enterprise Identity Management',
      primaryColor: '#1e40af',  // Enterprise blue
      successColor: '#059669',
      dangerColor: '#dc2626'
    },

    // Email Configuration (optional - for password resets, etc.)
    email: {
      enabled: true,
      from: 'noreply@enterpriseapp.com',
      smtp: {
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || ''
        }
      }
    },

    // Session Configuration
    session: {
      expiresIn: '7d',
      cookieName: 'enterprise_session',
      secure: false,  // Set to true in production with HTTPS
      sameSite: 'lax'
    },

    // Server Configuration
    server: {
      port: 4000,
      host: '0.0.0.0',
      verbose: true
    }
  });

  await identityPlugin.initialize();

  console.log('\n🔒 Enterprise Identity Provider Started (Registration Disabled)');
  console.log('━'.repeat(60));
  console.log('');
  console.log('🌐  Server:        http://localhost:4000');
  console.log('🔐  Login:         http://localhost:4000/login');
  console.log('❌  Register:       DISABLED (admin-only account creation)');
  console.log('👤  Profile:       http://localhost:4000/profile');
  console.log('⚙️   Admin:         http://localhost:4000/admin');
  console.log('');
  console.log('📋  REGISTRATION STATUS');
  console.log('   • Public Registration:  ❌ DISABLED');
  console.log('   • Account Creation:     Admin Panel Only');
  console.log('   • Custom Message:       Enabled');
  console.log('');
  console.log('🔑  HOW TO CREATE USERS');
  console.log('   1. Login as admin');
  console.log('   2. Go to http://localhost:4000/admin/users');
  console.log('   3. Click "Create New User"');
  console.log('   4. Fill in user details');
  console.log('');
  console.log('💡  TIP: Create an admin user first via direct DB insert:');
  console.log('');
  console.log('   const usersResource = db.resources.users;');
  console.log('   await usersResource.insert({');
  console.log('     email: "admin@company.com",');
  console.log('     name: "Admin User",');
  console.log('     passwordHash: await hashPassword("SecurePass123!"),');
  console.log('     status: "active",');
  console.log('     emailVerified: true,');
  console.log('     role: "admin"  // or isAdmin: true');
  console.log('   });');
  console.log('');
  console.log('━'.repeat(60));
  console.log('\nPress Ctrl+C to stop the server\n');
}

main().catch(console.error);
