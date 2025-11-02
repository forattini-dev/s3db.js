import { BaseHandler } from '../base-handler.js';

/**
 * Handler for resource CRUD operations
 */
export class ResourceHandler extends BaseHandler {
  constructor(database) {
    super(database);
  }

  /**
   * Create a new resource
   */
  async createResource(args) {
    this.ensureConnected();
    this.validateParams(args, ['name', 'attributes']);

    const {
      name,
      attributes,
      behavior = 'user-managed',
      timestamps = false,
      partitions,
      paranoid = true,
      hooks,
      events,
      idGenerator,
      idSize = 22,
      versioningEnabled
    } = args;

    const resource = await this.database.createResource({
      name,
      attributes,
      behavior,
      timestamps,
      partitions,
      paranoid,
      hooks,
      events,
      idGenerator,
      idSize,
      versioningEnabled
    });

    return this.formatResponse({
      name: resource.name,
      behavior: resource.behavior,
      attributes: resource.attributes,
      partitions: resource.config.partitions,
      timestamps: resource.config.timestamps,
      paranoid: resource.config.paranoid
    }, {
      message: `Resource '${name}' created successfully`
    });
  }

  /**
   * List all resources
   */
  async listResources() {
    this.ensureConnected();
    
    const resources = await this.database.listResources();
    
    return this.formatResponse({
      resources,
      count: resources.length
    });
  }

  /**
   * Insert a document
   */
  async insert(args) {
    this.ensureConnected();
    this.validateParams(args, ['resourceName', 'data']);

    const { resourceName, data } = args;
    const resource = this.getResource(resourceName);
    
    const result = await resource.insert(data);
    const partitionInfo = this.extractPartitionInfo(resource, result);
    
    return this.formatResponse(result, {
      partitionInfo,
      cacheInvalidated: this.getCacheInvalidationPatterns(resource, result, 'insert')
    });
  }

  /**
   * Insert multiple documents
   */
  async insertMany(args) {
    this.ensureConnected();
    this.validateParams(args, ['resourceName', 'data']);

    const { resourceName, data } = args;
    const resource = this.getResource(resourceName);
    
    const results = await resource.insertMany(data);
    
    return this.formatResponse({
      documents: results,
      count: results.length
    }, {
      message: `Inserted ${results.length} documents`
    });
  }

  /**
   * Get a document by ID
   */
  async get(args) {
    this.ensureConnected();
    this.validateParams(args, ['resourceName', 'id']);

    const { resourceName, id, partition, partitionValues } = args;
    const resource = this.getResource(resourceName);
    
    const options = {};
    if (partition && partitionValues) {
      options.partition = partition;
      options.partitionValues = partitionValues;
    }
    
    const result = await resource.get(id, options);
    const partitionInfo = this.extractPartitionInfo(resource, result);
    
    return this.formatResponse(result, {
      partitionInfo
    });
  }

  /**
   * Get multiple documents by IDs
   */
  async getMany(args) {
    this.ensureConnected();
    this.validateParams(args, ['resourceName', 'ids']);

    const { resourceName, ids } = args;
    const resource = this.getResource(resourceName);
    
    const results = await resource.getMany(ids);
    
    return this.formatResponse({
      documents: results,
      count: results.length,
      missing: ids.filter(id => !results.find(doc => doc.id === id))
    });
  }

  /**
   * Update a document
   */
  async update(args) {
    this.ensureConnected();
    this.validateParams(args, ['resourceName', 'id', 'data']);

    const { resourceName, id, data } = args;
    const resource = this.getResource(resourceName);
    
    const result = await resource.update(id, data);
    const partitionInfo = this.extractPartitionInfo(resource, result);
    
    return this.formatResponse(result, {
      partitionInfo,
      cacheInvalidated: this.getCacheInvalidationPatterns(resource, result, 'update')
    });
  }

  /**
   * Upsert a document
   */
  async upsert(args) {
    this.ensureConnected();
    this.validateParams(args, ['resourceName', 'data']);

    const { resourceName, data } = args;
    const resource = this.getResource(resourceName);
    
    const result = await resource.upsert(data);
    const isNew = !data.id || !(await resource.exists(data.id));
    
    return this.formatResponse(result, {
      operation: isNew ? 'insert' : 'update'
    });
  }

  /**
   * Delete a document
   */
  async delete(args) {
    this.ensureConnected();
    this.validateParams(args, ['resourceName', 'id']);

    const { resourceName, id } = args;
    const resource = this.getResource(resourceName);
    
    await resource.delete(id);
    
    return this.formatResponse({ id }, {
      message: `Document ${id} deleted from ${resourceName}`
    });
  }

