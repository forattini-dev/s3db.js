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
export { default as BaseReplicator } from './base-replicator.class.js';
export { ReplicationError };
export { default as S3dbReplicator } from './s3db-replicator.class.js';
export { default as WebhookReplicator } from './webhook-replicator.class.js';
export { default as SqsReplicator } from './sqs-replicator.class.js';
const REPLICATOR_LOADERS = {
    s3db: () => import('./s3db-replicator.class.js').then(m => m.default),
    sqs: () => import('./sqs-replicator.class.js').then(m => m.default),
    bigquery: () => import('./bigquery-replicator.class.js').then(m => m.default),
    postgres: () => import('./postgres-replicator.class.js').then(m => m.default),
    mysql: () => import('./mysql-replicator.class.js').then(m => m.default),
    mariadb: () => import('./mysql-replicator.class.js').then(m => m.default),
    planetscale: () => import('./planetscale-replicator.class.js').then(m => m.default),
    turso: () => import('./turso-replicator.class.js').then(m => m.default),
    dynamodb: () => import('./dynamodb-replicator.class.js').then(m => m.default),
    mongodb: () => import('./mongodb-replicator.class.js').then(m => m.default),
    webhook: () => import('./webhook-replicator.class.js').then(m => m.default),
};
export async function createReplicator(driver, config = {}, resources = [], client = null) {
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
export async function validateReplicatorConfig(driver, config, resources = [], client = null) {
    const replicator = await createReplicator(driver, config, resources, client);
    return replicator.validateConfig();
}
export const loadBigqueryReplicator = () => REPLICATOR_LOADERS.bigquery();
export const loadDynamoDBReplicator = () => REPLICATOR_LOADERS.dynamodb();
export const loadMongoDBReplicator = () => REPLICATOR_LOADERS.mongodb();
export const loadMySQLReplicator = () => REPLICATOR_LOADERS.mysql();
export const loadPlanetScaleReplicator = () => REPLICATOR_LOADERS.planetscale();
export const loadPostgresReplicator = () => REPLICATOR_LOADERS.postgres();
export const loadSqsReplicator = () => REPLICATOR_LOADERS.sqs();
export const loadTursoReplicator = () => REPLICATOR_LOADERS.turso();
//# sourceMappingURL=index.js.map