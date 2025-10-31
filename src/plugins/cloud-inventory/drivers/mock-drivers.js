import { BaseCloudDriver } from './base-driver.js';

const DEFAULT_TAGS = { environment: 'mock' };

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }
  if (value && typeof value === 'object') {
    return JSON.parse(JSON.stringify(value));
  }
  return value;
}

function mergeWithDefaults(defaults, resource = {}) {
  const merged = {
    ...defaults,
    ...resource
  };

  const baseTags = defaults.tags || null;
  const resourceTags = resource.tags || null;
  merged.tags = baseTags || resourceTags
    ? { ...(baseTags || {}), ...(resourceTags || {}) }
    : null;

  const baseLabels = defaults.labels || null;
  const resourceLabels = resource.labels || null;
  merged.labels = baseLabels || resourceLabels
    ? { ...(baseLabels || {}), ...(resourceLabels || {}) }
    : null;

  const baseMetadata = defaults.metadata || {};
  const resourceMetadata = resource.metadata || {};
  merged.metadata = { ...baseMetadata, ...resourceMetadata };

  const configuration = resource.configuration ?? defaults.configuration ?? {
    id: merged.resourceId,
    note: `Mock configuration for ${defaults.provider}`
  };
  merged.configuration = cloneValue(configuration);

  return merged;
}

class MockCloudDriver extends BaseCloudDriver {
  constructor(options = {}, defaultsBuilder) {
    super(options);
    this._defaultsBuilder = defaultsBuilder;
  }

  _buildDefaults() {
    return this._defaultsBuilder(this);
  }

  async initialize() {
    this.logger('debug', 'Mock cloud driver initialized', {
      cloudId: this.id,
      driver: this.driver
    });
  }

  async listResources() {
    const defaults = this._buildDefaults();
    const samples = Array.isArray(this.config.sampleResources) && this.config.sampleResources.length
      ? this.config.sampleResources
      : [defaults];

    return samples.map(entry => mergeWithDefaults(defaults, entry));
  }
}

function awsDefaults(driver) {
  const accountId = driver.config.accountId || 'mock-aws-account';
  const region = driver.config.region || driver.config.regions?.[0] || 'us-east-1';
  const resourceId = driver.config.resourceId || `i-${accountId.slice(-6) || 'mock'}001`;
  return {
    provider: 'aws',
    driver: 'aws',
    accountId,
    region,
    service: 'ec2',
    resourceType: 'ec2.instance',
    resourceId,
    name: 'mock-ec2-instance',
    tags: { ...DEFAULT_TAGS, Owner: 'cloud-inventory' },
    metadata: { source: 'cloud-inventory-mock' },
    configuration: {
      instanceId: resourceId,
      instanceType: 't3.micro',
      region,
      accountId,
      state: 'running',
      tags: { Environment: 'mock', Owner: 'cloud-inventory' }
    }
  };
}

function gcpDefaults(driver) {
  const projectId = driver.config.projectId || 'mock-gcp-project';
  const region = driver.config.region || driver.config.regions?.[0] || 'us-central1';
  const zone = driver.config.zone || `${region}-a`;
  const resourceId = driver.config.resourceId || `${projectId}-instance-1`;
  return {
    provider: 'gcp',
    driver: 'gcp',
    projectId,
    region,
    service: 'compute',
    resourceType: 'gcp.compute.instance',
    resourceId,
    name: 'mock-gce-instance',
    labels: { ...DEFAULT_TAGS, owner: 'cloud-inventory' },
    metadata: { source: 'cloud-inventory-mock', zone },
    configuration: {
      id: resourceId,
      name: 'mock-gce-instance',
      machineType: 'e2-medium',
      status: 'RUNNING',
      projectId,
      zone,
      labels: { environment: 'mock', owner: 'cloud-inventory' }
    }
  };
}

function digitalOceanDefaults(driver) {
  const accountId = driver.config.accountId || 'mock-do-account';
  const region = driver.config.region || driver.config.regions?.[0] || 'nyc3';
  const resourceId = driver.config.resourceId || `do-${accountId.slice(-6) || 'mock'}-droplet`;
  return {
    provider: 'digitalocean',
    driver: 'digitalocean',
    accountId,
    region,
    service: 'droplet',
    resourceType: 'do.droplet',
    resourceId,
    name: 'mock-droplet',
    tags: { ...DEFAULT_TAGS, owner: 'cloud-inventory' },
    metadata: { source: 'cloud-inventory-mock' },
    configuration: {
      id: resourceId,
      name: 'mock-droplet',
      size: 's-2vcpu-4gb',
      region,
      status: 'active',
      tags: ['mock', 'cloud-inventory']
    }
  };
}

