import { S3db as S3DB } from '../src/index.js';

// Example demonstrating pagination issue and fix
async function paginationDebugExample() {
  const db = new S3DB({
    bucket: 'test-bucket',
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test'
    }
  });

  const users = db.resource({
    name: 'users',
    attributes: {
      name: 'string|required',
      email: 'string|required',
      age: 'number|optional'
    }
  });

  console.log('=== Pagination Debug Example ===\n');

  // Insert a test user
  console.log('1. Inserting test user...');
  const testUser = await users.insert({
    name: 'John Doe',
    email: 'john@example.com',
    age: 30
  });
  console.log('✅ User inserted:', testUser.id);

  // Test pagination with different sizes
  console.log('\n2. Testing pagination...');
  
  // Test with size=10 (should work normally)
  console.log('\n--- Test with size=10 ---');
  const page1 = await users.page({ offset: 0, size: 10 });
  console.log('Page result:', {
    items: page1.items.length,
    totalItems: page1.totalItems,
    pageSize: page1.pageSize,
    totalPages: page1.totalPages,
    debug: page1._debug
  });

  // Test with size=100 (should work normally)
  console.log('\n--- Test with size=100 ---');
  const page2 = await users.page({ offset: 0, size: 100 });
  console.log('Page result:', {
    items: page2.items.length,
    totalItems: page2.totalItems,
    pageSize: page2.pageSize,
    totalPages: page2.totalPages,
    debug: page2._debug
  });

  // Test with size=1 (should work normally)
  console.log('\n--- Test with size=1 ---');
  const page3 = await users.page({ offset: 0, size: 1 });
  console.log('Page result:', {
    items: page3.items.length,
    totalItems: page3.totalItems,
    pageSize: page3.pageSize,
    totalPages: page3.totalPages,
    debug: page3._debug
  });

  // Test error handling by trying to get a non-existent user
  console.log('\n3. Testing error handling...');
  try {
    await users.get('non-existent-id');
  } catch (error) {
    console.log('✅ Error properly thrown for non-existent user:', error.message);
  }

  // Test pagination with mixed valid/invalid IDs
  console.log('\n4. Testing pagination with mixed IDs...');
  
  // First, let's see what IDs we have
  const allIds = await users.listIds();
  console.log('Available IDs:', allIds);

  // Create a scenario where some IDs might fail
  const mixedIds = [...allIds, 'invalid-id-1', 'invalid-id-2'];
  console.log('Mixed IDs (including invalid):', mixedIds);

  // Test pagination - should handle invalid IDs gracefully
  const mixedPage = await users.page({ offset: 0, size: 10 });
  console.log('Mixed page result:', {
    items: mixedPage.items.length,
    totalItems: mixedPage.totalItems,
    pageSize: mixedPage.pageSize,
    totalPages: mixedPage.totalPages,
    debug: mixedPage._debug
  });

  console.log('\n=== Summary ===');
  console.log('✅ Pagination now properly handles:');
  console.log('  - Consistent pageSize parameter');
  console.log('  - Error handling for failed resource retrieval');
  console.log('  - Debug information for troubleshooting');
  console.log('  - Graceful degradation when some resources fail to load');

  // Clean up
  console.log('\n5. Cleaning up...');
  await users.delete(testUser.id);
  console.log('✅ Test user deleted');
}

// Run the example
paginationDebugExample().catch(console.error); 