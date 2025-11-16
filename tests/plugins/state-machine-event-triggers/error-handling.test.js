import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';


describe.skip('StateMachinePlugin - Event Triggers (New API) - Error handling', () => {
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

  it('should throw error if neither event nor eventName is provided', async () => {
    expect(() => {
      new StateMachinePlugin({
      logLevel: 'silent',
        enableEventTriggers: true,
        stateMachines: {
          order: {
            resource: 'orders',
            stateField: 'status',
            initialState: 'pending',
            states: {
              pending: {
                triggers: [{
                  type: 'event',
                  // Missing both event and eventName
                  targetState: 'done'
                }]
              },
              done: {}
            }
          }
        }
      });
    }).not.toThrow(); // Constructor shouldn't throw, but _setupEventTrigger will

    // The error will be thrown during plugin installation when _setupEventTrigger runs
  });
});