function oracleDefaults(driver) {
  const tenancyId = driver.config.tenancyId || driver.config.organizationId || 'ocid1.tenancy.oc1..mock';
  const compartmentId = driver.config.compartmentId || 'ocid1.compartment.oc1..mock';
  const region = driver.config.region || 'us-phoenix-1';
  const resourceId = driver.config.resourceId || 'ocid1.instance.oc1..mock';
  return {
    provider: 'oracle',
    driver: 'oracle',
    organizationId: tenancyId,
    region,
    service: 'compute',
    resourceType: 'oci.compute.instance',
    resourceId,
    name: 'mock-oci-instance',
    tags: { ...DEFAULT_TAGS, owner: 'cloud-inventory' },
    metadata: {
      source: 'cloud-inventory-mock',
      compartmentId
    },
    configuration: {
      id: resourceId,
      displayName: 'mock-oci-instance',
      compartmentId,
      lifecycleState: 'RUNNING',
      region,
      shape: 'VM.Standard.E4.Flex',
      freeformTags: { Environment: 'mock', Owner: 'cloud-inventory' }
    }
  };
}

function azureDefaults(driver) {
  const subscriptionId = driver.config.subscriptionId || driver.config.accountId || '00000000-0000-0000-0000-000000000000';
  const resourceGroup = driver.config.resourceGroup || 'rg-mock';
  const region = driver.config.region || 'eastus';
  const vmName = driver.config.vmName || 'mock-azure-vm';
  const resourceId = driver.config.resourceId || `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Compute/virtualMachines/${vmName}`;
  return {
    provider: 'azure',
    driver: 'azure',
    subscriptionId,
    region,
    service: 'compute',
    resourceType: 'azure.vm',
    resourceId,
    name: vmName,
    tags: { ...DEFAULT_TAGS, owner: 'cloud-inventory' },
    metadata: {
      source: 'cloud-inventory-mock',
      resourceGroup
    },
    configuration: {
      id: resourceId,
      name: vmName,
      location: region,
      resourceGroup,
      subscriptionId,
      hardwareProfile: { vmSize: 'Standard_B2s' },
      provisioningState: 'Succeeded',
      tags: { Environment: 'mock', Owner: 'cloud-inventory' }
    }
  };
}

function vultrDefaults(driver) {
  const accountId = driver.config.accountId || 'mock-vultr-account';
  const region = driver.config.region || 'ewr';
  const resourceId = driver.config.resourceId || `vultr-${accountId.slice(-6) || 'mock'}-instance`;
  return {
    provider: 'vultr',
    driver: 'vultr',
    accountId,
    region,
    service: 'compute',
    resourceType: 'vultr.instance',
    resourceId,
    name: 'mock-vultr-instance',
    tags: { ...DEFAULT_TAGS, owner: 'cloud-inventory' },
    metadata: { source: 'cloud-inventory-mock' },
    configuration: {
      id: resourceId,
      label: 'mock-vultr-instance',
      plan: 'vc2-1c-1gb',
      region,
      status: 'active',
      tags: ['mock', 'cloud-inventory']
    }
  };
}

export class AwsMockDriver extends MockCloudDriver {
  constructor(options = {}) {
    super(options, awsDefaults);
  }
}

export class GcpMockDriver extends MockCloudDriver {
  constructor(options = {}) {
    super(options, gcpDefaults);
  }
}

export class DigitalOceanMockDriver extends MockCloudDriver {
  constructor(options = {}) {
    super(options, digitalOceanDefaults);
  }
}

export class OracleMockDriver extends MockCloudDriver {
  constructor(options = {}) {
    super(options, oracleDefaults);
  }
}

export class AzureMockDriver extends MockCloudDriver {
  constructor(options = {}) {
    super(options, azureDefaults);
  }
}

export class VultrMockDriver extends MockCloudDriver {
  constructor(options = {}) {
    super(options, vultrDefaults);
  }
}

function linodeDefaults(driver) {
  const accountId = driver.config.accountId || 'mock-linode-account';
  const region = driver.config.region || driver.config.regions?.[0] || 'us-east';
  const resourceId = driver.config.resourceId || `linode-${accountId.slice(-6) || 'mock'}-instance`;
  return {
    provider: 'linode',
    driver: 'linode',
    accountId,
    region,
    service: 'linodes',
    resourceType: 'linode.compute.instance',
    resourceId,
    name: 'mock-linode-instance',
    tags: ['mock', 'cloud-inventory'],
    metadata: { source: 'cloud-inventory-mock' },
    configuration: {
      id: resourceId,
      label: 'mock-linode-instance',
      type: 'g6-nanode-1',
      region,
      status: 'running',
      tags: ['mock', 'cloud-inventory']
    }
  };
}

