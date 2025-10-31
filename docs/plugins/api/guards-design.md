# Resource Guards - Design Proposal

Declarative guard system built into resources for automatic authorization.

## 🎯 Objective

**Current problem**: Repeating middleware on every route
```javascript
// ❌ Repetitive - same logic in N routes
apiPlugin.addRoute({
  path: '/api/orders',
  middleware: [requireTenant(), requireScope('orders:read:own')],
  handler: async (req, res) => { ... }
});

apiPlugin.addRoute({
  path: '/api/orders/:id',
  middleware: [requireTenant(), requireScope('orders:read:own')],
  handler: async (req, res) => { ... }
});

// Repeated for get, list, update, delete...
```

**Proposed solution**: Declarative guard on resource
```javascript
// ✅ Declarative - define once on resource
const ordersResource = await db.createResource({
  name: 'orders',
  attributes: { ... },
  guard: {
    list: (req, user) => {
      // Automatic RLS via partition
      req.partitionName = 'byUser';
      req.partitionValues = { userId: user.id };
      return true;
    },
    update: (req, user) => req.params.userId === user.id
  }
});

// Routes automatically protected!
```

---

## 📋 API Design

### 1. Simple Guard (Role/Scope Check)

```javascript
// Only roles/scopes (string array)
guard: ['admin']                    // Only admin can do everything
guard: ['admin', 'manager']         // Admin OR manager
guard: ['orders:read:own']          // Specific scope
```

**Behavior**:
- Checks if user has any of the roles/scopes
- Applies to ALL operations (list, get, insert, update, delete, patch)
- Returns 403 if no permission

---

### 2. Guard per Operation

```javascript
guard: {
  // CRUD operations
  list: ['admin'],                              // Only admin lists
  get: true,                                     // Everyone can read
  insert: ['user'],                              // Any user creates
  update: (req, user) => req.params.userId === user.id,  // Only owner
  patch: (req, user) => req.params.userId === user.id,   // Only owner
  delete: ['admin'],                             // Only admin deletes
  replace: ['admin']                             // Only admin replace
}
```

**Accepted types**:
- `string[]` - List of roles/scopes
- `boolean` - `true` allows all, `false` blocks all
- `function` - Custom function returns `true/false` or Promise

---

### 3. Guard with Wildcard (DRY)

```javascript
guard: {
  '*': (req, user) => {
    // Applies to ALL operations
    req.tenantId = user.tenantId;
    return true;
  },
  delete: ['admin']  // Specific override for delete
}
```

**Precedence**:
1. Specific guard (delete, update, etc)
2. Wildcard guard (`*`)
3. No guard = allows everything

---

### 4. Guard with Automatic RLS (Partitions!)

```javascript
guard: {
  // List only own records via partition (O(1)!)
  list: (ctx) => {
    // Framework-agnostic! Works with Express, Hono, Fastify
    ctx.setPartition('byUser', { userId: ctx.user.id });
    return true;
  },

  // Get/Update/Delete check ownership
  get: async (ctx, resource) => {
    // resource = current record (already fetched)
    return resource.userId === ctx.user.id;
  },

  update: async (ctx, resource) => {
    return resource.userId === ctx.user.id;
  },

  delete: async (ctx, resource) => {
    // Only owner OR admin can delete
    const roles = ctx.user.roles || [];
    return resource.userId === ctx.user.id || roles.includes('admin');
  }
}
```

**Advantages**:
- ✅ Automatic RLS via partitions
- ✅ O(1) lookup instead of O(n) scan
- ✅ Guard accesses current resource (for get/update/delete)
- ✅ Can be async (e.g., fetch additional data)

---

### 5. Automatic Multi-Tenant Guard

```javascript
import { PluginError } from 's3db.js';

guard: {
  // ALL operations force tenantId
  '*': (ctx) => {
    const tenantId = ctx.user.tenantId || ctx.user.tid;

    if (!tenantId) {
      throw new PluginError('Tenant ID missing for multi-tenant guard', {
        statusCode: 401,
        retriable: false,
        suggestion: 'Authenticate with a tenant-scoped token or attach tenantId to the user context.',
        metadata: { userId: ctx.user.id }
      });
    }

    // Force tenant in ALL operations
    ctx.tenantId = tenantId;
    ctx.userId = ctx.user.id || ctx.user.sub;

    // Partition will be applied automatically
    return true;
  },

  // List forces partition by tenant
  list: (ctx) => {
    ctx.setPartition('byTenant', { tenantId: ctx.tenantId });
    return true;
  }
}
```

