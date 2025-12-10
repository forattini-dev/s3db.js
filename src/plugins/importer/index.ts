import { Plugin, type PluginConfig } from '../plugin.class.js';
import { EventEmitter } from 'events';
import tryFn from '../../concerns/try-fn.js';
import * as fs from 'fs';
import * as readline from 'readline';
import zlib from 'node:zlib';
import { PluginError } from '../../errors.js';
import type { Readable } from 'stream';

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

interface Resource {
  insert: (record: Record<string, unknown>) => Promise<unknown>;
  [key: string]: unknown;
}

interface Database {
  resources: Record<string, Resource>;
  [key: string]: unknown;
}

abstract class ImporterDriver extends EventEmitter {
  protected config: ImporterDriverConfig;

  constructor(config: ImporterDriverConfig = {}) {
    super();
    this.config = config;
  }

  abstract parse(filePath: string, options?: ParseOptions): AsyncGenerator<Record<string, unknown>>;

  async validate(filePath: string): Promise<boolean> {
    return true;
  }
}

class JSONImportDriver extends ImporterDriver {
  async *parse(filePath: string, options: ParseOptions = {}): AsyncGenerator<Record<string, unknown>> {
    const isGzipped = filePath.endsWith('.gz');

    let fileStream: Readable = fs.createReadStream(filePath);

    if (isGzipped) {
      const gunzip = zlib.createGunzip();
      fileStream = fileStream.pipe(gunzip);
      fileStream.setEncoding('utf8');
    } else {
      (fileStream as fs.ReadStream).setEncoding('utf8');
    }

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let buffer = '';
    let inArray = false;
    let lineNumber = 0;
    let firstNonEmpty = true;

    for await (const line of rl) {
      lineNumber++;
      const trimmed = line.trim();

      if (!trimmed) continue;

      if (firstNonEmpty) {
        firstNonEmpty = false;
        if (trimmed.startsWith('[')) {
          inArray = true;
          buffer = trimmed;

          if (trimmed.endsWith(']')) {
            try {
              const array = JSON.parse(buffer);
              if (Array.isArray(array)) {
                for (const record of array) {
                  yield record;
                }
              } else {
                throw new PluginError('JSON import expects an array of objects', {
                  pluginName: 'ImporterPlugin',
                  operation: 'JSONImportDriver.parse',
                  statusCode: 400,
                  retriable: false,
                  suggestion: 'Ensure the JSON file contains an array at the root (e.g., [ {...}, {...} ]).'
                });
              }
            } catch (error) {
              const err = error as Error;
              throw new PluginError(`Failed to parse JSON array: ${err.message}`, {
                pluginName: 'ImporterPlugin',
                operation: 'JSONImportDriver.parse',
                statusCode: 400,
                retriable: false,
                suggestion: 'Validate JSON syntax; consider using jsonlint before importing.',
                original: err
              });
            }
            buffer = '';
            inArray = false;
          }
          continue;
        }
      }

      if (inArray) {
        buffer += '\n' + trimmed;

        if (trimmed === ']' || trimmed.endsWith(']')) {
          try {
            const array = JSON.parse(buffer);
            if (Array.isArray(array)) {
              for (const record of array) {
                yield record;
              }
            } else {
              throw new PluginError('JSON import expects an array of objects', {
                pluginName: 'ImporterPlugin',
                operation: 'JSONImportDriver.parse',
                statusCode: 400,
                retriable: false,
                suggestion: 'Ensure the JSON file contains an array at the root (e.g., [ {...}, {...} ]).'
              });
            }
          } catch (error) {
            const err = error as Error;
            throw new PluginError(`Failed to parse JSON array: ${err.message}`, {
              pluginName: 'ImporterPlugin',
              operation: 'JSONImportDriver.parse',
              statusCode: 400,
              retriable: false,
              suggestion: 'Validate JSON syntax; consider using jsonlint before importing.',
              original: err
            });
          }
          buffer = '';
          inArray = false;
        }
      } else {
        try {
          const record = JSON.parse(trimmed);
          yield record;
        } catch (error) {
          const err = error as Error;
          if (this.listenerCount('error') > 0) {
            this.emit('error', {
              line: lineNumber,
              message: `Invalid JSON on line ${lineNumber}: ${err.message}`,
              data: trimmed
            } as ParseError);
          }
        }
      }
    }
  }

