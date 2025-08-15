import { setupDatabase } from './database.js';

async function main() {
  console.log('🎧 Event Listeners Example');
  console.log('==========================\n');

  const database = await setupDatabase();

  const users = await database.createResource({
    name: 'users',
    attributes: {
      name: 'string|required',
      email: 'string|required',
      status: 'string|default:active'
    },
    timestamps: true,
    events: {
      // Single event listener
      insert: (event) => {
        console.log('📝 User created:', {
          id: event.id,
          name: event.name,
          timestamp: new Date().toISOString()
        });
      },

      // Multiple event listeners for update
      update: [
        (event) => {
          console.log('⚠️  Update detected for user:', event.id);
        },
        (event) => {
          const changes = [];
          if (event.$before.name !== event.$after.name) {
            changes.push(`name: ${event.$before.name} → ${event.$after.name}`);
          }
          if (event.$before.email !== event.$after.email) {
            changes.push(`email: ${event.$before.email} → ${event.$after.email}`);
          }
          if (changes.length > 0) {
            console.log('📝 Changes:', changes.join(', '));
          }
        }
      ],

      // Delete event listener
      delete: (event) => {
        console.log('🗑️  User deleted:', {
          id: event.id,
          name: event.name || 'unknown',
          timestamp: new Date().toISOString()
        });
      },

      // Bulk operations
      insertMany: (count) => {
        console.log(`📦 Bulk insert: ${count} users created`);
      },

      deleteMany: (count) => {
        console.log(`🗑️  Bulk delete: ${count} users deleted`);
      },

      // List operations
      list: (result) => {
        console.log(`📋 List operation: ${result.count} users returned, ${result.errors} errors`);
      },

      count: (total) => {
        console.log(`🔢 Count operation: ${total} users total`);
      }
    }
  });

  console.log('1. Creating users...\n');

  // This will trigger the 'insert' event listener
  const user1 = await users.insert({
    name: 'John Doe',
    email: 'john@example.com'
  });

  const user2 = await users.insert({
    name: 'Jane Smith',
    email: 'jane@example.com'
  });

  console.log('\n2. Updating user...\n');

  // This will trigger the 'update' event listeners
  await users.update(user1.id, {
    name: 'John Updated',
    email: 'john.updated@example.com'
  });

  console.log('\n3. Listing users...\n');

  // This will trigger the 'list' event listener
  await users.list();

  console.log('\n4. Counting users...\n');

  // This will trigger the 'count' event listener
  await users.count();

  console.log('\n5. Bulk operations...\n');

  const bulkUsers = [
    { name: 'User 3', email: 'user3@example.com' },
    { name: 'User 4', email: 'user4@example.com' },
    { name: 'User 5', email: 'user5@example.com' }
  ];

  // This will trigger the 'insertMany' event listener
  await users.insertMany(bulkUsers);

  console.log('\n6. Deleting user...\n');

  // This will trigger the 'delete' event listener
  await users.delete(user1.id);

  console.log('\n7. Cleaning up (bulk delete)...\n');

  // This will trigger the 'deleteMany' event listener
  const allIds = await users.listIds();
  if (allIds.length > 0) {
    await users.deleteMany(allIds);
  }

  console.log('\n✅ Event listeners example completed!');
  console.log('All operations were logged by the event listeners.');
}

main().catch(console.error); 