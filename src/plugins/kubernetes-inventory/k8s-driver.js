/**
 * Kubernetes Driver for Inventory Plugin
 *
 * Connects to Kubernetes cluster and lists all resources using @kubernetes/client-node.
 * Supports kubeconfig, in-cluster auth, and custom configurations.
 */

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
} from './resource-types.js';

export class KubernetesDriver {
  constructor(options = {}) {
    this.options = options;
    this.clusterId = options.id;
    this.clusterName = options.name || options.id;

    // Kubernetes client objects
    this.kubeConfig = null;
    this.apiClients = {};

    // CRD discovery cache
    this.crdCache = null;
    this.crdCacheTime = 0;
    this.crdCacheTTL = options.discovery?.crdCacheTTL || 300000; // 5 minutes

    // Discovery options
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
      namespaces: options.discovery?.namespaces || null, // null = all
      excludeNamespaces: options.discovery?.excludeNamespaces || [],
      ...options.discovery,
    };

    // Performance options
    this.concurrency = options.discovery?.concurrency || 5;
    this.pagination = options.discovery?.pagination || { enabled: true, pageSize: 100 };

    // Retries
    this.retries = options.retries || {
      maxRetries: 5,
      backoffBase: 1000,
      retryOn429: true,
      retryOn5xx: true,
    };

    // Sanitization
    this.sanitization = options.sanitization || {
      removeSecrets: true,
      removeManagedFields: true,
      removeResourceVersion: false,
    };

    // Logger
    this.logger = options.logger || (() => {});
    this.verbose = options.verbose ?? false;