  override async validate(filePath: string): Promise<boolean> {
    if (!fs.existsSync(filePath)) {
      throw new PluginError(`File not found: ${filePath}`, {
        pluginName: 'ImporterPlugin',
        operation: 'JSONImportDriver.validate',
        statusCode: 404,
        retriable: false,
        suggestion: 'Verify the file path before importing or ensure the file is accessible to the process.',
        filePath
      });
    }

    const lowerPath = filePath.toLowerCase();
    if (lowerPath.endsWith('.gz')) {
      const parts = lowerPath.split('.');
      if (parts.length < 3) {
        throw new PluginError('Invalid file extension for JSON driver: .gz without format extension', {
          pluginName: 'ImporterPlugin',
          operation: 'JSONImportDriver.validate',
          statusCode: 400,
          retriable: false,
          suggestion: 'Rename the file to include the format before .gz (e.g., data.json.gz).',
          filePath
        });
      }
      const formatExt = parts[parts.length - 2]!;
      if (!['json', 'jsonl', 'ndjson'].includes(formatExt)) {
        throw new PluginError(`Invalid file extension for JSON driver: .${formatExt}.gz (expected .json.gz, .jsonl.gz, or .ndjson.gz)`, {
          pluginName: 'ImporterPlugin',
          operation: 'JSONImportDriver.validate',
          statusCode: 400,
          retriable: false,
          suggestion: 'Use supported extensions (.json, .jsonl, .ndjson) before .gz compression.',
          filePath
        });
      }
    } else {
      const ext = lowerPath.split('.').pop();
      if (!['json', 'jsonl', 'ndjson'].includes(ext!)) {
        throw new PluginError(`Invalid file extension for JSON driver: .${ext}`, {
          pluginName: 'ImporterPlugin',
          operation: 'JSONImportDriver.validate',
          statusCode: 400,
          retriable: false,
          suggestion: 'Rename the file to use .json, .jsonl, or .ndjson extensions.',
          filePath
        });
      }
    }

    return true;
  }
}

class CSVImportDriver extends ImporterDriver {
  async *parse(filePath: string, options: ParseOptions = {}): AsyncGenerator<Record<string, unknown>> {
    const delimiter = options.delimiter || await this._detectDelimiter(filePath);
    const hasHeader = options.hasHeader !== undefined ? options.hasHeader : true;

    const isGzipped = filePath.endsWith('.gz');

    let fileStream: Readable = fs.createReadStream(filePath);

    if (isGzipped) {
      const gunzip = zlib.createGunzip();
      fileStream = fileStream.pipe(gunzip);
      fileStream.setEncoding('utf8');
    } else {
      (fileStream as fs.ReadStream).setEncoding('utf8');
    }

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let headers: string[] | null = null;
    let lineNumber = 0;

    for await (const line of rl) {
      lineNumber++;

      if (!line.trim()) continue;

      const fields = this._parseLine(line, delimiter);

      if (lineNumber === 1 && hasHeader) {
        headers = fields;
        continue;
      }

      let record: Record<string, unknown>;
      if (headers) {
        record = {};
        for (let i = 0; i < Math.min(headers.length, fields.length); i++) {
          record[headers[i]!] = fields[i];
        }
      } else {
        record = Object.fromEntries(fields.map((val, idx) => [String(idx), val]));
      }

      yield record;
    }
  }

  private _parseLine(line: string, delimiter: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    fields.push(current.trim());

    return fields;
  }

  private async _detectDelimiter(filePath: string): Promise<string> {
    const isGzipped = filePath.endsWith('.gz');

    let fileStream: Readable = fs.createReadStream(filePath);

    if (isGzipped) {
      const gunzip = zlib.createGunzip();
      fileStream = fileStream.pipe(gunzip);
      fileStream.setEncoding('utf8');
    } else {
      (fileStream as fs.ReadStream).setEncoding('utf8');
    }

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const delimiters = [',', ';', '\t', '|'];
    const counts: Record<string, number> = {};

    let linesRead = 0;
    for await (const line of rl) {
      if (linesRead >= 5) break;
      linesRead++;

      for (const delimiter of delimiters) {
        counts[delimiter] = (counts[delimiter] || 0) + (line.split(delimiter).length - 1);
      }
    }

    (fileStream as fs.ReadStream).destroy?.();

    let maxCount = 0;
    let bestDelimiter = ',';
    for (const [delimiter, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        bestDelimiter = delimiter;
      }
    }

    return bestDelimiter;
  }

