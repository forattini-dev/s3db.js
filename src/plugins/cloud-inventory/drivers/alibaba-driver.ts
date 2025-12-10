import { BaseCloudDriver, CloudResource, BaseCloudDriverOptions, ListResourcesOptions } from './base-driver.js';
import { PluginError } from '../../../errors.js';

interface AlibabaDriverConfig {
  accountId?: string;
  services?: string[];
  regions?: string[];
}

interface RPCClient {
  request(action: string, params: Record<string, unknown>, options: { method: string }): Promise<Record<string, unknown>>;
}

interface OSSClient {
  listBuckets(): Promise<{ buckets: Array<{ name: string; region: string }> }>;
}

export class AlibabaInventoryDriver extends BaseCloudDriver {
  private _accessKeyId: string | null = null;
  private _accessKeySecret: string | null = null;
  private _accountId: string;
  private _services: string[];
  private _regions: string[];

  constructor(options: BaseCloudDriverOptions = { driver: 'alibaba' }) {
    super({ ...options, driver: options.driver || 'alibaba' });

    const config = this.config as AlibabaDriverConfig;
    this._accountId = config?.accountId || 'alibaba';
    this._services = config?.services || [
      'ecs',
      'ack',
      'oss',
      'rds',
      'redis',
      'vpc',
      'slb',
      'eip',
      'cdn',
      'dns',
      'securitygroups',
      'snapshots',
      'autoscaling',
      'natgateway',
      'acr'
    ];
    this._regions = config?.regions || ['cn-hangzhou', 'cn-shanghai', 'cn-beijing'];
  }

  async _initializeCredentials(): Promise<void> {
    if (this._accessKeyId) return;

    const credentials = this.credentials || {};
    this._accessKeyId = (credentials.accessKeyId as string) || process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || null;
    this._accessKeySecret = (credentials.accessKeySecret as string) || process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || null;

    if (!this._accessKeyId || !this._accessKeySecret) {
      throw new PluginError('Alibaba Cloud AccessKeyId and AccessKeySecret are required. Provide via credentials or env vars.', {
        pluginName: 'CloudInventoryPlugin',
        operation: 'alibaba:initCredentials',
        statusCode: 400,
        retriable: false,
        suggestion: 'Pass credentials.accessKeyId/accessKeySecret or set ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET environment variables.'
      });
    }

    this.logger('info', 'Alibaba Cloud credentials initialized', {
      accountId: this._accountId,
      services: this._services.length,
      regions: this._regions.length
    });
  }

  async _createRPCClient(endpoint: string, apiVersion: string): Promise<RPCClient> {
    const RPCClient = await import('@alicloud/pop-core');

    return new RPCClient.default({
      accessKeyId: this._accessKeyId,
      accessKeySecret: this._accessKeySecret,
      endpoint,
      apiVersion
    }) as RPCClient;
  }

  override async *listResources(_options: ListResourcesOptions = {}): AsyncGenerator<CloudResource> {
    await this._initializeCredentials();

    const serviceCollectors: Record<string, () => AsyncGenerator<CloudResource>> = {
      ecs: () => this._collectECS(),
      ack: () => this._collectACK(),
      oss: () => this._collectOSS(),
      rds: () => this._collectRDS(),
      redis: () => this._collectRedis(),
      vpc: () => this._collectVPC(),
      slb: () => this._collectSLB(),
      eip: () => this._collectEIP(),
      cdn: () => this._collectCDN(),
      dns: () => this._collectDNS(),
      securitygroups: () => this._collectSecurityGroups(),
      snapshots: () => this._collectSnapshots(),
      autoscaling: () => this._collectAutoScaling(),
      natgateway: () => this._collectNATGateway(),
      acr: () => this._collectACR()
    };

    for (const service of this._services) {
      const collector = serviceCollectors[service];
      if (!collector) {
        this.logger('warn', `Unknown Alibaba Cloud service: ${service}`, { service });
        continue;
      }

      try {
        this.logger('info', `Collecting Alibaba Cloud ${service} resources`, { service });
        yield* collector();
      } catch (err) {
        const error = err as Error;
        this.logger('error', `Alibaba Cloud service collection failed, skipping to next service`, {
          service,
          error: error.message,
          errorName: error.name,
          stack: error.stack
        });
      }
    }
  }

