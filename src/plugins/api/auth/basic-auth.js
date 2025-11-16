/**
 * Basic Authentication - HTTP Basic Auth middleware
 *
 * Provides authentication using username:password in Authorization header.
 * Optionally supports a cookie token fallback (e.g., 'api_token' → users.apiToken).
 *
 * Config options:
 * - resource: Resource name (default: 'plg_api_basic_users')
 * - createResource: Auto-create resource (default: true)
 * - usernameField: Field for username (default: 'email')
 * - passwordField: Field for password (default: 'password')
 * - realm: WWW-Authenticate realm (default: 'API Access')
 * - passphrase: Encryption passphrase (default: 'secret')
 * - optional: Allow requests without auth (default: false)
 * - adminUser: Admin bypass config (optional)
 * - cookieName: Cookie fallback name (optional)
 * - tokenField: Cookie token field (default: 'apiToken')
 *
 * @example
 * {
 *   driver: 'basic',
 *   config: {
 *     resource: 'admin_users',
 *     usernameField: 'email',
 *     passwordField: 'password',
 *     realm: 'Admin Area'
 *   }
 * }
 */

import { unauthorized } from '../utils/response-formatter.js';
import { createLogger } from '../../../concerns/logger.js';
import { decrypt } from '../../../concerns/crypto.js';
import tryFn from '../../../concerns/try-fn.js';
import { getCookie } from 'hono/cookie';
import { BasicAuthResourceManager } from './resource-manager.js';

// Module-level logger
const logger = createLogger({ name: 'BasicAuth', level: 'info' });
export function parseBasicAuth(authHeader) {
  if (!authHeader) return null;
  const match = authHeader.match(/^Basic\s+(.+)$/i);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
    const [username, ...passwordParts] = decoded.split(':');
    const password = passwordParts.join(':');
    if (!username || !password) return null;
    return { username, password };
  } catch (err) {
    return null;
  }
}

async function verifyPassword(inputPassword, storedPassword, passphrase) {
  try {
    const [ok, err, decrypted] = await tryFn(() => decrypt(storedPassword, passphrase));
    if (!ok) return false;
    return decrypted === inputPassword;
  } catch (err) {
    return false;
  }
}

/**
 * Create Basic Auth handler (NEW API)
 * @param {Object} config - Basic auth configuration
 * @param {Database} database - s3db.js database instance
 * @returns {Promise<Function>} Hono middleware
 */
export async function createBasicAuthHandler(config = {}, database) {
  const {
    realm = 'API Access',
    usernameField = 'email',
    passwordField = 'password',
    passphrase = 'secret',
    optional = false,
    adminUser = null,
    cookieName = null,
    tokenField = 'apiToken'
  } = config;

  if (!database) {
    throw new Error('Basic Auth driver: database is required');
  }

  // Get or create resource
  const manager = new BasicAuthResourceManager(database, 'basic', config);
  const authResource = await manager.getOrCreateResource();

  logger.debug(`Basic Auth driver initialized with resource: ${authResource.name}, usernameField: ${usernameField}`);

  return async (c, next) => {
    const authHeader = c.req.header('authorization');

    // Fallback: cookie token (e.g., api_token → users.apiToken)
    if (!authHeader && cookieName) {
      try {
        const token = getCookie(c, cookieName);
        if (token) {
          const users = await authResource.query({ [tokenField]: token }, { limit: 1 });
          if (users && users.length > 0) {
            const user = users[0];
            if (user.active === false) {
              const response = unauthorized('User account is inactive');
              return c.json(response, response._status);
            }
            c.set('user', user);
            c.set('authMethod', 'basic-cookie');
            return await next();
          }
        }
      } catch (_) { /* ignore */ }
    }

    if (!authHeader) {
      if (optional) return await next();
      c.header('WWW-Authenticate', `Basic realm="${realm}"`);
      const response = unauthorized('Basic authentication required');
      return c.json(response, response._status);
    }

    const credentials = parseBasicAuth(authHeader);
    if (!credentials) {
      c.header('WWW-Authenticate', `Basic realm="${realm}"`);
      const response = unauthorized('Invalid Basic authentication format');
      return c.json(response, response._status);
    }

    const { username, password } = credentials;

    // Admin bypass
    if (adminUser && adminUser.enabled === true) {
      if (username === adminUser.username && password === adminUser.password) {
        c.set('user', {
          id: 'root',
          username: adminUser.username,
          email: adminUser.username,
          scopes: adminUser.scopes || ['admin'],
          authMethod: 'basic-admin'
        });
        c.set('authMethod', 'basic');
        return await next();
      }
    }

    try {
      const users = await authResource.query({ [usernameField]: username }, { limit: 1 });
      if (!users || users.length === 0) {
        c.header('WWW-Authenticate', `Basic realm="${realm}"`);
        const response = unauthorized('Invalid credentials');
        return c.json(response, response._status);
      }

      const user = users[0];

      // Verify password
      const storedPassword = user[passwordField];
      if (!storedPassword) {
        c.header('WWW-Authenticate', `Basic realm="${realm}"`);
        const response = unauthorized('Invalid credentials');
        return c.json(response, response._status);
      }

      const isValid = await verifyPassword(password, storedPassword, passphrase);
      if (!isValid) {
        c.header('WWW-Authenticate', `Basic realm="${realm}"`);
        const response = unauthorized('Invalid credentials');
        return c.json(response, response._status);
      }

      // Check if user is active
      if (user.active === false) {
        c.header('WWW-Authenticate', `Basic realm="${realm}"`);
        const response = unauthorized('User account is inactive');
        return c.json(response, response._status);
      }

      c.set('user', user);
      c.set('authMethod', 'basic');
      return await next();
    } catch (err) {
      logger.error({ error: err.message }, 'Error validating Basic Auth credentials');
      c.header('WWW-Authenticate', `Basic realm="${realm}"`);
      const response = unauthorized('Authentication error');
      return c.json(response, response._status);
    }
  };
}

export default {
  parseBasicAuth,
  createBasicAuthHandler
};
