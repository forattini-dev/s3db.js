/**
 * Vector Plugin
 *
 * Provides vector storage, similarity search, and clustering capabilities.
 * Supports multiple distance metrics and automatic K determination.
 *
 * Features:
 * - Vector similarity search (KNN)
 * - K-means clustering
 * - Multiple distance metrics (cosine, euclidean, manhattan)
 * - Optimal K analysis with 5 evaluation metrics
 * - Automatic storage validation for large vectors
 */

import { Plugin } from './plugin.class.js';
import { cosineDistance, euclideanDistance, manhattanDistance, dotProduct, normalize } from './vector/distances.js';
import { kmeans, findOptimalK } from './vector/kmeans.js';
import { VectorError } from './vector/vector-error.js';
import { createLogger } from '../concerns/logger.js';

export class VectorPlugin extends Plugin {
  constructor(options = {}) {
    super(options);

    // 🪵 Logger initialization
    if (options.logger) {
      this.logger = options.logger;
    } else {
      const logLevel = (this.logLevel === 'debug' || this.logLevel === 'trace' || options.logLevelEvents) ? 'debug' : 'info';
      this.logger = createLogger({ name: 'VectorPlugin', level: logLevel });
    }

    const {
      dimensions = 1536,
      distanceMetric = 'cosine',
      storageThreshold = 1500,
      autoFixBehavior = false,
      autoDetectVectorField = true,
      emitEvents = true,
      verboseEvents = false,
      eventThrottle = 100,
      ...rest
    } = this.options;

    this.config = {
      dimensions,
      distanceMetric,
      storageThreshold,
      autoFixBehavior,
      autoDetectVectorField,
      emitEvents,
      verboseEvents,
      eventThrottle,
      logLevel: this.logLevel,
      ...rest
    };

    this.distanceFunctions = {
      cosine: cosineDistance,
      euclidean: euclideanDistance,
      manhattan: manhattanDistance
    };

    // Cache for auto-detected vector fields per resource
    this._vectorFieldCache = new Map();

    // Throttle state for progress events
    this._throttleState = new Map();
  }

  async onInstall() {
    this.emit('db:plugin:installed', { plugin: 'VectorPlugin' });

    // Validate vector storage for all resources
    this.validateVectorStorage();

    // Add vector methods to all resources
    this.installResourceMethods();
  }

  async onStart() {
    this.emit('db:plugin:started', { plugin: 'VectorPlugin' });
  }

  async onStop() {
    this.emit('db:plugin:stopped', { plugin: 'VectorPlugin' });
  }

  async onUninstall(options) {
    // Remove vector methods from resources
    for (const resource of Object.values(this.database.resources)) {
      // Remove technical methods
      delete resource.vectorSearch;
      delete resource.cluster;
      delete resource.vectorDistance;

      // Remove intuitive aliases
      delete resource.similarTo;
      delete resource.findSimilar;
      delete resource.distance;
    }

    this.emit('db:plugin:uninstalled', { plugin: 'VectorPlugin' });
  }

  /**
   * Validate vector storage configuration for all resources
   *
   * Detects large vector fields and warns if proper behavior is not set.
   * Can optionally auto-fix by setting body-overflow behavior.
   * Auto-creates partitions for optional embedding fields to enable O(1) filtering.
   */
  validateVectorStorage() {
    for (const resource of Object.values(this.database.resources)) {
      const vectorFields = this.findVectorFields(resource.schema.attributes);

      if (vectorFields.length === 0) continue;

      const totalVectorSize = vectorFields.reduce((sum, f) => sum + f.estimatedBytes, 0);

      // If exceeds threshold AND doesn't have correct behavior
      if (totalVectorSize > this.config.storageThreshold) {
        const hasCorrectBehavior = ['body-overflow', 'body-only'].includes(resource.behavior);

        if (!hasCorrectBehavior) {
          const warning = {
            resource: resource.name,
            vectorFields: vectorFields.map(f => ({
              field: f.name,
              dimensions: f.length,
              estimatedBytes: f.estimatedBytes
            })),
            totalEstimatedBytes: totalVectorSize,
            metadataLimit: 2047,
            currentBehavior: resource.behavior || 'default',
            recommendation: 'body-overflow'
          };

          this.emit('plg:vector:storage-warning', warning);

          // Auto-fix if configured
          if (this.config.autoFixBehavior) {
            resource.behavior = 'body-overflow';
            this.emit('plg:vector:behavior-fixed', {
              resource: resource.name,
              newBehavior: 'body-overflow'
            });
          } else {
            // Just warn
            this.logger.warn(`⚠️  VectorPlugin: Resource '${resource.name}' has large vector fields (${totalVectorSize} bytes estimated)`);
            this.logger.warn(`   Current behavior: '${resource.behavior || 'default'}'`);
            this.logger.warn(`   Recommendation: Add behavior: 'body-overflow' or 'body-only' to resource configuration`);
            this.logger.warn(`   Large vectors will exceed S3 metadata limit (2047 bytes) and cause errors.`);
          }
        }
      }

      // Auto-create partitions for optional embedding fields
      this.setupEmbeddingPartitions(resource, vectorFields);
    }
  }

