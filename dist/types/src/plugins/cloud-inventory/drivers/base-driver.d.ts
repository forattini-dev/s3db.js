type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LoggerFunction = (level: LogLevel, message: string, meta?: Record<string, unknown>) => void;
export interface CloudResource {
    provider: string;
    accountId?: string;
    subscriptionId?: string;
    organizationId?: string;
    projectId?: string;
    region?: string | null;
    service?: string;
    resourceType: string;
    resourceId: string;
    name?: string | null;
    tags?: Record<string, string | null> | null;
    labels?: Record<string, string> | null;
    attributes?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    configuration: Record<string, unknown>;
    raw?: unknown;
}
export interface BaseCloudDriverOptions {
    id?: string;
    driver: string;
    credentials?: Record<string, unknown>;
    config?: Record<string, unknown>;
    globals?: Record<string, unknown>;
    logger?: LoggerFunction | null;
}
export interface ListResourcesOptions {
    discovery?: {
        include?: string | string[];
        exclude?: string | string[];
    };
    runtime?: {
        emitProgress?: (info: {
            service: string;
            resourceId: string;
            resourceType: string;
        }) => void;
    };
}
export interface HealthCheckResult {
    ok: boolean;
    details?: unknown;
}
export declare class BaseCloudDriver {
    id: string;
    driver: string;
    credentials: Record<string, unknown>;
    config: Record<string, unknown>;
    globals: Record<string, unknown>;
    logger: LoggerFunction;
    constructor(options?: BaseCloudDriverOptions);
    initialize(): Promise<void>;
    listResources(_options?: ListResourcesOptions): AsyncGenerator<CloudResource>;
    healthCheck(): Promise<HealthCheckResult>;
    destroy(): Promise<void>;
}
export default BaseCloudDriver;
//# sourceMappingURL=base-driver.d.ts.map