# 🛡️ Declarative Guards (Authorization)

> **Quick Jump:** [🎯 Why Guards?](#-why-guards) | [📖 Syntax](#-guard-syntax) | [🔌 Integration](#-framework-integration) | [🎯 Patterns](#-common-patterns) | [📚 Helpers](#-helper-functions)

> **Navigation:** [← Back to API Plugin](./README.md) | [Authentication →](./authentication.md) | [Deployment →](./deployment.md)

---

## Overview

**Guards** are declarative authorization rules defined directly in resource configuration. They enable **row-level security (RLS)**, **multi-tenancy**, and **ownership checks** with minimal code.

> **⏱️ Guards in 30 Seconds**
>
> ```javascript
> // Multi-tenant SaaS with row-level security - ONE config block!
> const ordersResource = await db.createResource({
>   name: 'orders',
>   attributes: { tenantId: 'string|required', userId: 'string|required', total: 'number' },
>   guard: {
>     '*': (ctx) => {
>       ctx.tenantId = ctx.user.tenantId;  // Extract tenant from JWT
>       return !!ctx.tenantId;              // Block if no tenant
>     },
>     list: (ctx) => {
>       // Automatic partition isolation - users ONLY see their tenant's data!
>       ctx.setPartition('byTenantUser', {
>         tenantId: ctx.tenantId,
>         userId: ctx.user.sub
>       });
>       return true;
>     },
>     create: (ctx) => {
>       // Auto-inject tenant/user - impossible to forget or bypass!
>       ctx.data.tenantId = ctx.tenantId;
>       ctx.data.userId = ctx.user.sub;
>       return true;
>     }
>   }
> });
>
> await db.usePlugin(new ApiPlugin({ port: 3000, auth: { driver: 'jwt' } }));
> ```
>
> **What you get:**
> - ✅ **Zero trust by default** - Every request validates tenant/user
> - ✅ **Impossible to bypass** - Guards run BEFORE resource operations
> - ✅ **Auto-partition isolation** - O(1) queries, not O(n) scans
> - ✅ **DRY** - Write once, works for ALL CRUD operations
> - ✅ **Framework-agnostic** - Same code works with Hono, Express, Fastify

---

## 🎯 Why Guards?

**Before Guards (Manual Authorization):**
```javascript
// ❌ 70+ lines of repetitive middleware
app.get('/orders', requireAuth, async (req, res) => {
  // Manual tenant check
  if (!req.user.tenantId) return res.status(403).json({ error: 'Forbidden' });

  // Manual partition setup
  const orders = await ordersResource.list({
    partition: 'byTenantUser',
    partitionValues: {
      tenantId: req.user.tenantId,
      userId: req.user.sub
    }
  });
  res.json(orders);
});

app.post('/orders', requireAuth, async (req, res) => {
  // Manual tenant injection (easy to forget!)
  if (!req.user.tenantId) return res.status(403).json({ error: 'Forbidden' });
  req.body.tenantId = req.user.tenantId;  // MUST remember to do this!
  req.body.userId = req.user.sub;

  const order = await ordersResource.insert(req.body);
  res.json(order);
});

// ... 50+ more lines for update, delete, ownership checks...
```

**With Guards (Declarative Authorization):**
```javascript
// ✅ 20 lines - Impossible to forget!
const ordersResource = await db.createResource({
  name: 'orders',
  attributes: { tenantId: 'string|required', userId: 'string|required', ... },
  guard: {
    // Wildcard: applies to ALL operations
    '*': (ctx) => {
      const tenantId = ctx.user.tenantId || ctx.user.tid;
      if (!tenantId) return false;
      ctx.tenantId = tenantId;
      ctx.userId = ctx.user.sub;
      return true;
    },

    // List: automatic partition (O(1) RLS!)
    list: (ctx) => {
      ctx.setPartition('byTenantUser', {
        tenantId: ctx.tenantId,
        userId: ctx.userId
      });
      return true;
    },

    // Insert: force tenant/user from token (never trust body!)
    insert: (ctx) => {
      ctx.body.tenantId = ctx.tenantId;
      ctx.body.userId = ctx.userId;
      return true;
    },

    // Update: ownership check
    update: (ctx, resource) => resource.userId === ctx.userId,

    // Delete: ownership OR admin role
    delete: (ctx, resource) => {
      const isOwner = resource.userId === ctx.userId;
      const isAdmin = ctx.user.roles?.includes('admin');
      return isOwner || isAdmin;
    }
  }
});
```

**Benefits:**
- ✅ **70+ lines → 20 lines** (DRY principle)
- ✅ **Impossible to forget** protection (defined once, applied everywhere)
- ✅ **O(1) Row-Level Security** via automatic partitions
- ✅ **Framework-agnostic** (works with Hono, Express, Fastify)
- ✅ **Type-safe** authorization logic
- ✅ **Centralized** security rules

---

## 📖 Guard Syntax

**Simple Role/Scope Array:**
```javascript
guard: ['admin']  // Allow if user has 'admin' role or scope
```

**Per-Operation Guards:**
```javascript
guard: {
  list: (ctx) => { /* ... */ },
  get: (ctx, resource) => { /* ... */ },
  insert: (ctx) => { /* ... */ },
  update: (ctx, resource) => { /* ... */ },
  delete: (ctx, resource) => { /* ... */ }
}
```

**Wildcard + Override:**
```javascript
guard: {
  '*': (ctx) => ctx.user.tenantId ? true : false,  // Apply to all
  delete: ['admin']  // Override: only admins can delete
}
```

**Guard Function Signature:**
```javascript
type GuardContext = {
  user: JWTPayload;           // Decoded JWT token
  params: Record<string, string>;
  body: any;
  query: Record<string, string>;
  headers: Record<string, string>;
  setPartition(name, values): void;  // Helper to set partition
  tenantId?: string;
  userId?: string;
  raw?: { req?, c?, request? };      // Framework-specific
};

type GuardFunction = (
  context: GuardContext,
  resource?: Resource  // Current resource (for get/update/delete)
) => boolean | Promise<boolean>;
```

---

## 📍 Guards Placement & Precedence

**NEW**: Guards can be defined in three places with clear precedence:

### 1. Resource-Level Guards (Root)

**Recommended** - Cleaner, more intuitive syntax:

```javascript
await db.createResource({
  name: 'orders',
  attributes: { tenantId: 'string', userId: 'string', total: 'number' },
  guards: {  // ✅ At root level (NEW!)
    list: (ctx) => {
      ctx.setPartition('byTenant', { tenantId: ctx.user.tenantId });
      return true;
    },
    create: (ctx) => {
      ctx.data.tenantId = ctx.user.tenantId;
      return true;
    },
    delete: ['admin']
  }
});
```

### 2. Resource-Level Guards (Config)

**Legacy** - Still supported for backwards compatibility:

```javascript
await db.createResource({
  name: 'orders',
  attributes: { tenantId: 'string', userId: 'string', total: 'number' },
  config: {
    guards: {  // ⚠️ Legacy location (still works)
      list: (ctx) => { /* ... */ },
      create: (ctx) => { /* ... */ }
    }
  }
});
```

### 3. Global Guards (API Plugin Level)

**NEW** - Apply to ALL resources for specific HTTP verbs:

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  guards: {  // ✅ Global guards (NEW!)
    // Require authentication for ALL list operations across ALL resources
    list: (ctx) => !!ctx.user,

    // Only admins can delete ANY resource
    delete: (ctx) => ctx.user?.role === 'admin' || ctx.user?.scopes?.includes('preset:admin'),

    // Require write scope for create operations
    create: (ctx) => ctx.user?.scopes?.includes('write')
  },
  auth: { /* ... */ }
}));
```

### Precedence Rules

**Priority: Resource Guards > Global Guards > No Guard (Public)**

```javascript
// Example: Global guards as baseline + resource-specific overrides
await db.usePlugin(new ApiPlugin({
  port: 3000,
  guards: {
    // Global: Require auth for all list operations
    list: (ctx) => !!ctx.user,

    // Global: Only admins can delete
    delete: (ctx) => ctx.user?.role === 'admin'
  }
}));

