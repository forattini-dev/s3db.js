import { requirePluginDependency } from '../concerns/plugin-dependencies.js';
import {
  ALL_STANDARD_RESOURCE_TYPES,
  formatResourceTypeId,
  CORE_RESOURCE_TYPES,
  APPS_RESOURCE_TYPES,
  BATCH_RESOURCE_TYPES,
  NETWORKING_RESOURCE_TYPES,
  STORAGE_RESOURCE_TYPES,
  RBAC_RESOURCE_TYPES,
  POLICY_RESOURCE_TYPES,
  AUTOSCALING_RESOURCE_TYPES,
  SCHEDULING_RESOURCE_TYPES,
  NODE_RESOURCE_TYPES,
  CERTIFICATES_RESOURCE_TYPES,
  COORDINATION_RESOURCE_TYPES,
  DISCOVERY_RESOURCE_TYPES,
  EVENTS_RESOURCE_TYPES,
  ADMISSION_RESOURCE_TYPES,
  API_REGISTRATION_RESOURCE_TYPES,
  FLOWCONTROL_RESOURCE_TYPES,
  K8sResourceType,
} from './resource-types.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'trace';
type LoggerFunction = (level: LogLevel, message: string, meta?: Record<string, unknown>) => void;

interface KubeConfig {
  loadFromCluster(): void;
  loadFromString(content: string): void;
  loadFromFile(path: string): void;
  loadFromDefault(): void;
  loadFromOptions(options: unknown): void;
  setCurrentContext(context: string): void;
  makeApiClient<T>(apiClass: new () => T): T;
}

interface K8sApiClient {
  listNamespace(): Promise<{ body: { items: K8sResource[] } }>;
  [key: string]: unknown;
}

interface K8sResource {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    uid?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    creationTimestamp?: string;
    resourceVersion?: string;
    managedFields?: unknown[];
  };
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
  data?: Record<string, string>;
  [key: string]: unknown;
}

interface K8sModule {
  KubeConfig: new () => KubeConfig;
  CoreV1Api: new () => K8sApiClient;
  AppsV1Api: new () => K8sApiClient;
  BatchV1Api: new () => K8sApiClient;
  NetworkingV1Api: new () => K8sApiClient;
  StorageV1Api: new () => K8sApiClient;
  RbacAuthorizationV1Api: new () => K8sApiClient;
  PolicyV1Api: new () => K8sApiClient;
  AutoscalingV1Api: new () => K8sApiClient;
  AutoscalingV2Api: new () => K8sApiClient;
  SchedulingV1Api: new () => K8sApiClient;
  NodeV1Api: new () => K8sApiClient;
  CertificatesV1Api: new () => K8sApiClient;
  CoordinationV1Api: new () => K8sApiClient;
  DiscoveryV1Api: new () => K8sApiClient;
  EventsV1Api: new () => K8sApiClient;
  AdmissionregistrationV1Api: new () => K8sApiClient;
  ApiregistrationV1Api: new () => K8sApiClient;
  ApiextensionsV1Api: new () => K8sApiClient;
  CustomObjectsApi: new () => K8sApiClient;
}

interface ApiClients {
  core: K8sApiClient;
  apps: K8sApiClient;
  batch: K8sApiClient;
  networking: K8sApiClient;
  storage: K8sApiClient;
  rbac: K8sApiClient;
  policy: K8sApiClient;
  autoscalingV1: K8sApiClient;
  autoscalingV2: K8sApiClient;
  scheduling: K8sApiClient;
  node: K8sApiClient;
  certificates: K8sApiClient;
  coordination: K8sApiClient;
  discovery: K8sApiClient;
  events: K8sApiClient;
  admission: K8sApiClient;
  apiRegistration: K8sApiClient;
  apiExtensions: K8sApiClient;
  customObjects: K8sApiClient;
}

