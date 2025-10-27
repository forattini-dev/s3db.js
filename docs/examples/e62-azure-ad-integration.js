/**
 * Azure AD (Microsoft Entra ID) Integration Example
 *
 * Este exemplo mostra como integrar sua API s3db.js com Azure AD,
 * onde o Azure gerencia TODOS os usuários e sua API apenas valida tokens.
 *
 * Arquitetura:
 * - Azure AD: Gerencia usuários (outro time/Microsoft)
 * - Sua API: Apenas valida tokens (100% passiva)
 *
 * Setup:
 * 1. Criar App Registration no Azure AD
 * 2. Configurar API Permissions
 * 3. Obter Tenant ID e Client ID
 * 4. Configurar s3db.js para validar tokens do Azure
 */

import Database from 's3db.js';
import { ApiPlugin } from 's3db.js';
import { OIDCClient } from 's3db.js';

// ============================================================================
// CONFIGURAÇÃO - Substituir com seus valores do Azure AD
// ============================================================================

const AZURE_CONFIG = {
  // Tenant ID do seu Azure AD
  // Encontrar em: Azure Portal → Azure Active Directory → Overview → Tenant ID
  tenantId: 'YOUR_TENANT_ID',  // Ex: 'abc12345-def6-7890-ghij-klmnopqrstuv'

  // Client ID da sua API (App Registration)
  // Encontrar em: Azure Portal → App Registrations → Sua API → Application (client) ID
  clientId: 'YOUR_API_CLIENT_ID',  // Ex: 'api://xyz98765-abc4-3210-defg-hijklmnopqrs'

  // Audience (geralmente é o Application ID URI)
  audience: 'api://YOUR_API_CLIENT_ID',

  // Issuer URL (baseado no tenant)
  // Multi-tenant: 'https://login.microsoftonline.com/common/v2.0'
  // Single-tenant: `https://login.microsoftonline.com/${tenantId}/v2.0`
  issuer: 'https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0'
};

// ============================================================================
// CRIAR API COM AZURE AD INTEGRATION
// ============================================================================

