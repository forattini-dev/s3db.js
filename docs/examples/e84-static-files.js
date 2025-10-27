/**
 * Example 84: Static File Serving
 *
 * Demonstrates how to serve static files from filesystem or S3 using
 * the API Plugin's static file serving feature.
 *
 * Features:
 * - Filesystem driver (local directory)
 * - S3 driver (S3 bucket with streaming or presigned URL modes)
 * - ETag support (304 Not Modified responses)
 * - Cache-Control headers
 * - CORS support
 * - Range requests (partial content)
 * - Directory index files
 *
 * Run:
 *   node docs/examples/e84-static-files.js
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_PORT = 3000;

async function setupStaticFiles() {
  // Create example static files directory
  const staticDir = path.join(__dirname, 'static-example');

  if (!existsSync(staticDir)) {
    mkdirSync(staticDir, { recursive: true });
  }

  // Create example HTML file
  writeFileSync(
    path.join(staticDir, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Static Files Example</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .card {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 {
      color: #333;
      margin-top: 0;
    }
    p {
      color: #666;
      line-height: 1.6;
    }
    .status {
      background: #4CAF50;
      color: white;
      padding: 10px 20px;
      border-radius: 4px;
      display: inline-block;
      margin-top: 20px;
    }
    a {
      color: #2196F3;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Static File Serving Example</h1>
    <p>This page is being served from the local filesystem using s3db.js API Plugin!</p>

    <h2>Available Endpoints:</h2>
    <ul>
      <li><a href="/public/index.html">/public/index.html</a> - This page (filesystem)</li>
      <li><a href="/public/test.txt">/public/test.txt</a> - Plain text file (filesystem)</li>
      <li><a href="/public/data.json">/public/data.json</a> - JSON file (filesystem)</li>
      <li><a href="/uploads/example.txt">/uploads/example.txt</a> - From S3 bucket (if configured)</li>
      <li><a href="/api/docs">/api/docs</a> - API Documentation</li>
    </ul>

    <div class="status">✓ Static files working!</div>
  </div>
</body>
</html>`
  );

  // Create example text file
  writeFileSync(
    path.join(staticDir, 'test.txt'),
    'Hello from static filesystem!\n\nThis is a plain text file served by s3db.js API Plugin.'
  );

  // Create example JSON file
  writeFileSync(
    path.join(staticDir, 'data.json'),
    JSON.stringify({
      message: 'Hello from static filesystem',
      timestamp: new Date().toISOString(),
      features: [
        'ETag support',
        'Cache-Control headers',
        'Range requests',
        'CORS support',
        'Directory index files'
      ]
    }, null, 2)
  );

  console.log(`✓ Created static files in: ${staticDir}\n`);

  return staticDir;
}

async function setupDatabase() {
  // Create database
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/static-files-example',
    encryptionKey: 'static-files-encryption-key-32chars!'
  });

  await db.connect();

  // Create a simple resource (for demonstration)
  await db.createResource({
    name: 'files',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      url: 'string|required',
      size: 'number|optional'
    },
    timestamps: true
  });

  // Upload a sample file to S3 (for S3 static serving demo)
  try {
    await db.client.putObject({
      Bucket: 'static-files-example',
      Key: 'uploads/example.txt',
      Body: 'Hello from S3!\n\nThis file is stored in an S3 bucket and served by s3db.js API Plugin.',
      ContentType: 'text/plain'
    });
    console.log('✓ Uploaded sample file to S3\n');
  } catch (err) {
    console.warn('⚠️  Could not upload to S3 (bucket might not exist yet)\n');
  }

  return db;
}

async function setupAPI(db, staticDir) {
  // Create API Plugin with static file serving
  const apiPlugin = new ApiPlugin({
    port: APP_PORT,
    verbose: true,

    // ✨ NEW: Static file serving configuration
    static: [
      // Filesystem driver - serve local directory
      {
        driver: 'filesystem',
        path: '/public',           // Mount at /public/*
        root: staticDir,           // Root directory
        config: {
          index: ['index.html'],   // Directory index files
          fallback: false,         // No fallback for this path
          maxAge: 86400000,        // Cache for 24 hours (milliseconds)
          dotfiles: 'ignore',      // Ignore dotfiles (.env, .git, etc.)
          etag: true,              // Enable ETag (304 responses)
          cors: true               // Enable CORS
        }
      },

      // 🔥 NEW: Example for SPA (React Router, Vue Router, etc.)
      // Uncomment to serve a React app with client-side routing
      // {
      //   driver: 'filesystem',
      //   path: '/app',            // Mount React app at /app/*
      //   root: './build',         // React build directory
      //   config: {
      //     fallback: 'index.html', // ⭐ Fallback to index.html for SPA routing!
      //     maxAge: 3600000,       // Cache for 1 hour
      //     etag: true,
      //     cors: true
      //   }
      // },

      // S3 driver - serve from S3 bucket (streaming mode)
      {
        driver: 's3',
        path: '/uploads',          // Mount at /uploads/*
        bucket: 'static-files-example',  // S3 bucket name
        prefix: 'uploads/',        // S3 key prefix
        config: {
          streaming: true,         // Stream through server (false = redirect to presigned URL)
          maxAge: 3600000,         // Cache for 1 hour
          etag: true,              // Enable ETag
          cors: true,              // Enable CORS
          contentDisposition: 'inline',  // Display in browser (not download)
          signedUrlExpiry: 300     // Presigned URL expiry (if streaming: false)
        }
      }

      // You can add more mount points as needed:
      // {
      //   driver: 's3',
      //   path: '/downloads',
      //   bucket: 'my-downloads',
      //   config: {
      //     streaming: false,           // Redirect to presigned URL (faster!)
      //     contentDisposition: 'attachment'  // Force download
      //   }
      // }
    ],

    // Resource configuration
    resources: {
      files: {
        versionPrefix: 'v1',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
      }
    }
  });

  await db.usePlugin(apiPlugin);

  return apiPlugin;
}

function printUsage() {
  const baseUrl = `http://localhost:${APP_PORT}`;

  console.log(`\n🚀 API Server running at: ${baseUrl}`);
  console.log('\n📋 Static File Endpoints:\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📁 FILESYSTEM DRIVER (local files)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  GET  ${baseUrl}/public/             - Directory index (index.html)`);
  console.log(`  GET  ${baseUrl}/public/index.html   - HTML page`);
  console.log(`  GET  ${baseUrl}/public/test.txt     - Plain text file`);
  console.log(`  GET  ${baseUrl}/public/data.json    - JSON file`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('☁️  S3 DRIVER (S3 bucket)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  GET  ${baseUrl}/uploads/example.txt - File from S3 (streaming mode)`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 TESTING EXAMPLES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('1️⃣  Open in browser:');
  console.log(`   ${baseUrl}/public/\n`);

  console.log('2️⃣  Test ETag (304 Not Modified):');
  console.log(`   curl -I ${baseUrl}/public/index.html  # Get ETag`);
  console.log(`   curl -I -H "If-None-Match: <etag>" ${baseUrl}/public/index.html\n`);

  console.log('3️⃣  Test Range requests (partial content):');
  console.log(`   curl -H "Range: bytes=0-99" ${baseUrl}/public/test.txt\n`);

  console.log('4️⃣  Test S3 file:');
  console.log(`   curl ${baseUrl}/uploads/example.txt\n`);

  console.log('5️⃣  Test CORS:');
  console.log(`   curl -H "Origin: https://example.com" -I ${baseUrl}/public/test.txt\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📖 CONFIGURATION OPTIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Filesystem Driver:');
  console.log('  root           - Root directory to serve files from');
  console.log('  index          - Index files for directories (default: ["index.html"])');
  console.log('  fallback       - Fallback file for SPA routing (e.g., "index.html", true, or false)');
  console.log('                   ⭐ Use for React Router, Vue Router, etc.');
  console.log('  maxAge         - Cache max-age in milliseconds (default: 0)');
  console.log('  dotfiles       - Handle dotfiles: "ignore", "allow", "deny" (default: "ignore")');
  console.log('  etag           - Enable ETag generation (default: true)');
  console.log('  cors           - Enable CORS headers (default: false)\n');

  console.log('S3 Driver:');
  console.log('  bucket         - S3 bucket name (required)');
  console.log('  prefix         - S3 key prefix (default: "")');
  console.log('  streaming      - Stream through server (true) or redirect to presigned URL (false)');
  console.log('  signedUrlExpiry- Presigned URL expiry in seconds (default: 300)');
  console.log('  maxAge         - Cache max-age in milliseconds (default: 0)');
  console.log('  cacheControl   - Custom Cache-Control header');
  console.log('  contentDisposition - "inline" or "attachment" (default: "inline")');
  console.log('  etag           - Enable ETag support (default: true)');
  console.log('  cors           - Enable CORS headers (default: false)\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✨ FEATURES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  ✓ ETag support (304 Not Modified responses)');
  console.log('  ✓ Range requests (206 Partial Content)');
  console.log('  ✓ Cache-Control headers');
  console.log('  ✓ CORS support');
  console.log('  ✓ Directory index files');
  console.log('  ✓ Content-Type detection');
  console.log('  ✓ Path traversal prevention');
  console.log('  ✓ S3 streaming or presigned URL redirect\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 SPA (REACT ROUTER) SETUP');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('For React apps with React Router (or any SPA framework):');
  console.log('');
  console.log('1. Build your React app:');
  console.log('   npm run build');
  console.log('');
  console.log('2. Configure static serving with fallback:');
  console.log('   {');
  console.log('     driver: "filesystem",');
  console.log('     path: "/app",');
  console.log('     root: "./build",');
  console.log('     config: {');
  console.log('       fallback: "index.html",  // ⭐ Key for SPA routing!');
  console.log('       maxAge: 3600000,');
  console.log('       etag: true');
  console.log('     }');
  console.log('   }');
  console.log('');
  console.log('3. Access your app:');
  console.log('   GET /app/              → serves index.html');
  console.log('   GET /app/login         → serves index.html (React Router handles /login)');
  console.log('   GET /app/dashboard     → serves index.html (React Router handles /dashboard)');
  console.log('   GET /app/static/css/*  → serves actual CSS files');
  console.log('');
  console.log('How it works:');
  console.log('  - If file exists (like /app/static/js/main.js) → serve it');
  console.log('  - If file NOT exists (like /app/dashboard) → serve index.html');
  console.log('  - React Router takes over and renders the correct component');
  console.log('');

  console.log('✅ Server ready!\n');
}

async function main() {
  console.log('🌐 Setting up Static File Serving Example...\n');

  const staticDir = await setupStaticFiles();
  const db = await setupDatabase();
  const apiPlugin = await setupAPI(db, staticDir);

  printUsage();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    await apiPlugin.stop();
    await db.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);
