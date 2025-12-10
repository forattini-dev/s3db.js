import { readFile, watch, readdir } from 'fs/promises';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { Plugin } from '../plugin.class.js';
import tryFn from '../../concerns/try-fn.js';
import requirePluginDependency from '../concerns/plugin-dependencies.js';
import { idGenerator } from '../../concerns/id.js';
import { resolveResourceNames } from '../concerns/resource-names.js';
import { createLogger } from '../../concerns/logger.js';
import { TfStateError, InvalidStateFileError, UnsupportedStateVersionError, StateFileNotFoundError, ResourceExtractionError, StateDiffError, FileWatchError } from './errors.js';
import { S3TfStateDriver } from './s3-driver.js';
import { FilesystemTfStateDriver } from './filesystem-driver.js';
export class TfStatePlugin extends Plugin {
    driverType;
    driverConfig;
    _resourceDescriptors;
    resourceName;
    stateFilesName;
    diffsName;
    lineagesName;
    monitorEnabled;
    monitorCron;
    trackDiffs;
    diffsLookback;
    asyncPartitions;
    autoSync;
    watchPaths;
    filters;
    logLevel;
    supportedVersions;
    driver;
    resource;
    stateFilesResource;
    diffsResource;
    lineagesResource;
    watchers;
    cronTask;
    lastProcessedSerial;
    _partitionCache;
    stats;
    constructor(config = {}) {
        super(config);
        // 🪵 Logger initialization
        if (config.logger) {
            this.logger = config.logger;
        }
        else {
            const logLevel = config.logLevel ? 'debug' : 'info';
            this.logger = createLogger({ name: 'TfStatePlugin', level: logLevel });
        }
        // Driver-based configuration
        this.driverType = config.driver || null;
        this.driverConfig = config.config || {};
        // Resource names
        const resourcesConfig = config.resources || {};
        const resourceNamesOption = config.resourceNames || {};
        this._resourceDescriptors = {
            resources: {
                defaultName: 'plg_tfstate_resources',
                override: resourceNamesOption.resources || resourcesConfig.resources || config.resourceName
            },
            stateFiles: {
                defaultName: 'plg_tfstate_state_files',
                override: resourceNamesOption.stateFiles || resourcesConfig.stateFiles || config.stateFilesName
            },
            diffs: {
                defaultName: 'plg_tfstate_state_diffs',
                override: resourceNamesOption.diffs || resourcesConfig.diffs || config.diffsName
            },
            lineages: {
                defaultName: 'plg_tfstate_lineages',
                override: resourceNamesOption.lineages || resourcesConfig.lineages
            }
        };
        const resolvedNames = this._resolveResourceNames();
        this.resourceName = resolvedNames.resources;
        this.stateFilesName = resolvedNames.stateFiles;
        this.diffsName = resolvedNames.diffs;
        this.lineagesName = resolvedNames.lineages;
        // Monitoring configuration
        const monitor = config.monitor || {};
        this.monitorEnabled = monitor.enabled || false;
        this.monitorCron = monitor.cron || '*/5 * * * *';
        // Diff configuration
        const diffs = config.diffs || {};
        this.trackDiffs = diffs.enabled !== undefined ? diffs.enabled : (config.trackDiffs !== undefined ? config.trackDiffs : true);
        this.diffsLookback = diffs.lookback || 10;
        // Partition configuration
        this.asyncPartitions = config.asyncPartitions !== undefined ? config.asyncPartitions : true;
        // Other config
        this.autoSync = config.autoSync || false;
        this.watchPaths = config.watchPaths || [];
        this.filters = config.filters || {};
        this.logLevel = config.logLevel || 'info';
        // Supported Tfstate versions
        this.supportedVersions = [3, 4];
        // Internal state
        this.driver = null; // Will be initialized in onInstall
        this.resource = null;
        this.stateFilesResource = null;
        this.diffsResource = null;
        this.lineagesResource = null;
        this.watchers = [];
        this.cronTask = null;
        this.lastProcessedSerial = null;
        // Cache partition lookups (resourceName:fieldName -> partitionName)
        this._partitionCache = new Map();
        // Statistics
        this.stats = {
            statesProcessed: 0,
            resourcesExtracted: 0,
            resourcesInserted: 0,
            diffsCalculated: 0,
            errors: 0,
            lastProcessedSerial: null,
            partitionCacheHits: 0,
            partitionQueriesOptimized: 0
        };
    }
    _resolveResourceNames() {
        return resolveResourceNames('tfstate', this._resourceDescriptors, {
            namespace: this.namespace || undefined
        });
    }
    onNamespaceChanged() {
        const names = this._resolveResourceNames();
        this.resourceName = names.resources;
        this.stateFilesName = names.stateFiles;
        this.diffsName = names.diffs;
        this.lineagesName = names.lineages;
    }
    /**
     * Install the plugin
     * @override
     */
    async onInstall() {
        this.logger.debug('Installing...');
        // Initialize driver if using new config format
        if (this.driverType) {
            this.logger.debug({ driverType: this.driverType }, `Initializing ${this.driverType} driver...`);
            if (this.driverType === 's3') {
                this.driver = new S3TfStateDriver(this.driverConfig);
            }
            else if (this.driverType === 'filesystem') {
                this.driver = new FilesystemTfStateDriver(this.driverConfig);
            }
            else {
                throw new TfStateError(`Unsupported driver type: ${this.driverType}`);
            }
            await this.driver.initialize();
            this.logger.debug('Driver initialized successfully');
        }
        // Resource 0: Terraform Lineages (Master tracking resource)
        // NEW: Tracks unique Tfstate lineages for efficient diff tracking
        {
            const [created, createErr, resource] = await tryFn(() => this.database.createResource({
                name: this.lineagesName,
                attributes: {
                    id: 'string|required',
                    latestSerial: 'number',
                    latestStateId: 'string',
                    totalStates: 'number',
                    firstImportedAt: 'number',
                    lastImportedAt: 'number',
                    metadata: 'json'
                },
                timestamps: true,
                asyncPartitions: this.asyncPartitions,
                partitions: {},
                createdBy: 'TfStatePlugin'
            }));
            if (created) {
                this.lineagesResource = resource;
            }
            else {
                this.lineagesResource = this.database.resources?.[this.lineagesName];
                if (!this.lineagesResource) {
                    throw createErr;
                }
            }
        }
        // Resource 1: Tfstate Files Metadata
        // Dedicated to tracking state file metadata with SHA256 hash for deduplication
        {
            const [created, createErr, resource] = await tryFn(() => this.database.createResource({
                name: this.stateFilesName,
                attributes: {
                    id: 'string|required',
                    lineageId: 'string|required',
                    sourceFile: 'string|required',
                    serial: 'number|required',
                    lineage: 'string|required',
                    terraformVersion: 'string',
                    stateVersion: 'number|required',
                    resourceCount: 'number',
                    sha256Hash: 'string|required',
                    importedAt: 'number|required'
                },
                timestamps: true,
                asyncPartitions: this.asyncPartitions,
                partitions: {
                    byLineage: { fields: { lineageId: 'string' } },
                    byLineageSerial: { fields: { lineageId: 'string', serial: 'number' } },
                    bySourceFile: { fields: { sourceFile: 'string' } },
                    bySerial: { fields: { serial: 'number' } },
                    bySha256: { fields: { sha256Hash: 'string' } }
                },
                createdBy: 'TfStatePlugin'
            }));
            if (created) {
                this.stateFilesResource = resource;
            }
            else {
                this.stateFilesResource = this.database.resources?.[this.stateFilesName];
                if (!this.stateFilesResource) {
                    throw createErr;
                }
            }
        }
        // Resource 2: Terraform Resources
        // Store extracted resources with foreign key to state files
        {
            const [created, createErr, resource] = await tryFn(() => this.database.createResource({
                name: this.resourceName,
                attributes: {
                    id: 'string|required',
                    stateFileId: 'string|required',
                    lineageId: 'string|required',
                    stateSerial: 'number|required',
                    sourceFile: 'string|required',
                    resourceType: 'string|required',
                    resourceName: 'string|required',
                    resourceAddress: 'string|required',
                    providerName: 'string|required',
                    mode: 'string',
                    attributes: 'json',
                    dependencies: 'array',
                    importedAt: 'number|required'
                },
                timestamps: true,
                asyncPartitions: this.asyncPartitions,
                partitions: {
                    byLineageSerial: { fields: { lineageId: 'string', stateSerial: 'number' } },
                    byLineage: { fields: { lineageId: 'string' } },
                    byType: { fields: { resourceType: 'string' } },
                    byProvider: { fields: { providerName: 'string' } },
                    bySerial: { fields: { stateSerial: 'number' } },
                    bySourceFile: { fields: { sourceFile: 'string' } },
                    byProviderAndType: { fields: { providerName: 'string', resourceType: 'string' } },
                    byLineageType: { fields: { lineageId: 'string', resourceType: 'string' } }
                },
                createdBy: 'TfStatePlugin'
            }));
            if (created) {
                this.resource = resource;
            }
            else {
                this.resource = this.database.resources?.[this.resourceName];
                if (!this.resource) {
                    throw createErr;
                }
            }
        }
        // Resource 3: Tfstate Diffs
        // Track changes between state versions (if diff tracking enabled)
        if (this.trackDiffs) {
            const [created, createErr, resource] = await tryFn(() => this.database.createResource({
                name: this.diffsName,
                attributes: {
                    id: 'string|required',
                    lineageId: 'string|required',
                    oldSerial: 'number|required',
                    newSerial: 'number|required',
                    oldStateId: 'string',
                    newStateId: 'string|required',
                    calculatedAt: 'number|required',
                    summary: {
                        type: 'object',
                        props: {
                            addedCount: 'number',
                            modifiedCount: 'number',
                            deletedCount: 'number'
                        }
                    },
                    changes: {
                        type: 'object',
                        props: {
                            added: 'array',
                            modified: 'array',
                            deleted: 'array'
                        }
                    }
                },
                behavior: 'body-only',
                timestamps: true,
                asyncPartitions: this.asyncPartitions,
                partitions: {
                    byLineage: { fields: { lineageId: 'string' } },
                    byLineageNewSerial: { fields: { lineageId: 'string', newSerial: 'number' } },
                    byNewSerial: { fields: { newSerial: 'number' } },
                    byOldSerial: { fields: { oldSerial: 'number' } }
                },
                createdBy: 'TfStatePlugin'
            }));
            if (created) {
                this.diffsResource = resource;
            }
            else {
                this.diffsResource = this.database.resources?.[this.diffsName];
                if (!this.diffsResource) {
                    throw createErr;
                }
            }
        }
        const resourcesCreated = [this.lineagesName, this.stateFilesName, this.resourceName];
        if (this.trackDiffs)
            resourcesCreated.push(this.diffsName);
        this.logger.debug({ resources: resourcesCreated }, `Created resources: ${resourcesCreated.join(', ')}`);
        if (this.autoSync && this.watchPaths.length > 0) {
            await this._setupFileWatchers();
        }
        if (this.monitorEnabled && this.driver) {
            await this._setupCronMonitoring();
        }
        this.emit('installed', {
            plugin: 'TfStatePlugin',
            stateFilesName: this.stateFilesName,
            resourceName: this.resourceName,
            diffsName: this.diffsName,
            monitorEnabled: this.monitorEnabled,
            driverType: this.driverType
        });
    }
    /**
     * Start the plugin
     * @override
     */
    async onStart() {
        this.logger.debug('Started');
    }
    /**
     * Stop the plugin
     * @override
     */
    async onStop() {
        // Stop cron monitoring
        if (this.cronTask) {
            this.cronTask.stop();
            this.cronTask = null;
            this.logger.debug('Stopped cron monitoring');
        }
        for (const watcher of this.watchers) {
            try {
                // fs.promises.watch returns an AsyncIterator with a return() method
                if (watcher && typeof watcher.return === 'function') {
                    await watcher.return();
                }
                else if (watcher && typeof watcher.close === 'function') {
                    await watcher.close();
                }
            }
            catch (error) {
                // Ignore errors when closing watchers
                this.logger.debug({ error: error.message }, 'Error closing watcher');
            }
        }
        this.watchers = [];
        // Close driver
        if (this.driver) {
            await this.driver.close();
            this.driver = null;
            this.logger.debug('Driver closed');
        }
        this.logger.debug('Stopped');
    }
    /**
     * Import multiple Terraform/OpenTofu states from local filesystem using glob pattern
     */
    async importStatesGlob(pattern, options = {}) {
        const startTime = Date.now();
        const parallelism = options.parallelism || 5;
        this.logger.debug({ pattern }, `Finding local files matching: ${pattern}`);
        try {
            // Find all matching files
            const matchingFiles = await this._findFilesGlob(pattern);
            this.logger.debug({ count: matchingFiles.length }, `Found ${matchingFiles.length} matching files`);
            if (matchingFiles.length === 0) {
                return {
                    filesProcessed: 0,
                    totalResourcesExtracted: 0,
                    totalResourcesInserted: 0,
                    files: [],
                    duration: Date.now() - startTime
                };
            }
            // Import states with controlled parallelism
            const results = [];
            const files = [];
            for (let i = 0; i < matchingFiles.length; i += parallelism) {
                const batch = matchingFiles.slice(i, i + parallelism);
                const batchPromises = batch.map(async (filePath) => {
                    try {
                        const result = await this.importState(filePath);
                        return { success: true, file: filePath, result };
                    }
                    catch (error) {
                        this.logger.error({ filePath, error: error.message }, `Failed to import ${filePath}`);
                        return { success: false, file: filePath, error: error.message };
                    }
                });
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
            }
            // Consolidate statistics
            const successful = results.filter(r => r.success);
            const failed = results.filter(r => !r.success);
            successful.forEach(r => {
                if (!r.result.skipped) {
                    files.push({
                        file: r.file,
                        serial: r.result.serial,
                        resourcesExtracted: r.result.resourcesExtracted,
                        resourcesInserted: r.result.resourcesInserted
                    });
                }
            });
            const totalResourcesExtracted = successful
                .filter(r => !r.result.skipped)
                .reduce((sum, r) => sum + (r.result.resourcesExtracted || 0), 0);
            const totalResourcesInserted = successful
                .filter(r => !r.result.skipped)
                .reduce((sum, r) => sum + (r.result.resourcesInserted || 0), 0);
            const duration = Date.now() - startTime;
            const consolidatedResult = {
                filesProcessed: successful.length,
                filesFailed: failed.length,
                totalResourcesExtracted,
                totalResourcesInserted,
                files,
                failedFiles: failed.map(f => ({ file: f.file, error: f.error })),
                duration
            };
            this.logger.debug({ consolidatedResult }, `Glob import completed:`);
            this.emit('globImportCompleted', consolidatedResult);
            return consolidatedResult;
        }
        catch (error) {
            this.stats.errors++;
            this.logger.error({ error: error }, `Glob import failed:`);
            throw error;
        }
    }
    /**
     * Find files matching glob pattern
     * @private
     */
    async _findFilesGlob(pattern) {
        const files = [];
        // Extract base directory from pattern (everything before first wildcard)
        const baseMatch = pattern.match(/^([^*?[\\]+)/);
        const baseDir = baseMatch ? baseMatch[1] : '.';
        // Extract the pattern part (everything after base)
        // const patternPart = pattern.slice(baseDir.length);
        // Recursively find all .tfstate files in the directory
        const findFiles = async (dir) => {
            try {
                const entries = await readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = join(dir, entry.name);
                    if (entry.isDirectory()) {
                        // Recurse into subdirectories
                        await findFiles(fullPath);
                    }
                    else if (entry.isFile() && entry.name.endsWith('.tfstate')) {
                        // Check if file matches the pattern
                        if (this._matchesGlobPattern(fullPath, pattern)) {
                            files.push(fullPath);
                        }
                    }
                }
            }
            catch (error) {
                // Ignore permission errors and continue
                if (error.code !== 'EACCES' && error.code !== 'EPERM') {
                    throw error;
                }
            }
        };
        await findFiles(baseDir ?? '');
        return files;
    }
    /**
     * Import Terraform/OpenTofu state from remote S3 bucket
     */
    async importStateFromS3(bucket, key, options = {}) {
        const startTime = Date.now();
        const sourceFile = `s3://${bucket}/${key}`;
        this.logger.debug('Importing from S3: ${sourceFile}');
        try {
            // Use provided client or database client
            const client = options.client || this.database.client;
            // Fetch state from S3
            const [ok, err, data] = await tryFn(async () => {
                return await client.getObject(key);
            });
            if (!ok) {
                throw new StateFileNotFoundError(sourceFile, {
                    originalError: err
                });
            }
            // Parse JSON
            const stateContent = data.Body.toString('utf-8');
            let state;
            try {
                state = JSON.parse(stateContent);
            }
            catch (parseError) {
                throw new InvalidStateFileError(sourceFile, 'Invalid JSON', {
                    originalError: parseError
                });
            }
            // Validate state structure
            this._validateState(state, sourceFile);
            // Validate version
            this._validateStateVersion(state);
            // Calculate SHA256 hash for deduplication
            const sha256Hash = this._calculateSHA256(state);
            // Check if this exact state already exists (by SHA256) - use partition if available
            const partitionName = this._findPartitionByField(this.stateFilesResource, 'sha256Hash');
            let existingByHash;
            if (partitionName) {
                // Efficient: Use partition query (O(1))
                this.stats.partitionQueriesOptimized++;
                existingByHash = await this.stateFilesResource.list({
                    partition: partitionName,
                    partitionValues: { sha256Hash },
                    limit: 1
                });
            }
            else {
                // Fallback: Use query() without partition
                existingByHash = await this.stateFilesResource.query({ sha256Hash }, { limit: 1 });
            }
            if (existingByHash.length > 0) {
                // Exact same state already imported, skip
                const existing = existingByHash[0];
                this.logger.debug('State already imported (SHA256 match), skipping');
                return {
                    skipped: true,
                    reason: 'duplicate',
                    serial: state.serial,
                    stateFileId: existing.id,
                    sha256Hash,
                    source: sourceFile
                };
            }
            const currentTime = Date.now();
            // Create state file record
            const stateFileRecord = {
                id: idGenerator(),
                sourceFile,
                serial: state.serial,
                lineage: state.lineage,
                terraformVersion: state.terraform_version,
                stateVersion: state.version,
                resourceCount: (state.resources || []).length,
                sha256Hash,
                importedAt: currentTime
            };
            const [insertOk, insertErr, stateFileResult] = await tryFn(async () => {
                return await this.stateFilesResource.insert(stateFileRecord);
            });
            if (!insertOk) {
                throw new TfStateError(`Failed to save state file metadata: ${insertErr.message}`, {
                    originalError: insertErr
                });
            }
            const stateFileId = stateFileResult.id;
            // Extract resources with stateFileId
            const resources = await this._extractResources(state, sourceFile, stateFileId, null); // Assuming lineageId logic is handled differently or missing in S3?
            // Wait, importState (file) uses lineage. S3 logic should too.
            // Looking at JS, S3 import logic:
            // It doesn't seem to use `lineageUuid` in `_extractResources` call in S3 logic in the original file?
            // Let me check lines 1300-1400 of original file.
            // Line 1370: `const resources = await this._extractResources(state, sourceFile, stateFileId);`
            // It missed lineageId!
            // However, `importState` (file) does:
            // `const resources = await this._extractResources(state, filePath, stateFileId, lineageUuid);`
            // If I want to be faithful to JS, I keep it as is (missing lineageId).
            // But `_extractResources` signature takes 4 args: `(state, filePath, stateFileId, lineageId)`
            // So in JS, lineageId is undefined for S3.
            // I will keep it as `undefined` or `null`.
            // Calculate diff if enabled
            let diff = null;
            let diffRecord = null;
            if (this.trackDiffs) {
                // S3 logic also seems to miss lineageId in `_calculateDiff` call?
                // `diff = await this._calculateDiff(state, sourceFile, stateFileId);`
                // `_calculateDiff` signature: `(currentState, lineageId, currentStateFileId)`
                // So `sourceFile` is passed as `lineageId`?? That looks like a bug in original JS or I misread.
                // Let's re-read `_calculateDiff` call in `importStateFromS3`.
                // Line 1376: `diff = await this._calculateDiff(state, sourceFile, stateFileId);`
                // `_calculateDiff` (Line 1725): `async _calculateDiff(currentState, lineageId, currentStateFileId)`
                // It uses `lineageId` to query `byLineageSerial`.
                // If `sourceFile` is passed as `lineageId`, it will query with `lineageId: sourceFile`.
                // This suggests S3 import might be tracking history BY FILE URL instead of by lineage UUID?
                // Or it's a bug.
                // But `importState` (file) uses `lineageUuid`.
                // I will preserve the JS behavior (passing `sourceFile` as `lineageId`).
                diff = await this._calculateDiff(state, sourceFile, stateFileId);
                // Save diff to diffsResource
                if (diff && !diff.isFirst) {
                    diffRecord = await this._saveDiff(diff, sourceFile, stateFileId);
                }
            }
            // Insert resources
            const inserted = await this._insertResources(resources);
            // Update last processed serial
            this.lastProcessedSerial = state.serial;
            // Update statistics
            this.stats.statesProcessed++;
            this.stats.resourcesExtracted += (resources.totalExtracted || resources.length);
            this.stats.resourcesInserted += inserted.length;
            this.stats.lastProcessedSerial = state.serial;
            if (diff && !diff.isFirst)
                this.stats.diffsCalculated++;
            const duration = Date.now() - startTime;
            const result = {
                serial: state.serial,
                lineage: state.lineage,
                terraformVersion: state.terraform_version,
                resourcesExtracted: (resources.totalExtracted || resources.length),
                resourcesInserted: inserted.length,
                stateFileId,
                sha256Hash,
                source: sourceFile,
                diff: diff ? {
                    added: diff.added.length,
                    modified: diff.modified.length,
                    deleted: diff.deleted.length,
                    isFirst: diff.isFirst || false
                } : null,
                duration
            };
            this.logger.debug({ result }, `S3 import completed:`);
            this.emit('stateImported', result);
            return result;
        }
        catch (error) {
            this.stats.errors++;
            this.logger.error({ error: error }, `S3 import failed:`);
            throw error;
        }
    }
    /**
     * Import multiple Terraform/OpenTofu states from S3 using glob pattern
     */
    async importStatesFromS3Glob(bucket, pattern, options = {}) {
        const startTime = Date.now();
        const client = options.client || this.database.client;
        const parallelism = options.parallelism || 5;
        this.logger.debug('Listing S3 objects: s3://${bucket}/${pattern}');
        try {
            // List all objects in the bucket
            const [ok, err, data] = await tryFn(async () => {
                const params = {};
                // Extract prefix from pattern (everything before first wildcard)
                const prefixMatch = pattern.match(/^([^*?[\\]+)/);
                if (prefixMatch) {
                    params.prefix = prefixMatch[1];
                }
                return await client.listObjects(params);
            });
            if (!ok) {
                throw new TfStateError(`Failed to list objects in s3://${bucket}`, {
                    originalError: err
                });
            }
            const allObjects = data.Contents || [];
            // Filter objects using glob pattern matching
            const matchingObjects = allObjects.filter((obj) => {
                return this._matchesGlobPattern(obj.Key, pattern);
            });
            this.logger.debug('Found ${matchingObjects.length} matching files');
            if (matchingObjects.length === 0) {
                return {
                    filesProcessed: 0,
                    totalResourcesExtracted: 0,
                    totalResourcesInserted: 0,
                    files: [],
                    duration: Date.now() - startTime
                };
            }
            // Import states with controlled parallelism
            const results = [];
            const files = [];
            for (let i = 0; i < matchingObjects.length; i += parallelism) {
                const batch = matchingObjects.slice(i, i + parallelism);
                const batchPromises = batch.map(async (obj) => {
                    try {
                        const result = await this.importStateFromS3(bucket, obj.Key, options);
                        return { success: true, key: obj.Key, result };
                    }
                    catch (error) {
                        this.logger.error({ error: error.message }, `Failed to import ${obj.Key}:`);
                        return { success: false, key: obj.Key, error: error.message };
                    }
                });
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
            }
            // Consolidate statistics
            const successful = results.filter(r => r.success);
            const failed = results.filter(r => !r.success);
            successful.forEach(r => {
                files.push({
                    file: r.key,
                    serial: r.result.serial,
                    resourcesExtracted: r.result.resourcesExtracted,
                    resourcesInserted: r.result.resourcesInserted
                });
            });
            const totalResourcesExtracted = successful.reduce((sum, r) => sum + r.result.resourcesExtracted, 0);
            const totalResourcesInserted = successful.reduce((sum, r) => sum + r.result.resourcesInserted, 0);
            const duration = Date.now() - startTime;
            const consolidatedResult = {
                filesProcessed: successful.length,
                filesFailed: failed.length,
                totalResourcesExtracted,
                totalResourcesInserted,
                files,
                failedFiles: failed.map(f => ({ file: f.key, error: f.error })),
                duration
            };
            this.logger.debug({ consolidatedResult }, `Glob import completed:`);
            this.emit('globImportCompleted', consolidatedResult);
            return consolidatedResult;
        }
        catch (error) {
            this.stats.errors++;
            this.logger.error({ error: error }, `Glob import failed:`);
            throw error;
        }
    }
    /**
     * Match S3 key against glob pattern
     * Simple glob matching supporting *, **, ?, and []
     * @private
     */
    _matchesGlobPattern(key, pattern) {
        // First, temporarily replace glob wildcards with placeholders
        let regexPattern = pattern
            .replace(/\*\*/g, '\x00\x00') // ** → double null
            .replace(/\*/g, '\x00') // * → single null
            .replace(/\?/g, '\x01'); // ? → SOH
        // Now escape special regex characters (but NOT the placeholders or [])
        // We keep [] as-is since they're valid in both glob and regex
        regexPattern = regexPattern
            .replace(/[.+^${}()|\\]/g, '\$&');
        // Convert glob patterns to regex
        regexPattern = regexPattern
            .replace(/\x00\x00/g, '__DOUBLE_STAR__') // Restore ** as placeholder
            .replace(/\x00/g, '[^/]*') // * → match anything except /
            .replace(/\x01/g, '.'); // ? → match any single char
        // Handle ** properly
        // **/ matches zero or more directories
        regexPattern = regexPattern.replace(/__DOUBLE_STAR__\//g, '(?:.*/)?');
        regexPattern = regexPattern.replace(/__DOUBLE_STAR__/g, '.*');
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(key);
    }
    /**
     * Ensure lineage record exists and is up-to-date
     * Creates or updates the lineage tracking record
     * @private
     */
    async _ensureLineage(lineageUuid, stateMeta) {
        if (!lineageUuid) {
            throw new TfStateError('Lineage UUID is required for state tracking');
        }
        // Try to get existing lineage record
        const [getOk, getErr, existingLineage] = await tryFn(async () => {
            return await this.lineagesResource.get(lineageUuid);
        });
        const currentTime = Date.now();
        if (existingLineage) {
            // Update existing lineage record
            const updates = {
                lastImportedAt: currentTime
            };
            // Update latest serial if this is newer
            if (stateMeta.serial > (existingLineage.latestSerial || 0)) {
                updates.latestSerial = stateMeta.serial;
                updates.latestStateId = stateMeta.stateFileId;
            }
            // Increment total states counter
            if (existingLineage.totalStates !== undefined) {
                updates.totalStates = existingLineage.totalStates + 1;
            }
            else {
                updates.totalStates = 1;
            }
            await this.lineagesResource.update(lineageUuid, updates);
            this.logger.debug('Updated lineage: ${lineageUuid} (serial ${stateMeta.serial})');
            return { ...existingLineage, ...updates };
        }
        else {
            // Create new lineage record
            const lineageRecord = {
                id: lineageUuid,
                latestSerial: stateMeta.serial,
                latestStateId: stateMeta.stateFileId,
                totalStates: 1,
                firstImportedAt: currentTime,
                lastImportedAt: currentTime,
                metadata: {}
            };
            await this.lineagesResource.insert(lineageRecord);
            this.logger.debug('Created new lineage: ${lineageUuid}');
            return lineageRecord;
        }
    }
    /**
     * Import Terraform/OpenTofu state from file
     */
    async importState(filePath) {
        const startTime = Date.now();
        this.logger.debug('Importing state from: ${filePath}');
        // Read and parse state file
        const state = await this._readStateFile(filePath);
        // Validate state version
        this._validateStateVersion(state);
        // Calculate SHA256 hash for deduplication
        const sha256Hash = this._calculateSHA256(state);
        // Check if this exact state already exists (by SHA256)
        const existingByHash = await this.stateFilesResource.query({ sha256Hash }, { limit: 1 });
        if (existingByHash.length > 0) {
            // Exact same state already imported, skip
            const existing = existingByHash[0];
            this.logger.debug('State already imported (SHA256 match), skipping');
            return {
                skipped: true,
                reason: 'duplicate',
                serial: state.serial,
                stateFileId: existing.id,
                sha256Hash
            };
        }
        const currentTime = Date.now();
        // Extract lineage UUID (required for lineage-based tracking)
        const lineageUuid = state.lineage;
        if (!lineageUuid) {
            throw new TfStateError('State file missing lineage field - cannot track state progression', {
                filePath,
                serial: state.serial
            });
        }
        // Create state file record with lineageId
        const stateFileRecord = {
            id: idGenerator(),
            lineageId: lineageUuid, // NEW: FK to lineages
            sourceFile: filePath,
            serial: state.serial,
            lineage: state.lineage, // Denormalized for queries
            terraformVersion: state.terraform_version,
            stateVersion: state.version,
            resourceCount: (state.resources || []).length,
            sha256Hash,
            importedAt: currentTime
        };
        const [insertOk, insertErr, stateFileResult] = await tryFn(async () => {
            return await this.stateFilesResource.insert(stateFileRecord);
        });
        if (!insertOk) {
            throw new TfStateError(`Failed to save state file metadata: ${insertErr.message}`, {
                originalError: insertErr
            });
        }
        const stateFileId = stateFileResult.id;
        // Ensure lineage record exists and is updated
        await this._ensureLineage(lineageUuid, {
            serial: state.serial,
            stateFileId
        });
        // Extract resources with stateFileId and lineageId
        const resources = await this._extractResources(state, filePath, stateFileId, lineageUuid);
        // Insert resources BEFORE diff calculation so they're available for querying
        const inserted = await this._insertResources(resources);
        // Calculate diff if enabled (using lineage-based tracking)
        let diff = null;
        let diffRecord = null;
        if (this.trackDiffs) {
            diff = await this._calculateDiff(state, lineageUuid, stateFileId);
            // Save diff to diffsResource
            if (diff && !diff.isFirst) {
                diffRecord = await this._saveDiff(diff, lineageUuid, stateFileId);
            }
        }
        // Update last processed serial
        this.lastProcessedSerial = state.serial;
        // Update statistics
        this.stats.statesProcessed++;
        this.stats.resourcesExtracted += (resources.totalExtracted || resources.length);
        this.stats.resourcesInserted += inserted.length;
        this.stats.lastProcessedSerial = state.serial;
        if (diff && !diff.isFirst)
            this.stats.diffsCalculated++;
        const duration = Date.now() - startTime;
        const result = {
            serial: state.serial,
            lineage: state.lineage,
            terraformVersion: state.terraform_version,
            resourcesExtracted: (resources.totalExtracted || resources.length),
            resourcesInserted: inserted.length,
            stateFileId,
            sha256Hash,
            diff: diff ? {
                added: diff.added.length,
                modified: diff.modified.length,
                deleted: diff.deleted.length,
                isFirst: diff.isFirst || false
            } : null,
            duration
        };
        this.logger.debug({ result }, `Import completed:`);
        this.emit('stateImported', result);
        return result;
    }
    /**
     * Read and parse Tfstate file
     * @private
     */
    async _readStateFile(filePath) {
        if (!existsSync(filePath)) {
            throw new StateFileNotFoundError(filePath);
        }
        const [ok, err, content] = await tryFn(async () => {
            return await readFile(filePath, 'utf-8');
        });
        if (!ok) {
            throw new InvalidStateFileError(filePath, `Failed to read file: ${err.message}`);
        }
        const [parseOk, parseErr, state] = await tryFn(async () => {
            return JSON.parse(content);
        });
        if (!parseOk) {
            throw new InvalidStateFileError(filePath, `Invalid JSON: ${parseErr.message}`);
        }
        return state;
    }
    /**
     * Validate basic state structure
     * @private
     */
    _validateState(state, filePath) {
        if (!state || typeof state !== 'object') {
            throw new InvalidStateFileError(filePath, 'State must be a valid JSON object');
        }
        if (!state.version) {
            throw new InvalidStateFileError(filePath, 'Missing version field');
        }
        if (state.serial === undefined) {
            throw new InvalidStateFileError(filePath, 'Missing serial field');
        }
    }
    /**
     * Validate Tfstate version
     * @private
     */
    _validateStateVersion(state) {
        const version = state.version;
        if (!version) {
            throw new InvalidStateFileError('unknown', 'Missing version field');
        }
        if (!this.supportedVersions.includes(version)) {
            throw new UnsupportedStateVersionError(version, this.supportedVersions);
        }
    }
    /**
     * Extract resources from Tfstate
     * @private
     */
    async _extractResources(state, filePath, stateFileId, lineageId) {
        const resources = [];
        let totalExtracted = 0;
        const stateSerial = state.serial;
        const stateVersion = state.version;
        const importedAt = Date.now();
        // Extract resources from state (format varies by version)
        const stateResources = state.resources || [];
        for (const resource of stateResources) {
            try {
                // Extract instances (can be multiple for count/for_each)
                const instances = resource.instances || [resource];
                for (const instance of instances) {
                    totalExtracted++; // Count all extracted resources before filtering
                    const extracted = this._extractResourceInstance(resource, instance, stateSerial, stateVersion, importedAt, filePath, // Pass source file path
                    stateFileId, // Pass state file ID (foreign key)
                    lineageId // NEW: Pass lineage ID (foreign key)
                    );
                    // Apply filters
                    if (this._shouldIncludeResource(extracted)) {
                        resources.push(extracted);
                    }
                }
            }
            catch (error) {
                this.stats.errors++;
                this.logger.error({ error: error }, `Failed to extract resource:`);
                throw new ResourceExtractionError(resource.name || 'unknown', error);
            }
        }
        // Store total extracted count as metadata on the returned array
        resources.totalExtracted = totalExtracted;
        return resources;
    }
    /**
     * Extract single resource instance
     * @private
     */
    _extractResourceInstance(resource, instance, stateSerial, stateVersion, importedAt, sourceFile, stateFileId, lineageId) {
        const resourceType = resource.type;
        const resourceName = resource.name;
        const mode = resource.mode || 'managed';
        // Detect provider from resource type (e.g., aws_instance → aws)
        const providerName = this._detectProvider(resourceType);
        // Generate address (e.g., aws_instance.web_server or data.aws_ami.ubuntu)
        const resourceAddress = mode === 'data'
            ? `data.${resourceType}.${resourceName}`
            : `${resourceType}.${resourceName}`;
        // Extract attributes
        const attributes = instance.attributes || instance.attributes_flat || {};
        // Extract dependencies
        const dependencies = resource.depends_on || instance.depends_on || [];
        return {
            id: idGenerator(),
            stateFileId, // Foreign key to state_files
            lineageId, // NEW: Foreign key to lineages
            stateSerial, // Denormalized for fast queries
            sourceFile: sourceFile || null, // Denormalized for informational purposes
            resourceType,
            resourceName,
            resourceAddress,
            providerName,
            mode,
            attributes,
            dependencies,
            importedAt
        };
    }
    /**
     * Detect provider from resource type
     * @private
     */
    _detectProvider(resourceType) {
        if (!resourceType)
            return 'unknown';
        // Extract prefix (everything before first underscore)
        const prefix = resourceType.split('_')[0];
        // Provider map
        const providerMap = {
            'aws': 'aws',
            'google': 'google',
            'azurerm': 'azure',
            'azuread': 'azure',
            'azuredevops': 'azure',
            'kubernetes': 'kubernetes',
            'helm': 'kubernetes',
            'random': 'random',
            'null': 'null',
            'local': 'local',
            'time': 'time',
            'tls': 'tls',
            'http': 'http',
            'external': 'external',
            'terraform': 'terraform',
            'datadog': 'datadog',
            'cloudflare': 'cloudflare',
            'github': 'github',
            'gitlab': 'gitlab',
            'vault': 'vault'
        };
        return providerMap[prefix] || 'unknown';
    }
    /**
     * Check if resource should be included based on filters
     * @private
     */
    _shouldIncludeResource(resource) {
        const { types, providers, exclude, include } = this.filters;
        // Include filter (allowlist)
        if (include && include.length > 0) {
            const matches = include.some(pattern => {
                return this._matchesPattern(resource.resourceAddress, pattern);
            });
            if (!matches)
                return false;
        }
        // Type filter
        if (types && types.length > 0) {
            if (!types.includes(resource.resourceType)) {
                return false;
            }
        }
        // Provider filter
        if (providers && providers.length > 0) {
            if (!providers.includes(resource.providerName)) {
                return false;
            }
        }
        // Exclude filter (blocklist)
        if (exclude && exclude.length > 0) {
            const matches = exclude.some(pattern => {
                return this._matchesPattern(resource.resourceAddress, pattern);
            });
            if (matches)
                return false;
        }
        return true;
    }
    /**
     * Match resource address against pattern (supports wildcards)
     * @private
     */
    _matchesPattern(address, pattern) {
        // Convert pattern to regex (simple wildcard support)
        // Handle .* as wildcard sequence, escape other dots
        const regexPattern = pattern
            .replace(/\.\*/g, '___WILDCARD___') // Protect .* wildcards
            .replace(/\*/g, '[^.]*') // * matches anything except dots
            .replace(/\./g, '\\.') // Escape remaining literal dots
            .replace(/___WILDCARD___/g, '.*'); // Restore .* wildcards
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(address);
    }
    /**
     * Calculate diff between current and previous state
     * NEW: Uses lineage-based tracking for O(1) lookup
     * @private
     */
    async _calculateDiff(currentState, lineageId, currentStateFileId) {
        if (!this.diffsResource)
            return null;
        const currentSerial = currentState.serial;
        // O(1) lookup: Direct partition query for previous state
        // NEW: Uses byLineageSerial partition for efficient lookup
        const previousStateFiles = await this.stateFilesResource.listPartition({
            partition: 'byLineageSerial',
            partitionValues: { lineageId, serial: currentSerial - 1 }
        });
        this.logger.debug({ count: previousStateFiles.length, lineageId, serial: currentSerial - 1 }, `Diff calculation (lineage-based): found ${previousStateFiles.length} previous states for lineage=${lineageId}, serial=${currentSerial - 1}`);
        if (previousStateFiles.length === 0) {
            // First state for this lineage, no diff
            this.logger.debug('First state for lineage ${lineageId}, no previous state');
            return {
                added: [],
                modified: [],
                deleted: [],
                isFirst: true,
                oldSerial: null,
                newSerial: currentSerial,
                oldStateId: null,
                newStateId: currentStateFileId,
                lineageId
            };
        }
        const previousStateFile = previousStateFiles[0];
        const previousSerial = previousStateFile.serial;
        const previousStateFileId = previousStateFile.id;
        this.logger.debug({ previousSerial, previousStateFileId }, `Using previous state: serial ${previousSerial} (id: ${previousStateFileId})`);
        const [ok, err, diff] = await tryFn(async () => {
            return await this._computeDiff(previousSerial, currentSerial, lineageId);
        });
        if (!ok) {
            throw new StateDiffError(previousSerial, currentSerial, err);
        }
        // Add metadata to diff
        diff.oldSerial = previousSerial;
        diff.newSerial = currentSerial;
        diff.oldStateId = previousStateFileId;
        diff.newStateId = currentStateFileId;
        diff.lineageId = lineageId;
        return diff;
    }
    /**
     * Compute diff between two state serials
     * NEW: Uses lineage-based partition for efficient resource lookup
     * @private
     */
    async _computeDiff(oldSerial, newSerial, lineageId) {
        // NEW: Use lineage-based partition for O(1) lookup
        const partitionName = 'byLineageSerial';
        let oldResources, newResources;
        // Efficient: Use lineage-based partition queries (O(1) per serial)
        this.stats.partitionQueriesOptimized += 2;
        [oldResources, newResources] = await Promise.all([
            this.resource.listPartition({
                partition: partitionName,
                partitionValues: { lineageId, stateSerial: oldSerial }
            }),
            this.resource.listPartition({
                partition: partitionName,
                partitionValues: { lineageId, stateSerial: newSerial }
            })
        ]);
        this.logger.debug({ oldCount: oldResources.length, newCount: newResources.length }, `Diff computation using lineage partition: ${oldResources.length} old + ${newResources.length} new resources`);
        // Fallback removed - lineage-based partitions are always available
        if (oldResources.length === 0 && newResources.length === 0) {
            this.logger.debug('No resources found for either serial');
            return {
                added: [],
                modified: [],
                deleted: []
            };
        }
        // Create maps for easier lookup by resourceAddress
        const oldMap = new Map(oldResources.map((r) => [r.resourceAddress, r]));
        const newMap = new Map(newResources.map((r) => [r.resourceAddress, r]));
        const added = [];
        const modified = [];
        const deleted = [];
        // Find added and modified
        for (const [address, newResource] of newMap) {
            if (!oldMap.has(address)) {
                added.push({
                    address,
                    type: newResource.resourceType,
                    name: newResource.resourceName
                });
            }
            else {
                // Check if modified (simple attribute comparison)
                const oldResource = oldMap.get(address);
                if (JSON.stringify(oldResource.attributes) !== JSON.stringify(newResource.attributes)) {
                    modified.push({
                        address,
                        type: newResource.resourceType,
                        name: newResource.resourceName,
                        changes: this._computeAttributeChanges(oldResource.attributes, newResource.attributes)
                    });
                }
            }
        }
        // Find deleted
        for (const [address, oldResource] of oldMap) {
            if (!newMap.has(address)) {
                deleted.push({
                    address,
                    type: oldResource.resourceType,
                    name: oldResource.resourceName
                });
            }
        }
        return { added, modified, deleted, oldSerial, newSerial };
    }
    /**
     * Compute changes between old and new attributes
     * @private
     */
    _computeAttributeChanges(oldAttrs, newAttrs) {
        const changes = [];
        const allKeys = new Set([...Object.keys(oldAttrs || {}), ...Object.keys(newAttrs || {})]);
        for (const key of allKeys) {
            const oldValue = oldAttrs?.[key];
            const newValue = newAttrs?.[key];
            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                changes.push({
                    field: key,
                    oldValue,
                    newValue
                });
            }
        }
        return changes;
    }
    /**
     * Save diff to diffsResource
     * NEW: Includes lineage-based fields for efficient querying
     * @private
     */
    async _saveDiff(diff, lineageId, newStateFileId) {
        const diffRecord = {
            id: idGenerator(),
            lineageId: diff.lineageId || lineageId, // NEW: FK to lineages
            oldSerial: diff.oldSerial,
            newSerial: diff.newSerial,
            oldStateId: diff.oldStateId, // NEW: FK to state_files
            newStateId: diff.newStateId || newStateFileId, // NEW: FK to state_files
            calculatedAt: Date.now(),
            summary: {
                addedCount: diff.added.length,
                modifiedCount: diff.modified.length,
                deletedCount: diff.deleted.length
            },
            changes: {
                added: diff.added,
                modified: diff.modified,
                deleted: diff.deleted
            }
        };
        const [ok, err, result] = await tryFn(async () => {
            return await this.diffsResource.insert(diffRecord);
        });
        if (!ok) {
            this.logger.error({ error: err }, `Failed to save diff:`);
            throw new TfStateError(`Failed to save diff: ${err.message}`, {
                originalError: err
            });
        }
        return result;
    }
    /**
     * Calculate SHA256 hash of state content
     * @private
     */
    _calculateSHA256(state) {
        const stateString = JSON.stringify(state);
        return createHash('sha256').update(stateString).digest('hex');
    }
    /**
     * Insert resources into database with controlled parallelism
     * @private
     */
    async _insertResources(resources) {
        if (resources.length === 0)
            return [];
        const inserted = [];
        const parallelism = this.database.parallelism || 10;
        // Process in batches to control parallelism
        for (let i = 0; i < resources.length; i += parallelism) {
            const batch = resources.slice(i, i + parallelism);
            const batchPromises = batch.map(async (resource) => {
                const [ok, err, result] = await tryFn(async () => {
                    return await this.resource.insert(resource);
                });
                if (ok) {
                    return { success: true, result };
                }
                else {
                    this.stats.errors++;
                    this.logger.error({ error: err }, `Failed to insert resource ${resource.resourceAddress}:`);
                    return { success: false, error: err };
                }
            });
            const batchResults = await Promise.all(batchPromises);
            // Collect successful inserts
            batchResults.forEach(br => {
                if (br.success) {
                    inserted.push(br.result);
                }
            });
        }
        if (resources.length > parallelism) {
            this.logger.debug({ inserted: inserted.length, total: resources.length, parallelism }, `Batch inserted ${inserted.length}/${resources.length} resources (parallelism: ${parallelism})`);
        }
        return inserted;
    }
    /**
     * Setup cron-based monitoring for state file changes
     * @private
     */
    async _setupCronMonitoring() {
        if (!this.driver) {
            throw new TfStateError('Cannot setup monitoring without a driver');
        }
        this.logger.debug('Setting up cron monitoring: ${this.monitorCron}');
        // Validate plugin dependencies are installed
        await requirePluginDependency('tfstate-plugin');
        // Dynamically import node-cron
        const [ok, err, cronModule] = await tryFn(() => import('node-cron'));
        if (!ok) {
            throw new TfStateError(`Failed to import node-cron: ${err.message}`);
        }
        const cron = cronModule.default;
        // Validate cron expression
        if (!cron.validate(this.monitorCron)) {
            throw new TfStateError(`Invalid cron expression: ${this.monitorCron}`);
        }
        // Create cron task
        this.cronTask = cron.schedule(this.monitorCron, async () => {
            try {
                await this._monitorStateFiles();
            }
            catch (error) {
                this.stats.errors++;
                this.logger.error({ error: error.message }, 'Monitoring error');
                this.emit('monitoringError', { error: error.message });
            }
        });
        this.logger.debug('Cron monitoring started');
        this.emit('monitoringStarted', { cron: this.monitorCron });
    }
    /**
     * Monitor state files for changes
     * Called by cron task
     * @private
     */
    async _monitorStateFiles() {
        if (!this.driver)
            return;
        this.logger.debug('Checking for state file changes...');
        const startTime = Date.now();
        try {
            // List all state files matching selector
            const stateFiles = await this.driver.listStateFiles();
            this.logger.debug('Found ${stateFiles.length} state files');
            // Process each state file
            let changedFiles = 0;
            let newFiles = 0;
            for (const fileMetadata of stateFiles) {
                try {
                    // Check if this file exists in our database
                    const existing = await this.stateFilesResource.query({
                        sourceFile: fileMetadata.path
                    }, { limit: 1, sort: { serial: -1 } });
                    let shouldProcess = false;
                    if (existing.length === 0) {
                        // New file
                        shouldProcess = true;
                        newFiles++;
                    }
                    else {
                        // Check if file has been modified
                        const lastImported = existing[0].importedAt;
                        const hasChanged = await this.driver.hasBeenModified(fileMetadata.path, new Date(lastImported));
                        if (hasChanged) {
                            shouldProcess = true;
                            changedFiles++;
                        }
                    }
                    if (shouldProcess) {
                        // Read and import the state file
                        const state = await this.driver.readStateFile(fileMetadata.path);
                        // Validate and process
                        this._validateState(state, fileMetadata.path);
                        this._validateStateVersion(state);
                        // Calculate SHA256
                        const sha256Hash = this._calculateSHA256(state);
                        // Check for duplicates
                        const duplicates = await this.stateFilesResource.query({ sha256Hash }, { limit: 1 });
                        if (duplicates.length > 0) {
                            // Skip duplicate
                            this.logger.debug('Skipped duplicate: ${fileMetadata.path}');
                            continue;
                        }
                        // Create state file record
                        const currentTime = Date.now();
                        const stateFileRecord = {
                            id: idGenerator(),
                            sourceFile: fileMetadata.path,
                            serial: state.serial,
                            lineage: state.lineage,
                            terraformVersion: state.terraform_version,
                            stateVersion: state.version,
                            resourceCount: (state.resources || []).length,
                            sha256Hash,
                            importedAt: currentTime
                        };
                        const [insertOk, insertErr, stateFileResult] = await tryFn(async () => {
                            return await this.stateFilesResource.insert(stateFileRecord);
                        });
                        if (!insertOk) {
                            throw new TfStateError(`Failed to save state file: ${insertErr.message}`);
                        }
                        const stateFileId = stateFileResult.id;
                        // Extract resources
                        // Note: Using fileMetadata.path as lineageId/sourceFile? importStateFromS3 uses it as lineageId in diff logic.
                        // importState uses actual lineageId from file. 
                        // Let's assume _extractResources and _calculateDiff expect lineageId as last param.
                        // But here we don't pass lineageId?
                        // Original JS: `const resources = await this._extractResources(state, fileMetadata.path, stateFileId);`
                        // It's missing lineageId again.
                        const resources = await this._extractResources(state, fileMetadata.path, stateFileId, state.lineage || null);
                        // Calculate diff if enabled
                        if (this.trackDiffs) {
                            // Original JS: `const diff = await this._calculateDiff(state, fileMetadata.path, stateFileId);`
                            // It passes path as lineageId.
                            // I will follow JS for now to avoid breaking logic if it relies on this quirk.
                            const diff = await this._calculateDiff(state, fileMetadata.path, stateFileId);
                            if (diff && !diff.isFirst) {
                                await this._saveDiff(diff, fileMetadata.path, stateFileId);
                                this.stats.diffsCalculated++;
                            }
                        }
                        // Insert resources
                        const inserted = await this._insertResources(resources);
                        // Update stats
                        this.stats.statesProcessed++;
                        this.stats.resourcesExtracted += (resources.totalExtracted || resources.length);
                        this.stats.resourcesInserted += inserted.length;
                        this.stats.lastProcessedSerial = state.serial;
                        this.logger.debug('Processed ${fileMetadata.path}: ${resources.totalExtracted || resources.length} resources');
                        this.emit('stateFileProcessed', {
                            path: fileMetadata.path,
                            serial: state.serial,
                            resourcesExtracted: (resources.totalExtracted || resources.length),
                            resourcesInserted: inserted.length
                        });
                    }
                }
                catch (error) {
                    this.stats.errors++;
                    this.logger.error({ error: error }, `Failed to process ${fileMetadata.path}:`);
                    this.emit('processingError', {
                        path: fileMetadata.path,
                        error: error.message
                    });
                }
            }
            const duration = Date.now() - startTime;
            const result = {
                totalFiles: stateFiles.length,
                newFiles,
                changedFiles,
                duration
            };
            this.logger.debug({ result }, `Monitoring completed:`);
            this.emit('monitoringCompleted', result);
            return result;
        }
        catch (error) {
            this.stats.errors++;
            this.logger.error({ error: error.message }, 'Monitoring failed');
            throw error;
        }
    }
    /**
     * Setup file watchers for auto-sync
     * @private
     */
    async _setupFileWatchers() {
        for (const path of this.watchPaths) {
            try {
                const watcher = watch(path);
                (async () => {
                    for await (const event of watcher) {
                        if (event.eventType === 'change' && event.filename && event.filename.endsWith('.tfstate')) {
                            const filePath = `${path}/${event.filename}`;
                            this.logger.debug('Detected change: ${filePath}');
                            try {
                                await this.importState(filePath);
                            }
                            catch (error) {
                                this.stats.errors++;
                                this.logger.error(`[TfStatePlugin] Auto-import failed: ${error.message}`);
                                this.emit('importError', { filePath, error });
                            }
                        }
                    }
                })();
                this.watchers.push(watcher);
                this.logger.debug('Watching: ${path}');
            }
            catch (error) {
                throw new FileWatchError(path, error);
            }
        }
    }
    /**
     * Export resources to Tfstate format
     */
    async exportState(options = {}) {
        const { serial, resourceTypes, terraformVersion = '1.5.0', lineage, outputs = {}, sourceFile // Optional: export from specific source file
         } = options;
        // Determine which serial to export
        let targetSerial = serial;
        if (!targetSerial) {
            // Get latest serial from state files
            const queryFilter = sourceFile ? { sourceFile } : {};
            const latestStateFiles = await this.stateFilesResource.query(queryFilter, {
                limit: 1,
                sort: { serial: -1 }
            });
            if (latestStateFiles.length > 0) {
                targetSerial = latestStateFiles[0].serial;
            }
            // If still no serial, use lastProcessedSerial or 1
            if (!targetSerial) {
                targetSerial = this.lastProcessedSerial || 1;
            }
        }
        // Query resources for this serial - use partition if available
        const partitionName = this._findPartitionByField(this.resource, 'stateSerial');
        let resources;
        if (partitionName) {
            // Efficient: Use partition query (O(1))
            this.stats.partitionQueriesOptimized++;
            resources = await this.resource.list({
                partition: partitionName,
                partitionValues: { stateSerial: targetSerial }
            });
            this.logger.debug({ partitionName, resourceCount: resources.length }, `Export using partition ${partitionName}: ${resources.length} resources`);
            // Filter by resource types if specified (query() doesn't support $in operator)
            if (resourceTypes && resourceTypes.length > 0) {
                resources = resources.filter((r) => resourceTypes.includes(r.resourceType));
            }
        }
        else {
            // Fallback: Load all and filter (query() doesn't support $in operator)
            this.logger.debug('No partition found for stateSerial, using full scan');
            const allResources = await this.resource.list({ limit: 100000 });
            resources = allResources.filter((r) => {
                if (r.stateSerial !== targetSerial)
                    return false;
                if (resourceTypes && resourceTypes.length > 0) {
                    return resourceTypes.includes(r.resourceType);
                }
                return true;
            });
        }
        this.logger.debug({ resourceCount: resources.length, serial: targetSerial }, `Exporting ${resources.length} resources from serial ${targetSerial}`);
        // Group resources by type+name to reconstruct Terraform structure
        const resourceMap = new Map();
        for (const resource of resources) {
            const key = `${resource.mode}.${resource.resourceType}.${resource.resourceName}`;
            if (!resourceMap.has(key)) {
                resourceMap.set(key, {
                    mode: resource.mode || 'managed',
                    type: resource.resourceType,
                    name: resource.resourceName,
                    provider: resource.providerName,
                    instances: []
                });
            }
            // Add instance
            resourceMap.get(key).instances.push({
                attributes: resource.attributes,
                dependencies: resource.dependencies || []
            });
        }
        // Sort instances deterministically for each resource group
        for (const resourceGroup of resourceMap.values()) {
            resourceGroup.instances.sort((a, b) => {
                // Sort by attributes.id if available (most common identifier)
                const aId = a.attributes?.id;
                const bId = b.attributes?.id;
                if (aId && bId) {
                    return String(aId).localeCompare(String(bId));
                }
                // Fallback: sort by stringified attributes for deterministic ordering
                return JSON.stringify(a.attributes).localeCompare(JSON.stringify(b.attributes));
            });
        }
        // Convert map to array
        const terraformResources = Array.from(resourceMap.values());
        // Generate or use provided lineage
        const stateLineage = lineage || `s3db-export-${Date.now()}`;
        // Construct state object
        const state = {
            version: 4,
            terraform_version: terraformVersion,
            serial: targetSerial,
            lineage: stateLineage,
            outputs,
            resources: terraformResources
        };
        this.logger.debug({ serial: targetSerial, resourceCount: resources.length, groupedResourceCount: terraformResources.length }, 'Export complete');
        this.emit('stateExported', { serial: targetSerial, resourceCount: resources.length });
        return state;
    }
    /**
     * Export state to local file
     */
    async exportStateToFile(filePath, options = {}) {
        const state = await this.exportState(options);
        // We already imported writeFileSync at top level, but dynamic import was used in JS
        // I'll use the top level one
        writeFileSync(filePath, JSON.stringify(state, null, 2));
        this.logger.debug('State exported to file: ${filePath}');
        return {
            filePath,
            serial: state.serial,
            resourceCount: state.resources.reduce((sum, r) => sum + r.instances.length, 0),
            groupedResourceCount: state.resources.length
        };
    }
    /**
     * Export state to S3
     */
    async exportStateToS3(bucket, key, options = {}) {
        const state = await this.exportState(options);
        const client = options.client || this.database.client;
        await client.putObject({
            key: key,
            body: JSON.stringify(state, null, 2),
            contentType: 'application/json'
        });
        this.logger.debug('State exported to S3: s3://${bucket}/${key}');
        this.emit('stateExportedToS3', { bucket, key, serial: state.serial });
        return {
            bucket,
            key,
            location: `s3://${bucket}/${key}`,
            serial: state.serial,
            resourceCount: state.resources.reduce((sum, r) => sum + r.instances.length, 0),
            groupedResourceCount: state.resources.length
        };
    }
    /**
     * Get diffs with lookback support
     */
    async getDiffsWithLookback(sourceFile, options = {}) {
        if (!this.diffsResource) {
            throw new TfStateError('Diff tracking is not enabled for this plugin');
        }
        const lookback = options.lookback || this.diffsLookback;
        const includeDetails = options.includeDetails || false;
        // Query diffs for this source file
        const diffs = await this.diffsResource.query({ sourceFile }, {
            limit: lookback,
            sort: { newSerial: -1 } // Newest first
        });
        if (!includeDetails) {
            // Return only summary information
            return diffs.map((diff) => ({
                id: diff.id,
                oldSerial: diff.oldSerial,
                newSerial: diff.newSerial,
                calculatedAt: diff.calculatedAt,
                summary: diff.summary
            }));
        }
        return diffs;
    }
    /**
     * Get diff timeline for a state file
     */
    async getDiffTimeline(sourceFile, options = {}) {
        const diffs = await this.getDiffsWithLookback(sourceFile, {
            ...options,
            includeDetails: false
        });
        // Calculate cumulative statistics
        const timeline = {
            sourceFile,
            totalDiffs: diffs.length,
            summary: {
                totalAdded: 0,
                totalModified: 0,
                totalDeleted: 0,
                serialRange: {
                    oldest: diffs.length > 0 ? Math.min(...diffs.map((d) => d.oldSerial)) : null,
                    newest: diffs.length > 0 ? Math.max(...diffs.map((d) => d.newSerial)) : null
                },
                timeRange: {
                    first: diffs.length > 0 ? Math.min(...diffs.map((d) => d.calculatedAt)) : null,
                    last: diffs.length > 0 ? Math.max(...diffs.map((d) => d.calculatedAt)) : null
                }
            },
            diffs: diffs.reverse() // Oldest first for timeline view
        };
        // Sum up all changes
        for (const diff of diffs) {
            if (diff.summary) {
                timeline.summary.totalAdded += diff.summary.addedCount || 0;
                timeline.summary.totalModified += diff.summary.modifiedCount || 0;
                timeline.summary.totalDeleted += diff.summary.deletedCount || 0;
            }
        }
        return timeline;
    }
    /**
     * Compare two specific state serials
     */
    async compareStates(sourceFile, oldSerial, newSerial) {
        if (!this.diffsResource) {
            throw new TfStateError('Diff tracking is not enabled for this plugin');
        }
        const diffs = await this.diffsResource.query({
            sourceFile,
            oldSerial,
            newSerial
        }, { limit: 1 });
        if (diffs.length === 0) {
            // Diff doesn't exist yet, calculate it
            const [ok, err, result] = await tryFn(async () => {
                return await this._computeDiff(oldSerial, newSerial, sourceFile); // Assuming sourceFile is lineageId for compatibility
            });
            if (!ok) {
                throw new StateDiffError(oldSerial, newSerial, err);
            }
            // Add metadata
            result.sourceFile = sourceFile;
            result.oldSerial = oldSerial;
            result.newSerial = newSerial;
            return result;
        }
        return diffs[0];
    }
    /**
     * Trigger monitoring check manually
     */
    async triggerMonitoring() {
        if (!this.driver) {
            throw new TfStateError('Driver not initialized. Use driver-based configuration to enable monitoring.');
        }
        return await this._monitorStateFiles();
    }
    /**
     * Get resources by type (uses partition for fast queries)
     */
    async getResourcesByType(type) {
        return await this.resource.listPartition({
            partition: 'byType',
            partitionValues: { resourceType: type }
        });
    }
    /**
     * Get resources by provider (uses partition for fast queries)
     */
    async getResourcesByProvider(provider) {
        return await this.resource.listPartition({
            partition: 'byProvider',
            partitionValues: { providerName: provider }
        });
    }
    /**
     * Get resources by provider and type (uses partition for ultra-fast queries)
     */
    async getResourcesByProviderAndType(provider, type) {
        return await this.resource.listPartition({
            partition: 'byProviderAndType',
            partitionValues: {
                providerName: provider,
                resourceType: type
            }
        });
    }
    /**
     * Get diff between two state serials
     */
    async getDiff(sourceFile, oldSerial, newSerial) {
        return await this.compareStates(sourceFile, oldSerial, newSerial);
    }
    /**
     * Get statistics by provider
     */
    async getStatsByProvider() {
        const allResources = await this.resource.list({ limit: 100000 });
        const providerCounts = {};
        for (const resource of allResources) {
            const provider = resource.providerName || 'unknown';
            providerCounts[provider] = (providerCounts[provider] || 0) + 1;
        }
        return providerCounts;
    }
    /**
     * Get statistics by resource type
     */
    async getStatsByType() {
        const allResources = await this.resource.list({ limit: 100000 });
        const typeCounts = {};
        for (const resource of allResources) {
            const type = resource.resourceType;
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        }
        return typeCounts;
    }
    /**
     * Find partition by field name (for efficient queries)
     * Uses cache to avoid repeated lookups
     * @private
     */
    _findPartitionByField(resource, fieldName) {
        if (!resource.config.partitions)
            return null;
        // Check cache first
        const cacheKey = `${resource.name}:${fieldName}`;
        if (this._partitionCache.has(cacheKey)) {
            this.stats.partitionCacheHits++;
            return this._partitionCache.get(cacheKey);
        }
        // Find best partition for this field
        // Prefer single-field partitions over multi-field ones (more specific)
        let bestPartition = null;
        let bestFieldCount = Infinity;
        for (const [partitionName, partitionConfig] of Object.entries(resource.config.partitions)) {
            if (partitionConfig.fields && fieldName in partitionConfig.fields) {
                const fieldCount = Object.keys(partitionConfig.fields).length;
                // Prefer partitions with fewer fields (more specific)
                if (fieldCount < bestFieldCount) {
                    bestPartition = partitionName;
                    bestFieldCount = fieldCount;
                }
            }
        }
        // Cache the result (even if null, to avoid repeated lookups)
        this._partitionCache.set(cacheKey, bestPartition);
        return bestPartition;
    }
    /**
     * Get plugin statistics
     */
    async getStats() {
        // Get state files count
        const stateFiles = await this.stateFilesResource.list({ limit: 100000 });
        // Get resources and calculate breakdowns
        const allResources = await this.resource.list({ limit: 100000 });
        // Provider breakdown
        const providers = {};
        const types = {};
        for (const resource of allResources) {
            const provider = resource.providerName || 'unknown';
            const type = resource.resourceType;
            providers[provider] = (providers[provider] || 0) + 1;
            types[type] = (types[type] || 0) + 1;
        }
        // Get latest serial
        const latestSerial = stateFiles.length > 0
            ? Math.max(...stateFiles.map((sf) => sf.serial))
            : null;
        // Get diffs count
        const diffsCount = this.trackDiffs && this.diffsResource
            ? (await this.diffsResource.list({ limit: 100000 })).length
            : 0;
        return {
            totalStates: stateFiles.length,
            totalResources: allResources.length,
            totalDiffs: diffsCount,
            latestSerial,
            providers,
            types,
            // Runtime stats
            statesProcessed: this.stats.statesProcessed,
            resourcesExtracted: this.stats.resourcesExtracted,
            resourcesInserted: this.stats.resourcesInserted,
            diffsCalculated: this.stats.diffsCalculated,
            errors: this.stats.errors,
            partitionCacheHits: this.stats.partitionCacheHits,
            partitionQueriesOptimized: this.stats.partitionQueriesOptimized
        };
    }
}
//# sourceMappingURL=index.js.map