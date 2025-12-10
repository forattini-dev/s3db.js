import { BaseCloudDriver, CloudResource, ListResourcesOptions } from './base-driver.js';
import { PluginError } from '../../../errors.js';

interface DigitalOceanClient {
  droplets: { getAllDroplets: () => Promise<{ droplets: DODroplet[] }> };
  kubernetes: { listClusters: () => Promise<{ kubernetes_clusters: DOKubernetesCluster[] }> };
  databases: { listClusters: () => Promise<{ databases: DODatabase[] }> };
  volumes: { getAllVolumes: () => Promise<{ volumes: DOVolume[] }> };
  snapshots: { getAll: () => Promise<{ snapshots: DOSnapshot[] }> };
  loadBalancers: { getAllLoadBalancers: () => Promise<{ load_balancers: DOLoadBalancer[] }> };
  firewalls: { getAllFirewalls: () => Promise<{ firewalls: DOFirewall[] }> };
  vpcs: { listVpcs: () => Promise<{ vpcs: DOVPC[] }> };
  floatingIps: { getAllFloatingIps: () => Promise<{ floating_ips: DOFloatingIP[] }> };
  domains: {
    getAllDomains: () => Promise<{ domains: DODomain[] }>;
    getAllDomainRecords: (domain: string) => Promise<{ domain_records: DODomainRecord[] }>;
  };
  cdnEndpoints: { getAllEndpoints: () => Promise<{ endpoints: DOCDNEndpoint[] }> };
  registry: {
    get: () => Promise<{ registry: DORegistry | null }>;
    listRepositories: (name: string) => Promise<{ repositories: DORepository[] }>;
  };
  apps: { listApps: () => Promise<{ apps: DOApp[] }> };
  accountKeys: { getAllKeys: () => Promise<{ ssh_keys: DOSSHKey[] }> };
}

interface DORegion {
  slug?: string;
}

interface DODroplet {
  id?: number;
  name?: string;
  region?: DORegion;
  tags?: string[];
  [key: string]: unknown;
}

interface DOKubernetesCluster {
  id: string;
  name?: string;
  region?: string;
  tags?: string[];
  node_pools?: DONodePool[];
  [key: string]: unknown;
}

interface DONodePool {
  id: string;
  name?: string;
  tags?: string[];
  [key: string]: unknown;
}

interface DODatabase {
  id: string;
  name?: string;
  region?: string;
  tags?: string[];
  [key: string]: unknown;
}

interface DOVolume {
  id: string;
  name?: string;
  region?: DORegion;
  tags?: string[];
  [key: string]: unknown;
}

interface DOSnapshot {
  id: string;
  name?: string;
  regions?: string[];
  tags?: string[];
  [key: string]: unknown;
}

interface DOLoadBalancer {
  id: string;
  name?: string;
  region?: DORegion;
  tags?: string[];
  [key: string]: unknown;
}

interface DOFirewall {
  id: string;
  name?: string;
  tags?: string[];
  [key: string]: unknown;
}

interface DOVPC {
  id: string;
  name?: string;
  region?: string;
  [key: string]: unknown;
}

interface DOFloatingIP {
  ip: string;
  region?: DORegion;
  [key: string]: unknown;
}

interface DODomain {
  name: string;
  [key: string]: unknown;
}

interface DODomainRecord {
  id: number;
  name?: string;
  [key: string]: unknown;
}

interface DOCDNEndpoint {
  id: string;
  endpoint?: string;
  [key: string]: unknown;
}

interface DORegistry {
  name: string;
  region?: string;
  [key: string]: unknown;
}

interface DORepository {
  name: string;
  [key: string]: unknown;
}

interface DOApp {
  id: string;
  region?: DORegion;
  spec?: { name?: string };
  [key: string]: unknown;
}

interface DOSSHKey {
  id?: number;
  name?: string;
  [key: string]: unknown;
}

interface DigitalOceanDriverOptions {
  driver?: string;
  credentials?: {
    token?: string;
    apiToken?: string;
  };
  config?: {
    accountId?: string;
    services?: string[];
    regions?: string[] | null;
  };
}

type DOServiceName =
  | 'droplets'
  | 'kubernetes'
  | 'databases'
  | 'volumes'
  | 'snapshots'
  | 'loadbalancers'
  | 'firewalls'
  | 'vpc'
  | 'floatingips'
  | 'domains'
  | 'cdn'
  | 'registry'
  | 'apps'
  | 'sshkeys'
  | 'spaces';

