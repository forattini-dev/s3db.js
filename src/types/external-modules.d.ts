/**
 * Ambient module declarations for optional peer dependencies.
 * These modules are dynamically imported and only loaded when used.
 */

// Alibaba Cloud SDKs
declare module '@alicloud/pop-core' {
  interface RPCClientOptions {
    accessKeyId: string | null;
    accessKeySecret: string | null;
    endpoint: string;
    apiVersion: string;
  }
  export default class RPCClient {
    constructor(options: RPCClientOptions);
    request(action: string, params: Record<string, unknown>, options: { method: string }): Promise<Record<string, unknown>>;
  }
}

declare module 'ali-oss' {
  interface OSSClientOptions {
    region: string;
    accessKeyId: string | null;
    accessKeySecret: string | null;
  }
  export default class OSS {
    constructor(options: OSSClientOptions);
    listBuckets(): Promise<{ buckets: Array<{ name: string; region: string }> }>;
  }
}

// Azure SDKs
declare module '@azure/identity' {
  export class DefaultAzureCredential {
    constructor();
  }
}

declare module '@azure/arm-compute' {
  import { DefaultAzureCredential } from '@azure/identity';

  interface VirtualMachine {
    id?: string;
    name?: string;
    location?: string;
    properties?: {
      hardwareProfile?: { vmSize?: string };
      storageProfile?: {
        imageReference?: { publisher?: string; offer?: string; sku?: string };
        osDisk?: { osType?: string };
      };
      networkProfile?: { networkInterfaces?: Array<{ id?: string }> };
      provisioningState?: string;
    };
    tags?: Record<string, string>;
  }

  interface Disk {
    id?: string;
    name?: string;
    location?: string;
    properties?: {
      diskSizeGB?: number;
      diskState?: string;
      provisioningState?: string;
    };
    sku?: { name?: string };
    tags?: Record<string, string>;
  }

  export class ComputeManagementClient {
    constructor(credential: DefaultAzureCredential, subscriptionId: string);
    virtualMachines: {
      listAll(): AsyncIterable<VirtualMachine>;
    };
    disks: {
      list(): AsyncIterable<Disk>;
    };
  }
}

declare module '@azure/arm-containerservice' {
  import { DefaultAzureCredential } from '@azure/identity';

  interface ManagedCluster {
    id?: string;
    name?: string;
    location?: string;
    properties?: {
      kubernetesVersion?: string;
      provisioningState?: string;
      agentPoolProfiles?: Array<{
        name?: string;
        count?: number;
        vmSize?: string;
      }>;
    };
    tags?: Record<string, string>;
  }

  export class ContainerServiceClient {
    constructor(credential: DefaultAzureCredential, subscriptionId: string);
    managedClusters: {
      list(): AsyncIterable<ManagedCluster>;
    };
  }
}

declare module '@azure/arm-storage' {
  import { DefaultAzureCredential } from '@azure/identity';

  interface StorageAccount {
    id?: string;
    name?: string;
    location?: string;
    kind?: string;
    sku?: { name?: string; tier?: string };
    properties?: { provisioningState?: string };
    tags?: Record<string, string>;
  }

  export class StorageManagementClient {
    constructor(credential: DefaultAzureCredential, subscriptionId: string);
    storageAccounts: {
      list(): AsyncIterable<StorageAccount>;
    };
  }
}

declare module '@azure/arm-sql' {
  import { DefaultAzureCredential } from '@azure/identity';

  interface Database {
    id?: string;
    name?: string;
    location?: string;
    properties?: {
      status?: string;
      maxSizeBytes?: number;
      collation?: string;
    };
    sku?: { name?: string; tier?: string; capacity?: number };
    tags?: Record<string, string>;
  }

  export class SqlManagementClient {
    constructor(credential: DefaultAzureCredential, subscriptionId: string);
    databases: {
      listByServer(resourceGroupName: string, serverName: string): AsyncIterable<Database>;
    };
  }
}

declare module '@azure/arm-cosmosdb' {
  import { DefaultAzureCredential } from '@azure/identity';

  interface DatabaseAccount {
    id?: string;
    name?: string;
    location?: string;
    kind?: string;
    properties?: {
      documentEndpoint?: string;
      provisioningState?: string;
      capabilities?: Array<{ name?: string }>;
    };
    tags?: Record<string, string>;
  }

  export class CosmosDBManagementClient {
    constructor(credential: DefaultAzureCredential, subscriptionId: string);
    databaseAccounts: {
      list(): AsyncIterable<DatabaseAccount>;
    };
  }
}

declare module '@azure/arm-network' {
  import { DefaultAzureCredential } from '@azure/identity';

  interface VirtualNetwork {
    id?: string;
    name?: string;
    location?: string;
    properties?: {
      addressSpace?: { addressPrefixes?: string[] };
      subnets?: Array<{ name?: string }>;
      provisioningState?: string;
    };
    tags?: Record<string, string>;
  }

  interface NetworkSecurityGroup {
    id?: string;
    name?: string;
    location?: string;
    properties?: {
      securityRules?: Array<{
        name?: string;
        properties?: {
          direction?: string;
          access?: string;
          sourceAddressPrefix?: string;
          destinationPortRange?: string;
        };
      }>;
    };
    tags?: Record<string, string>;
  }

  interface LoadBalancer {
    id?: string;
    name?: string;
    location?: string;
    sku?: { name?: string };
    properties?: {
      frontendIPConfigurations?: Array<{ name?: string }>;
      backendAddressPools?: Array<{ name?: string }>;
    };
    tags?: Record<string, string>;
  }

