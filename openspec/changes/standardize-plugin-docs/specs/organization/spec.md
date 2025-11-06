# Documentation Organization

**Capability:** organization
**Change:** standardize-plugin-docs
**Type:** ADDED

## ADDED Requirements

### Requirement: Simple Plugin Organization

Simple plugins MUST use single-file documentation structure.

#### Scenario: Single File Documentation

```markdown
Given a plugin with less than 5 major features
When creating documentation
Then it MUST use single-file structure:
  ./docs/plugins/{plugin-name}.md

And the file MUST contain all 12 required sections
And total documentation SHOULD be under 2000 lines
```

#### Scenario: Simple Plugin Criteria

```markdown
Given a plugin being documented
When determining if it's a "simple plugin"
Then it qualifies as simple if ALL of:
  - Less than 5 major features
  - Less than 20 configuration options
  - Less than 10 public methods
  - No complex integration patterns
  - Less than 50 FAQ entries
  - Less than 2000 lines of documentation

Otherwise it SHOULD use complex plugin structure
```

### Requirement: Complex Plugin Organization

Complex plugins MUST use subdirectory structure with main overview and feature-specific documentation.

#### Scenario: Complex Plugin Directory Structure

```markdown
Given a complex plugin (5+ major features)
When creating documentation
Then it MUST use subdirectory structure:
  ./docs/plugins/
  ├── plugin-name.md          # Main overview + quickstart
  └── plugin-name/            # Feature deep-dives
      ├── README.md           # Feature index
      ├── feature-1.md
      ├── feature-2.md
      └── architecture.md     # Optional: Design docs

And main plugin-name.md MUST:
  - Contain all 12 required sections
  - Provide overview of all features
  - Link to feature-specific docs in See Also
  - Serve as entry point for the plugin

And subdirectory docs MUST:
  - Focus on single feature/topic
  - Include breadcrumb navigation
  - Link back to main doc
  - Follow same quality standards
```

#### Scenario: Complex Plugin Criteria

```markdown
Given a plugin being documented
When determining if it's a "complex plugin"
Then it qualifies as complex if ANY of:
  - 5+ major features requiring separate explanation
  - Multiple integration patterns
  - Architecture/design documentation needed
  - 50+ FAQ entries
  - 2000+ lines of documentation in single file
  - Multiple subsystems or components

And these plugins SHOULD use subdirectory structure
```

### Requirement: Complex Plugin Feature Documentation

Each feature in a complex plugin MUST have its own documentation file following a consistent structure.

#### Scenario: Feature Documentation Structure

```markdown
Given a complex plugin with subdirectory
When creating feature-specific documentation
Then each feature doc MUST include:
  - Breadcrumb navigation
  - Feature overview (1-2 paragraphs)
  - Quick example
  - Configuration options for this feature
  - API methods for this feature
  - Feature-specific best practices
  - Feature-specific troubleshooting
  - Links back to main plugin doc

And it MAY optionally include:
  - Architecture diagrams
  - Integration guides
  - Performance benchmarks
  - Migration guides
```

#### Scenario: Feature Index

```markdown
Given a complex plugin subdirectory
When it contains a README.md
Then it MUST:
  - List all feature documentation files
  - Provide brief description of each feature
  - Link to main plugin documentation
  - Explain the relationship between features
  - Show recommended reading order (if applicable)

And format MUST be:
  # {PluginName} Features

  > **Main Documentation:** [← {PluginName}](../{plugin-name}.md)

  ## Features

  1. [Feature 1](./feature-1.md) - Description
  2. [Feature 2](./feature-2.md) - Description

  ## Reading Order

  For beginners, we recommend:
  1. Start with [Feature 1](./feature-1.md)
  2. Then read [Feature 2](./feature-2.md)
```

### Requirement: Current Complex Plugins

The following plugins MUST be organized as complex plugins with subdirectories.

#### Scenario: ApiPlugin Organization

```markdown
Given the ApiPlugin documentation
When organizing its structure
Then it MUST have:
  - Main: ./docs/plugins/api.md
  - Subdirectory: ./docs/plugins/api/
    - README.md (feature index)
    - authentication.md
    - authorization.md
    - guards.md
    - integrations.md
    - architecture.md (design decisions)

And it currently HAS subdirectory with these files (good!)
```

