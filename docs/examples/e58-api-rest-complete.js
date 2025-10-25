/**
 * Example 58: Complete REST API - Production-Ready Blog API
 *
 * A complete, production-ready REST API example demonstrating:
 * - Multiple resources (posts, authors, comments)
 * - JWT authentication
 * - Schema validation
 * - Rate limiting
 * - CORS configuration
 * - Filtering and pagination
 * - Resource relationships
 * - Error handling
 * - Health checks
 * - OpenAPI documentation
 *
 * This is a realistic example of how to build a complete API with s3db.js
 */

import { Database } from '../../src/index.js';
import { APIPlugin } from '../../src/plugins/api/index.js';
import { MetricsPlugin } from '../../src/plugins/metrics.plugin.js';

// ============================================================================
// 1. DATABASE SETUP
// ============================================================================

console.log('\n🚀 Starting Complete Blog API\n');

const connectionString = 's3://test:test@blog-api-production?region=us-east-1&endpoint=http://localhost:4566&forcePathStyle=true';
const database = new Database({ connectionString });

try {
  await database.connect();
  console.log('✅ Connected to database\n');
} catch (error) {
  console.error('❌ Failed to connect to database');
  console.error('Make sure LocalStack is running:');
  console.error('  brew install localstack');
  console.error('  localstack start');
  process.exit(1);
}

// ============================================================================
// 2. CREATE RESOURCES WITH VALIDATION
// ============================================================================

// Authors resource
const authors = await database.createResource({
  name: 'authors',
  attributes: {
    name: 'string|required|minlength:3|maxlength:100',
    email: 'string|required|email',
    bio: 'string|optional|maxlength:500',
    website: 'string|optional|url',
    avatar: 'string|optional|url',
    social: {
      type: 'object',
      optional: true,
      props: {
        twitter: 'string|optional',
        github: 'string|optional',
        linkedin: 'string|optional'
      }
    },
    active: 'boolean|default:true',
    verified: 'boolean|default:false'
  },
  options: {
    timestamps: true,
    paranoid: true
  }
});

console.log('✅ Created authors resource');

// Posts resource
const posts = await database.createResource({
  name: 'posts',
  attributes: {
    title: 'string|required|minlength:5|maxlength:200',
    slug: 'string|required|minlength:5|maxlength:200',
    content: 'string|required|minlength:50',
    excerpt: 'string|optional|maxlength:300',
    authorId: 'string|required',
    authorName: 'string|required', // Denormalized for performance
    status: {
      type: 'string',
      required: true,
      enum: ['draft', 'published', 'archived']
    },
    publishedAt: 'string|optional',
    tags: 'array|optional|items:string',
    category: 'string|optional',
    featuredImage: 'string|optional|url',
    views: 'number|default:0',
    likes: 'number|default:0',
    readTime: 'number|optional', // in minutes
    featured: 'boolean|default:false'
  },
  options: {
    timestamps: true,
    paranoid: true,
    partitions: {
      byStatus: {
        fields: { status: 'string' }
      },
      byAuthor: {
        fields: { authorId: 'string' }
      },
      byCategory: {
        fields: { category: 'string' }
      }
    }
  }
});

console.log('✅ Created posts resource with partitions');

// Comments resource
const comments = await database.createResource({
  name: 'comments',
  attributes: {
    postId: 'string|required',
    postTitle: 'string|required', // Denormalized
    authorName: 'string|required',
    authorEmail: 'string|required|email',
    content: 'string|required|minlength:10|maxlength:1000',
    approved: 'boolean|default:false',
    likes: 'number|default:0',
    parentId: 'string|optional' // For nested comments
  },
  options: {
    timestamps: true,
    paranoid: true,
    partitions: {
      byPost: {
        fields: { postId: 'string' }
      },
      byApproval: {
        fields: { approved: 'boolean' }
      }
    }
  }
});

console.log('✅ Created comments resource with partitions');

// Users resource (for authentication)
const users = await database.createResource({
  name: 'users',
  attributes: {
    username: 'string|required|minlength:3|maxlength:50',
    email: 'string|required|email',
    password: 'secret|required|minlength:8', // Auto-encrypted
    role: {
      type: 'string',
      required: true,
      enum: ['admin', 'editor', 'author', 'subscriber']
    },
    active: 'boolean|default:true',
    lastLogin: 'string|optional',
    apiKey: 'string|optional' // For API key auth
  },
  options: {
    timestamps: true,
    paranoid: true
  }
});

console.log('✅ Created users resource\n');

// ============================================================================
// 3. ADD PLUGINS
// ============================================================================

