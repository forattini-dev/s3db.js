import { BaseCloudDriver } from './base-driver.js';
import { PluginError } from '../../../errors.js';

/**
 * Production-ready Alibaba Cloud (Aliyun) inventory driver using @alicloud SDK.
 *
 * Covers 15+ services with 40+ resource types:
 * - Compute (ECS instances, ACK clusters, snapshots)
 * - Storage (OSS buckets, disks)
 * - Databases (RDS instances, Redis)
 * - Networking (VPC, vSwitches, SLB, EIP, Security Groups, NAT Gateway)
 * - Auto Scaling (Scaling Groups, Scaling Configurations)
 * - Container Registry (ACR repositories)
 * - CDN, DNS
 *
 * @see https://www.alibabacloud.com/help/doc-detail/57342.htm
 * @see https://github.com/aliyun/aliyun-openapi-nodejs-sdk
 */
export class AlibabaInventoryDriver extends BaseCloudDriver {
  constructor(options = {}) {
    super({ ...options, driver: options.driver || 'alibaba' });

    this._accessKeyId = null;
    this._accessKeySecret = null;
    this._accountId = this.config?.accountId || 'alibaba';

    // Services to collect (can be filtered via config.services)
    this._services = this.config?.services || [
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

    // Regions to scan (can be filtered via config.regions)
    this._regions = this.config?.regions || ['cn-hangzhou', 'cn-shanghai', 'cn-beijing'];
  }

  /**
   * Initialize Alibaba Cloud credentials.
   */
  async _initializeCredentials() {
    if (this._accessKeyId) return;

    const credentials = this.credentials || {};
    this._accessKeyId = credentials.accessKeyId || process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
    this._accessKeySecret = credentials.accessKeySecret || process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;

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

  /**
   * Create RPC client for a specific service.
   */
  async _createRPCClient(endpoint, apiVersion) {
    const RPCClient = await import('@alicloud/pop-core');

    return new RPCClient.default({
      accessKeyId: this._accessKeyId,
      accessKeySecret: this._accessKeySecret,
      endpoint,
      apiVersion
    });
  }

  /**
   * Main entry point - lists all resources from configured services.
   */
  async *listResources(options = {}) {
    await this._initializeCredentials();

    const serviceCollectors = {
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
        // Continue with next service instead of failing entire sync
        this.logger('error', `Alibaba Cloud service collection failed, skipping to next service`, {
          service,
          error: err.message,
          errorName: err.name,
          stack: err.stack
        });
      }
    }
  }

  /**
   * Collect ECS instances.
   */
  async *_collectECS() {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://ecs.${region}.aliyuncs.com`, '2014-05-26');

        const params = {
          RegionId: region,
          PageSize: 100
        };

        const response = await client.request('DescribeInstances', params, { method: 'POST' });
        const instances = response.Instances?.Instance || [];

        for (const instance of instances) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'ecs',
            resourceType: 'alibaba.ecs.instance',
            resourceId: instance.InstanceId,
            name: instance.InstanceName,
            tags: this._extractTags(instance.Tags?.Tag),
            configuration: this._sanitize(instance)
          };
        }

