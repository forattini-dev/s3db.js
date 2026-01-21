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
export type PartitionPolicy = 'allow' | 'warn' | 'error';

export interface VectorPluginOptions extends Record<string, unknown> {
  dimensions?: number;
  distanceMetric?: DistanceMetric;
  storageThreshold?: number;
  autoFixBehavior?: boolean;
  autoDetectVectorField?: boolean;
  emitEvents?: boolean;
  verboseEvents?: boolean;
  eventThrottle?: number;
  partitionPolicy?: PartitionPolicy;
  maxUnpartitionedRecords?: number;
  searchPageSize?: number;
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
  partitionPolicy: PartitionPolicy;
  maxUnpartitionedRecords: number;
  searchPageSize: number;
}

export interface VectorSearchOptions {
  vectorField?: string;
  limit?: number;
  distanceMetric?: DistanceMetric;
  threshold?: number | null;
  partition?: string | null;
  partitionValues?: Record<string, unknown> | null;
  pageSize?: number;
  maxScannedRecords?: number | null;
  recordFilter?: (record: Record<string, unknown>) => boolean;
  partitionPolicy?: PartitionPolicy;
  maxUnpartitionedRecords?: number;
  onProgress?: (stats: VectorSearchStats) => void;
}

export interface VectorSearchStats {
  totalRecords: number | null;
  scannedRecords: number;
  processedRecords: number;
  pagesScanned: number;
  dimensionMismatches: number;
  durationMs: number;
  approximate: boolean;
}

export interface VectorSearchResult {
  record: Record<string, unknown>;
  distance: number;
}

export interface VectorSearchPagedResult {
  results: VectorSearchResult[];
  stats: VectorSearchStats;
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

class MaxHeap<T> {
  private data: T[] = [];
  private compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  size(): number {
    return this.data.length;
  }

  peek(): T | null {
    return this.data[0] ?? null;
  }

  push(item: T): void {
    this.data.push(item);
    this._bubbleUp(this.data.length - 1);
  }

  replaceTop(item: T): void {
    if (this.data.length === 0) {
      this.data[0] = item;
      return;
    }
    this.data[0] = item;
    this._bubbleDown(0);
  }

  toArray(): T[] {
    return [...this.data];
  }

