export interface CloudResourceSnapshot {
  resourceType: string;
  resourceId: string;
  configuration?: Record<string, unknown>;
}

interface TerraformResourceInstance {
  schema_version: number;
  attributes: Record<string, unknown>;
  private: string;
  dependencies: string[];
}

interface TerraformResource {
  mode: string;
  type: string;
  name: string;
  provider: string;
  instances: TerraformResourceInstance[];
}

interface TerraformState {
  version: number;
  terraform_version: string;
  serial: number;
  lineage: string;
  outputs: Record<string, unknown>;
  resources: TerraformResource[];
}

interface ExportOptions {
  terraformVersion?: string;
  lineage?: string;
  serial?: number;
  outputs?: Record<string, unknown>;
  resourceTypes?: string[];
  providers?: string[];
}

interface ExportResult {
  state: TerraformState;
  stats: {
    total: number;
    converted: number;
    skipped: number;
    skippedTypes: string[];
  };
}

const RESOURCE_TYPE_MAP: Record<string, string> = {
  // AWS
  'aws.ec2.instance': 'aws_instance',
  'aws.s3.bucket': 'aws_s3_bucket',
  'aws.rds.instance': 'aws_db_instance',
  'aws.dynamodb.table': 'aws_dynamodb_table',
  'aws.lambda.function': 'aws_lambda_function',
  'aws.vpc.vpc': 'aws_vpc',
  'aws.vpc.subnet': 'aws_subnet',
  'aws.vpc.securitygroup': 'aws_security_group',
  'aws.vpc.routetable': 'aws_route_table',
  'aws.vpc.internetgateway': 'aws_internet_gateway',
  'aws.vpc.natgateway': 'aws_nat_gateway',
  'aws.elb.loadbalancer': 'aws_elb',
  'aws.elbv2.loadbalancer': 'aws_lb',
  'aws.elbv2.targetgroup': 'aws_lb_target_group',
  'aws.iam.user': 'aws_iam_user',
  'aws.iam.role': 'aws_iam_role',
  'aws.iam.policy': 'aws_iam_policy',
  'aws.kms.key': 'aws_kms_key',
  'aws.secretsmanager.secret': 'aws_secretsmanager_secret',
  'aws.ecs.cluster': 'aws_ecs_cluster',
  'aws.ecs.service': 'aws_ecs_service',
  'aws.ecs.taskdefinition': 'aws_ecs_task_definition',
  'aws.eks.cluster': 'aws_eks_cluster',
  'aws.eks.nodegroup': 'aws_eks_node_group',
  'aws.ecr.repository': 'aws_ecr_repository',
  'aws.route53.hostedzone': 'aws_route53_zone',
  'aws.cloudfront.distribution': 'aws_cloudfront_distribution',
  'aws.sqs.queue': 'aws_sqs_queue',
  'aws.sns.topic': 'aws_sns_topic',
  'aws.kinesis.stream': 'aws_kinesis_stream',
  'aws.ebs.volume': 'aws_ebs_volume',
  'aws.ebs.snapshot': 'aws_ebs_snapshot',
  'aws.efs.filesystem': 'aws_efs_file_system',
  'aws.elasticache.cluster': 'aws_elasticache_cluster',

  // GCP
  'gcp.compute.instance': 'google_compute_instance',
  'gcp.storage.bucket': 'google_storage_bucket',
  'gcp.sql.instance': 'google_sql_database_instance',
  'gcp.gke.cluster': 'google_container_cluster',
  'gcp.compute.network': 'google_compute_network',
  'gcp.compute.subnetwork': 'google_compute_subnetwork',
  'gcp.compute.firewall': 'google_compute_firewall',
  'gcp.bigquery.dataset': 'google_bigquery_dataset',
  'gcp.pubsub.topic': 'google_pubsub_topic',
  'gcp.pubsub.subscription': 'google_pubsub_subscription',
  'gcp.functions.function': 'google_cloudfunctions_function',
  'gcp.run.service': 'google_cloud_run_service',
  'gcp.iam.serviceaccount': 'google_service_account',
  'gcp.kms.keyring': 'google_kms_key_ring',
  'gcp.secretmanager.secret': 'google_secret_manager_secret',

  // Azure
  'azure.vm': 'azurerm_virtual_machine',
  'azure.vm.vmss': 'azurerm_virtual_machine_scale_set',
  'azure.storage.account': 'azurerm_storage_account',
  'azure.sql.server': 'azurerm_sql_server',
  'azure.sql.database': 'azurerm_sql_database',
  'azure.aks.cluster': 'azurerm_kubernetes_cluster',
  'azure.network.vnet': 'azurerm_virtual_network',
  'azure.network.subnet': 'azurerm_subnet',
  'azure.network.nsg': 'azurerm_network_security_group',
  'azure.network.loadbalancer': 'azurerm_lb',
  'azure.network.publicip': 'azurerm_public_ip',
  'azure.containerregistry': 'azurerm_container_registry',
  'azure.cosmosdb.account': 'azurerm_cosmosdb_account',
  'azure.identity.userassigned': 'azurerm_user_assigned_identity',
  'azure.dns.zone': 'azurerm_dns_zone',

  // DigitalOcean
  'do.droplet': 'digitalocean_droplet',
  'do.kubernetes.cluster': 'digitalocean_kubernetes_cluster',
  'do.volume': 'digitalocean_volume',
  'do.loadbalancer': 'digitalocean_loadbalancer',
  'do.firewall': 'digitalocean_firewall',
  'do.vpc': 'digitalocean_vpc',
  'do.spaces.bucket': 'digitalocean_spaces_bucket',
  'do.database.cluster': 'digitalocean_database_cluster',
  'do.domain': 'digitalocean_domain',
  'do.cdn': 'digitalocean_cdn',
  'do.registry': 'digitalocean_container_registry',

  // Alibaba Cloud
  'alibaba.ecs.instance': 'alicloud_instance',
  'alibaba.oss.bucket': 'alicloud_oss_bucket',
  'alibaba.rds.instance': 'alicloud_db_instance',
  'alibaba.ack.cluster': 'alicloud_cs_kubernetes',
  'alibaba.vpc.vpc': 'alicloud_vpc',
  'alibaba.vpc.vswitch': 'alicloud_vswitch',
  'alibaba.slb.loadbalancer': 'alicloud_slb',
  'alibaba.redis.instance': 'alicloud_kvstore_instance',
  'alibaba.cdn.distribution': 'alicloud_cdn_domain',
  'alibaba.dns.domain': 'alicloud_dns',
  'alibaba.ecs.securitygroup': 'alicloud_security_group',
  'alibaba.ecs.snapshot': 'alicloud_snapshot',
  'alibaba.ess.scalinggroup': 'alicloud_ess_scaling_group',
  'alibaba.ess.scalingconfiguration': 'alicloud_ess_scaling_configuration',
  'alibaba.natgateway': 'alicloud_nat_gateway',
  'alibaba.acr.repository': 'alicloud_cr_repo',

  // Linode
  'linode.compute.instance': 'linode_instance',
  'linode.lke.cluster': 'linode_lke_cluster',
  'linode.volume': 'linode_volume',
  'linode.nodebalancer': 'linode_nodebalancer',
  'linode.firewall': 'linode_firewall',
  'linode.domain': 'linode_domain',
  'linode.objectstorage.bucket': 'linode_object_storage_bucket',
  'linode.database': 'linode_database_mysql',

  // Hetzner
  'hetzner.server': 'hetzner_server',
  'hetzner.volume': 'hetzner_volume',
  'hetzner.network': 'hetzner_network',
  'hetzner.loadbalancer': 'hetzner_load_balancer',
  'hetzner.firewall': 'hetzner_firewall',
  'hetzner.floatingip': 'hetzner_floating_ip',
  'hetzner.primaryip': 'hetzner_primary_ip',
  'hetzner.sshkey': 'hetzner_ssh_key',
  'hetzner.placementgroup': 'hetzner_placement_group',

  // Vultr
  'vultr.instance': 'vultr_instance',
  'vultr.kubernetes.cluster': 'vultr_kubernetes',
  'vultr.blockstorage': 'vultr_block_storage',
  'vultr.loadbalancer': 'vultr_load_balancer',
  'vultr.firewall.group': 'vultr_firewall_group',
  'vultr.vpc': 'vultr_vpc',
  'vultr.objectstorage': 'vultr_object_storage',
  'vultr.database': 'vultr_database',

  // Oracle Cloud
  'oci.compute.instance': 'oci_core_instance',
  'oci.objectstorage.bucket': 'oci_objectstorage_bucket',
  'oci.database.autonomousdatabase': 'oci_database_autonomous_database',
  'oci.database.dbsystem': 'oci_database_db_system',
  'oci.kubernetes.cluster': 'oci_containerengine_cluster',
  'oci.vcn': 'oci_core_vcn',
  'oci.vcn.subnet': 'oci_core_subnet',
  'oci.compute.volume': 'oci_core_volume',
  'oci.filestorage.filesystem': 'oci_file_storage_file_system',
  'oci.loadbalancer': 'oci_load_balancer',
  'oci.dns.zone': 'oci_dns_zone',

  // Cloudflare
  'cloudflare.workers.script': 'cloudflare_worker_script',
  'cloudflare.r2.bucket': 'cloudflare_r2_bucket',
  'cloudflare.pages.project': 'cloudflare_pages_project',
  'cloudflare.d1.database': 'cloudflare_d1_database',
  'cloudflare.kv.namespace': 'cloudflare_workers_kv_namespace',
  'cloudflare.durable-objects.namespace': 'cloudflare_workers_durable_object_namespace',
  'cloudflare.zone': 'cloudflare_zone',
  'cloudflare.dns.record': 'cloudflare_record',
  'cloudflare.loadbalancer': 'cloudflare_load_balancer',
  'cloudflare.ssl.certificate': 'cloudflare_origin_ca_certificate',
  'cloudflare.waf.ruleset': 'cloudflare_ruleset',
  'cloudflare.access.application': 'cloudflare_access_application',
  'cloudflare.access.policy': 'cloudflare_access_policy',

  // MongoDB Atlas
  'mongodb-atlas.project': 'mongodbatlas_project',
  'mongodb-atlas.cluster': 'mongodbatlas_cluster',
  'mongodb-atlas.serverless': 'mongodbatlas_serverless_instance',
  'mongodb-atlas.user': 'mongodbatlas_database_user',
  'mongodb-atlas.accesslist': 'mongodbatlas_project_ip_access_list',
  'mongodb-atlas.backup': 'mongodbatlas_cloud_backup_snapshot',
  'mongodb-atlas.alert': 'mongodbatlas_alert_configuration',
  'mongodb-atlas.datalake': 'mongodbatlas_data_lake',
  'mongodb-atlas.search.index': 'mongodbatlas_search_index',
  'mongodb-atlas.customrole': 'mongodbatlas_custom_db_role',
  'mongodb-atlas.event': 'mongodbatlas_event_trigger'
};

