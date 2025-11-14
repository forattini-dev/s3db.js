# 📚 Multi-File Plugin Documentation Standard

> **Guidelines for organizing complex plugin documentation across multiple markdown files**

---

## When to Use Multi-File Docs

**Use single-file** (e.g., `cache.md`) when:
- ✅ Plugin has 1-5 features
- ✅ Less than 2000 lines of documentation
- ✅ Simple, linear workflow
- ✅ Minimal configuration options

**Use multi-file** (e.g., `api/`, `state-machine/`) when:
- ✅ Plugin has 5+ major features
- ✅ More than 2000 lines of documentation
- ✅ Multiple use cases/workflows
- ✅ Complex configuration with many options
- ✅ Deep API reference needed

---

## 📁 Directory Structure

```
docs/plugins/my-plugin/
├── README.md                 # Entry point + index
├── ARCHITECTURE.md           # (optional) System design
├── guides/                   # Topic-specific guides
│   ├── README.md            # Guide index (if many guides)
│   ├── quickstart.md
│   ├── configuration.md
│   ├── usage-patterns.md
│   └── best-practices.md
├── api/                      # (optional) Complete API reference
│   ├── README.md            # API overview
│   ├── core-methods.md
│   ├── hooks.md
│   └── events.md
├── examples/                 # (optional) Working code examples
│   ├── basic-setup.md
│   ├── advanced-patterns.md
│   └── integration.md
├── troubleshooting/         # (optional) Errors & solutions
│   ├── README.md
│   ├── common-errors.md
│   └── faq.md
└── images/                  # (optional) Diagrams, screenshots
    ├── architecture.png
    └── workflow.png
```

**Why this structure:**
- 🎯 **Clear hierarchy**: Root README → Guides → Topics
- 📍 **Easy navigation**: Links between related docs
- 🔍 **Searchable**: Each file covers one topic deeply
- 📈 **Scalable**: Add more guides as plugin grows
- 🎨 **Flexible**: Remove unused directories

---

## 1️⃣ README.md - The Entry Point

### Purpose
Bridge between plugin index and detailed guides. First thing users see.

### Required Sections (in order)

```markdown
# 🎨 Plugin Name

> One-line hook describing what the plugin does
>
> **Key features:** Feature 1 • Feature 2 • Feature 3

**Navigation:** [← Plugin Index](../README.md) | [Guides ↓](#guides) | [FAQ ↓]

---

## ⚡ TLDR (30 seconds)

- What it does in 2-3 sentences
- Basic usage example (5 lines max)
- When to use it
- When NOT to use it

---

## 📦 Dependencies

What packages needed, peer dependencies, optional tools.

---

## ⚡ Quick Start (2 minutes)

Complete working example to get started immediately.

---

## 📋 Documentation Index

**Table of contents with brief description of each guide.**

| Guide | Focus | When to read |
|-------|-------|--------------|
| [Configuration](guides/configuration.md) | Plugin options | Before setup |
| [Usage Patterns](guides/usage-patterns.md) | API reference | During development |
| [Best Practices](guides/best-practices.md) | Tips & tricks | After first use |

### Getting Help
1. Question about setup? → [Configuration](guides/configuration.md)
2. How to use feature X? → [Usage Patterns](guides/usage-patterns.md)
3. Error or edge case? → [Best Practices](guides/best-practices.md#troubleshooting)

---

## 🎯 Core Concepts

Brief intro to main ideas (2-3 short sections, not too deep).

---

## 🔧 Advanced Features

List of advanced capabilities with links to detailed guides.

---

## 📚 See Also

Links to related plugins, documentation, examples.
```

### README.md Best Practices

- ✅ **Header**: Emoji + name
- ✅ **Navigation links**: Always show how to get back
- ✅ **TLDR first**: Users scan docs, need quick answer
- ✅ **Index table**: Clear guide descriptions
- ✅ **Help routing**: "When to read X guide"
- ✅ **No deep dives**: Link to guides for details
- ✅ **Visual hierarchy**: H2 for main sections

---

## 2️⃣ Guides Organization

### Guide Structure Template

```markdown
# 📖 [Topic Name]

> **What this guide covers:** One sentence

**Audience:** Who should read (e.g., "Before configuration")
**Time to read:** 5 min
**Difficulty:** Beginner/Intermediate/Advanced

---

## Intro

2-3 sentences explaining why this topic matters.

---

## Core Concept

Explain ONE main idea thoroughly.

---

## Common Patterns

3-5 working code examples showing different use cases.

---

## Reference

Complete API/config reference for this topic.

---

## Troubleshooting

Common mistakes and solutions.

---

## See Also

- [Other Guide](../path)
- [API Reference](../api/methods.md)
- [Example](../examples/pattern.md)
```

