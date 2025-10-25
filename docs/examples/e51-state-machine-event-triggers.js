/**
 * State Machine Plugin - Event-Based Triggers Example
 *
 * This example demonstrates how to use event-based triggers to automatically
 * transition entities between states based on resource update events.
 *
 * Scenario: Order Processing Workflow
 * - Orders start in 'pending' state
 * - When payment is confirmed (via update event), order moves to 'processing'
 * - When shipment is created (via update event), order moves to 'shipped'
 * - When delivery is confirmed (via update event), order moves to 'delivered'
 */

import { Database, StateMachinePlugin } from '../src/index.js';

// Initialize database
const database = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/state-machine-events',
  region: 'us-east-1'
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

    // Payment tracking
    paymentStatus: 'string|optional',  // 'pending', 'confirmed', 'failed'
    paymentId: 'string|optional',

    // Shipping tracking
    shipmentId: 'string|optional',
    trackingNumber: 'string|optional',

    // Delivery tracking
    deliveredAt: 'string|optional',
    signature: 'string|optional',

    // State machine field
    orderStatus: 'string|optional'
  },
  timestamps: true
});

// Initialize State Machine Plugin
const stateMachine = new StateMachinePlugin({
  machines: {
    // Order Workflow State Machine
    orderWorkflow: {
      // Initial state for new orders
      initialState: 'pending',

      // State field in the resource
      stateField: 'orderStatus',

      // Resource to manage
      resource: ordersResource,

      // State definitions
      states: {
        pending: {
          description: 'Order created, waiting for payment',

          // Entry action when entering this state
          onEntry: async (context, event) => {
            console.log(`📋 Order ${context.id} created - Status: PENDING`);
            console.log(`   Customer: ${context.customerId}`);
            console.log(`   Total: $${context.totalAmount}`);
          },

          // Event-based trigger: Listen for updates to this specific order
          triggers: [{
            type: 'event',
            // Listen for the updated:{id} event from the orders resource
            eventName: `updated:${context => context.id}`,
            eventSource: ordersResource,

            // Condition to check before transitioning
            condition: (context, event) => {
              return context.paymentStatus === 'confirmed' && context.paymentId;
            },

            // Transition to processing state when payment is confirmed
            targetState: 'processing'
          }],

          // Allowed manual transitions
          transitions: {
            cancel: 'cancelled'
          }
        },

        processing: {
          description: 'Payment confirmed, processing order',

          onEntry: async (context, event) => {
            console.log(`\n💳 Order ${context.id} - Payment confirmed!`);
            console.log(`   Payment ID: ${context.paymentId}`);
            console.log(`   Status: PROCESSING`);

            // Simulate order processing
            console.log(`   📦 Preparing order for shipment...`);
          },

          // Event-based trigger: Listen for shipment creation
          triggers: [{
            type: 'event',
            eventName: `updated:${context => context.id}`,
            eventSource: ordersResource,

            condition: (context, event) => {
              return context.shipmentId && context.trackingNumber;
            },

            targetState: 'shipped'
          }],

          transitions: {
            cancel: 'cancelled'
          }
        },

        shipped: {
          description: 'Order shipped, in transit',

          onEntry: async (context, event) => {
            console.log(`\n🚚 Order ${context.id} - Shipped!`);
            console.log(`   Shipment ID: ${context.shipmentId}`);
            console.log(`   Tracking: ${context.trackingNumber}`);
            console.log(`   Status: SHIPPED`);
          },

          // Event-based trigger: Listen for delivery confirmation
          triggers: [{
            type: 'event',
            eventName: `updated:${context => context.id}`,
            eventSource: ordersResource,

            condition: (context, event) => {
              return context.deliveredAt && context.signature;
            },

            targetState: 'delivered'
          }],

          transitions: {
            // Can return to processing if there's a delivery issue
            returnToSender: 'processing'
          }
        },

        delivered: {
          description: 'Order delivered to customer',

          onEntry: async (context, event) => {
            console.log(`\n✅ Order ${context.id} - DELIVERED!`);
            console.log(`   Delivered at: ${context.deliveredAt}`);
            console.log(`   Signature: ${context.signature}`);
            console.log(`   🎉 Order workflow completed successfully!`);
          },

          transitions: {
            // Allow returns
            return: 'returned'
          }
        },

        cancelled: {
          description: 'Order cancelled',

          onEntry: async (context, event) => {
            console.log(`\n❌ Order ${context.id} - CANCELLED`);
          }
        },

        returned: {
          description: 'Order returned by customer',

          onEntry: async (context, event) => {
            console.log(`\n↩️  Order ${context.id} - RETURNED`);
          }
        }
      }
    }
  }
});

// Install the plugin
await database.usePlugin(stateMachine);

console.log('🎯 State Machine Plugin initialized with event-based triggers\n');
console.log('=' .repeat(60));

// ============================================================================
// EXAMPLE 1: Complete order workflow using events
// ============================================================================

console.log('\n📝 EXAMPLE 1: Complete Order Workflow\n');

// Create a new order
const order = await ordersResource.insert({
  customerId: 'cust-123',
  productId: 'prod-456',
  quantity: 2,
  totalAmount: 199.99,
  paymentStatus: 'pending'
});

console.log(`\nOrder ID: ${order.id}`);

// Initialize state machine for this order
await stateMachine.initializeEntity('orderWorkflow', order.id);

// Wait a bit for state machine to process
await new Promise(resolve => setTimeout(resolve, 100));

// ============================================================================
// Step 1: Payment confirmation triggers transition to 'processing'
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('STEP 1: Confirming payment...');
console.log('='.repeat(60));

await ordersResource.update(order.id, {
  paymentStatus: 'confirmed',
  paymentId: 'pay-' + Date.now()
});

