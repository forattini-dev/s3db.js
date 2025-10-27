/**
 * OAuth2/OIDC Microservices Architecture Example
 *
 * This example demonstrates how to create a complete OAuth2 + OIDC microservices
 * architecture with s3db.js, where:
 *
 * 1. SSO Service (Port 3000) - IdentityPlugin (Authorization Server)
 *    - Manages users and authentication
 *    - Issues RS256 JWT tokens
 *    - Provides OIDC discovery and JWKS endpoints
 *
 * 2. Resource Server 1 (Port 3001) - Orders API
 *    - Validates tokens from SSO
 *    - Protected routes require valid access token
 *
 * 3. Resource Server 2 (Port 3002) - Products API
 *    - Validates tokens from SSO
 *    - Protected routes require valid access token
 *
 * Architecture:
 * ```
 * Client → SSO (POST /auth/token) → Access Token
 * Client → Orders API (GET /orders + Bearer token) → Validates with SSO's public key
 * Client → Products API (GET /products + Bearer token) → Validates with SSO's public key
 * ```
 */

import Database from 's3db.js';
import { APIPlugin } from 's3db.js/plugins/api';
import { OAuth2Server } from 's3db.js/plugins/identity/oauth2-server';
import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';

// ============================================================================
// 1. SSO SERVICE (Authorization Server) - Port 3000
// ============================================================================

async function createSSOService() {
  // Initialize database
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/sso-service',
    encryptionKey: 'sso-encryption-key-change-in-production'
  });

  await db.connect();

  // Create users resource
  const usersResource = await db.createResource({
    name: 'users',
    attributes: {
      email: 'string|required|email',
      password: 'secret|required', // Auto-encrypted with AES-256-GCM
      name: 'string',
      givenName: 'string',
      familyName: 'string',
      picture: 'url',
      emailVerified: 'boolean',
      locale: 'string'
    },
    timestamps: true
  });

  // Create OAuth keys resource (stores RSA key pairs)
  const keysResource = await db.createResource({
    name: 'oauth_keys',
    attributes: {
      kid: 'string|required',
      publicKey: 'string|required',
      privateKey: 'secret|required',
      algorithm: 'string',
      use: 'string',
      active: 'boolean',
      createdAt: 'string'
    },
    timestamps: true
  });

  // Create OAuth clients resource
  const clientsResource = await db.createResource({
    name: 'oauth_clients',
    attributes: {
      clientId: 'string|required',
      clientSecret: 'secret|required',
      name: 'string',
      redirectUris: 'array|items:string',
      grantTypes: 'array|items:string',
      scopes: 'array|items:string'
    },
    timestamps: true
  });

  // Create authorization codes resource
  const authCodesResource = await db.createResource({
    name: 'auth_codes',
    attributes: {
      code: 'string|required',
      clientId: 'string|required',
      userId: 'string|required',
      redirectUri: 'string|required',
      scope: 'string',
      nonce: 'string',
      codeChallenge: 'string',
      codeChallengeMethod: 'string',
      expiresAt: 'number|required',
      audience: 'string'
    },
    timestamps: true
  });

  // Initialize OAuth2 server
  const oauth2 = new OAuth2Server({
    issuer: 'http://localhost:3000',
    keyResource: keysResource,
    userResource: usersResource,
    clientResource: clientsResource,
    authCodeResource: authCodesResource,
    supportedScopes: ['openid', 'profile', 'email', 'offline_access'],
    supportedGrantTypes: ['client_credentials', 'authorization_code', 'refresh_token'],
    accessTokenExpiry: '15m',
    idTokenExpiry: '15m',
    refreshTokenExpiry: '7d'
  });

  await oauth2.initialize();

  // Create API plugin
  const apiPlugin = new APIPlugin({
    port: 3000,
    apiPrefix: '',
    cors: {
      origin: '*',
      credentials: true
    }
  });

  // Add OAuth2/OIDC endpoints
  apiPlugin.addRoute({
    path: '/.well-known/openid-configuration',
    method: 'GET',
    handler: oauth2.discoveryHandler.bind(oauth2),
    auth: false
  });

  apiPlugin.addRoute({
    path: '/.well-known/jwks.json',
    method: 'GET',
    handler: oauth2.jwksHandler.bind(oauth2),
    auth: false
  });

  apiPlugin.addRoute({
    path: '/auth/token',
    method: 'POST',
    handler: oauth2.tokenHandler.bind(oauth2),
    auth: false
  });

  apiPlugin.addRoute({
    path: '/auth/userinfo',
    method: 'GET',
    handler: oauth2.userinfoHandler.bind(oauth2),
    auth: false // Validates token internally
  });

  apiPlugin.addRoute({
    path: '/auth/introspect',
    method: 'POST',
    handler: oauth2.introspectHandler.bind(oauth2),
    auth: false
  });

  // Add user registration endpoint
  apiPlugin.addRoute({
    path: '/auth/register',
    method: 'POST',
    handler: async (req, res) => {
      try {
        const { email, password, name, givenName, familyName } = req.body;

        // Check if user exists
        const existing = await usersResource.query({ email });
        if (existing.length > 0) {
          return res.status(400).json({
            error: 'user_exists',
            error_description: 'User already exists'
          });
        }

        // Create user
        const user = await usersResource.insert({
          email,
          password,
          name,
          givenName,
          familyName,
          emailVerified: false
        });

        res.status(201).json({
          id: user.id,
          email: user.email,
          name: user.name
        });
      } catch (error) {
        res.status(500).json({
          error: 'server_error',
          error_description: error.message
        });
      }
    },
    auth: false
  });

  // Add simple login endpoint for testing
  apiPlugin.addRoute({
    path: '/auth/login',
    method: 'POST',
    handler: async (req, res) => {
      try {
        const { email, password } = req.body;

        const users = await usersResource.query({ email });
        if (users.length === 0) {
          return res.status(401).json({
            error: 'invalid_credentials',
            error_description: 'Invalid email or password'
          });
        }

        const user = users[0];

        // Note: In production, use proper password hashing (bcrypt, etc.)
        // The 'secret' field type auto-encrypts but is not suitable for password verification
        // This is just for demonstration

        res.status(200).json({
          message: 'Login successful',
          userId: user.id,
          hint: 'Use POST /auth/token with grant_type=client_credentials to get access token'
        });
      } catch (error) {
        res.status(500).json({
          error: 'server_error',
          error_description: error.message
        });
      }
    },
    auth: false
  });

  await db.use(apiPlugin);

  console.log('✅ SSO Service (Authorization Server) running on http://localhost:3000');
  console.log('   - Discovery: http://localhost:3000/.well-known/openid-configuration');
  console.log('   - JWKS: http://localhost:3000/.well-known/jwks.json');
  console.log('   - Token: http://localhost:3000/auth/token');
  console.log('   - UserInfo: http://localhost:3000/auth/userinfo');

  return { db, oauth2, apiPlugin, usersResource, clientsResource };
}

