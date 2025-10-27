/**
 * OAuth2/OIDC Architecture Explained
 *
 * Este exemplo mostra CLARAMENTE a separação entre:
 * 1. Servidor SSO (Autoritativo) - Dono dos usuários
 * 2. Resource Servers (APIs) - Apenas validam tokens
 */

import Database from 's3db.js';
import { APIPlugin } from 's3db.js';
import { OAuth2Server } from 's3db.js/plugins/identity/oauth2-server';
import { OIDCClient } from 's3db.js';

// ============================================================================
// SERVIDOR SSO - O ÚNICO QUE TEM USUÁRIOS E AUTENTICA
// ============================================================================

async function createSSOServer() {
  console.log('🔐 Criando SERVIDOR SSO (Autoritativo)...\n');

  // Banco de dados DO SSO - contém USUÁRIOS
  const ssoDb = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/sso-database',
    encryptionKey: 'sso-secret-key'
  });

  await ssoDb.connect();

  // ========================================
  // RESOURCE 1: USUÁRIOS
  // Apenas o SSO tem essa tabela!
  // ========================================
  console.log('📋 Criando resource USERS (apenas no SSO)');
  const usersResource = await ssoDb.createResource({
    name: 'users',
    attributes: {
      email: 'string|required|email',
      password: 'secret|required',
      name: 'string',
      scopes: 'array|items:string', // Scopes do usuário
      permissions: 'array|items:string',
      active: 'boolean'
    }
  });

  // ========================================
  // RESOURCE 2: CHAVES RSA
  // Apenas o SSO tem chaves privadas!
  // ========================================
  console.log('🔑 Criando resource KEYS (chave PRIVADA apenas no SSO)');
  const keysResource = await ssoDb.createResource({
    name: 'oauth_keys',
    attributes: {
      kid: 'string|required',
      publicKey: 'string|required',
      privateKey: 'secret|required', // Chave PRIVADA - só no SSO!
      active: 'boolean'
    }
  });

  // ========================================
  // RESOURCE 3: OAUTH CLIENTS
  // Controla quais aplicações podem pedir tokens
  // ========================================
  console.log('🎫 Criando resource CLIENTS (apenas no SSO)');
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

  // ========================================
  // OAUTH2 SERVER - Emite tokens
  // ========================================
  const oauth2 = new OAuth2Server({
    issuer: 'http://localhost:3000',
    keyResource: keysResource,
    userResource: usersResource,
    clientResource: clientsResource,
    supportedScopes: ['openid', 'profile', 'email', 'orders:read', 'orders:write', 'products:read', 'products:write']
  });

  await oauth2.initialize();

  // ========================================
  // API DO SSO - Endpoints de autenticação
  // ========================================
  const ssoApi = new APIPlugin({ port: 3000 });

  // Discovery - Configuração do servidor OAuth
  ssoApi.addRoute({
    path: '/.well-known/openid-configuration',
    method: 'GET',
    handler: oauth2.discoveryHandler.bind(oauth2),
    auth: false
  });

  // JWKS - Chaves PÚBLICAS (resource servers baixam isso)
  ssoApi.addRoute({
    path: '/.well-known/jwks.json',
    method: 'GET',
    handler: oauth2.jwksHandler.bind(oauth2),
    auth: false
  });

  // Token - Emite access tokens
  ssoApi.addRoute({
    path: '/auth/token',
    method: 'POST',
    handler: oauth2.tokenHandler.bind(oauth2),
    auth: false
  });

  // UserInfo - Informações do usuário autenticado
  ssoApi.addRoute({
    path: '/auth/userinfo',
    method: 'GET',
    handler: oauth2.userinfoHandler.bind(oauth2),
    auth: false // Valida token internamente
  });

  // Introspect - Validar se token é válido (opcional)
  ssoApi.addRoute({
    path: '/auth/introspect',
    method: 'POST',
    handler: oauth2.introspectHandler.bind(oauth2),
    auth: false
  });

  // Registro de usuários
  ssoApi.addRoute({
    path: '/auth/register',
    method: 'POST',
    handler: async (req, res) => {
      const { email, password, name, scopes = [] } = req.body;

      // Verifica se já existe
      const existing = await usersResource.query({ email });
      if (existing.length > 0) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Cria usuário
      const user = await usersResource.insert({
        email,
        password,
        name,
        scopes,
        active: true
      });

      res.status(201).json({
        id: user.id,
        email: user.email,
        name: user.name
      });
    },
    auth: false
  });

  await ssoDb.use(ssoApi);

  console.log('✅ SSO Server rodando em http://localhost:3000');
  console.log('   - Discovery: http://localhost:3000/.well-known/openid-configuration');
  console.log('   - JWKS: http://localhost:3000/.well-known/jwks.json');
  console.log('   - Token: http://localhost:3000/auth/token\n');

  return { ssoDb, oauth2, usersResource, clientsResource };
}

