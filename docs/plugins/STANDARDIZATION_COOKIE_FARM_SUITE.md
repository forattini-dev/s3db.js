# Cookie Farm Suite Plugin Standardization - Missing Sections

This file contains ready-to-insert content for Cookie Farm Suite Plugin to match PuppeteerPlugin template.

---

## SECTION: Usage Journey

Insert this after "TLDR" section.

---

## Usage Journey

### Level 1: Basic Persona Generation

Generate simple personas without warmup or advanced features.

```javascript
import { Database } from 's3db.js';
import { CookieFarmSuitePlugin } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://...' });

const suite = new CookieFarmSuitePlugin({
  namespace: 'personas',
  queue: { autoStart: false },
  cookieFarm: {
    generation: { count: 0 },  // Manual generation only
    warmup: { enabled: false }
  }
});

await db.usePlugin(suite);
await db.connect();

// Define processor for generation jobs
suite.setProcessor(async (job, context, helpers) => {
  const { cookieFarm } = helpers;

  if (job.jobType === 'generate') {
    const count = job.payload?.count || 1;
    const personas = await cookieFarm.generatePersonas(count);

    console.log(`Generated ${personas.length} personas`);
    return { scheduled: true, count: personas.length };
  }

  throw new PluginError('Unsupported job type', {
    statusCode: 400,
    retriable: false,
    suggestion: `Expected "generate", got "${job.jobType}"`
  });
});

// Enqueue generation job
await suite.enqueueJob({
  jobType: 'generate',
  payload: { count: 5 }
});

// Start processing
await suite.startProcessing();

// Query generated personas
const personas = await db.resources.plg_cookiefarm_personas.list();
console.log(`Total personas: ${personas.length}`);
```

**What you get:**
- Basic persona generation
- No warmup or reputation tracking
- Manual job queueing

**What's missing:**
- No cookie warmup
- No reputation management
- No automatic rotation

---

### Level 2: Cookie Warmup Pipeline

Add cookie warmup to improve persona quality.

```javascript
const suite = new CookieFarmSuitePlugin({
  namespace: 'personas',
  queue: { autoStart: true, concurrency: 3 },
  cookieFarm: {
    generation: {
      count: 10,  // Auto-generate 10 personas on init
      autoWarmup: true  // Auto-warmup after generation
    },
    warmup: {
      enabled: true,
      pages: [
        'https://www.google.com',
        'https://www.youtube.com',
        'https://www.wikipedia.org',
        'https://www.reddit.com'
      ],
      randomOrder: true,
      timePerPage: { min: 5000, max: 15000 },
      interactions: {
        scroll: true,
        click: true,
        hover: true
      }
    }
  },
  puppeteer: {
    stealth: { enabled: true },
    humanBehavior: { enabled: true }
  }
});

await db.usePlugin(suite);
await db.connect();

suite.setProcessor(async (job, context, helpers) => {
  const { cookieFarm } = helpers;

  switch (job.jobType) {
    case 'generate':
      const personas = await cookieFarm.generatePersonas(job.payload?.count || 1);
      return { scheduled: true, count: personas.length };

    case 'warmup':
      await cookieFarm.warmupPersona(job.payload?.personaId);
      return { warmedUp: true, personaId: job.payload?.personaId };

    default:
      throw new PluginError('Unsupported job type', {
        statusCode: 400,
        retriable: false,
        suggestion: `Expected "generate" or "warmup", got "${job.jobType}"`
      });
  }
});

// Generate and warmup
await suite.enqueueJob({ jobType: 'generate', payload: { count: 5 } });

// Monitor warmup progress
suite.cookieFarmPlugin.on('persona.warmup.complete', ({ personaId, pagesVisited }) => {
  console.log(`✓ Persona ${personaId} warmed up (visited ${pagesVisited} pages)`);
});
```

**What you get:**
- Automated cookie warmup
- Human-like behavior simulation
- Stealth mode enabled
- Warmup progress tracking

**Warmup Process:**
1. Generate persona with fresh cookies
2. Visit popular sites (Google, YouTube, etc.)
3. Simulate human interactions (scroll, click, hover)
4. Collect cookies and build browser history
5. Mark persona as "warmed up"

---

### Level 3: Reputation Tracking & Rotation

Add reputation tracking to retire low-performing personas.

