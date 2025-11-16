import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import Database from '../../src/database.class.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';
import { IdentityPlugin } from '../../src/plugins/identity/index.js';

function createMockResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return data;
    },
    body(data, code) {
      this.statusCode = code ?? this.statusCode;
      this.payload = data;
      return data;
    }
  };
}

function stripClientSecrets(client) {
  const sanitized = { ...client };
  delete sanitized.clientSecret;
  delete sanitized.secret;
  delete sanitized.secrets;
  return sanitized;
}

describe('IdentityPlugin integration metadata & tokens', () => {
  let db;
  let identityPlugin;
  let oauthServer;
  let usersResource;
  let clientsResource;
  let serviceClient;
  let userClient;

  beforeAll(async () => {
    MemoryClient.clearAllStorage();
    db = new Database({
      client: new MemoryClient(),
      bucketName: 'identity-plugin-tests',
      encryptionKey: 'test-identity-key-32-characters!!',
      logLevel: 'error'
    });
    await db.connect();

    identityPlugin = new IdentityPlugin({
      port: 0,
      host: '127.0.0.1',
      issuer: 'http://127.0.0.1:4444',
      logLevel: 'error',
      session: { enableCleanup: false },
      onboarding: { enabled: false },
      supportedScopes: ['openid', 'profile', 'email', 'offline_access', 'orders:read'],
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'plg_oauth_clients' }
      }
    });

    // Avoid binding an actual HTTP port during tests
    identityPlugin.onStart = async function noopStart() {
      this.server = { start() {}, stop() {} };
    };
    identityPlugin.onStop = async function noopStop() {};

    await db.usePlugin(identityPlugin);

    oauthServer = identityPlugin.oauth2Server;
    usersResource = db.resources.users;
    clientsResource = db.resources.plg_oauth_clients;

    // Seed service account client
    serviceClient = await clientsResource.insert({
      clientId: 'svc-client',
      clientSecret: 'svc-secret',
      name: 'Service Client',
      metadata: { audiences: ['https://api.example.com'] },
      allowedScopes: ['orders:read'],
      grantTypes: ['client_credentials'],
      redirectUris: [], // Not needed for client_credentials but required by schema
      active: true
    });

    // Seed confidential client for password/refresh flows
    userClient = await clientsResource.insert({
      clientId: 'app-client',
      clientSecret: 'app-secret',
      name: 'App Client',
      redirectUris: ['https://app.example.com/callback'],
      allowedScopes: ['openid', 'profile', 'email', 'offline_access'],
      grantTypes: ['password', 'refresh_token'],
      active: true
    });

    // Seed user
    await usersResource.insert({
      email: 'user@example.com',
      password: 'StrongPassw0rd!',
      name: 'Example User',
      tenantId: 'tenant-001',
      roles: ['admin'],
      scopes: ['openid', 'profile', 'email'],
      active: true
    });
  });

  afterAll(async () => {
    await identityPlugin?.onStop();
    await db?.disconnect();
  });

  it('exposes integration metadata with canonical resources', () => {
    const metadata = identityPlugin.getIntegrationMetadata();
    expect(metadata.issuer).toBe('http://127.0.0.1:4444');
    expect(metadata.resources.users).toBe('users');
    expect(metadata.resources.clients).toBe('plg_oauth_clients');
    expect(metadata.clientRegistration.url).toBe('http://127.0.0.1:4444/oauth/register');
    expect(metadata.supportedScopes).toContain('orders:read');

    const registryMetadata = db.pluginRegistry.identity.integration;
    expect(registryMetadata.issuer).toBe('http://127.0.0.1:4444');
  });

  it('creates service-account tokens with token_use=service and metadata', async () => {
    const req = { body: {} };
    const res = createMockResponse();
    await oauthServer.handleClientCredentials(req, res, {
      client: stripClientSecrets(serviceClient),
      client_id: serviceClient.clientId,
      scope: 'orders:read'
    });

    expect(res.statusCode).toBe(200);
    const { access_token: token } = res.payload;
    expect(token).toBeTruthy();

    const verified = await oauthServer.keyManager.verifyToken(token);
    const { payload } = verified;

    expect(payload.token_use).toBe('service');
    expect(payload.client_id).toBe(serviceClient.clientId);
    expect(payload.service_account).toMatchObject({
      client_id: serviceClient.clientId,
      name: serviceClient.name
    });
    expect(payload.service_account.scopes).toEqual(['orders:read']);
  });

  it('creates user tokens with token_use=user and embeds client_id', async () => {
    const req = {
      body: {
        username: 'user@example.com',
        password: 'StrongPassw0rd!',
        scope: 'openid profile offline_access'
      }
    };
    const res = createMockResponse();

    await oauthServer.handlePasswordGrant(req, res, {
      client: stripClientSecrets(userClient)
    });

    expect(res.statusCode).toBe(200);
    const { access_token: token } = res.payload;
    const verified = await oauthServer.keyManager.verifyToken(token);
    const { payload } = verified;

    expect(payload.token_use).toBe('user');
    expect(payload.client_id).toBe(userClient.clientId);
    expect(payload.user).toMatchObject({
      id: expect.any(String),
      email: 'user@example.com',
      tenantId: 'tenant-001'
    });
  });

  it('introspection exposes service_account block', async () => {
    // Issue a service token first
    const req = { body: {} };
    const res = createMockResponse();
    await oauthServer.handleClientCredentials(req, res, {
      client: stripClientSecrets(serviceClient),
      client_id: serviceClient.clientId,
      scope: 'orders:read'
    });

    const serviceToken = res.payload.access_token;
    const introspectReq = { body: { token: serviceToken } };
    const introspectRes = createMockResponse();

    await oauthServer.introspectHandler(introspectReq, introspectRes);

    expect(introspectRes.statusCode).toBe(200);
    expect(introspectRes.payload.active).toBe(true);
    expect(introspectRes.payload.token_use).toBe('service');
    expect(introspectRes.payload.service_account).toMatchObject({
      client_id: serviceClient.clientId,
      name: serviceClient.name
    });
  });
});
