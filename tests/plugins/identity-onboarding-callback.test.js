import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';
import { IdentityPlugin } from '../../src/plugins/identity/index.js';

// Helper to prevent HTTP server from binding in tests
function disableServerBinding(plugin) {
  plugin.onStart = async function noopStart() {
    this.server = { start() {}, stop() {} };
  };
  plugin.onStop = async function noopStop() {};
  return plugin;
}

describe('Identity Onboarding - Callback Mode', () => {
  let db;

  beforeEach(async () => {
    db = new Database({
      client: new MemoryClient({
        bucket: `test-identity-onboarding-callback-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
        keyPrefix: 'databases/test/'
      })
    });
    await db.connect();
  });

  afterEach(async () => {
    if (db) {
      await db.disconnect();
    }
  });

  test('invokes callback function on first run', async () => {
    let callbackInvoked = false;
    let callbackContext = null;

    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'callback',
        async onFirstRun(ctx) {
          callbackInvoked = true;
          callbackContext = ctx;

          await ctx.createAdmin({
            email: 'admin@callback.com',
            password: 'CallbackPass123!',
            name: 'Callback Admin'
          });
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    expect(callbackInvoked).toBe(true);
    expect(callbackContext).toBeDefined();
    expect(callbackContext.createAdmin).toBeDefined();
    expect(callbackContext.createClient).toBeDefined();
    expect(callbackContext.logger).toBeDefined();

    const usersResource = db.resources.users;
    const admins = await usersResource.query({ email: 'admin@callback.com' });

    expect(admins.length).toBe(1);
    expect(admins[0].email).toBe('admin@callback.com');
    expect(admins[0].name).toBe('Callback Admin');
    expect(admins[0].scopes).toContain('admin:*');
  });

  test('callback can create custom admin with custom scopes', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'callback',
        async onFirstRun({ createAdmin }) {
          await createAdmin({
            email: 'superadmin@callback.com',
            password: 'SuperSecure123!',
            name: 'Super Admin',
            scopes: ['openid', 'profile', 'email', 'admin:*', 'super:admin'],
            metadata: {
              role: 'superadmin',
              createdBy: 'onboarding-callback'
            }
          });
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({ email: 'superadmin@callback.com' });

    expect(admins.length).toBe(1);
    expect(admins[0].scopes).toContain('admin:*');
    expect(admins[0].scopes).toContain('super:admin');
    expect(admins[0].metadata?.role).toBe('superadmin');
    expect(admins[0].metadata?.createdBy).toBe('onboarding-callback');
  });

  test('callback can create OAuth client', async () => {
    let createdClient = null;

    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'callback',
        async onFirstRun({ createAdmin, createClient }) {
          await createAdmin({
            email: 'admin@client.com',
            password: 'ClientPass123!'
          });

          createdClient = await createClient({
            name: 'Test Client',
            clientId: 'test-client-001',
            clientSecret: 'TestClientSecret123!',
            grantTypes: ['client_credentials', 'authorization_code'],
            redirectUris: ['http://localhost:3000/callback']
          });
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    expect(createdClient).toBeDefined();
    expect(createdClient.clientId).toBe('test-client-001');
    expect(createdClient.name).toBe('Test Client');

    const clientsResource = db.resources.oauth_clients;
    const clients = await clientsResource.query({ clientId: 'test-client-001' });

    expect(clients.length).toBe(1);
    expect(clients[0].name).toBe('Test Client');
    expect(clients[0].grantTypes).toContain('client_credentials');
    expect(clients[0].grantTypes).toContain('authorization_code');
  });

  test('callback can create multiple admins', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'callback',
        force: true,
        async onFirstRun({ createAdmin }) {
          await createAdmin({
            email: 'admin1@multi.com',
            password: 'Admin1Pass123!',
            name: 'Admin One'
          });

          await createAdmin({
            email: 'admin2@multi.com',
            password: 'Admin2Pass123!',
            name: 'Admin Two'
          });
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({});

    expect(admins.length).toBe(2);
    const emails = admins.map(a => a.email).sort();
    expect(emails).toEqual(['admin1@multi.com', 'admin2@multi.com']);
  });

  test('callback receives logger instance', async () => {
    let loggerReceived = null;

    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'callback',
        async onFirstRun({ createAdmin, logger }) {
          loggerReceived = logger;
          logger.info('Creating admin via callback');

          await createAdmin({
            email: 'admin@logger.com',
            password: 'LoggerPass123!'
          });
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    expect(loggerReceived).toBeDefined();
    expect(typeof loggerReceived.info).toBe('function');
    expect(typeof loggerReceived.error).toBe('function');
  });

  test('throws error if onFirstRun callback missing', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'callback'
      },
      logLevel: 'silent'
    });

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/onFirstRun callback/);
  });

  test('throws error if onFirstRun is not a function', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'callback',
        onFirstRun: 'not-a-function'
      },
      logLevel: 'silent'
    });

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/function/);
  });

  test('callback errors are propagated', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'callback',
        async onFirstRun() {
          throw new Error('Callback intentional error');
        }
      },
      logLevel: 'silent'
    });

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow('Callback intentional error');
  });

  test('callback can use createAdmin with invalid data and get validation error', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'callback',
        async onFirstRun({ createAdmin }) {
          await createAdmin({
            email: 'invalid-email',
            password: 'weak'
          });
        }
      },
      logLevel: 'silent'
    });

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/valid email/);
  });

  test('skips callback if admin already exists', async () => {
    let callbackInvokedFirst = false;
    let callbackInvokedSecond = false;

    const plugin1 = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'callback',
        async onFirstRun({ createAdmin }) {
          callbackInvokedFirst = true;
          await createAdmin({
            email: 'admin@skip.com',
            password: 'SkipPass123!'
          });
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin1), 'identity');

    expect(callbackInvokedFirst).toBe(true);

    const db2 = new Database({
      client: new MemoryClient({
        bucket: `test-identity-onboarding-callback-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
        keyPrefix: 'databases/test/'
      })
    });
    await db2.connect();

    const plugin2 = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'callback',
        async onFirstRun({ createAdmin }) {
          callbackInvokedSecond = true;
          await createAdmin({
            email: 'admin2@skip.com',
            password: 'Skip2Pass123!'
          });
        }
      },
      logLevel: 'silent'
    });

    await db2.usePlugin(disableServerBinding(plugin2), 'identity');

    expect(callbackInvokedSecond).toBe(false);

    const usersResource2 = db2.resources.users;
    const admins = await usersResource2.query({});
    expect(admins.length).toBe(1);
    expect(admins[0].email).toBe('admin@skip.com');

    await db2.disconnect();
  });

  test('force mode invokes callback even if admin exists', async () => {
    let callbackInvokedFirst = false;
    let callbackInvokedSecond = false;

    const plugin1 = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'callback',
        async onFirstRun({ createAdmin }) {
          callbackInvokedFirst = true;
          await createAdmin({
            email: 'admin@force.com',
            password: 'ForcePass123!'
          });
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin1), 'identity');

    expect(callbackInvokedFirst).toBe(true);

    const db2 = new Database({
      client: new MemoryClient({
        bucket: `test-identity-onboarding-callback-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
        keyPrefix: 'databases/test/'
      })
    });
    await db2.connect();

    const plugin2 = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'callback',
        force: true,
        async onFirstRun({ createAdmin }) {
          callbackInvokedSecond = true;
          await createAdmin({
            email: 'admin2@force.com',
            password: 'Force2Pass123!'
          });
        }
      },
      logLevel: 'silent'
    });

    await db2.usePlugin(disableServerBinding(plugin2), 'identity');

    expect(callbackInvokedSecond).toBe(true);

    const usersResource2 = db2.resources.users;
    const admins = await usersResource2.query({});
    expect(admins.length).toBe(2);

    await db2.disconnect();
  });

  test('callback can perform async operations', async () => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'callback',
        async onFirstRun({ createAdmin }) {
          await sleep(10);
          await createAdmin({
            email: 'admin@async.com',
            password: 'AsyncPass123!'
          });
          await sleep(10);
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({ email: 'admin@async.com' });

    expect(admins.length).toBe(1);
  });
});
