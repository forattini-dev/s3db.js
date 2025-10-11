/**
 * Partition configuration for EventualConsistencyPlugin
 * @module eventual-consistency/partitions
 */

/**
 * Create partition configuration for transaction resources
 * This defines how transactions are organized in S3 for O(1) query performance
 *
 * @returns {Object} Partition configuration
 */
export function createPartitionConfig() {
  // Create partitions for transactions
  const partitions = {
    // Composite partition by originalId + applied status
    // This is THE MOST CRITICAL optimization for consolidation!
    // Why: Consolidation always queries { originalId, applied: false }
    // Without this: Reads ALL transactions (applied + pending) and filters manually
    // With this: Reads ONLY pending transactions - can be 1000x faster!
    byOriginalIdAndApplied: {
      fields: {
        originalId: 'string',
        applied: 'boolean'
      }
    },
    // Partition by time cohorts for batch consolidation across many records
    byHour: {
      fields: {
        cohortHour: 'string'
      }
    },
    byDay: {
      fields: {
        cohortDate: 'string'
      }
    },
    byWeek: {
      fields: {
        cohortWeek: 'string'
      }
    },
    byMonth: {
      fields: {
        cohortMonth: 'string'
      }
    }
  };

  return partitions;
}
