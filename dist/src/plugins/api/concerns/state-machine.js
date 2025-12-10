class StateMachine {
    STATES;
    TRANSITIONS;
    constructor(states, transitions) {
        this.STATES = states;
        this.TRANSITIONS = transitions;
    }
    canTransition(currentState, transitionName) {
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
    async transition(record, transitionName, resource, metadata = {}) {
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
    getValidTransitions(currentState) {
        return Object.entries(this.TRANSITIONS)
            .filter(([_, transition]) => {
            const validFromStates = Array.isArray(transition.from) ? transition.from : [transition.from];
            return validFromStates.includes(currentState);
        })
            .map(([name]) => name);
    }
    isTerminalState(state) {
        return this.getValidTransitions(state).length === 0;
    }
}
export class NotificationStateMachine extends StateMachine {
    constructor() {
        const STATES = {
            PENDING: 'pending',
            PROCESSING: 'processing',
            COMPLETED: 'completed',
            FAILED: 'failed'
        };
        const TRANSITIONS = {
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
        const STATES = {
            QUEUED: 'queued',
            RUNNING: 'running',
            SUCCESS: 'success',
            FAILED: 'failed',
            TIMEOUT: 'timeout'
        };
        const TRANSITIONS = {
            START: { from: 'queued', to: 'running' },
            SUCCEED: { from: 'running', to: 'success' },
            FAIL: { from: 'running', to: 'failed' },
            TIMEOUT: { from: 'running', to: 'timeout' }
        };
        super(STATES, TRANSITIONS);
    }
    async create(resource, data) {
        return await resource.insert({
            ...data,
            status: this.STATES.QUEUED,
            createdAt: new Date().toISOString()
        });
    }
    async transition(record, transitionName, resource, metadata = {}) {
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
export function createNotificationStateMachine() {
    return new NotificationStateMachine();
}
export function createAttemptStateMachine() {
    return new AttemptStateMachine();
}
export default {
    NotificationStateMachine,
    AttemptStateMachine,
    createNotificationStateMachine,
    createAttemptStateMachine
};
//# sourceMappingURL=state-machine.js.map