// Resource-specific override
await db.createResource({
  name: 'public_articles',
  attributes: { title: 'string', content: 'string' },
  guards: {
    list: true,  // ✅ Override: Public listing (ignores global guard)
    delete: ['admin', 'editor']  // ✅ Override: Editors can also delete
  }
});

// No guards = uses global guards
await db.createResource({
  name: 'orders',
  attributes: { total: 'number' }
  // ✅ Uses global guards (requires auth for list, admin for delete)
});
```

### Use Cases

**Global Guards** are perfect for:
- ✅ Baseline authentication requirements across ALL resources
- ✅ Organization-wide policies (e.g., "only admins can delete")
- ✅ Default multi-tenancy rules
- ✅ Compliance requirements (GDPR, SOC2)

**Resource Guards** are perfect for:
- ✅ Resource-specific authorization logic
- ✅ Overriding global guards for public resources
- ✅ Complex ownership checks
- ✅ Fine-grained partition isolation

**Example: Enterprise SaaS with Global Baseline**

```javascript
// Global baseline: Everything requires auth + tenant isolation
await db.usePlugin(new ApiPlugin({
  port: 3000,
  guards: {
    '*': (ctx) => {
      // Extract tenant from JWT token
      ctx.tenantId = ctx.user?.tenantId || ctx.user?.tid;
      return !!ctx.tenantId;  // Block if no tenant
    },
    list: (ctx) => {
      // Auto-partition ALL resources by tenant
      ctx.setPartition('byTenant', { tenantId: ctx.tenantId });
      return true;
    },
    create: (ctx) => {
      // Auto-inject tenant on ALL creates
      ctx.data.tenantId = ctx.tenantId;
      return true;
    },
    delete: ['admin']  // Global: Only admins can delete
  }
}));

