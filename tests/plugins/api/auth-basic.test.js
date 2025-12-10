/**
 * Tests for Basic Authentication - Unit Tests
 * @group api
 * @group auth
 */

import { parseBasicAuth } from '../../../src/plugins/api/auth/basic-auth.js';

describe('Basic Authentication', () => {
  describe('parseBasicAuth', () => {
    test('parses valid Basic auth header', () => {
      const encoded = Buffer.from('user:password').toString('base64');
      const result = parseBasicAuth(`Basic ${encoded}`);

      expect(result).toEqual({
        username: 'user',
        password: 'password'
      });
    });

    test('handles password with colons', () => {
      const encoded = Buffer.from('user:pass:word:with:colons').toString('base64');
      const result = parseBasicAuth(`Basic ${encoded}`);

      expect(result).toEqual({
        username: 'user',
        password: 'pass:word:with:colons'
      });
    });

    test('returns null for missing header', () => {
      expect(parseBasicAuth(null)).toBeNull();
      expect(parseBasicAuth(undefined)).toBeNull();
    });

    test('returns null for empty string', () => {
      expect(parseBasicAuth('')).toBeNull();
    });

    test('returns null for non-Basic scheme', () => {
      expect(parseBasicAuth('Bearer token123')).toBeNull();
      expect(parseBasicAuth('Digest user:pass')).toBeNull();
    });

    test('returns null for invalid base64', () => {
      expect(parseBasicAuth('Basic !!!invalid!!!')).toBeNull();
    });

    test('returns null for missing username', () => {
      const noUser = Buffer.from(':password').toString('base64');
      expect(parseBasicAuth(`Basic ${noUser}`)).toBeNull();
    });

    test('returns null for missing password', () => {
      const noPassword = Buffer.from('useronly').toString('base64');
      expect(parseBasicAuth(`Basic ${noPassword}`)).toBeNull();
    });

    test('is case-insensitive for Basic keyword', () => {
      const encoded = Buffer.from('user:pass').toString('base64');
      expect(parseBasicAuth(`basic ${encoded}`)).toEqual({ username: 'user', password: 'pass' });
      expect(parseBasicAuth(`BASIC ${encoded}`)).toEqual({ username: 'user', password: 'pass' });
      expect(parseBasicAuth(`BaSiC ${encoded}`)).toEqual({ username: 'user', password: 'pass' });
    });

    test('handles special characters in password', () => {
      const encoded = Buffer.from('user:p@$$w0rd!#$%^&*()').toString('base64');
      const result = parseBasicAuth(`Basic ${encoded}`);

      expect(result).toEqual({
        username: 'user',
        password: 'p@$$w0rd!#$%^&*()'
      });
    });

    test('handles unicode characters', () => {
      const encoded = Buffer.from('usuário:senhaç').toString('base64');
      const result = parseBasicAuth(`Basic ${encoded}`);

      expect(result).toEqual({
        username: 'usuário',
        password: 'senhaç'
      });
    });

    test('handles email as username', () => {
      const encoded = Buffer.from('user@example.com:password').toString('base64');
      const result = parseBasicAuth(`Basic ${encoded}`);

      expect(result).toEqual({
        username: 'user@example.com',
        password: 'password'
      });
    });
  });
});