```javascript
const suite = new CookieFarmSuitePlugin({
  namespace: 'personas',
  queue: { autoStart: true, concurrency: 5 },
  cookieFarm: {
    generation: {
      count: 20,
      autoWarmup: true
    },
    warmup: { enabled: true },
    reputation: {
      enabled: true,
      trackSuccess: true,
      retireThreshold: 0.5,  // Retire if success < 50%
      ageBoost: true         // Prefer older personas
    },
    rotation: {
      enabled: true,
      requestsPerPersona: 100,
      maxAge: 86400000,  // 24 hours
      poolSize: 20
    }
  }
});

await db.usePlugin(suite);
await db.connect();

suite.setProcessor(async (job, context, helpers) => {
  const { cookieFarm } = helpers;

  switch (job.jobType) {
    case 'generate':
      const personas = await cookieFarm.generatePersonas(job.payload?.count || 1);
      return { scheduled: true, count: personas.length };

    case 'warmup':
      await cookieFarm.warmupPersona(job.payload?.personaId);
      return { warmedUp: true };

    case 'retire':
      await cookieFarm.retirePersona(job.payload?.personaId);
      return { retired: true, personaId: job.payload?.personaId };

    default:
      throw new PluginError(`Unsupported job type: ${job.jobType}`, {
        statusCode: 400,
        retriable: false
      });
  }
});

// Get next available persona
const persona = await suite.cookieFarmPlugin.getNextPersona('example.com');
console.log(`Using persona: ${persona.id}`);

// Update reputation after use
await suite.cookieFarmPlugin.updatePersonaReputation(persona.id, true);  // Success

// Monitor reputation
suite.cookieFarmPlugin.on('persona.reputation.low', ({ personaId, successRate }) => {
  console.warn(`⚠️ Low reputation: ${personaId} (${successRate * 100}%)`);
  // Auto-retire or regenerate
});

suite.cookieFarmPlugin.on('persona.retired', ({ personaId, reason }) => {
  console.log(`🗑️  Retired persona ${personaId}: ${reason}`);
});
```

**What you get:**
- Reputation tracking per persona
- Automatic retirement of low-performing personas
- Age-based rotation
- Success rate monitoring

**Reputation Metrics:**
- Success rate (successful requests / total requests)
- Age (older personas = more trusted)
- Request count
- Failure count

---

### Level 4: Proxy Binding & Session Management

Bind personas to specific proxies for consistent fingerprinting.

```javascript
const suite = new CookieFarmSuitePlugin({
  namespace: 'personas',
  queue: { autoStart: true, concurrency: 5 },
  cookieFarm: {
    generation: { count: 20, autoWarmup: true },
    warmup: { enabled: true },
    reputation: { enabled: true },
    rotation: { enabled: true }
  },
  puppeteer: {
    pool: { enabled: true, maxBrowsers: 5 },
    stealth: { enabled: true },
    proxy: {
      enabled: true,
      list: [
        'http://proxy1.example.com:8080',
        'http://proxy2.example.com:8080',
        'http://proxy3.example.com:8080'
      ],
      selectionStrategy: 'round-robin',
      healthCheck: { enabled: true }
    }
  }
});

await db.usePlugin(suite);
await db.connect();

suite.setProcessor(async (job, context, helpers) => {
  const { cookieFarm, puppeteer } = helpers;

  switch (job.jobType) {
    case 'generate':
      const personas = await cookieFarm.generatePersonas(job.payload?.count || 1);
      return { scheduled: true, count: personas.length };

    case 'warmup':
      // Get persona
      const persona = await cookieFarm.getPersona(job.payload?.personaId);

      // Get page with persona's cookies and bound proxy
      const page = await puppeteer.getPage({
        useSession: persona.id,  // Session binds to proxy
        cookies: persona.cookies
      });

      try {
        // Warmup pages
        for (const warmupUrl of cookieFarm.config.warmup.pages) {
          await page.goto(warmupUrl, { waitUntil: 'networkidle2' });
          await page.waitForTimeout(Math.random() * 5000 + 3000);
        }

        // Save updated cookies
        const updatedCookies = await page.cookies();
        await cookieFarm.updatePersona(persona.id, { cookies: updatedCookies });

        return { warmedUp: true };
      } finally {
        await puppeteer.releasePage(page);
      }

    default:
      throw new PluginError(`Unsupported job type: ${job.jobType}`, {
        statusCode: 400,
        retriable: false
      });
  }
});

// Monitor proxy bindings
suite.puppeteerPlugin.on('puppeteer.proxy-session-bound', ({ sessionId, proxyUrl }) => {
  console.log(`🔗 Persona ${sessionId} bound to proxy ${proxyUrl}`);
});

// Get persona with bound proxy
const persona = await suite.cookieFarmPlugin.getNextPersona('example.com');
console.log(`Persona ${persona.id} uses proxy: ${persona.proxyUrl}`);
```

**What you get:**
- Immutable persona-proxy binding
- Consistent browser fingerprinting
- Proxy health monitoring
- Automatic failover for unhealthy proxies

**Proxy-Session Binding:**
- Once persona is assigned a proxy, it's **permanently bound**
- Prevents fingerprint leakage from IP changes
- Ensures session integrity
- Cookies remain valid with consistent IP

---

### Level 5: Production Deployment

Complete production setup with monitoring, TTL, and metrics.

