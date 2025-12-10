import type { MiddlewareHandler } from 'hono';
import type { Logger } from '../../../../concerns/logger.js';
import type { ResourceLike, DatabaseLike } from '../resource-manager.js';
import type { DriverDefinition, BaseAuthStrategy } from './base-strategy.class.js';
import type { AuthRule } from '../path-auth-matcher.js';
import type { PathAuthRule } from './path-based-strategy.class.js';
export interface AuthStrategyFactoryConfig {
    drivers: DriverDefinition[];
    authResource?: ResourceLike;
    oidcMiddleware?: MiddlewareHandler | null;
    database: DatabaseLike;
    pathRules?: AuthRule[];
    pathAuth?: PathAuthRule[];
    events?: {
        emitAuthEvent: (event: string, data: Record<string, unknown>) => void;
    } | null;
    logLevel?: string;
    logger?: Logger;
}
export declare class AuthStrategyFactory {
    static create({ drivers, authResource, oidcMiddleware, database, pathRules, pathAuth, events, logLevel, logger }: AuthStrategyFactoryConfig): BaseAuthStrategy;
}
//# sourceMappingURL=factory.class.d.ts.map