### Guide Types & Purposes

| Guide Type | Purpose | Length | Audience |
|-----------|---------|--------|----------|
| `quickstart.md` | Get running in 2 min | 200-400 lines | Everyone |
| `configuration.md` | All config options | 300-600 lines | Setup phase |
| `usage-patterns.md` | API reference + examples | 800-1200 lines | During development |
| `best-practices.md` | Tips, tricks, gotchas | 400-800 lines | Intermediate+ |
| `advanced-patterns.md` | Edge cases, optimization | 600-1000 lines | Advanced |

**Total for a complex plugin:** 2500-4000 lines across 4-6 guides.

---

## 3️⃣ Navigation & Linking

### Always Include Navigation Headers

```markdown
# Guide Title

**Prev:** [Previous Guide](../guides/previous.md)
**Next:** [Next Guide](../guides/next.md)
**Main:** [README](../README.md) | **Guides:** [All guides](./README.md)
```

### Cross-Reference Links

```markdown
# ❌ Bad
See the configuration guide for more info.

# ✅ Good
See [Configuration Guide](configuration.md) for options like `timeout` and `retries`.
```

### "See Also" Sections

Every guide should end with:
```markdown
---

## 📚 See Also

- **[Configuration Guide](./configuration.md)** - Tweak behavior with options
- **[API Reference](../api/core-methods.md)** - Complete method signatures
- **[Example: Pattern Name](../examples/pattern.md)** - Full working code
- **[Troubleshooting](./best-practices.md#troubleshooting)** - Common issues
```

---

## 4️⃣ Code Examples

### Example Organization

**Option 1: Inline in guides**
```markdown
# Usage Pattern: Caching

### Example: Basic Cache

\`\`\`javascript
const cache = new CachePlugin({ driver: 'memory' });
await db.usePlugin(cache);
\`\`\`
```

**Option 2: Separate examples/ directory** (for 5+ examples)
```
docs/plugins/my-plugin/examples/
├── README.md           # Index of all examples
├── basic-setup.md      # Example + explanation
├── advanced-usage.md
└── edge-cases.md
```

### Example File Template

```markdown
# Example: [Pattern Name]

**When to use:** Real-world scenario
**Difficulty:** Beginner/Intermediate/Advanced
**Time:** 5 minutes

---

## Problem

What are we solving?

---

## Solution

Complete, runnable code example.

---

## Explanation

Line-by-line breakdown of how it works.

---

## Variations

Alternative approaches or edge cases.

---

## See Also

- [Related Pattern](./pattern2.md)
- [Configuration Guide](../guides/configuration.md)
```

---

## 5️⃣ Special Sections

### Troubleshooting Template

```markdown
## 🔧 Troubleshooting

### Error: [Error Message]

**Cause:** Why this happens

**Solution:**
1. Step 1
2. Step 2
3. Verify with: code example

**Related:** [Configuration](./configuration.md)
```

### FAQ Template

```markdown
## ❓ FAQ

### Q: [User Question]

**A:** Clear, concise answer with example if needed.

**Related:** [Relevant guide](./guide.md)

---

### Q: [Another common question]

**A:** Answer
```

### Performance/Optimization Section

```markdown
## ⚡ Performance Tips

### Tip 1: [Pattern Name]

- **When to use:** Scenario
- **Performance gain:** 50% faster
- **Trade-off:** Memory usage

\`\`\`javascript
// Code example
\`\`\`
```

---

## 6️⃣ Cross-Document References

### File Relationships

```
README.md (entry point)
    ↓
    ├→ guides/quickstart.md (2 min start)
    ├→ guides/configuration.md (setup)
    ├→ guides/usage-patterns.md (API reference)
    └→ guides/best-practices.md (tips & troubleshooting)
         ↓
         └→ examples/pattern1.md (working code)
```

### Comment Pattern for Structure

```markdown
# 📖 Configuration Guide

> **In this guide:**
> - Setting up basic options
> - Advanced configuration patterns
> - Performance tuning
> - Troubleshooting config issues
>
> **Jump to:** [Basic Setup](#basic-options) • [Advanced](#advanced) • [FAQ](#faq)
```

---

## 7️⃣ Quality Checklist

For each multi-file doc set, verify:

- [ ] **README.md** exists and serves as hub
- [ ] **Navigation links** exist in headers of all files
- [ ] **Table of contents** in README with brief descriptions
- [ ] **Guides clearly separated** by topic (not overlapping)
- [ ] **Cross-references** use relative paths and are correct
- [ ] **Examples** are complete and runnable
- [ ] **FAQ or troubleshooting** section exists
- [ ] **No duplicate content** across files
- [ ] **Images/diagrams** organized in `images/` directory
- [ ] **SEO friendly**: headings, keywords in natural places
- [ ] **Links checked**: No broken references

