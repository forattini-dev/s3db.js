export interface K8sResourceType {
    group: string;
    version: string;
    kind: string;
    plural: string;
    namespaced: boolean;
    category: string;
    sensitive?: boolean;
    highVolume?: boolean;
    isCRD?: boolean;
    crdName?: string;
}
export declare const CORE_RESOURCE_TYPES: K8sResourceType[];
export declare const APPS_RESOURCE_TYPES: K8sResourceType[];
export declare const BATCH_RESOURCE_TYPES: K8sResourceType[];
export declare const NETWORKING_RESOURCE_TYPES: K8sResourceType[];
export declare const STORAGE_RESOURCE_TYPES: K8sResourceType[];
export declare const RBAC_RESOURCE_TYPES: K8sResourceType[];
export declare const POLICY_RESOURCE_TYPES: K8sResourceType[];
export declare const AUTOSCALING_RESOURCE_TYPES: K8sResourceType[];
export declare const SCHEDULING_RESOURCE_TYPES: K8sResourceType[];
export declare const NODE_RESOURCE_TYPES: K8sResourceType[];
export declare const CERTIFICATES_RESOURCE_TYPES: K8sResourceType[];
export declare const COORDINATION_RESOURCE_TYPES: K8sResourceType[];
export declare const DISCOVERY_RESOURCE_TYPES: K8sResourceType[];
export declare const EVENTS_RESOURCE_TYPES: K8sResourceType[];
export declare const ADMISSION_RESOURCE_TYPES: K8sResourceType[];
export declare const API_REGISTRATION_RESOURCE_TYPES: K8sResourceType[];
export declare const FLOWCONTROL_RESOURCE_TYPES: K8sResourceType[];
export declare const ALL_STANDARD_RESOURCE_TYPES: K8sResourceType[];
export declare const RESOURCE_TYPES_BY_CATEGORY: Record<string, K8sResourceType[]>;
export declare function formatResourceTypeId(resourceType: K8sResourceType): string;
export interface ParsedResourceTypeId {
    group: string;
    version: string;
    kind: string;
}
export declare function parseResourceTypeId(id: string): ParsedResourceTypeId;
export declare function findResourceType(id: string): K8sResourceType | null;
export type ResourceTypeFilter = (rt: K8sResourceType) => boolean;
export declare const COMMON_FILTERS: Record<string, ResourceTypeFilter>;
//# sourceMappingURL=resource-types.d.ts.map