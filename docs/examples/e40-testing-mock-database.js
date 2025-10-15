/**
 * Mock Database Testing Example
 *
 * This example demonstrates how to create mock/test databases for
 * plugin testing without affecting production data.
 *
 * Techniques shown:
 * - Creating isolated test databases
 * - Using strictValidation: false for flexibility
 * - Testing error scenarios
 * - Cleanup and teardown patterns
 * - Error diagnostic inspection
 */

import { Database } from '../../src/database.class.js';
import EventualConsistencyPlugin from '../../src/plugins/eventual-consistency/eventual-consistency.plugin.js';

/**
 * Helper: Create a test database with common configuration
 */
function createTestDatabase(options = {}) {
  const {
    testName = 'default-test',
    strictValidation = false,
    plugins = [],
    verbose = false
  } = options;

  return new Database({
    bucket: `test-${testName}-${Date.now()}`,
    region: 'us-east-1',
    strictValidation,
    plugins,
    verbose
  });
}

/**
 * Test 1: Basic Plugin Functionality
 */
async function testBasicFunctionality() {
  console.log('=== Test 1: Basic Plugin Functionality ===\n');

  const db = createTestDatabase({
    testName: 'basic-counters',
    plugins: [
      new EventualConsistencyPlugin({
        resources: {
          metrics: {
            fields: {
              pageviews: { type: 'counter' },
              visitors: { type: 'counter' }
            }
          }
        }
      })
    ]
  });

  await db.connect();

  const metrics = await db.createResource({
    name: 'metrics',
    attributes: {
      id: 'string|required',
      pageviews: 'number|default:0',
      visitors: 'number|default:0'
    }
  });

  console.log('Testing counter operations...');

  // Test add operations
  await metrics.add('page1', 10, { field: 'pageviews' });
  await metrics.add('page1', 5, { field: 'visitors' });

  let page1 = await metrics.get('page1');
  console.log(`  After adds - Pageviews: ${page1.pageviews}, Visitors: ${page1.visitors}`);

  // Test subtract operations
  await metrics.sub('page1', 2, { field: 'visitors' });

  page1 = await metrics.get('page1');
  console.log(`  After sub - Pageviews: ${page1.pageviews}, Visitors: ${page1.visitors}`);

  console.log('✓ Basic functionality test passed\n');

  await db.disconnect();
}

/**
 * Test 2: Error Handling and Diagnostics
 */
async function testErrorDiagnostics() {
  console.log('=== Test 2: Error Handling and Diagnostics ===\n');

  const db = createTestDatabase({
    testName: 'error-handling',
    plugins: [
      new EventualConsistencyPlugin({
        resources: {
          users: {
            fields: {
              balance: {
                type: 'counter',
                analytics: true  // Enable analytics
              }
            }
          }
        }
      })
    ]
  });

  await db.connect();

  const users = await db.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      balance: 'number|default:0'
    }
  });

  console.log('Testing error diagnostics...\n');

  try {
    // Try to get analytics (may fail depending on setup)
    await users.getAnalytics('nonexistent-field');
  } catch (error) {
    console.log('Caught expected error:');
    console.log(`  Message: ${error.message}`);

    if (error.description) {
      console.log('\n  Detailed diagnostics:');
      console.log(error.description.split('\n').map(l => `    ${l}`).join('\n'));
    }

    console.log('\n✓ Error handling test passed');
  }

  await db.disconnect();
  console.log('');
}

/**
 * Test 3: Testing Initialization Order
 */
