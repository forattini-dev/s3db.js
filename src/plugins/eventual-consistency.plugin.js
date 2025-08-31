import Plugin from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";

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
    
    this.config = {
      resource: options.resource,
      field: options.field,
      cohort: {
        interval: options.cohort?.interval || '24h',
        timezone: options.cohort?.timezone || 'UTC',
        ...options.cohort
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
      consolidationInterval: options.consolidationInterval || 3600000, // 1 hour default
      autoConsolidate: options.autoConsolidate !== false,
      batchTransactions: options.batchTransactions || false,
      batchSize: options.batchSize || 100,
      mode: options.mode || 'async', // 'async' or 'sync'
      ...options
    };
    
    this.transactionResource = null;
    this.targetResource = null;
    this.consolidationTimer = null;
    this.pendingTransactions = new Map(); // Cache for batching
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
          cohortDate: 'string|required', // For partitioning
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
    
    // Add helper methods to the resource
    this.addHelperMethods();
    
    // Setup consolidation if enabled
    if (this.config.autoConsolidate) {
      this.startConsolidationTimer();
    }
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
    
    // Flush pending transactions
    await this.flushPendingTransactions();
    
    this.emit('eventual-consistency.stopped', {
      resource: this.config.resource,
      field: this.config.field
    });
  }

  createPartitionConfig() {
    // Always create both daily and monthly partitions for transactions
    const partitions = {
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
      // Check if there are multiple fields with eventual consistency
      const hasMultipleFields = Object.keys(resource._eventualConsistencyPlugins).length > 1;
      
      // If multiple fields exist and only 2 params given, throw error
      if (hasMultipleFields && value === undefined) {
        throw new Error(`Multiple fields have eventual consistency. Please specify the field: set(id, field, value)`);
      }
      
      // Handle both signatures: set(id, value) and set(id, field, value)
      const field = value !== undefined ? fieldOrValue : defaultField;
      const actualValue = value !== undefined ? value : fieldOrValue;
      const fieldPlugin = resource._eventualConsistencyPlugins[field];
      
      if (!fieldPlugin) {
        throw new Error(`No eventual consistency plugin found for field "${field}"`);
      }
      
      // Create set transaction
      await fieldPlugin.createTransaction({
        originalId: id,
        operation: 'set',
        value: actualValue,
        source: 'set'
      });
      
      // In sync mode, immediately consolidate and update
      if (fieldPlugin.config.mode === 'sync') {
        const consolidatedValue = await fieldPlugin.consolidateRecord(id);
        await resource.update(id, {
          [field]: consolidatedValue
        });
        return consolidatedValue;
      }
      
      return actualValue;
    };
    
    // Add method to increment value
    resource.add = async (id, fieldOrAmount, amount) => {
      // Check if there are multiple fields with eventual consistency
      const hasMultipleFields = Object.keys(resource._eventualConsistencyPlugins).length > 1;
      
      // If multiple fields exist and only 2 params given, throw error
      if (hasMultipleFields && amount === undefined) {
        throw new Error(`Multiple fields have eventual consistency. Please specify the field: add(id, field, amount)`);
      }
      
      // Handle both signatures: add(id, amount) and add(id, field, amount)
      const field = amount !== undefined ? fieldOrAmount : defaultField;
      const actualAmount = amount !== undefined ? amount : fieldOrAmount;
      const fieldPlugin = resource._eventualConsistencyPlugins[field];
      
      if (!fieldPlugin) {
        throw new Error(`No eventual consistency plugin found for field "${field}"`);
      }
      
      // Create add transaction
      await fieldPlugin.createTransaction({
        originalId: id,
        operation: 'add',
        value: actualAmount,
        source: 'add'
      });
      
      // In sync mode, immediately consolidate and update
      if (fieldPlugin.config.mode === 'sync') {
        const consolidatedValue = await fieldPlugin.consolidateRecord(id);
        await resource.update(id, {
          [field]: consolidatedValue
        });
        return consolidatedValue;
      }
      
      // In async mode, return expected value (for user feedback)
      const currentValue = await fieldPlugin.getConsolidatedValue(id);
      return currentValue + actualAmount;
    };
    
    // Add method to decrement value
    resource.sub = async (id, fieldOrAmount, amount) => {
      // Check if there are multiple fields with eventual consistency
      const hasMultipleFields = Object.keys(resource._eventualConsistencyPlugins).length > 1;
      
      // If multiple fields exist and only 2 params given, throw error
      if (hasMultipleFields && amount === undefined) {
        throw new Error(`Multiple fields have eventual consistency. Please specify the field: sub(id, field, amount)`);
      }
      
      // Handle both signatures: sub(id, amount) and sub(id, field, amount)
      const field = amount !== undefined ? fieldOrAmount : defaultField;
      const actualAmount = amount !== undefined ? amount : fieldOrAmount;
      const fieldPlugin = resource._eventualConsistencyPlugins[field];
      
      if (!fieldPlugin) {
        throw new Error(`No eventual consistency plugin found for field "${field}"`);
      }
      
      // Create sub transaction
      await fieldPlugin.createTransaction({
        originalId: id,
        operation: 'sub',
        value: actualAmount,
        source: 'sub'
      });
      
      // In sync mode, immediately consolidate and update
      if (fieldPlugin.config.mode === 'sync') {
        const consolidatedValue = await fieldPlugin.consolidateRecord(id);
        await resource.update(id, {
          [field]: consolidatedValue
        });
        return consolidatedValue;
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
    
    const transaction = {
      id: `txn-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      originalId: data.originalId,
      field: this.config.field,
      value: data.value || 0,
      operation: data.operation || 'set',
      timestamp: now.toISOString(),
      cohortDate: cohortInfo.date,
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
    this.pendingTransactions.clear();
    
    // Insert all pending transactions
    for (const transaction of transactions) {
      await this.transactionResource.insert(transaction);
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
    
    return {
      date: `${year}-${month}-${day}`,
      month: `${year}-${month}`
    };
  }

  getTimezoneOffset(timezone) {
    // Simplified timezone offset calculation
    // In production, use a proper timezone library
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
    
    return offsets[timezone] || 0;
  }

  startConsolidationTimer() {
    const interval = this.config.consolidationInterval;
    
    this.consolidationTimer = setInterval(async () => {
      await this.runConsolidation();
    }, interval);
  }

  async runConsolidation() {
    try {
      // Get all unique originalIds from transactions that need consolidation
      const [ok, err, transactions] = await tryFn(() =>
        this.transactionResource.query({
          applied: false
        })
      );
      
      if (!ok) {
        console.error('Consolidation failed to query transactions:', err);
        return;
      }
      
      // Get unique originalIds
      const uniqueIds = [...new Set(transactions.map(t => t.originalId))];
      
      // Consolidate each record
      for (const id of uniqueIds) {
        await this.consolidateRecord(id);
      }
      
      this.emit('eventual-consistency.consolidated', {
        resource: this.config.resource,
        field: this.config.field,
        recordCount: uniqueIds.length
      });
    } catch (error) {
      console.error('Consolidation error:', error);
      this.emit('eventual-consistency.consolidation-error', error);
    }
  }

  async consolidateRecord(originalId) {
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
      transactions.unshift({
        id: '__synthetic__', // Synthetic ID that we'll skip when marking as applied
        operation: 'set',
        value: currentValue,
        timestamp: new Date(0).toISOString() // Very old timestamp to ensure it's first
      });
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
      // Mark transactions as applied (skip synthetic ones)
      for (const txn of transactions) {
        if (txn.id !== '__synthetic__') {
          await this.transactionResource.update(txn.id, {
            applied: true
          });
        }
      }
    }
    
    return consolidatedValue;
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
}

export default EventualConsistencyPlugin;