#### Scenario: PuppeteerPlugin Organization

```markdown
Given the PuppeteerPlugin documentation
When organizing its structure
Then it MUST have:
  - Main: ./docs/plugins/puppeteer.md (already exemplary!)
  - Subdirectory: ./docs/plugins/puppeteer/
    - README.md (feature index)
    - browser-pooling.md
    - cookie-farming.md
    - proxy-rotation.md
    - stealth-mode.md
    - performance.md

And it currently HAS ./docs/plugins/puppeteer/ subdirectory
And main doc (puppeteer.md) is 1,850+ lines (qualifies as complex)
```

#### Scenario: ReconPlugin Organization

```markdown
Given the ReconPlugin documentation
When organizing its structure
Then it MUST have:
  - Main: ./docs/plugins/recon.md
  - Subdirectory: ./docs/plugins/recon/
    - README.md (feature index)
    - scanning.md
    - discovery.md
    - monitoring.md
    - reporting.md

And it currently HAS subdirectory (needs organization)
```

#### Scenario: CloudInventoryPlugin Organization

```markdown
Given the CloudInventoryPlugin documentation
When organizing its structure
Then it MUST have:
  - Main: ./docs/plugins/cloud-inventory.md
  - Subdirectory: ./docs/plugins/cloud-inventory/
    - README.md (provider index)
    - aws.md (AWS provider documentation)
    - gcp.md (GCP provider documentation)
    - azure.md (Azure provider documentation)
    - providers.md (provider architecture)

And this SHOULD be created as it supports 9 cloud providers
```

### Requirement: File Naming Conventions

All documentation files MUST follow consistent naming conventions.

#### Scenario: Plugin Documentation Naming

```markdown
Given any plugin documentation file
When naming the file
Then it MUST follow:
  - Plugin overview: {plugin-name}.md (kebab-case)
  - Feature docs: {feature-name}.md (kebab-case)
  - Feature index: README.md
  - Special docs: UPPERCASE.md (e.g., ARCHITECTURE.md, PERFORMANCE.md)

And examples:
  - ✅ cache.md
  - ✅ api.md
  - ✅ cookie-farm-plugin.md
  - ✅ authentication.md
  - ✅ README.md
  - ✅ PERFORMANCE.md
  - ❌ CachePlugin.md (wrong case)
  - ❌ api_plugin.md (wrong separator)
```

### Requirement: Documentation Quality Badges

The plugin index MUST use badges to indicate documentation quality status.

#### Scenario: Quality Badge System

```markdown
Given the plugin index (./docs/plugins/README.md)
When listing plugins
Then each plugin MUST have a quality badge:
  - 🟢 Complete: All 12 sections, 10+ FAQ, examples, cross-links
  - 🟡 Partial: Missing some sections or minimal content
  - 🔴 Minimal: Stub documentation or placeholder

And badge criteria MUST be documented
And badge MUST be updated when documentation improves
```

#### Scenario: Quality Badge Criteria

```markdown
Given a plugin documentation file
When assigning a quality badge
Then it MUST be:

🟢 Complete if ALL of:
  - All 12 required sections present
  - 10+ FAQ entries
  - Runnable code examples
  - Complete configuration reference
  - All public methods documented
  - Cross-links to related docs
  - Passes quality checklist

🟡 Partial if SOME of:
  - Most sections present (8-11)
  - 5-9 FAQ entries
  - Some code examples
  - Partial configuration reference
  - Most methods documented

🔴 Minimal if:
  - Less than 8 sections
  - Less than 5 FAQ entries
  - Stub or placeholder content
  - Missing critical sections
```

## Cross-References

- **Supports:** documentation-standard (organization implements standard structure)
- **Supports:** navigation (organization determines navigation structure)
- **Related to:** ./docs/plugins/api/ (complex plugin example)
- **Related to:** ./docs/plugins/puppeteer/ (complex plugin example)
- **Related to:** ./docs/plugins/recon/ (complex plugin example)
