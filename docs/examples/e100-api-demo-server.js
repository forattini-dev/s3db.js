/**
 * Example 100: API Plugin - Complete Demo Server
 *
 * A complete, ready-to-run API server demonstrating all major features:
 * - Multiple resources (users, posts, comments)
 * - Authentication (JWT + API Key)
 * - Guards (authorization, multi-tenancy)
 * - Custom routes with enhanced context
 * - Interactive Swagger UI at /docs
 * - Health checks and metrics
 *
 * Run: node docs/examples/e100-api-demo-server.js
 * Then visit: http://localhost:3000/docs
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';

async function main() {
  console.log('🚀 Starting API Demo Server...\n');

  // ============================================
  // 1. Create Database
  // ============================================
  const db = new Database({
    connectionString: 'memory://api-demo/database'
  });

  await db.connect();
  console.log('✅ Database connected\n');

  // ============================================
  // 2. Create Resources
  // ============================================
  console.log('📦 Creating resources...\n');

  // Users resource (for authentication)
  const users = await db.createResource({
    name: 'users',
    attributes: {
      username: 'string|required|minlength:3',
      email: 'string|required|email',
      password: 'secret|required|minlength:8',
      apiKey: 'string|optional',
      role: 'string|default:user',
      scopes: 'array|items:string|optional',
      active: 'boolean|default:true',
      bio: 'string|optional',
      avatar: 'string|optional|url'
    },
    timestamps: true
  });

  // Posts resource (multi-tenant with guards)
  const posts = await db.createResource({
    name: 'posts',
    attributes: {
      userId: 'string|optional', // Optional because guard will inject it
      title: 'string|required|minlength:5|maxlength:200',
      content: 'string|required|minlength:10',
      status: 'string|default:draft',  // draft, published, archived
      tags: 'array|items:string|optional',
      views: 'number|default:0',
      likes: 'number|default:0',
      publishedAt: 'string|optional'
    },
    timestamps: true,
    partitions: {
      byUser: { fields: { userId: 'string' } },
      byStatus: { fields: { status: 'string' } }
    },
    guard: {
      // Users can only list their own posts (unless admin)
      list: (ctx) => {
        if (ctx.hasScope('admin')) {
          return true; // Admins see everything
        }
        // Regular users see only their posts
        ctx.setPartition('byUser', { userId: ctx.user?.sub || 'anonymous' });
        return true;
      },

      // Auto-inject userId on create
      create: (ctx) => {
        ctx.body.userId = ctx.user?.sub || 'anonymous';
        ctx.body.status = 'draft'; // Force draft on creation
        return true;
      },

      // Only owner or admin can update
      update: (ctx, record) => {
        if (ctx.hasScope('admin')) return true;
        return record.userId === ctx.user?.sub;
      },

      // Only owner or admin can delete
      delete: (ctx, record) => {
        if (ctx.hasScope('admin')) return true;
        return record.userId === ctx.user?.sub;
      }
    }
  });

  // Comments resource (nested resource)
  const comments = await db.createResource({
    name: 'comments',
    attributes: {
      postId: 'string|required',
      userId: 'string|optional', // Optional because guard will inject it
      content: 'string|required|minlength:1|maxlength:500',
      likes: 'number|default:0'
    },
    timestamps: true,
    partitions: {
      byPost: { fields: { postId: 'string' } }
    },
    guard: {
      create: (ctx) => {
        ctx.body.userId = ctx.user?.sub || 'anonymous';
        return true;
      },
      update: (ctx, record) => {
        if (ctx.hasScope('admin')) return true;
        return record.userId === ctx.user?.sub;
      },
      delete: (ctx, record) => {
        if (ctx.hasScope('admin')) return true;
        return record.userId === ctx.user?.sub;
      }
    }
  });

  console.log('✅ Resources created: users, posts, comments\n');

  // ============================================
  // 3. Seed Data
  // ============================================
  console.log('🌱 Seeding data...\n');

  // Create admin user
  const adminUser = await users.insert({
    username: 'admin',
    email: 'admin@demo.com',
    password: 'admin123', // Will be encrypted
    apiKey: 'admin-key-123',
    role: 'admin',
    scopes: ['admin', 'read', 'write'],
    active: true,
    bio: 'System Administrator'
  });

  // Create regular user
  const regularUser = await users.insert({
    username: 'john',
    email: 'john@demo.com',
    password: 'john123',
    apiKey: 'user-key-456',
    role: 'user',
    scopes: ['read', 'write'],
    active: true,
    bio: 'Regular user account'
  });

  // Create posts
  const post1 = await posts.insert({
    userId: regularUser.id,
    title: 'Getting Started with s3db.js',
    content: 'This is a comprehensive guide to getting started with s3db.js, a powerful S3-backed database library.',
    status: 'published',
    tags: ['tutorial', 'guide', 'database'],
    views: 150,
    likes: 23,
    publishedAt: new Date().toISOString()
  });

  const post2 = await posts.insert({
    userId: regularUser.id,
    title: 'Building REST APIs with API Plugin',
    content: 'Learn how to build production-ready REST APIs using the s3db.js API Plugin with zero boilerplate.',
    status: 'published',
    tags: ['api', 'rest', 'plugin'],
    views: 89,
    likes: 12,
    publishedAt: new Date().toISOString()
  });

  const post3 = await posts.insert({
    userId: adminUser.id,
    title: 'Draft: Advanced Features Coming Soon',
    content: 'This post is still in draft mode. Stay tuned for advanced features!',
    status: 'draft',
    tags: ['announcement'],
    views: 0,
    likes: 0
  });

  // Create comments
  await comments.insert({
    postId: post1.id,
    userId: adminUser.id,
    content: 'Great tutorial! Very helpful for beginners.',
    likes: 5
  });

  await comments.insert({
    postId: post1.id,
    userId: regularUser.id,
    content: 'Thanks! Glad you found it useful.',
    likes: 2
  });

  await comments.insert({
    postId: post2.id,
    userId: adminUser.id,
    content: 'The API Plugin is amazing! Zero config REST API 🚀',
    likes: 8
  });

  console.log('✅ Seed data created\n');
  console.log('📊 Database contains:');
  console.log(`   - ${await users.count()} users`);
  console.log(`   - ${await posts.count()} posts`);
  console.log(`   - ${await comments.count()} comments\n`);

  // ============================================
  // 4. Start API Server
  // ============================================
  console.log('🔧 Configuring API Plugin...\n');

  const api = new ApiPlugin({
    port: 3000,
    verbose: true,

    // 📚 Documentation
    docs: {
      enabled: true,
      ui: 'redoc', // 'swagger' or 'redoc'
      title: 's3db.js API Demo',
      version: '1.0.0',
      description: 'A complete demo showcasing s3db.js API Plugin features'
    },

    // 🔐 Authentication
    auth: {
      resource: 'users',

      // ✨ IMPORTANT: Persist auth resource to database
      // This ensures 'users' resource is created in the database
      // and login/register routes work properly
      persistResourceOnAuthResource: true,

      drivers: {
        jwt: {
          secret: 'demo-secret-key-change-in-production',
          expiresIn: '7d'
        },
        apiKey: {
          enabled: true
        }
      },
      pathRules: [
        // Public routes
        { path: '/health', required: false },
        { path: '/docs', required: false },
        { path: '/openapi.json', required: false },
        { path: '/auth/**', required: false },
        { path: '/register', required: false }, // Allow user registration
        { path: '/login', required: false },    // Allow user login

        // Protected routes (require JWT or API Key)
        { path: '/posts', methods: ['jwt', 'apiKey'], required: true },
        { path: '/comments', methods: ['jwt', 'apiKey'], required: true },
        { path: '/users', methods: ['jwt', 'apiKey'], required: true }
      ]
    },

    // 🔒 Security
    security: { enabled: true },
    cors: { enabled: true },

    // 📊 Observability
    metrics: { enabled: true },
    events: { enabled: true },
    requestId: { enabled: true },

    // 🏥 Health Checks
    health: {
      readiness: {
        checks: [
          {
            name: 'database',
            check: async () => ({
              healthy: true,
              details: {
                posts: await posts.count(),
                users: await users.count(),
                comments: await comments.count()
              }
            })
          }
        ]
      }
    },

    // 🛣️ Custom Routes (using Enhanced Context)
    routes: {
      // ============================================
      // Authentication Routes
      // ============================================

      // Register new user
      'POST /register': async (c, ctx) => {
        const body = await ctx.body();

        // Validate required fields
        if (!body.username || !body.email || !body.password) {
          return ctx.error('Username, email, and password are required', 400);
        }

        // Check if user already exists
        const existingUsers = await ctx.resources.users.query({ email: body.email });
        if (existingUsers.length > 0) {
          return ctx.error('User with this email already exists', 400);
        }

        // Create user with default scopes
        const newUser = await ctx.resources.users.insert({
          username: body.username,
          email: body.email,
          password: body.password, // Will be encrypted by 'secret' type
          role: 'user',
          scopes: ['read', 'write'],
          active: true,
          bio: body.bio || '',
          avatar: body.avatar || ''
        });

        // Generate JWT token
        const { SignJWT } = await import('jose');
        const secret = new TextEncoder().encode('demo-secret-key-change-in-production');

        const token = await new SignJWT({
          sub: newUser.id,
          email: newUser.email,
          username: newUser.username,
          scopes: newUser.scopes,
          role: newUser.role
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setIssuer('api-demo')
          .setAudience('api-demo')
          .setExpirationTime('7d')
          .sign(secret);

        return ctx.success({
          message: 'User registered successfully',
          user: {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            role: newUser.role,
            scopes: newUser.scopes
          },
          token
        }, 201);
      },

      // Login user
      'POST /login': async (c, ctx) => {
        const body = await ctx.body();

        if (!body.email || !body.password) {
          return ctx.error('Email and password are required', 400);
        }

        // Find user by email
        const users = await ctx.resources.users.query({ email: body.email });

        if (users.length === 0) {
          return ctx.error('Invalid credentials', 401);
        }

        const user = users[0];

        // Note: In production, you should properly verify the password
        // The 'secret' type encrypts data, but password verification needs proper hashing
        // For this demo, we'll just check if user exists and is active
        if (!user.active) {
          return ctx.error('Account is disabled', 403);
        }

        // Generate JWT token
        const { SignJWT } = await import('jose');
        const secret = new TextEncoder().encode('demo-secret-key-change-in-production');

        const token = await new SignJWT({
          sub: user.id,
          email: user.email,
          username: user.username,
          scopes: user.scopes || ['read', 'write'],
          role: user.role || 'user'
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setIssuer('api-demo')
          .setAudience('api-demo')
          .setExpirationTime('7d')
          .sign(secret);

        return ctx.success({
          message: 'Login successful',
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            scopes: user.scopes
          },
          token
        });
      },

      // Get current user profile (requires authentication)
      'GET /me': async (c, ctx) => {
        ctx.requireAuth();

        const user = await ctx.resources.users.get(ctx.user.sub);

        if (!user) {
          return ctx.notFound('User not found');
        }

        return ctx.success({
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          scopes: user.scopes,
          bio: user.bio,
          avatar: user.avatar,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        });
      },

      // ============================================
      // Stats & Public Routes
      // ============================================

      // Stats endpoint
      'GET /stats': async (c, ctx) => {
        const stats = {
          users: await ctx.resources.users.count(),
          posts: await ctx.resources.posts.count(),
          comments: await ctx.resources.comments.count(),
          publishedPosts: await ctx.resources.posts.query({ status: 'published' }).then(r => r.length)
        };

        return ctx.success(stats);
      },

      // Popular posts
      'GET /posts/popular': async (c, ctx) => {
        const allPosts = await ctx.resources.posts.list({ limit: 100 });
        const popular = allPosts
          .filter(p => p.status === 'published')
          .sort((a, b) => b.views - a.views)
          .slice(0, 5);

        return ctx.success({ posts: popular });
      },

      // Post with comments
      'GET /posts/:id/with-comments': async (c, ctx) => {
        const postId = ctx.param('id');

        const post = await ctx.resources.posts.get(postId);
        if (!post) return ctx.notFound('Post not found');

        const postComments = await ctx.resources.comments.query({ postId });

        return ctx.success({
          post,
          comments: postComments,
          commentCount: postComments.length
        });
      },

      // Publish post (admin only)
      'POST /posts/:id/publish': async (c, ctx) => {
        ctx.requireAuth();
        ctx.requireScope('admin');

        const postId = ctx.param('id');
        const post = await ctx.resources.posts.get(postId);

        if (!post) return ctx.notFound('Post not found');

        const updated = await ctx.resources.posts.update(postId, {
          status: 'published',
          publishedAt: new Date().toISOString()
        });

        return ctx.success({ post: updated });
      },

      // Like post
      'POST /posts/:id/like': async (c, ctx) => {
        ctx.requireAuth();

        const postId = ctx.param('id');
        const post = await ctx.resources.posts.get(postId);

        if (!post) return ctx.notFound('Post not found');

        const updated = await ctx.resources.posts.update(postId, {
          likes: post.likes + 1
        });

        return ctx.success({ likes: updated.likes });
      },

      // Search posts
      'GET /search': async (c, ctx) => {
        const query = ctx.query('q');

        if (!query) {
          return ctx.error('Query parameter "q" is required', 400);
        }

        const allPosts = await ctx.resources.posts.list({ limit: 100 });
        const results = allPosts.filter(p =>
          p.title.toLowerCase().includes(query.toLowerCase()) ||
          p.content.toLowerCase().includes(query.toLowerCase())
        );

        return ctx.success({
          query,
          results: results.length,
          posts: results.slice(0, 10)
        });
      }
    }
  });

  await db.usePlugin(api);

  console.log('✅ API Server started!\n');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('📍 API Endpoints:\n');
  console.log('   🏠 Root:           http://localhost:3000/');
  console.log('   📚 Docs (Redoc):   http://localhost:3000/docs');
  console.log('   📋 OpenAPI:        http://localhost:3000/openapi.json');
  console.log('   🏥 Health:         http://localhost:3000/health');
  console.log('   📊 Metrics:        http://localhost:3000/metrics');
  console.log('   📈 Stats:          http://localhost:3000/stats\n');

  console.log('🔐 Test Credentials:\n');
  console.log('   Admin:');
  console.log('     Username: admin');
  console.log('     Password: admin123');
  console.log('     API Key:  admin-key-123\n');
  console.log('   User:');
  console.log('     Username: john');
  console.log('     Password: john123');
  console.log('     API Key:  user-key-456\n');

  console.log('🧪 Quick Test Commands:\n');
  console.log('   # Get stats (public)');
  console.log('   curl http://localhost:3000/stats\n');

  console.log('   # Register new user');
  console.log('   curl -X POST http://localhost:3000/register \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"username":"newuser","email":"newuser@demo.com","password":"password123"}\'\n');

  console.log('   # Login (get JWT token)');
  console.log('   curl -X POST http://localhost:3000/login \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"email":"john@demo.com","password":"john123"}\'\n');

  console.log('   # Get current user profile (with JWT)');
  console.log('   curl http://localhost:3000/me \\');
  console.log('     -H "Authorization: Bearer YOUR_JWT_TOKEN"\n');

  console.log('   # List posts (with API Key)');
  console.log('   curl http://localhost:3000/posts \\');
  console.log('     -H "X-API-Key: user-key-456"\n');

  console.log('   # Create post (with API Key)');
  console.log('   curl -X POST http://localhost:3000/posts \\');
  console.log('     -H "X-API-Key: user-key-456" \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"title":"My New Post","content":"This is my first post!"}\'\n');

  console.log('   # Search posts');
  console.log('   curl "http://localhost:3000/search?q=api"\n');

  console.log('   # Get popular posts');
  console.log('   curl http://localhost:3000/posts/popular\n');

  console.log('═══════════════════════════════════════════════════════\n');
  console.log('💡 Visit http://localhost:3000/docs to explore the API!\n');
  console.log('   Press Ctrl+C to stop the server\n');

  // Listen for events
  api.server.events.on('request:end', (data) => {
    if (data.path !== '/health' && !data.path.startsWith('/docs')) {
      console.log(`📥 ${data.method} ${data.path} - ${data.status} (${data.duration}ms)`);
    }
  });

  // Keep server running
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    await db.disconnect();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
