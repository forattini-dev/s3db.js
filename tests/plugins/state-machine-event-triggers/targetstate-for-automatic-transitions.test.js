import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';


describe.skip('StateMachinePlugin - Event Triggers (New API) - targetState for automatic transitions', () => {
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

  it('should automatically transition to targetState when trigger fires', async () => {
    const transitions = [];

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
                eventName: 'updated',
                eventSource: orders,
                condition: (context, entityId, eventData) => {
                  return eventData.trackingNumber !== undefined;
                },
                targetState: 'inTransit'  // Automatic transition
              }]
            },
            inTransit: {},
            delivered: {
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

    // Create order
    await orders.insert({
      id: 'order-789',
      customerId: 'customer-3',
      total: 199.99,
      status: 'pending'
    });

    // Initialize state machine for this entity
    await stateMachinePlugin.initializeEntity('order', 'order-789', { id: 'order-789' });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Add tracking number - should auto-transition
    await orders.update('order-789', {
      trackingNumber: 'TRACK-123456'
    });

    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify automatic transition happened
    const order = await orders.get('order-789');
    expect(order.status).toBe('inTransit');

    // Verify transition was recorded
    const transition = transitions.find(t => t.entityId === 'order-789' && t.to === 'inTransit');
    expect(transition).toBeDefined();
    expect(transition.from).toBe('pending');
    expect(transition.to).toBe('inTransit');
  });

  it('should not execute action when targetState is provided', async () => {
    let actionExecuted = false;

    stateMachinePlugin = new StateMachinePlugin({
      logLevel: 'silent',
      enableEventTriggers: true,
      persistTransitions: false,
      actions: {
        shouldNotExecute: async () => {
          actionExecuted = true;
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
                action: 'shouldNotExecute',  // Should be skipped
                targetState: 'completed'      // Takes precedence
              }]
            },
            completed: {
              type: 'final'
            }
          }
        }
      }
    });

    await database.usePlugin(stateMachinePlugin);

    await orders.insert({
      id: 'order-999',
      customerId: 'customer-4',
      total: 99.99,
      status: 'pending'
    });

    // Initialize state machine for this entity
    await stateMachinePlugin.initializeEntity('order', 'order-999', { id: 'order-999' });

    await new Promise(resolve => setTimeout(resolve, 100));

    await orders.update('order-999', { paymentStatus: 'done' });
    await new Promise(resolve => setTimeout(resolve, 200));

    const order = await orders.get('order-999');
    expect(order.status).toBe('completed');
    expect(actionExecuted).toBe(false); // Action should NOT execute when targetState is provided
  });
});
