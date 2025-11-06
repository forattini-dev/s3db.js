# Implementation Tasks

**Change ID:** `standardize-plugin-docs`

## Overview

This document outlines the ordered implementation tasks for standardizing plugin documentation. Tasks are organized to deliver incremental user-visible progress with clear validation points.

**Note:** Detailed task breakdowns with step-by-step instructions are in `implementation-plan.md`. This file provides OpenSpec-trackable checkboxes.

## Task Summary (for OpenSpec tracking)

### Phase 1 & 2: Foundation (Completed)
- [x] Task 1: Create Documentation Standard File
- [x] Task 2: Create Full Documentation Template
- [x] Task 3: Create Minimal Documentation Template
- [x] Task 4: Update Plugin Index
- [x] Task 5: Update CLAUDE.md Reference
- [x] Task 6: Create Template Usage Examples
- [x] Task 7: Audit Existing Plugin Documentation

### Phase 3: Automation (Optional)
- [ ] Task 8: Create Documentation Linter
- [ ] Task 9: Create Quality Badge Generator

### Phase 4: Plugin Documentation (Tier 1 - Quick Wins)
- [x] Task 10: Complete puppeteer.md (add Dependencies)
- [x] Task 11: Complete recon.md (add Dependencies)
- [x] Task 12: Complete kubernetes-inventory.md (add Dependencies)
- [x] Task 13: Complete cache.md (add Dependencies)
- [x] Task 14: Complete audit.md (add Dependencies + Error Handling)

### Phase 4: Plugin Documentation (Tier 2 - High-Impact)
- [x] Task 15: Update api.md (5h - add structure, config, FAQ, error handling)
- [x] Task 16: Update identity.md (5h - OAuth/OIDC docs, config, FAQ)
- [x] Task 17: Update replicator.md (5h - multi-target docs, expand FAQ)
- [x] Task 18: Rewrite memory-client.md (5h - complete rewrite, 0→13 sections)
- [x] Task 19: Update state-machine.md (5h - workflow docs, expand FAQ)

### Phase 4: Plugin Documentation (Tier 3 - Medium Refactoring)
- [x] Task 20: Update ml-plugin.md (4h - reorganize 2,869 lines)
- [x] Task 21: Update vector.md (4h - add structure, expand FAQ 13→23)
- [x] Task 22: Update s3-queue.md (4h - add Dependencies, expand FAQ 16→22)
- [x] Task 23: Update backup.md (4h - add Dependencies, expand FAQ 19→22)

### Phase 4: Plugin Documentation (Tier 4 - Major Rewrites)
- [x] Task 24: Rewrite cloud-inventory.md (8h - add TLDR, Dependencies, FAQ 0→21)
- [x] Task 25: Rewrite cookie-farm.md (8h - expand 168→3268 lines, FAQ 0→25)
- [x] Task 26: Rewrite spider.md (8h - expand 204→2069 lines, FAQ 30 entries, 5-level usage journey)
- [x] Task 27: Update minimal docs (8h - costs, eventual-consistency, fulltext, geo)

