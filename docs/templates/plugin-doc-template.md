<!--
PLUGIN DOCUMENTATION TEMPLATE - FULL VERSION
==============================================

HOW TO USE THIS TEMPLATE:
1. Copy this entire file to ./docs/plugins/{your-plugin-name}.md
2. Search for {PLACEHOLDERS} and replace with actual content
3. Remove all comments (lines starting with <!--)
4. Fill in all sections with your plugin's details
5. Use the quality checklist at the end to verify completeness

PLACEHOLDER FORMAT:
- {PLUGIN_NAME} - Your plugin name (e.g., "CachePlugin")
- {PLUGIN_EMOJI} - Emoji representing your plugin (see standard doc for guidelines)
- {DESCRIPTION} - One-line description (max 100 characters)
- {FEATURE_N} - Feature names/descriptions

REFERENCE:
- Standard: ../plugin-docs-standard.md
- Gold Standard: ../plugins/puppeteer.md
- Minimal Template: ./plugin-doc-minimal.md

TIPS:
- All code examples must be complete and runnable
- Include inline comments explaining options
- Use realistic variable names and values
- Reference actual file paths and line numbers where helpful
- Keep descriptions concise but complete

Delete this entire comment block before publishing!
-->

# {PLUGIN_EMOJI} {PLUGIN_NAME}

> **{DESCRIPTION}**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

**{One-sentence summary of what this plugin does and its primary use case.}**

**1 line to get started:**
```javascript
await db.usePlugin(new {PLUGIN_NAME}({ /* minimal essential config */ }));
```

**Production-ready setup:**
```javascript
await db.usePlugin(new {PLUGIN_NAME}({
  option1: 'value',              // Brief explanation of what this does
  option2: true,                 // Brief explanation of what this enables
  option3: {                     // Nested options
    subOption: 100               // Brief explanation
  }
}));

// Typical usage example
const result = await {pluginInstance}.{typicalMethod}();
console.log(result);
```

**Key features:**
- ✅ **{FEATURE_1}** - {Brief description of feature 1}
- ✅ **{FEATURE_2}** - {Brief description of feature 2}
- ✅ **{FEATURE_3}** - {Brief description of feature 3}
- ✅ **{FEATURE_4}** - {Brief description of feature 4}
- ✅ **{FEATURE_5}** - {Brief description of feature 5} (optional: add more)

**Performance comparison:** <!--Optional but recommended-->
```javascript
// ❌ Without {PLUGIN_NAME}
// {Show inefficient or problematic code}
{codeExample}
// Result: {metrics showing problem}

// ✅ With {PLUGIN_NAME}
// {Show optimized code with plugin}
{codeExample}
// Result: {metrics showing improvement - e.g., "70% faster", "50% less memory"}
```

---

## 📑 Table of Contents

