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

describe('Identity Onboarding - Environment Mode', () => {
  let db;
  let originalEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    delete process.env.IDENTITY_ADMIN_EMAIL;
    delete process.env.IDENTITY_ADMIN_PASSWORD;
    delete process.env.IDENTITY_ADMIN_NAME;
    delete process.env.IDENTITY_ADMIN_EMAIL_FILE;
    delete process.env.IDENTITY_ADMIN_PASSWORD_FILE;

    db = new Database({
      client: new MemoryClient({
        bucket: `test-identity-onboarding-env-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
        keyPrefix: 'databases/test/'
      })
    });
    await db.connect();
  });

  afterEach(async () => {
    process.env = originalEnv;
    if (db) {
      await db.disconnect();
    }
  });

  test('creates admin from environment variables', async () => {
    process.env.IDENTITY_ADMIN_EMAIL = 'admin@test.com';
    process.env.IDENTITY_ADMIN_PASSWORD = 'SecurePass123!XYZ';
    process.env.IDENTITY_ADMIN_NAME = 'Test Admin';

    const plugin = new IdentityPlugin({
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

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({ email: 'admin@test.com' });

    expect(admins.length).toBe(1);
    expect(admins[0].email).toBe('admin@test.com');
    expect(admins[0].name).toBe('Test Admin');
    expect(admins[0].scopes).toContain('admin:*');
    expect(admins[0].active).toBe(true);
    expect(admins[0].metadata?.createdViaOnboarding).toBe(true);
    expect(admins[0].metadata?.onboardingMode).toBe('env');
  });

  test('creates admin with minimal env vars (no name)', async () => {
    process.env.IDENTITY_ADMIN_EMAIL = 'admin@minimal.com';
    process.env.IDENTITY_ADMIN_PASSWORD = 'SecurePass123!XYZ';

    const plugin = new IdentityPlugin({
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

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({ email: 'admin@minimal.com' });

    expect(admins.length).toBe(1);
    expect(admins[0].email).toBe('admin@minimal.com');
    expect(admins[0].name).toBe('Administrator'); // Default name
    expect(admins[0].scopes).toContain('admin:*');
  });

  test('throws error if IDENTITY_ADMIN_EMAIL missing', async () => {
    process.env.IDENTITY_ADMIN_PASSWORD = 'SecurePass123!XYZ';

    const plugin = new IdentityPlugin({
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

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/IDENTITY_ADMIN_EMAIL/);
  });

  test('throws error if IDENTITY_ADMIN_PASSWORD missing', async () => {
    process.env.IDENTITY_ADMIN_EMAIL = 'admin@test.com';

    const plugin = new IdentityPlugin({
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

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/IDENTITY_ADMIN_PASSWORD/);
  });

  test('validates email format', async () => {
    process.env.IDENTITY_ADMIN_EMAIL = 'invalid-email';
    process.env.IDENTITY_ADMIN_PASSWORD = 'SecurePass123!XYZ';

    const plugin = new IdentityPlugin({
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

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/valid email/);
  });

  test('validates password strength - too short', async () => {
    process.env.IDENTITY_ADMIN_EMAIL = 'admin@test.com';
    process.env.IDENTITY_ADMIN_PASSWORD = 'Short1!';

    const plugin = new IdentityPlugin({
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

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/at least 12 characters/);
  });

  test('validates password strength - missing uppercase', async () => {
    process.env.IDENTITY_ADMIN_EMAIL = 'admin@test.com';
    process.env.IDENTITY_ADMIN_PASSWORD = 'securepass123!';

    const plugin = new IdentityPlugin({
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

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/uppercase letter/);
  });

  test('validates password strength - missing lowercase', async () => {
    process.env.IDENTITY_ADMIN_EMAIL = 'admin@test.com';
    process.env.IDENTITY_ADMIN_PASSWORD = 'SECUREPASS123!';

    const plugin = new IdentityPlugin({
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

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/lowercase letter/);
  });

  test('validates password strength - missing number', async () => {
    process.env.IDENTITY_ADMIN_EMAIL = 'admin@test.com';
    process.env.IDENTITY_ADMIN_PASSWORD = 'SecurePassword!';

    const plugin = new IdentityPlugin({
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

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/number/);
  });

  test('validates password strength - missing symbol', async () => {
    process.env.IDENTITY_ADMIN_EMAIL = 'admin@test.com';
    process.env.IDENTITY_ADMIN_PASSWORD = 'SecurePass123';

    const plugin = new IdentityPlugin({
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

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/special character/);
  });

  test('skips onboarding if admin already exists', async () => {
    process.env.IDENTITY_ADMIN_EMAIL = 'admin@test.com';
    process.env.IDENTITY_ADMIN_PASSWORD = 'SecurePass123!XYZ';

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
    const adminsBefore = await usersResource.query({ email: 'admin@test.com' });
    expect(adminsBefore.length).toBe(1);

    process.env.IDENTITY_ADMIN_EMAIL = 'admin2@test.com';
    process.env.IDENTITY_ADMIN_PASSWORD = 'AnotherPass123!';

    const db2 = new Database({
      client: new MemoryClient({
        bucket: `test-identity-onboarding-env-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
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
    const adminsAfter = await usersResource2.query({});
    expect(adminsAfter.length).toBe(1);
    expect(adminsAfter[0].email).toBe('admin@test.com');

    await db2.disconnect();
  });

  test('force mode creates second admin even if one exists', async () => {
    process.env.IDENTITY_ADMIN_EMAIL = 'admin@test.com';
    process.env.IDENTITY_ADMIN_PASSWORD = 'SecurePass123!XYZ';

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
    const adminsBefore = await usersResource.query({});
    expect(adminsBefore.length).toBe(1);

    process.env.IDENTITY_ADMIN_EMAIL = 'admin2@test.com';
    process.env.IDENTITY_ADMIN_PASSWORD = 'AnotherPass123!';

    const db2 = new Database({
      client: new MemoryClient({
        bucket: `test-identity-onboarding-env-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
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
        mode: 'env',
        force: true
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

  test('can be disabled with onboarding.enabled = false', async () => {
    process.env.IDENTITY_ADMIN_EMAIL = 'admin@test.com';
    process.env.IDENTITY_ADMIN_PASSWORD = 'SecurePass123!XYZ';

    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        enabled: false,
        mode: 'env'
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({});

    expect(admins.length).toBe(0);
  });

  test('getOnboardingStatus returns correct status after completion', async () => {
    process.env.IDENTITY_ADMIN_EMAIL = 'admin@test.com';
    process.env.IDENTITY_ADMIN_PASSWORD = 'SecurePass123!XYZ';

    const plugin = new IdentityPlugin({
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

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const status = await plugin.getOnboardingStatus();

    expect(status.completed).toBe(true);
    expect(status.adminExists).toBe(true);
    expect(status.mode).toBe('env');
    expect(status.completedAt).toBeDefined();
  });

  test('custom password policy - different min length', async () => {
    process.env.IDENTITY_ADMIN_EMAIL = 'admin@test.com';
    process.env.IDENTITY_ADMIN_PASSWORD = 'Pass1!23';

    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'env',
        passwordPolicy: {
          minLength: 8
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({ email: 'admin@test.com' });

    expect(admins.length).toBe(1);
  });

  test('custom password policy - disable special char requirement', async () => {
    process.env.IDENTITY_ADMIN_EMAIL = 'admin@test.com';
    process.env.IDENTITY_ADMIN_PASSWORD = 'SecurePass123';

    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'env',
        passwordPolicy: {
          requireSpecialChar: false
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({ email: 'admin@test.com' });

    expect(admins.length).toBe(1);
  });
});
