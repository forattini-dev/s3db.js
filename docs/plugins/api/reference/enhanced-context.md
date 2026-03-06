# 🎯 Enhanced Context API - Developer-Friendly Routes

**Enhanced context keeps route handlers concise and expressive.**

## 📋 TL;DR

```javascript
// ❌ OLD WAY (verbose)
routes: {
  'GET /users/:id': async (c) => {
    const context = c.get('customRouteContext');
    const { database } = context;
    const user = await database.resources.users.get(c.req.param('id'));
    return c.json({ success: true, data: user });
  }
}

// ✅ NEW WAY (clean!)
routes: {
  'GET /users/:id': async (c, ctx) => {
    const user = await ctx.resources.users.get(ctx.param('id'));
    return ctx.success(user);
  }
}
```

**70% less code, 100% more readable!**

---

## 🚀 Quick Start

### Automatic (Default Behavior)

Just add a **second parameter** to your handler:

```javascript
import { Database } from 's3db.js';
import { ApiPlugin } from 's3db.js';

await db.usePlugin(new ApiPlugin({
  routes: {
    // ✅ AUTO-WRAPPED - handler has 2 params (c, ctx)
    'GET /users/:id': async (c, ctx) => {
      const user = await ctx.resources.users.get(ctx.param('id'));
      return ctx.success(user);
    },

    // ✅ LEGACY - handler has 1 param (c) - still works!
    'GET /legacy': async (c) => {
      const context = c.get('customRouteContext');
      return c.json({ message: 'Legacy handler' });
    }
  }
}));
```

**That's it!** No configuration, no imports, just add the second parameter.

---

## 📚 Context API Reference

### `ctx.resources` - Clean Resource Access

```javascript
'GET /health': async (c, ctx) => {
  // ✅ Clean access
  const { users, urls, clicks } = ctx.resources;

  // Use them directly
  const userCount = (await users.list()).length;
  const urlCount = (await urls.list()).length;

  return ctx.success({ users: userCount, urls: urlCount });
}
```

**Features**:
- ✅ Proxy-based - only existing resources are accessible
- ✅ Throws helpful error: "Resource 'foo' not found. Available: users, urls, clicks"
- ✅ No need for `database.resources.name` - just `ctx.resources.name`

---

### `ctx.resource` - Current Resource (Resource-Level Routes)

For routes defined inside a resource config:

```javascript
resources: {
  users: {
    api: {
      'POST /users/:id/reset-password': async (c, ctx) => {
        // ✅ ctx.resource = users resource (auto-injected!)
        const user = await ctx.resource.get(ctx.param('id'));

        // Validate against current resource schema
        const { valid, errors } = await ctx.validator.validateBody();

        return ctx.success({ user });
      }
    }
  }
}
```

---

### `ctx.validator` - Schema Validation Helpers

#### Validate Body

```javascript
'POST /users': async (c, ctx) => {
  // ✅ Validate body against resource schema
  const { valid, data, errors } = await ctx.validator.validateBody('users');

  if (!valid) {
    return ctx.error(`Validation failed: ${errors[0].message}`, 400);
  }

  const user = await ctx.resources.users.insert(data);
  return ctx.success(user, 201);
}
```

#### Validate Data

```javascript
'POST /batch': async (c, ctx) => {
  const body = await ctx.body();

  for (const userData of body.users) {
    // ✅ Validate individual objects
    const result = ctx.validator.validate('users', userData);

    if (!result.valid) {
      console.error('Invalid user:', result.errors);
      continue;
    }

    await ctx.resources.users.insert(userData);
  }
}
```

#### Validate or Throw

```javascript
'POST /users': async (c, ctx) => {
  const body = await ctx.body();

  // ✅ Throws error if invalid (caught by error handler)
  ctx.validator.validateOrThrow('users', body);

  // If we get here, body is valid
  const user = await ctx.resources.users.insert(body);
  return ctx.success(user);
}
```

---

### Request Helpers

