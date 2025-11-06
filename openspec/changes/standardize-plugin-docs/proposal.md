# Standardize Plugin Documentation

**Change ID:** `standardize-plugin-docs`
**Status:** Proposed
**Created:** 2025-11-06

## Overview

Establish a unified documentation standard for all s3db.js plugins to ensure consistency, discoverability, and user-friendliness across the entire plugin ecosystem. This change will create formal documentation requirements, templates, and organizational structure for both simple and complex plugins.

## Problem Statement

Currently, plugin documentation across `./docs/plugins/` has inconsistent structure and quality:

**Current State (69 documentation files):**
- ✅ **puppeteer.md**: Exemplary documentation with comprehensive structure (1,850+ lines, 80+ FAQ entries)
- 🟡 **Mixed quality**: Some plugins have good docs, others are minimal or inconsistent
- ❌ **No formal standard**: Each plugin follows different formatting and organization
- ❌ **Navigation gaps**: Inconsistent cross-linking between sections and related docs
- ❌ **Complex plugins**: No clear pattern for organizing multi-feature plugins (e.g., Api, Recon have subdirectories but inconsistent structure)
- ❌ **No template**: New plugin authors lack guidance on documentation expectations

**Impact:**
- Users struggle to find information across different plugin docs
- Inconsistent learning experience when exploring multiple plugins
- Harder to maintain and update documentation
- New contributors don't know what documentation is expected

## Goals

### Primary Goals

1. **Consistency**: Every plugin follows the same documentation structure
2. **Discoverability**: Clear navigation between sections and related documentation
3. **Scalability**: Support both simple plugins and complex multi-feature plugins
4. **Maintainability**: Templates and standards make it easy to create and update docs
5. **User Experience**: Progressive learning path from quickstart to advanced features

### Non-Goals

- Rewriting all existing plugin documentation (will be incremental)
- Changing plugin functionality or APIs
- Creating automated documentation generation from code

## Proposed Solution

### Documentation Standard

All plugin documentation must follow this structure:

```markdown
# 🎭 Plugin Name

> **One-line description**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration) | [FAQ ↓](#-faq)

---

## ⚡ TLDR
## 📑 Table of Contents
## ⚡ Quickstart
## 📦 Dependencies
## Usage Journey (or Usage Patterns)
## 📊 Configuration Reference
## 📚 Configuration Examples
## 🔧 API Reference
## ✅ Best Practices
## 🚨 Error Handling
## 🔗 See Also
## ❓ FAQ
```

### File Organization

**Simple Plugins** (single file):
```
./docs/plugins/
├── plugin-name.md          # Complete documentation
└── README.md               # Plugin index
```

**Complex Plugins** (subdirectory):
```
./docs/plugins/
├── plugin-name.md          # Main overview + quickstart
├── plugin-name/            # Deep-dive documentation
│   ├── feature-1.md
│   ├── feature-2.md
│   ├── architecture.md
│   └── README.md           # Feature index
└── README.md               # Plugin index
```

**Criteria for Complex Plugin**:
- 5+ major features requiring separate explanation
- Multiple integration patterns
- Architecture/design documentation needed
- 50+ FAQ entries
- 2000+ lines of documentation in single file

**Current Complex Plugins**:
- ApiPlugin (authentication, authorization, guards, integrations)
- PuppeteerPlugin (already has subdirectory)
- ReconPlugin (scanning, discovery, monitoring)
- CloudInventoryPlugin (multi-cloud providers)

### Documentation Files to Create

1. **./docs/plugin-docs-standard.md**: Complete standard specification
2. **./docs/templates/plugin-doc-template.md**: Full template with examples
3. **./docs/templates/plugin-doc-minimal.md**: Minimal viable documentation
4. **./docs/plugins/README.md**: Updated plugin index with quality badges

### Navigation System

**Required Navigation Elements**:

1. **Header Navigation**: Plugin Index, Configuration, FAQ
2. **Table of Contents**: All major sections with anchor links
3. **Cross-References**: Links to related plugins, examples, concepts
4. **Section Transitions**: Clear flow from basic to advanced

