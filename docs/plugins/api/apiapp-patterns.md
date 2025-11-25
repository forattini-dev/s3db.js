# ApiApp Usage Patterns

Complete guide for using the **ApiApp wrapper** in s3db.js API Plugin.

## Overview

ApiApp wraps Hono with enhanced capabilities:
- ✅ **Route metadata tracking** - Automatic OpenAPI generation
- ✅ **Guard system** - Declarative authorization
- ✅ **Middleware priority** - Guaranteed execution order
- ✅ **Context injection** - `c.db`, `c.resources`, `c.success()`, `c.error()`
- ✅ **Validation** - Fastest-validator with boot-time compilation
- ✅ **Route grouping** - Prefix management
- ✅ **Full Hono compatibility** - Zero breaking changes

---

## Pattern 1: Basic Route with Metadata

### Before (Vanilla Hono)
```javascript
app.get('/users', async (c) => {
  const users = await db.resources.users.list();
  return c.json({ success: true, data: users });
});
```

### After (ApiApp with Metadata)
```javascript
app.describe({
  description: 'List all users',
  tags: ['users'],
  operationId: 'list_users',
  responseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'array', items: { type: 'object' } }
    }
  }
}).get('/users', async (c) => {
  const users = await c.resources.users.list();
  return c.success({ data: users });
});
```

**Benefits:**
- OpenAPI spec generated automatically
- `c.resources.users` validated at runtime (throws if not found)
- `c.success()` formats response consistently

---

## Pattern 2: Route with Validation

Validates request body **at boot time** (compiled once), executed per-request.

```javascript
app.describe({
  description: 'Create new user',
  tags: ['users'],
  schema: {
    name: 'string|required|min:3',
    email: 'email|required',
    age: 'number|optional|min:18'
  },
  responseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'object' }
    }
  }
}).post('/users', async (c) => {
  const data = await c.req.json(); // Already validated!
  const user = await c.resources.users.insert(data);
  return c.success({ data: user }, 201);
});
```

**What happens:**
1. **Boot**: Validator compiled once → `meta._compiledValidator`
2. **Request**: Body validated automatically
3. **On error**: Returns `422` with detailed validation errors
4. **On success**: Handler receives clean, validated data

**Validation error response:**
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "status": 422,
    "details": [
      { "field": "email", "message": "must be a valid email" }
    ]
  }
}
```

---

## Pattern 3: Guards for Authorization

Guards execute **before** the handler and can:
- Return `true` (allow)
- Return `false` (deny with 403)
- Return filter object (for list operations)

### Simple Guard
```javascript
// Register guards (once, during initialization)
app.registerGuard('auth', async (c, ctx) => {
  if (!ctx.user) throw new Error('Unauthorized');
  return true;
});

app.registerGuard('admin', async (c, ctx) => {
  if (ctx.user.role !== 'admin') return false;
  return true;
});

// Use guards in routes
app.describe({
  description: 'Delete user (admin only)',
  tags: ['users'],
  guards: ['auth', 'admin']
}).delete('/users/:id', async (c) => {
  const id = c.req.param('id');
  await c.resources.users.delete(id);
  return c.success({ message: 'User deleted' });
});
```

### Guard with Priority
Guards execute in **ascending priority order** (lower first):

```javascript
app.describe({
  guards: [
    { name: 'auth', priority: 10 },      // Executes first
    { name: 'admin', priority: 50 },     // Then this
    { name: 'rate-limit', priority: 100 } // Last
  ]
}).get('/admin/stats', handler);
```

### Guard with Filter (List Operations)
Useful for tenant isolation:

```javascript
app.registerGuard('tenant-filter', async (c, ctx) => {
  if (ctx.user.role === 'admin') return true; // No filter

  // Non-admins see only their tenant's data
  c.set('guardFilter', { tenantId: ctx.user.tenantId });
  return true;
});

