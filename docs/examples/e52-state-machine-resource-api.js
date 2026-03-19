/**
 * State Machine Plugin - Resource API Example
 *
 * This example demonstrates the resource-based API for state machines.
 * In addition to db.stateMachine('name').send(...), you can also use resource.state.*.
 *
 * Resource API Benefits:
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
// RESOURCE API: Using resource methods alongside db.stateMachine()
// ============================================================================

console.log('\n📝 EXAMPLE: Resource API\n');

// Create order
const order = await ordersResource.insert({
  customerId: 'cust-123',
  productId: 'prod-456',
  quantity: 2,
  totalAmount: 199.99
});

console.log(`Order created: ${order.id}`);

// Initialize state (Machine API vs Resource API)
console.log('\n--- Initialize State ---');
console.log('Machine API:  await db.stateMachine("orderWorkflow").initializeEntity(id, context)');
console.log('Resource API: await ordersResource.state.initialize(id, context)');

await ordersResource.state.initialize(order.id, {
  customerId: order.customerId,
  totalAmount: order.totalAmount
});

// Get current state (Machine API vs Resource API)
console.log('\n--- Get Current State ---');
console.log('Machine API:  await db.stateMachine("orderWorkflow").getState(id)');
console.log('Resource API: await ordersResource.state.get(id)');

let currentState = await ordersResource.state.get(order.id);
console.log(`Current state: ${currentState}`);

// Check valid events (Machine API vs Resource API)
console.log('\n--- Get Valid Events ---');
console.log('Machine API:  await db.stateMachine("orderWorkflow").getValidEvents(id)');
console.log('Resource API: await ordersResource.state.getValidEvents(id)');

let validEvents = await ordersResource.state.getValidEvents(order.id);
console.log(`Valid events: ${validEvents.join(', ')}`);

// Transition to new state (Machine API vs Resource API)
console.log('\n--- Trigger Transition ---');
console.log('Machine API:  await db.stateMachine("orderWorkflow").send(id, "CONFIRM")');
console.log('Resource API: await ordersResource.state.send(id, "CONFIRM")');

await ordersResource.state.send(order.id, 'CONFIRM');

currentState = await ordersResource.state.get(order.id);
console.log(`New state: ${currentState}`);

// Ship the order
console.log('\n--- Ship Order ---');
await ordersResource.state.send(order.id, 'SHIP');

currentState = await ordersResource.state.get(order.id);
console.log(`State after shipping: ${currentState}`);

// Deliver the order
console.log('\n--- Deliver Order ---');
await ordersResource.state.send(order.id, 'DELIVER');

currentState = await ordersResource.state.get(order.id);
console.log(`Final state: ${currentState}`);

// Get transition history (Machine API vs Resource API)
console.log('\n--- Get Transition History ---');
console.log('Machine API:  await db.stateMachine("orderWorkflow").getTransitionHistory(id)');
console.log('Resource API: await ordersResource.state.history(id)');

const history = await ordersResource.state.history(order.id);
console.log(`\nTransition history (${history.length} transitions):`);
for (const transition of history) {
  console.log(`  ${transition.fromState || 'INIT'} → ${transition.toState} (event: ${transition.event})`);
}

// ============================================================================
// COMPARISON: Machine API vs Resource API
// ============================================================================

console.log('\n\n' + '='.repeat(60));
console.log('API COMPARISON');
console.log('='.repeat(60));

console.log(`
MACHINE API:
-----------------------------------------
const machine = db.stateMachine('orderWorkflow');
await machine.initializeEntity(id, context);
await machine.send(id, 'CONFIRM');
const state = await machine.getState(id);
const events = await machine.getValidEvents(id);
const history = await machine.getTransitionHistory(id);

RESOURCE API:
-----------------------------------------
await ordersResource.state.initialize(id, context);
await ordersResource.state.send(id, 'CONFIRM');
const state = await ordersResource.state.get(id);
const events = await ordersResource.state.getValidEvents(id);
const history = await ordersResource.state.history(id);

KEY BENEFITS:
✅ More intuitive - operations on the resource itself
✅ Less repetitive - no machine name needed when you already have the resource
✅ Namespaced - clean organization under .state
✅ Consistent - same pattern as insert/update/delete
✅ Better DX - easier to discover and use
✅ Semantic - send() is standard for state machines
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
  await usersResource.state.send('user-123', 'ACTIVATE');
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

1. Namespaced API:
   - State machine methods under resource.state.*
   - Clean organization and better discoverability
   - Semantic method names (send, get, initialize, history)

2. Available Methods:
   - resource.state.send(id, event, eventData) - Trigger transition
   - resource.state.get(id) - Get current state
   - resource.state.canTransition(id, event) - Check if valid
   - resource.state.getValidEvents(id) - Get available events
   - resource.state.initialize(id, context) - Initialize entity
   - resource.state.history(id, options) - Get history

3. Configuration:
   - Link machine to resource: { resource: ordersResource }
   - Or by name: { resource: 'orders' }
   - Plugin automatically attaches state object to the resource

4. API Choice:
   - Machine API still exists: db.stateMachine('orderWorkflow').send(...)
   - Resource API exists alongside it: ordersResource.state.send(...)
   - Use the one that best matches your calling code

5. Benefits:
   - ✅ Namespaced - organized under .state
   - ✅ Semantic - send() for state transitions
   - ✅ Intuitive - operations on resource itself
   - ✅ Discoverable - easy to find with autocomplete
   - ✅ Consistent - same pattern as other operations

6. Error Handling:
   - Methods throw error if resource has no state machine
   - Clear error messages guide users to fix configuration
`);
