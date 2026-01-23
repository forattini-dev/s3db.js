# Plugin Documentation Standard

**Gold Standard:** [PuppeteerPlugin](./plugins/puppeteer.md) (1,850+ lines, 80+ FAQ entries)

---

## Overview

This document defines the standardized format for all s3db.js plugin documentation. Following this standard ensures consistency, discoverability, and excellent user experience across the entire plugin ecosystem.

> **Language requirement:** publish every plugin doc in English only. English content keeps cross-team collaboration and external support simple.

**Quick Links:**
- [Templates](./templates/) - Ready-to-use documentation templates
- [Plugin Index](./plugins/README.md) - All plugin documentation
- [Example Implementation](./plugins/puppeteer.md) - Gold standard reference

---

## Why Standardization?

**Problems Solved:**
- ✅ Consistent learning experience across all plugins
- ✅ Easy to find information regardless of which plugin
- ✅ Clear expectations for contributors
- ✅ Maintainable and scalable documentation

**Benefits:**
- Users know exactly where to find specific information
- Contributors have clear guidelines for documentation
- Quality is measurable and improvable
- New plugins achieve excellence from day one

---

## 12 Required Sections

All plugin documentation MUST include these 12 sections in order:

1. **Header Block** - Emoji title, description, navigation
2. **TLDR** - Quick summary and getting started
3. **Table of Contents** - Navigation map
4. **Quickstart** - Copy-paste working example
5. **Dependencies** - What to install and why
6. **Usage Journey** - Progressive learning (5-7 levels) OR **Usage Patterns** (3-5 common scenarios)
7. **Configuration Reference** - Complete options documentation
8. **Configuration Examples** - Real-world scenarios
9. **API Reference** - All public methods and events
10. **Best Practices** - Do's, Don'ts, Performance, Security
11. **Error Handling** - Common errors and troubleshooting
12. **FAQ** - Frequently asked questions (10-20 minimum)

---

## Section 1: Header Block

### Requirements

```markdown
# 🎭 Plugin Name

> **One-line description of plugin purpose and key features.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration) | [FAQ ↓](#-faq)

---
```

**Mandatory Elements:**
- Emoji in title representing plugin category/function
- One-line description (max 100 characters)
- Navigation links:
  - `← Plugin Index` - Back to plugin list
  - `Configuration ↓` - Jump to configuration section
  - `FAQ ↓` - Jump to FAQ section
- Horizontal rule separator

**Emoji Guidelines:**
- 🎭 Browser/UI automation
- 📊 Data/Analytics
- 🔐 Security/Auth
- ⚡ Performance/Caching
- 🌐 Network/API
- 🔄 Data sync/replication
- 📁 Storage/Backup

### Example

See [puppeteer.md:1-7](./plugins/puppeteer.md) for gold standard implementation.

---

## Section 2: TLDR

### Requirements

Must include ALL of the following:

1. **One-sentence summary** - What does this plugin do?
2. **"1 line to get started"** - Minimal working example
3. **"Production-ready setup"** - Real-world configuration with inline comments
4. **Key features** - 4-7 bullet points with ✅ checkmarks
5. **Performance comparison** (optional but recommended) - Show value proposition

### Template

```markdown
## ⚡ TLDR

**One-sentence summary of what this plugin does.**

**1 line to get started:**
```javascript
await db.usePlugin(new PluginName({ /* minimal config */ }));
```

**Production-ready setup:**
```javascript
await db.usePlugin(new PluginName({
  option1: value1,  // Brief explanation
  option2: value2,  // Brief explanation
  option3: value3   // Brief explanation
}));

// Typical usage
const result = await plugin.doSomething();
```

**Key features:**
- ✅ **Feature 1** - Brief description
- ✅ **Feature 2** - Brief description
- ✅ **Feature 3** - Brief description
- ✅ **Feature 4** - Brief description

**Performance comparison:** (optional)
```javascript
// ❌ Without plugin
// ... slower/inefficient code

// ✅ With plugin
// ... optimized code with metrics
```
```

### Example

See [puppeteer.md:9-59](./plugins/puppeteer.md)

---

## Section 3: Table of Contents

### Requirements

- List all 12 required sections with anchor links
- Include subsections for Usage Journey/Patterns (levels/patterns)
- Use emoji prefixes matching section headers
- Placed after TLDR, before Quickstart

### Template