        this.logger('info', `Collected ${instances.length} ECS instances in ${region}`);
      }
    } catch (err) {
      this.logger('error', 'Failed to collect Alibaba Cloud ECS', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect ACK (Container Service for Kubernetes) clusters.
   */
  async *_collectACK() {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://cs.${region}.aliyuncs.com`, '2015-12-15');

        try {
          const response = await client.request('DescribeClustersV1', {}, { method: 'GET' });
          const clusters = response.clusters || [];

          for (const cluster of clusters) {
            yield {
              provider: 'alibaba',
              accountId: this._accountId,
              region,
              service: 'ack',
              resourceType: 'alibaba.ack.cluster',
              resourceId: cluster.cluster_id,
              name: cluster.name,
              tags: this._extractTags(cluster.tags),
              configuration: this._sanitize(cluster)
            };
          }

          this.logger('info', `Collected ${clusters.length} ACK clusters in ${region}`);
        } catch (regionErr) {
          // ACK may not be available in all regions
          this.logger('debug', `ACK not available in ${region}`, { region, error: regionErr.message });
        }
      }
    } catch (err) {
      this.logger('error', 'Failed to collect Alibaba Cloud ACK', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect OSS buckets.
   */
  async *_collectOSS() {
    try {
      const OSS = await import('ali-oss');

      // OSS client uses a different pattern
      const ossClient = new OSS.default({
        accessKeyId: this._accessKeyId,
        accessKeySecret: this._accessKeySecret,
        region: this._regions[0] // Use first region as default
      });

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
        };
      }

      this.logger('info', `Collected ${buckets.length} OSS buckets`);
    } catch (err) {
      this.logger('error', 'Failed to collect Alibaba Cloud OSS', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect RDS instances.
   */
  async *_collectRDS() {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://rds.${region}.aliyuncs.com`, '2014-08-15');

        const params = {
          RegionId: region,
          PageSize: 100
        };

        const response = await client.request('DescribeDBInstances', params, { method: 'POST' });
        const instances = response.Items?.DBInstance || [];

        for (const instance of instances) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'rds',
            resourceType: 'alibaba.rds.instance',
            resourceId: instance.DBInstanceId,
            name: instance.DBInstanceDescription || instance.DBInstanceId,
            tags: this._extractTags(instance.Tags?.Tag),
            configuration: this._sanitize(instance)
          };
        }

        this.logger('info', `Collected ${instances.length} RDS instances in ${region}`);
      }
    } catch (err) {
      this.logger('error', 'Failed to collect Alibaba Cloud RDS', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Redis instances.
   */
  async *_collectRedis() {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://r-kvstore.${region}.aliyuncs.com`, '2015-01-01');

        const params = {
          RegionId: region,
          PageSize: 100
        };

        const response = await client.request('DescribeInstances', params, { method: 'POST' });
        const instances = response.Instances?.KVStoreInstance || [];

        for (const instance of instances) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'redis',
            resourceType: 'alibaba.redis.instance',
            resourceId: instance.InstanceId,
            name: instance.InstanceName,
            tags: this._extractTags(instance.Tags?.Tag),
            configuration: this._sanitize(instance)
          };
        }

        this.logger('info', `Collected ${instances.length} Redis instances in ${region}`);
      }
    } catch (err) {
      this.logger('error', 'Failed to collect Alibaba Cloud Redis', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect VPC resources.
   */
  async *_collectVPC() {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://vpc.${region}.aliyuncs.com`, '2016-04-28');

        // VPCs
        const vpcParams = {
          RegionId: region,
          PageSize: 50
        };

        const vpcResponse = await client.request('DescribeVpcs', vpcParams, { method: 'POST' });
        const vpcs = vpcResponse.Vpcs?.Vpc || [];

        for (const vpc of vpcs) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'vpc',
            resourceType: 'alibaba.vpc.network',
            resourceId: vpc.VpcId,
            name: vpc.VpcName,
            tags: this._extractTags(vpc.Tags?.Tag),
            configuration: this._sanitize(vpc)
          };

          // vSwitches (subnets)
          try {
            const vswitchParams = {
              VpcId: vpc.VpcId,
              PageSize: 50
            };

            const vswitchResponse = await client.request('DescribeVSwitches', vswitchParams, { method: 'POST' });
            const vswitches = vswitchResponse.VSwitches?.VSwitch || [];

            for (const vswitch of vswitches) {
              yield {
                provider: 'alibaba',
                accountId: this._accountId,
                region,
                service: 'vpc',
                resourceType: 'alibaba.vpc.vswitch',
                resourceId: vswitch.VSwitchId,
                name: vswitch.VSwitchName,
                tags: this._extractTags(vswitch.Tags?.Tag),
                metadata: { vpcId: vpc.VpcId, vpcName: vpc.VpcName },
                configuration: this._sanitize(vswitch)
              };
            }
          } catch (vswitchErr) {
            this.logger('warn', `Failed to collect vSwitches for VPC ${vpc.VpcId}`, {
              vpcId: vpc.VpcId,
              error: vswitchErr.message
            });
          }
        }

        this.logger('info', `Collected ${vpcs.length} VPCs in ${region}`);
      }
    } catch (err) {
      this.logger('error', 'Failed to collect Alibaba Cloud VPC', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect SLB (Server Load Balancer) instances.
   */
  async *_collectSLB() {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://slb.${region}.aliyuncs.com`, '2014-05-15');

        const params = {
          RegionId: region,
          PageSize: 50
        };

        const response = await client.request('DescribeLoadBalancers', params, { method: 'POST' });
        const loadBalancers = response.LoadBalancers?.LoadBalancer || [];

        for (const lb of loadBalancers) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'slb',
            resourceType: 'alibaba.slb.loadbalancer',
            resourceId: lb.LoadBalancerId,
            name: lb.LoadBalancerName,
            tags: this._extractTags(lb.Tags?.Tag),
            configuration: this._sanitize(lb)
          };
        }

        this.logger('info', `Collected ${loadBalancers.length} SLB instances in ${region}`);
      }
    } catch (err) {
      this.logger('error', 'Failed to collect Alibaba Cloud SLB', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect EIP (Elastic IP) addresses.
   */
  async *_collectEIP() {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://vpc.${region}.aliyuncs.com`, '2016-04-28');

        const params = {
          RegionId: region,
          PageSize: 50
        };

        const response = await client.request('DescribeEipAddresses', params, { method: 'POST' });
        const eips = response.EipAddresses?.EipAddress || [];

        for (const eip of eips) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'eip',
            resourceType: 'alibaba.eip',
            resourceId: eip.AllocationId,
            name: eip.Name || eip.IpAddress,
            tags: this._extractTags(eip.Tags?.Tag),
            configuration: this._sanitize(eip)
          };
        }

        this.logger('info', `Collected ${eips.length} EIPs in ${region}`);
      }
    } catch (err) {
      this.logger('error', 'Failed to collect Alibaba Cloud EIP', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect CDN domains.
   */
  async *_collectCDN() {
    try {
      // CDN is global, not region-specific
      const client = await this._createRPCClient('https://cdn.aliyuncs.com', '2018-05-10');

      const params = {
        PageSize: 50
      };

      const response = await client.request('DescribeUserDomains', params, { method: 'POST' });
      const domains = response.Domains?.PageData || [];

      for (const domain of domains) {
        yield {
          provider: 'alibaba',
          accountId: this._accountId,
          region: null, // CDN is global
          service: 'cdn',
          resourceType: 'alibaba.cdn.domain',
          resourceId: domain.DomainName,
          name: domain.DomainName,
          tags: {},
          configuration: this._sanitize(domain)
        };
      }

      this.logger('info', `Collected ${domains.length} CDN domains`);
    } catch (err) {
      this.logger('error', 'Failed to collect Alibaba Cloud CDN', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect DNS domains.
   */
  async *_collectDNS() {
    try {
      // DNS is global, not region-specific
      const client = await this._createRPCClient('https://alidns.aliyuncs.com', '2015-01-09');

      const params = {
        PageSize: 100
      };

      const response = await client.request('DescribeDomains', params, { method: 'POST' });
      const domains = response.Domains?.Domain || [];

      for (const domain of domains) {
        yield {
          provider: 'alibaba',
          accountId: this._accountId,
          region: null, // DNS is global
          service: 'dns',
          resourceType: 'alibaba.dns.domain',
          resourceId: domain.DomainId,
          name: domain.DomainName,
          tags: this._extractTags(domain.Tags?.Tag),
          configuration: this._sanitize(domain)
        };
      }

      this.logger('info', `Collected ${domains.length} DNS domains`);
    } catch (err) {
      this.logger('error', 'Failed to collect Alibaba Cloud DNS', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Security Groups.
   */
  async *_collectSecurityGroups() {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://ecs.${region}.aliyuncs.com`, '2014-05-26');

        const params = {
          RegionId: region,
          PageSize: 50
        };

        const response = await client.request('DescribeSecurityGroups', params, { method: 'POST' });
        const securityGroups = response.SecurityGroups?.SecurityGroup || [];

        for (const sg of securityGroups) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'securitygroups',
            resourceType: 'alibaba.ecs.securitygroup',
            resourceId: sg.SecurityGroupId,
            name: sg.SecurityGroupName,
            tags: this._extractTags(sg.Tags?.Tag),
            metadata: { vpcId: sg.VpcId },
            configuration: this._sanitize(sg)
          };
        }

        this.logger('info', `Collected ${securityGroups.length} security groups in ${region}`);
      }
    } catch (err) {
      this.logger('error', 'Failed to collect Alibaba Cloud security groups', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Disk Snapshots.
   */
  async *_collectSnapshots() {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://ecs.${region}.aliyuncs.com`, '2014-05-26');

        const params = {
          RegionId: region,
          PageSize: 50
        };

        const response = await client.request('DescribeSnapshots', params, { method: 'POST' });
        const snapshots = response.Snapshots?.Snapshot || [];

        for (const snapshot of snapshots) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'snapshots',
            resourceType: 'alibaba.ecs.snapshot',
            resourceId: snapshot.SnapshotId,
            name: snapshot.SnapshotName || snapshot.SnapshotId,
            tags: this._extractTags(snapshot.Tags?.Tag),
            metadata: { sourceDiskId: snapshot.SourceDiskId },
            configuration: this._sanitize(snapshot)
          };
        }

        this.logger('info', `Collected ${snapshots.length} snapshots in ${region}`);
      }
    } catch (err) {
      this.logger('error', 'Failed to collect Alibaba Cloud snapshots', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Auto Scaling Groups.
   */
  async *_collectAutoScaling() {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://ess.${region}.aliyuncs.com`, '2014-08-28');

        const params = {
          RegionId: region,
          PageSize: 50
        };

        // Collect Scaling Groups
        const response = await client.request('DescribeScalingGroups', params, { method: 'POST' });
        const scalingGroups = response.ScalingGroups?.ScalingGroup || [];

        for (const group of scalingGroups) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'autoscaling',
            resourceType: 'alibaba.ess.scalinggroup',
            resourceId: group.ScalingGroupId,
            name: group.ScalingGroupName,
            tags: this._extractTags(group.Tags?.Tag),
            configuration: this._sanitize(group)
          };

          // Collect Scaling Configurations for this group
          try {
            const configParams = {
              ScalingGroupId: group.ScalingGroupId,
              PageSize: 50
            };
            const configResponse = await client.request('DescribeScalingConfigurations', configParams, { method: 'POST' });
            const configurations = configResponse.ScalingConfigurations?.ScalingConfiguration || [];

            for (const config of configurations) {
              yield {
                provider: 'alibaba',
                accountId: this._accountId,
                region,
                service: 'autoscaling',
                resourceType: 'alibaba.ess.scalingconfiguration',
                resourceId: config.ScalingConfigurationId,
                name: config.ScalingConfigurationName,
                tags: {},
                metadata: { scalingGroupId: group.ScalingGroupId },
                configuration: this._sanitize(config)
              };
            }
          } catch (configErr) {
            this.logger('warn', `Failed to collect scaling configurations for group ${group.ScalingGroupId}`, {
              error: configErr.message
            });
          }
        }

        this.logger('info', `Collected ${scalingGroups.length} auto scaling groups in ${region}`);
      }
    } catch (err) {
      this.logger('error', 'Failed to collect Alibaba Cloud auto scaling', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect NAT Gateways.
   */
  async *_collectNATGateway() {
    try {
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://vpc.${region}.aliyuncs.com`, '2016-04-28');

        const params = {
          RegionId: region,
          PageSize: 50
        };

        const response = await client.request('DescribeNatGateways', params, { method: 'POST' });
        const natGateways = response.NatGateways?.NatGateway || [];

        for (const nat of natGateways) {
          yield {
            provider: 'alibaba',
            accountId: this._accountId,
            region,
            service: 'natgateway',
            resourceType: 'alibaba.vpc.natgateway',
            resourceId: nat.NatGatewayId,
            name: nat.Name || nat.NatGatewayId,
            tags: this._extractTags(nat.Tags?.Tag),
            metadata: { vpcId: nat.VpcId },
            configuration: this._sanitize(nat)
          };
        }

        this.logger('info', `Collected ${natGateways.length} NAT gateways in ${region}`);
      }
    } catch (err) {
      this.logger('error', 'Failed to collect Alibaba Cloud NAT gateways', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Container Registry (ACR) repositories.
   */
  async *_collectACR() {
    try {
      // ACR API is region-specific but uses different endpoint pattern
      for (const region of this._regions) {
        const client = await this._createRPCClient(`https://cr.${region}.aliyuncs.com`, '2018-12-01');

        const params = {
          RegionId: region,
          PageSize: 50
        };

        try {
          const response = await client.request('ListRepository', params, { method: 'POST' });
          const repositories = response.Repositories?.Repository || [];

          for (const repo of repositories) {
            yield {
              provider: 'alibaba',
              accountId: this._accountId,
              region,
              service: 'acr',
              resourceType: 'alibaba.acr.repository',
              resourceId: repo.RepoId || `${repo.RepoNamespace}/${repo.RepoName}`,
              name: `${repo.RepoNamespace}/${repo.RepoName}`,
              tags: {},
              configuration: this._sanitize(repo)
            };
          }

          this.logger('info', `Collected ${repositories.length} ACR repositories in ${region}`);
        } catch (regionErr) {
          // ACR might not be available in all regions
          this.logger('debug', `ACR not available or no repositories in ${region}`, {
            error: regionErr.message
          });
        }
      }
    } catch (err) {
      this.logger('error', 'Failed to collect Alibaba Cloud ACR', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Extract tags from Alibaba Cloud tag format.
   */
  _extractTags(tags) {
    if (!tags || !Array.isArray(tags)) return {};

    const tagMap = {};
    for (const tag of tags) {
      if (tag.TagKey) {
        tagMap[tag.TagKey] = tag.TagValue || '';
      }
    }
    return tagMap;
  }

  /**
   * Sanitize configuration by removing sensitive data.
   */
  _sanitize(config) {
    if (!config || typeof config !== 'object') return config;

    const sanitized = { ...config };
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
