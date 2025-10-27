/**
 * Example 80: OAuth2/OIDC SSO Server (Authorization Server)
 *
 * Como configurar o s3db.js como um servidor autoritativo de OAuth2 + OIDC
 * onde outras aplicações podem se conectar para autenticação.
 *
 * Arquitetura:
 * - SSO Server (este servidor) - Gerencia usuários e autenticação
 * - Resource Servers (outras apps) - Consomem tokens do SSO Server
 *
 * Run:
 *   node docs/examples/e80-sso-oauth2-server.js
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';
import { OAuth2Server } from '../../src/plugins/api/auth/oauth2-server.js';

const SSO_PORT = 4000;
const SSO_URL = `http://localhost:${SSO_PORT}`;

async function setupSSOServer() {
  // 1. Criar database
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/sso-server',
    encryptionKey: 'sso-encryption-key-32-chars!!'
  });

  await db.connect();

  // 2. Criar resources necessários para OAuth2/OIDC

  // Resource para chaves RSA (assinatura de tokens)
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
    }
  });

  // Resource para usuários (fonte de autenticação)
  const usersResource = await db.createResource({
    name: 'users',
    attributes: {
      email: 'string|required|email',
      password: 'secret|required',
      name: 'string|required',
      picture: 'url|optional',
      role: 'string|default:user',
      scopes: 'array|items:string|optional',  // Scopes do usuário
      active: 'boolean|default:true'
    }
  });

  // Resource para OAuth2 clients (aplicações que vão conectar)
  const clientsResource = await db.createResource({
    name: 'oauth_clients',
    attributes: {
      clientId: 'string|required',
      clientSecret: 'secret|required',
      name: 'string|required',
      redirectUris: 'array|items:string|required',
      allowedScopes: 'array|items:string|optional',
      grantTypes: 'array|items:string|default:["authorization_code","refresh_token"]',
      active: 'boolean|default:true'
    }
  });

  // Resource para authorization codes (fluxo authorization_code)
  const authCodesResource = await db.createResource({
    name: 'auth_codes',
    attributes: {
      code: 'string|required',
      clientId: 'string|required',
      userId: 'string|required',
      redirectUri: 'string|required',
      scope: 'string',
      expiresAt: 'string|required',
      used: 'boolean|default:false'
    }
  });

  // 3. Criar instância do OAuth2 Server
  const oauth2 = new OAuth2Server({
    issuer: SSO_URL,
    keyResource: keysResource,
    userResource: usersResource,
    clientResource: clientsResource,
    authCodeResource: authCodesResource,
    supportedScopes: ['openid', 'profile', 'email', 'read:api', 'write:api', 'offline_access'],
    supportedGrantTypes: ['authorization_code', 'client_credentials', 'refresh_token'],
    accessTokenExpiry: '15m',
    idTokenExpiry: '15m',
    refreshTokenExpiry: '7d'
  });

  await oauth2.initialize();

  // 4. Configurar API Plugin com OAuth2 Server
  const apiPlugin = new ApiPlugin({
    port: SSO_PORT,
    verbose: true,

    // Autenticação básica para gerenciar usuários
    auth: {
      drivers: [
        { driver: 'jwt', config: { secret: 'sso-jwt-secret' } }
      ],
      resource: 'users'
    },

    // CORS para permitir outras aplicações
    cors: {
      enabled: true,
      origin: '*',
      credentials: true
    },

    // Custom routes para OAuth2/OIDC endpoints
    routes: {
      // OIDC Discovery
      'GET /.well-known/openid-configuration': {
        handler: oauth2.discoveryHandler.bind(oauth2),
        auth: false
      },

      // JWKS (public keys)
      'GET /.well-known/jwks.json': {
        handler: oauth2.jwksHandler.bind(oauth2),
        auth: false
      },

      // Token endpoint (POST /auth/token)
      'POST /oauth/token': {
        handler: oauth2.tokenHandler.bind(oauth2),
        auth: false
      },

      // UserInfo endpoint (GET /oauth/userinfo)
      'GET /oauth/userinfo': {
        handler: oauth2.userinfoHandler.bind(oauth2),
        auth: false
      },

      // Token introspection (POST /oauth/introspect)
      'POST /oauth/introspect': {
        handler: oauth2.introspectHandler.bind(oauth2),
        auth: false
      },

      // Authorization endpoint (GET /oauth/authorize)
      'GET /oauth/authorize': {
        handler: oauth2.authorizeHandler.bind(oauth2),
        auth: false
      },

      // Client registration (POST /oauth/register)
      'POST /oauth/register': {
        handler: oauth2.registerClientHandler.bind(oauth2),
        auth: true  // Requer autenticação JWT
      }
    }
  });

  await db.usePlugin(apiPlugin);

  return { db, oauth2, usersResource, clientsResource };
}

async function seedData(usersResource, clientsResource) {
  console.log('\n📝 Criando dados de exemplo...\n');

  // Criar usuário de teste
  const user = await usersResource.insert({
    email: 'admin@sso.local',
    password: 'Admin123!',
    name: 'Admin User',
    picture: 'https://i.pravatar.cc/150?u=admin',
    role: 'admin',
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
  console.log(`    POST ${SSO_URL}/oauth/token`);
  console.log(`    POST ${SSO_URL}/oauth/introspect`);
  console.log(`    POST ${SSO_URL}/oauth/register`);
  console.log('');
  console.log('  OIDC:');
  console.log(`    GET  ${SSO_URL}/oauth/userinfo`);
  console.log('');
  console.log('  Autenticação (JWT):');
  console.log(`    POST ${SSO_URL}/auth/register`);
  console.log(`    POST ${SSO_URL}/auth/login`);
  console.log(`    GET  ${SSO_URL}/auth/me`);
  console.log('');
}

async function demonstrateFlow() {
  console.log('💡 Exemplo de Fluxo de Autenticação:\n');
  console.log('1. Client redireciona usuário para:');
  console.log(`   ${SSO_URL}/oauth/authorize?response_type=code&client_id=app-client-123&redirect_uri=http://localhost:3000/callback&scope=openid profile email`);
  console.log('');
  console.log('2. Usuário faz login (credenciais do SSO):');
  console.log('   - Email: admin@sso.local');
  console.log('   - Password: Admin123!');
  console.log('');
  console.log('3. SSO redireciona de volta com authorization code:');
  console.log('   http://localhost:3000/callback?code=AUTH_CODE');
  console.log('');
  console.log('4. Client troca código por tokens:');
  console.log(`   POST ${SSO_URL}/oauth/token`);
  console.log('   Body: grant_type=authorization_code&code=AUTH_CODE&client_id=app-client-123&client_secret=super-secret-key-456');
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
  console.log('6. Client valida token no Resource Server:');
  console.log(`   POST ${SSO_URL}/oauth/introspect`);
  console.log('   Body: token=ACCESS_TOKEN&client_id=app-client-123&client_secret=super-secret-key-456');
  console.log('');
}

async function testDiscovery() {
  console.log('🧪 Testando Discovery Endpoint...\n');

  const response = await fetch(`${SSO_URL}/.well-known/openid-configuration`);
  const discovery = await response.json();

  console.log('✅ Discovery Document:', JSON.stringify(discovery, null, 2));
}

async function main() {
  console.log('🔐 Configurando SSO Server (OAuth2 + OIDC)...\n');

  const { db, oauth2, usersResource, clientsResource } = await setupSSOServer();

  await seedData(usersResource, clientsResource);
  await printEndpoints();
  await demonstrateFlow();

  // Aguardar um pouco para o servidor iniciar
  await new Promise(resolve => setTimeout(resolve, 1000));

  await testDiscovery();

  console.log('\n✅ SSO Server pronto para receber conexões!');
  console.log('\n💡 Outras aplicações podem se conectar usando:');
  console.log(`   Discovery URL: ${SSO_URL}/.well-known/openid-configuration`);
  console.log('   Client ID: app-client-123');
  console.log('   Client Secret: super-secret-key-456\n');

  // Manter servidor rodando
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Parando SSO Server...');
    await db.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);
