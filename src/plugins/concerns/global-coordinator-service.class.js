/**
 * GlobalCoordinatorService - Shared coordinator election service for multiple plugins
 *
 * Provides a single election loop that serves multiple coordinator-enabled plugins
 * in the same namespace, reducing S3 API calls by ~N× (where N is number of plugins).
 *
 * Features:
 * - Lazy instantiation (one per namespace per Database)
 * - Atomic heartbeat and leader election
 * - Event-driven plugin subscriptions (leader:changed, workers:updated)
 * - Graceful fallback if storage unavailable
 * - Observable metrics and diagnostics
 *
 * Storage Layout (follows plugin= convention):
 * - plugin=coordinator/<namespace>/state.json          - Leader lease and epoch
 * - plugin=coordinator/<namespace>/workers/<id>.json   - Worker heartbeat
 * - plugin=coordinator/<namespace>/metadata.json       - Service metadata
 *
 * @example
 * const service = new GlobalCoordinatorService({
 *   namespace: 'production',
 *   database: db,
 *   config: {
 *     heartbeatInterval: 5000,
 *     heartbeatJitter: 1000,
 *     leaseTimeout: 15000,
 *     workerTimeout: 20000,
 *     diagnosticsEnabled: true
 *   }
 * });
 *
 * await service.start();
 *
 * // Plugins subscribe to leader changes
 * service.on('leader:changed', ({ namespace, previousLeader, newLeader, epoch }) => {
 *   this.logger.info(`${namespace}: leader changed from ${previousLeader} to ${newLeader}`);
 * });
 *
 * // Check if this worker is leader
 * const isLeader = await service.isLeader(workerId);
 */

import { EventEmitter } from 'events';
import { PluginStorage } from '../../concerns/plugin-storage.js';
import { tryFn } from '../../concerns/try-fn.js';

// Monotonic counter for unique service IDs
let serviceCounter = 0;

