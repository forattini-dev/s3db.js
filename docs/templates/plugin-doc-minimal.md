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

WHEN TO USE:
- Plugin has less than 5 major features
- Less than 20 configuration options
- Straightforward usage patterns
- Can document completely in under 1000 lines

If your plugin is more complex, use plugin-doc-template.md instead.

Delete this comment before publishing!
-->

# {PLUGIN_EMOJI} {PLUGIN_NAME}

> **Language note**: All published documentation must be in English.

> **{ONE_LINE_DESCRIPTION}**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

**{One-sentence summary}**

**1 line to get started:**
```javascript
await db.usePlugin(new {PLUGIN_NAME}());
```

**Production setup:**
```javascript
await db.usePlugin(new {PLUGIN_NAME}({
  option1: 'value',      // {Explanation}
  option2: true          // {Explanation}
}));

const result = await {pluginInstance}.{method}();
```

**Key features:**
- ✅ **{FEATURE_1}** - {Brief description}
- ✅ **{FEATURE_2}** - {Brief description}
- ✅ **{FEATURE_3}** - {Brief description}

---

## 📑 Table of Contents

1. [⚡ TLDR](#-tldr)
2. [⚡ Quickstart](#-quickstart)
3. [📦 Dependencies](#-dependencies)
4. [Usage Patterns](#usage-patterns)
5. [📊 Configuration Reference](#-configuration-reference)
6. [📚 Configuration Examples](#-configuration-examples)
7. [🔧 API Reference](#-api-reference)
8. [✅ Best Practices](#-best-practices)
9. [🚨 Error Handling](#-error-handling)
10. [🔗 See Also](#-see-also)
11. [❓ FAQ](#-faq)

---

## ⚡ Quickstart

```javascript
import { Database } from 's3db.js';
import { {PLUGIN_NAME} } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://key:secret@bucket/path' });

const {pluginInstance} = new {PLUGIN_NAME}({
  option1: 'value'
});

await db.usePlugin({pluginInstance});
await db.connect();

// Basic usage
const result = await {pluginInstance}.{method}();
console.log(result);

await db.disconnect();
```

---

## 📦 Dependencies

**Required:**
```bash
pnpm install {dependency-1}
```

**Optional:** {dependency-2} (for {feature})

---

## Usage Patterns

### Pattern 1: Basic Usage

```javascript
const {pluginInstance} = new {PLUGIN_NAME}({ option1: 'value' });
await db.usePlugin({pluginInstance});

const result = await {pluginInstance}.{method}();
```

---

### Pattern 2: Advanced Usage

```javascript
const {pluginInstance} = new {PLUGIN_NAME}({
  option1: 'value',
  option2: true,
  advanced: { setting: 100 }
});

const result = await {pluginInstance}.{advancedMethod}({ param: 'value' });
```

---

### Pattern 3: Production Setup

```javascript
const {pluginInstance} = new {PLUGIN_NAME}({
  option1: process.env.{VAR} || 'default',
  option2: true,
  onError: (error) => console.error(error)
});

try {
  const result = await {pluginInstance}.{method}();
  return result;
} catch (error) {
  // Handle error
}
```

---

## 📊 Configuration Reference

```javascript
new {PLUGIN_NAME}({
  // Core options
  option1: 'default',        // {Description} (default: 'default')
  option2: true,             // {Description} (default: true)

  // Advanced
  advanced: {
    setting1: 100,           // {Description} (default: 100)
    setting2: 'auto'         // {Description} (default: 'auto')
  },

  // Events
  onEvent: (data) => {},     // {When called}
  onError: (error) => {}     // {Error handling}
})
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `option1` | string | `'default'` | {What it does} |
| `option2` | boolean | `true` | {What it controls} |
| `advanced.setting1` | number | `100` | {Purpose} |

---

## 📚 Configuration Examples

### Example 1: {Scenario}

```javascript
new {PLUGIN_NAME}({
  option1: 'specific-value',
  option2: true
})
```

---

### Example 2: {Another Scenario}

```javascript
new {PLUGIN_NAME}({
  option1: 'different',
  advanced: { setting1: 200 }
})
```

---

## 🔧 API Reference

### `methodName(param): Promise<ReturnType>`

{Description of what method does.}

**Parameters:**
- `param` (Type): {Description}

**Returns:** `Promise<ReturnType>`

**Example:**
```javascript
const result = await {pluginInstance}.methodName('value');
```

---

### `{Document other public methods}`

---

### Events

#### `event.name`

Emitted when {condition}.

**Payload:** `{ field1, field2 }`

```javascript
{pluginInstance}.on('event.name', (data) => {
  console.log(data);
});
```

---

## ✅ Best Practices

### Do's ✅

1. **{Practice 1}**
   ```javascript
   // ✅ Good
   await {pluginInstance}.method();
   ```

2. **{Practice 2}**
3. **{Practice 3}**

### Don'ts ❌

1. **{Anti-pattern 1}**
   ```javascript
   // ❌ Bad
   {pluginInstance}.badMethod();

   // ✅ Correct
   await {pluginInstance}.goodMethod();
   ```

2. **{Anti-pattern 2}**
3. **{Anti-pattern 3}**

### Performance

- {Tip 1} - {Impact}
- {Tip 2} - {Impact}

### Security

- {Warning 1} - {Why it matters}
- {Best practice 1}

---

## 🚨 Error Handling

### Common Errors

#### {ERROR_NAME}

**Problem:** {What causes it}

**Solution:**
```javascript
try {
  await {pluginInstance}.method();
} catch (error) {
  if (error.code === '{CODE}') {
    // Handle
  }
}
```

---

### Troubleshooting

#### {Issue}: {Symptom}

**Fix:**
1. Check {X}
2. Verify {Y}
3. Run {Z}

---

## 🔗 See Also

- [{Related Plugin}](./{plugin}.md) - {How they relate}
- [{Example}](../examples/e{XX}-{name}.js) - {Implementation}

---

## ❓ FAQ

### General

**Q: {Common question 1}?**

A: {Answer}

---

**Q: {Common question 2}?**

A: {Answer}

---

### Advanced

**Q: {Advanced question}?**

A: {Answer with example}

```javascript
// Example
```

---

### Performance

**Q: {Performance question}?**

A: {Answer with metrics}

---

### Troubleshooting

**Q: {Problem question}?**

A: {Diagnostic steps and solution}

---

**{Continue for minimum 10 FAQ entries total}**

---

## Quality Checklist

- [ ] All {PLACEHOLDERS} replaced
- [ ] All 12 sections present
- [ ] Code examples work
- [ ] 10+ FAQ entries
- [ ] Configuration documented
- [ ] API methods documented
- [ ] Navigation links work

---

**Standard:** [../plugin-docs-standard.md](../plugin-docs-standard.md)
**Full Template:** [./plugin-doc-template.md](./plugin-doc-template.md)
