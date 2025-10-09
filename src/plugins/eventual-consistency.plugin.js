import Plugin from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { idGenerator } from "../concerns/id.js";
import { PromisePool } from "@supercharge/promise-pool";

export class EventualConsistencyPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    
    // Validate required options
    if (!options.resource) {
      throw new Error("EventualConsistencyPlugin requires 'resource' option");
    }
    if (!options.field) {
      throw new Error("EventualConsistencyPlugin requires 'field' option");
    }
    
    // Auto-detect timezone from environment or system
    const detectedTimezone = this._detectTimezone();

    this.config = {
      resource: options.resource,
      field: options.field,
      cohort: {
        timezone: options.cohort?.timezone || detectedTimezone
      },
      reducer: options.reducer || ((transactions) => {
        // Default reducer: sum all increments from a base value
        let baseValue = 0;

        for (const t of transactions) {
          if (t.operation === 'set') {
            baseValue = t.value;
          } else if (t.operation === 'add') {
            baseValue += t.value;
          } else if (t.operation === 'sub') {
            baseValue -= t.value;
          }
        }

        return baseValue;
      }),
      consolidationInterval: options.consolidationInterval ?? 300, // 5 minutes (in seconds)
      consolidationConcurrency: options.consolidationConcurrency || 5,
      consolidationWindow: options.consolidationWindow || 24, // Hours to look back for pending transactions (watermark)
      autoConsolidate: options.autoConsolidate !== false,
      lateArrivalStrategy: options.lateArrivalStrategy || 'warn', // 'ignore', 'warn', 'process'
      batchTransactions: options.batchTransactions || false, // CAUTION: Not safe in distributed environments! Loses data on container crash
      batchSize: options.batchSize || 100,
      mode: options.mode || 'async', // 'async' or 'sync'
      lockTimeout: options.lockTimeout || 300, // 5 minutes (in seconds, configurable)
      transactionRetention: options.transactionRetention || 30, // Days to keep applied transactions
      gcInterval: options.gcInterval || 86400, // 24 hours (in seconds)
      verbose: options.verbose || false
    };
    
    this.transactionResource = null;
    this.targetResource = null;
    this.consolidationTimer = null;
    this.gcTimer = null; // Garbage collection timer
    this.pendingTransactions = new Map(); // Cache for batching

    // Warn about batching in distributed environments
    if (this.config.batchTransactions && !this.config.verbose) {
      console.warn(
        `[EventualConsistency] WARNING: batchTransactions is enabled. ` +
        `This stores transactions in memory and will lose data if container crashes. ` +
        `Not recommended for distributed/production environments. ` +
        `Set verbose: true to suppress this warning.`
      );
    }

    // Log detected timezone if verbose
    if (this.config.verbose && !options.cohort?.timezone) {
      console.log(
        `[EventualConsistency] Auto-detected timezone: ${this.config.cohort.timezone} ` +
        `(from ${process.env.TZ ? 'TZ env var' : 'system Intl API'})`
      );
    }
  }

  async onSetup() {
    // Try to get the target resource
    this.targetResource = this.database.resources[this.config.resource];
    
    if (!this.targetResource) {
      // Resource doesn't exist yet - defer setup
      this.deferredSetup = true;
      this.watchForResource();
      return;
    }
    
    // Resource exists - continue with setup
    await this.completeSetup();
  }

  watchForResource() {
    // Monitor for resource creation using database hooks
    const hookCallback = async ({ resource, config }) => {
      // Check if this is the resource we're waiting for
      if (config.name === this.config.resource && this.deferredSetup) {
        this.targetResource = resource;
        this.deferredSetup = false;
        await this.completeSetup();
      }
    };
    
    this.database.addHook('afterCreateResource', hookCallback);
  }

  async completeSetup() {
    if (!this.targetResource) return;

    // Create transaction resource with partitions (includes field name to support multiple fields)
    const transactionResourceName = `${this.config.resource}_transactions_${this.config.field}`;
    const partitionConfig = this.createPartitionConfig();

    const [ok, err, transactionResource] = await tryFn(() =>
      this.database.createResource({
        name: transactionResourceName,
        attributes: {
          id: 'string|required',
          originalId: 'string|required',
          field: 'string|required',
          value: 'number|required',
          operation: 'string|required', // 'set', 'add', or 'sub'
          timestamp: 'string|required',
          cohortDate: 'string|required', // For daily partitioning
          cohortHour: 'string|required', // For hourly partitioning
          cohortMonth: 'string|optional', // For monthly partitioning
          source: 'string|optional',
          applied: 'boolean|optional' // Track if transaction was applied
        },
        behavior: 'body-overflow',
        timestamps: true,
        partitions: partitionConfig,
        asyncPartitions: true // Use async partitions for better performance
      })
    );

    if (!ok && !this.database.resources[transactionResourceName]) {
      throw new Error(`Failed to create transaction resource: ${err?.message}`);
    }

    this.transactionResource = ok ? transactionResource : this.database.resources[transactionResourceName];

    // Create lock resource for atomic consolidation
    const lockResourceName = `${this.config.resource}_consolidation_locks_${this.config.field}`;
    const [lockOk, lockErr, lockResource] = await tryFn(() =>
      this.database.createResource({
        name: lockResourceName,
        attributes: {
          id: 'string|required',
          lockedAt: 'number|required',
          workerId: 'string|optional'
        },
        behavior: 'body-only',
        timestamps: false
      })
    );

    if (!lockOk && !this.database.resources[lockResourceName]) {
      throw new Error(`Failed to create lock resource: ${lockErr?.message}`);
    }

    this.lockResource = lockOk ? lockResource : this.database.resources[lockResourceName];

    // Add helper methods to the resource
    this.addHelperMethods();

    // Setup consolidation if enabled
    if (this.config.autoConsolidate) {
      this.startConsolidationTimer();
    }

    // Setup garbage collection timer
    this.startGarbageCollectionTimer();
  }

  async onStart() {
    // Don't start if we're waiting for the resource
    if (this.deferredSetup) {
      return;
    }
    
    // Plugin is ready
    this.emit('eventual-consistency.started', {
      resource: this.config.resource,
      field: this.config.field,
      cohort: this.config.cohort
    });
  }

  async onStop() {
    // Stop consolidation timer
    if (this.consolidationTimer) {
      clearInterval(this.consolidationTimer);
      this.consolidationTimer = null;
    }

    // Stop garbage collection timer
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }

    // Flush pending transactions
    await this.flushPendingTransactions();

    this.emit('eventual-consistency.stopped', {
      resource: this.config.resource,
      field: this.config.field
    });
  }

  createPartitionConfig() {
    // Create hourly, daily and monthly partitions for transactions
    const partitions = {
      byHour: {
        fields: {
          cohortHour: 'string'
        }
      },
      byDay: {
        fields: {
          cohortDate: 'string'
        }
      },
      byMonth: {
        fields: {
          cohortMonth: 'string'
        }
      }
    };

    return partitions;
  }

  /**
   * Auto-detect timezone from environment or system
   * @private
   */
  _detectTimezone() {
    // 1. Try TZ environment variable (common in Docker/K8s)
    if (process.env.TZ) {
      return process.env.TZ;
    }

    // 2. Try Intl API (works in Node.js and browsers)
    try {
      const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (systemTimezone) {
        return systemTimezone;
      }
    } catch (err) {
      // Intl API not available or failed
    }

    // 3. Fallback to UTC
    return 'UTC';
  }

  /**
   * Helper method to resolve field and plugin from arguments
   * Supports both single-field (field, value) and multi-field (field, value) signatures
   * @private
   */
  _resolveFieldAndPlugin(resource, fieldOrValue, value) {
    const hasMultipleFields = Object.keys(resource._eventualConsistencyPlugins).length > 1;

    // If multiple fields exist and only 2 params given, throw error
    if (hasMultipleFields && value === undefined) {
      throw new Error(`Multiple fields have eventual consistency. Please specify the field explicitly.`);
    }

    // Handle both signatures: method(id, value) and method(id, field, value)
    const field = value !== undefined ? fieldOrValue : this.config.field;
    const actualValue = value !== undefined ? value : fieldOrValue;
    const fieldPlugin = resource._eventualConsistencyPlugins[field];

    if (!fieldPlugin) {
      throw new Error(`No eventual consistency plugin found for field "${field}"`);
    }

    return { field, value: actualValue, plugin: fieldPlugin };
  }

  /**
   * Helper method to perform atomic consolidation in sync mode
   * @private
   */
  async _syncModeConsolidate(id, field) {
    // consolidateRecord already has distributed locking, so it's atomic
    const consolidatedValue = await this.consolidateRecord(id);
    await this.targetResource.update(id, {
      [field]: consolidatedValue
    });
    return consolidatedValue;
  }

  /**
   * Create synthetic 'set' transaction from current value
   * @private
   */
  _createSyntheticSetTransaction(currentValue) {
    return {
      id: '__synthetic__',
      operation: 'set',
      value: currentValue,
      timestamp: new Date(0).toISOString(),
      synthetic: true
    };
  }

  addHelperMethods() {
    const resource = this.targetResource;
    const defaultField = this.config.field;
    const plugin = this;

    // Store all plugins by field name for this resource
    if (!resource._eventualConsistencyPlugins) {
      resource._eventualConsistencyPlugins = {};
    }
    resource._eventualConsistencyPlugins[defaultField] = plugin;
    
    // Add method to set value (replaces current value)
    resource.set = async (id, fieldOrValue, value) => {
      const { field, value: actualValue, plugin: fieldPlugin } =
        plugin._resolveFieldAndPlugin(resource, fieldOrValue, value);

      // Create set transaction
      await fieldPlugin.createTransaction({
        originalId: id,
        operation: 'set',
        value: actualValue,
        source: 'set'
      });

      // In sync mode, immediately consolidate and update (atomic with locking)
      if (fieldPlugin.config.mode === 'sync') {
        return await fieldPlugin._syncModeConsolidate(id, field);
      }

      return actualValue;
    };
    
    // Add method to increment value
    resource.add = async (id, fieldOrAmount, amount) => {
      const { field, value: actualAmount, plugin: fieldPlugin } =
        plugin._resolveFieldAndPlugin(resource, fieldOrAmount, amount);

      // Create add transaction
      await fieldPlugin.createTransaction({
        originalId: id,
        operation: 'add',
        value: actualAmount,
        source: 'add'
      });

      // In sync mode, immediately consolidate and update (atomic with locking)
      if (fieldPlugin.config.mode === 'sync') {
        return await fieldPlugin._syncModeConsolidate(id, field);
      }

      // In async mode, return expected value (for user feedback)
      const currentValue = await fieldPlugin.getConsolidatedValue(id);
      return currentValue + actualAmount;
    };
    
    // Add method to decrement value
    resource.sub = async (id, fieldOrAmount, amount) => {
      const { field, value: actualAmount, plugin: fieldPlugin } =
        plugin._resolveFieldAndPlugin(resource, fieldOrAmount, amount);

      // Create sub transaction
      await fieldPlugin.createTransaction({
        originalId: id,
        operation: 'sub',
        value: actualAmount,
        source: 'sub'
      });

      // In sync mode, immediately consolidate and update (atomic with locking)
      if (fieldPlugin.config.mode === 'sync') {
        return await fieldPlugin._syncModeConsolidate(id, field);
      }

      // In async mode, return expected value (for user feedback)
      const currentValue = await fieldPlugin.getConsolidatedValue(id);
      return currentValue - actualAmount;
    };
    
    // Add method to manually trigger consolidation
    resource.consolidate = async (id, field) => {
      // Check if there are multiple fields with eventual consistency
      const hasMultipleFields = Object.keys(resource._eventualConsistencyPlugins).length > 1;
      
      // If multiple fields exist and no field given, throw error
      if (hasMultipleFields && !field) {
        throw new Error(`Multiple fields have eventual consistency. Please specify the field: consolidate(id, field)`);
      }
      
      // Handle both signatures: consolidate(id) and consolidate(id, field)
      const actualField = field || defaultField;
      const fieldPlugin = resource._eventualConsistencyPlugins[actualField];
      
      if (!fieldPlugin) {
        throw new Error(`No eventual consistency plugin found for field "${actualField}"`);
      }
      
      return await fieldPlugin.consolidateRecord(id);
    };
    
    // Add method to get consolidated value without applying
    resource.getConsolidatedValue = async (id, fieldOrOptions, options) => {
      // Handle both signatures: getConsolidatedValue(id, options) and getConsolidatedValue(id, field, options)
      if (typeof fieldOrOptions === 'string') {
        const field = fieldOrOptions;
        const fieldPlugin = resource._eventualConsistencyPlugins[field] || plugin;
        return await fieldPlugin.getConsolidatedValue(id, options || {});
      } else {
        return await plugin.getConsolidatedValue(id, fieldOrOptions || {});
      }
    };
  }

  async createTransaction(data) {
    const now = new Date();
    const cohortInfo = this.getCohortInfo(now);

    // Check for late arrivals (transaction older than watermark)
    const watermarkMs = this.config.consolidationWindow * 60 * 60 * 1000;
    const watermarkTime = now.getTime() - watermarkMs;
    const cohortHourDate = new Date(cohortInfo.hour + ':00:00Z'); // Parse cohortHour back to date

    if (cohortHourDate.getTime() < watermarkTime) {
      // Late arrival detected!
      const hoursLate = Math.floor((now.getTime() - cohortHourDate.getTime()) / (60 * 60 * 1000));

      if (this.config.lateArrivalStrategy === 'ignore') {
        if (this.config.verbose) {
          console.warn(
            `[EventualConsistency] Late arrival ignored: transaction for ${cohortInfo.hour} ` +
            `is ${hoursLate}h late (watermark: ${this.config.consolidationWindow}h)`
          );
        }
        // Don't create transaction
        return null;
      } else if (this.config.lateArrivalStrategy === 'warn') {
        console.warn(
          `[EventualConsistency] Late arrival detected: transaction for ${cohortInfo.hour} ` +
          `is ${hoursLate}h late (watermark: ${this.config.consolidationWindow}h). ` +
          `Processing anyway, but consolidation may not pick it up.`
        );
      }
      // 'process' strategy: continue normally
    }

    const transaction = {
      id: idGenerator(), // Use nanoid for guaranteed uniqueness
      originalId: data.originalId,
      field: this.config.field,
      value: data.value || 0,
      operation: data.operation || 'set',
      timestamp: now.toISOString(),
      cohortDate: cohortInfo.date,
      cohortHour: cohortInfo.hour,
      cohortMonth: cohortInfo.month,
      source: data.source || 'unknown',
      applied: false
    };
    
    // Batch transactions if configured
    if (this.config.batchTransactions) {
      this.pendingTransactions.set(transaction.id, transaction);
      
      // Flush if batch size reached
      if (this.pendingTransactions.size >= this.config.batchSize) {
        await this.flushPendingTransactions();
      }
    } else {
      await this.transactionResource.insert(transaction);
    }
    
    return transaction;
  }

  async flushPendingTransactions() {
    if (this.pendingTransactions.size === 0) return;

    const transactions = Array.from(this.pendingTransactions.values());

    try {
      // Insert all pending transactions in parallel
      await Promise.all(
        transactions.map(transaction =>
          this.transactionResource.insert(transaction)
        )
      );

      // Only clear after successful inserts (prevents data loss on crashes)
      this.pendingTransactions.clear();
    } catch (error) {
      // Keep pending transactions for retry on next flush
      console.error('Failed to flush pending transactions:', error);
      throw error;
    }
  }

  getCohortInfo(date) {
    const tz = this.config.cohort.timezone;

    // Simple timezone offset calculation (can be enhanced with a library)
    const offset = this.getTimezoneOffset(tz);
    const localDate = new Date(date.getTime() + offset);

    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const hour = String(localDate.getHours()).padStart(2, '0');

    return {
      date: `${year}-${month}-${day}`,
      hour: `${year}-${month}-${day}T${hour}`, // ISO-like format for hour partition
      month: `${year}-${month}`
    };
  }

  getTimezoneOffset(timezone) {
    // Try to calculate offset using Intl API (handles DST automatically)
    try {
      const now = new Date();

      // Get UTC time
      const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));

      // Get time in target timezone
      const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));

      // Calculate offset in milliseconds
      return tzDate.getTime() - utcDate.getTime();
    } catch (err) {
      // Intl API failed, fallback to manual offsets (without DST support)
      const offsets = {
        'UTC': 0,
        'America/New_York': -5 * 3600000,
        'America/Chicago': -6 * 3600000,
        'America/Denver': -7 * 3600000,
        'America/Los_Angeles': -8 * 3600000,
        'America/Sao_Paulo': -3 * 3600000,
        'Europe/London': 0,
        'Europe/Paris': 1 * 3600000,
        'Europe/Berlin': 1 * 3600000,
        'Asia/Tokyo': 9 * 3600000,
        'Asia/Shanghai': 8 * 3600000,
        'Australia/Sydney': 10 * 3600000
      };

      if (this.config.verbose && !offsets[timezone]) {
        console.warn(
          `[EventualConsistency] Unknown timezone '${timezone}', using UTC. ` +
          `Consider using a valid IANA timezone (e.g., 'America/New_York')`
        );
      }

      return offsets[timezone] || 0;
    }
  }

  startConsolidationTimer() {
    const intervalMs = this.config.consolidationInterval * 1000; // Convert seconds to ms

    this.consolidationTimer = setInterval(async () => {
      await this.runConsolidation();
    }, intervalMs);
  }

  async runConsolidation() {
    try {
      // Query unapplied transactions from recent cohorts (last 24 hours by default)
      // This uses hourly partition for O(1) performance instead of full scan
      const now = new Date();
      const hoursToCheck = this.config.consolidationWindow || 24; // Configurable lookback window (in hours)
      const cohortHours = [];

      for (let i = 0; i < hoursToCheck; i++) {
        const date = new Date(now.getTime() - (i * 60 * 60 * 1000)); // Subtract hours
        const cohortInfo = this.getCohortInfo(date);
        cohortHours.push(cohortInfo.hour);
      }

      // Query transactions by partition for each hour (parallel for speed)
      const transactionsByHour = await Promise.all(
        cohortHours.map(async (cohortHour) => {
          const [ok, err, txns] = await tryFn(() =>
            this.transactionResource.query({
              cohortHour,
              applied: false
            })
          );
          return ok ? txns : [];
        })
      );

      // Flatten all transactions
      const transactions = transactionsByHour.flat();

      if (transactions.length === 0) {
        if (this.config.verbose) {
          console.log(`[EventualConsistency] No pending transactions to consolidate`);
        }
        return;
      }

      // Get unique originalIds
      const uniqueIds = [...new Set(transactions.map(t => t.originalId))];

      // Consolidate each record in parallel with concurrency limit
      const { results, errors } = await PromisePool
        .for(uniqueIds)
        .withConcurrency(this.config.consolidationConcurrency)
        .process(async (id) => {
          return await this.consolidateRecord(id);
        });

      if (errors && errors.length > 0) {
        console.error(`Consolidation completed with ${errors.length} errors:`, errors);
      }

      this.emit('eventual-consistency.consolidated', {
        resource: this.config.resource,
        field: this.config.field,
        recordCount: uniqueIds.length,
        successCount: results.length,
        errorCount: errors.length
      });
    } catch (error) {
      console.error('Consolidation error:', error);
      this.emit('eventual-consistency.consolidation-error', error);
    }
  }

  async consolidateRecord(originalId) {
    // Clean up stale locks before attempting to acquire
    await this.cleanupStaleLocks();

    // Acquire distributed lock to prevent concurrent consolidation
    const lockId = `lock-${originalId}`;
    const [lockAcquired, lockErr, lock] = await tryFn(() =>
      this.lockResource.insert({
        id: lockId,
        lockedAt: Date.now(),
        workerId: process.pid ? String(process.pid) : 'unknown'
      })
    );

    // If lock couldn't be acquired, another worker is consolidating
    if (!lockAcquired) {
      if (this.config.verbose) {
        console.log(`[EventualConsistency] Lock for ${originalId} already held, skipping`);
      }
      // Get current value and return (another worker will consolidate)
      const [recordOk, recordErr, record] = await tryFn(() =>
        this.targetResource.get(originalId)
      );
      return (recordOk && record) ? (record[this.config.field] || 0) : 0;
    }

    try {
      // Get the current record value first
      const [recordOk, recordErr, record] = await tryFn(() =>
        this.targetResource.get(originalId)
      );

      const currentValue = (recordOk && record) ? (record[this.config.field] || 0) : 0;

      // Get all transactions for this record
      const [ok, err, transactions] = await tryFn(() =>
        this.transactionResource.query({
          originalId,
          applied: false
        })
      );

      if (!ok || !transactions || transactions.length === 0) {
        return currentValue;
      }

      // Sort transactions by timestamp
      transactions.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // If there's a current value and no 'set' operations, prepend a synthetic set transaction
      const hasSetOperation = transactions.some(t => t.operation === 'set');
      if (currentValue !== 0 && !hasSetOperation) {
        transactions.unshift(this._createSyntheticSetTransaction(currentValue));
      }

      // Apply reducer to get consolidated value
      const consolidatedValue = this.config.reducer(transactions);

      // Update the original record
      const [updateOk, updateErr] = await tryFn(() =>
        this.targetResource.update(originalId, {
          [this.config.field]: consolidatedValue
        })
      );

      if (updateOk) {
        // Mark transactions as applied (skip synthetic ones) - use PromisePool for controlled concurrency
        const transactionsToUpdate = transactions.filter(txn => txn.id !== '__synthetic__');

        const { results, errors } = await PromisePool
          .for(transactionsToUpdate)
          .withConcurrency(10) // Limit parallel updates
          .process(async (txn) => {
            const [ok, err] = await tryFn(() =>
              this.transactionResource.update(txn.id, { applied: true })
            );

            if (!ok && this.config.verbose) {
              console.warn(`[EventualConsistency] Failed to mark transaction ${txn.id} as applied:`, err?.message);
            }

            return ok;
          });

        if (errors && errors.length > 0 && this.config.verbose) {
          console.warn(`[EventualConsistency] ${errors.length} transactions failed to mark as applied`);
        }
      }

      return consolidatedValue;
    } finally {
      // Always release the lock
      const [lockReleased, lockReleaseErr] = await tryFn(() => this.lockResource.delete(lockId));

      if (!lockReleased && this.config.verbose) {
        console.warn(`[EventualConsistency] Failed to release lock ${lockId}:`, lockReleaseErr?.message);
      }
    }
  }

  async getConsolidatedValue(originalId, options = {}) {
    const includeApplied = options.includeApplied || false;
    const startDate = options.startDate;
    const endDate = options.endDate;

    // Build query
    const query = { originalId };
    if (!includeApplied) {
      query.applied = false;
    }

    // Get transactions
    const [ok, err, transactions] = await tryFn(() =>
      this.transactionResource.query(query)
    );

    if (!ok || !transactions || transactions.length === 0) {
      // If no transactions, check if record exists and return its current value
      const [recordOk, recordErr, record] = await tryFn(() =>
        this.targetResource.get(originalId)
      );

      if (recordOk && record) {
        return record[this.config.field] || 0;
      }

      return 0;
    }

    // Filter by date range if specified
    let filtered = transactions;
    if (startDate || endDate) {
      filtered = transactions.filter(t => {
        const timestamp = new Date(t.timestamp);
        if (startDate && timestamp < new Date(startDate)) return false;
        if (endDate && timestamp > new Date(endDate)) return false;
        return true;
      });
    }

    // Get current value from record
    const [recordOk, recordErr, record] = await tryFn(() =>
      this.targetResource.get(originalId)
    );
    const currentValue = (recordOk && record) ? (record[this.config.field] || 0) : 0;

    // Check if there's a 'set' operation in filtered transactions
    const hasSetOperation = filtered.some(t => t.operation === 'set');

    // If current value exists and no 'set', prepend synthetic set transaction
    if (currentValue !== 0 && !hasSetOperation) {
      filtered.unshift(this._createSyntheticSetTransaction(currentValue));
    }

    // Sort by timestamp
    filtered.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Apply reducer
    return this.config.reducer(filtered);
  }

  // Helper method to get cohort statistics
  async getCohortStats(cohortDate) {
    const [ok, err, transactions] = await tryFn(() =>
      this.transactionResource.query({
        cohortDate
      })
    );

    if (!ok) return null;

    const stats = {
      date: cohortDate,
      transactionCount: transactions.length,
      totalValue: 0,
      byOperation: { set: 0, add: 0, sub: 0 },
      byOriginalId: {}
    };

    for (const txn of transactions) {
      stats.totalValue += txn.value || 0;
      stats.byOperation[txn.operation] = (stats.byOperation[txn.operation] || 0) + 1;

      if (!stats.byOriginalId[txn.originalId]) {
        stats.byOriginalId[txn.originalId] = {
          count: 0,
          value: 0
        };
      }
      stats.byOriginalId[txn.originalId].count++;
      stats.byOriginalId[txn.originalId].value += txn.value || 0;
    }

    return stats;
  }

  /**
   * Clean up stale locks that exceed the configured timeout
   * Uses distributed locking to prevent multiple containers from cleaning simultaneously
   */
  async cleanupStaleLocks() {
    const now = Date.now();
    const lockTimeoutMs = this.config.lockTimeout * 1000; // Convert seconds to ms
    const cutoffTime = now - lockTimeoutMs;

    // Acquire distributed lock for cleanup operation
    const cleanupLockId = `lock-cleanup-${this.config.resource}-${this.config.field}`;
    const [lockAcquired] = await tryFn(() =>
      this.lockResource.insert({
        id: cleanupLockId,
        lockedAt: Date.now(),
        workerId: process.pid ? String(process.pid) : 'unknown'
      })
    );

    // If another container is already cleaning, skip
    if (!lockAcquired) {
      if (this.config.verbose) {
        console.log(`[EventualConsistency] Lock cleanup already running in another container`);
      }
      return;
    }

    try {
      // Get all locks
      const [ok, err, locks] = await tryFn(() => this.lockResource.list());

      if (!ok || !locks || locks.length === 0) return;

      // Find stale locks (excluding the cleanup lock itself)
      const staleLocks = locks.filter(lock =>
        lock.id !== cleanupLockId && lock.lockedAt < cutoffTime
      );

      if (staleLocks.length === 0) return;

      if (this.config.verbose) {
        console.log(`[EventualConsistency] Cleaning up ${staleLocks.length} stale locks`);
      }

      // Delete stale locks using PromisePool
      const { results, errors } = await PromisePool
        .for(staleLocks)
        .withConcurrency(5)
        .process(async (lock) => {
          const [deleted] = await tryFn(() => this.lockResource.delete(lock.id));
          return deleted;
        });

      if (errors && errors.length > 0 && this.config.verbose) {
        console.warn(`[EventualConsistency] ${errors.length} stale locks failed to delete`);
      }
    } catch (error) {
      if (this.config.verbose) {
        console.warn(`[EventualConsistency] Error cleaning up stale locks:`, error.message);
      }
    } finally {
      // Always release cleanup lock
      await tryFn(() => this.lockResource.delete(cleanupLockId));
    }
  }

  /**
   * Start garbage collection timer for old applied transactions
   */
  startGarbageCollectionTimer() {
    const gcIntervalMs = this.config.gcInterval * 1000; // Convert seconds to ms

    this.gcTimer = setInterval(async () => {
      await this.runGarbageCollection();
    }, gcIntervalMs);
  }

  /**
   * Delete old applied transactions based on retention policy
   * Uses distributed locking to prevent multiple containers from running GC simultaneously
   */
  async runGarbageCollection() {
    // Acquire distributed lock for GC operation
    const gcLockId = `lock-gc-${this.config.resource}-${this.config.field}`;
    const [lockAcquired] = await tryFn(() =>
      this.lockResource.insert({
        id: gcLockId,
        lockedAt: Date.now(),
        workerId: process.pid ? String(process.pid) : 'unknown'
      })
    );

    // If another container is already running GC, skip
    if (!lockAcquired) {
      if (this.config.verbose) {
        console.log(`[EventualConsistency] GC already running in another container`);
      }
      return;
    }

    try {
      const now = Date.now();
      const retentionMs = this.config.transactionRetention * 24 * 60 * 60 * 1000; // Days to ms
      const cutoffDate = new Date(now - retentionMs);
      const cutoffIso = cutoffDate.toISOString();

      if (this.config.verbose) {
        console.log(`[EventualConsistency] Running GC for transactions older than ${cutoffIso} (${this.config.transactionRetention} days)`);
      }

      // Query old applied transactions
      const cutoffMonth = cutoffDate.toISOString().substring(0, 7); // YYYY-MM

      const [ok, err, oldTransactions] = await tryFn(() =>
        this.transactionResource.query({
          applied: true,
          timestamp: { '<': cutoffIso }
        })
      );

      if (!ok) {
        if (this.config.verbose) {
          console.warn(`[EventualConsistency] GC failed to query transactions:`, err?.message);
        }
        return;
      }

      if (!oldTransactions || oldTransactions.length === 0) {
        if (this.config.verbose) {
          console.log(`[EventualConsistency] No old transactions to clean up`);
        }
        return;
      }

      if (this.config.verbose) {
        console.log(`[EventualConsistency] Deleting ${oldTransactions.length} old transactions`);
      }

      // Delete old transactions using PromisePool
      const { results, errors } = await PromisePool
        .for(oldTransactions)
        .withConcurrency(10)
        .process(async (txn) => {
          const [deleted] = await tryFn(() => this.transactionResource.delete(txn.id));
          return deleted;
        });

      if (this.config.verbose) {
        console.log(`[EventualConsistency] GC completed: ${results.length} deleted, ${errors.length} errors`);
      }

      this.emit('eventual-consistency.gc-completed', {
        resource: this.config.resource,
        field: this.config.field,
        deletedCount: results.length,
        errorCount: errors.length
      });
    } catch (error) {
      if (this.config.verbose) {
        console.warn(`[EventualConsistency] GC error:`, error.message);
      }
      this.emit('eventual-consistency.gc-error', error);
    } finally {
      // Always release GC lock
      await tryFn(() => this.lockResource.delete(gcLockId));
    }
  }
}

export default EventualConsistencyPlugin;