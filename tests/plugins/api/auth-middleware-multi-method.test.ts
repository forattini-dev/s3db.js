import { createAuthMiddleware } from '../../../src/plugins/api/auth/index.js';
import { HttpApp } from '../../../src/plugins/shared/http-runtime.js';

describe('createAuthMiddleware multi-method OIDC support', () => {
  test('runs OIDC middleware when request carries the default session cookie', async () => {
    const authMiddleware = await createAuthMiddleware({
      methods: ['header-secret', 'oidc'],
      headerSecret: { secret: 'admin-secret' },
      oidc: async (c, next) => {
        c.set('user', { id: 'oidc-user' });
        c.set('authMethod', 'oidc');
        await next();
      },
      database: {} as never
    });

    const app = new HttpApp();
    app.get('/secure', authMiddleware, (c) => c.json({
      ok: true,
      authMethod: c.get('authMethod'),
      user: c.get('user')
    }));

    const response = await app.fetch(new Request('http://localhost/secure', {
      headers: {
        Cookie: 'oidc_session=session-token'
      }
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      authMethod: 'oidc',
      user: { id: 'oidc-user' }
    });
  });

  test('detects custom OIDC cookie names including chunked cookies', async () => {
    const authMiddleware = await createAuthMiddleware({
      methods: ['header-secret', 'oidc'],
      headerSecret: { secret: 'admin-secret' },
      oidcCookieName: 'custom_oidc',
      oidc: async (c, next) => {
        c.set('user', { id: 'chunked-user' });
        c.set('authMethod', 'oidc');
        await next();
      },
      database: {} as never
    });

    const app = new HttpApp();
    app.get('/secure', authMiddleware, (c) => c.json({
      ok: true,
      authMethod: c.get('authMethod'),
      user: c.get('user')
    }));

    const response = await app.fetch(new Request('http://localhost/secure', {
      headers: {
        Cookie: 'custom_oidc.__chunks=2; custom_oidc.0=part-a; custom_oidc.1=part-b'
      }
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      authMethod: 'oidc',
      user: { id: 'chunked-user' }
    });
  });
});