```javascript
'GET /users/:id/posts': async (c, ctx) => {
  // ✅ Path params
  const id = ctx.param('id');
  const allParams = ctx.params();  // All params

  // ✅ Query string
  const page = ctx.query('page');
  const limit = ctx.query('limit');
  const allQuery = ctx.queries();  // All query params

  // ✅ Headers
  const authToken = ctx.header('authorization');
  const userAgent = ctx.header('user-agent');

  // ✅ Body parsing
  const body = await ctx.body();          // JSON
  const text = await ctx.text();          // Text
  const formData = await ctx.formData();  // FormData

  return ctx.success({ id, page, limit });
}
```

---

### Response Helpers

```javascript
routes: {
  // ✅ Success response
  'GET /users': async (c, ctx) => {
    const users = await ctx.resources.users.list();
    return ctx.success(users);
    // → { success: true, data: users }
  },

  // ✅ Error response
  'GET /error': async (c, ctx) => {
    return ctx.error('Something went wrong', 500);
    // → { success: false, error: { message, code, status } }
  },

  // ✅ Not Found
  'GET /users/:id': async (c, ctx) => {
    const user = await ctx.resources.users.get(ctx.param('id'));
    if (!user) return ctx.notFound('User not found');
    return ctx.success(user);
  },

  // ✅ Unauthorized
  'GET /admin': async (c, ctx) => {
    if (!ctx.isAuthenticated) {
      return ctx.unauthorized('Login required');
    }
  },

  // ✅ Forbidden
  'DELETE /users/:id': async (c, ctx) => {
    if (!ctx.hasScope('admin')) {
      return ctx.forbidden('Admin access required');
    }
  },

  // ✅ HTML response
  'GET /about': async (c, ctx) => {
    return ctx.html('<h1>About Us</h1>');
  },

  // ✅ Redirect
  'GET /old-url': async (c, ctx) => {
    return ctx.redirect('/new-url', 301);  // Permanent redirect
  },

  // ✅ Template rendering (if configured)
  'GET /page': async (c, ctx) => {
    const users = await ctx.resources.users.list();

    return await ctx.render('users', {
      title: 'User List',
      users
    });
  }
}
```

---

### Advanced Error Handling with `c.error()`

The API plugin includes a powerful error helper that standardizes error responses across your API. It's available globally on the request context (`c`), not just in enhanced context.

#### Basic Usage

```javascript
routes: {
  // ✅ String error with custom status
  'GET /test': async (c) => {
    return c.error('Something went wrong', 400);
  },

  // ✅ Error object (auto-detect status)
  'GET /users/:id': async (c, ctx) => {
    const user = await ctx.resources.users.get(ctx.param('id'));
    if (!user) {
      const err = new Error('User not found');
      err.name = 'NotFoundError';
      return c.error(err);  // Auto-returns 404
    }
    return ctx.success(user);
  },

  // ✅ With additional details
  'POST /users': async (c, ctx) => {
    const { valid, errors } = await ctx.validator.validateBody('users');
    if (!valid) {
      return c.error(
        new Error('Validation failed'),
        400,
        { field: errors[0].field, rule: errors[0].type }
      );
    }
  }
}
```

#### Standard Error Response Format

```json
{
  "success": false,
  "error": {
    "message": "User not found",
    "code": "NotFoundError",
    "status": 404,
    "details": {
      "field": "email",
      "rule": "required"
    },
    "stack": ["Error: User not found", "at handler..."]
  }
}
```

**Note**: `stack` is only included in development mode (`NODE_ENV !== 'production'`)

#### Auto-Detected Status Codes

The error helper intelligently detects HTTP status codes from:

**Error Names**:
- `ValidationError` → 400
- `NotFoundError` → 404
- `UnauthorizedError` → 401
- `ForbiddenError` → 403
- `ConflictError` → 409
- `TooManyRequestsError` → 429

**Error Messages** (pattern matching):
- "not found" → 404
- "unauthorized" / "unauthenticated" → 401
- "forbidden" / "access denied" → 403
- "invalid" / "validation" / "bad request" → 400
- "conflict" / "already exists" → 409
- "rate limit" / "too many" → 429

