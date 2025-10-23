import BaseBackupDriver from './base-backup-driver.class.js';
import { createBackupDriver } from './index.js';
import tryFn from '../../concerns/try-fn.js';
import { BackupError } from '../backup.errors.js';

/**
 * MultiBackupDriver - Manages multiple backup destinations
 *
 * Configuration:
 * - destinations: Array of driver configurations
 *   - driver: Driver type (filesystem, s3)
 *   - config: Driver-specific configuration
 * - strategy: Backup strategy (default: 'all')
 *   - 'all': Upload to all destinations (fail if any fails)
 *   - 'any': Upload to all, succeed if at least one succeeds
 *   - 'priority': Try destinations in order, stop on first success
 * - concurrency: Max concurrent uploads (default: 3)
 */
export default class MultiBackupDriver extends BaseBackupDriver {
  constructor(config = {}) {
    super({
      destinations: [],
      strategy: 'all', // 'all', 'any', 'priority'
      concurrency: 3,
      ...config
    });

    this.drivers = [];
  }

  getType() {
    return 'multi';
  }

  async onSetup() {
    if (!Array.isArray(this.config.destinations) || this.config.destinations.length === 0) {
      throw new BackupError('MultiBackupDriver requires non-empty destinations array', {
        operation: 'onSetup',
        driver: 'multi',
        destinationsProvided: this.config.destinations,
        suggestion: 'Provide destinations array: { destinations: [{ driver: "s3", config: {...} }, { driver: "filesystem", config: {...} }] }'
      });
    }

    // Create and setup all driver instances
    for (const [index, destConfig] of this.config.destinations.entries()) {
      if (!destConfig.driver) {
        throw new BackupError(`Destination ${index} missing driver type`, {
          operation: 'onSetup',
          driver: 'multi',
          destinationIndex: index,
          destination: destConfig,
          suggestion: 'Each destination must have a driver property: { driver: "s3", config: {...} } or { driver: "filesystem", config: {...} }'
        });
      }

      try {
        const driver = createBackupDriver(destConfig.driver, destConfig.config || {});
        await driver.setup(this.database);
        this.drivers.push({
          driver,
          config: destConfig,
          index
        });

        this.log(`Setup destination ${index}: ${destConfig.driver}`);
      } catch (error) {
        throw new BackupError(`Failed to setup destination ${index}`, {
          operation: 'onSetup',
          driver: 'multi',
          destinationIndex: index,
          destinationDriver: destConfig.driver,
          destinationConfig: destConfig.config,
          original: error,
          suggestion: 'Check destination driver configuration and ensure dependencies are available'
        });
      }
    }

    // Legacy support for requireAll
    if (this.config.requireAll === false) {
      this.config.strategy = 'any';
    }

    this.log(`Initialized with ${this.drivers.length} destinations, strategy: ${this.config.strategy}`);
  }

  async upload(filePath, backupId, manifest) {
    const strategy = this.config.strategy;
    const results = [];
    const errors = [];

    if (strategy === 'priority') {
      // Try destinations in order, stop on first success
      for (const { driver, config, index } of this.drivers) {
        const [ok, err, result] = await tryFn(() => 
          driver.upload(filePath, backupId, manifest)
        );

        if (ok) {
          this.log(`Priority upload successful to destination ${index}`);
          return [{
            ...result,
            driver: config.driver,
            destination: index,
            status: 'success'
          }];
        } else {
          errors.push({ destination: index, error: err.message });
          this.log(`Priority upload failed to destination ${index}: ${err.message}`);
        }
      }

      throw new BackupError('All priority destinations failed', {
        operation: 'upload',
        driver: 'multi',
        strategy: 'priority',
        backupId,
        totalDestinations: this.drivers.length,
        failures: errors,
        suggestion: 'Check destination configurations and ensure at least one destination is accessible'
      });
    }

    // For 'all' and 'any' strategies, upload to all destinations
    const uploadPromises = this.drivers.map(async ({ driver, config, index }) => {
      const [ok, err, result] = await tryFn(() => 
        driver.upload(filePath, backupId, manifest)
      );

      if (ok) {
        this.log(`Upload successful to destination ${index}`);
        return {
          ...result,
          driver: config.driver,
          destination: index,
          status: 'success'
        };
      } else {
        this.log(`Upload failed to destination ${index}: ${err.message}`);
        const errorResult = {
          driver: config.driver,
          destination: index,
          status: 'failed',
          error: err.message
        };
        errors.push(errorResult);
        return errorResult;
      }
    });

    // Execute uploads with concurrency limit
    const allResults = await this._executeConcurrent(uploadPromises, this.config.concurrency);
    const successResults = allResults.filter(r => r.status === 'success');
    const failedResults = allResults.filter(r => r.status === 'failed');

    if (strategy === 'all' && failedResults.length > 0) {
      throw new BackupError('Some destinations failed with strategy "all"', {
        operation: 'upload',
        driver: 'multi',
        strategy: 'all',
        backupId,
        totalDestinations: this.drivers.length,
        successCount: successResults.length,
        failedCount: failedResults.length,
        failures: failedResults,
        suggestion: 'All destinations must succeed with "all" strategy. Use "any" strategy to tolerate failures, or fix failing destinations.'
      });
    }

    if (strategy === 'any' && successResults.length === 0) {
      throw new BackupError('All destinations failed with strategy "any"', {
        operation: 'upload',
        driver: 'multi',
        strategy: 'any',
        backupId,
        totalDestinations: this.drivers.length,
        failures: failedResults,
        suggestion: 'At least one destination must succeed with "any" strategy. Check all destination configurations.'
      });
    }

    return allResults;
  }

