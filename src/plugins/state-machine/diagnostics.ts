import { resolveEdge } from './helpers.js';
import { StateMachineError } from '../state-machine.errors.js';
import type {
  StateMachineConfig,
  MachineConfig,
  MachineDefinitionIssue,
  MachineDefinitionDiagnostics,
  ConditionalTarget,
  TransitionEdge,
  ActionHandler,
  GuardHandler,
  Logger
} from './types.js';

export function validateConfiguration(
  config: StateMachineConfig,
  logger: Logger,
  getDiagnostics: (machineId: string, machineConfig: MachineConfig) => MachineDefinitionDiagnostics
): void {
  if (config.concurrency.mode !== 'serial' && config.concurrency.mode !== 'parallel') {
    throw new StateMachineError(`Invalid global concurrency mode '${config.concurrency.mode}'`, {
      operation: 'validateConfiguration',
      suggestion: 'Use one of: serial | parallel'
    });
  }

  if (config.concurrency.conflict !== 'reject' && config.concurrency.conflict !== 'drop') {
    throw new StateMachineError(`Invalid global concurrency conflict policy '${config.concurrency.conflict}'`, {
      operation: 'validateConfiguration',
      suggestion: 'Use one of: reject | drop'
    });
  }

  if (!config.stateMachines || Object.keys(config.stateMachines).length === 0) {
    throw new StateMachineError('At least one state machine must be defined', {
      operation: 'validateConfiguration',
      machineCount: 0,
      suggestion: 'Provide at least one state machine in the stateMachines configuration'
    });
  }

  for (const [machineName, machine] of Object.entries(config.stateMachines)) {
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

    if (machine.concurrency?.mode && machine.concurrency.mode !== 'serial' && machine.concurrency.mode !== 'parallel') {
      throw new StateMachineError(`Invalid concurrency mode '${machine.concurrency.mode}' in machine '${machineName}'`, {
        operation: 'validateConfiguration',
        machineId: machineName,
        suggestion: 'Use one of: serial | parallel'
      });
    }

    if (machine.concurrency?.conflict && machine.concurrency.conflict !== 'reject' && machine.concurrency.conflict !== 'drop') {
      throw new StateMachineError(`Invalid concurrency conflict policy '${machine.concurrency.conflict}' in machine '${machineName}'`, {
        operation: 'validateConfiguration',
        machineId: machineName,
        suggestion: 'Use one of: reject | drop'
      });
    }

    const diagnostics = getDiagnostics(machineName, machine);
    if (diagnostics.errors.length > 0) {
      throw new StateMachineError(`State machine '${machineName}' definition is invalid`, {
        operation: 'validateConfiguration',
        machineId: machineName,
        errors: diagnostics.errors,
        suggestion: 'Fix definition errors before initializing the plugin'
      });
    }

    if (diagnostics.warnings.length > 0) {
      logger.warn({ machineId: machineName, warnings: diagnostics.warnings }, `State machine '${machineName}' has definition warnings`);
    }
  }
}