```javascript
import { Database } from 's3db.js';
import { CookieFarmSuitePlugin, TTLPlugin, MetricsPlugin } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://...' });

// Production persona farm
const suite = new CookieFarmSuitePlugin({
  namespace: 'production-personas',
  queue: {
    autoStart: true,
    concurrency: 10,
    retries: { maxAttempts: 3, backoff: 'exponential' }
  },
  cookieFarm: {
    generation: {
      count: 50,  // Maintain pool of 50 personas
      autoWarmup: true,
      autoRotate: true
    },
    warmup: {
      enabled: true,
      pages: [
        'https://www.google.com',
        'https://www.youtube.com',
        'https://www.wikipedia.org',
        'https://www.reddit.com',
        'https://www.twitter.com'
      ],
      randomOrder: true,
      timePerPage: { min: 5000, max: 15000 }
    },
    reputation: {
      enabled: true,
      trackSuccess: true,
      retireThreshold: 0.5,
      ageBoost: true
    },
    rotation: {
      enabled: true,
      requestsPerPersona: 100,
      maxAge: 86400000,  // 24 hours
      poolSize: 50
    }
  },
  puppeteer: {
    pool: { enabled: true, maxBrowsers: 10 },
    stealth: { enabled: true },
    humanBehavior: { enabled: true },
    proxy: {
      enabled: true,
      list: process.env.PROXY_LIST.split(','),
      healthCheck: { enabled: true }
    },
    performance: {
      blockResources: { enabled: true, types: ['image', 'font', 'media'] }
    }
  },
  ttl: {
    queue: {
      ttl: 86400000,  // 24 hours for queue entries
      onExpire: 'hard-delete'
    }
  }
});

// TTL for personas
const ttl = new TTLPlugin({
  resources: {
    plg_cookiefarm_personas: { ttl: 7776000000 }  // 90 days
  }
});

// Metrics
const metrics = new MetricsPlugin({ enabled: true });

await db.usePlugin(suite);
await db.usePlugin(ttl);
await db.usePlugin(metrics);
await db.connect();

suite.setProcessor(async (job, context, helpers) => {
  const { cookieFarm, puppeteer } = helpers;
  const { attempt } = context;

  console.log(`[Attempt ${attempt}] Processing ${job.jobType} job`);

  try {
    switch (job.jobType) {
      case 'generate':
        const count = job.payload?.count || 1;
        const personas = await cookieFarm.generatePersonas(count);
        console.log(`✓ Generated ${personas.length} personas`);
        return { scheduled: true, count: personas.length };

      case 'warmup':
        const personaId = job.payload?.personaId;
        await cookieFarm.warmupPersona(personaId);
        console.log(`✓ Warmed up persona ${personaId}`);
        return { warmedUp: true, personaId };

      case 'retire':
        await cookieFarm.retirePersona(job.payload?.personaId);
        console.log(`✓ Retired persona ${job.payload?.personaId}`);
        return { retired: true };

      default:
        throw new PluginError(`Unsupported job type: ${job.jobType}`, {
          statusCode: 400,
          retriable: false,
          suggestion: 'Use "generate", "warmup", or "retire"'
        });
    }
  } catch (error) {
    console.error(`✗ Job failed (attempt ${attempt}):`, error.message);
    if (attempt < 3) throw error;  // Retry
    return { failed: true, error: error.message };
  }
});

// Monitor persona lifecycle
suite.cookieFarmPlugin.on('persona.created', ({ personaId }) => {
  console.log(`🆕 Created persona: ${personaId}`);
});

suite.cookieFarmPlugin.on('persona.warmup.complete', ({ personaId, duration }) => {
  console.log(`🔥 Warmed up ${personaId} in ${duration}ms`);
});

suite.cookieFarmPlugin.on('persona.retired', ({ personaId, reason, successRate }) => {
  console.log(`🗑️  Retired ${personaId}: ${reason} (success rate: ${successRate * 100}%)`);
});

suite.cookieFarmPlugin.on('persona.reputation.low', ({ personaId, successRate }) => {
  console.warn(`⚠️ Low reputation: ${personaId} (${successRate * 100}%)`);
  // Auto-retire
  suite.enqueueJob({ jobType: 'retire', payload: { personaId } });
});

// Auto-maintain persona pool
setInterval(async () => {
  const personas = await db.resources.plg_cookiefarm_personas.list();
  const activePersonas = personas.filter(p => p.status === 'active');

  if (activePersonas.length < 50) {
    const needed = 50 - activePersonas.length;
    console.log(`🔄 Regenerating ${needed} personas to maintain pool`);
    await suite.enqueueJob({ jobType: 'generate', payload: { count: needed } });
  }
}, 3600000);  // Check every hour

// Query persona stats
const stats = await suite.queuePlugin.getStats();
console.log('Queue stats:', stats);

const personas = await db.resources.plg_cookiefarm_personas.list();
const activeCount = personas.filter(p => p.status === 'active').length;
console.log(`Active personas: ${activeCount}/${personas.length}`);
```

