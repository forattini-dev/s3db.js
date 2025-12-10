import { Plugin } from '../plugin.class.js';
import { getCronManager } from '../../concerns/cron-manager.js';
import { createLogger } from '../../concerns/logger.js';
let workerCounter = 0;
export class CoordinatorPlugin extends Plugin {
    workerId;
    workerStartTime;
    isCoordinator;
    currentLeaderId;
    _globalCoordinator;
    _leaderChangeListener;
    _heartbeatHandle;
    _coordinatorWorkHandle;
    coldStartPhase;
    coldStartCompleted;
    _coordinatorConfig;
    _coordinationStarted;
    constructor(config = {}) {
        super(config);
        if (config.logger) {
            this.logger = config.logger;
        }
        else {
            const logLevel = this.logLevel || 'info';
            this.logger = createLogger({ name: 'CoordinatorPlugin', level: logLevel });
        }
        this.workerId = this._generateWorkerId();
        this.workerStartTime = Date.now();
        this.isCoordinator = false;
        this.currentLeaderId = null;
        this._globalCoordinator = null;
        this._leaderChangeListener = null;
        this._heartbeatHandle = null;
        this._coordinatorWorkHandle = null;
        this.coldStartPhase = 'not_started';
        this.coldStartCompleted = false;
        this._coordinationStarted = false;
        this._coordinatorConfig = this._normalizeConfig(config);
    }
    _normalizeConfig(config) {
        const { enableCoordinator = true, startupJitterMin = 0, startupJitterMax = 5000, coldStartDuration = 0, skipColdStart = false, coordinatorWorkInterval = null, heartbeatInterval = 5000, heartbeatJitter = 1000, leaseTimeout = 15000, workerTimeout = 20000 } = config;
        if (startupJitterMin < 0)
            throw new Error('startupJitterMin must be >= 0');
        if (startupJitterMax < startupJitterMin)
            throw new Error('startupJitterMax must be >= startupJitterMin');
        return {
            enableCoordinator: Boolean(enableCoordinator),
            startupJitterMin: Math.max(0, startupJitterMin),
            startupJitterMax: Math.max(0, startupJitterMax),
            coldStartDuration: Math.max(0, coldStartDuration),
            skipColdStart: Boolean(skipColdStart),
            coordinatorWorkInterval: coordinatorWorkInterval ? Math.max(100, coordinatorWorkInterval) : null,
            heartbeatInterval: Math.max(1000, heartbeatInterval),
            heartbeatJitter: Math.max(0, heartbeatJitter),
            leaseTimeout: Math.max(5000, leaseTimeout),
            workerTimeout: Math.max(5000, workerTimeout)
        };
    }
    async onBecomeCoordinator() {
        this.logger.debug({ workerId: this.workerId }, `Became leader (workerId: ${this.workerId})`);
    }
    async onStopBeingCoordinator() {
        this.logger.debug({ workerId: this.workerId }, `No longer leader (workerId: ${this.workerId})`);
    }
    async coordinatorWork() {
        // Default: no-op (subclasses override)
    }
    get coordinatorConfig() {
        return this._coordinatorConfig;
    }
    get enableCoordinator() {
        return this._coordinatorConfig.enableCoordinator;
    }
    async startCoordination() {
        if (!this._coordinatorConfig.enableCoordinator)
            return;
        if (this._coordinationStarted)
            return;
        this._coordinationStarted = true;
        await this._initializeGlobalCoordinator();
        await this._runBackgroundElection();
        this.logger.debug({ workerId: this.workerId }, `Coordination initialized (startup jitter applied)`);
    }
    async _runBackgroundElection() {
        if (this._coordinatorConfig.startupJitterMax > 0) {
            const jitterMs = this._coordinatorConfig.startupJitterMin +
                Math.random() * (this._coordinatorConfig.startupJitterMax - this._coordinatorConfig.startupJitterMin);
            this.logger.debug({ jitterMs: Math.round(jitterMs) }, `Startup jitter: ${Math.round(jitterMs)}ms`);
            await this._sleep(jitterMs);
        }
        if (!this._coordinatorConfig.skipColdStart && this._coordinatorConfig.coldStartDuration > 0) {
            await this._executeColdStart();
        }
        else {
            const leader = await this.getLeader();
            const wasCoordinator = this.isCoordinator;
            this.isCoordinator = leader === this.workerId;
            this.logger.debug({ leader, isCoordinator: this.isCoordinator }, `Skipped cold start - Leader: ${leader} (this: ${this.isCoordinator ? 'YES' : 'NO'})`);
            if (this.isCoordinator && !wasCoordinator) {
                await this.onBecomeCoordinator();
            }
            this.coldStartCompleted = true;
            this.coldStartPhase = 'ready';
        }
        if (this._coordinatorConfig.coordinatorWorkInterval && this.isCoordinator) {
            await this._startCoordinatorWork();
        }
    }
    async stopCoordination() {
        if (!this._coordinatorConfig.enableCoordinator)
            return;
        this._clearLeaderChangeListener();
        this._clearIntervalHandle(this._heartbeatHandle);
        this._heartbeatHandle = null;
        this._clearIntervalHandle(this._coordinatorWorkHandle);
        this._coordinatorWorkHandle = null;
        this._coordinationStarted = false;
        this.isCoordinator = false;
        this.currentLeaderId = null;
        this.coldStartPhase = 'not_started';
        this.coldStartCompleted = false;
        this.logger.debug('Coordination stopped');
    }
    async isLeader() {
        if (!this._globalCoordinator)
            return false;
        return this.isCoordinator;
    }
    async getLeader() {
        if (!this._globalCoordinator)
            return null;
        return await this._globalCoordinator.getLeader();
    }
    async getActiveWorkers() {
        if (!this._globalCoordinator)
            return [];
        return await this._globalCoordinator.getActiveWorkers();
    }
    async _initializeGlobalCoordinator() {
        if (!this.database) {
            throw new Error(`[${this.constructor.name}] Database not available - cannot initialize coordinator`);
        }
        const namespace = 'default';
        this._globalCoordinator = await this.database.getGlobalCoordinator(namespace, {
            autoStart: true,
            config: {
                heartbeatInterval: this._coordinatorConfig.heartbeatInterval,
                heartbeatJitter: this._coordinatorConfig.heartbeatJitter,
                leaseTimeout: this._coordinatorConfig.leaseTimeout,
                workerTimeout: this._coordinatorConfig.workerTimeout,
                diagnosticsEnabled: !!this.options.logLevel
            }
        });
        const pluginId = this.instanceName || this.slug || this.constructor.name.toLowerCase();
        await this._globalCoordinator.subscribePlugin(pluginId, this);
        this._setupLeaderChangeListener();
        const currentLeader = await this._globalCoordinator.getLeader();
        if (currentLeader === this.workerId && !this.isCoordinator) {
            this.isCoordinator = true;
            this.emit('plg:coordinator:promoted', {
                workerId: this.workerId,
                timestamp: Date.now(),
                pluginName: this.constructor.name
            });
        }
        this.logger.debug({ namespace }, `Connected to global coordinator (namespace: ${namespace})`);
    }
    _setupLeaderChangeListener() {
        if (!this._globalCoordinator)
            return;
        if (this._leaderChangeListener)
            return;
        this._leaderChangeListener = async (event) => {
            const wasLeader = this.isCoordinator;
            const isNowLeader = event.newLeader === this.workerId;
            this.isCoordinator = isNowLeader;
            this.currentLeaderId = event.newLeader;
            this.logger.debug({ previousLeader: event.previousLeader || 'none', newLeader: event.newLeader, epoch: event.epoch }, `Leader: ${event.previousLeader || 'none'} → ${event.newLeader} (epoch: ${event.epoch})`);
            if (!wasLeader && isNowLeader) {
                await this.onBecomeCoordinator();
                if (this._coordinatorConfig.coordinatorWorkInterval) {
                    await this._startCoordinatorWork();
                }
                this.emit('plg:coordinator:promoted', {
                    workerId: this.workerId,
                    timestamp: Date.now(),
                    pluginName: this.constructor.name
                });
            }
            else if (wasLeader && !isNowLeader) {
                await this.onStopBeingCoordinator();
                this._clearIntervalHandle(this._coordinatorWorkHandle);
                this._coordinatorWorkHandle = null;
                this.emit('plg:coordinator:demoted', {
                    workerId: this.workerId,
                    timestamp: Date.now(),
                    pluginName: this.constructor.name
                });
            }
        };
        this._globalCoordinator.on('leader:changed', this._leaderChangeListener);
    }
    _clearLeaderChangeListener() {
        if (!this._globalCoordinator || !this._leaderChangeListener)
            return;
        this._globalCoordinator.removeListener('leader:changed', this._leaderChangeListener);
        this._leaderChangeListener = null;
    }
    async _executeColdStart() {
        this.logger.debug({ coldStartDuration: this._coordinatorConfig.coldStartDuration }, `Cold start: ${this._coordinatorConfig.coldStartDuration}ms`);
        const startTime = Date.now();
        const phaseDuration = this._coordinatorConfig.coldStartDuration / 3;
        this.coldStartPhase = 'observing';
        this.logger.debug({ phase: 'observing' }, 'Cold start phase: observing');
        await this._sleep(phaseDuration);
        const workers = await this.getActiveWorkers();
        this.logger.debug({ workerCount: workers.length }, `Discovered ${workers.length} worker(s)`);
        this.emit('plg:coordinator:cold-start-phase', {
            phase: 'observing',
            workersDiscovered: workers.length,
            timestamp: Date.now(),
            pluginName: this.constructor.name,
            workerId: this.workerId
        });
        this.coldStartPhase = 'election';
        this.logger.debug({ phase: 'election' }, 'Cold start phase: election');
        await this._sleep(phaseDuration);
        const leader = await this.getLeader();
        this.isCoordinator = leader === this.workerId;
        this.logger.debug({ leader, isCoordinator: this.isCoordinator }, `Leader elected: ${leader} (this: ${this.isCoordinator ? 'YES' : 'NO'})`);
        this.emit('plg:coordinator:cold-start-phase', {
            phase: 'election',
            leaderId: leader,
            isLeader: this.isCoordinator,
            timestamp: Date.now(),
            pluginName: this.constructor.name,
            workerId: this.workerId
        });
        this.coldStartPhase = 'preparation';
        this.logger.debug({ phase: 'preparation' }, 'Cold start phase: preparation');
        this.emit('plg:coordinator:cold-start-phase', {
            phase: 'preparation',
            isLeader: this.isCoordinator,
            timestamp: Date.now(),
            pluginName: this.constructor.name,
            workerId: this.workerId
        });
        if (this.isCoordinator) {
            await this.onBecomeCoordinator();
        }
        const elapsed = Date.now() - startTime;
        const remaining = this._coordinatorConfig.coldStartDuration - elapsed;
        if (remaining > 0) {
            await this._sleep(remaining);
        }
        this.coldStartPhase = 'ready';
        this.coldStartCompleted = true;
        const duration = Date.now() - startTime;
        this.logger.debug({ duration, isLeader: this.isCoordinator }, `Cold start completed in ${duration}ms`);
        this.emit('plg:coordinator:cold-start-complete', {
            duration,
            isLeader: this.isCoordinator,
            timestamp: Date.now(),
            pluginName: this.constructor.name,
            workerId: this.workerId
        });
    }
    async _startCoordinatorWork() {
        if (!this._coordinatorConfig.coordinatorWorkInterval)
            return;
        if (this._coordinatorWorkHandle)
            return;
        this._coordinatorWorkHandle = await this._scheduleInterval(async () => {
            if (!this.isCoordinator)
                return;
            try {
                await this.coordinatorWork();
            }
            catch (err) {
                this.logger.warn({ error: err.message }, `Coordinator work error: ${err.message}`);
            }
        }, this._coordinatorConfig.coordinatorWorkInterval, `coordinator-work-${this.workerId}`);
        this.logger.debug({ interval: this._coordinatorConfig.coordinatorWorkInterval }, `Coordinator work started (interval: ${this._coordinatorConfig.coordinatorWorkInterval}ms)`);
    }
    async _scheduleInterval(fn, intervalMs, name) {
        const cronManager = getCronManager();
        if (cronManager && !cronManager.disabled) {
            await cronManager.scheduleInterval(intervalMs, async () => {
                try {
                    await fn();
                }
                catch (err) {
                    this.logger.warn({ error: err.message, jobName: name }, `[${name}] Error: ${err.message}`);
                }
            }, name);
            return { type: 'cron', jobName: name };
        }
        let running = false;
        const timer = setInterval(async () => {
            if (running)
                return;
            running = true;
            try {
                await fn();
            }
            catch (err) {
                this.logger.warn({ error: err.message, jobName: name }, `[${name}] Error: ${err.message}`);
            }
            finally {
                running = false;
            }
        }, intervalMs);
        if (timer.unref) {
            timer.unref();
        }
        return { type: 'manual', timer };
    }
    _clearIntervalHandle(handle) {
        if (!handle)
            return;
        if (handle.type === 'cron') {
            const cronManager = getCronManager();
            if (cronManager && handle.jobName) {
                cronManager.stop(handle.jobName);
            }
        }
        else if (handle.type === 'manual' && handle.timer) {
            clearInterval(handle.timer);
        }
    }
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    _generateWorkerId() {
        const env = typeof process !== 'undefined' ? process.env : {};
        if (env.POD_NAME) {
            return `worker-${env.POD_NAME}`;
        }
        if (env.HOSTNAME) {
            return `worker-${env.HOSTNAME}`;
        }
        if (this.database && this.database.id) {
            return `worker-${this.database.id}`;
        }
        return `worker-${Date.now()}-${++workerCounter}-${Math.random().toString(36).slice(2, 9)}`;
    }
}
//# sourceMappingURL=coordinator-plugin.class.js.map