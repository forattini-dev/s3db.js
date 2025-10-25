/**
 * Example 60: API Plugin with Relations and Descriptions
 *
 * Demonstrates the two new API Plugin features:
 * 1. Relational Routes - Auto-generated endpoints for navigating relationships
 * 2. Resource Descriptions - Enhanced documentation with descriptions
 *
 * Features:
 * - Descriptions for resources and attributes (string and object format)
 * - Automatic relational routes (hasMany, hasOne, belongsToMany)
 * - Partition-optimized relation loading
 * - Beautiful auto-generated docs with resource table
 *
 * IMPORTANT: This example requires LocalStack or AWS S3.
 *
 * To run with LocalStack:
 *   1. Install: brew install localstack
 *   2. Start: localstack start
 *   3. Run: node docs/examples/e60-api-relations-descriptions.js
 */

import { Database } from '../../src/index.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';
import { RelationPlugin } from '../../src/plugins/relation.plugin.js';

console.log('\n🚀 API Plugin - Relations & Descriptions Demo\n');

// ============================================================================
// STEP 1: Create Database
// ============================================================================

const connectionString = 's3://test:test@api-demo?region=us-east-1&endpoint=http://localhost:4566&forcePathStyle=true';
const db = new Database({ connectionString });

console.log('📦 Connecting to database...');

try {
  await db.connect();
  console.log('✅ Database connected\n');
} catch (error) {
  console.error('❌ Failed to connect to database');
  console.error('\nMake sure LocalStack is running:');
  console.error('  brew install localstack');
  console.error('  localstack start\n');
  console.error('Error:', error.message);
  process.exit(1);
}

// ============================================================================
// STEP 2: Create Resources with Descriptions (Object Format)
// ============================================================================

console.log('📝 Creating resources with descriptions...\n');

// Users resource with detailed descriptions
const users = await db.createResource({
  name: 'users',
  description: {
    resource: 'User accounts and profiles for the system',
    attributes: {
      name: 'Full name of the user (e.g., John Doe, Jane Smith)',
      email: 'Email address used for login and notifications',
      role: 'User role determining access level (admin, user, guest)',
      active: 'Whether the user account is currently active'
    }
  },
  attributes: {
    name: 'string|required',
    email: 'string|required|email',
    role: 'string|default:user',
    active: 'boolean|default:true'
  },
  timestamps: true,
  partitions: {
    byRole: { fields: { role: 'string' } }
  }
});

// Posts resource with string description (simpler format)
const posts = await db.createResource({
  name: 'posts',
  description: 'Blog posts and articles created by users',
  attributes: {
    userId: 'string|required',
    title: 'string|required',
    content: 'string|required',
    published: 'boolean|default:false'
  },
  timestamps: true,
  partitions: {
    byUser: { fields: { userId: 'string' } },
    byStatus: { fields: { published: 'boolean' } }
  }
});

// Comments resource with object descriptions
const comments = await db.createResource({
  name: 'comments',
  description: {
    resource: 'User comments on blog posts',
    attributes: {
      postId: 'ID of the post this comment belongs to',
      userId: 'ID of the user who wrote the comment',
      content: 'The comment text content (supports markdown)',
      approved: 'Whether the comment has been approved by moderators'
    }
  },
  attributes: {
    postId: 'string|required',
    userId: 'string|required',
    content: 'string|required',
    approved: 'boolean|default:false'
  },
  timestamps: true,
  partitions: {
    byPost: { fields: { postId: 'string' } },
    byUser: { fields: { userId: 'string' } }
  }
});

// Tags resource
const tags = await db.createResource({
  name: 'tags',
  description: 'Content tags for categorizing posts',
  attributes: {
    name: 'string|required',
    slug: 'string|required',
    color: 'string|default:#3498db'
  }
});

// Junction table for many-to-many relationship
const postTags = await db.createResource({
  name: 'post_tags',
  description: 'Junction table linking posts to tags (many-to-many)',
  attributes: {
    postId: 'string|required',
    tagId: 'string|required'
  },
  partitions: {
    byPost: { fields: { postId: 'string' } },
    byTag: { fields: { tagId: 'string' } }
  }
});

console.log('✅ Created 5 resources with descriptions\n');

// ============================================================================
// STEP 3: Install RelationPlugin
// ============================================================================

console.log('🔗 Installing RelationPlugin...\n');

await db.usePlugin(new RelationPlugin({
  relations: {
    users: {
      posts: {
        type: 'hasMany',
        resource: 'posts',
        foreignKey: 'userId',
        localKey: 'id',
        partitionHint: 'byUser', // Optimized with partition!
        cascade: ['delete']
      },
      comments: {
        type: 'hasMany',
        resource: 'comments',
        foreignKey: 'userId',
        localKey: 'id',
        partitionHint: 'byUser'
      }
    },
    posts: {
      author: {
        type: 'belongsTo',
        resource: 'users',
        foreignKey: 'userId',
        localKey: 'id'
      },
      comments: {
        type: 'hasMany',
        resource: 'comments',
        foreignKey: 'postId',
        localKey: 'id',
        partitionHint: 'byPost'
      },
      tags: {
        type: 'belongsToMany',
        resource: 'tags',
        through: 'post_tags',
        foreignKey: 'postId',
        otherKey: 'tagId',
        junctionPartitionHint: 'byPost'
      }
    },
    comments: {
      post: {
        type: 'belongsTo',
        resource: 'posts',
        foreignKey: 'postId',
        localKey: 'id'
      },
      author: {
        type: 'belongsTo',
        resource: 'users',
        foreignKey: 'userId',
        localKey: 'id'
      }
    }
  },
  verbose: true
}));

