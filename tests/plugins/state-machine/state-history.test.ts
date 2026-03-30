import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine/index.js';

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

describe('StateMachinePlugin - State History Helpers', () => {
  let database;
  let plugin;
  const transitionCount = 120;

  const initializeHistoryMachine = async () => {
    await plugin.initializeEntity('order_flow', 'order-1');

    await plugin.send('order_flow', 'order-1', 'START');
    for (let index = 0; index < transitionCount; index++) {
      await sleep(2);
      await plugin.send('order_flow', 'order-1', 'TICK');
    }
  };

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/state-machine-state-history');
    await database.connect();
    await database.createResource({
      name: 'orders',
      attributes: {
        id: 'string|required',
        customerId: 'string|default:unknown'
      },
      behavior: 'body-only'
    });

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        order_flow: {
          initialState: 'pending',
          states: {
            pending: { on: { START: 'processing' } },
            processing: { on: { TICK: 'processing' } }
          },
          resource: 'orders'
        }
      },
      persistTransitions: true
    });

    await plugin.install(database);
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should return all transitions for an entity when n is omitted', async () => {
    const orders = database.resources.orders;
    await initializeHistoryMachine();

    const all = await orders.state.getLastTransitions('order-1');

    expect(all).toHaveLength(transitionCount + 1);
    expect(all[0].event).toBe('TICK');
    expect(all[all.length - 1].event).toBe('START');
  });

  it('should return only last N transitions when n is passed', async () => {
    const orders = database.resources.orders;
    await initializeHistoryMachine();

    const latest = await orders.state.getLastTransitions('order-1', 10);
    const all = await orders.state.getLastTransitions('order-1');
    const limitedByPlugin = await plugin.getLastTransitions('order_flow', 'order-1', 1);

    expect(latest).toHaveLength(10);
    expect(all).toHaveLength(transitionCount + 1);
    expect(limitedByPlugin).toHaveLength(1);
    expect(latest[0].event).toBe('TICK');
    expect(all[0].event).toBe('TICK');
    expect(limitedByPlugin[0].event).toBe('TICK');
  });
});
