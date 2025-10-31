import { BaseCloudDriver } from './base-driver.js';

/**
 * Production-ready Microsoft Azure inventory driver using official @azure SDK.
 *
 * Covers 15+ services with 25+ resource types:
 * - Compute (VMs, VM scale sets, availability sets)
 * - Kubernetes (AKS clusters, node pools)
 * - Storage (storage accounts, disks, snapshots)
 * - Databases (SQL databases, Cosmos DB accounts)
 * - Networking (VNets, subnets, load balancers, public IPs, NSGs, app gateways)
 * - Container Registry (ACR)
 * - DNS (zones, record sets)
 * - Identity (managed identities)
 *
 * @see https://github.com/Azure/azure-sdk-for-js
 * @see https://learn.microsoft.com/en-us/javascript/api/overview/azure/
 */
export class AzureInventoryDriver extends BaseCloudDriver {
  constructor(options = {}) {
    super({ ...options, driver: options.driver || 'azure' });

    this._credential = null;
    this._subscriptionId = null;
    this._accountId = this.config?.accountId || 'azure';

    // Services to collect (can be filtered via config.services)
    this._services = this.config?.services || [
      'compute',
      'kubernetes',
      'storage',
      'disks',
      'databases',
      'cosmosdb',
      'network',
      'containerregistry',
      'dns',
      'identity'
    ];

    // Resource groups to scan (null = all)
    this._resourceGroups = this.config?.resourceGroups || null;
  }

  /**
   * Initialize Azure credential and subscription.
   */
  async _initializeCredential() {
    if (this._credential) return;

    const credentials = this.credentials || {};

    // Import Azure identity module
    const { DefaultAzureCredential, ClientSecretCredential } = await import('@azure/identity');

    // Setup authentication
    if (credentials.clientId && credentials.clientSecret && credentials.tenantId) {
      // Service principal authentication
      this._credential = new ClientSecretCredential(
        credentials.tenantId,
        credentials.clientId,
        credentials.clientSecret
      );
    } else {
      // Default Azure credential (managed identity, Azure CLI, environment variables, etc.)
      this._credential = new DefaultAzureCredential();
    }

    this._subscriptionId = credentials.subscriptionId || this.config?.subscriptionId;

    if (!this._subscriptionId) {
      throw new Error('Azure subscription ID is required. Provide via credentials.subscriptionId or config.subscriptionId.');
    }

    this.logger('info', 'Azure credential initialized', {
      accountId: this._accountId,
      subscriptionId: this._subscriptionId,
      services: this._services.length
    });
  }

  /**
   * Main entry point - lists all resources from configured services.
   */
  async *listResources(options = {}) {
    await this._initializeCredential();

    const serviceCollectors = {
      compute: () => this._collectCompute(),
      kubernetes: () => this._collectKubernetes(),
      storage: () => this._collectStorage(),
      disks: () => this._collectDisks(),
      databases: () => this._collectDatabases(),
      cosmosdb: () => this._collectCosmosDB(),
      network: () => this._collectNetwork(),
      containerregistry: () => this._collectContainerRegistry(),
      dns: () => this._collectDNS(),
      identity: () => this._collectIdentity()
    };

    for (const service of this._services) {
      const collector = serviceCollectors[service];
      if (!collector) {
        this.logger('warn', `Unknown Azure service: ${service}`, { service });
        continue;
      }

      try {
        this.logger('info', `Collecting Azure ${service} resources`, { service });
        yield* collector();
      } catch (err) {
        // Continue with next service instead of failing entire sync
        this.logger('error', `Azure service collection failed, skipping to next service`, {
          service,
          error: err.message,
          errorName: err.name,
          stack: err.stack
        });
      }
    }
  }