export class GlobalCoordinatorService extends EventEmitter {
  constructor({ namespace, database, config = {} } = {}) {
    super();

    if (!namespace) {
      throw new Error('GlobalCoordinatorService: namespace is required');
    }
    if (!database) {
      throw new Error('GlobalCoordinatorService: database is required');
    }

    this.namespace = namespace;
    this.database = database;
    this.serviceId = `global-coordinator-${Date.now()}-${++serviceCounter}`;

    // Worker identity
    this.workerId = `gcs-${namespace}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // State
    this.isRunning = false;
    this.isLeader = false;
    this.currentLeaderId = null;
    this.currentEpoch = 0;

    // Configuration with defaults
    this.config = this._normalizeConfig(config);

    // Timers
    this.heartbeatTimer = null;
    this.electionTimer = null;

    // Subscribed plugins (key = pluginName, value = plugin instance)
    this.subscribedPlugins = new Map();

    // Metrics
    this.metrics = {
      heartbeatCount: 0,
      electionCount: 0,
      electionDurationMs: 0,
      leaderChanges: 0,
      workerRegistrations: 0,
      workerTimeouts: 0,
      startTime: null,
      lastHeartbeatTime: null
    };

    // Storage helper (will be initialized in initialize())
    this.storage = null;
    this._pluginStorage = null;

    // Logger
    this.logger = database.getChildLogger(`GlobalCoordinator:${namespace}`);
  }

  // ==================== LIFECYCLE ====================

  /**
   * Start the global coordinator service
   * Initializes storage and begins heartbeat cycle in BACKGROUND
   */
  async start() {
    if (this.isRunning) {
      this._log('Service already running');
      return;
    }

    try {
      // Initialize storage
      this.storage = this._getStorage();

      // Create initial metadata entry
      await this._initializeMetadata();

      // Start heartbeat cycle
      this.isRunning = true;
      this.metrics.startTime = Date.now();

      this._log('Service started');

      // Start background loop (fire and forget)
      this._startLoop();

    } catch (err) {
      this.isRunning = false;
      this._logError('Failed to start service', err);
      throw err;
    }
  }

  /**
   * Start the background heartbeat loop
   * @private
   */
  async _startLoop() {
    try {
      // Begin heartbeat with startup jitter
      const jitterMs = Math.random() * this.config.heartbeatJitter;
      await this._sleep(jitterMs);

      // Run first heartbeat immediately if still running
      if (this.isRunning) {
        await this._heartbeatCycle();

        // Schedule periodic heartbeats
        this._scheduleHeartbeat();
      }
    } catch (err) {
      this._logError('Error in background loop start', err);
      // Retry loop start after delay if it failed completely
      if (this.isRunning) {
        setTimeout(() => this._startLoop(), 5000);
      }
    }
  }

  /**
   * Stop the global coordinator service
   * Cleans up timers and removes worker registration
   */
  async stop() {
    if (!this.isRunning) return;

    try {
      this.isRunning = false;
      this.isLeader = false;
      this.currentLeaderId = null;

      // Clear timers
      if (this.heartbeatTimer) {
        clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }

      if (this.electionTimer) {
        clearTimeout(this.electionTimer);
        this.electionTimer = null;
      }

      // Unregister worker
      await this._unregisterWorker();

      // Clear subscriptions
      this.subscribedPlugins.clear();

      this._log('Service stopped');

    } catch (err) {
      this._logError('Error stopping service', err);
    }
  }

  // ==================== PLUGIN SUBSCRIPTION ====================

  /**
   * Subscribe a plugin to global coordinator events
   * Also immediately register the plugin's worker if service is running
   * @param {string} pluginName - Name of plugin (e.g., 'queue', 'scheduler')
   * @param {Object} plugin - Plugin instance
   */
  async subscribePlugin(pluginName, plugin) {
    const subStart = Date.now();
    this.logger.debug({ namespace: this.namespace, pluginName }, `[SUBSCRIBE] START`);

    if (!pluginName || !plugin) {
      throw new Error('GlobalCoordinatorService: pluginName and plugin required');
    }

    this.subscribedPlugins.set(pluginName, plugin);
    this._log(`Plugin subscribed: ${pluginName}`);

    // If service is running, immediately register this plugin's worker
    // This prevents race conditions where first heartbeat completes before plugin subscribes
    if (this.isRunning && plugin.workerId && this.storage) {
      this.logger.debug({ namespace: this.namespace, pluginName, workerId: plugin.workerId?.substring(0, 30) }, `[SUBSCRIBE] registering worker entry`);
      const regStart = Date.now();
      await this._registerWorkerEntry(plugin.workerId, pluginName);
      this.logger.debug({ namespace: this.namespace, pluginName, ms: Date.now() - regStart }, `[SUBSCRIBE] worker entry registered`);

      // ✨ FIX: Trigger heartbeat in BACKGROUND (fire-and-forget) to avoid blocking
      // resource operations. The periodic heartbeat will handle election properly.
      // Previous: await this._heartbeatCycle() - blocked ALL S3 operations during boot!
      this.logger.debug({ namespace: this.namespace, pluginName }, `[SUBSCRIBE] triggering background heartbeat (fire-and-forget)`);
      this._heartbeatCycle().catch(err => {
        this._logError('Background heartbeat after plugin subscription failed', err);
      });
    }

    const totalMs = Date.now() - subStart;
    this.logger.debug({ namespace: this.namespace, pluginName, totalMs }, `[SUBSCRIBE] complete`);
  }

  /**
   * Unsubscribe a plugin from global coordinator
   * @param {string} pluginName - Name of plugin
   */
  unsubscribePlugin(pluginName) {
    this.subscribedPlugins.delete(pluginName);
    this._log(`Plugin unsubscribed: ${pluginName}`);
  }

  /**
   * Check if this worker is the current leader
   * @param {string} workerId - Worker ID to check
   * @returns {Promise<boolean>}
   */
  async isLeader(workerId) {
    if (!workerId) return false;
    // Return cached leader status (updated by heartbeat cycle)
    return this.currentLeaderId === workerId && this.isLeader;
  }

  /**
   * Get current leader ID
   * @returns {Promise<string|null>}
   */
  async getLeader() {
    if (!this.isRunning) return null;
    return this.currentLeaderId;
  }

  /**
   * Get current epoch
   * @returns {Promise<number>}
   */
  async getEpoch() {
    if (!this.isRunning) return 0;
    return this.currentEpoch;
  }

  /**
   * Get list of active workers
   * @returns {Promise<Array>}
   */
  async getActiveWorkers() {
    if (!this.storage) return [];

    // ✨ PERFORMANCE FIX: Use optimized listing that filters by S3 LastModified
    // This prevents reading thousands of stale worker files
    return await this.storage.listActiveWorkers(
      this._getWorkersPrefix(),
      this.config.workerTimeout
    );
  }

  /**
   * Get service metrics
   * @returns {Object}
   */
  getMetrics() {
    return { ...this.metrics };
  }

  // ==================== INTERNAL: HEARTBEAT & ELECTION ====================

  /**
   * Main heartbeat cycle
   * Called periodically to maintain leader lease and detect changes
   * @private
   */
  async _heartbeatCycle() {
    if (!this.isRunning || !this.storage) return;

    try {
      const startMs = Date.now();
      this.logger.debug({ namespace: this.namespace }, `[HEARTBEAT] START`);

      // Step 1: Register/refresh this worker's heartbeat
      const regStart = Date.now();
      await this._registerWorker();
      this.logger.debug({ namespace: this.namespace, ms: Date.now() - regStart }, `[HEARTBEAT] _registerWorker complete`);

      // Step 2: Get current state
      const stateStart = Date.now();
      const state = await this._getState();
      this.logger.debug({ namespace: this.namespace, ms: Date.now() - stateStart, hasState: !!state }, `[HEARTBEAT] _getState complete`);
      const previousLeaderId = this.currentLeaderId;
      const previousEpoch = this.currentEpoch;

      // Step 3: Check if leader lease expired or if plugin workers are now available
      const now = Date.now();
      let newLeaderId = state?.leaderId;
      let newEpoch = state?.epoch ?? this.currentEpoch ?? 0;
      let needsNewElection = !state || (state.leaseEnd && now >= state.leaseEnd);

      // If current leader is coordinator worker but plugin workers are now available, force new election
      if (!needsNewElection && state?.leaderId) {
        // Check if current leader is a coordinator (starts with 'gcs-')
        const isLeaderCoordinator = state.leaderId.startsWith('gcs-');
        
        if (isLeaderCoordinator) {
          // Only fetch active IDs if we might need to replace the coordinator
          const workerIds = await this.storage.listActiveWorkerIds(
            this._getWorkersPrefix(),
            this.config.workerTimeout
          );
          
          // Check if any plugin workers are available (not starting with 'gcs-')
          const hasPluginWorkers = workerIds.some(id => !id.startsWith('gcs-'));

          if (hasPluginWorkers) {
            this._log('Plugin workers available, forcing re-election');
            needsNewElection = true;
          }
        }
      }

      if (needsNewElection) {
        // Step 4: Conduct election
        this.logger.debug({ namespace: this.namespace }, `[HEARTBEAT] needs election, calling _conductElection`);
        const electionStart = Date.now();
        const electionResult = await this._conductElection(newEpoch);
        this.logger.debug({ namespace: this.namespace, ms: Date.now() - electionStart, leader: electionResult?.leaderId }, `[HEARTBEAT] _conductElection complete`);
        newLeaderId = electionResult?.leaderId || null;
        newEpoch = electionResult?.epoch ?? newEpoch + 1;
        this.metrics.electionCount++;
      }

      // Step 5: Update local state
      this.currentLeaderId = newLeaderId;
      this.currentEpoch = newEpoch || 1;
      this.isLeader = newLeaderId === this.workerId;
      this.metrics.heartbeatCount++;
      this.metrics.lastHeartbeatTime = Date.now();

      // Step 6: Notify plugins if leader changed
      if (previousLeaderId !== newLeaderId) {
        this.metrics.leaderChanges++;
        this.logger.debug({ namespace: this.namespace, from: previousLeaderId, to: newLeaderId }, `[HEARTBEAT] leader changed, notifying plugins`);
        this._notifyLeaderChange(previousLeaderId, newLeaderId);
      }

      const durationMs = Date.now() - startMs;
      this.metrics.electionDurationMs = durationMs;

      if (durationMs > 100) {
        this.logger.warn({ namespace: this.namespace, durationMs }, `[PERF] SLOW HEARTBEAT detected`);
      } else {
        this.logger.debug({ namespace: this.namespace, durationMs }, `[HEARTBEAT] complete`);
      }

    } catch (err) {
      this._logError('Heartbeat cycle failed', err);
    }
  }

  /**
   * Conduct leader election
   * @private
   * @returns {Promise<string|null>} Elected leader ID
   */
  async _conductElection(previousEpoch = 0) {
    try {
      this.logger.debug({ namespace: this.namespace }, `[ELECTION] START`);

      // Get active worker IDs (optimized: no body fetch)
      const listStart = Date.now();
      const workerIds = await this.storage.listActiveWorkerIds(
        this._getWorkersPrefix(),
        this.config.workerTimeout
      );
      this.logger.debug({ namespace: this.namespace, ms: Date.now() - listStart, count: workerIds?.length }, `[ELECTION] listActiveWorkerIds complete`);

      // Filter out the coordinator service's own worker (starts with 'gcs-')
      // Only elect plugin workers
      const pluginWorkerIds = workerIds.filter(id => !id.startsWith('gcs-'));
      this.logger.debug({ namespace: this.namespace, pluginWorkers: pluginWorkerIds?.length, allWorkers: workerIds?.length }, `[ELECTION] filtered workers`);

      // Use plugin workers if available, otherwise fall back to all workers
      const candidateIds = pluginWorkerIds.length > 0 ? pluginWorkerIds : workerIds;

      if (candidateIds.length === 0) {
        this.logger.debug({ namespace: this.namespace }, `[ELECTION] no workers available`);
        this._log('No workers available for election');
        return { leaderId: null, epoch: previousEpoch };
      }

      // Elect lexicographically first worker
      // candidateIds are already sorted by listActiveWorkerIds
      const elected = candidateIds[0];

      // Try to acquire leader lease
      const now = Date.now();
      const leaseEnd = now + this.config.leaseTimeout;

      const epoch = previousEpoch + 1;
      const newState = {
        leaderId: elected,
        leaderPod: this._getWorkerPod(elected),
        epoch,
        leaseStart: now,
        leaseEnd,
        electedBy: this.workerId,
        electedAt: now
      };

      this._log(`Attempting to elect leader: ${elected}`);

      const [ok, err] = await tryFn(() =>
        this.storage.set(
          this._getStateKey(),
          newState,
          {
            ttl: Math.ceil(this.config.leaseTimeout / 1000) + 60,
            behavior: 'body-only'
          }
        )
      );

      if (!ok) {
        this._logError('Failed to store new leader state', err);
        // Return { leaderId: null } instead of null to maintain consistency
        return { leaderId: null, epoch: previousEpoch };
      }

      this._log(`Leader elected: ${elected}`);
      return { leaderId: elected, epoch };

    } catch (err) {
      this._logError('Election failed', err);
      return { leaderId: null, epoch: previousEpoch };
    }
  }

  /**
   * Register/refresh this worker's heartbeat and all plugin workers
   * @private
   */
  async _registerWorker() {
    if (!this.storage) return;

    const regStart = Date.now();
    this.logger.debug({ namespace: this.namespace, subscribedCount: this.subscribedPlugins.size }, `[REGISTER_WORKER] START`);

    // Build list of all workers to register
    const registrations = [
      // Service's own worker
      this._registerWorkerEntry(this.workerId)
    ];

    // Add all subscribed plugin workers
    for (const [pluginName, plugin] of this.subscribedPlugins.entries()) {
      if (plugin && plugin.workerId) {
        registrations.push(this._registerWorkerEntry(plugin.workerId, pluginName));
      }
    }

    // Register all workers IN PARALLEL for performance
    await Promise.all(registrations);

    const totalMs = Date.now() - regStart;
    if (totalMs > 50) {
      this.logger.warn({ namespace: this.namespace, totalMs, count: registrations.length }, `[PERF] SLOW _registerWorker`);
    } else {
      this.logger.debug({ namespace: this.namespace, totalMs, count: registrations.length }, `[REGISTER_WORKER] complete`);
    }
  }

  /**
   * Register a single worker entry
   * @private
   */
  async _registerWorkerEntry(workerId, pluginName = null) {
    if (!workerId || !this.storage) return;

    const [ok, err] = await tryFn(() =>
      this.storage.set(
        this._getWorkerKey(workerId),
        {
          workerId,
          pluginName: pluginName || 'coordinator',
          pod: this._getWorkerPod(workerId),
          lastHeartbeat: Date.now(),
          startTime: this.metrics.startTime,
          namespace: this.namespace
        },
        {
          ttl: Math.ceil(this.config.workerTimeout / 1000),
          behavior: 'body-only'
        }
      )
    );

    if (!ok) {
      this._logError(`Failed to register worker heartbeat for ${workerId}`, err);
    } else {
      this.metrics.workerRegistrations++;
    }
  }

  /**
   * Unregister this worker and all plugin workers
   * @private
   */
  async _unregisterWorker() {
    if (!this.storage) return;

    // Build list of all workers to unregister
    const unregistrations = [
      // Service's own worker
      this._unregisterWorkerEntry(this.workerId)
    ];

    // Add all subscribed plugin workers
    for (const [pluginName, plugin] of this.subscribedPlugins.entries()) {
      if (plugin && plugin.workerId) {
        unregistrations.push(this._unregisterWorkerEntry(plugin.workerId));
      }
    }

    // Unregister all workers IN PARALLEL for performance
    await Promise.all(unregistrations);
  }

  /**
   * Unregister a single worker entry
   * @private
   */
  async _unregisterWorkerEntry(workerId) {
    if (!workerId || !this.storage) return;

    const [ok, err] = await tryFn(() =>
      this.storage.delete(this._getWorkerKey(workerId))
    );

    if (!ok) {
      this._logError(`Failed to unregister worker ${workerId}`, err);
    }
  }

  /**
   * Get current state from storage
   * @private
   * @returns {Promise<Object|null>}
   */
  async _getState() {
    if (!this.storage) return null;

    const [ok, err, data] = await tryFn(() =>
      this.storage.get(this._getStateKey())
    );

    if (!ok) {
      // State doesn't exist yet (first election)
      return null;
    }

    return data;
  }

  /**
   * Initialize metadata entry
   * @private
   */
  async _initializeMetadata() {
    if (!this.storage) return;

    const [ok, err] = await tryFn(() =>
      this.storage.set(
        this._getMetadataKey(),
        {
          namespace: this.namespace,
          serviceId: this.serviceId,
          createdAt: Date.now(),
          createdBy: this.workerId,
          plugins: Array.from(this.subscribedPlugins.keys())
        },
        {
          ttl: 3600,  // 1 hour
          behavior: 'body-only'
        }
      )
    );

    if (!ok) {
      this._logError('Failed to initialize metadata', err);
    }
  }

  // ==================== INTERNAL: NOTIFICATIONS ====================

  /**
   * Notify all subscribed plugins of leader change
   * @private
   */
  _notifyLeaderChange(previousLeaderId, newLeaderId) {
    const event = {
      namespace: this.namespace,
      previousLeader: previousLeaderId,
      newLeader: newLeaderId,
      epoch: this.currentEpoch,
      timestamp: Date.now()
    };

    this._log(
      `Leader changed: ${previousLeaderId || 'none'} → ${newLeaderId}`,
      `(epoch: ${this.currentEpoch})`
    );

    // Emit event for external listeners
    this.emit('leader:changed', event);

    // Notify subscribed plugins
    for (const [pluginName, plugin] of this.subscribedPlugins) {
      this._notifyPlugin(pluginName, plugin, 'leader:changed', event);
    }
  }

  /**
   * Notify a single plugin of event
   * @private
   */
  _notifyPlugin(pluginName, plugin, eventType, data) {
    try {
      if (eventType === 'leader:changed') {
        const isLeader = data.newLeader === this.workerId;
        if (plugin.onGlobalLeaderChange) {
          plugin.onGlobalLeaderChange(isLeader, data);
        }
      }
    } catch (err) {
      this._logError(`Plugin notification failed (${pluginName}):`, err);
    }
  }

  // ==================== INTERNAL: TIMERS & SCHEDULING ====================

  /**
   * Schedule next heartbeat cycle
   * @private
   */
  _scheduleHeartbeat() {
    if (!this.isRunning) return;

    // Clear existing timer
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
    }

    // Schedule next heartbeat with jitter
    const jitterMs = Math.random() * this.config.heartbeatJitter;
    const delayMs = this.config.heartbeatInterval + jitterMs;

    this.heartbeatTimer = setTimeout(async () => {
      await this._heartbeatCycle();
      this._scheduleHeartbeat();
    }, delayMs);
  }

  // ==================== INTERNAL: STORAGE HELPERS ====================

  /**
   * Get storage instance from database
   * @private
   */
  _getStorage() {
    if (!this.database || !this.database.client) {
      throw new Error('GlobalCoordinatorService: database client not available');
    }
    if (!this._pluginStorage) {
      this._pluginStorage = new CoordinatorPluginStorage(this.database.client, 'coordinator');
    }
    return this._pluginStorage;
  }

  /**
   * Get state key for storage
   * Uses plugin= convention: plugin=coordinator/<namespace>/state.json
   * @private
   */
  _getStateKey() {
    return this.storage.getPluginKey(null, this.namespace, 'state.json');
  }

  /**
   * Get workers prefix for listing
   * Uses plugin= convention: plugin=coordinator/<namespace>/workers/
   * @private
   */
  _getWorkersPrefix() {
    return this.storage.getPluginKey(null, this.namespace, 'workers') + '/';
  }

  /**
   * Get worker key for storage
   * @private
   */
  _getWorkerKey(workerId) {
    return this.storage.getPluginKey(null, this.namespace, 'workers', `${workerId}.json`);
  }

  /**
   * Get metadata key for storage
   * @private
   */
  _getMetadataKey() {
    return this.storage.getPluginKey(null, this.namespace, 'metadata.json');
  }

  // ==================== INTERNAL: UTILITIES ====================

  /**
   * Extract pod/instance name from worker ID
   * @private
   */
  _getWorkerPod(workerId) {
    // Worker ID format: gcs-namespace-timestamp-random or worker-timestamp-counter-random
    // Extract the hostname/pod from environment or use first part
    if (typeof process !== 'undefined' && process.env) {
      return process.env.HOSTNAME || process.env.NODE_NAME || 'unknown';
    }
    return 'unknown';
  }

  /**
   * Normalize configuration with defaults
   * @private
   */
  _normalizeConfig(config) {
    return {
      heartbeatInterval: Math.max(1000, config.heartbeatInterval || 5000),
      heartbeatJitter: Math.max(0, config.heartbeatJitter || 1000),
      leaseTimeout: Math.max(5000, config.leaseTimeout || 15000),
      workerTimeout: Math.max(5000, config.workerTimeout || 20000),
      diagnosticsEnabled: Boolean(config.diagnosticsEnabled ?? false)
    };
  }

  /**
   * Sleep for specified milliseconds
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log message (if diagnostics enabled)
   * @private
   */
  _log(...args) {
    if (this.config.diagnosticsEnabled) {
      this.logger.debug(...args);
    }
  }

  /**
   * Log error message
   * @private
   */
  _logError(msg, err) {
    if (this.config.diagnosticsEnabled) {
      this.logger.error(`${msg}:`, err?.message || err);
    }
  }
}

class CoordinatorPluginStorage extends PluginStorage {
  constructor(client, pluginSlug = 'coordinator') {
    super(client, pluginSlug);
  }

  async list(prefix = '', options = {}) {
    const { limit } = options;
    const fullPrefix = prefix || '';

    const [ok, err, result] = await tryFn(() =>
      this.client.listObjects({ prefix: fullPrefix, maxKeys: limit })
    );

    if (!ok) {
      throw err;
    }

    const keys = result.Contents?.map(item => item.Key) || [];
    return this._removeKeyPrefix(keys);
  }

  async listWithPrefix(prefix = '', options = {}) {
    const keys = await this.list(prefix, options);
    if (!keys || keys.length === 0) {
      return [];
    }

    const results = await this.batchGet(keys);
    return results
      .filter(item => item.ok && item.data != null)
      .map(item => item.data);
  }

  /**
   * Internal helper to get active keys and clean up stale ones
   * @private
   * @returns {Promise<string[]>} List of active full keys
   */
  async _getActiveKeys(prefix, timeoutMs) {
    const fullPrefix = prefix || '';
    
    const [ok, err, result] = await tryFn(() =>
      this.client.listObjects({ prefix: fullPrefix })
    );

    if (!ok || !result.Contents) {
      return [];
    }

    const now = Date.now();
    const activeKeys = [];
    const staleKeys = [];

    for (const obj of result.Contents) {
      const lastModified = obj.LastModified ? new Date(obj.LastModified).getTime() : 0;
      const age = now - lastModified;

      // Check if worker is active based on S3 timestamp
      // Adding 5s buffer to account for clock skew
      if (age < (timeoutMs + 5000)) {
        activeKeys.push(obj.Key);
      } else {
        staleKeys.push(obj.Key);
      }
    }

    // Clean up stale workers asynchronously (fire and forget)
    if (staleKeys.length > 0) {
      this._deleteStaleWorkers(staleKeys).catch(() => {});
    }

    return activeKeys;
  }

  /**
   * List active workers using S3 LastModified optimization
   * Prevents reading bodies of stale files
   */
  async listActiveWorkers(prefix, timeoutMs) {
    const activeKeys = await this._getActiveKeys(prefix, timeoutMs);
    
    // Fetch only active workers
    const keysToFetch = this._removeKeyPrefix(activeKeys);
    if (keysToFetch.length === 0) return [];

    const results = await this.batchGet(keysToFetch);
    
    return results
      .filter(item => item.ok && item.data != null)
      .map(item => item.data)
      .sort((a, b) => (a.workerId || '').localeCompare(b.workerId || ''));
  }

  /**
   * List active worker IDs without fetching bodies
   * Uses key analysis (filename) to extract IDs
   */
  async listActiveWorkerIds(prefix, timeoutMs) {
    const activeKeys = await this._getActiveKeys(prefix, timeoutMs);
    
    const keysToProcess = this._removeKeyPrefix(activeKeys);
    if (keysToProcess.length === 0) return [];

    // Extract workerId from key: .../workers/<workerId>.json
    return keysToProcess
      .map(key => {
        const parts = key.split('/');
        const filename = parts[parts.length - 1];
        return filename.replace('.json', '');
      })
      .filter(id => id)
      .sort((a, b) => a.localeCompare(b));
  }

  async _deleteStaleWorkers(keys) {
    // Strip prefix to match what deleteObjects expects (relative to bucket root or client prefix?)
    // S3Client.deleteObjects expects keys relative to client prefix (or absolute if prefix empty)
    // keys from listObjects are FULL keys (including prefix)
    // S3Client.deleteObjects adds prefix again! 
    // Wait, S3Client.listObjects returns keys WITH prefix.
    // S3Client.deleteObjects takes keys and ADDS prefix.
    // So we must strip prefix.
    const cleanKeys = this._removeKeyPrefix(keys);
    if (cleanKeys.length > 0) {
      await this.client.deleteObjects(cleanKeys);
    }
  }
}

export default GlobalCoordinatorService;
