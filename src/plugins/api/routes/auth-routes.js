/**
 * Authentication Routes - Login, register, and token management endpoints
 *
 * Provides user authentication endpoints for the API
 */

import { Hono } from 'hono';
import { asyncHandler } from '../utils/error-handler.js';
import * as formatter from '../utils/response-formatter.js';
import { createToken } from '../auth/jwt-auth.js';
import { generateApiKey } from '../auth/api-key-auth.js';
import tryFn from '../../../concerns/try-fn.js';
import { hashPassword } from '../../../concerns/password-hashing.js';

/**
 * Create authentication routes
 * @param {Object} authResource - s3db.js resource that manages authentication
 * @param {Object} config - Auth configuration
 * @returns {Hono} Hono app with auth routes
 */
export function createAuthRoutes(authResource, config = {}) {
  const app = new Hono();
  const {
    driver,                          // 'jwt' or 'basic'
    usernameField = 'email',         // Field name for username (default: 'email')
    passwordField = 'password',      // Field name for password (default: 'password')
    jwtSecret,
    jwtExpiresIn = '7d',
    passphrase = 'secret',
    registration = {},
    loginThrottle = {}
  } = config;

  const registrationConfig = {
    enabled: registration.enabled === true,
    allowedFields: Array.isArray(registration.allowedFields) ? registration.allowedFields : [],
    defaultRole: registration.defaultRole || 'user'
  };

  const schemaAttributes = authResource.schema?.attributes || {};
  const passwordAttribute = schemaAttributes?.[passwordField];
  const isPasswordType = typeof passwordAttribute === 'string'
    ? passwordAttribute.includes('password')
    : passwordAttribute?.type === 'password';

  const allowedRegistrationFields = new Set([usernameField, passwordField]);
  for (const field of registrationConfig.allowedFields) {
    if (typeof field === 'string' && field && field !== passwordField) {
      allowedRegistrationFields.add(field);
    }
  }

  const blockedRegistrationFields = new Set([
    'role',
    'active',
    'apiKey',
    'jwtSecret',
    'scopes',
    'createdAt',
    'updatedAt',
    'metadata',
    'id'
  ]);

  const loginThrottleConfig = {
    enabled: loginThrottle?.enabled !== false,
    maxAttempts: loginThrottle?.maxAttempts ?? 5,
    windowMs: loginThrottle?.windowMs ?? 60_000,
    blockDurationMs: loginThrottle?.blockDurationMs ?? 300_000,
    maxEntries: loginThrottle?.maxEntries ?? 10_000
  };

  const loginAttempts = new Map();

  const getClientIp = (c) => {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    const cfConnecting = c.req.header('cf-connecting-ip');
    if (cfConnecting) {
      return cfConnecting;
    }
    return c.req.raw?.socket?.remoteAddress || 'unknown';
  };

  const cleanupLoginAttempts = () => {
    if (loginAttempts.size <= loginThrottleConfig.maxEntries) {
      return;
    }
    const oldestKey = loginAttempts.keys().next().value;
    if (oldestKey) {
      loginAttempts.delete(oldestKey);
    }
  };

  const getThrottleRecord = (key, now) => {
    if (!loginThrottleConfig.enabled) return null;
    let record = loginAttempts.get(key);
    if (record && record.blockedUntil && now > record.blockedUntil) {
      loginAttempts.delete(key);
      record = null;
    }
    if (!record || now - record.firstAttemptAt > loginThrottleConfig.windowMs) {
      record = { attempts: 0, firstAttemptAt: now, blockedUntil: null };
      loginAttempts.set(key, record);
      cleanupLoginAttempts();
    }
    return record;
  };

  const registerFailedAttempt = (record, now) => {
    if (!loginThrottleConfig.enabled || !record) {
      return { blocked: false };
    }
    record.attempts += 1;
    record.lastAttemptAt = now;
    if (record.attempts >= loginThrottleConfig.maxAttempts) {
      record.blockedUntil = now + loginThrottleConfig.blockDurationMs;
      const retryAfter = Math.ceil((record.blockedUntil - now) / 1000);
      return { blocked: true, retryAfter };
    }
    return { blocked: false };
  };

  const buildPublicUser = (user) => {
    const publicUser = { id: user.id };
    const identifier = user[usernameField] ?? user.email ?? user.username;
    if (identifier !== undefined) {
      publicUser[usernameField] = identifier;
    }

    for (const field of allowedRegistrationFields) {
      if (field === usernameField || field === passwordField) continue;
      if (user[field] !== undefined) {
        publicUser[field] = user[field];
      }
    }

    if (schemaAttributes.role !== undefined && user.role !== undefined) {
      publicUser.role = user.role;
    }

    if (schemaAttributes.active !== undefined && user.active !== undefined) {
      publicUser.active = user.active;
    }

    return publicUser;
  };

  // POST /auth/register - Register new user
  if (registrationConfig.enabled) {
    app.post('/register', asyncHandler(async (c) => {
      const data = await c.req.json();
      const username = data[usernameField];
      const password = data[passwordField];

      // Validate input
      if (!username || !password) {
        const response = formatter.validationError([
          { field: usernameField, message: `${usernameField} is required` },
          { field: passwordField, message: `${passwordField} is required` }
        ]);
        return c.json(response, response._status);
      }

      if (password.length < 8) {
        const response = formatter.validationError([
          { field: passwordField, message: 'Password must be at least 8 characters' }
        ]);
        return c.json(response, response._status);
      }

      // Check if username already exists
      const queryFilter = { [usernameField]: username };
      const existing = await authResource.query(queryFilter);
      if (existing && existing.length > 0) {
        const response = formatter.error(`${usernameField} already exists`, {
          status: 409,
          code: 'CONFLICT'
        });
        return c.json(response, response._status);
      }

      // Create user with dynamic fields
      // Only include fields from request + required auth fields
      const { id, ...dataWithoutId } = data; // Exclude id from request data
      const userData = {};

      for (const [key, value] of Object.entries(dataWithoutId)) {
        if (!allowedRegistrationFields.has(key)) continue;
        if (blockedRegistrationFields.has(key)) continue;
        if (key === usernameField || key === passwordField) continue;
        userData[key] = value;
      }

      userData[usernameField] = username;

      if (isPasswordType) {
        userData[passwordField] = password;
      } else {
        userData[passwordField] = await hashPassword(password);
      }

      if (schemaAttributes.role !== undefined) {
        userData.role = registrationConfig.defaultRole;
      }

      if (schemaAttributes.active !== undefined) {
        userData.active = true;
      }

      const user = await authResource.insert(userData);

      // Generate JWT token (only for JWT driver)
      let token = null;
      if (driver === 'jwt' && jwtSecret) {
        token = createToken(
          {
            userId: user.id,
            [usernameField]: user[usernameField],
            role: user.role
          },
          jwtSecret,
          jwtExpiresIn
        );
      }

      const response = formatter.created({
        user: buildPublicUser(user),
        ...(token && { token }) // Only include token if JWT driver
      }, `/auth/users/${user.id}`);

      return c.json(response, response._status);
    }));
  }

  // POST /auth/login - Login with username/password (JWT driver only)
  if (driver === 'jwt') {
    app.post('/login', asyncHandler(async (c) => {
      const data = await c.req.json();
      const username = data[usernameField];
      const password = data[passwordField];

      // Validate input
      if (!username || !password) {
        const response = formatter.unauthorized(`${usernameField} and ${passwordField} are required`);
        return c.json(response, response._status);
      }

      // Find user by username field
      const queryFilter = { [usernameField]: username };
      const users = await authResource.query(queryFilter);
      if (!users || users.length === 0) {
        const now = Date.now();
        let throttleRecord = null;
        let throttleKey = null;
        if (loginThrottleConfig.enabled) {
          const ip = getClientIp(c);
          throttleKey = `${ip}:${username}`;
          throttleRecord = getThrottleRecord(throttleKey, now);
          const throttleResult = registerFailedAttempt(throttleRecord, now);
          if (throttleResult.blocked) {
            c.header('Retry-After', throttleResult.retryAfter.toString());
            const response = formatter.error('Too many login attempts. Try again later.', {
              status: 429,
              code: 'TOO_MANY_ATTEMPTS',
              details: { retryAfter: throttleResult.retryAfter }
            });
            return c.json(response, response._status);
          }
        }

        const response = formatter.unauthorized('Invalid credentials');
        return c.json(response, response._status);
      }

      const user = users[0];

      // Check if user is active
      if (user.active !== undefined && !user.active) {
        const response = formatter.unauthorized('User account is inactive');
        return c.json(response, response._status);
      }

      const now = Date.now();
      let throttleRecord = null;
      let throttleKey = null;
      if (loginThrottleConfig.enabled) {
        const ip = getClientIp(c);
        throttleKey = `${ip}:${username}`;
        throttleRecord = getThrottleRecord(throttleKey, now);
        if (throttleRecord && throttleRecord.blockedUntil && now < throttleRecord.blockedUntil) {
          const retryAfter = Math.ceil((throttleRecord.blockedUntil - now) / 1000);
          c.header('Retry-After', retryAfter.toString());
          const response = formatter.error('Too many login attempts. Try again later.', {
            status: 429,
            code: 'TOO_MANY_ATTEMPTS',
            details: { retryAfter }
          });
          return c.json(response, response._status);
        }
      }

      // Verify password (compare with password field)
      // For 'password' field type (bcrypt hash), use verifyPassword
      // For 'secret' field type (AES encryption), compare directly
      let isValid = false;

      const storedPassword = user[passwordField];
      if (!storedPassword) {
        const response = formatter.unauthorized('Invalid credentials');
        return c.json(response, response._status);
      }

      // Check if it's a bcrypt hash (starts with $ or is compacted 53 chars)
      const isBcryptHash = storedPassword.startsWith('$') || (storedPassword.length === 53 && !storedPassword.includes(':'));

      if (isBcryptHash) {
        // Import verifyPassword for bcrypt hashes
        const { verifyPassword } = await import('../../../concerns/password-hashing.js');
        isValid = await verifyPassword(password, storedPassword);
      } else {
        // For encrypted/secret fields, direct comparison
        isValid = storedPassword === password;
      }

      if (!isValid) {
        const throttleResult = registerFailedAttempt(throttleRecord, now);
        if (throttleResult.blocked) {
          c.header('Retry-After', throttleResult.retryAfter.toString());
          const response = formatter.error('Too many login attempts. Try again later.', {
            status: 429,
            code: 'TOO_MANY_ATTEMPTS',
            details: { retryAfter: throttleResult.retryAfter }
          });
          return c.json(response, response._status);
        }

        const response = formatter.unauthorized('Invalid credentials');
        return c.json(response, response._status);
      }

      // Update last login if field exists
      if (user.lastLoginAt !== undefined) {
        await authResource.update(user.id, {
          lastLoginAt: new Date().toISOString()
        });
      }

      // Generate JWT token
      let token = null;
      if (jwtSecret) {
        token = createToken(
          {
            userId: user.id,
            [usernameField]: user[usernameField],
            role: user.role
          },
          jwtSecret,
          jwtExpiresIn
        );
      }

      // Remove sensitive data from response
      if (loginThrottleConfig.enabled && throttleKey) {
        loginAttempts.delete(throttleKey);
      }

      const response = formatter.success({
        user: buildPublicUser(user),
        token,
        expiresIn: jwtExpiresIn
      });

      return c.json(response, response._status);
    }));
  }

  // POST /auth/token/refresh - Refresh JWT token
  if (jwtSecret) {
    app.post('/token/refresh', asyncHandler(async (c) => {
      const user = c.get('user');

      if (!user) {
        const response = formatter.unauthorized('Authentication required');
        return c.json(response, response._status);
      }

      // Generate new token
      const token = createToken(
        { userId: user.id, username: user.username, role: user.role },
        jwtSecret,
        jwtExpiresIn
      );

      const response = formatter.success({
        token,
        expiresIn: jwtExpiresIn
      });

      return c.json(response, response._status);
    }));
  }

  // GET /auth/me - Get current user info
  app.get('/me', asyncHandler(async (c) => {
    const user = c.get('user');

    if (!user) {
      const response = formatter.unauthorized('Authentication required');
      return c.json(response, response._status);
    }

    // If user is from JWT payload (no password field), return as is
    const response = formatter.success(buildPublicUser(user));
    return c.json(response, response._status);
  }));

  // POST /auth/api-key/regenerate - Regenerate API key
  app.post('/api-key/regenerate', asyncHandler(async (c) => {
    const user = c.get('user');

    if (!user) {
      const response = formatter.unauthorized('Authentication required');
      return c.json(response, response._status);
    }

    // Generate new API key
    const newApiKey = generateApiKey();

    // Update user
    await authResource.update(user.id, {
      apiKey: newApiKey
    });

    const response = formatter.success({
      apiKey: newApiKey,
      message: 'API key regenerated successfully'
    });

    return c.json(response, response._status);
  }));

  return app;
}

export default {
  createAuthRoutes
};