export interface KubernetesDriverDiscoveryOptions {
  includeSecrets?: boolean;
  includeConfigMaps?: boolean;
  includeCRDs?: boolean;
  coreResources?: boolean;
  appsResources?: boolean;
  batchResources?: boolean;
  networkingResources?: boolean;
  storageResources?: boolean;
  rbacResources?: boolean;
  namespaces?: string[] | null;
  excludeNamespaces?: string[];
  concurrency?: number;
  crdCacheTTL?: number;
  pagination?: {
    enabled: boolean;
    pageSize: number;
  };
}

export interface KubernetesDriverRetryOptions {
  maxRetries?: number;
  backoffBase?: number;
  retryOn429?: boolean;
  retryOn5xx?: boolean;
}

export interface KubernetesDriverSanitizationOptions {
  removeSecrets?: boolean;
  removeManagedFields?: boolean;
  removeResourceVersion?: boolean;
  removeRaw?: boolean;
  customSanitizer?: (config: Record<string, unknown>) => Record<string, unknown>;
}

export interface KubernetesDriverConnectionOptions {
  server: string;
  caData?: string;
  skipTLSVerify?: boolean;
  token?: string;
  certData?: string;
  keyData?: string;
}

export interface KubernetesDriverOptions {
  id: string;
  name?: string;
  inCluster?: boolean;
  connection?: KubernetesDriverConnectionOptions;
  kubeconfigContent?: string;
  kubeconfig?: string;
  context?: string;
  discovery?: KubernetesDriverDiscoveryOptions;
  retries?: KubernetesDriverRetryOptions;
  sanitization?: KubernetesDriverSanitizationOptions;
  logger?: LoggerFunction;
  logLevel?: LogLevel;
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface KubernetesResource {
  provider: string;
  clusterId: string;
  clusterName: string;
  namespace: string | null;
  resourceType: string;
  resourceId: string;
  uid: string | undefined;
  apiVersion: string | undefined;
  kind: string | undefined;
  name: string | undefined;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  creationTimestamp: string | undefined;
  resourceVersion?: string;
  configuration: Record<string, unknown>;
  tags: Record<string, string>;
  metadata: Record<string, unknown>;
  raw?: K8sResource;
}

interface ListResourcesOptions {
  force?: boolean;
  runtime?: {
    emitProgress?: (info: Record<string, unknown>) => void;
  };
}

interface K8sError extends Error {
  response?: { statusCode?: number };
  statusCode?: number;
  code?: string;
}

export class KubernetesDriver {
  options: KubernetesDriverOptions;
  clusterId: string;
  clusterName: string;
  kubeConfig: KubeConfig | null;
  apiClients: Partial<ApiClients>;
  k8s: K8sModule | null;

  crdCache: K8sResourceType[] | null;
  crdCacheTime: number;
  crdCacheTTL: number;

  discovery: Required<KubernetesDriverDiscoveryOptions>;
  concurrency: number;
  pagination: { enabled: boolean; pageSize: number };
  retries: Required<KubernetesDriverRetryOptions>;
  sanitization: Required<KubernetesDriverSanitizationOptions>;
  logger: LoggerFunction;
  logLevel: LogLevel;
  tags: Record<string, string>;
  metadata: Record<string, unknown>;

