import tryFn from "#src/concerns/try-fn.js";

import BaseReplicator from './base-replicator.class.js';

/**
 * BigQuery Replicator - Replicate data to Google BigQuery tables
 * 
 * ⚠️  REQUIRED DEPENDENCY: You must install the Google Cloud BigQuery SDK:
 * ```bash
 * pnpm add @google-cloud/bigquery
 * ```
 * 
 * Configuration:
 * @param {string} projectId - Google Cloud project ID (required)
 * @param {string} datasetId - BigQuery dataset ID (required) 
 * @param {Object} credentials - Service account credentials object (optional)
 * @param {string} location - BigQuery dataset location/region (default: 'US')
 * @param {string} logTable - Table name for operation logging (optional)
 * 
 * @example
 * new BigqueryReplicator({
 *   projectId: 'my-gcp-project',
 *   datasetId: 'analytics',
 *   credentials: JSON.parse(Buffer.from(GOOGLE_CREDENTIALS, 'base64').toString())
 * }, {
 *   users: {
 *     table: 'users_table',
 *     transform: (data) => ({ ...data, ip: data.ip || 'unknown' })
 *   },
 *   orders: 'orders_table'
 * })
 * 
 * See PLUGINS.md for comprehensive configuration documentation.
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
          actions: ['insert'],
          transform: null
        }];
      } else if (Array.isArray(config)) {
        // Array form: multiple table mappings
        parsed[resourceName] = config.map(item => {
          if (typeof item === 'string') {
            return { table: item, actions: ['insert'], transform: null };
          }
          return {
            table: item.table,
            actions: item.actions || ['insert'],
            transform: item.transform || null
          };
        });
      } else if (typeof config === 'object') {
        // Single object form
        parsed[resourceName] = [{
          table: config.table,
          actions: config.actions || ['insert'],
          transform: config.transform || null
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
        if (tableConfig.transform && typeof tableConfig.transform !== 'function') {
          errors.push(`Transform must be a function for resource '${resourceName}'`);
        }
      }
    }
    
    return { isValid: errors.length === 0, errors };
  }

  async initialize(database) {
    await super.initialize(database);
    const [ok, err, sdk] = await tryFn(() => import('@google-cloud/bigquery'));
    if (!ok) {
      if (this.config.verbose) {
        console.warn(`[BigqueryReplicator] Failed to import BigQuery SDK: ${err.message}`);
      }
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
      .map(tableConfig => ({
        table: tableConfig.table,
        transform: tableConfig.transform
      }));
  }

  applyTransform(data, transformFn) {
    if (!transformFn) return data;
    
    let transformedData = JSON.parse(JSON.stringify(data));
    if (transformedData._length) delete transformedData._length;
    
    return transformFn(transformedData);
  }

  async replicate(resourceName, operation, data, id, beforeData = null) {
    
    if (!this.enabled || !this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: 'resource_not_included' };
    }

    if (!this.shouldReplicateAction(resourceName, operation)) {
      return { skipped: true, reason: 'action_not_included' };
    }

    const tableConfigs = this.getTablesForResource(resourceName, operation);
    if (tableConfigs.length === 0) {
      return { skipped: true, reason: 'no_tables_for_action' };
    }

    const results = [];
    const errors = [];

    const [ok, err, result] = await tryFn(async () => {
      const dataset = this.bigqueryClient.dataset(this.datasetId);
      
      // Replicate to all applicable tables
      for (const tableConfig of tableConfigs) {
        const [okTable, errTable] = await tryFn(async () => {
          const table = dataset.table(tableConfig.table);
          let job;
          
          if (operation === 'insert') {
            const transformedData = this.applyTransform(data, tableConfig.transform);
            job = await table.insert([transformedData]);
          } else if (operation === 'update') {
            const transformedData = this.applyTransform(data, tableConfig.transform);
            const keys = Object.keys(transformedData).filter(k => k !== 'id');
            const setClause = keys.map(k => `${k} = @${k}`).join(', ');
            const params = { id, ...transformedData };
            const query = `UPDATE \`${this.projectId}.${this.datasetId}.${tableConfig.table}\` SET ${setClause} WHERE id = @id`;
            
            // Retry logic for streaming buffer issues
            const maxRetries = 2;
            let lastError = null;
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              const [ok, error] = await tryFn(async () => {
                const [updateJob] = await this.bigqueryClient.createQueryJob({
                  query,
                  params,
                  location: this.location
                });
                await updateJob.getQueryResults();
                return [updateJob];
              });
              
              if (ok) {
                job = ok;
                break;
              } else {
                lastError = error;
                
                if (this.config.verbose) {
                  console.warn(`[BigqueryReplicator] Update attempt ${attempt} failed: ${error.message}`);
                }
                
                // If it's streaming buffer error and not the last attempt
                if (error?.message?.includes('streaming buffer') && attempt < maxRetries) {
                  const delaySeconds = 30;
                  if (this.config.verbose) {
                    console.warn(`[BigqueryReplicator] Retrying in ${delaySeconds} seconds due to streaming buffer issue`);
                  }
                  await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
                  continue;
                }
                
                throw error;
              }
            }
            
            if (!job) throw lastError;
          } else if (operation === 'delete') {
            const query = `DELETE FROM \`${this.projectId}.${this.datasetId}.${tableConfig.table}\` WHERE id = @id`;
            const [deleteJob] = await this.bigqueryClient.createQueryJob({
              query,
              params: { id },
              location: this.location
            });
            await deleteJob.getQueryResults();
            job = [deleteJob];
          } else {
            throw new Error(`Unsupported operation: ${operation}`);
          }
          
          results.push({
            table: tableConfig.table,
            success: true,
            jobId: job[0]?.id
          });
        });
        
        if (!okTable) {
          errors.push({
            table: tableConfig.table,
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
        tables: tableConfigs.map(t => t.table),
        results,
        errors,
        success
      });
      
      return { 
        success, 
        results, 
        errors,
        tables: tableConfigs.map(t => t.table)
      };
    });
    
    if (ok) return result;
    
    if (this.config.verbose) {
      console.warn(`[BigqueryReplicator] Replication failed for ${resourceName}: ${err.message}`);
    }
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
      if (ok) {
        results.push(res);
      } else {
        if (this.config.verbose) {
          console.warn(`[BigqueryReplicator] Batch replication failed for record ${record.id}: ${err.message}`);
        }
        errors.push({ id: record.id, error: err.message });
      }
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
    if (this.config.verbose) {
      console.warn(`[BigqueryReplicator] Connection test failed: ${err.message}`);
    }
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