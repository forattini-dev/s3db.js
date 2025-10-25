# Troubleshooting: ERR_CONTENT_DECODING_FAILED

## Problem

When accessing API endpoints or `/docs`, browser shows error:

```
net::ERR_CONTENT_DECODING_FAILED 200 (OK)
```

This error occurs when the server sends `Content-Encoding: gzip` (or `deflate`) headers but the response body is **not actually compressed**.

---

## Quick Fix

### Step 1: Check Your API Plugin Configuration

Make sure compression is **NOT enabled**:

```javascript
const apiPlugin = new ApiPlugin({
  port: 3000,

  // ❌ BAD - Don't enable this (not fully implemented)
  // compression: { enabled: true },

  // ✅ GOOD - Keep compression disabled (default)
  compression: { enabled: false },  // or omit entirely

  resources: { /* ... */ }
});
```

### Step 2: Clear Browser Cache

1. **Chrome/Edge**: Press `Ctrl+Shift+Del` → Clear cached images and files
2. **Firefox**: Press `Ctrl+Shift+Del` → Cached web content
3. **Safari**: Preferences → Privacy → Manage Website Data → Remove All

Or try **hard reload**: `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac)

### Step 3: Test with curl

```bash
# Check headers
curl -I http://localhost:3000/v1/resource

# Should NOT see:
# Content-Encoding: gzip
# Content-Encoding: deflate
```

If you see `Content-Encoding` header, compression is still enabled somewhere.

---

## Root Causes

### 1. Compression Enabled in Config

**Problem:**
```javascript
const apiPlugin = new ApiPlugin({
  compression: { enabled: true }  // ❌ Don't do this
});
```

**Solution:**
```javascript
const apiPlugin = new ApiPlugin({
  compression: { enabled: false }  // ✅ or omit entirely
});
```

**Why:** The compression middleware in s3db.js v13.0.0 is a placeholder and doesn't actually compress data. It was sending headers without compression, causing this error.

**Status:** Fixed in commit `e701dab` (removed fake headers).

---

### 2. Reverse Proxy Adding Headers

**Problem:** Nginx, Apache, or CDN might be adding compression headers.

**Check Nginx config:**
```nginx
# /etc/nginx/nginx.conf or /etc/nginx/sites-available/your-site

server {
  # If you see this:
  gzip on;
  gzip_types application/json;

  # Make sure it's actually compressing, or disable it:
  gzip off;
}
```

**Check Apache config:**
```apache
# .htaccess or apache2.conf

# If you see this:
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE application/json
</IfModule>

# Disable it or ensure mod_deflate is working
```

**Solution:** Either disable compression at proxy level or ensure it's actually working.

---

### 3. CDN or Load Balancer

**Problem:** CloudFlare, AWS CloudFront, or load balancers might auto-enable compression.

**CloudFlare:**
1. Go to Speed → Optimization
2. Check "Auto Minify" settings
3. Disable compression or ensure it's working correctly

**AWS CloudFront:**
1. Check Distribution Settings
2. Look for "Compress Objects Automatically"
3. Either disable or configure properly

---

### 4. Middleware Conflict

**Problem:** Another Express/Hono middleware adding compression.

**Check your code:**
```javascript
// ❌ Don't add compression middleware manually
app.use(compression());

// If you need compression, use a proper implementation
import compression from 'compression';
app.use(compression());  // This actually works
```

---

## Testing

### Test Script

Create `test-compression.js`:

```javascript
import { Database, ApiPlugin } from 's3db.js';

const db = new Database({ client: 'memory' });

const test = await db.createResource({
  name: 'test',
  attributes: { value: 'number|required' }
});

await test.insert({ value: 123 });

const apiPlugin = new ApiPlugin({
  port: 3000,
  compression: { enabled: false },  // Explicitly disabled
  resources: { test: {} }
});

await db.install(apiPlugin);
await db.start();