  /**
   * Setup automatic partitions for optional embedding fields
   *
   * Creates a partition that separates records with embeddings from those without.
   * This enables O(1) filtering instead of O(n) full scans when searching/clustering.
   *
   * @param {Resource} resource - Resource instance
   * @param {Array} vectorFields - Detected vector fields with metadata
   */
  setupEmbeddingPartitions(resource, vectorFields) {
    // Skip if resource doesn't have config (e.g., mocked resources)
    if (!resource.config) return;

    for (const vectorField of vectorFields) {
      // Check if the vector field is optional
      const isOptional = this.isFieldOptional(resource.schema.attributes, vectorField.name);

      if (!isOptional) continue;

      // Generate partition name
      const partitionName = `byHas${this.capitalize(vectorField.name.replace(/\./g, '_'))}`;
      const trackingFieldName = `_has${this.capitalize(vectorField.name.replace(/\./g, '_'))}`;

      // Check if partition already exists
      if (resource.config.partitions && resource.config.partitions[partitionName]) {
        this.emit('plg:vector:partition-exists', {
          resource: resource.name,
          vectorField: vectorField.name,
          partition: partitionName,
          timestamp: Date.now()
        });
        continue;
      }

      // Create partition configuration
      if (!resource.config.partitions) {
        resource.config.partitions = {};
      }

      resource.config.partitions[partitionName] = {
        fields: {
          [trackingFieldName]: 'boolean'
        }
      };

      // Add tracking field to schema if not present using plugin API
      if (!resource.schema.attributes[trackingFieldName]) {
        resource.addPluginAttribute(trackingFieldName, {
          type: 'boolean',
          optional: true,
          default: false
        }, 'VectorPlugin');
      }

      // Emit event
      this.emit('plg:vector:partition-created', {
        resource: resource.name,
        vectorField: vectorField.name,
        partition: partitionName,
        trackingField: trackingFieldName,
        timestamp: Date.now()
      });

      this.logger.info(`✅ VectorPlugin: Created partition '${partitionName}' for optional embedding field '${vectorField.name}' in resource '${resource.name}'`);

      // Install hooks to maintain the partition
      this.installEmbeddingHooks(resource, vectorField.name, trackingFieldName);
    }
  }

  /**
   * Check if a field is optional in the schema
   *
   * @param {Object} attributes - Resource attributes
   * @param {string} fieldPath - Field path (supports dot notation)
   * @returns {boolean} True if field is optional
   */
  isFieldOptional(attributes, fieldPath) {
    const parts = fieldPath.split('.');
    let current = attributes;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const attr = current[part];

      if (!attr) return true; // Field doesn't exist = optional

      // Shorthand notation (e.g., 'string|required', 'embedding:1536')
      if (typeof attr === 'string') {
        const flags = attr.split('|');
        // If it has 'required' flag, it's not optional
        if (flags.includes('required')) return false;
        // If it has 'optional' flag, it's optional
        if (flags.includes('optional') || flags.some(f => f.startsWith('optional:'))) return true;
        // By default, fields without 'required' are optional
        return !flags.includes('required');
      }

      // Expanded notation (e.g., { type: 'string', optional: true })
      if (typeof attr === 'object') {
        // If we're at the last part, check if it's optional
        if (i === parts.length - 1) {
          // Explicit optional field
          if (attr.optional === true) return true;
          // Explicit required field
          if (attr.optional === false) return false;
          // Check for 'required' in nested object structure
          // Default: optional unless explicitly marked as required
          return attr.optional !== false;
        }

        // Navigate into nested object
        if (attr.type === 'object' && attr.props) {
          current = attr.props;
        } else {
          return true; // Can't navigate further = assume optional
        }
      }
    }

