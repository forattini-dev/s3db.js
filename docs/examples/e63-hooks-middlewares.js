/**
 * Example 63: Hooks & Middlewares - Complete Guide
 *
 * Demonstrates both hooks and middlewares in s3db.js:
 *
 * HOOKS - Event-based callbacks for ALL methods:
 * - beforeInsert, afterInsert
 * - beforeUpdate, afterUpdate
 * - beforeDelete, afterDelete
 * - beforeGet, afterGet
 * - beforeList, afterList
 * - beforeQuery, afterQuery
 * - beforeExists, afterExists
 * - beforeCount, afterCount
 * - beforePatch, afterPatch
 * - beforeReplace, afterReplace
 * - beforeGetMany, afterGetMany
 * - beforeDeleteMany, afterDeleteMany
 * - Triggered at specific lifecycle events
 * - Modify data, add side effects
 *
 * MIDDLEWARES - Interceptor pattern:
 * - Wraps ALL resource methods (get, list, insert, update, etc.)
 * - next() pattern (like Express.js)
 * - Can block operations, modify data, add logging
 * - Applied globally or per-method
 *
 * To run with LocalStack:
 *   1. Start: localstack start
 *   2. Run: node docs/examples/e63-hooks-middlewares.js
 */

import { Database } from '../../src/index.js';

console.log('\n🚀 Hooks & Middlewares - Complete Guide\n');

// ============================================================================
// Setup
// ============================================================================

const connectionString = 's3://test:test@hooks-demo?region=us-east-1&endpoint=http://localhost:4566&forcePathStyle=true';
const db = new Database({ connectionString });

try {
  await db.connect();
  console.log('✅ Connected to database\n');
} catch (error) {
  console.error('❌ Failed to connect');
  console.error('Make sure LocalStack is running: localstack start\n');
  process.exit(1);
}

// ============================================================================
// PART 1: HOOKS - Event-based Callbacks
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Part 1: Hooks - Event-based Callbacks');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|required|email',
    role: 'string|default:user',
    createdBy: 'string',
    viewCount: 'number|default:0'
  },
  timestamps: true,

  // HOOKS configuration - ALL methods now supported!
  hooks: {
    // ========== Insert Hooks ==========
    beforeInsert: [
      async function(data) {
        console.log('  🪝 beforeInsert hook #1: Adding metadata');
        data.createdBy = 'system';
        return data;
      },
      async function(data) {
        console.log('  🪝 beforeInsert hook #2: Validating email domain');
        if (!data.email.endsWith('@company.com')) {
          throw new Error('Only @company.com emails allowed');
        }
        return data;
      }
    ],

    afterInsert: [
      async function(data) {
        console.log('  🪝 afterInsert hook: Sending welcome email');
        console.log(`     📧 Email sent to ${data.email}`);
        return data;
      }
    ],

    // ========== Update Hooks ==========
    beforeUpdate: [
      async function(data) {
        console.log('  🪝 beforeUpdate hook: Validating update');
        if (data.role === 'admin' && !data.approvedBy) {
          throw new Error('Admin role requires approval');
        }
        return data;
      }
    ],

    afterUpdate: [
      async function(data) {
        console.log('  🪝 afterUpdate hook: Logging change');
        console.log(`     📝 User ${data.id} updated at ${data.updatedAt}`);
        return data;
      }
    ],

    // ========== Delete Hooks ==========
    beforeDelete: [
      async function(data) {
        console.log('  🪝 beforeDelete hook: Checking dependencies');
        // Could check if user has posts, etc.
        return data;
      }
    ],

    afterDelete: [
      async function(data) {
        console.log('  🪝 afterDelete hook: Cleanup');
        console.log(`     🗑️  User ${data.id} deleted, cleaning up...`);
        return data;
      }
    ],

    // ========== NEW: Get Hooks ==========
    beforeGet: [
      async function(params) {
        console.log(`  🪝 beforeGet hook: Requesting user ${params.id}`);
        return params;
      }
    ],

    afterGet: [
      async function(data) {
        console.log('  🪝 afterGet hook: Incrementing view count');
        // Could track analytics
        return data;
      }
    ],

    // ========== NEW: List Hooks ==========
    beforeList: [
      async function(params) {
        console.log(`  🪝 beforeList hook: Listing users (limit: ${params.limit || 'all'})`);
        return params;
      }
    ],

    afterList: [
      async function(results) {
        console.log(`  🪝 afterList hook: Found ${results.length} users`);
        return results;
      }
    ],

    // ========== NEW: Query Hooks ==========
    beforeQuery: [
      async function(params) {
        console.log(`  🪝 beforeQuery hook: Querying with filter:`, params.filter);
        return params;
      }
    ],

    afterQuery: [
      async function(results) {
        console.log(`  🪝 afterQuery hook: Query returned ${results.length} results`);
        return results;
      }
    ],

    // ========== NEW: Count Hooks ==========
    beforeCount: [
      async function(params) {
        console.log('  🪝 beforeCount hook: Counting resources...');
        return params;
      }
    ],

    afterCount: [
      async function(params) {
        console.log(`  🪝 afterCount hook: Count = ${params.count}`);
        return params;
      }
    ],

    // ========== NEW: Patch Hooks ==========
    beforePatch: [
      async function(params) {
        console.log(`  🪝 beforePatch hook: Patching ${params.id}`);
        return params;
      }
    ],

    afterPatch: [
      async function(data) {
        console.log(`  🪝 afterPatch hook: Patch completed for ${data.id}`);
        return data;
      }
    ],

    // ========== NEW: Replace Hooks ==========
    beforeReplace: [
      async function(params) {
        console.log(`  🪝 beforeReplace hook: Replacing ${params.id}`);
        return params;
      }
    ],

    afterReplace: [
      async function(data) {
        console.log(`  🪝 afterReplace hook: Replace completed for ${data.id}`);
        return data;
      }
    ]
  }
});

