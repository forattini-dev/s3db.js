import type { Context } from 'hono';
export interface LoggingOptions {
    enabled?: boolean;
    format?: string;
    logLevel?: string;
    colorize?: boolean;
    filter?: ((c: Context) => boolean) | null;
    excludePaths?: string | string[];
}
export interface NormalizedLoggingConfig {
    enabled: boolean;
    format: string;
    logLevel: string;
    colorize: boolean;
    filter: ((c: Context) => boolean) | null;
    excludePaths: string[];
}
export declare function normalizeLoggingConfig(loggingOptions: boolean | LoggingOptions | null | undefined): NormalizedLoggingConfig;
//# sourceMappingURL=normalize-logging.d.ts.map