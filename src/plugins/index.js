/**
 * Plugin exports for s3db.js
 *
 * IMPORTANT: To avoid "module not found" errors for optional peer dependencies,
 * plugins with external dependencies use lazy loading.
 *
 * Core plugins (no external deps) are exported directly.
 * Plugins with peer dependencies should be imported individually:
 *
 * @example
 * // ✅ Direct import (avoids loading all plugins)
 * import { ApiPlugin } from 's3db.js/src/plugins/api/index.js';
 * import { PuppeteerPlugin } from 's3db.js/src/plugins/puppeteer.plugin.js';
 *
 * // ✅ Lazy load helper
 * import { lazyLoadPlugin } from 's3db.js/plugins';
 * const PuppeteerPlugin = await lazyLoadPlugin('PuppeteerPlugin');
 */

// Base plugin classes (always available, no peer dependencies)
export * from './plugin.class.js'
export * from './plugin.obj.js'

// Core plugins (no external peer dependencies required)
export * from './audit.plugin.js'
export * from './cache.plugin.js'
export * from './costs.plugin.js'
export * from './fulltext.plugin.js'
export * from './metrics.plugin.js'
export * from './relation.plugin.js'
export * from './s3-queue.plugin.js'
export * from './scheduler.plugin.js'
export * from './state-machine.plugin.js'
export * from './ttl.plugin.js'
export * from './vector.plugin.js'
export * from './ml.plugin.js'

// NOTE: QueueConsumerPlugin removed from direct exports because it requires
// peer dependencies (amqplib, @aws-sdk/client-sqs) via consumers/index.js.
// Use lazyLoadPlugin('QueueConsumerPlugin') or loadQueueConsumerPlugin() instead.

// Re-export eventual consistency (no peer dependencies)
export * from './eventual-consistency/index.js'

// Re-export tfstate (no external peer deps)
export * from './tfstate/index.js'

/**
 * Lazy plugin loader for plugins with peer dependencies.
 * Use this to avoid loading dependencies at initialization time.
 *
 * @param {string} pluginName - Name of the plugin class to load
 * @returns {Promise<Class>} - The plugin class
 *
 * @example
 * const ApiPlugin = await lazyLoadPlugin('ApiPlugin');
 * const plugin = new ApiPlugin({ port: 3000 });
 */
export const lazyLoadPlugin = async (pluginName) => {
  const pluginMap = {
    // API & Identity (hono, jose, bcrypt)
    ApiPlugin: () => import('./api/index.js').then(m => m.ApiPlugin),
    IdentityPlugin: () => import('./identity/index.js').then(m => m.IdentityPlugin),

    // Cloud plugins (@aws-sdk/*, @google-cloud/*, @kubernetes/client-node)
    CloudInventoryPlugin: () => import('./cloud-inventory.plugin.js').then(m => m.CloudInventoryPlugin),
    KubernetesInventoryPlugin: () => import('./kubernetes-inventory.plugin.js').then(m => m.KubernetesInventoryPlugin),

    // Browser automation (puppeteer, puppeteer-extra)
    PuppeteerPlugin: () => import('./puppeteer.plugin.js').then(m => m.PuppeteerPlugin),
    CookieFarmPlugin: () => import('./cookie-farm.plugin.js').then(m => m.CookieFarmPlugin),
    CookieFarmSuitePlugin: () => import('./cookie-farm-suite.plugin.js').then(m => m.CookieFarmSuitePlugin),
    ReconPlugin: () => import('./recon.plugin.js').then(m => m.ReconPlugin),

    // ML (@tensorflow/tfjs-node)
    MLPlugin: () => import('./ml.plugin.js').then(m => m.MLPlugin),

    // Geo (@maxmind/geoip2-node)
    GeoPlugin: () => import('./geo.plugin.js').then(m => m.GeoPlugin),

    // Backup (no external deps, but lazy to keep core small)
    BackupPlugin: () => import('./backup.plugin.js').then(m => m.BackupPlugin),

    // Replicator (pg, @google-cloud/bigquery, @libsql/client, etc.)
    ReplicatorPlugin: () => import('./replicator.plugin.js').then(m => m.ReplicatorPlugin),

    // Queue consumer (amqplib, @aws-sdk/client-sqs)
    QueueConsumerPlugin: () => import('./queue-consumer.plugin.js').then(m => m.QueueConsumerPlugin),
  };

  const loader = pluginMap[pluginName];
  if (!loader) {
    throw new Error(
      `Unknown plugin: ${pluginName}.\n` +
      `Available plugins: ${Object.keys(pluginMap).join(', ')}\n\n` +
      `Usage:\n` +
      `  const ${pluginName} = await lazyLoadPlugin('${pluginName}');\n` +
      `  const plugin = new ${pluginName}({ /* options */ });`
    );
  }

  return await loader();
};

/**
 * Individual lazy loaders for better DX
 */
export const loadApiPlugin = () => lazyLoadPlugin('ApiPlugin');
export const loadIdentityPlugin = () => lazyLoadPlugin('IdentityPlugin');
export const loadBackupPlugin = () => lazyLoadPlugin('BackupPlugin');
export const loadCookieFarmPlugin = () => lazyLoadPlugin('CookieFarmPlugin');
export const loadCookieFarmSuitePlugin = () => lazyLoadPlugin('CookieFarmSuitePlugin');
export const loadGeoPlugin = () => lazyLoadPlugin('GeoPlugin');
export const loadMLPlugin = () => lazyLoadPlugin('MLPlugin');
export const loadPuppeteerPlugin = () => lazyLoadPlugin('PuppeteerPlugin');
export const loadCloudInventoryPlugin = () => lazyLoadPlugin('CloudInventoryPlugin');
export const loadReplicatorPlugin = () => lazyLoadPlugin('ReplicatorPlugin');
export const loadReconPlugin = () => lazyLoadPlugin('ReconPlugin');
export const loadKubernetesInventoryPlugin = () => lazyLoadPlugin('KubernetesInventoryPlugin');
export const loadQueueConsumerPlugin = () => lazyLoadPlugin('QueueConsumerPlugin');

/**
 * Plugin drivers & utilities
 * Note: These may still contain static imports. Import specific drivers directly:
 *
 * @example
 * import { BigqueryReplicator } from 's3db.js/src/plugins/replicators/bigquery-replicator.class.js';
 * import { SqsReplicator } from 's3db.js/src/plugins/replicators/sqs-replicator.class.js';
 */
// Commented out to prevent eager loading of peer dependencies
// export * from './backup/index.js'
// export * from './cache/index.js'
// export * from './replicators/index.js'
// export * from './consumers/index.js'
// export * from './cloud-inventory/index.js'
// export * from './kubernetes-inventory/index.js'
// export * from './importer/index.js'
