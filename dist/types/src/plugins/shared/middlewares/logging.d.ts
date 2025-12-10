import type { MiddlewareHandler } from 'hono';
import type { S3DBLogger } from '../../../concerns/logger.js';
export interface LoggingConfig {
    format?: string;
    logLevel?: string;
}
export interface LoggingContext {
    logger: S3DBLogger;
}
export declare function createLoggingMiddleware(config?: LoggingConfig, context?: LoggingContext): MiddlewareHandler;
//# sourceMappingURL=logging.d.ts.map