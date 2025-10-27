/**
 * Keycloak Integration Example
 *
 * Este exemplo mostra como integrar sua API s3db.js com Keycloak,
 * onde o Keycloak gerencia TODOS os usuários e sua API apenas valida tokens.
 *
 * Arquitetura:
 * - Keycloak: Gerencia usuários, realms, clients, roles, scopes
 * - Sua API: Apenas valida tokens (100% passiva)
 *
 * Setup:
 * 1. Rodar Keycloak via Docker
 * 2. Criar Realm
 * 3. Criar Client para sua API
 * 4. Configurar Roles e Scopes
 * 5. Configurar s3db.js para validar tokens do Keycloak
 */

import Database from 's3db.js';
import { ApiPlugin } from 's3db.js';
import { OIDCClient } from 's3db.js';

// ============================================================================
// CONFIGURAÇÃO - Substituir com seus valores do Keycloak
// ============================================================================

const KEYCLOAK_CONFIG = {
  // URL base do Keycloak
  // Docker local: http://localhost:8080
  // Produção: https://keycloak.yourcompany.com
  baseUrl: 'http://localhost:8080',

  // Nome do Realm
  // Criar em: Keycloak Admin → Realms → Create Realm
  realm: 'production',  // Ex: 'production', 'development', 'master'

  // Client ID da sua API
  // Criar em: Keycloak Admin → Clients → Create Client
  clientId: 'orders-api',  // Ex: 'orders-api', 'my-api'

  // Client Secret (se confidential client)
  // Encontrar em: Keycloak Admin → Clients → orders-api → Credentials
  clientSecret: 'YOUR_CLIENT_SECRET',  // Ex: 'abc123-def456-ghi789'

  // Audience (geralmente é o Client ID)
  audience: 'orders-api'
};

// URLs derivadas
const KEYCLOAK_URLS = {
  issuer: `${KEYCLOAK_CONFIG.baseUrl}/realms/${KEYCLOAK_CONFIG.realm}`,
  discoveryUri: `${KEYCLOAK_CONFIG.baseUrl}/realms/${KEYCLOAK_CONFIG.realm}/.well-known/openid-configuration`,
  jwksUri: `${KEYCLOAK_CONFIG.baseUrl}/realms/${KEYCLOAK_CONFIG.realm}/protocol/openid-connect/certs`,
  tokenEndpoint: `${KEYCLOAK_CONFIG.baseUrl}/realms/${KEYCLOAK_CONFIG.realm}/protocol/openid-connect/token`,
  authEndpoint: `${KEYCLOAK_CONFIG.baseUrl}/realms/${KEYCLOAK_CONFIG.realm}/protocol/openid-connect/auth`,
  userInfoEndpoint: `${KEYCLOAK_CONFIG.baseUrl}/realms/${KEYCLOAK_CONFIG.realm}/protocol/openid-connect/userinfo`
};

// ============================================================================
// DOCKER SETUP - Como rodar Keycloak localmente
// ============================================================================

const DOCKER_SETUP = `
# 1. Rodar Keycloak via Docker
docker run -d \\
  --name keycloak \\
  -p 8080:8080 \\
  -e KEYCLOAK_ADMIN=admin \\
  -e KEYCLOAK_ADMIN_PASSWORD=admin \\
  quay.io/keycloak/keycloak:latest \\
  start-dev

# 2. Acessar Admin Console
# URL: http://localhost:8080
# User: admin
# Password: admin

# 3. Ou usar Docker Compose (production-ready)
# docker-compose.yml:
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  keycloak:
    image: quay.io/keycloak/keycloak:latest
    command: start
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: password
      KC_HOSTNAME: localhost
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    ports:
      - 8080:8080
    depends_on:
      - postgres

volumes:
  postgres_data:
`;

// ============================================================================
// CRIAR API COM KEYCLOAK INTEGRATION
// ============================================================================

