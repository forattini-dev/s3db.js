# ⚙️ Cookie Farm Configuration Guide

**Prev:** [← Getting Started](./getting-started.md)
**Next:** [Usage Patterns →](./usage-patterns.md)
**Main:** [← Cookie Farm Plugin](../README.md) | **All guides:** [Index](../README.md#-documentation-guides)

> **In this guide:**
> - Default configuration object
> - All bundled plugin options
> - Configuration patterns for different environments
> - Performance tuning
> - Resource management

**Time to read:** 15 minutes
**Difficulty:** Intermediate

---

## Default Configuration

```javascript
new CookieFarmPlugin({
  // Namespace for all bundled resources
  namespace: 'persona',

  // Queue configuration
  queue: {
    autoStart: false,                           // Auto-start workers when processor is set
    workers: 5,                                 // Concurrent workers
    visibilityTimeout: 300000,                  // Job timeout (5 minutes)
    maxRetries: 3,                              // Retry failed jobs
    deadLetterResource: 'persona_dlq',          // DLQ resource name
    deduplicationWindow: 600000,                // Dedup within 10 minutes
    retryStrategy: 'exponential'                // Exponential backoff
  },

  // Cookie Farm generation options
  cookieFarm: {
    generation: {
      count: 100,                               // Personas per batch
      batchSize: 10,                            // Per-operation batch
      strategy: 'standard'                      // 'standard' or 'diverse'
    },
    warmup: {
      enabled: false,                           // Enable warmup feature
      strategy: 'gradual',                      // 'gradual' or 'intensive'
      interval: 3600000,                        // Check interval (1 hour)
      minAge: 86400000                          // Minimum age to warmup (24h)
    },
    retirement: {
      enabled: false,                           // Enable retirement
      maxAge: 2592000000                        // Retire after 30 days
    }
  },

  // Puppeteer browser options
  puppeteer: {
    pool: {
      enabled: false,                           // Enable browser pooling
      size: { min: 2, max: 10 },               // Pool size range
      timeout: 120000,                          // Acquire timeout (2 min)
      warmup: false,                            // Pre-warm browsers
      maxIdleTime: 600000                       // Close after 10 min idle
    },
    proxy: {
      enabled: false,                           // Enable proxy rotation
      providers: ['brightdata'],                // Proxy providers
      rotationStrategy: 'round-robin',          // 'round-robin' or 'least-used'
      healthCheck: false,                       // Check proxy health
      healthCheckInterval: 300000               // Health check every 5 min
    },
    captcha: {
      enabled: false,                           // Enable CAPTCHA solving
      provider: '2captcha',                     // CAPTCHA service
      apiKey: process.env.CAPTCHA_API_KEY,      // API credentials
      timeout: 60000,                           // Solving timeout (1 min)
      maxRetries: 2                             // Retries per CAPTCHA
    }
  },

  // TTL cleanup options
  ttl: {
    queue: { ttl: 86400000 },                   // Clean jobs after 24h
    personas: { ttl: 2592000000 }               // Clean personas after 30d
  }
})
```

---

## Configuration Patterns

### Pattern 1: Development (Minimal)

Minimal setup for local testing:

```javascript
new CookieFarmPlugin({
  namespace: 'dev_persona',
  queue: {
    autoStart: false,           // Manual control
    workers: 1,                 // Single worker
    visibilityTimeout: 60000    // 1 minute
  },
  cookieFarm: {
    generation: { count: 0 },   // No auto-generation
    warmup: { enabled: false }
  },
  puppeteer: {
    pool: { enabled: false }    // Single browser
  },
  ttl: {
    queue: { ttl: 3600000 }     // 1 hour cleanup
  }
})
```

**Use when:**
- ✅ Local development
- ✅ Testing without scale
- ✅ Interactive debugging

---

### Pattern 2: Testing Environment

Balanced configuration for CI/CD:

```javascript
new CookieFarmPlugin({
  namespace: 'test_persona',
  queue: {
    autoStart: true,
    workers: 2,
    visibilityTimeout: 60000,
    maxRetries: 1,              // Fewer retries in tests
    deadLetterResource: 'test_persona_dlq'
  },
  cookieFarm: {
    generation: { count: 10, batchSize: 5 },
    warmup: { enabled: false }
  },
  puppeteer: {
    pool: {
      enabled: true,
      size: { min: 1, max: 3 }
    }
  },
  ttl: {
    queue: { ttl: 1800000 }    // 30 minute cleanup
  }
})
```

**Use when:**
- ✅ Automated testing
- ✅ CI/CD pipelines
- ✅ Limited resources

---

### Pattern 3: Staging/Pre-Production

Full features with moderate scale:

```javascript
new CookieFarmPlugin({
  namespace: 'stg_persona',
  queue: {
    autoStart: true,
    workers: 5,
    visibilityTimeout: 180000,  // 3 minutes
    maxRetries: 2,
    deadLetterResource: 'stg_persona_dlq',
    deduplicationWindow: 300000  // 5 minute window
  },
  cookieFarm: {
    generation: { count: 50, batchSize: 10 },
    warmup: {
      enabled: true,
      strategy: 'gradual',
      interval: 1800000          // 30 minute checks
    }
  },
  puppeteer: {
    pool: {
      enabled: true,
      size: { min: 2, max: 8 },
      timeout: 120000
    },
    proxy: {
      enabled: true,
      rotationStrategy: 'round-robin'
    }
  },
  ttl: {
    queue: { ttl: 43200000 }    // 12 hour cleanup
  }
})
```

**Use when:**
- ✅ Pre-production testing
- ✅ Load testing scenarios
- ✅ Staging deployments

---

### Pattern 4: Production (High Scale)

Full-featured production setup:

```javascript
new CookieFarmPlugin({
  namespace: 'prod_persona',
  queue: {
    autoStart: true,
    workers: 20,                // High concurrency
    visibilityTimeout: 300000,  // 5 minutes
    maxRetries: 5,              // More retries for reliability
    deadLetterResource: 'prod_persona_dlq',
    deduplicationWindow: 600000, // 10 minute window
    retryStrategy: 'exponential' // Smart backoff
  },
  cookieFarm: {
    generation: {
      count: 100,
      batchSize: 10,
      strategy: 'diverse'       // Diverse personas
    },
    warmup: {
      enabled: true,
      strategy: 'gradual',
      interval: 3600000,        // 1 hour
      minAge: 86400000          // Warmup after 24h
    },
    retirement: {
      enabled: true,
      maxAge: 2592000000        // Retire after 30 days
    }
  },
  puppeteer: {
    pool: {
      enabled: true,
      size: { min: 10, max: 50 },  // Large pool
      timeout: 120000,
      warmup: true,             // Pre-warm browsers
      maxIdleTime: 300000       // Close idle after 5 min
    },
    proxy: {
      enabled: true,
      providers: ['brightdata', 'oxylabs', 'smartproxy'],
      rotationStrategy: 'least-used',  // Smart rotation
      healthCheck: true,
      healthCheckInterval: 300000
    },
    captcha: {
      enabled: true,
      provider: '2captcha',
      apiKey: process.env.CAPTCHA_API_KEY,
      timeout: 60000,
      maxRetries: 3
    }
  },
  ttl: {
    queue: { ttl: 86400000 },   // 24 hour cleanup
    personas: { ttl: 2592000000 } // 30 day retention
  }
})
```

**Use when:**
- ✅ Production environments
- ✅ High-scale operations (1000+ personas/day)
- ✅ Multi-provider setup
- ✅ Mission-critical workloads

---

### Pattern 5: Cost-Optimized

Minimal resource consumption:

```javascript
new CookieFarmPlugin({
  namespace: 'budget_persona',
  queue: {
    autoStart: true,
    workers: 2,                 // Minimal workers
    visibilityTimeout: 300000,
    maxRetries: 2
  },
  cookieFarm: {
    generation: { count: 10, batchSize: 5 },
    warmup: { enabled: false }  // Disabled
  },
  puppeteer: {
    pool: { enabled: false },   // No pooling overhead
    proxy: { enabled: false },  // No proxy costs
    captcha: { enabled: false } // No CAPTCHA costs
  },
  ttl: {
    queue: { ttl: 3600000 },    // 1 hour aggressive cleanup
    personas: { ttl: 604800000 } // 7 day retention
  }
})
```

**Use when:**
- ✅ Budget constraints
- ✅ Minimal requirements
- ✅ One-time operations

---

### Pattern 6: Compliance/Audit Mode

Full logging for audit trails:

```javascript
new CookieFarmPlugin({
  namespace: 'audit_persona',
  queue: {
    autoStart: true,
    workers: 5,
    visibilityTimeout: 300000,
    captureJobData: true        // Store full payloads
  },
  cookieFarm: {
    generation: { count: 50, batchSize: 10 },
    audit: {
      enabled: true,
      resource: 'persona_audit_log',
      captureData: true
    }
  },
  puppeteer: {
    pool: { enabled: true, size: { min: 2, max: 10 } },
    logging: {
      enabled: true,
      level: 'verbose'  // Detailed logs
    }
  },
  ttl: {
    queue: { ttl: null },      // Never auto-delete
    personas: { ttl: null }     // Manual cleanup only
  }
})
```

**Use when:**
- ✅ Compliance requirements
- ✅ Audit trails needed
- ✅ Legal/regulatory constraints

---

## Queue Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoStart` | boolean | `false` | Automatically start workers when processor is set |
| `workers` | number | `5` | Concurrent worker processes |
| `visibilityTimeout` | number | `300000` | Job timeout in milliseconds |
| `maxRetries` | number | `3` | Retry attempts before DLQ |
| `deadLetterResource` | string | `'${namespace}_dlq'` | Resource for permanently failed jobs |
| `deduplicationWindow` | number | `600000` | Time window for deduplication (ms) |
| `retryStrategy` | string | `'exponential'` | `'exponential'` or `'linear'` |
| `captureJobData` | boolean | `false` | Store full job payloads for audit |

### Visibility Timeout Recommendations

| Job Type | Visibility Timeout | Example |
|----------|-------------------|---------|
| Simple generation | 60-120s | Generate 5 personas |
| With warmup | 180-300s | Generate + visit 3 sites |
| CAPTCHA-heavy | 300-600s | With CAPTCHA solving |
| Complex pipeline | 600-1200s | Multi-stage workflow |

---

## Browser Pool Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable browser pooling |
| `size.min` | number | `2` | Minimum browsers in pool |
| `size.max` | number | `10` | Maximum browsers in pool |
| `timeout` | number | `120000` | Acquire timeout (ms) |
| `warmup` | boolean | `false` | Pre-warm browsers on init |
| `maxIdleTime` | number | `600000` | Close browsers after idle (ms) |

### Pool Size Recommendations

| Scenario | Min | Max | Notes |
|----------|-----|-----|-------|
| Development | 1 | 3 | Local testing |
| Testing | 1 | 3 | CI/CD pipelines |
| Staging | 2 | 8 | Pre-production load |
| Production | 5 | 20 | Normal load |
| High-scale | 10 | 50 | 1000+ jobs/day |

**Formula:** `max = workers * 2` (typically)

---

## Proxy Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable proxy rotation |
| `providers` | array | `['brightdata']` | Proxy providers |
| `rotationStrategy` | string | `'round-robin'` | `'round-robin'` or `'least-used'` |
| `healthCheck` | boolean | `false` | Monitor proxy health |
| `healthCheckInterval` | number | `300000` | Health check frequency (ms) |

---

## CAPTCHA Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable CAPTCHA solving |
| `provider` | string | `'2captcha'` | CAPTCHA service (only `2captcha` supported) |
| `apiKey` | string | `null` | API credentials |
| `timeout` | number | `60000` | Solving timeout (ms) |
| `maxRetries` | number | `2` | Retry attempts per CAPTCHA |

### CAPTCHA Impact on Performance

- **Cost:** ~$0.002-0.01 per CAPTCHA
- **Time:** ~20-60 seconds per CAPTCHA
- **Visibility Timeout:** Increase to 300-600s when enabled
- **Worker Count:** Reduce by 30-50% (CAPTCHA bottleneck)

---

## TTL (Cleanup) Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `queue.ttl` | number | `86400000` | Job retention (24 hours) |
| `personas.ttl` | number | `2592000000` | Persona retention (30 days) |

**Retention Guidelines:**

| Data Type | Min | Recommended | Max |
|-----------|-----|-------------|-----|
| Failed jobs | 3600000 (1h) | 86400000 (24h) | 604800000 (7d) |
| Completed jobs | 3600000 (1h) | 86400000 (24h) | ∞ |
| Active personas | ∞ | ∞ | ∞ |
| Retired personas | 3600000 (1h) | 604800000 (7d) | 2592000000 (30d) |

---

## Performance Tuning

### Increasing Throughput

**Goal:** More personas generated per minute

```javascript
new CookieFarmPlugin({
  queue: {
    workers: 20,               // More workers
    deduplicationWindow: 300000 // Shorter dedup
  },
  cookieFarm: {
    generation: {
      count: 200,              // More per batch
      batchSize: 20            // Larger batches
    }
  },
  puppeteer: {
    pool: {
      enabled: true,
      size: { min: 10, max: 50 }  // Larger pool
    }
  }
})
```

**Expected improvement:** 2-3x throughput

---

### Reducing Resource Usage

**Goal:** Lower CPU/memory consumption

```javascript
new CookieFarmPlugin({
  queue: {
    workers: 2,                // Fewer workers
    visibilityTimeout: 600000  // Longer timeout
  },
  cookieFarm: {
    generation: {
      count: 10,               // Smaller batches
      batchSize: 5
    }
  },
  puppeteer: {
    pool: { enabled: false }   // Single browser
  }
})
```

**Expected improvement:** 70-80% lower resource usage

---

### Cost Optimization

**Goal:** Minimal spending on proxies/CAPTCHA

```javascript
new CookieFarmPlugin({
  queue: {
    workers: 3,
    maxRetries: 2              // Fewer retries
  },
  cookieFarm: {
    generation: { count: 20 }
  },
  puppeteer: {
    pool: { enabled: false },
    proxy: { enabled: false },  // No proxy costs
    captcha: { enabled: false } // No CAPTCHA costs
  }
})
```

**Cost savings:** 50-80% vs full-featured

---

## Resource Naming

All Cookie Farm resources are prefixed with your namespace:

```javascript
const suite = new CookieFarmPlugin({
  namespace: 'persona'
});

// Automatically created resources:
suite.jobsResource;             // 'persona_persona_jobs'
suite.persona.resource;         // 'persona_personas'
suite.deadLetterResource;       // 'persona_persona_dlq'

// Accessible via database:
const jobs = await db.getResource('persona_persona_jobs');
const personas = await db.getResource('persona_personas');
const dlq = await db.getResource('persona_persona_dlq');
```

**Cleanup resources:**
```javascript
// Delete all persona resources when done
const resources = await db.listResources();
const personaResources = resources.filter(r => r.name.startsWith('persona_'));
for (const resource of personaResources) {
  await db.deleteResource(resource.name);
}
```

---

## Environment-Specific Configuration

Load configuration from environment:

```javascript
const config = {
  namespace: `${process.env.NODE_ENV}_persona`,
  queue: {
    autoStart: process.env.NODE_ENV === 'production',
    workers: parseInt(process.env.WORKERS || '5'),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3')
  },
  cookieFarm: {
    generation: {
      count: parseInt(process.env.GENERATION_COUNT || '100'),
      strategy: process.env.GENERATION_STRATEGY || 'standard'
    },
    warmup: {
      enabled: process.env.WARMUP_ENABLED === 'true'
    }
  },
  puppeteer: {
    pool: {
      enabled: process.env.BROWSER_POOL_ENABLED === 'true',
      size: {
        min: parseInt(process.env.BROWSER_MIN || '2'),
        max: parseInt(process.env.BROWSER_MAX || '10')
      }
    }
  }
};

const suite = new CookieFarmPlugin(config);
```

---

## Next Steps

1. **See usage patterns** → [Usage Patterns](./usage-patterns.md)
2. **Learn best practices** → [Best Practices](./best-practices.md)

---

**Prev:** [← Getting Started](./getting-started.md)
**Next:** [Usage Patterns →](./usage-patterns.md)
**Main:** [← Cookie Farm Plugin](../README.md)
