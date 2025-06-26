#!/usr/bin/env node

/**
 * s3db.js Advanced Versioning & Hooks Example
 * 
 * This example demonstrates the new advanced features:
 * 1. Versioned resource definitions with proper schema evolution
 * 2. Hook system (preInsert, afterInsert, preUpdate, afterUpdate, preDelete, afterDelete)
 * 3. Automatic partition management through hooks
 * 4. Correct version-based unmapping
 * 5. New s3db.json structure with versions and partitions
 */

import { Database } from '../src/index.js';

const connectionString = process.env.BUCKET_CONNECTION_STRING || 's3://localhost:9000/test?accessKeyId=minioadmin&secretAccessKey=minioadmin&forcePathStyle=true';

async function main() {
  console.log('🏗️ s3db.js Advanced Versioning & Hooks Demo\n');

  const db = new Database({
    verbose: true,
    connectionString: connectionString + '/advanced-demo'
  });

  // Listen for resource definition changes
  db.on('resourceDefinitionsChanged', (event) => {
    console.log('📋 Resource definitions changed:');
    event.changes.forEach(change => {
      console.log(`  - ${change.type}: ${change.resourceName} (${change.fromVersion || 'new'} → ${change.toVersion || 'deleted'})`);
    });
  });

  await db.connect();

  // =====================================================
  // 1. Create Resource with Versioning & Hooks
  // =====================================================
  console.log('1. Creating resource with versioning and hooks...');

  const users = await db.createResource({
    name: 'users',
    attributes: {
      name: 'string',
      email: 'string',
      region: 'string',
      status: 'string'
    },
    options: {
      timestamps: true, // Adds automatic timestamp partitions
      partitionRules: {
        region: 'string|maxlength:2',
        status: 'string'
        // createdAt and updatedAt automatically added
      }
    }
  });

  console.log('📋 Resource version:', users.options.version);
  console.log('🗂️ Partition rules:', users.options.partitionRules);

  // =====================================================
  // 2. Add Custom Hooks
  // =====================================================
  console.log('\n2. Adding custom hooks...');

  // Add preInsert hook to validate and transform data
  users.addHook('preInsert', async (data) => {
    console.log(`🪝 preInsert: Processing user ${data.name}`);
    
    // Normalize email to lowercase
    if (data.email) {
      data.email = data.email.toLowerCase();
    }
    
    // Set default status if not provided
    if (!data.status) {
      data.status = 'active';
    }
    
    return data;
  });

  // Add afterInsert hook to log creation
  users.addHook('afterInsert', async (data) => {
    console.log(`🪝 afterInsert: User ${data.name} created with ID ${data.id}`);
    console.log(`   📍 Partitions: region=${data.region}, status=${data.status}, createdAt=${data.createdAt.split('T')[0]}`);
    return data;
  });

  // Add preUpdate hook to validate updates
  users.addHook('preUpdate', async (data) => {
    console.log(`🪝 preUpdate: Updating user data`);
    
    // Prevent email changes (business rule)
    if (data.email) {
      console.log('   ⚠️ Email changes not allowed in updates');
      delete data.email;
    }
    
    return data;
  });

  // Add afterUpdate hook
  users.addHook('afterUpdate', async (data) => {
    console.log(`🪝 afterUpdate: User ${data.id} updated`);
    return data;
  });

  // =====================================================
  // 3. Test Automatic Partitioning via Hooks
  // =====================================================
  console.log('\n3. Testing automatic partitioning via hooks...');

  const user1 = await users.insert({
    name: 'Alice Johnson',
    email: 'ALICE@EXAMPLE.COM', // Will be normalized to lowercase
    region: 'US-WEST', // Will be truncated to 'US' due to maxlength:2
    // status will be set to 'active' by preInsert hook
  });

  const user2 = await users.insert({
    name: 'Bob Silva',
    email: 'bob@example.com',
    region: 'BR',
    status: 'premium'
  });

  console.log('\n📊 Users created:');
  console.log('User 1:', user1);
  console.log('User 2:', user2);

  // =====================================================
  // 4. Demonstrate Partition Querying
  // =====================================================
  console.log('\n4. Demonstrating partition querying...');

  const today = new Date().toISOString().split('T')[0];

  // List users by region
  const usUsers = await users.listIds({ region: 'US' });
  console.log('🇺🇸 US users:', usUsers);

  const brUsers = await users.listIds({ region: 'BR' });
  console.log('🇧🇷 BR users:', brUsers);

  // List users by status
  const activeUsers = await users.listIds({ status: 'active' });
  console.log('✅ Active users:', activeUsers);

  const premiumUsers = await users.listIds({ status: 'premium' });
  console.log('💎 Premium users:', premiumUsers);

  // List users created today
  const todayUsers = await users.listIds({ createdAt: today });
  console.log('📅 Users created today:', todayUsers);

  // Complex partition query
  const usPremiumToday = await users.listIds({
    region: 'US',
    status: 'premium',
    createdAt: today
  });
  console.log('🇺🇸💎📅 US premium users created today:', usPremiumToday);

  // =====================================================
  // 5. Test Updates with Hooks
  // =====================================================
  console.log('\n5. Testing updates with hooks...');

  await users.update(user1.id, {
    name: 'Alice Johnson-Smith',
    email: 'newemail@example.com', // This will be removed by preUpdate hook
    status: 'premium'
  }, {
    region: user1.region,
    status: user1.status,
    createdAt: user1.createdAt
  });

  // =====================================================
  // 6. Test Binary Content with Partitions
  // =====================================================
  console.log('\n6. Testing binary content with partitions...');

  const profilePicture = Buffer.from('fake-profile-picture-data', 'utf8');
  const partitionData = {
    region: user2.region,
    status: user2.status,
    createdAt: user2.createdAt,
    updatedAt: user2.updatedAt
  };

  await users.setContent(user2.id, profilePicture, 'image/jpeg', partitionData);
  console.log('🖼️ Profile picture stored for user', user2.id);

  const content = await users.getContent(user2.id, partitionData);
  console.log('📸 Retrieved profile picture:', {
    size: content.buffer.length,
    contentType: content.contentType
  });

  // =====================================================
  // 7. View New s3db.json Structure
  // =====================================================
  console.log('\n7. Viewing new s3db.json structure...');

  if (await db.client.exists('s3db.json')) {
    const s3dbResponse = await db.client.getObject('s3db.json');
    const s3dbContent = JSON.parse(await s3dbResponse.Body.transformToString());
    
    console.log('📄 s3db.json structure:');
    console.log('  Version:', s3dbContent.version);
    console.log('  s3db Version:', s3dbContent.s3dbVersion);
    console.log('  Last Updated:', s3dbContent.lastUpdated);
    
    Object.entries(s3dbContent.resources).forEach(([name, resource]) => {
      console.log(`  Resource: ${name}`);
      console.log(`    Current Version: ${resource.currentVersion}`);
      console.log(`    Partitions:`, Object.keys(resource.partitions));
      console.log(`    Versions:`, Object.keys(resource.versions));
      
      Object.entries(resource.versions).forEach(([version, versionData]) => {
        console.log(`      ${version}: hash=${versionData.hash.substring(0, 16)}...`);
      });
    });
  }

  // =====================================================
  // 8. Test Schema Evolution (Simulate Version Change)
  // =====================================================
  console.log('\n8. Simulating schema evolution...');

  // This would typically happen when the application restarts with modified schema
  const usersV2 = await db.createResource({
    name: 'users',
    attributes: {
      name: 'string',
      email: 'string',
      region: 'string',
      status: 'string',
      age: 'number', // New field - this will trigger version change
      subscription: 'string|optional' // Another new field
    },
    options: {
      timestamps: true,
      partitionRules: {
        region: 'string|maxlength:2',
        status: 'string',
        subscription: 'string' // New partition rule
      }
    }
  });

  console.log('📈 Schema evolved to version:', usersV2.options.version);

  // =====================================================
  // 9. Test Versioned Unmapping
  // =====================================================
  console.log('\n9. Testing versioned unmapping...');

  // Old objects should still be readable with their original schema
  const oldUser1 = await users.get(user1.id, {
    region: user1.region,
    status: 'premium', // Updated status
    createdAt: user1.createdAt
  });

  console.log('👤 Old user (v0 schema):', {
    id: oldUser1.id,
    name: oldUser1.name,
    email: oldUser1.email,
    version: 'inferred from object path'
  });

  // New objects will use the new schema
  const newUser = await usersV2.insert({
    name: 'Charlie Brown',
    email: 'charlie@example.com',
    region: 'CA',
    status: 'active',
    age: 30,
    subscription: 'pro'
  });

  console.log('👤 New user (v1 schema):', newUser);

  // =====================================================
  // 10. Test Deletion with Hooks
  // =====================================================
  console.log('\n10. Testing deletion with hooks...');

  // Add delete hooks
  users.addHook('preDelete', async (data) => {
    console.log(`🪝 preDelete: Preparing to delete user ${data.id}`);
    return data;
  });

  users.addHook('afterDelete', async (data) => {
    console.log(`🪝 afterDelete: User ${data.id} and all partitions cleaned up`);
    return data;
  });

  // Delete a user (this will also clean up partition objects via hooks)
  await users.delete(user1.id, {
    region: user1.region,
    status: 'premium',
    createdAt: user1.createdAt
  });

  console.log('🗑️ User deleted with automatic partition cleanup');

  // =====================================================
  // 11. Summary
  // =====================================================
  console.log('\n📊 Advanced Features Summary');
  console.log('============================');
  
  const features = [
    '✅ Versioned resource definitions with hash tracking',
    '✅ Automatic partition management through hooks',
    '✅ Custom hook system (preInsert, afterInsert, etc.)',
    '✅ Version-aware schema unmapping',
    '✅ New s3db.json structure with versions and partitions',
    '✅ Automatic timestamp partitions',
    '✅ Binary content with partition support',
    '✅ Schema evolution with backward compatibility',
    '✅ Partition-based querying and filtering',
    '✅ Automatic partition cleanup on deletion'
  ];

  features.forEach(feature => console.log(feature));

  console.log('\n🎉 Advanced versioning and hooks system working perfectly!');
}

main().catch(console.error);