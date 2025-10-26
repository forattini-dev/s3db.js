# s3db.js Examples

Exemplos organizados por categoria para ajudar você a começar rapidamente.

## 📚 Índice por Categoria

### 🔰 Básico (Getting Started)
- [e01-basic-crud.js](./e01-basic-crud.js) - CRUD básico
- [e02-validation.js](./e02-validation.js) - Validação de schemas
- [e03-timestamps.js](./e03-timestamps.js) - Timestamps automáticos
- [e04-unique-fields.js](./e04-unique-fields.js) - Campos únicos
- [e05-custom-ids.js](./e05-custom-ids.js) - IDs customizados
- [e06-behaviors.js](./e06-behaviors.js) - Behaviors (metadata overflow)
- [e07-encryption.js](./e07-encryption.js) - Criptografia de campos

### 📊 Queries & Partitions
- [e08-queries.js](./e08-queries.js) - Queries avançadas
- [e09-partitions.js](./e09-partitions.js) - Partições para performance
- [e10-indexes.js](./e10-indexes.js) - Índices secundários
- [e11-pagination.js](./e11-pagination.js) - Paginação
- [e44-orphaned-partitions.js](./e44-orphaned-partitions.js) - Recovery de partitions órfãs

### 🔌 Plugins
- [e18-cache-plugin.js](./e18-cache-plugin.js) - Cache (memory/S3/filesystem)
- [e19-audit-plugin.js](./e19-audit-plugin.js) - Audit trail
- [e20-ttl-plugin.js](./e20-ttl-plugin.js) - Time-to-live (auto-cleanup)
- [e21-replicator-plugin.js](./e21-replicator-plugin.js) - Replicação para PostgreSQL/BigQuery
- [e22-metrics-plugin.js](./e22-metrics-plugin.js) - Métricas de performance
- [e23-costs-plugin.js](./e23-costs-plugin.js) - Tracking de custos AWS
- [e24-backup-plugin.js](./e24-backup-plugin.js) - Backup automático

### 🌊 Streams
- [e12-streams-read.js](./e12-streams-read.js) - Ler recursos como stream
- [e13-streams-write.js](./e13-streams-write.js) - Escrever via stream
- [e14-streams-transform.js](./e14-streams-transform.js) - Transform streams

### 🧠 Machine Learning & RAG
- [e41-embeddings.js](./e41-embeddings.js) - Vector embeddings (77% compression)
- [e42-rag-basic.js](./e42-rag-basic.js) - RAG básico com OpenAI
- [e43-rag-advanced.js](./e43-rag-advanced.js) - RAG avançado com hybrid search

### 🔐 OAuth2 / OIDC (Authentication)
- [e60-oauth2-sso-server.js](./e60-oauth2-sso-server.js) - **SSO Server** (Authorization Server)
  - Emite tokens JWT (RS256)
  - OIDC Discovery
  - Client Credentials flow
  - JWKS endpoint
  - Token introspection
  - Zero dependências externas!

- [e61-oauth2-resource-server.js](./e61-oauth2-resource-server.js) - **Resource Server** (API)
  - Valida tokens JWT localmente
  - OIDC Client (JWKS auto-fetch)
  - Scope enforcement
  - Multi-resource server support

- [e62-azure-ad-integration.js](./e62-azure-ad-integration.js) - **Azure AD Integration**
  - API passiva (só valida tokens)
  - Azure AD gerencia usuários
  - Setup completo do Azure Portal
  - App Roles e Scopes
  - 3 métodos para obter tokens

- [e63-keycloak-integration.js](./e63-keycloak-integration.js) - **Keycloak Integration**
  - API passiva (só valida tokens)
  - Keycloak gerencia usuários
  - Docker setup completo
  - Realm, Client, Roles, Scopes
  - Comparação: Keycloak vs Azure AD

### 🛡️ Authorization (Row-Level Security)
- [e64-authorization-complete.js](./e64-authorization-complete.js) - **Authorization Completa**
  - ✅ Multi-tenancy (partition por tenant)
  - ✅ Row-Level Security (RLS via partitions)
  - ✅ Scopes granulares (own/team/org/all)
  - ✅ RBAC (Role-Based Access Control)
  - ✅ ABAC (Attribute-Based Access Control)
  - ✅ Ownership checks
  - ✅ Audit trail automático
  - Ver também: [../authorization-patterns.md](../authorization-patterns.md)

