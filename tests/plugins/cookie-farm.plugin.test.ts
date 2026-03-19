import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createMemoryDatabaseForTest } from '../config.js';
import { CookieFarmPlugin } from '../../src/plugins/cookie-farm.plugin.js';
import { PuppeteerPlugin as BasePuppeteerPlugin } from '../../src/plugins/puppeteer.plugin.js';

process.env.S3DB_SKIP_PLUGIN_DEP_CHECK = '1';

class PuppeteerPluginStub extends BasePuppeteerPlugin {
  constructor(options = {}) {
    super({
      logLevel: 'silent',
      cookies: { enabled: false },
      proxy: { enabled: false },
      networkMonitor: { enabled: false, persist: false },
      consoleMonitor: { enabled: false, persist: false },
      pool: { enabled: false },
      ...options,
      slug: 'puppeteer'
    });
  }

  async _importDependencies() {}

  async onStart() {
    this.initialized = true;
  }

  async onStop() {
    this.initialized = false;
  }
}

describe('CookieFarmPlugin', () => {
  let db;
  let cookieFarm;

  beforeEach(async () => {
    db = createMemoryDatabaseForTest(`cookie-farm-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await db.connect();

    await db.usePlugin(new PuppeteerPluginStub());

    cookieFarm = new CookieFarmPlugin({
      logLevel: 'silent',
      generation: { count: 0 },
      warmup: { enabled: false },
      storage: { resource: 'test_cookie_farm_personas' }
    });

    await db.usePlugin(cookieFarm);
  });

  afterEach(async () => {
    if (db?.connected) {
      await db.disconnect();
    }
  });

  it('returns semantic persona datetimes as ISO strings while keeping runtime epochs internal', async () => {
    const personas = await cookieFarm.generatePersonas(1);
    const persona = personas[0];

    expect(persona).toBeDefined();
    expect(typeof persona.quality.lastCalculated).toBe('string');
    expect(typeof persona.metadata.createdAt).toBe('string');
    expect(typeof persona.metadata.expiresAt).toBe('string');
    expect(persona.metadata.lastUsed).toBeNull();

    const rawPersona = cookieFarm.personaPool.get(persona.personaId);
    expect(typeof rawPersona.quality.lastCalculated).toBe('number');
    expect(typeof rawPersona.metadata.createdAt).toBe('number');
    expect(typeof rawPersona.metadata.expiresAt).toBe('number');

    const selected = await cookieFarm.getPersona({ excludeRetired: true });
    expect(typeof selected.quality.lastCalculated).toBe('string');
    expect(typeof selected.metadata.createdAt).toBe('string');

    const exported = await cookieFarm.exportPersonas();
    expect(typeof exported[0].quality.lastCalculated).toBe('string');
    expect(typeof exported[0].metadata.createdAt).toBe('string');
    expect(typeof exported[0].metadata.expiresAt).toBe('string');

    const resource = await db.getResource('test_cookie_farm_personas');
    expect(resource.attributes.quality.lastCalculated).toBe('datetime');
    expect(resource.attributes.metadata.createdAt).toBe('datetime');
    expect(resource.attributes.metadata.lastUsed).toBe('datetime|optional');
    expect(resource.attributes.metadata.expiresAt).toBe('datetime');

    const stored = await resource.list({ limit: 10 });
    expect(typeof stored[0].quality.lastCalculated).toBe('string');
    expect(typeof stored[0].metadata.createdAt).toBe('string');
    expect(typeof stored[0].metadata.expiresAt).toBe('string');
  });

  it('returns typed aggregate stats for persona pools', async () => {
    await cookieFarm.generatePersonas(2);

    const stats = await cookieFarm.getStats();

    expect(stats.total).toBe(2);
    expect(stats.active).toBe(2);
    expect(stats.retired).toBe(0);
    expect(stats.byQuality).toEqual({
      high: expect.any(Number),
      medium: expect.any(Number),
      low: expect.any(Number)
    });
    expect(typeof stats.byProxy).toBe('object');
    expect(typeof stats.averageQualityScore).toBe('number');
    expect(typeof stats.averageSuccessRate).toBe('number');
    expect(typeof stats.totalRequests).toBe('number');
  });
});
