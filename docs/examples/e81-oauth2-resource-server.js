/**
 * Example 81: OAuth2/OIDC Resource Server (Client Application)
 *
 * Como configurar uma aplicação que CONSOME tokens de um servidor OAuth2/OIDC.
 * Esta aplicação valida tokens emitidos pelo Identity Provider (e80).
 *
 * Arquitetura:
 * - Authorization Server (e80 - IdentityPlugin) - Emite tokens JWT (porta 4000)
 * - Resource Server (esta app - ApiPlugin) - Valida tokens (porta 3000)
 *
 * Run (após iniciar o e80-sso-oauth2-server.js):
 *   node docs/examples/e81-oauth2-resource-server.js
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';

const APP_PORT = 3000;
const SSO_URL = 'http://localhost:4000'; // URL do Identity Provider (e80 - IdentityPlugin)

async function setupResourceServer() {
  // 1. Criar database
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/my-app',
    encryptionKey: 'my-app-encryption-key-32-chars'
  });

  await db.connect();

  // 2. Criar resource de exemplo (protegido por OAuth2)
  const carsResource = await db.createResource({
    name: 'cars',
    attributes: {
      id: 'string|required',
      brand: 'string|required',
      model: 'string|required',
      year: 'number|required',
      price: 'number|required',
      createdAt: 'string|optional'
    },
    timestamps: true
  });

  // 3. Configurar API Plugin com OAuth2 Client
  const apiPlugin = new ApiPlugin({
    port: APP_PORT,
    verbose: true,

    // Autenticação OIDC - Valida tokens do Identity Provider
    auth: {
      drivers: [
        {
          driver: 'oidc',  // ← Resource Server (valida tokens JWT do IdentityPlugin)
          config: {
            issuer: SSO_URL,  // URL do Identity Provider (IdentityPlugin)
            // jwksUri é descoberto automaticamente via /.well-known/openid-configuration
            audience: 'my-api',  // Opcional: valida audiência do token
            requiredScopes: ['read:api', 'write:api'],  // Scopes necessários
            clockTolerance: 60  // Tolerância de 60s para exp/nbf
          }
        }
      ],
      resource: 'users'  // Não usado quando não há user lookup local
    },

    // CORS para permitir requisições do frontend
    cors: {
      enabled: true,
      origin: '*',
      credentials: true
    }
  });

  await db.usePlugin(apiPlugin);

  // 4. Configurar guards no resource (autorização por scopes)
  carsResource.config = {
    ...carsResource.config,
    guards: {
      list: 'read:api',      // Requer scope 'read:api' para listar
      get: 'read:api',       // Requer scope 'read:api' para ler
      create: 'write:api',   // Requer scope 'write:api' para criar
      update: 'write:api',   // Requer scope 'write:api' para atualizar
      delete: 'write:api'    // Requer scope 'write:api' para deletar
    }
  };

  return { db, carsResource };
}

async function seedData(carsResource) {
  console.log('\n📝 Criando dados de exemplo...\n');

  const car1 = await carsResource.insert({
    brand: 'Tesla',
    model: 'Model 3',
    year: 2024,
    price: 45000
  });

  const car2 = await carsResource.insert({
    brand: 'Toyota',
    model: 'Corolla',
    year: 2023,
    price: 25000
  });

  console.log('✅ Carros criados:', [car1, car2].map(c => `${c.brand} ${c.model}`).join(', '));
}

async function printUsage() {
  console.log('\n🚀 Resource Server rodando em: http://localhost:3000');
  console.log('\n📋 Endpoints disponíveis:\n');
  console.log('  Cars API:');
  console.log('    GET    http://localhost:3000/cars       (requer scope: read:api)');
  console.log('    GET    http://localhost:3000/cars/:id   (requer scope: read:api)');
  console.log('    POST   http://localhost:3000/cars       (requer scope: write:api)');
  console.log('    PUT    http://localhost:3000/cars/:id   (requer scope: write:api)');
  console.log('    DELETE http://localhost:3000/cars/:id   (requer scope: write:api)');
  console.log('');
}

async function demonstrateFlow() {
  console.log('💡 Como usar esta API:\n');
  console.log('1. Obter token do Identity Provider (Client Credentials Grant):');
  console.log('   POST http://localhost:4000/oauth/token');
  console.log('   Headers: Authorization: Basic base64(client_id:client_secret)');
  console.log('   Body: grant_type=client_credentials&scope=read:api write:api');
  console.log('   Response: { "access_token": "eyJhbGc...", "expires_in": 900 }');
  console.log('');
  console.log('2. OU usar OAuth2 Authorization Code Flow (para usuários):');
  console.log('   GET http://localhost:4000/oauth/authorize?...');
  console.log('   → Login UI (email: admin@sso.local, password: Admin123!)');
  console.log('   → Callback com code');
  console.log('   → POST http://localhost:4000/oauth/token (troca code por tokens)');
  console.log('   Response: { "access_token": "...", "id_token": "...", "refresh_token": "..." }');
  console.log('');
  console.log('3. Usar o access_token para acessar esta API:');
  console.log('   GET http://localhost:3000/cars');
  console.log('   Header: Authorization: Bearer eyJhbGc...');
  console.log('');
  console.log('4. Exemplo com curl (Client Credentials):');
  console.log('   # Obter token (usando client criado no e80)');
  console.log('   TOKEN=$(curl -X POST http://localhost:4000/oauth/token \\');
  console.log('     -H "Authorization: Basic $(echo -n "app-client-123:super-secret-key-456" | base64)" \\');
  console.log('     -H "Content-Type: application/x-www-form-urlencoded" \\');
  console.log('     -d "grant_type=client_credentials&scope=read:api write:api" \\');
  console.log('     | jq -r \'.access_token\')');
  console.log('');
  console.log('   # Listar carros (token com scope: read:api)');
  console.log('   curl http://localhost:3000/cars \\');
  console.log('     -H "Authorization: Bearer $TOKEN"');
  console.log('');
  console.log('   # Criar carro (token com scope: write:api)');
  console.log('   curl -X POST http://localhost:3000/cars \\');
  console.log('     -H "Authorization: Bearer $TOKEN" \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"brand":"Honda","model":"Civic","year":2024,"price":28000}\'');
  console.log('');
}

async function testConnection() {
  console.log('🧪 Testando conexão com Identity Provider...\n');

  try {
    const response = await fetch(`${SSO_URL}/.well-known/openid-configuration`);

    if (!response.ok) {
      throw new Error(`Identity Provider não está rodando (${response.status})`);
    }

    const discovery = await response.json();
    console.log('✅ Identity Provider detectado:', discovery.issuer);
    console.log('   JWKS URI:', discovery.jwks_uri);
    console.log('   Scopes suportados:', discovery.scopes_supported.join(', '));
    console.log('   Grant types:', discovery.grant_types_supported.join(', '));
  } catch (err) {
    console.error('❌ Erro ao conectar com Identity Provider:', err.message);
    console.error('   Certifique-se de que o e80-sso-oauth2-server.js (IdentityPlugin) está rodando na porta 4000!');
    process.exit(1);
  }
}

async function main() {
  console.log('🔐 Configurando Resource Server (OAuth2 Client)...\n');

  // Verificar se SSO Server está rodando
  await testConnection();

  const { db, carsResource } = await setupResourceServer();

  await seedData(carsResource);
  await printUsage();
  await demonstrateFlow();

  console.log('\n✅ Resource Server pronto para receber requisições!');
  console.log('   Valida tokens emitidos por: http://localhost:4000');
  console.log('   Guards configurados: read:api, write:api\n');

  // Manter servidor rodando
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Parando Resource Server...');
    await db.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);