  constructor(options: KubernetesDriverOptions) {
    this.options = options;
    this.clusterId = options.id;
    this.clusterName = options.name || options.id;

    this.kubeConfig = null;
    this.apiClients = {};
    this.k8s = null;

    this.crdCache = null;
    this.crdCacheTime = 0;
    this.crdCacheTTL = options.discovery?.crdCacheTTL || 300000;

    this.discovery = {
      includeSecrets: options.discovery?.includeSecrets ?? false,
      includeConfigMaps: options.discovery?.includeConfigMaps ?? true,
      includeCRDs: options.discovery?.includeCRDs ?? true,
      coreResources: options.discovery?.coreResources ?? true,
      appsResources: options.discovery?.appsResources ?? true,
      batchResources: options.discovery?.batchResources ?? true,
      networkingResources: options.discovery?.networkingResources ?? true,
      storageResources: options.discovery?.storageResources ?? true,
      rbacResources: options.discovery?.rbacResources ?? true,
      namespaces: options.discovery?.namespaces || null,
      excludeNamespaces: options.discovery?.excludeNamespaces || [],
      concurrency: options.discovery?.concurrency || 5,
      crdCacheTTL: options.discovery?.crdCacheTTL || 300000,
      pagination: options.discovery?.pagination || { enabled: true, pageSize: 100 },
    };

    this.concurrency = options.discovery?.concurrency || 5;
    this.pagination = options.discovery?.pagination || { enabled: true, pageSize: 100 };

    this.retries = {
      maxRetries: options.retries?.maxRetries ?? 5,
      backoffBase: options.retries?.backoffBase ?? 1000,
      retryOn429: options.retries?.retryOn429 ?? true,
      retryOn5xx: options.retries?.retryOn5xx ?? true,
    };

    this.sanitization = {
      removeSecrets: options.sanitization?.removeSecrets ?? true,
      removeManagedFields: options.sanitization?.removeManagedFields ?? true,
      removeResourceVersion: options.sanitization?.removeResourceVersion ?? false,
      removeRaw: options.sanitization?.removeRaw ?? false,
      customSanitizer: options.sanitization?.customSanitizer ?? undefined,
    } as Required<KubernetesDriverSanitizationOptions>;

    this.logger = options.logger || (() => {});
    this.logLevel = options.logLevel || 'info';
    this.tags = options.tags || {};
    this.metadata = options.metadata || {};
  }

  async initialize(): Promise<void> {
    const k8s = requirePluginDependency('@kubernetes/client-node', 'KubernetesInventoryPlugin') as unknown as K8sModule;

    this.k8s = k8s;
    this.kubeConfig = new k8s.KubeConfig();

    await this._loadKubeConfig();
    this._createApiClients();
    await this._testConnection();

    this.log('info', `Kubernetes driver initialized for cluster: ${this.clusterName}`);
  }

  async _loadKubeConfig(): Promise<void> {
    if (this.options.inCluster) {
      this.log('info', 'Loading in-cluster configuration');
      this.kubeConfig!.loadFromCluster();
      return;
    }

    if (this.options.connection) {
      this.log('info', 'Loading kubeconfig from connection object');
      this._loadFromConnectionObject();
      return;
    }

    const kubeconfigContent = this._resolveKubeconfigContent();
    if (kubeconfigContent) {
      this.log('info', 'Loading kubeconfig from content string');
      this.kubeConfig!.loadFromString(kubeconfigContent);

      if (this.options.context) {
        this.log('info', `Switching to context: ${this.options.context}`);
        this.kubeConfig!.setCurrentContext(this.options.context);
      }
      return;
    }

    const kubeconfigPath = this._resolveKubeconfigPath();
    if (kubeconfigPath) {
      this.log('info', `Loading kubeconfig from file: ${kubeconfigPath}`);
      this.kubeConfig!.loadFromFile(kubeconfigPath);

      if (this.options.context) {
        this.log('info', `Switching to context: ${this.options.context}`);
        this.kubeConfig!.setCurrentContext(this.options.context);
      }
      return;
    }

    if (this.options.context) {
      this.log('info', `Loading default kubeconfig with context: ${this.options.context}`);
      this.kubeConfig!.loadFromDefault();
      this.kubeConfig!.setCurrentContext(this.options.context);
      return;
    }

    this.log('info', 'Loading default kubeconfig');
    this.kubeConfig!.loadFromDefault();
  }

