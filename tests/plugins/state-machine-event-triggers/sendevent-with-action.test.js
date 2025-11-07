import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';


describe.skip('StateMachinePlugin - Event Triggers (New API) - sendEvent with action', () => {
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

  it.skip('should send event after executing action', async () => {
    const transitions = [];

    stateMachinePlugin = new StateMachinePlugin({
      verbose: false,
      enableEventTriggers: true,
      persistTransitions: true,  // Need to persist context
      actions: {
        validateOrder: async (context) => {
          return { valid: true };
        }
      },
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
                eventSource: orders,
                condition: (context, entityId, eventData) => {
                  return eventData.validated === true;
                },
                action: 'validateOrder',
                sendEvent: 'VALIDATED'  // Send this event after action succeeds
              }],
              on: {
                VALIDATED: 'validated'
              }
            },
            validated: {
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
      id: 'order-send-event',
      customerId: 'customer-4',
      total: 200,
      status: 'pending',
      validated: false
    });

    await stateMachinePlugin.initializeEntity('order', 'order-send-event', { id: 'order-send-event' });
    await new Promise(resolve => setTimeout(resolve, 100));

    // Trigger action + sendEvent
    await orders.update('order-send-event', { validated: true });
    await new Promise(resolve => setTimeout(resolve, 200));

    // Should have transitioned via VALIDATED event
    const order = await orders.get('order-send-event');
    expect(order.status).toBe('validated');

    // Verify transition occurred
    expect(transitions.some(t => t.to === 'validated' && t.event === 'VALIDATED')).toBe(true);
  });
});
