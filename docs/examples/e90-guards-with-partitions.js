/**
 * Example 90: API Plugin - Guards with Partition-based Tenant Isolation
 *
 * Demonstrates the NEW guard context enhancement that enables:
 * - Guards receiving full RouteContext instead of just user object
 * - O(1) tenant isolation via ctx.setPartition()
 * - Access to resources, param(), query(), and all context helpers
 * - Row-level security for multi-tenant applications
 *
 * Use Case: URL shortener where users can only see/edit their own URLs
 *
 * Run: node docs/examples/e90-guards-with-partitions.js
 */

import { Database, ApiPlugin } from '../../dist/s3db.es.js';

const db = new Database({
  connectionString: 'memory://',
  verbose: false
});

await db.connect();

// Create users resource
await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    email: 'string|required|email',
    apiToken: 'string|required',
    role: 'string|required',
    scopes: 'array|optional'
  },
  timestamps: true
});

// Create URLs resource with partition by userId (for O(1) tenant isolation)
await db.createResource({
  name: 'urls',
  attributes: {
    id: 'string|required',
    shortId: 'string|required',
    target: 'string|required',
    userId: 'string|required',
    clicks: 'number|default:0',
    active: 'boolean|default:true'
  },
  partitions: {
    byUserId: {
      fields: { userId: 'string' }
    }
  },
  timestamps: true
});

// Seed data: 2 users, 4 URLs (2 per user)
const users = db.resources.users;
const urls = db.resources.urls;

await users.insert({
  id: 'user1@example.com',
  email: 'user1@example.com',
  apiToken: 'token_user1',
  role: 'user',
  scopes: ['preset:user']
});

await users.insert({
  id: 'admin@example.com',
  email: 'admin@example.com',
  apiToken: 'token_admin',
  role: 'admin',
  scopes: ['preset:admin']
});

await urls.insert({
  id: 'url1',
  shortId: 'abc123',
  target: 'https://example.com/page1',
  userId: 'user1@example.com',
  clicks: 10
});

await urls.insert({
  id: 'url2',
  shortId: 'def456',
  target: 'https://example.com/page2',
  userId: 'user1@example.com',
  clicks: 5
});

await urls.insert({
  id: 'url3',
  shortId: 'ghi789',
  target: 'https://example.com/page3',
  userId: 'admin@example.com',
  clicks: 20
});

await urls.insert({
  id: 'url4',
  shortId: 'jkl012',
  target: 'https://example.com/page4',
  userId: 'admin@example.com',
  clicks: 15
});

console.log('✅ Seeded database: 2 users, 4 URLs (2 per user)');
console.log('');

// ============================================
// Configure Guards with RouteContext
// ============================================

/**
 * ✅ NEW: Guards receive RouteContext (ctx) instead of just user object
 *
 * Benefits:
 * - Access to ctx.user, ctx.resources, ctx.param(), ctx.query()
 * - Use ctx.setPartition() for O(1) tenant isolation
 * - Clean, dev-friendly API
 */
