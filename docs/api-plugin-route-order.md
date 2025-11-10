# API Plugin - Route and Middleware Order

**CRITICAL**: Order matters in Hono! Routes and middlewares are executed in registration order.

## 📋 Complete Execution Order

### 1️⃣ **Global Middlewares** (MiddlewareChain)
Applied to ALL routes via `app.use('*', ...)` - **FIRST**

```javascript
// server.js → middlewareChain.apply(app)
1. Request tracking       // Graceful shutdown support
2. Failban                // Block banned IPs ASAP
3. Request ID             // Before any logging
4. CORS                   // Before auth checks
5. Security headers       // Before response generation
6. Session tracking       // User session management
7. Custom middlewares     // User-defined (compression here)
8. Templates              // Template engine setup
9. Body size limits       // Prevent DoS attacks
```

**Why this order?**
- **Request tracking first**: Must wrap ALL requests for graceful shutdown
- **Failban early**: Block bad actors before wasting resources
- **Request ID early**: Needed for logging in all subsequent middlewares
- **CORS before auth**: Preflight requests don't need auth
- **Custom middlewares**: Compression should happen early for max benefit
- **Body limits last**: Only needed for POST/PUT/PATCH

### 2️⃣ **Context Injection** (Router)
Makes database resources accessible via `c.get('resourceName')`

```javascript
// router.js → mount()
app.use('*', contextInjectionMiddleware);
```

### 3️⃣ **Root Route** (Router)
Exact match for `/` - **BEFORE static files**

```javascript
// router.js → mountRootRoute()
app.get('/', splashScreenHandler);
```

**Why before static files?**
- Exact routes (`/`) take precedence over wildcards (`/*`)
- Allows static files to be configured as `path: '/'` without conflict
- User can disable with `rootRoute: false` if needed

### 4️⃣ **Static Files** (Router)
File serving for assets, images, etc.

```javascript
// router.js → mountStaticRoutes()
app.get('/assets/*', staticHandler);
app.get('/*', staticHandler);  // If path='/'
```

**⚠️ Warning**: If `path: '/'`, this creates a catch-all `/*` route!
- Root route `/` still works (registered first)
- But ALL other routes will be blocked
- Only use `path: '/'` if serving a full static site

### 5️⃣ **Resource Routes** (Router)
Auto-generated CRUD endpoints for resources

```javascript
// router.js → mountResourceRoutes()
app.route('/users', usersRouter);        // No version prefix
app.route('/v1/users', usersRouter);     // With version prefix
```

**Mounted routes per resource:**
```
GET    /:resource           → list()
POST   /:resource           → insert()
GET    /:resource/:id       → get()
PUT    /:resource/:id       → update()
PATCH  /:resource/:id       → patch()
DELETE /:resource/:id       → delete()
HEAD   /:resource/:id       → exists()
```

### 6️⃣ **Auth Routes** (Router)
JWT authentication endpoints

```javascript
// router.js → mountAuthRoutes()
app.route('/auth', authRouter);
```

**Mounted routes:**
```
POST /auth/login           → JWT login
POST /auth/register        → User registration (if enabled)
POST /auth/refresh         → Refresh JWT token
```

### 7️⃣ **Relational Routes** (Router)
Nested resource relationships (if RelationPlugin active)

```javascript
// router.js → mountRelationalRoutes()
app.route('/:resource/:id/:relation', relationalRouter);
```

**Example:**
```
GET /users/123/posts       → Get user's posts
GET /posts/456/comments    → Get post's comments
```

### 8️⃣ **Custom Routes** (Router)
User-defined plugin-level routes

```javascript
// router.js → mountCustomRoutes()
mountCustomRoutes(app, this.routes, context);
```

**Example:**
```javascript
new ApiPlugin({
  routes: {
    '/custom': (c) => c.json({ custom: true }),
    '/stats': async (c) => { /* ... */ }
  }
})
```

### 9️⃣ **Admin Routes** (Router)
Internal monitoring and security endpoints

```javascript
// router.js → mountAdminRoutes()
app.get('/metrics', metricsHandler);
app.route('/admin/security', failbanAdminRouter);
```

**Mounted routes:**
```
GET  /metrics                    → Performance metrics
GET  /admin/security/bans        → List banned IPs
POST /admin/security/ban         → Ban IP manually
POST /admin/security/unban       → Unban IP
GET  /admin/security/violations  → List violations
```

### 🔟 **Health Routes** (HealthManager)
Health check endpoints - **AFTER all other routes**

```javascript
// server.js → healthManager.register(app)
app.get('/health', healthHandler);
app.get('/health/live', livenessHandler);
app.get('/health/ready', readinessHandler);
```

**Why after other routes?**
- Health checks should ALWAYS work
- Should not be blocked by auth or other middlewares
- Only blocked by global middlewares (failban, request tracking)

### 1️⃣1️⃣ **Documentation Routes** (ApiServer)
OpenAPI spec and UI - **AFTER health**

```javascript
// server.js → _setupDocumentationRoutes()
app.get('/openapi.json', openApiHandler);
app.get('/docs', docsUIHandler);
```

