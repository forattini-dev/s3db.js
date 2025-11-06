import tryFn from "#src/concerns/try-fn.js";
import requirePluginDependency from "#src/plugins/concerns/plugin-dependencies.js";
import BaseReplicator from './base-replicator.class.js';
import {
  generateBigQuerySchema,
  getBigQueryTableSchema,
  generateBigQuerySchemaUpdate
} from './schema-sync.helper.js';

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
 * @param {Object} schemaSync - Schema synchronization configuration
 * @param {boolean} schemaSync.enabled - Enable automatic schema management (default: false)
 * @param {string} schemaSync.strategy - Sync strategy: 'alter' | 'drop-create' | 'validate-only' (default: 'alter')
 * @param {string} schemaSync.onMismatch - Action on schema mismatch: 'error' | 'warn' | 'ignore' (default: 'error')
 * @param {boolean} schemaSync.autoCreateTable - Auto-create table if not exists (default: true)
 * @param {boolean} schemaSync.autoCreateColumns - Auto-add missing columns (default: true, only with strategy: 'alter')
 * @param {string} mutability - Global mutability mode: 'append-only' | 'mutable' | 'immutable' (default: 'append-only')
 *   - 'append-only': Updates/deletes become inserts with _operation_type and _operation_timestamp (most performant, no streaming buffer issues)
 *   - 'mutable': Traditional UPDATE/DELETE queries with streaming buffer retry logic
 *   - 'immutable': Full audit trail with _operation_type, _operation_timestamp, _is_deleted, _version fields
 *
 * @example
 * new BigqueryReplicator({
 *   projectId: 'my-gcp-project',
 *   datasetId: 'analytics',
 *   credentials: JSON.parse(Buffer.from(GOOGLE_CREDENTIALS, 'base64').toString()),
 *   mutability: 'append-only', // Global default
 *   schemaSync: {
 *     enabled: true,
 *     strategy: 'alter',
 *     onMismatch: 'error'
 *   }
 * }, {
 *   users: {
 *     table: 'users_table',
 *     mutability: 'immutable', // Override for audit trail
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

    // Mutability configuration
    this.mutability = config.mutability || 'append-only';
    this._validateMutability(this.mutability);

    // Schema sync configuration
    this.schemaSync = {
      enabled: config.schemaSync?.enabled || false,
      strategy: config.schemaSync?.strategy || 'alter',
      onMismatch: config.schemaSync?.onMismatch || 'error',
      autoCreateTable: config.schemaSync?.autoCreateTable !== false,
      autoCreateColumns: config.schemaSync?.autoCreateColumns !== false
    };

    // Parse resources configuration
    this.resources = this.parseResourcesConfig(resources);

    // Version tracking for immutable mode
    this.versionCounters = new Map();
  }

  _validateMutability(mutability) {
    const validModes = ['append-only', 'mutable', 'immutable'];
    if (!validModes.includes(mutability)) {
      throw this.createError(`Invalid mutability mode: ${mutability}`, {
        operation: 'config',
        statusCode: 400,
        retriable: false,
        suggestion: `Use one of the supported mutability modes: ${validModes.join(', ')}.`
      });
    }
  }

  parseResourcesConfig(resources) {
    const parsed = {};

    for (const [resourceName, config] of Object.entries(resources)) {
      if (typeof config === 'string') {
        // Short form: just table name
        parsed[resourceName] = [{
          table: config,
          actions: ['insert'],
          transform: null,
          mutability: this.mutability,
          tableOptions: null
        }];
      } else if (Array.isArray(config)) {
        // Array form: multiple table mappings
        parsed[resourceName] = config.map(item => {
          if (typeof item === 'string') {
            return { table: item, actions: ['insert'], transform: null, mutability: this.mutability, tableOptions: null };
          }
          const itemMutability = item.mutability || this.mutability;
          this._validateMutability(itemMutability);
          return {
            table: item.table,
            actions: item.actions || ['insert'],
            transform: item.transform || null,
            mutability: itemMutability,
            tableOptions: item.tableOptions || null
          };
        });
      } else if (typeof config === 'object') {
        // Single object form
        const configMutability = config.mutability || this.mutability;
        this._validateMutability(configMutability);
        parsed[resourceName] = [{
          table: config.table,
          actions: config.actions || ['insert'],
          transform: config.transform || null,
          mutability: configMutability,
          tableOptions: config.tableOptions || null
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

    // Validate plugin dependencies are installed
    await requirePluginDependency('bigquery-replicator');

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

    // Sync schemas if enabled
    if (this.schemaSync.enabled) {
      await this.syncSchemas(database);
    }

    this.emit('db:plugin:initialized', {
      replicator: this.name,
      projectId: this.projectId,
      datasetId: this.datasetId,
      resources: Object.keys(this.resources)
    });
  }

  /**
   * Sync table schemas based on S3DB resource definitions
   */
  async syncSchemas(database) {
    for (const [resourceName, tableConfigs] of Object.entries(this.resources)) {
      const [okRes, errRes, resource] = await tryFn(async () => {
        return await database.getResource(resourceName);
      });

      if (!okRes) {
        if (this.config.verbose) {
          console.warn(`[BigQueryReplicator] Could not get resource ${resourceName} for schema sync: ${errRes.message}`);
        }
        continue;
      }

      // Use $schema for reliable access to resource definition
      const allAttributes = resource.$schema.attributes || {};

      // Filter out plugin attributes - they are internal and should not be replicated
      const pluginAttrNames = resource.$schema._pluginAttributes
        ? Object.values(resource.$schema._pluginAttributes).flat()
        : [];
      const attributes = Object.fromEntries(
        Object.entries(allAttributes).filter(([name]) => !pluginAttrNames.includes(name))
      );

      for (const tableConfig of tableConfigs) {
        const tableName = tableConfig.table;
        const mutability = tableConfig.mutability;
        const tableOptions = tableConfig.tableOptions;

        const [okSync, errSync] = await tryFn(async () => {
          await this.syncTableSchema(tableName, attributes, mutability, tableOptions);
        });

        if (!okSync) {
          const message = `Schema sync failed for table ${tableName}: ${errSync.message}`;

          if (this.schemaSync.onMismatch === 'error') {
            throw this.createError(message, {
              operation: 'schemaSync',
              resourceName,
              tableName,
              statusCode: 409,
              retriable: errSync?.retriable ?? false,
              suggestion: 'Review the BigQuery table schema and align it with the S3DB resource definition or relax schemaSync.onMismatch.',
              docs: 'docs/plugins/replicator.md'
            });
          } else if (this.schemaSync.onMismatch === 'warn') {
            console.warn(`[BigQueryReplicator] ${message}`);
          }
        }
      }
    }

    this.emit('schema_sync_completed', {
      replicator: this.name,
      resources: Object.keys(this.resources)
    });
  }

  /**
   * Sync a single table schema in BigQuery
   */
  async syncTableSchema(tableName, attributes, mutability = 'append-only', tableOptions = null) {
    const dataset = this.bigqueryClient.dataset(this.datasetId);
    const table = dataset.table(tableName);

    const normalizedTableOptions = tableOptions
      ? JSON.parse(JSON.stringify(tableOptions))
      : null;

    // Check if table exists
    const [exists] = await table.exists();

    if (!exists) {
      if (!this.schemaSync.autoCreateTable) {
        throw this.createError(`Table ${tableName} does not exist and autoCreateTable is disabled`, {
          operation: 'schemaSync',
          tableName,
          statusCode: 404,
          retriable: false,
          suggestion: 'Create the BigQuery table manually or enable schemaSync.autoCreateTable.'
        });
      }

      if (this.schemaSync.strategy === 'validate-only') {
        throw this.createError(`Table ${tableName} does not exist (validate-only mode)`, {
          operation: 'schemaSync',
          tableName,
          statusCode: 404,
          retriable: false,
          suggestion: 'Provision the table before running validate-only checks or switch the schemaSync.strategy to alter.'
        });
      }

      // Create table with schema (including tracking fields based on mutability)
      const schema = generateBigQuerySchema(attributes, mutability);

      if (this.config.verbose) {
        console.log(`[BigQueryReplicator] Creating table ${tableName} with schema (mutability: ${mutability}):`, schema);
      }

      const createOptions = { schema };
      if (normalizedTableOptions?.timePartitioning) {
        createOptions.timePartitioning = normalizedTableOptions.timePartitioning;
      }
      if (normalizedTableOptions?.clustering) {
        createOptions.clustering = normalizedTableOptions.clustering;
      }

      await dataset.createTable(tableName, createOptions);

      this.emit('table_created', {
        replicator: this.name,
        tableName,
        attributes: Object.keys(attributes),
        mutability
      });

      return;
    }

    // Table exists - check for schema changes
    if (this.schemaSync.strategy === 'drop-create') {
      if (this.config.verbose) {
        console.warn(`[BigQueryReplicator] Dropping and recreating table ${tableName}`);
      }

      await table.delete();
      const schema = generateBigQuerySchema(attributes, mutability);
      const createOptions = { schema };
      if (normalizedTableOptions?.timePartitioning) {
        createOptions.timePartitioning = normalizedTableOptions.timePartitioning;
      }
      if (normalizedTableOptions?.clustering) {
        createOptions.clustering = normalizedTableOptions.clustering;
      }
      await dataset.createTable(tableName, createOptions);

      this.emit('table_recreated', {
        replicator: this.name,
        tableName,
        attributes: Object.keys(attributes),
        mutability
      });

      return;
    }

    if (this.schemaSync.strategy === 'alter' && this.schemaSync.autoCreateColumns) {
      const existingSchema = await getBigQueryTableSchema(this.bigqueryClient, this.datasetId, tableName);
      const newFields = generateBigQuerySchemaUpdate(attributes, existingSchema, mutability);

      if (newFields.length > 0) {
        if (this.config.verbose) {
          console.log(`[BigQueryReplicator] Adding ${newFields.length} field(s) to table ${tableName}:`, newFields);
        }

        // Get current schema
        const [metadata] = await table.getMetadata();
        const currentSchema = metadata.schema.fields;

        // Add new fields to existing schema
        const updatedSchema = [...currentSchema, ...newFields];

        // Update table schema
        await table.setMetadata({ schema: updatedSchema });

        this.emit('table_altered', {
          replicator: this.name,
          tableName,
          addedColumns: newFields.length
        });
      }
    }

    if (this.schemaSync.strategy === 'validate-only') {
      const existingSchema = await getBigQueryTableSchema(this.bigqueryClient, this.datasetId, tableName);
      const newFields = generateBigQuerySchemaUpdate(attributes, existingSchema, mutability);

      if (newFields.length > 0) {
        throw this.createError(`Table ${tableName} schema mismatch. Missing columns: ${newFields.length}`, {
          operation: 'schemaValidation',
          tableName,
          statusCode: 409,
          retriable: false,
          suggestion: 'Update the BigQuery table schema to include the missing columns or enable schemaSync.autoCreateColumns.'
        });
      }
    }
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
        transform: tableConfig.transform,
        mutability: tableConfig.mutability,
        tableOptions: tableConfig.tableOptions || null
      }));
  }

  applyTransform(data, transformFn) {
    // First, clean internal fields that shouldn't go to BigQuery
    let cleanData = this._cleanInternalFields(data);

    if (!transformFn) return cleanData;

    let transformedData = JSON.parse(JSON.stringify(cleanData));
    return transformFn(transformedData);
  }

  _cleanInternalFields(data) {
    if (!data || typeof data !== 'object') return data;

    const cleanData = { ...data };

    // Remove internal fields that start with $ or _
    Object.keys(cleanData).forEach(key => {
      if (key.startsWith('$') || key.startsWith('_')) {
        delete cleanData[key];
      }
    });

    return cleanData;
  }

  /**
   * Add tracking fields for append-only and immutable modes
   * @private
   */
  _addTrackingFields(data, operation, mutability, id) {
    const tracked = { ...data };

    // Add operation tracking for append-only and immutable modes
    if (mutability === 'append-only' || mutability === 'immutable') {
      tracked._operation_type = operation;
      tracked._operation_timestamp = new Date().toISOString();
    }

    // Add additional fields for immutable mode
    if (mutability === 'immutable') {
      tracked._is_deleted = operation === 'delete';
      tracked._version = this._getNextVersion(id);
    }

    return tracked;
  }

  /**
   * Get next version number for immutable mode
   * @private
   */
  _getNextVersion(id) {
    const current = this.versionCounters.get(id) || 0;
    const next = current + 1;
    this.versionCounters.set(id, next);
    return next;
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
          const mutability = tableConfig.mutability;
          let job;

          // For append-only and immutable modes, convert update/delete to insert
          const shouldConvertToInsert =
            (mutability === 'append-only' || mutability === 'immutable') &&
            (operation === 'update' || operation === 'delete');

          if (operation === 'insert' || shouldConvertToInsert) {
            // Apply transform first
            let transformedData = this.applyTransform(data, tableConfig.transform);

            // Add tracking fields if needed
            if (shouldConvertToInsert) {
              transformedData = this._addTrackingFields(transformedData, operation, mutability, id);
            }

            try {
              job = await table.insert([transformedData]);
            } catch (error) {
              // Extract detailed BigQuery error information
              const { errors, response } = error;
              if (this.config.verbose) {
                console.error('[BigqueryReplicator] BigQuery insert error details:');
                if (errors) console.error(JSON.stringify(errors, null, 2));
                if (response) console.error(JSON.stringify(response, null, 2));
              }
              throw error;
            }
          } else if (operation === 'update' && mutability === 'mutable') {
            // Traditional UPDATE for mutable mode
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

                // Enhanced error logging for BigQuery update operations
                if (this.config.verbose) {
                  console.warn(`[BigqueryReplicator] Update attempt ${attempt} failed: ${error.message}`);
                  if (error.errors) {
                    console.error('[BigqueryReplicator] BigQuery update error details:');
                    console.error('Errors:', JSON.stringify(error.errors, null, 2));
                  }
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
          } else if (operation === 'delete' && mutability === 'mutable') {
            // Traditional DELETE for mutable mode
            const query = `DELETE FROM \`${this.projectId}.${this.datasetId}.${tableConfig.table}\` WHERE id = @id`;
            try {
              const [deleteJob] = await this.bigqueryClient.createQueryJob({
                query,
                params: { id },
                location: this.location
              });
              await deleteJob.getQueryResults();
              job = [deleteJob];
            } catch (error) {
              // Enhanced error logging for BigQuery delete operations
              if (this.config.verbose) {
                console.error('[BigqueryReplicator] BigQuery delete error details:');
                console.error('Query:', query);
                if (error.errors) console.error('Errors:', JSON.stringify(error.errors, null, 2));
                if (error.response) console.error('Response:', JSON.stringify(error.response, null, 2));
              }
              throw error;
            }
          } else {
            throw this.createError(`Unsupported operation: ${operation}`, {
              operation: 'replicate',
              resourceName,
              tableName: tableConfig.table,
              statusCode: 400,
              retriable: false,
              suggestion: 'Replicator supports insert, update, or delete actions. Adjust the resources configuration accordingly.'
            });
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

      // Log errors if any occurred
      if (errors.length > 0) {
        console.warn(`[BigqueryReplicator] Replication completed with errors for ${resourceName}:`, errors);
      }

      this.emit('plg:replicator:replicated', {
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
    this.emit('plg:replicator:error', {
      replicator: this.name,
      resourceName,
      operation,
      id,
      error: err.message
    });

    return { success: false, error: err.message };
  }

  async replicateBatch(resourceName, records) {
    const { results, errors } = await this.processBatch(
      records,
      async (record) => {
        const [ok, err, res] = await tryFn(() => this.replicate(
        resourceName,
        record.operation,
        record.data,
        record.id,
        record.beforeData
      ));
        if (!ok) {
          throw err;
        }
        return res;
      },
      {
        concurrency: this.config.batchConcurrency,
        mapError: (error, record) => {
          if (this.config.verbose) {
            console.warn(`[BigqueryReplicator] Batch replication failed for record ${record.id}: ${error.message}`);
          }
          return { id: record.id, error: error.message };
        }
      }
    );

    // Log errors if any occurred during batch processing
    if (errors.length > 0) {
      console.warn(`[BigqueryReplicator] Batch replication completed with ${errors.length} error(s) for ${resourceName}:`, errors);
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
      logTable: this.logTable,
      schemaSync: this.schemaSync,
      mutability: this.mutability
    };
  }
}

export default BigqueryReplicator; 
