/**
 * Tests for API Key Authentication - Unit Tests
 * @group api
 * @group auth
 */

import { generateApiKey } from '../../../src/plugins/api/auth/api-key-auth.js';

describe('API Key Authentication', () => {
  describe('generateApiKey', () => {
    test('generates API key with default length (32)', () => {
      const key = generateApiKey();
      expect(key).toHaveLength(32);
      expect(key).toMatch(/^[A-Za-z0-9]+$/);
    });

    test('generates API key with custom length', () => {
      const key = generateApiKey(64);
      expect(key).toHaveLength(64);
    });

    test('generates API key with short length', () => {
      const key = generateApiKey(16);
      expect(key).toHaveLength(16);
    });

    test('generates unique keys', () => {
      const keys = new Set();
      for (let i = 0; i < 100; i++) {
        keys.add(generateApiKey());
      }
      expect(keys.size).toBe(100);
    });

    test('only contains alphanumeric characters', () => {
      for (let i = 0; i < 10; i++) {
        const key = generateApiKey(100);
        expect(key).toMatch(/^[A-Za-z0-9]+$/);
      }
    });

    test('generates keys of various sizes', () => {
      const sizes = [8, 16, 32, 64, 128];
      for (const size of sizes) {
        const key = generateApiKey(size);
        expect(key).toHaveLength(size);
      }
    });
  });
});
