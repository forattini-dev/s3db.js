export interface ParsedRouteDefinition {
    method: string;
    path: string;
    originalKey: string;
}
export interface PathAuthRule {
    id?: string;
    path?: string;
    pattern?: string;
    required?: boolean;
    methods?: string[];
}
export interface NormalizedPathRule {
    id: string;
    pattern: string;
    required: boolean;
    methods: string[];
}
export interface AuthDriver {
    driver?: string;
    type?: string;
    config?: {
        resource?: string;
        headerName?: string;
        queryParam?: string;
        realm?: string;
        cookieName?: string;
        issuer?: string;
        audience?: string;
        openIdConnectUrl?: string;
        [key: string]: unknown;
    };
}
export interface AuthConfig {
    drivers?: AuthDriver[];
    pathRules?: PathAuthRule[];
    pathAuth?: boolean;
    jwt?: {
        enabled?: boolean;
    };
    apiKey?: {
        enabled?: boolean;
    };
    basic?: {
        enabled?: boolean;
    };
}
export interface ResourceConfigOptions {
    enabled?: boolean;
    methods?: string[];
    auth?: string[];
    versionPrefix?: string | boolean;
    routes?: Record<string, unknown>;
    relations?: Record<string, {
        expose?: boolean;
    }>;
}
export interface ResourceLike {
    name: string;
    version?: string;
    config?: {
        currentVersion?: string;
        versionPrefix?: string | boolean;
        description?: string | {
            resource?: string;
            attributes?: Record<string, string>;
        };
        attributes?: Record<string, unknown>;
        routes?: Record<string, unknown>;
        api?: Record<string, unknown>;
        [key: string]: unknown;
    };
    $schema: {
        attributes?: Record<string, unknown>;
        partitions?: Record<string, PartitionDefinition>;
        api?: {
            description?: string | {
                resource?: string;
                attributes?: Record<string, string>;
            };
            [key: string]: unknown;
        };
        description?: string | {
            resource?: string;
            attributes?: Record<string, string>;
        };
        [key: string]: unknown;
    };
    schema?: {
        _pluginAttributes?: Record<string, string[]>;
        [key: string]: unknown;
    };
    attributes?: Record<string, unknown>;
    _relations?: Record<string, unknown>;
}
export interface PartitionDefinition {
    fields?: Record<string, string>;
    [key: string]: unknown;
}
export interface DatabaseLike {
    resources: Record<string, ResourceLike>;
    pluginRegistry?: {
        relation?: RelationsPluginLike;
        RelationPlugin?: RelationsPluginLike;
        metrics?: MetricsPluginLike;
        MetricsPlugin?: MetricsPluginLike;
        [key: string]: unknown;
    };
}
export interface RelationsPluginLike {
    relations?: Record<string, Record<string, RelationConfig>>;
}
export interface RelationConfig {
    type: string;
    resource: string;
    partitionHint?: string;
    [key: string]: unknown;
}
export interface MetricsPluginLike {
    config?: {
        prometheus?: {
            enabled?: boolean;
            path?: string;
            mode?: string;
        };
    };
}
export interface ApiAppRoute {
    path: string;
    method: string;
    description?: string;
    summary?: string;
    operationId?: string;
    tags?: string[];
    responseSchema?: OpenAPISchemaObject;
    requestSchema?: OpenAPISchemaObject;
}
export interface ApiAppLike {
    getRoutes(): ApiAppRoute[];
}
export interface OpenAPIGeneratorConfig {
    title?: string;
    version?: string;
    description?: string;
    serverUrl?: string;
    auth?: AuthConfig;
    resources?: Record<string, ResourceConfigOptions>;
    versionPrefix?: string | boolean;
    basePath?: string;
    routes?: Record<string, unknown>;
    app?: ApiAppLike | null;
}
export interface OpenAPISchemaObject {
    type?: string;
    format?: string;
    description?: string;
    example?: unknown;
    default?: unknown;
    properties?: Record<string, OpenAPISchemaObject>;
    items?: OpenAPISchemaObject;
    required?: string[];
    enum?: unknown[];
    pattern?: string;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    minItems?: number;
    maxItems?: number;
    readOnly?: boolean;
    nullable?: boolean;
    oneOf?: OpenAPISchemaObject[];
    additionalProperties?: boolean | OpenAPISchemaObject;
    $ref?: string;
}
export interface OpenAPIParameter {
    name: string;
    in: 'query' | 'path' | 'header' | 'cookie';
    description?: string;
    required?: boolean;
    schema: OpenAPISchemaObject;
    example?: unknown;
}
export interface OpenAPIRequestBody {
    required?: boolean;
    content: {
        'application/json'?: {
            schema: OpenAPISchemaObject;
        };
    };
}
export interface OpenAPIResponse {
    description: string;
    content?: {
        'application/json'?: {
            schema: OpenAPISchemaObject;
        };
        'text/plain'?: {
            schema: OpenAPISchemaObject;
        };
    };
    headers?: Record<string, {
        description: string;
        schema: OpenAPISchemaObject;
    }>;
}
export interface OpenAPIOperation {
    tags?: string[];
    summary?: string;
    description?: string;
    operationId?: string;
    parameters?: OpenAPIParameter[];
    requestBody?: OpenAPIRequestBody;
    responses: Record<string, OpenAPIResponse>;
    security?: Array<Record<string, string[]>>;
}
export interface OpenAPIPathItem {
    get?: OpenAPIOperation;
    post?: OpenAPIOperation;
    put?: OpenAPIOperation;
    patch?: OpenAPIOperation;
    delete?: OpenAPIOperation;
    head?: OpenAPIOperation;
    options?: OpenAPIOperation;
}
export interface OpenAPISecurityScheme {
    type: string;
    scheme?: string;
    bearerFormat?: string;
    in?: string;
    name?: string;
    openIdConnectUrl?: string;
    description?: string;
}
export interface OpenAPITag {
    name: string;
    description?: string;
}
export interface OpenAPISpec {
    openapi: string;
    info: {
        title: string;
        version: string;
        description: string;
        contact?: {
            name?: string;
            url?: string;
        };
    };
    servers: Array<{
        url: string;
        description: string;
    }>;
    paths: Record<string, OpenAPIPathItem>;
    components: {
        schemas: Record<string, OpenAPISchemaObject>;
        securitySchemes: Record<string, OpenAPISecurityScheme>;
    };
    tags: OpenAPITag[];
}
type SecurityResolver = (path: string) => Array<Record<string, string[]>> | null;
export declare function generateResourceSchema(resource: ResourceLike): OpenAPISchemaObject;
interface ResourcePathsConfig {
    basePath?: string;
    versionPrefix?: string | boolean;
    methods?: string[];
    auth?: string[];
    resolveSecurityForPath?: SecurityResolver | null;
}
export declare function generateResourcePaths(resource: ResourceLike, version: string, config?: ResourcePathsConfig): Record<string, OpenAPIPathItem>;
export declare function generateOpenAPISpec(database: DatabaseLike, config?: OpenAPIGeneratorConfig): OpenAPISpec;
declare const _default: {
    generateOpenAPISpec: typeof generateOpenAPISpec;
    generateResourceSchema: typeof generateResourceSchema;
    generateResourcePaths: typeof generateResourcePaths;
};
export default _default;
//# sourceMappingURL=openapi-generator.d.ts.map