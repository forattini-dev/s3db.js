import BaseReplicator from './base-replicator.class.js';

/**
 * BigQuery Replicator
 *
 * Replicates data to Google BigQuery tables, supporting per-resource table mapping and real insert/update/delete operations.
 *
 * ⚠️  REQUIRED DEPENDENCY: You must install the Google Cloud BigQuery SDK to use this replicator:
 *
 * ```bash
 * npm install @google-cloud/bigquery
 * # or
 * yarn add @google-cloud/bigquery
 * # or
 * pnpm add @google-cloud/bigquery
 * ```
 *
 * @config {Object} config - Configuration object for the replicator
 * @config {string} config.projectId - (Required) Google Cloud project ID
 * @config {string} config.datasetId - (Required) BigQuery dataset ID
 * @config {string} config.tableId - (Required) Default table ID for logging and as fallback for data tables
 * @config {Object} [config.tableMap] - (Optional) Map of resourceName -> tableId for per-resource table mapping. Example: { users: 'users_table', orders: 'orders_table' }
 * @config {Object} [config.credentials] - (Optional) Google service account credentials object (JSON). If omitted, uses default credentials.
 * @config {string} [config.location='US'] - (Optional) BigQuery dataset location/region
 * @config {boolean} [config.logOperations=true] - (Optional) If true, logs all operations to the default tableId as an audit log
 *
 * @example
 * new BigqueryReplicator({
 *   projectId: 'my-gcp-project',
 *   datasetId: 'analytics',
 *   tableId: 's3db_replication_log',
 *   tableMap: { users: 'users_table', orders: 'orders_table' },
 *   credentials: require('./gcp-service-account.json'),
 *   location: 'US',
 *   logOperations: true
 * }, ['users', 'orders'])
 *
 * - Each resource will be replicated to its mapped table (or tableId if not mapped)
 * - All operations are also logged to the log table if logOperations=true
 * - Insert: inserts a row with all object fields as columns
 * - Update: updates columns by id (uses SQL query)
 * - Delete: deletes row by id (uses SQL query)
 *
 * Notes:
 * - The target tables must exist and have columns matching the resource attributes (id is required as primary key)
 * - The log table (tableId) must have columns: resource_name, operation, record_id, data, timestamp, source
 * - Uses @google-cloud/bigquery SDK
 */
class BigqueryReplicator extends BaseReplicator {
  constructor(config = {}, resources = []) {
    super(config);
    this.resources = resources;
    this.projectId = config.projectId;
    this.datasetId = config.datasetId;
    this.tableId = config.tableId;
    this.tableMap = config.tableMap || {}; // { resourceName: tableId }
    this.bigqueryClient = null;
    this.credentials = config.credentials;
    this.location = config.location || 'US';
    this.logOperations = config.logOperations !== false; // default true
  }

  validateConfig() {
    const errors = [];
    if (!this.projectId) errors.push('projectId is required');
    if (!this.datasetId) errors.push('datasetId is required');
    if (!this.tableId) errors.push('tableId is required');
    return { isValid: errors.length === 0, errors };
  }

  async initialize(database) {
    await super.initialize(database);
    try {
      const { BigQuery } = await import('@google-cloud/bigquery');
      this.bigqueryClient = new BigQuery({
        projectId: this.projectId,
        credentials: this.credentials,
        location: this.location
      });
      this.emit('initialized', {
        replicator: this.name,
        projectId: this.projectId,
        datasetId: this.datasetId,
        tableId: this.tableId
      });
    } catch (error) {
      this.emit('initialization_error', { replicator: this.name, error: error.message });
      throw error;
    }
  }

  getTableForResource(resourceName) {
    return this.tableMap[resourceName] || this.tableId;
  }

  async replicate(resourceName, operation, data, id, beforeData = null) {
    if (!this.enabled || !this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: 'resource_not_included' };
    }
    try {
      const dataset = this.bigqueryClient.dataset(this.datasetId);
      const tableId = this.getTableForResource(resourceName);
      const table = dataset.table(tableId);
      let job;
      if (operation === 'insert') {
        // Insert row with object fields as columns
        const row = { ...data };
        job = await table.insert([row]);
      } else if (operation === 'update') {
        // BigQuery não tem update direto via SDK, então faz via query
        const keys = Object.keys(data).filter(k => k !== 'id');
        const setClause = keys.map(k => `
          ${k}=@${k}
        `).join(', ');
        const params = { id };
        keys.forEach(k => { params[k] = data[k]; });
        const query = `UPDATE \
          \`${this.projectId}.${this.datasetId}.${tableId}\`\n        SET ${setClause}\n        WHERE id=@id`;
        const [updateJob] = await this.bigqueryClient.createQueryJob({
          query,
          params
        });
        await updateJob.getQueryResults();
        job = [updateJob];
      } else if (operation === 'delete') {
        const query = `DELETE FROM \
          \`${this.projectId}.${this.datasetId}.${tableId}\`\n        WHERE id=@id`;
        const [deleteJob] = await this.bigqueryClient.createQueryJob({
          query,
          params: { id }
        });
        await deleteJob.getQueryResults();
        job = [deleteJob];
      } else {
        throw new Error(`Unsupported operation: ${operation}`);
      }
      // Optionally log the operation
      if (this.logOperations) {
        const logTable = dataset.table(this.tableId);
        await logTable.insert([{
          resource_name: resourceName,
          operation,
          record_id: id,
          data: JSON.stringify(data),
          timestamp: new Date().toISOString(),
          source: 's3db-replication'
        }]);
      }
      this.emit('replicated', {
        replicator: this.name,
        resourceName,
        operation,
        id,
        jobId: job[0]?.id,
        success: true
      });
      return { success: true, jobId: job[0]?.id };
    } catch (error) {
      this.emit('replication_error', {
        replicator: this.name,
        resourceName,
        operation,
        id,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  async replicateBatch(resourceName, records) {
    // For simplicity, just call replicate for each
    const results = [];
    const errors = [];
    for (const record of records) {
      try {
        const res = await this.replicate(resourceName, record.operation, record.data, record.id, record.beforeData);
        results.push(res);
      } catch (err) {
        errors.push({ id: record.id, error: err.message });
      }
    }
    return { success: errors.length === 0, results, errors };
  }

  async testConnection() {
    try {
      if (!this.bigqueryClient) await this.initialize();
      const dataset = this.bigqueryClient.dataset(this.datasetId);
      await dataset.getMetadata();
      return true;
    } catch (error) {
      this.emit('connection_error', { replicator: this.name, error: error.message });
      return false;
    }
  }

  async cleanup() {
    // BigQuery SDK não precisa de cleanup
  }

  shouldReplicateResource(resourceName) {
    if (!this.resources || this.resources.length === 0) return true;
    return this.resources.includes(resourceName);
  }
}

export default BigqueryReplicator; 