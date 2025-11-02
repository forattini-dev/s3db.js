/**
 * Kubernetes Resource Type Definitions
 *
 * Comprehensive list of all standard Kubernetes resource types across different API groups.
 * Used for discovery and inventory collection.
 */

/**
 * Core API Group (v1) - Fundamental Kubernetes resources
 */
export const CORE_RESOURCE_TYPES = [
  // Workload Resources
  { group: '', version: 'v1', kind: 'Pod', plural: 'pods', namespaced: true, category: 'workload' },
  { group: '', version: 'v1', kind: 'ReplicationController', plural: 'replicationcontrollers', namespaced: true, category: 'workload' },

  // Service & Discovery
  { group: '', version: 'v1', kind: 'Service', plural: 'services', namespaced: true, category: 'networking' },
  { group: '', version: 'v1', kind: 'Endpoints', plural: 'endpoints', namespaced: true, category: 'networking' },
  { group: '', version: 'v1', kind: 'EndpointSlice', plural: 'endpointslices', namespaced: true, category: 'networking' },

  // Configuration
  { group: '', version: 'v1', kind: 'ConfigMap', plural: 'configmaps', namespaced: true, category: 'config' },
  { group: '', version: 'v1', kind: 'Secret', plural: 'secrets', namespaced: true, category: 'config', sensitive: true },

  // Storage
  { group: '', version: 'v1', kind: 'PersistentVolume', plural: 'persistentvolumes', namespaced: false, category: 'storage' },
  { group: '', version: 'v1', kind: 'PersistentVolumeClaim', plural: 'persistentvolumeclaims', namespaced: true, category: 'storage' },

  // Cluster
  { group: '', version: 'v1', kind: 'Namespace', plural: 'namespaces', namespaced: false, category: 'cluster' },
  { group: '', version: 'v1', kind: 'Node', plural: 'nodes', namespaced: false, category: 'cluster' },

  // Service Accounts & Auth
  { group: '', version: 'v1', kind: 'ServiceAccount', plural: 'serviceaccounts', namespaced: true, category: 'auth' },

  // Resource Quotas & Limits
  { group: '', version: 'v1', kind: 'ResourceQuota', plural: 'resourcequotas', namespaced: true, category: 'policy' },
  { group: '', version: 'v1', kind: 'LimitRange', plural: 'limitranges', namespaced: true, category: 'policy' },

  // Events (usually ignored due to volume)
  { group: '', version: 'v1', kind: 'Event', plural: 'events', namespaced: true, category: 'events', highVolume: true },
];

/**
 * Apps API Group (apps/v1) - Application workload resources
 */
export const APPS_RESOURCE_TYPES = [
  { group: 'apps', version: 'v1', kind: 'Deployment', plural: 'deployments', namespaced: true, category: 'workload' },
  { group: 'apps', version: 'v1', kind: 'StatefulSet', plural: 'statefulsets', namespaced: true, category: 'workload' },
  { group: 'apps', version: 'v1', kind: 'DaemonSet', plural: 'daemonsets', namespaced: true, category: 'workload' },
  { group: 'apps', version: 'v1', kind: 'ReplicaSet', plural: 'replicasets', namespaced: true, category: 'workload' },
  { group: 'apps', version: 'v1', kind: 'ControllerRevision', plural: 'controllerrevisions', namespaced: true, category: 'workload' },
];

/**
 * Batch API Group (batch/v1) - Job and scheduled workload resources
 */
export const BATCH_RESOURCE_TYPES = [
  { group: 'batch', version: 'v1', kind: 'Job', plural: 'jobs', namespaced: true, category: 'workload' },
  { group: 'batch', version: 'v1', kind: 'CronJob', plural: 'cronjobs', namespaced: true, category: 'workload' },
];

/**
 * Networking API Group (networking.k8s.io/v1) - Network policies and ingress
 */
export const NETWORKING_RESOURCE_TYPES = [
  { group: 'networking.k8s.io', version: 'v1', kind: 'Ingress', plural: 'ingresses', namespaced: true, category: 'networking' },
  { group: 'networking.k8s.io', version: 'v1', kind: 'IngressClass', plural: 'ingressclasses', namespaced: false, category: 'networking' },
  { group: 'networking.k8s.io', version: 'v1', kind: 'NetworkPolicy', plural: 'networkpolicies', namespaced: true, category: 'networking' },
];

/**
 * Storage API Group (storage.k8s.io/v1) - Storage classes and volume management
 */
