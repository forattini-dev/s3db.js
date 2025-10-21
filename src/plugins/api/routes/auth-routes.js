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
 * @param {Object} usersResource - s3db.js users resource
 * @param {Object} config - Auth configuration
 * @returns {Hono} Hono app with auth routes
 */
export function createAuthRoutes(usersResource, config = {}) {
  const app = new Hono();
  const {
    jwtSecret,
    jwtExpiresIn = '7d',
    passphrase = 'secret',
    allowRegistration = true
  } = config;

  // POST /auth/register - Register new user
  if (allowRegistration) {
    app.post('/register', asyncHandler(async (c) => {
      const data = await c.req.json();
      const { username, password, email, role = 'user' } = data;

      // Validate input
      if (!username || !password) {
        const response = formatter.validationError([
          { field: 'username', message: 'Username is required' },
          { field: 'password', message: 'Password is required' }
        ]);
        return c.json(response, response._status);
      }

      if (password.length < 8) {
        const response = formatter.validationError([
          { field: 'password', message: 'Password must be at least 8 characters' }
        ]);
        return c.json(response, response._status);
      }

      // Check if username already exists
      const existing = await usersResource.query({ username });
      if (existing && existing.length > 0) {
        const response = formatter.error('Username already exists', {
          status: 409,
          code: 'CONFLICT'
        });
        return c.json(response, response._status);
      }

      // Create user
      const user = await usersResource.insert({
        username,
        password, // Will be auto-encrypted by schema (secret field)
        email,
        role,
        active: true,
        apiKey: generateApiKey(),
        createdAt: new Date().toISOString()
      });

      // Generate JWT token
      let token = null;
      if (jwtSecret) {
        token = createToken(
          { userId: user.id, username: user.username, role: user.role },
          jwtSecret,
          jwtExpiresIn
        );
      }

      // Remove sensitive data from response
      const { password: _, ...userWithoutPassword } = user;

      const response = formatter.created({
        user: userWithoutPassword,
        token
      }, `/auth/users/${user.id}`);

      return c.json(response, response._status);
    }));
  }

  // POST /auth/login - Login with username/password
  app.post('/login', asyncHandler(async (c) => {
    const data = await c.req.json();
    const { username, password } = data;

    // Validate input
    if (!username || !password) {
      const response = formatter.unauthorized('Username and password are required');
      return c.json(response, response._status);
    }

    // Find user
    const users = await usersResource.query({ username });
    if (!users || users.length === 0) {
      const response = formatter.unauthorized('Invalid credentials');
      return c.json(response, response._status);
    }

    const user = users[0];

    if (!user.active) {
      const response = formatter.unauthorized('User account is inactive');
      return c.json(response, response._status);
    }

    // Verify password (decrypt and compare)
    // Note: In production, use proper password hashing (bcrypt, argon2)
    const [ok, err, decrypted] = await tryFn(() =>
      user.password // Password is already decrypted by autoDecrypt
    );

    // For secret fields, we need to manually decrypt if autoDecrypt is off
    // But by default autoDecrypt is true, so user.password should be plain text here
    // Let's just compare directly since schema handles encryption/decryption
    const isValid = user.password === password;

    if (!isValid) {
      const response = formatter.unauthorized('Invalid credentials');
      return c.json(response, response._status);
    }

    // Update last login
    await usersResource.update(user.id, {
      lastLoginAt: new Date().toISOString()
    });

    // Generate JWT token
    let token = null;
    if (jwtSecret) {
      token = createToken(
        { userId: user.id, username: user.username, role: user.role },
        jwtSecret,
        jwtExpiresIn
      );
    }

    // Remove sensitive data from response
    const { password: _, ...userWithoutPassword } = user;

    const response = formatter.success({
      user: userWithoutPassword,
      token,
      expiresIn: jwtExpiresIn
    });

    return c.json(response, response._status);
  }));

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
