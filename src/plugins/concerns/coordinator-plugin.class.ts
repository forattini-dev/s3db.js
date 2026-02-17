import { Plugin, PluginConfig } from '../plugin.class.js';
import { getCronManager } from '../../concerns/cron-manager.js';
import { createLogger, S3DBLogger } from '../../concerns/logger.js';
import type { GlobalCoordinatorService, LeaderChangeEvent } from './global-coordinator-service.class.js';

let workerCounter = 0;

export interface CoordinatorConfig extends PluginConfig {
  enableCoordinator?: boolean;
  startupJitterMin?: number;
  startupJitterMax?: number;
  coldStartDuration?: number;
  skipColdStart?: boolean;
  coordinatorWorkInterval?: number | null;
  heartbeatInterval?: number;
  heartbeatJitter?: number;
  leaseTimeout?: number;
  workerTimeout?: number;
  logger?: S3DBLogger;
  epochFencingEnabled?: boolean;
  epochGracePeriodMs?: number;
}

export interface NormalizedCoordinatorConfig {
  enableCoordinator: boolean;
  startupJitterMin: number;
  startupJitterMax: number;
  coldStartDuration: number;
  skipColdStart: boolean;
  coordinatorWorkInterval: number | null;
  heartbeatInterval: number;
  heartbeatJitter: number;
  leaseTimeout: number;
  workerTimeout: number;
  epochFencingEnabled: boolean;
  epochGracePeriodMs: number;
}

export interface EpochValidationResult {
  valid: boolean;
  reason?: 'stale' | 'grace_period' | 'current';
  taskEpoch: number;
  currentEpoch: number;
}

export type ColdStartPhase = 'not_started' | 'observing' | 'election' | 'preparation' | 'ready';

export interface IntervalHandle {
  type: 'cron' | 'manual';
  jobName?: string;
  timer?: ReturnType<typeof setInterval>;
}

export type { LeaderChangeEvent } from './global-coordinator-service.class.js';

export interface CoordinatorEventData {
  workerId: string;
  timestamp: number;
  pluginName: string;
}

export interface ColdStartPhaseEventData extends CoordinatorEventData {
  phase: ColdStartPhase;
  workersDiscovered?: number;
  leaderId?: string | null;
  isLeader?: boolean;
}

export interface ColdStartCompleteEventData extends CoordinatorEventData {
  duration: number;
  isLeader: boolean;
}

export class CoordinatorPlugin<TOptions extends CoordinatorConfig = CoordinatorConfig> extends Plugin<TOptions> {
  declare slug: string;

  workerId: string;
  workerStartTime: number;
  isCoordinator: boolean;
  currentLeaderId: string | null;

  protected _globalCoordinator: GlobalCoordinatorService | null;
  protected _leaderChangeListener: ((event: LeaderChangeEvent) => Promise<void>) | null;
  protected _heartbeatHandle: IntervalHandle | null;
  protected _coordinatorWorkHandle: IntervalHandle | null;

  coldStartPhase: ColdStartPhase;
  coldStartCompleted: boolean;

  protected _coordinatorConfig: NormalizedCoordinatorConfig;
  protected _coordinationStarted: boolean;

  protected _lastKnownEpoch: number;
  protected _lastEpochChangeTime: number;

  constructor(config: TOptions = {} as TOptions) {
    super(config);

    if (config.logger) {
      this.logger = config.logger;
    } else {
      const logLevel = this.logLevel || 'info';
      this.logger = createLogger({ name: 'CoordinatorPlugin', level: logLevel as any });
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

    this._lastKnownEpoch = 0;
    this._lastEpochChangeTime = 0;

    this._coordinatorConfig = this._normalizeConfig(config);
  }

  protected _normalizeConfig(config: CoordinatorConfig): NormalizedCoordinatorConfig {
    const {
      enableCoordinator = true,
      startupJitterMin = 0,
      startupJitterMax = 5000,
      coldStartDuration = 0,
      skipColdStart = false,
      coordinatorWorkInterval = null,
      heartbeatInterval = 5000,
      heartbeatJitter = 1000,
      leaseTimeout = 15000,
      workerTimeout = 20000,
      epochFencingEnabled = true,
      epochGracePeriodMs = 5000
    } = config;

    if (startupJitterMin < 0) throw new Error('startupJitterMin must be >= 0');
    if (startupJitterMax < startupJitterMin) throw new Error('startupJitterMax must be >= startupJitterMin');

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
      workerTimeout: Math.max(5000, workerTimeout),
      epochFencingEnabled: Boolean(epochFencingEnabled),
      epochGracePeriodMs: Math.max(0, epochGracePeriodMs)
    };
  }