**Production Checklist:**
- ✅ Persona pool (50 personas)
- ✅ Auto-warmup enabled
- ✅ Reputation tracking
- ✅ Automatic rotation
- ✅ Proxy binding
- ✅ Browser pooling (10 browsers)
- ✅ Stealth mode + human behavior
- ✅ TTL cleanup (queue + personas)
- ✅ Metrics tracking
- ✅ Event monitoring
- ✅ Auto-maintenance of pool
- ✅ Error handling with retries

---

## SECTION: Configuration Examples

Insert this after "Configuration" section.

---

## 📚 Configuration Examples

### Example 1: Basic Persona Farm (No Warmup)

```javascript
new CookieFarmSuitePlugin({
  namespace: 'basic',
  queue: { autoStart: true, concurrency: 3 },
  cookieFarm: {
    generation: { count: 10 },
    warmup: { enabled: false }
  }
})
```

**Use case:** Simple persona generation, no cookie warmup needed

---

### Example 2: High-Quality Personas (With Warmup)

```javascript
new CookieFarmSuitePlugin({
  namespace: 'quality',
  queue: { autoStart: true, concurrency: 5 },
  cookieFarm: {
    generation: { count: 20, autoWarmup: true },
    warmup: {
      enabled: true,
      pages: [
        'https://www.google.com',
        'https://www.youtube.com',
        'https://www.wikipedia.org'
      ],
      timePerPage: { min: 10000, max: 20000 }
    }
  },
  puppeteer: {
    stealth: { enabled: true },
    humanBehavior: { enabled: true }
  }
})
```

**Use case:** High-quality personas with realistic browser history

---

### Example 3: Production Farm (Full Features)

```javascript
new CookieFarmSuitePlugin({
  namespace: 'production',
  queue: {
    autoStart: true,
    concurrency: 10,
    retries: { maxAttempts: 3, backoff: 'exponential' }
  },
  cookieFarm: {
    generation: { count: 50, autoWarmup: true },
    warmup: { enabled: true },
    reputation: {
      enabled: true,
      retireThreshold: 0.5
    },
    rotation: {
      enabled: true,
      requestsPerPersona: 100,
      poolSize: 50
    }
  },
  puppeteer: {
    pool: { enabled: true, maxBrowsers: 10 },
    stealth: { enabled: true },
    proxy: { enabled: true, list: [...] }
  },
  ttl: {
    queue: { ttl: 86400000 }
  }
})
```

**Use case:** Enterprise persona farming with full monitoring

---

### Example 4: Multi-Proxy Farm (Distributed)

```javascript
new CookieFarmSuitePlugin({
  namespace: 'distributed',
  queue: { autoStart: true, concurrency: 10 },
  cookieFarm: {
    generation: { count: 100 },
    warmup: { enabled: true },
    rotation: { enabled: true, poolSize: 100 }
  },
  puppeteer: {
    pool: { enabled: true, maxBrowsers: 20 },
    proxy: {
      enabled: true,
      list: [
        'http://proxy1.com:8080',
        'http://proxy2.com:8080',
        // ... 20+ proxies
      ],
      selectionStrategy: 'round-robin',
      healthCheck: { enabled: true }
    }
  }
})
```

**Use case:** Large-scale persona farming with distributed proxies

---

## SECTION: Best Practices

Insert this after "Configuration Examples" section.

---

## ✅ Best Practices

### Do's ✅

1. **Enable cookie warmup for better quality**
   ```javascript
   cookieFarm: {
     warmup: {
       enabled: true,
       pages: ['https://www.google.com', 'https://www.youtube.com']
     }
   }
   ```

2. **Use reputation tracking**
   ```javascript
   cookieFarm: {
     reputation: {
       enabled: true,
       trackSuccess: true,
       retireThreshold: 0.5
     }
   }
   ```

3. **Enable stealth mode and human behavior**
   ```javascript
   puppeteer: {
     stealth: { enabled: true },
     humanBehavior: { enabled: true }
   }
   ```

4. **Use proxy rotation**
   ```javascript
   puppeteer: {
     proxy: {
       enabled: true,
       list: [...],
       healthCheck: { enabled: true }
     }
   }
   ```

5. **Set up TTL for cleanup**
   ```javascript
   ttl: {
     queue: { ttl: 86400000 }  // 24 hours
   }
   ```

6. **Maintain persona pool size**
   ```javascript
   cookieFarm: {
     rotation: {
       enabled: true,
       poolSize: 50  // Maintain 50 active personas
     }
   }
   ```

7. **Monitor persona lifecycle**
   ```javascript
   suite.cookieFarmPlugin.on('persona.retired', ({ personaId, reason }) => {
     console.log(`Retired ${personaId}: ${reason}`);
   });
   ```

---

### Don'ts ❌

1. **Don't skip warmup for production**
   ```javascript
   // ❌ No warmup = low-quality personas
   warmup: { enabled: false }

   // ✅ Enable warmup
   warmup: { enabled: true }
   ```

