# s3db.js Examples

Organized examples by category to help you get started quickly.

## 📚 Index by Category

### 🔰 Basics (Getting Started)
- [e01-basic-crud.js](./e01-basic-crud.js) - Basic CRUD
- [e02-validation.js](./e02-validation.js) - Schema validation
- [e03-timestamps.js](./e03-timestamps.js) - Auto timestamps
- [e04-unique-fields.js](./e04-unique-fields.js) - Unique fields
- [e05-custom-ids.js](./e05-custom-ids.js) - Custom IDs
- [e06-behaviors.js](./e06-behaviors.js) - Behaviors (metadata overflow)
- [e07-encryption.js](./e07-encryption.js) - Field encryption

### 📊 Queries & Partitions
- [e08-queries.js](./e08-queries.js) - Advanced queries
- [e09-partitions.js](./e09-partitions.js) - Partitions for performance
- [e10-indexes.js](./e10-indexes.js) - Secondary indexes
- [e11-pagination.js](./e11-pagination.js) - Pagination
- [e44-orphaned-partitions.js](./e44-orphaned-partitions.js) - Orphaned partitions recovery

### 🔌 Plugins
- [e18-cache-plugin.js](./e18-cache-plugin.js) - Cache (memory/S3/filesystem)
- [e19-audit-plugin.js](./e19-audit-plugin.js) - Audit trail
- [e20-ttl-plugin.js](./e20-ttl-plugin.js) - Time-to-live (auto-cleanup)
- [e21-replicator-plugin.js](./e21-replicator-plugin.js) - Replication to PostgreSQL/BigQuery
- [e22-metrics-plugin.js](./e22-metrics-plugin.js) - Performance metrics
- [e23-costs-plugin.js](./e23-costs-plugin.js) - AWS cost tracking
- [e24-backup-plugin.js](./e24-backup-plugin.js) - Automatic backup

### 🌊 Streams
- [e12-streams-read.js](./e12-streams-read.js) - Read resources as stream
- [e13-streams-write.js](./e13-streams-write.js) - Write via stream
- [e14-streams-transform.js](./e14-streams-transform.js) - Transform streams

### 🧠 Machine Learning & RAG
- [e41-embeddings.js](./e41-embeddings.js) - Vector embeddings (77% compression)
- [e42-rag-basic.js](./e42-rag-basic.js) - Basic RAG with OpenAI
- [e43-rag-advanced.js](./e43-rag-advanced.js) - Advanced RAG with hybrid search

### 🔐 OAuth2 / OIDC (Authentication)
- [e60-oauth2-sso-server.js](./e60-oauth2-sso-server.js) - **SSO Server** (Authorization Server)
  - Issues JWT tokens (RS256)
  - OIDC Discovery
  - Client Credentials flow
  - JWKS endpoint
  - Token introspection
  - Zero external dependencies!

- [e61-oauth2-resource-server.js](./e61-oauth2-resource-server.js) - **Resource Server** (API)
  - Validates JWT tokens locally
  - OIDC Client (JWKS auto-fetch)
  - Scope enforcement
  - Multi-resource server support

- [e62-azure-ad-integration.js](./e62-azure-ad-integration.js) - **Azure AD Integration**
  - Passive API (validates tokens only)
  - Azure AD manages users
  - Complete Azure Portal setup
  - App Roles and Scopes
  - 3 methods to obtain tokens

- [e63-keycloak-integration.js](./e63-keycloak-integration.js) - **Keycloak Integration**
  - Passive API (validates tokens only)
  - Keycloak manages users
  - Complete Docker setup
  - Realm, Client, Roles, Scopes
  - Comparison: Keycloak vs Azure AD

### 🛡️ Authorization (Row-Level Security)
- [e64-authorization-complete.js](./e64-authorization-complete.js) - **Complete Authorization**
  - ✅ Multi-tenancy (partition by tenant)
  - ✅ Row-Level Security (RLS via partitions)
  - ✅ Granular scopes (own/team/org/all)
  - ✅ RBAC (Role-Based Access Control)
  - ✅ ABAC (Attribute-Based Access Control)
  - ✅ Ownership checks
  - ✅ Automatic audit trail
  - See also: [../authorization-patterns.md](../authorization-patterns.md)

