import { getCacheStats, getCacheMemoryUsage } from "./concerns/validator-cache.js";
export type AttributeValue = string | number | boolean | null | undefined | Record<string, unknown> | unknown[];
export interface SchemaAttributes {
    [key: string]: AttributeValue | SchemaAttributes;
}
export interface AttributeMapping {
    [key: string]: string;
}
export interface PluginAttributeMetadata {
    [key: string]: {
        __plugin__: string;
        [key: string]: unknown;
    };
}
export interface PluginAttributes {
    [pluginName: string]: string[];
}
export interface HookEntry {
    action: string;
    params: Record<string, unknown>;
}
export interface SchemaHooks {
    beforeMap: Record<string, (string | HookEntry)[]>;
    afterMap: Record<string, (string | HookEntry)[]>;
    beforeUnmap: Record<string, (string | HookEntry)[]>;
    afterUnmap: Record<string, (string | HookEntry)[]>;
}
export interface SchemaOptions {
    autoEncrypt?: boolean;
    autoDecrypt?: boolean;
    arraySeparator?: string;
    generateAutoHooks?: boolean;
    allNestedObjectsOptional?: boolean;
    hooks?: SchemaHooks;
}
export interface SchemaConstructorArgs {
    map?: AttributeMapping;
    pluginMap?: AttributeMapping;
    name: string;
    attributes?: SchemaAttributes;
    passphrase?: string;
    bcryptRounds?: number;
    version?: number;
    options?: SchemaOptions;
    _pluginAttributeMetadata?: PluginAttributeMetadata;
    _pluginAttributes?: PluginAttributes;
    /** Existing schema registry from s3db.json - if provided, indices are preserved */
    schemaRegistry?: SchemaRegistry;
    /** Existing plugin schema registry from s3db.json (accepts both legacy numeric and new string-key formats) */
    pluginSchemaRegistry?: Record<string, PluginSchemaRegistry | SchemaRegistry>;
}
export interface SchemaExport {
    version: number;
    name: string;
    options: SchemaOptions;
    attributes: SchemaAttributes;
    map: AttributeMapping;
    pluginMap: AttributeMapping;
    _pluginAttributeMetadata: PluginAttributeMetadata;
    _pluginAttributes: PluginAttributes;
}
export interface ActionContext {
    passphrase?: string;
    bcryptRounds?: number;
    separator?: string;
    precision?: number;
    decimals?: number;
    bitCount?: number | null;
    [key: string]: unknown;
}
/**
 * Schema Registry - Persistent attribute index mapping (Protocol Buffers style).
 * Prevents data corruption when adding/removing attributes by assigning
 * permanent indices that never change once assigned.
 */
export interface SchemaRegistry {
    /** Next available index for new attributes */
    nextIndex: number;
    /** Permanent mapping of attribute path to numeric index */
    mapping: Record<string, number>;
    /** Indices that were used but attribute was removed - never reused */
    burned: Array<{
        index: number;
        attribute: string;
        burnedAt: string;
        reason?: string;
    }>;
}
/**
 * Plugin Schema Registry - Stores actual key strings for plugin attributes.
 * Unlike user attributes (which use numeric indices → base62), plugin attributes
 * use SHA256 hash-based keys that must be preserved exactly.
 */
