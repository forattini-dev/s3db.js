/**
 * Tests for OIDC Phase 4 Features
 * @group api
 */


// Provider Compatibility Validation
import {
  validateProviderCompatibility,
  getProviderCapabilities
} from '../../../src/plugins/api/concerns/oidc-provider-validator.js';

// Silent Login
import {
  shouldAttemptSilentLogin,
  handleSilentLoginError,
  buildSilentLoginUrl
} from '../../../src/plugins/api/concerns/oidc-silent-login.js';

// PAR
import {
  providerSupportsPAR,
  buildPARAuthorizationUrl,
  validatePARConfig
} from '../../../src/plugins/api/concerns/oidc-par.js';

// Client Assertion
import {
  validatePrivateKey,
  applyClientAuth
} from '../../../src/plugins/api/concerns/oidc-client-assertion.js';

// Backchannel Logout
import {
  validateLogoutTokenClaims,
  providerSupportsBackchannelLogout,
  validateBackchannelLogoutConfig
} from '../../../src/plugins/api/concerns/oidc-backchannel-logout.js';

describe('Phase 4: Provider Compatibility Validation', () => {
  const baseConfig = {
    idTokenSigningAlg: 'RS256',
    responseType: 'code',
    scope: 'openid profile email offline_access',
    autoRefreshTokens: true
  };

  const completeDiscovery = {
    authorization_endpoint: 'https://provider.com/authorize',
    token_endpoint: 'https://provider.com/token',
    userinfo_endpoint: 'https://provider.com/userinfo',
    end_session_endpoint: 'https://provider.com/logout',
    id_token_signing_alg_values_supported: ['RS256', 'ES256'],
    response_types_supported: ['code', 'code id_token'],
    response_modes_supported: ['query', 'fragment'],
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256', 'plain'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'name', 'email']
  };

  test('validates complete provider', () => {
    const result = validateProviderCompatibility(completeDiscovery, baseConfig);
    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test('detects unsupported signing algorithm', () => {
    const config = { ...baseConfig, idTokenSigningAlg: 'HS256' };
    const result = validateProviderCompatibility(completeDiscovery, config);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('HS256');
  });

  test('detects unsupported response type', () => {
    const config = { ...baseConfig, responseType: 'id_token' };
    const result = validateProviderCompatibility(completeDiscovery, config);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('id_token');
  });

  test('detects unsupported scopes', () => {
    const config = { ...baseConfig, scope: 'openid profile custom_scope' };
    const result = validateProviderCompatibility(completeDiscovery, config);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('custom_scope');
  });

  test('detects missing token endpoint', () => {
    const discovery = { ...completeDiscovery, token_endpoint: undefined };
    const result = validateProviderCompatibility(discovery, baseConfig);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('token_endpoint');
  });

  test('detects missing authorization endpoint', () => {
    const discovery = { ...completeDiscovery, authorization_endpoint: undefined };
    const result = validateProviderCompatibility(discovery, baseConfig);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('authorization_endpoint');
  });

  test('warns about missing refresh_token grant', () => {
    const discovery = { ...completeDiscovery, grant_types_supported: ['authorization_code'] };
    const result = validateProviderCompatibility(discovery, baseConfig);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('refresh_token');
  });

  test('warns about missing offline_access scope', () => {
    const config = { ...baseConfig, scope: 'openid profile email' };
    const result = validateProviderCompatibility(completeDiscovery, config);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('offline_access') || w.includes('refresh_token'))).toBe(true);
  });

  test('gets provider capabilities', () => {
    const caps = getProviderCapabilities(completeDiscovery);
    expect(caps.hasTokenEndpoint).toBe(true);
    expect(caps.hasUserinfoEndpoint).toBe(true);
    expect(caps.hasLogoutEndpoint).toBe(true);
    expect(caps.supportsRefreshTokens).toBe(true);
    expect(caps.supportsPKCE).toBe(true);
    expect(caps.supportedScopes).toContain('openid');
    expect(caps.supportedSigningAlgs).toContain('RS256');
  });
});

