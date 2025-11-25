import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';
import { IdentityPlugin } from '../../src/plugins/identity/index.js';

describe('Identity Onboarding - Health Check Integration', () => {
  let db;
  let plugin;
  let server;

  // Increase timeout for HTTP server binding tests
  jest.setTimeout(30000);

  beforeEach(async () => {
    db = new Database({
      client: new MemoryClient({
        bucket: 'test-identity-onboarding-health',
        keyPrefix: 'databases/test/'
      })
    });
    await db.connect();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    if (db) {
      await db.disconnect();
    }
  });

  test('/health/ready returns 503 ONBOARDING_REQUIRED before onboarding', async () => {
    plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        enabled: true, // Enable onboarding manager initialization
        mode: 'disabled' // But keep it disabled from running automatically
      },
      logLevel: 'silent'
    });

    await db.usePlugin(plugin, 'identity');

    server = plugin.server;
    await server.start();

    const port = server.port;
    const response = await fetch(`http://localhost:${port}/health/ready`);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('ONBOARDING_REQUIRED');
    expect(data.error.details.onboarding?.required).toBe(true);
    expect(data.error.details.onboarding?.adminExists).toBe(false);
  });

  test('/health/ready returns 200 OK after onboarding complete', async () => {
    plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'config',
        enabled: true, // Ensure onboarding is explicitly enabled
        admin: {
          email: 'admin@health.com',
          password: 'HealthPass123!'
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(plugin, 'identity');

    server = plugin.server;
    await server.start();

    const port = server.port;
    const response = await fetch(`http://localhost:${port}/health/ready`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('ready');
    expect(data.onboarding?.completed).toBe(true); // Check completed status
    expect(data.onboarding?.adminExists).toBe(true);
    expect(data.onboarding?.completedAt).toBeDefined();
  });

  test('/onboarding/status returns correct status before onboarding', async () => {
    plugin = new IdentityPlugin({
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

    await db.usePlugin(plugin, 'identity');

    server = plugin.server;
    await server.start();

    const port = server.port;
    const response = await fetch(`http://localhost:${port}/onboarding/status`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.completed).toBe(false);
    expect(data.data.adminExists).toBe(false);
  });

  test('/onboarding/status returns correct status after onboarding', async () => {
    plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'config',
        enabled: true, // Ensure onboarding is explicitly enabled
        admin: {
          email: 'admin@status.com',
          password: 'StatusPass123!'
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(plugin, 'identity');

    server = plugin.server;
    await server.start();

    const port = server.port;
    const response = await fetch(`http://localhost:${port}/onboarding/status`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.completed).toBe(true);
    expect(data.data.adminExists).toBe(true);
    expect(data.data.mode).toBe('config');
    expect(data.data.completedAt).toBeDefined();
  });

  test('/health/ready includes onboarding metadata in response', async () => {
    plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        mode: 'config',
        enabled: true, // Ensure onboarding is explicitly enabled
        admin: {
          email: 'admin@metadata.com',
          password: 'MetadataPass123!'
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(plugin, 'identity');

    server = plugin.server;
    await server.start();

    const port = server.port;
    const response = await fetch(`http://localhost:${port}/health/ready`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.onboarding).toBeDefined();
    expect(data.onboarding.completed).toBe(true); // Check completed status
    expect(data.onboarding.adminExists).toBe(true);
    expect(data.onboarding.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('getOnboardingStatus() public API method works', async () => {
    plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        enabled: true, // Enable onboarding manager initialization
        mode: 'disabled' // But keep it disabled from running automatically
      },
      logLevel: 'silent'
    });

    await db.usePlugin(plugin, 'identity');

    const statusBefore = await plugin.getOnboardingStatus();
    expect(statusBefore.completed).toBe(false);
    expect(statusBefore.adminExists).toBe(false);

    await plugin.completeOnboarding({
      admin: {
        email: 'admin@api.com',
        password: 'ApiPass123!'
      }
    });

    const statusAfter = await plugin.getOnboardingStatus();
    expect(statusAfter.completed).toBe(true);
    expect(statusAfter.adminExists).toBe(true);
    expect(statusAfter.completedAt).toBeDefined();
  });

  test('completeOnboarding() manually creates admin', async () => {
    plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        enabled: true, // Enable onboarding manager initialization
        mode: 'disabled' // But keep it disabled from running automatically
      },
      logLevel: 'silent'
    });

    await db.usePlugin(plugin, 'identity');

    const usersResource = db.resources.users;
    const adminsBefore = await usersResource.query({});
    expect(adminsBefore.length).toBe(0);

    await plugin.completeOnboarding({
      admin: {
        email: 'admin@manual.com',
        password: 'ManualPass123!',
        name: 'Manual Admin'
      }
    });

    const adminsAfter = await usersResource.query({ email: 'admin@manual.com' });
    expect(adminsAfter.length).toBe(1);
    expect(adminsAfter[0].name).toBe('Manual Admin');
    expect(adminsAfter[0].scopes).toContain('admin:*');
  });

  test('completeOnboarding() can create OAuth clients', async () => {
    plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        enabled: true, // Enable onboarding manager initialization
        mode: 'disabled' // But keep it disabled from running automatically
      },
      logLevel: 'silent'
    });

    await db.usePlugin(plugin, 'identity');

    await plugin.completeOnboarding({
      admin: {
        email: 'admin@clients.com',
        password: 'ClientsPass123!'
      },
      clients: [
        {
          name: 'Test Client',
          clientId: 'test-client-001',
          clientSecret: 'TestSecret123!',
          grantTypes: ['client_credentials']
        }
      ]
    });

    const clientsResource = db.resources.oauth_clients;
    const clients = await clientsResource.query({ clientId: 'test-client-001' });
    expect(clients.length).toBe(1);
    expect(clients[0].name).toBe('Test Client');
  });

  test('markOnboardingComplete() without creating admin', async () => {
    plugin = new IdentityPlugin({
      port: 0,
      issuer: 'http://localhost:4000',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      onboarding: {
        enabled: true, // Enable onboarding manager initialization
        mode: 'disabled' // But keep it disabled from running automatically
      },
      logLevel: 'silent'
    });

    await db.usePlugin(plugin, 'identity');

    const usersResource = db.resources.users;
    await usersResource.insert({
      email: 'admin@existing.com',
      password: 'ExistingPass123!',
      scopes: ['admin:*'],
      active: true
    });

    await plugin.markOnboardingComplete();

    const status = await plugin.getOnboardingStatus();
    expect(status.completed).toBe(true);
    expect(status.adminExists).toBe(true);
  });

  test('health check handles plugin without onboarding gracefully', async () => {
    const customPlugin = new IdentityPlugin({
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

    delete customPlugin.getOnboardingStatus;

    await db.usePlugin(customPlugin, 'identity');

    server = customPlugin.server;
    await server.start();

    const port = server.port;
    const response = await fetch(`http://localhost:${port}/health/ready`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.onboarding).toBeUndefined();
  });

  test('/onboarding/status returns 501 if getOnboardingStatus not available', async () => {
    const customPlugin = new IdentityPlugin({
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

    delete customPlugin.getOnboardingStatus;

    await db.usePlugin(customPlugin, 'identity');

    server = customPlugin.server;
    await server.start();

    const port = server.port;
    const response = await fetch(`http://localhost:${port}/onboarding/status`);
    const data = await response.json();

    expect(response.status).toBe(501);
    expect(data.success).toBe(false);
    expect(data.data.code).toBe('NOT_IMPLEMENTED');
  });

  test('multiple calls to /onboarding/status return consistent results', async () => {
    plugin = new IdentityPlugin({
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
          email: 'admin@consistent.com',
          password: 'ConsistentPass123!'
        }
      },
      logLevel: 'silent'
    });

    await db.usePlugin(plugin, 'identity');

    server = plugin.server;
    await server.start();

    const port = server.port;

    const response1 = await fetch(`http://localhost:${port}/onboarding/status`);
    const data1 = await response1.json();

    const response2 = await fetch(`http://localhost:${port}/onboarding/status`);
    const data2 = await response2.json();

    expect(data1).toEqual(data2);
    expect(data1.data.completed).toBe(true);
    expect(data1.data.adminExists).toBe(true);
  });
});
