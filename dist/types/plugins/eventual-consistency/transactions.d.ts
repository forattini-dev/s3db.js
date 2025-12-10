/**
 * Transaction management for EventualConsistencyPlugin
 * @module eventual-consistency/transactions
 */
import { type Transaction, type FieldHandler } from './utils.js';
export interface CreateTransactionOptions {
    source?: string;
}
export interface CreateTransactionParams {
    originalId: string;
    field: string;
    fieldPath?: string;
    value: number;
    operation: 'add' | 'sub' | 'set';
    options?: CreateTransactionOptions;
}
/**
 * Create a transaction record
 *
 * @param handler - Field handler
 * @param params - Transaction parameters
 * @returns Created transaction
 */
export declare function createTransaction(handler: FieldHandler, params: CreateTransactionParams): Promise<Transaction>;
/**
 * Flush pending transactions to storage
 *
 * @param handler - Field handler with pending transactions
 * @returns Number of transactions flushed
 */
export declare function flushPendingTransactions(handler: FieldHandler): Promise<number>;
/**
 * Get pending transaction count for a handler
 *
 * @param handler - Field handler
 * @returns Number of pending transactions
 */
export declare function getPendingTransactionCount(handler: FieldHandler): number;
//# sourceMappingURL=transactions.d.ts.map