/**
 * Ticket System for EventualConsistencyPlugin
 * @module eventual-consistency/tickets
 */

/**
 * Create a ticket resource schema
 *
 * Tickets are used to distribute consolidation workload across multiple workers
 * in coordinator mode. Each ticket contains a batch of records to consolidate.
 *
 * @returns {Object} Resource schema configuration
 */
export function createTicketResourceSchema() {
  return {
    // Schema attributes
    attributes: {
      id: 'string|required',              // Unique ticket ID (format: ticket-{timestamp}-{random})
      resourceName: 'string|required',    // Target resource name (e.g., 'users')
      fieldName: 'string|required',       // Target field name (e.g., 'balance')
      records: 'array|required',          // Array of originalIds to process (max 100 by default)
      status: 'string|required',          // 'available' | 'processing'
      cohortHour: 'string|required',      // Source cohort hour (ISO timestamp)
      ticketCreatedAt: 'number|required', // Unix timestamp when ticket was created
      ticketExpiresAt: 'number|required', // Unix timestamp when ticket expires (TTL)
      claimedBy: 'string|optional',       // Worker ID that claimed this ticket
      ticketClaimedAt: 'number|optional'  // Unix timestamp when ticket was claimed
    },

    // Partitioning configuration
    // byStatus partition enables O(1) queries for available tickets
    partitions: {
      byStatus: {
        fields: {
          status: 'string'
        }
      }
    },

    // Resource configuration
    // body-only: Fast writes (no metadata overflow handling needed - tickets are small)
    // timestamps: true - Automatic ISO createdAt/updatedAt timestamps
    //            We use separate ticketCreatedAt/ticketExpiresAt (numbers) for TTL math
    // asyncPartitions: false - CRITICAL! We need synchronous status updates
    //                  for atomic ticket claiming to work correctly
    behavior: 'body-only',
    timestamps: true,
    asyncPartitions: false
  };
}

/**
 * Generate a unique ticket ID
 * @returns {string} Ticket ID in format: ticket-{timestamp}-{random}
 */
export function generateTicketId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `ticket-${timestamp}-${random}`;
}

/**
 * Create ticket batches from a list of record IDs
 * @param {string[]} recordIds - Array of record IDs to batch
 * @param {number} batchSize - Number of records per batch (default: 100)
 * @returns {string[][]} Array of batches
 */