  override async validate(filePath: string): Promise<boolean> {
    if (!fs.existsSync(filePath)) {
      throw new PluginError(`File not found: ${filePath}`, {
        pluginName: 'ImporterPlugin',
        operation: 'CSVImportDriver.validate',
        statusCode: 404,
        retriable: false,
        suggestion: 'Verify the CSV file path or download it locally before importing.',
        filePath
      });
    }

    const lowerPath = filePath.toLowerCase();
    if (lowerPath.endsWith('.gz')) {
      const parts = lowerPath.split('.');
      if (parts.length < 3) {
        throw new PluginError('Invalid file extension for CSV driver: .gz without format extension', {
          pluginName: 'ImporterPlugin',
          operation: 'CSVImportDriver.validate',
          statusCode: 400,
          retriable: false,
          suggestion: 'Rename the file to include .csv or .tsv before .gz (e.g., data.csv.gz).',
          filePath
        });
      }
      const formatExt = parts[parts.length - 2]!;
      if (!['csv', 'tsv', 'txt'].includes(formatExt)) {
        throw new PluginError(`Invalid file extension for CSV driver: .${formatExt}.gz (expected .csv.gz or .tsv.gz)`, {
          pluginName: 'ImporterPlugin',
          operation: 'CSVImportDriver.validate',
          statusCode: 400,
          retriable: false,
          suggestion: 'Use supported extensions (.csv, .tsv, .txt) before gzip compression.',
          filePath
        });
      }
    } else {
      const ext = lowerPath.split('.').pop();
      if (!['csv', 'tsv', 'txt'].includes(ext!)) {
        throw new PluginError(`Invalid file extension for CSV driver: .${ext}`, {
          pluginName: 'ImporterPlugin',
          operation: 'CSVImportDriver.validate',
          statusCode: 400,
          retriable: false,
          suggestion: 'Rename the file to use .csv, .tsv, or .txt extensions.',
          filePath
        });
      }
    }

    return true;
  }
}

class ParquetImportDriver extends ImporterDriver {
  async *parse(filePath: string, options: ParseOptions = {}): AsyncGenerator<Record<string, unknown>> {
    throw new PluginError('ParquetImportDriver not yet implemented', {
      pluginName: 'ImporterPlugin',
      operation: 'ParquetImportDriver.parse',
      statusCode: 501,
      retriable: false,
      suggestion: 'Parquet import support is under development. Convert data to CSV/JSON or implement a custom driver.'
    });
  }
}

class ExcelImportDriver extends ImporterDriver {
  async *parse(filePath: string, options: ParseOptions = {}): AsyncGenerator<Record<string, unknown>> {
    throw new PluginError('ExcelImportDriver not yet implemented', {
      pluginName: 'ImporterPlugin',
      operation: 'ExcelImportDriver.parse',
      statusCode: 501,
      retriable: false,
      suggestion: 'Convert Excel files to CSV/JSON or implement a custom Excel driver before importing.'
    });
  }
}

export class ImporterPlugin extends Plugin {
  private resourceName: string;
  private format: string;
  private mapping: Record<string, string>;
  private transforms: Record<string, TransformFunction>;
  private validateFn: ValidateFunction | null;
  private deduplicateBy: string | null;
  private batchSize: number;
  private parallelism: number;
  private continueOnError: boolean;
  private streaming: boolean;
  private driverConfig: ImporterDriverConfig;
  private sheet: string | number;
  private headerRow: number;
  private startRow: number;
  private binarySchema: BinarySchema | null;
  private recordSize: number | null;
  private resource: Resource | null = null;
  private driver: ImporterDriver | null = null;
  private seenKeys: Set<unknown> = new Set();
  private stats: ImportStats = {
    totalProcessed: 0,
    totalInserted: 0,
    totalSkipped: 0,
    totalErrors: 0,
    totalDuplicates: 0,
    startTime: null,
    endTime: null
  };

