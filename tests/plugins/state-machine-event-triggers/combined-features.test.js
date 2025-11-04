import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';


describe.skip('StateMachinePlugin - Event Triggers (New API) - Combined features', () => {
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

  it('should support eventName function + eventSource + targetState together', async () => {
    const executedTriggers = [];

    stateMachinePlugin = new StateMachinePlugin({
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
                eventName: (context) => `updated:${context.id}`,  // Function
                eventSource: orders,                               // Specific resource
                condition: (context, entityId, eventData) => {
                  return eventData.paymentStatus === 'confirmed' &&
                         eventData.shipmentId !== undefined;
                },
                targetState: 'readyToShip'  // Auto transition
              }]
            },
            readyToShip: {
              type: 'final'
            }
          }
        }
      }
    });

    await database.usePlugin(stateMachinePlugin);

    stateMachinePlugin.on('plg:state-machine:trigger-executed', (data) => {
      executedTriggers.push(data);
    });

    // Create order
    await orders.insert({
      id: 'order-combined',
      customerId: 'customer-6',
      total: 299.99,
      status: 'pending',
      paymentStatus: 'pending'
    });

    // Initialize state machine for this entity
    await stateMachinePlugin.initializeEntity('order', 'order-combined', { id: 'order-combined' });

    await new Promise(resolve => setTimeout(resolve, 100));

    // First update: only payment (should NOT trigger)
    await orders.update('order-combined', {
      paymentStatus: 'confirmed'
    });

    await new Promise(resolve => setTimeout(resolve, 200));

    let order = await orders.get('order-combined');
    expect(order.status).toBe('pending'); // Still pending

    // Second update: add shipment (now BOTH conditions met, should trigger)
    await orders.update('order-combined', {
      shipmentId: 'ship-999'
    });

    await new Promise(resolve => setTimeout(resolve, 200));

    order = await orders.get('order-combined');
    expect(order.status).toBe('readyToShip');
    expect(executedTriggers.length).toBeGreaterThan(0);
    expect(executedTriggers.some(t => t.targetState === 'readyToShip')).toBe(true);
  });
});
