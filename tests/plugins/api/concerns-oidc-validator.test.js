/**
 * Tests for OIDC Validation Utilities
 * @group api
 */

import {
  validateIdToken,
  validateAccessToken,
  validateRefreshToken,
  validateTokenResponse,
  validateUserinfo,
  validateConfig,
  getUserFriendlyError
} from '../../../src/plugins/api/concerns/oidc-validator.js';

describe('OIDC Validator', () => {
  describe('validateIdToken', () => {
    const baseConfig = {
      issuer: 'https://accounts.google.com',
      clientId: 'test-client-id'
    };

    const validClaims = {
      iss: 'https://accounts.google.com',
      aud: 'test-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      iat: Math.floor(Date.now() / 1000),
      sub: 'user-123'
    };

    test('accepts valid ID token', () => {
      const result = validateIdToken(validClaims, baseConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeNull();
    });

    test('rejects missing issuer', () => {
      const claims = { ...validClaims, iss: undefined };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing issuer (iss) claim');
    });

    test('rejects invalid issuer', () => {
      const claims = { ...validClaims, iss: 'https://evil.com' };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid issuer');
    });

    test('rejects missing audience', () => {
      const claims = { ...validClaims, aud: undefined };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing audience (aud) claim');
    });

    test('rejects invalid audience', () => {
      const claims = { ...validClaims, aud: 'wrong-client-id' };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid audience');
    });

    test('requires azp for multiple audiences', () => {
      const claims = { ...validClaims, aud: ['test-client-id', 'other-client'] };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Missing azp claim');
    });

    test('accepts azp with multiple audiences', () => {
      const claims = {
        ...validClaims,
        aud: ['test-client-id', 'other-client'],
        azp: 'test-client-id'
      };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(true);
    });

    test('rejects expired token', () => {
      const claims = { ...validClaims, exp: Math.floor(Date.now() / 1000) - 3600 }; // 1 hour ago
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Token expired');
    });

    test('rejects token issued in the future', () => {
      const claims = { ...validClaims, iat: Math.floor(Date.now() / 1000) + 3600 };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('issued in the future');
    });

    test('rejects token that is too old', () => {
      const claims = { ...validClaims, iat: Math.floor(Date.now() / 1000) - 90000 }; // 25 hours ago
      const result = validateIdToken(claims, baseConfig, { maxAge: 86400 }); // 24 hour max
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('too old');
    });

    test('validates nonce when provided', () => {
      const claims = { ...validClaims, nonce: 'test-nonce' };
      const result = validateIdToken(claims, baseConfig, { nonce: 'test-nonce' });
      expect(result.valid).toBe(true);
    });

    test('rejects nonce mismatch', () => {
      const claims = { ...validClaims, nonce: 'wrong-nonce' };
      const result = validateIdToken(claims, baseConfig, { nonce: 'test-nonce' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid nonce');
    });

    test('rejects missing nonce when expected', () => {
      const claims = { ...validClaims };
      const result = validateIdToken(claims, baseConfig, { nonce: 'expected-nonce' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Missing nonce');
    });

    test('validates nbf claim', () => {
      const claims = { ...validClaims, nbf: Math.floor(Date.now() / 1000) + 3600 };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not valid before');
    });

    test('rejects missing subject', () => {
      const claims = { ...validClaims, sub: undefined };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing subject (sub) claim');
    });
  });

  describe('validateAccessToken', () => {
    test('accepts valid access token', () => {
      const result = validateAccessToken('valid-access-token-string', {});
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    test('rejects null token', () => {
      const result = validateAccessToken(null, {});
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid access token format');
    });

    test('rejects non-string token', () => {
      const result = validateAccessToken(12345, {});
      expect(result.valid).toBe(false);
    });

    test('rejects too-short token', () => {
      const result = validateAccessToken('short', {});
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Access token too short');
    });
  });

  describe('validateRefreshToken', () => {
    test('accepts valid refresh token', () => {
      const result = validateRefreshToken('valid-refresh-token-string', {});
      expect(result.valid).toBe(true);
    });

    test('rejects null token', () => {
      const result = validateRefreshToken(null, {});
      expect(result.valid).toBe(false);
    });

    test('rejects too-short token', () => {
      const result = validateRefreshToken('short', {});
      expect(result.valid).toBe(false);
    });
  });

  describe('validateTokenResponse', () => {
    const validResponse = {
      access_token: 'valid-access-token',
      id_token: 'valid-id-token',
      token_type: 'Bearer',
      expires_in: 3600
    };

    test('accepts valid token response', () => {
      const result = validateTokenResponse(validResponse, {});
      expect(result.valid).toBe(true);
      expect(result.errors).toBeNull();
    });

    test('rejects null response', () => {
      const result = validateTokenResponse(null, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Empty token response');
    });

    test('rejects missing access_token', () => {
      const response = { ...validResponse, access_token: undefined };
      const result = validateTokenResponse(response, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing access_token in response');
    });

    test('rejects missing id_token', () => {
      const response = { ...validResponse, id_token: undefined };
      const result = validateTokenResponse(response, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing id_token in response');
    });

    test('rejects invalid token_type', () => {
      const response = { ...validResponse, token_type: 'Basic' };
      const result = validateTokenResponse(response, {});
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid token_type');
    });

    test('accepts case-insensitive Bearer', () => {
      const response = { ...validResponse, token_type: 'bearer' };
      const result = validateTokenResponse(response, {});
      expect(result.valid).toBe(true);
    });

    test('rejects missing expires_in', () => {
      const response = { ...validResponse, expires_in: undefined };
      const result = validateTokenResponse(response, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing expires_in in response');
    });

    test('rejects invalid expires_in', () => {
      const response = { ...validResponse, expires_in: -100 };
      const result = validateTokenResponse(response, {});
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid expires_in');
    });

    test('warns about missing refresh_token with offline_access', () => {
      const config = { scope: 'openid profile offline_access' };
      const result = validateTokenResponse(validResponse, config);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Missing refresh_token');
    });

    test('accepts refresh_token with offline_access', () => {
      const config = { scope: 'openid profile offline_access' };
      const response = { ...validResponse, refresh_token: 'valid-refresh-token' };
      const result = validateTokenResponse(response, config);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateUserinfo', () => {
    const idTokenClaims = {
      sub: 'user-123',
      email: 'user@example.com'
    };

    test('accepts valid userinfo', () => {
      const userinfo = {
        sub: 'user-123',
        email: 'user@example.com',
        name: 'Test User'
      };
      const result = validateUserinfo(userinfo, idTokenClaims);
      expect(result.valid).toBe(true);
    });

    test('rejects null userinfo', () => {
      const result = validateUserinfo(null, idTokenClaims);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Empty userinfo response');
    });

    test('rejects missing sub', () => {
      const userinfo = { email: 'user@example.com' };
      const result = validateUserinfo(userinfo, idTokenClaims);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing sub claim in userinfo');
    });

    test('rejects sub mismatch', () => {
      const userinfo = { sub: 'different-user', email: 'user@example.com' };
      const result = validateUserinfo(userinfo, idTokenClaims);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Userinfo sub mismatch');
    });
  });

  describe('validateConfig', () => {
    const validConfig = {
      issuer: 'https://accounts.google.com',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret-must-be-32chars-long',
      redirectUri: 'http://localhost:3000/callback',
      cookieSecret: 'cookie-secret-must-be-32-chars!!!!!',
      scope: 'openid profile email'
    };

    test('accepts valid config', () => {
      const result = validateConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeNull();
    });

    test('rejects missing issuer', () => {
      const config = { ...validConfig, issuer: undefined };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: issuer');
    });

    test('rejects invalid issuer URL', () => {
      const config = { ...validConfig, issuer: 'not-a-url' };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid issuer URL');
    });

    test('rejects missing clientId', () => {
      const config = { ...validConfig, clientId: undefined };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: clientId');
    });

    test('rejects missing cookieSecret', () => {
      const config = { ...validConfig, cookieSecret: undefined };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: cookieSecret');
    });

    test('rejects short cookieSecret', () => {
      const config = { ...validConfig, cookieSecret: 'short' };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('at least 32 characters');
    });

    test('rejects invalid redirectUri', () => {
      const config = { ...validConfig, redirectUri: 'not-a-url' };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid redirectUri URL');
    });

    test('rejects scope without openid', () => {
      const config = { ...validConfig, scope: 'profile email' };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      // Should contain error about missing openid in scope
      expect(result.errors.some(e => e.includes('openid'))).toBe(true);
    });
  });

  describe('getUserFriendlyError', () => {
    test('returns friendly message for expired token', () => {
      const errors = ['Token expired at 2024-01-01T00:00:00Z'];
      const message = getUserFriendlyError(errors);
      expect(message).toContain('session has expired');
      expect(message).toContain('sign in again');
    });

    test('returns friendly message for issuer mismatch', () => {
      const errors = ['Invalid issuer: expected "https://a.com", got "https://b.com"'];
      const message = getUserFriendlyError(errors);
      expect(message).toContain('configuration error');
      expect(message).toContain('support');
    });

    test('returns friendly message for nonce mismatch', () => {
      const errors = ['Invalid nonce (possible replay attack)'];
      const message = getUserFriendlyError(errors);
      expect(message).toContain('Invalid authentication state');
      expect(message).toContain('try signing in again');
    });

    test('returns friendly message for missing tokens', () => {
      const errors = ['Missing access_token in response'];
      const message = getUserFriendlyError(errors);
      expect(message).toContain('incomplete');
      expect(message).toContain('try again');
    });

    test('returns generic message for unknown error', () => {
      const errors = ['Something went wrong'];
      const message = getUserFriendlyError(errors);
      expect(message).toContain('Authentication failed');
    });

    test('handles empty errors array', () => {
      const message = getUserFriendlyError([]);
      expect(message).toContain('Authentication failed');
    });
  });
});
