# 📁 Static File Serving

> **Quick Jump:** [💾 Filesystem](#filesystem-driver) | [☁️ S3 Driver](#s3-driver) | [⚛️ SPA Support](#spa-single-page-application-support) | [🔐 With Auth](#combining-with-authentication) | [⚙️ Config](#configuration-options)

> **Navigation:** [← Back to API Plugin](../api.md) | [Authentication →](./authentication.md) | [Configuration →](./configuration.md)

---

## Overview

The API Plugin can serve static files from the filesystem or S3, making it ideal for:
- Serving React/Vue/Angular applications
- Hosting static assets (images, CSS, JavaScript)
- Delivering user-uploaded content from S3
- Serving documentation or landing pages

The API Plugin supports **two drivers** for static file serving:

| Driver | Purpose | Features |
|--------|---------|----------|
| **filesystem** | Serve files from local directory | ETag, Range requests, Directory index, SPA fallback |
| **s3** | Serve files from S3 bucket | Streaming or presigned URL redirect, ETag, Range requests |

Both drivers support:
- ✅ **ETag support** (304 Not Modified responses)
- ✅ **Range requests** (206 Partial Content for video/audio streaming)
- ✅ **Cache-Control headers** (client-side caching)
- ✅ **CORS support** (cross-origin requests)
- ✅ **Content-Type detection** (automatic MIME type detection)
- ✅ **Path traversal prevention** (security)

---

## Filesystem Driver

Serve files from a local directory.

**Basic Configuration:**

```javascript
import { ApiPlugin } from 's3db.js';

await db.usePlugin(new ApiPlugin({
  port: 3000,

  // Static file configuration
  static: [
    {
      driver: 'filesystem',
      path: '/public',           // Mount point (/public/*)
      root: './static',          // Local directory to serve from
      config: {
        index: ['index.html'],   // Directory index files
        fallback: false,         // No fallback (404 for missing files)
        maxAge: 86400000,        // Cache for 24 hours (milliseconds)
        dotfiles: 'ignore',      // Ignore dotfiles (.env, .git, etc.)
        etag: true,              // Enable ETag (304 responses)
        cors: true               // Enable CORS
      }
    }
  ]
}));
```

**Examples:**
- `GET /public/index.html` → serves `./static/index.html`
- `GET /public/images/logo.png` → serves `./static/images/logo.png`
- `GET /public/` → serves `./static/index.html` (directory index)

---

## SPA (Single Page Application) Support

For React Router, Vue Router, or any client-side routing framework, use the `fallback` option to serve `index.html` for non-existent routes:

```javascript
static: [
  {
    driver: 'filesystem',
    path: '/app',              // Mount React app at /app/*
    root: './build',           // React build directory
    config: {
      fallback: 'index.html',  // ⭐ Serve index.html for missing files
      maxAge: 3600000,         // Cache for 1 hour
      etag: true,
      cors: true
    }
  }
]
```

**How it works:**
- `GET /app/` → serves `./build/index.html`
- `GET /app/login` → serves `./build/index.html` (file doesn't exist, fallback kicks in)
- `GET /app/dashboard` → serves `./build/index.html` (React Router handles routing)
- `GET /app/static/js/main.js` → serves `./build/static/js/main.js` (file exists, serve it)

**Fallback Options:**
- `fallback: 'index.html'` - Serve specific file for 404s
- `fallback: true` - Serve `index.html` from root for 404s
- `fallback: false` - Return 404 for missing files (default)

---

## S3 Driver

Serve files directly from an S3 bucket.

**Basic Configuration:**

```javascript
static: [
  {
    driver: 's3',
    path: '/uploads',                 // Mount point (/uploads/*)
    bucket: 'my-uploads-bucket',      // S3 bucket name
    prefix: 'public/',                // S3 key prefix (optional)
    config: {
      streaming: true,                // Stream through server (false = presigned URL redirect)
      maxAge: 3600000,                // Cache for 1 hour
      etag: true,                     // Enable ETag
      cors: true,                     // Enable CORS
      contentDisposition: 'inline',   // Display in browser ('attachment' = force download)
      signedUrlExpiry: 300            // Presigned URL expiry (seconds, if streaming: false)
    }
  }
]
```

**Examples:**
- `GET /uploads/profile.jpg` → serves `s3://my-uploads-bucket/public/profile.jpg`
- `GET /uploads/documents/report.pdf` → serves `s3://my-uploads-bucket/public/documents/report.pdf`

---

## Streaming vs Presigned URL Redirect

The S3 driver supports two modes:

**1. Streaming (streaming: true)**
```javascript
config: {
  streaming: true  // Server fetches from S3 and streams to client
}
```
- ✅ Server proxies the file
- ✅ Better for small files or when S3 is private
- ✅ Allows middleware/authentication before serving
- ⚠️ Higher server bandwidth usage
- ⚠️ Slower than direct S3 access

**2. Presigned URL Redirect (streaming: false)**
```javascript
config: {
  streaming: false,       // Redirect client to presigned S3 URL
  signedUrlExpiry: 300    // URL valid for 5 minutes
}
```
- ✅ Client downloads directly from S3 (fastest)
- ✅ Lower server bandwidth usage
- ✅ Better for large files (videos, downloads)
- ⚠️ Exposes S3 URL to client (temporary)
- ⚠️ Less control over delivery

---

## Multiple Mount Points

You can configure multiple static file locations:

```javascript
static: [
  // Serve React app
  {
    driver: 'filesystem',
    path: '/app',
    root: './build',
    config: { fallback: 'index.html', maxAge: 3600000 }
  },

  // Serve public assets
  {
    driver: 'filesystem',
    path: '/public',
    root: './static',
    config: { maxAge: 86400000, cors: true }
  },

  // Serve user uploads from S3 (streaming)
  {
    driver: 's3',
    path: '/uploads',
    bucket: 'user-uploads',
    prefix: 'public/',
    config: { streaming: true, maxAge: 3600000 }
  },

  // Serve large downloads from S3 (presigned redirect)
  {
    driver: 's3',
    path: '/downloads',
    bucket: 'downloads',
    config: {
      streaming: false,
      signedUrlExpiry: 900,
      contentDisposition: 'attachment'  // Force download
    }
  }
]
```

---

## Configuration Options

### Filesystem Driver Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `root` | string | Required | Root directory to serve files from |
| `index` | string[] | `['index.html']` | Directory index files |
| `fallback` | string\|boolean | `false` | Fallback file for SPA routing (e.g., 'index.html') |
| `maxAge` | number | `0` | Cache max-age in milliseconds |
| `dotfiles` | string | `'ignore'` | Handle dotfiles: 'ignore', 'allow', 'deny' |
| `etag` | boolean | `true` | Enable ETag generation |
| `cors` | boolean | `false` | Enable CORS headers |

### S3 Driver Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bucket` | string | Required | S3 bucket name |
| `prefix` | string | `''` | S3 key prefix |
| `streaming` | boolean | `true` | Stream through server (false = redirect to presigned URL) |
| `signedUrlExpiry` | number | `300` | Presigned URL expiry in seconds (if streaming: false) |
| `maxAge` | number | `0` | Cache max-age in milliseconds |
| `cacheControl` | string | - | Custom Cache-Control header |
| `contentDisposition` | string | `'inline'` | 'inline' or 'attachment' |
| `etag` | boolean | `true` | Enable ETag support |
| `cors` | boolean | `false` | Enable CORS headers |

---

## Combining with Authentication

Static files can be protected using **path-based authentication**:

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,

  auth: {
    drivers: [
      {
        driver: 'jwt',
        config: { secret: 'jwt-secret' }
      }
    ],
    resource: 'users',

    // Path-based auth
    pathAuth: [
      {
        pattern: '/auth/**',
        required: false  // Login public
      },
      {
        pattern: '/app/**',
        drivers: ['jwt'],
        required: true   // Protected React app
      },
      {
        pattern: '/public/**',
        required: false  // Public assets
      }
    ]
  },

  // Static files
  static: [
    {
      driver: 'filesystem',
      path: '/app',
      root: './build',
      config: { fallback: 'index.html' }
    },
    {
      driver: 'filesystem',
      path: '/public',
      root: './static',
      config: { maxAge: 86400000 }
    }
  ]
}));
```

**Flow:**
1. User visits `/app` → 401 Unauthorized (no JWT)
2. User visits `/auth/login` → Public login page
3. User logs in → Gets JWT token
4. User visits `/app` with JWT → Serves React app
5. React Router handles client-side routing (`/app/dashboard`, etc.)

---

## Advanced Features

### ETag Support (304 Not Modified)

Both drivers automatically generate ETags for efficient caching:

```bash
# First request - returns full file
curl -I http://localhost:3000/public/index.html
# HTTP/1.1 200 OK
# ETag: "abc123xyz"