// Wait for event trigger to process
await new Promise(resolve => setTimeout(resolve, 200));

// Check current state
let currentOrder = await ordersResource.get(order.id);
console.log(`\n📊 Current Order Status: ${currentOrder.orderStatus}`);

// ============================================================================
// Step 2: Shipment creation triggers transition to 'shipped'
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('STEP 2: Creating shipment...');
console.log('='.repeat(60));

await ordersResource.update(order.id, {
  shipmentId: 'ship-' + Date.now(),
  trackingNumber: 'TRK' + Math.random().toString(36).substring(2, 10).toUpperCase()
});

// Wait for event trigger to process
await new Promise(resolve => setTimeout(resolve, 200));

currentOrder = await ordersResource.get(order.id);
console.log(`\n📊 Current Order Status: ${currentOrder.orderStatus}`);

// ============================================================================
// Step 3: Delivery confirmation triggers transition to 'delivered'
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('STEP 3: Confirming delivery...');
console.log('='.repeat(60));

await ordersResource.update(order.id, {
  deliveredAt: new Date().toISOString(),
  signature: 'John Doe'
});

// Wait for event trigger to process
await new Promise(resolve => setTimeout(resolve, 200));

currentOrder = await ordersResource.get(order.id);
console.log(`\n📊 Final Order Status: ${currentOrder.orderStatus}`);

// ============================================================================
// EXAMPLE 2: Cancelled order workflow
// ============================================================================

console.log('\n\n' + '='.repeat(60));
console.log('📝 EXAMPLE 2: Cancelled Order\n');
console.log('='.repeat(60));

const order2 = await ordersResource.insert({
  customerId: 'cust-789',
  productId: 'prod-101',
  quantity: 1,
  totalAmount: 49.99,
  paymentStatus: 'pending'
});

console.log(`\nOrder ID: ${order2.id}`);

await stateMachine.initializeEntity('orderWorkflow', order2.id);
await new Promise(resolve => setTimeout(resolve, 100));

// Cancel the order manually
console.log('\n❌ Cancelling order...');
await stateMachine.transition('orderWorkflow', order2.id, 'cancel');
await new Promise(resolve => setTimeout(resolve, 100));

const cancelledOrder = await ordersResource.get(order2.id);
console.log(`\n📊 Order Status: ${cancelledOrder.orderStatus}`);

// ============================================================================
// EXAMPLE 3: Listen to state machine events
// ============================================================================

console.log('\n\n' + '='.repeat(60));
console.log('📝 EXAMPLE 3: Monitoring State Machine Events\n');
console.log('='.repeat(60));

// Listen to transition events
stateMachine.on('plg:state-machine:transition', (data) => {
  console.log(`\n🔄 State Transition Detected:`);
  console.log(`   Machine: ${data.machineId}`);
  console.log(`   Entity: ${data.entityId}`);
  console.log(`   ${data.fromState} → ${data.toState}`);
  console.log(`   Event: ${data.event}`);
});

// Listen to trigger executions
stateMachine.on('plg:state-machine:trigger-executed', (data) => {
  console.log(`\n⚡ Trigger Executed:`);
  console.log(`   Machine: ${data.machineId}`);
  console.log(`   Entity: ${data.entityId}`);
  console.log(`   Trigger Type: ${data.triggerType}`);
  console.log(`   Result: ${data.result}`);
});

const order3 = await ordersResource.insert({
  customerId: 'cust-999',
  productId: 'prod-202',
  quantity: 3,
  totalAmount: 299.99,
  paymentStatus: 'pending'
});

await stateMachine.initializeEntity('orderWorkflow', order3.id);
await new Promise(resolve => setTimeout(resolve, 100));

// Trigger transition with payment confirmation
console.log('\n💳 Confirming payment for order 3...');
await ordersResource.update(order3.id, {
  paymentStatus: 'confirmed',
  paymentId: 'pay-' + Date.now()
});

await new Promise(resolve => setTimeout(resolve, 300));

// ============================================================================
// Summary
// ============================================================================

console.log('\n\n' + '='.repeat(60));
console.log('📊 SUMMARY');
console.log('='.repeat(60));

const allOrders = await ordersResource.query({});
console.log(`\nTotal orders: ${allOrders.length}`);

for (const ord of allOrders) {
  console.log(`\n  Order ${ord.id}:`);
  console.log(`    Status: ${ord.orderStatus}`);
  console.log(`    Amount: $${ord.totalAmount}`);
  console.log(`    Customer: ${ord.customerId}`);
}

console.log('\n\n' + '='.repeat(60));
console.log('✅ Example completed successfully!');
console.log('='.repeat(60));

console.log(`
KEY TAKEAWAYS:
==============

1. Event-Based Triggers:
   - Use 'updated:\${id}' events to react to resource updates
   - Conditions determine when to transition
   - Fully automated workflow based on data changes

2. Event Format:
   - Generic events: 'updated', 'inserted', 'deleted'
   - ID-specific events: 'updated:\${id}', 'inserted:\${id}'
   - Plugin events: 'plg:state-machine:transition'

3. Trigger Configuration:
   triggers: [{
     type: 'event',
     eventName: 'updated:\${context => context.id}',
     eventSource: ordersResource,
     condition: (context, event) => context.paymentStatus === 'confirmed',
     targetState: 'processing'
   }]

4. Workflow Automation:
   - No manual transitions needed
   - State changes based on business logic
   - Automatic progression through states

5. Use Cases:
   - Order processing workflows
   - Document approval chains
   - User onboarding flows
   - Ticket status tracking
   - Asset lifecycle management
`);

// Cleanup
await database.disconnect();
