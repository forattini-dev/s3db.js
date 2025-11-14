# 📋 Multi-File Documentation Implementation Guide

**How to use the multi-file plugin documentation template**

This guide covers all **12 required documentation sections** and how they map to the multi-file structure.

---

## The 12 Required Sections

All plugin documentation must include these sections, organized across multiple files:

| # | Section | Location | Purpose | Required |
|---|---------|----------|---------|----------|
| 1 | **Header Block** | `README.md` top | Title, navigation, features | ✅ |
| 2 | **TLDR (30 sec)** | `README.md` | Quick overview, 1-liner | ✅ |
| 3 | **Dependencies** | `README.md` | Installation instructions | ✅ |
| 4 | **Quick Start** | `README.md` | Working example (2-5 min) | ✅ |
| 5 | **Documentation Index (ToC)** | `README.md` | Navigate all guides | ✅ |
| 6 | **Usage Patterns** | `guides/usage-patterns.md` | Progressive learning levels | ✅ |
| 7 | **Configuration Reference** | `guides/configuration.md` | All options documented | ✅ |
| 8 | **API Reference** | `guides/usage-patterns.md` or `api/` | All methods/hooks/events | ✅ |
| 9 | **Best Practices** | `guides/best-practices.md` | Do's and don'ts | ✅ |
| 10 | **Error Handling** | `guides/best-practices.md` | Common errors + solutions | ✅ |
| 11 | **FAQ** | `guides/best-practices.md` | 20+ Q&A pairs | ✅ |
| 12 | **Navigation** | All files | Prev/Next + links | ✅ |

---

## Quick Start (5 minutes)

### 1. Copy the Template

```bash
# Copy template directory
cp -r docs/plugins/template/multi-file/ docs/plugins/my-plugin/

# Replace placeholders
cd docs/plugins/my-plugin/
```

### 2. Update README.md (Sections 1-5, 12)

Replace these placeholders in `README.md`:

| Placeholder | Section | Example |
|-------------|---------|---------|
| `[Plugin Name]` | Header (1) | `Cache Plugin` |
| `[One-line hook...]` | Header (1) + TLDR (2) | `Accelerate queries with intelligent caching` |
| `Core feature 1-4` | Header (1) | `Memory caching`, `TTL support`, etc. |
| `[Critical Info]` | Header (1) | `Must call db.connect() first` |
| `[Package names]` | Dependencies (3) | `redis`, `memcached`, etc. |
| Quick Start code | Quick Start (4) | Real, working example |
| Documentation links | ToC (5) | Links to all guides |

### 3. Update Configuration Guide (Sections 6, 7, 12)

Edit `guides/configuration.md`:
- Add all **configuration options** (Section 7)
- Show real **default values**
- Provide **patterns** for common scenarios
- Include **environment variable** loading
- Add **validation** and **performance tuning**

### 4. Update Usage Patterns (Sections 6, 8, 12)

Edit `guides/usage-patterns.md`:
- Create **5-7 progressive patterns** (Section 6)
- Document **all API methods** (Section 8)
- Show **real working examples**
- Include **error handling**
- Add **performance tips**

### 5. Update Best Practices (Sections 9, 10, 11, 12)

Edit `guides/best-practices.md`:
- Add **5-7 best practices** with examples (Section 9)
- Document **common errors** with solutions (Section 10)
- Write **20+ FAQ entries** (Section 11)
- Include **troubleshooting section**
- Add **pro tips**

### 6. Navigation (Section 12)

- Add **Prev/Next links** at top of each guide
- Include **Main README link** in all files
- Link to **"All guides" index** from each file

### 7. Test Locally

```bash
# Check in VS Code
code docs/plugins/my-plugin/README.md

# Verify:
# ✅ All internal links work (use relative paths)
# ✅ Every guide has Prev/Next navigation
# ✅ README has complete table of contents
# ✅ All examples are syntactically correct
# ✅ FAQ covers 20+ common questions
```

---

## File Structure Quick Reference

