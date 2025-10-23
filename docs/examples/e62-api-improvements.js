/**
 * Example 62: API Improvements - Type Safety & Consistency
 *
 * Demonstrates 2 major API improvements:
 *
 * 1. Consistent Property Access (db.resources.users)
 *    - No more db.resources.users vs db.resources.users confusion
 *    - Better autocomplete support
 *    - Type-safe property access
 *    - Deprecation warnings for old API
 *
 * 2. TypeScript Type Generation
 *    - Auto-generate .d.ts files from schemas
 *    - Catch typos at compile time (user.emai → error!)
 *    - Full IntelliSense/autocomplete support
 *    - Type-safe method parameters
 *
 * To run with LocalStack:
 *   1. Start: localstack start
 *   2. Run: node docs/examples/e62-api-improvements.js
 */

import { Database, generateTypes } from '../../src/index.js';

console.log('\n🚀 S3DB.JS - API Improvements Demo\n');

// ============================================================================
// Setup
// ============================================================================

const connectionString = 's3://test:test@api-improvements?region=us-east-1&endpoint=http://localhost:4566&forcePathStyle=true';
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
// IMPROVEMENT 1: Consistent Property Access
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Improvement 1: Consistent Property Access');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Create resources
await db.createResource({
  name: 'users',
  description: {
    resource: 'User accounts in the system',
    attributes: {
      name: 'Full name of the user',
      email: 'Email address for login',
      age: 'User age in years',
      role: 'User role (admin, user, guest)'
    }
  },
  attributes: {
    name: 'string|required',
    email: 'string|required|email',
    age: 'number|min:0|max:150',
    role: 'string|default:user'
  },
  timestamps: true,
  partitions: ['role']  // Auto-generates byRole partition!
});

await db.createResource({
  name: 'posts',
  description: 'Blog posts created by users',
  attributes: {
    userId: 'string|required',
    title: 'string|required',
    content: 'string|required',
    published: 'boolean|default:false'
  },
  timestamps: true,
  partitions: ['userId', 'published']
});

console.log('🔸 Old way (DEPRECATED - shows warning):');
console.log('const users = db.resources.users;');
console.log('const posts = db.resources.posts;\n');

// This will show deprecation warning
const usersOld = db.resources.users;

console.log('\n🔸 New way (RECOMMENDED - no warnings):');
console.log('const users = db.resources.users;');
console.log('const posts = db.resources.posts;\n');

// New way - clean and type-safe
const users = db.resources.users;
const posts = db.resources.posts;

console.log('✅ New way benefits:');
console.log('  • Cleaner syntax');
console.log('  • Better autocomplete in IDEs');
console.log('  • Type-safe with TypeScript');
console.log('  • Supports optional chaining: db.resources.users?.get()');
console.log('  • No string typos: db.resources.usres → undefined (compile error in TS!)');

// Create test data
const user1 = await users.insert({
  name: 'Alice Johnson',
  email: 'alice@example.com',
  age: 30,
  role: 'admin'
});

const user2 = await users.insert({
  name: 'Bob Smith',
  email: 'bob@example.com',
  age: 25,
  role: 'user'
});

await posts.insert({
  userId: user1.id,
  title: 'Introduction to s3db.js',
  content: 'Learn the basics...',
  published: true
});

console.log('\n✅ Created 2 users and 1 post using new API');

// ============================================================================
// IMPROVEMENT 2: TypeScript Type Generation
// ============================================================================

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Improvement 2: TypeScript Type Generation');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🔸 Generate TypeScript definitions from schemas:');
console.log('');

// Generate TypeScript types
const types = await generateTypes(db, {
  outputPath: './types/database.d.ts',
  moduleName: 's3db.js',
  includeResource: true
});

console.log('Generated TypeScript definitions:');
console.log('─────────────────────────────────────────────────\n');

// Show first 50 lines of generated types
const preview = types.split('\n').slice(0, 50).join('\n');
console.log(preview);
console.log('\n... (truncated for readability)\n');

console.log('─────────────────────────────────────────────────');
console.log('✅ Types saved to: ./types/database.d.ts\n');

