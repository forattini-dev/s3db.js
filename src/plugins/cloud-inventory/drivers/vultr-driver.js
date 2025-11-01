import { BaseCloudDriver } from './base-driver.js';
import { PluginError } from '../../../errors.js';

/**
 * Production-ready Vultr inventory driver using official @vultr/vultr-node SDK.
 *
 * Covers 12+ services with 15+ resource types:
 * - Compute (instances, bare metal)
 * - Kubernetes (VKE clusters)
 * - Storage (block storage, snapshots, object storage)
 * - Networking (load balancers, firewalls, VPC)
 * - DNS (domains, records)
 * - Databases (managed databases)
 * - SSH Keys
 *
 * @see https://www.vultr.com/api/
 * @see https://github.com/vultr/vultr-node
 */
export class VultrInventoryDriver extends BaseCloudDriver {
  constructor(options = {}) {
    super({ ...options, driver: options.driver || 'vultr' });

    this._apiKey = null;
    this._client = null;
    this._accountId = this.config?.accountId || 'vultr';

    // Services to collect (can be filtered via config.services)
    this._services = this.config?.services || [
      'instances',
      'baremetal',
      'kubernetes',
      'blockstorage',
      'snapshots',
      'loadbalancers',
      'firewalls',
      'vpc',
      'dns',
      'databases',
      'sshkeys',
      'objectstorage'
    ];
  }

  /**
   * Initialize the Vultr API client.
   */
  async _initializeClient() {
    if (this._client) return;

    const credentials = this.credentials || {};
    this._apiKey = credentials.apiKey || credentials.token || process.env.VULTR_API_KEY;

    if (!this._apiKey) {
      throw new PluginError('Vultr API key is required. Provide via credentials.apiKey or VULTR_API_KEY env var.', {
        pluginName: 'CloudInventoryPlugin',
        operation: 'vultr:initClient',
        statusCode: 400,
        retriable: false,
        suggestion: 'Set credentials.apiKey or the VULTR_API_KEY environment variable before initializing the driver.'
      });
    }

    // Lazy import to keep core package lightweight
    const { VultrNode } = await import('@vultr/vultr-node');

    this._client = VultrNode.initialize({ apiKey: this._apiKey });

    this.logger('info', 'Vultr API client initialized', {
      accountId: this._accountId,
      services: this._services.length
    });
  }

  /**
   * Main entry point - lists all resources from configured services.
   */
  async *listResources(options = {}) {
    await this._initializeClient();

    const serviceCollectors = {
      instances: () => this._collectInstances(),
      baremetal: () => this._collectBareMetal(),
      kubernetes: () => this._collectKubernetes(),
      blockstorage: () => this._collectBlockStorage(),
      snapshots: () => this._collectSnapshots(),
      loadbalancers: () => this._collectLoadBalancers(),
      firewalls: () => this._collectFirewalls(),
      vpc: () => this._collectVPC(),
      dns: () => this._collectDNS(),
      databases: () => this._collectDatabases(),
      sshkeys: () => this._collectSSHKeys(),
      objectstorage: () => this._collectObjectStorage()
    };

    for (const service of this._services) {
      const collector = serviceCollectors[service];
      if (!collector) {
        this.logger('warn', `Unknown Vultr service: ${service}`, { service });
        continue;
      }

      try {
        this.logger('info', `Collecting Vultr ${service} resources`, { service });
        yield* collector();
      } catch (err) {
        // Continue with next service instead of failing entire sync
        this.logger('error', `Vultr service collection failed, skipping to next service`, {
          service,
          error: err.message,
          errorName: err.name,
          stack: err.stack
        });
      }
    }
  }