2. **Don't reuse personas indefinitely**
   ```javascript
   // ❌ No rotation = stale personas
   rotation: { enabled: false }

   // ✅ Enable rotation
   rotation: { enabled: true, maxAge: 86400000 }
   ```

3. **Don't ignore reputation**
   ```javascript
   // ❌ Keep low-performing personas
   reputation: { enabled: false }

   // ✅ Track and retire
   reputation: { enabled: true, retireThreshold: 0.5 }
   ```

4. **Don't use same proxy for all personas**
   ```javascript
   // ❌ Single proxy = easily detected
   proxy: { enabled: false }

   // ✅ Multi-proxy rotation
   proxy: { enabled: true, list: [...] }
   ```

5. **Don't forget error handling**
   ```javascript
   // ❌ No error handling
   suite.setProcessor(async (job) => {
     await cookieFarm.warmupPersona(job.payload.personaId);
   });

   // ✅ With error handling
   suite.setProcessor(async (job, context) => {
     try {
       await cookieFarm.warmupPersona(job.payload.personaId);
     } catch (error) {
       if (context.attempt < 3) throw error;  // Retry
       return { failed: true, error: error.message };
     }
   });
   ```

---

## SECTION: Complete API Reference

Insert this after "Best Practices" section.

---

## 🔧 API Reference

### Plugin Methods

#### `setProcessor(fn, options): void`

Register or replace the queue processor function.

**Signature:**
```javascript
suite.setProcessor(fn, options)
```

**Parameters:**
- `fn` (function, required): Processor `(job, context, helpers) => Promise<any>`
  - `job` (object): Job data (`jobType`, `payload`, `requestedBy`)
  - `context` (object): Execution context (`attempt`, `logger`)
  - `helpers` (object): Helper utilities
    - `cookieFarm`: CookieFarmPlugin instance
    - `puppeteer`: PuppeteerPlugin instance
    - `queue`: S3QueuePlugin instance
    - `enqueue`: Helper to enqueue new jobs
    - `resource`: Direct handle to jobs resource
- `options` (object, optional): Processing options
  - `autoStart` (boolean): Auto-start processing (default: `false`)
  - `concurrency` (number): Override concurrency

**Returns:** void

**Example:**
```javascript
suite.setProcessor(async (job, context, helpers) => {
  const { cookieFarm } = helpers;

  switch (job.jobType) {
    case 'generate':
      const personas = await cookieFarm.generatePersonas(job.payload?.count || 1);
      return { scheduled: true, count: personas.length };

    case 'warmup':
      await cookieFarm.warmupPersona(job.payload?.personaId);
      return { warmedUp: true };

    default:
      throw new PluginError(`Unsupported job type: ${job.jobType}`, {
        statusCode: 400,
        retriable: false
      });
  }
}, { autoStart: true, concurrency: 5 });
```

---

#### `enqueueJob(data, options): Promise<string>`

Enqueue a new persona job.

**Signature:**
```javascript
await suite.enqueueJob(data, options)
```

**Parameters:**
- `data` (object, required): Job data
  - `jobType` (string, required): Job type (`'generate'`, `'warmup'`, `'retire'`)
  - `payload` (object, optional): Job-specific payload
  - `requestedBy` (string, optional): Who requested the job
- `options` (object, optional): Queue options
  - `priority` (number): Job priority (default: `0`)
  - `delay` (number): Delay before execution (ms)

**Returns:** Promise resolving to job ID

**Example:**
```javascript
// Generate personas
await suite.enqueueJob({
  jobType: 'generate',
  payload: { count: 10 }
});

// Warmup persona
await suite.enqueueJob({
  jobType: 'warmup',
  payload: { personaId: 'persona_abc123' },
  requestedBy: 'ops'
});

// Retire persona
await suite.enqueueJob({
  jobType: 'retire',
  payload: { personaId: 'persona_xyz789' }
});
```

---

#### `startProcessing(options): Promise<void>`

Start queue workers to process enqueued jobs.

**Signature:**
```javascript
await suite.startProcessing(options)
```

**Parameters:**
- `options` (object, optional): Processing options
  - `concurrency` (number): Override concurrency

**Returns:** Promise resolving to void

**Example:**
```javascript
await suite.startProcessing({ concurrency: 10 });
```

---

#### `stopProcessing(): Promise<void>`

Stop all queue workers.

**Signature:**
```javascript
await suite.stopProcessing()
```

**Returns:** Promise resolving to void

**Example:**
```javascript
await suite.stopProcessing();
console.log('Queue workers stopped');
```

---

### CookieFarm Plugin Methods

These methods are accessed via `suite.cookieFarmPlugin`:

#### `generatePersonas(count, options): Promise<Array>`

Generate new personas.

**Signature:**
```javascript
await suite.cookieFarmPlugin.generatePersonas(count, options)
```

**Parameters:**
- `count` (number, required): Number of personas to generate
- `options` (object, optional): Generation options
  - `autoWarmup` (boolean): Auto-warmup after generation (default: from config)
  - `tags` (string[]): Tags for personas

