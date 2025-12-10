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
export declare function createReplicator(driver: string, config?: BaseReplicatorConfig, resources?: unknown[], client?: unknown): Promise<BaseReplicator>;
export declare function validateReplicatorConfig(driver: string, config: BaseReplicatorConfig, resources?: unknown[], client?: unknown): Promise<{
    isValid: boolean;
    errors: string[];
}>;
export declare const loadBigqueryReplicator: () => Promise<ReplicatorConstructor>;
export declare const loadDynamoDBReplicator: () => Promise<ReplicatorConstructor>;
export declare const loadMongoDBReplicator: () => Promise<ReplicatorConstructor>;
export declare const loadMySQLReplicator: () => Promise<ReplicatorConstructor>;
export declare const loadPlanetScaleReplicator: () => Promise<ReplicatorConstructor>;
export declare const loadPostgresReplicator: () => Promise<ReplicatorConstructor>;
export declare const loadSqsReplicator: () => Promise<ReplicatorConstructor>;
export declare const loadTursoReplicator: () => Promise<ReplicatorConstructor>;
//# sourceMappingURL=index.d.ts.map