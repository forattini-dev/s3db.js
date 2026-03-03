import { Plugin } from './plugin.class.js';

interface Database {
  client: S3Client;
  plugins?: Record<string, PluginWithEstimate>;
}

interface PluginWithEstimate {
  estimateUsage?: (options?: Record<string, unknown>) => unknown;
}

interface S3Client {
  costs?: CostsData;
  on(event: string, handler: EventHandler): void;
  off?(event: string, handler: EventHandler): void;
  removeListener?(event: string, handler: EventHandler): void;
}

type EventHandler = (name: string, response: S3Response, input: S3Input) => void;

interface S3Response {
  httpResponse?: {
    headers?: Record<string, string | number>;
  };
  ContentLength?: number;
}

interface S3Input {
  Key?: string;
  key?: string;
  Body?: string | Buffer | { length?: number };
  body?: string | Buffer | { length?: number };
}

export interface CostsPluginOptions {
  considerFreeTier?: boolean;
  region?: string;
  logLevel?: string;
  historyRetentionMs?: number;
  estimateDefaultWindowMs?: number;
  maxHistoryPoints?: number;
}

interface CostsConfig {
  considerFreeTier: boolean;
  region: string;
  logLevel?: string;
  historyRetentionMs: number;
  estimateDefaultWindowMs: number;
  maxHistoryPoints: number;
}

interface RequestPrices {
  put: number;
  copy: number;
  list: number;
  post: number;
  get: number;
  select: number;
  delete: number;
  head: number;
}

interface RequestCounts {
  put: number;
  post: number;
  copy: number;
  list: number;
  get: number;
  select: number;
  delete: number;
  head: number;
}

interface RequestEvents {
  PutObjectCommand: number;
  GetObjectCommand: number;
  CopyObjectCommand: number;
  HeadObjectCommand: number;
  DeleteObjectCommand: number;
  DeleteObjectsCommand: number;
  ListObjectsV2Command: number;
}

interface RequestsData {
  prices: RequestPrices;
  total: number;
  counts: RequestCounts;
  totalEvents: number;
  events: RequestEvents;
  subtotal: number;
}

interface StorageTier {
  limit: number;
  pricePerGB: number;
}

interface StorageData {
  totalBytes: number;
  totalGB: number;
  tiers: StorageTier[];
  currentTier: number;
  subtotal: number;
}

interface DataTransferTier {
  limit: number;
  pricePerGB: number;
}

interface DataTransferData {
  inBytes: number;
  inGB: number;
  inCost: number;
  outBytes: number;
  outGB: number;
  tiers: DataTransferTier[];
  freeTierGB: number;
  freeTierUsed: number;
  currentTier: number;
  subtotal: number;
}

type CommandName =
  | 'PutObjectCommand'
  | 'GetObjectCommand'
  | 'CopyObjectCommand'
  | 'HeadObjectCommand'
  | 'DeleteObjectCommand'
  | 'DeleteObjectsCommand'
  | 'ListObjectsV2Command';

type MethodName = 'put' | 'get' | 'copy' | 'head' | 'delete' | 'list';

const DAY_MS = 24 * 60 * 60 * 1000;
const GB_DIVISOR = 1024 * 1024 * 1024;
const DEFAULT_HISTORY_RETENTION_MS = 30 * DAY_MS;
const DEFAULT_ESTIMATE_WINDOW_MS = DAY_MS;
const DEFAULT_MAX_HISTORY_POINTS = 200_000;

function createRequestCounts(): RequestCounts {
  return {
    put: 0,
    post: 0,
    copy: 0,
    list: 0,
    get: 0,
    select: 0,
    delete: 0,
    head: 0
  };
}

function createRequestEvents(): RequestEvents {
  return {
    PutObjectCommand: 0,
    GetObjectCommand: 0,
    CopyObjectCommand: 0,
    HeadObjectCommand: 0,
    DeleteObjectCommand: 0,
    DeleteObjectsCommand: 0,
    ListObjectsV2Command: 0
  };
}

