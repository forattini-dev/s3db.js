# Documentation Standard

**Capability:** documentation-standard
**Change:** standardize-plugin-docs
**Type:** ADDED

## ADDED Requirements

### Requirement: Standard Documentation File

All plugins MUST have a documentation file at `./docs/plugins/{plugin-name}.md` or `./docs/plugins/{plugin-name}/README.md` (for complex plugins) that follows the standardized structure.

#### Scenario: New Plugin Documentation

```markdown
Given a new plugin is being created
When the developer creates documentation
Then the documentation MUST include all 12 required sections in order:
  1. Header Block (with emoji, description, navigation)
  2. TLDR Section
  3. Table of Contents
  4. Quickstart
  5. Dependencies
  6. Usage Journey or Usage Patterns
  7. Configuration Reference
  8. Configuration Examples
  9. API Reference
  10. Best Practices
  11. Error Handling
  12. FAQ
And each section MUST follow the format specified in the standard
And the file MUST exist at ./docs/plugin-docs-standard.md for reference
```

#### Scenario: Documentation Quality Review

```markdown
Given an existing plugin documentation file
When reviewing documentation quality
Then it MUST pass the quality checklist:
  - All 12 required sections present
  - Navigation links functional (Plugin Index, Configuration, FAQ)
  - Code examples are complete and runnable
  - All configuration options documented
  - All public methods in API reference
  - At least 10 FAQ entries
  - Progressive learning path (5-7 levels or 3-5 patterns)
  - Cross-links to related docs
  - Consistent emoji usage
  - Proper markdown formatting
```

### Requirement: 12 Required Sections

Each plugin documentation MUST contain exactly 12 sections in the following order with specific formatting requirements.

#### Scenario: Header Block Format

```markdown
Given a plugin documentation file
When it includes the Header Block
Then it MUST have:
  - An emoji in the title representing the plugin category
  - A one-line description (max 100 characters)
  - Navigation links to Plugin Index, Configuration, and FAQ
  - A horizontal rule separator
And the format MUST be:
  # 🎭 Plugin Name

  > **One-line description of plugin purpose and key features.**
  >
  > **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration) | [FAQ ↓](#-faq)

  ---
```

#### Scenario: TLDR Section Format

```markdown
Given a plugin documentation file
When it includes the TLDR section
Then it MUST have:
  - One-sentence summary of plugin functionality
  - "1 line to get started" code example (minimal config)
  - "Production-ready setup" code example (with inline comments)
  - 4-7 key features with checkmarks
  - Optional performance comparison showing value proposition
And examples MUST be complete and copy-paste-ready
```

#### Scenario: Table of Contents

```markdown
Given a plugin documentation file
When it includes the Table of Contents
Then it MUST:
  - List all 12 sections with anchor links
  - Include subsections for Usage Journey/Patterns (levels 1-7 or patterns 1-5)
  - Use emoji prefixes matching section headers
  - Be placed after TLDR and before Quickstart
```

#### Scenario: Quickstart Section

```markdown
Given a plugin documentation file
When it includes the Quickstart section
Then it MUST:
  - Be complete and copy-paste-ready (10-20 lines)
  - Import Database and plugin
  - Show database connection
  - Demonstrate plugin initialization with essential options only
  - Show basic usage example
  - Include cleanup (disconnect)
And it MUST work without modification when user copies it
```

#### Scenario: Dependencies Section

```markdown
Given a plugin documentation file
When it includes the Dependencies section
Then it MUST:
  - List all peer dependencies required
  - Show installation command (pnpm install)
  - Indicate which dependencies are optional
  - Explain why each dependency is needed
  - Link to dependency documentation where relevant
And distinguish between required and optional dependencies
```

#### Scenario: Usage Journey or Usage Patterns

