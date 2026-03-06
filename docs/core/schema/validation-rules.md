# Schema Validation Rules

This guide explains how fastest-validator syntax maps into s3db.js resource attributes. It focuses on the parts you reach for most often: pipe notation, object notation, defaults, enums, and the standard field types that form the base of most schemas.

**Navigation:** [← Schema & Validation](/core/schema.md) | [Resource](/core/resource.md)

## TLDR

- Pipe notation is the best default for most attributes.
- Object notation is better when arrays or advanced options make pipe syntax hard to read.
- Mixed notation is normal and often the clearest option.

## Table of Contents

- [Validation Flow](#validation-flow)
- [Notation Styles](#notation-styles)
- [Common Rules](#common-rules)
- [Standard Types](#standard-types)
- [Examples](#examples)

## Validation Flow

At write time, s3db.js validates incoming data against the resource schema, then runs the schema-linked transforms needed by the selected types and hooks.

That means validation is not isolated from runtime behavior. A field can validate, normalize, hash, encrypt, or serialize during the same write path.

## Notation Styles

### Pipe notation

Use this by default for straightforward fields.

```javascript
{
  email: 'string|required|email',
  age: 'number|optional|min:18',
  active: 'boolean|default:true'
}
```

### Object notation

Use this when the rules are complex enough that pipe syntax becomes noisy.

```javascript
{
  email: {
    type: 'string',
    required: true,
    email: true
  }
}
```

### Mixed notation

This is often the best real-world style.

```javascript
{
  email: 'string|required|email',
  tags: {
    type: 'array',
    items: 'string',
    min: 1,
    max: 10
  }
}
```

## Common Rules

| Rule | Example | Meaning |
| --- | --- | --- |
| `required` | `string|required` | must be present |
| `optional` | `string|optional` | may be omitted |
| `default:X` | `boolean|default:false` | fills missing value |
| `min:X` | `string|min:8` | minimum length or value |
| `max:X` | `string|max:100` | maximum length or value |
| `email` | `string|email` | email validation |
| `url` | `string|url` | URL validation |
| `enum` | `string|enum:active,inactive` | allowed values only |
| `pattern` | `string|pattern:/^[A-Z]/` | regex validation |
| `lowercase` | `string|lowercase` | normalize to lowercase |
| `uppercase` | `string|uppercase` | normalize to uppercase |
| `convert` | `number|convert` | coerce when allowed |

## Standard Types

### String

```javascript
{
  email: 'string|required|email',
  username: 'string|min:3|max:20',
  slug: 'string|pattern:/^[a-z0-9-]+$/'
}
```

### Number

```javascript
{
  age: 'number|min:18|max:120',
  score: 'number|integer|min:0|max:100'
}
```

### Boolean

```javascript
{
  active: 'boolean|default:true',
  enabled: 'bool|default:true'
}
```

`bool` and `boolean` work the same way.

### Date

```javascript
{
  createdAt: 'date|required',
  expiresAt: 'date|optional'
}
```

### Enum

```javascript
{
  role: 'string|enum:admin,user,viewer',
  priority: 'number|enum:1,2,3'
}
```

## Examples

### Simple user schema

```javascript
attributes: {
  email: 'string|required|email',
  name: 'string|required|min:2|max:120',
  role: 'string|enum:admin,user,viewer',
  active: 'boolean|default:true'
}
```

### A more constrained business record

```javascript
attributes: {
  sku: 'string|required|uppercase',
  price: 'number|required|positive',
  stock: 'number|integer|min:0',
  status: 'string|enum:draft,active,archived'
}
```
