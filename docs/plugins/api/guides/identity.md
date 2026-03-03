# Using Identity Plugin via OIDC

> **Navigation:** [← Back to API Plugin](/plugins/api/README.md) | [OIDC Guide →](/plugins/api/guides/oidc.md) | [Authentication →](/plugins/api/guides/authentication.md)

The Identity plugin behaves like any standards-compliant OAuth2/OIDC authorization server. Configure the API plugin the same way you would for Keycloak, Azure AD, Google, etc.—no special hooks are required.

---

## 1. Create an OAuth client in Identity

1. Open the Identity admin console (`/admin`) or call the dynamic registration endpoint:
   ```bash
   curl -X POST https://auth.example.com/oauth/register \
     -H 'Content-Type: application/json' \
     -d '{
       "client_name": "api-server",
       "redirect_uris": ["https://api.example.com/auth/callback"],
       "grant_types": ["authorization_code", "refresh_token"],
       "response_types": ["code"],
       "scope": "openid profile email offline_access"
     }'
   ```
2. Store the returned `client_id` and `client_secret` securely (Secrets Manager, Vault, etc.).

> Identity exposes discovery metadata at `/.well-known/openid-configuration` and JWKS at `/.well-known/jwks.json`. Any OIDC client can discover it automatically.

---

## 2. Configure ApiPlugin with the standard OIDC driver

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  auth: {
    drivers: [
      {
        driver: 'oidc',
        config: {
          issuer: 'https://auth.example.com',
          clientId: process.env.OIDC_CLIENT_ID,
          clientSecret: process.env.OIDC_CLIENT_SECRET,
          redirectUri: 'https://api.example.com/auth/callback',
          cookieSecret: process.env.COOKIE_SECRET,   // for session storage
          scopes: ['openid', 'profile', 'email']
        }
      }
    ]
  }
}));
```

That's it. The API plugin will:
1. Read the discovery document published by Identity.
2. Download JWKS to validate tokens.
3. Handle authorization-code + refresh-token flows for users.
4. Use the existing `oidc` middleware to populate `c.get('user')`.

---

## 3. Auto-detection of IdentityPlugin

When both IdentityPlugin and ApiPlugin are installed on the same database, the API plugin automatically:

- **Shares the user resource** — If both plugins reference the same `resource` name, user data stays consistent across auth operations and API endpoints.
- **Inherits rate limit settings** — Identity's built-in rate limiting (login throttle, token endpoint limits) applies in addition to ApiPlugin's own rate limiter.
- **Enables the identity context middleware** — Route handlers get access to `c.get('identity')` with helpers for inspecting the authenticated principal.

No extra configuration is needed for auto-detection. Both plugins discover each other through the shared database instance.

---

## 4. Hybrid: OIDC + JWT (browser vs service-to-service)

A common pattern is using OIDC for browser sessions and JWT (or OAuth2 resource server) for service-to-service calls:

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  auth: {
    drivers: {
      oidc: {
        issuer: 'https://auth.example.com',
        clientId: process.env.OIDC_CLIENT_ID,
        clientSecret: process.env.OIDC_CLIENT_SECRET,
        redirectUri: 'https://api.example.com/auth/callback',
        cookieSecret: process.env.COOKIE_SECRET
      },
      oauth2: {
        issuer: 'https://auth.example.com',    // Same issuer
        audience: 'api-server'
      }
    },
    pathRules: [
      // Browser dashboard: OIDC (session cookies)
      { path: '/dashboard/**', methods: ['oidc'], required: true },

      // API endpoints: accept tokens from both flows
      { path: '/api/**', methods: ['oauth2', 'oidc'], required: true },

      // Public
      { path: '/health', required: false },
      { path: '/docs', required: false }
    ]
  }
}));
```

Both drivers share the same Identity issuer, so tokens are interchangeable. Browser users authenticate via OIDC (cookies), while services send `Bearer` tokens validated by the `oauth2` driver.

---

## 5. Working with service accounts

Identity issues service-account tokens with `token_use: "service"` and a `service_account` block. The API plugin adds helpers to route contexts whenever the OIDC driver is active:

```javascript
api.addRoute({
  path: '/jobs',
  method: 'POST',
  auth: ['oidc'],
  handler: async (c, ctx) => {
    const identity = c.get('identity');

    if (identity.isServiceAccount()) {
      const sa = identity.getServiceAccount();
      ctx.assertScope('jobs:dispatch');
      console.log('Service account:', sa.clientId);
    } else {
      const user = identity.getUser();
      ctx.assertRole('admin');
      console.log('User:', user.email);
    }

    return ctx.json({ ok: true });
  }
});
```

Available helpers:
- `identity.isServiceAccount()` / `identity.getServiceAccount()`
- `identity.isUser()` / `identity.getUser()`

No special configuration—these helpers work with any OIDC provider that emits the same claims.

---

## 6. Observability

- `/health` already reflects the overall API status. Pair it with Identity's `/health` endpoints for full coverage.
- Expose Prometheus metrics (or your preferred stack) to monitor Identity separately (token issuance, latency, failures). Since ApiPlugin treats Identity like any other IdP, you can reuse existing dashboards.

---

## 7. Troubleshooting checklist

| Symptom | Action |
|---------|--------|
| `invalid_client` during login | Verify `clientId`/`clientSecret`, redirect URI, and that the client is active in Identity. |
| Tokens rejected by ApiPlugin | Ensure JWKS is reachable and the token's `aud` matches the configured audience. |
| Need to rotate client secrets | Rotate via the Identity admin console and update `clientSecret` in the API configuration—no code changes required. |
| Service account tokens not recognized | Verify the token includes `token_use: "service"` claim. Check that the OIDC driver is in the `methods` list for the path rule. |
| `identity` context is null | Ensure the IdentityPlugin is installed *before* the ApiPlugin, and that `enableIdentityContextMiddleware` is not explicitly set to `false`. |
| Hybrid OIDC+OAuth2 not working | Check that both drivers point to the same `issuer`. The `oauth2` driver must be able to reach the JWKS endpoint. |

> Need automation? Write a short script/CLI that calls Identity's `/oauth/register` endpoint to create clients. Because Identity speaks standard OIDC, any existing tooling (Terraform providers, openid-client, authlib, etc.) works out of the box.

---

## Related Guides

- **[OIDC Complete Guide](/plugins/api/guides/oidc.md)** — Deep dive: all features, providers, troubleshooting
- **[Authentication](/plugins/api/guides/authentication.md)** — All auth methods overview
- **[OAuth2 Resource Server](/plugins/api/guides/authentication.md#oauth2-resource-server-driver)** — Validate tokens from external Authorization Servers
- **[Configuration](/plugins/api/reference/configuration.md)** — All config options reference
