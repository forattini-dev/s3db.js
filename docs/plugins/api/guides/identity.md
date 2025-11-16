# 🔐 Identity Plugin Integration

> **Goal:** Delegate all authentication to the `IdentityPlugin` (full OAuth2/OIDC server) while keeping ApiPlugin lightweight and self-hosted.

---

## 1. Fetch Identity metadata

Identity publishes everything the API needs at `/.well-known/s3db-identity.json` (or internally via `db.pluginRegistry.identity.integration`). Cache the response for `cacheTtl` seconds and note the `version`/`issuedAt` fields.

```bash
curl https://auth.example.com/.well-known/s3db-identity.json | jq
```

Key fields:

| Field | Purpose |
|-------|---------|
| `issuer`, `authorizationUrl`, `tokenUrl`, `userinfoUrl`, `jwksUrl`, `introspectionUrl` | Standard OIDC endpoints |
| `supportedScopes`, `supportedGrantTypes`, `supportedResponseTypes` | Capability matrix |
| `resources.users/tenants/clients` | Canonical resource names (for sharing data) |
| `clientRegistration.url` | Endpoint used for auto-provisioning confidential clients |

---

## 2. Enable identity mode in ApiPlugin

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  identityIntegration: {
    enabled: true,
    url: 'https://auth.example.com',      // optional when same DB
    require: true,                        // fail fast if Identity missing
    autoProvision: true,                  // POST /oauth/register when needed
    client: {
      clientId: process.env.API_CLIENT_ID,
      clientSecret: process.env.API_CLIENT_SECRET,
      redirectUri: 'https://api.example.com/auth/callback'
    }
  }
}));
```

What happens under the hood:
1. ApiPlugin loads metadata (directly or via HTTPS) and validates signatures.
2. If `client` is provided, it verifies the credentials with a `client_credentials` probe.
3. If credentials are missing and `autoProvision` is `true`, it calls `clientRegistration.url`, encrypts the resulting secret with the database key, and reuses it across restarts.
4. Auth routes (`/auth/login`, `/auth/register`) are skipped because Identity now handles every login.

> 💡 Remote deployments: set `identityIntegration.url`. ApiPlugin caches metadata and JWKS for `cacheTtl`, allowing brief outages without interrupting traffic. Use `requireFreshMetadata` if you want to hard-fail when metadata cannot be refreshed.

---

## 3. Use identity-aware context in routes

Identity distinguishes people vs service accounts inside the token payload. ApiPlugin surfaces helpers so your handlers stay simple:

```javascript
api.addRoute({
  path: '/jobs',
  method: 'POST',
  auth: ['oidc'],
  handler: async (c, ctx) => {
    if (ctx.identity.isServiceAccount()) {
      ctx.assertScope('jobs:dispatch');
    } else {
      ctx.assertRole('admin');
    }

    // ctx.serviceAccount or ctx.user now available
    const actor = ctx.identity.describe();
    await jobsResource.insert({ ...c.req.validatedBody, actor });
    return ctx.json({ ok: true });
  }
});
```

Available helpers:
- `ctx.identity.isServiceAccount()` / `ctx.identity.isUser()`
- `ctx.serviceAccount` – contains `clientId`, `name`, `scopes`, `audiences`
- `ctx.user` – contains `sub`, `email`, `tenantId`, `roles`, `scopes`

---

## 4. Provision/rotate service accounts from the API side

Use the CLI (or admin routes) to create service accounts without leaving the API deployment pipeline:

```bash
# Create a service account restricted to orders API
yarn s3db api identity service-account create \
  --name orders-worker \
  --scopes orders:read \
  --audience https://api.example.com

# Rotate an existing service account
yarn s3db api identity service-account rotate --client-id orders-worker
```

The CLI talks to Identity over HTTPS, prints the secret exactly once, and logs every action for auditing. HTTP admin routes (`POST /admin/identity/service-accounts/:id/rotate`) provide the same capability for control planes.

---

## 5. Health & observability

- `/health` adds an `identity` section: status (`up/degraded/down`), last metadata refresh, last JWKS sync, and last credential validation.
- Prometheus metrics:
  - `identity_metadata_fetch_total{status="success|error"}`
  - `identity_metadata_fetch_duration_ms`
  - `identity_jwks_refresh_total`
  - `identity_token_exchange_failures_total`

Feed these into Grafana/Datadog to match the observability story you’d expect from Keycloak, Azure AD, or Cognito.

---

## 6. Troubleshooting

| Symptom | Fix |
|---------|-----|
| ApiPlugin refuses to start (`Identity metadata unavailable`) | Check networking and ensure `.well-known/s3db-identity.json` is reachable; use cached metadata by setting `requireFreshMetadata: false`. |
| `invalid_client` during start | Credentials are wrong or scopes mismatch; re-run auto-provisioning or CLI rotation. |
| Requests deny service accounts unexpectedly | Ensure `ctx.identity.isServiceAccount()` guards allow the new scopes or rotate the token to include the right audience. |

Need more detail? See [`docs/plugins/identity/integration.md`](../../identity/integration.md) for full metadata schema and service-account semantics.
