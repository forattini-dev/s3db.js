# Raffel in s3db.js

This page explains how `raffel` fits into s3db.js. It is the HTTP runtime underneath the API and identity stack, and `raffel@1.0.7` is the supported baseline for the current API plugin runtime.

**Navigation:** [← Dependencies](/dependencies/README.md) | [API Plugin](/plugins/api/README.md) | [Routing Reference](/plugins/api/reference/routing.md)

---

## TLDR

- `raffel/http` provides the request, middleware, cookie, and app primitives used by the API runtime.
- s3db.js keeps a small adapter in `src/plugins/shared/http-runtime.ts`.
- On `1.0.7`, route matching semantics come from Raffel itself; s3db.js no longer needs a local matcher override.
- The local wrapper remains responsible for contract-stabilizing request typing and cookie helper bridges.
- The API plugin now also reuses Raffel `1.0.7` for inspection-oriented tooling: runtime preview, doctor reports, generated contract tests, and canonical schema descriptor normalization.

## Where We Use It

`raffel` shows up most clearly in:

- `src/plugins/shared/http-runtime.ts`
- API plugin server and routing code
- identity and auth-adjacent HTTP flows

It gives us:

- `HttpApp`
- typed request and response helpers
- middleware composition
- cookie helpers
- low-level HTTP primitives used by plugin features

## What The Local Wrapper Still Does

s3db.js keeps a local HTTP runtime adapter because the plugin contract still benefits from one place that stabilizes framework-facing details:

- request helper overloads stay narrow in TypeScript
- cookie helpers accept the local context shape directly
- API and identity code import one shared runtime surface

The wrapper is now intentionally small. Raffel owns routing behavior, performance characteristics, optional params, terminal wildcards, and grouped or mounted route matching.

The API plugin also follows Raffel's current tooling contract more directly:

- `ApiPlugin.previewRuntime()` builds a structured runtime inspection preview from the plugin's route metadata.
- `ApiPlugin.doctor()` summarizes diagnostics for missing or fallback route/schema metadata.
- `ApiPlugin.contractTests()` generates auth/input-oriented regression checks from the same inspection graph.
- OpenAPI/USD generation normalizes schemas through Raffel's canonical descriptor helper before emitting docs output.

## What Changed With Raffel 1.0.7

For the API plugin, the important shift is that Raffel now directly covers the route semantics that previously required local patching:

- optional params such as `/users/:id?`
- terminal wildcards such as `/assets/*`
- grouped routes through `basePathApp()`
- mounted sub-app behavior through `route()`

That means routing bugs should be investigated in this order:

1. the API plugin route registration code
2. `src/plugins/shared/http-runtime.ts`
3. the upstream `raffel` runtime

The adapter is no longer hiding a custom matcher layer between the plugin and Raffel.

## Common Pitfalls

### Assuming the wrapper still owns routing semantics

It does not on `1.0.7`. If a path does not match, start from how the API plugin registered the route and then inspect the upstream `HttpApp`.

### Treating the wrapper as optional for plugin code

For plugin and identity code, prefer the shared wrapper. It is the contract the repository maintains across the runtime surface.

### Mixing route and middleware matching expectations

Middleware registration and route registration are still different concepts. If behavior looks inconsistent, inspect the registration path, not just the request handler.

## FAQ

### Do I need to install `raffel` manually?

Not for typical `ApiPlugin` usage. You mainly install it directly when building standalone apps or sharing low-level middleware outside the plugin abstraction.

### Should I import from `raffel/http` directly in plugin code?

Only when you intentionally want the lower-level primitives. For code that should follow the local runtime contract, prefer the shared wrapper.

### Why does the API plugin docs mention Raffel so often?

Because it is the actual transport/runtime substrate behind the API layer, and the API plugin now intentionally aligns its route context and runtime behavior with Raffel's current contract.

## See Also

- [API Plugin](/plugins/api/README.md)
- [API Plugin Dependencies](/plugins/api/dependencies.md)
- [Routing Reference](/plugins/api/reference/routing.md)
