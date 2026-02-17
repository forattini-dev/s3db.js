import { EventEmitter } from 'events';
import { PluginStorage } from '../../concerns/plugin-storage.js';
import { tryFn } from '../../concerns/try-fn.js';
import { LatencyBuffer, type LatencyStats } from '../../concerns/ring-buffer.js';
import type { Database } from '../../database.class.js';
import type { S3DBLogger } from '../../concerns/logger.js';
import type { S3Client } from '../../clients/s3-client.class.js';

let serviceCounter = 0;

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  resetTimeout?: number;
  halfOpenMaxAttempts?: number;
}

export interface ContentionConfig {
  enabled?: boolean;
  threshold?: number;
  rateLimitMs?: number;
}

export interface GlobalCoordinatorConfig {
  heartbeatInterval?: number;
  heartbeatJitter?: number;
  leaseTimeout?: number;
  workerTimeout?: number;
  diagnosticsEnabled?: boolean | string;
  circuitBreaker?: CircuitBreakerConfig;
  contention?: ContentionConfig;
  metricsBufferSize?: number;
  stateCacheTtl?: number;
}

export interface GlobalCoordinatorOptions {
  namespace: string;
  database: Database;
  config?: GlobalCoordinatorConfig;
}

export interface CoordinatorMetrics {
  heartbeatCount: number;
  electionCount: number;
  electionDurationMs: number;
  leaderChanges: number;
  workerRegistrations: number;
  workerTimeouts: number;
  startTime: number | null;
  lastHeartbeatTime: number | null;
  circuitBreakerTrips: number;
  circuitBreakerState: CircuitBreakerState;
  contentionEvents: number;
  epochDriftEvents: number;
}

export interface EnhancedCoordinatorMetrics extends CoordinatorMetrics {
  latency: LatencyStats;
  metricsWindowSize: number;
}

export interface ContentionEvent {
  namespace: string;
  duration: number;
  expected: number;
  ratio: number;
  threshold: number;
  timestamp: number;
}

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerInternalState {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  openedAt: number | null;
  failureThreshold: number;
  resetTimeout: number;
  halfOpenMaxAttempts: number;
}

export interface LeaderState {
  leaderId: string | null;
  leaderPod?: string;
  epoch: number;
  leaseStart?: number;
  leaseEnd?: number;
  electedBy?: string;
  electedAt?: number;
}

function isLeaderState(value: unknown): value is LeaderState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const hasLeaderId = candidate.leaderId === null || typeof candidate.leaderId === 'string';
  const hasEpoch = typeof candidate.epoch === 'number';

  return hasLeaderId && hasEpoch;
}

export interface WorkerData {
  workerId: string;
  pluginName: string;
  pod: string;
  lastHeartbeat: number;
  startTime: number | null;
  namespace: string;
}

export interface LeaderChangeEvent {
  namespace: string;
  previousLeader: string | null;
  newLeader: string | null;
  epoch: number;
  timestamp: number;
}

export interface CircuitBreakerEvent {
  namespace: string;
  failureCount: number;
}

export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failureCount: number;
  failureThreshold: number;
  resetTimeout: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  openedAt: number | null;
  trips: number;
}

export interface SubscribablePlugin {
  workerId?: string;
  onGlobalLeaderChange?(isLeader: boolean, data: LeaderChangeEvent): void;
}

export interface ContentionState {
  lastEventTime: number;
  rateLimitMs: number;
}

export interface NormalizedConfig {
  heartbeatInterval: number;
  heartbeatJitter: number;
  leaseTimeout: number;
  workerTimeout: number;
  diagnosticsEnabled: boolean;
  contentionEnabled: boolean;
  contentionThreshold: number;
  contentionRateLimitMs: number;
  metricsBufferSize: number;
  stateCacheTtl: number;
}

export interface ElectionResult {
  leaderId: string | null;
  epoch: number;
}

export class GlobalCoordinatorService extends EventEmitter {
  namespace: string;
  database: Database;
  serviceId: string;
  workerId: string;

  isRunning: boolean;
  isLeader: boolean;
  currentLeaderId: string | null;
  currentEpoch: number;

  config: NormalizedConfig;

  heartbeatTimer: ReturnType<typeof setTimeout> | null;
  electionTimer: ReturnType<typeof setTimeout> | null;

  subscribedPlugins: Map<string, SubscribablePlugin>;

  metrics: CoordinatorMetrics;