```
docs/plugins/my-plugin/
├── README.md                 # Sections 1-5, 12 [UPDATE]
├── guides/
│   ├── configuration.md      # Sections 6, 7, 12 [UPDATE]
│   ├── usage-patterns.md     # Sections 6, 8, 12 [UPDATE]
│   └── best-practices.md     # Sections 9, 10, 11, 12 [UPDATE]
├── api/                      # (optional) Section 8 extension
│   ├── core-methods.md
│   └── hooks-events.md
├── examples/                 # (optional) Working code samples
│   ├── README.md            # Example index
│   └── basic-setup.md
└── images/                   # (optional) Diagrams
    └── architecture.png
```

---

## Detailed Section Requirements

### README.md - Hub & Entry Point

**Sections to include:**

#### 1️⃣ Header Block (Top of file)
```markdown
# 🎨 [Plugin Name]

> **[One-line description of what plugin does]**
>
> **Navigation:** [← Plugin Index](../README.md) | [Configuration ↓](#-configuration) | [FAQ ↓](#-faq)
>
> **Key features:** Feature 1 • Feature 2 • Feature 3 • Feature 4
```

Required elements:
- [ ] Emoji for visual identity
- [ ] Clear plugin name
- [ ] One-line hook (what it does)
- [ ] Back link to plugin index
- [ ] Quick navigation to key sections
- [ ] List of 4 core features

#### 2️⃣ TLDR Section (30 seconds)
Must cover:
- [ ] What the plugin does (1-2 sentences)
- [ ] One-line to get started (`plugins: [new XXXPlugin({})]`)
- [ ] When to use (✅ use cases)
- [ ] When NOT to use (❌ anti-patterns)
- [ ] Key features list (5-7 with benefits)
- [ ] Performance comparison (before/after if applicable)

**Example content:**
```markdown
## ⚡ TLDR

**What it does:** Automatic cleanup with X performance benefit

**1 line to get started:**
\`\`\`javascript
plugins: [new MyPlugin({ option: value })]
\`\`\`

**Key features:**
- ✅ Feature with benefit
- ✅ Feature with benefit

**When to use:**
- ✅ Use case 1
- ✅ Use case 2

**When NOT to use:**
- ❌ Anti-pattern 1
```

#### 3️⃣ Dependencies Section
Must include:
- [ ] Required package installation (`pnpm install s3db.js`)
- [ ] Peer dependencies (if any)
- [ ] Optional dependencies for advanced features
- [ ] Special installation notes (Docker, Kubernetes, etc.)
- [ ] Verification that plugin works without peer deps

#### 4️⃣ Quick Start Section (2-5 min)
Must provide:
- [ ] Complete, runnable example (copy-paste ready)
- [ ] Step 1: Install
- [ ] Step 2: Setup database
- [ ] Step 3: Create plugin instance
- [ ] Step 4: Use the plugin
- [ ] Expected output/result

No pseudo-code! Real code only.

#### 5️⃣ Documentation Index (Table of Contents)
Must have multiple navigation paths:
- [ ] **By Experience Level** (Beginner → Intermediate → Advanced)
- [ ] **By Feature** (each major feature listed)
- [ ] **By Use Case** (common scenarios)
- [ ] **Getting Help** (where to find answers)
- [ ] **Related Resources** (other docs, plugins, etc.)

**Example structure:**
```markdown
## 📚 Documentation Index

**By Experience Level:**
- Beginner: TLDR → Quickstart → Level 1
- Intermediate: Usage Journey → Configuration → Best Practices
- Advanced: API Reference → Performance Guide

**By Feature:**
| Feature | Where to read | Time |
|---------|--------------|------|
| Feature 1 | [Section](link) | X min |

**By Use Case:**
| Use Case | Doc | Difficulty |
|----------|-----|------------|
| Common task | [Guide](link) | Beginner |

**Getting Help:**
- Setup issues → [Configuration](./guides/configuration.md)
- Feature X → [Usage Patterns](./guides/usage-patterns.md)
- Errors → [Troubleshooting](./guides/best-practices.md#-error-handling)
- Questions → [FAQ](./guides/best-practices.md#-faq)
```