  constructor(config: ImporterPluginOptions = {}) {
    super(config);

    const opts = this.options as ImporterPluginOptions;

    this.resourceName = opts.resource || opts.resourceName || '';
    this.format = opts.format || 'json';
    this.mapping = opts.mapping || {};
    this.transforms = opts.transforms || {};
    this.validateFn = opts.validate || null;
    this.deduplicateBy = opts.deduplicateBy || null;
    this.batchSize = opts.batchSize || 1000;
    this.parallelism = opts.parallelism || 10;
    this.continueOnError = opts.continueOnError !== undefined ? opts.continueOnError : true;
    this.streaming = opts.streaming !== undefined ? opts.streaming : true;

    this.driverConfig = opts.driverConfig || {};

    this.sheet = opts.sheet || 0;
    this.headerRow = opts.headerRow || 0;
    this.startRow = opts.startRow || 1;

    this.binarySchema = opts.binarySchema || null;
    this.recordSize = opts.recordSize || null;
  }

  override async onInstall(): Promise<void> {
    try {
      const db = this.database as unknown as Database;
      this.resource = db.resources[this.resourceName] ?? null;
      if (this.resource && typeof (this.resource as unknown as Promise<Resource>).then === 'function') {
        this.resource = await (this.resource as unknown as Promise<Resource>);
      }
    } catch (error) {
      const err = error as Error;
      throw new PluginError(`Resource "${this.resourceName}" not found`, {
        pluginName: 'ImporterPlugin',
        operation: 'onInstall',
        statusCode: 404,
        retriable: false,
        suggestion: 'Create the target resource before running ImporterPlugin or update the configuration.',
        resourceName: this.resourceName,
        original: err
      });
    }

    if (!this.resource) {
      throw new PluginError(`Resource "${this.resourceName}" not found`, {
        pluginName: 'ImporterPlugin',
        operation: 'onInstall',
        statusCode: 404,
        retriable: false,
        suggestion: 'Create the target resource before running ImporterPlugin or update the configuration.',
        resourceName: this.resourceName
      });
    }

    this.driver = this._createDriver(this.format);

    this.emit('installed', {
      plugin: 'ImporterPlugin',
      resource: this.resourceName,
      format: this.format
    });
  }

  private _createDriver(format: string): ImporterDriver {
    switch (format.toLowerCase()) {
      case 'json':
      case 'jsonl':
      case 'ndjson':
        return new JSONImportDriver(this.driverConfig);
      case 'csv':
      case 'tsv':
        return new CSVImportDriver(this.driverConfig);
      case 'parquet':
        return new ParquetImportDriver(this.driverConfig);
      case 'excel':
      case 'xls':
      case 'xlsx':
        return new ExcelImportDriver(this.driverConfig);
      default:
        throw new PluginError(`Unsupported import format: ${format}`, {
          pluginName: 'ImporterPlugin',
          operation: '_createDriver',
          statusCode: 400,
          retriable: false,
          suggestion: 'Use one of the supported formats: json, jsonl, ndjson, csv, tsv, parquet, excel.',
          format
        });
    }
  }

  async import(filePath: string, options: ParseOptions = {}): Promise<ImportResult> {
    this.stats.startTime = Date.now();
    this.stats.totalProcessed = 0;
    this.stats.totalInserted = 0;
    this.stats.totalSkipped = 0;
    this.stats.totalErrors = 0;
    this.stats.totalDuplicates = 0;
    this.seenKeys.clear();

    try {
      await this.driver!.validate(filePath);

      let batch: Record<string, unknown>[] = [];

      for await (const record of this.driver!.parse(filePath, options)) {
        this.stats.totalProcessed++;

        const transformed = this._transformRecord(record);
        const mapped = this._mapRecord(transformed);

        if (this.validateFn && !this.validateFn(mapped)) {
          this.stats.totalSkipped++;
          if (this.listenerCount('error') > 0) {
            this.emit('error', {
              row: this.stats.totalProcessed,
              message: 'Validation failed',
              record: mapped
            } as ParseError);
          }
          if (!this.continueOnError) {
            throw new PluginError('Validation failed', {
              pluginName: 'ImporterPlugin',
              operation: 'import',
              statusCode: 422,
              retriable: false,
              suggestion: 'Fix the invalid record or enable continueOnError to skip bad rows.',
              row: this.stats.totalProcessed,
              record: mapped
            });
          }
          continue;
        }

        if (this.deduplicateBy) {
          const key = mapped[this.deduplicateBy];
          if (this.seenKeys.has(key)) {
            this.stats.totalDuplicates++;
            continue;
          }
          this.seenKeys.add(key);
        }

        batch.push(mapped);

        if (batch.length >= this.batchSize) {
          await this._processBatch(batch);
          batch = [];

          this.emit('progress', {
            processed: this.stats.totalProcessed,
            inserted: this.stats.totalInserted,
            skipped: this.stats.totalSkipped,
            errors: this.stats.totalErrors,
            percent: 0
          } as ProgressEvent);
        }
      }

      if (batch.length > 0) {
        await this._processBatch(batch);
      }

      this.stats.endTime = Date.now();

      const result: ImportResult = {
        processed: this.stats.totalProcessed,
        inserted: this.stats.totalInserted,
        skipped: this.stats.totalSkipped,
        errors: this.stats.totalErrors,
        duplicates: this.stats.totalDuplicates,
        duration: this.stats.endTime - this.stats.startTime!
      };

      this.emit('complete', result);

      return result;
    } catch (error) {
      if (this.listenerCount('error') > 0) {
        const err = error as Error;
        this.emit('error', { message: err.message, error: err });
      }
      throw error;
    }
  }

