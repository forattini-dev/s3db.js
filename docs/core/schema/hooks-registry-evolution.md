# Hooks, Registry & Schema Evolution

This guide covers the parts of schema that are easy to overlook until a system grows: transformation hooks, the schema registry used for stable storage mapping, and the patterns that let schemas evolve without corrupting existing data.

**Navigation:** [← Schema & Validation](/core/schema.md) | [Events](/core/events.md) | [Resource](/core/resource.md)

## TLDR

- Hooks are part of the schema lifecycle and should stay pure, focused, and serializable.
- The schema registry protects stable attribute-to-storage mapping as fields are added and removed.
- Schema evolution should prefer additive, compatible changes whenever possible.

## Table of Contents

- [Hooks](#hooks)
- [Hook Guidelines](#hook-guidelines)
- [Schema Registry](#schema-registry)
- [Schema Evolution Patterns](#schema-evolution-patterns)

## Hooks

Hooks let you transform data during writes and lifecycle operations.

| Hook | Typical Use |
| --- | --- |
| `beforeInsert` | defaults, slugs, derived fields |
| `afterInsert` | logging, notifications, side effects |
| `beforeUpdate` | recomputed fields, guards |
| `afterUpdate` | cache invalidation, replication |
| `beforeDelete` | backup, soft-delete prep |
| `afterDelete` | cleanup, notifications |

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

## Hook Guidelines

- keep hooks pure and small
- always return the data object
- do not rely on outer closures that will disappear when serialized
- move expensive side effects to queues or downstream systems when possible

Bad:

```javascript
const secret = process.env.MY_SECRET;

beforeInsert: [
  async (data) => {
    data.secret = secret;
    return data;
  }
]
```

Better:

```javascript
beforeInsert: [
  async (data) => {
    data.slug = data.title.toLowerCase().replace(/\s+/g, '-');
    return data;
  }
]
```

## Schema Registry

s3db.js stores compact attribute keys in storage. The schema registry preserves the mapping so field additions and removals do not reshuffle old data.

### What it stores

- `schemaRegistry` for user attributes
- `pluginSchemaRegistry` for plugin-managed attributes

### Why it matters

- existing fields keep their mapping
- new fields receive new mappings
- removed fields are burned rather than reused

That is one of the core mechanisms that makes schema evolution safer than naïve key compaction would be.

## Schema Evolution Patterns

### Safer changes

- add optional fields
- add fields with defaults
- widen validation carefully
- keep old records readable

### Riskier changes

- turning optional into required without migration
- changing semantic meaning of an existing field
- flattening or nesting fields without a compatibility plan

### Example

```javascript
// v1
attributes: {
  email: 'string|required|email'
}

// v2
attributes: {
  email: 'string|required|email',
  displayName: 'string|optional'
}
```

That is much safer than changing the type or semantics of `email` itself.
