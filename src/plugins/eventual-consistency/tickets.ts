/**
 * Ticket System for EventualConsistencyPlugin
 * @module eventual-consistency/tickets
 */

import {
  type FieldHandler,
  type Transaction,
  type TicketResource,
  type TransactionResource,
  getNestedValue,
  setNestedValue
} from './utils.js';
import type { NormalizedConfig } from './config.js';

export interface Ticket {
  id: string;
  resourceName: string;
  fieldName: string;
  records: string[];
  status: 'available' | 'processing';
  cohortHour: string;
  ticketCreatedAt: number;
  ticketExpiresAt: number;
  claimedBy?: string;
  ticketClaimedAt?: number;
  ticketProcessingUntil?: number;
  ticketRetryCount?: number;
  _etag?: string;
}

export interface TicketResourceSchema {
  attributes: Record<string, string>;
  partitions: {
    byStatus: {
      fields: { status: string };
    };
  };
  behavior: string;
  timestamps: boolean;
  asyncPartitions: boolean;
}

export interface ProcessTicketResults {
  ticketId: string;
  recordsProcessed: number;
  transactionsApplied: number;
  errors: Array<{ originalId?: string; ticketId?: string; error: string }>;
}

function getTicketLeaseMs(config: NormalizedConfig): number {
  return Math.max(1000, config.ticketTTL || 300000);
}

function getTicketRetryLimit(config: NormalizedConfig): number {
  return Math.max(0, Math.floor(config.ticketMaxRetries || 0));
}

function getTicketRetryBaseDelay(config: NormalizedConfig): number {
  return Math.max(250, Math.floor(config.ticketRetryDelayMs || 1000));
}

function getTicketRetryDelayMs(retryCount: number, config: NormalizedConfig): number {
  const baseDelay = getTicketRetryBaseDelay(config);
  const cappedAttempts = Math.min(retryCount, 12);
  return Math.min(baseDelay * Math.pow(2, Math.max(0, cappedAttempts - 1)), 60_000);
}

function getTicketQueryPageSize(config: NormalizedConfig): number {
  return Math.max(25, Math.min(200, config.ticketScanPageSize || 100));
}