const PROVIDER_MAP: Record<string, string> = {
  'aws': 'registry.terraform.io/hashicorp/aws',
  'gcp': 'registry.terraform.io/hashicorp/google',
  'azure': 'registry.terraform.io/hashicorp/azurerm',
  'do': 'registry.terraform.io/digitalocean/digitalocean',
  'alibaba': 'registry.terraform.io/aliyun/alicloud',
  'linode': 'registry.terraform.io/linode/linode',
  'hetzner': 'registry.terraform.io/hetznercloud/hetzner',
  'vultr': 'registry.terraform.io/vultr/vultr',
  'oci': 'registry.terraform.io/hashicorp/oci',
  'oracle': 'registry.terraform.io/hashicorp/oci',
  'cloudflare': 'registry.terraform.io/cloudflare/cloudflare',
  'mongodb-atlas': 'registry.terraform.io/mongodb/mongodbatlas'
};

function getProviderConfig(resourceType: string): string {
  const provider = resourceType.split('.')[0]!;
  return PROVIDER_MAP[provider] || `registry.terraform.io/hashicorp/${provider}`;
}

function sanitizeResourceName(resourceId: string): string {
  let name = String(resourceId)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!name || !/^[a-z]/.test(name)) {
    name = `resource_${name}`;
  }

  return name.slice(0, 64) || 'resource';
}

