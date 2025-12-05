import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';


describe.skip('StateMachinePlugin - Event Triggers (New API) - eventSource for resource-specific events', () => {
  let database;
  let orders;
  let stateMachinePlugin;

  beforeEach(async () => {
    database = await createDatabaseForTest('state-machine-event-triggers');

    orders = await database.createResource({
      name: 'orders',
      attributes: {
        id: 'string|optional',
        customerId: 'string|required',
        total: 'number|required',
        status: 'string|required',
        paymentStatus: 'string|optional',
        shipmentId: 'string|optional',
        trackingNumber: 'string|optional'
      }
    });
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should listen to events from specific resource via eventSource', async () => {
    const triggerExecutions = [];

    stateMachinePlugin = new StateMachinePlugin({
      logLevel: 'silent',
      enableEventTriggers: true,
      persistTransitions: false,
      stateMachines: {
        order: {
          resource: 'orders',
          stateField: 'status',
          initialState: 'pending',
          states: {
            pending: {
              triggers: [{
                type: 'event',
                eventName: 'updated',  // Listen to 'updated' event from orders resource
                eventSource: orders,   // Resource to listen to
                condition: (context, entityId, eventData) => {
                  return eventData.shipmentId !== undefined;
                },
                targetState: 'shipped'
              }]
            },
            shipped: {
              type: 'final'
            }
          }
        }
      }
    });

    await database.usePlugin(stateMachinePlugin);

    // Listen to trigger executions
    stateMachinePlugin.on('plg:state-machine:trigger-executed', (data) => {
      triggerExecutions.push(data);
    });

    // Create order
    await orders.insert({
      id: 'order-456',
      customerId: 'customer-2',
      total: 149.99,
      status: 'pending'
    });

    // Initialize state machine for this entity
    await stateMachinePlugin.initializeEntity('order', 'order-456', { id: 'order-456' });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Update with shipment info - should trigger state change
    await orders.update('order-456', {
      shipmentId: 'shipment-789'
    });

    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify state changed
    const shippedOrder = await orders.get('order-456');
    expect(shippedOrder.status).toBe('shipped');
    expect(triggerExecutions.length).toBeGreaterThan(0);
  });
});
