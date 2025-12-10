import { requirePluginDependency } from '../concerns/plugin-dependencies.js';
import { formatResourceTypeId, CORE_RESOURCE_TYPES, APPS_RESOURCE_TYPES, BATCH_RESOURCE_TYPES, NETWORKING_RESOURCE_TYPES, STORAGE_RESOURCE_TYPES, RBAC_RESOURCE_TYPES, POLICY_RESOURCE_TYPES, AUTOSCALING_RESOURCE_TYPES, SCHEDULING_RESOURCE_TYPES, NODE_RESOURCE_TYPES, CERTIFICATES_RESOURCE_TYPES, COORDINATION_RESOURCE_TYPES, DISCOVERY_RESOURCE_TYPES, EVENTS_RESOURCE_TYPES, ADMISSION_RESOURCE_TYPES, API_REGISTRATION_RESOURCE_TYPES, FLOWCONTROL_RESOURCE_TYPES, } from './resource-types.js';
export class KubernetesDriver {
    options;
    clusterId;
    clusterName;
    kubeConfig;
    apiClients;
    k8s;
    crdCache;
    crdCacheTime;
    crdCacheTTL;
    discovery;
    concurrency;
    pagination;
    retries;
    sanitization;
    logger;
    logLevel;
    tags;
    metadata;
    constructor(options) {
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
        };
        this.logger = options.logger || (() => { });
        this.logLevel = options.logLevel || 'info';
        this.tags = options.tags || {};
        this.metadata = options.metadata || {};
    }
    async initialize() {
        const k8s = requirePluginDependency('@kubernetes/client-node', 'KubernetesInventoryPlugin');
        this.k8s = k8s;
        this.kubeConfig = new k8s.KubeConfig();
        await this._loadKubeConfig();
        this._createApiClients();
        await this._testConnection();
        this.log('info', `Kubernetes driver initialized for cluster: ${this.clusterName}`);
    }
    async _loadKubeConfig() {
        if (this.options.inCluster) {
            this.log('info', 'Loading in-cluster configuration');
            this.kubeConfig.loadFromCluster();
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
            this.kubeConfig.loadFromString(kubeconfigContent);
            if (this.options.context) {
                this.log('info', `Switching to context: ${this.options.context}`);
                this.kubeConfig.setCurrentContext(this.options.context);
            }
            return;
        }
        const kubeconfigPath = this._resolveKubeconfigPath();
        if (kubeconfigPath) {
            this.log('info', `Loading kubeconfig from file: ${kubeconfigPath}`);
            this.kubeConfig.loadFromFile(kubeconfigPath);
            if (this.options.context) {
                this.log('info', `Switching to context: ${this.options.context}`);
                this.kubeConfig.setCurrentContext(this.options.context);
            }
            return;
        }
        if (this.options.context) {
            this.log('info', `Loading default kubeconfig with context: ${this.options.context}`);
            this.kubeConfig.loadFromDefault();
            this.kubeConfig.setCurrentContext(this.options.context);
            return;
        }
        this.log('info', 'Loading default kubeconfig');
        this.kubeConfig.loadFromDefault();
    }
    _resolveKubeconfigContent() {
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
            }
            catch {
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
            }
            catch {
                // Not base64
            }
            return clusterEnvContent;
        }
        return null;
    }
    _resolveKubeconfigPath() {
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
    _expandPath(path) {
        if (!path)
            return path;
        let expandedPath = path.replace(/^~/, process.env.HOME || '');
        expandedPath = expandedPath.replace(/\$\{([^}]+)\}/g, (_, varName) => {
            return process.env[varName] || '';
        });
        expandedPath = expandedPath.replace(/\$([A-Z_][A-Z0-9_]*)/gi, (_, varName) => {
            return process.env[varName] || '';
        });
        return expandedPath;
    }
    _loadFromConnectionObject() {
        const conn = this.options.connection;
        this.kubeConfig.loadFromOptions({
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
    _createApiClients() {
        const { k8s, kubeConfig } = this;
        this.apiClients = {
            core: kubeConfig.makeApiClient(k8s.CoreV1Api),
            apps: kubeConfig.makeApiClient(k8s.AppsV1Api),
            batch: kubeConfig.makeApiClient(k8s.BatchV1Api),
            networking: kubeConfig.makeApiClient(k8s.NetworkingV1Api),
            storage: kubeConfig.makeApiClient(k8s.StorageV1Api),
            rbac: kubeConfig.makeApiClient(k8s.RbacAuthorizationV1Api),
            policy: kubeConfig.makeApiClient(k8s.PolicyV1Api),
            autoscalingV1: kubeConfig.makeApiClient(k8s.AutoscalingV1Api),
            autoscalingV2: kubeConfig.makeApiClient(k8s.AutoscalingV2Api),
            scheduling: kubeConfig.makeApiClient(k8s.SchedulingV1Api),
            node: kubeConfig.makeApiClient(k8s.NodeV1Api),
            certificates: kubeConfig.makeApiClient(k8s.CertificatesV1Api),
            coordination: kubeConfig.makeApiClient(k8s.CoordinationV1Api),
            discovery: kubeConfig.makeApiClient(k8s.DiscoveryV1Api),
            events: kubeConfig.makeApiClient(k8s.EventsV1Api),
            admission: kubeConfig.makeApiClient(k8s.AdmissionregistrationV1Api),
            apiRegistration: kubeConfig.makeApiClient(k8s.ApiregistrationV1Api),
            apiExtensions: kubeConfig.makeApiClient(k8s.ApiextensionsV1Api),
            customObjects: kubeConfig.makeApiClient(k8s.CustomObjectsApi),
        };
    }
    async _testConnection() {
        try {
            const response = await this._retryOperation(async () => {
                return await this.apiClients.core.listNamespace();
            });
            const namespaceCount = response.body.items.length;
            this.log('info', `Successfully connected to cluster. Found ${namespaceCount} namespaces.`);
        }
        catch (error) {
            throw new Error(`Failed to connect to Kubernetes cluster: ${error.message}`);
        }
    }
    async discoverResourceTypes(options = {}) {
        const resourceTypes = [];
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
        resourceTypes.push(...POLICY_RESOURCE_TYPES, ...AUTOSCALING_RESOURCE_TYPES, ...SCHEDULING_RESOURCE_TYPES, ...NODE_RESOURCE_TYPES, ...CERTIFICATES_RESOURCE_TYPES, ...COORDINATION_RESOURCE_TYPES, ...DISCOVERY_RESOURCE_TYPES, ...EVENTS_RESOURCE_TYPES, ...ADMISSION_RESOURCE_TYPES, ...API_REGISTRATION_RESOURCE_TYPES, ...FLOWCONTROL_RESOURCE_TYPES);
        if (this.discovery.includeCRDs) {
            const crds = await this._discoverCRDs(options.force);
            resourceTypes.push(...crds);
        }
        return resourceTypes;
    }
    _filterSecrets(resourceTypes) {
        if (this.discovery.includeSecrets) {
            return resourceTypes;
        }
        return resourceTypes.filter(rt => rt.kind !== 'Secret');
    }
    async _discoverCRDs(force = false) {
        const now = Date.now();
        if (!force && this.crdCache && (now - this.crdCacheTime < this.crdCacheTTL)) {
            this.log('debug', `Using cached CRDs (${this.crdCache.length} types)`);
            return this.crdCache;
        }
        this.log('info', 'Discovering Custom Resource Definitions...');
        try {
            const response = await this._retryOperation(async () => {
                return await this.apiClients.apiExtensions.listCustomResourceDefinition();
            });
            const crds = response.body.items.map(crd => {
                const storageVersion = crd.spec.versions.find(v => v.storage);
                const version = storageVersion || crd.spec.versions[0];
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
        }
        catch (error) {
            this.log('warn', `Failed to discover CRDs: ${error.message}`);
            return [];
        }
    }
    async *listResources(options = {}) {
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
            }
            catch (error) {
                this.log('warn', `Failed to fetch resource type ${resourceTypeId}: ${error.message}`);
                runtime?.emitProgress?.({
                    stage: 'error',
                    clusterId: this.clusterId,
                    resourceType: resourceTypeId,
                    error: error.message,
                });
            }
        }
        this.log('info', `Completed discovery for cluster ${this.clusterName}`);
    }
    async _fetchResourceType(resourceType) {
        const resources = [];
        if (resourceType.namespaced) {
            const namespaces = await this._getNamespaces();
            for (const namespace of namespaces) {
                const namespaceResources = await this._fetchNamespacedResources(resourceType, namespace);
                resources.push(...namespaceResources);
            }
        }
        else {
            const clusterResources = await this._fetchClusterResources(resourceType);
            resources.push(...clusterResources);
        }
        return resources;
    }
    async _getNamespaces() {
        if (this.discovery.namespaces && this.discovery.namespaces.length > 0) {
            return this.discovery.namespaces.filter(ns => !this.discovery.excludeNamespaces.includes(ns));
        }
        try {
            const response = await this._retryOperation(async () => {
                return await this.apiClients.core.listNamespace();
            });
            return response.body.items
                .map(ns => ns.metadata?.name || '')
                .filter(ns => ns && !this.discovery.excludeNamespaces.includes(ns));
        }
        catch (error) {
            this.log('warn', `Failed to list namespaces: ${error.message}`);
            return ['default'];
        }
    }
    async _fetchNamespacedResources(resourceType, namespace) {
        try {
            if (resourceType.isCRD) {
                return await this._fetchCustomResources(resourceType, namespace);
            }
            else {
                return await this._fetchStandardNamespacedResources(resourceType, namespace);
            }
        }
        catch (error) {
            const k8sError = error;
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
    async _fetchClusterResources(resourceType) {
        try {
            if (resourceType.isCRD) {
                return await this._fetchCustomResources(resourceType, null);
            }
            else {
                return await this._fetchStandardClusterResources(resourceType);
            }
        }
        catch (error) {
            const k8sError = error;
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
    async _fetchStandardNamespacedResources(resourceType, namespace) {
        const apiClient = this._getApiClient(resourceType);
        const methodName = `listNamespaced${resourceType.kind}`;
        if (!apiClient || !apiClient[methodName]) {
            this.log('warn', `API method not found: ${methodName}`);
            return [];
        }
        const response = await this._retryOperation(async () => {
            return await (apiClient[methodName])(namespace);
        });
        return response.body.items || [];
    }
    async _fetchStandardClusterResources(resourceType) {
        const apiClient = this._getApiClient(resourceType);
        const methodName = `list${resourceType.kind}`;
        if (!apiClient || !apiClient[methodName]) {
            this.log('warn', `API method not found: ${methodName}`);
            return [];
        }
        const response = await this._retryOperation(async () => {
            return await (apiClient[methodName])();
        });
        return response.body.items || [];
    }
    async _fetchCustomResources(resourceType, namespace) {
        const customObjects = this.apiClients.customObjects;
        const response = await this._retryOperation(async () => {
            if (namespace) {
                return await customObjects.listNamespacedCustomObject(resourceType.group, resourceType.version, namespace, resourceType.plural);
            }
            else {
                return await customObjects.listClusterCustomObject(resourceType.group, resourceType.version, resourceType.plural);
            }
        });
        return response.body.items || [];
    }
    _getApiClient(resourceType) {
        const { group } = resourceType;
        if (!group || group === '')
            return this.apiClients.core || null;
        if (group === 'apps')
            return this.apiClients.apps || null;
        if (group === 'batch')
            return this.apiClients.batch || null;
        if (group === 'networking.k8s.io')
            return this.apiClients.networking || null;
        if (group === 'storage.k8s.io')
            return this.apiClients.storage || null;
        if (group === 'rbac.authorization.k8s.io')
            return this.apiClients.rbac || null;
        if (group === 'policy')
            return this.apiClients.policy || null;
        if (group === 'autoscaling' && resourceType.version === 'v1')
            return this.apiClients.autoscalingV1 || null;
        if (group === 'autoscaling' && resourceType.version === 'v2')
            return this.apiClients.autoscalingV2 || null;
        if (group === 'scheduling.k8s.io')
            return this.apiClients.scheduling || null;
        if (group === 'node.k8s.io')
            return this.apiClients.node || null;
        if (group === 'certificates.k8s.io')
            return this.apiClients.certificates || null;
        if (group === 'coordination.k8s.io')
            return this.apiClients.coordination || null;
        if (group === 'discovery.k8s.io')
            return this.apiClients.discovery || null;
        if (group === 'events.k8s.io')
            return this.apiClients.events || null;
        if (group === 'admissionregistration.k8s.io')
            return this.apiClients.admission || null;
        if (group === 'apiregistration.k8s.io')
            return this.apiClients.apiRegistration || null;
        return null;
    }
    _normalizeResource(resourceType, resource) {
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
    _sanitizeConfiguration(resource) {
        const config = { ...resource };
        delete config.metadata;
        delete config.apiVersion;
        delete config.kind;
        if (this.sanitization.removeManagedFields && config.metadata?.managedFields) {
            delete config.metadata.managedFields;
        }
        if (this.sanitization.removeSecrets && resource.kind === 'Secret' && config.data) {
            config.data = Object.keys(config.data).reduce((acc, key) => {
                acc[key] = '[REDACTED]';
                return acc;
            }, {});
        }
        if (this.sanitization.customSanitizer) {
            return this.sanitization.customSanitizer(config);
        }
        return config;
    }
    async _retryOperation(operation, attempt = 1) {
        try {
            return await operation();
        }
        catch (error) {
            const shouldRetry = this._shouldRetry(error, attempt);
            if (shouldRetry && attempt < this.retries.maxRetries) {
                const delay = Math.pow(2, attempt - 1) * this.retries.backoffBase;
                this.log('debug', `Retrying operation (attempt ${attempt + 1}/${this.retries.maxRetries}) after ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this._retryOperation(operation, attempt + 1);
            }
            throw error;
        }
    }
    _shouldRetry(error, attempt) {
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
    async destroy() {
        this.log('info', `Destroying Kubernetes driver for cluster: ${this.clusterName}`);
        this.kubeConfig = null;
        this.apiClients = {};
        this.crdCache = null;
    }
    log(level, message, meta = {}) {
        if (this.logger) {
            this.logger(level, message, { driver: 'kubernetes', clusterId: this.clusterId, ...meta });
        }
        if ((this.logLevel === 'debug' || this.logLevel === 'trace') && level !== 'debug') {
            this.logger?.info?.(`[${level.toUpperCase()}] [k8s:${this.clusterId}] ${message}`);
        }
    }
}
//# sourceMappingURL=k8s-driver.js.map