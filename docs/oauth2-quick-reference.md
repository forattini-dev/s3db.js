# OAuth2/OIDC - Referência Rápida

## 🎯 Decisão Rápida: Qual Arquitetura Usar?

```
Você tem UMA API?
  └─> Use JWT Driver (simples)
      import { APIPlugin } from 's3db.js/plugins/api';

      await db.usePlugin(new APIPlugin({
        auth: {
          driver: 'jwt',
          resource: 'users',
          config: { jwtSecret: 'secret' }
        }
      }));

Você tem MÚLTIPLAS APIs (microservices)?
  └─> Use OAuth2/OIDC (SSO)
      SSO Server: OAuth2Server
      APIs: OIDCClient
```

---

## 🏢 Servidor SSO vs Resource Servers

### SSO Server (Authorization Server)

**O QUE É:**
- Servidor central de autenticação
- Único dono dos usuários
- Emite tokens JWT assinados com RS256

**O QUE TEM:**
```javascript
// Recursos no banco de dados
✅ users         → Usuários (email, password, scopes)
✅ oauth_keys    → Chaves RSA (privada + pública)
✅ oauth_clients → Aplicações autorizadas

// Código
import { OAuth2Server } from 's3db.js/plugins/api/auth/oauth2-server';

const oauth2 = new OAuth2Server({
  issuer: 'http://localhost:3000',
  keyResource: keysResource,    // Chave PRIVADA aqui!
  userResource: usersResource,  // Usuários aqui!
});
```

**ENDPOINTS:**
```
POST   /auth/token      → Emite tokens
POST   /auth/register   → Registra usuários
GET    /auth/userinfo   → Info do usuário
POST   /auth/introspect → Valida tokens
GET    /.well-known/jwks.json → Chaves PÚBLICAS
GET    /.well-known/openid-configuration → Discovery
```

---

### Resource Servers (APIs)

**O QUE É:**
- Suas APIs de negócio (Orders, Products, etc.)
- NÃO armazenam usuários
- Validam tokens localmente

**O QUE TEM:**
```javascript
// Recursos no banco de dados
✅ orders    → Seus dados de negócio
✅ products  → Seus dados de negócio
❌ users     → NÃO! Users estão no SSO!
❌ keys      → NÃO! Chaves estão no SSO!

// Código
import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';

const oidcClient = new OIDCClient({
  issuer: 'http://localhost:3000',  // URL do SSO
  audience: 'http://localhost:3001' // URL desta API
});

await oidcClient.initialize(); // Baixa JWKS do SSO

// Adiciona driver de autenticação
apiPlugin.addAuthDriver('oidc', oidcClient.middleware.bind(oidcClient));
```

**ROTAS:**
```javascript
// Rota protegida
apiPlugin.addRoute({
  path: '/orders',
  method: 'GET',
  handler: async (req, res) => {
    // req.user já tem dados do token validado!
    const userId = req.user.sub;
    const scopes = req.user.scope.split(' ');

    // Busca orders do usuário
    const orders = await ordersResource.query({ userId });
    res.json({ orders });
  },
  auth: 'oidc' // ← Usa OIDC para validar token
});
```

---

## 🔄 Fluxo Completo em 3 Passos

### PASSO 1️⃣: Cliente pede token ao SSO

```bash
curl -X POST http://localhost:3000/auth/token \
  -d "grant_type=client_credentials" \
  -d "client_id=mobile-app" \
  -d "client_secret=secret" \
  -d "scope=orders:read products:write"
```

**Resposta:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

### PASSO 2️⃣: Cliente usa token na Orders API

```bash
curl http://localhost:3001/orders \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..."
```

**O que acontece internamente:**
```
Orders API:
1. Extrai token do header
2. Busca chave pública do cache JWKS
3. Valida assinatura RS256 localmente
4. Verifica claims (iss, aud, exp)
5. Extrai userId e scopes
6. Retorna orders do usuário
```

**✅ SEM comunicação com SSO!**

### PASSO 3️⃣: Cliente usa MESMO token na Products API

```bash
curl -X POST http://localhost:3002/products \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  -d '{"name":"Widget","price":29.99}'
```

**✅ Mesmo processo, sem falar com SSO!**

---

## 🔐 RS256 vs HS256

