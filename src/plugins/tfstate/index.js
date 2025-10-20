/**
 * TfStatePlugin
 *
 * Reads Terraform/OpenTofu state files (.tfstate) and populates s3db resources with infrastructure data.
 * Tracks changes over time, enables historical analysis, and provides diff capabilities.
 *
 * **OpenTofu Compatibility**: This plugin is fully compatible with both Terraform and OpenTofu.
 * OpenTofu (https://opentofu.org) is an open-source fork of Terraform. Since OpenTofu maintains
 * backward compatibility with Terraform's state file format, this plugin works seamlessly with both.
 *
 * Features:
 * - Parse Terraform/OpenTofu state files (v3, v4)
 * - Import from local files or remote S3 buckets (Terraform S3 backend)
 * - Extract and normalize resource data
 * - Track state changes over time
 * - Calculate diffs between states
 * - Auto-sync with file watching (optional)
 * - Filter resources by type/name
 *
 * @example
 * // Basic usage with local state file
 * const plugin = new TfStatePlugin({
 *   resourceName: 'plg_tfstate_resources',
 *   trackDiffs: true,
 *   filters: {
 *     types: ['aws_instance', 'aws_s3_bucket'],
 *     exclude: ['data.*']
 *   }
 * });
 *
 * await database.usePlugin(plugin);
 *
 * // Import from local file
 * await plugin.importState('./terraform.tfstate');
 *
 * // Import from remote S3 state (Terraform S3 backend)
 * await plugin.importStateFromS3('my-terraform-state-bucket', 'prod/terraform.tfstate');
 */

import { readFile, watch } from 'fs/promises';
import { existsSync } from 'fs';
import { createHash } from 'crypto';
import cron from 'node-cron';
import { Plugin } from '../plugin.class.js';
import tryFn from '../../concerns/try-fn.js';
import { idGenerator } from '../../concerns/id.js';
import {
  TfStateError,
  InvalidStateFileError,
  UnsupportedStateVersionError,
  StateFileNotFoundError,
  ResourceExtractionError,
  StateDiffError,
  FileWatchError,
  ResourceFilterError
} from './errors.js';
import { S3TfStateDriver } from './s3-driver.js';
import { FilesystemTfStateDriver } from './filesystem-driver.js';

export class TfStatePlugin extends Plugin {
  constructor(config = {}) {
    super(config);

    // Detect new config format (driver-based) vs legacy
    const isNewFormat = config.driver !== undefined;

    if (isNewFormat) {
      // New driver-based configuration
      this.driverType = config.driver || 's3';
      this.driverConfig = config.config || {};

      // Resource names
      const resources = config.resources || {};
      this.resourceName = resources.resources || 'plg_tfstate_resources';
      this.stateFilesName = resources.stateFiles || 'plg_tfstate_state_files';
      this.diffsName = resources.diffs || 'plg_tfstate_state_diffs';

      // Monitoring configuration
      const monitor = config.monitor || {};
      this.monitorEnabled = monitor.enabled || false;
      this.monitorCron = monitor.cron || '*/5 * * * *'; // Default: every 5 minutes

      // Diff configuration
      const diffs = config.diffs || {};
      this.trackDiffs = diffs.enabled !== undefined ? diffs.enabled : true;
      this.diffsLookback = diffs.lookback || 10; // How many previous states to compare

      // Legacy fields for backward compatibility
      this.autoSync = false;
      this.watchPaths = [];
      this.filters = config.filters || {};
      this.verbose = config.verbose || false;
    } else {
      // Legacy configuration (backward compatible)
      this.driverType = null; // Will use legacy methods
      this.driverConfig = {};
      this.resourceName = config.resourceName || 'plg_tfstate_resources';
      this.stateFilesName = config.stateFilesName || 'plg_tfstate_state_files';
      this.diffsName = config.diffsName || 'plg_tfstate_state_diffs';
      this.autoSync = config.autoSync || false;
      this.watchPaths = Array.isArray(config.watchPaths) ? config.watchPaths : [];
      this.filters = config.filters || {};
      this.trackDiffs = config.trackDiffs !== undefined ? config.trackDiffs : true;
      this.diffsLookback = 10;
      this.verbose = config.verbose || false;
      this.monitorEnabled = false;
      this.monitorCron = '*/5 * * * *';
    }

    // Supported Terraform state versions
    this.supportedVersions = [3, 4];

    // Internal state
    this.driver = null; // Will be initialized in onInstall
    this.resource = null;
    this.stateFilesResource = null;
    this.diffsResource = null;
    this.watchers = [];
    this.cronTask = null;
    this.lastProcessedSerial = null;

    // Statistics
    this.stats = {
      statesProcessed: 0,
      resourcesExtracted: 0,
      resourcesInserted: 0,
      diffsCalculated: 0,
      errors: 0,
      lastProcessedSerial: null
    };
  }

