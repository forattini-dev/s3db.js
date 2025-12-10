import { BaseCloudDriver, CloudResource, BaseCloudDriverOptions, ListResourcesOptions } from './base-driver.js';

interface OracleDriverConfig {
  accountId?: string;
  services?: string[];
  regions?: string[] | null;
  tenancyId?: string;
  compartmentId?: string;
  region?: string;
}

interface OciProvider {
  region?: unknown;
}

interface OciRegion {
  regionName: string;
  region?: unknown;
}

export class OracleInventoryDriver extends BaseCloudDriver {
  private _provider: OciProvider | null = null;
  private _tenancyId: string | null = null;
  private _compartmentId: string | null = null;
  private _accountId: string;
  private _services: string[];
  private _regions: string[] | null;

  constructor(options: BaseCloudDriverOptions = { driver: 'oracle' }) {
    super({ ...options, driver: options.driver || 'oracle' });

    const config = this.config as OracleDriverConfig;
    this._accountId = config?.accountId || 'oracle';
    this._services = config?.services || [
      'compute',
      'kubernetes',
      'database',
      'blockstorage',
      'objectstorage',
      'filestorage',
      'vcn',
      'loadbalancer',
      'identity',
      'dns'
    ];
    this._regions = config?.regions || null;
  }

  async _initializeProvider(): Promise<void> {
    if (this._provider) return;

    const credentials = this.credentials || {};
    const config = this.config as OracleDriverConfig;
    const common = await import('oci-common') as any;

    if (credentials.configFilePath) {
      this._provider = new common.ConfigFileAuthenticationDetailsProvider(
        credentials.configFilePath as string,
        (credentials.profile as string) || 'DEFAULT'
      );
    } else if (credentials.instancePrincipal) {
      this._provider = await common.ResourcePrincipalAuthenticationDetailsProvider.builder();
    } else if (credentials.user && credentials.fingerprint && credentials.privateKey) {
      this._provider = new common.SimpleAuthenticationDetailsProvider(
        (credentials.tenancy as string) || config?.tenancyId || '',
        credentials.user as string,
        credentials.fingerprint as string,
        credentials.privateKey as string,
        (credentials.passphrase as string) || null,
        (credentials.region as unknown) || config?.region || common.Region.US_ASHBURN_1
      );
    } else {
      this._provider = new common.ConfigFileAuthenticationDetailsProvider();
    }

    this._tenancyId = (credentials.tenancy as string) || config?.tenancyId || null;
    this._compartmentId = config?.compartmentId || this._tenancyId;

    this.logger('info', 'OCI provider initialized', {
      accountId: this._accountId,
      services: this._services.length
    });
  }

  override async *listResources(_options: ListResourcesOptions = {}): AsyncGenerator<CloudResource> {
    await this._initializeProvider();

    const serviceCollectors: Record<string, () => AsyncGenerator<CloudResource>> = {
      compute: () => this._collectCompute(),
      kubernetes: () => this._collectKubernetes(),
      database: () => this._collectDatabases(),
      blockstorage: () => this._collectBlockStorage(),
      objectstorage: () => this._collectObjectStorage(),
      filestorage: () => this._collectFileStorage(),
      vcn: () => this._collectVCN(),
      loadbalancer: () => this._collectLoadBalancers(),
      identity: () => this._collectIdentity(),
      dns: () => this._collectDNS()
    };

    for (const service of this._services) {
      const collector = serviceCollectors[service];
      if (!collector) {
        this.logger('warn', `Unknown OCI service: ${service}`, { service });
        continue;
      }

      try {
        this.logger('info', `Collecting OCI ${service} resources`, { service });
        yield* collector();
      } catch (err) {
        const error = err as Error;
        this.logger('error', `OCI service collection failed, skipping to next service`, {
          service,
          error: error.message,
          errorName: error.name,
          stack: error.stack
        });
      }
    }
  }

