# Nested Objects & Arrays

This guide explains how to model richer record shapes in s3db.js. It covers auto-detected nested objects, explicit object syntax when you need tighter control, and the array patterns that matter most for metadata-backed storage.

**Navigation:** [← Schema & Validation](/core/schema.md) | [Behaviors](/core/behaviors.md)

## TLDR

- Nested objects are fully supported and usually do not need explicit `$$type`.
- Arrays are supported, but large or deeply nested arrays should be treated as a storage-shape decision, not just a validation decision.
- If a structure is getting large or highly variable, read this together with [Behaviors](/core/behaviors.md).

## Table of Contents

- [Nested Objects](#nested-objects)
- [Optional and Controlled Objects](#optional-and-controlled-objects)
- [Arrays](#arrays)
- [Encoding Choices](#encoding-choices)
- [Design Guidance](#design-guidance)

## Nested Objects

The default style is the natural one:

```javascript
attributes: {
  profile: {
    displayName: 'string',
    bio: 'string|max:500',
    avatar: 'string|url'
  }
}
```

s3db.js auto-detects this as an object schema.

## Optional and Controlled Objects

Use `$$type` when you need explicit validation behavior on the object itself.

```javascript
attributes: {
  profile: {
    $$type: 'object|optional',
    displayName: 'string',
    bio: 'string'
  }
}
```

For rarer cases with full control:

```javascript
attributes: {
  settings: {
    type: 'object',
    optional: false,
    strict: true,
    props: {
      locale: 'string',
      timezone: 'string'
    }
  }
}
```

## Arrays

### Arrays of strings

```javascript
{
  tags: {
    type: 'array',
    items: 'string',
    max: 10
  }
}
```

### Arrays of numbers

```javascript
{
  scores: {
    type: 'array',
    items: 'number'
  }
}
```

### Arrays of objects

```javascript
{
  comments: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        author: 'string',
        text: 'string',
        createdAt: 'date'
      }
    }
  }
}
```

## Encoding Choices

s3db.js picks storage representations based on the content:

| Content | Typical Encoding |
| --- | --- |
| strings | compact joined representation |
| numbers | compact numeric encoding |
| embeddings | fixed-point compact encoding |
| objects | JSON representation |

That does not mean “arrays are free”. Large arrays still affect metadata pressure, body overflow, and read/write cost.

## Design Guidance

### Prefer stable nesting

Use nested objects when the shape is part of the domain model, not when it is just a convenient dumping ground.

### Keep arrays intentional

If an array grows without bound, it may want to become its own resource instead of living inside one record.

### Watch metadata size

If your object graph is large, schema design and behavior design must be considered together.
