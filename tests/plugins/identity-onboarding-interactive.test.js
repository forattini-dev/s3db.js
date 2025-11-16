import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
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

describe('Identity Onboarding - Interactive Mode', () => {
  let db;
  let mockEnquirer;
  let originalStdin;
  let originalStdout;

  beforeEach(async () => {
    db = new Database({
      client: new MemoryClient({
        bucket: 'test-identity-onboarding-interactive',
        keyPrefix: 'databases/test/'
      })
    });
    await db.connect();

    originalStdin = process.stdin.isTTY;
    originalStdout = process.stdout.isTTY;
    process.stdin.isTTY = true;
    process.stdout.isTTY = true;

    mockEnquirer = {
      Input: jest.fn(),
      Password: jest.fn()
    };
  });

  afterEach(async () => {
    if (db) {
      await db.disconnect();
    }

    process.stdin.isTTY = originalStdin;
    process.stdout.isTTY = originalStdout;

    jest.clearAllMocks();
    jest.resetModules();
  });

  test('prompts for email, password, and name interactively', async () => {
    mockEnquirer.Input.mockImplementation((options) => {
      return {
        run: async () => {
          if (options.name === 'email') return 'admin@interactive.com';
          if (options.name === 'name') return 'Interactive Admin';
          return '';
        }
      };
    });

    mockEnquirer.Password.mockImplementation((options) => {
      return {
        run: async () => {
          if (options.name === 'password') return 'InteractivePass123!';
          if (options.name === 'confirmPassword') return 'InteractivePass123!';
          return '';
        }
      };
    });

    jest.unstable_mockModule('enquirer', () => mockEnquirer);

    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'interactive'
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({ email: 'admin@interactive.com' });

    expect(admins.length).toBe(1);
    expect(admins[0].email).toBe('admin@interactive.com');
    expect(admins[0].name).toBe('Interactive Admin');
    expect(admins[0].scopes).toContain('admin:*');
  });

  test('retries password prompt on mismatch', async () => {
    let passwordAttempt = 0;

    mockEnquirer.Input.mockImplementation((options) => {
      return {
        run: async () => {
          if (options.name === 'email') return 'admin@retry.com';
          if (options.name === 'name') return 'Retry Admin';
          return '';
        }
      };
    });

    mockEnquirer.Password.mockImplementation((options) => {
      return {
        run: async () => {
          passwordAttempt++;

          if (passwordAttempt === 1 && options.name === 'password') return 'FirstPass123!';
          if (passwordAttempt === 2 && options.name === 'confirmPassword') return 'DifferentPass123!';

          if (passwordAttempt === 3 && options.name === 'password') return 'CorrectPass123!';
          if (passwordAttempt === 4 && options.name === 'confirmPassword') return 'CorrectPass123!';

          return '';
        }
      };
    });

    jest.unstable_mockModule('enquirer', () => mockEnquirer);

    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'interactive'
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({ email: 'admin@retry.com' });

    expect(admins.length).toBe(1);
    expect(passwordAttempt).toBe(4); // 2 attempts (password + confirm each)
  });

  test('validates password strength interactively', async () => {
    let passwordAttempt = 0;

    mockEnquirer.Input.mockImplementation((options) => {
      return {
        run: async () => {
          if (options.name === 'email') return 'admin@strength.com';
          if (options.name === 'name') return 'Strength Admin';
          return '';
        }
      };
    });

    mockEnquirer.Password.mockImplementation((options) => {
      return {
        run: async () => {
          passwordAttempt++;

          if (passwordAttempt === 1 && options.name === 'password') return 'weak';
          if (passwordAttempt === 2 && options.name === 'confirmPassword') return 'weak';

          if (passwordAttempt === 3 && options.name === 'password') return 'StrongPass123!';
          if (passwordAttempt === 4 && options.name === 'confirmPassword') return 'StrongPass123!';

          return '';
        }
      };
    });

    jest.unstable_mockModule('enquirer', () => mockEnquirer);

    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'interactive'
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({ email: 'admin@strength.com' });

    expect(admins.length).toBe(1);
  });

  test('fails after max password attempts', async () => {
    let passwordAttempt = 0;

    mockEnquirer.Input.mockImplementation((options) => {
      return {
        run: async () => {
          if (options.name === 'email') return 'admin@maxattempts.com';
          if (options.name === 'name') return 'Max Attempts Admin';
          return '';
        }
      };
    });

    mockEnquirer.Password.mockImplementation((options) => {
      return {
        run: async () => {
          passwordAttempt++;
          if (options.name === 'password') return 'weak';
          if (options.name === 'confirmPassword') return 'weak';
          return '';
        }
      };
    });

    jest.unstable_mockModule('enquirer', () => mockEnquirer);

    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'interactive',
        interactive: {
          maxPasswordAttempts: 3
        }
      },
      logLevel: 'silent'
    });

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/Max password attempts/);
  });

  test('skips interactive mode if not TTY', async () => {
    process.stdin.isTTY = false;
    process.stdout.isTTY = false;

    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'interactive'
      },
      logLevel: 'silent'
    });

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/TTY/);
  });

  test('throws error if enquirer not installed', async () => {
    jest.unstable_mockModule('enquirer', () => {
      throw new Error('Cannot find module 'enquirer'');
    });

    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'interactive'
      },
      logLevel: 'silent'
    });

    await expect(db.usePlugin(disableServerBinding(plugin), 'identity')).rejects.toThrow(/enquirer/);
  });

  test('uses default name if empty provided', async () => {
    mockEnquirer.Input.mockImplementation((options) => {
      return {
        run: async () => {
          if (options.name === 'email') return 'admin@default-name.com';
          if (options.name === 'name') return ''; // Empty name
          return '';
        }
      };
    });

    mockEnquirer.Password.mockImplementation((options) => {
      return {
        run: async () => {
          if (options.name === 'password') return 'DefaultNamePass123!';
          if (options.name === 'confirmPassword') return 'DefaultNamePass123!';
          return '';
        }
      };
    });

    jest.unstable_mockModule('enquirer', () => mockEnquirer);

    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'interactive'
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({ email: 'admin@default-name.com' });

    expect(admins.length).toBe(1);
    expect(admins[0].name).toBe('Administrator'); // Default
  });

  test('validates email format interactively', async () => {
    let emailAttempt = 0;

    mockEnquirer.Input.mockImplementation((options) => {
      return {
        run: async () => {
          if (options.name === 'email') {
            emailAttempt++;
            if (emailAttempt === 1) return 'invalid-email';
            return 'valid@email.com';
          }
          if (options.name === 'name') return 'Valid Email Admin';
          return '';
        }
      };
    });

    mockEnquirer.Password.mockImplementation((options) => {
      return {
        run: async () => {
          if (options.name === 'password') return 'ValidEmailPass123!';
          if (options.name === 'confirmPassword') return 'ValidEmailPass123!';
          return '';
        }
      };
    });

    jest.unstable_mockModule('enquirer', () => mockEnquirer);

    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'interactive'
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({ email: 'valid@email.com' });

    expect(admins.length).toBe(1);
    expect(emailAttempt).toBe(2); // Retried once
  });

  test('skips interactive mode if admin already exists', async () => {
    mockEnquirer.Input.mockImplementation((options) => {
      return {
        run: async () => {
          if (options.name === 'email') return 'admin@first.com';
          if (options.name === 'name') return 'First Admin';
          return '';
        }
      };
    });

    mockEnquirer.Password.mockImplementation((options) => {
      return {
        run: async () => {
          if (options.name === 'password') return 'FirstPass123!';
          if (options.name === 'confirmPassword') return 'FirstPass123!';
          return '';
        }
      };
    });

    jest.unstable_mockModule('enquirer', () => mockEnquirer);

    const plugin1 = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'interactive'
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin1), 'identity');

    const usersResource = db.resources.users;
    const adminsBefore = await usersResource.query({});
    expect(adminsBefore.length).toBe(1);

    const db2 = new Database({
      client: new MemoryClient({
        bucket: 'test-identity-onboarding-interactive',
        keyPrefix: 'databases/test/'
      })
    });
    await db2.connect();

    let enquirerCalled = false;
    mockEnquirer.Input.mockImplementation((options) => {
      enquirerCalled = true;
      return { run: async () => '' };
    });

    const plugin2 = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'interactive'
      },
      logLevel: 'silent'
    });

    await db2.usePlugin(disableServerBinding(plugin2), 'identity');

    expect(enquirerCalled).toBe(false); // Should not prompt

    const usersResource2 = db2.resources.users;
    const adminsAfter = await usersResource2.query({});
    expect(adminsAfter.length).toBe(1);

    await db2.disconnect();
  });

  test('custom interactive banner message', async () => {
    mockEnquirer.Input.mockImplementation((options) => {
      return {
        run: async () => {
          if (options.name === 'email') return 'admin@banner.com';
          if (options.name === 'name') return 'Banner Admin';
          return '';
        }
      };
    });

    mockEnquirer.Password.mockImplementation((options) => {
      return {
        run: async () => {
          if (options.name === 'password') return 'BannerPass123!';
          if (options.name === 'confirmPassword') return 'BannerPass123!';
          return '';
        }
      };
    });

    jest.unstable_mockModule('enquirer', () => mockEnquirer);

    const plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'interactive',
        interactive: {
          bannerMessage: 'Custom Setup Message'
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(disableServerBinding(plugin), 'identity');

    const usersResource = db.resources.users;
    const admins = await usersResource.query({ email: 'admin@banner.com' });

    expect(admins.length).toBe(1);
  });
});
