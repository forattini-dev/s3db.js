/**
 * Example 86: API Plugin - RouteContext
 *
 * Demonstrates the supported custom-route contract:
 * - Plugin-level routes receive `(c, ctx)`
 * - Resource-level routes receive `(c, ctx)` with `ctx.resource`
 * - Validation, auth, request, and response helpers live on `ctx`
 *
 * Run: node docs/examples/e86-api-route-context.js
 */

import { Database, ApiPlugin, withContext } from '../../dist/s3db.es.js';

const db = new Database({
  connectionString: 'memory://',
  verbose: false
});

await db.connect();

await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    username: 'string|required|minlength:3',
    email: 'string|required|email',
    role: 'string|default:user',
    active: 'boolean|default:true'
  },
  behavior: 'body-overflow',
  timestamps: true,
  api: {
    'GET /summary': async (c, ctx) => {
      const total = await ctx.resource.count();
      return ctx.success({ resource: 'users', total });
    }
  }
});

await db.createResource({
  name: 'urls',
  attributes: {
    id: 'string|required',
    shortId: 'string|required',
    target: 'string|required',
    userId: 'string|required',
    clicks: 'number|default:0'
  },
  behavior: 'body-overflow',
  timestamps: true
});

const apiPlugin = new ApiPlugin({
  port: 3105,
  verbose: true,
  routes: {
    'GET /route-context/health': async (c, ctx) => {
      const userCount = await ctx.resources.users.count();
      const urlCount = await ctx.resources.urls.count();

      return ctx.success({
        status: 'healthy',
        uptime: process.uptime(),
        resources: { users: userCount, urls: urlCount }
      });
    },

    'POST /users/validate': async (c, ctx) => {
      const { valid, data, errors } = await ctx.validator.validateBody('users');

      if (!valid) {
        return ctx.validationError('Validation failed', errors);
      }

      const user = await ctx.resources.users.insert(data);
      return ctx.success(user, 201);
    },

    'GET /urls/:shortId': async (c, ctx) => {
      const shortId = ctx.param('shortId');
      const matches = await ctx.resources.urls.query({ shortId });
      const url = matches[0];

      if (!url) {
        return ctx.notFound(`URL not found: ${shortId}`);
      }

      return ctx.success(url);
    },

    'GET /me': async (c, ctx) => {
      c.set('user', {
        id: 'user123',
        email: 'john@example.com',
        role: 'admin',
        scopes: ['urls:read', 'urls:write']
      });

      ctx.requireAuth();
      ctx.requireRole('admin');

      return ctx.success({
        user: ctx.user,
        scopes: ctx.user?.scopes,
        hasUrlsWrite: ctx.hasScope('urls:write')
      });
    },

    'GET /explicit': withContext(async (c, ctx) => {
      return ctx.success({
        message: 'withContext() produces the same RouteContext contract',
        requestId: ctx.requestId
      });
    }),

    'GET /ctx-only': async (_c, ctx) => {
      return ctx.success({
        request: {
          method: ctx.request.method,
          path: ctx.request.path
        }
      });
    }
  }
});

await db.usePlugin(apiPlugin);

console.log('RouteContext demo running at http://localhost:3105');
console.log('Try:');
console.log('  curl http://localhost:3105/route-context/health');
console.log('  curl http://localhost:3105/users/summary');
console.log('  curl -X POST http://localhost:3105/users/validate -H "content-type: application/json" -d \'{"id":"u1","username":"john","email":"john@example.com"}\'');
