import AsyncEventEmitter from '../concerns/async-event-emitter.js';
type EventListener = (...args: unknown[]) => void | Promise<void>;
export interface EventListeners {
    [eventName: string]: EventListener | EventListener[];
}
export interface ResourceEventsConfig {
    disableEvents?: boolean;
    disableResourceEvents?: boolean;
    events?: EventListeners;
}
export interface Resource extends AsyncEventEmitter {
    name: string;
}
export declare class ResourceEvents {
    resource: Resource;
    disabled: boolean;
    private _emitterProto;
    private _pendingListeners;
    private _wired;
    constructor(resource: Resource, config?: ResourceEventsConfig);
    isDisabled(): boolean;
    isWired(): boolean;
    ensureWired(): void;
    emitStandardized(event: string, payload: unknown, id?: string | null): void;
    on(eventName: string, listener: EventListener): Resource;
    once(eventName: string, listener: EventListener): Resource;
    emit(eventName: string, ...args: unknown[]): boolean;
}
export default ResourceEvents;
//# sourceMappingURL=resource-events.class.d.ts.map