  _resolveKubeconfigContent(): string | null {
    if (this.options.kubeconfigContent) {
      return this.options.kubeconfigContent;
    }

    const envContent = process.env.KUBECONFIG_CONTENT;
    if (envContent) {
      this.log('debug', 'Found KUBECONFIG_CONTENT environment variable');

      try {
        const decoded = Buffer.from(envContent, 'base64').toString('utf-8');
        if (decoded.includes('apiVersion') || decoded.includes('clusters')) {
          this.log('debug', 'KUBECONFIG_CONTENT is base64-encoded');
          return decoded;
        }
      } catch {
        // Not base64, use as-is
      }

      return envContent;
    }

    const clusterEnvKey = `KUBECONFIG_CONTENT_${this.clusterId.toUpperCase().replace(/-/g, '_')}`;
    const clusterEnvContent = process.env[clusterEnvKey];
    if (clusterEnvContent) {
      this.log('debug', `Found ${clusterEnvKey} environment variable`);

      try {
        const decoded = Buffer.from(clusterEnvContent, 'base64').toString('utf-8');
        if (decoded.includes('apiVersion') || decoded.includes('clusters')) {
          return decoded;
        }
      } catch {
        // Not base64
      }

      return clusterEnvContent;
    }

    return null;
  }

  _resolveKubeconfigPath(): string | null {
    if (this.options.kubeconfig) {
      return this._expandPath(this.options.kubeconfig);
    }

    const clusterEnvKey = `KUBECONFIG_${this.clusterId.toUpperCase().replace(/-/g, '_')}`;
    const clusterEnvPath = process.env[clusterEnvKey];
    if (clusterEnvPath) {
      this.log('debug', `Found ${clusterEnvKey} environment variable`);
      return this._expandPath(clusterEnvPath);
    }

    return null;
  }

  _expandPath(path: string): string {
    if (!path) return path;

    let expandedPath = path.replace(/^~/, process.env.HOME || '');

    expandedPath = expandedPath.replace(/\$\{([^}]+)\}/g, (_, varName: string) => {
      return process.env[varName] || '';
    });
    expandedPath = expandedPath.replace(/\$([A-Z_][A-Z0-9_]*)/gi, (_, varName: string) => {
      return process.env[varName] || '';
    });

    return expandedPath;
  }

  _loadFromConnectionObject(): void {
    const conn = this.options.connection!;

    this.kubeConfig!.loadFromOptions({
      clusters: [{
        name: this.clusterId,
        server: conn.server,
        caData: conn.caData,
        skipTLSVerify: conn.skipTLSVerify,
      }],
      users: [{
        name: this.clusterId,
        token: conn.token,
        certData: conn.certData,
        keyData: conn.keyData,
      }],
      contexts: [{
        name: this.clusterId,
        cluster: this.clusterId,
        user: this.clusterId,
      }],
      currentContext: this.clusterId,
    });
  }

  _createApiClients(): void {
    const { k8s, kubeConfig } = this;

    this.apiClients = {
      core: kubeConfig!.makeApiClient(k8s!.CoreV1Api),
      apps: kubeConfig!.makeApiClient(k8s!.AppsV1Api),
      batch: kubeConfig!.makeApiClient(k8s!.BatchV1Api),
      networking: kubeConfig!.makeApiClient(k8s!.NetworkingV1Api),
      storage: kubeConfig!.makeApiClient(k8s!.StorageV1Api),
      rbac: kubeConfig!.makeApiClient(k8s!.RbacAuthorizationV1Api),
      policy: kubeConfig!.makeApiClient(k8s!.PolicyV1Api),
      autoscalingV1: kubeConfig!.makeApiClient(k8s!.AutoscalingV1Api),
      autoscalingV2: kubeConfig!.makeApiClient(k8s!.AutoscalingV2Api),
      scheduling: kubeConfig!.makeApiClient(k8s!.SchedulingV1Api),
      node: kubeConfig!.makeApiClient(k8s!.NodeV1Api),
      certificates: kubeConfig!.makeApiClient(k8s!.CertificatesV1Api),
      coordination: kubeConfig!.makeApiClient(k8s!.CoordinationV1Api),
      discovery: kubeConfig!.makeApiClient(k8s!.DiscoveryV1Api),
      events: kubeConfig!.makeApiClient(k8s!.EventsV1Api),
      admission: kubeConfig!.makeApiClient(k8s!.AdmissionregistrationV1Api),
      apiRegistration: kubeConfig!.makeApiClient(k8s!.ApiregistrationV1Api),
      apiExtensions: kubeConfig!.makeApiClient(k8s!.ApiextensionsV1Api),
      customObjects: kubeConfig!.makeApiClient(k8s!.CustomObjectsApi),
    };
  }