```markdown
## 📑 Table of Contents

1. [⚡ TLDR](#-tldr)
2. [⚡ Quickstart](#-quickstart)
3. [Usage Journey](#usage-journey)
   - [Level 1: Basic Usage](#level-1-basic-usage)
   - [Level 2: Intermediate](#level-2-intermediate)
   - [Level 3: Advanced](#level-3-advanced)
4. [📊 Configuration Reference](#-configuration-reference)
5. [📚 Configuration Examples](#-configuration-examples)
6. [🔧 API Reference](#-api-reference)
7. [✅ Best Practices](#-best-practices)
8. [🚨 Error Handling](#-error-handling)
9. [🔗 See Also](#-see-also)
10. [❓ FAQ](#-faq)

---
```

### Example

See [puppeteer.md:63-82](./plugins/puppeteer.md)

---

## Section 4: Quickstart

### Requirements

Complete, copy-paste-ready example (10-20 lines) that:
- Imports Database and plugin
- Shows database connection
- Demonstrates plugin initialization
- Shows basic usage
- Includes cleanup (disconnect)

**MUST work without modification when user copies it.**

### Template

```markdown
## ⚡ Quickstart

```javascript
import { Database } from 's3db.js';
import { PluginName } from 's3db.js';

const db = new Database({
  connectionString: 's3://key:secret@bucket/path'
});

// Create plugin with essential options
const plugin = new PluginName({
  option1: 'value',  // Essential option
  option2: true      // Essential option
});

await db.usePlugin(plugin);
await db.connect();

// Basic usage example
const result = await plugin.doSomething();
console.log(result);

await db.disconnect();
```

---
```

### Example

See [puppeteer.md:85-113](./plugins/puppeteer.md)

---

## Section 5: Dependencies

### Requirements

- List all peer dependencies required
- Show installation command (`pnpm install`)
- Indicate which are optional
- Explain why each dependency is needed
- Link to dependency documentation where relevant

### Template

```markdown
## 📦 Dependencies

**Required Peer Dependencies:**
```bash
pnpm install dependency-1 dependency-2
```

| Dependency | Version | Purpose | Optional |
|------------|---------|---------|----------|
| `dependency-1` | `^3.0.0` | Core functionality | No |
| `dependency-2` | `^2.5.0` | Feature XYZ | Yes |

**Why these dependencies?**
- **dependency-1**: Provides [specific capability]
- **dependency-2**: Enables [specific feature] (optional)

**Documentation:**
- dependency-1: https://example.com/docs
- dependency-2: https://example.com/docs

---
```

---

## Section 6: Usage Journey or Usage Patterns

### Requirements

Choose ONE of two formats:

#### Option A: Usage Journey (Progressive Learning)

5-7 levels building from basic to advanced:

```markdown
## Usage Journey

### Level 1: Basic [Feature]

Brief explanation of what this level demonstrates.

```javascript
// Complete, runnable example
```

**What's happening:**
- Point 1
- Point 2

---

### Level 2: Intermediate [Feature]

Builds on Level 1 with new concepts.

```javascript
// Complete, runnable example
```

**New concepts:**
- Concept 1
- Concept 2

---

[Continue through Level 7]
```

#### Option B: Usage Patterns (Common Scenarios)

3-5 common use cases:

```markdown
## Usage Patterns

### Pattern 1: Scenario Name

When to use this pattern and what problem it solves.

```javascript
// Complete, focused example
```

**When to use:**
- Situation 1
- Situation 2

---

### Pattern 2: Another Scenario

[Continue for 3-5 patterns]
```

### Requirements for Both Formats

- Each example MUST be complete and runnable
- Build complexity gradually (Journey) or focus on specific use case (Patterns)
- Include explanations of what's happening/new concepts
- Show real-world scenarios

### Example

See [puppeteer.md:115-585](./plugins/puppeteer.md) - 7-level usage journey

---

## Section 7: Configuration Reference

### Requirements

- Show COMPLETE configuration object (not partial)
- Organize by logical sections with visual separators
- Include inline comments for EVERY option
- Show default values clearly
- Use table format for complex/nested options

### Template

```markdown
## 📊 Configuration Reference

Complete configuration object with all available options:

```javascript
new PluginName({
  // ============================================
  // SECTION 1: Core Options
  // ============================================
  enabled: true,                    // Enable/disable plugin (default: true)
  option1: 'default',               // Description of option1

  // ============================================
  // SECTION 2: Advanced Options
  // ============================================
  advanced: {
    subOption1: 100,                // Description (default: 100)
    subOption2: false,              // Description (default: false)
  },

  // ============================================
  // SECTION 3: Feature Toggles
  // ============================================
  features: {
    feature1: { enabled: true },    // Enable feature1 (default: true)
    feature2: { enabled: false },   // Enable feature2 (default: false)
  }
})
```

**Detailed Options Table:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Master on/off switch |
| `option1` | string | `'default'` | Controls behavior XYZ |
| `advanced.subOption1` | number | `100` | Maximum limit for ABC |

---
```

