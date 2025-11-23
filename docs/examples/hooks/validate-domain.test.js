/**
 * Unit Tests for validateDomain Hook
 *
 * Run with: node --test hooks/validate-domain.test.js
 * Or with vitest: vitest hooks/validate-domain.test.js
 */

import { describe, it, expect } from '@jest/globals';
import { validateDomain } from './validate-domain.js';

describe('validateDomain', () => {
  describe('valid domains', () => {
    it('should accept simple domain', async () => {
      const data = {
        domain: 'example.com',
        link: 'https://example.com'
      };

      const result = await validateDomain(data);

      expect(result.domain).toBe('example.com');
      expect(result.link).toBe('https://example.com');
    });

    it('should accept subdomain', async () => {
      const data = {
        domain: 'sub.example.com',
        link: 'https://sub.example.com'
      };

      const result = await validateDomain(data);

      expect(result.domain).toBe('sub.example.com');
    });

    it('should accept multi-level subdomain', async () => {
      const data = {
        domain: 'deep.sub.example.com',
        link: 'https://deep.sub.example.com'
      };

      const result = await validateDomain(data);

      expect(result.domain).toBe('deep.sub.example.com');
    });

    it('should accept domain with numbers', async () => {
      const data = {
        domain: 'example123.com',
        link: 'https://example123.com'
      };

      const result = await validateDomain(data);

      expect(result.domain).toBe('example123.com');
    });

    it('should accept domain with hyphen', async () => {
      const data = {
        domain: 'my-example.com',
        link: 'https://my-example.com'
      };

      const result = await validateDomain(data);

      expect(result.domain).toBe('my-example.com');
    });
  });

  describe('invalid domains', () => {
    it('should reject missing domain', async () => {
      const data = {
        link: 'https://example.com'
      };

      await expect(validateDomain(data)).rejects.toMatchObject({
        name: 'Error',
        message: 'Domain required for URL'
      });
    });

    it('should reject double dots', async () => {
      const data = {
        domain: 'invalid..com',
        link: 'https://invalid..com'
      };

      await expect(validateDomain(data)).rejects.toMatchObject({
        name: 'Error',
        message: expect.stringMatching(/Invalid domain format/)
      });
    });

    it('should reject leading hyphen', async () => {
      const data = {
        domain: '-invalid.com',
        link: 'https://-invalid.com'
      };

      await expect(validateDomain(data)).rejects.toMatchObject({
        name: 'Error',
        message: expect.stringMatching(/Invalid domain format/)
      });
    });

    it('should reject leading dot', async () => {
      const data = {
        domain: '.example.com',
        link: 'https://.example.com'
      };

      await expect(validateDomain(data)).rejects.toMatchObject({
        name: 'Error',
        message: expect.stringMatching(/Invalid domain format/)
      });
    });

    it('should reject single-level domain', async () => {
      const data = {
        domain: 'localhost',
        link: 'http://localhost'
      };

      await expect(validateDomain(data)).rejects.toMatchObject({
        name: 'Error',
        message: expect.stringMatching(/Invalid domain format/)
      });
    });

    it('should reject empty domain', async () => {
      const data = {
        domain: '',
        link: 'https://example.com'
      };

      await expect(validateDomain(data)).rejects.toMatchObject({
        name: 'Error',
        message: 'Domain required for URL'
      });
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

      expect(logCalls.length).toBe(1);
      expect(logCalls[0].meta.domain).toBe('example.com');
      expect(logCalls[0].message).toBe('URL domain validated');
    });

    it('should work without logger', async () => {
      const data = {
        domain: 'example.com',
        link: 'https://example.com'
      };

      // Should not throw
      const result = await validateDomain(data, {});

      expect(result.domain).toBe('example.com');
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
      expect(result.domain).toBe(data.domain);
      expect(result.link).toBe(data.link);
      expect(result.otherField).toBe(data.otherField);
    });
  });
});
