/**
 * Example 81: OAuth2/OIDC Resource Server (Client Application)
 *
 * How to configure an application that CONSUMES tokens from an OAuth2/OIDC server.
 * This application validates tokens issued by the Identity Provider (e80).
 *
 * Architecture:
 * - Authorization Server (e80 - IdentityPlugin) - Issues JWT tokens (port 4000)
 * - Resource Server (this app - ApiPlugin) - Validates tokens (port 3000)
 *
 * Run (after starting e80-sso-oauth2-server.js):
 *   node docs/examples/e81-oauth2-resource-server.js
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';

const APP_PORT = 3000;
const SSO_URL = 'http://localhost:4000'; // Identity Provider URL (e80 - IdentityPlugin)

async function setupResourceServer() {
  // 1. Create the database
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/my-app',
    encryptionKey: 'my-app-encryption-key-32-chars'
  });

  await db.connect();

  // 2. Create an example resource (protected by OAuth2)
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

  // 3. Configure the API Plugin with an OAuth2 client
  const apiPlugin = new ApiPlugin({
    port: APP_PORT,
    verbose: true,

    // OIDC authentication - validates tokens from the Identity Provider
    auth: {
      drivers: [
        {
          driver: 'oidc',  // ← Resource server mode (validates JWT tokens from IdentityPlugin)
          config: {
            issuer: SSO_URL,  // Identity Provider URL (IdentityPlugin)
            // jwksUri is discovered automatically via /.well-known/openid-configuration
            audience: 'my-api',  // Optional: enforce token audience
            requiredScopes: ['read:api', 'write:api'],  // Required scopes
            clockTolerance: 60  // 60-second tolerance for exp/nbf
          }
        }
      ],
      resource: 'users'  // Not used when there is no local user lookup
    },

    // CORS so the frontend can call the API
    cors: {
      enabled: true,
      origin: '*',
      credentials: true
    }
  });

  await db.usePlugin(apiPlugin);

  // 4. Configure guards on the resource (authorization by scope)
  carsResource.config = {
    ...carsResource.config,
    guards: {
      list: 'read:api',      // Require read:api scope to list
      get: 'read:api',       // Require read:api scope to fetch
      create: 'write:api',   // Require write:api scope to create
      update: 'write:api',   // Require write:api scope to update
      delete: 'write:api'    // Require write:api scope to delete
    }
  };

  return { db, carsResource };
}

async function seedData(carsResource) {
  console.log('\n📝 Creating sample data...\n');

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

  console.log('✅ Cars created:', [car1, car2].map(c => `${c.brand} ${c.model}`).join(', '));
}

async function printUsage() {
  console.log('\n🚀 Resource server running at: http://localhost:3000');
  console.log('\n📋 Available endpoints:\n');
  console.log('  Cars API:');
  console.log('    GET    http://localhost:3000/cars       (requires scope: read:api)');
  console.log('    GET    http://localhost:3000/cars/:id   (requires scope: read:api)');
  console.log('    POST   http://localhost:3000/cars       (requires scope: write:api)');
  console.log('    PUT    http://localhost:3000/cars/:id   (requires scope: write:api)');
  console.log('    DELETE http://localhost:3000/cars/:id   (requires scope: write:api)');
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