  /**
   * Install the plugin
   * @override
   */
  async onInstall() {
    if (this.verbose) {
      console.log('[TfStatePlugin] Installing...');
    }

    // Initialize driver if using new config format
    if (this.driverType) {
      if (this.verbose) {
        console.log(`[TfStatePlugin] Initializing ${this.driverType} driver...`);
      }

      if (this.driverType === 's3') {
        this.driver = new S3TfStateDriver(this.driverConfig);
      } else if (this.driverType === 'filesystem') {
        this.driver = new FilesystemTfStateDriver(this.driverConfig);
      } else {
        throw new TfStateError(`Unsupported driver type: ${this.driverType}`);
      }

      await this.driver.initialize();

      if (this.verbose) {
        console.log(`[TfStatePlugin] Driver initialized successfully`);
      }
    }

    // Resource 1: Terraform State Files Metadata
    // Dedicated to tracking state file metadata with SHA256 hash for deduplication
    this.stateFilesResource = await this.database.createResource({
      name: this.stateFilesName,
      attributes: {
        id: 'string|required',
        sourceFile: 'string|required', // Full path or s3:// URI
        serial: 'number|required',
        lineage: 'string',
        terraformVersion: 'string',
        stateVersion: 'number|required',
        resourceCount: 'number',
        outputCount: 'number',
        sha256Hash: 'string|required', // SHA256 hash for deduplication
        // S3-specific metadata (if imported from S3)
        s3Bucket: 'string',
        s3Key: 'string',
        s3Region: 'string',
        // Import tracking
        firstImportedAt: 'number|required',
        lastImportedAt: 'number|required',
        importCount: 'number|required'
      },
      options: {
        timestamps: true,
        partitions: {
          bySourceFile: { fields: { sourceFile: 'string' } },
          bySerial: { fields: { serial: 'number' } },
          byLineage: { fields: { lineage: 'string' } },
          byImportDate: { fields: { firstImportedAt: 'number' } },
          byBucket: { fields: { s3Bucket: 'string' } },
          bySerialAndSource: { fields: { serial: 'number', sourceFile: 'string' } },
          bySha256: { fields: { sha256Hash: 'string' } }
        }
      },
      createdBy: 'TfStatePlugin'
    });

    // Resource 2: Terraform Resources
    // Store extracted resources with foreign key to state files
    this.resource = await this.database.createResource({
      name: this.resourceName,
      attributes: {
        id: 'string|required',
        stateFileId: 'string|required', // Foreign key to terraform_state_files
        // Denormalized fields for fast queries
        stateSerial: 'number|required',
        sourceFile: 'string|required',
        // Resource data
        resourceType: 'string|required',
        resourceName: 'string|required',
        resourceAddress: 'string|required',
        providerName: 'string',
        mode: 'string', // managed or data
        attributes: 'json',
        dependencies: 'array',
        importedAt: 'number|required',
        stateVersion: 'number'
      },
      options: {
        timestamps: true,
        partitions: {
          byType: { fields: { resourceType: 'string' } },
          bySerial: { fields: { stateSerial: 'number' } },
          bySourceFile: { fields: { sourceFile: 'string' } },
          byTypeAndSerial: { fields: { resourceType: 'string', stateSerial: 'number' } },
          bySourceAndSerial: { fields: { sourceFile: 'string', stateSerial: 'number' } },
          byMode: { fields: { mode: 'string' } },
          byImportDate: { fields: { importedAt: 'number' } }
        }
      },
      createdBy: 'TfStatePlugin'
    });

    // Resource 3: Terraform State Diffs
    // Track changes between state versions (if diff tracking enabled)
    if (this.trackDiffs) {
      this.diffsResource = await this.database.createResource({
        name: this.diffsName,
        attributes: {
          id: 'string|required',
          sourceFile: 'string|required',
          oldSerial: 'number|required',
          newSerial: 'number|required',
          oldStateFileId: 'string', // Foreign key to old state file
          newStateFileId: 'string|required', // Foreign key to new state file
          calculatedAt: 'number|required',
          // Summary statistics
          summary: {
            type: 'object',
            props: {
              addedCount: 'number',
              modifiedCount: 'number',
              deletedCount: 'number'
            }
          },
          // Detailed changes
          changes: {
            type: 'object',
            props: {
              added: 'array',
              modified: 'array',
              deleted: 'array'
            }
          }
        },
        options: {
          timestamps: true,
          partitions: {
            bySourceFile: { fields: { sourceFile: 'string' } },
            byNewSerial: { fields: { newSerial: 'number' } },
            byOldSerial: { fields: { oldSerial: 'number' } },
            bySourceAndNewSerial: { fields: { sourceFile: 'string', newSerial: 'number' } },
            byCalculatedDate: { fields: { calculatedAt: 'number' } }
          }
        },
        createdBy: 'TfStatePlugin'
      });
    }

    if (this.verbose) {
      const resourcesCreated = [this.stateFilesName, this.resourceName];
      if (this.trackDiffs) resourcesCreated.push(this.diffsName);
      console.log(`[TfStatePlugin] Created resources: ${resourcesCreated.join(', ')}`);
    }

    // Setup file watchers if autoSync is enabled (legacy mode)
    if (this.autoSync && this.watchPaths.length > 0) {
      await this._setupFileWatchers();
    }

    // Setup cron monitoring if enabled (new driver mode)
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
    if (this.verbose) {
      console.log('[TfStatePlugin] Started');
    }
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

      if (this.verbose) {
        console.log('[TfStatePlugin] Stopped cron monitoring');
      }
    }