#### 6️⃣ Additional Sections (Optional)
- **Core Concepts** - Brief 2-3 section intro to key ideas
- **Advanced Features** - List of advanced capabilities with links
- **Examples** - Gallery of code examples
- **See Also** - Related plugins, related docs, examples

---

### guides/configuration.md - Configuration Reference

**Sections to include (Required):**

#### Navigation (Top)
```markdown
**Prev:** [Quick Start](../README.md#-quick-start-2-minutes)
**Next:** [Usage Patterns](./usage-patterns.md)
**Main:** [README](../README.md) | **All guides:** [Index](../README.md#-documentation-index)
```

#### Default Configuration
Show complete default config with ALL options:
```javascript
new MyPlugin({
  option1: defaultValue,  // Description
  option2: defaultValue,  // Description
  // ... all options
})
```

#### Option Reference
For each option, document:
```markdown
#### \`optionName\`
- **Type:** \`type\`
- **Default:** value
- **Range:** min-max (if applicable)
- **Description:** What it does
- **When to change:** Scenarios where you'd adjust this
- **Example:**
\`\`\`javascript
{ optionName: value }
\`\`\`
```

#### Configuration Patterns
Show 4-5 real-world patterns:
- Development setup
- Production setup
- High-volume processing
- Resource-constrained environments
- Specific feature (performance-focused, etc.)

#### Environment Variables
Show how to load config from `.env`:
```javascript
const config = {
  option: process.env.PLUGIN_OPTION || 'default'
};

// .env
PLUGIN_OPTION=value
```

#### Runtime Changes
Document if/how config can be changed after init:
```javascript
plugin.setConfig({ option: newValue }); // if supported
```

#### Validation
Show what errors occur for invalid config

#### Performance Tuning
Options that affect speed/reliability/memory

#### Troubleshooting Config
Common config mistakes and solutions

**Expected length:** 400-700 lines

---

### guides/usage-patterns.md - API Reference & Patterns

**Sections to include (Required):**

#### Navigation (Top)
```markdown
**Prev:** [Configuration](./configuration.md)
**Next:** [Best Practices](./best-practices.md)
**Main:** [README](../README.md) | **All guides:** [Index](../README.md#-documentation-index)
```

#### Quick Reference Table
```markdown
| Method | Purpose | Returns | Async |
|--------|---------|---------|-------|
| \`method1()\` | [Desc](#method1) | Type | ✅ |
```

#### Usage Patterns (5-7 Progressive Levels)
Each pattern shows:
1. When to use it
2. Complete, working code
3. What you get
4. What's missing (leads to next pattern)

**Examples:**
- Pattern 1: Basic usage
- Pattern 2: With error handling
- Pattern 3: Batch operations
- Pattern 4: Advanced features
- Pattern 5: Performance optimization

#### API Reference
For each public method:
```markdown
### methodName()

**Signature:**
\`\`\`typescript
methodName(param1: Type, param2?: Type): Promise<ReturnType>
\`\`\`

**Parameters:**
- \`param1\` (type) - Description

**Options:**
\`\`\`javascript
{ option: value, ... }
\`\`\`

**Returns:**
\`\`\`javascript
{ field: value, ... }
\`\`\`

**Examples:**
\`\`\`javascript
// Basic usage
const result = await plugin.methodName('input');

// With options
const result = await plugin.methodName('input', { option: value });
\`\`\`

**Errors:**
- \`ERROR_CODE\` - When this happens
```

#### Common Mistakes
Show ❌ wrong vs ✅ correct code:
```markdown
### ❌ Mistake: Ignoring async
\`\`\`javascript
const result = plugin.method();  // Won't work!
console.log(result);  // undefined
\`\`\`

### ✅ Correct: Using await
\`\`\`javascript
const result = await plugin.method();
console.log(result);  // Works!
\`\`\`
```