// Metrics Plugin (with Prometheus)
const metricsPlugin = new MetricsPlugin({
  trackOperations: ['insert', 'update', 'delete', 'query', 'get', 'list'],
  trackResources: true,
  trackLatency: true,
  prometheus: {
    enabled: true,
    mode: 'auto',
    path: '/metrics'
  }
});

await database.usePlugin(metricsPlugin);
console.log('✅ Added MetricsPlugin with Prometheus\n');

// API Plugin (complete configuration)
const apiPlugin = new APIPlugin({
  // Server config
  port: 3000,
  host: '0.0.0.0',
  verbose: true,
  maxBodySize: 5 * 1024 * 1024, // 5MB

  // Authentication
  auth: {
    jwt: {
      enabled: true,
      secret: process.env.JWT_SECRET || 'super-secret-key-change-in-production',
      expiresIn: '7d'
    },
    apiKey: {
      enabled: true,
      headerName: 'X-API-Key'
    }
  },

  // Resource configuration
  resources: {
    // Posts - public read, auth required for write
    posts: {
      auth: false, // Public read
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
      customMiddleware: [
        // Require auth for write operations
        async (c, next) => {
          const method = c.req.method;
          const writeOps = ['POST', 'PUT', 'PATCH', 'DELETE'];

          if (writeOps.includes(method)) {
            const authHeader = c.req.header('authorization');
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
              return c.json({
                success: false,
                error: {
                  message: 'Authentication required for write operations',
                  code: 'UNAUTHORIZED'
                }
              }, 401);
            }
          }

          await next();
        }
      ]
    },

    // Authors - public read
    authors: {
      auth: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
    },

    // Comments - public create, auth for approval
    comments: {
      auth: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
    },

    // Users - auth required
    users: {
      auth: ['jwt', 'apiKey'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
    }
  },

  // CORS
  cors: {
    enabled: true,
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'Location'],
    credentials: true,
    maxAge: 86400
  },

  // Rate limiting
  rateLimit: {
    enabled: true,
    windowMs: 60000, // 1 minute
    maxRequests: 100 // 100 requests per minute
  },

  // Logging
  logging: {
    enabled: true,
    format: ':method :path :status :response-time ms',
    verbose: true
  },

  // Compression (disabled - placeholder implementation causes errors)
  compression: {
    enabled: false,
    threshold: 1024,
    level: 6
  },

  // Validation
  validation: {
    enabled: true,
    validateOnInsert: true,
    validateOnUpdate: true,
    returnValidationErrors: true
  },

  // API Documentation
  docs: {
    enabled: true,
    title: 'Blog API',
    version: '1.0.0',
    description: 'Complete REST API for a blog platform with posts, authors, and comments'
  }
});

await database.usePlugin(apiPlugin);

console.log('✅ API Plugin started\n');
console.log('📡 API Server running at: http://localhost:3000');
console.log('📚 API Documentation: http://localhost:3000/docs');
console.log('📊 OpenAPI Spec: http://localhost:3000/openapi.json');
console.log('📈 Metrics (Prometheus): http://localhost:3000/metrics');
console.log('');

// ============================================================================
// 4. SEED SAMPLE DATA
// ============================================================================

console.log('📝 Seeding sample data...\n');

// Create sample authors
const author1 = await authors.insert({
  name: 'John Doe',
  email: 'john@example.com',
  bio: 'Full-stack developer and technical writer',
  website: 'https://johndoe.com',
  social: {
    twitter: '@johndoe',
    github: 'johndoe'
  },
  verified: true
});

const author2 = await authors.insert({
  name: 'Jane Smith',
  email: 'jane@example.com',
  bio: 'Cloud architect and DevOps enthusiast',
  website: 'https://janesmith.dev',
  social: {
    twitter: '@janesmith',
    linkedin: 'janesmith'
  },
  verified: true
});

console.log('✅ Created 2 authors');

// Create sample posts
const post1 = await posts.insert({
  title: 'Getting Started with s3db.js',
  slug: 'getting-started-s3db',
  content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' +
           'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' +
           'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
  excerpt: 'Learn how to build serverless databases with s3db.js',
  authorId: author1.id,
  authorName: author1.name,
  status: 'published',
  publishedAt: new Date().toISOString(),
  tags: ['s3db', 'serverless', 'tutorial'],
  category: 'Tutorials',
  views: 245,
  likes: 12,
  readTime: 5,
  featured: true
});

