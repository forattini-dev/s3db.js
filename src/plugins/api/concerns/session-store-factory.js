/**
 * Session Store Factory
 *
 * Creates session store instances using a driver pattern.
 * Supports built-in drivers (memory, redis, s3db) and custom implementations.
 *
 * @example
 * // Using S3DB driver
 * const store = await createSessionStore({
 *   driver: 's3db',
 *   config: { resourceName: 'oidc_sessions' }
 * }, database);
 *
 * // Using Redis driver
 * const store = await createSessionStore({
 *   driver: 'redis',
 *   config: { url: 'redis://localhost:6379' }
 * });
 *
 * @module api/concerns/session-store-factory
 */

import { MemoryStore } from './session-store.js';
import { ResourceSessionStore } from './resource-session-store.js';

// Export ResourceSessionStore for direct use if needed
export { ResourceSessionStore };

/**
 * Create a session store instance
 *
 * @param {Object} storeConfig - Session store configuration
 * @param {string} storeConfig.driver - Driver name: 's3db', 'redis', 'memory'
 * @param {Object} storeConfig.config - Driver-specific configuration
 * @param {Database} database - s3db.js database instance (required for 's3db' driver)
 * @returns {Promise<SessionStore>} Initialized session store
 * @throws {Error} If driver not found or configuration invalid
 *
 * @example
 * const store = await createSessionStore({
 *   driver: 's3db',
 *   config: { resourceName: 'oidc_sessions' }
 * }, db);
 *
 * @example
 * const store = await createSessionStore({
 *   driver: 'redis',
 *   config: { url: 'redis://redis:6379' }
 * });
 */
export async function createSessionStore(storeConfig, database) {
  if (!storeConfig || !storeConfig.driver) {
    throw new Error('Session store configuration must include a driver');
  }

  const { driver, config = {} } = storeConfig;

  switch (driver) {
    case 's3db':
      return createS3DBSessionStore(config, database);

    case 'redis':
      return createRedisSessionStore(config);

    case 'memory':
      return createMemorySessionStore(config);

    default:
      throw new Error(
        `Unknown session store driver: "${driver}". ` +
        `Supported drivers: s3db, redis, memory`
      );
  }
}

/**
 * Create S3DB resource-backed session store
 *
 * @param {Object} config - Configuration
 * @param {string} config.resourceName - Resource name (default: 'oidc_sessions')
 * @param {boolean} config.verbose - Enable debug logging
 * @param {Database} database - s3db.js database instance
 * @returns {ResourceSessionStore}
 * @throws {Error} If resource not found or database not provided
 */
function createS3DBSessionStore(config, database) {
  if (!database) {
    throw new Error(
      'S3DB session store requires a database instance. ' +
      'Make sure to pass the database as the second argument to createSessionStore().'
    );
  }

  const resourceName = config.resourceName || 'oidc_sessions';

  // Check if resource exists
  if (!database.resources[resourceName]) {
    throw new Error(
      `S3DB session store resource not found: "${resourceName}". ` +
      `Create it first with: ` +
      `await db.createResource({ name: '${resourceName}', attributes: { expiresAt: 'string|required' } })`
    );
  }

  const resource = database.resources[resourceName];

  return new ResourceSessionStore(resource, {
    verbose: config.verbose || false
  });
}

/**
 * Create Redis-backed session store
 *
 * @param {Object} config - Redis configuration
 * @param {Object} config.client - Redis client instance (from 'redis' package)
 * @param {string} config.url - Redis URL (alternative to client)
 * @param {string} config.prefix - Key prefix (default: 'session:')
 * @param {Object} config.serializer - Custom serializer (default: JSON)
 * @param {boolean} config.verbose - Enable debug logging
 * @returns {Promise<RedisStore>}
 * @throws {Error} If redis not installed
 */
async function createRedisSessionStore(config) {
  try {
    // Lazy load RedisStore only if needed
    const { RedisStore } = await import('./session-store.js');

    // Validate that either client or url is provided
    if (!config.client && !config.url) {
      throw new Error(
        'Redis session store requires either "client" (redis instance) or "url" (connection string)'
      );
    }

    // If URL provided, create client from it
    if (config.url && !config.client) {
      try {
        const { createClient } = await import('redis');
        config.client = createClient({ url: config.url });
        await config.client.connect();
      } catch (err) {
        throw new Error(
          `Failed to create Redis client from URL. Is redis package installed? ` +
          `Error: ${err.message}`
        );
      }
    }

    return new RedisStore({
      client: config.client,
      prefix: config.prefix || 'session:',
      serializer: config.serializer || JSON,
      verbose: config.verbose || false
    });
  } catch (err) {
    if (err.message?.includes('not installed')) {
      throw new Error(
        'Redis session store requires "redis" package. ' +
        'Install it with: npm install redis'
      );
    }
    throw err;
  }
}

/**
 * Create in-memory session store
 *
 * @param {Object} config - Configuration
 * @param {number} config.maxSessions - Maximum sessions before LRU eviction (default: 10000)
 * @param {boolean} config.verbose - Enable debug logging
 * @returns {MemoryStore}
 */
function createMemorySessionStore(config) {
  return new MemoryStore({
    maxSessions: config.maxSessions || 10000,
    verbose: config.verbose || false
  });
}
