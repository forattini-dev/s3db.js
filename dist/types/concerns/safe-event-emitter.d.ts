import EventEmitter from 'events';
import { S3DBLogger, LogLevel } from './logger.js';
export interface SafeEventEmitterOptions {
    logLevel?: LogLevel;
    logger?: S3DBLogger;
    autoCleanup?: boolean;
    maxListeners?: number;
}
export interface ListenerStats {
    [eventName: string]: number;
}
export declare class SafeEventEmitter extends EventEmitter {
    options: Required<Omit<SafeEventEmitterOptions, 'logger'>> & {
        logger?: S3DBLogger;
    };
    logger: S3DBLogger;
    private _signalHandlersSetup;
    private _isDestroyed;
    private _boundCleanupHandler?;
    constructor(options?: SafeEventEmitterOptions);
    private _setupSignalHandlers;
    private _handleCleanup;
    on(eventName: string | symbol, listener: (...args: unknown[]) => void): this;
    once(eventName: string | symbol, listener: (...args: unknown[]) => void): this;
    emit(eventName: string | symbol, ...args: unknown[]): boolean;
    private handleError;
    getListenerStats(): ListenerStats;
    getTotalListenerCount(): number;
    destroy(): void;
    isDestroyed(): boolean;
    removeSignalHandlers(): void;
}
export declare function createSafeEventEmitter(options?: SafeEventEmitterOptions): SafeEventEmitter;
export default SafeEventEmitter;
//# sourceMappingURL=safe-event-emitter.d.ts.map