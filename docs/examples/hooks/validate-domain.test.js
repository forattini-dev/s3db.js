/**
 * Unit Tests for validateDomain Hook
 *
 * Run with: node --test hooks/validate-domain.test.js
 * Or with vitest: vitest hooks/validate-domain.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateDomain } from './validate-domain.js';

describe('validateDomain', () => {
  describe('valid domains', () => {
    it('should accept simple domain', async () => {
      const data = {
        domain: 'example.com',
        link: 'https://example.com'
      };

      const result = await validateDomain(data);

      assert.strictEqual(result.domain, 'example.com');
      assert.strictEqual(result.link, 'https://example.com');
    });

    it('should accept subdomain', async () => {
      const data = {
        domain: 'sub.example.com',
        link: 'https://sub.example.com'
      };

      const result = await validateDomain(data);

      assert.strictEqual(result.domain, 'sub.example.com');
    });

    it('should accept multi-level subdomain', async () => {
      const data = {
        domain: 'deep.sub.example.com',
        link: 'https://deep.sub.example.com'
      };

      const result = await validateDomain(data);

      assert.strictEqual(result.domain, 'deep.sub.example.com');
    });

    it('should accept domain with numbers', async () => {
      const data = {
        domain: 'example123.com',
        link: 'https://example123.com'
      };

      const result = await validateDomain(data);

      assert.strictEqual(result.domain, 'example123.com');
    });

    it('should accept domain with hyphen', async () => {
      const data = {
        domain: 'my-example.com',
        link: 'https://my-example.com'
      };

      const result = await validateDomain(data);

      assert.strictEqual(result.domain, 'my-example.com');
    });
  });

  describe('invalid domains', () => {
    it('should reject missing domain', async () => {
      const data = {
        link: 'https://example.com'
      };

      await assert.rejects(
        () => validateDomain(data),
        {
          name: 'Error',
          message: 'Domain required for URL'
        }
      );
    });

    it('should reject double dots', async () => {
      const data = {
        domain: 'invalid..com',
        link: 'https://invalid..com'
      };

      await assert.rejects(
        () => validateDomain(data),
        {
          name: 'Error',
          message: /Invalid domain format/
        }
      );
    });

    it('should reject leading hyphen', async () => {
      const data = {
        domain: '-invalid.com',
        link: 'https://-invalid.com'
      };

      await assert.rejects(
        () => validateDomain(data),
        {
          name: 'Error',
          message: /Invalid domain format/
        }
      );
    });

    it('should reject leading dot', async () => {
      const data = {
        domain: '.example.com',
        link: 'https://.example.com'
      };

      await assert.rejects(
        () => validateDomain(data),
        {
          name: 'Error',
          message: /Invalid domain format/
        }
      );
    });

    it('should reject single-level domain', async () => {
      const data = {
        domain: 'localhost',
        link: 'http://localhost'
      };

      await assert.rejects(
        () => validateDomain(data),
        {
          name: 'Error',
          message: /Invalid domain format/
        }
      );
    });

    it('should reject empty domain', async () => {
      const data = {
        domain: '',
        link: 'https://example.com'
      };

      await assert.rejects(
        () => validateDomain(data),
        {
          name: 'Error',
          message: 'Domain required for URL'
        }
      );
    });
  });

  describe('logging', () => {
    it('should log validation events', async () => {
      const logCalls = [];
      const logMock = {
        info: (meta, message) => {
          logCalls.push({ meta, message });
        }
      };

      const data = {
        domain: 'example.com',
        link: 'https://example.com'
      };

      await validateDomain(data, { log: logMock });

      assert.strictEqual(logCalls.length, 1);
      assert.strictEqual(logCalls[0].meta.domain, 'example.com');
      assert.strictEqual(logCalls[0].message, 'URL domain validated');
    });

    it('should work without logger', async () => {
      const data = {
        domain: 'example.com',
        link: 'https://example.com'
      };

      // Should not throw
      const result = await validateDomain(data, {});

      assert.strictEqual(result.domain, 'example.com');
    });
  });

  describe('data immutability', () => {
    it('should not mutate input data', async () => {
      const data = {
        domain: 'example.com',
        link: 'https://example.com',
        otherField: 'preserved'
      };

      const result = await validateDomain(data);

      // All original fields should be preserved
      assert.strictEqual(result.domain, data.domain);
      assert.strictEqual(result.link, data.link);
      assert.strictEqual(result.otherField, data.otherField);
    });
  });
});

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running validateDomain tests...\n');
}
