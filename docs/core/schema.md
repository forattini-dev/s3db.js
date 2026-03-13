# Schema & Validation

This section explains how s3db.js turns attribute definitions into real runtime behavior. Schema is not just input validation here: it also controls hashing, encryption, compact encodings, nested object handling, array serialization, and how safely your data evolves over time.

**Navigation:** [← Core Concepts](/core/README.md) | [Resource](/core/resource.md) | [Encryption](/core/encryption.md) | [Streaming](/core/streaming.md)

## TLDR

- Schema design in s3db.js affects storage, performance, and security, not only developer ergonomics.
- The most important schema decisions are: field types, partition-friendly shape, nesting depth, and whether sensitive data should be hashed or encrypted.
- Start with the overview here, then go to the focused pages below instead of reading one giant document.

## Table of Contents

- [Quick Start](#quick-start)
- [What Schema Controls](#what-schema-controls)
- [Reading Guide](#reading-guide)
- [Type Families at a Glance](#type-families-at-a-glance)
- [Common Design Decisions](#common-design-decisions)
- [Next Steps](#next-steps)

## Quick Start

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    password: 'password|required|min:12',
    apiKey: 'secret|optional',
    role: 'string|enum:admin,user,viewer',
    profile: {
      displayName: 'string',
      bio: 'string|max:500'
    },
    tags: {
      type: 'array',
      items: 'string',
      max: 10
    }
  }
});
```

That single schema controls:

- field validation
- password hashing
- secret encryption
- nested object rules
- array encoding
- schema evolution behavior

## What Schema Controls

In s3db.js, schema affects several layers at once:

| Concern | Examples |
| --- | --- |
| Validation | required fields, `min`, `max`, enums, email rules |
| Security | `password`, `secret`, `secretAny`, `secretNumber` |
| Storage efficiency | `embedding`, `ip4`, `ip6`, `geoLat`, `geoLon`, compact arrays |
| Shape of records | nested objects, optional sections, arrays of objects |
| Runtime behavior | hooks, generated transformations, schema registry, evolution |

That is why schema deserves its own section in the core docs instead of living only as examples inside resource configuration.

## Reading Guide

Pick the page that matches the decision you are trying to make:

| If you need to decide... | Read |
| --- | --- |
| which field types exist and what they do | [Custom Types](./schema/custom-types.md) |
| how fastest-validator syntax maps into s3db.js | [Validation Rules](./schema/validation-rules.md) |
| how to model nested objects and arrays | [Nested Objects & Arrays](./schema/nested-objects-arrays.md) |
| how hooks and schema evolution behave | [Hooks, Registry & Evolution](./schema/hooks-registry-evolution.md) |
| how to keep schemas production-friendly | [Patterns & Troubleshooting](./schema/patterns-troubleshooting.md) |

## Type Families at a Glance

| Family | Examples | Why It Exists |
| --- | --- | --- |
| Standard validators | `string`, `number`, `boolean`, `date`, `enum` | Base validation and normalization |
| Security-aware | `password`, `secret`, `secretAny`, `secretNumber` | Hashing and encryption at rest |
| Space-optimized | `datetime`, `dateonly`, `timeonly`, `uuid`, `mac`, `cidr`, `phone`, `semver`, `color`, `embedding`, `ip4`, `ip6`, `geoLat`, `geoLon` | Better fit for S3 metadata limits |
| Structural | nested objects, arrays, `json` | Rich payloads with predictable shape |
| Runtime-linked | hooks, schema registry | Safe evolution and transformation |

## Common Design Decisions

### `password` or `secret`?

- Use `password` for credentials that should never be recoverable.
- Use `secret` for values the application must read back later.

### Flat fields or nested objects?

- Flat fields are simpler and often cheaper.
- Nested objects are fine when they represent stable structure, not arbitrary blobs.

### Array or partition?

- Arrays model record shape.
- Partitions model access patterns.
- If you query by a value repeatedly, that is a partition question, not an array question.

### Metadata-friendly or body-friendly?

If records can grow substantially, schema design should be read together with [Behaviors](./behaviors.md) and [Streaming](./streaming.md).

## Next Steps

- [Custom Types](./schema/custom-types.md)
- [Validation Rules](./schema/validation-rules.md)
- [Nested Objects & Arrays](./schema/nested-objects-arrays.md)
- [Hooks, Registry & Evolution](./schema/hooks-registry-evolution.md)
- [Patterns & Troubleshooting](./schema/patterns-troubleshooting.md)
- [Encryption](./encryption.md)