async function createAzureADProtectedAPI() {
  console.log('🔐 Criando API protegida com Azure AD...\n');

  // ========================================
  // 1. Setup Database
  // ========================================
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/orders-api',
    encryptionKey: 'orders-secret-key'
  });

  await db.connect();

  // Create orders resource
  const ordersResource = await db.createResource({
    name: 'orders',
    attributes: {
      userId: 'string|required',      // Azure AD User Object ID (oid claim)
      userEmail: 'string',            // Azure AD User Email
      productId: 'string|required',
      quantity: 'number|required',
      total: 'number|required',
      status: 'string'
    },
    timestamps: true
  });

  console.log('✅ Database e resource criados\n');

  // ========================================
  // 2. Configure Azure AD OIDC Client
  // ========================================
  console.log('🔧 Configurando Azure AD OIDC Client...');

  const azureOIDC = new OIDCClient({
    // Azure AD issuer (v2.0 endpoint)
    issuer: AZURE_CONFIG.issuer,

    // Audience (sua API)
    audience: AZURE_CONFIG.audience,

    // Azure AD Discovery endpoint (auto-detectado)
    discoveryUri: `https://login.microsoftonline.com/${AZURE_CONFIG.tenantId}/v2.0/.well-known/openid-configuration`,

    // JWKS endpoint (auto-detectado via discovery)
    // jwksUri: `https://login.microsoftonline.com/${AZURE_CONFIG.tenantId}/discovery/v2.0/keys`,

    // Cache JWKS por 1 hora (Azure AD keys são estáveis)
    jwksCacheTTL: 3600000,

    // Auto-refresh JWKS
    autoRefreshJWKS: true,

    // Clock tolerance (60 segundos)
    clockTolerance: 60
  });

  // Inicializa (baixa JWKS do Azure AD)
  await azureOIDC.initialize();

  console.log('✅ Azure AD OIDC Client inicializado');
  console.log(`   Issuer: ${AZURE_CONFIG.issuer}`);
  console.log(`   Audience: ${AZURE_CONFIG.audience}\n`);

  // ========================================
  // 3. Create API Plugin
  // ========================================
  const apiPlugin = new ApiPlugin({
    port: 3000,
    apiPrefix: '/api',
    cors: {
      origin: '*',
      credentials: true
    }
  });

  // Add Azure AD auth driver
  apiPlugin.addAuthDriver('azure', azureOIDC.middleware.bind(azureOIDC));

  // ========================================
  // 4. Add Routes
  // ========================================

  // Health check (public)
  apiPlugin.addRoute({
    path: '/health',
    method: 'GET',
    handler: (req, res) => {
      res.json({
        status: 'ok',
        service: 'orders-api',
        auth: 'Azure AD',
        timestamp: new Date().toISOString()
      });
    },
    auth: false
  });

  // Get user info (protected)
  apiPlugin.addRoute({
    path: '/api/me',
    method: 'GET',
    handler: async (req, res) => {
      // Token claims disponíveis do Azure AD
      const user = {
        id: req.user.oid,                    // Object ID (user ID único)
        email: req.user.email || req.user.upn,  // Email
        name: req.user.name,                 // Nome completo
        givenName: req.user.given_name,      // Primeiro nome
        familyName: req.user.family_name,    // Sobrenome
        roles: req.user.roles || [],         // App roles (se configurado)
        scopes: req.user.scp?.split(' ') || [], // Scopes delegados
        tenant: req.user.tid,                // Tenant ID
        issuer: req.user.iss                 // Issuer
      };

      res.json({ user });
    },
    auth: 'azure'
  });

  // List orders (protected)
  apiPlugin.addRoute({
    path: '/api/orders',
    method: 'GET',
    handler: async (req, res) => {
      // User ID do Azure AD (oid = Object ID)
      const userId = req.user.oid;

      // Busca orders do usuário
      const orders = await ordersResource.query({ userId });

      res.json({
        orders,
        user: {
          id: userId,
          email: req.user.email || req.user.upn,
          name: req.user.name
        }
      });
    },
    auth: 'azure'
  });

  // Create order (protected)
  apiPlugin.addRoute({
    path: '/api/orders',
    method: 'POST',
    handler: async (req, res) => {
      const userId = req.user.oid;
      const userEmail = req.user.email || req.user.upn;
      const { productId, quantity, total } = req.body;

      // Verifica se tem scope necessário (se configurado no Azure AD)
      const scopes = req.user.scp?.split(' ') || [];
      if (!scopes.includes('Orders.Write') && scopes.length > 0) {
        return res.status(403).json({
          error: 'insufficient_scope',
          error_description: 'Scope "Orders.Write" required'
        });
      }

      const order = await ordersResource.insert({
        userId,
        userEmail,
        productId,
        quantity,
        total,
        status: 'pending'
      });

      res.status(201).json(order);
    },
    auth: 'azure'
  });

  // Delete order (protected + role check)
  apiPlugin.addRoute({
    path: '/api/orders/:id',
    method: 'DELETE',
    handler: async (req, res) => {
      const userId = req.user.oid;
      const { id } = req.params;

      // Verifica se tem role de admin (se configurado no Azure AD)
      const roles = req.user.roles || [];
      const isAdmin = roles.includes('Admin');

      // Busca order
      const order = await ordersResource.get(id);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Apenas dono ou admin pode deletar
      if (order.userId !== userId && !isAdmin) {
        return res.status(403).json({
          error: 'forbidden',
          error_description: 'You can only delete your own orders'
        });
      }

      await ordersResource.delete(id);

      res.status(204).send();
    },
    auth: 'azure'
  });

  // ========================================
  // 5. Start API
  // ========================================
  await db.use(apiPlugin);

  console.log('✅ API rodando em http://localhost:3000');
  console.log('\n📖 Endpoints:');
  console.log('   GET  /health              → Public (health check)');
  console.log('   GET  /api/me              → Protected (user info)');
  console.log('   GET  /api/orders          → Protected (list orders)');
  console.log('   POST /api/orders          → Protected (create order)');
  console.log('   DELETE /api/orders/:id    → Protected (delete order)');

  return { db, apiPlugin, azureOIDC, ordersResource };
}

// ============================================================================
// HELPER: Obter token do Azure AD (para testes)
// ============================================================================

