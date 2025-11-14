# 🎨 [Plugin Name] - Multi-File Template

> **[One-line hook describing what plugin does]**
>
> **Key features:** Core feature 1 • Core feature 2 • Core feature 3 • Core feature 4

**Navigation:** [← Plugin Index](../../README.md) | [Guides ↓](#-documentation-index) | [FAQ ↓](./guides/best-practices.md#-faq)

---

## ⚡ IMPORTANT: [Critical Info]

**[High-priority concept that users must know before using]**

Real example:
- **Thread-safety:** This plugin creates resources named `plg_*`, don't manually create them
- **Async requirement:** All operations are async, wrap in async functions
- **Configuration location:** Must be passed on database init, not in `usePlugin()`

```javascript
// ✅ Correct way
const db = new Database({ plugins: [{ name: 'my-plugin', config: {...} }] });

// ❌ Wrong way
const db = new Database();
await db.usePlugin(new MyPlugin()); // Can't pass config here
```

See [Configuration Guide](./guides/configuration.md) for all options.

---

## ⚡ TLDR (30 seconds)

**What it does:** 1-2 sentence summary explaining core purpose.

**Quick example:**
```javascript
import { Database, MyPlugin } from 's3db.js';

const db = new Database({
  plugins: [
    {
      name: 'my-plugin',
      config: {
        option1: 'value',
        option2: true
      }
    }
  ]
});

await db.connect();
// Use plugin: db.myPlugin.method()
```

**When to use:**
- ✅ Use case 1
- ✅ Use case 2
- ✅ Use case 3

**When NOT to use:**
- ❌ Anti-pattern 1 (use plugin X instead)
- ❌ Anti-pattern 2

**Main features:**
- 🎯 Feature 1 - explains benefit
- 🎯 Feature 2 - explains benefit
- 🎯 Feature 3 - explains benefit

---

## 📦 Dependencies

**Required:**
```bash
pnpm install s3db.js
```

**Peer dependencies:**
```bash
pnpm install [package1] [package2]  # If plugin needs external packages
```

**Optional (for advanced features):**
```bash
pnpm install [optional-package]     # For feature X
```

**NO peer dependencies** - This plugin is fully integrated with s3db.js core!

---

## ⚡ Quick Start (2 minutes)

### 1. Install

```bash
pnpm install s3db.js
```

### 2. Setup

```javascript
import { Database, MyPlugin } from 's3db.js';

const db = new Database({
  connectionString: 's3://bucket/db',
  plugins: [
    {
      name: 'my-plugin',
      config: {
        // Default options shown
        timeout: 5000,
        retries: 3,
        enabled: true
      }
    }
  ]
});

await db.connect();
```

### 3. Use

```javascript
// Basic usage
const result = await db.myPlugin.doSomething('input', { option: 'value' });
console.log(result);
```

### 4. Verify

```javascript
const status = db.myPlugin.getStatus();
console.log(`Plugin is ${status.connected ? 'connected' : 'disconnected'}`);
```

✅ You're ready! Next: Read [Configuration Guide](./guides/configuration.md)

---

## 📋 Documentation Index

Complete documentation organized by learning path. **Start here to find what you need.**

### Quick Start
| Resource | Read when | Time |
|----------|-----------|------|
| **[Quick Start](#-quick-start-2-minutes)** (above) | First time setup | 2 min |
| **[Configuration Guide](./guides/configuration.md)** | Customizing behavior | 10 min |

### By Use Case
| Guide | When to read | Difficulty |
|-------|--------------|-----------|
| **[Usage Patterns](./guides/usage-patterns.md)** | Learning how to use the plugin | Beginner |
| **[Advanced Patterns](./guides/advanced-patterns.md)** | Optimizing performance, edge cases | Intermediate+ |
| **[Integration Guide](./guides/integration.md)** | Using with other plugins/apps | Advanced |

### API & Reference
| Guide | When to read | Length |
|-------|--------------|--------|
| **[API Reference](./api/core-methods.md)** | Looking up methods and parameters | 15 min |
| **[Hooks & Events](./api/hooks-events.md)** | Custom behavior via callbacks | 10 min |
| **[Best Practices](./guides/best-practices.md)** | Tips, tricks, common mistakes | 15 min |

### Getting Help
| Issue | Solution |
|-------|----------|
| **Setup questions?** | → [Configuration Guide](./guides/configuration.md) |
| **How to use feature X?** | → [Usage Patterns](./guides/usage-patterns.md) |
| **Error or weird behavior?** | → [Best Practices - Troubleshooting](./guides/best-practices.md#troubleshooting) |
| **Common question?** | → [FAQ](./guides/best-practices.md#-faq) |

---

## 🎯 Core Concepts

### Concept 1: [Name]

**What it is:** Brief explanation

**Why it matters:** Impact on usage

**Example:**
```javascript
// Example code
```

### Concept 2: [Name]

**What it is:** Brief explanation

**Why it matters:** Impact on usage

**Example:**
```javascript
// Example code
```

---

## 🔧 Advanced Features

The plugin supports advanced capabilities:

- **[Feature Name](./guides/advanced-patterns.md#feature-name)** - Detailed guide with examples
- **[Feature Name](./guides/advanced-patterns.md#feature-name)** - Detailed guide with examples
- **[Feature Name](./guides/advanced-patterns.md#feature-name)** - Detailed guide with examples

---

## 📚 Examples

Working code examples for common patterns:

- **[Basic Setup](./guides/usage-patterns.md#basic-usage)** - Minimal working example
- **[Pattern: X](./guides/usage-patterns.md#pattern-x)** - Using feature X
- **[Pattern: Y](./guides/usage-patterns.md#pattern-y)** - Using feature Y
- **[Complete Example](./examples/real-world-app.md)** - Full app integration

---

## 🔗 See Also

- **[s3db.js Main Docs](../../../README.md)** - Core library documentation
- **[Plugin Index](../../README.md)** - All available plugins
- **[Related Plugin: X](../plugin-x/README.md)** - Complementary plugin
- **[Example Repository](https://github.com/...)** - Full working projects

---

## 📞 Help & Support

**Quick questions?**
- Check [FAQ](./guides/best-practices.md#-faq)
- Search [troubleshooting](./guides/best-practices.md#troubleshooting)

**Want to contribute?**
- Found a bug? [Open an issue](https://github.com/forattini-dev/s3db.js/issues)
- Have a fix? [Submit a PR](https://github.com/forattini-dev/s3db.js/pulls)

**Need more help?**
- Read [Configuration](./guides/configuration.md) for setup issues
- Check [API Reference](./api/core-methods.md) for method signatures
- Review [Usage Patterns](./guides/usage-patterns.md) for common use cases

---

**Last updated:** [Date]
**Plugin version:** [Version]
**Status:** ✅ Production Ready
