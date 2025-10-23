/**
 * Example 64: Testable Hooks - Extracting Hooks for Unit Testing
 *
 * Demonstrates how to write testable hooks by extracting them into
 * named functions that can be unit tested in isolation.
 *
 * To run with LocalStack:
 *   1. Start: localstack start
 *   2. Run: node docs/examples/e64-testable-hooks.js
 */

import { Database } from '../../src/index.js';

console.log('\n🧪 Testable Hooks - Best Practices\n');

// ============================================================================
// PART 1: Extract Hooks into Named Functions
// ============================================================================

// ✅ GOOD: Named, exportable, testable functions
export async function validateDomain(data, context = {}) {
  const { log = console } = context;

  if (!data.domain) {
    throw new Error('Domain required for URL');
  }

  // Validate domain format
  const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;
  if (!domainRegex.test(data.domain)) {
    throw new Error(`Invalid domain format: ${data.domain}`);
  }

  log.info?.({ link: data.link, domain: data.domain }, 'URL domain validated');
  return data;
}

export async function sanitizeUrl(data, context = {}) {
  const { log = console } = context;

  // Remove tracking parameters
  const url = new URL(data.link);
  const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'];

  trackingParams.forEach(param => {
    url.searchParams.delete(param);
  });

  data.cleanLink = url.toString();

  log.info?.({ original: data.link, clean: data.cleanLink }, 'URL sanitized');
  return data;
}

export async function generateShortCode(data, context = {}) {
  const { log = console } = context;

  // Generate short code if not provided
  if (!data.shortCode) {
    data.shortCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  log.info?.({ shortCode: data.shortCode }, 'Short code generated');
  return data;
}

export async function incrementClicks(data, context = {}) {
  const { db, log = console } = context;

  if (!db) {
    throw new Error('Database context required for incrementClicks hook');
  }

  log.info?.({ urlId: data.id }, 'Incrementing click count');

  // Increment click counter (example - would use actual counter method)
  // await db.resources.urls.update(data.id, {
  //   clicks: (data.clicks || 0) + 1
  // });

  return data;
}

export async function notifyAnalytics(data, context = {}) {
  const { analytics, log = console } = context;

  if (!analytics) {
    log.warn?.('Analytics service not available, skipping notification');
    return data;
  }

  // Send to analytics service
  await analytics.track('url_created', {
    urlId: data.id,
    domain: data.domain,
    userId: data.userId
  });

  log.info?.({ urlId: data.id }, 'Analytics notified');
  return data;
}

// ============================================================================
// PART 2: Use Named Hooks in Resource Configuration
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Part 1: Using Named Hooks');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const connectionString = 's3://test:test@testable-hooks?region=us-east-1&endpoint=http://localhost:4566&forcePathStyle=true';
const db = new Database({ connectionString });

try {
  await db.connect();
  console.log('✅ Connected to database\n');
} catch (error) {
  console.error('❌ Failed to connect');
  console.error('Make sure LocalStack is running: localstack start\n');
  process.exit(1);
}

// Create resource with named, testable hooks
const urls = await db.createResource({
  name: 'urls',
  attributes: {
    userId: 'string|required',
    link: 'string|required',
    domain: 'string|required',
    shortCode: 'string',
    cleanLink: 'string',
    clicks: 'number|default:0'
  },
  timestamps: true,

  // ✅ GOOD: Use named functions (testable!)
  hooks: {
    beforeInsert: [
      validateDomain,
      sanitizeUrl,
      generateShortCode
    ],

    afterInsert: [
      // Can pass context to hooks
      async (data) => {
        // Wrapper that provides context
        const context = {
          db,
          log: console,
          analytics: null // Mock analytics service
        };
        return await notifyAnalytics(data, context);
      }
    ]
  }
});

console.log('🔹 Testing hooks with real data:\n');

// Test 1: Valid URL
console.log('1. Insert valid URL:');
try {
  const url1 = await urls.insert({
    userId: 'user-123',
    link: 'https://example.com/page?utm_source=twitter',
    domain: 'example.com'
  });
  console.log(`   ✅ Created: ${url1.shortCode}`);
  console.log(`   📝 Clean link: ${url1.cleanLink}\n`);
} catch (err) {
  console.error(`   ❌ Error: ${err.message}\n`);
}

// Test 2: Missing domain
console.log('2. Insert without domain (should fail):');
try {
  await urls.insert({
    userId: 'user-123',
    link: 'https://example.com/page'
  });
} catch (err) {
  console.error(`   ❌ Validation failed (expected): ${err.message}\n`);
}

// Test 3: Invalid domain
console.log('3. Insert with invalid domain (should fail):');
try {
  await urls.insert({
    userId: 'user-123',
    link: 'https://invalid..domain.com/page',
    domain: 'invalid..domain'
  });
} catch (err) {
  console.error(`   ❌ Validation failed (expected): ${err.message}\n`);
}

// ============================================================================
// PART 3: Unit Testing Hooks
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Part 2: Unit Testing Hooks');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🧪 Running unit tests for hooks:\n');

// Test validateDomain
console.log('Test: validateDomain()');
try {
  // Should pass
  const validData = { domain: 'example.com', link: 'https://example.com' };
  await validateDomain(validData);
  console.log('  ✅ Valid domain accepted\n');

  // Should fail
  try {
    await validateDomain({ link: 'https://example.com' });
    console.log('  ❌ Should have thrown error\n');
  } catch (err) {
    console.log(`  ✅ Missing domain rejected: ${err.message}\n`);
  }

  // Should fail
  try {
    await validateDomain({ domain: 'invalid..domain', link: 'https://invalid' });
    console.log('  ❌ Should have thrown error\n');
  } catch (err) {
    console.log(`  ✅ Invalid format rejected: ${err.message}\n`);
  }
} catch (err) {
  console.error(`  ❌ Test failed: ${err.message}\n`);
}

