import { describe, test, expect } from '@jest/globals';
import { Plugin } from '#src/plugins/plugin.class.js';

class DummyPlugin extends Plugin {
  constructor(options) {
    super(options);
  }
}

describe('Plugin option normalization', () => {
  test('defaults verbose to false', () => {
    const plugin = new DummyPlugin({});
    expect(plugin.logLevel || plugin.options?.logLevel).not.toBe('debug');
  });

  test('preserves explicit verbose true', () => {
    const plugin = new DummyPlugin({ logLevel: 'debug' });
    expect(plugin.logLevel || plugin.options?.logLevel).toBe('debug');
  });

  test('attaches resources, database, client references', () => {
    const database = { name: 'db' };
    const client = { id: 'client' };
    const resources = { foo: {} };

    const plugin = new DummyPlugin({ resources, database, client });

    expect(plugin.resources).toBe(resources);
    expect(plugin.database).toBe(database);
    expect(plugin.client).toBe(client);
  });
});