export interface PluginSchemaRegistry {
    /** Permanent mapping of attribute name to full key string (e.g., "_createdAt" → "p1a2") */
    mapping: Record<string, string>;
    /** Keys that were used but attribute was removed - never reused */
    burned: Array<{
        key: string;
        attribute: string;
        burnedAt: string;
        reason?: string;
    }>;
}
type ValidatorFunction = (data: Record<string, unknown>) => Promise<true | Record<string, unknown>[]> | true | Record<string, unknown>[];
export declare const SchemaActions: {
    trim: (value: unknown) => unknown;
    encrypt: (value: unknown, { passphrase }: ActionContext) => Promise<unknown>;
    decrypt: (value: unknown, { passphrase }: ActionContext) => Promise<unknown>;
    hashPassword: (value: unknown, { bcryptRounds }: ActionContext) => Promise<unknown>;
    toString: (value: unknown) => unknown;
    fromArray: (value: unknown, { separator }: ActionContext) => unknown;
    toArray: (value: unknown, { separator }: ActionContext) => unknown;
    toJSON: (value: unknown) => unknown;
    fromJSON: (value: unknown) => unknown;
    toNumber: (value: unknown) => unknown;
    toBool: (value: unknown) => boolean;
    fromBool: (value: unknown) => string;
    fromBase62: (value: unknown) => unknown;
    toBase62: (value: unknown) => unknown;
    fromBase62Decimal: (value: unknown) => unknown;
    toBase62Decimal: (value: unknown) => unknown;
    fromArrayOfNumbers: (value: unknown, { separator }: ActionContext) => unknown;
    toArrayOfNumbers: (value: unknown, { separator }: ActionContext) => unknown;
    fromArrayOfDecimals: (value: unknown, { separator }: ActionContext) => unknown;
    toArrayOfDecimals: (value: unknown, { separator }: ActionContext) => unknown;
    fromArrayOfEmbeddings: (value: unknown, { precision }: ActionContext) => unknown;
    toArrayOfEmbeddings: (value: unknown, { separator, precision }: ActionContext) => unknown;
    encodeIPv4: (value: unknown) => unknown;
    decodeIPv4: (value: unknown) => unknown;
    encodeIPv6: (value: unknown) => unknown;
    decodeIPv6: (value: unknown) => unknown;
    encodeBuffer: (value: unknown) => unknown;
    decodeBuffer: (value: unknown) => unknown;
    encodeBits: (value: unknown, { bitCount }?: ActionContext) => unknown;
    decodeBits: (value: unknown, { bitCount }?: ActionContext) => unknown;
    encodeMoney: (value: unknown, { decimals }?: ActionContext) => unknown;
    decodeMoney: (value: unknown, { decimals }?: ActionContext) => unknown;
    encodeDecimalFixed: (value: unknown, { precision }?: ActionContext) => unknown;
    decodeDecimalFixed: (value: unknown, { precision }?: ActionContext) => unknown;
    encodeGeoLatitude: (value: unknown, { precision }?: ActionContext) => unknown;
    decodeGeoLatitude: (value: unknown, { precision }?: ActionContext) => unknown;
    encodeGeoLongitude: (value: unknown, { precision }?: ActionContext) => unknown;
    decodeGeoLongitude: (value: unknown, { precision }?: ActionContext) => unknown;
    encodeGeoPointPair: (value: unknown, { precision }?: ActionContext) => unknown;
    decodeGeoPointPair: (value: unknown, { precision }?: ActionContext) => unknown;
};
export declare class Schema {
    name: string;
    version: number;
    attributes: SchemaAttributes;
    passphrase: string;
    bcryptRounds: number;
    options: SchemaOptions;
    allNestedObjectsOptional: boolean;
    _pluginAttributeMetadata: PluginAttributeMetadata;
    _pluginAttributes: PluginAttributes;
    _schemaFingerprint: string;
    validator: ValidatorFunction;
    map: AttributeMapping;
    reversedMap: AttributeMapping;
    pluginMap: AttributeMapping;
    reversedPluginMap: AttributeMapping;
    /** Updated schema registry - should be persisted to s3db.json */
    _schemaRegistry?: SchemaRegistry;
    /** Updated plugin schema registries - should be persisted to s3db.json */
    _pluginSchemaRegistry?: Record<string, PluginSchemaRegistry>;
    /** Whether the registry was modified and needs persistence */
    _registryChanged: boolean;
    constructor(args: SchemaConstructorArgs);
    defaultOptions(): SchemaOptions;
    private _buildRegistryFromMap;
    /**
     * Generate initial schema registry from current mapping.
     * Used for migrating existing databases that don't have a registry yet.
     * This "freezes" the current mapping as the source of truth.
     */
    generateInitialRegistry(): {
        schemaRegistry: SchemaRegistry;
        pluginSchemaRegistry: Record<string, PluginSchemaRegistry>;
    };
    /**
     * Check if the schema registry needs to be persisted.
     */
    needsRegistryPersistence(): boolean;
    /**
     * Get the updated schema registry for persistence.
     */
    getSchemaRegistry(): SchemaRegistry | undefined;
    /**
     * Get the updated plugin schema registries for persistence.
     */
    getPluginSchemaRegistry(): Record<string, PluginSchemaRegistry> | undefined;
    addHook(hook: keyof SchemaHooks, attribute: string, action: string, params?: Record<string, unknown>): void;
    extractObjectKeys(obj: Record<string, unknown>, prefix?: string): string[];
    _generateHooksFromOriginalAttributes(attributes: Record<string, unknown>, prefix?: string): void;
    generateAutoHooks(): void;
    static import(data: string | SchemaExport): Schema;
    static _importAttributes(attrs: unknown): unknown;
    export(): SchemaExport;
    _exportAttributes(attrs: unknown): SchemaAttributes;
    applyHooksActions(resourceItem: Record<string, unknown>, hook: keyof SchemaHooks): Promise<Record<string, unknown>>;
    validate(resourceItem: Record<string, unknown>, { mutateOriginal }?: {
        mutateOriginal?: boolean | undefined;
    }): Promise<true | Record<string, unknown>[]>;
    mapper(resourceItem: Record<string, unknown>): Promise<Record<string, unknown>>;
    unmapper(mappedResourceItem: Record<string, unknown>, mapOverride?: AttributeMapping, pluginMapOverride?: AttributeMapping): Promise<Record<string, unknown>>;
    getAttributeDefinition(key: string): unknown;
    regeneratePluginMapping(): void;
    preprocessAttributesForValidation(attributes: SchemaAttributes): Record<string, unknown>;
    dispose(): void;
    static getValidatorCacheStats(): ReturnType<typeof getCacheStats>;
    static getValidatorCacheMemoryUsage(): ReturnType<typeof getCacheMemoryUsage>;
    static evictUnusedValidators(maxAgeMs?: number): number;
}
export default Schema;
//# sourceMappingURL=schema.class.d.ts.map