#### Performance Tips
- Use batching where applicable
- Configuration options that affect speed
- Best practices for throughput

**Expected length:** 900-1500 lines

---

### guides/best-practices.md - Tips, Troubleshooting & FAQ

**Sections to include (Required):**

#### Navigation (Top)
```markdown
**Prev:** [Usage Patterns](./usage-patterns.md)
**Main:** [README](../README.md) | **All guides:** [Index](../README.md#-documentation-index)
```

#### Best Practices (Section 9)
5-7 practices with code examples:
```markdown
### Practice 1: [Name]

\`\`\`javascript
// ✅ Good - shows correct approach
\`\`\`

**Why:** Explanation of benefit

---
```

#### Pro Tips (Section 9 Extension)
Advanced techniques:
- Caching strategies
- Performance optimization tricks
- Integration patterns
- Debugging techniques

#### Common Mistakes (Section 10)
```markdown
### Mistake 1: [Description]

**Symptom:** What the user experiences
**Root cause:** Why it happens

**Solution:**
\`\`\`javascript
// ✅ Fix
\`\`\`
```

#### Error Handling (Section 10)
For each error code:
```markdown
### Error: "ERROR_CODE"

**Symptom:** What user sees
**Causes:** List 2-3 reasons

**Solutions:**
1. Check X
2. Try Y
3. If still fails, do Z

\`\`\`javascript
// Example fix
\`\`\`
```

Must cover:
- [ ] At least 5 common errors
- [ ] Clear causes
- [ ] Step-by-step solutions
- [ ] Code examples

#### FAQ (Section 11 - REQUIRED 20+)
Organize into categories:
```markdown
## ❓ FAQ

### General Questions
### Q: Question?
**A:** Answer with example if applicable

---

### Configuration Questions
### Q: How do I...?
**A:** Answer

---

### Performance Questions
### Q: Why is it slow?
**A:** Answer with solutions

---

### Troubleshooting Questions
### Q: I get error X?
**A:** Answer

---

### Integration Questions
### Q: How do I use with Y?
**A:** Answer
```

Minimum 20 Q&A pairs covering:
- [ ] General usage questions
- [ ] Configuration questions
- [ ] Feature questions
- [ ] Performance questions
- [ ] Integration questions
- [ ] Troubleshooting questions

**Expected length:** 1000-1500 lines

---

## Summary: What Each File Must Have

### README.md (Sections 1-5 + 12)
✅ Header + navigation
✅ TLDR with features & use cases
✅ Dependencies
✅ Quick Start (2-5 min)
✅ Documentation Index (multiple nav paths)
✅ Prev/Next links (if longer)
✅ Links to all guides

### guides/configuration.md (Sections 6, 7 + 12)
✅ Navigation (Prev/Next/Main)
✅ Default configuration (all options)
✅ Option Reference (each option detailed)
✅ Configuration Patterns (4+ scenarios)
✅ Environment Variables
✅ Performance Tuning
✅ Troubleshooting
✅ See Also section

### guides/usage-patterns.md (Sections 6, 8 + 12)
✅ Navigation (Prev/Next/Main)
✅ Quick Reference table
✅ 5-7 Progressive patterns
✅ API Reference (all methods)
✅ Common Mistakes (wrong vs right)
✅ Performance Tips
✅ See Also section

### guides/best-practices.md (Sections 9, 10, 11 + 12)
✅ Navigation (Prev/Next/Main)
✅ 5-7 Best Practices
✅ Pro Tips
✅ Common Mistakes
✅ Error Handling (5+ errors)
✅ Troubleshooting
✅ FAQ (20+ Q&A)
✅ See Also section

---

## Pre-Migration Checklist

Before you start migrating an existing plugin, verify the source doc has these 12 sections:

