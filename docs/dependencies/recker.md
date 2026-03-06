# Recker in s3db.js

This page explains how s3db.js uses `recker`. In this codebase, Recker is not just "another fetch wrapper". It is the transport layer behind several higher-level HTTP client capabilities, especially where retries, HTTP/2 behavior, curl integration, or crawl-style workloads matter.

**Navigation:** [← Dependencies](/dependencies/README.md) | [Clients](/clients/README.md) | [Spider Plugin](/plugins/spider/README.md)

---

## TLDR

- Recker powers the higher-level HTTP client wrappers used in parts of the platform.
- It matters most in `src/concerns/http-client.ts` and `src/clients/recker-http-handler.ts`.
- Some Spider and SMTP capabilities also lean on Recker modules.
- If you are tuning retries, HTTP/2, curl-impersonate, or SEO/security fetch helpers, start here.

## Table of Contents

- [Where It Shows Up](#where-it-shows-up)
- [Why s3db.js Uses It](#why-s3dbjs-uses-it)
- [What Features Matter Here](#what-features-matter-here)
- [Operational Notes](#operational-notes)
- [FAQ](#faq)

## Where It Shows Up

The main integration points are:

- `src/concerns/http-client.ts`
- `src/clients/recker-http-handler.ts`
- Spider adapters that dynamically import Recker SEO and security helpers
- SMTP templating in scenarios where Recker utilities are reused

This is broader than a single plugin. Recker is part of the platform's outbound HTTP story.

## Why s3db.js Uses It

The project uses Recker because it provides higher-level transport building blocks that are useful for real workloads:

- retry behavior with backoff
- HTTP/2 support and metrics hooks
- curl-impersonate installation and setup helpers
- reusable request clients
- specialized SEO and security analysis helpers in crawl-oriented code

That makes it a better fit than a bare `fetch` abstraction for the workloads this repo cares about.

## What Features Matter Here

In s3db.js, the interesting parts are:

| Feature | Why it matters here |
| --- | --- |
| HTTP/2 presets | S3 and high-volume outbound traffic benefit from tuned connection behavior |
| Retry coordination | Avoids naive retry storms and handles transport-specific failures better |
| Circuit breaker and dedupe patterns | Implemented in local wrappers on top of the client |
| `curl-impersonate` setup | Useful for crawl and edge-network scenarios |
| SEO/security helpers | Used by spider-style integrations instead of reinventing parsing logic |

The local wrappers are where most project-specific policy lives. Recker provides the primitives; s3db.js shapes how they are used.

## Operational Notes

If you are debugging outbound HTTP behavior, inspect in this order:

1. local wrapper config in `src/concerns/http-client.ts`
2. `src/clients/recker-http-handler.ts`
3. plugin-specific code such as Spider
4. upstream Recker behavior

Also note that some Recker capabilities are dynamically imported. Missing-package behavior can therefore surface at runtime instead of import time.

## FAQ

### Is Recker a required dependency for all users?

No. Many s3db.js workflows never touch it directly. It becomes relevant when you use the client abstractions or plugins that rely on those transport helpers.

### Why not just use `fetch`?

Because the platform needs more than simple request dispatch. It needs retry control, HTTP/2 support, curl-based behavior, and transport utilities that fit crawling and infrastructure-heavy use cases.

### Is Recker only for the Spider plugin?

No. Spider is the most obvious place, but the HTTP client layer also uses it directly.

## See Also

- [Clients](/clients/README.md)
- [S3 Client](/clients/s3-client.md)
- [Spider Plugin](/plugins/spider/README.md)
