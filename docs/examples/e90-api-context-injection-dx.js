/**
 * Example 90: API Plugin - Context Injection Developer Experience
 *
 * Demonstrates the 3 approaches for accessing database resources in custom routes:
 *
 * 1. Direct Injection (Approach 1) - Most straightforward
 * 2. withContextHelper (Approach 2) - Destructuring-friendly
 * 3. RouteContext (Approach 3) - TypeScript-friendly with enhanced API
 *
 * All approaches provide clean, intuitive access to resources without verbose boilerplate.
 *
 * Run: node docs/examples/e90-api-context-injection-dx.js
 * Test: curl http://localhost:3000/approach1/url123
 *       curl http://localhost:3000/approach2/url123
 *       curl http://localhost:3000/approach3/url123
 */

import { Database, ApiPlugin } from '../../src/index.js';
import { withContextHelper, RouteContext } from '../../src/plugins/api/index.js';

// ============================================
// Setup Database & Resources
// ============================================

const db = new Database({
  connectionString: 'memory://example-context-dx/api-dx'
});

await db.connect();

// Create URLs resource
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

// Create clicks resource
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

// Seed data
const urlsResource = db.resources.urls;
const clicksResource = db.resources.clicks;

await urlsResource.insert({
  id: 'url123',
  target: 'https://example.com',
  clicks: 5,
  userId: 'user1'
});

await clicksResource.insert({
  id: 'click1',
  urlId: 'url123',
  userId: 'user1',
  timestamp: new Date().toISOString(),
  country: 'US'
});

await clicksResource.insert({
  id: 'click2',
  urlId: 'url123',
  userId: 'user2',
  timestamp: new Date().toISOString(),
  country: 'BR'
});

console.log('✅ Database setup complete\n');

// ============================================
// APPROACH 1: Direct Context Injection
// ============================================

const approach1Routes = {
  'GET /approach1/:id': async (c) => {
    // ✅ Clean! Resources injected directly via context injection middleware
    const urls = c.get('urls');
    const clicks = c.get('clicks');
    const id = c.req.param('id');

    console.log('[Approach 1] Accessing resources via c.get()');

    const url = await urls.get(id);
    if (!url) {
      return c.json({ success: false, error: 'URL not found' }, 404);
    }

    const urlClicks = await clicks.query({ urlId: id });

    return c.json({
      approach: 'Direct Injection',
      success: true,
      data: {
        url,
        clickCount: urlClicks.length,
        clicks: urlClicks
      }
    });
  }
};

// ============================================
// APPROACH 2: withContextHelper (Destructuring)
// ============================================

const approach2Routes = {
  'GET /approach2/:id': withContextHelper(async (c, { db, resources }) => {
    // ✅ Super clean with destructuring!
    const { urls, clicks } = resources;
    const id = c.req.param('id');

    console.log('[Approach 2] Using withContextHelper with destructuring');

    const url = await urls.get(id);
    if (!url) {
      return c.json({ success: false, error: 'URL not found' }, 404);
    }

    const urlClicks = await clicks.query({ urlId: id });

    return c.json({
      approach: 'withContextHelper (Destructuring)',
      success: true,
      data: {
        url,
        clickCount: urlClicks.length,
        clicks: urlClicks
      }
    });
  })
};

// ============================================
// APPROACH 3: RouteContext (TypeScript-Friendly)
// ============================================

const approach3Routes = {
  'GET /approach3/:id': async (c) => {
    // ✅ Enhanced API with helper methods
    const ctx = new RouteContext(c, c.get('db'));
    const id = ctx.param('id');

    console.log('[Approach 3] Using RouteContext class');

    // Access resources via ctx.r (resource proxy)
    const url = await ctx.r.urls.get(id);
    if (!url) {
      return ctx.error('URL not found', 404);
    }

    const urlClicks = await ctx.r.clicks.query({ urlId: id });

    // Use helper methods for responses
    return ctx.success({
      approach: 'RouteContext (TypeScript-Friendly)',
      url,
      clickCount: urlClicks.length,
      clicks: urlClicks
    });
  }
};

// ============================================
// COMPARISON: Old Way (Before Improvements)
// ============================================

const oldWayRoutes = {
  'GET /oldway/:id': async (c) => {
    // ❌ Verbose! Had to extract context manually
    const context = c.get('customRouteContext');
    const { database } = context;
    const urls = database.resources.urls;
    const clicks = database.resources.clicks;
    const id = c.req.param('id');

    console.log('[Old Way] Verbose context extraction');

    const url = await urls.get(id);
    if (!url) {
      return c.json({ success: false, error: 'URL not found' }, 404);
    }

    const urlClicks = await clicks.query({ urlId: id });

    return c.json({
      approach: 'Old Way (Verbose)',
      success: true,
      data: {
        url,
        clickCount: urlClicks.length,
        clicks: urlClicks
      }
    });
  }
};

