/**
 * Consolidation logic for EventualConsistencyPlugin
 * @module eventual-consistency/consolidation
 */
import { type Transaction, type FieldHandler } from './utils.js';
import type { NormalizedConfig } from './config.js';
import type { PluginStorage } from './locks.js';
export type RunConsolidationCallback = (handler: FieldHandler, resourceName: string, fieldName: string) => Promise<ConsolidationResult>;
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
export declare function startConsolidationTimer(handler: FieldHandler, resourceName: string, fieldName: string, runConsolidationFn: RunConsolidationCallback, config: NormalizedConfig): string;
/**
 * Run consolidation for a field handler
 *
 * @param handler - Field handler
 * @param storage - PluginStorage instance for locks
 * @param config - Plugin configuration
 * @param emitFn - Function to emit events
 * @returns Consolidation result
 */
export declare function runConsolidation(handler: FieldHandler, storage: PluginStorage, config: NormalizedConfig, emitFn?: EmitFunction): Promise<ConsolidationResult>;
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
export declare function consolidateRecord(handler: FieldHandler, originalId: string, transactions: Transaction[], config: NormalizedConfig): Promise<RecordConsolidationResult | null>;
/**
 * Get consolidated value for a record
 *
 * @param handler - Field handler
 * @param originalId - Record ID
 * @returns Consolidated value
 */
export declare function getConsolidatedValue(handler: FieldHandler, originalId: string): Promise<number>;
/**
 * Get cohort statistics for a handler
 *
 * @param handler - Field handler
 * @param config - Plugin configuration
 * @returns Array of cohort statistics
 */
export declare function getCohortStats(handler: FieldHandler, config: NormalizedConfig): Promise<CohortStats[]>;
/**
 * Recalculate a record's value from all transactions
 *
 * @param handler - Field handler
 * @param originalId - Record ID
 * @returns Recalculated value
 */
export declare function recalculateRecord(handler: FieldHandler, originalId: string): Promise<number>;
//# sourceMappingURL=consolidation.d.ts.map