function isKnownCommand(name: string): name is CommandName {
  return name === 'PutObjectCommand'
    || name === 'GetObjectCommand'
    || name === 'CopyObjectCommand'
    || name === 'HeadObjectCommand'
    || name === 'DeleteObjectCommand'
    || name === 'DeleteObjectsCommand'
    || name === 'ListObjectsV2Command';
}

function extractNumericContentLength(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return 0;
}

export interface CostUsagePoint {
  timestamp: number;
  command: string;
  method: string;
  requestCost: number;
  bytesIn: number;
  bytesOut: number;
  key: string | null;
  resource: string | null;
  plugin: string | null;
}

interface UsageData {
  historyRetentionMs: number;
  maxHistoryPoints: number;
  totalEvents: number;
  byResource: Record<string, number>;
  byPlugin: Record<string, number>;
  points: CostUsagePoint[];
  lastUpdatedAt: number | null;
}

export interface CostWindowSummary {
  windowMs: number;
  from: number;
  to: number;
  totalRequests: number;
  requestCost: number;
  bytesIn: number;
  bytesOut: number;
  byMethod: RequestCounts;
  byCommand: RequestEvents;
  byResource: Record<string, number>;
  byPlugin: Record<string, number>;
  estimatedDataTransferOutCost: number;
  estimatedTotal: number;
}

export interface CostsEstimateOptions {
  days?: number;
  observedWindowMs?: number;
  requestMultiplier?: number;
  includePluginEstimates?: boolean;
  pluginAssumptions?: Record<string, Record<string, unknown>>;
}

export interface CostsEstimateResult {
  windowDays: number;
  observedWindowMs: number;
  requestMultiplier: number;
  observed: CostWindowSummary;
  projected: {
    totalRequests: number;
    byMethod: RequestCounts;
    requestCost: number;
    bytesIn: number;
    bytesOut: number;
    dataTransferOutCost: number;
    storageCost: number;
    totalCost: number;
    pluginProjectedRequests: number;
    combinedRequests: number;
  };
  pluginEstimates: Record<string, unknown>;
}

export interface CostsData {
  total: number;
  requests: RequestsData;
  storage: StorageData;
  dataTransfer: DataTransferData;
  usage: UsageData;
}

export class CostsPlugin extends Plugin {
  declare namespace: string;
  declare logLevel: string;

  config: CostsConfig;
  map: Record<CommandName, MethodName>;
  costs: CostsData;
  client: S3Client | null = null;
  private _responseListener: EventHandler | null = null;
  private _eventsSincePrune = 0;

  constructor(config: CostsPluginOptions = {}) {
    super(config as any);

    const {
      considerFreeTier = false,
      region = 'us-east-1',
      historyRetentionMs = DEFAULT_HISTORY_RETENTION_MS,
      estimateDefaultWindowMs = DEFAULT_ESTIMATE_WINDOW_MS,
      maxHistoryPoints = DEFAULT_MAX_HISTORY_POINTS
    } = config;

    this.config = {
      considerFreeTier: Boolean(considerFreeTier),
      region: String(region),
      logLevel: this.logLevel,
      historyRetentionMs: Math.max(60_000, historyRetentionMs),
      estimateDefaultWindowMs: Math.max(60_000, estimateDefaultWindowMs),
      maxHistoryPoints: Math.max(1_000, maxHistoryPoints)
    };

    this.map = {
      PutObjectCommand: 'put',
      GetObjectCommand: 'get',
      CopyObjectCommand: 'copy',
      HeadObjectCommand: 'head',
      DeleteObjectCommand: 'delete',
      DeleteObjectsCommand: 'delete',
      ListObjectsV2Command: 'list'
    };

    this.costs = {
      total: 0,
      requests: {
        prices: {
          put: 0.005 / 1000,
          copy: 0.005 / 1000,
          list: 0.005 / 1000,
          post: 0.005 / 1000,
          get: 0.0004 / 1000,
          select: 0.0004 / 1000,
          delete: 0.0004 / 1000,
          head: 0.0004 / 1000
        },
        total: 0,
        counts: createRequestCounts(),
        totalEvents: 0,
        events: createRequestEvents(),
        subtotal: 0
      },
      storage: {
        totalBytes: 0,
        totalGB: 0,
        tiers: [
          { limit: 50 * 1024, pricePerGB: 0.023 },
          { limit: 500 * 1024, pricePerGB: 0.022 },
          { limit: 999999999, pricePerGB: 0.021 }
        ],
        currentTier: 0,
        subtotal: 0
      },
      dataTransfer: {
        inBytes: 0,
        inGB: 0,
        inCost: 0,
        outBytes: 0,
        outGB: 0,
        tiers: [
          { limit: 10 * 1024, pricePerGB: 0.09 },
          { limit: 50 * 1024, pricePerGB: 0.085 },
          { limit: 150 * 1024, pricePerGB: 0.07 },
          { limit: 999999999, pricePerGB: 0.05 }
        ],
        freeTierGB: 100,
        freeTierUsed: 0,
        currentTier: 0,
        subtotal: 0
      },
      usage: {
        historyRetentionMs: this.config.historyRetentionMs,
        maxHistoryPoints: this.config.maxHistoryPoints,
        totalEvents: 0,
        byResource: {},
        byPlugin: {},
        points: [],
        lastUpdatedAt: null
      }
    };
  }