describe('Phase 4: Silent Login', () => {
  let mockContext;

  beforeEach(() => {
    mockContext = {
      req: {
        path: '/dashboard',
        header: (name) => {
          if (name === 'accept') return 'text/html';
          return null;
        },
        cookie: (name) => null
      },
      get: (key) => null
    };
  });

  test('should attempt silent login for HTML requests', () => {
    const result = shouldAttemptSilentLogin(mockContext, {
      enableSilentLogin: true
    });
    expect(result).toBe(true);
  });

  test('should not attempt if user already authenticated', () => {
    mockContext.get = (key) => key === 'user' ? { id: 1 } : null;
    const result = shouldAttemptSilentLogin(mockContext, {
      enableSilentLogin: true
    });
    expect(result).toBe(false);
  });

  test('should not attempt if already tried', () => {
    mockContext.req.cookie = (name) => name === '_silent_login_attempted' ? '1' : null;
    const result = shouldAttemptSilentLogin(mockContext, {
      enableSilentLogin: true
    });
    expect(result).toBe(false);
  });

  test('should not attempt for API requests', () => {
    mockContext.req.header = (name) => {
      if (name === 'accept') return 'application/json';
      return null;
    };
    const result = shouldAttemptSilentLogin(mockContext, {
      enableSilentLogin: true
    });
    expect(result).toBe(false);
  });

  test('should respect silentLoginPaths', () => {
    const result = shouldAttemptSilentLogin(mockContext, {
      enableSilentLogin: true,
      silentLoginPaths: ['/admin']
    });
    expect(result).toBe(false);  // /dashboard not in allowed paths
  });

  test('should respect excludePaths', () => {
    const result = shouldAttemptSilentLogin(mockContext, {
      enableSilentLogin: true,
      excludePaths: ['/dashboard']
    });
    expect(result).toBe(false);
  });

  test('handles silent login errors correctly', () => {
    const result = handleSilentLoginError({ error: 'login_required' });
    expect(result.shouldRedirectToLogin).toBe(true);
    expect(result.reason).toBe('login_required');
  });

  test('handles non-silent errors', () => {
    const result = handleSilentLoginError({ error: 'server_error' });
    expect(result.shouldRedirectToLogin).toBe(false);
  });

  test('builds silent login URL with prompt=none', () => {
    const url = buildSilentLoginUrl('https://provider.com/authorize', {
      client_id: 'test-client',
      redirect_uri: 'https://app.com/callback'
    });
    expect(url).toContain('prompt=none');
    expect(url).toContain('client_id=test-client');
  });
});

describe('Phase 4: PAR (Pushed Authorization Requests)', () => {
  const discovery = {
    pushed_authorization_request_endpoint: 'https://provider.com/par'
  };

  const config = {
    clientId: 'test-client',
    clientSecret: 'test-secret'
  };

  test('detects PAR support', () => {
    const result = providerSupportsPAR(discovery);
    expect(result).toBe(true);
  });

  test('detects no PAR support', () => {
    const result = providerSupportsPAR({});
    expect(result).toBe(false);
  });

  test('builds PAR authorization URL', () => {
    const url = buildPARAuthorizationUrl(
      'https://provider.com/authorize',
      'urn:ietf:params:oauth:request_uri:xyz123',
      'test-client'
    );
    expect(url).toContain('client_id=test-client');
    expect(url).toContain('request_uri=');
  });

  test('validates PAR configuration', () => {
    const result = validatePARConfig(config, discovery);
    expect(result.valid).toBe(true);
  });

  test('detects missing PAR support', () => {
    const result = validatePARConfig(config, {});
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('does not support PAR');
  });

  test('detects missing authentication', () => {
    const result = validatePARConfig({ clientId: 'test' }, discovery);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('authentication');
  });
});

