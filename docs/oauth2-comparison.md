# ❌ Antes vs ✅ Depois: Arquitetura com SSO

## ❌ ANTES: Cada API com seus próprios usuários

### Problemas

```
┌─────────────────────────────────────────────────────────────────┐
│                        Orders API (Port 3001)                    │
├─────────────────────────────────────────────────────────────────┤
│ Database: s3://orders-database                                  │
│   ├── users                                                     │
│   │    ├── john@example.com / senha123                         │
│   │    └── mary@example.com / senha456                         │
│   └── orders                                                    │
│        ├── order-1 (userId: john)                              │
│        └── order-2 (userId: mary)                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Products API (Port 3002)                    │
├─────────────────────────────────────────────────────────────────┤
│ Database: s3://products-database                                │
│   ├── users                                                     │
│   │    ├── john@example.com / senha123  ← DUPLICADO!           │
│   │    └── mary@example.com / senha456  ← DUPLICADO!           │
│   └── products                                                  │
│        ├── product-1                                            │
│        └── product-2                                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Payments API (Port 3003)                    │
├─────────────────────────────────────────────────────────────────┤
│ Database: s3://payments-database                                │
│   ├── users                                                     │
│   │    ├── john@example.com / senha123  ← DUPLICADO!           │
│   │    └── mary@example.com / senha456  ← DUPLICADO!           │
│   └── payments                                                  │
│        └── payment-1                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Problemas desta Arquitetura

❌ **Dados duplicados**: Mesmo usuário em 3 bancos diferentes
❌ **Inconsistência**: Se usuário muda senha em uma API, outras APIs não sabem
❌ **Segurança fraca**: 3 lugares para vazar senhas
❌ **Manutenção difícil**: Deletar usuário = deletar em 3 APIs
❌ **Experiência ruim**: Usuário precisa fazer login 3 vezes
❌ **Complexidade**: Cada API implementa autenticação do zero

### Código Problemático

```javascript
// ❌ Orders API - Duplica lógica de autenticação
const ordersDb = new Database({ connectionString: 's3://orders' });
const ordersUsers = await ordersDb.createResource({
  name: 'users',
  attributes: { email: 'string', password: 'secret' }
});

// ❌ Products API - Duplica lógica de autenticação
const productsDb = new Database({ connectionString: 's3://products' });
const productsUsers = await productsDb.createResource({
  name: 'users',
  attributes: { email: 'string', password: 'secret' }
});

// ❌ Payments API - Duplica lógica de autenticação
const paymentsDb = new Database({ connectionString: 's3://payments' });
const paymentsUsers = await paymentsDb.createResource({
  name: 'users',
  attributes: { email: 'string', password: 'secret' }
});

// ❌ PROBLEMA: john@example.com está em 3 bancos diferentes!
```

---

## ✅ DEPOIS: SSO Centralizado

### Solução

```
┌─────────────────────────────────────────────────────────────────┐
│                      SSO Server (Port 3000)                      │
│                         AUTORITATIVO                             │
├─────────────────────────────────────────────────────────────────┤
│ Database: s3://sso-database                                     │
│   ├── users                     ← ÚNICO LUGAR!                  │
│   │    ├── john@example.com                                     │
│   │    │    ├── password: *****                                 │
│   │    │    ├── scopes: [orders:*, products:*, payments:*]     │
│   │    │    └── active: true                                    │
│   │    └── mary@example.com                                     │
│   │         ├── password: *****                                 │
│   │         ├── scopes: [orders:read, products:read]           │
│   │         └── active: true                                    │
│   │                                                             │
│   ├── oauth_keys               ← Chaves RSA                     │
│   │    └── key-abc123                                           │
│   │         ├── publicKey: -----BEGIN PUBLIC KEY-----           │
│   │         └── privateKey: -----BEGIN PRIVATE KEY----- (secret)│
│   │                                                             │
│   └── oauth_clients            ← Apps autorizadas               │
│        ├── mobile-app                                           │
│        └── web-app                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Expõe JWKS (chave pública)
                              ▼
              ┌───────────────────────────────┐
              │  /.well-known/jwks.json       │
              │  { "keys": [{ publicKey }] }  │
              └───────────────────────────────┘
                              │
                 ┌────────────┼────────────┐
                 │            │            │
                 ▼            ▼            ▼

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   Orders API     │  │  Products API    │  │  Payments API    │
│   (Port 3001)    │  │  (Port 3002)     │  │  (Port 3003)     │
├──────────────────┤  ├──────────────────┤  ├──────────────────┤
│ Database:        │  │ Database:        │  │ Database:        │
│ s3://orders      │  │ s3://products    │  │ s3://payments    │
│                  │  │                  │  │                  │
│ ❌ SEM users!    │  │ ❌ SEM users!    │  │ ❌ SEM users!    │
│ ❌ SEM keys!     │  │ ❌ SEM keys!     │  │ ❌ SEM keys!     │
│                  │  │                  │  │                  │
│ ✅ orders        │  │ ✅ products      │  │ ✅ payments      │
│    └── userId*   │  │    └── userId*   │  │    └── userId*   │
│                  │  │                  │  │                  │
│ *userId vem do   │  │ *userId vem do   │  │ *userId vem do   │
│  token validado! │  │  token validado! │  │  token validado! │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