  async *_collectCompute(): AsyncGenerator<CloudResource> {
    try {
      const ociCore = await import('oci-core') as any;
      const computeClient = new ociCore.ComputeClient({ authenticationDetailsProvider: this._provider });

      const regions = await this._getRegions();

      for (const region of regions) {
        computeClient.region = region.region;

        const instancesResponse = await computeClient.listInstances({
          compartmentId: this._compartmentId!
        });
        const instances = instancesResponse.items || [];

        for (const instance of instances) {
          yield {
            provider: 'oracle',
            accountId: this._accountId,
            region: region.regionName,
            service: 'compute',
            resourceType: 'oracle.compute.instance',
            resourceId: instance.id,
            name: instance.displayName || instance.id,
            tags: this._extractTags(instance.freeformTags, instance.definedTags),
            configuration: this._sanitize(instance)
          } as CloudResource;
        }

        this.logger('info', `Collected ${instances.length} OCI compute instances in ${region.regionName}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect OCI compute', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectKubernetes(): AsyncGenerator<CloudResource> {
    try {
      const ociContainerEngine = await import('oci-containerengine') as any;
      const containerClient = new ociContainerEngine.ContainerEngineClient({
        authenticationDetailsProvider: this._provider
      });

      const regions = await this._getRegions();

      for (const region of regions) {
        containerClient.region = region.region;

        const clustersResponse = await containerClient.listClusters({
          compartmentId: this._compartmentId!
        });
        const clusters = clustersResponse.items || [];

        for (const cluster of clusters) {
          yield {
            provider: 'oracle',
            accountId: this._accountId,
            region: region.regionName,
            service: 'kubernetes',
            resourceType: 'oracle.kubernetes.cluster',
            resourceId: cluster.id,
            name: cluster.name,
            tags: this._extractTags(cluster.freeformTags, cluster.definedTags),
            configuration: this._sanitize(cluster)
          } as CloudResource;

          try {
            const nodePoolsResponse = await containerClient.listNodePools({
              compartmentId: this._compartmentId!,
              clusterId: cluster.id
            });
            const nodePools = nodePoolsResponse.items || [];

            for (const nodePool of nodePools) {
              yield {
                provider: 'oracle',
                accountId: this._accountId,
                region: region.regionName,
                service: 'kubernetes',
                resourceType: 'oracle.kubernetes.nodepool',
                resourceId: nodePool.id,
                name: nodePool.name,
                tags: this._extractTags(nodePool.freeformTags, nodePool.definedTags),
                metadata: { clusterId: cluster.id, clusterName: cluster.name },
                configuration: this._sanitize(nodePool)
              } as CloudResource;
            }
          } catch (npErr) {
            const error = npErr as Error;
            this.logger('warn', `Failed to collect node pools for cluster ${cluster.id}`, {
              clusterId: cluster.id,
              error: error.message
            });
          }
        }

        this.logger('info', `Collected ${clusters.length} OCI OKE clusters in ${region.regionName}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect OCI Kubernetes', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectDatabases(): AsyncGenerator<CloudResource> {
    try {
      const ociDatabase = await import('oci-database') as any;
      const databaseClient = new ociDatabase.DatabaseClient({
        authenticationDetailsProvider: this._provider
      });

      const regions = await this._getRegions();

      for (const region of regions) {
        databaseClient.region = region.region;

        const autonomousDbsResponse = await databaseClient.listAutonomousDatabases({
          compartmentId: this._compartmentId!
        });
        const autonomousDbs = autonomousDbsResponse.items || [];

        for (const db of autonomousDbs) {
          yield {
            provider: 'oracle',
            accountId: this._accountId,
            region: region.regionName,
            service: 'database',
            resourceType: 'oracle.database.autonomous',
            resourceId: db.id,
            name: db.displayName || db.dbName,
            tags: this._extractTags(db.freeformTags, db.definedTags),
            configuration: this._sanitize(db)
          } as CloudResource;
        }

        const dbSystemsResponse = await databaseClient.listDbSystems({
          compartmentId: this._compartmentId!
        });
        const dbSystems = dbSystemsResponse.items || [];

        for (const dbSystem of dbSystems) {
          yield {
            provider: 'oracle',
            accountId: this._accountId,
            region: region.regionName,
            service: 'database',
            resourceType: 'oracle.database.system',
            resourceId: dbSystem.id,
            name: dbSystem.displayName,
            tags: this._extractTags(dbSystem.freeformTags, dbSystem.definedTags),
            configuration: this._sanitize(dbSystem)
          } as CloudResource;
        }

        this.logger('info', `Collected ${autonomousDbs.length} Autonomous DBs and ${dbSystems.length} DB Systems in ${region.regionName}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect OCI databases', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectBlockStorage(): AsyncGenerator<CloudResource> {
    try {
      const ociCoreBlock = await import('oci-core') as any;
      const blockstorageClient = new ociCoreBlock.BlockstorageClient({
        authenticationDetailsProvider: this._provider
      });

      const regions = await this._getRegions();

      for (const region of regions) {
        blockstorageClient.region = region.region;

        const volumesResponse = await blockstorageClient.listVolumes({
          compartmentId: this._compartmentId!
        });
        const volumes = volumesResponse.items || [];

        for (const volume of volumes) {
          yield {
            provider: 'oracle',
            accountId: this._accountId,
            region: region.regionName,
            service: 'blockstorage',
            resourceType: 'oracle.blockstorage.volume',
            resourceId: volume.id,
            name: volume.displayName,
            tags: this._extractTags(volume.freeformTags, volume.definedTags),
            configuration: this._sanitize(volume)
          } as CloudResource;
        }

        this.logger('info', `Collected ${volumes.length} OCI block volumes in ${region.regionName}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect OCI block storage', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectObjectStorage(): AsyncGenerator<CloudResource> {
    try {
      const ociObjectStorage = await import('oci-objectstorage') as any;
      const objectStorageClient = new ociObjectStorage.ObjectStorageClient({
        authenticationDetailsProvider: this._provider
      });

      const regions = await this._getRegions();

      const namespaceResponse = await objectStorageClient.getNamespace({});
      const namespace = namespaceResponse.value;

      for (const region of regions) {
        objectStorageClient.region = region.region;

        const bucketsResponse = await objectStorageClient.listBuckets({
          namespaceName: namespace,
          compartmentId: this._compartmentId!
        });
        const buckets = bucketsResponse.items || [];

        for (const bucket of buckets) {
          yield {
            provider: 'oracle',
            accountId: this._accountId,
            region: region.regionName,
            service: 'objectstorage',
            resourceType: 'oracle.objectstorage.bucket',
            resourceId: bucket.name,
            name: bucket.name,
            tags: this._extractTags(bucket.freeformTags, bucket.definedTags),
            metadata: { namespace },
            configuration: this._sanitize(bucket)
          } as CloudResource;
        }

        this.logger('info', `Collected ${buckets.length} OCI object storage buckets in ${region.regionName}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect OCI object storage', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectFileStorage(): AsyncGenerator<CloudResource> {
    try {
      const ociFileStorage = await import('oci-filestorage') as any;
      const fileStorageClient = new ociFileStorage.FileStorageClient({
        authenticationDetailsProvider: this._provider
      });

      const regions = await this._getRegions();

      for (const region of regions) {
        fileStorageClient.region = region.region;

        const fileSystemsResponse = await fileStorageClient.listFileSystems({
          compartmentId: this._compartmentId!,
          availabilityDomain: region.regionName
        });
        const fileSystems = fileSystemsResponse.items || [];

        for (const fs of fileSystems) {
          yield {
            provider: 'oracle',
            accountId: this._accountId,
            region: region.regionName,
            service: 'filestorage',
            resourceType: 'oracle.filestorage.filesystem',
            resourceId: fs.id,
            name: fs.displayName,
            tags: this._extractTags(fs.freeformTags, fs.definedTags),
            configuration: this._sanitize(fs)
          } as CloudResource;
        }

        this.logger('info', `Collected ${fileSystems.length} OCI file systems in ${region.regionName}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect OCI file storage', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectVCN(): AsyncGenerator<CloudResource> {
    try {
      const ociCoreVcn = await import('oci-core') as any;
      const vcnClient = new ociCoreVcn.VirtualNetworkClient({
        authenticationDetailsProvider: this._provider
      });

      const regions = await this._getRegions();

      for (const region of regions) {
        vcnClient.region = region.region;

        const vcnsResponse = await vcnClient.listVcns({
          compartmentId: this._compartmentId!
        });
        const vcns = vcnsResponse.items || [];

        for (const vcn of vcns) {
          yield {
            provider: 'oracle',
            accountId: this._accountId,
            region: region.regionName,
            service: 'vcn',
            resourceType: 'oracle.vcn.network',
            resourceId: vcn.id,
            name: vcn.displayName,
            tags: this._extractTags(vcn.freeformTags, vcn.definedTags),
            configuration: this._sanitize(vcn)
          } as CloudResource;

          try {
            const subnetsResponse = await vcnClient.listSubnets({
              compartmentId: this._compartmentId!,
              vcnId: vcn.id
            });
            const subnets = subnetsResponse.items || [];

            for (const subnet of subnets) {
              yield {
                provider: 'oracle',
                accountId: this._accountId,
                region: region.regionName,
                service: 'vcn',
                resourceType: 'oracle.vcn.subnet',
                resourceId: subnet.id,
                name: subnet.displayName,
                tags: this._extractTags(subnet.freeformTags, subnet.definedTags),
                metadata: { vcnId: vcn.id, vcnName: vcn.displayName },
                configuration: this._sanitize(subnet)
              } as CloudResource;
            }
          } catch (subnetErr) {
            const error = subnetErr as Error;
            this.logger('warn', `Failed to collect subnets for VCN ${vcn.id}`, {
              vcnId: vcn.id,
              error: error.message
            });
          }
        }

        this.logger('info', `Collected ${vcns.length} OCI VCNs in ${region.regionName}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect OCI VCN', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectLoadBalancers(): AsyncGenerator<CloudResource> {
    try {
      const ociLoadbalancer = await import('oci-loadbalancer') as any;
      const lbClient = new ociLoadbalancer.LoadBalancerClient({
        authenticationDetailsProvider: this._provider
      });

      const regions = await this._getRegions();

      for (const region of regions) {
        lbClient.region = region.region;

        const lbsResponse = await lbClient.listLoadBalancers({
          compartmentId: this._compartmentId!
        });
        const lbs = lbsResponse.items || [];

        for (const lb of lbs) {
          yield {
            provider: 'oracle',
            accountId: this._accountId,
            region: region.regionName,
            service: 'loadbalancer',
            resourceType: 'oracle.loadbalancer',
            resourceId: lb.id,
            name: lb.displayName,
            tags: this._extractTags(lb.freeformTags, lb.definedTags),
            configuration: this._sanitize(lb)
          } as CloudResource;
        }

        this.logger('info', `Collected ${lbs.length} OCI load balancers in ${region.regionName}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect OCI load balancers', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectIdentity(): AsyncGenerator<CloudResource> {
    try {
      const ociIdentity = await import('oci-identity') as any;
      const identityClient = new ociIdentity.IdentityClient({
        authenticationDetailsProvider: this._provider
      });

      const usersResponse = await identityClient.listUsers({
        compartmentId: this._tenancyId!
      });
      const users = usersResponse.items || [];

      for (const user of users) {
        yield {
          provider: 'oracle',
          accountId: this._accountId,
          region: null,
          service: 'identity',
          resourceType: 'oracle.identity.user',
          resourceId: user.id,
          name: user.name,
          tags: this._extractTags(user.freeformTags, user.definedTags),
          configuration: this._sanitize(user)
        } as CloudResource;
      }

      const groupsResponse = await identityClient.listGroups({
        compartmentId: this._tenancyId!
      });
      const groups = groupsResponse.items || [];

      for (const group of groups) {
        yield {
          provider: 'oracle',
          accountId: this._accountId,
          region: null,
          service: 'identity',
          resourceType: 'oracle.identity.group',
          resourceId: group.id,
          name: group.name,
          tags: this._extractTags(group.freeformTags, group.definedTags),
          configuration: this._sanitize(group)
        } as CloudResource;
      }

      const compartmentsResponse = await identityClient.listCompartments({
        compartmentId: this._tenancyId!
      });
      const compartments = compartmentsResponse.items || [];

      for (const compartment of compartments) {
        yield {
          provider: 'oracle',
          accountId: this._accountId,
          region: null,
          service: 'identity',
          resourceType: 'oracle.identity.compartment',
          resourceId: compartment.id,
          name: compartment.name,
          tags: this._extractTags(compartment.freeformTags, compartment.definedTags),
          configuration: this._sanitize(compartment)
        } as CloudResource;
      }

      this.logger('info', `Collected ${users.length} users, ${groups.length} groups, ${compartments.length} compartments`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect OCI identity', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectDNS(): AsyncGenerator<CloudResource> {
    try {
      const ociDns = await import('oci-dns') as any;
      const dnsClient = new ociDns.DnsClient({
        authenticationDetailsProvider: this._provider
      });

      const zonesResponse = await dnsClient.listZones({
        compartmentId: this._compartmentId!
      });
      const zones = zonesResponse.items || [];

      for (const zone of zones) {
        yield {
          provider: 'oracle',
          accountId: this._accountId,
          region: null,
          service: 'dns',
          resourceType: 'oracle.dns.zone',
          resourceId: zone.id,
          name: zone.name,
          tags: this._extractTags(zone.freeformTags, zone.definedTags),
          configuration: this._sanitize(zone)
        } as CloudResource;
      }

      this.logger('info', `Collected ${zones.length} OCI DNS zones`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect OCI DNS', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async _getRegions(): Promise<OciRegion[]> {
    if (this._regions && Array.isArray(this._regions)) {
      const common = await import('oci-common') as any;
      return this._regions.map(r => ({ regionName: r, region: common.Region[r] }));
    }

    const ociIdentityRegions = await import('oci-identity') as any;
    const identityClient = new ociIdentityRegions.IdentityClient({
      authenticationDetailsProvider: this._provider
    });

    const regionsResponse = await identityClient.listRegionSubscriptions({
      tenancyId: this._tenancyId!
    });

    return (regionsResponse.items || []) as OciRegion[];
  }

  _extractTags(freeformTags?: Record<string, string>, definedTags?: Record<string, Record<string, string>>): Record<string, string> {
    const tags: Record<string, string> = {};

    if (freeformTags && typeof freeformTags === 'object') {
      Object.assign(tags, freeformTags);
    }

    if (definedTags && typeof definedTags === 'object') {
      for (const [namespace, namespaceTags] of Object.entries(definedTags)) {
        for (const [key, value] of Object.entries(namespaceTags)) {
          tags[`${namespace}.${key}`] = value;
        }
      }
    }

    return tags;
  }

  _sanitize(config: unknown): Record<string, unknown> {
    if (!config || typeof config !== 'object') return config as Record<string, unknown>;

    const sanitized = { ...config } as Record<string, unknown>;
    const sensitiveFields = [
      'password',
      'adminPassword',
      'privateKey',
      'publicKey',
      'secret',
      'token',
      'connectionString',
      'connectionStrings'
    ];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }
}
