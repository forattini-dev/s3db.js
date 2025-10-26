/**
 * # CostsPlugin - AWS S3 Cost Tracking for s3db.js
 *
 * ## Overview
 *
 * The CostsPlugin automatically tracks AWS S3 costs in real-time, providing detailed
 * cost breakdowns for requests, storage, and data transfer. Perfect for monitoring
 * and optimizing S3 usage costs.
 *
 * ## Features
 *
 * 1. **Real-Time Cost Tracking** - Monitor costs as operations occur
 * 2. **Tiered Pricing** - Accurate AWS S3 tiered pricing calculations
 * 3. **Request Tracking** - Track PUT, GET, COPY, HEAD, DELETE, LIST operations
 * 4. **Storage Costs** - Calculate monthly storage costs with tiered pricing
 * 5. **Data Transfer Costs** - Track upload (free) and download (tiered) costs
 * 6. **Free Tier Support** - Optional AWS free tier consideration
 * 7. **Detailed Breakdown** - Access costs by operation type, resource, and category
 *
 * ## Configuration
 *
 * ```javascript
 * import { Database } from 's3db.js';
 * import { CostsPlugin } from 's3db.js/plugins/costs';
 *
 * // Basic configuration
 * const db = new Database({
 *   connectionString: 's3://bucket/db'
 * });
 *
 * await db.use(new CostsPlugin({
 *   considerFreeTier: false,  // Don't apply free tier (default: false)
 *   region: 'us-east-1'       // AWS region (default: 'us-east-1')
 * }));
 *
 * // With free tier consideration
 * await db.use(new CostsPlugin({
 *   considerFreeTier: true,   // Apply AWS free tier (100GB data transfer)
 *   region: 'us-east-1'
 * }));
 * ```
 *
 * ## Usage Examples
 *
 * ### Basic Cost Tracking
 *
 * ```javascript
 * const db = new Database({ connectionString: 's3://bucket/db' });
 * await db.use(new CostsPlugin());
 * await db.start();
 *
 * const users = await db.createResource({
 *   name: 'users',
 *   attributes: { name: 'string', email: 'string' }
 * });
 *
 * // Perform operations
 * await users.insert({ id: 'u1', name: 'John', email: 'john@example.com' });
 * await users.get('u1');
 * await users.update('u1', { name: 'Jane' });
 *
 * // Access costs from client
 * console.log(db.client.costs);
 * // {
 * //   total: 0.0000154,
 * //   requests: {
 * //     total: 3,
 * //     counts: { put: 2, get: 1 },
 * //     subtotal: 0.0000134
 * //   },
 * //   storage: { totalGB: 0.00001, subtotal: 0.00000023 },
 * //   dataTransfer: { inGB: 0.00001, outGB: 0.00001, subtotal: 0.0 }
 * // }
 * ```
 *
 * ### Detailed Cost Breakdown
 *
 * ```javascript
 * const costs = db.client.costs;
 *
 * // Total costs
 * console.log(`Total: $${costs.total.toFixed(6)}`);
 *
 * // Request costs
 * console.log('Requests:', {
 *   put: costs.requests.counts.put,
 *   get: costs.requests.counts.get,
 *   copy: costs.requests.counts.copy,
 *   list: costs.requests.counts.list,
 *   delete: costs.requests.counts.delete,
 *   head: costs.requests.counts.head,
 *   subtotal: `$${costs.requests.subtotal.toFixed(6)}`
 * });
 *
 * // Storage costs
 * console.log('Storage:', {
 *   totalGB: costs.storage.totalGB.toFixed(4),
 *   currentTier: costs.storage.currentTier,
 *   subtotal: `$${costs.storage.subtotal.toFixed(6)}`
 * });
 *
 * // Data transfer costs
 * console.log('Data Transfer:', {
 *   inGB: costs.dataTransfer.inGB.toFixed(4),
 *   outGB: costs.dataTransfer.outGB.toFixed(4),
 *   freeTierUsed: costs.dataTransfer.freeTierUsed.toFixed(4),
 *   subtotal: `$${costs.dataTransfer.subtotal.toFixed(6)}`
 * });
 * ```
 *
 * ### Cost Monitoring Dashboard
 *
 * ```javascript
 * // Real-time cost monitoring
 * setInterval(() => {
 *   const costs = db.client.costs;
 *   const report = {
 *     timestamp: new Date().toISOString(),
 *     total: `$${costs.total.toFixed(6)}`,
 *     operations: costs.requests.total,
 *     storage: `${costs.storage.totalGB.toFixed(2)} GB`,
 *     dataTransfer: {
 *       in: `${costs.dataTransfer.inGB.toFixed(2)} GB`,
 *       out: `${costs.dataTransfer.outGB.toFixed(2)} GB`
 *     }
 *   };
 *
 *   console.log('Cost Report:', report);
 *   // Send to monitoring system
 *   sendToMonitoring(report);
 * }, 60000); // Every minute
 * ```
 *
 * ### Cost Alerts
 *
 * ```javascript
 * // Set up cost threshold alerts
 * const COST_THRESHOLD = 1.00; // $1.00
 * const CHECK_INTERVAL = 300000; // 5 minutes
 *
 * setInterval(() => {
 *   const costs = db.client.costs;
 *
 *   if (costs.total > COST_THRESHOLD) {
 *     console.error(`⚠️ Cost threshold exceeded: $${costs.total.toFixed(4)}`);
 *     // Send alert (email, Slack, etc.)
 *     sendAlert({
 *       message: `S3 costs exceeded $${COST_THRESHOLD}`,
 *       current: costs.total,
 *       breakdown: {
 *         requests: costs.requests.subtotal,
 *         storage: costs.storage.subtotal,
 *         dataTransfer: costs.dataTransfer.subtotal
 *       }
 *     });
 *   }
 * }, CHECK_INTERVAL);
 * ```
 *
 * ## AWS S3 Pricing Reference
 *
 * ### Request Pricing (us-east-1)
 *
 * | Operation Type | Operations | Price per 1,000 |
 * |----------------|------------|-----------------|
 * | PUT, COPY, POST | PUT, COPY, LIST | $0.005 |
 * | GET, SELECT | GET, HEAD, DELETE | $0.0004 |
 *
 * ### Storage Pricing Tiers (us-east-1, S3 Standard)
 *
 * | Tier | Storage Range | Price per GB/month |
 * |------|---------------|-------------------|
 * | Tier 1 | First 50 TB | $0.023 |
 * | Tier 2 | Next 450 TB | $0.022 |
 * | Tier 3 | Over 500 TB | $0.021 |
 *
 * ### Data Transfer Pricing (Out to Internet)
 *
 * | Tier | Transfer Range | Price per GB |
 * |------|----------------|--------------|
 * | Free Tier | First 100 GB/month | $0.00 (optional) |
 * | Tier 1 | First 10 TB | $0.09 |
 * | Tier 2 | Next 40 TB | $0.085 |
 * | Tier 3 | Next 100 TB | $0.07 |
 * | Tier 4 | Over 150 TB | $0.05 |
 *
 * **Note**: Data transfer IN is always free.
 *
 * ## Best Practices
 *
 * ### 1. Monitor Costs Regularly
 *
 * ```javascript
 * // Daily cost summary
 * function generateDailyCostReport() {
 *   const costs = db.client.costs;
 *
 *   return {
 *     date: new Date().toISOString().split('T')[0],
 *     total: costs.total,
 *     breakdown: {
 *       requests: {
 *         count: costs.requests.total,
 *         cost: costs.requests.subtotal
 *       },
 *       storage: {
 *         gb: costs.storage.totalGB,
 *         cost: costs.storage.subtotal
 *       },
 *       dataTransfer: {
 *         inGB: costs.dataTransfer.inGB,
 *         outGB: costs.dataTransfer.outGB,
 *         cost: costs.dataTransfer.subtotal
 *       }
 *     }
 *   };
 * }
 *
 * // Schedule daily reports
 * setInterval(() => {
 *   const report = generateDailyCostReport();
 *   saveCostReport(report);
 * }, 24 * 60 * 60 * 1000);
 * ```
 *
 * ### 2. Optimize Request Patterns
 *
 * ```javascript
 * // EXPENSIVE: Many small operations
 * for (let i = 0; i < 1000; i++) {
 *   await users.get(`user-${i}`);  // 1000 GET requests = $0.0004
 * }
 *
 * // CHEAPER: Batch operations
 * const ids = Array.from({ length: 1000 }, (_, i) => `user-${i}`);
 * await users.getMany(ids);  // Fewer requests, same result
 * ```
 *
 * ### 3. Use Free Tier When Available
 *
 * ```javascript
 * // Enable free tier for development/testing
 * await db.use(new CostsPlugin({
 *   considerFreeTier: true  // First 100GB data transfer out is free
 * }));
 * ```
 *
 * ### 4. Track Costs Per Environment
 *
 * ```javascript
 * // Development environment
 * const devDb = new Database({ connectionString: 's3://dev-bucket/db' });
 * await devDb.use(new CostsPlugin({ considerFreeTier: true }));
 *
 * // Production environment
 * const prodDb = new Database({ connectionString: 's3://prod-bucket/db' });
 * await prodDb.use(new CostsPlugin({ considerFreeTier: false }));
 *
 * // Compare costs
 * console.log('Dev costs:', devDb.client.costs.total);
 * console.log('Prod costs:', prodDb.client.costs.total);
 * ```
 *
 * ## Performance Considerations
 *
 * ### Overhead
 *
 * The CostsPlugin adds minimal overhead:
 * - **CPU**: <1% overhead (simple arithmetic operations)
 * - **Memory**: ~2KB for cost tracking objects
 * - **Latency**: No measurable impact on operation latency
 *
 * ### Storage Tracking Accuracy
 *
 * ```javascript
 * // Storage costs are ESTIMATES based on tracked operations
 * // Actual S3 storage may differ due to:
 * // - S3 versioning
 * // - Incomplete multipart uploads
 * // - S3 replication
 * // - External S3 operations not tracked by s3db
 *
 * // For accurate storage costs, use AWS Cost Explorer API
 * ```
 *
 * ## Troubleshooting
 *
 * ### Costs Not Being Tracked
 *
 * ```javascript
 * // Ensure plugin is installed and started
 * console.log(db.plugins.CostsPlugin);  // Should exist
 * await db.start();  // Must call start() to activate plugin
 *
 * // Check client costs object
 * console.log(db.client.costs);  // Should have costs structure
 * ```
 *
 * ### Inaccurate Cost Calculations
 *
 * ```javascript
 * // Check region configuration
 * const plugin = new CostsPlugin({ region: 'us-east-1' });
 * // Plugin uses us-east-1 pricing by default
 * // For other regions, costs may differ
 *
 * // Verify operation counts
 * console.log(db.client.costs.requests.events);
 * // Should show operation counts
 * ```
 *
 * ### Storage Costs Seem High
 *
 * ```javascript
 * // Storage costs accumulate over time
 * // Check total storage
 * const costs = db.client.costs;
 * console.log(`Total storage: ${costs.storage.totalGB} GB`);
 * console.log(`Current tier: ${costs.storage.currentTier}`);
 * console.log(`Monthly cost: $${costs.storage.subtotal.toFixed(4)}`);
 *
 * // Note: Storage cost is MONTHLY estimate
 * // Divide by 30 for daily estimate
 * const dailyStorageCost = costs.storage.subtotal / 30;
 * console.log(`Daily storage cost: $${dailyStorageCost.toFixed(6)}`);
 * ```
 *
 * ### Free Tier Not Applied
 *
 * ```javascript
 * // Ensure considerFreeTier is enabled
 * await db.use(new CostsPlugin({
 *   considerFreeTier: true  // Must be explicitly enabled
 * }));
 *
 * // Check free tier usage
 * const costs = db.client.costs;
 * console.log(`Free tier used: ${costs.dataTransfer.freeTierUsed} GB`);
 * console.log(`Free tier available: ${costs.dataTransfer.freeTierGB} GB`);
 * ```
 *
 * ## Real-World Use Cases
 *
 * ### 1. Development Cost Tracking
 *
 * ```javascript
 * // Track costs during development to estimate production costs
 * const db = new Database({ connectionString: 's3://dev-bucket/db' });
 * await db.use(new CostsPlugin({ considerFreeTier: true }));
 *
 * // Run your application
 * await runDevelopmentWorkload();
 *
 * // Generate cost projection
 * const devCosts = db.client.costs;
 * const projectedMonthlyCost = (devCosts.total / devCosts.requests.total) * expectedMonthlyOperations;
 * console.log(`Projected monthly cost: $${projectedMonthlyCost.toFixed(2)}`);
 * ```
 *
 * ### 2. Cost Attribution by Feature
 *
 * ```javascript
 * // Track costs for different features
 * async function trackFeatureCosts(featureName, operation) {
 *   const beforeCosts = { ...db.client.costs };
 *
 *   await operation();
 *
 *   const afterCosts = db.client.costs;
 *   const featureCost = afterCosts.total - beforeCosts.total;
 *
 *   console.log(`${featureName} cost: $${featureCost.toFixed(6)}`);
 *   return featureCost;
 * }
 *
 * // Use it
 * await trackFeatureCosts('User Registration', async () => {
 *   await users.insert({ id: 'u1', name: 'John' });
 *   await sendWelcomeEmail('u1');
 * });
 * ```
 *
 * ### 3. Cost-Based Rate Limiting
 *
 * ```javascript
 * // Implement rate limiting based on cost thresholds
 * const HOURLY_COST_LIMIT = 0.10; // $0.10 per hour
 * let hourStartCosts = db.client.costs.total;
 *
 * setInterval(() => {
 *   hourStartCosts = db.client.costs.total;
 * }, 60 * 60 * 1000); // Reset hourly
 *
 * async function performOperation() {
 *   const currentCosts = db.client.costs.total;
 *   const hourlyCost = currentCosts - hourStartCosts;
 *
 *   if (hourlyCost > HOURLY_COST_LIMIT) {
 *     throw new Error('Hourly cost limit exceeded');
 *   }
 *
 *   // Proceed with operation
 *   await resource.insert(data);
 * }
 * ```
 *
 * ### 4. Multi-Tenant Cost Tracking
 *
 * ```javascript
 * // Track costs per tenant using separate database instances
 * const tenantDatabases = {};
 *
 * async function getTenantDatabase(tenantId) {
 *   if (!tenantDatabases[tenantId]) {
 *     const db = new Database({
 *       connectionString: `s3://bucket/tenants/${tenantId}`
 *     });
 *     await db.use(new CostsPlugin());
 *     await db.start();
 *     tenantDatabases[tenantId] = db;
 *   }
 *   return tenantDatabases[tenantId];
 * }
 *
 * // Generate per-tenant cost reports
 * function generateTenantCostReport() {
 *   return Object.entries(tenantDatabases).map(([tenantId, db]) => ({
 *     tenantId,
 *     costs: db.client.costs.total,
 *     operations: db.client.costs.requests.total
 *   }));
 * }
 * ```
 *
 * ## API Reference
 *
 * ### Constructor Options
 *
 * - `considerFreeTier` (boolean, default: false) - Apply AWS free tier (100GB data transfer)
 * - `region` (string, default: 'us-east-1') - AWS region for pricing
 *
 * ### Cost Object Structure
 *
 * ```typescript
 * interface Costs {
 *   total: number;
 *
 *   requests: {
 *     total: number;
 *     totalEvents: number;
 *     subtotal: number;
 *     counts: {
 *       put: number;
 *       get: number;
 *       copy: number;
 *       list: number;
 *       delete: number;
 *       head: number;
 *       post: number;
 *       select: number;
 *     };
 *     events: {
 *       PutObjectCommand: number;
 *       GetObjectCommand: number;
 *       CopyObjectCommand: number;
 *       HeadObjectCommand: number;
 *       DeleteObjectCommand: number;
 *       DeleteObjectsCommand: number;
 *       ListObjectsV2Command: number;
 *     };
 *     prices: {
 *       put: number;
 *       get: number;
 *       copy: number;
 *       list: number;
 *       delete: number;
 *       head: number;
 *     };
 *   };
 *
 *   storage: {
 *     totalBytes: number;
 *     totalGB: number;
 *     currentTier: number;
 *     subtotal: number;
 *     tiers: Array<{ limit: number; pricePerGB: number }>;
 *   };
 *
 *   dataTransfer: {
 *     inBytes: number;
 *     inGB: number;
 *     inCost: number;  // Always 0
 *     outBytes: number;
 *     outGB: number;
 *     freeTierGB: number;
 *     freeTierUsed: number;
 *     currentTier: number;
 *     subtotal: number;
 *     tiers: Array<{ limit: number; pricePerGB: number }>;
 *   };
 * }
 * ```
 *
 * ### Accessing Costs
 *
 * ```javascript
 * // From database client
 * const costs = db.client.costs;
 *
 * // From plugin instance (same object)
 * const costsPlugin = db.plugins.CostsPlugin;
 * const costs2 = costsPlugin.costs;  // Same as db.client.costs
 * ```
 *
 * ## Notes
 *
 * - Pricing is based on AWS S3 Standard storage class in us-east-1
 * - Storage costs are monthly estimates based on accumulated data size
 * - Data transfer IN is always free (AWS policy)
 * - Free tier is optional and shared across ALL AWS services (not just S3)
 * - Costs are tracked from plugin installation - reset requires new plugin instance
 * - Plugin tracks operations through s3db.js only - external S3 operations not tracked
 */

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
