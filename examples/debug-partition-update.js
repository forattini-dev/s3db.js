import { Database } from '../src/index.js';
import { setupDatabase, teardownDatabase } from './database.js';

async function debugPartitionUpdate() {
  console.log('🔍 Debugging partition reference update...\n');

  const db = new Database({
    connectionString: 's3://test-bucket'
  });

  // Create a resource with partition
  await db.createResource({
    name: 'debug_users',
    behavior: 'user-management',
    attributes: {
      name: 'string|required|max:100',
      email: 'email|required|unique',
      address: {
        country: 'string|required|max:2',
        state: 'string|required|max:50'
      }  await teardownDatabase();

    },
    timestamps: true,
    partitions: {
      byCountry: {
        fields: {
          'address.country': 'string|maxlength:2'
        }
      }
    }
  });

  const users = db.resources.debug_users;

  console.log('📝 Step 1: Insert user with country BR');
  
  const userData = {
    name: 'João Silva',
    email: 'joao@example.com',
    address: {
      country: 'BR',
      state: 'SP'
    }
  };

  const insertedUser = await users.insert(userData);
  console.log('✅ Inserted user:', {
    id: insertedUser.id,
    country: insertedUser.address.country
  });

  // Check partition references
  console.log('\n🔍 Step 2: Check initial partition references');
  
  const usersInBR = await users.list({ partition: 'byCountry', partitionValues: { 'address.country': 'BR' } });
  console.log('Users in BR partition:', usersInBR.length);
  if (usersInBR.length > 0) {
    console.log('First user in BR:', usersInBR[0].address.country);
  }

  console.log('\n🔄 Step 3: Update user to country US');
  
  const updatedUser = await users.update(insertedUser.id, {
    address: {
      country: 'US',
      state: 'CA'
    }
  });

  console.log('✅ Updated user:', {
    id: updatedUser.id,
    country: updatedUser.address.country
  });

  console.log('\n🔍 Step 4: Check partition references after update');
  
  const usersInBRAfterUpdate = await users.list({ partition: 'byCountry', partitionValues: { 'address.country': 'BR' } });
  console.log('Users in BR partition after update:', usersInBRAfterUpdate.length);
  
  const usersInUS = await users.list({ partition: 'byCountry', partitionValues: { 'address.country': 'US' } });
  console.log('Users in US partition after update:', usersInUS.length);
  
  if (usersInUS.length > 0) {
    console.log('First user in US:', usersInUS[0].address.country);
  }

  console.log('\n🎉 Debug completed!');
}

debugPartitionUpdate().catch(console.error); 