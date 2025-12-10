import { Plugin } from './plugin.class.js';
export class CostsPlugin extends Plugin {
    config;
    map;
    costs;
    client = null;
    constructor(config = {}) {
        super(config);
        const { considerFreeTier = false, region = 'us-east-1' } = config;
        this.config = {
            considerFreeTier: considerFreeTier,
            region: region,
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
    async onInstall() {
        if (!this.database || !this.database.client) {
            return;
        }
        this.client = this.database.client;
        this.client.costs = JSON.parse(JSON.stringify(this.costs));
    }
    async onStart() {
        if (this.client) {
            this.client.on('cl:response', (name, response, input) => {
                this.addRequest(name, this.map[name], response, input);
            });
        }
    }
    addRequest(name, method, response = {}, input = {}) {
        if (!method)
            return;
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
                }
                else if (Buffer.isBuffer(body)) {
                    contentLength = body.length;
                }
                else if (body.length !== undefined) {
                    contentLength = body.length;
                }
            }
            if (contentLength > 0) {
                this.trackStorage(contentLength);
                this.trackDataTransferIn(contentLength);
            }
        }
        if (method === 'get') {
            contentLength = response?.httpResponse?.headers?.['content-length'] ||
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
    trackStorage(bytes) {
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
    trackDataTransferIn(bytes) {
        this.costs.dataTransfer.inBytes += bytes;
        this.costs.dataTransfer.inGB = this.costs.dataTransfer.inBytes / (1024 * 1024 * 1024);
        if (this.client && this.client.costs) {
            this.client.costs.dataTransfer.inBytes += bytes;
            this.client.costs.dataTransfer.inGB = this.client.costs.dataTransfer.inBytes / (1024 * 1024 * 1024);
        }
        this.updateTotal();
    }
    trackDataTransferOut(bytes) {
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
    calculateStorageCost(storage) {
        const totalGB = storage.totalGB;
        let cost = 0;
        let remaining = totalGB;
        for (let i = 0; i < storage.tiers.length; i++) {
            const tier = storage.tiers[i];
            const prevLimit = i > 0 ? storage.tiers[i - 1].limit : 0;
            const tierCapacity = tier.limit - prevLimit;
            if (remaining <= 0)
                break;
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
            const tier = dataTransfer.tiers[i];
            const prevLimit = i > 0 ? dataTransfer.tiers[i - 1].limit : 0;
            const tierCapacity = tier.limit - prevLimit;
            if (remaining <= 0)
                break;
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
        if (this.client && this.client.costs) {
            this.client.costs.total =
                this.client.costs.requests.subtotal +
                    this.client.costs.storage.subtotal +
                    this.client.costs.dataTransfer.subtotal;
        }
    }
}
//# sourceMappingURL=costs.plugin.js.map