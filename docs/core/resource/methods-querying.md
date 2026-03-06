# Resource Methods & Querying

This guide covers the main operational surface of a resource: single-record CRUD, bulk methods, collection reads, pagination, queries, and the tradeoffs between similar methods.

**Navigation:** [← Resources](/core/resource.md) | [Partitions](/core/partitions.md) | [Streaming](/core/streaming.md)

## TLDR

- `insert`, `get`, `update`, `patch`, `replace`, and `delete` cover most application flows.
- `patch` and `replace` exist because not all updates have the same cost profile.
- `page()` is the preferred read path for bounded navigation.
- `query()` is convenient, but partitions are what make repeated reads fast.

## Table of Contents

- [Single-Record Methods](#single-record-methods)
- [Update Method Comparison](#update-method-comparison)
- [Collection Reads](#collection-reads)
- [Querying and Filters](#querying-and-filters)
- [Bulk Methods](#bulk-methods)
- [Method Selection Guide](#method-selection-guide)

## Single-Record Methods

### `insert(data)`

Create a new document.

### `get(id)`

Fetch one document by ID.

### `update(id, data)`

GET + merge + write. Good default when you want safe partial updates.

### `patch(id, data)`

Optimized partial update path for metadata-friendly cases. Faster than `update()` in the right conditions.

### `replace(id, data)`

Full replacement. Faster than `update()`, but missing fields are lost.

### `upsert(id, data)` or `upsert(data)`

Insert-or-update flow when the caller already owns the identity logic.

### `delete(id)`

Delete one document.

## Update Method Comparison

| Method | Best Use | Tradeoff |
| --- | --- | --- |
| `update()` | safest default partial update | more work than specialized paths |
| `patch()` | fast metadata-only partial update | not always the fastest under body behaviors |
| `replace()` | explicit full replacement | caller must provide the full intended state |

## Collection Reads

### `list(options?)`

Simple list with optional `limit` and partition scope.

### `listIds(options?)`

Read IDs only. Useful when you want lighter enumeration or custom fetch strategy.

### `count(options?)`

Count all records or the records inside a partition scope.

### `page(options)`

Preferred for user-facing pagination and large collections.

```javascript
const first = await users.page({ size: 20 });

if (first.nextCursor) {
  const second = await users.page({
    size: 20,
    cursor: first.nextCursor
  });
}
```

## Querying and Filters

### `query(filter, options?)`

Use `query()` when you need expressive filtering and do not already have a direct partition path.

```javascript
const activeAdults = await users.query(
  { status: 'active', age: 25 },
  { limit: 10 }
);
```

Important distinction:

- partitions define fast access paths
- queries define filter logic

If a filter becomes common, revisit partition design instead of repeatedly paying scan costs.

## Bulk Methods

Use these when the unit of work is already plural:

- `insertMany(docs)`
- `getMany(ids)`
- `deleteMany(ids)`
- `deleteAll()`

For very large jobs, read [Streaming](/core/streaming.md) as well.

## Method Selection Guide

| Need | Prefer |
| --- | --- |
| create one record | `insert` |
| change a few fields safely | `update` |
| optimize a partial metadata-friendly mutation | `patch` |
| replace the full document | `replace` |
| list a collection page by page | `page` |
| filter by ad hoc conditions | `query` |
| repeat reads by known access key | partition-aware `list` or `page` |
| process many records | bulk methods or streaming |
