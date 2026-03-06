/**
 * Example 61: Quick Wins Demo
 *
 * Demonstrates 4 new convenience features added to s3db.js:
 *
 * 1. getOrThrow() & getOrNull() - Convenient get methods with explicit null/error handling
 * 2. Auto-naming partitions - Create partitions from arrays (auto-generates names)
 * 3. validate() method - Validate data against schema without saving
 * 4. Improved plugin dependency errors - Better error messages with troubleshooting
 *
 * These features make s3db.js more developer-friendly and reduce boilerplate code.
 *
 * To run with LocalStack:
 *   1. Start: localstack start
 *   2. Run: node docs/examples/e61-quick-wins.js
 */

import { Database } from '../../src/index.js';

console.log('\n🚀 S3DB.JS - Quick Wins Demo\n');

// ============================================================================
// Setup
// ============================================================================

const connectionString = 's3://test:test@quick-wins?region=us-east-1&endpoint=http://localhost:4566&forcePathStyle=true';
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
// QUICK WIN 1: getOrThrow() & getOrNull()
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Quick Win 1: getOrThrow() & getOrNull()');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|required|email',
    age: 'number|min:0|max:150'
  }
});

// Create a test user
const user1 = await users.insert({
  name: 'Alice',
  email: 'alice@example.com',
  age: 30
});

console.log('Created user:', user1.id);

// Old way: Manual null check
console.log('\n🔸 Old way (manual null check):');
const userOld = await users.get('nonexistent-id');
if (!userOld) {
  console.log('  User not found - had to check manually');
}

// New way 1: getOrNull() - Explicit null handling
console.log('\n🔸 New way 1 - getOrNull():');
const userNull = await users.getOrNull('nonexistent-id');
if (userNull === null) {
  console.log('  User not found - null returned explicitly');
}

// New way 2: getOrThrow() - Throws error immediately
console.log('\n🔸 New way 2 - getOrThrow():');
try {
  const userThrow = await users.getOrThrow('nonexistent-id');
  console.log('  This will not print');
} catch (err) {
  console.log('  Error thrown:', err.message);
  console.log('  No need for null checks!');
}

// Successful getOrThrow
const foundUser = await users.getOrThrow(user1.id);
console.log('\n✅ getOrThrow() with existing ID:', foundUser.name);

// ============================================================================
// QUICK WIN 2: Auto-naming Partitions
// ============================================================================

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Quick Win 2: Auto-naming Partitions');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Old way: Verbose partition definition
console.log('🔸 Old way (verbose):');
console.log(`
const orders = await db.createResource({
  name: 'orders',
  attributes: {
    userId: 'string|required',
    status: 'string|required'
  },
  partitions: {
    byUserId: { fields: { userId: 'string' } },
    byStatus: { fields: { status: 'string' } }
  }
});
`);

// New way: Array shorthand (auto-generates partition names!)
console.log('🔸 New way (array shorthand):');
console.log(`
const orders = await db.createResource({
  name: 'orders',
  attributes: {
    userId: 'string|required',
    status: 'string|required'
  },
  partitions: ['userId', 'status']  // Auto-generates byUserId & byStatus!
});
`);

const orders = await db.createResource({
  name: 'orders',
  attributes: {
    userId: 'string|required',
    status: 'string|required',
    total: 'number|required'
  },
  partitions: ['userId', 'status']  // Magic! 🪄
});

console.log('\n✅ Created partitions:');
console.log('  - byUserId (auto-generated from "userId")');
console.log('  - byStatus (auto-generated from "status")');

// Test partitions
await orders.insert({
  userId: user1.id,
  status: 'pending',
  total: 99.99
});

await orders.insert({
  userId: user1.id,
  status: 'completed',
  total: 149.99
});

const userOrders = await orders.listPartition({
  partition: 'byUserId',
  partitionValues: { userId: user1.id }
});

console.log(`\n✅ Queried partition byUserId: Found ${userOrders.length} orders`);

// ============================================================================
// QUICK WIN 3: validate() Method
// ============================================================================

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Quick Win 3: validate() Method');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🔸 Validate data before saving:');

