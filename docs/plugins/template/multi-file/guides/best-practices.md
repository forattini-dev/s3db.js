# ✅ Best Practices, Tips & Troubleshooting

**Prev:** [Usage Patterns](./usage-patterns.md)
**Main:** [README](../README.md) | **All guides:** [Index](../README.md#-documentation-index)

> **In this guide:**
> - Best practices and tips
> - Common mistakes to avoid
> - Troubleshooting common problems
> - Performance optimization
> - Frequently asked questions

**Time to read:** 15 minutes
**Difficulty:** Intermediate

---

## 🎯 Best Practices

### Practice 1: Always use async/await

```javascript
// ✅ Good - clear async flow
async function processData(items) {
  const results = [];
  for (const item of items) {
    const result = await db.myPlugin.doSomething(item);
    results.push(result);
  }
  return results;
}

// ❌ Avoid - callback hell
db.myPlugin.doSomething(item, (result) => {
  // Hard to read and maintain
});
```

**Why:** Makes code more readable, easier to error handle, matches modern JavaScript patterns.

---

### Practice 2: Set appropriate timeouts

```javascript
// ✅ Good - tailored timeout for operation
async function slowOperation() {
  return db.myPlugin.doSomething('large-data', {
    timeout: 30000  // 30 seconds for slow operation
  });
}

async function fastOperation() {
  return db.myPlugin.doSomething('small-data', {
    timeout: 2000   // 2 seconds for quick operation
  });
}
```

**Why:** Timeout too short = failures. Too long = slow error detection. Match your operation type.

---

### Practice 3: Batch operations efficiently

```javascript
// ✅ Good - parallel processing
async function processMany(items) {
  return Promise.all(
    items.map(item => db.myPlugin.doSomething(item))
  );
}

// ✅ Also good - with concurrency limit
const pLimit = require('p-limit');
const limit = pLimit(10);  // Max 10 at a time

async function processManyConcurrent(items) {
  return Promise.all(
    items.map(item => limit(() => db.myPlugin.doSomething(item)))
  );
}

// ❌ Avoid - sequential (slow!)
async function processSequential(items) {
  for (const item of items) {
    await db.myPlugin.doSomething(item);  // One at a time
  }
}
```

**Why:** Parallel processing uses resources better, finishes faster.

---

### Practice 4: Monitor plugin health

```javascript
// ✅ Good - regular health checks
setInterval(() => {
  const status = db.myPlugin.getStatus();

  if (!status.enabled) {
    console.error('Plugin disabled!');
  }

  if (status.operations.failed > 0) {
    console.warn(`${status.operations.failed} failed operations`);
  }

  const successRate = status.operations.successful / status.operations.total;
  if (successRate < 0.95) {
    console.warn(`Low success rate: ${(successRate * 100).toFixed(2)}%`);
  }
}, 60000);  // Check every minute
```

**Why:** Catch problems before users notice them.

---

### Practice 5: Use TypeScript for safety

```typescript
// ✅ Good - types prevent mistakes
import { Database, MyPluginResult } from 's3db.js';

async function processData(input: string): Promise<MyPluginResult> {
  const result = await db.myPlugin.doSomething(input);
  return result;  // Type-checked
}

// ❌ Avoid - no type safety
async function processData(input) {
  const result = await db.myPlugin.doSomething(input);
  return result.foo;  // Might not exist!
}
```

**Why:** Catch mistakes at compile-time, not runtime.

---

## 🔥 Pro Tips

### Tip 1: Cache strategically

```javascript
// ✅ Cache reads (data doesn't change often)
const db = new Database({
  plugins: [{
    name: 'my-plugin',
    config: { cacheResults: true }
  }]
});

// But bypass cache for fresh data
const fresh = await db.myPlugin.doSomething('key', { force: true });
```

### Tip 2: Increase retries for unreliable networks

```javascript
// ✅ For unreliable connections
const db = new Database({
  plugins: [{
    name: 'my-plugin',
    config: { retries: 10 }  // Retry up to 10 times
  }]
});
```

### Tip 3: Use environment variables

```javascript
// ✅ Different configs per environment
const config = {
  timeout: process.env.PLUGIN_TIMEOUT || '5000',
  retries: process.env.PLUGIN_RETRIES || '3'
};

const db = new Database({
  plugins: [{
    name: 'my-plugin',
    config
  }]
});
```

### Tip 4: Log operations for debugging

```javascript
// ✅ Helpful logging
async function doOperation(input) {
  console.time('operation');

  try {
    const result = await db.myPlugin.doSomething(input);
    console.log(`Success: ${result.data}`);
    return result;
  } catch (error) {
    console.error(`Failed: ${error.code}`, error.message);
    throw error;
  } finally {
    console.timeEnd('operation');
  }
}
```

### Tip 5: Graceful degradation

```javascript
// ✅ Provide fallback if plugin fails
async function doWithFallback(input) {
  try {
    return await db.myPlugin.doSomething(input);
  } catch (error) {
    console.warn('Plugin failed, using fallback');
    return getFallbackValue(input);  // Hardcoded fallback
  }
}
```

---

## ⚠️ Common Mistakes

### Mistake 1: Forgetting await

```javascript
// ❌ Wrong - Promise not awaited
const result = db.myPlugin.doSomething('input');
console.log(result.data);  // Undefined!

// ✅ Correct
const result = await db.myPlugin.doSomething('input');
console.log(result.data);  // Works
```

**Fix:** Always use `await` for async methods.

---

### Mistake 2: Not handling errors

```javascript
// ❌ Wrong - errors silently fail
await db.myPlugin.doSomething('input');

// ✅ Correct
try {
  await db.myPlugin.doSomething('input');
} catch (error) {
  console.error('Operation failed:', error);
}
```

**Fix:** Wrap in try/catch or add `.catch()` handler.

---

### Mistake 3: Timeout too short

```javascript
// ❌ Wrong - 100ms timeout is way too short
const db = new Database({
  plugins: [{
    name: 'my-plugin',
    config: { timeout: 100 }
  }]
});

// ✅ Correct - reasonable timeout
const db = new Database({
  plugins: [{
    name: 'my-plugin',
    config: { timeout: 5000 }  // 5 seconds
  }]
});
```

**Fix:** Use 5-30 seconds depending on operation type.

---

### Mistake 4: Sequential instead of parallel

```javascript
// ❌ Wrong - processes one at a time (slow)
for (const item of items) {
  await db.myPlugin.doSomething(item);
}

// ✅ Correct - processes in parallel (fast)
await Promise.all(
  items.map(item => db.myPlugin.doSomething(item))
);
```

**Fix:** Use `Promise.all()` or `Promise.allSettled()` for parallel processing.

---

### Mistake 5: Creating plugin multiple times

```javascript
// ❌ Wrong - creates plugin twice
const db = new Database({
  plugins: [{ name: 'my-plugin', config: {...} }]
});

db.usePlugin(new MyPlugin());  // Don't do this

// ✅ Correct - create once in Database constructor
const db = new Database({
  plugins: [{ name: 'my-plugin', config: {...} }]
});
```

**Fix:** Pass plugin config to Database constructor only.

---

## 🔧 Troubleshooting

### Error: "Plugin is disabled"

**Symptom:** Getting `PLUGIN_DISABLED` error

**Causes:**
1. Plugin config has `enabled: false`
2. Database not connected yet
3. Plugin crashed during initialization

**Solutions:**

```javascript
// Check 1: Config is correct
const config = {
  enabled: true  // Make sure this is true
};

// Check 2: Database is connected
await db.connect();  // Must call this first

// Check 3: Plugin initialized
const status = db.myPlugin.getStatus();
console.log('Enabled:', status.enabled);  // Should be true
```

---

### Error: "Operation timed out"

**Symptom:** Getting `TIMEOUT` error, operation takes too long

**Causes:**
1. Timeout is too short for the operation
2. Network is slow
3. Operation is genuinely slow

**Solutions:**

```javascript
// Solution 1: Increase timeout
const result = await db.myPlugin.doSomething('input', {
  timeout: 30000  // Increase from default 5000
});

// Solution 2: Check network
console.time('operation');
const result = await db.myPlugin.doSomething('input');
console.timeEnd('operation');  // See how long it really takes

// Solution 3: Use different config for slow operations
const slowConfig = {
  timeout: 60000,  // 60 seconds for slow ops
  retries: 1       // Don't retry slow ops
};
db.myPlugin.setConfig(slowConfig);
```

---

### Error: "Invalid input"

**Symptom:** Getting `INVALID_INPUT` error, validation fails

**Causes:**
1. Wrong data type (string instead of number, etc.)
2. Missing required fields
3. Value out of valid range

**Solutions:**

```javascript
// Check input types
const input = 'hello';  // Must be string
const result = await db.myPlugin.doSomething(input);

// Validate before sending
if (typeof input !== 'string') {
  throw new Error('Input must be a string');
}

// Check field requirements
const options = {
  fieldA: 'required',  // Required
  fieldB: 42          // Optional
};
const result = await db.myPlugin.doAnother(options);
```

---

### Performance: Operations are slow

**Symptom:** Operations take longer than expected

**Causes:**
1. Processing sequentially instead of parallel
2. Timeout too long
3. Cache disabled
4. Batch size too small

**Solutions:**

```javascript
// Solution 1: Use parallel processing
await Promise.all(
  items.map(item => db.myPlugin.doSomething(item))
);

// Solution 2: Enable cache
db.myPlugin.setConfig({ cacheResults: true });

// Solution 3: Increase batch size
db.myPlugin.setConfig({ batchSize: 500 });

// Solution 4: Monitor performance
console.time('bulk');
const results = await Promise.all(
  items.map(item => db.myPlugin.doSomething(item))
);
console.timeEnd('bulk');
```

---

### Memory usage: Plugin uses too much memory

**Symptom:** Memory grows with each operation

**Causes:**
1. Results cache growing unbounded
2. Batch size too large
3. Large datasets

**Solutions:**

```javascript
// Solution 1: Disable cache
db.myPlugin.setConfig({ cacheResults: false });

// Solution 2: Reduce batch size
db.myPlugin.setConfig({ batchSize: 10 });

// Solution 3: Process in chunks
const chunkSize = 100;
for (let i = 0; i < items.length; i += chunkSize) {
  const chunk = items.slice(i, i + chunkSize);
  await Promise.all(
    chunk.map(item => db.myPlugin.doSomething(item))
  );
}
```

---

## ❓ FAQ

### Q: Do I need to install anything else?

**A:** No! The plugin is built into s3db.js. Just install `s3db.js` and you're good to go.

```bash
pnpm install s3db.js
```

---

### Q: Can I use multiple plugin instances?

**A:** Yes, with namespaces:

```javascript
const db = new Database({
  plugins: [
    {
      name: 'my-plugin',
      namespace: 'instance-1',
      config: {...}
    },
    {
      name: 'my-plugin',
      namespace: 'instance-2',
      config: {...}
    }
  ]
});

// Use both
await db.getPlugin('my-plugin', 'instance-1').doSomething('a');
await db.getPlugin('my-plugin', 'instance-2').doSomething('b');
```

---

### Q: How do I disable the plugin temporarily?

**A:** Use the `enabled` config:

```javascript
db.myPlugin.setConfig({ enabled: false });

// Later, re-enable
db.myPlugin.setConfig({ enabled: true });
```

---

### Q: What's the performance impact?

**A:** Minimal for simple operations:
- Single operation: <1ms overhead
- Batch of 1000: <100ms total

Cache enabled reduces repeat operations to <0.1ms.

---

### Q: Can I use this in serverless (Lambda, Cloudflare)?

**A:** Yes! Just:
1. Initialize plugin in cold start
2. Keep connection warm
3. Clean up on exit

```javascript
let db;

export async function handler(event) {
  // Initialize on first call
  if (!db) {
    db = new Database({...});
    await db.connect();
  }

  // Use plugin
  return await db.myPlugin.doSomething(event.data);
}
```

---

### Q: How do I test code using the plugin?

**A:** Mock it:

```javascript
// test.js
describe('MyService', () => {
  it('should use plugin', async () => {
    const mockPlugin = {
      doSomething: jest.fn().mockResolvedValue({ success: true })
    };

    const db = new Database({...});
    db.myPlugin = mockPlugin;

    const result = await db.myPlugin.doSomething('input');
    expect(result.success).toBe(true);
  });
});
```

---

### Q: Is there a performance difference between timeout values?

**A:** Only if operation times out. Otherwise no difference. Use appropriate timeout for your operation type.

---

### Q: Can I see plugin logs?

**A:** Enable debug logging:

```javascript
process.env.DEBUG = 'my-plugin:*';

// Or verbose config
const db = new Database({
  plugins: [{
    name: 'my-plugin',
    config: { verbose: true }
  }]
});
```

---

### Q: What if I hit rate limits?

**A:** Use concurrency limits:

```javascript
const pLimit = require('p-limit');
const limit = pLimit(5);  // Max 5 concurrent

await Promise.all(
  items.map(item => limit(() => db.myPlugin.doSomething(item)))
);
```

---

### Q: How do I upgrade without breaking changes?

**A:** Check changelog, but generally:
```javascript
// Just update version
pnpm upgrade s3db.js

// Test thoroughly
pnpm test
```

---

## 📚 See Also

- **[Configuration Guide](./configuration.md)** - All config options
- **[Usage Patterns](./usage-patterns.md)** - API reference and examples
- **[README](../README.md)** - Plugin overview

---

**Still stuck?** → Check the [Configuration](./configuration.md) or [Usage Patterns](./usage-patterns.md) guides
