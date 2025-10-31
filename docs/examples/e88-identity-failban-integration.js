/**
 * Identity Plugin + Failban Integration Example
 *
 * This example demonstrates how to use the Identity Plugin with integrated
 * brute force protection via FailbanManager. After N failed login attempts,
 * the IP is automatically banned for a configurable duration.
 *
 * Features demonstrated:
 * - Automatic IP banning after failed login attempts
 * - GeoIP country blocking (optional)
 * - IP whitelist/blacklist
 * - Configurable ban duration and violation thresholds
 * - Persistent ban storage in S3DB
 */

import { Database } from '../../src/database.class.js';
import { IdentityPlugin } from '../../src/plugins/identity/index.js';

async function main() {
  // ============================================================================
  // Setup Database
  // ============================================================================
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/identity-failban-demo',
    encryptionKey: 'demo-encryption-key-32-chars!!'
  });

  await db.connect();

  // ============================================================================
  // Configure Identity Plugin with Failban Protection
  // ============================================================================
  const identityPlugin = new IdentityPlugin({
    port: 4000,
    issuer: 'http://localhost:4000',
    verbose: true,

    // OAuth2/OIDC configuration
    supportedScopes: ['openid', 'profile', 'email', 'offline_access'],
    supportedGrantTypes: ['authorization_code', 'client_credentials', 'refresh_token'],
    accessTokenExpiry: '15m',
    idTokenExpiry: '15m',
    refreshTokenExpiry: '7d',

    // Password policy
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSymbols: false,
      bcryptRounds: 10
    },

    // 🔒 ACCOUNT LOCKOUT CONFIGURATION (Per-User Protection)
    accountLockout: {
      enabled: true,                     // Enable account lockout
      maxAttempts: 5,                    // Lock after 5 failed attempts
      lockoutDuration: 900000,           // Lock for 15 minutes
      resetOnSuccess: true               // Reset counter on successful login
    },

    // 🔒 FAILBAN CONFIGURATION (IP-Based Protection)
    failban: {
      enabled: true,                         // Enable failban protection
      maxViolations: 5,                      // Ban after 5 failed attempts
      violationWindow: 300000,               // 5 minutes window
      banDuration: 900000,                   // 15 minutes ban
      whitelist: ['127.0.0.1', '::1'],      // Never ban localhost
      blacklist: [],                         // Permanently banned IPs
      persistViolations: true,               // Store violations in DB

      // Which endpoints to protect
      endpoints: {
        login: true,                         // Protect /login (POST)
        token: true,                         // Protect /oauth/token (POST)
        register: true                       // Protect /register (POST)
      },

      // GeoIP Country Blocking (Optional - requires MaxMind GeoLite2)
      geo: {
        enabled: false,                      // Enable GeoIP blocking
        databasePath: '/path/to/GeoLite2-Country.mmdb', // Download from MaxMind
        allowedCountries: ['US', 'BR', 'CA'], // Only allow these countries
        blockedCountries: ['CN', 'RU'],      // Block these countries
        blockUnknown: false                  // Block IPs with unknown country
      }
    },

    // Required resource configurations
    resources: {
      users: { name: 'users' },
      tenants: { name: 'tenants' },
      clients: { name: 'clients' }
    },

    // UI customization
    ui: {
      title: 'Secure Identity Server',
      companyName: 'Demo Corp',
      primaryColor: '#007bff'
    },

    // CORS for frontend apps
    cors: {
      enabled: true,
      origin: '*',
      credentials: true
    }
  });

  await db.usePlugin(identityPlugin);

  // ============================================================================
  // Create Test Data
  // ============================================================================
  const usersResource = db.resources.users;
  const clientsResource = db.resources.clients;

  // Create test user
  const user = await usersResource.insert({
    email: 'admin@demo.local',
    password: 'SecurePassword123!',
    name: 'Admin User',
    scopes: ['openid', 'profile', 'email'],
    status: 'active',
    emailVerified: true
  });

  console.log('\n✅ Test user created:', user.email);

  // Create OAuth2 client
  const client = await clientsResource.insert({
    clientId: 'demo-app-123',
    clientSecret: 'demo-secret-456',
    name: 'Demo Application',
    redirectUris: ['http://localhost:3000/callback'],
    allowedScopes: ['openid', 'profile', 'email'],
    grantTypes: ['authorization_code', 'refresh_token'],
    active: true
  });

  console.log('✅ OAuth2 client created:', client.clientId);

  // ============================================================================
  // Server Running
  // ============================================================================
  console.log('\n🚀 Identity Server running with dual-layer security');
  console.log(`   URL: http://localhost:4000`);
  console.log(`   Discovery: http://localhost:4000/.well-known/openid-configuration`);
  console.log('\n🔒 Account Lockout (Per-User):');
  console.log(`   Max attempts: 5 failed logins`);
  console.log(`   Lockout duration: 15 minutes`);
  console.log(`   Auto-reset on success: Yes`);
  console.log('\n🔒 Failban (IP-Based):');
  console.log(`   Max violations: 5 failed attempts`);
  console.log(`   Violation window: 5 minutes`);
  console.log(`   Ban duration: 15 minutes`);
  console.log(`   Protected endpoints: /login, /oauth/token, /register`);

  console.log('\n📋 Test Scenarios:');
  console.log('   1. Try to login with wrong password 5 times');
  console.log('   2. After 5th attempt, IP will be banned for 15 minutes');
  console.log('   3. During ban, all requests from that IP will return 403 Forbidden');
  console.log('   4. Ban expires automatically after 15 minutes');
  console.log('\n💡 Test with curl:');
  console.log('   # Failed login attempt');
  console.log('   curl -X POST http://localhost:4000/login \\');
  console.log('        -d "email=admin@demo.local&password=wrong" \\');
  console.log('        -v');
  console.log('\n   # After 5 attempts, you will get:');
  console.log('   # HTTP/1.1 403 Forbidden');
  console.log('   # X-Ban-Status: banned');
  console.log('   # X-Ban-Reason: 5 failed_login violations');
  console.log('   # Retry-After: 900');

  console.log('\n📊 Check ban status programmatically:');
  console.log(`
  const failbanManager = identityPlugin.failbanManager;

  // Check if IP is banned
  const isBanned = failbanManager.isBanned('1.2.3.4');

  // Get ban details
  const ban = await failbanManager.getBan('1.2.3.4');
  console.log(ban);
  // {
  //   ip: '1.2.3.4',
  //   reason: '5 failed_login violations',
  //   expiresAt: '2025-10-30T12:30:00.000Z',
  //   violations: 5
  // }

  // List all active bans
  const bans = await failbanManager.listBans();

  // Get statistics
  const stats = await failbanManager.getStats();
  console.log(stats);
  // {
  //   enabled: true,
  //   activeBans: 3,
  //   totalViolations: 42,
  //   whitelistedIPs: 2,
  //   blacklistedIPs: 0,
  //   config: { maxViolations: 5, ... }
  // }

  // Manually ban an IP
  await failbanManager.ban('1.2.3.4', 'Manual ban by admin');

  // Manually unban an IP
  await failbanManager.unban('1.2.3.4');
  `);

  console.log('\n📁 Resources created by Failban:');
  console.log('   - _api_failban_bans: Stores active bans (with TTL auto-expiry)');
  console.log('   - _api_failban_violations: Stores violation history');

  console.log('\n⚠️  Important Notes:');
  console.log('   - Bans are stored in S3DB with TTL (auto-expire)');
  console.log('   - Violations are tracked per IP within violation window');
  console.log('   - Successful login does NOT clear violations (they expire naturally)');
  console.log('   - Whitelisted IPs (localhost) are never banned');
  console.log('   - GeoIP blocking requires MaxMind GeoLite2 database');

  // Keep server running
  await new Promise(() => {});
}

main().catch(console.error);
