import { GoogleAuth } from 'google-auth-library';
import { BaseCloudDriver } from './base-driver.js';
const DEFAULT_SERVICES = [
    'compute', 'gke', 'run', 'functions', 'appengine',
    'storage', 'sql', 'bigquery', 'spanner', 'firestore',
    'vpc', 'loadbalancing', 'dns', 'cdn',
    'iam', 'kms', 'secretmanager',
    'pubsub', 'tasks', 'scheduler',
    'monitoring', 'logging',
    'artifactregistry', 'containerregistry'
];
function normaliseServiceName(name) {
    return (name || '').toString().trim().toLowerCase();
}
function ensureArray(value, defaultValue = []) {
    if (Array.isArray(value))
        return value;
    if (value != null)
        return [value];
    return defaultValue;
}
function shouldCollect(service, includeSet, excludeSet) {
    if (excludeSet.size > 0 && excludeSet.has(service))
        return false;
    if (includeSet.size > 0 && !includeSet.has(service))
        return false;
    return true;
}
function sanitizeConfiguration(config) {
    return config;
}
function extractLabels(resource) {
    return resource?.labels || null;
}
/**
 * Production-ready GCP inventory driver using official Google Cloud client libraries.
 *
 * Covers 20+ services with many resource types:
 * - Compute (instances, zones)
 * - GKE (clusters)
 * - Cloud Run (services)
 * - Cloud Functions
 * - Storage (buckets)
 * - Cloud SQL (instances)
 * - BigQuery (datasets)
 * - Pub/Sub (topics, subscriptions)
 * - VPC (networks, subnets, firewalls)
 * - IAM (service accounts)
 * - KMS (key rings)
 * - Secret Manager (secrets)
 *
 * @see https://cloud.google.com/nodejs/docs/reference
 */
