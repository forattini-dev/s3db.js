/**
 * Plugin exports for s3db.js
 *
 * IMPORTANT: Plugins with peer dependencies (hono, puppeteer, etc.) are now
 * exported directly from the main package, but require peer dependencies to be
 * installed before importing.
 *
 * ## Three Ways to Import Plugins:
 *
 * ### 1. Direct import (recommended if peer dependencies are installed)
 * @example
 * import { ApiPlugin, PuppeteerPlugin } from 's3db.js';
 * const api = new ApiPlugin({ port: 3000 });
 *
 * ### 2. Lazy loading (recommended if peer dependencies might not be installed)
 * @example
 * import { lazyLoadPlugin } from 's3db.js';
 * const ApiPlugin = await lazyLoadPlugin('ApiPlugin');
 * const api = new ApiPlugin({ port: 3000 });
 *
 * ### 3. Direct file import (advanced use cases)
 * @example
 * import { ApiPlugin } from 's3db.js/src/plugins/api/index.js';
 * import { PuppeteerPlugin } from 's3db.js/src/plugins/puppeteer.plugin.js';
 *
 * ## Core Plugins (no peer dependencies)
 * These are always safe to import directly:
 * - AuditPlugin, CachePlugin, CostsPlugin, FulltextPlugin
 * - MetricsPlugin, RelationPlugin, S3QueuePlugin, SchedulerPlugin
 * - StateMachinePlugin, TTLPlugin, VectorPlugin, MLPlugin
 *
 * ## Plugins with Peer Dependencies
 * Install peer dependencies before importing:
 * - ApiPlugin: hono, @hono/node-server, jose, bcrypt
 * - IdentityPlugin: hono, jose, bcrypt, nodemailer
 * - PuppeteerPlugin: puppeteer, puppeteer-extra, user-agents
 * - SpiderPlugin: puppeteer, puppeteer-extra, user-agents (bundles Puppeteer + S3Queue + TTL)
 * - ReplicatorPlugin: pg, @google-cloud/bigquery, @libsql/client, etc.
 * - CloudInventoryPlugin: @aws-sdk/*, @google-cloud/*, @azure/*
 * - QueueConsumerPlugin: amqplib, @aws-sdk/client-sqs
 */

// Base plugin classes (always available, no peer dependencies)
export * from './plugin.class.js'
export * from './plugin.obj.js'
export { CoordinatorPlugin } from './concerns/coordinator-plugin.class.js'

// Core plugins (no external peer dependencies required)
export * from './audit.plugin.js'
export * from './cache.plugin.js'
export * from './costs.plugin.js'
export * from './fulltext.plugin.js'
export * from './metrics.plugin.js'
export * from './s3-queue.plugin.js'
export * from './scheduler.plugin.js'
export * from './state-machine.plugin.js'
export * from './ttl.plugin.js'
export * from './vector.plugin.js'
export * from './ml.plugin.js'
export * from './smtp.plugin.js'

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
    SpiderPlugin: () => import('./spider.plugin.js').then(m => m.SpiderPlugin),
    CookieFarmPlugin: () => import('./cookie-farm.plugin.js').then(m => m.CookieFarmPlugin),
    CookieFarmSuitePlugin: () => import('./cookie-farm-suite.plugin.js').then(m => m.CookieFarmSuitePlugin),
    ReconPlugin: () => import('./recon.plugin.js').then(m => m.ReconPlugin),

    // ML (@tensorflow/tfjs-node)
    MLPlugin: () => import('./ml.plugin.js').then(m => m.MLPlugin),

    // Geo (@maxmind/geoip2-node)
    GeoPlugin: () => import('./geo.plugin.js').then(m => m.GeoPlugin),

    // Backup (no external deps, but lazy to keep core small)
    BackupPlugin: () => import('./backup.plugin.js').then(m => m.BackupPlugin),

    // SMTP (nodemailer, mailparser, smtp-server - optional)
    SMTPPlugin: () => import('./smtp.plugin.js').then(m => m.SMTPPlugin),

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
export const loadSpiderPlugin = () => lazyLoadPlugin('SpiderPlugin');
export const loadCloudInventoryPlugin = () => lazyLoadPlugin('CloudInventoryPlugin');
export const loadReplicatorPlugin = () => lazyLoadPlugin('ReplicatorPlugin');
export const loadReconPlugin = () => lazyLoadPlugin('ReconPlugin');
export const loadKubernetesInventoryPlugin = () => lazyLoadPlugin('KubernetesInventoryPlugin');
export const loadSMTPPlugin = () => lazyLoadPlugin('SMTPPlugin');
export const loadQueueConsumerPlugin = () => lazyLoadPlugin('QueueConsumerPlugin');

/**
 * Direct re-exports from plugin modules (lazy loaded)
 *
 * These allow importing plugins directly from the main package without needing
 * to install peer dependencies until the plugin is actually used at runtime.
 *
 * @example Basic usage
 * import { ApiPlugin } from 's3db.js';
 * const plugin = new ApiPlugin({ port: 3000 });
 *
 * @example With utilities (ApiPlugin exports additional helpers)
 * import {
 *   ApiPlugin,
 *   OIDCClient,           // from './api/index.js'
 *   withContext,          // from './api/index.js'
 *   OpenGraphHelper,      // from './api/index.js'
 *   errorResponse,        // from './api/index.js'
 *   successResponse       // from './api/index.js'
 * } from 's3db.js';
 *
 * Note: Since these use static imports, peer dependencies (hono, jose, etc.)
 * must be installed before importing. For fully lazy loading without dependencies,
 * use the lazyLoadPlugin() helper instead.
 */
export { ApiPlugin } from './api/index.js';
export { IdentityPlugin } from './identity/index.js';
export { BackupPlugin } from './backup.plugin.js';
// REMOVED: CloudInventoryPlugin static export to prevent Rollup from bundling cloud drivers
// The plugin imports createCloudDriver from registry.js which has dynamic imports
// Users should use loadCloudInventoryPlugin() instead
// export { CloudInventoryPlugin } from './cloud-inventory.plugin.js';
export { KubernetesInventoryPlugin } from './kubernetes-inventory.plugin.js';
export { PuppeteerPlugin } from './puppeteer.plugin.js';
export { SpiderPlugin } from './spider.plugin.js';
export { CookieFarmPlugin } from './cookie-farm.plugin.js';
export { CookieFarmSuitePlugin } from './cookie-farm-suite.plugin.js';
export { ReconPlugin } from './recon.plugin.js';
export { GeoPlugin } from './geo.plugin.js';
export { ReplicatorPlugin } from './replicator.plugin.js';
export { QueueConsumerPlugin } from './queue-consumer.plugin.js';

/**
 * API Plugin utilities (re-exported from './api/index.js')
 * These are also available when you import ApiPlugin.
 */
export {
  OIDCClient,
  setupTemplateEngine,
  ejsEngine,
  pugEngine,
  jsxEngine,
  OpenGraphHelper,
  RouteContext,
  withContext,
  errorResponse,
  successResponse,
  createContextInjectionMiddleware
} from './api/index.js';

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
