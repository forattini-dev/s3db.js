import { describe, test, expect } from 'vitest';
import {
  validateProviderCompatibility,
  getProviderCapabilities
} from '../../../src/plugins/api/concerns/oidc-provider-validator.js';

const fullDiscoveryDoc = {
  authorization_endpoint: 'https://auth.example.com/authorize',
  token_endpoint: 'https://auth.example.com/token',
  userinfo_endpoint: 'https://auth.example.com/userinfo',
  end_session_endpoint: 'https://auth.example.com/logout',
  id_token_signing_alg_values_supported: ['RS256', 'ES256'],
  response_types_supported: ['code', 'token', 'id_token'],
  response_modes_supported: ['query', 'fragment', 'form_post'],
  scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256', 'plain'],
  token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
  claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'name', 'email']
};

const baseConfig = {
  idTokenSigningAlg: 'RS256',
  responseType: 'code',
  scope: 'openid profile'
};

describe('validateProviderCompatibility', () => {
  describe('null/empty discovery', () => {
    test('returns error for null discovery doc', () => {
      const result = validateProviderCompatibility(null, baseConfig);
      expect(result.errors).toContain('Discovery document is missing or empty');
    });
  });

  describe('signing algorithm validation', () => {
    test('warns when requested alg not supported', () => {
      const config = { ...baseConfig, idTokenSigningAlg: 'HS256' };
      const result = validateProviderCompatibility(fullDiscoveryDoc, config);
      expect(result.warnings.some(w => w.includes('HS256'))).toBe(true);
      expect(result.warnings.some(w => w.includes('not listed'))).toBe(true);
    });

    test('no warning when requested alg is supported', () => {
      const result = validateProviderCompatibility(fullDiscoveryDoc, baseConfig);
      expect(result.warnings.some(w => w.includes('signing algorithm'))).toBe(false);
    });

    test('no warning when provider does not list algorithms', () => {
      const doc = { ...fullDiscoveryDoc, id_token_signing_alg_values_supported: undefined };
      const result = validateProviderCompatibility(doc, baseConfig);
      expect(result.warnings.some(w => w.includes('signing algorithm'))).toBe(false);
    });
  });

  describe('response type validation', () => {
    test('warns when response type not supported', () => {
      const config = { ...baseConfig, responseType: 'code id_token' };
      const result = validateProviderCompatibility(fullDiscoveryDoc, config);
      expect(result.warnings.some(w => w.includes('Response type'))).toBe(true);
    });

    test('no warning when response type is supported', () => {
      const result = validateProviderCompatibility(fullDiscoveryDoc, baseConfig);
      expect(result.warnings.some(w => w.includes('Response type'))).toBe(false);
    });
  });

  describe('response mode validation', () => {
    test('warns when response mode not supported', () => {
      const config = { ...baseConfig, responseMode: 'jwt' };
      const result = validateProviderCompatibility(fullDiscoveryDoc, config);
      expect(result.warnings.some(w => w.includes('Response mode'))).toBe(true);
    });

    test('no warning when no response mode specified', () => {
      const result = validateProviderCompatibility(fullDiscoveryDoc, baseConfig);
      expect(result.warnings.some(w => w.includes('Response mode'))).toBe(false);
    });
  });

  describe('scope validation', () => {
    test('warns when requested scopes not supported', () => {
      const config = { ...baseConfig, scope: 'openid custom_scope' };
      const result = validateProviderCompatibility(fullDiscoveryDoc, config);
      expect(result.warnings.some(w => w.includes('custom_scope'))).toBe(true);
    });

    test('no warning when all scopes supported', () => {
      const result = validateProviderCompatibility(fullDiscoveryDoc, baseConfig);
      expect(result.warnings.some(w => w.includes('scopes not listed'))).toBe(false);
    });
  });

  describe('refresh token validation', () => {
    test('warns when autoRefreshTokens but no refresh_token grant', () => {
      const doc = { ...fullDiscoveryDoc, grant_types_supported: ['authorization_code'] };
      const config = { ...baseConfig, autoRefreshTokens: true };
      const result = validateProviderCompatibility(doc, config);
      expect(result.warnings.some(w => w.includes('autoRefreshTokens'))).toBe(true);
    });

    test('warns when autoRefreshTokens but no offline_access scope', () => {
      const config = { ...baseConfig, autoRefreshTokens: true, scope: 'openid profile' };
      const result = validateProviderCompatibility(fullDiscoveryDoc, config);
      expect(result.warnings.some(w => w.includes('offline_access'))).toBe(true);
    });
  });

  describe('endpoint validation', () => {
    test('errors when missing token_endpoint with code flow', () => {
      const doc = { ...fullDiscoveryDoc, token_endpoint: undefined };
      const result = validateProviderCompatibility(doc, baseConfig);
      expect(result.errors.some(e => e.includes('token_endpoint'))).toBe(true);
    });

    test('errors when missing authorization_endpoint', () => {
      const doc = { ...fullDiscoveryDoc, authorization_endpoint: undefined };
      const result = validateProviderCompatibility(doc, baseConfig);
      expect(result.errors.some(e => e.includes('authorization_endpoint'))).toBe(true);
    });

    test('warns when missing userinfo_endpoint', () => {
      const doc = { ...fullDiscoveryDoc, userinfo_endpoint: undefined };
      const result = validateProviderCompatibility(doc, baseConfig);
      expect(result.warnings.some(w => w.includes('userinfo_endpoint'))).toBe(true);
    });

    test('warns when logout enabled but no end_session_endpoint', () => {
      const doc = { ...fullDiscoveryDoc, end_session_endpoint: undefined };
      const config = { ...baseConfig, enableLogout: true };
      const result = validateProviderCompatibility(doc, config);
      expect(result.warnings.some(w => w.includes('end_session_endpoint'))).toBe(true);
    });
  });

  describe('PKCE validation', () => {
    test('warns when PKCE enabled but S256 not supported', () => {
      const doc = { ...fullDiscoveryDoc, code_challenge_methods_supported: ['plain'] };
      const config = { ...baseConfig, usePKCE: true };
      const result = validateProviderCompatibility(doc, config);
      expect(result.warnings.some(w => w.includes('PKCE'))).toBe(true);
    });

    test('no warning when PKCE enabled and S256 supported', () => {
      const config = { ...baseConfig, usePKCE: true };
      const result = validateProviderCompatibility(fullDiscoveryDoc, config);
      expect(result.warnings.some(w => w.includes('PKCE'))).toBe(false);
    });
  });

  describe('auth method validation', () => {
    test('warns when token auth method not supported', () => {
      const config = { ...baseConfig, tokenEndpointAuthMethod: 'private_key_jwt' };
      const result = validateProviderCompatibility(fullDiscoveryDoc, config);
      expect(result.warnings.some(w => w.includes('private_key_jwt'))).toBe(true);
    });
  });

  describe('claims validation', () => {
    test('warns when essential claims missing from supported list', () => {
      const doc = { ...fullDiscoveryDoc, claims_supported: ['sub', 'name'] };
      const result = validateProviderCompatibility(doc, baseConfig);
      expect(result.warnings.some(w => w.includes('essential claims'))).toBe(true);
    });
  });

  describe('complete validation', () => {
    test('returns no errors/warnings for fully compatible provider', () => {
      const result = validateProviderCompatibility(fullDiscoveryDoc, baseConfig);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });
});

describe('getProviderCapabilities', () => {
  describe('null handling', () => {
    test('returns empty capabilities for null doc', () => {
      const caps = getProviderCapabilities(null);
      expect(caps.hasTokenEndpoint).toBe(false);
      expect(caps.hasUserinfoEndpoint).toBe(false);
      expect(caps.hasLogoutEndpoint).toBe(false);
      expect(caps.supportsRefreshTokens).toBe(false);
      expect(caps.supportsPKCE).toBe(false);
      expect(caps.supportedScopes).toEqual([]);
    });
  });

  describe('endpoint detection', () => {
    test('detects token endpoint', () => {
      const caps = getProviderCapabilities(fullDiscoveryDoc);
      expect(caps.hasTokenEndpoint).toBe(true);
    });

    test('detects userinfo endpoint', () => {
      const caps = getProviderCapabilities(fullDiscoveryDoc);
      expect(caps.hasUserinfoEndpoint).toBe(true);
    });

    test('detects logout endpoint', () => {
      const caps = getProviderCapabilities(fullDiscoveryDoc);
      expect(caps.hasLogoutEndpoint).toBe(true);
    });

    test('detects missing endpoints', () => {
      const doc = { authorization_endpoint: 'https://auth.example.com/authorize' };
      const caps = getProviderCapabilities(doc);
      expect(caps.hasTokenEndpoint).toBe(false);
      expect(caps.hasUserinfoEndpoint).toBe(false);
      expect(caps.hasLogoutEndpoint).toBe(false);
    });
  });

  describe('feature detection', () => {
    test('detects refresh token support', () => {
      const caps = getProviderCapabilities(fullDiscoveryDoc);
      expect(caps.supportsRefreshTokens).toBe(true);
    });

    test('detects PKCE support', () => {
      const caps = getProviderCapabilities(fullDiscoveryDoc);
      expect(caps.supportsPKCE).toBe(true);
    });

    test('detects no refresh token support', () => {
      const doc = { ...fullDiscoveryDoc, grant_types_supported: ['authorization_code'] };
      const caps = getProviderCapabilities(doc);
      expect(caps.supportsRefreshTokens).toBe(false);
    });

    test('detects no PKCE support', () => {
      const doc = { ...fullDiscoveryDoc, code_challenge_methods_supported: ['plain'] };
      const caps = getProviderCapabilities(doc);
      expect(caps.supportsPKCE).toBe(false);
    });
  });

  describe('supported values', () => {
    test('returns supported scopes', () => {
      const caps = getProviderCapabilities(fullDiscoveryDoc);
      expect(caps.supportedScopes).toContain('openid');
      expect(caps.supportedScopes).toContain('profile');
    });

    test('returns supported response types', () => {
      const caps = getProviderCapabilities(fullDiscoveryDoc);
      expect(caps.supportedResponseTypes).toContain('code');
    });

    test('returns supported signing algorithms', () => {
      const caps = getProviderCapabilities(fullDiscoveryDoc);
      expect(caps.supportedSigningAlgs).toContain('RS256');
    });

    test('returns supported auth methods', () => {
      const caps = getProviderCapabilities(fullDiscoveryDoc);
      expect(caps.supportedAuthMethods).toContain('client_secret_basic');
    });

    test('returns empty arrays for missing values', () => {
      const doc = { authorization_endpoint: 'https://auth.example.com/authorize' };
      const caps = getProviderCapabilities(doc);
      expect(caps.supportedScopes).toEqual([]);
      expect(caps.supportedResponseTypes).toEqual([]);
      expect(caps.supportedSigningAlgs).toEqual([]);
    });
  });
});
