# Fastest Validator in s3db.js

This page explains how s3db.js uses `fastest-validator` for resource schemas, request validation, and local validation aliases. It is not a copy of the upstream README; it focuses on the subset that matters inside this codebase.

**Navigation:** [← Dependencies](/dependencies/README.md) | [Core Schema](/core/schema.md) | [Core Resource](/core/resource.md)

---

## TLDR

- Resource `attributes` use `fastest-validator` syntax.
- s3db.js wraps it in its own `Validator` class in `src/validator.class.ts` to add aliases like `secret`, `password`, `json`, and `embedding`.
- The API stack also uses compiled schemas so validation happens at registration time instead of on every request path setup.
- If you need the full syntax reference, read the upstream docs after you understand our local conventions.

## Table of Contents

- [Where It Shows Up](#where-it-shows-up)
- [What s3db Adds on Top](#what-s3db-adds-on-top)
- [Patterns We Rely On](#patterns-we-rely-on)
- [Common Pitfalls](#common-pitfalls)
- [FAQ](#faq)

## Where It Shows Up

`fastest-validator` is the schema engine behind:

- resource `attributes` in the core database model
- custom aliases implemented by `src/validator.class.ts`
- route schema compilation in `src/plugins/api/app.class.ts`

Typical resource usage looks like this:

```javascript
await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|min:2|max:100',
    email: 'email',
    age: 'number|integer|positive',
    isActive: 'boolean'
  }
});
```

The important mental model is that s3db.js treats validation as part of resource definition, not as an optional layer you bolt on later.

## What s3db Adds on Top

The local `Validator` wrapper extends upstream behavior with aliases that are directly useful in the platform:

| Alias | Purpose |
| --- | --- |
| `secret` | string value that can be encrypted automatically |
| `secretAny` | non-string secret payloads that still go through encryption flow |
| `secretNumber` | numeric secret values |
| `password` | password hashing using bcrypt by default |
| `password:bcrypt` | explicit bcrypt hashing |
| `password:argon2id` | explicit argon2id hashing |
| `json` | arbitrary payload converted to JSON string |
| `embedding` | non-empty numeric vector |

That means this codebase is not using `fastest-validator` raw. If you change validation behavior, review the wrapper first, not just the upstream package.

## Patterns We Rely On

### 1. Shorthand syntax for common fields

```javascript
attributes: {
  title: 'string|min:3',
  published: 'boolean',
  score: 'number|integer'
}
```

This is the most common style across the repo and docs.

### 2. Strict object normalization

The local validator defaults objects to `strict: 'remove'`, so unknown keys are usually stripped instead of silently kept. That is an s3db opinion, not just a raw library default.

### 3. Security-aware aliases

The security-centric aliases are where most platform-specific behavior lives:

```javascript
attributes: {
  apiKey: 'secret',
  password: 'password:argon2id',
  profile: 'json'
}
```

Those aliases interact with encryption and hashing concerns from the core runtime, not just type checking.

### 4. Compile once, reuse often

The API layer compiles schemas during route registration. The point is predictable validation cost and cleaner startup failures when a schema is invalid.

## Common Pitfalls

### Treating upstream examples as drop-in s3db config

Most upstream `fastest-validator` examples work, but they do not explain local aliases, encryption behavior, or default object strictness.

### Forgetting that validation can mutate data

In s3db.js, validation is not always passive. It can:

- trim strings
- convert numbers and booleans
- strip unknown object properties
- encrypt secrets
- hash passwords
- stringify JSON payloads

### Debugging the wrong layer

If a validation result looks surprising, check in this order:

1. your resource schema
2. `src/validator.class.ts`
3. the surrounding resource or API code
4. upstream `fastest-validator` behavior

## FAQ

### Do I need to install `fastest-validator` separately?

No. It is a direct dependency of s3db.js and already part of the runtime.

### Should I read the upstream README?

Yes, when you need full rule syntax or obscure validators. Start here first so you understand which parts are extended locally.

### Is this only for resources?

No. Resource schemas are the main user-facing entry point, but the API layer also compiles schemas for request handling.

## See Also

- [Core Schema Guide](/core/schema.md)
- [Core Resource Guide](/core/resource.md)
- [Plugin Dependencies](/plugins/guides/dependencies.md)
- Upstream docs: https://github.com/icebob/fastest-validator