app.describe({
  guards: ['auth', 'tenant-filter']
}).get('/orders', async (c) => {
  const filter = c.get('guardFilter') || {};
  const orders = await c.resources.orders.query(filter);
  return c.success({ data: orders });
});
```

**Guard error response:**
```json
{
  "success": false,
  "error": {
    "message": "Forbidden by guard: admin",
    "code": "FORBIDDEN",
    "status": 403
  }
}
```

---

## Pattern 4: Middleware Priority

Higher priority = executes first (descending order: 100 → 90 → 10 → 0).

```javascript
// Initialization
app.useMiddleware(corsMiddleware, { priority: 100 });     // First
app.useMiddleware(securityMiddleware, { priority: 95 });  // Second
app.useMiddleware(authMiddleware, { priority: 90 });      // Third
app.useMiddleware(loggingMiddleware, { priority: 10 });   // Last
app.useMiddleware(customMiddleware);                      // Default priority = 0
```

**Execution order:**
```
Request
  ↓
CORS (100)
  ↓
Security (95)
  ↓
Auth (90)
  ↓
Logging (10)
  ↓
Custom (0)
  ↓
Guard Middleware (auto-injected)
  ↓
Handler
```

---

## Pattern 5: Route Grouping

Group routes with common prefix:

```javascript
app.group('/api/v1', (v1) => {
  v1.get('/users', listUsersHandler);        // → /api/v1/users
  v1.post('/users', createUserHandler);      // → /api/v1/users

  v1.group('/admin', (admin) => {
    admin.get('/stats', statsHandler);       // → /api/v1/admin/stats
    admin.delete('/users/:id', deleteHandler); // → /api/v1/admin/users/:id
  });
});
```

**Chainable API:**
```javascript
app
  .group('/api', (api) => { api.get('/health', healthHandler) })
  .group('/docs', (docs) => { docs.get('/', docsHandler) });
```

---

## Pattern 6: Context Helpers

ApiApp injects context helpers into every request:

### Database Access
```javascript
app.get('/users', async (c) => {
  // All equivalent:
  const db1 = c.db;
  const db2 = c.database;
  const db3 = c.get('db');

  // Use any:
  const users = await c.db.resources.users.list();
});
```

### Resource Access with Validation
```javascript
app.get('/posts', async (c) => {
  // Throws error if resource doesn't exist
  const posts = await c.resources.posts.list();

  // Error: Resource "nonexistent" not found in database
  const invalid = await c.resources.nonexistent.list(); // ❌ Throws!
});
```

### Response Formatting
```javascript
app.post('/users', async (c) => {
  try {
    const user = await c.resources.users.insert(await c.req.json());

    // Success response (201)
    return c.success({ data: user }, 201);
    // Returns: { success: true, data: {...} }

  } catch (err) {
    // Error response (400)
    return c.error(err.message, 400, 'CREATE_FAILED', { userId: 'new' });
    // Returns: { success: false, error: { message, code, status, details } }
  }
});
```

---

## Pattern 7: OpenAPI Generation

### Automatic from Routes
```javascript
const spec = app.generateOpenAPI({
  title: 'My API',
  version: '1.0.0',
  description: 'Auto-generated from route metadata'
});

// Returns valid OpenAPI 3.1 spec:
// {
//   "openapi": "3.1.0",
//   "info": { "title": "My API", "version": "1.0.0" },
//   "paths": {
//     "/users": {
//       "get": {
//         "description": "List all users",
//         "tags": ["users"],
//         "operationId": "list_users",
//         "responses": { ... }
//       }
//     }
//   }
// }
```

### Route Introspection
```javascript
const routes = app.getRoutes();
// [
//   {
//     method: 'GET',
//     path: '/users',
//     handlers: [Function, Function],
//     description: 'List all users',
//     tags: ['users'],
//     guards: ['auth'],
//     requestSchema: {...},
//     responseSchema: {...},
//     protected: ['password']
//   }
// ]
```

---

## Pattern 8: Resource Routes with Metadata

Example of adding metadata to existing resource routes:

### Before
```javascript
app.get('/', asyncHandler(async (c) => {
  const users = await resource.list({ limit: 100 });
  return c.json({ success: true, data: users });
}));
```

### After
```javascript
const listHandler = asyncHandler(async (c) => {
  const users = await resource.list({ limit: 100 });
  return c.json({ success: true, data: users });
});

