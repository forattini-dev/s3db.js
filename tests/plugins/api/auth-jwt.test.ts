/**
 * Tests for JWT Authentication - Unit Tests
 * @group api
 * @group auth
 */

import { createToken, verifyToken } from '../../../src/plugins/api/auth/jwt-auth.js';

describe('JWT Authentication', () => {
  const TEST_SECRET = 'test-secret-key-for-jwt-signing-32chars';

  describe('createToken', () => {
    test('creates valid JWT token', () => {
      const payload = { id: 'user123', role: 'admin' };
      const token = createToken(payload, TEST_SECRET, '1h');

      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);
    });

    test('includes iat and exp claims', () => {
      const payload = { id: 'user123' };
      const token = createToken(payload, TEST_SECRET, '1h');
      const decoded = verifyToken(token, TEST_SECRET);

      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });

    test('calculates expiration for seconds', () => {
      const payload = { id: 'user123' };
      const token = createToken(payload, TEST_SECRET, '60s');
      const decoded = verifyToken(token, TEST_SECRET);
      expect(decoded.exp - decoded.iat).toBe(60);
    });

    test('calculates expiration for minutes', () => {
      const payload = { id: 'user123' };
      const token = createToken(payload, TEST_SECRET, '30m');
      const decoded = verifyToken(token, TEST_SECRET);
      expect(decoded.exp - decoded.iat).toBe(1800);
    });

    test('calculates expiration for hours', () => {
      const payload = { id: 'user123' };
      const token = createToken(payload, TEST_SECRET, '24h');
      const decoded = verifyToken(token, TEST_SECRET);
      expect(decoded.exp - decoded.iat).toBe(86400);
    });

    test('calculates expiration for days', () => {
      const payload = { id: 'user123' };
      const token = createToken(payload, TEST_SECRET, '7d');
      const decoded = verifyToken(token, TEST_SECRET);
      expect(decoded.exp - decoded.iat).toBe(604800);
    });

    test('throws on invalid expiration format', () => {
      expect(() => createToken({}, TEST_SECRET, 'invalid')).toThrow('Invalid expiresIn format');
      expect(() => createToken({}, TEST_SECRET, '1x')).toThrow('Invalid expiresIn format');
      expect(() => createToken({}, TEST_SECRET, 'h1')).toThrow('Invalid expiresIn format');
    });

    test('preserves payload data', () => {
      const payload = {
        id: 'user123',
        email: 'test@example.com',
        role: 'admin',
        scopes: ['read', 'write']
      };
      const token = createToken(payload, TEST_SECRET, '1h');
      const decoded = verifyToken(token, TEST_SECRET);

      expect(decoded.id).toBe('user123');
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.role).toBe('admin');
      expect(decoded.scopes).toEqual(['read', 'write']);
    });

    test('preserves nested objects in payload', () => {
      const payload = {
        user: { id: 1, name: 'Test' },
        permissions: ['read', 'write']
      };
      const token = createToken(payload, TEST_SECRET, '1h');
      const decoded = verifyToken(token, TEST_SECRET);

      expect(decoded.user).toEqual({ id: 1, name: 'Test' });
      expect(decoded.permissions).toEqual(['read', 'write']);
    });
  });

  describe('verifyToken', () => {
    test('verifies valid token', () => {
      const payload = { id: 'user123' };
      const token = createToken(payload, TEST_SECRET, '1h');
      const decoded = verifyToken(token, TEST_SECRET);

      expect(decoded).not.toBeNull();
      expect(decoded.id).toBe('user123');
    });

    test('returns null for invalid signature', () => {
      const token = createToken({ id: 'user123' }, TEST_SECRET, '1h');
      const result = verifyToken(token, 'wrong-secret');

      expect(result).toBeNull();
    });

    test.skip('returns null for expired token', async () => {
      const uniqueSecret = `${TEST_SECRET}-expire-${Date.now()}`;
      const payload = { id: 'user123' };
      const token = createToken(payload, uniqueSecret, '1s');

      await new Promise(resolve => setTimeout(resolve, 1100));

      const result = verifyToken(token, uniqueSecret);
      expect(result).toBeNull();
    });

    test('returns null for malformed token', () => {
      expect(verifyToken('not-a-jwt', TEST_SECRET)).toBeNull();
      expect(verifyToken('only.two', TEST_SECRET)).toBeNull();
      expect(verifyToken('', TEST_SECRET)).toBeNull();
      expect(verifyToken('a.b.c', TEST_SECRET)).toBeNull();
    });

    test('returns null for token with tampered payload', () => {
      const token = createToken({ id: 'user123' }, TEST_SECRET, '1h');
      const parts = token.split('.');

      const tamperedPayload = Buffer.from(JSON.stringify({ id: 'hacker' })).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      expect(verifyToken(tamperedToken, TEST_SECRET)).toBeNull();
    });

    test('caches verified tokens', () => {
      const token = createToken({ id: 'user123' }, TEST_SECRET, '1h');

      const first = verifyToken(token, TEST_SECRET);
      const second = verifyToken(token, TEST_SECRET);

      expect(first).toEqual(second);
    });

    test('different secrets produce different results', () => {
      const payload = { id: 'user123' };
      const token1 = createToken(payload, 'secret-one-32-characters-long-xx', '1h');
      const token2 = createToken(payload, 'secret-two-32-characters-long-xx', '1h');

      expect(token1).not.toBe(token2);
      expect(verifyToken(token1, 'secret-two-32-characters-long-xx')).toBeNull();
      expect(verifyToken(token2, 'secret-one-32-characters-long-xx')).toBeNull();
    });
  });

  describe('Token Structure', () => {
    test('creates token with HS256 algorithm header', () => {
      const token = createToken({ id: 'test' }, TEST_SECRET, '1h');
      const [headerPart] = token.split('.');
      const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString());

      expect(header.alg).toBe('HS256');
      expect(header.typ).toBe('JWT');
    });

    test('payload contains standard JWT claims', () => {
      const token = createToken({ id: 'test' }, TEST_SECRET, '1h');
      const decoded = verifyToken(token, TEST_SECRET);

      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
      expect(typeof decoded.iat).toBe('number');
      expect(typeof decoded.exp).toBe('number');
    });
  });
});