// Public resource: Override global guards
await db.createResource({
  name: 'blog_posts',
  attributes: { title: 'string', content: 'string' },
  guards: {
    list: true,   // Public listing
    get: true     // Public viewing
    // create/update/delete still use global guards
  }
});

// Orders: Add ownership check on top of global guards
await db.createResource({
  name: 'orders',
  attributes: { userId: 'string', total: 'number' },
  guards: {
    // Inherits global '*', 'list', 'create' guards
    update: (ctx, record) => record.userId === ctx.user.sub,  // Ownership check
    delete: (ctx, record) => {
      // Override global: Owners can delete their own orders
      const isOwner = record.userId === ctx.user.sub;
      const isAdmin = ctx.user?.role === 'admin';
      return isOwner || isAdmin;
    }
  }
});
```

**Benefits:**
- ✅ **DRY** - Write tenant isolation once, applies everywhere
- ✅ **Safe by Default** - New resources automatically get global guards
- ✅ **Flexible** - Override global guards per-resource when needed
- ✅ **Maintainable** - Update global policy in one place

---

## 🔌 Framework Integration

**Hono (Recommended):**
```javascript
import { createHonoContext, applyGuardsToList } from 's3db.js';
import { Hono } from 'hono';

const app = new Hono();

// Auth middleware (populate c.set('user'))
app.use('*', async (c, next) => {
  const token = c.req.header('authorization')?.replace('Bearer ', '');
  const user = verifyJWT(token);  // Your JWT verification
  c.set('user', user);
  await next();
});

// Routes with guards
app.get('/orders', async (c) => {
  const context = await createHonoContext(c);
  const options = await applyGuardsToList(ordersResource, context);
  const orders = await ordersResource.list(options);
  return c.json({ orders });
});

app.post('/orders', async (c) => {
  const context = await createHonoContext(c);
  const body = await c.req.json();
  const data = await applyGuardsToInsert(ordersResource, context, body);
  const order = await ordersResource.insert(data);
  return c.json(order, 201);
});
```

**Express:**
```javascript
import { createExpressContext, applyGuardsToList } from 's3db.js';

app.get('/orders', async (req, res) => {
  const context = createExpressContext(req);
  const options = await applyGuardsToList(ordersResource, context);
  const orders = await ordersResource.list(options);
  res.json({ orders });
});
```

**Fastify:**
```javascript
import { createFastifyContext, applyGuardsToList } from 's3db.js';

