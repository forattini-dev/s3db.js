/**
 * SchedulerManager
 *
 * Handles cron-based scheduled sweeps:
 * - Manages cron job registration
 * - Triggers scheduled target sweeps
 * - Iterates over enabled targets
 */
import { TasksPool } from '../../../tasks/tasks-pool.class.js';
import { getCronManager } from '../../../concerns/cron-manager.js';
export class SchedulerManager {
    plugin;
    cronJobId;
    fallbackJobName;
    constructor(plugin) {
        this.plugin = plugin;
        this.cronJobId = null;
        this.fallbackJobName = null;
    }
    async start() {
        if (!this.plugin.config.schedule.enabled) {
            return;
        }
        const cronExpression = this.plugin.config.schedule.cron;
        if (!cronExpression) {
            this.plugin.emit('recon:scheduler-warning', {
                message: 'Schedule enabled but no cron expression provided'
            });
            return;
        }
        if (this.plugin.database?.pluginRegistry?.scheduler) {
            const scheduler = this.plugin.database.pluginRegistry.scheduler;
            this.cronJobId = await scheduler.registerJob({
                name: `recon-sweep-${this.plugin.namespace || 'default'}`,
                cron: cronExpression,
                handler: async () => {
                    await this.triggerSweep('scheduled');
                },
                enabled: true,
                metadata: {
                    plugin: 'recon',
                    namespace: this.plugin.namespace
                }
            });
            this.plugin.emit('recon:scheduler-started', {
                cronJobId: this.cronJobId,
                cron: cronExpression
            });
        }
        else {
            this._startFallbackScheduler(cronExpression);
        }
        if (this.plugin.config.schedule.runOnStart) {
            await this.triggerSweep('startup');
        }
    }
    async stop() {
        if (this.cronJobId && this.plugin.database?.pluginRegistry?.scheduler) {
            const scheduler = this.plugin.database.pluginRegistry.scheduler;
            await scheduler.unregisterJob(this.cronJobId);
            this.cronJobId = null;
            this.plugin.emit('recon:scheduler-stopped', {});
        }
        if (this.fallbackJobName) {
            const cronManager = getCronManager();
            cronManager.stop(this.fallbackJobName);
            this.fallbackJobName = null;
        }
    }
    async triggerSweep(reason = 'manual') {
        const targetManager = this.plugin._targetManager;
        const activeTargets = await targetManager.list({ includeDisabled: false });
        if (!activeTargets.length) {
            this.plugin.emit('recon:no-active-targets', {
                reason,
                message: 'No active targets configured for sweep'
            });
            return;
        }
        this.plugin.emit('recon:sweep-started', {
            reason,
            targetCount: activeTargets.length,
            targets: activeTargets.map(t => t.id)
        });
        await TasksPool.map(activeTargets, async (targetEntry) => {
            try {
                const report = await this.plugin.runDiagnostics(targetEntry.target, {
                    behavior: targetEntry.behavior,
                    features: targetEntry.features,
                    tools: targetEntry.tools,
                    persist: targetEntry.persist ?? true
                });
                this.plugin.emit('recon:completed', {
                    reason,
                    target: report.target.host,
                    status: report.status,
                    scanCount: (targetEntry.scanCount || 0) + 1,
                    endedAt: report.endedAt
                });
                await targetManager.updateScanMetadata(targetEntry.id, report);
            }
            catch (error) {
                this.plugin.emit('recon:target-error', {
                    reason,
                    target: targetEntry.target,
                    message: error?.message || 'Recon execution failed',
                    error
                });
            }
        }, { concurrency: this.plugin.config.concurrency || 1 });
        this.plugin.emit('recon:sweep-completed', {
            reason,
            targetCount: activeTargets.length
        });
    }
    async _startFallbackScheduler(cronExpression) {
        const intervalMs = this._parseCronToInterval(cronExpression);
        const cronManager = getCronManager();
        const jobName = `recon-fallback-${Date.now()}`;
        await cronManager.scheduleInterval(intervalMs, () => this.triggerSweep('scheduled-fallback'), jobName);
        this.fallbackJobName = jobName;
        this.plugin.emit('recon:scheduler-started', {
            cronJobId: 'fallback',
            cron: cronExpression,
            warning: 'Using fallback scheduler - install SchedulerPlugin for accurate cron execution'
        });
    }
    _parseCronToInterval(cronExpression) {
        const parts = cronExpression.split(' ');
        if (parts[0].startsWith('*/')) {
            const minutes = parseInt(parts[0].substring(2));
            return minutes * 60 * 1000;
        }
        if (parts[1].startsWith('*/')) {
            const hours = parseInt(parts[1].substring(2));
            return hours * 60 * 60 * 1000;
        }
        return 60 * 60 * 1000;
    }
}
//# sourceMappingURL=scheduler-manager.js.map