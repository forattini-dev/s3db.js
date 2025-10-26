# OAuth2/OIDC - Fluxo de Comunicação SSO ↔ APIs

## 🏗️ Arquitetura Completa

```
┌─────────────────────────────────────────────────────────────────┐
│                   SERVIDOR SSO (Autoritativo)                    │
│                      http://localhost:3000                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📦 RECURSOS (s3://sso-database):                               │
│    ├── users         (email, password, scopes, permissions)     │
│    ├── oauth_keys    (kid, publicKey, privateKey)  ← PRIVADA!  │
│    └── oauth_clients (clientId, clientSecret)                   │
│                                                                  │
│  🔐 ENDPOINTS:                                                   │
│    ├── POST   /auth/token        → Emite access tokens          │
│    ├── POST   /auth/register     → Registra usuários            │
│    ├── GET    /auth/userinfo     → Info do usuário autenticado  │
│    ├── POST   /auth/introspect   → Valida token                 │
│    ├── GET    /.well-known/openid-configuration  → Discovery    │
│    └── GET    /.well-known/jwks.json  → Chaves PÚBLICAS 🔑      │
│                                                                  │
│  🔑 CHAVE PRIVADA RSA:                                          │
│    - Assina todos os tokens JWT                                 │
│    - NUNCA compartilhada com outras APIs                        │
│    - Armazenada de forma segura (AES-256-GCM)                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Expõe JWKS (chave pública)
                              ▼
        ┌─────────────────────────────────────────┐
        │  /.well-known/jwks.json                 │
        │  {                                      │
        │    "keys": [{                           │
        │      "kty": "RSA",                      │
        │      "kid": "abc123",                   │
        │      "n": "modulus...",  ← PÚBLICA      │
        │      "e": "exponent..."  ← PÚBLICA      │
        │    }]                                   │
        │  }                                      │
        └─────────────────────────────────────────┘
                              │
                              │ APIs baixam JWKS (uma vez)
                              │ e guardam em cache
                              │
         ┌────────────────────┴────────────────────┐
         │                                         │
         ▼                                         ▼
┌──────────────────────┐               ┌──────────────────────┐
│   Orders API         │               │   Products API       │
│   (Port 3001)        │               │   (Port 3002)        │
├──────────────────────┤               ├──────────────────────┤
│                      │               │                      │
│  📦 RECURSOS:        │               │  📦 RECURSOS:        │
│    └── orders        │               │    └── products      │
│        ├── userId    │               │        ├── name      │
│        ├── productId │               │        ├── price     │
│        └── total     │               │        └── sku       │
│                      │               │                      │
│  ❌ SEM USERS!       │               │  ❌ SEM USERS!       │
│  ❌ SEM OAUTH_KEYS!  │               │  ❌ SEM OAUTH_KEYS!  │
│                      │               │                      │
│  🔍 OIDC Client:     │               │  🔍 OIDC Client:     │
│    - JWKS cacheado   │               │    - JWKS cacheado   │
│    - Valida local    │               │    - Valida local    │
│    - Chave PÚBLICA   │               │    - Chave PÚBLICA   │
│                      │               │                      │
└──────────────────────┘               └──────────────────────┘
```

---

## 🔄 Fluxo de Autenticação e Autorização

### PASSO 1: Cliente obtém token do SSO

```
┌─────────┐
│ Cliente │  (Mobile App, Web App, Outro Serviço)
└────┬────┘
     │
     │ POST /auth/token
     │ {
     │   "grant_type": "client_credentials",
     │   "client_id": "mobile-app",
     │   "client_secret": "secret",
     │   "scope": "orders:read orders:write"
     │ }
     ▼
┌─────────────┐
│  SSO Server │
├─────────────┤
│ 1. Valida client_id + client_secret no DB
│ 2. Verifica scopes permitidos
│ 3. Busca chave PRIVADA RSA
│ 4. Cria JWT:
│    {
│      "iss": "http://localhost:3000",    ← Issuer (SSO)
│      "sub": "user-123",                 ← Subject (usuário)
│      "aud": "http://localhost:3001",    ← Audience (API destino)
│      "scope": "orders:read orders:write",
│      "exp": 1234567890,                 ← Expiration
│      "iat": 1234567000                  ← Issued at
│    }
│ 5. ASSINA com chave PRIVADA (RS256)
└─────────────┘
     │
     │ Retorna:
     │ {
     │   "access_token": "eyJhbGciOiJSUzI1Ni...",
     │   "token_type": "Bearer",
     │   "expires_in": 900
     │ }
     ▼
┌─────────┐
│ Cliente │  Armazena token
└─────────┘
```