  override async onInstall(): Promise<void> {
    if (!this.database || !this.database.client) {
      return;
    }

    this.client = this.database.client;
    this.client.costs = this.costs;
  }

  override async onStart(): Promise<void> {
    if (!this.client) return;

    this._responseListener = (name: string, response: S3Response, input: S3Input) => {
      const method = isKnownCommand(name) ? this.map[name] : undefined;
      this.addRequest(name, method, response, input);
    };

    this.client.on('cl:response', this._responseListener);
  }

  override async onStop(): Promise<void> {
    if (!this.client || !this._responseListener) {
      return;
    }

    if (typeof this.client.off === 'function') {
      this.client.off('cl:response', this._responseListener);
    } else if (typeof this.client.removeListener === 'function') {
      this.client.removeListener('cl:response', this._responseListener);
    }

    this._responseListener = null;
  }

  addRequest(name: string, method: MethodName | undefined, response: S3Response = {}, input: S3Input = {}): void {
    if (!method) {
      return;
    }

    this.costs.requests.totalEvents++;
    this.costs.requests.total++;
    this.costs.requests.counts[method]++;

    if (isKnownCommand(name)) {
      this.costs.requests.events[name]++;
    }

    const requestCost = this.costs.requests.prices[method] || 0;
    this.costs.requests.subtotal += requestCost;

    const bytesIn = this._extractInputBytes(method, input);
    const bytesOut = this._extractOutputBytes(method, response);

    if (bytesIn > 0) {
      this.trackStorage(bytesIn);
      this.trackDataTransferIn(bytesIn);
    }

    if (bytesOut > 0) {
      this.trackDataTransferOut(bytesOut);
    }

    const key = this._extractKey(input);
    const dimensions = this._extractDimensionsFromKey(key);
    this._recordUsagePoint({
      timestamp: Date.now(),
      command: name,
      method,
      requestCost,
      bytesIn,
      bytesOut,
      key,
      resource: dimensions.resource,
      plugin: dimensions.plugin
    });

    this.updateTotal();
  }

  trackStorage(bytes: number): void {
    this.costs.storage.totalBytes += bytes;
    this.costs.storage.totalGB = this.costs.storage.totalBytes / GB_DIVISOR;
    this.costs.storage.subtotal = this.calculateStorageCost(this.costs.storage);
    this.updateTotal();
  }

  trackDataTransferIn(bytes: number): void {
    this.costs.dataTransfer.inBytes += bytes;
    this.costs.dataTransfer.inGB = this.costs.dataTransfer.inBytes / GB_DIVISOR;
    this.costs.dataTransfer.inCost = 0;
    this.updateTotal();
  }

  trackDataTransferOut(bytes: number): void {
    this.costs.dataTransfer.outBytes += bytes;
    this.costs.dataTransfer.outGB = this.costs.dataTransfer.outBytes / GB_DIVISOR;
    if (this.config.considerFreeTier) {
      this.costs.dataTransfer.freeTierUsed = Math.min(
        this.costs.dataTransfer.outGB,
        this.costs.dataTransfer.freeTierGB
      );
    } else {
      this.costs.dataTransfer.freeTierUsed = 0;
    }
    this.costs.dataTransfer.subtotal = this.calculateDataTransferCost(this.costs.dataTransfer);
    this.updateTotal();
  }