fastify.get('/orders', async (request, reply) => {
  const context = createFastifyContext(request);
  const options = await applyGuardsToList(ordersResource, context);
  const orders = await ordersResource.list(options);
  return { orders };
});
```

---

## 🎯 Common Patterns

**Multi-Tenancy (Tenant Isolation):**
```javascript
guard: {
  '*': (ctx) => {
    ctx.tenantId = ctx.user.tenantId;
    return !!ctx.tenantId;
  },
  list: (ctx) => {
    ctx.setPartition('byTenant', { tenantId: ctx.tenantId });
    return true;
  },
  insert: (ctx) => {
    ctx.body.tenantId = ctx.tenantId;  // Force tenant
    return true;
  }
}
```

**Ownership Checks:**
```javascript
guard: {
  get: (ctx, resource) => resource.userId === ctx.user.sub,
  update: (ctx, resource) => resource.userId === ctx.user.sub,
  delete: (ctx, resource) => resource.userId === ctx.user.sub
}
```

**Role-Based Access Control (RBAC):**
```javascript
guard: {
  list: ['user', 'admin'],           // Users and admins can list
  insert: ['user', 'admin'],         // Users and admins can create
  update: (ctx, resource) => {       // Only owners or admins can update
    const isOwner = resource.userId === ctx.user.sub;
    const isAdmin = ctx.user.roles?.includes('admin');
    return isOwner || isAdmin;
  },
  delete: ['admin']                  // Only admins can delete
}
```

**Scope-Based Authorization:**
```javascript
guard: {
  list: (ctx) => {
    const scopes = ctx.user.scope?.split(' ') || [];
    if (scopes.includes('orders:read:all')) {
      // Admin: see all orders
      return true;
    } else if (scopes.includes('orders:read:own')) {
      // User: see only own orders
      ctx.setPartition('byUser', { userId: ctx.user.sub });
      return true;
    }
    return false;
  }
}
```

---

## 📚 Helper Functions

Import from `s3db.js/concerns/guards-helpers`:

```javascript
// Framework adapters
createHonoContext(c)          // Hono → GuardContext
createExpressContext(req)     // Express → GuardContext
createFastifyContext(request) // Fastify → GuardContext

// Guard application
applyGuardsToList(resource, context, options)    // Returns modified options
applyGuardsToGet(resource, context, record)      // Returns record or null
applyGuardsToInsert(resource, context, data)     // Returns modified data
applyGuardsToUpdate(resource, context, record)   // Throws if denied
applyGuardsToDelete(resource, context, record)   // Throws if denied
```

---

## 🔧 Implementation Details

### Guard Execution in Resource Methods

Guards are executed at different points depending on the operation:

**BEFORE fetching data:**
- `list` - Guard runs first, can set partition, then query executes
- `insert` - Guard runs before insert, can modify `ctx.body`

**AFTER fetching data:**
- `get` - Fetches record first, then guard checks ownership (has access to resource)
- `update` - Fetches record first, then guard validates (has access to resource)
- `delete` - Fetches record first, then guard validates (has access to resource)

**Why this matters:**
- List operations benefit from partition isolation (O(1) performance)
- Get/update/delete can check resource attributes (e.g., `resource.userId === ctx.user.sub`)
- Failed guards for get operations should return `null` (404) instead of throwing (403)

### Guard Normalization

```javascript
// Simple string array → wildcard guard
guard: ['admin']
// Becomes: { '*': ['admin'] }

// Per-operation guards
guard: {
  list: (ctx) => { ... },
  get: (ctx, resource) => { ... }
}
// Used as-is

// Wildcard + specific override
guard: {
  '*': (ctx) => { ... },    // Applies to all
  delete: ['admin']          // Override for delete only
}
```

### Role/Scope Detection

Guards automatically check multiple token formats:

```javascript
// Keycloak client roles
const clientId = user.azp || process.env.CLIENT_ID;
const clientRoles = user.resource_access?.[clientId]?.roles || [];

// Keycloak realm roles
const realmRoles = user.realm_access?.roles || [];

// Azure AD roles
const azureRoles = user.roles || [];

// OAuth2 scopes (space-separated string)
const userScopes = user.scope?.split(' ') || [];

// Combined check
const hasPermission = requiredRolesScopes.some(required =>
  userScopes.includes(required) ||
  clientRoles.includes(required) ||
  realmRoles.includes(required) ||
  azureRoles.includes(required)
);
```

### Error Handling Strategy

**404 vs 403 for Ownership Failures:**

```javascript
// ✅ GOOD - Use 404 for ownership failures
get: async (ctx, resource) => {
  const allowed = resource.userId === ctx.user.sub;
  if (!allowed) return null;  // Returns 404, doesn't leak existence
  return resource;
}