**Note**: Root route (`/`) is NOT here anymore!
- Moved to Router.mountRootRoute() for better control
- Prevents duplicate route registration

### 1️⃣2️⃣ **Error Handlers** (ApiServer)
Global error handling - **MUST BE LAST**

```javascript
// server.js → start()
app.onError(errorHandler);    // Catches all errors
app.notFound(notFoundHandler); // 404 for unmatched routes
```

**Why last?**
- `onError` catches errors from ANY previous middleware/route
- `notFound` is the final fallback when NO route matches
- Must be registered after all routes to catch everything

---

## 🎯 Route Precedence Rules (Hono)

### Rule 1: First Match Wins
```javascript
app.get('/', handler1);    // ✅ This wins
app.get('/', handler2);    // ❌ Never reached
```

### Rule 2: Exact Routes Before Wildcards
```javascript
app.get('/', exactHandler);      // ✅ Matches /
app.get('/*', wildcardHandler);  // ✅ Matches /anything/else
// Request to / → exactHandler wins
```

### Rule 3: More Specific Before Less Specific
```javascript
app.get('/users/me', meHandler);       // ✅ Most specific
app.get('/users/:id', userHandler);    // ✅ Less specific
app.get('/users/*', catchAllHandler);  // ✅ Least specific
```

### Rule 4: Static Before Parameters
```javascript
app.get('/users/create', createHandler); // ✅ Static
app.get('/users/:id', userHandler);      // ✅ Dynamic
// Request to /users/create → createHandler wins
```

---

## 🚨 Common Issues and Solutions

### Issue 1: 404 on Root Route
**Symptom**: `GET /` returns 404
**Cause**: Static files with `path: '/'` registered before root route
**Solution**: Root route is now registered BEFORE static files ✅

### Issue 2: All Routes Return Static Files
**Symptom**: API routes return HTML/files instead of JSON
**Cause**: Static files configured with `path: '/'`
**Solution**: Use specific path like `/assets` or `/public`

```javascript
// ❌ BAD: Catches everything
static: [{ driver: 'filesystem', path: '/', root: './public' }]

// ✅ GOOD: Only catches /assets/*
static: [{ driver: 'filesystem', path: '/assets', root: './public' }]
```

### Issue 3: Health Checks Return 401
**Symptom**: `/health` requires authentication
**Cause**: Auth middleware applied globally
**Solution**: Health routes are after Router, they skip route-level auth ✅

### Issue 4: Custom Routes Not Working
**Symptom**: Custom routes return 404
**Cause**: Registered after catch-all route
**Solution**: Custom routes are registered at step 8, before error handlers ✅

---

## 📝 Best Practices

### 1. Use Specific Paths for Static Files
```javascript
// ✅ GOOD
static: [
  { driver: 'filesystem', path: '/assets', root: './public/assets' },
  { driver: 's3', path: '/uploads', bucket: 'my-bucket' }
]

// ❌ BAD - Blocks all routes!
static: [
  { driver: 'filesystem', path: '/', root: './public' }
]
```

### 2. Order Resource Routes by Specificity
```javascript
// ✅ GOOD - Specific first
resources: {
  'users/admin': { methods: ['GET'] },  // /users/admin
  'users': { methods: ['GET', 'POST'] } // /users, /users/:id
}
```

### 3. Use basePath for API Versioning
```javascript
// ✅ GOOD - All routes under /api/v1
new ApiPlugin({
  basePath: '/api/v1',
  resources: { users: {} }
})
// Routes: /api/v1/, /api/v1/users, /api/v1/health
```

### 4. Disable Root Route for Static Sites
```javascript
// ✅ GOOD - Serve index.html at root
new ApiPlugin({
  rootRoute: false,  // Disable splash screen
  static: [{
    driver: 'filesystem',
    path: '/',
    root: './dist',
    config: { index: 'index.html' }
  }]
})
```

---

## 🔍 Debugging Route Issues

### Check Route Registration Order
```javascript
new ApiPlugin({
  verbose: true  // Logs all route registrations
})
```

**Output:**
```
[API Router] Context injection middleware registered
[API Router] Mounted default splash screen at /
[API Router] Mounted static files (filesystem) at /assets
[API Router] Mounted routes for resource 'users' at /users
[API Router] Mounted auth routes at /auth
[API Router] Metrics endpoint enabled at /metrics
[HealthManager] Health endpoints registered
```

### Test Route Precedence
```bash
# Should return splash screen HTML
curl http://localhost:3000/

# Should return static file
curl http://localhost:3000/assets/logo.png

# Should return JSON
curl http://localhost:3000/users

# Should return 404 JSON
curl http://localhost:3000/nonexistent
```

---

## 📚 Related Documentation

- [Hono Routing Guide](https://hono.dev/api/routing)
- [API Plugin Configuration](./plugins/api.md)
- [Middleware Guide](./api-plugin-middleware.md)
- [Static Files Configuration](./api-plugin-static-files.md)

---

**Last Updated**: 2025-11-10
