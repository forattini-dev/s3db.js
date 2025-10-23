/**
 * Example 65: Factories & Seeders - Test Data Generation
 *
 * Demonstrates how to use Factory pattern and Seeder for test data.
 *
 * Features:
 * - Factory.define() - Define data factories
 * - Sequences - Auto-incrementing values
 * - Traits - State variations
 * - Relationships - Link related resources
 * - Batch creation - Create many at once
 * - Seeders - Database seeding
 *
 * To run with LocalStack:
 *   1. Start: localstack start
 *   2. Run: node docs/examples/e65-factories-seeders.js
 */

import { Database, Factory, Seeder } from '../../src/index.js';

console.log('\n🏭 Factories & Seeders - Test Data Generation\n');

// ============================================================================
// Setup Database
// ============================================================================

const connectionString = 's3://test:test@factories-demo?region=us-east-1&endpoint=http://localhost:4566&forcePathStyle=true';
const db = new Database({ connectionString });

try {
  await db.connect();
  console.log('✅ Connected to database\n');
} catch (error) {
  console.error('❌ Failed to connect');
  console.error('Make sure LocalStack is running: localstack start\n');
  process.exit(1);
}

// Set global database for factories
Factory.setDatabase(db);

// Create resources
await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    name: 'string|required',
    role: 'string|default:user',
    apiToken: 'string',
    isActive: 'boolean|default:true',
    credits: 'number|default:0'
  },
  timestamps: true
});

await db.createResource({
  name: 'posts',
  attributes: {
    userId: 'string|required',
    title: 'string|required',
    content: 'string|required',
    published: 'boolean|default:false',
    views: 'number|default:0'
  },
  timestamps: true
});

await db.createResource({
  name: 'comments',
  attributes: {
    postId: 'string|required',
    userId: 'string|required',
    content: 'string|required',
    approved: 'boolean|default:false'
  },
  timestamps: true
});

// ============================================================================
// PART 1: Define Factories
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Part 1: Define Factories');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// User Factory with sequences
const UserFactory = Factory.define('users', {
  email: ({ seq }) => `user${seq}@example.com`,
  name: ({ seq }) => `Test User ${seq}`,
  role: 'user',
  apiToken: () => Math.random().toString(36).substring(2, 15),
  isActive: true,
  credits: 100
});

// Add traits for different user states
UserFactory
  .trait('admin', {
    role: 'admin',
    credits: 1000
  })
  .trait('inactive', {
    isActive: false,
    credits: 0
  })
  .trait('premium', {
    role: 'premium',
    credits: 5000
  });

console.log('✅ UserFactory defined with traits: admin, inactive, premium\n');

// Post Factory with relationship
const PostFactory = Factory.define('posts', {
  userId: async () => {
    // Create a user if none exists
    const user = await UserFactory.create();
    return user.id;
  },
  title: ({ seq }) => `Blog Post ${seq}: How to Test`,
  content: ({ seq }) => `This is the content of post ${seq}. Lorem ipsum dolor sit amet...`,
  published: false,
  views: () => Math.floor(Math.random() * 1000)
});

PostFactory
  .trait('published', {
    published: true,
    views: () => Math.floor(Math.random() * 10000)
  })
  .trait('viral', {
    published: true,
    views: () => Math.floor(Math.random() * 100000) + 50000
  });

console.log('✅ PostFactory defined with traits: published, viral\n');

// Comment Factory
const CommentFactory = Factory.define('comments', {
  postId: async () => {
    const post = await PostFactory.create();
    return post.id;
  },
  userId: async () => {
    const user = await UserFactory.create();
    return user.id;
  },
  content: ({ seq }) => `Great post! Comment #${seq}`,
  approved: false
});

CommentFactory.trait('approved', {
  approved: true
});

console.log('✅ CommentFactory defined with trait: approved\n');

// ============================================================================
// PART 2: Basic Factory Usage
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Part 2: Basic Factory Usage');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Create single user
console.log('1. Create single user:');
const user1 = await UserFactory.create();
console.log(`   ✅ Created: ${user1.name} (${user1.email})\n`);

// Create with overrides
console.log('2. Create with custom attributes:');
const user2 = await UserFactory.create({
  name: 'Alice Johnson',
  credits: 500
});
console.log(`   ✅ Created: ${user2.name} with ${user2.credits} credits\n`);

// Create multiple users
console.log('3. Create 5 users at once:');
const users = await UserFactory.createMany(5);
console.log(`   ✅ Created ${users.length} users:`);
users.forEach(u => console.log(`      • ${u.name}`));
console.log('');

// ============================================================================
// PART 3: Using Traits
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Part 3: Using Traits');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Create admin user
console.log('1. Create admin user:');
const admin = await UserFactory.createWithTraits('admin');
console.log(`   ✅ Created: ${admin.name}`);
console.log(`      Role: ${admin.role}`);
console.log(`      Credits: ${admin.credits}\n`);

// Create inactive user
console.log('2. Create inactive user:');
const inactive = await UserFactory.createWithTraits('inactive');
console.log(`   ✅ Created: ${inactive.name}`);
console.log(`      Active: ${inactive.isActive}`);
console.log(`      Credits: ${inactive.credits}\n`);

// Create published post
console.log('3. Create published post:');
const publishedPost = await PostFactory.createWithTraits('published');
console.log(`   ✅ Created: ${publishedPost.title}`);
console.log(`      Published: ${publishedPost.published}`);
console.log(`      Views: ${publishedPost.views}\n`);