  async download(backupId, targetPath, metadata) {
    // Try to download from the first available destination
    const destinations = Array.isArray(metadata.destinations) ? metadata.destinations : [metadata];

    for (const destMetadata of destinations) {
      if (destMetadata.status !== 'success') continue;

      const driverInstance = this.drivers.find(d => d.index === destMetadata.destination);
      if (!driverInstance) continue;

      const [ok, err, result] = await tryFn(() => 
        driverInstance.driver.download(backupId, targetPath, destMetadata)
      );

      if (ok) {
        this.log(`Downloaded from destination ${destMetadata.destination}`);
        return result;
      } else {
        this.log(`Download failed from destination ${destMetadata.destination}: ${err.message}`);
      }
    }

    throw new BackupError('Failed to download backup from any destination', {
      operation: 'download',
      driver: 'multi',
      backupId,
      targetPath,
      attemptedDestinations: destinations.length,
      suggestion: 'Check if backup exists in at least one destination and destinations are accessible'
    });
  }

  async delete(backupId, metadata) {
    const destinations = Array.isArray(metadata.destinations) ? metadata.destinations : [metadata];
    const errors = [];
    let successCount = 0;

    for (const destMetadata of destinations) {
      if (destMetadata.status !== 'success') continue;

      const driverInstance = this.drivers.find(d => d.index === destMetadata.destination);
      if (!driverInstance) continue;

      const [ok, err] = await tryFn(() => 
        driverInstance.driver.delete(backupId, destMetadata)
      );

      if (ok) {
        successCount++;
        this.log(`Deleted from destination ${destMetadata.destination}`);
      } else {
        errors.push(`${destMetadata.destination}: ${err.message}`);
        this.log(`Delete failed from destination ${destMetadata.destination}: ${err.message}`);
      }
    }

    if (successCount === 0 && errors.length > 0) {
      throw new BackupError('Failed to delete from any destination', {
        operation: 'delete',
        driver: 'multi',
        backupId,
        attemptedDestinations: destinations.length,
        failures: errors,
        suggestion: 'Check if backup exists in destinations and destinations are accessible with delete permissions'
      });
    }

    if (errors.length > 0) {
      this.log(`Partial delete success, some errors: ${errors.join('; ')}`);
    }
  }

  async list(options = {}) {
    // Get lists from all destinations and merge/deduplicate
    const allLists = await Promise.allSettled(
      this.drivers.map(({ driver, index }) => 
        driver.list(options).catch(err => {
          this.log(`List failed for destination ${index}: ${err.message}`);
          return [];
        })
      )
    );

    const backupMap = new Map();

    // Merge results from all destinations
    allLists.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        result.value.forEach(backup => {
          const existing = backupMap.get(backup.id);
          if (!existing || new Date(backup.createdAt) > new Date(existing.createdAt)) {
            backupMap.set(backup.id, {
              ...backup,
              destinations: existing ? [...(existing.destinations || []), { destination: index, ...backup }] : [{ destination: index, ...backup }]
            });
          }
        });
      }
    });

    const results = Array.from(backupMap.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, options.limit || 50);

    return results;
  }

  async verify(backupId, expectedChecksum, metadata) {
    const destinations = Array.isArray(metadata.destinations) ? metadata.destinations : [metadata];
    
    // Verify against any successful destination
    for (const destMetadata of destinations) {
      if (destMetadata.status !== 'success') continue;

      const driverInstance = this.drivers.find(d => d.index === destMetadata.destination);
      if (!driverInstance) continue;

      const [ok, , isValid] = await tryFn(() => 
        driverInstance.driver.verify(backupId, expectedChecksum, destMetadata)
      );

      if (ok && isValid) {
        this.log(`Verification successful from destination ${destMetadata.destination}`);
        return true;
      }
    }

    return false;
  }

  async cleanup() {
    await Promise.all(
      this.drivers.map(({ driver }) => 
        tryFn(() => driver.cleanup()).catch(() => {})
      )
    );
  }

  getStorageInfo() {
    return {
      ...super.getStorageInfo(),
      strategy: this.config.strategy,
      destinations: this.drivers.map(({ driver, config, index }) => ({
        index,
        driver: config.driver,
        info: driver.getStorageInfo()
      }))
    };
  }

  /**
   * Execute promises with concurrency limit
   * @param {Array} promises - Array of promise functions
   * @param {number} concurrency - Max concurrent executions
   * @returns {Array} Results in original order
   */
  async _executeConcurrent(promises, concurrency) {
    const results = new Array(promises.length);
    const executing = [];

    for (let i = 0; i < promises.length; i++) {
      const promise = Promise.resolve(promises[i]).then(result => {
        results[i] = result;
        return result;
      });

      executing.push(promise);

      if (executing.length >= concurrency) {
        await Promise.race(executing);
        executing.splice(executing.findIndex(p => p === promise), 1);
      }
    }

    await Promise.all(executing);
    return results;
  }
}