import { createDatabaseForTest } from '../../config.js';
import { resolveUser } from '../../../src/plugins/api/auth/resource-manager.js';
import { startApiPlugin } from './helpers/server.js';

describe('API auth lookupById', () => {
  it('uses the identifier as resource id for built-in auth routes', async () => {
    const db = createDatabaseForTest(`api-auth-lookup-${Date.now()}`, { logLevel: 'error' });
    await db.connect();

    let plugin;

    try {
      const started = await startApiPlugin(db, {
        auth: {
          drivers: [
            {
              driver: 'jwt',
              config: {
                resource: 'users',
                secret: 'lookup-by-id-secret',
                lookupById: true
              }
            }
          ],
          registration: {
            enabled: true,
            allowedFields: ['username']
          }
        }
      }, 'api-auth-lookup-by-id');

      plugin = started.plugin;
      const { port } = started;

      const registerResponse = await fetch(`http://127.0.0.1:${port}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'lookup@test.com',
          username: 'lookup-user',
          password: 'LookupPass123!'
        })
      });

      expect(registerResponse.status).toBe(201);

      const storedUser = await db.resources.users.get('lookup@test.com');
      expect(storedUser.id).toBe('lookup@test.com');
      expect(storedUser.email).toBe('lookup@test.com');

      const loginResponse = await fetch(`http://127.0.0.1:${port}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'lookup@test.com',
          password: 'LookupPass123!'
        })
      });

      expect(loginResponse.status).toBe(200);

      const loginBody = await loginResponse.json();
      expect(loginBody.success).toBe(true);
      expect(loginBody.data.user.id).toBe('lookup@test.com');
    } finally {
      await plugin?.stop();
      await db.disconnect();
    }
  });

  it('rethrows backend failures while using lookupById', async () => {
    const resource = {
      get: vi.fn().mockRejectedValue(new Error('storage exploded')),
      query: vi.fn()
    };

    await expect(resolveUser(resource, 'email', 'lookup@test.com', true)).rejects.toThrow('storage exploded');
    expect(resource.query).not.toHaveBeenCalled();
  });
});
