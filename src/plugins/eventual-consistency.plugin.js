import Plugin from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { idGenerator } from "../concerns/id.js";
import { PromisePool } from "@supercharge/promise-pool";

export class EventualConsistencyPlugin extends Plugin {
  constructor(options = {}) {
    super(options);

    // Validate resources structure
    if (!options.resources || typeof options.resources !== 'object') {
      throw new Error(
        "EventualConsistencyPlugin requires 'resources' option.\n" +
        "Example: { resources: { urls: ['clicks', 'views'], posts: ['likes'] } }"
      );
    }

    // Auto-detect timezone from environment or system
    const detectedTimezone = this._detectTimezone();

    // Create shared configuration
    this.config = {
      cohort: {
        timezone: options.cohort?.timezone || detectedTimezone
      },
      reducer: options.reducer || ((transactions) => {
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
      consolidationInterval: options.consolidationInterval ?? 300,
      consolidationConcurrency: options.consolidationConcurrency || 5,
      consolidationWindow: options.consolidationWindow || 24,
      autoConsolidate: options.autoConsolidate !== false,
      lateArrivalStrategy: options.lateArrivalStrategy || 'warn',
      batchTransactions: options.batchTransactions || false,
      batchSize: options.batchSize || 100,
      mode: options.mode || 'async',
      lockTimeout: options.lockTimeout || 300,
      transactionRetention: options.transactionRetention || 30,
      gcInterval: options.gcInterval || 86400,
      verbose: options.verbose || false,
      enableAnalytics: options.enableAnalytics || false,
      analyticsConfig: {
        periods: options.analyticsConfig?.periods || ['hour', 'day', 'month'],
        metrics: options.analyticsConfig?.metrics || ['count', 'sum', 'avg', 'min', 'max'],
        rollupStrategy: options.analyticsConfig?.rollupStrategy || 'incremental',
        retentionDays: options.analyticsConfig?.retentionDays || 365
      }
    };

    // Create field handlers map
    this.fieldHandlers = new Map(); // Map<resourceName, Map<fieldName, handler>>

    // Parse resources configuration
    for (const [resourceName, fields] of Object.entries(options.resources)) {
      if (!Array.isArray(fields)) {
        throw new Error(
          `EventualConsistencyPlugin resources.${resourceName} must be an array of field names`
        );
      }

      const resourceHandlers = new Map();
      for (const fieldName of fields) {
        // Create a field handler for each resource/field combination
        resourceHandlers.set(fieldName, this._createFieldHandler(resourceName, fieldName));
      }
      this.fieldHandlers.set(resourceName, resourceHandlers);
    }

    // Warn about batching in distributed environments
    if (this.config.batchTransactions && !this.config.verbose) {
      console.warn(
        `[EventualConsistency] WARNING: batchTransactions is enabled. ` +
        `This stores transactions in memory and will lose data if container crashes. ` +
        `Not recommended for distributed/production environments.`
      );
    }

    // Log initialization if verbose
    if (this.config.verbose) {
      const totalFields = Array.from(this.fieldHandlers.values())
        .reduce((sum, handlers) => sum + handlers.size, 0);
      console.log(
        `[EventualConsistency] Initialized with ${this.fieldHandlers.size} resource(s), ` +
        `${totalFields} field(s) total`
      );

      // Log detected timezone if not explicitly set
      if (!options.cohort?.timezone) {
        console.log(
          `[EventualConsistency] Auto-detected timezone: ${this.config.cohort.timezone} ` +
          `(from ${process.env.TZ ? 'TZ env var' : 'system Intl API'})`
        );
      }
    }
  }

  /**
   * Create a field handler for a specific resource/field combination
   * @private
   */
  _createFieldHandler(resourceName, fieldName) {
    return {
      resource: resourceName,
      field: fieldName,
      transactionResource: null,
      targetResource: null,
      analyticsResource: null,
      lockResource: null,
      consolidationTimer: null,
      gcTimer: null,
      pendingTransactions: new Map(),
      deferredSetup: false
    };
  }

  async onSetup() {
    // Iterate over all resource/field combinations
    for (const [resourceName, fieldHandlers] of this.fieldHandlers) {
      const targetResource = this.database.resources[resourceName];

      if (!targetResource) {
        // Resource doesn't exist yet - mark for deferred setup
        for (const handler of fieldHandlers.values()) {
          handler.deferredSetup = true;
        }
        // Watch for this resource to be created
        this._watchForResource(resourceName);
        continue;
      }

      // Resource exists - setup all fields for this resource
      for (const [fieldName, handler] of fieldHandlers) {
        handler.targetResource = targetResource;
        await this._completeFieldSetup(handler);
      }
    }
  }

  /**
   * Watch for a specific resource creation
   * @private
   */
  _watchForResource(resourceName) {
    const hookCallback = async ({ resource, config }) => {
      if (config.name === resourceName) {
        const fieldHandlers = this.fieldHandlers.get(resourceName);
        if (!fieldHandlers) return;

        // Setup all fields for this resource
        for (const [fieldName, handler] of fieldHandlers) {
          if (handler.deferredSetup) {
            handler.targetResource = resource;
            handler.deferredSetup = false;
            await this._completeFieldSetup(handler);
          }
        }
      }
    };

    this.database.addHook('afterCreateResource', hookCallback);
  }

  /**
   * Complete setup for a single field handler
   * @private
   */
  async _completeFieldSetup(handler) {
    if (!handler.targetResource) return;

    const config = this.config;
    const resourceName = handler.resource;
    const fieldName = handler.field;

    // Create transaction resource with partitions
    const transactionResourceName = `${resourceName}_transactions_${fieldName}`;
    const partitionConfig = this.createPartitionConfig();

    const [ok, err, transactionResource] = await tryFn(() =>
      this.database.createResource({
        name: transactionResourceName,
        attributes: {
          id: 'string|required',
          originalId: 'string|required',
          field: 'string|required',
          value: 'number|required',
          operation: 'string|required',
          timestamp: 'string|required',
          cohortDate: 'string|required',
          cohortHour: 'string|required',
          cohortMonth: 'string|optional',
          source: 'string|optional',
          applied: 'boolean|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        partitions: partitionConfig,
        asyncPartitions: true,
        createdBy: 'EventualConsistencyPlugin'
      })
    );

    if (!ok && !this.database.resources[transactionResourceName]) {
      throw new Error(`Failed to create transaction resource for ${resourceName}.${fieldName}: ${err?.message}`);
    }

    handler.transactionResource = ok ? transactionResource : this.database.resources[transactionResourceName];

    // Create lock resource
    const lockResourceName = `${resourceName}_consolidation_locks_${fieldName}`;
    const [lockOk, lockErr, lockResource] = await tryFn(() =>
      this.database.createResource({
        name: lockResourceName,
        attributes: {
          id: 'string|required',
          lockedAt: 'number|required',
          workerId: 'string|optional'
        },
        behavior: 'body-only',
        timestamps: false,
        createdBy: 'EventualConsistencyPlugin'
      })
    );

    if (!lockOk && !this.database.resources[lockResourceName]) {
      throw new Error(`Failed to create lock resource for ${resourceName}.${fieldName}: ${lockErr?.message}`);
    }

    handler.lockResource = lockOk ? lockResource : this.database.resources[lockResourceName];

    // Create analytics resource if enabled
    if (config.enableAnalytics) {
      await this._createAnalyticsResourceForHandler(handler);
    }

    // Add helper methods to the target resource
    this._addHelperMethodsForHandler(handler);

    // Setup timers (TODO: implement timer management for handlers)
    // For now, we'll skip auto-consolidation in multi-resource mode

    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${resourceName}.${fieldName} - ` +
        `Setup complete. Resources: ${transactionResourceName}, ${lockResourceName}` +
        `${config.enableAnalytics ? `, ${resourceName}_analytics_${fieldName}` : ''}`
      );
    }
  }

  /**
   * Create analytics resource for a field handler
   * @private
   */
  async _createAnalyticsResourceForHandler(handler) {
    const resourceName = handler.resource;
    const fieldName = handler.field;
    const analyticsResourceName = `${resourceName}_analytics_${fieldName}`;

    const [ok, err, analyticsResource] = await tryFn(() =>
      this.database.createResource({
        name: analyticsResourceName,
        attributes: {
          id: 'string|required',
          period: 'string|required',
          cohort: 'string|required',
          transactionCount: 'number|required',
          totalValue: 'number|required',
          avgValue: 'number|required',
          minValue: 'number|required',
          maxValue: 'number|required',
          operations: 'object|optional',
          recordCount: 'number|required',
          consolidatedAt: 'string|required',
          updatedAt: 'string|required'
        },
        behavior: 'body-overflow',
        timestamps: false,
        createdBy: 'EventualConsistencyPlugin'
      })
    );

    if (!ok && !this.database.resources[analyticsResourceName]) {
      throw new Error(`Failed to create analytics resource for ${resourceName}.${fieldName}: ${err?.message}`);
    }

    handler.analyticsResource = ok ? analyticsResource : this.database.resources[analyticsResourceName];
  }

  /**
   * Add helper methods to the target resource for a field handler
   * @private
   */
  _addHelperMethodsForHandler(handler) {
    const resource = handler.targetResource;
    const fieldName = handler.field;

    // Store handler reference on the resource for later access
    if (!resource._eventualConsistencyPlugins) {
      resource._eventualConsistencyPlugins = {};
    }
    resource._eventualConsistencyPlugins[fieldName] = handler;

    // Add helper methods if not already added
    if (!resource.add) {
      this.addHelperMethods(); // Add all helper methods once
    }
  }

  async onStart() {
    // Start timers and emit events for all field handlers
    for (const [resourceName, fieldHandlers] of this.fieldHandlers) {
      for (const [fieldName, handler] of fieldHandlers) {
        if (!handler.deferredSetup) {
          // Start auto-consolidation timer if enabled
          if (this.config.autoConsolidate && this.config.mode === 'async') {
            this.startConsolidationTimerForHandler(handler, resourceName, fieldName);
          }

          // Start garbage collection timer
          if (this.config.transactionRetention && this.config.transactionRetention > 0) {
            this.startGarbageCollectionTimerForHandler(handler, resourceName, fieldName);
          }

          this.emit('eventual-consistency.started', {
            resource: resourceName,
            field: fieldName,
            cohort: this.config.cohort
          });
        }
      }
    }
  }

  async onStop() {
    // Stop all timers for all handlers
    for (const [resourceName, fieldHandlers] of this.fieldHandlers) {
      for (const [fieldName, handler] of fieldHandlers) {
        // Stop consolidation timer
        if (handler.consolidationTimer) {
          clearInterval(handler.consolidationTimer);
          handler.consolidationTimer = null;
        }

        // Stop garbage collection timer
        if (handler.gcTimer) {
          clearInterval(handler.gcTimer);
          handler.gcTimer = null;
        }

        // Flush pending transactions
        if (handler.pendingTransactions && handler.pendingTransactions.size > 0) {
          await this._flushPendingTransactions(handler);
        }

        this.emit('eventual-consistency.stopped', {
          resource: resourceName,
          field: fieldName
        });
      }
    }
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
   * @private
   */
  _resolveFieldAndPlugin(resource, field, value) {
    if (!resource._eventualConsistencyPlugins) {
      throw new Error(`No eventual consistency plugins configured for this resource`);
    }

    const fieldPlugin = resource._eventualConsistencyPlugins[field];

    if (!fieldPlugin) {
      const availableFields = Object.keys(resource._eventualConsistencyPlugins).join(', ');
      throw new Error(
        `No eventual consistency plugin found for field "${field}". ` +
        `Available fields: ${availableFields}`
      );
    }

    return { field, value, plugin: fieldPlugin };
  }

  /**
   * Helper method to perform atomic consolidation in sync mode
   * @private
   */
  async _syncModeConsolidate(id, field) {
    // consolidateRecord already has distributed locking and handles persistence (upsert)
    const consolidatedValue = await this.consolidateRecord(id);
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
    // Get any handler from the first resource to access the resource instance
    const firstResource = this.fieldHandlers.values().next().value;
    if (!firstResource) return;

    const firstHandler = firstResource.values().next().value;
    if (!firstHandler || !firstHandler.targetResource) return;

    const resource = firstHandler.targetResource;
    const plugin = this;

    // Add method to set value (replaces current value)
    // Signature: set(id, field, value)
    resource.set = async (id, field, value) => {
      const { plugin: handler } =
        plugin._resolveFieldAndPlugin(resource, field, value);

      // Create transaction inline
      const now = new Date();
      const cohortInfo = plugin.getCohortInfo(now);

      const transaction = {
        id: idGenerator(),
        originalId: id,
        field: handler.field,
        value: value,
        operation: 'set',
        timestamp: now.toISOString(),
        cohortDate: cohortInfo.date,
        cohortHour: cohortInfo.hour,
        cohortMonth: cohortInfo.month,
        source: 'set',
        applied: false
      };

      await handler.transactionResource.insert(transaction);

      // In sync mode, immediately consolidate
      if (plugin.config.mode === 'sync') {
        // Temporarily set config for legacy methods
        const oldResource = plugin.config.resource;
        const oldField = plugin.config.field;
        const oldTransactionResource = plugin.transactionResource;
        const oldTargetResource = plugin.targetResource;
        const oldLockResource = plugin.lockResource;
        const oldAnalyticsResource = plugin.analyticsResource;

        plugin.config.resource = handler.resource;
        plugin.config.field = handler.field;
        plugin.transactionResource = handler.transactionResource;
        plugin.targetResource = handler.targetResource;
        plugin.lockResource = handler.lockResource;
        plugin.analyticsResource = handler.analyticsResource;

        const result = await plugin._syncModeConsolidate(id, field);

        // Restore
        plugin.config.resource = oldResource;
        plugin.config.field = oldField;
        plugin.transactionResource = oldTransactionResource;
        plugin.targetResource = oldTargetResource;
        plugin.lockResource = oldLockResource;
        plugin.analyticsResource = oldAnalyticsResource;

        return result;
      }

      return value;
    };

    // Add method to increment value
    // Signature: add(id, field, amount)
    resource.add = async (id, field, amount) => {
      const { plugin: handler } =
        plugin._resolveFieldAndPlugin(resource, field, amount);

      // Create transaction inline
      const now = new Date();
      const cohortInfo = plugin.getCohortInfo(now);

      const transaction = {
        id: idGenerator(),
        originalId: id,
        field: handler.field,
        value: amount,
        operation: 'add',
        timestamp: now.toISOString(),
        cohortDate: cohortInfo.date,
        cohortHour: cohortInfo.hour,
        cohortMonth: cohortInfo.month,
        source: 'add',
        applied: false
      };

      await handler.transactionResource.insert(transaction);

      // In sync mode, immediately consolidate
      if (plugin.config.mode === 'sync') {
        const oldResource = plugin.config.resource;
        const oldField = plugin.config.field;
        const oldTransactionResource = plugin.transactionResource;
        const oldTargetResource = plugin.targetResource;
        const oldLockResource = plugin.lockResource;
        const oldAnalyticsResource = plugin.analyticsResource;

        plugin.config.resource = handler.resource;
        plugin.config.field = handler.field;
        plugin.transactionResource = handler.transactionResource;
        plugin.targetResource = handler.targetResource;
        plugin.lockResource = handler.lockResource;
        plugin.analyticsResource = handler.analyticsResource;

        const result = await plugin._syncModeConsolidate(id, field);

        plugin.config.resource = oldResource;
        plugin.config.field = oldField;
        plugin.transactionResource = oldTransactionResource;
        plugin.targetResource = oldTargetResource;
        plugin.lockResource = oldLockResource;
        plugin.analyticsResource = oldAnalyticsResource;

        return result;
      }

      // Async mode - return current value (optimistic)
      const [ok, err, record] = await tryFn(() => handler.targetResource.get(id));
      const currentValue = (ok && record) ? (record[field] || 0) : 0;
      return currentValue + amount;
    };

    // Add method to decrement value
    // Signature: sub(id, field, amount)
    resource.sub = async (id, field, amount) => {
      const { plugin: handler } =
        plugin._resolveFieldAndPlugin(resource, field, amount);

      // Create transaction inline
      const now = new Date();
      const cohortInfo = plugin.getCohortInfo(now);

      const transaction = {
        id: idGenerator(),
        originalId: id,
        field: handler.field,
        value: amount,
        operation: 'sub',
        timestamp: now.toISOString(),
        cohortDate: cohortInfo.date,
        cohortHour: cohortInfo.hour,
        cohortMonth: cohortInfo.month,
        source: 'sub',
        applied: false
      };

      await handler.transactionResource.insert(transaction);

      // In sync mode, immediately consolidate
      if (plugin.config.mode === 'sync') {
        const oldResource = plugin.config.resource;
        const oldField = plugin.config.field;
        const oldTransactionResource = plugin.transactionResource;
        const oldTargetResource = plugin.targetResource;
        const oldLockResource = plugin.lockResource;
        const oldAnalyticsResource = plugin.analyticsResource;

        plugin.config.resource = handler.resource;
        plugin.config.field = handler.field;
        plugin.transactionResource = handler.transactionResource;
        plugin.targetResource = handler.targetResource;
        plugin.lockResource = handler.lockResource;
        plugin.analyticsResource = handler.analyticsResource;

        const result = await plugin._syncModeConsolidate(id, field);

        plugin.config.resource = oldResource;
        plugin.config.field = oldField;
        plugin.transactionResource = oldTransactionResource;
        plugin.targetResource = oldTargetResource;
        plugin.lockResource = oldLockResource;
        plugin.analyticsResource = oldAnalyticsResource;

        return result;
      }

      // Async mode - return current value (optimistic)
      const [ok, err, record] = await tryFn(() => handler.targetResource.get(id));
      const currentValue = (ok && record) ? (record[field] || 0) : 0;
      return currentValue - amount;
    };

    // Add method to manually trigger consolidation
    // Signature: consolidate(id, field)
    resource.consolidate = async (id, field) => {
      if (!field) {
        throw new Error(`Field parameter is required: consolidate(id, field)`);
      }

      const handler = resource._eventualConsistencyPlugins[field];

      if (!handler) {
        const availableFields = Object.keys(resource._eventualConsistencyPlugins).join(', ');
        throw new Error(
          `No eventual consistency plugin found for field "${field}". ` +
          `Available fields: ${availableFields}`
        );
      }

      // Temporarily set config for legacy methods
      const oldResource = plugin.config.resource;
      const oldField = plugin.config.field;
      const oldTransactionResource = plugin.transactionResource;
      const oldTargetResource = plugin.targetResource;
      const oldLockResource = plugin.lockResource;
      const oldAnalyticsResource = plugin.analyticsResource;

      plugin.config.resource = handler.resource;
      plugin.config.field = handler.field;
      plugin.transactionResource = handler.transactionResource;
      plugin.targetResource = handler.targetResource;
      plugin.lockResource = handler.lockResource;
      plugin.analyticsResource = handler.analyticsResource;

      const result = await plugin.consolidateRecord(id);

      plugin.config.resource = oldResource;
      plugin.config.field = oldField;
      plugin.transactionResource = oldTransactionResource;
      plugin.targetResource = oldTargetResource;
      plugin.lockResource = oldLockResource;
      plugin.analyticsResource = oldAnalyticsResource;

      return result;
    };

    // Add method to get consolidated value without applying
    // Signature: getConsolidatedValue(id, field, options)
    resource.getConsolidatedValue = async (id, field, options = {}) => {
      const handler = resource._eventualConsistencyPlugins[field];

      if (!handler) {
        const availableFields = Object.keys(resource._eventualConsistencyPlugins).join(', ');
        throw new Error(
          `No eventual consistency plugin found for field "${field}". ` +
          `Available fields: ${availableFields}`
        );
      }

      // Temporarily set config for legacy methods
      const oldResource = plugin.config.resource;
      const oldField = plugin.config.field;
      const oldTransactionResource = plugin.transactionResource;
      const oldTargetResource = plugin.targetResource;

      plugin.config.resource = handler.resource;
      plugin.config.field = handler.field;
      plugin.transactionResource = handler.transactionResource;
      plugin.targetResource = handler.targetResource;

      const result = await plugin.getConsolidatedValue(id, options);

      plugin.config.resource = oldResource;
      plugin.config.field = oldField;
      plugin.transactionResource = oldTransactionResource;
      plugin.targetResource = oldTargetResource;

      return result;
    };
  }

  async createTransaction(handler, data) {
    const now = new Date();
    const cohortInfo = this.getCohortInfo(now);

    // Check for late arrivals (transaction older than watermark)
    const watermarkMs = this.config.consolidationWindow * 60 * 60 * 1000;
    const watermarkTime = now.getTime() - watermarkMs;
    const cohortHourDate = new Date(cohortInfo.hour + ':00:00Z');

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
      id: idGenerator(),
      originalId: data.originalId,
      field: handler.field,
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
      handler.pendingTransactions.set(transaction.id, transaction);

      if (this.config.verbose) {
        console.log(
          `[EventualConsistency] ${handler.resource}.${handler.field} - ` +
          `Transaction batched: ${data.operation} ${data.value} for ${data.originalId} ` +
          `(batch: ${handler.pendingTransactions.size}/${this.config.batchSize})`
        );
      }

      // Flush if batch size reached
      if (handler.pendingTransactions.size >= this.config.batchSize) {
        await this._flushPendingTransactions(handler);
      }
    } else {
      await handler.transactionResource.insert(transaction);

      if (this.config.verbose) {
        console.log(
          `[EventualConsistency] ${handler.resource}.${handler.field} - ` +
          `Transaction created: ${data.operation} ${data.value} for ${data.originalId} ` +
          `(cohort: ${cohortInfo.hour}, applied: false)`
        );
      }
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

    if (this.config.verbose) {
      const nextRun = new Date(Date.now() + intervalMs);
      console.log(
        `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
        `Consolidation timer started. Next run at ${nextRun.toISOString()} ` +
        `(every ${this.config.consolidationInterval}s)`
      );
    }

    this.consolidationTimer = setInterval(async () => {
      await this.runConsolidation();
    }, intervalMs);
  }

  startConsolidationTimerForHandler(handler, resourceName, fieldName) {
    const intervalMs = this.config.consolidationInterval * 1000; // Convert seconds to ms

    if (this.config.verbose) {
      const nextRun = new Date(Date.now() + intervalMs);
      console.log(
        `[EventualConsistency] ${resourceName}.${fieldName} - ` +
        `Consolidation timer started. Next run at ${nextRun.toISOString()} ` +
        `(every ${this.config.consolidationInterval}s)`
      );
    }

    handler.consolidationTimer = setInterval(async () => {
      await this.runConsolidationForHandler(handler, resourceName, fieldName);
    }, intervalMs);
  }

  async runConsolidationForHandler(handler, resourceName, fieldName) {
    // Temporarily swap config to use this handler
    const oldResource = this.config.resource;
    const oldField = this.config.field;
    const oldTransactionResource = this.transactionResource;
    const oldTargetResource = this.targetResource;
    const oldLockResource = this.lockResource;
    const oldAnalyticsResource = this.analyticsResource;

    this.config.resource = resourceName;
    this.config.field = fieldName;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;
    this.lockResource = handler.lockResource;
    this.analyticsResource = handler.analyticsResource;

    try {
      await this.runConsolidation();
    } finally {
      // Restore
      this.config.resource = oldResource;
      this.config.field = oldField;
      this.transactionResource = oldTransactionResource;
      this.targetResource = oldTargetResource;
      this.lockResource = oldLockResource;
      this.analyticsResource = oldAnalyticsResource;
    }
  }

  async runConsolidation() {
    const startTime = Date.now();

    if (this.config.verbose) {
      console.log(
        `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
        `Starting consolidation run at ${new Date().toISOString()}`
      );
    }

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

      if (this.config.verbose) {
        console.log(
          `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
          `Querying ${hoursToCheck} hour partitions for pending transactions...`
        );
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
          console.log(
            `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
            `No pending transactions found. Next run in ${this.config.consolidationInterval}s`
          );
        }
        return;
      }

      // Get unique originalIds
      const uniqueIds = [...new Set(transactions.map(t => t.originalId))];

      if (this.config.verbose) {
        console.log(
          `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
          `Found ${transactions.length} pending transactions for ${uniqueIds.length} records. ` +
          `Consolidating with concurrency=${this.config.consolidationConcurrency}...`
        );
      }

      // Consolidate each record in parallel with concurrency limit
      const { results, errors } = await PromisePool
        .for(uniqueIds)
        .withConcurrency(this.config.consolidationConcurrency)
        .process(async (id) => {
          return await this.consolidateRecord(id);
        });

      const duration = Date.now() - startTime;

      if (errors && errors.length > 0) {
        console.error(
          `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
          `Consolidation completed with ${errors.length} errors in ${duration}ms:`,
          errors
        );
      }

      if (this.config.verbose) {
        console.log(
          `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
          `Consolidation complete: ${results.length} records consolidated in ${duration}ms ` +
          `(${errors.length} errors). Next run in ${this.config.consolidationInterval}s`
        );
      }

      this.emit('eventual-consistency.consolidated', {
        resource: this.config.resource,
        field: this.config.field,
        recordCount: uniqueIds.length,
        successCount: results.length,
        errorCount: errors.length,
        duration
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(
        `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
        `Consolidation error after ${duration}ms:`,
        error
      );
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
        if (this.config.verbose) {
          console.log(
            `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
            `No pending transactions for ${originalId}, skipping`
          );
        }
        return currentValue;
      }

      if (this.config.verbose) {
        console.log(
          `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
          `Consolidating ${originalId}: ${transactions.length} pending transactions ` +
          `(current: ${currentValue})`
        );
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

      if (this.config.verbose) {
        console.log(
          `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
          `${originalId}: ${currentValue} → ${consolidatedValue} ` +
          `(${consolidatedValue > currentValue ? '+' : ''}${consolidatedValue - currentValue})`
        );
      }

      // Update the original record (use optimistic upsert pattern)
      const [updateOk, updateErr] = await tryFn(async () => {
        // Try update first (most common case - record exists)
        const [ok, err] = await tryFn(() =>
          this.targetResource.update(originalId, {
            [this.config.field]: consolidatedValue
          })
        );

        if (ok) {
          // Update succeeded
          return ok;
        }

        // Update failed - check if it's because record doesn't exist
        if (err?.message?.includes('does not exist')) {
          if (this.config.verbose) {
            console.log(
              `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
              `Record ${originalId} doesn't exist, attempting to create with ${this.config.field}=${consolidatedValue}`
            );
          }

          // Try to insert instead
          const [insertOk, insertErr] = await tryFn(() =>
            this.targetResource.insert({
              id: originalId,
              [this.config.field]: consolidatedValue
            })
          );

          if (insertOk) {
            return insertOk;
          }

          // Insert also failed - check if it's due to race condition
          if (insertErr?.message?.includes('already exists')) {
            if (this.config.verbose) {
              console.log(
                `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
                `Record ${originalId} was created by another consolidation during retry, updating instead`
              );
            }
            // Another consolidation created the record, retry update
            return await this.targetResource.update(originalId, {
              [this.config.field]: consolidatedValue
            });
          }

          // Insert failed for another reason (e.g., required fields)
          throw insertErr;
        }

        // Update failed for another reason (not "does not exist")
        throw err;
      });

      if (!updateOk) {
        console.error(
          `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
          `FAILED to update ${originalId}: ${updateErr?.message || updateErr}`,
          { error: updateErr, consolidatedValue, currentValue }
        );
        throw updateErr;
      }

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

        // Update analytics if enabled (only for real transactions, not synthetic)
        if (this.config.enableAnalytics && transactionsToUpdate.length > 0) {
          await this.updateAnalytics(transactionsToUpdate);
        }

        // Invalidate cache for this record after consolidation
        if (this.targetResource && this.targetResource.cache && typeof this.targetResource.cache.delete === 'function') {
          try {
            const cacheKey = await this.targetResource.cacheKeyFor({ id: originalId });
            await this.targetResource.cache.delete(cacheKey);

            if (this.config.verbose) {
              console.log(
                `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
                `Cache invalidated for ${originalId}`
              );
            }
          } catch (cacheErr) {
            // Log but don't fail consolidation if cache invalidation fails
            if (this.config.verbose) {
              console.warn(
                `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
                `Failed to invalidate cache for ${originalId}: ${cacheErr?.message}`
              );
            }
          }
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

  startGarbageCollectionTimerForHandler(handler, resourceName, fieldName) {
    const gcIntervalMs = this.config.gcInterval * 1000; // Convert seconds to ms

    handler.gcTimer = setInterval(async () => {
      await this.runGarbageCollectionForHandler(handler, resourceName, fieldName);
    }, gcIntervalMs);
  }

  async runGarbageCollectionForHandler(handler, resourceName, fieldName) {
    // Temporarily swap config to use this handler
    const oldResource = this.config.resource;
    const oldField = this.config.field;
    const oldTransactionResource = this.transactionResource;
    const oldTargetResource = this.targetResource;
    const oldLockResource = this.lockResource;

    this.config.resource = resourceName;
    this.config.field = fieldName;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;
    this.lockResource = handler.lockResource;

    try {
      await this.runGarbageCollection();
    } finally {
      // Restore
      this.config.resource = oldResource;
      this.config.field = oldField;
      this.transactionResource = oldTransactionResource;
      this.targetResource = oldTargetResource;
      this.lockResource = oldLockResource;
    }
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

  /**
   * Update analytics with consolidated transactions
   * @param {Array} transactions - Array of transactions that were just consolidated
   * @private
   */
  async updateAnalytics(transactions) {
    if (!this.analyticsResource || transactions.length === 0) return;

    if (this.config.verbose) {
      console.log(
        `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
        `Updating analytics for ${transactions.length} transactions...`
      );
    }

    try {
      // Group transactions by cohort hour
      const byHour = this._groupByCohort(transactions, 'cohortHour');
      const cohortCount = Object.keys(byHour).length;

      if (this.config.verbose) {
        console.log(
          `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
          `Updating ${cohortCount} hourly analytics cohorts...`
        );
      }

      // Update hourly analytics
      for (const [cohort, txns] of Object.entries(byHour)) {
        await this._upsertAnalytics('hour', cohort, txns);
      }

      // Roll up to daily and monthly if configured
      if (this.config.analyticsConfig.rollupStrategy === 'incremental') {
        const uniqueHours = Object.keys(byHour);

        if (this.config.verbose) {
          console.log(
            `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
            `Rolling up ${uniqueHours.length} hours to daily/monthly analytics...`
          );
        }

        for (const cohortHour of uniqueHours) {
          await this._rollupAnalytics(cohortHour);
        }
      }

      if (this.config.verbose) {
        console.log(
          `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
          `Analytics update complete for ${cohortCount} cohorts`
        );
      }
    } catch (error) {
      console.warn(
        `[EventualConsistency] ${this.config.resource}.${this.config.field} - ` +
        `Analytics update error:`,
        error.message
      );
    }
  }

  /**
   * Group transactions by cohort
   * @private
   */
  _groupByCohort(transactions, cohortField) {
    const groups = {};
    for (const txn of transactions) {
      const cohort = txn[cohortField];
      if (!cohort) continue;

      if (!groups[cohort]) {
        groups[cohort] = [];
      }
      groups[cohort].push(txn);
    }
    return groups;
  }

  /**
   * Upsert analytics for a specific period and cohort
   * @private
   */
  async _upsertAnalytics(period, cohort, transactions) {
    const id = `${period}-${cohort}`;

    // Calculate metrics
    const transactionCount = transactions.length;

    // Calculate signed values (considering operation type)
    const signedValues = transactions.map(t => {
      if (t.operation === 'sub') return -t.value;
      return t.value;
    });

    const totalValue = signedValues.reduce((sum, v) => sum + v, 0);
    const avgValue = totalValue / transactionCount;
    const minValue = Math.min(...signedValues);
    const maxValue = Math.max(...signedValues);

    // Calculate operation breakdown
    const operations = this._calculateOperationBreakdown(transactions);

    // Count distinct records
    const recordCount = new Set(transactions.map(t => t.originalId)).size;

    const now = new Date().toISOString();

    // Try to get existing analytics
    const [existingOk, existingErr, existing] = await tryFn(() =>
      this.analyticsResource.get(id)
    );

    if (existingOk && existing) {
      // Update existing analytics (incremental)
      const newTransactionCount = existing.transactionCount + transactionCount;
      const newTotalValue = existing.totalValue + totalValue;
      const newAvgValue = newTotalValue / newTransactionCount;
      const newMinValue = Math.min(existing.minValue, minValue);
      const newMaxValue = Math.max(existing.maxValue, maxValue);

      // Merge operation breakdown
      const newOperations = { ...existing.operations };
      for (const [op, stats] of Object.entries(operations)) {
        if (!newOperations[op]) {
          newOperations[op] = { count: 0, sum: 0 };
        }
        newOperations[op].count += stats.count;
        newOperations[op].sum += stats.sum;
      }

      // Update record count (approximate - we don't track all unique IDs)
      const newRecordCount = Math.max(existing.recordCount, recordCount);

      await tryFn(() =>
        this.analyticsResource.update(id, {
          transactionCount: newTransactionCount,
          totalValue: newTotalValue,
          avgValue: newAvgValue,
          minValue: newMinValue,
          maxValue: newMaxValue,
          operations: newOperations,
          recordCount: newRecordCount,
          updatedAt: now
        })
      );
    } else {
      // Create new analytics
      await tryFn(() =>
        this.analyticsResource.insert({
          id,
          period,
          cohort,
          transactionCount,
          totalValue,
          avgValue,
          minValue,
          maxValue,
          operations,
          recordCount,
          consolidatedAt: now,
          updatedAt: now
        })
      );
    }
  }

  /**
   * Calculate operation breakdown
   * @private
   */
  _calculateOperationBreakdown(transactions) {
    const breakdown = {};

    for (const txn of transactions) {
      const op = txn.operation;
      if (!breakdown[op]) {
        breakdown[op] = { count: 0, sum: 0 };
      }
      breakdown[op].count++;

      // Use signed value for sum (sub operations are negative)
      const signedValue = op === 'sub' ? -txn.value : txn.value;
      breakdown[op].sum += signedValue;
    }

    return breakdown;
  }

  /**
   * Roll up hourly analytics to daily and monthly
   * @private
   */
  async _rollupAnalytics(cohortHour) {
    // cohortHour format: '2025-10-09T14'
    const cohortDate = cohortHour.substring(0, 10); // '2025-10-09'
    const cohortMonth = cohortHour.substring(0, 7);  // '2025-10'

    // Roll up to day
    await this._rollupPeriod('day', cohortDate, cohortDate);

    // Roll up to month
    await this._rollupPeriod('month', cohortMonth, cohortMonth);
  }

  /**
   * Roll up analytics for a specific period
   * @private
   */
  async _rollupPeriod(period, cohort, sourcePrefix) {
    // Get all source analytics (e.g., all hours for a day)
    const sourcePeriod = period === 'day' ? 'hour' : 'day';

    const [ok, err, allAnalytics] = await tryFn(() =>
      this.analyticsResource.list()
    );

    if (!ok || !allAnalytics) return;

    // Filter to matching cohorts
    const sourceAnalytics = allAnalytics.filter(a =>
      a.period === sourcePeriod && a.cohort.startsWith(sourcePrefix)
    );

    if (sourceAnalytics.length === 0) return;

    // Aggregate metrics
    const transactionCount = sourceAnalytics.reduce((sum, a) => sum + a.transactionCount, 0);
    const totalValue = sourceAnalytics.reduce((sum, a) => sum + a.totalValue, 0);
    const avgValue = totalValue / transactionCount;
    const minValue = Math.min(...sourceAnalytics.map(a => a.minValue));
    const maxValue = Math.max(...sourceAnalytics.map(a => a.maxValue));

    // Merge operation breakdown
    const operations = {};
    for (const analytics of sourceAnalytics) {
      for (const [op, stats] of Object.entries(analytics.operations || {})) {
        if (!operations[op]) {
          operations[op] = { count: 0, sum: 0 };
        }
        operations[op].count += stats.count;
        operations[op].sum += stats.sum;
      }
    }

    // Approximate record count (max of all periods)
    const recordCount = Math.max(...sourceAnalytics.map(a => a.recordCount));

    const id = `${period}-${cohort}`;
    const now = new Date().toISOString();

    // Upsert rolled-up analytics
    const [existingOk, existingErr, existing] = await tryFn(() =>
      this.analyticsResource.get(id)
    );

    if (existingOk && existing) {
      await tryFn(() =>
        this.analyticsResource.update(id, {
          transactionCount,
          totalValue,
          avgValue,
          minValue,
          maxValue,
          operations,
          recordCount,
          updatedAt: now
        })
      );
    } else {
      await tryFn(() =>
        this.analyticsResource.insert({
          id,
          period,
          cohort,
          transactionCount,
          totalValue,
          avgValue,
          minValue,
          maxValue,
          operations,
          recordCount,
          consolidatedAt: now,
          updatedAt: now
        })
      );
    }
  }

  /**
   * Get analytics for a specific period
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Analytics data
   */
  async getAnalytics(resourceName, field, options = {}) {
    // Get handler for this resource/field combination
    const fieldHandlers = this.fieldHandlers.get(resourceName);
    if (!fieldHandlers) {
      throw new Error(`No eventual consistency configured for resource: ${resourceName}`);
    }

    const handler = fieldHandlers.get(field);
    if (!handler) {
      throw new Error(`No eventual consistency configured for field: ${resourceName}.${field}`);
    }

    if (!handler.analyticsResource) {
      throw new Error('Analytics not enabled for this plugin');
    }

    const { period = 'day', date, startDate, endDate, month, year, breakdown = false } = options;

    const [ok, err, allAnalytics] = await tryFn(() =>
      handler.analyticsResource.list()
    );

    if (!ok || !allAnalytics) {
      return [];
    }

    // Filter by period
    let filtered = allAnalytics.filter(a => a.period === period);

    // Filter by date/range
    if (date) {
      if (period === 'hour') {
        // Match all hours of the date
        filtered = filtered.filter(a => a.cohort.startsWith(date));
      } else {
        filtered = filtered.filter(a => a.cohort === date);
      }
    } else if (startDate && endDate) {
      filtered = filtered.filter(a => a.cohort >= startDate && a.cohort <= endDate);
    } else if (month) {
      filtered = filtered.filter(a => a.cohort.startsWith(month));
    } else if (year) {
      filtered = filtered.filter(a => a.cohort.startsWith(String(year)));
    }

    // Sort by cohort
    filtered.sort((a, b) => a.cohort.localeCompare(b.cohort));

    // Return with or without breakdown
    if (breakdown === 'operations') {
      return filtered.map(a => ({
        cohort: a.cohort,
        ...a.operations
      }));
    }

    return filtered.map(a => ({
      cohort: a.cohort,
      count: a.transactionCount,
      sum: a.totalValue,
      avg: a.avgValue,
      min: a.minValue,
      max: a.maxValue,
      operations: a.operations,
      recordCount: a.recordCount
    }));
  }

  /**
   * Fill gaps in analytics data with zeros for continuous time series
   * @private
   * @param {Array} data - Sparse analytics data
   * @param {string} period - Period type ('hour', 'day', 'month')
   * @param {string} startDate - Start date (ISO format)
   * @param {string} endDate - End date (ISO format)
   * @returns {Array} Complete time series with gaps filled
   */
  _fillGaps(data, period, startDate, endDate) {
    if (!data || data.length === 0) {
      // If no data, still generate empty series
      data = [];
    }

    // Create a map of existing data by cohort
    const dataMap = new Map();
    data.forEach(item => {
      dataMap.set(item.cohort, item);
    });

    const result = [];
    const emptyRecord = {
      count: 0,
      sum: 0,
      avg: 0,
      min: 0,
      max: 0,
      recordCount: 0
    };

    if (period === 'hour') {
      // Generate all hours between startDate and endDate
      const start = new Date(startDate + 'T00:00:00Z');
      const end = new Date(endDate + 'T23:59:59Z');

      for (let dt = new Date(start); dt <= end; dt.setHours(dt.getHours() + 1)) {
        const cohort = dt.toISOString().substring(0, 13); // YYYY-MM-DDTHH
        result.push(dataMap.get(cohort) || { cohort, ...emptyRecord });
      }
    } else if (period === 'day') {
      // Generate all days between startDate and endDate
      const start = new Date(startDate);
      const end = new Date(endDate);

      for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
        const cohort = dt.toISOString().substring(0, 10); // YYYY-MM-DD
        result.push(dataMap.get(cohort) || { cohort, ...emptyRecord });
      }
    } else if (period === 'month') {
      // Generate all months between startDate and endDate
      const startYear = parseInt(startDate.substring(0, 4));
      const startMonth = parseInt(startDate.substring(5, 7));
      const endYear = parseInt(endDate.substring(0, 4));
      const endMonth = parseInt(endDate.substring(5, 7));

      for (let year = startYear; year <= endYear; year++) {
        const firstMonth = (year === startYear) ? startMonth : 1;
        const lastMonth = (year === endYear) ? endMonth : 12;

        for (let month = firstMonth; month <= lastMonth; month++) {
          const cohort = `${year}-${month.toString().padStart(2, '0')}`;
          result.push(dataMap.get(cohort) || { cohort, ...emptyRecord });
        }
      }
    }

    return result;
  }

  /**
   * Get analytics for entire month, broken down by days
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {string} month - Month in YYYY-MM format
   * @param {Object} options - Options
   * @param {boolean} options.fillGaps - Fill missing days with zeros (default: false)
   * @returns {Promise<Array>} Daily analytics for the month
   */
  async getMonthByDay(resourceName, field, month, options = {}) {
    // month format: '2025-10'
    const year = parseInt(month.substring(0, 4));
    const monthNum = parseInt(month.substring(5, 7));

    // Get first and last day of month
    const firstDay = new Date(year, monthNum - 1, 1);
    const lastDay = new Date(year, monthNum, 0);

    const startDate = firstDay.toISOString().substring(0, 10);
    const endDate = lastDay.toISOString().substring(0, 10);

    const data = await this.getAnalytics(resourceName, field, {
      period: 'day',
      startDate,
      endDate
    });

    if (options.fillGaps) {
      return this._fillGaps(data, 'day', startDate, endDate);
    }

    return data;
  }

  /**
   * Get analytics for entire day, broken down by hours
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Object} options - Options
   * @param {boolean} options.fillGaps - Fill missing hours with zeros (default: false)
   * @returns {Promise<Array>} Hourly analytics for the day
   */
  async getDayByHour(resourceName, field, date, options = {}) {
    // date format: '2025-10-09'
    const data = await this.getAnalytics(resourceName, field, {
      period: 'hour',
      date
    });

    if (options.fillGaps) {
      return this._fillGaps(data, 'hour', date, date);
    }

    return data;
  }

  /**
   * Get analytics for last N days, broken down by days
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {number} days - Number of days to look back (default: 7)
   * @param {Object} options - Options
   * @param {boolean} options.fillGaps - Fill missing days with zeros (default: false)
   * @returns {Promise<Array>} Daily analytics
   */
  async getLastNDays(resourceName, field, days = 7, options = {}) {
    const dates = Array.from({ length: days }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().substring(0, 10);
    }).reverse();

    const data = await this.getAnalytics(resourceName, field, {
      period: 'day',
      startDate: dates[0],
      endDate: dates[dates.length - 1]
    });

    if (options.fillGaps) {
      return this._fillGaps(data, 'day', dates[0], dates[dates.length - 1]);
    }

    return data;
  }

  /**
   * Get analytics for entire year, broken down by months
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {number} year - Year (e.g., 2025)
   * @param {Object} options - Options
   * @param {boolean} options.fillGaps - Fill missing months with zeros (default: false)
   * @returns {Promise<Array>} Monthly analytics for the year
   */
  async getYearByMonth(resourceName, field, year, options = {}) {
    const data = await this.getAnalytics(resourceName, field, {
      period: 'month',
      year
    });

    if (options.fillGaps) {
      const startDate = `${year}-01`;
      const endDate = `${year}-12`;
      return this._fillGaps(data, 'month', startDate, endDate);
    }

    return data;
  }

  /**
   * Get analytics for entire month, broken down by hours
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {string} month - Month in YYYY-MM format (or 'last' for previous month)
   * @param {Object} options - Options
   * @param {boolean} options.fillGaps - Fill missing hours with zeros (default: false)
   * @returns {Promise<Array>} Hourly analytics for the month (up to 24*31=744 records)
   */
  async getMonthByHour(resourceName, field, month, options = {}) {
    // month format: '2025-10' or 'last'
    let year, monthNum;

    if (month === 'last') {
      const now = new Date();
      now.setMonth(now.getMonth() - 1);
      year = now.getFullYear();
      monthNum = now.getMonth() + 1;
    } else {
      year = parseInt(month.substring(0, 4));
      monthNum = parseInt(month.substring(5, 7));
    }

    // Get first and last day of month
    const firstDay = new Date(year, monthNum - 1, 1);
    const lastDay = new Date(year, monthNum, 0);

    const startDate = firstDay.toISOString().substring(0, 10);
    const endDate = lastDay.toISOString().substring(0, 10);

    const data = await this.getAnalytics(resourceName, field, {
      period: 'hour',
      startDate,
      endDate
    });

    if (options.fillGaps) {
      return this._fillGaps(data, 'hour', startDate, endDate);
    }

    return data;
  }

  /**
   * Get top records by volume
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Top records
   */
  async getTopRecords(resourceName, field, options = {}) {
    // Get handler for this resource/field combination
    const fieldHandlers = this.fieldHandlers.get(resourceName);
    if (!fieldHandlers) {
      throw new Error(`No eventual consistency configured for resource: ${resourceName}`);
    }

    const handler = fieldHandlers.get(field);
    if (!handler) {
      throw new Error(`No eventual consistency configured for field: ${resourceName}.${field}`);
    }

    if (!handler.transactionResource) {
      throw new Error('Transaction resource not initialized');
    }

    const { period = 'day', date, metric = 'transactionCount', limit = 10 } = options;

    // Get all transactions for the period
    const [ok, err, transactions] = await tryFn(() =>
      handler.transactionResource.list()
    );

    if (!ok || !transactions) {
      return [];
    }

    // Filter by date
    let filtered = transactions;
    if (date) {
      if (period === 'hour') {
        filtered = transactions.filter(t => t.cohortHour && t.cohortHour.startsWith(date));
      } else if (period === 'day') {
        filtered = transactions.filter(t => t.cohortDate === date);
      } else if (period === 'month') {
        filtered = transactions.filter(t => t.cohortMonth && t.cohortMonth.startsWith(date));
      }
    }

    // Group by originalId
    const byRecord = {};
    for (const txn of filtered) {
      const recordId = txn.originalId;
      if (!byRecord[recordId]) {
        byRecord[recordId] = { count: 0, sum: 0 };
      }
      byRecord[recordId].count++;
      byRecord[recordId].sum += txn.value;
    }

    // Convert to array and sort
    const records = Object.entries(byRecord).map(([recordId, stats]) => ({
      recordId,
      count: stats.count,
      sum: stats.sum
    }));

    // Sort by metric
    records.sort((a, b) => {
      if (metric === 'transactionCount') {
        return b.count - a.count;
      } else if (metric === 'totalValue') {
        return b.sum - a.sum;
      }
      return 0;
    });

    // Limit results
    return records.slice(0, limit);
  }
}

export default EventualConsistencyPlugin;