console.log('🔹 Testing Hooks:\n');

// Test beforeInsert + afterInsert hooks
console.log('1. Inserting user (triggers beforeInsert + afterInsert):');
try {
  const user1 = await users.insert({
    name: 'Alice',
    email: 'alice@company.com'
  });
  console.log(`   ✅ User created: ${user1.id}\n`);
} catch (err) {
  console.error(`   ❌ Error: ${err.message}\n`);
}

// Test hook validation failure
console.log('2. Inserting with invalid email (fails beforeInsert hook):');
try {
  await users.insert({
    name: 'Bob',
    email: 'bob@gmail.com'  // Not @company.com!
  });
} catch (err) {
  console.error(`   ❌ Hook blocked insert: ${err.message}\n`);
}

// Test update hooks
console.log('3. Updating user (triggers beforeUpdate + afterUpdate):');
const user1 = await users.list({ limit: 1 });
if (user1[0]) {
  try {
    await users.update(user1[0].id, {
      name: 'Alice Updated'
    });
    console.log(`   ✅ User updated\n`);
  } catch (err) {
    console.error(`   ❌ Error: ${err.message}\n`);
  }
}

// Test NEW hooks: get, list, query, count
console.log('4. Testing NEW hooks - Get (triggers beforeGet + afterGet):');
if (user1[0]) {
  await users.get(user1[0].id);
  console.log(`   ✅ User retrieved\n`);
}

console.log('5. Testing NEW hooks - List (triggers beforeList + afterList):');
await users.list({ limit: 10 });
console.log(`   ✅ List completed\n`);

console.log('6. Testing NEW hooks - Query (triggers beforeQuery + afterQuery):');
await users.query({ role: 'user' });
console.log(`   ✅ Query completed\n`);

console.log('7. Testing NEW hooks - Count (triggers beforeCount + afterCount):');
await users.count();
console.log(`   ✅ Count completed\n`);

console.log('8. Testing NEW hooks - Patch (triggers beforePatch + afterPatch):');
if (user1[0]) {
  await users.patch(user1[0].id, { viewCount: 5 });
  console.log(`   ✅ Patch completed\n`);
}

// ============================================================================
// PART 2: MIDDLEWARES - Interceptor Pattern
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Part 2: Middlewares - Interceptor Pattern');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🔹 Format 1: Array of Global Middlewares\n');

