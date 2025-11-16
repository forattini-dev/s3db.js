# 🔐 Using Identity Plugin via OIDC

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

> 📄 Identity exposes discovery metadata at `/.well-known/openid-configuration` and JWKS at `/.well-known/jwks.json`. Any OIDC client can discover it automatically.

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

That’s it. The API plugin will:
1. Read the discovery document published by Identity.
2. Download JWKS to validate tokens.
3. Handle authorization-code + refresh-token flows for users.
4. Use the existing `oidc` middleware to populate `c.get('user')`.

---

## 3. Working with service accounts

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

## 4. Observability

- `/health` already reflects the overall API status. Pair it with Identity’s `/health` endpoints for full coverage.
- Expose Prometheus metrics (or your preferred stack) to monitor Identity separately (token issuance, latency, failures). Since ApiPlugin treats Identity like any other IdP, you can reuse existing dashboards.

---

## 5. Troubleshooting checklist

| Symptom | Action |
|---------|--------|
| `invalid_client` during login | Verify `clientId`/`clientSecret`, redirect URI, and that the client is active in Identity. |
| Tokens rejected by ApiPlugin | Ensure JWKS is reachable and the token’s `aud` matches the configured audience. |
| Need to rotate client secrets | Rotate via the Identity admin console and update `clientSecret` in the API configuration—no code changes required. |

> 💡 Need automation? Write a short script/CLI that calls Identity’s `/oauth/register` endpoint to create clients. Because Identity speaks standard OIDC, any existing tooling (Terraform providers, openid-client, authlib, etc.) works out of the box.
