# Schema Patterns & Troubleshooting

This guide pulls together the operational side of schema work: performance advice, practical patterns, and the failure modes that show up most often once resources carry real production data.

**Navigation:** [← Schema & Validation](/core/schema.md) | [Partitions](/core/partitions.md) | [Behaviors](/core/behaviors.md)

## TLDR

- Good schema design is usually boring and explicit.
- If records may get large, choose the behavior strategy early.
- If a field becomes central to read patterns, that is often a partition decision.
- Many “schema bugs” are really storage-shape or lifecycle-design bugs.

## Table of Contents

- [Performance Patterns](#performance-patterns)
- [Common Errors](#common-errors)
- [Debug Tips](#debug-tips)
- [Checklist](#checklist)

## Performance Patterns

### Use behaviors intentionally

```javascript
await db.createResource({
  name: 'documents',
  behavior: 'body-overflow',
  attributes: {
    title: 'string|required',
    content: 'string|required',
    embedding: 'embedding:1536'
  }
});
```

### Use the right type for the job

Good:

```javascript
{ vector: 'embedding:1536' }
```

Less good:

```javascript
{ vector: { type: 'array', items: 'number' } }
```

### Partition for access patterns

If you read by `country`, `tenantId`, `userId`, or `status` all the time, model that with [Partitions](/core/partitions.md), not only with query filters.

## Common Errors

### Required field missing

```javascript
await users.insert({ email: 'test@example.com' });
```

Fix the schema contract or provide the missing field.

### Invalid format

```javascript
await users.insert({ email: 'not-an-email' });
```

Use clearer field types and validators when a format matters.

### Metadata limit pressure

If records exceed metadata limits, that is usually a sign to revisit:

- large nested payloads
- large arrays
- vectors stored without compact types
- behavior strategy

### Missing encryption config

If a `secret` field exists and `security.passphrase` is missing, the failure is configuration, not schema syntax.

## Debug Tips

- inspect the resource definition directly
- validate representative payloads before bulk imports
- test worst-case record size, not only happy-path examples
- review schema together with partitions and behaviors, not in isolation

## Checklist

- [ ] Sensitive fields use `password` or `secret` intentionally
- [ ] Large numeric vectors use `embedding`
- [ ] Stable nested structures are modeled explicitly
- [ ] Large or unbounded collections are not buried inside one record
- [ ] Access-pattern fields are considered for partitions
- [ ] The chosen behavior matches expected record size