### Benefícios desta Arquitetura

✅ **Dados centralizados**: Usuário existe em UM único lugar (SSO)
✅ **Consistência**: Mudança de senha atualiza todas as APIs automaticamente
✅ **Segurança forte**: Um único lugar para proteger senhas
✅ **Manutenção fácil**: Deletar usuário = deletar no SSO, todas APIs param de aceitar
✅ **UX perfeito**: Login uma vez, acessa todas as APIs
✅ **Simplicidade**: APIs focam no negócio, não em autenticação

### Código Correto

```javascript
// ✅ SSO Server - ÚNICO lugar com usuários
const ssoDb = new Database({ connectionString: 's3://sso' });

const users = await ssoDb.createResource({
  name: 'users',
  attributes: {
    email: 'string|required',
    password: 'secret|required',
    scopes: 'array|items:string'
  }
});

const keys = await ssoDb.createResource({
  name: 'oauth_keys',
  attributes: {
    kid: 'string',
    publicKey: 'string',
    privateKey: 'secret',
    active: 'boolean'
  }
});

const oauth2 = new OAuth2Server({
  issuer: 'http://localhost:3000',
  keyResource: keys,
  userResource: users  // ← USUÁRIOS AQUI!
});

// ✅ Orders API - SEM usuários, apenas valida tokens
const ordersDb = new Database({ connectionString: 's3://orders' });

const orders = await ordersDb.createResource({
  name: 'orders',
  attributes: {
    userId: 'string',  // ← userId vem do token!
    total: 'number'
  }
});

const oidcClient = new OIDCClient({
  issuer: 'http://localhost:3000'  // ← Confia no SSO
});

// ✅ Products API - SEM usuários
const productsDb = new Database({ connectionString: 's3://products' });

const products = await productsDb.createResource({
  name: 'products',
  attributes: {
    name: 'string',
    price: 'number'
  }
  // ❌ SEM userId! Produtos são públicos
});

// ✅ Payments API - SEM usuários
const paymentsDb = new Database({ connectionString: 's3://payments' });

const payments = await paymentsDb.createResource({
  name: 'payments',
  attributes: {
    userId: 'string',  // ← userId vem do token!
    amount: 'number'
  }
});

// ✅ SOLUÇÃO: john@example.com existe apenas no SSO!
```

---

## 🔄 Fluxo Comparado

### ❌ ANTES: Login em cada API

```
Cliente                Orders API          Products API         Payments API
  │                        │                    │                    │
  │ POST /auth/login       │                    │                    │
  │ ──────────────────────>│                    │                    │
  │ (john / senha123)      │                    │                    │
  │                        │                    │                    │
  │ Token Orders           │                    │                    │
  │ <──────────────────────│                    │                    │
  │                        │                    │                    │
  │                        │ POST /auth/login   │                    │
  │                        │ ──────────────────>│                    │
  │                        │ (john / senha123)  │                    │
  │                        │                    │                    │
  │                        │ Token Products     │                    │
  │                        │ <──────────────────│                    │
  │                        │                    │                    │
  │                        │                    │ POST /auth/login   │
  │                        │                    │ ──────────────────>│
  │                        │                    │ (john / senha123)  │
  │                        │                    │                    │
  │                        │                    │ Token Payments     │
  │                        │                    │ <──────────────────│

❌ 3 logins diferentes!
❌ 3 tokens diferentes!
❌ Se senha muda, precisa atualizar 3 bancos!
```

### ✅ DEPOIS: Login uma vez no SSO

```
Cliente         SSO Server      Orders API     Products API    Payments API
  │                 │                │              │               │
  │ POST /auth/token│                │              │               │
  │ ───────────────>│                │              │               │
  │ (client creds)  │                │              │               │
  │                 │                │              │               │
  │ Token Universal │                │              │               │
  │ <───────────────│                │              │               │
  │                 │                │              │               │
  │ GET /orders + Token              │              │               │
  │ ─────────────────────────────────>│              │               │
  │                 │                │              │               │
  │                 ❌ NÃO FALA!     │              │               │
  │                 │                │              │               │
  │ Orders          │                │              │               │
  │ <─────────────────────────────────│              │               │
  │                 │                │              │               │
  │ GET /products + MESMO Token      │              │               │
  │ ───────────────────────────────────────────────>│               │
  │                 │                │              │               │
  │                 ❌ NÃO FALA!     │              │               │
  │                 │                │              │               │
  │ Products        │                │              │               │
  │ <───────────────────────────────────────────────│               │
  │                 │                │              │               │
  │ POST /payments + MESMO Token     │              │               │
  │ ─────────────────────────────────────────────────────────────────>│
  │                 │                │              │               │
  │                 ❌ NÃO FALA!     │              │               │
  │                 │                │              │               │
  │ Payment         │                │              │               │
  │ <─────────────────────────────────────────────────────────────────│

✅ 1 login!
✅ 1 token para TODAS as APIs!
✅ APIs validam localmente (sem falar com SSO)!
```

