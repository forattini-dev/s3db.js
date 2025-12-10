import { EventEmitter } from 'events';
export interface ApiEventEmitterOptions {
    enabled?: boolean;
    logLevel?: string;
    maxListeners?: number;
}
export interface EventData {
    event?: string;
    timestamp?: string;
    [key: string]: unknown;
}
export interface EventStats {
    enabled: boolean;
    maxListeners: number;
    listeners: Record<string, number>;
}
export declare class ApiEventEmitter extends EventEmitter {
    private options;
    constructor(options?: ApiEventEmitterOptions);
    emit(event: string, data?: EventData): boolean;
    emitUserEvent(action: string, data: EventData): void;
    emitAuthEvent(action: string, data: EventData): void;
    emitResourceEvent(action: string, data: EventData): void;
    emitRequestEvent(action: string, data: EventData): void;
    getStats(): EventStats;
}
export default ApiEventEmitter;
//# sourceMappingURL=event-emitter.d.ts.map