// ============================================================================
// ORDERS API - NÃO TEM USUÁRIOS, APENAS VALIDA TOKENS
// ============================================================================

async function createOrdersAPI() {
  console.log('📦 Criando ORDERS API (Resource Server)...\n');

  // Banco de dados DA ORDERS API - contém APENAS orders (SEM usuários!)
  const ordersDb = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/orders-database',
    encryptionKey: 'orders-secret-key'
  });

  await ordersDb.connect();

  // ========================================
  // RESOURCE: ORDERS
  // Esta API SÓ tem orders, NÃO tem users!
  // ========================================
  console.log('📋 Criando resource ORDERS (sem users!)');
  const ordersResource = await ordersDb.createResource({
    name: 'orders',
    attributes: {
      userId: 'string|required', // ID do usuário (vem do token!)
      productId: 'string|required',
      quantity: 'number|required',
      total: 'number|required',
      status: 'string'
    }
  });

  // ========================================
  // OIDC CLIENT - Valida tokens do SSO
  // ========================================
  console.log('🔍 Configurando OIDC Client para validar tokens do SSO');
  const oidcClient = new OIDCClient({
    issuer: 'http://localhost:3000',        // URL do SSO
    audience: 'http://localhost:3001',       // URL desta API
    jwksCacheTTL: 3600000,                   // Cache de 1 hora
    autoRefreshJWKS: true                    // Auto-refresh das chaves públicas
  });

  await oidcClient.initialize(); // Baixa JWKS do SSO (uma vez)
  console.log('✅ JWKS baixado do SSO e cacheado\n');

  // ========================================
  // API DA ORDERS - Endpoints de pedidos
  // ========================================
  const ordersApi = new APIPlugin({ port: 3001 });

  // Registra driver OIDC
  ordersApi.addAuthDriver('oidc', oidcClient.middleware.bind(oidcClient));

  // Rota PROTEGIDA - Lista orders do usuário autenticado
  ordersApi.addRoute({
    path: '/orders',
    method: 'GET',
    handler: async (req, res) => {
      // req.user vem do token validado (NÃO do banco de dados!)
      const userId = req.user.sub;  // subject = user ID
      const scopes = req.user.scope.split(' ');

      // Verifica se tem permissão
      if (!scopes.includes('orders:read')) {
        return res.status(403).json({ error: 'Insufficient scopes' });
      }

      // Busca orders do usuário
      const orders = await ordersResource.query({ userId });

      res.json({
        orders,
        user: {
          id: userId,
          email: req.user.email,  // Vem do token
          scopes: scopes
        }
      });
    },
    auth: 'oidc'  // Usa OIDC para validar token
  });

  // Rota PROTEGIDA - Criar order
  ordersApi.addRoute({
    path: '/orders',
    method: 'POST',
    handler: async (req, res) => {
      const userId = req.user.sub;
      const scopes = req.user.scope.split(' ');

      if (!scopes.includes('orders:write')) {
        return res.status(403).json({ error: 'Insufficient scopes' });
      }

      const { productId, quantity, total } = req.body;

      const order = await ordersResource.insert({
        userId,
        productId,
        quantity,
        total,
        status: 'pending'
      });

      res.status(201).json(order);
    },
    auth: 'oidc'
  });

  // Rota PÚBLICA - Health check
  ordersApi.addRoute({
    path: '/health',
    method: 'GET',
    handler: (req, res) => {
      res.json({ status: 'ok', service: 'orders-api' });
    },
    auth: false
  });

  await ordersDb.use(ordersApi);

  console.log('✅ Orders API rodando em http://localhost:3001');
  console.log('   - Protected: GET /orders (requer token)');
  console.log('   - Protected: POST /orders (requer token)');
  console.log('   - Public: GET /health\n');

  return { ordersDb, oidcClient, ordersResource };
}

// ============================================================================
// PRODUCTS API - OUTRA API SEM USUÁRIOS
// ============================================================================

async function createProductsAPI() {
  console.log('🛍️  Criando PRODUCTS API (Resource Server)...\n');

  const productsDb = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/products-database',
    encryptionKey: 'products-secret-key'
  });

  await productsDb.connect();

  console.log('📋 Criando resource PRODUCTS (sem users!)');
  const productsResource = await productsDb.createResource({
    name: 'products',
    attributes: {
      name: 'string|required',
      price: 'number|required',
      sku: 'string|required',
      stock: 'number'
    }
  });

  console.log('🔍 Configurando OIDC Client');
  const oidcClient = new OIDCClient({
    issuer: 'http://localhost:3000',
    audience: 'http://localhost:3002'
  });

  await oidcClient.initialize();
  console.log('✅ JWKS baixado do SSO\n');

  const productsApi = new APIPlugin({ port: 3002 });
  productsApi.addAuthDriver('oidc', oidcClient.middleware.bind(oidcClient));

  // PÚBLICA - Listar produtos (sem autenticação)
  productsApi.addRoute({
    path: '/products',
    method: 'GET',
    handler: async (req, res) => {
      const products = await productsResource.list({ limit: 100 });
      res.json({ products });
    },
    auth: false
  });

  // PROTEGIDA - Criar produto (requer token)
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

  console.log('✅ Products API rodando em http://localhost:3002');
  console.log('   - Public: GET /products');
  console.log('   - Protected: POST /products (requer token)\n');

  return { productsDb, oidcClient, productsResource };
}

