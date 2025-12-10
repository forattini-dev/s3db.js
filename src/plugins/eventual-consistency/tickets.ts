/**
 * Ticket System for EventualConsistencyPlugin
 * @module eventual-consistency/tickets
 */

import type { FieldHandler, TicketResource, TransactionResource } from './utils.js';
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
      ticketClaimedAt: 'number|optional'
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

  const transactionsByHour = await Promise.all(
    cohortHours.map(async (cohortHour) => {
      try {
        return await transactionResource.query({
          cohortHour,
          applied: false
        }, { limit: Infinity });
      } catch (err) {
        return [];
      }
    })
  );

  const allTransactions = transactionsByHour.flat();

  if (allTransactions.length === 0) {
    return [];
  }

  const uniqueIds = [...new Set(allTransactions.map(t => t.originalId))];
  const recordBatches = createBatches(uniqueIds, config.ticketBatchSize || 100);

  const tickets: Ticket[] = [];
  const now = Date.now();
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
 * Uses GET+UPDATE pattern - race conditions are acceptable as only one worker
 * will successfully update each ticket.
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

  const availableTickets = await ticketResource.query(
    { status: 'available' },
    { limit: claimLimit * 2 }
  ) as Ticket[];

  if (availableTickets.length === 0) {
    return [];
  }

  const validTickets = availableTickets.filter(ticket => ticket.ticketExpiresAt > now);

  if (validTickets.length === 0) {
    return [];
  }

  const claimed: Ticket[] = [];

  for (const ticket of validTickets.slice(0, claimLimit * 2)) {
    try {
      const currentTicket = await ticketResource.get(ticket.id) as Ticket;

      if (currentTicket.status !== 'available') {
        continue;
      }

      await ticketResource.update(ticket.id, {
        status: 'processing',
        claimedBy: workerId,
        ticketClaimedAt: now
      });

      claimed.push({
        ...ticket,
        status: 'processing',
        claimedBy: workerId,
        ticketClaimedAt: now
      });

    } catch (err) {
      continue;
    }

    if (claimed.length >= claimLimit) {
      break;
    }
  }

  return claimed;
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
  database: Database
): Promise<ProcessTicketResults> {
  const { transactionResource, ticketResource, resource: resourceName, field: fieldName } = handler;
  const results: ProcessTicketResults = {
    ticketId: ticket.id,
    recordsProcessed: 0,
    transactionsApplied: 0,
    errors: []
  };

  const targetResource = database.resources[resourceName];
  if (!targetResource) {
    results.errors.push({ error: `Target resource '${resourceName}' not found` });
    return results;
  }

  for (const originalId of ticket.records) {
    try {
      const transactions = await transactionResource!.query(
        { originalId, applied: false },
        { limit: Infinity }
      );

      if (transactions.length === 0) {
        continue;
      }

      const adds = transactions.filter(t => t.operation === 'add');
      const sets = transactions.filter(t => t.operation === 'set');

      const latestSet = sets.length > 0
        ? sets.reduce((latest, tx) => tx.timestamp > latest.timestamp ? tx : latest)
        : null;

      let consolidatedValue: number;
      if (latestSet) {
        consolidatedValue = latestSet.value;
        const addsAfterSet = adds.filter(t => t.timestamp > latestSet.timestamp);
        consolidatedValue += addsAfterSet.reduce((sum, t) => sum + t.value, 0);
      } else {
        consolidatedValue = adds.reduce((sum, t) => sum + t.value, 0);
      }

      try {
        const existingRecord = await targetResource.get(originalId);
        await targetResource.update(originalId, {
          [fieldName]: (existingRecord[fieldName] || 0) + consolidatedValue
        });
      } catch (err) {
        if (latestSet) {
          await targetResource.insert({
            id: originalId,
            [fieldName]: consolidatedValue
          });
        }
      }

      for (const tx of transactions) {
        await transactionResource!.update(tx.id, { applied: true });
      }

      results.recordsProcessed++;
      results.transactionsApplied += transactions.length;

    } catch (err: any) {
      results.errors.push({ originalId, error: err.message });
    }
  }

  try {
    await ticketResource!.delete(ticket.id);
  } catch (err: any) {
    results.errors.push({ ticketId: ticket.id, error: `Failed to delete ticket: ${err.message}` });
  }

  return results;
}