  interface PublicIPAddress {
    id?: string;
    name?: string;
    location?: string;
    properties?: {
      ipAddress?: string;
      publicIPAllocationMethod?: string;
    };
    sku?: { name?: string };
    tags?: Record<string, string>;
  }

  export class NetworkManagementClient {
    constructor(credential: DefaultAzureCredential, subscriptionId: string);
    virtualNetworks: { listAll(): AsyncIterable<VirtualNetwork> };
    networkSecurityGroups: { listAll(): AsyncIterable<NetworkSecurityGroup> };
    loadBalancers: { listAll(): AsyncIterable<LoadBalancer> };
    publicIPAddresses: { listAll(): AsyncIterable<PublicIPAddress> };
  }
}

declare module '@azure/arm-containerregistry' {
  import { DefaultAzureCredential } from '@azure/identity';

  interface Registry {
    id?: string;
    name?: string;
    location?: string;
    sku?: { name?: string };
    properties?: {
      loginServer?: string;
      provisioningState?: string;
    };
    tags?: Record<string, string>;
  }

  export class ContainerRegistryManagementClient {
    constructor(credential: DefaultAzureCredential, subscriptionId: string);
    registries: { list(): AsyncIterable<Registry> };
  }
}

declare module '@azure/arm-dns' {
  import { DefaultAzureCredential } from '@azure/identity';

  interface Zone {
    id?: string;
    name?: string;
    location?: string;
    properties?: {
      numberOfRecordSets?: number;
    };
    tags?: Record<string, string>;
  }

  export class DnsManagementClient {
    constructor(credential: DefaultAzureCredential, subscriptionId: string);
    zones: { list(): AsyncIterable<Zone> };
  }
}

declare module '@azure/arm-msi' {
  import { DefaultAzureCredential } from '@azure/identity';

  interface Identity {
    id?: string;
    name?: string;
    location?: string;
    type?: string;
    properties?: {
      clientId?: string;
      principalId?: string;
    };
    tags?: Record<string, string>;
  }

  export class ManagedServiceIdentityClient {
    constructor(credential: DefaultAzureCredential, subscriptionId: string);
    userAssignedIdentities: { listBySubscription(): AsyncIterable<Identity> };
  }
}

// Cloudflare SDK
declare module 'cloudflare' {
  interface CloudflareOptions {
    apiToken: string;
  }

  interface Zone {
    id: string;
    name: string;
    status: string;
    paused: boolean;
    type: string;
    plan?: { name: string };
    development_mode: number;
  }

  interface DNSRecord {
    id: string;
    name: string;
    type: string;
    content: string;
    ttl: number;
    proxied: boolean;
    zone_id: string;
    zone_name: string;
  }

  interface Worker {
    id: string;
    etag: string;
    handlers?: string[];
  }

  interface R2Bucket {
    name: string;
    creation_date: string;
  }

  export default class Cloudflare {
    constructor(options: CloudflareOptions);
    zones: {
      list(): Promise<{ result: Zone[] }>;
    };
    dnsRecords: {
      list(params: { zone_id: string }): Promise<{ result: DNSRecord[] }>;
    };
    workers: {
      scripts: {
        list(params: { account_id: string }): Promise<{ result: Worker[] }>;
      };
    };
    r2: {
      buckets: {
        list(params: { account_id: string }): Promise<{ result: R2Bucket[] }>;
      };
    };
    kvNamespaces: {
      list(params: { account_id: string }): Promise<{ result: Array<{ id: string; title: string }> }>;
    };
    pages: {
      projects: {
        list(params: { account_id: string }): Promise<{ result: Array<{ name: string; subdomain: string }> }>;
      };
    };
  }
}

// DigitalOcean SDK
declare module 'digitalocean-js' {
  interface DigitalOceanOptions {
    token: string;
  }

  interface Droplet {
    id: number;
    name: string;
    region: { slug: string; name: string };
    size: { slug: string; memory: number; vcpus: number; disk: number };
    image: { id: number; name: string; distribution: string };
    status: string;
    tags: string[];
    networks: { v4: Array<{ ip_address: string; type: string }> };
  }

  interface KubernetesCluster {
    id: string;
    name: string;
    region: string;
    version: string;
    status: { state: string };
    node_pools: Array<{ name: string; size: string; count: number }>;
    tags: string[];
  }

  export default class DigitalOcean {
    constructor(token: string);
    droplet: { list(): Promise<Droplet[]> };
    kubernetes: { list(): Promise<KubernetesCluster[]> };
    spaces: { list(): Promise<Array<{ name: string; region: string }>> };
    database: { list(): Promise<Array<{ id: string; name: string; engine: string; size: string; region: string; status: string }>> };
    loadBalancer: { list(): Promise<Array<{ id: string; name: string; ip: string; status: string; region: { slug: string } }>> };
    volume: { list(): Promise<Array<{ id: string; name: string; region: { slug: string }; size_gigabytes: number; filesystem_type: string }>> };
    snapshot: { list(): Promise<Array<{ id: string; name: string; resource_id: string; resource_type: string; size_gigabytes: number }>> };
    domain: { list(): Promise<Array<{ name: string; ttl: number }>> };
    firewall: { list(): Promise<Array<{ id: string; name: string; status: string }>> };
    vpc: { list(): Promise<Array<{ id: string; name: string; region: string; ip_range: string }>> };
    registry: { get(): Promise<{ name: string; storage_usage_bytes: number; created_at: string } | null> };
    app: { list(): Promise<Array<{ id: string; spec: { name: string }; live_domain: string }>> };
    cdn: { list(): Promise<Array<{ id: string; origin: string; endpoint: string }>> };
    project: { list(): Promise<Array<{ id: string; name: string; environment: string }>> };
  }
}