app.describe({
  description: `List ${resourceName} records with pagination`,
  tags: [resourceName],
  operationId: `list_${resourceName}`,
  responseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'array', items: { type: 'object' } },
      pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          limit: { type: 'integer' },
          offset: { type: 'integer' }
        }
      }
    }
  }
}).get('/', listHandler);
```

**Apply to all 5 CRUD routes:**
- `GET /` - List (with pagination)
- `GET /:id` - Get one
- `POST /` - Create
- `PUT /:id` - Update (full)
- `PATCH /:id` - Update (partial)
- `DELETE /:id` - Delete

---

## Pattern 9: Custom Routes with Guards

Example of a custom admin endpoint:

```javascript
// Register admin guard
app.registerGuard('admin', async (c, ctx) => {
  const user = c.get('user');
  if (!user) return false;
  if (user.role !== 'admin') return false;
  return true;
});

// Custom admin route with guard
app.describe({
  description: 'Get system statistics (admin only)',
  tags: ['admin'],
  operationId: 'get_system_stats',
  guards: ['auth', 'admin'],
  responseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: {
        type: 'object',
        properties: {
          totalUsers: { type: 'integer' },
          totalPosts: { type: 'integer' },
          uptime: { type: 'number' }
        }
      }
    }
  }
}).get('/admin/stats', async (c) => {
  const totalUsers = await c.resources.users.count();
  const totalPosts = await c.resources.posts.count();
  const uptime = process.uptime();

  return c.success({
    data: { totalUsers, totalPosts, uptime }
  });
});
```

---

## Pattern 10: FV Validation with OpenAPI

ApiApp automatically converts Fastest-Validator schemas to OpenAPI format:

```javascript
app.describe({
  schema: {
    // FV shorthand
    name: 'string|required|min:3|max:50',
    email: 'email|required',
    age: 'number|optional|min:18',

    // FV object syntax
    address: {
      type: 'object',
      props: {
        street: { type: 'string', optional: true },
        city: { type: 'string' },
        zip: { type: 'string', pattern: '^[0-9]{5}$' }
      }
    },

    // FV array syntax
    tags: {
      type: 'array',
      items: { type: 'string' },
      optional: true
    }
  }
}).post('/users', handler);
```

**Auto-converts to OpenAPI:**
```json
{
  "requestBody": {
    "required": true,
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "required": ["name", "email"],
          "properties": {
            "name": { "type": "string", "minLength": 3, "maxLength": 50 },
            "email": { "type": "string", "format": "email" },
            "age": { "type": "number", "minimum": 18 },
            "address": {
              "type": "object",
              "properties": {
                "street": { "type": "string" },
                "city": { "type": "string" },
                "zip": { "type": "string", "pattern": "^[0-9]{5}$" }
              }
            },
            "tags": { "type": "array", "items": { "type": "string" } }
          }
        }
      }
    }
  }
}
```

---

## Complete Example

Real-world example combining all patterns:

```javascript
import { ApiApp } from './plugins/api/app.class.js';

// Initialize with database
const app = new ApiApp({
  db: database,
  resources: database.resources
});

// Register guards
app.registerGuard('auth', async (c, ctx) => {
  const token = c.req.header('Authorization');
  if (!token) return false;
  // Validate token and set user
  c.set('user', { id: 'user123', role: 'user' });
  return true;
});

app.registerGuard('admin', async (c, ctx) => {
  const user = c.get('user');
  return user?.role === 'admin';
});

// Register middlewares with priority
app.useMiddleware(corsMiddleware, { priority: 100 });
app.useMiddleware(authMiddleware, { priority: 90 });
app.useMiddleware(loggingMiddleware, { priority: 10 });