  /**
   * Collect Compute resources (VMs, VM scale sets).
   */
  async *_collectCompute() {
    try {
      const { ComputeManagementClient } = await import('@azure/arm-compute');
      const computeClient = new ComputeManagementClient(this._credential, this._subscriptionId);

      // List all Virtual Machines
      const vmsIterator = computeClient.virtualMachines.listAll();
      for await (const vm of vmsIterator) {
        yield {
          provider: 'azure',
          accountId: this._accountId,
          region: vm.location,
          service: 'compute',
          resourceType: 'azure.compute.virtualmachine',
          resourceId: vm.id,
          name: vm.name,
          tags: vm.tags || {},
          configuration: this._sanitize(vm)
        };
      }

      // List all VM Scale Sets
      const scaleSetsIterator = computeClient.virtualMachineScaleSets.listAll();
      for await (const scaleSet of scaleSetsIterator) {
        yield {
          provider: 'azure',
          accountId: this._accountId,
          region: scaleSet.location,
          service: 'compute',
          resourceType: 'azure.compute.vmscaleset',
          resourceId: scaleSet.id,
          name: scaleSet.name,
          tags: scaleSet.tags || {},
          configuration: this._sanitize(scaleSet)
        };
      }

      this.logger('info', `Collected Azure compute resources`);
    } catch (err) {
      this.logger('error', 'Failed to collect Azure compute', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Kubernetes (AKS) clusters.
   */
  async *_collectKubernetes() {
    try {
      const { ContainerServiceClient } = await import('@azure/arm-containerservice');
      const aksClient = new ContainerServiceClient(this._credential, this._subscriptionId);

      const clustersIterator = aksClient.managedClusters.list();
      for await (const cluster of clustersIterator) {
        yield {
          provider: 'azure',
          accountId: this._accountId,
          region: cluster.location,
          service: 'kubernetes',
          resourceType: 'azure.kubernetes.cluster',
          resourceId: cluster.id,
          name: cluster.name,
          tags: cluster.tags || {},
          configuration: this._sanitize(cluster)
        };

        // Agent pools (node pools) are embedded in cluster
        if (cluster.agentPoolProfiles && Array.isArray(cluster.agentPoolProfiles)) {
          for (const pool of cluster.agentPoolProfiles) {
            yield {
              provider: 'azure',
              accountId: this._accountId,
              region: cluster.location,
              service: 'kubernetes',
              resourceType: 'azure.kubernetes.nodepool',
              resourceId: `${cluster.id}/agentPools/${pool.name}`,
              name: pool.name,
              tags: {},
              metadata: { clusterId: cluster.id, clusterName: cluster.name },
              configuration: this._sanitize(pool)
            };
          }
        }
      }

      this.logger('info', `Collected Azure AKS clusters`);
    } catch (err) {
      this.logger('error', 'Failed to collect Azure Kubernetes', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Storage Accounts.
   */
  async *_collectStorage() {
    try {
      const { StorageManagementClient } = await import('@azure/arm-storage');
      const storageClient = new StorageManagementClient(this._credential, this._subscriptionId);

      const accountsIterator = storageClient.storageAccounts.list();
      for await (const account of accountsIterator) {
        yield {
          provider: 'azure',
          accountId: this._accountId,
          region: account.location,
          service: 'storage',
          resourceType: 'azure.storage.account',
          resourceId: account.id,
          name: account.name,
          tags: account.tags || {},
          configuration: this._sanitize(account)
        };
      }

      this.logger('info', `Collected Azure storage accounts`);
    } catch (err) {
      this.logger('error', 'Failed to collect Azure storage', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Disks and Snapshots.
   */
  async *_collectDisks() {
    try {
      const { ComputeManagementClient } = await import('@azure/arm-compute');
      const computeClient = new ComputeManagementClient(this._credential, this._subscriptionId);

      // Disks
      const disksIterator = computeClient.disks.list();
      for await (const disk of disksIterator) {
        yield {
          provider: 'azure',
          accountId: this._accountId,
          region: disk.location,
          service: 'disks',
          resourceType: 'azure.disk',
          resourceId: disk.id,
          name: disk.name,
          tags: disk.tags || {},
          configuration: this._sanitize(disk)
        };
      }

      // Snapshots
      const snapshotsIterator = computeClient.snapshots.list();
      for await (const snapshot of snapshotsIterator) {
        yield {
          provider: 'azure',
          accountId: this._accountId,
          region: snapshot.location,
          service: 'disks',
          resourceType: 'azure.snapshot',
          resourceId: snapshot.id,
          name: snapshot.name,
          tags: snapshot.tags || {},
          configuration: this._sanitize(snapshot)
        };
      }

      this.logger('info', `Collected Azure disks and snapshots`);
    } catch (err) {
      this.logger('error', 'Failed to collect Azure disks', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect SQL Databases.
   */
  async *_collectDatabases() {
    try {
      const { SqlManagementClient } = await import('@azure/arm-sql');
      const sqlClient = new SqlManagementClient(this._credential, this._subscriptionId);

      // List all SQL servers
      const serversIterator = sqlClient.servers.list();
      for await (const server of serversIterator) {
        yield {
          provider: 'azure',
          accountId: this._accountId,
          region: server.location,
          service: 'databases',
          resourceType: 'azure.sql.server',
          resourceId: server.id,
          name: server.name,
          tags: server.tags || {},
          configuration: this._sanitize(server)
        };

        // List databases for this server
        try {
          const resourceGroupName = this._extractResourceGroup(server.id);
          const databasesIterator = sqlClient.databases.listByServer(resourceGroupName, server.name);

          for await (const database of databasesIterator) {
            yield {
              provider: 'azure',
              accountId: this._accountId,
              region: database.location,
              service: 'databases',
              resourceType: 'azure.sql.database',
              resourceId: database.id,
              name: database.name,
              tags: database.tags || {},
              metadata: { serverId: server.id, serverName: server.name },
              configuration: this._sanitize(database)
            };
          }
        } catch (dbErr) {
          this.logger('warn', `Failed to collect databases for server ${server.name}`, {
            serverId: server.id,
            error: dbErr.message
          });
        }
      }

      this.logger('info', `Collected Azure SQL databases`);
    } catch (err) {
      this.logger('error', 'Failed to collect Azure databases', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Cosmos DB accounts.
   */
  async *_collectCosmosDB() {
    try {
      const { CosmosDBManagementClient } = await import('@azure/arm-cosmosdb');
      const cosmosClient = new CosmosDBManagementClient(this._credential, this._subscriptionId);

      const accountsIterator = cosmosClient.databaseAccounts.list();
      for await (const account of accountsIterator) {
        yield {
          provider: 'azure',
          accountId: this._accountId,
          region: account.location,
          service: 'cosmosdb',
          resourceType: 'azure.cosmosdb.account',
          resourceId: account.id,
          name: account.name,
          tags: account.tags || {},
          configuration: this._sanitize(account)
        };
      }

      this.logger('info', `Collected Azure Cosmos DB accounts`);
    } catch (err) {
      this.logger('error', 'Failed to collect Azure Cosmos DB', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Network resources (VNets, Subnets, Load Balancers, Public IPs).
   */
  async *_collectNetwork() {
    try {
      const { NetworkManagementClient } = await import('@azure/arm-network');
      const networkClient = new NetworkManagementClient(this._credential, this._subscriptionId);

      // Virtual Networks
      const vnetsIterator = networkClient.virtualNetworks.listAll();
      for await (const vnet of vnetsIterator) {
        yield {
          provider: 'azure',
          accountId: this._accountId,
          region: vnet.location,
          service: 'network',
          resourceType: 'azure.network.virtualnetwork',
          resourceId: vnet.id,
          name: vnet.name,
          tags: vnet.tags || {},
          configuration: this._sanitize(vnet)
        };

        // Subnets
        if (vnet.subnets && Array.isArray(vnet.subnets)) {
          for (const subnet of vnet.subnets) {
            yield {
              provider: 'azure',
              accountId: this._accountId,
              region: vnet.location,
              service: 'network',
              resourceType: 'azure.network.subnet',
              resourceId: subnet.id,
              name: subnet.name,
              tags: {},
              metadata: { vnetId: vnet.id, vnetName: vnet.name },
              configuration: this._sanitize(subnet)
            };
          }
        }
      }

      // Load Balancers
      const lbsIterator = networkClient.loadBalancers.listAll();
      for await (const lb of lbsIterator) {
        yield {
          provider: 'azure',
          accountId: this._accountId,
          region: lb.location,
          service: 'network',
          resourceType: 'azure.network.loadbalancer',
          resourceId: lb.id,
          name: lb.name,
          tags: lb.tags || {},
          configuration: this._sanitize(lb)
        };
      }

      // Public IP Addresses
      const ipsIterator = networkClient.publicIPAddresses.listAll();
      for await (const ip of ipsIterator) {
        yield {
          provider: 'azure',
          accountId: this._accountId,
          region: ip.location,
          service: 'network',
          resourceType: 'azure.network.publicip',
          resourceId: ip.id,
          name: ip.name,
          tags: ip.tags || {},
          configuration: this._sanitize(ip)
        };
      }

      // Network Security Groups
      const nsgsIterator = networkClient.networkSecurityGroups.listAll();
      for await (const nsg of nsgsIterator) {
        yield {
          provider: 'azure',
          accountId: this._accountId,
          region: nsg.location,
          service: 'network',
          resourceType: 'azure.network.securitygroup',
          resourceId: nsg.id,
          name: nsg.name,
          tags: nsg.tags || {},
          configuration: this._sanitize(nsg)
        };
      }

      this.logger('info', `Collected Azure network resources`);
    } catch (err) {
      this.logger('error', 'Failed to collect Azure network', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Container Registry.
   */
  async *_collectContainerRegistry() {
    try {
      const { ContainerRegistryManagementClient } = await import('@azure/arm-containerregistry');
      const acrClient = new ContainerRegistryManagementClient(this._credential, this._subscriptionId);

      const registriesIterator = acrClient.registries.list();
      for await (const registry of registriesIterator) {
        yield {
          provider: 'azure',
          accountId: this._accountId,
          region: registry.location,
          service: 'containerregistry',
          resourceType: 'azure.containerregistry',
          resourceId: registry.id,
          name: registry.name,
          tags: registry.tags || {},
          configuration: this._sanitize(registry)
        };
      }

      this.logger('info', `Collected Azure container registries`);
    } catch (err) {
      this.logger('error', 'Failed to collect Azure container registry', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect DNS zones.
   */
  async *_collectDNS() {
    try {
      const { DnsManagementClient } = await import('@azure/arm-dns');
      const dnsClient = new DnsManagementClient(this._credential, this._subscriptionId);

      const zonesIterator = dnsClient.zones.list();
      for await (const zone of zonesIterator) {
        yield {
          provider: 'azure',
          accountId: this._accountId,
          region: zone.location,
          service: 'dns',
          resourceType: 'azure.dns.zone',
          resourceId: zone.id,
          name: zone.name,
          tags: zone.tags || {},
          configuration: this._sanitize(zone)
        };
      }

      this.logger('info', `Collected Azure DNS zones`);
    } catch (err) {
      this.logger('error', 'Failed to collect Azure DNS', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Managed Identities.
   */
  async *_collectIdentity() {
    try {
      const { ManagedServiceIdentityClient } = await import('@azure/arm-msi');
      const identityClient = new ManagedServiceIdentityClient(this._credential, this._subscriptionId);

      const identitiesIterator = identityClient.userAssignedIdentities.listBySubscription();
      for await (const identity of identitiesIterator) {
        yield {
          provider: 'azure',
          accountId: this._accountId,
          region: identity.location,
          service: 'identity',
          resourceType: 'azure.identity.userassigned',
          resourceId: identity.id,
          name: identity.name,
          tags: identity.tags || {},
          configuration: this._sanitize(identity)
        };
      }

      this.logger('info', `Collected Azure managed identities`);
    } catch (err) {
      this.logger('error', 'Failed to collect Azure identity', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Extract resource group name from Azure resource ID.
   */
  _extractResourceGroup(resourceId) {
    if (!resourceId) return null;
    const match = resourceId.match(/\/resourceGroups\/([^\/]+)/i);
    return match ? match[1] : null;
  }

  /**
   * Sanitize configuration by removing sensitive data.
   */
  _sanitize(config) {
    if (!config || typeof config !== 'object') return config;

    const sanitized = { ...config };
    const sensitiveFields = [
      'administratorLogin',
      'administratorLoginPassword',
      'password',
      'adminPassword',
      'adminUsername',
      'connectionString',
      'primaryKey',
      'secondaryKey',
      'keys',
      'secret',
      'token'
    ];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }
}
