import { fromNodeProviderChain, fromIni, fromProcess } from '@aws-sdk/credential-providers';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { EC2Client, paginateDescribeInstances, paginateDescribeVpcs, paginateDescribeSubnets, paginateDescribeSecurityGroups, paginateDescribeRouteTables, paginateDescribeInternetGateways, paginateDescribeNatGateways, paginateDescribeNetworkAcls, paginateDescribeVolumes, paginateDescribeSnapshots as paginateDescribeEBSSnapshots, DescribeVpnConnectionsCommand, DescribeCustomerGatewaysCommand, DescribeTransitGatewaysCommand, DescribeTransitGatewayAttachmentsCommand } from '@aws-sdk/client-ec2';
import { S3Client, ListBucketsCommand, GetBucketLocationCommand, GetBucketTaggingCommand } from '@aws-sdk/client-s3';
import { RDSClient, paginateDescribeDBInstances, ListTagsForResourceCommand } from '@aws-sdk/client-rds';
import { IAMClient, paginateListUsers, paginateListRoles, ListUserTagsCommand, ListRoleTagsCommand } from '@aws-sdk/client-iam';
import { LambdaClient, paginateListFunctions, ListTagsCommand as ListLambdaTagsCommand } from '@aws-sdk/client-lambda';
import { ElasticLoadBalancingClient, paginateDescribeLoadBalancers as paginateDescribeClassicLoadBalancers, DescribeTagsCommand as DescribeClassicLBTagsCommand } from '@aws-sdk/client-elastic-load-balancing';
import { ElasticLoadBalancingV2Client, paginateDescribeLoadBalancers, paginateDescribeTargetGroups, DescribeTagsCommand as DescribeELBv2TagsCommand } from '@aws-sdk/client-elastic-load-balancing-v2';
import { DynamoDBClient, paginateListTables, DescribeTableCommand, ListTagsOfResourceCommand as ListDynamoDBTagsCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, paginateListQueues, GetQueueAttributesCommand, ListQueueTagsCommand } from '@aws-sdk/client-sqs';
import { SNSClient, paginateListTopics, GetTopicAttributesCommand, ListTagsForResourceCommand as ListSNSTagsCommand } from '@aws-sdk/client-sns';
import { ECSClient, paginateListClusters, paginateListServices, paginateListTaskDefinitions, DescribeServicesCommand, DescribeTaskDefinitionCommand, ListTagsForResourceCommand as ListECSTagsCommand } from '@aws-sdk/client-ecs';
import { EKSClient, paginateListClusters as paginateListEKSClusters, paginateListNodegroups, DescribeClusterCommand, DescribeNodegroupCommand, ListTagsForResourceCommand as ListEKSTagsCommand } from '@aws-sdk/client-eks';
import { APIGatewayClient, paginateGetRestApis, GetTagsCommand as GetAPIGatewayTagsCommand } from '@aws-sdk/client-api-gateway';
import { ApiGatewayV2Client, GetApisCommand, GetTagsCommand as GetAPIGatewayV2TagsCommand } from '@aws-sdk/client-apigatewayv2';
import { CloudFrontClient, paginateListDistributions, ListTagsForResourceCommand as ListCloudFrontTagsCommand } from '@aws-sdk/client-cloudfront';
import { Route53Client, paginateListHostedZones, ListTagsForResourceCommand as ListRoute53TagsCommand } from '@aws-sdk/client-route-53';
import { KMSClient, paginateListKeys, DescribeKeyCommand, ListResourceTagsCommand } from '@aws-sdk/client-kms';
import { SecretsManagerClient, paginateListSecrets, DescribeSecretCommand } from '@aws-sdk/client-secrets-manager';
import { SSMClient, paginateDescribeParameters, ListTagsForResourceCommand as ListSSMTagsCommand } from '@aws-sdk/client-ssm';
import { ElastiCacheClient, paginateDescribeCacheClusters, ListTagsForResourceCommand as ListElastiCacheTagsCommand } from '@aws-sdk/client-elasticache';
import { EFSClient, paginateDescribeFileSystems, DescribeTagsCommand as DescribeEFSTagsCommand } from '@aws-sdk/client-efs';
import { ECRClient, paginateDescribeRepositories, ListTagsForResourceCommand as ListECRTagsCommand } from '@aws-sdk/client-ecr';
import { SFNClient, paginateListStateMachines, ListTagsForResourceCommand as ListSFNTagsCommand } from '@aws-sdk/client-sfn';
import { EventBridgeClient, ListEventBusesCommand, ListRulesCommand, ListTagsForResourceCommand as ListEventBridgeTagsCommand } from '@aws-sdk/client-eventbridge';
import { CloudWatchClient, paginateDescribeAlarms, ListTagsForResourceCommand as ListCloudWatchTagsCommand } from '@aws-sdk/client-cloudwatch';
import { CloudWatchLogsClient, paginateDescribeLogGroups, ListTagsForResourceCommand as ListCWLogsTagsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { CloudTrailClient, paginateListTrails, GetTrailCommand, ListTagsCommand as ListCloudTrailTagsCommand } from '@aws-sdk/client-cloudtrail';
import { ConfigServiceClient, DescribeConfigurationRecordersCommand, DescribeDeliveryChannelsCommand } from '@aws-sdk/client-config-service';
import { ACMClient, paginateListCertificates, DescribeCertificateCommand, ListTagsForCertificateCommand } from '@aws-sdk/client-acm';
import { WAFClient, ListWebACLsCommand as ListWAFWebACLsCommand, ListTagsForResourceCommand as ListWAFTagsCommand } from '@aws-sdk/client-waf';
import { WAFV2Client, ListWebACLsCommand as ListWAFV2WebACLsCommand, ListTagsForResourceCommand as ListWAFV2TagsCommand } from '@aws-sdk/client-wafv2';
import { CognitoIdentityProviderClient, paginateListUserPools, DescribeUserPoolCommand, ListTagsForResourceCommand as ListCognitoTagsCommand } from '@aws-sdk/client-cognito-identity-provider';
import { BackupClient, paginateListBackupPlans, paginateListBackupVaults, ListTagsCommand as ListBackupTagsCommand } from '@aws-sdk/client-backup';
import { KinesisClient, paginateListStreams, DescribeStreamCommand, ListTagsForStreamCommand } from '@aws-sdk/client-kinesis';
import { BaseCloudDriver } from './base-driver.js';
const DEFAULT_SERVICES = [
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
function normaliseServiceName(name) {
    return (name || '').toString().trim().toLowerCase();
}
function buildTagObject(entries, keyKey = 'Key', valueKey = 'Value') {
    if (!Array.isArray(entries) || entries.length === 0) {
        return null;
    }
    const out = {};
    for (const entry of entries) {
        if (!entry || typeof entry !== 'object')
            continue;
        const key = entry[keyKey];
        if (!key)
            continue;
        out[key] = entry[valueKey] ?? null;
    }
    return Object.keys(out).length ? out : null;
}
function buildCredentialProvider(credentials = {}) {
    if (!credentials || typeof credentials !== 'object') {
        return fromNodeProviderChain();
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
        return fromIni({ profile: credentials.profile });
    }
    if (credentials.processProfile) {
        return fromProcess({ profile: credentials.processProfile });
    }
    return fromNodeProviderChain();
}
function ensureArray(value, fallback = []) {
    if (!value)
        return fallback;
    if (Array.isArray(value))
        return value;
    return [value];
}
function shouldCollect(service, includeSet, excludeSet) {
    const name = normaliseServiceName(service);
    if (excludeSet.has(name))
        return false;
    if (includeSet.size > 0 && !includeSet.has(name))
        return false;
    return true;
}
function extractEc2Tags(instance) {
    if (!instance?.Tags)
        return null;
    const tags = {};
    for (const { Key, Value } of instance.Tags) {
        if (!Key)
            continue;
        tags[Key] = Value ?? null;
    }
    return Object.keys(tags).length ? tags : null;
}
function extractInstanceName(instance) {
    if (!instance?.Tags)
        return null;
    const nameTag = instance.Tags.find(tag => tag.Key === 'Name');
    return nameTag?.Value || null;
}
function sanitizeConfiguration(payload) {
    if (!payload || typeof payload !== 'object')
        return payload;
    return JSON.parse(JSON.stringify(payload));
}
export class AwsInventoryDriver extends BaseCloudDriver {
    _clients;
    _accountId = null;
    _credentialProvider;
    _services;
    _regions;
    constructor(options = { driver: 'aws' }) {
        super({ ...options, credentials: options.credentials, config: options.config, driver: options.driver || 'aws' });
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
        this._credentialProvider = buildCredentialProvider(this.credentials);
        this._services = ensureArray(this.config?.services, DEFAULT_SERVICES)
            .map(normaliseServiceName)
            .filter(Boolean);
        if (!this._services.length) {
            this._services = [...DEFAULT_SERVICES];
        }
        const awsConfig = this.config;
        this._regions = ensureArray(awsConfig?.regions, [awsConfig?.region || GLOBAL_REGION]);
        if (!this._regions.length) {
            this._regions = [GLOBAL_REGION];
        }
    }
    async initialize() {
        await this._initializeSts();
        this.logger('info', 'AWS driver initialized', {
            accountId: this._accountId,
            services: this._services,
            regions: this._regions
        });
    }
    async *_collectEc2Instances() {
        for (const region of this._regions) {
            const client = this._getEc2Client(region);
            const paginator = paginateDescribeInstances({ client }, {});
            for await (const page of paginator) {
                const reservations = page.Reservations || [];
                for (const reservation of reservations) {
                    const instances = reservation.Instances || [];
                    for (const instance of instances) {
                        const instanceId = instance.InstanceId;
                        if (!instanceId)
                            continue;
                        yield {
                            provider: 'aws',
                            accountId: this._accountId,
                            region,
                            service: 'ec2',
                            resourceType: 'ec2.instance',
                            resourceId: instanceId,
                            name: extractInstanceName(instance),
                            tags: extractEc2Tags(instance),
                            configuration: sanitizeConfiguration(instance)
                        };
                    }
                }
            }
        }
    }
    async *_collectS3Buckets() {
        const client = this._getS3Client();
        const response = await client.send(new ListBucketsCommand({}));
        const buckets = response.Buckets || [];
        for (const bucket of buckets) {
            const bucketName = bucket.Name;
            if (!bucketName)
                continue;
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
            };
        }
    }
    async *_collectRdsInstances() {
        for (const region of this._regions) {
            const client = this._getRdsClient(region);
            const paginator = paginateDescribeDBInstances({ client }, {});
            for await (const page of paginator) {
                const instances = page.DBInstances || [];
                for (const instance of instances) {
                    const resourceId = instance.DbiResourceId || instance.DBInstanceIdentifier;
                    if (!resourceId)
                        continue;
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
                    };
                }
            }
        }
    }
    async *_collectIamIdentities() {
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
                };
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
                };
            }
        }
    }
    async *_collectLambdaFunctions() {
        for (const region of this._regions) {
            const client = this._getLambdaClient(region);
            const paginator = paginateListFunctions({ client }, {});
            for await (const page of paginator) {
                const functions = page.Functions || [];
                for (const lambda of functions) {
                    const arn = lambda.FunctionArn;
                    let tags = null;
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
                    };
                }
            }
        }
    }
    async *_collectVpcResources() {
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
                        name: extractEc2Tags(vpc)?.Name || vpc.VpcId,
                        tags: extractEc2Tags(vpc),
                        configuration: sanitizeConfiguration(vpc)
                    };
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
                        name: extractEc2Tags(subnet)?.Name || subnet.SubnetId,
                        tags: extractEc2Tags(subnet),
                        configuration: sanitizeConfiguration(subnet)
                    };
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
                        tags: extractEc2Tags(sg),
                        configuration: sanitizeConfiguration(sg)
                    };
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
                        name: extractEc2Tags(rt)?.Name || rt.RouteTableId,
                        tags: extractEc2Tags(rt),
                        configuration: sanitizeConfiguration(rt)
                    };
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
                        name: extractEc2Tags(igw)?.Name || igw.InternetGatewayId,
                        tags: extractEc2Tags(igw),
                        configuration: sanitizeConfiguration(igw)
                    };
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
                        name: extractEc2Tags(nat)?.Name || nat.NatGatewayId,
                        tags: extractEc2Tags(nat),
                        configuration: sanitizeConfiguration(nat)
                    };
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
                        name: extractEc2Tags(acl)?.Name || acl.NetworkAclId,
                        tags: extractEc2Tags(acl),
                        configuration: sanitizeConfiguration(acl)
                    };
                }
            }
        }
    }
    async *_collectLoadBalancers() {
        for (const region of this._regions) {
            const elbClient = this._getElbClient(region);
            const classicPaginator = paginateDescribeClassicLoadBalancers({ client: elbClient }, {});
            for await (const page of classicPaginator) {
                const lbs = page.LoadBalancerDescriptions || [];
                for (const lb of lbs) {
                    const tags = await this._safeListClassicLBTags(elbClient, lb.LoadBalancerName);
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
                    };
                }
            }
            const elbv2Client = this._getElbv2Client(region);
            const v2Paginator = paginateDescribeLoadBalancers({ client: elbv2Client }, {});
            for await (const page of v2Paginator) {
                const lbs = page.LoadBalancers || [];
                for (const lb of lbs) {
                    const arn = lb.LoadBalancerArn;
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
                    };
                }
            }
            const tgPaginator = paginateDescribeTargetGroups({ client: elbv2Client }, {});
            for await (const page of tgPaginator) {
                const groups = page.TargetGroups || [];
                for (const tg of groups) {
                    const arn = tg.TargetGroupArn;
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
                    };
                }
            }
        }
    }
    async *_collectDynamoDBTables() {
        for (const region of this._regions) {
            const client = this._getDynamoDBClient(region);
            const paginator = paginateListTables({ client }, {});
            for await (const page of paginator) {
                const tables = page.TableNames || [];
                for (const tableName of tables) {
                    const description = await client.send(new DescribeTableCommand({ TableName: tableName }));
                    const table = description.Table;
                    const arn = table?.TableArn;
                    let tags = null;
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
                    };
                }
            }
        }
    }
    async *_collectSQSQueues() {
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
                    };
                }
            }
        }
    }
    async *_collectSNSTopics() {
        for (const region of this._regions) {
            const client = this._getSnsClient(region);
            const paginator = paginateListTopics({ client }, {});
            for await (const page of paginator) {
                const topics = page.Topics || [];
                for (const topic of topics) {
                    const arn = topic.TopicArn;
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
                    };
                }
            }
        }
    }
    async *_collectECSResources() {
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
                    };
                    const servicePaginator = paginateListServices({ client }, { cluster: arn });
                    for await (const servicePage of servicePaginator) {
                        const serviceArns = servicePage.serviceArns || [];
                        if (serviceArns.length === 0)
                            continue;
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
                                tags: buildTagObject(service.tags),
                                configuration: sanitizeConfiguration(service)
                            };
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
                    const tags = buildTagObject(described.tags);
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
                    };
                }
            }
        }
    }
    async *_collectEKSClusters() {
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
                    };
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
                            };
                        }
                    }
                }
            }
        }
    }
    async *_collectAPIGateways() {
        for (const region of this._regions) {
            const v1Client = this._getApiGatewayClient(region);
            const v1Paginator = paginateGetRestApis({ client: v1Client }, {});
            for await (const page of v1Paginator) {
                const apis = page.items || [];
                for (const api of apis) {
                    const tags = await this._safeGetAPIGatewayTags(v1Client, api.id, region);
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
                    };
                }
            }
            const v2Client = this._getApiGatewayV2Client(region);
            let nextToken;
            do {
                const response = await v2Client.send(new GetApisCommand({ NextToken: nextToken }));
                const apis = response.Items || [];
                nextToken = response.NextToken;
                for (const api of apis) {
                    const tags = await this._safeGetAPIGatewayV2Tags(v2Client, api.ApiId);
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
                    };
                }
            } while (nextToken);
        }
    }
    async *_collectCloudFrontDistributions() {
        const client = this._getCloudFrontClient();
        const paginator = paginateListDistributions({ client }, {});
        for await (const page of paginator) {
            const items = page.DistributionList?.Items || [];
            for (const dist of items) {
                const arn = dist.ARN;
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
                };
            }
        }
    }
    async *_collectRoute53HostedZones() {
        const client = this._getRoute53Client();
        const paginator = paginateListHostedZones({ client }, {});
        for await (const page of paginator) {
            const zones = page.HostedZones || [];
            for (const zone of zones) {
                const zoneId = zone.Id?.replace('/hostedzone/', '');
                const tags = await this._safeListRoute53Tags(client, zone.Id);
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
                };
            }
        }
    }
    async *_collectKMSKeys() {
        for (const region of this._regions) {
            const client = this._getKmsClient(region);
            const paginator = paginateListKeys({ client }, {});
            for await (const page of paginator) {
                const keys = page.Keys || [];
                for (const key of keys) {
                    const described = await client.send(new DescribeKeyCommand({ KeyId: key.KeyId }));
                    const metadata = described.KeyMetadata;
                    const tags = await this._safeListKMSTags(client, key.KeyId);
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
                    };
                }
            }
        }
    }
    async *_collectSecretsManagerSecrets() {
        for (const region of this._regions) {
            const client = this._getSecretsManagerClient(region);
            const paginator = paginateListSecrets({ client }, {});
            for await (const page of paginator) {
                const secrets = page.SecretList || [];
                for (const secret of secrets) {
                    const described = await client.send(new DescribeSecretCommand({ SecretId: secret.ARN }));
                    const tags = buildTagObject(described.Tags);
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
                    };
                }
            }
        }
    }
    async *_collectSSMParameters() {
        for (const region of this._regions) {
            const client = this._getSsmClient(region);
            const paginator = paginateDescribeParameters({ client }, {});
            for await (const page of paginator) {
                const params = page.Parameters || [];
                for (const param of params) {
                    const tags = await this._safeListSSMTags(client, param.Name);
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
                    };
                }
            }
        }
    }
    async *_collectElastiCacheClusters() {
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
                    };
                }
            }
        }
    }
    async *_collectEFSFileSystems() {
        for (const region of this._regions) {
            const client = this._getEfsClient(region);
            const paginator = paginateDescribeFileSystems({ client }, {});
            for await (const page of paginator) {
                const filesystems = page.FileSystems || [];
                for (const fs of filesystems) {
                    const tags = await this._safeDescribeEFSTags(client, fs.FileSystemId);
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
                    };
                }
            }
        }
    }
    async *_collectECRRepositories() {
        for (const region of this._regions) {
            const client = this._getEcrClient(region);
            const paginator = paginateDescribeRepositories({ client }, {});
            for await (const page of paginator) {
                const repos = page.repositories || [];
                for (const repo of repos) {
                    const tags = await this._safeListECRTags(client, repo.repositoryArn);
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
                    };
                }
            }
        }
    }
    async *_collectStepFunctionsStateMachines() {
        for (const region of this._regions) {
            const client = this._getSfnClient(region);
            const paginator = paginateListStateMachines({ client }, {});
            for await (const page of paginator) {
                const machines = page.stateMachines || [];
                for (const machine of machines) {
                    const tags = await this._safeListSFNTags(client, machine.stateMachineArn);
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
                    };
                }
            }
        }
    }
    async *_collectEventBridgeResources() {
        for (const region of this._regions) {
            const client = this._getEventBridgeClient(region);
            let nextBusToken;
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
                    };
                }
            } while (nextBusToken);
            let nextRuleToken;
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
                    };
                }
            } while (nextRuleToken);
        }
    }
    async *_collectCloudWatchResources() {
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
                    };
                }
            }
            const logsClient = this._getCloudWatchLogsClient(region);
            const logsPaginator = paginateDescribeLogGroups({ client: logsClient }, {});
            for await (const page of logsPaginator) {
                const groups = page.logGroups || [];
                for (const group of groups) {
                    const tags = await this._safeListCWLogsTags(logsClient, group.logGroupName);
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
                    };
                }
            }
        }
    }
    async *_collectCloudTrails() {
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
                    };
                }
            }
        }
    }
    async *_collectConfigResources() {
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
                };
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
                };
            }
        }
    }
    async *_collectACMCertificates() {
        for (const region of this._regions) {
            const client = this._getAcmClient(region);
            const paginator = paginateListCertificates({ client }, {});
            for await (const page of paginator) {
                const certs = page.CertificateSummaryList || [];
                for (const certSummary of certs) {
                    const arn = certSummary.CertificateArn;
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
                    };
                }
            }
        }
    }
    async *_collectWAFResources() {
        const wafClient = this._getWafClient();
        let nextMarker;
        do {
            const response = await wafClient.send(new ListWAFWebACLsCommand({ NextMarker: nextMarker }));
            const webACLs = response.WebACLs || [];
            nextMarker = response.NextMarker;
            for (const acl of webACLs) {
                const tags = await this._safeListWAFTags(wafClient, acl.WebACLId);
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
                };
            }
        } while (nextMarker);
    }
    async *_collectWAFV2Resources() {
        for (const region of this._regions) {
            const client = this._getWafv2Client(region);
            let nextMarker;
            do {
                const response = await client.send(new ListWAFV2WebACLsCommand({ Scope: 'REGIONAL', NextMarker: nextMarker }));
                const webACLs = response.WebACLs || [];
                nextMarker = response.NextMarker;
                for (const acl of webACLs) {
                    const tags = await this._safeListWAFV2Tags(client, acl.ARN);
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
                    };
                }
            } while (nextMarker);
        }
        const cfClient = this._getWafv2Client(GLOBAL_REGION);
        let cfNextMarker;
        do {
            const cfResponse = await cfClient.send(new ListWAFV2WebACLsCommand({ Scope: 'CLOUDFRONT', NextMarker: cfNextMarker }));
            const webACLs = cfResponse.WebACLs || [];
            cfNextMarker = cfResponse.NextMarker;
            for (const acl of webACLs) {
                const tags = await this._safeListWAFV2Tags(cfClient, acl.ARN);
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
                };
            }
        } while (cfNextMarker);
    }
    async *_collectCognitoUserPools() {
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
                    };
                }
            }
        }
    }
    async *_collectEBSResources() {
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
                        name: extractEc2Tags(volume)?.Name || volume.VolumeId,
                        tags: extractEc2Tags(volume),
                        configuration: sanitizeConfiguration(volume)
                    };
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
                        name: extractEc2Tags(snapshot)?.Name || snapshot.SnapshotId,
                        tags: extractEc2Tags(snapshot),
                        configuration: sanitizeConfiguration(snapshot)
                    };
                }
            }
        }
    }
    async *_collectVPNResources() {
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
                    name: extractEc2Tags(vpn)?.Name || vpn.VpnConnectionId,
                    tags: extractEc2Tags(vpn),
                    configuration: sanitizeConfiguration(vpn)
                };
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
                    name: extractEc2Tags(cgw)?.Name || cgw.CustomerGatewayId,
                    tags: extractEc2Tags(cgw),
                    configuration: sanitizeConfiguration(cgw)
                };
            }
        }
    }
    async *_collectTransitGatewayResources() {
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
                    name: extractEc2Tags(tgw)?.Name || tgw.TransitGatewayId,
                    tags: extractEc2Tags(tgw),
                    configuration: sanitizeConfiguration(tgw)
                };
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
                    name: extractEc2Tags(att)?.Name || att.TransitGatewayAttachmentId,
                    tags: extractEc2Tags(att),
                    configuration: sanitizeConfiguration(att)
                };
            }
        }
    }
    async *_collectBackupResources() {
        for (const region of this._regions) {
            const client = this._getBackupClient(region);
            const planPaginator = paginateListBackupPlans({ client }, {});
            for await (const page of planPaginator) {
                const plans = page.BackupPlansList || [];
                for (const plan of plans) {
                    const tags = await this._safeListBackupTags(client, plan.BackupPlanArn);
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
                    };
                }
            }
            const vaultPaginator = paginateListBackupVaults({ client }, {});
            for await (const page of vaultPaginator) {
                const vaults = page.BackupVaultList || [];
                for (const vault of vaults) {
                    const tags = await this._safeListBackupTags(client, vault.BackupVaultArn);
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
                    };
                }
            }
        }
    }
    async *_collectKinesisStreams() {
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
                    };
                }
            }
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
                            resourceId: resource.resourceId,
                            resourceType: resource.resourceType
                        });
                    }
                    yield resource;
                }
            }
            catch (err) {
                const error = err;
                this.logger('error', 'AWS service collection failed, skipping to next service', {
                    service,
                    error: error.message,
                    errorName: error.name,
                    stack: error.stack
                });
            }
        }
    }
    async _initializeSts() {
        if (this._accountId)
            return;
        const client = this._getStsClient();
        const response = await client.send(new GetCallerIdentityCommand({}));
        this._accountId = response.Account || null;
    }
    _getStsClient() {
        if (!this._clients.sts) {
            const awsConfig = this.config;
            this._clients.sts = new STSClient({
                region: awsConfig?.region || GLOBAL_REGION,
                credentials: this._credentialProvider
            });
        }
        return this._clients.sts;
    }
    _getEc2Client(region) {
        if (!this._clients.ec2.has(region)) {
            this._clients.ec2.set(region, new EC2Client({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.ec2.get(region);
    }
    _getS3Client() {
        if (!this._clients.s3) {
            const awsConfig = this.config;
            this._clients.s3 = new S3Client({
                region: awsConfig?.s3Region || GLOBAL_REGION,
                credentials: this._credentialProvider
            });
        }
        return this._clients.s3;
    }
    _getRdsClient(region) {
        if (!this._clients.rds.has(region)) {
            this._clients.rds.set(region, new RDSClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.rds.get(region);
    }
    _getIamClient() {
        if (!this._clients.iam) {
            const awsConfig = this.config;
            this._clients.iam = new IAMClient({
                region: awsConfig?.iamRegion || GLOBAL_REGION,
                credentials: this._credentialProvider
            });
        }
        return this._clients.iam;
    }
    _getLambdaClient(region) {
        if (!this._clients.lambda.has(region)) {
            this._clients.lambda.set(region, new LambdaClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.lambda.get(region);
    }
    _getElbClient(region) {
        if (!this._clients.elb.has(region)) {
            this._clients.elb.set(region, new ElasticLoadBalancingClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.elb.get(region);
    }
    _getElbv2Client(region) {
        if (!this._clients.elbv2.has(region)) {
            this._clients.elbv2.set(region, new ElasticLoadBalancingV2Client({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.elbv2.get(region);
    }
    _getDynamoDBClient(region) {
        if (!this._clients.dynamodb.has(region)) {
            this._clients.dynamodb.set(region, new DynamoDBClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.dynamodb.get(region);
    }
    _getSqsClient(region) {
        if (!this._clients.sqs.has(region)) {
            this._clients.sqs.set(region, new SQSClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.sqs.get(region);
    }
    _getSnsClient(region) {
        if (!this._clients.sns.has(region)) {
            this._clients.sns.set(region, new SNSClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.sns.get(region);
    }
    _getEcsClient(region) {
        if (!this._clients.ecs.has(region)) {
            this._clients.ecs.set(region, new ECSClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.ecs.get(region);
    }
    _getEksClient(region) {
        if (!this._clients.eks.has(region)) {
            this._clients.eks.set(region, new EKSClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.eks.get(region);
    }
    _getApiGatewayClient(region) {
        if (!this._clients.apigateway.has(region)) {
            this._clients.apigateway.set(region, new APIGatewayClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.apigateway.get(region);
    }
    _getApiGatewayV2Client(region) {
        if (!this._clients.apigatewayv2.has(region)) {
            this._clients.apigatewayv2.set(region, new ApiGatewayV2Client({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.apigatewayv2.get(region);
    }
    _getCloudFrontClient() {
        if (!this._clients.cloudfront) {
            this._clients.cloudfront = new CloudFrontClient({
                region: GLOBAL_REGION,
                credentials: this._credentialProvider
            });
        }
        return this._clients.cloudfront;
    }
    _getRoute53Client() {
        if (!this._clients.route53) {
            this._clients.route53 = new Route53Client({
                region: GLOBAL_REGION,
                credentials: this._credentialProvider
            });
        }
        return this._clients.route53;
    }
    _getKmsClient(region) {
        if (!this._clients.kms.has(region)) {
            this._clients.kms.set(region, new KMSClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.kms.get(region);
    }
    _getSecretsManagerClient(region) {
        if (!this._clients.secretsmanager.has(region)) {
            this._clients.secretsmanager.set(region, new SecretsManagerClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.secretsmanager.get(region);
    }
    _getSsmClient(region) {
        if (!this._clients.ssm.has(region)) {
            this._clients.ssm.set(region, new SSMClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.ssm.get(region);
    }
    _getElastiCacheClient(region) {
        if (!this._clients.elasticache.has(region)) {
            this._clients.elasticache.set(region, new ElastiCacheClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.elasticache.get(region);
    }
    _getEfsClient(region) {
        if (!this._clients.efs.has(region)) {
            this._clients.efs.set(region, new EFSClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.efs.get(region);
    }
    _getEcrClient(region) {
        if (!this._clients.ecr.has(region)) {
            this._clients.ecr.set(region, new ECRClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.ecr.get(region);
    }
    _getSfnClient(region) {
        if (!this._clients.sfn.has(region)) {
            this._clients.sfn.set(region, new SFNClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.sfn.get(region);
    }
    _getEventBridgeClient(region) {
        if (!this._clients.eventbridge.has(region)) {
            this._clients.eventbridge.set(region, new EventBridgeClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.eventbridge.get(region);
    }
    _getCloudWatchClient(region) {
        if (!this._clients.cloudwatch.has(region)) {
            this._clients.cloudwatch.set(region, new CloudWatchClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.cloudwatch.get(region);
    }
    _getCloudWatchLogsClient(region) {
        if (!this._clients.logs.has(region)) {
            this._clients.logs.set(region, new CloudWatchLogsClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.logs.get(region);
    }
    _getCloudTrailClient(region) {
        if (!this._clients.cloudtrail.has(region)) {
            this._clients.cloudtrail.set(region, new CloudTrailClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.cloudtrail.get(region);
    }
    _getConfigServiceClient(region) {
        if (!this._clients.config.has(region)) {
            this._clients.config.set(region, new ConfigServiceClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.config.get(region);
    }
    _getAcmClient(region) {
        if (!this._clients.acm.has(region)) {
            this._clients.acm.set(region, new ACMClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.acm.get(region);
    }
    _getWafClient() {
        if (!this._clients.waf) {
            this._clients.waf = new WAFClient({
                region: GLOBAL_REGION,
                credentials: this._credentialProvider
            });
        }
        return this._clients.waf;
    }
    _getWafv2Client(region) {
        if (!this._clients.wafv2.has(region)) {
            this._clients.wafv2.set(region, new WAFV2Client({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.wafv2.get(region);
    }
    _getCognitoClient(region) {
        if (!this._clients.cognito.has(region)) {
            this._clients.cognito.set(region, new CognitoIdentityProviderClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.cognito.get(region);
    }
    _getBackupClient(region) {
        if (!this._clients.backup.has(region)) {
            this._clients.backup.set(region, new BackupClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.backup.get(region);
    }
    _getKinesisClient(region) {
        if (!this._clients.kinesis.has(region)) {
            this._clients.kinesis.set(region, new KinesisClient({
                region,
                credentials: this._credentialProvider
            }));
        }
        return this._clients.kinesis.get(region);
    }
    async _resolveBucketRegion(client, bucketName) {
        try {
            const output = await client.send(new GetBucketLocationCommand({ Bucket: bucketName }));
            if (!output?.LocationConstraint)
                return 'us-east-1';
            if (output.LocationConstraint === 'EU')
                return 'eu-west-1';
            return output.LocationConstraint;
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to resolve bucket region', { bucketName, error: error.message });
            return null;
        }
    }
    async _resolveBucketTags(client, bucketName) {
        try {
            const output = await client.send(new GetBucketTaggingCommand({ Bucket: bucketName }));
            return buildTagObject(output?.TagSet);
        }
        catch (err) {
            const error = err;
            if (error?.name === 'NoSuchTagSet' || error?.$metadata?.httpStatusCode === 404) {
                return null;
            }
            this.logger('warn', 'Failed to resolve bucket tags', { bucketName, error: error.message });
            return null;
        }
    }
    async _safeListTagsForResource(client, arn) {
        if (!arn)
            return null;
        try {
            const output = await client.send(new ListTagsForResourceCommand({ ResourceName: arn }));
            return buildTagObject(output?.TagList);
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list RDS tags', { arn, error: error.message });
            return null;
        }
    }
    async _safeListIamTags(client, command) {
        try {
            const output = await client.send(command);
            return buildTagObject(output?.Tags);
        }
        catch (err) {
            const error = err;
            if (error?.name === 'NoSuchEntity') {
                return null;
            }
            this.logger('warn', 'Failed to list IAM tags', { error: error.message });
            return null;
        }
    }
    async _safeListLambdaTags(client, functionArn) {
        try {
            const output = await client.send(new ListLambdaTagsCommand({ Resource: functionArn }));
            return output?.Tags || null;
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list Lambda tags', { functionArn, error: error.message });
            return null;
        }
    }
    async _safeListClassicLBTags(client, loadBalancerName) {
        try {
            const output = await client.send(new DescribeClassicLBTagsCommand({
                LoadBalancerNames: [loadBalancerName]
            }));
            const tagDescriptions = output?.TagDescriptions?.[0];
            return buildTagObject(tagDescriptions?.Tags);
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list Classic LB tags', { loadBalancerName, error: error.message });
            return null;
        }
    }
    async _safeListELBv2Tags(client, resourceArns) {
        try {
            const output = await client.send(new DescribeELBv2TagsCommand({
                ResourceArns: resourceArns
            }));
            const tagDescription = output?.TagDescriptions?.[0];
            return buildTagObject(tagDescription?.Tags);
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list ELBv2 tags', { error: error.message });
            return null;
        }
    }
    async _safeListDynamoDBTags(client, resourceArn) {
        try {
            const output = await client.send(new ListDynamoDBTagsCommand({
                ResourceArn: resourceArn
            }));
            return buildTagObject(output?.Tags);
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list DynamoDB tags', { resourceArn, error: error.message });
            return null;
        }
    }
    async _safeGetQueueAttributes(client, queueUrl) {
        try {
            const output = await client.send(new GetQueueAttributesCommand({
                QueueUrl: queueUrl,
                AttributeNames: ['All']
            }));
            return output?.Attributes || null;
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to get queue attributes', { queueUrl, error: error.message });
            return null;
        }
    }
    async _safeListQueueTags(client, queueUrl) {
        try {
            const output = await client.send(new ListQueueTagsCommand({
                QueueUrl: queueUrl
            }));
            return output?.Tags || null;
        }
        catch (err) {
            const error = err;
            if (error?.name === 'QueueDoesNotExist') {
                return null;
            }
            this.logger('warn', 'Failed to list queue tags', { queueUrl, error: error.message });
            return null;
        }
    }
    async _safeGetTopicAttributes(client, topicArn) {
        try {
            const output = await client.send(new GetTopicAttributesCommand({
                TopicArn: topicArn
            }));
            return output?.Attributes || null;
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to get topic attributes', { topicArn, error: error.message });
            return null;
        }
    }
    async _safeListSNSTags(client, resourceArn) {
        try {
            const output = await client.send(new ListSNSTagsCommand({
                ResourceArn: resourceArn
            }));
            return buildTagObject(output?.Tags);
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list SNS tags', { resourceArn, error: error.message });
            return null;
        }
    }
    async _safeListECSTags(client, resourceArn) {
        try {
            const output = await client.send(new ListECSTagsCommand({
                resourceArn
            }));
            return buildTagObject(output?.tags, 'key', 'value');
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list ECS tags', { resourceArn, error: error.message });
            return null;
        }
    }
    async _safeListEKSTags(client, resourceArn) {
        if (!resourceArn)
            return null;
        try {
            const output = await client.send(new ListEKSTagsCommand({
                resourceArn
            }));
            return output?.tags || null;
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list EKS tags', { resourceArn, error: error.message });
            return null;
        }
    }
    async _safeGetAPIGatewayTags(client, resourceId, region) {
        try {
            const output = await client.send(new GetAPIGatewayTagsCommand({
                resourceArn: `arn:aws:apigateway:${region}::/restapis/${resourceId}`
            }));
            return output?.tags || null;
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to get API Gateway tags', { resourceId, error: error.message });
            return null;
        }
    }
    async _safeGetAPIGatewayV2Tags(client, resourceId) {
        try {
            const output = await client.send(new GetAPIGatewayV2TagsCommand({
                ResourceArn: resourceId
            }));
            return output?.Tags || null;
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to get API Gateway v2 tags', { resourceId, error: error.message });
            return null;
        }
    }
    async _safeListCloudFrontTags(client, resourceArn) {
        try {
            const output = await client.send(new ListCloudFrontTagsCommand({
                Resource: resourceArn
            }));
            return buildTagObject(output?.Tags?.Items);
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list CloudFront tags', { resourceArn, error: error.message });
            return null;
        }
    }
    async _safeListRoute53Tags(client, resourceId) {
        try {
            const output = await client.send(new ListRoute53TagsCommand({
                ResourceType: 'hostedzone',
                ResourceId: resourceId.replace('/hostedzone/', '')
            }));
            return buildTagObject(output?.ResourceTagSet?.Tags);
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list Route53 tags', { resourceId, error: error.message });
            return null;
        }
    }
    async _safeListKMSTags(client, keyId) {
        try {
            const output = await client.send(new ListResourceTagsCommand({
                KeyId: keyId
            }));
            return buildTagObject(output?.Tags);
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list KMS tags', { keyId, error: error.message });
            return null;
        }
    }
    async _safeListSSMTags(client, resourceId) {
        try {
            const output = await client.send(new ListSSMTagsCommand({
                ResourceType: 'Parameter',
                ResourceId: resourceId
            }));
            return buildTagObject(output?.TagList);
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list SSM tags', { resourceId, error: error.message });
            return null;
        }
    }
    async _safeListElastiCacheTags(client, resourceArn) {
        if (!resourceArn)
            return null;
        try {
            const output = await client.send(new ListElastiCacheTagsCommand({
                ResourceName: resourceArn
            }));
            return buildTagObject(output?.TagList);
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list ElastiCache tags', { resourceArn, error: error.message });
            return null;
        }
    }
    async _safeDescribeEFSTags(client, fileSystemId) {
        try {
            const output = await client.send(new DescribeEFSTagsCommand({
                FileSystemId: fileSystemId
            }));
            return buildTagObject(output?.Tags);
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to describe EFS tags', { fileSystemId, error: error.message });
            return null;
        }
    }
    async _safeListECRTags(client, resourceArn) {
        try {
            const output = await client.send(new ListECRTagsCommand({
                resourceArn
            }));
            return buildTagObject(output?.tags, 'key', 'value');
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list ECR tags', { resourceArn, error: error.message });
            return null;
        }
    }
    async _safeListSFNTags(client, resourceArn) {
        try {
            const output = await client.send(new ListSFNTagsCommand({
                resourceArn
            }));
            return buildTagObject(output?.tags, 'key', 'value');
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list Step Functions tags', { resourceArn, error: error.message });
            return null;
        }
    }
    async _safeListEventBridgeTags(client, resourceArn) {
        if (!resourceArn)
            return null;
        try {
            const output = await client.send(new ListEventBridgeTagsCommand({
                ResourceARN: resourceArn
            }));
            return buildTagObject(output?.Tags);
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list EventBridge tags', { resourceArn, error: error.message });
            return null;
        }
    }
    async _safeListCloudWatchTags(client, resourceArn) {
        if (!resourceArn)
            return null;
        try {
            const output = await client.send(new ListCloudWatchTagsCommand({
                ResourceARN: resourceArn
            }));
            return buildTagObject(output?.Tags);
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list CloudWatch tags', { resourceArn, error: error.message });
            return null;
        }
    }
    async _safeListCWLogsTags(client, logGroupName) {
        try {
            const output = await client.send(new ListCWLogsTagsCommand({
                resourceArn: logGroupName
            }));
            return output?.tags || null;
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list CloudWatch Logs tags', { logGroupName, error: error.message });
            return null;
        }
    }
    async _safeListCloudTrailTags(client, resourceArn) {
        if (!resourceArn)
            return null;
        try {
            const output = await client.send(new ListCloudTrailTagsCommand({
                ResourceIdList: [resourceArn]
            }));
            const tagsList = output?.ResourceTagList?.[0]?.TagsList;
            return buildTagObject(tagsList);
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list CloudTrail tags', { resourceArn, error: error.message });
            return null;
        }
    }
    async _safeListACMTags(client, certificateArn) {
        try {
            const output = await client.send(new ListTagsForCertificateCommand({
                CertificateArn: certificateArn
            }));
            return buildTagObject(output?.Tags);
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list ACM tags', { certificateArn, error: error.message });
            return null;
        }
    }
    async _safeListWAFTags(client, resourceId) {
        try {
            const output = await client.send(new ListWAFTagsCommand({
                ResourceARN: `arn:aws:waf::${this._accountId}:webacl/${resourceId}`
            }));
            return buildTagObject(output?.Tags);
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list WAF tags', { resourceId, error: error.message });
            return null;
        }
    }
    async _safeListWAFV2Tags(client, resourceArn) {
        try {
            const output = await client.send(new ListWAFV2TagsCommand({
                ResourceARN: resourceArn
            }));
            return buildTagObject(output?.TagInfoForResource?.TagList);
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list WAFv2 tags', { resourceArn, error: error.message });
            return null;
        }
    }
    async _safeListCognitoTags(client, resourceArn) {
        if (!resourceArn)
            return null;
        try {
            const output = await client.send(new ListCognitoTagsCommand({
                ResourceArn: resourceArn
            }));
            return output?.Tags || null;
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list Cognito tags', { resourceArn, error: error.message });
            return null;
        }
    }
    async _safeListBackupTags(client, resourceArn) {
        try {
            const output = await client.send(new ListBackupTagsCommand({
                ResourceArn: resourceArn
            }));
            return output?.Tags || null;
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list Backup tags', { resourceArn, error: error.message });
            return null;
        }
    }
    async _safeListKinesisTags(client, streamName) {
        try {
            const output = await client.send(new ListTagsForStreamCommand({
                StreamName: streamName
            }));
            return buildTagObject(output?.Tags);
        }
        catch (err) {
            const error = err;
            this.logger('warn', 'Failed to list Kinesis tags', { streamName, error: error.message });
            return null;
        }
    }
}
export default AwsInventoryDriver;
//# sourceMappingURL=aws-driver.js.map