/**
 * API Key Authentication - Simple API key authentication middleware
 *
 * Provides authentication using static API keys in headers or query params.
 *
 * Config options:
 * - resource: Resource name (default: 'plg_api_apikey_users')
 * - createResource: Auto-create resource (default: true)
 * - keyField: Field containing API key (default: 'apiKey')
 * - headerName: Header name (default: 'X-API-Key')
 * - queryParam: Query param name (optional, e.g., 'api_key')
 * - optional: Allow requests without auth (default: false)
 *
 * @example
 * {
 *   driver: 'apiKey',
 *   config: {
 *     resource: 'api_clients',
 *     keyField: 'apiKey',
 *     headerName: 'X-API-Key',
 *     queryParam: 'api_key'
 *   }
 * }
 */

import { unauthorized } from '../utils/response-formatter.js';
import { createLogger } from '../../../concerns/logger.js';
import { APIKeyResourceManager } from './resource-manager.js';

// Module-level logger
const logger = createLogger({ name: 'ApiKeyAuth', level: 'info' });

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
 * @param {Object} config - API Key configuration
 * @param {Database} database - s3db.js database instance
 * @returns {Promise<Function>} Hono middleware
 */
export async function createApiKeyHandler(config = {}, database) {
  const {
    headerName = 'X-API-Key',
    queryParam = null,
    keyField = 'apiKey',
    optional = false
  } = config;

  if (!database) {
    throw new Error('API Key driver: database is required');
  }

  // Get or create resource
  const manager = new APIKeyResourceManager(database, 'apikey', config);
  const authResource = await manager.getOrCreateResource();

  logger.debug(`API Key driver initialized with resource: ${authResource.name}, keyField: ${keyField}`);

  return async (c, next) => {
    // Try header first
    let apiKey = c.req.header(headerName);

    // Fallback to query param if configured
    if (!apiKey && queryParam) {
      apiKey = c.req.query(queryParam);
    }

    if (!apiKey) {
      if (optional) {
        return await next();
      }

      const response = unauthorized(
        queryParam
          ? `Missing ${headerName} header or ${queryParam} query parameter`
          : `Missing ${headerName} header`
      );
      return c.json(response, response._status);
    }

    // Query users by API key (using configured keyField)
    try {
      const users = await authResource.query({ [keyField]: apiKey }, { limit: 1 });

      if (!users || users.length === 0) {
        const response = unauthorized('Invalid API key');
        return c.json(response, response._status);
      }

      const user = users[0];

      if (user.active === false) {
        const response = unauthorized('User account is inactive');
        return c.json(response, response._status);
      }

      // Update lastUsedAt (non-blocking)
      if (authResource.schema.attributes.lastUsedAt) {
        authResource.patch(user.id, { lastUsedAt: new Date().toISOString() }).catch(() => {});
      }

      // Store user in context
      c.set('user', user);
      c.set('authMethod', 'apiKey');

      await next();
    } catch (err) {
      logger.error({ error: err.message }, 'Error validating API key');
      const response = unauthorized('Authentication error');
      return c.json(response, response._status);
    }
  };
}

export default {
  generateApiKey,
  createApiKeyHandler
};