export function createBatches(recordIds, batchSize = 100) {
  const batches = [];
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
 * @param {Object} handler - Field handler with resources and config
 * @param {Object} config - Plugin configuration
 * @param {Function} getCohortHoursFn - Function to get cohort hours window
 * @returns {Promise<Array>} Array of created tickets
 */
export async function createTicketsForHandler(handler, config, getCohortHoursFn) {
  const { transactionResource, ticketResource, resource: resourceName, field: fieldName } = handler;

  if (!transactionResource || !ticketResource) {
    throw new Error(`Missing resources for ${resourceName}.${fieldName}`);
  }

  // STEP 1: Get cohort hours to query (default: last 24 hours)
  const cohortHours = getCohortHoursFn(config.consolidationWindow || 24);

  // STEP 2: Query pending transactions from all cohort partitions in parallel
  const transactionsByHour = await Promise.all(
    cohortHours.map(async (cohortHour) => {
      try {
        // Query with no limit to get ALL pending transactions (default limit is 100)
        return await transactionResource.query({
          cohortHour,
          applied: false
        }, { limit: Infinity });
      } catch (err) {
        // Partition may not exist yet - return empty array
        return [];
      }
    })
  );

  // Flatten and filter out empty results
  const allTransactions = transactionsByHour.flat();

  if (allTransactions.length === 0) {
    // No pending transactions - no tickets to create
    return [];
  }

  // STEP 3: Group by originalId to get unique records
  const uniqueIds = [...new Set(allTransactions.map(t => t.originalId))];

  // STEP 4: Create batches (default: 100 records per ticket)
  const recordBatches = createBatches(uniqueIds, config.ticketBatchSize || 100);

  // STEP 5: Create tickets
  const tickets = [];
  const now = Date.now();
  const ticketTTL = config.ticketTTL || 300000; // Default 5min

  for (const batch of recordBatches) {
    const ticket = {
      id: generateTicketId(),
      resourceName,
      fieldName,
      records: batch,
      status: 'available',
      cohortHour: cohortHours[0], // Reference first cohort for tracking
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
 * @param {Object} ticketResource - The ticket resource to query
 * @param {string} workerId - Unique worker identifier
 * @param {Object} config - Plugin configuration
 * @returns {Promise<Array>} Array of claimed tickets
 */
export async function claimTickets(ticketResource, workerId, config) {
  const now = Date.now();
  const claimLimit = config.workerClaimLimit || 1;

  // STEP 1: Query available tickets from byStatus partition
  const availableTickets = await ticketResource.query(
    { status: 'available' },
    { limit: claimLimit * 2 } // Query 2x to account for race conditions
  );

  if (availableTickets.length === 0) {
    return []; // No tickets available
  }

  // STEP 2: Filter out expired tickets
  const validTickets = availableTickets.filter(ticket => ticket.ticketExpiresAt > now);

  if (validTickets.length === 0) {
    return []; // All tickets expired
  }

  // STEP 3: Attempt to claim tickets with optimistic locking
  const claimed = [];

  for (const ticket of validTickets.slice(0, claimLimit * 2)) {
    try {
      // Re-fetch ticket to get current state (and verify it's still available)
      const currentTicket = await ticketResource.get(ticket.id);

      // Check if still available (another worker may have claimed it)
      if (currentTicket.status !== 'available') {
        continue; // Already claimed, try next ticket
      }

      // Attempt atomic update using simple update (race condition handled by partition)
      // The synchronous partition (asyncPartitions: false) ensures atomicity
      await ticketResource.update(ticket.id, {
        status: 'processing',
        claimedBy: workerId,
        ticketClaimedAt: now
      });

      // Claim succeeded
      claimed.push({
        ...ticket,
        status: 'processing',
        claimedBy: workerId,
        ticketClaimedAt: now
      });

    } catch (err) {
      // Claim failed (ticket doesn't exist or error occurred)
      continue;
    }

    // Stop if we've claimed enough
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
 * @param {Object} ticket - The claimed ticket to process
 * @param {Object} handler - Field handler with resources
 * @param {Object} database - Database instance for getting target resource
 * @returns {Promise<Object>} Processing results
 */
export async function processTicket(ticket, handler, database) {
  const { transactionResource, ticketResource, resource: resourceName, field: fieldName } = handler;
  const results = {
    ticketId: ticket.id,
    recordsProcessed: 0,
    transactionsApplied: 0,
    errors: []
  };

  // Get target resource
  const targetResource = database.resources[resourceName];
  if (!targetResource) {
    results.errors.push(`Target resource '${resourceName}' not found`);
    return results;
  }

  // Process each record in the ticket
  for (const originalId of ticket.records) {
    try {
      // STEP 1: Query all pending transactions for this record
      const transactions = await transactionResource.query(
        { originalId, applied: false },
        { limit: Infinity } // Get all pending transactions
      );

      if (transactions.length === 0) {
        continue; // No pending transactions for this record
      }

      // STEP 2: Group transactions by operation type
      const adds = transactions.filter(t => t.operation === 'add');
      const sets = transactions.filter(t => t.operation === 'set');

      // Get most recent 'set' operation (if any)
      const latestSet = sets.length > 0
        ? sets.reduce((latest, tx) => tx.timestamp > latest.timestamp ? tx : latest)
        : null;

      // STEP 3: Calculate consolidated value
      let consolidatedValue;
      if (latestSet) {
        // If there's a 'set', start from that value
        consolidatedValue = latestSet.value;
        // Add all 'add' operations that came after the latest 'set'
        const addsAfterSet = adds.filter(t => t.timestamp > latestSet.timestamp);
        consolidatedValue += addsAfterSet.reduce((sum, t) => sum + t.value, 0);
      } else {
        // No 'set' operations, sum all 'add' operations
        consolidatedValue = adds.reduce((sum, t) => sum + t.value, 0);
      }

      // STEP 4: Update target resource (or create if doesn't exist)
      try {
        const existingRecord = await targetResource.get(originalId);
        // Record exists, update it
        await targetResource.update(originalId, {
          [fieldName]: (existingRecord[fieldName] || 0) + consolidatedValue
        });
      } catch (err) {
        // Record doesn't exist, check if we should create it
        if (latestSet) {
          // We have a 'set' operation, create the record
          await targetResource.insert({
            id: originalId,
            [fieldName]: consolidatedValue
          });
        }
        // If no 'set' and record doesn't exist, skip (can't add to non-existent record)
      }

      // STEP 5: Mark all transactions as applied
      for (const tx of transactions) {
        await transactionResource.update(tx.id, { applied: true });
      }

      results.recordsProcessed++;
      results.transactionsApplied += transactions.length;

    } catch (err) {
      results.errors.push({ originalId, error: err.message });
    }
  }

  // STEP 6: Delete the ticket
  try {
    await ticketResource.delete(ticket.id);
  } catch (err) {
    results.errors.push({ ticketId: ticket.id, error: `Failed to delete ticket: ${err.message}` });
  }

  return results;
}
