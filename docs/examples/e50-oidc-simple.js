/**
 * Example: OIDC Authentication (Simple)
 *
 * Demonstra autenticação OIDC básica com rotas protegidas.
 * Funciona com Azure AD, Google, Okta, Auth0, etc.
 *
 * Setup:
 * 1. Substitua as credenciais abaixo
 * 2. Configure redirect URI no seu provedor OAuth2
 * 3. node docs/examples/e50-oidc-simple.js
 * 4. Abra http://localhost:3000
 */

import { Database } from '../../src/index.js';

// ⚠️ SUBSTITUA COM SUAS CREDENCIAIS
const OIDC_CONFIG = {
  // Azure AD (exemplo)
  issuer: 'https://login.microsoftonline.com/YOUR-TENANT-ID/v2.0',
  clientId: 'YOUR-CLIENT-ID',
  clientSecret: 'YOUR-CLIENT-SECRET',

  // Google (alternativa)
  // issuer: 'https://accounts.google.com',
  // clientId: 'YOUR-GOOGLE-CLIENT-ID.apps.googleusercontent.com',
  // clientSecret: 'YOUR-GOOGLE-SECRET',

  redirectUri: 'http://localhost:3000/auth/callback',
  cookieSecret: 'change-this-to-random-32-chars!!!',  // ← IMPORTANTE: Mude isso!
};