**Example Navigation**:
```markdown
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration) | [FAQ ↓](#-faq)

## 📑 Table of Contents

1. [⚡ TLDR](#-tldr)
2. [⚡ Quickstart](#-quickstart)
3. [Usage Journey](#usage-journey)
   - [Level 1: Basic Usage](#level-1-basic-usage)
   - [Level 2: Intermediate](#level-2-intermediate)

...

## 🔗 See Also

- [Related Plugin](./related-plugin.md) - How they work together
- [Core Concept](../concepts/concept.md) - Background info
```

## Deliverables

### Phase 1: Foundation (This Change)

1. **Documentation Standard** (`./docs/plugin-docs-standard.md`)
   - Complete specification with all 12 required sections
   - Examples from puppeteer.md as gold standard
   - Quality checklist for reviews

2. **Templates** (`./docs/templates/`)
   - `plugin-doc-template.md`: Full template with inline guidance
   - `plugin-doc-minimal.md`: Minimal viable documentation

3. **Updated Plugin Index** (`./docs/plugins/README.md`)
   - Categorized plugin list
   - Documentation quality badges (🟢 Complete, 🟡 Partial, 🔴 Minimal)
   - Links to standard and templates

4. **Update CLAUDE.md**
   - Reference to `./docs/plugin-docs-standard.md`
   - Guidance for AI assistants on documentation expectations

### Phase 2: Migration (Future)

- Update existing plugin docs to match standard (incremental)
- Organize complex plugins into subdirectories
- Create feature-specific deep-dive docs for complex plugins

## Success Criteria

1. ✅ Documentation standard file exists and is comprehensive
2. ✅ Templates are usable without additional guidance
3. ✅ Plugin index shows documentation status for all plugins
4. ✅ New plugins can achieve 🟢 Complete rating by following template
5. ✅ Navigation works consistently across all plugin docs

## Migration Strategy

**Incremental Approach** (to avoid massive refactor):

1. **Create Standard** (this change) - Foundation for all future docs
2. **New Plugins** - Use template from day one
3. **Major Updates** - Apply standard when doing significant plugin updates
4. **Priority Plugins** - Gradually update most-used plugins
5. **Community** - Contributors can help standardize remaining docs

**No Requirement** to immediately update all 69 existing docs. Standard ensures future consistency.

## Alternatives Considered

### Alternative 1: Automated Documentation Generation

**Description**: Generate docs from JSDoc comments and plugin code.

**Rejected Because**:
- Doesn't capture usage patterns, best practices, or troubleshooting
- Examples and learning journey require human curation
- Configuration examples need real-world context
- FAQ requires actual user questions and solutions

### Alternative 2: Single Mega-Template

**Description**: One massive template covering every possible plugin type.

**Rejected Because**:
- Overwhelming for simple plugins
- Hard to maintain
- Doesn't scale to complex plugins with unique needs
- Better to have minimal + full templates

### Alternative 3: No Standard

**Description**: Let each plugin document however they want.

**Rejected Because**:
- Already experiencing inconsistency problems
- User experience suffers
- Harder to maintain ecosystem
- Missing learning opportunity from best examples (puppeteer.md)

## Dependencies

**Blocks:**
- None (documentation-only change)

**Blocked By:**
- None

**Related:**
- Future: Plugin quality audits
- Future: Documentation review process
- Future: Automated link checking

## References

- **Gold Standard**: `./docs/plugins/puppeteer.md` (1,850+ lines)
- **Existing Standard**: `CLAUDE.md` (lines 189-367) - Plugin Documentation Standard section
- **Current Docs**: 69 files in `./docs/plugins/`
- **Complex Plugin Examples**: `./docs/plugins/api/`, `./docs/plugins/recon/`, `./docs/plugins/puppeteer/`

## Open Questions

None. User requirements are clear:
1. Standardized structure ✅
2. Navigation between sections ✅
3. Complex plugins get subdirectories ✅
4. Clear documentation guide ✅
