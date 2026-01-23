export * from './plugin.class.js';
export * from './plugin.obj.js';
export { CoordinatorPlugin } from './concerns/coordinator-plugin.class.js';

export { AuditPlugin } from './audit.plugin.js';
export type { AuditPluginOptions, AuditRecord, AuditStats, AuditQueryOptions } from './audit.plugin.js';

export { CachePlugin, resolveCacheMemoryLimit } from './cache.plugin.js';
export type { CachePluginOptions, MemoryLimitResult } from './cache.plugin.js';

export { CostsPlugin } from './costs.plugin.js';
export type { CostsPluginOptions, CostsData } from './costs.plugin.js';

export { FullTextPlugin } from './fulltext.plugin.js';
export type { FullTextPluginOptions, SearchOptions, SearchResult, IndexStats, RebuildOptions } from './fulltext.plugin.js';

export { MetricsPlugin } from './metrics.plugin.js';
export type { MetricsPluginOptions, MetricsStats, MetricsQueryOptions, PrometheusConfig } from './metrics.plugin.js';

export { CloudInventoryPlugin } from './cloud-inventory.plugin.js';
export type { CloudInventoryPluginOptions } from './cloud-inventory.plugin.js';

export { S3QueuePlugin } from './s3-queue.plugin.js';
export type { S3QueuePluginOptions } from './s3-queue.plugin.js';

export { SchedulerPlugin } from './scheduler.plugin.js';
export type { SchedulerPluginOptions } from './scheduler.plugin.js';

export { StateMachinePlugin } from './state-machine.plugin.js';
export type { StateMachinePluginOptions, TransitionResult, TransitionHistoryEntry, TransitionHistoryOptions } from './state-machine.plugin.js';

export { TTLPlugin } from './ttl.plugin.js';
export type { TTLPluginOptions, TTLResourceConfig, TTLStats, TTLGranularity, TTLExpireStrategy } from './ttl.plugin.js';

export { VectorPlugin } from './vector.plugin.js';
export type {
  VectorPluginOptions,
  VectorPluginConfig,
  VectorSearchOptions,
  VectorSearchStats,
  VectorSearchResult,
  VectorSearchPagedResult,
  ClusterOptions,
  ClusterResult,
  VectorFieldInfo,
  DistanceMetric,
  DistanceFunction,
  FindOptimalKOptions
} from './vector.plugin.js';

export { MLPlugin } from './ml.plugin.js';
export type { MLPluginOptions, ModelConfig, ModelStats, ModelInstance } from './ml.plugin.js';
export { MLError, ModelConfigError, ModelNotFoundError, TrainingError, TensorFlowDependencyError } from './ml.errors.js';

export { SMTPPlugin } from './smtp.plugin.js';
export type {
  SMTPPluginOptions,
  SendResult,
  EmailRecord,
  EmailStatus,
  SendEmailOptions,
  EmailAttachment,
  SMTPMode,
  SMTPDriver
} from './smtp.plugin.js';

export { TournamentPlugin } from './tournament.plugin.js';
export type { TournamentPluginOptions } from './tournament.plugin.js';

export { GraphPlugin } from './graph.plugin.js';
export type {
  GraphPluginOptions,
  EdgeRecord,
  PathResult,
  TraverseNode,
  NeighborResult,
  DegreeResult
} from './graph.plugin.js';

export * from './tree/index.js';

export * from './eventual-consistency/index.js';

export * from './tfstate/index.js';
export * from './importer/index.js';

export type {
  CorsConfig,
  SecurityConfig,
  CSPDirectives,
  ContentSecurityPolicyConfig,
  FrameguardConfig,
  HstsConfig,
  ReferrerPolicyConfig,
  DnsPrefetchControlConfig,
  PermittedCrossDomainPoliciesConfig,
  XssFilterConfig,
  PermissionsPolicyConfig,
  LoggingConfig,
  LoggingContext,
  ServerInfo,
  BaseRateLimitConfig,
} from './shared/types.js';

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

export type { ApiPluginOptions } from './api/index.js';

export type {
  IdentityPluginOptions,
  OnboardingStatus,
  RegisterOAuthClientResult,
  AuthenticateWithPasswordResult
} from './identity/index.js';

export { BackupPlugin } from './backup.plugin.js';
export { KubernetesInventoryPlugin } from './kubernetes-inventory.plugin.js';
export { PuppeteerPlugin } from './puppeteer.plugin.js';
export { SpiderPlugin } from './spider.plugin.js';
export { CrawlContext } from './spider/crawl-context.js';
export { HybridFetcher } from './spider/hybrid-fetcher.js';
export { RobotsParser } from './spider/robots-parser.js';
export { SitemapParser } from './spider/sitemap-parser.js';
export { LinkDiscoverer } from './spider/link-discoverer.js';
export { DeepDiscovery } from './spider/deep-discovery.js';
export { CookieFarmPlugin } from './cookie-farm.plugin.js';
export { CookieFarmSuitePlugin } from './cookie-farm-suite.plugin.js';
export { ReconPlugin } from './recon.plugin.js';
export { GeoPlugin } from './geo.plugin.js';
export { ReplicatorPlugin } from './replicator.plugin.js';
export { QueueConsumerPlugin } from './queue-consumer.plugin.js';
export { WebSocketPlugin, WebSocketServer } from './websocket/index.js';

export type {
  CookieOptions,
  ChunkingOptions,
  CookieChunkOverflowDetails
} from './api/index.js';

export {
  HttpBadRequestError,
  HttpValidationError,
  HttpUnauthorizedError,
  HttpForbiddenError,
  HttpNotFoundError,
  HttpMethodNotAllowedError,
  HttpConflictError,
  HttpUnprocessableEntityError,
  HttpTooManyRequestsError,
  HttpInternalServerError,
  HttpNotImplementedError,
  HttpServiceUnavailableError,
  HTTP_ERRORS,
  createHttpError
} from './api/errors.js';

export {
  NotificationStateMachine,
  AttemptStateMachine,
  createNotificationStateMachine,
  createAttemptStateMachine
} from './api/concerns/state-machine.js';

export const loadApiHelpers = async () => {
  const apiModule = await import('./api/index.js');
  return {
    ApiPlugin: apiModule.ApiPlugin,
    OIDCClient: apiModule.OIDCClient,
    setupTemplateEngine: apiModule.setupTemplateEngine,
    ejsEngine: apiModule.ejsEngine,
    pugEngine: apiModule.pugEngine,
    jsxEngine: apiModule.jsxEngine,
    OpenGraphHelper: apiModule.OpenGraphHelper,
    RouteContext: apiModule.RouteContext,
    withContext: apiModule.withContext,
    errorResponse: apiModule.errorResponse,
    successResponse: apiModule.successResponse,
    createContextInjectionMiddleware: apiModule.createContextInjectionMiddleware,
    getChunkedCookie: apiModule.getChunkedCookie,
    setChunkedCookie: apiModule.setChunkedCookie,
    deleteChunkedCookie: apiModule.deleteChunkedCookie,
    isChunkedCookie: apiModule.isChunkedCookie,
    initCookieChunking: apiModule.initCookieChunking
  };
};

