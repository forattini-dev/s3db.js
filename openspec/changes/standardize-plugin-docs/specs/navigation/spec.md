# Documentation Navigation

**Capability:** navigation
**Change:** standardize-plugin-docs
**Type:** ADDED

## ADDED Requirements

### Requirement: Header Navigation

Every plugin documentation file MUST include header navigation links to key destinations.

#### Scenario: Header Navigation Links

```markdown
Given a plugin documentation file
When it includes the header block
Then it MUST have navigation line:
  **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration) | [FAQ ↓](#-faq)
And it MUST be placed:
  - After the one-line description
  - Before the horizontal rule separator
  - Inside the blockquote (> prefix)
And links MUST be:
  - Plugin Index: Relative link to ./README.md
  - Configuration: Anchor link to configuration section
  - FAQ: Anchor link to FAQ section
```

#### Scenario: Complex Plugin Navigation

```markdown
Given a complex plugin with subdirectory (./docs/plugins/plugin-name/)
When it includes the header block in subdirectory files
Then the Plugin Index link MUST be: [← Plugin Index](../README.md)
And it MAY include additional navigation:
  - [← Main Plugin Doc](../plugin-name.md)
  - [Feature Index ↓](#features)
And subdirectory README.md MUST link back to main plugin doc
```

### Requirement: Table of Contents

Every plugin documentation file MUST include a complete table of contents after the TLDR section.

#### Scenario: Table of Contents Structure

```markdown
Given a plugin documentation file
When it includes the Table of Contents section
Then it MUST:
  - List all 12 required sections
  - Include subsections for Usage Journey/Patterns
  - Use anchor links to each section
  - Use emoji prefixes matching section headers
  - Be placed after TLDR and before Quickstart
And example format MUST be:
  ## 📑 Table of Contents

  1. [⚡ TLDR](#-tldr)
  2. [⚡ Quickstart](#-quickstart)
  3. [Usage Journey](#usage-journey)
     - [Level 1: Basic Usage](#level-1-basic-usage)
     - [Level 2: Intermediate](#level-2-intermediate)
  4. [📊 Configuration Reference](#-configuration-reference)
  ...
```

#### Scenario: Anchor Link Validation

```markdown
Given a table of contents with anchor links
When a user clicks an anchor link
Then it MUST navigate to the correct section
And anchors MUST use GitHub markdown format:
  - Lowercase
  - Spaces become hyphens
  - Remove special chars except hyphens
  - Example: "⚡ TLDR" → #-tldr
```

### Requirement: Cross-References

Every plugin documentation MUST include "See Also" section with links to related documentation.

#### Scenario: See Also Section

```markdown
Given a plugin documentation file
When it includes the See Also section
Then it MUST:
  - Be placed before the FAQ section
  - Link to related plugins with relationship description
  - Link to relevant core concepts documentation
  - Link to working examples (./docs/examples/*)
  - Use relative paths for internal links
And format MUST be:
  ## 🔗 See Also

  - [Related Plugin](./related-plugin.md) - How they work together
  - [Core Concept](../concepts/concept.md) - Background info
  - [Example](../examples/e42-example.js) - Working code
```

#### Scenario: Bidirectional Links

```markdown
Given two related plugins (PluginA and PluginB)
When PluginA references PluginB in See Also
Then PluginB SHOULD reference PluginA in See Also
And the relationship description SHOULD explain:
  - Why they are related
  - How they work together
  - When to use them together
```

### Requirement: Section Transitions

Documentation MUST include clear transitions between sections to guide progressive learning.

#### Scenario: Usage Journey Progression

```markdown
Given a Usage Journey with 7 levels
When transitioning between levels
Then each level MUST:
  - Build on concepts from previous level
  - Introduce 1-3 new concepts
  - Include "What's happening" or "New concepts" explanation
  - Show code that extends previous example
And transitions MUST be clear:
  - "Now let's add [feature]..."
  - "Building on Level X..."
  - "Next we'll explore..."
```

#### Scenario: Section Flow

```markdown
Given the 12 required sections
When a user reads them sequentially
Then the flow MUST be:
  1. TLDR → Quick overview
  2. TOC → Map of content
  3. Quickstart → Get running in 1 minute
  4. Dependencies → What to install
  5. Usage Journey → Progressive learning
  6. Configuration → Detailed options
  7. Config Examples → Real-world scenarios
  8. API Reference → Complete method docs
  9. Best Practices → Do's and Don'ts
  10. Error Handling → Troubleshooting
  11. See Also → Related docs
  12. FAQ → Quick answers
And each section SHOULD reference next section where appropriate
```

### Requirement: Plugin Index Navigation

The plugin index (`./docs/plugins/README.md`) MUST provide navigation to all plugin documentation.

#### Scenario: Plugin Index Structure

```markdown
Given the file ./docs/plugins/README.md
When a user opens it
Then it MUST contain:
  - List of all plugins (categorized)
  - Link to each plugin's documentation
  - Documentation quality badge for each plugin
  - Link to documentation standard
  - Link to templates
And format MUST be:
  # Plugin Documentation

  > **Standard:** See [Plugin Documentation Standard](../plugin-docs-standard.md)
  > **Templates:** [Full Template](../templates/plugin-doc-template.md) | [Minimal Template](../templates/plugin-doc-minimal.md)

  ## Core Plugins

  - [🔍 AuditPlugin](./audit.md) 🟢 - Track all database changes
  - [⚡ CachePlugin](./cache.md) 🟡 - Cache reads for performance

  Legend: 🟢 Complete | 🟡 Partial | 🔴 Minimal
```

#### Scenario: Plugin Categorization

```markdown
Given the plugin index
When plugins are listed
Then they MUST be categorized:
  - Core Plugins (no peer dependencies)
  - API & Identity (hono, jose, bcrypt)
  - Cloud Integration (AWS, GCP, Azure SDKs)
  - Browser Automation (puppeteer, playwright)
  - Data Replication (pg, bigquery, libsql)
  - Machine Learning (tensorflow, transformers)
  - Utilities (backup, importer, etc.)
And each category MUST have a description
```

### Requirement: Breadcrumb Navigation

Complex plugins with subdirectories MUST include breadcrumb navigation.

#### Scenario: Subdirectory Breadcrumbs

```markdown
Given a complex plugin with subdirectory
When a feature doc exists at ./docs/plugins/api/authentication.md
Then it MUST include breadcrumb:
  > **Breadcrumb:** [Plugin Index](../README.md) → [ApiPlugin](../api.md) → Authentication

And breadcrumb MUST be:
  - Placed at the top of the document
  - Use → separators
  - Link each level
  - Show current page as last item (not linked)
```

## Cross-References

- **Supports:** documentation-standard (standard requires navigation)
- **Supports:** organization (navigation connects organized docs)
- **Related to:** ./docs/plugins/README.md (plugin index)