urls.guard = {
  /**
   * LIST: Filter by userId partition for tenant isolation
   * - Admin sees everything
   * - Regular user sees only their URLs (O(1) via partition!)
   */
  list: (ctx) => {
    console.log(`[Guard] list() - user: ${ctx.user.email}, role: ${ctx.user.role}`);

    // Admin bypasses filter
    if (ctx.user.scopes?.includes('preset:admin')) {
      console.log('[Guard] ✅ Admin - sees all URLs');
      return true;
    }

    // Regular user: filter by partition (O(1)!)
    console.log(`[Guard] ✅ User - filtered to userId=${ctx.user.id} (via partition)`);
    ctx.setPartition('byUserId', { userId: ctx.user.id });
    return true;
  },

  /**
   * CREATE: Auto-inject userId for tenant isolation
   * - Prevents users from creating URLs for other users
   */
  create: (ctx) => {
    console.log(`[Guard] create() - user: ${ctx.user.email}`);

    // Auto-inject userId (can't be overridden)
    ctx.c.req.body = ctx.c.req.body || {};
    ctx.c.req.body.userId = ctx.user.id;

    console.log(`[Guard] ✅ Auto-injected userId=${ctx.user.id}`);
    return true;
  },

  /**
   * UPDATE: Only owner or admin can update
   * - Receives (ctx, record) where record is the existing URL
   */
  update: async (ctx, record) => {
    console.log(`[Guard] update() - user: ${ctx.user.email}, urlId: ${record.id}`);

    // Admin can update anything
    if (ctx.user.scopes?.includes('preset:admin')) {
      console.log('[Guard] ✅ Admin - can update any URL');
      return true;
    }

    // User can only update their own URLs
    if (record.userId !== ctx.user.id) {
      console.log(`[Guard] ❌ Forbidden - URL belongs to ${record.userId}, not ${ctx.user.id}`);
      throw new Error('Forbidden: You can only update your own URLs');
    }

    console.log('[Guard] ✅ User owns this URL');
    return true;
  },

  /**
   * DELETE: Only owner or admin can delete
   */
  delete: async (ctx, record) => {
    console.log(`[Guard] delete() - user: ${ctx.user.email}, urlId: ${record.id}`);

    // Admin can delete anything
    if (ctx.user.scopes?.includes('preset:admin')) {
      console.log('[Guard] ✅ Admin - can delete any URL');
      return true;
    }

    // User can only delete their own URLs
    if (record.userId !== ctx.user.id) {
      console.log(`[Guard] ❌ Forbidden - URL belongs to ${record.userId}, not ${ctx.user.id}`);
      throw new Error('Forbidden: You can only delete your own URLs');
    }

    console.log('[Guard] ✅ User owns this URL');
    return true;
  }
};

// ============================================
// Setup API Plugin
// ============================================

await db.use(new ApiPlugin({
  port: 3108,
  verbose: true,

  // Basic Auth for testing
  auth: {
    drivers: [{
      driver: 'basic',
      config: {
        usernameField: 'email',
        passwordField: 'apiToken'
      }
    }],
    resource: 'users',
    pathRules: [
      { path: '/v1/**', methods: ['basic'], required: true }
    ]
  },

  // Enable auto-generated CRUD routes for urls resource
  resources: {
    urls: {
      api: {
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
      }
    }
  }
}));

console.log('✅ API Plugin running at http://localhost:3108');
console.log('');
console.log('📋 Test Commands:');
console.log('');

console.log('# 1️⃣ Regular User (user1@example.com) - sees only their 2 URLs');
console.log('curl -u "user1@example.com:token_user1" http://localhost:3108/v1/urls');
console.log('# Should return: url1, url2 (2 URLs)');
console.log('');

console.log('# 2️⃣ Admin (admin@example.com) - sees all 4 URLs');
console.log('curl -u "admin@example.com:token_admin" http://localhost:3108/v1/urls');
console.log('# Should return: url1, url2, url3, url4 (4 URLs)');
console.log('');

console.log('# 3️⃣ Create URL as user1 - userId auto-injected');
console.log('curl -u "user1@example.com:token_user1" -X POST http://localhost:3108/v1/urls \\');
console.log('  -H "Content-Type: application/json" \\');
console.log('  -d \'{"shortId":"new123","target":"https://example.com/new"}\'');
console.log('# userId will be auto-set to user1@example.com');
console.log('');

console.log('# 4️⃣ Try to update URL owned by admin - should FAIL');
console.log('curl -u "user1@example.com:token_user1" -X PUT http://localhost:3108/v1/urls/url3 \\');
console.log('  -H "Content-Type: application/json" \\');
console.log('  -d \'{"clicks":999}\'');
console.log('# Should return 403 Forbidden');
console.log('');

console.log('# 5️⃣ Admin updates any URL - should WORK');
console.log('curl -u "admin@example.com:token_admin" -X PUT http://localhost:3108/v1/urls/url1 \\');
console.log('  -H "Content-Type: application/json" \\');
console.log('  -d \'{"clicks":100}\'');
console.log('# Should succeed');
console.log('');

console.log('🎯 Key Features Demonstrated:');
console.log('  ✅ Guards receive full RouteContext (not just user)');
console.log('  ✅ O(1) tenant isolation via ctx.setPartition()');
console.log('  ✅ Auto-inject userId in create guard');
console.log('  ✅ Row-level ownership checks in update/delete');
console.log('  ✅ Admin bypass for all operations');
console.log('  ✅ Clean, dev-friendly guard API');
console.log('');
