import { ResourcesConfig, ResourceConfig } from './resource-schemas.js';
export interface PreparedResourceConfigs {
    users: {
        userConfig: ResourceConfig | undefined;
        mergedConfig: ResourceConfig | null;
    };
    tenants: {
        userConfig: ResourceConfig | undefined;
        mergedConfig: ResourceConfig | null;
    };
    clients: {
        userConfig: ResourceConfig | undefined;
        mergedConfig: ResourceConfig | null;
    };
}
export declare function prepareResourceConfigs(resourcesOptions?: ResourcesConfig): PreparedResourceConfigs;
//# sourceMappingURL=config.d.ts.map