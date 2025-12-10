export interface StateMap {
  [key: string]: string;
}

export interface Transition {
  from: string | string[];
  to: string;
}

export interface TransitionMap {
  [key: string]: Transition;
}

export interface TransitionValidation {
  valid: boolean;
  newState?: string;
  error?: string;
}

export interface ResourceLike {
  patch(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface RecordWithStatus {
  id: string;
  status: string;
  [key: string]: unknown;
}

class StateMachine {
  protected STATES: StateMap;
  protected TRANSITIONS: TransitionMap;

  constructor(states: StateMap, transitions: TransitionMap) {
    this.STATES = states;
    this.TRANSITIONS = transitions;
  }

  canTransition(currentState: string, transitionName: string): TransitionValidation {
    const transition = this.TRANSITIONS[transitionName];

    if (!transition) {
      return {
        valid: false,
        error: `Unknown transition: ${transitionName}. Valid transitions: ${Object.keys(this.TRANSITIONS).join(', ')}`
      };
    }

    const validFromStates = Array.isArray(transition.from) ? transition.from : [transition.from];

    if (!validFromStates.includes(currentState)) {
      return {
        valid: false,
        error: `Cannot transition from "${currentState}" to "${transition.to}" via "${transitionName}". Expected current state to be one of: ${validFromStates.join(', ')}`
      };
    }

    return { valid: true, newState: transition.to };
  }

  async transition(
    record: RecordWithStatus,
    transitionName: string,
    resource: ResourceLike,
    metadata: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> {
    const validation = this.canTransition(record.status, transitionName);

    if (!validation.valid) {
      throw new Error(`State machine error: ${validation.error}`);
    }

    const updateData = {
      status: validation.newState,
      ...metadata,
      lastTransitionAt: new Date().toISOString(),
      lastTransition: transitionName
    };

    const updated = await resource.patch(record.id, updateData);

    return updated;
  }

  getValidTransitions(currentState: string): string[] {
    return Object.entries(this.TRANSITIONS)
      .filter(([_, transition]) => {
        const validFromStates = Array.isArray(transition.from) ? transition.from : [transition.from];
        return validFromStates.includes(currentState);
      })
      .map(([name]) => name);
  }

  isTerminalState(state: string): boolean {
    return this.getValidTransitions(state).length === 0;
  }
}

export class NotificationStateMachine extends StateMachine {
  constructor() {
    const STATES: StateMap = {
      PENDING: 'pending',
      PROCESSING: 'processing',
      COMPLETED: 'completed',
      FAILED: 'failed'
    };

    const TRANSITIONS: TransitionMap = {
      START_PROCESSING: { from: 'pending', to: 'processing' },
      COMPLETE: { from: 'processing', to: 'completed' },
      FAIL: { from: 'processing', to: 'failed' },
      RETRY: { from: 'processing', to: 'pending' }
    };

    super(STATES, TRANSITIONS);
  }
}

export class AttemptStateMachine extends StateMachine {
  constructor() {
    const STATES: StateMap = {
      QUEUED: 'queued',
      RUNNING: 'running',
      SUCCESS: 'success',
      FAILED: 'failed',
      TIMEOUT: 'timeout'
    };

    const TRANSITIONS: TransitionMap = {
      START: { from: 'queued', to: 'running' },
      SUCCEED: { from: 'running', to: 'success' },
      FAIL: { from: 'running', to: 'failed' },
      TIMEOUT: { from: 'running', to: 'timeout' }
    };

    super(STATES, TRANSITIONS);
  }

  async create(resource: ResourceLike, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return await resource.insert({
      ...data,
      status: this.STATES.QUEUED,
      createdAt: new Date().toISOString()
    });
  }

  override async transition(
    record: RecordWithStatus,
    transitionName: string,
    resource: ResourceLike,
    metadata: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> {
    const validation = this.canTransition(record.status, transitionName);

    if (!validation.valid) {
      throw new Error(`State machine error: ${validation.error}`);
    }

    const newRecord = await resource.insert({
      ...record,
      status: validation.newState,
      ...metadata,
      lastTransitionAt: new Date().toISOString(),
      lastTransition: transitionName
    });

    return newRecord;
  }
}

export function createNotificationStateMachine(): NotificationStateMachine {
  return new NotificationStateMachine();
}

export function createAttemptStateMachine(): AttemptStateMachine {
  return new AttemptStateMachine();
}

export default {
  NotificationStateMachine,
  AttemptStateMachine,
  createNotificationStateMachine,
  createAttemptStateMachine
};
