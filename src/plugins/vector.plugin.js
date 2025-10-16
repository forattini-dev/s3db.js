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

export class VectorPlugin extends Plugin {
  constructor(options = {}) {
    super(options);

    this.config = {
      dimensions: 1536, // Default to OpenAI text-embedding-3-small/3-large
      distanceMetric: 'cosine', // Default metric
      storageThreshold: 1500, // Bytes - warn if vectors exceed this
      autoFixBehavior: false, // Automatically set body-overflow
      autoDetectVectorField: true, // Auto-detect embedding:XXX fields
      emitEvents: true, // Emit events for monitoring
      verboseEvents: false, // Emit detailed progress events
      eventThrottle: 100, // Throttle progress events (ms)
      ...options
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
    this.emit('installed', { plugin: 'VectorPlugin' });

    // Validate vector storage for all resources
    this.validateVectorStorage();

    // Add vector methods to all resources
    this.installResourceMethods();
  }

  async onStart() {
    this.emit('started', { plugin: 'VectorPlugin' });
  }

  async onStop() {
    this.emit('stopped', { plugin: 'VectorPlugin' });
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

    this.emit('uninstalled', { plugin: 'VectorPlugin' });
  }

  /**
   * Validate vector storage configuration for all resources
   *
   * Detects large vector fields and warns if proper behavior is not set.
   * Can optionally auto-fix by setting body-overflow behavior.
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

          this.emit('vector:storage-warning', warning);

          // Auto-fix if configured
          if (this.config.autoFixBehavior) {
            resource.behavior = 'body-overflow';
            this.emit('vector:behavior-fixed', {
              resource: resource.name,
              newBehavior: 'body-overflow'
            });
          } else {
            // Just warn
            console.warn(`⚠️  VectorPlugin: Resource '${resource.name}' has large vector fields (${totalVectorSize} bytes estimated)`);
            console.warn(`   Current behavior: '${resource.behavior || 'default'}'`);
            console.warn(`   Recommendation: Add behavior: 'body-overflow' or 'body-only' to resource configuration`);
            console.warn(`   Large vectors will exceed S3 metadata limit (2047 bytes) and cause errors.`);
          }
        }
      }
    }
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
      this.emit('vector:field-detected', {
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

      const {
        limit = 10,
        distanceMetric = this.config.distanceMetric,
        threshold = null,
        partition = null
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

      // Emit start event
      this._emitEvent('vector:search-start', {
        resource: resource.name,
        vectorField,
        limit,
        distanceMetric,
        partition,
        threshold,
        queryDimensions: queryVector.length,
        timestamp: startTime
      });

      try {
        // Get all records (with optional partition filter)
        let allRecords;
        if (partition) {
          this._emitEvent('vector:partition-filter', {
            resource: resource.name,
            partition,
            timestamp: Date.now()
          });
          allRecords = await resource.list({ partition, partitionValues: partition });
        } else {
          allRecords = await resource.getAll();
        }

        const totalRecords = allRecords.length;
        let processedRecords = 0;
        let dimensionMismatches = 0;

        // Calculate distances
        const results = allRecords
          .filter(record => record[vectorField] && Array.isArray(record[vectorField]))
          .map((record, index) => {
            try {
              const distance = distanceFn(queryVector, record[vectorField]);
              processedRecords++;

              // Emit progress event (throttled)
              if (this.config.verboseEvents && processedRecords % 100 === 0) {
                this._emitEvent('vector:search-progress', {
                  resource: resource.name,
                  processed: processedRecords,
                  total: totalRecords,
                  progress: (processedRecords / totalRecords) * 100,
                  timestamp: Date.now()
                }, `search-${resource.name}`);
              }

              return { record, distance };
            } catch (err) {
              // Skip records with dimension mismatch
              dimensionMismatches++;

              if (this.config.verboseEvents) {
                this._emitEvent('vector:dimension-mismatch', {
                  resource: resource.name,
                  recordIndex: index,
                  expected: queryVector.length,
                  got: record[vectorField]?.length,
                  timestamp: Date.now()
                });
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
        if (this.config.verboseEvents) {
          this._emitEvent('vector:performance', {
            operation: 'search',
            resource: resource.name,
            duration,
            throughput: throughput.toFixed(2),
            recordsPerSecond: (processedRecords / (duration / 1000)).toFixed(2),
            timestamp: Date.now()
          });
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

      const {
        k = 5,
        distanceMetric = this.config.distanceMetric,
        partition = null,
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

      // Emit start event
      this._emitEvent('vector:cluster-start', {
        resource: resource.name,
        vectorField,
        k,
        distanceMetric,
        partition,
        maxIterations: kmeansOptions.maxIterations || 100,
        timestamp: startTime
      });

      try {
        // Get all records (with optional partition filter)
        let allRecords;
        if (partition) {
          this._emitEvent('vector:partition-filter', {
            resource: resource.name,
            partition,
            timestamp: Date.now()
          });
          allRecords = await resource.list({ partition, partitionValues: partition });
        } else {
          allRecords = await resource.getAll();
        }

        // Extract vectors
        const recordsWithVectors = allRecords.filter(
          record => record[vectorField] && Array.isArray(record[vectorField])
        );

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
          onIteration: this.config.verboseEvents ? (iteration, inertia, converged) => {
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
        if (this.config.verboseEvents) {
          this._emitEvent('vector:performance', {
            operation: 'clustering',
            resource: resource.name,
            k,
            duration,
            iterationsPerSecond: (result.iterations / (duration / 1000)).toFixed(2),
            vectorsPerSecond: (vectors.length / (duration / 1000)).toFixed(2),
            timestamp: Date.now()
          });
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

export default VectorPlugin;
