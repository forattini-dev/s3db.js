import { K8sResourceType } from './resource-types.js';
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
    listNamespace(): Promise<{
        body: {
            items: K8sResource[];
        };
    }>;
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
    response?: {
        statusCode?: number;
    };
    statusCode?: number;
    code?: string;
}
export declare class KubernetesDriver {
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
    pagination: {
        enabled: boolean;
        pageSize: number;
    };
    retries: Required<KubernetesDriverRetryOptions>;
    sanitization: Required<KubernetesDriverSanitizationOptions>;
    logger: LoggerFunction;
    logLevel: LogLevel;
    tags: Record<string, string>;
    metadata: Record<string, unknown>;
    constructor(options: KubernetesDriverOptions);
    initialize(): Promise<void>;
    _loadKubeConfig(): Promise<void>;
    _resolveKubeconfigContent(): string | null;
    _resolveKubeconfigPath(): string | null;
    _expandPath(path: string): string;
    _loadFromConnectionObject(): void;
    _createApiClients(): void;
    _testConnection(): Promise<void>;
    discoverResourceTypes(options?: {
        force?: boolean;
    }): Promise<K8sResourceType[]>;
    _filterSecrets(resourceTypes: K8sResourceType[]): K8sResourceType[];
    _discoverCRDs(force?: boolean): Promise<K8sResourceType[]>;
    listResources(options?: ListResourcesOptions): AsyncGenerator<KubernetesResource>;
    _fetchResourceType(resourceType: K8sResourceType): Promise<K8sResource[]>;
    _getNamespaces(): Promise<string[]>;
    _fetchNamespacedResources(resourceType: K8sResourceType, namespace: string): Promise<K8sResource[]>;
    _fetchClusterResources(resourceType: K8sResourceType): Promise<K8sResource[]>;
    _fetchStandardNamespacedResources(resourceType: K8sResourceType, namespace: string): Promise<K8sResource[]>;
    _fetchStandardClusterResources(resourceType: K8sResourceType): Promise<K8sResource[]>;
    _fetchCustomResources(resourceType: K8sResourceType, namespace: string | null): Promise<K8sResource[]>;
    _getApiClient(resourceType: K8sResourceType): K8sApiClient | null;
    _normalizeResource(resourceType: K8sResourceType, resource: K8sResource): KubernetesResource;
    _sanitizeConfiguration(resource: K8sResource): Record<string, unknown>;
    _retryOperation<T>(operation: () => Promise<T>, attempt?: number): Promise<T>;
    _shouldRetry(error: K8sError, attempt: number): boolean;
    destroy(): Promise<void>;
    log(level: LogLevel, message: string, meta?: Record<string, unknown>): void;
}
export {};
//# sourceMappingURL=k8s-driver.d.ts.map