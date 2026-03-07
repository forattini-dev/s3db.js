import { vi } from 'vitest';

import { ApiApp } from '../../../src/plugins/api/app.class.js';

describe('ApiApp hardening', () => {
  test('does not leak stack traces through error.details when handlers throw', async () => {
    const app = new ApiApp();

    app.get('/boom', () => {
      throw new Error('kaboom');
    });

    const response = await app.app.fetch(new Request('http://localhost/boom'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe('kaboom');
    expect(body.error.details).toBeUndefined();
  });

  test('fails route registration when request schema compilation fails', () => {
    const app = new ApiApp();
    app.validator.compile = vi.fn(() => {
      throw new Error('bad schema');
    });

    expect(() => app.post('/invalid', {
      schema: {
        id: { type: 'broken' }
      }
    }, () => new Response('ok'))).toThrow('Failed to compile route schema: bad schema');
  });
});