// Google Cloud SDKs
declare module '@google-cloud/compute' {
  interface InstancesClient {
    aggregatedListAsync(request: { project: string }): AsyncIterable<[string, { instances?: GCPInstance[] }]>;
  }

  interface GCPInstance {
    id?: string;
    name?: string;
    zone?: string;
    machineType?: string;
    status?: string;
    networkInterfaces?: Array<{
      networkIP?: string;
      accessConfigs?: Array<{ natIP?: string }>;
    }>;
    labels?: Record<string, string>;
  }

  interface DisksClient {
    aggregatedListAsync(request: { project: string }): AsyncIterable<[string, { disks?: GCPDisk[] }]>;
  }

  interface GCPDisk {
    id?: string;
    name?: string;
    zone?: string;
    sizeGb?: string;
    type?: string;
    status?: string;
    labels?: Record<string, string>;
  }

  interface NetworksClient {
    list(request: { project: string }): Promise<[Array<{ id?: string; name?: string; subnetworks?: string[] }>]>;
  }

  interface FirewallsClient {
    list(request: { project: string }): Promise<[Array<{
      id?: string;
      name?: string;
      network?: string;
      direction?: string;
      allowed?: Array<{ IPProtocol?: string; ports?: string[] }>;
      sourceRanges?: string[];
    }>]>;
  }

  interface AddressesClient {
    aggregatedListAsync(request: { project: string }): AsyncIterable<[string, { addresses?: Array<{
      id?: string;
      name?: string;
      region?: string;
      address?: string;
      addressType?: string;
      status?: string;
    }> }]>;
  }

  interface SnapshotsClient {
    list(request: { project: string }): Promise<[Array<{
      id?: string;
      name?: string;
      sourceDisk?: string;
      storageBytes?: string;
      status?: string;
    }>]>;
  }

  export { InstancesClient, DisksClient, NetworksClient, FirewallsClient, AddressesClient, SnapshotsClient };
}

declare module '@google-cloud/container' {
  interface ClusterManagerClient {
    listClusters(request: { parent: string }): Promise<[{ clusters?: GKECluster[] }]>;
  }

  interface GKECluster {
    name?: string;
    location?: string;
    currentMasterVersion?: string;
    status?: string;
    nodePools?: Array<{
      name?: string;
      config?: { machineType?: string };
      initialNodeCount?: number;
    }>;
    resourceLabels?: Record<string, string>;
  }

  export { ClusterManagerClient };
}

declare module '@google-cloud/run' {
  interface ServicesClient {
    listServices(request: { parent: string }): Promise<[Array<{
      name?: string;
      uri?: string;
      generation?: string;
      conditions?: Array<{ type?: string; state?: string }>;
      labels?: Record<string, string>;
    }>]>;
  }

  export { ServicesClient };
}

declare module '@google-cloud/functions' {
  interface CloudFunctionsServiceClient {
    listFunctions(request: { parent: string }): Promise<[Array<{
      name?: string;
      runtime?: string;
      availableMemoryMb?: number;
      status?: string;
      entryPoint?: string;
      labels?: Record<string, string>;
    }>]>;
  }

  export { CloudFunctionsServiceClient };
}

declare module '@google-cloud/storage' {
  interface Storage {
    getBuckets(): Promise<[Array<{
      name: string;
      metadata: {
        location?: string;
        storageClass?: string;
        labels?: Record<string, string>;
      };
    }>]>;
  }

  export { Storage };
}

declare module '@google-cloud/sql' {
  interface SqlInstancesServiceClient {
    listDatabases(request: { project: string }): Promise<[Array<{
      name?: string;
      databaseVersion?: string;
      region?: string;
      state?: string;
      settings?: {
        tier?: string;
        dataDiskSizeGb?: string;
      };
    }>]>;
  }

  export { SqlInstancesServiceClient };
}

declare module '@google-cloud/pubsub' {
  interface PubSub {
    getTopics(): Promise<[Array<{ name: string }>]>;
    getSubscriptions(): Promise<[Array<{
      name: string;
      topic?: { name: string };
    }>]>;
  }

  export { PubSub };
}

declare module '@google-cloud/iam' {
  interface IAMClient {
    listServiceAccounts(request: { name: string }): Promise<[Array<{
      name?: string;
      email?: string;
      displayName?: string;
    }>]>;
  }

  export { IAMClient };
}

declare module '@google-cloud/kms' {
  interface KeyManagementServiceClient {
    listCryptoKeys(request: { parent: string }): Promise<[Array<{
      name?: string;
      purpose?: string;
      primary?: { state?: string };
    }>]>;
    listKeyRings(request: { parent: string }): Promise<[Array<{ name: string }>]>;
  }

  export { KeyManagementServiceClient };
}

declare module '@google-cloud/secret-manager' {
  interface SecretManagerServiceClient {
    listSecrets(request: { parent: string }): Promise<[Array<{
      name?: string;
      labels?: Record<string, string>;
    }>]>;
  }

  export { SecretManagerServiceClient };
}

// Hetzner Cloud SDK
declare module 'hcloud-js' {
  interface HCloudOptions {
    token: string;
  }

  interface HCloudServer {
    id: number;
    name: string;
    status: string;
    server_type: { name: string; cores: number; memory: number; disk: number };
    datacenter: { name: string; location: { name: string } };
    public_net: { ipv4: { ip: string }; ipv6: { ip: string } };
    labels: Record<string, string>;
    image?: { name: string; os_flavor: string };
  }