console.log('✅ RelationPlugin installed\n');

// ============================================================================
// STEP 4: Add Sample Data
// ============================================================================

console.log('📝 Adding sample data...\n');

// Create users
const user1 = await users.insert({
  name: 'Alice Johnson',
  email: 'alice@example.com',
  role: 'admin',
  active: true
});

const user2 = await users.insert({
  name: 'Bob Smith',
  email: 'bob@example.com',
  role: 'user',
  active: true
});

// Create posts
const post1 = await posts.insert({
  userId: user1.id,
  title: 'Getting Started with s3db.js',
  content: 'Learn how to use s3db.js for building scalable applications...',
  published: true
});

const post2 = await posts.insert({
  userId: user1.id,
  title: 'Advanced Partitioning Techniques',
  content: 'Optimize your queries with smart partitioning strategies...',
  published: true
});

const post3 = await posts.insert({
  userId: user2.id,
  title: 'My First Blog Post',
  content: 'Hello world! This is my first post using s3db.js...',
  published: false
});

// Create tags
const tag1 = await tags.insert({
  name: 'Tutorial',
  slug: 'tutorial',
  color: '#3498db'
});

const tag2 = await tags.insert({
  name: 'Performance',
  slug: 'performance',
  color: '#e74c3c'
});

// Link posts to tags
await postTags.insert({ postId: post1.id, tagId: tag1.id });
await postTags.insert({ postId: post2.id, tagId: tag2.id });
await postTags.insert({ postId: post2.id, tagId: tag1.id });

// Create comments
await comments.insert({
  postId: post1.id,
  userId: user2.id,
  content: 'Great tutorial! Very helpful.',
  approved: true
});

await comments.insert({
  postId: post1.id,
  userId: user2.id,
  content: 'Thanks for sharing!',
  approved: true
});

await comments.insert({
  postId: post2.id,
  userId: user2.id,
  content: 'This is amazing!',
  approved: true
});

console.log('✅ Added sample data\n');

// ============================================================================
// STEP 5: Start API Server
// ============================================================================

console.log('🚀 Starting API server...\n');

await db.usePlugin(new ApiPlugin({
  port: 3000,
  cors: { enabled: true },
  verbose: true,
  docs: {
    enabled: true,
    title: 'Blog API',
    version: '1.0.0',
    description: 'RESTful API for a blog application with users, posts, comments, and tags'
  }
}));

// ============================================================================
// THAT'S IT! API is ready with relational routes!
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('✨ API server running at http://localhost:3000');
console.log('='.repeat(80) + '\n');

console.log('📚 Available Endpoints:\n');

console.log('🔹 Standard CRUD Endpoints:');
console.log('   GET    http://localhost:3000/v1/users           - List all users');
console.log('   GET    http://localhost:3000/v1/posts           - List all posts');
console.log('   GET    http://localhost:3000/v1/comments        - List all comments');
console.log('   GET    http://localhost:3000/v1/tags            - List all tags');
console.log('');

console.log('🔹 NEW! Relational Routes (Auto-generated):');
console.log('   GET    http://localhost:3000/v1/users/:id/posts      - Get user\'s posts');
console.log('   GET    http://localhost:3000/v1/users/:id/comments   - Get user\'s comments');
console.log('   GET    http://localhost:3000/v1/posts/:id/comments   - Get post\'s comments');
console.log('   GET    http://localhost:3000/v1/posts/:id/tags       - Get post\'s tags');
console.log('');

console.log('🔹 Documentation:');
console.log('   GET    http://localhost:3000/docs                - Interactive API docs');
console.log('   GET    http://localhost:3000/openapi.json        - OpenAPI specification');
console.log('');

console.log('🔹 Health Checks:');
console.log('   GET    http://localhost:3000/health              - Health check');
console.log('   GET    http://localhost:3000/health/live         - Liveness probe');
console.log('   GET    http://localhost:3000/health/ready        - Readiness probe');
console.log('');

console.log('\n🧪 Try these commands:\n');

console.log('# Get Alice\'s posts (using relational route!)');
console.log(`curl http://localhost:3000/v1/users/${user1.id}/posts\n`);

console.log('# Get comments for first post (using relational route!)');
console.log(`curl http://localhost:3000/v1/posts/${post1.id}/comments\n`);

console.log('# Get tags for second post (many-to-many, using relational route!)');
console.log(`curl http://localhost:3000/v1/posts/${post2.id}/tags\n`);

console.log('# Open interactive docs (now with resource descriptions!)');
console.log('open http://localhost:3000/docs\n');

console.log('\n💡 What to look for in the docs:\n');
console.log('  ✅ Resource table in the description (Markdown!)');
console.log('  ✅ Detailed attribute descriptions in schemas');
console.log('  ✅ Auto-generated relational endpoints');
console.log('  ✅ Pagination support for hasMany/belongsToMany');
console.log('  ✅ Partition optimization info in descriptions\n');

console.log('=' .repeat(80));
console.log('✨ Press Ctrl+C to stop the server');
console.log('=' .repeat(80) + '\n');

// Keep server running
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down...');
  process.exit(0);
});
