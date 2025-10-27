# 🛡️ Declarative Guards (Authorization)

> **Quick Jump:** [🎯 Why Guards?](#-why-guards) | [📖 Syntax](#-guard-syntax) | [🔌 Integration](#-framework-integration) | [🎯 Patterns](#-common-patterns) | [📚 Helpers](#-helper-functions)

> **Navigation:** [← Back to API Plugin](../api.md) | [Authentication →](./authentication.md) | [Deployment →](./deployment.md)

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

## 🔌 Framework Integration

**Hono (Recommended):**
```javascript
import { createHonoContext, applyGuardsToList } from 's3db.js/plugins/api/concerns/guards-helpers';
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
import { createExpressContext, applyGuardsToList } from 's3db.js/plugins/api/concerns/guards-helpers';

app.get('/orders', async (req, res) => {
  const context = createExpressContext(req);
  const options = await applyGuardsToList(ordersResource, context);
  const orders = await ordersResource.list(options);
  res.json({ orders });
});
```

**Fastify:**
```javascript
import { createFastifyContext, applyGuardsToList } from 's3db.js/plugins/api/concerns/guards-helpers';

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

## 🔗 Examples & Documentation

- **Complete Example**: [docs/examples/e66-guards-live.js](../../examples/e66-guards-live.js)
- **Before/After Comparison**: [docs/examples/e65-guards-comparison.js](../../examples/e65-guards-comparison.js)
- **Design Document**: [docs/guards-design.md](../../guards-design.md)

---

## ⚠️ Important Notes

1. **Guards are NOT automatic with API Plugin** - You must manually apply guards in custom routes
2. **Future feature**: `addResource()` method will auto-apply guards to generated routes
3. **Never trust request body** - Always force `tenantId`/`userId` from token in guards
4. **Use 404 instead of 403** - Prevents information leakage (don't reveal resource exists)
5. **Guards run BEFORE database operations** - Failed guards never hit the database
6. **Partitions = O(1) RLS** - Use `ctx.setPartition()` for optimal performance

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
- [API Plugin](../api.md) - Main API Plugin documentation
- [Authentication](./authentication.md) - Set up JWT/OIDC authentication
- [Resource Documentation](../../resource.md) - Partitions and resource config
- [Guards Design](../../guards-design.md) - Detailed design document

**Examples:**
- [e66-guards-live.js](../../examples/e66-guards-live.js) - Complete guards example with live API
- [e65-guards-comparison.js](../../examples/e65-guards-comparison.js) - Before/after comparison
- [e49-api-plugin-complete.js](../../examples/e49-api-plugin-complete.js) - API with guards

---

> **Navigation:** [← Back to API Plugin](../api.md) | [Authentication →](./authentication.md) | [Deployment →](./deployment.md)
