import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';

describe('StateMachinePlugin - Definition Diagnostics', () => {
  let database;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/state-machine');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        order_flow: {
          initialState: 'draft',
          states: {
            draft: { on: { SUBMIT: 'submitted', CANCEL: 'cancelled' } },
            submitted: { on: { APPROVE: 'approved' } },
            approved: { type: 'final' },
            cancelled: { type: 'final' }
          }
        },
        archive_flow: {
          initialState: 'active',
          states: {
            active: { on: { ARCHIVE: 'archived' } },
            archived: { type: 'final' },
            orphan: { type: 'final' }
          }
        }
      },
      persistTransitions: false
    });

    await database.connect();
    await plugin.install(database);
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should expose per-machine diagnostics and summary stats', async () => {
    const all = plugin.getDefinitionDiagnostics();

    expect(all.order_flow).toMatchObject({
      machineId: 'order_flow',
      errors: [],
      stats: {
        states: 4,
        transitions: 3
      }
    });
    expect(all.order_flow.stats.deadStates).toEqual([]);
    expect(all.order_flow.stats.unreachableStates).toEqual([]);
  });

  it('should flag unreachable and orphan states', async () => {
    const diag = plugin.getMachineDefinitionDiagnostics('archive_flow');

    expect(diag).not.toBeNull();
    expect(diag.warnings.some((warning) => warning.code === 'UNREACHABLE_STATE')).toBe(true);
    expect(diag.warnings.some((warning) => warning.code === 'ORPHAN_STATE')).toBe(true);
    expect(diag.stats.unreachableStates).toContain('orphan');
  });

  it('should reject invalid machine definitions at plugin creation time', () => {
    expect(() => {
      new StateMachinePlugin({
        logLevel: 'silent',
        stateMachines: {
          broken: {
            initialState: 'start',
            states: {
              start: {
                on: {
                  GO: 'missing-state'
                },
                guards: {
                  GO: 'missingGuard'
                }
              },
              done: { type: 'final' }
            }
          }
        },
        persistTransitions: false
      });
    }).toThrow(/definition is invalid/);
  });
});