const db = new Database({
  connectionString: 'memory://test/oidc-demo',

  plugins: [
    {
      name: 'api',
      config: {
        port: 3000,
        verbose: true,  // ← Ativa logs de requests, rotas, auth, etc

        // Configuração de autenticação
        auth: {
          resource: 'users',  // Resource onde usuários serão salvos

          drivers: [
            {
              driver: 'oidc',
              config: {
                ...OIDC_CONFIG,
                scopes: ['openid', 'profile', 'email', 'offline_access'],
                autoCreateUser: true,  // Cria usuário automaticamente
                defaultRole: 'user',

                // Hook após autenticação (opcional)
                onUserAuthenticated: async ({ user, created, claims, context }) => {
                  console.log(`\n✅ Usuário autenticado:`);
                  console.log(`   Email: ${user.email}`);
                  console.log(`   Nome: ${user.name}`);
                  console.log(`   Novo usuário: ${created}`);
                }
              }
            }
          ],

          // Definir quais rotas são protegidas
          pathRules: [
            // Rotas públicas
            { path: '/', methods: ['GET'], auth: false },
            { path: '/public', methods: ['GET'], auth: false },

            // Rotas protegidas (requerem OIDC)
            { path: '/dashboard', methods: ['GET'], auth: true, drivers: ['oidc'] },
            { path: '/profile', methods: ['GET'], auth: true, drivers: ['oidc'] },
            { path: '/api/**', methods: ['*'], auth: true, drivers: ['oidc'] }
          ]
        },

        // Rotas da aplicação
        routes: {
          // Homepage (pública)
          'GET /': {
            handler: async (c) => {
              return c.html(`
                <!DOCTYPE html>
                <html>
                  <head>
                    <title>OIDC Demo</title>
                    <style>
                      body { font-family: Arial; max-width: 800px; margin: 50px auto; padding: 20px; }
                      .card { border: 1px solid #ddd; padding: 20px; margin: 10px 0; border-radius: 5px; }
                      .public { background: #e8f5e9; }
                      .protected { background: #fff3e0; }
                      a { color: #1976d2; text-decoration: none; }
                      a:hover { text-decoration: underline; }
                      ul { list-style: none; padding: 0; }
                      li { margin: 10px 0; }
                      .emoji { font-size: 1.2em; margin-right: 10px; }
                    </style>
                  </head>
                  <body>
                    <h1>🔐 OIDC Authentication Demo</h1>

                    <div class="card public">
                      <h2>✅ Rotas Públicas (sem autenticação)</h2>
                      <ul>
                        <li><span class="emoji">🏠</span><a href="/">Homepage</a></li>
                        <li><span class="emoji">📄</span><a href="/public">Página Pública</a></li>
                      </ul>
                    </div>

                    <div class="card protected">
                      <h2>🔒 Rotas Protegidas (requerem login)</h2>
                      <ul>
                        <li><span class="emoji">📊</span><a href="/dashboard">Dashboard</a></li>
                        <li><span class="emoji">👤</span><a href="/profile">Perfil</a></li>
                        <li><span class="emoji">🔧</span><a href="/api/data">API Endpoint</a></li>
                      </ul>
                      <p><strong>Ao clicar em qualquer link acima, você será redirecionado para fazer login.</strong></p>
                    </div>

                    <div class="card">
                      <h2>🔑 Autenticação</h2>
                      <ul>
                        <li><span class="emoji">🚪</span><a href="/auth/login">Login Manual</a></li>
                        <li><span class="emoji">🚪</span><a href="/auth/logout">Logout</a></li>
                      </ul>
                    </div>

                    <hr>
                    <p><small>
                      💡 <strong>Como funciona:</strong><br>
                      1. Clique em uma rota protegida (ex: Dashboard)<br>
                      2. Você será redirecionado para o IdP (Azure/Google/etc)<br>
                      3. Faça login no provedor<br>
                      4. Você volta automaticamente para a página que tentou acessar
                    </small></p>
                  </body>
                </html>
              `);
            }
          },

          // Rota pública
          'GET /public': {
            handler: async (c) => {
              return c.json({
                message: 'Esta é uma rota pública',
                timestamp: new Date().toISOString(),
                authenticated: false
              });
            }
          },

          // Dashboard (protegido)
          'GET /dashboard': {
            auth: 'oidc',
            handler: async (c) => {
              const user = c.get('user');
              return c.html(`
                <!DOCTYPE html>
                <html>
                  <head>
                    <title>Dashboard</title>
                    <style>
                      body { font-family: Arial; max-width: 800px; margin: 50px auto; padding: 20px; }
                      .user-card { border: 1px solid #ddd; padding: 20px; border-radius: 5px; background: #f5f5f5; }
                      img { border-radius: 50%; }
                    </style>
                  </head>
                  <body>
                    <h1>📊 Dashboard</h1>
                    <div class="user-card">
                      <h2>Bem-vindo(a), ${user.name}!</h2>
                      ${user.picture ? `<img src="${user.picture}" width="100" alt="Avatar" />` : ''}
                      <p><strong>Email:</strong> ${user.email}</p>
                      <p><strong>ID:</strong> ${user.id}</p>
                      <p><strong>Role:</strong> ${user.role}</p>
                      <p><strong>Método de auth:</strong> ${user.authMethod}</p>
                    </div>
                    <br>
                    <a href="/">← Voltar</a> |
                    <a href="/profile">Ver Perfil Completo</a> |
                    <a href="/auth/logout">Logout</a>
                  </body>
                </html>
              `);
            }
          },

          // Perfil (protegido)
          'GET /profile': {
            auth: 'oidc',
            handler: async (c) => {
              const user = c.get('user');
              return c.json({
                id: user.id,
                email: user.email,
                username: user.username,
                name: user.name,
                picture: user.picture,
                role: user.role,
                scopes: user.scopes,
                authMethod: user.authMethod,
                metadata: user.metadata,
                session: {
                  expires_at: user.session?.expires_at,
                  has_refresh_token: !!user.session?.refresh_token
                }
              });
            }
          },

          // API endpoint (protegido)
          'GET /api/data': {
            auth: 'oidc',
            handler: async (c) => {
              const user = c.get('user');
              return c.json({
                data: [
                  { id: 1, name: 'Item 1', owner: user.id },
                  { id: 2, name: 'Item 2', owner: user.id },
                  { id: 3, name: 'Item 3', owner: user.id }
                ],
                meta: {
                  timestamp: new Date().toISOString(),
                  user: user.email
                }
              });
            }
          }
        }
      }
    }
  ]
});

// Criar resource de usuários
await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    username: 'string|required',
    name: 'string|required',
    picture: 'string',
    role: 'string|required',
    scopes: 'array|items:string',
    active: 'boolean',
    lastLoginAt: 'string',
    metadata: {
      oidc: {
        sub: 'string',
        provider: 'string',
        lastSync: 'string',
        claims: 'object'
      },
      costCenterId: 'string',
      teamId: 'string'
    }
  },
  timestamps: true
});

await db.connect();

console.log('\n' + '='.repeat(60));
console.log('🚀 Servidor OIDC rodando!');
console.log('='.repeat(60));
console.log('\n📖 Abra no navegador:');
console.log('   👉 http://localhost:3000\n');
console.log('🔒 Tente acessar uma rota protegida:');
console.log('   👉 http://localhost:3000/dashboard');
console.log('   (você será redirecionado para login)\n');
console.log('⚠️  Certifique-se de configurar as credenciais OIDC no código!\n');
console.log('='.repeat(60) + '\n');
