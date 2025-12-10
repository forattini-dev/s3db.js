import { Plugin, type PluginConfig } from '../plugin.class.js';
import { EventEmitter } from 'events';
interface ImporterDriverConfig {
    [key: string]: unknown;
}
interface ParseError {
    line?: number;
    row?: number;
    message: string;
    data?: string;
    record?: Record<string, unknown>;
    error?: Error;
}
interface ProgressEvent {
    processed: number;
    inserted: number;
    skipped: number;
    errors: number;
    percent: number;
    total?: number;
    recordsPerSecond?: number;
}
interface ImportResult {
    processed: number;
    inserted: number;
    skipped: number;
    errors: number;
    duplicates: number;
    duration: number;
}
interface ImportStats {
    totalProcessed: number;
    totalInserted: number;
    totalSkipped: number;
    totalErrors: number;
    totalDuplicates: number;
    startTime: number | null;
    endTime: number | null;
}
interface ParseOptions {
    delimiter?: string;
    hasHeader?: boolean;
    [key: string]: unknown;
}
interface BinaryFieldSchema {
    type: 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'int8' | 'int16' | 'int32' | 'int64' | 'float32' | 'float64';
    offset: number;
}
interface BinarySchema {
    [fieldName: string]: BinaryFieldSchema;
}
type TransformFunction = (value: unknown, record: Record<string, unknown>) => unknown;
type ValidateFunction = (record: Record<string, unknown>) => boolean;
interface ImporterPluginOptions extends PluginConfig {
    resource?: string;
    resourceName?: string;
    format?: string;
    mapping?: Record<string, string>;
    transforms?: Record<string, TransformFunction>;
    validate?: ValidateFunction | null;
    deduplicateBy?: string | null;
    batchSize?: number;
    parallelism?: number;
    continueOnError?: boolean;
    streaming?: boolean;
    driverConfig?: ImporterDriverConfig;
    sheet?: string | number;
    headerRow?: number;
    startRow?: number;
    binarySchema?: BinarySchema | null;
    recordSize?: number | null;
}
declare abstract class ImporterDriver extends EventEmitter {
    protected config: ImporterDriverConfig;
    constructor(config?: ImporterDriverConfig);
    abstract parse(filePath: string, options?: ParseOptions): AsyncGenerator<Record<string, unknown>>;
    validate(filePath: string): Promise<boolean>;
}
declare class JSONImportDriver extends ImporterDriver {
    parse(filePath: string, options?: ParseOptions): AsyncGenerator<Record<string, unknown>>;
    validate(filePath: string): Promise<boolean>;
}
declare class CSVImportDriver extends ImporterDriver {
    parse(filePath: string, options?: ParseOptions): AsyncGenerator<Record<string, unknown>>;
    private _parseLine;
    private _detectDelimiter;
    validate(filePath: string): Promise<boolean>;
}
declare class ParquetImportDriver extends ImporterDriver {
    parse(filePath: string, options?: ParseOptions): AsyncGenerator<Record<string, unknown>>;
}
declare class ExcelImportDriver extends ImporterDriver {
    parse(filePath: string, options?: ParseOptions): AsyncGenerator<Record<string, unknown>>;
}
export declare class ImporterPlugin extends Plugin {
    private resourceName;
    private format;
    private mapping;
    private transforms;
    private validateFn;
    private deduplicateBy;
    private batchSize;
    private parallelism;
    private continueOnError;
    private streaming;
    private driverConfig;
    private sheet;
    private headerRow;
    private startRow;
    private binarySchema;
    private recordSize;
    private resource;
    private driver;
    private seenKeys;
    private stats;
    constructor(config?: ImporterPluginOptions);
    onInstall(): Promise<void>;
    private _createDriver;
    import(filePath: string, options?: ParseOptions): Promise<ImportResult>;
    private _mapRecord;
    private _transformRecord;
    private _processBatch;
    getStats(): ImportStats & {
        recordsPerSecond: number;
    };
}
export declare const Transformers: {
    parseDate: (format?: string) => (value: unknown) => number;
    parseFloat: (decimals?: number) => (value: unknown) => number;
    parseInt: () => (value: unknown) => number;
    toLowerCase: () => (value: unknown) => string;
    toUpperCase: () => (value: unknown) => string;
    split: (delimiter?: string) => (value: unknown) => string[];
    parseJSON: () => (value: unknown) => unknown;
    trim: () => (value: unknown) => string;
};
export { ImporterDriver, JSONImportDriver, CSVImportDriver, ParquetImportDriver, ExcelImportDriver };
export type { ImporterDriverConfig, ParseError, ProgressEvent, ImportResult, ImportStats, ParseOptions, BinaryFieldSchema, BinarySchema, TransformFunction, ValidateFunction, ImporterPluginOptions };
//# sourceMappingURL=index.d.ts.map