// Group routes
app.group('/api/v1', (v1) => {

  // Public endpoint (no guards)
  v1.describe({
    description: 'Health check',
    tags: ['system'],
    responseSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        uptime: { type: 'number' }
      }
    }
  }).get('/health', async (c) => {
    return c.json({ status: 'ok', uptime: process.uptime() });
  });

  // User endpoints (auth required)
  v1.describe({
    description: 'List users',
    tags: ['users'],
    guards: ['auth'],
    responseSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: { type: 'array' }
      }
    }
  }).get('/users', async (c) => {
    const users = await c.resources.users.list();
    return c.success({ data: users });
  });

  v1.describe({
    description: 'Create user',
    tags: ['users'],
    guards: ['auth'],
    schema: {
      name: 'string|required|min:3',
      email: 'email|required',
      password: 'string|required|min:8'
    }
  }).post('/users', async (c) => {
    const data = await c.req.json();
    const user = await c.resources.users.insert(data);
    return c.success({ data: user }, 201);
  });

  // Admin endpoints (admin only)
  v1.group('/admin', (admin) => {
    admin.describe({
      description: 'Delete user (admin only)',
      tags: ['admin', 'users'],
      guards: ['auth', 'admin']
    }).delete('/users/:id', async (c) => {
      const id = c.req.param('id');
      await c.resources.users.delete(id);
      return c.success({ message: 'User deleted' });
    });

    admin.describe({
      description: 'System statistics (admin only)',
      tags: ['admin'],
      guards: ['auth', 'admin']
    }).get('/stats', async (c) => {
      const totalUsers = await c.resources.users.count();
      return c.success({ data: { totalUsers } });
    });
  });
});

// Generate OpenAPI spec
const openAPISpec = app.generateOpenAPI({
  title: 'My API',
  version: '1.0.0',
  description: 'Complete API with authentication and authorization'
});

console.log('Routes registered:', app.getRoutes().length);
console.log('OpenAPI spec:', JSON.stringify(openAPISpec, null, 2));
```

---

## Performance Notes

1. **Validation compilation**: Happens once at boot, not per-request
2. **Middleware priority sorting**: Happens once when middleware added
3. **Guard execution**: Per-request, runs before handler
4. **Context injection**: Per-request, minimal overhead (~0.01ms)
5. **OpenAPI generation**: Can be cached, regenerate only on schema changes

---

## Migration Checklist

To migrate existing Hono routes to ApiApp:

- [ ] Replace `new Hono()` with `new ApiApp({ db, resources })`
- [ ] Add `.describe({...})` before route registrations
- [ ] Use `c.db` / `c.resources` instead of importing database
- [ ] Use `c.success()` / `c.error()` for consistent responses
- [ ] Register guards with `app.registerGuard()`
- [ ] Add guards to routes via `guards: ['auth']` in describe()
- [ ] Use `app.useMiddleware()` with priority for middleware ordering
- [ ] Group routes with `app.group()` for better organization
- [ ] Generate OpenAPI with `app.generateOpenAPI()`
- [ ] Test route introspection with `app.getRoutes()`

---

## Troubleshooting

### Issue: "Resource 'X' not found in database"
**Cause**: Accessing `c.resources.X` when resource doesn't exist
**Fix**: Ensure resource exists in database or use try/catch

### Issue: Validation always failing
**Cause**: Schema mismatch or incorrect FV syntax
**Fix**: Check validator errors in response, verify schema syntax

### Issue: Guards not executing
**Cause**: Guards not registered or wrong guard name
**Fix**: Verify `app.registerGuard()` called before route registration

### Issue: Middleware executing in wrong order
**Cause**: Priority values incorrect
**Fix**: Higher priority = earlier execution (100 before 90 before 10)

### Issue: OpenAPI spec missing route info
**Cause**: Missing `.describe()` on route
**Fix**: Add `.describe({...})` before route registration

---

## Related Files

- **Core**: `src/plugins/api/app.class.js` (358 lines)
- **Tests**: `tests/plugins/api/app.class.test.js` (33 tests, all passing)
- **Integration**: `src/plugins/api/server.js:158` (ApiApp instantiation)
- **Resource Routes**: `src/plugins/api/routes/resource-routes.js` (example implementation)
- **OpenSpec**: `openspec/changes/api-app-wrapper/` (full proposal, design, specs, tasks)

---

**Need help?** Check the [OpenSpec proposal](../../../openspec/changes/api-app-wrapper/proposal.md) for architectural details and design decisions.
