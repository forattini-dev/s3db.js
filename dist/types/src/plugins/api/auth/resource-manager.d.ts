import type { Logger } from '../../../concerns/logger.js';
export interface ResourceSchema {
    attributes: Record<string, string>;
}
export interface ResourceLike {
    name: string;
    schema: ResourceSchema;
    partitions?: Record<string, unknown>;
    query: (filter: Record<string, unknown>, options?: {
        limit?: number;
    }) => Promise<unknown[]>;
    listPartition?: (partitionName: string, filter: Record<string, unknown>, options?: {
        limit?: number;
    }) => Promise<unknown[]>;
    patch?: (id: string, data: Record<string, unknown>) => Promise<unknown>;
    [key: string]: unknown;
}
export interface DatabaseLike {
    resources: Record<string, ResourceLike>;
    createResource: (config: {
        name: string;
        attributes: Record<string, string>;
        behavior?: string;
        timestamps?: boolean;
        createdBy?: string;
    }) => Promise<ResourceLike>;
}
export interface AuthResourceConfig {
    resource?: string;
    createResource?: boolean;
    userField?: string;
    passwordField?: string;
    usernameField?: string;
    keyField?: string;
    [key: string]: unknown;
}
export declare class AuthResourceManager {
    protected database: DatabaseLike;
    protected driverName: string;
    protected config: AuthResourceConfig;
    protected logger: Logger;
    constructor(database: DatabaseLike, driverName: string, config: AuthResourceConfig);
    getOrCreateResource(): Promise<ResourceLike>;
    getDefaultResourceName(): string;
    getRequiredFieldNames(): string[];
    validateResourceFields(resource: ResourceLike): void;
    createDefaultResource(resourceName: string): Promise<ResourceLike>;
    getMinimalSchema(): Record<string, string>;
}
export declare class JWTResourceManager extends AuthResourceManager {
    getMinimalSchema(): Record<string, string>;
}
export declare class APIKeyResourceManager extends AuthResourceManager {
    getMinimalSchema(): Record<string, string>;
}
export declare class BasicAuthResourceManager extends AuthResourceManager {
    getMinimalSchema(): Record<string, string>;
}
export declare class OAuth2ResourceManager extends AuthResourceManager {
    getMinimalSchema(): Record<string, string>;
}
export declare class OIDCResourceManager extends AuthResourceManager {
    getMinimalSchema(): Record<string, string>;
}
//# sourceMappingURL=resource-manager.d.ts.map