/**
 * Lazy-loaded replicators to avoid loading peer dependencies at initialization.
 *
 * Peer dependencies by replicator:
 * - bigquery: @google-cloud/bigquery, google-auth-library
 * - dynamodb: @aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb
 * - mongodb: mongodb
 * - mysql: mysql2
 * - planetscale: @planetscale/database
 * - postgres: pg
 * - s3db: (none - uses core s3db.js)
 * - sqs: @aws-sdk/client-sqs
 * - turso: @libsql/client
 * - webhook: (none - uses fetch)
 *
 * Usage:
 *   const BigqueryReplicator = await loadBigqueryReplicator();
 *   const replicator = new BigqueryReplicator({ ... });
 *
 * Or use createReplicator() for dynamic driver selection:
 *   const replicator = await createReplicator('bigquery', config);
 */

import { ReplicationError } from '../replicator.errors.js';
import type { BaseReplicator, BaseReplicatorConfig } from './base-replicator.class.js';

export { default as BaseReplicator } from './base-replicator.class.js';
export type { BaseReplicatorConfig, ReplicatorStatus, BatchProcessOptions, BatchProcessResult, ValidationResult, ErrorDetails } from './base-replicator.class.js';
export { ReplicationError };

export { default as S3dbReplicator } from './s3db-replicator.class.js';
export { default as WebhookReplicator } from './webhook-replicator.class.js';
export { default as SqsReplicator } from './sqs-replicator.class.js';

type ReplicatorConstructor = new (config?: BaseReplicatorConfig, resources?: unknown[], client?: unknown) => BaseReplicator;

type ReplicatorLoader = () => Promise<ReplicatorConstructor>;

const REPLICATOR_LOADERS: Record<string, ReplicatorLoader> = {
  s3db: () => import('./s3db-replicator.class.js').then(m => m.default as unknown as ReplicatorConstructor),
  sqs: () => import('./sqs-replicator.class.js').then(m => m.default as unknown as ReplicatorConstructor),
  bigquery: () => import('./bigquery-replicator.class.js').then(m => m.default as unknown as ReplicatorConstructor),
  postgres: () => import('./postgres-replicator.class.js').then(m => m.default as unknown as ReplicatorConstructor),
  mysql: () => import('./mysql-replicator.class.js').then(m => m.default as unknown as ReplicatorConstructor),
  mariadb: () => import('./mysql-replicator.class.js').then(m => m.default as unknown as ReplicatorConstructor),
  planetscale: () => import('./planetscale-replicator.class.js').then(m => m.default as unknown as ReplicatorConstructor),
  turso: () => import('./turso-replicator.class.js').then(m => m.default as unknown as ReplicatorConstructor),
  dynamodb: () => import('./dynamodb-replicator.class.js').then(m => m.default as unknown as ReplicatorConstructor),
  mongodb: () => import('./mongodb-replicator.class.js').then(m => m.default as unknown as ReplicatorConstructor),
  webhook: () => import('./webhook-replicator.class.js').then(m => m.default as unknown as ReplicatorConstructor),
};

export async function createReplicator(
  driver: string,
  config: BaseReplicatorConfig = {},
  resources: unknown[] = [],
  client: unknown = null
): Promise<BaseReplicator> {
  const loader = REPLICATOR_LOADERS[driver];

  if (!loader) {
    throw new ReplicationError(`Unknown replicator driver: ${driver}`, {
      operation: 'createReplicator',
      driver,
      availableDrivers: Object.keys(REPLICATOR_LOADERS),
      suggestion: `Use one of the available drivers: ${Object.keys(REPLICATOR_LOADERS).join(', ')}`
    });
  }

  const ReplicatorClass = await loader();
  return new ReplicatorClass(config, resources, client);
}

export async function validateReplicatorConfig(
  driver: string,
  config: BaseReplicatorConfig,
  resources: unknown[] = [],
  client: unknown = null
): Promise<{ isValid: boolean; errors: string[] }> {
  const replicator = await createReplicator(driver, config, resources, client);
  return replicator.validateConfig();
}

export const loadBigqueryReplicator = (): Promise<ReplicatorConstructor> => REPLICATOR_LOADERS.bigquery!();
export const loadDynamoDBReplicator = (): Promise<ReplicatorConstructor> => REPLICATOR_LOADERS.dynamodb!();
export const loadMongoDBReplicator = (): Promise<ReplicatorConstructor> => REPLICATOR_LOADERS.mongodb!();
export const loadMySQLReplicator = (): Promise<ReplicatorConstructor> => REPLICATOR_LOADERS.mysql!();
export const loadPlanetScaleReplicator = (): Promise<ReplicatorConstructor> => REPLICATOR_LOADERS.planetscale!();
export const loadPostgresReplicator = (): Promise<ReplicatorConstructor> => REPLICATOR_LOADERS.postgres!();
export const loadSqsReplicator = (): Promise<ReplicatorConstructor> => REPLICATOR_LOADERS.sqs!();
export const loadTursoReplicator = (): Promise<ReplicatorConstructor> => REPLICATOR_LOADERS.turso!();
