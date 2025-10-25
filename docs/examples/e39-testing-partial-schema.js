/**
 * Partial Schema Testing Example
 *
 * This example shows how to test specific features without requiring
 * complete production schemas, using strictValidation: false.
 *
 * Perfect for:
 * - Unit testing individual features
 * - Testing plugin functionality in isolation
 * - Rapid prototyping and experimentation
 * - Integration tests with mock data
 */

import { Database } from '../../src/database.class.js';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/eventual-consistency.plugin.js';

async function testWithFullSchema() {
  console.log('=== Test 1: Full Production Schema (strictValidation: true) ===\n');

  const db = new Database({
    bucket: 'test-full-schema',
    region: 'us-east-1',
    strictValidation: true,  // ✅ Default: Strict validation enabled
    plugins: [
      new EventualConsistencyPlugin({
        resources: {
          urls: {
            fields: {
              views: { type: 'counter' },
              clicks: { type: 'counter' }
            }
          }
        }
      })
    ]
  });

  await db.connect();

  try {
    // This will FAIL because plugin creates partitions that reference
    // fields not in this minimal schema
    await db.createResource({
      name: 'urls',
      attributes: {
        id: 'string|required',
        views: 'number|default:0',
        clicks: 'number|default:0'
        // ❌ Missing fields: urlId, utmSource, etc. used by plugin partitions
      }
    });

    console.log('✓ Resource created (unexpected!)');
  } catch (error) {
    console.log('❌ Resource creation failed (expected):');
    console.log(`   ${error.message}\n`);

    if (error.description) {
      console.log('   Error description:');
      error.description.split('\n').forEach(line => {
        console.log(`   ${line}`);
      });
    }
  }

  await db.disconnect();
  console.log('\n' + '='.repeat(60) + '\n');
}

async function testWithPartialSchema() {
  console.log('=== Test 2: Partial Schema (strictValidation: false) ===\n');

  const db = new Database({
    bucket: 'test-partial-schema',
    region: 'us-east-1',
    strictValidation: false,  // ✅ Disable validation for testing
    plugins: [
      new EventualConsistencyPlugin({
        resources: {
          urls: {
            fields: {
              views: { type: 'counter' },
              clicks: { type: 'counter' }
            }
          }
        },
        verbose: true
      })
    ]
  });

  await db.connect();

  console.log('Creating resource with MINIMAL schema...');

  // This will SUCCEED with strictValidation: false
  const urls = await db.createResource({
    name: 'urls',
    attributes: {
      id: 'string|required',
      views: 'number|default:0',
      clicks: 'number|default:0'
      // ✅ Missing partition fields - but that's OK for testing!
    }
  });

  console.log('✓ Resource created successfully\n');

  console.log('Testing counter operations...');

  // Test the actual functionality we care about
  await urls.add('url1', 1, { field: 'views' });
  await urls.add('url1', 1, { field: 'clicks' });
  await urls.add('url1', 5, { field: 'views' });

  console.log('✓ Counter operations completed\n');

  console.log('Checking final values...');
  const url1 = await urls.get('url1');
  console.log(`   URL: ${url1.id}`);
  console.log(`   Views: ${url1.views}`);
  console.log(`   Clicks: ${url1.clicks}\n`);

  console.log('✓ Test passed - Plugin works with partial schema!');

  await db.disconnect();
  console.log('\n' + '='.repeat(60) + '\n');
}

async function testJestPattern() {
  console.log('=== Test 3: Jest/Vitest Testing Pattern ===\n');

  console.log('Example test structure for plugin testing:\n');

  console.log(`
describe('EventualConsistency Plugin', () => {
  let db, resource;

  beforeEach(async () => {
    // Setup with strictValidation: false
    db = new Database({
      bucket: 'test-bucket',
      strictValidation: false,  // ✅ Key for testing
      plugins: [
        new EventualConsistencyPlugin({
          resources: {
            products: {
              fields: {
                stock: { type: 'counter' }
              }
            }
          }
        })
      ]
    });

    await db.connect();

    // Minimal schema - just what we're testing
    resource = await db.createResource({
      name: 'products',
      attributes: {
        id: 'string|required',
        stock: 'number|default:0'
      }
    });
  });

  afterEach(async () => {
    await db.disconnect();
  });

  it('should increment stock', async () => {
    await resource.add('prod1', 10, { field: 'stock' });
    const product = await resource.get('prod1');
    expect(product.stock).toBe(10);
  });

  it('should decrement stock', async () => {
    await resource.add('prod1', 10, { field: 'stock' });
    await resource.sub('prod1', 3, { field: 'stock' });
    const product = await resource.get('prod1');
    expect(product.stock).toBe(7);
  });

  it('should handle multiple operations', async () => {
    await resource.add('prod1', 100, { field: 'stock' });
    await resource.sub('prod1', 20, { field: 'stock' });
    await resource.add('prod1', 5, { field: 'stock' });

    const product = await resource.get('prod1');
    expect(product.stock).toBe(85); // 100 - 20 + 5
  });
});
  `);

  console.log('Benefits of this pattern:');
  console.log('  ✓ Fast test execution (no complex setup)');
  console.log('  ✓ Focused on specific functionality');
  console.log('  ✓ Easy to understand and maintain');
  console.log('  ✓ No production schema dependencies');
  console.log('\n' + '='.repeat(60) + '\n');
}

async function main() {
  console.log('\n🧪 Partial Schema Testing Examples\n');
  console.log('This demo shows the difference between strict and relaxed validation\n');

  await testWithFullSchema();
  await testWithPartialSchema();
  await testJestPattern();

  console.log('Key Takeaways:');
  console.log('  1. strictValidation: true  → Production (enforces all rules)');
  console.log('  2. strictValidation: false → Testing (relaxed validation)');
  console.log('  3. Use partial schemas to test specific features');
  console.log('  4. Check error.description for detailed diagnostics');
  console.log('  5. Perfect for unit and integration testing\n');

  console.log('✓ All examples complete!');
}

main().catch(error => {
  console.error('Example failed:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
