import type { StringRecord } from '../types/common.types.js';
export interface PartitionFieldsDef {
    [fieldName: string]: string;
}
export interface PartitionDef {
    fields?: PartitionFieldsDef;
}
export interface PartitionsConfig {
    [partitionName: string]: PartitionDef;
}
export interface HooksConfig {
    [event: string]: unknown[];
}
export interface EventsConfig {
    [eventName: string]: ((...args: unknown[]) => void) | Array<(...args: unknown[]) => void>;
}
export interface IncrementalIdGeneratorConfig {
    type: 'incremental';
    [key: string]: unknown;
}
export type IdGeneratorConfig = ((...args: unknown[]) => string) | number | string | IncrementalIdGeneratorConfig;
export interface ResourceConfigInput {
    name?: string;
    client?: unknown;
    attributes?: StringRecord;
    version?: string;
    behavior?: string;
    passphrase?: string;
    observers?: unknown[];
    cache?: boolean;
    autoDecrypt?: boolean;
    timestamps?: boolean;
    paranoid?: boolean;
    allNestedObjectsOptional?: boolean;
    idGenerator?: IdGeneratorConfig;
    idSize?: number;
    partitions?: PartitionsConfig;
    hooks?: HooksConfig;
    events?: EventsConfig;
    [key: string]: unknown;
}
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}
export declare function validateResourceConfig(config: ResourceConfigInput): ValidationResult;
export default validateResourceConfig;
//# sourceMappingURL=resource-config-validator.d.ts.map