/**
 * Demo: Identity Plugin with Custom Resources
 *
 * Demonstrates the full Identity Plugin with deep merge configuration
 */

import { Database, MemoryClient } from './src/index.js';
import { IdentityPlugin } from './src/plugins/identity/index.js';

// Use in-memory client for instant demo (no external dependencies!)
const db = new Database({
  client: new MemoryClient({ bucketName: 'identity-demo' }),
  encryptionKey: 'demo-encryption-key-32-chars!!'
});

async function main() {
  console.log('\n🚀 Starting Identity Plugin Demo...\n');

  await db.connect();
  console.log('✅ Database connected\n');

  // Configure Identity Plugin with custom resources
  const identityPlugin = new IdentityPlugin({
    port: 4000,
    issuer: 'http://localhost:4000',

    // 🎨 CUSTOM RESOURCES CONFIGURATION
    resources: {
      users: {
        name: 'demo_users',
        attributes: {
          // Custom fields
          company: 'string|default:Demo Corp',
          department: 'string|default:engineering',
          position: 'string|default:developer'
        },
        partitions: {
          byCompany: { fields: { company: 'string' } },
          byDepartment: { fields: { department: 'string' } }
        },
        hooks: {
          beforeInsert: [async (data) => {
            console.log(`   🔄 beforeInsert hook: Creating user ${data.email}`);
            data.department = data.department?.toUpperCase();
            return data;
          }],
          afterInsert: [async (data) => {
            console.log(`   ✅ afterInsert hook: User ${data.email} created with ID ${data.id}`);
          }]
        },
        behavior: 'body-overflow',
        timestamps: true
      },
      tenants: {
        name: 'demo_tenants',
        attributes: {
          plan: 'string|default:free',
          maxUsers: 'number|default:10'
        }
      },
      clients: {
        name: 'demo_oauth_clients',
        attributes: {
          logoUrl: 'string|default:https://demo.com/logo.png',
          brandColor: 'string|default:#007bff'
        }
      }
    },

    // OAuth2/OIDC configuration
    supportedScopes: ['openid', 'profile', 'email', 'read:api', 'write:api'],
    supportedGrantTypes: ['authorization_code', 'client_credentials', 'refresh_token'],
    accessTokenExpiry: '15m',
    idTokenExpiry: '15m',
    refreshTokenExpiry: '7d'
  });

  await db.usePlugin(identityPlugin);
  console.log('✅ Identity Plugin initialized\n');

  // Access the resources
  const usersResource = db.resources.demo_users;
  const clientsResource = db.resources.demo_oauth_clients;
  const tenantsResource = db.resources.demo_tenants;

  console.log('📦 Resources created:');
  console.log(`   • Users:   ${usersResource.name}`);
  console.log(`   • Tenants: ${tenantsResource.name}`);
  console.log(`   • Clients: ${clientsResource.name}\n`);

  // Show server info
  console.log('🌐 Identity Provider Server');
  console.log('━'.repeat(60));
  console.log('');
  console.log('📍 Base URL:       http://localhost:4000');
  console.log('');
  console.log('🔑 OAuth2/OIDC Endpoints:');
  console.log('   GET  /.well-known/openid-configuration');
  console.log('   GET  /.well-known/jwks.json');
  console.log('   POST /oauth/token');
  console.log('   GET  /oauth/authorize');
  console.log('   POST /oauth/authorize');
  console.log('   GET  /oauth/userinfo');
  console.log('   POST /oauth/introspect');
  console.log('   POST /oauth/revoke');
  console.log('   POST /oauth/register');
  console.log('');
  console.log('💡 To test, you need to create users and clients first:');
  console.log('   Use the resource APIs or admin endpoints to create test data');
  console.log('');
  console.log('━'.repeat(60));
  console.log('');
  console.log('💡 Test the server:');
  console.log('');
  console.log('   # Get discovery metadata');
  console.log('   curl http://localhost:4000/.well-known/openid-configuration');
  console.log('');
  console.log('   # Get JWKS (public keys)');
  console.log('   curl http://localhost:4000/.well-known/jwks.json');
  console.log('');
  console.log('━'.repeat(60));
  console.log('\n✨ Server is running! Press Ctrl+C to stop\n');

  // Keep server running
  await new Promise(() => {});
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
