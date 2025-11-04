import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';


describe.skip('StateMachinePlugin - Event Triggers (New API) - Backward compatibility with old API', () => {
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

  it('should still work with old API (trigger.event)', async () => {
    const transitions = [];

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
                event: 'updated',  // Old API (string instead of eventName function)
                eventSource: orders,
                targetState: 'done'
              }]
            },
            done: {
              type: 'final'
            }
          }
        }
      }
    });

    await database.usePlugin(stateMachinePlugin);

    stateMachinePlugin.on('plg:state-machine:transition', (data) => {
      transitions.push(data);
    });

    await orders.insert({
      id: 'order-old',
      customerId: 'customer-5',
      total: 49.99,
      status: 'pending'
    });

    // Initialize state machine for this entity
    await stateMachinePlugin.initializeEntity('order', 'order-old', { id: 'order-old' });

    await new Promise(resolve => setTimeout(resolve, 100));

    await orders.update('order-old', { paymentStatus: 'paid' });
    await new Promise(resolve => setTimeout(resolve, 200));

    const order = await orders.get('order-old');
    expect(order.status).toBe('done');
  });
});
