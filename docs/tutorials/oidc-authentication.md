# Tutorial: Autenticação OIDC no s3db.js

Guia completo para implementar autenticação OAuth2/OIDC (Azure AD, Google, Okta, etc.) nas suas rotas.

---

## 📋 Pré-requisitos

1. **s3db.js** instalado (`npm install s3db.js` ou `pnpm add s3db.js`)
2. **Provedor OIDC** configurado (Azure AD, Google, Okta, Auth0, etc.)
3. **Credenciais OAuth2**:
   - Client ID
   - Client Secret
   - Issuer URL (tenant URL)
   - Redirect URI configurado no provedor

---

## 🚀 Exemplo Completo Funcionando

### 1. Configuração Básica

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/mybucket',

  plugins: [
    {
      name: 'api',
      config: {
        port: 3000,

        // ✅ PASSO 1: Configurar driver OIDC
        auth: {
          resource: 'users',  // Resource onde os usuários serão criados/atualizados

          drivers: [
            {
              driver: 'oidc',
              config: {
                // Configurações obrigatórias
                issuer: 'https://login.microsoftonline.com/YOUR-TENANT-ID/v2.0',
                clientId: 'YOUR-CLIENT-ID',
                clientSecret: 'YOUR-CLIENT-SECRET',
                redirectUri: 'http://localhost:3000/auth/callback',
                cookieSecret: 'CHANGE-THIS-TO-A-RANDOM-32-CHAR-STRING!!!',

                // Scopes (ajuste conforme seu provedor)
                scopes: ['openid', 'profile', 'email', 'offline_access'],

                // Opcional: URLs customizadas
                loginPath: '/auth/login',
                callbackPath: '/auth/callback',
                logoutPath: '/auth/logout',
                postLoginRedirect: '/',
                postLogoutRedirect: '/',

                // Opcional: Criar usuário automaticamente
                autoCreateUser: true,
                defaultRole: 'user',

                // Opcional: Duração da sessão
                rollingDuration: 86400000,    // 24 horas (sessão inativa)
                absoluteDuration: 604800000,  // 7 dias (sessão máxima)

                // Opcional: Logout no IdP também
                idpLogout: true,

                // Opcional: Hook após autenticação
                onUserAuthenticated: async ({ user, created, claims, tokens, context }) => {
                  console.log(`User ${user.email} authenticated (created: ${created})`);

                  // Exemplo: Setar cookie adicional
                  context.cookie('user_email', user.email, {
                    httpOnly: true,
                    maxAge: 7 * 24 * 60 * 60  // 7 dias
                  });
                }
              }
            }
          ]
        }
      }
    }
  ]
});

await db.connect();

console.log('🚀 API rodando em http://localhost:3000');
console.log('🔐 Login: http://localhost:3000/auth/login');
```

---

## 🛡️ Protegendo Rotas Específicas

### Opção 1: PathRules (Recomendado - Mais Flexível)

```javascript
const db = new Database({
  // ... configuração anterior ...
  plugins: [
    {
      name: 'api',
      config: {
        port: 3000,
        auth: {
          resource: 'users',
          drivers: [{ driver: 'oidc', config: { /* ... */ } }],

          // ✅ OPÇÃO 1: PathRules
          pathRules: [
            // Rotas públicas (sem autenticação)
            {
              path: '/',
              methods: ['GET'],
              auth: false
            },
            {
              path: '/health',
              methods: ['GET'],
              auth: false
            },

            // Rotas protegidas por OIDC
            {
              path: '/dashboard',
              methods: ['GET'],
              auth: true,
              drivers: ['oidc']  // ← Apenas OIDC aceito
            },
            {
              path: '/api/profile',
              methods: ['GET', 'POST'],
              auth: true,
              drivers: ['oidc']
            },
            {
              path: '/api/admin/**',  // ← Glob pattern (tudo sob /api/admin)
              methods: ['*'],
              auth: true,
              drivers: ['oidc'],
              requireScopes: ['admin']  // ← Opcional: verificar scope
            }
          ]
        }
      }
    }
  ]
});
```

### Opção 2: protectedPaths (Mais Simples)

```javascript
const db = new Database({
  // ... configuração anterior ...
  plugins: [
    {
      name: 'api',
      config: {
        port: 3000,
        auth: {
          resource: 'users',
          drivers: [
            {
              driver: 'oidc',
              config: {
                // ... configuração OIDC ...

                // ✅ OPÇÃO 2: protectedPaths
                protectedPaths: [
                  '/dashboard',
                  '/profile',
                  '/api/admin/**',  // ← Glob pattern
                  '/settings/*'
                ]
              }
            }
          ]
        }
      }
    }
  ]
});
```

**Diferença**:
- **pathRules**: Controle fino por rota + método (GET, POST, etc)
- **protectedPaths**: Lista simples de paths protegidos (qualquer método)

---

## 🎭 Rotas Customizadas com Guard

Se você usar `routes` customizadas, pode aplicar guard OIDC assim:

```javascript
const db = new Database({
  plugins: [
    {
      name: 'api',
      config: {
        port: 3000,
        auth: { /* ... */ },

        // ✅ Rotas customizadas
        routes: {
          // Rota pública
          'GET /': {
            handler: async (c) => {
              return c.json({ message: 'Homepage pública' });
            }
          },

          // Rota protegida por OIDC
          'GET /dashboard': {
            auth: 'oidc',  // ← Guard OIDC
            handler: async (c) => {
              const user = c.get('user');  // ← Usuário autenticado
              return c.json({
                message: `Bem-vindo, ${user.name}!`,
                user: {
                  id: user.id,
                  email: user.email,
                  name: user.name,
                  picture: user.picture
                }
              });
            }
          },

          // Rota protegida com verificação adicional
          'GET /admin': {
            auth: 'oidc',
            handler: async (c) => {
              const user = c.get('user');

              // Verificação adicional (role, scope, etc)
              if (user.role !== 'admin') {
                return c.json({ error: 'Acesso negado' }, 403);
              }

              return c.json({ message: 'Admin panel' });
            }
          }
        }
      }
    }
  ]
});
```

---

## 🔄 Fluxo de Autenticação (Como Funciona)

```
1. Usuário tenta acessar: GET /dashboard
   ↓