function hetznerDefaults(driver) {
  const accountId = driver.config.accountId || 'mock-hetzner-account';
  const region = driver.config.region || 'fsn1';
  const resourceId = driver.config.resourceId || `hetzner-${accountId.slice(-6) || 'mock'}-server`;
  return {
    provider: 'hetzner',
    driver: 'hetzner',
    accountId,
    region,
    service: 'servers',
    resourceType: 'hetzner.server',
    resourceId,
    name: 'mock-hetzner-server',
    tags: { ...DEFAULT_TAGS, owner: 'cloud-inventory' },
    metadata: { source: 'cloud-inventory-mock' },
    configuration: {
      id: resourceId,
      name: 'mock-hetzner-server',
      serverType: 'cx11',
      datacenter: { location: { name: region } },
      status: 'running',
      labels: { environment: 'mock', owner: 'cloud-inventory' }
    }
  };
}

function alibabaDefaults(driver) {
  const accountId = driver.config.accountId || 'mock-alibaba-account';
  const region = driver.config.region || driver.config.regions?.[0] || 'cn-hangzhou';
  const resourceId = driver.config.resourceId || `i-${accountId.slice(-6) || 'mock'}001`;
  return {
    provider: 'alibaba',
    driver: 'alibaba',
    accountId,
    region,
    service: 'ecs',
    resourceType: 'alibaba.ecs.instance',
    resourceId,
    name: 'mock-ecs-instance',
    tags: { ...DEFAULT_TAGS, owner: 'cloud-inventory' },
    metadata: { source: 'cloud-inventory-mock' },
    configuration: {
      InstanceId: resourceId,
      InstanceName: 'mock-ecs-instance',
      InstanceType: 'ecs.t5-lc1m1.small',
      RegionId: region,
      Status: 'Running',
      Tags: { Tag: [{ TagKey: 'environment', TagValue: 'mock' }] }
    }
  };
}

function cloudflareDefaults(driver) {
  const accountId = driver.config.accountId || 'mock-cloudflare-account';
  const resourceId = driver.config.resourceId || `cf-worker-${accountId.slice(-6) || 'mock'}`;
  return {
    provider: 'cloudflare',
    driver: 'cloudflare',
    accountId,
    region: 'global',
    service: 'workers',
    resourceType: 'cloudflare.workers.script',
    resourceId,
    name: 'mock-worker-script',
    tags: ['mock', 'cloud-inventory'],
    metadata: { source: 'cloud-inventory-mock' },
    configuration: {
      id: resourceId,
      script: 'mock-worker-script',
      etag: 'mock-etag',
      created_on: new Date().toISOString(),
      modified_on: new Date().toISOString(),
      tags: ['mock', 'cloud-inventory']
    }
  };
}

export class LinodeMockDriver extends MockCloudDriver {
  constructor(options = {}) {
    super(options, linodeDefaults);
  }
}

export class HetznerMockDriver extends MockCloudDriver {
  constructor(options = {}) {
    super(options, hetznerDefaults);
  }
}

export class AlibabaMockDriver extends MockCloudDriver {
  constructor(options = {}) {
    super(options, alibabaDefaults);
  }
}

export class CloudflareMockDriver extends MockCloudDriver {
  constructor(options = {}) {
    super(options, cloudflareDefaults);
  }
}

function mongodbAtlasDefaults(driver) {
  const organizationId = driver.config.organizationId || 'mock-atlas-org';
  const projectId = driver.config.projectId || 'mock-atlas-project';
  const resourceId = driver.config.resourceId || `cluster-${projectId.slice(-6) || 'mock'}`;
  return {
    provider: 'mongodb-atlas',
    driver: 'mongodb-atlas',
    accountId: organizationId,
    region: 'US_EAST_1',
    service: 'clusters',
    resourceType: 'mongodb-atlas.cluster',
    resourceId,
    name: 'mock-atlas-cluster',
    tags: { ...DEFAULT_TAGS, environment: 'development' },
    metadata: {
      source: 'cloud-inventory-mock',
      projectId,
      tier: 'M10',
      provider: 'AWS',
      mongoDBVersion: '7.0'
    },
    configuration: {
      id: resourceId,
      name: 'mock-atlas-cluster',
      clusterType: 'REPLICASET',
      stateName: 'IDLE',
      mongoDBVersion: '7.0.2',
      providerSettings: {
        providerName: 'AWS',
        regionName: 'US_EAST_1',
        instanceSizeName: 'M10'
      },
      tags: { environment: 'development', owner: 'cloud-inventory' }
    }
  };
}

export class MongoDBAtlasMockDriver extends MockCloudDriver {
  constructor(options = {}) {
    super(options, mongodbAtlasDefaults);
  }
}

export default MockCloudDriver;