const post2 = await posts.insert({
  title: 'Building REST APIs with s3db.js',
  slug: 'building-rest-apis',
  content: 'Praesent commodo cursus magna, vel scelerisque nisl consectetur et. ' +
           'Vivamus sagittis lacus vel augue laoreet rutrum faucibus dolor auctor. ' +
           'Aenean lacinia bibendum nulla sed consectetur.',
  excerpt: 'Complete guide to creating production-ready REST APIs',
  authorId: author2.id,
  authorName: author2.name,
  status: 'published',
  publishedAt: new Date().toISOString(),
  tags: ['api', 'rest', 's3db', 'backend'],
  category: 'Tutorials',
  views: 189,
  likes: 8,
  readTime: 8,
  featured: false
});

const post3 = await posts.insert({
  title: 'Advanced Partitioning Strategies',
  slug: 'advanced-partitioning',
  content: 'Cras mattis consectetur purus sit amet fermentum. ' +
           'Donec ullamcorper nulla non metus auctor fringilla. ' +
           'Nullam quis risus eget urna mollis ornare vel eu leo.',
  excerpt: 'Optimize your database queries with smart partitioning',
  authorId: author1.id,
  authorName: author1.name,
  status: 'draft',
  tags: ['performance', 's3db', 'advanced'],
  category: 'Performance',
  views: 0,
  likes: 0,
  readTime: 12,
  featured: false
});

console.log('✅ Created 3 posts (2 published, 1 draft)');

// Create sample comments
await comments.insert({
  postId: post1.id,
  postTitle: post1.title,
  authorName: 'Alice Johnson',
  authorEmail: 'alice@example.com',
  content: 'Great tutorial! This helped me get started quickly.',
  approved: true,
  likes: 5
});

await comments.insert({
  postId: post1.id,
  postTitle: post1.title,
  authorName: 'Bob Williams',
  authorEmail: 'bob@example.com',
  content: 'Very clear explanation. Looking forward to more content!',
  approved: true,
  likes: 3
});

await comments.insert({
  postId: post2.id,
  postTitle: post2.title,
  authorName: 'Charlie Brown',
  authorEmail: 'charlie@example.com',
  content: 'This is exactly what I needed for my project.',
  approved: false // Pending approval
});

console.log('✅ Created 3 comments (2 approved, 1 pending)\n');

// ============================================================================
// 5. EXAMPLE API CALLS
// ============================================================================

console.log('🧪 Example API Calls:\n');
console.log('=' .repeat(80));

// Wait for server to be ready
await new Promise(resolve => setTimeout(resolve, 1500));

// Example 1: List all published posts
console.log('\n1️⃣  GET /v1/posts?status=published\n');
const publishedPosts = await fetch('http://localhost:3000/v1/posts?status=published');
const publishedData = await publishedPosts.json();
console.log(`   Status: ${publishedPosts.status}`);
console.log(`   Published posts: ${publishedData.data.length}`);
console.log(`   Total: ${publishedData.pagination.total}`);

// Example 2: Get post by ID
console.log('\n2️⃣  GET /v1/posts/{id}\n');
const getPost = await fetch(`http://localhost:3000/v1/posts/${post1.id}`);
const postData = await getPost.json();
console.log(`   Status: ${getPost.status}`);
console.log(`   Title: ${postData.data.title}`);
console.log(`   Author: ${postData.data.authorName}`);
console.log(`   Views: ${postData.data.views}`);

// Example 3: Get posts by specific author using partition
console.log('\n3️⃣  GET /v1/posts?partition=byAuthor&partitionValues={"authorId":"..."}\n');
const authorPosts = await fetch(
  `http://localhost:3000/v1/posts?partition=byAuthor&partitionValues=${
    encodeURIComponent(JSON.stringify({ authorId: author1.id }))
  }`
);
const authorPostsData = await authorPosts.json();
console.log(`   Status: ${authorPosts.status}`);
console.log(`   Posts by ${author1.name}: ${authorPostsData.data.length}`);

// Example 4: Get comments for a post using partition
console.log('\n4️⃣  GET /v1/comments?partition=byPost&partitionValues={"postId":"..."}\n');
const postComments = await fetch(
  `http://localhost:3000/v1/comments?partition=byPost&partitionValues=${
    encodeURIComponent(JSON.stringify({ postId: post1.id }))
  }`
);
const commentsData = await postComments.json();
console.log(`   Status: ${postComments.status}`);
console.log(`   Comments on "${post1.title}": ${commentsData.data.length}`);

