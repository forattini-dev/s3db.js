import { Plugin } from './plugin.class.js';

export class CostsPlugin extends Plugin {
  constructor(config = {}) {
    super(config);

    this.config = {
      considerFreeTier: config.considerFreeTier !== undefined ? config.considerFreeTier : false,
      region: config.region || 'us-east-1',
      ...config
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

      // === REQUESTS PRICING ===
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

      // === STORAGE PRICING ===
      storage: {
        totalBytes: 0,
        totalGB: 0,
        // Tiered pricing (S3 Standard - us-east-1)
        tiers: [
          { limit: 50 * 1024, pricePerGB: 0.023 },      // First 50 TB
          { limit: 500 * 1024, pricePerGB: 0.022 },     // Next 450 TB
          { limit: 999999999, pricePerGB: 0.021 }       // Over 500 TB (effectively unlimited)
        ],
        currentTier: 0,
        subtotal: 0  // Monthly storage cost estimate
      },

      // === DATA TRANSFER PRICING ===
      dataTransfer: {
        // Upload (always free)
        inBytes: 0,
        inGB: 0,
        inCost: 0,  // Always $0

        // Download (charged with tiers)
        outBytes: 0,
        outGB: 0,
        // Tiered pricing (out to internet)
        tiers: [
          { limit: 10 * 1024, pricePerGB: 0.09 },       // First 10 TB
          { limit: 50 * 1024, pricePerGB: 0.085 },      // Next 40 TB
          { limit: 150 * 1024, pricePerGB: 0.07 },      // Next 100 TB
          { limit: 999999999, pricePerGB: 0.05 }        // Over 150 TB (effectively unlimited)
        ],
        // Free tier (100GB/month aggregated across AWS)
        freeTierGB: 100,
        freeTierUsed: 0,
        currentTier: 0,
        subtotal: 0  // Data transfer out cost
      }
    };
  }

  async onInstall() {
    if (!this.database || !this.database.client) {
      return; // Handle null/invalid database gracefully
    }

    this.client = this.database.client;
    this.client.costs = JSON.parse(JSON.stringify(this.costs));
  }

  async onStart() {
    if (this.client) {
      // Listen to cl:response only (fires for all operations, success or error)
      // This prevents double-counting (cl:request + cl:response would count twice)
      this.client.on("cl:response", (name, response, input) => this.addRequest(name, this.map[name], response, input));
    }
  }

  addRequest(name, method, response = {}, input = {}) {
    if (!method) return; // Skip if no mapping found

    // Track request counts
    this.costs.requests.totalEvents++;
    this.costs.requests.total++;
    this.costs.requests.events[name]++;
    this.costs.requests.counts[method]++;

    // Calculate request cost
    const requestCost = this.costs.requests.prices[method];
    this.costs.requests.subtotal += requestCost;

    // Track storage and data transfer based on ContentLength
    let contentLength = 0;

    if (['put', 'post', 'copy'].includes(method)) {
      // For uploads, get size from input Body (AWS SDK uses capital B)
      const body = input.Body || input.body;
      if (body) {
        if (typeof body === 'string') {
          contentLength = Buffer.byteLength(body, 'utf8');
        } else if (Buffer.isBuffer(body)) {
          contentLength = body.length;
        } else if (body.length !== undefined) {
          contentLength = body.length;
        }
      }

      if (contentLength > 0) {
        this.trackStorage(contentLength);
        this.trackDataTransferIn(contentLength);
      }
    }

    if (method === 'get') {
      // For downloads, get size from response
      contentLength = response?.httpResponse?.headers?.['content-length'] ||
                     response?.ContentLength ||
                     0;

      if (contentLength > 0) {
        this.trackDataTransferOut(contentLength);
      }
    }

    // Mirror request-related counters to client.costs BEFORE updateTotal()
    // (Storage and data transfer are mirrored in tracking methods)
    if (this.client && this.client.costs) {
      this.client.costs.requests.totalEvents++;
      this.client.costs.requests.total++;
      this.client.costs.requests.events[name]++;
      this.client.costs.requests.counts[method]++;
      this.client.costs.requests.subtotal += requestCost;
    }

    // Update total cost (must be after mirroring request counters)
    this.updateTotal();
  }

