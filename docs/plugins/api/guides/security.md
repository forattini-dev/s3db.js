# Security

> **Navigation:** [← Back to API Plugin](/plugins/api/README.md) | [Authentication →](/plugins/api/guides/authentication.md) | [Configuration →](/plugins/api/reference/configuration.md)

This guide covers the API plugin's built-in security features: headers, rate limiting, failban, login throttle, and GeoIP blocking.

---

## Security Headers

When `security.enabled` is true (the default), the API applies standard security headers to every response. The middleware runs in order: Failban → CORS → Security Headers.

### Default Headers

| Header | Default Value | Config Key |
|--------|---------------|------------|
| Content-Security-Policy | `default-src 'self'` | `security.csp` |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` | `security.hsts` |
| X-Frame-Options | `DENY` | `security.xFrameOptions` |
| X-Content-Type-Options | `nosniff` | `security.xContentTypeOptions` |
| Referrer-Policy | `strict-origin-when-cross-origin` | `security.referrerPolicy` |
| X-XSS-Protection | `1; mode=block` | `security.xssProtection` |
| Permissions-Policy | `geolocation=(), microphone=(), camera=()` | `security.permissionsPolicy` |

### Customizing Headers

Override individual headers or disable them with `false`:

```js
await db.usePlugin(new ApiPlugin({
  security: {
    enabled: true,

    // Custom CSP
    csp: "default-src 'self'; script-src 'self' https://cdn.example.com; style-src 'self' 'unsafe-inline'",

    // HSTS with preload
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },

    // Allow embedding from same origin
    xFrameOptions: 'SAMEORIGIN',

    // Disable a header entirely
    xssProtection: false,

    // Custom Permissions-Policy
    permissionsPolicy: 'geolocation=(self), microphone=(), camera=(), payment=(self)'
  }
}));
```

### HSTS Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxAge` | number | `31536000` | Time in seconds the browser should remember HTTPS-only |
| `includeSubDomains` | boolean | `true` | Apply to all subdomains |
| `preload` | boolean | `false` | Opt in to browser HSTS preload list |

### Docs UI CSP

The API Plugin does not apply a dedicated route-level CSP for `/docs`. The docs UI uses the same CSP configured globally. If your CSP blocks docs behavior (e.g., inline styles used by the UI), adjust `security.csp` or mount your own docs route with custom headers.

---

## Built-in Rate Limiting

The API plugin includes a built-in rate limiter with in-memory sliding window storage. It applies globally and supports per-path rules.

### Global Configuration

```js
await db.usePlugin(new ApiPlugin({
  rateLimit: {
    enabled: true,
    windowMs: 60_000,       // 1 minute window
    maxRequests: 200,        // Max requests per window
    maxUniqueKeys: 10_000,   // Max tracked keys (memory cap)
    keyGenerator: (c) => {   // Custom key function (optional)
      return c.req.header('x-api-key') || c.req.header('x-forwarded-for') || 'unknown';
    }
  }
}));
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable rate limiting |
| `windowMs` | number | `60000` | Sliding window duration in ms |
| `maxRequests` | number | `200` | Max requests per key per window |
| `keyGenerator` | function \| null | `null` | Custom key extraction. Default: IP from `x-forwarded-for` or `x-real-ip` |
| `maxUniqueKeys` | number | `10000` | Max unique keys tracked in memory |

### Per-Path Rules

Define granular rate limits for specific routes:

```js
await db.usePlugin(new ApiPlugin({
  rateLimit: {
    enabled: true,
    windowMs: 60_000,
    maxRequests: 200,
    rules: [
      { path: '/auth/login', key: 'ip', windowMs: 60_000, maxRequests: 10 },
      { path: '/auth/register', key: 'ip', windowMs: 300_000, maxRequests: 5 },
      { path: '/api/**', key: 'user', windowMs: 60_000, maxRequests: 100 }
    ]
  }
}));
```

**Rule options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` / `pattern` | string | — | URL pattern to match (required) |
| `key` / `scope` | string | `'ip'` | Key type: `'ip'`, `'user'`, or `'apikey'` |
| `windowMs` | number | global value | Override window for this rule |
| `maxRequests` | number | global value | Override limit for this rule |
| `maxUniqueKeys` | number | global value | Override max tracked keys |
| `keyHeader` / `header` | string | `'x-api-key'` | Header name when `key` is `'apikey'` |
| `keyGenerator` | function \| null | `null` | Custom key function for this rule |

### Response Headers

Every response includes rate limit headers:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Max requests allowed in window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp when window resets |
| `Retry-After` | Seconds until next request allowed (only on 429) |

### 429 Response

