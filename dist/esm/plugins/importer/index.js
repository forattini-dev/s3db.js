import { Plugin } from '../plugin.class.js';
import { EventEmitter } from 'events';
import tryFn from '../../concerns/try-fn.js';
import * as fs from 'fs';
import * as readline from 'readline';
import zlib from 'node:zlib';
import { PluginError } from '../../errors.js';
class ImporterDriver extends EventEmitter {
    config;
    constructor(config = {}) {
        super();
        this.config = config;
    }
    async validate(filePath) {
        return true;
    }
}
class JSONImportDriver extends ImporterDriver {
    async *parse(filePath, options = {}) {
        const isGzipped = filePath.endsWith('.gz');
        let fileStream = fs.createReadStream(filePath);
        if (isGzipped) {
            const gunzip = zlib.createGunzip();
            fileStream = fileStream.pipe(gunzip);
            fileStream.setEncoding('utf8');
        }
        else {
            fileStream.setEncoding('utf8');
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
            if (!trimmed)
                continue;
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
                            }
                            else {
                                throw new PluginError('JSON import expects an array of objects', {
                                    pluginName: 'ImporterPlugin',
                                    operation: 'JSONImportDriver.parse',
                                    statusCode: 400,
                                    retriable: false,
                                    suggestion: 'Ensure the JSON file contains an array at the root (e.g., [ {...}, {...} ]).'
                                });
                            }
                        }
                        catch (error) {
                            const err = error;
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
                        }
                        else {
                            throw new PluginError('JSON import expects an array of objects', {
                                pluginName: 'ImporterPlugin',
                                operation: 'JSONImportDriver.parse',
                                statusCode: 400,
                                retriable: false,
                                suggestion: 'Ensure the JSON file contains an array at the root (e.g., [ {...}, {...} ]).'
                            });
                        }
                    }
                    catch (error) {
                        const err = error;
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
            }
            else {
                try {
                    const record = JSON.parse(trimmed);
                    yield record;
                }
                catch (error) {
                    const err = error;
                    if (this.listenerCount('error') > 0) {
                        this.emit('error', {
                            line: lineNumber,
                            message: `Invalid JSON on line ${lineNumber}: ${err.message}`,
                            data: trimmed
                        });
                    }
                }
            }
        }
    }
    async validate(filePath) {
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
            const formatExt = parts[parts.length - 2];
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
        }
        else {
            const ext = lowerPath.split('.').pop();
            if (!['json', 'jsonl', 'ndjson'].includes(ext)) {
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
    async *parse(filePath, options = {}) {
        const delimiter = options.delimiter || await this._detectDelimiter(filePath);
        const hasHeader = options.hasHeader !== undefined ? options.hasHeader : true;
        const isGzipped = filePath.endsWith('.gz');
        let fileStream = fs.createReadStream(filePath);
        if (isGzipped) {
            const gunzip = zlib.createGunzip();
            fileStream = fileStream.pipe(gunzip);
            fileStream.setEncoding('utf8');
        }
        else {
            fileStream.setEncoding('utf8');
        }
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        let headers = null;
        let lineNumber = 0;
        for await (const line of rl) {
            lineNumber++;
            if (!line.trim())
                continue;
            const fields = this._parseLine(line, delimiter);
            if (lineNumber === 1 && hasHeader) {
                headers = fields;
                continue;
            }
            let record;
            if (headers) {
                record = {};
                for (let i = 0; i < Math.min(headers.length, fields.length); i++) {
                    record[headers[i]] = fields[i];
                }
            }
            else {
                record = Object.fromEntries(fields.map((val, idx) => [String(idx), val]));
            }
            yield record;
        }
    }
    _parseLine(line, delimiter) {
        const fields = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    current += '"';
                    i++;
                }
                else {
                    inQuotes = !inQuotes;
                }
            }
            else if (char === delimiter && !inQuotes) {
                fields.push(current.trim());
                current = '';
            }
            else {
                current += char;
            }
        }
        fields.push(current.trim());
        return fields;
    }
    async _detectDelimiter(filePath) {
        const isGzipped = filePath.endsWith('.gz');
        let fileStream = fs.createReadStream(filePath);
        if (isGzipped) {
            const gunzip = zlib.createGunzip();
            fileStream = fileStream.pipe(gunzip);
            fileStream.setEncoding('utf8');
        }
        else {
            fileStream.setEncoding('utf8');
        }
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        const delimiters = [',', ';', '\t', '|'];
        const counts = {};
        let linesRead = 0;
        for await (const line of rl) {
            if (linesRead >= 5)
                break;
            linesRead++;
            for (const delimiter of delimiters) {
                counts[delimiter] = (counts[delimiter] || 0) + (line.split(delimiter).length - 1);
            }
        }
        fileStream.destroy?.();
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
    async validate(filePath) {
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
            const formatExt = parts[parts.length - 2];
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
        }
        else {
            const ext = lowerPath.split('.').pop();
            if (!['csv', 'tsv', 'txt'].includes(ext)) {
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
    async *parse(filePath, options = {}) {
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
    async *parse(filePath, options = {}) {
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
    resourceName;
    format;
    mapping;
    transforms;
    validateFn;
    deduplicateBy;
    batchSize;
    parallelism;
    continueOnError;
    streaming;
    driverConfig;
    sheet;
    headerRow;
    startRow;
    binarySchema;
    recordSize;
    resource = null;
    driver = null;
    seenKeys = new Set();
    stats = {
        totalProcessed: 0,
        totalInserted: 0,
        totalSkipped: 0,
        totalErrors: 0,
        totalDuplicates: 0,
        startTime: null,
        endTime: null
    };
    constructor(config = {}) {
        super(config);
        const opts = this.options;
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
    async onInstall() {
        try {
            const db = this.database;
            this.resource = db.resources[this.resourceName] ?? null;
            if (this.resource && typeof this.resource.then === 'function') {
                this.resource = await this.resource;
            }
        }
        catch (error) {
            const err = error;
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
    _createDriver(format) {
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
    async import(filePath, options = {}) {
        this.stats.startTime = Date.now();
        this.stats.totalProcessed = 0;
        this.stats.totalInserted = 0;
        this.stats.totalSkipped = 0;
        this.stats.totalErrors = 0;
        this.stats.totalDuplicates = 0;
        this.seenKeys.clear();
        try {
            await this.driver.validate(filePath);
            let batch = [];
            for await (const record of this.driver.parse(filePath, options)) {
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
                        });
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
                    });
                }
            }
            if (batch.length > 0) {
                await this._processBatch(batch);
            }
            this.stats.endTime = Date.now();
            const result = {
                processed: this.stats.totalProcessed,
                inserted: this.stats.totalInserted,
                skipped: this.stats.totalSkipped,
                errors: this.stats.totalErrors,
                duplicates: this.stats.totalDuplicates,
                duration: this.stats.endTime - this.stats.startTime
            };
            this.emit('complete', result);
            return result;
        }
        catch (error) {
            if (this.listenerCount('error') > 0) {
                const err = error;
                this.emit('error', { message: err.message, error: err });
            }
            throw error;
        }
    }
    _mapRecord(record) {
        if (Object.keys(this.mapping).length === 0) {
            return record;
        }
        const mapped = {};
        for (const [sourceField, targetField] of Object.entries(this.mapping)) {
            if (sourceField in record) {
                mapped[targetField] = record[sourceField];
            }
        }
        return mapped;
    }
    _transformRecord(record, originalRecord = null) {
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
    async _processBatch(records) {
        const batches = [];
        for (let i = 0; i < records.length; i += this.parallelism) {
            batches.push(records.slice(i, i + this.parallelism));
        }
        for (const batch of batches) {
            const promises = batch.map(async (record) => {
                const [ok, err] = await tryFn(async () => {
                    return await this.resource.insert(record);
                });
                if (ok) {
                    this.stats.totalInserted++;
                }
                else {
                    this.stats.totalErrors++;
                    if (this.listenerCount('error') > 0) {
                        this.emit('error', {
                            message: err.message,
                            record,
                            error: err
                        });
                    }
                    if (!this.continueOnError)
                        throw err;
                }
            });
            await Promise.all(promises);
        }
    }
    getStats() {
        return {
            ...this.stats,
            recordsPerSecond: this.stats.endTime && this.stats.startTime
                ? Math.round(this.stats.totalProcessed / ((this.stats.endTime - this.stats.startTime) / 1000))
                : 0
        };
    }
}
export const Transformers = {
    parseDate: (format) => (value) => {
        return new Date(value).getTime();
    },
    parseFloat: (decimals = 2) => (value) => {
        return parseFloat(parseFloat(value).toFixed(decimals));
    },
    parseInt: () => (value) => {
        return parseInt(value, 10);
    },
    toLowerCase: () => (value) => {
        return String(value).toLowerCase();
    },
    toUpperCase: () => (value) => {
        return String(value).toUpperCase();
    },
    split: (delimiter = ',') => (value) => {
        return String(value).split(delimiter).map(s => s.trim());
    },
    parseJSON: () => (value) => {
        try {
            return JSON.parse(value);
        }
        catch {
            return value;
        }
    },
    trim: () => (value) => {
        return String(value).trim();
    }
};
export { ImporterDriver, JSONImportDriver, CSVImportDriver, ParquetImportDriver, ExcelImportDriver };
//# sourceMappingURL=index.js.map