  export default class HCloud {
    constructor(options: HCloudOptions);
    servers: { list(): Promise<{ servers: HCloudServer[] }> };
    volumes: { list(): Promise<{ volumes: Array<{ id: number; name: string; size: number; status: string; location: { name: string }; labels: Record<string, string> }> }> };
    loadBalancers: { list(): Promise<{ load_balancers: Array<{ id: number; name: string; public_net: { enabled: boolean; ipv4: { ip: string } }; algorithm: { type: string }; labels: Record<string, string> }> }> };
    floatingIps: { list(): Promise<{ floating_ips: Array<{ id: number; ip: string; type: string; description: string; home_location: { name: string }; labels: Record<string, string> }> }> };
    networks: { list(): Promise<{ networks: Array<{ id: number; name: string; ip_range: string; subnets: Array<{ ip_range: string }>; labels: Record<string, string> }> }> };
    firewalls: { list(): Promise<{ firewalls: Array<{ id: number; name: string; rules: Array<{ direction: string; protocol: string; port: string }>; labels: Record<string, string> }> }> };
    sshKeys: { list(): Promise<{ ssh_keys: Array<{ id: number; name: string; fingerprint: string; public_key: string; labels: Record<string, string> }> }> };
    images: { list(): Promise<{ images: Array<{ id: number; name: string; type: string; os_flavor: string; labels: Record<string, string> }> }> };
    snapshots: { list(): Promise<{ snapshots: Array<{ id: number; description: string; image_size: number; created: string; labels: Record<string, string> }> }> };
    placementGroups: { list(): Promise<{ placement_groups: Array<{ id: number; name: string; type: string; labels: Record<string, string> }> }> };
  }
}

// Linode SDK
declare module '@linode/api-v4' {
  import { AxiosRequestConfig } from 'axios';

  interface LinodeInstance {
    id: number;
    label: string;
    status: string;
    type: string;
    region: string;
    ipv4: string[];
    specs: { vcpus: number; memory: number; disk: number };
    tags: string[];
  }

  interface LKECluster {
    id: number;
    label: string;
    region: string;
    k8s_version: string;
    status: string;
    tags: string[];
    control_plane: { high_availability: boolean };
  }

  export function setToken(token: string): void;
  export function getLinodes(params?: unknown, filters?: unknown): Promise<{ data: LinodeInstance[] }>;
  export function getClusters(): Promise<{ data: LKECluster[] }>;
  export function getVolumes(): Promise<{ data: Array<{ id: number; label: string; region: string; size: number; status: string; tags: string[] }> }>;
  export function getNodeBalancers(): Promise<{ data: Array<{ id: number; label: string; region: string; hostname: string; ipv4: string; tags: string[] }> }>;
  export function getDomains(): Promise<{ data: Array<{ id: number; domain: string; type: string; status: string; tags: string[] }> }>;
  export function getFirewalls(): Promise<{ data: Array<{ id: number; label: string; status: string; tags: string[] }> }>;
  export function getObjectStorageBuckets(): Promise<{ data: Array<{ cluster: string; label: string; created: string; size: number; objects: number }> }>;
  export function getStackScripts(): Promise<{ data: Array<{ id: number; label: string; description: string; is_public: boolean }> }>;
  export function getVPCs(): Promise<{ data: Array<{ id: number; label: string; region: string; subnets: Array<{ id: number; label: string; ipv4: string }> }> }>;
  export function getDatabases(): Promise<{ data: Array<{ id: number; label: string; type: string; engine: string; status: string; region: string }> }>;
  export function getImages(): Promise<{ data: Array<{ id: string; label: string; type: string; size: number; created: string }> }>;
  export function getSSHKeys(): Promise<{ data: Array<{ id: number; label: string; ssh_key: string; created: string }> }>;
}

// Oracle Cloud SDK
declare module 'oci-sdk' {
  interface AuthenticationProvider {
    getKeyId(): string;
    getPrivateKey(): string;
  }

  export class ConfigFileAuthenticationDetailsProvider implements AuthenticationProvider {
    constructor(configFilePath?: string, profile?: string);
    getKeyId(): string;
    getPrivateKey(): string;
  }

  export namespace core {
    interface ComputeClient {
      listInstances(request: { compartmentId: string }): Promise<{ items: Array<{
        id: string;
        displayName: string;
        availabilityDomain: string;
        shape: string;
        lifecycleState: string;
        freeformTags?: Record<string, string>;
      }> }>;
    }

    interface VirtualNetworkClient {
      listVcns(request: { compartmentId: string }): Promise<{ items: Array<{
        id: string;
        displayName: string;
        cidrBlock: string;
        lifecycleState: string;
        freeformTags?: Record<string, string>;
      }> }>;
    }

    interface BlockstorageClient {
      listVolumes(request: { compartmentId: string }): Promise<{ items: Array<{
        id: string;
        displayName: string;
        sizeInGBs: number;
        lifecycleState: string;
        freeformTags?: Record<string, string>;
      }> }>;
    }

    export { ComputeClient, VirtualNetworkClient, BlockstorageClient };
  }

  export namespace containerengine {
    interface ContainerEngineClient {
      listClusters(request: { compartmentId: string }): Promise<{ items: Array<{
        id: string;
        name: string;
        kubernetesVersion: string;
        lifecycleState: string;
        freeformTags?: Record<string, string>;
      }> }>;
    }

    export { ContainerEngineClient };
  }

  export namespace objectstorage {
    interface ObjectStorageClient {
      getNamespace(request: Record<string, unknown>): Promise<{ value: string }>;
      listBuckets(request: { compartmentId: string; namespaceName: string }): Promise<{ items: Array<{
        name: string;
        compartmentId: string;
        createdBy: string;
        freeformTags?: Record<string, string>;
      }> }>;
    }

    export { ObjectStorageClient };
  }