async function createKeycloakProtectedAPI() {
  console.log('🔐 Criando API protegida com Keycloak...\n');

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
      userId: 'string|required',      // Keycloak User ID (sub claim)
      userEmail: 'string',            // Keycloak User Email
      userName: 'string',             // Keycloak preferred_username
      productId: 'string|required',
      quantity: 'number|required',
      total: 'number|required',
      status: 'string'
    },
    timestamps: true
  });

  console.log('✅ Database e resource criados\n');

  // ========================================
  // 2. Configure Keycloak OIDC Client
  // ========================================
  console.log('🔧 Configurando Keycloak OIDC Client...');

  const keycloakOIDC = new OIDCClient({
    // Keycloak issuer (realm URL)
    issuer: KEYCLOAK_URLS.issuer,

    // Audience (sua API client ID)
    audience: KEYCLOAK_CONFIG.audience,

    // Keycloak Discovery endpoint (auto-detectado)
    discoveryUri: KEYCLOAK_URLS.discoveryUri,

    // JWKS endpoint (auto-detectado via discovery)
    // jwksUri: KEYCLOAK_URLS.jwksUri,

    // Cache JWKS por 1 hora (Keycloak keys são estáveis)
    jwksCacheTTL: 3600000,

    // Auto-refresh JWKS
    autoRefreshJWKS: true,

    // Clock tolerance (60 segundos)
    clockTolerance: 60
  });

  // Inicializa (baixa JWKS do Keycloak)
  await keycloakOIDC.initialize();

  console.log('✅ Keycloak OIDC Client inicializado');
  console.log(`   Issuer: ${KEYCLOAK_URLS.issuer}`);
  console.log(`   Audience: ${KEYCLOAK_CONFIG.audience}\n`);

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

  // Add Keycloak auth driver
  apiPlugin.addAuthDriver('keycloak', keycloakOIDC.middleware.bind(keycloakOIDC));

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
        auth: 'Keycloak',
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
      // Token claims disponíveis do Keycloak
      const user = {
        id: req.user.sub,                           // User ID único
        email: req.user.email,                      // Email
        emailVerified: req.user.email_verified,     // Email verificado
        username: req.user.preferred_username,      // Username
        name: req.user.name,                        // Nome completo
        givenName: req.user.given_name,             // Primeiro nome
        familyName: req.user.family_name,           // Sobrenome

        // Roles do Keycloak (realm-level)
        realmRoles: req.user.realm_access?.roles || [],

        // Roles do client específico (resource-level)
        clientRoles: req.user.resource_access?.[KEYCLOAK_CONFIG.clientId]?.roles || [],

        // Scopes delegados
        scopes: req.user.scope?.split(' ') || [],

        // Metadata
        issuer: req.user.iss,
        azp: req.user.azp  // Authorized party (client ID)
      };

      res.json({ user });
    },
    auth: 'keycloak'
  });

  // List orders (protected)
  apiPlugin.addRoute({
    path: '/api/orders',
    method: 'GET',
    handler: async (req, res) => {
      // User ID do Keycloak (sub = Subject)
      const userId = req.user.sub;

      // Busca orders do usuário
      const orders = await ordersResource.query({ userId });

      res.json({
        orders,
        user: {
          id: userId,
          email: req.user.email,
          username: req.user.preferred_username,
          name: req.user.name
        }
      });
    },
    auth: 'keycloak'
  });

  // Create order (protected + scope check)
  apiPlugin.addRoute({
    path: '/api/orders',
    method: 'POST',
    handler: async (req, res) => {
      const userId = req.user.sub;
      const userEmail = req.user.email;
      const userName = req.user.preferred_username;
      const { productId, quantity, total } = req.body;

      // Verifica se tem scope necessário
      const scopes = req.user.scope?.split(' ') || [];
      if (!scopes.includes('orders:write') && scopes.length > 0) {
        return res.status(403).json({
          error: 'insufficient_scope',
          error_description: 'Scope "orders:write" required'
        });
      }

      const order = await ordersResource.insert({
        userId,
        userEmail,
        userName,
        productId,
        quantity,
        total,
        status: 'pending'
      });

      res.status(201).json(order);
    },
    auth: 'keycloak'
  });

  // Delete order (protected + role check)
  apiPlugin.addRoute({
    path: '/api/orders/:id',
    method: 'DELETE',
    handler: async (req, res) => {
      const userId = req.user.sub;
      const { id } = req.params;

      // Verifica se tem role de admin (realm-level ou client-level)
      const realmRoles = req.user.realm_access?.roles || [];
      const clientRoles = req.user.resource_access?.[KEYCLOAK_CONFIG.clientId]?.roles || [];
      const isAdmin = realmRoles.includes('admin') || clientRoles.includes('admin');

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
    auth: 'keycloak'
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

  return { db, apiPlugin, keycloakOIDC, ordersResource };
}

// ============================================================================
// KEYCLOAK SETUP GUIDE
// ============================================================================

function showKeycloakSetup() {
  console.log('\n📋 KEYCLOAK SETUP GUIDE\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('PASSO 1: Rodar Keycloak (Docker)');
  console.log('────────────────────────────────────────────────');
  console.log(DOCKER_SETUP);

  console.log('\nPASSO 2: Criar Realm');
  console.log('────────────────────────────────────────────────');
  console.log('1. Acessar: http://localhost:8080');
  console.log('2. Login: admin / admin');
  console.log('3. Keycloak Admin Console → Dropdown (canto superior esquerdo) → Create Realm');
  console.log('4. Realm name: "production"');
  console.log('5. Enabled: ON');
  console.log('6. Clique em "Create"\n');

  console.log('PASSO 3: Criar Client (sua API)');
  console.log('────────────────────────────────────────────────');
  console.log('1. Selecionar realm "production"');
  console.log('2. Clients → Create client');
  console.log('3. Client type: OpenID Connect');
  console.log('4. Client ID: "orders-api"');
  console.log('5. Name: "Orders API"');
  console.log('6. Next');
  console.log('7. Client authentication: ON (para confidential client)');
  console.log('8. Authorization: OFF (não precisa para resource server)');
  console.log('9. Next');
  console.log('10. Valid redirect URIs: "http://localhost:3000/*"');
  console.log('11. Web origins: "http://localhost:3000"');
  console.log('12. Save\n');

  console.log('PASSO 4: Copiar Client Secret');
  console.log('────────────────────────────────────────────────');
  console.log('1. Clients → orders-api → Credentials');
  console.log('2. Copiar "Client secret"');
  console.log('3. Atualizar KEYCLOAK_CONFIG.clientSecret neste arquivo\n');

  console.log('PASSO 5: Criar Roles (Client-level)');
  console.log('────────────────────────────────────────────────');
  console.log('1. Clients → orders-api → Roles');
  console.log('2. Create role');
  console.log('   - Role name: "admin"');
  console.log('   - Description: "Administrator role"');
  console.log('   - Save');
  console.log('3. Create role');
  console.log('   - Role name: "user"');
  console.log('   - Description: "Regular user role"');
  console.log('   - Save\n');

  console.log('PASSO 6: Criar Client Scopes');
  console.log('────────────────────────────────────────────────');
  console.log('1. Client Scopes → Create client scope');
  console.log('2. Name: "orders:read"');
  console.log('   Type: Optional');
  console.log('   Protocol: openid-connect');
  console.log('   Save');
  console.log('3. Name: "orders:write"');
  console.log('   Type: Optional');
  console.log('   Protocol: openid-connect');
  console.log('   Save');
  console.log('4. Clients → orders-api → Client scopes');
  console.log('5. Add client scope → orders:read, orders:write → Add (Optional)\n');

  console.log('PASSO 7: Criar Usuário de Teste');
  console.log('────────────────────────────────────────────────');
  console.log('1. Users → Create new user');
  console.log('2. Username: "john.doe"');
  console.log('3. Email: "john@example.com"');
  console.log('4. Email verified: ON');
  console.log('5. First name: "John"');
  console.log('6. Last name: "Doe"');
  console.log('7. Create');
  console.log('8. Credentials → Set password');
  console.log('   - Password: "password"');
  console.log('   - Temporary: OFF');
  console.log('   - Save');
  console.log('9. Role mapping → Assign role');
  console.log('   - Filter by clients → orders-api');
  console.log('   - Selecionar "user" (ou "admin")');
  console.log('   - Assign\n');

  console.log('═══════════════════════════════════════════════════════════\n');
}

// ============================================================================
// HELPER: Obter token do Keycloak (para testes)
// ============================================================================

async function getKeycloakToken() {
  console.log('\n🎫 Como obter token do Keycloak:\n');

  console.log('OPÇÃO 1: Password Grant (user login)');
  console.log('────────────────────────────────────────────────');
  console.log('curl -X POST \\');
  console.log(`  ${KEYCLOAK_URLS.tokenEndpoint} \\`);
  console.log('  -H "Content-Type: application/x-www-form-urlencoded" \\');
  console.log(`  -d "client_id=${KEYCLOAK_CONFIG.clientId}" \\`);
  console.log(`  -d "client_secret=${KEYCLOAK_CONFIG.clientSecret}" \\`);
  console.log('  -d "grant_type=password" \\');
  console.log('  -d "username=john.doe" \\');
  console.log('  -d "password=password" \\');
  console.log('  -d "scope=openid profile email orders:read orders:write"\n');

  console.log('OPÇÃO 2: Client Credentials (service-to-service)');
  console.log('────────────────────────────────────────────────');
  console.log('curl -X POST \\');
  console.log(`  ${KEYCLOAK_URLS.tokenEndpoint} \\`);
  console.log('  -H "Content-Type: application/x-www-form-urlencoded" \\');
  console.log(`  -d "client_id=${KEYCLOAK_CONFIG.clientId}" \\`);
  console.log(`  -d "client_secret=${KEYCLOAK_CONFIG.clientSecret}" \\`);
  console.log('  -d "grant_type=client_credentials" \\');
  console.log('  -d "scope=orders:read orders:write"\n');

  console.log('OPÇÃO 3: Authorization Code Flow (browser-based)');
  console.log('────────────────────────────────────────────────');
  console.log('1. Abrir no navegador:');
  console.log(`   ${KEYCLOAK_URLS.authEndpoint}?`);
  console.log(`   client_id=${KEYCLOAK_CONFIG.clientId}&`);
  console.log('   response_type=code&');
  console.log('   redirect_uri=http://localhost:3000/callback&');
  console.log('   scope=openid profile email orders:read orders:write');
  console.log('\n2. Usuário faz login no Keycloak');
  console.log('3. Keycloak redireciona com code');
  console.log('4. Trocar code por token:\n');
  console.log('curl -X POST \\');
  console.log(`  ${KEYCLOAK_URLS.tokenEndpoint} \\`);
  console.log('  -H "Content-Type: application/x-www-form-urlencoded" \\');
  console.log(`  -d "client_id=${KEYCLOAK_CONFIG.clientId}" \\`);
  console.log(`  -d "client_secret=${KEYCLOAK_CONFIG.clientSecret}" \\`);
  console.log('  -d "grant_type=authorization_code" \\');
  console.log('  -d "code=AUTHORIZATION_CODE" \\');
  console.log('  -d "redirect_uri=http://localhost:3000/callback"\n');
}

// ============================================================================
// HELPER: Testar API com token
// ============================================================================

async function testAPI(token) {
  console.log('\n🧪 Testando API com token do Keycloak:\n');

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
// COMPARAÇÃO: Keycloak vs Azure AD
// ============================================================================

function showComparison() {
  console.log('\n📊 COMPARAÇÃO: Keycloak vs Azure AD\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('| Feature | Keycloak | Azure AD |');
  console.log('|---------|----------|----------|');
  console.log('| **Custo** | ✅ Open-source (grátis) | 💰 Pago (pricing por usuário) |');
  console.log('| **Deploy** | 🐳 Docker/K8s (você gerencia) | ☁️ Microsoft gerencia |');
  console.log('| **Customização** | ✅ Total (código aberto) | ⚠️ Limitada (SaaS) |');
  console.log('| **Integração** | ✅ OIDC/SAML/LDAP | ✅ OIDC/SAML/Office 365 |');
  console.log('| **Realm Support** | ✅ Multi-realm | ❌ Single tenant (ou multi-tenant) |');
  console.log('| **User Storage** | ✅ DB/LDAP/Federation | ☁️ Azure AD DB |');
  console.log('| **Roles** | ✅ Realm + Client roles | ✅ App roles |');
  console.log('| **Scopes** | ✅ Custom scopes | ✅ Custom scopes |');
  console.log('| **Setup** | 🔧 Manual (Admin Console) | 🔧 Manual (Azure Portal) |');
  console.log('| **Performance** | ⚡ Depende do deploy | ⚡ Microsoft SLA |');
  console.log('| **Compliance** | 🔒 Você controla | 🔒 Microsoft SOC2/ISO |');

  console.log('\n**Issuer Format:**');
  console.log('- Keycloak: `http://keycloak.example.com/realms/production`');
  console.log('- Azure AD: `https://login.microsoftonline.com/{tenant-id}/v2.0`\n');

  console.log('**Claims Differences:**');
  console.log('- Keycloak:');
  console.log('  - sub: User ID');
  console.log('  - preferred_username: Username');
  console.log('  - realm_access.roles: Realm-level roles');
  console.log('  - resource_access.{client}.roles: Client-level roles');
  console.log('  - scope: Scopes (space-separated string)');
  console.log('- Azure AD:');
  console.log('  - oid: User Object ID');
  console.log('  - upn: User Principal Name');
  console.log('  - roles: App roles');
  console.log('  - scp: Scopes (space-separated string)\n');

  console.log('═══════════════════════════════════════════════════════════\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Keycloak Integration with s3db.js');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Mostrar comparação primeiro
  showComparison();

  // Verificar se configuração foi preenchida
  if (KEYCLOAK_CONFIG.baseUrl === 'http://localhost:8080' && KEYCLOAK_CONFIG.clientSecret === 'YOUR_CLIENT_SECRET') {
    console.log('⚠️  ATENÇÃO: Configure KEYCLOAK_CONFIG no topo do arquivo!\n');

    // Mostrar setup guide
    showKeycloakSetup();

    // Mostrar como obter token
    getKeycloakToken();

    return;
  }

  // Criar API
  const api = await createKeycloakProtectedAPI();

  // Mostrar como obter token
  getKeycloakToken();

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

export { createKeycloakProtectedAPI, KEYCLOAK_CONFIG, KEYCLOAK_URLS };
