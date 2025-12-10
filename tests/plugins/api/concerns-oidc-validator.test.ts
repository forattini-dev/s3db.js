import { describe, test, expect } from 'vitest';
import {
  validateIdToken,
  validateAccessToken,
  validateRefreshToken,
  validateTokenResponse,
  validateUserinfo,
  getUserFriendlyError,
  validateConfig
} from '../../../src/plugins/api/concerns/oidc-validator.js';

const baseConfig = {
  issuer: 'https://auth.example.com',
  clientId: 'my-client-id',
  clientSecret: 'my-client-secret',
  redirectUri: 'https://app.example.com/callback',
  cookieSecret: 'a-very-long-secret-that-is-at-least-32-chars'
};

const now = Math.floor(Date.now() / 1000);

const validClaims = {
  iss: 'https://auth.example.com',
  aud: 'my-client-id',
  exp: now + 3600,
  iat: now - 60,
  sub: 'user-12345'
};

describe('validateIdToken', () => {
  describe('valid tokens', () => {
    test('accepts valid token with all required claims', () => {
      const result = validateIdToken(validClaims, baseConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeNull();
    });

    test('accepts token with array audience containing clientId', () => {
      const claims = { ...validClaims, aud: ['other-client', 'my-client-id'], azp: 'my-client-id' };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(true);
    });
  });

  describe('issuer validation', () => {
    test('rejects missing issuer', () => {
      const claims = { ...validClaims, iss: undefined };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing issuer (iss) claim');
    });

    test('rejects mismatched issuer', () => {
      const claims = { ...validClaims, iss: 'https://evil.com' };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('Invalid issuer');
    });

    test('accepts any issuer when config.issuer is not set', () => {
      const claims = { ...validClaims, iss: 'https://any-issuer.com' };
      const config = { ...baseConfig, issuer: undefined };
      const result = validateIdToken(claims, config);
      expect(result.errors?.some(e => e.includes('issuer'))).toBeFalsy();
    });
  });

  describe('audience validation', () => {
    test('rejects missing audience', () => {
      const claims = { ...validClaims, aud: undefined };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing audience (aud) claim');
    });

    test('rejects wrong audience', () => {
      const claims = { ...validClaims, aud: 'wrong-client-id' };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('Invalid audience');
    });

    test('requires azp when multiple audiences', () => {
      const claims = { ...validClaims, aud: ['client-1', 'my-client-id'] };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing azp claim (required for multiple audiences)');
    });

    test('validates azp matches clientId', () => {
      const claims = { ...validClaims, aud: ['client-1', 'my-client-id'], azp: 'wrong-azp' };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('Invalid azp');
    });
  });

  describe('expiration validation', () => {
    test('rejects missing exp', () => {
      const claims = { ...validClaims, exp: undefined };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing expiration (exp) claim');
    });

    test('rejects expired token', () => {
      const claims = { ...validClaims, exp: now - 120 };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('Token expired');
    });

    test('accepts token within clock tolerance', () => {
      const claims = { ...validClaims, exp: now - 30 };
      const result = validateIdToken(claims, baseConfig, { clockTolerance: 60 });
      expect(result.valid).toBe(true);
    });
  });

  describe('iat validation', () => {
    test('rejects token issued in the future', () => {
      const claims = { ...validClaims, iat: now + 120 };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('Token issued in the future');
    });

    test('rejects token too old', () => {
      const claims = { ...validClaims, iat: now - 100000 };
      const result = validateIdToken(claims, baseConfig, { maxAge: 3600 });
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('Token too old');
    });
  });

  describe('nbf validation', () => {
    test('rejects token not yet valid', () => {
      const claims = { ...validClaims, nbf: now + 120 };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('Token not valid before');
    });
  });

  describe('nonce validation', () => {
    test('requires nonce when option is set', () => {
      const result = validateIdToken(validClaims, baseConfig, { nonce: 'expected-nonce' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing nonce claim');
    });

    test('rejects mismatched nonce', () => {
      const claims = { ...validClaims, nonce: 'wrong-nonce' };
      const result = validateIdToken(claims, baseConfig, { nonce: 'expected-nonce' });
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('Invalid nonce');
    });

    test('accepts matching nonce', () => {
      const claims = { ...validClaims, nonce: 'correct-nonce' };
      const result = validateIdToken(claims, baseConfig, { nonce: 'correct-nonce' });
      expect(result.valid).toBe(true);
    });
  });

  describe('sub validation', () => {
    test('rejects missing sub', () => {
      const claims = { ...validClaims, sub: undefined };
      const result = validateIdToken(claims, baseConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing subject (sub) claim');
    });
  });
});

describe('validateAccessToken', () => {
  test('accepts valid access token', () => {
    const result = validateAccessToken('valid-access-token-string', baseConfig);
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  test('rejects null token', () => {
    const result = validateAccessToken(null as any, baseConfig);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid access token format');
  });

  test('rejects empty string', () => {
    const result = validateAccessToken('', baseConfig);
    expect(result.valid).toBe(false);
  });

  test('rejects too short token', () => {
    const result = validateAccessToken('short', baseConfig);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too short');
  });
});

describe('validateRefreshToken', () => {
  test('accepts valid refresh token', () => {
    const result = validateRefreshToken('valid-refresh-token-string', baseConfig);
    expect(result.valid).toBe(true);
  });

  test('rejects null token', () => {
    const result = validateRefreshToken(null as any, baseConfig);
    expect(result.valid).toBe(false);
  });

  test('rejects too short token', () => {
    const result = validateRefreshToken('short', baseConfig);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too short');
  });
});

describe('validateTokenResponse', () => {
  const validResponse = {
    access_token: 'access-token-value',
    id_token: 'id-token-value',
    token_type: 'Bearer',
    expires_in: 3600
  };

  test('accepts valid token response', () => {
    const result = validateTokenResponse(validResponse, baseConfig);
    expect(result.valid).toBe(true);
  });

  test('rejects null response', () => {
    const result = validateTokenResponse(null as any, baseConfig);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Empty token response');
  });

  test('rejects missing access_token', () => {
    const response = { ...validResponse, access_token: undefined };
    const result = validateTokenResponse(response, baseConfig);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing access_token in response');
  });

  test('rejects missing id_token', () => {
    const response = { ...validResponse, id_token: undefined };
    const result = validateTokenResponse(response, baseConfig);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing id_token in response');
  });

  test('rejects missing token_type', () => {
    const response = { ...validResponse, token_type: undefined };
    const result = validateTokenResponse(response, baseConfig);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing token_type in response');
  });

  test('rejects non-Bearer token_type', () => {
    const response = { ...validResponse, token_type: 'MAC' };
    const result = validateTokenResponse(response, baseConfig);
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toContain('Invalid token_type');
  });

  test('rejects missing expires_in', () => {
    const response = { ...validResponse, expires_in: undefined };
    const result = validateTokenResponse(response, baseConfig);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing expires_in in response');
  });

  test('accepts string expires_in and converts to number', () => {
    const response = { ...validResponse, expires_in: '3600' };
    const result = validateTokenResponse(response, baseConfig);
    expect(result.valid).toBe(true);
    expect(response.expires_in).toBe(3600);
  });

  test('requires refresh_token when offline_access scope requested', () => {
    const config = { ...baseConfig, scope: 'openid offline_access' };
    const result = validateTokenResponse(validResponse, config);
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toContain('Missing refresh_token');
  });
});

describe('validateUserinfo', () => {
  test('accepts valid userinfo', () => {
    const userinfo = { sub: 'user-123', email: 'user@example.com' };
    const idTokenClaims = { sub: 'user-123' };
    const result = validateUserinfo(userinfo, idTokenClaims);
    expect(result.valid).toBe(true);
  });

  test('rejects null userinfo', () => {
    const result = validateUserinfo(null as any, { sub: 'user-123' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Empty userinfo response');
  });

  test('rejects missing sub in userinfo', () => {
    const result = validateUserinfo({}, { sub: 'user-123' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing sub claim in userinfo');
  });

  test('rejects sub mismatch', () => {
    const result = validateUserinfo({ sub: 'different-user' }, { sub: 'user-123' });
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toContain('Userinfo sub mismatch');
  });
});

describe('getUserFriendlyError', () => {
  test('returns generic message for null errors', () => {
    const message = getUserFriendlyError(null);
    expect(message).toBe('Authentication failed. Please try again.');
  });

  test('returns generic message for empty errors', () => {
    const message = getUserFriendlyError([]);
    expect(message).toBe('Authentication failed. Please try again.');
  });

  test('returns session expired message', () => {
    const message = getUserFriendlyError(['Token expired at 2024-01-01']);
    expect(message).toContain('session has expired');
  });

  test('returns configuration error for issuer issues', () => {
    const message = getUserFriendlyError(['Invalid issuer']);
    expect(message).toContain('configuration error');
  });

  test('returns invalid state message for nonce issues', () => {
    const message = getUserFriendlyError(['Invalid nonce']);
    expect(message).toContain('Invalid authentication state');
  });

  test('returns incomplete message for missing token', () => {
    const message = getUserFriendlyError(['Missing access_token in response']);
    expect(message).toContain('incomplete');
  });
});

describe('validateConfig', () => {
  test('accepts valid config', () => {
    const result = validateConfig(baseConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeNull();
  });

  test('rejects missing issuer', () => {
    const config = { ...baseConfig, issuer: undefined };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: issuer');
  });

  test('rejects invalid issuer URL', () => {
    const config = { ...baseConfig, issuer: 'not-a-url' };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toContain('Invalid issuer URL');
  });

  test('rejects missing clientId', () => {
    const config = { ...baseConfig, clientId: '' };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: clientId');
  });

  test('rejects missing clientSecret', () => {
    const config = { ...baseConfig, clientSecret: undefined };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: clientSecret');
  });

  test('rejects missing redirectUri', () => {
    const config = { ...baseConfig, redirectUri: undefined };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: redirectUri');
  });

  test('rejects invalid redirectUri URL', () => {
    const config = { ...baseConfig, redirectUri: 'not-a-url' };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toContain('Invalid redirectUri URL');
  });

  test('rejects missing cookieSecret', () => {
    const config = { ...baseConfig, cookieSecret: undefined };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: cookieSecret');
  });

  test('rejects short cookieSecret', () => {
    const config = { ...baseConfig, cookieSecret: 'short' };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toContain('at least 32 characters');
  });

  test('requires openid scope', () => {
    const config = { ...baseConfig, scope: 'profile email' };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toContain('must include "openid"');
  });

  test('accepts scope with openid', () => {
    const config = { ...baseConfig, scope: 'openid profile email' };
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
  });
});
