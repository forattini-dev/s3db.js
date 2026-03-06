import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';

describe('StateMachinePlugin - Error Handling', () => {
  let database;
  let plugin;
  let mockActions = {};
  let mockGuards = {};

  beforeEach(async () => {
    mockActions = {
      onConfirmed: vi.fn().mockResolvedValue({ action: 'confirmed' }),
      onShipped: vi.fn().mockResolvedValue({ action: 'shipped' }),
      onError: vi.fn().mockRejectedValue(new Error('Action failed'))
    };

    mockGuards = {
      canShip: vi.fn().mockResolvedValue(true),
      cannotShip: vi.fn().mockResolvedValue(false),
      guardError: vi.fn().mockRejectedValue(new Error('Guard failed'))
    };

    database = createDatabaseForTest('suite=plugins/state-machine');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        order_processing: {
          initialState: 'pending',
          states: {
            pending: { on: { CONFIRM: 'confirmed', CANCEL: 'cancelled' }, meta: { color: 'yellow' } },
            confirmed: { on: { PREPARE: 'preparing', CANCEL: 'cancelled' }, entry: 'onConfirmed', exit: 'onConfirmed' },
            preparing: { on: { SHIP: 'shipped', CANCEL: 'cancelled' }, guards: { SHIP: 'canShip' } },
            shipped: { on: { DELIVER: 'delivered', RETURN: 'returned' }, entry: 'onShipped' },
            delivered: { type: 'final' },
            cancelled: { type: 'final' },
            returned: { type: 'final' }
          }
        },
        user_onboarding: {
          initialState: 'registered',
          states: { registered: { on: { VERIFY_EMAIL: 'verified' } }, verified: { on: { COMPLETE_PROFILE: 'active' } }, active: { type: 'final' } }
        },
        test_guards: {
          initialState: 'start',
          states: {
            start: {
              on: { PASS: 'success', FAIL: 'failure', ERROR: 'error' },
              guards: { PASS: 'canShip', FAIL: 'cannotShip', ERROR: 'guardError' }
            },
            success: { type: 'final' },
            failure: { type: 'final' },
            error: { type: 'final' }
          }
        }
      },
      actions: mockActions,
      guards: mockGuards,
      persistTransitions: true
    });

    await database.connect();
    await plugin.install(database);
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should handle database setup errors gracefully', async () => {
    const errorPlugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        test: {
          initialState: 'start',
          states: { start: {} }
        }
      },
      persistTransitions: true
    });

    // Mock database that will fail during resource creation
    const mockDb = {
      createResource: vi.fn().mockRejectedValue(new Error('Database error'))
    };

    // Should not throw during plugin setup even if resource creation fails
    await errorPlugin.install(mockDb);

    expect(mockDb.createResource).toHaveBeenCalled();
    expect(errorPlugin.database).toBe(mockDb);
  });

  it('should normalize nested machine config using config wrapper', async () => {
    const wrapperPlugin = new StateMachinePlugin({
      stateMachines: {
        wrapped: {
          initialState: 'stale',
          states: {
            stale: {}
          },
          config: {
            initialState: 'idle',
            states: {
              idle: { on: { START: 'running' } },
              running: { type: 'final' }
            }
          }
        }
      },
      persistTransitions: false,
      logLevel: 'silent'
    });

    await wrapperPlugin.install(database);
    expect(wrapperPlugin.getMachineDefinition('wrapped')).toBeDefined();
    await expect(wrapperPlugin.send('wrapped', 'entity-1', 'START')).resolves.toMatchObject({
      from: 'idle',
      to: 'running'
    });
  });

  it('should handle resource creation errors', async () => {
    const mockDb = {
      createResource: vi.fn().mockRejectedValue(new Error('Resource creation failed')),
      resources: {}
    };

    // Should not throw even if resource creation fails
    const originalDb = plugin.database;
    plugin.database = mockDb;

    await expect(plugin._createStateResources()).resolves.toBeUndefined();

    plugin.database = originalDb;
  });

  it('should keep in-memory state aligned with persistence failure', async () => {
    await plugin.initializeEntity('order_processing', 'order1');

    const stateResource = database.resources[plugin.config.stateResource];
    vi.spyOn(stateResource, 'update').mockRejectedValue(new Error('State update failed'));
    vi.spyOn(stateResource, 'insert').mockRejectedValue(new Error('State insert failed'));

    await expect(
      plugin.send('order_processing', 'order1', 'CONFIRM')
    ).rejects.toThrow('Failed to persist entity state transition');

    const inMemoryState = await plugin.getState('order_processing', 'order1');
    const persisted = await stateResource.get('order_processing_order1');

    expect(inMemoryState).toBe('pending');
    expect(persisted.currentState).toBe('pending');
  });

  it('should delete entity state and history without persistence resources', async () => {
    const detachedPlugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        simple: {
          initialState: 'pending',
          states: {
            pending: { on: { DONE: 'done' } },
            done: { type: 'final' }
          }
        }
      },
      persistTransitions: true
    });

    const mockDb = {
      createResource: vi.fn().mockResolvedValue({}),
      resources: {}
    };

    await detachedPlugin.install(mockDb);
    await expect(detachedPlugin.deleteEntity('simple', 'entity-1')).resolves.toBeUndefined();
  });
});