export const STORAGE_RESOURCE_TYPES = [
  { group: 'storage.k8s.io', version: 'v1', kind: 'StorageClass', plural: 'storageclasses', namespaced: false, category: 'storage' },
  { group: 'storage.k8s.io', version: 'v1', kind: 'VolumeAttachment', plural: 'volumeattachments', namespaced: false, category: 'storage' },
  { group: 'storage.k8s.io', version: 'v1', kind: 'CSIDriver', plural: 'csidrivers', namespaced: false, category: 'storage' },
  { group: 'storage.k8s.io', version: 'v1', kind: 'CSINode', plural: 'csinodes', namespaced: false, category: 'storage' },
  { group: 'storage.k8s.io', version: 'v1', kind: 'CSIStorageCapacity', plural: 'csistoragecapacities', namespaced: true, category: 'storage' },
];

/**
 * RBAC API Group (rbac.authorization.k8s.io/v1) - Role-based access control
 */
export const RBAC_RESOURCE_TYPES = [
  { group: 'rbac.authorization.k8s.io', version: 'v1', kind: 'Role', plural: 'roles', namespaced: true, category: 'auth' },
  { group: 'rbac.authorization.k8s.io', version: 'v1', kind: 'RoleBinding', plural: 'rolebindings', namespaced: true, category: 'auth' },
  { group: 'rbac.authorization.k8s.io', version: 'v1', kind: 'ClusterRole', plural: 'clusterroles', namespaced: false, category: 'auth' },
  { group: 'rbac.authorization.k8s.io', version: 'v1', kind: 'ClusterRoleBinding', plural: 'clusterrolebindings', namespaced: false, category: 'auth' },
];

/**
 * Policy API Group (policy/v1) - Pod disruption budgets and security policies
 */
export const POLICY_RESOURCE_TYPES = [
  { group: 'policy', version: 'v1', kind: 'PodDisruptionBudget', plural: 'poddisruptionbudgets', namespaced: true, category: 'policy' },
];

/**
 * Autoscaling API Group (autoscaling/v2) - Horizontal pod autoscaling
 */
export const AUTOSCALING_RESOURCE_TYPES = [
  { group: 'autoscaling', version: 'v1', kind: 'HorizontalPodAutoscaler', plural: 'horizontalpodautoscalers', namespaced: true, category: 'autoscaling' },
  { group: 'autoscaling', version: 'v2', kind: 'HorizontalPodAutoscaler', plural: 'horizontalpodautoscalers', namespaced: true, category: 'autoscaling' },
];

/**
 * Scheduling API Group (scheduling.k8s.io/v1) - Priority classes
 */
export const SCHEDULING_RESOURCE_TYPES = [
  { group: 'scheduling.k8s.io', version: 'v1', kind: 'PriorityClass', plural: 'priorityclasses', namespaced: false, category: 'scheduling' },
];

/**
 * Node API Group (node.k8s.io/v1) - Runtime classes
 */
export const NODE_RESOURCE_TYPES = [
  { group: 'node.k8s.io', version: 'v1', kind: 'RuntimeClass', plural: 'runtimeclasses', namespaced: false, category: 'cluster' },
];

/**
 * Certificates API Group (certificates.k8s.io/v1) - Certificate signing requests
 */
export const CERTIFICATES_RESOURCE_TYPES = [
  { group: 'certificates.k8s.io', version: 'v1', kind: 'CertificateSigningRequest', plural: 'certificatesigningrequests', namespaced: false, category: 'auth' },
];

/**
 * Coordination API Group (coordination.k8s.io/v1) - Leader election leases
 */
export const COORDINATION_RESOURCE_TYPES = [
  { group: 'coordination.k8s.io', version: 'v1', kind: 'Lease', plural: 'leases', namespaced: true, category: 'cluster', highVolume: true },
];

/**
 * Discovery API Group (discovery.k8s.io/v1) - Endpoint slices
 */
export const DISCOVERY_RESOURCE_TYPES = [
  { group: 'discovery.k8s.io', version: 'v1', kind: 'EndpointSlice', plural: 'endpointslices', namespaced: true, category: 'networking' },
];

/**
 * Events API Group (events.k8s.io/v1) - Enhanced events
 */
export const EVENTS_RESOURCE_TYPES = [
  { group: 'events.k8s.io', version: 'v1', kind: 'Event', plural: 'events', namespaced: true, category: 'events', highVolume: true },
];

/**
 * Admission Registration API Group (admissionregistration.k8s.io/v1)
 */
export const ADMISSION_RESOURCE_TYPES = [
  { group: 'admissionregistration.k8s.io', version: 'v1', kind: 'MutatingWebhookConfiguration', plural: 'mutatingwebhookconfigurations', namespaced: false, category: 'cluster' },
  { group: 'admissionregistration.k8s.io', version: 'v1', kind: 'ValidatingWebhookConfiguration', plural: 'validatingwebhookconfigurations', namespaced: false, category: 'cluster' },
];

