import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { createMemoryDatabaseForTest } from '../config.js';
import { CookieFarmSuitePlugin } from '../../src/plugins/cookie-farm-suite.plugin.js';
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

describe('CookieFarmSuitePlugin', () => {
  let db;
  let suite;

  beforeEach(async () => {
    db = createMemoryDatabaseForTest('cookie-farm-suite');
    await db.connect();

    suite = new CookieFarmSuitePlugin({
      namespace: 'persona',
      queue: { autoStart: false },
      cookieFarm: {
        generation: { count: 0 },
        warmup: { enabled: false }
      },
      pluginFactories: {
        puppeteer: (options) => new PuppeteerPluginStub(options)
      }
    });

    await db.usePlugin(suite, 'persona-suite');
  });

  afterEach(async () => {
    if (db?.connected) {
      await db.disconnect();
    }
  });

  it('installs cookie-farm, puppeteer and queue with namespace', () => {
    expect(db.resources['persona_persona_jobs']).toBeDefined();
    expect(db.plugins['persona-puppeteer']).toBeDefined();
    expect(db.plugins['persona-cookie-farm']).toBeDefined();
    expect(db.plugins['persona-queue']).toBeDefined();
    expect(suite.cookieFarmPlugin.slug).toBe('cookie-farm--persona');
  });

  it('passes helpers to processor callbacks', async () => {
    let captured = null;
    suite.setProcessor(async (record, context, helpers) => {
      captured = { record, context, helpers };
      return { scheduled: true };
    }, { autoStart: false });

    await suite.queueHandler({ id: 'job-1', jobType: 'generate' }, {
      queueId: 'queue-1',
      attempts: 0,
      workerId: 'worker-1'
    });

    expect(captured.helpers.cookieFarm).toBe(suite.cookieFarmPlugin);
    expect(typeof captured.helpers.enqueue).toBe('function');
  });

  it('installs ttl plugin when requested', async () => {
    const ttlDb = createMemoryDatabaseForTest('cookie-farm-suite-ttl');
    await ttlDb.connect();

    const ttlSuite = new CookieFarmSuitePlugin({
      namespace: 'persona-ttl',
      queue: { autoStart: false },
      ttl: { queue: { ttl: 900 } },
      cookieFarm: {
        generation: { count: 0 },
        warmup: { enabled: false }
      },
      pluginFactories: {
        puppeteer: (options) => new PuppeteerPluginStub(options)
      }
    });

    await ttlDb.usePlugin(ttlSuite, 'persona-ttl-suite');

    expect(ttlSuite.ttlPlugin).toBeDefined();
    expect(ttlDb.plugins['persona-ttl-ttl']).toBeDefined();

    if (ttlDb.connected) {
      await ttlDb.disconnect();
    }
  });
});
