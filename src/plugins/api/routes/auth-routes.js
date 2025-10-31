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
import { encrypt } from '../../../concerns/crypto.js';
import tryFn from '../../../concerns/try-fn.js';

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
    allowRegistration = true
  } = config;

  // POST /auth/register - Register new user
  if (allowRegistration) {
    app.post('/register', asyncHandler(async (c) => {
      const data = await c.req.json();
      const username = data[usernameField];
      const password = data[passwordField];
      const role = data.role || 'user';

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
      const userData = {
        ...dataWithoutId, // Include all fields from request except id
        [usernameField]: username, // Override to ensure correct value
        [passwordField]: password // Will be auto-encrypted by schema (secret field)
      };

      // Add optional fields only if not provided
      if (!userData.role) {
        userData.role = role;
      }
      if (userData.active === undefined) {
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

      // Remove sensitive data from response
      const { [passwordField]: _, ...userWithoutPassword } = user;

      const response = formatter.created({
        user: userWithoutPassword,
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
        const response = formatter.unauthorized('Invalid credentials');
        return c.json(response, response._status);
      }

      const user = users[0];

      // Check if user is active
      if (user.active !== undefined && !user.active) {
        const response = formatter.unauthorized('User account is inactive');
        return c.json(response, response._status);
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
      const { [passwordField]: _, ...userWithoutPassword } = user;

      const response = formatter.success({
        user: userWithoutPassword,
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
    if (!user.password) {
      const response = formatter.success(user);
      return c.json(response, response._status);
    }

    // Remove sensitive data
    const { password: _, ...userWithoutPassword } = user;

    const response = formatter.success(userWithoutPassword);
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
    await usersResource.update(user.id, {
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