// Create viral post
console.log('4. Create viral post:');
const viralPost = await PostFactory.createWithTraits('viral');
console.log(`   ✅ Created: ${viralPost.title}`);
console.log(`      Views: ${viralPost.views.toLocaleString()}\n`);

// ============================================================================
// PART 4: Build vs Create
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Part 4: Build vs Create');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Build without saving to database
console.log('1. Build user (no database insert):');
const builtUser = await UserFactory.build({
  name: 'Built User',
  email: 'built@example.com'
});
console.log(`   ✅ Built: ${builtUser.name}`);
console.log(`      ID: ${builtUser.id || 'none (not saved)'}`);
console.log(`      Email: ${builtUser.email}\n`);

// Build many
console.log('2. Build 3 users:');
const builtUsers = await UserFactory.buildMany(3);
console.log(`   ✅ Built ${builtUsers.length} users (not saved to DB)\n`);

// ============================================================================
// PART 5: Relationships
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Part 5: Creating Related Resources');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('1. Create user with posts:');
const author = await UserFactory.create({ name: 'Author User' });
const authorPosts = await PostFactory.createMany(3, {
  userId: author.id,
  published: true
});
console.log(`   ✅ Created user: ${author.name}`);
console.log(`   ✅ Created ${authorPosts.length} posts for that user\n`);

console.log('2. Create post with comments:');
const post = await PostFactory.create({ title: 'Popular Post' });
const comments = await CommentFactory.createMany(5, {
  postId: post.id
});
console.log(`   ✅ Created post: ${post.title}`);
console.log(`   ✅ Created ${comments.length} comments on that post\n`);

// ============================================================================
// PART 6: Seeders
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Part 6: Using Seeders');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const seeder = new Seeder(db);

// Seed multiple resources at once
console.log('1. Seed database with test data:\n');
const seeded = await seeder.seed({
  users: 10,
  posts: 25,
  comments: 50
});

console.log(`\n   ✅ Total seeded:`);
console.log(`      • ${seeded.users.length} users`);
console.log(`      • ${seeded.posts.length} posts`);
console.log(`      • ${seeded.comments.length} comments\n`);

// Custom seeder with relationships
console.log('2. Custom seeder with relationships:\n');
const customSeeded = await seeder.call(async (database) => {
  // Create 3 admin users
  const admins = await UserFactory.createMany(3, { role: 'admin' });

  // Each admin writes 5 posts
  const adminPosts = [];
  for (const admin of admins) {
    const posts = await PostFactory.createMany(5, {
      userId: admin.id,
      published: true
    });
    adminPosts.push(...posts);
  }

  // Add comments to each post
  for (const post of adminPosts) {
    await CommentFactory.createMany(3, {
      postId: post.id,
      approved: true
    });
  }

  return { admins, posts: adminPosts };
});

console.log(`   ✅ Custom seed complete:`);
console.log(`      • ${customSeeded.admins.length} admins`);
console.log(`      • ${customSeeded.posts.length} posts by admins\n`);

// ============================================================================
// PART 7: Hooks & Callbacks
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Part 7: Factory Hooks');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Create factory with after create hook
const TrackedUserFactory = Factory.define('users', {
  email: ({ seq }) => `tracked${seq}@example.com`,
  name: ({ seq }) => `Tracked User ${seq}`,
  role: 'user',
  apiToken: () => Math.random().toString(36).substring(2, 15)
});

TrackedUserFactory.afterCreate(async (user) => {
  console.log(`   🪝 After create hook: User ${user.id} created at ${user.createdAt}`);
  return user;
});

console.log('1. Create user with after create hook:');
const trackedUser = await TrackedUserFactory.create();
console.log(`   ✅ User created: ${trackedUser.name}\n`);

// ============================================================================
// PART 8: Cleanup
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Part 8: Cleanup & Reset');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Count current records
console.log('1. Current database state:');
const userCount = await db.resources.users.count();
const postCount = await db.resources.posts.count();
const commentCount = await db.resources.comments.count();
console.log(`   • Users: ${userCount}`);
console.log(`   • Posts: ${postCount}`);
console.log(`   • Comments: ${commentCount}\n`);

// Truncate specific resources
console.log('2. Truncating comments...');
await seeder.truncate(['comments']);
const commentsAfter = await db.resources.comments.count();
console.log(`   ✅ Comments: ${commentsAfter}\n`);

// Reset entire database
console.log('3. Resetting entire database...');
await seeder.reset();
const usersAfterReset = await db.resources.users.count();
const postsAfterReset = await db.resources.posts.count();
console.log(`   ✅ Database reset complete`);
console.log(`      • Users: ${usersAfterReset}`);
console.log(`      • Posts: ${postsAfterReset}\n`);

// ============================================================================
// Summary
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Summary');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('✅ Factory Features:');
console.log('   • Define with Factory.define(name, definition)');
console.log('   • Sequences for unique values');
console.log('   • Traits for state variations');
console.log('   • Relationships with async functions');
console.log('   • Build vs Create (memory vs database)');
console.log('   • Batch creation with createMany()');
console.log('   • Hooks (beforeCreate, afterCreate)\n');

console.log('✅ Seeder Features:');
console.log('   • Seed multiple resources at once');
console.log('   • Custom seeders with relationships');
console.log('   • Truncate for cleanup');
console.log('   • Reset database and sequences\n');

console.log('🎯 Use Cases:');
console.log('   • Unit tests: Build objects without DB');
console.log('   • Integration tests: Create test data');
console.log('   • E2E tests: Seed realistic scenarios');
console.log('   • Development: Quick test data generation\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

process.exit(0);