### HS256 (Simétrico) - NÃO use para microservices!

```
┌─────────┐     shared secret      ┌──────────┐
│   SSO   │ ←─────────────────────→ │ Orders   │
└─────────┘                         └──────────┘
                                          ↕
                                    shared secret
                                          ↕
                                    ┌──────────┐
                                    │ Products │
                                    └──────────┘

❌ Mesmo segredo em TODAS as APIs
❌ Se uma API vaza, TODAS comprometidas
❌ APIs podem criar tokens falsos!
```

### RS256 (Assimétrico) - ✅ CORRETO para microservices!

```
┌─────────┐      public key       ┌──────────┐
│   SSO   │  ────────────────────→ │ Orders   │
│         │                        └──────────┘
│ private │      public key       ┌──────────┐
│  key    │  ────────────────────→ │ Products │
└─────────┘                        └──────────┘

✅ SSO tem chave PRIVADA (assina tokens)
✅ APIs tem chave PÚBLICA (validam apenas)
✅ APIs NÃO podem criar tokens!
✅ Vazar chave pública não é problema
```

---

## 📦 Estrutura de Projeto

```
microservices/
├── sso-service/              # Servidor SSO (Autoritativo)
│   ├── index.js
│   │   import { OAuth2Server } from 's3db.js/plugins/api/auth/oauth2-server';
│   │
│   │   const db = new Database({
│   │     connectionString: 's3://sso-bucket'
│   │   });
│   │
│   │   const oauth2 = new OAuth2Server({
│   │     issuer: 'https://sso.example.com',
│   │     keyResource: keysResource,
│   │     userResource: usersResource
│   │   });
│   │
│   ├── .env
│   │   S3DB_CONNECTION=s3://sso-bucket
│   │   OAUTH2_ISSUER=https://sso.example.com
│   │
│   └── docker-compose.yml
│       services:
│         sso:
│           image: node:21
│           ports: ["3000:3000"]
│
├── orders-service/           # API de Pedidos
│   ├── index.js
│   │   import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';
│   │
│   │   const db = new Database({
│   │     connectionString: 's3://orders-bucket'
│   │   });
│   │
│   │   const oidcClient = new OIDCClient({
│   │     issuer: 'https://sso.example.com'
│   │   });
│   │
│   ├── .env
│   │   S3DB_CONNECTION=s3://orders-bucket
│   │   OAUTH2_ISSUER=https://sso.example.com
│   │
│   └── docker-compose.yml
│       services:
│         orders:
│           image: node:21
│           ports: ["3001:3001"]
│
└── products-service/         # API de Produtos
    ├── index.js
    │   import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';
    │
    │   const db = new Database({
    │     connectionString: 's3://products-bucket'
    │   });
    │
    │   const oidcClient = new OIDCClient({
    │     issuer: 'https://sso.example.com'
    │   });
    │
    ├── .env
    │   S3DB_CONNECTION=s3://products-bucket
    │   OAUTH2_ISSUER=https://sso.example.com
    │
    └── docker-compose.yml
        services:
          products:
            image: node:21
            ports: ["3002:3002"]
```

---

## 🎯 Checklist de Implementação

### SSO Server

- [ ] Criar resource `users` com campos email, password, scopes
- [ ] Criar resource `oauth_keys` com campos kid, publicKey, privateKey
- [ ] Criar resource `oauth_clients` (opcional)
- [ ] Instanciar `OAuth2Server` com issuer, keyResource, userResource
- [ ] Chamar `await oauth2.initialize()` para gerar/carregar chaves
- [ ] Adicionar routes: `/auth/token`, `/.well-known/jwks.json`, etc.
- [ ] Testar: `curl http://localhost:3000/.well-known/jwks.json`

### Resource Server (cada API)

- [ ] Criar resources de negócio (orders, products, etc.)
- [ ] Instanciar `OIDCClient` com issuer do SSO
- [ ] Chamar `await oidcClient.initialize()` para baixar JWKS
- [ ] Adicionar auth driver: `apiPlugin.addAuthDriver('oidc', ...)`
- [ ] Adicionar routes com `auth: 'oidc'`
- [ ] Testar com token: `curl -H "Authorization: Bearer <token>"`

---

## 🧪 Testando

### 1. Obter token

