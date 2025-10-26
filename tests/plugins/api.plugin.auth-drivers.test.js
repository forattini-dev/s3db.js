/**
 * API Plugin - Driver-Based Authentication & Custom Routes Tests
 *
 * Tests for:
 * - JWT authentication driver
 * - Basic authentication driver
 * - Configurable username/password fields
 * - Custom routes (plugin and resource level)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';
import { createDatabaseForTest } from '../config.js';

// Helper to create auth header for Basic Auth
function createBasicAuthHeader(username, password) {
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${credentials}`;
}

// Helper to wait for server to be ready
async function waitForServer(port, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`http://localhost:${port}/health`);
      if (response.ok) return true;
    } catch (err) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Server on port ${port} did not start in time`);
}

describe('API Plugin - Driver-Based Authentication', () => {
  describe('JWT Authentication Driver', () => {
    let db;
    let apiPlugin;
    const port = 3200;

    beforeAll(async () => {
      // Create database
      db = createDatabaseForTest('api-jwt-auth', {
        verbose: false
      });

      await db.connect();

      // Create users resource
      await db.createResource({
        name: 'users',
        attributes: {
          id: 'string|required',
          email: 'string|required|email',
          password: 'secret|required',
          role: 'string|optional',
          active: 'boolean|default:true'
        },
        behavior: 'body-overflow',
        timestamps: true
      });

      // Create cars resource
      await db.createResource({
        name: 'cars',
        attributes: {
          id: 'string|required',
          make: 'string|required',
          model: 'string|required',
          year: 'number|required'
        },
        behavior: 'body-overflow',
        timestamps: true
      });

      // Configure API with JWT driver
      apiPlugin = new ApiPlugin({
        port,
        verbose: false,
        auth: {
          driver: 'jwt',
          resource: 'users',
          usernameField: 'email',
          passwordField: 'password',
          config: {
            jwtSecret: 'test-secret-key',
            jwtExpiresIn: '1h',
            allowRegistration: true
          }
        },
        resources: {
          cars: {
            auth: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE']
          },
          users: {
            auth: false,
            methods: ['GET']
          }
        }
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);
    });

    afterAll(async () => {
      if (apiPlugin) await apiPlugin.stop();
      if (db) await db.disconnect();
    });

    it('should mount auth routes', async () => {
      const response = await fetch(`http://localhost:${port}/docs`);
      expect(response.status).toBe(200);
    });

    it('should register user via /auth/register', async () => {
      const response = await fetch(`http://localhost:${port}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'SecurePass123!',
          role: 'user'
        })
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.email).toBe('test@example.com');
      expect(data.data.token).toBeDefined();
      expect(typeof data.data.token).toBe('string');
      expect(data.data.password).toBeUndefined(); // Should not return password
    });

    it('should not allow duplicate registration', async () => {
      const response = await fetch(`http://localhost:${port}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'SecurePass123!'
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should login and return JWT token via /auth/login', async () => {
      const response = await fetch(`http://localhost:${port}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'SecurePass123!'
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.token).toBeDefined();
      expect(typeof data.data.token).toBe('string');
      expect(data.data.user).toBeDefined();
      expect(data.data.user.email).toBe('test@example.com');
    });

    it('should reject invalid credentials', async () => {
      const response = await fetch(`http://localhost:${port}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'WrongPassword'
        })
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should block access to protected resource without token', async () => {
      const response = await fetch(`http://localhost:${port}/cars`);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('JWT');
    });

    it('should allow access to protected resource with valid token', async () => {
      // Login first
      const loginResponse = await fetch(`http://localhost:${port}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'SecurePass123!'
        })
      });

      const loginData = await loginResponse.json();
      const token = loginData.data.token;

      // Access protected resource
      const response = await fetch(`http://localhost:${port}/cars`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          make: 'Tesla',
          model: 'Model 3',
          year: 2024
        })
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.make).toBe('Tesla');
    });

    it('should allow public access to non-protected resources', async () => {
      const response = await fetch(`http://localhost:${port}/users`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  describe('Basic Authentication Driver', () => {
    let db;
    let apiPlugin;
    const port = 3201;

    beforeAll(async () => {
      // Create database
      db = createDatabaseForTest('api-basic-auth', {
        verbose: false
      });

      await db.connect();

      // Create accounts resource (custom name)
      await db.createResource({
        name: 'accounts',
        attributes: {
          id: 'string|required',
          username: 'string|required',
          secret: 'secret|required',
          role: 'string|optional',
          active: 'boolean|default:true'
        },
        behavior: 'body-overflow',
        timestamps: true
      });

      // Create products resource
      await db.createResource({
        name: 'products',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          price: 'number|required'
        },
        behavior: 'body-overflow',
        timestamps: true
      });

      // Configure API with Basic Auth driver
      apiPlugin = new ApiPlugin({
        port,
        verbose: false,
        auth: {
          driver: 'basic',
          resource: 'accounts',
          usernameField: 'username',
          passwordField: 'secret',
          config: {
            realm: 'Test API',
            passphrase: 'test-key',
            allowRegistration: true
          }
        },
        resources: {
          products: {
            auth: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE']
          },
          accounts: {
            auth: false,
            methods: ['GET']
          }
        }
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);
    });

    afterAll(async () => {
      if (apiPlugin) await apiPlugin.stop();
      if (db) await db.disconnect();
    });

    it('should register account via /auth/register', async () => {
      const response = await fetch(`http://localhost:${port}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'alice',
          secret: 'AliceSecret123!',
          role: 'admin'
        })
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.username).toBe('alice');
      expect(data.data.token).toBeUndefined(); // Basic auth doesn't return token
      expect(data.data.secret).toBeUndefined(); // Should not return password
    });

    it('should NOT have /auth/login endpoint (Basic auth only)', async () => {
      const response = await fetch(`http://localhost:${port}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'alice',
          secret: 'AliceSecret123!'
        })
      });

      expect(response.status).toBe(404); // Route not found
    });

    it('should block access to protected resource without auth header', async () => {
      const response = await fetch(`http://localhost:${port}/products`);
      expect(response.status).toBe(401);

      // Should have WWW-Authenticate header
      const wwwAuth = response.headers.get('WWW-Authenticate');
      expect(wwwAuth).toBeDefined();
      expect(wwwAuth).toContain('Basic');
      expect(wwwAuth).toContain('realm="Test API"');
    });

    it('should reject invalid credentials', async () => {
      const authHeader = createBasicAuthHeader('alice', 'WrongPassword');
      const response = await fetch(`http://localhost:${port}/products`, {
        headers: {
          'Authorization': authHeader
        }
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should allow access with valid Basic Auth credentials', async () => {
      const authHeader = createBasicAuthHeader('alice', 'AliceSecret123!');

      const response = await fetch(`http://localhost:${port}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          name: 'Laptop',
          price: 1299.99
        })
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Laptop');
    });

    it('should require auth on every request (stateless)', async () => {
      const authHeader = createBasicAuthHeader('alice', 'AliceSecret123!');

      // First request
      const response1 = await fetch(`http://localhost:${port}/products`, {
        headers: { 'Authorization': authHeader }
      });
      expect(response1.status).toBe(200);

      // Second request (must include auth again)
      const response2 = await fetch(`http://localhost:${port}/products`, {
        headers: { 'Authorization': authHeader }
      });
      expect(response2.status).toBe(200);

      // Third request without auth (should fail)
      const response3 = await fetch(`http://localhost:${port}/products`);
      expect(response3.status).toBe(401);
    });

    it('should allow public access to non-protected resources', async () => {
      const response = await fetch(`http://localhost:${port}/accounts`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  describe('Custom Username/Password Fields', () => {
    let db;
    let apiPlugin;
    const port = 3202;

    beforeAll(async () => {
      // Create database
      db = createDatabaseForTest('api-custom-fields', {
        verbose: false
      });

      await db.connect();

      // Create members resource with custom field names
      await db.createResource({
        name: 'members',
        attributes: {
          id: 'string|required',
          memberEmail: 'string|required|email', // Custom username field
          memberPassword: 'secret|required', // Custom password field
          memberName: 'string|optional',
          active: 'boolean|default:true'
        },
        behavior: 'body-overflow',
        timestamps: true
      });

      // Configure API with custom fields
      apiPlugin = new ApiPlugin({
        port,
        verbose: false,
        auth: {
          driver: 'jwt',
          resource: 'members',
          usernameField: 'memberEmail',
          passwordField: 'memberPassword',
          config: {
            jwtSecret: 'custom-secret',
            jwtExpiresIn: '1h',
            allowRegistration: true
          }
        },
        resources: {
          members: {
            auth: false,
            methods: ['GET']
          }
        }
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);
    });

    afterAll(async () => {
      if (apiPlugin) await apiPlugin.stop();
      if (db) await db.disconnect();
    });

    it('should register with custom username/password fields', async () => {
      const response = await fetch(`http://localhost:${port}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberEmail: 'custom@example.com',
          memberPassword: 'CustomPass123!',
          memberName: 'Custom User'
        })
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.memberEmail).toBe('custom@example.com');
      expect(data.data.memberPassword).toBeUndefined(); // Should not return password
    });

    it('should login with custom username/password fields', async () => {
      const response = await fetch(`http://localhost:${port}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberEmail: 'custom@example.com',
          memberPassword: 'CustomPass123!'
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.token).toBeDefined();
      expect(data.data.user.memberEmail).toBe('custom@example.com');
    });
  });
});

describe('API Plugin - Custom Routes', () => {
  describe('Plugin-Level Custom Routes', () => {
    let db;
    let apiPlugin;
    const port = 3203;

    beforeAll(async () => {
      // Create database
      db = createDatabaseForTest('api-custom-routes-plugin', {
        verbose: false
      });

      await db.connect();

      // Create events resource
      await db.createResource({
        name: 'events',
        attributes: {
          id: 'string|required',
          type: 'string|required',
          action: 'string|required',
          metadata: 'object|optional'
        },
        behavior: 'body-overflow',
        timestamps: true
      });

      // Configure API with plugin-level custom routes
      apiPlugin = new ApiPlugin({
        port,
        verbose: false,
        routes: {
          'GET /custom/health': async (c) => {
            const context = c.get('customRouteContext');
            return c.json({
              success: true,
              data: {
                status: 'healthy',
                resources: Object.keys(context.database.resources).length
              }
            });
          },

          'POST /custom/webhook': async (c) => {
            const payload = await c.req.json();
            const context = c.get('customRouteContext');
            await context.database.resources.events.insert({
              type: 'webhook',
              action: payload.action || 'unknown',
              metadata: payload
            });
            return c.json({
              success: true,
              data: { message: 'Webhook received' }
            });
          },

          'GET /custom/stats': async (c) => {
            const context = c.get('customRouteContext');
            const events = await context.database.resources.events.list();
            return c.json({
              success: true,
              data: {
                totalEvents: events.length
              }
            });
          }
        },
        resources: {
          events: {
            auth: false,
            methods: ['GET']
          }
        }
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);
    });

    afterAll(async () => {
      if (apiPlugin) await apiPlugin.stop();
      if (db) await db.disconnect();
    });

    it('should mount custom GET route', async () => {
      const response = await fetch(`http://localhost:${port}/custom/health`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('healthy');
      expect(data.data.resources).toBeGreaterThan(0);
    });

    it('should mount custom POST route', async () => {
      const response = await fetch(`http://localhost:${port}/custom/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_action',
          data: { foo: 'bar' }
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.message).toBe('Webhook received');
    });

    it('should have access to database context in custom routes', async () => {
      const response = await fetch(`http://localhost:${port}/custom/stats`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.totalEvents).toBeGreaterThanOrEqual(1); // At least one from webhook test
    });
  });

  describe('Resource-Level Custom Routes', () => {
    let db;
    let apiPlugin;
    const port = 3204;

    beforeAll(async () => {
      // Create database
      db = createDatabaseForTest('api-custom-routes-resource', {
        verbose: false
      });

      await db.connect();

      // Create users resource
      await db.createResource({
        name: 'users',
        attributes: {
          id: 'string|required',
          username: 'string|required',
          status: 'string|optional',
          loginCount: 'number|default:0'
        },
        behavior: 'body-overflow',
        timestamps: true
      });

      // Configure API with resource-level custom routes
      apiPlugin = new ApiPlugin({
        port,
        verbose: false,
        resources: {
          users: {
            auth: false,
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            routes: {
              'POST /:id/activate': async (c) => {
                const userId = c.req.param('id');
                const context = c.get('customRouteContext');
                await context.resource.update(userId, { status: 'active' });
                return c.json({
                  success: true,
                  data: { message: `User ${userId} activated` }
                });
              },

              'POST /:id/deactivate': async (c) => {
                const userId = c.req.param('id');
                const context = c.get('customRouteContext');
                await context.resource.update(userId, { status: 'inactive' });
                return c.json({
                  success: true,
                  data: { message: `User ${userId} deactivated` }
                });
              },

              'POST /:id/login': async (c) => {
                const userId = c.req.param('id');
                const context = c.get('customRouteContext');
                const user = await context.resource.get(userId);
                await context.resource.update(userId, {
                  loginCount: (user.loginCount || 0) + 1
                });
                return c.json({
                  success: true,
                  data: { loginCount: user.loginCount + 1 }
                });
              },

              'GET /:id/stats': async (c) => {
                const userId = c.req.param('id');
                const context = c.get('customRouteContext');
                const user = await context.resource.get(userId);
                return c.json({
                  success: true,
                  data: {
                    userId,
                    username: user.username,
                    loginCount: user.loginCount || 0,
                    status: user.status || 'unknown'
                  }
                });
              }
            }
          }
        }
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);
    });

    afterAll(async () => {
      if (apiPlugin) await apiPlugin.stop();
      if (db) await db.disconnect();
    });

    it('should mount resource-level custom routes', async () => {
      // Create a user first
      const createResponse = await fetch(`http://localhost:${port}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          status: 'pending'
        })
      });

      expect(createResponse.status).toBe(201);
      const createData = await createResponse.json();
      const userId = createData.data.id;

      // Test activate custom route
      const activateResponse = await fetch(`http://localhost:${port}/users/${userId}/activate`, {
        method: 'POST'
      });

      expect(activateResponse.status).toBe(200);
      const activateData = await activateResponse.json();
      expect(activateData.success).toBe(true);
      expect(activateData.data.message).toContain('activated');
    });

    it('should have access to resource context in custom routes', async () => {
      // Create a user
      const createResponse = await fetch(`http://localhost:${port}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'statsuser'
        })
      });

      const createData = await createResponse.json();
      const userId = createData.data.id;

      // Trigger login custom route multiple times
      await fetch(`http://localhost:${port}/users/${userId}/login`, { method: 'POST' });
      await fetch(`http://localhost:${port}/users/${userId}/login`, { method: 'POST' });
      await fetch(`http://localhost:${port}/users/${userId}/login`, { method: 'POST' });

      // Get stats
      const statsResponse = await fetch(`http://localhost:${port}/users/${userId}/stats`);
      expect(statsResponse.status).toBe(200);
      const statsData = await statsResponse.json();
      expect(statsData.success).toBe(true);
      expect(statsData.data.loginCount).toBe(3);
      expect(statsData.data.username).toBe('statsuser');
    });

    it('should support different HTTP methods in custom routes', async () => {
      // Create a user
      const createResponse = await fetch(`http://localhost:${port}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'methodtest'
        })
      });

      const createData = await createResponse.json();
      const userId = createData.data.id;

      // Test POST method
      const postResponse = await fetch(`http://localhost:${port}/users/${userId}/activate`, {
        method: 'POST'
      });
      expect(postResponse.status).toBe(200);

      // Test GET method
      const getResponse = await fetch(`http://localhost:${port}/users/${userId}/stats`);
      expect(getResponse.status).toBe(200);
    });
  });
});