// ❌ BAD - Don't throw 403 for ownership
get: async (ctx, resource) => {
  if (resource.userId !== ctx.user.sub) {
    throw new Error('Forbidden');  // Leaks that resource exists!
  }
  return resource;
}
```

**When to use each:**
- **404 (Not Found)**: Ownership failures, resource doesn't belong to user
- **403 (Forbidden)**: Permission failures, user lacks required role/scope
- **401 (Unauthorized)**: Authentication failures, no token or invalid token

### Performance Considerations

**Partition-based RLS is O(1):**

```javascript
// ❌ SLOW - O(n) full table scan
list: async (ctx) => {
  const allRecords = await resource.list();
  return allRecords.filter(r => r.userId === ctx.user.sub);  // Filter in memory
}

// ✅ FAST - O(1) partition lookup
list: (ctx) => {
  ctx.setPartition('byUser', { userId: ctx.user.sub });  // Direct S3 prefix
  return true;
}
```

**Async vs Sync Guards:**

Guards can be async (return `Promise<boolean>`) for:
- Fetching additional user data
- Checking external services
- Complex business logic requiring I/O

```javascript
guard: {
  update: async (ctx, resource) => {
    // Async: fetch user's current approval limit
    const userProfile = await profileResource.get(ctx.user.sub);
    const limit = userProfile.approvalLimit || 0;
    return resource.total <= limit;
  }
}
```

---

## 🔗 Examples & Documentation

- **Complete Example**: [docs/examples/e66-guards-live.js](../../examples/e66-guards-live.js)
- **Before/After Comparison**: [docs/examples/e65-guards-comparison.js](../../examples/e65-guards-comparison.js)
- **Authorization Patterns**: [authorization-patterns.md](./authorization-patterns.md) - Middleware examples for scopes, roles, ABAC

---

## ⚠️ Important Notes

1. **Guards are NOT automatic with API Plugin** - You must manually apply guards in custom routes (or use global guards at plugin level)
2. **Future feature**: `addResource()` method will auto-apply guards to generated routes
3. **Never trust request body** - Always force `tenantId`/`userId` from token in guards
4. **Use 404 instead of 403** - Prevents information leakage (don't reveal resource exists)
5. **Guards run BEFORE or AFTER database operations** - List/insert run before, get/update/delete run after (to access resource)
6. **Partitions = O(1) RLS** - Use `ctx.setPartition()` for optimal performance
7. **Guards can be async** - Use `async` for I/O operations (fetching user data, external checks)

---

## 🎯 Summary

You learned:
- ✅ **Declarative Guards** - Define authorization rules in resource config (not middleware)
- ✅ **70+ lines → 20 lines** - DRY principle with impossible-to-forget protection
- ✅ **Multi-Tenancy** - Row-level security with O(1) partition isolation
- ✅ **Ownership Checks** - Ensure users can only modify their own resources
- ✅ **RBAC** - Role-based and scope-based authorization
- ✅ **Framework Integration** - Works with Hono, Express, Fastify

**Next Steps:**
1. Try the examples: [e66-guards-live.js](../../examples/e66-guards-live.js) | [e65-guards-comparison.js](../../examples/e65-guards-comparison.js)
2. Read authentication docs: [Authentication →](./authentication.md)
3. Learn about partitions: [Resource Documentation](../../resource.md)
4. Deploy to production: [Deployment →](./deployment.md)

---

## 🔗 See Also

**Related Documentation:**
- [API Plugin](./README.md) - Main API Plugin documentation
- [Authentication](./authentication.md) - Set up JWT/OIDC authentication
- [Resource Documentation](../../resource.md) - Partitions and resource config
- [Guards Design](../../guards-design.md) - Detailed design document

**Examples:**
- [e66-guards-live.js](../../examples/e66-guards-live.js) - Complete guards example with live API
- [e65-guards-comparison.js](../../examples/e65-guards-comparison.js) - Before/after comparison
- [e49-api-plugin-complete.js](../../examples/e49-api-plugin-complete.js) - API with guards

---

> **Navigation:** [← Back to API Plugin](./README.md) | [Authentication →](./authentication.md) | [Deployment →](./deployment.md)