// ============================================
// Start API Plugin
// ============================================

const apiPlugin = new ApiPlugin({
  port: 3000,
  verbose: true,
  docs: { enabled: true },
  routes: {
    ...approach1Routes,
    ...approach2Routes,
    ...approach3Routes,
    ...oldWayRoutes,

    // Landing page with examples
    'GET /': async (c) => {
      return c.html(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Context Injection DX Demo</title>
          <style>
            body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
            h1 { color: #00AF55; }
            .example { background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 8px; }
            .example h3 { margin-top: 0; color: #333; }
            .example a { color: #0066cc; text-decoration: none; font-weight: bold; }
            .example a:hover { text-decoration: underline; }
            .old { opacity: 0.6; }
            code { background: #e0e0e0; padding: 2px 6px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <h1>🚀 Context Injection Developer Experience</h1>
          <p>Compare the 3 new approaches vs the old verbose way:</p>

          <div class="example">
            <h3>✅ Approach 1: Direct Injection</h3>
            <p><code>const urls = c.get('urls')</code> - Most straightforward</p>
            <p><a href="/approach1/url123">Try /approach1/url123 →</a></p>
          </div>

          <div class="example">
            <h3>✅ Approach 2: withContextHelper</h3>
            <p><code>withContextHelper(async (c, { resources }) => { ... })</code> - Destructuring-friendly</p>
            <p><a href="/approach2/url123">Try /approach2/url123 →</a></p>
          </div>

          <div class="example">
            <h3>✅ Approach 3: RouteContext</h3>
            <p><code>const ctx = new RouteContext(c, c.get('db'))</code> - TypeScript-friendly</p>
            <p><a href="/approach3/url123">Try /approach3/url123 →</a></p>
          </div>

          <div class="example old">
            <h3>❌ Old Way (Before Improvements)</h3>
            <p><code>const context = c.get('customRouteContext'); const { database } = context;</code> - Verbose!</p>
            <p><a href="/oldway/url123">Try /oldway/url123 →</a></p>
          </div>

          <hr style="margin: 40px 0;">

          <h2>📊 Comparison Table</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #00AF55; color: white;">
                <th style="padding: 10px; text-align: left;">Approach</th>
                <th style="padding: 10px; text-align: left;">Verbosity</th>
                <th style="padding: 10px; text-align: left;">TypeScript</th>
                <th style="padding: 10px; text-align: left;">DX Score</th>
              </tr>
            </thead>
            <tbody>
              <tr style="background: #f9f9f9;">
                <td style="padding: 10px;"><strong>Direct Injection</strong></td>
                <td style="padding: 10px;">⭐⭐⭐⭐⭐</td>
                <td style="padding: 10px;">⭐⭐⭐</td>
                <td style="padding: 10px;">9/10</td>
              </tr>
              <tr>
                <td style="padding: 10px;"><strong>withContextHelper</strong></td>
                <td style="padding: 10px;">⭐⭐⭐⭐</td>
                <td style="padding: 10px;">⭐⭐⭐⭐</td>
                <td style="padding: 10px;">9/10</td>
              </tr>
              <tr style="background: #f9f9f9;">
                <td style="padding: 10px;"><strong>RouteContext</strong></td>
                <td style="padding: 10px;">⭐⭐⭐⭐⭐</td>
                <td style="padding: 10px;">⭐⭐⭐⭐⭐</td>
                <td style="padding: 10px;">10/10</td>
              </tr>
              <tr style="opacity: 0.5;">
                <td style="padding: 10px;"><strong>Old Way</strong></td>
                <td style="padding: 10px;">⭐</td>
                <td style="padding: 10px;">⭐</td>
                <td style="padding: 10px;">3/10</td>
              </tr>
            </tbody>
          </table>

          <hr style="margin: 40px 0;">

          <p><a href="/docs">📖 View API Documentation</a></p>
        </body>
        </html>
      `);
    }
  }
});

await db.usePlugin(apiPlugin);

console.log('\n🎯 Demo server running at http://localhost:3000');
console.log('\n📝 Try these routes:');
console.log('  http://localhost:3000/approach1/url123  (Direct Injection)');
console.log('  http://localhost:3000/approach2/url123  (withContextHelper)');
console.log('  http://localhost:3000/approach3/url123  (RouteContext)');
console.log('  http://localhost:3000/oldway/url123     (Old Way - Compare!)');
console.log('\n📖 Docs: http://localhost:3000/docs\n');

// Keep process alive
process.stdin.resume();
