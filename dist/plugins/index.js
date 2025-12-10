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
const pluginMap = {
    ApiPlugin: () => import('./api/index.js').then(m => m.ApiPlugin),
    IdentityPlugin: () => import('./identity/index.js').then(m => m.IdentityPlugin),
    CloudInventoryPlugin: () => import('./cloud-inventory.plugin.js').then(m => m.CloudInventoryPlugin),
    KubernetesInventoryPlugin: () => import('./kubernetes-inventory.plugin.js').then(m => m.KubernetesInventoryPlugin),
    PuppeteerPlugin: () => import('./puppeteer.plugin.js').then(m => m.PuppeteerPlugin),
    SpiderPlugin: () => import('./spider.plugin.js').then(m => m.SpiderPlugin),
    CookieFarmPlugin: () => import('./cookie-farm.plugin.js').then(m => m.CookieFarmPlugin),
    CookieFarmSuitePlugin: () => import('./cookie-farm-suite.plugin.js').then(m => m.CookieFarmSuitePlugin),
    ReconPlugin: () => import('./recon.plugin.js').then(m => m.ReconPlugin),
    MLPlugin: () => import('./ml.plugin.js').then(m => m.MLPlugin),
    GeoPlugin: () => import('./geo.plugin.js').then(m => m.GeoPlugin),
    BackupPlugin: () => import('./backup.plugin.js').then(m => m.BackupPlugin),
    SMTPPlugin: () => import('./smtp.plugin.js').then(m => m.SMTPPlugin),
    ReplicatorPlugin: () => import('./replicator.plugin.js').then(m => m.ReplicatorPlugin),
    QueueConsumerPlugin: () => import('./queue-consumer.plugin.js').then(m => m.QueueConsumerPlugin),
    WebSocketPlugin: () => import('./websocket/index.js').then(m => m.WebSocketPlugin),
};
export const lazyLoadPlugin = async (pluginName) => {
    const loader = pluginMap[pluginName];
    if (!loader) {
        throw new Error(`Unknown plugin: ${pluginName}.\n` +
            `Available plugins: ${Object.keys(pluginMap).join(', ')}\n\n` +
            `Usage:\n` +
            `  const ${pluginName} = await lazyLoadPlugin('${pluginName}');\n` +
            `  const plugin = new ${pluginName}({ /* options */ });`);
    }
    return await loader();
};
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
export const loadWebSocketPlugin = () => lazyLoadPlugin('WebSocketPlugin');
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
export { OIDCClient, setupTemplateEngine, ejsEngine, pugEngine, jsxEngine, OpenGraphHelper, RouteContext, withContext, errorResponse, successResponse, createContextInjectionMiddleware } from './api/index.js';
//# sourceMappingURL=index.js.map