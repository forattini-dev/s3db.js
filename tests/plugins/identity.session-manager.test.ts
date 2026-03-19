import { SessionManager } from '../../src/plugins/identity/session-manager.js';

describe('SessionManager', () => {
  const createSessionResource = () => ({
    insert: vi.fn(async (data) => ({ id: 'sess-123', ...data })),
    get: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: vi.fn(),
    list: vi.fn()
  });

  it('returns expiresAt as ISO string when creating a session', async () => {
    const sessionResource = createSessionResource();
    const sessionManager = new SessionManager({
      sessionResource,
      config: { enableCleanup: false }
    });

    const result = await sessionManager.createSession({
      userId: 'user-123',
      metadata: { role: 'admin' }
    });

    expect(result.sessionId).toBe('sess-123');
    expect(typeof result.expiresAt).toBe('string');
    expect(Number.isFinite(Date.parse(result.expiresAt))).toBe(true);
    expect(result.expiresAt).toBe(result.session.expiresAt);
    expect(sessionResource.insert).toHaveBeenCalledWith(expect.objectContaining({
      expiresAt: expect.any(String),
      createdAt: expect.any(String)
    }));
  });

  it('accepts ISO expiresAt when setting session cookies', () => {
    const sessionManager = new SessionManager({
      sessionResource: createSessionResource(),
      config: { enableCleanup: false }
    });
    const response = {
      setHeader: vi.fn()
    };
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    sessionManager.setSessionCookie(response, 'sess-123', expiresAt);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('Expires=')
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('Max-Age=')
    );
  });
});
