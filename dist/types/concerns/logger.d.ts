import { Logger as PinoLogger, TransportSingleOptions } from 'pino';
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
export type LogFormat = 'json' | 'pretty';
export interface LoggerOptions {
    level?: LogLevel;
    name?: string;
    format?: LogFormat;
    transport?: TransportSingleOptions;
    bindings?: Record<string, unknown>;
    redactPatterns?: RegExp[];
    maxPayloadBytes?: number;
}
export interface S3DBLogger extends PinoLogger {
    _maxPayloadBytes?: number;
}
export type Logger = S3DBLogger;
export declare function createLogger(options?: LoggerOptions): S3DBLogger;
export declare function getLogger(name: string, options?: Omit<LoggerOptions, 'name'>): S3DBLogger;
export declare function getGlobalLogger(options?: LoggerOptions): S3DBLogger;
export declare function resetGlobalLogger(): void;
export declare function getLoggerOptionsFromEnv(configOptions?: LoggerOptions): LoggerOptions;
export declare function exampleUsage(): void;
export default createLogger;
//# sourceMappingURL=logger.d.ts.map