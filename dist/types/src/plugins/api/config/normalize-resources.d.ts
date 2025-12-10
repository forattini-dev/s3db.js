import type { Logger } from '../../../concerns/logger.js';
export interface ResourceEntry {
    name: string;
    enabled?: boolean;
    methods?: string[];
    auth?: string[];
    versionPrefix?: string | boolean;
    [key: string]: unknown;
}
export interface NormalizedResourceConfig {
    enabled?: boolean;
    methods?: string[];
    auth?: string[];
    versionPrefix?: string | boolean;
    [key: string]: unknown;
}
export type ResourcesInput = string[] | ResourceEntry[] | Record<string, boolean | NormalizedResourceConfig | null | undefined> | null | undefined;
export declare function normalizeResourcesConfig(resources: ResourcesInput, logger: Logger | null): Record<string, NormalizedResourceConfig>;
//# sourceMappingURL=normalize-resources.d.ts.map