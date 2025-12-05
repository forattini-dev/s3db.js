import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';


describe.skip('StateMachinePlugin - Event Triggers (New API) - action without targetState', () => {
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

  it('should execute custom action when trigger fires', async () => {
    let actionResult = null;
    let actionContext = null;

    stateMachinePlugin = new StateMachinePlugin({
      logLevel: 'silent',
      enableEventTriggers: true,
      persistTransitions: true,  // Need to persist context
      actions: {
        processPayment: async (context, event, machine) => {
          actionContext = context;
          actionResult = { processed: true, amount: context.totalAmount };
          return actionResult;
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
                  return eventData.paymentStatus === 'ready';
                },
                action: 'processPayment'  // Execute action, no automatic transition
              }]
            }
          }
        }
      }
    });

    await database.usePlugin(stateMachinePlugin);

    await orders.insert({
      id: 'order-action',
      customerId: 'customer-3',
      total: 150,
      totalAmount: 150,
      status: 'pending',
      paymentStatus: 'pending'
    });

    await stateMachinePlugin.initializeEntity('order', 'order-action', { id: 'order-action', totalAmount: 150 });
    await new Promise(resolve => setTimeout(resolve, 100));

    // Trigger the action
    await orders.update('order-action', { paymentStatus: 'ready' });
    await new Promise(resolve => setTimeout(resolve, 200));

    // Action should have been executed
    expect(actionResult).not.toBeNull();
    expect(actionResult.processed).toBe(true);
    expect(actionResult.amount).toBe(150);
    expect(actionContext).not.toBeNull();

    // State should remain 'pending' (no automatic transition)
    const order = await orders.get('order-action');
    expect(order.status).toBe('pending');
  });
});
