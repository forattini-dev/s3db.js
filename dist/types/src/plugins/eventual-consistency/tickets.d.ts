/**
 * Ticket System for EventualConsistencyPlugin
 * @module eventual-consistency/tickets
 */
import type { FieldHandler, TicketResource } from './utils.js';
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
            fields: {
                status: string;
            };
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
    errors: Array<{
        originalId?: string;
        ticketId?: string;
        error: string;
    }>;
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
export declare function createTicketResourceSchema(): TicketResourceSchema;
/**
 * Generate a unique ticket ID
 * @returns Ticket ID in format: ticket-{timestamp}-{random}
 */
export declare function generateTicketId(): string;
/**
 * Create ticket batches from a list of record IDs
 * @param recordIds - Array of record IDs to batch
 * @param batchSize - Number of records per batch (default: 100)
 * @returns Array of batches
 */
export declare function createBatches(recordIds: string[], batchSize?: number): string[][];
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
export declare function createTicketsForHandler(handler: FieldHandler, config: NormalizedConfig, getCohortHoursFn: (windowHours: number) => string[]): Promise<Ticket[]>;
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
export declare function claimTickets(ticketResource: TicketResource, workerId: string, config: NormalizedConfig): Promise<Ticket[]>;
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
export declare function processTicket(ticket: Ticket, handler: FieldHandler, database: Database): Promise<ProcessTicketResults>;
//# sourceMappingURL=tickets.d.ts.map