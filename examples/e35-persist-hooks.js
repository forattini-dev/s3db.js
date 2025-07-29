import dotenv from 'dotenv';
import { join } from 'path';
import S3db from '../src/index.js';

dotenv.config({ debug: false, silent: true });

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'persist-hooks-' + Date.now());

async function demonstratePersistHooks() {
  console.log('🔄 Demonstrating hook persistence functionality...');

  // 1. Create database with persistHooks enabled
  const db = new S3db({
    verbose: false,
    bucket: 's3db',
    accessKeyId: process.env.MINIO_USER,
    secretAccessKey: process.env.MINIO_PASSWORD,
    endpoint: 'http://localhost:9998',
    forcePathStyle: true,
    prefix: testPrefix,
    persistHooks: true // 🎯 Enable hook persistence
  });

  await db.connect();
  console.log('\n1. Creating resource with validation hooks...');

  const validationLog = [];
  
  const usersResource = await db.createResource({
    name: 'users',
    behavior: 'user-managed',
    timestamps: true,
    attributes: {
      name: 'string',
      email: 'string',
      age: 'number|optional'
    },
    hooks: {
      beforeInsert: [
        function validateEmail(user) {
          validationLog.push('Email validation executed');
          if (!user.email || !user.email.includes('@')) {
            throw new Error('❌ Invalid email format');
          }
          console.log('✅ Email validation passed for:', user.email);
          return user;
        },
        function validateAge(user) {
          validationLog.push('Age validation executed');
          if (user.age && user.age < 0) {
            throw new Error('❌ Age cannot be negative');
          }
          console.log('✅ Age validation passed');
          return user;
        }
      ],
      afterInsert: [
        function logActivity(user) {
          validationLog.push('Activity logging executed');
          console.log('📝 User activity logged for:', user.name);
          return user;
        }
      ]
    }
  });

  console.log('\n2. Testing hooks with valid user...');
  validationLog.length = 0;
  
  const validUser = {
    name: 'João Silva',
    email: 'joao@example.com',
    age: 30
  };

  const insertedUser = await usersResource.insert(validUser);
  console.log('🎉 User inserted successfully!');
  console.log('📊 Hooks executed:', validationLog.length);

  await db.disconnect();

  // 2. Reconnect to test hook persistence
  console.log('\n3. Reconnecting to test persisted hooks...');
  
  const db2 = new S3db({
    verbose: false,
    bucket: 's3db',
    accessKeyId: process.env.MINIO_USER,
    secretAccessKey: process.env.MINIO_PASSWORD,
    endpoint: 'http://localhost:9998',
    forcePathStyle: true,
    prefix: testPrefix,
    persistHooks: true // 🎯 Hooks will be restored from s3db.json
  });

  await db2.connect();
  const restoredUsersResource = db2.resource('users');

  console.log('\n4. Testing restored hooks with invalid email...');
  validationLog.length = 0;
  
  try {
    await restoredUsersResource.insert({
      name: 'Invalid User',
      email: 'invalid-email', // Missing @
      age: 25
    });
    console.log('❌ This should not happen - validation should fail');
  } catch (error) {
    console.log('✅ Hook validation worked:', error.message);
  }

  console.log('\n5. Testing restored hooks with valid user...');
  validationLog.length = 0;
  
  const validUser2 = {
    name: 'Maria Santos',
    email: 'maria@example.com',
    age: 28
  };

  await restoredUsersResource.insert(validUser2);
  console.log('🎉 User inserted with restored hooks!');
  console.log('📊 Hooks executed:', validationLog.length);

  await db2.disconnect();
  
  console.log('\n✨ Hook persistence demonstration completed!');
  console.log('💡 Key benefits:');
  console.log('   • Business logic is preserved across database connections');
  console.log('   • No need to redefine validation rules');
  console.log('   • Consistent behavior in distributed environments');
}

demonstratePersistHooks().catch(console.error); 