  private _bubbleUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      const currentValue = this.data[current]!;
      const parentValue = this.data[parent]!;
      if (this.compare(currentValue, parentValue) <= 0) break;
      this.data[current] = parentValue;
      this.data[parent] = currentValue;
      current = parent;
    }
  }

  private _bubbleDown(index: number): void {
    let current = index;
    const length = this.data.length;
    while (true) {
      const left = current * 2 + 1;
      const right = current * 2 + 2;
      let largest = current;

      if (left < length && this.compare(this.data[left]!, this.data[largest]!) > 0) {
        largest = left;
      }

      if (right < length && this.compare(this.data[right]!, this.data[largest]!) > 0) {
        largest = right;
      }

      if (largest === current) break;
      const currentValue = this.data[current]!;
      this.data[current] = this.data[largest]!;
      this.data[largest] = currentValue;
      current = largest;
    }
  }
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
      partitionPolicy = 'warn',
      maxUnpartitionedRecords = 1000,
      searchPageSize = 1000,
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
      partitionPolicy: partitionPolicy as PartitionPolicy,
      maxUnpartitionedRecords: maxUnpartitionedRecords as number,
      searchPageSize: searchPageSize as number,
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
      delete (resource as unknown as Record<string, unknown>).vectorSearchPaged;
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
      const searchPagedMethod = this.createVectorSearchPagedMethod(resource);
      const clusterMethod = this.createClusteringMethod(resource);
      const distanceMethod = this.createDistanceMethod();

      const resourceAny = resource as unknown as Record<string, unknown>;
      resourceAny.vectorSearch = searchMethod;
      resourceAny.vectorSearchPaged = searchPagedMethod;
      resourceAny.cluster = clusterMethod;
      resourceAny.vectorDistance = distanceMethod;
      resourceAny.similarTo = searchMethod;
      resourceAny.findSimilar = searchMethod;
      resourceAny.distance = distanceMethod;
    }
  }

  createVectorSearchMethod(resource: Resource): (queryVector: number[], options?: VectorSearchOptions) => Promise<VectorSearchResult[]> {
    return async (queryVector: number[], options: VectorSearchOptions = {}): Promise<VectorSearchResult[]> => {
      const { results } = await this._vectorSearchPaged(resource, queryVector, options);
      return results;
    };
  }

  createVectorSearchPagedMethod(resource: Resource): (queryVector: number[], options?: VectorSearchOptions) => Promise<VectorSearchPagedResult> {
    return async (queryVector: number[], options: VectorSearchOptions = {}): Promise<VectorSearchPagedResult> => {
      return await this._vectorSearchPaged(resource, queryVector, options);
    };
  }

  private async _vectorSearchPaged(resource: Resource, queryVector: number[], options: VectorSearchOptions = {}): Promise<VectorSearchPagedResult> {
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
      partitionValues = null,
      pageSize = this.config.searchPageSize,
      maxScannedRecords = null,
      recordFilter,
      partitionPolicy = this.config.partitionPolicy,
      maxUnpartitionedRecords = this.config.maxUnpartitionedRecords,
      onProgress
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

    if (actualPartition && actualPartitionValues === null) {
      actualPartitionValues = {};
    }

    const effectivePageSize = pageSize && pageSize > 0 ? pageSize : this.config.searchPageSize;

    this._emitEvent('vector:search-start', {
      resource: resource.name,
      vectorField,
      limit,
      distanceMetric,
      partition: actualPartition,
      partitionValues: actualPartitionValues,
      threshold,
      pageSize: effectivePageSize,
      maxScannedRecords,
      partitionPolicy,
      maxUnpartitionedRecords,
      queryDimensions: queryVector.length,
      timestamp: startTime
    });

    try {
      const stats: VectorSearchStats = {
        totalRecords: null,
        scannedRecords: 0,
        processedRecords: 0,
        pagesScanned: 0,
        dimensionMismatches: 0,
        durationMs: 0,
        approximate: false
      };

      const policyMaxRecords = maxUnpartitionedRecords ?? this.config.maxUnpartitionedRecords;
      const policyMode = partitionPolicy ?? this.config.partitionPolicy;
      let policyWarned = false;

      if (!actualPartition && policyMode !== 'allow' && policyMaxRecords > 0) {
        const countFn = (resource as unknown as { count?: (options?: { partition?: string | null; partitionValues?: Record<string, unknown> }) => Promise<number> }).count;
        if (countFn) {
          try {
            stats.totalRecords = await countFn.call(resource, { partition: null, partitionValues: {} });
            if (stats.totalRecords > policyMaxRecords) {
              const policyEvent = {
                resource: resource.name,
                operation: 'vectorSearch',
                policy: policyMode,
                totalRecords: stats.totalRecords,
                maxUnpartitionedRecords: policyMaxRecords,
                vectorField,
                timestamp: Date.now()
              };

              this._emitEvent('vector:search-policy', policyEvent);

              if (policyMode === 'error') {
                throw new VectorError(`Vector search requires a partition when dataset exceeds ${policyMaxRecords} records`, {
                  operation: 'vectorSearch',
                  policy: policyMode,
                  totalRecords: stats.totalRecords,
                  maxUnpartitionedRecords: policyMaxRecords,
                  resource: resource.name,
                  vectorField
                });
              }

              if (policyMode === 'warn') {
                const warning = {
                  resource: resource.name,
                  operation: 'vectorSearch',
                  totalRecords: stats.totalRecords,
                  vectorField,
                  recommendation: 'Use partitions to filter data before vector search for better performance'
                };
                this._emitEvent('vector:performance-warning', warning);
                this.logger.warn(`⚠️  VectorPlugin: Performing vectorSearch on ${stats.totalRecords} records without partition filter`);
                this.logger.warn(`   Resource: '${resource.name}'`);
                this.logger.warn(`   Recommendation: Use partition parameter to reduce search space`);
                this.logger.warn(`   Example: resource.vectorSearch(vector, { partition: 'byCategory', partitionValues: { category: 'books' } })`);
                policyWarned = true;
              }
            }
          } catch (error) {
            if (policyMode === 'error') {
              throw error;
            }
          }
        }
      }

      if (actualPartition && actualPartitionValues) {
        this._emitEvent('vector:partition-filter', {
          resource: resource.name,
          partition: actualPartition,
          partitionValues: actualPartitionValues,
          timestamp: Date.now()
        });
      }

      if (limit <= 0) {
        const duration = Date.now() - startTime;
        stats.durationMs = duration;

        this._emitEvent('vector:search-complete', {
          resource: resource.name,
          vectorField,
          resultsCount: 0,
          totalRecords: stats.totalRecords,
          processedRecords: stats.processedRecords,
          scannedRecords: stats.scannedRecords,
          pagesScanned: stats.pagesScanned,
          dimensionMismatches: stats.dimensionMismatches,
          duration,
          approximate: stats.approximate,
          throughput: '0.00',
          timestamp: Date.now()
        });

        return { results: [], stats };
      }

      const resultsHeap = new MaxHeap<VectorSearchResult>((a, b) => a.distance - b.distance);
      let offset = 0;
      let stopScan = false;

      while (true) {
        const listOptions = actualPartition && actualPartitionValues
          ? { partition: actualPartition, partitionValues: actualPartitionValues, limit: effectivePageSize, offset }
          : { limit: effectivePageSize, offset };

        const batch = await resource.list(listOptions);

        if (batch.length === 0) {
          break;
        }

        stats.pagesScanned += 1;

        for (const [index, record] of batch.entries()) {
          if (maxScannedRecords && stats.scannedRecords >= maxScannedRecords) {
            stats.approximate = true;
            stopScan = true;
            break;
          }

          stats.scannedRecords += 1;

          if (recordFilter && !recordFilter(record as Record<string, unknown>)) {
            continue;
          }

          const vectorValue = (record as Record<string, unknown>)[vectorField!];
          if (!vectorValue || !Array.isArray(vectorValue)) {
            continue;
          }

          try {
            const distance = distanceFn(queryVector, vectorValue as number[]);
            stats.processedRecords += 1;

            if (threshold !== null && distance > threshold) {
              continue;
            }

            const resultItem = { record: record as Record<string, unknown>, distance };

            if (resultsHeap.size() < limit) {
              resultsHeap.push(resultItem);
            } else {
              const currentWorst = resultsHeap.peek();
              if (currentWorst && distance < currentWorst.distance) {
                resultsHeap.replaceTop(resultItem);
              }
            }

            if (this.config.logLevelEvents && stats.processedRecords % 100 === 0) {
              const progress = stats.totalRecords ? (stats.scannedRecords / stats.totalRecords) * 100 : null;
              const progressData = {
                resource: resource.name,
                processed: stats.processedRecords,
                scanned: stats.scannedRecords,
                total: stats.totalRecords,
                progress,
                timestamp: Date.now()
              };
              this._emitEvent('vector:search-progress', progressData, `search-${resource.name}`);
              if (progress !== null) {
                this.logger.debug(progressData, `Search progress: ${stats.scannedRecords}/${stats.totalRecords} (${progress.toFixed(1)}%)`);
              } else {
                this.logger.debug(progressData, `Search progress: scanned ${stats.scannedRecords} records`);
              }
            }
          } catch {
            stats.dimensionMismatches += 1;

            if (this.config.logLevelEvents) {
              const mismatchData = {
                resource: resource.name,
                recordIndex: offset + index,
                expected: queryVector.length,
                got: (vectorValue as number[] | undefined)?.length,
                timestamp: Date.now()
              };
              this._emitEvent('vector:dimension-mismatch', mismatchData);
              this.logger.debug(mismatchData, `Dimension mismatch at record ${offset + index}: expected ${mismatchData.expected}, got ${mismatchData.got}`);
            }
          }
        }

        if (stopScan) {
          break;
        }

        if (!actualPartition && policyMode !== 'allow' && stats.totalRecords === null && policyMaxRecords > 0 && stats.scannedRecords > policyMaxRecords) {
          const policyEvent = {
            resource: resource.name,
            operation: 'vectorSearch',
            policy: policyMode,
            totalRecords: stats.scannedRecords,
            maxUnpartitionedRecords: policyMaxRecords,
            vectorField,
            timestamp: Date.now()
          };

          if (!policyWarned || policyMode === 'error') {
            this._emitEvent('vector:search-policy', policyEvent);
          }

          if (policyMode === 'error') {
            throw new VectorError(`Vector search requires a partition when dataset exceeds ${policyMaxRecords} records`, {
              operation: 'vectorSearch',
              policy: policyMode,
              totalRecords: stats.scannedRecords,
              maxUnpartitionedRecords: policyMaxRecords,
              resource: resource.name,
              vectorField
            });
          }

          if (policyMode === 'warn' && !policyWarned) {
            const warning = {
              resource: resource.name,
              operation: 'vectorSearch',
              totalRecords: stats.scannedRecords,
              vectorField,
              recommendation: 'Use partitions to filter data before vector search for better performance'
            };
            this._emitEvent('vector:performance-warning', warning);
            this.logger.warn(`⚠️  VectorPlugin: Performing vectorSearch on ${stats.scannedRecords} records without partition filter`);
            this.logger.warn(`   Resource: '${resource.name}'`);
            this.logger.warn(`   Recommendation: Use partition parameter to reduce search space`);
            this.logger.warn(`   Example: resource.vectorSearch(vector, { partition: 'byCategory', partitionValues: { category: 'books' } })`);
            policyWarned = true;
          }
        }

        if (batch.length < effectivePageSize) {
          break;
        }

        offset += effectivePageSize;

        if (onProgress) {
          onProgress({
            ...stats,
            durationMs: Date.now() - startTime
          });
        }
      }

      const results = resultsHeap
        .toArray()
        .sort((a, b) => a.distance - b.distance);

      const duration = Date.now() - startTime;
      const throughput = stats.scannedRecords > 0 ? stats.scannedRecords / (duration / 1000) : 0;
      stats.durationMs = duration;

      this._emitEvent('vector:search-complete', {
        resource: resource.name,
        vectorField,
        resultsCount: results.length,
        totalRecords: stats.totalRecords,
        processedRecords: stats.processedRecords,
        scannedRecords: stats.scannedRecords,
        pagesScanned: stats.pagesScanned,
        dimensionMismatches: stats.dimensionMismatches,
        duration,
        approximate: stats.approximate,
        throughput: throughput.toFixed(2),
        timestamp: Date.now()
      });

      if (this.config.logLevelEvents) {
        const perfData = {
          operation: 'search',
          resource: resource.name,
          duration,
          throughput: throughput.toFixed(2),
          recordsPerSecond: stats.processedRecords > 0 ? (stats.processedRecords / (duration / 1000)).toFixed(2) : '0.00',
          scannedRecords: stats.scannedRecords,
          approximate: stats.approximate,
          timestamp: Date.now()
        };
        this._emitEvent('vector:performance', perfData);
        this.logger.debug(perfData, `Search performance: ${duration}ms, ${perfData.throughput} MB/s, ${perfData.recordsPerSecond} rec/s`);
      }

      return { results, stats };
    } catch (error) {
      this._emitEvent('vector:search-error', {
        resource: resource.name,
        error: (error as Error).message,
        stack: (error as Error).stack,
        timestamp: Date.now()
      });
      throw error;
    }
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