When rate limited, the response is:

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 45 seconds.",
  "retryAfter": 45
}
```

### Auth Driver Rate Limiting

The plugin also applies per-driver rate limits automatically for each auth driver:

| Driver | Max Attempts | Window | Skip Successful |
|--------|-------------|--------|-----------------|
| OIDC | 200/min | 60s | Yes |
| JWT | 200/min | 60s | No |
| Basic | 200/min | 60s | Yes |
| API Key | 100/min | 60s | No |

### Custom Route Rate Limiting

For custom endpoints, prefer the built-in `rateLimit.rules` and match the custom route path directly:

```js
await db.usePlugin(new ApiPlugin({
  rateLimit: {
    enabled: true,
    rules: [
      { path: '/contact', key: 'ip', windowMs: 60_000, maxRequests: 60 }
    ]
  },
  routes: {
    'POST /contact': async (c) => {
      const payload = await c.req.json();
      return c.json({ received: true, email: payload.email });
    }
  }
}));
```

If you need a bespoke limiter strategy, add a custom middleware ahead of the route or enforce it inside the handler.

---

## Login Throttle

The login throttle protects `/auth/login` against brute-force attacks using in-memory tracking. It's enabled by default when the `jwt` driver is active.

### Configuration

```js
await db.usePlugin(new ApiPlugin({
  auth: {
    drivers: { jwt: { secret: process.env.JWT_SECRET } },
    loginThrottle: {
      enabled: true,          // default: true
      maxAttempts: 5,          // default: 5 failed attempts before blocking
      windowMs: 60_000,        // default: 1 minute window
      blockDurationMs: 300_000, // default: 5 minutes block
      maxEntries: 10_000       // default: max tracked keys in memory
    }
  }
}));
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable login throttle |
| `maxAttempts` | number | `5` | Failed attempts before blocking |
| `windowMs` | number | `60000` | Window for counting attempts (ms) |
| `blockDurationMs` | number | `300000` | Block duration after max attempts (ms) |
| `maxEntries` | number | `10000` | Max tracked keys (FIFO eviction) |

### How It Works

1. Each login attempt is tracked by key `{clientIP}:{username}`
2. Failed attempts increment the counter within the `windowMs` window
3. After `maxAttempts` failures, the key is blocked for `blockDurationMs`
4. Successful login resets the counter for that key
5. Response includes `Retry-After` header when blocked

### 429 Response

```json
{
  "success": false,
  "error": "Too many login attempts. Try again later.",
  "code": "TOO_MANY_ATTEMPTS",
  "details": { "retryAfter": 300 }
}
```

---

## Failban

Automatically ban IPs that accumulate security violations (auth failures, 4xx errors). Bans are persisted in S3 via dedicated resources and cached in memory for fast lookup.

### Configuration

```js
await db.usePlugin(new ApiPlugin({
  failban: {
    enabled: true,
    maxViolations: 3,               // Ban after 3 violations (default)
    violationWindow: 3_600_000,      // 1 hour window (default)
    banDuration: 86_400_000,         // 24 hour ban (default)
    whitelist: ['127.0.0.1', '::1'], // Never ban these IPs (default)
    blacklist: [],                   // Permanently block these IPs
    persistViolations: true,         // Store violations in S3 (default)
    logLevel: 'info',                // Logging level
    resourceNames: {
      bans: 'custom_bans',           // Override bans resource name
      violations: 'custom_violations' // Override violations resource name
    }
  }
}));
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable failban |
| `maxViolations` | number | `3` | Violations before auto-ban |
| `violationWindow` | number | `3600000` | Window to count violations (ms) |
| `banDuration` | number | `86400000` | Ban duration (ms) |
| `whitelist` | string[] | `['127.0.0.1', '::1']` | IPs that can never be banned |
| `blacklist` | string[] | `[]` | IPs permanently blocked (no expiry) |
| `persistViolations` | boolean | `true` | Persist violations to S3 |
| `logLevel` | string | `'info'` | Log level for failban events |
| `resourceNames` | object | — | Override auto-generated resource names |

### Violation Events

Failban automatically listens to these events and records violations:

- `auth:failure` — Failed authentication attempts
- `request:error` — 4xx client errors

After `maxViolations` within `violationWindow`, the IP is automatically banned.

### Response Headers

Banned requests receive these headers:

| Header | Description |
|--------|-------------|
| `X-Ban-Status` | `banned`, `blacklisted`, or `country_blocked` |
| `X-Ban-Reason` | Human-readable reason for the ban |
| `X-Ban-Expires` | ISO 8601 expiry timestamp (for temporary bans) |
| `Retry-After` | Seconds until ban expires |
| `X-Country-Code` | ISO country code (for GeoIP blocks) |

### Admin Endpoints

Failban exposes admin routes under `/_admin/failban/`:

| Endpoint | Description |
|----------|-------------|
| `GET /_admin/failban/bans` | List all active bans |
| `GET /_admin/failban/bans/:ip` | Check specific IP ban status |
| `POST /_admin/failban/bans` | Manually ban an IP |
| `DELETE /_admin/failban/bans/:ip` | Unban an IP |
| `GET /_admin/failban/stats` | Get ban/violation statistics |

**Manual ban example:**

```bash
curl -X POST http://localhost:3000/_admin/failban/bans \
  -H 'Content-Type: application/json' \
  -d '{ "ip": "1.2.3.4", "reason": "Suspicious activity", "duration": 3600000 }'
