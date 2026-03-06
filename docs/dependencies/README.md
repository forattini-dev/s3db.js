# Dependencies in s3db.js

This section explains the external libraries and tools that shape s3db.js internals. Instead of mirroring upstream READMEs, these pages focus on how each dependency appears in this codebase, what problems it solves here, and when you actually need to care about it.

**Navigation:** [← Introduction](/) | [Plugin System](/plugins/README.md) | [Plugin Dependencies](/plugins/guides/dependencies.md)

---

## TLDR

- `fastest-validator` powers resource schemas and custom validation aliases.
- `pino` powers structured logging across the database, plugins, resources, and HTTP layers.
- `raffel` is the HTTP runtime behind the API and identity plugin stack.
- `recker` is the transport/runtime dependency behind higher-level HTTP client features and some crawler-style integrations.
- `redblue` is not a general runtime dependency; it is a Recon toolchain dependency.

## Table of Contents

- [How to Use This Section](#how-to-use-this-section)
- [Dependency Map](#dependency-map)
- [Read by Job](#read-by-job)
- [See Also](#see-also)

## How to Use This Section

Use these pages when you need to understand why a dependency exists in s3db.js, how much of its surface area we rely on, and whether you should read upstream docs or stay inside the project docs.

These pages are intentionally opinionated:

- they describe our usage, not the dependency's entire API
- they highlight local extensions and compatibility layers
- they point out package-level vs tool-level dependencies

## Dependency Map

| Dependency | Role in s3db.js | Read this when |
| --- | --- | --- |
| [Fastest Validator](/dependencies/fastest-validator.md) | Resource schema engine and validation aliases | You are modeling data, debugging validation, or extending schema behavior |
| [Pino & Logging](/dependencies/pino.md) | Structured logger used across core and plugins | You need better logs, child loggers, or output control |
| [Raffel](/dependencies/raffel.md) | HTTP runtime under API and identity flows | You are touching routing, middleware, cookies, or request typing |
| [Recker](/dependencies/recker.md) | Higher-level HTTP transport and HTTP/2 utilities | You are working on HTTP clients, transport tuning, or crawl-style integrations |
| [Redblue](/dependencies/redblue.md) | Recon toolchain dependency | You are working on the Recon plugin or dependency checks |

## Read by Job

If you are:

- defining resource schemas: start with [Fastest Validator](/dependencies/fastest-validator.md)
- changing request routing or middleware behavior: start with [Raffel](/dependencies/raffel.md)
- debugging retries, HTTP/2, or outbound transport behavior: start with [Recker](/dependencies/recker.md)
- trying to understand logger propagation: start with [Pino & Logging](/dependencies/pino.md)
- working on Recon bootstrapping or local tool setup: start with [Redblue](/dependencies/redblue.md)

## See Also

- [Core Schema Guide](/core/schema.md)
- [Logging](/logging.md)
- [API Plugin](/plugins/api/README.md)
- [Spider Plugin](/plugins/spider/README.md)
- [Recon System](/plugins/recon/README.md)