**Returns:** Promise resolving to array of persona objects

**Example:**
```javascript
const personas = await suite.cookieFarmPlugin.generatePersonas(5, {
  autoWarmup: true,
  tags: ['premium']
});

console.log(`Generated ${personas.length} personas`);
```

---

#### `warmupPersona(personaId): Promise<void>`

Warmup a specific persona.

**Signature:**
```javascript
await suite.cookieFarmPlugin.warmupPersona(personaId)
```

**Parameters:**
- `personaId` (string, required): Persona identifier

**Returns:** Promise resolving to void

**Example:**
```javascript
await suite.cookieFarmPlugin.warmupPersona('persona_abc123');
console.log('Persona warmed up');
```

---

#### `getNextPersona(domain): Promise<Object>`

Get next available persona for a domain (rotation logic).

**Signature:**
```javascript
await suite.cookieFarmPlugin.getNextPersona(domain)
```

**Parameters:**
- `domain` (string, required): Target domain

**Returns:** Promise resolving to persona object

**Example:**
```javascript
const persona = await suite.cookieFarmPlugin.getNextPersona('example.com');
console.log(`Using persona: ${persona.id}`);
```

---

#### `updatePersonaReputation(personaId, success): Promise<void>`

Update persona reputation after use.

**Signature:**
```javascript
await suite.cookieFarmPlugin.updatePersonaReputation(personaId, success)
```

**Parameters:**
- `personaId` (string, required): Persona identifier
- `success` (boolean, required): Whether request was successful

**Returns:** Promise resolving to void

**Example:**
```javascript
// Successful request
await suite.cookieFarmPlugin.updatePersonaReputation('persona_abc123', true);

// Failed request
await suite.cookieFarmPlugin.updatePersonaReputation('persona_abc123', false);
```

---

#### `retirePersona(personaId): Promise<void>`

Retire a persona (mark as inactive).

**Signature:**
```javascript
await suite.cookieFarmPlugin.retirePersona(personaId)
```

**Parameters:**
- `personaId` (string, required): Persona identifier

**Returns:** Promise resolving to void

**Example:**
```javascript
await suite.cookieFarmPlugin.retirePersona('persona_abc123');
console.log('Persona retired');
```

---

## SECTION: FAQ

Insert this at the end of the document.

---

## ❓ FAQ

### General

**Q: What's the difference between CookieFarmSuitePlugin and using CookieFarmPlugin + PuppeteerPlugin separately?**

A:
- **CookieFarmSuitePlugin** - Pre-wired bundle with queue integration, namespace isolation, shared config
- **Manual setup** - More flexibility but requires manual wiring

```javascript
// ✅ CookieFarmSuitePlugin (recommended)
const suite = new CookieFarmSuitePlugin({ namespace: 'personas' });
await db.usePlugin(suite);

// vs.

// ❌ Manual setup (more work)
const cookieFarm = new CookieFarmPlugin({ namespace: 'personas' });
const puppeteer = new PuppeteerPlugin({ namespace: 'personas' });
const queue = new S3QueuePlugin({ namespace: 'personas' });
await db.usePlugin(cookieFarm);
await db.usePlugin(puppeteer);
await db.usePlugin(queue);
// ... manual job processor wiring
```

---

**Q: How many personas should I maintain in my pool?**

A: Depends on your use case:

| Scenario | Pool Size | Notes |
|----------|-----------|-------|
| Small-scale scraping (< 100 req/day) | 5-10 | Low volume |
| Medium-scale (100-1000 req/day) | 20-50 | Balanced |
| High-scale (> 1000 req/day) | 50-200 | High volume |
| Multi-tenant SaaS | 100+ | Per-tenant isolation |

```javascript
// Small-scale
cookieFarm: { rotation: { poolSize: 10 } }

// Medium-scale
cookieFarm: { rotation: { poolSize: 50 } }

// High-scale
cookieFarm: { rotation: { poolSize: 200 } }
```

---

**Q: How long does persona generation take?**

A: Depends on warmup:

| Configuration | Time per Persona | Notes |
|---------------|------------------|-------|
| No warmup | 1-2 seconds | Just generate cookies |
| Basic warmup (3 pages) | 30-60 seconds | Visit Google, YouTube, Wikipedia |
| Full warmup (10 pages) | 2-5 minutes | Comprehensive warmup |
| With human behavior | +50% | Realistic interactions slow down process |

```javascript
// Fast generation (no warmup)
cookieFarm: { warmup: { enabled: false } }
// 10 personas in ~10-20 seconds

// Quality generation (with warmup)
cookieFarm: {
  warmup: {
    enabled: true,
    pages: [...],  // 5 pages
    timePerPage: { min: 5000, max: 10000 }
  }
}
// 10 personas in ~5-10 minutes
```

---

### Warmup & Quality

**Q: Why should I enable warmup?**

A: Warmup improves persona quality:

**Without Warmup:**
- Empty browser history
- No cookies
- Fresh user agent
- Easily detected as bot