  export namespace database {
    interface DatabaseClient {
      listDbSystems(request: { compartmentId: string }): Promise<{ items: Array<{
        id: string;
        displayName: string;
        databaseEdition: string;
        lifecycleState: string;
        freeformTags?: Record<string, string>;
      }> }>;
    }

    export { DatabaseClient };
  }

  export namespace functions {
    interface FunctionsManagementClient {
      listApplications(request: { compartmentId: string }): Promise<{ items: Array<{
        id: string;
        displayName: string;
        lifecycleState: string;
        freeformTags?: Record<string, string>;
      }> }>;
    }

    export { FunctionsManagementClient };
  }

  export namespace loadbalancer {
    interface LoadBalancerClient {
      listLoadBalancers(request: { compartmentId: string }): Promise<{ items: Array<{
        id: string;
        displayName: string;
        lifecycleState: string;
        ipAddresses?: Array<{ ipAddress: string }>;
        freeformTags?: Record<string, string>;
      }> }>;
    }

    export { LoadBalancerClient };
  }
}

// Vultr SDK
declare module '@vultr/vultr-node' {
  interface VultrOptions {
    apiKey: string;
  }

  interface VultrInstance {
    id: string;
    label: string;
    region: string;
    plan: string;
    status: string;
    main_ip: string;
    vcpu_count: number;
    ram: number;
    disk: number;
    os: string;
    tags: string[];
  }

  interface VultrKubernetesCluster {
    id: string;
    label: string;
    region: string;
    version: string;
    status: string;
    node_pools: Array<{ id: string; label: string; plan: string; node_quantity: number }>;
  }

  export default class Vultr {
    constructor(options: VultrOptions);
    instances: { list(): Promise<{ instances: VultrInstance[] }> };
    kubernetes: { list(): Promise<{ vke_clusters: VultrKubernetesCluster[] }> };
    objectStorage: { list(): Promise<{ object_storages: Array<{ id: string; label: string; region: string; status: string }> }> };
    blockStorage: { list(): Promise<{ blocks: Array<{ id: string; label: string; size_gb: number; status: string; region: string }> }> };
    loadBalancers: { list(): Promise<{ load_balancers: Array<{ id: string; label: string; status: string; region: string; ipv4: string }> }> };
    databases: { list(): Promise<{ databases: Array<{ id: string; label: string; status: string; region: string; database_engine: string }> }> };
    privatenetworks: { list(): Promise<{ networks: Array<{ id: string; description: string; region: string; v4_subnet: string }> }> };
    firewalls: { list(): Promise<{ firewall_groups: Array<{ id: string; description: string; rule_count: number }> }> };
    snapshots: { list(): Promise<{ snapshots: Array<{ id: string; description: string; size: number; status: string }> }> };
    dns: { list(): Promise<{ domains: Array<{ domain: string }> }> };
    reservedIps: { list(): Promise<{ reserved_ips: Array<{ id: string; ip_type: string; subnet: string; region: string }> }> };
  }
}

// Linode SDK subpath imports
declare module '@linode/api-v4/lib/linodes' {
  export function getLinodes(params?: unknown, filters?: unknown): Promise<{ data: Array<{
    id: number;
    label: string;
    status: string;
    type: string;
    region: string;
    ipv4: string[];
    specs: { vcpus: number; memory: number; disk: number };
    tags: string[];
  }> }>;
}

declare module '@linode/api-v4/lib/kubernetes' {
  export function getClusters(): Promise<{ data: Array<{
    id: number;
    label: string;
    region: string;
    k8s_version: string;
    status: string;
    tags: string[];
    control_plane: { high_availability: boolean };
  }> }>;
}

declare module '@linode/api-v4/lib/volumes' {
  export function getVolumes(): Promise<{ data: Array<{
    id: number;
    label: string;
    region: string;
    size: number;
    status: string;
    tags: string[];
  }> }>;
}

declare module '@linode/api-v4/lib/nodebalancers' {
  export function getNodeBalancers(): Promise<{ data: Array<{
    id: number;
    label: string;
    region: string;
    hostname: string;
    ipv4: string;
    tags: string[];
  }> }>;
}

declare module '@linode/api-v4/lib/firewalls' {
  export function getFirewalls(): Promise<{ data: Array<{
    id: number;
    label: string;
    status: string;
    tags: string[];
  }> }>;
}

declare module '@linode/api-v4/lib/vlans' {
  export function getVlans(): Promise<{ data: Array<{
    label: string;
    region: string;
    linodes: number[];
  }> }>;
}

declare module '@linode/api-v4/lib/domains' {
  export function getDomains(): Promise<{ data: Array<{
    id: number;
    domain: string;
    type: string;
    status: string;
    tags: string[];
  }> }>;
  export function getDomainRecords(domainId: number): Promise<{ data: Array<{
    id: number;
    name: string;
    type: string;
    target: string;
    ttl_sec: number;
  }> }>;
}

declare module '@linode/api-v4/lib/images' {
  export function getImages(): Promise<{ data: Array<{
    id: string;
    label: string;
    type: string;
    size: number;
    created: string;
  }> }>;
}

declare module '@linode/api-v4/lib/object-storage' {
  export function getObjectStorageBuckets(): Promise<{ data: Array<{
    cluster: string;
    label: string;
    created: string;
    size: number;
    objects: number;
  }> }>;
}

declare module '@linode/api-v4/lib/databases' {
  export function getDatabases(): Promise<{ data: Array<{
    id: number;
    label: string;
    type: string;
    engine: string;
    status: string;
    region: string;
  }> }>;
}

