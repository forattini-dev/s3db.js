import { DatabaseError } from '../errors.js';
export class DatabaseCoordinators {
    database;
    _coordinators;
    constructor(database) {
        this.database = database;
        this._coordinators = new Map();
    }
    get coordinators() {
        return this._coordinators;
    }
    async getGlobalCoordinator(namespace, options = {}) {
        if (!namespace) {
            throw new Error('Database.getGlobalCoordinator: namespace is required');
        }
        const { autoStart = false } = options;
        if (this._coordinators.has(namespace)) {
            return this._coordinators.get(namespace);
        }
        try {
            const { GlobalCoordinatorService } = await import('../plugins/concerns/global-coordinator-service.class.js');
            const coordinatorConfig = options.config || {};
            const service = new GlobalCoordinatorService({
                namespace,
                database: this.database,
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
            this._coordinators.set(namespace, service);
            return service;
        }
        catch (err) {
            throw new DatabaseError('Failed to initialize global coordinator service', {
                operation: 'getGlobalCoordinator',
                namespace,
                cause: err?.message
            });
        }
    }
    async stopAll() {
        if (this._coordinators.size > 0) {
            for (const [, service] of this._coordinators) {
                try {
                    if (service && typeof service.stop === 'function') {
                        await service.stop();
                    }
                }
                catch {
                    // Silently continue on error
                }
            }
            this._coordinators.clear();
        }
    }
    collectMemorySnapshot() {
        const usage = process.memoryUsage();
        const toMB = (bytes) => Math.round((bytes || 0) / (1024 * 1024));
        const snapshot = {
            timestamp: new Date().toISOString(),
            rssMB: toMB(usage.rss),
            heapUsedMB: toMB(usage.heapUsed),
            heapTotalMB: toMB(usage.heapTotal),
            externalMB: toMB(usage.external)
        };
        if (usage.arrayBuffers !== undefined) {
            snapshot.arrayBuffersMB = toMB(usage.arrayBuffers);
        }
        return snapshot;
    }
}
//# sourceMappingURL=database-coordinators.class.js.map