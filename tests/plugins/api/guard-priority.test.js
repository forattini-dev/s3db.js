
import { guardMiddleware } from '../../../src/plugins/api/utils/guards.js';

function createMockContext({ user } = {}) {
  const store = new Map();

  if (user) {
    store.set('user', user);
  }

  const req = {
    param() {
      return {};
    },
    query() {
      return {};
    },
    header() {
      return undefined;
    },
    raw: {
      method: 'GET',
      url: 'http://localhost/users'
    }
  };

  return {
    req,
    get(key) {
      return store.get(key);
    },
    set(key, value) {
      store.set(key, value);
    },
    header() {},
    json(payload, status = 200) {
      store.set('response', { payload, status });
      return { payload, status };
    }
  };
}

async function executeGuard({ resource, globalGuards, user }) {
  const database = { resources: { [resource.name]: resource }, plugins: {} };
  resource.database = database;

  const guards = resource.guards || resource.config?.guards || null;
  const middleware = guardMiddleware(guards, 'list', {
    resource,
    database,
    globalGuards
  });

  const ctx = createMockContext({ user });
  let nextCalled = false;

  await middleware(ctx, async () => {
    nextCalled = true;
  });

  return {
    response: ctx.get('response'),
    nextCalled
  };
}

describe('API Plugin - Guard priority', () => {
  test('resource.guards override legacy config and global guards', async () => {
    const resource = {
      name: 'users',
      guards: {
        list: () => false
      },
      config: {
        guards: {
          list: () => true
        }
      },
      schema: { validate: () => true }
    };

    const { response, nextCalled } = await executeGuard({
      resource,
      globalGuards: {
        list: () => true
      },
      user: { id: 'user-1', scopes: ['read:users'] }
    });

    expect(nextCalled).toBe(false);
    expect(response.status).toBe(403);
    expect(response.payload.error.code).toBe('FORBIDDEN');
  });

  test('global guards apply when resource guard is not provided', async () => {
    const resource = {
      name: 'users',
      config: {},
      schema: { validate: () => true }
    };

    const { response, nextCalled } = await executeGuard({
      resource,
      globalGuards: {
        list: () => false
      },
      user: { id: 'user-1', scopes: [] }
    });

    expect(nextCalled).toBe(false);
    expect(response.status).toBe(403);
  });

  test('resource.config.guards still override global guards when resource.guards absent', async () => {
    const resource = {
      name: 'users',
      config: {
        guards: {
          list: () => false
        }
      },
      schema: { validate: () => true }
    };

    const { response, nextCalled } = await executeGuard({
      resource,
      globalGuards: {
        list: () => true
      },
      user: { id: 'user-1', scopes: ['read:users'] }
    });

    expect(nextCalled).toBe(false);
    expect(response.status).toBe(403);
  });

  test('request proceeds when guard chain resolves to true', async () => {
    const resource = {
      name: 'users',
      config: {},
      schema: { validate: () => true }
    };

    const { response, nextCalled } = await executeGuard({
      resource,
      globalGuards: {
        list: () => true
      },
      user: { id: 'admin', scopes: ['admin:*'] }
    });

    expect(nextCalled).toBe(true);
    expect(response).toBeUndefined();
  });
});
