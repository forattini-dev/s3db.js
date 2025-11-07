/**
 * CoordinatorPlugin - Base class for plugins that need distributed coordination
 *
 * Provides:
 * - Worker registration & heartbeats
 * - Deterministic coordinator election (lexicographic)
 * - Epoch-based leadership with automatic renewal
 * - Cold start observation period
 * - Active workers discovery
 * - Lifecycle hooks for coordinator transitions
 *
 * Subclasses must implement:
 * - onBecomeCoordinator(): Called when this worker becomes coordinator
 * - onStopBeingCoordinator(): Called when this worker stops being coordinator
 * - coordinatorWork(): Periodic work that only coordinator should do
 *
 * @example
 * class MyPlugin extends CoordinatorPlugin {
 *   async onBecomeCoordinator() {
 *     console.log('I am the coordinator now!');
 *   }
 *
 *   async onStopBeingCoordinator() {
 *     console.log('I am no longer coordinator');
 *   }
 *
 *   async coordinatorWork() {
 *     // This runs periodically, only on coordinator
 *     await this.doSomeCleanup();
 *   }
 * }
 */

import { Plugin } from '../plugin.class.js';
import { tryFn } from '../../concerns/try-fn.js';
import { getCronManager } from '../../concerns/cron-manager.js';

export class CoordinatorPlugin extends Plugin {
  constructor(config = {}) {
    super(config);

    // Worker identity
    this.workerId = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.workerStartTime = Date.now();

    // Coordinator state
    this.isCoordinator = false;
    this.currentCoordinatorId = null;

    // Coordination handles
    this.heartbeatHandle = null;
    this.coordinatorWorkHandle = null;

    // Cold start state
    this.coldStartPhase = 'not_started';
    this.coldStartCompleted = false;

    // Normalize coordinator configuration
    this.coordinatorConfig = this._normalizeCoordinatorConfig(config);
  }

  // ==================== ABSTRACT METHODS ====================
  // Subclasses MUST implement these:

  /**
   * Called when this worker becomes coordinator
   * Use this to start coordinator-only work
   * @abstract
   */
  async onBecomeCoordinator() {
    // Default: do nothing (subclasses can override)
    if (this.config.verbose) {
      console.log(`[${this.constructor.name}] Became coordinator (workerId: ${this.workerId})`);
    }
  }

  /**
   * Called when this worker stops being coordinator
   * Use this to cleanup coordinator-only resources
   * @abstract
   */
  async onStopBeingCoordinator() {
    // Default: do nothing (subclasses can override)
    if (this.config.verbose) {
      console.log(`[${this.constructor.name}] No longer coordinator (workerId: ${this.workerId})`);
    }
  }

  /**
   * Periodic work that only the coordinator should do
   * Called at `coordinatorWorkInterval` frequency
   * @abstract
   */
  async coordinatorWork() {
    // Default: do nothing (subclasses can override)
  }

  // ==================== CONFIGURATION ====================

  _normalizeCoordinatorConfig(config) {
    const {
      enableCoordinator = true,
      heartbeatInterval = 5000,
      heartbeatTTL = 3,
      epochDuration = 300000,
      coldStartDuration = 0,
      skipColdStart = false,
      coordinatorWorkInterval = null
    } = config;

    return {
      enableCoordinator: Boolean(enableCoordinator),
      heartbeatInterval: Math.max(1000, heartbeatInterval),
      heartbeatTTL: Math.max(2, heartbeatTTL),
      epochDuration: Math.max(60000, epochDuration),
      coldStartDuration: Math.max(0, coldStartDuration),
      skipColdStart: Boolean(skipColdStart),
      coordinatorWorkInterval: coordinatorWorkInterval ? Math.max(100, coordinatorWorkInterval) : null
    };
  }

  // ==================== WORKER HEARTBEAT ====================

  /**
   * Publish heartbeat to indicate this worker is alive
   */
  async publishHeartbeat() {
    if (!this.coordinatorConfig.enableCoordinator) return;

    const storage = this.getStorage();
    const key = storage.getPluginKey(null, 'workers', this.workerId);

    const [ok, err] = await tryFn(() =>
      storage.set(key, {
        workerId: this.workerId,
        lastHeartbeat: Date.now(),
        startTime: this.workerStartTime,
        isCoordinator: this.isCoordinator
      }, {
        ttl: this.coordinatorConfig.heartbeatTTL,
        behavior: 'body-only'
      })
    );

    if (!ok && this.config.verbose) {
      console.warn(`[${this.constructor.name}] Failed to publish heartbeat:`, err?.message);
    }
  }

