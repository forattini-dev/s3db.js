import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';


describe.skip('StateMachinePlugin - Event Triggers (New API) - trigger-executed event validation', () => {
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

  it('should emit detailed trigger-executed event', async () => {
    const executedEvents = [];

    stateMachinePlugin = new StateMachinePlugin({
      logLevel: 'silent',
      enableEventTriggers: true,
      persistTransitions: true,  // Need to persist context
      stateMachines: {
        order: {
          resource: 'orders',
          stateField: 'status',
          initialState: 'pending',
          states: {
            pending: {
              triggers: [{
                type: 'event',
                eventName: (context) => `updated:${context.id}`,
                eventSource: orders,
                targetState: 'completed'
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

    stateMachinePlugin.on('plg:state-machine:trigger-executed', (data) => {
      executedEvents.push(data);
    });

    await orders.insert({
      id: 'order-event-detail',
      customerId: 'customer-5',
      total: 250,
      status: 'pending'
    });

    await stateMachinePlugin.initializeEntity('order', 'order-event-detail', { id: 'order-event-detail' });
    await new Promise(resolve => setTimeout(resolve, 100));

    // Trigger
    await orders.update('order-event-detail', { total: 251 });
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify trigger-executed event
    expect(executedEvents.length).toBeGreaterThan(0);

    const event = executedEvents[0];
    expect(event.machineId).toBe('order');
    expect(event.entityId).toBe('order-event-detail');
    expect(event.state).toBe('pending');
    expect(event.type).toBe('event');
    expect(event.eventName).toBe('updated:order-event-detail');
    expect(event.targetState).toBe('completed');
    expect(event.trigger).toBeDefined();
  });
});
