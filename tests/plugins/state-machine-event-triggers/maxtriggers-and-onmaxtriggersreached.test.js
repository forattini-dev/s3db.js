import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';


describe.skip('StateMachinePlugin - Event Triggers (New API) - maxTriggers and onMaxTriggersReached', () => {
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

  it.skip('DEBUG: test basic event trigger setup', async () => {
    let triggerFired = false;

    const consoleLog = console.log;
    const logs = [];
    console.log = (...args) => {
      logs.push(args.join(' '));
      consoleLog(...args);
    };

    stateMachinePlugin = new StateMachinePlugin({
      verbose: false,
      enableEventTriggers: true,
      persistTransitions: true,
      verbose: false,
      actions: {
        testAction: async () => {
          triggerFired = true;
          consoleLog('ACTION EXECUTED!');
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
                action: 'testAction'
              }]
            }
          }
        }
      }
    });

    await database.usePlugin(stateMachinePlugin);
    consoleLog('Plugin installed');

    const order = await orders.insert({
      id: 'debug-test',
      customerId: 'cust-1',
      total: 100,
      status: 'pending'
    });
    consoleLog('Order inserted:', order.id);

    await stateMachinePlugin.initializeEntity('order', 'debug-test');
    consoleLog('Entity initialized');
    await new Promise(resolve => setTimeout(resolve, 100));

    consoleLog('About to update order...');
    await orders.update('debug-test', { total: 200 });
    consoleLog('Order updated');

    await new Promise(resolve => setTimeout(resolve, 500));

    consoleLog('Trigger fired:', triggerFired);
    consoleLog('All logs:', logs);

    expect(triggerFired).toBe(true);
  });

  it('should limit trigger executions with maxTriggers', async () => {
    const actionCalls = [];

    stateMachinePlugin = new StateMachinePlugin({
      verbose: false,
      enableEventTriggers: true,
      persistTransitions: true,  // Need to persist to track triggerCounts
      actions: {
        incrementCounter: async (context) => {
          actionCalls.push(context);
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
                action: 'incrementCounter',
                maxTriggers: 2  // Only execute twice
              }]
            }
          }
        }
      }
    });

    await database.usePlugin(stateMachinePlugin);

    await orders.insert({
      id: 'order-max',
      customerId: 'customer-1',
      total: 100,
      status: 'pending'
    });

    await stateMachinePlugin.initializeEntity('order', 'order-max', { id: 'order-max' });
    await new Promise(resolve => setTimeout(resolve, 100));

    // First update - should execute (1/2)
    await orders.update('order-max', { total: 101 });
    await new Promise(resolve => setTimeout(resolve, 100));

    // Second update - should execute (2/2)
    await orders.update('order-max', { total: 102 });
    await new Promise(resolve => setTimeout(resolve, 100));

    // Third update - should NOT execute (max reached)
    await orders.update('order-max', { total: 103 });
    await new Promise(resolve => setTimeout(resolve, 100));

    // Fourth update - should NOT execute (max reached)
    await orders.update('order-max', { total: 104 });
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(actionCalls.length).toBe(2); // Only executed twice
  });

  it.skip('should send event when onMaxTriggersReached', async () => {
    const transitions = [];
    const events = [];

    stateMachinePlugin = new StateMachinePlugin({
      verbose: false,
      enableEventTriggers: true,
      persistTransitions: true,  // Need to persist to track triggerCounts
      actions: {
        processPayment: async () => ({ processed: true })
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
                // Action without targetState - stays in same state
                action: 'processPayment',
                maxTriggers: 2,  // Allow 2 executions
                onMaxTriggersReached: 'MAX_RETRIES'  // Event to send when limit reached
              }],
              on: {
                MAX_RETRIES: 'failed',
                PROCESS: 'processing'
              }
            },
            processing: {
              type: 'final'
            },
            failed: {
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

    stateMachinePlugin.on('plg:state-machine:trigger-executed', (data) => {
      events.push(data);
    });

    await orders.insert({
      id: 'order-max-event',
      customerId: 'customer-2',
      total: 100,
      status: 'pending'
    });

    await stateMachinePlugin.initializeEntity('order', 'order-max-event', { id: 'order-max-event' });
    await new Promise(resolve => setTimeout(resolve, 100));

    // First update - trigger executes (1/2), stays in pending
    await orders.update('order-max-event', { total: 101 });
    await new Promise(resolve => setTimeout(resolve, 200));

    const order1 = await orders.get('order-max-event');
    expect(order1.status).toBe('pending');

    // Second update - trigger executes (2/2), stays in pending
    await orders.update('order-max-event', { total: 102 });
    await new Promise(resolve => setTimeout(resolve, 200));

    const order2 = await orders.get('order-max-event');
    expect(order2.status).toBe('pending');

    // Third update - max reached (2), should send MAX_RETRIES event → failed state
    await orders.update('order-max-event', { total: 103 });
    await new Promise(resolve => setTimeout(resolve, 200));

    const order3 = await orders.get('order-max-event');
    expect(order3.status).toBe('failed');

    // Verify transition to failed happened
    expect(transitions.some(t => t.to === 'failed' && t.event === 'MAX_RETRIES')).toBe(true);

    // Verify trigger-executed events (should have 2, not 3)
    if (events.length !== 2) {
    }
    expect(events.length).toBe(2);
  });
});
