# Advanced Authorization Patterns

> For guard basics (syntax, placement, precedence), see the [Guards Guide](./guards.md). This guide focuses on **advanced** patterns built on top of guards.

This guide covers:
- **Granular Scopes** -- Scalable scope structure and hierarchy
- **Row-Level Security (RLS)** -- Per-row access control via partitions
- **Multi-Tenancy** -- Complete data isolation per tenant
- **Guard Helpers** -- Reusable authorization functions
- **ABAC** -- Attribute-based access control policies
- **Advanced Patterns** -- Hierarchical permissions, time-based access, dynamic scopes, audit trails

---

## Table of Contents

1. [Granular Scopes](#granular-scopes)
2. [Row-Level Security (RLS)](#row-level-security-rls)
3. [Multi-Tenancy with Partitions](#multi-tenancy-with-partitions)
4. [Guard Helpers](#guard-helpers)
5. [ABAC (Attribute-Based Access Control)](#abac-attribute-based-access-control)
6. [Advanced Patterns](#advanced-patterns)

---

## Granular Scopes

### Problem: Overly Broad Scopes

```javascript
// BAD - Too permissive
const scopes = [
  'orders:read',    // Can read ALL orders? Or just own?
  'orders:write',   // Can edit ALL orders?
  'users:read'      // Can read ALL users?
];
```

### Solution: Scopes with Permission Levels

```javascript
// GOOD - Granular and scalable
const scopes = [
  'orders:read:own',       // Read only own orders
  'orders:read:team',      // Read team orders
  'orders:read:org',       // Read organization orders
  'orders:read:all',       // Admin - read everything

  'orders:write:own',      // Edit only own orders
  'orders:write:team',     // Edit team orders
  'orders:write:all',      // Admin - edit everything

  'orders:delete:own',     // Delete own orders
  'orders:delete:all',     // Admin - delete any order
  'orders:approve',        // Approve orders (workflow)
  'orders:export',         // Export reports
];
```

### Recommended Scope Structure

```
<resource>:<action>:<scope>:<constraint?>

Examples:
- orders:read:own           -> Read own orders
- orders:read:team:pending  -> Read pending team orders
- orders:write:org          -> Edit org orders
- orders:delete:all         -> Delete any order
- users:read:own            -> Read own profile
- analytics:read:org        -> Read org analytics
```

### Scope Hierarchy

```javascript
const SCOPE_HIERARCHY = {
  own: 1,
  team: 2,
  org: 3,
  all: 4
};

function hasScopeLevel(userScope, requiredScope) {
  return SCOPE_HIERARCHY[userScope] >= SCOPE_HIERARCHY[requiredScope];
}

// User has 'orders:read:org' (level 3)
// Endpoint requires 'orders:read:team' (level 2)
// hasScopeLevel('org', 'team') -> true
```

Use scope hierarchies inside guard functions:

```javascript
const ordersResource = await db.createResource({
  name: 'orders',
  attributes: {
    userId: 'string|required',
    teamId: 'string|required',
    total: 'number'
  },
  partitions: {
    byUser: { fields: { userId: 'string' } },
    byTeam: { fields: { teamId: 'string' } }
  },
  api: {
    guard: {
      list: (ctx) => {
        const level = getScopeLevel(ctx.auth.scopes, 'orders:read');

        if (level >= SCOPE_HIERARCHY.all) return true;
        if (level >= SCOPE_HIERARCHY.team) {
          ctx.setPartition('byTeam', { teamId: ctx.auth.claims.teamId });
          return true;
        }
        if (level >= SCOPE_HIERARCHY.own) {
          ctx.setPartition('byUser', { userId: ctx.auth.principalId });
          return true;
        }
        return false;
      }
    }
  }
});
```

---

## Row-Level Security (RLS)

Each row is only accessible by authorized users.

### Declarative Guard Approach (Preferred)

```javascript
const ordersResource = await db.createResource({
  name: 'orders',
  attributes: {
    userId: 'string|required',
    productId: 'string|required',
    quantity: 'number',
    total: 'number',
    status: 'string'
  },
  partitions: {
    byUser: {
      fields: { userId: 'string' }
    }
  },
  timestamps: true,
  api: {
    guard: {
      '*': (ctx) => {
        ctx.userId = ctx.auth.principalId;
        return !!ctx.userId;
      },
      list: (ctx) => {
        // O(1) partition lookup instead of O(n) scan
        ctx.setPartition('byUser', { userId: ctx.userId });
        return true;
      },
      create: (ctx) => {
        // Force userId from token -- never trust request body
        ctx.body.userId = ctx.userId;
        return true;
      },
      get: (ctx, resource) => resource.userId === ctx.userId,
      update: (ctx, resource) => resource.userId === ctx.userId,
      delete: (ctx, resource) => resource.userId === ctx.userId
    }
  }
});

await db.usePlugin(new ApiPlugin({ port: 3000, auth: { driver: 'jwt' } }));
```

### Custom Route Approach

For endpoints that go beyond standard CRUD:

```javascript
const ordersResource = await db.createResource({
  name: 'orders',
  attributes: { userId: 'string|required', status: 'string', total: 'number' },
  partitions: { byUser: { fields: { userId: 'string' } } },
  api: {
    guard: {
      '*': (ctx) => {
        ctx.userId = ctx.auth.principalId;
        return !!ctx.userId;
      }
    },

    'GET /my-summary': async (c, ctx) => {
      const orders = await ctx.services.resource.listPartition('byUser', {
        userId: ctx.auth.principalId
      });

      const total = orders.reduce((sum, o) => sum + (o.total || 0), 0);

      return ctx.success({
        count: orders.length,
        total,
        userId: ctx.auth.principalId
      });
    }
  }
});
```

**Performance**: Partition `byUser` transforms O(n) query into O(1) lookup.

---

## Multi-Tenancy with Partitions

Each tenant (organization) has completely isolated data.

### Declarative Guard Approach (Preferred)

```javascript
const ordersResource = await db.createResource({
  name: 'orders',
  attributes: {
    tenantId: 'string|required',
    userId: 'string|required',
    productId: 'string|required',
    quantity: 'number',
    total: 'number'
  },
  partitions: {
    byTenant: {
      fields: { tenantId: 'string' }
    },
    byTenantUser: {
      fields: {
        tenantId: 'string',
        userId: 'string'
      }
    }
  },
  timestamps: true,
  api: {
    guard: {
      '*': (ctx) => {
        ctx.tenantId = ctx.auth.tenantId || ctx.auth.claims.tid;
        ctx.userId = ctx.auth.principalId;
        return !!ctx.tenantId;
      },
      list: (ctx) => {
        ctx.setPartition('byTenantUser', {
          tenantId: ctx.tenantId,
          userId: ctx.userId
        });
        return true;
      },
      create: (ctx) => {
        // NEVER accept tenantId/userId from request body
        ctx.body.tenantId = ctx.tenantId;
        ctx.body.userId = ctx.userId;
        return true;
      },
      update: (ctx, resource) => {
        return resource.tenantId === ctx.tenantId
            && resource.userId === ctx.userId;
      },
      delete: (ctx, resource) => {
        return resource.tenantId === ctx.tenantId
            && resource.userId === ctx.userId;
      }
    }
  }
});
```

### Custom Route Approach

For admin cross-tenant views or tenant-scoped aggregations:

```javascript
const ordersResource = await db.createResource({
  name: 'orders',
  attributes: { tenantId: 'string|required', userId: 'string|required', total: 'number' },
  partitions: {
    byTenant: { fields: { tenantId: 'string' } },
    byTenantUser: { fields: { tenantId: 'string', userId: 'string' } }
  },
  api: {
    guard: {
      '*': (ctx) => {
        ctx.tenantId = ctx.auth.tenantId || ctx.auth.claims.tid;
        return !!ctx.tenantId;
      }
    },

    // Tenant-scoped listing (all users in the tenant)
    'GET /tenant-all': async (c, ctx) => {
      const orders = await ctx.services.resource.listPartition('byTenant', {
        tenantId: ctx.auth.tenantId
      });
      return ctx.success({ orders, tenant: ctx.auth.tenantId });
    },

    // User's orders within tenant (double partition)
    'GET /my': async (c, ctx) => {
      const orders = await ctx.services.resource.listPartition('byTenantUser', {
        tenantId: ctx.auth.tenantId,
        userId: ctx.auth.principalId
      });
      return ctx.success({ orders });
    }
  }
});

// Admin route at the plugin level (cross-tenant)
await db.usePlugin(new ApiPlugin({
  port: 3000,
  auth: { driver: 'jwt' },
  routes: {
    'GET /admin/orders': async (c, ctx) => {
      ctx.auth.requireRole('super-admin');
      const orders = await ctx.services.resources.orders.list({ limit: 1000 });
      return ctx.success({ orders });
    }
  }
}));
```

### Custom Claims in Keycloak for Multi-Tenancy

```javascript
// Keycloak: Protocol Mappers to include tenantId in token
//
// 1. Client -> orders-api -> Mappers -> Create
// 2. Mapper Type: User Attribute
// 3. Name: tenantId
// 4. User Attribute: tenantId
// 5. Token Claim Name: tenantId
// 6. Claim JSON Type: String
// 7. Add to access token: ON
//
// Token payload:
{
  "sub": "user-123",
  "email": "john@acme.com",
  "tenantId": "acme-corp",
  "preferred_username": "john.doe"
}
```

---

## Guard Helpers

Reusable functions that encapsulate common authorization checks. Use them inside `resource.api.guard` definitions.

```javascript
// ========================================
// guard-helpers.js
// ========================================

/**
 * Require a specific scope. Returns a guard function.
 */
function requireScope(scope) {
  return (ctx) => {
    if (!ctx.auth.hasScope(scope)) {
      return false;
    }
    return true;
  };
}

/**
 * Require any of the given scopes (OR). Returns a guard function.
 */
function requireAnyScope(...scopes) {
  return (ctx) => ctx.auth.hasAnyScope(...scopes);
}

/**
 * Require all of the given scopes (AND). Returns a guard function.
 */
function requireAllScopes(...scopes) {
  return (ctx) => ctx.auth.hasAllScopes(...scopes);
}

/**
 * Require a specific role. Returns a guard function.
 */
function requireRole(role) {
  return (ctx) => ctx.auth.hasRole(role);
}

/**
 * Check resource ownership. Returns a guard function for get/update/delete.
 */
function requireOwnership(userIdField = 'userId') {
  return (ctx, resource) => {
    if (!resource) return false;
    // Return false (404) instead of throwing (403) to avoid leaking existence
    return resource[userIdField] === ctx.auth.principalId;
  };
}

/**
 * Require tenant isolation. Returns a guard function.
 */
function requireTenant(tenantField = 'tenantId') {
  return (ctx) => {
    const tenantId = ctx.auth.tenantId || ctx.auth.claims.tid;
    if (!tenantId) return false;
    ctx.tenantId = tenantId;
    return true;
  };
}

/**
 * Combine multiple guard functions (AND -- all must pass).
 */
function allOf(...guards) {
  return async (ctx, resource) => {
    for (const guard of guards) {
      const result = typeof guard === 'function'
        ? await guard(ctx, resource)
        : guard;
      if (!result) return false;
    }
    return true;
  };
}

/**
 * Combine multiple guard functions (OR -- any can pass).
 */
function anyOf(...guards) {
  return async (ctx, resource) => {
    for (const guard of guards) {
      const result = typeof guard === 'function'
        ? await guard(ctx, resource)
        : guard;
      if (result) return true;
    }
    return false;
  };
}

export {
  requireScope,
  requireAnyScope,
  requireAllScopes,
  requireRole,
  requireOwnership,
  requireTenant,
  allOf,
  anyOf
};
```

### Using Guard Helpers

```javascript
import {
  requireScope,
  requireAnyScope,
  requireAllScopes,
  requireRole,
  requireOwnership,
  requireTenant,
  allOf,
  anyOf
} from './guard-helpers.js';

const ordersResource = await db.createResource({
  name: 'orders',
  attributes: {
    tenantId: 'string|required',
    userId: 'string|required',
    productId: 'string|required',
    total: 'number',
    status: 'string'
  },
  api: {
    guard: {
      // Scope-based: require write scope to create
      create: requireScope('orders:write:own'),

      // Multi-scope (OR): export OR read-all
      list: requireAnyScope('orders:export', 'orders:read:all'),

      // Multi-scope (AND): needs both scopes to approve
      // (used on a custom route, shown below)

      // Ownership: only the owner can update
      update: requireOwnership('userId'),

      // Combined: owner OR admin can delete
      delete: anyOf(
        requireOwnership('userId'),
        requireRole('admin')
      ),

      // Chained: tenant isolation AND ownership
      get: allOf(
        requireTenant(),
        requireOwnership('userId')
      )
    },

    'POST /:id/approve': async (c, ctx) => {
      ctx.auth.require({ scopes: ['orders:read:all', 'orders:approve'] });

      const order = await ctx.services.resource.update(ctx.input.params.id, {
        status: 'approved',
        approvedBy: ctx.auth.principalId,
        approvedAt: new Date().toISOString()
      });

      return ctx.success(order);
    }
  }
});
```

---

## ABAC (Attribute-Based Access Control)

Authorization policies based on user attributes, resource attributes, and environmental context.

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

// Policy: User can edit own orders
const canEditOwnOrder = new ABACPolicy('canEditOwnOrder', async (ctx) => {
  return ctx.resource.userId === ctx.user.sub;
});

// Policy: Manager can edit team orders
const canEditTeamOrder = new ABACPolicy('canEditTeamOrder', async (ctx) => {
  const isManager = ctx.user.roles?.includes('manager');
  return isManager && ctx.user.team === ctx.resource.team;
});

// Policy: Approval limit check
const canApproveHighValueOrder = new ABACPolicy('canApproveHighValueOrder', async (ctx) => {
  return ctx.resource.total <= (ctx.user.approvalLimit || 0);
});

// Policy: Business hours only (9am-6pm)
const isBusinessHours = new ABACPolicy('isBusinessHours', async () => {
  const hour = new Date().getHours();
  return hour >= 9 && hour < 18;
});

// Policy: Same tenant
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
      if (!policy) throw new Error(`Policy "${name}" not found`);

      const result = await policy.check(context);
      results.push({ policy: name, result });

      if (!result) {
        return { allowed: false, failedPolicy: name, results };
      }
    }

    return { allowed: true, results };
  }
}

export { ABACPolicy, PolicyEngine };
```

### Using ABAC with Guards

Create a guard helper that wraps the policy engine:

```javascript
import { PolicyEngine, canEditOwnOrder, sameTenant, isBusinessHours, canApproveHighValueOrder } from './abac-policies.js';

const policyEngine = new PolicyEngine();
policyEngine.register(canEditOwnOrder);
policyEngine.register(sameTenant);
policyEngine.register(isBusinessHours);
policyEngine.register(canApproveHighValueOrder);

/**
 * Guard helper that evaluates ABAC policies against a resource.
 */
function requirePolicies(...policyNames) {
  return async (ctx, record) => {
    const policyCtx = {
      user: ctx.auth.claims,
      resource: record,
      timestamp: new Date().toISOString()
    };

    const result = await policyEngine.evaluate(policyNames, policyCtx);
    return result.allowed;
  };
}

const ordersResource = await db.createResource({
  name: 'orders',
  attributes: {
    tenantId: 'string|required',
    userId: 'string|required',
    team: 'string',
    total: 'number',
    status: 'string'
  },
  api: {
    guard: {
      '*': (ctx) => {
        ctx.tenantId = ctx.auth.tenantId;
        return !!ctx.tenantId;
      },

      // ABAC on update: same tenant + own order + business hours
      update: requirePolicies('sameTenant', 'canEditOwnOrder', 'isBusinessHours'),

      // ABAC on delete: same tenant + own order
      delete: requirePolicies('sameTenant', 'canEditOwnOrder')
    },

    // Complex ABAC on approval
    'POST /:id/approve': async (c, ctx) => {
      ctx.auth.requireAuth();
      const order = await ctx.services.resource.get(ctx.input.params.id);
      if (!order) return ctx.notFound();

      const policyCtx = {
        user: ctx.auth.claims,
        resource: order,
        timestamp: new Date().toISOString()
      };

      const result = await policyEngine.evaluate(
        ['sameTenant', 'canApproveHighValueOrder'],
        policyCtx
      );

      if (!result.allowed) {
        return ctx.forbidden(`Policy "${result.failedPolicy}" denied access`);
      }

      const updated = await ctx.services.resource.update(order.id, {
        status: 'approved',
        approvedBy: ctx.auth.principalId,
        approvedAt: new Date().toISOString()
      });

      return ctx.success(updated);
    }
  }
});
```

---

## Advanced Patterns

### 1. Hierarchical Permissions (Inheritance)

```javascript
// User inherits permissions from group/org
// Hierarchy: User -> Team -> Org -> Global
function getEffectivePermissions(user) {
  const permissions = new Set();

  user.permissions?.forEach(p => permissions.add(p));

  user.teams?.forEach(team => {
    team.permissions?.forEach(p => permissions.add(p));
  });

  user.organization?.permissions?.forEach(p => permissions.add(p));

  return Array.from(permissions);
}

// Use in a guard
api: {
  guard: {
    list: (ctx) => {
      const effective = getEffectivePermissions(ctx.auth.claims);
      return effective.includes('orders:read');
    }
  }
}
```

### 2. Time-Based Permissions

```javascript
const temporaryAccess = new ABACPolicy('temporaryAccess', async (ctx) => {
  const grantedAt = new Date(ctx.resource.accessGrantedAt);
  const expiresAt = new Date(grantedAt.getTime() + 24 * 60 * 60 * 1000); // 24h
  return new Date() < expiresAt;
});
```

### 3. Dynamic Scopes (Context-Aware)

```javascript
function getDynamicScopes(user) {
  const scopes = [...user.baseScopes];

  const hour = new Date().getHours();
  if ((hour < 9 || hour >= 18) && user.roles.includes('on-call')) {
    scopes.push('orders:emergency:write');
  }

  if (user.region) {
    scopes.push(`orders:read:${user.region}`);
  }

  return scopes;
}

// Use in a guard
api: {
  guard: {
    update: (ctx, resource) => {
      const dynamicScopes = getDynamicScopes(ctx.auth.claims);
      return dynamicScopes.includes('orders:write:own')
          && resource.userId === ctx.auth.principalId;
    }
  }
}
```

### 4. Audit Trail for Authorization

```javascript
async function auditDecision(auditResource, ctx, action, allowed, reason) {
  await auditResource.insert({
    userId: ctx.auth.principalId,
    action,
    decision: allowed ? 'allowed' : 'denied',
    reason,
    timestamp: new Date().toISOString(),
    scopes: ctx.auth.scopes,
    roles: ctx.auth.roles
  });
}

// Wrap a guard with auditing
function audited(auditResource, action, guardFn) {
  return async (ctx, resource) => {
    const result = await guardFn(ctx, resource);
    await auditDecision(auditResource, ctx, action, result, result ? 'passed' : 'denied');
    return result;
  };
}

// Usage
api: {
  guard: {
    delete: audited(auditResource, 'orders:delete', requireOwnership('userId'))
  }
}
```

---

## Summary: Authorization Layers

```
+------------------------------------------+
|  1. Authentication (OAuth2/OIDC)         |  <- Who are you?
|     Valid JWT token                       |
+------------------------------------------+
              |
              v
+------------------------------------------+
|  2. Tenant Isolation (Multi-tenancy)     |  <- Which organization?
|     ctx.auth.tenantId from token         |
|     ctx.setPartition('byTenant', ...)    |
+------------------------------------------+
              |
              v
+------------------------------------------+
|  3. Scope Check (Permissions)            |  <- What type of access?
|     ctx.auth.hasScope('orders:read:own') |
|     Hierarchical scope levels            |
+------------------------------------------+
              |
              v
+------------------------------------------+
|  4. Role Check (RBAC)                    |  <- What role?
|     ctx.auth.hasRole('admin')            |
|     ['admin', 'manager', 'user']         |
+------------------------------------------+
              |
              v
+------------------------------------------+
|  5. Ownership Check (RLS)               |  <- Is it yours?
|     resource.userId === ctx.auth.principalId
|     ctx.setPartition('byUser', ...)      |
+------------------------------------------+
              |
              v
+------------------------------------------+
|  6. ABAC Policies (Business Rules)       |  <- Business rules
|     Business hours                       |
|     Approval limits                      |
|     Region restrictions                  |
+------------------------------------------+
              |
              v
         ALLOWED
```

---

## Key Principles

- **Partitions are key** for performance and isolation -- use `ctx.setPartition()` for O(1) RLS
- **Never trust user input** for tenantId/userId -- always derive from `ctx.auth`
- **Use 404 instead of 403** for ownership failures to avoid leaking resource existence
- **Audit trail** for all critical authorization decisions
- **Compose guards** with `allOf()` and `anyOf()` helpers for readable, reusable logic
