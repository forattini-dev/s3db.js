/**
 * State Machine Plugin - Resource API Example
 *
 * This example demonstrates the new resource-based API for state machines.
 * Instead of db.stateMachine('name').send(), you can now use resource.state()
 *
 * New API Benefits:
 * - More intuitive: state machine operations are directly on the resource
 * - Less verbose: no need to reference machine name
 * - Consistent: follows same pattern as insert(), update(), delete()
 */

import { Database, StateMachinePlugin } from '../../src/index.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';

// Initialize database with MemoryClient (no external dependencies)
const database = new Database({
  client: new MemoryClient({ bucketName: 'state-machine-resource-api' })
});

await database.connect();

// Create Orders resource
const ordersResource = await database.createResource({
  name: 'orders',
  attributes: {
    customerId: 'string|required',
    productId: 'string|required',
    quantity: 'number|required',
    totalAmount: 'number|required',
    orderStatus: 'string|optional'
  },
  timestamps: true
});

// Initialize State Machine Plugin with resource reference
const stateMachine = new StateMachinePlugin({
  stateMachines: {
    orderWorkflow: {
      initialState: 'pending',
      stateField: 'orderStatus',
      resource: ordersResource,  // Link machine to resource

      states: {
        pending: {
          description: 'Order created, waiting for payment',
          on: {
            CONFIRM: 'confirmed',
            CANCEL: 'cancelled'
          }
        },
        confirmed: {
          description: 'Payment confirmed',
          on: {
            SHIP: 'shipped',
            CANCEL: 'cancelled'
          }
        },
        shipped: {
          description: 'Order shipped',
          on: {
            DELIVER: 'delivered'
          }
        },
        delivered: {
          description: 'Order delivered',
          type: 'final'
        },
        cancelled: {
          description: 'Order cancelled',
          type: 'final'
        }
      }
    }
  }
});

await database.usePlugin(stateMachine);

console.log('🎯 State Machine Plugin initialized with Resource API\n');
console.log('='.repeat(60));

// ============================================================================
// NEW API: Using resource methods instead of db.stateMachine()
// ============================================================================

console.log('\n📝 EXAMPLE: New Resource API\n');

// Create order
const order = await ordersResource.insert({
  customerId: 'cust-123',
  productId: 'prod-456',
  quantity: 2,
  totalAmount: 199.99
});

console.log(`Order created: ${order.id}`);

// Initialize state (OLD vs NEW)
console.log('\n--- Initialize State ---');
console.log('OLD API: await db.stateMachine("orderWorkflow").initializeEntity(id, context)');
console.log('NEW API: await ordersResource.initializeState(id, context)');

await ordersResource.initializeState(order.id, {
  customerId: order.customerId,
  totalAmount: order.totalAmount
});

// Get current state (OLD vs NEW)
console.log('\n--- Get Current State ---');
console.log('OLD API: await db.stateMachine("orderWorkflow").getState(id)');
console.log('NEW API: await ordersResource.getState(id)');

let currentState = await ordersResource.getState(order.id);
console.log(`Current state: ${currentState}`);

// Check valid events (OLD vs NEW)
console.log('\n--- Get Valid Events ---');
console.log('OLD API: await db.stateMachine("orderWorkflow").getValidEvents(id)');
console.log('NEW API: await ordersResource.getValidEvents(id)');

let validEvents = await ordersResource.getValidEvents(order.id);
console.log(`Valid events: ${validEvents.join(', ')}`);

// Transition to new state (OLD vs NEW)
console.log('\n--- Trigger Transition ---');
console.log('OLD API: await db.stateMachine("orderWorkflow").send(id, "CONFIRM")');
console.log('NEW API: await ordersResource.state(id, "CONFIRM")');

await ordersResource.state(order.id, 'CONFIRM');

currentState = await ordersResource.getState(order.id);
console.log(`New state: ${currentState}`);

// Ship the order
console.log('\n--- Ship Order ---');
await ordersResource.state(order.id, 'SHIP');

currentState = await ordersResource.getState(order.id);
console.log(`State after shipping: ${currentState}`);

// Deliver the order
console.log('\n--- Deliver Order ---');
await ordersResource.state(order.id, 'DELIVER');

currentState = await ordersResource.getState(order.id);
console.log(`Final state: ${currentState}`);

// Get transition history (OLD vs NEW)
console.log('\n--- Get Transition History ---');
console.log('OLD API: await db.stateMachine("orderWorkflow").getTransitionHistory(id)');
console.log('NEW API: await ordersResource.getStateHistory(id)');

const history = await ordersResource.getStateHistory(order.id);
console.log(`\nTransition history (${history.length} transitions):`);
for (const transition of history) {
  console.log(`  ${transition.fromState || 'INIT'} → ${transition.toState} (event: ${transition.event})`);
}

// ============================================================================
// COMPARISON: Old vs New API
// ============================================================================

console.log('\n\n' + '='.repeat(60));
console.log('API COMPARISON');
console.log('='.repeat(60));

console.log(`
OLD API (verbose):
-----------------------------------------
const machine = db.stateMachine('orderWorkflow');
await machine.initializeEntity(id, context);
await machine.send(id, 'confirm');
const state = await machine.getState(id);
const events = await machine.getValidEvents(id);
const history = await machine.getTransitionHistory(id);

NEW API (intuitive):
-----------------------------------------
await ordersResource.initializeState(id, context);
await ordersResource.state(id, 'confirm');
const state = await ordersResource.getState(id);
const events = await ordersResource.getValidEvents(id);
const history = await ordersResource.getStateHistory(id);

KEY BENEFITS:
✅ More intuitive - operations on the resource itself
✅ Less verbose - no machine name needed
✅ Consistent - same pattern as insert/update/delete
✅ Better DX - easier to discover and use
`);

// ============================================================================
// ERROR HANDLING: What happens without state machine?
// ============================================================================

console.log('\n\n' + '='.repeat(60));
console.log('ERROR HANDLING: Resource without State Machine');
console.log('='.repeat(60));

const usersResource = await database.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|required'
  }
});

try {
  await usersResource.state('user-123', 'ACTIVATE');
} catch (error) {
  console.log('\n✅ Expected error:', error.message);
}

// Cleanup
await database.disconnect();

console.log('\n\n' + '='.repeat(60));
console.log('✅ Example completed successfully!');
console.log('='.repeat(60));

console.log(`
KEY TAKEAWAYS:
==============

1. Resource-Based API:
   - State machine methods are now on the resource: resource.state(id, event)
   - No need to reference machine name: it's automatic
   - More intuitive and consistent with other resource operations

2. Available Methods:
   - resource.state(id, event, eventData) - Trigger transition
   - resource.getState(id) - Get current state
   - resource.canTransition(id, event) - Check if valid
   - resource.getValidEvents(id) - Get available events
   - resource.initializeState(id, context) - Initialize entity
   - resource.getStateHistory(id, options) - Get history

3. Configuration:
   - Link machine to resource: { resource: ordersResource }
   - Or by name: { resource: 'orders' }
   - Plugin automatically attaches methods to the resource

4. Backward Compatibility:
   - This is a BREAKING CHANGE (v14.0.0)
   - Old API (db.stateMachine().send()) has been removed
   - All code must be updated to use resource methods

5. Error Handling:
   - Methods throw error if resource has no state machine
   - Clear error messages guide users to fix configuration
`);
