import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';


describe.skip('StateMachinePlugin - Event Triggers (New API) - eventName as function (dynamic event names)', () => {
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

  it('should support eventName as function for dynamic event names', async () => {
    const transitions = [];

    stateMachinePlugin = new StateMachinePlugin({
      verbose: false,
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
                eventName: (context) => `updated:${context.id}`,  // Dynamic function
                eventSource: orders,
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

    await database.usePlugin(stateMachinePlugin);

    // Listen to transitions
    stateMachinePlugin.on('plg:state-machine:transition', (data) => {
      transitions.push(data);
    });

    // Create order
    const order = await orders.insert({
      id: 'order-123',
      customerId: 'customer-1',
      total: 99.99,
      status: 'pending',
      paymentStatus: 'pending'
    });

    expect(order.status).toBe('pending');

    // Initialize state machine for this entity
    await stateMachinePlugin.initializeEntity('order', 'order-123', { id: 'order-123' });

    // Wait a bit for plugin initialization
    await new Promise(resolve => setTimeout(resolve, 100));

    // Update order with payment confirmation (triggers state change)
    await orders.update('order-123', {
      paymentStatus: 'confirmed'
    });

    // Wait for event processing
    await new Promise(resolve => setTimeout(resolve, 200));

    // Check that transition happened
    const updatedOrder = await orders.get('order-123');
    expect(updatedOrder.status).toBe('processing');
    expect(transitions.length).toBeGreaterThan(0);
    expect(transitions.some(t => t.to === 'processing')).toBe(true);
  });
});