const posts = await db.createResource({
  name: 'posts',
  attributes: {
    userId: 'string|required',
    title: 'string|required',
    content: 'string|required',
    published: 'boolean|default:false'
  },
  timestamps: true,

  // MIDDLEWARES - Array format (applies to ALL methods)
  middlewares: [
    // Middleware 1: Logger
    async (ctx, next) => {
      const start = Date.now();
      console.log(`  🔧 [Logger] ${ctx.method}() called with:`, JSON.stringify(ctx.args).slice(0, 100));

      const result = await next();  // Call next middleware or original method

      const duration = Date.now() - start;
      console.log(`  🔧 [Logger] ${ctx.method}() completed in ${duration}ms`);
      return result;
    },

    // Middleware 2: Permission check
    async (ctx, next) => {
      if (ctx.method === 'delete') {
        console.log(`  🔧 [Auth] Checking delete permission...`);
        // Could check user permissions here
        const allowed = true;  // Simulate check
        if (!allowed) {
          throw new Error('Permission denied');
        }
      }

      return await next();
    },

    // Middleware 3: Data sanitizer
    async (ctx, next) => {
      if (ctx.method === 'insert' || ctx.method === 'update') {
        console.log(`  🔧 [Sanitizer] Cleaning HTML from content...`);
        // Modify data before insert/update
        if (ctx.args[0]?.content) {
          ctx.args[0].content = ctx.args[0].content.replace(/<[^>]*>/g, '');
        }
      }

      return await next();
    }
  ]
});

console.log('Testing global middlewares:\n');
console.log('1. Insert post (triggers all 3 middlewares):');
const post1 = await posts.insert({
  userId: user1[0].id,
  title: 'My First Post',
  content: '<script>alert("xss")</script>Hello World!'  // Will be sanitized
});
console.log(`   ✅ Post created: ${post1.id}\n`);

console.log('2. Get post (triggers logger middleware):');
await posts.get(post1.id);
console.log(`   ✅ Post retrieved\n`);

// ============================================================================
// PART 3: Method-specific Middlewares
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Part 3: Method-specific Middlewares');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🔹 Format 2: Object with Method-specific Middlewares\n');

const comments = await db.createResource({
  name: 'comments',
  attributes: {
    postId: 'string|required',
    userId: 'string|required',
    content: 'string|required',
    approved: 'boolean|default:false'
  },
  timestamps: true,

  // MIDDLEWARES - Object format (method-specific)
  middlewares: {
    // Apply only to insert
    insert: [
      async (ctx, next) => {
        console.log('  🔧 [Insert Middleware] Auto-moderating comment...');
        // Auto-reject comments with spam words
        if (ctx.args[0]?.content?.toLowerCase().includes('spam')) {
          throw new Error('Comment rejected: spam detected');
        }
        return await next();
      }
    ],

    // Apply only to update
    update: [
      async (ctx, next) => {
        console.log('  🔧 [Update Middleware] Tracking changes...');
        // Could log changes to audit table
        return await next();
      }
    ],

    // Apply to ALL methods using '*'
    '*': [
      async (ctx, next) => {
        console.log(`  🔧 [Global] ${ctx.method}() on comments`);
        return await next();
      }
    ]
  }
});

console.log('Testing method-specific middlewares:\n');

console.log('1. Insert comment (triggers insert + global middlewares):');
try {
  const comment1 = await comments.insert({
    postId: post1.id,
    userId: user1[0].id,
    content: 'Great post!'
  });
  console.log(`   ✅ Comment created: ${comment1.id}\n`);
} catch (err) {
  console.error(`   ❌ Error: ${err.message}\n`);
}

console.log('2. Insert spam comment (blocked by insert middleware):');
try {
  await comments.insert({
    postId: post1.id,
    userId: user1[0].id,
    content: 'Buy spam products now!'
  });
} catch (err) {
  console.error(`   ❌ Middleware blocked: ${err.message}\n`);
}