  calculateStorageCost(storage: StorageData): number {
    const totalGB = storage.totalGB;
    let cost = 0;
    let remaining = totalGB;

    for (let i = 0; i < storage.tiers.length; i++) {
      const tier = storage.tiers[i]!;
      const prevLimit = i > 0 ? storage.tiers[i - 1]!.limit : 0;
      const tierCapacity = tier.limit - prevLimit;
      if (remaining <= 0) break;

      const gbInTier = Math.min(remaining, tierCapacity);
      cost += gbInTier * tier.pricePerGB;
      remaining -= gbInTier;

      if (remaining <= 0) {
        storage.currentTier = i;
        break;
      }
    }

    return cost;
  }

  calculateDataTransferCost(dataTransfer: DataTransferData): number {
    let totalGB = dataTransfer.outGB;
    let cost = 0;

    if (this.config.considerFreeTier) {
      const freeTierUsed = Math.min(totalGB, dataTransfer.freeTierGB);
      totalGB = Math.max(0, totalGB - freeTierUsed);
    }

    let remaining = totalGB;
    for (let i = 0; i < dataTransfer.tiers.length; i++) {
      const tier = dataTransfer.tiers[i]!;
      const prevLimit = i > 0 ? dataTransfer.tiers[i - 1]!.limit : 0;
      const tierCapacity = tier.limit - prevLimit;
      if (remaining <= 0) break;

      const gbInTier = Math.min(remaining, tierCapacity);
      cost += gbInTier * tier.pricePerGB;
      remaining -= gbInTier;

      if (remaining <= 0) {
        dataTransfer.currentTier = i;
        break;
      }
    }

    return cost;
  }

  snapshot(options: {
    windowMs?: number;
    from?: number;
    to?: number;
    resource?: string;
    plugin?: string;
  } = {}): CostWindowSummary {
    this._pruneUsageHistory();

    const now = Date.now();
    const to = Number.isFinite(options.to) ? Number(options.to) : now;
    const windowMs = Number.isFinite(options.windowMs)
      ? Math.max(1_000, Number(options.windowMs))
      : this.config.estimateDefaultWindowMs;
    const from = Number.isFinite(options.from) ? Number(options.from) : Math.max(0, to - windowMs);
    const resourceFilter = options.resource ? String(options.resource) : null;
    const pluginFilter = options.plugin ? String(options.plugin) : null;

    const byMethod = createRequestCounts();
    const byCommand = createRequestEvents();
    const byResource: Record<string, number> = {};
    const byPlugin: Record<string, number> = {};

    let totalRequests = 0;
    let requestCost = 0;
    let bytesIn = 0;
    let bytesOut = 0;

    for (const point of this.costs.usage.points) {
      if (point.timestamp < from || point.timestamp > to) {
        continue;
      }
      if (resourceFilter && point.resource !== resourceFilter) {
        continue;
      }
      if (pluginFilter && point.plugin !== pluginFilter) {
        continue;
      }

      totalRequests++;
      requestCost += point.requestCost;
      bytesIn += point.bytesIn;
      bytesOut += point.bytesOut;

      if (point.method in byMethod) {
        byMethod[point.method as keyof RequestCounts]++;
      }

      if (isKnownCommand(point.command)) {
        byCommand[point.command]++;
      }

      if (point.resource) {
        byResource[point.resource] = (byResource[point.resource] || 0) + 1;
      }

      if (point.plugin) {
        byPlugin[point.plugin] = (byPlugin[point.plugin] || 0) + 1;
      }
    }

    const transferModel = this._buildTransferModel(bytesOut);
    const estimatedDataTransferOutCost = this.calculateDataTransferCost(transferModel);
    const estimatedTotal = requestCost + estimatedDataTransferOutCost;

    return {
      windowMs: to - from,
      from,
      to,
      totalRequests,
      requestCost,
      bytesIn,
      bytesOut,
      byMethod,
      byCommand,
      byResource,
      byPlugin,
      estimatedDataTransferOutCost,
      estimatedTotal
    };
  }