  async _testConnection(): Promise<void> {
    try {
      const response = await this._retryOperation(async () => {
        return await this.apiClients.core!.listNamespace();
      });

      const namespaceCount = response.body.items.length;
      this.log('info', `Successfully connected to cluster. Found ${namespaceCount} namespaces.`);
    } catch (error) {
      throw new Error(`Failed to connect to Kubernetes cluster: ${(error as Error).message}`);
    }
  }

  async discoverResourceTypes(options: { force?: boolean } = {}): Promise<K8sResourceType[]> {
    const resourceTypes: K8sResourceType[] = [];

    if (this.discovery.coreResources) {
      resourceTypes.push(...this._filterSecrets(CORE_RESOURCE_TYPES));
    }
    if (this.discovery.appsResources) {
      resourceTypes.push(...APPS_RESOURCE_TYPES);
    }
    if (this.discovery.batchResources) {
      resourceTypes.push(...BATCH_RESOURCE_TYPES);
    }
    if (this.discovery.networkingResources) {
      resourceTypes.push(...NETWORKING_RESOURCE_TYPES);
    }
    if (this.discovery.storageResources) {
      resourceTypes.push(...STORAGE_RESOURCE_TYPES);
    }
    if (this.discovery.rbacResources) {
      resourceTypes.push(...RBAC_RESOURCE_TYPES);
    }

    resourceTypes.push(
      ...POLICY_RESOURCE_TYPES,
      ...AUTOSCALING_RESOURCE_TYPES,
      ...SCHEDULING_RESOURCE_TYPES,
      ...NODE_RESOURCE_TYPES,
      ...CERTIFICATES_RESOURCE_TYPES,
      ...COORDINATION_RESOURCE_TYPES,
      ...DISCOVERY_RESOURCE_TYPES,
      ...EVENTS_RESOURCE_TYPES,
      ...ADMISSION_RESOURCE_TYPES,
      ...API_REGISTRATION_RESOURCE_TYPES,
      ...FLOWCONTROL_RESOURCE_TYPES
    );

    if (this.discovery.includeCRDs) {
      const crds = await this._discoverCRDs(options.force);
      resourceTypes.push(...crds);
    }

    return resourceTypes;
  }

  _filterSecrets(resourceTypes: K8sResourceType[]): K8sResourceType[] {
    if (this.discovery.includeSecrets) {
      return resourceTypes;
    }
    return resourceTypes.filter(rt => rt.kind !== 'Secret');
  }

  async _discoverCRDs(force = false): Promise<K8sResourceType[]> {
    const now = Date.now();

    if (!force && this.crdCache && (now - this.crdCacheTime < this.crdCacheTTL)) {
      this.log('debug', `Using cached CRDs (${this.crdCache.length} types)`);
      return this.crdCache;
    }

    this.log('info', 'Discovering Custom Resource Definitions...');

    try {
      const response = await this._retryOperation(async () => {
        return await (this.apiClients.apiExtensions as unknown as {
          listCustomResourceDefinition(): Promise<{
            body: {
              items: Array<{
                metadata: { name: string };
                spec: {
                  group: string;
                  scope: string;
                  names: { kind: string; plural: string };
                  versions: Array<{ name: string; storage?: boolean }>;
                };
              }>;
            };
          }>;
        }).listCustomResourceDefinition();
      });

      const crds: K8sResourceType[] = response.body.items.map(crd => {
        const storageVersion = crd.spec.versions.find(v => v.storage);
        const version = storageVersion || crd.spec.versions[0]!;

        return {
          group: crd.spec.group,
          version: version.name,
          kind: crd.spec.names.kind,
          plural: crd.spec.names.plural,
          namespaced: crd.spec.scope === 'Namespaced',
          isCRD: true,
          category: 'custom',
          crdName: crd.metadata.name,
        };
      });

      this.crdCache = crds;
      this.crdCacheTime = now;

      this.log('info', `Discovered ${crds.length} Custom Resource Definitions`);

      return crds;
    } catch (error) {
      this.log('warn', `Failed to discover CRDs: ${(error as Error).message}`);
      return [];
    }
  }

