/**
 * Authentication Factory - Create authentication middleware based on configuration
 *
 * Provides unified interface for multiple authentication methods
 */

import { jwtAuth } from './jwt-auth.js';
import { apiKeyAuth } from './api-key-auth.js';
import { basicAuth } from './basic-auth.js';
import { unauthorized } from '../utils/response-formatter.js';

/**
 * Create authentication middleware that supports multiple auth methods
 * @param {Object} options - Authentication options
 * @param {Array<string>} options.methods - Allowed auth methods (['jwt', 'apiKey', 'basic'])
 * @param {Object} options.jwt - JWT configuration
 * @param {Object} options.apiKey - API Key configuration
 * @param {Object} options.basic - Basic Auth configuration
 * @param {Object} options.usersResource - Users resource
 * @param {boolean} options.optional - If true, allows requests without auth
 * @returns {Function} Hono middleware
 */
export function createAuthMiddleware(options = {}) {
  const {
    methods = [],
    jwt: jwtConfig = {},
    apiKey: apiKeyConfig = {},
    basic: basicConfig = {},
    usersResource,
    optional = false
  } = options;

  // If no methods specified, allow all requests
  if (methods.length === 0) {
    return async (c, next) => await next();
  }

  // Create individual auth middlewares
  const middlewares = [];

  if (methods.includes('jwt') && jwtConfig.secret) {
    middlewares.push({
      name: 'jwt',
      middleware: jwtAuth({
        secret: jwtConfig.secret,
        usersResource,
        optional: true // Check all methods before rejecting
      })
    });
  }

  if (methods.includes('apiKey') && usersResource) {
    middlewares.push({
      name: 'apiKey',
      middleware: apiKeyAuth({
        headerName: apiKeyConfig.headerName || 'X-API-Key',
        usersResource,
        optional: true // Check all methods before rejecting
      })
    });
  }

  if (methods.includes('basic') && usersResource) {
    middlewares.push({
      name: 'basic',
      middleware: basicAuth({
        realm: basicConfig.realm || 'API Access',
        usersResource,
        passphrase: basicConfig.passphrase || 'secret',
        optional: true // Check all methods before rejecting
      })
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
      await middleware(c, tempNext);

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

export default {
  createAuthMiddleware,
  jwtAuth,
  apiKeyAuth,
  basicAuth
};