  async onBecomeCoordinator(): Promise<void> {
    this.logger.debug({ workerId: this.workerId }, `Became leader (workerId: ${this.workerId})`);
  }

  async onStopBeingCoordinator(): Promise<void> {
    this.logger.debug({ workerId: this.workerId }, `No longer leader (workerId: ${this.workerId})`);
  }

  async coordinatorWork(): Promise<void> {
    // Default: no-op (subclasses override)
  }

  get coordinatorConfig(): NormalizedCoordinatorConfig {
    return this._coordinatorConfig;
  }

  get enableCoordinator(): boolean {
    return this._coordinatorConfig.enableCoordinator;
  }

  async startCoordination(): Promise<void> {
    if (!this._coordinatorConfig.enableCoordinator) return;

    if (this._coordinationStarted) return;
    this._coordinationStarted = true;

    await this._initializeGlobalCoordinator();

    await this._runBackgroundElection();

    this.logger.debug({ workerId: this.workerId }, `Coordination initialized (startup jitter applied)`);
  }

  protected async _runBackgroundElection(): Promise<void> {
    if (this._coordinatorConfig.startupJitterMax > 0) {
      const jitterMs = this._coordinatorConfig.startupJitterMin +
        Math.random() * (this._coordinatorConfig.startupJitterMax - this._coordinatorConfig.startupJitterMin);

      this.logger.debug({ jitterMs: Math.round(jitterMs) }, `Startup jitter: ${Math.round(jitterMs)}ms`);

      await this._sleep(jitterMs);
    }

    if (!this._coordinatorConfig.skipColdStart && this._coordinatorConfig.coldStartDuration > 0) {
      await this._executeColdStart();
    } else {
      const leader = await this.getLeader();
      const wasCoordinator = this.isCoordinator;
      this.isCoordinator = leader === this.workerId;

      this.logger.debug(
        { leader, isCoordinator: this.isCoordinator },
        `Skipped cold start - Leader: ${leader} (this: ${this.isCoordinator ? 'YES' : 'NO'})`
      );

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

  async stopCoordination(): Promise<void> {
    if (!this._coordinatorConfig.enableCoordinator) return;

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

  async isLeader(): Promise<boolean> {
    if (!this._globalCoordinator) return false;
    return this.isCoordinator;
  }

  async getLeader(): Promise<string | null> {
    if (!this._globalCoordinator) return null;
    return await this._globalCoordinator.getLeader();
  }

  async getActiveWorkers(): Promise<unknown[]> {
    if (!this._globalCoordinator) return [];
    return await this._globalCoordinator.getActiveWorkers();
  }

  async getCurrentEpoch(): Promise<number> {
    if (!this._globalCoordinator) return this._lastKnownEpoch;
    return await this._globalCoordinator.getEpoch();
  }

  /**
   * Validates if a task should be processed based on its epoch.
   * Inspired by etcd Raft's Term fencing mechanism.
   *
   * Returns true if the task should be processed, false if it should be rejected.
   * Tasks from stale epochs are rejected to prevent split-brain scenarios.
   */
  validateEpoch(taskEpoch: number, taskTimestamp?: number): EpochValidationResult {
    if (!this._coordinatorConfig.epochFencingEnabled) {
      return {
        valid: true,
        reason: 'current',
        taskEpoch,
        currentEpoch: this._lastKnownEpoch
      };
    }

    if (taskEpoch > this._lastKnownEpoch) {
      this._lastKnownEpoch = taskEpoch;
      this._lastEpochChangeTime = Date.now();
      return {
        valid: true,
        reason: 'current',
        taskEpoch,
        currentEpoch: this._lastKnownEpoch
      };
    }

    if (taskEpoch === this._lastKnownEpoch) {
      return {
        valid: true,
        reason: 'current',
        taskEpoch,
        currentEpoch: this._lastKnownEpoch
      };
    }

    if (taskEpoch === this._lastKnownEpoch - 1) {
      const now = Date.now();
      const timeSinceEpochChange = now - this._lastEpochChangeTime;
      const taskAge = taskTimestamp ? now - taskTimestamp : Infinity;

      if (timeSinceEpochChange < this._coordinatorConfig.epochGracePeriodMs ||
          taskAge < this._coordinatorConfig.epochGracePeriodMs) {
        this.logger.warn({
          taskEpoch,
          currentEpoch: this._lastKnownEpoch,
          timeSinceEpochChange,
          taskAge: taskTimestamp ? taskAge : 'unknown'
        }, 'Accepting task within grace period (epoch-1)');

        return {
          valid: true,
          reason: 'grace_period',
          taskEpoch,
          currentEpoch: this._lastKnownEpoch
        };
      }
    }

    this.logger.warn({
      taskEpoch,
      currentEpoch: this._lastKnownEpoch,
      workerId: this.workerId
    }, 'Rejecting task from stale epoch (split-brain prevention)');

    if (this._globalCoordinator) {
      this._globalCoordinator.incrementEpochDriftEvents();
    }

    return {
      valid: false,
      reason: 'stale',
      taskEpoch,
      currentEpoch: this._lastKnownEpoch
    };
  }

  /**
   * Convenience method that returns boolean only.
   */
  isEpochValid(taskEpoch: number, taskTimestamp?: number): boolean {
    return this.validateEpoch(taskEpoch, taskTimestamp).valid;
  }

  protected async _initializeGlobalCoordinator(): Promise<void> {
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
    }) as unknown as GlobalCoordinatorService;

    const pluginId = this.instanceName || this.slug || this.constructor.name.toLowerCase();
    await this._globalCoordinator!.subscribePlugin(pluginId, this);

    this._setupLeaderChangeListener();

    const currentLeader = await this._globalCoordinator!.getLeader();
    if (currentLeader === this.workerId && !this.isCoordinator) {
      this.isCoordinator = true;
      this.emit('plg:coordinator:promoted', {
        workerId: this.workerId,
        timestamp: Date.now(),
        pluginName: this.constructor.name
      } as CoordinatorEventData);
    }

    this.logger.debug({ namespace }, `Connected to global coordinator (namespace: ${namespace})`);
  }

  protected _setupLeaderChangeListener(): void {
    if (!this._globalCoordinator) return;
    if (this._leaderChangeListener) return;

    this._leaderChangeListener = async (event: LeaderChangeEvent): Promise<void> => {
      const wasLeader = this.isCoordinator;
      const isNowLeader = event.newLeader === this.workerId;

      this.isCoordinator = isNowLeader;
      this.currentLeaderId = event.newLeader;

      if (event.epoch > this._lastKnownEpoch) {
        this._lastKnownEpoch = event.epoch;
        this._lastEpochChangeTime = Date.now();
      }

      this.logger.debug(
        { previousLeader: event.previousLeader || 'none', newLeader: event.newLeader, epoch: event.epoch },
        `Leader: ${event.previousLeader || 'none'} → ${event.newLeader} (epoch: ${event.epoch})`
      );

      if (!wasLeader && isNowLeader) {
        await this.onBecomeCoordinator();
        if (this._coordinatorConfig.coordinatorWorkInterval) {
          await this._startCoordinatorWork();
        }
        this.emit('plg:coordinator:promoted', {
          workerId: this.workerId,
          timestamp: Date.now(),
          pluginName: this.constructor.name
        } as CoordinatorEventData);
      }
      else if (wasLeader && !isNowLeader) {
        await this.onStopBeingCoordinator();
        this._clearIntervalHandle(this._coordinatorWorkHandle);
        this._coordinatorWorkHandle = null;
        this.emit('plg:coordinator:demoted', {
          workerId: this.workerId,
          timestamp: Date.now(),
          pluginName: this.constructor.name
        } as CoordinatorEventData);
      }
    };

    this._globalCoordinator.on('leader:changed', this._leaderChangeListener);
  }

  protected _clearLeaderChangeListener(): void {
    if (!this._globalCoordinator || !this._leaderChangeListener) return;
    this._globalCoordinator.removeListener('leader:changed', this._leaderChangeListener);
    this._leaderChangeListener = null;
  }

  protected async _executeColdStart(): Promise<void> {
    this.logger.debug(
      { coldStartDuration: this._coordinatorConfig.coldStartDuration },
      `Cold start: ${this._coordinatorConfig.coldStartDuration}ms`
    );

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
    } as ColdStartPhaseEventData);