  /**
   * Get list of active workers (those with recent heartbeats)
   * @returns {Promise<Array<{workerId: string, lastHeartbeat: number, isCoordinator: boolean}>>}
   */
  async getActiveWorkers() {
    if (!this.coordinatorConfig.enableCoordinator) return [];

    const storage = this.getStorage();
    const prefix = 'workers/';

    const [ok, err, workers] = await tryFn(() => storage.listWithPrefix(prefix));

    if (!ok) {
      if (this.config.verbose) {
        console.warn(`[${this.constructor.name}] Failed to list active workers:`, err?.message);
      }
      return [];
    }

    if (!workers || workers.length === 0) {
      return [];
    }

    // Filter out stale workers (heartbeat older than TTL)
    const now = Date.now();
    const ttlMs = this.coordinatorConfig.heartbeatTTL * 1000;

    return workers
      .filter(w => {
        if (!w || !w.workerId || !w.lastHeartbeat) return false;
        const age = now - w.lastHeartbeat;
        return age < ttlMs;
      })
      .sort((a, b) => a.workerId.localeCompare(b.workerId));
  }

  // ==================== COORDINATOR ELECTION ====================

  /**
   * Elect coordinator using deterministic rule: lexicographically first worker ID
   * @returns {Promise<string|null>} Worker ID of elected coordinator
   */
  async electCoordinator() {
    if (!this.coordinatorConfig.enableCoordinator) return null;

    const activeWorkers = await this.getActiveWorkers();

    if (activeWorkers.length === 0) {
      return null;
    }

    if (activeWorkers.length === 1) {
      return activeWorkers[0].workerId;
    }

    // Lexicographic ordering (alphabetically first identifier)
    const sorted = activeWorkers.map(w => w.workerId).sort();
    return sorted[0];
  }

  /**
   * Check if this worker is the current coordinator
   * @returns {Promise<boolean>}
   */
  async checkIsCoordinator() {
    if (!this.coordinatorConfig.enableCoordinator) return false;

    const coordinatorId = await this.getCoordinator();
    return coordinatorId === this.workerId;
  }

  /**
   * Get current coordinator from epoch storage
   * If epoch expired, trigger re-election
   * @returns {Promise<string|null>} Worker ID of current coordinator
   */
  async getCoordinator() {
    if (!this.coordinatorConfig.enableCoordinator) return null;

    const storage = this.getStorage();
    const key = storage.getPluginKey(null, 'coordinator', 'current');

    const [ok, err, data] = await tryFn(() => storage.get(key));

    if (!ok) {
      if (err && err.code !== 'NoSuchKey' && err.code !== 'NotFound' && this.config.verbose) {
        console.warn(`[${this.constructor.name}] Failed to get coordinator:`, err?.message);
      }
      // No coordinator yet, trigger election
      return await this.ensureCoordinator();
    }

    if (!data) {
      return await this.ensureCoordinator();
    }

    // Check if epoch expired
    const now = Date.now();
    if (data.epochEnd && now >= data.epochEnd) {
      // Epoch expired, re-elect
      if (this.config.verbose) {
        console.log(`[${this.constructor.name}] Coordinator epoch expired, triggering re-election`);
      }
      return await this.ensureCoordinator();
    }

    this.currentCoordinatorId = data.coordinatorId;
    return data.coordinatorId;
  }

