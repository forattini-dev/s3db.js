/**
 * Tests for HKDF key derivation (RFC 5869)
 * @group api
 */

import { deriveKey, deriveKeystore, deriveOidcKeys, deriveJwtKeys } from '../../../src/plugins/api/concerns/crypto.js';

describe('HKDF Key Derivation', () => {
  const testSecret = 'my-super-secret-at-least-32-chars-long!!!';

  describe('deriveKey', () => {
    test('derives key from string secret', () => {
      const key = deriveKey(testSecret, 'Test Context');
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32); // Default length
    });

    test('derives key from Buffer secret', () => {
      const secretBuffer = Buffer.from(testSecret, 'utf8');
      const key = deriveKey(secretBuffer, 'Test Context');
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    test('derives keys with custom length', () => {
      const key16 = deriveKey(testSecret, 'Test', 16);
      const key64 = deriveKey(testSecret, 'Test', 64);
      expect(key16.length).toBe(16);
      expect(key64.length).toBe(64);
    });

    test('different contexts produce different keys', () => {
      const key1 = deriveKey(testSecret, 'Context A');
      const key2 = deriveKey(testSecret, 'Context B');
      expect(key1).not.toEqual(key2);
    });

    test('same context produces same key (deterministic)', () => {
      const key1 = deriveKey(testSecret, 'Same Context');
      const key2 = deriveKey(testSecret, 'Same Context');
      expect(key1).toEqual(key2);
    });
  });

  describe('deriveKeystore', () => {
    test('derives keystore from single secret', () => {
      const { current, keystore } = deriveKeystore(
        testSecret,
        'Encryption',
        'Signing'
      );

      expect(current).toHaveProperty('encryption');
      expect(current).toHaveProperty('signing');
      expect(current.encryption).toBeInstanceOf(Buffer);
      expect(current.signing).toBeInstanceOf(Buffer);
      expect(current.encryption).not.toEqual(current.signing);

      expect(keystore).toHaveLength(1);
      expect(keystore[0]).toEqual(current);
    });

    test('derives keystore from multiple secrets (rotation)', () => {
      const secrets = [
        'new-secret-32-chars-long!!!!!!!!',
        'old-secret-32-chars-long!!!!!!!!',
      ];

      const { current, keystore } = deriveKeystore(
        secrets,
        'Encryption',
        'Signing'
      );

      // Current should be from first secret (newest)
      expect(current.encryption).toEqual(keystore[0].encryption);
      expect(current.signing).toEqual(keystore[0].signing);

      // Should have keys for all secrets
      expect(keystore).toHaveLength(2);

      // Keys from different secrets should differ
      expect(keystore[0].encryption).not.toEqual(keystore[1].encryption);
      expect(keystore[0].signing).not.toEqual(keystore[1].signing);
    });
  });

  describe('deriveOidcKeys', () => {
    test('derives OIDC session keys', () => {
      const { current, keystore } = deriveOidcKeys(testSecret);

      expect(current).toHaveProperty('encryption');
      expect(current).toHaveProperty('signing');
      expect(current.encryption).toBeInstanceOf(Buffer);
      expect(current.signing).toBeInstanceOf(Buffer);
      expect(current.encryption).not.toEqual(current.signing);

      expect(keystore).toHaveLength(1);
    });

    test('supports key rotation', () => {
      const secrets = ['new-secret-32!!!!!!!!!!!!!!!!!', 'old-secret-32!!!!!!!!!!!!!!!!!'];
      const { current, keystore } = deriveOidcKeys(secrets);

      expect(keystore).toHaveLength(2);
      expect(current).toEqual(keystore[0]);
    });
  });

  describe('deriveJwtKeys', () => {
    test('derives JWT signing keys', () => {
      const { current, keystore } = deriveJwtKeys(testSecret);

      expect(current).toHaveProperty('signing');
      expect(current.signing).toBeInstanceOf(Buffer);

      expect(keystore).toHaveLength(1);
    });

    test('supports key rotation', () => {
      const secrets = ['new-jwt-secret-32-chars!!!!!!!!', 'old-jwt-secret-32-chars!!!!!!!!'];
      const { current, keystore } = deriveJwtKeys(secrets);

      expect(keystore).toHaveLength(2);
      expect(current.signing).toEqual(keystore[0].signing);
    });
  });

  describe('Security properties', () => {
    test('different secrets with same context produce different keys', () => {
      const key1 = deriveKey('secret1-32-chars-long!!!!!!!!!!!!', 'Context');
      const key2 = deriveKey('secret2-32-chars-long!!!!!!!!!!!!', 'Context');
      expect(key1).not.toEqual(key2);
    });

    test('encryption and signing keys are different', () => {
      const { current } = deriveOidcKeys(testSecret);
      expect(current.encryption).not.toEqual(current.signing);
    });

    test('derived keys have sufficient entropy', () => {
      const key = deriveKey(testSecret, 'Entropy Test');

      // Check that key bytes have variance (not all zeros or all same value)
      const uniqueBytes = new Set(key);
      expect(uniqueBytes.size).toBeGreaterThan(10); // Expect diverse byte values
    });
  });
});