### 🏢 Multi-Tenancy
- [e30-multi-tenant.js](./e30-multi-tenant.js) - Multi-tenancy básico
- [e31-tenant-isolation.js](./e31-tenant-isolation.js) - Isolamento total por tenant
- [e64-authorization-complete.js](./e64-authorization-complete.js) - Multi-tenancy + RLS completo

### ⚡ Performance
- [e50-update-methods.js](./e50-update-methods.js) - Comparação: update() vs patch() vs replace()
- [e51-batch-operations.js](./e51-batch-operations.js) - Operações em lote
- [e52-concurrent-writes.js](./e52-concurrent-writes.js) - Escritas concorrentes

### 🔧 Advanced
- [e15-hooks.js](./e15-hooks.js) - Lifecycle hooks
- [e16-custom-validation.js](./e16-custom-validation.js) - Validações customizadas
- [e17-transactions.js](./e17-transactions.js) - Transações (eventual consistency)
- [e25-migrations.js](./e25-migrations.js) - Schema migrations
- [e26-versioning.js](./e26-versioning.js) - Versionamento de recursos

---

## 🚀 Quick Start

### 1. OAuth2/OIDC (Authentication)

Se você quer autenticação completa:

```bash
# Opção 1: SSO próprio (você gerencia usuários)
node docs/examples/e60-oauth2-sso-server.js

# Opção 2: API passiva com Azure AD
node docs/examples/e62-azure-ad-integration.js

# Opção 3: API passiva com Keycloak (open-source)
node docs/examples/e63-keycloak-integration.js
```

### 2. Authorization (Row-Level Security)

Depois de autenticação, adicione autorização granular:

```bash
# Authorization completa: Multi-tenancy + RLS + RBAC + ABAC
node docs/examples/e64-authorization-complete.js
```

**Ver documentação completa:** [authorization-patterns.md](../authorization-patterns.md)

### 3. CRUD Básico

Para começar com CRUD simples:

```bash
node docs/examples/e01-basic-crud.js
```

---

## 📖 Documentação

### OAuth2/OIDC
- [oauth2-dependencies.md](../oauth2-dependencies.md) - Zero dependências!
- [oauth2-testing.md](../oauth2-testing.md) - 101 testes automatizados

### Authorization
- [authorization-patterns.md](../authorization-patterns.md) - Padrões completos de autorização
  - Scopes granulares
  - Row-Level Security (RLS)
  - Multi-tenancy
  - RBAC & ABAC
  - Audit trail

### Geral
- [README.md](../../README.md) - Documentação principal
- [client.md](../client.md) - S3 Client API
- [resource.md](../resource.md) - Resource API
- [plugins/](../plugins/) - Plugin docs

---

## 🎯 Casos de Uso

### "Preciso de autenticação completa com usuários próprios"
→ [e60-oauth2-sso-server.js](./e60-oauth2-sso-server.js) + [e61-oauth2-resource-server.js](./e61-oauth2-resource-server.js)

### "Preciso integrar com Azure AD / Microsoft 365"
→ [e62-azure-ad-integration.js](./e62-azure-ad-integration.js)

### "Preciso de identity provider open-source"
→ [e63-keycloak-integration.js](./e63-keycloak-integration.js)

### "Preciso de multi-tenancy com isolamento total"
→ [e64-authorization-complete.js](./e64-authorization-complete.js)

### "Cada usuário só pode ver seus próprios dados"
→ [e64-authorization-complete.js](./e64-authorization-complete.js) (Row-Level Security)

### "Preciso de RAG com embeddings"
→ [e42-rag-basic.js](./e42-rag-basic.js) + [e43-rag-advanced.js](./e43-rag-advanced.js)

### "Preciso de cache para performance"
→ [e18-cache-plugin.js](./e18-cache-plugin.js)

### "Preciso de replicação para BigQuery/PostgreSQL"
→ [e21-replicator-plugin.js](./e21-replicator-plugin.js)

### "Preciso de auto-cleanup de dados antigos"
→ [e20-ttl-plugin.js](./e20-ttl-plugin.js)

---

## 🔒 Security Layers (Recommended Stack)

```
┌──────────────────────────────────────────────┐
│  1. OAuth2/OIDC (Authentication)             │  ← e60-e63
│     Who are you?                             │
└──────────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────┐
│  2. Multi-Tenancy (Tenant Isolation)         │  ← e64
│     Which organization?                      │
└──────────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────┐
│  3. Scopes (Coarse Permissions)              │  ← e64
│     What type of access?                     │
│     orders:read:own/team/org/all             │
└──────────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────┐
│  4. Roles (RBAC)                             │  ← e64
│     What's your role?                        │
│     admin, manager, user                     │
└──────────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────┐
│  5. Row-Level Security (Ownership)           │  ← e64
│     Do you own this data?                    │
│     resource.userId === token.sub            │
└──────────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────┐
│  6. ABAC (Business Rules)                    │  ← e64
│     Does context allow this?                 │
│     Business hours, approval limits, etc     │
└──────────────────────────────────────────────┘
                   ↓
              ✅ ALLOWED
```