  trackStorage(bytes) {
    this.costs.storage.totalBytes += bytes;
    this.costs.storage.totalGB = this.costs.storage.totalBytes / (1024 * 1024 * 1024);
    this.costs.storage.subtotal = this.calculateStorageCost(this.costs.storage);

    // Mirror to client.costs
    if (this.client && this.client.costs) {
      this.client.costs.storage.totalBytes += bytes;
      this.client.costs.storage.totalGB = this.client.costs.storage.totalBytes / (1024 * 1024 * 1024);
      this.client.costs.storage.subtotal = this.calculateStorageCost(this.client.costs.storage);
    }

    // Update total cost
    this.updateTotal();
  }

  trackDataTransferIn(bytes) {
    this.costs.dataTransfer.inBytes += bytes;
    this.costs.dataTransfer.inGB = this.costs.dataTransfer.inBytes / (1024 * 1024 * 1024);
    // inCost is always $0

    // Mirror to client.costs
    if (this.client && this.client.costs) {
      this.client.costs.dataTransfer.inBytes += bytes;
      this.client.costs.dataTransfer.inGB = this.client.costs.dataTransfer.inBytes / (1024 * 1024 * 1024);
    }

    // Update total cost
    this.updateTotal();
  }

  trackDataTransferOut(bytes) {
    this.costs.dataTransfer.outBytes += bytes;
    this.costs.dataTransfer.outGB = this.costs.dataTransfer.outBytes / (1024 * 1024 * 1024);
    this.costs.dataTransfer.subtotal = this.calculateDataTransferCost(this.costs.dataTransfer);

    // Mirror to client.costs
    if (this.client && this.client.costs) {
      this.client.costs.dataTransfer.outBytes += bytes;
      this.client.costs.dataTransfer.outGB = this.client.costs.dataTransfer.outBytes / (1024 * 1024 * 1024);
      this.client.costs.dataTransfer.subtotal = this.calculateDataTransferCost(this.client.costs.dataTransfer);
    }

    // Update total cost
    this.updateTotal();
  }

  calculateStorageCost(storage) {
    const totalGB = storage.totalGB;
    let cost = 0;
    let remaining = totalGB;

    for (let i = 0; i < storage.tiers.length; i++) {
      const tier = storage.tiers[i];
      const prevLimit = i > 0 ? storage.tiers[i - 1].limit : 0;
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

  calculateDataTransferCost(dataTransfer) {
    let totalGB = dataTransfer.outGB;
    let cost = 0;

    // Apply free tier if enabled
    if (this.config && this.config.considerFreeTier) {
      const freeTierRemaining = dataTransfer.freeTierGB - dataTransfer.freeTierUsed;

      if (freeTierRemaining > 0 && totalGB > 0) {
        const gbToDeduct = Math.min(totalGB, freeTierRemaining);
        totalGB -= gbToDeduct;
        dataTransfer.freeTierUsed += gbToDeduct;
      }
    }

    // Calculate with tiers
    let remaining = totalGB;
    for (let i = 0; i < dataTransfer.tiers.length; i++) {
      const tier = dataTransfer.tiers[i];
      const prevLimit = i > 0 ? dataTransfer.tiers[i - 1].limit : 0;
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

  updateTotal() {
    this.costs.total =
      this.costs.requests.subtotal +
      this.costs.storage.subtotal +
      this.costs.dataTransfer.subtotal;

    // Mirror to client.costs
    if (this.client && this.client.costs) {
      this.client.costs.total =
        this.client.costs.requests.subtotal +
        this.client.costs.storage.subtotal +
        this.client.costs.dataTransfer.subtotal;
    }
  }
}
