import type { Client } from '../clients/types.js';
import type { Logger } from '../concerns/logger.js';
export interface Resource {
    name: string;
    client: Client;
    logger?: Logger;
}
export interface IncrementalConfig {
    type: 'incremental';
    start?: number;
    prefix?: string;
    mode?: 'fast' | 'normal';
    [key: string]: unknown;
}
export type IdGeneratorConfig = ((data?: unknown) => string) | number | string | IncrementalConfig;
export interface ResourceIdGeneratorConfig {
    idGenerator?: IdGeneratorConfig;
    idSize?: number;
}
export interface SequenceInterface {
    getValue(fieldName: string): Promise<number>;
    reset(fieldName: string, value: number): Promise<boolean>;
    list(): Promise<SequenceInfo[]>;
    reserveBatch(fieldName: string, count: number): Promise<BatchInfo>;
    getBatchStatus(fieldName: string): BatchStatus | null;
    releaseBatch(fieldName: string): void;
}
export interface SequenceInfo {
    fieldName: string;
    currentValue: number;
}
export interface BatchInfo {
    start: number;
    end: number;
    current: number;
}
export interface BatchStatus {
    start: number;
    end: number;
    current: number;
    remaining: number;
    [key: string]: unknown;
}
export type IdGeneratorFunction = ((data?: unknown) => string) | ((data?: unknown) => Promise<string>);
export type IncrementalGenerator = IdGeneratorFunction & {
    _sequence?: SequenceInterface;
};
export declare class ResourceIdGenerator {
    resource: Resource;
    idSize: number;
    private _incrementalConfig;
    private _asyncIdGenerator;
    private _generator;
    constructor(resource: Resource, config?: ResourceIdGeneratorConfig);
    private _configureGenerator;
    initIncremental(): void;
    isAsync(): boolean;
    getGenerator(): IncrementalGenerator | null;
    generate(data?: unknown): string | Promise<string>;
    getType(customIdGenerator?: IdGeneratorConfig, idSize?: number): string;
    getSequenceValue(fieldName?: string): Promise<number | null>;
    resetSequence(fieldName: string, value: number): Promise<boolean>;
    listSequences(): Promise<SequenceInfo[] | null>;
    reserveIdBatch(count?: number): Promise<BatchInfo | null>;
    getBatchStatus(fieldName?: string): BatchStatus | null;
    releaseBatch(fieldName?: string): void;
}
export default ResourceIdGenerator;
//# sourceMappingURL=resource-id-generator.class.d.ts.map