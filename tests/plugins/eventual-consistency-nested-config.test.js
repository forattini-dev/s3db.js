/**
 * EventualConsistencyPlugin - Nested Config Test
 *
 * Testa a nova estrutura aninhada de configuração
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistencyPlugin - Nested Config', () => {
  let database;
  let urls;

  beforeEach(async () => {
    database = createDatabaseForTest('nested-config-test');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should work with new nested config format', async () => {
    // Nova estrutura aninhada
    const plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: { urls: ['clicks'] },

      consolidation: {
        mode: 'sync',
        auto: false,
        interval: 300,
        window: 24,
        concurrency: 5
      },

      analytics: {
        enabled: true,
        periods: ['hour', 'day'],
        metrics: ['count', 'sum'],
        retentionDays: 30
      },

      locks: {
        timeout: 300
      },

      garbageCollection: {
        enabled: true,
        interval: 3600,
        retention: 7
      },

      batch: {
        enabled: false,
        size: 100
      },

      lateArrivals: {
        strategy: 'warn'
      },

      checkpoints: {
        enabled: true,
        strategy: 'hourly',
        retention: 90,
        threshold: 1000,
        deleteConsolidated: true,
        auto: true
      },

      cohort: {
        timezone: 'America/Sao_Paulo'
      },

      logLevel: 'silent'
    });

    await database.usePlugin(plugin);

    // Verificar que config foi criada corretamente
    expect(plugin.config.mode).toBe('sync');
    expect(plugin.config.autoConsolidate).toBe(false);
    expect(plugin.config.consolidationInterval).toBe(300);
    expect(plugin.config.enableAnalytics).toBe(true);
    expect(plugin.config.analyticsConfig.periods).toEqual(['hour', 'day']);
    expect(plugin.config.lockTimeout).toBe(300);
    expect(plugin.config.transactionRetention).toBe(7);
    expect(plugin.config.batchTransactions).toBe(false);
    expect(plugin.config.lateArrivalStrategy).toBe('warn');
    expect(plugin.config.enableCheckpoints).toBe(true);
    expect(plugin.config.cohort.timezone).toBe('America/Sao_Paulo');
    expect(plugin.config.verbose).toBe(false);

    // Create resource
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|required',
        clicks: 'number|default:0'
      }
    });

    // Test basic functionality
    await urls.insert({ id: 'url-1', link: 'https://google.com', clicks: 0 });
    await urls.add('url-1', 'clicks', 5);

    const url = await urls.get('url-1');
    expect(url.clicks).toBe(5);
  });

  it('should use defaults when sections are omitted', async () => {
    // Minimal configuration
    const plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: { urls: ['clicks'] }
    });

    await database.usePlugin(plugin);

    // Verify defaults
    expect(plugin.config.mode).toBe('async'); // default
    expect(plugin.config.autoConsolidate).toBe(true); // default
    expect(plugin.config.consolidationInterval).toBe(300); // default
    expect(plugin.config.enableAnalytics).toBe(false); // default
    expect(plugin.config.lockTimeout).toBe(300); // default
    expect(plugin.config.transactionRetention).toBe(30); // default
    expect(plugin.config.enableCheckpoints).toBe(true); // default
  });

  it('should allow partial nested config', async () => {
    // Only a few sections
    const plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: { urls: ['clicks'] },

      consolidation: {
        mode: 'sync',
        auto: false
        // interval, window, concurrency rely on defaults
      },

      analytics: {
        enabled: true
        // periods, metrics, retention rely on defaults
      }
    });

    await database.usePlugin(plugin);

    // Validate the mix of custom values and defaults
    expect(plugin.config.mode).toBe('sync');
    expect(plugin.config.autoConsolidate).toBe(false);
    expect(plugin.config.consolidationInterval).toBe(300); // default
    expect(plugin.config.enableAnalytics).toBe(true);
    expect(plugin.config.analyticsConfig.periods).toEqual(['hour', 'day', 'month']); // default
  });
});
