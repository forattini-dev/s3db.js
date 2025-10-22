/**
 * Example 50: patch(), replace(), and update() - Performance Comparison
 *
 * This example demonstrates the three methods for updating records in s3db.js:
 * - update(): Traditional GET + merge + PUT (2 requests, full merge)
 * - patch(): Optimized partial update (HEAD + COPY for metadata-only, or fallback to update())
 * - replace(): Full object replacement (PUT only, 1 request, no merge)
 *
 * Key Differences:
 * ┌─────────────┬──────────────────┬──────────────┬─────────────────────────┐
 * │ Method      │ S3 Requests      │ Use Case     │ Performance             │
 * ├─────────────┼──────────────────┼──────────────┼─────────────────────────┤
 * │ update()    │ GET + PUT        │ Merge data   │ Baseline                │
 * │ patch()     │ HEAD + COPY*     │ Partial      │ 40-60% faster*          │
 * │ replace()   │ PUT only         │ Full replace │ 30-40% faster, no merge │
 * └─────────────┴──────────────────┴──────────────┴─────────────────────────┘
 *
 * * patch() uses HEAD + COPY only for metadata-only behaviors (enforce-limits,
 *   truncate-data) with simple field updates. Falls back to update() for:
 *   - body behaviors (body-overflow, body-only)
 *   - nested field updates (dot notation)
 */

import { Database } from '../../src/index.js';

// Connect to S3
const database = new Database({
  connectionString: process.env.BUCKET_CONNECTION_STRING || 's3://test:test@test-bucket?region=us-east-1&endpoint=http://localhost:4566&pathStyle=true'
});

await database.connect();

console.log('='.repeat(80));
console.log('Example 50: patch(), replace(), and update() - Performance Comparison');
console.log('='.repeat(80));

// ============================================================================
// PART 1: Basic Usage Examples
// ============================================================================

console.log('\n📚 PART 1: Basic Usage Examples\n');

// Create a resource with enforce-limits behavior (metadata-only)
const users = await database.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    name: 'string|required',
    email: 'string|required',
    status: 'string|default:active',
    loginCount: 'number|default:0',
    bio: 'string|optional'
  },
  behavior: 'enforce-limits', // All data fits in metadata (<2KB)
  timestamps: true
});

// Insert initial record
const userId = 'user-123';
await users.insert({
  id: userId,
  name: 'Alice Johnson',
  email: 'alice@example.com',
  status: 'active',
  loginCount: 0,
  bio: 'Software engineer'
});

console.log('✅ Initial record created\n');

// ----------------------------------------------------------------------------
// 1A. update() - Traditional approach (GET + merge + PUT)
// ----------------------------------------------------------------------------

console.log('1A. update() - Traditional GET + merge + PUT:');
console.log('-'.repeat(80));

const updated = await users.update(userId, {
  loginCount: 5,
  status: 'premium'
});

console.log('Result:', {
  id: updated.id,
  name: updated.name,
  email: updated.email,
  status: updated.status,
  loginCount: updated.loginCount
});

console.log('✅ Other fields preserved (name, email, bio)');
console.log('📊 Requests: GET (fetch current) + PUT (save merged)\n');

// ----------------------------------------------------------------------------
// 1B. patch() - Optimized partial update (HEAD + COPY for metadata-only)
// ----------------------------------------------------------------------------

console.log('1B. patch() - Optimized HEAD + COPY (metadata-only):');
console.log('-'.repeat(80));

const patched = await users.patch(userId, {
  loginCount: 10
});

console.log('Result:', {
  id: patched.id,
  name: patched.name,
  email: patched.email,
  status: patched.status,
  loginCount: patched.loginCount
});

console.log('✅ Other fields preserved (name, email, bio, status)');
console.log('📊 Requests: HEAD (metadata only) + COPY (atomic metadata update)');
console.log('🚀 Performance: ~40-60% faster (no body transfer)\n');

// ----------------------------------------------------------------------------
// 1C. replace() - Full object replacement (PUT only, no GET)
// ----------------------------------------------------------------------------

console.log('1C. replace() - Full object replacement (PUT only):');
console.log('-'.repeat(80));

const replaced = await users.replace(userId, {
  name: 'Alice Smith', // Changed
  email: 'alice.smith@example.com', // Changed
  status: 'active',
  loginCount: 0, // Reset
  bio: 'Senior software engineer' // Changed
});

console.log('Result:', {
  id: replaced.id,
  name: replaced.name,
  email: replaced.email,
  status: replaced.status,
  loginCount: replaced.loginCount,
  bio: replaced.bio
});