    // Stop all file watchers (legacy mode)
    for (const watcher of this.watchers) {
      try {
        // fs.promises.watch returns an AsyncIterator with a return() method
        if (watcher && typeof watcher.return === 'function') {
          await watcher.return();
        } else if (watcher && typeof watcher.close === 'function') {
          await watcher.close();
        }
      } catch (error) {
        // Ignore errors when closing watchers
        if (this.verbose) {
          console.warn('[TfStatePlugin] Error closing watcher:', error.message);
        }
      }
    }
    this.watchers = [];

    // Close driver
    if (this.driver) {
      await this.driver.close();
      this.driver = null;

      if (this.verbose) {
        console.log('[TfStatePlugin] Driver closed');
      }
    }

    if (this.verbose) {
      console.log('[TfStatePlugin] Stopped');
    }
  }

  /**
   * Import Terraform/OpenTofu state from remote S3 bucket
   * @param {string} bucket - S3 bucket name
   * @param {string} key - S3 object key (path to .tfstate file)
   * @param {Object} options - Optional S3 client override
   * @returns {Promise<Object>} Import result with statistics
   */
  async importStateFromS3(bucket, key, options = {}) {
    const startTime = Date.now();
    const sourceFile = `s3://${bucket}/${key}`;

    if (this.verbose) {
      console.log(`[TfStatePlugin] Importing from S3: ${sourceFile}`);
    }

    try {
      // Use provided client or database client
      const client = options.client || this.database.client;

      // Fetch state from S3
      const [ok, err, data] = await tryFn(async () => {
        return await client.getObject({ Bucket: bucket, Key: key });
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
      } catch (parseError) {
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

      // Check if this exact state already exists (by SHA256)
      const existingByHash = await this.stateFilesResource.query({ sha256Hash }, { limit: 1 });

      if (existingByHash.length > 0) {
        // Exact same state already imported, just update import tracking
        const existing = existingByHash[0];
        await this.stateFilesResource.update(existing.id, {
          lastImportedAt: Date.now(),
          importCount: existing.importCount + 1
        });

        if (this.verbose) {
          console.log(`[TfStatePlugin] State already imported (SHA256 match), updated import tracking`);
        }

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

      // Extract region from client or options
      const region = options.region || this.database.client.config?.region || null;

      // Create state file record with S3 metadata
      const stateFileRecord = {
        id: idGenerator(),
        sourceFile,
        serial: state.serial,
        lineage: state.lineage,
        terraformVersion: state.terraform_version,
        stateVersion: state.version,
        resourceCount: (state.resources || []).length,
        outputCount: Object.keys(state.outputs || {}).length,
        sha256Hash,
        // S3-specific metadata
        s3Bucket: bucket,
        s3Key: key,
        s3Region: region,
        // Import tracking
        firstImportedAt: currentTime,
        lastImportedAt: currentTime,
        importCount: 1
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
      const resources = await this._extractResources(state, sourceFile, stateFileId);

      // Calculate diff if enabled
      let diff = null;
      let diffRecord = null;
      if (this.trackDiffs) {
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
      this.stats.resourcesExtracted += resources.length;
      this.stats.resourcesInserted += inserted.length;
      this.stats.lastProcessedSerial = state.serial;
      if (diff && !diff.isFirst) this.stats.diffsCalculated++;

      const duration = Date.now() - startTime;

      const result = {
        serial: state.serial,
        lineage: state.lineage,
        terraformVersion: state.terraform_version,
        resourcesExtracted: resources.length,
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

      if (this.verbose) {
        console.log(`[TfStatePlugin] S3 import completed:`, result);
      }

      this.emit('stateImported', result);

      return result;
    } catch (error) {
      this.stats.errors++;
      if (this.verbose) {
        console.error(`[TfStatePlugin] S3 import failed:`, error);
      }
      throw error;
    }
  }

  /**
   * Import multiple Terraform/OpenTofu states from S3 using glob pattern
   * @param {string} bucket - S3 bucket name
   * @param {string} pattern - Glob pattern for matching state files
   * @param {Object} options - Optional S3 client override and concurrency settings
   * @returns {Promise<Object>} Consolidated import result with statistics
   */
  async importStatesFromS3Glob(bucket, pattern, options = {}) {
    const startTime = Date.now();
    const client = options.client || this.database.client;
    const concurrency = options.concurrency || 5;

    if (this.verbose) {
      console.log(`[TfStatePlugin] Listing S3 objects: s3://${bucket}/${pattern}`);
    }

    try {
      // List all objects in the bucket
      const [ok, err, data] = await tryFn(async () => {
        const params = { Bucket: bucket };

        // Extract prefix from pattern (everything before first wildcard)
        const prefixMatch = pattern.match(/^([^*?[\]]+)/);
        if (prefixMatch) {
          params.Prefix = prefixMatch[1];
        }

        return await client.listObjectsV2(params);
      });

      if (!ok) {
        throw new TfStateError(`Failed to list objects in s3://${bucket}`, {
          originalError: err
        });
      }

      const allObjects = data.Contents || [];

      // Filter objects using glob pattern matching
      const matchingObjects = allObjects.filter(obj => {
        return this._matchesGlobPattern(obj.Key, pattern);
      });

      if (this.verbose) {
        console.log(`[TfStatePlugin] Found ${matchingObjects.length} matching files`);
      }

      if (matchingObjects.length === 0) {
        return {
          filesProcessed: 0,
          totalResourcesExtracted: 0,
          totalResourcesInserted: 0,
          files: [],
          duration: Date.now() - startTime
        };
      }

      // Import states with controlled concurrency
      const results = [];
      const files = [];

      for (let i = 0; i < matchingObjects.length; i += concurrency) {
        const batch = matchingObjects.slice(i, i + concurrency);

        const batchPromises = batch.map(async (obj) => {
          try {
            const result = await this.importStateFromS3(bucket, obj.Key, options);
            return { success: true, key: obj.Key, result };
          } catch (error) {
            if (this.verbose) {
              console.error(`[TfStatePlugin] Failed to import ${obj.Key}:`, error.message);
            }
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

      if (this.verbose) {
        console.log(`[TfStatePlugin] Glob import completed:`, consolidatedResult);
      }

      this.emit('globImportCompleted', consolidatedResult);

      return consolidatedResult;
    } catch (error) {
      this.stats.errors++;
      if (this.verbose) {
        console.error(`[TfStatePlugin] Glob import failed:`, error);
      }
      throw error;
    }
  }

  /**
   * Match S3 key against glob pattern
   * Simple glob matching supporting *, **, ?, and []
   * @private
   */
  _matchesGlobPattern(key, pattern) {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*\*/g, '__DOUBLE_STAR__')
      .replace(/\*/g, '[^/]*')
      .replace(/__DOUBLE_STAR__/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\[([^\]]+)\]/g, '[$1]');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(key);
  }

  /**
   * Import Terraform/OpenTofu state from file
   * @param {string} filePath - Path to .tfstate file
   * @returns {Promise<Object>} Import result with statistics
   */
  async importState(filePath) {
    const startTime = Date.now();

    if (this.verbose) {
      console.log(`[TfStatePlugin] Importing state from: ${filePath}`);
    }

    // Read and parse state file
    const state = await this._readStateFile(filePath);

    // Validate state version
    this._validateStateVersion(state);

    // Calculate SHA256 hash for deduplication
    const sha256Hash = this._calculateSHA256(state);

    // Check if this exact state already exists (by SHA256)
    const existingByHash = await this.stateFilesResource.query({ sha256Hash }, { limit: 1 });

    if (existingByHash.length > 0) {
      // Exact same state already imported, just update import tracking
      const existing = existingByHash[0];
      await this.stateFilesResource.update(existing.id, {
        lastImportedAt: Date.now(),
        importCount: existing.importCount + 1
      });

      if (this.verbose) {
        console.log(`[TfStatePlugin] State already imported (SHA256 match), updated import tracking`);
      }

      return {
        skipped: true,
        reason: 'duplicate',
        serial: state.serial,
        stateFileId: existing.id,
        sha256Hash
      };
    }

    const currentTime = Date.now();

    // Create or update state file record
    const stateFileRecord = {
      id: idGenerator(),
      sourceFile: filePath,
      serial: state.serial,
      lineage: state.lineage,
      terraformVersion: state.terraform_version,
      stateVersion: state.version,
      resourceCount: (state.resources || []).length,
      outputCount: Object.keys(state.outputs || {}).length,
      sha256Hash,
      s3Bucket: null,
      s3Key: null,
      s3Region: null,
      firstImportedAt: currentTime,
      lastImportedAt: currentTime,
      importCount: 1
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
    const resources = await this._extractResources(state, filePath, stateFileId);

    // Calculate diff if enabled
    let diff = null;
    let diffRecord = null;
    if (this.trackDiffs) {
      diff = await this._calculateDiff(state, filePath, stateFileId);

      // Save diff to diffsResource
      if (diff && !diff.isFirst) {
        diffRecord = await this._saveDiff(diff, filePath, stateFileId);
      }
    }

    // Insert resources
    const inserted = await this._insertResources(resources);

    // Update last processed serial
    this.lastProcessedSerial = state.serial;

    // Update statistics
    this.stats.statesProcessed++;
    this.stats.resourcesExtracted += resources.length;
    this.stats.resourcesInserted += inserted.length;
    this.stats.lastProcessedSerial = state.serial;
    if (diff && !diff.isFirst) this.stats.diffsCalculated++;

    const duration = Date.now() - startTime;

    const result = {
      serial: state.serial,
      lineage: state.lineage,
      terraformVersion: state.terraform_version,
      resourcesExtracted: resources.length,
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

    if (this.verbose) {
      console.log(`[TfStatePlugin] Import completed:`, result);
    }

    this.emit('stateImported', result);

    return result;
  }

  /**
   * Read and parse Terraform state file
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
   * Validate Terraform state version
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
   * Extract resources from Terraform state
   * @private
   */
  async _extractResources(state, filePath, stateFileId) {
    const resources = [];
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
          const extracted = this._extractResourceInstance(
            resource,
            instance,
            stateSerial,
            stateVersion,
            importedAt,
            filePath, // Pass source file path
            stateFileId // Pass state file ID (foreign key)
          );

          // Apply filters
          if (this._shouldIncludeResource(extracted)) {
            resources.push(extracted);
          }
        }
      } catch (error) {
        this.stats.errors++;

        if (this.verbose) {
          console.error(`[TfStatePlugin] Failed to extract resource:`, error);
        }

        throw new ResourceExtractionError(resource.name || 'unknown', error);
      }
    }

    return resources;
  }

  /**
   * Extract single resource instance
   * @private
   */
  _extractResourceInstance(resource, instance, stateSerial, stateVersion, importedAt, sourceFile, stateFileId) {
    const resourceType = resource.type;
    const resourceName = resource.name;
    const mode = resource.mode || 'managed';
    const providerName = resource.provider || '';

    // Generate address (e.g., aws_instance.web_server)
    const resourceAddress = `${resourceType}.${resourceName}`;

    // Extract attributes
    const attributes = instance.attributes || instance.attributes_flat || {};

    // Extract dependencies
    const dependencies = resource.depends_on || instance.depends_on || [];

    return {
      id: idGenerator(),
      stateFileId, // Foreign key to terraform_state_files
      stateSerial, // Denormalized for fast queries
      sourceFile: sourceFile || null, // Denormalized for fast queries
      resourceType,
      resourceName,
      resourceAddress,
      providerName,
      mode,
      attributes,
      dependencies,
      importedAt,
      stateVersion
    };
  }

  /**
   * Check if resource should be included based on filters
   * @private
   */
  _shouldIncludeResource(resource) {
    const { types, exclude, include } = this.filters;

    // Include filter (allowlist)
    if (include && include.length > 0) {
      const matches = include.some(pattern => {
        return this._matchesPattern(resource.resourceAddress, pattern);
      });
      if (!matches) return false;
    }

    // Type filter
    if (types && types.length > 0) {
      if (!types.includes(resource.resourceType)) {
        return false;
      }
    }

    // Exclude filter (blocklist)
    if (exclude && exclude.length > 0) {
      const matches = exclude.some(pattern => {
        return this._matchesPattern(resource.resourceAddress, pattern);
      });
      if (matches) return false;
    }

    return true;
  }

  /**
   * Match resource address against pattern (supports wildcards)
   * @private
   */
  _matchesPattern(address, pattern) {
    // Convert pattern to regex (simple wildcard support)
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(address);
  }

  /**
   * Calculate diff between current and previous state
   * @private
   */
  async _calculateDiff(currentState, sourceFile, currentStateFileId) {
    if (!this.diffsResource) return null;

    // Get previous state file for the same source
    const previousStateFiles = await this.stateFilesResource.query({
      sourceFile,
      serial: { $lt: currentState.serial }
    }, {
      limit: 1,
      sort: { serial: -1 }
    });

    if (previousStateFiles.length === 0) {
      // First state for this source, no diff
      return { added: [], modified: [], deleted: [], isFirst: true };
    }

    const previousStateFile = previousStateFiles[0];
    const previousSerial = previousStateFile.serial;

    const [ok, err, diff] = await tryFn(async () => {
      return await this._computeDiff(previousSerial, currentState.serial);
    });

    if (!ok) {
      throw new StateDiffError(previousSerial, currentState.serial, err);
    }

    // Add state file IDs to diff
    diff.oldSerial = previousSerial;
    diff.newSerial = currentState.serial;
    diff.oldStateFileId = previousStateFile.id;
    diff.newStateFileId = currentStateFileId;
    diff.sourceFile = sourceFile;

    return diff;
  }

  /**
   * Compute diff between two state serials
   * @private
   */
  async _computeDiff(oldSerial, newSerial) {
    // Get resources from both states
    const oldResources = await this.resource.query({ stateSerial: oldSerial });
    const newResources = await this.resource.query({ stateSerial: newSerial });

    // Create maps for easier lookup
    const oldMap = new Map(oldResources.map(r => [r.resourceAddress, r]));
    const newMap = new Map(newResources.map(r => [r.resourceAddress, r]));

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
      } else {
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

    return { added, modified, deleted };
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
   * @private
   */
  async _saveDiff(diff, sourceFile, newStateFileId) {
    const diffRecord = {
      id: idGenerator(),
      sourceFile: diff.sourceFile || sourceFile,
      oldSerial: diff.oldSerial,
      newSerial: diff.newSerial,
      oldStateFileId: diff.oldStateFileId,
      newStateFileId: diff.newStateFileId || newStateFileId,
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
      if (this.verbose) {
        console.error(`[TfStatePlugin] Failed to save diff:`, err);
      }
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
   * Insert resources into database
   * @private
   */
  async _insertResources(resources) {
    const inserted = [];

    for (const resource of resources) {
      const [ok, err, result] = await tryFn(async () => {
        return await this.resource.insert(resource);
      });

      if (ok) {
        inserted.push(result);
      } else {
        this.stats.errors++;
        if (this.verbose) {
          console.error(`[TfStatePlugin] Failed to insert resource ${resource.resourceAddress}:`, err);
        }
      }
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

    if (this.verbose) {
      console.log(`[TfStatePlugin] Setting up cron monitoring: ${this.monitorCron}`);
    }

    // Validate cron expression
    if (!cron.validate(this.monitorCron)) {
      throw new TfStateError(`Invalid cron expression: ${this.monitorCron}`);
    }

    // Create cron task
    this.cronTask = cron.schedule(this.monitorCron, async () => {
      try {
        await this._monitorStateFiles();
      } catch (error) {
        this.stats.errors++;
        if (this.verbose) {
          console.error('[TfStatePlugin] Monitoring error:', error);
        }
        this.emit('monitoringError', { error: error.message });
      }
    });

    if (this.verbose) {
      console.log('[TfStatePlugin] Cron monitoring started');
    }

    this.emit('monitoringStarted', { cron: this.monitorCron });
  }

  /**
   * Monitor state files for changes
   * Called by cron task
   * @private
   */
  async _monitorStateFiles() {
    if (!this.driver) return;

    if (this.verbose) {
      console.log('[TfStatePlugin] Checking for state file changes...');
    }

    const startTime = Date.now();

    try {
      // List all state files matching selector
      const stateFiles = await this.driver.listStateFiles();

      if (this.verbose) {
        console.log(`[TfStatePlugin] Found ${stateFiles.length} state files`);
      }

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
          } else {
            // Check if file has been modified
            const lastImported = existing[0].lastImportedAt;
            const hasChanged = await this.driver.hasBeenModified(
              fileMetadata.path,
              new Date(lastImported)
            );

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
              // Update import tracking
              const dup = duplicates[0];
              await this.stateFilesResource.update(dup.id, {
                lastImportedAt: Date.now(),
                importCount: dup.importCount + 1
              });

              if (this.verbose) {
                console.log(`[TfStatePlugin] Skipped duplicate: ${fileMetadata.path}`);
              }
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
              outputCount: Object.keys(state.outputs || {}).length,
              sha256Hash,
              s3Bucket: fileMetadata.bucket || null,
              s3Key: fileMetadata.key || null,
              s3Region: fileMetadata.region || null,
              firstImportedAt: currentTime,
              lastImportedAt: currentTime,
              importCount: 1
            };

            const [insertOk, insertErr, stateFileResult] = await tryFn(async () => {
              return await this.stateFilesResource.insert(stateFileRecord);
            });

            if (!insertOk) {
              throw new TfStateError(`Failed to save state file: ${insertErr.message}`);
            }

            const stateFileId = stateFileResult.id;

            // Extract resources
            const resources = await this._extractResources(state, fileMetadata.path, stateFileId);

            // Calculate diff if enabled
            if (this.trackDiffs) {
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
            this.stats.resourcesExtracted += resources.length;
            this.stats.resourcesInserted += inserted.length;
            this.stats.lastProcessedSerial = state.serial;

            if (this.verbose) {
              console.log(`[TfStatePlugin] Processed ${fileMetadata.path}: ${resources.length} resources`);
            }

            this.emit('stateFileProcessed', {
              path: fileMetadata.path,
              serial: state.serial,
              resourcesExtracted: resources.length,
              resourcesInserted: inserted.length
            });
          }
        } catch (error) {
          this.stats.errors++;
          if (this.verbose) {
            console.error(`[TfStatePlugin] Failed to process ${fileMetadata.path}:`, error);
          }
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

      if (this.verbose) {
        console.log(`[TfStatePlugin] Monitoring completed:`, result);
      }

      this.emit('monitoringCompleted', result);

      return result;
    } catch (error) {
      this.stats.errors++;
      if (this.verbose) {
        console.error('[TfStatePlugin] Monitoring failed:', error);
      }
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
            if (event.eventType === 'change' && event.filename.endsWith('.tfstate')) {
              const filePath = `${path}/${event.filename}`;

              if (this.verbose) {
                console.log(`[TfStatePlugin] Detected change: ${filePath}`);
              }

              try {
                await this.importState(filePath);
              } catch (error) {
                this.stats.errors++;
                console.error(`[TfStatePlugin] Auto-import failed:`, error);
                this.emit('importError', { filePath, error });
              }
            }
          }
        })();

        this.watchers.push(watcher);

        if (this.verbose) {
          console.log(`[TfStatePlugin] Watching: ${path}`);
        }
      } catch (error) {
        throw new FileWatchError(path, error);
      }
    }
  }

  /**
   * Export resources to Terraform state format
   * @param {Object} options - Export options
   * @param {number} options.serial - Specific serial to export (default: latest)
   * @param {string[]} options.resourceTypes - Filter by resource types
   * @param {string} options.terraformVersion - Terraform version for output (default: '1.5.0')
   * @param {string} options.lineage - State lineage (default: auto-generated)
   * @param {Object} options.outputs - Terraform outputs to include
   * @returns {Promise<Object>} Terraform state object
   *
   * @example
   * // Export latest state
   * const state = await plugin.exportState();
   *
   * // Export specific serial
   * const state = await plugin.exportState({ serial: 5 });
   *
   * // Export only EC2 instances
   * const state = await plugin.exportState({
   *   resourceTypes: ['aws_instance']
   * });
   */
  async exportState(options = {}) {
    const {
      serial,
      resourceTypes,
      terraformVersion = '1.5.0',
      lineage,
      outputs = {},
      sourceFile // Optional: export from specific source file
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

    // Query resources for this serial
    const queryFilter = { stateSerial: targetSerial };

    if (resourceTypes && resourceTypes.length > 0) {
      queryFilter.resourceType = { $in: resourceTypes };
    }

    const resources = await this.resource.query(queryFilter);

    if (this.verbose) {
      console.log(`[TfStatePlugin] Exporting ${resources.length} resources from serial ${targetSerial}`);
    }

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

    if (this.verbose) {
      console.log(`[TfStatePlugin] Export complete:`, {
        serial: targetSerial,
        resourceCount: resources.length,
        groupedResourceCount: terraformResources.length
      });
    }

    this.emit('stateExported', { serial: targetSerial, resourceCount: resources.length });

    return state;
  }

  /**
   * Export state to local file
   * @param {string} filePath - Output file path
   * @param {Object} options - Export options (see exportState)
   * @returns {Promise<Object>} Export result with file path and stats
   *
   * @example
   * // Export to file
   * await plugin.exportStateToFile('./exported-state.tfstate');
   *
   * // Export specific serial
   * await plugin.exportStateToFile('./state-v5.tfstate', { serial: 5 });
   */
  async exportStateToFile(filePath, options = {}) {
    const state = await this.exportState(options);

    const { writeFileSync } = await import('fs');
    writeFileSync(filePath, JSON.stringify(state, null, 2));

    if (this.verbose) {
      console.log(`[TfStatePlugin] State exported to file: ${filePath}`);
    }

    return {
      filePath,
      serial: state.serial,
      resourceCount: state.resources.reduce((sum, r) => sum + r.instances.length, 0),
      groupedResourceCount: state.resources.length
    };
  }

  /**
   * Export state to S3
   * @param {string} bucket - S3 bucket name
   * @param {string} key - S3 object key
   * @param {Object} options - Export options (see exportState)
   * @param {Object} options.client - Optional S3 client override
   * @returns {Promise<Object>} Export result with S3 location and stats
   *
   * @example
   * // Export to S3
   * await plugin.exportStateToS3('my-bucket', 'terraform/exported.tfstate');
   *
   * // Export with custom options
   * await plugin.exportStateToS3('my-bucket', 'terraform/prod.tfstate', {
   *   serial: 10,
   *   terraformVersion: '1.6.0',
   *   lineage: 'prod-infrastructure'
   * });
   */
  async exportStateToS3(bucket, key, options = {}) {
    const state = await this.exportState(options);
    const client = options.client || this.database.client;

    await client.putObject({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(state, null, 2),
      ContentType: 'application/json'
    });

    if (this.verbose) {
      console.log(`[TfStatePlugin] State exported to S3: s3://${bucket}/${key}`);
    }

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
   * Retrieves the last N diffs for a given state file
   * @param {string} sourceFile - Source file path
   * @param {Object} options - Query options
   * @param {number} options.lookback - Number of historical diffs to retrieve (default: this.diffsLookback)
   * @param {boolean} options.includeDetails - Include detailed changes (default: false, only summary)
   * @returns {Promise<Array>} Array of diffs ordered by serial (newest first)
   *
   * @example
   * // Get last 10 diffs
   * const diffs = await plugin.getDiffsWithLookback('terraform.tfstate');
   *
   * // Get last 5 diffs with details
   * const diffs = await plugin.getDiffsWithLookback('terraform.tfstate', {
   *   lookback: 5,
   *   includeDetails: true
   * });
   */
  async getDiffsWithLookback(sourceFile, options = {}) {
    if (!this.diffsResource) {
      throw new TfStateError('Diff tracking is not enabled for this plugin');
    }

    const lookback = options.lookback || this.diffsLookback;
    const includeDetails = options.includeDetails || false;

    // Query diffs for this source file
    const diffs = await this.diffsResource.query(
      { sourceFile },
      {
        limit: lookback,
        sort: { newSerial: -1 } // Newest first
      }
    );

    if (!includeDetails) {
      // Return only summary information
      return diffs.map(diff => ({
        id: diff.id,
        oldSerial: diff.oldSerial,
        newSerial: diff.newSerial,
        calculatedAt: diff.calculatedAt,
        summary: diff.summary,
        oldStateFileId: diff.oldStateFileId,
        newStateFileId: diff.newStateFileId
      }));
    }

    return diffs;
  }

  /**
   * Get diff timeline for a state file
   * Shows progression of changes over time
   * @param {string} sourceFile - Source file path
   * @param {Object} options - Query options
   * @param {number} options.lookback - Number of diffs to include in timeline
   * @returns {Promise<Object>} Timeline with statistics and diff history
   *
   * @example
   * const timeline = await plugin.getDiffTimeline('terraform.tfstate', { lookback: 20 });
   * console.log(timeline.summary); // Overall statistics
   * console.log(timeline.diffs); // Chronological diff history
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
          oldest: diffs.length > 0 ? Math.min(...diffs.map(d => d.oldSerial)) : null,
          newest: diffs.length > 0 ? Math.max(...diffs.map(d => d.newSerial)) : null
        },
        timeRange: {
          first: diffs.length > 0 ? Math.min(...diffs.map(d => d.calculatedAt)) : null,
          last: diffs.length > 0 ? Math.max(...diffs.map(d => d.calculatedAt)) : null
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
   * @param {string} sourceFile - Source file path
   * @param {number} oldSerial - Old state serial
   * @param {number} newSerial - New state serial
   * @returns {Promise<Object>} Diff object or null if not found
   *
   * @example
   * const diff = await plugin.compareStates('terraform.tfstate', 5, 10);
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
        return await this._computeDiff(oldSerial, newSerial);
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
   * Useful for testing or on-demand synchronization
   * @returns {Promise<Object>} Monitoring result
   *
   * @example
   * const result = await plugin.triggerMonitoring();
   * console.log(`Processed ${result.newFiles} new files`);
   */
  async triggerMonitoring() {
    if (!this.driver) {
      throw new TfStateError('Driver not initialized. Use driver-based configuration to enable monitoring.');
    }

    return await this._monitorStateFiles();
  }

  /**
   * Get plugin statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      watchersActive: this.watchers.length,
      lastProcessedSerial: this.lastProcessedSerial,
      monitoringEnabled: this.monitorEnabled,
      cronExpression: this.monitorCron,
      diffsLookback: this.diffsLookback
    };
  }
}

export default TfStatePlugin;
