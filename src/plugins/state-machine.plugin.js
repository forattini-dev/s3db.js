import Plugin from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";

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
 *       await machine.database.resource('inventory').update(context.productId, {
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
 *       const inventory = await machine.database.resource('inventory').get(context.productId);
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
 * const validEvents = stateMachine.getValidEvents('order_processing', 'pending');
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
      verbose: options.verbose || false,
      ...options
    };
    
    this.database = null;
    this.machines = new Map();
    this.stateStorage = new Map(); // In-memory cache for states
    
    this._validateConfiguration();
  }

  _validateConfiguration() {
    if (!this.config.stateMachines || Object.keys(this.config.stateMachines).length === 0) {
      throw new Error('StateMachinePlugin: At least one state machine must be defined');
    }
    
    for (const [machineName, machine] of Object.entries(this.config.stateMachines)) {
      if (!machine.states || Object.keys(machine.states).length === 0) {
        throw new Error(`StateMachinePlugin: Machine '${machineName}' must have states defined`);
      }
      
      if (!machine.initialState) {
        throw new Error(`StateMachinePlugin: Machine '${machineName}' must have an initialState`);
      }
      
      if (!machine.states[machine.initialState]) {
        throw new Error(`StateMachinePlugin: Initial state '${machine.initialState}' not found in machine '${machineName}'`);
      }
    }
  }

  async setup(database) {
    this.database = database;
    
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
    
    this.emit('initialized', { machines: Array.from(this.machines.keys()) });
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
      throw new Error(`State machine '${machineId}' not found`);
    }
    
    const currentState = await this.getState(machineId, entityId);
    const stateConfig = machine.config.states[currentState];
    
    if (!stateConfig || !stateConfig.on || !stateConfig.on[event]) {
      throw new Error(`Event '${event}' not valid for state '${currentState}' in machine '${machineId}'`);
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
          throw new Error(`Transition blocked by guard '${guardName}': ${guardErr?.message || 'Guard returned false'}`);
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
    
    this.emit('transition', {
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
  }

  async _executeAction(actionName, context, event, machineId, entityId) {
    const action = this.config.actions[actionName];
    if (!action) {
      if (this.config.verbose) {
        console.warn(`[StateMachinePlugin] Action '${actionName}' not found`);
      }
      return;
    }
    
    const [ok, error] = await tryFn(() => 
      action(context, event, { database: this.database, machineId, entityId })
    );
    
    if (!ok) {
      if (this.config.verbose) {
        console.error(`[StateMachinePlugin] Action '${actionName}' failed:`, error.message);
      }
      this.emit('action_error', { actionName, error: error.message, machineId, entityId });
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
      
      const [logOk, logErr] = await tryFn(() => 
        this.database.resource(this.config.transitionLogResource).insert({
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
      
      if (!logOk && this.config.verbose) {
        console.warn(`[StateMachinePlugin] Failed to log transition:`, logErr.message);
      }
      
      // Update current state
      const stateId = `${machineId}_${entityId}`;
      const [stateOk, stateErr] = await tryFn(async () => {
        const exists = await this.database.resource(this.config.stateResource).exists(stateId);
        
        const stateData = {
          id: stateId,
          machineId,
          entityId,
          currentState: toState,
          context,
          lastTransition: transitionId,
          updatedAt: now
        };
        
        if (exists) {
          await this.database.resource(this.config.stateResource).update(stateId, stateData);
        } else {
          await this.database.resource(this.config.stateResource).insert(stateData);
        }
      });
      
      if (!stateOk && this.config.verbose) {
        console.warn(`[StateMachinePlugin] Failed to update state:`, stateErr.message);
      }
    }
  }

  /**
   * Get current state for an entity
   */
  async getState(machineId, entityId) {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new Error(`State machine '${machineId}' not found`);
    }
    
    // Check in-memory cache first
    if (machine.currentStates.has(entityId)) {
      return machine.currentStates.get(entityId);
    }
    
    // Check persistent storage
    if (this.config.persistTransitions) {
      const stateId = `${machineId}_${entityId}`;
      const [ok, err, stateRecord] = await tryFn(() => 
        this.database.resource(this.config.stateResource).get(stateId)
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
   */
  getValidEvents(machineId, stateOrEntityId) {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new Error(`State machine '${machineId}' not found`);
    }
    
    let state;
    if (machine.config.states[stateOrEntityId]) {
      // stateOrEntityId is a state name
      state = stateOrEntityId;
    } else {
      // stateOrEntityId is an entityId, get current state
      state = machine.currentStates.get(stateOrEntityId) || machine.config.initialState;
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
      this.database.resource(this.config.transitionLogResource).list({
        where: { machineId, entityId },
        orderBy: { timestamp: 'desc' },
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
    
    // Sort by timestamp descending to ensure newest first
    const sortedTransitions = transitions.sort((a, b) => b.timestamp - a.timestamp);
    
    return sortedTransitions.map(t => ({
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
      throw new Error(`State machine '${machineId}' not found`);
    }
    
    const initialState = machine.config.initialState;
    machine.currentStates.set(entityId, initialState);
    
    if (this.config.persistTransitions) {
      const now = new Date().toISOString();
      const stateId = `${machineId}_${entityId}`;
      
      await this.database.resource(this.config.stateResource).insert({
        id: stateId,
        machineId,
        entityId,
        currentState: initialState,
        context,
        lastTransition: null,
        updatedAt: now
      });
    }
    
    // Execute entry action for initial state
    const initialStateConfig = machine.config.states[initialState];
    if (initialStateConfig && initialStateConfig.entry) {
      await this._executeAction(initialStateConfig.entry, context, 'INIT', machineId, entityId);
    }
    
    this.emit('entity_initialized', { machineId, entityId, initialState });
    
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
      throw new Error(`State machine '${machineId}' not found`);
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

  async start() {
    if (this.config.verbose) {
      console.log(`[StateMachinePlugin] Started with ${this.machines.size} state machines`);
    }
  }

  async stop() {
    this.machines.clear();
    this.stateStorage.clear();
  }

  async cleanup() {
    await this.stop();
    this.removeAllListeners();
  }
}

export default StateMachinePlugin;