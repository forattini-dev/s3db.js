import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';
import { StateMachinePlugin } from '../../src/plugins/state-machine.plugin.js';

describe('StateMachinePlugin', () => {
  let database;
  let plugin;
  let mockActions = {};
  let mockGuards = {};

  beforeEach(async () => {
    // Reset mocks
    mockActions = {
      onConfirmed: jest.fn().mockResolvedValue({ action: 'confirmed' }),
      onShipped: jest.fn().mockResolvedValue({ action: 'shipped' }),
      onError: jest.fn().mockRejectedValue(new Error('Action failed'))
    };
    
    mockGuards = {
      canShip: jest.fn().mockResolvedValue(true),
      cannotShip: jest.fn().mockResolvedValue(false),
      guardError: jest.fn().mockRejectedValue(new Error('Guard failed'))
    };

    // Setup database
    database = createDatabaseForTest('suite=plugins/state-machine');
    
    // Create plugin with test configuration
    plugin = new StateMachinePlugin({
      stateMachines: {
        order_processing: {
          initialState: 'pending',
          states: {
            pending: {
              on: {
                CONFIRM: 'confirmed',
                CANCEL: 'cancelled'
              },
              meta: { color: 'yellow' }
            },
            confirmed: {
              on: {
                PREPARE: 'preparing',
                CANCEL: 'cancelled'
              },
              entry: 'onConfirmed',
              exit: 'onConfirmed'
            },
            preparing: {
              on: {
                SHIP: 'shipped',
                CANCEL: 'cancelled'
              },
              guards: {
                SHIP: 'canShip'
              }
            },
            shipped: {
              on: {
                DELIVER: 'delivered',
                RETURN: 'returned'
              },
              entry: 'onShipped'
            },
            delivered: { type: 'final' },
            cancelled: { type: 'final' },
            returned: { type: 'final' }
          }
        },
        user_onboarding: {
          initialState: 'registered',
          states: {
            registered: {
              on: { VERIFY_EMAIL: 'verified' }
            },
            verified: {
              on: { COMPLETE_PROFILE: 'active' }
            },
            active: { type: 'final' }
          }
        },
        test_guards: {
          initialState: 'start',
          states: {
            start: {
              on: {
                PASS: 'success',
                FAIL: 'failure',
                ERROR: 'error'
              },
              guards: {
                PASS: 'canShip',
                FAIL: 'cannotShip',
                ERROR: 'guardError'
              }
            },
            success: { type: 'final' },
            failure: { type: 'final' },
            error: { type: 'final' }
          }
        }
      },
      actions: mockActions,
      guards: mockGuards,
      persistTransitions: true,
      verbose: false
    });

    await database.connect();
    await plugin.install(database);
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  describe('Configuration Validation', () => {
    it('should throw error when no state machines defined', () => {
      expect(() => {
        new StateMachinePlugin({});
      }).toThrow('At least one state machine must be defined');
    });

    it('should throw error when machine has no states', () => {
      expect(() => {
        new StateMachinePlugin({
          stateMachines: {
            invalid: {}
          }
        });
      }).toThrow("Machine 'invalid' must have states defined");
    });

    it('should throw error when machine has no initial state', () => {
      expect(() => {
        new StateMachinePlugin({
          stateMachines: {
            invalid: {
              states: { start: {} }
            }
          }
        });
      }).toThrow("Machine 'invalid' must have an initialState");
    });

    it('should throw error when initial state not found in states', () => {
      expect(() => {
        new StateMachinePlugin({
          stateMachines: {
            invalid: {
              initialState: 'missing',
              states: { start: {} }
            }
          }
        });
      }).toThrow("Initial state 'missing' not found in machine 'invalid'");
    });
  });

  describe('Plugin Setup', () => {
    it('should setup properly with database', async () => {
      expect(plugin.database).toBe(database);
      expect(plugin.machines.size).toBe(3);
      expect(plugin.machines.has('order_processing')).toBe(true);
      expect(plugin.machines.has('user_onboarding')).toBe(true);
    });

    it('should create state resources when persistence enabled', async () => {
      expect(database.resources[plugin.config.transitionLogResource]).toBeDefined();
      expect(database.resources[plugin.config.stateResource]).toBeDefined();
    });

    it('should emit initialized event', async () => {
      const initSpy = jest.fn();
      plugin.on('initialized', initSpy);
      
      const newPlugin = new StateMachinePlugin({
        stateMachines: {
          test: {
            initialState: 'start',
            states: { start: {} }
          }
        }
      });
      
      newPlugin.on('initialized', initSpy);
      
      const newDb = createDatabaseForTest('suite=plugins/state-machine-init');
      
      await newDb.connect();
      await newPlugin.install(newDb);
      
      expect(initSpy).toHaveBeenCalledWith({ machines: ['test'] });
      
      await newDb.disconnect();
    });
  });

  describe('State Management', () => {
    it('should return initial state for new entity', async () => {
      const state = await plugin.getState('order_processing', 'order1');
      expect(state).toBe('pending');
    });

    it('should initialize entity with initial state', async () => {
      const result = await plugin.initializeEntity('order_processing', 'order1', { id: 'order1' });
      expect(result).toBe('pending');
      
      const state = await plugin.getState('order_processing', 'order1');
      expect(state).toBe('pending');
    });

    it('should execute entry action when initializing entity', async () => {
      const entryPlugin = new StateMachinePlugin({
        stateMachines: {
          test: {
            initialState: 'start',
            states: {
              start: {
                entry: 'onConfirmed'
              }
            }
          }
        },
        actions: mockActions
      });
      
      const testDb = createDatabaseForTest('suite=plugins/state-machine-entry');
      
      await testDb.connect();
      await entryPlugin.install(testDb);
      
      await entryPlugin.initializeEntity('test', 'entity1');
      
      expect(mockActions.onConfirmed).toHaveBeenCalled();
      
      await testDb.disconnect();
    });

    it('should emit entity_initialized event', async () => {
      const initSpy = jest.fn();
      plugin.on('entity_initialized', initSpy);
      
      await plugin.initializeEntity('order_processing', 'order1');
      
      expect(initSpy).toHaveBeenCalledWith({
        machineId: 'order_processing',
        entityId: 'order1',
        initialState: 'pending'
      });
    });

    it('should throw error for unknown machine', async () => {
      await expect(plugin.getState('unknown', 'entity1')).rejects.toThrow("State machine 'unknown' not found");
    });
  });

  describe('State Transitions', () => {
    beforeEach(async () => {
      await plugin.initializeEntity('order_processing', 'order1', { id: 'order1' });
    });

    it('should transition to valid next state', async () => {
      const result = await plugin.send('order_processing', 'order1', 'CONFIRM', { paymentId: 'pay1' });
      
      expect(result.from).toBe('pending');
      expect(result.to).toBe('confirmed');
      expect(result.event).toBe('CONFIRM');
      expect(result.timestamp).toBeDefined();
      
      const newState = await plugin.getState('order_processing', 'order1');
      expect(newState).toBe('confirmed');
    });

    it('should execute entry and exit actions during transition', async () => {
      await plugin.send('order_processing', 'order1', 'CONFIRM');
      await plugin.send('order_processing', 'order1', 'PREPARE');
      
      // Entry action called when entering confirmed
      // Exit action called when leaving confirmed
      expect(mockActions.onConfirmed).toHaveBeenCalledTimes(2);
    });

    it('should throw error for invalid event', async () => {
      await expect(plugin.send('order_processing', 'order1', 'INVALID')).rejects.toThrow(
        "Event 'INVALID' not valid for state 'pending' in machine 'order_processing'"
      );
    });

    it('should throw error for unknown machine in send', async () => {
      await expect(plugin.send('unknown', 'order1', 'EVENT')).rejects.toThrow(
        "State machine 'unknown' not found"
      );
    });

    it('should emit transition event', async () => {
      const transitionSpy = jest.fn();
      plugin.on('transition', transitionSpy);
      
      await plugin.send('order_processing', 'order1', 'CONFIRM', { test: 'data' });
      
      expect(transitionSpy).toHaveBeenCalledWith({
        machineId: 'order_processing',
        entityId: 'order1',
        from: 'pending',
        to: 'confirmed',
        event: 'CONFIRM',
        context: { test: 'data' }
      });
    });

    it('should handle multiple sequential transitions', async () => {
      await plugin.send('order_processing', 'order1', 'CONFIRM');
      await plugin.send('order_processing', 'order1', 'PREPARE');
      await plugin.send('order_processing', 'order1', 'SHIP');
      
      const finalState = await plugin.getState('order_processing', 'order1');
      expect(finalState).toBe('shipped');
    });
  });

  describe('Guards', () => {
    beforeEach(async () => {
      await plugin.initializeEntity('test_guards', 'test1');
    });

    it('should allow transition when guard returns true', async () => {
      mockGuards.canShip.mockResolvedValue(true);
      
      await plugin.send('test_guards', 'test1', 'PASS');
      
      const state = await plugin.getState('test_guards', 'test1');
      expect(state).toBe('success');
      expect(mockGuards.canShip).toHaveBeenCalled();
    });

    it('should block transition when guard returns false', async () => {
      mockGuards.cannotShip.mockResolvedValue(false);

      await expect(plugin.send('test_guards', 'test1', 'FAIL')).rejects.toThrow(
        /Transition blocked by guard 'cannotShip'/
      );

      const state = await plugin.getState('test_guards', 'test1');
      expect(state).toBe('start'); // Should remain in start state
    });

    it('should block transition when guard throws error', async () => {
      mockGuards.guardError.mockRejectedValue(new Error('Guard error'));
      
      await expect(plugin.send('test_guards', 'test1', 'ERROR')).rejects.toThrow(
        /Transition blocked by guard 'guardError'/
      );
    });

    it('should pass correct parameters to guard', async () => {
      const context = { test: 'data' };
      await plugin.send('test_guards', 'test1', 'PASS', context);
      
      expect(mockGuards.canShip).toHaveBeenCalledWith(
        context,
        'PASS',
        {
          database: plugin.database,
          machineId: 'test_guards',
          entityId: 'test1'
        }
      );
    });
  });

  describe('Actions', () => {
    it('should execute action with correct parameters', async () => {
      await plugin.initializeEntity('order_processing', 'order1');
      await plugin.send('order_processing', 'order1', 'CONFIRM', { test: 'data' });
      
      expect(mockActions.onConfirmed).toHaveBeenCalledWith(
        { test: 'data' },
        'CONFIRM',
        {
          database: plugin.database,
          machineId: 'order_processing',
          entityId: 'order1'
        }
      );
    });

    it('should handle action errors gracefully', async () => {
      const errorSpy = jest.fn();
      
      // Create machine with error action
      const errorPlugin = new StateMachinePlugin({
        stateMachines: {
          test: {
            initialState: 'start',
            states: {
              start: {
                entry: 'onError'
              }
            }
          }
        },
        actions: mockActions,
        verbose: false
      });
      
      errorPlugin.on('action_error', errorSpy);
      
      const testDb = createDatabaseForTest('suite=plugins/state-machine-error');
      
      await testDb.connect();
      await errorPlugin.install(testDb);
      
      await errorPlugin.initializeEntity('test', 'entity1');
      
      expect(errorSpy).toHaveBeenCalledWith({
        actionName: 'onError',
        error: 'Action failed',
        machineId: 'test',
        entityId: 'entity1'
      });
      
      await testDb.disconnect();
    });

    it('should continue transition even if action fails', async () => {
      // This tests that action errors don't prevent state transitions
      const errorPlugin = new StateMachinePlugin({
        stateMachines: {
          test: {
            initialState: 'start',
            states: {
              start: {
                on: { NEXT: 'end' },
                exit: 'onError'
              },
              end: { type: 'final' }
            }
          }
        },
        actions: mockActions
      });
      
      const testDb = createDatabaseForTest('suite=plugins/state-machine-action-error');
      
      await testDb.connect();
      await errorPlugin.install(testDb);
      
      await errorPlugin.initializeEntity('test', 'entity1');
      await errorPlugin.send('test', 'entity1', 'NEXT');
      
      const state = await errorPlugin.getState('test', 'entity1');
      expect(state).toBe('end');
      
      await testDb.disconnect();
    });
  });

  describe('Valid Events', () => {
    it('should return valid events for current state by entity ID', async () => {
      await plugin.initializeEntity('order_processing', 'order1');

      const events = await plugin.getValidEvents('order_processing', 'order1');
      expect(events).toEqual(['CONFIRM', 'CANCEL']);
    });

    it('should return valid events for specific state name', async () => {
      const events = await plugin.getValidEvents('order_processing', 'confirmed');
      expect(events).toEqual(['PREPARE', 'CANCEL']);
    });

    it('should return empty array for final states', async () => {
      const events = await plugin.getValidEvents('order_processing', 'delivered');
      expect(events).toEqual([]);
    });

    it('should return empty array for states without transitions', async () => {
      const events = await plugin.getValidEvents('order_processing', 'cancelled');
      expect(events).toEqual([]);
    });

    it('should throw error for unknown machine', async () => {
      await expect(plugin.getValidEvents('unknown', 'state')).rejects.toThrow(
        "State machine 'unknown' not found"
      );
    });
  });

  describe('Transition History', () => {
    beforeEach(async () => {
      await plugin.initializeEntity('order_processing', 'order1');
    });

    it('should record transition history', async () => {
      await plugin.send('order_processing', 'order1', 'CONFIRM');
      await plugin.send('order_processing', 'order1', 'PREPARE');
      
      const history = await plugin.getTransitionHistory('order_processing', 'order1');
      
      expect(history).toHaveLength(2);
      expect(history[0].from).toBe('confirmed');
      expect(history[0].to).toBe('preparing');
      expect(history[0].event).toBe('PREPARE');
      expect(history[1].from).toBe('pending');
      expect(history[1].to).toBe('confirmed');
      expect(history[1].event).toBe('CONFIRM');
    });

    it('should return empty array when persistence disabled', async () => {
      const noPersistPlugin = new StateMachinePlugin({
        stateMachines: {
          test: {
            initialState: 'start',
            states: { start: {} }
          }
        },
        persistTransitions: false
      });
      
      const history = await noPersistPlugin.getTransitionHistory('test', 'entity1');
      expect(history).toEqual([]);
    });

    it('should support pagination in history', async () => {
      // Create multiple transitions
      await plugin.send('order_processing', 'order1', 'CONFIRM');
      await plugin.send('order_processing', 'order1', 'PREPARE');
      await plugin.send('order_processing', 'order1', 'SHIP');
      
      const history = await plugin.getTransitionHistory('order_processing', 'order1', {
        limit: 2,
        offset: 1
      });
      
      expect(history).toHaveLength(2);
    });

    it('should handle history query errors gracefully', async () => {
      // Mock database error
      const originalResource = plugin.database.resource;
      plugin.database.resource = jest.fn().mockReturnValue({
        list: jest.fn().mockRejectedValue(new Error('Database error'))
      });
      
      const history = await plugin.getTransitionHistory('order_processing', 'order1');
      expect(history).toEqual([]);
      
      // Restore original
      plugin.database.resource = originalResource;
    });
  });

  describe('Machine Definition', () => {
    it('should return machine definition', () => {
      const definition = plugin.getMachineDefinition('order_processing');
      
      expect(definition).toBeDefined();
      expect(definition.initialState).toBe('pending');
      expect(definition.states).toBeDefined();
      expect(definition.states.pending).toBeDefined();
    });

    it('should return null for unknown machine', () => {
      const definition = plugin.getMachineDefinition('unknown');
      expect(definition).toBeNull();
    });

    it('should return list of all machines', () => {
      const machines = plugin.getMachines();
      expect(machines).toEqual(expect.arrayContaining(['order_processing', 'user_onboarding', 'test_guards']));
    });
  });

  describe('Visualization', () => {
    it('should generate DOT format for graphviz', () => {
      const dot = plugin.visualize('order_processing');
      
      expect(dot).toContain('digraph order_processing');
      expect(dot).toContain('pending -> confirmed [label="CONFIRM"]');
      expect(dot).toContain('start -> pending');
      expect(dot).toContain('delivered [shape=doublecircle');
    });

    it('should throw error for unknown machine in visualize', () => {
      expect(() => plugin.visualize('unknown')).toThrow(
        "State machine 'unknown' not found"
      );
    });

    it('should handle meta information in visualization', () => {
      const dot = plugin.visualize('order_processing');
      expect(dot).toContain('fillcolor=yellow'); // From meta.color
    });
  });

  describe('Persistence', () => {
    it('should persist state changes to database', async () => {
      await plugin.initializeEntity('order_processing', 'order1');
      await plugin.send('order_processing', 'order1', 'CONFIRM');
      
      // Check state resource
      const stateRecord = await database.resources[plugin.config.stateResource]
        .get('order_processing_order1');
      
      expect(stateRecord).toBeDefined();
      expect(stateRecord.currentState).toBe('confirmed');
      expect(stateRecord.machineId).toBe('order_processing');
      expect(stateRecord.entityId).toBe('order1');
    });

    it('should persist transition log', async () => {
      await plugin.initializeEntity('order_processing', 'order1');
      await plugin.send('order_processing', 'order1', 'CONFIRM', { test: 'data' });
      
      // Check transition log
      const transitions = await database.resources[plugin.config.transitionLogResource]
        .list({
          where: { machineId: 'order_processing', entityId: 'order1' }
        });
      
      expect(transitions).toHaveLength(1);
      expect(transitions[0].fromState).toBe('pending');
      expect(transitions[0].toState).toBe('confirmed');
      expect(transitions[0].event).toBe('CONFIRM');
      expect(transitions[0].context).toEqual({ test: 'data' });
    });

    it('should recover state from persistence', async () => {
      // Initialize and transition
      await plugin.initializeEntity('order_processing', 'order1');
      await plugin.send('order_processing', 'order1', 'CONFIRM');
      
      // Clear in-memory cache
      const machine = plugin.machines.get('order_processing');
      machine.currentStates.clear();
      
      // Should recover from persistence
      const state = await plugin.getState('order_processing', 'order1');
      expect(state).toBe('confirmed');
    });
  });

  describe('Multiple Entities', () => {
    it('should handle multiple entities independently', async () => {
      await plugin.initializeEntity('order_processing', 'order1');
      await plugin.initializeEntity('order_processing', 'order2');
      
      await plugin.send('order_processing', 'order1', 'CONFIRM');
      
      const state1 = await plugin.getState('order_processing', 'order1');
      const state2 = await plugin.getState('order_processing', 'order2');
      
      expect(state1).toBe('confirmed');
      expect(state2).toBe('pending');
    });

    it('should handle multiple machines independently', async () => {
      await plugin.initializeEntity('order_processing', 'order1');
      await plugin.initializeEntity('user_onboarding', 'user1');
      
      await plugin.send('order_processing', 'order1', 'CONFIRM');
      await plugin.send('user_onboarding', 'user1', 'VERIFY_EMAIL');
      
      const orderState = await plugin.getState('order_processing', 'order1');
      const userState = await plugin.getState('user_onboarding', 'user1');
      
      expect(orderState).toBe('confirmed');
      expect(userState).toBe('verified');
    });
  });

  describe('Plugin Lifecycle', () => {
    it('should start successfully', async () => {
      await plugin.start();
      // No specific assertions - just ensure no errors
    });

    it('should stop successfully', async () => {
      await plugin.stop();
      expect(plugin.machines.size).toBe(0);
    });

    it('should cleanup successfully', async () => {
      const removeListenersSpy = jest.spyOn(plugin, 'removeAllListeners');

      await plugin.stop();

      expect(plugin.machines.size).toBe(0);
      expect(removeListenersSpy).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle database setup errors gracefully', async () => {
      const errorPlugin = new StateMachinePlugin({
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
        createResource: jest.fn().mockRejectedValue(new Error('Database error'))
      };
      
      // Should not throw during plugin setup even if resource creation fails
      await errorPlugin.install(mockDb);
      
      expect(mockDb.createResource).toHaveBeenCalled();
      expect(errorPlugin.database).toBe(mockDb);
    });

    it('should handle resource creation errors', async () => {
      const mockDb = {
        createResource: jest.fn().mockRejectedValue(new Error('Resource creation failed')),
        resources: {}
      };
      
      // Should not throw even if resource creation fails
      await expect(plugin._createStateResources.call({ 
        database: mockDb, 
        config: plugin.config 
      })).resolves.toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing action gracefully', async () => {
      const missingActionPlugin = new StateMachinePlugin({
        stateMachines: {
          test: {
            initialState: 'start',
            states: {
              start: {
                on: { NEXT: 'end' },
                entry: 'missingAction'
              },
              end: {}
            }
          }
        },
        actions: {},
        verbose: false
      });
      
      const testDb = createDatabaseForTest('suite=plugins/state-machine-missing-action');
      
      await testDb.connect();
      await missingActionPlugin.install(testDb);
      
      // Should not throw even with missing action
      await missingActionPlugin.initializeEntity('test', 'entity1');
      
      await testDb.disconnect();
    });

    it('should handle missing guard gracefully', async () => {
      const missingGuardPlugin = new StateMachinePlugin({
        stateMachines: {
          test: {
            initialState: 'start',
            states: {
              start: {
                on: { NEXT: 'end' },
                guards: { NEXT: 'missingGuard' }
              },
              end: {}
            }
          }
        },
        guards: {}
      });
      
      const testDb = createDatabaseForTest('suite=plugins/state-machine-missing-guard');
      
      await testDb.connect();
      await missingGuardPlugin.install(testDb);
      
      await missingGuardPlugin.initializeEntity('test', 'entity1');
      
      // Should proceed with transition when guard is missing
      await missingGuardPlugin.send('test', 'entity1', 'NEXT');
      
      const state = await missingGuardPlugin.getState('test', 'entity1');
      expect(state).toBe('end');
      
      await testDb.disconnect();
    });
  });

  describe('Distributed Locks & Concurrency Control', () => {
    it('should prevent concurrent transitions for the same entity', async () => {
      await database.connect();
      await plugin.install(database);
      await plugin.initializeEntity('order_processing', 'order1');

      // Try to execute two transitions concurrently for the same entity
      const transition1 = plugin.send('order_processing', 'order1', 'CONFIRM');
      const transition2 = plugin.send('order_processing', 'order1', 'CONFIRM');

      // One should succeed, one should fail (either with lock error or invalid state)
      const results = await Promise.allSettled([transition1, transition2]);

      const succeeded = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      // One should succeed, one should fail
      expect(succeeded.length).toBe(1);
      expect(failed.length).toBe(1);

      // The failed one will either be lock timeout or invalid state transition
      // (both are valid outcomes of race condition)
      const errorMsg = failed[0].reason.message;
      const isValidError = errorMsg.includes('Could not acquire transition lock') ||
                           errorMsg.includes('not valid for state');
      expect(isValidError).toBe(true);

      await database.disconnect();
    });

    it('should allow concurrent transitions for different entities', async () => {
      await database.connect();
      await plugin.install(database);
      await plugin.initializeEntity('order_processing', 'order1');
      await plugin.initializeEntity('order_processing', 'order2');

      // Execute transitions concurrently for different entities
      const transition1 = plugin.send('order_processing', 'order1', 'CONFIRM');
      const transition2 = plugin.send('order_processing', 'order2', 'CONFIRM');

      // Both should succeed
      const results = await Promise.all([transition1, transition2]);

      expect(results[0].to).toBe('confirmed');
      expect(results[1].to).toBe('confirmed');

      await database.disconnect();
    });

    it('should release lock even when transition fails', async () => {
      const failingPlugin = new StateMachinePlugin({
        stateMachines: {
          test: {
            initialState: 'start',
            states: {
              start: {
                on: { NEXT: 'middle' },
                guards: { NEXT: 'guardError' } // This guard will throw error
              },
              middle: {
                on: { COMPLETE: 'end' }
              },
              end: { type: 'final' }
            }
          }
        },
        actions: mockActions,
        guards: mockGuards,
        lockTimeout: 500,
        lockTTL: 2
      });

      const testDb = createDatabaseForTest('suite=plugins/state-machine-lock-release');
      await testDb.connect();
      await failingPlugin.install(testDb);
      await failingPlugin.initializeEntity('test', 'entity1');

      // First transition should fail (guard throws error)
      await expect(
        failingPlugin.send('test', 'entity1', 'NEXT')
      ).rejects.toThrow('Transition blocked by guard');

      // Second transition should also be able to acquire lock (lock was released)
      // This proves lock was released even though first transition failed
      await expect(
        failingPlugin.send('test', 'entity1', 'NEXT')
      ).rejects.toThrow('Transition blocked by guard');

      // State should remain 'start' because transitions failed
      const state = await failingPlugin.getState('test', 'entity1');
      expect(state).toBe('start');

      await testDb.disconnect();
    });

    it('should respect lockTimeout configuration', async () => {
      const shortTimeoutPlugin = new StateMachinePlugin({
        stateMachines: {
          test: {
            initialState: 'start',
            states: {
              start: {
                on: { NEXT: 'end' }
              },
              end: { type: 'final' }
            }
          }
        },
        lockTimeout: 100, // Very short timeout
        lockTTL: 5
      });

      const testDb = createDatabaseForTest('suite=plugins/state-machine-timeout');
      await testDb.connect();
      await shortTimeoutPlugin.install(testDb);
      await shortTimeoutPlugin.initializeEntity('test', 'entity1');

      // Simulate a slow transition by acquiring lock manually
      const storage = shortTimeoutPlugin.getStorage();
      const lockName = 'transition-test-entity1';
      await storage.set(
        shortTimeoutPlugin.getStorage().getPluginKey(null, 'locks', lockName),
        { workerId: 'test' },
        { ttl: 10 }
      );

      // Try to transition - should fail quickly due to short timeout
      const startTime = Date.now();
      await expect(
        shortTimeoutPlugin.send('test', 'entity1', 'NEXT')
      ).rejects.toThrow('Could not acquire transition lock');
      const duration = Date.now() - startTime;

      // Should fail within timeout + small buffer
      expect(duration).toBeLessThan(500);

      await testDb.disconnect();
    });

    it('should use workerId in lock acquisition', async () => {
      const worker1Plugin = new StateMachinePlugin({
        stateMachines: {
          test: {
            initialState: 'start',
            states: {
              start: { on: { NEXT: 'end' } },
              end: { type: 'final' }
            }
          }
        },
        workerId: 'worker-1',
        lockTimeout: 500,
        lockTTL: 2
      });

      const testDb = createDatabaseForTest('suite=plugins/state-machine-worker-id');
      await testDb.connect();
      await worker1Plugin.install(testDb);
      await worker1Plugin.initializeEntity('test', 'entity1');

      // Transition should succeed and store workerId in lock
      await worker1Plugin.send('test', 'entity1', 'NEXT');

      const state = await worker1Plugin.getState('test', 'entity1');
      expect(state).toBe('end');

      await testDb.disconnect();
    });

    it('should handle lock TTL expiration', async () => {
      const ttlPlugin = new StateMachinePlugin({
        stateMachines: {
          test: {
            initialState: 'start',
            states: {
              start: { on: { NEXT: 'end' } },
              end: { type: 'final' }
            }
          }
        },
        lockTimeout: 0,
        lockTTL: 1 // 1 second TTL
      });

      const testDb = createDatabaseForTest('suite=plugins/state-machine-ttl');
      await testDb.connect();
      await ttlPlugin.install(testDb);
      await ttlPlugin.initializeEntity('test', 'entity1');

      // Acquire lock manually
      const storage = ttlPlugin.getStorage();
      const lockName = 'transition-test-entity1';
      await storage.set(
        storage.getPluginKey(null, 'locks', lockName),
        { workerId: 'stuck-worker' },
        { ttl: 1 }
      );

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Transition should succeed (lock expired)
      await ttlPlugin.send('test', 'entity1', 'NEXT');

      const state = await ttlPlugin.getState('test', 'entity1');
      expect(state).toBe('end');

      await testDb.disconnect();
    });
  });
});