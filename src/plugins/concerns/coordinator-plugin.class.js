/**
 * CoordinatorPlugin - Universal base class for distributed coordination
 *
 * All coordinator plugins use GlobalCoordinatorService for shared leader election.
 * No fallback, no per-plugin mode - just one elegant way.
 *
 * Subclasses must implement:
 * - onBecomeCoordinator(): Called when this worker becomes leader
 * - onStopBeingCoordinator(): Called when this worker stops being leader
 * - coordinatorWork(): Periodic work (coordinator only)
 *
 * Startup Jitter (Thundering Herd Prevention):
 * - Prevents all workers from hitting S3 simultaneously during mass pod restarts
 * - Random delay between startupJitterMin and startupJitterMax
 * - Spreads startup load over configured window (0-5s recommended)
 *
 * @example
 * class MyPlugin extends CoordinatorPlugin {
 *   async onBecomeCoordinator() {
 *     this.logger.info('I am leader!');
 *   }
 *
 *   async onStopBeingCoordinator() {
 *     this.logger.info('Demoted from leader');
 *   }
 *
 *   async coordinatorWork() {
 *     // Runs periodically, only on leader
 *     await this.doCleanup();
 *   }
 * }
 */

import { Plugin } from '../plugin.class.js';
import { getCronManager } from '../../concerns/cron-manager.js';
import { createLogger } from '../../concerns/logger.js';

// Monotonic counter for unique worker IDs
let workerCounter = 0;

export class CoordinatorPlugin extends Plugin {
  constructor(config = {}) {
    super(config);

    this.config = this.options;

    // 🪵 Logger initialization
    if (config.logger) {
      this.logger = config.logger;
    } else {
      const logLevel = this.logLevel || 'info';
      this.logger = createLogger({ name: 'CoordinatorPlugin', level: logLevel });
    }

    // Worker identity (unique even if created in same millisecond)
    this.workerId = `worker-${Date.now()}-${++workerCounter}-${Math.random().toString(36).slice(2, 9)}`;
    this.workerStartTime = Date.now();

    // Coordinator state
    this.isCoordinator = false;
    this.currentLeaderId = null;

    // Global coordinator service (required, not optional)
    this._globalCoordinator = null;
    this._leaderChangeListener = null;

    // Coordination handles
    this._heartbeatHandle = null;
    this._coordinatorWorkHandle = null;

    // Cold start state
    this.coldStartPhase = 'not_started';
    this.coldStartCompleted = false;

    // Normalize config
    this._coordinatorConfig = this._normalizeConfig(config);
  }

  // ==================== CONFIGURATION ====================

  _normalizeConfig(config) {
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
      workerTimeout = 20000
    } = config;

    // Validate jitter
    if (startupJitterMin < 0) throw new Error('startupJitterMin must be >= 0');
    if (startupJitterMax < startupJitterMin) throw new Error('startupJitterMax must be >= startupJitterMin');

