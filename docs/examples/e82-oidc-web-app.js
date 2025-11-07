/**
 * Example 82: OIDC Web Application (Authorization Code Flow)
 *
 * How to build a web application that uses "Login with SSO" via OIDC.
 * The user clicks "Login", is redirected to the SSO server,
 * signs in there, and returns authenticated to this application.
 *
 * Architecture:
 * - Authorization Server (e80 - IdentityPlugin) - SSO server that issues tokens (port 4000)
 * - Web Application (this app) - Application that uses OIDC for login (port 3000)
 *
 * Run (after starting e80-sso-oauth2-server.js):
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

  // 2. Create an example resource (protected pages)
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

    // OIDC authentication - "Login with SSO"
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
            postLoginRedirect: '/dashboard',  // Redirect after login
            postLogoutRedirect: '/'  // Redirect after logout
          }
        }
      ],
      resource: 'users'  // Not used (OIDC pulls data from the token)
    },

    // CORS
    cors: {
      enabled: true,
      origin: '*',
      credentials: true
    },

    // Rotas personalizadas
    routes: {
      // Home page (public)
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
              <p>This application uses OIDC to authenticate through the SSO server.</p>
              <p><a href="/auth/login" class="btn">Login com SSO</a></p>
              <hr>
              <h2>Como funciona:</h2>
              <ol>
                <li>Clique em "Login com SSO"</li>
                <li>You will be redirected to http://localhost:4000 (SSO Server)</li>
                <li>Faça login com:
                  <ul>
                    <li>Email: admin@sso.local</li>
                    <li>Password: Admin123!</li>
                  </ul>
                </li>
                <li>You will be redirected back to /dashboard already authenticated</li>
              </ol>
            </body>
            </html>
          `);
        },
        auth: false  // Public page
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
                <h2>Welcome, ${user.name || user.username}!</h2>
                <p><strong>Email:</strong> ${user.email}</p>
                <p><strong>Role:</strong> ${user.role}</p>
                <p><strong>Scopes:</strong> ${user.scopes?.join(', ') || 'N/A'}</p>
              </div>

              <h3>📄 Complete user payload:</h3>
              <pre>${JSON.stringify(user, null, 2)}</pre>

              <p><a href="/posts" class="btn" style="background:#28a745">View Posts</a></p>
              <p><a href="/auth/logout" class="btn">Logout</a></p>
            </body>
            </html>
          `);
        },
        auth: false  // Manual validation inside the handler
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
              <p>Signed-in user: ${user.name} (${user.email})</p>

              ${posts.length === 0 ? '<p>No posts yet.</p>' : ''}
              ${posts.map(post => `
                <div class="post">
                  <h3>${post.title}</h3>
                  <p>${post.content}</p>
                  <small>By: ${post.authorId} | ${post.createdAt}</small>
                </div>
              `).join('')}

              <p><a href="/dashboard" class="btn">Back to Dashboard</a></p>
              <p><a href="/auth/logout" class="btn" style="background:#dc3545">Logout</a></p>
            </body>
            </html>
          `);
        },
        auth: true  // Requires authentication
      }
    }
  });

  await db.usePlugin(apiPlugin);

  // 4. Configurar guards no resource
  postsResource.config = {
    ...postsResource.config,
    guards: {
      list: 'openid',  // Requires the 'openid' scope (all authenticated users have it)
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
    content: 'This is the first post in our application!',
    authorId: 'admin@sso.local'
  });

  const post2 = await postsResource.insert({
    title: 'OIDC is awesome',
    content: 'With OIDC we can offer Single Sign-On in a simple, secure way.',
    authorId: 'admin@sso.local'
  });

  console.log('✅ Posts created:', [post1, post2].map(p => p.title).join(', '));
}

async function printUsage() {
  console.log(`\n🚀 Web app running at: ${APP_URL}`);
  console.log('\n📋 Available routes:\n');
  console.log('  Pages:');
  console.log(`    GET  ${APP_URL}/                    - Home page`);
  console.log(`    GET  ${APP_URL}/dashboard            - Dashboard (requires login)`);
  console.log(`    GET  ${APP_URL}/posts-html           - Post list (requires login)`);
  console.log('');
  console.log('  OIDC (auto-generated by the driver):');
  console.log(`    GET  ${APP_URL}/auth/login           - Login with SSO`);
  console.log(`    GET  ${APP_URL}/auth/callback        - OAuth2 callback`);
  console.log(`    GET  ${APP_URL}/auth/logout          - Logout`);
  console.log('');
  console.log('  REST API:');
  console.log(`    GET    ${APP_URL}/posts              - List posts (JSON)`);
  console.log(`    POST   ${APP_URL}/posts              - Create post (JSON)`);
  console.log('');
}

async function testConnection() {
  console.log('🧪 Testing the connection with the SSO server...\n');

  try {
    const response = await fetch(`${SSO_URL}/.well-known/openid-configuration`);

    if (!response.ok) {
      throw new Error(`SSO server is not running (${response.status})`);
    }

    const discovery = await response.json();
    console.log('✅ SSO Server detectado:', discovery.issuer);
  } catch (err) {
    console.error('❌ Failed to reach the SSO server:', err.message);
    console.error('   Make sure e80-sso-oauth2-server.js is running on port 4000!');
    process.exit(1);
  }
}

async function main() {
  console.log('🌐 Configurando Web Application (OIDC Client)...\n');

  // Check if the SSO server is alive
  await testConnection();

  const { db, postsResource } = await setupWebApp();

  await seedData(postsResource);
  await printUsage();

  console.log('💡 How to test:');
  console.log(`   1. Open the browser at: ${APP_URL}`);
  console.log('   2. Click "Login with SSO"');
  console.log('   3. Sign in on the SSO server (port 4000)');
  console.log('   4. You will be redirected back already authenticated!\n');

  console.log('✅ Web app ready to receive requests!\n');

  // Keep the server running
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Stopping the web app...');
    await db.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);
