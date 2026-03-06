/**
 * API Plugin - Resource API Config Tests
 *
 * Tests for the resource.$schema.api configuration structure:
 * - api.guard - guards configuration
 * - api.protected - list of fields to filter from API responses
 * - api.description - resource description for OpenAPI docs
 */

import { ApiPlugin } from '../../src/plugins/api/index.js';
import { createMemoryDatabaseForTest } from '../config.js';
import { verifyPassword } from '../../src/concerns/password-hashing.js';

async function waitForServer(port, maxAttempts = 100) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok || response.status === 503) {
        return;
      }
    } catch (err) {
      // swallow connection errors until server is ready
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`API server on port ${port} did not become ready in time after ${maxAttempts * 100}ms`);
}

describe('API Plugin - resource.$schema.api configuration', () => {
  let db;
  let apiPlugin;
  let port;

  beforeEach(async () => {
    port = 3400 + Math.floor(Math.random() * 1000);
    const testName = `api-plugin-api-config-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    db = createMemoryDatabaseForTest(testName, { logLevel: 'silent' });
    await db.connect();
  });

  afterEach(async () => {
    if (apiPlugin) {
      await apiPlugin.stop();
      apiPlugin = null;
    }

    if (db) {
      await db.disconnect();
      db = null;
    }
  });

  describe('api.protected', () => {
    it('filters protected fields from GET response', async () => {
      const resource = await db.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          email: 'string|required',
          ip: 'string|optional',
          password: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          protected: ['ip', 'password']
        }
      });

      await resource.insert({
        id: 'user-1',
        name: 'John Doe',
        email: 'john@example.com',
        ip: '192.168.1.1',
        password: 'secret123'
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['users']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const getResponse = await fetch(`http://127.0.0.1:${port}/users/user-1`);
      expect(getResponse.status).toBe(200);

      const getBody = await getResponse.json();
      expect(getBody.success).toBe(true);
      expect(getBody.data.name).toBe('John Doe');
      expect(getBody.data.email).toBe('john@example.com');
      expect(getBody.data.ip).toBeUndefined();
      expect(getBody.data.password).toBeUndefined();
    });

    it('filters protected fields from LIST response', async () => {
      const resource = await db.createResource({
        name: 'clicks',
        attributes: {
          id: 'string|optional',
          url: 'string|required',
          ip: 'string|optional',
          userAgent: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          protected: ['ip', 'userAgent']
        }
      });

      await resource.insert({ id: 'click-1', url: '/page1', ip: '1.2.3.4', userAgent: 'Mozilla/5.0' });
      await resource.insert({ id: 'click-2', url: '/page2', ip: '5.6.7.8', userAgent: 'Chrome/100' });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['clicks']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/clicks`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.length).toBe(2);

      for (const item of body.data) {
        expect(item.url).toBeDefined();
        expect(item.ip).toBeUndefined();
        expect(item.userAgent).toBeUndefined();
      }
    });

    it('filters nested protected fields using dot notation', async () => {
      const resource = await db.createResource({
        name: 'events',
        attributes: {
          id: 'string|optional',
          type: 'string|required',
          metadata: {
            ip: 'string|optional',
            browser: 'string|optional',
            location: 'string|optional'
          }
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          protected: ['metadata.ip', 'metadata.location']
        }
      });

      await resource.insert({
        id: 'event-1',
        type: 'click',
        metadata: {
          ip: '10.0.0.1',
          browser: 'Firefox',
          location: 'New York'
        }
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['events']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/events/event-1`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.type).toBe('click');
      expect(body.data.metadata.browser).toBe('Firefox');
      expect(body.data.metadata.ip).toBeUndefined();
      expect(body.data.metadata.location).toBeUndefined();
    });

    it('supports role-aware protected field rules', async () => {
      const resource = await db.createResource({
        name: 'members',
        attributes: {
          id: 'string|optional',
          email: 'string|required',
          tokenHash: 'string|optional',
          internalNotes: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          protected: [
            'internalNotes',
            { path: 'tokenHash', unlessRole: ['admin'] }
          ]
        }
      });

      await resource.insert({
        id: 'member-1',
        email: 'member@example.com',
        tokenHash: 'tok-secret',
        internalNotes: 'private'
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: {
          members: {
            customMiddleware: [async (c, next) => {
              const role = c.req.raw.headers.get('x-role');
              if (role) {
                c.set('user', { role, roles: [role] });
              }
              await next();
            }]
          }
        }
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const userResponse = await fetch(`http://127.0.0.1:${port}/members/member-1`);
      const userBody = await userResponse.json();
      expect(userResponse.status).toBe(200);
      expect(userBody.data.email).toBe('member@example.com');
      expect(userBody.data.tokenHash).toBeUndefined();
      expect(userBody.data.internalNotes).toBeUndefined();

      const adminResponse = await fetch(`http://127.0.0.1:${port}/members/member-1`, {
        headers: { 'x-role': 'admin' }
      });
      const adminBody = await adminResponse.json();
      expect(adminResponse.status).toBe(200);
      expect(adminBody.data.email).toBe('member@example.com');
      expect(adminBody.data.tokenHash).toBe('tok-secret');
      expect(adminBody.data.internalNotes).toBeUndefined();
    });

    it('filters protected fields from POST response', async () => {
      await db.createResource({
        name: 'logs',
        attributes: {
          id: 'string|optional',
          message: 'string|required',
          ip: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          protected: ['ip']
        }
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['logs']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Test log', ip: '192.168.0.1' })
      });

      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toBe('Test log');
      expect(body.data.ip).toBeUndefined();
    });

    it('filters protected fields from PUT response', async () => {
      const resource = await db.createResource({
        name: 'profiles',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          ssn: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          protected: ['ssn']
        }
      });

      await resource.insert({ id: 'profile-1', name: 'Jane', ssn: '123-45-6789' });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['profiles']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/profiles/profile-1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Jane Updated', ssn: '987-65-4321' })
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Jane Updated');
      expect(body.data.ssn).toBeUndefined();
    });

    it('filters protected fields from PATCH response', async () => {
      const resource = await db.createResource({
        name: 'accounts',
        attributes: {
          id: 'string|optional',
          email: 'string|required',
          apiKey: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          protected: ['apiKey']
        }
      });

      await resource.insert({ id: 'acc-1', email: 'test@test.com', apiKey: 'secret-key-123' });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['accounts']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/accounts/acc-1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'updated@test.com' })
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.email).toBe('updated@test.com');
      expect(body.data.apiKey).toBeUndefined();
    });

    it('does not rehash password or re-encrypt secret when patching another field', async () => {
      const resource = await db.createResource({
        name: 'accounts_with_secret',
        attributes: {
          id: 'string|optional',
          email: 'string|required|email',
          password: 'password|required|min:8',
          apiKey: 'secret|required'
        },
        behavior: 'body-overflow',
        timestamps: true,
        autoDecrypt: false,
        security: {
          passphrase: 'test-passphrase',
          bcrypt: { rounds: 12 }
        },
        api: {
          protected: ['password', 'apiKey']
        }
      });

      const account = await resource.insert({
        id: 'acc-sec-1',
        email: 'test@example.com',
        password: 'OriginalPassword123',
        apiKey: 'api-secret-key-123'
      });

      const before = await resource.get(account.id);

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['accounts_with_secret']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/accounts_with_secret/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'updated@example.com' })
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.apiKey).toBeUndefined();
      expect(body.data.password).toBeUndefined();

      const after = await resource.get(account.id);
      expect(after.password).toBe(before.password);
      expect(after.apiKey).toBe(before.apiKey);
      expect(await verifyPassword('OriginalPassword123', after.password)).toBe(true);
    });
  });

  describe('api.views', () => {
    it('auto-selects the best matching view for the current actor', async () => {
      const resource = await db.createResource({
        name: 'directories',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          email: 'string|optional',
          role: 'string|optional',
          tokenHash: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          views: {
            public: {
              auto: true,
              priority: 1,
              fields: ['id', 'name']
            },
            admin: {
              auto: true,
              whenRole: ['admin'],
              priority: 100,
              fields: ['id', 'name', 'email', 'role', 'tokenHash']
            }
          }
        }
      });

      await resource.insert({
        id: 'directory-1',
        name: 'Directory',
        email: 'directory@example.com',
        role: 'user',
        tokenHash: 'tok-visible-for-admin'
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: {
          directories: {
            customMiddleware: [async (c, next) => {
              const role = c.req.raw.headers.get('x-role') || 'user';
              c.set('user', { role, roles: [role], scopes: role === 'admin' ? ['admin'] : [] });
              await next();
            }]
          }
        }
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const publicResponse = await fetch(`http://127.0.0.1:${port}/directories/directory-1`);
      const publicBody = await publicResponse.json();
      expect(publicResponse.status).toBe(200);
      expect(publicBody.meta.view).toBe('public');
      expect(publicBody.data).toEqual({
        id: 'directory-1',
        name: 'Directory'
      });

      const adminResponse = await fetch(`http://127.0.0.1:${port}/directories/directory-1`, {
        headers: { 'x-role': 'admin' }
      });
      const adminBody = await adminResponse.json();
      expect(adminResponse.status).toBe(200);
      expect(adminBody.meta.view).toBe('admin');
      expect(adminBody.data).toEqual({
        id: 'directory-1',
        name: 'Directory',
        email: 'directory@example.com',
        role: 'user',
        tokenHash: 'tok-visible-for-admin'
      });
    });

    it('supports guarded resource views for native GET routes', async () => {
      const resource = await db.createResource({
        name: 'profiles',
        attributes: {
          id: 'string|optional',
          email: 'string|required',
          name: 'string|required',
          role: 'string|optional',
          tokenHash: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          protected: [
            { path: 'tokenHash', unlessRole: ['admin'] }
          ],
          views: {
            admin: {
              guard: ['admin'],
              fields: ['id', 'email', 'name', 'role', 'tokenHash']
            }
          }
        }
      });

      await resource.insert({
        id: 'profile-1',
        email: 'profile@example.com',
        name: 'Profile',
        role: 'user',
        tokenHash: 'tok-admin'
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: {
          profiles: {
            customMiddleware: [async (c, next) => {
              const role = c.req.raw.headers.get('x-role');
              if (role) {
                c.set('user', { role, roles: [role], scopes: role === 'admin' ? ['admin'] : [] });
              }
              await next();
            }]
          }
        }
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const forbiddenResponse = await fetch(`http://127.0.0.1:${port}/profiles/profile-1?view=admin`);
      const forbiddenBody = await forbiddenResponse.json();
      expect(forbiddenResponse.status).toBe(403);
      expect(forbiddenBody.error.code).toBe('VIEW_FORBIDDEN');

      const adminResponse = await fetch(`http://127.0.0.1:${port}/profiles/profile-1?view=admin`, {
        headers: { 'x-role': 'admin' }
      });
      const adminBody = await adminResponse.json();
      expect(adminResponse.status).toBe(200);
      expect(adminBody.meta.view).toBe('admin');
      expect(adminBody.data).toEqual({
        id: 'profile-1',
        email: 'profile@example.com',
        name: 'Profile',
        role: 'user',
        tokenHash: 'tok-admin'
      });
    });
  });

  describe('api.write', () => {
    it('supports conditional write policies for different actors', async () => {
      const resource = await db.createResource({
        name: 'memberships',
        attributes: {
          id: 'string|optional',
          phone: 'string|optional',
          role: 'string|optional',
          isActive: 'boolean|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          write: {
            patch: [
              {
                whenRole: ['admin'],
                priority: 100,
                writable: ['phone', 'role', 'isActive']
              },
              {
                whenRole: ['user'],
                priority: 10,
                writable: ['phone'],
                readonly: ['role', 'isActive']
              }
            ]
          }
        }
      });

      await resource.insert({
        id: 'membership-1',
        phone: '1111',
        role: 'user',
        isActive: true
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: {
          memberships: {
            customMiddleware: [async (c, next) => {
              const role = c.req.raw.headers.get('x-role') || 'user';
              c.set('user', { role, roles: [role] });
              await next();
            }]
          }
        }
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const userRejectedResponse = await fetch(`http://127.0.0.1:${port}/memberships/membership-1`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-role': 'user'
        },
        body: JSON.stringify({ role: 'admin' })
      });
      const userRejectedBody = await userRejectedResponse.json();
      expect(userRejectedResponse.status).toBe(400);
      expect(userRejectedBody.error.code).toBe('FIELD_WRITE_NOT_ALLOWED');
      expect(userRejectedBody.error.details.rejectedFields).toContain('role');

      const adminAllowedResponse = await fetch(`http://127.0.0.1:${port}/memberships/membership-1`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-role': 'admin'
        },
        body: JSON.stringify({ role: 'admin', isActive: false })
      });
      const adminAllowedBody = await adminAllowedResponse.json();
      expect(adminAllowedResponse.status).toBe(200);
      expect(adminAllowedBody.data.role).toBe('admin');
      expect(adminAllowedBody.data.isActive).toBe(false);
    });

    it('rejects readonly fields on patch while allowing writable fields', async () => {
      const resource = await db.createResource({
        name: 'contacts',
        attributes: {
          id: 'string|optional',
          phone: 'string|optional',
          role: 'string|optional',
          apiKey: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          write: {
            patch: {
              readonly: ['role', 'apiKey']
            }
          }
        }
      });

      await resource.insert({
        id: 'contact-1',
        phone: '1111',
        role: 'user',
        apiKey: 'secret'
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['contacts']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const rejectedResponse = await fetch(`http://127.0.0.1:${port}/contacts/contact-1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' })
      });
      const rejectedBody = await rejectedResponse.json();
      expect(rejectedResponse.status).toBe(400);
      expect(rejectedBody.error.code).toBe('FIELD_WRITE_NOT_ALLOWED');
      expect(rejectedBody.error.details.rejectedFields).toContain('role');

      const allowedResponse = await fetch(`http://127.0.0.1:${port}/contacts/contact-1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '2222' })
      });
      const allowedBody = await allowedResponse.json();
      expect(allowedResponse.status).toBe(200);
      expect(allowedBody.data.phone).toBe('2222');
      expect(allowedBody.data.role).toBe('user');
    });
  });

  describe('api.bulk.create', () => {
    it('creates multiple items and applies response views for bulk create', async () => {
      await db.createResource({
        name: 'bulk_users',
        attributes: {
          id: 'string|optional',
          email: 'string|required',
          name: 'string|required',
          tokenHash: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          bulk: {
            create: true
          },
          protected: [
            { path: 'tokenHash', unlessRole: ['admin'] }
          ],
          views: {
            admin: {
              whenRole: ['admin'],
              fields: ['id', 'email', 'name', 'tokenHash']
            }
          }
        }
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: {
          bulk_users: {
            customMiddleware: [async (c, next) => {
              const role = c.req.raw.headers.get('x-role');
              if (role) {
                c.set('user', { role, roles: [role] });
              }
              await next();
            }]
          }
        }
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/bulk_users/bulk?view=admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': 'admin'
        },
        body: JSON.stringify({
          items: [
            { id: 'bulk-user-1', email: 'bulk-1@example.com', name: 'Bulk One', tokenHash: 'tok-1' },
            { id: 'bulk-user-2', email: 'bulk-2@example.com', name: 'Bulk Two', tokenHash: 'tok-2' }
          ]
        })
      });

      const body = await response.json();
      expect(response.status).toBe(201);
      expect(body.meta.view).toBe('admin');
      expect(body.data.summary).toEqual({
        total: 2,
        processed: 2,
        created: 2,
        failed: 0,
        stopped: false,
        mode: 'partial'
      });
      expect(body.data.errors).toEqual([]);
      expect(body.data.items).toEqual([
        {
          id: 'bulk-user-1',
          email: 'bulk-1@example.com',
          name: 'Bulk One',
          tokenHash: 'tok-1'
        },
        {
          id: 'bulk-user-2',
          email: 'bulk-2@example.com',
          name: 'Bulk Two',
          tokenHash: 'tok-2'
        }
      ]);
    });

    it('returns partial results when some items violate create policy', async () => {
      await db.createResource({
        name: 'bulk_memberships',
        attributes: {
          id: 'string|optional',
          email: 'string|required',
          phone: 'string|optional',
          role: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          bulk: {
            create: {
              mode: 'partial'
            }
          },
          write: {
            create: {
              writable: ['id', 'email', 'phone'],
              readonly: ['role']
            }
          }
        }
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['bulk_memberships']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/bulk_memberships/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: [
            { id: 'membership-1', email: 'membership-1@example.com', phone: '1111' },
            { id: 'membership-2', email: 'membership-2@example.com', role: 'admin' }
          ]
        })
      });

      const body = await response.json();
      expect(response.status).toBe(207);
      expect(body.data.summary).toEqual({
        total: 2,
        processed: 2,
        created: 1,
        failed: 1,
        stopped: false,
        mode: 'partial'
      });
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].email).toBe('membership-1@example.com');
      expect(body.data.errors).toEqual([
        expect.objectContaining({
          index: 1,
          code: 'FIELD_WRITE_NOT_ALLOWED',
          status: 400
        })
      ]);

      const saved = await db.resources.bulk_memberships.get('membership-1');
      expect(saved?.email).toBe('membership-1@example.com');
      await expect(db.resources.bulk_memberships.get('membership-2')).rejects.toThrow('No such key');
    });

    it('stops processing after the first failure in all-or-nothing mode', async () => {
      await db.createResource({
        name: 'bulk_contacts',
        attributes: {
          id: 'string|optional',
          email: 'string|required',
          name: 'string|required',
          role: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          bulk: {
            create: {
              mode: 'all-or-nothing'
            }
          },
          write: {
            create: {
              writable: ['id', 'email', 'name'],
              readonly: ['role']
            }
          }
        }
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['bulk_contacts']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/bulk_contacts/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: [
            { id: 'contact-1', email: 'contact-1@example.com', name: 'First' },
            { id: 'contact-2', email: 'contact-2@example.com', name: 'Second', role: 'admin' },
            { id: 'contact-3', email: 'contact-3@example.com', name: 'Third' }
          ]
        })
      });

      const body = await response.json();
      expect(response.status).toBe(207);
      expect(body.data.summary).toEqual({
        total: 3,
        processed: 2,
        created: 1,
        failed: 1,
        stopped: true,
        mode: 'all-or-nothing'
      });
      expect(body.data.errors).toEqual([
        expect.objectContaining({
          index: 1,
          code: 'FIELD_WRITE_NOT_ALLOWED'
        })
      ]);

      expect(await db.resources.bulk_contacts.get('contact-1')).not.toBeNull();
      await expect(db.resources.bulk_contacts.get('contact-2')).rejects.toThrow('No such key');
      await expect(db.resources.bulk_contacts.get('contact-3')).rejects.toThrow('No such key');
    });
  });

  describe('api.guard', () => {
    it('applies guard from api.guard config', async () => {
      await db.createResource({
        name: 'secrets',
        attributes: {
          id: 'string|optional',
          value: 'string|required'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          guard: {
            list: (ctx) => ctx.user?.role === 'admin',
            get: (ctx) => ctx.user?.role === 'admin'
          }
        }
      });

      await db.resources.secrets.insert({ id: 'secret-1', value: 'top-secret' });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['secrets']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      // Without auth - should be forbidden
      const response = await fetch(`http://127.0.0.1:${port}/secrets`);
      expect(response.status).toBe(403);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('combines guard and protected in api config', async () => {
      const resource = await db.createResource({
        name: 'items',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          internalId: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          guard: true, // Allow all (public)
          protected: ['internalId']
        }
      });

      await resource.insert({ id: 'item-1', name: 'Widget', internalId: 'INT-999' });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['items']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/items/item-1`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Widget');
      expect(body.data.internalId).toBeUndefined();
    });

  });

  describe('api.description', () => {
    it('uses api.description for OpenAPI documentation', async () => {
      await db.createResource({
        name: 'products',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          price: 'number|required'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          description: 'Product catalog management',
          guard: true
        }
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: true },
        logging: { enabled: false },
        resources: ['products']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      // Fetch OpenAPI spec
      const response = await fetch(`http://127.0.0.1:${port}/openapi.json`);
      expect(response.status).toBe(200);

      const spec = await response.json();
      const productsTag = spec.tags.find(t => t.name === 'products');
      expect(productsTag).toBeDefined();
      expect(productsTag.description).toBe('Product catalog management');

      const listOperation = spec.paths['/products']?.get;
      expect(listOperation).toBeDefined();
      const parameterNames = (listOperation.parameters || []).map((param: { name: string }) => param.name);
      expect(parameterNames).toContain('cursor');
      expect(parameterNames).toContain('page');
      expect(parameterNames).not.toContain('offset');

      const responseHeaders = listOperation.responses?.['200']?.headers || {};
      expect(responseHeaders['X-Next-Cursor']).toBeDefined();
      expect(responseHeaders['X-Pagination-Mode']).toBeDefined();
    });

    it('supports object description format with field descriptions', async () => {
      await db.createResource({
        name: 'orders',
        attributes: {
          id: 'string|optional',
          total: 'number|required',
          status: 'string|required'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          description: {
            resource: 'Order management endpoints',
            attributes: {
              total: 'Total order amount in cents',
              status: 'Order status (pending, paid, shipped)'
            }
          },
          guard: true
        }
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: true },
        logging: { enabled: false },
        resources: ['orders']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/openapi.json`);
      expect(response.status).toBe(200);

      const spec = await response.json();
      const ordersTag = spec.tags.find(t => t.name === 'orders');
      expect(ordersTag.description).toBe('Order management endpoints');

      // Check field descriptions in schema
      const orderSchema = spec.components.schemas.orders;
      expect(orderSchema.properties.total.description).toBe('Total order amount in cents');
      expect(orderSchema.properties.status.description).toBe('Order status (pending, paid, shipped)');
    });
  });
});
