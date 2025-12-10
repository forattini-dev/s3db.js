import type { MiddlewareHandler } from 'hono';
import type { S3DBLogger } from '../../../concerns/logger.js';
export interface CompressionConfig {
    threshold?: number;
    level?: number;
    logLevel?: string;
}
export interface CompressionContext {
    logger: S3DBLogger;
}
export declare function createCompressionMiddleware(config?: CompressionConfig, context?: CompressionContext): MiddlewareHandler;
//# sourceMappingURL=compression.d.ts.map