  /**
   * Collect Compute Instances (VPS).
   */
  async *_collectInstances() {
    try {
      const response = await this._client.instances.listInstances();
      const instances = response.instances || [];

      for (const instance of instances) {
        yield {
          provider: 'vultr',
          accountId: this._accountId,
          region: instance.region,
          service: 'instances',
          resourceType: 'vultr.compute.instance',
          resourceId: instance.id,
          name: instance.label || instance.hostname || instance.id,
          tags: instance.tags || [],
          configuration: this._sanitize(instance)
        };
      }

      this.logger('info', `Collected ${instances.length} Vultr instances`);
    } catch (err) {
      this.logger('error', 'Failed to collect Vultr instances', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Bare Metal servers.
   */
  async *_collectBareMetal() {
    try {
      const response = await this._client.bareMetal.listBareMetalServers();
      const servers = response.bare_metals || [];

      for (const server of servers) {
        yield {
          provider: 'vultr',
          accountId: this._accountId,
          region: server.region,
          service: 'baremetal',
          resourceType: 'vultr.baremetal.server',
          resourceId: server.id,
          name: server.label || server.id,
          tags: server.tags || [],
          configuration: this._sanitize(server)
        };
      }

      this.logger('info', `Collected ${servers.length} Vultr bare metal servers`);
    } catch (err) {
      this.logger('error', 'Failed to collect Vultr bare metal', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Kubernetes clusters (VKE).
   */
  async *_collectKubernetes() {
    try {
      const response = await this._client.kubernetes.listKubernetesClusters();
      const clusters = response.vke_clusters || [];

      for (const cluster of clusters) {
        yield {
          provider: 'vultr',
          accountId: this._accountId,
          region: cluster.region,
          service: 'kubernetes',
          resourceType: 'vultr.kubernetes.cluster',
          resourceId: cluster.id,
          name: cluster.label || cluster.id,
          tags: [],
          configuration: this._sanitize(cluster)
        };

        // Collect node pools
        try {
          const npResponse = await this._client.kubernetes.listNodePools({ 'vke-id': cluster.id });
          const nodePools = npResponse.node_pools || [];

          for (const nodePool of nodePools) {
            yield {
              provider: 'vultr',
              accountId: this._accountId,
              region: cluster.region,
              service: 'kubernetes',
              resourceType: 'vultr.kubernetes.nodepool',
              resourceId: nodePool.id,
              name: nodePool.label || nodePool.id,
              tags: [],
              metadata: { clusterId: cluster.id, clusterLabel: cluster.label },
              configuration: this._sanitize(nodePool)
            };
          }
        } catch (npErr) {
          this.logger('warn', `Failed to collect node pools for cluster ${cluster.id}`, {
            clusterId: cluster.id,
            error: npErr.message
          });
        }
      }

      this.logger('info', `Collected ${clusters.length} Vultr Kubernetes clusters`);
    } catch (err) {
      this.logger('error', 'Failed to collect Vultr Kubernetes', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Block Storage volumes.
   */
  async *_collectBlockStorage() {
    try {
      const response = await this._client.blockStorage.listBlockStorages();
      const volumes = response.blocks || [];

      for (const volume of volumes) {
        yield {
          provider: 'vultr',
          accountId: this._accountId,
          region: volume.region,
          service: 'blockstorage',
          resourceType: 'vultr.blockstorage.volume',
          resourceId: volume.id,
          name: volume.label || volume.id,
          tags: [],
          configuration: this._sanitize(volume)
        };
      }

      this.logger('info', `Collected ${volumes.length} Vultr block storage volumes`);
    } catch (err) {
      this.logger('error', 'Failed to collect Vultr block storage', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Snapshots.
   */
  async *_collectSnapshots() {
    try {
      const response = await this._client.snapshots.listSnapshots();
      const snapshots = response.snapshots || [];

      for (const snapshot of snapshots) {
        yield {
          provider: 'vultr',
          accountId: this._accountId,
          region: null, // Snapshots are global
          service: 'snapshots',
          resourceType: 'vultr.snapshot',
          resourceId: snapshot.id,
          name: snapshot.description || snapshot.id,
          tags: [],
          configuration: this._sanitize(snapshot)
        };
      }

      this.logger('info', `Collected ${snapshots.length} Vultr snapshots`);
    } catch (err) {
      this.logger('error', 'Failed to collect Vultr snapshots', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Load Balancers.
   */
  async *_collectLoadBalancers() {
    try {
      const response = await this._client.loadBalancers.listLoadBalancers();
      const lbs = response.load_balancers || [];

      for (const lb of lbs) {
        yield {
          provider: 'vultr',
          accountId: this._accountId,
          region: lb.region,
          service: 'loadbalancers',
          resourceType: 'vultr.loadbalancer',
          resourceId: lb.id,
          name: lb.label || lb.id,
          tags: [],
          configuration: this._sanitize(lb)
        };
      }

      this.logger('info', `Collected ${lbs.length} Vultr load balancers`);
    } catch (err) {
      this.logger('error', 'Failed to collect Vultr load balancers', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Firewall Groups.
   */
  async *_collectFirewalls() {
    try {
      const response = await this._client.firewalls.listFirewallGroups();
      const firewalls = response.firewall_groups || [];

      for (const firewall of firewalls) {
        yield {
          provider: 'vultr',
          accountId: this._accountId,
          region: null, // Firewalls are global
          service: 'firewalls',
          resourceType: 'vultr.firewall.group',
          resourceId: firewall.id,
          name: firewall.description || firewall.id,
          tags: [],
          configuration: this._sanitize(firewall)
        };

        // Collect firewall rules
        try {
          const rulesResponse = await this._client.firewalls.listFirewallGroupRules({
            'firewall-group-id': firewall.id
          });
          const rules = rulesResponse.firewall_rules || [];

          for (const rule of rules) {
            yield {
              provider: 'vultr',
              accountId: this._accountId,
              region: null,
              service: 'firewalls',
              resourceType: 'vultr.firewall.rule',
              resourceId: `${firewall.id}/${rule.id}`,
              name: `${firewall.description || firewall.id} - Rule ${rule.id}`,
              tags: [],
              metadata: { firewallGroupId: firewall.id },
              configuration: this._sanitize(rule)
            };
          }
        } catch (rulesErr) {
          this.logger('warn', `Failed to collect firewall rules for ${firewall.id}`, {
            firewallId: firewall.id,
            error: rulesErr.message
          });
        }
      }

      this.logger('info', `Collected ${firewalls.length} Vultr firewall groups`);
    } catch (err) {
      this.logger('error', 'Failed to collect Vultr firewalls', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect VPC/VPC 2.0 networks.
   */
  async *_collectVPC() {
    try {
      // VPC 2.0 (newer)
      try {
        const response = await this._client.vpc2.listVPC2s();
        const vpcs = response.vpcs || [];

        for (const vpc of vpcs) {
          yield {
            provider: 'vultr',
            accountId: this._accountId,
            region: vpc.region,
            service: 'vpc',
            resourceType: 'vultr.vpc.network',
            resourceId: vpc.id,
            name: vpc.description || vpc.id,
            tags: [],
            configuration: this._sanitize(vpc)
          };
        }

        this.logger('info', `Collected ${vpcs.length} Vultr VPC 2.0 networks`);
      } catch (vpc2Err) {
        this.logger('warn', 'Failed to collect VPC 2.0, trying legacy VPC', {
          error: vpc2Err.message
        });

        // Fallback to legacy VPC
        const legacyResponse = await this._client.vpc.listVPCs();
        const legacyVpcs = legacyResponse.vpcs || [];

        for (const vpc of legacyVpcs) {
          yield {
            provider: 'vultr',
            accountId: this._accountId,
            region: vpc.region,
            service: 'vpc',
            resourceType: 'vultr.vpc.network.legacy',
            resourceId: vpc.id,
            name: vpc.description || vpc.id,
            tags: [],
            configuration: this._sanitize(vpc)
          };
        }

        this.logger('info', `Collected ${legacyVpcs.length} Vultr legacy VPC networks`);
      }
    } catch (err) {
      this.logger('error', 'Failed to collect Vultr VPC', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect DNS domains and records.
   */
  async *_collectDNS() {
    try {
      const response = await this._client.dns.listDomains();
      const domains = response.domains || [];

      for (const domain of domains) {
        yield {
          provider: 'vultr',
          accountId: this._accountId,
          region: null, // DNS is global
          service: 'dns',
          resourceType: 'vultr.dns.domain',
          resourceId: domain.domain,
          name: domain.domain,
          tags: [],
          configuration: this._sanitize(domain)
        };

        // Collect DNS records for this domain
        try {
          const recordsResponse = await this._client.dns.listRecords({ 'dns-domain': domain.domain });
          const records = recordsResponse.records || [];

          for (const record of records) {
            yield {
              provider: 'vultr',
              accountId: this._accountId,
              region: null,
              service: 'dns',
              resourceType: 'vultr.dns.record',
              resourceId: record.id,
              name: `${record.name}.${domain.domain}`,
              tags: [],
              metadata: { domain: domain.domain },
              configuration: this._sanitize(record)
            };
          }
        } catch (recordsErr) {
          this.logger('warn', `Failed to collect DNS records for ${domain.domain}`, {
            domain: domain.domain,
            error: recordsErr.message
          });
        }
      }

      this.logger('info', `Collected ${domains.length} Vultr DNS domains`);
    } catch (err) {
      this.logger('error', 'Failed to collect Vultr DNS', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Managed Databases.
   */
  async *_collectDatabases() {
    try {
      const response = await this._client.databases.listDatabases();
      const databases = response.databases || [];

      for (const db of databases) {
        yield {
          provider: 'vultr',
          accountId: this._accountId,
          region: db.region,
          service: 'databases',
          resourceType: 'vultr.database',
          resourceId: db.id,
          name: db.label || db.id,
          tags: db.tag ? [db.tag] : [],
          configuration: this._sanitize(db)
        };
      }

      this.logger('info', `Collected ${databases.length} Vultr managed databases`);
    } catch (err) {
      this.logger('error', 'Failed to collect Vultr databases', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect SSH Keys.
   */
  async *_collectSSHKeys() {
    try {
      const response = await this._client.sshKeys.listSshKeys();
      const keys = response.ssh_keys || [];

      for (const key of keys) {
        yield {
          provider: 'vultr',
          accountId: this._accountId,
          region: null, // SSH keys are global
          service: 'sshkeys',
          resourceType: 'vultr.sshkey',
          resourceId: key.id,
          name: key.name || key.id,
          tags: [],
          configuration: this._sanitize(key)
        };
      }

      this.logger('info', `Collected ${keys.length} Vultr SSH keys`);
    } catch (err) {
      this.logger('error', 'Failed to collect Vultr SSH keys', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Object Storage buckets.
   */
  async *_collectObjectStorage() {
    try {
      // List object storage clusters first
      const clustersResponse = await this._client.objectStorage.listObjectStorageClusters();
      const clusters = clustersResponse.clusters || [];

      // For each cluster, list object storage instances
      for (const cluster of clusters) {
        try {
          const response = await this._client.objectStorage.listObjectStorages();
          const storages = response.object_storages || [];

          for (const storage of storages) {
            // Filter by cluster if needed
            if (storage.object_storage_cluster_id === cluster.id) {
              yield {
                provider: 'vultr',
                accountId: this._accountId,
                region: cluster.region,
                service: 'objectstorage',
                resourceType: 'vultr.objectstorage.bucket',
                resourceId: storage.id,
                name: storage.label || storage.id,
                tags: [],
                metadata: { clusterId: cluster.id, clusterRegion: cluster.region },
                configuration: this._sanitize(storage)
              };
            }
          }
        } catch (storageErr) {
          this.logger('warn', `Failed to collect object storage for cluster ${cluster.id}`, {
            clusterId: cluster.id,
            error: storageErr.message
          });
        }
      }

      this.logger('info', `Collected object storage from ${clusters.length} Vultr clusters`);
    } catch (err) {
      this.logger('error', 'Failed to collect Vultr object storage', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Sanitize configuration by removing sensitive data.
   */
  _sanitize(config) {
    if (!config || typeof config !== 'object') return config;

    const sanitized = { ...config };
    const sensitiveFields = ['api_key', 'password', 'secret', 'token', 'ssh_key', 'private_key'];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }
}