```markdown
Given a plugin documentation file
When it includes usage examples
Then it MUST use one of two formats:
  - Usage Journey: 5-7 progressive levels (Basic → Advanced → Production)
  - Usage Patterns: 3-5 common use cases
And each level/pattern MUST:
  - Be self-contained with complete code
  - Build complexity gradually
  - Include "What's happening" or "New concepts" explanations
  - Show real-world scenarios
And examples MUST be runnable without modifications
```

#### Scenario: Configuration Reference

```markdown
Given a plugin documentation file
When it includes the Configuration Reference
Then it MUST:
  - Show complete configuration object (not partial)
  - Organize by logical sections with visual separators
  - Include inline comments for every option
  - Show default values clearly
  - Use table format for complex/nested options
And configuration MUST match the actual plugin implementation
```

#### Scenario: Configuration Examples

```markdown
Given a plugin documentation file
When it includes Configuration Examples
Then it MUST:
  - Provide 5-10 real-world scenarios
  - Give each scenario a descriptive name
  - Focus configuration on specific use case
  - Include brief explanation of when to use
And examples MUST represent actual common use cases
```

#### Scenario: API Reference

```markdown
Given a plugin documentation file
When it includes the API Reference
Then it MUST:
  - Document every public method
  - Specify parameter types and requirements
  - Specify return types
  - Provide example for each method
  - List error conditions and thrown errors
  - Document all events with payload structure
And it MUST be complete (no public APIs undocumented)
```

#### Scenario: Best Practices

```markdown
Given a plugin documentation file
When it includes Best Practices
Then it MUST have:
  - "Do's" section with 5-10 practices and code examples
  - "Don'ts" section with 5-10 anti-patterns showing both bad and correct approaches
  - Performance tips section
  - Security considerations section
And examples MUST be working code demonstrating each practice
```

#### Scenario: Error Handling

```markdown
Given a plugin documentation file
When it includes Error Handling
Then it MUST:
  - Document 5-10 common errors with error codes
  - Provide solutions with code for each error
  - Include troubleshooting decision tree
  - Show real-world debugging scenarios
And solutions MUST be actionable and testable
```

#### Scenario: FAQ Section

```markdown
Given a plugin documentation file
When it includes the FAQ section
Then it MUST:
  - Have minimum 10-20 questions
  - Organize by categories (General, Advanced, Performance, Troubleshooting)
  - Include code examples where helpful
  - Answer real questions from users or anticipated needs
And questions MUST cover common pain points and edge cases
```

### Requirement: Gold Standard Reference

The PuppeteerPlugin documentation (`./docs/plugins/puppeteer.md`) MUST be maintained as the exemplar implementation of the documentation standard.

#### Scenario: Standard Compliance Check

```markdown
Given the documentation standard specification
When comparing any plugin documentation to puppeteer.md
Then puppeteer.md MUST:
  - Implement all 12 required sections correctly
  - Demonstrate best practices for each section
  - Serve as the reference implementation
  - Be kept up-to-date with standard changes
And new requirements MUST be validated against puppeteer.md first
```

### Requirement: Standard Documentation File Location

A comprehensive standard specification MUST exist at `./docs/plugin-docs-standard.md` that documents all requirements, examples, and quality criteria.

#### Scenario: Standard File Contents

```markdown
Given the file ./docs/plugin-docs-standard.md exists
When a developer reads it
Then it MUST contain:
  - Complete specification of all 12 required sections
  - Examples from puppeteer.md as gold standard
  - Quality checklist for documentation reviews
  - Guidance on when to use subdirectories (complex plugins)
  - Template references
  - Navigation system requirements
And it MUST be the single source of truth for documentation standards
```

## Cross-References

- **Depends on:** templates (documentation templates must exist)
- **Depends on:** navigation (standard requires navigation system)
- **Depends on:** organization (standard defines organization rules)
- **Related to:** ./docs/plugins/puppeteer.md (gold standard)
- **Related to:** CLAUDE.md (AI assistant guidance references standard)
