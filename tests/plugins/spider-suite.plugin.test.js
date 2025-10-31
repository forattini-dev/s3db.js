import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { createMemoryDatabaseForTest } from '../config.js';
import { SpiderSuitePlugin } from '../../src/plugins/spider-suite.plugin.js';
import { PuppeteerPlugin as BasePuppeteerPlugin } from '../../src/plugins/puppeteer.plugin.js';

process.env.S3DB_SKIP_PLUGIN_DEP_CHECK = '1';

class PuppeteerPluginStub extends BasePuppeteerPlugin {
  constructor(options = {}) {
    super({ ...options, slug: 'puppeteer' });
  }

  async _importDependencies() {
    this.puppeteer = {
      use: () => {},
      launch: async () => ({ close: async () => {} })
    };
  }

  async onStart() {
    this.initialized = true;
  }

  async onStop() {
    this.initialized = false;
  }
}

describe('SpiderSuitePlugin', () => {
  let db;
  let suite;

  beforeEach(async () => {
    db = createMemoryDatabaseForTest('spider-suite');
    await db.connect();

    suite = new SpiderSuitePlugin({
      namespace: 'crawler',
      queue: { autoStart: false },
      pluginFactories: {
        puppeteer: (options) => new PuppeteerPluginStub(options)
      }
    });

    await db.usePlugin(suite, 'crawler-suite');
  });

  afterEach(async () => {
    if (db?.connected) {
      await db.disconnect();
    }
  });

  it('installs namespaced dependencies and resources', () => {
    expect(db.resources['crawler_targets']).toBeDefined();
    expect(typeof db.resources['crawler_targets'].enqueue).toBe('function');

    expect(db.plugins['crawler-puppeteer']).toBeDefined();
    expect(db.plugins['crawler-queue']).toBeDefined();
    expect(suite.queuePlugin.slug).toBe('s3queue--crawler');
    expect(suite.puppeteerPlugin.slug).toBe('puppeteer--crawler');
  });

  it('exposes queue handler helpers', async () => {
    let receivedHelpers = null;
    suite.setProcessor(async (record, context, helpers) => {
      receivedHelpers = { record, context, helpers };
      return { ok: true };
    }, { autoStart: false });

    await suite.queueHandler({ id: 'job-1', url: 'https://example.com' }, {
      queueId: 'queue-1',
      attempts: 0,
      workerId: 'worker-1'
    });

    expect(receivedHelpers).not.toBeNull();
    expect(receivedHelpers.helpers.puppeteer).toBe(suite.puppeteerPlugin);
    expect(typeof receivedHelpers.helpers.enqueue).toBe('function');
  });

  it('installs ttl plugin when configured', async () => {
    const ttlDb = createMemoryDatabaseForTest('spider-suite-ttl');
    await ttlDb.connect();

    const ttlSuite = new SpiderSuitePlugin({
      namespace: 'spider-ttl',
      queue: { autoStart: false },
      ttl: { queue: { ttl: 600 } },
      pluginFactories: {
        puppeteer: (options) => new PuppeteerPluginStub(options)
      }
    });

    await ttlDb.usePlugin(ttlSuite, 'spider-ttl-suite');

    expect(ttlSuite.ttlPlugin).toBeDefined();
    expect(ttlDb.plugins['spider-ttl-ttl']).toBeDefined();

    if (ttlDb.connected) {
      await ttlDb.disconnect();
    }
  });
});