export function getMachineDefinitionDiagnostics(
  machineId: string,
  config: MachineConfig,
  registeredGuards: Record<string, GuardHandler>,
  registeredActions: Record<string, ActionHandler>
): MachineDefinitionDiagnostics {
  const stateNames = Object.keys(config.states);
  const errors: MachineDefinitionIssue[] = [];
  const warnings: MachineDefinitionIssue[] = [];
  const incomingTransitions = new Map<string, number>();
  const transitionTargets = new Map<string, string[]>();
  let transitionCount = 0;
  let deadStatesCount: string[] = [];

  for (const stateName of stateNames) {
    incomingTransitions.set(stateName, 0);
  }

  for (const [stateName, stateConfig] of Object.entries(config.states)) {
    const on = stateConfig.on || {};
    const targets: string[] = [];

    for (const [event, edgeConfig] of Object.entries(on)) {
      transitionCount++;

      const edgeCandidates: Array<{ target: string; guard: string | undefined; beforeTransition: string[]; afterTransition: string[] }> = Array.isArray(edgeConfig)
        ? (edgeConfig as ConditionalTarget[]).map(c => resolveEdge(c))
        : [resolveEdge(edgeConfig as string | TransitionEdge)];

      for (const edge of edgeCandidates) {
        const target = edge.target;
        targets.push(target);

        if (!config.states[target]) {
          errors.push({
            code: 'MISSING_TARGET_STATE',
            message: `Transition target state '${target}' is not defined in machine '${machineId}'`,
            state: stateName,
            event,
            targetState: target
          });
          continue;
        }

        const incoming = incomingTransitions.get(target) || 0;
        incomingTransitions.set(target, incoming + 1);

        if (edge.guard && !registeredGuards[edge.guard]) {
          errors.push({
            code: 'MISSING_GUARD',
            message: `Edge guard '${edge.guard}' is not registered in machine '${machineId}'`,
            state: stateName,
            event,
            guardName: edge.guard
          });
        }

        for (const actionName of edge.beforeTransition) {
          if (!registeredActions[actionName]) {
            errors.push({
              code: 'MISSING_HOOK_ACTION',
              message: `Edge beforeTransition hook '${actionName}' is not registered in machine '${machineId}'`,
              state: stateName,
              event,
              actionName
            });
          }
        }
        for (const actionName of edge.afterTransition) {
          if (!registeredActions[actionName]) {
            errors.push({
              code: 'MISSING_HOOK_ACTION',
              message: `Edge afterTransition hook '${actionName}' is not registered in machine '${machineId}'`,
              state: stateName,
              event,
              actionName
            });
          }
        }
      }
    }

    transitionTargets.set(stateName, targets);

    if (Object.keys(on).length === 0 && stateConfig.type !== 'final') {
      warnings.push({
        code: 'STATE_WITHOUT_TRANSITIONS',
        message: `State '${stateName}' has no outgoing transitions`,
        state: stateName
      });
    }

    const guardMappings = stateConfig.guards || {};
    for (const [event, guardName] of Object.entries(guardMappings)) {
      if (!registeredGuards[guardName]) {
        errors.push({
          code: 'MISSING_GUARD',
          message: `Guard '${guardName}' is not registered in machine '${machineId}'`,
          state: stateName,
          event,
          guardName
        });
      }
    }

    const entryActions: string[] = stateConfig.entry ? (Array.isArray(stateConfig.entry) ? stateConfig.entry : [stateConfig.entry]) : [];
    for (const actionName of entryActions) {
      if (!registeredActions[actionName]) {
        errors.push({
          code: 'MISSING_ACTION',
          message: `Entry action '${actionName}' is not registered in machine '${machineId}'`,
          state: stateName,
          actionName
        });
      }
    }

    const exitActions: string[] = stateConfig.exit ? (Array.isArray(stateConfig.exit) ? stateConfig.exit : [stateConfig.exit]) : [];
    for (const actionName of exitActions) {
      if (!registeredActions[actionName]) {
        errors.push({
          code: 'MISSING_ACTION',
          message: `Exit action '${actionName}' is not registered in machine '${machineId}'`,
          state: stateName,
          actionName
        });
      }
    }

    const hookFields = ['beforeLeave', 'beforeEnter', 'afterLeave', 'afterEnter'] as const;
    for (const hookField of hookFields) {
      const hookValue = stateConfig[hookField] as string | string[] | undefined;
      if (!hookValue) continue;
      const hookActions = Array.isArray(hookValue) ? hookValue : [hookValue];
      for (const actionName of hookActions) {
        if (!registeredActions[actionName]) {
          errors.push({
            code: 'MISSING_HOOK_ACTION',
            message: `${hookField} hook action '${actionName}' is not registered in machine '${machineId}'`,
            state: stateName,
            actionName
          });
        }
      }
    }

    const afterEnterAll = [...entryActions, ...(stateConfig.afterEnter ? (Array.isArray(stateConfig.afterEnter) ? stateConfig.afterEnter : [stateConfig.afterEnter]) : [])];
    const beforeLeaveAll = [...exitActions, ...(stateConfig.beforeLeave ? (Array.isArray(stateConfig.beforeLeave) ? stateConfig.beforeLeave : [stateConfig.beforeLeave]) : [])];

    const afterEnterSeen = new Set<string>();
    for (const name of afterEnterAll) {
      if (afterEnterSeen.has(name)) {
        warnings.push({
          code: 'DUPLICATE_HOOK_ACTION',
          message: `Action '${name}' appears in both 'entry' and 'afterEnter' in state '${stateName}' of machine '${machineId}'`,
          state: stateName,
          actionName: name
        });
      }
      afterEnterSeen.add(name);
    }

    const beforeLeaveSeen = new Set<string>();
    for (const name of beforeLeaveAll) {
      if (beforeLeaveSeen.has(name)) {
        warnings.push({
          code: 'DUPLICATE_HOOK_ACTION',
          message: `Action '${name}' appears in both 'exit' and 'beforeLeave' in state '${stateName}' of machine '${machineId}'`,
          state: stateName,
          actionName: name
        });
      }
      beforeLeaveSeen.add(name);
    }
  }

  if (config.hooks) {
    const machineHookFields = ['beforeTransition', 'afterTransition', 'beforeFinalize', 'afterFinalize', 'afterReject', 'afterError', 'afterInitialize', 'afterDelete'] as const;
    for (const hookField of machineHookFields) {
      const hookValue = config.hooks[hookField];
      if (!hookValue) continue;
      const hookActions = Array.isArray(hookValue) ? hookValue : [hookValue];
      for (const actionName of hookActions) {
        if (!registeredActions[actionName]) {
          errors.push({
            code: 'MISSING_HOOK_ACTION',
            message: `${hookField} hook action '${actionName}' is not registered in machine '${machineId}'`,
            actionName
          });
        }
      }
    }
  }

  const reachable = new Set<string>();
  const toVisit = [config.initialState];
  reachable.add(config.initialState);

  while (toVisit.length > 0) {
    const current = toVisit.shift();
    if (!current) continue;

    const targets = transitionTargets.get(current) || [];
    for (const target of targets) {
      if (!reachable.has(target)) {
        reachable.add(target);
        toVisit.push(target);
      }
    }
  }

  const unreachableStates = stateNames.filter((stateName) => !reachable.has(stateName));
  for (const stateName of unreachableStates) {
    warnings.push({
      code: 'UNREACHABLE_STATE',
      message: `State '${stateName}' is unreachable from initial state '${config.initialState}'`,
      state: stateName
    });
  }

  const orphanStates = stateNames.filter((stateName) => stateName !== config.initialState && (incomingTransitions.get(stateName) || 0) === 0);
  for (const stateName of orphanStates) {
    warnings.push({
      code: 'ORPHAN_STATE',
      message: `State '${stateName}' has no incoming transitions`,
      state: stateName
    });
  }

  deadStatesCount = stateNames.filter((stateName) => {
    const stateConfig = config.states[stateName];
    return stateConfig?.type !== 'final' && (!stateConfig?.on || Object.keys(stateConfig.on).length === 0);
  });

  return {
    machineId,
    errors,
    warnings,
    stats: {
      states: stateNames.length,
      transitions: transitionCount,
      deadStates: deadStatesCount,
      unreachableStates
    }
  };
}
