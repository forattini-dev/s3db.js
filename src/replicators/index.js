import BaseReplicator from './base-replicator.class.js';
import S3dbReplicator from './s3db-replicator.class.js';
import SqsReplicator from './sqs-replicator.class.js';
import BigqueryReplicator from './bigquery-replicator.class.js';
import PostgresReplicator from './postgres-replicator.class.js';

/**
 * Available replicator drivers
 */
export const REPLICATOR_DRIVERS = {
  s3db: S3dbReplicator,
  sqs: SqsReplicator,
  bigquery: BigqueryReplicator,
  postgres: PostgresReplicator
};

/**
 * Create a replicator instance based on driver type
 * @param {string} driver - Driver type (s3db, sqs, bigquery, postgres)
 * @param {Object} config - Replicator configuration
 * @returns {BaseReplicator} Replicator instance
 */
export function createReplicator(driver, config = {}, resources = []) {
  const ReplicatorClass = REPLICATOR_DRIVERS[driver];
  
  if (!ReplicatorClass) {
    throw new Error(`Unknown replicator driver: ${driver}. Available drivers: ${Object.keys(REPLICATOR_DRIVERS).join(', ')}`);
  }
  
  return new ReplicatorClass(config, resources);
}

/**
 * Validate replicator configuration
 * @param {string} driver - Driver type
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result
 */
export function validateReplicatorConfig(driver, config, resources = []) {
  const replicator = createReplicator(driver, config, resources);
  return replicator.validateConfig();
}

// Export all replicator classes
export {
  BaseReplicator,
  S3dbReplicator,
  SqsReplicator,
  BigqueryReplicator,
  PostgresReplicator
};

export default {
  BaseReplicator,
  S3dbReplicator,
  SqsReplicator,
  BigqueryReplicator,
  PostgresReplicator,
  REPLICATOR_DRIVERS,
  createReplicator,
  validateReplicatorConfig
}; 