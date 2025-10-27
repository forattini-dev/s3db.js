/**
 * Example 80: OAuth2/OIDC SSO Server (Authorization Server)
 *
 * Como configurar o s3db.js como um servidor autoritativo de OAuth2 + OIDC
 * usando o IdentityPlugin onde outras aplicações podem se conectar para autenticação.
 *
 * Arquitetura:
 * - SSO Server (este servidor) - Gerencia usuários e autenticação
 * - Resource Servers (outras apps) - Consomem tokens do SSO Server
 *
 * Run:
 *   node docs/examples/e80-sso-oauth2-server.js
 */

import { Database } from '../../src/database.class.js';
import { IdentityPlugin } from '../../src/plugins/identity/index.js';

const SSO_PORT = 4000;
const SSO_URL = `http://localhost:${SSO_PORT}`;

async function setupSSOServer() {
  // 1. Criar database
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/sso-server',
    encryptionKey: 'sso-encryption-key-32-chars!!'
  });

  await db.connect();

  // 2. Configurar IdentityPlugin - Authorization Server dedicado
  // O IdentityPlugin automaticamente cria os resources:
  //   - plg_oauth_keys (RSA keys para token signing)
  //   - plg_oauth_clients (registered applications)
  //   - plg_auth_codes (authorization codes)
  //   - users (ou resource customizado)
  const identityPlugin = new IdentityPlugin({
    port: SSO_PORT,
    issuer: SSO_URL,
    verbose: true,

    // OAuth2/OIDC configuration
    supportedScopes: ['openid', 'profile', 'email', 'read:api', 'write:api', 'offline_access'],
    supportedGrantTypes: ['authorization_code', 'client_credentials', 'refresh_token'],
    supportedResponseTypes: ['code', 'token', 'id_token'],

    // Token expiration
    accessTokenExpiry: '15m',
    idTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
    authCodeExpiry: '10m',

    // User resource (auto-created if not exists)
    userResource: 'users',

    // CORS para permitir outras aplicações
    cors: {
      enabled: true,
      origin: '*',
      credentials: true
    },

    // Security headers
    security: {
      enabled: true
    },

    // Logging
    logging: {
      enabled: true,
      format: ':method :path :status :response-time ms'
    }
  });

  await db.usePlugin(identityPlugin);

  return { db, identityPlugin };
}

async function seedData(db) {
  console.log('\n📝 Criando dados de exemplo...\n');

  const usersResource = db.resources.users;
  const clientsResource = db.resources.plg_oauth_clients;

  // Criar usuário de teste
  const user = await usersResource.insert({
    email: 'admin@sso.local',
    password: 'Admin123!',
    name: 'Admin User',
    scopes: ['openid', 'profile', 'email', 'read:api', 'write:api'],
    active: true
  });

  console.log('✅ Usuário criado:', {
    id: user.id,
    email: user.email,
    name: user.name,
    scopes: user.scopes
  });

  // Criar OAuth2 client de exemplo (outra aplicação)
  const client = await clientsResource.insert({
    clientId: 'app-client-123',
    clientSecret: 'super-secret-key-456',
    name: 'My Application',
    redirectUris: [
      'http://localhost:3000/callback',
      'http://localhost:3001/callback'
    ],
    allowedScopes: ['openid', 'profile', 'email', 'read:api'],
    grantTypes: ['authorization_code', 'refresh_token'],
    active: true
  });

  console.log('\n✅ OAuth2 Client criado:', {
    id: client.id,
    clientId: client.clientId,
    name: client.name,
    redirectUris: client.redirectUris
  });
}

async function printEndpoints() {
  console.log('\n🚀 SSO Server rodando em:', SSO_URL);
  console.log('\n📋 Endpoints OAuth2/OIDC disponíveis:\n');
  console.log('  Discovery:');
  console.log(`    GET  ${SSO_URL}/.well-known/openid-configuration`);
  console.log(`    GET  ${SSO_URL}/.well-known/jwks.json`);
  console.log('');
  console.log('  OAuth2:');
  console.log(`    GET  ${SSO_URL}/oauth/authorize`);
  console.log(`    POST ${SSO_URL}/oauth/authorize`);
  console.log(`    POST ${SSO_URL}/oauth/token`);
  console.log(`    POST ${SSO_URL}/oauth/introspect`);
  console.log(`    POST ${SSO_URL}/oauth/register`);
  console.log(`    POST ${SSO_URL}/oauth/revoke`);
  console.log('');
  console.log('  OIDC:');
  console.log(`    GET  ${SSO_URL}/oauth/userinfo`);
  console.log('');
  console.log('  Health:');
  console.log(`    GET  ${SSO_URL}/health`);
  console.log(`    GET  ${SSO_URL}/health/live`);
  console.log(`    GET  ${SSO_URL}/health/ready`);
  console.log('');
}