  async *listResources(options: ListResourcesOptions = {}): AsyncGenerator<KubernetesResource> {
    const { runtime } = options;

    const resourceTypes = await this.discoverResourceTypes(options);
    this.log('info', `Discovering ${resourceTypes.length} resource types from cluster ${this.clusterName}`);

    runtime?.emitProgress?.({
      stage: 'discovery',
      clusterId: this.clusterId,
      totalTypes: resourceTypes.length,
      processedTypes: 0,
    });

    let processedTypes = 0;

    for (const resourceType of resourceTypes) {
      const resourceTypeId = formatResourceTypeId(resourceType);

      try {
        this.log('debug', `Fetching resources of type: ${resourceTypeId}`);

        const resources = await this._fetchResourceType(resourceType);

        for (const resource of resources) {
          yield this._normalizeResource(resourceType, resource);
        }

        processedTypes++;

        runtime?.emitProgress?.({
          stage: 'discovery',
          clusterId: this.clusterId,
          totalTypes: resourceTypes.length,
          processedTypes,
          currentType: resourceTypeId,
        });

        this.log('debug', `Fetched ${resources.length} resources of type: ${resourceTypeId}`);
      } catch (error) {
        this.log('warn', `Failed to fetch resource type ${resourceTypeId}: ${(error as Error).message}`);

        runtime?.emitProgress?.({
          stage: 'error',
          clusterId: this.clusterId,
          resourceType: resourceTypeId,
          error: (error as Error).message,
        });
      }
    }

    this.log('info', `Completed discovery for cluster ${this.clusterName}`);
  }

  async _fetchResourceType(resourceType: K8sResourceType): Promise<K8sResource[]> {
    const resources: K8sResource[] = [];

    if (resourceType.namespaced) {
      const namespaces = await this._getNamespaces();

      for (const namespace of namespaces) {
        const namespaceResources = await this._fetchNamespacedResources(resourceType, namespace);
        resources.push(...namespaceResources);
      }
    } else {
      const clusterResources = await this._fetchClusterResources(resourceType);
      resources.push(...clusterResources);
    }

    return resources;
  }

  async _getNamespaces(): Promise<string[]> {
    if (this.discovery.namespaces && this.discovery.namespaces.length > 0) {
      return this.discovery.namespaces.filter(
        ns => !this.discovery.excludeNamespaces.includes(ns)
      );
    }

    try {
      const response = await this._retryOperation(async () => {
        return await this.apiClients.core!.listNamespace();
      });

      return response.body.items
        .map(ns => ns.metadata?.name || '')
        .filter(ns => ns && !this.discovery.excludeNamespaces.includes(ns));
    } catch (error) {
      this.log('warn', `Failed to list namespaces: ${(error as Error).message}`);
      return ['default'];
    }
  }

  async _fetchNamespacedResources(resourceType: K8sResourceType, namespace: string): Promise<K8sResource[]> {
    try {
      if (resourceType.isCRD) {
        return await this._fetchCustomResources(resourceType, namespace);
      } else {
        return await this._fetchStandardNamespacedResources(resourceType, namespace);
      }
    } catch (error) {
      const k8sError = error as K8sError;
      if (k8sError.response?.statusCode === 404 || k8sError.statusCode === 404) {
        this.log('debug', `Resource type ${formatResourceTypeId(resourceType)} not found in cluster`);
        return [];
      }

      if (k8sError.response?.statusCode === 403 || k8sError.statusCode === 403) {
        this.log('warn', `Permission denied for resource type ${formatResourceTypeId(resourceType)} in namespace ${namespace}`);
        return [];
      }

      throw error;
    }
  }

