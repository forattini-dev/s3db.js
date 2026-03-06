import { describe, expect, it } from 'vitest';
import { ApiPlugin } from '../../src/plugins/api/index.js';
import { createMemoryDatabaseForTest } from '../config.js';

async function waitForServer(port: number, maxAttempts = 100): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok || response.status === 503) {
        return;
      }
    } catch {
      // wait for boot
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`API server on port ${port} did not become ready in time`);
}

describe('ApiPlugin header-secret auth', () => {
  it('authenticates native routes with a shared header secret and admin identity', async () => {
    const port = 4200 + Math.floor(Math.random() * 1000);
    const testName = `api-plugin-header-secret-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const db = createMemoryDatabaseForTest(testName, { logLevel: 'silent' });
    let apiPlugin: ApiPlugin | null = null;

    try {
      await db.connect();

      const users = await db.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional',
          email: 'string|required',
          tokenHash: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          protected: [{ path: 'tokenHash', unlessRole: ['admin'] }]
        }
      });

      await users.insert({
        id: 'user-1',
        email: 'owner@example.com',
        tokenHash: 'secret-hash'
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        auth: {
          createResource: false,
          drivers: [{
            driver: 'header-secret',
            config: {
              headerName: 'x-admin-secret',
              secret: 'top-secret',
              role: 'admin',
              roles: ['admin'],
              scopes: ['admin:read'],
              serviceAccount: {
                clientId: 'admin-ui',
                name: 'Admin UI'
              }
            }
          }],
          pathRules: [{
            path: '/users/**',
            methods: ['header-secret'],
            required: true,
            roles: ['admin']
          }]
        },
        resources: ['users']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const unauthorizedResponse = await fetch(`http://127.0.0.1:${port}/users/user-1`);
      expect(unauthorizedResponse.status).toBe(401);

      const response = await fetch(`http://127.0.0.1:${port}/users/user-1`, {
        headers: {
          'x-admin-secret': 'top-secret'
        }
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.email).toBe('owner@example.com');
      expect(body.data.tokenHash).toBe('secret-hash');
    } finally {
      if (apiPlugin) {
        await apiPlugin.stop();
      }
      await db.disconnect();
    }
  });
});