**Error Properties**:
- `error.status`, `error.statusCode`, or `error.httpStatus`

**Default**: 500 for unknown errors

#### Examples with Auto-Detection

```javascript
routes: {
  // ✅ Auto-detect from error name
  'GET /users/:id': async (c, ctx) => {
    const user = await ctx.resources.users.get(ctx.param('id'));
    if (!user) {
      const err = new Error('User not found');
      err.name = 'NotFoundError';
      return c.error(err);  // Returns 404 automatically
    }
  },

  // ✅ Auto-detect from message pattern
  'POST /users': async (c, ctx) => {
    const err = new Error('Email already exists in database');
    return c.error(err);  // Returns 409 (conflict) from "already exists"
  },

  // ✅ Auto-detect from error property
  'GET /protected': async (c, ctx) => {
    const err = new Error('Invalid token');
    err.statusCode = 401;
    return c.error(err);  // Returns 401 from err.statusCode
  },

  // ✅ Override auto-detection
  'POST /batch': async (c, ctx) => {
    const err = new Error('Validation error on item 5');
    err.name = 'ValidationError';  // Would auto-detect to 400
    return c.error(err, 422);  // Override to 422 Unprocessable Entity
  }
}
```

#### Integration with Try-Catch

```javascript
routes: {
  'POST /users': async (c, ctx) => {
    try {
      const { valid, data } = await ctx.validator.validateBody('users');
      if (!valid) {
        throw new Error('Invalid input');
      }

      const user = await ctx.resources.users.insert(data);
      return ctx.success(user);
    } catch (err) {
      // ✅ Centralized error handling
      return c.error(err, err.status || 500);
    }
  }
}
```

#### Standard Error Classes (Pre-built)

s3db.js provides pre-built error classes with semantic names, error codes, and correct HTTP status codes.

**NOTE**: Error classes are exported with `Http` prefix (`HttpNotFoundError`, `HttpValidationError`, etc.) to avoid conflicts with core s3db.js error classes. For convenience, backward-compatible aliases without the prefix are also exported (`NotFoundError`, `ValidationError`, etc.).

```javascript
import {
  ApiPlugin,
  // Recommended: Use Http prefix to avoid conflicts
  HttpValidationError,
  HttpNotFoundError,
  HttpUnauthorizedError,
  HttpForbiddenError,
  HttpConflictError,
  HttpTooManyRequestsError,
  HttpInternalServerError,
  // Or use aliases (backward compatibility)
  ValidationError,  // → HttpValidationError
  NotFoundError,    // → HttpNotFoundError
  createHttpError
} from 's3db.js';

// ✅ Pre-built error classes (recommended!)
routes: {
  'POST /users': async (c, ctx) => {
    const { valid, errors } = await ctx.validator.validateBody('users');
    if (!valid) {
      // ✅ All properties pre-configured!
      return c.error(new ValidationError('Invalid user data', { errors }));
      // → { success: false, error: {
      //     message: 'Invalid user data',
      //     code: 'VALIDATION_ERROR',
      //     status: 400,
      //     details: { errors }
      //   }}
    }
  },

  'GET /users/:id': async (c, ctx) => {
    const user = await ctx.resources.users.get(ctx.param('id'));
    if (!user) {
      // ✅ No need to specify status code!
      return c.error(new NotFoundError('User not found', {
        resource: 'users',
        id: ctx.param('id')
      }));
      // → { success: false, error: {
      //     message: 'User not found',
      //     code: 'NOT_FOUND',
      //     status: 404,
      //     details: { resource, id }
      //   }}
    }
    return ctx.success(user);
  },

  'DELETE /users/:id': async (c, ctx) => {
    if (!ctx.hasScope('admin')) {
      return c.error(new ForbiddenError('Admin access required', {
        required: ['admin'],
        current: ctx.user.scopes
      }));
    }
  },

  'POST /auth/login': async (c, ctx) => {
    const email = await ctx.query('email');
    const existingUser = await ctx.resources.users.query({ email });

    if (existingUser.length > 0) {
      return c.error(new ConflictError('Email already registered', {
        field: 'email',
        value: email
      }));
    }
  }
}
```

