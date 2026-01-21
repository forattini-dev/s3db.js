import { setupDatabase } from './database.js';

// Example using uuid package for custom ID generation
import { v4 as uuidv4, v1 as uuidv1 } from 'uuid';

const main = async () => {
  console.log('🚀 Starting Custom ID Generators Example...\n');

  const s3db = await setupDatabase();

  try {
    // Example 1: Using uuid v4 as custom ID generator
    console.log('📝 Example 1: Using UUID v4 as custom ID generator');
    await s3db.createResource({
      name: 'uuid-users',
      attributes: {
        name: 'string|required',
        email: 'string|required',
        createdAt: 'string|optional'
      },
      idGenerator: uuidv4 // Pass the uuid function directly
    });

    const uuidUsers = s3db.resources.uuid-users;

    const user1 = await uuidUsers.insert({
      name: 'John UUID',
      email: 'john.uuid@example.com'
    });
    console.log('✅ User with UUID v4:', user1.id);
    console.log('   UUID format check:', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user1.id));
    console.log();

    // Example 2: Using uuid v1 as custom ID generator
    console.log('📝 Example 2: Using UUID v1 as custom ID generator');
    await s3db.createResource({
      name: 'uuidv1-users',
      attributes: {
        name: 'string|required',
        email: 'string|required'
      },
      idGenerator: uuidv1 // Pass the uuid v1 function
    });

    const uuidv1Users = s3db.resources.uuidv1-users;

    const user2 = await uuidv1Users.insert({
      name: 'Jane UUID v1',
      email: 'jane.uuidv1@example.com'
    });
    console.log('✅ User with UUID v1:', user2.id);
    console.log('   UUID format check:', /^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user2.id));
    console.log();

    // Example 3: Using custom ID size (shorter IDs)
    console.log('📝 Example 3: Using custom ID size (8 characters)');
    await s3db.createResource({
      name: 'short-id-users',
      attributes: {
        name: 'string|required',
        email: 'string|required'
      },
      idSize: 8 // Generate 8-character IDs
    });

    const shortIdUsers = s3db.resources.short-id-users;

    const user3 = await shortIdUsers.insert({
      name: 'Bob Short ID',
      email: 'bob.short@example.com'
    });
    console.log('✅ User with short ID:', user3.id);
    console.log('   ID length:', user3.id.length);
    console.log();

    // Example 4: Using custom ID size (longer IDs)
    console.log('📝 Example 4: Using custom ID size (32 characters)');
    await s3db.createResource({
      name: 'long-id-users',
      attributes: {
        name: 'string|required',
        email: 'string|required'
      },
      idSize: 32 // Generate 32-character IDs
    });

    const longIdUsers = s3db.resources.long-id-users;

    const user4 = await longIdUsers.insert({
      name: 'Alice Long ID',
      email: 'alice.long@example.com'
    });
    console.log('✅ User with long ID:', user4.id);
    console.log('   ID length:', user4.id.length);
    console.log();

    // Example 5: Using custom function with timestamp
    console.log('📝 Example 5: Using custom function with timestamp');
    await s3db.createResource({
      name: 'timestamp-users',
      attributes: {
        name: 'string|required',
        email: 'string|required'
      },
      idGenerator: () => `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    });

    const timestampUsers = s3db.resources.timestamp-users;

    const user5 = await timestampUsers.insert({
      name: 'Tim Timestamp',
      email: 'tim.timestamp@example.com'
    });
    console.log('✅ User with timestamp ID:', user5.id);
    console.log('   ID format check:', /^user_\d+_[a-z0-9]{5}$/.test(user5.id));
    console.log();

    // Example 6: Using custom function with prefix
    console.log('📝 Example 6: Using custom function with prefix');
    await s3db.createResource({
      name: 'prefix-users',
      attributes: {
        name: 'string|required',
        email: 'string|required'
      },
      idGenerator: () => `CUSTOM_${Math.random().toString(36).substr(2, 10).toUpperCase()}`
    });

    const prefixUsers = s3db.resources.prefix-users;

    const user6 = await prefixUsers.insert({
      name: 'Pat Prefix',
      email: 'pat.prefix@example.com'
    });
    console.log('✅ User with prefix ID:', user6.id);
    console.log('   ID format check:', /^CUSTOM_[A-Z0-9]{10}$/.test(user6.id));
    console.log();

    // Example 7: Using idGenerator as number (size)
    console.log('📝 Example 7: Using idGenerator as number (size)');
    await s3db.createResource({
      name: 'number-size-users',
      attributes: {
        name: 'string|required',
        email: 'string|required'
      },
      idGenerator: 16 // Same as idSize: 16
    });

    const numberSizeUsers = s3db.resources.number-size-users;

    const user7 = await numberSizeUsers.insert({
      name: 'Num Size',
      email: 'num.size@example.com'
    });
    console.log('✅ User with number size ID:', user7.id);
    console.log('   ID length:', user7.id.length);
    console.log();

    // Example 8: Default behavior (22 characters)
    console.log('📝 Example 8: Default behavior (22 characters)');
    await s3db.createResource({
      name: 'default-users',
      attributes: {
        name: 'string|required',
        email: 'string|required'
      }
      // No idGenerator or idSize specified - uses default 22 characters
    });

    const defaultUsers = s3db.resources.default-users;

    const user8 = await defaultUsers.insert({
      name: 'Default User',
      email: 'default@example.com'
    });
    console.log('✅ User with default ID:', user8.id);
    console.log('   ID length:', user8.id.length);
    console.log();

    // Example 9: Bulk insert with custom ID generator
    console.log('📝 Example 9: Bulk insert with custom ID generator');
    const bulkUsers = [
      { name: 'Bulk User 1', email: 'bulk1@example.com' },
      { name: 'Bulk User 2', email: 'bulk2@example.com' },
      { name: 'Bulk User 3', email: 'bulk3@example.com' }
    ];

    const bulkResults = await uuidUsers.insertMany(bulkUsers);
    console.log('✅ Bulk inserted users:');
    bulkResults.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.name} - ID: ${user.id}`);
    });
    console.log();

    // Example 10: Comparison of different ID generators
    console.log('📝 Example 10: Comparison of different ID generators');
    const generators = [
      { name: 'Default (22 chars)', resource: defaultUsers },
      { name: 'Short (8 chars)', resource: shortIdUsers },
      { name: 'Long (32 chars)', resource: longIdUsers },
      { name: 'UUID v4', resource: uuidUsers },
      { name: 'Timestamp', resource: timestampUsers }
    ];

    for (const gen of generators) {
      const testUser = await gen.resource.insert({
        name: `Test ${gen.name}`,
        email: `test.${gen.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`
      });
      console.log(`   ${gen.name}: ${testUser.id} (${testUser.id.length} chars)`);
    }
    console.log();

    console.log('🎉 All examples completed successfully!');
    console.log('\n📊 Summary:');
    console.log('- UUID v4: Standard UUID format with 36 characters');
    console.log('- UUID v1: Time-based UUID format with 36 characters');
    console.log('- Custom size: Configurable length using the built-in generator');
    console.log('- Custom function: Any function that returns a string');
    console.log('- Default: 22-character built-in ID');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
};

main().catch(console.error); 
