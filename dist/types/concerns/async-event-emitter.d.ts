import EventEmitter from 'events';
import { S3DBLogger, LogLevel } from './logger.js';
export interface AsyncEventEmitterOptions {
    logLevel?: LogLevel;
    logger?: S3DBLogger;
}
export declare class AsyncEventEmitter extends EventEmitter {
    private _asyncMode;
    logLevel: LogLevel;
    logger: S3DBLogger;
    constructor(options?: AsyncEventEmitterOptions);
    emit(event: string | symbol, ...args: unknown[]): boolean;
    emitSync(event: string | symbol, ...args: unknown[]): boolean;
    setAsyncMode(enabled: boolean): void;
}
export default AsyncEventEmitter;
//# sourceMappingURL=async-event-emitter.d.ts.map