  async _fetchClusterResources(resourceType: K8sResourceType): Promise<K8sResource[]> {
    try {
      if (resourceType.isCRD) {
        return await this._fetchCustomResources(resourceType, null);
      } else {
        return await this._fetchStandardClusterResources(resourceType);
      }
    } catch (error) {
      const k8sError = error as K8sError;
      if (k8sError.response?.statusCode === 404 || k8sError.statusCode === 404) {
        this.log('debug', `Resource type ${formatResourceTypeId(resourceType)} not found in cluster`);
        return [];
      }

      if (k8sError.response?.statusCode === 403 || k8sError.statusCode === 403) {
        this.log('warn', `Permission denied for resource type ${formatResourceTypeId(resourceType)}`);
        return [];
      }

      throw error;
    }
  }

  async _fetchStandardNamespacedResources(resourceType: K8sResourceType, namespace: string): Promise<K8sResource[]> {
    const apiClient = this._getApiClient(resourceType);
    const methodName = `listNamespaced${resourceType.kind}`;

    if (!apiClient || !(apiClient as Record<string, unknown>)[methodName]) {
      this.log('warn', `API method not found: ${methodName}`);
      return [];
    }

    const response = await this._retryOperation(async () => {
      return await ((apiClient as Record<string, (ns: string) => Promise<{ body: { items: K8sResource[] } }>>)[methodName]!)(namespace);
    });

    return response.body.items || [];
  }

  async _fetchStandardClusterResources(resourceType: K8sResourceType): Promise<K8sResource[]> {
    const apiClient = this._getApiClient(resourceType);
    const methodName = `list${resourceType.kind}`;

    if (!apiClient || !(apiClient as Record<string, unknown>)[methodName]) {
      this.log('warn', `API method not found: ${methodName}`);
      return [];
    }

    const response = await this._retryOperation(async () => {
      return await ((apiClient as Record<string, () => Promise<{ body: { items: K8sResource[] } }>>)[methodName]!)();
    });

    return response.body.items || [];
  }

  async _fetchCustomResources(resourceType: K8sResourceType, namespace: string | null): Promise<K8sResource[]> {
    const customObjects = this.apiClients.customObjects as unknown as {
      listNamespacedCustomObject(group: string, version: string, namespace: string, plural: string): Promise<{ body: { items: K8sResource[] } }>;
      listClusterCustomObject(group: string, version: string, plural: string): Promise<{ body: { items: K8sResource[] } }>;
    };

    const response = await this._retryOperation(async () => {
      if (namespace) {
        return await customObjects.listNamespacedCustomObject(
          resourceType.group,
          resourceType.version,
          namespace,
          resourceType.plural
        );
      } else {
        return await customObjects.listClusterCustomObject(
          resourceType.group,
          resourceType.version,
          resourceType.plural
        );
      }
    });

    return response.body.items || [];
  }

  _getApiClient(resourceType: K8sResourceType): K8sApiClient | null {
    const { group } = resourceType;

    if (!group || group === '') return this.apiClients.core || null;
    if (group === 'apps') return this.apiClients.apps || null;
    if (group === 'batch') return this.apiClients.batch || null;
    if (group === 'networking.k8s.io') return this.apiClients.networking || null;
    if (group === 'storage.k8s.io') return this.apiClients.storage || null;
    if (group === 'rbac.authorization.k8s.io') return this.apiClients.rbac || null;
    if (group === 'policy') return this.apiClients.policy || null;
    if (group === 'autoscaling' && resourceType.version === 'v1') return this.apiClients.autoscalingV1 || null;
    if (group === 'autoscaling' && resourceType.version === 'v2') return this.apiClients.autoscalingV2 || null;
    if (group === 'scheduling.k8s.io') return this.apiClients.scheduling || null;
    if (group === 'node.k8s.io') return this.apiClients.node || null;
    if (group === 'certificates.k8s.io') return this.apiClients.certificates || null;
    if (group === 'coordination.k8s.io') return this.apiClients.coordination || null;
    if (group === 'discovery.k8s.io') return this.apiClients.discovery || null;
    if (group === 'events.k8s.io') return this.apiClients.events || null;
    if (group === 'admissionregistration.k8s.io') return this.apiClients.admission || null;
    if (group === 'apiregistration.k8s.io') return this.apiClients.apiRegistration || null;

    return null;
  }

