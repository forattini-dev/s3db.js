import { describe, expect, test, jest } from '@jest/globals';
import createOIDCHandler from '../../../src/plugins/api/auth/oidc-auth.js';
import { createMockHonoContext } from './helpers/mock-hono-context.js';

const baseConfig = {
  issuer: 'https://issuer.example.com',
  clientId: '11111111-1111-1111-1111-111111111111',
  clientSecret: '22222222-2222-2222-2222-222222222222',
  redirectUri: 'https://app.example.com/auth/callback',
  cookieSecret: 'super-secure-cookie-secret-value-that-is-long',
  discovery: { enabled: false },
  autoRefreshTokens: false
};

function createHandler(overrides = {}) {
  const app = { get: jest.fn() };
  return createOIDCHandler({
    ...baseConfig,
    ...overrides
  }, app, null);
}

describe('OIDC cookie management', () => {
  test('deleteSession removes cookies and destroys session store entries', async () => {
    const destroy = jest.fn().mockResolvedValue(undefined);
    const store = {
      set: jest.fn(),
      get: jest.fn(),
      destroy
    };

    const driver = createHandler({
      cookieDomain: '.example.com',
      sessionStore: store
    });

    const context = createMockHonoContext({
      oidc_session: 'session-123'
    });

    await driver.utils.deleteSession(context);

    expect(destroy).toHaveBeenCalledWith('session-123');

    const hostDeletion = context._setCookieHeaders.filter(
      (header) => header.startsWith('oidc_session=') && header.includes('Max-Age=0') && !header.includes('Domain=')
    );
    const domainDeletion = context._setCookieHeaders.filter(
      (header) => header.startsWith('oidc_session=') && header.includes('Max-Age=0') && header.includes('Domain=.example.com')
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

    const driver = createHandler({ sessionStore: store });
    const context = createMockHonoContext({ oidc_session: 'old-session' });

    const sessionData = { sub: 'user-123', roles: ['admin'] };
    const newId = await driver.utils.regenerateSession(context, sessionData);

    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledWith(newId, sessionData, driver.config.cookieMaxAge);

    const newCookieHeaders = context._setCookieHeaders.filter(
      (header) => header.startsWith('oidc_session=') && !header.includes('Max-Age=0')
    );
    expect(newCookieHeaders).toHaveLength(1);
    expect(newCookieHeaders[0]).toContain(encodeURIComponent(newId));

    const cached = await driver.utils.getCachedSession(context);
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

    const driver = createHandler({ sessionStore: store });
    const context = createMockHonoContext({ oidc_session: 'cached-session' });

    const first = await driver.utils.getCachedSession(context);
    const second = await driver.utils.getCachedSession(context);

    expect(first).toEqual(sessionData);
    expect(second).toEqual(sessionData);
    expect(store.get).toHaveBeenCalledTimes(1);
  });
});