### Example

See [puppeteer.md:587-786](./plugins/puppeteer.md)

---

## Section 8: Configuration Examples

### Requirements

5-10 real-world scenarios with focused configuration:

```markdown
## 📚 Configuration Examples

### Use Case 1: Scenario Name

Brief description of when to use this configuration.

```javascript
new PluginName({
  // Focused configuration for this specific use case
  option1: value1,
  option2: value2
})
```

**Why this configuration:**
- Reason 1
- Reason 2

---

### Use Case 2: Another Scenario

[Continue for 5-10 scenarios]
```

### Example

See [puppeteer.md:788-975](./plugins/puppeteer.md) - 12 configuration examples

---

## Section 9: API Reference

### Requirements

Document EVERY public method and event:

```markdown
## 🔧 API Reference

### Plugin Methods

#### `methodName(param1, param2?): Promise<ReturnType>`

Description of what the method does.

**Parameters:**
- `param1` (Type, required): Description
- `param2` (Type, optional): Description

**Returns:** `Promise<ReturnType>` - Description of return value

**Example:**
```javascript
const result = await plugin.methodName('value', { option: true });
```

**Throws:**
- `ErrorType` - When XYZ condition occurs

---

### Events

#### `event.name`

Emitted when [condition].

**Payload:**
```javascript
{
  field1: 'value',
  field2: 123
}
```

**Example:**
```javascript
plugin.on('event.name', ({ field1, field2 }) => {
  console.log(`Event: ${field1}`);
});
```

---
```

### Example

See [puppeteer.md:977-1247](./plugins/puppeteer.md) - Complete API reference

---

## Section 10: Best Practices

### Requirements

Three subsections:

1. **Do's ✅** (5-10 practices with examples)
2. **Don'ts ❌** (5-10 anti-patterns with corrections)
3. **Performance Tips**
4. **Security Considerations**

### Template

```markdown
## ✅ Best Practices

### Do's ✅

1. **Practice Name**
   ```javascript
   // ✅ Good example
   const result = await plugin.method({ option: true });
   ```

2. **Another Practice**
   ```javascript
   // ✅ Good example
   ```

[5-10 do's]

---

### Don'ts ❌

1. **Anti-Pattern Name**
   ```javascript
   // ❌ Bad - Reason why this is bad
   const result = plugin.badPattern();

   // ✅ Correct - Do this instead
   const result = await plugin.goodPattern();
   ```

[5-10 don'ts]

---

### Performance Tips

- **Tip 1**: Explanation and impact
- **Tip 2**: Explanation and impact

---

### Security Considerations

- **Warning 1**: What to avoid and why
- **Best practice 1**: What to do instead

---
```

### Example

See [puppeteer.md:1249-1386](./plugins/puppeteer.md)

---

## Section 11: Error Handling

### Requirements

Two subsections:

1. **Common Errors** (5-10 with solutions)
2. **Troubleshooting** (5-10 scenarios)

### Template

```markdown
## 🚨 Error Handling

### Common Errors

#### Error 1: Descriptive Error Name

**Problem:** What causes this error.

**Error message:**
```
Error: Specific error message
```

**Solution:**
```javascript
try {
  await plugin.method();
} catch (error) {
  if (error.code === 'SPECIFIC_ERROR') {
    // Handle this specific error
  }
}
```

**Prevention:**
- How to avoid this error

---

[5-10 common errors]

### Troubleshooting

#### Issue 1: Symptom Description

**Diagnosis:**
1. Check X
2. Verify Y
3. Confirm Z

**Fix:**
```javascript
// Solution code
```

---

[5-10 troubleshooting scenarios]
```

### Example

See [puppeteer.md:1388-1528](./plugins/puppeteer.md)

---

## Section 12: FAQ

### Requirements

- Minimum 10-20 questions
- Organized by categories:
  - General
  - Advanced
  - Performance
  - Troubleshooting
- Include code examples where helpful
- Answer real or anticipated questions

### Template

```markdown
## ❓ FAQ

### General

**Q: Basic usage question?**

A: Detailed answer with example.

```javascript
// Example demonstrating answer
```

---

**Q: Another common question?**

A: Answer with explanation.

---

[10-20 total questions across all categories]

### Advanced

**Q: Complex scenario question?**

A: Detailed technical answer.

---

### Performance

**Q: Performance-related question?**

A: Answer with metrics/benchmarks.

---

### Troubleshooting

**Q: Common problem question?**

A: Diagnostic steps and solution.

---
```

### Example

See [puppeteer.md:1530-1850](./plugins/puppeteer.md) - 80+ FAQ entries

