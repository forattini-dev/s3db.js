/**
 * OIDC Discovery Unit Tests
 *
 * Testa discovery document, validação de claims, scopes, e utilitários
 */

import {
  generateDiscoveryDocument,
  validateClaims,
  extractUserClaims,
  parseScopes,
  validateScopes,
  generateAuthCode,
  generateClientId,
  generateClientSecret
} from '../../src/plugins/api/auth/oidc-discovery.js';

describe('OIDC Discovery - Unit Tests', () => {
  describe('generateDiscoveryDocument()', () => {
    test('generates valid discovery document with required fields', () => {
      const doc = generateDiscoveryDocument({
        issuer: 'https://sso.example.com',
        grantTypes: ['authorization_code', 'client_credentials'],
        responseTypes: ['code', 'token'],
        scopes: ['openid', 'profile', 'email']
      });

      expect(doc.issuer).toBe('https://sso.example.com');
      expect(doc.authorization_endpoint).toBe('https://sso.example.com/auth/authorize');
      expect(doc.token_endpoint).toBe('https://sso.example.com/auth/token');
      expect(doc.userinfo_endpoint).toBe('https://sso.example.com/auth/userinfo');
      expect(doc.jwks_uri).toBe('https://sso.example.com/.well-known/jwks.json');
      expect(doc.scopes_supported).toEqual(['openid', 'profile', 'email']);
      expect(doc.grant_types_supported).toEqual(['authorization_code', 'client_credentials']);
      expect(doc.response_types_supported).toEqual(['code', 'token']);
    });

    test('removes trailing slash from issuer', () => {
      const doc = generateDiscoveryDocument({
        issuer: 'https://sso.example.com/',
        grantTypes: ['client_credentials'],
        responseTypes: ['code'],
        scopes: ['openid']
      });

      expect(doc.issuer).toBe('https://sso.example.com');
      expect(doc.token_endpoint).toBe('https://sso.example.com/auth/token');
    });

    test('includes OIDC required endpoints', () => {
      const doc = generateDiscoveryDocument({
        issuer: 'https://sso.example.com',
        grantTypes: [],
        responseTypes: [],
        scopes: []
      });

      expect(doc.authorization_endpoint).toBeDefined();
      expect(doc.token_endpoint).toBeDefined();
      expect(doc.userinfo_endpoint).toBeDefined();
      expect(doc.jwks_uri).toBeDefined();
      expect(doc.registration_endpoint).toBeDefined();
      expect(doc.introspection_endpoint).toBeDefined();
      expect(doc.revocation_endpoint).toBeDefined();
      expect(doc.end_session_endpoint).toBeDefined();
    });

    test('includes OIDC required metadata', () => {
      const doc = generateDiscoveryDocument({
        issuer: 'https://sso.example.com',
        grantTypes: [],
        responseTypes: [],
        scopes: []
      });

      expect(doc.subject_types_supported).toEqual(['public']);
      expect(doc.id_token_signing_alg_values_supported).toEqual(['RS256']);
      expect(doc.token_endpoint_auth_methods_supported).toContain('client_secret_basic');
      expect(doc.code_challenge_methods_supported).toContain('S256');
    });

    test('throws error if issuer is missing', () => {
      expect(() => {
        generateDiscoveryDocument({});
      }).toThrow('Issuer URL is required');
    });
  });

  describe('validateClaims()', () => {
    let validPayload;

    beforeEach(() => {
      const now = Math.floor(Date.now() / 1000);
      validPayload = {
        sub: 'user-123',
        iss: 'https://sso.example.com',
        aud: 'https://api.example.com',
        exp: now + 900, // 15 minutes
        iat: now,
        nbf: now
      };
    });

    test('validates correct payload successfully', () => {
      const result = validateClaims(validPayload, {
        issuer: 'https://sso.example.com',
        audience: 'https://api.example.com'
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    test('fails if sub is missing', () => {
      delete validPayload.sub;

      const result = validateClaims(validPayload);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('sub');
    });

    test('fails if iat is missing', () => {
      delete validPayload.iat;

      const result = validateClaims(validPayload);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('iat');
    });

    test('fails if exp is missing', () => {
      delete validPayload.exp;

      const result = validateClaims(validPayload);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exp');
    });

    test('fails if issuer does not match', () => {
      const result = validateClaims(validPayload, {
        issuer: 'https://wrong-issuer.com'
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('issuer');
    });

    test('fails if audience does not match', () => {
      const result = validateClaims(validPayload, {
        audience: 'https://wrong-audience.com'
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('audience');
    });

    test('accepts audience as array', () => {
      validPayload.aud = ['https://api1.example.com', 'https://api2.example.com'];

      const result = validateClaims(validPayload, {
        audience: 'https://api2.example.com'
      });

      expect(result.valid).toBe(true);
    });

    test('fails if token is expired', () => {
      const now = Math.floor(Date.now() / 1000);
      validPayload.exp = now - 100; // Expired 100 seconds ago

      const result = validateClaims(validPayload);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    test('accepts token within clock tolerance', () => {
      const now = Math.floor(Date.now() / 1000);
      validPayload.exp = now - 30; // Expired 30 seconds ago

      const result = validateClaims(validPayload, {
        clockTolerance: 60 // 60 seconds tolerance
      });

      expect(result.valid).toBe(true);
    });

    test('fails if nbf (not before) is in the future', () => {
      const now = Math.floor(Date.now() / 1000);
      validPayload.nbf = now + 100; // Not valid for another 100 seconds

      const result = validateClaims(validPayload);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not yet valid');
    });

    test('fails if iat (issued at) is in the future', () => {
      const now = Math.floor(Date.now() / 1000);
      validPayload.iat = now + 100; // Issued 100 seconds in the future

      const result = validateClaims(validPayload);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('future');
    });
  });

  describe('extractUserClaims()', () => {
    const user = {
      id: 'user-123',
      email: 'john@example.com',
      emailVerified: true,
      name: 'John Doe',
      givenName: 'John',
      familyName: 'Doe',
      picture: 'https://example.com/photo.jpg',
      locale: 'en-US',
      zoneinfo: 'America/New_York',
      birthdate: '1990-01-01',
      gender: 'male'
    };

    test('always includes sub (subject)', () => {
      const claims = extractUserClaims(user, []);

      expect(claims.sub).toBe('user-123');
    });

    test('includes email claims if email scope requested', () => {
      const claims = extractUserClaims(user, ['email']);

      expect(claims.email).toBe('john@example.com');
      expect(claims.email_verified).toBe(true);
    });

    test('does not include email claims if email scope not requested', () => {
      const claims = extractUserClaims(user, ['profile']);

      expect(claims.email).toBeUndefined();
      expect(claims.email_verified).toBeUndefined();
    });

    test('includes profile claims if profile scope requested', () => {
      const claims = extractUserClaims(user, ['profile']);

      expect(claims.name).toBe('John Doe');
      expect(claims.given_name).toBe('John');
      expect(claims.family_name).toBe('Doe');
      expect(claims.picture).toBe('https://example.com/photo.jpg');
      expect(claims.locale).toBe('en-US');
      expect(claims.zoneinfo).toBe('America/New_York');
      expect(claims.birthdate).toBe('1990-01-01');
      expect(claims.gender).toBe('male');
    });

    test('combines multiple scopes', () => {
      const claims = extractUserClaims(user, ['email', 'profile']);

      expect(claims.sub).toBe('user-123');
      expect(claims.email).toBe('john@example.com');
      expect(claims.name).toBe('John Doe');
    });

    test('handles missing optional fields', () => {
      const minimalUser = {
        id: 'user-123',
        email: 'john@example.com'
      };

      const claims = extractUserClaims(minimalUser, ['email', 'profile']);

      expect(claims.sub).toBe('user-123');
      expect(claims.email).toBe('john@example.com');
      expect(claims.name).toBeUndefined();
      expect(claims.picture).toBeUndefined();
    });
  });

  describe('parseScopes()', () => {
    test('parses space-separated scopes', () => {
      const scopes = parseScopes('openid profile email');

      expect(scopes).toEqual(['openid', 'profile', 'email']);
    });

    test('handles multiple spaces', () => {
      const scopes = parseScopes('openid  profile   email');

      expect(scopes).toEqual(['openid', 'profile', 'email']);
    });

    test('handles leading/trailing spaces', () => {
      const scopes = parseScopes('  openid profile email  ');

      expect(scopes).toEqual(['openid', 'profile', 'email']);
    });

    test('returns empty array for empty string', () => {
      expect(parseScopes('')).toEqual([]);
      expect(parseScopes('   ')).toEqual([]);
    });

    test('returns empty array for null/undefined', () => {
      expect(parseScopes(null)).toEqual([]);
      expect(parseScopes(undefined)).toEqual([]);
    });

    test('returns empty array for non-string input', () => {
      expect(parseScopes(123)).toEqual([]);
      expect(parseScopes({})).toEqual([]);
    });
  });

  describe('validateScopes()', () => {
    const supportedScopes = ['openid', 'profile', 'email', 'orders:read', 'orders:write'];

    test('validates all supported scopes', () => {
      const result = validateScopes(['openid', 'profile'], supportedScopes);

      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
      expect(result.scopes).toEqual(['openid', 'profile']);
    });

    test('accepts scope string and parses it', () => {
      const result = validateScopes('openid profile email', supportedScopes);

      expect(result.valid).toBe(true);
      expect(result.scopes).toEqual(['openid', 'profile', 'email']);
    });

    test('fails if scope is not supported', () => {
      const result = validateScopes(['openid', 'invalid:scope'], supportedScopes);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid:scope');
      expect(result.scopes).toEqual([]);
    });

    test('fails if multiple scopes are not supported', () => {
      const result = validateScopes(['openid', 'bad:scope', 'another:bad'], supportedScopes);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('bad:scope');
      expect(result.error).toContain('another:bad');
    });

    test('returns valid for empty scopes', () => {
      const result = validateScopes([], supportedScopes);

      expect(result.valid).toBe(true);
      expect(result.scopes).toEqual([]);
    });
  });

  describe('generateAuthCode()', () => {
    test('generates code with default length (32)', () => {
      const code = generateAuthCode();

      expect(code).toBeDefined();
      expect(code.length).toBe(32);
      expect(typeof code).toBe('string');
    });

    test('generates code with custom length', () => {
      const code = generateAuthCode(64);

      expect(code.length).toBe(64);
    });

    test('uses URL-safe characters', () => {
      const code = generateAuthCode(100);
      const urlSafeRegex = /^[A-Za-z0-9\-._~]+$/;

      expect(urlSafeRegex.test(code)).toBe(true);
    });

    test('generates different codes each time', () => {
      const code1 = generateAuthCode();
      const code2 = generateAuthCode();
      const code3 = generateAuthCode();

      expect(code1).not.toBe(code2);
      expect(code1).not.toBe(code3);
      expect(code2).not.toBe(code3);
    });
  });

  describe('generateClientId()', () => {
    test('generates valid UUID', () => {
      const clientId = generateClientId();

      expect(clientId).toBeDefined();
      expect(typeof clientId).toBe('string');

      // UUID v4 format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(uuidRegex.test(clientId)).toBe(true);
    });

    test('generates different client IDs', () => {
      const id1 = generateClientId();
      const id2 = generateClientId();
      const id3 = generateClientId();

      expect(id1).not.toBe(id2);
      expect(id1).not.toBe(id3);
      expect(id2).not.toBe(id3);
    });
  });

  describe('generateClientSecret()', () => {
    test('generates secret with default length (64)', () => {
      const secret = generateClientSecret();

      expect(secret).toBeDefined();
      expect(secret.length).toBe(64);
      expect(typeof secret).toBe('string');
    });

    test('generates secret with custom length', () => {
      const secret = generateClientSecret(128);

      expect(secret.length).toBe(128);
    });

    test('generates hex string', () => {
      const secret = generateClientSecret();
      const hexRegex = /^[0-9a-f]+$/;

      expect(hexRegex.test(secret)).toBe(true);
    });

    test('generates different secrets', () => {
      const secret1 = generateClientSecret();
      const secret2 = generateClientSecret();
      const secret3 = generateClientSecret();

      expect(secret1).not.toBe(secret2);
      expect(secret1).not.toBe(secret3);
      expect(secret2).not.toBe(secret3);
    });
  });
});
