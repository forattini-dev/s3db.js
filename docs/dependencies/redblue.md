# Redblue in s3db.js

This page explains the role of `redblue` in s3db.js. Unlike the other dependency pages here, this is not a broad runtime package dependency. It is a toolchain dependency used by the Recon plugin.

**Navigation:** [← Dependencies](/dependencies/README.md) | [Recon System](/plugins/recon/README.md)

---

## TLDR

- `redblue` is a Recon dependency, not a general s3db.js runtime dependency.
- The Recon plugin checks for the `rb` binary and surfaces installation guidance when it is missing.
- If you do not use Recon, you can ignore this page entirely.

## Table of Contents

- [Where It Fits](#where-it-fits)
- [How s3db.js Treats It](#how-s3dbjs-treats-it)
- [What Users Need to Do](#what-users-need-to-do)
- [FAQ](#faq)

## Where It Fits

`redblue` appears in the Recon stack as the all-in-one tool dependency behind reconnaissance workflows. The local dependency manager lives in `src/plugins/recon/managers/dependency-manager.ts`.

The important distinction is:

- `fastest-validator`, `pino`, `raffel`, and parts of `recker` are code-level dependencies
- `redblue` is an external tool dependency that must exist in the environment

## How s3db.js Treats It

The Recon runtime does not silently assume the tool exists. It:

- checks whether `rb` is available
- emits warnings when it is missing
- provides install guidance
- reports dependency status through Recon events

That is the right level of coupling for a tool dependency: explicit, environment-aware, and easy to diagnose.

## What Users Need to Do

If you work on Recon locally, verify the binary is available:

```bash
rb --version
```

If not, follow the install guidance surfaced by the plugin or the tool's upstream install docs.

Do not document Redblue as a generic package requirement for the whole repo. That would be misleading.

## FAQ

### Should Redblue appear in the normal install instructions for s3db.js?

No. Only Recon users need it.

### Is this an npm dependency?

Not in the same way as the other pages in this section. It is treated as an external tool dependency.

### Why document it here at all?

Because it is still part of the system-level dependency story, and users working on Recon need a clean explanation instead of a mysterious missing-binary error.

## See Also

- [Recon System](/plugins/recon/README.md)
- [Plugin Dependencies](/plugins/guides/dependencies.md)
