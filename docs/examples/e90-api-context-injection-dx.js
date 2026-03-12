/**
 * Example 90: API Plugin - Context Access Patterns
 *
 * Demonstrates three supported ways to work with request-scoped API helpers:
 * 1. Native `(c, ctx)` route handlers
 * 2. `withContext()` for adapting standalone handlers
 * 3. `createRouteContext()` inside lower-level adapters
 *
 * Run: node docs/examples/e90-api-context-injection-dx.js
 */

import { Database } from '../../src/index.js';
import { ApiPlugin, createRouteContext, withContext } from '../../src/plugins/api/index.js';

const db = new Database({
  connectionString: 'memory://example-context-dx/api-dx'
});

await db.connect();

await db.createResource({
  name: 'urls',
  attributes: {
    id: 'string|required',
    target: 'string|required|url',
    clicks: 'number|default:0',
    userId: 'string|required'
  },
  behavior: 'body-overflow',
  timestamps: true
});

await db.createResource({
  name: 'clicks',
  attributes: {
    id: 'string|required',
    urlId: 'string|required',
    userId: 'string|optional',
    timestamp: 'string|required',
    country: 'string|optional'
  },
  behavior: 'body-overflow'
});

await db.resources.urls.insert({
  id: 'url123',
  target: 'https://example.com',
  clicks: 5,
  userId: 'user1'
});

await db.resources.clicks.insert({
  id: 'click1',
  urlId: 'url123',
  userId: 'user1',
  timestamp: new Date().toISOString(),
  country: 'US'
});

await db.resources.clicks.insert({
  id: 'click2',
  urlId: 'url123',
  userId: 'user2',
  timestamp: new Date().toISOString(),
  country: 'BR'
});

const apiPlugin = new ApiPlugin({
  port: 3000,
  verbose: true,
  docs: { enabled: true },
  routes: {
    'GET /approach1/:id': async (_c, ctx) => {
      const id = ctx.param('id');
      const url = await ctx.resources.urls.get(id);

      if (!url) {
        return ctx.notFound('URL not found');
      }

      const urlClicks = await ctx.resources.clicks.query({ urlId: id });

      return ctx.success({
        approach: 'Native RouteContext',
        data: {
          url,
          clickCount: urlClicks.length,
          clicks: urlClicks
        }
      });
    },

    'GET /approach2/:id': withContext(async (c, ctx) => {
      const id = c.req.param('id');
      const { urls, clicks } = ctx.resources;
      const url = await urls.get(id);

      if (!url) {
        return ctx.notFound('URL not found');
      }

      const urlClicks = await clicks.query({ urlId: id });

      return ctx.success({
        approach: 'withContext() adapter',
        data: {
          url,
          clickCount: urlClicks.length,
          clicks: urlClicks
        }
      });
    }),

    'GET /approach3/:id': async (c) => {
      const ctx = createRouteContext(c);
      const id = ctx.param('id');
      const url = await ctx.resources.urls.get(id);

      if (!url) {
        return ctx.notFound('URL not found');
      }

      const urlClicks = await ctx.resources.clicks.query({ urlId: id });

      return ctx.success({
        approach: 'createRouteContext() adapter',
        data: {
          url,
          clickCount: urlClicks.length,
          clicks: urlClicks
        }
      });
    },

    'GET /': async (_c, ctx) => {
      return ctx.html(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Context Access Patterns</title>
          <style>
            body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
            h1 { color: #0a6b44; }
            .example { background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 8px; }
            .example h3 { margin-top: 0; color: #222; }
            .example a { color: #0055aa; text-decoration: none; font-weight: bold; }
            .example a:hover { text-decoration: underline; }
            code { background: #e6e6e6; padding: 2px 6px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <h1>RouteContext Access Patterns</h1>
          <p>All three examples use the same supported <code>RouteContext</code> contract.</p>

          <div class="example">
            <h3>Approach 1: Native Route Handler</h3>
            <p><code>'GET /route': async (c, ctx) => { ... }</code></p>
            <p><a href="/approach1/url123">Try /approach1/url123 →</a></p>
          </div>

          <div class="example">
            <h3>Approach 2: withContext()</h3>
            <p><code>withContext(async (c, ctx) => { ... })</code></p>
            <p><a href="/approach2/url123">Try /approach2/url123 →</a></p>
          </div>

          <div class="example">
            <h3>Approach 3: createRouteContext()</h3>
            <p><code>const ctx = createRouteContext(c)</code></p>
            <p><a href="/approach3/url123">Try /approach3/url123 →</a></p>
          </div>

          <hr style="margin: 40px 0;">
          <p><a href="/docs">View API documentation</a></p>
        </body>
        </html>
      `);
    }
  }
});

await db.usePlugin(apiPlugin);

console.log('Context access demo running at http://localhost:3000');
console.log('Try:');
console.log('  http://localhost:3000/approach1/url123');
console.log('  http://localhost:3000/approach2/url123');
console.log('  http://localhost:3000/approach3/url123');
console.log('  http://localhost:3000/docs');

process.stdin.resume();