**With Warmup:**
- Realistic browser history (visited popular sites)
- Accumulated cookies (Google, YouTube, etc.)
- Established session
- Harder to detect as bot

```javascript
// ❌ Without warmup - easily detected
cookieFarm: { warmup: { enabled: false } }

// ✅ With warmup - realistic persona
cookieFarm: {
  warmup: {
    enabled: true,
    pages: [
      'https://www.google.com',
      'https://www.youtube.com',
      'https://www.wikipedia.org'
    ],
    interactions: { scroll: true, click: true }
  }
}
```

---

**Q: Which pages should I use for warmup?**

A: Popular, high-traffic sites:

**Recommended:**
- Google (search engine)
- YouTube (video)
- Wikipedia (encyclopedia)
- Reddit (social)
- Twitter (social)

**Avoid:**
- Target sites (save for actual scraping)
- Bot-detection-heavy sites (Cloudflare pages)
- Login-required pages

```javascript
cookieFarm: {
  warmup: {
    pages: [
      'https://www.google.com',      // Search
      'https://www.youtube.com',     // Video
      'https://www.wikipedia.org',   // Encyclopedia
      'https://www.reddit.com',      // Social
      'https://news.ycombinator.com' // Tech news
    ]
  }
}
```

---

**Q: How does human behavior simulation help?**

A: Makes personas more realistic:

**Without Human Behavior:**
- Instant page loads
- No scrolling
- No mouse movement
- Robotic patterns

**With Human Behavior:**
- Natural scrolling
- Mouse movements
- Random pauses
- Realistic interactions

```javascript
puppeteer: {
  humanBehavior: {
    enabled: true,
    mouse: { enabled: true, bezierCurves: true },
    scrolling: { enabled: true, randomStops: true }
  }
}
```

---

### Reputation & Rotation

**Q: How does reputation tracking work?**

A: Tracks success/failure per persona:

```javascript
// Persona starts with neutral reputation
const persona = await cookieFarm.getNextPersona('example.com');

// Use persona for request
const success = await scrapeWithPersona(persona);

// Update reputation
await cookieFarm.updatePersonaReputation(persona.id, success);
// Success: successRate increases
// Failure: successRate decreases

// Auto-retire if success rate < threshold
if (persona.successRate < 0.5) {
  await cookieFarm.retirePersona(persona.id);
  console.log(`Retired low-performing persona: ${persona.id}`);
}
```

**Reputation Metrics:**
- `requests` - Total requests made
- `successes` - Successful requests
- `failures` - Failed requests
- `successRate` - `successes / requests`

---

**Q: When should personas be retired?**

A: Based on reputation or age:

**Retire When:**
- Success rate < threshold (default: 50%)
- Age > max age (default: 24 hours)
- Request count > max requests (default: 100)
- Detected as bot (manual trigger)

```javascript
cookieFarm: {
  reputation: {
    retireThreshold: 0.5  // Retire if success < 50%
  },
  rotation: {
    maxAge: 86400000,          // 24 hours
    requestsPerPersona: 100    // Max 100 requests
  }
}

// Monitor retirements
suite.cookieFarmPlugin.on('persona.retired', ({ personaId, reason }) => {
  console.log(`Retired ${personaId}: ${reason}`);
  // Reasons: 'low_reputation', 'max_age', 'max_requests', 'manual'
});
```

---

**Q: How does persona rotation work?**

A: Round-robin with reputation weighting:

```javascript
// Get next persona (rotation logic)
const persona = await cookieFarm.getNextPersona('example.com');

// Selection priority:
// 1. Exclude retired personas
// 2. Prefer high reputation (success rate > 70%)
// 3. Prefer older personas (age boost)
// 4. Round-robin through pool

// Example pool:
// persona_1: age=48h, successRate=0.9, requests=50  ← Selected (high rep + old)
// persona_2: age=12h, successRate=0.3, requests=80  ← Skipped (low rep)
// persona_3: age=6h,  successRate=0.8, requests=20  ← Backup (high rep, young)
```

---

### Proxy Binding

**Q: Why are personas permanently bound to proxies?**

A: For consistent fingerprinting:

**Browser Fingerprint Includes:**
- IP address (from proxy)
- User agent
- Screen resolution
- Canvas fingerprint
- WebGL renderer
- Timezone

**Changing proxy mid-session = Different fingerprint = Bot detection**

```javascript
// ✅ Correct: Persona bound to proxy
const persona = await cookieFarm.getNextPersona('example.com');
// First request: binds to proxy1
// All subsequent requests: uses proxy1

// ❌ Wrong: Changing proxy per request
// Request 1: proxy1 (fingerprint A)
// Request 2: proxy2 (fingerprint B) ← Different! Detected as bot
```

---

**Q: What happens if a bound proxy becomes unhealthy?**

A: Persona must be retired and regenerated:

```javascript
// Monitor proxy health
suite.puppeteerPlugin.on('puppeteer.proxy-unhealthy', ({ proxy, sessionId }) => {
  console.warn(`Proxy ${proxy} unhealthy for session ${sessionId}`);

  // Retire persona (bound to unhealthy proxy)
  suite.enqueueJob({
    jobType: 'retire',
    payload: { personaId: sessionId }
  });

  // Generate replacement
  suite.enqueueJob({
    jobType: 'generate',
    payload: { count: 1 }
  });
});
```

---

### Storage & Performance

**Q: How much storage do personas use?**

A: Average storage per persona:

| Data | Average Size | Notes |
|------|--------------|-------|
| Cookies | 2-10 KB | Depends on warmup |
| User agent | 200 bytes | String |
| Viewport | 100 bytes | Width/height |
| Reputation | 300 bytes | Metrics |
| Metadata | 500 bytes | Tags, timestamps |
| **Total** | **3-11 KB** | Per persona |

**Pool of 50 personas:**
- Storage: 150-550 KB
- With TTL cleanup: Minimal growth

---

**Q: How do I clean up old personas?**

A: Use TTL plugin:

```javascript
import { TTLPlugin } from 's3db.js/plugins';

const ttl = new TTLPlugin({
  resources: {
    plg_cookiefarm_personas: { ttl: 7776000000 }  // 90 days
  }
});

await db.usePlugin(ttl);

// Personas older than 90 days are automatically deleted
```

---

**Q: How fast can I generate personas?**

A: Depends on concurrency and warmup:

| Configuration | Personas/minute | Notes |
|---------------|-----------------|-------|
| No warmup, concurrency=5 | 150-300 | Very fast |
| Basic warmup (3 pages), concurrency=5 | 5-10 | Realistic |
| Full warmup (10 pages), concurrency=10 | 10-20 | High quality |

```javascript
// Fast generation (no warmup)
queue: { concurrency: 10 },
cookieFarm: { warmup: { enabled: false } }
// ~200 personas/minute

// Quality generation (with warmup)
queue: { concurrency: 10 },
cookieFarm: {
  warmup: { enabled: true, pages: [...] }
}
// ~15 personas/minute
```

---

### Troubleshooting

**Q: Persona generation is failing, what should I check?**

A:

1. **Check browser pool:**
   ```javascript
   const stats = await suite.puppeteerPlugin.getPoolStats();
   console.log('Browser pool:', stats);
   // Ensure browsers are available
   ```

2. **Check proxy health:**
   ```javascript
   const proxyStats = await suite.puppeteerPlugin.proxyManager.getProxyStats();
   console.log('Proxy health:', proxyStats);
   // Ensure proxies are healthy
   ```

3. **Check queue status:**
   ```javascript
   const queueStats = await suite.queuePlugin.getStats();
   console.log('Queue stats:', queueStats);
   // Check for failed jobs
   ```

4. **Monitor events:**
   ```javascript
   suite.cookieFarmPlugin.on('persona.generation.failed', ({ error }) => {
     console.error('Generation failed:', error);
   });
   ```

---

**Q: Warmup is timing out, how do I fix it?**

A:

1. **Increase timeouts:**
   ```javascript
   cookieFarm: {
     warmup: {
       timePerPage: { min: 10000, max: 20000 }  // Increase from default
     }
   }
   ```

2. **Reduce number of pages:**
   ```javascript
   cookieFarm: {
     warmup: {
       pages: [
         'https://www.google.com',
         'https://www.wikipedia.org'  // Only 2 pages
       ]
     }
   }
   ```

3. **Disable resource blocking:**
   ```javascript
   puppeteer: {
     performance: {
       blockResources: { enabled: false }  // Don't block resources
     }
   }
   ```

---

**Q: How do I monitor persona pool health?**

A:

```javascript
// Check pool size
const personas = await db.resources.plg_cookiefarm_personas.list();
const activeCount = personas.filter(p => p.status === 'active').length;
const retiredCount = personas.filter(p => p.status === 'retired').length;

console.log(`Active: ${activeCount}, Retired: ${retiredCount}`);

// Check average success rate
const avgSuccessRate = personas.reduce((sum, p) => sum + p.successRate, 0) / personas.length;
console.log(`Average success rate: ${avgSuccessRate * 100}%`);

// Check age distribution
const now = Date.now();
const ageDistribution = {
  '<6h': personas.filter(p => now - p.createdAt < 6 * 3600000).length,
  '6-12h': personas.filter(p => {
    const age = now - p.createdAt;
    return age >= 6 * 3600000 && age < 12 * 3600000;
  }).length,
  '12-24h': personas.filter(p => {
    const age = now - p.createdAt;
    return age >= 12 * 3600000 && age < 24 * 3600000;
  }).length,
  '>24h': personas.filter(p => now - p.createdAt >= 24 * 3600000).length
};

console.log('Age distribution:', ageDistribution);
```

---

## License

MIT License - See main s3db.js LICENSE file
