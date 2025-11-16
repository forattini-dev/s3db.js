/**
 * AuthStrategyFactory - Creates appropriate auth strategy based on config
 *
 * Strategy selection priority:
 * 1. PathRulesStrategy - if pathRules is defined (modern, recommended)
 * 2. PathBasedStrategy - if pathAuth is defined (legacy)
 * 3. GlobalAuthStrategy - default (all drivers, optional auth)
 *
 * @example
 * const strategy = AuthStrategyFactory.create(config);
 * const middleware = strategy.createMiddleware();
 */

import { GlobalAuthStrategy } from './global-strategy.class.js';
import { PathBasedAuthStrategy } from './path-based-strategy.class.js';
import { PathRulesAuthStrategy } from './path-rules-strategy.class.js';

export class AuthStrategyFactory {
  /**
   * Create appropriate auth strategy based on config
   * @param {Object} config - Auth configuration
   * @param {Array} config.drivers - Auth driver configurations
   * @param {Object} config.authResource - Users resource for authentication
   * @param {Function} config.oidcMiddleware - OIDC middleware (if configured)
   * @param {Object} config.database - Database instance (required)
   * @param {Array} [config.pathRules] - Modern path rules (priority 1)
   * @param {Object} [config.pathAuth] - Legacy path auth config (priority 2)
   * @param {Object} [config.events] - Event emitter
   * @param {string} [config.logLevel] - Log level (default: 'info')
   * @param {Object} [config.logger] - Custom logger instance
   * @returns {BaseAuthStrategy} Auth strategy instance
   */
  static create({ drivers, authResource, oidcMiddleware, database, pathRules, pathAuth, events, logLevel, logger }) {
    // Priority 1: PathRules (modern API)
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

    // Priority 2: PathAuth (legacy)
    if (pathAuth) {
      return new PathBasedAuthStrategy({
        drivers,
        authResource,
        oidcMiddleware,
        database,
        pathAuth,
        logLevel,
        logger
      });
    }

    // Priority 3: Global (default)
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
