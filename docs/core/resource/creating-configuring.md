# Creating & Configuring Resources

This guide covers the shape of a resource definition: the required fields, the common configuration flags, and the design decisions that matter when a resource moves from toy CRUD to production use.

**Navigation:** [← Resources](/core/resource.md) | [Schema & Validation](/core/schema.md) | [Behaviors](/core/behaviors.md)

## TLDR

- A resource definition should be treated as domain design, not as boilerplate.
- The highest-value config choices are: `attributes`, `behavior`, `partitions`, `timestamps`, `security`, and `strictValidation`.
- Start simple, but choose behavior and partition strategy intentionally.

## Table of Contents

- [Basic Example](#basic-example)
- [Complete Example](#complete-example)
- [Configuration Reference](#configuration-reference)
- [Design Notes](#design-notes)

## Basic Example

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    name: 'string|required|min:2|max:100',
    age: 'number|optional|min:0|max:150'
  }
});
```

## Complete Example

```javascript
const orders = await db.createResource({
  name: 'orders',
  version: 'v2',
  attributes: {
    orderId: 'string|required',
    userId: 'string|required',
    status: 'string|required|enum:pending,processing,completed,cancelled',
    total: 'number|required|min:0',
    paymentToken: 'secret|required'
  },
  behavior: 'body-overflow',
  timestamps: true,
  versioningEnabled: true,
  partitions: {
    byStatus: { fields: { status: 'string' } },
    byUser: { fields: { userId: 'string' } }
  },
  asyncPartitions: true,
  security: {
    bcrypt: { rounds: 14 }
  },
  autoDecrypt: true,
  paranoid: true,
  strictValidation: true
});
```

## Configuration Reference

| Parameter | Description |
| --- | --- |
| `name` | unique resource name |
| `version` | logical resource version label |
| `attributes` | schema definition |
| `behavior` | storage strategy under metadata pressure |
| `timestamps` | auto-add `createdAt` and `updatedAt` |
| `versioningEnabled` | resource version history support |
| `idGenerator`, `idSize` | custom or sized automatic IDs |
| `partitions` | partition definitions for fast access paths |
| `asyncPartitions` | faster writes with asynchronous partition indexing |
| `security` | resource-level security override for passphrase, pepper, bcrypt, argon2 |
| `autoDecrypt` | secret fields are decrypted on reads |
| `paranoid` | safer defaults for destructive operations |
| `parallelism` | concurrency used by bulk operations |
| `strictValidation` | strict schema enforcement |
| `hooks` | lifecycle hooks |
| `events` | declarative event listeners |
| `asyncEvents` | async event delivery behavior |

## Design Notes

### `attributes` is the real heart

If `attributes` is vague, the rest of the resource definition is usually compensating for unclear modeling.

### `behavior` is not optional in practice

You can omit it, but in production you should still make an explicit choice after reading [Behaviors](/core/behaviors.md).

### `security` can be local

Resource-level `security` deep-merges with database-level security. That is useful when one resource needs stricter bcrypt rounds, a different passphrase boundary, or custom password policy defaults.

### `partitions` are design, not optimization polish

If a resource is central to the application, partitioning belongs in the first serious design pass.
