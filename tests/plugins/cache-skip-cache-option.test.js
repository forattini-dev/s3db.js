
import { CachePlugin } from '../../src/plugins/cache.plugin.js';
import { createMemoryDatabaseForTest } from '../config.js';

const USERS_CONFIG = {
  name: 'users',
  attributes: {
    id: 'string|optional',
    name: 'string|required',
    balance: 'number|default:0'
  }
};

describe('CachePlugin - skipCache option', () => {
  let database;
  let cachePlugin;
  let users;

  beforeEach(async () => {
    database = createMemoryDatabaseForTest('cache-skip-option');
    await database.connect();

    users = await database.createResource(USERS_CONFIG);

    cachePlugin = new CachePlugin({ logLevel: 'silent', driver: 'memory' });
    await cachePlugin.install(database);
  });

  afterEach(async () => {
    await database.disconnect();
    database = null;
  });

  it('bypasses cache on get when skipCache: true', async () => {
    await users.insert({ id: 'user-001', name: 'John Doe', balance: 100 });

    const cached = await users.get('user-001');
    expect(cached.balance).toBe(100);

    await users.update('user-001', { balance: 500 });

    const staleKey = await users.cacheKeyFor({ action: 'get', params: { id: 'user-001' } });
    await users.cache.set(staleKey, { id: 'user-001', name: 'John Doe', balance: 999 });

    const cachedRead = await users.get('user-001');
    expect(cachedRead.balance).toBe(999);

    const freshRead = await users.get('user-001', { skipCache: true });
    expect(freshRead.balance).toBe(500);
  });
});
