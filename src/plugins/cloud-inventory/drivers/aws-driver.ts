import { fromNodeProviderChain, fromIni, fromProcess } from '@aws-sdk/credential-providers';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import {
  EC2Client,
  paginateDescribeInstances,
  paginateDescribeVpcs,
  paginateDescribeSubnets,
  paginateDescribeSecurityGroups,
  paginateDescribeRouteTables,
  paginateDescribeInternetGateways,
  paginateDescribeNatGateways,
  paginateDescribeNetworkAcls,
  paginateDescribeVolumes,
  paginateDescribeSnapshots as paginateDescribeEBSSnapshots,
  DescribeVpnConnectionsCommand,
  DescribeCustomerGatewaysCommand,
  DescribeTransitGatewaysCommand,
  DescribeTransitGatewayAttachmentsCommand
} from '@aws-sdk/client-ec2';
import {
  S3Client,
  ListBucketsCommand,
  GetBucketLocationCommand,
  GetBucketTaggingCommand
} from '@aws-sdk/client-s3';
import {
  RDSClient,
  paginateDescribeDBInstances,
  ListTagsForResourceCommand
} from '@aws-sdk/client-rds';
import {
  IAMClient,
  paginateListUsers,
  paginateListRoles,
  ListUserTagsCommand,
  ListRoleTagsCommand
} from '@aws-sdk/client-iam';
import {
  LambdaClient,
  paginateListFunctions,
  ListTagsCommand as ListLambdaTagsCommand
} from '@aws-sdk/client-lambda';
import {
  ElasticLoadBalancingClient,
  paginateDescribeLoadBalancers as paginateDescribeClassicLoadBalancers,
  DescribeTagsCommand as DescribeClassicLBTagsCommand
} from '@aws-sdk/client-elastic-load-balancing';
import {
  ElasticLoadBalancingV2Client,
  paginateDescribeLoadBalancers,
  paginateDescribeTargetGroups,
  DescribeTagsCommand as DescribeELBv2TagsCommand
} from '@aws-sdk/client-elastic-load-balancing-v2';
import {
  DynamoDBClient,
  paginateListTables,
  DescribeTableCommand,
  ListTagsOfResourceCommand as ListDynamoDBTagsCommand
} from '@aws-sdk/client-dynamodb';
import {
  SQSClient,
  paginateListQueues,
  GetQueueAttributesCommand,
  ListQueueTagsCommand
} from '@aws-sdk/client-sqs';
import {
  SNSClient,
  paginateListTopics,
  GetTopicAttributesCommand,
  ListTagsForResourceCommand as ListSNSTagsCommand
} from '@aws-sdk/client-sns';
import {
  ECSClient,
  paginateListClusters,
  paginateListServices,
  paginateListTaskDefinitions,
  DescribeServicesCommand,
  DescribeTaskDefinitionCommand,
  ListTagsForResourceCommand as ListECSTagsCommand
} from '@aws-sdk/client-ecs';
import {
  EKSClient,
  paginateListClusters as paginateListEKSClusters,
  paginateListNodegroups,
  DescribeClusterCommand,
  DescribeNodegroupCommand,
  ListTagsForResourceCommand as ListEKSTagsCommand
} from '@aws-sdk/client-eks';
import {
  APIGatewayClient,
  paginateGetRestApis,
  GetTagsCommand as GetAPIGatewayTagsCommand
} from '@aws-sdk/client-api-gateway';
import {
  ApiGatewayV2Client,
  GetApisCommand,
  GetTagsCommand as GetAPIGatewayV2TagsCommand
} from '@aws-sdk/client-apigatewayv2';
import {
  CloudFrontClient,
  paginateListDistributions,
  ListTagsForResourceCommand as ListCloudFrontTagsCommand
} from '@aws-sdk/client-cloudfront';
import {
  Route53Client,
  paginateListHostedZones,
  ListTagsForResourceCommand as ListRoute53TagsCommand
} from '@aws-sdk/client-route-53';
import {
  KMSClient,
  paginateListKeys,
  DescribeKeyCommand,
  ListResourceTagsCommand
} from '@aws-sdk/client-kms';
import {
  SecretsManagerClient,
  paginateListSecrets,
  DescribeSecretCommand
} from '@aws-sdk/client-secrets-manager';
import {
  SSMClient,
  paginateDescribeParameters,
  ListTagsForResourceCommand as ListSSMTagsCommand
} from '@aws-sdk/client-ssm';
import {
  ElastiCacheClient,
  paginateDescribeCacheClusters,
  ListTagsForResourceCommand as ListElastiCacheTagsCommand
} from '@aws-sdk/client-elasticache';
import {
  EFSClient,
  paginateDescribeFileSystems,
  DescribeTagsCommand as DescribeEFSTagsCommand
} from '@aws-sdk/client-efs';
import {
  ECRClient,
  paginateDescribeRepositories,
  ListTagsForResourceCommand as ListECRTagsCommand
} from '@aws-sdk/client-ecr';
import {
  SFNClient,
  paginateListStateMachines,
  ListTagsForResourceCommand as ListSFNTagsCommand
} from '@aws-sdk/client-sfn';
import {
  EventBridgeClient,
  ListEventBusesCommand,
  ListRulesCommand,
  ListTagsForResourceCommand as ListEventBridgeTagsCommand
} from '@aws-sdk/client-eventbridge';
import {
  CloudWatchClient,
  paginateDescribeAlarms,
  ListTagsForResourceCommand as ListCloudWatchTagsCommand
} from '@aws-sdk/client-cloudwatch';
import {
  CloudWatchLogsClient,
  paginateDescribeLogGroups,
  ListTagsForResourceCommand as ListCWLogsTagsCommand
} from '@aws-sdk/client-cloudwatch-logs';
import {
  CloudTrailClient,
  paginateListTrails,
  GetTrailCommand,
  ListTagsCommand as ListCloudTrailTagsCommand
} from '@aws-sdk/client-cloudtrail';
import {
  ConfigServiceClient,
  DescribeConfigurationRecordersCommand,
  DescribeDeliveryChannelsCommand
} from '@aws-sdk/client-config-service';
import {
  ACMClient,
  paginateListCertificates,
  DescribeCertificateCommand,
  ListTagsForCertificateCommand
} from '@aws-sdk/client-acm';
import {
  WAFClient,
  ListWebACLsCommand as ListWAFWebACLsCommand,
  ListTagsForResourceCommand as ListWAFTagsCommand
} from '@aws-sdk/client-waf';
import {
  WAFV2Client,
  ListWebACLsCommand as ListWAFV2WebACLsCommand,
  ListTagsForResourceCommand as ListWAFV2TagsCommand
} from '@aws-sdk/client-wafv2';
import {
  CognitoIdentityProviderClient,
  paginateListUserPools,
  DescribeUserPoolCommand,
  ListTagsForResourceCommand as ListCognitoTagsCommand
} from '@aws-sdk/client-cognito-identity-provider';
import {
  BackupClient,
  paginateListBackupPlans,
  paginateListBackupVaults,
  ListTagsCommand as ListBackupTagsCommand
} from '@aws-sdk/client-backup';
import {
  KinesisClient,
  paginateListStreams,
  DescribeStreamCommand,
  ListTagsForStreamCommand
} from '@aws-sdk/client-kinesis';

import { BaseCloudDriver, type CloudResource, type BaseCloudDriverOptions } from './base-driver.js';

interface AwsCredentials {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  profile?: string;
  processProfile?: string;
}

interface AwsConfig {
  services?: string | string[];
  regions?: string | string[];
  region?: string;
  s3Region?: string;
  iamRegion?: string;
  [key: string]: unknown;
}

interface AwsDriverOptions extends Omit<BaseCloudDriverOptions, 'credentials' | 'config'> {
  credentials?: AwsCredentials;
  config?: AwsConfig;
}

interface TagEntry {
  Key?: string;
  Value?: string;
  key?: string;
  value?: string;
  [key: string]: unknown;
}

interface Ec2Instance {
  InstanceId?: string;
  Tags?: TagEntry[];
  [key: string]: unknown;
}

type CredentialProvider = () => Promise<{
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}>;

interface AwsClientMap {
  ec2: Map<string, EC2Client>;
  s3: S3Client | null;
  rds: Map<string, RDSClient>;
  iam: IAMClient | null;
  lambda: Map<string, LambdaClient>;
  sts: STSClient | null;
  elb: Map<string, ElasticLoadBalancingClient>;
  elbv2: Map<string, ElasticLoadBalancingV2Client>;
  dynamodb: Map<string, DynamoDBClient>;
  sqs: Map<string, SQSClient>;
  sns: Map<string, SNSClient>;
  ecs: Map<string, ECSClient>;
  eks: Map<string, EKSClient>;
  apigateway: Map<string, APIGatewayClient>;
  apigatewayv2: Map<string, ApiGatewayV2Client>;
  cloudfront: CloudFrontClient | null;
  route53: Route53Client | null;
  kms: Map<string, KMSClient>;
  secretsmanager: Map<string, SecretsManagerClient>;
  ssm: Map<string, SSMClient>;
  elasticache: Map<string, ElastiCacheClient>;
  efs: Map<string, EFSClient>;
  ecr: Map<string, ECRClient>;
  sfn: Map<string, SFNClient>;
  eventbridge: Map<string, EventBridgeClient>;
  cloudwatch: Map<string, CloudWatchClient>;
  logs: Map<string, CloudWatchLogsClient>;
  cloudtrail: Map<string, CloudTrailClient>;
  config: Map<string, ConfigServiceClient>;
  acm: Map<string, ACMClient>;
  waf: WAFClient | null;
  wafv2: Map<string, WAFV2Client>;
  cognito: Map<string, CognitoIdentityProviderClient>;
  backup: Map<string, BackupClient>;
  kinesis: Map<string, KinesisClient>;
}