**Result**:
- Automatic tenant isolation
- IMPOSSIBLE to access another tenant's data
- Zero extra code in routes

---

### 6. Guard with ABAC (Attribute-Based)

```javascript
guard: {
  update: async (req, user, resource) => {
    // Business hours check
    const hour = new Date().getHours();
    if (hour < 9 || hour >= 18) {
      return false;  // Outside business hours
    }

    // Ownership check
    if (resource.userId !== user.id) {
      return false;
    }

    // Amount limit check
    if (req.body.total > 10000 && !user.roles.includes('manager')) {
      return false;  // Need manager for high values
    }

    return true;
  },

  delete: async (req, user, resource) => {
    // Can only delete if status = 'draft'
    if (resource.status !== 'draft') {
      return false;
    }

    // And be the owner OR admin
    return resource.userId === user.id || user.roles.includes('admin');
  }
}
```

---

## 🌐 Framework Adapters (Express, Hono, Fastify)

Guards are **framework-agnostic**! Just create an adapter for each framework:

### Express Adapter

```javascript
// Middleware that creates GuardContext from Express req
function createExpressContext(req) {
  return {
    user: req.user,
    params: req.params || {},
    body: req.body || {},
    query: req.query || {},
    headers: req.headers || {},

    // Helper to set partition
    setPartition(name, values) {
      this.partitionName = name;
      this.partitionValues = values;
    },

    // Framework raw (for advanced cases)
    raw: { req }
  };
}

// Usage
const context = createExpressContext(req);
const allowed = await resource.executeGuard('list', context);
```

### Hono Adapter

```javascript
// Middleware that creates GuardContext from Hono Context
function createHonoContext(c) {
  return {
    user: c.get('user'),  // User from middleware
    params: c.req.param(),
    body: await c.req.json(),
    query: c.req.query(),
    headers: Object.fromEntries(c.req.raw.headers.entries()),

    // Helper to set partition
    setPartition(name, values) {
      this.partitionName = name;
      this.partitionValues = values;
    },

    // Framework raw
    raw: { c }
  };
}

// Usage
const context = await createHonoContext(c);
const allowed = await resource.executeGuard('list', context);
```

### Fastify Adapter

```javascript
// Middleware that creates GuardContext from Fastify request
function createFastifyContext(request) {
  return {
    user: request.user,
    params: request.params || {},
    body: request.body || {},
    query: request.query || {},
    headers: request.headers || {},

    // Helper to set partition
    setPartition(name, values) {
      this.partitionName = name;
      this.partitionValues = values;
    },

    // Framework raw
    raw: { request }
  };
}

// Usage
const context = createFastifyContext(request);
const allowed = await resource.executeGuard('list', context);
```

---

## 🔧 Integration with API Plugin

### Option A: Guard on Resource (Recommended)

```javascript
// 1. Define guard on resource
const ordersResource = await db.createResource({
  name: 'orders',
  attributes: {
    userId: 'string|required',
    tenantId: 'string|required',
    total: 'number'
  },
  partitions: {
    byUser: { fields: { userId: 'string' } },
    byTenant: { fields: { tenantId: 'string' } }
  },
  guard: {
    list: (req, user) => {
      req.partitionName = 'byUser';
      req.partitionValues = { userId: user.id };
      return true;
    },
    update: (req, user, resource) => resource.userId === user.id,
    delete: ['admin']
  }
});

// 2. API Plugin uses guards automatically
await db.use(apiPlugin);

// Routes AUTO-GENERATED and AUTO-PROTECTED!
// GET  /api/orders         → list guard applied
// GET  /api/orders/:id     → get guard applied
// POST /api/orders         → insert guard applied
// PATCH /api/orders/:id    → update guard applied
// DELETE /api/orders/:id   → delete guard applied
```

**Advantage**: Zero extra configuration, guards applied automatically!

---

### Option B: Guard Override per Route

```javascript
// Default guard on resource
const ordersResource = await db.createResource({
  name: 'orders',
  guard: {
    '*': (req, user) => req.tenantId = user.tenantId && true,
    delete: ['admin']
  }
});

// Override guard on specific route
apiPlugin.addRoute({
  path: '/api/orders/:id',
  method: 'DELETE',
  guard: (req, user) => {
    // Custom guard only for this route
    return user.roles.includes('super-admin');
  },
  handler: async (req, res) => { ... }
});
```

**Advantage**: Flexibility for special cases

---