  _normalizeResource(resourceType: K8sResourceType, resource: K8sResource): KubernetesResource {
    const metadata = resource.metadata || {};

    const configuration = this._sanitizeConfiguration(resource);

    return {
      provider: 'kubernetes',
      clusterId: this.clusterId,
      clusterName: this.clusterName,
      namespace: metadata.namespace || null,
      resourceType: formatResourceTypeId(resourceType),
      resourceId: metadata.name || '',
      uid: metadata.uid,

      apiVersion: resource.apiVersion,
      kind: resource.kind,
      name: metadata.name,
      labels: metadata.labels || {},
      annotations: metadata.annotations || {},
      creationTimestamp: metadata.creationTimestamp,
      resourceVersion: this.sanitization.removeResourceVersion ? undefined : metadata.resourceVersion,

      configuration,

      tags: this.tags,
      metadata: this.metadata,
      raw: this.sanitization.removeRaw ? undefined : resource,
    };
  }

  _sanitizeConfiguration(resource: K8sResource): Record<string, unknown> {
    const config: Record<string, unknown> = { ...resource };

    delete config.metadata;
    delete config.apiVersion;
    delete config.kind;

    if (this.sanitization.removeManagedFields && (config.metadata as Record<string, unknown>)?.managedFields) {
      delete (config.metadata as Record<string, unknown>).managedFields;
    }

    if (this.sanitization.removeSecrets && resource.kind === 'Secret' && config.data) {
      config.data = Object.keys(config.data as Record<string, string>).reduce((acc, key) => {
        acc[key] = '[REDACTED]';
        return acc;
      }, {} as Record<string, string>);
    }

    if (this.sanitization.customSanitizer) {
      return this.sanitization.customSanitizer(config);
    }

    return config;
  }

  async _retryOperation<T>(operation: () => Promise<T>, attempt = 1): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const shouldRetry = this._shouldRetry(error as K8sError, attempt);

      if (shouldRetry && attempt < this.retries.maxRetries) {
        const delay = Math.pow(2, attempt - 1) * this.retries.backoffBase;
        this.log('debug', `Retrying operation (attempt ${attempt + 1}/${this.retries.maxRetries}) after ${delay}ms`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this._retryOperation(operation, attempt + 1);
      }

      throw error;
    }
  }

  _shouldRetry(error: K8sError, attempt: number): boolean {
    if (attempt >= this.retries.maxRetries) {
      return false;
    }

    const statusCode = error.response?.statusCode || error.statusCode;

    if (statusCode === 429 && this.retries.retryOn429) {
      return true;
    }

    if (statusCode && statusCode >= 500 && statusCode < 600 && this.retries.retryOn5xx) {
      return true;
    }

    if (!statusCode && error.code === 'ECONNRESET') {
      return true;
    }

    return false;
  }

  async destroy(): Promise<void> {
    this.log('info', `Destroying Kubernetes driver for cluster: ${this.clusterName}`);
    this.kubeConfig = null;
    this.apiClients = {};
    this.crdCache = null;
  }

  log(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
    if (this.logger) {
      this.logger(level, message, { driver: 'kubernetes', clusterId: this.clusterId, ...meta });
    }

    if ((this.logLevel === 'debug' || this.logLevel === 'trace') && level !== 'debug') {
      (this.logger as unknown as { info?: (msg: string) => void })?.info?.(`[${level.toUpperCase()}] [k8s:${this.clusterId}] ${message}`);
    }
  }
}
