import { S3db } from '../src/index.js';

// Example demonstrating Resource behaviors for metadata size management
async function demonstrateBehaviors() {
  console.log('🚀 S3DB.js Resource Behaviors Demo\n');

  // Initialize database
  const db = new S3db({
    connectionString: process.env.S3DB_CONNECTION_STRING || 'http://localhost:9000/s3db-test',
    verbose: true
  });

  await db.connect();

  // Sample large data that exceeds 2KB
  const largeData = {
    name: 'João Silva',
    email: 'joao@example.com',
    bio: 'A'.repeat(1000), // 1KB of 'A's
    description: 'B'.repeat(1000), // 1KB of 'B's  
    notes: 'C'.repeat(500), // 500 bytes of 'C's
    tags: ['developer', 'javascript', 'node.js', 'aws', 's3', 'database'],
    metadata: {
      source: 'import',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }
  };

  console.log('📊 Sample data size: ~2.5KB (exceeds S3 2KB metadata limit)\n');

  // 1. USER-MANAGEMENT BEHAVIOR (Default)
  console.log('1️⃣  USER-MANAGEMENT BEHAVIOR');
  console.log('   User is responsible for managing metadata size');
  console.log('   Emits warning events when limit is exceeded\n');

  const userMgmtResource = await db.createResource({
    name: 'users_user_management',
    behavior: 'user-management',
    attributes: {
      name: 'string',
      email: 'email',
      bio: 'string|optional',
      description: 'string|optional',
      notes: 'string|optional',
      tags: 'array|optional',
      metadata: 'object|optional'
    }
  });

  // Listen for warning events
  userMgmtResource.on('exceedsLimit', (context) => {
    console.log(`⚠️  WARNING: Metadata size exceeds limit!`);
    console.log(`   Operation: ${context.operation}`);
    console.log(`   Size: ${context.totalSize} bytes (limit: ${context.limit} bytes)`);
    console.log(`   Excess: ${context.excess} bytes\n`);
  });

  try {
    const result1 = await userMgmtResource.insert(largeData);
    console.log('✅ Insert successful (with warning)');
    console.log(`   ID: ${result1.id}\n`);
  } catch (error) {
    console.log(`❌ Insert failed: ${error.message}\n`);
  }

  // 2. ENFORCE-LIMITS BEHAVIOR
  console.log('2️⃣  ENFORCE-LIMITS BEHAVIOR');
  console.log('   Throws error when metadata exceeds 2KB limit\n');

  const enforceLimitsResource = await db.createResource({
    name: 'users_enforce_limits',
    behavior: 'enforce-limits',
    attributes: {
      name: 'string',
      email: 'email',
      bio: 'string|optional',
      description: 'string|optional',
      notes: 'string|optional',
      tags: 'array|optional',
      metadata: 'object|optional'
    }
  });

  try {
    const result2 = await enforceLimitsResource.insert(largeData);
    console.log('✅ Insert successful');
    console.log(`   ID: ${result2.id}\n`);
  } catch (error) {
    console.log(`❌ Insert failed: ${error.message}\n`);
  }

  // 3. DATA-TRUNCATE BEHAVIOR
  console.log('3️⃣  DATA-TRUNCATE BEHAVIOR');
  console.log('   Truncates data to fit within 2KB limit\n');

  const dataTruncateResource = await db.createResource({
    name: 'users_data_truncate',
    behavior: 'data-truncate',
    attributes: {
      name: 'string',
      email: 'email',
      bio: 'string|optional',
      description: 'string|optional',
      notes: 'string|optional',
      tags: 'array|optional',
      metadata: 'object|optional'
    }
  });

  try {
    const result3 = await dataTruncateResource.insert(largeData);
    console.log('✅ Insert successful (data truncated)');
    console.log(`   ID: ${result3.id}`);
    
    // Get the truncated data
    const retrieved3 = await dataTruncateResource.get(result3.id);
    console.log(`   Stored fields: ${Object.keys(retrieved3).filter(k => !k.startsWith('_')).join(', ')}`);
    
    // Check if bio was truncated
    if (retrieved3.bio && retrieved3.bio.endsWith('...')) {
      console.log(`   Bio truncated: "${retrieved3.bio.substring(0, 50)}..."`);
    }
    console.log();
  } catch (error) {
    console.log(`❌ Insert failed: ${error.message}\n`);
  }

  // 4. BODY-OVERFLOW BEHAVIOR
  console.log('4️⃣  BODY-OVERFLOW BEHAVIOR');
  console.log('   Stores excess data in S3 object body\n');

  const bodyOverflowResource = await db.createResource({
    name: 'users_body_overflow',
    behavior: 'body-overflow',
    attributes: {
      name: 'string',
      email: 'email',
      bio: 'string|optional',
      description: 'string|optional',
      notes: 'string|optional',
      tags: 'array|optional',
      metadata: 'object|optional'
    }
  });

  try {
    const result4 = await bodyOverflowResource.insert(largeData);
    console.log('✅ Insert successful (using body overflow)');
    console.log(`   ID: ${result4.id}`);
    
    // Get the data (should be complete despite overflow)
    const retrieved4 = await bodyOverflowResource.get(result4.id);
    console.log(`   All fields preserved: ${Object.keys(retrieved4).filter(k => !k.startsWith('_')).join(', ')}`);
    console.log(`   Bio length: ${retrieved4.bio?.length || 0} chars`);
    console.log(`   Description length: ${retrieved4.description?.length || 0} chars`);
    console.log();
  } catch (error) {
    console.log(`❌ Insert failed: ${error.message}\n`);
  }

  // 5. COMPARISON WITH SMALL DATA
  console.log('5️⃣  COMPARISON WITH SMALL DATA');
  console.log('   All behaviors work normally with small data\n');

  const smallData = {
    name: 'Maria Santos',
    email: 'maria@example.com',
    bio: 'Software developer',
    tags: ['developer', 'javascript']
  };

  const smallDataResource = await db.createResource({
    name: 'users_small_data',
    behavior: 'body-overflow', // Use body-overflow to show it works with small data too
    attributes: {
      name: 'string',
      email: 'email',
      bio: 'string|optional',
      tags: 'array|optional'
    }
  });

  try {
    const result5 = await smallDataResource.insert(smallData);
    console.log('✅ Small data insert successful');
    console.log(`   ID: ${result5.id}`);
    
    const retrieved5 = await smallDataResource.get(result5.id);
    console.log(`   Fields: ${Object.keys(retrieved5).filter(k => !k.startsWith('_')).join(', ')}`);
    console.log();
  } catch (error) {
    console.log(`❌ Insert failed: ${error.message}\n`);
  }

  console.log('🎉 Behaviors demonstration completed!');
  console.log('\nBehavior Summary:');
  console.log('• user-management: Warns but allows operation');
  console.log('• enforce-limits: Throws error on size exceeded');
  console.log('• data-truncate: Cuts data to fit in 2KB');
  console.log('• body-overflow: Uses S3 body for excess data');
}

// Run the demo
demonstrateBehaviors().catch(console.error);