## 🚀 Guard Function Signature (Framework-Agnostic!)

```typescript
// Guard context - works with Express, Hono, Fastify, etc!
type GuardContext = {
  user: JWTPayload;                    // Decoded token
  params: Record<string, string>;      // Route params (:id, etc)
  body: any;                           // Request body
  query: Record<string, string>;       // Query string
  headers: Record<string, string>;     // Request headers

  // Helpers
  setPartition(name: string, values: object): void;  // Set partition for query
  tenantId?: string;                   // Populated by guard
  userId?: string;                     // Populated by guard

  // Framework-specific (optional, for advanced use)
  raw?: {
    req?: any;     // Express req
    c?: any;       // Hono context
    request?: any; // Fastify request
  };
};

type GuardFunction = (
  context: GuardContext,  // Framework-agnostic context
  resource?: Resource     // Current resource (for get/update/delete)
) => boolean | Promise<boolean>;

type GuardConfig = {
  // Per operation
  list?: GuardFunction | string[] | boolean;
  get?: GuardFunction | string[] | boolean;
  insert?: GuardFunction | string[] | boolean;
  update?: GuardFunction | string[] | boolean;
  patch?: GuardFunction | string[] | boolean;
  delete?: GuardFunction | string[] | boolean;
  replace?: GuardFunction | string[] | boolean;

  // Wildcard
  '*'?: GuardFunction | string[] | boolean;
};

// Resource options
interface ResourceOptions {
  name: string;
  attributes: object;
  partitions?: object;
  guard?: GuardConfig | string[];  // Simple or complete
}
```

---

## 📦 Implementation in Resource

### resource.class.js

```javascript
class Resource {
  constructor(options) {
    this.name = options.name;
    this.attributes = options.attributes;
    this.guard = this._normalizeGuard(options.guard);
  }

  /**
   * Normalize guard config
   */
  _normalizeGuard(guard) {
    if (!guard) return null;

    // Simple string array → apply to everything
    if (Array.isArray(guard)) {
      return { '*': guard };
    }

    return guard;
  }

  /**
   * Execute guard for operation
   */
  async executeGuard(operation, req, user, resource = null) {
    if (!this.guard) return true;  // No guard = allow

    // 1. Try specific guard
    let guardFn = this.guard[operation];

    // 2. Fallback to wildcard
    if (!guardFn) {
      guardFn = this.guard['*'];
    }

    // 3. No guard = allow
    if (!guardFn) return true;

    // 4. Simple boolean
    if (typeof guardFn === 'boolean') {
      return guardFn;
    }

    // 5. Array of roles/scopes
    if (Array.isArray(guardFn)) {
      return this._checkRolesScopes(guardFn, user);
    }

    // 6. Custom function
    if (typeof guardFn === 'function') {
      const result = await guardFn(req, user, resource);
      return result === true;  // Force boolean
    }

    return false;  // Default: block
  }

  /**
   * Check roles/scopes
   */
  _checkRolesScopes(requiredRolesScopes, user) {
    // User scopes
    const userScopes = user.scope?.split(' ') || [];

    // User roles (Keycloak client + realm + Azure AD)
    const clientId = user.azp || process.env.CLIENT_ID;
    const clientRoles = user.resource_access?.[clientId]?.roles || [];
    const realmRoles = user.realm_access?.roles || [];
    const azureRoles = user.roles || [];
    const userRoles = [...clientRoles, ...realmRoles, ...azureRoles];

    // Check if user has any of required
    return requiredRolesScopes.some(required => {
      return userScopes.includes(required) || userRoles.includes(required);
    });
  }

  /**
   * Wrapper for list with guard
   */
  async list(options = {}, context = {}) {
    // Execute guard
    if (context.req && context.user) {
      const allowed = await this.executeGuard('list', context.req, context.user);

      if (!allowed) {
        throw new Error('Forbidden: Guard denied access');
      }

      // Guard may have modified req (partition, etc)
      if (context.req.partitionName) {
        return this.listPartition(
          context.req.partitionName,
          context.req.partitionValues || {},
          options
        );
      }
    }

    // Original list
    return this._originalList(options);
  }

  /**
   * Wrapper for get with guard
   */
  async get(id, options = {}, context = {}) {
    // Fetch resource first
    const resource = await this._originalGet(id, options);

    if (!resource) {
      return null;
    }

    // Execute guard (with access to resource)
    if (context.req && context.user) {
      const allowed = await this.executeGuard('get', context.req, context.user, resource);

      if (!allowed) {
        // Return null instead of error (404 instead of 403)
        return null;
      }
    }

    return resource;
  }

  /**
   * Wrapper for update with guard
   */
  async update(id, data, options = {}, context = {}) {
    // Fetch current resource
    const resource = await this._originalGet(id, options);

    if (!resource) {
      throw new Error('Resource not found');
    }

    // Execute guard
    if (context.req && context.user) {
      const allowed = await this.executeGuard('update', context.req, context.user, resource);

      if (!allowed) {
        throw new Error('Forbidden: Guard denied access');
      }
    }

    // Original update
    return this._originalUpdate(id, data, options);
  }

  // Similar for insert, patch, delete, replace...
}
```