### PASSO 2: Cliente acessa Orders API com token

```
┌─────────┐
│ Cliente │
└────┬────┘
     │
     │ GET /orders
     │ Authorization: Bearer eyJhbGciOiJSUzI1Ni...
     ▼
┌──────────────┐
│  Orders API  │
├──────────────┤
│ 1. Extrai token do header Authorization
│ 2. Decodifica header do JWT:
│    {
│      "alg": "RS256",
│      "kid": "abc123"  ← Key ID
│    }
│ 3. Busca chave pública no JWKS cache (kid: abc123)
│ 4. VALIDA assinatura com chave PÚBLICA
│ 5. Verifica claims:
│    - iss = "http://localhost:3000" ✓
│    - aud = "http://localhost:3001" ✓
│    - exp > agora ✓
│ 6. Extrai userId do claim "sub"
│ 7. Extrai scopes do claim "scope"
│ 8. Verifica se tem scope "orders:read" ✓
│ 9. Busca orders WHERE userId = "user-123"
│ 10. Retorna resultado
└──────────────┘
     │
     │ ✅ SEM COMUNICAÇÃO COM SSO!
     │ ✅ Validação TOTALMENTE LOCAL!
     │
     │ Response:
     │ {
     │   "orders": [...],
     │   "user": {
     │     "id": "user-123",
     │     "scopes": ["orders:read", "orders:write"]
     │   }
     │ }
     ▼
┌─────────┐
│ Cliente │
└─────────┘
```

### PASSO 3: Cliente usa MESMO token na Products API

```
┌─────────┐
│ Cliente │
└────┬────┘
     │
     │ POST /products
     │ Authorization: Bearer eyJhbGciOiJSUzI1Ni...  ← MESMO TOKEN!
     │ { "name": "Widget", "price": 29.99 }
     ▼
┌───────────────┐
│  Products API │
├───────────────┤
│ 1. Extrai token
│ 2. Busca chave pública JWKS cache (kid: abc123)
│ 3. VALIDA assinatura localmente
│ 4. Verifica claims:
│    - iss = "http://localhost:3000" ✓
│    - exp > agora ✓
│ 5. Verifica scope "products:write"
│    - Scope presente no token? ✓
│ 6. Cria produto
│ 7. Retorna resultado
└───────────────┘
     │
     │ ✅ SEM COMUNICAÇÃO COM SSO!
     │ ✅ Token válido para TODAS as APIs do mesmo issuer!
     │
     ▼
┌─────────┐
│ Cliente │
└─────────┘
```

---

## 🔐 Segurança: Chave Privada vs Pública

### SSO Server - Chave PRIVADA

```javascript
// APENAS no SSO Server
const keyPair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});

// Armazena no banco de dados (criptografada)
await keysResource.insert({
  kid: 'abc123',
  publicKey: keyPair.publicKey,   // ← Será exposta via JWKS
  privateKey: keyPair.privateKey, // ← NUNCA exposta! (secret field)
  active: true
});

// Assina token
const token = sign(payload, privateKey, { algorithm: 'RS256' });
```

### Resource Servers - Chave PÚBLICA

```javascript
// Orders API, Products API, etc.
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:3000'
});

await oidcClient.initialize();
// ↑ Busca JWKS do SSO:
// GET http://localhost:3000/.well-known/jwks.json
// Retorna apenas chaves PÚBLICAS!

// Valida token
const verified = verify(token, publicKey, { algorithm: 'RS256' });
// ✅ Verifica assinatura sem precisar da chave privada
```

---

## 📊 Comparação: O Que Cada Serviço TEM

| Recurso | SSO Server | Orders API | Products API | Outras APIs |
|---------|------------|------------|--------------|-------------|
| **users** table | ✅ SIM | ❌ NÃO | ❌ NÃO | ❌ NÃO |
| **oauth_keys** table | ✅ SIM | ❌ NÃO | ❌ NÃO | ❌ NÃO |
| **oauth_clients** table | ✅ SIM | ❌ NÃO | ❌ NÃO | ❌ NÃO |
| **Chave PRIVADA** | ✅ SIM | ❌ NÃO | ❌ NÃO | ❌ NÃO |
| **Chave PÚBLICA** (JWKS) | ✅ SIM | ✅ Cache | ✅ Cache | ✅ Cache |
| **Autentica usuários** | ✅ SIM | ❌ NÃO | ❌ NÃO | ❌ NÃO |
| **Emite tokens** | ✅ SIM | ❌ NÃO | ❌ NÃO | ❌ NÃO |
| **Valida tokens** | ✅ SIM | ✅ SIM | ✅ SIM | ✅ SIM |
| **Dados de negócio** | ❌ NÃO | ✅ orders | ✅ products | ✅ seus dados |

