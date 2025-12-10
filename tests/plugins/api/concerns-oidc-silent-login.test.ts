import { describe, test, expect } from 'vitest';
import {
  handleSilentLoginError,
  buildSilentLoginUrl
} from '../../../src/plugins/api/concerns/oidc-silent-login.js';

describe('handleSilentLoginError', () => {
  describe('interactive login required errors', () => {
    test('handles login_required', () => {
      const result = handleSilentLoginError({ error: 'login_required' });
      expect(result.shouldRedirectToLogin).toBe(true);
      expect(result.reason).toBe('login_required');
      expect(result.message).toContain('Silent login failed');
    });

    test('handles consent_required', () => {
      const result = handleSilentLoginError({ error: 'consent_required' });
      expect(result.shouldRedirectToLogin).toBe(true);
      expect(result.reason).toBe('consent_required');
    });

    test('handles interaction_required', () => {
      const result = handleSilentLoginError({ error: 'interaction_required' });
      expect(result.shouldRedirectToLogin).toBe(true);
      expect(result.reason).toBe('interaction_required');
    });

    test('handles account_selection_required', () => {
      const result = handleSilentLoginError({ error: 'account_selection_required' });
      expect(result.shouldRedirectToLogin).toBe(true);
      expect(result.reason).toBe('account_selection_required');
    });
  });

  describe('other errors', () => {
    test('handles invalid_grant without redirect', () => {
      const result = handleSilentLoginError({ error: 'invalid_grant', error_description: 'Token expired' });
      expect(result.shouldRedirectToLogin).toBe(false);
      expect(result.reason).toBe('invalid_grant');
      expect(result.message).toBe('Token expired');
    });

    test('handles access_denied without redirect', () => {
      const result = handleSilentLoginError({ error: 'access_denied' });
      expect(result.shouldRedirectToLogin).toBe(false);
      expect(result.reason).toBe('access_denied');
    });

    test('handles server_error without redirect', () => {
      const result = handleSilentLoginError({ error: 'server_error' });
      expect(result.shouldRedirectToLogin).toBe(false);
    });

    test('uses error_description when available', () => {
      const result = handleSilentLoginError({
        error: 'server_error',
        error_description: 'Internal server error occurred'
      });
      expect(result.message).toBe('Internal server error occurred');
    });

    test('uses default message when no description', () => {
      const result = handleSilentLoginError({ error: 'unknown_error' });
      expect(result.message).toBe('Authentication error');
    });
  });

  describe('error code alternatives', () => {
    test('handles code field instead of error', () => {
      const result = handleSilentLoginError({ code: 'login_required' });
      expect(result.shouldRedirectToLogin).toBe(true);
      expect(result.reason).toBe('login_required');
    });

    test('prefers error over code', () => {
      const result = handleSilentLoginError({ error: 'login_required', code: 'invalid_grant' });
      expect(result.reason).toBe('login_required');
    });
  });

  describe('empty/missing error', () => {
    test('handles empty object', () => {
      const result = handleSilentLoginError({});
      expect(result.shouldRedirectToLogin).toBe(false);
      expect(result.reason).toBe('');
    });
  });
});

describe('buildSilentLoginUrl', () => {
  const baseUrl = 'https://auth.example.com/authorize';

  test('adds prompt=none parameter', () => {
    const url = buildSilentLoginUrl(baseUrl, {});
    expect(url).toContain('prompt=none');
  });

  test('includes provided parameters', () => {
    const url = buildSilentLoginUrl(baseUrl, {
      client_id: 'my-client',
      redirect_uri: 'https://app.example.com/callback',
      response_type: 'code',
      scope: 'openid profile'
    });
    expect(url).toContain('client_id=my-client');
    expect(url).toContain('redirect_uri=');
    expect(url).toContain('response_type=code');
    expect(url).toContain('scope=openid+profile');
  });

  test('skips null and undefined values', () => {
    const url = buildSilentLoginUrl(baseUrl, {
      client_id: 'my-client',
      state: null,
      nonce: undefined
    });
    expect(url).toContain('client_id=my-client');
    expect(url).not.toContain('state=');
    expect(url).not.toContain('nonce=');
  });

  test('overwrites existing prompt param with none', () => {
    const url = buildSilentLoginUrl(baseUrl, { prompt: 'consent' });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('prompt')).toBe('none');
  });

  test('URL-encodes special characters', () => {
    const url = buildSilentLoginUrl(baseUrl, {
      redirect_uri: 'https://app.example.com/callback?foo=bar'
    });
    expect(url).toContain('redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback%3Ffoo%3Dbar');
  });

  test('preserves base URL query params', () => {
    const urlWithParams = 'https://auth.example.com/authorize?tenant=abc';
    const url = buildSilentLoginUrl(urlWithParams, { client_id: 'test' });
    expect(url).toContain('tenant=abc');
    expect(url).toContain('client_id=test');
  });
});
