# ApiApp - Best Developer Experience Guide

## 🎯 Design Philosophy

**Goals**:
1. ✅ **Zero Implicit State** - No magic, everything explicit
2. ✅ **Single Context** - One `ctx` object, clean API
3. ✅ **Zero Runtime Work** - Compile everything at registration
4. ✅ **Deterministic Execution** - Priority-based, predictable
5. ✅ **Composition > Inheritance** - Groups, helpers, mixins
6. ✅ **Convention > Configuration** - Smart defaults, override when needed

---

## 🚀 Quick Start

```javascript
import { ApiApp } from 's3db.js';

const app = new ApiApp({ db });

// 1. Register guards
app.guard('isAuthenticated', guardFn, { priority: 10 });

// 2. Create CRUD in one line
app.crud('users', { list, get, create, update, delete }, {
  tags: ['Users'],
  guards: ['isAuthenticated'],
  schemas: { create: {...}, update: {...} }
});

// 3. Add docs
app.mountDocs({ title: 'My API', version: '1.0.0' });

// Done! 🎉
```

---

## 📚 API Reference

### Core Methods

#### `app.route(method, path, options, handler)`

Explicit route registration with all options upfront.

```javascript
app.route('POST', '/users', {
  description: 'Create user',
  summary: 'Create a new user',
  tags: ['Users'],
  operationId: 'createUser',
  guards: ['isAuthenticated'],
  priority: 100,
  schema: {
    email: 'string|required|email',
    name: 'string|required|min:2|max:100'
  },
  requestSchema: { /* OpenAPI schema */ },
  responseSchema: { /* OpenAPI schema */ },
  protected: ['password', 'metadata.internal']
}, async (ctx) => {
  const body = await ctx.body();
  const user = await ctx.db.resources.users.insert(body);
  return ctx.success({ data: user }, 201);
});
```

**Options**:
- `description` (string) - Route description for docs
- `summary` (string) - Short summary
- `tags` (string[]) - OpenAPI tags
- `operationId` (string) - Unique operation ID
- `guards` (string[]) - Guards to apply (by name)
- `priority` (number) - Execution priority (lower = higher)
- `schema` (object) - FV validation schema (auto-compiled)
- `requestSchema` (object) - OpenAPI request schema
- `responseSchema` (object) - OpenAPI response schema
- `protected` (string[]) - Fields to filter from responses

---

### Convenience Methods

#### `app.get/post/put/patch/delete(path, options, handler)`

Shortcuts that delegate to `app.route()`.

```javascript
// With options
app.post('/users', { description: 'Create user', schema: {...} }, handler);

// Without options (function signature detected)
app.get('/users', async (ctx) => ctx.success({ data: [] }));
```

---

### Guards & Middleware

#### `app.guard(name, guardFn, { priority })`

Register named guard with priority.

```javascript
app.guard('isAdmin', async (ctx, { db, resources }) => {
  const user = ctx.get('user');
  return user?.role === 'admin';
}, { priority: 10 });

// Use in routes
app.get('/admin/stats', { guards: ['isAdmin'] }, handler);
```

**Guard Return Values**:
- `true` - Allow
- `false` - Deny (403)
- `throw Error` - Deny with message
- `{ field: value }` - Apply filter (for list operations)

#### `app.use(middleware, { priority, name })`

Register global middleware.

```javascript
app.use(async (c, next) => {
  console.log(`Request: ${c.req.method} ${c.req.path}`);
  await next();
}, { priority: 50, name: 'logger' });
```

**Priority Order**: Lower number = higher priority
- Guards: 10, 20, 30, ...
- Middlewares: 50, 100, ...
- Handler: Always last

---

### Route Groups

#### `app.group(basePath, options)` - Object Style

```javascript
const admin = app.group('/admin', {
  tags: ['Admin'],
  guards: ['isAuthenticated', 'isAdmin'],
  priority: 100
});

// Routes inherit tags and guards
admin.get('/stats', {}, async (ctx) => {
  return ctx.success({ data: { users: 100 } });
});

// Can add additional guards
admin.post('/users/:id/ban', {
  guards: ['isOwner'],  // Will run BOTH isAdmin AND isOwner
  schema: { reason: 'string|required' }
}, handler);
```

#### `app.groupWithCallback(basePath, options, callback)` - Callback Style

```javascript
// With options
app.groupWithCallback('/api/v2', { tags: ['V2'] }, (v2) => {
  v2.get('/users', {}, handler);
  v2.post('/posts', { schema: {...} }, handler);
});

// Without options
app.groupWithCallback('/public', (public) => {
  public.get('/status', {}, handler);
});
```

---

### CRUD Helper

#### `app.crud(resourceName, handlers, options)`

Create complete CRUD routes in one call.