---

## 🔌 Integration with API Plugin

### api.plugin.js

```javascript
class ApiPlugin {
  /**
   * Auto-generate routes for resource with guards
   */
  async addResource(resource, options = {}) {
    const basePath = options.basePath || `/api/${resource.name}`;

    // GET /api/orders (list)
    this.addRoute({
      path: basePath,
      method: 'GET',
      handler: async (req, res) => {
        try {
          const records = await resource.list({}, {
            req,
            user: req.user
          });

          res.json({ data: records });
        } catch (err) {
          if (err.message.includes('Forbidden')) {
            return res.status(403).json({ error: err.message });
          }
          throw err;
        }
      },
      auth: options.auth || 'oauth2'
    });

    // GET /api/orders/:id (get)
    this.addRoute({
      path: `${basePath}/:id`,
      method: 'GET',
      handler: async (req, res) => {
        const record = await resource.get(req.params.id, {}, {
          req,
          user: req.user
        });

        if (!record) {
          return res.status(404).json({ error: 'Not found' });
        }

        res.json(record);
      },
      auth: options.auth || 'oauth2'
    });

    // POST /api/orders (insert)
    this.addRoute({
      path: basePath,
      method: 'POST',
      handler: async (req, res) => {
        try {
          const record = await resource.insert(req.body, {}, {
            req,
            user: req.user
          });

          res.status(201).json(record);
        } catch (err) {
          if (err.message.includes('Forbidden')) {
            return res.status(403).json({ error: err.message });
          }
          throw err;
        }
      },
      auth: options.auth || 'oauth2'
    });

    // PATCH /api/orders/:id (update)
    this.addRoute({
      path: `${basePath}/:id`,
      method: 'PATCH',
      handler: async (req, res) => {
        try {
          const record = await resource.update(req.params.id, req.body, {}, {
            req,
            user: req.user
          });

          res.json(record);
        } catch (err) {
          if (err.message.includes('Forbidden')) {
            return res.status(403).json({ error: err.message });
          }
          if (err.message.includes('not found')) {
            return res.status(404).json({ error: 'Not found' });
          }
          throw err;
        }
      },
      auth: options.auth || 'oauth2'
    });

    // DELETE /api/orders/:id (delete)
    this.addRoute({
      path: `${basePath}/:id`,
      method: 'DELETE',
      handler: async (req, res) => {
        try {
          await resource.delete(req.params.id, {}, {
            req,
            user: req.user
          });

          res.status(204).send();
        } catch (err) {
          if (err.message.includes('Forbidden')) {
            return res.status(403).json({ error: err.message });
          }
          if (err.message.includes('not found')) {
            return res.status(404).json({ error: 'Not found' });
          }
          throw err;
        }
      },
      auth: options.auth || 'oauth2'
    });
  }
}
```

---

## 🎯 Practical Examples

### Example 1: Multi-Tenant SaaS

```javascript
const ordersResource = await db.createResource({
  name: 'orders',
  attributes: {
    tenantId: 'string|required',
    userId: 'string|required',
    total: 'number'
  },
  partitions: {
    byTenant: { fields: { tenantId: 'string' } },
    byTenantUser: { fields: { tenantId: 'string', userId: 'string' } }
  },
  guard: {
    // ALL operations force tenant isolation
    '*': (req, user) => {
      const tenantId = user.tenantId || user.tid;
      if (!tenantId) throw new Error('Tenant ID missing');

      req.tenantId = tenantId;
      req.partitionValues = { tenantId };
      return true;
    },

    // List uses double partition (tenant + user)
    list: (req, user) => {
      req.partitionName = 'byTenantUser';
      req.partitionValues = {
        tenantId: user.tenantId,
        userId: user.id
      };
      return true;
    },

    // Insert forces tenantId and userId from token
    insert: (req, user) => {
      req.body.tenantId = user.tenantId;
      req.body.userId = user.id;
      return true;
    },

    // Update/Delete check ownership
    update: (req, user, resource) => {
      return resource.userId === user.id && resource.tenantId === user.tenantId;
    },

    delete: (req, user, resource) => {
      return resource.userId === user.id || user.roles.includes('admin');
    }
  }
});

// Auto-generate protected routes!
apiPlugin.addResource(ordersResource);

// ✅ Done! Multi-tenancy + automatic RLS in 30 lines!
```

