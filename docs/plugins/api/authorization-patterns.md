# Authorization Patterns with s3db.js

Authentication answers **"who are you?"**, authorization answers **"what can you do?"**.

This guide shows complete authorization patterns using s3db.js:
- **Granular Scopes** - Scalable scope structure
- **Row-Level Security (RLS)** - Per-row access control using partitions
- **Multi-Tenancy** - Complete data isolation per tenant
- **Attribute-Based Access Control (ABAC)** - Attribute-based policies

---

## 📋 Table of Contents

1. [Granular Scopes](#granular-scopes)
2. [Row-Level Security (RLS)](#row-level-security-rls)
3. [Multi-Tenancy with Partitions](#multi-tenancy-with-partitions)
4. [Authorization Middleware](#authorization-middleware)
5. [ABAC (Attribute-Based Access Control)](#abac-attribute-based-access-control)
6. [Advanced Patterns](#advanced-patterns)

---

## Granular Scopes

### ❌ Problem: Overly Broad Scopes

```javascript
// BAD - Too permissive
const scopes = [
  'orders:read',    // Can read ALL orders? Or just own?
  'orders:write',   // Can edit ALL orders?
  'users:read'      // Can read ALL users?
];
```

### ✅ Solution: Scopes with Permission Levels

```javascript
// GOOD - Granular and scalable
const scopes = [
  // Read permissions
  'orders:read:own',       // Read only own orders
  'orders:read:team',      // Read team orders
  'orders:read:org',       // Read organization orders
  'orders:read:all',       // Admin - read everything

  // Write permissions
  'orders:write:own',      // Edit only own orders
  'orders:write:team',     // Edit team orders
  'orders:write:all',      // Admin - edit everything

  // Special permissions
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
- orders:read:own           → Read own orders
- orders:read:team:pending  → Read pending team orders
- orders:write:org          → Edit org orders
- orders:delete:all         → Delete any order
- users:read:own            → Read own profile
- users:write:team          → Edit team users
- analytics:read:org        → Read org analytics
```

### Scope Hierarchy

```javascript
const SCOPE_HIERARCHY = {
  own: 1,    // Lowest permission
  team: 2,
  org: 3,
  all: 4     // Highest permission (admin)
};

function hasPermission(userScope, requiredScope) {
  return SCOPE_HIERARCHY[userScope] >= SCOPE_HIERARCHY[requiredScope];
}

// Example:
// User has 'orders:read:org' (level 3)
// Endpoint requires 'orders:read:team' (level 2)
// hasPermission('org', 'team') → true ✅
```

---

## Row-Level Security (RLS)

**Concept**: Each row/document is only accessible by authorized users.

### Pattern 1: Partition by User ID

```javascript
import { PluginError } from 's3db.js';

// ========================================
// 1. Create resource with partition by userId
// ========================================
const ordersResource = await db.createResource({
  name: 'orders',
  attributes: {
    userId: 'string|required',      // Order owner
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
// 2. Automatic RLS middleware
// ========================================
function rlsMiddleware(req, res, next) {
  // Inject userId from token into all queries
  req.userId = req.user.sub;  // User ID from token (Azure AD oid, Keycloak sub)

  // Force filter by userId in ALL queries
  req.rlsFilter = { userId: req.userId };

  next();
}

apiPlugin.use(rlsMiddleware);

// ========================================
// 3. Routes with automatic RLS
// ========================================
apiPlugin.addRoute({
  path: '/api/orders',
  method: 'GET',
  handler: async (req, res) => {
    // Query automatically filtered by userId via partition
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

    // Force userId from token (don't trust request body)
    const order = await ordersResource.insert({
      userId: req.userId,  // Always from token, never trust input
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

    // Fetch order
    const order = await ordersResource.get(id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // RLS Check - only return if it belongs to the user
    if (order.userId !== req.userId) {
      return res.status(404).json({ error: 'Order not found' });  // 404, not 403!
    }

    res.json(order);
  },
  auth: 'oauth2'
});
```

**Performance**: Partition `byUser` transforms O(n) query into O(1) lookup!

---

## Multi-Tenancy with Partitions

**Concept**: Each tenant (organization) has completely isolated data.

### Pattern: Partition by Tenant ID

```javascript
// ========================================
// 1. Resource with partition by tenantId
// ========================================
const ordersResource = await db.createResource({
  name: 'orders',
  attributes: {
    tenantId: 'string|required',    // Organization ID
    userId: 'string|required',      // User within tenant
    productId: 'string|required',
    quantity: 'number',
    total: 'number'
  },
  partitions: {
    byTenant: {
      fields: { tenantId: 'string' }  // Complete isolation per tenant
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
// 2. Multi-Tenant Middleware
// ========================================
function multiTenantMiddleware(req, res, next) {
  // TenantId comes from JWT token (custom claim)
  req.tenantId = req.user.tenantId || req.user.tid;  // Azure AD tid, Keycloak custom
  req.userId = req.user.sub;

  // Validate that tenant exists
  if (!req.tenantId) {
    return res.status(403).json({
      error: 'forbidden',
      error_description: 'Tenant ID missing in token'
    });
  }

  // Force tenant filter in ALL queries
  req.tenantFilter = { tenantId: req.tenantId };

  next();
}

apiPlugin.use(multiTenantMiddleware);

// ========================================
// 3. Multi-Tenant Routes
// ========================================
apiPlugin.addRoute({
  path: '/api/orders',
  method: 'GET',
  handler: async (req, res) => {
    // Fetch only orders from user's tenant
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
    // Fetch user's orders within tenant (double partition!)
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

    // NEVER accept tenantId/userId from request - always from token!
    const order = await ordersResource.insert({
      tenantId: req.tenantId,  // From token
      userId: req.userId,      // From token
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
// 4. Admin can see all tenants
// ========================================
apiPlugin.addRoute({
  path: '/api/admin/orders',
  method: 'GET',
  handler: async (req, res) => {
    // Check super-admin role
    const roles = req.user.realm_access?.roles || [];
    if (!roles.includes('super-admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Admin can list EVERYTHING (no tenant filter)
    const orders = await ordersResource.list({ limit: 1000 });

    res.json({ orders });
  },
  auth: 'oauth2'
});
```

### Custom Claims in Keycloak for Multi-Tenancy

```javascript
// Keycloak: Protocol Mappers to include tenantId in token

// 1. Client → orders-api → Mappers → Create
// 2. Mapper Type: User Attribute
// 3. Name: tenantId
// 4. User Attribute: tenantId
// 5. Token Claim Name: tenantId
// 6. Claim JSON Type: String
// 7. Add to access token: ON

// Now the token will have:
{
  "sub": "user-123",
  "email": "john@acme.com",
  "tenantId": "acme-corp",  // ✅ Custom claim
  "preferred_username": "john.doe"
}
```

---

## Authorization Middleware

Reusable middleware to check scopes and permissions.

```javascript
// ========================================
// authorization-middleware.js
// ========================================

/**
 * Check if user has required scope
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
 * Check if user has any of the scopes (OR)
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
 * Check if user has all scopes (AND)
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
 * Check if user has required role
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
 * Check resource ownership
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
 * Check tenant isolation
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

### Using Authorization Middleware

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
    // Handler only executes if correct scope
    const order = await ordersResource.insert({
      userId: req.user.sub,
      ...req.body
    });
    res.status(201).json(order);
  },
  auth: 'oauth2'
});

// ========================================
// Multi-scope (OR) - accepts any one
// ========================================
apiPlugin.addRoute({
  path: '/api/orders/export',
  method: 'GET',
  middleware: [requireAnyScope('orders:export', 'orders:read:all')],
  handler: async (req, res) => {
    // Executes if has orders:export OR orders:read:all
    const orders = await ordersResource.list();
    res.json(orders);
  },
  auth: 'oauth2'
});

// ========================================
// Multi-scope (AND) - needs all
// ========================================
apiPlugin.addRoute({
  path: '/api/orders/:id/approve',
  method: 'POST',
  middleware: [requireAllScopes('orders:read:all', 'orders:approve')],
  handler: async (req, res) => {
    // Needs both scopes
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
    // Only admins can access
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
    // Ownership already validated, resource in req.resource
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

      // Validate tenant before ownership
      if (order && order.tenantId !== req.tenantId) {
        return null;  // Returns 404
      }

      return order;
    })
  ],
  handler: async (req, res) => {
    // Tenant and ownership validated
    res.json(req.resource);
  },
  auth: 'oauth2'
});
```

---

## ABAC (Attribute-Based Access Control)

Authorization policies based on user and resource attributes.

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
// Example policies
// ========================================

// Policy: User can edit own orders
const canEditOwnOrder = new ABACPolicy('canEditOwnOrder', async (ctx) => {
  return ctx.resource.userId === ctx.user.sub;
});

// Policy: Manager can edit team orders
const canEditTeamOrder = new ABACPolicy('canEditTeamOrder', async (ctx) => {
  const userTeam = ctx.user.team;
  const orderTeam = ctx.resource.team;
  const isManager = ctx.user.roles?.includes('manager');

  return isManager && userTeam === orderTeam;
});

// Policy: Can approve orders above limit if has permission
const canApproveHighValueOrder = new ABACPolicy('canApproveHighValueOrder', async (ctx) => {
  const orderTotal = ctx.resource.total;
  const userApprovalLimit = ctx.user.approvalLimit || 0;

  return orderTotal <= userApprovalLimit;
});

// Policy: Business hours (9am-6pm)
const isBusinessHours = new ABACPolicy('isBusinessHours', async (ctx) => {
  const now = new Date();
  const hour = now.getHours();
  return hour >= 9 && hour < 18;
});

// Policy: Tenant isolation
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
        throw new PluginError(`Policy "${name}" not found`, {
          statusCode: 500,
          retriable: false,
          suggestion: 'Register the policy with engine.register() before evaluation.',
          metadata: { missingPolicy: name, availablePolicies: [...this.policies.keys()] }
        });
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
// ABAC Middleware
// ========================================

function requirePolicies(...policyNames) {
  return async (req, res, next) => {
    const context = {
      user: req.user,
      resource: req.resource,  // Needs to be populated before (via requireOwnership or similar)
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
// Using ABAC
// ========================================

// Register policies
const policyEngine = new PolicyEngine();
policyEngine.register(canEditOwnOrder);
policyEngine.register(canEditTeamOrder);
policyEngine.register(canApproveHighValueOrder);
policyEngine.register(isBusinessHours);
policyEngine.register(sameTenant);

// Route with multiple policies
apiPlugin.addRoute({
  path: '/api/orders/:id',
  method: 'PATCH',
  middleware: [
    requireTenant(),
    requireOwnership(async (req) => await ordersResource.get(req.params.id)),
    requirePolicies('sameTenant', 'canEditOwnOrder', 'isBusinessHours')
  ],
  handler: async (req, res) => {
    // All policies passed
    const order = await ordersResource.update(req.params.id, req.body);
    res.json(order);
  },
  auth: 'oauth2'
});

// Approve order - complex policies
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

## Advanced Patterns

### 1. Hierarchical Permissions (Inheritance)

```javascript
// User inherits permissions from group/org
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
// Temporary permissions (expire)
const temporaryAccess = new ABACPolicy('temporaryAccess', async (ctx) => {
  const grantedAt = new Date(ctx.resource.accessGrantedAt);
  const expiresAt = new Date(grantedAt.getTime() + 24 * 60 * 60 * 1000);  // 24h
  const now = new Date();

  return now < expiresAt;
});
```

### 3. Dynamic Scopes (Context-Aware)

```javascript
// Scope changes based on context
function getDynamicScopes(user, context) {
  const scopes = [...user.baseScopes];

  // Add emergency scopes outside business hours
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

### 4. Audit Trail for Authorization

```javascript
// Log all authorization decisions
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

## 🎯 Summary: Authorization Layers

```
┌─────────────────────────────────────────┐
│  1. Authentication (OAuth2/OIDC)        │  ← Who are you?
│     ✅ Valid JWT token                   │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  2. Tenant Isolation (Multi-tenancy)    │  ← Which organization?
│     ✅ tenantId in token                 │
│     ✅ Partition by tenant               │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  3. Scope Check (Permissions)           │  ← What type of access?
│     ✅ orders:read:own                   │
│     ✅ orders:write:team                 │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  4. Role Check (RBAC)                   │  ← What role?
│     ✅ admin, manager, user              │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  5. Ownership Check (RLS)               │  ← Is it yours?
│     ✅ resource.userId === token.sub     │
│     ✅ Partition by userId               │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  6. ABAC Policies (Business Rules)      │  ← Business rules
│     ✅ Business hours                    │
│     ✅ Approval limit                    │
│     ✅ Allowed region                    │
└─────────────────────────────────────────┘
              ↓
         ✅ ALLOWED
```

---

## 🚀 Next Steps

1. **Implement complete example** - See `docs/examples/e64-authorization-complete.js`
2. **Authorization Plugin** - Reusable plugin for authorization
3. **Admin Dashboard** - UI to manage scopes, roles, policies
4. **Authorization tests** - Ensure RLS/ABAC work

**Remember:**
- **Partitions are key** for performance and isolation
- **Never trust user input** for tenantId/userId
- **Always use 404 instead of 403** to avoid information leakage
- **Audit trail** for all critical decisions