2. Middleware OIDC verifica sessão
   ↓
3. ❌ Sem sessão → Redirect: /auth/login?returnTo=%2Fdashboard
   ↓
4. Login route → Redirect para IdP (Azure/Google/etc)
   ↓
5. Usuário faz login no IdP
   ↓
6. IdP redireciona de volta: /auth/callback?code=ABC123&state=XYZ
   ↓
7. Callback troca code por tokens (access_token, id_token, refresh_token)
   ↓
8. Cria/atualiza usuário no resource 'users'
   ↓
9. Cria sessão (cookie criptografado)
   ↓
10. ✅ Redirect de volta para: /dashboard
```

---

## 🧪 Exemplo Completo Testável

Arquivo: `test-oidc.js`

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 'memory://test/db',  // ← Banco em memória para testes

  plugins: [
    {
      name: 'api',
      config: {
        port: 3000,

        auth: {
          resource: 'users',

          drivers: [
            {
              driver: 'oidc',
              config: {
                // ⚠️ SUBSTITUA COM SUAS CREDENCIAIS REAIS
                issuer: 'https://login.microsoftonline.com/YOUR-TENANT-ID/v2.0',
                clientId: 'YOUR-CLIENT-ID',
                clientSecret: 'YOUR-CLIENT-SECRET',
                redirectUri: 'http://localhost:3000/auth/callback',
                cookieSecret: 'my-super-secret-cookie-key-32chars!!',

                scopes: ['openid', 'profile', 'email', 'offline_access'],
                autoCreateUser: true,
                verbose: true,  // ← Logs para debug

                onUserAuthenticated: async ({ user, created }) => {
                  console.log(`✅ Usuário autenticado: ${user.email} (novo: ${created})`);
                }
              }
            }
          ],

          // Rotas protegidas
          pathRules: [
            { path: '/', methods: ['GET'], auth: false },
            { path: '/public', methods: ['GET'], auth: false },
            { path: '/dashboard', methods: ['GET'], auth: true, drivers: ['oidc'] },
            { path: '/profile', methods: ['GET'], auth: true, drivers: ['oidc'] }
          ]
        },

        // Rotas customizadas
        routes: {
          'GET /': {
            handler: async (c) => {
              return c.html(`
                <html>
                  <body>
                    <h1>🏠 Homepage</h1>
                    <ul>
                      <li><a href="/public">Página Pública</a> ✅ Sem auth</li>
                      <li><a href="/dashboard">Dashboard</a> 🔒 Requer OIDC</li>
                      <li><a href="/profile">Perfil</a> 🔒 Requer OIDC</li>
                      <li><a href="/auth/login">Login</a></li>
                      <li><a href="/auth/logout">Logout</a></li>
                    </ul>
                  </body>
                </html>
              `);
            }
          },

          'GET /public': {
            handler: async (c) => {
              return c.json({ message: 'Esta rota é pública!' });
            }
          },

          'GET /dashboard': {
            auth: 'oidc',
            handler: async (c) => {
              const user = c.get('user');
              return c.html(`
                <html>
                  <body>
                    <h1>📊 Dashboard</h1>
                    <p>Bem-vindo, ${user.name}!</p>
                    <p>Email: ${user.email}</p>
                    <img src="${user.picture}" width="100" />
                    <br><br>
                    <a href="/auth/logout">Logout</a>
                  </body>
                </html>
              `);
            }
          },

          'GET /profile': {
            auth: 'oidc',
            handler: async (c) => {
              const user = c.get('user');
              return c.json({
                id: user.id,
                email: user.email,
                name: user.name,
                picture: user.picture,
                role: user.role,
                scopes: user.scopes,
                metadata: user.metadata
              });
            }
          }
        }
      }
    }
  ]
});

await db.connect();

console.log('\n🚀 Servidor rodando em http://localhost:3000');
console.log('📖 Acesse http://localhost:3000 para ver as rotas');
console.log('🔐 Tente acessar /dashboard (será redirecionado para login)\n');
```