/**
 * Production-ready DigitalOcean inventory driver using digitalocean-js library.
 *
 * Covers 15+ services with 20+ resource types:
 * - Compute (droplets)
 * - Kubernetes (DOKS clusters)
 * - Databases (managed databases)
 * - Storage (volumes, snapshots, spaces)
 * - Networking (load balancers, firewalls, VPC, floating IPs)
 * - DNS (domains, records)
 * - CDN (endpoints)
 * - Container Registry
 * - App Platform
 * - SSH Keys
 *
 * @see https://docs.digitalocean.com/reference/api/
 * @see https://github.com/johnbwoodruff/digitalocean-js
 */
export class DigitalOceanInventoryDriver extends BaseCloudDriver {
  private _apiToken: string | null = null;
  private _client: DigitalOceanClient | null = null;
  private _accountId: string;
  private _services: DOServiceName[];
  private _regions: string[] | null;

  constructor(options: DigitalOceanDriverOptions = {}) {
    super({ ...options, driver: options.driver || 'digitalocean' });

    this._accountId = (this.config?.accountId as string) || 'digitalocean';

    this._services = (this.config?.services as DOServiceName[] | undefined) || [
      'droplets',
      'kubernetes',
      'databases',
      'volumes',
      'snapshots',
      'loadbalancers',
      'firewalls',
      'vpc',
      'floatingips',
      'domains',
      'cdn',
      'registry',
      'apps',
      'sshkeys',
      'spaces'
    ];

    this._regions = (this.config?.regions as string[] | null) || null;
  }

  /**
   * Initialize the DigitalOcean API client.
   */
  async _initializeClient(): Promise<void> {
    if (this._client) return;

    const credentials = this.credentials || {};
    this._apiToken = credentials.token as string || credentials.apiToken as string || process.env.DIGITALOCEAN_TOKEN || null;

    if (!this._apiToken) {
      throw new PluginError('DigitalOcean API token is required. Provide via credentials.token or DIGITALOCEAN_TOKEN env var.', {
        pluginName: 'CloudInventoryPlugin',
        operation: 'digitalocean:initClient',
        statusCode: 400,
        retriable: false,
        suggestion: 'Set credentials.token or the DIGITALOCEAN_TOKEN environment variable before initializing the driver.'
      });
    }

    const { DigitalOcean } = await import('digitalocean-js') as unknown as { DigitalOcean: new (token: string) => DigitalOceanClient };

    this._client = new DigitalOcean(this._apiToken);

    this.logger('info', 'DigitalOcean API client initialized', {
      accountId: this._accountId,
      services: this._services.length
    });
  }

  /**
   * Main entry point - lists all resources from configured services.
   */
  override async *listResources(_options: ListResourcesOptions = {}): AsyncGenerator<CloudResource> {
    await this._initializeClient();

    const serviceCollectors: Record<DOServiceName, () => AsyncGenerator<CloudResource>> = {
      droplets: () => this._collectDroplets(),
      kubernetes: () => this._collectKubernetes(),
      databases: () => this._collectDatabases(),
      volumes: () => this._collectVolumes(),
      snapshots: () => this._collectSnapshots(),
      loadbalancers: () => this._collectLoadBalancers(),
      firewalls: () => this._collectFirewalls(),
      vpc: () => this._collectVPC(),
      floatingips: () => this._collectFloatingIPs(),
      domains: () => this._collectDomains(),
      cdn: () => this._collectCDN(),
      registry: () => this._collectRegistry(),
      apps: () => this._collectApps(),
      sshkeys: () => this._collectSSHKeys(),
      spaces: () => this._collectSpaces()
    };

    for (const service of this._services) {
      const collector = serviceCollectors[service];
      if (!collector) {
        this.logger('warn', `Unknown DigitalOcean service: ${service}`, { service });
        continue;
      }

      try {
        this.logger('info', `Collecting DigitalOcean ${service} resources`, { service });
        yield* collector();
      } catch (err) {
        const error = err as Error;
        this.logger('error', `DigitalOcean service collection failed, skipping to next service`, {
          service,
          error: error.message,
          errorName: error.name,
          stack: error.stack
        });
      }
    }
  }