    return true; // Default to optional
  }

  /**
   * Capitalize first letter of string
   *
   * @param {string} str - Input string
   * @returns {string} Capitalized string
   */
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Install hooks to maintain embedding partition tracking field
   *
   * @param {Resource} resource - Resource instance
   * @param {string} vectorField - Vector field name
   * @param {string} trackingField - Tracking field name
   */
  installEmbeddingHooks(resource, vectorField, trackingField) {
    // beforeInsert: Set tracking field based on vector presence
    resource.registerHook('beforeInsert', async (data) => {
      const hasVector = this.hasVectorValue(data, vectorField);
      this.setNestedValue(data, trackingField, hasVector);
      return data;
    });

    // beforeUpdate: Update tracking field if vector changes
    resource.registerHook('beforeUpdate', async (id, updates) => {
      // Check if the vector field is being updated
      if (vectorField in updates || this.hasNestedKey(updates, vectorField)) {
        const hasVector = this.hasVectorValue(updates, vectorField);
        this.setNestedValue(updates, trackingField, hasVector);
      }
      return updates;
    });

    this.emit('plg:vector:hooks-installed', {
      resource: resource.name,
      vectorField,
      trackingField,
      hooks: ['beforeInsert', 'beforeUpdate'],
      timestamp: Date.now()
    });
  }

  /**
   * Check if data has a valid vector value for the given field
   *
   * @param {Object} data - Data object
   * @param {string} fieldPath - Field path (supports dot notation)
   * @returns {boolean} True if vector exists and is valid
   */
  hasVectorValue(data, fieldPath) {
    const value = this.getNestedValue(data, fieldPath);
    return value != null && Array.isArray(value) && value.length > 0;
  }

  /**
   * Check if object has a nested key
   *
   * @param {Object} obj - Object to check
   * @param {string} path - Dot-notation path
   * @returns {boolean} True if key exists
   */
  hasNestedKey(obj, path) {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current == null || typeof current !== 'object') return false;
      if (!(part in current)) return false;
      current = current[part];
    }

    return true;
  }

  /**
   * Get nested value from object using dot notation
   *
   * @param {Object} obj - Object to traverse
   * @param {string} path - Dot-notation path
   * @returns {*} Value at path or undefined
   */
  getNestedValue(obj, path) {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = current[part];
    }

    return current;
  }

  /**
   * Set nested value in object using dot notation
   *
   * @param {Object} obj - Object to modify
   * @param {string} path - Dot-notation path
   * @param {*} value - Value to set
   */
  setNestedValue(obj, path, value) {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Get auto-created embedding partition for a vector field
   *
   * Returns partition configuration if an auto-partition exists for the given vector field.
   * Auto-partitions enable O(1) filtering to only records with embeddings.
   *
   * @param {Resource} resource - Resource instance
   * @param {string} vectorField - Vector field name
   * @returns {Object|null} Partition config or null
   */
  getAutoEmbeddingPartition(resource, vectorField) {
    // Skip if resource doesn't have config (e.g., mocked resources)
    if (!resource.config) return null;

    const partitionName = `byHas${this.capitalize(vectorField.replace(/\./g, '_'))}`;
    const trackingFieldName = `_has${this.capitalize(vectorField.replace(/\./g, '_'))}`;

    // Check if auto-partition exists
    if (resource.config.partitions && resource.config.partitions[partitionName]) {
      return {
        partitionName,
        partitionValues: { [trackingFieldName]: true }
      };
    }

    return null;
  }

  /**
   * Auto-detect vector field from resource schema
   *
   * Looks for fields with type 'embedding:XXX' pattern.
   * Caches result per resource for performance.
   *
   * @param {Resource} resource - Resource instance
   * @returns {string|null} Detected vector field name or null
   */
  detectVectorField(resource) {
    // Check cache first
    if (this._vectorFieldCache.has(resource.name)) {
      return this._vectorFieldCache.get(resource.name);
    }

    // Search for embedding:XXX fields
    const vectorField = this._findEmbeddingField(resource.schema.attributes);

    // Cache the result
    this._vectorFieldCache.set(resource.name, vectorField);

    // Emit event if field detected
    if (vectorField && this.config.emitEvents) {
      this.emit('plg:vector:field-detected', {
        resource: resource.name,
        vectorField,
        timestamp: Date.now()
      });
    }

    return vectorField;
  }

  /**
   * Recursively find embedding:XXX field in attributes
   *
   * @param {Object} attributes - Resource attributes
   * @param {string} path - Current path (for nested objects)
   * @returns {string|null} Field path or null
   */
  _findEmbeddingField(attributes, path = '') {
    for (const [key, attr] of Object.entries(attributes)) {
      const fullPath = path ? `${path}.${key}` : key;

      // Check for embedding:XXX shorthand
      if (typeof attr === 'string' && attr.startsWith('embedding:')) {
        return fullPath;
      }

      // Check for expanded embedding definition
      if (attr.type === 'array' && attr.items === 'number' && attr.length) {
        return fullPath;
      }

      // Check nested objects
      if (attr.type === 'object' && attr.props) {
        const nested = this._findEmbeddingField(attr.props, fullPath);
        if (nested) return nested;
      }
    }

    return null;
  }

  /**
   * Emit event with throttling support
   *
   * @param {string} eventName - Event name
   * @param {Object} data - Event data
   * @param {string} throttleKey - Unique key for throttling (optional)
   */
  _emitEvent(eventName, data, throttleKey = null) {
    if (!this.config.emitEvents) return;

    // If throttleKey provided, check throttle state
    if (throttleKey) {
      const now = Date.now();
      const lastEmit = this._throttleState.get(throttleKey);

      if (lastEmit && (now - lastEmit) < this.config.eventThrottle) {
        return; // Skip emission
      }

      this._throttleState.set(throttleKey, now);
    }

    this.emit(eventName, data);
  }

  /**
   * Find vector fields in resource attributes
   *
   * @param {Object} attributes - Resource attributes
   * @param {string} path - Current path (for nested objects)
   * @returns {Array} Array of vector field info
   */
  findVectorFields(attributes, path = '') {
    const vectors = [];

    for (const [key, attr] of Object.entries(attributes)) {
      const fullPath = path ? `${path}.${key}` : key;

      // Check if it's a vector field (array of numbers with length)
      if (attr.type === 'array' && attr.items === 'number' && attr.length) {
        vectors.push({
          name: fullPath,
          length: attr.length,
          estimatedBytes: this.estimateVectorBytes(attr.length)
        });
      }

      // Check nested objects
      if (attr.type === 'object' && attr.props) {
        vectors.push(...this.findVectorFields(attr.props, fullPath));
      }
    }

    return vectors;
  }

  /**
   * Estimate bytes required to store a vector in JSON format
   *
   * Conservative estimate: ~7 bytes per number + array overhead
   *
   * @param {number} dimensions - Number of dimensions
   * @returns {number} Estimated bytes
   */
  estimateVectorBytes(dimensions) {
    // Each float: ~6-8 bytes in JSON (e.g., "0.1234")
    // Array overhead: brackets, commas
    return dimensions * 7 + 50;
  }

  /**
   * Install vector methods on all resources
   */
  installResourceMethods() {
    for (const resource of Object.values(this.database.resources)) {
      // Core methods
      const searchMethod = this.createVectorSearchMethod(resource);
      const clusterMethod = this.createClusteringMethod(resource);
      const distanceMethod = this.createDistanceMethod();

      // Add technical methods (original names for compatibility)
      resource.vectorSearch = searchMethod;
      resource.cluster = clusterMethod;
      resource.vectorDistance = distanceMethod;

      // Add intuitive aliases for better DX
      resource.similarTo = searchMethod;      // More natural: "find products similar to X"
      resource.findSimilar = searchMethod;    // Descriptive alternative
      resource.distance = distanceMethod;     // Simpler than vectorDistance
    }
  }

  /**
   * Create vector search method for a resource
   *
   * Performs K-nearest neighbors search to find similar vectors.
   *
   * @param {Resource} resource - Resource instance
   * @returns {Function} Vector search method
   */
  createVectorSearchMethod(resource) {
    return async (queryVector, options = {}) => {
      const startTime = Date.now();

      // Auto-detect vectorField if not provided
      let vectorField = options.vectorField;
      if (!vectorField && this.config.autoDetectVectorField) {
        vectorField = this.detectVectorField(resource);
        if (!vectorField) {
          vectorField = 'vector'; // Fallback to default
        }
      } else if (!vectorField) {
        vectorField = 'vector'; // Fallback to default
      }

      let {
        limit = 10,
        distanceMetric = this.config.distanceMetric,
        threshold = null,
        partition = null,
        partitionValues = null
      } = options;

      const distanceFn = this.distanceFunctions[distanceMetric];
      if (!distanceFn) {
        const error = new VectorError(`Invalid distance metric: ${distanceMetric}`, {
          operation: 'vectorSearch',
          availableMetrics: Object.keys(this.distanceFunctions),
          providedMetric: distanceMetric
        });

        this._emitEvent('vector:search-error', {
          resource: resource.name,
          error: error.message,
          timestamp: Date.now()
        });

        throw error;
      }

      // Auto-use embedding partition if available and no custom partition specified
      if (!partition) {
        const autoPartition = this.getAutoEmbeddingPartition(resource, vectorField);
        if (autoPartition) {
          partition = autoPartition.partitionName;
          partitionValues = autoPartition.partitionValues;

          this._emitEvent('vector:auto-partition-used', {
            resource: resource.name,
            vectorField,
            partition,
            partitionValues,
            timestamp: Date.now()
          });
        }
      }

      // Emit start event
      this._emitEvent('vector:search-start', {
        resource: resource.name,
        vectorField,
        limit,
        distanceMetric,
        partition,
        partitionValues,
        threshold,
        queryDimensions: queryVector.length,
        timestamp: startTime
      });

      try {
        // Get all records (with optional partition filter)
        let allRecords;
        if (partition && partitionValues) {
          this._emitEvent('vector:partition-filter', {
            resource: resource.name,
            partition,
            partitionValues,
            timestamp: Date.now()
          });
          allRecords = await resource.list({ partition, partitionValues });
        } else {
          // Fallback to list() if getAll() doesn't exist (for mocked resources in tests)
          allRecords = resource.getAll ? await resource.getAll() : await resource.list();
        }

        const totalRecords = allRecords.length;
        let processedRecords = 0;
        let dimensionMismatches = 0;

        // Performance warning for large resources without partition
        if (!partition && totalRecords > 1000) {
          const warning = {
            resource: resource.name,
            operation: 'vectorSearch',
            totalRecords,
            vectorField,
            recommendation: 'Use partitions to filter data before vector search for better performance'
          };

          this._emitEvent('vector:performance-warning', warning);

          this.logger.warn(`⚠️  VectorPlugin: Performing vectorSearch on ${totalRecords} records without partition filter`);
          this.logger.warn(`   Resource: '${resource.name}'`);
          this.logger.warn(`   Recommendation: Use partition parameter to reduce search space`);
          this.logger.warn(`   Example: resource.vectorSearch(vector, { partition: 'byCategory', partitionValues: { category: 'books' } })`);
        }

        // Calculate distances
        const results = allRecords
          .filter(record => record[vectorField] && Array.isArray(record[vectorField]))
          .map((record, index) => {
            try {
              const distance = distanceFn(queryVector, record[vectorField]);
              processedRecords++;

              // Emit progress event (throttled)
              if (this.config.logLevelEvents && processedRecords % 100 === 0) {
                const progressData = {
                  resource: resource.name,
                  processed: processedRecords,
                  total: totalRecords,
                  progress: (processedRecords / totalRecords) * 100,
                  timestamp: Date.now()
                };
                this._emitEvent('vector:search-progress', progressData, `search-${resource.name}`);
                this.logger.debug(progressData, `Search progress: ${processedRecords}/${totalRecords} (${progressData.progress.toFixed(1)}%)`);
              }

              return { record, distance };
            } catch (err) {
              // Skip records with dimension mismatch
              dimensionMismatches++;

              if (this.config.logLevelEvents) {
                const mismatchData = {
                  resource: resource.name,
                  recordIndex: index,
                  expected: queryVector.length,
                  got: record[vectorField]?.length,
                  timestamp: Date.now()
                };
                this._emitEvent('vector:dimension-mismatch', mismatchData);
                this.logger.debug(mismatchData, `Dimension mismatch at record ${index}: expected ${mismatchData.expected}, got ${mismatchData.got}`);
              }

              return null;
            }
          })
          .filter(result => result !== null)
          .filter(result => threshold === null || result.distance <= threshold)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, limit);

        const duration = Date.now() - startTime;
        const throughput = totalRecords / (duration / 1000);

        // Emit complete event
        this._emitEvent('vector:search-complete', {
          resource: resource.name,
          vectorField,
          resultsCount: results.length,
          totalRecords,
          processedRecords,
          dimensionMismatches,
          duration,
          throughput: throughput.toFixed(2),
          timestamp: Date.now()
        });

        // Emit performance metrics
        if (this.config.logLevelEvents) {
          const perfData = {
            operation: 'search',
            resource: resource.name,
            duration,
            throughput: throughput.toFixed(2),
            recordsPerSecond: (processedRecords / (duration / 1000)).toFixed(2),
            timestamp: Date.now()
          };
          this._emitEvent('vector:performance', perfData);
          this.logger.debug(perfData, `Search performance: ${duration}ms, ${perfData.throughput} MB/s, ${perfData.recordsPerSecond} rec/s`);
        }

        return results;
      } catch (error) {
        this._emitEvent('vector:search-error', {
          resource: resource.name,
          error: error.message,
          stack: error.stack,
          timestamp: Date.now()
        });
        throw error;
      }
    };
  }

  /**
   * Create clustering method for a resource
   *
   * Performs k-means clustering on resource vectors.
   *
   * @param {Resource} resource - Resource instance
   * @returns {Function} Clustering method
   */
  createClusteringMethod(resource) {
    return async (options = {}) => {
      const startTime = Date.now();

      // Auto-detect vectorField if not provided
      let vectorField = options.vectorField;
      if (!vectorField && this.config.autoDetectVectorField) {
        vectorField = this.detectVectorField(resource);
        if (!vectorField) {
          vectorField = 'vector'; // Fallback to default
        }
      } else if (!vectorField) {
        vectorField = 'vector'; // Fallback to default
      }

      let {
        k = 5,
        distanceMetric = this.config.distanceMetric,
        partition = null,
        partitionValues = null,
        ...kmeansOptions
      } = options;

      const distanceFn = this.distanceFunctions[distanceMetric];
      if (!distanceFn) {
        const error = new VectorError(`Invalid distance metric: ${distanceMetric}`, {
          operation: 'cluster',
          availableMetrics: Object.keys(this.distanceFunctions),
          providedMetric: distanceMetric
        });

        this._emitEvent('vector:cluster-error', {
          resource: resource.name,
          error: error.message,
          timestamp: Date.now()
        });

        throw error;
      }

      // Auto-use embedding partition if available and no custom partition specified
      if (!partition) {
        const autoPartition = this.getAutoEmbeddingPartition(resource, vectorField);
        if (autoPartition) {
          partition = autoPartition.partitionName;
          partitionValues = autoPartition.partitionValues;

          this._emitEvent('vector:auto-partition-used', {
            resource: resource.name,
            vectorField,
            partition,
            partitionValues,
            timestamp: Date.now()
          });
        }
      }

      // Emit start event
      this._emitEvent('vector:cluster-start', {
        resource: resource.name,
        vectorField,
        k,
        distanceMetric,
        partition,
        partitionValues,
        maxIterations: kmeansOptions.maxIterations || 100,
        timestamp: startTime
      });

      try {
        // Get all records (with optional partition filter)
        let allRecords;
        if (partition && partitionValues) {
          this._emitEvent('vector:partition-filter', {
            resource: resource.name,
            partition,
            partitionValues,
            timestamp: Date.now()
          });
          allRecords = await resource.list({ partition, partitionValues });
        } else {
          // Fallback to list() if getAll() doesn't exist (for mocked resources in tests)
          allRecords = resource.getAll ? await resource.getAll() : await resource.list();
        }

        // Extract vectors
        const recordsWithVectors = allRecords.filter(
          record => record[vectorField] && Array.isArray(record[vectorField])
        );

        // Performance warning for large resources without partition
        if (!partition && allRecords.length > 1000) {
          const warning = {
            resource: resource.name,
            operation: 'cluster',
            totalRecords: allRecords.length,
            recordsWithVectors: recordsWithVectors.length,
            vectorField,
            recommendation: 'Use partitions to filter data before clustering for better performance'
          };

          this._emitEvent('vector:performance-warning', warning);

          this.logger.warn(`⚠️  VectorPlugin: Performing clustering on ${allRecords.length} records without partition filter`);
          this.logger.warn(`   Resource: '${resource.name}'`);
          this.logger.warn(`   Records with vectors: ${recordsWithVectors.length}`);
          this.logger.warn(`   Recommendation: Use partition parameter to reduce clustering space`);
          this.logger.warn(`   Example: resource.cluster({ k: 5, partition: 'byCategory', partitionValues: { category: 'books' } })`);
        }

        if (recordsWithVectors.length === 0) {
          const error = new VectorError('No vectors found in resource', {
            operation: 'cluster',
            resourceName: resource.name,
            vectorField
          });

          this._emitEvent('vector:empty-dataset', {
            resource: resource.name,
            vectorField,
            totalRecords: allRecords.length,
            timestamp: Date.now()
          });

          throw error;
        }

        const vectors = recordsWithVectors.map(record => record[vectorField]);

        // Run k-means with progress callback
        const result = kmeans(vectors, k, {
          ...kmeansOptions,
          distanceFn,
          onIteration: this.config.logLevelEvents ? (iteration, inertia, converged) => {
            this._emitEvent('vector:cluster-iteration', {
              resource: resource.name,
              k,
              iteration,
              inertia,
              converged,
              timestamp: Date.now()
            }, `cluster-${resource.name}`);
          } : undefined
        });

        // Emit convergence event
        if (result.converged) {
          this._emitEvent('vector:cluster-converged', {
            resource: resource.name,
            k,
            iterations: result.iterations,
            inertia: result.inertia,
            timestamp: Date.now()
          });
        }

        // Map results back to records
        const clusters = Array(k).fill(null).map(() => []);
        recordsWithVectors.forEach((record, i) => {
          const clusterIndex = result.assignments[i];
          clusters[clusterIndex].push(record);
        });

        const duration = Date.now() - startTime;
        const clusterSizes = clusters.map(c => c.length);

        // Emit complete event
        this._emitEvent('vector:cluster-complete', {
          resource: resource.name,
          vectorField,
          k,
          vectorCount: vectors.length,
          iterations: result.iterations,
          converged: result.converged,
          inertia: result.inertia,
          clusterSizes,
          duration,
          timestamp: Date.now()
        });

        // Emit performance metrics
        if (this.config.logLevelEvents) {
          const perfData = {
            operation: 'clustering',
            resource: resource.name,
            k,
            duration,
            iterationsPerSecond: (result.iterations / (duration / 1000)).toFixed(2),
            vectorsPerSecond: (vectors.length / (duration / 1000)).toFixed(2),
            timestamp: Date.now()
          };
          this._emitEvent('vector:performance', perfData);
          this.logger.debug(perfData, `Clustering performance (k=${k}): ${duration}ms, ${perfData.iterationsPerSecond} iter/s, ${perfData.vectorsPerSecond} vec/s`);
        }

        return {
          clusters,
          centroids: result.centroids,
          inertia: result.inertia,
          iterations: result.iterations,
          converged: result.converged
        };
      } catch (error) {
        this._emitEvent('vector:cluster-error', {
          resource: resource.name,
          error: error.message,
          stack: error.stack,
          timestamp: Date.now()
        });
        throw error;
      }
    };
  }

  /**
   * Create distance calculation method
   *
   * @returns {Function} Distance method
   */
  createDistanceMethod() {
    return (vector1, vector2, metric = this.config.distanceMetric) => {
      const distanceFn = this.distanceFunctions[metric];
      if (!distanceFn) {
        throw new VectorError(`Invalid distance metric: ${metric}`, {
          operation: 'vectorDistance',
          availableMetrics: Object.keys(this.distanceFunctions),
          providedMetric: metric
        });
      }
      return distanceFn(vector1, vector2);
    };
  }

  /**
   * Static utility: Normalize vector
   *
   * @param {number[]} vector - Input vector
   * @returns {number[]} Normalized vector
   */
  static normalize(vector) {
    return normalize(vector);
  }

  /**
   * Static utility: Calculate dot product
   *
   * @param {number[]} vector1 - First vector
   * @param {number[]} vector2 - Second vector
   * @returns {number} Dot product
   */
  static dotProduct(vector1, vector2) {
    return dotProduct(vector1, vector2);
  }

  /**
   * Static utility: Find optimal K for clustering
   *
   * Analyzes clustering quality across a range of K values using
   * multiple evaluation metrics.
   *
   * @param {number[][]} vectors - Vectors to analyze
   * @param {Object} options - Configuration options
   * @returns {Promise<Object>} Analysis results with recommendations
   */
  static async findOptimalK(vectors, options) {
    return findOptimalK(vectors, options);
  }
}
