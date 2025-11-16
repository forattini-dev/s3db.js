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
import { jwtAuth } from '../jwt-auth.js';
import { apiKeyAuth } from '../api-key-auth.js';
import { basicAuth } from '../basic-auth.js';
import { createOAuth2Handler } from '../oauth2-auth.js';

export class PathRulesAuthStrategy extends BaseAuthStrategy {
  constructor({ drivers, authResource, oidcMiddleware, pathRules, events, verbose }) {
    super({ drivers, authResource, oidcMiddleware, verbose });
    this.pathRules = pathRules;
    this.events = events;
  }

  createMiddleware() {
    // Build auth middlewares map by driver type
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
        authMiddlewares.jwt = jwtAuth({
          secret: driverConfig.jwtSecret || driverConfig.secret,
          expiresIn: driverConfig.jwtExpiresIn || driverConfig.expiresIn || '7d',
          usersResource: this.authResource,
          optional: true
        });
      }

      // API Key
      if (driverType === 'apiKey') {
        authMiddlewares.apiKey = apiKeyAuth({
          headerName: driverConfig.headerName || 'X-API-Key',
          usersResource: this.authResource,
          optional: true
        });
      }

      // Basic Auth
      if (driverType === 'basic') {
        authMiddlewares.basic = basicAuth({
          authResource: this.authResource,
          usernameField: driverConfig.usernameField || 'email',
          passwordField: driverConfig.passwordField || 'password',
          passphrase: driverConfig.passphrase || 'secret',
          adminUser: driverConfig.adminUser || null,
          // Pass-through cookie fallback options if provided
          cookieName: driverConfig.cookieName || null,
          tokenField: driverConfig.tokenField || 'apiToken',
          optional: true
        });
      }

      // OAuth2
      if (driverType === 'oauth2') {
        const oauth2Handler = createOAuth2Handler(driverConfig, this.authResource);
        authMiddlewares.oauth2 = async (c, next) => {
          const user = await oauth2Handler(c);
          if (user) {
            c.set('user', user);
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