---

## 📊 Comparação de Recursos

### Dados Armazenados

| Recurso | ANTES (cada API) | DEPOIS (SSO) |
|---------|------------------|--------------|
| **Users** | ❌ Em cada API (duplicado) | ✅ Apenas no SSO |
| **Passwords** | ❌ Em cada API (risco 3x) | ✅ Apenas no SSO |
| **Scopes/Permissions** | ❌ Em cada API | ✅ Apenas no SSO |
| **Chaves RSA** | ❌ Não existia | ✅ Apenas no SSO |
| **Orders** | ✅ Orders API | ✅ Orders API |
| **Products** | ✅ Products API | ✅ Products API |
| **Payments** | ✅ Payments API | ✅ Payments API |

### Comunicação

| Operação | ANTES | DEPOIS |
|----------|-------|--------|
| **Login** | 1 request por API | 1 request no SSO |
| **Validar Token** | Lookup no DB local | Validação criptográfica local |
| **Buscar User Info** | Query no DB local | Opcional: GET /auth/userinfo |
| **Trocar Senha** | Update em 3 bancos | Update no SSO |
| **Deletar User** | Delete em 3 bancos | Delete no SSO |

### Segurança

| Aspecto | ANTES | DEPOIS |
|---------|-------|--------|
| **Senhas armazenadas** | 3 lugares | 1 lugar |
| **Superfície de ataque** | Alta (3 APIs) | Baixa (1 SSO) |
| **Tokens** | HS256 (simétrico) | RS256 (assimétrico) |
| **Chave secreta** | Em todas APIs | Apenas no SSO |
| **Revogação** | Complexa | Centralizada |

---

## 🎯 Quando Usar Cada Arquitetura

### Use JWT Driver (sem SSO)

**Cenário:**
- Você tem UMA API monolítica
- Não precisa de microservices
- Simplicidade é prioridade

**Exemplo:**
```javascript
// Uma única API com tudo
await db.usePlugin(new APIPlugin({
  auth: {
    driver: 'jwt',
    resource: 'users',
    config: { jwtSecret: 'secret' }
  }
}));
```

### Use OAuth2/OIDC (com SSO)

**Cenário:**
- Você tem MÚLTIPLAS APIs
- Arquitetura de microservices
- Precisa de SSO
- APIs podem crescer independentemente

**Exemplo:**
```javascript
// SSO Server
const oauth2 = new OAuth2Server({ ... });

// Cada API
const oidcClient = new OIDCClient({ issuer: 'http://sso' });
```

---

## 🚀 Migração: Antes → Depois

Se você já tem APIs com users duplicados e quer migrar para SSO:

### PASSO 1: Criar SSO Server

```javascript
// Novo serviço SSO
const ssoDb = new Database({ connectionString: 's3://sso' });
const users = await ssoDb.createResource({ ... });
const keys = await ssoDb.createResource({ ... });
const oauth2 = new OAuth2Server({ ... });
```

### PASSO 2: Migrar Usuários

```javascript
// Copiar users de cada API para SSO
const ordersUsers = await ordersDb.getResource('users').list();
const productsUsers = await productsDb.getResource('products').list();

for (const user of ordersUsers) {
  await ssoDb.getResource('users').insert({
    email: user.email,
    password: user.password, // Já criptografado
    scopes: ['orders:read', 'orders:write']
  });
}

// Merge de usuários duplicados (mesmo email)
```

### PASSO 3: Atualizar APIs para usar OIDC

```javascript
// Orders API - ANTES
const ordersApi = new APIPlugin({
  auth: {
    driver: 'jwt',
    resource: 'users',  // ← Users locais
    config: { jwtSecret: 'secret' }
  }
});

// Orders API - DEPOIS
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:3000'  // ← SSO
});

const ordersApi = new APIPlugin({ ... });
ordersApi.addAuthDriver('oidc', oidcClient.middleware.bind(oidcClient));
```

### PASSO 4: Deletar resource users das APIs

```javascript
// Remover users de cada API
await ordersDb.deleteResource('users');
await productsDb.deleteResource('users');
await paymentsDb.deleteResource('users');

// Manter apenas no SSO!
```

---

## ✅ Checklist Final

**SSO está completo quando:**
- [ ] Tem resource `users` com email, password, scopes
- [ ] Tem resource `oauth_keys` com chaves RSA
- [ ] `OAuth2Server` está inicializado
- [ ] Endpoint `/.well-known/jwks.json` retorna chaves públicas
- [ ] Endpoint `/auth/token` emite tokens válidos
- [ ] Token JWT tem claims corretos (iss, sub, aud, scope, exp)

**API está completa quando:**
- [ ] NÃO tem resource `users`
- [ ] Tem `OIDCClient` configurado com issuer do SSO
- [ ] `OIDCClient.initialize()` baixou JWKS com sucesso
- [ ] Auth driver OIDC está registrado
- [ ] Rotas protegidas validam token corretamente
- [ ] `req.user` tem dados do token (sub, scope, etc.)

---

**🎉 Resultado: Arquitetura escalável, segura e fácil de manter!**
