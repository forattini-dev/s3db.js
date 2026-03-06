import { describe, expect, test } from 'vitest';
import {
  createAppContext,
  createRaffelContext,
} from '../../../src/plugins/api/concerns/guards-helpers.js';

function createMockRequestContext() {
  const store = new Map<string, unknown>();
  store.set('user', { sub: 'user-123', role: 'admin' });

  return {
    get(key: string) {
      return store.get(key);
    },
    req: {
      param(name?: string) {
        const params = { id: 'order-1' };
        return name ? params[name as keyof typeof params] : params;
      },
      query(name?: string) {
        const query = { status: 'active' };
        return name ? query[name as keyof typeof query] : query;
      },
      async json() {
        return { total: 42 };
      },
      raw: {
        headers: new Headers([
          ['x-tenant-id', 'tenant-1'],
          ['x-request-id', 'req-1'],
        ]),
      },
    },
  };
}

describe('guards helpers context adapters', () => {
  test('createRaffelContext and createAppContext return the same normalized shape', async () => {
    const context = createMockRequestContext();

    const [raffelContext, appContext] = await Promise.all([
      createRaffelContext(context as any),
      createAppContext(context as any),
    ]);

    for (const adapted of [raffelContext, appContext]) {
      expect(adapted.user).toEqual({ sub: 'user-123', role: 'admin' });
      expect(adapted.params).toEqual({ id: 'order-1' });
      expect(adapted.query).toEqual({ status: 'active' });
      expect(adapted.body).toEqual({ total: 42 });
      expect(adapted.headers).toMatchObject({
        'x-tenant-id': 'tenant-1',
        'x-request-id': 'req-1',
      });
      expect(adapted.raw.c).toBe(context);
    }
  });
});