- [ ] **Section 1**: Header with navigation and features
- [ ] **Section 2**: TLDR (30 sec overview)
- [ ] **Section 3**: Dependencies (pnpm install)
- [ ] **Section 4**: Quick Start (working example)
- [ ] **Section 5**: Table of Contents (multiple nav paths)
- [ ] **Section 6**: Usage Patterns (5-7 progressive levels)
- [ ] **Section 7**: Configuration Reference (all options)
- [ ] **Section 8**: API Reference (all methods)
- [ ] **Section 9**: Best Practices (5-7 practices)
- [ ] **Section 10**: Error Handling (5+ common errors)
- [ ] **Section 11**: FAQ (20+ Q&A pairs)
- [ ] **Section 12**: Navigation (Prev/Next in all files)

If any section is missing, add it before/during migration.

---

## Migration Steps

### Step 1: Copy Template
```bash
# Backup existing docs
cp -r docs/plugins/my-plugin docs/plugins/my-plugin.bak

# Remove old structure
rm -rf docs/plugins/my-plugin/*

# Copy new template
cp -r docs/plugins/template/multi-file/* docs/plugins/my-plugin/
```

### Step 2: Extract Content to README.md
From existing doc, extract and add to `README.md`:
- [ ] Section 1: Header (plugin name, emoji, features, navigation)
- [ ] Section 2: TLDR (what it does, 1-liner, key features, use cases)
- [ ] Section 3: Dependencies (pnpm install commands)
- [ ] Section 4: Quick Start (complete working example)
- [ ] Section 5: Documentation Index (organize by experience level, feature, use case)
- [ ] Section 6: Core Concepts (2-3 key intro concepts, optional)
- [ ] Section 7: Advanced Features (link to guides)
- [ ] Section 8: See Also (related plugins, docs)

### Step 3: Extract Content to guides/configuration.md
From existing doc, extract configuration section:
- [ ] Default configuration with all options
- [ ] Option Reference (each option: type, default, range, when to change)
- [ ] Configuration Patterns (4-5 real-world scenarios)
- [ ] Environment Variables (how to load from .env)
- [ ] Runtime Changes (can config be modified after init?)
- [ ] Validation (what errors for invalid config?)
- [ ] Performance Tuning (options that affect speed/memory)
- [ ] Troubleshooting (common config mistakes)

### Step 4: Extract Content to guides/usage-patterns.md
From existing doc, extract usage/API sections:
- [ ] Quick Reference table (all methods, return types)
- [ ] 5-7 Usage Patterns (progressive levels)
- [ ] API Reference (for each public method: signature, params, options, returns, examples, errors)
- [ ] Common Mistakes (❌ wrong vs ✅ correct code)
- [ ] Performance Tips (batching, optimization, throughput)
- [ ] Advanced Patterns (if applicable)

### Step 5: Extract Content to guides/best-practices.md
From existing doc, extract best practices and FAQ:
- [ ] 5-7 Best Practices (with code examples showing what to do)
- [ ] Pro Tips (advanced techniques and tricks)
- [ ] Common Mistakes (what users do wrong, with solutions)
- [ ] Error Handling (for each error: symptom, causes, solutions)
- [ ] Troubleshooting (step-by-step debug guides)
- [ ] FAQ (20+ Q&A pairs, organized by category)

### Step 6: Add Navigation
Add to top of each guide file:
```markdown
**Prev:** [Previous Guide](./previous.md)
**Next:** [Next Guide](./next.md)
**Main:** [README](../README.md) | **All guides:** [Index](../README.md#-documentation-index)
```

Order:
- README → configuration.md → usage-patterns.md → best-practices.md

### Step 7: Update Internal Links
- [ ] Replace all `#section` links with full guide links (e.g., `./guides/configuration.md#option-name`)
- [ ] Replace all relative paths to use `../` correctly from new file location
- [ ] Test all links in VS Code or browser

### Step 8: Quality Check
- [ ] Run through entire documentation
- [ ] Verify every link works (use VS Code "Go to Definition")
- [ ] Check all code examples are syntactically correct
- [ ] Verify FAQ has 20+ entries
- [ ] Check error handling covers 5+ errors
- [ ] Verify best practices have 5-7 items
- [ ] Confirm navigation is complete (Prev/Next in all files)
- [ ] Check ToC has multiple navigation paths (by level, by feature, by use case)
- [ ] Verify all sections have proper formatting (headings, code blocks, links)