  /**
   * Ensure a coordinator is elected and epoch is valid
   * Uses distributed lock to prevent race conditions during election
   *
   * Respects existing coordinator's epoch - will not force re-election
   * during valid epoch period unless coordinator disappears.
   *
   * @param {Object} options
   * @param {boolean} options.force - Force re-election even if epoch is valid
   * @param {string} options.desiredCoordinator - Prefer this worker as coordinator
   * @returns {Promise<string|null>} Worker ID of coordinator
   */
  async ensureCoordinator({ force = false, desiredCoordinator = null } = {}) {
    if (!this.coordinatorConfig.enableCoordinator) return null;

    const storage = this.getStorage();
    const lockName = 'coordinator-election';

    // Acquire election lock to prevent race conditions
    const lock = await storage.acquireLock(lockName, {
      ttl: 5,  // 5 seconds for election
      timeout: 0,
      workerId: this.workerId
    });

    if (!lock) {
      // Another worker is conducting election, wait and retry
      await this._sleep(100);
      return await this.getCoordinator();
    }

    try {
      // Double-check: maybe another worker just finished election
      const key = storage.getPluginKey(null, 'coordinator', 'current');
      const [okCheck, , existingData] = await tryFn(() => storage.get(key));

      if (!force && okCheck && existingData && existingData.epochEnd > Date.now()) {
        // Valid coordinator exists
        return existingData.coordinatorId;
      }

      // Conduct election
      const electedCoordinatorId = await this.electCoordinator();
      let newCoordinatorId = desiredCoordinator || electedCoordinatorId;

      if (desiredCoordinator && desiredCoordinator !== electedCoordinatorId) {
        // Ensure desired coordinator is still active; otherwise fall back to electedId
        const activeWorkers = await this.getActiveWorkers();
        const desiredStillActive = activeWorkers.some(w => w.workerId === desiredCoordinator);
        if (!desiredStillActive) {
          newCoordinatorId = electedCoordinatorId;
        }
      }

      if (!newCoordinatorId) {
        return null;
      }

      const now = Date.now();
      const epochEnd = now + this.coordinatorConfig.epochDuration;

      // Store coordinator state
      const [okStore, errStore] = await tryFn(() =>
        storage.set(key, {
          coordinatorId: newCoordinatorId,
          epochStart: now,
          epochEnd,
          electedAt: now,
          electedBy: this.workerId
        }, {
          ttl: Math.ceil(this.coordinatorConfig.epochDuration / 1000) + 60,  // TTL > epoch duration
          behavior: 'body-only'
        })
      );

      if (!okStore) {
        if (this.config.verbose) {
          console.warn(`[${this.constructor.name}] Failed to store coordinator state:`, errStore?.message);
        }
        return null;
      }

      this.emit('plg:coordinator:elected', {
        coordinatorId: newCoordinatorId,
        epochStart: now,
        epochEnd,
        isCoordinator: newCoordinatorId === this.workerId,
        pluginName: this.constructor.name
      });

      if (this.config.verbose) {
        console.log(`[${this.constructor.name}] Coordinator elected: ${newCoordinatorId} (epoch: ${now} - ${epochEnd})`);
      }

      this.currentCoordinatorId = newCoordinatorId;

      return newCoordinatorId;
    } finally {
      await storage.releaseLock(lock);
    }
  }

  /**
   * Renew coordinator epoch if this worker is coordinator and epoch is about to expire
   * @returns {Promise<boolean>} True if renewed
   */
  async renewCoordinatorEpoch() {
    if (!this.coordinatorConfig.enableCoordinator) return false;
    if (!this.isCoordinator) return false;

    const storage = this.getStorage();
    const key = storage.getPluginKey(null, 'coordinator', 'current');

    const [ok, err, data] = await tryFn(() => storage.get(key));

    if (!ok || !data) {
      if (this.config.verbose) {
        console.warn(`[${this.constructor.name}] Cannot renew epoch: no coordinator data found`);
      }
      this.isCoordinator = false;
      return false;
    }

    const now = Date.now();
    const timeUntilExpiry = data.epochEnd - now;
    const renewalThreshold = this.coordinatorConfig.epochDuration * 0.2; // Renew at 20% remaining

    if (timeUntilExpiry > renewalThreshold) {
      return false; // Not time to renew yet
    }

    const newEpochEnd = now + this.coordinatorConfig.epochDuration;

    const [okRenew, errRenew] = await tryFn(() =>
      storage.set(key, {
        ...data,
        epochEnd: newEpochEnd,
        renewedAt: now
      }, {
        ttl: Math.ceil(this.coordinatorConfig.epochDuration / 1000) + 60,
        behavior: 'body-only'
      })
    );

    if (!okRenew) {
      if (this.config.verbose) {
        console.warn(`[${this.constructor.name}] Failed to renew epoch:`, errRenew?.message);
      }
      return false;
    }

    this.emit('plg:coordinator:epoch-renewed', {
      coordinatorId: this.workerId,
      newEpochEnd,
      pluginName: this.constructor.name
    });

    if (this.config.verbose) {
      console.log(`[${this.constructor.name}] Coordinator epoch renewed until ${newEpochEnd}`);
    }

    return true;
  }

  // ==================== COLD START ====================