1. [⚡ TLDR](#-tldr)
2. [⚡ Quickstart](#-quickstart)
3. [📦 Dependencies](#-dependencies)
4. [Usage Journey](#usage-journey) <!--OR: [Usage Patterns](#usage-patterns)-->
   - [Level 1: Basic Usage](#level-1-basic-usage)
   - [Level 2: Intermediate Feature](#level-2-intermediate-feature)
   - [Level 3: Advanced Feature](#level-3-advanced-feature)
   - [Level 4: Complex Scenario](#level-4-complex-scenario)
   - [Level 5: Production Setup](#level-5-production-setup)
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

const db = new Database({
  connectionString: 's3://key:secret@bucket/path'
});

// Create plugin with essential options only
const {pluginInstance} = new {PLUGIN_NAME}({
  option1: 'value',     // Essential option - what it does
  option2: true         // Essential option - what it enables
});

await db.usePlugin({pluginInstance});
await db.connect();

// Basic usage - demonstrate core functionality
const result = await {pluginInstance}.{coreMethod}();
console.log('Result:', result);

// Cleanup
await db.disconnect();
```

---

## 📦 Dependencies

**Required Peer Dependencies:**
```bash
pnpm install {dependency-1} {dependency-2}
```

| Dependency | Version | Purpose | Optional |
|------------|---------|---------|----------|
| `{dependency-1}` | `^{X.Y.Z}` | {Why this is needed - core functionality} | No |
| `{dependency-2}` | `^{X.Y.Z}` | {Why this is needed - specific feature} | Yes <!--or No--> |

**Why these dependencies?**
- **{dependency-1}**: Provides {specific capability that plugin needs}
- **{dependency-2}**: Enables {specific feature} (optional for {use case})

**Documentation:**
- {dependency-1}: {https://link-to-docs}
- {dependency-2}: {https://link-to-docs}

---

## Usage Journey

<!--NOTE: Choose "Usage Journey" (progressive levels) OR "Usage Patterns" (use cases).
     Usage Journey is better for teaching progressive concepts.
     Usage Patterns is better for showing specific scenarios.
     Delete the one you DON'T use.-->

### Level 1: Basic {Feature}

{Brief explanation of what this level demonstrates and why it's the starting point.}

```javascript
import { Database } from 's3db.js';
import { {PLUGIN_NAME} } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://key:secret@bucket/path' });

// Minimal configuration
const {pluginInstance} = new {PLUGIN_NAME}({
  option1: 'value'       // Only essential option
});

await db.usePlugin({pluginInstance});
await db.connect();

// Basic usage
const result = await {pluginInstance}.{method}();
console.log(result);

await db.disconnect();
```

**What's happening:**
- {Point 1 - what the code does}
- {Point 2 - key concept being demonstrated}
- {Point 3 - important detail to understand}

---

### Level 2: Intermediate {Feature}

{Building on Level 1, explain what new concept/feature this level adds.}

```javascript
// Continuing from Level 1, now adding {new feature}
const {pluginInstance} = new {PLUGIN_NAME}({
  option1: 'value',
  option2: true          // NEW: Enable {feature}
});

await db.usePlugin({pluginInstance});
await db.connect();

// Use the new feature
const result = await {pluginInstance}.{newMethod}({
  parameter: 'value'
});
console.log(result);
```

**New concepts:**
- {Concept 1 - what's new in this level}
- {Concept 2 - how it builds on previous level}
- {Concept 3 - why you'd use this}

---

### Level 3: Advanced {Feature}

{Continue building complexity. What does this level teach?}

```javascript
// Adding more sophisticated configuration
const {pluginInstance} = new {PLUGIN_NAME}({
  option1: 'value',
  option2: true,
  advanced: {           // NEW: Advanced options
    setting1: 100,
    setting2: 'auto'
  }
});

// More complex usage
const results = await Promise.all([
  {pluginInstance}.{method1}(),
  {pluginInstance}.{method2}()
]);
```

**New concepts:**
- {Advanced concept 1}
- {Advanced concept 2}
- {When to use these features}

---

### Level 4: Complex Scenario

{Real-world complex scenario. What problem does this solve?}

```javascript
// Production-like setup with multiple features
const {pluginInstance} = new {PLUGIN_NAME}({
  option1: 'value',
  option2: true,
  advanced: { setting1: 100 },
  features: {           // NEW: Feature toggles
    feature1: true,
    feature2: { enabled: true, config: 'value' }
  }
});

// Handle complex scenario
try {
  const result = await {pluginInstance}.{complexMethod}({
    param1: 'value',
    param2: { nested: 'config' }
  });

  // Process result
  if (result.success) {
    console.log('Success:', result.data);
  }
} catch (error) {
  console.error('Error:', error.message);
}
```

**New concepts:**
- {Complex concept 1}
- {Complex concept 2}
- {Error handling patterns}

---

### Level 5: Production Setup

{Production-ready configuration with all best practices.}

```javascript
// Complete production configuration
const {pluginInstance} = new {PLUGIN_NAME}({
  // Core options
  option1: process.env.{ENV_VAR} || 'default',
  option2: true,

  // Advanced features
  advanced: {
    setting1: 100,
    setting2: 'auto'
  },

  // Feature configuration
  features: {
    feature1: true,
    feature2: { enabled: true, config: 'production' }
  },

  // Monitoring
  monitoring: {
    enabled: true,
    metrics: ['metric1', 'metric2']
  },

  // Error handling
  onError: (error) => {
    console.error('[{PLUGIN_NAME}]', error);
    // Send to monitoring service
  }
});

await db.usePlugin({pluginInstance});
await db.connect();

// Production usage with full error handling and monitoring
try {
  const result = await {pluginInstance}.{method}();

  // Log metrics
  const metrics = {pluginInstance}.getMetrics();
  console.log('Metrics:', metrics);

  return result;
} catch (error) {
  // Handle error
  console.error('Operation failed:', error);
  throw error;
} finally {
  // Cleanup if needed
}
```

**Production considerations:**
- {Consideration 1 - e.g., environment variables}
- {Consideration 2 - e.g., monitoring and metrics}
- {Consideration 3 - e.g., error handling}
- {Consideration 4 - e.g., resource cleanup}

---

## 📊 Configuration Reference

Complete configuration object with all available options:

```javascript
new {PLUGIN_NAME}({
  // ============================================
  // SECTION 1: Core Options
  // ============================================
  option1: 'default',            // {Description} (default: 'default')
  option2: true,                 // {Description} (default: true)
  option3: 100,                  // {Description} (default: 100)

  // ============================================
  // SECTION 2: Feature Configuration
  // ============================================
  features: {
    feature1: {
      enabled: true,             // {Description} (default: true)
      config: 'value'            // {Description} (default: 'value')
    },
    feature2: {
      enabled: false,            // {Description} (default: false)
      options: {
        subOption1: 10,          // {Description} (default: 10)
        subOption2: 'auto'       // {Description} (default: 'auto')
      }
    }
  },

  // ============================================
  // SECTION 3: Advanced Options
  // ============================================
  advanced: {
    setting1: 100,               // {Description} (default: 100)
    setting2: 'auto',            // {Description} (default: 'auto')
    setting3: {
      nested: true               // {Description} (default: true)
    }
  },

  // ============================================
  // SECTION 4: Monitoring & Events
  // ============================================
  monitoring: {
    enabled: false,              // {Description} (default: false)
    metrics: []                  // {Description} (default: [])
  },

  // Event handlers
  onEvent: (data) => {},         // {Description of when called}
  onError: (error) => {}         // {Description of error handling}
})
```

**Detailed Options Table:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `option1` | string | `'default'` | {Complete description of what this option does} |
| `option2` | boolean | `true` | {Complete description} |
| `option3` | number | `100` | {Complete description with units/limits} |
| `features.feature1.enabled` | boolean | `true` | {When to enable this feature} |
| `features.feature1.config` | string | `'value'` | {Configuration options for feature1} |
| `advanced.setting1` | number | `100` | {Advanced configuration details} |
| `advanced.setting2` | string | `'auto'` | {Possible values: 'auto', 'manual', 'custom'} |

---

## 📚 Configuration Examples

### Use Case 1: {Scenario Name}

{Brief description of when to use this configuration and what problem it solves.}

```javascript
new {PLUGIN_NAME}({
  option1: 'specific-value',   // Why this value for this scenario
  option2: true,               // Why enabled for this scenario
  features: {
    feature1: {
      enabled: true,
      config: 'scenario-specific'
    }
  }
})
```

**Why this configuration:**
- {Reason 1 - why these specific options}
- {Reason 2 - what it enables}
- {When to use - specific use case}

---

### Use Case 2: {Another Scenario}

{Description of this scenario.}

```javascript
new {PLUGIN_NAME}({
  // Different configuration for different needs
  option1: 'different-value',
  option2: false,
  advanced: {
    setting1: 200              // Increased for this use case
  }
})
```

**Why this configuration:**
- {Reason 1}
- {Reason 2}
- {When to use}

---

### Use Case 3-10: {Continue for 5-10 total scenarios}

<!--Repeat the pattern above for 5-10 common use cases total-->

---

## 🔧 API Reference

### Plugin Methods

#### `methodName(param1, param2?): Promise<ReturnType>`

{Complete description of what this method does, when to use it, and what it returns.}

**Parameters:**
- `param1` (Type, required): {Description of parameter, valid values, constraints}
- `param2` (Type, optional): {Description of optional parameter, defaults}

**Returns:** `Promise<ReturnType>` - {Description of return value structure}

**Example:**
```javascript
const result = await {pluginInstance}.methodName('value', {
  option: true
});
console.log(result);
// Output: { field1: 'value', field2: 123 }
```

**Throws:**
- `ErrorType` - When {specific condition that causes error}
- `AnotherError` - When {another error condition}

---

#### `{Continue for all public methods}`

<!--Document every public method with the same structure above-->

---

### Events

#### `event.name`

Emitted when {condition that triggers this event}.

**Payload:**
```javascript
{
  field1: 'value',     // {Description of field}
  field2: 123,         // {Description of field}
  timestamp: Date      // {When event occurred}
}
```

**Example:**
```javascript
{pluginInstance}.on('event.name', ({ field1, field2, timestamp }) => {
  console.log(`Event triggered: ${field1} at ${timestamp}`);
});
```

---

#### `{Continue for all events}`

<!--Document all events with payload structure-->

---

## ✅ Best Practices

### Do's ✅

1. **{Practice 1 Name}**
   ```javascript
   // ✅ Good - {why this is the right way}
   const result = await {pluginInstance}.method({
     option: 'correct-value'
   });
   ```

2. **{Practice 2 Name}**
   ```javascript
   // ✅ Good - {explanation}
   try {
     const result = await {pluginInstance}.method();
     // Handle success
   } catch (error) {
     // Handle error properly
   }
   ```

3. **{Continue for 5-10 practices}**

---

### Don'ts ❌

1. **{Anti-Pattern 1 Name}**
   ```javascript
   // ❌ Bad - {why this is wrong}
   const result = {pluginInstance}.badPattern();

   // ✅ Correct - {how to do it right}
   const result = await {pluginInstance}.goodPattern();
   ```

2. **{Anti-Pattern 2 Name}**
   ```javascript
   // ❌ Bad - {explanation of problem}
   {pluginInstance}.method(); // Forgot await

   // ✅ Correct - {proper way}
   await {pluginInstance}.method();
   ```

3. **{Continue for 5-10 anti-patterns}**

---

### Performance Tips

- **Tip 1**: {Description of optimization} - {Impact: "30% faster", "50% less memory", etc.}
- **Tip 2**: {Another optimization technique} - {Measured impact}
- **Tip 3**: {Performance best practice} - {Why it matters}

---

### Security Considerations

- **Warning 1**: {Security concern to be aware of} - {Why it matters}
- **Best Practice 1**: {How to handle security properly} - {Example}
- **Warning 2**: {Another security consideration} - {Mitigation}

---

## 🚨 Error Handling

### Common Errors

#### Error 1: {ERROR_NAME}

**Problem:** {What causes this error to occur.}

**Error message:**
```
Error: {Actual error message text}
at {stack trace sample}
```

**Solution:**
```javascript
try {
  await {pluginInstance}.method();
} catch (error) {
  if (error.code === '{ERROR_CODE}') {
    // Handle this specific error
    console.error('Specific handling:', error.message);
    // Take corrective action
  }
}
```

**Prevention:**
- {How to avoid this error}
- {What to check before calling}

---

#### Error 2-10: {Continue for 5-10 common errors}

<!--Document common errors with solutions-->

---

### Troubleshooting

#### Issue 1: {Symptom Description}

**Diagnosis:**
1. Check {thing to verify}
2. Verify {another check}
3. Confirm {final check}

**Fix:**
```javascript
// Solution code
{pluginInstance}.{fixMethod}({
  correctedOption: 'value'
});
```

---

#### Issue 2-10: {Continue for 5-10 troubleshooting scenarios}

---

## 🔗 See Also

- [{Related Plugin Name}](./{related-plugin}.md) - {How they work together}
- [{Another Related Plugin}](./{another-plugin}.md) - {Relationship}
- [{Core Concept}](../concepts/{concept}.md) - {Background information}
- [{Working Example}](../examples/e{XX}-{example-name}.js) - {Implementation}

**Related Documentation:**
- {External docs}: {https://link}
- {Tutorial}: {https://link}

---

## ❓ FAQ

### General

**Q: {Common basic question about usage}**

A: {Clear, concise answer with example if helpful.}

```javascript
// Example demonstrating the answer
const result = await {pluginInstance}.method();
```

---

**Q: {Another common question}**

A: {Answer with explanation.}

---

### Advanced

**Q: {Complex technical question}**

A: {Detailed technical answer explaining concepts.}

```javascript
// Code example showing advanced usage
```

---

**Q: {Another advanced question}**

A: {Technical answer.}

---

### Performance

**Q: {Question about performance/optimization}**

A: {Answer with metrics or benchmarks if available.}

**Benchmark:**
- Without optimization: {metric}
- With optimization: {metric}
- Improvement: {percentage}

---

**Q: {Another performance question}**

A: {Answer.}

---

### Troubleshooting

**Q: {Common problem question}**

A: {Diagnostic steps and solution.}

**Steps:**
1. {Check this}
2. {Verify that}
3. {Solution}

---

**Q: {Another troubleshooting question}**

A: {Solution.}

---

<!--CONTINUE FAQ for minimum 10-20 questions total across all categories-->

---

## Quality Checklist

Use this to verify your documentation is complete:

- [ ] All placeholders {VARIABLE} replaced with actual content
- [ ] All 12 required sections present
- [ ] Code examples are complete and runnable
- [ ] All configuration options documented
- [ ] All public methods in API reference
- [ ] Minimum 10 FAQ entries (prefer 20+)
- [ ] Navigation links work
- [ ] Examples show real-world usage
- [ ] Error handling documented
- [ ] Best practices included with examples
- [ ] No TODO or incomplete sections
- [ ] Formatting is consistent
- [ ] Passes markdown linting

---

**Documentation Template Version:** 1.0.0
**Standard Reference:** [../plugin-docs-standard.md](../plugin-docs-standard.md)
**Gold Standard Example:** [../plugins/puppeteer.md](../plugins/puppeteer.md)
