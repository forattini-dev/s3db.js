/**
 * Utility functions for EventualConsistencyPlugin
 * @module eventual-consistency/utils
 */

import {
  type CohortConfig,
  type ReducerFunction,
  type FieldConfig,
  type NormalizedConfig,
  type FieldHandlerConfig
} from './config.js';

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
  _etag?: string;
}

export interface TransactionResource {
  insert(data: Partial<Transaction>): Promise<Transaction>;
  get(id: string): Promise<Transaction>;
  update(id: string, data: Partial<Transaction>): Promise<Transaction>;
  updateConditional?: (id: string, data: Partial<Transaction>, options: { ifMatch: string }) => Promise<{
    success: boolean;
    data?: Transaction;
    etag?: string;
    error?: string;
  }>;
  delete(id: string): Promise<void>;
  list(options?: { limit?: number }): Promise<Transaction[]>;
  query(query: Record<string, any>, options?: { limit?: number; offset?: number }): Promise<Transaction[]>;
}

export interface AnalyticsResource {
  insert(data: any): Promise<any>;
  get(id: string): Promise<any>;
  update(id: string, data: any): Promise<any>;
  list(options?: { limit?: number }): Promise<any[]>;
  updateConditional?: (
    id: string,
    data: any,
    options: { ifMatch: string }
  ) => Promise<{
    success: boolean;
    data?: any;
    etag?: string;
    error?: string;
  }>;
  query?(query: Record<string, any>, options?: { limit?: number; offset?: number }): Promise<any[]>;
}

export interface TicketResource {
  insert(data: any): Promise<any>;
  get(id: string): Promise<any>;
  update(id: string, data: any): Promise<any>;
  updateConditional?(id: string, data: any, options: { ifMatch: string }): Promise<{
    success: boolean;
    data?: any;
    etag?: string;
    error?: string;
  }>;
  delete(id: string): Promise<void>;
  query(query: Record<string, any>, options?: { limit?: number; offset?: number }): Promise<any[]>;
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
export function detectTimezone(): string {
  if (typeof process !== 'undefined' && process.env?.TZ) {
    return process.env.TZ;
  }

  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Get cohort information for a timestamp
 *
 * @param timestamp - ISO timestamp string
 * @param timezone - Timezone string
 * @returns Cohort information
 */
export function getCohortInfo(timestamp: string, timezone: string = 'UTC'): CohortInfo {
  const date = new Date(timestamp);

  let cohortDate: string;
  let cohortHour: string;

  if (timezone === 'UTC') {
    cohortDate = date.toISOString().substring(0, 10);
    cohortHour = date.toISOString().substring(0, 13);
  } else {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(date);
    const partsMap: Record<string, string> = {};
    for (const part of parts) {
      partsMap[part.type] = part.value;
    }

    cohortDate = `${partsMap.year}-${partsMap.month}-${partsMap.day}`;
    cohortHour = `${cohortDate}T${partsMap.hour}`;
  }

  const cohortWeek = getISOWeek(date);
  const cohortMonth = cohortDate.substring(0, 7);

  return {
    cohortDate,
    cohortHour,
    cohortWeek,
    cohortMonth
  };
}

/**
 * Get ISO week string for a date
 *
 * @param date - Date object
 * @returns ISO week string (e.g., '2025-W42')
 */
export function getISOWeek(date: Date): string {
  const target = new Date(date.valueOf());
  const dayNr = (date.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);

  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const firstThursday = new Date(yearStart.valueOf());
  if (yearStart.getUTCDay() !== 4) {
    firstThursday.setUTCDate(
      yearStart.getUTCDate() + ((4 - yearStart.getUTCDay()) + 7) % 7
    );
  }

  const weekNumber = 1 + Math.round(
    (target.getTime() - firstThursday.getTime()) / 604800000
  );
  const weekYear = target.getUTCFullYear();

  return `${weekYear}-W${String(weekNumber).padStart(2, '0')}`;
}

/**
 * Create a field handler from field configuration
 *
 * @param resourceName - Resource name
 * @param fieldConfig - Field configuration (string or object)
 * @param globalConfig - Global plugin configuration
 * @returns Field handler object
 */
export function createFieldHandler(
  resourceName: string,
  fieldConfig: string | FieldConfig,
  globalConfig: NormalizedConfig
): FieldHandler {
  const defaultReducer: ReducerFunction = (current, incoming) => current + incoming;

  let fieldName: string;
  let fieldPath: string | undefined;
  let initialValue: number = 0;
  let reducer: ReducerFunction = defaultReducer;
  let cohortConfig: CohortConfig = globalConfig.cohort;

  if (typeof fieldConfig === 'string') {
    fieldName = fieldConfig;
  } else {
    fieldName = fieldConfig.field;
    fieldPath = fieldConfig.fieldPath;
    initialValue = fieldConfig.initialValue ?? 0;
    reducer = fieldConfig.reducer || defaultReducer;

    if (fieldConfig.cohort) {
      cohortConfig = {
        ...globalConfig.cohort,
        ...fieldConfig.cohort
      };
    }
  }

  const handlerConfig: FieldHandlerConfig = {
    ...globalConfig,
    resource: resourceName,
    field: fieldName,
    fieldPath,
    initialValue,
    reducer,
    cohort: cohortConfig
  };

  return {
    resource: resourceName,
    field: fieldName,
    fieldPath,
    config: handlerConfig,
    initialValue,
    reducer,
    pendingTransactions: new Map()
  };
}

/**
 * Validate nested path exists in object
 *
 * @param obj - Object to validate
 * @param path - Dot-separated path (e.g., 'utmResults.medium')
 * @returns True if path exists
 */
export function validateNestedPath(obj: any, path: string): boolean {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return false;
    }
    if (typeof current !== 'object') {
      return false;
    }
    if (!(part in current)) {
      return false;
    }
    current = current[part];
  }

