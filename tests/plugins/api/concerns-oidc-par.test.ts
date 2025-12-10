import { describe, test, expect } from 'vitest';
import {
  buildPARAuthorizationUrl,
  providerSupportsPAR,
  validatePARConfig
} from '../../../src/plugins/api/concerns/oidc-par.js';

describe('buildPARAuthorizationUrl', () => {
  const authEndpoint = 'https://auth.example.com/authorize';

  test('builds URL with request_uri and client_id', () => {
    const url = buildPARAuthorizationUrl(authEndpoint, 'urn:ietf:params:oauth:request_uri:abc123', 'my-client');
    expect(url).toContain('https://auth.example.com/authorize');
    expect(url).toContain('client_id=my-client');
    expect(url).toContain('request_uri=urn%3Aietf%3Aparams%3Aoauth%3Arequest_uri%3Aabc123');
  });

  test('preserves existing query params', () => {
    const url = buildPARAuthorizationUrl('https://auth.example.com/authorize?existing=param', 'urn:request:123', 'client-1');
    expect(url).toContain('existing=param');
    expect(url).toContain('client_id=client-1');
    expect(url).toContain('request_uri=urn%3Arequest%3A123');
  });

  test('URL-encodes special characters in request_uri', () => {
    const url = buildPARAuthorizationUrl(authEndpoint, 'urn:test:with spaces&special=chars', 'client');
    expect(url).not.toContain(' ');
    expect(url).toContain('request_uri=');
  });
});

describe('providerSupportsPAR', () => {
  test('returns true when pushed_authorization_request_endpoint exists', () => {
    const doc = { pushed_authorization_request_endpoint: 'https://auth.example.com/par' };
    expect(providerSupportsPAR(doc)).toBe(true);
  });

  test('returns false when endpoint is missing', () => {
    const doc = { authorization_endpoint: 'https://auth.example.com/authorize' };
    expect(providerSupportsPAR(doc)).toBe(false);
  });

  test('returns false for null document', () => {
    expect(providerSupportsPAR(null)).toBe(false);
  });

  test('returns false for empty string endpoint', () => {
    const doc = { pushed_authorization_request_endpoint: '' };
    expect(providerSupportsPAR(doc)).toBe(false);
  });
});

describe('validatePARConfig', () => {
  const validDiscovery = {
    pushed_authorization_request_endpoint: 'https://auth.example.com/par'
  };

  describe('valid configurations', () => {
    test('accepts config with clientId and clientSecret', () => {
      const config = { clientId: 'my-client', clientSecret: 'secret123' };
      const result = validatePARConfig(config, validDiscovery);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeNull();
    });

    test('accepts config with clientId and clientAssertion', () => {
      const config = { clientId: 'my-client', clientAssertion: 'jwt-token' };
      const result = validatePARConfig(config, validDiscovery);
      expect(result.valid).toBe(true);
    });
  });

  describe('provider validation', () => {
    test('rejects when provider does not support PAR', () => {
      const config = { clientId: 'my-client', clientSecret: 'secret' };
      const result = validatePARConfig(config, { authorization_endpoint: 'https://...' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Provider does not support PAR (missing pushed_authorization_request_endpoint)');
    });

    test('rejects when discovery doc is null', () => {
      const config = { clientId: 'my-client', clientSecret: 'secret' };
      const result = validatePARConfig(config, null);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('does not support PAR');
    });
  });

  describe('clientId validation', () => {
    test('rejects missing clientId', () => {
      const config = { clientId: '', clientSecret: 'secret' };
      const result = validatePARConfig(config, validDiscovery);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('PAR requires clientId');
    });
  });

  describe('authentication validation', () => {
    test('rejects when neither clientSecret nor clientAssertion provided', () => {
      const config = { clientId: 'my-client' };
      const result = validatePARConfig(config, validDiscovery);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('PAR requires either clientSecret or clientAssertion for authentication');
    });
  });

  describe('multiple errors', () => {
    test('collects all validation errors', () => {
      const config = { clientId: '' };
      const result = validatePARConfig(config, null);
      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBeGreaterThanOrEqual(2);
    });
  });
});
