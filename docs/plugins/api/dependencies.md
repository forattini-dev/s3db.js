# API Plugin - Dependencies

The API Plugin ships with a `Raffel`-based runtime and keeps most feature dependencies optional. Install only what your deployment actually uses.

## Core Runtime

### Required

```bash
pnpm add s3db.js
```

`ApiPlugin` already runs on the bundled `Raffel` HTTP runtime. You only need to install `raffel` directly when you are building standalone apps or low-level middleware around the same runtime.

### Optional direct runtime install

```bash
pnpm add raffel
```

Use this when you want to:
- create standalone `HttpApp` instances
- share Raffel middleware between `ApiPlugin` and other services
- import Raffel types directly in your app code

## Optional Features

### JWT / JWS / encryption

```bash
pnpm add jose
```

Needed for JWT-based auth flows and token handling.

### OIDC / OAuth2 client flows

```bash
pnpm add openid-client
```

Needed when you enable OIDC providers such as Google, Azure AD, Keycloak, or Auth0.

### GeoIP blocking

```bash
pnpm add @maxmind/geoip2-node
```

Needed only if you enable country-based allow/block rules in Failban.

### Enhanced HTTP logging

```bash
pnpm add pino-http
```

The plugin has built-in logging already. Install `pino-http` only if you want deeper request/response serialization.

### Template engines

```bash
pnpm add ejs
pnpm add pug
```

Install the engine you actually configure in `templates.engine`.

### Custom route validation helpers

```bash
pnpm add zod
```

Useful when you validate custom routes with your own schema layer.

## Dependency Matrix

| Feature | Package | Required |
|---------|---------|----------|
| Core API runtime | `s3db.js` | ✅ |
| Standalone Raffel apps | `raffel` | ❌ |
| JWT auth | `jose` | ❌ |
| OIDC flows | `openid-client` | ❌ |
| GeoIP rules | `@maxmind/geoip2-node` | ❌ |
| Enhanced HTTP logging | `pino-http` | ❌ |
| EJS templates | `ejs` | ❌ |
| Pug templates | `pug` | ❌ |
| Custom route validation | `zod` | ❌ |

## Installation Patterns

### Minimal CRUD API

```bash
pnpm add s3db.js
```

### API with JWT auth

```bash
pnpm add s3db.js jose
```

### API with OIDC and server-rendered pages

```bash
pnpm add s3db.js jose openid-client ejs
```

### API plus standalone Raffel middleware/app code

```bash
pnpm add s3db.js jose raffel
```

## See Also

- [API Plugin Documentation](/plugins/api/README.md)
- [Authentication Guide](/plugins/api/guides/authentication.md)
- [Security Guide](/plugins/api/guides/security.md)