  estimate(options: CostsEstimateOptions = {}): CostsEstimateResult {
    const windowDays = Number.isFinite(options.days)
      ? Math.max(1 / 24, Number(options.days))
      : 30;
    const observedWindowMs = Number.isFinite(options.observedWindowMs)
      ? Math.max(60_000, Number(options.observedWindowMs))
      : this.config.estimateDefaultWindowMs;
    const requestMultiplier = Number.isFinite(options.requestMultiplier)
      ? Math.max(0, Number(options.requestMultiplier))
      : 1;

    const observed = this.snapshot({ windowMs: observedWindowMs });
    const scale = (windowDays * DAY_MS / observedWindowMs) * requestMultiplier;
    const byMethod = this._scaleRequestCounts(observed.byMethod, scale);
    const totalRequests = this._sumRequestCounts(byMethod);
    const bytesIn = Math.ceil(observed.bytesIn * scale);
    const bytesOut = Math.ceil(observed.bytesOut * scale);
    const requestCost = observed.requestCost * scale;
    const transferModel = this._buildTransferModel(bytesOut);
    const dataTransferOutCost = this.calculateDataTransferCost(transferModel);
    const storageCost = this.costs.storage.subtotal * (windowDays / 30);

    const includePluginEstimates = options.includePluginEstimates !== false;
    const pluginAssumptions = options.pluginAssumptions || {};
    const pluginEstimates: Record<string, unknown> = {};
    let pluginProjectedRequests = 0;

    if (includePluginEstimates && this.database && (this.database as unknown as Database).plugins) {
      const plugins = (this.database as unknown as Database).plugins || {};
      for (const [pluginName, plugin] of Object.entries(plugins)) {
        if (!plugin || plugin === (this as unknown as PluginWithEstimate)) continue;
        const estimateUsage = (plugin as PluginWithEstimate).estimateUsage;
        if (typeof estimateUsage !== 'function') continue;

        const input = { days: windowDays, ...(pluginAssumptions[pluginName] || {}) };
        try {
          const pluginEstimate = estimateUsage.call(plugin, input);
          pluginEstimates[pluginName] = pluginEstimate;
          pluginProjectedRequests += this._extractEstimatedRequests(pluginEstimate);
        } catch (error) {
          pluginEstimates[pluginName] = {
            error: (error as Error).message || String(error)
          };
        }
      }
    }

    return {
      windowDays,
      observedWindowMs,
      requestMultiplier,
      observed,
      projected: {
        totalRequests,
        byMethod,
        requestCost,
        bytesIn,
        bytesOut,
        dataTransferOutCost,
        storageCost,
        totalCost: requestCost + dataTransferOutCost + storageCost,
        pluginProjectedRequests,
        combinedRequests: totalRequests + pluginProjectedRequests
      },
      pluginEstimates
    };
  }

  getCosts(): CostsData {
    return this.costs;
  }

  updateTotal(): void {
    this.costs.total = this.costs.requests.subtotal + this.costs.storage.subtotal + this.costs.dataTransfer.subtotal;
  }

  private _extractInputBytes(method: MethodName, input: S3Input): number {
    if (method !== 'put' && method !== 'copy') {
      return 0;
    }

    const body = input.Body || input.body;
    if (!body) return 0;

    if (typeof body === 'string') {
      return Buffer.byteLength(body, 'utf8');
    }

    if (Buffer.isBuffer(body)) {
      return body.length;
    }

    if (typeof (body as { length?: number }).length === 'number') {
      return Math.max(0, (body as { length: number }).length);
    }

    return 0;
  }

  private _extractOutputBytes(method: MethodName, response: S3Response): number {
    if (method !== 'get') {
      return 0;
    }

    const headerSize = response?.httpResponse?.headers
      ? response.httpResponse.headers['content-length']
      : undefined;
    const headerLength = extractNumericContentLength(headerSize);
    if (headerLength > 0) return headerLength;
    return extractNumericContentLength(response?.ContentLength);
  }