// ============================================================================
// 2. ORDERS API (Resource Server) - Port 3001
// ============================================================================

async function createOrdersAPI() {
  // Initialize database
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/orders-service',
    encryptionKey: 'orders-encryption-key-change-in-production'
  });

  await db.connect();

  // Create orders resource
  const ordersResource = await db.createResource({
    name: 'orders',
    attributes: {
      userId: 'string|required',
      productId: 'string|required',
      quantity: 'number|required|min:1',
      total: 'number|required',
      status: 'string|required',
      shippingAddress: {
        street: 'string',
        city: 'string',
        state: 'string',
        zip: 'string',
        country: 'string'
      }
    },
    timestamps: true
  });

  // Initialize OIDC client
  const oidcClient = new OIDCClient({
    issuer: 'http://localhost:3000',
    audience: 'http://localhost:3001',
    jwksCacheTTL: 3600000, // 1 hour
    autoRefreshJWKS: true
  });

  await oidcClient.initialize();

  // Create API plugin
  const apiPlugin = new APIPlugin({
    port: 3001,
    apiPrefix: '',
    cors: {
      origin: '*',
      credentials: true
    }
  });

  // Add OIDC auth driver
  apiPlugin.addAuthDriver('oidc', oidcClient.middleware.bind(oidcClient));

  // Public health check
  apiPlugin.addRoute({
    path: '/health',
    method: 'GET',
    handler: (req, res) => {
      res.json({ status: 'ok', service: 'orders-api' });
    },
    auth: false
  });

  // Protected: List orders (requires valid access token)
  apiPlugin.addRoute({
    path: '/orders',
    method: 'GET',
    handler: async (req, res) => {
      try {
        // req.user contains validated token payload
        const userId = req.user.sub;

        const orders = await ordersResource.query({ userId });

        res.json({
          orders,
          user: {
            id: req.user.sub,
            scope: req.user.scope
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },
    auth: 'oidc'
  });

  // Protected: Create order
  apiPlugin.addRoute({
    path: '/orders',
    method: 'POST',
    handler: async (req, res) => {
      try {
        const userId = req.user.sub;
        const { productId, quantity, total, shippingAddress } = req.body;

        const order = await ordersResource.insert({
          userId,
          productId,
          quantity,
          total,
          status: 'pending',
          shippingAddress
        });

        res.status(201).json(order);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },
    auth: 'oidc'
  });

  await db.use(apiPlugin);

  console.log('✅ Orders API (Resource Server) running on http://localhost:3001');
  console.log('   - Protected: GET /orders (requires Bearer token)');
  console.log('   - Protected: POST /orders (requires Bearer token)');

  return { db, oidcClient, apiPlugin, ordersResource };
}

// ============================================================================
// 3. PRODUCTS API (Resource Server) - Port 3002
// ============================================================================

async function createProductsAPI() {
  // Initialize database
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/products-service',
    encryptionKey: 'products-encryption-key-change-in-production'
  });

  await db.connect();

  // Create products resource
  const productsResource = await db.createResource({
    name: 'products',
    attributes: {
      name: 'string|required',
      description: 'string',
      price: 'number|required',
      sku: 'string|required',
      stock: 'number|required',
      category: 'string',
      images: 'array|items:string'
    },
    timestamps: true
  });

  // Initialize OIDC client
  const oidcClient = new OIDCClient({
    issuer: 'http://localhost:3000',
    audience: 'http://localhost:3002',
    jwksCacheTTL: 3600000,
    autoRefreshJWKS: true
  });

  await oidcClient.initialize();

  // Create API plugin
  const apiPlugin = new APIPlugin({
    port: 3002,
    apiPrefix: '',
    cors: {
      origin: '*',
      credentials: true
    }
  });

  // Add OIDC auth driver
  apiPlugin.addAuthDriver('oidc', oidcClient.middleware.bind(oidcClient));

  // Public: List products (anyone can view)
  apiPlugin.addRoute({
    path: '/products',
    method: 'GET',
    handler: async (req, res) => {
      try {
        const products = await productsResource.list({ limit: 100 });
        res.json({ products });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },
    auth: false
  });

  // Protected: Create product (requires authentication)
  apiPlugin.addRoute({
    path: '/products',
    method: 'POST',
    handler: async (req, res) => {
      try {
        const { name, description, price, sku, stock, category, images } = req.body;

        const product = await productsResource.insert({
          name,
          description,
          price,
          sku,
          stock,
          category,
          images
        });

        res.status(201).json(product);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },
    auth: 'oidc'
  });

  // Protected: Update product
  apiPlugin.addRoute({
    path: '/products/:id',
    method: 'PUT',
    handler: async (req, res) => {
      try {
        const { id } = req.params;
        const updates = req.body;

        const product = await productsResource.update(id, updates);

        res.json(product);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },
    auth: 'oidc'
  });

  await db.use(apiPlugin);

  console.log('✅ Products API (Resource Server) running on http://localhost:3002');
  console.log('   - Public: GET /products');
  console.log('   - Protected: POST /products (requires Bearer token)');
  console.log('   - Protected: PUT /products/:id (requires Bearer token)');

  return { db, oidcClient, apiPlugin, productsResource };
}

// ============================================================================
// MAIN - Start all services
// ============================================================================

async function main() {
  console.log('🚀 Starting OAuth2/OIDC Microservices Architecture...\n');

  // Start SSO service
  const sso = await createSSOService();

  // Create a test OAuth client
  const testClient = await sso.clientsResource.insert({
    clientId: 'test-client',
    clientSecret: 'test-secret',
    name: 'Test Client',
    redirectUris: ['http://localhost:3000/callback'],
    grantTypes: ['client_credentials', 'authorization_code'],
    scopes: ['openid', 'profile', 'email']
  });

  console.log('\n📋 Test OAuth Client Created:');
  console.log(`   Client ID: ${testClient.clientId}`);
  console.log(`   Client Secret: ${testClient.clientSecret}\n`);

  // Start resource servers
  await createOrdersAPI();
  await createProductsAPI();

  console.log('\n✅ All services running!\n');
  console.log('📖 Usage Examples:\n');
  console.log('1. Get Access Token (Client Credentials):');
  console.log('   curl -X POST http://localhost:3000/auth/token \\');
  console.log('     -H "Content-Type: application/x-www-form-urlencoded" \\');
  console.log('     -d "grant_type=client_credentials&client_id=test-client&client_secret=test-secret&scope=openid profile"\n');

  console.log('2. Access Protected Route (Orders API):');
  console.log('   curl http://localhost:3001/orders \\');
  console.log('     -H "Authorization: Bearer <access_token>"\n');

  console.log('3. Access Protected Route (Products API):');
  console.log('   curl -X POST http://localhost:3002/products \\');
  console.log('     -H "Authorization: Bearer <access_token>" \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"name":"Widget","price":29.99,"sku":"WDG-001","stock":100}\'\n');

  console.log('4. Get Discovery Document:');
  console.log('   curl http://localhost:3000/.well-known/openid-configuration\n');

  console.log('5. Get Public Keys (JWKS):');
  console.log('   curl http://localhost:3000/.well-known/jwks.json\n');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  createSSOService,
  createOrdersAPI,
  createProductsAPI
};