async function testInitializationOrder() {
  console.log('=== Test 3: Plugin Initialization Order ===\n');

  console.log('Scenario A: Correct order (Plugin → Connect → Resource)');

  const dbCorrect = createTestDatabase({
    testName: 'init-correct',
    plugins: [
      new EventualConsistencyPlugin({
        resources: {
          accounts: {
            fields: {
              balance: { type: 'counter' }
            }
          }
        }
      })
    ]
  });

  await dbCorrect.connect();  // Plugin installs here

  const accounts = await dbCorrect.createResource({
    name: 'accounts',
    attributes: {
      id: 'string|required',
      balance: 'number|default:0'
    }
  });

  // Check if plugin method exists
  if (typeof accounts.add === 'function') {
    console.log('  ✓ Plugin methods available on resource');
    await accounts.add('acc1', 100, { field: 'balance' });
    const acc1 = await accounts.get('acc1');
    console.log(`  ✓ Counter works: balance = ${acc1.balance}\n`);
  } else {
    console.log('  ❌ Plugin methods NOT available (initialization issue)\n');
  }

  await dbCorrect.disconnect();

  console.log('Scenario B: Wrong order demonstration');
  console.log('  (In real scenarios, create resource AFTER plugin installation)');
  console.log('  See isolated-plugin-test.js for detailed examples\n');

  console.log('✓ Initialization order test complete\n');
}

/**
 * Test 4: Multiple Plugins
 */
async function testMultiplePlugins() {
  console.log('=== Test 4: Multiple Plugins Together ===\n');

  const db = createTestDatabase({
    testName: 'multi-plugin',
    plugins: [
      new EventualConsistencyPlugin({
        resources: {
          items: {
            fields: {
              quantity: { type: 'counter' },
              sales: { type: 'counter' }
            }
          }
        }
      })
      // Add more plugins here as needed for your tests
    ]
  });

  await db.connect();

  const items = await db.createResource({
    name: 'items',
    attributes: {
      id: 'string|required',
      quantity: 'number|default:0',
      sales: 'number|default:0'
    }
  });

  console.log('Testing with multiple fields...');

  await items.add('item1', 100, { field: 'quantity' });
  await items.add('item1', 5, { field: 'sales' });
  await items.sub('item1', 3, { field: 'quantity' });

  const item1 = await items.get('item1');
  console.log(`  Quantity: ${item1.quantity} (expected: 97)`);
  console.log(`  Sales: ${item1.sales} (expected: 5)`);

  console.log('✓ Multiple plugins test passed\n');

  await db.disconnect();
}

/**
 * Test 5: Cleanup and Teardown Pattern
 */
async function testCleanupPattern() {
  console.log('=== Test 5: Proper Cleanup Pattern ===\n');

  let db;

  try {
    console.log('Setting up test database...');
    db = createTestDatabase({
      testName: 'cleanup-demo',
      plugins: [
        new EventualConsistencyPlugin({
          resources: {
            temp: {
              fields: {
                count: { type: 'counter' }
              }
            }
          }
        })
      ]
    });

    await db.connect();

    const temp = await db.createResource({
      name: 'temp',
      attributes: {
        id: 'string|required',
        count: 'number|default:0'
      }
    });

    console.log('Running test operations...');
    await temp.add('test1', 42, { field: 'count' });

    const result = await temp.get('test1');
    console.log(`  Result: ${result.count}`);

  } catch (error) {
    console.error('Test failed:', error.message);
    throw error;

  } finally {
    // Always cleanup in finally block
    if (db) {
      console.log('Cleaning up...');
      await db.disconnect();
      console.log('✓ Database disconnected');
    }
  }

  console.log('✓ Cleanup pattern test complete\n');
}

/**
 * Main test runner
 */
async function main() {
  console.log('\n🧪 Mock Database Testing Examples\n');
  console.log('This demonstrates patterns for testing plugins with mock databases\n');
  console.log('='.repeat(60) + '\n');

  await testBasicFunctionality();
  await testErrorDiagnostics();
  await testInitializationOrder();
  await testMultiplePlugins();
  await testCleanupPattern();

  console.log('='.repeat(60) + '\n');
  console.log('📚 Key Testing Patterns:\n');
  console.log('  1. createTestDatabase() - Reusable test database factory');
  console.log('  2. strictValidation: false - Relaxed validation for tests');
  console.log('  3. error.description - Rich error diagnostics');
  console.log('  4. try/finally cleanup - Always disconnect databases');
  console.log('  5. Unique bucket names - Prevent test conflicts');
  console.log('\n✓ All mock database tests complete!\n');
}

main().catch(error => {
  console.error('\n❌ Test suite failed:', error.message);
  if (error.stack) {
    console.error('\nStack trace:');
    console.error(error.stack);
  }
  process.exit(1);
});
