import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';
import { IdentityPlugin } from '../../src/plugins/identity/index.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';

describe('Identity & API Plugin Integration', () => {
  let identityDb;
  let apiDb;
  let identityPlugin;
  let apiPlugin;
  let identityServer;
  let apiServer;
  let issuerUrl;
  let apiUrl;

  beforeAll(async () => {
    const identityClient = new MemoryClient({ bucket: 'identity-test' });
    identityDb = new Database({ client: identityClient });
    await identityDb.connect();

    const apiClient = new MemoryClient({ bucket: 'api-test' });
    apiDb = new Database({ client: apiClient });
    await apiDb.connect();

    identityPlugin = new IdentityPlugin({
      issuer: 'http://localhost:9876',
      port: 9876,
      adminUsername: 'admin',
      adminPassword: 'testpass123',
      logLevel: 'silent',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'clients' }
      }
    });

    await identityDb.usePlugin(identityPlugin, 'identity');
    await identityPlugin.initialize();

    identityServer = await identityPlugin.startServer();
    issuerUrl = 'http://localhost:9876';

    apiPlugin = new ApiPlugin({
      port: 9877,
      identityIntegration: {
        enabled: true,
        url: issuerUrl,
        autoProvision: true,
        require: false
      },
      logLevel: 'silent'
    });

    await apiDb.usePlugin(apiPlugin, 'api');
    await apiPlugin.initialize();

    apiServer = await apiPlugin.startServer();
    apiUrl = 'http://localhost:9877';
  });

  afterAll(async () => {
    if (identityServer) await identityPlugin.stopServer();
    if (apiServer) await apiPlugin.stopServer();
    if (identityDb) await identityDb.disconnect();
    if (apiDb) await apiDb.disconnect();
  });

  describe('Integration Metadata Discovery', () => {
    it('should expose s3db-identity.json metadata endpoint', async () => {
      const response = await fetch(`${issuerUrl}/.well-known/s3db-identity.json`);
      expect(response.status).toBe(200);

      const metadata = await response.json();
      expect(metadata).toMatchObject({
        version: 1,
        issuer: issuerUrl,
        discoveryUrl: `${issuerUrl}/.well-known/openid-configuration`,
        jwksUrl: `${issuerUrl}/.well-known/jwks.json`
      });

      expect(metadata.resources).toHaveProperty('users');
      expect(metadata.resources).toHaveProperty('clients');
      expect(metadata.resources).toHaveProperty('tenants');
    });

    it('should support ETag-based caching for metadata endpoint', async () => {
      const response1 = await fetch(`${issuerUrl}/.well-known/s3db-identity.json`);
      const etag = response1.headers.get('etag');
      expect(etag).toBeTruthy();

      const response2 = await fetch(`${issuerUrl}/.well-known/s3db-identity.json`, {
        headers: { 'if-none-match': etag }
      });
      expect(response2.status).toBe(304);
    });

    it('should expose integration metadata via plugin registry', () => {
      const registeredPlugin = identityDb.pluginRegistry.identity;
      expect(registeredPlugin).toBe(identityPlugin);
      expect(registeredPlugin.integration).toBeTruthy();
      expect(registeredPlugin.integration.issuer).toBe(issuerUrl);
    });
  });

  describe('API Plugin Identity Detection', () => {
    it('should detect remote Identity plugin via HTTPS', async () => {
      expect(apiPlugin.identityMode).toBe(true);
      expect(apiPlugin.identityMetadata).toBeTruthy();
      expect(apiPlugin.identityMetadata.issuer).toBe(issuerUrl);
    });

    it('should initialize OIDC client from metadata', async () => {
      expect(apiPlugin.oidcClient).toBeTruthy();
      expect(apiPlugin.oidcClient.issuer).toBe(issuerUrl);
    });

    it('should provide identity status endpoint', async () => {
      const status = await apiPlugin.getIdentityStatus();
      expect(status).toMatchObject({
        enabled: true,
        mode: 'remote',
        issuer: issuerUrl,
        healthy: true
      });
    });
  });

  describe('Service Account Token Claims', () => {
    let serviceAccountToken;
    let clientId;
    let clientSecret;

    beforeAll(async () => {
      const client = await identityPlugin.clientsResource.insert({
        clientId: 'test-service-account',
        clientSecret: 'test-secret-123',
        name: 'Test Service Account',
        grantTypes: ['client_credentials'],
        allowedScopes: ['read:resources', 'write:resources'],
        active: true
      });

      clientId = client.clientId;
      clientSecret = client.clientSecret;

      const tokenResponse = await fetch(`${issuerUrl}/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'read:resources write:resources'
        })
      });

      const tokenData = await tokenResponse.json();
      serviceAccountToken = tokenData.access_token;
    });

    it('should include token_type=service in service account tokens', async () => {
      const introspectResponse = await fetch(`${issuerUrl}/oauth2/introspect`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: serviceAccountToken,
          client_id: clientId,
          client_secret: clientSecret
        })
      });

      const introspection = await introspectResponse.json();
      expect(introspection.active).toBe(true);
      expect(introspection.token_type).toBe('service');
    });

    it('should include service_account claim with metadata', async () => {
      const introspectResponse = await fetch(`${issuerUrl}/oauth2/introspect`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: serviceAccountToken,
          client_id: clientId,
          client_secret: clientSecret
        })
      });

      const introspection = await introspectResponse.json();
      expect(introspection.service_account).toMatchObject({
        clientId: 'test-service-account',
        name: 'Test Service Account',
        scopes: expect.arrayContaining(['read:resources', 'write:resources'])
      });
    });

    it('should format subject as sa:clientId for service accounts', async () => {
      const introspectResponse = await fetch(`${issuerUrl}/oauth2/introspect`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: serviceAccountToken,
          client_id: clientId,
          client_secret: clientSecret
        })
      });

      const introspection = await introspectResponse.json();
      expect(introspection.sub).toBe('sa:test-service-account');
    });
  });

  describe('User Token Claims', () => {
    let userToken;
    let userId;
    let clientId;

    beforeAll(async () => {
      const tenant = await identityPlugin.tenantsResource.insert({
        name: 'Test Tenant',
        active: true
      });

      const user = await identityPlugin.usersResource.insert({
        email: 'testuser@example.com',
        password: 'password123',
        tenantId: tenant.id,
        active: true
      });
      userId = user.id;

      const client = await identityPlugin.clientsResource.insert({
        clientId: 'test-web-client',
        clientSecret: 'test-secret-456',
        name: 'Test Web Client',
        grantTypes: ['authorization_code'],
        redirectUris: ['http://localhost:3000/callback'],
        allowedScopes: ['openid', 'profile', 'email'],
        active: true
      });
      clientId = client.clientId;

      const authResponse = await fetch(`${issuerUrl}/oauth2/authorize`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          response_type: 'code',
          client_id: clientId,
          redirect_uri: 'http://localhost:3000/callback',
          scope: 'openid profile email',
          email: 'testuser@example.com',
          password: 'password123'
        })
      });

      const authData = await authResponse.json();
      const code = authData.code;

      const tokenResponse = await fetch(`${issuerUrl}/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          client_id: clientId,
          client_secret: 'test-secret-456',
          redirect_uri: 'http://localhost:3000/callback'
        })
      });

      const tokenData = await tokenResponse.json();
      userToken = tokenData.access_token;
    });

    it('should include token_type=user in user tokens', async () => {
      const introspectResponse = await fetch(`${issuerUrl}/oauth2/introspect`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: userToken,
          client_id: clientId,
          client_secret: 'test-secret-456'
        })
      });

      const introspection = await introspectResponse.json();
      expect(introspection.active).toBe(true);
      expect(introspection.token_type).toBe('user');
    });

    it('should include email claim for user tokens', async () => {
      const introspectResponse = await fetch(`${issuerUrl}/oauth2/introspect`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: userToken,
          client_id: clientId,
          client_secret: 'test-secret-456'
        })
      });

      const introspection = await introspectResponse.json();
      expect(introspection.email).toBe('testuser@example.com');
    });

    it('should include tenantId claim for user tokens', async () => {
      const introspectResponse = await fetch(`${issuerUrl}/oauth2/introspect`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: userToken,
          client_id: clientId,
          client_secret: 'test-secret-456'
        })
      });

      const introspection = await introspectResponse.json();
      expect(introspection.tenantId).toBeTruthy();
    });
  });

  describe('Identity Context Middleware', () => {
    let serviceAccountToken;
    let userToken;

    beforeAll(async () => {
      const serviceClient = await identityPlugin.clientsResource.insert({
        clientId: 'test-sa-middleware',
        clientSecret: 'test-secret-sa',
        name: 'Test SA',
        grantTypes: ['client_credentials'],
        allowedScopes: ['api:read'],
        active: true
      });

      const saTokenResponse = await fetch(`${issuerUrl}/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: 'test-sa-middleware',
          client_secret: 'test-secret-sa',
          scope: 'api:read'
        })
      });
      const saTokenData = await saTokenResponse.json();
      serviceAccountToken = saTokenData.access_token;

      const tenant = await identityPlugin.tenantsResource.insert({
        name: 'Test Tenant 2',
        active: true
      });

      await identityPlugin.usersResource.insert({
        email: 'middleware-test@example.com',
        password: 'password123',
        tenantId: tenant.id,
        active: true
      });

      const webClient = await identityPlugin.clientsResource.insert({
        clientId: 'test-web-middleware',
        clientSecret: 'test-secret-web',
        name: 'Test Web',
        grantTypes: ['authorization_code'],
        redirectUris: ['http://localhost:3000/callback'],
        allowedScopes: ['openid'],
        active: true
      });

      const authResponse = await fetch(`${issuerUrl}/oauth2/authorize`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          response_type: 'code',
          client_id: 'test-web-middleware',
          redirect_uri: 'http://localhost:3000/callback',
          scope: 'openid',
          email: 'middleware-test@example.com',
          password: 'password123'
        })
      });

      const authData = await authResponse.json();

      const tokenResponse = await fetch(`${issuerUrl}/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: authData.code,
          client_id: 'test-web-middleware',
          client_secret: 'test-secret-web',
          redirect_uri: 'http://localhost:3000/callback'
        })
      });

      const tokenData = await tokenResponse.json();
      userToken = tokenData.access_token;
    });

    it('should detect service accounts via isServiceAccount()', async () => {
      await apiDb.createResource({
        name: 'test_items',
        attributes: {
          name: { type: 'string' }
        }
      });

      apiPlugin.app.get('/test/check-service-account', async (c) => {
        const identity = c.get('identity');
        return c.json({ isServiceAccount: identity.isServiceAccount() });
      });

      const response = await fetch(`${apiUrl}/test/check-service-account`, {
        headers: { authorization: `Bearer ${serviceAccountToken}` }
      });

      const data = await response.json();
      expect(data.isServiceAccount).toBe(true);
    });

    it('should detect users via isUser()', async () => {
      apiPlugin.app.get('/test/check-user', async (c) => {
        const identity = c.get('identity');
        return c.json({ isUser: identity.isUser() });
      });

      const response = await fetch(`${apiUrl}/test/check-user`, {
        headers: { authorization: `Bearer ${userToken}` }
      });

      const data = await response.json();
      expect(data.isUser).toBe(true);
    });

    it('should extract service account metadata via getServiceAccount()', async () => {
      apiPlugin.app.get('/test/get-service-account', async (c) => {
        const identity = c.get('identity');
        return c.json({ sa: identity.getServiceAccount() });
      });

      const response = await fetch(`${apiUrl}/test/get-service-account`, {
        headers: { authorization: `Bearer ${serviceAccountToken}` }
      });

      const data = await response.json();
      expect(data.sa).toMatchObject({
        clientId: 'test-sa-middleware',
        name: 'Test SA'
      });
    });

    it('should extract user metadata via getUser()', async () => {
      apiPlugin.app.get('/test/get-user', async (c) => {
        const identity = c.get('identity');
        return c.json({ user: identity.getUser() });
      });

      const response = await fetch(`${apiUrl}/test/get-user`, {
        headers: { authorization: `Bearer ${userToken}` }
      });

      const data = await response.json();
      expect(data.user).toMatchObject({
        email: 'middleware-test@example.com',
        token_type: 'user'
      });
    });
  });

  describe('Service Account Provisioning', () => {
    it('should provision service account via in-process Identity plugin', async () => {
      const inProcessDb = new Database({ client: new MemoryClient({ bucket: 'in-process-test' }) });
      await inProcessDb.connect();

      const inProcessIdentity = new IdentityPlugin({
        issuer: 'http://localhost:9878',
        port: 9878,
        adminUsername: 'admin',
        adminPassword: 'test',
        logLevel: 'silent',
        resources: {
          users: { name: 'users' },
          tenants: { name: 'tenants' },
          clients: { name: 'clients' }
        }
      });

      await inProcessDb.usePlugin(inProcessIdentity, 'identity');
      await inProcessIdentity.initialize();

      const inProcessApi = new ApiPlugin({
        port: 9879,
        identityIntegration: {
          enabled: true,
          autoProvision: true
        },
        logLevel: 'silent'
      });

      await inProcessDb.usePlugin(inProcessApi, 'api');
      await inProcessApi.initialize();

      const result = await inProcessApi.provisionServiceAccount({
        name: 'Test Provisioned SA',
        scopes: ['api:read', 'api:write'],
        audiences: ['http://localhost:9879']
      });

      expect(result).toMatchObject({
        clientId: expect.any(String),
        clientSecret: expect.any(String),
        name: 'Test Provisioned SA',
        scopes: ['api:read', 'api:write']
      });

      const client = await inProcessIdentity.clientsResource.get({ clientId: result.clientId });
      expect(client.name).toBe('Test Provisioned SA');
      expect(client.allowedScopes).toEqual(['api:read', 'api:write']);

      await inProcessDb.disconnect();
    });

    it('should throw error when provisioning without Identity integration', async () => {
      const standaloneDb = new Database({ client: new MemoryClient({ bucket: 'standalone-test' }) });
      await standaloneDb.connect();

      const standaloneApi = new ApiPlugin({
        port: 9880,
        identityIntegration: { enabled: false },
        logLevel: 'silent'
      });

      await standaloneDb.usePlugin(standaloneApi, 'api');
      await standaloneApi.initialize();

      await expect(
        standaloneApi.provisionServiceAccount({ name: 'Test' })
      ).rejects.toThrow(/Identity integration not enabled/);

      await standaloneDb.disconnect();
    });
  });

  describe('Audit Trail for Service Accounts', () => {
    let auditPlugin;

    beforeAll(async () => {
      const { AuditPlugin } = await import('../../src/plugins/audit.plugin.js');
      auditPlugin = new AuditPlugin({ logLevel: 'silent' });
      await identityDb.usePlugin(auditPlugin, 'audit');
      await auditPlugin.initialize();
      identityPlugin.auditPlugin = auditPlugin;
    });

    it('should emit audit event on service account creation', async () => {
      const initialCount = await auditPlugin.auditResource.query({ action: 'service_account_created' });

      await fetch(`${issuerUrl}/ui/clients`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${Buffer.from('admin:testpass123').toString('base64')}`
        },
        body: new URLSearchParams({
          clientId: 'audit-test-sa',
          clientSecret: 'audit-secret',
          name: 'Audit Test SA',
          grantTypes: 'client_credentials',
          allowedScopes: 'api:read'
        })
      });

      const afterCount = await auditPlugin.auditResource.query({ action: 'service_account_created' });
      expect(afterCount.length).toBe(initialCount.length + 1);

      const latestAudit = afterCount[afterCount.length - 1];
      expect(latestAudit.metadata.clientName).toBe('Audit Test SA');
      expect(latestAudit.metadata.clientId).toBe('audit-test-sa');
    });

    it('should emit audit event on secret rotation', async () => {
      const client = await identityPlugin.clientsResource.insert({
        clientId: 'rotation-test',
        clientSecret: 'old-secret',
        name: 'Rotation Test',
        grantTypes: ['client_credentials'],
        allowedScopes: ['api:read'],
        active: true
      });

      const initialCount = await auditPlugin.auditResource.query({ action: 'service_account_rotated' });

      await fetch(`${issuerUrl}/ui/clients/${client.id}/rotate`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from('admin:testpass123').toString('base64')}`
        }
      });

      const afterCount = await auditPlugin.auditResource.query({ action: 'service_account_rotated' });
      expect(afterCount.length).toBe(initialCount.length + 1);
    });

    it('should emit audit event on service account deletion', async () => {
      const client = await identityPlugin.clientsResource.insert({
        clientId: 'delete-test',
        clientSecret: 'delete-secret',
        name: 'Delete Test',
        grantTypes: ['client_credentials'],
        allowedScopes: ['api:read'],
        active: true
      });

      const initialCount = await auditPlugin.auditResource.query({ action: 'service_account_deleted' });

      await fetch(`${issuerUrl}/ui/clients/${client.id}`, {
        method: 'DELETE',
        headers: {
          authorization: `Basic ${Buffer.from('admin:testpass123').toString('base64')}`
        }
      });

      const afterCount = await auditPlugin.auditResource.query({ action: 'service_account_deleted' });
      expect(afterCount.length).toBe(initialCount.length + 1);
    });
  });
});