type AwsServiceName =
  | 'ec2' | 's3' | 'rds' | 'iam' | 'lambda'
  | 'vpc' | 'elb' | 'alb' | 'nlb'
  | 'dynamodb' | 'sqs' | 'sns'
  | 'ecs' | 'eks' | 'apigateway' | 'cloudfront' | 'route53'
  | 'kms' | 'secretsmanager' | 'ssm'
  | 'elasticache' | 'efs' | 'ecr'
  | 'stepfunctions' | 'eventbridge' | 'cloudwatch' | 'logs'
  | 'cloudtrail' | 'config' | 'acm' | 'waf' | 'wafv2' | 'cognito'
  | 'ebs' | 'vpn' | 'transitgateway' | 'backup' | 'kinesis';

interface ListResourcesOptions {
  discovery?: {
    include?: string | string[];
    exclude?: string | string[];
  };
  runtime?: {
    emitProgress?: (data: { service: string; resourceId: string; resourceType: string }) => void;
  };
}

const DEFAULT_SERVICES: AwsServiceName[] = [
  'ec2', 's3', 'rds', 'iam', 'lambda',
  'vpc', 'elb', 'alb', 'nlb',
  'dynamodb', 'sqs', 'sns',
  'ecs', 'eks', 'apigateway', 'cloudfront', 'route53',
  'kms', 'secretsmanager', 'ssm',
  'elasticache', 'efs', 'ecr',
  'stepfunctions', 'eventbridge', 'cloudwatch', 'logs',
  'cloudtrail', 'config', 'acm', 'waf', 'wafv2', 'cognito',
  'ebs', 'vpn', 'transitgateway', 'backup', 'kinesis'
];
const GLOBAL_REGION = 'us-east-1';

function normaliseServiceName(name: unknown): string {
  return ((name as string) || '').toString().trim().toLowerCase();
}

function buildTagObject(
  entries: TagEntry[] | undefined | null,
  keyKey: string = 'Key',
  valueKey: string = 'Value'
): Record<string, string | null> | null {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }
  const out: Record<string, string | null> = {};
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const key = entry[keyKey] as string | undefined;
    if (!key) continue;
    out[key] = (entry[valueKey] as string | null) ?? null;
  }
  return Object.keys(out).length ? out : null;
}

function buildCredentialProvider(credentials: AwsCredentials = {}): CredentialProvider {
  if (!credentials || typeof credentials !== 'object') {
    return fromNodeProviderChain() as CredentialProvider;
  }

  if (credentials.accessKeyId && credentials.secretAccessKey) {
    const staticCredentials = {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken
    };
    return async () => staticCredentials;
  }

  if (credentials.profile) {
    return fromIni({ profile: credentials.profile }) as CredentialProvider;
  }

  if (credentials.processProfile) {
    return fromProcess({ profile: credentials.processProfile }) as CredentialProvider;
  }

  return fromNodeProviderChain() as CredentialProvider;
}

function ensureArray<T>(value: T | T[] | undefined | null, fallback: T[] = []): T[] {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  return [value];
}

function shouldCollect(service: string, includeSet: Set<string>, excludeSet: Set<string>): boolean {
  const name = normaliseServiceName(service);
  if (excludeSet.has(name)) return false;
  if (includeSet.size > 0 && !includeSet.has(name)) return false;
  return true;
}

function extractEc2Tags(instance: Ec2Instance | null | undefined): Record<string, string | null> | null {
  if (!instance?.Tags) return null;
  const tags: Record<string, string | null> = {};
  for (const { Key, Value } of instance.Tags) {
    if (!Key) continue;
    tags[Key] = Value ?? null;
  }
  return Object.keys(tags).length ? tags : null;
}

function extractInstanceName(instance: Ec2Instance | null | undefined): string | null {
  if (!instance?.Tags) return null;
  const nameTag = instance.Tags.find(tag => tag.Key === 'Name');
  return nameTag?.Value || null;
}

function sanitizeConfiguration<T>(payload: T): T {
  if (!payload || typeof payload !== 'object') return payload;
  return JSON.parse(JSON.stringify(payload));
}

export class AwsInventoryDriver extends BaseCloudDriver {
  private _clients: AwsClientMap;
  private _accountId: string | null = null;
  private _credentialProvider: CredentialProvider;
  private _services: AwsServiceName[];
  private _regions: string[];

  constructor(options: AwsDriverOptions = { driver: 'aws' }) {
    super({ ...options, credentials: options.credentials as Record<string, unknown>, config: options.config as Record<string, unknown>, driver: options.driver || 'aws' });

    this._clients = {
      ec2: new Map(),
      s3: null,
      rds: new Map(),
      iam: null,
      lambda: new Map(),
      sts: null,
      elb: new Map(),
      elbv2: new Map(),
      dynamodb: new Map(),
      sqs: new Map(),
      sns: new Map(),
      ecs: new Map(),
      eks: new Map(),
      apigateway: new Map(),
      apigatewayv2: new Map(),
      cloudfront: null,
      route53: null,
      kms: new Map(),
      secretsmanager: new Map(),
      ssm: new Map(),
      elasticache: new Map(),
      efs: new Map(),
      ecr: new Map(),
      sfn: new Map(),
      eventbridge: new Map(),
      cloudwatch: new Map(),
      logs: new Map(),
      cloudtrail: new Map(),
      config: new Map(),
      acm: new Map(),
      waf: null,
      wafv2: new Map(),
      cognito: new Map(),
      backup: new Map(),
      kinesis: new Map()
    };

    this._credentialProvider = buildCredentialProvider(this.credentials as AwsCredentials);

    this._services = ensureArray(this.config?.services as string | string[] | undefined, DEFAULT_SERVICES)
      .map(normaliseServiceName)
      .filter(Boolean) as AwsServiceName[];
    if (!this._services.length) {
      this._services = [...DEFAULT_SERVICES];
    }

    const awsConfig = this.config as AwsConfig | undefined;
    this._regions = ensureArray(awsConfig?.regions, [awsConfig?.region || GLOBAL_REGION]);
    if (!this._regions.length) {
      this._regions = [GLOBAL_REGION];
    }
  }

  override async initialize(): Promise<void> {
    await this._initializeSts();
    this.logger('info', 'AWS driver initialized', {
      accountId: this._accountId,
      services: this._services,
      regions: this._regions
    });
  }

