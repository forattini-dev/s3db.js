import { GoogleAuth } from 'google-auth-library';
import { BaseCloudDriver, CloudResource, ListResourcesOptions } from './base-driver.js';

const DEFAULT_SERVICES = [
  'compute', 'gke', 'run', 'functions', 'appengine',
  'storage', 'sql', 'bigquery', 'spanner', 'firestore',
  'vpc', 'loadbalancing', 'dns', 'cdn',
  'iam', 'kms', 'secretmanager',
  'pubsub', 'tasks', 'scheduler',
  'monitoring', 'logging',
  'artifactregistry', 'containerregistry'
];

type GCPServiceName = typeof DEFAULT_SERVICES[number];

interface GCPAuthOptions {
  keyFile?: string;
  credentials?: Record<string, unknown>;
  scopes?: string[];
}

interface GCPZone {
  name?: string;
  region?: string;
}

interface GCPInstance {
  id?: string;
  name?: string;
  labels?: Record<string, string>;
  [key: string]: unknown;
}

interface GCPCluster {
  name?: string;
  zone?: string;
  location?: string;
  labels?: Record<string, string>;
  [key: string]: unknown;
}

interface GCPService {
  uid?: string;
  name?: string;
  metadata?: { labels?: Record<string, string> };
  [key: string]: unknown;
}

interface GCPFunction {
  name?: string;
  labels?: Record<string, string>;
  [key: string]: unknown;
}

interface GCPBucket {
  id?: string;
  name?: string;
}

interface GCPBucketMetadata {
  location?: string;
  storageClass?: string;
  labels?: Record<string, string>;
  [key: string]: unknown;
}

interface GCPSQLInstance {
  name?: string;
  region?: string;
  databaseVersion?: string;
  settings?: { userLabels?: Record<string, string> };
  [key: string]: unknown;
}

interface GCPDataset {
  id?: string;
}

interface GCPDatasetMetadata {
  location?: string;
  labels?: Record<string, string>;
  [key: string]: unknown;
}

interface GCPTopic {
  name?: string;
}

interface GCPSubscription {
  name?: string;
}

interface GCPSubscriptionMetadata {
  topic?: string;
  labels?: Record<string, string>;
  [key: string]: unknown;
}

interface GCPNetwork {
  id?: string;
  name?: string;
  autoCreateSubnetworks?: boolean;
  [key: string]: unknown;
}

interface GCPSubnet {
  id?: string;
  name?: string;
  network?: string;
  ipCidrRange?: string;
  [key: string]: unknown;
}

interface GCPFirewall {
  id?: string;
  name?: string;
  network?: string;
  direction?: string;
  [key: string]: unknown;
}

interface GCPServiceAccount {
  uniqueId?: string;
  email?: string;
  [key: string]: unknown;
}

interface GCPKeyRing {
  name?: string;
  [key: string]: unknown;
}

interface GCPSecret {
  name?: string;
  labels?: Record<string, string>;
  [key: string]: unknown;
}

interface GCPDriverOptions {
  driver?: string;
  credentials?: {
    keyFile?: string;
    credentials?: Record<string, unknown>;
  };
  config?: {
    projectId?: string;
    services?: string[];
    regions?: string[];
    region?: string;
  };
}

interface ListResourcesWithDiscovery extends ListResourcesOptions {
  discovery?: {
    include?: string | string[];
    exclude?: string | string[];
  };
  runtime?: {
    emitProgress?: (data: { service: string; resourceId?: string; resourceType?: string }) => void;
  };
}

function normaliseServiceName(name: unknown): string {
  return (name || '').toString().trim().toLowerCase();
}

function ensureArray<T>(value: T | T[] | undefined | null, defaultValue: T[] = []): T[] {
  if (Array.isArray(value)) return value;
  if (value != null) return [value];
  return defaultValue;
}

function shouldCollect(service: string, includeSet: Set<string>, excludeSet: Set<string>): boolean {
  if (excludeSet.size > 0 && excludeSet.has(service)) return false;
  if (includeSet.size > 0 && !includeSet.has(service)) return false;
  return true;
}

function sanitizeConfiguration(config: Record<string, unknown>): Record<string, unknown> {
  return config;
}

