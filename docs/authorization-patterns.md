# Authorization Patterns com s3db.js

Autenticação responde **"quem é você?"**, autorização responde **"o que você pode fazer?"**.

Este guia mostra padrões completos de autorização usando s3db.js:
- **Scopes Granulares** - Estrutura de scopes escalável
- **Row-Level Security (RLS)** - Controle de acesso por linha usando partitions
- **Multi-Tenancy** - Isolamento completo de dados por tenant
- **Attribute-Based Access Control (ABAC)** - Políticas baseadas em atributos

---

## 📋 Índice

1. [Scopes Granulares](#scopes-granulares)
2. [Row-Level Security (RLS)](#row-level-security-rls)
3. [Multi-Tenancy com Partitions](#multi-tenancy-com-partitions)
4. [Authorization Middleware](#authorization-middleware)
5. [ABAC (Attribute-Based Access Control)](#abac-attribute-based-access-control)
6. [Padrões Avançados](#padrões-avançados)

---

## Scopes Granulares

### ❌ Problema: Scopes Muito Amplos

```javascript
// RUIM - Muito permissivo
const scopes = [
  'orders:read',    // Pode ler TODOS os orders? Ou só os próprios?
  'orders:write',   // Pode editar TODOS os orders?
  'users:read'      // Pode ler TODOS os usuários?
];
```

### ✅ Solução: Scopes com Níveis de Permissão

```javascript
// BOM - Granular e escalável
const scopes = [
  // Read permissions
  'orders:read:own',       // Lê apenas próprios orders
  'orders:read:team',      // Lê orders do time
  'orders:read:org',       // Lê orders da organização
  'orders:read:all',       // Admin - lê tudo

  // Write permissions
  'orders:write:own',      // Edita apenas próprios orders
  'orders:write:team',     // Edita orders do time
  'orders:write:all',      // Admin - edita tudo

  // Special permissions
  'orders:delete:own',     // Deleta próprios orders
  'orders:delete:all',     // Admin - deleta qualquer order
  'orders:approve',        // Aprova orders (workflow)
  'orders:export',         // Exporta relatórios
];
```

### Estrutura de Scopes Recomendada

```
<resource>:<action>:<scope>:<constraint?>

Exemplos:
- orders:read:own           → Lê próprios orders
- orders:read:team:pending  → Lê orders pendentes do time
- orders:write:org          → Edita orders da org
- orders:delete:all         → Deleta qualquer order
- users:read:own            → Lê próprio perfil
- users:write:team          → Edita usuários do time
- analytics:read:org        → Lê analytics da org
```

### Hierarquia de Scopes

```javascript
const SCOPE_HIERARCHY = {
  own: 1,    // Menor permissão
  team: 2,
  org: 3,
  all: 4     // Maior permissão (admin)
};

function hasPermission(userScope, requiredScope) {
  return SCOPE_HIERARCHY[userScope] >= SCOPE_HIERARCHY[requiredScope];
}

// Exemplo:
// User tem 'orders:read:org' (nível 3)
// Endpoint requer 'orders:read:team' (nível 2)
// hasPermission('org', 'team') → true ✅
```

---

## Row-Level Security (RLS)

**Conceito**: Cada linha/documento só é acessível por usuários autorizados.

### Padrão 1: Partition por User ID

```javascript
// ========================================
// 1. Criar resource com partition por userId
// ========================================
const ordersResource = await db.createResource({
  name: 'orders',
  attributes: {
    userId: 'string|required',      // Owner do order
    productId: 'string|required',
    quantity: 'number',
    total: 'number',
    status: 'string'
  },
  partitions: {
    byUser: {
      fields: { userId: 'string' }  // Partition key = userId
    }
  },
  timestamps: true
});

// ========================================
// 2. Middleware de RLS automático
// ========================================
function rlsMiddleware(req, res, next) {
  // Injeta userId do token em todas as queries
  req.userId = req.user.sub;  // User ID do token (Azure AD oid, Keycloak sub)

  // Força filtro por userId em TODAS as queries
  req.rlsFilter = { userId: req.userId };

  next();
}

apiPlugin.use(rlsMiddleware);

// ========================================
// 3. Rotas com RLS automático
// ========================================
apiPlugin.addRoute({
  path: '/api/orders',
  method: 'GET',
  handler: async (req, res) => {
    // Query automaticamente filtrada por userId via partition
    const orders = await ordersResource.listPartition('byUser', {
      userId: req.userId  // O(1) lookup via partition!
    });

    res.json({ orders });
  },
  auth: 'oauth2'
});

apiPlugin.addRoute({
  path: '/api/orders',
  method: 'POST',
  handler: async (req, res) => {
    const { productId, quantity, total } = req.body;

    // Força userId do token (não aceita userId do request body)
    const order = await ordersResource.insert({
      userId: req.userId,  // Sempre do token, nunca confia no input
      productId,
      quantity,
      total,
      status: 'pending'
    });

    res.status(201).json(order);
  },
  auth: 'oauth2'
});

apiPlugin.addRoute({
  path: '/api/orders/:id',
  method: 'GET',
  handler: async (req, res) => {
    const { id } = req.params;

    // Busca order
    const order = await ordersResource.get(id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // RLS Check - só retorna se for do próprio user
    if (order.userId !== req.userId) {
      return res.status(404).json({ error: 'Order not found' });  // 404, não 403!
    }

    res.json(order);
  },
  auth: 'oauth2'
});
```

**Performance**: Partition `byUser` transforma query O(n) em O(1) lookup!

---

## Multi-Tenancy com Partitions

**Conceito**: Cada tenant (organização) tem dados completamente isolados.

### Padrão: Partition por Tenant ID

```javascript
// ========================================
// 1. Resource com partition por tenantId
// ========================================
const ordersResource = await db.createResource({
  name: 'orders',
  attributes: {
    tenantId: 'string|required',    // Organization ID
    userId: 'string|required',      // User dentro do tenant
    productId: 'string|required',
    quantity: 'number',
    total: 'number'
  },
  partitions: {
    byTenant: {
      fields: { tenantId: 'string' }  // Isolamento total por tenant
    },
    byTenantUser: {
      fields: {
        tenantId: 'string',
        userId: 'string'
      }
    }
  },
  timestamps: true
});

// ========================================
// 2. Middleware Multi-Tenant
// ========================================
function multiTenantMiddleware(req, res, next) {
  // TenantId vem do token JWT (custom claim)
  req.tenantId = req.user.tenantId || req.user.tid;  // Azure AD tid, Keycloak custom
  req.userId = req.user.sub;

  // Valida que tenant existe
  if (!req.tenantId) {
    return res.status(403).json({
      error: 'forbidden',
      error_description: 'Tenant ID missing in token'
    });
  }

  // Força filtro por tenant em TODAS as queries
  req.tenantFilter = { tenantId: req.tenantId };

  next();
}

apiPlugin.use(multiTenantMiddleware);

// ========================================
// 3. Rotas Multi-Tenant
// ========================================
apiPlugin.addRoute({
  path: '/api/orders',
  method: 'GET',
  handler: async (req, res) => {
    // Busca apenas orders do tenant do usuário
    const orders = await ordersResource.listPartition('byTenant', {
      tenantId: req.tenantId
    });

    res.json({
      orders,
      tenant: req.tenantId
    });
  },
  auth: 'oauth2'
});

apiPlugin.addRoute({
  path: '/api/orders/my',
  method: 'GET',
  handler: async (req, res) => {
    // Busca orders do user dentro do tenant (double partition!)
    const orders = await ordersResource.listPartition('byTenantUser', {
      tenantId: req.tenantId,
      userId: req.userId
    });

    res.json({ orders });
  },
  auth: 'oauth2'
});

apiPlugin.addRoute({
  path: '/api/orders',
  method: 'POST',
  handler: async (req, res) => {
    const { productId, quantity, total } = req.body;

    // NUNCA aceita tenantId/userId do request - sempre do token!
    const order = await ordersResource.insert({
      tenantId: req.tenantId,  // Do token
      userId: req.userId,      // Do token
      productId,
      quantity,
      total,
      status: 'pending'
    });

    res.status(201).json(order);
  },
  auth: 'oauth2'
});

// ========================================
// 4. Admin pode ver todos os tenants
// ========================================
apiPlugin.addRoute({
  path: '/api/admin/orders',
  method: 'GET',
  handler: async (req, res) => {
    // Verifica role de super-admin
    const roles = req.user.realm_access?.roles || [];
    if (!roles.includes('super-admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Admin pode listar TUDO (sem filtro de tenant)
    const orders = await ordersResource.list({ limit: 1000 });

    res.json({ orders });
  },
  auth: 'oauth2'
});
```

### Custom Claims no Keycloak para Multi-Tenancy

```javascript
// Keycloak: Protocol Mappers para incluir tenantId no token

// 1. Client → orders-api → Mappers → Create
// 2. Mapper Type: User Attribute
// 3. Name: tenantId
// 4. User Attribute: tenantId
// 5. Token Claim Name: tenantId
// 6. Claim JSON Type: String
// 7. Add to access token: ON

// Agora o token terá:
{
  "sub": "user-123",
  "email": "john@acme.com",
  "tenantId": "acme-corp",  // ✅ Custom claim
  "preferred_username": "john.doe"
}
```

---

## Authorization Middleware

Middleware reutilizável para verificar scopes e permissões.

```javascript
// ========================================
// authorization-middleware.js
// ========================================

/**
 * Verifica se user tem scope necessário
 */
function requireScope(scope) {
  return (req, res, next) => {
    const userScopes = req.user.scope?.split(' ') || [];

    if (!userScopes.includes(scope)) {
      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: `Scope "${scope}" required`,
        required_scope: scope,
        user_scopes: userScopes
      });
    }

    next();
  };
}

/**
 * Verifica se user tem algum dos scopes (OR)
 */
function requireAnyScope(...scopes) {
  return (req, res, next) => {
    const userScopes = req.user.scope?.split(' ') || [];
    const hasAny = scopes.some(scope => userScopes.includes(scope));

    if (!hasAny) {
      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: `One of scopes required: ${scopes.join(', ')}`,
        required_scopes: scopes,
        user_scopes: userScopes
      });
    }

    next();
  };
}

/**
 * Verifica se user tem todos os scopes (AND)
 */
function requireAllScopes(...scopes) {
  return (req, res, next) => {
    const userScopes = req.user.scope?.split(' ') || [];
    const hasAll = scopes.every(scope => userScopes.includes(scope));

    if (!hasAll) {
      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: `All scopes required: ${scopes.join(', ')}`,
        required_scopes: scopes,
        user_scopes: userScopes
      });
    }

    next();
  };
}

/**
 * Verifica se user tem role necessária
 */
function requireRole(role, level = 'client') {
  return (req, res, next) => {
    let userRoles = [];

    if (level === 'realm') {
      // Keycloak realm roles
      userRoles = req.user.realm_access?.roles || [];
    } else if (level === 'client') {
      // Keycloak client roles
      const clientId = req.user.azp || process.env.CLIENT_ID;
      userRoles = req.user.resource_access?.[clientId]?.roles || [];
    } else {
      // Azure AD roles
      userRoles = req.user.roles || [];
    }

    if (!userRoles.includes(role)) {
      return res.status(403).json({
        error: 'insufficient_permissions',
        error_description: `Role "${role}" required`,
        required_role: role,
        user_roles: userRoles
      });
    }

    next();
  };
}

/**
 * Verifica ownership do recurso
 */
function requireOwnership(resourceGetter, userIdField = 'userId') {
  return async (req, res, next) => {
    try {
      const resource = await resourceGetter(req);

      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      const resourceUserId = resource[userIdField];
      const requestUserId = req.user.sub;

      if (resourceUserId !== requestUserId) {
        // 404 instead of 403 to avoid leaking existence
        return res.status(404).json({ error: 'Resource not found' });
      }

      // Attach resource to request for handler
      req.resource = resource;
      next();
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Verifica tenant isolation
 */
function requireTenant() {
  return (req, res, next) => {
    const tenantId = req.user.tenantId || req.user.tid;

    if (!tenantId) {
      return res.status(403).json({
        error: 'forbidden',
        error_description: 'Tenant ID missing in token'
      });
    }

    req.tenantId = tenantId;
    req.userId = req.user.sub;

    next();
  };
}

export {
  requireScope,
  requireAnyScope,
  requireAllScopes,
  requireRole,
  requireOwnership,
  requireTenant
};
```

### Uso do Authorization Middleware

```javascript
import {
  requireScope,
  requireAnyScope,
  requireRole,
  requireOwnership,
  requireTenant
} from './authorization-middleware.js';

// ========================================
// Scope-based authorization
// ========================================
apiPlugin.addRoute({
  path: '/api/orders',
  method: 'POST',
  middleware: [requireScope('orders:write:own')],
  handler: async (req, res) => {
    // Handler só executa se scope correto
    const order = await ordersResource.insert({
      userId: req.user.sub,
      ...req.body
    });
    res.status(201).json(order);
  },
  auth: 'oauth2'
});

// ========================================
// Multi-scope (OR) - aceita qualquer um
// ========================================
apiPlugin.addRoute({
  path: '/api/orders/export',
  method: 'GET',
  middleware: [requireAnyScope('orders:export', 'orders:read:all')],
  handler: async (req, res) => {
    // Executa se tem orders:export OU orders:read:all
    const orders = await ordersResource.list();
    res.json(orders);
  },
  auth: 'oauth2'
});

// ========================================
// Multi-scope (AND) - precisa de todos
// ========================================
apiPlugin.addRoute({
  path: '/api/orders/:id/approve',
  method: 'POST',
  middleware: [requireAllScopes('orders:read:all', 'orders:approve')],
  handler: async (req, res) => {
    // Precisa de ambos os scopes
    const order = await ordersResource.update(req.params.id, { status: 'approved' });
    res.json(order);
  },
  auth: 'oauth2'
});

// ========================================
// Role-based authorization
// ========================================
apiPlugin.addRoute({
  path: '/api/admin/users',
  method: 'GET',
  middleware: [requireRole('admin', 'client')],
  handler: async (req, res) => {
    // Só admins podem acessar
    const users = await usersResource.list();
    res.json({ users });
  },
  auth: 'oauth2'
});

// ========================================
// Ownership check
// ========================================
apiPlugin.addRoute({
  path: '/api/orders/:id',
  method: 'DELETE',
  middleware: [
    requireOwnership(async (req) => {
      return await ordersResource.get(req.params.id);
    }, 'userId')
  ],
  handler: async (req, res) => {
    // Ownership já validado, resource em req.resource
    await ordersResource.delete(req.params.id);
    res.status(204).send();
  },
  auth: 'oauth2'
});

// ========================================
// Multi-tenancy + ownership
// ========================================
apiPlugin.addRoute({
  path: '/api/orders/:id',
  method: 'GET',
  middleware: [
    requireTenant(),
    requireOwnership(async (req) => {
      const order = await ordersResource.get(req.params.id);

      // Valida tenant antes de ownership
      if (order && order.tenantId !== req.tenantId) {
        return null;  // Retorna 404
      }

      return order;
    })
  ],
  handler: async (req, res) => {
    // Tenant e ownership validados
    res.json(req.resource);
  },
  auth: 'oauth2'
});
```

---

## ABAC (Attribute-Based Access Control)

Políticas de autorização baseadas em atributos do usuário e do recurso.

```javascript
// ========================================
// abac-policies.js
// ========================================

class ABACPolicy {
  constructor(name, evaluate) {
    this.name = name;
    this.evaluate = evaluate;
  }

  async check(context) {
    return await this.evaluate(context);
  }
}

// ========================================
// Políticas de exemplo
// ========================================

// Política: User pode editar próprios orders
const canEditOwnOrder = new ABACPolicy('canEditOwnOrder', async (ctx) => {
  return ctx.resource.userId === ctx.user.sub;
});

// Política: Manager pode editar orders do time
const canEditTeamOrder = new ABACPolicy('canEditTeamOrder', async (ctx) => {
  const userTeam = ctx.user.team;
  const orderTeam = ctx.resource.team;
  const isManager = ctx.user.roles?.includes('manager');

  return isManager && userTeam === orderTeam;
});

// Política: Pode aprovar orders acima de limite se tem permissão
const canApproveHighValueOrder = new ABACPolicy('canApproveHighValueOrder', async (ctx) => {
  const orderTotal = ctx.resource.total;
  const userApprovalLimit = ctx.user.approvalLimit || 0;

  return orderTotal <= userApprovalLimit;
});

// Política: Horário comercial (9am-6pm)
const isBusinessHours = new ABACPolicy('isBusinessHours', async (ctx) => {
  const now = new Date();
  const hour = now.getHours();
  return hour >= 9 && hour < 18;
});

// Política: Tenant isolation
const sameTenant = new ABACPolicy('sameTenant', async (ctx) => {
  return ctx.resource.tenantId === ctx.user.tenantId;
});

// ========================================
// Policy Engine
// ========================================

class PolicyEngine {
  constructor() {
    this.policies = new Map();
  }

  register(policy) {
    this.policies.set(policy.name, policy);
  }

  async evaluate(policyNames, context) {
    const results = [];

    for (const name of policyNames) {
      const policy = this.policies.get(name);

      if (!policy) {
        throw new Error(`Policy "${name}" not found`);
      }

      const result = await policy.check(context);
      results.push({ policy: name, result });

      if (!result) {
        return { allowed: false, failedPolicy: name, results };
      }
    }

    return { allowed: true, results };
  }
}

// ========================================
// Middleware ABAC
// ========================================

function requirePolicies(...policyNames) {
  return async (req, res, next) => {
    const context = {
      user: req.user,
      resource: req.resource,  // Precisa ser populado antes (via requireOwnership ou similar)
      request: req,
      timestamp: new Date()
    };

    const result = await policyEngine.evaluate(policyNames, context);

    if (!result.allowed) {
      return res.status(403).json({
        error: 'policy_violation',
        error_description: `Policy "${result.failedPolicy}" denied access`,
        failed_policy: result.failedPolicy,
        policies_evaluated: result.results
      });
    }

    next();
  };
}

// ========================================
// Uso do ABAC
// ========================================

// Registrar políticas
const policyEngine = new PolicyEngine();
policyEngine.register(canEditOwnOrder);
policyEngine.register(canEditTeamOrder);
policyEngine.register(canApproveHighValueOrder);
policyEngine.register(isBusinessHours);
policyEngine.register(sameTenant);

// Rota com múltiplas políticas
apiPlugin.addRoute({
  path: '/api/orders/:id',
  method: 'PATCH',
  middleware: [
    requireTenant(),
    requireOwnership(async (req) => await ordersResource.get(req.params.id)),
    requirePolicies('sameTenant', 'canEditOwnOrder', 'isBusinessHours')
  ],
  handler: async (req, res) => {
    // Todas as políticas passaram
    const order = await ordersResource.update(req.params.id, req.body);
    res.json(order);
  },
  auth: 'oauth2'
});

// Aprovar order - políticas complexas
apiPlugin.addRoute({
  path: '/api/orders/:id/approve',
  method: 'POST',
  middleware: [
    requireTenant(),
    requireOwnership(async (req) => await ordersResource.get(req.params.id)),
    requirePolicies('sameTenant', 'canApproveHighValueOrder')
  ],
  handler: async (req, res) => {
    const order = await ordersResource.update(req.params.id, {
      status: 'approved',
      approvedBy: req.user.sub,
      approvedAt: new Date().toISOString()
    });
    res.json(order);
  },
  auth: 'oauth2'
});

export { ABACPolicy, PolicyEngine, requirePolicies, policyEngine };
```

---

## Padrões Avançados

### 1. Hierarchical Permissions (Inheritance)

```javascript
// Usuário herda permissões do grupo/org
const userPermissions = new Set([
  ...userOwnPermissions,
  ...teamPermissions,
  ...orgPermissions
]);

// Hierarchy: User → Team → Org → Global
function getEffectivePermissions(user) {
  const permissions = new Set();

  // User-level permissions
  user.permissions?.forEach(p => permissions.add(p));

  // Team-level permissions
  user.teams?.forEach(team => {
    team.permissions?.forEach(p => permissions.add(p));
  });

  // Org-level permissions
  user.organization?.permissions?.forEach(p => permissions.add(p));

  return Array.from(permissions);
}
```

### 2. Time-Based Permissions

```javascript
// Permissões temporárias (expiram)
const temporaryAccess = new ABACPolicy('temporaryAccess', async (ctx) => {
  const grantedAt = new Date(ctx.resource.accessGrantedAt);
  const expiresAt = new Date(grantedAt.getTime() + 24 * 60 * 60 * 1000);  // 24h
  const now = new Date();

  return now < expiresAt;
});
```

### 3. Dynamic Scopes (Context-Aware)

```javascript
// Scope muda baseado em contexto
function getDynamicScopes(user, context) {
  const scopes = [...user.baseScopes];

  // Add emergency scopes fora do horário comercial
  const hour = new Date().getHours();
  if (hour < 9 || hour >= 18) {
    if (user.roles.includes('on-call')) {
      scopes.push('orders:emergency:write');
    }
  }

  // Add regional scopes
  if (user.region === context.region) {
    scopes.push(`orders:read:${user.region}`);
  }

  return scopes;
}
```

### 4. Audit Trail para Authorization

```javascript
// Log todas as decisões de autorização
function auditAuthorization(decision, context) {
  auditResource.insert({
    userId: context.user.sub,
    resource: context.resource.id,
    action: context.action,
    decision: decision.allowed ? 'allowed' : 'denied',
    reason: decision.failedPolicy || 'all_policies_passed',
    timestamp: new Date().toISOString(),
    userScopes: context.user.scope?.split(' '),
    userRoles: context.user.roles
  });
}
```

---

## 🎯 Resumo: Camadas de Autorização

```
┌─────────────────────────────────────────┐
│  1. Authentication (OAuth2/OIDC)        │  ← Quem é você?
│     ✅ Token JWT válido                  │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  2. Tenant Isolation (Multi-tenancy)    │  ← Qual organização?
│     ✅ tenantId no token                 │
│     ✅ Partition por tenant              │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  3. Scope Check (Permissions)           │  ← Que tipo de acesso?
│     ✅ orders:read:own                   │
│     ✅ orders:write:team                 │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  4. Role Check (RBAC)                   │  ← Que papel?
│     ✅ admin, manager, user              │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  5. Ownership Check (RLS)               │  ← É seu?
│     ✅ resource.userId === token.sub     │
│     ✅ Partition por userId              │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  6. ABAC Policies (Business Rules)      │  ← Regras de negócio
│     ✅ Horário comercial                 │
│     ✅ Limite de aprovação               │
│     ✅ Região permitida                  │
└─────────────────────────────────────────┘
              ↓
         ✅ ALLOWED
```

---

## 🚀 Próximos Passos

1. **Implementar exemplo completo** - Ver `docs/examples/e64-authorization-complete.js`
2. **Authorization Plugin** - Plugin reutilizável para autorização
3. **Admin Dashboard** - UI para gerenciar scopes, roles, policies
4. **Testes de autorização** - Garantir que RLS/ABAC funcionam

**Lembre-se:**
- **Partitions são chave** para performance e isolamento
- **Nunca confie no input do usuário** para tenantId/userId
- **Sempre use 404 ao invés de 403** para evitar information leakage
- **Audit trail** para todas as decisões críticas
