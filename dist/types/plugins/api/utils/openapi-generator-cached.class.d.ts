import type { OpenAPISpec, OpenAPIGeneratorConfig } from './openapi-generator.js';
export interface ApiAppLike {
    getRoutes(): RouteMetadata[];
}
export interface RouteMetadata {
    method: string;
    path: string;
    description?: string;
    operationId?: string;
    tags?: string[];
}
export interface DatabaseLike {
    resources: Record<string, ResourceLike>;
}
export interface ResourceLike {
    name: string;
    config?: {
        currentVersion?: string;
        [key: string]: unknown;
    };
    version?: string;
    attributes?: Record<string, unknown>;
    [key: string]: unknown;
}
export interface CachedGeneratorOptions extends OpenAPIGeneratorConfig {
    logLevel?: string;
}
export interface CacheStats {
    cached: boolean;
    cacheKey: string | null;
    size: number;
}
export interface LoggerLike {
    info(message: string): void;
}
export declare class OpenAPIGeneratorCached {
    private database;
    private app;
    private options;
    private logger;
    private cache;
    private cacheKey;
    constructor({ database, app, options, logger }: {
        database: DatabaseLike;
        app?: ApiAppLike | null;
        options: CachedGeneratorOptions;
        logger?: LoggerLike | null;
    });
    generate(): OpenAPISpec;
    private generateCacheKey;
    invalidate(): void;
    getStats(): CacheStats;
}
//# sourceMappingURL=openapi-generator-cached.class.d.ts.map