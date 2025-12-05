import { createDatabaseForTest } from '../config.js';
import { startApiPlugin } from './api/helpers/server.js';

describe('API Plugin - Security Contracts', () => {
  describe('JWT driver protections', () => {
    let db;
    let apiPlugin;
    let port;
    let validToken;
    const authResourceName = 'plg_security_auth_users';

    beforeAll(async () => {
      db = createDatabaseForTest('api-security-jwt', { logLevel: 'error' });
      await db.connect();

      await db.createResource({
        name: authResourceName,
        attributes: {
          id: 'string|optional',
          email: 'string|required|email',
          password: 'password|required',
          role: 'string|optional',
          scopes: 'array|items:string|optional',
          active: 'boolean|default:true',
          lastLoginAt: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true
      });

      await db.createResource({
        name: 'secrets',
        attributes: {
          id: 'string|optional',
          data: 'string|required',
          sensitive: 'string|required'
        },
        behavior: 'body-overflow',
        timestamps: true
      });

      await db.createResource({
        name: 'public_records',
        attributes: {
          id: 'string|optional',
          info: 'string|required'
        },
        behavior: 'body-overflow',
        timestamps: true
      });

      const result = await startApiPlugin(db, {
        port: 3300 + Math.floor(Math.random() * 500),
        auth: {
          resource: authResourceName,
          registration: {
            enabled: true
          },
          drivers: [
            {
              driver: 'jwt',
              config: {
                resource: authResourceName,
                secret: 'security-secret-key',
                expiresIn: '1h',
                userField: 'email',
                passwordField: 'password',
                passphrase: 'security-passphrase'
              }
            }
          ]
        },
        resources: {
          secrets: {
            auth: true,
            methods: ['GET', 'POST']
          },
          public_records: {
            auth: false,
            methods: ['GET', 'POST']
          }
        }
      }, 'api-security-jwt');

      apiPlugin = result.plugin;
      port = result.port;
      expect(apiPlugin.config.auth.resource).toBe(authResourceName);

      const registerResponse = await fetch(`http://127.0.0.1:${port}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'security@test.com',
          password: 'StrongPass123!'
        })
      });
      const registerBody = await registerResponse.json();
      if (registerResponse.status !== 201) {
        throw new Error(`Registration failed: ${JSON.stringify(registerBody)}`);
      }

      const loginResponse = await fetch(`http://127.0.0.1:${port}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'security@test.com',
          password: 'StrongPass123!'
        })
      });

      const loginBody = await loginResponse.json();
      if (loginResponse.status !== 200) {
        throw new Error(`Login failed: ${JSON.stringify(loginBody)}`);
      }
      validToken = loginBody.data.token;
    }, 30000);

    afterAll(async () => {
      await apiPlugin?.stop();
      await db?.disconnect();
    });

    it('blocks protected resources without a token', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/secrets`);
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.message).toMatch(/authorization/i);
    });

    it('rejects malformed bearer tokens', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/secrets`, {
        headers: { Authorization: 'Bearer totally-invalid' }
      });
      expect(response.status).toBe(401);
    });

    it('allows reading protected resources with a valid token', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/secrets`, {
        headers: { Authorization: `Bearer ${validToken}` }
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('allows writing protected resources with a valid token', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/secrets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: 'ultra secret',
          sensitive: 'classified'
        })
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.data).toBe('ultra secret');
    });

    it('keeps public resources accessible without auth', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/public_records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ info: 'public data' })
      });
      expect(response.status).toBe(201);

      const listResponse = await fetch(`http://127.0.0.1:${port}/public_records`);
      expect(listResponse.status).toBe(200);
      const listBody = await listResponse.json();
      expect(listBody.success).toBe(true);
      expect(listBody.data[0].info).toBe('public data');
    });

    it('rejects login attempts with invalid credentials', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'security@test.com',
          password: 'WrongPassword!'
        })
      });
      expect(response.status).toBe(401);
    });
  });
});
