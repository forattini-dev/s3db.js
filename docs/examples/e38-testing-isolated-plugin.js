/**
 * Isolated Plugin Testing Example
 *
 * This example demonstrates how to test plugins in isolation without
 * requiring full schema definitions or complex setup.
 *
 * Key techniques:
 * - Using strictValidation: false for partial schemas
 * - Testing single plugin features independently
 * - Minimal resource configuration
 * - Clean test isolation
 */

import { Database } from '../../src/database.class.js';
import EventualConsistencyPlugin from '../../src/plugins/eventual-consistency/eventual-consistency.plugin.js';

async function main() {
  console.log('=== Isolated Plugin Testing Demo ===\n');

  // Create database with strict validation disabled
  // This allows testing with simplified schemas
  const db = new Database({
    bucket: 'test-isolated-plugin',
    region: 'us-east-1',
    strictValidation: false,  // ✅ Key: Skip partition validation
    plugins: [
      new EventualConsistencyPlugin({
        resources: {
          wallets: {
            fields: {
              balance: {
                type: 'counter',
                analytics: true
              }
            }
          }
        },
        verbose: true
      })
    ]
  });

  await db.connect();

  console.log('1. Creating resource with MINIMAL schema');
  console.log('   (Missing partition fields normally required by plugin)\n');

  // Create resource with minimal schema
  // The plugin creates partitions internally, but we don't need to
  // define those fields in our test schema
  const wallets = await db.createResource({
    name: 'wallets',
    attributes: {
      id: 'string|required',
      balance: 'number|default:0'
      // ✅ Missing fields like 'urlId', 'region', etc.
      // ✅ strictValidation: false allows this
    }
  });

  console.log('2. Testing counter functionality');

  // Test basic counter operations
  await wallets.add('user1', 100);
  console.log('   Added 100 to user1 wallet');

  await wallets.add('user1', 50);
  console.log('   Added 50 to user1 wallet');

  await wallets.sub('user1', 30);
  console.log('   Subtracted 30 from user1 wallet');

  const user1 = await wallets.get('user1');
  console.log(`   Final balance: ${user1.balance}\n`);

  console.log('3. Testing analytics (if enabled)');

  try {
    // Note: Analytics may not work perfectly without full schema
    // but we can still test the basic functionality
    const analytics = await wallets.getLastNDays('balance', 7, { fillGaps: true });
    console.log(`   Retrieved ${analytics.length} days of analytics`);
    console.log(`   First day: ${JSON.stringify(analytics[0])}`);
  } catch (error) {
    console.log(`   Analytics error (expected): ${error.message}`);
    if (error.description) {
      console.log('\n   Error details:');
      console.log(error.description.split('\n').map(line => `   ${line}`).join('\n'));
    }
  }

  console.log('\n4. Testing transaction consolidation');

  // Wait a moment for consolidation
  await new Promise(resolve => setTimeout(resolve, 2000));

  const consolidated = await wallets.get('user1');
  console.log(`   Consolidated balance: ${consolidated.balance}`);
  console.log(`   Expected: 120 (100 + 50 - 30)`);

  await db.disconnect();
  console.log('\n✓ Isolated plugin test complete!');
  console.log('\nKey Takeaways:');
  console.log('  • strictValidation: false enables testing with partial schemas');
  console.log('  • You can test core plugin features without full production schema');
  console.log('  • Errors include helpful diagnostics in error.description');
  console.log('  • Perfect for unit testing individual plugin capabilities');
}

main().catch(error => {
  console.error('Test failed:', error.message);
  if (error.description) {
    console.error('\nError description:');
    console.error(error.description);
  }
  process.exit(1);
});
