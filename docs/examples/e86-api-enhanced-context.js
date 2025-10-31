/**
 * Example 86: API Plugin - Enhanced Route Context (NEW!)
 *
 * Demonstrates the NEW developer-friendly context API:
 * - Auto-wrapped handlers (default behavior)
 * - Clean resource access via ctx.resources
 * - Current resource shortcut (ctx.resource)
 * - Validator helpers (ctx.validator)
 * - Request/Response shortcuts
 * - Auth helpers (ctx.user, ctx.hasScope, etc.)
 *
 * Run: node docs/examples/e86-api-enhanced-context.js
 */

import { Database, ApiPlugin, withContext } from '../../dist/s3db.es.js';

// Database setup
const db = new Database({
  connectionString: 'memory://',
  verbose: false
});

await db.connect();

// Create resources
const users = await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    username: 'string|required|minlength:3',
    email: 'string|required|email',
    password: 'secret|required|minlength:8',
    role: 'string|default:user',
    active: 'boolean|default:true'
  },
  behavior: 'body-overflow',
  timestamps: true
});

const urls = await db.createResource({
  name: 'urls',
  attributes: {
    id: 'string|required',
    shortId: 'string|required',
    target: 'string|required',
    userId: 'string|required',
    clicks: 'number|default:0',
    title: 'string|optional',
    description: 'string|optional'
  },
  behavior: 'body-overflow',
  timestamps: true
});

const clicks = await db.createResource({
  name: 'clicks',
  attributes: {
    id: 'string|required',
    urlId: 'string|required',
    sessionId: 'string|required',
    ip: 'string|optional',
    userAgent: 'string|optional',
    timestamp: 'string|required'
  },
  behavior: 'body-overflow',
  timestamps: true
});