```javascript
app.crud('users', {
  list: async (ctx) => {
    const users = await ctx.db.resources.users.list();
    return ctx.success({ data: users });
  },
  get: async (ctx) => {
    const user = await ctx.db.resources.users.get(ctx.param('id'));
    return ctx.success({ data: user });
  },
  create: async (ctx) => {
    const user = await ctx.db.resources.users.insert(await ctx.body());
    return ctx.success({ data: user }, 201);
  },
  update: async (ctx) => {
    const user = await ctx.db.resources.users.update(ctx.param('id'), await ctx.body());
    return ctx.success({ data: user });
  },
  patch: async (ctx) => {
    const user = await ctx.db.resources.users.patch(ctx.param('id'), await ctx.body());
    return ctx.success({ data: user });
  },
  delete: async (ctx) => {
    await ctx.db.resources.users.delete(ctx.param('id'));
    return ctx.success({ message: 'User deleted' });
  }
}, {
  tags: ['Users'],
  guards: ['isAuthenticated'],
  basePath: '/users',  // Optional, defaults to /{resourceName}
  schemas: {
    list: { limit: 'number|min:1|max:100' },
    create: { email: 'string|required|email', name: 'string|required' },
    update: { email: 'string|email', name: 'string' },
    patch: { name: 'string' }
  }
});
```

**Generated Routes**:
- `GET /users` - List (with list schema)
- `GET /users/:id` - Get (with get schema)
- `POST /users` - Create (with create schema)
- `PUT /users/:id` - Update (with update schema)
- `PATCH /users/:id` - Patch (with patch schema or fallback to update)
- `DELETE /users/:id` - Delete (no schema)

---

### Documentation

#### `app.mountDocs(options)`

Add `/docs` and `/openapi.json` endpoints.

```javascript
app.mountDocs({
  title: 'My Awesome API',
  version: '1.0.0',
  description: 'Complete API documentation',
  jsonPath: '/openapi.json',  // Optional
  htmlPath: '/docs'            // Optional
});
```

**Automatic Responses**:
- `200` - Success (with response schema if provided)
- `422` - Validation Error (if schema exists)
- `500` - Internal Server Error

#### `app.generateOpenAPI(info)`

Generate OpenAPI spec programmatically.

```javascript
const spec = app.generateOpenAPI({
  title: 'My API',
  version: '1.0.0',
  description: 'API docs'
});

console.log(JSON.stringify(spec, null, 2));
```

---

### Health Check

#### `app.health(path, options)`

Add health check endpoint.

```javascript
app.health('/health', {
  checker: async (ctx) => {
    const dbHealthy = await ctx.db.client.ping?.() || true;

    return {
      healthy: dbHealthy,
      checks: {
        database: dbHealthy ? 'ok' : 'error',
        memory: process.memoryUsage().heapUsed / 1024 / 1024 < 500 ? 'ok' : 'warning'
      }
    };
  }
});
```

**Default Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-01-...",
  "uptime": 123.456,
  "checks": {
    "database": "ok",
    "memory": "ok"
  }
}
```

---

### Error Handlers

#### `app.onError(handler)`

Global error handler.

```javascript
app.onError((err, c) => {
  const ctx = c.get('ctx');
  console.error('Error:', err);
  return ctx.serverError(err.message);
});
```

#### `app.notFound(handler)`

404 handler.

```javascript
app.notFound((c) => {
  const ctx = c.get('ctx');
  return ctx.notFound(`Route not found: ${ctx.req.path}`);
});
```

---

## 🎨 RouteContext API

Every handler receives a `ctx` object with:

### Request Data

```javascript
const body = await ctx.body();        // Parse JSON body
const query = ctx.query();            // Get all query params
const limit = ctx.query('limit');     // Get specific param
const id = ctx.param('id');           // Get path param
const token = ctx.header('authorization');  // Get header
```

### Database Access

```javascript
ctx.db                    // Database instance
ctx.resources            // Resources object
const user = await ctx.db.resources.users.get(id);
```

### Response Helpers

```javascript
// Success responses
ctx.success({ data: user }, 201)
ctx.json({ custom: 'response' }, 200)

// Error responses
ctx.error('Message', { status: 400, code: 'BAD_REQUEST', details: {...} })
ctx.badRequest('Invalid input')
ctx.unauthorized('Token expired')
ctx.forbidden('Access denied')
ctx.notFound('User not found')
ctx.validationError('Validation failed', errors)
ctx.serverError('Internal error')

// Other responses
ctx.text('Hello', 200)
ctx.html('<h1>Hello</h1>', 200)
ctx.redirect('/login', 302)
```

### Context Storage

```javascript
ctx.set('user', userData);     // Store data in context
const user = ctx.get('user');  // Retrieve data
```

### Raw Hono Context

```javascript
ctx.raw     // Access raw Hono context if needed
ctx.c       // Alias for raw context
```

---

## ⚡ Performance

### Schema Compilation

**Problem**: V1 compiled schemas on every request
**Solution**: V2 compiles once at registration

```javascript
// ❌ OLD - Per-request compilation
app.post('/users', handler);  // 20ms per request

