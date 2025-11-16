# API Plugin - Optional Dependencies

The API Plugin uses a modular dependency system to keep the core package lightweight. Install only the features you need.

## Core Dependencies

### Required

**hono** - Web framework for building the API server
```bash
npm install hono
```

**Why it's required:** The API Plugin is built on top of Hono for routing, middleware, and HTTP handling.

**Package size:** ~50KB

---

## Optional Dependencies

### HTTP Request Logging

**pino-http** - Enhanced HTTP request/response logging (optional)
```bash
npm install pino-http
```

**Why it's optional:** The API Plugin includes a built-in simple HTTP logger that works without any dependencies. Install `pino-http` for enhanced features and better performance.

**Package size:** ~20KB

**Usage:**
```javascript
const api = new APIPlugin({
  port: 3000,
  httpLogger: {
    enabled: true,
    autoLogging: true,
    ignorePaths: ['/health']
  }
});
```

**Features Comparison:**

| Feature | With pino-http | Without (built-in) |
|---------|---------------|-------------------|
| Request/Response logging | ✅ Full | ✅ Basic |
| Request ID correlation | ✅ Automatic | ✅ Manual |
| Custom serializers | ✅ Yes | ✅ Basic |
| Error serialization | ✅ toJSON() | ✅ toJSON() |
| Path filtering | ✅ Yes | ✅ Yes |
| Performance | ⚡ Optimized | ⚡ Good |
| Installation required | ❌ Optional | ✅ Built-in |

**Smart Detection:** The middleware automatically detects if `pino-http` is installed:
- **If installed:** Uses full-featured pino-http
- **If NOT installed:** Falls back to simple built-in logger (no warnings, no errors)

---

### Authentication

**jose** - JSON Web Token (JWT) and encryption
```bash
npm install jose
```

**Why it's optional:** Only needed if you're using JWT authentication.

**Package size:** ~40KB

**Usage:**
```javascript
const api = new APIPlugin({
  auth: {
    drivers: [{
      driver: 'jwt',
      config: {
        secret: process.env.JWT_SECRET,
        algorithms: ['HS256']
      }
    }]
  }
});
```

---

### Template Engines

**ejs** - Embedded JavaScript templating
```bash
npm install ejs
```

**pug** - High-performance templating engine
```bash
npm install pug
```

**handlebars** - Logicless templating
```bash
npm install handlebars
```

**Why they're optional:** Only needed if you're serving HTML pages from your API.

**Usage:**
```javascript
const api = new APIPlugin({
  templates: {
    enabled: true,
    engine: 'ejs', // or 'pug', 'handlebars'
    directory: './views'
  }
});
```

---

## Dependency Matrix

| Feature | Package | Required | Size | Peer Dependency |
|---------|---------|----------|------|-----------------|
| Core API | `hono` | ✅ Yes | ~50KB | Yes |
| HTTP Logging | `pino-http` | ❌ No | ~20KB | Yes |
| JWT Auth | `jose` | ❌ No | ~40KB | Yes |
| EJS Templates | `ejs` | ❌ No | ~35KB | Yes |
| Pug Templates | `pug` | ❌ No | ~85KB | Yes |
| Handlebars Templates | `handlebars` | ❌ No | ~75KB | Yes |

**Total if all installed:** ~305KB
**Minimum (core only):** ~50KB

---

## Installation Patterns

### Minimal (API only)
```bash
npm install hono
```

### Standard (API + Logging)
```bash
npm install hono pino-http
```

### Full (API + Logging + JWT + Templates)
```bash
npm install hono pino-http jose ejs
```

---

## Build Configuration

All optional dependencies are marked as:
1. **`peerDependencies`** in `package.json` - User must install explicitly
2. **`peerDependenciesMeta.*.optional: true`** - No warnings if not installed
3. **`external`** in `rollup.config.js` - Not bundled in the distribution

This keeps `s3db.js` core package lightweight (~500KB) while allowing opt-in features.

---

## Lazy Loading

All optional dependencies use lazy loading to prevent errors:

```javascript
// Example: pino-http lazy loading
let pinoHttp;
try {
  pinoHttp = await import('pino-http').then(m => m.default || m);
} catch (err) {
  pinoHttp = null;
}

if (!pinoHttp) {
  logger.warn('pino-http not installed - feature disabled');
}
```

**Benefits:**
- No build errors if dependency is missing
- Graceful degradation
- Clear warning messages
- Zero configuration required

---

## Troubleshooting

### Error: "Cannot find module 'pino-http'"

**Cause:** The `httpLogger` feature is enabled but `pino-http` is not installed.

**Solution:**
```bash
npm install pino-http
```

Or disable the feature:
```javascript
const api = new APIPlugin({
  httpLogger: { enabled: false }
});
```

### Warning: "pino-http is not installed. HTTP request logging is disabled."

**Cause:** The `httpLogger` feature is enabled but `pino-http` is not installed.

**Impact:** HTTP request logging will be skipped, but the API will work normally.

**Solution:** Install `pino-http` if you want HTTP logging:
```bash
npm install pino-http
```

---

## Best Practices

1. **Production:** Install only what you use
   ```bash
   npm install hono pino-http  # API + logging
   ```

2. **Development:** Install common tools
   ```bash
   npm install hono pino-http jose  # API + logging + auth
   ```

3. **Minimal deployments:** Core only
   ```bash
   npm install hono
   ```

4. **Docker:** Use multi-stage builds
   ```dockerfile
   # Install only production dependencies
   RUN npm install --production hono pino-http
   ```

---

## See Also

- [API Plugin Documentation](./README.md)
- [Logging Configuration](../../README.md#-logging)
- [Authentication Guide](./authentication.md)
