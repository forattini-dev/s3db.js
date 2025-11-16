import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';
import { startApiPlugin } from './api/helpers/server.js';
import { encrypt, decrypt } from '../../src/concerns/crypto.js';

function createBasicAuthHeader(username, password) {
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${credentials}`;
}

describe('API Plugin - Auth Drivers', () => {
  describe('JWT driver', () => {
    let db;
    let apiPlugin;
    let port;
    let token;
    let registrationBody;
    let loginBody;

    const authResourceName = 'plg_api_auth_driver_users';

    beforeAll(async () => {
      db = createDatabaseForTest('api-auth-jwt', { logLevel: 'error' });
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
        name: 'cars',
        attributes: {
          id: 'string|optional',
          make: 'string|required',
          model: 'string|required'
        },
        behavior: 'body-overflow',
        timestamps: true
      });

      const result = await startApiPlugin(db, {
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
                secret: 'jwt-driver-secret',
                expiresIn: '1h',
                passphrase: 'jwt-driver-passphrase'
              }
            }
          ]
        },
        resources: {
          cars: {
            auth: true,
            methods: ['GET', 'POST']
          }
        }
      }, 'api-auth-jwt');

      apiPlugin = result.plugin;
      port = result.port;
      expect(apiPlugin.config.auth.resource).toBe(authResourceName);

      const registerResponse = await fetch(`http://127.0.0.1:${port}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'driver@test.com',
          password: 'DriverPass123!'
        })
      });
      registrationBody = await registerResponse.json();
      if (registerResponse.status !== 201) {
        throw new Error(`JWT registration failed: ${JSON.stringify(registrationBody)}`);
      }

      const loginResponse = await fetch(`http://127.0.0.1:${port}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'driver@test.com',
          password: 'DriverPass123!'
        })
      });
      loginBody = await loginResponse.json();
      if (loginResponse.status !== 200) {
        throw new Error(`JWT login failed: ${JSON.stringify(loginBody)}`);
      }
      token = loginBody.data.token;
    }, 30000);

    afterAll(async () => {
      await apiPlugin?.stop();
      await db?.disconnect();
    });

    it('registers users without leaking password hashes', () => {
      expect(registrationBody.success).toBe(true);
      expect(registrationBody.data.user.email).toBe('driver@test.com');
      expect(registrationBody.data.user.password).toBeUndefined();
      expect(typeof registrationBody.data.token).toBe('string');
    });

    it('logs in users and returns JWT tokens', () => {
      expect(loginBody.success).toBe(true);
      expect(typeof loginBody.data.token).toBe('string');
      expect(loginBody.data.user.email).toBe('driver@test.com');
    });

    it('allows authenticated access to protected resources', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/cars`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          make: 'Tesla',
          model: 'Model Y'
        })
      });
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.make).toBe('Tesla');
    });

    it('rejects invalid JWT tokens', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/cars`, {
        headers: { Authorization: 'Bearer nope' }
      });
      expect(response.status).toBe(401);
    });
  });

  describe('Basic driver', () => {
    let db;
    let apiPlugin;
    let port;
    const username = 'basic-user';
    const password = 'BasicPass123!';

    beforeAll(async () => {
      db = createDatabaseForTest('api-auth-basic', { logLevel: 'error' });
      await db.connect();

      const accountsResource = await db.createResource({
        name: 'accounts',
        attributes: {
          id: 'string|optional',
          username: 'string|required',
          secret: 'string|required|minlength:8',
          role: 'string|optional',
          active: 'boolean|default:true'
        },
        behavior: 'body-overflow',
        timestamps: true
      });

      await db.createResource({
        name: 'products',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        },
        behavior: 'body-overflow',
        timestamps: true
      });

      const basicPassphrase = 'basic-driver-passphrase';

      await accountsResource.insert({
        username,
        secret: await encrypt(password, basicPassphrase),
        role: 'admin',
        active: true
      });

      const result = await startApiPlugin(db, {
        auth: {
          registration: {
            enabled: true,
            allowedFields: ['role']
          },
          drivers: [
            {
              driver: 'basic',
              config: {
                resource: 'accounts',
                usernameField: 'username',
                passwordField: 'secret',
                realm: 'Test API',
                passphrase: basicPassphrase
              }
            }
          ]
        },
        resources: {
          products: {
            auth: true,
            methods: ['GET', 'POST']
          }
        }
      }, 'api-auth-basic');

      apiPlugin = result.plugin;
      port = result.port;
      const basicDriverConfig = apiPlugin.config.auth.drivers.find(d => d.driver === 'basic')?.config;
      expect(basicDriverConfig?.resource).toBe('accounts');
      const storedAccounts = await db.resources.accounts.list();
      expect(storedAccounts.length).toBeGreaterThan(0);
      const decryptedSecret = await decrypt(storedAccounts[0].secret, basicPassphrase);
      expect(decryptedSecret).toBe(password);

    }, 30000);

    afterAll(async () => {
      await apiPlugin?.stop();
      await db?.disconnect();
    });

    it('requires Authorization header on protected routes', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/products`);
      expect(response.status).toBe(401);
      const header = response.headers.get('www-authenticate');
      expect(header).toContain('Basic realm="Test API"');
    });

    it('rejects invalid Basic credentials', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/products`, {
        headers: { Authorization: createBasicAuthHeader(username, 'nope') }
      });
      expect(response.status).toBe(401);
    });

    it('allows valid Basic credentials', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/products`, {
        method: 'POST',
        headers: {
          Authorization: createBasicAuthHeader(username, password),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: 'Laptop' })
      });
      const body = await response.json();
      if (response.status !== 201) {
        throw new Error(`Basic auth write failed: ${JSON.stringify(body)}`);
      }
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Laptop');
    });
  });
});
