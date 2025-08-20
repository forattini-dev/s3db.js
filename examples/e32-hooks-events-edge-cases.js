import { setupDatabase } from './database.js';

// Utility functions for testing
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const measureTime = async (fn, label) => {
  const start = Date.now();
  const result = await fn();
  const end = Date.now();
  console.log(`⏱️  ${label}: ${end - start}ms`);
  return { result, duration: end - start };
};

async function main() {
  console.log('🧪 Hooks & Events Edge Cases Study');
  console.log('====================================\n');

  const database = await setupDatabase();

  // Test 1: Are afterInsert hooks blocking?
  console.log('📋 TEST 1: afterInsert Hook Blocking Behavior');
  console.log('----------------------------------------------');
  
  const users1 = await database.createResource({
    name: 'users_hook_blocking_test',
    attributes: {
      name: 'string|required',
      email: 'string|required'
    },
    hooks: {
      afterInsert: [
        async (data) => {
          console.log('🕐 Hook 1 started (will sleep 2000ms)');
          await sleep(2000);
          console.log('✅ Hook 1 finished');
          return data;
        },
        async (data) => {
          console.log('🕐 Hook 2 started (will sleep 1500ms)');
          await sleep(1500);
          console.log('✅ Hook 2 finished');
          return data;
        }
      ]
    }
  });

  const { result: insertResult1, duration: insertDuration1 } = await measureTime(async () => {
    return await users1.insert({
      name: 'John Hook Test',
      email: 'john@hook.test'
    });
  }, 'Insert with slow afterInsert hooks');

  console.log(`📊 Result: Insert ${insertDuration1 > 3000 ? 'IS' : 'IS NOT'} blocking (waited for hooks)\n`);

  // Test 2: Are event listeners blocking?
  console.log('📋 TEST 2: Event Listeners Blocking Behavior');
  console.log('--------------------------------------------');

  const users2 = await database.createResource({
    name: 'users_event_blocking_test',
    attributes: {
      name: 'string|required',
      email: 'string|required'
    },
    events: {
      insert: [
        async (event) => {
          console.log('🕐 Event Listener 1 started (will sleep 2000ms)');
          await sleep(2000);
          console.log('✅ Event Listener 1 finished');
        },
        async (event) => {
          console.log('🕐 Event Listener 2 started (will sleep 1500ms)');
          await sleep(1500);
          console.log('✅ Event Listener 2 finished');
        }
      ]
    }
  });

  const { result: insertResult2, duration: insertDuration2 } = await measureTime(async () => {
    return await users2.insert({
      name: 'Jane Event Test',
      email: 'jane@event.test'
    });
  }, 'Insert with slow event listeners');

  console.log(`📊 Result: Insert ${insertDuration2 > 3000 ? 'IS' : 'IS NOT'} blocking (waited for event listeners)\n`);

  // Test 3: Error handling in hooks vs events
  console.log('📋 TEST 3: Error Handling - Hooks vs Events');
  console.log('--------------------------------------------');

  const users3 = await database.createResource({
    name: 'users_error_test',
    attributes: {
      name: 'string|required',
      email: 'string|required'
    },
    hooks: {
      afterInsert: [
        async (data) => {
          console.log('🔥 Hook will throw error');
          throw new Error('Hook error!');
        }
      ]
    },
    events: {
      insert: [
        async (event) => {
          console.log('🔥 Event listener will throw error');
          throw new Error('Event listener error!');
        }
      ]
    }
  });

  // Test hook error
  console.log('Testing hook error...');
  try {
    await users3.insert({
      name: 'Error Test User',
      email: 'error@test.com'
    });
    console.log('✅ Insert succeeded despite hook error');
  } catch (error) {
    console.log('❌ Insert failed due to hook error:', error.message);
  }

  // Test event listener error handling pattern
  console.log('Testing event listener error handling...');
  let eventListenerError = null;
  
  const users4 = await database.createResource({
    name: 'users_event_error_only_test',
    attributes: {
      name: 'string|required',
      email: 'string|required'
    },
    events: {
      insert: [
        async (event) => {
          try {
            console.log('🔥 Event listener will throw error');
            throw new Error('Event listener error!');
          } catch (error) {
            eventListenerError = error;
            console.log('🛡️ Event listener error caught internally:', error.message);
          }
        }
      ]
    }
  });

  try {
    await users4.insert({
      name: 'Event Error Test User',
      email: 'event.error@test.com'
    });
    console.log('✅ Insert succeeded despite event listener error');
  } catch (error) {
    console.log('❌ Insert failed due to event listener error:', error.message);
  }

  // Wait for async event to complete
  await sleep(100);
  console.log(`📊 Event listener error was: ${eventListenerError ? 'CAUGHT INTERNALLY' : 'NOT CAUGHT'}`);
  console.log('💡 Note: Event listeners should handle their own errors to avoid unhandled rejections');

  console.log();

  // Test 4: Execution order - hooks vs events
  console.log('📋 TEST 4: Execution Order - Hooks vs Events');
  console.log('---------------------------------------------');

  let executionOrder = [];
  
  const users5 = await database.createResource({
    name: 'users_order_test',
    attributes: {
      name: 'string|required',
      email: 'string|required'
    },
    hooks: {
      beforeInsert: [
        async (data) => {
          executionOrder.push('beforeInsert-1');
          console.log('🔄 beforeInsert hook 1');
          return data;
        }
      ],
      afterInsert: [
        async (data) => {
          executionOrder.push('afterInsert-1');
          console.log('🔄 afterInsert hook 1');
          return data;
        }
      ]
    },
    events: {
      insert: [
        async (event) => {
          executionOrder.push('insert-event-1');
          console.log('🔄 insert event listener 1');
        }
      ]
    }
  });

  // Also add programmatic listener
  users5.on('insert', async (event) => {
    executionOrder.push('insert-event-programmatic');
    console.log('🔄 insert event listener (programmatic)');
  });

  console.log('Inserting user to test execution order...');
  await users5.insert({
    name: 'Order Test User',
    email: 'order@test.com'
  });

  // Wait a bit for async events
  await sleep(100);
  console.log('📊 Execution Order:', executionOrder);
  console.log();

  // Test 5: Concurrent operations with slow hooks/events
  console.log('📋 TEST 5: Concurrent Operations with Slow Hooks/Events');
  console.log('-------------------------------------------------------');

  const users6 = await database.createResource({
    name: 'users_concurrent_test',
    attributes: {
      name: 'string|required',
      email: 'string|required'
    },
    hooks: {
      afterInsert: [
        async (data) => {
          console.log(`🕐 Slow hook started for ${data.name}`);
          await sleep(1000);
          console.log(`✅ Slow hook finished for ${data.name}`);
          return data;
        }
      ]
    },
    events: {
      insert: [
        async (event) => {
          console.log(`🕐 Slow event listener started for ${event.name}`);
          await sleep(800);
          console.log(`✅ Slow event listener finished for ${event.name}`);
        }
      ]
    }
  });

  console.log('Starting 3 concurrent inserts...');
  const startTime = Date.now();
  
  const promises = [
    users6.insert({ name: 'Concurrent User 1', email: 'c1@test.com' }),
    users6.insert({ name: 'Concurrent User 2', email: 'c2@test.com' }),
    users6.insert({ name: 'Concurrent User 3', email: 'c3@test.com' })
  ];

  await Promise.all(promises);
  const totalTime = Date.now() - startTime;
  
  console.log(`📊 Total time for 3 concurrent operations: ${totalTime}ms`);
  console.log(`📊 Expected if sequential: ~5400ms (3 × 1800ms)`);
  console.log(`📊 Actual behavior: ${totalTime < 4000 ? 'CONCURRENT' : 'SEQUENTIAL'}\n`);

  // Test 6: Resource cleanup and listener persistence
  console.log('📋 TEST 6: Listener Persistence After Resource Operations');
  console.log('--------------------------------------------------------');

  let eventCount = 0;
  const users7 = await database.createResource({
    name: 'users_persistence_test',
    attributes: {
      name: 'string|required',
      email: 'string|required'
    },
    events: {
      insert: () => eventCount++,
      update: () => eventCount++,
      delete: () => eventCount++
    }
  });

  console.log('Testing event persistence across operations...');
  const user = await users7.insert({ name: 'Persistence Test', email: 'persist@test.com' });
  await users7.update(user.id, { name: 'Updated Name' });
  await users7.delete(user.id);

  // Wait for async events
  await sleep(100);
  console.log(`📊 Event count: ${eventCount} (expected: 3)`);
  console.log(`📊 Listeners ${eventCount === 3 ? 'PERSISTED' : 'DID NOT PERSIST'} correctly\n`);

  // Test 7: Memory usage with many listeners
  console.log('📋 TEST 7: Memory Usage with Many Event Listeners');
  console.log('--------------------------------------------------');

  const users8 = await database.createResource({
    name: 'users_memory_test',
    attributes: {
      name: 'string|required',
      email: 'string|required'
    }
  });

  // Add many programmatic listeners
  for (let i = 0; i < 1000; i++) {
    users8.on('insert', () => {
      // Empty listener for memory test
    });
  }

  console.log(`📊 Added 1000 event listeners`);
  console.log(`📊 Listener count for 'insert': ${users8.listenerCount('insert')}`);
  console.log(`📊 All event names: ${users8.eventNames()}`);

  // Test performance with many listeners
  const { duration: manyListenersDuration } = await measureTime(async () => {
    return await users8.insert({
      name: 'Many Listeners Test',
      email: 'many@listeners.test'
    });
  }, 'Insert with 1000 listeners');

  console.log(`📊 Performance impact: ${manyListenersDuration > 100 ? 'SIGNIFICANT' : 'MINIMAL'}\n`);

  // Summary
  console.log('📋 SUMMARY OF FINDINGS');
  console.log('=======================');
  console.log(`🔹 afterInsert hooks: ${insertDuration1 > 3000 ? 'BLOCKING' : 'NON-BLOCKING'}`);
  console.log(`🔹 Event listeners: ${insertDuration2 > 3000 ? 'BLOCKING' : 'NON-BLOCKING'}`);
  console.log(`🔹 Concurrent operations: ${totalTime < 4000 ? 'SUPPORTED' : 'SEQUENTIAL'}`);
  console.log(`🔹 Event persistence: ${eventCount === 3 ? 'WORKING' : 'BROKEN'}`);
  console.log(`🔹 Many listeners performance: ${manyListenersDuration > 100 ? 'DEGRADED' : 'GOOD'}`);
  
  console.log('\n✅ Edge cases study completed!');
}

main().catch(console.error); 