  protected _circuitBreaker: CircuitBreakerInternalState;
  protected _contentionState: ContentionState;
  protected _latencyBuffer: LatencyBuffer;
  protected _heartbeatStartedAt: number;
  protected _heartbeatMutexTimeoutMs: number;

  protected _cachedState: LeaderState | null;
  protected _stateCacheTime: number;
  protected _stateCacheTtl: number;

  storage: CoordinatorPluginStorage | null;
  protected _pluginStorage: CoordinatorPluginStorage | null;

  logger: S3DBLogger;

  constructor({ namespace, database, config = {} }: GlobalCoordinatorOptions) {
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

    this.workerId = this._generateWorkerId();

    this.isRunning = false;
    this.isLeader = false;
    this.currentLeaderId = null;
    this.currentEpoch = 0;

    this.config = this._normalizeConfig(config);

    this.heartbeatTimer = null;
    this.electionTimer = null;

    this.subscribedPlugins = new Map();

    this.metrics = {
      heartbeatCount: 0,
      electionCount: 0,
      electionDurationMs: 0,
      leaderChanges: 0,
      workerRegistrations: 0,
      workerTimeouts: 0,
      startTime: null,
      lastHeartbeatTime: null,
      circuitBreakerTrips: 0,
      circuitBreakerState: 'closed',
      contentionEvents: 0,
      epochDriftEvents: 0
    };

    this._contentionState = {
      lastEventTime: 0,
      rateLimitMs: this.config.contentionRateLimitMs
    };

    this._latencyBuffer = new LatencyBuffer(this.config.metricsBufferSize);

    this._circuitBreaker = {
      state: 'closed',
      failureCount: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      openedAt: null,
      failureThreshold: config.circuitBreaker?.failureThreshold ?? 5,
      resetTimeout: config.circuitBreaker?.resetTimeout ?? 30000,
      halfOpenMaxAttempts: config.circuitBreaker?.halfOpenMaxAttempts ?? 1
    };

    this.storage = null;
    this._pluginStorage = null;
    this._heartbeatStartedAt = 0;
    this._heartbeatMutexTimeoutMs = (this.config.heartbeatInterval + this.config.heartbeatJitter) * 2;

    this._cachedState = null;
    this._stateCacheTime = 0;
    this._stateCacheTtl = this.config.stateCacheTtl;

    this.logger = database.getChildLogger(`GlobalCoordinator:${namespace}`);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this._log('Service already running');
      return;
    }

