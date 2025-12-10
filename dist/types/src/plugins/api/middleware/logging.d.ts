import type { Context, Next } from 'hono';
import type { Logger } from '../../../concerns/logger.js';
export interface FilterContext {
    context: Context;
    method: string;
    path: string;
    status: number;
    duration: number;
    requestId: string | undefined;
}
export interface LoggingConfig {
    format?: string;
    colorize?: boolean;
    filter?: (ctx: FilterContext) => boolean;
    excludePaths?: string[];
}
export declare function createLoggingMiddleware(loggingConfig: LoggingConfig, logger: Logger): Promise<(c: Context, next: Next) => Promise<void>>;
//# sourceMappingURL=logging.d.ts.map