---

## See Also Section

### Requirements

Links to related documentation with relationship descriptions:

```markdown
## 🔗 See Also

- [Related Plugin](./related-plugin.md) - How they work together
- [Core Concept](../concepts/concept.md) - Background information
- [Example](../examples/e42-example.js) - Working implementation

**Related Documentation:**
- Official docs: https://example.com
- Tutorial: Link to external resource

---
```

---

## Documentation Organization

### Simple Plugins (Single File)

**Criteria:**
- Less than 5 major features
- Less than 20 configuration options
- Less than 50 FAQ entries
- Less than 2000 lines total

**Structure:**
```
./docs/plugins/plugin-name.md
```

### Complex Plugins (Subdirectory)

**Criteria** (ANY of):
- 5+ major features
- Multiple integration patterns
- 50+ FAQ entries
- 2000+ lines documentation
- Architecture docs needed

**Structure:**
```
./docs/plugins/
├── plugin-name.md          # Main overview + all 12 sections
└── plugin-name/            # Deep-dive documentation
    ├── README.md           # Feature index
    ├── feature-1.md
    ├── feature-2.md
    └── architecture.md
```

**Current Complex Plugins:**
- ApiPlugin
- PuppeteerPlugin (gold standard)
- ReconPlugin
- CloudInventoryPlugin

---

## Quality Checklist

Use this checklist to verify documentation completeness:

### Structure
- [ ] All 12 required sections present
- [ ] Sections in correct order
- [ ] Navigation links work (Plugin Index, Configuration, FAQ)
- [ ] Table of contents complete with working anchors
- [ ] Horizontal rules separate major sections

### Content Quality
- [ ] Code examples are complete and runnable
- [ ] All configuration options documented
- [ ] All public methods in API reference
- [ ] All events documented with payload
- [ ] Minimum 10 FAQ entries (prefer 20+)
- [ ] Examples show real-world usage

### Navigation
- [ ] Header navigation present
- [ ] Table of contents links work
- [ ] Cross-references to related docs
- [ ] Breadcrumbs (if subdirectory)
- [ ] See Also section with relevant links

### Learning Path
- [ ] Progressive journey (5-7 levels) OR focused patterns (3-5)
- [ ] Examples build on each other (journey)
- [ ] "What's happening" or "New concepts" explanations
- [ ] Real-world scenarios demonstrated

### Best Practices
- [ ] Do's section with 5-10 examples
- [ ] Don'ts section with corrections
- [ ] Performance tips included
- [ ] Security considerations documented

### Error Handling
- [ ] 5-10 common errors documented
- [ ] Error messages shown
- [ ] Solutions with code provided
- [ ] Troubleshooting scenarios included

### Formatting
- [ ] Consistent emoji usage
- [ ] Proper markdown formatting
- [ ] Code blocks have syntax highlighting
- [ ] Tables formatted correctly
- [ ] No broken links

### Completeness
- [ ] Quickstart works copy-paste
- [ ] All placeholders filled (no {VARIABLE})
- [ ] No TODOs or incomplete sections
- [ ] Dependencies list complete
- [ ] Installation instructions clear

---

## Quality Badges

Documentation quality is indicated with badges in the plugin index:

- 🟢 **Complete**: All requirements met, passes quality checklist
- 🟡 **Partial**: Most sections present (8-11), 5-9 FAQ, partial coverage
- 🔴 **Minimal**: Less than 8 sections, stub/placeholder content

**Criteria for 🟢 Complete:**
- All 12 sections present and complete
- 10+ FAQ entries
- Runnable code examples
- Complete configuration reference
- All public methods documented
- Cross-links to related docs
- Passes quality checklist

---

## Templates

Ready-to-use templates are available:

- **[Full Template](./templates/plugin-doc-template.md)** - Complete template with all sections
- **[Minimal Template](./templates/plugin-doc-minimal.md)** - Streamlined for simple plugins

Both templates include:
- All 12 required sections
- Placeholder markers `{VARIABLE}`
- Inline guidance
- Usage instructions

---

## References

- **Gold Standard**: [PuppeteerPlugin](./plugins/puppeteer.md) - Exemplar implementation
- **Plugin Index**: [plugins/README.md](./plugins/README.md) - All plugin documentation
- **OpenSpec Proposal**: `openspec/changes/standardize-plugin-docs/` - Original specification
- **CLAUDE.md**: Project AI assistant guidance

---

## Maintenance

**Updating This Standard:**
- Changes require OpenSpec proposal
- Must update both templates when standard changes
- Validate changes against gold standard (puppeteer.md)
- Update existing docs incrementally (no forced migration)