// Setup API Plugin
const apiPlugin = new ApiPlugin({
  port: 3105,
  verbose: true,

  // Custom routes with enhanced context (NEW!)
  routes: {
    // ✅ Example 1: Basic usage - auto-wrapped!
    // Handler with 2 params (c, ctx) is automatically enhanced
    'GET /health': async (c, ctx) => {
      // ✅ Clean access to database
      const { db, resources } = ctx;

      const userCount = (await resources.users.list()).length;
      const urlCount = (await resources.urls.list()).length;

      // ✅ Response helpers
      return ctx.success({
        status: 'healthy',
        uptime: process.uptime(),
        resources: { users: userCount, urls: urlCount }
      });
    },

    // ✅ Example 2: Validator helpers
    'POST /users': async (c, ctx) => {
      const { resources, validator } = ctx;

      // ✅ Validate body against resource schema
      const { valid, data, errors } = await validator.validateBody('users');

      if (!valid) {
        return ctx.error(`Validation failed: ${errors[0].message}`, 400);
      }

      // Insert user
      const user = await resources.users.insert(data);

      return ctx.success(user, 201);
    },

    // ✅ Example 3: Request helpers
    'GET /urls/:shortId': async (c, ctx) => {
      const { resources } = ctx;

      // ✅ Easy param access
      const shortId = ctx.param('shortId');

      // Query URLs
      const urlList = await resources.urls.query({ shortId });
      const url = urlList[0];

      if (!url) {
        // ✅ Clean error responses
        return ctx.notFound(`URL not found: ${shortId}`);
      }

      return ctx.success(url);
    },

    // ✅ Example 4: Auth helpers (mock user for demo)
    'GET /me': async (c, ctx) => {
      // Mock user (in real app, this comes from auth middleware)
      c.set('user', {
        id: 'user123',
        email: 'john@example.com',
        scopes: ['preset:user', 'urls:read', 'urls:write']
      });

      // ✅ Auth helpers
      ctx.requireAuth();  // Throws if not authenticated

      if (!ctx.hasScope('urls:read')) {
        return ctx.forbidden('Missing scope: urls:read');
      }

      const user = ctx.user;

      return ctx.success({
        user,
        scopes: user.scopes,
        hasUrlsWrite: ctx.hasScope('urls:write'),
        hasAdmin: ctx.hasScope('preset:admin')
      });
    },

    // ✅ Example 5: Complex route with multiple resources
    'POST /urls/:shortId/click': async (c, ctx) => {
      const { resources } = ctx;

      const shortId = ctx.param('shortId');
      const body = await ctx.json();  // Request helper

      // Get URL
      const urlList = await resources.urls.query({ shortId });
      const url = urlList[0];

      if (!url) {
        return ctx.notFound(`URL not found: ${shortId}`);
      }

      // Record click
      const click = await resources.clicks.insert({
        urlId: url.id,
        sessionId: body.sessionId,
        ip: ctx.header('x-forwarded-for'),
        userAgent: ctx.header('user-agent'),
        timestamp: new Date().toISOString()
      });

      // Update click count
      await resources.urls.patch(url.id, {
        clicks: url.clicks + 1
      });

      return ctx.success({ click, url });
    },

    // ✅ Example 6: Legacy handler (1 param) - still works!
    'GET /legacy': async (c) => {
      // Handler with only (c) param uses legacy behavior
      const context = c.get('customRouteContext');
      const { database } = context;

      return c.json({
        success: true,
        message: 'Legacy handler still works!',
        resources: Object.keys(database.resources)
      });
    },

    // ✅ Example 7: Explicit withContext() wrapper (optional)
    'GET /explicit': withContext(async (c, ctx) => {
      // You can also explicitly wrap handlers if you want
      return ctx.success({ message: 'Explicitly wrapped!' });
    }),

    // ✅ Example 8: Batch operations with validator
    'POST /urls/batch': async (c, ctx) => {
      const { resources, validator } = ctx;

      const body = await ctx.json();

      if (!Array.isArray(body.urls)) {
        return ctx.error('Body must contain "urls" array', 400);
      }

      const inserted = [];
      const errors = [];

      for (const urlData of body.urls) {
        // Validate each URL
        const result = validator.validate('urls', urlData);

        if (!result.valid) {
          errors.push({
            data: urlData,
            errors: result.errors
          });
          continue;
        }

        // Insert valid URLs
        const url = await resources.urls.insert(urlData);
        inserted.push(url);
      }

      return ctx.success({
        inserted: inserted.length,
        failed: errors.length,
        urls: inserted,
        errors
      });
    },

    // ✅ Example 9: HTML response with redirect
    'GET /r/:shortId': async (c, ctx) => {
      const { resources } = ctx;

      const shortId = ctx.param('shortId');
      const urlList = await resources.urls.query({ shortId });
      const url = urlList[0];

      if (!url) {
        return ctx.html('<h1>404 - URL not found</h1>', 404);
      }

      // Return HTML with meta refresh
      return ctx.html(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Redirecting...</title>
          <meta http-equiv="refresh" content="0;url=${url.target}">
        </head>
        <body>
          <p>Redirecting to <a href="${url.target}">${url.target}</a>...</p>
        </body>
        </html>
      `);
    },

    // ✅ Example 10: All query helpers
    'GET /search': async (c, ctx) => {
      // ✅ All request helpers in one place
      const query = ctx.queries();        // All query params
      const limit = ctx.query('limit');   // Single query param
      const page = ctx.query('page');

      // ✅ Request metadata
      const requestId = ctx.requestId;
      const sessionId = ctx.sessionId;

      return ctx.success({
        query,
        pagination: { limit, page },
        requestId,
        sessionId
      });
    }
  }
});

// Use plugin
await db.use(apiPlugin);

console.log('✅ API Plugin with enhanced context running at http://localhost:3105');
console.log('');
console.log('📋 Try these endpoints:');
console.log('');
console.log('  # Health check with resource counts');
console.log('  curl http://localhost:3105/health');
console.log('');
console.log('  # Create user with validation');
console.log('  curl -X POST http://localhost:3105/users \\');
console.log('    -H "Content-Type: application/json" \\');
console.log('    -d \'{"username":"john","email":"john@example.com","password":"secret123"}\'');
console.log('');
console.log('  # Get URL by shortId');
console.log('  curl http://localhost:3105/urls/abc123');
console.log('');
console.log('  # Check auth status');
console.log('  curl http://localhost:3105/me');
console.log('');
console.log('  # Legacy handler (backward compatibility)');
console.log('  curl http://localhost:3105/legacy');
console.log('');
console.log('  # Batch create URLs');
console.log('  curl -X POST http://localhost:3105/urls/batch \\');
console.log('    -H "Content-Type: application/json" \\');
console.log('    -d \'{"urls":[{"shortId":"abc","target":"https://example.com","userId":"user1"}]}\'');
console.log('');
console.log('🎯 Key Features:');
console.log('  ✅ Auto-wrapped handlers (if handler has 2 params)');
console.log('  ✅ Clean resource access: ctx.resources.users');
console.log('  ✅ Validator helpers: ctx.validator.validateBody()');
console.log('  ✅ Request shortcuts: ctx.param(), ctx.query(), ctx.json()');
console.log('  ✅ Response shortcuts: ctx.success(), ctx.error(), ctx.notFound()');
console.log('  ✅ Auth helpers: ctx.user, ctx.hasScope(), ctx.requireAuth()');
console.log('  ✅ Backward compatible: handlers with 1 param still work!');
console.log('');