    try {
      this.storage = this._getStorage();

      await this._initializeMetadata();

      this.isRunning = true;
      this.metrics.startTime = Date.now();

      this._log('Service started');

      this._startLoop();

    } catch (err) {
      this.isRunning = false;
      this._logError('Failed to start service', err as Error);
      throw err;
    }
  }

  protected async _startLoop(): Promise<void> {
    try {
      const jitterMs = Math.random() * this.config.heartbeatJitter;
      await this._sleep(jitterMs);

      if (this.isRunning) {
        await this._heartbeatCycle();

        this._scheduleHeartbeat();
      }
    } catch (err) {
      this._logError('Error in background loop start', err as Error);
      if (this.isRunning) {
        setTimeout(() => this._startLoop(), 5000);
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      this.isRunning = false;
      this.isLeader = false;
      this.currentLeaderId = null;

      if (this.heartbeatTimer) {
        clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }

      if (this.electionTimer) {
        clearTimeout(this.electionTimer);
        this.electionTimer = null;
      }

      await this._unregisterWorker();

      this.subscribedPlugins.clear();

      this._log('Service stopped');

    } catch (err) {
      this._logError('Error stopping service', err as Error);
    }
  }

  async subscribePlugin(pluginName: string, plugin: SubscribablePlugin): Promise<void> {
    const subStart = Date.now();
    this.logger.debug({ namespace: this.namespace, pluginName }, `[SUBSCRIBE] START`);

    if (!pluginName || !plugin) {
      throw new Error('GlobalCoordinatorService: pluginName and plugin required');
    }

    this.subscribedPlugins.set(pluginName, plugin);
    this._log(`Plugin subscribed: ${pluginName}`);

    if (this.isRunning && this.storage) {
      this.logger.debug({ namespace: this.namespace, pluginName }, `[SUBSCRIBE] triggering background heartbeat`);
      this._heartbeatCycle().catch(err => {
        this._logError('Background heartbeat after plugin subscription failed', err as Error);
      });
    }

    const totalMs = Date.now() - subStart;
    this.logger.debug({ namespace: this.namespace, pluginName, totalMs }, `[SUBSCRIBE] complete`);
  }

  unsubscribePlugin(pluginName: string): void {
    this.subscribedPlugins.delete(pluginName);
    this._log(`Plugin unsubscribed: ${pluginName}`);
  }

  async isLeaderCheck(workerId: string): Promise<boolean> {
    if (!workerId) return false;
    return this.currentLeaderId === workerId && this.isLeader;
  }

  async getLeader(): Promise<string | null> {
    if (!this.isRunning) return null;
    return this.currentLeaderId;
  }

  async getEpoch(): Promise<number> {
    if (!this.isRunning) return 0;
    return this.currentEpoch;
  }

  async getActiveWorkers(): Promise<WorkerData[]> {
    if (!this.storage) return [];

    return await this.storage.listActiveWorkers(
      this._getWorkersPrefix(),
      this.config.workerTimeout
    );
  }

  getMetrics(): EnhancedCoordinatorMetrics {
    return {
      ...this.metrics,
      latency: this._latencyBuffer.getStats(),
      metricsWindowSize: this._latencyBuffer.count
    };
  }

  incrementEpochDriftEvents(): void {
    this.metrics.epochDriftEvents++;
  }

  protected async _heartbeatCycle(): Promise<void> {
    if (!this.isRunning || !this.storage) return;

    const now = Date.now();
    const mutexExpired = this._heartbeatStartedAt > 0 &&
      (now - this._heartbeatStartedAt) > this._heartbeatMutexTimeoutMs;

    if (this._heartbeatStartedAt > 0 && !mutexExpired) {
      this.logger.debug({ namespace: this.namespace, elapsedMs: now - this._heartbeatStartedAt }, `[HEARTBEAT] SKIPPED - already in progress`);
      return;
    }

    if (mutexExpired) {
      this.logger.warn({ namespace: this.namespace, elapsedMs: now - this._heartbeatStartedAt }, `[HEARTBEAT] Previous heartbeat timed out, forcing mutex release`);
    }

    if (!this._circuitBreakerAllows()) {
      this.logger.debug({ namespace: this.namespace }, `[HEARTBEAT] SKIPPED - circuit breaker open`);
      return;
    }

    this._heartbeatStartedAt = now;
    try {
      const startMs = Date.now();
      this.logger.debug({ namespace: this.namespace }, `[HEARTBEAT] START`);

      const regStart = Date.now();
      await this._registerWorker();
      this.logger.debug({ namespace: this.namespace, ms: Date.now() - regStart }, `[HEARTBEAT] _registerWorker complete`);

      const stateStart = Date.now();
      const state = await this._getState();
      this.logger.debug({ namespace: this.namespace, ms: Date.now() - stateStart, hasState: !!state }, `[HEARTBEAT] _getState complete`);
      const previousLeaderId = this.currentLeaderId;

      const now = Date.now();
      let newLeaderId = state?.leaderId ?? null;
      let newEpoch = state?.epoch ?? this.currentEpoch ?? 0;
      let needsNewElection = !state || (state.leaseEnd && now >= state.leaseEnd);

      if (!needsNewElection && state?.leaderId) {
        const isLeaderCoordinator = state.leaderId.startsWith('gcs-');

        if (isLeaderCoordinator) {
          const workerIds = await this.storage.listActiveWorkerIds(
            this._getWorkersPrefix(),
            this.config.workerTimeout
          );

          const hasPluginWorkers = workerIds.some(id => !id.startsWith('gcs-'));

          if (hasPluginWorkers) {
            this._log('Plugin workers available, forcing re-election');
            needsNewElection = true;
          }
        }
      }

      if (needsNewElection) {
        this.logger.debug({ namespace: this.namespace }, `[HEARTBEAT] needs election, calling _conductElection`);
        const electionStart = Date.now();
        const electionResult = await this._conductElection(newEpoch);
        this.logger.debug({ namespace: this.namespace, ms: Date.now() - electionStart, leader: electionResult?.leaderId }, `[HEARTBEAT] _conductElection complete`);
        newLeaderId = electionResult?.leaderId || null;
        newEpoch = electionResult?.epoch ?? newEpoch + 1;
        this.metrics.electionCount++;
      }

      this.currentLeaderId = newLeaderId;
      this.currentEpoch = newEpoch || 1;
      this.isLeader = newLeaderId === this.workerId;
      this.metrics.heartbeatCount++;
      this.metrics.lastHeartbeatTime = Date.now();

      if (previousLeaderId !== newLeaderId) {
        this.metrics.leaderChanges++;
        this.logger.debug({ namespace: this.namespace, from: previousLeaderId, to: newLeaderId }, `[HEARTBEAT] leader changed, notifying plugins`);
        this._notifyLeaderChange(previousLeaderId, newLeaderId);
      }

      const durationMs = Date.now() - startMs;
      this.metrics.electionDurationMs = durationMs;

      this._latencyBuffer.push(durationMs);

      this._circuitBreakerSuccess();

      this._checkContention(durationMs);

      if (durationMs > 100) {
        this.logger.warn({ namespace: this.namespace, durationMs }, `[PERF] SLOW HEARTBEAT detected`);
      } else {
        this.logger.debug({ namespace: this.namespace, durationMs }, `[HEARTBEAT] complete`);
      }

    } catch (err) {
      this._circuitBreakerFailure();
      this._logError('Heartbeat cycle failed', err as Error);
    } finally {
      this._heartbeatStartedAt = 0;
    }
  }

  protected _checkContention(durationMs: number): void {
    if (!this.config.contentionEnabled) return;

    const ratio = durationMs / this.config.heartbeatInterval;

    if (ratio > this.config.contentionThreshold) {
      this.metrics.contentionEvents++;

      const now = Date.now();
      if (now - this._contentionState.lastEventTime > this._contentionState.rateLimitMs) {
        this._contentionState.lastEventTime = now;

        const event: ContentionEvent = {
          namespace: this.namespace,
          duration: durationMs,
          expected: this.config.heartbeatInterval,
          ratio,
          threshold: this.config.contentionThreshold,
          timestamp: now
        };

        this.emit('contention:detected', event);

        this.logger.warn({
          namespace: this.namespace,
          durationMs,
          expectedMs: this.config.heartbeatInterval,
          ratio: ratio.toFixed(2),
          threshold: this.config.contentionThreshold
        }, `Contention detected: heartbeat took ${ratio.toFixed(1)}x longer than expected`);
      }
    }
  }

  protected async _conductElection(previousEpoch: number = 0): Promise<ElectionResult> {
    try {
      this.logger.debug({ namespace: this.namespace }, `[ELECTION] START`);

      const listStart = Date.now();
      const workerIds = await this.storage!.listActiveWorkerIds(
        this._getWorkersPrefix(),
        this.config.workerTimeout
      );
      this.logger.debug({ namespace: this.namespace, ms: Date.now() - listStart, count: workerIds?.length }, `[ELECTION] listActiveWorkerIds complete`);

      const pluginWorkerIds = workerIds.filter(id => !id.startsWith('gcs-'));
      this.logger.debug({ namespace: this.namespace, pluginWorkers: pluginWorkerIds?.length, allWorkers: workerIds?.length }, `[ELECTION] filtered workers`);

      const candidateIds = pluginWorkerIds.length > 0 ? pluginWorkerIds : workerIds;

      if (candidateIds.length === 0) {
        this.logger.debug({ namespace: this.namespace }, `[ELECTION] no workers available`);
        this._log('No workers available for election');
        return { leaderId: null, epoch: previousEpoch };
      }

      const elected = candidateIds[0] ?? null;
      const stateKey = this._getStateKey();
      const maxAttempts = 8;
      const stateCache = { state: null as LeaderState | null, version: null as string | null };

      const attemptState = async (): Promise<ElectionResult> => {
        const now = Date.now();
        const leaseEnd = now + this.config.leaseTimeout;
        const nextEpoch = Math.max((stateCache.state?.epoch ?? previousEpoch) + 1, previousEpoch + 1);

        const candidateState: LeaderState = {
          leaderId: elected,
          leaderPod: elected ? this._getWorkerPod(elected) : undefined,
          epoch: nextEpoch,
          leaseStart: now,
          leaseEnd,
          electedBy: this.workerId,
          electedAt: now
        };

        const [readOk, readErr, readState] = await tryFn(() =>
          this.storage!.getWithVersion(stateKey)
        );

        if (!readOk) {
          throw new Error(`Failed to read current state for election: ${(readErr as Error)?.message || String(readErr)}`);
        }

        stateCache.state = isLeaderState(readState.data) ? readState.data : null;
        stateCache.version = readState.version;

        if (!stateCache.state || !stateCache.version) {
          this.logger.debug({ namespace: this.namespace }, `[ELECTION] no state yet, attempting create`);

          const [setOk, setErr] = await tryFn(() =>
            this.storage!.setIfNotExists(
              stateKey,
              candidateState as unknown as Record<string, unknown>,
              {
                ttl: Math.ceil(this.config.leaseTimeout / 1000) + 60,
                behavior: 'body-only'
              }
            )
          );

          if (!setOk) {
            if (setErr) {
              this.logger.debug({
                namespace: this.namespace,
                error: (setErr as Error).message
              }, '[ELECTION] create attempt lost due concurrent write');
            }
            return { leaderId: null, epoch: previousEpoch };
          }

          this._invalidateStateCache();
          this._log(`Leader elected (bootstrapped): ${elected}`);
          return { leaderId: elected, epoch: nextEpoch };
        }

        if (
          stateCache.state.leaderId === elected &&
          stateCache.state.leaseEnd &&
          stateCache.state.leaseEnd > now
        ) {
          this.logger.debug({ namespace: this.namespace }, `[ELECTION] leader already active and unchanged`);
          return {
            leaderId: stateCache.state.leaderId,
            epoch: stateCache.state.epoch
          };
        }

        const [casOk, casErr] = await tryFn(() =>
          this.storage!.setIfVersion(
            stateKey,
            candidateState as unknown as Record<string, unknown>,
            stateCache.version!,
            {
              ttl: Math.ceil(this.config.leaseTimeout / 1000) + 60,
              behavior: 'body-only'
            }
          )
        );

        if (casOk) {
          this._invalidateStateCache();
          this._log(`Leader elected: ${elected}`);
          return { leaderId: elected, epoch: nextEpoch };
        }

        if (casErr) {
          this.logger.debug({
            namespace: this.namespace,
            error: (casErr as Error).message
          }, '[ELECTION] CAS attempt failed, retrying');
        }

        return { leaderId: null, epoch: previousEpoch };
      };

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const electionResult = await attemptState();
        if (electionResult.leaderId) {
          return electionResult;
        }

        const retryDelay = 20 + attempt * 10 + Math.floor(Math.random() * 15);
        this.logger.debug({ namespace: this.namespace, attempt: attempt + 1, delayMs: retryDelay }, `[ELECTION] retry`);
        await this._sleep(retryDelay);
      }

      const [finalOk, finalErr, finalStateResult] = await tryFn(() =>
        this.storage!.getWithVersion(stateKey)
      );
      if (!finalOk || !finalStateResult?.data) {
        if (finalErr) {
          this._logError('Election failed after retries', finalErr as Error);
        } else {
          this._logError('Election failed after retries', new Error('no-state'));
        }
        return { leaderId: null, epoch: previousEpoch };
      }

      const finalState = isLeaderState(finalStateResult.data) ? finalStateResult.data : null;

      return {
        leaderId: finalState?.leaderId ?? null,
        epoch: finalState?.epoch ?? previousEpoch
      };

    } catch (err) {
      this._logError('Election failed', err as Error);
      return { leaderId: null, epoch: previousEpoch };
    }
  }

  protected async _registerWorker(): Promise<void> {
    if (!this.storage) return;

    const regStart = Date.now();
    this.logger.debug({ namespace: this.namespace, subscribedCount: this.subscribedPlugins.size }, `[REGISTER_WORKER] START`);

    const registeredIds = new Set<string>();
    const registrations: Promise<void>[] = [];
    let deduped = 0;

    registrations.push(this._registerWorkerEntry(this.workerId));
    registeredIds.add(this.workerId);

    for (const [pluginName, plugin] of this.subscribedPlugins.entries()) {
      if (plugin && plugin.workerId) {
        if (registeredIds.has(plugin.workerId)) {
          this.logger.debug({ namespace: this.namespace, pluginName, workerId: plugin.workerId.substring(0, 30) }, `[REGISTER_WORKER] deduped workerId`);
          deduped++;
          continue;
        }
        registrations.push(this._registerWorkerEntry(plugin.workerId, pluginName));
        registeredIds.add(plugin.workerId);
      }
    }

    await Promise.all(registrations);

    const totalMs = Date.now() - regStart;
    if (totalMs > 50) {
      this.logger.warn({ namespace: this.namespace, totalMs, uniqueWorkers: registrations.length, deduped }, `[PERF] SLOW _registerWorker`);
    } else {
      this.logger.debug({ namespace: this.namespace, totalMs, uniqueWorkers: registrations.length, deduped }, `[REGISTER_WORKER] complete`);
    }
  }

  protected async _registerWorkerEntry(workerId: string, pluginName: string | null = null): Promise<void> {
    if (!workerId || !this.storage) return;

    const [ok, err] = await tryFn(() =>
      this.storage!.set(
        this._getWorkerKey(workerId),
        {
          workerId,
          pluginName: pluginName || 'coordinator',
          pod: this._getWorkerPod(workerId),
          lastHeartbeat: Date.now(),
          startTime: this.metrics.startTime,
          namespace: this.namespace
        } as Record<string, unknown>,
        {
          ttl: Math.ceil(this.config.workerTimeout / 1000),
          behavior: 'body-only'
        }
      )
    );

    if (!ok) {
      this._logError(`Failed to register worker heartbeat for ${workerId}`, err as Error);
    } else {
      this.metrics.workerRegistrations++;
    }
  }

  protected async _unregisterWorker(): Promise<void> {
    if (!this.storage) return;

    const unregistrations: Promise<void>[] = [
      this._unregisterWorkerEntry(this.workerId)
    ];

    for (const [, plugin] of this.subscribedPlugins.entries()) {
      if (plugin && plugin.workerId) {
        unregistrations.push(this._unregisterWorkerEntry(plugin.workerId));
      }
    }

    await Promise.all(unregistrations);
  }

  protected async _unregisterWorkerEntry(workerId: string): Promise<void> {
    if (!workerId || !this.storage) return;

    const [ok, err] = await tryFn(() =>
      this.storage!.delete(this._getWorkerKey(workerId))
    );

    if (!ok) {
      this._logError(`Failed to unregister worker ${workerId}`, err as Error);
    }
  }

  protected async _getState(): Promise<LeaderState | null> {
    if (!this.storage) return null;

    const now = Date.now();
    if (this._stateCacheTtl > 0 && this._cachedState && (now - this._stateCacheTime) < this._stateCacheTtl) {
      this.logger.debug({ namespace: this.namespace, cacheAge: now - this._stateCacheTime }, `[STATE_CACHE] HIT`);
      return this._cachedState;
    }

    const [ok, , data] = await tryFn(() =>
      this.storage!.get(this._getStateKey())
    );

    if (!ok) {
      return null;
    }

    if (this._stateCacheTtl > 0) {
      this._cachedState = data as LeaderState | null;
      this._stateCacheTime = now;
      this.logger.debug({ namespace: this.namespace }, `[STATE_CACHE] MISS - cached`);
    }

    return data as LeaderState | null;
  }

  protected _invalidateStateCache(): void {
    this._cachedState = null;
    this._stateCacheTime = 0;
  }

  protected async _initializeMetadata(): Promise<void> {
    if (!this.storage) return;

    const [ok, err] = await tryFn(() =>
      this.storage!.set(
        this._getMetadataKey(),
        {
          namespace: this.namespace,
          serviceId: this.serviceId,
          createdAt: Date.now(),
          createdBy: this.workerId,
          plugins: Array.from(this.subscribedPlugins.keys())
        },
        {
          ttl: 3600,
          behavior: 'body-only'
        }
      )
    );

    if (!ok) {
      this._logError('Failed to initialize metadata', err as Error);
    }
  }

  protected _notifyLeaderChange(previousLeaderId: string | null, newLeaderId: string | null): void {
    const event: LeaderChangeEvent = {
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

    this.emit('leader:changed', event);

    for (const [pluginName, plugin] of this.subscribedPlugins) {
      this._notifyPlugin(pluginName, plugin, 'leader:changed', event);
    }
  }

  protected _notifyPlugin(
    pluginName: string,
    plugin: SubscribablePlugin,
    eventType: string,
    data: LeaderChangeEvent
  ): void {
    try {
      if (eventType === 'leader:changed') {
        const isLeader = data.newLeader === this.workerId;
        if (plugin.onGlobalLeaderChange) {
          plugin.onGlobalLeaderChange(isLeader, data);
        }
      }
    } catch (err) {
      this._logError(`Plugin notification failed (${pluginName}):`, err as Error);
    }
  }

  protected _scheduleHeartbeat(): void {
    if (!this.isRunning) return;

    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
    }

    const jitterMs = Math.random() * this.config.heartbeatJitter;
    const delayMs = this.config.heartbeatInterval + jitterMs;

    this.heartbeatTimer = setTimeout(async () => {
      await this._heartbeatCycle();
      this._scheduleHeartbeat();
    }, delayMs);
  }

  protected _getStorage(): CoordinatorPluginStorage {
    if (!this.database || !this.database.client) {
      throw new Error('GlobalCoordinatorService: database client not available');
    }
    if (!this._pluginStorage) {
      this._pluginStorage = new CoordinatorPluginStorage(this.database.client as any, 'coordinator');
    }
    return this._pluginStorage;
  }

  protected _getStateKey(): string {
    return this.storage!.getPluginKey(null, `namespace=${this.namespace}`, 'state.json');
  }

  protected _getWorkersPrefix(): string {
    return this.storage!.getPluginKey(null, `namespace=${this.namespace}`, 'workers') + '/';
  }

  protected _getWorkerKey(workerId: string): string {
    return this.storage!.getPluginKey(null, `namespace=${this.namespace}`, 'workers', `worker=${workerId}.json`);
  }

  protected _getMetadataKey(): string {
    return this.storage!.getPluginKey(null, `namespace=${this.namespace}`, 'metadata.json');
  }

  protected _circuitBreakerAllows(): boolean {
    const cb = this._circuitBreaker;
    const now = Date.now();

    if (cb.state === 'closed') {
      return true;
    }

    if (cb.state === 'open') {
      if (cb.openedAt && now - cb.openedAt >= cb.resetTimeout) {
        cb.state = 'half-open';
        this.metrics.circuitBreakerState = 'half-open';
        this._log('Circuit breaker transitioning to half-open');
        return true;
      }
      return false;
    }

    return true;
  }

  protected _circuitBreakerSuccess(): void {
    const cb = this._circuitBreaker;

    if (cb.state === 'half-open') {
      cb.state = 'closed';
      cb.failureCount = 0;
      this.metrics.circuitBreakerState = 'closed';
      this._log('Circuit breaker closed after successful recovery');
    } else if (cb.state === 'closed') {
      cb.failureCount = 0;
    }

    cb.lastSuccessTime = Date.now();
  }

  protected _circuitBreakerFailure(): void {
    const cb = this._circuitBreaker;
    const now = Date.now();

    cb.failureCount++;
    cb.lastFailureTime = now;

    if (cb.state === 'half-open') {
      cb.state = 'open';
      cb.openedAt = now;
      this.metrics.circuitBreakerState = 'open';
      this.metrics.circuitBreakerTrips++;
      this._log('Circuit breaker reopened after half-open failure');
      this.emit('circuitBreaker:open', { namespace: this.namespace, failureCount: cb.failureCount } as CircuitBreakerEvent);
    } else if (cb.state === 'closed' && cb.failureCount >= cb.failureThreshold) {
      cb.state = 'open';
      cb.openedAt = now;
      this.metrics.circuitBreakerState = 'open';
      this.metrics.circuitBreakerTrips++;
      this._log(`Circuit breaker opened after ${cb.failureCount} failures`);
      this.emit('circuitBreaker:open', { namespace: this.namespace, failureCount: cb.failureCount } as CircuitBreakerEvent);
    }
  }

  getCircuitBreakerStatus(): CircuitBreakerStatus {
    const cb = this._circuitBreaker;
    return {
      state: cb.state,
      failureCount: cb.failureCount,
      failureThreshold: cb.failureThreshold,
      resetTimeout: cb.resetTimeout,
      lastFailureTime: cb.lastFailureTime,
      lastSuccessTime: cb.lastSuccessTime,
      openedAt: cb.openedAt,
      trips: this.metrics.circuitBreakerTrips
    };
  }

  protected _getWorkerPod(_workerId: string): string {
    if (typeof process !== 'undefined' && process.env) {
      return process.env.HOSTNAME || process.env.NODE_NAME || 'unknown';
    }
    return 'unknown';
  }

  protected _normalizeConfig(config: GlobalCoordinatorConfig): NormalizedConfig {
    return {
      heartbeatInterval: Math.max(1000, config.heartbeatInterval || 5000),
      heartbeatJitter: Math.max(0, config.heartbeatJitter || 1000),
      leaseTimeout: Math.max(5000, config.leaseTimeout || 15000),
      workerTimeout: Math.max(5000, config.workerTimeout || 20000),
      diagnosticsEnabled: Boolean(config.diagnosticsEnabled ?? false),
      contentionEnabled: config.contention?.enabled ?? true,
      contentionThreshold: config.contention?.threshold ?? 2.0,
      contentionRateLimitMs: config.contention?.rateLimitMs ?? 30000,
      metricsBufferSize: Math.max(10, config.metricsBufferSize ?? 100),
      stateCacheTtl: Math.max(0, config.stateCacheTtl ?? 2000)
    };
  }

  protected _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected _log(...args: unknown[]): void {
    if (this.config.diagnosticsEnabled) {
      this.logger.debug(args[0] as string, ...(args.slice(1) as any[]));
    }
  }

  protected _logError(msg: string, err: Error): void {
    if (this.config.diagnosticsEnabled) {
      this.logger.error({ error: err?.message || String(err) }, msg);
    }
  }

  protected _generateWorkerId(): string {
    const env = typeof process !== 'undefined' ? process.env : {};

    if (env.POD_NAME) {
      return `gcs-${env.POD_NAME}-${++serviceCounter}`;
    }

    if (env.HOSTNAME) {
      return `gcs-${env.HOSTNAME}-${++serviceCounter}`;
    }

    if (this.database && this.database.id) {
      return `gcs-${this.database.id}-${++serviceCounter}`;
    }

    return `gcs-${this.namespace}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${++serviceCounter}`;
  }
}