---

## 8️⃣ File Naming Conventions

### DO ✅
```
✅ quickstart.md         (action/noun, lowercase)
✅ configuration.md      (feature name)
✅ usage-patterns.md     (descriptive, hyphenated)
✅ best-practices.md     (topic-based)
✅ advanced-usage.md     (level-based)
✅ core-methods.md       (category-based)
```

### DON'T ❌
```
❌ Quick-Start.md        (inconsistent casing)
❌ config.md             (too abbreviated)
❌ how-to-use.md         (too wordy)
❌ part1.md              (not descriptive)
❌ v2.md                 (version in filename)
```

---

## 9️⃣ README Index Structure

### Pattern 1: Simple (4-6 guides)
```markdown
## 📋 Guides

| Guide | Focus |
|-------|-------|
| [Configuration](./guides/configuration.md) | Setup |
| [Usage](./guides/usage.md) | How to use |
| [Errors](./guides/errors.md) | Troubleshooting |
```

### Pattern 2: Categorized (7+ guides)
```markdown
## 📋 Documentation Index

### Getting Started
- [Quick Start](guides/quickstart.md)
- [Installation](guides/installation.md)

### Core Concepts
- [Architecture](guides/architecture.md)
- [Configuration](guides/configuration.md)

### Development
- [API Reference](api/reference.md)
- [Usage Patterns](guides/usage.md)
- [Advanced Usage](guides/advanced.md)

### Help & Support
- [Troubleshooting](guides/errors.md)
- [FAQ](guides/faq.md)
```

### Pattern 3: Goal-Based (Discovery-focused)
```markdown
## 🎯 What Do You Want to Do?

**I want to...**
- Get started quickly → [Quick Start](guides/quickstart.md)
- Configure options → [Configuration](guides/configuration.md)
- Understand how it works → [Architecture](guides/architecture.md)
- Use it in my app → [Usage Patterns](guides/usage.md)
- Solve a problem → [Troubleshooting](guides/errors.md)
```

---

## 🔟 Real-World Example

### State Machine Plugin Structure
```
docs/plugins/state-machine/
├── README.md                 # Entry + index
├── guides/
│   ├── event-triggers.md    # Event-based transitions
│   ├── configuration.md     # State definitions
│   ├── usage-patterns.md    # API examples
│   └── best-practices.md    # Tips + FAQ
```

**Total:** ~4500 lines across 5 files (vs 1 huge file)

**Benefits:**
- ✅ Each guide ~900 lines (manageable)
- ✅ Clear topic separation
- ✅ Easy to navigate
- ✅ Simple to maintain
- ✅ Users find answers fast

---

## 1️⃣1️⃣ Anti-Patterns

### ❌ TOO MANY FILES
```
Too fragmented:
├── 01-intro.md
├── 02-setup.md
├── 03-basic.md
├── 04-advanced.md
├── 05-api.md
├── 06-errors.md
└── 07-faq.md
```
**Problem:** Users lost, hard to navigate

### ❌ MONOLITHIC README
```
README.md (12000 lines)
└── Everything in one file
```
**Problem:** Users can't find anything, hard to maintain

### ❌ UNCLEAR NAMING
```
├── guide1.md
├── part2.md
├── section-advanced.md
└── v2-features.md
```
**Problem:** No idea what each file contains

### ❌ NO NAVIGATION
```
# Configuration Guide

[Content without links back to main docs]
```
**Problem:** Users trapped, can't find related docs

---

## Summary Template

For plugin docs maintainers to copy:

```markdown
# 📁 Doc Structure Checklist

Plugin: _________________

**Directory structure:**
- [ ] README.md (entry point)
- [ ] guides/ (topic-specific)
- [ ] api/ (if needed - API reference)
- [ ] examples/ (if 5+ examples)
- [ ] troubleshooting/ (if 20+ errors)

**Navigation:**
- [ ] README has table of contents
- [ ] All guides have "Prev/Next" links
- [ ] Cross-references use relative paths
- [ ] "See Also" sections in each guide

**Quality:**
- [ ] No duplicate content
- [ ] File names are descriptive
- [ ] Code examples are complete
- [ ] Links work correctly

**Size Validation:**
- [ ] README: 500-1500 lines
- [ ] Each guide: 300-1000 lines
- [ ] Total: 2500-5000 lines (justified)
```

---

## 📚 See Also

- **[Single-File Plugin Doc Standard](./plugin-docs-standard.md)** - For simple plugins
- **[Puppeteer Plugin](./plugins/puppeteer.md)** - Gold standard example
- **[State Machine Plugin](./plugins/state-machine/README.md)** - Multi-file example