```bash
TOKEN=$(curl -X POST http://localhost:3000/auth/token \
  -d "grant_type=client_credentials" \
  -d "client_id=test" \
  -d "client_secret=secret" \
  -d "scope=orders:read" \
  | jq -r .access_token)

echo $TOKEN
```

### 2. Usar token

```bash
# Orders API
curl http://localhost:3001/orders \
  -H "Authorization: Bearer $TOKEN"

# Products API (mesmo token!)
curl http://localhost:3002/products \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Ver conteúdo do token

```bash
echo $TOKEN | cut -d. -f2 | base64 -d | jq
```

**Resultado:**
```json
{
  "iss": "http://localhost:3000",
  "sub": "user-123",
  "aud": "http://localhost:3001",
  "scope": "orders:read orders:write",
  "exp": 1234567890,
  "iat": 1234567000
}
```

---

## 🔑 Scopes Comuns

```javascript
// SSO Server - Define scopes suportados
const oauth2 = new OAuth2Server({
  supportedScopes: [
    'openid',          // OIDC identity
    'profile',         // User profile (name, etc.)
    'email',           // User email
    'offline_access',  // Refresh tokens

    // Custom scopes (suas APIs)
    'orders:read',
    'orders:write',
    'products:read',
    'products:write',
    'admin:all'
  ]
});

// Resource Server - Verifica scopes
apiPlugin.addRoute({
  path: '/orders',
  method: 'POST',
  handler: async (req, res) => {
    const scopes = req.user.scope.split(' ');

    if (!scopes.includes('orders:write')) {
      return res.status(403).json({ error: 'Insufficient scopes' });
    }

    // Criar order...
  },
  auth: 'oidc'
});
```

---

## 📚 Documentação Completa

- **Guia Completo:** [`docs/oauth2-oidc.md`](oauth2-oidc.md)
- **Fluxo Detalhado:** [`docs/oauth2-sso-flow.md`](oauth2-sso-flow.md)
- **Exemplo Executável:** [`docs/examples/e60-oauth2-microservices.js`](examples/e60-oauth2-microservices.js)
- **Exemplo Explicado:** [`docs/examples/e61-sso-architecture-explained.js`](examples/e61-sso-architecture-explained.js)

---

## ⚡ Quick Copy-Paste

### SSO Server Mínimo

```javascript
import Database from 's3db.js';
import { APIPlugin } from 's3db.js/plugins/api';
import { OAuth2Server } from 's3db.js/plugins/api/auth/oauth2-server';

const db = new Database({ connectionString: 's3://sso' });
await db.connect();

const users = await db.createResource({
  name: 'users',
  attributes: { email: 'string|required', password: 'secret|required' }
});

const keys = await db.createResource({
  name: 'keys',
  attributes: { kid: 'string', publicKey: 'string', privateKey: 'secret', active: 'boolean' }
});

const oauth2 = new OAuth2Server({
  issuer: 'http://localhost:3000',
  keyResource: keys,
  userResource: users
});

await oauth2.initialize();

const api = new APIPlugin({ port: 3000 });
api.addRoute({ path: '/.well-known/jwks.json', method: 'GET', handler: oauth2.jwksHandler.bind(oauth2), auth: false });
api.addRoute({ path: '/auth/token', method: 'POST', handler: oauth2.tokenHandler.bind(oauth2), auth: false });

await db.use(api);
```

### Resource Server Mínimo

```javascript
import Database from 's3db.js';
import { APIPlugin } from 's3db.js/plugins/api';
import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';

const db = new Database({ connectionString: 's3://orders' });
await db.connect();

const orders = await db.createResource({
  name: 'orders',
  attributes: { userId: 'string', productId: 'string', total: 'number' }
});

const oidc = new OIDCClient({ issuer: 'http://localhost:3000' });
await oidc.initialize();

const api = new APIPlugin({ port: 3001 });
api.addAuthDriver('oidc', oidc.middleware.bind(oidc));

api.addRoute({
  path: '/orders',
  method: 'GET',
  handler: async (req, res) => {
    const orders = await orders.query({ userId: req.user.sub });
    res.json({ orders });
  },
  auth: 'oidc'
});

await db.use(api);
```

---

**🎉 Pronto! Agora você tem SSO completo para microservices com s3db.js!**
