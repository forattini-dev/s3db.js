/**
 * Test new Identity Plugin resources configuration
 */

import { IdentityPlugin } from './src/plugins/identity/index.js';

console.log('=== Testing new Identity Plugin resources config ===\n');

// Test 1: Valid config with all resources
console.log('TEST 1: Valid config with all resources');
try {
  const identityPlugin = new IdentityPlugin({
    port: 4000,
    issuer: 'http://localhost:4000',

    resources: {
      users: {
        name: 'app_users',
        attributes: {
          companyId: 'string|default:default-company',
          department: 'string|default:engineering'
        }
      },
      tenants: {
        name: 'organizations',
        attributes: {
          plan: 'string|default:free',
          maxUsers: 'number|default:10'
        }
      },
      clients: {
        name: 'oauth_apps',
        attributes: {
          logoUrl: 'string|default:https://placeholder.com/logo.png'
        }
      }
    }
  });

  console.log('✅ PASSED: Plugin created successfully');
  console.log(`   Users resource: ${identityPlugin.config.resources.users.name}`);
  console.log(`   Tenants resource: ${identityPlugin.config.resources.tenants.name}`);
  console.log(`   Clients resource: ${identityPlugin.config.resources.clients.name}\n`);
} catch (error) {
  console.error('❌ FAILED:', error.message, '\n');
  process.exit(1);
}

// Test 2: Missing resources config (should fail)
console.log('TEST 2: Missing resources config (should fail)');
try {
  new IdentityPlugin({
    port: 4000,
    issuer: 'http://localhost:4000'
  });
  console.error('❌ FAILED: Should have thrown error\n');
  process.exit(1);
} catch (error) {
  console.log('✅ PASSED: Correctly rejected missing resources');
  console.log(`   Error: ${error.message.split('\n')[0]}\n`);
}

// Test 3: Optional field without default (should fail)
console.log('TEST 3: Optional field without default (should fail)');
try {
  new IdentityPlugin({
    port: 4000,
    issuer: 'http://localhost:4000',
    resources: {
      users: {
        name: 'users',
        attributes: {
          badField: 'string|optional'  // Missing default!
        }
      },
      tenants: { name: 'tenants' },
      clients: { name: 'clients' }
    }
  });
  console.error('❌ FAILED: Should have thrown error\n');
  process.exit(1);
} catch (error) {
  console.log('✅ PASSED: Correctly rejected optional without default');
  console.log(`   Error: ${error.message.split('\n')[1]}\n`);
}

// Test 4: Trying to override base attribute (should fail)
console.log('TEST 4: Overriding base attribute (should fail)');
try {
  new IdentityPlugin({
    port: 4000,
    issuer: 'http://localhost:4000',
    resources: {
      users: {
        name: 'users',
        attributes: {
          email: 'string'  // Trying to override base field!
        }
      },
      tenants: { name: 'tenants' },
      clients: { name: 'clients' }
    }
  });
  console.error('❌ FAILED: Should have thrown error\n');
  process.exit(1);
} catch (error) {
  console.log('✅ PASSED: Correctly rejected base attribute override');
  console.log(`   Error: ${error.message.split('\n')[1]}\n`);
}

console.log('🎉 All validation tests passed!\n');
console.log('Summary:');
console.log('  ✓ Valid config works');
console.log('  ✓ Missing resources detected');
console.log('  ✓ Optional without default rejected');
console.log('  ✓ Base attribute override rejected');
console.log('\nThe new Identity Plugin resources config is working correctly! 🚀\n');
