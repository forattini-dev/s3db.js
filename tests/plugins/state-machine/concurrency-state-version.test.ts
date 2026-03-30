import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine/index.js';

describe('StateMachinePlugin - Concurrency and Versioning', () => {
  let database;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/state-machine');
    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        order_processing: {
          initialState: 'pending',
          states: {
            pending: { on: { CONFIRM: 'confirmed' } },
            confirmed: { on: { PREPARE: 'preparing' } },
            preparing: { on: { SHIP: 'shipped' }, type: 'final' },
            shipped: { type: 'final' }
          }
        }
      },
      persistTransitions: true
    });

    await database.connect();
    await plugin.install(database);
    await plugin.initializeEntity('order_processing', 'order1', { id: 'order1' });
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should reject stale transitions with STATE_VERSION_MISMATCH', async () => {
    const firstTransition = await plugin.send('order_processing', 'order1', 'CONFIRM');
    expect(firstTransition).toMatchObject({ ok: true, stateVersion: 1, to: 'confirmed' });

    const stale = await plugin.send('order_processing', 'order1', 'PREPARE', {
      stateVersion: 0
    });
    expect(stale).toMatchObject({
      ok: false,
      code: 'STATE_VERSION_MISMATCH',
      reason: 'STATE_VERSION_MISMATCH'
    });

    const state = await plugin.getState('order_processing', 'order1');
    expect(state).toBe('confirmed');
  });

  it('should validate global concurrency configuration', () => {
    expect(() => {
      new StateMachinePlugin({
        logLevel: 'silent',
        concurrency: {
          mode: 'not-a-mode',
          conflict: 'reject'
        },
        stateMachines: {
          order_processing: {
            initialState: 'pending',
            states: {
              pending: { on: { START: 'done' } },
              done: { type: 'final' }
            }
          }
        },
        persistTransitions: false
      });
    }).toThrow(/Invalid global concurrency mode/);
  });
});
