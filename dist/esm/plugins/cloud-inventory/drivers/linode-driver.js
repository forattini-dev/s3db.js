import { BaseCloudDriver } from './base-driver.js';
import { PluginError } from '../../../errors.js';
export class LinodeInventoryDriver extends BaseCloudDriver {
    _apiToken = null;
    _accountId;
    _services;
    _regions;
    constructor(options = { driver: 'linode' }) {
        super({ ...options, driver: options.driver || 'linode' });
        const config = this.config;
        this._accountId = config?.accountId || 'linode';
        this._services = config?.services || [
            'linodes',
            'kubernetes',
            'volumes',
            'nodebalancers',
            'firewalls',
            'vlans',
            'domains',
            'images',
            'objectstorage',
            'databases',
            'stackscripts',
            'placementgroups'
        ];
        this._regions = config?.regions || null;
    }
    async _initializeClient() {
        if (this._apiToken)
            return;
        const credentials = this.credentials || {};
        this._apiToken = credentials.token || credentials.apiToken || process.env.LINODE_TOKEN || null;
        if (!this._apiToken) {
            throw new PluginError('Linode API token is required. Provide via credentials.token or LINODE_TOKEN env var.', {
                pluginName: 'CloudInventoryPlugin',
                operation: 'linode:initClient',
                statusCode: 400,
                retriable: false,
                suggestion: 'Set credentials.token or LINODE_TOKEN before running the Linode inventory driver.'
            });
        }
        const { setToken } = await import('@linode/api-v4');
        setToken(this._apiToken);
        this.logger('info', 'Linode API client initialized', {
            accountId: this._accountId,
            services: this._services.length
        });
    }
    async *listResources(_options = {}) {
        await this._initializeClient();
        const serviceCollectors = {
            linodes: () => this._collectLinodes(),
            kubernetes: () => this._collectKubernetes(),
            volumes: () => this._collectVolumes(),
            nodebalancers: () => this._collectNodeBalancers(),
            firewalls: () => this._collectFirewalls(),
            vlans: () => this._collectVLANs(),
            domains: () => this._collectDomains(),
            images: () => this._collectImages(),
            objectstorage: () => this._collectObjectStorage(),
            databases: () => this._collectDatabases(),
            stackscripts: () => this._collectStackScripts(),
            placementgroups: () => this._collectPlacementGroups()
        };
        for (const service of this._services) {
            const collector = serviceCollectors[service];
            if (!collector) {
                this.logger('warn', `Unknown Linode service: ${service}`, { service });
                continue;
            }
            try {
                this.logger('info', `Collecting Linode ${service} resources`, { service });
                yield* collector();
            }
            catch (err) {
                const error = err;
                this.logger('error', `Linode service collection failed, skipping to next service`, {
                    service,
                    error: error.message,
                    errorName: error.name,
                    stack: error.stack
                });
            }
        }
    }
    async *_collectLinodes() {
        try {
            const { getLinodes } = await import('@linode/api-v4/lib/linodes');
            const response = await getLinodes();
            const linodes = response.data || [];
            for (const linode of linodes) {
                yield {
                    provider: 'linode',
                    accountId: this._accountId,
                    region: linode.region,
                    service: 'linodes',
                    resourceType: 'linode.compute.instance',
                    resourceId: linode.id?.toString() || '',
                    name: linode.label,
                    tags: linode.tags || [],
                    configuration: this._sanitize(linode)
                };
            }
            this.logger('info', `Collected ${linodes.length} Linode instances`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Linode instances', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectKubernetes() {
        try {
            const kubeModule = await import('@linode/api-v4/lib/kubernetes');
            const { getClusters: getKubernetesClusters } = kubeModule;
            const getKubernetesClusterPools = kubeModule.getKubernetesClusterPools || kubeModule.getClusterPools;
            const response = await getKubernetesClusters();
            const clusters = response.data || [];
            for (const cluster of clusters) {
                yield {
                    provider: 'linode',
                    accountId: this._accountId,
                    region: cluster.region,
                    service: 'kubernetes',
                    resourceType: 'linode.kubernetes.cluster',
                    resourceId: cluster.id?.toString() || '',
                    name: cluster.label,
                    tags: cluster.tags || [],
                    configuration: this._sanitize(cluster)
                };
                try {
                    const poolsResponse = await getKubernetesClusterPools(cluster.id);
                    const pools = poolsResponse.data || [];
                    for (const pool of pools) {
                        yield {
                            provider: 'linode',
                            accountId: this._accountId,
                            region: cluster.region,
                            service: 'kubernetes',
                            resourceType: 'linode.kubernetes.nodepool',
                            resourceId: pool.id?.toString() || '',
                            name: `${cluster.label}-${pool.type}`,
                            tags: cluster.tags || [],
                            metadata: { clusterId: cluster.id, clusterLabel: cluster.label },
                            configuration: this._sanitize(pool)
                        };
                    }
                }
                catch (poolErr) {
                    const error = poolErr;
                    this.logger('warn', `Failed to collect node pools for cluster ${cluster.id}`, {
                        clusterId: cluster.id,
                        error: error.message
                    });
                }
            }
            this.logger('info', `Collected ${clusters.length} Linode Kubernetes clusters`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Linode Kubernetes', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectVolumes() {
        try {
            const { getVolumes } = await import('@linode/api-v4/lib/volumes');
            const response = await getVolumes();
            const volumes = response.data || [];
            for (const volume of volumes) {
                yield {
                    provider: 'linode',
                    accountId: this._accountId,
                    region: volume.region,
                    service: 'volumes',
                    resourceType: 'linode.volume',
                    resourceId: volume.id?.toString() || '',
                    name: volume.label,
                    tags: volume.tags || [],
                    configuration: this._sanitize(volume)
                };
            }
            this.logger('info', `Collected ${volumes.length} Linode volumes`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Linode volumes', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectNodeBalancers() {
        try {
            const { getNodeBalancers } = await import('@linode/api-v4/lib/nodebalancers');
            const response = await getNodeBalancers();
            const nodebalancers = response.data || [];
            for (const nb of nodebalancers) {
                yield {
                    provider: 'linode',
                    accountId: this._accountId,
                    region: nb.region,
                    service: 'nodebalancers',
                    resourceType: 'linode.nodebalancer',
                    resourceId: nb.id?.toString() || '',
                    name: nb.label,
                    tags: nb.tags || [],
                    configuration: this._sanitize(nb)
                };
            }
            this.logger('info', `Collected ${nodebalancers.length} Linode NodeBalancers`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Linode NodeBalancers', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectFirewalls() {
        try {
            const { getFirewalls } = await import('@linode/api-v4/lib/firewalls');
            const response = await getFirewalls();
            const firewalls = response.data || [];
            for (const firewall of firewalls) {
                yield {
                    provider: 'linode',
                    accountId: this._accountId,
                    region: null,
                    service: 'firewalls',
                    resourceType: 'linode.firewall',
                    resourceId: firewall.id?.toString() || '',
                    name: firewall.label,
                    tags: firewall.tags || [],
                    configuration: this._sanitize(firewall)
                };
            }
            this.logger('info', `Collected ${firewalls.length} Linode firewalls`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Linode firewalls', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectVLANs() {
        try {
            const vlanModule = await import('@linode/api-v4/lib/vlans');
            const getVLANs = vlanModule.getVLANs || vlanModule.getVlans;
            const response = await getVLANs();
            const vlans = response.data || [];
            for (const vlan of vlans) {
                yield {
                    provider: 'linode',
                    accountId: this._accountId,
                    region: vlan.region,
                    service: 'vlans',
                    resourceType: 'linode.vlan',
                    resourceId: vlan.label,
                    name: vlan.label,
                    tags: [],
                    configuration: this._sanitize(vlan)
                };
            }
            this.logger('info', `Collected ${vlans.length} Linode VLANs`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Linode VLANs', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectDomains() {
        try {
            const { getDomains, getDomainRecords } = await import('@linode/api-v4/lib/domains');
            const response = await getDomains();
            const domains = response.data || [];
            for (const domain of domains) {
                yield {
                    provider: 'linode',
                    accountId: this._accountId,
                    region: null,
                    service: 'domains',
                    resourceType: 'linode.dns.domain',
                    resourceId: domain.id?.toString() || '',
                    name: domain.domain,
                    tags: domain.tags || [],
                    configuration: this._sanitize(domain)
                };
                try {
                    const recordsResponse = await getDomainRecords(domain.id);
                    const records = recordsResponse.data || [];
                    for (const record of records) {
                        yield {
                            provider: 'linode',
                            accountId: this._accountId,
                            region: null,
                            service: 'domains',
                            resourceType: 'linode.dns.record',
                            resourceId: `${domain.id}/${record.id}`,
                            name: `${record.name}.${domain.domain}`,
                            tags: [],
                            metadata: { domainId: domain.id, domain: domain.domain },
                            configuration: this._sanitize(record)
                        };
                    }
                }
                catch (recordErr) {
                    const error = recordErr;
                    this.logger('warn', `Failed to collect DNS records for domain ${domain.domain}`, {
                        domainId: domain.id,
                        error: error.message
                    });
                }
            }
            this.logger('info', `Collected ${domains.length} Linode DNS domains`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Linode domains', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectImages() {
        try {
            const { getImages } = await import('@linode/api-v4/lib/images');
            const response = await getImages();
            const images = response.data || [];
            const customImages = images.filter((img) => img.is_public === false);
            for (const image of customImages) {
                yield {
                    provider: 'linode',
                    accountId: this._accountId,
                    region: image.region || null,
                    service: 'images',
                    resourceType: 'linode.image',
                    resourceId: image.id,
                    name: image.label,
                    tags: [],
                    configuration: this._sanitize(image)
                };
            }
            this.logger('info', `Collected ${customImages.length} custom Linode images`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Linode images', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectObjectStorage() {
        try {
            const { getObjectStorageBuckets } = await import('@linode/api-v4/lib/object-storage');
            const response = await getObjectStorageBuckets();
            const buckets = response.data || [];
            for (const bucket of buckets) {
                yield {
                    provider: 'linode',
                    accountId: this._accountId,
                    region: bucket.region ?? null,
                    service: 'objectstorage',
                    resourceType: 'linode.objectstorage.bucket',
                    resourceId: `${bucket.cluster}/${bucket.label}`,
                    name: bucket.label,
                    tags: [],
                    metadata: { cluster: bucket.cluster },
                    configuration: this._sanitize(bucket)
                };
            }
            this.logger('info', `Collected ${buckets.length} Linode object storage buckets`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Linode object storage', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectDatabases() {
        try {
            const { getDatabases } = await import('@linode/api-v4/lib/databases');
            const response = await getDatabases();
            const databases = response.data || [];
            for (const db of databases) {
                yield {
                    provider: 'linode',
                    accountId: this._accountId,
                    region: db.region,
                    service: 'databases',
                    resourceType: 'linode.database',
                    resourceId: db.id?.toString() || '',
                    name: db.label,
                    tags: [],
                    metadata: {
                        engine: db.engine,
                        version: db.version,
                        status: db.status
                    },
                    configuration: this._sanitize(db)
                };
            }
            this.logger('info', `Collected ${databases.length} Linode databases`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Linode databases', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectStackScripts() {
        try {
            const { getStackScripts } = await import('@linode/api-v4/lib/stackscripts');
            const response = await getStackScripts({ mine: true });
            const stackScripts = response.data || [];
            for (const script of stackScripts) {
                yield {
                    provider: 'linode',
                    accountId: this._accountId,
                    region: null,
                    service: 'stackscripts',
                    resourceType: 'linode.stackscript',
                    resourceId: script.id?.toString() || '',
                    name: script.label,
                    tags: [],
                    metadata: {
                        isPublic: script.is_public,
                        deploymentsTotal: script.deployments_total
                    },
                    configuration: this._sanitize(script)
                };
            }
            this.logger('info', `Collected ${stackScripts.length} Linode StackScripts`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Linode StackScripts', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectPlacementGroups() {
        try {
            const { getPlacementGroups } = await import('@linode/api-v4/lib/placement-groups');
            const response = await getPlacementGroups();
            const placementGroups = response.data || [];
            for (const pg of placementGroups) {
                yield {
                    provider: 'linode',
                    accountId: this._accountId,
                    region: pg.region,
                    service: 'placementgroups',
                    resourceType: 'linode.placementgroup',
                    resourceId: pg.id?.toString() || '',
                    name: pg.label,
                    tags: [],
                    metadata: {
                        placementGroupType: pg.placement_group_type,
                        placementGroupPolicy: pg.placement_group_policy
                    },
                    configuration: this._sanitize(pg)
                };
            }
            this.logger('info', `Collected ${placementGroups.length} Linode placement groups`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Linode placement groups', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    _sanitize(config) {
        if (!config || typeof config !== 'object')
            return config;
        const sanitized = { ...config };
        const sensitiveFields = [
            'root_pass',
            'password',
            'token',
            'secret',
            'api_key',
            'private_key',
            'public_key'
        ];
        for (const field of sensitiveFields) {
            if (field in sanitized) {
                sanitized[field] = '***REDACTED***';
            }
        }
        return sanitized;
    }
}
//# sourceMappingURL=linode-driver.js.map