    return {
      enableCoordinator: Boolean(enableCoordinator),
      startupJitterMin: Math.max(0, startupJitterMin),
      startupJitterMax: Math.max(0, startupJitterMax),
      coldStartDuration: Math.max(0, coldStartDuration),
      skipColdStart: Boolean(skipColdStart),
      coordinatorWorkInterval: coordinatorWorkInterval ? Math.max(100, coordinatorWorkInterval) : null,
      // Global coordinator settings
      heartbeatInterval: Math.max(1000, heartbeatInterval),
      heartbeatJitter: Math.max(0, heartbeatJitter),
      leaseTimeout: Math.max(5000, leaseTimeout),
      workerTimeout: Math.max(5000, workerTimeout)
    };
  }

  // ==================== ABSTRACT METHODS ====================

  async onBecomeCoordinator() {
    this.logger.debug({ workerId: this.workerId }, `Became leader (workerId: ${this.workerId})`);
  }

  async onStopBeingCoordinator() {
    this.logger.debug({ workerId: this.workerId }, `No longer leader (workerId: ${this.workerId})`);
  }

  async coordinatorWork() {
    // Default: no-op (subclasses override)
  }

  // ==================== PUBLIC API ====================

  /**
   * Get coordinator configuration (for testing)
   */
  get coordinatorConfig() {
    return this._coordinatorConfig;
  }

  /**
   * Get enableCoordinator flag (for testing)
   */
  get enableCoordinator() {
    return this._coordinatorConfig.enableCoordinator;
  }

  /**
   * Start coordination (called by plugin system)
   */
  async startCoordination() {
    if (!this._coordinatorConfig.enableCoordinator) return;

    // Already started
    if (this._coordinationStarted) return;
    this._coordinationStarted = true;

    // Initialize global coordinator immediately (critical for subscription)
    // This needs to happen before we return to ensure we receive events
    await this._initializeGlobalCoordinator();

    // ✨ FIX: Run election process (jitter, cold start) in BACKGROUND
    // This ensures we don't block db.connect() and resource operations
    // while waiting for startup jitter or cold start duration.
    this._runBackgroundElection().catch(err => {
      this.logger.warn({ error: err.message }, 'Background election process failed');
    });

    this.logger.debug({ workerId: this.workerId }, `Coordination initialized (election in background)`);
  }

  /**
   * Run the election process (jitter, cold start)
   * @private
   */
  async _runBackgroundElection() {
    // Apply startup jitter to prevent thundering herd
    if (this._coordinatorConfig.startupJitterMax > 0) {
      const jitterMs = this._coordinatorConfig.startupJitterMin +
        Math.random() * (this._coordinatorConfig.startupJitterMax - this._coordinatorConfig.startupJitterMin);

      this.logger.debug({ jitterMs: Math.round(jitterMs) }, `Startup jitter: ${Math.round(jitterMs)}ms`);

      await this._sleep(jitterMs);
    }

    // Cold start observation
    if (!this._coordinatorConfig.skipColdStart && this._coordinatorConfig.coldStartDuration > 0) {
      await this._executeColdStart();
    } else {
      // When skipping cold start, immediately check leadership
      const leader = await this.getLeader();
      this.isCoordinator = leader === this.workerId;

      this.logger.debug(
        { leader, isCoordinator: this.isCoordinator },
        `Skipped cold start - Leader: ${leader} (this: ${this.isCoordinator ? 'YES' : 'NO'})`
      );

      // Notify if we became coordinator
      if (this.isCoordinator) {
        await this.onBecomeCoordinator();
      }

      this.coldStartCompleted = true;
      this.coldStartPhase = 'ready';
    }

    // Start coordinator work if configured
    if (this._coordinatorConfig.coordinatorWorkInterval && this.isCoordinator) {
      await this._startCoordinatorWork();
    }
  }

  /**
   * Stop coordination
   */
  async stopCoordination() {
    if (!this._coordinatorConfig.enableCoordinator) return;

    // Stop monitoring
    this._clearLeaderChangeListener();

    // Clear intervals
    this._clearIntervalHandle(this._heartbeatHandle);
    this._heartbeatHandle = null;

    this._clearIntervalHandle(this._coordinatorWorkHandle);
    this._coordinatorWorkHandle = null;

    // Reset state
    this._coordinationStarted = false;
    this.isCoordinator = false;
    this.currentLeaderId = null;
    this.coldStartPhase = 'not_started';
    this.coldStartCompleted = false;

    this.logger.debug('Coordination stopped');
  }

  /**
   * Check if this worker is the current leader
   */
  async isLeader() {
    if (!this._globalCoordinator) return false;
    return this.isCoordinator;
  }

  /**
   * Get current leader ID
   */
  async getLeader() {
    if (!this._globalCoordinator) return null;
    return await this._globalCoordinator.getLeader();
  }

  /**
   * Get list of active workers
   */
  async getActiveWorkers() {
    if (!this._globalCoordinator) return [];
    return await this._globalCoordinator.getActiveWorkers();
  }

  // ==================== PRIVATE: INITIALIZATION ====================

  /**
   * Initialize and connect to global coordinator service
   * @private
   */
  async _initializeGlobalCoordinator() {
    if (!this.database) {
      throw new Error(`[${this.constructor.name}] Database not available - cannot initialize coordinator`);
    }

    const namespace = this.namespace || 'default';

    // Get or create global coordinator for this namespace
    this._globalCoordinator = await this.database.getGlobalCoordinator(namespace, {
      autoStart: true,
      config: {
        heartbeatInterval: this._coordinatorConfig.heartbeatInterval,
        heartbeatJitter: this._coordinatorConfig.heartbeatJitter,
        leaseTimeout: this._coordinatorConfig.leaseTimeout,
        workerTimeout: this._coordinatorConfig.workerTimeout,
        diagnosticsEnabled: this.config.logLevel
      }
    });

    // Subscribe to global coordinator
    const pluginId = this.instanceName || this.slug || this.constructor.name.toLowerCase();
    await this._globalCoordinator.subscribePlugin(pluginId, this);

    // Setup leader change listener immediately to catch any events
    this._setupLeaderChangeListener();

    // Check if we're already the leader and emit promotion event if needed
    // (in case the first election happened before the listener was set up)
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

  /**
   * Setup listener for leader change events
   * @private
   */
  _setupLeaderChangeListener() {
    if (!this._globalCoordinator) return;
    if (this._leaderChangeListener) return; // Already set up

    this._leaderChangeListener = async (event) => {
      const wasLeader = this.isCoordinator;
      const isNowLeader = event.newLeader === this.workerId;

      this.isCoordinator = isNowLeader;
      this.currentLeaderId = event.newLeader;

      this.logger.debug(
        { previousLeader: event.previousLeader || 'none', newLeader: event.newLeader, epoch: event.epoch },
        `Leader: ${event.previousLeader || 'none'} → ${event.newLeader} (epoch: ${event.epoch})`
      );

      // Promotion: none → leader
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
      // Demotion: leader → none
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

  /**
   * Remove leader change listener
   * @private
   */
  _clearLeaderChangeListener() {
    if (!this._globalCoordinator || !this._leaderChangeListener) return;
    this._globalCoordinator.removeListener('leader:changed', this._leaderChangeListener);
    this._leaderChangeListener = null;
  }

  // ==================== PRIVATE: COLD START ====================

  /**
   * Execute cold start observation period
   * Allows workers to discover each other before declaring leader
   * @private
   */
  async _executeColdStart() {
    this.logger.debug(
      { coldStartDuration: this._coordinatorConfig.coldStartDuration },
      `Cold start: ${this._coordinatorConfig.coldStartDuration}ms`
    );

    const startTime = Date.now();
    const phaseDuration = this._coordinatorConfig.coldStartDuration / 3;

    // Phase 1: Observing
    this.coldStartPhase = 'observing';
    this.logger.debug({ phase: 'observing' }, 'Cold start phase: observing');

    await this._sleep(phaseDuration);
    const workers = await this.getActiveWorkers();

    this.logger.debug({ workerCount: workers.length }, `Discovered ${workers.length} worker(s)`);

    this.emit('plg:coordinator:cold-start-phase', {
      phase: 'observing',
      workersDiscovered: workers.length,
      timestamp: Date.now(),
      pluginName: this.constructor.name
    });

    // Phase 2: Election
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
      pluginName: this.constructor.name
    });

    // Phase 3: Preparation
    this.coldStartPhase = 'preparation';
    this.logger.debug({ phase: 'preparation' }, 'Cold start phase: preparation');

    this.emit('plg:coordinator:cold-start-phase', {
      phase: 'preparation',
      isLeader: this.isCoordinator,
      timestamp: Date.now(),
      pluginName: this.constructor.name
    });

    if (this.isCoordinator) {
      await this.onBecomeCoordinator();
    }

    // Wait for remaining time
    const elapsed = Date.now() - startTime;
    const remaining = this._coordinatorConfig.coldStartDuration - elapsed;
    if (remaining > 0) {
      await this._sleep(remaining);
    }

    // Ready
    this.coldStartPhase = 'ready';
    this.coldStartCompleted = true;

    const duration = Date.now() - startTime;
    this.logger.debug({ duration, isLeader: this.isCoordinator }, `Cold start completed in ${duration}ms`);

    this.emit('plg:coordinator:cold-start-complete', {
      duration,
      isLeader: this.isCoordinator,
      timestamp: Date.now(),
      pluginName: this.constructor.name
    });
  }

  // ==================== PRIVATE: COORDINATOR WORK ====================

  /**
   * Start coordinator work loop
   * @private
   */
  async _startCoordinatorWork() {
    if (!this._coordinatorConfig.coordinatorWorkInterval) return;
    if (this._coordinatorWorkHandle) return; // Already running

    this._coordinatorWorkHandle = await this._scheduleInterval(
      async () => {
        if (!this.isCoordinator) return;
        try {
          await this.coordinatorWork();
        } catch (err) {
          this.logger.warn({ error: err.message }, `Coordinator work error: ${err.message}`);
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

  // ==================== PRIVATE: UTILITIES ====================

  /**
   * Schedule interval using CronManager or fallback to setInterval
   * @private
   */
  async _scheduleInterval(fn, intervalMs, name) {
    const cronManager = getCronManager();

    // Use CronManager if available
    if (cronManager && !cronManager.disabled) {
      const task = await cronManager.scheduleInterval(
        intervalMs,
        async () => {
          try {
            await fn();
          } catch (err) {
            this.logger.warn({ error: err.message, jobName: name }, `[${name}] Error: ${err.message}`);
          }
        },
        name
      );
      return { type: 'cron', jobName: name };
    }

    // Fallback to manual setInterval
    let running = false;
    const timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        await fn();
      } catch (err) {
        this.logger.warn({ error: err.message, jobName: name }, `[${name}] Error: ${err.message}`);
      } finally {
        running = false;
      }
    }, intervalMs);

    return { type: 'manual', timer };
  }

  /**
   * Clear interval handle
   * @private
   */
  _clearIntervalHandle(handle) {
    if (!handle) return;

    if (handle.type === 'cron') {
      const cronManager = getCronManager();
      if (cronManager && handle.jobName) {
        cronManager.stop(handle.jobName);
      }
    } else if (handle.type === 'manual' && handle.timer) {
      clearInterval(handle.timer);
    }
  }

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