// ============================================================================
// PART 4: Combining Hooks and Middlewares
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Part 4: Hooks vs Middlewares - When to Use');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log(`
┌─────────────────────────────────────────────────────────────┐
│ HOOKS - Event-based Callbacks                               │
├─────────────────────────────────────────────────────────────┤
│ ✅ When to use:                                             │
│   • Modify data during lifecycle events                    │
│   • Add side effects (send email, log, notify)             │
│   • Validate before operations                             │
│   • Cleanup after operations                               │
│   • Track analytics (view counts, access logs)             │
│                                                              │
│ 📝 ALL Available Hooks (before* / after*):                 │
│   • Insert:  beforeInsert, afterInsert                     │
│   • Update:  beforeUpdate, afterUpdate                     │
│   • Delete:  beforeDelete, afterDelete                     │
│   • Get:     beforeGet, afterGet                           │
│   • List:    beforeList, afterList                         │
│   • Query:   beforeQuery, afterQuery                       │
│   • Exists:  beforeExists, afterExists                     │
│   • Count:   beforeCount, afterCount                       │
│   • Patch:   beforePatch, afterPatch                       │
│   • Replace: beforeReplace, afterReplace                   │
│   • GetMany: beforeGetMany, afterGetMany                   │
│   • DeleteMany: beforeDeleteMany, afterDeleteMany          │
│                                                              │
│ ⚡ Execution order:                                         │
│   1. before{Method} hook(s)                                │
│   2. Actual operation                                      │
│   3. after{Method} hook(s)                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ MIDDLEWARES - Interceptor Pattern                          │
├─────────────────────────────────────────────────────────────┤
│ ✅ When to use:                                             │
│   • Cross-cutting concerns (logging, auth, metrics)        │
│   • Request/response transformation                        │
│   • Performance monitoring                                 │
│   • Caching layer                                          │
│   • Rate limiting                                          │
│                                                              │
│ 📝 Methods:                                                 │
│   • get, list, query, insert, update, delete              │
│   • ALL resource methods supported                        │
│                                                              │
│ ⚡ Execution order:                                         │
│   1. Middleware #1 (before next())                        │
│   2. Middleware #2 (before next())                        │
│   3. Original method                                       │
│   4. Middleware #2 (after next())                         │
│   5. Middleware #1 (after next())                         │
└─────────────────────────────────────────────────────────────┘

💡 Best Practice: Use BOTH together!
   • Hooks for data-specific logic
   • Middlewares for cross-cutting concerns
`);

// ============================================================================
// PART 5: Real-world Example
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Part 5: Real-world Example - Production-ready Setup');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('Creating orders resource with hooks + middlewares:\n');

const orders = await db.createResource({
  name: 'orders',
  attributes: {
    userId: 'string|required',
    total: 'number|required',
    status: 'string|default:pending',
    items: 'array'
  },
  timestamps: true,

  // Hooks for business logic
  hooks: {
    beforeInsert: [
      async function(data) {
        // Calculate total
        data.total = data.items?.reduce((sum, item) => sum + item.price, 0) || 0;
        return data;
      }
    ],

    afterInsert: [
      async function(data) {
        // Send order confirmation
        console.log(`  📧 Order confirmation sent for order ${data.id}`);
        return data;
      }
    ],

    afterUpdate: [
      async function(data) {
        // Notify if status changed
        if (data.status === 'shipped') {
          console.log(`  📦 Shipping notification sent for order ${data.id}`);
        }
        return data;
      }
    ]
  },

  // Middlewares for cross-cutting concerns
  middlewares: {
    // Audit all operations
    '*': [
      async (ctx, next) => {
        const auditEntry = {
          timestamp: new Date().toISOString(),
          operation: ctx.method,
          resource: 'orders',
          args: JSON.stringify(ctx.args).slice(0, 200)
        };
        console.log(`  📝 [Audit] ${JSON.stringify(auditEntry)}`);
        return await next();
      }
    ],

    // Cache read operations
    get: [
      async (ctx, next) => {
        const cacheKey = `order:${ctx.args[0]}`;
        // Check cache first
        console.log(`  🔍 [Cache] Checking cache for ${cacheKey}...`);
        const result = await next();
        // Store in cache after
        console.log(`  💾 [Cache] Stored ${cacheKey} in cache`);
        return result;
      }
    ]
  }
});

console.log('Testing production setup:\n');

const order1 = await orders.insert({
  userId: user1[0].id,
  items: [
    { name: 'Product A', price: 29.99 },
    { name: 'Product B', price: 49.99 }
  ]
});
console.log(`✅ Order created: ${order1.id}, Total: $${order1.total}\n`);

await orders.get(order1.id);
console.log(`✅ Order retrieved from cache\n`);

// ============================================================================
// Summary
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Summary');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('✅ Hooks Configuration:');
console.log('   hooks: {');
console.log('     beforeInsert: [fn1, fn2],');
console.log('     afterInsert: [fn3]');
console.log('   }\n');

console.log('✅ Middlewares Configuration (Format 1 - Global):');
console.log('   middlewares: [fn1, fn2, fn3]\n');

console.log('✅ Middlewares Configuration (Format 2 - Method-specific):');
console.log('   middlewares: {');
console.log('     insert: [fn1, fn2],');
console.log('     "*": [fnGlobal]');
console.log('   }\n');

console.log('🎯 Key Differences:');
console.log('   • Hooks: Event-based, lifecycle-specific');
console.log('   • Middlewares: Method-based, next() pattern\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

process.exit(0);
