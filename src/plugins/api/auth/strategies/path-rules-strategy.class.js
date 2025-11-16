/**
 * PathRulesAuthStrategy - Modern path-based auth using pathRules
 *
 * New path-based auth system with cleaner API:
 * - pathRules: [{ path: '/admin/**', methods: ['oidc'], required: true }]
 *
 * More flexible than pathAuth and easier to configure
 */

import { BaseAuthStrategy } from './base-strategy.class.js';
import { createPathBasedAuthMiddleware } from '../path-auth-matcher.js';
import { createJWTHandler } from '../jwt-auth.js';
import { createApiKeyHandler } from '../api-key-auth.js';
import { createBasicAuthHandler } from '../basic-auth.js';
import { createOAuth2Handler } from '../oauth2-auth.js';

export class PathRulesAuthStrategy extends BaseAuthStrategy {
  constructor({ drivers, authResource, oidcMiddleware, database, pathRules, events, verbose }) {
    super({ drivers, authResource, oidcMiddleware, database, verbose });
    this.pathRules = pathRules;
    this.events = events;
  }

  async createMiddleware() {
    // Build auth middlewares map by driver type (async)
    const authMiddlewares = {};

    for (const driverDef of this.drivers) {
      const driverType = driverDef.type || driverDef.driver;
      const driverConfig = driverDef.config || driverDef;

      // Skip oauth2-server
      if (driverType === 'oauth2-server') {
        continue;
      }

      // OIDC
      if (driverType === 'oidc') {
        if (this.oidcMiddleware) {
          authMiddlewares.oidc = this.oidcMiddleware;
        }
        continue;
      }

      // JWT
      if (driverType === 'jwt') {
        authMiddlewares.jwt = await createJWTHandler(driverConfig, this.database);
      }

      // API Key
      if (driverType === 'apiKey') {
        authMiddlewares.apiKey = await createApiKeyHandler(driverConfig, this.database);
      }

      // Basic Auth
      if (driverType === 'basic') {
        authMiddlewares.basic = await createBasicAuthHandler(driverConfig, this.database);
      }

      // OAuth2
      if (driverType === 'oauth2') {
        const oauth2Handler = await createOAuth2Handler(driverConfig, this.database);
        authMiddlewares.oauth2 = async (c, next) => {
          const user = await oauth2Handler(c);
          if (user) {
            c.set('user', user);
            c.set('authMethod', 'oauth2');
            return await next();
          }
        };
      }
    }

    // 🪵 Debug: path-based auth configuration
    const availableMethods = Object.keys(authMiddlewares);
    this.logger.debug({ ruleCount: this.pathRules.length, methods: availableMethods }, `Path-based auth with ${this.pathRules.length} rules, methods: ${availableMethods.join(', ')}`);

    // Create and return path-based auth middleware
    return createPathBasedAuthMiddleware({
      rules: this.pathRules,
      authMiddlewares,
      unauthorizedHandler: (c, message) => {
        // Content negotiation
        const acceptHeader = c.req.header('accept') || '';
        const acceptsHtml = acceptHeader.includes('text/html');

        if (acceptsHtml) {
          // Redirect to login if OIDC is available
          if (authMiddlewares.oidc) {
            return c.redirect('/auth/login', 302);
          }
        }

        return c.json({
          error: 'Unauthorized',
          message
        }, 401);
      },
      events: this.events
    });
  }
}
