# Pino and Logging in s3db.js

This page explains the logging dependency behind s3db.js. The project uses `pino` as its structured logger and wraps it with a small local API so loggers can flow cleanly through the database, plugin, resource, and request layers.

**Navigation:** [← Dependencies](/dependencies/README.md) | [Logging Guide](/logging.md)

---

## TLDR

- `pino` is the logging engine.
- `createLogger()` in `src/concerns/logger.ts` is the local abstraction you should think in terms of.
- Most code should receive a logger or derive a child logger instead of constructing ad-hoc console logging.
- `logger-best-practices` used to be a narrow implementation note; this page is the real dependency-level explanation.

## Table of Contents

- [Mental Model](#mental-model)
- [How Logger Propagation Works](#how-logger-propagation-works)
- [When to Create a Child Logger](#when-to-create-a-child-logger)
- [Common Mistakes](#common-mistakes)
- [FAQ](#faq)

## Mental Model

s3db.js does not treat logging as an afterthought. The logger is part of runtime context:

- the database has a root logger
- plugins inherit from that logger
- resources get their own scoped logger
- request handlers can read a request-scoped logger

That gives you structured logs without every feature inventing its own shape.

## How Logger Propagation Works

The local logging abstraction lives in `src/concerns/logger.ts`. It wraps `pino` and standardizes:

- default log levels
- pretty vs JSON output
- shared pretty transport reuse
- redact rules
- child logger bindings

Typical flow:

```text
Database logger
  -> plugin child logger
  -> resource child logger
  -> request child logger
  -> nested component child logger
```

If a component is reusable outside the main runtime, the usual pattern is:

- accept `logger` in the constructor
- create a fallback logger only when one is not provided

That keeps standalone utilities usable without breaking propagation in the full runtime.

## When to Create a Child Logger

Create a child logger when the subcomponent has stable context worth attaching to every log line.

Good examples:

- a plugin manager
- a background worker
- a request pipeline
- a resource-specific subsystem

Typical pattern:

```javascript
const logger = db.getChildLogger('ApiPlugin', { plugin: 'api' });
const routeLogger = logger.child({ route: '/users' });
```

Use raw `console.log` only for temporary debugging, not for real product behavior.

## Common Mistakes

### Creating loggers too early

Plugin constructors often run before the full runtime context exists. Prefer deriving `this.logger` after installation hooks or from injected dependencies.

### Losing structure

Prefer:

```javascript
logger.info({ userId, route }, 'Request completed');
```

not:

```javascript
logger.info(`Request completed for ${userId} on ${route}`);
```

### Treating pretty output as the production format

Pretty output is useful for humans. JSON output is what you want for aggregation and machine analysis.

## FAQ

### Do I need to install `pino` manually?

No for normal s3db.js usage. It is already part of the runtime. You only care about direct `pino` APIs when extending internals or integrating custom transports.

### Where should I read about HTTP request logs?

Start with [Logging](/logging.md). That page is about operational usage. This page is about the dependency and architecture behind it.

### Is `pino-http` required?

No. It is an optional dependency for enhanced request/response serialization in some API scenarios.

## See Also

- [Logging Guide](/logging.md)
- [API Plugin](/plugins/api/README.md)
- [Fastest Validator](/dependencies/fastest-validator.md)