```

**Stats response:**

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "activeBans": 3,
    "cachedBans": 3,
    "totalViolations": 42,
    "whitelistedIPs": 2,
    "blacklistedIPs": 0,
    "geo": {
      "enabled": true,
      "allowedCountries": 0,
      "blockedCountries": 2,
      "blockUnknown": false
    },
    "config": {
      "maxViolations": 3,
      "violationWindow": 3600000,
      "banDuration": 86400000
    }
  }
}
```

### TTL Auto-Expiry

If the TTLPlugin is installed, failban automatically configures TTL on the bans resource so expired bans are cleaned from S3. Without TTLPlugin, bans still expire from the in-memory cache but remain in S3 until manually cleaned.

---

## GeoIP Blocking

Block or allow requests based on the client's country using MaxMind GeoLite2.

### Setup

1. Install the GeoIP package:

```bash
pnpm add @maxmind/geoip2-node
```

2. Download the GeoLite2-Country database from [MaxMind](https://dev.maxmind.com/geoip/geoip2/geolite2/). You'll need a free MaxMind account.

3. Configure:

```js
await db.usePlugin(new ApiPlugin({
  failban: {
    enabled: true,
    geo: {
      enabled: true,
      databasePath: './GeoLite2-Country.mmdb',  // Path to mmdb file
      blockedCountries: ['CN', 'RU'],           // Block by ISO code
      allowedCountries: [],                     // Allow-list mode (empty = allow all)
      blockUnknown: false,                      // Block IPs with unknown country
      cacheResults: true                        // Cache lookups (default: true)
    }
  }
}));
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable GeoIP blocking |
| `databasePath` | string \| null | `null` | Path to `.mmdb` file (required if enabled) |
| `blockedCountries` | string[] | `[]` | ISO country codes to block |
| `allowedCountries` | string[] | `[]` | ISO codes to allow (block-list mode if empty) |
| `blockUnknown` | boolean | `false` | Block IPs where country can't be determined |
| `cacheResults` | boolean | `true` | Cache country lookups (max 10,000 entries, FIFO eviction) |

### Blocking Logic

- If `blockedCountries` is set, IPs from those countries are blocked
- If `allowedCountries` is set, only IPs from those countries are allowed (all others blocked)
- If both are set, `blockedCountries` is checked first
- Whitelisted IPs (`failban.whitelist`) bypass GeoIP checks

### Blocked Response

```json
{
  "error": "Forbidden",
  "message": "Access from your country is not allowed",
  "country": "CN",
  "ip": "1.2.3.4"
}
```

---

## Security Events

The plugin emits events for security-related actions. Subscribe to them for custom logging or alerting:

```js
const apiPlugin = new ApiPlugin({ /* ... */ });
await db.usePlugin(apiPlugin);

apiPlugin.events.on('security:violation', ({ ip, type, timestamp }) => {
  console.warn(`Violation from ${ip}: ${type} at ${timestamp}`);
});

apiPlugin.events.on('security:banned', ({ ip, reason, expiresAt }) => {
  console.warn(`Banned ${ip}: ${reason} until ${expiresAt}`);
});

apiPlugin.events.on('security:unbanned', ({ ip, reason }) => {
  console.log(`Unbanned ${ip}: ${reason}`);
});

apiPlugin.events.on('security:country_blocked', ({ ip, country }) => {
  console.warn(`Country blocked: ${country} from ${ip}`);
});
```

---

## Best Practices

1. **Always run behind HTTPS in production** — HSTS only works over HTTPS
2. **Use a reverse proxy** — Put nginx, Cloudflare, or a load balancer in front for TLS termination, additional rate limiting, and DDoS protection
3. **Keep JWT lifetimes short** — Reduces window of exposure if a token is compromised
4. **Enable Failban** — Even basic config (`failban: { enabled: true }`) provides significant protection
5. **Tune rate limits per route** — Auth endpoints need stricter limits than read endpoints
6. **Whitelist internal IPs** — Add load balancers, health checkers, and monitoring IPs to `failban.whitelist`
7. **Review CSP regularly** — Update `security.csp` as you add external scripts, fonts, or APIs
8. **Use GeoIP with caution** — Legitimate users may use VPNs; prefer `blockedCountries` over `allowedCountries`
9. **Monitor admin endpoints** — Protect `/_admin/failban/*` routes with authentication
10. **Set `blockUnknown: false`** — Many legitimate IPs (private networks, VPNs) have no country data

---

## Related Guides

- **[Authentication](/plugins/api/guides/authentication.md)** — JWT, OAuth2, OIDC, API Keys
- **[Guards](/plugins/api/guides/guards.md)** — Row-level security, RBAC
- **[Deployment](/plugins/api/guides/deployment.md)** — Production setup, Kubernetes
- **[Configuration](/plugins/api/reference/configuration.md)** — All config options reference