---

## 🔄 Comunicação entre APIs e SSO

### Resource Servers NÃO precisam falar com SSO para validar tokens!

```
┌──────────────┐                    ┌─────────────┐
│  Orders API  │                    │ SSO Server  │
└──────────────┘                    └─────────────┘
       │                                   │
       │                                   │
       │ 1. GET /.well-known/jwks.json    │
       │ ──────────────────────────────>  │
       │                                   │
       │ 2. { "keys": [...] }              │
       │ <──────────────────────────────  │
       │                                   │
       │ ✅ Cache por 1 hora               │
       │                                   │
       │                                   │
       │ ❌ NÃO precisa chamar SSO         │
       │    para validar tokens!           │
       │                                   │
       │ ✅ Valida localmente com          │
       │    chave pública do cache         │
       │                                   │
```

### Opcional: UserInfo Endpoint

Se precisar de dados adicionais do usuário:

```
┌──────────────┐                    ┌─────────────┐
│  Orders API  │                    │ SSO Server  │
└──────────────┘                    └─────────────┘
       │                                   │
       │ GET /auth/userinfo                │
       │ Authorization: Bearer token       │
       │ ──────────────────────────────>  │
       │                                   │
       │ SSO valida token internamente     │
       │ e retorna dados do usuário        │
       │                                   │
       │ {                                 │
       │   "sub": "user-123",              │
       │   "email": "john@example.com",    │
       │   "name": "John Doe",             │
       │   "email_verified": true          │
       │ }                                 │
       │ <──────────────────────────────  │
       │                                   │
```

**Quando usar UserInfo:**
- Quando precisa de dados do usuário que não estão no token
- Quando token é pequeno (para performance)
- Quando precisa de dados atualizados (não cached no token)

**Quando NÃO usar:**
- Para validação de token (use JWKS + validação local)
- Para dados que já estão no token (sub, email, name, etc.)

---

## 🚀 Benefícios desta Arquitetura

### 1. **Escalabilidade**
- ✅ Resource Servers validam tokens localmente (sem latência de rede)
- ✅ SSO não sobrecarrega com requests de validação
- ✅ Cache de JWKS reduz tráfego

### 2. **Segurança**
- ✅ Chave privada APENAS no SSO
- ✅ Nenhum segredo compartilhado entre serviços
- ✅ Resource Servers não armazenam senhas

### 3. **Simplicidade**
- ✅ Um único ponto de autenticação (SSO)
- ✅ Resource Servers focam no negócio
- ✅ Padrão OAuth2/OIDC (documentado, testado)

### 4. **Flexibilidade**
- ✅ Adicionar nova API é trivial (apenas baixa JWKS)
- ✅ Um token funciona em todas as APIs
- ✅ Scopes controlam permissões granulares

---

## 📝 Código Mínimo

### SSO Server (10 linhas)

```javascript
const oauth2 = new OAuth2Server({
  issuer: 'http://localhost:3000',
  keyResource: keysResource,
  userResource: usersResource
});

await oauth2.initialize();

apiPlugin.addRoute({
  path: '/.well-known/jwks.json',
  method: 'GET',
  handler: oauth2.jwksHandler.bind(oauth2),
  auth: false
});
```

### Resource Server (8 linhas)

```javascript
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:3000'
});

await oidcClient.initialize();

apiPlugin.addAuthDriver('oidc', oidcClient.middleware.bind(oidcClient));

apiPlugin.addRoute({
  path: '/orders',
  handler: async (req, res) => {
    // req.user já tem o payload validado!
  },
  auth: 'oidc'
});
```

---

## ✅ Resumo

**SSO Server (Autoritativo):**
- 🎫 Emite tokens
- 👥 Armazena usuários
- 🔐 Possui chave PRIVADA
- 📢 Expõe chave PÚBLICA via JWKS

**Resource Servers (APIs):**
- 🔍 Validam tokens LOCALMENTE
- 📦 Armazenam apenas dados de negócio
- 🔓 Usam chave PÚBLICA (JWKS cache)
- ❌ NÃO comunicam com SSO para validar!

**Fluxo:**
1. Cliente → SSO → Token
2. Cliente → API + Token → API valida localmente → Dados
3. Mesmo token funciona em TODAS as APIs!