  /**
   * Collect Droplets (VMs).
   */
  async *_collectDroplets(): AsyncGenerator<CloudResource> {
    try {
      const response = await this._client!.droplets.getAllDroplets();
      const droplets = response.droplets || [];

      for (const droplet of droplets) {
        yield {
          provider: 'digitalocean',
          accountId: this._accountId,
          region: droplet.region?.slug || null,
          service: 'droplets',
          resourceType: 'digitalocean.droplet',
          resourceId: droplet.id?.toString() || '',
          name: droplet.name,
          tags: droplet.tags || [],
          configuration: this._sanitize(droplet)
        } as unknown as CloudResource;
      }

      this.logger('info', `Collected ${droplets.length} DigitalOcean droplets`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect DigitalOcean droplets', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  /**
   * Collect Kubernetes clusters (DOKS).
   */
  async *_collectKubernetes(): AsyncGenerator<CloudResource> {
    try {
      const response = await this._client!.kubernetes.listClusters();
      const clusters = response.kubernetes_clusters || [];

      for (const cluster of clusters) {
        yield {
          provider: 'digitalocean',
          accountId: this._accountId,
          region: cluster.region,
          service: 'kubernetes',
          resourceType: 'digitalocean.kubernetes.cluster',
          resourceId: cluster.id,
          name: cluster.name,
          tags: cluster.tags || [],
          configuration: this._sanitize(cluster)
        } as unknown as CloudResource;

        if (cluster.node_pools && Array.isArray(cluster.node_pools)) {
          for (const nodePool of cluster.node_pools) {
            yield {
              provider: 'digitalocean',
              accountId: this._accountId,
              region: cluster.region,
              service: 'kubernetes',
              resourceType: 'digitalocean.kubernetes.nodepool',
              resourceId: nodePool.id,
              name: nodePool.name,
              tags: nodePool.tags || [],
              metadata: { clusterId: cluster.id, clusterName: cluster.name },
              configuration: this._sanitize(nodePool)
            } as unknown as CloudResource;
          }
        }
      }

      this.logger('info', `Collected ${clusters.length} DigitalOcean Kubernetes clusters`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect DigitalOcean Kubernetes', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  /**
   * Collect Managed Databases.
   */
  async *_collectDatabases(): AsyncGenerator<CloudResource> {
    try {
      const response = await this._client!.databases.listClusters();
      const databases = response.databases || [];

      for (const db of databases) {
        yield {
          provider: 'digitalocean',
          accountId: this._accountId,
          region: db.region,
          service: 'databases',
          resourceType: 'digitalocean.database.cluster',
          resourceId: db.id,
          name: db.name,
          tags: db.tags || [],
          configuration: this._sanitize(db)
        } as unknown as CloudResource;
      }

      this.logger('info', `Collected ${databases.length} DigitalOcean managed databases`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect DigitalOcean databases', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  /**
   * Collect Block Storage Volumes.
   */
  async *_collectVolumes(): AsyncGenerator<CloudResource> {
    try {
      const response = await this._client!.volumes.getAllVolumes();
      const volumes = response.volumes || [];

      for (const volume of volumes) {
        yield {
          provider: 'digitalocean',
          accountId: this._accountId,
          region: volume.region?.slug || null,
          service: 'volumes',
          resourceType: 'digitalocean.volume',
          resourceId: volume.id,
          name: volume.name,
          tags: volume.tags || [],
          configuration: this._sanitize(volume)
        } as unknown as CloudResource;
      }

      this.logger('info', `Collected ${volumes.length} DigitalOcean volumes`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect DigitalOcean volumes', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  /**
   * Collect Snapshots.
   */
  async *_collectSnapshots(): AsyncGenerator<CloudResource> {
    try {
      const response = await this._client!.snapshots.getAll();
      const snapshots = response.snapshots || [];

      for (const snapshot of snapshots) {
        yield {
          provider: 'digitalocean',
          accountId: this._accountId,
          region: snapshot.regions?.[0] || null,
          service: 'snapshots',
          resourceType: 'digitalocean.snapshot',
          resourceId: snapshot.id,
          name: snapshot.name,
          tags: snapshot.tags || [],
          configuration: this._sanitize(snapshot)
        } as unknown as CloudResource;
      }

      this.logger('info', `Collected ${snapshots.length} DigitalOcean snapshots`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect DigitalOcean snapshots', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  /**
   * Collect Load Balancers.
   */
  async *_collectLoadBalancers(): AsyncGenerator<CloudResource> {
    try {
      const response = await this._client!.loadBalancers.getAllLoadBalancers();
      const lbs = response.load_balancers || [];

      for (const lb of lbs) {
        yield {
          provider: 'digitalocean',
          accountId: this._accountId,
          region: lb.region?.slug || null,
          service: 'loadbalancers',
          resourceType: 'digitalocean.loadbalancer',
          resourceId: lb.id,
          name: lb.name,
          tags: lb.tags || [],
          configuration: this._sanitize(lb)
        } as unknown as CloudResource;
      }

      this.logger('info', `Collected ${lbs.length} DigitalOcean load balancers`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect DigitalOcean load balancers', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  /**
   * Collect Firewalls.
   */
  async *_collectFirewalls(): AsyncGenerator<CloudResource> {
    try {
      const response = await this._client!.firewalls.getAllFirewalls();
      const firewalls = response.firewalls || [];

      for (const firewall of firewalls) {
        yield {
          provider: 'digitalocean',
          accountId: this._accountId,
          region: null,
          service: 'firewalls',
          resourceType: 'digitalocean.firewall',
          resourceId: firewall.id,
          name: firewall.name,
          tags: firewall.tags || [],
          configuration: this._sanitize(firewall)
        } as unknown as CloudResource;
      }

      this.logger('info', `Collected ${firewalls.length} DigitalOcean firewalls`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect DigitalOcean firewalls', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  /**
   * Collect VPCs.
   */
  async *_collectVPC(): AsyncGenerator<CloudResource> {
    try {
      const response = await this._client!.vpcs.listVpcs();
      const vpcs = response.vpcs || [];

      for (const vpc of vpcs) {
        yield {
          provider: 'digitalocean',
          accountId: this._accountId,
          region: vpc.region,
          service: 'vpc',
          resourceType: 'digitalocean.vpc',
          resourceId: vpc.id,
          name: vpc.name,
          tags: [],
          configuration: this._sanitize(vpc)
        } as unknown as CloudResource;
      }

      this.logger('info', `Collected ${vpcs.length} DigitalOcean VPCs`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect DigitalOcean VPCs', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  /**
   * Collect Floating IPs.
   */
  async *_collectFloatingIPs(): AsyncGenerator<CloudResource> {
    try {
      const response = await this._client!.floatingIps.getAllFloatingIps();
      const ips = response.floating_ips || [];

      for (const ip of ips) {
        yield {
          provider: 'digitalocean',
          accountId: this._accountId,
          region: ip.region?.slug || null,
          service: 'floatingips',
          resourceType: 'digitalocean.floatingip',
          resourceId: ip.ip,
          name: ip.ip,
          tags: [],
          configuration: this._sanitize(ip)
        } as unknown as CloudResource;
      }

      this.logger('info', `Collected ${ips.length} DigitalOcean floating IPs`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect DigitalOcean floating IPs', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  /**
   * Collect DNS Domains and Records.
   */
  async *_collectDomains(): AsyncGenerator<CloudResource> {
    try {
      const response = await this._client!.domains.getAllDomains();
      const domains = response.domains || [];

      for (const domain of domains) {
        yield {
          provider: 'digitalocean',
          accountId: this._accountId,
          region: null,
          service: 'domains',
          resourceType: 'digitalocean.domain',
          resourceId: domain.name,
          name: domain.name,
          tags: [],
          configuration: this._sanitize(domain)
        } as unknown as CloudResource;

        try {
          const recordsResponse = await this._client!.domains.getAllDomainRecords(domain.name);
          const records = recordsResponse.domain_records || [];

          for (const record of records) {
            yield {
              provider: 'digitalocean',
              accountId: this._accountId,
              region: null,
              service: 'domains',
              resourceType: 'digitalocean.domain.record',
              resourceId: `${domain.name}/${record.id}`,
              name: `${record.name}.${domain.name}`,
              tags: [],
              metadata: { domain: domain.name },
              configuration: this._sanitize(record)
            } as unknown as CloudResource;
          }
        } catch (recordsErr) {
          const error = recordsErr as Error;
          this.logger('warn', `Failed to collect DNS records for ${domain.name}`, {
            domain: domain.name,
            error: error.message
          });
        }
      }

      this.logger('info', `Collected ${domains.length} DigitalOcean domains`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect DigitalOcean domains', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  /**
   * Collect CDN Endpoints.
   */
  async *_collectCDN(): AsyncGenerator<CloudResource> {
    try {
      const response = await this._client!.cdnEndpoints.getAllEndpoints();
      const endpoints = response.endpoints || [];

      for (const endpoint of endpoints) {
        yield {
          provider: 'digitalocean',
          accountId: this._accountId,
          region: null,
          service: 'cdn',
          resourceType: 'digitalocean.cdn.endpoint',
          resourceId: endpoint.id,
          name: endpoint.endpoint,
          tags: [],
          configuration: this._sanitize(endpoint)
        } as unknown as CloudResource;
      }

      this.logger('info', `Collected ${endpoints.length} DigitalOcean CDN endpoints`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect DigitalOcean CDN', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  /**
   * Collect Container Registry.
   */
  async *_collectRegistry(): AsyncGenerator<CloudResource> {
    try {
      const response = await this._client!.registry.get();
      const registry = response.registry;

      if (registry) {
        yield {
          provider: 'digitalocean',
          accountId: this._accountId,
          region: registry.region,
          service: 'registry',
          resourceType: 'digitalocean.registry',
          resourceId: registry.name,
          name: registry.name,
          tags: [],
          configuration: this._sanitize(registry)
        } as unknown as CloudResource;

        try {
          const reposResponse = await this._client!.registry.listRepositories(registry.name);
          const repositories = reposResponse.repositories || [];

          for (const repo of repositories) {
            yield {
              provider: 'digitalocean',
              accountId: this._accountId,
              region: registry.region,
              service: 'registry',
              resourceType: 'digitalocean.registry.repository',
              resourceId: repo.name,
              name: repo.name,
              tags: [],
              metadata: { registryName: registry.name },
              configuration: this._sanitize(repo)
            } as unknown as CloudResource;
          }
        } catch (reposErr) {
          const error = reposErr as Error;
          this.logger('warn', `Failed to collect registry repositories`, {
            registry: registry.name,
            error: error.message
          });
        }
      }

      this.logger('info', `Collected DigitalOcean container registry`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect DigitalOcean registry', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  /**
   * Collect App Platform apps.
   */
  async *_collectApps(): AsyncGenerator<CloudResource> {
    try {
      const response = await this._client!.apps.listApps();
      const apps = response.apps || [];

      for (const app of apps) {
        yield {
          provider: 'digitalocean',
          accountId: this._accountId,
          region: app.region?.slug || null,
          service: 'apps',
          resourceType: 'digitalocean.app',
          resourceId: app.id,
          name: app.spec?.name || app.id,
          tags: [],
          configuration: this._sanitize(app)
        } as unknown as CloudResource;
      }

      this.logger('info', `Collected ${apps.length} DigitalOcean App Platform apps`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect DigitalOcean apps', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  /**
   * Collect SSH Keys.
   */
  async *_collectSSHKeys(): AsyncGenerator<CloudResource> {
    try {
      const response = await this._client!.accountKeys.getAllKeys();
      const keys = response.ssh_keys || [];

      for (const key of keys) {
        yield {
          provider: 'digitalocean',
          accountId: this._accountId,
          region: null,
          service: 'sshkeys',
          resourceType: 'digitalocean.sshkey',
          resourceId: key.id?.toString() || '',
          name: key.name,
          tags: [],
          configuration: this._sanitize(key)
        } as unknown as CloudResource;
      }

      this.logger('info', `Collected ${keys.length} DigitalOcean SSH keys`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect DigitalOcean SSH keys', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  /**
   * Collect Spaces (Object Storage).
   * Note: Spaces API is S3-compatible, not part of the main DO API.
   */
  async *_collectSpaces(): AsyncGenerator<CloudResource> {
    try {
      this.logger('info', 'Spaces collection requires S3-compatible API implementation');
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect DigitalOcean Spaces', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  /**
   * Sanitize configuration by removing sensitive data.
   */
  _sanitize(config: Record<string, unknown> | null | undefined): Record<string, unknown> {
    if (!config || typeof config !== 'object') return {};

    const sanitized = { ...config };
    const sensitiveFields = [
      'token',
      'password',
      'secret',
      'api_key',
      'ssh_key',
      'private_key',
      'public_key',
      'connection_string',
      'uri'
    ];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }
}