  private _mapRecord(record: Record<string, unknown>): Record<string, unknown> {
    if (Object.keys(this.mapping).length === 0) {
      return record;
    }

    const mapped: Record<string, unknown> = {};
    for (const [sourceField, targetField] of Object.entries(this.mapping)) {
      if (sourceField in record) {
        mapped[targetField] = record[sourceField];
      }
    }

    return mapped;
  }

  private _transformRecord(
    record: Record<string, unknown>,
    originalRecord: Record<string, unknown> | null = null
  ): Record<string, unknown> {
    if (Object.keys(this.transforms).length === 0) {
      return record;
    }

    const transformed = { ...record };
    const contextRecord = originalRecord || record;
    for (const [field, transformFn] of Object.entries(this.transforms)) {
      if (field in transformed) {
        transformed[field] = transformFn(transformed[field], contextRecord);
      }
    }

    return transformed;
  }

  private async _processBatch(records: Record<string, unknown>[]): Promise<void> {
    const batches: Record<string, unknown>[][] = [];
    for (let i = 0; i < records.length; i += this.parallelism) {
      batches.push(records.slice(i, i + this.parallelism));
    }

    for (const batch of batches) {
      const promises = batch.map(async (record) => {
        const [ok, err] = await tryFn(async () => {
          return await this.resource!.insert(record);
        });

        if (ok) {
          this.stats.totalInserted++;
        } else {
          this.stats.totalErrors++;
          if (this.listenerCount('error') > 0) {
            this.emit('error', {
              message: (err as Error).message,
              record,
              error: err
            } as ParseError);
          }
          if (!this.continueOnError) throw err;
        }
      });

      await Promise.all(promises);
    }
  }

  getStats(): ImportStats & { recordsPerSecond: number } {
    return {
      ...this.stats,
      recordsPerSecond: this.stats.endTime && this.stats.startTime
        ? Math.round(this.stats.totalProcessed / ((this.stats.endTime - this.stats.startTime) / 1000))
        : 0
    };
  }
}

export const Transformers = {
  parseDate: (format?: string) => (value: unknown): number => {
    return new Date(value as string).getTime();
  },

  parseFloat: (decimals: number = 2) => (value: unknown): number => {
    return parseFloat(parseFloat(value as string).toFixed(decimals));
  },

  parseInt: () => (value: unknown): number => {
    return parseInt(value as string, 10);
  },

  toLowerCase: () => (value: unknown): string => {
    return String(value).toLowerCase();
  },

  toUpperCase: () => (value: unknown): string => {
    return String(value).toUpperCase();
  },

  split: (delimiter: string = ',') => (value: unknown): string[] => {
    return String(value).split(delimiter).map(s => s.trim());
  },

  parseJSON: () => (value: unknown): unknown => {
    try {
      return JSON.parse(value as string);
    } catch {
      return value;
    }
  },

  trim: () => (value: unknown): string => {
    return String(value).trim();
  }
};

export {
  ImporterDriver,
  JSONImportDriver,
  CSVImportDriver,
  ParquetImportDriver,
  ExcelImportDriver
};

export type {
  ImporterDriverConfig,
  ParseError,
  ProgressEvent,
  ImportResult,
  ImportStats,
  ParseOptions,
  BinaryFieldSchema,
  BinarySchema,
  TransformFunction,
  ValidateFunction,
  ImporterPluginOptions
};