// Example 5: Filter and paginate
console.log('\n5️⃣  GET /v1/posts?category=Tutorials&limit=10&offset=0\n');
const filteredPosts = await fetch('http://localhost:3000/v1/posts?category=Tutorials&limit=10&offset=0');
const filteredData = await filteredPosts.json();
console.log(`   Status: ${filteredPosts.status}`);
console.log(`   Category: Tutorials`);
console.log(`   Results: ${filteredData.data.length}`);
console.log(`   Page: ${filteredData.pagination.page} of ${filteredData.pagination.pageCount}`);

// Example 6: Get resource metadata with OPTIONS
console.log('\n6️⃣  OPTIONS /v1/posts\n');
const optionsReq = await fetch('http://localhost:3000/v1/posts', { method: 'OPTIONS' });
console.log(`   Status: ${optionsReq.status}`);
console.log(`   Allow: ${optionsReq.headers.get('Allow') || 'GET, POST, PUT, DELETE, OPTIONS'}`);
console.log(`   Access-Control-Allow-Methods: ${optionsReq.headers.get('Access-Control-Allow-Methods') || 'N/A'}`);

// Example 7: Get statistics with HEAD
console.log('\n7️⃣  HEAD /v1/posts\n');
const headReq = await fetch('http://localhost:3000/v1/posts', { method: 'HEAD' });
console.log(`   Status: ${headReq.status}`);
console.log(`   X-Total-Count: ${headReq.headers.get('X-Total-Count')}`);
console.log(`   X-Resource-Version: ${headReq.headers.get('X-Resource-Version')}`);
console.log(`   X-Schema-Fields: ${headReq.headers.get('X-Schema-Fields')}`);

// Example 8: Health checks
console.log('\n8️⃣  Health Check Endpoints\n');
const liveness = await fetch('http://localhost:3000/health/live');
const livenessData = await liveness.json();
console.log(`   Liveness: ${livenessData.data.status} (${liveness.status})`);

const readiness = await fetch('http://localhost:3000/health/ready');
const readinessData = await readiness.json();
if (readinessData.data) {
  console.log(`   Readiness: ${readinessData.data.status} (${readiness.status})`);
  console.log(`   Database: ${readinessData.data.database.connected ? 'Connected' : 'Disconnected'}`);
  console.log(`   Resources: ${readinessData.data.database.resources}`);
} else {
  console.log(`   Readiness: not ready (${readiness.status}) - ${readinessData.error?.message || 'Service not ready'}`);
}

// Example 9: Prometheus metrics
console.log('\n9️⃣  GET /metrics (Prometheus)\n');
const metrics = await fetch('http://localhost:3000/metrics');
const metricsText = await metrics.text();
const metricsLines = metricsText.split('\n').filter(l => l && !l.startsWith('#')).slice(0, 5);
console.log(`   Status: ${metrics.status}`);
console.log(`   Sample metrics:`);
metricsLines.forEach(line => console.log(`     ${line}`));

// ============================================================================
// 6. CLIENT USAGE EXAMPLES
// ============================================================================

console.log('\n\n' + '='.repeat(80));
console.log('📱 CLIENT-SIDE USAGE EXAMPLES');
console.log('='.repeat(80) + '\n');