// ✅ NEW - Registration-time compilation
app.post('/users', { schema: {...} }, handler);  // 12ms per request
```

**Benchmark** (1000 requests):
- V1: 20,000ms total
- V2: 12,000ms total
- **40% faster! 🚀**

### Schema Cache

Identical schemas are cached internally:

```javascript
const userSchema = { email: 'string|required|email' };

app.post('/users', { schema: userSchema }, handler1);
app.post('/admins', { schema: userSchema }, handler2);
// Only compiled ONCE, cached for both routes
```

---

## 🔒 Security Best Practices

### 1. Always Validate Input

```javascript
app.post('/users', {
  schema: {
    email: 'string|required|email',
    password: 'string|required|min:8|pattern:^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d).*$'
  }
}, handler);
```

### 2. Use Guards for Authorization

```javascript
app.guard('isOwner', async (ctx) => {
  const user = ctx.get('user');
  const resourceId = ctx.param('id');
  const resource = await ctx.db.resources.users.get(resourceId);
  return resource.userId === user.id;
}, { priority: 20 });
```

### 3. Filter Sensitive Fields

```javascript
app.get('/users/:id', {
  protected: ['password', 'apiToken', 'metadata.internal']
}, handler);
```

### 4. Use HTTPS in Production

Always deploy with TLS/SSL enabled.

---

## 🎯 Common Patterns

### Pattern 1: Paginated List

```javascript
app.get('/users', {
  schema: {
    limit: 'number|min:1|max:100',
    offset: 'number|min:0'
  }
}, async (ctx) => {
  const limit = parseInt(ctx.query('limit')) || 10;
  const offset = parseInt(ctx.query('offset')) || 0;

  const users = await ctx.db.resources.users.list({ limit, offset });
  const total = await ctx.db.resources.users.count();

  return ctx.success({
    data: users,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    }
  });
});
```

### Pattern 2: Resource Ownership

```javascript
app.guard('isOwner', async (ctx) => {
  const user = ctx.get('user');
  const postId = ctx.param('id');

  const post = await ctx.db.resources.posts.get(postId);
  return post.userId === user.id;
});

app.put('/posts/:id', {
  guards: ['isAuthenticated', 'isOwner']
}, async (ctx) => {
  // Only owner can update
  const post = await ctx.db.resources.posts.update(ctx.param('id'), await ctx.body());
  return ctx.success({ data: post });
});
```

### Pattern 3: Conditional Guards

```javascript
app.guard('canEdit', async (ctx) => {
  const user = ctx.get('user');
  const postId = ctx.param('id');
  const post = await ctx.db.resources.posts.get(postId);

  // Admin can edit anything, users can edit own posts
  if (user.role === 'admin') return true;
  return post.userId === user.id;
});
```

### Pattern 4: Partition-based Filtering

```javascript
app.guard('userScope', async (ctx) => {
  const user = ctx.get('user');

  // Return partition filter (O(1) lookup!)
  return { userId: user.id };
});

app.get('/my-posts', {
  guards: ['isAuthenticated', 'userScope']
}, async (ctx) => {
  const filter = ctx.get('guardFilter');  // { userId: 'user123' }
  const posts = await ctx.db.resources.posts.query(filter);
  return ctx.success({ data: posts });
});
```

---

## 📖 Migration from V1

Not needed - V2 is the main version! Start fresh with best practices.

---

## 🐛 Debugging

### Enable Verbose Logging

```javascript
app.use(async (c, next) => {
  const start = Date.now();
  console.log(`→ ${c.req.method} ${c.req.path}`);
  await next();
  console.log(`← ${c.req.method} ${c.req.path} (${Date.now() - start}ms)`);
}, { priority: 1, name: 'logger' });
```

### Inspect Registered Routes

```javascript
const routes = app.getRoutes();
console.log('Routes:', routes.map(r => `${r.method} ${r.path}`));
```

### Check OpenAPI Spec

```javascript
const spec = app.generateOpenAPI({ title: 'Debug', version: '1.0.0' });
console.log(JSON.stringify(spec, null, 2));
```

---

## ✅ Checklist: Perfect API

- [ ] All routes have `description` and `tags`
- [ ] All mutations have `schema` validation
- [ ] All guards have explicit `priority`
- [ ] Sensitive fields are in `protected` array
- [ ] Error handlers are registered (`onError`, `notFound`)
- [ ] Health check endpoint exists
- [ ] Documentation is mounted (`/docs`, `/openapi.json`)
- [ ] Tests cover validation, guards, and error cases

---

## 🎉 You're Ready!

Start building amazing APIs with the best DX possible! 🚀
