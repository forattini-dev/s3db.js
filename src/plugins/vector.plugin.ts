import { Plugin } from './plugin.class.js';
import { cosineDistance, euclideanDistance, manhattanDistance, dotProduct, normalize } from './vector/distances.js';
import { kmeans, findOptimalK } from './vector/kmeans.js';
import { VectorError } from './vector/vector-error.js';
import { createLogger } from '../concerns/logger.js';

import type { Database } from '../database.class.js';
import type { Resource } from '../resource.class.js';
import type { Logger } from '../concerns/logger.js';

export type DistanceMetric = 'cosine' | 'euclidean' | 'manhattan';
export type DistanceFunction = (a: number[], b: number[]) => number;

export interface VectorPluginOptions extends Record<string, unknown> {
  dimensions?: number;
  distanceMetric?: DistanceMetric;
  storageThreshold?: number;
  autoFixBehavior?: boolean;
  autoDetectVectorField?: boolean;
  emitEvents?: boolean;
  verboseEvents?: boolean;
  eventThrottle?: number;
  logLevel?: string;
  logLevelEvents?: boolean;
  logger?: Logger;
}

export interface VectorPluginConfig extends VectorPluginOptions {
  dimensions: number;
  distanceMetric: DistanceMetric;
  storageThreshold: number;
  autoFixBehavior: boolean;
  autoDetectVectorField: boolean;
  emitEvents: boolean;
  verboseEvents: boolean;
  eventThrottle: number;
}

export interface VectorSearchOptions {
  vectorField?: string;
  limit?: number;
  distanceMetric?: DistanceMetric;
  threshold?: number | null;
  partition?: string | null;
  partitionValues?: Record<string, unknown> | null;
}

export interface VectorSearchResult {
  record: Record<string, unknown>;
  distance: number;
}

export interface ClusterOptions {
  vectorField?: string;
  k?: number;
  distanceMetric?: DistanceMetric;
  partition?: string | null;
  partitionValues?: Record<string, unknown> | null;
  maxIterations?: number;
  [key: string]: unknown;
}

export interface ClusterResult {
  clusters: Array<Array<Record<string, unknown>>>;
  centroids: number[][];
  inertia: number;
  iterations: number;
  converged: boolean;
}

export interface VectorFieldInfo {
  name: string;
  length: number;
  estimatedBytes: number;
}

export interface AutoPartitionConfig {
  partitionName: string;
  partitionValues: Record<string, boolean>;
}

export interface FindOptimalKOptions {
  minK?: number;
  maxK?: number;
  maxIterations?: number;
  tolerance?: number;
  distanceFn?: DistanceFunction;
}

export class VectorPlugin extends Plugin {

  config: VectorPluginConfig;
  distanceFunctions: Record<DistanceMetric, DistanceFunction>;

  private _vectorFieldCache: Map<string, string | null>;
  private _throttleState: Map<string, number>;

  constructor(options: VectorPluginOptions = {}) {
    super(options);

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
      dimensions: dimensions as number,
      distanceMetric: distanceMetric as DistanceMetric,
      storageThreshold: storageThreshold as number,
      autoFixBehavior: autoFixBehavior as boolean,
      autoDetectVectorField: autoDetectVectorField as boolean,
      emitEvents: emitEvents as boolean,
      verboseEvents: verboseEvents as boolean,
      eventThrottle: eventThrottle as number,
      logLevel: this.logLevel,
      ...rest
    };

    this.distanceFunctions = {
      cosine: cosineDistance,
      euclidean: euclideanDistance,
      manhattan: manhattanDistance
    };