  return true;
}

/**
 * Get value from nested path
 *
 * @param obj - Object to get value from
 * @param path - Dot-separated path
 * @returns Value at path or undefined
 */
export function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Set value at nested path
 *
 * @param obj - Object to set value in
 * @param path - Dot-separated path
 * @param value - Value to set
 */
export function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]!] = value;
}

/**
 * Resolve field and plugin handler from arguments
 *
 * @param args - Arguments array [field, value, options?] or [value, options?]
 * @param defaultField - Default field name if not specified
 * @param resource - Resource instance with plugin references
 * @returns Resolved field, value, options, and handler
 */
export function resolveFieldAndPlugin(
  args: any[],
  defaultField: string | null,
  resource: any
): { field: string; value: number; options: any; handler: FieldHandler | null } {
  let field: string;
  let value: number;
  let options: any = {};

  if (args.length === 1) {
    field = defaultField!;
    value = args[0];
  } else if (args.length === 2) {
    if (typeof args[0] === 'string') {
      field = args[0];
      value = args[1];
    } else {
      field = defaultField!;
      value = args[0];
      options = args[1] || {};
    }
  } else {
    field = args[0];
    value = args[1];
    options = args[2] || {};
  }

  let handler: FieldHandler | null = null;
  if (resource._eventualConsistencyPlugins) {
    handler = resource._eventualConsistencyPlugins[field] || null;
  }

  return { field, value, options, handler };
}

/**
 * Group transactions by a cohort field
 *
 * @param transactions - Array of transactions
 * @param cohortField - Field to group by (e.g., 'cohortHour')
 * @returns Map of cohort to transactions
 */
export function groupByCohort(
  transactions: Transaction[],
  cohortField: keyof Transaction
): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {};

  for (const txn of transactions) {
    const cohort = txn[cohortField] as string;
    if (!cohort) continue;

    if (!groups[cohort]) {
      groups[cohort] = [];
    }
    groups[cohort].push(txn);
  }

  return groups;
}

/**
 * Ensure all transactions have cohort fields
 *
 * @param transactions - Array of transactions
 * @param timezone - Timezone for cohort calculation
 * @param mutate - Whether to mutate original transactions
 * @returns Transactions with cohort fields
 */
export function ensureCohortHours(
  transactions: Transaction[],
  timezone: string = 'UTC',
  mutate: boolean = true
): Transaction[] {
  const result = mutate ? transactions : transactions.map(t => ({ ...t }));

  for (const txn of result) {
    if (!txn.cohortHour || !txn.cohortDate) {
      const timestamp = txn.timestamp || txn.createdAt || new Date().toISOString();
      const cohortInfo = getCohortInfo(timestamp, timezone);

      txn.cohortDate = cohortInfo.cohortDate;
      txn.cohortHour = cohortInfo.cohortHour;
      txn.cohortWeek = cohortInfo.cohortWeek;
      txn.cohortMonth = cohortInfo.cohortMonth;
    }
  }

  return result;
}

/**
 * Get cohort hours for a time window
 *
 * @param windowHours - Number of hours to look back
 * @param timezone - Timezone for cohort calculation
 * @returns Array of cohort hour strings
 */
export function getCohortHoursWindow(
  windowHours: number,
  timezone: string = 'UTC'
): string[] {
  const hours: string[] = [];
  const now = new Date();

  for (let i = 0; i < windowHours; i++) {
    const date = new Date(now.getTime() - i * 60 * 60 * 1000);
    const cohortInfo = getCohortInfo(date.toISOString(), timezone);
    hours.push(cohortInfo.cohortHour);
  }

  return hours;
}

/**
 * Generate unique transaction ID
 *
 * @returns Transaction ID string
 */
export function generateTransactionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `tx-${timestamp}-${random}`;
}
