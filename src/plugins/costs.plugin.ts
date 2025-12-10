import { Plugin } from './plugin.class.js';
import type { S3DBLogger } from '../concerns/logger.js';

interface Database {
  client: S3Client;
}

interface S3Client {
  costs?: CostsData;
  on(event: string, handler: EventHandler): void;
}

type EventHandler = (name: string, response: S3Response, input: S3Input) => void;

interface S3Response {
  httpResponse?: {
    headers?: Record<string, string | number>;
  };
  ContentLength?: number;
}

interface S3Input {
  Body?: string | Buffer | { length?: number };
  body?: string | Buffer | { length?: number };
}

export interface CostsPluginOptions {
  considerFreeTier?: boolean;
  region?: string;
  logLevel?: string;
}

interface CostsConfig {
  considerFreeTier: boolean;
  region: string;
  logLevel?: string;
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

export interface CostsData {
  total: number;
  requests: RequestsData;
  storage: StorageData;
  dataTransfer: DataTransferData;
}

type CommandName = 'PutObjectCommand' | 'GetObjectCommand' | 'CopyObjectCommand' | 'HeadObjectCommand' | 'DeleteObjectCommand' | 'DeleteObjectsCommand' | 'ListObjectsV2Command';
type MethodName = 'put' | 'get' | 'copy' | 'head' | 'delete' | 'list';

export class CostsPlugin extends Plugin {
  declare namespace: string;
  declare logLevel: string;

  config: CostsConfig;
  map: Record<CommandName, MethodName>;
  costs: CostsData;
  client: S3Client | null = null;

  constructor(config: CostsPluginOptions = {}) {
    super(config as any);

    const {
      considerFreeTier = false,
      region = 'us-east-1'
    } = config;

    this.config = {
      considerFreeTier: considerFreeTier as boolean,
      region: region as string,
      logLevel: this.logLevel
    };

    this.map = {
      PutObjectCommand: 'put',
      GetObjectCommand: 'get',
      CopyObjectCommand: 'copy',
      HeadObjectCommand: 'head',
      DeleteObjectCommand: 'delete',
      DeleteObjectsCommand: 'delete',
      ListObjectsV2Command: 'list',
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
          head: 0.0004 / 1000,
        },
        total: 0,
        counts: {
          put: 0,
          post: 0,
          copy: 0,
          list: 0,
          get: 0,
          select: 0,
          delete: 0,
          head: 0,
        },
        totalEvents: 0,
        events: {
          PutObjectCommand: 0,
          GetObjectCommand: 0,
          CopyObjectCommand: 0,
          HeadObjectCommand: 0,
          DeleteObjectCommand: 0,
          DeleteObjectsCommand: 0,
          ListObjectsV2Command: 0,
        },
        subtotal: 0,
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
      }
    };
  }

  override async onInstall(): Promise<void> {
    if (!this.database || !this.database.client) {
      return;
    }

    this.client = this.database.client;
    this.client.costs = JSON.parse(JSON.stringify(this.costs)) as CostsData;
  }

  override async onStart(): Promise<void> {
    if (this.client) {
      this.client.on('cl:response', (name: string, response: S3Response, input: S3Input) => {
        this.addRequest(name as CommandName, this.map[name as CommandName], response, input);
      });
    }
  }

  addRequest(name: CommandName, method: MethodName | undefined, response: S3Response = {}, input: S3Input = {}): void {
    if (!method) return;

    this.costs.requests.totalEvents++;
    this.costs.requests.total++;
    this.costs.requests.events[name]++;
    this.costs.requests.counts[method]++;

    const requestCost = this.costs.requests.prices[method];
    this.costs.requests.subtotal += requestCost;

    let contentLength = 0;

    if (['put', 'post', 'copy'].includes(method)) {
      const body = input.Body || input.body;
      if (body) {
        if (typeof body === 'string') {
          contentLength = Buffer.byteLength(body, 'utf8');
        } else if (Buffer.isBuffer(body)) {
          contentLength = body.length;
        } else if ((body as { length?: number }).length !== undefined) {
          contentLength = (body as { length: number }).length;
        }
      }

      if (contentLength > 0) {
        this.trackStorage(contentLength);
        this.trackDataTransferIn(contentLength);
      }
    }

    if (method === 'get') {
      contentLength = response?.httpResponse?.headers?.['content-length'] as number ||
                     response?.ContentLength ||
                     0;

      if (contentLength > 0) {
        this.trackDataTransferOut(contentLength);
      }
    }

    if (this.client && this.client.costs) {
      this.client.costs.requests.totalEvents++;
      this.client.costs.requests.total++;
      this.client.costs.requests.events[name]++;
      this.client.costs.requests.counts[method]++;
      this.client.costs.requests.subtotal += requestCost;
    }

    this.updateTotal();
  }

  trackStorage(bytes: number): void {
    this.costs.storage.totalBytes += bytes;
    this.costs.storage.totalGB = this.costs.storage.totalBytes / (1024 * 1024 * 1024);
    this.costs.storage.subtotal = this.calculateStorageCost(this.costs.storage);

    if (this.client && this.client.costs) {
      this.client.costs.storage.totalBytes += bytes;
      this.client.costs.storage.totalGB = this.client.costs.storage.totalBytes / (1024 * 1024 * 1024);
      this.client.costs.storage.subtotal = this.calculateStorageCost(this.client.costs.storage);
    }

    this.updateTotal();
  }

  trackDataTransferIn(bytes: number): void {
    this.costs.dataTransfer.inBytes += bytes;
    this.costs.dataTransfer.inGB = this.costs.dataTransfer.inBytes / (1024 * 1024 * 1024);

    if (this.client && this.client.costs) {
      this.client.costs.dataTransfer.inBytes += bytes;
      this.client.costs.dataTransfer.inGB = this.client.costs.dataTransfer.inBytes / (1024 * 1024 * 1024);
    }

    this.updateTotal();
  }

  trackDataTransferOut(bytes: number): void {
    this.costs.dataTransfer.outBytes += bytes;
    this.costs.dataTransfer.outGB = this.costs.dataTransfer.outBytes / (1024 * 1024 * 1024);
    this.costs.dataTransfer.subtotal = this.calculateDataTransferCost(this.costs.dataTransfer);

    if (this.client && this.client.costs) {
      this.client.costs.dataTransfer.outBytes += bytes;
      this.client.costs.dataTransfer.outGB = this.client.costs.dataTransfer.outBytes / (1024 * 1024 * 1024);
      this.client.costs.dataTransfer.subtotal = this.calculateDataTransferCost(this.client.costs.dataTransfer);
    }

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

    if (this.config && this.config.considerFreeTier) {
      const freeTierRemaining = dataTransfer.freeTierGB - dataTransfer.freeTierUsed;

      if (freeTierRemaining > 0 && totalGB > 0) {
        const gbToDeduct = Math.min(totalGB, freeTierRemaining);
        totalGB -= gbToDeduct;
        dataTransfer.freeTierUsed += gbToDeduct;
      }
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

  updateTotal(): void {
    this.costs.total =
      this.costs.requests.subtotal +
      this.costs.storage.subtotal +
      this.costs.dataTransfer.subtotal;

    if (this.client && this.client.costs) {
      this.client.costs.total =
        this.client.costs.requests.subtotal +
        this.client.costs.storage.subtotal +
        this.client.costs.dataTransfer.subtotal;
    }
  }
}