async function scanTicketsByStatus(
  ticketResource: TicketResource,
  status: Ticket['status'],
  config: NormalizedConfig,
  onTicket: (ticket: Ticket) => Promise<boolean | void> | (boolean | void)
): Promise<number> {
  const pageSize = getTicketQueryPageSize(config);
  let offset = 0;
  let scanned = 0;

  while (true) {
    const batch = await ticketResource.query(
      { status },
      { limit: pageSize, offset }
    ).catch(() => []);

    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    for (const ticket of batch as Ticket[]) {
      scanned += 1;
      const stop = await Promise.resolve(onTicket(ticket));
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

async function scanTransactionsByFilter(
  transactionResource: TransactionResource,
  filter: Record<string, any>,
  config: NormalizedConfig,
  onTransaction: (transaction: Transaction) => Promise<boolean | void> | (boolean | void)
): Promise<number> {
  const pageSize = getTicketQueryPageSize(config);
  let offset = 0;
  let scanned = 0;

  while (true) {
    const batch = await transactionResource.query(filter, {
      limit: pageSize,
      offset
    }).catch(() => []);

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

function addActiveRecordsFromTicket(activeRecords: Set<string>, ticket: Ticket, now: number): void {
  if (!ticket?.ticketExpiresAt || ticket.ticketExpiresAt <= now) {
    return;
  }

  if (!Array.isArray(ticket?.records)) {
    return;
  }

  for (const record of ticket.records) {
    if (typeof record === 'string') {
      activeRecords.add(record);
    }
  }
}

async function getActiveTicketRecords(
  ticketResource: TicketResource,
  config: NormalizedConfig,
  now: number = Date.now()
): Promise<Set<string>> {
  const activeRecords = new Set<string>();

  await scanTicketsByStatus(ticketResource, 'available', config, (ticket) => {
    addActiveRecordsFromTicket(activeRecords, ticket, now);
  });

  await scanTicketsByStatus(ticketResource, 'processing', config, (ticket) => {
    addActiveRecordsFromTicket(activeRecords, ticket, now);
  });

  return activeRecords;
}

function isTicketUsableForClaim(ticket: Ticket, now: number): boolean {
  if (ticket.status !== 'available') return false;
  if (ticket.claimedBy) return false;
  if (!ticket.ticketExpiresAt || ticket.ticketExpiresAt <= now) return false;
  return true;
}

function shouldSkipCandidateForClaim(ticket: Ticket, now: number): boolean {
  if (!isTicketUsableForClaim(ticket, now)) {
    return true;
  }

  if (ticket.ticketProcessingUntil && ticket.ticketProcessingUntil > now) {
    return true;
  }

  return false;
}

function shouldRetryTicket(currentTicket: Ticket, config: NormalizedConfig): boolean {
  const nextRetryCount = (currentTicket.ticketRetryCount || 0) + 1;
  return nextRetryCount <= getTicketRetryLimit(config);
}

function getRetryBackoffMs(currentTicket: Ticket, config: NormalizedConfig): number {
  const nextRetryCount = (currentTicket.ticketRetryCount || 0) + 1;
  return getTicketRetryDelayMs(nextRetryCount, config);
}

export interface Database {
  resources: Record<string, any>;
}

/**
 * Create a ticket resource schema
 *
 * Tickets are used to distribute consolidation workload across multiple workers
 * in coordinator mode. Each ticket contains a batch of records to consolidate.
 *
 * @returns Resource schema configuration
 */
export function createTicketResourceSchema(): TicketResourceSchema {
  return {
    attributes: {
      id: 'string|required',
      resourceName: 'string|required',
      fieldName: 'string|required',
      records: 'array|required',
      status: 'string|required',
      cohortHour: 'string|required',
      ticketCreatedAt: 'number|required',
      ticketExpiresAt: 'number|required',
      claimedBy: 'string|optional',
      ticketClaimedAt: 'number|optional',
      ticketProcessingUntil: 'number|optional',
      ticketRetryCount: 'number|optional'
    },
    partitions: {
      byStatus: {
        fields: {
          status: 'string'
        }
      }
    },
    behavior: 'body-only',
    timestamps: true,
    asyncPartitions: false
  };
}

/**
 * Generate a unique ticket ID
 * @returns Ticket ID in format: ticket-{timestamp}-{random}
 */
export function generateTicketId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `ticket-${timestamp}-${random}`;
}

/**
 * Create ticket batches from a list of record IDs
 * @param recordIds - Array of record IDs to batch
 * @param batchSize - Number of records per batch (default: 100)
 * @returns Array of batches
 */
export function createBatches(recordIds: string[], batchSize: number = 100): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < recordIds.length; i += batchSize) {
    batches.push(recordIds.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Create tickets for a field handler (coordinator work)
 *
 * This function is called by the coordinator to create work tickets for workers to claim.
 * It queries pending transactions from cohort windows, groups by originalId, and creates
 * batches of records for distributed processing.
 *
 * @param handler - Field handler with resources and config
 * @param config - Plugin configuration
 * @param getCohortHoursFn - Function to get cohort hours window
 * @returns Array of created tickets
 */
export async function createTicketsForHandler(
  handler: FieldHandler,
  config: NormalizedConfig,
  getCohortHoursFn: (windowHours: number) => string[]
): Promise<Ticket[]> {
  const { transactionResource, ticketResource, resource: resourceName, field: fieldName } = handler;

  if (!transactionResource || !ticketResource) {
    throw new Error(`Missing resources for ${resourceName}.${fieldName}`);
  }

  const cohortHours = getCohortHoursFn(config.consolidationWindow || 24);
  if (cohortHours.length === 0) {
    return [];
  }

  const now = Date.now();
  const activeRecords = await getActiveTicketRecords(ticketResource, config, now);
  const uniqueIds: string[] = [];
  const seenOriginalIds = new Set<string>();

  for (const cohortHour of cohortHours) {
    await scanTransactionsByFilter(
      transactionResource,
      { cohortHour, applied: false },
      config,
      (transaction) => {
        const originalId = transaction.originalId;
        if (
          typeof originalId !== 'string' ||
          !originalId ||
          activeRecords.has(originalId) ||
          seenOriginalIds.has(originalId)
        ) {
          return;
        }

        seenOriginalIds.add(originalId);
        uniqueIds.push(originalId);
      }
    );
  }

  if (uniqueIds.length === 0) {
    return [];
  }

  const recordBatches = createBatches(uniqueIds, config.ticketBatchSize || 100);

  const tickets: Ticket[] = [];
  const ticketTTL = config.ticketTTL || 300000;

  for (const batch of recordBatches) {
    const ticket: Ticket = {
      id: generateTicketId(),
      resourceName,
      fieldName,
      records: batch,
      status: 'available',
      cohortHour: cohortHours[0] as string,
      ticketCreatedAt: now,
      ticketExpiresAt: now + ticketTTL
    };

    await ticketResource.insert(ticket);
    tickets.push(ticket);
  }

  return tickets;
}

/**
 * Claim available tickets for processing (worker logic)
 *
 * Workers call this to atomically claim tickets from the available pool.
 * Claiming is guarded by updateConditional to avoid double-consumption.
 *
 * @param ticketResource - The ticket resource to query
 * @param workerId - Unique worker identifier
 * @param config - Plugin configuration
 * @returns Array of claimed tickets
 */
export async function claimTickets(
  ticketResource: TicketResource,
  workerId: string,
  config: NormalizedConfig
): Promise<Ticket[]> {
  const now = Date.now();
  const claimLimit = config.workerClaimLimit || 1;
  const leaseMs = getTicketLeaseMs(config);

  const claimed: Ticket[] = [];

  await scanTicketsByStatus(ticketResource, 'available', config, async (ticket) => {
    if (claimed.length >= claimLimit) {
      return true;
    }

    if (shouldSkipCandidateForClaim(ticket, now)) {
      return false;
    }

    let currentTicket: Ticket;
    try {
      currentTicket = await ticketResource.get(ticket.id) as Ticket;
    } catch {
      return false;
    }

    if (shouldSkipCandidateForClaim(currentTicket, now)) {
      return false;
    }

    if (typeof ticketResource.updateConditional !== 'function' || !currentTicket._etag) {
      return false;
    }

    try {
      const claimResult = await ticketResource.updateConditional(ticket.id, {
        status: 'processing',
        claimedBy: workerId,
        ticketClaimedAt: now,
        ticketProcessingUntil: now + leaseMs
      }, {
        ifMatch: currentTicket._etag
      });

      if (claimResult?.success) {
        claimed.push({
          ...currentTicket,
          status: 'processing',
          claimedBy: workerId,
          ticketClaimedAt: now
        });
      }
    } catch {
      // ignore contention and keep scanning
    }

    return claimed.length >= claimLimit;
  });

  return claimed;
}

export async function reclaimStaleTickets(
  ticketResource: TicketResource,
  config: NormalizedConfig,
  now: number = Date.now()
): Promise<number> {
  const leaseMs = getTicketLeaseMs(config);
  const staleBefore = now;
  let reclaimed = 0;

  const reclaimCandidate = async (ticket: Ticket): Promise<boolean> => {
    let currentTicket: Ticket;
    try {
      currentTicket = await ticketResource.get(ticket.id) as Ticket;
    } catch {
      return false;
    }

    if (!currentTicket.ticketExpiresAt || currentTicket.ticketExpiresAt <= staleBefore) {
      try {
        await ticketResource.delete(currentTicket.id);
        reclaimed++;
      } catch {
        // ignore deletion failures and keep trying recovery for remaining tickets
      }
      return false;
    }

    if (currentTicket.status !== 'processing') {
      return false;
    }

    const currentProcessingUntil = currentTicket.ticketProcessingUntil ??
      (currentTicket.ticketClaimedAt ?? 0) + leaseMs;

    if (currentProcessingUntil > staleBefore) {
      return false;
    }

    if (!shouldRetryTicket(currentTicket, config)) {
      try {
        await ticketResource.delete(currentTicket.id);
        reclaimed++;
      } catch {
        // ignore deletion failures and keep trying recovery for remaining tickets
      }
      return false;
    }

    if (!currentTicket._etag) {
      return false;
    }

    const retryDelay = getRetryBackoffMs(currentTicket, config);
    const [ok] = await tryReclaimTicket(ticketResource, currentTicket, {
      status: 'available',
      claimedBy: null,
      ticketClaimedAt: null,
      ticketProcessingUntil: staleBefore + retryDelay,
      ticketRetryCount: (currentTicket.ticketRetryCount || 0) + 1
    });

    if (ok) {
      reclaimed++;
    }

    return false;
  };

  await scanTicketsByStatus(ticketResource, 'available', config, reclaimCandidate);
  await scanTicketsByStatus(ticketResource, 'processing', config, reclaimCandidate);

  return reclaimed;
}

async function tryReclaimTicket(
  ticketResource: TicketResource,
  ticket: Ticket,
  data: Record<string, unknown>
): Promise<[boolean]> {
  if (typeof ticketResource.updateConditional !== 'function' || !ticket._etag) {
    return [false];
  }

  try {
    const updateResult = await ticketResource.updateConditional(ticket.id, data, {
      ifMatch: ticket._etag
    });
    return [!!updateResult?.success];
  } catch {
    return [false];
  }
}

/**
 * Process a claimed ticket (worker logic)
 *
 * Consolidates all pending transactions for the records in the ticket,
 * updates the target resource, marks transactions as applied, and deletes the ticket.
 *
 * @param ticket - The claimed ticket to process
 * @param handler - Field handler with resources
 * @param database - Database instance for getting target resource
 * @returns Processing results
 */
export async function processTicket(
  ticket: Ticket,
  handler: FieldHandler,
  database: Database,
  workerId: string = '',
  config: NormalizedConfig = {} as NormalizedConfig
): Promise<ProcessTicketResults> {
  const { transactionResource, ticketResource, resource: resourceName, field: fieldName } = handler;
  const targetResource = database.resources[resourceName];
  const results: ProcessTicketResults = {
    ticketId: ticket.id,
    recordsProcessed: 0,
    transactionsApplied: 0,
    errors: []
  };

  if (!targetResource) {
    results.errors.push({ error: `Target resource '${resourceName}' not found` });
    return results;
  }

  if (!ticketResource) {
    results.errors.push({ ticketId: ticket.id, error: 'Missing ticket resource on handler' });
    return results;
  }

  if (workerId) {
    try {
      const currentTicket = await ticketResource.get(ticket.id) as Ticket;
      const leaseUntil = currentTicket.ticketProcessingUntil ?? 0;
      const expiresAt = currentTicket.ticketExpiresAt ?? 0;

      if (currentTicket.status !== 'processing') {
        results.errors.push({
          ticketId: ticket.id,
          originalId: ticket.records[0],
          error: 'Ticket is no longer in processing state'
        });
        return results;
      }

      if (currentTicket.claimedBy !== workerId) {
        results.errors.push({
          ticketId: ticket.id,
          originalId: ticket.records[0],
          error: 'Ticket was taken by another worker'
        });
        return results;
      }

      if (expiresAt > 0 && expiresAt <= Date.now()) {
        results.errors.push({
          ticketId: ticket.id,
          originalId: ticket.records[0],
          error: 'Ticket has expired'
        });
        return results;
      }

      if (leaseUntil > 0 && leaseUntil <= Date.now()) {
        results.errors.push({
          ticketId: ticket.id,
          originalId: ticket.records[0],
          error: 'Ticket processing lease expired'
        });
        return results;
      }
    } catch {
      results.errors.push({
        ticketId: ticket.id,
        originalId: ticket.records[0],
        error: `Failed to re-validate ticket ${ticket.id}`
      });
      return results;
    }
  }

  let hadErrors = false;

  for (const originalId of ticket.records) {
    try {
      const transactions: Transaction[] = [];
      await scanTransactionsByFilter(
        transactionResource!,
        { originalId, applied: false },
        config,
        (transaction) => {
          transactions.push(transaction);
        }
      );

      if (transactions.length === 0) {
        continue;
      }

      const sortedTransactions = [...transactions].sort((a, b) => {
        const aTs = new Date(a.timestamp).getTime();
        const bTs = new Date(b.timestamp).getTime();
        return aTs - bTs;
      });

      let hadUnsupportedOperation = false;
      let hasSet = false;
      let consolidatedValue = 0;
      for (const tx of sortedTransactions) {
        if (tx.operation === 'set') {
          consolidatedValue = tx.value;
          hasSet = true;
          continue;
        }

        if (tx.operation === 'add') {
          consolidatedValue += tx.value;
          continue;
        }

        if (tx.operation === 'sub') {
          consolidatedValue -= tx.value;
          continue;
        }

        hadUnsupportedOperation = true;
        results.errors.push({ originalId, error: `Unsupported transaction operation: ${tx.operation}` });
        hadErrors = true;
      }

      if (hadUnsupportedOperation) {
        continue;
      }

      const buildUpdateData = (value: number): Record<string, any> => {
        const updateData: Record<string, any> = {};
        if (handler.fieldPath) {
          setNestedValue(updateData, handler.fieldPath, value);
        } else {
          updateData[fieldName] = value;
        }
        return updateData;
      };

      const normalizeNumber = (value: unknown): number => {
        const parsed = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      try {
        if (hasSet) {
          try {
            const existingRecord = await targetResource.get(originalId);
            const currentValue = handler.fieldPath
              ? normalizeNumber(getNestedValue(existingRecord, handler.fieldPath))
              : normalizeNumber(existingRecord[fieldName]);
            await targetResource.update(originalId, buildUpdateData(currentValue + consolidatedValue));
          } catch {
            await targetResource.insert({
              id: originalId,
              ...buildUpdateData(consolidatedValue)
            });
          }
        } else {
          const existingRecord = await targetResource.get(originalId);
          const currentValue = handler.fieldPath
            ? normalizeNumber(getNestedValue(existingRecord, handler.fieldPath))
            : normalizeNumber(existingRecord[fieldName]);
          await targetResource.update(originalId, buildUpdateData(currentValue + consolidatedValue));
        }
      } catch (err: any) {
        hadErrors = true;
        results.errors.push({ originalId, error: err.message });
        continue;
      }

      for (const tx of transactions) {
        let applied = false;
        try {
          if (typeof transactionResource.updateConditional === 'function' && tx._etag) {
            const updateResult = await transactionResource.updateConditional(tx.id, { applied: true }, {
              ifMatch: tx._etag
            });
            if (!updateResult?.success) {
              results.errors.push({ originalId, error: `Could not mark tx ${tx.id} as applied` });
              hadErrors = true;
            } else {
              applied = true;
            }
          } else {
            await transactionResource!.update(tx.id, { applied: true });
            applied = true;
          }
        } catch (err: any) {
          results.errors.push({ originalId, error: err.message });
          hadErrors = true;
        }

        if (applied) {
          results.transactionsApplied++;
        }
      }

      results.recordsProcessed++;

    } catch (err: any) {
      results.errors.push({ originalId, error: err.message });
      hadErrors = true;
    }
  }

  if (hadErrors) {
    await releaseTicketForRetry(ticket, ticketResource, workerId, getTicketLeaseMs(config), config);
    return results;
  }

  try {
    await ticketResource!.delete(ticket.id);
  } catch (err: any) {
    results.errors.push({ ticketId: ticket.id, error: `Failed to delete ticket: ${err.message}` });
  }

  return results;
}

async function releaseTicketForRetry(
  ticket: Ticket,
  ticketResource: TicketResource,
  workerId: string,
  leaseMs: number,
  config: NormalizedConfig = {} as NormalizedConfig
): Promise<void> {
  if (!workerId) {
    return;
  }

  let currentTicket: Ticket;
  try {
    currentTicket = await ticketResource.get(ticket.id) as Ticket;
  } catch {
    return;
  }

  if (!currentTicket._etag || currentTicket.status !== 'processing' || currentTicket.claimedBy !== workerId) {
    return;
  }

  if (typeof ticketResource.updateConditional !== 'function') {
    return;
  }

  const now = Date.now();
  const nextRetryCount = (currentTicket.ticketRetryCount || 0) + 1;
  const nextRetryAllowed = nextRetryCount <= getTicketRetryLimit(config);
  if (!nextRetryAllowed) {
    await tryDeleteTicket(ticketResource, ticket.id);
    return;
  }

  const retryDelay = getRetryBackoffMs(currentTicket, config);
  const currentExpiresAt = typeof currentTicket.ticketExpiresAt === 'number' && Number.isFinite(currentTicket.ticketExpiresAt)
    ? currentTicket.ticketExpiresAt
    : 0;
  const nextProcessingUntil = now + Math.max(1000, retryDelay);

  try {
    await ticketResource.updateConditional(ticket.id, {
      status: 'available',
      claimedBy: null,
      ticketClaimedAt: null,
      ticketProcessingUntil: nextProcessingUntil,
      ticketRetryCount: nextRetryCount,
      ticketExpiresAt: Math.max(
        now + Math.max(1000, leaseMs),
        currentExpiresAt
      )
    }, {
      ifMatch: currentTicket._etag
    });
  } catch {
    // keep ticket processing state if we can't safely retry yet
  }
}

async function tryDeleteTicket(
  ticketResource: TicketResource,
  ticketId: string
): Promise<void> {
  try {
    await ticketResource.delete(ticketId);
  } catch {
    // Keep ticket as-is if we cannot delete it.
    return;
  }
}