  /**
   * Delete multiple documents
   */
  async deleteMany(args) {
    this.ensureConnected();
    this.validateParams(args, ['resourceName', 'ids']);

    const { resourceName, ids } = args;
    const resource = this.getResource(resourceName);
    
    await resource.deleteMany(ids);
    
    return this.formatResponse({
      deletedIds: ids,
      count: ids.length
    }, {
      message: `${ids.length} documents deleted from ${resourceName}`
    });
  }

  /**
   * Delete all documents
   */
  async deleteAll(args) {
    this.ensureConnected();
    this.validateParams(args, ['resourceName', 'confirm']);

    const { resourceName, confirm } = args;
    
    if (!confirm) {
      throw new Error('Confirmation required. Set confirm: true to proceed');
    }
    
    const resource = this.getResource(resourceName);
    const count = await resource.count();
    await resource.deleteAll();
    
    return this.formatResponse({
      deletedCount: count
    }, {
      message: `All documents deleted from ${resourceName}`
    });
  }

  /**
   * Check if document exists
   */
  async exists(args) {
    this.ensureConnected();
    this.validateParams(args, ['resourceName', 'id']);

    const { resourceName, id, partition, partitionValues } = args;
    const resource = this.getResource(resourceName);
    
    const options = {};
    if (partition && partitionValues) {
      options.partition = partition;
      options.partitionValues = partitionValues;
    }
    
    const exists = await resource.exists(id, options);
    
    return this.formatResponse({
      exists,
      id,
      resourceName
    }, {
      partition,
      partitionValues
    });
  }

  /**
   * List documents with pagination
   */
  async list(args) {
    this.ensureConnected();
    this.validateParams(args, ['resourceName']);

    const {
      resourceName,
      limit = 100,
      offset = 0,
      partition,
      partitionValues
    } = args;
    
    const resource = this.getResource(resourceName);
    const options = { limit, offset };
    
    if (partition && partitionValues) {
      options.partition = partition;
      options.partitionValues = partitionValues;
    }
    
    const results = await resource.list(options);
    
    return this.formatResponse({
      documents: results,
      count: results.length,
      pagination: {
        limit,
        offset,
        hasMore: results.length === limit
      }
    }, {
      cacheKey: this.generateCacheKey(resourceName, 'list', options)
    });
  }

  /**
   * List document IDs
   */
  async listIds(args) {
    this.ensureConnected();
    this.validateParams(args, ['resourceName']);

    const { resourceName, limit = 1000, offset = 0 } = args;
    const resource = this.getResource(resourceName);
    
    const ids = await resource.listIds({ limit, offset });
    
    return this.formatResponse({
      ids,
      count: ids.length,
      pagination: {
        limit,
        offset,
        hasMore: ids.length === limit
      }
    });
  }

  /**
   * Count documents
   */
  async count(args) {
    this.ensureConnected();
    this.validateParams(args, ['resourceName']);

    const { resourceName, partition, partitionValues } = args;
    const resource = this.getResource(resourceName);
    
    const options = {};
    if (partition && partitionValues) {
      options.partition = partition;
      options.partitionValues = partitionValues;
    }
    
    const count = await resource.count(options);
    
    return this.formatResponse({
      count,
      resourceName
    }, {
      cacheKey: this.generateCacheKey(resourceName, 'count', options)
    });
  }

  /**
   * Get all documents (use with caution)
   */
  async getAll(args) {
    this.ensureConnected();
    this.validateParams(args, ['resourceName']);

    const { resourceName } = args;
    const resource = this.getResource(resourceName);
    
    const results = await resource.getAll();
    
    return this.formatResponse({
      documents: results,
      count: results.length
    }, {
      warning: results.length > 1000 
        ? 'Large dataset returned. Consider using list with pagination.'
        : undefined
    });
  }

  // Private helper methods

  private getCacheInvalidationPatterns(resource, data, action) {
    const patterns = [];
    const resourceName = resource.name;
    
    // Invalidate list/count operations
    patterns.push(
      `resource=${resourceName}/action=list`,
      `resource=${resourceName}/action=count`,
      `resource=${resourceName}/action=getAll`
    );
    
    // Invalidate partition-specific cache
    const partitionInfo = this.extractPartitionInfo(resource, data);
    if (partitionInfo) {
      for (const [partition, values] of Object.entries(partitionInfo)) {
        const sortedValues = Object.entries(values)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}=${v}`)
          .join('&');
        
        patterns.push(
          `resource=${resourceName}/action=list/partition=${partition}/values=${sortedValues}`,
          `resource=${resourceName}/action=count/partition=${partition}/values=${sortedValues}`
        );
      }
    }
    
    // Invalidate document-specific cache
    if (data.id) {
      patterns.push(
        `resource=${resourceName}/action=get/id=${data.id}`,
        `resource=${resourceName}/action=exists/id=${data.id}`
      );
    }
    
    return patterns;
  }
}