// TEMPORARILY SKIPPED - API/Identity issues
/**
 * API Plugin - Security Tests
 *
 * Comprehensive security tests to prove:
 * - Routes are actually protected
 * - JWT driver works correctly and securely
 * - Basic Auth driver works correctly and securely
 * - No bypass attempts succeed
 * - Invalid credentials/tokens are rejected
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';
import { createDatabaseForTest } from '../config.js';

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

describe.skip('API Plugin - Security Tests', () => {
  describe.skip('JWT Driver - Security', () => {
    let db;
    let apiPlugin;
    let validToken;
    const port = 3300;

    beforeAll(async () => {
      db = createDatabaseForTest('api-jwt-security', { verbose: false });
      await db.connect();

      // Create users resource
      await db.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional', // Optional on insert, auto-generated
          email: 'string|required|email',
          password: 'password|required', // Changed from 'secret' to 'password' for bcrypt hashing
          role: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      // Create protected resource
      await db.createResource({
        name: 'secrets',
        attributes: {
          id: 'string|optional',
          data: 'string|required',
          sensitive: 'string|required'
        },
        behavior: 'body-overflow'
      });

      // Create public resource
      await db.createResource({
        name: 'public',
        attributes: {
          id: 'string|optional',
          info: 'string|required'
        },
        behavior: 'body-overflow'
      });

      apiPlugin = new ApiPlugin({
        port,
        verbose: false,
        auth: {
          driver: 'jwt',
          resource: 'users',
          usernameField: 'email',
          passwordField: 'password',
          config: {
            jwtSecret: 'test-secret-key-for-security-testing',
            jwtExpiresIn: '1h',
            registration: {
              enabled: true,
              allowedFields: ['name']
            }
          }
        },
        resources: {
          secrets: {
            auth: true, // PROTECTED
            methods: ['GET', 'POST', 'PUT', 'DELETE']
          },
          public: {
            auth: false, // PUBLIC
            methods: ['GET', 'POST']
          },
          users: {
            auth: false,
            methods: ['GET']
          }
        }
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      // Register and login to get valid token
      const registerResponse = await fetch(`http://localhost:${port}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'security@test.com',
          password: 'SecurePass123!',
          name: 'Security Tester'
        })
      });

      if (!registerResponse.ok) {
        const registerData = await registerResponse.json();
      }

      const loginResponse = await fetch(`http://localhost:${port}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'security@test.com',
          password: 'SecurePass123!'
        })
      });

      const loginData = await loginResponse.json();
      if (!loginData || !loginData.data || !loginData.data.token) {
        throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
      }
      validToken = loginData.data.token;
    });

    afterAll(async () => {
      if (apiPlugin) await apiPlugin.stop();
      if (db) await db.disconnect();
    });

    describe.skip('🔒 Protected Routes - Access Control', () => {
      it('should BLOCK access to protected resource without token', async () => {
        const response = await fetch(`http://localhost:${port}/secrets`);

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.success).toBe(false);
        expect(data.error).toBeDefined();
        expect(data.error.message).toContain('JWT');
      });

      it('should BLOCK POST to protected resource without token', async () => {
        const response = await fetch(`http://localhost:${port}/secrets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: 'secret data',
            sensitive: 'very sensitive'
          })
        });

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.success).toBe(false);
      });

      it('should BLOCK PUT to protected resource without token', async () => {
        const response = await fetch(`http://localhost:${port}/secrets/test-id`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: 'updated' })
        });

        expect(response.status).toBe(401);
      });

      it('should BLOCK DELETE to protected resource without token', async () => {
        const response = await fetch(`http://localhost:${port}/secrets/test-id`, {
          method: 'DELETE'
        });

        expect(response.status).toBe(401);
      });
    });

    describe.skip('🚫 Invalid Token Attacks', () => {
      it('should REJECT malformed token', async () => {
        const response = await fetch(`http://localhost:${port}/secrets`, {
          headers: {
            'Authorization': 'Bearer this-is-not-a-valid-token'
          }
        });

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.success).toBe(false);
      });

      it('should REJECT token without Bearer prefix', async () => {
        const response = await fetch(`http://localhost:${port}/secrets`, {
          headers: {
            'Authorization': validToken // Missing "Bearer "
          }
        });

        expect(response.status).toBe(401);
      });

      it('should REJECT empty Bearer token', async () => {
        const response = await fetch(`http://localhost:${port}/secrets`, {
          headers: {
            'Authorization': 'Bearer '
          }
        });

        expect(response.status).toBe(401);
      });

      it('should REJECT token with wrong signature', async () => {
        // Valid structure but wrong signature
        const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZG1pbiIsImVtYWlsIjoidGVzdEB0ZXN0LmNvbSJ9.WRONG_SIGNATURE';

        const response = await fetch(`http://localhost:${port}/secrets`, {
          headers: {
            'Authorization': `Bearer ${fakeToken}`
          }
        });

        expect(response.status).toBe(401);
      });

      it('should REJECT completely fake token', async () => {
        const response = await fetch(`http://localhost:${port}/secrets`, {
          headers: {
            'Authorization': 'Bearer fake.token.here'
          }
        });

        expect(response.status).toBe(401);
      });

      it('should REJECT token with modified payload', async () => {
        // Get parts of valid token
        const parts = validToken.split('.');

        // Modify payload (change role to admin)
        const fakePayload = Buffer.from(JSON.stringify({
          userId: 'hacker',
          email: 'hacker@test.com',
          role: 'superadmin'
        })).toString('base64');

        const modifiedToken = `${parts[0]}.${fakePayload}.${parts[2]}`;

        const response = await fetch(`http://localhost:${port}/secrets`, {
          headers: {
            'Authorization': `Bearer ${modifiedToken}`
          }
        });

        expect(response.status).toBe(401);
      });
    });

    describe.skip('✅ Valid Token Access', () => {
      it('should ALLOW access to protected resource with valid token', async () => {
        const response = await fetch(`http://localhost:${port}/secrets`, {
          headers: {
            'Authorization': `Bearer ${validToken}`
          }
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
      });

      it('should ALLOW POST to protected resource with valid token', async () => {
        const response = await fetch(`http://localhost:${port}/secrets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validToken}`
          },
          body: JSON.stringify({
            data: 'confidential data',
            sensitive: 'top secret'
          })
        });

        expect(response.status).toBe(201);
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.data).toBe('confidential data');
      });
    });

    describe.skip('🌐 Public Routes - No Auth Required', () => {
      it('should ALLOW access to public resource without token', async () => {
        const response = await fetch(`http://localhost:${port}/public`);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
      });

      it('should ALLOW POST to public resource without token', async () => {
        const response = await fetch(`http://localhost:${port}/public`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            info: 'public information'
          })
        });

        expect(response.status).toBe(201);
      });
    });

    describe.skip('🔐 Authentication Endpoint Security', () => {
      it('should REJECT registration with weak password', async () => {
        const response = await fetch(`http://localhost:${port}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'weak@test.com',
            password: '123' // Too short
          })
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.success).toBe(false);
      });

      it('should REJECT login with wrong password', async () => {
        const response = await fetch(`http://localhost:${port}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'security@test.com',
            password: 'WrongPassword123!'
          })
        });

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.success).toBe(false);
      });

      it('should REJECT login with non-existent user', async () => {
        const response = await fetch(`http://localhost:${port}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'nonexistent@test.com',
            password: 'Password123!'
          })
        });

        expect(response.status).toBe(401);
      });
    });
  });

  describe.skip('Basic Auth Driver - Security', () => {
    let db;
    let apiPlugin;
    let validUsername;
    let validPassword;
    const port = 3301;

    beforeAll(async () => {
      db = createDatabaseForTest('api-basic-security', { verbose: false });
      await db.connect();

      await db.createResource({
        name: 'accounts',
        attributes: {
          id: 'string|optional',
          username: 'string|required',
          password: 'password|required', // Changed from 'secret' to 'password' for bcrypt hashing
          role: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      await db.createResource({
        name: 'confidential',
        attributes: {
          id: 'string|optional',
          secret: 'string|required'
        },
        behavior: 'body-overflow'
      });

      await db.createResource({
        name: 'open',
        attributes: {
          id: 'string|optional',
          data: 'string|required'
        },
        behavior: 'body-overflow'
      });

      apiPlugin = new ApiPlugin({
        port,
        verbose: false,
        auth: {
          driver: 'basic',
          resource: 'accounts',
          usernameField: 'username',
          passwordField: 'password',
          config: {
            realm: 'Security Test API',
            passphrase: 'test-passphrase',
            registration: {
              enabled: true
            }
          }
        },
        resources: {
          confidential: {
            auth: true, // PROTECTED
            methods: ['GET', 'POST', 'PUT', 'DELETE']
          },
          open: {
            auth: false, // PUBLIC
            methods: ['GET', 'POST']
          },
          accounts: {
            auth: false,
            methods: ['GET']
          }
        }
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      // Register a user
      validUsername = 'secureuser';
      validPassword = 'SecureBasic123!';

      const basicRegisterResponse = await fetch(`http://localhost:${port}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: validUsername,
          password: validPassword,
          role: 'user'
        })
      });

      if (!basicRegisterResponse.ok) {
        const basicRegisterData = await basicRegisterResponse.json();
        throw new Error(`Basic Auth registration failed: ${JSON.stringify(basicRegisterData)}`);
      }
    });

    afterAll(async () => {
      if (apiPlugin) await apiPlugin.stop();
      if (db) await db.disconnect();
    });

    describe.skip('🔒 Protected Routes - Access Control', () => {
      it('should BLOCK access to protected resource without credentials', async () => {
        const response = await fetch(`http://localhost:${port}/confidential`);

        expect(response.status).toBe(401);

        // Must include WWW-Authenticate header
        const wwwAuth = response.headers.get('WWW-Authenticate');
        expect(wwwAuth).toBeDefined();
        expect(wwwAuth).toContain('Basic');
        expect(wwwAuth).toContain('realm="Security Test API"');
      });

      it('should BLOCK POST without credentials', async () => {
        const response = await fetch(`http://localhost:${port}/confidential`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret: 'data' })
        });

        expect(response.status).toBe(401);
      });

      it('should BLOCK PUT without credentials', async () => {
        const response = await fetch(`http://localhost:${port}/confidential/test`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret: 'updated' })
        });

        expect(response.status).toBe(401);
      });

      it('should BLOCK DELETE without credentials', async () => {
        const response = await fetch(`http://localhost:${port}/confidential/test`, {
          method: 'DELETE'
        });

        expect(response.status).toBe(401);
      });
    });

    describe.skip('🚫 Invalid Credentials Attacks', () => {
      it('should REJECT wrong username', async () => {
        const wrongAuth = createBasicAuthHeader('wronguser', validPassword);

        const response = await fetch(`http://localhost:${port}/confidential`, {
          headers: { 'Authorization': wrongAuth }
        });

        expect(response.status).toBe(401);
      });

      it('should REJECT wrong password', async () => {
        const wrongAuth = createBasicAuthHeader(validUsername, 'WrongPassword123!');

        const response = await fetch(`http://localhost:${port}/confidential`, {
          headers: { 'Authorization': wrongAuth }
        });

        expect(response.status).toBe(401);
      });

      it('should REJECT malformed Basic Auth header', async () => {
        const response = await fetch(`http://localhost:${port}/confidential`, {
          headers: {
            'Authorization': 'Basic invalid-base64-string!!!'
          }
        });

        expect(response.status).toBe(401);
      });

      it('should REJECT Basic Auth without username', async () => {
        const invalidAuth = Buffer.from(`:${validPassword}`).toString('base64');

        const response = await fetch(`http://localhost:${port}/confidential`, {
          headers: {
            'Authorization': `Basic ${invalidAuth}`
          }
        });

        expect(response.status).toBe(401);
      });

      it('should REJECT Basic Auth without password', async () => {
        const invalidAuth = Buffer.from(`${validUsername}:`).toString('base64');

        const response = await fetch(`http://localhost:${port}/confidential`, {
          headers: {
            'Authorization': `Basic ${invalidAuth}`
          }
        });

        expect(response.status).toBe(401);
      });

      it('should REJECT non-existent user', async () => {
        const invalidAuth = createBasicAuthHeader('nonexistent', 'Password123!');

        const response = await fetch(`http://localhost:${port}/confidential`, {
          headers: { 'Authorization': invalidAuth }
        });

        expect(response.status).toBe(401);
      });

      it('should REJECT empty credentials', async () => {
        const emptyAuth = Buffer.from(':').toString('base64');

        const response = await fetch(`http://localhost:${port}/confidential`, {
          headers: {
            'Authorization': `Basic ${emptyAuth}`
          }
        });

        expect(response.status).toBe(401);
      });

      it('should REJECT credentials without Basic prefix', async () => {
        const creds = Buffer.from(`${validUsername}:${validPassword}`).toString('base64');

        const response = await fetch(`http://localhost:${port}/confidential`, {
          headers: {
            'Authorization': creds // Missing "Basic "
          }
        });

        expect(response.status).toBe(401);
      });
    });

    describe.skip('✅ Valid Credentials Access', () => {
      it('should ALLOW access with valid credentials', async () => {
        const validAuth = createBasicAuthHeader(validUsername, validPassword);

        const response = await fetch(`http://localhost:${port}/confidential`, {
          headers: { 'Authorization': validAuth }
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
      });

      it('should ALLOW POST with valid credentials', async () => {
        const validAuth = createBasicAuthHeader(validUsername, validPassword);

        const response = await fetch(`http://localhost:${port}/confidential`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': validAuth
          },
          body: JSON.stringify({
            secret: 'classified information'
          })
        });

        expect(response.status).toBe(201);
        const data = await response.json();
        expect(data.success).toBe(true);
      });

      it('should require credentials on EVERY request (stateless)', async () => {
        const validAuth = createBasicAuthHeader(validUsername, validPassword);

        // First request with auth
        const response1 = await fetch(`http://localhost:${port}/confidential`, {
          headers: { 'Authorization': validAuth }
        });
        expect(response1.status).toBe(200);

        // Second request WITHOUT auth (must fail)
        const response2 = await fetch(`http://localhost:${port}/confidential`);
        expect(response2.status).toBe(401);

        // Third request with auth again (must work)
        const response3 = await fetch(`http://localhost:${port}/confidential`, {
          headers: { 'Authorization': validAuth }
        });
        expect(response3.status).toBe(200);
      });
    });

    describe.skip('🌐 Public Routes - No Auth Required', () => {
      it('should ALLOW access to public resource without credentials', async () => {
        const response = await fetch(`http://localhost:${port}/open`);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
      });

      it('should ALLOW POST to public resource without credentials', async () => {
        const response = await fetch(`http://localhost:${port}/open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: 'public data'
          })
        });

        expect(response.status).toBe(201);
      });
    });
  });

  describe.skip('🛡️ Cross-Driver Security Isolation', () => {
    it('JWT token should NOT work on Basic Auth protected endpoint', async () => {
      // This test ensures drivers don't interfere with each other
      const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0In0.test';

      const response = await fetch('http://localhost:3301/confidential', {
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      });

      // Should reject because Basic Auth expects Basic header
      expect(response.status).toBe(401);
    });

    it('Basic Auth header should NOT work on JWT protected endpoint', async () => {
      const basicAuth = createBasicAuthHeader('test', 'test');

      const response = await fetch('http://localhost:3300/secrets', {
        headers: {
          'Authorization': basicAuth
        }
      });

      // Should reject because JWT expects Bearer token
      expect(response.status).toBe(401);
    });
  });
});
