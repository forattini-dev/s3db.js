# Resources

This section explains the `Resource` abstraction, which is where schema, storage behavior, indexing strategy, lifecycle logic, and operational methods come together in s3db.js. If `Database` is the entry point, `Resource` is where most application design actually happens.

**Navigation:** [← Core Concepts](/core/README.md) | [Schema & Validation](/core/schema.md) | [Partitions](/core/partitions.md) | [Behaviors](/core/behaviors.md)

## TLDR

- A resource is not just a collection of records. It is the place where schema, behavior, partitions, hooks, middlewares, events, and binary content are defined.
- The most important day-to-day methods are `insert`, `get`, `update`, `patch`, `replace`, `delete`, `list`, `query`, `page`, `insertMany`, `getMany`, and `deleteMany`.
- If a resource feels slow or awkward, the root cause is usually schema shape, partition design, or behavior choice.

## Table of Contents

- [What a Resource Owns](#what-a-resource-owns)
- [Reading Guide](#reading-guide)
- [Method Families at a Glance](#method-families-at-a-glance)
- [Typical Design Questions](#typical-design-questions)
- [Next Steps](#next-steps)

## What a Resource Owns

In s3db.js, a resource owns all of these concerns:

| Concern | Examples |
| --- | --- |
| Record shape | attributes, validation rules, defaults |
| Storage strategy | `user-managed`, `body-overflow`, `body-only` |
| Read patterns | partitions, pagination, query shape |
| Lifecycle logic | hooks, middlewares, events |
| Operational workflows | bulk methods, streaming, binary content, versioning |

That is why resource design is the core modeling activity in this project.

## Reading Guide

Use the subguides based on the decision you are making:

| If you need to understand... | Read |
| --- | --- |
| how to define and configure a resource | [Creating & Configuring Resources](./resource/creating-configuring.md) |
| which methods exist and when to use them | [Resource Methods & Querying](./resource/methods-querying.md) |
| how hooks and middlewares differ | [Hooks & Middlewares](./resource/hooks-middlewares.md) |
| versioning, binary content, and advanced operational concerns | [Advanced Resource Features](./resource/advanced-features.md) |

Read these alongside the dedicated core guides for:

- [Schema & Validation](./schema.md)
- [Behaviors](./behaviors.md)
- [Partitions](./partitions.md)
- [Events](./events.md)
- [Streaming](./streaming.md)

## Method Families at a Glance

| Goal | Primary Methods |
| --- | --- |
| create or mutate one record | `insert`, `update`, `patch`, `replace`, `delete`, `upsert` |
| work on many records | `insertMany`, `getMany`, `deleteMany`, `deleteAll` |
| browse and count | `list`, `listIds`, `count`, `page` |
| filter | `query`, partition-aware list/page patterns |
| handle files or payload bodies | `setContent`, `getContent`, `hasContent`, `deleteContent` |

## Typical Design Questions

### Should this be one resource or many?

If one record is accumulating large arrays, arbitrary nested objects, or unrelated lifecycle rules, it may want to become multiple resources.

### Should this be a partition?

If you repeatedly read by `tenantId`, `userId`, `status`, `type`, or another stable access key, read [Partitions](./partitions.md) early.

### Should this use hooks, middlewares, or events?

- hooks change lifecycle behavior
- middlewares wrap method execution
- events are for observation and reactions

Read [Hooks & Middlewares](./resource/hooks-middlewares.md) and [Events](./events.md) together before mixing them.

### Will this outgrow metadata?

If records can become large or carry binary content, read [Behaviors](./behaviors.md), [Streaming](./streaming.md), and [Advanced Resource Features](./resource/advanced-features.md).

## Next Steps

- [Creating & Configuring Resources](./resource/creating-configuring.md)
- [Resource Methods & Querying](./resource/methods-querying.md)
- [Hooks & Middlewares](./resource/hooks-middlewares.md)
- [Advanced Resource Features](./resource/advanced-features.md)
- [Schema & Validation](./schema.md)
- [Partitions](./partitions.md)