// ============================================================================
// MAIN - Demonstração do fluxo completo
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  OAuth2/OIDC Architecture - Servidor Autoritativo vs APIs');
  console.log('═══════════════════════════════════════════════════════════\n');

  // 1. Iniciar SSO (autoritativo)
  const sso = await createSSOServer();

  // 2. Iniciar Resource Servers
  const ordersApi = await createOrdersAPI();
  const productsApi = await createProductsAPI();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ✅ TODOS OS SERVIÇOS RODANDO!');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Criar um client OAuth para testes
  const testClient = await sso.clientsResource.insert({
    clientId: 'mobile-app',
    clientSecret: 'mobile-secret',
    name: 'Mobile App',
    allowedScopes: ['openid', 'profile', 'email', 'orders:read', 'orders:write', 'products:write'],
    allowedGrantTypes: ['client_credentials']
  });

  // Criar um usuário de teste
  const testUser = await sso.usersResource.insert({
    email: 'john@example.com',
    password: 'secret123',
    name: 'John Doe',
    scopes: ['orders:read', 'orders:write', 'products:write'],
    active: true
  });

  console.log('📖 COMO USAR:\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('PASSO 1: Obter token do SSO');
  console.log('────────────────────────────────────────────────────────────');
  console.log('curl -X POST http://localhost:3000/auth/token \\');
  console.log('  -H "Content-Type: application/x-www-form-urlencoded" \\');
  console.log(`  -d "grant_type=client_credentials&client_id=${testClient.clientId}&client_secret=${testClient.clientSecret}&scope=openid orders:read orders:write"`);
  console.log('');
  console.log('RESPOSTA:');
  console.log('{');
  console.log('  "access_token": "eyJhbGci...",  ← Token assinado pelo SSO');
  console.log('  "token_type": "Bearer",');
  console.log('  "expires_in": 900');
  console.log('}\n');

  console.log('PASSO 2: Usar token para acessar Orders API');
  console.log('────────────────────────────────────────────────────────────');
  console.log('curl http://localhost:3001/orders \\');
  console.log('  -H "Authorization: Bearer eyJhbGci..."');
  console.log('');
  console.log('O QUE ACONTECE:');
  console.log('1. Orders API recebe o token');
  console.log('2. Orders API busca chave PÚBLICA do SSO (via JWKS cache)');
  console.log('3. Orders API VALIDA o token LOCALMENTE (sem falar com SSO!)');
  console.log('4. Orders API extrai userId do token e busca orders');
  console.log('5. Orders API NÃO precisa consultar SSO!\n');

  console.log('PASSO 3: Usar MESMO token para Products API');
  console.log('────────────────────────────────────────────────────────────');
  console.log('curl -X POST http://localhost:3002/products \\');
  console.log('  -H "Authorization: Bearer eyJhbGci..." \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{"name":"Widget","price":29.99,"sku":"WDG-001","stock":100}\'');
  console.log('');
  console.log('O QUE ACONTECE:');
  console.log('1. Products API valida token LOCALMENTE (sem SSO)');
  console.log('2. Products API verifica scope "products:write"');
  console.log('3. Products API cria o produto\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔑 PONTOS IMPORTANTES:\n');
  console.log('✅ SSO = Único dono dos usuários e autenticação');
  console.log('✅ SSO = Único com chave PRIVADA (assina tokens)');
  console.log('✅ Resource Servers = Apenas chave PÚBLICA (validam tokens)');
  console.log('✅ Resource Servers = NÃO precisam falar com SSO para validar!');
  console.log('✅ Resource Servers = NÃO armazenam usuários');
  console.log('✅ Um token funciona em TODAS as APIs (mesma issuer)');
  console.log('✅ Scopes controlam o que cada token pode fazer\n');

  console.log('📊 BANCOS DE DADOS:\n');
  console.log('SSO Database (s3://sso-database):');
  console.log('  ├── users (email, password, scopes)');
  console.log('  ├── oauth_keys (kid, publicKey, privateKey)');
  console.log('  └── oauth_clients (clientId, clientSecret)');
  console.log('');
  console.log('Orders Database (s3://orders-database):');
  console.log('  └── orders (userId, productId, quantity)  ← SEM users!');
  console.log('');
  console.log('Products Database (s3://products-database):');
  console.log('  └── products (name, price, sku)  ← SEM users!\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { createSSOServer, createOrdersAPI, createProductsAPI };