console.log('🔸 What you get with TypeScript:');
console.log('');
console.log('  1. Type-safe resource access:');
console.log('     ✅ db.resources.users  // Autocomplete works!');
console.log('     ❌ db.resources.usres  // Compile error - typo detected!');
console.log('');
console.log('  2. Type-safe field access:');
console.log('     ✅ user.name   // OK');
console.log('     ✅ user.email  // OK');
console.log('     ❌ user.emai   // Compile error - typo detected!');
console.log('');
console.log('  3. Method parameter types:');
console.log('     ✅ users.insert({ name: "John", email: "john@test.com" })');
console.log('     ❌ users.insert({ nam: "John" })  // Error - "nam" doesn\'t exist');
console.log('');
console.log('  4. Return type inference:');
console.log('     const user = await users.get(id);');
console.log('     // user is typed as Users interface');
console.log('     console.log(user.name);  // Autocomplete suggests: name, email, age, role');
console.log('');

// ============================================================================
// TypeScript Usage Example (shown as comment)
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 TypeScript Usage Example');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log(`
// app.ts
import { Database } from 's3db.js';
import type { ResourceMap, Users, Posts } from './types/database';

const db = new Database({ connectionString: '...' });
await db.connect();

// ✅ Type-safe property access
const users = db.resources.users;  // Type: Resource<Users>
const posts = db.resources.posts;  // Type: Resource<Posts>

// ✅ Autocomplete works!
const user = await users.get('user123');
console.log(user.name);   // ✅ TypeScript knows this exists
console.log(user.email);  // ✅ TypeScript knows this exists
console.log(user.emai);   // ❌ Compile error! Property 'emai' does not exist

// ✅ Insert validation
await users.insert({
  name: 'John',
  email: 'john@example.com',
  age: 30,
  role: 'admin'
});  // ✅ All required fields present

await users.insert({
  name: 'Jane',
  // ❌ Compile error! Property 'email' is required
});

// ✅ Query type safety
const admins = await users.query({
  role: 'admin'  // ✅ TypeScript knows 'role' exists
});

const invalidQuery = await users.query({
  rol: 'admin'  // ❌ Compile error! Property 'rol' does not exist
});
`);

// ============================================================================
// Integration with IDEs
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 IDE Integration');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('With the generated types, you get:');
console.log('');
console.log('  🎯 VSCode IntelliSense');
console.log('     • Type when you type: db.resources.█');
console.log('     • Suggests: users, posts');
console.log('     • Shows JSDoc descriptions from schema');
console.log('');
console.log('  🎯 WebStorm/IntelliJ');
console.log('     • Full autocomplete support');
console.log('     • Quick documentation on hover');
console.log('     • Refactoring tools work correctly');
console.log('');
console.log('  🎯 TypeScript Compiler');
console.log('     • Catches typos at build time');
console.log('     • Enforces required fields');
console.log('     • Prevents invalid queries');
console.log('');

// ============================================================================
// Setup Instructions
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Setup Instructions');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('1. Generate types (one-time or on schema changes):');
console.log('');
console.log('   node generate-types.js');
console.log('');
console.log('2. Create generate-types.js:');
console.log('');
console.log(`   import { Database, generateTypes } from 's3db.js';

   const db = new Database({ connectionString: '...' });
   await db.connect();

   await generateTypes(db, {
     outputPath: './types/database.d.ts'
   });

   console.log('✅ Types generated!');
`);
console.log('');
console.log('3. Use in your TypeScript files:');
console.log('');
console.log(`   import type { ResourceMap, Users } from './types/database';

   // Now you have full type safety!
`);
console.log('');

// ============================================================================
// Summary
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Summary');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('✅ Improvement 1: Consistent API');
console.log('   • db.resources.users (recommended)');
console.log('   • db.resources.users deprecated with warnings');
console.log('   • Better DX, cleaner code\n');

console.log('✅ Improvement 2: TypeScript Support');
console.log('   • Auto-generate .d.ts from schemas');
console.log('   • Full type safety and autocomplete');
console.log('   • Catch typos at compile time');
console.log('   • Works with any TypeScript project\n');

console.log('🎯 Migration Path:');
console.log('   1. Replace db.resource() calls with db.resources.resourceName');
console.log('   2. Generate types once: node generate-types.js');
console.log('   3. Convert .js files to .ts gradually');
console.log('   4. Enjoy type safety!\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

process.exit(0);
