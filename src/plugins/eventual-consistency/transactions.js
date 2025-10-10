/**
 * Transaction management for EventualConsistencyPlugin
 * @module eventual-consistency/transactions
 */

import { idGenerator } from "../../concerns/id.js";
import { getCohortInfo } from "./utils.js";

/**
 * Create a transaction for a field handler
 *
 * @param {Object} handler - Field handler
 * @param {Object} data - Transaction data
 * @param {Object} config - Plugin configuration
 * @returns {Promise<Object|null>} Created transaction or null if ignored
 */
export async function createTransaction(handler, data, config) {
  const now = new Date();
  const cohortInfo = getCohortInfo(now, config.cohort.timezone, config.verbose);

  // Check for late arrivals (transaction older than watermark)
  const watermarkMs = config.consolidationWindow * 60 * 60 * 1000;
  const watermarkTime = now.getTime() - watermarkMs;
  const cohortHourDate = new Date(cohortInfo.hour + ':00:00Z');

  if (cohortHourDate.getTime() < watermarkTime) {
    // Late arrival detected!
    const hoursLate = Math.floor((now.getTime() - cohortHourDate.getTime()) / (60 * 60 * 1000));

    if (config.lateArrivalStrategy === 'ignore') {
      if (config.verbose) {
        console.warn(
          `[EventualConsistency] Late arrival ignored: transaction for ${cohortInfo.hour} ` +
          `is ${hoursLate}h late (watermark: ${config.consolidationWindow}h)`
        );
      }
      return null;
    } else if (config.lateArrivalStrategy === 'warn') {
      console.warn(
        `[EventualConsistency] Late arrival detected: transaction for ${cohortInfo.hour} ` +
        `is ${hoursLate}h late (watermark: ${config.consolidationWindow}h). ` +
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
  if (config.batchTransactions) {
    handler.pendingTransactions.set(transaction.id, transaction);

    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${handler.resource}.${handler.field} - ` +
        `Transaction batched: ${data.operation} ${data.value} for ${data.originalId} ` +
        `(batch: ${handler.pendingTransactions.size}/${config.batchSize})`
      );
    }

    // Flush if batch size reached
    if (handler.pendingTransactions.size >= config.batchSize) {
      await flushPendingTransactions(handler);
    }
  } else {
    await handler.transactionResource.insert(transaction);

    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${handler.resource}.${handler.field} - ` +
        `Transaction created: ${data.operation} ${data.value} for ${data.originalId} ` +
        `(cohort: ${cohortInfo.hour}, applied: false)`
      );
    }
  }

  return transaction;
}

/**
 * Flush pending transactions for a handler
 *
 * @param {Object} handler - Field handler with pending transactions
 * @throws {Error} If flush fails
 */
export async function flushPendingTransactions(handler) {
  if (handler.pendingTransactions.size === 0) return;

  const transactions = Array.from(handler.pendingTransactions.values());

  try {
    // Insert all pending transactions in parallel
    await Promise.all(
      transactions.map(transaction =>
        handler.transactionResource.insert(transaction)
      )
    );

    // Only clear after successful inserts (prevents data loss on crashes)
    handler.pendingTransactions.clear();
  } catch (error) {
    // Keep pending transactions for retry on next flush
    console.error('Failed to flush pending transactions:', error);
    throw error;
  }
}
