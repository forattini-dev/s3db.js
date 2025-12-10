# 🔒 Security

> Navigation: [← Back to API Plugin](/plugins/api/README.md)

This guide summarizes the API plugin’s built‑in security features and how to tune them for production.

—

## Failban & GeoIP Blocking

Automatically ban abusive IPs and optionally block by country using MaxMind GeoLite2.

Example:
```js
await db.usePlugin(new ApiPlugin({
  security: { enabled: true },
  failban: {
    enabled: true,
    maxViolations: 5,
    violationWindow: 60_000,   // 1 min
    banDuration: 86_400_000,   // 1 day
    geo: { dbPath: './GeoLite2-Country.mmdb', block: ['RU','CN'] }
  }
}));
```

See also: [Failban with GeoIP Blocking](/plugins/api/README.md#failban-with-geoip-blocking)

—

## Security Headers (CSP, HSTS, X-Frame-Options, …)

When `security.enabled` is true, the API applies standard security headers via middleware (order: Failban → CORS → Security headers). Defaults are safe and can be customized via the plugin config.

Key points:
- Content‑Security‑Policy (CSP) is applied globally and can be overridden per route.
- HSTS, X‑Frame‑Options, X‑Content‑Type‑Options, Referrer‑Policy, and Permissions‑Policy are set with sensible defaults.

—

## API Docs CSP (Swagger/Redoc)

For a smooth out‑of‑the‑box experience, the `/docs` route sets a permissive CSP specific to the docs page:
- Redoc UI allows `https://cdn.redoc.ly` in `script-src`/`script-src-elem` and `fonts.googleapis.com`/`fonts.gstatic.com` for fonts.
- Swagger UI gets a minimal route‑level CSP that permits inline scripts/styles from `self`.

You can self‑host docs assets or tighten CSP by overriding `security.contentSecurityPolicy` (global) or by adding your own route handler.

—

## Rate Limiting (Custom Routes)

Use `hono-rate-limiter` for per‑route rate limiting in custom endpoints; for global abusive patterns, prefer Failban.

Example:
```js
import { rateLimiter } from 'hono-rate-limiter'

const limiter = rateLimiter({ windowMs: 60_000, limit: 60 })
app.post('/contact', limiter, handler)
```

—

## Best Practices

- Always run behind HTTPS in production
- Keep JWT lifetimes short and cache verification keys
- Enable Failban and (optionally) GeoIP
- Review CSP if you serve custom content