---

## Customization Checklist

### Essential Changes

- [ ] Update all plugin names (search/replace `my-plugin`)
- [ ] Update all feature descriptions
- [ ] Add actual config options to `configuration.md`
- [ ] Document all public methods in `usage-patterns.md`
- [ ] Add real troubleshooting scenarios
- [ ] Write 20+ FAQ items (REQUIRED)
- [ ] Update all links to match your structure
- [ ] Add real code examples (no pseudo-code)

### Optional Additions

- [ ] Create `api/` directory for detailed API docs (if 10+ methods)
- [ ] Create `examples/` for working code samples (if 5+ examples)
- [ ] Create `images/` for diagrams/screenshots
- [ ] Add architecture diagram
- [ ] Add performance benchmarks
- [ ] Add migration guide (if updating from v1)

### Quality Checks

- [ ] All links are relative and correct
- [ ] No broken cross-references
- [ ] Code examples are complete and runnable
- [ ] Each guide has navigation links
- [ ] README has clear table of contents
- [ ] FAQ section is comprehensive
- [ ] Troubleshooting covers common errors
- [ ] Performance tips are specific
- [ ] Consistent formatting and style

---

## Common Customizations

### Customization 1: Single Config Option

If your plugin has only 1-2 options:

**In README.md:**
```markdown
## Configuration

The plugin has minimal configuration:

\`\`\`javascript
{
  enabled: true,    // Enable/disable
  timeout: 5000     // Request timeout
}
\`\`\`

See [Configuration Guide](./guides/configuration.md) for details.
```

**Keep configuration.md** - Still good practice even for simple configs.

---

### Customization 2: Few API Methods

If your plugin has only 1-3 methods:

**In guides/usage-patterns.md:**
Keep it short, merge multiple patterns. Example:

```markdown
## API Reference

Your plugin has 3 methods:

### method1()
[Details and examples]

### method2()
[Details and examples]

### method3()
[Details and examples]
```

---

### Customization 3: Complex Architecture

If your plugin is very complex:

**Create additional directories:**
```
guides/
├── configuration.md
├── usage-patterns.md
├── best-practices.md
├── architecture.md      # NEW - System design
└── advanced/            # NEW - Subdirectory for advanced topics
    ├── caching.md
    ├── optimization.md
    └── hooks.md
```

Update README.md to link to these new guides.

---

### Customization 4: Multiple Examples

If you have 5+ working examples:

**Create examples/ directory:**
```
examples/
├── README.md            # Index of examples
├── basic-setup.md       # Example 1
├── with-caching.md      # Example 2
├── error-handling.md    # Example 3
└── integration.md       # Example 4
```

Update README.md:
```markdown
## 📚 Examples

Working code examples for common patterns:

- **[Basic Setup](./examples/basic-setup.md)**
- **[With Caching](./examples/with-caching.md)**
- **[Error Handling](./examples/error-handling.md)**
- **[Integration](./examples/integration.md)**
```

---

## Navigation Best Practices

### Header Navigation

Every guide file should start with:

```markdown
**Prev:** [Previous Guide](./filename.md)
**Next:** [Next Guide](./filename.md)
**Main:** [README](../README.md) | **All guides:** [Index](../README.md#-documentation-index)
```

### Cross-References

When linking to other guides:

```markdown
# ✅ Good - descriptive link text
See the [Configuration Guide](./configuration.md) for options like `timeout` and `retries`.

# ❌ Bad - unclear link text
See [this](./configuration.md) for more info.
```

### See Also Sections

End each guide with:

```markdown
---

## 📚 See Also

- **[Other Guide](./other.md)** - Brief description
- **[Related Concept](./concept.md)** - What it covers
- **[API Reference](../api/methods.md)** - Method signatures
```