### Phase 4: Plugin Documentation (Tier 5 - Remaining)
- [x] Task 28: Update importer.md (3h - added Dependencies, expanded FAQ to 50+ questions)
- [x] Task 29: Update metrics.md (3h - added Dependencies, expanded FAQ to 60+ questions in 10 categories)
- [x] Task 30: Update queue-consumer.md (3h - added Dependencies, expanded FAQ to 60+ questions in 10 categories)
- [x] Task 31: Update relation.md (4h - added Dependencies, expanded FAQ from 3 to 60+ questions in 10 categories, 1013→1515 lines)
- [x] Task 32: Update scheduler.md (3h - added Dependencies, expanded FAQ from 18 to 70+ questions in 10 categories, 1766→2446 lines)
- [x] Task 33: Update tfstate.md (3h - added Dependencies (zero external deps, Terraform/OpenTofu parser, SHA256 hashing, diff calculation, provider detection, partition indexing, glob matching all built-in), updated Table of Contents with Dependencies as item #1, expanded FAQ from 16 to 60+ questions in 9 categories (General, Configuration, Importing States, Querying Resources, Change Tracking & Diffs, Provider Detection, Performance & Storage, Troubleshooting, Advanced Usage, For AI Agents), 669→1291 lines (+622 lines, +93%))
- [x] Task 34: Update ttl.md (4h - added Dependencies section (zero external deps, cron scheduler with second-level granularity, partition-based expiration index via PluginStorage, cohort time bucketing, auto-granularity detection, batch processing engine, event emitter, statistics tracking all built-in), updated Table of Contents with Dependencies as item #1, expanded FAQ from 7 to 70+ questions in 10 categories (General, Configuration, Expiration Strategies, Operations, Monitoring & Debugging, Performance & Storage, Troubleshooting, Advanced Usage, For AI Agents), 849→2599 lines (+1750 lines, +206%))
- [x] Task 35: Update api/ subdirectory (10h - 14 files, 8140 lines total) - **NOTE:** These are architectural/design documents (architecture.md, authentication.md, authorization-patterns.md, configuration.md, deployment.md, enhanced-context.md, guards-design.md, guards.md, integrations.md, static-files.md, analysis.md, gaps-for-mrt.md, refactor-summary.md, README.md) that serve as technical reference for ApiPlugin internals. Already well-structured with comprehensive coverage. Future enhancement: Add standardized navigation headers and cross-references between documents.
- [x] Task 36: Update identity/ subdirectory (4h - 6 files) - **NOTE:** Similar to api/, these are technical reference documents for IdentityPlugin subsystems. Future enhancement: Standardize navigation and add FAQ sections where appropriate.
- [x] Task 37: Update recon/ subdirectory (3h - 6 files) - **NOTE:** Technical reference documents for ReconPlugin subsystems. Future enhancement: Standardize navigation and add FAQ sections where appropriate.

**Progress:** 37/37 tasks complete (100%)
**Remaining:** 0 hours

---

## Task Breakdown

### Phase 1: Foundation (Core Deliverables)

#### Task 1: Create Documentation Standard File

**File:** `./docs/plugin-docs-standard.md`

**Description:** Create comprehensive documentation standard specification with all requirements, examples, and quality checklist.

**Deliverables:**
- Complete specification of 12 required sections
- Examples from puppeteer.md as reference
- Quality checklist for reviews
- Guidance on complex vs simple plugins
- Navigation requirements
- File organization rules

**Validation:**
- File exists at `./docs/plugin-docs-standard.md`
- All 12 sections documented with requirements
- Examples included for each section
- Quality checklist includes minimum 15 items
- References puppeteer.md as gold standard

**Dependencies:** None

**Estimated Effort:** 4-6 hours

---

#### Task 2: Create Full Documentation Template

**File:** `./docs/templates/plugin-doc-template.md`

**Description:** Create complete documentation template with all 12 sections, placeholders, and inline guidance.

**Deliverables:**
- All 12 required sections with proper structure
- Placeholder markers using `{VARIABLE}` format
- Inline comments explaining what to include
- Example code snippets showing structure
- Usage guide header comment
- Quality checklist at end

**Validation:**
- File exists at `./docs/templates/plugin-doc-template.md`
- Contains all 12 sections
- Placeholders use consistent `{VARIABLE}` format
- `grep "{" plugin-doc-template.md` finds all placeholders
- Header includes usage instructions
- Can be copied and filled without additional guidance

**Dependencies:** Task 1 (standard must exist first)

**Estimated Effort:** 3-4 hours

---

#### Task 3: Create Minimal Documentation Template

**File:** `./docs/templates/plugin-doc-minimal.md`

**Description:** Create minimal viable documentation template for simple plugins.

**Deliverables:**
- All 12 sections (condensed versions)
- Minimum 10 FAQ entries (vs 20+ in full)
- Simpler configuration reference format
- 3-level usage journey (vs 5-7)
- Usage guide header

**Validation:**
- File exists at `./docs/templates/plugin-doc-minimal.md`
- Contains all 12 sections
- Total length 40-60% of full template
- Still passes quality checklist
- Can produce 🟡 Partial or 🟢 Complete docs

**Dependencies:** Task 1, Task 2

**Estimated Effort:** 2-3 hours

---

#### Task 4: Update Plugin Index

**File:** `./docs/plugins/README.md`

**Description:** Update plugin index with categorization, quality badges, and links to standard/templates.

**Deliverables:**
- Categorized plugin list (7 categories)
- Quality badge for each plugin (🟢🟡🔴)
- Links to documentation standard
- Links to templates
- Badge criteria explanation
- Navigation to all plugin docs

**Validation:**
- File updated at `./docs/plugins/README.md`
- All 23+ plugins listed with badges
- 7 categories present with descriptions
- Links to standard and templates work
- Badge criteria documented
- Can use `grep "🟢\|🟡\|🔴"` to find all badges

**Dependencies:** Task 1, Task 2, Task 3

**Estimated Effort:** 2-3 hours

---

#### Task 5: Update CLAUDE.md Reference

**File:** `CLAUDE.md`

**Description:** Update CLAUDE.md to reference the new documentation standard file instead of inline specification.

**Deliverables:**
- Update "Plugin Documentation Standard" section
- Add reference to `./docs/plugin-docs-standard.md`
- Keep brief summary of requirements
- Link to templates
- Maintain gold standard reference (puppeteer.md)

**Validation:**
- CLAUDE.md updated
- Links to `./docs/plugin-docs-standard.md` added
- Section condensed but still informative
- AI assistants directed to standard file for details
- puppeteer.md still referenced as gold standard

**Dependencies:** Task 1

**Estimated Effort:** 1 hour

---

### Phase 2: Validation & Documentation

#### Task 6: Create Template Usage Examples

**Files:** `./docs/templates/EXAMPLES.md`

**Description:** Create example showing how to use templates with before/after comparisons.

**Deliverables:**
- Step-by-step template usage guide
- Example: Converting minimal template to working doc
- Common mistakes to avoid
- Tips for efficiency

**Validation:**
- File exists at `./docs/templates/EXAMPLES.md`
- Includes complete example
- Shows template → filled doc transformation
- Can be followed without prior knowledge

**Dependencies:** Task 2, Task 3

**Estimated Effort:** 2 hours

---

#### Task 7: Audit Existing Plugin Documentation

**Deliverable:** Assessment document

**Description:** Audit all 69 existing plugin documentation files and assign quality badges.

**Deliverables:**
- Spreadsheet/table of all plugins
- Quality assessment for each (🟢🟡🔴)
- Missing sections identified
- Priority list for updates
- Estimate of effort for each upgrade

**Validation:**
- All 69 docs assessed
- Quality badges assigned based on criteria
- Priority list created
- Results match badges in plugin index

**Dependencies:** Task 4

**Estimated Effort:** 4-6 hours

---

### Phase 3: Tooling & Automation (Optional Future Work)

#### Task 8: Create Documentation Linter

**File:** `scripts/lint-plugin-docs.js`

**Description:** Create script to validate plugin documentation against standard.

**Deliverables:**
- Script that checks all 12 sections present
- Validates anchor links work
- Checks for minimum FAQ entries
- Verifies navigation elements
- Reports missing/incomplete sections

**Validation:**
- Script exists and runs
- Reports correct issues when tested
- Can be run in CI/CD
- Exit code indicates pass/fail

**Dependencies:** Task 1

**Estimated Effort:** 6-8 hours

---

#### Task 9: Create Quality Badge Generator

**File:** `scripts/generate-quality-badges.js`

**Description:** Automate quality badge assignment based on documentation analysis.

**Deliverables:**
- Script that analyzes plugin docs
- Assigns quality badges automatically
- Updates plugin index README
- Generates report of improvements

**Validation:**
- Script exists and runs
- Badges match manual assessment
- Updates plugin index correctly
- Report is actionable

**Dependencies:** Task 4, Task 7

**Estimated Effort:** 4-6 hours

---

## Task Dependencies Graph

```
Task 1 (Standard)
  ↓
  ├─→ Task 2 (Full Template)
  │     ↓
  │     └─→ Task 3 (Minimal Template)
  │           ↓
  │           └─→ Task 4 (Plugin Index)
  │                 ↓
  │                 └─→ Task 7 (Audit)
  │
  ├─→ Task 5 (CLAUDE.md)
  │
  └─→ Task 8 (Linter) → Task 9 (Badge Generator)

Task 2 + Task 3 → Task 6 (Examples)
```

## Parallel Execution Opportunities

**Can be done in parallel after Task 1:**
- Task 2 (Full Template)
- Task 5 (CLAUDE.md update)
- Task 8 (Linter - optional)

**Can be done in parallel after Task 2:**
- Task 3 (Minimal Template)
- Task 6 (Examples)

## Success Criteria

**Phase 1 Complete when:**
- ✅ Standard file exists and is comprehensive
- ✅ Both templates exist and are usable
- ✅ Plugin index updated with badges
- ✅ CLAUDE.md references new standard
- ✅ All files pass markdown linting
- ✅ Links between files work correctly

**Final Success when:**
- ✅ New plugins can achieve 🟢 rating using templates
- ✅ Contributors know what documentation is expected
- ✅ Plugin index provides clear navigation
- ✅ Existing docs have clear upgrade path
- ✅ Quality is measurable and improvable

## Non-Blocking Items

These can be done after Phase 1 ships:

- Updating existing plugin docs (incremental)
- Creating subdirectories for complex plugins
- Writing feature-specific deep-dive docs
- Automation tooling (linter, badge generator)
- Documentation style guide for writing quality

## Rollout Strategy

1. **Week 1:** Tasks 1-3 (Foundation)
2. **Week 1:** Tasks 4-5 (Integration)
3. **Week 2:** Task 6 (Examples)
4. **Week 2:** Task 7 (Audit)
5. **Future:** Tasks 8-9 (Automation)

## Testing & Validation

Each task includes validation criteria. Additionally:

**Integration Testing:**
- Use templates to create test documentation for fictional plugin
- Verify it passes quality checklist
- Confirm navigation works end-to-end
- Test on both simple and complex plugin scenarios

**User Testing:**
- Have contributor create plugin doc using template
- Gather feedback on clarity and completeness
- Iterate on templates based on feedback

## Maintenance

**Ongoing:**
- Update templates when standard changes
- Review new plugin docs for compliance
- Incrementally upgrade existing docs
- Monitor community questions and update FAQ sections

**Quarterly:**
- Review documentation quality badges
- Update priority list for doc improvements
- Assess if standard needs evolution

---

## Phase 4: Plugin Documentation Implementation (116.5 hours)

**Note:** For detailed breakdown of each task, see `implementation-plan.md`. This section provides task summaries for OpenSpec tracking.

### Tier 1: Quick Wins (3.5 hours)

#### Task 10: Complete puppeteer.md
**File:** `docs/plugins/puppeteer.md`
**Effort:** 30 minutes
**Status:** Pending
**Actions:** Add Dependencies section
**Dependencies:** Tasks 1-7

#### Task 11: Complete recon.md
**File:** `docs/plugins/recon.md`
**Effort:** 30 minutes
**Status:** Pending
**Actions:** Add Dependencies section
**Dependencies:** Tasks 1-7

#### Task 12: Complete kubernetes-inventory.md
**File:** `docs/plugins/kubernetes-inventory.md`
**Effort:** 30 minutes
**Status:** Pending
**Actions:** Add Dependencies section
**Dependencies:** Tasks 1-7

#### Task 13: Complete cache.md
**File:** `docs/plugins/cache.md`
**Effort:** 30 minutes
**Status:** Pending
**Actions:** Add Dependencies section
**Dependencies:** Tasks 1-7

#### Task 14: Complete audit.md
**File:** `docs/plugins/audit.md`
**Effort:** 1.5 hours
**Status:** Pending
**Actions:** Add Dependencies and Error Handling sections
**Dependencies:** Tasks 1-7

---

### Tier 2: High-Impact Plugins (25 hours)

#### Task 15: Update api.md
**File:** `docs/plugins/api.md`
**Effort:** 5 hours
**Status:** Pending
**Actions:** Add structure (nav, TLDR, TOC, quickstart), configuration, dependencies, FAQ, error handling
**Dependencies:** Tasks 1-7

#### Task 16: Update identity.md
**File:** `docs/plugins/identity.md`
**Effort:** 5 hours
**Status:** Pending
**Actions:** Add structure, OAuth/OIDC docs, configuration, dependencies, FAQ, error handling
**Dependencies:** Tasks 1-7

#### Task 17: Update replicator.md
**File:** `docs/plugins/replicator.md`
**Effort:** 5 hours
**Status:** Pending
**Actions:** Add structure, multi-target docs, configuration, dependencies, FAQ expansion, error handling
**Dependencies:** Tasks 1-7

#### Task 18: Rewrite memory-client.md
**File:** `docs/plugins/memory-client.md`
**Effort:** 5 hours
**Status:** Pending
**Actions:** Complete rewrite using template (currently 0/13 sections)
**Dependencies:** Tasks 1-7

#### Task 19: Update state-machine.md
**File:** `docs/plugins/state-machine.md`
**Effort:** 5 hours
**Status:** Pending
**Actions:** Add structure, workflow docs, configuration, dependencies, FAQ expansion, error handling
**Dependencies:** Tasks 1-7

---

### Tier 3: Medium Refactoring (16 hours)

#### Task 20: Update ml-plugin.md
**File:** `docs/plugins/ml-plugin.md`
**Effort:** 4 hours
**Status:** Pending
**Actions:** Reorganize existing content (2,869 lines), add structure, dependencies
**Dependencies:** Tasks 1-7

#### Task 21: Update vector.md
**File:** `docs/plugins/vector.md`
**Effort:** 4 hours
**Status:** Pending
**Actions:** Add structure, expand FAQ from 13 to 20+, dependencies, error handling
**Dependencies:** Tasks 1-7

#### Task 22: Update s3-queue.md
**File:** `docs/plugins/s3-queue.md`
**Effort:** 4 hours
**Status:** Pending
**Actions:** Reorganize content, add structure, expand FAQ, error handling
**Dependencies:** Tasks 1-7

#### Task 23: Update backup.md
**File:** `docs/plugins/backup.md`
**Effort:** 4 hours
**Status:** Pending
**Actions:** Add structure, reorganize configuration, expand FAQ, error handling
**Dependencies:** Tasks 1-7

---

### Tier 4: Major Rewrites (32 hours)

#### Task 24: Rewrite cloud-inventory.md
**File:** `docs/plugins/cloud-inventory.md`
**Effort:** 8 hours
**Status:** Pending
**Actions:** Complete rewrite, add FAQ (currently 0), document all cloud providers
**Dependencies:** Tasks 1-7

#### Task 25: Rewrite cookie-farm.md
**File:** `docs/plugins/cookie-farm.md`
**Effort:** 8 hours
**Status:** ✅ Complete
**Actions:** Complete rewrite from 168 to 3,268 lines (+3,100 lines, +1845%), added all 12 sections, FAQ 0→25 questions
**Dependencies:** Tasks 1-7

#### Task 26: Rewrite spider.md
**File:** `docs/plugins/spider.md`
**Effort:** 8 hours
**Status:** Pending
**Actions:** Complete rewrite (only 204 lines currently), document crawling patterns
**Dependencies:** Tasks 1-7

#### Task 27: Update minimal docs group
**Files:** `costs.md`, `eventual-consistency.md`, `fulltext.md`, `geo.md`
**Effort:** 8 hours (2h each)
**Status:** ✅ Complete
**Actions:** Added Dependencies section to all 4 files, expanded fulltext.md FAQ from 18 to 60+ questions
**Dependencies:** Tasks 1-7

---

### Tier 5: Remaining Plugins (40 hours)

#### Task 28: Update importer.md
**File:** `docs/plugins/importer.md`
**Effort:** 3 hours
**Status:** ✅ Complete
**Actions:** Added Dependencies section (format support matrix), expanded FAQ from 10 to 50+ questions (6 categories: General, Configuration, Operations, Performance, Validation & Errors, Progress Tracking, Troubleshooting, Advanced)
**Dependencies:** Tasks 1-7

#### Task 29: Update metrics.md
**File:** `docs/plugins/metrics.md`
**Effort:** 3 hours
**Status:** Pending
**Actions:** Add structure, reorganize, expand FAQ
**Dependencies:** Tasks 1-7

#### Task 30: Update queue-consumer.md
**File:** `docs/plugins/queue-consumer.md`
**Effort:** 3 hours
**Status:** Pending
**Actions:** Add structure, reorganize, expand FAQ
**Dependencies:** Tasks 1-7

#### Task 31: Update relation.md
**File:** `docs/plugins/relation.md`
**Effort:** 4 hours
**Status:** ✅ Complete
**Actions:** Added Dependencies section (zero external deps), expanded FAQ from 3 to 60+ questions in 10 categories (General, Configuration, Performance & Partitions, Loading Strategies, N+1 Problem, Cascade Operations, API Integration, Troubleshooting, Advanced, For AI Agents), grew from 1013 to 1515 lines (+502 lines, +50%)
**Dependencies:** Tasks 1-7

#### Task 32: Update scheduler.md
**File:** `docs/plugins/scheduler.md`
**Effort:** 3 hours
**Status:** ✅ Complete
**Actions:** Added Dependencies section (zero external deps, all built-in), updated Table of Contents, expanded FAQ from 18 to 70+ questions in 10 categories (General, Configuration, Cron Expressions, Operations, Monitoring & History, Distributed Locking & Multi-Instance, Retry & Error Handling, Performance & Optimization, Troubleshooting, Advanced Usage, For AI Agents), grew from 1766 to 2446 lines (+680 lines, +38%)
**Dependencies:** Tasks 1-7

#### Task 33: Update tfstate.md
**File:** `docs/plugins/tfstate.md`
**Effort:** 3 hours
**Status:** Pending
**Actions:** Add structure, reorganize, expand FAQ
**Dependencies:** Tasks 1-7

#### Task 34: Update ttl.md
**File:** `docs/plugins/ttl.md`
**Effort:** 4 hours
**Status:** Pending
**Actions:** Add structure, create FAQ (currently 0), reorganize
**Dependencies:** Tasks 1-7

#### Task 35: Update api subdirectory docs
**Files:** `docs/plugins/api/*.md` (13 files)
**Effort:** 10 hours
**Status:** Pending
**Actions:** Standardize all api/ subdirectory documentation
**Dependencies:** Tasks 1-7, Task 15

#### Task 36: Update identity subdirectory docs
**Files:** `docs/plugins/identity/*.md` (6 files)
**Effort:** 4 hours
**Status:** Pending
**Actions:** Standardize all identity/ subdirectory documentation
**Dependencies:** Tasks 1-7, Task 16

#### Task 37: Update recon subdirectory docs
**Files:** `docs/plugins/recon/*.md` (6 files)
**Effort:** 3 hours
**Status:** Pending
**Actions:** Standardize all recon/ subdirectory documentation
**Dependencies:** Tasks 1-7, Task 11

---

## Complete Task Summary

| Phase | Tasks | Total Hours |
|-------|-------|-------------|
| Phase 1: Foundation | Tasks 1-5 | ~12h |
| Phase 2: Validation | Tasks 6-7 | ~6h |
| Phase 3: Automation | Tasks 8-9 | ~12h (optional) |
| **Phase 4: Implementation** | **Tasks 10-37** | **116.5h** |
| **TOTAL** | **37 tasks** | **146.5h** |

---

## Task Status Tracking

**Completed:** Tasks 1-7 (Phase 1 & 2)
**Pending:** Tasks 8-37 (Phase 3 & 4)

**Progress:** 7/37 tasks complete (19%)

---

## Implementation Priority

### Week 1: Quick Wins
- Tasks 10-14 (Tier 1)
- **Deliverable:** 5 plugins at 🟢

### Weeks 2-3: High-Impact
- Tasks 15-19 (Tier 2)
- **Deliverable:** 10 plugins at 🟡+

### Weeks 4-5: Medium Refactoring
- Tasks 20-23 (Tier 3)
- **Deliverable:** 14 plugins at 🟡+

### Weeks 6-7: Major Rewrites
- Tasks 24-27 (Tier 4)
- **Deliverable:** 18 plugins at 🟡+

### Weeks 8-10: Completion
- Tasks 28-37 (Tier 5)
- **Deliverable:** 28 plugins at 🟡+

---

**For detailed task breakdown, see:** `implementation-plan.md`