---

### Example 2: Admin Override

```javascript
const usersResource = await db.createResource({
  name: 'users',
  attributes: { email: 'string', role: 'string' },
  guard: {
    // Normal users only see own profile
    get: (req, user, resource) => resource.id === user.id,

    // Only admin can list all
    list: ['admin'],

    // Nobody can create (except public signup)
    insert: false,

    // Can only edit own profile
    update: (req, user, resource) => resource.id === user.id,

    // Only admin deletes
    delete: ['admin']
  }
});
```

---

### Example 3: ABAC with Business Rules

```javascript
const expensesResource = await db.createResource({
  name: 'expenses',
  attributes: {
    userId: 'string',
    amount: 'number',
    status: 'string'
  },
  guard: {
    list: (req, user) => {
      req.partitionName = 'byUser';
      req.partitionValues = { userId: user.id };
      return true;
    },

    update: async (req, user, resource) => {
      // 1. Ownership
      if (resource.userId !== user.id) return false;

      // 2. Status check
      if (resource.status !== 'draft') {
        return false;  // Can only edit draft
      }

      // 3. Amount limit
      const newAmount = req.body.amount || resource.amount;
      if (newAmount > 1000 && !user.roles.includes('manager')) {
        return false;  // Manager approves high values
      }

      // 4. Business hours
      const hour = new Date().getHours();
      if (hour < 9 || hour >= 18) {
        return false;
      }

      return true;
    }
  }
});
```

---

## ✅ Advantages

1. **Declarative** - Guard defined once on resource
2. **DRY** - Don't repeat middleware on N routes
3. **Automatic** - API Plugin applies guards automatically
4. **Integrated with Partitions** - Automatic RLS O(1)
5. **Flexible** - Simple (string[]) or complex (function)
6. **Type-safe** - TypeScript can type guards
7. **Testable** - Guard is pure function (easy to test)

---

## ⚠️ Trade-offs

### Advantages over Manual Middleware
- ✅ Less repeated code
- ✅ Guard lives with schema (better DX)
- ✅ Self-documented
- ✅ Harder to forget protection

### Disadvantages
- ❌ Less explicit than middleware per route
- ❌ Guard function can become complex
- ❌ Debugging can be more difficult

### When to use Guards vs Middleware

**Use Guards when**:
- Authorization is consistent (e.g., multi-tenant, RLS)
- Want to auto-generate CRUD routes
- Need maximum DRY

**Use Middleware when**:
- Very specific logic per route
- Need fine-grained control
- Debugging is critical

**Use Both!**:
```javascript
// Default guard on resource
guard: { list: (req, user) => { ... } }

// Override per route when necessary
apiPlugin.addRoute({
  path: '/special',
  middleware: [customMiddleware],  // Override guard
  ...
})
```

---

## 🚀 Next Steps

1. **Implement `executeGuard()` in Resource**
2. **Add context parameter** in list/get/update/etc
3. **Update API Plugin** to use guards
4. **Create tests** for guards
5. **Document** guard patterns
6. **Complete example** (e65-guards-complete.js)

---

## 📝 Implementation Notes

### Backward Compatibility

```javascript
// Without guard - works as before
const resource = await db.createResource({
  name: 'products',
  attributes: { ... }
});

// With guard - new functionality
const resource = await db.createResource({
  name: 'orders',
  attributes: { ... },
  guard: { ... }  // Opt-in!
});
```

### Performance

- Guards execute BEFORE fetching data (list/insert)
- Guards execute AFTER fetching data (get/update/delete) - to access resource
- Using partitions in guards = O(1) performance!

### Error Handling

```javascript
// Guard returns false → 403 Forbidden
guard: (req, user) => false;

// Guard throws error → 500 Internal Server Error
guard: (req, user) => { throw new Error('Custom error'); };

// Guard returns null/undefined → Blocks (403)
guard: (req, user) => {};  // Implicitly false
```

---

**🎉 Guards = Declarative Authorization + Automatic RLS via Partitions!**
