import { describe, expect, test, jest } from '@jest/globals';
import { createOidcUtils } from '../../../src/plugins/api/auth/oidc-auth.js';
import { createMockHonoContext } from './helpers/mock-hono-context.js';

const baseConfig = {
  issuer: 'https://issuer.example.com',
  clientId: '11111111-1111-1111-1111-111111111111',
  clientSecret: '22222222-2222-2222-2222-222222222222',
  redirectUri: 'https://app.example.com/auth/callback',
  cookieSecret: 'super-secure-cookie-secret-value-that-is-long',
  cookieMaxAge: 3600000,
  discovery: { enabled: false },
  autoRefreshTokens: false
};

function createUtils(overrides = {}) {
  return createOidcUtils({
    ...baseConfig,
    ...overrides
  });
}

describe('OIDC cookie management', () => {
  test('deleteSession removes cookies and destroys session store entries', async () => {
    const destroy = jest.fn().mockResolvedValue(undefined);
    const store = {
      set: jest.fn(),
      get: jest.fn(),
      destroy
    };

    const utils = createUtils({
      cookieDomain: '.example.com',
      sessionStore: store
    });

    const context = createMockHonoContext({
      oidc_session: 'session-123'
    });

    await utils.deleteSession(context);

    expect(destroy).toHaveBeenCalledWith('session-123');

    const hostDeletion = context._setCookieRecords.filter(
      (record) => record.name === 'oidc_session' && record.options.maxAge === 0 && !record.options.domain
    );
    const domainDeletion = context._setCookieRecords.filter(
      (record) => record.name === 'oidc_session' && record.options.maxAge === 0 && record.options.domain === '.example.com'
    );

    expect(hostDeletion.length).toBeGreaterThan(0);
    expect(domainDeletion.length).toBeGreaterThan(0);
  });

  test('regenerateSession issues new session identifiers and caches data', async () => {
    const store = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      destroy: jest.fn().mockResolvedValue(undefined)
    };

    const utils = createUtils({ sessionStore: store });
    const context = createMockHonoContext({ oidc_session: 'old-session' });

    const sessionData = { sub: 'user-123', roles: ['admin'] };
    const newId = await utils.regenerateSession(context, sessionData);

    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledWith(newId, sessionData, baseConfig.cookieMaxAge);

    const newCookieHeaders = context._setCookieHeaders.filter(
      (header) => header.startsWith('oidc_session=') && !header.includes('Max-Age=0')
    );
    expect(newCookieHeaders).toHaveLength(1);
    expect(newCookieHeaders[0]).toContain(encodeURIComponent(newId));

    const cached = await utils.getCachedSession(context);
    expect(cached).toEqual(sessionData);
    expect(store.get).not.toHaveBeenCalled();
  });

  test('getCachedSession only hits the session store once per request', async () => {
    const sessionData = { sub: 'abc-123' };
    const store = {
      set: jest.fn(),
      destroy: jest.fn(),
      get: jest.fn().mockResolvedValue(sessionData)
    };

    const utils = createUtils({ sessionStore: store });
    const context = createMockHonoContext({ oidc_session: 'cached-session' });

    const first = await utils.getCachedSession(context);
    const second = await utils.getCachedSession(context);

    expect(first).toEqual(sessionData);
    expect(second).toEqual(sessionData);
    expect(store.get).toHaveBeenCalledTimes(1);
  });

  test('deleteSession logs warning when session cookie missing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const store = {
      set: jest.fn(),
      get: jest.fn(),
      destroy: jest.fn()
    };

    const utils = createUtils({ sessionStore: store });
    const context = createMockHonoContext({});

    await utils.deleteSession(context);

    expect(store.destroy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[OIDC] Session cookie missing during deletion',
      expect.objectContaining({ cookieName: 'oidc_session' })
    );

    warnSpy.mockRestore();
  });

  test('regenerateSession emits chunked cookies for large payloads', async () => {
    const utils = createUtils({});
    const context = createMockHonoContext({ oidc_session: 'previous-session' });

    const largePayload = { sub: 'user-xyz', blob: 'x'.repeat(12000) };
    await utils.regenerateSession(context, largePayload);

    const metadataCookie = context._setCookieRecords.find((record) => record.name === 'oidc_session.__chunks');
    expect(metadataCookie).toBeDefined();
    const chunkCount = parseInt(metadataCookie.value, 10);
    expect(chunkCount).toBeGreaterThan(1);

    const chunkCookies = context._setCookieRecords.filter((record) => /^oidc_session\.\d+$/.test(record.name));
    expect(chunkCookies.length).toBe(chunkCount);
  });
});
