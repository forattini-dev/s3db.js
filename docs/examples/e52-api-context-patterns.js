/**
 * Example 52: API Plugin - Context Access Patterns
 *
 * Demonstrates the 3 different ways to access database and resources
 * in custom routes with the API Plugin.
 *
 * 1. Enhanced Context (Recommended) - Auto-injected with (c, ctx)
 * 2. Context Injection - Direct access via c.get()
 * 3. withContext Helper - Explicit wrapper with destructuring
 *
 * Run: node docs/examples/e52-api-context-patterns.js
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin, withContext } from '../../src/plugins/api/index.js';

async function main() {
  // Create database
  const db = new Database({
    connectionString: 'memory://api-context-demo/examples'
  });

  await db.connect();

  // Create resources
  const urls = await db.createResource({
    name: 'urls',
    attributes: {
      shortId: 'string|required',
      target: 'string|required|url',
      clicks: 'number|default:0'
    }
  });

  const clicks = await db.createResource({
    name: 'clicks',
    attributes: {
      urlId: 'string|required',
      timestamp: 'string|required',
      ip: 'string|optional'
    }
  });

  // Seed data
  await urls.insert({ shortId: 'demo123', target: 'https://example.com', clicks: 0 });

  console.log('✅ Created resources: urls, clicks\n');

  // ==============================================
  // Pattern 1: Enhanced Context (RECOMMENDED)
  // ==============================================
  console.log('📦 Pattern 1: Enhanced Context (Recommended)\n');

  const apiEnhanced = new ApiPlugin({
    port: 3001,
    verbose: false,
    docsEnabled: false,

    routes: {
      // ✨ Note: 2 parameters (c, ctx) triggers auto-wrapping!
      'GET /r/:id': async (c, ctx) => {
        console.log('  🔹 Enhanced Context Route Handler');

        // ✅ Clean resource access with Proxy validation
        const url = await ctx.resources.urls.get(ctx.param('id'));

        if (!url) {
          console.log('  ❌ URL not found');
          return ctx.notFound('Short URL not found');
        }

        console.log('  ✅ Found URL:', url.target);

        // ✅ Increment clicks using resource shortcut
        await ctx.resources.urls.update(url.id, {
          clicks: url.clicks + 1
        });

        // ✅ Track click event
        await ctx.resources.clicks.insert({
          urlId: url.id,
          timestamp: new Date().toISOString(),
          ip: ctx.header('x-forwarded-for') || '127.0.0.1'
        });

        console.log('  ✅ Tracked click\n');

        // ✅ Helper response methods
        return ctx.redirect(url.target, 302);
      },

      'GET /stats/:id': async (c, ctx) => {
        console.log('  🔹 Enhanced Context with Validation');

        // ✅ Param helper
        const shortId = ctx.param('id');

        // ✅ Resource Proxy automatically validates existence
        try {
          const url = await ctx.resources.urls.get(shortId);
          const clicksList = await ctx.resources.clicks.query({ urlId: url.id });

          console.log(`  ✅ URL has ${url.clicks} total clicks`);
          console.log(`  ✅ Found ${clicksList.length} click records\n`);

          // ✅ Success helper
          return ctx.success({
            url: url.target,
            clicks: url.clicks,
            events: clicksList.length
          });
        } catch (err) {
          console.log('  ❌ Error:', err.message);
          return ctx.error(err.message, 404);
        }
      },

      'POST /urls': async (c, ctx) => {
        console.log('  🔹 Enhanced Context with Validation');

        // ✅ Validator helper
        const { valid, errors, data } = await ctx.validator.validateBody('urls');

        if (!valid) {
          console.log('  ❌ Validation failed:', errors);
          return ctx.error(errors[0].message, 400);
        }

        console.log('  ✅ Validation passed');

        // ✅ Insert with validated data
        const url = await ctx.resources.urls.insert(data);

        console.log('  ✅ Created URL:', url.shortId, '\n');

        return ctx.success({ url }, 201);
      }
    }
  });

  await db.use(apiEnhanced, 'enhanced');

  console.log('✅ Enhanced Context API running on port 3001\n');
  console.log('Key Benefits:');
  console.log('  • Auto-injection (2 params triggers it)');
  console.log('  • Resource Proxy with validation');
  console.log('  • Request helpers (ctx.param, ctx.query, ctx.body)');
  console.log('  • Response helpers (ctx.success, ctx.error, ctx.notFound)');
  console.log('  • Validator helpers (ctx.validator.validateBody)');
  console.log('  • Auth helpers (ctx.user, ctx.hasScope)\n');

  // ==============================================
  // Pattern 2: Context Injection (Direct)
  // ==============================================
  console.log('📦 Pattern 2: Context Injection (Direct Access)\n');

  const apiDirect = new ApiPlugin({
    port: 3002,
    verbose: false,
    docsEnabled: false,

    routes: {
      // ⚠️ Note: 1 parameter (c) - no auto-wrapping
      'GET /r/:id': async (c) => {
        console.log('  🔹 Direct Injection Route Handler');

        // Direct resource access via c.get()
        const urls = c.get('urls');
        const clicks = c.get('clicks');

        const id = c.req.param('id');
        const url = await urls.get(id);

        if (!url) {
          console.log('  ❌ URL not found');
          return c.json({ error: 'Not found' }, 404);
        }

        console.log('  ✅ Found URL:', url.target);

        // Update clicks
        await urls.update(url.id, { clicks: url.clicks + 1 });

        // Track click
        await clicks.insert({
          urlId: url.id,
          timestamp: new Date().toISOString(),
          ip: c.req.header('x-forwarded-for') || '127.0.0.1'
        });

        console.log('  ✅ Tracked click\n');

        return c.redirect(url.target, 302);
      },

      'GET /health': async (c) => {
        console.log('  🔹 Simple Health Check');

        const db = c.get('db');
        const urls = c.get('urls');

        const count = await urls.count();

        console.log(`  ✅ Database healthy, ${count} URLs\n`);

        return c.json({ healthy: true, urls: count });
      }
    }
  });

  await db.use(apiDirect, 'direct');

  console.log('✅ Direct Injection API running on port 3002\n');
  console.log('Key Benefits:');
  console.log('  • Lightweight, minimal abstraction');
  console.log('  • Direct request context usage');
  console.log('  • Good for simple routes');
  console.log('  • No wrapper needed\n');

  // ==============================================
  // Pattern 3: withContext Helper
  // ==============================================
  console.log('📦 Pattern 3: withContext Helper (Destructuring)\n');

  const apiHelper = new ApiPlugin({
    port: 3003,
    verbose: false,
    docsEnabled: false,

    routes: {
      // ✨ Explicit wrapper with destructuring
      'GET /r/:id': withContext(async (c, { db, resources }) => {
        console.log('  🔹 withContext Helper Route');

        // Destructure exactly what you need
        const { urls, clicks } = resources;

        const id = c.req.param('id');
        const url = await urls.get(id);

        if (!url) {
          console.log('  ❌ URL not found');
          return c.json({ error: 'Not found' }, 404);
        }

        console.log('  ✅ Found URL:', url.target);

        await urls.update(url.id, { clicks: url.clicks + 1 });
        await clicks.insert({
          urlId: url.id,
          timestamp: new Date().toISOString(),
          ip: c.req.header('x-forwarded-for') || '127.0.0.1'
        });

        console.log('  ✅ Tracked click\n');

        return c.redirect(url.target, 302);
      }),

      'GET /stats': withContext(async (c, { resources }) => {
        console.log('  🔹 withContext Stats Route');

        // Clean destructuring
        const { urls, clicks } = resources;

        const allUrls = await urls.list({ limit: 10 });
        const totalClicks = await clicks.count();

        console.log(`  ✅ ${allUrls.length} URLs, ${totalClicks} total clicks\n`);

        return c.json({
          success: true,
          data: {
            urls: allUrls.length,
            clicks: totalClicks
          }
        });
      })
    }
  });

  await db.use(apiHelper, 'helper');

  console.log('✅ withContext Helper API running on port 3003\n');
  console.log('Key Benefits:');
  console.log('  • Explicit wrapper (you control it)');
  console.log('  • Clean destructuring syntax');
  console.log('  • Resource Proxy with validation');
  console.log('  • Functional programming style\n');

  // ==============================================
  // Test Routes
  // ==============================================
  console.log('🧪 Testing routes...\n');

  // Test enhanced context
  console.log('Testing Enhanced Context (3001):');
  const res1 = await fetch('http://localhost:3001/stats/demo123');
  const json1 = await res1.json();
  console.log('Response:', json1, '\n');

  // Test direct injection
  console.log('Testing Direct Injection (3002):');
  const res2 = await fetch('http://localhost:3002/health');
  const json2 = await res2.json();
  console.log('Response:', json2, '\n');

  // Test withContext helper
  console.log('Testing withContext Helper (3003):');
  const res3 = await fetch('http://localhost:3003/stats');
  const json3 = await res3.json();
  console.log('Response:', json3, '\n');

  // ==============================================
  // Comparison Summary
  // ==============================================
  console.log('📊 Context Pattern Comparison:\n');
  console.log('┌─────────────────────┬────────────┬──────────┬─────────────┐');
  console.log('│ Feature             │ Enhanced   │ Direct   │ withContext │');
  console.log('├─────────────────────┼────────────┼──────────┼─────────────┤');
  console.log('│ Auto-injection      │ ✅ (2 args)│ ❌       │ ❌          │');
  console.log('│ Resource Proxy      │ ✅         │ ❌       │ ✅          │');
  console.log('│ Request Helpers     │ ✅         │ ❌       │ ❌          │');
  console.log('│ Response Helpers    │ ✅         │ ❌       │ ❌          │');
  console.log('│ Validator Helpers   │ ✅         │ ❌       │ ❌          │');
  console.log('│ Auth Helpers        │ ✅         │ ⚠️       │ ⚠️          │');
  console.log('│ Best For            │ Custom     │ Simple   │ Explicit    │');
  console.log('└─────────────────────┴────────────┴──────────┴─────────────┘\n');

  console.log('💡 Recommendation: Use Enhanced Context (c, ctx) for most cases!\n');

  // Cleanup
  await db.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