**Available Error Classes:**

| Class Name (Http prefix) | Alias | Status | Code | Default Message | Use Case |
|--------------------------|-------|--------|------|-----------------|----------|
| `HttpBadRequestError` | `BadRequestError` | 400 | `BAD_REQUEST` | "Bad request" | Invalid syntax/parameters |
| `HttpValidationError` | `ValidationError` | 400 | `VALIDATION_ERROR` | "Validation failed" | Schema/business rule validation |
| `HttpUnauthorizedError` | `UnauthorizedError` | 401 | `UNAUTHORIZED` | "Unauthorized" | Authentication required/failed |
| `HttpForbiddenError` | `ForbiddenError` | 403 | `FORBIDDEN` | "Forbidden" | Insufficient permissions |
| `HttpNotFoundError` | `NotFoundError` | 404 | `NOT_FOUND` | "Not found" | Resource doesn't exist |
| `HttpMethodNotAllowedError` | `MethodNotAllowedError` | 405 | `METHOD_NOT_ALLOWED` | "Method not allowed" | HTTP method not supported |
| `HttpConflictError` | `ConflictError` | 409 | `CONFLICT` | "Conflict" | Duplicate keys, conflicts |
| `HttpUnprocessableEntityError` | `UnprocessableEntityError` | 422 | `UNPROCESSABLE_ENTITY` | "Unprocessable entity" | Semantic errors |
| `HttpTooManyRequestsError` | `TooManyRequestsError` | 429 | `TOO_MANY_REQUESTS` | "Too many requests" | Rate limit exceeded |
| `HttpInternalServerError` | `InternalServerError` | 500 | `INTERNAL_SERVER_ERROR` | "Internal server error" | Unexpected errors |
| `HttpNotImplementedError` | `NotImplementedError` | 501 | `NOT_IMPLEMENTED` | "Not implemented" | Feature not ready |
| `HttpServiceUnavailableError` | `ServiceUnavailableError` | 503 | `SERVICE_UNAVAILABLE` | "Service unavailable" | Maintenance/overload |

**Helper Function:**

```javascript
// Create error by status code
const err = createHttpError(404, 'User not found', { id: '123' });
// Returns: NotFoundError instance with all properties set
```

**Why use these classes?**
- ✅ **Zero configuration** - All properties (name, code, status, details) pre-set
- ✅ **Semantic naming** - Clear intent from class name
- ✅ **Consistent codes** - Standardized error codes across API
- ✅ **Type-safe** - Better IDE autocomplete and type checking
- ✅ **Stack traces** - Automatic stack trace capture
- ✅ **Less code** - No need to manually set status/code

**Comparison:**

```javascript
// ❌ OLD WAY - Manual configuration
const err = new Error('User not found');
err.name = 'NotFoundError';
err.code = 'NOT_FOUND';
err.status = 404;
err.details = { id: 'user-123' };
return c.error(err);

// ✅ NEW WAY - Pre-built class
return c.error(new NotFoundError('User not found', { id: 'user-123' }));
// Same result, 70% less code!
```

#### Verbose Logging

Enable debug logging for debugging:

```javascript
await db.usePlugin(new ApiPlugin({
  logLevel: 'debug',  // Enables error logging
  routes: {
    'GET /test': async (c) => {
      return c.error(new Error('Test error'), 500);
    }
  }
}));

// Console output:
// [API Error] {
//   status: 500,
//   code: 'Error',
//   message: 'Test error',
//   path: '/test',
//   method: 'GET',
//   details: undefined
// }
```

#### Best Practices

