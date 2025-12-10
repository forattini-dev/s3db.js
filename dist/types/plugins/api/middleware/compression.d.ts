import type { Context, Next } from 'hono';
import type { Logger } from '../../../concerns/logger.js';
export interface CompressionConfig {
    threshold: number;
}
export declare function createCompressionMiddleware(compressionConfig: CompressionConfig, logger?: Logger | null): Promise<(c: Context, next: Next) => Promise<void>>;
//# sourceMappingURL=compression.d.ts.map