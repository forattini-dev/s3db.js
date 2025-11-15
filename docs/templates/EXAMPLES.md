# Template Usage Examples

> **How to use the plugin documentation templates to create high-quality documentation.**
>
> **Language reminder:** all documentation and examples must be written in English.
>
> **Navigation:** [← Templates Index](./) | [Standard ↑](../plugin-docs-standard.md) | [Full Template ↓](./plugin-doc-template.md) | [Minimal Template ↓](./plugin-doc-minimal.md)

---

## 📑 Table of Contents

1. [Choosing the Right Template](#choosing-the-right-template)
2. [Step-by-Step: Using the Minimal Template](#step-by-step-using-the-minimal-template)
3. [Step-by-Step: Using the Full Template](#step-by-step-using-the-full-template)
4. [Before/After Comparison](#beforeafter-comparison)
5. [Common Mistakes to Avoid](#common-mistakes-to-avoid)
6. [Tips for Efficiency](#tips-for-efficiency)
7. [Quality Checklist](#quality-checklist)

---

## Choosing the Right Template

### Use the Minimal Template When:

✅ Your plugin has **less than 5 major features**
✅ Configuration has **less than 20 options**
✅ Usage patterns are **straightforward**
✅ Documentation will be **under 1000 lines**
✅ Plugin has **simple API** (few methods/events)

**Examples:** CachePlugin, TTLPlugin, MetricsPlugin

---

### Use the Full Template When:

✅ Your plugin has **5+ major features**
✅ Configuration has **20+ options**
✅ Multiple **complex usage patterns**
✅ Documentation will be **1000+ lines**
✅ Plugin has **extensive API** (many methods/events)
✅ Needs **feature-specific deep dives**

**Examples:** PuppeteerPlugin, ReplicatorPlugin, ApiPlugin

---

## Step-by-Step: Using the Minimal Template

Let's document a fictional **"CompressionPlugin"** that compresses data before storing in S3.

### Step 1: Copy the Template

```bash
cp docs/templates/plugin-doc-minimal.md docs/plugins/compression.md
```

### Step 2: Open and Read Header Comments

The template starts with usage instructions:

```markdown
<!--
PLUGIN DOCUMENTATION TEMPLATE - MINIMAL VERSION
================================================

For simple plugins with fewer than 5 major features.

HOW TO USE THIS TEMPLATE:
1. Copy this file to ./docs/plugins/{your-plugin-name}.md
2. Replace all {PLACEHOLDERS} with your content
3. Remove all comments (<!-- lines)
4. Fill in condensed sections (still all 12 required)
5. Aim for 400-800 lines total (vs 1000+ in full template)
-->
```

### Step 3: Identify All Placeholders

Find all placeholders to replace:

```bash
grep "{" docs/plugins/compression.md
```

Common placeholders:
- `{PLUGIN_NAME}` → CompressionPlugin
- `{PLUGIN_EMOJI}` → 🗜️
- `{ONE_LINE_DESCRIPTION}` → Automatically compress data before storing in S3
- `{DESCRIPTION}` → Same as above
- `{pluginInstance}` → compressionPlugin

### Step 4: Replace Placeholders Systematically

**Find and Replace:**

| Placeholder | Replacement |
|-------------|-------------|
| `{PLUGIN_NAME}` | `CompressionPlugin` |
| `{PLUGIN_EMOJI}` | `🗜️` |
| `{ONE_LINE_DESCRIPTION}` | `Automatically compress data before storing in S3 to reduce storage costs` |
| `{pluginInstance}` | `compressionPlugin` |
| `{method}` | `compress` |
| `{advancedMethod}` | `setCompressionLevel` |

**Using your editor:**

- **VS Code**: `Cmd/Ctrl + H` → Find `{PLUGIN_NAME}` → Replace with `CompressionPlugin`
- **Vim**: `:%s/{PLUGIN_NAME}/CompressionPlugin/g`
- **sed**: `sed -i 's/{PLUGIN_NAME}/CompressionPlugin/g' docs/plugins/compression.md`

### Step 5: Fill in Code Examples

**Before (template):**
```javascript
const {pluginInstance} = new {PLUGIN_NAME}({ option1: 'value' });
await db.usePlugin({pluginInstance});

const result = await {pluginInstance}.{method}();
```

**After (filled):**
```javascript
const compressionPlugin = new CompressionPlugin({ algorithm: 'gzip' });
await db.usePlugin(compressionPlugin);

// Automatic compression on insert
await resource.insert({ data: largeObject });
```

### Step 6: Fill in Configuration Reference

**Before (template):**
```javascript
new {PLUGIN_NAME}({
  // Core options
  option1: 'default',        // {Description} (default: 'default')
  option2: true,             // {Description} (default: true)
})
```

**After (filled):**
```javascript
new CompressionPlugin({
  // Core options
  algorithm: 'gzip',         // Compression algorithm (default: 'gzip')
  level: 6,                  // Compression level 1-9 (default: 6)
  minSize: 1024,             // Minimum bytes to compress (default: 1024)

  // Performance
  concurrent: true,          // Compress in parallel (default: true)
  maxWorkers: 4              // Max compression threads (default: 4)
})
```

### Step 7: Add FAQ Entries

Aim for **10+ questions** (minimal template) vs 20+ in full template.

```markdown
## ❓ FAQ

### General

**Q: What compression algorithms are supported?**

A: CompressionPlugin supports gzip, brotli, and zstd. Choose based on your needs:
- **gzip** - Best compatibility, moderate compression
- **brotli** - Best compression ratio, slower
- **zstd** - Best performance, good compression

```javascript
new CompressionPlugin({ algorithm: 'brotli' });
```

---

**Q: Does it compress small objects?**

A: No, by default objects under 1KB are not compressed (overhead not worth it). Configure with `minSize` option:

```javascript
new CompressionPlugin({ minSize: 500 }); // Compress 500 bytes+
```

---

[Continue for 8 more questions...]
```

### Step 8: Remove Template Comments

Delete all lines starting with `<!--`:

```bash
sed -i '/^<!--/,/-->/d' docs/plugins/compression.md
```

Or manually delete comment blocks in your editor.

### Step 9: Verify Against Quality Checklist

At the bottom of the template is a quality checklist:

```markdown
## Quality Checklist

- [ ] All {PLACEHOLDERS} replaced
- [ ] All 12 sections present
- [ ] Code examples work
- [ ] 10+ FAQ entries
- [ ] Configuration documented
- [ ] API methods documented
- [ ] Navigation links work
```

Go through each item and verify.

### Step 10: Update Plugin Index

Add your new plugin to `docs/plugins/README.md`:

```markdown
## 🗜️ Compression & Optimization

| Plugin | Badge | Description |
|--------|-------|-------------|
| **[CompressionPlugin](./compression.md)** | 🟢 | Automatically compress data before storing in S3 |
```

---

## Step-by-Step: Using the Full Template

For complex plugins like **"AnalyticsPlugin"** with 7+ features.

### Step 1: Copy Template

```bash
cp docs/templates/plugin-doc-template.md docs/plugins/analytics.md
```

### Step 2: Plan Your Structure

The full template has more sections. Plan your content:

**Features to document:**
1. Event tracking
2. Custom metrics
3. Data aggregation
4. Real-time dashboards
5. Export to analytics platforms
6. Query API
7. Alert triggers

**Usage Journey (7 levels):**
1. Basic event tracking
2. Custom event properties
3. User tracking
4. Session tracking
5. Conversion funnels
6. Real-time analytics
7. Advanced: Custom aggregations

### Step 3: Fill Header and TLDR

```markdown
# 📊 AnalyticsPlugin

> **Track events, analyze user behavior, and gain insights from your S3 data with built-in analytics.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

**Track every interaction with your data and gain powerful insights without external analytics services.**

**1 line to get started:**
```javascript
await db.usePlugin(new AnalyticsPlugin({ trackEvents: true }));
```

**Production-ready setup:**
```javascript
const analyticsPlugin = new AnalyticsPlugin({
  trackEvents: true,           // Auto-track all operations
  realTime: true,              // Enable real-time dashboard
  exportTo: 'bigquery',        // Export to BigQuery
  aggregationInterval: 3600000 // Aggregate hourly
});

await db.usePlugin(analyticsPlugin);

// Track custom event
await analyticsPlugin.track('user.signup', {
  userId: 'user123',
  plan: 'premium'
});
```

**Key features:**
- ✅ **Auto-tracking** - Automatic event capture for all operations
- ✅ **Custom metrics** - Define and track custom business metrics
- ✅ **Real-time** - Live dashboards and streaming analytics
- ✅ **Aggregations** - Pre-computed hourly/daily/monthly aggregates
- ✅ **Export** - Push to BigQuery, Snowflake, or Redshift
- ✅ **Query API** - Powerful filtering and grouping
- ✅ **Alerts** - Trigger webhooks on threshold breaches

**Performance comparison:**
```javascript
// ❌ Manual tracking (error-prone, inconsistent)
await resource.insert(data);
await fetch('https://analytics.service/track', { method: 'POST', ... });

// ✅ With AnalyticsPlugin (automatic, reliable)
await resource.insert(data); // Automatically tracked
```
```

### Step 4: Create Progressive Usage Journey

**7 levels of complexity:**

```markdown
## Usage Journey

### Level 1: Basic Event Tracking

Start tracking events automatically on every database operation.

```javascript
const analyticsPlugin = new AnalyticsPlugin({ trackEvents: true });
await db.usePlugin(analyticsPlugin);

// Every operation is now tracked
await resource.insert({ name: 'John' }); // → tracked
await resource.update(id, { age: 30 });  // → tracked
await resource.delete(id);               // → tracked
```

**What's happening:**
- Plugin intercepts all operations via method wrapping
- Events are stored in plugin storage (separate resource)
- No impact on your application performance

---

### Level 2: Custom Event Properties

Add custom properties to tracked events.

```javascript
const analyticsPlugin = new AnalyticsPlugin({
  trackEvents: true,
  enrichEvent: (event) => ({
    ...event,
    environment: process.env.NODE_ENV,
    server: os.hostname(),
    timestamp: Date.now()
  })
});
```

**New concepts:**
- `enrichEvent` hook adds properties to all events
- Useful for adding context (user ID, session, etc.)

---

[Continue through Level 7...]
```

### Step 5: Document All Configuration

Full template needs **complete** configuration object:

```javascript
new AnalyticsPlugin({
  // ============================================
  // SECTION 1: Event Tracking
  // ============================================
  trackEvents: true,              // Auto-track operations (default: false)
  trackInserts: true,             // Track insert events (default: true)
  trackUpdates: true,             // Track update events (default: true)
  trackDeletes: true,             // Track delete events (default: true)
  trackQueries: true,             // Track query events (default: true)

  // ============================================
  // SECTION 2: Custom Metrics
  // ============================================
  metrics: {
    enabled: true,                // Enable custom metrics (default: false)
    definitions: [],              // Metric definitions (default: [])
    computeInterval: 60000        // Compute interval in ms (default: 60000)
  },

  // [Continue for all sections...]
})
```

### Step 6: Add Comprehensive FAQ

Full template requires **20+ FAQ entries**:

```markdown
## ❓ FAQ

### General

**Q: Does AnalyticsPlugin impact database performance?**

A: No, events are tracked asynchronously after operations complete. Typical overhead is <5ms per operation.

[Continue for 19+ more questions across categories...]
```

---

## Before/After Comparison

### Before: Inconsistent Documentation

```markdown
# CachePlugin

This plugin caches stuff.

## Usage

```javascript
new CachePlugin({ ttl: 1000 })
```

## Options

- ttl - time to live
```

**Issues:**
- ❌ No navigation
- ❌ Incomplete configuration
- ❌ No examples
- ❌ No FAQ
- ❌ No quickstart
- ❌ No best practices

---

### After: Using Minimal Template

```markdown
# 💾 CachePlugin

> **Reduce S3 API calls by 90%+ with intelligent multi-tier caching for frequently accessed data.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

**Cache frequently accessed records in memory, filesystem, or S3 to dramatically reduce costs and improve performance.**

**1 line to get started:**
```javascript
await db.usePlugin(new CachePlugin({ driver: 'memory' }));
```

**Production-ready setup:**
```javascript
const cachePlugin = new CachePlugin({
  driver: 'memory',              // Cache driver (memory/filesystem/s3)
  ttl: 1800000,                  // 30 minutes
  maxMemoryPercent: 0.1,         // 10% of system memory
  enableCompression: true        // Compress cached values
});

await db.usePlugin(cachePlugin);

// Automatically cached
const user = await resource.get('user123'); // Cache MISS → S3 GET
const user2 = await resource.get('user123'); // Cache HIT → No S3 call
```

**Key features:**
- ✅ **Multi-tier** - Memory → Filesystem → S3 cache hierarchy
- ✅ **Automatic** - No code changes, just configure
- ✅ **TTL** - Automatic expiration with customizable TTL
- ✅ **Compression** - Optional compression for memory efficiency

**Performance comparison:**
```javascript
// ❌ Without cache
for (let i = 0; i < 1000; i++) {
  await resource.get('user123'); // 1000 S3 GET requests = $0.40
}

// ✅ With cache
for (let i = 0; i < 1000; i++) {
  await resource.get('user123'); // 1 S3 GET + 999 cache hits = $0.0004
}
// 99.9% cost reduction!
```

---

## 📑 Table of Contents

[All 12 sections listed...]

[Continue through all 12 sections with complete content...]
```

**Improvements:**
- ✅ Clear structure
- ✅ Complete navigation
- ✅ Working examples
- ✅ Performance data
- ✅ All 12 required sections
- ✅ FAQ (10+ entries)
- ✅ Best practices
- ✅ Error handling

---

## Common Mistakes to Avoid

### 1. Leaving Placeholders

❌ **Bad:**
```markdown
# {PLUGIN_EMOJI} {PLUGIN_NAME}

> **{ONE_LINE_DESCRIPTION}**
```

✅ **Good:**
```markdown
# 🔒 EncryptionPlugin

> **End-to-end encryption for sensitive data with automatic key rotation.**
```

---

### 2. Incomplete Code Examples

❌ **Bad:**
```javascript
new Plugin({ option1: value });
```

✅ **Good:**
```javascript
import { Database } from 's3db.js';
import { EncryptionPlugin } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://key:secret@bucket' });
const encryptionPlugin = new EncryptionPlugin({
  algorithm: 'aes-256-gcm',
  keyRotationDays: 90
});

await db.usePlugin(encryptionPlugin);
await db.connect();
```

---

### 3. Missing Navigation Links

❌ **Bad:**
```markdown
# Plugin Name

Content...
```

✅ **Good:**
```markdown
# 🔌 Plugin Name

> **Description**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [FAQ ↓](#-faq)

---
```

---

### 4. Vague Configuration Documentation

❌ **Bad:**
```javascript
new Plugin({
  timeout: 5000,  // timeout
  retries: 3      // retries
})
```

✅ **Good:**
```javascript
new Plugin({
  timeout: 5000,  // Request timeout in milliseconds (default: 5000)
  retries: 3,     // Max retry attempts on failure (default: 3)
  retryDelay: 1000 // Delay between retries in ms (default: 1000)
})
```

---

### 5. Sparse FAQ

❌ **Bad (only 3 questions):**
```markdown
## ❓ FAQ

**Q: How to use?**
A: Install and configure.

**Q: What does it do?**
A: It does stuff.

**Q: Is it fast?**
A: Yes.
```

✅ **Good (10+ detailed questions):**
```markdown
## ❓ FAQ

### General

**Q: How does caching improve performance?**

A: Caching eliminates redundant S3 API calls. For frequently accessed data:
- **Memory cache**: ~0.001ms access time vs 50-100ms for S3
- **90-99% cost reduction** on read-heavy workloads
- **Sub-millisecond response times** for cached data

```javascript
// Example: 1000 reads of same record
// Without cache: 1000 × $0.0004 = $0.40
// With cache: 1 × $0.0004 = $0.0004
// Savings: 99.9%
```

[9+ more detailed questions with code examples...]
```

---

### 6. No Error Handling Section

❌ **Bad:** Omitting error handling entirely

✅ **Good:**
```markdown
## 🚨 Error Handling

### Common Errors

#### CacheEvictionError

**Problem:** Cache is full and eviction policy cannot free space.

**Solution:**
```javascript
try {
  await resource.get(id);
} catch (error) {
  if (error.code === 'CACHE_EVICTION_ERROR') {
    // Increase cache size or reduce TTL
    cachePlugin.updateConfig({ maxMemoryPercent: 0.15 });
  }
}
```

[Document 5-10 common errors with solutions...]
```

---

### 7. Not Updating Plugin Index

After creating documentation, **always update** `docs/plugins/README.md`:

```markdown
## 💾 Caching & Performance

| Plugin | Badge | Description |
|--------|-------|-------------|
| **[CachePlugin](./cache.md)** | 🟢 | Multi-tier caching to reduce S3 calls by 90%+ |
```

---

## Tips for Efficiency

### 1. Use Find & Replace in Order

Process placeholders systematically:

```bash
# Step 1: Plugin name
:%s/{PLUGIN_NAME}/CompressionPlugin/g

# Step 2: Emoji
:%s/{PLUGIN_EMOJI}/🗜️/g

# Step 3: Description
:%s/{ONE_LINE_DESCRIPTION}/Automatically compress data before storing/g

# Step 4: Instance name
:%s/{pluginInstance}/compressionPlugin/g

# Step 5: Method names
:%s/{method}/compress/g
:%s/{advancedMethod}/setLevel/g
```

---

### 2. Start with TLDR and Configuration

These sections help you clarify the plugin's purpose:

1. Write TLDR first (forces you to articulate value)
2. Document configuration next (defines capabilities)
3. Build usage journey from simple to complex
4. Add FAQ as you write (note common questions)

---

### 3. Use Existing Plugins as Reference

Copy structure from similar plugins:

- **CachePlugin** → Good for simple plugins with clear purpose
- **ReplicatorPlugin** → Good for plugins with multiple drivers
- **PuppeteerPlugin** → Gold standard for complex plugins

---

### 4. Write FAQ as You Go

When you write a section and think "users might wonder X", immediately add to FAQ:

```markdown
<!-- While writing configuration section -->

**Q: Should I use memory or filesystem cache?**

A: Use memory for speed, filesystem for persistence:
- **Memory**: Fastest, lost on restart
- **Filesystem**: Persistent, survives restarts
- **Both**: Memory L1 + Filesystem L2 (best performance + persistence)
```

---

### 5. Test Your Code Examples

All code examples should be **runnable**:

```bash
# Extract examples from docs
grep -A 10 '```javascript' docs/plugins/cache.md > /tmp/test-cache.js

# Test them
node /tmp/test-cache.js
```

---

### 6. Use Templates for Sections

Create section templates for consistency:

**API Method Template:**
```markdown
#### `methodName(param1, param2?): Promise<ReturnType>`

Brief description of what this method does.

**Parameters:**
- `param1` (type, required): What it does
- `param2` (type, optional): What it does

**Returns:** `Promise<ReturnType>` - What it returns

**Example:**
```javascript
const result = await plugin.methodName('value', { option: true });
```

**Throws:**
- `ErrorType` - When this happens
```

Copy this template for each method.

---

### 7. Batch Similar Work

Group similar tasks:

1. **Find/replace session**: Replace all placeholders in one go
2. **Code example session**: Write all code examples
3. **FAQ session**: Write all FAQ entries
4. **Review session**: Check all links, formatting, completeness

More efficient than jumping between tasks.

---

## Quality Checklist

Before marking documentation as 🟢 Complete, verify:

### Structure

- [ ] All 12 required sections present in order
- [ ] Navigation links in header (Plugin Index, Configuration, FAQ)
- [ ] Table of contents with working anchor links
- [ ] Horizontal rules separating sections
- [ ] Consistent emoji usage throughout

### Content

- [ ] TLDR has one-sentence summary
- [ ] TLDR has "1 line to get started" example
- [ ] TLDR has "Production-ready setup" example
- [ ] TLDR has 4-7 key features listed
- [ ] Quickstart is complete and runnable (10-20 lines)
- [ ] All dependencies documented (required + optional)
- [ ] Usage Journey has 5-7 progressive levels (full) OR 3-5 patterns (minimal)
- [ ] Configuration Reference shows complete object with defaults
- [ ] Configuration Examples has 5-10 real-world scenarios
- [ ] API Reference documents all public methods
- [ ] API Reference documents all events
- [ ] Best Practices has Do's section (5-10 items)
- [ ] Best Practices has Don'ts section (5-10 items)
- [ ] Error Handling has common errors (5-10)
- [ ] Error Handling has troubleshooting scenarios (5-10)
- [ ] FAQ has minimum 10 entries (minimal) or 20+ (full)
- [ ] FAQ organized by categories (General, Advanced, Performance, Troubleshooting)

### Code Quality

- [ ] All code examples are syntactically correct
- [ ] All code examples are runnable (imports, setup, cleanup)
- [ ] Code examples show realistic usage
- [ ] No placeholder variables (use descriptive names)
- [ ] Inline comments explain complex code

### Accuracy

- [ ] All configuration options documented with correct defaults
- [ ] All configuration types correct (string, number, boolean, etc.)
- [ ] Method signatures accurate (parameters, return types)
- [ ] Error codes and messages accurate
- [ ] Performance claims backed by benchmarks or examples

### Polish

- [ ] No template comments left (`<!--`)
- [ ] No placeholder variables left (`{VARIABLE}`)
- [ ] No typos or grammar errors
- [ ] Consistent formatting throughout
- [ ] All links work (internal and external)
- [ ] Plugin added to `docs/plugins/README.md`
- [ ] Quality badge assigned (🟢🟡🔴)

### Final Validation

- [ ] Read through entire document as a first-time user
- [ ] Test at least one code example end-to-end
- [ ] Verify navigation works (click all links)
- [ ] Check that document renders correctly in markdown viewer
- [ ] Passes automated linter (if available)

---

## Next Steps

Once documentation is complete:

1. **Submit for review** - Have another developer review against checklist
2. **Update plugin index** - Add to `docs/plugins/README.md` with badge
3. **Link from main README** - Ensure discoverability
4. **Announce** - Share in changelog, release notes, or documentation updates

