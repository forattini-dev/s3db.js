import type { MiddlewareHandler } from 'hono';
export interface CorsConfig {
    origin?: string;
    methods?: string[];
    allowedHeaders?: string[];
    exposedHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
}
export declare function createCorsMiddleware(config?: CorsConfig): MiddlewareHandler;
//# sourceMappingURL=cors.d.ts.map