function generateLineage(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function convertToTerraformResource(resource: CloudResourceSnapshot): TerraformResource | null {
  const { resourceType, resourceId, configuration } = resource;

  const tfType = RESOURCE_TYPE_MAP[resourceType];
  if (!tfType) {
    return null;
  }

  const resourceName = sanitizeResourceName(resourceId);
  const providerFqn = getProviderConfig(resourceType);

  return {
    mode: 'managed',
    type: tfType,
    name: resourceName,
    provider: providerFqn,
    instances: [
      {
        schema_version: 0,
        attributes: configuration || {},
        private: 'bnVsbA==',
        dependencies: []
      }
    ]
  };
}

export function exportToTerraformState(
  snapshots: CloudResourceSnapshot[],
  options: ExportOptions = {}
): ExportResult {
  const {
    terraformVersion = '1.5.0',
    lineage = generateLineage(),
    serial = 1,
    outputs = {},
    resourceTypes = [],
    providers = []
  } = options;

  let filteredSnapshots = snapshots;

  if (resourceTypes.length > 0) {
    filteredSnapshots = filteredSnapshots.filter(s =>
      resourceTypes.includes(s.resourceType)
    );
  }

  if (providers.length > 0) {
    filteredSnapshots = filteredSnapshots.filter(s => {
      const provider = s.resourceType?.split('.')[0] || '';
      return providers.includes(provider);
    });
  }

  const tfResources: TerraformResource[] = [];
  const skipped: string[] = [];

  for (const snapshot of filteredSnapshots) {
    const tfResource = convertToTerraformResource(snapshot);
    if (tfResource) {
      tfResources.push(tfResource);
    } else {
      skipped.push(snapshot.resourceType);
    }
  }

  const state: TerraformState = {
    version: 4,
    terraform_version: terraformVersion,
    serial,
    lineage,
    outputs,
    resources: tfResources
  };

  return {
    state,
    stats: {
      total: snapshots.length,
      converted: tfResources.length,
      skipped: skipped.length,
      skippedTypes: [...new Set(skipped)]
    }
  };
}

export default {
  convertToTerraformResource,
  exportToTerraformState,
  RESOURCE_TYPE_MAP
};