async function getAzureADToken() {
  console.log('\n🎫 Como obter token do Azure AD:\n');

  console.log('OPÇÃO 1: Client Credentials (service-to-service)');
  console.log('────────────────────────────────────────────────');
  console.log('curl -X POST \\');
  console.log(`  https://login.microsoftonline.com/${AZURE_CONFIG.tenantId}/oauth2/v2.0/token \\`);
  console.log('  -d "client_id=YOUR_CLIENT_APP_ID" \\');
  console.log('  -d "client_secret=YOUR_CLIENT_SECRET" \\');
  console.log(`  -d "scope=${AZURE_CONFIG.audience}/.default" \\`);
  console.log('  -d "grant_type=client_credentials"\n');

  console.log('OPÇÃO 2: Authorization Code (user login)');
  console.log('────────────────────────────────────────────────');
  console.log('1. Abrir no navegador:');
  console.log(`   https://login.microsoftonline.com/${AZURE_CONFIG.tenantId}/oauth2/v2.0/authorize?`);
  console.log('   client_id=YOUR_CLIENT_APP_ID&');
  console.log('   response_type=code&');
  console.log('   redirect_uri=http://localhost:3000/callback&');
  console.log(`   scope=${AZURE_CONFIG.audience}/Orders.Read ${AZURE_CONFIG.audience}/Orders.Write`);
  console.log('\n2. Usuário faz login no Azure AD');
  console.log('3. Azure redireciona com code');
  console.log('4. Trocar code por token:\n');
  console.log('curl -X POST \\');
  console.log(`  https://login.microsoftonline.com/${AZURE_CONFIG.tenantId}/oauth2/v2.0/token \\`);
  console.log('  -d "client_id=YOUR_CLIENT_APP_ID" \\');
  console.log('  -d "client_secret=YOUR_CLIENT_SECRET" \\');
  console.log('  -d "code=AUTHORIZATION_CODE" \\');
  console.log('  -d "redirect_uri=http://localhost:3000/callback" \\');
  console.log('  -d "grant_type=authorization_code"\n');

  console.log('OPÇÃO 3: Azure CLI (para testes locais)');
  console.log('────────────────────────────────────────────────');
  console.log('az login');
  console.log(`az account get-access-token --resource ${AZURE_CONFIG.audience}\n`);
}

// ============================================================================
// HELPER: Testar API com token
// ============================================================================

async function testAPI(token) {
  console.log('\n🧪 Testando API com token do Azure AD:\n');

  console.log('1. Health check (public):');
  console.log('   curl http://localhost:3000/health\n');

  console.log('2. Get user info:');
  console.log('   curl http://localhost:3000/api/me \\');
  console.log(`     -H "Authorization: Bearer ${token?.substring(0, 20)}..."\n`);

  console.log('3. List orders:');
  console.log('   curl http://localhost:3000/api/orders \\');
  console.log(`     -H "Authorization: Bearer ${token?.substring(0, 20)}..."\n`);

  console.log('4. Create order:');
  console.log('   curl -X POST http://localhost:3000/api/orders \\');
  console.log(`     -H "Authorization: Bearer ${token?.substring(0, 20)}..." \\`);
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"productId":"prod-123","quantity":2,"total":99.99}\'\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Azure AD Integration with s3db.js');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Verificar se configuração foi preenchida
  if (AZURE_CONFIG.tenantId === 'YOUR_TENANT_ID') {
    console.log('⚠️  ATENÇÃO: Configure AZURE_CONFIG no topo do arquivo!\n');
    console.log('📋 Passos para configurar:\n');
    console.log('1. Acesse: https://portal.azure.com');
    console.log('2. Azure Active Directory → App Registrations → New registration');
    console.log('3. Nome: "Orders API"');
    console.log('4. Supported account types: "Accounts in this organizational directory only"');
    console.log('5. Clique em "Register"');
    console.log('6. Copie "Application (client) ID" e "Directory (tenant) ID"');
    console.log('7. Expose an API → Add a scope');
    console.log('   - Scope name: Orders.Read');
    console.log('   - Scope name: Orders.Write');
    console.log('8. App roles → Create app role');
    console.log('   - Display name: Admin');
    console.log('   - Value: Admin');
    console.log('9. Atualize AZURE_CONFIG neste arquivo\n');

    getAzureADToken();
    return;
  }

  // Criar API
  const api = await createAzureADProtectedAPI();

  // Mostrar como obter token
  getAzureADToken();

  // Mostrar como testar
  testAPI();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  ✅ API pronta! Aguardando requests...');
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { createAzureADProtectedAPI, AZURE_CONFIG };
