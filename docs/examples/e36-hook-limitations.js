import dotenv from 'dotenv';
import { join } from 'path';
import S3db from '../src/index.js';

dotenv.config({ debug: false, silent: true });

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'hook-limitations-' + Date.now());

// 🚨 HOOK PERSISTENCE LIMITATIONS

async function demonstrateHookLimitations() {
  console.log('🚨 Demonstrating hook persistence limitations...');

  const db = new S3db({
    verbose: false,
    bucket: 's3db',
    accessKeyId: process.env.MINIO_USER,
    secretAccessKey: process.env.MINIO_PASSWORD,
    endpoint: 'http://localhost:9100',
    forcePathStyle: true,
    prefix: testPrefix,
    persistHooks: true
  });

  await db.connect();

  // 🔴 PROBLEM 1: External variables
  console.log('\n1. 🔴 PROBLEM: Hooks with external variables');
  
  const ADMIN_EMAIL = 'admin@company.com';  // External variable
  const CONFIG = { maxRetries: 3 };         // External object

  try {
    await db.createResource({
      name: 'users_with_external_vars',
      behavior: 'user-managed',
      attributes: {
        name: 'string',
        email: 'string'
      },
      hooks: {
        beforeInsert: [
          function problematicHook(user) {
            // ❌ ADMIN_EMAIL and CONFIG will not exist after deserialization
            if (user.email === ADMIN_EMAIL) {
              console.log('Admin user detected!');
            }
            if (CONFIG.maxRetries > 0) {
              console.log('Retry logic enabled');
            }
            return user;
          }
        ]
      }
    });

    // Works on the first connection
    const resource1 = db.resources.users_with_external_vars;
    await resource1.insert({ name: 'Admin', email: ADMIN_EMAIL });
    console.log('✅ Worked on the first connection');

  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  await db.disconnect();

  // Reconnect - the hook will fail
  console.log('\n2. 🔄 Reconnecting...');
  const db2 = new S3db({
    verbose: false,
    bucket: 's3db',
    accessKeyId: process.env.MINIO_USER,
    secretAccessKey: process.env.MINIO_PASSWORD,
    endpoint: 'http://localhost:9100',
    forcePathStyle: true,
    prefix: testPrefix,
    persistHooks: true
  });

  await db2.connect();

  try {
    const resource2 = db2.resources.users_with_external_vars;
    await resource2.insert({ name: 'Test', email: 'test@company.com' });
    console.log('❌ This should not work without the external variables');
  } catch (error) {
    console.log('🚨 Hook failed after reconnection:', error.message);
  }

  await db2.disconnect();

  // 🟢 SOLUTION 1: Self-contained hooks
  console.log('\n3. 🟢 SOLUTION: Self-contained hooks');
  
  const db3 = new S3db({
    verbose: false,
    bucket: 's3db',
    accessKeyId: process.env.MINIO_USER,
    secretAccessKey: process.env.MINIO_PASSWORD,
    endpoint: 'http://localhost:9100',
    forcePathStyle: true,
    prefix: testPrefix + '-solutions',
    persistHooks: true
  });

  await db3.connect();

  await db3.createResource({
    name: 'users_self_contained',
    behavior: 'user-managed',
    attributes: {
      name: 'string',
      email: 'string',
      role: 'string|optional'
    },
    hooks: {
      beforeInsert: [
        function selfContainedHook(user) {
          // ✅ All constants are inside the function
          const ADMIN_EMAIL = 'admin@company.com';
          const ALLOWED_DOMAINS = ['company.com', 'contractor.com'];
          
          if (user.email === ADMIN_EMAIL) {
            user.role = 'admin';
            console.log('✅ Admin user detected and role set');
          }
          
          const domain = user.email.split('@')[1];
          if (!ALLOWED_DOMAINS.includes(domain)) {
            throw new Error(`Domain ${domain} not allowed`);
          }
          
          return user;
        }
      ]
    }
  });

  await db3.disconnect();

  // Test self-contained hook after reconnection
  const db4 = new S3db({
    verbose: false,
    bucket: 's3db',
    accessKeyId: process.env.MINIO_USER,
    secretAccessKey: process.env.MINIO_PASSWORD,
    endpoint: 'http://localhost:9100',
    forcePathStyle: true,
    prefix: testPrefix + '-solutions',
    persistHooks: true
  });

  await db4.connect();

  const resource4 = db4.resources.users_self_contained;
  
  try {
    const adminUser = await resource4.insert({ 
      name: 'Admin', 
      email: 'admin@company.com' 
    });
    console.log('✅ Self-contained hook worked:', adminUser.role);
    
    await resource4.insert({ 
      name: 'Employee', 
      email: 'john@company.com' 
    });
    console.log('✅ Domain validation worked');
    
  } catch (error) {
    console.log('❌ Unexpected error:', error.message);
  }

  await db4.disconnect();

  // 🔴 PROBLEM 2: References to other resources
  console.log('\n4. 🔴 PROBLEM: References to other resources');
  
  const db5 = new S3db({
    verbose: false,
    bucket: 's3db',
    accessKeyId: process.env.MINIO_USER,
    secretAccessKey: process.env.MINIO_PASSWORD,
    endpoint: 'http://localhost:9100',
    forcePathStyle: true,
    prefix: testPrefix + '-cross-ref',
    persistHooks: true
  });

  await db5.connect();

  // First, create config resource
  const configResource = await db5.createResource({
    name: 'config',
    behavior: 'user-managed',
    attributes: {
      key: 'string',
      value: 'string'
    }
  });

  await configResource.insert({ key: 'max_users', value: '100' });

  // ❌ PROBLEMATIC: Hook referencing another resource
  console.log('⚠️  Creating hook that references another resource (problematic)...');
  
  await db5.createResource({
    name: 'users_with_cross_ref',
    behavior: 'user-managed',
    attributes: {
      name: 'string',
      email: 'string'
    },
    hooks: {
      beforeInsert: [
        function problematicCrossRefHook(user) {
          // ❌ 'this' will not be the same after deserialization
          // ❌ 'configResource' does not exist in scope
          
          // This code fails after reconnection
          try {
            const maxUsers = this.database.resources.config;
            console.log('Checking user limit...');
          } catch (error) {
            console.log('❌ Cross-reference failed:', error.message);
          }
          
          return user;
        }
      ]
    }
  });

  await db5.disconnect();

  console.log('\n✨ Summary of limitations:');
  console.log('🔴 External variables: Not serialized');
  console.log('🔴 Closures: Captured scope is lost');
  console.log("🔴 References to resources: 'this' context may be lost");
  console.log('🔴 Imported modules: Not automatically re-imported');
  
  console.log('\n💡 Best practices:');
  console.log('✅ Keep hooks self-contained');
  console.log('✅ Define constants inside the function');
  console.log('✅ Use simple and direct validations');
  console.log('✅ Avoid external dependencies');
  console.log('✅ Use only basic JavaScript types');
}

demonstrateHookLimitations().catch(console.error); 