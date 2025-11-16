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

    // Validate credentials structure if provided
    if (this.credentials) {
      // Check if credentials is a string (common mistake)
      if (typeof this.credentials === 'string') {
        errors.push('credentials must be an object, not a string. Did you forget JSON.parse()?');
      } else if (typeof this.credentials === 'object') {
        // Validate service account structure
        if (!this.credentials.client_email) {
          errors.push('credentials.client_email is required for service account authentication');
        } else if (!this.credentials.client_email.includes('@')) {
          errors.push('credentials.client_email appears invalid (missing @)');
        }

        if (!this.credentials.private_key) {
          errors.push('credentials.private_key is required for service account authentication');
        } else if (typeof this.credentials.private_key === 'string') {
          // Validate private_key format
          if (!this.credentials.private_key.includes('BEGIN PRIVATE KEY')) {
            errors.push('credentials.private_key appears invalid (missing "BEGIN PRIVATE KEY" header)');
          }
          if (this.credentials.private_key.length < 100) {
            errors.push('credentials.private_key appears too short to be valid');
          }
        }
      }
    }
    // If credentials not provided, BigQuery SDK will use Application Default Credentials (ADC)

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

    // Validate configuration before attempting connection
    const configValidation = this.validateConfig();
    if (!configValidation.isValid) {
      const error = this.createError(
        `BigQuery configuration invalid: ${configValidation.errors.join('; ')}`,
        {
          operation: 'initialize',
          statusCode: 400,
          retriable: false,
          errors: configValidation.errors,
          suggestion: 'Review your BigQuery replicator configuration. Ensure projectId, datasetId, and credentials are correctly set. See docs/plugins/replicator.md'
        }
      );
      this.logger.error(
        { errors: configValidation.errors },
        'Configuration validation failed'
      );
      this.emit('initialization_error', { replicator: this.name, error: error.message, errors: configValidation.errors });
      throw error;
    }

    // Validate plugin dependencies are installed
    await requirePluginDependency('bigquery-replicator');

    const [ok, err, sdk] = await tryFn(() => import('@google-cloud/bigquery'));
    if (!ok) {
      this.logger.warn({ error: err.message }, 'Failed to import BigQuery SDK');
      this.emit('initialization_error', { replicator: this.name, error: err.message });
      throw err;
    }
    const { BigQuery } = sdk;
    this.bigqueryClient = new BigQuery({
      projectId: this.projectId,
      credentials: this.credentials,
      location: this.location
    });

    // Test connection to BigQuery
    this.logger.debug(
      { projectId: this.projectId, datasetId: this.datasetId },
      'Testing connection to BigQuery'
    );

    const [connOk, connErr] = await tryFn(async () => {
      const dataset = this.bigqueryClient.dataset(this.datasetId);
      await dataset.getMetadata();
    });

    if (!connOk) {
      // Parse error for user-friendly message
      const errorMessage = this._parseGcpError(connErr);
      const suggestion = this._getCredentialsSuggestion(connErr);

      const error = this.createError(
        `BigQuery connection failed: ${errorMessage}`,
        {
          operation: 'initialize',
          statusCode: connErr.code || 401,
          retriable: true,
          originalError: connErr.message,
          suggestion
        }
      );

      this.logger.error(
        { error: errorMessage, suggestion, projectId: this.projectId, datasetId: this.datasetId },
        'Connection test failed'
      );

      this.emit('connection_error', {
        replicator: this.name,
        error: error.message,
        suggestion,
        projectId: this.projectId,
        datasetId: this.datasetId
      });
      throw error;
    }

    this.logger.debug('Connection successful');

    // Sync schemas if enabled
    if (this.schemaSync.enabled) {
      await this.syncSchemas(database);
    }

    this.emit('db:plugin:initialized', {
      replicator: this.name,
      projectId: this.projectId,
      datasetId: this.datasetId,
      resources: Object.keys(this.resources),
      connectionTested: true
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
        this.logger.warn(
          { resourceName, error: errRes.message },
          'Could not get resource for schema sync'
        );
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
            this.logger.warn(`${message}`);
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

      this.logger.debug(
        { tableName, mutability, schema },
        'Creating table with schema'
      );

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
      this.logger.warn({ tableName }, 'Dropping and recreating table');

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
        this.logger.debug(
          { tableName, fieldCount: newFields.length, newFields },
          'Adding fields to table'
        );

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
              this.logger.error(
                { errors, response },
                'BigQuery insert error details'
              );
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
                this.logger.warn(
                  { attempt, error: error.message, errors: error.errors },
                  'Update attempt failed'
                );

                // If it's streaming buffer error and not the last attempt
                if (error?.message?.includes('streaming buffer') && attempt < maxRetries) {
                  const delaySeconds = 30;
                  this.logger.warn(
                    { delaySeconds },
                    'Retrying due to streaming buffer issue'
                  );
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
              this.logger.error(
                { query, errors: error.errors, response: error.response },
                'BigQuery delete error details'
              );
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
        this.logger.warn(
          { resourceName, errors },
          'Replication completed with errors'
        );
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

    this.logger.warn(
      { resourceName, error: err.message },
      'Replication failed'
    );
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
          this.logger.warn(
            { recordId: record.id, error: error.message },
            'Batch replication failed for record'
          );
          return { id: record.id, error: error.message };
        }
      }
    );

    // Log errors if any occurred during batch processing
    if (errors.length > 0) {
      this.logger.warn(
        { resourceName, errorCount: errors.length, errors },
        'Batch replication completed with errors'
      );
    }

    return {
      success: errors.length === 0,
      results,
      errors
    };
  }

  /**
   * Parse GCP errors into user-friendly messages
   * @private
   */
  _parseGcpError(error) {
    const message = error.message || String(error);

    // Common GCP authentication errors
    if (message.includes('invalid_grant') || message.includes('Invalid JWT Signature')) {
      return 'Invalid service account credentials (private_key or client_email incorrect)';
    }
    if (message.includes('JWT validation failed') || message.includes('Invalid JWT')) {
      return 'Service account key is malformed or expired';
    }

    // Permission errors
    if (message.includes('Permission denied') || message.includes('403')) {
      return 'Credentials valid but missing BigQuery permissions';
    }

    // Resource not found errors
    if (message.includes('Not found') || message.includes('404')) {
      return `Dataset '${this.datasetId}' not found or no access to project '${this.projectId}'`;
    }

    // Network errors
    if (message.includes('ENOTFOUND') || message.includes('ETIMEDOUT')) {
      return 'Network error connecting to BigQuery API (check firewall/proxy)';
    }
    if (message.includes('ECONNREFUSED')) {
      return 'Connection refused by BigQuery API';
    }

    // Quota/rate limit errors
    if (message.includes('429') || message.includes('rateLimitExceeded')) {
      return 'BigQuery API rate limit exceeded';
    }
    if (message.includes('quotaExceeded')) {
      return 'BigQuery quota exceeded for project';
    }

    // Return original message if no specific match
    return message;
  }

  /**
   * Get actionable suggestions based on error type
   * @private
   */
  _getCredentialsSuggestion(error) {
    const message = error.message || String(error);

    // Authentication suggestions
    if (message.includes('invalid_grant') || message.includes('Invalid JWT')) {
      return 'Verify your service account JSON is correct and not expired. Download fresh credentials from: https://console.cloud.google.com/iam-admin/serviceaccounts';
    }

    // Permission suggestions
    if (message.includes('Permission denied') || message.includes('403')) {
      return `Grant the following roles to service account '${this.credentials?.client_email || 'your-service-account'}': BigQuery Data Editor, BigQuery Job User`;
    }

    // Dataset not found suggestions
    if (message.includes('Not found') || message.includes('404')) {
      return `Create dataset '${this.datasetId}' in project '${this.projectId}' or verify the service account has access: https://console.cloud.google.com/bigquery?project=${this.projectId}`;
    }

    // Network suggestions
    if (message.includes('ENOTFOUND') || message.includes('ETIMEDOUT') || message.includes('ECONNREFUSED')) {
      return 'Check network connectivity, firewall rules, and proxy settings. Ensure outbound HTTPS access to *.googleapis.com is allowed';
    }

    // Quota suggestions
    if (message.includes('429') || message.includes('rateLimitExceeded') || message.includes('quotaExceeded')) {
      return `Check BigQuery quota and billing: https://console.cloud.google.com/apis/api/bigquery.googleapis.com/quotas?project=${this.projectId}`;
    }

    // Generic suggestion
    return 'Verify BigQuery configuration, credentials, and network connectivity. See docs/plugins/replicator.md for troubleshooting';
  }

  async testConnection() {
    const [ok, err] = await tryFn(async () => {
      if (!this.bigqueryClient) await this.initialize();
      const dataset = this.bigqueryClient.dataset(this.datasetId);
      await dataset.getMetadata();
      return true;
    });
    if (ok) return true;
    this.logger.warn({ error: err.message }, 'Connection test failed');
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