**Para testar:**

```bash
node test-oidc.js
```

Abra o navegador em `http://localhost:3000` e clique em "Dashboard". Você será redirecionado para o IdP para fazer login.

---

## 📊 Ativando Logs de Requests

Para debugar problemas de autenticação, ative os logs:

```javascript
const db = new Database({
  plugins: [
    {
      name: 'api',
      config: {
        port: 3000,
        verbose: true,  // ← Ativa logs de requests, rotas, auth, etc

        auth: {
          resource: 'users',
          drivers: [
            {
              driver: 'oidc',
              config: {
                // ...
                verbose: true  // ← Logs específicos do OIDC driver
              }
            }
          ]
        }
      }
    }
  ]
});
```

**O que você verá no console:**

```
[API Plugin] Starting server on http://localhost:3000
[API Plugin] Mounted OIDC routes:
  /auth/login: Login (redirect to SSO)
  /auth/callback: OAuth2 callback
  /auth/logout: Logout (local + IdP)
[API Router] Resource routes mounted for: users
[API Router] Auth middleware registered (strategy: path-rules)

[Request] GET /dashboard
[Auth] Checking OIDC session...
[Auth] No session found, redirecting to login
[Response] 302 → /auth/login?returnTo=%2Fdashboard

[Request] GET /auth/login
[OIDC] Generating state: xyz123
[OIDC] Redirecting to IdP: https://login.microsoftonline.com/...
[Response] 302 → IdP authorization endpoint

[Request] GET /auth/callback?code=ABC123&state=xyz123
[OIDC] Validating CSRF state...
[OIDC] Exchanging code for tokens...
[OIDC] Token exchange successful
[OIDC] Creating/updating user: user@example.com
✅ Usuário autenticado: user@example.com (novo: true)
[OIDC] Session created
[Response] 302 → /dashboard

[Request] GET /dashboard
[Auth] OIDC session valid
[Auth] User authenticated: user@example.com
[Response] 200 OK
```

### Logger Customizado (Avançado)

Se você quiser controlar os logs manualmente:

```javascript
const db = new Database({
  plugins: [
    {
      name: 'api',
      config: {
        port: 3000,
        verbose: true,

        // Logger customizado
        logger: {
          info: (msg, meta) => console.log(`ℹ️  ${msg}`, meta),
          warn: (msg, meta) => console.warn(`⚠️  ${msg}`, meta),
          error: (msg, meta) => console.error(`❌ ${msg}`, meta),
          debug: (msg, meta) => {
            if (process.env.DEBUG) {
              console.log(`🐛 ${msg}`, meta);
            }
          }
        },

        // Middleware de logging de requests
        middleware: [
          async (c, next) => {
            const start = Date.now();
            const method = c.req.method;
            const path = c.req.path;

            console.log(`→ ${method} ${path}`);

            await next();

            const duration = Date.now() - start;
            const status = c.res.status;
            console.log(`← ${method} ${path} ${status} (${duration}ms)`);
          }
        ]
      }
    }
  ]
});
```

## 🐛 Troubleshooting

### Problema 1: "Redirect não funciona, fica 401"

**Causa**: Sua aplicação está enviando `Accept: application/json` no header.

**Solução**: O OIDC verifica o header `Accept`:
- `Accept: text/html` → Redirect para login (navegador)
- `Accept: application/json` → Retorna 401 JSON (API)

Se você quer forçar redirect mesmo em API calls, modifique a config:

