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

describe('Identity Onboarding - Config Mode', () => {
  let db;

  beforeEach(async () => {
    db = new Database({
      client: new MemoryClient({
        bucket: `test-identity-onboarding-config-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
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

  test('creates admin from config object', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'config',
        admin: {
          email: 'admin@config.com',
          password: 'ConfigPass123!XYZ',
          name: 'Config Admin'
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({ email: 'admin@config.com' });

    expect(admins.length).toBe(1);
    expect(admins[0].email).toBe('admin@config.com');
    expect(admins[0].name).toBe('Config Admin');
    expect(admins[0].scopes).toContain('admin:*');
    expect(admins[0].active).toBe(true);
    expect(admins[0].metadata?.createdViaOnboarding).toBe(true);
    expect(admins[0].metadata?.onboardingMode).toBe('config');
  });

  test('creates admin with minimal config (no name)', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'config',
        admin: {
          email: 'admin@minimal.com',
          password: 'MinimalPass123!'
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({ email: 'admin@minimal.com' });

    expect(admins.length).toBe(1);
    expect(admins[0].email).toBe('admin@minimal.com');
    expect(admins[0].name).toBe('Administrator'); // Default name
    expect(admins[0].scopes).toContain('admin:*');
  });

  test('supports custom scopes in config', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'config',
        admin: {
          email: 'admin@scopes.com',
          password: 'ScopesPass123!',
          scopes: ['openid', 'profile', 'email', 'admin:*', 'custom:scope']
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({ email: 'admin@scopes.com' });

    expect(admins.length).toBe(1);
    expect(admins[0].scopes).toContain('admin:*');
    expect(admins[0].scopes).toContain('custom:scope');
  });

  test('supports custom metadata in config', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'config',
        admin: {
          email: 'admin@metadata.com',
          password: 'MetadataPass123!',
          metadata: {
            department: 'IT',
            region: 'US'
          }
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({ email: 'admin@metadata.com' });

    expect(admins.length).toBe(1);
    expect(admins[0].metadata?.department).toBe('IT');
    expect(admins[0].metadata?.region).toBe('US');
    expect(admins[0].metadata?.createdViaOnboarding).toBe(true);
  });

  test('throws error if config.admin missing', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'config'
      },
      logLevel: 'silent'
    });

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/Missing admin.email/);
  });

  test('throws error if config.admin.email missing', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'config',
        admin: {
          password: 'SecurePass123!'
        }
      },
      logLevel: 'silent'
    });

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/email/);
  });

  test('throws error if config.admin.password missing', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'config',
        admin: {
          email: 'admin@test.com'
        }
      },
      logLevel: 'silent'
    });

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/password/);
  });

  test('validates email format', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'config',
        admin: {
          email: 'invalid-email',
          password: 'SecurePass123!'
        }
      },
      logLevel: 'silent'
    });

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/valid email/);
  });

  test('validates password strength', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'config',
        admin: {
          email: 'admin@test.com',
          password: 'weak'
        }
      },
      logLevel: 'silent'
    });

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/at least 12 characters/);
  });

  test('skips onboarding if admin already exists', async () => {
    const plugin1 = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'config',
        admin: {
          email: 'admin@test.com',
          password: 'SecurePass123!'
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin1), 'identity');

    const usersResource = db.resources.users;
    const adminsBefore = await usersResource.query({});
    expect(adminsBefore.length).toBe(1);

    const db2 = new Database({
      client: db.client
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
        mode: 'config',
        admin: {
          email: 'admin2@test.com',
          password: 'AnotherPass123!'
        }
      },
      logLevel: 'silent'
    });

    await db2.usePlugin(disableServerBinding(plugin2), 'identity');

    const usersResource2 = db2.resources.users;
    const adminsAfter = await usersResource2.query({});
    expect(adminsAfter.length).toBe(1);
    expect(adminsAfter[0].email).toBe('admin@test.com');

    await db2.disconnect();
  });

  test('force mode creates second admin', async () => {
    const plugin1 = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'config',
        admin: {
          email: 'admin@test.com',
          password: 'SecurePass123!'
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin1), 'identity');

    const usersResource = db.resources.users;
    const adminsBefore = await usersResource.query({});
    expect(adminsBefore.length).toBe(1);

    const db2 = new Database({
      client: db.client
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
        mode: 'config',
        force: true,
        admin: {
          email: 'admin2@test.com',
          password: 'AnotherPass123!'
        }
      },
      logLevel: 'silent'
    });

    await db2.usePlugin(disableServerBinding(plugin2), 'identity');

    const usersResource2 = db2.resources.users;
    const adminsAfter = await usersResource2.query({});
    expect(adminsAfter.length).toBe(2);

    const emails = adminsAfter.map(a => a.email).sort();
    expect(emails).toEqual(['admin2@test.com', 'admin@test.com']);

    await db2.disconnect();
  });

  test('config mode with password from environment variable', async () => {
    process.env.ADMIN_PASSWORD_FROM_ENV = 'EnvSecurePass123!';

    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'config',
        admin: {
          email: 'admin@env-password.com',
          password: process.env.ADMIN_PASSWORD_FROM_ENV
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({ email: 'admin@env-password.com' });

    expect(admins.length).toBe(1);

    delete process.env.ADMIN_PASSWORD_FROM_ENV;
  });

  test('getOnboardingStatus returns correct status', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'config',
        admin: {
          email: 'admin@status.com',
          password: 'StatusPass123!'
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const status = await plugin.getOnboardingStatus();

    expect(status.completed).toBe(true);
    expect(status.adminExists).toBe(true);
    expect(status.mode).toBe('config');
    // expect(status.completedAt).toBeDefined(); // Storage not yet implemented
  });
});
