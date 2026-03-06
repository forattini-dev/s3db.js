# API Plugin Auth Drivers Status

## Driver Overview

| Driver | Status | User Resource Lookup | O(1) Options | Notes |
|--------|--------|----------------------|--------------|-------|
| **JWT** | ✅ Production-ready | `userField` / `passwordField` | `lookupById`, auto-detected partitions | Best fit for local user resources |
| **Basic** | ✅ Production-ready | `usernameField` / `passwordField` | `lookupById`, auto-detected partitions | Supports admin bypass and token cookie fallback |
| **API Key** | ✅ Production-ready | `keyField` | `lookupById`, auto-detected partitions, manual `partitionName` | Only driver with explicit `partitionName` config |
| **OAuth2** | ✅ Production-ready | `userMapping` + local resource fallback | Direct claim ID lookup, `lookupById`, auto-detected partitions | Hybrid flow: tries mapped ID claim before field fallback |
| **OIDC** | ✅ Production-ready | `userMapping` and `lookupFields` fallback | Direct claim ID lookup, `lookupById`, auto-detected partitions | Hybrid flow: tries candidate IDs before fallback lookups |
| **Header Secret** | ✅ Production-ready | None | Not applicable | Injects an in-memory identity, no user resource lookup |

## Lookup Semantics

- `lookupById` is relevant only for resource-backed drivers: JWT, Basic, API Key, OAuth2, and OIDC.
- `partitionName` is a public config option only on the API Key driver.
- JWT and Basic use `lookupById` directly on their primary user lookup field.
- API Key uses `lookupById` on `keyField`, and can also override the partition name manually.
- OAuth2 first tries the mapped ID claim, typically `sub`, via direct `get()`. `lookupById` helps on fallback field lookups such as `email`.
- OIDC first tries candidate IDs derived from claims via direct `get()`. `lookupById` helps on fallback `lookupFields` such as `email`.
- When no ID match or partition is available, resource-backed drivers fall back to `query()` and emit a warning about the O(n) scan.

## Recommended Usage

- Use `lookupById: true` when the lookup field value is also the resource ID.
- Add standard partitions such as `byEmail` or `byApiKey` when the lookup field is not the resource ID.
- Do not document `partitionName` as a shared option across all drivers. Today it is intentionally exposed only on API Key.
- Do not describe Header Secret as a resource-backed auth flow. It bypasses user-resource lookup entirely.

## Documentation Pointers

- Overview and setup: [README](./README.md)
- Auth guide and performance strategy: [authentication.md](./guides/authentication.md)
- OIDC details: [oidc.md](./guides/oidc.md)
- Canonical config reference: [configuration.md](./reference/configuration.md)