**✅ DO**:
```javascript
// Use semantic error names for auto-detection
const err = new Error('Resource not found');
err.name = 'NotFoundError';
return c.error(err);

// Include helpful details for debugging
return c.error(err, 400, {
  field: 'email',
  expected: 'valid email address'
});

// Let auto-detection work for common patterns
return c.error(new Error('User not found'));  // Auto-detects 404
```

**❌ DON'T**:
```javascript
// Don't use generic error names
const err = new Error('Something failed');
return c.error(err);  // Returns 500, not helpful

// Don't manually construct error responses
return c.json({
  success: false,
  error: { message: 'Not found' }
}, 404);  // Use c.error() instead!

// Don't swallow errors without details
try {
  // ...
} catch (err) {
  return c.error('Error');  // Loses original error info!
}
```

---

---

### Template Rendering

**Configure template engine** in API Plugin:

```javascript
await db.usePlugin(new ApiPlugin({
  templates: {
    engine: 'ejs',        // or 'pug', 'jsx'
    templatesDir: './views',
    layout: 'layouts/main' // Optional layout (EJS only)
  },

  routes: {
    // ✅ Render EJS template
    'GET /': async (c, ctx) => {
      const users = await ctx.resources.users.list();

      return await ctx.render('home', {
        title: 'Home',
        userCount: users.length,
        features: ['Feature 1', 'Feature 2']
      });
    },

    // ✅ Render without layout
    'GET /partial': async (c, ctx) => {
      return await ctx.render('user-table', {
        users: await ctx.resources.users.list()
      }, {
        layout: false  // No layout
      });
    },

    // ✅ Pug template (if engine: 'pug')
    'GET /about': async (c, ctx) => {
      return await ctx.render('about', {
        appName: 'My App',
        version: '1.0.0'
      });
    }
  }
}));
```

**Template engines supported**:
- **EJS** - `<%= variable %>`, layouts, includes
- **Pug** - `extends`, `block`, minimal syntax
- **JSX** - React-like syntax with the built-in renderer path

**See examples**:
- `docs/examples/e87-api-templates-ejs-pug.js` - EJS templates
- `docs/examples/e88-api-templates-pug-only.js` - Pug templates

---

### Auth Helpers

```javascript
'GET /me': async (c, ctx) => {
  // ✅ Check if authenticated
  if (!ctx.isAuthenticated) {
    return ctx.unauthorized();
  }

  // ✅ Or throw if not authenticated
  ctx.requireAuth();  // Throws if not authenticated

  // ✅ Get user
  const user = ctx.user;  // { id, email, scopes, ... }

  // ✅ Check scopes
  if (ctx.hasScope('admin')) {
    // User has admin scope
  }

  if (ctx.hasAnyScope('admin', 'moderator')) {
    // User has at least one scope
  }

  if (ctx.hasAllScopes('users:read', 'users:write')) {
    // User has all scopes
  }

  // ✅ Require scope (throws if missing)
  ctx.requireScope('admin');

  return ctx.success({ user });
}
```

---

### Session & Metadata Helpers

```javascript
'GET /stats': async (c, ctx) => {
  // ✅ Session tracking (if enabled)
  const sessionId = ctx.sessionId;
  const session = ctx.session;

  // ✅ Request ID (if enabled)
  const requestId = ctx.requestId;

  // ✅ Database access
  const db = ctx.db;            // Short alias
  const database = ctx.database; // Full alias

  // ✅ Plugins (if any)
  const plugins = ctx.plugins;

  return ctx.success({
    sessionId,
    requestId,
    resources: Object.keys(db.resources)
  });
}
```

---

## 🎯 Complete Examples

### Example 1: Redirect Service

