import BaseBackupDriver, {
  type BackupDriverConfig,
  type BackupManifest,
  type BackupMetadata,
  type UploadResult,
  type ListOptions,
  type BackupListItem,
  type StorageInfo
} from './base-backup-driver.class.js';
import { createBackupDriver } from './factory.js';
import tryFn from '../../concerns/try-fn.js';
import { BackupError } from '../backup.errors.js';

export interface DestinationConfig {
  driver: string;
  config?: BackupDriverConfig;
}

export interface MultiBackupDriverConfig extends BackupDriverConfig {
  destinations?: DestinationConfig[];
  strategy?: 'all' | 'any' | 'priority';
  concurrency?: number;
  requireAll?: boolean;
}

interface DriverInstance {
  driver: BaseBackupDriver;
  config: DestinationConfig;
  index: number;
}

export interface MultiUploadResult extends UploadResult {
  driver: string;
  destination: number;
  status: 'success' | 'failed';
  error?: string;
}

export default class MultiBackupDriver extends BaseBackupDriver {
  declare config: MultiBackupDriverConfig;
  drivers: DriverInstance[];

  constructor(config: MultiBackupDriverConfig = {}) {
    super({
      destinations: [],
      strategy: 'all',
      concurrency: 3,
      ...config
    });

    this.drivers = [];
  }

  override getType(): string {
    return 'multi';
  }

  override async onSetup(): Promise<void> {
    if (!Array.isArray(this.config.destinations) || this.config.destinations.length === 0) {
      throw new BackupError('MultiBackupDriver requires non-empty destinations array', {
        operation: 'onSetup',
        driver: 'multi',
        destinationsProvided: this.config.destinations,
        suggestion: 'Provide destinations array: { destinations: [{ driver: "s3", config: {...} }, { driver: "filesystem", config: {...} }] }'
      });
    }

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

    if (this.config.requireAll !== undefined) {
      this.logger.warn(
        '[MultiBackupDriver] DEPRECATED: The "requireAll" option is deprecated. ' +
        'Use "strategy" instead: strategy: "any" (instead of requireAll: false) or strategy: "all" (instead of requireAll: true). ' +
        'This will be removed in v17.0.'
      );
      if (this.config.requireAll === false) {
        this.config.strategy = 'any';
      }
    }

    this.log(`Initialized with ${this.drivers.length} destinations, strategy: ${this.config.strategy}`);
  }

  override async upload(filePath: string, backupId: string, manifest: BackupManifest): Promise<MultiUploadResult[]> {
    const strategy = this.config.strategy;
    const errors: Array<{ destination: number; error: string }> = [];

    if (strategy === 'priority') {
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
          errors.push({ destination: index, error: err!.message });
          this.log(`Priority upload failed to destination ${index}: ${err!.message}`);
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

    const uploadPromises = this.drivers.map(async ({ driver, config, index }): Promise<MultiUploadResult> => {
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
        this.log(`Upload failed to destination ${index}: ${err!.message}`);
        const errorResult: MultiUploadResult = {
          driver: config.driver,
          destination: index,
          status: 'failed',
          error: err!.message
        };
        errors.push({ destination: index, error: err!.message });
        return errorResult;
      }
    });

    const allResults = await this._executeConcurrent(uploadPromises, this.config.concurrency || 3);
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

  override async download(backupId: string, targetPath: string, metadata: BackupMetadata): Promise<string> {
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
        return result!;
      } else {
        this.log(`Download failed from destination ${destMetadata.destination}: ${err!.message}`);
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

  override async delete(backupId: string, metadata: BackupMetadata): Promise<void> {
    const destinations = Array.isArray(metadata.destinations) ? metadata.destinations : [metadata];
    const errors: string[] = [];
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
        errors.push(`${destMetadata.destination}: ${err!.message}`);
        this.log(`Delete failed from destination ${destMetadata.destination}: ${err!.message}`);
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

  override async list(options: ListOptions = {}): Promise<BackupListItem[]> {
    const allLists = await Promise.allSettled(
      this.drivers.map(({ driver, index }) =>
        driver.list(options).catch(err => {
          this.log(`List failed for destination ${index}: ${err.message}`);
          return [];
        })
      )
    );

    const backupMap = new Map<string, BackupListItem>();

    allLists.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        result.value.forEach(backup => {
          const existing = backupMap.get(backup.id);
          if (!existing || new Date(backup.createdAt!).getTime() > new Date(existing.createdAt!).getTime()) {
            backupMap.set(backup.id, {
              ...backup,
              destinations: existing
                ? [...(existing.destinations || []), { destination: index, ...backup }]
                : [{ destination: index, ...backup }]
            });
          }
        });
      }
    });

    const results = Array.from(backupMap.values())
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, options.limit || 50);

    return results;
  }

  override async verify(backupId: string, expectedChecksum: string, metadata: BackupMetadata): Promise<boolean> {
    const destinations = Array.isArray(metadata.destinations) ? metadata.destinations : [metadata];

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

  override async cleanup(): Promise<void> {
    await Promise.all(
      this.drivers.map(({ driver }) =>
        tryFn(() => driver.cleanup()).catch(() => {})
      )
    );
  }

  override getStorageInfo(): StorageInfo {
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

  private async _executeConcurrent<T>(promises: Promise<T>[], concurrency: number): Promise<T[]> {
    const results: T[] = new Array(promises.length);
    const executing: Promise<T>[] = [];

    for (let i = 0; i < promises.length; i++) {
      const promise = Promise.resolve(promises[i]).then(result => {
        results[i] = result as T;
        return result as T;
      });

      executing.push(promise as Promise<T>);

      if (executing.length >= concurrency) {
        await Promise.race(executing);
        const idx = executing.findIndex(p => p === promise);
        if (idx >= 0) executing.splice(idx, 1);
      }
    }

    await Promise.all(executing);
    return results;
  }
}