  async *_collectEc2Instances(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getEc2Client(region);
      const paginator = paginateDescribeInstances({ client }, {});
      for await (const page of paginator) {
        const reservations = page.Reservations || [];
        for (const reservation of reservations) {
          const instances = reservation.Instances || [];
          for (const instance of instances) {
            const instanceId = instance.InstanceId;
            if (!instanceId) continue;
            yield {
              provider: 'aws',
              accountId: this._accountId,
              region,
              service: 'ec2',
              resourceType: 'ec2.instance',
              resourceId: instanceId,
              name: extractInstanceName(instance as Ec2Instance),
              tags: extractEc2Tags(instance as Ec2Instance),
              configuration: sanitizeConfiguration(instance)
            } as unknown as CloudResource;
          }
        }
      }
    }
  }

  async *_collectS3Buckets(): AsyncGenerator<CloudResource> {
    const client = this._getS3Client();
    const response = await client.send(new ListBucketsCommand({}));
    const buckets = response.Buckets || [];

    for (const bucket of buckets) {
      const bucketName = bucket.Name;
      if (!bucketName) continue;

      const region = await this._resolveBucketRegion(client, bucketName);
      const tags = await this._resolveBucketTags(client, bucketName);

      yield {
        provider: 'aws',
        accountId: this._accountId,
        region,
        service: 's3',
        resourceType: 's3.bucket',
        resourceId: bucketName,
        name: bucketName,
        tags,
        configuration: sanitizeConfiguration({
          ...bucket,
          Region: region,
          Owner: response.Owner || null
        })
      } as unknown as CloudResource;
    }
  }

  async *_collectRdsInstances(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getRdsClient(region);
      const paginator = paginateDescribeDBInstances({ client }, {});
      for await (const page of paginator) {
        const instances = page.DBInstances || [];
        for (const instance of instances) {
          const resourceId = instance.DbiResourceId || instance.DBInstanceIdentifier;
          if (!resourceId) continue;
          const arn = instance.DBInstanceArn;
          const tags = await this._safeListTagsForResource(client, arn);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'rds',
            resourceType: 'rds.instance',
            resourceId,
            name: instance.DBInstanceIdentifier || resourceId,
            tags,
            configuration: sanitizeConfiguration(instance)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectIamIdentities(): AsyncGenerator<CloudResource> {
    const client = this._getIamClient();
    const userPaginator = paginateListUsers({ client }, {});
    for await (const page of userPaginator) {
      const users = page.Users || [];
      for (const user of users) {
        const tags = await this._safeListIamTags(client, new ListUserTagsCommand({ UserName: user.UserName }));
        yield {
          provider: 'aws',
          accountId: this._accountId,
          region: null,
          service: 'iam',
          resourceType: 'iam.user',
          resourceId: user.Arn || user.UserId || user.UserName,
          name: user.UserName,
          tags,
          configuration: sanitizeConfiguration(user)
        } as unknown as CloudResource;
      }
    }

    const rolePaginator = paginateListRoles({ client }, {});
    for await (const page of rolePaginator) {
      const roles = page.Roles || [];
      for (const role of roles) {
        const tags = await this._safeListIamTags(client, new ListRoleTagsCommand({ RoleName: role.RoleName }));
        yield {
          provider: 'aws',
          accountId: this._accountId,
          region: null,
          service: 'iam',
          resourceType: 'iam.role',
          resourceId: role.Arn || role.RoleId || role.RoleName,
          name: role.RoleName,
          tags,
          configuration: sanitizeConfiguration(role)
        } as unknown as CloudResource;
      }
    }
  }

  async *_collectLambdaFunctions(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getLambdaClient(region);
      const paginator = paginateListFunctions({ client }, {});
      for await (const page of paginator) {
        const functions = page.Functions || [];
        for (const lambda of functions) {
          const arn = lambda.FunctionArn;
          let tags: Record<string, string | null> | null = null;
          if (arn) {
            tags = await this._safeListLambdaTags(client, arn);
          }
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'lambda',
            resourceType: 'lambda.function',
            resourceId: arn || lambda.FunctionName,
            name: lambda.FunctionName,
            tags,
            configuration: sanitizeConfiguration(lambda)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectVpcResources(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getEc2Client(region);

      const vpcPaginator = paginateDescribeVpcs({ client }, {});
      for await (const page of vpcPaginator) {
        const vpcs = page.Vpcs || [];
        for (const vpc of vpcs) {
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'vpc',
            resourceType: 'vpc.vpc',
            resourceId: vpc.VpcId,
            name: extractEc2Tags(vpc as Ec2Instance)?.Name || vpc.VpcId,
            tags: extractEc2Tags(vpc as Ec2Instance),
            configuration: sanitizeConfiguration(vpc)
          } as unknown as CloudResource;
        }
      }

      const subnetPaginator = paginateDescribeSubnets({ client }, {});
      for await (const page of subnetPaginator) {
        const subnets = page.Subnets || [];
        for (const subnet of subnets) {
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'vpc',
            resourceType: 'vpc.subnet',
            resourceId: subnet.SubnetId,
            name: extractEc2Tags(subnet as Ec2Instance)?.Name || subnet.SubnetId,
            tags: extractEc2Tags(subnet as Ec2Instance),
            configuration: sanitizeConfiguration(subnet)
          } as unknown as CloudResource;
        }
      }

      const sgPaginator = paginateDescribeSecurityGroups({ client }, {});
      for await (const page of sgPaginator) {
        const groups = page.SecurityGroups || [];
        for (const sg of groups) {
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'vpc',
            resourceType: 'vpc.security-group',
            resourceId: sg.GroupId,
            name: sg.GroupName,
            tags: extractEc2Tags(sg as Ec2Instance),
            configuration: sanitizeConfiguration(sg)
          } as unknown as CloudResource;
        }
      }

      const rtPaginator = paginateDescribeRouteTables({ client }, {});
      for await (const page of rtPaginator) {
        const tables = page.RouteTables || [];
        for (const rt of tables) {
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'vpc',
            resourceType: 'vpc.route-table',
            resourceId: rt.RouteTableId,
            name: extractEc2Tags(rt as Ec2Instance)?.Name || rt.RouteTableId,
            tags: extractEc2Tags(rt as Ec2Instance),
            configuration: sanitizeConfiguration(rt)
          } as unknown as CloudResource;
        }
      }

      const igwPaginator = paginateDescribeInternetGateways({ client }, {});
      for await (const page of igwPaginator) {
        const gateways = page.InternetGateways || [];
        for (const igw of gateways) {
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'vpc',
            resourceType: 'vpc.internet-gateway',
            resourceId: igw.InternetGatewayId,
            name: extractEc2Tags(igw as Ec2Instance)?.Name || igw.InternetGatewayId,
            tags: extractEc2Tags(igw as Ec2Instance),
            configuration: sanitizeConfiguration(igw)
          } as unknown as CloudResource;
        }
      }

      const natPaginator = paginateDescribeNatGateways({ client }, {});
      for await (const page of natPaginator) {
        const gateways = page.NatGateways || [];
        for (const nat of gateways) {
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'vpc',
            resourceType: 'vpc.nat-gateway',
            resourceId: nat.NatGatewayId,
            name: extractEc2Tags(nat as Ec2Instance)?.Name || nat.NatGatewayId,
            tags: extractEc2Tags(nat as Ec2Instance),
            configuration: sanitizeConfiguration(nat)
          } as unknown as CloudResource;
        }
      }

      const aclPaginator = paginateDescribeNetworkAcls({ client }, {});
      for await (const page of aclPaginator) {
        const acls = page.NetworkAcls || [];
        for (const acl of acls) {
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'vpc',
            resourceType: 'vpc.network-acl',
            resourceId: acl.NetworkAclId,
            name: extractEc2Tags(acl as Ec2Instance)?.Name || acl.NetworkAclId,
            tags: extractEc2Tags(acl as Ec2Instance),
            configuration: sanitizeConfiguration(acl)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectLoadBalancers(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const elbClient = this._getElbClient(region);
      const classicPaginator = paginateDescribeClassicLoadBalancers({ client: elbClient }, {});
      for await (const page of classicPaginator) {
        const lbs = page.LoadBalancerDescriptions || [];
        for (const lb of lbs) {
          const tags = await this._safeListClassicLBTags(elbClient, lb.LoadBalancerName!);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'elb',
            resourceType: 'elb.classic',
            resourceId: lb.LoadBalancerName,
            name: lb.LoadBalancerName,
            tags,
            configuration: sanitizeConfiguration(lb)
          } as unknown as CloudResource;
        }
      }

      const elbv2Client = this._getElbv2Client(region);
      const v2Paginator = paginateDescribeLoadBalancers({ client: elbv2Client }, {});
      for await (const page of v2Paginator) {
        const lbs = page.LoadBalancers || [];
        for (const lb of lbs) {
          const arn = lb.LoadBalancerArn!;
          const tags = await this._safeListELBv2Tags(elbv2Client, [arn]);
          const lbType = lb.Type === 'application' ? 'alb' : lb.Type === 'network' ? 'nlb' : 'elb';
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: lbType,
            resourceType: `${lbType}.load-balancer`,
            resourceId: arn,
            name: lb.LoadBalancerName,
            tags,
            configuration: sanitizeConfiguration(lb)
          } as unknown as CloudResource;
        }
      }

      const tgPaginator = paginateDescribeTargetGroups({ client: elbv2Client }, {});
      for await (const page of tgPaginator) {
        const groups = page.TargetGroups || [];
        for (const tg of groups) {
          const arn = tg.TargetGroupArn!;
          const tags = await this._safeListELBv2Tags(elbv2Client, [arn]);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'elb',
            resourceType: 'elb.target-group',
            resourceId: arn,
            name: tg.TargetGroupName,
            tags,
            configuration: sanitizeConfiguration(tg)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectDynamoDBTables(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getDynamoDBClient(region);
      const paginator = paginateListTables({ client }, {});
      for await (const page of paginator) {
        const tables = page.TableNames || [];
        for (const tableName of tables) {
          const description = await client.send(new DescribeTableCommand({ TableName: tableName }));
          const table = description.Table;
          const arn = table?.TableArn;
          let tags: Record<string, string | null> | null = null;
          if (arn) {
            tags = await this._safeListDynamoDBTags(client, arn);
          }
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'dynamodb',
            resourceType: 'dynamodb.table',
            resourceId: arn || tableName,
            name: tableName,
            tags,
            configuration: sanitizeConfiguration(table)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectSQSQueues(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getSqsClient(region);
      const paginator = paginateListQueues({ client }, {});
      for await (const page of paginator) {
        const urls = page.QueueUrls || [];
        for (const queueUrl of urls) {
          const attributes = await this._safeGetQueueAttributes(client, queueUrl);
          const tags = await this._safeListQueueTags(client, queueUrl);
          const queueName = queueUrl.split('/').pop();
          const arn = attributes?.QueueArn;
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'sqs',
            resourceType: 'sqs.queue',
            resourceId: arn || queueUrl,
            name: queueName,
            tags,
            configuration: sanitizeConfiguration({ ...attributes, QueueUrl: queueUrl })
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectSNSTopics(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getSnsClient(region);
      const paginator = paginateListTopics({ client }, {});
      for await (const page of paginator) {
        const topics = page.Topics || [];
        for (const topic of topics) {
          const arn = topic.TopicArn!;
          const attributes = await this._safeGetTopicAttributes(client, arn);
          const tags = await this._safeListSNSTags(client, arn);
          const topicName = arn?.split(':').pop();
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'sns',
            resourceType: 'sns.topic',
            resourceId: arn,
            name: topicName,
            tags,
            configuration: sanitizeConfiguration({ ...attributes, TopicArn: arn })
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectECSResources(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getEcsClient(region);

      const clusterPaginator = paginateListClusters({ client }, {});
      for await (const page of clusterPaginator) {
        const arns = page.clusterArns || [];
        for (const arn of arns) {
          const tags = await this._safeListECSTags(client, arn);
          const name = arn.split('/').pop();
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'ecs',
            resourceType: 'ecs.cluster',
            resourceId: arn,
            name,
            tags,
            configuration: sanitizeConfiguration({ clusterArn: arn })
          } as unknown as CloudResource;

          const servicePaginator = paginateListServices({ client }, { cluster: arn });
          for await (const servicePage of servicePaginator) {
            const serviceArns = servicePage.serviceArns || [];
            if (serviceArns.length === 0) continue;
            const described = await client.send(new DescribeServicesCommand({
              cluster: arn,
              services: serviceArns,
              include: ['TAGS']
            }));
            const services = described.services || [];
            for (const service of services) {
              yield {
                provider: 'aws',
                accountId: this._accountId,
                region,
                service: 'ecs',
                resourceType: 'ecs.service',
                resourceId: service.serviceArn,
                name: service.serviceName,
                tags: buildTagObject(service.tags as TagEntry[]),
                configuration: sanitizeConfiguration(service)
              } as unknown as CloudResource;
            }
          }
        }
      }

      const taskDefPaginator = paginateListTaskDefinitions({ client }, {});
      for await (const page of taskDefPaginator) {
        const arns = page.taskDefinitionArns || [];
        for (const arn of arns) {
          const described = await client.send(new DescribeTaskDefinitionCommand({
            taskDefinition: arn,
            include: ['TAGS']
          }));
          const taskDef = described.taskDefinition;
          const tags = buildTagObject(described.tags as TagEntry[]);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'ecs',
            resourceType: 'ecs.task-definition',
            resourceId: taskDef?.taskDefinitionArn || arn,
            name: taskDef?.family,
            tags,
            configuration: sanitizeConfiguration(taskDef)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectEKSClusters(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getEksClient(region);
      const clusterPaginator = paginateListEKSClusters({ client }, {});
      for await (const page of clusterPaginator) {
        const names = page.clusters || [];
        for (const name of names) {
          const described = await client.send(new DescribeClusterCommand({ name }));
          const cluster = described.cluster;
          const arn = cluster?.arn;
          const tags = await this._safeListEKSTags(client, arn);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'eks',
            resourceType: 'eks.cluster',
            resourceId: arn || name,
            name,
            tags,
            configuration: sanitizeConfiguration(cluster)
          } as unknown as CloudResource;

          const ngPaginator = paginateListNodegroups({ client }, { clusterName: name });
          for await (const ngPage of ngPaginator) {
            const nodegroups = ngPage.nodegroups || [];
            for (const ngName of nodegroups) {
              const ngDescribed = await client.send(new DescribeNodegroupCommand({
                clusterName: name,
                nodegroupName: ngName
              }));
              const ng = ngDescribed.nodegroup;
              const ngArn = ng?.nodegroupArn;
              const ngTags = await this._safeListEKSTags(client, ngArn);
              yield {
                provider: 'aws',
                accountId: this._accountId,
                region,
                service: 'eks',
                resourceType: 'eks.nodegroup',
                resourceId: ngArn || ngName,
                name: ngName,
                tags: ngTags,
                configuration: sanitizeConfiguration(ng)
              } as unknown as CloudResource;
            }
          }
        }
      }
    }
  }

  async *_collectAPIGateways(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const v1Client = this._getApiGatewayClient(region);
      const v1Paginator = paginateGetRestApis({ client: v1Client }, {});
      for await (const page of v1Paginator) {
        const apis = page.items || [];
        for (const api of apis) {
          const tags = await this._safeGetAPIGatewayTags(v1Client, api.id!, region);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'apigateway',
            resourceType: 'apigateway.rest-api',
            resourceId: api.id,
            name: api.name,
            tags,
            configuration: sanitizeConfiguration(api)
          } as unknown as CloudResource;
        }
      }

      const v2Client = this._getApiGatewayV2Client(region);
      let nextToken: string | undefined;
      do {
        const response = await v2Client.send(new GetApisCommand({ NextToken: nextToken }));
        const apis = response.Items || [];
        nextToken = response.NextToken;

        for (const api of apis) {
          const tags = await this._safeGetAPIGatewayV2Tags(v2Client, api.ApiId!);
          const type = api.ProtocolType?.toLowerCase() || 'http';
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'apigateway',
            resourceType: `apigateway.${type}-api`,
            resourceId: api.ApiId,
            name: api.Name,
            tags,
            configuration: sanitizeConfiguration(api)
          } as unknown as CloudResource;
        }
      } while (nextToken);
    }
  }

  async *_collectCloudFrontDistributions(): AsyncGenerator<CloudResource> {
    const client = this._getCloudFrontClient();
    const paginator = paginateListDistributions({ client }, {});
    for await (const page of paginator) {
      const items = page.DistributionList?.Items || [];
      for (const dist of items) {
        const arn = dist.ARN!;
        const tags = await this._safeListCloudFrontTags(client, arn);
        yield {
          provider: 'aws',
          accountId: this._accountId,
          region: null,
          service: 'cloudfront',
          resourceType: 'cloudfront.distribution',
          resourceId: dist.Id,
          name: dist.DomainName,
          tags,
          configuration: sanitizeConfiguration(dist)
        } as unknown as CloudResource;
      }
    }
  }

  async *_collectRoute53HostedZones(): AsyncGenerator<CloudResource> {
    const client = this._getRoute53Client();
    const paginator = paginateListHostedZones({ client }, {});
    for await (const page of paginator) {
      const zones = page.HostedZones || [];
      for (const zone of zones) {
        const zoneId = zone.Id?.replace('/hostedzone/', '');
        const tags = await this._safeListRoute53Tags(client, zone.Id!);
        yield {
          provider: 'aws',
          accountId: this._accountId,
          region: null,
          service: 'route53',
          resourceType: 'route53.hosted-zone',
          resourceId: zoneId,
          name: zone.Name,
          tags,
          configuration: sanitizeConfiguration(zone)
        } as unknown as CloudResource;
      }
    }
  }

  async *_collectKMSKeys(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getKmsClient(region);
      const paginator = paginateListKeys({ client }, {});
      for await (const page of paginator) {
        const keys = page.Keys || [];
        for (const key of keys) {
          const described = await client.send(new DescribeKeyCommand({ KeyId: key.KeyId }));
          const metadata = described.KeyMetadata;
          const tags = await this._safeListKMSTags(client, key.KeyId!);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'kms',
            resourceType: 'kms.key',
            resourceId: metadata?.Arn || key.KeyId,
            name: metadata?.Description || key.KeyId,
            tags,
            configuration: sanitizeConfiguration(metadata)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectSecretsManagerSecrets(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getSecretsManagerClient(region);
      const paginator = paginateListSecrets({ client }, {});
      for await (const page of paginator) {
        const secrets = page.SecretList || [];
        for (const secret of secrets) {
          const described = await client.send(new DescribeSecretCommand({ SecretId: secret.ARN }));
          const tags = buildTagObject(described.Tags as TagEntry[]);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'secretsmanager',
            resourceType: 'secretsmanager.secret',
            resourceId: described.ARN || secret.ARN,
            name: described.Name || secret.Name,
            tags,
            configuration: sanitizeConfiguration(described)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectSSMParameters(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getSsmClient(region);
      const paginator = paginateDescribeParameters({ client }, {});
      for await (const page of paginator) {
        const params = page.Parameters || [];
        for (const param of params) {
          const tags = await this._safeListSSMTags(client, param.Name!);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'ssm',
            resourceType: 'ssm.parameter',
            resourceId: param.Name,
            name: param.Name,
            tags,
            configuration: sanitizeConfiguration(param)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectElastiCacheClusters(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getElastiCacheClient(region);
      const paginator = paginateDescribeCacheClusters({ client }, { ShowCacheNodeInfo: true });
      for await (const page of paginator) {
        const clusters = page.CacheClusters || [];
        for (const cluster of clusters) {
          const arn = cluster.ARN;
          const tags = await this._safeListElastiCacheTags(client, arn);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'elasticache',
            resourceType: 'elasticache.cluster',
            resourceId: arn || cluster.CacheClusterId,
            name: cluster.CacheClusterId,
            tags,
            configuration: sanitizeConfiguration(cluster)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectEFSFileSystems(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getEfsClient(region);
      const paginator = paginateDescribeFileSystems({ client }, {});
      for await (const page of paginator) {
        const filesystems = page.FileSystems || [];
        for (const fs of filesystems) {
          const tags = await this._safeDescribeEFSTags(client, fs.FileSystemId!);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'efs',
            resourceType: 'efs.filesystem',
            resourceId: fs.FileSystemArn || fs.FileSystemId,
            name: fs.Name || fs.FileSystemId,
            tags,
            configuration: sanitizeConfiguration(fs)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectECRRepositories(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getEcrClient(region);
      const paginator = paginateDescribeRepositories({ client }, {});
      for await (const page of paginator) {
        const repos = page.repositories || [];
        for (const repo of repos) {
          const tags = await this._safeListECRTags(client, repo.repositoryArn!);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'ecr',
            resourceType: 'ecr.repository',
            resourceId: repo.repositoryArn,
            name: repo.repositoryName,
            tags,
            configuration: sanitizeConfiguration(repo)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectStepFunctionsStateMachines(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getSfnClient(region);
      const paginator = paginateListStateMachines({ client }, {});
      for await (const page of paginator) {
        const machines = page.stateMachines || [];
        for (const machine of machines) {
          const tags = await this._safeListSFNTags(client, machine.stateMachineArn!);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'stepfunctions',
            resourceType: 'stepfunctions.statemachine',
            resourceId: machine.stateMachineArn,
            name: machine.name,
            tags,
            configuration: sanitizeConfiguration(machine)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectEventBridgeResources(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getEventBridgeClient(region);

      let nextBusToken: string | undefined;
      do {
        const busResponse = await client.send(new ListEventBusesCommand({ NextToken: nextBusToken }));
        const buses = busResponse.EventBuses || [];
        nextBusToken = busResponse.NextToken;

        for (const bus of buses) {
          const tags = await this._safeListEventBridgeTags(client, bus.Arn);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'eventbridge',
            resourceType: 'eventbridge.bus',
            resourceId: bus.Arn || bus.Name,
            name: bus.Name,
            tags,
            configuration: sanitizeConfiguration(bus)
          } as unknown as CloudResource;
        }
      } while (nextBusToken);

      let nextRuleToken: string | undefined;
      do {
        const ruleResponse = await client.send(new ListRulesCommand({ NextToken: nextRuleToken }));
        const rules = ruleResponse.Rules || [];
        nextRuleToken = ruleResponse.NextToken;

        for (const rule of rules) {
          const tags = await this._safeListEventBridgeTags(client, rule.Arn);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'eventbridge',
            resourceType: 'eventbridge.rule',
            resourceId: rule.Arn || rule.Name,
            name: rule.Name,
            tags,
            configuration: sanitizeConfiguration(rule)
          } as unknown as CloudResource;
        }
      } while (nextRuleToken);
    }
  }

  async *_collectCloudWatchResources(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const cwClient = this._getCloudWatchClient(region);
      const alarmPaginator = paginateDescribeAlarms({ client: cwClient }, {});
      for await (const page of alarmPaginator) {
        const alarms = page.MetricAlarms || [];
        for (const alarm of alarms) {
          const tags = await this._safeListCloudWatchTags(cwClient, alarm.AlarmArn);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'cloudwatch',
            resourceType: 'cloudwatch.alarm',
            resourceId: alarm.AlarmArn || alarm.AlarmName,
            name: alarm.AlarmName,
            tags,
            configuration: sanitizeConfiguration(alarm)
          } as unknown as CloudResource;
        }
      }

      const logsClient = this._getCloudWatchLogsClient(region);
      const logsPaginator = paginateDescribeLogGroups({ client: logsClient }, {});
      for await (const page of logsPaginator) {
        const groups = page.logGroups || [];
        for (const group of groups) {
          const tags = await this._safeListCWLogsTags(logsClient, group.logGroupName!);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'logs',
            resourceType: 'logs.group',
            resourceId: group.arn || group.logGroupName,
            name: group.logGroupName,
            tags,
            configuration: sanitizeConfiguration(group)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectCloudTrails(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getCloudTrailClient(region);
      const paginator = paginateListTrails({ client }, {});
      for await (const page of paginator) {
        const trails = page.Trails || [];
        for (const trailInfo of trails) {
          const described = await client.send(new GetTrailCommand({ Name: trailInfo.TrailARN || trailInfo.Name }));
          const trail = described.Trail;
          const tags = await this._safeListCloudTrailTags(client, trail?.TrailARN);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'cloudtrail',
            resourceType: 'cloudtrail.trail',
            resourceId: trail?.TrailARN || trail?.Name,
            name: trail?.Name,
            tags,
            configuration: sanitizeConfiguration(trail)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectConfigResources(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getConfigServiceClient(region);

      const recorderResponse = await client.send(new DescribeConfigurationRecordersCommand({}));
      const recorders = recorderResponse.ConfigurationRecorders || [];
      for (const recorder of recorders) {
        yield {
          provider: 'aws',
          accountId: this._accountId,
          region,
          service: 'config',
          resourceType: 'config.recorder',
          resourceId: recorder.name,
          name: recorder.name,
          tags: null,
          configuration: sanitizeConfiguration(recorder)
        } as unknown as CloudResource;
      }

      const channelResponse = await client.send(new DescribeDeliveryChannelsCommand({}));
      const channels = channelResponse.DeliveryChannels || [];
      for (const channel of channels) {
        yield {
          provider: 'aws',
          accountId: this._accountId,
          region,
          service: 'config',
          resourceType: 'config.delivery-channel',
          resourceId: channel.name,
          name: channel.name,
          tags: null,
          configuration: sanitizeConfiguration(channel)
        } as unknown as CloudResource;
      }
    }
  }

  async *_collectACMCertificates(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getAcmClient(region);
      const paginator = paginateListCertificates({ client }, {});
      for await (const page of paginator) {
        const certs = page.CertificateSummaryList || [];
        for (const certSummary of certs) {
          const arn = certSummary.CertificateArn!;
          const described = await client.send(new DescribeCertificateCommand({ CertificateArn: arn }));
          const cert = described.Certificate;
          const tags = await this._safeListACMTags(client, arn);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'acm',
            resourceType: 'acm.certificate',
            resourceId: arn,
            name: cert?.DomainName,
            tags,
            configuration: sanitizeConfiguration(cert)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectWAFResources(): AsyncGenerator<CloudResource> {
    const wafClient = this._getWafClient();
    let nextMarker: string | undefined;
    do {
      const response = await wafClient.send(new ListWAFWebACLsCommand({ NextMarker: nextMarker }));
      const webACLs = response.WebACLs || [];
      nextMarker = response.NextMarker;

      for (const acl of webACLs) {
        const tags = await this._safeListWAFTags(wafClient, acl.WebACLId!);
        yield {
          provider: 'aws',
          accountId: this._accountId,
          region: null,
          service: 'waf',
          resourceType: 'waf.webacl',
          resourceId: acl.WebACLId,
          name: acl.Name,
          tags,
          configuration: sanitizeConfiguration(acl)
        } as unknown as CloudResource;
      }
    } while (nextMarker);
  }

  async *_collectWAFV2Resources(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getWafv2Client(region);

      let nextMarker: string | undefined;
      do {
        const response = await client.send(new ListWAFV2WebACLsCommand({ Scope: 'REGIONAL', NextMarker: nextMarker }));
        const webACLs = response.WebACLs || [];
        nextMarker = response.NextMarker;

        for (const acl of webACLs) {
          const tags = await this._safeListWAFV2Tags(client, acl.ARN!);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'wafv2',
            resourceType: 'wafv2.webacl',
            resourceId: acl.ARN,
            name: acl.Name,
            tags,
            configuration: sanitizeConfiguration(acl)
          } as unknown as CloudResource;
        }
      } while (nextMarker);
    }

    const cfClient = this._getWafv2Client(GLOBAL_REGION);
    let cfNextMarker: string | undefined;
    do {
      const cfResponse = await cfClient.send(new ListWAFV2WebACLsCommand({ Scope: 'CLOUDFRONT', NextMarker: cfNextMarker }));
      const webACLs = cfResponse.WebACLs || [];
      cfNextMarker = cfResponse.NextMarker;

      for (const acl of webACLs) {
        const tags = await this._safeListWAFV2Tags(cfClient, acl.ARN!);
        yield {
          provider: 'aws',
          accountId: this._accountId,
          region: GLOBAL_REGION,
          service: 'wafv2',
          resourceType: 'wafv2.webacl-cloudfront',
          resourceId: acl.ARN,
          name: acl.Name,
          tags,
          configuration: sanitizeConfiguration(acl)
        } as unknown as CloudResource;
      }
    } while (cfNextMarker);
  }

  async *_collectCognitoUserPools(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getCognitoClient(region);
      const paginator = paginateListUserPools({ client }, { MaxResults: 60 });
      for await (const page of paginator) {
        const pools = page.UserPools || [];
        for (const pool of pools) {
          const described = await client.send(new DescribeUserPoolCommand({ UserPoolId: pool.Id }));
          const fullPool = described.UserPool;
          const tags = await this._safeListCognitoTags(client, fullPool?.Arn);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'cognito',
            resourceType: 'cognito.userpool',
            resourceId: fullPool?.Arn || pool.Id,
            name: pool.Name,
            tags,
            configuration: sanitizeConfiguration(fullPool)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectEBSResources(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getEc2Client(region);

      const volPaginator = paginateDescribeVolumes({ client }, {});
      for await (const page of volPaginator) {
        const volumes = page.Volumes || [];
        for (const volume of volumes) {
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'ebs',
            resourceType: 'ebs.volume',
            resourceId: volume.VolumeId,
            name: extractEc2Tags(volume as Ec2Instance)?.Name || volume.VolumeId,
            tags: extractEc2Tags(volume as Ec2Instance),
            configuration: sanitizeConfiguration(volume)
          } as unknown as CloudResource;
        }
      }

      const snapPaginator = paginateDescribeEBSSnapshots({ client }, { OwnerIds: ['self'] });
      for await (const page of snapPaginator) {
        const snapshots = page.Snapshots || [];
        for (const snapshot of snapshots) {
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'ebs',
            resourceType: 'ebs.snapshot',
            resourceId: snapshot.SnapshotId,
            name: extractEc2Tags(snapshot as Ec2Instance)?.Name || snapshot.SnapshotId,
            tags: extractEc2Tags(snapshot as Ec2Instance),
            configuration: sanitizeConfiguration(snapshot)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectVPNResources(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getEc2Client(region);

      const vpnResult = await client.send(new DescribeVpnConnectionsCommand({}));
      const connections = vpnResult.VpnConnections || [];
      for (const vpn of connections) {
        yield {
          provider: 'aws',
          accountId: this._accountId,
          region,
          service: 'vpn',
          resourceType: 'vpn.connection',
          resourceId: vpn.VpnConnectionId,
          name: extractEc2Tags(vpn as Ec2Instance)?.Name || vpn.VpnConnectionId,
          tags: extractEc2Tags(vpn as Ec2Instance),
          configuration: sanitizeConfiguration(vpn)
        } as unknown as CloudResource;
      }

      const cgwResult = await client.send(new DescribeCustomerGatewaysCommand({}));
      const gateways = cgwResult.CustomerGateways || [];
      for (const cgw of gateways) {
        yield {
          provider: 'aws',
          accountId: this._accountId,
          region,
          service: 'vpn',
          resourceType: 'vpn.customer-gateway',
          resourceId: cgw.CustomerGatewayId,
          name: extractEc2Tags(cgw as Ec2Instance)?.Name || cgw.CustomerGatewayId,
          tags: extractEc2Tags(cgw as Ec2Instance),
          configuration: sanitizeConfiguration(cgw)
        } as unknown as CloudResource;
      }
    }
  }

  async *_collectTransitGatewayResources(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getEc2Client(region);

      const tgwResult = await client.send(new DescribeTransitGatewaysCommand({}));
      const gateways = tgwResult.TransitGateways || [];
      for (const tgw of gateways) {
        yield {
          provider: 'aws',
          accountId: this._accountId,
          region,
          service: 'transitgateway',
          resourceType: 'transitgateway.gateway',
          resourceId: tgw.TransitGatewayId,
          name: extractEc2Tags(tgw as Ec2Instance)?.Name || tgw.TransitGatewayId,
          tags: extractEc2Tags(tgw as Ec2Instance),
          configuration: sanitizeConfiguration(tgw)
        } as unknown as CloudResource;
      }

      const attResult = await client.send(new DescribeTransitGatewayAttachmentsCommand({}));
      const attachments = attResult.TransitGatewayAttachments || [];
      for (const att of attachments) {
        yield {
          provider: 'aws',
          accountId: this._accountId,
          region,
          service: 'transitgateway',
          resourceType: 'transitgateway.attachment',
          resourceId: att.TransitGatewayAttachmentId,
          name: extractEc2Tags(att as Ec2Instance)?.Name || att.TransitGatewayAttachmentId,
          tags: extractEc2Tags(att as Ec2Instance),
          configuration: sanitizeConfiguration(att)
        } as unknown as CloudResource;
      }
    }
  }

  async *_collectBackupResources(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getBackupClient(region);

      const planPaginator = paginateListBackupPlans({ client }, {});
      for await (const page of planPaginator) {
        const plans = page.BackupPlansList || [];
        for (const plan of plans) {
          const tags = await this._safeListBackupTags(client, plan.BackupPlanArn!);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'backup',
            resourceType: 'backup.plan',
            resourceId: plan.BackupPlanArn,
            name: plan.BackupPlanName,
            tags,
            configuration: sanitizeConfiguration(plan)
          } as unknown as CloudResource;
        }
      }

      const vaultPaginator = paginateListBackupVaults({ client }, {});
      for await (const page of vaultPaginator) {
        const vaults = page.BackupVaultList || [];
        for (const vault of vaults) {
          const tags = await this._safeListBackupTags(client, vault.BackupVaultArn!);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'backup',
            resourceType: 'backup.vault',
            resourceId: vault.BackupVaultArn,
            name: vault.BackupVaultName,
            tags,
            configuration: sanitizeConfiguration(vault)
          } as unknown as CloudResource;
        }
      }
    }
  }

  async *_collectKinesisStreams(): AsyncGenerator<CloudResource> {
    for (const region of this._regions) {
      const client = this._getKinesisClient(region);
      const paginator = paginateListStreams({ client }, {});
      for await (const page of paginator) {
        const streamNames = page.StreamNames || [];
        for (const streamName of streamNames) {
          const described = await client.send(new DescribeStreamCommand({ StreamName: streamName }));
          const stream = described.StreamDescription;
          const arn = stream?.StreamARN;
          const tags = await this._safeListKinesisTags(client, streamName);
          yield {
            provider: 'aws',
            accountId: this._accountId,
            region,
            service: 'kinesis',
            resourceType: 'kinesis.stream',
            resourceId: arn || streamName,
            name: streamName,
            tags,
            configuration: sanitizeConfiguration(stream)
          } as unknown as CloudResource;
        }
      }
    }
  }

  override async *listResources(options: ListResourcesOptions = {}): AsyncGenerator<CloudResource> {
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
      ec2: this._collectEc2Instances.bind(this),
      s3: this._collectS3Buckets.bind(this),
      rds: this._collectRdsInstances.bind(this),
      iam: this._collectIamIdentities.bind(this),
      lambda: this._collectLambdaFunctions.bind(this),
      vpc: this._collectVpcResources.bind(this),
      elb: this._collectLoadBalancers.bind(this),
      alb: this._collectLoadBalancers.bind(this),
      nlb: this._collectLoadBalancers.bind(this),
      dynamodb: this._collectDynamoDBTables.bind(this),
      sqs: this._collectSQSQueues.bind(this),
      sns: this._collectSNSTopics.bind(this),
      ecs: this._collectECSResources.bind(this),
      eks: this._collectEKSClusters.bind(this),
      apigateway: this._collectAPIGateways.bind(this),
      cloudfront: this._collectCloudFrontDistributions.bind(this),
      route53: this._collectRoute53HostedZones.bind(this),
      kms: this._collectKMSKeys.bind(this),
      secretsmanager: this._collectSecretsManagerSecrets.bind(this),
      ssm: this._collectSSMParameters.bind(this),
      elasticache: this._collectElastiCacheClusters.bind(this),
      efs: this._collectEFSFileSystems.bind(this),
      ecr: this._collectECRRepositories.bind(this),
      stepfunctions: this._collectStepFunctionsStateMachines.bind(this),
      eventbridge: this._collectEventBridgeResources.bind(this),
      cloudwatch: this._collectCloudWatchResources.bind(this),
      logs: this._collectCloudWatchResources.bind(this),
      cloudtrail: this._collectCloudTrails.bind(this),
      config: this._collectConfigResources.bind(this),
      acm: this._collectACMCertificates.bind(this),
      waf: this._collectWAFResources.bind(this),
      wafv2: this._collectWAFV2Resources.bind(this),
      cognito: this._collectCognitoUserPools.bind(this),
      ebs: this._collectEBSResources.bind(this),
      vpn: this._collectVPNResources.bind(this),
      transitgateway: this._collectTransitGatewayResources.bind(this),
      backup: this._collectBackupResources.bind(this),
      kinesis: this._collectKinesisStreams.bind(this)
    };

    for (const service of this._services) {
      if (!collectors[service]) {
        this.logger('debug', 'AWS service collector not implemented, skipping', { service });
        continue;
      }
      if (!shouldCollect(service, includeSet, excludeSet)) {
        this.logger('debug', 'AWS service filtered out', { service });
        continue;
      }

      try {
        for await (const resource of collectors[service]()) {
          if (emitProgress) {
            emitProgress({
              service,
              resourceId: resource.resourceId as string,
              resourceType: resource.resourceType as string
            });
          }
          yield resource;
        }
      } catch (err) {
        const error = err as Error;
        this.logger('error', 'AWS service collection failed, skipping to next service', {
          service,
          error: error.message,
          errorName: error.name,
          stack: error.stack
        });
      }
    }
  }

  private async _initializeSts(): Promise<void> {
    if (this._accountId) return;
    const client = this._getStsClient();
    const response = await client.send(new GetCallerIdentityCommand({}));
    this._accountId = response.Account || null;
  }

  private _getStsClient(): STSClient {
    if (!this._clients.sts) {
      const awsConfig = this.config as AwsConfig | undefined;
      this._clients.sts = new STSClient({
        region: awsConfig?.region || GLOBAL_REGION,
        credentials: this._credentialProvider
      });
    }
    return this._clients.sts;
  }

  private _getEc2Client(region: string): EC2Client {
    if (!this._clients.ec2.has(region)) {
      this._clients.ec2.set(region, new EC2Client({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.ec2.get(region)!;
  }

  private _getS3Client(): S3Client {
    if (!this._clients.s3) {
      const awsConfig = this.config as AwsConfig | undefined;
      this._clients.s3 = new S3Client({
        region: awsConfig?.s3Region || GLOBAL_REGION,
        credentials: this._credentialProvider
      });
    }
    return this._clients.s3;
  }

  private _getRdsClient(region: string): RDSClient {
    if (!this._clients.rds.has(region)) {
      this._clients.rds.set(region, new RDSClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.rds.get(region)!;
  }

  private _getIamClient(): IAMClient {
    if (!this._clients.iam) {
      const awsConfig = this.config as AwsConfig | undefined;
      this._clients.iam = new IAMClient({
        region: awsConfig?.iamRegion || GLOBAL_REGION,
        credentials: this._credentialProvider
      });
    }
    return this._clients.iam;
  }

  private _getLambdaClient(region: string): LambdaClient {
    if (!this._clients.lambda.has(region)) {
      this._clients.lambda.set(region, new LambdaClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.lambda.get(region)!;
  }

  private _getElbClient(region: string): ElasticLoadBalancingClient {
    if (!this._clients.elb.has(region)) {
      this._clients.elb.set(region, new ElasticLoadBalancingClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.elb.get(region)!;
  }

  private _getElbv2Client(region: string): ElasticLoadBalancingV2Client {
    if (!this._clients.elbv2.has(region)) {
      this._clients.elbv2.set(region, new ElasticLoadBalancingV2Client({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.elbv2.get(region)!;
  }

  private _getDynamoDBClient(region: string): DynamoDBClient {
    if (!this._clients.dynamodb.has(region)) {
      this._clients.dynamodb.set(region, new DynamoDBClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.dynamodb.get(region)!;
  }

  private _getSqsClient(region: string): SQSClient {
    if (!this._clients.sqs.has(region)) {
      this._clients.sqs.set(region, new SQSClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.sqs.get(region)!;
  }

  private _getSnsClient(region: string): SNSClient {
    if (!this._clients.sns.has(region)) {
      this._clients.sns.set(region, new SNSClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.sns.get(region)!;
  }

  private _getEcsClient(region: string): ECSClient {
    if (!this._clients.ecs.has(region)) {
      this._clients.ecs.set(region, new ECSClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.ecs.get(region)!;
  }

  private _getEksClient(region: string): EKSClient {
    if (!this._clients.eks.has(region)) {
      this._clients.eks.set(region, new EKSClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.eks.get(region)!;
  }

  private _getApiGatewayClient(region: string): APIGatewayClient {
    if (!this._clients.apigateway.has(region)) {
      this._clients.apigateway.set(region, new APIGatewayClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.apigateway.get(region)!;
  }

  private _getApiGatewayV2Client(region: string): ApiGatewayV2Client {
    if (!this._clients.apigatewayv2.has(region)) {
      this._clients.apigatewayv2.set(region, new ApiGatewayV2Client({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.apigatewayv2.get(region)!;
  }

  private _getCloudFrontClient(): CloudFrontClient {
    if (!this._clients.cloudfront) {
      this._clients.cloudfront = new CloudFrontClient({
        region: GLOBAL_REGION,
        credentials: this._credentialProvider
      });
    }
    return this._clients.cloudfront;
  }

  private _getRoute53Client(): Route53Client {
    if (!this._clients.route53) {
      this._clients.route53 = new Route53Client({
        region: GLOBAL_REGION,
        credentials: this._credentialProvider
      });
    }
    return this._clients.route53;
  }

  private _getKmsClient(region: string): KMSClient {
    if (!this._clients.kms.has(region)) {
      this._clients.kms.set(region, new KMSClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.kms.get(region)!;
  }

  private _getSecretsManagerClient(region: string): SecretsManagerClient {
    if (!this._clients.secretsmanager.has(region)) {
      this._clients.secretsmanager.set(region, new SecretsManagerClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.secretsmanager.get(region)!;
  }

  private _getSsmClient(region: string): SSMClient {
    if (!this._clients.ssm.has(region)) {
      this._clients.ssm.set(region, new SSMClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.ssm.get(region)!;
  }

  private _getElastiCacheClient(region: string): ElastiCacheClient {
    if (!this._clients.elasticache.has(region)) {
      this._clients.elasticache.set(region, new ElastiCacheClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.elasticache.get(region)!;
  }

  private _getEfsClient(region: string): EFSClient {
    if (!this._clients.efs.has(region)) {
      this._clients.efs.set(region, new EFSClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.efs.get(region)!;
  }

  private _getEcrClient(region: string): ECRClient {
    if (!this._clients.ecr.has(region)) {
      this._clients.ecr.set(region, new ECRClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.ecr.get(region)!;
  }

  private _getSfnClient(region: string): SFNClient {
    if (!this._clients.sfn.has(region)) {
      this._clients.sfn.set(region, new SFNClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.sfn.get(region)!;
  }

  private _getEventBridgeClient(region: string): EventBridgeClient {
    if (!this._clients.eventbridge.has(region)) {
      this._clients.eventbridge.set(region, new EventBridgeClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.eventbridge.get(region)!;
  }

  private _getCloudWatchClient(region: string): CloudWatchClient {
    if (!this._clients.cloudwatch.has(region)) {
      this._clients.cloudwatch.set(region, new CloudWatchClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.cloudwatch.get(region)!;
  }

  private _getCloudWatchLogsClient(region: string): CloudWatchLogsClient {
    if (!this._clients.logs.has(region)) {
      this._clients.logs.set(region, new CloudWatchLogsClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.logs.get(region)!;
  }

  private _getCloudTrailClient(region: string): CloudTrailClient {
    if (!this._clients.cloudtrail.has(region)) {
      this._clients.cloudtrail.set(region, new CloudTrailClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.cloudtrail.get(region)!;
  }

  private _getConfigServiceClient(region: string): ConfigServiceClient {
    if (!this._clients.config.has(region)) {
      this._clients.config.set(region, new ConfigServiceClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.config.get(region)!;
  }

  private _getAcmClient(region: string): ACMClient {
    if (!this._clients.acm.has(region)) {
      this._clients.acm.set(region, new ACMClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.acm.get(region)!;
  }

  private _getWafClient(): WAFClient {
    if (!this._clients.waf) {
      this._clients.waf = new WAFClient({
        region: GLOBAL_REGION,
        credentials: this._credentialProvider
      });
    }
    return this._clients.waf;
  }

  private _getWafv2Client(region: string): WAFV2Client {
    if (!this._clients.wafv2.has(region)) {
      this._clients.wafv2.set(region, new WAFV2Client({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.wafv2.get(region)!;
  }

  private _getCognitoClient(region: string): CognitoIdentityProviderClient {
    if (!this._clients.cognito.has(region)) {
      this._clients.cognito.set(region, new CognitoIdentityProviderClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.cognito.get(region)!;
  }

  private _getBackupClient(region: string): BackupClient {
    if (!this._clients.backup.has(region)) {
      this._clients.backup.set(region, new BackupClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.backup.get(region)!;
  }

  private _getKinesisClient(region: string): KinesisClient {
    if (!this._clients.kinesis.has(region)) {
      this._clients.kinesis.set(region, new KinesisClient({
        region,
        credentials: this._credentialProvider
      }));
    }
    return this._clients.kinesis.get(region)!;
  }

  private async _resolveBucketRegion(client: S3Client, bucketName: string): Promise<string | null> {
    try {
      const output = await client.send(new GetBucketLocationCommand({ Bucket: bucketName }));
      if (!output?.LocationConstraint) return 'us-east-1';
      if (output.LocationConstraint === 'EU') return 'eu-west-1';
      return output.LocationConstraint;
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to resolve bucket region', { bucketName, error: error.message });
      return null;
    }
  }

  private async _resolveBucketTags(client: S3Client, bucketName: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new GetBucketTaggingCommand({ Bucket: bucketName }));
      return buildTagObject(output?.TagSet as TagEntry[]);
    } catch (err) {
      const error = err as Error & { name?: string; $metadata?: { httpStatusCode?: number } };
      if (error?.name === 'NoSuchTagSet' || error?.$metadata?.httpStatusCode === 404) {
        return null;
      }
      this.logger('warn', 'Failed to resolve bucket tags', { bucketName, error: error.message });
      return null;
    }
  }

  private async _safeListTagsForResource(client: RDSClient, arn: string | undefined): Promise<Record<string, string | null> | null> {
    if (!arn) return null;
    try {
      const output = await client.send(new ListTagsForResourceCommand({ ResourceName: arn }));
      return buildTagObject(output?.TagList as TagEntry[]);
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list RDS tags', { arn, error: error.message });
      return null;
    }
  }

  private async _safeListIamTags(client: IAMClient, command: ListUserTagsCommand | ListRoleTagsCommand): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(command as ListUserTagsCommand);
      return buildTagObject(output?.Tags as unknown as TagEntry[]);
    } catch (err) {
      const error = err as Error & { name?: string };
      if (error?.name === 'NoSuchEntity') {
        return null;
      }
      this.logger('warn', 'Failed to list IAM tags', { error: error.message });
      return null;
    }
  }

  private async _safeListLambdaTags(client: LambdaClient, functionArn: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new ListLambdaTagsCommand({ Resource: functionArn }));
      return (output?.Tags as Record<string, string | null>) || null;
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list Lambda tags', { functionArn, error: error.message });
      return null;
    }
  }

  private async _safeListClassicLBTags(client: ElasticLoadBalancingClient, loadBalancerName: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new DescribeClassicLBTagsCommand({
        LoadBalancerNames: [loadBalancerName]
      }));
      const tagDescriptions = output?.TagDescriptions?.[0];
      return buildTagObject(tagDescriptions?.Tags as TagEntry[]);
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list Classic LB tags', { loadBalancerName, error: error.message });
      return null;
    }
  }

  private async _safeListELBv2Tags(client: ElasticLoadBalancingV2Client, resourceArns: string[]): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new DescribeELBv2TagsCommand({
        ResourceArns: resourceArns
      }));
      const tagDescription = output?.TagDescriptions?.[0];
      return buildTagObject(tagDescription?.Tags as TagEntry[]);
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list ELBv2 tags', { error: error.message });
      return null;
    }
  }

  private async _safeListDynamoDBTags(client: DynamoDBClient, resourceArn: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new ListDynamoDBTagsCommand({
        ResourceArn: resourceArn
      }));
      return buildTagObject(output?.Tags as unknown as TagEntry[]);
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list DynamoDB tags', { resourceArn, error: error.message });
      return null;
    }
  }

  private async _safeGetQueueAttributes(client: SQSClient, queueUrl: string): Promise<Record<string, string> | null> {
    try {
      const output = await client.send(new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ['All']
      }));
      return (output?.Attributes as Record<string, string>) || null;
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to get queue attributes', { queueUrl, error: error.message });
      return null;
    }
  }

  private async _safeListQueueTags(client: SQSClient, queueUrl: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new ListQueueTagsCommand({
        QueueUrl: queueUrl
      }));
      return (output?.Tags as Record<string, string | null>) || null;
    } catch (err) {
      const error = err as Error & { name?: string };
      if (error?.name === 'QueueDoesNotExist') {
        return null;
      }
      this.logger('warn', 'Failed to list queue tags', { queueUrl, error: error.message });
      return null;
    }
  }

  private async _safeGetTopicAttributes(client: SNSClient, topicArn: string): Promise<Record<string, string> | null> {
    try {
      const output = await client.send(new GetTopicAttributesCommand({
        TopicArn: topicArn
      }));
      return (output?.Attributes as Record<string, string>) || null;
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to get topic attributes', { topicArn, error: error.message });
      return null;
    }
  }

  private async _safeListSNSTags(client: SNSClient, resourceArn: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new ListSNSTagsCommand({
        ResourceArn: resourceArn
      }));
      return buildTagObject(output?.Tags as unknown as TagEntry[]);
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list SNS tags', { resourceArn, error: error.message });
      return null;
    }
  }

  private async _safeListECSTags(client: ECSClient, resourceArn: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new ListECSTagsCommand({
        resourceArn
      }));
      return buildTagObject(output?.tags as TagEntry[], 'key', 'value');
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list ECS tags', { resourceArn, error: error.message });
      return null;
    }
  }

  private async _safeListEKSTags(client: EKSClient, resourceArn: string | undefined): Promise<Record<string, string | null> | null> {
    if (!resourceArn) return null;
    try {
      const output = await client.send(new ListEKSTagsCommand({
        resourceArn
      }));
      return (output?.tags as Record<string, string | null>) || null;
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list EKS tags', { resourceArn, error: error.message });
      return null;
    }
  }

  private async _safeGetAPIGatewayTags(client: APIGatewayClient, resourceId: string, region: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new GetAPIGatewayTagsCommand({
        resourceArn: `arn:aws:apigateway:${region}::/restapis/${resourceId}`
      }));
      return (output?.tags as Record<string, string | null>) || null;
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to get API Gateway tags', { resourceId, error: error.message });
      return null;
    }
  }

  private async _safeGetAPIGatewayV2Tags(client: ApiGatewayV2Client, resourceId: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new GetAPIGatewayV2TagsCommand({
        ResourceArn: resourceId
      }));
      return (output?.Tags as Record<string, string | null>) || null;
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to get API Gateway v2 tags', { resourceId, error: error.message });
      return null;
    }
  }

  private async _safeListCloudFrontTags(client: CloudFrontClient, resourceArn: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new ListCloudFrontTagsCommand({
        Resource: resourceArn
      }));
      return buildTagObject(output?.Tags?.Items as TagEntry[]);
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list CloudFront tags', { resourceArn, error: error.message });
      return null;
    }
  }

  private async _safeListRoute53Tags(client: Route53Client, resourceId: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new ListRoute53TagsCommand({
        ResourceType: 'hostedzone',
        ResourceId: resourceId.replace('/hostedzone/', '')
      }));
      return buildTagObject(output?.ResourceTagSet?.Tags as TagEntry[]);
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list Route53 tags', { resourceId, error: error.message });
      return null;
    }
  }

  private async _safeListKMSTags(client: KMSClient, keyId: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new ListResourceTagsCommand({
        KeyId: keyId
      }));
      return buildTagObject(output?.Tags as unknown as TagEntry[]);
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list KMS tags', { keyId, error: error.message });
      return null;
    }
  }

  private async _safeListSSMTags(client: SSMClient, resourceId: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new ListSSMTagsCommand({
        ResourceType: 'Parameter',
        ResourceId: resourceId
      }));
      return buildTagObject(output?.TagList as TagEntry[]);
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list SSM tags', { resourceId, error: error.message });
      return null;
    }
  }

  private async _safeListElastiCacheTags(client: ElastiCacheClient, resourceArn: string | undefined): Promise<Record<string, string | null> | null> {
    if (!resourceArn) return null;
    try {
      const output = await client.send(new ListElastiCacheTagsCommand({
        ResourceName: resourceArn
      }));
      return buildTagObject(output?.TagList as TagEntry[]);
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list ElastiCache tags', { resourceArn, error: error.message });
      return null;
    }
  }

  private async _safeDescribeEFSTags(client: EFSClient, fileSystemId: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new DescribeEFSTagsCommand({
        FileSystemId: fileSystemId
      }));
      return buildTagObject(output?.Tags as unknown as TagEntry[]);
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to describe EFS tags', { fileSystemId, error: error.message });
      return null;
    }
  }

  private async _safeListECRTags(client: ECRClient, resourceArn: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new ListECRTagsCommand({
        resourceArn
      }));
      return buildTagObject(output?.tags as TagEntry[], 'key', 'value');
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list ECR tags', { resourceArn, error: error.message });
      return null;
    }
  }

  private async _safeListSFNTags(client: SFNClient, resourceArn: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new ListSFNTagsCommand({
        resourceArn
      }));
      return buildTagObject(output?.tags as TagEntry[], 'key', 'value');
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list Step Functions tags', { resourceArn, error: error.message });
      return null;
    }
  }

  private async _safeListEventBridgeTags(client: EventBridgeClient, resourceArn: string | undefined): Promise<Record<string, string | null> | null> {
    if (!resourceArn) return null;
    try {
      const output = await client.send(new ListEventBridgeTagsCommand({
        ResourceARN: resourceArn
      }));
      return buildTagObject(output?.Tags as unknown as TagEntry[]);
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list EventBridge tags', { resourceArn, error: error.message });
      return null;
    }
  }

  private async _safeListCloudWatchTags(client: CloudWatchClient, resourceArn: string | undefined): Promise<Record<string, string | null> | null> {
    if (!resourceArn) return null;
    try {
      const output = await client.send(new ListCloudWatchTagsCommand({
        ResourceARN: resourceArn
      }));
      return buildTagObject(output?.Tags as unknown as TagEntry[]);
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list CloudWatch tags', { resourceArn, error: error.message });
      return null;
    }
  }

  private async _safeListCWLogsTags(client: CloudWatchLogsClient, logGroupName: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new ListCWLogsTagsCommand({
        resourceArn: logGroupName
      }));
      return (output?.tags as Record<string, string | null>) || null;
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list CloudWatch Logs tags', { logGroupName, error: error.message });
      return null;
    }
  }

  private async _safeListCloudTrailTags(client: CloudTrailClient, resourceArn: string | undefined): Promise<Record<string, string | null> | null> {
    if (!resourceArn) return null;
    try {
      const output = await client.send(new ListCloudTrailTagsCommand({
        ResourceIdList: [resourceArn]
      }));
      const tagsList = output?.ResourceTagList?.[0]?.TagsList;
      return buildTagObject(tagsList as TagEntry[]);
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list CloudTrail tags', { resourceArn, error: error.message });
      return null;
    }
  }

  private async _safeListACMTags(client: ACMClient, certificateArn: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new ListTagsForCertificateCommand({
        CertificateArn: certificateArn
      }));
      return buildTagObject(output?.Tags as unknown as TagEntry[]);
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list ACM tags', { certificateArn, error: error.message });
      return null;
    }
  }

  private async _safeListWAFTags(client: WAFClient, resourceId: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new ListWAFTagsCommand({
        ResourceARN: `arn:aws:waf::${this._accountId}:webacl/${resourceId}`
      })) as any;
      return buildTagObject(output?.Tags as unknown as TagEntry[]);
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list WAF tags', { resourceId, error: error.message });
      return null;
    }
  }

  private async _safeListWAFV2Tags(client: WAFV2Client, resourceArn: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new ListWAFV2TagsCommand({
        ResourceARN: resourceArn
      }));
      return buildTagObject(output?.TagInfoForResource?.TagList as TagEntry[]);
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list WAFv2 tags', { resourceArn, error: error.message });
      return null;
    }
  }

  private async _safeListCognitoTags(client: CognitoIdentityProviderClient, resourceArn: string | undefined): Promise<Record<string, string | null> | null> {
    if (!resourceArn) return null;
    try {
      const output = await client.send(new ListCognitoTagsCommand({
        ResourceArn: resourceArn
      }));
      return (output?.Tags as Record<string, string | null>) || null;
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list Cognito tags', { resourceArn, error: error.message });
      return null;
    }
  }

  private async _safeListBackupTags(client: BackupClient, resourceArn: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new ListBackupTagsCommand({
        ResourceArn: resourceArn
      }));
      return (output?.Tags as Record<string, string | null>) || null;
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list Backup tags', { resourceArn, error: error.message });
      return null;
    }
  }

  private async _safeListKinesisTags(client: KinesisClient, streamName: string): Promise<Record<string, string | null> | null> {
    try {
      const output = await client.send(new ListTagsForStreamCommand({
        StreamName: streamName
      }));
      return buildTagObject(output?.Tags as unknown as TagEntry[]);
    } catch (err) {
      const error = err as Error;
      this.logger('warn', 'Failed to list Kinesis tags', { streamName, error: error.message });
      return null;
    }
  }
}

export default AwsInventoryDriver;