describe('Phase 4: Client Assertion (JWK)', () => {
  const validRSAKey = {
    kty: 'RSA',
    alg: 'RS256',
    use: 'sig',
    n: 'test-modulus',
    e: 'AQAB',
    d: 'private-exponent'
  };

  test('validates RSA private key', () => {
    const result = validatePrivateKey(validRSAKey);
    expect(result.valid).toBe(true);
  });

  test('rejects missing key', () => {
    const result = validatePrivateKey(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('required');
  });

  test('rejects missing kty', () => {
    const key = { ...validRSAKey, kty: undefined };
    const result = validatePrivateKey(key);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('kty');
  });

  test('rejects RSA key without d component', () => {
    const key = { ...validRSAKey, d: undefined };
    const result = validatePrivateKey(key);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('d');
  });

  test('rejects unsupported key type', () => {
    const key = { ...validRSAKey, kty: 'oct' };
    const result = validatePrivateKey(key);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Unsupported');
  });

  test('applies client_secret_basic auth', () => {
    const clientAuth = {
      method: 'client_secret_basic',
      clientId: 'test-client',
      clientSecret: 'test-secret'
    };

    const options = applyClientAuth(clientAuth, { headers: {}, body: new URLSearchParams() });
    expect(options.headers.Authorization).toContain('Basic');
  });

  test('applies client_secret_post auth', () => {
    const clientAuth = {
      method: 'client_secret_post',
      clientId: 'test-client',
      clientSecret: 'test-secret'
    };

    const options = applyClientAuth(clientAuth, { headers: {}, body: new URLSearchParams() });
    expect(options.body.has('client_id')).toBe(true);
    expect(options.body.has('client_secret')).toBe(true);
  });

  test('applies private_key_jwt auth', () => {
    const clientAuth = {
      method: 'private_key_jwt',
      clientId: 'test-client',
      clientAssertion: 'eyJhbGc...',
      clientAssertionType: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
    };

    const options = applyClientAuth(clientAuth, { headers: {}, body: new URLSearchParams() });
    expect(options.body.has('client_assertion')).toBe(true);
    expect(options.body.has('client_assertion_type')).toBe(true);
  });
});

describe('Phase 4: Backchannel Logout', () => {
  const validLogoutToken = {
    iss: 'https://provider.com',
    aud: 'test-client',
    iat: Math.floor(Date.now() / 1000),
    jti: 'unique-jwt-id',
    events: {
      'http://schemas.openid.net/event/backchannel-logout': {}
    },
    sub: 'user-123'
  };

  test('validates logout token claims', () => {
    const result = validateLogoutTokenClaims(validLogoutToken);
    expect(result.valid).toBe(true);
  });

  test('rejects missing events claim', () => {
    const token = { ...validLogoutToken, events: undefined };
    const result = validateLogoutTokenClaims(token);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('events');
  });

  test('rejects missing backchannel event', () => {
    const token = { ...validLogoutToken, events: {} };
    const result = validateLogoutTokenClaims(token);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('backchannel-logout');
  });

  test('rejects missing sub and sid', () => {
    const token = { ...validLogoutToken, sub: undefined };
    const result = validateLogoutTokenClaims(token);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('sub');
  });

  test('rejects nonce in logout token', () => {
    const token = { ...validLogoutToken, nonce: 'should-not-be-here' };
    const result = validateLogoutTokenClaims(token);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('nonce');
  });

  test('requires jti for replay protection', () => {
    const token = { ...validLogoutToken, jti: undefined };
    const result = validateLogoutTokenClaims(token);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('jti');
  });

  test('detects provider support', () => {
    const discovery = { backchannel_logout_supported: true };
    const result = providerSupportsBackchannelLogout(discovery);
    expect(result).toBe(true);
  });

  test('validates backchannel logout config', () => {
    const mockSessionStore = {
      destroy: async () => {},
      findBySub: async () => []
    };

    const config = {
      sessionStore: mockSessionStore,
      backchannelLogoutUri: 'https://app.com/logout'
    };

    const discovery = { backchannel_logout_supported: true };

    const result = validateBackchannelLogoutConfig(config, discovery);
    expect(result.valid).toBe(true);
  });

  test('requires session store', () => {
    const config = {};
    const discovery = { backchannel_logout_supported: true };

    const result = validateBackchannelLogoutConfig(config, discovery);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('sessionStore');
  });
});