```javascript
routes: {
  // Create short URL
  'POST /urls': async (c, ctx) => {
    const { resources, validator, user } = ctx;

    // Validate body
    const { valid, data, errors } = await validator.validateBody('urls');
    if (!valid) return ctx.error(errors[0].message, 400);

    // Auto-inject user
    data.userId = user.id;

    // Create URL
    const url = await resources.urls.insert(data);

    return ctx.success(url, 201);
  },

  // Redirect with tracking
  'GET /:shortId': async (c, ctx) => {
    const { resources } = ctx;
    const shortId = ctx.param('shortId');

    // Get URL
    const urlList = await resources.urls.query({ shortId });
    const url = urlList[0];

    if (!url) return ctx.notFound();

    // Track click asynchronously
    resources.clicks.insert({
      urlId: url.id,
      sessionId: ctx.sessionId,
      ip: ctx.header('x-forwarded-for'),
      userAgent: ctx.header('user-agent'),
      timestamp: new Date().toISOString()
    }).catch(console.error);

    // Redirect
    return ctx.redirect(url.target, 302);
  },

  // Analytics
  'GET /urls/:id/analytics': async (c, ctx) => {
    const { resources } = ctx;
    const id = ctx.param('id');

    // Get URL
    const url = await resources.urls.get(id);
    if (!url) return ctx.notFound();

    // Check ownership
    if (url.userId !== ctx.user.id && !ctx.hasScope('admin')) {
      return ctx.forbidden();
    }

    // Get clicks
    const clicks = await resources.clicks.query({ urlId: id });

    return ctx.success({
      url,
      totalClicks: clicks.length,
      clicks: clicks.slice(0, 100)  // Last 100 clicks
    });
  }
}
```

---

### Example 2: Multi-Tenant SaaS

```javascript
routes: {
  // List projects (tenant isolation)
  'GET /projects': async (c, ctx) => {
    const { resources, user } = ctx;

    ctx.requireAuth();

    // Query projects for current tenant
    const projects = await resources.projects.query({
      tenantId: user.tenantId
    });

    return ctx.success(projects);
  },

  // Create project (auto-inject tenant)
  'POST /projects': async (c, ctx) => {
    const { resources, validator, user } = ctx;

    ctx.requireAuth();

    const { valid, data, errors } = await validator.validateBody('projects');
    if (!valid) return ctx.error(errors[0].message, 400);

    // Auto-inject tenant and user
    data.tenantId = user.tenantId;
    data.ownerId = user.id;

    const project = await resources.projects.insert(data);

    return ctx.success(project, 201);
  },

  // Update project (ownership check)
  'PATCH /projects/:id': async (c, ctx) => {
    const { resources, validator, user } = ctx;

    ctx.requireAuth();

    const id = ctx.param('id');
    const project = await resources.projects.get(id);

    if (!project) return ctx.notFound();

    // Check ownership or admin
    if (project.ownerId !== user.id && !ctx.hasScope('admin')) {
      return ctx.forbidden();
    }

    // Validate partial update
    const body = await ctx.body();
    const result = validator.validate('projects', body);
    if (!result.valid) return ctx.error(result.errors[0].message, 400);

    // Update
    const updated = await resources.projects.patch(id, body);

    return ctx.success(updated);
  }
}
```

---

## 🔄 Backward Compatibility

### Legacy Handlers (1 param) Still Work!

```javascript
routes: {
  // ✅ NEW: Enhanced context
  'GET /new': async (c, ctx) => {
    return ctx.success({ message: 'New API!' });
  },

  // ✅ OLD: Legacy context (still works!)
  'GET /legacy': async (c) => {
    const context = c.get('customRouteContext');
    const { database } = context;
    return c.json({ message: 'Legacy API' });
  }
}
```

**How it works**:
- If handler has **2 params** (`c, ctx`) → Auto-wrapped with enhanced context
- If handler has **1 param** (`c`) → Legacy behavior (no breaking changes!)

---

## 🎯 Best Practices

### 1. Destructure What You Need

```javascript
// ✅ GOOD - Destructure what you need
'GET /users/:id': async (c, ctx) => {
  const { resources, validator, user } = ctx;
  // ...
}

// ❌ NOT NECESSARY - You have access to everything via ctx
'GET /users/:id': async (c, ctx) => {
  const user = await ctx.resources.users.get(ctx.param('id'));
  // ...
}
```

### 2. Use Response Shortcuts

