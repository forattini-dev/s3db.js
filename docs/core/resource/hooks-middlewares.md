# Hooks & Middlewares

This guide explains the two lifecycle extension mechanisms that are easiest to confuse in s3db.js. Hooks are resource lifecycle functions. Middlewares wrap method execution as a whole.

**Navigation:** [← Resources](/core/resource.md) | [Events](/core/events.md)

## TLDR

- Hooks belong to the resource lifecycle.
- Middlewares belong to the invocation pipeline.
- Events belong to observation and reaction, not mutation.

## Table of Contents

- [Hooks](#hooks)
- [Middlewares](#middlewares)
- [When to Use Which](#when-to-use-which)
- [Practical Patterns](#practical-patterns)

## Hooks

Hooks run before or after resource lifecycle operations.

Typical hooks:

- `beforeInsert`
- `afterInsert`
- `beforeUpdate`
- `afterUpdate`
- `beforeDelete`
- `afterDelete`

```javascript
hooks: {
  beforeInsert: [
    async (data) => {
      data.slug = data.title.toLowerCase().replace(/\s+/g, '-');
      return data;
    }
  ]
}
```

### Good uses

- deriving fields
- validating cross-field rules
- assigning defaults that need runtime context
- lightweight lifecycle enrichment

## Middlewares

Middlewares wrap the method call itself and are better for cross-cutting concerns.

### Good uses

- access control
- audit envelopes
- performance timing
- argument transformation
- blocking or short-circuiting operations

Think of hooks as resource-centric and middlewares as execution-centric.

## When to Use Which

| Need | Prefer |
| --- | --- |
| mutate record data around insert/update/delete | hooks |
| apply policy to a method call | middlewares |
| notify or observe after the fact | events |

## Practical Patterns

### Slug generation

Use a hook.

### Authorization

Use middleware.

### Audit feed or monitoring

Usually use events, sometimes middleware if you need method-level envelopes.

### Avoid overlap

If the same concern is partly in hooks, partly in middleware, and partly in events, maintenance gets expensive quickly. Pick the mechanism that matches the concern and keep the other layers simpler.
