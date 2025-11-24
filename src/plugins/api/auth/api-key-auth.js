/**
 * API Key Authentication - Simple API key authentication middleware
 *
 * Provides authentication using static API keys in headers or query params.
 *
 * Config options:
 * - resource: Resource name (default: 'plg_api_apikey_users')
 * - createResource: Auto-create resource (default: true)
 * - keyField: Field containing API key (default: 'apiKey')
 * - partitionName: Partition name for O(1) lookups (default: auto-detect from keyField)
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
 *     partitionName: 'byApiKey',  // Optional: explicit partition name
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
    partitionName = null,  // Optional: explicit partition name
    optional = false
  } = config;

  if (!database) {
    throw new Error('API Key driver: database is required');
  }

  // Get or create resource
  const manager = new APIKeyResourceManager(database, 'apikey', config);
  const authResource = await manager.getOrCreateResource();

  const resolvedPartitionName = partitionName || `by${keyField.charAt(0).toUpperCase()}${keyField.slice(1)}`;
  logger.debug(`API Key driver initialized: resource=${authResource.name}, keyField=${keyField}, partition=${resolvedPartitionName}`);

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
      let users;

      // Determine partition name: explicit config or auto-detect
      const resolvedPartitionName = partitionName || `by${keyField.charAt(0).toUpperCase()}${keyField.slice(1)}`;
      const hasPartition = authResource.partitions && authResource.partitions[resolvedPartitionName];

      if (hasPartition) {
        logger.debug(`Using partition ${resolvedPartitionName} for O(1) API key lookup`);
        users = await authResource.listPartition(resolvedPartitionName, { [keyField]: apiKey }, { limit: 1 });
      } else {
        logger.debug(`No partition found (${resolvedPartitionName}), falling back to query (O(n) scan)`);
        users = await authResource.query({ [keyField]: apiKey }, { limit: 1 });
      }

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
