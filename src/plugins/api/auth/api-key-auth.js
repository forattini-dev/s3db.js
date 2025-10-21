/**
 * API Key Authentication - Simple API key authentication middleware
 *
 * Provides authentication using static API keys in headers
 */

import { unauthorized } from '../utils/response-formatter.js';

/**
 * Generate random API key
 * @param {number} length - Key length (default: 32)
 * @returns {string} Random API key
 */
export function generateApiKey(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let apiKey = '';

  for (let i = 0; i < length; i++) {
    apiKey += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return apiKey;
}

/**
 * Create API Key authentication middleware
 * @param {Object} options - API Key options
 * @param {string} options.headerName - Header name for API key (default: 'X-API-Key')
 * @param {Object} options.usersResource - Users resource for key validation
 * @param {boolean} options.optional - If true, allows requests without auth
 * @returns {Function} Hono middleware
 */
export function apiKeyAuth(options = {}) {
  const {
    headerName = 'X-API-Key',
    usersResource,
    optional = false
  } = options;

  if (!usersResource) {
    throw new Error('usersResource is required for API key authentication');
  }

  return async (c, next) => {
    const apiKey = c.req.header(headerName);

    if (!apiKey) {
      if (optional) {
        return await next();
      }

      const response = unauthorized(`Missing ${headerName} header`);
      return c.json(response, response._status);
    }

    // Query users by API key
    try {
      const users = await usersResource.query({ apiKey });

      if (!users || users.length === 0) {
        const response = unauthorized('Invalid API key');
        return c.json(response, response._status);
      }

      const user = users[0];

      if (!user.active) {
        const response = unauthorized('User account is inactive');
        return c.json(response, response._status);
      }

      // Store user in context
      c.set('user', user);
      c.set('authMethod', 'apiKey');

      await next();
    } catch (err) {
      console.error('[API Key Auth] Error validating key:', err);
      const response = unauthorized('Authentication error');
      return c.json(response, response._status);
    }
  };
}

export default {
  generateApiKey,
  apiKeyAuth
};
