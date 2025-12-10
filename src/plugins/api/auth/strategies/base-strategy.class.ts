import type { Context, Next, MiddlewareHandler } from 'hono';
import type { Logger, LogLevel } from '../../../../concerns/logger.js';
import type { ResourceLike, DatabaseLike } from '../resource-manager.js';
import { createLogger } from '../../../../concerns/logger.js';

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

export class BaseAuthStrategy {
  protected drivers: DriverDefinition[];
  protected authResource: ResourceLike | undefined;
  protected oidcMiddleware: MiddlewareHandler | null | undefined;
  protected database: DatabaseLike;
  protected logger: Logger;

  constructor({ drivers, authResource, oidcMiddleware, database, logLevel = 'info', logger }: BaseAuthStrategyOptions) {
    this.drivers = drivers || [];
    this.authResource = authResource;
    this.oidcMiddleware = oidcMiddleware;
    this.database = database;

    if (logger) {
      this.logger = logger;
    } else {
      this.logger = createLogger({ name: 'AuthStrategy', level: logLevel as LogLevel });
    }
  }

  protected extractDriverConfigs(driverNames: string[] | null): DriverConfigs {
    const configs: DriverConfigs = {
      jwt: {},
      apiKey: {},
      basic: {},
      oauth2: {}
    };

    for (const driverDef of this.drivers) {
      const driverName = driverDef.driver;
      const driverConfig = driverDef.config || {};

      if (driverNames && !driverNames.includes(driverName)) {
        continue;
      }

      if (driverName === 'oauth2-server' || driverName === 'oidc') {
        continue;
      }

      if (driverName === 'jwt') {
        configs.jwt = driverConfig;
      } else if (driverName === 'apiKey') {
        configs.apiKey = driverConfig;
      } else if (driverName === 'basic') {
        configs.basic = driverConfig;
      } else if (driverName === 'oauth2') {
        configs.oauth2 = driverConfig;
      }
    }

    return configs;
  }

  async createMiddleware(): Promise<MiddlewareHandler> {
    throw new Error('createMiddleware() must be implemented by subclass');
  }
}