async function demonstrateFlow() {
  console.log('💡 Exemplo de Fluxo de Autenticação:\n');
  console.log('1. Client redireciona usuário para:');
  console.log(`   ${SSO_URL}/oauth/authorize?response_type=code&client_id=app-client-123&redirect_uri=http://localhost:3000/callback&scope=openid profile email`);
  console.log('');
  console.log('2. Usuário faz login na UI do SSO:');
  console.log('   - Email: admin@sso.local');
  console.log('   - Password: Admin123!');
  console.log('');
  console.log('3. SSO redireciona de volta com authorization code:');
  console.log('   http://localhost:3000/callback?code=AUTH_CODE&state=STATE');
  console.log('');
  console.log('4. Client troca código por tokens:');
  console.log(`   POST ${SSO_URL}/oauth/token`);
  console.log('   Headers: Authorization: Basic base64(client_id:client_secret)');
  console.log('   Body: grant_type=authorization_code&code=AUTH_CODE&redirect_uri=http://localhost:3000/callback');
  console.log('');
  console.log('5. Resposta com tokens:');
  console.log('   {');
  console.log('     "access_token": "eyJhbGc...",');
  console.log('     "id_token": "eyJhbGc...",');
  console.log('     "refresh_token": "eyJhbGc...",');
  console.log('     "token_type": "Bearer",');
  console.log('     "expires_in": 900');
  console.log('   }');
  console.log('');
  console.log('6. Client valida token no Resource Server (exemplo e81):');
  console.log('   Authorization: Bearer ACCESS_TOKEN');
  console.log('');
  console.log('7. Client pode renovar tokens:');
  console.log(`   POST ${SSO_URL}/oauth/token`);
  console.log('   Body: grant_type=refresh_token&refresh_token=REFRESH_TOKEN');
  console.log('');
}

async function testDiscovery() {
  console.log('🧪 Testando Discovery Endpoint...\n');

  const response = await fetch(`${SSO_URL}/.well-known/openid-configuration`);
  const discovery = await response.json();

  console.log('✅ Discovery Document:', JSON.stringify(discovery, null, 2));
}

async function testClientCredentials(db) {
  console.log('\n\n🧪 Testando Client Credentials Grant...\n');

  const client = await db.resources.plg_oauth_clients.query({ clientId: 'app-client-123' });
  const clientData = client.items[0];

  const response = await fetch(`${SSO_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientData.clientId}:${clientData.clientSecret}`).toString('base64')
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'read:api'
    })
  });

  const token = await response.json();
  console.log('✅ Token obtido:', {
    token_type: token.token_type,
    expires_in: token.expires_in,
    scope: token.scope,
    access_token: token.access_token?.substring(0, 50) + '...'
  });
}

async function main() {
  console.log('🔐 Configurando SSO Server (OAuth2 + OIDC) com IdentityPlugin...\n');

  const { db, identityPlugin } = await setupSSOServer();

  await seedData(db);
  await printEndpoints();
  await demonstrateFlow();

  // Aguardar um pouco para o servidor iniciar
  await new Promise(resolve => setTimeout(resolve, 1000));

  await testDiscovery();
  await testClientCredentials(db);

  console.log('\n✅ SSO Server pronto para receber conexões!');
  console.log('\n💡 Outras aplicações podem se conectar usando:');
  console.log(`   Discovery URL: ${SSO_URL}/.well-known/openid-configuration`);
  console.log('   Client ID: app-client-123');
  console.log('   Client Secret: super-secret-key-456');
  console.log('\n💡 Para testar com Resource Server, rode:');
  console.log('   node docs/examples/e81-oauth2-resource-server.js\n');

  // Manter servidor rodando
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Parando SSO Server...');
    await identityPlugin.onStop();
    await db.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);