// Test sanitizeUrl
console.log('Test: sanitizeUrl()');
try {
  const data = {
    link: 'https://example.com/page?utm_source=twitter&utm_medium=social&ref=homepage'
  };
  const result = await sanitizeUrl(data);

  const hasTracking = result.cleanLink.includes('utm_');
  const hasRef = result.cleanLink.includes('ref=');

  if (!hasTracking && hasRef) {
    console.log(`  ✅ Tracking params removed: ${result.cleanLink}\n`);
  } else {
    console.log(`  ❌ Sanitization failed\n`);
  }
} catch (err) {
  console.error(`  ❌ Test failed: ${err.message}\n`);
}

// Test generateShortCode
console.log('Test: generateShortCode()');
try {
  // Without short code
  const data1 = { link: 'https://example.com' };
  const result1 = await generateShortCode(data1);
  if (result1.shortCode && result1.shortCode.length === 6) {
    console.log(`  ✅ Short code generated: ${result1.shortCode}`);
  } else {
    console.log('  ❌ Short code generation failed');
  }

  // With short code (should keep it)
  const data2 = { link: 'https://example.com', shortCode: 'CUSTOM' };
  const result2 = await generateShortCode(data2);
  if (result2.shortCode === 'CUSTOM') {
    console.log(`  ✅ Existing short code preserved: ${result2.shortCode}\n`);
  } else {
    console.log('  ❌ Short code override failed\n');
  }
} catch (err) {
  console.error(`  ❌ Test failed: ${err.message}\n`);
}

// ============================================================================
// PART 4: Hook Composition Patterns
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Part 3: Hook Composition Patterns');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Pattern 1: Hook Factory (for dependency injection)
function createIncrementClicksHook(db, log) {
  return async (data) => {
    return await incrementClicks(data, { db, log });
  };
}

// Pattern 2: Composable Hooks
function composeHooks(...hooks) {
  return async (data, context) => {
    let result = data;
    for (const hook of hooks) {
      result = await hook(result, context);
    }
    return result;
  };
}

// Pattern 3: Conditional Hooks
function conditionalHook(condition, hook) {
  return async (data, context) => {
    if (condition(data, context)) {
      return await hook(data, context);
    }
    return data;
  };
}

console.log('🔹 Hook Composition Examples:\n');

// Example: Compose multiple validations
const validateUrl = composeHooks(
  validateDomain,
  sanitizeUrl,
  generateShortCode
);

try {
  const testData = {
    domain: 'example.com',
    link: 'https://example.com/page?utm_source=test'
  };

  const result = await validateUrl(testData);
  console.log('✅ Composed validation passed');
  console.log(`   Short code: ${result.shortCode}`);
  console.log(`   Clean link: ${result.cleanLink}\n`);
} catch (err) {
  console.error(`❌ Composed validation failed: ${err.message}\n`);
}

// ============================================================================
// PART 5: Testing Best Practices
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Part 4: Testing Best Practices');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log(`
✅ Best Practices for Testable Hooks:

1. Extract to Named Functions
   ✅ export async function validateDomain(data, context) { ... }
   ❌ hooks: { beforeInsert: [async (data) => { ... }] }

2. Use Dependency Injection
   ✅ Pass dependencies via context parameter
   ❌ Import dependencies directly in hook

3. Keep Hooks Pure
   ✅ No side effects except through context
   ❌ Direct access to global state

4. Write Unit Tests
   ✅ Test each hook in isolation
   ✅ Mock context dependencies
   ✅ Test error cases

5. Document Hook Contracts
   ✅ Document expected data shape
   ✅ Document context requirements
   ✅ Document return value

Example Test File (hooks/validate-domain.test.js):
───────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { validateDomain } from './validate-domain.js';

describe('validateDomain', () => {
  it('accepts valid domain', async () => {
    const data = { domain: 'example.com', link: 'https://example.com' };
    const result = await validateDomain(data);
    expect(result.domain).toBe('example.com');
  });

  it('rejects missing domain', async () => {
    const data = { link: 'https://example.com' };
    await expect(validateDomain(data))
      .rejects.toThrow('Domain required');
  });

  it('rejects invalid domain format', async () => {
    const data = { domain: 'invalid..com', link: 'https://invalid' };
    await expect(validateDomain(data))
      .rejects.toThrow('Invalid domain format');
  });

  it('logs validation events', async () => {
    const logMock = { info: vi.fn() };
    const data = { domain: 'example.com', link: 'https://example.com' };

    await validateDomain(data, { log: logMock });

    expect(logMock.info).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'example.com' }),
      expect.any(String)
    );
  });
});
───────────────────────────────────────────────────
`);

// ============================================================================
// Summary
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Summary');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('✅ Testable Hooks Pattern:');
console.log('   • Extract hooks into named functions');
console.log('   • Export for unit testing');
console.log('   • Use dependency injection via context');
console.log('   • Write isolated unit tests\n');

console.log('✅ Benefits:');
console.log('   • Easy to unit test');
console.log('   • Reusable across resources');
console.log('   • Easy to debug');
console.log('   • No coupling to App context\n');

console.log('🎯 Migration Path:');
console.log('   1. Extract inline hooks to named functions');
console.log('   2. Add context parameter for dependencies');
console.log('   3. Write unit tests');
console.log('   4. Refactor gradually\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

process.exit(0);
