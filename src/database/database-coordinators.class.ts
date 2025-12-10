import { DatabaseError } from '../errors.js';
import type { Database } from '../database.class.js';
import type { DatabaseRef, GlobalCoordinatorService, GlobalCoordinatorOptions, MemorySnapshot } from './types.js';

export class DatabaseCoordinators {
  private _coordinators: Map<string, GlobalCoordinatorService>;

  constructor(private database: DatabaseRef) {
    this._coordinators = new Map();
  }

  get coordinators(): Map<string, GlobalCoordinatorService> {
    return this._coordinators;
  }

  async getGlobalCoordinator(namespace: string, options: GlobalCoordinatorOptions = {}): Promise<GlobalCoordinatorService> {
    if (!namespace) {
      throw new Error('Database.getGlobalCoordinator: namespace is required');
    }

    const { autoStart = false } = options;

    if (this._coordinators.has(namespace)) {
      return this._coordinators.get(namespace)!;
    }

    try {
      const { GlobalCoordinatorService } = await import('../plugins/concerns/global-coordinator-service.class.js');

      const coordinatorConfig = options.config || {};
      const service = new GlobalCoordinatorService({
        namespace,
        database: this.database as unknown as Database,
        config: {
          heartbeatInterval: coordinatorConfig.heartbeatInterval ?? 5000,
          heartbeatJitter: coordinatorConfig.heartbeatJitter ?? 1000,
          leaseTimeout: coordinatorConfig.leaseTimeout ?? 15000,
          workerTimeout: coordinatorConfig.workerTimeout ?? 20000,
          diagnosticsEnabled: coordinatorConfig.diagnosticsEnabled ?? (this.database.logger.level === 'debug' || this.database.logger.level === 'trace')
        }
      });

      if (autoStart && this.database.isConnected()) {
        await service.start();
      }

      this._coordinators.set(namespace, service as unknown as GlobalCoordinatorService);
      return service as unknown as GlobalCoordinatorService;

    } catch (err) {
      throw new DatabaseError('Failed to initialize global coordinator service', {
        operation: 'getGlobalCoordinator',
        namespace,
        cause: (err as Error)?.message
      });
    }
  }

  async stopAll(): Promise<void> {
    if (this._coordinators.size > 0) {
      for (const [, service] of this._coordinators) {
        try {
          if (service && typeof service.stop === 'function') {
            await service.stop();
          }
        } catch {
          // Silently continue on error
        }
      }
      this._coordinators.clear();
    }
  }

  collectMemorySnapshot(): MemorySnapshot {
    const usage = process.memoryUsage();
    const toMB = (bytes: number) => Math.round((bytes || 0) / (1024 * 1024));

    const snapshot: MemorySnapshot = {
      timestamp: new Date().toISOString(),
      rssMB: toMB(usage.rss),
      heapUsedMB: toMB(usage.heapUsed),
      heapTotalMB: toMB(usage.heapTotal),
      externalMB: toMB(usage.external)
    };

    if ((usage as any).arrayBuffers !== undefined) {
      snapshot.arrayBuffersMB = toMB((usage as any).arrayBuffers);
    }

    return snapshot;
  }
}
