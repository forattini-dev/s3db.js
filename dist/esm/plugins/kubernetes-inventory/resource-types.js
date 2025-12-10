export const CORE_RESOURCE_TYPES = [
    { group: '', version: 'v1', kind: 'Pod', plural: 'pods', namespaced: true, category: 'workload' },
    { group: '', version: 'v1', kind: 'ReplicationController', plural: 'replicationcontrollers', namespaced: true, category: 'workload' },
    { group: '', version: 'v1', kind: 'Service', plural: 'services', namespaced: true, category: 'networking' },
    { group: '', version: 'v1', kind: 'Endpoints', plural: 'endpoints', namespaced: true, category: 'networking' },
    { group: '', version: 'v1', kind: 'EndpointSlice', plural: 'endpointslices', namespaced: true, category: 'networking' },
    { group: '', version: 'v1', kind: 'ConfigMap', plural: 'configmaps', namespaced: true, category: 'config' },
    { group: '', version: 'v1', kind: 'Secret', plural: 'secrets', namespaced: true, category: 'config', sensitive: true },
    { group: '', version: 'v1', kind: 'PersistentVolume', plural: 'persistentvolumes', namespaced: false, category: 'storage' },
    { group: '', version: 'v1', kind: 'PersistentVolumeClaim', plural: 'persistentvolumeclaims', namespaced: true, category: 'storage' },
    { group: '', version: 'v1', kind: 'Namespace', plural: 'namespaces', namespaced: false, category: 'cluster' },
    { group: '', version: 'v1', kind: 'Node', plural: 'nodes', namespaced: false, category: 'cluster' },
    { group: '', version: 'v1', kind: 'ServiceAccount', plural: 'serviceaccounts', namespaced: true, category: 'auth' },
    { group: '', version: 'v1', kind: 'ResourceQuota', plural: 'resourcequotas', namespaced: true, category: 'policy' },
    { group: '', version: 'v1', kind: 'LimitRange', plural: 'limitranges', namespaced: true, category: 'policy' },
    { group: '', version: 'v1', kind: 'Event', plural: 'events', namespaced: true, category: 'events', highVolume: true },
];
export const APPS_RESOURCE_TYPES = [
    { group: 'apps', version: 'v1', kind: 'Deployment', plural: 'deployments', namespaced: true, category: 'workload' },
    { group: 'apps', version: 'v1', kind: 'StatefulSet', plural: 'statefulsets', namespaced: true, category: 'workload' },
    { group: 'apps', version: 'v1', kind: 'DaemonSet', plural: 'daemonsets', namespaced: true, category: 'workload' },
    { group: 'apps', version: 'v1', kind: 'ReplicaSet', plural: 'replicasets', namespaced: true, category: 'workload' },
    { group: 'apps', version: 'v1', kind: 'ControllerRevision', plural: 'controllerrevisions', namespaced: true, category: 'workload' },
];
export const BATCH_RESOURCE_TYPES = [
    { group: 'batch', version: 'v1', kind: 'Job', plural: 'jobs', namespaced: true, category: 'workload' },
    { group: 'batch', version: 'v1', kind: 'CronJob', plural: 'cronjobs', namespaced: true, category: 'workload' },
];
export const NETWORKING_RESOURCE_TYPES = [
    { group: 'networking.k8s.io', version: 'v1', kind: 'Ingress', plural: 'ingresses', namespaced: true, category: 'networking' },
    { group: 'networking.k8s.io', version: 'v1', kind: 'IngressClass', plural: 'ingressclasses', namespaced: false, category: 'networking' },
    { group: 'networking.k8s.io', version: 'v1', kind: 'NetworkPolicy', plural: 'networkpolicies', namespaced: true, category: 'networking' },
];
export const STORAGE_RESOURCE_TYPES = [
    { group: 'storage.k8s.io', version: 'v1', kind: 'StorageClass', plural: 'storageclasses', namespaced: false, category: 'storage' },
    { group: 'storage.k8s.io', version: 'v1', kind: 'VolumeAttachment', plural: 'volumeattachments', namespaced: false, category: 'storage' },
    { group: 'storage.k8s.io', version: 'v1', kind: 'CSIDriver', plural: 'csidrivers', namespaced: false, category: 'storage' },
    { group: 'storage.k8s.io', version: 'v1', kind: 'CSINode', plural: 'csinodes', namespaced: false, category: 'storage' },
    { group: 'storage.k8s.io', version: 'v1', kind: 'CSIStorageCapacity', plural: 'csistoragecapacities', namespaced: true, category: 'storage' },
];
export const RBAC_RESOURCE_TYPES = [
    { group: 'rbac.authorization.k8s.io', version: 'v1', kind: 'Role', plural: 'roles', namespaced: true, category: 'auth' },
    { group: 'rbac.authorization.k8s.io', version: 'v1', kind: 'RoleBinding', plural: 'rolebindings', namespaced: true, category: 'auth' },
    { group: 'rbac.authorization.k8s.io', version: 'v1', kind: 'ClusterRole', plural: 'clusterroles', namespaced: false, category: 'auth' },
    { group: 'rbac.authorization.k8s.io', version: 'v1', kind: 'ClusterRoleBinding', plural: 'clusterrolebindings', namespaced: false, category: 'auth' },
];
export const POLICY_RESOURCE_TYPES = [
    { group: 'policy', version: 'v1', kind: 'PodDisruptionBudget', plural: 'poddisruptionbudgets', namespaced: true, category: 'policy' },
];
export const AUTOSCALING_RESOURCE_TYPES = [
    { group: 'autoscaling', version: 'v1', kind: 'HorizontalPodAutoscaler', plural: 'horizontalpodautoscalers', namespaced: true, category: 'autoscaling' },
    { group: 'autoscaling', version: 'v2', kind: 'HorizontalPodAutoscaler', plural: 'horizontalpodautoscalers', namespaced: true, category: 'autoscaling' },
];
export const SCHEDULING_RESOURCE_TYPES = [
    { group: 'scheduling.k8s.io', version: 'v1', kind: 'PriorityClass', plural: 'priorityclasses', namespaced: false, category: 'scheduling' },
];
export const NODE_RESOURCE_TYPES = [
    { group: 'node.k8s.io', version: 'v1', kind: 'RuntimeClass', plural: 'runtimeclasses', namespaced: false, category: 'cluster' },
];
export const CERTIFICATES_RESOURCE_TYPES = [
    { group: 'certificates.k8s.io', version: 'v1', kind: 'CertificateSigningRequest', plural: 'certificatesigningrequests', namespaced: false, category: 'auth' },
];
export const COORDINATION_RESOURCE_TYPES = [
    { group: 'coordination.k8s.io', version: 'v1', kind: 'Lease', plural: 'leases', namespaced: true, category: 'cluster', highVolume: true },
];
export const DISCOVERY_RESOURCE_TYPES = [
    { group: 'discovery.k8s.io', version: 'v1', kind: 'EndpointSlice', plural: 'endpointslices', namespaced: true, category: 'networking' },
];
export const EVENTS_RESOURCE_TYPES = [
    { group: 'events.k8s.io', version: 'v1', kind: 'Event', plural: 'events', namespaced: true, category: 'events', highVolume: true },
];
export const ADMISSION_RESOURCE_TYPES = [
    { group: 'admissionregistration.k8s.io', version: 'v1', kind: 'MutatingWebhookConfiguration', plural: 'mutatingwebhookconfigurations', namespaced: false, category: 'cluster' },
    { group: 'admissionregistration.k8s.io', version: 'v1', kind: 'ValidatingWebhookConfiguration', plural: 'validatingwebhookconfigurations', namespaced: false, category: 'cluster' },
];
export const API_REGISTRATION_RESOURCE_TYPES = [
    { group: 'apiregistration.k8s.io', version: 'v1', kind: 'APIService', plural: 'apiservices', namespaced: false, category: 'cluster' },
];
export const FLOWCONTROL_RESOURCE_TYPES = [
    { group: 'flowcontrol.apiserver.k8s.io', version: 'v1', kind: 'FlowSchema', plural: 'flowschemas', namespaced: false, category: 'cluster' },
    { group: 'flowcontrol.apiserver.k8s.io', version: 'v1', kind: 'PriorityLevelConfiguration', plural: 'prioritylevelconfigurations', namespaced: false, category: 'cluster' },
];
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
export function formatResourceTypeId(resourceType) {
    const group = resourceType.group || 'core';
    return `${group}.${resourceType.version}.${resourceType.kind}`;
}
export function parseResourceTypeId(id) {
    const parts = id.split('.');
    if (parts.length !== 3) {
        throw new Error(`Invalid resource type ID: ${id}. Expected format: group.version.Kind`);
    }
    const [group, version, kind] = parts;
    return {
        group: group === 'core' ? '' : (group ?? ''),
        version: version ?? '',
        kind: kind ?? '',
    };
}
export function findResourceType(id) {
    const { group, version, kind } = parseResourceTypeId(id);
    return ALL_STANDARD_RESOURCE_TYPES.find(rt => rt.group === group && rt.version === version && rt.kind === kind) || null;
}
export const COMMON_FILTERS = {
    excludeHighVolume: (rt) => !rt.highVolume,
    excludeSensitive: (rt) => !rt.sensitive,
    namespacedOnly: (rt) => rt.namespaced,
    clusterScopedOnly: (rt) => !rt.namespaced,
    workloadOnly: (rt) => rt.category === 'workload',
    excludeNoisy: (rt) => !['Event', 'Lease'].includes(rt.kind),
};
//# sourceMappingURL=resource-types.js.map