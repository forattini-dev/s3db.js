/**
 * Basic Authentication - HTTP Basic Auth middleware
 *
 * Provides authentication using username:password in Authorization header
 */

import { unauthorized } from '../utils/response-formatter.js';
import { decrypt } from '../../../concerns/crypto.js';
import tryFn from '../../../concerns/try-fn.js';

/**
 * Parse Basic Auth header
 * @param {string} authHeader - Authorization header value
 * @returns {Object|null} { username, password } or null if invalid
 */
export function parseBasicAuth(authHeader) {
  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Basic\s+(.+)$/i);
  if (!match) {
    return null;
  }

  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
    const [username, ...passwordParts] = decoded.split(':');
    const password = passwordParts.join(':'); // Handle passwords with colons

    if (!username || !password) {
      return null;
    }

    return { username, password };
  } catch (err) {
    return null;
  }
}

/**
 * Verify password against stored hash
 * @param {string} inputPassword - Plain text password from request
 * @param {string} storedPassword - Encrypted password from database
 * @param {string} passphrase - Encryption passphrase
 * @returns {Promise<boolean>} True if password matches
 */
async function verifyPassword(inputPassword, storedPassword, passphrase) {
  try {
    // Decrypt stored password
    const [ok, err, decrypted] = await tryFn(() =>
      decrypt(storedPassword, passphrase)
    );

    if (!ok) {
      return false;
    }

    // Compare
    return decrypted === inputPassword;
  } catch (err) {
    return false;
  }
}

/**
 * Create Basic Auth middleware
 * @param {Object} options - Basic Auth options
 * @param {string} options.realm - Authentication realm (default: 'API Access')
 * @param {Object} options.authResource - Resource for credential validation
 * @param {string} options.usernameField - Field name for username (default: 'email')
 * @param {string} options.passwordField - Field name for password (default: 'password')
 * @param {string} options.passphrase - Passphrase for password decryption
 * @param {boolean} options.optional - If true, allows requests without auth
 * @param {Object} options.adminUser - Root admin credentials (bypasses DB lookup)
 * @param {boolean} options.adminUser.enabled - Enable admin root user bypass (default: false)
 * @param {string} options.adminUser.username - Admin username
 * @param {string} options.adminUser.password - Admin password (plain text)
 * @param {Array<string>} options.adminUser.scopes - Admin scopes (default: ['admin'])
 * @returns {Function} Hono middleware
 */
export function basicAuth(options = {}) {
  const {
    realm = 'API Access',
    authResource,
    usernameField = 'email',
    passwordField = 'password',
    passphrase = 'secret',
    optional = false,
    adminUser = null
  } = options;

  if (!authResource) {
    throw new Error('authResource is required for Basic authentication');
  }

  return async (c, next) => {
    const authHeader = c.req.header('authorization');

    if (!authHeader) {
      if (optional) {
        return await next();
      }

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

    // Check admin user first (bypasses DB lookup)
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
        await next();
        return;
      }
    }

    // Query user by configured username field
    try {
      const queryFilter = { [usernameField]: username };
      const users = await authResource.query(queryFilter);

      if (!users || users.length === 0) {
        c.header('WWW-Authenticate', `Basic realm="${realm}"`);
        const response = unauthorized('Invalid credentials');
        return c.json(response, response._status);
      }

      const user = users[0];

      // Check if user is active (if field exists)
      if (user.active !== undefined && !user.active) {
        c.header('WWW-Authenticate', `Basic realm="${realm}"`);
        const response = unauthorized('User account is inactive');
        return c.json(response, response._status);
      }

      // Verify password using configured password field
      // Schema handles encryption/decryption for 'secret' field types
      const storedPassword = user[passwordField];
      const isValid = storedPassword === password;

      if (!isValid) {
        c.header('WWW-Authenticate', `Basic realm="${realm}"`);
        const response = unauthorized('Invalid credentials');
        return c.json(response, response._status);
      }

      // Store user in context
      c.set('user', user);
      c.set('authMethod', 'basic');

      await next();
    } catch (err) {
      if (c.get('verbose')) {
        console.error('[Basic Auth] Error validating credentials:', err);
      }
      c.header('WWW-Authenticate', `Basic realm="${realm}"`);
      const response = unauthorized('Authentication error');
      return c.json(response, response._status);
    }
  };
}

export default {
  parseBasicAuth,
  basicAuth
};
