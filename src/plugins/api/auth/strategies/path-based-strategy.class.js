/**
 * PathBasedAuthStrategy - Path-based authentication using pathAuth config
 *
 * Legacy path-based auth system (before pathRules was introduced)
 * Matches request path against pathAuth patterns
 */

import { BaseAuthStrategy } from './base-strategy.class.js';
import { createAuthMiddleware } from '../index.js';
import { findBestMatch } from '../../utils/path-matcher.js';

export class PathBasedAuthStrategy extends BaseAuthStrategy {
  constructor({ drivers, authResource, oidcMiddleware, pathAuth, verbose }) {
    super({ drivers, authResource, oidcMiddleware, verbose });
    this.pathAuth = pathAuth;
  }

  createMiddleware() {
    if (this.verbose) {
      console.log('[PathBasedAuthStrategy] Using legacy pathAuth system');
    }

    return async (c, next) => {
      const requestPath = c.req.path;

      // Find best matching rule
      const matchedRule = findBestMatch(this.pathAuth, requestPath);

      if (this.verbose) {
        if (matchedRule) {
          console.log(`[PathBasedAuthStrategy] Path ${requestPath} matched rule: ${matchedRule.pattern}`);
        } else {
          console.log(`[PathBasedAuthStrategy] Path ${requestPath} no pathAuth rule matched (using global auth)`);
        }
      }

      // No rule matched - use global auth (all drivers, optional)
      if (!matchedRule) {
        const methods = this.drivers
          .map(d => d.driver)
          .filter(d => d !== 'oauth2-server' && d !== 'oidc');

        const driverConfigs = this.extractDriverConfigs(null);

        const globalAuth = createAuthMiddleware({
          methods,
          jwt: driverConfigs.jwt,
          apiKey: driverConfigs.apiKey,
          basic: driverConfigs.basic,
          oauth2: driverConfigs.oauth2,
          oidc: this.oidcMiddleware || null,
          usersResource: this.authResource,
          optional: true
        });

        return await globalAuth(c, next);
      }

      // Rule matched - check if auth is required
      if (!matchedRule.required) {
        // Public path - no auth required
        return await next();
      }

      // Auth required - apply with specific drivers from rule
      const ruleMethods = matchedRule.drivers || [];
      const driverConfigs = this.extractDriverConfigs(ruleMethods);

      const ruleAuth = createAuthMiddleware({
        methods: ruleMethods,
        jwt: driverConfigs.jwt,
        apiKey: driverConfigs.apiKey,
        basic: driverConfigs.basic,
        oauth2: driverConfigs.oauth2,
        oidc: this.oidcMiddleware || null,
        usersResource: this.authResource,
        optional: false  // Auth is required
      });

      return await ruleAuth(c, next);
    };
  }
}
