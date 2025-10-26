import { Plugin } from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { StateMachineError } from "./state-machine.errors.js";
import { ErrorClassifier } from "../concerns/error-classifier.js";

/**
 * StateMachinePlugin - Finite State Machine Management
 *
 * Provides structured state management with controlled transitions,
 * automatic actions, and comprehensive audit trails.
 *
 * === Features ===
 * - Finite state machines with defined states and transitions
 * - Event-driven transitions with validation
 * - Entry/exit actions and guards
 * - Transition history and audit trails
 * - Multiple state machines per plugin instance
 * - Integration with S3DB resources
 *
 * === Configuration Example ===
 *
 * new StateMachinePlugin({
 *   stateMachines: {
 *     order_processing: {
 *       initialState: 'pending',
 *       states: {
 *         pending: {
 *           on: {
 *             CONFIRM: 'confirmed',
 *             CANCEL: 'cancelled'
 *           },
 *           meta: { color: 'yellow', description: 'Awaiting payment' }
 *         },
 *         confirmed: {
 *           on: {
 *             PREPARE: 'preparing',
 *             CANCEL: 'cancelled'
 *           },
 *           entry: 'onConfirmed',
 *           exit: 'onLeftConfirmed'
 *         },
 *         preparing: {
 *           on: {
 *             SHIP: 'shipped',
 *             CANCEL: 'cancelled'
 *           },
 *           guards: {
 *             SHIP: 'canShip'
 *           }
 *         },
 *         shipped: {
 *           on: {
 *             DELIVER: 'delivered',
 *             RETURN: 'returned'
 *           }
 *         },
 *         delivered: { type: 'final' },
 *         cancelled: { type: 'final' },
 *         returned: { type: 'final' }
 *       }
 *     }
 *   },
 *   
 *   actions: {
 *     onConfirmed: async (context, event, machine) => {
 *       await machine.this.database.resources['inventory'].update(context.productId, {
 *         quantity: { $decrement: context.quantity }
 *       });
 *       await machine.sendNotification(context.customerEmail, 'order_confirmed');
 *     },
 *     onLeftConfirmed: async (context, event, machine) => {
 *       console.log('Left confirmed state');
 *     }
 *   },
 *   
 *   guards: {
 *     canShip: async (context, event, machine) => {
 *       const inventory = await machine.this.database.resources['inventory'].get(context.productId);
 *       return inventory.quantity >= context.quantity;
 *     }
 *   },
 *   
 *   persistTransitions: true,
 *   transitionLogResource: 'plg_state_transitions'
 * });
 *
 * === Usage ===
 *
 * // Send events to trigger transitions
 * await stateMachine.send('order_processing', orderId, 'CONFIRM', { paymentId: 'pay_123' });
 *
 * // Get current state
 * const state = await stateMachine.getState('order_processing', orderId);
 *
 * // Get valid events for current state
 * const validEvents = await stateMachine.getValidEvents('order_processing', 'pending');
 *
 * // Get transition history
 * const history = await stateMachine.getTransitionHistory('order_processing', orderId);
 */
export class StateMachinePlugin extends Plugin {
  constructor(options = {}) {
    super();

    this.config = {
      stateMachines: options.stateMachines || {},
      actions: options.actions || {},
      guards: options.guards || {},
      persistTransitions: options.persistTransitions !== false,
      transitionLogResource: options.transitionLogResource || 'plg_state_transitions',
      stateResource: options.stateResource || 'plg_entity_states',
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 100,
      verbose: options.verbose || false,
      // Distributed lock configuration (prevents concurrent transitions)
      workerId: options.workerId || 'default',
      lockTimeout: options.lockTimeout || 1000, // Wait up to 1s for lock
      lockTTL: options.lockTTL || 5, // Lock expires after 5s (prevent deadlock)

      // Global retry configuration for action execution
      retryConfig: options.retryConfig || null,

      // Trigger system configuration
      enableScheduler: options.enableScheduler || false,
      schedulerConfig: options.schedulerConfig || {},
      enableDateTriggers: options.enableDateTriggers !== false,
      enableFunctionTriggers: options.enableFunctionTriggers !== false,
      enableEventTriggers: options.enableEventTriggers !== false,
      triggerCheckInterval: options.triggerCheckInterval || 60000 // Check triggers every 60s by default
    };

    this.database = null;
    this.machines = new Map();
    this.triggerIntervals = [];
    this.schedulerPlugin = null;
    this._pendingEventHandlers = new Set();

    this._validateConfiguration();
  }

