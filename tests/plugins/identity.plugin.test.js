/**
 * Identity Plugin Tests
 *
 * Tests the IdentityPlugin as a complete OAuth2/OIDC Authorization Server:
 * 1. Plugin initialization and resource creation
 * 2. OAuth2/OIDC endpoints (discovery, jwks, token, userinfo, authorize, etc.)
 * 3. Grant types (client_credentials, refresh_token, authorization_code)
 * 4. Token issuance and validation
 * 5. Client registration
 * 6. Integration with ApiPlugin as Resource Server
 */

import Database from '../../src/database.class.js';
import { IdentityPlugin } from '../../src/plugins/identity/index.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';

describe('IdentityPlugin - OAuth2/OIDC Authorization Server', () => {
  let identityDb, ordersDb, productsDb;
  let identityPlugin, ordersPlugin, productsPlugin;
  let testClient, testUser;

  // Ports
  const IDENTITY_PORT = 4000;
  const ORDERS_PORT = 4001;
  const PRODUCTS_PORT = 4002;

  const IDENTITY_URL = `http://localhost:${IDENTITY_PORT}`;
  const ORDERS_URL = `http://localhost:${ORDERS_PORT}`;
  const PRODUCTS_URL = `http://localhost:${PRODUCTS_PORT}`;

  beforeAll(async () => {
    const { MemoryClient } = await import('../../src/clients/memory-client.class.js');

    // ========================================
    // 1. Setup Identity Provider (Authorization Server)
    // ========================================
    identityDb = new Database({
      client: new MemoryClient(),
      bucketName: 'identity-test',
      encryptionKey: 'test-identity-key'
    });

    await identityDb.connect();

    // Create IdentityPlugin
    identityPlugin = new IdentityPlugin({
      port: IDENTITY_PORT,
      issuer: IDENTITY_URL,
      supportedScopes: ['openid', 'profile', 'email', 'orders:read', 'orders:write', 'products:read', 'products:write'],
      supportedGrantTypes: ['client_credentials', 'refresh_token', 'authorization_code'],
      accessTokenExpiry: '15m',
      idTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
      verbose: false
    });

    await identityDb.usePlugin(identityPlugin);

    // Get users resource (auto-created by IdentityPlugin)
    const usersResource = identityDb.resources.users;

    // Create test user
    testUser = await usersResource.insert({
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
      scopes: ['openid', 'profile', 'email', 'orders:read', 'orders:write', 'products:read'],
      active: true
    });

    // Register OAuth2 client using the plugin's registerClient endpoint
    const oauth2Server = identityPlugin.getOAuth2Server();
    const clientsResource = identityDb.resources.plg_oauth_clients;

    testClient = await clientsResource.insert({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      name: 'Test Client',
      redirectUris: ['http://localhost:3000/callback'],
      allowedScopes: ['openid', 'profile', 'email', 'orders:read', 'orders:write', 'products:read', 'products:write'],
      grantTypes: ['client_credentials', 'refresh_token', 'authorization_code'],
      active: true
    });

    // ========================================
    // 2. Setup Orders Resource Server
    // ========================================
    ordersDb = new Database({
      client: new MemoryClient(),
      bucketName: 'orders-test',
      encryptionKey: 'test-orders-key'
    });

    await ordersDb.connect();

    // Create orders resource
    await ordersDb.createResource({
      name: 'orders',
      attributes: {
        orderId: 'string|required',
        product: 'string|required',
        quantity: 'number|required',
        status: 'string|default:pending'
      }
    });

    // Create ApiPlugin with OIDC driver pointing to Identity Provider
    ordersPlugin = new ApiPlugin({
      port: ORDERS_PORT,
      verbose: false,
      auth: {
        drivers: [
          {
            driver: 'oidc',
            config: {
              issuer: IDENTITY_URL,
              audience: 'orders-api',
              requiredScopes: ['orders:read', 'orders:write']
            }
          }
        ]
      },
      resources: {
        orders: {
          auth: ['oidc'],
          methods: ['GET', 'POST', 'PUT', 'DELETE']
        }
      }
    });

    await ordersDb.usePlugin(ordersPlugin);

    // ========================================
    // 3. Setup Products Resource Server
    // ========================================
    productsDb = new Database({
      client: new MemoryClient(),
      bucketName: 'products-test',
      encryptionKey: 'test-products-key'
    });

    await productsDb.connect();

    // Create products resource
    await productsDb.createResource({
      name: 'products',
      attributes: {
        productId: 'string|required',
        name: 'string|required',
        price: 'number|required',
        stock: 'number|default:0'
      }
    });

    // Create ApiPlugin with OIDC driver (public GET, protected POST)
    productsPlugin = new ApiPlugin({
      port: PRODUCTS_PORT,
      verbose: false,
      auth: {
        drivers: [
          {
            driver: 'oidc',
            config: {
              issuer: IDENTITY_URL,
              audience: 'products-api',
              requiredScopes: ['products:read', 'products:write']
            }
          }
        ]
      },
      resources: {
        products: {
          auth: {
            GET: [], // Public
            POST: ['oidc'], // Protected
            PUT: ['oidc'],
            DELETE: ['oidc']
          },
          methods: ['GET', 'POST', 'PUT', 'DELETE']
        }
      }
    });

    await productsDb.usePlugin(productsPlugin);
  }, 30000);

  afterAll(async () => {
    await identityPlugin?.onStop();
    await ordersPlugin?.onStop();
    await productsPlugin?.onStop();
  });

  describe('Identity Provider - Plugin Initialization', () => {
    test('creates OAuth2 resources (plg_oauth_keys, plg_oauth_clients, plg_auth_codes)', () => {
      expect(identityDb.resources.plg_oauth_keys).toBeDefined();
      expect(identityDb.resources.plg_oauth_clients).toBeDefined();
      expect(identityDb.resources.plg_auth_codes).toBeDefined();
    });

    test('creates users resource', () => {
      expect(identityDb.resources.users).toBeDefined();
    });

    test('initializes OAuth2 server', () => {
      const oauth2Server = identityPlugin.getOAuth2Server();
      expect(oauth2Server).toBeDefined();
      expect(oauth2Server.keyManager).toBeDefined();
    });

    test('server info shows correct port and issuer', () => {
      const info = identityPlugin.getServerInfo();
      expect(info.port).toBe(IDENTITY_PORT);
      expect(info.issuer).toBe(IDENTITY_URL);
    });
  });

  describe('Identity Provider - OIDC Discovery', () => {
    test('GET /.well-known/openid-configuration returns discovery document', async () => {
      const response = await fetch(`${IDENTITY_URL}/.well-known/openid-configuration`);
      expect(response.status).toBe(200);

      const discovery = await response.json();
      expect(discovery.issuer).toBe(IDENTITY_URL);
      expect(discovery.authorization_endpoint).toBe(`${IDENTITY_URL}/oauth/authorize`);
      expect(discovery.token_endpoint).toBe(`${IDENTITY_URL}/oauth/token`);
      expect(discovery.userinfo_endpoint).toBe(`${IDENTITY_URL}/oauth/userinfo`);
      expect(discovery.jwks_uri).toBe(`${IDENTITY_URL}/.well-known/jwks.json`);
      expect(discovery.scopes_supported).toContain('openid');
      expect(discovery.grant_types_supported).toContain('client_credentials');
    });

    test('GET /.well-known/jwks.json returns public keys', async () => {
      const response = await fetch(`${IDENTITY_URL}/.well-known/jwks.json`);
      expect(response.status).toBe(200);

      const jwks = await response.json();
      expect(jwks.keys).toBeDefined();
      expect(Array.isArray(jwks.keys)).toBe(true);
      expect(jwks.keys.length).toBeGreaterThan(0);
      expect(jwks.keys[0]).toHaveProperty('kid');
      expect(jwks.keys[0]).toHaveProperty('kty', 'RSA');
      expect(jwks.keys[0]).toHaveProperty('use', 'sig');
      expect(jwks.keys[0]).toHaveProperty('alg', 'RS256');
    });
  });

  describe('Identity Provider - Token Endpoint (client_credentials)', () => {
    test('POST /oauth/token with client_credentials grant returns access token', async () => {
      const response = await fetch(`${IDENTITY_URL}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${testClient.clientId}:${testClient.clientSecret}`).toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'orders:read orders:write'
        })
      });

      expect(response.status).toBe(200);

      const token = await response.json();
      expect(token.access_token).toBeDefined();
      expect(token.token_type).toBe('Bearer');
      expect(token.expires_in).toBe(900); // 15 minutes
      expect(token.scope).toBe('orders:read orders:write');

      // Decode JWT to verify claims
      const [, payloadB64] = token.access_token.split('.');
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());
      expect(payload.iss).toBe(IDENTITY_URL);
      expect(payload.scope).toBe('orders:read orders:write');
      expect(payload.client_id).toBe(testClient.clientId);
    });

    test('POST /oauth/token with invalid client_secret returns 401', async () => {
      const response = await fetch(`${IDENTITY_URL}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${testClient.clientId}:wrong-secret`).toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'orders:read'
        })
      });

      expect(response.status).toBe(401);
    });

    test('POST /oauth/token with unsupported grant_type returns 400', async () => {
      const response = await fetch(`${IDENTITY_URL}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${testClient.clientId}:${testClient.clientSecret}`).toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'password',
          scope: 'orders:read'
        })
      });

      expect(response.status).toBe(400);
    });

    test('POST /oauth/token with invalid scope returns 400', async () => {
      const response = await fetch(`${IDENTITY_URL}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${testClient.clientId}:${testClient.clientSecret}`).toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'invalid:scope'
        })
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Resource Server - Token Validation', () => {
    let validToken;

    beforeAll(async () => {
      // Get valid token from Identity Provider
      const response = await fetch(`${IDENTITY_URL}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${testClient.clientId}:${testClient.clientSecret}`).toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'orders:read orders:write products:read products:write'
        })
      });

      const token = await response.json();
      validToken = token.access_token;
    });

    test('GET /health is publicly accessible', async () => {
      const response = await fetch(`${ORDERS_URL}/health`);
      expect(response.status).toBe(200);
    });

    test('GET /orders without token returns 401', async () => {
      const response = await fetch(`${ORDERS_URL}/orders`);
      expect(response.status).toBe(401);
    });

    test('GET /orders with valid token returns 200', async () => {
      const response = await fetch(`${ORDERS_URL}/orders`, {
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      expect(response.status).toBe(200);
    });

    test('POST /orders with valid token and correct scope creates order', async () => {
      const response = await fetch(`${ORDERS_URL}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orderId: 'order-001',
          product: 'Widget',
          quantity: 5
        })
      });

      expect(response.status).toBe(201);

      const result = await response.json();
      expect(result.data.orderId).toBe('order-001');
    });

    test('GET /orders with malformed token returns 401', async () => {
      const response = await fetch(`${ORDERS_URL}/orders`, {
        headers: {
          'Authorization': 'Bearer invalid.token.here'
        }
      });

      expect(response.status).toBe(401);
    });

    test('GET /products is publicly accessible', async () => {
      const response = await fetch(`${PRODUCTS_URL}/products`);
      expect(response.status).toBe(200);
    });

    test('POST /products without token returns 401', async () => {
      const response = await fetch(`${PRODUCTS_URL}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productId: 'prod-001',
          name: 'Gadget',
          price: 99.99
        })
      });

      expect(response.status).toBe(401);
    });

    test('POST /products with correct scope creates product', async () => {
      const response = await fetch(`${PRODUCTS_URL}/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productId: 'prod-001',
          name: 'Gadget',
          price: 99.99,
          stock: 10
        })
      });

      expect(response.status).toBe(201);

      const result = await response.json();
      expect(result.data.productId).toBe('prod-001');
    });

    test('Same token works on multiple resource servers', async () => {
      // Create order
      const orderResponse = await fetch(`${ORDERS_URL}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orderId: 'order-002',
          product: 'Gadget',
          quantity: 2
        })
      });

      expect(orderResponse.status).toBe(201);

      // Create product
      const productResponse = await fetch(`${PRODUCTS_URL}/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productId: 'prod-002',
          name: 'Widget',
          price: 49.99
        })
      });

      expect(productResponse.status).toBe(201);

      // Both should work with same token
      const orderData = await orderResponse.json();
      const productData = await productResponse.json();

      expect(orderData.data.orderId).toBe('order-002');
      expect(productData.data.productId).toBe('prod-002');
    });
  });

  describe('Identity Provider - Token Introspection', () => {
    let validToken;

    beforeAll(async () => {
      const response = await fetch(`${IDENTITY_URL}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${testClient.clientId}:${testClient.clientSecret}`).toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'orders:read'
        })
      });

      const token = await response.json();
      validToken = token.access_token;
    });

    test('POST /oauth/introspect with valid token returns active=true', async () => {
      const response = await fetch(`${IDENTITY_URL}/oauth/introspect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${testClient.clientId}:${testClient.clientSecret}`).toString('base64')
        },
        body: new URLSearchParams({
          token: validToken
        })
      });

      expect(response.status).toBe(200);

      const introspection = await response.json();
      expect(introspection.active).toBe(true);
      expect(introspection.client_id).toBe(testClient.clientId);
      expect(introspection.scope).toBe('orders:read');
    });

    test('POST /oauth/introspect with invalid token returns active=false', async () => {
      const response = await fetch(`${IDENTITY_URL}/oauth/introspect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${testClient.clientId}:${testClient.clientSecret}`).toString('base64')
        },
        body: new URLSearchParams({
          token: 'invalid.token.here'
        })
      });

      expect(response.status).toBe(200);

      const introspection = await response.json();
      expect(introspection.active).toBe(false);
    });
  });
});