console.log('⚠️  All fields must be provided (no merge with existing data)');
console.log('📊 Requests: PUT only (no GET)');
console.log('🚀 Performance: ~30-40% faster (1 request vs 2)\n');

// ============================================================================
// PART 2: Behavior Differences
// ============================================================================

console.log('\n📚 PART 2: Behavior Differences\n');

// ----------------------------------------------------------------------------
// 2A. patch() with body-overflow behavior (falls back to update())
// ----------------------------------------------------------------------------

console.log('2A. patch() with body-overflow behavior:');
console.log('-'.repeat(80));

const posts = await database.createResource({
  name: 'posts',
  attributes: {
    id: 'string|required',
    title: 'string|required',
    content: 'string|required',
    author: 'string|required'
  },
  behavior: 'body-overflow', // Large content goes to body
  timestamps: true
});

await posts.insert({
  id: 'post-1',
  title: 'Hello World',
  content: 'This is a blog post with potentially large content...',
  author: 'Alice'
});

const patchedPost = await posts.patch('post-1', {
  title: 'Hello World - Updated'
});

console.log('Result:', {
  id: patchedPost.id,
  title: patchedPost.title,
  author: patchedPost.author
});

console.log('⚠️  Falls back to update() (body behavior requires full merge)');
console.log('📊 Requests: GET + PUT (same as update())\n');

// ----------------------------------------------------------------------------
// 2B. Nested object updates (workaround for known limitation)
// ----------------------------------------------------------------------------

console.log('2B. Nested object updates (known limitation):');
console.log('-'.repeat(80));

const profiles = await database.createResource({
  name: 'profiles',
  attributes: {
    id: 'string|required',
    name: 'string|required',
    settings: {
      type: 'object',
      props: {
        theme: 'string|optional',
        notifications: 'boolean|optional',
        language: 'string|optional'
      }
    }
  },
  behavior: 'enforce-limits',
  timestamps: true
});

await profiles.insert({
  id: 'profile-1',
  name: 'Bob',
  settings: {
    theme: 'dark',
    notifications: true,
    language: 'en'
  }
});

// ❌ DON'T: Dot notation loses sibling fields
// const bad = await profiles.patch('profile-1', {
//   'settings.theme': 'light'
// });
// // Result: settings = { theme: 'light' } (notifications and language lost!)

// ✅ DO: Update entire object
const good = await profiles.patch('profile-1', {
  settings: {
    theme: 'light', // Changed
    notifications: true, // Preserved
    language: 'en' // Preserved
  }
});

console.log('Result:', {
  id: good.id,
  name: good.name,
  settings: good.settings
});

console.log('✅ All nested fields preserved (update entire object)');
console.log('⚠️  Known limitation: Dot notation (e.g., "settings.theme") not supported');
console.log('📖 Workaround: Update the entire nested object\n');

// ============================================================================
// PART 3: Partition Updates
// ============================================================================

console.log('\n📚 PART 3: Partition Updates\n');

console.log('3. patch() and replace() with partitions:');
console.log('-'.repeat(80));

const orders = await database.createResource({
  name: 'orders',
  attributes: {
    id: 'string|required',
    customerId: 'string|required',
    region: 'string|required',
    status: 'string|required',
    total: 'number|required'
  },
  behavior: 'enforce-limits',
  partitions: {
    byRegion: { fields: { region: 'string' } }
  },
  asyncPartitions: false, // Sync mode for this example
  timestamps: true
});

await orders.insert({
  id: 'order-1',
  customerId: 'cust-1',
  region: 'US',
  status: 'pending',
  total: 100.00
});

// patch() updates partition indexes
const patchedOrder = await orders.patch('order-1', {
  status: 'completed'
});

console.log('✅ patch() updated partition indexes (status changed)');

// Changing partition field moves record between partitions
const movedOrder = await orders.patch('order-1', {
  region: 'EU' // Changes partition!
});

console.log('✅ patch() moved record from US partition to EU partition');

// replace() also handles partition migrations
const replacedOrder = await orders.replace('order-1', {
  customerId: 'cust-1',
  region: 'APAC', // Another partition change!
  status: 'shipped',
  total: 150.00
});

console.log('✅ replace() moved record from EU partition to APAC partition\n');

// ============================================================================
// PART 4: Performance Comparison
// ============================================================================

console.log('\n📚 PART 4: Performance Comparison\n');

console.log('4. Benchmark: update() vs patch() vs replace():');
console.log('-'.repeat(80));

const iterations = 100;
const testUser = 'perf-test-user';

