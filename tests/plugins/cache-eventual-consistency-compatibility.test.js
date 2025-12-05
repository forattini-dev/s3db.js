/**
 * Cache + EventualConsistencyPlugin Compatibility Tests
 * Verifica que recursos criados por plugins não são cacheados por padrão e que
 * o cache invalida corretamente após consolidações.
 */


import { CachePlugin } from '../../src/plugins/cache.plugin.js';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

const WALLET_RESOURCE_CONFIG = {
  name: 'wallets',
  attributes: {
    id: 'string|optional',
    userId: 'string|required',
    balance: 'number|default:0'
  },
  createdBy: 'user'
};

const EC_PLUGIN_CONFIG = {
  resources: {
    wallets: ['balance']
  },
  mode: 'sync',
  autoConsolidate: false,
  enableAnalytics: false,
  logLevel: 'silent'
};

const TRANSACTION_RESOURCE_NAME = 'plg_wallets_tx_balance';

const previousConnectionString = process.env.BUCKET_CONNECTION_STRING;

beforeAll(() => {
  process.env.BUCKET_CONNECTION_STRING = 'memory://cache-ec';
});

afterAll(() => {
  if (previousConnectionString === undefined) {
    delete process.env.BUCKET_CONNECTION_STRING;
  } else {
    process.env.BUCKET_CONNECTION_STRING = previousConnectionString;
  }
});

async function withScenario(name, { cacheOptions = {} } = {}, run) {
  const database = await createDatabaseForTest(`cache-ec-${name}`);

  try {
    const wallets = await database.createResource({ ...WALLET_RESOURCE_CONFIG });

    const eventualPlugin = new EventualConsistencyPlugin({ ...EC_PLUGIN_CONFIG });
    await database.usePlugin(eventualPlugin);

    const cachePlugin = new CachePlugin({
      logLevel: 'silent',
      driver: 'memory',
      logLevel: 'silent',
      ...cacheOptions
    });
    await database.usePlugin(cachePlugin);

    await run({ database, cachePlugin, wallets });
  } finally {
    await database.disconnect();
  }
}

describe('CachePlugin + EventualConsistencyPlugin Compatibility', () => {
  it('does not cache plugin-created resources by default', async () => {
    await withScenario('plugin-resources', {}, async ({ database, cachePlugin }) => {
      const transactionResource = database.resources[TRANSACTION_RESOURCE_NAME];

      expect(transactionResource).toBeDefined();

      const metadata = database.savedMetadata?.resources?.[TRANSACTION_RESOURCE_NAME];
      expect(metadata?.createdBy).toBe('EventualConsistencyPlugin');

      expect(cachePlugin.shouldCacheResource(TRANSACTION_RESOURCE_NAME)).toBe(false);
      expect(transactionResource.cache).toBeUndefined();
    });
  });

  it('caches recursos criados pelo usuário', async () => {
    await withScenario('user-resources', {}, async ({ database, cachePlugin, wallets }) => {
      const metadata = database.savedMetadata?.resources?.wallets;
      expect(metadata?.createdBy).toBe('user');

      expect(cachePlugin.shouldCacheResource('wallets')).toBe(true);
      expect(wallets.cache).toBeDefined();
    });
  });

  it('invalida o cache após consolidar transações', async () => {
    await withScenario('invalidation', {}, async ({ cachePlugin, wallets }) => {
      await wallets.insert({ id: 'w1', userId: 'u1', balance: 100 });

      const wallet1 = await wallets.get('w1');
      const cacheKey = await wallets.cacheKeyFor({ id: 'w1' });
      await wallets.cache.set(cacheKey, { ...wallet1 });

      await wallets.add('w1', 'balance', 50);
      await wallets.add('w1', 'balance', 25);
      await wallets.consolidate('w1', 'balance');

      const cachedAfter = await wallets.cache.get(cacheKey);
      expect(cachedAfter).toBeNull();

      const wallet2 = await wallets.get('w1');
      expect(wallet2.balance).toBe(175);
    });
  });

  it('respeita recursos com cache desabilitado', async () => {
    await withScenario('cache-disabled', {}, async ({ database }) => {
      const accounts = await database.createResource({
        name: 'accounts',
        attributes: {
          id: 'string|optional',
          balance: 'number|default:0'
        },
        cache: false,
        createdBy: 'user'
      });

      const accountsPlugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
        resources: {
          accounts: ['balance']
        },
        mode: 'sync',
        autoConsolidate: false
      });
      await database.usePlugin(accountsPlugin);

      await accounts.insert({ id: 'a1', balance: 0 });
      await accounts.add('a1', 'balance', 100);
      await accounts.consolidate('a1', 'balance');

      const account = await accounts.get('a1');
      expect(account.balance).toBe(100);
    });
  });

  it('permite incluir explicitamente recursos de plugins', async () => {
    await withScenario(
      'explicit-include',
      { cacheOptions: { include: [TRANSACTION_RESOURCE_NAME] } },
      async ({ database, cachePlugin }) => {
        const transactionResource = database.resources[TRANSACTION_RESOURCE_NAME];

        expect(cachePlugin.shouldCacheResource(TRANSACTION_RESOURCE_NAME)).toBe(true);
        expect(transactionResource.cache).toBeDefined();
      }
    );
  });

  it('mantém cache consistente após múltiplas consolidações', async () => {
    await withScenario('multiple-consolidations', {}, async ({ wallets }) => {
      await wallets.insert({ id: 'w1', userId: 'u1', balance: 0 });

      await wallets.add('w1', 'balance', 100);
      await wallets.consolidate('w1', 'balance');
      expect((await wallets.get('w1')).balance).toBe(100);

      await wallets.add('w1', 'balance', 50);
      await wallets.consolidate('w1', 'balance');
      expect((await wallets.get('w1')).balance).toBe(150);

      await wallets.add('w1', 'balance', 25);
      await wallets.consolidate('w1', 'balance');
      expect((await wallets.get('w1')).balance).toBe(175);
    });
  });

  it('tolera falhas ao invalidar o cache durante consolidação', async () => {
    await withScenario('cache-invalidation-error', {}, async ({ wallets }) => {
      await wallets.insert({ id: 'w1', userId: 'u1', balance: 0 });

      const originalDelete = wallets.cache.delete;
      let deleteCalls = 0;
      wallets.cache.delete = async () => {
        deleteCalls += 1;
        throw new Error('Cache delete failed');
      };

      await wallets.add('w1', 'balance', 100);

      await wallets.consolidate('w1', 'balance');

      wallets.cache.delete = originalDelete;

      expect(deleteCalls).toBe(1);
      const wallet = await wallets.get('w1');
      expect(wallet.balance).toBe(100);
    });
  });
});