    // Metadata
    this.tags = options.tags || {};
    this.metadata = options.metadata || {};
  }

  /**
   * Initialize the Kubernetes client
   */
  async initialize() {
    // Require @kubernetes/client-node as peer dependency
    const k8s = requirePluginDependency('@kubernetes/client-node', 'KubernetesInventoryPlugin');

    this.k8s = k8s;
    this.kubeConfig = new k8s.KubeConfig();

    // Load kubeconfig based on options with fallback chain
    await this._loadKubeConfig();

    // Create API clients
    this._createApiClients();

    // Test connection
    await this._testConnection();

    this.log('info', `Kubernetes driver initialized for cluster: ${this.clusterName}`);
  }

  /**
   * Load kubeconfig from multiple sources with priority order
   */
  async _loadKubeConfig() {
    // Priority 1: In-cluster service account
    if (this.options.inCluster) {
      this.log('info', 'Loading in-cluster configuration');
      this.kubeConfig.loadFromCluster();
      return;
    }

    // Priority 2: Direct connection object (manual configuration)
    if (this.options.connection) {
      this.log('info', 'Loading kubeconfig from connection object');
      this._loadFromConnectionObject();
      return;
    }

    // Priority 3: Kubeconfig content as string (from environment variable or direct)
    const kubeconfigContent = this._resolveKubeconfigContent();
    if (kubeconfigContent) {
      this.log('info', 'Loading kubeconfig from content string');
      this.kubeConfig.loadFromString(kubeconfigContent);

      // Apply context if specified
      if (this.options.context) {
        this.log('info', `Switching to context: ${this.options.context}`);
        this.kubeConfig.setCurrentContext(this.options.context);
      }
      return;
    }

    // Priority 4: Kubeconfig file path (from option or environment variable)
    const kubeconfigPath = this._resolveKubeconfigPath();
    if (kubeconfigPath) {
      this.log('info', `Loading kubeconfig from file: ${kubeconfigPath}`);
      this.kubeConfig.loadFromFile(kubeconfigPath);

      // Apply context if specified
      if (this.options.context) {
        this.log('info', `Switching to context: ${this.options.context}`);
        this.kubeConfig.setCurrentContext(this.options.context);
      }
      return;
    }

    // Priority 5: Context only (use default kubeconfig with specific context)
    if (this.options.context) {
      this.log('info', `Loading default kubeconfig with context: ${this.options.context}`);
      this.kubeConfig.loadFromDefault();
      this.kubeConfig.setCurrentContext(this.options.context);
      return;
    }

    // Priority 6: Default kubeconfig (~/.kube/config or KUBECONFIG env var)
    this.log('info', 'Loading default kubeconfig');
    this.kubeConfig.loadFromDefault();
  }

  /**
   * Resolve kubeconfig content from multiple sources
   * Priority: options.kubeconfigContent > env var
   */
  _resolveKubeconfigContent() {
    // Direct content from options
    if (this.options.kubeconfigContent) {
      return this.options.kubeconfigContent;
    }

    // Environment variable: KUBECONFIG_CONTENT (base64 or plain text)
    const envContent = process.env.KUBECONFIG_CONTENT;
    if (envContent) {
      this.log('debug', 'Found KUBECONFIG_CONTENT environment variable');

      // Try to decode as base64 first
      try {
        const decoded = Buffer.from(envContent, 'base64').toString('utf-8');
        // Check if it looks like YAML/JSON
        if (decoded.includes('apiVersion') || decoded.includes('clusters')) {
          this.log('debug', 'KUBECONFIG_CONTENT is base64-encoded');
          return decoded;
        }
      } catch (error) {
        // Not base64, use as-is
      }

      // Use as plain text
      return envContent;
    }

    // Cluster-specific environment variable: KUBECONFIG_CONTENT_<CLUSTER_ID>
    const clusterEnvKey = `KUBECONFIG_CONTENT_${this.clusterId.toUpperCase().replace(/-/g, '_')}`;
    const clusterEnvContent = process.env[clusterEnvKey];
    if (clusterEnvContent) {
      this.log('debug', `Found ${clusterEnvKey} environment variable`);

      // Try base64 decode
      try {
        const decoded = Buffer.from(clusterEnvContent, 'base64').toString('utf-8');
        if (decoded.includes('apiVersion') || decoded.includes('clusters')) {
          return decoded;
        }
      } catch (error) {
        // Not base64
      }

      return clusterEnvContent;
    }

    return null;
  }

  /**
   * Resolve kubeconfig file path from multiple sources
   * Priority: options.kubeconfig > cluster-specific env var > KUBECONFIG env var
   */
  _resolveKubeconfigPath() {
    // Direct path from options
    if (this.options.kubeconfig) {
      return this._expandPath(this.options.kubeconfig);
    }

    // Cluster-specific environment variable: KUBECONFIG_<CLUSTER_ID>
    const clusterEnvKey = `KUBECONFIG_${this.clusterId.toUpperCase().replace(/-/g, '_')}`;
    const clusterEnvPath = process.env[clusterEnvKey];
    if (clusterEnvPath) {
      this.log('debug', `Found ${clusterEnvKey} environment variable`);
      return this._expandPath(clusterEnvPath);
    }

    // Standard KUBECONFIG environment variable
    // Note: loadFromDefault() already handles this, so we return null here
    // to let it fall through to default behavior

    return null;
  }

  /**
   * Expand path with home directory (~) and environment variables
   */
  _expandPath(path) {
    if (!path) return path;

    // Expand ~ to home directory
    let expandedPath = path.replace(/^~/, process.env.HOME || '');

    // Expand environment variables: ${VAR} or $VAR
    expandedPath = expandedPath.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      return process.env[varName] || '';
    });
    expandedPath = expandedPath.replace(/\$([A-Z_][A-Z0-9_]*)/gi, (_, varName) => {
      return process.env[varName] || '';
    });

    return expandedPath;
  }

  /**
   * Load from connection object (manual configuration)
   */
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

  /**
   * Create all necessary API clients
   */
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

  /**
   * Test connection to cluster
   */
  async _testConnection() {
    try {
      const response = await this._retryOperation(async () => {
        return await this.apiClients.core.listNamespace();
      });

      const namespaceCount = response.body.items.length;
      this.log('info', `Successfully connected to cluster. Found ${namespaceCount} namespaces.`);
    } catch (error) {
      throw new Error(`Failed to connect to Kubernetes cluster: ${error.message}`);
    }
  }

  /**
   * Discover all available resource types (including CRDs)
   * @param {Object} options - Discovery options
   * @returns {Promise<Array>} Array of resource type definitions
   */
  async discoverResourceTypes(options = {}) {
    const resourceTypes = [];

    // Add standard resource types based on discovery options
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

    // Add other standard types
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

    // Discover CRDs if enabled
    if (this.discovery.includeCRDs) {
      const crds = await this._discoverCRDs(options.force);
      resourceTypes.push(...crds);
    }

    return resourceTypes;
  }

  /**
   * Filter out Secrets if includeSecrets is false
   */
  _filterSecrets(resourceTypes) {
    if (this.discovery.includeSecrets) {
      return resourceTypes;
    }
    return resourceTypes.filter(rt => rt.kind !== 'Secret');
  }

  /**
   * Discover Custom Resource Definitions (CRDs)
   * @param {boolean} force - Force refresh cache
   * @returns {Promise<Array>} Array of CRD resource types
   */
  async _discoverCRDs(force = false) {
    const now = Date.now();

    // Return cached CRDs if still valid
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
        // Find the storage version or use the first version
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
    } catch (error) {
      this.log('warn', `Failed to discover CRDs: ${error.message}`);
      return [];
    }
  }

  /**
   * List all resources from the Kubernetes cluster
   * @param {Object} options - Discovery options
   * @returns {AsyncIterator} Yields normalized resources
   */
  async *listResources(options = {}) {
    const { runtime } = options;

    // Discover resource types
    const resourceTypes = await this.discoverResourceTypes(options);
    this.log('info', `Discovering ${resourceTypes.length} resource types from cluster ${this.clusterName}`);

    // Emit progress
    runtime?.emitProgress?.({
      stage: 'discovery',
      clusterId: this.clusterId,
      totalTypes: resourceTypes.length,
      processedTypes: 0,
    });

    let processedTypes = 0;

    // Fetch resources for each type
    for (const resourceType of resourceTypes) {
      const resourceTypeId = formatResourceTypeId(resourceType);

      try {
        this.log('debug', `Fetching resources of type: ${resourceTypeId}`);

        // Fetch resources based on type
        const resources = await this._fetchResourceType(resourceType);

        // Yield normalized resources
        for (const resource of resources) {
          yield this._normalizeResource(resourceType, resource);
        }

        processedTypes++;

        // Emit progress
        runtime?.emitProgress?.({
          stage: 'discovery',
          clusterId: this.clusterId,
          totalTypes: resourceTypes.length,
          processedTypes,
          currentType: resourceTypeId,
        });

        this.log('debug', `Fetched ${resources.length} resources of type: ${resourceTypeId}`);
      } catch (error) {
        this.log('warn', `Failed to fetch resource type ${resourceTypeId}: ${error.message}`);

        // Continue with next resource type (don't fail entire discovery)
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

  /**
   * Fetch all resources of a specific type
   * @param {Object} resourceType - Resource type definition
   * @returns {Promise<Array>} Array of Kubernetes resources
   */
  async _fetchResourceType(resourceType) {
    const resources = [];

    // Determine if resource is namespaced
    if (resourceType.namespaced) {
      // Fetch namespaced resources
      const namespaces = await this._getNamespaces();

      for (const namespace of namespaces) {
        const namespaceResources = await this._fetchNamespacedResources(resourceType, namespace);
        resources.push(...namespaceResources);
      }
    } else {
      // Fetch cluster-scoped resources
      const clusterResources = await this._fetchClusterResources(resourceType);
      resources.push(...clusterResources);
    }

    return resources;
  }

  /**
   * Get list of namespaces to query
   * @returns {Promise<Array>} Array of namespace names
   */
  async _getNamespaces() {
    // If specific namespaces are configured, use those
    if (this.discovery.namespaces && this.discovery.namespaces.length > 0) {
      return this.discovery.namespaces.filter(
        ns => !this.discovery.excludeNamespaces.includes(ns)
      );
    }

    // Otherwise, fetch all namespaces
    try {
      const response = await this._retryOperation(async () => {
        return await this.apiClients.core.listNamespace();
      });

      return response.body.items
        .map(ns => ns.metadata.name)
        .filter(ns => !this.discovery.excludeNamespaces.includes(ns));
    } catch (error) {
      this.log('warn', `Failed to list namespaces: ${error.message}`);
      return ['default']; // Fallback to default namespace
    }
  }

  /**
   * Fetch namespaced resources
   * @param {Object} resourceType - Resource type definition
   * @param {string} namespace - Namespace name
   * @returns {Promise<Array>} Array of resources
   */
  async _fetchNamespacedResources(resourceType, namespace) {
    try {
      if (resourceType.isCRD) {
        // Fetch custom resources
        return await this._fetchCustomResources(resourceType, namespace);
      } else {
        // Fetch standard namespaced resources
        return await this._fetchStandardNamespacedResources(resourceType, namespace);
      }
    } catch (error) {
      // 404 means resource type not found in this cluster (e.g., old K8s version)
      if (error.response?.statusCode === 404 || error.statusCode === 404) {
        this.log('debug', `Resource type ${formatResourceTypeId(resourceType)} not found in cluster`);
        return [];
      }

      // 403 means permission denied
      if (error.response?.statusCode === 403 || error.statusCode === 403) {
        this.log('warn', `Permission denied for resource type ${formatResourceTypeId(resourceType)} in namespace ${namespace}`);
        return [];
      }

      throw error;
    }
  }

  /**
   * Fetch cluster-scoped resources
   * @param {Object} resourceType - Resource type definition
   * @returns {Promise<Array>} Array of resources
   */
  async _fetchClusterResources(resourceType) {
    try {
      if (resourceType.isCRD) {
        // Fetch custom resources (cluster-scoped)
        return await this._fetchCustomResources(resourceType, null);
      } else {
        // Fetch standard cluster-scoped resources
        return await this._fetchStandardClusterResources(resourceType);
      }
    } catch (error) {
      // 404 means resource type not found
      if (error.response?.statusCode === 404 || error.statusCode === 404) {
        this.log('debug', `Resource type ${formatResourceTypeId(resourceType)} not found in cluster`);
        return [];
      }

      // 403 means permission denied
      if (error.response?.statusCode === 403 || error.statusCode === 403) {
        this.log('warn', `Permission denied for resource type ${formatResourceTypeId(resourceType)}`);
        return [];
      }

      throw error;
    }
  }

  /**
   * Fetch standard namespaced resources
   */
  async _fetchStandardNamespacedResources(resourceType, namespace) {
    const apiClient = this._getApiClient(resourceType);
    const methodName = `listNamespaced${resourceType.kind}`;

    if (!apiClient || !apiClient[methodName]) {
      this.log('warn', `API method not found: ${methodName}`);
      return [];
    }

    const response = await this._retryOperation(async () => {
      return await apiClient[methodName](namespace);
    });

    return response.body.items || [];
  }

  /**
   * Fetch standard cluster-scoped resources
   */
  async _fetchStandardClusterResources(resourceType) {
    const apiClient = this._getApiClient(resourceType);
    const methodName = `list${resourceType.kind}`;

    if (!apiClient || !apiClient[methodName]) {
      this.log('warn', `API method not found: ${methodName}`);
      return [];
    }

    const response = await this._retryOperation(async () => {
      return await apiClient[methodName]();
    });

    return response.body.items || [];
  }

  /**
   * Fetch custom resources (CRDs)
   */
  async _fetchCustomResources(resourceType, namespace) {
    const { customObjects } = this.apiClients;

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

  /**
   * Get appropriate API client for resource type
   */
  _getApiClient(resourceType) {
    const { group } = resourceType;

    if (!group || group === '') return this.apiClients.core;
    if (group === 'apps') return this.apiClients.apps;
    if (group === 'batch') return this.apiClients.batch;
    if (group === 'networking.k8s.io') return this.apiClients.networking;
    if (group === 'storage.k8s.io') return this.apiClients.storage;
    if (group === 'rbac.authorization.k8s.io') return this.apiClients.rbac;
    if (group === 'policy') return this.apiClients.policy;
    if (group === 'autoscaling' && resourceType.version === 'v1') return this.apiClients.autoscalingV1;
    if (group === 'autoscaling' && resourceType.version === 'v2') return this.apiClients.autoscalingV2;
    if (group === 'scheduling.k8s.io') return this.apiClients.scheduling;
    if (group === 'node.k8s.io') return this.apiClients.node;
    if (group === 'certificates.k8s.io') return this.apiClients.certificates;
    if (group === 'coordination.k8s.io') return this.apiClients.coordination;
    if (group === 'discovery.k8s.io') return this.apiClients.discovery;
    if (group === 'events.k8s.io') return this.apiClients.events;
    if (group === 'admissionregistration.k8s.io') return this.apiClients.admission;
    if (group === 'apiregistration.k8s.io') return this.apiClients.apiRegistration;

    return null;
  }

  /**
   * Normalize Kubernetes resource to standard format
   */
  _normalizeResource(resourceType, resource) {
    const metadata = resource.metadata || {};

    // Sanitize configuration
    const configuration = this._sanitizeConfiguration(resource);

    return {
      // IDENTITY
      provider: 'kubernetes',
      clusterId: this.clusterId,
      clusterName: this.clusterName,
      namespace: metadata.namespace || null,
      resourceType: formatResourceTypeId(resourceType),
      resourceId: metadata.name,
      uid: metadata.uid,

      // METADATA
      apiVersion: resource.apiVersion,
      kind: resource.kind,
      name: metadata.name,
      labels: metadata.labels || {},
      annotations: metadata.annotations || {},
      creationTimestamp: metadata.creationTimestamp,
      resourceVersion: this.sanitization.removeResourceVersion ? undefined : metadata.resourceVersion,

      // CONFIGURATION
      configuration,

      // CONTEXT
      tags: this.tags,
      metadata: this.metadata,
      raw: this.sanitization.removeRaw ? undefined : resource,
    };
  }

  /**
   * Sanitize resource configuration
   */
  _sanitizeConfiguration(resource) {
    const config = { ...resource };

    // Remove metadata from configuration (already extracted)
    delete config.metadata;
    delete config.apiVersion;
    delete config.kind;

    // Remove managed fields (reduce size)
    if (this.sanitization.removeManagedFields && config.metadata?.managedFields) {
      delete config.metadata.managedFields;
    }

    // Remove secret data
    if (this.sanitization.removeSecrets && resource.kind === 'Secret' && config.data) {
      config.data = Object.keys(config.data).reduce((acc, key) => {
        acc[key] = '[REDACTED]';
        return acc;
      }, {});
    }

    // Custom sanitizer
    if (this.sanitization.customSanitizer) {
      return this.sanitization.customSanitizer(config);
    }

    return config;
  }

  /**
   * Retry operation with exponential backoff
   */
  async _retryOperation(operation, attempt = 1) {
    try {
      return await operation();
    } catch (error) {
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

  /**
   * Determine if error should be retried
   */
  _shouldRetry(error, attempt) {
    if (attempt >= this.retries.maxRetries) {
      return false;
    }

    const statusCode = error.response?.statusCode || error.statusCode;

    // Retry on 429 (rate limit)
    if (statusCode === 429 && this.retries.retryOn429) {
      return true;
    }

    // Retry on 5xx (server errors)
    if (statusCode >= 500 && statusCode < 600 && this.retries.retryOn5xx) {
      return true;
    }

    // Retry on network errors
    if (!statusCode && error.code === 'ECONNRESET') {
      return true;
    }

    return false;
  }

  /**
   * Cleanup driver resources
   */
  async destroy() {
    this.log('info', `Destroying Kubernetes driver for cluster: ${this.clusterName}`);
    this.kubeConfig = null;
    this.apiClients = {};
    this.crdCache = null;
  }

  /**
   * Internal logger
   */
  log(level, message, meta = {}) {
    if (this.logger) {
      this.logger(level, message, { driver: 'kubernetes', clusterId: this.clusterId, ...meta });
    }

    if (this.verbose && level !== 'debug') {
      this.logger.info(`[${level.toUpperCase()}] [k8s:${this.clusterId}] ${message}`);
    }
  }
}
