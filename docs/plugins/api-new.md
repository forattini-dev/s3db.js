# 🌐 API Plugin

## ⚡ TLDR

**Transform s3db.js resources into production-ready REST API endpoints** with automatic versioning, multiple authentication methods, and enterprise features.

**1 line to get started:**
```javascript
await db.usePlugin(new ApiPlugin({ port: 3000 }));  // Instant REST API!
```

**Key features:**
- ✅ **Automatic REST endpoints** for all resources
- ✅ **Swagger UI documentation**: Interactive API docs at `/docs`
- ✅ **Kubernetes health probes**: `/health/live`, `/health/ready`, `/health`
- ✅ **4 auth methods**: JWT, API Key, Basic Auth, Public
- ✅ **Auto-versioning**: `/v0/cars`, `/v1/cars` based on resource version
- ✅ **Production ready**: CORS, Rate Limiting, Logging, Compression
- ✅ **Schema validation**: Automatic validation using resource schemas
- ✅ **Custom middlewares**: Add your own middleware functions

**Generated endpoints:**
```
GET     /v0/cars           → resource.list() or resource.query() with filters
GET     /v0/cars/:id       → resource.get(id)
POST    /v0/cars           → resource.insert(data)
PUT     /v0/cars/:id       → resource.update(id, data)
PATCH   /v0/cars/:id       → resource.update(id, partial)
DELETE  /v0/cars/:id       → resource.delete(id)
HEAD    /v0/cars           → resource.count() + statistics in headers
OPTIONS /v0/cars           → resource.metadata (schema, methods, endpoints)
```

**Filtering via query strings:**
```
GET /v0/cars?status=active&year=2024&inStock=true
GET /v0/cars?limit=50&offset=100&brand=Toyota
```

---

