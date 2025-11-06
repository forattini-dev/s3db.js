# Documentation Templates

**Capability:** templates
**Change:** standardize-plugin-docs
**Type:** ADDED

## ADDED Requirements

### Requirement: Template Directory

Documentation templates MUST exist at `./docs/templates/` to provide starting points for new plugin documentation.

#### Scenario: Template Directory Structure

```markdown
Given the templates directory exists
When a developer looks for documentation templates
Then the following files MUST be present:
  - ./docs/templates/plugin-doc-template.md (full template)
  - ./docs/templates/plugin-doc-minimal.md (minimal template)
And both templates MUST be up-to-date with the documentation standard
```

### Requirement: Full Template

A complete documentation template MUST exist at `./docs/templates/plugin-doc-template.md` with all 12 sections and inline guidance.

#### Scenario: Full Template Contents

```markdown
Given the file ./docs/templates/plugin-doc-template.md
When a developer uses it to create plugin documentation
Then it MUST contain:
  - All 12 required sections with proper formatting
  - Placeholder content showing expected format
  - Inline comments explaining what to include
  - Example code snippets demonstrating structure
  - Links to gold standard (puppeteer.md)
  - Checklist at the end for quality verification
And it MUST be copy-paste ready with clear {PLACEHOLDER} markers
```

#### Scenario: Template Placeholders

```markdown
Given the full template file
When a developer fills in placeholders
Then placeholders MUST use format: {PLUGIN_NAME}, {DESCRIPTION}, {EMOJI}
And each placeholder MUST have inline comment explaining:
  - What value to use
  - Examples of good values
  - Where to find the value (if from code)
And all placeholders MUST be searchable (grep "{" finds all)
```

#### Scenario: Template Code Examples

```markdown
Given the full template file
When it shows code example placeholders
Then it MUST:
  - Show complete import statements
  - Include plugin initialization with common options
  - Demonstrate typical usage patterns
  - Be syntactically valid JavaScript
  - Use realistic variable names
And developer MUST only need to replace {PLUGIN_NAME} to make it work
```

### Requirement: Minimal Template

A minimal viable documentation template MUST exist at `./docs/templates/plugin-doc-minimal.md` for simple plugins.

#### Scenario: Minimal Template Contents

```markdown
Given the file ./docs/templates/plugin-doc-minimal.md
When a developer creates documentation for a simple plugin
Then it MUST contain:
  - All 12 required sections (condensed)
  - Minimal examples (1-2 per section)
  - Shorter FAQ (10-15 questions minimum)
  - Simplified configuration reference
  - Basic usage journey (3 levels minimum)
And it MUST still pass documentation quality checklist
```

#### Scenario: Minimal vs Full Template Decision

```markdown
Given a developer choosing between templates
When the plugin has:
  - Less than 5 major features
  - Less than 20 configuration options
  - Less than 10 public methods
  - No complex integration patterns
Then minimal template SHOULD be used
Otherwise full template SHOULD be used
```

### Requirement: Template Usage Guide

Each template MUST include a header comment explaining how to use it.

#### Scenario: Template Header

```markdown
Given either template file
When a developer opens it
Then the first section MUST contain:
  - Instructions on how to use the template
  - Link to documentation standard (./docs/plugin-docs-standard.md)
  - Link to gold standard example (puppeteer.md)
  - Explanation of placeholder format
  - Steps to validate completed documentation
And header MUST be a markdown comment: <!-- Usage Guide -->
```

### Requirement: Template Maintenance

Templates MUST be kept synchronized with the documentation standard.

#### Scenario: Standard Change Propagation

```markdown
Given the documentation standard is updated
When a new requirement is added or changed
Then both templates MUST be updated within same change to:
  - Include new requirements
  - Update examples to match changes
  - Reflect new section structure (if applicable)
  - Update quality checklist
And updates MUST be validated against puppeteer.md
```

## Cross-References

- **Supports:** documentation-standard (templates implement standard)
- **Related to:** ./docs/plugin-docs-standard.md (standard defines template requirements)
- **Related to:** ./docs/plugins/puppeteer.md (templates based on gold standard)