**Stack completo:** [e64-authorization-complete.js](./e64-authorization-complete.js)

---

## 💡 Tips

1. **Performance**: Use partitions para queries O(1) ao invés de O(n)
2. **Security**: NUNCA confie em `userId`/`tenantId` do request body - sempre pegue do token
3. **Multi-tenancy**: Use `404` ao invés de `403` para evitar information leakage
4. **Audit**: Log TODAS as decisões de autorização
5. **Scopes**: Use hierarquia (own < team < org < all)
6. **ABAC**: Combine com RBAC para flexibilidade máxima

---

## 🧪 Testing

```bash
# Test OAuth2/OIDC
npm run test:js -- oauth2

# Test specific
npm run test:js -- oauth2.rsa-keys
npm run test:js -- oauth2.oidc-discovery
npm run test:js -- oauth2.test

# Run examples
node docs/examples/e64-authorization-complete.js
```

---

## 📦 Full List

| # | File | Description |
|---|------|-------------|
| 01 | `e01-basic-crud.js` | CRUD básico |
| 02 | `e02-validation.js` | Schema validation |
| 03 | `e03-timestamps.js` | Auto timestamps |
| 04 | `e04-unique-fields.js` | Unique constraints |
| 05 | `e05-custom-ids.js` | Custom ID generation |
| 06 | `e06-behaviors.js` | Metadata behaviors |
| 07 | `e07-encryption.js` | Field encryption |
| 08 | `e08-queries.js` | Advanced queries |
| 09 | `e09-partitions.js` | Partitions for O(1) |
| 10 | `e10-indexes.js` | Secondary indexes |
| 11 | `e11-pagination.js` | Pagination patterns |
| 12 | `e12-streams-read.js` | Stream reads |
| 13 | `e13-streams-write.js` | Stream writes |
| 14 | `e14-streams-transform.js` | Transform streams |
| 15 | `e15-hooks.js` | Lifecycle hooks |
| 16 | `e16-custom-validation.js` | Custom validators |
| 17 | `e17-transactions.js` | Eventual consistency |
| 18 | `e18-cache-plugin.js` | Cache plugin |
| 19 | `e19-audit-plugin.js` | Audit plugin |
| 20 | `e20-ttl-plugin.js` | TTL plugin |
| 21 | `e21-replicator-plugin.js` | Replicator plugin |
| 22 | `e22-metrics-plugin.js` | Metrics plugin |
| 23 | `e23-costs-plugin.js` | Costs plugin |
| 24 | `e24-backup-plugin.js` | Backup plugin |
| 25 | `e25-migrations.js` | Schema migrations |
| 26 | `e26-versioning.js` | Resource versioning |
| 30 | `e30-multi-tenant.js` | Multi-tenancy basic |
| 31 | `e31-tenant-isolation.js` | Tenant isolation |
| 41 | `e41-embeddings.js` | Vector embeddings |
| 42 | `e42-rag-basic.js` | RAG basic |
| 43 | `e43-rag-advanced.js` | RAG advanced |
| 44 | `e44-orphaned-partitions.js` | Partition recovery |
| 50 | `e50-update-methods.js` | update/patch/replace |
| 51 | `e51-batch-operations.js` | Batch operations |
| 52 | `e52-concurrent-writes.js` | Concurrent writes |
| **60** | **`e60-oauth2-sso-server.js`** | **SSO Server** |
| **61** | **`e61-oauth2-resource-server.js`** | **Resource Server** |
| **62** | **`e62-azure-ad-integration.js`** | **Azure AD Integration** |
| **63** | **`e63-keycloak-integration.js`** | **Keycloak Integration** |
| **64** | **`e64-authorization-complete.js`** | **Authorization Complete** |

---

## 🆘 Help

- **Main docs**: [../../README.md](../../README.md)
- **OAuth2 docs**: [../oauth2-testing.md](../oauth2-testing.md)
- **Authorization docs**: [../authorization-patterns.md](../authorization-patterns.md)
- **Issues**: https://github.com/forattini-dev/s3db.js/issues
