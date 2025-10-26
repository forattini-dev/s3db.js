/**
 * State Machine Plugin - Async/Sync Event Processing
 *
 * Demonstrates how the StateMachinePlugin handles both async and sync events
 * reliably using the waitForPendingEvents() method.
 *
 * IMPORTANT: The plugin tracks pending event handlers to ensure all
 * state transitions complete before returning control.
 */

import { Database, StateMachinePlugin } from '../src/index.js';

async function main() {
  // Create database
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/state-machine-sync'
  });

  await db.connect();

  // Create orders resource WITH async events (default)
  const orders = await db.createResource({
    name: 'orders',
    attributes: {
      id: 'string|required',
      customerId: 'string|required',
      total: 'number|required',
      status: 'string|required',
      paymentStatus: 'string|optional'
    },
    asyncEvents: true  // EXPLICIT: use async events
  });

  console.log('✅ Resource created with asyncEvents:', orders._asyncMode);

  // Setup state machine with resource as eventSource
  const stateMachine = new StateMachinePlugin({
    enableEventTriggers: true,
    verbose: true,  // See the synchronous event log
    stateMachines: {
      order: {
        resource: 'orders',
        stateField: 'status',
        initialState: 'pending',
        states: {
          pending: {
            triggers: [{
              type: 'event',
              eventName: 'updated',
              eventSource: orders,  // ← Plugin will force syncEvents on this resource
              condition: (context, entityId, eventData) => {
                return eventData.paymentStatus === 'confirmed';
              },
              targetState: 'processing'
            }]
          },
          processing: {
            type: 'final'
          }
        }
      }
    }
  });

  await db.usePlugin(stateMachine);

  console.log('✅ Plugin tracks pending event handlers for async-safe transitions');
  console.log('');

  // Create and initialize order
  const order = await orders.insert({
    id: 'order-123',
    customerId: 'customer-1',
    total: 99.99,
    status: 'pending',
    paymentStatus: 'pending'
  });

  await stateMachine.initializeEntity('order', 'order-123', { id: 'order-123' });

  console.log('📦 Order created:', order.status);
  console.log('');

  // Listen to transition events
  stateMachine.on('plg:state-machine:transition', (data) => {
    console.log(`🔄 Transition: ${data.from} → ${data.to}`);
  });

  // Update order with payment confirmation
  console.log('💳 Updating payment status to confirmed...');
  await orders.update('order-123', {
    paymentStatus: 'confirmed'
  });

  // IMPORTANT: With async events, we need to wait for event handlers to complete
  console.log('⏳ Waiting for pending event handlers...');
  await stateMachine.waitForPendingEvents();

  const updatedOrder = await orders.get('order-123');
  console.log('');
  console.log('✅ Order status updated:', updatedOrder.status);
  console.log('');

  if (updatedOrder.status === 'processing') {
    console.log('✅ SUCCESS: State transition completed (with waitForPendingEvents)');
  } else {
    console.log('❌ FAIL: State still pending');
  }

  console.log('');
  console.log('====== Testing with SYNC events (asyncEvents: false) ======');
  console.log('');

  // Create another resource with SYNC events
  const orders2 = await db.createResource({
    name: 'orders2',
    attributes: {
      id: 'string|required',
      customerId: 'string|required',
      total: 'number|required',
      status: 'string|required',
      paymentStatus: 'string|optional'
    },
    asyncEvents: false  // SYNC events
  });

  const stateMachine2 = new StateMachinePlugin({
    enableEventTriggers: true,
    persistTransitions: false,
    stateMachines: {
      order2: {
        resource: 'orders2',
        stateField: 'status',
        initialState: 'pending',
        states: {
          pending: {
            triggers: [{
              type: 'event',
              eventName: 'updated',
              eventSource: orders2,
              condition: (context, entityId, eventData) => {
                return eventData.paymentStatus === 'confirmed';
              },
              targetState: 'processing'
            }]
          },
          processing: {
            type: 'final'
          }
        }
      }
    }
  });

  await db.usePlugin(stateMachine2);

  const order2 = await orders2.insert({
    id: 'order-456',
    customerId: 'customer-1',
    total: 99.99,
    status: 'pending',
    paymentStatus: 'pending'
  });

  await stateMachine2.initializeEntity('order2', 'order-456', { id: 'order-456' });

  console.log('💳 Updating payment status to confirmed (SYNC)...');
  await orders2.update('order-456', {
    paymentStatus: 'confirmed'
  });

  // NO NEED to wait for sync events!
  const updatedOrder2 = await orders2.get('order-456');
  console.log('');
  console.log('✅ Order status updated IMMEDIATELY:', updatedOrder2.status);
  console.log('');

  if (updatedOrder2.status === 'processing') {
    console.log('✅ SUCCESS: State transition happened IMMEDIATELY (sync events)');
  } else {
    console.log('❌ FAIL: State still pending');
  }

  await db.disconnect();
}

main().catch(console.error);

/**
 * Expected Output:
 *
 * ✅ Resource created with asyncEvents: true
 * ✅ Plugin tracks pending event handlers for async-safe transitions
 *
 * 📦 Order created: pending
 *
 * 💳 Updating payment status to confirmed...
 * ⏳ Waiting for pending event handlers...
 * 🔄 Transition: pending → processing
 *
 * ✅ Order status updated: processing
 *
 * ✅ SUCCESS: State transition completed (with waitForPendingEvents)
 *
 * ====== Testing with SYNC events (asyncEvents: false) ======
 *
 * 💳 Updating payment status to confirmed (SYNC)...
 * 🔄 Transition: pending → processing
 *
 * ✅ Order status updated IMMEDIATELY: processing
 *
 * ✅ SUCCESS: State transition happened IMMEDIATELY (sync events)
 */