    this.coldStartPhase = 'election';
    this.logger.debug({ phase: 'election' }, 'Cold start phase: election');

    await this._sleep(phaseDuration);

    const leader = await this.getLeader();
    this.isCoordinator = leader === this.workerId;

    this.logger.debug(
      { leader, isCoordinator: this.isCoordinator },
      `Leader elected: ${leader} (this: ${this.isCoordinator ? 'YES' : 'NO'})`
    );

    this.emit('plg:coordinator:cold-start-phase', {
      phase: 'election',
      leaderId: leader,
      isLeader: this.isCoordinator,
      timestamp: Date.now(),
      pluginName: this.constructor.name,
      workerId: this.workerId
    } as ColdStartPhaseEventData);

    this.coldStartPhase = 'preparation';
    this.logger.debug({ phase: 'preparation' }, 'Cold start phase: preparation');

    this.emit('plg:coordinator:cold-start-phase', {
      phase: 'preparation',
      isLeader: this.isCoordinator,
      timestamp: Date.now(),
      pluginName: this.constructor.name,
      workerId: this.workerId
    } as ColdStartPhaseEventData);

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
    } as ColdStartCompleteEventData);
  }

  protected async _startCoordinatorWork(): Promise<void> {
    if (!this._coordinatorConfig.coordinatorWorkInterval) return;
    if (this._coordinatorWorkHandle) return;

    this._coordinatorWorkHandle = await this._scheduleInterval(
      async () => {
        if (!this.isCoordinator) return;
        try {
          await this.coordinatorWork();
        } catch (err) {
          this.logger.warn({ error: (err as Error).message }, `Coordinator work error: ${(err as Error).message}`);
        }
      },
      this._coordinatorConfig.coordinatorWorkInterval,
      `coordinator-work-${this.workerId}`
    );

    this.logger.debug(
      { interval: this._coordinatorConfig.coordinatorWorkInterval },
      `Coordinator work started (interval: ${this._coordinatorConfig.coordinatorWorkInterval}ms)`
    );
  }

  protected async _scheduleInterval(
    fn: () => Promise<void>,
    intervalMs: number,
    name: string
  ): Promise<IntervalHandle> {
    const cronManager = this.database?.cronManager ?? getCronManager();

    if (cronManager && !cronManager.disabled) {
      await cronManager.scheduleInterval(
        intervalMs,
        async () => {
          try {
            await fn();
          } catch (err) {
            this.logger.warn({ error: (err as Error).message, jobName: name }, `[${name}] Error: ${(err as Error).message}`);
          }
        },
        name
      );
      return { type: 'cron', jobName: name };
    }

    let running = false;
    const timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        await fn();
      } catch (err) {
        this.logger.warn({ error: (err as Error).message, jobName: name }, `[${name}] Error: ${(err as Error).message}`);
      } finally {
        running = false;
      }
    }, intervalMs);

    if (timer.unref) {
      timer.unref();
    }

    return { type: 'manual', timer };
  }

  protected _clearIntervalHandle(handle: IntervalHandle | null): void {
    if (!handle) return;

    if (handle.type === 'cron') {
      const cronManager = this.database?.cronManager ?? getCronManager();
      if (cronManager && handle.jobName) {
        cronManager.stop(handle.jobName);
      }
    } else if (handle.type === 'manual' && handle.timer) {
      clearInterval(handle.timer);
    }
  }

  protected _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected _generateWorkerId(): string {
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