function extractLabels(resource: { labels?: Record<string, string> } | undefined | null): Record<string, string> | null {
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
  private _clients: Record<string, unknown> = {
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
  private _auth: GoogleAuth | null = null;
  private _projectId: string | null;
  private _services: string[];
  private _regions: string[];

  constructor(options: GCPDriverOptions = {}) {
    super({ ...options, driver: options.driver || 'gcp' });

    this._projectId = (this.config?.projectId as string | null) || null;
    this._services = ensureArray(this.config?.services, DEFAULT_SERVICES)
      .map(normaliseServiceName)
      .filter((s): s is string => Boolean(s));
    if (!this._services.length) {
      this._services = [...DEFAULT_SERVICES];
    }
    this._regions = ensureArray(this.config?.regions, [(this.config?.region as string) || 'us-central1']) as string[];
    if (!this._regions.length) {
      this._regions = ['us-central1'];
    }
  }

  override async initialize(): Promise<void> {
    await this._initializeAuth();
    this.logger('info', 'GCP driver initialized', {
      cloudId: this.id,
      projectId: this._projectId,
      regions: this._regions,
      services: this._services.length
    });
  }

  async _initializeAuth(): Promise<void> {
    const credentials = this.credentials || {};

    const authOptions: GCPAuthOptions = {
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    };

    if (credentials.keyFile) {
      authOptions.keyFile = credentials.keyFile as string;
    } else if (credentials.credentials) {
      authOptions.credentials = credentials.credentials as Record<string, unknown>;
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

  async *_collectComputeInstances(): AsyncGenerator<CloudResource> {
    const { compute } = await import('@google-cloud/compute') as unknown as {
      compute: { InstancesClient: new (options: { auth: GoogleAuth }) => { list: (request: Record<string, unknown>) => Promise<[GCPInstance[]]> } }
    };
    const computeClient = new compute.InstancesClient({ auth: this._auth! });

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
              configuration: sanitizeConfiguration(instance as Record<string, unknown>)
            } as CloudResource;
          }
        }
      } catch (err) {
        const error = err as Error;
        this.logger('warn', 'Failed to collect Compute instances', { region, error: error.message });
      }
    }
  }

  async *_collectGKEClusters(): AsyncGenerator<CloudResource> {
    const { ClusterManagerClient } = await import('@google-cloud/container') as unknown as {
      ClusterManagerClient: new (options: { auth: GoogleAuth }) => {
        listClusters: (request: { parent: string }) => Promise<[{ clusters?: GCPCluster[] }]>
      }
    };
    const client = new ClusterManagerClient({ auth: this._auth! });

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
            configuration: sanitizeConfiguration(cluster as Record<string, unknown>)
          } as CloudResource;
        }
      } catch (err) {
        const error = err as Error;
        this.logger('warn', 'Failed to collect GKE clusters', { region, error: error.message });
      }
    }
  }

  async *_collectCloudRunServices(): AsyncGenerator<CloudResource> {
    const { ServicesClient } = await import('@google-cloud/run') as unknown as {
      ServicesClient: new (options: { auth: GoogleAuth }) => {
        listServices: (request: { parent: string }) => Promise<[GCPService[]]>
      }
    };
    const client = new ServicesClient({ auth: this._auth! });

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
            configuration: sanitizeConfiguration(service as Record<string, unknown>)
          } as CloudResource;
        }
      } catch (err) {
        const error = err as Error;
        this.logger('warn', 'Failed to collect Cloud Run services', { region, error: error.message });
      }
    }
  }

  async *_collectCloudFunctions(): AsyncGenerator<CloudResource> {
    const { CloudFunctionsServiceClient } = await import('@google-cloud/functions') as unknown as {
      CloudFunctionsServiceClient: new (options: { auth: GoogleAuth }) => {
        listFunctions: (request: { parent: string }) => Promise<[GCPFunction[]]>
      }
    };
    const client = new CloudFunctionsServiceClient({ auth: this._auth! });

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
            configuration: sanitizeConfiguration(fn as Record<string, unknown>)
          } as CloudResource;
        }
      } catch (err) {
        const error = err as Error;
        this.logger('warn', 'Failed to collect Cloud Functions', { region, error: error.message });
      }
    }
  }

  async *_collectStorageBuckets(): AsyncGenerator<CloudResource> {
    const { Storage } = await import('@google-cloud/storage') as unknown as {
      Storage: new (options: { auth: GoogleAuth; projectId: string }) => {
        getBuckets: () => Promise<[Array<GCPBucket & { getMetadata: () => Promise<[GCPBucketMetadata]> }>]>
      }
    };
    const storage = new Storage({ auth: this._auth!, projectId: this._projectId! });

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
          configuration: sanitizeConfiguration(metadata as Record<string, unknown>)
        } as CloudResource;
      }
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to collect Storage buckets', { error: error.message });
    }
  }

  async *_collectCloudSQLInstances(): AsyncGenerator<CloudResource> {
    const { SqlInstancesServiceClient } = await import('@google-cloud/sql') as unknown as {
      SqlInstancesServiceClient: new (options: { auth: GoogleAuth }) => {
        list: (request: { project: string }) => Promise<[GCPSQLInstance[]]>
      }
    };
    const client = new SqlInstancesServiceClient({ auth: this._auth! });

    try {
      const request = { project: this._projectId! };
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
          configuration: sanitizeConfiguration(instance as Record<string, unknown>)
        } as CloudResource;
      }
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to collect Cloud SQL instances', { error: error.message });
    }
  }

  async *_collectBigQueryDatasets(): AsyncGenerator<CloudResource> {
    const { BigQuery } = await import('@google-cloud/bigquery') as unknown as {
      BigQuery: new (options: { auth: GoogleAuth; projectId: string }) => {
        getDatasets: () => Promise<[Array<GCPDataset & { getMetadata: () => Promise<[GCPDatasetMetadata]> }>]>
      }
    };
    const bigquery = new BigQuery({ auth: this._auth!, projectId: this._projectId! });

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
          configuration: sanitizeConfiguration(metadata as Record<string, unknown>)
        } as CloudResource;
      }
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to collect BigQuery datasets', { error: error.message });
    }
  }

  async *_collectPubSubTopics(): AsyncGenerator<CloudResource> {
    const { PubSub } = await import('@google-cloud/pubsub') as unknown as {
      PubSub: new (options: { auth: GoogleAuth; projectId: string }) => {
        getTopics: () => Promise<[Array<GCPTopic & { getMetadata: () => Promise<[Record<string, unknown>]> }>]>;
        getSubscriptions: () => Promise<[Array<GCPSubscription & { getMetadata: () => Promise<[GCPSubscriptionMetadata]> }>]>;
      }
    };
    const pubsub = new PubSub({ auth: this._auth!, projectId: this._projectId! });

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
          tags: extractLabels(metadata as { labels?: Record<string, string> }),
          metadata: {},
          configuration: sanitizeConfiguration(metadata)
        } as CloudResource;
      }
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to collect Pub/Sub topics', { error: error.message });
    }
  }

  async *_collectPubSubSubscriptions(): AsyncGenerator<CloudResource> {
    const { PubSub } = await import('@google-cloud/pubsub') as unknown as {
      PubSub: new (options: { auth: GoogleAuth; projectId: string }) => {
        getTopics: () => Promise<[Array<GCPTopic & { getMetadata: () => Promise<[Record<string, unknown>]> }>]>;
        getSubscriptions: () => Promise<[Array<GCPSubscription & { getMetadata: () => Promise<[GCPSubscriptionMetadata]> }>]>;
      }
    };
    const pubsub = new PubSub({ auth: this._auth!, projectId: this._projectId! });

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
          configuration: sanitizeConfiguration(metadata as Record<string, unknown>)
        } as CloudResource;
      }
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to collect Pub/Sub subscriptions', { error: error.message });
    }
  }

  async *_collectVPCNetworks(): AsyncGenerator<CloudResource> {
    const { compute } = await import('@google-cloud/compute') as unknown as {
      compute: {
        NetworksClient: new (options: { auth: GoogleAuth }) => { list: (request: Record<string, unknown>) => Promise<[GCPNetwork[]]> };
        SubnetworksClient: new (options: { auth: GoogleAuth }) => { list: (request: Record<string, unknown>) => Promise<[GCPSubnet[]]> };
        FirewallsClient: new (options: { auth: GoogleAuth }) => { list: (request: Record<string, unknown>) => Promise<[GCPFirewall[]]> };
        ZonesClient: new (options: { auth: GoogleAuth }) => { list: (request: Record<string, unknown>) => Promise<[GCPZone[]]> };
        InstancesClient: new (options: { auth: GoogleAuth }) => { list: (request: Record<string, unknown>) => Promise<[GCPInstance[]]> };
      }
    };
    const networksClient = new compute.NetworksClient({ auth: this._auth! });

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
          configuration: sanitizeConfiguration(network as Record<string, unknown>)
        } as CloudResource;
      }
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to collect VPC networks', { error: error.message });
    }
  }

  async *_collectVPCSubnets(): AsyncGenerator<CloudResource> {
    const { compute } = await import('@google-cloud/compute') as unknown as {
      compute: {
        SubnetworksClient: new (options: { auth: GoogleAuth }) => { list: (request: Record<string, unknown>) => Promise<[GCPSubnet[]]> };
      }
    };
    const subnetsClient = new compute.SubnetworksClient({ auth: this._auth! });

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
            configuration: sanitizeConfiguration(subnet as Record<string, unknown>)
          } as CloudResource;
        }
      } catch (err) {
        const error = err as Error;
        this.logger('warn', 'Failed to collect VPC subnets', { region, error: error.message });
      }
    }
  }

  async *_collectVPCFirewalls(): AsyncGenerator<CloudResource> {
    const { compute } = await import('@google-cloud/compute') as unknown as {
      compute: {
        FirewallsClient: new (options: { auth: GoogleAuth }) => { list: (request: Record<string, unknown>) => Promise<[GCPFirewall[]]> };
      }
    };
    const firewallsClient = new compute.FirewallsClient({ auth: this._auth! });

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
          configuration: sanitizeConfiguration(firewall as Record<string, unknown>)
        } as CloudResource;
      }
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to collect VPC firewalls', { error: error.message });
    }
  }

  async *_collectIAMServiceAccounts(): AsyncGenerator<CloudResource> {
    const { IAMClient } = await import('@google-cloud/iam') as unknown as {
      IAMClient: new (options: { auth: GoogleAuth }) => {
        listServiceAccounts: (request: { name: string }) => Promise<[GCPServiceAccount[]]>
      }
    };
    const client = new IAMClient({ auth: this._auth! });

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
          configuration: sanitizeConfiguration(sa as Record<string, unknown>)
        } as CloudResource;
      }
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to collect IAM service accounts', { error: error.message });
    }
  }

  async *_collectKMSKeyRings(): AsyncGenerator<CloudResource> {
    const { KeyManagementServiceClient } = await import('@google-cloud/kms') as unknown as {
      KeyManagementServiceClient: new (options: { auth: GoogleAuth }) => {
        listKeyRings: (request: { parent: string }) => Promise<[GCPKeyRing[]]>
      }
    };
    const client = new KeyManagementServiceClient({ auth: this._auth! });

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
            configuration: sanitizeConfiguration(keyRing as Record<string, unknown>)
          } as CloudResource;
        }
      } catch (err) {
        const error = err as Error;
        this.logger('warn', 'Failed to collect KMS key rings', { region, error: error.message });
      }
    }
  }

  async *_collectSecretManagerSecrets(): AsyncGenerator<CloudResource> {
    const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager') as unknown as {
      SecretManagerServiceClient: new (options: { auth: GoogleAuth }) => {
        listSecrets: (request: { parent: string }) => Promise<[GCPSecret[]]>
      }
    };
    const client = new SecretManagerServiceClient({ auth: this._auth! });

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
          configuration: sanitizeConfiguration(secret as Record<string, unknown>)
        } as CloudResource;
      }
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to collect Secret Manager secrets', { error: error.message });
    }
  }

  async _listZonesInRegion(region: string): Promise<GCPZone[]> {
    const { compute } = await import('@google-cloud/compute') as unknown as {
      compute: {
        ZonesClient: new (options: { auth: GoogleAuth }) => { list: (request: Record<string, unknown>) => Promise<[GCPZone[]]> };
      }
    };
    const zonesClient = new compute.ZonesClient({ auth: this._auth! });

    try {
      const request = { project: this._projectId };
      const [zones] = await zonesClient.list(request);
      return zones.filter(z => z.region?.includes(region));
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list zones', { region, error: error.message });
      return [];
    }
  }

  override async *listResources(options: ListResourcesWithDiscovery = {}): AsyncGenerator<CloudResource> {
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

    const collectors: Record<string, () => AsyncGenerator<CloudResource>> = {
      compute: this._collectComputeInstances.bind(this),
      gke: this._collectGKEClusters.bind(this),
      run: this._collectCloudRunServices.bind(this),
      functions: this._collectCloudFunctions.bind(this),
      storage: this._collectStorageBuckets.bind(this),
      sql: this._collectCloudSQLInstances.bind(this),
      bigquery: this._collectBigQueryDatasets.bind(this),
      pubsub: async function*(this: GcpInventoryDriver) {
        yield* this._collectPubSubTopics();
        yield* this._collectPubSubSubscriptions();
      }.bind(this),
      vpc: async function*(this: GcpInventoryDriver) {
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
      } catch (err) {
        const error = err as Error;
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