### 🏢 Multi-Tenancy
- [e30-multi-tenant.js](./e30-multi-tenant.js) - Basic multi-tenancy
- [e31-tenant-isolation.js](./e31-tenant-isolation.js) - Complete tenant isolation
- [e64-authorization-complete.js](./e64-authorization-complete.js) - Multi-tenancy + complete RLS

### ⚡ Performance
- [e50-update-methods.js](./e50-update-methods.js) - Comparison: update() vs patch() vs replace()
- [e51-batch-operations.js](./e51-batch-operations.js) - Batch operations
- [e52-concurrent-writes.js](./e52-concurrent-writes.js) - Concurrent writes

### 🔧 Advanced
- [e15-hooks.js](./e15-hooks.js) - Lifecycle hooks
- [e16-custom-validation.js](./e16-custom-validation.js) - Custom validations
- [e17-transactions.js](./e17-transactions.js) - Transactions (eventual consistency)
- [e25-migrations.js](./e25-migrations.js) - Schema migrations
- [e26-versioning.js](./e26-versioning.js) - Resource versioning

---

## 🚀 Quick Start

### 1. OAuth2/OIDC (Authentication)

If you want complete authentication:

```bash
# Option 1: Own SSO (you manage users)
node docs/examples/e60-oauth2-sso-server.js

# Option 2: Passive API with Azure AD
node docs/examples/e62-azure-ad-integration.js

# Option 3: Passive API with Keycloak (open-source)
node docs/examples/e63-keycloak-integration.js
```

### 2. Authorization (Row-Level Security)

After authentication, add granular authorization:

```bash
# Complete authorization: Multi-tenancy + RLS + RBAC + ABAC
node docs/examples/e64-authorization-complete.js
```

**See complete documentation:** [authorization-patterns.md](../authorization-patterns.md)

### 3. Basic CRUD

To get started with simple CRUD:

```bash
node docs/examples/e01-basic-crud.js
```

---

## 📖 Documentation

### OAuth2/OIDC
- [oauth2-dependencies.md](../oauth2-dependencies.md) - Zero dependencies!
- [oauth2-testing.md](../oauth2-testing.md) - 101 automated tests

### Authorization
- [authorization-patterns.md](../authorization-patterns.md) - Complete authorization patterns
  - Granular scopes
  - Row-Level Security (RLS)
  - Multi-tenancy
  - RBAC & ABAC
  - Audit trail

### General
- [README.md](../../README.md) - Main documentation
- [client.md](../client.md) - S3 Client API
- [resource.md](../resource.md) - Resource API
- [plugins/](../plugins/) - Plugin docs

---

## 🎯 Use Cases

### "I need complete authentication with my own users"
→ [e60-oauth2-sso-server.js](./e60-oauth2-sso-server.js) + [e61-oauth2-resource-server.js](./e61-oauth2-resource-server.js)

### "I need to integrate with Azure AD / Microsoft 365"
→ [e62-azure-ad-integration.js](./e62-azure-ad-integration.js)

### "I need an open-source identity provider"
→ [e63-keycloak-integration.js](./e63-keycloak-integration.js)

### "I need multi-tenancy with complete isolation"
→ [e64-authorization-complete.js](./e64-authorization-complete.js)

### "Each user should only see their own data"
→ [e64-authorization-complete.js](./e64-authorization-complete.js) (Row-Level Security)

### "I need RAG with embeddings"
→ [e42-rag-basic.js](./e42-rag-basic.js) + [e43-rag-advanced.js](./e43-rag-advanced.js)

### "I need caching for performance"
→ [e18-cache-plugin.js](./e18-cache-plugin.js)

### "I need replication to BigQuery/PostgreSQL"
→ [e21-replicator-plugin.js](./e21-replicator-plugin.js)

### "I need auto-cleanup of old data"
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

**Complete stack:** [e64-authorization-complete.js](./e64-authorization-complete.js)

---

## 💡 Tips

1. **Performance**: Use partitions for O(1) queries instead of O(n)
2. **Security**: NEVER trust `userId`/`tenantId` from request body - always get from token
3. **Multi-tenancy**: Use `404` instead of `403` to avoid information leakage
4. **Audit**: Log ALL authorization decisions
5. **Scopes**: Use hierarchy (own < team < org < all)
6. **ABAC**: Combine with RBAC for maximum flexibility

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
| 01 | `e01-basic-crud.js` | Basic CRUD |
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