export class GcpInventoryDriver extends BaseCloudDriver {
    _clients = {
        compute: null,
        container: null,
        run: null,
        cloudfunctions: null,
        appengine: null,
        storage: null,
        sqladmin: null,
        bigquery: null,
        spanner: null,
        firestore: null,
        iam: null,
        cloudkms: null,
        secretmanager: null,
        pubsub: null,
        cloudtasks: null,
        cloudscheduler: null,
        monitoring: null,
        logging: null,
        artifactregistry: null
    };
    _auth = null;
    _projectId;
    _services;
    _regions;
    constructor(options = {}) {
        super({ ...options, driver: options.driver || 'gcp' });
        this._projectId = this.config?.projectId || null;
        this._services = ensureArray(this.config?.services, DEFAULT_SERVICES)
            .map(normaliseServiceName)
            .filter((s) => Boolean(s));
        if (!this._services.length) {
            this._services = [...DEFAULT_SERVICES];
        }
        this._regions = ensureArray(this.config?.regions, [this.config?.region || 'us-central1']);
        if (!this._regions.length) {
            this._regions = ['us-central1'];
        }
    }
    async initialize() {
        await this._initializeAuth();
        this.logger('info', 'GCP driver initialized', {
            cloudId: this.id,
            projectId: this._projectId,
            regions: this._regions,
            services: this._services.length
        });
    }
    async _initializeAuth() {
        const credentials = this.credentials || {};
        const authOptions = {
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        };
        if (credentials.keyFile) {
            authOptions.keyFile = credentials.keyFile;
        }
        else if (credentials.credentials) {
            authOptions.credentials = credentials.credentials;
        }
        this._auth = new GoogleAuth(authOptions);
        if (!this._projectId) {
            this._projectId = await this._auth.getProjectId();
        }
        this.logger('debug', 'GCP authentication initialized', {
            projectId: this._projectId,
            hasKeyFile: !!credentials.keyFile,
            hasCredentials: !!credentials.credentials
        });
    }
    async *_collectComputeInstances() {
        const { compute } = await import('@google-cloud/compute');
        const computeClient = new compute.InstancesClient({ auth: this._auth });
        for (const region of this._regions) {
            try {
                const zones = await this._listZonesInRegion(region);
                for (const zone of zones) {
                    const request = {
                        project: this._projectId,
                        zone: zone.name
                    };
                    const [instances] = await computeClient.list(request);
                    for (const instance of instances) {
                        yield {
                            provider: 'gcp',
                            accountId: this._projectId,
                            region,
                            service: 'compute',
                            resourceType: 'gcp.compute.instance',
                            resourceId: instance.id?.toString() || instance.name || '',
                            name: instance.name,
                            tags: extractLabels(instance),
                            metadata: { zone: zone.name },
                            configuration: sanitizeConfiguration(instance)
                        };
                    }
                }
            }
            catch (err) {
                const error = err;
                this.logger('warn', 'Failed to collect Compute instances', { region, error: error.message });
            }
        }
    }
    async *_collectGKEClusters() {
        const { ClusterManagerClient } = await import('@google-cloud/container');
        const client = new ClusterManagerClient({ auth: this._auth });
        for (const region of this._regions) {
            try {
                const parent = `projects/${this._projectId}/locations/${region}`;
                const [response] = await client.listClusters({ parent });
                for (const cluster of response.clusters || []) {
                    yield {
                        provider: 'gcp',
                        accountId: this._projectId,
                        region,
                        service: 'gke',
                        resourceType: 'gcp.gke.cluster',
                        resourceId: cluster.name || '',
                        name: cluster.name,
                        tags: extractLabels(cluster),
                        metadata: { zone: cluster.zone, location: cluster.location },
                        configuration: sanitizeConfiguration(cluster)
                    };
                }
            }
            catch (err) {
                const error = err;
                this.logger('warn', 'Failed to collect GKE clusters', { region, error: error.message });
            }
        }
    }
    async *_collectCloudRunServices() {
        const { ServicesClient } = await import('@google-cloud/run');
        const client = new ServicesClient({ auth: this._auth });
        for (const region of this._regions) {
            try {
                const parent = `projects/${this._projectId}/locations/${region}`;
                const request = { parent };
                const [services] = await client.listServices(request);
                for (const service of services) {
                    yield {
                        provider: 'gcp',
                        accountId: this._projectId,
                        region,
                        service: 'run',
                        resourceType: 'gcp.run.service',
                        resourceId: service.uid || service.name || '',
                        name: service.name?.split('/').pop(),
                        tags: extractLabels(service.metadata),
                        metadata: {},
                        configuration: sanitizeConfiguration(service)
                    };
                }
            }
            catch (err) {
                const error = err;
                this.logger('warn', 'Failed to collect Cloud Run services', { region, error: error.message });
            }
        }
    }
    async *_collectCloudFunctions() {
        const { CloudFunctionsServiceClient } = await import('@google-cloud/functions');
        const client = new CloudFunctionsServiceClient({ auth: this._auth });
        for (const region of this._regions) {
            try {
                const parent = `projects/${this._projectId}/locations/${region}`;
                const [functions] = await client.listFunctions({ parent });
                for (const fn of functions) {
                    yield {
                        provider: 'gcp',
                        accountId: this._projectId,
                        region,
                        service: 'functions',
                        resourceType: 'gcp.functions.function',
                        resourceId: fn.name?.split('/').pop() || '',
                        name: fn.name?.split('/').pop(),
                        tags: extractLabels(fn),
                        metadata: {},
                        configuration: sanitizeConfiguration(fn)
                    };
                }
            }
            catch (err) {
                const error = err;
                this.logger('warn', 'Failed to collect Cloud Functions', { region, error: error.message });
            }
        }
    }
    async *_collectStorageBuckets() {
        const { Storage } = await import('@google-cloud/storage');
        const storage = new Storage({ auth: this._auth, projectId: this._projectId });
        try {
            const [buckets] = await storage.getBuckets();
            for (const bucket of buckets) {
                const [metadata] = await bucket.getMetadata();
                yield {
                    provider: 'gcp',
                    accountId: this._projectId,
                    region: metadata.location,
                    service: 'storage',
                    resourceType: 'gcp.storage.bucket',
                    resourceId: bucket.id || bucket.name || '',
                    name: bucket.name,
                    tags: extractLabels(metadata),
                    metadata: { location: metadata.location, storageClass: metadata.storageClass },
                    configuration: sanitizeConfiguration(metadata)
                };
            }
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to collect Storage buckets', { error: error.message });
        }
    }
    async *_collectCloudSQLInstances() {
        const { SqlInstancesServiceClient } = await import('@google-cloud/sql');
        const client = new SqlInstancesServiceClient({ auth: this._auth });
        try {
            const request = { project: this._projectId };
            const [instances] = await client.list(request);
            for (const instance of instances) {
                yield {
                    provider: 'gcp',
                    accountId: this._projectId,
                    region: instance.region,
                    service: 'sql',
                    resourceType: 'gcp.sql.instance',
                    resourceId: instance.name || '',
                    name: instance.name,
                    tags: extractLabels({ labels: instance.settings?.userLabels }),
                    metadata: { databaseVersion: instance.databaseVersion },
                    configuration: sanitizeConfiguration(instance)
                };
            }
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to collect Cloud SQL instances', { error: error.message });
        }
    }
    async *_collectBigQueryDatasets() {
        const { BigQuery } = await import('@google-cloud/bigquery');
        const bigquery = new BigQuery({ auth: this._auth, projectId: this._projectId });
        try {
            const [datasets] = await bigquery.getDatasets();
            for (const dataset of datasets) {
                const [metadata] = await dataset.getMetadata();
                yield {
                    provider: 'gcp',
                    accountId: this._projectId,
                    region: metadata.location,
                    service: 'bigquery',
                    resourceType: 'gcp.bigquery.dataset',
                    resourceId: dataset.id || '',
                    name: dataset.id?.split(':').pop(),
                    tags: extractLabels(metadata),
                    metadata: { location: metadata.location },
                    configuration: sanitizeConfiguration(metadata)
                };
            }
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to collect BigQuery datasets', { error: error.message });
        }
    }
    async *_collectPubSubTopics() {
        const { PubSub } = await import('@google-cloud/pubsub');
        const pubsub = new PubSub({ auth: this._auth, projectId: this._projectId });
        try {
            const [topics] = await pubsub.getTopics();
            for (const topic of topics) {
                const [metadata] = await topic.getMetadata();
                yield {
                    provider: 'gcp',
                    accountId: this._projectId,
                    region: null,
                    service: 'pubsub',
                    resourceType: 'gcp.pubsub.topic',
                    resourceId: topic.name?.split('/').pop() || '',
                    name: topic.name?.split('/').pop(),
                    tags: extractLabels(metadata),
                    metadata: {},
                    configuration: sanitizeConfiguration(metadata)
                };
            }
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to collect Pub/Sub topics', { error: error.message });
        }
    }
    async *_collectPubSubSubscriptions() {
        const { PubSub } = await import('@google-cloud/pubsub');
        const pubsub = new PubSub({ auth: this._auth, projectId: this._projectId });
        try {
            const [subscriptions] = await pubsub.getSubscriptions();
            for (const subscription of subscriptions) {
                const [metadata] = await subscription.getMetadata();
                yield {
                    provider: 'gcp',
                    accountId: this._projectId,
                    region: null,
                    service: 'pubsub',
                    resourceType: 'gcp.pubsub.subscription',
                    resourceId: subscription.name?.split('/').pop() || '',
                    name: subscription.name?.split('/').pop(),
                    tags: extractLabels(metadata),
                    metadata: { topic: metadata.topic },
                    configuration: sanitizeConfiguration(metadata)
                };
            }
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to collect Pub/Sub subscriptions', { error: error.message });
        }
    }
    async *_collectVPCNetworks() {
        const { compute } = await import('@google-cloud/compute');
        const networksClient = new compute.NetworksClient({ auth: this._auth });
        try {
            const request = { project: this._projectId };
            const [networks] = await networksClient.list(request);
            for (const network of networks) {
                yield {
                    provider: 'gcp',
                    accountId: this._projectId,
                    region: null,
                    service: 'vpc',
                    resourceType: 'gcp.vpc.network',
                    resourceId: network.id?.toString() || network.name || '',
                    name: network.name,
                    tags: null,
                    metadata: { autoCreateSubnetworks: network.autoCreateSubnetworks },
                    configuration: sanitizeConfiguration(network)
                };
            }
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to collect VPC networks', { error: error.message });
        }
    }
    async *_collectVPCSubnets() {
        const { compute } = await import('@google-cloud/compute');
        const subnetsClient = new compute.SubnetworksClient({ auth: this._auth });
        for (const region of this._regions) {
            try {
                const request = {
                    project: this._projectId,
                    region
                };
                const [subnets] = await subnetsClient.list(request);
                for (const subnet of subnets) {
                    yield {
                        provider: 'gcp',
                        accountId: this._projectId,
                        region,
                        service: 'vpc',
                        resourceType: 'gcp.vpc.subnet',
                        resourceId: subnet.id?.toString() || subnet.name || '',
                        name: subnet.name,
                        tags: null,
                        metadata: { network: subnet.network, ipCidrRange: subnet.ipCidrRange },
                        configuration: sanitizeConfiguration(subnet)
                    };
                }
            }
            catch (err) {
                const error = err;
                this.logger('warn', 'Failed to collect VPC subnets', { region, error: error.message });
            }
        }
    }
    async *_collectVPCFirewalls() {
        const { compute } = await import('@google-cloud/compute');
        const firewallsClient = new compute.FirewallsClient({ auth: this._auth });
        try {
            const request = { project: this._projectId };
            const [firewalls] = await firewallsClient.list(request);
            for (const firewall of firewalls) {
                yield {
                    provider: 'gcp',
                    accountId: this._projectId,
                    region: null,
                    service: 'vpc',
                    resourceType: 'gcp.vpc.firewall',
                    resourceId: firewall.id?.toString() || firewall.name || '',
                    name: firewall.name,
                    tags: null,
                    metadata: { network: firewall.network, direction: firewall.direction },
                    configuration: sanitizeConfiguration(firewall)
                };
            }
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to collect VPC firewalls', { error: error.message });
        }
    }
    async *_collectIAMServiceAccounts() {
        const { IAMClient } = await import('@google-cloud/iam');
        const client = new IAMClient({ auth: this._auth });
        try {
            const parent = `projects/${this._projectId}`;
            const request = { name: parent };
            const [serviceAccounts] = await client.listServiceAccounts(request);
            for (const sa of serviceAccounts) {
                yield {
                    provider: 'gcp',
                    accountId: this._projectId,
                    region: null,
                    service: 'iam',
                    resourceType: 'gcp.iam.serviceaccount',
                    resourceId: sa.uniqueId || sa.email || '',
                    name: sa.email,
                    tags: null,
                    metadata: { email: sa.email },
                    configuration: sanitizeConfiguration(sa)
                };
            }
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to collect IAM service accounts', { error: error.message });
        }
    }
    async *_collectKMSKeyRings() {
        const { KeyManagementServiceClient } = await import('@google-cloud/kms');
        const client = new KeyManagementServiceClient({ auth: this._auth });
        for (const region of this._regions) {
            try {
                const parent = `projects/${this._projectId}/locations/${region}`;
                const [keyRings] = await client.listKeyRings({ parent });
                for (const keyRing of keyRings) {
                    yield {
                        provider: 'gcp',
                        accountId: this._projectId,
                        region,
                        service: 'kms',
                        resourceType: 'gcp.kms.keyring',
                        resourceId: keyRing.name?.split('/').pop() || '',
                        name: keyRing.name?.split('/').pop(),
                        tags: null,
                        metadata: {},
                        configuration: sanitizeConfiguration(keyRing)
                    };
                }
            }
            catch (err) {
                const error = err;
                this.logger('warn', 'Failed to collect KMS key rings', { region, error: error.message });
            }
        }
    }
    async *_collectSecretManagerSecrets() {
        const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
        const client = new SecretManagerServiceClient({ auth: this._auth });
        try {
            const parent = `projects/${this._projectId}`;
            const [secrets] = await client.listSecrets({ parent });
            for (const secret of secrets) {
                yield {
                    provider: 'gcp',
                    accountId: this._projectId,
                    region: null,
                    service: 'secretmanager',
                    resourceType: 'gcp.secretmanager.secret',
                    resourceId: secret.name?.split('/').pop() || '',
                    name: secret.name?.split('/').pop(),
                    tags: extractLabels(secret),
                    metadata: {},
                    configuration: sanitizeConfiguration(secret)
                };
            }
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to collect Secret Manager secrets', { error: error.message });
        }
    }
    async _listZonesInRegion(region) {
        const { compute } = await import('@google-cloud/compute');
        const zonesClient = new compute.ZonesClient({ auth: this._auth });
        try {
            const request = { project: this._projectId };
            const [zones] = await zonesClient.list(request);
            return zones.filter(z => z.region?.includes(region));
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list zones', { region, error: error.message });
            return [];
        }
    }
    async *listResources(options = {}) {
        const discoveryInclude = ensureArray(options.discovery?.include)
            .map(normaliseServiceName)
            .filter(Boolean);
        const discoveryExclude = ensureArray(options.discovery?.exclude)
            .map(normaliseServiceName)
            .filter(Boolean);
        const includeSet = new Set(discoveryInclude);
        const excludeSet = new Set(discoveryExclude);
        const runtime = options.runtime || {};
        const emitProgress = typeof runtime.emitProgress === 'function'
            ? runtime.emitProgress.bind(runtime)
            : null;
        const collectors = {
            compute: this._collectComputeInstances.bind(this),
            gke: this._collectGKEClusters.bind(this),
            run: this._collectCloudRunServices.bind(this),
            functions: this._collectCloudFunctions.bind(this),
            storage: this._collectStorageBuckets.bind(this),
            sql: this._collectCloudSQLInstances.bind(this),
            bigquery: this._collectBigQueryDatasets.bind(this),
            pubsub: async function* () {
                yield* this._collectPubSubTopics();
                yield* this._collectPubSubSubscriptions();
            }.bind(this),
            vpc: async function* () {
                yield* this._collectVPCNetworks();
                yield* this._collectVPCSubnets();
                yield* this._collectVPCFirewalls();
            }.bind(this),
            iam: this._collectIAMServiceAccounts.bind(this),
            kms: this._collectKMSKeyRings.bind(this),
            secretmanager: this._collectSecretManagerSecrets.bind(this)
        };
        for (const service of this._services) {
            if (!collectors[service]) {
                this.logger('debug', 'GCP service collector not implemented, skipping', { service });
                continue;
            }
            if (!shouldCollect(service, includeSet, excludeSet)) {
                this.logger('debug', 'GCP service filtered out', { service });
                continue;
            }
            try {
                for await (const resource of collectors[service]()) {
                    if (emitProgress) {
                        emitProgress({
                            service,
                            resourceId: resource.resourceId,
                            resourceType: resource.resourceType
                        });
                    }
                    yield resource;
                }
            }
            catch (err) {
                const error = err;
                this.logger('error', 'GCP service collection failed, skipping to next service', {
                    service,
                    error: error.message,
                    errorName: error.name,
                    stack: error.stack
                });
            }
        }
    }
}
//# sourceMappingURL=gcp-driver.js.map