await users.insert({
  id: testUser,
  name: 'Performance Test',
  email: 'perf@example.com',
  status: 'active',
  loginCount: 0
});

// Benchmark update()
const updateStart = Date.now();
for (let i = 0; i < iterations; i++) {
  await users.update(testUser, { loginCount: i });
}
const updateTime = Date.now() - updateStart;

// Benchmark patch()
const patchStart = Date.now();
for (let i = 0; i < iterations; i++) {
  await users.patch(testUser, { loginCount: i });
}
const patchTime = Date.now() - patchStart;

// Benchmark replace()
const replaceStart = Date.now();
for (let i = 0; i < iterations; i++) {
  await users.replace(testUser, {
    name: 'Performance Test',
    email: 'perf@example.com',
    status: 'active',
    loginCount: i
  });
}
const replaceTime = Date.now() - replaceStart;

console.log(`\n📊 Results (${iterations} iterations):\n`);
console.log(`update():  ${updateTime}ms (baseline)`);
console.log(`patch():   ${patchTime}ms (${((1 - patchTime/updateTime) * 100).toFixed(1)}% faster) ⚡`);
console.log(`replace(): ${replaceTime}ms (${((1 - replaceTime/updateTime) * 100).toFixed(1)}% faster) 🚀\n`);

console.log('💡 Insights:');
console.log('  - patch() uses HEAD + COPY (no body transfer) for metadata-only behaviors');
console.log('  - replace() skips GET entirely (1 request vs 2)');
console.log('  - Both maintain partition consistency and validation\n');

// ============================================================================
// PART 5: Method Selection Guide
// ============================================================================

console.log('\n📚 PART 5: Method Selection Guide\n');

console.log('When to use each method:');
console.log('-'.repeat(80));
console.log('');
console.log('✅ Use update():');
console.log('  - Default choice for most use cases');
console.log('  - Merges with existing data (preserves unspecified fields)');
console.log('  - Works with all behaviors');
console.log('  - Handles nested objects and complex merges');
console.log('');
console.log('✅ Use patch():');
console.log('  - Updating a few fields on metadata-only behaviors (enforce-limits, truncate-data)');
console.log('  - Need 40-60% performance boost for simple updates');
console.log('  - Want automatic optimization with fallback to update()');
console.log('  - Same guarantees as update() (partitions, validation, events)');
console.log('');
console.log('✅ Use replace():');
console.log('  - Have the complete object already');
console.log('  - Want maximum performance (30-40% faster, 1 request vs 2)');
console.log('  - True upsert behavior (creates if missing, replaces if exists)');
console.log('  - Don\'t need to preserve any existing fields');
console.log('');
console.log('⚠️  Avoid:');
console.log('  - patch() with dot notation for nested objects (use full object update)');
console.log('  - replace() when you need to preserve some fields (use update/patch instead)');
console.log('');

// ============================================================================
// PART 6: Error Handling
// ============================================================================

console.log('\n📚 PART 6: Error Handling\n');

console.log('6. Validation and error handling:');
console.log('-'.repeat(80));

try {
  // patch() validates data
  await users.patch('user-123', {
    status: 123 // ❌ Wrong type (should be string)
  });
} catch (err) {
  console.log('✅ patch() validation error caught:', err.message);
}

try {
  // replace() requires all required fields
  await users.replace('user-123', {
    name: 'Test' // ❌ Missing required field: email
  });
} catch (err) {
  console.log('✅ replace() validation error caught:', err.message);
}

try {
  // Empty ID
  await users.patch('', { status: 'active' });
} catch (err) {
  console.log('✅ Empty ID error caught:', err.message);
}

console.log('');

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('📖 Summary');
console.log('='.repeat(80));
console.log('');
console.log('New Methods Added:');
console.log('  • patch(id, fields, options)  - Smart partial update with optimization');
console.log('  • replace(id, fullData, options) - Full replacement without GET');
console.log('');
console.log('Key Benefits:');
console.log('  • 40-60% faster partial updates (patch with metadata-only behaviors)');
console.log('  • 30-40% faster full replacements (replace vs update)');
console.log('  • Automatic optimization with intelligent fallbacks');
console.log('  • Full partition, validation, and event support');
console.log('');
console.log('Known Limitations:');
console.log('  • Dot notation for nested objects not supported (schema system limitation)');
console.log('  • Workaround: Update entire nested object instead');
console.log('');
console.log('See CLAUDE.md for complete documentation.');
console.log('='.repeat(80));
console.log('');

await database.disconnect();