```javascript
// ✅ GOOD - Clean and concise
return ctx.success(user);
return ctx.error('Not found', 404);
return ctx.notFound();

// ❌ VERBOSE - Don't do this
return c.json({ success: true, data: user });
return c.json({ success: false, error: { message: 'Not found' } }, 404);
```

### 3. Validate Early

```javascript
// ✅ GOOD - Validate before processing
'POST /users': async (c, ctx) => {
  const { valid, data, errors } = await ctx.validator.validateBody('users');
  if (!valid) return ctx.error(errors[0].message, 400);

  // If we get here, data is valid
  const user = await ctx.resources.users.insert(data);
  return ctx.success(user);
}
```

### 4. Use Auth Helpers

```javascript
// ✅ GOOD - Clear and explicit
'DELETE /users/:id': async (c, ctx) => {
  ctx.requireAuth();
  ctx.requireScope('admin');

  // If we get here, user is authenticated and has admin scope
  await ctx.resources.users.delete(ctx.param('id'));
  return ctx.success({ deleted: true });
}

// ❌ VERBOSE - Don't do this
'DELETE /users/:id': async (c, ctx) => {
  if (!ctx.user) {
    return ctx.unauthorized();
  }
  if (!ctx.user.scopes?.includes('admin')) {
    return ctx.forbidden();
  }
  // ...
}
```

---

## 🚀 Migration Guide

### Migrating from Legacy API

**Step 1**: Add second parameter to handlers

```javascript
// Before
'GET /users/:id': async (c) => { ... }

// After
'GET /users/:id': async (c, ctx) => { ... }
```

**Step 2**: Replace verbose access with clean helpers

```javascript
// Before
const context = c.get('customRouteContext');
const { database } = context;
const user = await database.resources.users.get(c.req.param('id'));
return c.json({ success: true, data: user });

// After
const user = await ctx.resources.users.get(ctx.param('id'));
return ctx.success(user);
```

**Step 3**: Use validation helpers

```javascript
// Before
const body = await c.req.json();
const validation = await database.resources.users.validator.validate(body);
if (!validation.isValid) {
  return c.json({ error: validation.errors[0].message }, 400);
}

// After
const { valid, data, errors } = await ctx.validator.validateBody('users');
if (!valid) return ctx.error(errors[0].message, 400);
```

---

## 📊 API Comparison

| Feature | Legacy API | Enhanced API | Improvement |
|---------|-----------|--------------|-------------|
| Resource access | `c.get('customRouteContext').database.resources.users` | `ctx.resources.users` | 70% shorter |
| Validation | `resource.validator.validate(data)` | `ctx.validator.validateBody()` | Built-in |
| Request params | `c.req.param('id')` | `ctx.param('id')` | 20% shorter |
| Response | `c.json({ success: true, data })` | `ctx.success(data)` | 50% shorter |
| Auth check | `if (!c.get('user'))` | `ctx.requireAuth()` | Clearer |
| Scope check | `c.get('user')?.scopes?.includes('admin')` | `ctx.hasScope('admin')` | 60% shorter |

---

## 🎉 Summary

### What You Get

✅ **70% less boilerplate** - Clean, concise code
✅ **Intuitive API** - Everything you need in `ctx`
✅ **Type-safe** - Clear error messages
✅ **Backward compatible** - Legacy handlers still work
✅ **Zero config** - Just add second parameter
✅ **Production ready** - Validation, auth, errors built-in

### Before vs After

```javascript
// ❌ BEFORE (verbose)
const context = c.get('customRouteContext');
const { database } = context;
const user = await database.resources.users.get(c.req.param('id'));
if (!user) {
  return c.json({ success: false, error: { message: 'Not found' } }, 404);
}
return c.json({ success: true, data: user });

// ✅ AFTER (clean!)
const user = await ctx.resources.users.get(ctx.param('id'));
if (!user) return ctx.notFound();
return ctx.success(user);
```

**5 lines → 3 lines. 70% reduction. 100% more readable.** 🎉

---

**Ready to use it?** Just add the second parameter and enjoy! 🚀