  /**
   * Wait for all pending event handlers to complete
   * Useful when working with async events (asyncEvents: true)
   * @param {number} timeout - Maximum time to wait in milliseconds (default: 5000)
   * @returns {Promise<void>}
   */
  async waitForPendingEvents(timeout = 5000) {
    if (this._pendingEventHandlers.size === 0) {
      return; // No pending events
    }

    const startTime = Date.now();

    while (this._pendingEventHandlers.size > 0) {
      if (Date.now() - startTime > timeout) {
        throw new StateMachineError(
          `Timeout waiting for ${this._pendingEventHandlers.size} pending event handlers`,
          {
            operation: 'waitForPendingEvents',
            pendingCount: this._pendingEventHandlers.size,
            timeout
          }
        );
      }

      // Wait for at least one handler to complete
      if (this._pendingEventHandlers.size > 0) {
        await Promise.race(Array.from(this._pendingEventHandlers));
      }

      // Small delay before checking again
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  _validateConfiguration() {
    if (!this.config.stateMachines || Object.keys(this.config.stateMachines).length === 0) {
      throw new StateMachineError('At least one state machine must be defined', {
        operation: 'validateConfiguration',
        machineCount: 0,
        suggestion: 'Provide at least one state machine in the stateMachines configuration'
      });
    }
    
    for (const [machineName, machine] of Object.entries(this.config.stateMachines)) {
      if (!machine.states || Object.keys(machine.states).length === 0) {
        throw new StateMachineError(`Machine '${machineName}' must have states defined`, {
          operation: 'validateConfiguration',
          machineId: machineName,
          suggestion: 'Define at least one state in the states configuration'
        });
      }

      if (!machine.initialState) {
        throw new StateMachineError(`Machine '${machineName}' must have an initialState`, {
          operation: 'validateConfiguration',
          machineId: machineName,
          availableStates: Object.keys(machine.states),
          suggestion: 'Specify an initialState property matching one of the defined states'
        });
      }

      if (!machine.states[machine.initialState]) {
        throw new StateMachineError(`Initial state '${machine.initialState}' not found in machine '${machineName}'`, {
          operation: 'validateConfiguration',
          machineId: machineName,
          initialState: machine.initialState,
          availableStates: Object.keys(machine.states),
          suggestion: 'Set initialState to one of the defined states'
        });
      }
    }
  }

  async onInstall() {

    // Create state storage resource if persistence is enabled
    if (this.config.persistTransitions) {
      await this._createStateResources();
    }

    // Initialize state machines
    for (const [machineName, machineConfig] of Object.entries(this.config.stateMachines)) {
      this.machines.set(machineName, {
        config: machineConfig,
        currentStates: new Map() // entityId -> currentState
      });
    }

    // Attach state machines to resources for direct API access
    await this._attachStateMachinesToResources();

    // Setup trigger system if enabled
    await this._setupTriggers();

    this.emit('db:plugin:initialized', { machines: Array.from(this.machines.keys()) });
  }

  async _createStateResources() {
    // Create transition log resource
    const [logOk] = await tryFn(() => this.database.createResource({
      name: this.config.transitionLogResource,
      attributes: {
        id: 'string|required',
        machineId: 'string|required',
        entityId: 'string|required',
        fromState: 'string',
        toState: 'string|required',
        event: 'string|required',
        context: 'json',
        timestamp: 'number|required',
        createdAt: 'string|required'
      },
      behavior: 'body-overflow',
      partitions: {
        byMachine: { fields: { machineId: 'string' } },
        byDate: { fields: { createdAt: 'string|maxlength:10' } }
      }
    }));
    
    // Create current state resource
    const [stateOk] = await tryFn(() => this.database.createResource({
      name: this.config.stateResource,
      attributes: {
        id: 'string|required',
        machineId: 'string|required',
        entityId: 'string|required',
        currentState: 'string|required',
        context: 'json|default:{}',
        lastTransition: 'string|default:null',
        triggerCounts: 'json|default:{}',  // Track trigger execution counts
        updatedAt: 'string|required'
      },
      behavior: 'body-overflow'
    }));
  }

  /**
   * Send an event to trigger a state transition
   */
  async send(machineId, entityId, event, context = {}) {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new StateMachineError(`State machine '${machineId}' not found`, {
        operation: 'send',
        machineId,
        availableMachines: Array.from(this.machines.keys()),
        suggestion: 'Check machine ID or use getMachines() to list available machines'
      });
    }

    // Acquire distributed lock to prevent concurrent transitions
    const lockName = await this._acquireTransitionLock(machineId, entityId);

    try {
      const currentState = await this.getState(machineId, entityId);
      const stateConfig = machine.config.states[currentState];

      if (!stateConfig || !stateConfig.on || !stateConfig.on[event]) {
        throw new StateMachineError(`Event '${event}' not valid for state '${currentState}' in machine '${machineId}'`, {
          operation: 'send',
          machineId,
          entityId,
          event,
          currentState,
          validEvents: stateConfig && stateConfig.on ? Object.keys(stateConfig.on) : [],
          suggestion: 'Use getValidEvents() to check which events are valid for the current state'
        });
      }

      const targetState = stateConfig.on[event];

      // Check guards
      if (stateConfig.guards && stateConfig.guards[event]) {
        const guardName = stateConfig.guards[event];
        const guard = this.config.guards[guardName];

        if (guard) {
          const [guardOk, guardErr, guardResult] = await tryFn(() =>
            guard(context, event, { database: this.database, machineId, entityId })
          );

          if (!guardOk || !guardResult) {
            throw new StateMachineError(`Transition blocked by guard '${guardName}'`, {
              operation: 'send',
              machineId,
              entityId,
              event,
              currentState,
              guardName,
              guardError: guardErr?.message || 'Guard returned false',
              suggestion: 'Check guard conditions or modify the context to satisfy guard requirements'
            });
          }
        }
      }

      // Execute exit action for current state
      if (stateConfig.exit) {
        await this._executeAction(stateConfig.exit, context, event, machineId, entityId);
      }

      // Execute the transition
      await this._transition(machineId, entityId, currentState, targetState, event, context);

      // Execute entry action for target state
      const targetStateConfig = machine.config.states[targetState];
      if (targetStateConfig && targetStateConfig.entry) {
        await this._executeAction(targetStateConfig.entry, context, event, machineId, entityId);
      }

      this.emit('plg:state-machine:transition', {
        machineId,
        entityId,
        from: currentState,
        to: targetState,
        event,
        context
      });

      return {
        from: currentState,
        to: targetState,
        event,
        timestamp: new Date().toISOString()
      };
    } finally {
      // Always release lock, even if transition fails
      await this._releaseTransitionLock(lockName);
    }
  }

  async _executeAction(actionName, context, event, machineId, entityId) {
    const action = this.config.actions[actionName];
    if (!action) {
      if (this.config.verbose) {
        console.warn(`[StateMachinePlugin] Action '${actionName}' not found`);
      }
      return;
    }

    // Get retry configuration (state-specific overrides global)
    const machine = this.machines.get(machineId);
    const currentState = await this.getState(machineId, entityId);
    const stateConfig = machine?.config?.states?.[currentState];

    // Merge retry configs: global < machine < state
    const retryConfig = {
      ...(this.config.retryConfig || {}),
      ...(machine?.config?.retryConfig || {}),
      ...(stateConfig?.retryConfig || {})
    };

    const maxAttempts = retryConfig.maxAttempts ?? 0;
    const retryEnabled = maxAttempts > 0;
    let attempt = 0;
    let lastError = null;

    while (attempt <= maxAttempts) {
      try {
        const result = await action(context, event, { database: this.database, machineId, entityId });

        // Success - log retry statistics if retried
        if (attempt > 0) {
          this.emit('plg:state-machine:action-retry-success', {
            machineId,
            entityId,
            action: actionName,
            attempts: attempt + 1,
            state: currentState
          });

          if (this.config.verbose) {
            console.log(`[StateMachinePlugin] Action '${actionName}' succeeded after ${attempt + 1} attempts`);
          }
        }

        return result;

      } catch (error) {
        lastError = error;

        // If retries are disabled, use old behavior (emit error but don't throw)
        if (!retryEnabled) {
          if (this.config.verbose) {
            console.error(`[StateMachinePlugin] Action '${actionName}' failed:`, error.message);
          }
          this.emit('plg:state-machine:action-error', { actionName, error: error.message, machineId, entityId });
          return; // Don't throw, continue execution
        }

        // Classify error
        const classification = ErrorClassifier.classify(error, {
          retryableErrors: retryConfig.retryableErrors,
          nonRetriableErrors: retryConfig.nonRetriableErrors
        });

        // Non-retriable error - fail immediately
        if (classification === 'NON_RETRIABLE') {
          this.emit('plg:state-machine:action-error-non-retriable', {
            machineId,
            entityId,
            action: actionName,
            error: error.message,
            state: currentState
          });

          if (this.config.verbose) {
            console.error(`[StateMachinePlugin] Action '${actionName}' failed with non-retriable error:`, error.message);
          }

          throw error;
        }

        // Max attempts reached
        if (attempt >= maxAttempts) {
          this.emit('plg:state-machine:action-retry-exhausted', {
            machineId,
            entityId,
            action: actionName,
            attempts: attempt + 1,
            error: error.message,
            state: currentState
          });

          if (this.config.verbose) {
            console.error(`[StateMachinePlugin] Action '${actionName}' failed after ${attempt + 1} attempts:`, error.message);
          }

          throw error;
        }

        // Retriable error - retry
        attempt++;

        // Calculate backoff delay
        const delay = this._calculateBackoff(attempt, retryConfig);

        // Call retry hook if configured
        if (retryConfig.onRetry) {
          try {
            await retryConfig.onRetry(attempt, error, context);
          } catch (hookError) {
            if (this.config.verbose) {
              console.warn(`[StateMachinePlugin] onRetry hook failed:`, hookError.message);
            }
          }
        }

        this.emit('plg:state-machine:action-retry-attempt', {
          machineId,
          entityId,
          action: actionName,
          attempt,
          delay,
          error: error.message,
          state: currentState
        });

        if (this.config.verbose) {
          console.warn(`[StateMachinePlugin] Action '${actionName}' failed (attempt ${attempt + 1}/${maxAttempts + 1}), retrying in ${delay}ms:`, error.message);
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async _transition(machineId, entityId, fromState, toState, event, context) {
    const timestamp = Date.now();
    const now = new Date().toISOString();
    
    // Update in-memory cache
    const machine = this.machines.get(machineId);
    machine.currentStates.set(entityId, toState);
    
    // Persist transition log
    if (this.config.persistTransitions) {
      const transitionId = `${machineId}_${entityId}_${timestamp}`;

      // Retry transition logging (critical for audit trail)
      let logOk = false;
      let lastLogErr;

      for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
        const [ok, err] = await tryFn(() =>
          this.database.resources[this.config.transitionLogResource].insert({
            id: transitionId,
            machineId,
            entityId,
            fromState,
            toState,
            event,
            context,
            timestamp,
            createdAt: now.slice(0, 10) // YYYY-MM-DD for partitioning
          })
        );

        if (ok) {
          logOk = true;
          break;
        }

        lastLogErr = err;

        if (attempt < this.config.retryAttempts - 1) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      if (!logOk && this.config.verbose) {
        console.warn(`[StateMachinePlugin] Failed to log transition after ${this.config.retryAttempts} attempts:`, lastLogErr.message);
      }

      // Update current state with upsert pattern
      const stateId = `${machineId}_${entityId}`;
      const stateData = {
        machineId,
        entityId,
        currentState: toState,
        context,
        lastTransition: transitionId,
        updatedAt: now
      };

      // Try update first (most common case), fallback to insert if doesn't exist
      const [updateOk] = await tryFn(() =>
        this.database.resources[this.config.stateResource].update(stateId, stateData)
      );

      if (!updateOk) {
        // Record doesn't exist, insert it
        const [insertOk, insertErr] = await tryFn(() =>
          this.database.resources[this.config.stateResource].insert({ id: stateId, ...stateData })
        );

        if (!insertOk && this.config.verbose) {
          console.warn(`[StateMachinePlugin] Failed to upsert state:`, insertErr.message);
        }
      }
    }
  }

  /**
   * Acquire distributed lock for transition
   * Prevents concurrent transitions for the same entity
   * @private
   */
  async _acquireTransitionLock(machineId, entityId) {
    const storage = this.getStorage();
    const lockName = `transition-${machineId}-${entityId}`;

    const lock = await storage.acquireLock(lockName, {
      ttl: this.config.lockTTL,
      timeout: this.config.lockTimeout,
      workerId: this.config.workerId
    });

    if (!lock) {
      throw new StateMachineError('Could not acquire transition lock - concurrent transition in progress', {
        operation: 'send',
        machineId,
        entityId,
        lockTimeout: this.config.lockTimeout,
        workerId: this.config.workerId,
        suggestion: 'Wait for current transition to complete or increase lockTimeout'
      });
    }

    return lockName;
  }

  /**
   * Release distributed lock for transition
   * @private
   */
  async _releaseTransitionLock(lockName) {
    const storage = this.getStorage();
    const [ok, err] = await tryFn(() => storage.releaseLock(lockName));

    if (!ok && this.config.verbose) {
      console.warn(`[StateMachinePlugin] Failed to release lock '${lockName}':`, err.message);
    }
  }

  /**
   * Calculate backoff delay for retry attempts
   * @private
   */
  _calculateBackoff(attempt, retryConfig) {
    const {
      backoffStrategy = 'exponential',
      baseDelay = 1000,
      maxDelay = 30000
    } = retryConfig || {};

    let delay;

    if (backoffStrategy === 'exponential') {
      // Exponential backoff: baseDelay * 2^(attempt-1)
      delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    } else if (backoffStrategy === 'linear') {
      // Linear backoff: baseDelay * attempt
      delay = Math.min(baseDelay * attempt, maxDelay);
    } else {
      // Fixed backoff: always use baseDelay
      delay = baseDelay;
    }

    // Add jitter (±20%) to prevent thundering herd
    const jitter = delay * 0.2 * (Math.random() - 0.5);
    return Math.round(delay + jitter);
  }

  /**
   * Get current state for an entity
   */
  async getState(machineId, entityId) {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new StateMachineError(`State machine '${machineId}' not found`, {
        operation: 'getState',
        machineId,
        availableMachines: Array.from(this.machines.keys()),
        suggestion: 'Check machine ID or use getMachines() to list available machines'
      });
    }
    
    // Check in-memory cache first
    if (machine.currentStates.has(entityId)) {
      return machine.currentStates.get(entityId);
    }
    
    // Check persistent storage
    if (this.config.persistTransitions) {
      const stateId = `${machineId}_${entityId}`;
      const [ok, err, stateRecord] = await tryFn(() => 
        this.database.resources[this.config.stateResource].get(stateId)
      );
      
      if (ok && stateRecord) {
        machine.currentStates.set(entityId, stateRecord.currentState);
        return stateRecord.currentState;
      }
    }
    
    // Default to initial state
    const initialState = machine.config.initialState;
    machine.currentStates.set(entityId, initialState);
    return initialState;
  }

  /**
   * Get valid events for current state
   * Can accept either a state name (sync) or entityId (async to fetch latest state)
   */
  async getValidEvents(machineId, stateOrEntityId) {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new StateMachineError(`State machine '${machineId}' not found`, {
        operation: 'getValidEvents',
        machineId,
        availableMachines: Array.from(this.machines.keys()),
        suggestion: 'Check machine ID or use getMachines() to list available machines'
      });
    }

    let state;
    if (machine.config.states[stateOrEntityId]) {
      // stateOrEntityId is a state name - direct lookup
      state = stateOrEntityId;
    } else {
      // stateOrEntityId is an entityId - fetch latest state from storage
      state = await this.getState(machineId, stateOrEntityId);
    }

    const stateConfig = machine.config.states[state];
    return stateConfig && stateConfig.on ? Object.keys(stateConfig.on) : [];
  }

  /**
   * Get transition history for an entity
   */
  async getTransitionHistory(machineId, entityId, options = {}) {
    if (!this.config.persistTransitions) {
      return [];
    }

    const { limit = 50, offset = 0 } = options;

    const [ok, err, transitions] = await tryFn(() =>
      this.database.resources[this.config.transitionLogResource].query({
        machineId,
        entityId
      }, {
        limit,
        offset
      })
    );

    if (!ok) {
      if (this.config.verbose) {
        console.warn(`[StateMachinePlugin] Failed to get transition history:`, err.message);
      }
      return [];
    }

    // Sort by timestamp descending (newest first)
    const sorted = (transitions || []).sort((a, b) => b.timestamp - a.timestamp);

    return sorted.map(t => ({
      from: t.fromState,
      to: t.toState,
      event: t.event,
      context: t.context,
      timestamp: new Date(t.timestamp).toISOString()
    }));
  }

  /**
   * Initialize entity state (useful for new entities)
   */
  async initializeEntity(machineId, entityId, context = {}) {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new StateMachineError(`State machine '${machineId}' not found`, {
        operation: 'initializeEntity',
        machineId,
        availableMachines: Array.from(this.machines.keys()),
        suggestion: 'Check machine ID or use getMachines() to list available machines'
      });
    }

    const initialState = machine.config.initialState;
    machine.currentStates.set(entityId, initialState);

    if (this.config.persistTransitions) {
      const now = new Date().toISOString();
      const stateId = `${machineId}_${entityId}`;

      // Try to insert, ignore if already exists (idempotent)
      const [ok, err] = await tryFn(() =>
        this.database.resources[this.config.stateResource].insert({
          id: stateId,
          machineId,
          entityId,
          currentState: initialState,
          context,
          lastTransition: null,
          updatedAt: now
        })
      );

      // Only throw if error is NOT "already exists"
      if (!ok && err && !err.message?.includes('already exists')) {
        throw new StateMachineError('Failed to initialize entity state', {
          operation: 'initializeEntity',
          machineId,
          entityId,
          initialState,
          original: err,
          suggestion: 'Check state resource configuration and database permissions'
        });
      }
    }

    // Execute entry action for initial state
    const initialStateConfig = machine.config.states[initialState];
    if (initialStateConfig && initialStateConfig.entry) {
      await this._executeAction(initialStateConfig.entry, context, 'INIT', machineId, entityId);
    }

    this.emit('plg:state-machine:entity-initialized', { machineId, entityId, initialState });

    return initialState;
  }

  /**
   * Get machine definition
   */
  getMachineDefinition(machineId) {
    const machine = this.machines.get(machineId);
    return machine ? machine.config : null;
  }

  /**
   * Get all available machines
   */
  getMachines() {
    return Array.from(this.machines.keys());
  }

  /**
   * Visualize state machine (returns DOT format for graphviz)
   */
  visualize(machineId) {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new StateMachineError(`State machine '${machineId}' not found`, {
        operation: 'visualize',
        machineId,
        availableMachines: Array.from(this.machines.keys()),
        suggestion: 'Check machine ID or use getMachines() to list available machines'
      });
    }
    
    let dot = `digraph ${machineId} {\n`;
    dot += `  rankdir=LR;\n`;
    dot += `  node [shape=circle];\n`;
    
    // Add states
    for (const [stateName, stateConfig] of Object.entries(machine.config.states)) {
      const shape = stateConfig.type === 'final' ? 'doublecircle' : 'circle';
      const color = stateConfig.meta?.color || 'lightblue';
      dot += `  ${stateName} [shape=${shape}, fillcolor=${color}, style=filled];\n`;
    }
    
    // Add transitions
    for (const [stateName, stateConfig] of Object.entries(machine.config.states)) {
      if (stateConfig.on) {
        for (const [event, targetState] of Object.entries(stateConfig.on)) {
          dot += `  ${stateName} -> ${targetState} [label="${event}"];\n`;
        }
      }
    }
    
    // Mark initial state
    dot += `  start [shape=point];\n`;
    dot += `  start -> ${machine.config.initialState};\n`;
    
    dot += `}\n`;
    
    return dot;
  }

  /**
   * Get all entities currently in a specific state
   * @private
   */
  async _getEntitiesInState(machineId, stateName) {
    if (!this.config.persistTransitions) {
      // Memory-only - check in-memory map
      const machine = this.machines.get(machineId);
      if (!machine) return [];

      const entities = [];
      for (const [entityId, currentState] of machine.currentStates) {
        if (currentState === stateName) {
          entities.push({ entityId, currentState, context: {}, triggerCounts: {} });
        }
      }
      return entities;
    }

    // Query state resource for entities in this state
    const [ok, err, records] = await tryFn(() =>
      this.database.resources[this.config.stateResource].query({
        machineId,
        currentState: stateName
      })
    );

    if (!ok) {
      if (this.config.verbose) {
        console.warn(`[StateMachinePlugin] Failed to query entities in state '${stateName}':`, err.message);
      }
      return [];
    }

    return records || [];
  }

  /**
   * Increment trigger execution count for an entity
   * @private
   */
  async _incrementTriggerCount(machineId, entityId, triggerName) {
    if (!this.config.persistTransitions) {
      // No persistence - skip tracking
      return;
    }

    const stateId = `${machineId}_${entityId}`;

    const [ok, err, stateRecord] = await tryFn(() =>
      this.database.resources[this.config.stateResource].get(stateId)
    );

    if (ok && stateRecord) {
      const triggerCounts = stateRecord.triggerCounts || {};
      triggerCounts[triggerName] = (triggerCounts[triggerName] || 0) + 1;

      await tryFn(() =>
        this.database.resources[this.config.stateResource].patch(stateId, { triggerCounts })
      );
    }
  }

  /**
   * Setup trigger system for all state machines
   * @private
   */
  async _setupTriggers() {
    if (!this.config.enableScheduler && !this.config.enableDateTriggers && !this.config.enableFunctionTriggers && !this.config.enableEventTriggers) {
      // All triggers disabled
      return;
    }

    const cronJobs = {};

    for (const [machineId, machineData] of this.machines) {
      const machineConfig = machineData.config;

      for (const [stateName, stateConfig] of Object.entries(machineConfig.states)) {
        const triggers = stateConfig.triggers || [];

        for (let i = 0; i < triggers.length; i++) {
          const trigger = triggers[i];
          const triggerName = `${trigger.action}_${i}`;

          if (trigger.type === 'cron' && this.config.enableScheduler) {
            // Collect cron triggers for SchedulerPlugin
            const jobName = `${machineId}_${stateName}_${triggerName}`;
            cronJobs[jobName] = await this._createCronJob(machineId, stateName, trigger, triggerName);
          } else if (trigger.type === 'date' && this.config.enableDateTriggers) {
            // Setup date-based trigger
            await this._setupDateTrigger(machineId, stateName, trigger, triggerName);
          } else if (trigger.type === 'function' && this.config.enableFunctionTriggers) {
            // Setup function-based trigger
            await this._setupFunctionTrigger(machineId, stateName, trigger, triggerName);
          } else if (trigger.type === 'event' && this.config.enableEventTriggers) {
            // Setup event-based trigger
            await this._setupEventTrigger(machineId, stateName, trigger, triggerName);
          }
        }
      }
    }

    // Install SchedulerPlugin if there are cron jobs
    if (Object.keys(cronJobs).length > 0 && this.config.enableScheduler) {
      const { SchedulerPlugin } = await import('./scheduler.plugin.js');
      this.schedulerPlugin = new SchedulerPlugin({
        jobs: cronJobs,
        persistJobs: false, // Don't persist trigger jobs
        verbose: this.config.verbose,
        ...this.config.schedulerConfig
      });

      await this.database.usePlugin(this.schedulerPlugin);

      if (this.config.verbose) {
        console.log(`[StateMachinePlugin] Installed SchedulerPlugin with ${Object.keys(cronJobs).length} cron triggers`);
      }
    }
  }

  /**
   * Create a SchedulerPlugin job for a cron trigger
   * @private
   */
  async _createCronJob(machineId, stateName, trigger, triggerName) {
    return {
      schedule: trigger.schedule,
      description: `Trigger '${triggerName}' for ${machineId}.${stateName}`,
      action: async (database, context) => {
        // Find all entities in this state
        const entities = await this._getEntitiesInState(machineId, stateName);

        let executedCount = 0;

        for (const entity of entities) {
          try {
            // Check condition if provided
            if (trigger.condition) {
              const shouldTrigger = await trigger.condition(entity.context, entity.entityId);
              if (!shouldTrigger) continue;
            }

            // Check max triggers
            if (trigger.maxTriggers !== undefined) {
              const triggerCount = entity.triggerCounts?.[triggerName] || 0;
              if (triggerCount >= trigger.maxTriggers) {
                // Send max triggers event if configured
                if (trigger.onMaxTriggersReached) {
                  await this.send(machineId, entity.entityId, trigger.onMaxTriggersReached, entity.context);
                }
                continue;
              }
            }

            // Execute trigger action
            const result = await this._executeAction(
              trigger.action,
              entity.context,
              'TRIGGER',
              machineId,
              entity.entityId
            );

            // Increment trigger count
            await this._incrementTriggerCount(machineId, entity.entityId, triggerName);
            executedCount++;

            // Send success event if configured
            if (trigger.eventOnSuccess) {
              await this.send(machineId, entity.entityId, trigger.eventOnSuccess, {
                ...entity.context,
                triggerResult: result
              });
            } else if (trigger.event) {
              await this.send(machineId, entity.entityId, trigger.event, {
                ...entity.context,
                triggerResult: result
              });
            }

            this.emit('plg:state-machine:trigger-executed', {
              machineId,
              entityId: entity.entityId,
              state: stateName,
              trigger: triggerName,
              type: 'cron'
            });

          } catch (error) {
            // Send failure event if configured
            if (trigger.event) {
              await tryFn(() => this.send(machineId, entity.entityId, trigger.event, {
                ...entity.context,
                triggerError: error.message
              }));
            }

            if (this.config.verbose) {
              console.error(`[StateMachinePlugin] Trigger '${triggerName}' failed for entity ${entity.entityId}:`, error.message);
            }
          }
        }

        return { processed: entities.length, executed: executedCount };
      }
    };
  }

  /**
   * Setup a date-based trigger
   * @private
   */
  async _setupDateTrigger(machineId, stateName, trigger, triggerName) {
    // Poll for entities approaching trigger date
    const checkInterval = setInterval(async () => {
      const entities = await this._getEntitiesInState(machineId, stateName);

      for (const entity of entities) {
        try {
          // Get trigger date from context field
          const triggerDateValue = entity.context?.[trigger.field];
          if (!triggerDateValue) continue;

          const triggerDate = new Date(triggerDateValue);
          const now = new Date();

          // Check if trigger date reached
          if (now >= triggerDate) {
            // Check max triggers
            if (trigger.maxTriggers !== undefined) {
              const triggerCount = entity.triggerCounts?.[triggerName] || 0;
              if (triggerCount >= trigger.maxTriggers) {
                if (trigger.onMaxTriggersReached) {
                  await this.send(machineId, entity.entityId, trigger.onMaxTriggersReached, entity.context);
                }
                continue;
              }
            }

            // Execute action
            const result = await this._executeAction(trigger.action, entity.context, 'TRIGGER', machineId, entity.entityId);
            await this._incrementTriggerCount(machineId, entity.entityId, triggerName);

            // Send event
            if (trigger.event) {
              await this.send(machineId, entity.entityId, trigger.event, {
                ...entity.context,
                triggerResult: result
              });
            }

            this.emit('plg:state-machine:trigger-executed', {
              machineId,
              entityId: entity.entityId,
              state: stateName,
              trigger: triggerName,
              type: 'date'
            });
          }
        } catch (error) {
          if (this.config.verbose) {
            console.error(`[StateMachinePlugin] Date trigger '${triggerName}' failed:`, error.message);
          }
        }
      }
    }, this.config.triggerCheckInterval);

    this.triggerIntervals.push(checkInterval);
  }

  /**
   * Setup a function-based trigger
   * @private
   */
  async _setupFunctionTrigger(machineId, stateName, trigger, triggerName) {
    const interval = trigger.interval || this.config.triggerCheckInterval;

    const checkInterval = setInterval(async () => {
      const entities = await this._getEntitiesInState(machineId, stateName);

      for (const entity of entities) {
        try {
          // Check max triggers
          if (trigger.maxTriggers !== undefined) {
            const triggerCount = entity.triggerCounts?.[triggerName] || 0;
            if (triggerCount >= trigger.maxTriggers) {
              if (trigger.onMaxTriggersReached) {
                await this.send(machineId, entity.entityId, trigger.onMaxTriggersReached, entity.context);
              }
              continue;
            }
          }

          // Evaluate condition
          const shouldTrigger = await trigger.condition(entity.context, entity.entityId);

          if (shouldTrigger) {
            const result = await this._executeAction(trigger.action, entity.context, 'TRIGGER', machineId, entity.entityId);
            await this._incrementTriggerCount(machineId, entity.entityId, triggerName);

            // Send event if configured
            if (trigger.event) {
              await this.send(machineId, entity.entityId, trigger.event, {
                ...entity.context,
                triggerResult: result
              });
            }

            this.emit('plg:state-machine:trigger-executed', {
              machineId,
              entityId: entity.entityId,
              state: stateName,
              trigger: triggerName,
              type: 'function'
            });
          }
        } catch (error) {
          if (this.config.verbose) {
            console.error(`[StateMachinePlugin] Function trigger '${triggerName}' failed:`, error.message);
          }
        }
      }
    }, interval);

    this.triggerIntervals.push(checkInterval);
  }

  /**
   * Setup an event-based trigger
   * Supports both old API (trigger.event) and new API (trigger.eventName + eventSource)
   * @private
   */
  async _setupEventTrigger(machineId, stateName, trigger, triggerName) {
    // Support both old API (event) and new API (eventName)
    const baseEventName = trigger.eventName || trigger.event;
    const eventSource = trigger.eventSource;

    if (!baseEventName) {
      throw new StateMachineError(`Event trigger '${triggerName}' must have either 'event' or 'eventName' property`, {
        operation: '_setupEventTrigger',
        machineId,
        stateName,
        triggerName
      });
    }

    // Create event listener
    const eventHandler = async (eventData) => {
      const entities = await this._getEntitiesInState(machineId, stateName);

      for (const entity of entities) {
        try {
          // Resolve dynamic event name if it's a function
          let resolvedEventName;
          if (typeof baseEventName === 'function') {
            resolvedEventName = baseEventName(entity.context);
          } else {
            resolvedEventName = baseEventName;
          }

          // Skip if event name doesn't match (for dynamic event names)
          // This allows filtering events by entity context
          if (eventSource && typeof baseEventName === 'function') {
            // For resource-specific events with dynamic names, we need to check
            // if this specific event matches this entity
            // The eventData will contain the ID that was part of the event name
            const eventIdMatch = eventData?.id || eventData?.entityId;
            if (eventIdMatch && entity.entityId !== eventIdMatch) {
              continue; // Not for this entity
            }
          }

          // Check condition if provided
          if (trigger.condition) {
            const shouldTrigger = await trigger.condition(entity.context, entity.entityId, eventData);
            if (!shouldTrigger) continue;
          }

          // Check max triggers
          if (trigger.maxTriggers !== undefined) {
            const triggerCount = entity.triggerCounts?.[triggerName] || 0;
            if (triggerCount >= trigger.maxTriggers) {
              if (trigger.onMaxTriggersReached) {
                await this.send(machineId, entity.entityId, trigger.onMaxTriggersReached, entity.context);
              }
              continue;
            }
          }

          // NEW: Support targetState for automatic transitions
          if (trigger.targetState) {
            // Automatic transition to target state
            await this._transition(
              machineId,
              entity.entityId,
              stateName,
              trigger.targetState,
              'TRIGGER',
              { ...entity.context, eventData, triggerName }
            );

            // Update resource's stateField if configured
            const machine = this.machines.get(machineId);
            const resourceConfig = machine.config;
            if (resourceConfig.resource && resourceConfig.stateField) {
              // Get the resource instance
              let resource;
              if (typeof resourceConfig.resource === 'string') {
                resource = await this.database.getResource(resourceConfig.resource);
              } else {
                resource = resourceConfig.resource;
              }

              // Update the state field in the resource
              if (resource) {
                const [ok] = await tryFn(() =>
                  resource.patch(entity.entityId, { [resourceConfig.stateField]: trigger.targetState })
                );
                if (!ok && this.config.verbose) {
                  console.warn(`[StateMachinePlugin] Failed to update resource stateField for entity ${entity.entityId}`);
                }
              }
            }

            // Execute entry action of target state if exists
            const targetStateConfig = machine.config.states[trigger.targetState];
            if (targetStateConfig?.entry) {
              await this._executeAction(
                targetStateConfig.entry,
                { ...entity.context, eventData },
                'TRIGGER',
                machineId,
                entity.entityId
              );
            }

            // Emit transition event
            this.emit('plg:state-machine:transition', {
              machineId,
              entityId: entity.entityId,
              from: stateName,
              to: trigger.targetState,
              event: 'TRIGGER',
              context: { ...entity.context, eventData, triggerName }
            });
          } else if (trigger.action) {
            // Execute trigger action with event data in context
            const result = await this._executeAction(
              trigger.action,
              { ...entity.context, eventData },
              'TRIGGER',
              machineId,
              entity.entityId
            );

            // Send success event if configured
            if (trigger.sendEvent) {
              await this.send(machineId, entity.entityId, trigger.sendEvent, {
                ...entity.context,
                triggerResult: result,
                eventData
              });
            }
          }

          await this._incrementTriggerCount(machineId, entity.entityId, triggerName);

          this.emit('plg:state-machine:trigger-executed', {
            machineId,
            entityId: entity.entityId,
            state: stateName,
            trigger: triggerName,
            type: 'event',
            eventName: resolvedEventName,
            targetState: trigger.targetState
          });
        } catch (error) {
          if (this.config.verbose) {
            console.error(`[StateMachinePlugin] Event trigger '${triggerName}' failed:`, error.message);
          }
        }
      }
    };

    // NEW: Support eventSource for resource-specific events
    if (eventSource) {
      // Listen to events from a specific resource
      // Resource events are typically: inserted, updated, deleted
      const baseEvent = typeof baseEventName === 'function' ? 'updated' : baseEventName;

      // IMPORTANT: For resources with async events, we need to ensure the event handler
      // completes before returning control. We wrap the handler to track pending operations.
      const wrappedHandler = async (...args) => {
        // Track this as a pending operation
        const handlerPromise = eventHandler(...args);

        // Store promise if state machine has event tracking
        if (!this._pendingEventHandlers) {
          this._pendingEventHandlers = new Set();
        }
        this._pendingEventHandlers.add(handlerPromise);

        try {
          await handlerPromise;
        } finally {
          this._pendingEventHandlers.delete(handlerPromise);
        }
      };

      eventSource.on(baseEvent, wrappedHandler);

      if (this.config.verbose) {
        console.log(`[StateMachinePlugin] Listening to resource event '${baseEvent}' from '${eventSource.name}' for trigger '${triggerName}' (async-safe)`);
      }
    } else {
      // Original behavior: listen to database or plugin events
      const staticEventName = typeof baseEventName === 'function' ? 'updated' : baseEventName;

      if (staticEventName.startsWith('db:')) {
        const dbEventName = staticEventName.substring(3); // Remove 'db:' prefix
        this.database.on(dbEventName, eventHandler);

        if (this.config.verbose) {
          console.log(`[StateMachinePlugin] Listening to database event '${dbEventName}' for trigger '${triggerName}'`);
        }
      } else {
        // Listen to plugin events
        this.on(staticEventName, eventHandler);

        if (this.config.verbose) {
          console.log(`[StateMachinePlugin] Listening to plugin event '${staticEventName}' for trigger '${triggerName}'`);
        }
      }
    }
  }

  /**
   * Attach state machine instances to their associated resources
   * This enables the resource API: resource.state(id, event)
   * @private
   */
  async _attachStateMachinesToResources() {
    for (const [machineName, machineConfig] of Object.entries(this.config.stateMachines)) {
      const resourceConfig = machineConfig.config || machineConfig;

      // Skip if no resource is specified
      if (!resourceConfig.resource) {
        if (this.config.verbose) {
          console.log(`[StateMachinePlugin] Machine '${machineName}' has no resource configured, skipping attachment`);
        }
        continue;
      }

      // Get the resource instance
      let resource;
      if (typeof resourceConfig.resource === 'string') {
        // Resource specified as name
        resource = this.database.resources[resourceConfig.resource];
        if (!resource) {
          console.warn(
            `[StateMachinePlugin] Resource '${resourceConfig.resource}' not found for machine '${machineName}'. ` +
            `Resource API will not be available.`
          );
          continue;
        }
      } else {
        // Resource specified as instance
        resource = resourceConfig.resource;
      }

      // Create a machine proxy that delegates to this plugin
      const machineProxy = {
        send: async (id, event, eventData) => {
          return this.send(machineName, id, event, eventData);
        },
        getState: async (id) => {
          return this.getState(machineName, id);
        },
        canTransition: async (id, event) => {
          return this.canTransition(machineName, id, event);
        },
        getValidEvents: async (id) => {
          return this.getValidEvents(machineName, id);
        },
        initializeEntity: async (id, context) => {
          return this.initializeEntity(machineName, id, context);
        },
        getTransitionHistory: async (id, options) => {
          return this.getTransitionHistory(machineName, id, options);
        }
      };

      // Attach the proxy to the resource
      resource._attachStateMachine(machineProxy);

      if (this.config.verbose) {
        console.log(`[StateMachinePlugin] Attached machine '${machineName}' to resource '${resource.name}'`);
      }
    }
  }

  async start() {
    if (this.config.verbose) {
      console.log(`[StateMachinePlugin] Started with ${this.machines.size} state machines`);
    }
  }

  async stop() {
    // Clear trigger intervals
    for (const interval of this.triggerIntervals) {
      clearInterval(interval);
    }
    this.triggerIntervals = [];

    // Stop scheduler plugin if installed
    if (this.schedulerPlugin) {
      await this.schedulerPlugin.stop();
      this.schedulerPlugin = null;
    }

    this.machines.clear();
    this.removeAllListeners();
  }
}