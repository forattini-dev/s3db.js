import type { MiddlewareHandler } from '#src/plugins/shared/http-runtime.js';
import type { Logger } from '../../../../concerns/logger.js';
import type { ResourceLike, DatabaseLike } from '../resource-manager.js';
import type { DriverDefinition, BaseAuthStrategy } from './base-strategy.class.js';
import type { AuthRule } from '../path-rules-middleware.js';
import { GlobalAuthStrategy } from './global-strategy.class.js';
import { PathRulesAuthStrategy } from './path-rules-strategy.class.js';

export interface AuthStrategyFactoryConfig {
  drivers: DriverDefinition[];
  authResource?: ResourceLike;
  oidcMiddleware?: MiddlewareHandler | null;
  database: DatabaseLike;
  pathRules?: AuthRule[];
  events?: {
    emitAuthEvent: (event: string, data: Record<string, unknown>) => void;
  } | null;
  logLevel?: string;
  logger?: Logger;
}

export class AuthStrategyFactory {
  static create({
    drivers,
    authResource,
    oidcMiddleware,
    database,
    pathRules,
    events,
    logLevel,
    logger
  }: AuthStrategyFactoryConfig): BaseAuthStrategy {
    if (pathRules && pathRules.length > 0) {
      return new PathRulesAuthStrategy({
        drivers,
        authResource,
        oidcMiddleware,
        database,
        pathRules,
        events,
        logLevel,
        logger
      });
    }

    return new GlobalAuthStrategy({
      drivers,
      authResource,
      oidcMiddleware,
      database,
      logLevel,
      logger
    });
  }
}