    this._vectorFieldCache = new Map();
    this._throttleState = new Map();
  }

  override async onInstall(): Promise<void> {
    this.emit('db:plugin:installed', { plugin: 'VectorPlugin' });

    this.validateVectorStorage();
    this.installResourceMethods();
  }

  override async onStart(): Promise<void> {
    this.emit('db:plugin:started', { plugin: 'VectorPlugin' });
  }

  override async onStop(): Promise<void> {
    this.emit('db:plugin:stopped', { plugin: 'VectorPlugin' });
  }

  override async onUninstall(): Promise<void> {
    for (const resource of Object.values(this.database.resources)) {
      delete (resource as unknown as Record<string, unknown>).vectorSearch;
      delete (resource as unknown as Record<string, unknown>).cluster;
      delete (resource as unknown as Record<string, unknown>).vectorDistance;
      delete (resource as unknown as Record<string, unknown>).similarTo;
      delete (resource as unknown as Record<string, unknown>).findSimilar;
      delete (resource as unknown as Record<string, unknown>).distance;
    }

    this.emit('db:plugin:uninstalled', { plugin: 'VectorPlugin' });
  }

  validateVectorStorage(): void {
    for (const resource of Object.values(this.database.resources)) {
      const vectorFields = this.findVectorFields((resource as unknown as { schema: { attributes: Record<string, unknown> } }).schema.attributes);

      if (vectorFields.length === 0) continue;

      const totalVectorSize = vectorFields.reduce((sum, f) => sum + f.estimatedBytes, 0);

      if (totalVectorSize > this.config.storageThreshold) {
        const hasCorrectBehavior = ['body-overflow', 'body-only'].includes((resource as unknown as { behavior: string }).behavior);

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
            currentBehavior: (resource as unknown as { behavior: string }).behavior || 'default',
            recommendation: 'body-overflow'
          };

          this.emit('plg:vector:storage-warning', warning);

          if (this.config.autoFixBehavior) {
            (resource as unknown as { behavior: string }).behavior = 'body-overflow';
            this.emit('plg:vector:behavior-fixed', {
              resource: resource.name,
              newBehavior: 'body-overflow'
            });
          } else {
            this.logger.warn(`⚠️  VectorPlugin: Resource '${resource.name}' has large vector fields (${totalVectorSize} bytes estimated)`);
            this.logger.warn(`   Current behavior: '${(resource as unknown as { behavior: string }).behavior || 'default'}'`);
            this.logger.warn(`   Recommendation: Add behavior: 'body-overflow' or 'body-only' to resource configuration`);
            this.logger.warn(`   Large vectors will exceed S3 metadata limit (2047 bytes) and cause errors.`);
            console.warn(
              `[VectorPlugin] Large vector fields detected on ${resource.name}; estimated ${totalVectorSize} bytes. ` +
              `Recommend setting behavior to body-overflow/body-only to avoid S3 metadata limits.`
            );
          }
        }
      }

      this.setupEmbeddingPartitions(resource, vectorFields);
    }
  }

  setupEmbeddingPartitions(resource: Resource, vectorFields: VectorFieldInfo[]): void {
    if (!(resource as unknown as { config: unknown }).config) return;

    for (const vectorField of vectorFields) {
      const isOptional = this.isFieldOptional((resource as unknown as { schema: { attributes: Record<string, unknown> } }).schema.attributes, vectorField.name);

      if (!isOptional) continue;

      const partitionName = `byHas${this.capitalize(vectorField.name.replace(/\./g, '_'))}`;
      const trackingFieldName = `_has${this.capitalize(vectorField.name.replace(/\./g, '_'))}`;

      const resourceConfig = (resource as unknown as { config: { partitions?: Record<string, unknown> } }).config;
      if (resourceConfig.partitions && resourceConfig.partitions[partitionName]) {
        this.emit('plg:vector:partition-exists', {
          resource: resource.name,
          vectorField: vectorField.name,
          partition: partitionName,
          timestamp: Date.now()
        });
        continue;
      }

      if (!resourceConfig.partitions) {
        resourceConfig.partitions = {};
      }

      resourceConfig.partitions[partitionName] = {
        fields: {
          [trackingFieldName]: 'boolean'
        }
      };

      const schema = (resource as unknown as { schema: { attributes: Record<string, unknown> } }).schema;
      if (!schema.attributes[trackingFieldName]) {
        (resource as unknown as { addPluginAttribute: (name: string, config: unknown, plugin: string) => void }).addPluginAttribute(trackingFieldName, {
          type: 'boolean',
          optional: true,
          default: false
        }, 'VectorPlugin');
      }

      this.emit('plg:vector:partition-created', {
        resource: resource.name,
        vectorField: vectorField.name,
        partition: partitionName,
        trackingField: trackingFieldName,
        timestamp: Date.now()
      });

      this.logger.info(`✅ VectorPlugin: Created partition '${partitionName}' for optional embedding field '${vectorField.name}' in resource '${resource.name}'`);

      this.installEmbeddingHooks(resource, vectorField.name, trackingFieldName);
    }
  }

  isFieldOptional(attributes: Record<string, unknown>, fieldPath: string): boolean {
    const parts = fieldPath.split('.');
    let current = attributes;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const attr = current[part];

      if (!attr) return true;

      if (typeof attr === 'string') {
        const flags = attr.split('|');
        if (flags.includes('required')) return false;
        if (flags.includes('optional') || flags.some(f => f.startsWith('optional:'))) return true;
        return !flags.includes('required');
      }

      if (typeof attr === 'object' && attr !== null) {
        const attrObj = attr as { type?: string; props?: Record<string, unknown>; optional?: boolean };
        if (i === parts.length - 1) {
          if (attrObj.optional === true) return true;
          if (attrObj.optional === false) return false;
          return attrObj.optional !== false;
        }

        if (attrObj.type === 'object' && attrObj.props) {
          current = attrObj.props;
        } else {
          return true;
        }
      }
    }

    return true;
  }

  capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  installEmbeddingHooks(resource: Resource, vectorField: string, trackingField: string): void {
    const resourceWithHooks = resource as unknown as {
      registerHook: (event: string, handler: Function) => void;
    };

    resourceWithHooks.registerHook('beforeInsert', async (data: Record<string, unknown>) => {
      const hasVector = this.hasVectorValue(data, vectorField);
      this.setNestedValue(data, trackingField, hasVector);
      return data;
    });

    resourceWithHooks.registerHook('beforeUpdate', async (_id: string, updates: Record<string, unknown>) => {
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

  hasVectorValue(data: Record<string, unknown>, fieldPath: string): boolean {
    const value = this.getNestedValue(data, fieldPath);
    return value != null && Array.isArray(value) && value.length > 0;
  }

  hasNestedKey(obj: Record<string, unknown>, path: string): boolean {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current == null || typeof current !== 'object') return false;
      if (!(part in (current as Record<string, unknown>))) return false;
      current = (current as Record<string, unknown>)[part];
    }

    return true;
  }

  getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]!] = value;
  }

  getAutoEmbeddingPartition(resource: Resource, vectorField: string): AutoPartitionConfig | null {
    if (!(resource as unknown as { config: unknown }).config) return null;

    const partitionName = `byHas${this.capitalize(vectorField.replace(/\./g, '_'))}`;
    const trackingFieldName = `_has${this.capitalize(vectorField.replace(/\./g, '_'))}`;

    const resourceConfig = (resource as unknown as { config: { partitions?: Record<string, unknown> } }).config;
    if (resourceConfig.partitions && resourceConfig.partitions[partitionName]) {
      return {
        partitionName,
        partitionValues: { [trackingFieldName]: true }
      };
    }

    return null;
  }

  detectVectorField(resource: Resource): string | null {
    if (this._vectorFieldCache.has(resource.name)) {
      return this._vectorFieldCache.get(resource.name)!;
    }

    const vectorField = this._findEmbeddingField((resource as unknown as { schema: { attributes: Record<string, unknown> } }).schema.attributes);

    this._vectorFieldCache.set(resource.name, vectorField);

    if (vectorField && this.config.emitEvents) {
      this.emit('plg:vector:field-detected', {
        resource: resource.name,
        vectorField,
        timestamp: Date.now()
      });
    }

    return vectorField;
  }

  private _findEmbeddingField(attributes: Record<string, unknown>, path: string = ''): string | null {
    for (const [key, attr] of Object.entries(attributes)) {
      const fullPath = path ? `${path}.${key}` : key;

      if (typeof attr === 'string' && attr.startsWith('embedding:')) {
        return fullPath;
      }

      if (typeof attr === 'object' && attr !== null) {
        const attrObj = attr as { type?: string; items?: string; length?: number; props?: Record<string, unknown> };
        if (attrObj.type === 'array' && attrObj.items === 'number' && attrObj.length) {
          return fullPath;
        }

        if (attrObj.type === 'object' && attrObj.props) {
          const nested = this._findEmbeddingField(attrObj.props, fullPath);
          if (nested) return nested;
        }
      }
    }

    return null;
  }

  private _emitEvent(eventName: string, data: Record<string, unknown>, throttleKey: string | null = null): void {
    if (!this.config.emitEvents) return;

    if (throttleKey) {
      const now = Date.now();
      const lastEmit = this._throttleState.get(throttleKey);

      if (lastEmit && (now - lastEmit) < this.config.eventThrottle) {
        return;
      }

      this._throttleState.set(throttleKey, now);
    }

    this.emit(eventName, data);
  }

  findVectorFields(attributes: Record<string, unknown>, path: string = ''): VectorFieldInfo[] {
    const vectors: VectorFieldInfo[] = [];

    for (const [key, attr] of Object.entries(attributes)) {
      const fullPath = path ? `${path}.${key}` : key;

      if (typeof attr === 'object' && attr !== null) {
        const attrObj = attr as { type?: string; items?: string; length?: number; props?: Record<string, unknown> };

        if (attrObj.type === 'array' && attrObj.items === 'number' && attrObj.length) {
          vectors.push({
            name: fullPath,
            length: attrObj.length,
            estimatedBytes: this.estimateVectorBytes(attrObj.length)
          });
        }

        if (attrObj.type === 'object' && attrObj.props) {
          vectors.push(...this.findVectorFields(attrObj.props, fullPath));
        }
      }
    }

    return vectors;
  }

  estimateVectorBytes(dimensions: number): number {
    return dimensions * 7 + 50;
  }

  installResourceMethods(): void {
    for (const resource of Object.values(this.database.resources)) {
      const searchMethod = this.createVectorSearchMethod(resource);
      const clusterMethod = this.createClusteringMethod(resource);
      const distanceMethod = this.createDistanceMethod();

      const resourceAny = resource as unknown as Record<string, unknown>;
      resourceAny.vectorSearch = searchMethod;
      resourceAny.cluster = clusterMethod;
      resourceAny.vectorDistance = distanceMethod;
      resourceAny.similarTo = searchMethod;
      resourceAny.findSimilar = searchMethod;
      resourceAny.distance = distanceMethod;
    }
  }

  createVectorSearchMethod(resource: Resource): (queryVector: number[], options?: VectorSearchOptions) => Promise<VectorSearchResult[]> {
    return async (queryVector: number[], options: VectorSearchOptions = {}): Promise<VectorSearchResult[]> => {
      const startTime = Date.now();

      let vectorField = options.vectorField;
      if (!vectorField && this.config.autoDetectVectorField) {
        vectorField = this.detectVectorField(resource) || 'vector';
      } else if (!vectorField) {
        vectorField = 'vector';
      }

      const {
        limit = 10,
        distanceMetric = this.config.distanceMetric,
        threshold = null,
        partition = null,
        partitionValues = null
      } = options;

      let actualPartition = partition;
      let actualPartitionValues = partitionValues;

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

      if (!actualPartition) {
        const autoPartition = this.getAutoEmbeddingPartition(resource, vectorField);
        if (autoPartition) {
          actualPartition = autoPartition.partitionName;
          actualPartitionValues = autoPartition.partitionValues;

          this._emitEvent('vector:auto-partition-used', {
            resource: resource.name,
            vectorField,
            partition: actualPartition,
            partitionValues: actualPartitionValues,
            timestamp: Date.now()
          });
        }
      }

      this._emitEvent('vector:search-start', {
        resource: resource.name,
        vectorField,
        limit,
        distanceMetric,
        partition: actualPartition,
        partitionValues: actualPartitionValues,
        threshold,
        queryDimensions: queryVector.length,
        timestamp: startTime
      });

      try {
        let allRecords: Array<Record<string, unknown>>;
        if (actualPartition && actualPartitionValues) {
          this._emitEvent('vector:partition-filter', {
            resource: resource.name,
            partition: actualPartition,
            partitionValues: actualPartitionValues,
            timestamp: Date.now()
          });
          allRecords = await resource.list({ partition: actualPartition, partitionValues: actualPartitionValues });
        } else {
          const resourceAny = resource as unknown as { getAll?: () => Promise<Array<Record<string, unknown>>> };
          allRecords = resourceAny.getAll ? await resourceAny.getAll() : await resource.list();
        }

        const totalRecords = allRecords.length;
        let processedRecords = 0;
        let dimensionMismatches = 0;

        if (!actualPartition && totalRecords > 1000) {
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

        const results = allRecords
          .filter(record => record[vectorField!] && Array.isArray(record[vectorField!]))
          .map((record, index) => {
            try {
              const distance = distanceFn(queryVector, record[vectorField!] as number[]);
              processedRecords++;

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
            } catch {
              dimensionMismatches++;

              if (this.config.logLevelEvents) {
                const mismatchData = {
                  resource: resource.name,
                  recordIndex: index,
                  expected: queryVector.length,
                  got: (record[vectorField!] as number[] | undefined)?.length,
                  timestamp: Date.now()
                };
                this._emitEvent('vector:dimension-mismatch', mismatchData);
                this.logger.debug(mismatchData, `Dimension mismatch at record ${index}: expected ${mismatchData.expected}, got ${mismatchData.got}`);
              }

              return null;
            }
          })
          .filter((result): result is VectorSearchResult => result !== null)
          .filter(result => threshold === null || result.distance <= threshold)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, limit);

        const duration = Date.now() - startTime;
        const throughput = totalRecords / (duration / 1000);

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
          error: (error as Error).message,
          stack: (error as Error).stack,
          timestamp: Date.now()
        });
        throw error;
      }
    };
  }

  createClusteringMethod(resource: Resource): (options?: ClusterOptions) => Promise<ClusterResult> {
    return async (options: ClusterOptions = {}): Promise<ClusterResult> => {
      const startTime = Date.now();

      let vectorField = options.vectorField;
      if (!vectorField && this.config.autoDetectVectorField) {
        vectorField = this.detectVectorField(resource) || 'vector';
      } else if (!vectorField) {
        vectorField = 'vector';
      }

      const {
        k = 5,
        distanceMetric = this.config.distanceMetric,
        partition = null,
        partitionValues = null,
        ...kmeansOptions
      } = options;

      let actualPartition = partition;
      let actualPartitionValues = partitionValues;

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

      if (!actualPartition) {
        const autoPartition = this.getAutoEmbeddingPartition(resource, vectorField);
        if (autoPartition) {
          actualPartition = autoPartition.partitionName;
          actualPartitionValues = autoPartition.partitionValues;

          this._emitEvent('vector:auto-partition-used', {
            resource: resource.name,
            vectorField,
            partition: actualPartition,
            partitionValues: actualPartitionValues,
            timestamp: Date.now()
          });
        }
      }

      this._emitEvent('vector:cluster-start', {
        resource: resource.name,
        vectorField,
        k,
        distanceMetric,
        partition: actualPartition,
        partitionValues: actualPartitionValues,
        maxIterations: (kmeansOptions as { maxIterations?: number }).maxIterations || 100,
        timestamp: startTime
      });

      try {
        let allRecords: Array<Record<string, unknown>>;
        if (actualPartition && actualPartitionValues) {
          this._emitEvent('vector:partition-filter', {
            resource: resource.name,
            partition: actualPartition,
            partitionValues: actualPartitionValues,
            timestamp: Date.now()
          });
          allRecords = await resource.list({ partition: actualPartition, partitionValues: actualPartitionValues });
        } else {
          const resourceAny = resource as unknown as { getAll?: () => Promise<Array<Record<string, unknown>>> };
          allRecords = resourceAny.getAll ? await resourceAny.getAll() : await resource.list();
        }

        const recordsWithVectors = allRecords.filter(
          record => record[vectorField!] && Array.isArray(record[vectorField!])
        );

        if (!actualPartition && allRecords.length > 1000) {
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

        const vectors = recordsWithVectors.map(record => record[vectorField!] as number[]);

        const result = kmeans(vectors, k, {
          ...kmeansOptions,
          distanceFn,
          onIteration: this.config.logLevelEvents ? (iteration: number, inertia: number, converged: boolean) => {
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

        if (result.converged) {
          this._emitEvent('vector:cluster-converged', {
            resource: resource.name,
            k,
            iterations: result.iterations,
            inertia: result.inertia,
            timestamp: Date.now()
          });
        }

        const clusters: Array<Array<Record<string, unknown>>> = Array(k).fill(null).map(() => []);
        recordsWithVectors.forEach((record, i) => {
          const clusterIndex = result.assignments[i]!;
          clusters[clusterIndex]!.push(record);
        });

        const duration = Date.now() - startTime;
        const clusterSizes = clusters.map(c => c.length);

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
          error: (error as Error).message,
          stack: (error as Error).stack,
          timestamp: Date.now()
        });
        throw error;
      }
    };
  }

  createDistanceMethod(): (vector1: number[], vector2: number[], metric?: DistanceMetric) => number {
    return (vector1: number[], vector2: number[], metric: DistanceMetric = this.config.distanceMetric): number => {
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

  static normalize(vector: number[]): number[] {
    return normalize(vector);
  }

  static dotProduct(vector1: number[], vector2: number[]): number {
    return dotProduct(vector1, vector2);
  }

  static async findOptimalK(vectors: number[][], options?: FindOptimalKOptions): Promise<unknown> {
    return findOptimalK(vectors, options);
  }
}
