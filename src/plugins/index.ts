export * from './plugin.class.js';
export * from './plugin.obj.js';
export { CoordinatorPlugin } from './concerns/coordinator-plugin.class.js';

export * from './audit.plugin.js';
export * from './cache.plugin.js';
export * from './costs.plugin.js';
export * from './fulltext.plugin.js';
export * from './metrics.plugin.js';
export * from './s3-queue.plugin.js';
export * from './scheduler.plugin.js';
export * from './state-machine.plugin.js';
export * from './ttl.plugin.js';
export * from './vector.plugin.js';
export * from './ml.plugin.js';
export * from './smtp.plugin.js';
export * from './tournament.plugin.js';
export * from './graph.plugin.js';
export * from './tree/index.js';

export * from './eventual-consistency/index.js';

export * from './tfstate/index.js';

type PluginClass = new (...args: unknown[]) => unknown;
type PluginLoader = () => Promise<PluginClass>;

const pluginMap: Record<string, PluginLoader> = {
  ApiPlugin: () => import('./api/index.js').then(m => m.ApiPlugin as PluginClass),
  IdentityPlugin: () => import('./identity/index.js').then(m => m.IdentityPlugin as PluginClass),

  CloudInventoryPlugin: () => import('./cloud-inventory.plugin.js').then(m => m.CloudInventoryPlugin as PluginClass),
  KubernetesInventoryPlugin: () => import('./kubernetes-inventory.plugin.js').then(m => m.KubernetesInventoryPlugin as PluginClass),

  PuppeteerPlugin: () => import('./puppeteer.plugin.js').then(m => m.PuppeteerPlugin as PluginClass),
  SpiderPlugin: () => import('./spider.plugin.js').then(m => m.SpiderPlugin as PluginClass),
  CookieFarmPlugin: () => import('./cookie-farm.plugin.js').then(m => m.CookieFarmPlugin as PluginClass),
  CookieFarmSuitePlugin: () => import('./cookie-farm-suite.plugin.js').then(m => m.CookieFarmSuitePlugin as PluginClass),
  ReconPlugin: () => import('./recon.plugin.js').then(m => m.ReconPlugin as PluginClass),

  MLPlugin: () => import('./ml.plugin.js').then(m => m.MLPlugin as PluginClass),

  GeoPlugin: () => import('./geo.plugin.js').then(m => m.GeoPlugin as PluginClass),

  BackupPlugin: () => import('./backup.plugin.js').then(m => m.BackupPlugin as PluginClass),

  SMTPPlugin: () => import('./smtp.plugin.js').then(m => m.SMTPPlugin as PluginClass),

  ReplicatorPlugin: () => import('./replicator.plugin.js').then(m => m.ReplicatorPlugin as PluginClass),

  QueueConsumerPlugin: () => import('./queue-consumer.plugin.js').then(m => m.QueueConsumerPlugin as PluginClass),

  WebSocketPlugin: () => import('./websocket/index.js').then(m => m.WebSocketPlugin as PluginClass),
};

export const lazyLoadPlugin = async (pluginName: string): Promise<PluginClass> => {
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

export const loadApiPlugin = (): Promise<PluginClass> => lazyLoadPlugin('ApiPlugin');
export const loadIdentityPlugin = (): Promise<PluginClass> => lazyLoadPlugin('IdentityPlugin');
export const loadBackupPlugin = (): Promise<PluginClass> => lazyLoadPlugin('BackupPlugin');
export const loadCookieFarmPlugin = (): Promise<PluginClass> => lazyLoadPlugin('CookieFarmPlugin');
export const loadCookieFarmSuitePlugin = (): Promise<PluginClass> => lazyLoadPlugin('CookieFarmSuitePlugin');
export const loadGeoPlugin = (): Promise<PluginClass> => lazyLoadPlugin('GeoPlugin');
export const loadMLPlugin = (): Promise<PluginClass> => lazyLoadPlugin('MLPlugin');
export const loadPuppeteerPlugin = (): Promise<PluginClass> => lazyLoadPlugin('PuppeteerPlugin');
export const loadSpiderPlugin = (): Promise<PluginClass> => lazyLoadPlugin('SpiderPlugin');
export const loadCloudInventoryPlugin = (): Promise<PluginClass> => lazyLoadPlugin('CloudInventoryPlugin');
export const loadReplicatorPlugin = (): Promise<PluginClass> => lazyLoadPlugin('ReplicatorPlugin');
export const loadReconPlugin = (): Promise<PluginClass> => lazyLoadPlugin('ReconPlugin');
export const loadKubernetesInventoryPlugin = (): Promise<PluginClass> => lazyLoadPlugin('KubernetesInventoryPlugin');
export const loadSMTPPlugin = (): Promise<PluginClass> => lazyLoadPlugin('SMTPPlugin');
export const loadQueueConsumerPlugin = (): Promise<PluginClass> => lazyLoadPlugin('QueueConsumerPlugin');
export const loadWebSocketPlugin = (): Promise<PluginClass> => lazyLoadPlugin('WebSocketPlugin');

export { ApiPlugin } from './api/index.js';
export { IdentityPlugin } from './identity/index.js';
export { BackupPlugin } from './backup.plugin.js';
export { KubernetesInventoryPlugin } from './kubernetes-inventory.plugin.js';
export { PuppeteerPlugin } from './puppeteer.plugin.js';
export { SpiderPlugin } from './spider.plugin.js';
export { CrawlContext } from './spider/crawl-context.js';
export { HybridFetcher } from './spider/hybrid-fetcher.js';
export { CookieFarmPlugin } from './cookie-farm.plugin.js';
export { CookieFarmSuitePlugin } from './cookie-farm-suite.plugin.js';
export { ReconPlugin } from './recon.plugin.js';
export { GeoPlugin } from './geo.plugin.js';
export { ReplicatorPlugin } from './replicator.plugin.js';
export { QueueConsumerPlugin } from './queue-consumer.plugin.js';
export { WebSocketPlugin, WebSocketServer } from './websocket/index.js';

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
