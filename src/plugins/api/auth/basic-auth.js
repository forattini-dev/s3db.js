/**
 * Basic Authentication - HTTP Basic Auth middleware
 *
 * Provides authentication using username:password in Authorization header.
 * Optionally supports a cookie token fallback (e.g., 'api_token' → users.apiToken).
 */

import { unauthorized } from '../utils/response-formatter.js';
import { decrypt } from '../../../concerns/crypto.js';
import tryFn from '../../../concerns/try-fn.js';
import { getCookie } from 'hono/cookie';

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

export function basicAuth(options = {}) {
  const {
    realm = 'API Access',
    authResource,
    usernameField = 'email',
    passwordField = 'password',
    passphrase = 'secret',
    optional = false,
    adminUser = null,
    // Optional cookie fallback for SPA tokens (e.g., api_token)
    cookieName = null,
    tokenField = 'apiToken'
  } = options;

  if (!authResource) {
    throw new Error('authResource is required for Basic authentication');
  }

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
      if (user.active !== undefined && !user.active) {
        c.header('WWW-Authenticate', `Basic realm="${realm}"`);
        const response = unauthorized('User account is inactive');
        return c.json(response, response._status);
      }

      // NOTE: stored passwords may be plain or encrypted depending on schema
      const storedPassword = user[passwordField];
      const isValid = storedPassword === password;
      if (!isValid) {
        c.header('WWW-Authenticate', `Basic realm="${realm}"`);
        const response = unauthorized('Invalid credentials');
        return c.json(response, response._status);
      }

      c.set('user', user);
      c.set('authMethod', 'basic');
      return await next();
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

export default { parseBasicAuth, basicAuth };