export interface ListObjectsResult {
  Contents?: Array<{
    Key: string;
    LastModified?: string | Date;
  }>;
}

export interface StorageSetOptions {
  ttl?: number;
  behavior?: string;
}

export class CoordinatorPluginStorage extends PluginStorage {
  constructor(client: S3Client, pluginSlug: string = 'coordinator') {
    super(client as never, pluginSlug);
  }

  override async list(prefix: string = '', options: { limit?: number } = {}): Promise<string[]> {
    const { limit } = options;
    const fullPrefix = prefix || '';

    const [ok, err, result] = await tryFn(() =>
      this.client.listObjects({ prefix: fullPrefix, maxKeys: limit })
    );

    if (!ok) {
      throw err;
    }

    const keys = (result as ListObjectsResult).Contents?.map(item => item.Key) || [];
    return this._removeKeyPrefix(keys);
  }

  override async listWithPrefix(prefix: string = '', options: { limit?: number } = {}): Promise<Record<string, unknown>[]> {
    const keys = await this.list(prefix, options);
    if (!keys || keys.length === 0) {
      return [];
    }

    const results = await this.batchGet(keys);
    return results
      .filter(item => item.ok && item.data != null)
      .map(item => item.data) as Record<string, unknown>[];
  }

  protected async _getActiveKeys(prefix: string, timeoutMs: number): Promise<string[]> {
    const fullPrefix = prefix || '';

    const [ok, , result] = await tryFn(() =>
      this.client.listObjects({ prefix: fullPrefix })
    );

    if (!ok || !(result as ListObjectsResult).Contents) {
      return [];
    }

    const now = Date.now();
    const activeKeys: string[] = [];
    const staleKeys: string[] = [];

    for (const obj of (result as ListObjectsResult).Contents!) {
      const lastModified = obj.LastModified ? new Date(obj.LastModified).getTime() : 0;
      const age = now - lastModified;

      if (age < (timeoutMs + 5000)) {
        activeKeys.push(obj.Key);
      } else {
        staleKeys.push(obj.Key);
      }
    }

    if (staleKeys.length > 0) {
      this._deleteStaleWorkers(staleKeys).catch(() => {});
    }

    return activeKeys;
  }

