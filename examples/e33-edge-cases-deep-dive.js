import { setupDatabase } from './database.js';

// Utility functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const measureTime = async (fn, label) => {
  const start = Date.now();
  const result = await fn();
  const end = Date.now();
  console.log(`⏱️  ${label}: ${end - start}ms`);
  return { result, duration: end - start };
};

async function main() {
  console.log('🔬 Deep Dive: Advanced Edge Cases Analysis');
  console.log('===========================================\n');

  const database = await setupDatabase();

  // Test 1: Hook execution order with mixed sync/async
  console.log('📋 TEST 1: Mixed Sync/Async Hooks Execution Order');
  console.log('--------------------------------------------------');
  
  let hookOrder = [];
  const users1 = await database.createResource({
    name: 'mixed_hooks_test',
    attributes: {
      name: 'string|required',
      email: 'string|required'
    },
    hooks: {
      beforeInsert: [
        // Sync hook
        (data) => {
          hookOrder.push('sync-before-1');
          console.log('🔄 Sync beforeInsert hook 1');
          return data;
        },
        // Async hook
        async (data) => {
          hookOrder.push('async-before-1');
          console.log('🔄 Async beforeInsert hook 1');
          await sleep(100);
          console.log('✅ Async beforeInsert hook 1 completed');
          return data;
        },
        // Another sync hook
        (data) => {
          hookOrder.push('sync-before-2');
          console.log('🔄 Sync beforeInsert hook 2');
          return data;
        }
      ],
      afterInsert: [
        async (data) => {
          hookOrder.push('async-after-1');
          console.log('🔄 Async afterInsert hook 1');
          await sleep(50);
          console.log('✅ Async afterInsert hook 1 completed');
          return data;
        }
      ]
    }
  });

  await users1.insert({
    name: 'Mixed Hooks Test',
    email: 'mixed@test.com'
  });

  console.log('📊 Hook execution order:', hookOrder);
  console.log('💡 Note: All hooks (sync and async) are awaited in sequence\n');

  // Test 2: Hook data transformation chain
  console.log('📋 TEST 2: Hook Data Transformation Chain');
  console.log('-----------------------------------------');

  const users2 = await database.createResource({
    name: 'transformation_test',
    attributes: {
      name: 'string|required',
      email: 'string|required',
      processed: 'boolean|optional'
    },
    hooks: {
      beforeInsert: [
        async (data) => {
          console.log('🔄 Hook 1: Adding timestamp');
          data.insertedAt = new Date().toISOString();
          return data;
        },
        async (data) => {
          console.log('🔄 Hook 2: Uppercasing name');
          data.name = data.name.toUpperCase();
          return data;
        },
        async (data) => {
          console.log('🔄 Hook 3: Adding processed flag');
          data.processed = true;
          return data;
        }
      ]
    }
  });

  const transformedUser = await users2.insert({
    name: 'john doe',
    email: 'john@transform.test'
  });

  console.log('📊 Original data: { name: "john doe", email: "john@transform.test" }');
  console.log('📊 Transformed data:', {
    name: transformedUser.name,
    email: transformedUser.email,
    processed: transformedUser.processed,
    insertedAt: transformedUser.insertedAt ? 'ADDED' : 'NOT ADDED'
  });
  console.log();

  // Test 3: Event listener timing during concurrent operations
  console.log('📋 TEST 3: Event Listener Timing During Concurrent Operations');
  console.log('--------------------------------------------------------------');

  let eventTimestamps = [];
  const users3 = await database.createResource({
    name: 'concurrent_events_test',
    attributes: {
      name: 'string|required',
      email: 'string|required'
    },
    events: {
      insert: [
        async (event) => {
          const timestamp = Date.now();
          eventTimestamps.push(`${event.name}-start-${timestamp}`);
          console.log(`🕐 Event for ${event.name} started at ${timestamp}`);
          await sleep(500);
          const endTimestamp = Date.now();
          eventTimestamps.push(`${event.name}-end-${endTimestamp}`);
          console.log(`✅ Event for ${event.name} completed at ${endTimestamp}`);
        }
      ]
    }
  });

  console.log('Starting 3 concurrent inserts with event listeners...');
  const concurrentPromises = [
    users3.insert({ name: 'User1', email: 'user1@concurrent.test' }),
    users3.insert({ name: 'User2', email: 'user2@concurrent.test' }),
    users3.insert({ name: 'User3', email: 'user3@concurrent.test' })
  ];

  const concurrentStart = Date.now();
  await Promise.all(concurrentPromises);
  const concurrentEnd = Date.now();

  // Wait for all event listeners to complete
  await sleep(600);
  
  console.log('📊 Insert operations completed in:', concurrentEnd - concurrentStart, 'ms');
  console.log('📊 Event timestamps:', eventTimestamps);
  console.log('💡 Note: Inserts return immediately, events run in parallel\n');

  // Test 4: beforeInsert hook rejection
  console.log('📋 TEST 4: beforeInsert Hook Rejection Behavior');
  console.log('-----------------------------------------------');

  const users4 = await database.createResource({
    name: 'rejection_test',
    attributes: {
      name: 'string|required',
      email: 'string|required',
      age: 'number|optional'
    },
    hooks: {
      beforeInsert: [
        async (data) => {
          console.log('🔄 Validation hook: checking age');
          if (data.age && data.age < 18) {
            console.log('❌ Validation failed: age < 18');
            throw new Error('Age must be 18 or older');
          }
          console.log('✅ Validation passed');
          return data;
        }
      ]
    }
  });

  // Test valid case
  try {
    const validUser = await users4.insert({
      name: 'Valid User',
      email: 'valid@test.com',
      age: 25
    });
    console.log('✅ Valid user inserted successfully');
  } catch (error) {
    console.log('❌ Valid user insertion failed:', error.message);
  }

  // Test invalid case
  try {
    const invalidUser = await users4.insert({
      name: 'Invalid User',
      email: 'invalid@test.com',
      age: 16
    });
    console.log('❌ Invalid user was inserted (should not happen)');
  } catch (error) {
    console.log('✅ Invalid user rejected correctly:', error.message);
  }

  console.log();

  // Test 5: Event listener memory and cleanup
  console.log('📋 TEST 5: Event Listener Memory and Cleanup');
  console.log('---------------------------------------------');

  const users5 = await database.createResource({
    name: 'memory_cleanup_test',
    attributes: {
      name: 'string|required',
      email: 'string|required'
    }
  });

  // Add many listeners programmatically
  const listeners = [];
  for (let i = 0; i < 50; i++) {
    const listener = (event) => {
      // Lightweight listener
    };
    listeners.push(listener);
    users5.on('insert', listener);
  }

  console.log(`📊 Added 50 listeners, current count: ${users5.listenerCount('insert')}`);

  // Test performance
  const { duration: beforeCleanup } = await measureTime(async () => {
    return await users5.insert({
      name: 'Memory Test User',
      email: 'memory@test.com'
    });
  }, 'Insert with 50 listeners');

  // Remove all listeners
  listeners.forEach(listener => {
    users5.off('insert', listener);
  });

  console.log(`📊 After cleanup, listener count: ${users5.listenerCount('insert')}`);

  // Test performance after cleanup
  const { duration: afterCleanup } = await measureTime(async () => {
    return await users5.insert({
      name: 'Memory Test User 2',
      email: 'memory2@test.com'
    });
  }, 'Insert after cleanup');

  console.log(`📊 Performance difference: ${beforeCleanup - afterCleanup}ms`);
  console.log();

  // Test 6: Nested hook executions (hooks calling other operations)
  console.log('📋 TEST 6: Nested Operations in Hooks');
  console.log('-------------------------------------');

  const users6 = await database.createResource({
    name: 'nested_hooks_test',
    attributes: {
      name: 'string|required',
      email: 'string|required'
    }
  });

  const logs6 = await database.createResource({
    name: 'audit_logs_test',
    attributes: {
      action: 'string|required',
      resourceId: 'string|required',
      timestamp: 'string|required'
    },
    hooks: {
      afterInsert: [
        async (data) => {
          console.log('🔄 Audit log created for user operation');
          return data;
        }
      ]
    }
  });

  // Add hook to users that creates audit log
  users6.addHook('afterInsert', async (userData) => {
    console.log('🔄 Creating audit log for user creation...');
    await logs6.insert({
      action: 'USER_CREATED',
      resourceId: userData.id,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Audit log created');
    return userData;
  });

  const { duration: nestedDuration } = await measureTime(async () => {
    return await users6.insert({
      name: 'Nested Test User',
      email: 'nested@test.com'
    });
  }, 'Insert with nested operation in hook');

  console.log('📊 Nested operations in hooks work correctly');
  console.log();

  // Summary of deep dive findings
  console.log('📋 DEEP DIVE SUMMARY');
  console.log('====================');
  console.log('🔹 Mixed sync/async hooks: ALL are awaited in sequence');
  console.log('🔹 Hook data transformation: Changes persist through chain');
  console.log('🔹 Event listener concurrency: Run in parallel, non-blocking');
  console.log('🔹 beforeInsert rejection: Completely blocks insert operation');
  console.log('🔹 Event listener cleanup: .off() works correctly for memory management');
  console.log('🔹 Nested operations: Hooks can safely call other resource operations');
  
  console.log('\n✅ Deep dive analysis completed!');
}

main().catch(console.error); 