---

## Tips for Better Docs

### Tip 1: Use Real Code Examples

```javascript
// ❌ Pseudo-code (hard to understand)
const result = db.plugin.doSomething(input);

// ✅ Real code (users can copy/paste)
const result = await db.myPlugin.doSomething('hello');
console.log(result.data);
```

---

### Tip 2: Show Before/After

```markdown
# ❌ Wrong
const result = db.myPlugin.doSomething();

# ✅ Correct
const result = await db.myPlugin.doSomething('input');
```

---

### Tip 3: Document Error Cases

```markdown
## Errors

- `INVALID_INPUT` - Input must be a string
- `TIMEOUT` - Operation took too long
- `NOT_INITIALIZED` - Call db.connect() first
```

---

### Tip 4: Include Performance Numbers

```markdown
## Performance

- Single operation: <1ms
- Batch of 1000: <100ms
- With cache: <0.1ms
```

---

### Tip 5: Use Tables for Reference

```markdown
| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `timeout` | number | 5000 | Request timeout |
| `retries` | number | 3 | Retry count |
```

---

## Validation Checklist

Before publishing, verify:

### Content Quality
- [ ] All examples are syntactically correct
- [ ] Code examples are runnable
- [ ] No placeholder text remaining
- [ ] All terminology is consistent
- [ ] No duplicate content across files

### Navigation
- [ ] All internal links work
- [ ] External links are correct
- [ ] Every guide has Prev/Next links
- [ ] README has complete table of contents
- [ ] See Also sections are relevant

### Structure
- [ ] Files are well-organized
- [ ] No missing required sections
- [ ] Logical flow between guides
- [ ] Appropriate section depth (H2, H3, etc.)
- [ ] Consistent formatting

### Completeness
- [ ] All config options documented
- [ ] All API methods documented
- [ ] FAQ covers common questions
- [ ] Troubleshooting covers common errors
- [ ] Examples are realistic
- [ ] Performance tips are specific

### Presentation
- [ ] Professional tone
- [ ] Clear, concise writing
- [ ] Proper spelling/grammar
- [ ] Consistent styling
- [ ] Good use of formatting (bold, code, etc.)

---

## When to Add More Files

### Add `api/` directory when:
- [ ] Plugin has 10+ public methods
- [ ] Methods need detailed parameter documentation
- [ ] Advanced configuration with many options
- [ ] Hooks/events API to document

### Add `examples/` directory when:
- [ ] You have 5+ working example scripts
- [ ] Examples showcase different use cases
- [ ] Users ask for more examples frequently

### Add `troubleshooting/` directory when:
- [ ] You have 20+ common issues
- [ ] Common errors deserve deep dives
- [ ] Separate diagnostic guide needed

### Add `architecture.md` when:
- [ ] Plugin has complex internal design
- [ ] Plugin has multiple subcomponents
- [ ] Advanced users need to understand internals

---

## File Size Guide

Aim for these lengths (rough guides):

```
README.md                500-1500 lines
guides/configuration.md  300-600 lines
guides/usage-patterns.md 800-1200 lines
guides/best-practices.md 600-1000 lines

Total (all 4 files):     2500-5000 lines
```

If individual guides exceed 1500 lines, consider splitting into multiple files.

---

## Next Steps

1. ✅ Copy the template directory
2. ✅ Update README.md with your plugin info
3. ✅ Document all config options
4. ✅ Document all API methods
5. ✅ Add real-world examples
6. ✅ Write FAQ and troubleshooting
7. ✅ Test all links work
8. ✅ Verify code examples run
9. ✅ Get peer review
10. ✅ Publish!

---

## Questions?

Refer to:
- **[Multi-File Standard](../multi-file-plugin-docs-standard.md)** - Complete specification
- **[State Machine Plugin](../state-machine/README.md)** - Real-world example
- **[Single-File Template](./single-file/README.md)** - For simpler plugins

---

**Good luck with your docs!** 📚
