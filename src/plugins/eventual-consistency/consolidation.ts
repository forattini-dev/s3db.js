/**
 * Consolidation logic for EventualConsistencyPlugin
 * @module eventual-consistency/consolidation
 */

import tryFn from '../../concerns/try-fn.js';
import { TasksPool } from '../../tasks/tasks-pool.class.js';
import { getCronManager } from '../../concerns/cron-manager.js';
import { PluginError } from '../../errors.js';
import {
  type Transaction,
  type FieldHandler,
  getCohortHoursWindow,
  getNestedValue,
  setNestedValue
} from './utils.js';
import type { NormalizedConfig } from './config.js';
import type { PluginStorage } from './locks.js';
import { updateAnalytics, type UpdateAnalyticsConfig } from './analytics.js';

export type RunConsolidationCallback = (
  handler: FieldHandler,
  resourceName: string,
  fieldName: string
) => Promise<ConsolidationResult>;

export type EmitFunction = (event: string, data: any) => void;

export interface ConsolidationResult {
  success: boolean;
  recordsProcessed: number;
  transactionsApplied: number;
  errors: Error[];
}

export interface CohortStats {
  cohort: string;
  pending: number;
  applied: number;
  total: number;
}

function getTransactionQueryPageSize(config: NormalizedConfig): number {
  return Math.max(25, Math.min(200, config.ticketScanPageSize || 100));
}