// Valid data
const validData = {
  name: 'Bob',
  email: 'bob@example.com',
  age: 25
};

const result1 = await users.validate(validData, { throwOnError: false });
console.log('\n  Valid data:', JSON.stringify(validData));
console.log('  Result:', result1.valid ? '✅ Valid' : '❌ Invalid');

// Invalid data (bad email)
const invalidData = {
  name: 'Charlie',
  email: 'not-an-email',  // Invalid!
  age: 25
};

const result2 = await users.validate(invalidData, { throwOnError: false });
console.log('\n  Invalid data:', JSON.stringify(invalidData));
console.log('  Result:', result2.valid ? '✅ Valid' : '❌ Invalid');
if (!result2.valid) {
  console.log('  Errors:', JSON.stringify(result2.errors, null, 2));
}

// Throwing on error (default behavior)
console.log('\n🔸 Throw on validation error (default):');
try {
  await users.validate({
    name: 'Dave',
    age: 200  // Age > 150 (exceeds max)
  });
} catch (err) {
  console.log('  Caught error:', err.message);
  console.log('  Validation errors:', err.validationErrors?.length || 0);
}

// Use case: Validate in API endpoint before insert
console.log('\n🔸 Real-world use case (API endpoint):');
console.log(`
async function createUserEndpoint(req, res) {
  try {
    // Validate first (returns detailed errors)
    const validation = await users.validate(req.body, { throwOnError: false });

    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    // Now safe to insert
    const user = await users.insert(validation.data);
    return res.status(201).json(user);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
`);

// ============================================================================
// QUICK WIN 4: Improved Plugin Dependency Errors
// ============================================================================

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Quick Win 4: Improved Plugin Dependency Errors');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🔸 Example error message (if dependencies missing):');
console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  ❌ API Plugin - Missing Dependencies  ║
╚══════════════════════════════════════════════════════════════════════╝

📦 Plugin: api-plugin
📊 Status: 0/2 dependencies satisfied

🔍 Dependency Status:
─────────────────────────────────────────────────────────────────────
❌ Missing dependency: raffel
   Description: Native HTTP runtime used by the API plugin
   Required: ^1.0.0
   Install: pnpm add raffel

❌ Missing dependency: jose
   Description: Token/JWT support for auth drivers
   Required: ^5.0.0
   Install: pnpm add jose

🚀 Quick Fix - Install Missing Dependencies:
─────────────────────────────────────────────────────────────────────

  Option 1: Install individually
    pnpm add raffel
    pnpm add jose

  Option 2: Install all at once
    pnpm add raffel jose

📚 Documentation:
    https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/api.md

💡 Troubleshooting:
  • If packages are installed but not detected, try:
    1. Delete node_modules and reinstall: rm -rf node_modules && pnpm install
    2. Check Node.js version: node --version (requires Node 18+)
    3. Verify pnpm version: pnpm --version (requires pnpm 8+)

═══════════════════════════════════════════════════════════════════════
`);

console.log('✅ Much better than generic "Module not found" errors!');
console.log('✅ Includes install commands, docs links, and troubleshooting');

// ============================================================================
// Summary
// ============================================================================

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Summary - Quick Wins');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('✅ 1. getOrThrow() / getOrNull()');
console.log('     → Explicit null/error handling');
console.log('     → Reduces boilerplate code');
console.log('     → Better code readability\n');

console.log('✅ 2. Auto-naming Partitions');
console.log('     → Array shorthand: ["userId", "status"]');
console.log('     → Auto-generates: byUserId, byStatus');
console.log('     → Less typing, cleaner code\n');

console.log('✅ 3. validate() Method');
console.log('     → Validate before insert/update');
console.log('     → Get detailed error messages');
console.log('     → Perfect for API endpoints\n');

console.log('✅ 4. Improved Plugin Errors');
console.log('     → Beautiful formatted messages');
console.log('     → Direct install commands');
console.log('     → Troubleshooting tips\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🎯 All quick wins implemented successfully!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

process.exit(0);
