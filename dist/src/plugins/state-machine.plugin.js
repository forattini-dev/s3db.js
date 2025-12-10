import { Plugin } from './plugin.class.js';
import tryFn from '../concerns/try-fn.js';
import { resolveResourceNames } from './concerns/resource-names.js';
import { StateMachineError } from './state-machine.errors.js';
import { ErrorClassifier } from '../concerns/error-classifier.js';
import { getCronManager } from '../concerns/cron-manager.js';
export class StateMachinePlugin extends Plugin {
    config;
    machines;
    resourceNames;
    triggerJobNames;
    schedulerPlugin;
    _pendingEventHandlers;
    _resourceDescriptors;
    constructor(options = {}) {
        super(options);
        const smOptions = this.options;
        const { resourceNames = {}, stateMachines = {}, actions = {}, guards = {}, persistTransitions = true, transitionLogResource, stateResource, retryAttempts = 3, retryDelay = 100, workerId = 'default', lockTimeout = 1000, lockTTL = 5, retryConfig = null, enableScheduler = false, schedulerConfig = {}, enableDateTriggers = true, enableFunctionTriggers = true, enableEventTriggers = true, triggerCheckInterval = 60000, ...rest } = smOptions;
        const resourceNamesOption = resourceNames || {};
        this._resourceDescriptors = {
            transitionLog: {
                defaultName: 'plg_state_transitions',
                override: resourceNamesOption.transitionLog || transitionLogResource
            },
            states: {
                defaultName: 'plg_entity_states',
                override: resourceNamesOption.states || stateResource
            }
        };
        this.resourceNames = this._resolveResourceNames();
        this.config = {
            stateMachines,
            actions,
            guards,
            persistTransitions,
            transitionLogResource: this.resourceNames.transitionLog,
            stateResource: this.resourceNames.states,
            retryAttempts,
            retryDelay,
            logLevel: this.logLevel,
            workerId,
            lockTimeout,
            lockTTL,
            retryConfig,
            enableScheduler,
            schedulerConfig,
            enableDateTriggers,
            enableFunctionTriggers,
            enableEventTriggers,
            triggerCheckInterval,
            ...rest
        };
        this.machines = new Map();
        this.triggerJobNames = [];
        this.schedulerPlugin = null;
        this._pendingEventHandlers = new Set();
        this._validateConfiguration();
    }
    _resolveResourceNames() {
        return resolveResourceNames('state_machine', this._resourceDescriptors, {
            namespace: this.namespace
        });
    }
    onNamespaceChanged() {
        this.resourceNames = this._resolveResourceNames();
        if (this.config) {
            this.config.transitionLogResource = this.resourceNames.transitionLog;
            this.config.stateResource = this.resourceNames.states;
        }
    }
    async waitForPendingEvents(timeout = 5000) {
        if (this._pendingEventHandlers.size === 0) {
            return;
        }
        const startTime = Date.now();
        while (this._pendingEventHandlers.size > 0) {
            if (Date.now() - startTime > timeout) {
                throw new StateMachineError(`Timeout waiting for ${this._pendingEventHandlers.size} pending event handlers`, {
                    operation: 'waitForPendingEvents',
                    pendingCount: this._pendingEventHandlers.size,
                    timeout
                });
            }
            if (this._pendingEventHandlers.size > 0) {
                await Promise.race(Array.from(this._pendingEventHandlers));
            }
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
        if (this.config.persistTransitions) {
            await this._createStateResources();
        }
        for (const [machineName, machineConfig] of Object.entries(this.config.stateMachines)) {
            this.machines.set(machineName, {
                config: machineConfig,
                currentStates: new Map()
            });
        }
        await this._attachStateMachinesToResources();
        await this._setupTriggers();
        this.emit('db:plugin:initialized', { machines: Array.from(this.machines.keys()) });
    }
    async _createStateResources() {
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
        const [stateOk] = await tryFn(() => this.database.createResource({
            name: this.config.stateResource,
            attributes: {
                id: 'string|required',
                machineId: 'string|required',
                entityId: 'string|required',
                currentState: 'string|required',
                context: 'json|default:{}',
                lastTransition: 'string|default:null',
                triggerCounts: 'json|default:{}',
                updatedAt: 'string|required'
            },
            behavior: 'body-overflow'
        }));
    }
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
        const lock = await this._acquireTransitionLock(machineId, entityId);
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
            if (stateConfig.guards && stateConfig.guards[event]) {
                const guardName = stateConfig.guards[event];
                const guard = this.config.guards[guardName];
                if (guard) {
                    const [guardOk, guardErr, guardResult] = await tryFn(() => guard(context, event, { database: this.database, machineId, entityId }));
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
            if (stateConfig.exit) {
                await this._executeAction(stateConfig.exit, context, event, machineId, entityId);
            }
            await this._transition(machineId, entityId, currentState, targetState, event, context);
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
        }
        finally {
            await this._releaseTransitionLock(lock);
        }
    }
    async _executeAction(actionName, context, event, machineId, entityId) {
        const action = this.config.actions[actionName];
        if (!action) {
            this.logger.warn({ actionName, machineId, entityId }, `Action '${actionName}' not found`);
            return undefined;
        }
        const machine = this.machines.get(machineId);
        const currentState = await this.getState(machineId, entityId);
        const stateConfig = machine?.config?.states?.[currentState];
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
                if (attempt > 0) {
                    this.emit('plg:state-machine:action-retry-success', {
                        machineId,
                        entityId,
                        action: actionName,
                        attempts: attempt + 1,
                        state: currentState
                    });
                    this.logger.debug({ actionName, machineId, entityId, attempts: attempt + 1 }, `Action '${actionName}' succeeded after ${attempt + 1} attempts`);
                }
                return result;
            }
            catch (error) {
                lastError = error;
                if (!retryEnabled) {
                    this.logger.error({ actionName, machineId, entityId, error: lastError.message }, `Action '${actionName}' failed: ${lastError.message}`);
                    this.emit('plg:state-machine:action-error', { actionName, error: lastError.message, machineId, entityId });
                    return;
                }
                const classification = ErrorClassifier.classify(error, {
                    retryableErrors: retryConfig.retryableErrors,
                    nonRetriableErrors: retryConfig.nonRetriableErrors
                });
                if (classification === 'NON_RETRIABLE') {
                    this.emit('plg:state-machine:action-error-non-retriable', {
                        machineId,
                        entityId,
                        action: actionName,
                        error: lastError.message,
                        state: currentState
                    });
                    this.logger.error({ actionName, machineId, entityId, error: lastError.message, state: currentState }, `Action '${actionName}' failed with non-retriable error: ${lastError.message}`);
                    throw error;
                }
                if (attempt >= maxAttempts) {
                    this.emit('plg:state-machine:action-retry-exhausted', {
                        machineId,
                        entityId,
                        action: actionName,
                        attempts: attempt + 1,
                        error: lastError.message,
                        state: currentState
                    });
                    this.logger.error({ actionName, machineId, entityId, attempts: attempt + 1, error: lastError.message, state: currentState }, `Action '${actionName}' failed after ${attempt + 1} attempts: ${lastError.message}`);
                    throw error;
                }
                attempt++;
                const delay = this._calculateBackoff(attempt, retryConfig);
                if (retryConfig.onRetry) {
                    try {
                        await retryConfig.onRetry(attempt, lastError, context);
                    }
                    catch (hookError) {
                        this.logger.warn({ hookError: hookError.message }, `onRetry hook failed: ${hookError.message}`);
                    }
                }
                this.emit('plg:state-machine:action-retry-attempt', {
                    machineId,
                    entityId,
                    action: actionName,
                    attempt,
                    delay,
                    error: lastError.message,
                    state: currentState
                });
                this.logger.warn({ actionName, machineId, entityId, attempt, maxAttempts, delay, error: lastError.message }, `Action '${actionName}' failed (attempt ${attempt + 1}/${maxAttempts + 1}), retrying in ${delay}ms: ${lastError.message}`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        return undefined;
    }
    async _transition(machineId, entityId, fromState, toState, event, context) {
        const timestamp = Date.now();
        const now = new Date().toISOString();
        const machine = this.machines.get(machineId);
        machine.currentStates.set(entityId, toState);
        if (this.config.persistTransitions) {
            const transitionId = `${machineId}_${entityId}_${timestamp}`;
            let logOk = false;
            let lastLogErr;
            for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
                const [ok, err] = await tryFn(() => this.database.resources[this.config.transitionLogResource].insert({
                    id: transitionId,
                    machineId,
                    entityId,
                    fromState,
                    toState,
                    event,
                    context,
                    timestamp,
                    createdAt: now.slice(0, 10)
                }));
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
            if (!logOk && lastLogErr) {
                this.logger.warn({ machineId, entityId, attempts: this.config.retryAttempts, error: lastLogErr.message }, `Failed to log transition after ${this.config.retryAttempts} attempts: ${lastLogErr.message}`);
            }
            const stateId = `${machineId}_${entityId}`;
            const stateData = {
                machineId,
                entityId,
                currentState: toState,
                context,
                lastTransition: transitionId,
                updatedAt: now
            };
            const [updateOk] = await tryFn(() => this.database.resources[this.config.stateResource].update(stateId, stateData));
            if (!updateOk) {
                const [insertOk, insertErr] = await tryFn(() => this.database.resources[this.config.stateResource].insert({ id: stateId, ...stateData }));
                if (!insertOk) {
                    this.logger.warn({ machineId, entityId, stateId, error: insertErr.message }, `Failed to upsert state: ${insertErr.message}`);
                }
            }
        }
    }
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
        return lock;
    }
    async _releaseTransitionLock(lock) {
        if (!lock)
            return;
        const storage = this.getStorage();
        const [ok, err] = await tryFn(() => storage.releaseLock(lock));
        if (!ok) {
            this.logger.warn({ lockName: lock?.name, error: err.message }, `Failed to release lock '${lock?.name}': ${err.message}`);
        }
    }
    _calculateBackoff(attempt, retryConfig) {
        const { backoffStrategy = 'exponential', baseDelay = 1000, maxDelay = 30000 } = retryConfig || {};
        let delay;
        if (backoffStrategy === 'exponential') {
            delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        }
        else if (backoffStrategy === 'linear') {
            delay = Math.min(baseDelay * attempt, maxDelay);
        }
        else {
            delay = baseDelay;
        }
        const jitter = delay * 0.2 * (Math.random() - 0.5);
        return Math.round(delay + jitter);
    }
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
        if (machine.currentStates.has(entityId)) {
            return machine.currentStates.get(entityId);
        }
        if (this.config.persistTransitions) {
            const stateId = `${machineId}_${entityId}`;
            const [ok, , stateRecord] = await tryFn(() => this.database.resources[this.config.stateResource].get(stateId));
            if (ok && stateRecord) {
                machine.currentStates.set(entityId, stateRecord.currentState);
                return stateRecord.currentState;
            }
        }
        const initialState = machine.config.initialState;
        machine.currentStates.set(entityId, initialState);
        return initialState;
    }
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
            state = stateOrEntityId;
        }
        else {
            state = await this.getState(machineId, stateOrEntityId);
        }
        const stateConfig = machine.config.states[state];
        return stateConfig && stateConfig.on ? Object.keys(stateConfig.on) : [];
    }
    async getTransitionHistory(machineId, entityId, options = {}) {
        if (!this.config.persistTransitions) {
            return [];
        }
        const { limit = 50, offset = 0 } = options;
        const [ok, err, transitions] = await tryFn(() => this.database.resources[this.config.transitionLogResource].query({
            machineId,
            entityId
        }, {
            limit,
            offset
        }));
        if (!ok) {
            this.logger.warn({ machineId, entityId, error: err.message }, `Failed to get transition history: ${err.message}`);
            return [];
        }
        const sorted = (transitions || []).sort((a, b) => b.timestamp - a.timestamp);
        return sorted.map(t => ({
            from: t.fromState,
            to: t.toState,
            event: t.event,
            context: t.context,
            timestamp: new Date(t.timestamp).toISOString()
        }));
    }
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
            const [ok, err] = await tryFn(() => this.database.resources[this.config.stateResource].insert({
                id: stateId,
                machineId,
                entityId,
                currentState: initialState,
                context,
                lastTransition: null,
                updatedAt: now
            }));
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
        const initialStateConfig = machine.config.states[initialState];
        if (initialStateConfig && initialStateConfig.entry) {
            await this._executeAction(initialStateConfig.entry, context, 'INIT', machineId, entityId);
        }
        this.emit('plg:state-machine:entity-initialized', { machineId, entityId, initialState });
        return initialState;
    }
    getMachineDefinition(machineId) {
        const machine = this.machines.get(machineId);
        return machine ? machine.config : null;
    }
    getMachines() {
        return Array.from(this.machines.keys());
    }
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
        for (const [stateName, stateConfig] of Object.entries(machine.config.states)) {
            const shape = stateConfig.type === 'final' ? 'doublecircle' : 'circle';
            const color = stateConfig.meta?.color || 'lightblue';
            dot += `  ${stateName} [shape=${shape}, fillcolor=${color}, style=filled];\n`;
        }
        for (const [stateName, stateConfig] of Object.entries(machine.config.states)) {
            if (stateConfig.on) {
                for (const [event, targetState] of Object.entries(stateConfig.on)) {
                    dot += `  ${stateName} -> ${targetState} [label="${event}"];\n`;
                }
            }
        }
        dot += `  start [shape=point];\n`;
        dot += `  start -> ${machine.config.initialState};\n`;
        dot += `}\n`;
        return dot;
    }
    async _getEntitiesInState(machineId, stateName) {
        if (!this.config.persistTransitions) {
            const machine = this.machines.get(machineId);
            if (!machine)
                return [];
            const entities = [];
            for (const [entityId, currentState] of machine.currentStates) {
                if (currentState === stateName) {
                    entities.push({ entityId, currentState, context: {}, triggerCounts: {} });
                }
            }
            return entities;
        }
        const [ok, err, records] = await tryFn(() => this.database.resources[this.config.stateResource].query({
            machineId,
            currentState: stateName
        }));
        if (!ok) {
            this.logger.warn({ machineId, stateName, error: err.message }, `Failed to query entities in state '${stateName}': ${err.message}`);
            return [];
        }
        return (records || []).map(r => ({
            entityId: r.entityId,
            currentState: r.currentState,
            context: r.context,
            triggerCounts: r.triggerCounts || {}
        }));
    }
    async _incrementTriggerCount(machineId, entityId, triggerName) {
        if (!this.config.persistTransitions) {
            return;
        }
        const stateId = `${machineId}_${entityId}`;
        const [ok, , stateRecord] = await tryFn(() => this.database.resources[this.config.stateResource].get(stateId));
        if (ok && stateRecord) {
            const triggerCounts = stateRecord.triggerCounts || {};
            triggerCounts[triggerName] = (triggerCounts[triggerName] || 0) + 1;
            await tryFn(() => this.database.resources[this.config.stateResource].patch(stateId, { triggerCounts }));
        }
    }
    async _setupTriggers() {
        if (!this.config.enableScheduler && !this.config.enableDateTriggers && !this.config.enableFunctionTriggers && !this.config.enableEventTriggers) {
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
                        const jobName = `${machineId}_${stateName}_${triggerName}`;
                        cronJobs[jobName] = await this._createCronJob(machineId, stateName, trigger, triggerName);
                    }
                    else if (trigger.type === 'date' && this.config.enableDateTriggers) {
                        await this._setupDateTrigger(machineId, stateName, trigger, triggerName);
                    }
                    else if (trigger.type === 'function' && this.config.enableFunctionTriggers) {
                        await this._setupFunctionTrigger(machineId, stateName, trigger, triggerName);
                    }
                    else if (trigger.type === 'event' && this.config.enableEventTriggers) {
                        await this._setupEventTrigger(machineId, stateName, trigger, triggerName);
                    }
                }
            }
        }
        if (Object.keys(cronJobs).length > 0 && this.config.enableScheduler) {
            const { SchedulerPlugin } = await import('./scheduler.plugin.js');
            this.schedulerPlugin = new SchedulerPlugin({
                jobs: cronJobs,
                persistJobs: false,
                logLevel: this.logLevel,
                ...this.config.schedulerConfig
            });
            await this.database.usePlugin(this.schedulerPlugin);
            this.logger.debug({ cronJobCount: Object.keys(cronJobs).length }, `Installed SchedulerPlugin with ${Object.keys(cronJobs).length} cron triggers`);
        }
    }
    async _createCronJob(machineId, stateName, trigger, triggerName) {
        return {
            schedule: trigger.schedule,
            description: `Trigger '${triggerName}' for ${machineId}.${stateName}`,
            action: async () => {
                const entities = await this._getEntitiesInState(machineId, stateName);
                let executedCount = 0;
                for (const entity of entities) {
                    try {
                        if (trigger.condition) {
                            const shouldTrigger = await trigger.condition(entity.context, entity.entityId);
                            if (!shouldTrigger)
                                continue;
                        }
                        if (trigger.maxTriggers !== undefined) {
                            const triggerCount = entity.triggerCounts?.[triggerName] || 0;
                            if (triggerCount >= trigger.maxTriggers) {
                                if (trigger.onMaxTriggersReached) {
                                    await this.send(machineId, entity.entityId, trigger.onMaxTriggersReached, entity.context);
                                }
                                continue;
                            }
                        }
                        const result = await this._executeAction(trigger.action, entity.context, 'TRIGGER', machineId, entity.entityId);
                        await this._incrementTriggerCount(machineId, entity.entityId, triggerName);
                        executedCount++;
                        if (trigger.eventOnSuccess) {
                            await this.send(machineId, entity.entityId, trigger.eventOnSuccess, {
                                ...entity.context,
                                triggerResult: result
                            });
                        }
                        else if (trigger.event) {
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
                    }
                    catch (error) {
                        if (trigger.event) {
                            await tryFn(() => this.send(machineId, entity.entityId, trigger.event, {
                                ...entity.context,
                                triggerError: error.message
                            }));
                        }
                        this.logger.error({ triggerName, machineId, entityId: entity.entityId, error: error.message }, `Trigger '${triggerName}' failed for entity ${entity.entityId}: ${error.message}`);
                    }
                }
                return { processed: entities.length, executed: executedCount };
            }
        };
    }
    async _setupDateTrigger(machineId, stateName, trigger, triggerName) {
        const cronManager = getCronManager();
        await cronManager.scheduleInterval(this.config.triggerCheckInterval, async () => {
            const entities = await this._getEntitiesInState(machineId, stateName);
            for (const entity of entities) {
                try {
                    const triggerDateValue = entity.context?.[trigger.field];
                    if (!triggerDateValue)
                        continue;
                    const triggerDate = new Date(triggerDateValue);
                    const now = new Date();
                    if (now >= triggerDate) {
                        if (trigger.maxTriggers !== undefined) {
                            const triggerCount = entity.triggerCounts?.[triggerName] || 0;
                            if (triggerCount >= trigger.maxTriggers) {
                                if (trigger.onMaxTriggersReached) {
                                    await this.send(machineId, entity.entityId, trigger.onMaxTriggersReached, entity.context);
                                }
                                continue;
                            }
                        }
                        const result = await this._executeAction(trigger.action, entity.context, 'TRIGGER', machineId, entity.entityId);
                        await this._incrementTriggerCount(machineId, entity.entityId, triggerName);
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
                }
                catch (error) {
                    this.logger.error({ triggerName, machineId, stateName, error: error.message }, `Date trigger '${triggerName}' failed: ${error.message}`);
                }
            }
        }, `date-trigger-${machineId}-${stateName}-${triggerName}`);
        const jobName = `date-trigger-${machineId}-${stateName}-${triggerName}`;
        this.triggerJobNames.push(jobName);
    }
    async _setupFunctionTrigger(machineId, stateName, trigger, triggerName) {
        const interval = trigger.interval || this.config.triggerCheckInterval;
        const cronManager = getCronManager();
        await cronManager.scheduleInterval(interval, async () => {
            const entities = await this._getEntitiesInState(machineId, stateName);
            for (const entity of entities) {
                try {
                    if (trigger.maxTriggers !== undefined) {
                        const triggerCount = entity.triggerCounts?.[triggerName] || 0;
                        if (triggerCount >= trigger.maxTriggers) {
                            if (trigger.onMaxTriggersReached) {
                                await this.send(machineId, entity.entityId, trigger.onMaxTriggersReached, entity.context);
                            }
                            continue;
                        }
                    }
                    const shouldTrigger = await trigger.condition(entity.context, entity.entityId);
                    if (shouldTrigger) {
                        const result = await this._executeAction(trigger.action, entity.context, 'TRIGGER', machineId, entity.entityId);
                        await this._incrementTriggerCount(machineId, entity.entityId, triggerName);
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
                }
                catch (error) {
                    this.logger.error({ triggerName, machineId, stateName, error: error.message }, `Function trigger '${triggerName}' failed: ${error.message}`);
                }
            }
        }, `function-trigger-${machineId}-${stateName}-${triggerName}`);
        const jobName = `function-trigger-${machineId}-${stateName}-${triggerName}`;
        this.triggerJobNames.push(jobName);
    }
    async _setupEventTrigger(machineId, stateName, trigger, triggerName) {
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
        const eventHandler = async (eventData) => {
            const entities = await this._getEntitiesInState(machineId, stateName);
            for (const entity of entities) {
                try {
                    let resolvedEventName;
                    if (typeof baseEventName === 'function') {
                        resolvedEventName = baseEventName(entity.context);
                    }
                    else {
                        resolvedEventName = baseEventName;
                    }
                    if (eventSource && typeof baseEventName === 'function') {
                        const eventIdMatch = eventData?.id || eventData?.entityId;
                        if (eventIdMatch && entity.entityId !== eventIdMatch) {
                            continue;
                        }
                    }
                    if (trigger.condition) {
                        const shouldTrigger = await trigger.condition(entity.context, entity.entityId, eventData);
                        if (!shouldTrigger)
                            continue;
                    }
                    if (trigger.maxTriggers !== undefined) {
                        const triggerCount = entity.triggerCounts?.[triggerName] || 0;
                        if (triggerCount >= trigger.maxTriggers) {
                            if (trigger.onMaxTriggersReached) {
                                await this.send(machineId, entity.entityId, trigger.onMaxTriggersReached, entity.context);
                            }
                            continue;
                        }
                    }
                    if (trigger.targetState) {
                        await this._transition(machineId, entity.entityId, stateName, trigger.targetState, 'TRIGGER', { ...entity.context, eventData, triggerName });
                        const machine = this.machines.get(machineId);
                        const resourceConfig = machine.config;
                        if (resourceConfig.resource && resourceConfig.stateField) {
                            let resource;
                            if (typeof resourceConfig.resource === 'string') {
                                resource = await this.database.getResource(resourceConfig.resource);
                            }
                            else {
                                resource = resourceConfig.resource;
                            }
                            if (resource) {
                                const [ok] = await tryFn(() => resource.patch(entity.entityId, { [resourceConfig.stateField]: trigger.targetState }));
                                if (!ok) {
                                    this.logger.warn({ machineId, entityId: entity.entityId }, `Failed to update resource stateField for entity ${entity.entityId}`);
                                }
                            }
                        }
                        const targetStateConfig = machine.config.states[trigger.targetState];
                        if (targetStateConfig?.entry) {
                            await this._executeAction(targetStateConfig.entry, { ...entity.context, eventData }, 'TRIGGER', machineId, entity.entityId);
                        }
                        this.emit('plg:state-machine:transition', {
                            machineId,
                            entityId: entity.entityId,
                            from: stateName,
                            to: trigger.targetState,
                            event: 'TRIGGER',
                            context: { ...entity.context, eventData, triggerName }
                        });
                    }
                    else if (trigger.action) {
                        const result = await this._executeAction(trigger.action, { ...entity.context, eventData }, 'TRIGGER', machineId, entity.entityId);
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
                        eventName: typeof baseEventName === 'function' ? 'dynamic' : baseEventName,
                        targetState: trigger.targetState
                    });
                }
                catch (error) {
                    this.logger.error({ triggerName, machineId, stateName, error: error.message }, `Event trigger '${triggerName}' failed: ${error.message}`);
                }
            }
        };
        if (eventSource) {
            const baseEvent = typeof baseEventName === 'function' ? 'updated' : baseEventName;
            const wrappedHandler = async (...args) => {
                const handlerPromise = eventHandler(args[0]);
                if (!this._pendingEventHandlers) {
                    this._pendingEventHandlers = new Set();
                }
                this._pendingEventHandlers.add(handlerPromise);
                try {
                    await handlerPromise;
                }
                finally {
                    this._pendingEventHandlers.delete(handlerPromise);
                }
            };
            eventSource.on(baseEvent, wrappedHandler);
            this.logger.debug({ baseEvent, resourceName: eventSource.name, triggerName }, `Listening to resource event '${baseEvent}' from '${eventSource.name}' for trigger '${triggerName}' (async-safe)`);
        }
        else {
            const staticEventName = typeof baseEventName === 'function' ? 'updated' : baseEventName;
            if (staticEventName.startsWith('db:')) {
                const dbEventName = staticEventName.substring(3);
                this.database.on(dbEventName, eventHandler);
                this.logger.debug({ dbEventName, triggerName }, `Listening to database event '${dbEventName}' for trigger '${triggerName}'`);
            }
            else {
                this.on(staticEventName, eventHandler);
                this.logger.debug({ staticEventName, triggerName }, `Listening to plugin event '${staticEventName}' for trigger '${triggerName}'`);
            }
        }
    }
    async _attachStateMachinesToResources() {
        for (const [machineName, machineConfig] of Object.entries(this.config.stateMachines)) {
            const resourceConfig = machineConfig.config || machineConfig;
            if (!resourceConfig.resource) {
                this.logger.debug({ machineName }, `Machine '${machineName}' has no resource configured, skipping attachment`);
                continue;
            }
            let resource;
            if (typeof resourceConfig.resource === 'string') {
                resource = this.database.resources[resourceConfig.resource];
                if (!resource) {
                    this.logger.warn({ machineName, resourceName: resourceConfig.resource }, `Resource '${resourceConfig.resource}' not found for machine '${machineName}'. Resource API will not be available.`);
                    continue;
                }
            }
            else {
                resource = resourceConfig.resource;
            }
            const machineProxy = {
                send: async (id, event, eventData) => {
                    return this.send(machineName, id, event, eventData || {});
                },
                getState: async (id) => {
                    return this.getState(machineName, id);
                },
                canTransition: async (id, event) => {
                    const validEvents = await this.getValidEvents(machineName, id);
                    return validEvents.includes(event);
                },
                getValidEvents: async (id) => {
                    return this.getValidEvents(machineName, id);
                },
                initializeEntity: async (id, context) => {
                    return this.initializeEntity(machineName, id, context || {});
                },
                getTransitionHistory: async (id, options) => {
                    return this.getTransitionHistory(machineName, id, options);
                }
            };
            resource._stateMachine = machineProxy;
            Object.defineProperty(resource, 'state', {
                get: () => ({
                    send: async (id, event, eventData) => machineProxy.send(id, event, eventData),
                    get: async (id) => machineProxy.getState(id),
                    canTransition: async (id, event) => machineProxy.canTransition(id, event),
                    getValidEvents: async (id) => machineProxy.getValidEvents(id),
                    initialize: async (id, context) => machineProxy.initializeEntity(id, context),
                    history: async (id, options) => machineProxy.getTransitionHistory(id, options)
                }),
                configurable: true,
                enumerable: false
            });
            this.logger.debug({ machineName, resourceName: resource.name }, `Attached machine '${machineName}' to resource '${resource.name}'`);
        }
    }
    async start() {
        this.logger.debug({ machineCount: this.machines.size }, `Started with ${this.machines.size} state machines`);
    }
    async stop() {
        const cronManager = getCronManager();
        for (const jobName of this.triggerJobNames) {
            cronManager.stop(jobName);
        }
        this.triggerJobNames = [];
        if (this.schedulerPlugin) {
            await this.schedulerPlugin.stop();
            this.schedulerPlugin = null;
        }
        this.machines.clear();
        this.removeAllListeners();
    }
}
//# sourceMappingURL=state-machine.plugin.js.map