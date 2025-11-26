import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';
import { IdentityPlugin } from '../../src/plugins/identity/index.js';

// Set a longer timeout for this complex integration test
jest.setTimeout(300000);

describe('Identity Plugin Integration Features', () => {
  let db;
  let identityPlugin;

  beforeAll(async () => {
    const client = new MemoryClient({ bucket: 'identity-integration-test' });
    db = new Database({ client });
    await db.connect();

    identityPlugin = new IdentityPlugin({
      issuer: 'http://localhost:9999',
      port: 0,  // Dynamic port
      adminUsername: 'admin',
      adminPassword: 'testpass123',
      logLevel: 'debug',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'clients' }
      },
      failban: { enabled: false },  // Disable failban to avoid CronManager dependency
      session: { enableCleanup: false },  // Disable session cleanup
      onboarding: { enabled: false }, // Disable onboarding for tests
      email: { enabled: false }, // Disable email service
      mfa: { enabled: false }, // Disable MFA
      audit: { enabled: false }, // Disable audit plugin
      rateLimit: { enabled: false } // Disable rate limiting
    });

    await db.usePlugin(identityPlugin, 'identity');
    await identityPlugin.initialize();
  });

  afterAll(async () => {
    if (db) await db.disconnect();
  });

  describe('Plugin Registry Exposure', () => {
    it('should register Identity plugin in database plugin registry', () => {
      expect(db.pluginRegistry).toBeDefined();
      expect(db.pluginRegistry.identity).toBe(identityPlugin);
    });

    it('should expose integration metadata via plugin.integration getter', () => {
      const integration = identityPlugin.integration;

      expect(integration).toBeDefined();
      expect(integration.version).toBe(1);
      expect(integration.issuer).toBe('http://localhost:9999');
      expect(integration.discoveryUrl).toBe('http://localhost:9999/.well-known/openid-configuration');
      expect(integration.jwksUrl).toBe('http://localhost:9999/.well-known/jwks.json');
    });

    it('should include OAuth2 endpoints in integration metadata', () => {
      const integration = identityPlugin.integration;

      expect(integration.tokenUrl).toBe('http://localhost:9999/oauth2/token');
      expect(integration.authorizationUrl).toBe('http://localhost:9999/oauth2/authorize');
      expect(integration.introspectionUrl).toBe('http://localhost:9999/oauth2/introspect');
      expect(integration.revocationUrl).toBe('http://localhost:9999/oauth2/revoke');
    });

    it('should include resource names in integration metadata', () => {
      const integration = identityPlugin.integration;

      expect(integration.resources).toBeDefined();
      expect(integration.resources.users).toBe('users');
      expect(integration.resources.tenants).toBe('tenants');
      expect(integration.resources.clients).toBe('clients');
    });

    it('should include cache TTL in metadata', () => {
      const integration = identityPlugin.integration;

      expect(integration.cacheTtl).toBe(3600);
      expect(integration.issuedAt).toBeDefined();
    });
  });

  describe('Integration Metadata Method', () => {
    it('should return fresh metadata on each call', () => {
      const meta1 = identityPlugin.getIntegrationMetadata();
      const meta2 = identityPlugin.getIntegrationMetadata();

      // Should return same structure
      expect(meta1.issuer).toBe(meta2.issuer);
      expect(meta1.version).toBe(meta2.version);

      // issuedAt timestamp should be different
      expect(meta1.issuedAt).not.toBe(meta2.issuedAt);
    });
  });

  describe('Service Account Token Claims', () => {
    let clientId;
    let clientSecret;
    let token;

    beforeAll(async () => {
      // Create service account OAuth client
      const client = await identityPlugin.clientsResource.insert({
        clientId: 'test-service-account',
        clientSecret: 'test-secret-123',
        name: 'Test Service Account',
        grantTypes: ['client_credentials'],
        redirectUris: [],  // Not needed for client_credentials
        allowedScopes: ['read:api', 'write:api'],
        active: true
      });

      clientId = client.clientId;
      clientSecret = client.clientSecret;

      // Simulate token endpoint call for client credentials flow
      const req = {
        body: {
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'read:api write:api'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn((data) => data)
      };

      await identityPlugin.oauth2Server.tokenHandler(req, res);
      token = res.json.mock.results[0].value;
    });

    it('should include token_type=service in service account tokens', () => {
      const decoded = identityPlugin.keyManager.verifyToken(token.access_token);

      expect(decoded.token_type).toBe('service');
    });

    it('should include service_account claim with metadata', () => {
      const decoded = identityPlugin.keyManager.verifyToken(token.access_token);

      expect(decoded.service_account).toBeDefined();
      expect(decoded.service_account.clientId).toBe('test-service-account');
      expect(decoded.service_account.name).toBe('Test Service Account');
      expect(decoded.service_account.scopes).toContain('read:api');
      expect(decoded.service_account.scopes).toContain('write:api');
    });

    it('should format subject as sa:clientId for service accounts', () => {
      const decoded = identityPlugin.keyManager.verifyToken(token.access_token);

      expect(decoded.sub).toBe('sa:test-service-account');
    });
  });

  describe('User Token Claims', () => {
    let userId;
    let tenantId;
    let clientId;
    let token;

    beforeAll(async () => {
      // Create tenant
      const tenant = await identityPlugin.tenantsResource.insert({
        name: 'Test Tenant',
        slug: 'test-tenant',
        active: true
      });
      tenantId = tenant.id;

      // Create user
      const user = await identityPlugin.usersResource.insert({
        email: 'testuser@example.com',
        password: 'password123',
        tenantId: tenantId,
        active: true
      });
      userId = user.id;

      // Create OAuth client for authorization_code flow
      const client = await identityPlugin.clientsResource.insert({
        clientId: 'test-web-app',
        clientSecret: 'test-secret-web',
        name: 'Test Web App',
        grantTypes: ['authorization_code'],
        redirectUris: ['http://localhost:3000/callback'],
        allowedScopes: ['openid', 'profile', 'email'],
        active: true
      });
      clientId = client.clientId;

      // Simulate authorization code flow - POST to /oauth/authorize
      const authReq = {
        body: {
          response_type: 'code',
          client_id: clientId,
          redirect_uri: 'http://localhost:3000/callback',
          scope: 'openid profile email',
          username: 'testuser@example.com',
          password: 'password123'
        }
      };
      const authRes = {
        status: jest.fn().mockReturnThis(),
        redirect: jest.fn((url) => url)
      };

      await identityPlugin.oauth2Server.authorizePostHandler(authReq, authRes);
      const redirectUrl = new URL(authRes.redirect.mock.results[0].value);
      const authCode = redirectUrl.searchParams.get('code');

      // Exchange code for token - POST to /oauth/token
      const tokenReq = {
        body: {
          grant_type: 'authorization_code',
          code: authCode,
          client_id: clientId,
          client_secret: 'test-secret-web',
          redirect_uri: 'http://localhost:3000/callback'
        }
      };
      const tokenRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn((data) => data)
      };

      await identityPlugin.oauth2Server.tokenHandler(tokenReq, tokenRes);
      token = tokenRes.json.mock.results[0].value;
    });

    it('should include token_type=user in user tokens', () => {
      const decoded = identityPlugin.keyManager.verifyToken(token.access_token);

      expect(decoded.token_type).toBe('user');
    });

    it('should include email claim for user tokens', () => {
      const decoded = identityPlugin.keyManager.verifyToken(token.access_token);

      expect(decoded.email).toBe('testuser@example.com');
    });

    it('should include tenantId claim for user tokens', () => {
      const decoded = identityPlugin.keyManager.verifyToken(token.access_token);

      expect(decoded.tenantId).toBe(tenantId);
    });

    it('should use user ID as subject for user tokens', () => {
      const decoded = identityPlugin.keyManager.verifyToken(token.access_token);

      expect(decoded.sub).toBe(userId);
      expect(decoded.sub).not.toMatch(/^sa:/);  // Should not have service account prefix
    });
  });