  async listActiveWorkers(prefix: string, timeoutMs: number): Promise<WorkerData[]> {
    const activeKeys = await this._getActiveKeys(prefix, timeoutMs);

    const keysToFetch = this._removeKeyPrefix(activeKeys);
    if (keysToFetch.length === 0) return [];

    const results = await this.batchGet(keysToFetch);

    return (results
      .filter(item => item.ok && item.data != null)
      .map(item => item.data) as unknown as WorkerData[])
      .sort((a, b) => (a.workerId || '').localeCompare(b.workerId || ''));
  }

  async listActiveWorkerIds(prefix: string, timeoutMs: number): Promise<string[]> {
    const activeKeys = await this._getActiveKeys(prefix, timeoutMs);

    const keysToProcess = this._removeKeyPrefix(activeKeys);
    if (keysToProcess.length === 0) return [];

    return keysToProcess
      .map(key => {
        const parts = key.split('/');
        const filename = parts[parts.length - 1]!;
        const rawId = filename.replace('.json', '');
        return rawId.startsWith('worker=') ? rawId.slice('worker='.length) : rawId;
      })
      .filter(id => id)
      .sort((a, b) => a.localeCompare(b));
  }

  protected async _deleteStaleWorkers(keys: string[]): Promise<void> {
    const cleanKeys = this._removeKeyPrefix(keys);
    if (cleanKeys.length > 0) {
      await Promise.all(cleanKeys.map(key => this.client.deleteObject(key)));
    }
  }
}

export default GlobalCoordinatorService;