  /**
   * Execute cold start observation period
   * Allows all workers to discover each other before election
   * @private
   */
  async _executeColdStart() {
    if (this.config.verbose) {
      console.log(`[${this.constructor.name}] Starting cold start period (${this.coordinatorConfig.coldStartDuration}ms)...`);
    }

    const startTime = Date.now();
    const phaseDuration = this.coordinatorConfig.coldStartDuration / 3; // Divide into 3 phases

    // Phase 1: Observing - Discover active workers
    this.coldStartPhase = 'observing';
    if (this.config.verbose) {
      console.log(`[${this.constructor.name}] Cold start phase: observing (discovering workers)`);
    }

    // Publish initial heartbeat
    await this.publishHeartbeat();

    // Wait and discover workers
    await new Promise(resolve => setTimeout(resolve, phaseDuration));
    const activeWorkers = await this.getActiveWorkers();

    if (this.config.verbose) {
      console.log(`[${this.constructor.name}] Discovered ${activeWorkers.length} active worker(s): ${activeWorkers.map(w => w.workerId).join(', ')}`);
    }

    this.emit('plg:coordinator:cold-start-phase', {
      phase: 'observing',
      workersDiscovered: activeWorkers.length,
      timestamp: Date.now(),
      pluginName: this.constructor.name
    });

    // Phase 2: Election - Participate in coordinator election
    this.coldStartPhase = 'election';
    if (this.config.verbose) {
      console.log(`[${this.constructor.name}] Cold start phase: election (coordinator election)`);
    }

    // Ensure coordinator exists
    await this.ensureCoordinator({ force: false });
    const coordinatorId = await this.getCoordinator();
    this.isCoordinator = await this.checkIsCoordinator();

    if (this.config.verbose) {
      console.log(`[${this.constructor.name}] Coordinator elected: ${coordinatorId || 'none'} (this worker: ${this.isCoordinator ? 'YES' : 'no'})`);
    }

    this.emit('plg:coordinator:cold-start-phase', {
      phase: 'election',
      coordinatorId: coordinatorId,
      isCoordinator: this.isCoordinator,
      timestamp: Date.now(),
      pluginName: this.constructor.name
    });

    await new Promise(resolve => setTimeout(resolve, phaseDuration));

    // Phase 3: Preparation - Allow coordinator to prepare
    this.coldStartPhase = 'preparation';
    if (this.config.verbose) {
      console.log(`[${this.constructor.name}] Cold start phase: preparation`);
    }

    // If we're coordinator, run onBecomeCoordinator
    if (this.isCoordinator) {
      await this.onBecomeCoordinator();
    }

    // Ensure we wait for the full phase duration
    const elapsed = Date.now() - startTime;
    const remaining = this.coordinatorConfig.coldStartDuration - elapsed;
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining));
    }

    this.emit('plg:coordinator:cold-start-phase', {
      phase: 'preparation',
      isCoordinator: this.isCoordinator,
      timestamp: Date.now(),
      pluginName: this.constructor.name
    });

    // Phase 4: Ready
    this.coldStartPhase = 'ready';
    this.coldStartCompleted = true;

    const elapsedMs = Date.now() - startTime;
    if (this.config.verbose) {
      console.log(`[${this.constructor.name}] Cold start completed in ${elapsedMs}ms - ready`);
    }

    this.emit('plg:coordinator:cold-start-complete', {
      duration: elapsedMs,
      isCoordinator: this.isCoordinator,
      timestamp: Date.now(),
      pluginName: this.constructor.name
    });
  }

  // ==================== LIFECYCLE ====================

  /**
   * Start coordination system
   * - Executes cold start if configured
   * - Starts heartbeat loop
   * - Starts coordinator work loop if this worker is coordinator
   */
  async startCoordination() {
    if (!this.coordinatorConfig.enableCoordinator) {
      if (this.config.verbose) {
        console.log(`[${this.constructor.name}] Coordinator mode disabled`);
      }
      return;
    }

    // Cold start
    if (!this.coordinatorConfig.skipColdStart && this.coordinatorConfig.coldStartDuration > 0) {
      await this._executeColdStart();
    } else {
      // Skip cold start - immediate election
      await this.ensureCoordinator();
      this.isCoordinator = await this.checkIsCoordinator();

      if (this.config.verbose) {
        console.log(`[${this.constructor.name}] Cold start skipped - immediate election`);
      }

      // Mark cold start as completed (even though it was skipped)
      this.coldStartCompleted = true;
      this.coldStartPhase = 'ready';

      // If we're coordinator, run onBecomeCoordinator
      if (this.isCoordinator) {
        await this.onBecomeCoordinator();
      }
    }

    // Start heartbeat loop
    this.heartbeatHandle = this._scheduleInterval(
      async () => {
        await this.publishHeartbeat();

        // Renew epoch if needed
        if (this.isCoordinator) {
          await this.renewCoordinatorEpoch();
        }

        // Check if coordinator changed
        const wasCoordinator = this.isCoordinator;
        this.isCoordinator = await this.checkIsCoordinator();

        if (this.isCoordinator && !wasCoordinator) {
          // We became coordinator
          await this.onBecomeCoordinator();
          await this._startCoordinatorWork();

          this.emit('plg:coordinator:promoted', {
            workerId: this.workerId,
            timestamp: Date.now(),
            pluginName: this.constructor.name
          });
        } else if (!this.isCoordinator && wasCoordinator) {
          // We lost coordinator role
          await this.onStopBeingCoordinator();
          this._clearIntervalHandle(this.coordinatorWorkHandle);
          this.coordinatorWorkHandle = null;

          this.emit('plg:coordinator:demoted', {
            workerId: this.workerId,
            timestamp: Date.now(),
            pluginName: this.constructor.name
          });
        }
      },
      this.coordinatorConfig.heartbeatInterval,
      `coordinator-heartbeat-${this.workerId}`
    );

    // Start coordinator work loop if we're coordinator
    if (this.isCoordinator && this.coordinatorConfig.coordinatorWorkInterval) {
      await this._startCoordinatorWork();
    }

    if (this.config.verbose) {
      console.log(`[${this.constructor.name}] Coordinator mode enabled (workerId: ${this.workerId}, isCoordinator: ${this.isCoordinator})`);
    }
  }

  /**
   * Stop coordination system
   * - Stops heartbeat loop
   * - Stops coordinator work loop
   * - Cleans up coordinator state
   */
  async stopCoordination() {
    if (!this.coordinatorConfig.enableCoordinator) return;

    // Stop heartbeat
    this._clearIntervalHandle(this.heartbeatHandle);
    this.heartbeatHandle = null;

    // Stop coordinator work
    this._clearIntervalHandle(this.coordinatorWorkHandle);
    this.coordinatorWorkHandle = null;

    // Reset state
    this.isCoordinator = false;
    this.currentCoordinatorId = null;
    this.coldStartPhase = 'not_started';
    this.coldStartCompleted = false;

    if (this.config.verbose) {
      console.log(`[${this.constructor.name}] Stopped coordination`);
    }
  }

  /**
   * Start coordinator work loop
   * @private
   */
  async _startCoordinatorWork() {
    if (!this.coordinatorConfig.coordinatorWorkInterval) return;
    if (this.coordinatorWorkHandle) return; // Already started

    this.coordinatorWorkHandle = this._scheduleInterval(
      async () => {
        if (!this.isCoordinator) return;
        await this.coordinatorWork();
      },
      this.coordinatorConfig.coordinatorWorkInterval,
      `coordinator-work-${this.workerId}`
    );

    if (this.config.verbose) {
      console.log(`[${this.constructor.name}] Started coordinator work loop (interval: ${this.coordinatorConfig.coordinatorWorkInterval}ms)`);
    }
  }

  // ==================== UTILITIES ====================

  /**
   * Schedule interval with fallback to manual setInterval when CronManager is disabled
   * @private
   */
  _scheduleInterval(fn, intervalMs, name) {
    const cronManager = getCronManager();

    // Try using CronManager first
    if (cronManager && !cronManager.disabled) {
      const jobName = cronManager.scheduleInterval(
        intervalMs,
        async () => {
          try {
            await fn();
          } catch (err) {
            if (this.config.verbose) {
              console.warn(`[${this.constructor.name}][${name}] Error:`, err.message);
            }
          }
        },
        name
      );
      return { type: 'cron', jobName };
    }

    // Fallback to manual setInterval for tests
    let running = false;
    const timer = setInterval(async () => {
      if (running) return; // Prevent reentrancy
      running = true;
      try {
        await fn();
      } catch (err) {
        if (this.config.verbose) {
          console.warn(`[${this.constructor.name}][${name}] Error:`, err.message);
        }
      } finally {
        running = false;
      }
    }, intervalMs);

    // Execute immediately once for tests
    setImmediate(async () => {
      try {
        await fn();
      } catch (err) {
        if (this.config.verbose) {
          console.warn(`[${this.constructor.name}][${name}] Initial run error:`, err.message);
        }
      }
    });

    return { type: 'manual', timer };
  }

  /**
   * Clear interval handle (works with both CronManager and manual setInterval)
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