declare module '@linode/api-v4/lib/stackscripts' {
  export function getStackScripts(): Promise<{ data: Array<{
    id: number;
    label: string;
    description: string;
    is_public: boolean;
  }> }>;
}

declare module '@linode/api-v4/lib/placement-groups' {
  export function getPlacementGroups(): Promise<{ data: Array<{
    id: number;
    label: string;
    region: string;
    placement_group_type: string;
    members: number[];
  }> }>;
}

// Oracle Cloud individual modules
declare module 'oci-common' {
  export interface ConfigFileAuthenticationDetailsProvider {
    getKeyId(): string;
    getPrivateKey(): string;
    getTenantId(): string;
    getRegion(): string;
  }

  export class ConfigFileAuthenticationDetailsProvider {
    constructor(configFilePath?: string, profile?: string);
  }

  export class SimpleAuthenticationDetailsProvider {
    constructor(
      tenantId: string,
      userId: string,
      fingerprint: string,
      privateKey: string,
      passPhrase?: string,
      region?: string
    );
  }
}

declare module 'oci-core' {
  import { ConfigFileAuthenticationDetailsProvider } from 'oci-common';

  export interface Instance {
    id?: string;
    displayName?: string;
    availabilityDomain?: string;
    compartmentId?: string;
    shape?: string;
    lifecycleState?: string;
    freeformTags?: Record<string, string>;
    definedTags?: Record<string, Record<string, string>>;
  }

  export interface Vcn {
    id?: string;
    displayName?: string;
    cidrBlock?: string;
    cidrBlocks?: string[];
    lifecycleState?: string;
    freeformTags?: Record<string, string>;
  }

  export interface Volume {
    id?: string;
    displayName?: string;
    sizeInGBs?: number;
    availabilityDomain?: string;
    lifecycleState?: string;
    freeformTags?: Record<string, string>;
  }

  export interface BlockVolume {
    id?: string;
    displayName?: string;
    sizeInGBs?: number;
    availabilityDomain?: string;
    lifecycleState?: string;
    freeformTags?: Record<string, string>;
  }

  export class ComputeClient {
    constructor(params: { authenticationDetailsProvider: ConfigFileAuthenticationDetailsProvider });
    listInstances(request: { compartmentId: string }): Promise<{ items: Instance[] }>;
  }

  export class VirtualNetworkClient {
    constructor(params: { authenticationDetailsProvider: ConfigFileAuthenticationDetailsProvider });
    listVcns(request: { compartmentId: string }): Promise<{ items: Vcn[] }>;
  }

  export class BlockstorageClient {
    constructor(params: { authenticationDetailsProvider: ConfigFileAuthenticationDetailsProvider });
    listVolumes(request: { compartmentId: string }): Promise<{ items: Volume[] }>;
    listBootVolumes(request: { compartmentId: string; availabilityDomain: string }): Promise<{ items: BlockVolume[] }>;
  }
}

declare module 'oci-containerengine' {
  import { ConfigFileAuthenticationDetailsProvider } from 'oci-common';

  export interface Cluster {
    id?: string;
    name?: string;
    compartmentId?: string;
    kubernetesVersion?: string;
    lifecycleState?: string;
    freeformTags?: Record<string, string>;
  }

  export class ContainerEngineClient {
    constructor(params: { authenticationDetailsProvider: ConfigFileAuthenticationDetailsProvider });
    listClusters(request: { compartmentId: string }): Promise<{ items: Cluster[] }>;
  }
}

declare module 'oci-database' {
  import { ConfigFileAuthenticationDetailsProvider } from 'oci-common';

  export interface DbSystem {
    id?: string;
    displayName?: string;
    databaseEdition?: string;
    compartmentId?: string;
    lifecycleState?: string;
    freeformTags?: Record<string, string>;
  }

  export interface AutonomousDatabase {
    id?: string;
    displayName?: string;
    dbName?: string;
    compartmentId?: string;
    lifecycleState?: string;
    freeformTags?: Record<string, string>;
  }

  export class DatabaseClient {
    constructor(params: { authenticationDetailsProvider: ConfigFileAuthenticationDetailsProvider });
    listDbSystems(request: { compartmentId: string }): Promise<{ items: DbSystem[] }>;
    listAutonomousDatabases(request: { compartmentId: string }): Promise<{ items: AutonomousDatabase[] }>;
  }
}

declare module 'oci-objectstorage' {
  import { ConfigFileAuthenticationDetailsProvider } from 'oci-common';

  export interface Bucket {
    name?: string;
    compartmentId?: string;
    namespace?: string;
    createdBy?: string;
    timeCreated?: Date;
    freeformTags?: Record<string, string>;
  }

  export class ObjectStorageClient {
    constructor(params: { authenticationDetailsProvider: ConfigFileAuthenticationDetailsProvider });
    getNamespace(request: Record<string, unknown>): Promise<{ value: string }>;
    listBuckets(request: { compartmentId: string; namespaceName: string }): Promise<{ items: Bucket[] }>;
  }
}

declare module 'oci-filestorage' {
  import { ConfigFileAuthenticationDetailsProvider } from 'oci-common';

  export interface FileSystem {
    id?: string;
    displayName?: string;
    compartmentId?: string;
    availabilityDomain?: string;
    lifecycleState?: string;
    freeformTags?: Record<string, string>;
  }

  export class FileStorageClient {
    constructor(params: { authenticationDetailsProvider: ConfigFileAuthenticationDetailsProvider });
    listFileSystems(request: { compartmentId: string; availabilityDomain: string }): Promise<{ items: FileSystem[] }>;
  }
}

declare module 'oci-loadbalancer' {
  import { ConfigFileAuthenticationDetailsProvider } from 'oci-common';

