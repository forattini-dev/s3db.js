# Advanced Resource Features

This guide covers the operational features around a resource that tend to matter once the system is real: binary content, resource versioning, custom IDs, and how these features relate to behaviors and streaming.

**Navigation:** [← Resources](/core/resource.md) | [Behaviors](/core/behaviors.md) | [Streaming](/core/streaming.md)

## TLDR

- Binary content should be treated as a first-class part of the resource design, not as an afterthought.
- Versioning and custom ID generation are resource-level decisions with long-term consequences.
- For large migrations or heavy backfills, advanced features usually need to be read together with behaviors and streaming.

## Table of Contents

- [Binary Content](#binary-content)
- [Versioning](#versioning)
- [Custom IDs](#custom-ids)
- [Performance Notes](#performance-notes)

## Binary Content

Resources can manage content bodies alongside structured metadata.

Typical operations:

- `setContent`
- `getContent`
- `hasContent`
- `deleteContent`

This is useful for:

- documents
- images or generated assets
- derived artifacts
- large secondary payloads attached to a record

If binary content is central to the resource, read [Behaviors](/core/behaviors.md) carefully because metadata/body strategy directly affects the I/O shape.

## Versioning

Resource versioning is useful when record history or schema evolution must stay inspectable over time.

Use it when:

- you need audit-like record history
- schema changes must be easier to reason about
- rollback or historical inspection matters

Do not enable it by reflex. It has storage and operational consequences.

## Custom IDs

You can control identifiers with:

- `idGenerator`
- `idSize`

Use custom IDs when there is a strong domain reason, not only for cosmetics.

Good examples:

- externally meaningful IDs
- integration compatibility
- ordered business identifiers

Be careful not to destroy the simplicity and collision safety of built-in IDs without a reason.

## Performance Notes

- large records: choose behaviors intentionally
- large jobs: prefer streaming
- repeated lookups: design partitions
- binary-heavy resources: keep metadata lean and explicit
