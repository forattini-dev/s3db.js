import type { StringRecord } from '../types/common.types.js';
export interface Logger {
    error(context: StringRecord, message: string): void;
}
export interface Resource {
    name: string;
    logger?: Logger;
}
export interface JWTUser {
    scope?: string;
    azp?: string;
    resource_access?: {
        [clientId: string]: {
            roles?: string[];
        };
    };
    realm_access?: {
        roles?: string[];
    };
    roles?: string[];
    [key: string]: unknown;
}
export interface GuardContext {
    user?: JWTUser;
    params?: StringRecord;
    body?: unknown;
    query?: StringRecord;
    headers?: StringRecord;
    setPartition?: (partition: string, values?: StringRecord) => void;
}
export type GuardFunction = (context: GuardContext, record?: unknown) => boolean | Promise<boolean>;
export type GuardValue = boolean | string[] | GuardFunction;
export interface GuardConfig {
    [operation: string]: GuardValue;
}
export interface ResourceGuardsConfig {
    guard?: GuardConfig | string[];
}
export declare class ResourceGuards {
    resource: Resource;
    private _guard;
    constructor(resource: Resource, config?: ResourceGuardsConfig);
    getGuard(): GuardConfig | null;
    private _normalize;
    execute(operation: string, context: GuardContext, record?: unknown): Promise<boolean>;
    private _checkRolesScopes;
    hasGuard(operation: string): boolean;
    setGuard(guard: GuardConfig | string[]): void;
}
export default ResourceGuards;
//# sourceMappingURL=resource-guards.class.d.ts.map