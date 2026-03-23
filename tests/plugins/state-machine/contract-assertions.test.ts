import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';

describe('StateMachinePlugin - Contract Assertions', () => {
  let database;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/state-machine-contract-assertions');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        checkout: {
          initialState: 'draft',
          states: {
            draft: {
              on: {
                SUBMIT: 'submitted',
                CANCEL: 'cancelled'
              }
            },
            submitted: { on: { APPROVE: 'approved' } },
            approved: { type: 'final' },
            cancelled: { type: 'final' }
          }
        },
        guarded: {
          initialState: 'start',
          states: {
            start: {
              on: {
                START: 'running'
              },
              guards: {
                START: 'requireAmount'
              }
            },
            running: { type: 'final' }
          }
        }
      },
      guards: {
        requireAmount: (context) => Number(context.amount) > 0
      },
      persistTransitions: false
    });

    await database.connect();
    await plugin.install(database);

    await plugin.initializeEntity('checkout', 'order-1');
    await plugin.initializeEntity('guarded', 'guarded-1');
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should assert successful transition with expected origin and destination', async () => {
    const result = await plugin.assertTransition({
      machineId: 'checkout',
      entityId: 'order-1',
      event: 'SUBMIT',
      to: 'submitted',
      from: 'draft'
    });

    expect(result).toMatchObject({
      ok: true,
      from: 'draft',
      to: 'submitted'
    });
  });

  it('should assert rejected transition when guard blocks transition', async () => {
    const result = await plugin.assertReject({
      machineId: 'guarded',
      entityId: 'guarded-1',
      event: 'START',
      to: 'running',
      code: 'GUARD_REJECTED',
      reason: 'MISSING_REQUIRED_FIELD',
      context: {
        amount: 0
      }
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'GUARD_REJECTED',
      reason: 'MISSING_REQUIRED_FIELD'
    });
  });

  it('should assert rejected transition for invalid event', async () => {
    const result = await plugin.assertReject({
      machineId: 'checkout',
      entityId: 'order-1',
      event: 'INVALID',
      from: 'draft',
      code: 'INVALID_EVENT',
      reason: 'INVALID_EVENT'
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'INVALID_EVENT',
      reason: 'INVALID_EVENT'
    });
  });
});