console.log('Test: http://localhost:3000/v1/test');
console.log('Docs: http://localhost:3000/docs');
```

Run:
```bash
node test-compression.js
```

### Test with curl

```bash
# Test endpoint
curl -v http://localhost:3000/v1/test 2>&1 | grep -i "content-encoding"

# Should return nothing (no Content-Encoding header)
```

### Test in Browser

1. Open DevTools (F12)
2. Go to Network tab
3. Navigate to `http://localhost:3000/v1/test`
4. Click on the request
5. Check Response Headers
6. **Should NOT see:** `Content-Encoding: gzip`

---

## Verify Fix

### Before Fix (v12.x)

```bash
$ curl -I http://localhost:3000/v1/test

HTTP/1.1 200 OK
Content-Type: application/json
Content-Encoding: gzip    # ❌ BAD - not actually compressed
```

Browser shows: `ERR_CONTENT_DECODING_FAILED`

### After Fix (v13.0.0)

```bash
$ curl -I http://localhost:3000/v1/test

HTTP/1.1 200 OK
Content-Type: application/json
# ✅ GOOD - No Content-Encoding header
```

Browser shows: JSON response correctly

---

## If Problem Persists

### 1. Check s3db.js Version

```bash
cd s3db.js
git log --oneline -1

# Should see commit e701dab or later
# e701dab docs: add comprehensive MLPlugin documentation and bump to v13.0.0
```

### 2. Restart Everything

```bash
# Stop server
pkill -f "node.*examples"

# Clear node cache
rm -rf node_modules/.cache

# Restart server
node your-app.js
```

### 3. Check Network

```bash
# Test directly (bypass proxy)
curl -v http://127.0.0.1:3000/v1/test

# Compare with:
curl -v http://localhost:3000/v1/test
```

If direct works but localhost doesn't, there's a proxy in between.

### 4. Check Node.js Version

```bash
node --version
# Should be v18+ or v20+
```

### 5. Enable Verbose Logging

```javascript
const apiPlugin = new ApiPlugin({
  verbose: true,  // Enable logging
  logging: { enabled: true, verbose: true }
});
```

Check logs for suspicious headers.

---

## Prevention

### 1. Always Disable Compression

```javascript
// In your API Plugin config
const apiPlugin = new ApiPlugin({
  // Explicitly disable until properly implemented
  compression: { enabled: false },

  // Or omit entirely (default is false)
});
```

### 2. Use Environment Check

```javascript
const apiPlugin = new ApiPlugin({
  compression: {
    // Only enable if you have proper implementation
    enabled: process.env.ENABLE_COMPRESSION === 'true'
  }
});
```

### 3. Add Health Check

```javascript
// Test endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    compression: 'disabled',
    headers: Object.fromEntries(c.req.headers)
  });
});
```

Access `http://localhost:3000/health` and verify no `content-encoding` in response.

---

## Related Issues

- **Issue:** Browser shows white page or "Failed to decode response"
- **Issue:** `/docs` endpoint not loading
- **Issue:** JSON responses showing garbled text
- **Issue:** `ERR_INVALID_RESPONSE` in Chrome

All related to same root cause: compression headers without actual compression.

---

## Future Implementation

Proper compression support will be added in a future version. It requires:

1. Importing `zlib` module
2. Streaming response body through `gzip`/`deflate`
3. Setting correct `Content-Encoding` and `Content-Length` headers
4. Handling edge cases (already compressed, small responses, etc.)

For now, **keep compression disabled**.

---

## Summary

**Problem:** `ERR_CONTENT_DECODING_FAILED`
**Cause:** Server sends compression headers without compressing
**Fix:** Disable compression in API Plugin config
**Status:** Fixed in s3db.js v13.0.0 (commit e701dab)

---

## Need Help?

- **GitHub Issues:** https://github.com/forattini-dev/s3db.js/issues
- **Discussions:** https://github.com/forattini-dev/s3db.js/discussions

Include:
- s3db.js version
- Node.js version
- API Plugin configuration
- Output of `curl -I http://localhost:3000/v1/resource`
- Browser console errors