  export interface LoadBalancer {
    id?: string;
    displayName?: string;
    compartmentId?: string;
    lifecycleState?: string;
    ipAddresses?: Array<{ ipAddress?: string }>;
    freeformTags?: Record<string, string>;
  }

  export class LoadBalancerClient {
    constructor(params: { authenticationDetailsProvider: ConfigFileAuthenticationDetailsProvider });
    listLoadBalancers(request: { compartmentId: string }): Promise<{ items: LoadBalancer[] }>;
  }
}

declare module 'oci-identity' {
  import { ConfigFileAuthenticationDetailsProvider } from 'oci-common';

  export interface Compartment {
    id?: string;
    name?: string;
    description?: string;
    compartmentId?: string;
    lifecycleState?: string;
    freeformTags?: Record<string, string>;
  }

  export interface User {
    id?: string;
    name?: string;
    description?: string;
    email?: string;
    lifecycleState?: string;
    freeformTags?: Record<string, string>;
  }

  export interface AvailabilityDomain {
    id?: string;
    name?: string;
    compartmentId?: string;
  }

  export class IdentityClient {
    constructor(params: { authenticationDetailsProvider: ConfigFileAuthenticationDetailsProvider });
    listCompartments(request: { compartmentId: string }): Promise<{ items: Compartment[] }>;
    listUsers(request: { compartmentId: string }): Promise<{ items: User[] }>;
    listAvailabilityDomains(request: { compartmentId: string }): Promise<{ items: AvailabilityDomain[] }>;
  }
}

declare module 'oci-dns' {
  import { ConfigFileAuthenticationDetailsProvider } from 'oci-common';

  export interface Zone {
    id?: string;
    name?: string;
    compartmentId?: string;
    zoneType?: string;
    lifecycleState?: string;
    freeformTags?: Record<string, string>;
  }

  export class DnsClient {
    constructor(params: { authenticationDetailsProvider: ConfigFileAuthenticationDetailsProvider });
    listZones(request: { compartmentId: string }): Promise<{ items: Zone[] }>;
  }
}

// SMTP Server
declare module 'smtp-server' {
  import { EventEmitter } from 'events';
  import type { TLSSocket } from 'tls';
  import type { Socket } from 'net';

  export interface SMTPServerOptions {
    secure?: boolean;
    name?: string;
    banner?: string;
    size?: number;
    hideSize?: boolean;
    authMethods?: string[];
    authOptional?: boolean;
    disabledCommands?: string[];
    hideSTARTTLS?: boolean;
    hidePIPELINING?: boolean;
    hide8BITMIME?: boolean;
    hideSMTPUTF8?: boolean;
    allowInsecureAuth?: boolean;
    disableReverseLookup?: boolean;
    sniOptions?: Record<string, unknown>;
    logger?: boolean | object;
    maxClients?: number;
    useProxy?: boolean;
    useXClient?: boolean;
    useXForward?: boolean;
    lmtp?: boolean;
    socketTimeout?: number;
    closeTimeout?: number;
    onAuth?: (auth: SMTPServerAuthentication, session: SMTPServerSession, callback: (err: Error | null, response?: SMTPServerAuthenticationResponse) => void) => void;
    onConnect?: (session: SMTPServerSession, callback: (err?: Error | null) => void) => void;
    onMailFrom?: (address: SMTPServerAddress, session: SMTPServerSession, callback: (err?: Error | null) => void) => void;
    onRcptTo?: (address: SMTPServerAddress, session: SMTPServerSession, callback: (err?: Error | null) => void) => void;
    onData?: (stream: NodeJS.ReadableStream, session: SMTPServerSession, callback: (err?: Error | null) => void) => void;
    onClose?: (session: SMTPServerSession) => void;
    key?: string | Buffer;
    cert?: string | Buffer;
    ca?: string | Buffer | Array<string | Buffer>;
  }

  export interface SMTPServerAuthentication {
    method: string;
    username?: string;
    password?: string;
    accessToken?: string;
    validatePassword?: (password: string) => boolean;
  }

  export interface SMTPServerAuthenticationResponse {
    user?: string | object;
    data?: object;
  }

  export interface SMTPServerSession {
    id: string;
    remoteAddress: string;
    clientHostname: string;
    openingCommand: string;
    hostNameAppearsAs: string;
    envelope: SMTPServerEnvelope;
    transmissionType: string;
    tlsOptions?: object;
    user?: string | object;
  }

  export interface SMTPServerEnvelope {
    mailFrom: SMTPServerAddress | false;
    rcptTo: SMTPServerAddress[];
  }

  export interface SMTPServerAddress {
    address: string;
    args: object;
  }

  export class SMTPServer extends EventEmitter {
    constructor(options?: SMTPServerOptions);
    listen(port: number, host?: string, callback?: () => void): void;
    listen(port: number, callback?: () => void): void;
    close(callback?: () => void): void;
    updateSecureContext(options: { key?: string | Buffer; cert?: string | Buffer }): void;
    options: SMTPServerOptions;
  }
}

// Puppeteer Core
declare module 'puppeteer-core' {
  export interface Browser {
    newPage(): Promise<Page>;
    pages(): Promise<Page[]>;
    close(): Promise<void>;
    isConnected(): boolean;
    version(): Promise<string>;
    userAgent(): Promise<string>;
    wsEndpoint(): string;
    disconnect(): void;
    on(event: string, handler: (...args: unknown[]) => void): void;
    off(event: string, handler: (...args: unknown[]) => void): void;
  }

