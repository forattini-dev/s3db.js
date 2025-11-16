/**
 * Authentication Factory - Create authentication middleware based on configuration
 *
 * Provides unified interface for multiple authentication methods
 */

import { createJWTHandler, createToken, verifyToken } from './jwt-auth.js';
import { createApiKeyHandler, generateApiKey } from './api-key-auth.js';
import { createBasicAuthHandler } from './basic-auth.js';
import { createOAuth2Handler } from './oauth2-auth.js';
import { OIDCClient } from './oidc-client.js';
import { unauthorized } from '../utils/response-formatter.js';

/**
 * Create authentication middleware that supports multiple auth methods
 * @param {Object} options - Authentication options
 * @param {Array<string>} options.methods - Allowed auth methods (['jwt', 'apiKey', 'basic', 'oauth2'])
 * @param {Object} options.jwt - JWT configuration
 * @param {Object} options.apiKey - API Key configuration
 * @param {Object} options.basic - Basic Auth configuration
 * @param {Object} options.oauth2 - OAuth2 configuration
 * @param {Function} options.oidc - OIDC middleware (already configured)
 * @param {Object} options.database - Database instance (required for new driver APIs)
 * @param {boolean} options.optional - If true, allows requests without auth
 * @param {string} options.strategy - Auth strategy: 'any' (default, OR logic) or 'priority' (waterfall with explicit order)
 * @param {Object} options.priorities - Priority map for 'priority' strategy { jwt: 1, oidc: 2, basic: 3 }
 * @returns {Promise<Function>} Hono middleware
 */
export async function createAuthMiddleware(options = {}) {
  const {
    methods = [],
    jwt: jwtConfig = {},
    apiKey: apiKeyConfig = {},
    basic: basicConfig = {},
    oauth2: oauth2Config = {},
    oidc: oidcMiddleware = null,
    database,
    optional = false,
    strategy = 'any',
    priorities = {}
  } = options;

  if (!database) {
    throw new Error('createAuthMiddleware: database parameter is required');
  }

  // If no methods specified, allow all requests
  if (methods.length === 0) {
    return async (c, next) => await next();
  }

  // Create individual auth middlewares (async)
  const middlewares = [];

  if (methods.includes('jwt') && jwtConfig.secret) {
    const jwtHandler = await createJWTHandler(jwtConfig, database);
    middlewares.push({
      name: 'jwt',
      middleware: jwtHandler
    });
  }

  if (methods.includes('apiKey')) {
    const apiKeyHandler = await createApiKeyHandler(apiKeyConfig, database);
    middlewares.push({
      name: 'apiKey',
      middleware: apiKeyHandler
    });
  }

  if (methods.includes('basic')) {
    const basicHandler = await createBasicAuthHandler(basicConfig, database);
    middlewares.push({
      name: 'basic',
      middleware: basicHandler
    });
  }

  if (methods.includes('oauth2') && oauth2Config.issuer) {
    const oauth2Handler = await createOAuth2Handler(oauth2Config, database);
    middlewares.push({
      name: 'oauth2',
      middleware: async (c, next) => {
        const user = await oauth2Handler(c);
        if (user) {
          c.set('user', user);
          c.set('authMethod', 'oauth2');
          return await next();
        }
        // No user, try next method
      }
    });
  }

  // OIDC middleware (session-based authentication)
  if (oidcMiddleware) {
    middlewares.push({
      name: 'oidc',
      middleware: oidcMiddleware
    });
  }

  // Sort middlewares by priority if strategy is 'priority'
  if (strategy === 'priority' && Object.keys(priorities).length > 0) {
    middlewares.sort((a, b) => {
      const priorityA = priorities[a.name] || 999; // Unspecified = lowest priority
      const priorityB = priorities[b.name] || 999;
      return priorityA - priorityB; // Lower number = higher priority
    });
  }

  // Return combined middleware
  return async (c, next) => {
    // Try each auth method
    for (const { name, middleware } of middlewares) {
      // Create a temporary next that captures success
      let authSuccess = false;
      const tempNext = async () => {
        authSuccess = true;
      };

      // Try auth method
      const result = await middleware(c, tempNext);

      // ✨ If middleware returned a response (redirect, JSON, etc), return it immediately
      if (result !== undefined && result !== null) {
        return result;
      }

      // If auth succeeded, continue
      if (authSuccess && c.get('user')) {
        return await next();
      }
    }

    // No auth method succeeded
    if (optional) {
      return await next();
    }

    // Require authentication
    const response = unauthorized(
      `Authentication required. Supported methods: ${methods.join(', ')}`
    );
    return c.json(response, response._status);
  };
}

export { OIDCClient, createToken, verifyToken, generateApiKey };

export default {
  createAuthMiddleware,
  createJWTHandler,
  createApiKeyHandler,
  createBasicAuthHandler,
  createOAuth2Handler,
  createToken,
  verifyToken,
  generateApiKey,
  OIDCClient
};