/**
 * API Registration API Group (apiregistration.k8s.io/v1)
 */
export const API_REGISTRATION_RESOURCE_TYPES = [
  { group: 'apiregistration.k8s.io', version: 'v1', kind: 'APIService', plural: 'apiservices', namespaced: false, category: 'cluster' },
];

/**
 * Flow Control API Group (flowcontrol.apiserver.k8s.io/v1)
 */
export const FLOWCONTROL_RESOURCE_TYPES = [
  { group: 'flowcontrol.apiserver.k8s.io', version: 'v1', kind: 'FlowSchema', plural: 'flowschemas', namespaced: false, category: 'cluster' },
  { group: 'flowcontrol.apiserver.k8s.io', version: 'v1', kind: 'PriorityLevelConfiguration', plural: 'prioritylevelconfigurations', namespaced: false, category: 'cluster' },
];

/**
 * All standard resource types combined
 */
export const ALL_STANDARD_RESOURCE_TYPES = [
  ...CORE_RESOURCE_TYPES,
  ...APPS_RESOURCE_TYPES,
  ...BATCH_RESOURCE_TYPES,
  ...NETWORKING_RESOURCE_TYPES,
  ...STORAGE_RESOURCE_TYPES,
  ...RBAC_RESOURCE_TYPES,
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
  ...FLOWCONTROL_RESOURCE_TYPES,
];

/**
 * Resource types grouped by category
 */
export const RESOURCE_TYPES_BY_CATEGORY = {
  workload: ALL_STANDARD_RESOURCE_TYPES.filter(rt => rt.category === 'workload'),
  networking: ALL_STANDARD_RESOURCE_TYPES.filter(rt => rt.category === 'networking'),
  storage: ALL_STANDARD_RESOURCE_TYPES.filter(rt => rt.category === 'storage'),
  config: ALL_STANDARD_RESOURCE_TYPES.filter(rt => rt.category === 'config'),
  auth: ALL_STANDARD_RESOURCE_TYPES.filter(rt => rt.category === 'auth'),
  policy: ALL_STANDARD_RESOURCE_TYPES.filter(rt => rt.category === 'policy'),
  cluster: ALL_STANDARD_RESOURCE_TYPES.filter(rt => rt.category === 'cluster'),
  autoscaling: ALL_STANDARD_RESOURCE_TYPES.filter(rt => rt.category === 'autoscaling'),
  scheduling: ALL_STANDARD_RESOURCE_TYPES.filter(rt => rt.category === 'scheduling'),
  events: ALL_STANDARD_RESOURCE_TYPES.filter(rt => rt.category === 'events'),
};

/**
 * Helper function to format resource type as identifier
 * @param {Object} resourceType - Resource type definition
 * @returns {string} Formatted identifier (e.g., "apps.v1.Deployment")
 */
export function formatResourceTypeId(resourceType) {
  const group = resourceType.group || 'core';
  return `${group}.${resourceType.version}.${resourceType.kind}`;
}

/**
 * Helper function to parse resource type identifier
 * @param {string} id - Resource type ID (e.g., "apps.v1.Deployment")
 * @returns {Object} Parsed components { group, version, kind }
 */
export function parseResourceTypeId(id) {
  const parts = id.split('.');
  if (parts.length !== 3) {
    throw new Error(`Invalid resource type ID: ${id}. Expected format: group.version.Kind`);
  }

  const [group, version, kind] = parts;
  return {
    group: group === 'core' ? '' : group,
    version,
    kind,
  };
}

/**
 * Helper function to find resource type by identifier
 * @param {string} id - Resource type ID
 * @returns {Object|null} Resource type definition or null
 */
export function findResourceType(id) {
  const { group, version, kind } = parseResourceTypeId(id);
  return ALL_STANDARD_RESOURCE_TYPES.find(
    rt => rt.group === group && rt.version === version && rt.kind === kind
  ) || null;
}

/**
 * Common resource type filters
 */
export const COMMON_FILTERS = {
  // Exclude high-volume resources that change frequently
  excludeHighVolume: (rt) => !rt.highVolume,

  // Exclude sensitive resources (secrets)
  excludeSensitive: (rt) => !rt.sensitive,

  // Only namespaced resources
  namespacedOnly: (rt) => rt.namespaced,

  // Only cluster-scoped resources
  clusterScopedOnly: (rt) => !rt.namespaced,

  // Only workload resources
  workloadOnly: (rt) => rt.category === 'workload',

  // Exclude events and leases (usually too many)
  excludeNoisy: (rt) => !['Event', 'Lease'].includes(rt.kind),
};
