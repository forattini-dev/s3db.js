import BaseReplicator from './base-replicator.class.js';
import tryFn from "../../concerns/try-fn.js";

/**
 * BigQuery Replicator
 *
 * Replicates data to Google BigQuery tables, supporting per-resource table mapping and action filtering.
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
 * @config {Object} [config.credentials] - (Optional) Google service account credentials object (JSON). If omitted, uses default credentials.
 * @config {string} [config.location='US'] - (Optional) BigQuery dataset location/region
 * @config {string} [config.logTable] - (Optional) Table name for operation logging. If omitted, no logging is performed.
 * @config {Object} resources - Resource configuration mapping
 * @config {Object|string} resources[resourceName] - Resource configuration
 * @config {string} resources[resourceName].table - Table name for this resource
 * @config {Array} resources[resourceName].actions - Array of actions to replicate (insert, update, delete)
 * @config {string} resources[resourceName] - Short form: just the table name (equivalent to { actions: ['insert'], table: tableName })
 *
 * @example
 * new BigqueryReplicator({
 *   projectId: 'my-gcp-project',
 *   datasetId: 'analytics',
 *   location: 'US',
 *   credentials: require('./gcp-service-account.json'),
 *   logTable: 's3db_replicator_log'
 * }, {
 *   users: [
 *     { actions: ['insert', 'update', 'delete'], table: 'users_table' },
 *   ],
 *   urls: [
 *     { actions: ['insert'], table: 'urls_table' },
 *     { actions: ['insert'], table: 'urls_table_v2' },
 *   ],
 *   clicks: 'clicks_table' // equivalent to { actions: ['insert'], table: 'clicks_table' }
 * })
 *
 * Notes:
 * - The target tables must exist and have columns matching the resource attributes (id is required as primary key)
 * - The log table must have columns: resource_name, operation, record_id, data, timestamp, source
 * - Uses @google-cloud/bigquery SDK
 */
class BigqueryReplicator extends BaseReplicator {
  constructor(config = {}, resources = {}) {
    super(config);
    this.projectId = config.projectId;
    this.datasetId = config.datasetId;
    this.bigqueryClient = null;
    this.credentials = config.credentials;
    this.location = config.location || 'US';
    this.logTable = config.logTable;
    
    // Parse resources configuration
    this.resources = this.parseResourcesConfig(resources);
  }

  parseResourcesConfig(resources) {
    const parsed = {};
    
    for (const [resourceName, config] of Object.entries(resources)) {
      if (typeof config === 'string') {
        // Short form: just table name
        parsed[resourceName] = [{
          table: config,
          actions: ['insert']
        }];
      } else if (Array.isArray(config)) {
        // Array form: multiple table mappings
        parsed[resourceName] = config.map(item => {
          if (typeof item === 'string') {
            return { table: item, actions: ['insert'] };
          }
          return {
            table: item.table,
            actions: item.actions || ['insert']
          };
        });
      } else if (typeof config === 'object') {
        // Single object form
        parsed[resourceName] = [{
          table: config.table,
          actions: config.actions || ['insert']
        }];
      }
    }
    
    return parsed;
  }

  validateConfig() {
    const errors = [];
    if (!this.projectId) errors.push('projectId is required');
    if (!this.datasetId) errors.push('datasetId is required');
    if (Object.keys(this.resources).length === 0) errors.push('At least one resource must be configured');
    
    // Validate resource configurations
    for (const [resourceName, tables] of Object.entries(this.resources)) {
      for (const tableConfig of tables) {
        if (!tableConfig.table) {
          errors.push(`Table name is required for resource '${resourceName}'`);
        }
        if (!Array.isArray(tableConfig.actions) || tableConfig.actions.length === 0) {
          errors.push(`Actions array is required for resource '${resourceName}'`);
        }
        const validActions = ['insert', 'update', 'delete'];
        const invalidActions = tableConfig.actions.filter(action => !validActions.includes(action));
        if (invalidActions.length > 0) {
          errors.push(`Invalid actions for resource '${resourceName}': ${invalidActions.join(', ')}. Valid actions: ${validActions.join(', ')}`);
        }
      }
    }
    
    return { isValid: errors.length === 0, errors };
  }

  async initialize(database) {
    await super.initialize(database);
    const [ok, err, sdk] = await tryFn(() => import('@google-cloud/bigquery'));
    if (!ok) {
      this.emit('initialization_error', { replicator: this.name, error: err.message });
      throw err;
    }
    const { BigQuery } = sdk;
    this.bigqueryClient = new BigQuery({
      projectId: this.projectId,
      credentials: this.credentials,
      location: this.location
    });
    this.emit('initialized', {
      replicator: this.name,
      projectId: this.projectId,
      datasetId: this.datasetId,
      resources: Object.keys(this.resources)
    });
  }