```javascript
// Força redirect sempre (não recomendado)
pathRules: [
  {
    path: '/api/**',
    auth: true,
    drivers: ['oidc'],
    forceRedirect: true  // ← Custom logic (você precisa implementar)
  }
]
```

### Problema 2: "Cookie não é salvo"

**Causa**: Cookie precisa de `Secure: true` em produção HTTPS.

**Solução**:

```javascript
{
  driver: 'oidc',
  config: {
    // ...
    cookieSecure: process.env.NODE_ENV === 'production',  // ← Auto-detecta
    cookieSameSite: 'Lax'  // ← Ou 'None' se cross-origin
  }
}
```

### Problema 3: "returnTo não funciona"

**Verificar**:
1. Cookie `oidc_session_state` está sendo criado?
2. State cookie tem TTL de 10 minutos (600s) - renove se expirar
3. Verificar se `redirectUri` no provedor está correto

### Problema 4: "Error: Missing state cookie"

**Causa**: Cookie bloqueado por:
- Navegador em modo privado
- Extensões de privacidade
- SameSite muito restritivo

**Solução**:

```javascript
cookieSameSite: 'None',  // ← Se cross-origin
cookieSecure: true       // ← Obrigatório com SameSite=None
```

### Problema 5: "User not provisioned"

**Causa**: `autoCreateUser: false` e usuário não existe.

**Solução**:

```javascript
autoCreateUser: true,  // ← Permitir criação automática
```

Ou crie o usuário manualmente antes:

```javascript
await db.resources.users.insert({
  id: 'user@example.com',
  email: 'user@example.com',
  name: 'User Name',
  role: 'user'
});
```

---

## 🔧 Configurações Avançadas

### Múltiplos IdPs (Azure + Google)

```javascript
drivers: [
  {
    driver: 'oidc',
    name: 'azure',
    config: {
      issuer: 'https://login.microsoftonline.com/...',
      clientId: 'AZURE-CLIENT-ID',
      clientSecret: 'AZURE-SECRET',
      redirectUri: 'http://localhost:3000/auth/azure/callback',
      loginPath: '/auth/azure/login',
      callbackPath: '/auth/azure/callback',
      cookieName: 'azure_session'
    }
  },
  {
    driver: 'oidc',
    name: 'google',
    config: {
      issuer: 'https://accounts.google.com',
      clientId: 'GOOGLE-CLIENT-ID',
      clientSecret: 'GOOGLE-SECRET',
      redirectUri: 'http://localhost:3000/auth/google/callback',
      loginPath: '/auth/google/login',
      callbackPath: '/auth/google/callback',
      cookieName: 'google_session'
    }
  }
]
```

### Enriquecer User com Dados Externos

```javascript
{
  driver: 'oidc',
  config: {
    // ...
    beforeCreateUser: async ({ user, claims, usersResource }) => {
      // Buscar dados do CRM, API interna, etc
      const crmData = await fetch(`https://crm.example.com/user/${claims.email}`);
      const profile = await crmData.json();

      return {
        ...user,
        metadata: {
          ...user.metadata,
          crmId: profile.id,
          department: profile.department,
          manager: profile.manager
        }
      };
    },

    beforeUpdateUser: async ({ user, updates, claims, usersResource }) => {
      // Atualizar dados do CRM a cada login
      const crmData = await fetch(`https://crm.example.com/user/${claims.email}`);
      const profile = await crmData.json();

      return {
        ...updates,
        metadata: {
          ...updates.metadata,
          lastCrmSync: new Date().toISOString(),
          department: profile.department
        }
      };
    }
  }
}
```

---

## 📚 Links Úteis

- [Documentação completa do API Plugin](../plugins/api.md)
- [Código do OIDC driver](../../src/plugins/api/auth/oidc-auth.js)
- [Express OpenID Connect (referência)](https://github.com/auth0/express-openid-connect)

---

## ✅ Checklist Final

- [ ] Configurei `issuer`, `clientId`, `clientSecret`, `redirectUri`
- [ ] `redirectUri` está registrado no provedor OAuth2
- [ ] `cookieSecret` tem 32+ caracteres aleatórios
- [ ] Criei resource `users` ou configurei `auth.resource`
- [ ] Protegi rotas com `pathRules` ou `protectedPaths` ou guard `auth: 'oidc'`
- [ ] Testei acesso a rota protegida (deve redirecionar para IdP)
- [ ] Após login, voltei para URL original

---

**Pronto!** 🎉 Agora suas rotas estão protegidas com autenticação enterprise-grade.
