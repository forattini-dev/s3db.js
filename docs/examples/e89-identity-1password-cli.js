/**
 * Example 89: Identity Plugin + 1Password CLI Integration
 *
 * Shows how to use 1Password CLI to:
 * 1. Store Identity Plugin credentials securely
 * 2. Retrieve secrets at runtime (zero .env files!)
 * 3. Rotate client secrets automatically
 *
 * Prerequisites:
 * - Install 1Password CLI: https://developer.1password.com/docs/cli/get-started/
 * - Setup 1Password Service Account (for CI/CD)
 * - Create vault "s3db-identity" in 1Password
 *
 * Benefits:
 * - ✅ Zero secrets in code/env files
 * - ✅ Audit trail in 1Password
 * - ✅ Easy rotation
 * - ✅ Team collaboration
 * - ✅ Works in CI/CD
 */

import { Database } from 's3db.js';
import { IdentityPlugin } from 's3db.js';
import { execSync } from 'child_process';

// ============================================================================
// 1Password CLI Helper Functions
// ============================================================================

/**
 * Retrieve secret from 1Password using CLI
 * @param {string} reference - 1Password secret reference (e.g., "op://s3db-identity/smtp/password")
 * @returns {string} Secret value
 */
function get1PasswordSecret(reference) {
  try {
    const value = execSync(`op read "${reference}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
    }).trim();

    return value;
  } catch (error) {
    console.error(`[1Password] Failed to read secret: ${reference}`);
    throw error;
  }
}

/**
 * Store secret in 1Password
 * @param {string} vault - Vault name
 * @param {string} item - Item name
 * @param {string} field - Field name
 * @param {string} value - Secret value
 */
function set1PasswordSecret(vault, item, field, value) {
  try {
    execSync(`op item create --vault="${vault}" --category=password --title="${item}" "${field}=${value}"`, {
      encoding: 'utf-8'
    });

    console.log(`[1Password] Secret stored: ${vault}/${item}/${field}`);
  } catch (error) {
    console.error(`[1Password] Failed to store secret`);
    throw error;
  }
}

// ============================================================================
// Setup 1Password Vault (Run Once)
// ============================================================================

async function setup1PasswordVault() {
  console.log('[Setup] Creating 1Password vault and items...\n');

  // Create vault (if not exists)
  try {
    execSync('op vault create s3db-identity --description "S3DB Identity Plugin Secrets"');
    console.log('✅ Vault created: s3db-identity');
  } catch (error) {
    console.log('ℹ️  Vault already exists');
  }

  // Store SMTP credentials
  console.log('\n[Setup] Storing SMTP credentials...');
  set1PasswordSecret('s3db-identity', 'smtp', 'host', 'smtp.sendgrid.net');
  set1PasswordSecret('s3db-identity', 'smtp', 'port', '587');
  set1PasswordSecret('s3db-identity', 'smtp', 'username', 'apikey');
  set1PasswordSecret('s3db-identity', 'smtp', 'password', 'SG.abc123...');

  // Store cookie secret (32+ chars)
  console.log('\n[Setup] Generating and storing cookie secret...');
  const cookieSecret = execSync('openssl rand -base64 32', { encoding: 'utf-8' }).trim();
  set1PasswordSecret('s3db-identity', 'app', 'cookie-secret', cookieSecret);

  // Store database connection
  console.log('\n[Setup] Storing S3 credentials...');
  set1PasswordSecret('s3db-identity', 's3', 'access-key', 'AKIAIOSFODNN7EXAMPLE');
  set1PasswordSecret('s3db-identity', 's3', 'secret-key', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
  set1PasswordSecret('s3db-identity', 's3', 'bucket', 'my-identity-bucket');

  console.log('\n✅ 1Password vault setup complete!\n');
  console.log('View items: op item list --vault s3db-identity');
}

// ============================================================================
// Identity Plugin with 1Password Secrets
// ============================================================================

async function startIdentityPlugin() {
  console.log('[Identity] Loading secrets from 1Password...\n');

  // Load S3 credentials from 1Password
  const s3AccessKey = get1PasswordSecret('op://s3db-identity/s3/access-key');
  const s3SecretKey = get1PasswordSecret('op://s3db-identity/s3/secret-key');
  const s3Bucket = get1PasswordSecret('op://s3db-identity/s3/bucket');

  const connectionString = `s3://${s3AccessKey}:${s3SecretKey}@${s3Bucket}?region=us-east-1`;

  // Connect to database
  const db = new Database({ connectionString });
  await db.connect();

  // Load SMTP credentials from 1Password
  const smtpHost = get1PasswordSecret('op://s3db-identity/smtp/host');
  const smtpPort = get1PasswordSecret('op://s3db-identity/smtp/port');
  const smtpUsername = get1PasswordSecret('op://s3db-identity/smtp/username');
  const smtpPassword = get1PasswordSecret('op://s3db-identity/smtp/password');

  // Load cookie secret from 1Password
  const cookieSecret = get1PasswordSecret('op://s3db-identity/app/cookie-secret');

  // Start Identity Plugin with 1Password secrets
  await db.usePlugin(new IdentityPlugin({
    port: 4000,
    issuer: 'https://auth.myapp.com',

    // Resources (with user schema)
    resources: {
      users: {
        name: 'users',
        attributes: {
          tenantId: 'string|optional'
        }
      },
      tenants: {
        name: 'tenants'
      },
      clients: {
        name: 'oauth_clients'
      }
    },

    // Email (from 1Password)
    email: {
      enabled: true,
      from: 'noreply@myapp.com',
      smtp: {
        host: smtpHost,
        port: parseInt(smtpPort),
        secure: false,
        auth: {
          user: smtpUsername,
          pass: smtpPassword
        }
      }
    },

    // Session (cookie secret from 1Password)
    session: {
      cookieSecret,
      sessionExpiry: '24h',
      cookieSecure: true,
      cookieSameSite: 'Lax'
    },

    // Security
    mfa: { enabled: true },
    failban: { enabled: true },
    audit: { enabled: true }
  }));

  console.log('✅ Identity Plugin started with 1Password secrets!\n');
  console.log('🔐 Secrets loaded from 1Password:');
  console.log('   - SMTP credentials');
  console.log('   - Cookie secret');
  console.log('   - S3 credentials');
  console.log('\n📝 Zero secrets in code or .env files!');
}

// ============================================================================
// OAuth2 Client Secret Rotation with 1Password
// ============================================================================

async function rotateClientSecret(db, clientId) {
  console.log(`\n[Rotation] Rotating secret for client: ${clientId}...`);

  const clientsResource = db.getResource('oauth_clients');

  // Get client
  const client = await clientsResource.get(clientId);
  if (!client) {
    throw new Error('Client not found');
  }

  // Generate new secret
  const newSecret = execSync('openssl rand -base64 32', { encoding: 'utf-8' }).trim();

  // Hash secret (bcrypt)
  const bcrypt = await import('bcryptjs');
  const hashedSecret = await bcrypt.hash(newSecret, 10);

  // Update client
  await clientsResource.patch(clientId, {
    clientSecret: hashedSecret,
    secretRotatedAt: new Date().toISOString()
  });

  // Store plain secret in 1Password (for client to retrieve)
  const itemName = `client-${client.name}`;

  try {
    // Update existing item
    execSync(`op item edit "${itemName}" --vault s3db-identity "client_secret=${newSecret}"`);
  } catch (error) {
    // Create new item
    set1PasswordSecret('s3db-identity', itemName, 'client_id', client.clientId);
    set1PasswordSecret('s3db-identity', itemName, 'client_secret', newSecret);
  }

  console.log('✅ Client secret rotated successfully!');
  console.log(`\n🔑 New secret stored in 1Password: op://s3db-identity/${itemName}/client_secret`);
  console.log('\n📋 Share with client using 1Password:\n');
  console.log(`   op item share "${itemName}" --vault s3db-identity --emails client@example.com`);

  return newSecret;
}

// ============================================================================
// CI/CD Integration (GitHub Actions, GitLab CI, etc.)
// ============================================================================

/**
 * Example GitHub Actions workflow that uses 1Password
 *
 * .github/workflows/deploy.yml:
 *
 * ```yaml
 * name: Deploy Identity Plugin
 *
 * on:
 *   push:
 *     branches: [main]
 *
 * jobs:
 *   deploy:
 *     runs-on: ubuntu-latest
 *     steps:
 *       - uses: actions/checkout@v3
 *
 *       - name: Install 1Password CLI
 *         uses: 1password/load-secrets-action@v1
 *         with:
 *           export-env: true
 *         env:
 *           OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
 *           SMTP_HOST: op://s3db-identity/smtp/host
 *           SMTP_PASSWORD: op://s3db-identity/smtp/password
 *           COOKIE_SECRET: op://s3db-identity/app/cookie-secret
 *
 *       - name: Deploy
 *         run: |
 *           # Secrets are now in environment variables
 *           echo "Deploying with SMTP_HOST: $SMTP_HOST"
 *           ./deploy.sh
 * ```
 */

// ============================================================================
// Local Development with 1Password
// ============================================================================

/**
 * .env.example (for documentation only - actual values in 1Password):
 *
 * # Load secrets from 1Password:
 * #
 * # eval $(op signin)
 * # export SMTP_PASSWORD=$(op read "op://s3db-identity/smtp/password")
 * # export COOKIE_SECRET=$(op read "op://s3db-identity/app/cookie-secret")
 * # npm run dev
 *
 * Or use op run:
 *
 * # op run --env-file .env.1password -- npm run dev
 */

// ============================================================================
// Team Collaboration
// ============================================================================

async function shareSecretsWithTeam() {
  console.log('\n[Team] Sharing 1Password vault with team members...\n');

  // Grant access to vault
  const teamMembers = [
    'alice@myapp.com',
    'bob@myapp.com',
    'carol@myapp.com'
  ];

  for (const email of teamMembers) {
    try {
      execSync(`op vault user grant s3db-identity --user ${email} --permissions manage_items`);
      console.log(`✅ Access granted: ${email}`);
    } catch (error) {
      console.log(`⚠️  Already has access: ${email}`);
    }
  }

  console.log('\n✅ Team members can now access secrets!');
  console.log('\n📋 Team members should run:');
  console.log('   1. Install 1Password CLI: brew install 1password-cli');
  console.log('   2. Sign in: op signin');
  console.log('   3. Run app: npm run dev');
}

// ============================================================================
// Audit Trail
// ============================================================================

async function viewSecretAccessLog() {
  console.log('\n[Audit] Viewing secret access history...\n');

  // View who accessed secrets
  const history = execSync('op item list --vault s3db-identity --format json', {
    encoding: 'utf-8'
  });

  const items = JSON.parse(history);

  console.log('📊 Secret Access Summary:\n');
  for (const item of items) {
    console.log(`   ${item.title}`);
    console.log(`   - Created: ${item.created_at}`);
    console.log(`   - Updated: ${item.updated_at}`);
    console.log(`   - Access count: ${item.version || 'N/A'}`);
    console.log();
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const action = process.argv[2];

  try {
    switch (action) {
      case 'setup':
        await setup1PasswordVault();
        break;

      case 'start':
        await startIdentityPlugin();
        break;

      case 'rotate':
        const clientId = process.argv[3];
        if (!clientId) {
          console.error('Usage: node e89-identity-1password-cli.js rotate <client-id>');
          process.exit(1);
        }
        const db = new Database({ connectionString: get1PasswordSecret('op://s3db-identity/s3/connection-string') });
        await db.connect();
        await rotateClientSecret(db, clientId);
        break;

      case 'share':
        await shareSecretsWithTeam();
        break;

      case 'audit':
        await viewSecretAccessLog();
        break;

      default:
        console.log('Usage:');
        console.log('  node e89-identity-1password-cli.js setup    # Setup 1Password vault');
        console.log('  node e89-identity-1password-cli.js start    # Start Identity Plugin');
        console.log('  node e89-identity-1password-cli.js rotate <client-id>  # Rotate client secret');
        console.log('  node e89-identity-1password-cli.js share    # Share vault with team');
        console.log('  node e89-identity-1password-cli.js audit    # View access logs');
        break;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  get1PasswordSecret,
  set1PasswordSecret,
  setup1PasswordVault,
  startIdentityPlugin,
  rotateClientSecret,
  shareSecretsWithTeam,
  viewSecretAccessLog
};
