/**
 * Transaction management for EventualConsistencyPlugin
 * @module eventual-consistency/transactions
 */
import tryFn from '../../concerns/try-fn.js';
import { getCohortInfo, generateTransactionId } from './utils.js';
/**
 * Create a transaction record
 *
 * @param handler - Field handler
 * @param params - Transaction parameters
 * @returns Created transaction
 */
export async function createTransaction(handler, params) {
    const { originalId, field, fieldPath, value, operation, options = {} } = params;
    const config = handler.config;
    const now = new Date();
    const timestamp = now.toISOString();
    const cohortInfo = getCohortInfo(timestamp, config.cohort.timezone);
    const transaction = {
        id: generateTransactionId(),
        originalId,
        field,
        value,
        operation,
        timestamp,
        cohortDate: cohortInfo.cohortDate,
        cohortHour: cohortInfo.cohortHour,
        cohortWeek: cohortInfo.cohortWeek,
        cohortMonth: cohortInfo.cohortMonth,
        applied: false
    };
    if (fieldPath) {
        transaction.fieldPath = fieldPath;
    }
    if (options.source) {
        transaction.source = options.source;
    }
    if (config.mode === 'sync') {
        const [ok, err, result] = await tryFn(() => handler.transactionResource.insert(transaction));
        if (!ok) {
            throw new Error(`Failed to create transaction: ${err?.message}`);
        }
        return result;
    }
    if (!handler.pendingTransactions) {
        handler.pendingTransactions = new Map();
    }
    const key = `${originalId}:${field}`;
    if (!handler.pendingTransactions.has(key)) {
        handler.pendingTransactions.set(key, []);
    }
    handler.pendingTransactions.get(key).push(transaction);
    return transaction;
}
/**
 * Flush pending transactions to storage
 *
 * @param handler - Field handler with pending transactions
 * @returns Number of transactions flushed
 */
export async function flushPendingTransactions(handler) {
    if (!handler.pendingTransactions || handler.pendingTransactions.size === 0) {
        return 0;
    }
    if (!handler.transactionResource) {
        return 0;
    }
    let flushed = 0;
    const errors = [];
    for (const [key, transactions] of handler.pendingTransactions) {
        for (const txn of transactions) {
            const [ok, err] = await tryFn(() => handler.transactionResource.insert(txn));
            if (ok) {
                flushed++;
            }
            else {
                errors.push(err);
            }
        }
    }
    handler.pendingTransactions.clear();
    if (errors.length > 0) {
        throw new Error(`Failed to flush ${errors.length} transactions: ${errors[0]?.message}`);
    }
    return flushed;
}
/**
 * Get pending transaction count for a handler
 *
 * @param handler - Field handler
 * @returns Number of pending transactions
 */
export function getPendingTransactionCount(handler) {
    if (!handler.pendingTransactions) {
        return 0;
    }
    let count = 0;
    for (const transactions of handler.pendingTransactions.values()) {
        count += transactions.length;
    }
    return count;
}
//# sourceMappingURL=transactions.js.map