  private _extractKey(input: S3Input): string | null {
    if (typeof input.Key === 'string' && input.Key.length > 0) {
      return input.Key;
    }
    if (typeof input.key === 'string' && input.key.length > 0) {
      return input.key;
    }
    return null;
  }

  private _extractDimensionsFromKey(key: string | null): { resource: string | null; plugin: string | null } {
    if (!key) {
      return { resource: null, plugin: null };
    }

    const segments = key.split('/').map(s => s.trim()).filter(Boolean);
    let resource: string | null = null;
    let plugin: string | null = null;

    for (const segment of segments) {
      if (!resource && segment.startsWith('resource=')) {
        resource = segment.slice('resource='.length) || null;
      }
      if (!plugin && segment.startsWith('plugin=')) {
        plugin = segment.slice('plugin='.length) || null;
      }
      if (resource && plugin) {
        break;
      }
    }

    return { resource, plugin };
  }

  private _recordUsagePoint(point: CostUsagePoint): void {
    this.costs.usage.totalEvents++;
    this.costs.usage.lastUpdatedAt = point.timestamp;
    if (point.resource) {
      this.costs.usage.byResource[point.resource] = (this.costs.usage.byResource[point.resource] || 0) + 1;
    }
    if (point.plugin) {
      this.costs.usage.byPlugin[point.plugin] = (this.costs.usage.byPlugin[point.plugin] || 0) + 1;
    }

    this.costs.usage.points.push(point);
    this._eventsSincePrune++;

    if (this._eventsSincePrune >= 100) {
      this._eventsSincePrune = 0;
      this._pruneUsageHistory();
    }
  }

  private _pruneUsageHistory(): void {
    const cutoff = Date.now() - this.config.historyRetentionMs;
    const points = this.costs.usage.points;

    let firstValidIndex = 0;
    while (firstValidIndex < points.length && points[firstValidIndex] && points[firstValidIndex]!.timestamp < cutoff) {
      firstValidIndex++;
    }

    if (firstValidIndex > 0) {
      points.splice(0, firstValidIndex);
    }

    if (points.length > this.config.maxHistoryPoints) {
      const excess = points.length - this.config.maxHistoryPoints;
      points.splice(0, excess);
    }
  }

  private _scaleRequestCounts(counts: RequestCounts, scale: number): RequestCounts {
    return {
      put: Math.ceil(counts.put * scale),
      post: Math.ceil(counts.post * scale),
      copy: Math.ceil(counts.copy * scale),
      list: Math.ceil(counts.list * scale),
      get: Math.ceil(counts.get * scale),
      select: Math.ceil(counts.select * scale),
      delete: Math.ceil(counts.delete * scale),
      head: Math.ceil(counts.head * scale)
    };
  }

  private _sumRequestCounts(counts: RequestCounts): number {
    return counts.put
      + counts.post
      + counts.copy
      + counts.list
      + counts.get
      + counts.select
      + counts.delete
      + counts.head;
  }

  private _buildTransferModel(outBytes: number): DataTransferData {
    return {
      inBytes: 0,
      inGB: 0,
      inCost: 0,
      outBytes,
      outGB: outBytes / GB_DIVISOR,
      tiers: this.costs.dataTransfer.tiers.map(t => ({ ...t })),
      freeTierGB: this.costs.dataTransfer.freeTierGB,
      freeTierUsed: 0,
      currentTier: 0,
      subtotal: 0
    };
  }

  private _extractEstimatedRequests(value: unknown): number {
    if (!value || typeof value !== 'object') {
      return 0;
    }

    const v = value as Record<string, unknown>;
    const estimatedRequests = v.estimatedRequests as Record<string, unknown> | undefined;
    if (estimatedRequests && typeof estimatedRequests.total === 'number') {
      return Math.max(0, estimatedRequests.total);
    }

    const projected = v.projected as Record<string, unknown> | undefined;
    if (projected && typeof projected.totalRequests === 'number') {
      return Math.max(0, projected.totalRequests);
    }

    if (typeof v.totalRequests === 'number') {
      return Math.max(0, v.totalRequests);
    }

    if (typeof v.requests === 'number') {
      return Math.max(0, v.requests);
    }

    return 0;
  }
}
