/**
 * Example 82: OIDC Web Application (Authorization Code Flow)
 *
 * Como criar uma aplicação web que usa "Login com SSO" via OIDC.
 * O usuário clica em "Login", é redirecionado para o SSO Server,
 * faz login lá, e volta autenticado para esta aplicação.
 *
 * Arquitetura:
 * - Authorization Server (e80 - IdentityPlugin) - SSO Server que emite tokens (porta 4000)
 * - Web Application (esta app) - Aplicação que usa OIDC para login (porta 3000)
 *
 * Run (após iniciar o e80-sso-oauth2-server.js):
 *   node docs/examples/e82-oidc-web-app.js
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';

const APP_PORT = 3000;
const SSO_URL = 'http://localhost:4000'; // Identity Provider (e80 - IdentityPlugin)
const APP_URL = `http://localhost:${APP_PORT}`;

async function setupWebApp() {
  // 1. Criar database
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/my-web-app',
    encryptionKey: 'my-web-app-encryption-key-32!'
  });

  await db.connect();

  // 2. Criar resource de exemplo (páginas protegidas)
  const postsResource = await db.createResource({
    name: 'posts',
    attributes: {
      id: 'string|required',
      title: 'string|required',
      content: 'string|required',
      authorId: 'string|required',
      createdAt: 'string|optional'
    },
    timestamps: true
  });

  // 3. Configurar API Plugin com OIDC
  const apiPlugin = new ApiPlugin({
    port: APP_PORT,
    verbose: true,

    // Autenticação OIDC - "Login com SSO"
    auth: {
      drivers: [
        {
          driver: 'oidc',  // ← Authorization Code Flow
          config: {
            issuer: SSO_URL,
            clientId: 'app-client-123',  // Registrado no SSO Server
            clientSecret: 'super-secret-key-456',
            redirectUri: `${APP_URL}/auth/callback`,  // Callback URL
            scopes: ['openid', 'profile', 'email'],  // Scopes solicitados
            cookieSecret: 'my-super-secret-cookie-key-32chars!',  // 32+ chars
            cookieName: 'session',
            cookieMaxAge: 86400000,  // 24 horas
            postLoginRedirect: '/dashboard',  // Redirecionar após login
            postLogoutRedirect: '/'  // Redirecionar após logout
          }
        }
      ],
      resource: 'users'  // Não usado (OIDC usa dados do token)
    },

    // CORS
    cors: {
      enabled: true,
      origin: '*',
      credentials: true
    },

    // Rotas personalizadas
    routes: {
      // Página inicial (pública)
      'GET /': {
        handler: async (c) => {
          return c.html(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>My Web App - Login com SSO</title>
              <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
                .btn:hover { background: #0056b3; }
              </style>
            </head>
            <body>
              <h1>🔐 My Web App</h1>
              <p>Esta é uma aplicação que usa OIDC para autenticação via SSO Server.</p>
              <p><a href="/auth/login" class="btn">Login com SSO</a></p>
              <hr>
              <h2>Como funciona:</h2>
              <ol>
                <li>Clique em "Login com SSO"</li>
                <li>Você será redirecionado para http://localhost:4000 (SSO Server)</li>
                <li>Faça login com:
                  <ul>
                    <li>Email: admin@sso.local</li>
                    <li>Password: Admin123!</li>
                  </ul>
                </li>
                <li>Você será redirecionado de volta para /dashboard autenticado</li>
              </ol>
            </body>
            </html>
          `);
        },
        auth: false  // Página pública
      },

      // Dashboard (protegido)
      'GET /dashboard': {
        handler: async (c) => {
          const user = c.get('user');

          if (!user) {
            return c.redirect('/auth/login', 302);
          }

          return c.html(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Dashboard - My Web App</title>
              <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                .user-info { background: #f0f0f0; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
                .btn { display: inline-block; padding: 10px 20px; background: #dc3545; color: white; text-decoration: none; border-radius: 5px; }
                .btn:hover { background: #c82333; }
                pre { background: #f5f5f5; padding: 10px; border-radius: 3px; overflow-x: auto; }
              </style>
            </head>
            <body>
              <h1>📊 Dashboard</h1>
              <div class="user-info">
                <h2>Bem-vindo, ${user.name || user.username}!</h2>
                <p><strong>Email:</strong> ${user.email}</p>
                <p><strong>Role:</strong> ${user.role}</p>
                <p><strong>Scopes:</strong> ${user.scopes?.join(', ') || 'N/A'}</p>
              </div>

              <h3>📄 Dados completos do usuário:</h3>
              <pre>${JSON.stringify(user, null, 2)}</pre>

              <p><a href="/posts" class="btn" style="background:#28a745">Ver Posts</a></p>
              <p><a href="/auth/logout" class="btn">Logout</a></p>
            </body>
            </html>
          `);
        },
        auth: false  // Validação manual dentro do handler
      },

      // Lista de posts (protegida por guard)
      'GET /posts-html': {
        handler: async (c, { resource, database }) => {
          const user = c.get('user');
          const postsResource = database.resources.posts;
          const posts = await postsResource.list({ limit: 10 });

          return c.html(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Posts - My Web App</title>
              <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                .post { background: #f9f9f9; padding: 15px; margin-bottom: 10px; border-radius: 5px; }
                .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
              </style>
            </head>
            <body>
              <h1>📝 Posts</h1>
              <p>Usuário logado: ${user.name} (${user.email})</p>

              ${posts.length === 0 ? '<p>Nenhum post ainda.</p>' : ''}
              ${posts.map(post => `
                <div class="post">
                  <h3>${post.title}</h3>
                  <p>${post.content}</p>
                  <small>Por: ${post.authorId} | ${post.createdAt}</small>
                </div>
              `).join('')}

              <p><a href="/dashboard" class="btn">Voltar ao Dashboard</a></p>
              <p><a href="/auth/logout" class="btn" style="background:#dc3545">Logout</a></p>
            </body>
            </html>
          `);
        },
        auth: true  // Requer autenticação
      }
    }
  });

  await db.usePlugin(apiPlugin);

  // 4. Configurar guards no resource
  postsResource.config = {
    ...postsResource.config,
    guards: {
      list: 'openid',  // Requer scope 'openid' (todos autenticados têm)
      get: 'openid',
      create: 'profile',  // Requer scope 'profile'
      update: 'profile',
      delete: 'profile'
    }
  };

  return { db, postsResource };
}

async function seedData(postsResource) {
  console.log('\n📝 Criando posts de exemplo...\n');

  const post1 = await postsResource.insert({
    title: 'Primeiro Post',
    content: 'Este é o primeiro post da nossa aplicação!',
    authorId: 'admin@sso.local'
  });

  const post2 = await postsResource.insert({
    title: 'OIDC é incrível',
    content: 'Com OIDC, podemos ter Single Sign-On de forma simples e segura.',
    authorId: 'admin@sso.local'
  });

  console.log('✅ Posts criados:', [post1, post2].map(p => p.title).join(', '));
}

async function printUsage() {
  console.log(`\n🚀 Web App rodando em: ${APP_URL}`);
  console.log('\n📋 Rotas disponíveis:\n');
  console.log('  Páginas:');
  console.log(`    GET  ${APP_URL}/                    - Página inicial`);
  console.log(`    GET  ${APP_URL}/dashboard            - Dashboard (requer login)`);
  console.log(`    GET  ${APP_URL}/posts-html           - Lista de posts (requer login)`);
  console.log('');
  console.log('  OIDC (auto-criadas pelo driver):');
  console.log(`    GET  ${APP_URL}/auth/login           - Login com SSO`);
  console.log(`    GET  ${APP_URL}/auth/callback        - Callback OAuth2`);
  console.log(`    GET  ${APP_URL}/auth/logout          - Logout`);
  console.log('');
  console.log('  API REST:');
  console.log(`    GET    ${APP_URL}/posts              - Lista posts (JSON)`);
  console.log(`    POST   ${APP_URL}/posts              - Criar post (JSON)`);
  console.log('');
}

async function testConnection() {
  console.log('🧪 Testando conexão com SSO Server...\n');

  try {
    const response = await fetch(`${SSO_URL}/.well-known/openid-configuration`);

    if (!response.ok) {
      throw new Error(`SSO Server não está rodando (${response.status})`);
    }

    const discovery = await response.json();
    console.log('✅ SSO Server detectado:', discovery.issuer);
  } catch (err) {
    console.error('❌ Erro ao conectar com SSO Server:', err.message);
    console.error('   Certifique-se de que o e80-sso-oauth2-server.js está rodando na porta 4000!');
    process.exit(1);
  }
}

async function main() {
  console.log('🌐 Configurando Web Application (OIDC Client)...\n');

  // Verificar se SSO Server está rodando
  await testConnection();

  const { db, postsResource } = await setupWebApp();

  await seedData(postsResource);
  await printUsage();

  console.log('💡 Como testar:');
  console.log(`   1. Abra o navegador em: ${APP_URL}`);
  console.log('   2. Clique em "Login com SSO"');
  console.log('   3. Faça login no SSO Server (porta 4000)');
  console.log('   4. Você será redirecionado de volta autenticado!\n');

  console.log('✅ Web App pronto para receber requisições!\n');

  // Manter servidor rodando
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Parando Web App...');
    await db.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);
