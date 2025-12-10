import type { Database } from '../../database.class.js';
import type { Resource } from '../../resource.class.js';
import type { S3Client } from '../../clients/s3-client.class.js';
export interface PluginOptions {
    logLevel?: string;
    resources?: Resource[] | null;
    database?: Database | null;
    client?: S3Client | null;
    [key: string]: unknown;
}
export interface PluginFallback {
    logLevel?: string;
    resources?: Resource[] | null;
    database?: Database | null;
    client?: S3Client | null;
}
export interface PluginContext {
    logLevel?: string;
    resources?: Resource[] | null;
    database?: Database | null;
    client?: S3Client | null;
    [key: string]: unknown;
}
export declare function normalizePluginOptions(plugin: PluginContext, options?: PluginOptions, fallback?: PluginFallback): PluginOptions;
export default normalizePluginOptions;
//# sourceMappingURL=plugin-options.d.ts.map