/**
 * Utility functions for EventualConsistencyPlugin
 * @module eventual-consistency/utils
 */
import { type ReducerFunction, type FieldConfig, type NormalizedConfig, type FieldHandlerConfig } from './config.js';
export interface CohortInfo {
    cohortDate: string;
    cohortHour: string;
    cohortWeek: string;
    cohortMonth: string;
}
export interface Transaction {
    id: string;
    originalId: string;
    field: string;
    fieldPath?: string;
    value: number;
    operation: string;
    timestamp: string;
    cohortDate: string;
    cohortHour: string;
    cohortWeek?: string;
    cohortMonth?: string;
    source?: string;
    applied?: boolean;
    createdAt?: string;
}
export interface TransactionResource {
    insert(data: Partial<Transaction>): Promise<Transaction>;
    get(id: string): Promise<Transaction>;
    update(id: string, data: Partial<Transaction>): Promise<Transaction>;
    delete(id: string): Promise<void>;
    list(options?: {
        limit?: number;
    }): Promise<Transaction[]>;
    query(query: Record<string, any>, options?: {
        limit?: number;
    }): Promise<Transaction[]>;
}
export interface AnalyticsResource {
    insert(data: any): Promise<any>;
    get(id: string): Promise<any>;
    update(id: string, data: any): Promise<any>;
    list(options?: {
        limit?: number;
    }): Promise<any[]>;
}
export interface TicketResource {
    insert(data: any): Promise<any>;
    get(id: string): Promise<any>;
    update(id: string, data: any): Promise<any>;
    delete(id: string): Promise<void>;
    query(query: Record<string, any>, options?: {
        limit?: number;
    }): Promise<any[]>;
}
export interface FieldHandler {
    resource: string;
    field: string;
    fieldPath?: string;
    config: FieldHandlerConfig;
    targetResource?: any;
    transactionResource?: TransactionResource;
    analyticsResource?: AnalyticsResource;
    ticketResource?: TicketResource;
    pendingTransactions?: Map<string, Transaction[]>;
    consolidationJobName?: string;
    gcJobName?: string;
    deferredSetup?: boolean;
    initialValue: number;
    reducer: ReducerFunction;
}
/**
 * Detect user's timezone from environment
 *
 * @returns Timezone string (e.g., 'America/New_York')
 */
export declare function detectTimezone(): string;
/**
 * Get cohort information for a timestamp
 *
 * @param timestamp - ISO timestamp string
 * @param timezone - Timezone string
 * @returns Cohort information
 */
export declare function getCohortInfo(timestamp: string, timezone?: string): CohortInfo;
/**
 * Get ISO week string for a date
 *
 * @param date - Date object
 * @returns ISO week string (e.g., '2025-W42')
 */
export declare function getISOWeek(date: Date): string;
/**
 * Create a field handler from field configuration
 *
 * @param resourceName - Resource name
 * @param fieldConfig - Field configuration (string or object)
 * @param globalConfig - Global plugin configuration
 * @returns Field handler object
 */
export declare function createFieldHandler(resourceName: string, fieldConfig: string | FieldConfig, globalConfig: NormalizedConfig): FieldHandler;
/**
 * Validate nested path exists in object
 *
 * @param obj - Object to validate
 * @param path - Dot-separated path (e.g., 'utmResults.medium')
 * @returns True if path exists
 */
export declare function validateNestedPath(obj: any, path: string): boolean;
/**
 * Get value from nested path
 *
 * @param obj - Object to get value from
 * @param path - Dot-separated path
 * @returns Value at path or undefined
 */
export declare function getNestedValue(obj: any, path: string): any;
/**
 * Set value at nested path
 *
 * @param obj - Object to set value in
 * @param path - Dot-separated path
 * @param value - Value to set
 */
export declare function setNestedValue(obj: any, path: string, value: any): void;
/**
 * Resolve field and plugin handler from arguments
 *
 * @param args - Arguments array [field, value, options?] or [value, options?]
 * @param defaultField - Default field name if not specified
 * @param resource - Resource instance with plugin references
 * @returns Resolved field, value, options, and handler
 */
export declare function resolveFieldAndPlugin(args: any[], defaultField: string | null, resource: any): {
    field: string;
    value: number;
    options: any;
    handler: FieldHandler | null;
};
/**
 * Group transactions by a cohort field
 *
 * @param transactions - Array of transactions
 * @param cohortField - Field to group by (e.g., 'cohortHour')
 * @returns Map of cohort to transactions
 */
export declare function groupByCohort(transactions: Transaction[], cohortField: keyof Transaction): Record<string, Transaction[]>;
/**
 * Ensure all transactions have cohort fields
 *
 * @param transactions - Array of transactions
 * @param timezone - Timezone for cohort calculation
 * @param mutate - Whether to mutate original transactions
 * @returns Transactions with cohort fields
 */
export declare function ensureCohortHours(transactions: Transaction[], timezone?: string, mutate?: boolean): Transaction[];
/**
 * Get cohort hours for a time window
 *
 * @param windowHours - Number of hours to look back
 * @param timezone - Timezone for cohort calculation
 * @returns Array of cohort hour strings
 */
export declare function getCohortHoursWindow(windowHours: number, timezone?: string): string[];
/**
 * Generate unique transaction ID
 *
 * @returns Transaction ID string
 */
export declare function generateTransactionId(): string;
//# sourceMappingURL=utils.d.ts.map