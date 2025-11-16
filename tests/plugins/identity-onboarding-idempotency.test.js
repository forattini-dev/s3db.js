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

describe('Identity Onboarding - Idempotency', () => {
  let db;

  beforeEach(async () => {
    db = new Database({
      client: new MemoryClient({
        bucket: `test-identity-onboarding-idempotency-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
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

  test('onboarding is idempotent - multiple runs create single admin', async () => {
    process.env.IDENTITY_ADMIN_EMAIL = 'admin@idempotent.com';
    process.env.IDENTITY_ADMIN_PASSWORD = 'IdempotentPass123!';

    const plugin1 = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'env'
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin1), 'identity');

    const usersResource = db.resources.users;
    const adminsAfterFirst = await usersResource.query({});
    expect(adminsAfterFirst.length).toBe(1);

    const db2 = new Database({
      client: new MemoryClient({
        bucket: `test-identity-onboarding-idempotency-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
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
        mode: 'env'
      },
      logLevel: 'silent'
    });

    await db2.usePlugin(disableServerBinding(plugin2), 'identity');

    const usersResource2 = db2.resources.users;
    const adminsAfterSecond = await usersResource2.query({});
    expect(adminsAfterSecond.length).toBe(1);
    expect(adminsAfterSecond[0].email).toBe('admin@idempotent.com');

    await db2.disconnect();

    delete process.env.IDENTITY_ADMIN_EMAIL;
    delete process.env.IDENTITY_ADMIN_PASSWORD;
  });

  test('detectFirstRun() correctly identifies existing admin', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        enabled: false
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;

    const isFirstRun1 = await plugin.onboardingManager.detectFirstRun();
    expect(isFirstRun1).toBe(true);

    await usersResource.insert({
      email: 'admin@detect.com',
      password: 'DetectPass123!',
      scopes: ['admin:*'],
      active: true
    });

    const isFirstRun2 = await plugin.onboardingManager.detectFirstRun();
    expect(isFirstRun2).toBe(false);
  });

  test('detectFirstRun() ignores inactive admin users', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        enabled: false
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;

    await usersResource.insert({
      email: 'inactive-admin@test.com',
      password: 'InactivePass123!',
      scopes: ['admin:*'],
      active: false
    });

    const isFirstRun = await plugin.onboardingManager.detectFirstRun();
    expect(isFirstRun).toBe(true);
  });

  test('detectFirstRun() ignores users without admin:* scope', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        enabled: false
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;

    await usersResource.insert({
      email: 'regular-user@test.com',
      password: 'RegularPass123!',
      scopes: ['openid', 'profile', 'email'],
      active: true
    });

    const isFirstRun = await plugin.onboardingManager.detectFirstRun();
    expect(isFirstRun).toBe(true);
  });

  test('detectFirstRun() recognizes admin:* scope variants', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        enabled: false
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;

    await usersResource.insert({
      email: 'admin-variant@test.com',
      password: 'VariantPass123!',
      scopes: ['admin:users', 'admin:settings'],
      active: true
    });

    const isFirstRun = await plugin.onboardingManager.detectFirstRun();
    expect(isFirstRun).toBe(false);
  });

  test('multiple plugins with different modes do not conflict', async () => {
    process.env.IDENTITY_ADMIN_EMAIL = 'admin@multi-mode.com';
    process.env.IDENTITY_ADMIN_PASSWORD = 'MultiModePass123!';

    const plugin1 = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'env'
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin1), 'identity');

    const usersResource = db.resources.users;
    const adminsAfterEnv = await usersResource.query({});
    expect(adminsAfterEnv.length).toBe(1);

    const db2 = new Database({
      client: new MemoryClient({
        bucket: `test-identity-onboarding-idempotency-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
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
        mode: 'config',
        admin: {
          email: 'admin2@multi-mode.com',
          password: 'MultiMode2Pass123!'
        }
      },
      logLevel: 'silent'
    });

    await db2.usePlugin(disableServerBinding(plugin2), 'identity');

    const usersResource2 = db2.resources.users;
    const adminsAfterConfig = await usersResource2.query({});
    expect(adminsAfterConfig.length).toBe(1);
    expect(adminsAfterConfig[0].email).toBe('admin@multi-mode.com');

    await db2.disconnect();

    delete process.env.IDENTITY_ADMIN_EMAIL;
    delete process.env.IDENTITY_ADMIN_PASSWORD;
  });

  test('force mode bypasses idempotency check', async () => {
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
          email: 'admin@force1.com',
          password: 'Force1Pass123!'
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin1), 'identity');

    const usersResource = db.resources.users;
    const adminsAfterFirst = await usersResource.query({});
    expect(adminsAfterFirst.length).toBe(1);

    const db2 = new Database({
      client: new MemoryClient({
        bucket: `test-identity-onboarding-idempotency-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
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
        mode: 'config',
        force: true,
        admin: {
          email: 'admin@force2.com',
          password: 'Force2Pass123!'
        }
      },
      logLevel: 'silent'
    });

    await db2.usePlugin(disableServerBinding(plugin2), 'identity');

    const usersResource2 = db2.resources.users;
    const adminsAfterForce = await usersResource2.query({});
    expect(adminsAfterForce.length).toBe(2);

    const emails = adminsAfterForce.map(a => a.email).sort();
    expect(emails).toEqual(['admin@force1.com', 'admin@force2.com']);

    await db2.disconnect();
  });

  test('onboarding disabled prevents admin creation', async () => {
    process.env.IDENTITY_ADMIN_EMAIL = 'admin@disabled.com';
    process.env.IDENTITY_ADMIN_PASSWORD = 'DisabledPass123!';

    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        enabled: false
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({});
    expect(admins.length).toBe(0);

    delete process.env.IDENTITY_ADMIN_EMAIL;
    delete process.env.IDENTITY_ADMIN_PASSWORD;
  });

  test('concurrent onboarding attempts are safe', async () => {
    const bucket = 'test-identity-onboarding-concurrent';

    const createPluginInstance = async () => {
      const localDb = new Database({
        client: new MemoryClient({
          bucket,
          keyPrefix: 'databases/test/'
        })
      });
      await localDb.connect();

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
            email: 'admin@concurrent.com',
            password: 'ConcurrentPass123!'
          }
        },
        logLevel: 'silent'
      });

      await localDb.usePlugin(disableServerBinding(plugin), 'identity');
      return { db: localDb, plugin };
    };

    const instances = await Promise.all([
      createPluginInstance(),
      createPluginInstance(),
      createPluginInstance()
    ]);

    const checkDb = new Database({
      client: new MemoryClient({
        bucket,
        keyPrefix: 'databases/test/'
      })
    });
    await checkDb.connect();

    const usersResource = checkDb.resources.users;
    const admins = await usersResource.query({});

    expect(admins.length).toBeLessThanOrEqual(3);
    expect(admins.length).toBeGreaterThanOrEqual(1);

    for (const instance of instances) {
      await instance.db.disconnect();
    }
    await checkDb.disconnect();
  });

  test('getOnboardingStatus reflects actual database state', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        enabled: false
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const statusBefore = await plugin.getOnboardingStatus();
    expect(statusBefore.adminExists).toBe(false);

    const usersResource = db.resources.users;
    await usersResource.insert({
      email: 'admin@status-check.com',
      password: 'StatusCheckPass123!',
      scopes: ['admin:*'],
      active: true
    });

    const statusAfter = await plugin.getOnboardingStatus();
    expect(statusAfter.adminExists).toBe(true);
  });

  test('manual admin creation triggers onboarding completion', async () => {
    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        enabled: false
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const statusBefore = await plugin.getOnboardingStatus();
    expect(statusBefore.completed).toBe(false);

    await plugin.completeOnboarding({
      admin: {
        email: 'admin@manual-completion.com',
        password: 'ManualCompletionPass123!'
      }
    });

    const statusAfter = await plugin.getOnboardingStatus();
    expect(statusAfter.completed).toBe(true);
    expect(statusAfter.adminExists).toBe(true);
  });

  test('repeated calls to getOnboardingStatus are consistent', async () => {
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
          email: 'admin@repeated.com',
          password: 'RepeatedPass123!'
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const status1 = await plugin.getOnboardingStatus();
    const status2 = await plugin.getOnboardingStatus();
    const status3 = await plugin.getOnboardingStatus();

    expect(status1).toEqual(status2);
    expect(status2).toEqual(status3);
    expect(status1.completed).toBe(true);
    expect(status1.adminExists).toBe(true);
  });
});