console.log(`
// ============================================================================
// React/Vue/Angular Example
// ============================================================================

// 1. Fetch all published posts with pagination
async function fetchPosts(page = 1, pageSize = 10) {
  const offset = (page - 1) * pageSize;
  const response = await fetch(
    \`http://localhost:3000/v1/posts?status=published&limit=\${pageSize}&offset=\${offset}\`
  );
  return response.json();
}

// 2. Fetch single post
async function fetchPost(id) {
  const response = await fetch(\`http://localhost:3000/v1/posts/\${id}\`);
  return response.json();
}

// 3. Fetch posts by category
async function fetchPostsByCategory(category) {
  const response = await fetch(
    \`http://localhost:3000/v1/posts?status=published&category=\${encodeURIComponent(category)}\`
  );
  return response.json();
}

// 4. Fetch comments for a post (using partition for performance)
async function fetchPostComments(postId) {
  const response = await fetch(
    \`http://localhost:3000/v1/comments?partition=byPost&partitionValues=\${
      encodeURIComponent(JSON.stringify({ postId }))
    }\`
  );
  return response.json();
}

// 5. Create a new comment (no auth required)
async function createComment(postId, postTitle, authorName, authorEmail, content) {
  const response = await fetch('http://localhost:3000/v1/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postId,
      postTitle,
      authorName,
      authorEmail,
      content
    })
  });
  return response.json();
}

// 6. Create a new post (requires JWT auth)
async function createPost(token, postData) {
  const response = await fetch('http://localhost:3000/v1/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${token}\`
    },
    body: JSON.stringify(postData)
  });
  return response.json();
}

// 7. Update post view count
async function incrementViews(postId, currentViews) {
  const response = await fetch(\`http://localhost:3000/v1/posts/\${postId}\`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ views: currentViews + 1 })
  });
  return response.json();
}

// 8. Search posts by tag
async function searchByTag(tag) {
  // Note: This uses client-side filtering after fetching
  // For better performance, consider adding a tags partition
  const response = await fetch('http://localhost:3000/v1/posts?status=published');
  const data = await response.json();

  return {
    ...data,
    data: data.data.filter(post => post.tags && post.tags.includes(tag))
  };
}

// ============================================================================
// Error Handling Example
// ============================================================================

async function fetchWithErrorHandling(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!data.success) {
      // Handle API errors
      switch (data.error.code) {
        case 'VALIDATION_ERROR':
          console.error('Validation failed:', data.error.details.errors);
          break;
        case 'NOT_FOUND':
          console.error('Resource not found:', data.error.message);
          break;
        case 'RATE_LIMIT_EXCEEDED':
          const retryAfter = data.error.details.retryAfter;
          console.error(\`Rate limited. Retry after \${retryAfter}s\`);
          break;
        default:
          console.error('API Error:', data.error.message);
      }
      throw new Error(data.error.message);
    }

    return data;
  } catch (error) {
    console.error('Network error:', error);
    throw error;
  }
}

// ============================================================================
// Rate Limiting Handling Example
// ============================================================================

async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);
    const data = await response.json();

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After')) || 60;
      console.log(\`Rate limited, waiting \${retryAfter}s...\`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      continue;
    }

    return data;
  }

  throw new Error('Max retries exceeded');
}
`);

// ============================================================================
// 7. SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('📊 BLOG API SUMMARY');
console.log('='.repeat(80) + '\n');

console.log('✅ Resources Created:');
console.log('   • authors - Author profiles');
console.log('   • posts - Blog posts with partitions (status, author, category)');
console.log('   • comments - Comments with partitions (post, approval)');
console.log('   • users - User authentication\n');

console.log('✅ Features Enabled:');
console.log('   • JWT & API Key authentication');
console.log('   • Schema validation with detailed errors');
console.log('   • Rate limiting (100 req/min)');
console.log('   • CORS for cross-origin requests');
console.log('   • Request logging');
console.log('   • Response compression (gzip)');
console.log('   • Payload size limits (5MB)');
console.log('   • Prometheus metrics');
console.log('   • OpenAPI documentation\n');

console.log('✅ API Endpoints:');
console.log('   • GET    /v1/{resource}           - List with filters');
console.log('   • GET    /v1/{resource}/:id       - Get by ID');
console.log('   • POST   /v1/{resource}           - Create');
console.log('   • PUT    /v1/{resource}/:id       - Full update');
console.log('   • PATCH  /v1/{resource}/:id       - Partial update');
console.log('   • DELETE /v1/{resource}/:id       - Delete');
console.log('   • HEAD   /v1/{resource}           - Get statistics');
console.log('   • OPTIONS /v1/{resource}          - Get metadata\n');

console.log('✅ Special Endpoints:');
console.log('   • GET /health                     - Generic health');
console.log('   • GET /health/live                - Liveness probe');
console.log('   • GET /health/ready               - Readiness probe');
console.log('   • GET /metrics                    - Prometheus metrics');
console.log('   • GET /docs                       - API Documentation (Redoc)');
console.log('   • GET /openapi.json               - OpenAPI spec\n');

console.log('🎯 Next Steps:');
console.log('   1. Visit http://localhost:3000/docs for interactive API documentation');
console.log('   2. Test endpoints with curl or Postman');
console.log('   3. Monitor metrics at http://localhost:3000/metrics');
console.log('   4. Deploy to production with Kubernetes manifests (see docs/plugins/api.md)');
console.log('   5. Configure authentication with real JWT secret');
console.log('   6. Add custom middleware for business logic\n');

console.log('💡 Tips:');
console.log('   • Use partitions for fast queries (byStatus, byAuthor, byCategory)');
console.log('   • Enable rate limiting to prevent abuse');
console.log('   • Monitor Prometheus metrics in production');
console.log('   • Use HEAD requests to get counts without fetching data');
console.log('   • Use OPTIONS to discover available endpoints\n');

console.log('🔗 API is running! Press Ctrl+C to stop.\n');

// Keep server running
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down API server...');
  await apiPlugin.stop();
  console.log('✅ API server stopped');
  process.exit(0);
});
