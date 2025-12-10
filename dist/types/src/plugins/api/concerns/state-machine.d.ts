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
declare class StateMachine {
    protected STATES: StateMap;
    protected TRANSITIONS: TransitionMap;
    constructor(states: StateMap, transitions: TransitionMap);
    canTransition(currentState: string, transitionName: string): TransitionValidation;
    transition(record: RecordWithStatus, transitionName: string, resource: ResourceLike, metadata?: Record<string, unknown>): Promise<Record<string, unknown>>;
    getValidTransitions(currentState: string): string[];
    isTerminalState(state: string): boolean;
}
export declare class NotificationStateMachine extends StateMachine {
    constructor();
}
export declare class AttemptStateMachine extends StateMachine {
    constructor();
    create(resource: ResourceLike, data: Record<string, unknown>): Promise<Record<string, unknown>>;
    transition(record: RecordWithStatus, transitionName: string, resource: ResourceLike, metadata?: Record<string, unknown>): Promise<Record<string, unknown>>;
}
export declare function createNotificationStateMachine(): NotificationStateMachine;
export declare function createAttemptStateMachine(): AttemptStateMachine;
declare const _default: {
    NotificationStateMachine: typeof NotificationStateMachine;
    AttemptStateMachine: typeof AttemptStateMachine;
    createNotificationStateMachine: typeof createNotificationStateMachine;
    createAttemptStateMachine: typeof createAttemptStateMachine;
};
export default _default;
//# sourceMappingURL=state-machine.d.ts.map