  shouldReplicateResource(resourceName) {
    return this.resources.hasOwnProperty(resourceName);
  }

  shouldReplicateAction(resourceName, operation) {
    if (!this.resources[resourceName]) return false;
    
    return this.resources[resourceName].some(tableConfig => 
      tableConfig.actions.includes(operation)
    );
  }

  getTablesForResource(resourceName, operation) {
    if (!this.resources[resourceName]) return [];
    
    return this.resources[resourceName]
      .filter(tableConfig => tableConfig.actions.includes(operation))
      .map(tableConfig => tableConfig.table);
  }

  async replicate(resourceName, operation, data, id, beforeData = null) {
    
    if (!this.enabled || !this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: 'resource_not_included' };
    }

    if (!this.shouldReplicateAction(resourceName, operation)) {
      return { skipped: true, reason: 'action_not_included' };
    }

    const tables = this.getTablesForResource(resourceName, operation);
    if (tables.length === 0) {
      return { skipped: true, reason: 'no_tables_for_action' };
    }

    const results = [];
    const errors = [];

    const [ok, err, result] = await tryFn(async () => {
      const dataset = this.bigqueryClient.dataset(this.datasetId);
      // Replicate to all applicable tables
      for (const tableId of tables) {
        const [okTable, errTable] = await tryFn(async () => {
          const table = dataset.table(tableId);
          let job;
          if (operation === 'insert') {
            const row = { ...data };
            job = await table.insert([row]);
          } else if (operation === 'update') {
            const keys = Object.keys(data).filter(k => k !== 'id');
            const setClause = keys.map(k => `${k}=@${k}`).join(', ');
            const params = { id };
            keys.forEach(k => { params[k] = data[k]; });
            const query = `UPDATE \`${this.projectId}.${this.datasetId}.${tableId}\` SET ${setClause} WHERE id=@id`;
            const [updateJob] = await this.bigqueryClient.createQueryJob({
              query,
              params
            });
            await updateJob.getQueryResults();
            job = [updateJob];
          } else if (operation === 'delete') {
            const query = `DELETE FROM \`${this.projectId}.${this.datasetId}.${tableId}\` WHERE id=@id`;
            const [deleteJob] = await this.bigqueryClient.createQueryJob({
              query,
              params: { id }
            });
            await deleteJob.getQueryResults();
            job = [deleteJob];
          } else {
            throw new Error(`Unsupported operation: ${operation}`);
          }
          results.push({
            table: tableId,
            success: true,
            jobId: job[0]?.id
          });
        });
        if (!okTable) {
          errors.push({
            table: tableId,
            error: errTable.message
          });
        }
      }
      // Log operation if logTable is configured
      if (this.logTable) {
        const [okLog, errLog] = await tryFn(async () => {
          const logTable = dataset.table(this.logTable);
          await logTable.insert([{
            resource_name: resourceName,
            operation,
            record_id: id,
            data: JSON.stringify(data),
            timestamp: new Date().toISOString(),
            source: 's3db-replicator'
          }]);
        });
        if (!okLog) {
          // Don't fail the main operation if logging fails
        }
      }
      const success = errors.length === 0;
      this.emit('replicated', {
        replicator: this.name,
        resourceName,
        operation,
        id,
        tables,
        results,
        errors,
        success
      });
      return { 
        success, 
        results, 
        errors,
        tables 
      };
    });
    if (ok) return result;
    this.emit('replicator_error', {
      replicator: this.name,
      resourceName,
      operation,
      id,
      error: err.message
    });
    return { success: false, error: err.message };
  }

  async replicateBatch(resourceName, records) {
    const results = [];
    const errors = [];
    
    for (const record of records) {
      const [ok, err, res] = await tryFn(() => this.replicate(
        resourceName, 
        record.operation, 
        record.data, 
        record.id, 
        record.beforeData
      ));
      if (ok) results.push(res);
      else errors.push({ id: record.id, error: err.message });
    }
    
    return { 
      success: errors.length === 0, 
      results, 
      errors 
    };
  }

  async testConnection() {
    const [ok, err] = await tryFn(async () => {
      if (!this.bigqueryClient) await this.initialize();
      const dataset = this.bigqueryClient.dataset(this.datasetId);
      await dataset.getMetadata();
      return true;
    });
    if (ok) return true;
    this.emit('connection_error', { replicator: this.name, error: err.message });
    return false;
  }

  async cleanup() {
    // BigQuery SDK doesn't need cleanup
  }

  getStatus() {
    return {
      ...super.getStatus(),
      projectId: this.projectId,
      datasetId: this.datasetId,
      resources: this.resources,
      logTable: this.logTable
    };
  }
}

export default BigqueryReplicator; 