# Subsequent request with ETag - returns 304 if unchanged
curl -I -H "If-None-Match: abc123xyz" http://localhost:3000/public/index.html
# HTTP/1.1 304 Not Modified
```

### Range Requests (Partial Content)

Support for video/audio streaming:

```bash
# Request first 100 bytes
curl -H "Range: bytes=0-99" http://localhost:3000/videos/movie.mp4
# HTTP/1.1 206 Partial Content
# Content-Range: bytes 0-99/1000000
```

### CORS Headers

Enable cross-origin requests:

```javascript
config: {
  cors: true  // Adds CORS headers to responses
}
```

---

## Use Cases

**1. Serve React App with API**
```javascript
static: [
  {
    driver: 'filesystem',
    path: '/app',
    root: './build',
    config: { fallback: 'index.html' }
  }
],
resources: {
  orders: { auth: true }
}
// GET /app → React app
// GET /api/v1/orders → API endpoint
```

**2. Public Landing Page + Protected Dashboard**
```javascript
static: [
  {
    driver: 'filesystem',
    path: '/',
    root: './landing',
    config: { index: ['index.html'] }
  },
  {
    driver: 'filesystem',
    path: '/dashboard',
    root: './dashboard-build',
    config: { fallback: 'index.html' }
  }
],
pathAuth: [
  { pattern: '/', required: false },
  { pattern: '/dashboard/**', drivers: ['jwt'], required: true }
]
```

**3. User Uploads from S3**
```javascript
static: [
  {
    driver: 's3',
    path: '/uploads',
    bucket: 'user-uploads',
    config: {
      streaming: true,
      contentDisposition: 'inline'
    }
  }
]
// GET /uploads/avatars/user123.jpg → Serves from S3
```

---

## Examples

- **[Example 84: Static File Serving](../../examples/e84-static-files.js)** - Filesystem + S3 drivers, ETag, Range requests, CORS
- **[Example 85: Protected SPA](../../examples/e85-protected-spa.js)** - React app with JWT authentication and pathAuth
- **[Example 87: OIDC + API Token Cookie](../../examples/e87-oidc-api-token-cookie.js)** - OIDC login with static file serving

---

## 🎯 Summary

You learned:
- ✅ **Filesystem Driver** - Serve local files with ETag, Range requests, directory index
- ✅ **S3 Driver** - Serve files from S3 with streaming or presigned URL redirect
- ✅ **SPA Support** - Fallback to index.html for client-side routing (React Router, Vue Router)
- ✅ **Multiple Mount Points** - Serve different directories/buckets at different paths
- ✅ **Authentication Integration** - Protect static files with path-based authentication
- ✅ **Advanced Features** - ETag (304), Range requests (206), CORS, cache control

**Next Steps:**
1. Protect your SPA: [Authentication →](./authentication.md)
2. Add API endpoints: [API Plugin →](../api.md)
3. Try basic example: [Example 84](../../examples/e84-static-files.js)
4. Try protected SPA: [Example 85](../../examples/e85-protected-spa.js)
5. Deploy to production: [Deployment →](./deployment.md)

---

## 🔗 See Also

**Related Documentation:**
- [API Plugin](../api.md) - Main API Plugin documentation
- [Authentication](./authentication.md) - Protect static files with auth
- [Guards](./guards.md) - Authorization for API endpoints
- [Configuration](./configuration.md) - Complete configuration reference
- [Deployment](./deployment.md) - Production deployment guide

**Examples:**
- [e84-static-files.js](../../examples/e84-static-files.js) - Filesystem + S3, all features
- [e85-protected-spa.js](../../examples/e85-protected-spa.js) - Protected React app with JWT
- [e87-oidc-api-token-cookie.js](../../examples/e87-oidc-api-token-cookie.js) - OIDC + SPA
- [e47-api-plugin-basic.js](../../examples/e47-api-plugin-basic.js) - API + static files

---

> **Navigation:** [← Back to API Plugin](../api.md) | [Authentication →](./authentication.md) | [Configuration →](./configuration.md)
