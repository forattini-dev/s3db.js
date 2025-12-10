import { Plugin } from './plugin.class.js';
import { cosineDistance, euclideanDistance, manhattanDistance, dotProduct, normalize } from './vector/distances.js';
import { kmeans, findOptimalK } from './vector/kmeans.js';
import { VectorError } from './vector/vector-error.js';
import { createLogger } from '../concerns/logger.js';
export class VectorPlugin extends Plugin {
    config;
    distanceFunctions;
    _vectorFieldCache;
    _throttleState;
    constructor(options = {}) {
        super(options);
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
            const logLevel = (this.logLevel === 'debug' || this.logLevel === 'trace' || options.logLevelEvents) ? 'debug' : 'info';
            this.logger = createLogger({ name: 'VectorPlugin', level: logLevel });
        }
        const { dimensions = 1536, distanceMetric = 'cosine', storageThreshold = 1500, autoFixBehavior = false, autoDetectVectorField = true, emitEvents = true, verboseEvents = false, eventThrottle = 100, ...rest } = this.options;
        this.config = {
            dimensions: dimensions,
            distanceMetric: distanceMetric,
            storageThreshold: storageThreshold,
            autoFixBehavior: autoFixBehavior,
            autoDetectVectorField: autoDetectVectorField,
            emitEvents: emitEvents,
            verboseEvents: verboseEvents,
            eventThrottle: eventThrottle,
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
    async onInstall() {
        this.emit('db:plugin:installed', { plugin: 'VectorPlugin' });
        this.validateVectorStorage();
        this.installResourceMethods();
    }
    async onStart() {
        this.emit('db:plugin:started', { plugin: 'VectorPlugin' });
    }
    async onStop() {
        this.emit('db:plugin:stopped', { plugin: 'VectorPlugin' });
    }
    async onUninstall() {
        for (const resource of Object.values(this.database.resources)) {
            delete resource.vectorSearch;
            delete resource.cluster;
            delete resource.vectorDistance;
            delete resource.similarTo;
            delete resource.findSimilar;
            delete resource.distance;
        }
        this.emit('db:plugin:uninstalled', { plugin: 'VectorPlugin' });
    }
    validateVectorStorage() {
        for (const resource of Object.values(this.database.resources)) {
            const vectorFields = this.findVectorFields(resource.schema.attributes);
            if (vectorFields.length === 0)
                continue;
            const totalVectorSize = vectorFields.reduce((sum, f) => sum + f.estimatedBytes, 0);
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
                    if (this.config.autoFixBehavior) {
                        resource.behavior = 'body-overflow';
                        this.emit('plg:vector:behavior-fixed', {
                            resource: resource.name,
                            newBehavior: 'body-overflow'
                        });
                    }
                    else {
                        this.logger.warn(`⚠️  VectorPlugin: Resource '${resource.name}' has large vector fields (${totalVectorSize} bytes estimated)`);
                        this.logger.warn(`   Current behavior: '${resource.behavior || 'default'}'`);
                        this.logger.warn(`   Recommendation: Add behavior: 'body-overflow' or 'body-only' to resource configuration`);
                        this.logger.warn(`   Large vectors will exceed S3 metadata limit (2047 bytes) and cause errors.`);
                        console.warn(`[VectorPlugin] Large vector fields detected on ${resource.name}; estimated ${totalVectorSize} bytes. ` +
                            `Recommend setting behavior to body-overflow/body-only to avoid S3 metadata limits.`);
                    }
                }
            }
            this.setupEmbeddingPartitions(resource, vectorFields);
        }
    }
    setupEmbeddingPartitions(resource, vectorFields) {
        if (!resource.config)
            return;
        for (const vectorField of vectorFields) {
            const isOptional = this.isFieldOptional(resource.schema.attributes, vectorField.name);
            if (!isOptional)
                continue;
            const partitionName = `byHas${this.capitalize(vectorField.name.replace(/\./g, '_'))}`;
            const trackingFieldName = `_has${this.capitalize(vectorField.name.replace(/\./g, '_'))}`;
            const resourceConfig = resource.config;
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
            const schema = resource.schema;
            if (!schema.attributes[trackingFieldName]) {
                resource.addPluginAttribute(trackingFieldName, {
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
    isFieldOptional(attributes, fieldPath) {
        const parts = fieldPath.split('.');
        let current = attributes;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const attr = current[part];
            if (!attr)
                return true;
            if (typeof attr === 'string') {
                const flags = attr.split('|');
                if (flags.includes('required'))
                    return false;
                if (flags.includes('optional') || flags.some(f => f.startsWith('optional:')))
                    return true;
                return !flags.includes('required');
            }
            if (typeof attr === 'object' && attr !== null) {
                const attrObj = attr;
                if (i === parts.length - 1) {
                    if (attrObj.optional === true)
                        return true;
                    if (attrObj.optional === false)
                        return false;
                    return attrObj.optional !== false;
                }
                if (attrObj.type === 'object' && attrObj.props) {
                    current = attrObj.props;
                }
                else {
                    return true;
                }
            }
        }
        return true;
    }
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    installEmbeddingHooks(resource, vectorField, trackingField) {
        const resourceWithHooks = resource;
        resourceWithHooks.registerHook('beforeInsert', async (data) => {
            const hasVector = this.hasVectorValue(data, vectorField);
            this.setNestedValue(data, trackingField, hasVector);
            return data;
        });
        resourceWithHooks.registerHook('beforeUpdate', async (_id, updates) => {
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
    hasVectorValue(data, fieldPath) {
        const value = this.getNestedValue(data, fieldPath);
        return value != null && Array.isArray(value) && value.length > 0;
    }
    hasNestedKey(obj, path) {
        const parts = path.split('.');
        let current = obj;
        for (const part of parts) {
            if (current == null || typeof current !== 'object')
                return false;
            if (!(part in current))
                return false;
            current = current[part];
        }
        return true;
    }
    getNestedValue(obj, path) {
        const parts = path.split('.');
        let current = obj;
        for (const part of parts) {
            if (current == null || typeof current !== 'object')
                return undefined;
            current = current[part];
        }
        return current;
    }
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
    getAutoEmbeddingPartition(resource, vectorField) {
        if (!resource.config)
            return null;
        const partitionName = `byHas${this.capitalize(vectorField.replace(/\./g, '_'))}`;
        const trackingFieldName = `_has${this.capitalize(vectorField.replace(/\./g, '_'))}`;
        const resourceConfig = resource.config;
        if (resourceConfig.partitions && resourceConfig.partitions[partitionName]) {
            return {
                partitionName,
                partitionValues: { [trackingFieldName]: true }
            };
        }
        return null;
    }
    detectVectorField(resource) {
        if (this._vectorFieldCache.has(resource.name)) {
            return this._vectorFieldCache.get(resource.name);
        }
        const vectorField = this._findEmbeddingField(resource.schema.attributes);
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
    _findEmbeddingField(attributes, path = '') {
        for (const [key, attr] of Object.entries(attributes)) {
            const fullPath = path ? `${path}.${key}` : key;
            if (typeof attr === 'string' && attr.startsWith('embedding:')) {
                return fullPath;
            }
            if (typeof attr === 'object' && attr !== null) {
                const attrObj = attr;
                if (attrObj.type === 'array' && attrObj.items === 'number' && attrObj.length) {
                    return fullPath;
                }
                if (attrObj.type === 'object' && attrObj.props) {
                    const nested = this._findEmbeddingField(attrObj.props, fullPath);
                    if (nested)
                        return nested;
                }
            }
        }
        return null;
    }
    _emitEvent(eventName, data, throttleKey = null) {
        if (!this.config.emitEvents)
            return;
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
    findVectorFields(attributes, path = '') {
        const vectors = [];
        for (const [key, attr] of Object.entries(attributes)) {
            const fullPath = path ? `${path}.${key}` : key;
            if (typeof attr === 'object' && attr !== null) {
                const attrObj = attr;
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
    estimateVectorBytes(dimensions) {
        return dimensions * 7 + 50;
    }
    installResourceMethods() {
        for (const resource of Object.values(this.database.resources)) {
            const searchMethod = this.createVectorSearchMethod(resource);
            const clusterMethod = this.createClusteringMethod(resource);
            const distanceMethod = this.createDistanceMethod();
            const resourceAny = resource;
            resourceAny.vectorSearch = searchMethod;
            resourceAny.cluster = clusterMethod;
            resourceAny.vectorDistance = distanceMethod;
            resourceAny.similarTo = searchMethod;
            resourceAny.findSimilar = searchMethod;
            resourceAny.distance = distanceMethod;
        }
    }
    createVectorSearchMethod(resource) {
        return async (queryVector, options = {}) => {
            const startTime = Date.now();
            let vectorField = options.vectorField;
            if (!vectorField && this.config.autoDetectVectorField) {
                vectorField = this.detectVectorField(resource) || 'vector';
            }
            else if (!vectorField) {
                vectorField = 'vector';
            }
            const { limit = 10, distanceMetric = this.config.distanceMetric, threshold = null, partition = null, partitionValues = null } = options;
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
                let allRecords;
                if (actualPartition && actualPartitionValues) {
                    this._emitEvent('vector:partition-filter', {
                        resource: resource.name,
                        partition: actualPartition,
                        partitionValues: actualPartitionValues,
                        timestamp: Date.now()
                    });
                    allRecords = await resource.list({ partition: actualPartition, partitionValues: actualPartitionValues });
                }
                else {
                    const resourceAny = resource;
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
                    .filter(record => record[vectorField] && Array.isArray(record[vectorField]))
                    .map((record, index) => {
                    try {
                        const distance = distanceFn(queryVector, record[vectorField]);
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
                    }
                    catch {
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
                    .filter((result) => result !== null)
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
            }
            catch (error) {
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
    createClusteringMethod(resource) {
        return async (options = {}) => {
            const startTime = Date.now();
            let vectorField = options.vectorField;
            if (!vectorField && this.config.autoDetectVectorField) {
                vectorField = this.detectVectorField(resource) || 'vector';
            }
            else if (!vectorField) {
                vectorField = 'vector';
            }
            const { k = 5, distanceMetric = this.config.distanceMetric, partition = null, partitionValues = null, ...kmeansOptions } = options;
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
                maxIterations: kmeansOptions.maxIterations || 100,
                timestamp: startTime
            });
            try {
                let allRecords;
                if (actualPartition && actualPartitionValues) {
                    this._emitEvent('vector:partition-filter', {
                        resource: resource.name,
                        partition: actualPartition,
                        partitionValues: actualPartitionValues,
                        timestamp: Date.now()
                    });
                    allRecords = await resource.list({ partition: actualPartition, partitionValues: actualPartitionValues });
                }
                else {
                    const resourceAny = resource;
                    allRecords = resourceAny.getAll ? await resourceAny.getAll() : await resource.list();
                }
                const recordsWithVectors = allRecords.filter(record => record[vectorField] && Array.isArray(record[vectorField]));
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
                const vectors = recordsWithVectors.map(record => record[vectorField]);
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
                if (result.converged) {
                    this._emitEvent('vector:cluster-converged', {
                        resource: resource.name,
                        k,
                        iterations: result.iterations,
                        inertia: result.inertia,
                        timestamp: Date.now()
                    });
                }
                const clusters = Array(k).fill(null).map(() => []);
                recordsWithVectors.forEach((record, i) => {
                    const clusterIndex = result.assignments[i];
                    clusters[clusterIndex].push(record);
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
            }
            catch (error) {
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
    static normalize(vector) {
        return normalize(vector);
    }
    static dotProduct(vector1, vector2) {
        return dotProduct(vector1, vector2);
    }
    static async findOptimalK(vectors, options) {
        return findOptimalK(vectors, options);
    }
}
//# sourceMappingURL=vector.plugin.js.map