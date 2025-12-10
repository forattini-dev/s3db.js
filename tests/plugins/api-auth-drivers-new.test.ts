/**
 * API Plugin - Auth Drivers Tests (New API)
 *
 * Tests for the new auth driver API:
 * - Resource management (auto-create vs existing)
 * - Driver-specific configuration
 * - JWT, API Key, Basic Auth drivers
 * - Multiple drivers with different resources
 * - OpenAPI security scheme generation
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';
import { createDatabaseForTest, sleep } from '../config.js';
import { jwtLogin } from '../../src/plugins/api/auth/jwt-auth.js';
import { generateApiKey } from '../../src/plugins/api/auth/api-key-auth.js';
import { encrypt } from '../../src/concerns/crypto.js';

// Helper to create Basic Auth header
function createBasicAuthHeader(username, password) {
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${credentials}`;
}

// Helper to wait for server
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

// Helper to wait for resource to be available
async function waitForResource(db, resourceName, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    if (db.resources[resourceName]) {
      return db.resources[resourceName];
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Resource '${resourceName}' was not created in time`);
}

  // Helper to generate a random port within a safe range for ephemeral ports
  function getRandomPort() {
    // Ports 49152-65535 are dynamic/private, avoiding conflicts with well-known ports.
    // We add an offset to avoid using very low ephemeral ports that might be used by other services
    return Math.floor(Math.random() * (65535 - 49152 + 1)) + 49152;
  }

describe('API Plugin - Auth Drivers (New API)', () => {
  describe('JWT Driver - Resource Management', () => {
    let db;
    let apiPlugin;
    let port;

    beforeAll(async () => {
      port = getRandomPort();
      db = createDatabaseForTest(`api-auth-jwt-${Date.now()}`, {
        logLevel: 'silent',
        passphrase: 'test-passphrase' // Required for secret type encryption
      });
      await db.connect();

      apiPlugin = new ApiPlugin({
        port,
        logLevel: 'error',
        auth: {
          drivers: [
            {
              driver: 'jwt',
              config: {
                resource: 'test_users',
                secret: 'test-jwt-secret',
                expiresIn: '1h',
                userField: 'email',
                passwordField: 'password',
                passphrase: 'test-passphrase',
                createResource: true,
                allowRegistration: true,
                registration: {
                  allowedFields: ['username']
                }
              }
            }
          ]
        },
        resources: { // Added resources config
          test_users: {
            auth: true // Allow any authenticated user access
          }
        }
      });

      await db.usePlugin(apiPlugin, 'api');
      await waitForServer(port);
    });

    afterAll(async () => {
      await apiPlugin?.shutdown?.();
      await db?.disconnect();
    });

    it('should auto-create JWT resource if not exists', async () => {
      const resource = db.resources.test_users;
      expect(resource).toBeDefined();
      expect(resource.name).toBe('test_users');
    });

    it('should authenticate with JWT token', async () => {
      // Register user via HTTP endpoint (proper flow)
      const registerResponse = await fetch(`http://localhost:${port}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'jwt@test.com',
          username: 'jwtuser',
          password: 'password123'
        })
      });
      expect(registerResponse.status).toBe(201);

      // Login via HTTP endpoint
      const loginResponse = await fetch(`http://localhost:${port}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'jwt@test.com',
          password: 'password123'
        })
      });

      expect(loginResponse.status).toBe(200);
      const loginResult = await loginResponse.json();
      expect(loginResult.data.token).toBeDefined();
      expect(loginResult.data.user.email).toBe('jwt@test.com');

      // Verify token access to /auth/me
      const meResponse = await fetch(`http://localhost:${port}/auth/me`, {
        headers: {
          Authorization: `Bearer ${loginResult.data.token}`
        }
      });
      expect(meResponse.status).toBe(200);
      const meResult = await meResponse.json();
      expect(meResult.data.id).toBe(loginResult.data.user.id);

      // Use token to access API
      const response = await fetch(`http://localhost:${port}/test_users`, {
        headers: {
          Authorization: `Bearer ${loginResult.data.token}`
        }
      });

      expect(response.status).toBe(200);
    });

    it('should reject invalid JWT token', async () => {
      const response = await fetch(`http://localhost:${port}/test_users`, {
        headers: {
          Authorization: 'Bearer invalid-token'
        }
      });

      expect(response.status).toBe(401);
    });
  });

  describe('API Key Driver - Custom Header', () => {
    let db;
    let apiPlugin;
    let port;

    beforeAll(async () => {
      port = getRandomPort();
      db = createDatabaseForTest(`api-auth-apikey-${Date.now()}`, {
        logLevel: 'silent',
        passphrase: 'api-key-passphrase' // Required for secret type encryption
      });
      await db.connect();

      apiPlugin = new ApiPlugin({
        port,
        logLevel: 'error',
        auth: {
          drivers: [
            {
              driver: 'apiKey',
              config: {
                resource: 'api_clients',
                headerName: 'X-Custom-API-Key',
                queryParam: 'api_key',
                keyField: 'apiKey',
                createResource: true
              }
            }
          ]
        }
      });

      await db.usePlugin(apiPlugin, 'api');
      await waitForServer(port);
    });

    afterAll(async () => {
      await apiPlugin?.shutdown?.();
      await db?.disconnect();
    });

    it('should auto-create api_clients resource', async () => {
      const resource = db.resources.api_clients;
      expect(resource).toBeDefined();
      expect(resource.name).toBe('api_clients');
    });

    it('should authenticate with custom header', async () => {
      const apiKey = generateApiKey(32);

      // Wait for resource to be available
      const resource = await waitForResource(db, 'api_clients');

      // Create API client
      await resource.insert({
        id: 'client1',
        name: 'Test Client',
        apiKey,
        active: true
      });

      const response = await fetch(`http://localhost:${port}/api_clients`, {
        headers: {
          'X-Custom-API-Key': apiKey
        }
      });

      expect(response.status).toBe(200);
    });

    it('should authenticate with query parameter', async () => {
      const apiKey = generateApiKey(32);

      // Wait for resource to be available
      const resource = await waitForResource(db, 'api_clients');

      await resource.insert({
        id: 'client2',
        name: 'Query Client',
        apiKey,
        active: true
      });

      const response = await fetch(`http://localhost:${port}/api_clients?api_key=${apiKey}`);

      expect(response.status).toBe(200);
    });

    it('should reject invalid API key', async () => {
      const response = await fetch(`http://localhost:${port}/api_clients`, {
        headers: {
          'X-Custom-API-Key': 'invalid-key'
        }
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Basic Auth Driver - Cookie Fallback', () => {
    let db;
    let apiPlugin;
    let port;

    beforeAll(async () => {
      port = getRandomPort();
      db = createDatabaseForTest(`api-auth-basic-${Date.now()}`, {
        logLevel: 'silent',
        passphrase: 'basic-pass' // Required for secret type encryption
      });
      await db.connect();

      apiPlugin = new ApiPlugin({
        port,
        logLevel: 'error',
        auth: {
          drivers: [
            {
              driver: 'basic',
              config: {
                resource: 'basic_users',
                realm: 'Test Realm',
                usernameField: 'username',
                passwordField: 'password',
                passphrase: 'basic-pass',
                cookieName: 'api_token',
                tokenField: 'apiToken',
                createResource: true
              }
            }
          ]
        }
      });

      await db.usePlugin(apiPlugin, 'api');
      await waitForServer(port);
    });

    afterAll(async () => {
      await apiPlugin?.shutdown?.();
      await db?.disconnect();
    });

    it('should auto-create basic_users resource', async () => {
      const resource = db.resources.basic_users;
      expect(resource).toBeDefined();
      expect(resource.name).toBe('basic_users');
    });

    it('should authenticate with Basic Auth', async () => {
      // Wait for resource to be available
      const resource = await waitForResource(db, 'basic_users');

      // Insert user directly with plain password (will be auto-encrypted by secret type)
      await resource.insert({
        id: 'user1',
        username: 'basicuser',
        password: 'password123',  // Plain - auto-encrypted by secret type
        active: true
      });

      const authHeader = createBasicAuthHeader('basicuser', 'password123');
      const response = await fetch(`http://localhost:${port}/basic_users`, {
        headers: {
          Authorization: authHeader
        }
      });

      expect(response.status).toBe(200);
    });

    it('should reject wrong password', async () => {
      const authHeader = createBasicAuthHeader('basicuser', 'wrongpassword');
      const response = await fetch(`http://localhost:${port}/basic_users`, {
        headers: {
          Authorization: authHeader
        }
      });

      expect(response.status).toBe(401);
    });

    it('should include WWW-Authenticate header with realm', async () => {
      const response = await fetch(`http://localhost:${port}/basic_users`);

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toContain('Test Realm');
    });
  });

  describe('Multiple Drivers - Different Resources', () => {
    let db;
    let apiPlugin;
    let port;

    beforeAll(async () => {
      port = getRandomPort();
      db = createDatabaseForTest(`api-auth-multi-${Date.now()}`, {
        logLevel: 'silent',
        passphrase: 'secret' // Required for secret type encryption
      });
      await db.connect();

      apiPlugin = new ApiPlugin({
        port,
        logLevel: 'error',
        auth: {
          strategy: 'any', // Accept any driver
          drivers: [
            {
              driver: 'jwt',
              config: {
                resource: 'plg_api_users', // Changed from 'admin_users'
                secret: 'admin-secret',
                passphrase: 'secret',
                userField: 'email',
                passwordField: 'password',
                createResource: true
              }
            },
            {
              driver: 'apiKey',
              config: {
                resource: 'service_accounts',
                headerName: 'X-Service-Key',
                createResource: true
              }
            }
          ]
        },
        resources: { // Added resources config for this block
          plg_api_users: {
            auth: true
          },
          service_accounts: {
            auth: ['apiKey']
          }
        }
      });

      await db.usePlugin(apiPlugin, 'api');
      await waitForServer(port);
    });

    afterAll(async () => {
      await apiPlugin?.shutdown?.();
      await db?.disconnect();
    });

    it('should create separate resources for each driver', async () => {
      expect(db.resources.plg_api_users).toBeDefined();
      expect(db.resources.service_accounts).toBeDefined();
    });

    it('should authenticate with JWT from admin_users', async () => {
      // Wait for resource to be available
      const resource = await waitForResource(db, 'plg_api_users');

      // Insert user directly with plain password (will be auto-encrypted by secret type)
      await resource.insert({
        id: 'admin1',
        email: 'admin@test.com',
        username: 'adminuser', // Added username
        password: 'admin123',  // Plain - auto-encrypted by secret type
        role: 'admin'
      });
      await sleep(50);

      // Login via HTTP endpoint
      const loginResponse = await fetch(`http://localhost:${port}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@test.com',
          password: 'admin123'
        })
      });

      expect(loginResponse.status).toBe(200);
      const loginResult = await loginResponse.json();
      expect(loginResult.data.token).toBeDefined();

      const response = await fetch(`http://localhost:${port}/plg_api_users`, {
        headers: {
          Authorization: `Bearer ${loginResult.data.token}`
        }
      });

      expect(response.status).toBe(200);
    });

    it('should authenticate with API Key from service_accounts', async () => {
      const apiKey = generateApiKey();

      // Wait for resource to be available
      const resource = await waitForResource(db, 'service_accounts');

      await resource.insert({
        id: 'service1',
        name: 'Service 1',
        apiKey,
        active: true
      });

      const response = await fetch(`http://localhost:${port}/service_accounts`, {
        headers: {
          'X-Service-Key': apiKey
        }
      });

      expect(response.status).toBe(200);
    });
  });

  describe('OpenAPI - Security Schemes', () => {
    let db;
    let apiPlugin;
    let port;

    beforeAll(async () => {
      port = getRandomPort();
      db = createDatabaseForTest(`api-auth-openapi-${Date.now()}`, { logLevel: 'silent' });
      await db.connect();

      apiPlugin = new ApiPlugin({
        port,
        logLevel: 'error',
        docs: { enabled: true },
        auth: {
          drivers: [
            {
              driver: 'jwt',
              config: {
                resource: 'jwt_users',
                secret: 'jwt-secret',
                createResource: true
              }
            },
            {
              driver: 'apiKey',
              config: {
                resource: 'api_keys',
                headerName: 'X-API-Key',
                queryParam: 'key',
                createResource: true
              }
            },
            {
              driver: 'basic',
              config: {
                resource: 'basic_users',
                realm: 'API Access',
                createResource: true
              }
            }
          ]
        }
      });

      await db.usePlugin(apiPlugin, 'api');
      await waitForServer(port);
    });

    afterAll(async () => {
      await apiPlugin?.shutdown?.();
      await db?.disconnect();
    });

    it('should generate OpenAPI spec with all security schemes', async () => {
      const response = await fetch(`http://localhost:${port}/openapi.json`);
      expect(response.ok).toBe(true);

      const spec = await response.json();
      expect(spec.components.securitySchemes).toBeDefined();
      expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
      expect(spec.components.securitySchemes.apiKeyAuth).toBeDefined();
      expect(spec.components.securitySchemes.basicAuth).toBeDefined();
    });

    it('should include resource names in security scheme descriptions', async () => {
      const response = await fetch(`http://localhost:${port}/openapi.json`);
      const spec = await response.json();

      expect(spec.components.securitySchemes.bearerAuth.description).toContain('jwt_users');
      expect(spec.components.securitySchemes.apiKeyAuth.description).toContain('api_keys');
      expect(spec.components.securitySchemes.basicAuth.description).toContain('basic_users');
    });

    it('should include custom header name in API Key scheme', async () => {
      const response = await fetch(`http://localhost:${port}/openapi.json`);
      const spec = await response.json();

      expect(spec.components.securitySchemes.apiKeyAuth.name).toBe('X-API-Key');
      expect(spec.components.securitySchemes.apiKeyAuth.description).toContain('key');
    });

    it('should include realm in Basic Auth scheme', async () => {
      const response = await fetch(`http://localhost:${port}/openapi.json`);
      const spec = await response.json();

      expect(spec.components.securitySchemes.basicAuth.description).toContain('API Access');
    });
  });
});