async function scanTransactionsByFilter(
  transactionResource: NonNullable<FieldHandler['transactionResource']>,
  filter: Record<string, any>,
  config: NormalizedConfig,
  onTransaction: (transaction: Transaction) => Promise<boolean | void> | (boolean | void)
): Promise<number> {
  const pageSize = getTransactionQueryPageSize(config);
  let offset = 0;
  let scanned = 0;

  while (true) {
    const batch = await transactionResource.query(filter, {
      limit: pageSize,
      offset
    });

    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    for (const transaction of batch as Transaction[]) {
      scanned += 1;
      const stop = await Promise.resolve(onTransaction(transaction));
      if (stop) {
        return scanned;
      }
    }

    if (batch.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return scanned;
}

async function countTransactionsByFilter(
  transactionResource: NonNullable<FieldHandler['transactionResource']>,
  filter: Record<string, any>,
  config: NormalizedConfig
): Promise<number> {
  let total = 0;
  await scanTransactionsByFilter(transactionResource, filter, config, () => {
    total += 1;
  });
  return total;
}

/**
 * Start consolidation timer for a handler
 *
 * @param handler - Field handler
 * @param resourceName - Resource name
 * @param fieldName - Field name
 * @param runConsolidationFn - Callback to run consolidation
 * @param config - Plugin configuration
 * @returns Consolidation job name
 */
export function startConsolidationTimer(
  handler: FieldHandler,
  resourceName: string,
  fieldName: string,
  runConsolidationFn: RunConsolidationCallback,
  config: NormalizedConfig
): string {
  const intervalMs = config.consolidationInterval * 1000;
  const cronManager = getCronManager();
  const jobName = `consolidate-${resourceName}-${fieldName}-${Date.now()}`;

  cronManager.scheduleInterval(
    intervalMs,
    async () => {
      await runConsolidationFn(handler, resourceName, fieldName);
    },
    jobName
  );

  handler.consolidationJobName = jobName;
  return jobName;
}

/**
 * Run consolidation for a field handler
 *
 * @param handler - Field handler
 * @param storage - PluginStorage instance for locks
 * @param config - Plugin configuration
 * @param emitFn - Function to emit events
 * @returns Consolidation result
 */
export async function runConsolidation(
  handler: FieldHandler,
  storage: PluginStorage,
  config: NormalizedConfig,
  emitFn?: EmitFunction
): Promise<ConsolidationResult> {
  const result: ConsolidationResult = {
    success: true,
    recordsProcessed: 0,
    transactionsApplied: 0,
    errors: []
  };

  const resourceName = handler.resource;
  const fieldName = handler.field;

  const lockKey = `consolidate-${resourceName}-${fieldName}`;
  const lock = await storage.acquireLock(lockKey, {
    ttl: 300,
    timeout: 0,
    workerId: process.pid ? String(process.pid) : 'unknown'
  });

  if (!lock) {
    return result;
  }

  try {
    const cohortHours = getCohortHoursWindow(
      config.consolidationWindow,
      config.cohort.timezone
    );

    const allTransactions: Transaction[] = [];
    const transactionResource = handler.transactionResource as NonNullable<FieldHandler['transactionResource']>;

    for (const cohortHour of cohortHours) {
      try {
        await scanTransactionsByFilter(
          transactionResource,
          { cohortHour, applied: false },
          config,
          (transaction) => {
            allTransactions.push(transaction);
          }
        );
      } catch (err) {
        // If one cohort query fails, keep processing other cohorts and continue
        // with the transactions already collected.
      }
    }

    if (allTransactions.length === 0) {
      return result;
    }

    const byOriginalId = groupByOriginalId(allTransactions);

    const { results, errors } = await TasksPool.map(
      Object.entries(byOriginalId),
      async ([originalId, transactions]) => {
        return consolidateRecord(
          handler,
          originalId,
          transactions,
          config
        );
      },
      { concurrency: 10 }
    );

    for (const recordResult of results) {
      if (recordResult) {
        result.recordsProcessed++;
        result.transactionsApplied += recordResult.transactionsApplied;
      }
    }

    result.errors = errors.map(e => e.error);
    result.success = errors.length === 0;

    if (config.enableAnalytics && handler.analyticsResource) {
      const analyticsConfig: UpdateAnalyticsConfig = {
        resource: resourceName,
        field: fieldName,
        analyticsConfig: config.analyticsConfig,
        cohort: config.cohort,
        logLevel: config.logLevel,
        transactionResource: handler.transactionResource
      };
      await updateAnalytics(allTransactions, handler.analyticsResource, analyticsConfig);
    }

    if (emitFn) {
      emitFn('plg:eventual-consistency:consolidation-completed', {
        resource: resourceName,
        field: fieldName,
        recordsProcessed: result.recordsProcessed,
        transactionsApplied: result.transactionsApplied,
        errorCount: errors.length
      });
    }
  } catch (error: any) {
    result.success = false;
    result.errors.push(error);

    if (emitFn) {
      emitFn('plg:eventual-consistency:consolidation-error', {
        resource: resourceName,
        field: fieldName,
        error: error.message
      });
    }
  } finally {
    if (lock) {
      await tryFn(() => storage.releaseLock(lock));
    }
  }

  return result;
}

/**
 * Group transactions by originalId
 */
function groupByOriginalId(transactions: Transaction[]): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {};

  for (const txn of transactions) {
    const id = txn.originalId;
    if (!groups[id]) {
      groups[id] = [];
    }
    groups[id].push(txn);
  }

  return groups;
}

export interface RecordConsolidationResult {
  originalId: string;
  transactionsApplied: number;
  newValue: number;
}

/**
 * Consolidate transactions for a single record
 *
 * @param handler - Field handler
 * @param originalId - Record ID
 * @param transactions - Transactions to consolidate
 * @param config - Plugin configuration
 * @returns Consolidation result for this record
 */
export async function consolidateRecord(
  handler: FieldHandler,
  originalId: string,
  transactions: Transaction[],
  config: NormalizedConfig
): Promise<RecordConsolidationResult | null> {
  if (transactions.length === 0) {
    return null;
  }

  const fieldName = handler.field;
  const fieldPath = handler.fieldPath;
  const reducer = handler.reducer;
  const initialValue = handler.initialValue;

  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const setOperations = sortedTransactions.filter(t => t.operation === 'set');
  const lastSet = setOperations.length > 0 ? setOperations[setOperations.length - 1] : null;

  let baseValue: number;
  let relevantTransactions: Transaction[];

  if (lastSet) {
    baseValue = lastSet.value;
    relevantTransactions = sortedTransactions.filter(
      t => new Date(t.timestamp).getTime() > new Date(lastSet.timestamp).getTime()
    );
  } else {
    const [recordOk, , record] = await tryFn(() =>
      handler.targetResource.get(originalId)
    );

    if (recordOk && record) {
      if (fieldPath) {
        baseValue = getNestedValue(record, fieldPath) ?? initialValue;
      } else {
        baseValue = record[fieldName] ?? initialValue;
      }
    } else {
      baseValue = initialValue;
    }

    relevantTransactions = sortedTransactions;
  }

  let newValue = baseValue;
  for (const txn of relevantTransactions) {
    if (txn.operation === 'set') {
      newValue = txn.value;
    } else if (txn.operation === 'add') {
      newValue = reducer(newValue, txn.value);
    } else if (txn.operation === 'sub') {
      newValue = reducer(newValue, -txn.value);
    }
  }

  const [updateOk, updateErr] = await tryFn(async () => {
    const [recordOk, , existingRecord] = await tryFn(() =>
      handler.targetResource.get(originalId)
    );

    if (recordOk && existingRecord) {
      if (fieldPath) {
        const updateData = { ...existingRecord };
        setNestedValue(updateData, fieldPath, newValue);
        delete updateData.id;
        await handler.targetResource.update(originalId, updateData);
      } else {
        await handler.targetResource.update(originalId, { [fieldName]: newValue });
      }
    } else {
      const newRecord: Record<string, any> = { id: originalId };
      if (fieldPath) {
        setNestedValue(newRecord, fieldPath, newValue);
      } else {
        newRecord[fieldName] = newValue;
      }
      await handler.targetResource.insert(newRecord);
    }
  });

  if (!updateOk) {
    throw new PluginError(`Failed to update record ${originalId}: ${updateErr?.message}`, {
      pluginName: 'EventualConsistencyPlugin',
      operation: 'consolidateRecord',
      statusCode: 500,
      retriable: true,
      originalId,
      field: fieldName
    });
  }

  await Promise.all(
    transactions.map(txn =>
      tryFn(() => handler.transactionResource!.update(txn.id, { applied: true }))
    )
  );

  return {
    originalId,
    transactionsApplied: transactions.length,
    newValue
  };
}

/**
 * Get consolidated value for a record
 *
 * @param handler - Field handler
 * @param originalId - Record ID
 * @returns Consolidated value
 */
export async function getConsolidatedValue(
  handler: FieldHandler,
  originalId: string
): Promise<number> {
  const fieldName = handler.field;
  const fieldPath = handler.fieldPath;
  const initialValue = handler.initialValue;
  const reducer = handler.reducer;

  const [recordOk, , record] = await tryFn(() =>
    handler.targetResource.get(originalId)
  );

  let baseValue: number;
  if (recordOk && record) {
    if (fieldPath) {
      baseValue = getNestedValue(record, fieldPath) ?? initialValue;
    } else {
      baseValue = record[fieldName] ?? initialValue;
    }
  } else {
    baseValue = initialValue;
  }

  let pendingTransactions: Transaction[] = [];
  const [txOk] = await tryFn(async () => {
    const txs: Transaction[] = [];
    await scanTransactionsByFilter(
      handler.transactionResource as NonNullable<FieldHandler['transactionResource']>,
      {
        originalId,
        applied: false
      },
      handler.config,
      (transaction) => {
        txs.push(transaction);
      }
    );
    pendingTransactions = txs;
  });

  if (!txOk || !pendingTransactions || pendingTransactions.length === 0) {
    return baseValue;
  }

  const sorted = [...pendingTransactions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const setOps = sorted.filter(t => t.operation === 'set');
  const lastSet = setOps.length > 0 ? setOps[setOps.length - 1] : null;

  let value: number;
  let relevantTxns: Transaction[];

  if (lastSet) {
    value = lastSet.value;
    relevantTxns = sorted.filter(
      t => new Date(t.timestamp).getTime() > new Date(lastSet.timestamp).getTime()
    );
  } else {
    value = baseValue;
    relevantTxns = sorted;
  }

  for (const txn of relevantTxns) {
    if (txn.operation === 'set') {
      value = txn.value;
    } else if (txn.operation === 'add') {
      value = reducer(value, txn.value);
    } else if (txn.operation === 'sub') {
      value = reducer(value, -txn.value);
    }
  }

  return value;
}

/**
 * Get cohort statistics for a handler
 *
 * @param handler - Field handler
 * @param config - Plugin configuration
 * @returns Array of cohort statistics
 */
export async function getCohortStats(
  handler: FieldHandler,
  config: NormalizedConfig
): Promise<CohortStats[]> {
  const cohortHours = getCohortHoursWindow(
    config.consolidationWindow,
    config.cohort.timezone
  );

  const stats: CohortStats[] = [];

  for (const cohortHour of cohortHours) {
    const [pendingOk, , pendingCount] = await tryFn(() =>
      countTransactionsByFilter(
        handler.transactionResource as NonNullable<FieldHandler['transactionResource']>,
        {
          cohortHour,
          applied: false
        },
        config
      )
    ) as [boolean, Error | null, number | null];

    const [appliedOk, , appliedCount] = await tryFn(() =>
      countTransactionsByFilter(
        handler.transactionResource as NonNullable<FieldHandler['transactionResource']>,
        {
          cohortHour,
          applied: true
        },
        config
      )
    ) as [boolean, Error | null, number | null];

    const pendingTotal = pendingOk && typeof pendingCount === 'number' ? pendingCount : 0;
    const appliedTotal = appliedOk && typeof appliedCount === 'number' ? appliedCount : 0;

    stats.push({
      cohort: cohortHour,
      pending: pendingTotal,
      applied: appliedTotal,
      total: pendingTotal + appliedTotal
    });
  }

  return stats;
}

/**
 * Recalculate a record's value from all transactions
 *
 * @param handler - Field handler
 * @param originalId - Record ID
 * @returns Recalculated value
 */
export async function recalculateRecord(
  handler: FieldHandler,
  originalId: string
): Promise<number> {
  const fieldName = handler.field;
  const fieldPath = handler.fieldPath;
  const initialValue = handler.initialValue;
  const reducer = handler.reducer;

  const [txOk, , allTransactions] = await tryFn(async () => {
    const txs: Transaction[] = [];
    await scanTransactionsByFilter(
      handler.transactionResource as NonNullable<FieldHandler['transactionResource']>,
      { originalId },
      handler.config,
      (transaction) => {
        txs.push(transaction);
      }
    );
    return txs;
  }) as [boolean, Error | null, Transaction[] | null];

  if (!txOk || !allTransactions || allTransactions.length === 0) {
    return initialValue;
  }

  const sorted = [...allTransactions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const setOps = sorted.filter(t => t.operation === 'set');
  const lastSet = setOps.length > 0 ? setOps[setOps.length - 1] : null;

  let value: number;
  let relevantTxns: Transaction[];

  if (lastSet) {
    value = lastSet.value;
    relevantTxns = sorted.filter(
      t => new Date(t.timestamp).getTime() > new Date(lastSet.timestamp).getTime()
    );
  } else {
    value = initialValue;
    relevantTxns = sorted;
  }

  for (const txn of relevantTxns) {
    if (txn.operation === 'set') {
      value = txn.value;
    } else if (txn.operation === 'add') {
      value = reducer(value, txn.value);
    } else if (txn.operation === 'sub') {
      value = reducer(value, -txn.value);
    }
  }

  const [updateOk, updateErr] = await tryFn(async () => {
    const [recordOk, recordErr, existingRecord] = await tryFn(() =>
      handler.targetResource.get(originalId)
    );

    if (recordOk && existingRecord) {
      if (fieldPath) {
        const updateData = { ...existingRecord };
        setNestedValue(updateData, fieldPath, value);
        delete updateData.id;
        await handler.targetResource.update(originalId, updateData);
      } else {
        await handler.targetResource.update(originalId, { [fieldName]: value });
      }
    }
  });

  return value;
}
