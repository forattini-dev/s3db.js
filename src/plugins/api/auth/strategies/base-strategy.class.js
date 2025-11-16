/**
 * BaseAuthStrategy - Abstract base for auth strategies
 *
 * All auth strategies extend this class and implement createMiddleware()
 */

import { createLogger } from '../../../../concerns/logger.js';

export class BaseAuthStrategy {
  constructor({ drivers, authResource, oidcMiddleware, database, logLevel = 'info', logger }) {
    this.drivers = drivers || [];
    this.authResource = authResource;
    this.oidcMiddleware = oidcMiddleware;
    this.database = database;

    // 🪵 Logger initialization
    if (logger) {
      this.logger = logger;
    } else {
      this.logger = createLogger({ name: 'AuthStrategy', level: logLevel });
    }
  }

  /**
   * Extract driver configs from drivers array
   * @param {Array<string>} driverNames - Names of drivers to extract
   * @returns {Object} Driver configs
   * @protected
   */
  extractDriverConfigs(driverNames) {
    const configs = {
      jwt: {},
      apiKey: {},
      basic: {},
      oauth2: {}
    };

    for (const driverDef of this.drivers) {
      const driverName = driverDef.driver;
      const driverConfig = driverDef.config || {};

      // Skip if not in requested drivers
      if (driverNames && !driverNames.includes(driverName)) {
        continue;
      }

      // Skip oauth2-server and oidc drivers (handled separately)
      if (driverName === 'oauth2-server' || driverName === 'oidc') {
        continue;
      }

      // Map driver configs
      if (driverName === 'jwt') {
        configs.jwt = {
          secret: driverConfig.jwtSecret || driverConfig.secret,
          expiresIn: driverConfig.jwtExpiresIn || driverConfig.expiresIn || '7d'
        };
      } else if (driverName === 'apiKey') {
        configs.apiKey = {
          headerName: driverConfig.headerName || 'X-API-Key'
        };
      } else if (driverName === 'basic') {
        configs.basic = {
          realm: driverConfig.realm || 'API Access',
          passphrase: driverConfig.passphrase || 'secret',
          usernameField: driverConfig.usernameField || 'email',
          passwordField: driverConfig.passwordField || 'password'
        };
      } else if (driverName === 'jwt') {
        configs.jwt = {
          secret: driverConfig.jwtSecret || driverConfig.secret,
          expiresIn: driverConfig.jwtExpiresIn || driverConfig.expiresIn || '7d',
          usernameField: driverConfig.usernameField || 'userId',
          passwordField: driverConfig.passwordField || 'apiToken'
        };
      } else if (driverName === 'oauth2') {
        configs.oauth2 = driverConfig;
      }
    }

    return configs;
  }

  /**
   * Create auth middleware (must be implemented by subclasses)
   * @abstract
   * @returns {Promise<Function>} Hono middleware
   */
  async createMiddleware() {
    throw new Error('createMiddleware() must be implemented by subclass');
  }
}
