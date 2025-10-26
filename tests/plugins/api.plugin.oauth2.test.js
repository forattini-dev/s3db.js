/**
 * OAuth2/OIDC Integration Tests
 *
 * Testa o fluxo completo:
 * 1. SSO Server emite tokens
 * 2. Resource Servers validam tokens
 * 3. Múltiplos resource servers com mesmo token
 * 4. Validação de scopes
 * 5. Token expirado/inválido
 */

import Database from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';
import { OAuth2Server } from '../../src/plugins/api/auth/oauth2-server.js';
import { OIDCClient } from '../../src/plugins/api/auth/oidc-client.js';

describe('OAuth2/OIDC Integration Tests', () => {
  let ssoDb, ordersDb, productsDb;
  let ssoServer, ordersApp, productsApp;
  let oauth2, ordersOidc, productsOidc;
  let testClient, testUser;

  // Ports
  const SSO_PORT = 4000;
  const ORDERS_PORT = 4001;
  const PRODUCTS_PORT = 4002;

  const SSO_URL = `http://localhost:${SSO_PORT}`;
  const ORDERS_URL = `http://localhost:${ORDERS_PORT}`;
  const PRODUCTS_URL = `http://localhost:${PRODUCTS_PORT}`;

  beforeAll(async () => {
    const { MemoryClient } = await import('../../src/clients/memory-client.class.js');

    // ========================================
    // 1. Setup SSO Server (Authorization Server)
    // ========================================
    ssoDb = new Database({
      client: new MemoryClient(),
      bucketName: 'oauth2-sso-test',
      encryptionKey: 'test-sso-key'
    });

    await ssoDb.connect();

    // Create users resource
    const usersResource = await ssoDb.createResource({
      name: 'users',
      attributes: {
        email: 'string|required',
        password: 'secret|required',
        name: 'string',
        scopes: 'array|items:string',
        active: 'boolean'
      }
    });

    // Create OAuth keys resource
    const keysResource = await ssoDb.createResource({
      name: 'oauth_keys',
      attributes: {
        kid: 'string|required',
        publicKey: 'string|required',
        privateKey: 'secret|required',
        algorithm: 'string',
        use: 'string',
        active: 'boolean',
        createdAt: 'string'
      }
    });

    // Create OAuth clients resource
    const clientsResource = await ssoDb.createResource({
      name: 'oauth_clients',
      attributes: {
        clientId: 'string|required',
        clientSecret: 'secret|required',
        name: 'string',
        allowedScopes: 'array|items:string',
        allowedGrantTypes: 'array|items:string'
      }
    });

    // Initialize OAuth2 server
    oauth2 = new OAuth2Server({
      issuer: SSO_URL,
      keyResource: keysResource,
      userResource: usersResource,
      clientResource: clientsResource,
      supportedScopes: ['openid', 'profile', 'email', 'orders:read', 'orders:write', 'products:read', 'products:write'],
      supportedGrantTypes: ['client_credentials', 'refresh_token'],
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d'
    });

    await oauth2.initialize();

    // Create test user
    testUser = await usersResource.insert({
      email: 'test@example.com',
      password: 'test123',
      name: 'Test User',
      scopes: ['orders:read', 'orders:write', 'products:read'],
      active: true
    });

    // Create test OAuth client
    testClient = await clientsResource.insert({
      clientId: 'test-client',
      clientSecret: 'test-secret',
      name: 'Test Client',
      allowedScopes: ['openid', 'profile', 'email', 'orders:read', 'orders:write', 'products:read', 'products:write'],
      allowedGrantTypes: ['client_credentials', 'refresh_token']
    });

    // Setup SSO API
    const ssoApi = new ApiPlugin({
      port: SSO_PORT,
      apiPrefix: '',
      cors: { origin: '*' }
    });

    ssoApi.addRoute({
      path: '/.well-known/openid-configuration',
      method: 'GET',
      handler: oauth2.discoveryHandler.bind(oauth2),
      auth: false
    });

    ssoApi.addRoute({
      path: '/.well-known/jwks.json',
      method: 'GET',
      handler: oauth2.jwksHandler.bind(oauth2),
      auth: false
    });

    ssoApi.addRoute({
      path: '/auth/token',
      method: 'POST',
      handler: oauth2.tokenHandler.bind(oauth2),
      auth: false
    });

    ssoApi.addRoute({
      path: '/auth/userinfo',
      method: 'GET',
      handler: oauth2.userinfoHandler.bind(oauth2),
      auth: false
    });

    ssoApi.addRoute({
      path: '/auth/introspect',
      method: 'POST',
      handler: oauth2.introspectHandler.bind(oauth2),
      auth: false
    });

    await ssoDb.use(ssoApi);
    ssoServer = ssoApi.server;

    // Wait for SSO server to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    // ========================================
    // 2. Setup Orders API (Resource Server)
    // ========================================
    ordersDb = new Database({
      client: new MemoryClient(),
      bucketName: 'oauth2-orders-test',
      encryptionKey: 'test-orders-key'
    });

    await ordersDb.connect();

    const ordersResource = await ordersDb.createResource({
      name: 'orders',
      attributes: {
        userId: 'string|required',
        productId: 'string|required',
        total: 'number|required',
        status: 'string'
      }
    });

    // Initialize OIDC client
    ordersOidc = new OIDCClient({
      issuer: SSO_URL,
      audience: ORDERS_URL,
      jwksCacheTTL: 3600000,
      autoRefreshJWKS: false
    });

    await ordersOidc.initialize();

    // Setup Orders API
    const ordersApi = new ApiPlugin({
      port: ORDERS_PORT,
      apiPrefix: '',
      cors: { origin: '*' }
    });

    ordersApi.addAuthDriver('oidc', ordersOidc.middleware.bind(ordersOidc));

    ordersApi.addRoute({
      path: '/health',
      method: 'GET',
      handler: (req, res) => res.json({ status: 'ok' }),
      auth: false
    });

    ordersApi.addRoute({
      path: '/orders',
      method: 'GET',
      handler: async (req, res) => {
        const userId = req.user.sub;
        const scopes = req.user.scope.split(' ');

        if (!scopes.includes('orders:read')) {
          return res.status(403).json({ error: 'Insufficient scopes' });
        }

        const orders = await ordersResource.query({ userId });
        res.json({ orders, user: { id: userId, scopes } });
      },
      auth: 'oidc'
    });

    ordersApi.addRoute({
      path: '/orders',
      method: 'POST',
      handler: async (req, res) => {
        const userId = req.user.sub;
        const scopes = req.user.scope.split(' ');

        if (!scopes.includes('orders:write')) {
          return res.status(403).json({ error: 'Insufficient scopes' });
        }

        const order = await ordersResource.insert({
          userId,
          productId: req.body.productId,
          total: req.body.total,
          status: 'pending'
        });

        res.status(201).json(order);
      },
      auth: 'oidc'
    });

    await ordersDb.use(ordersApi);
    ordersApp = ordersApi.server;

    // ========================================
    // 3. Setup Products API (Resource Server)
    // ========================================
    productsDb = new Database({
      client: new MemoryClient(),
      bucketName: 'oauth2-products-test',
      encryptionKey: 'test-products-key'
    });

    await productsDb.connect();

    const productsResource = await productsDb.createResource({
      name: 'products',
      attributes: {
        name: 'string|required',
        price: 'number|required',
        sku: 'string|required'
      }
    });

    // Initialize OIDC client
    productsOidc = new OIDCClient({
      issuer: SSO_URL,
      audience: PRODUCTS_URL,
      jwksCacheTTL: 3600000,
      autoRefreshJWKS: false
    });

    await productsOidc.initialize();

    // Setup Products API
    const productsApi = new ApiPlugin({
      port: PRODUCTS_PORT,
      apiPrefix: '',
      cors: { origin: '*' }
    });

    productsApi.addAuthDriver('oidc', productsOidc.middleware.bind(productsOidc));

    productsApi.addRoute({
      path: '/health',
      method: 'GET',
      handler: (req, res) => res.json({ status: 'ok' }),
      auth: false
    });

    productsApi.addRoute({
      path: '/products',
      method: 'GET',
      handler: async (req, res) => {
        const products = await productsResource.list({ limit: 100 });
        res.json({ products });
      },
      auth: false
    });

    productsApi.addRoute({
      path: '/products',
      method: 'POST',
      handler: async (req, res) => {
        const scopes = req.user.scope.split(' ');

        if (!scopes.includes('products:write')) {
          return res.status(403).json({ error: 'Insufficient scopes' });
        }

        const product = await productsResource.insert(req.body);
        res.status(201).json(product);
      },
      auth: 'oidc'
    });

    await productsDb.use(productsApi);
    productsApp = productsApi.server;

    // Wait for all servers to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Cleanup
    if (ordersOidc) ordersOidc.destroy();
    if (productsOidc) productsOidc.destroy();

    if (ssoServer) await new Promise(resolve => ssoServer.close(resolve));
    if (ordersApp) await new Promise(resolve => ordersApp.close(resolve));
    if (productsApp) await new Promise(resolve => productsApp.close(resolve));

    if (ssoDb) await ssoDb.disconnect();
    if (ordersDb) await ordersDb.disconnect();
    if (productsDb) await productsDb.disconnect();
  });

  describe('SSO Server (Authorization Server)', () => {
    test('GET /.well-known/openid-configuration returns discovery document', async () => {
      const response = await fetch(`${SSO_URL}/.well-known/openid-configuration`);
      expect(response.status).toBe(200);

      const discovery = await response.json();
      expect(discovery.issuer).toBe(SSO_URL);
      expect(discovery.jwks_uri).toBe(`${SSO_URL}/.well-known/jwks.json`);
      expect(discovery.token_endpoint).toBe(`${SSO_URL}/auth/token`);
      expect(discovery.scopes_supported).toContain('openid');
      expect(discovery.grant_types_supported).toContain('client_credentials');
    });

    test('GET /.well-known/jwks.json returns public keys', async () => {
      const response = await fetch(`${SSO_URL}/.well-known/jwks.json`);
      expect(response.status).toBe(200);

      const jwks = await response.json();
      expect(jwks.keys).toBeDefined();
      expect(Array.isArray(jwks.keys)).toBe(true);
      expect(jwks.keys.length).toBeGreaterThan(0);

      const key = jwks.keys[0];
      expect(key.kty).toBe('RSA');
      expect(key.use).toBe('sig');
      expect(key.alg).toBe('RS256');
      expect(key.kid).toBeDefined();
      expect(key.n).toBeDefined(); // modulus
      expect(key.e).toBeDefined(); // exponent
    });

    test('POST /auth/token with client_credentials grant returns access token', async () => {
      const response = await fetch(`${SSO_URL}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: testClient.clientId,
          client_secret: 'test-secret',
          scope: 'openid orders:read orders:write'
        })
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.access_token).toBeDefined();
      expect(data.token_type).toBe('Bearer');
      expect(data.expires_in).toBe(900); // 15 minutes
      expect(data.scope).toBe('openid orders:read orders:write');

      // Verify token structure
      const parts = data.access_token.split('.');
      expect(parts.length).toBe(3);

      // Decode payload
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      expect(payload.iss).toBe(SSO_URL);
      expect(payload.scope).toBe('openid orders:read orders:write');
      expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    test('POST /auth/token with invalid client_secret returns 401', async () => {
      const response = await fetch(`${SSO_URL}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: testClient.clientId,
          client_secret: 'wrong-secret',
          scope: 'openid'
        })
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe('invalid_client');
    });

    test('POST /auth/token with unsupported grant_type returns 400', async () => {
      const response = await fetch(`${SSO_URL}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: testClient.clientId,
          client_secret: 'test-secret'
        })
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('unsupported_grant_type');
    });

    test('POST /auth/token with invalid scope returns 400', async () => {
      const response = await fetch(`${SSO_URL}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: testClient.clientId,
          client_secret: 'test-secret',
          scope: 'invalid:scope'
        })
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('invalid_scope');
    });
  });

  describe('Resource Server - Orders API', () => {
    let validToken;

    beforeAll(async () => {
      // Get valid token from SSO
      const response = await fetch(`${SSO_URL}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: testClient.clientId,
          client_secret: 'test-secret',
          scope: 'openid orders:read orders:write'
        })
      });

      const data = await response.json();
      validToken = data.access_token;
    });

    test('GET /health is publicly accessible', async () => {
      const response = await fetch(`${ORDERS_URL}/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('ok');
    });

    test('GET /orders without token returns 401', async () => {
      const response = await fetch(`${ORDERS_URL}/orders`);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe('unauthorized');
    });

    test('GET /orders with valid token returns 200', async () => {
      const response = await fetch(`${ORDERS_URL}/orders`, {
        headers: { Authorization: `Bearer ${validToken}` }
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.orders).toBeDefined();
      expect(Array.isArray(data.orders)).toBe(true);
      expect(data.user).toBeDefined();
      expect(data.user.scopes).toContain('orders:read');
    });

    test('POST /orders with valid token and correct scope creates order', async () => {
      const response = await fetch(`${ORDERS_URL}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productId: 'product-123',
          total: 99.99
        })
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.id).toBeDefined();
      expect(data.productId).toBe('product-123');
      expect(data.total).toBe(99.99);
      expect(data.status).toBe('pending');
    });

    test('GET /orders with malformed token returns 401', async () => {
      const response = await fetch(`${ORDERS_URL}/orders`, {
        headers: { Authorization: 'Bearer invalid.token.here' }
      });

      expect(response.status).toBe(401);
    });

    test('GET /orders with token from wrong issuer returns 401', async () => {
      // Create fake token with different issuer
      const fakeToken = validToken.split('.');
      const payload = JSON.parse(Buffer.from(fakeToken[1], 'base64url').toString());
      payload.iss = 'http://fake-issuer.com';
      fakeToken[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const tamperedToken = fakeToken.join('.');

      const response = await fetch(`${ORDERS_URL}/orders`, {
        headers: { Authorization: `Bearer ${tamperedToken}` }
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Resource Server - Products API', () => {
    let tokenWithProductsWrite;
    let tokenWithoutProductsWrite;

    beforeAll(async () => {
      // Token with products:write scope
      const response1 = await fetch(`${SSO_URL}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: testClient.clientId,
          client_secret: 'test-secret',
          scope: 'openid products:write'
        })
      });

      const data1 = await response1.json();
      tokenWithProductsWrite = data1.access_token;

      // Token WITHOUT products:write scope
      const response2 = await fetch(`${SSO_URL}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: testClient.clientId,
          client_secret: 'test-secret',
          scope: 'openid orders:read'
        })
      });

      const data2 = await response2.json();
      tokenWithoutProductsWrite = data2.access_token;
    });

    test('GET /products is publicly accessible', async () => {
      const response = await fetch(`${PRODUCTS_URL}/products`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.products).toBeDefined();
      expect(Array.isArray(data.products)).toBe(true);
    });

    test('POST /products without token returns 401', async () => {
      const response = await fetch(`${PRODUCTS_URL}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Widget', price: 29.99, sku: 'WDG-001' })
      });

      expect(response.status).toBe(401);
    });

    test('POST /products with correct scope creates product', async () => {
      const response = await fetch(`${PRODUCTS_URL}/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenWithProductsWrite}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Widget',
          price: 29.99,
          sku: 'WDG-001'
        })
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.id).toBeDefined();
      expect(data.name).toBe('Widget');
      expect(data.price).toBe(29.99);
    });

    test('POST /products with insufficient scope returns 403', async () => {
      const response = await fetch(`${PRODUCTS_URL}/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenWithoutProductsWrite}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Widget',
          price: 29.99,
          sku: 'WDG-002'
        })
      });

      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.error).toBe('Insufficient scopes');
    });
  });

  describe('Cross-API Token Usage', () => {
    test('Same token works on multiple resource servers', async () => {
      // Get token with both orders and products scopes
      const tokenResponse = await fetch(`${SSO_URL}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: testClient.clientId,
          client_secret: 'test-secret',
          scope: 'openid orders:read orders:write products:write'
        })
      });

      const { access_token } = await tokenResponse.json();

      // Use token on Orders API
      const ordersResponse = await fetch(`${ORDERS_URL}/orders`, {
        headers: { Authorization: `Bearer ${access_token}` }
      });

      expect(ordersResponse.status).toBe(200);

      // Use SAME token on Products API
      const productsResponse = await fetch(`${PRODUCTS_URL}/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Cross-API Test',
          price: 49.99,
          sku: 'CROSS-001'
        })
      });

      expect(productsResponse.status).toBe(201);
    });
  });

  describe('Token Introspection', () => {
    let validToken;

    beforeAll(async () => {
      const response = await fetch(`${SSO_URL}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: testClient.clientId,
          client_secret: 'test-secret',
          scope: 'openid orders:read'
        })
      });

      const data = await response.json();
      validToken = data.access_token;
    });

    test('POST /auth/introspect with valid token returns active=true', async () => {
      const response = await fetch(`${SSO_URL}/auth/introspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: validToken })
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.active).toBe(true);
      expect(data.scope).toBe('openid orders:read');
      expect(data.iss).toBe(SSO_URL);
    });

    test('POST /auth/introspect with invalid token returns active=false', async () => {
      const response = await fetch(`${SSO_URL}/auth/introspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: 'invalid.token.here' })
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.active).toBe(false);
    });
  });
});