  async *_collectECS(): AsyncGenerator<CloudResource> {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://ecs.${region}.aliyuncs.com`, '2014-05-26');

        const params = { RegionId: region, PageSize: 100 };
        const response = await client.request('DescribeInstances', params, { method: 'POST' });
        const instances = (response.Instances as { Instance?: Record<string, unknown>[] })?.Instance || [];

        for (const instance of instances) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'ecs',
            resourceType: 'alibaba.ecs.instance',
            resourceId: instance.InstanceId as string,
            name: instance.InstanceName as string,
            tags: this._extractTags((instance.Tags as { Tag?: Array<{ TagKey: string; TagValue: string }> })?.Tag),
            configuration: this._sanitize(instance)
          } as CloudResource;
        }

        this.logger('info', `Collected ${instances.length} ECS instances in ${region}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Alibaba Cloud ECS', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectACK(): AsyncGenerator<CloudResource> {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://cs.${region}.aliyuncs.com`, '2015-12-15');

        try {
          const response = await client.request('DescribeClustersV1', {}, { method: 'GET' });
          const clusters = (response.clusters as Record<string, unknown>[]) || [];

          for (const cluster of clusters) {
            yield {
              provider: 'alibaba',
              accountId: this._accountId,
              region,
              service: 'ack',
              resourceType: 'alibaba.ack.cluster',
              resourceId: cluster.cluster_id as string,
              name: cluster.name as string,
              tags: this._extractTags(cluster.tags as Array<{ TagKey: string; TagValue: string }>),
              configuration: this._sanitize(cluster)
            } as CloudResource;
          }

          this.logger('info', `Collected ${clusters.length} ACK clusters in ${region}`);
        } catch (regionErr) {
          const error = regionErr as Error;
          this.logger('debug', `ACK not available in ${region}`, { region, error: error.message });
        }
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Alibaba Cloud ACK', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectOSS(): AsyncGenerator<CloudResource> {
    try {
      const OSS = await import('ali-oss');

      const ossClient = new OSS.default({
        accessKeyId: this._accessKeyId,
        accessKeySecret: this._accessKeySecret,
        region: this._regions[0] || 'cn-hangzhou'
      }) as OSSClient;

      const response = await ossClient.listBuckets();
      const buckets = response.buckets || [];

      for (const bucket of buckets) {
        yield {
          provider: 'alibaba',
          accountId: this._accountId,
          region: bucket.region,
          service: 'oss',
          resourceType: 'alibaba.oss.bucket',
          resourceId: bucket.name,
          name: bucket.name,
          tags: {},
          configuration: this._sanitize(bucket)
        } as CloudResource;
      }

      this.logger('info', `Collected ${buckets.length} OSS buckets`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Alibaba Cloud OSS', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectRDS(): AsyncGenerator<CloudResource> {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://rds.${region}.aliyuncs.com`, '2014-08-15');

        const params = { RegionId: region, PageSize: 100 };
        const response = await client.request('DescribeDBInstances', params, { method: 'POST' });
        const instances = (response.Items as { DBInstance?: Record<string, unknown>[] })?.DBInstance || [];

        for (const instance of instances) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'rds',
            resourceType: 'alibaba.rds.instance',
            resourceId: instance.DBInstanceId as string,
            name: (instance.DBInstanceDescription as string) || (instance.DBInstanceId as string),
            tags: this._extractTags((instance.Tags as { Tag?: Array<{ TagKey: string; TagValue: string }> })?.Tag),
            configuration: this._sanitize(instance)
          } as CloudResource;
        }

        this.logger('info', `Collected ${instances.length} RDS instances in ${region}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Alibaba Cloud RDS', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectRedis(): AsyncGenerator<CloudResource> {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://r-kvstore.${region}.aliyuncs.com`, '2015-01-01');

        const params = { RegionId: region, PageSize: 100 };
        const response = await client.request('DescribeInstances', params, { method: 'POST' });
        const instances = (response.Instances as { KVStoreInstance?: Record<string, unknown>[] })?.KVStoreInstance || [];

        for (const instance of instances) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'redis',
            resourceType: 'alibaba.redis.instance',
            resourceId: instance.InstanceId as string,
            name: instance.InstanceName as string,
            tags: this._extractTags((instance.Tags as { Tag?: Array<{ TagKey: string; TagValue: string }> })?.Tag),
            configuration: this._sanitize(instance)
          } as CloudResource;
        }

        this.logger('info', `Collected ${instances.length} Redis instances in ${region}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Alibaba Cloud Redis', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectVPC(): AsyncGenerator<CloudResource> {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://vpc.${region}.aliyuncs.com`, '2016-04-28');

        const vpcParams = { RegionId: region, PageSize: 50 };
        const vpcResponse = await client.request('DescribeVpcs', vpcParams, { method: 'POST' });
        const vpcs = (vpcResponse.Vpcs as { Vpc?: Record<string, unknown>[] })?.Vpc || [];

        for (const vpc of vpcs) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'vpc',
            resourceType: 'alibaba.vpc.network',
            resourceId: vpc.VpcId as string,
            name: vpc.VpcName as string,
            tags: this._extractTags((vpc.Tags as { Tag?: Array<{ TagKey: string; TagValue: string }> })?.Tag),
            configuration: this._sanitize(vpc)
          } as CloudResource;

          try {
            const vswitchParams = { VpcId: vpc.VpcId, PageSize: 50 };
            const vswitchResponse = await client.request('DescribeVSwitches', vswitchParams, { method: 'POST' });
            const vswitches = (vswitchResponse.VSwitches as { VSwitch?: Record<string, unknown>[] })?.VSwitch || [];

            for (const vswitch of vswitches) {
              yield {
                provider: 'alibaba',
                accountId: this._accountId,
                region,
                service: 'vpc',
                resourceType: 'alibaba.vpc.vswitch',
                resourceId: vswitch.VSwitchId as string,
                name: vswitch.VSwitchName as string,
                tags: this._extractTags((vswitch.Tags as { Tag?: Array<{ TagKey: string; TagValue: string }> })?.Tag),
                metadata: { vpcId: vpc.VpcId, vpcName: vpc.VpcName },
                configuration: this._sanitize(vswitch)
              } as CloudResource;
            }
          } catch (vswitchErr) {
            const error = vswitchErr as Error;
            this.logger('warn', `Failed to collect vSwitches for VPC ${vpc.VpcId}`, {
              vpcId: vpc.VpcId,
              error: error.message
            });
          }
        }

        this.logger('info', `Collected ${vpcs.length} VPCs in ${region}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Alibaba Cloud VPC', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectSLB(): AsyncGenerator<CloudResource> {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://slb.${region}.aliyuncs.com`, '2014-05-15');

        const params = { RegionId: region, PageSize: 50 };
        const response = await client.request('DescribeLoadBalancers', params, { method: 'POST' });
        const loadBalancers = (response.LoadBalancers as { LoadBalancer?: Record<string, unknown>[] })?.LoadBalancer || [];

        for (const lb of loadBalancers) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'slb',
            resourceType: 'alibaba.slb.loadbalancer',
            resourceId: lb.LoadBalancerId as string,
            name: lb.LoadBalancerName as string,
            tags: this._extractTags((lb.Tags as { Tag?: Array<{ TagKey: string; TagValue: string }> })?.Tag),
            configuration: this._sanitize(lb)
          } as CloudResource;
        }

        this.logger('info', `Collected ${loadBalancers.length} SLB instances in ${region}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Alibaba Cloud SLB', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectEIP(): AsyncGenerator<CloudResource> {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://vpc.${region}.aliyuncs.com`, '2016-04-28');

        const params = { RegionId: region, PageSize: 50 };
        const response = await client.request('DescribeEipAddresses', params, { method: 'POST' });
        const eips = (response.EipAddresses as { EipAddress?: Record<string, unknown>[] })?.EipAddress || [];

        for (const eip of eips) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'eip',
            resourceType: 'alibaba.eip',
            resourceId: eip.AllocationId as string,
            name: (eip.Name as string) || (eip.IpAddress as string),
            tags: this._extractTags((eip.Tags as { Tag?: Array<{ TagKey: string; TagValue: string }> })?.Tag),
            configuration: this._sanitize(eip)
          } as CloudResource;
        }

        this.logger('info', `Collected ${eips.length} EIPs in ${region}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Alibaba Cloud EIP', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectCDN(): AsyncGenerator<CloudResource> {
    try {
      const client = await this._createRPCClient('https://cdn.aliyuncs.com', '2018-05-10');

      const params = { PageSize: 50 };
      const response = await client.request('DescribeUserDomains', params, { method: 'POST' });
      const domains = (response.Domains as { PageData?: Record<string, unknown>[] })?.PageData || [];

      for (const domain of domains) {
        yield {
          provider: 'alibaba',
          accountId: this._accountId,
          region: null,
          service: 'cdn',
          resourceType: 'alibaba.cdn.domain',
          resourceId: domain.DomainName as string,
          name: domain.DomainName as string,
          tags: {},
          configuration: this._sanitize(domain)
        } as CloudResource;
      }

      this.logger('info', `Collected ${domains.length} CDN domains`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Alibaba Cloud CDN', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectDNS(): AsyncGenerator<CloudResource> {
    try {
      const client = await this._createRPCClient('https://alidns.aliyuncs.com', '2015-01-09');

      const params = { PageSize: 100 };
      const response = await client.request('DescribeDomains', params, { method: 'POST' });
      const domains = (response.Domains as { Domain?: Record<string, unknown>[] })?.Domain || [];

      for (const domain of domains) {
        yield {
          provider: 'alibaba',
          accountId: this._accountId,
          region: null,
          service: 'dns',
          resourceType: 'alibaba.dns.domain',
          resourceId: domain.DomainId as string,
          name: domain.DomainName as string,
          tags: this._extractTags((domain.Tags as { Tag?: Array<{ TagKey: string; TagValue: string }> })?.Tag),
          configuration: this._sanitize(domain)
        } as CloudResource;
      }

      this.logger('info', `Collected ${domains.length} DNS domains`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Alibaba Cloud DNS', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectSecurityGroups(): AsyncGenerator<CloudResource> {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://ecs.${region}.aliyuncs.com`, '2014-05-26');

        const params = { RegionId: region, PageSize: 50 };
        const response = await client.request('DescribeSecurityGroups', params, { method: 'POST' });
        const securityGroups = (response.SecurityGroups as { SecurityGroup?: Record<string, unknown>[] })?.SecurityGroup || [];

        for (const sg of securityGroups) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'securitygroups',
            resourceType: 'alibaba.ecs.securitygroup',
            resourceId: sg.SecurityGroupId as string,
            name: sg.SecurityGroupName as string,
            tags: this._extractTags((sg.Tags as { Tag?: Array<{ TagKey: string; TagValue: string }> })?.Tag),
            metadata: { vpcId: sg.VpcId },
            configuration: this._sanitize(sg)
          } as CloudResource;
        }

        this.logger('info', `Collected ${securityGroups.length} security groups in ${region}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Alibaba Cloud security groups', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectSnapshots(): AsyncGenerator<CloudResource> {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://ecs.${region}.aliyuncs.com`, '2014-05-26');

        const params = { RegionId: region, PageSize: 50 };
        const response = await client.request('DescribeSnapshots', params, { method: 'POST' });
        const snapshots = (response.Snapshots as { Snapshot?: Record<string, unknown>[] })?.Snapshot || [];

        for (const snapshot of snapshots) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'snapshots',
            resourceType: 'alibaba.ecs.snapshot',
            resourceId: snapshot.SnapshotId as string,
            name: (snapshot.SnapshotName as string) || (snapshot.SnapshotId as string),
            tags: this._extractTags((snapshot.Tags as { Tag?: Array<{ TagKey: string; TagValue: string }> })?.Tag),
            metadata: { sourceDiskId: snapshot.SourceDiskId },
            configuration: this._sanitize(snapshot)
          } as CloudResource;
        }

        this.logger('info', `Collected ${snapshots.length} snapshots in ${region}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Alibaba Cloud snapshots', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectAutoScaling(): AsyncGenerator<CloudResource> {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://ess.${region}.aliyuncs.com`, '2014-08-28');

        const params = { RegionId: region, PageSize: 50 };
        const response = await client.request('DescribeScalingGroups', params, { method: 'POST' });
        const scalingGroups = (response.ScalingGroups as { ScalingGroup?: Record<string, unknown>[] })?.ScalingGroup || [];

        for (const group of scalingGroups) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'autoscaling',
            resourceType: 'alibaba.ess.scalinggroup',
            resourceId: group.ScalingGroupId as string,
            name: group.ScalingGroupName as string,
            tags: this._extractTags((group.Tags as { Tag?: Array<{ TagKey: string; TagValue: string }> })?.Tag),
            configuration: this._sanitize(group)
          } as CloudResource;

          try {
            const configParams = { ScalingGroupId: group.ScalingGroupId, PageSize: 50 };
            const configResponse = await client.request('DescribeScalingConfigurations', configParams, { method: 'POST' });
            const configurations = (configResponse.ScalingConfigurations as { ScalingConfiguration?: Record<string, unknown>[] })?.ScalingConfiguration || [];

            for (const config of configurations) {
              yield {
                provider: 'alibaba',
                accountId: this._accountId,
                region,
                service: 'autoscaling',
                resourceType: 'alibaba.ess.scalingconfiguration',
                resourceId: config.ScalingConfigurationId as string,
                name: config.ScalingConfigurationName as string,
                tags: {},
                metadata: { scalingGroupId: group.ScalingGroupId },
                configuration: this._sanitize(config)
              } as CloudResource;
            }
          } catch (configErr) {
            const error = configErr as Error;
            this.logger('warn', `Failed to collect scaling configurations for group ${group.ScalingGroupId}`, {
              error: error.message
            });
          }
        }

        this.logger('info', `Collected ${scalingGroups.length} auto scaling groups in ${region}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Alibaba Cloud auto scaling', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectNATGateway(): AsyncGenerator<CloudResource> {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://vpc.${region}.aliyuncs.com`, '2016-04-28');

        const params = { RegionId: region, PageSize: 50 };
        const response = await client.request('DescribeNatGateways', params, { method: 'POST' });
        const natGateways = (response.NatGateways as { NatGateway?: Record<string, unknown>[] })?.NatGateway || [];

        for (const nat of natGateways) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'natgateway',
            resourceType: 'alibaba.vpc.natgateway',
            resourceId: nat.NatGatewayId as string,
            name: (nat.Name as string) || (nat.NatGatewayId as string),
            tags: this._extractTags((nat.Tags as { Tag?: Array<{ TagKey: string; TagValue: string }> })?.Tag),
            metadata: { vpcId: nat.VpcId },
            configuration: this._sanitize(nat)
          } as CloudResource;
        }

        this.logger('info', `Collected ${natGateways.length} NAT gateways in ${region}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Alibaba Cloud NAT gateways', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectACR(): AsyncGenerator<CloudResource> {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://cr.${region}.aliyuncs.com`, '2018-12-01');

        const params = { RegionId: region, PageSize: 50 };

        try {
          const response = await client.request('ListRepository', params, { method: 'POST' });
          const repositories = (response.Repositories as { Repository?: Record<string, unknown>[] })?.Repository || [];

          for (const repo of repositories) {
            yield {
              provider: 'alibaba',
              accountId: this._accountId,
              region,
              service: 'acr',
              resourceType: 'alibaba.acr.repository',
              resourceId: (repo.RepoId as string) || `${repo.RepoNamespace}/${repo.RepoName}`,
              name: `${repo.RepoNamespace}/${repo.RepoName}`,
              tags: {},
              configuration: this._sanitize(repo)
            } as CloudResource;
          }

          this.logger('info', `Collected ${repositories.length} ACR repositories in ${region}`);
        } catch (regionErr) {
          const error = regionErr as Error;
          this.logger('debug', `ACR not available or no repositories in ${region}`, {
            error: error.message
          });
        }
      }
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Alibaba Cloud ACR', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  _extractTags(tags?: Array<{ TagKey: string; TagValue?: string }>): Record<string, string> {
    if (!tags || !Array.isArray(tags)) return {};

    const tagMap: Record<string, string> = {};
    for (const tag of tags) {
      if (tag.TagKey) {
        tagMap[tag.TagKey] = tag.TagValue || '';
      }
    }
    return tagMap;
  }

  _sanitize(config: unknown): Record<string, unknown> {
    if (!config || typeof config !== 'object') return config as Record<string, unknown>;

    const sanitized = { ...config } as Record<string, unknown>;
    const sensitiveFields = [
      'Password',
      'MasterUserPassword',
      'AccessKeySecret',
      'SecretAccessKey',
      'PrivateKey',
      'Certificate'
    ];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }
}
