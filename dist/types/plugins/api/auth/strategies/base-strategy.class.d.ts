import type { MiddlewareHandler } from 'hono';
import type { Logger } from '../../../../concerns/logger.js';
import type { ResourceLike, DatabaseLike } from '../resource-manager.js';
export interface DriverDefinition {
    driver: string;
    type?: string;
    config?: Record<string, unknown>;
}
export interface DriverConfigs {
    jwt: Record<string, unknown>;
    apiKey: Record<string, unknown>;
    basic: Record<string, unknown>;
    oauth2: Record<string, unknown>;
}
export interface BaseAuthStrategyOptions {
    drivers: DriverDefinition[];
    authResource?: ResourceLike;
    oidcMiddleware?: MiddlewareHandler | null;
    database: DatabaseLike;
    logLevel?: string;
    logger?: Logger;
}
export declare class BaseAuthStrategy {
    protected drivers: DriverDefinition[];
    protected authResource: ResourceLike | undefined;
    protected oidcMiddleware: MiddlewareHandler | null | undefined;
    protected database: DatabaseLike;
    protected logger: Logger;
    constructor({ drivers, authResource, oidcMiddleware, database, logLevel, logger }: BaseAuthStrategyOptions);
    protected extractDriverConfigs(driverNames: string[] | null): DriverConfigs;
    createMiddleware(): Promise<MiddlewareHandler>;
}
//# sourceMappingURL=base-strategy.class.d.ts.map