  export interface Page {
    goto(url: string, options?: WaitForOptions): Promise<HTTPResponse | null>;
    content(): Promise<string>;
    evaluate<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<T>;
    waitForSelector(selector: string, options?: WaitForSelectorOptions): Promise<ElementHandle | null>;
    waitForNavigation(options?: WaitForOptions): Promise<HTTPResponse | null>;
    waitForNetworkIdle(options?: { idleTime?: number; timeout?: number }): Promise<void>;
    setViewport(viewport: Viewport): Promise<void>;
    setUserAgent(userAgent: string): Promise<void>;
    setCookie(...cookies: CookieParam[]): Promise<void>;
    cookies(...urls: string[]): Promise<Cookie[]>;
    deleteCookie(...cookies: CookieParam[]): Promise<void>;
    setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>;
    setGeolocation(options: { latitude: number; longitude: number; accuracy?: number }): Promise<void>;
    emulateTimezone(timezoneId: string): Promise<void>;
    screenshot(options?: ScreenshotOptions): Promise<Buffer | string>;
    pdf(options?: PDFOptions): Promise<Buffer>;
    close(): Promise<void>;
    url(): string;
    title(): Promise<string>;
    $<T extends Element = Element>(selector: string): Promise<ElementHandle<T> | null>;
    $$<T extends Element = Element>(selector: string): Promise<ElementHandle<T>[]>;
    $eval<T>(selector: string, fn: (el: Element) => T): Promise<T>;
    $$eval<T>(selector: string, fn: (els: Element[]) => T): Promise<T>;
    on(event: string, handler: (...args: unknown[]) => void): void;
    off(event: string, handler: (...args: unknown[]) => void): void;
    isClosed(): boolean;
    setRequestInterception(enabled: boolean): Promise<void>;
  }

  export interface ElementHandle<T extends Element = Element> {
    click(options?: ClickOptions): Promise<void>;
    type(text: string, options?: { delay?: number }): Promise<void>;
    press(key: string, options?: { delay?: number }): Promise<void>;
    boundingBox(): Promise<BoundingBox | null>;
    screenshot(options?: ScreenshotOptions): Promise<Buffer | string>;
    evaluate<R>(fn: (el: T) => R): Promise<R>;
    getProperty(propertyName: string): Promise<JSHandle>;
    $<U extends Element = Element>(selector: string): Promise<ElementHandle<U> | null>;
    $$<U extends Element = Element>(selector: string): Promise<ElementHandle<U>[]>;
  }

  export interface JSHandle<T = unknown> {
    evaluate<R>(fn: (arg: T) => R): Promise<R>;
    jsonValue(): Promise<T>;
  }

  export interface HTTPResponse {
    status(): number;
    statusText(): string;
    url(): string;
    headers(): Record<string, string>;
    ok(): boolean;
    buffer(): Promise<Buffer>;
    text(): Promise<string>;
    json(): Promise<unknown>;
  }

  export interface HTTPRequest {
    url(): string;
    method(): string;
    headers(): Record<string, string>;
    postData(): string | undefined;
    resourceType(): string;
    continue(overrides?: { url?: string; method?: string; headers?: Record<string, string>; postData?: string }): Promise<void>;
    abort(errorCode?: string): Promise<void>;
    respond(response: { status?: number; headers?: Record<string, string>; body?: string | Buffer }): Promise<void>;
    isInterceptResolutionHandled(): boolean;
  }

  export interface WaitForOptions {
    timeout?: number;
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2' | Array<'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'>;
  }

  export interface WaitForSelectorOptions {
    visible?: boolean;
    hidden?: boolean;
    timeout?: number;
  }

  export interface Viewport {
    width: number;
    height: number;
    deviceScaleFactor?: number;
    isMobile?: boolean;
    hasTouch?: boolean;
    isLandscape?: boolean;
  }

  export interface CookieParam {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }

  export interface Cookie extends CookieParam {
    size: number;
    session: boolean;
  }

  export interface ScreenshotOptions {
    path?: string;
    type?: 'png' | 'jpeg' | 'webp';
    quality?: number;
    fullPage?: boolean;
    clip?: { x: number; y: number; width: number; height: number };
    encoding?: 'base64' | 'binary';
    captureBeyondViewport?: boolean;
  }

  export interface PDFOptions {
    path?: string;
    scale?: number;
    displayHeaderFooter?: boolean;
    headerTemplate?: string;
    footerTemplate?: string;
    printBackground?: boolean;
    landscape?: boolean;
    pageRanges?: string;
    format?: string;
    width?: string | number;
    height?: string | number;
    margin?: { top?: string | number; right?: string | number; bottom?: string | number; left?: string | number };
    preferCSSPageSize?: boolean;
  }

  export interface ClickOptions {
    button?: 'left' | 'right' | 'middle';
    clickCount?: number;
    delay?: number;
  }

  export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export interface LaunchOptions {
    executablePath?: string;
    headless?: boolean | 'new';
    args?: string[];
    ignoreDefaultArgs?: boolean | string[];
    timeout?: number;
    dumpio?: boolean;
    env?: Record<string, string | undefined>;
    pipe?: boolean;
    product?: 'chrome' | 'firefox';
    userDataDir?: string;
    defaultViewport?: Viewport | null;
    slowMo?: number;
    devtools?: boolean;
  }

  export interface ConnectOptions {
    browserURL?: string;
    browserWSEndpoint?: string;
    ignoreHTTPSErrors?: boolean;
    defaultViewport?: Viewport | null;
    slowMo?: number;
  }

  export function launch(options?: LaunchOptions): Promise<Browser>;
  export function connect(options: ConnectOptions): Promise<Browser>;
  export function executablePath(channel?: string): string;
  export const defaultArgs: (options?: { args?: string[]; userDataDir?: string; devtools?: boolean; headless?: boolean | 'new' }) => string[];
}
