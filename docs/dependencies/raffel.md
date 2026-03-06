# Raffel in s3db.js

This page explains how `raffel` fits into s3db.js. It is the HTTP runtime underneath the API and identity stack, but the project does not consume it raw everywhere. We wrap parts of it to stabilize the developer-facing behavior.

**Navigation:** [← Dependencies](/dependencies/README.md) | [API Plugin](/plugins/api/README.md) | [Routing Reference](/plugins/api/reference/routing.md)

---

## TLDR

- `raffel/http` provides the request, middleware, and app primitives used by the API runtime.
- s3db.js adds a compatibility layer in `src/plugins/shared/http-runtime.ts`.
- If you are debugging route matching, request typing, cookies, or middleware behavior, this is the first dependency page to read.
- Some docs mention `Raffel` directly because advanced users may share middleware or build standalone apps around the same primitives.

## Table of Contents

- [Where We Use It](#where-we-use-it)
- [Why We Wrap It](#why-we-wrap-it)
- [What to Reach For First](#what-to-reach-for-first)
- [Common Pitfalls](#common-pitfalls)
- [FAQ](#faq)

## Where We Use It

`raffel` shows up most clearly in:

- `src/plugins/shared/http-runtime.ts`
- API plugin server and routing code
- identity and auth-adjacent HTTP flows

It gives us:

- `HttpApp`
- typed request/response helpers
- middleware composition
- cookie helpers
- low-level HTTP primitives used by plugin features

## Why We Wrap It

s3db.js keeps a local HTTP runtime adapter because framework behavior matters at the edges:

- route matching semantics must be predictable
- TypeScript request helpers should return narrow types
- cookie helpers should match our local context types
- framework bugs should not leak directly into the public plugin surface

The recent wildcard routing fix is a good example: the project added compatibility logic locally instead of letting plugin docs depend on broken route semantics.

## What to Reach For First

When you are working on HTTP behavior, use this order:

1. `src/plugins/shared/http-runtime.ts`
2. API plugin docs and references
3. the upstream `raffel` package

That ordering matters because the wrapper is part of the contract users actually experience inside s3db.js.

## Common Pitfalls

### Assuming docs for raw Raffel always describe s3db.js behavior exactly

They often do, but not always. The wrapper intentionally smooths some rough edges.

### Mixing `app.use()` and route semantics mentally

Middleware matching and route matching are not always identical concepts. If behavior looks inconsistent, inspect the wrapper and the actual registration method.

### Debugging in the plugin layer first

For routing bugs, it is often faster to inspect the shared HTTP runtime before reading plugin-specific code.

## FAQ

### Do I need to install `raffel` manually?

Not for typical `ApiPlugin` usage. You mainly install it directly when building standalone apps or sharing low-level middleware outside the plugin abstraction.

### Should I import from `raffel/http` directly in plugin code?

Only when you intentionally want the lower-level primitives. For code that should follow the local runtime contract, prefer the shared wrapper.

### Why does the API plugin docs mention Raffel so often?

Because it is the actual transport/runtime substrate behind the API layer, and advanced users sometimes need to drop below the plugin abstraction.

## See Also

- [API Plugin](/plugins/api/README.md)
- [API Plugin Dependencies](/plugins/api/dependencies.md)
- [Routing Reference](/plugins/api/reference/routing.md)
