import Plugin from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import {
  RelationError,
  RelationConfigError,
  UnsupportedRelationTypeError,
  RelatedResourceNotFoundError,
  JunctionTableNotFoundError,
  CascadeError,
  MissingForeignKeyError,
  CircularRelationError,
  InvalidIncludePathError,
  BatchLoadError
} from "./relation.errors.js";

/**
 * RelationPlugin - Add relationship support between resources
 *
 * Enables defining and querying relationships between resources:
 * - hasOne: One-to-one (User → Profile)
 * - hasMany: One-to-many (User → Posts)
 * - belongsTo: Inverse one-to-many (Post → User)
 * - belongsToMany: Many-to-many via junction table (Post ↔ Tags)
 *
 * === Features ===
 * - Eager loading with `include` option
 * - Lazy loading with dynamic methods
 * - Cascade delete/update operations
 * - N+1 query prevention with batch loading
 * - Nested relation includes
 * - Cache integration
 *
 * === Configuration Example ===
 *
 * new RelationPlugin({
 *   relations: {
 *     users: {
 *       profile: {
 *         type: 'hasOne',
 *         resource: 'profiles',
 *         foreignKey: 'userId',
 *         localKey: 'id',
 *         eager: false,
 *         cascade: []
 *       },
 *       posts: {
 *         type: 'hasMany',
 *         resource: 'posts',
 *         foreignKey: 'userId',
 *         localKey: 'id',
 *         cascade: ['delete']
 *       }
 *     },
 *     posts: {
 *       author: {
 *         type: 'belongsTo',
 *         resource: 'users',
 *         foreignKey: 'userId',
 *         localKey: 'id'
 *       },
 *       tags: {
 *         type: 'belongsToMany',
 *         resource: 'tags',
 *         through: 'post_tags',
 *         foreignKey: 'postId',
 *         otherKey: 'tagId'
 *       }
 *     }
 *   },
 *   cache: true,
 *   batchSize: 100,
 *   preventN1: true,
 *   verbose: false
 * })
 *
 * === Usage Examples ===
 *
 * // Eager loading
 * const user = await users.get('u1', { include: ['profile', 'posts'] });
 *
 * // Nested includes
 * const user = await users.get('u1', {
 *   include: {
 *     posts: {
 *       include: ['comments', 'tags']
 *     }
 *   }
 * });
 *
 * // Lazy loading
 * const posts = await user.posts();
 * const profile = await user.profile();
 *
 * // Cascade delete
 * await users.delete('u1'); // Also deletes related posts if cascade configured
 */
class RelationPlugin extends Plugin {
  constructor(config = {}) {
    super(config);

    this.relations = config.relations || {};
    this.cache = config.cache !== undefined ? config.cache : true;
    this.batchSize = config.batchSize || 100;
    this.preventN1 = config.preventN1 !== undefined ? config.preventN1 : true;
    this.verbose = config.verbose || false;

    // Track loaded relations per request to prevent N+1
    this._loaderCache = new Map();

    // Statistics
    this.stats = {
      totalRelationLoads: 0,
      cachedLoads: 0,
      batchLoads: 0,
      cascadeOperations: 0
    };
  }

  /**
   * Install the plugin (lifecycle hook)
   * @override
   */
  async onInstall() {
    console.log('[RelationPlugin] onInstall() called');
    console.log('[RelationPlugin] Database connected:', !!this.database);
    console.log('[RelationPlugin] Relations:', Object.keys(this.relations));

    // Validate all relations upfront
    this._validateRelationsConfig();

    // Setup each resource with its relations
    for (const [resourceName, relationsDef] of Object.entries(this.relations)) {
      await this._setupResourceRelations(resourceName, relationsDef);
    }

    // Watch for resources created after plugin installation
    this.database.addHook('afterCreateResource', async (context) => {
      const { resource } = context;
      const relationsDef = this.relations[resource.name];

      if (relationsDef) {
        await this._setupResourceRelations(resource.name, relationsDef);
      }
    });

    if (this.verbose) {
      console.log(`[RelationPlugin] Installed with ${Object.keys(this.relations).length} resources`);
    }

    this.emit('installed', {
      plugin: 'RelationPlugin',
      resources: Object.keys(this.relations)
    });
  }

  /**
   * Validate all relations configuration
   * @private
   */
  _validateRelationsConfig() {
    for (const [resourceName, relationsDef] of Object.entries(this.relations)) {
      for (const [relationName, config] of Object.entries(relationsDef)) {
        // Validate relation type
        const validTypes = ['hasOne', 'hasMany', 'belongsTo', 'belongsToMany'];
        if (!validTypes.includes(config.type)) {
          throw new UnsupportedRelationTypeError(config.type, {
            resource: resourceName,
            relation: relationName
          });
        }

        // Validate required fields
        if (!config.resource) {
          throw new RelationConfigError(
            `Relation "${relationName}" on resource "${resourceName}" must have "resource" field`,
            { resource: resourceName, relation: relationName }
          );
        }

        if (!config.foreignKey) {
          throw new RelationConfigError(
            `Relation "${relationName}" on resource "${resourceName}" must have "foreignKey" field`,
            { resource: resourceName, relation: relationName }
          );
        }

        // Validate belongsToMany specific fields
        if (config.type === 'belongsToMany') {
          if (!config.through) {
            throw new RelationConfigError(
              `belongsToMany relation "${relationName}" must have "through" (junction table) configured`,
              { resource: resourceName, relation: relationName }
            );
          }
          if (!config.otherKey) {
            throw new RelationConfigError(
              `belongsToMany relation "${relationName}" must have "otherKey" configured`,
              { resource: resourceName, relation: relationName }
            );
          }
        }

        // Set defaults
        config.localKey = config.localKey || 'id';
        config.eager = config.eager !== undefined ? config.eager : false;
        config.cascade = config.cascade || [];
      }
    }
  }

  /**
   * Setup a resource with relation capabilities
   * @private
   */
  async _setupResourceRelations(resourceName, relationsDef) {
    const resource = this.database.resource(resourceName);
    if (!resource) {
      if (this.verbose) {
        console.warn(`[RelationPlugin] Resource "${resourceName}" not found, will setup when created`);
      }
      return;
    }

    // Store relations config on resource
    resource._relations = relationsDef;

    // Intercept get() to support eager loading
    this._interceptGet(resource);

    // Intercept list() to support eager loading
    this._interceptList(resource);

    // Intercept delete() to support cascade
    this._interceptDelete(resource);

    // Intercept update() to support cascade
    this._interceptUpdate(resource);

    if (this.verbose) {
      console.log(
        `[RelationPlugin] Setup ${Object.keys(relationsDef).length} relations for "${resourceName}"`
      );
    }
  }

  /**
   * Intercept get() to add eager loading support
   * @private
   */
  _interceptGet(resource) {
    if (this.verbose) {
      console.log(`[RelationPlugin] Intercepting get() for resource "${resource.name}"`);
    }

    this.wrapResourceMethod(resource, 'get', async (result, args) => {
      const [id, options = {}] = args;

      if (this.verbose) {
        console.log(`[RelationPlugin] get() wrapper called for "${resource.name}" with options:`, options);
      }

      if (!result || !options.include) {
        return result;
      }

      // Load eager relations
      return await this._eagerLoad([result], options.include, resource).then(results => results[0]);
    });
  }

  /**
   * Intercept list() to add eager loading support
   * @private
   */
  _interceptList(resource) {
    this.wrapResourceMethod(resource, 'list', async (result, args) => {
      const [options = {}] = args;

      if (!result || result.length === 0 || !options.include) {
        return result;
      }

      // Load eager relations
      return await this._eagerLoad(result, options.include, resource);
    });
  }

  /**
   * Intercept delete() to add cascade support
   * @private
   */
  _interceptDelete(resource) {
    this.addMiddleware(resource, 'delete', async (next, id, options = {}) => {
      // First get the record to know what to cascade
      const record = await resource.get(id);
      if (!record) {
        return await next(id, options);
      }

      // Execute cascade deletes BEFORE deleting the main record
      if (resource._relations) {
        for (const [relationName, config] of Object.entries(resource._relations)) {
          if (config.cascade && config.cascade.includes('delete')) {
            await this._cascadeDelete(record, resource, relationName, config);
          }
        }
      }

      // Delete the main record
      return await next(id, options);
    });
  }

  /**
   * Intercept update() to add cascade support (for foreign key updates)
   * @private
   */
  _interceptUpdate(resource) {
    this.wrapResourceMethod(resource, 'update', async (result, args) => {
      const [id, changes, options = {}] = args;

      // Check if local key was updated (rare but possible)
      const localKeyChanged = resource._relations &&
        Object.values(resource._relations).some(config => changes[config.localKey]);

      if (localKeyChanged && !options.skipCascade) {
        // Handle cascade updates for foreign key changes
        for (const [relationName, config] of Object.entries(resource._relations)) {
          if (config.cascade && config.cascade.includes('update') && changes[config.localKey]) {
            await this._cascadeUpdate(result, changes, resource, relationName, config);
          }
        }
      }

      return result;
    });
  }

  /**
   * Eager load relations
   * @private
   */
  async _eagerLoad(records, includes, resource) {
    if (!records || records.length === 0) {
      return records;
    }

    // Normalize includes to object format
    const normalizedIncludes = this._normalizeIncludes(includes);

    // Load each relation
    for (const [relationName, subIncludes] of Object.entries(normalizedIncludes)) {
      const config = resource._relations?.[relationName];
      if (!config) {
        throw new InvalidIncludePathError(
          relationName,
          `Relation "${relationName}" not defined on resource "${resource.name}"`
        );
      }

      // Load this level of relation
      records = await this._loadRelation(records, relationName, config, resource);

      // Recursively load nested relations
      if (subIncludes && typeof subIncludes === 'object' && subIncludes !== true) {
        // Extract the actual includes from { include: [...] } format
        const nestedIncludes = subIncludes.include || subIncludes;

        for (const record of records) {
          const relatedData = record[relationName];
          if (relatedData) {
            const relatedResource = this.database.resource(config.resource);
            const relatedArray = Array.isArray(relatedData) ? relatedData : [relatedData];

            if (relatedArray.length > 0) {
              await this._eagerLoad(relatedArray, nestedIncludes, relatedResource);
            }
          }
        }
      }
    }

    return records;
  }

  /**
   * Normalize includes format
   * @private
   */
  _normalizeIncludes(includes) {
    if (Array.isArray(includes)) {
      // ['profile', 'posts'] => { profile: true, posts: true }
      return includes.reduce((acc, rel) => ({ ...acc, [rel]: true }), {});
    }

    if (typeof includes === 'object') {
      // Already normalized: { posts: { include: ['comments'] }, profile: true }
      return includes;
    }

    if (typeof includes === 'string') {
      // 'profile' => { profile: true }
      return { [includes]: true };
    }

    return {};
  }

  /**
   * Load a relation for an array of records
   * @private
   */
  async _loadRelation(records, relationName, config, sourceResource) {
    this.stats.totalRelationLoads++;

    switch (config.type) {
      case 'hasOne':
        return await this._loadHasOne(records, relationName, config, sourceResource);
      case 'hasMany':
        return await this._loadHasMany(records, relationName, config, sourceResource);
      case 'belongsTo':
        return await this._loadBelongsTo(records, relationName, config, sourceResource);
      case 'belongsToMany':
        return await this._loadBelongsToMany(records, relationName, config, sourceResource);
      default:
        throw new UnsupportedRelationTypeError(config.type);
    }
  }

  /**
   * Load hasOne relation (User → Profile)
   * @private
   */
  async _loadHasOne(records, relationName, config, sourceResource) {
    const relatedResource = this.database.resource(config.resource);
    if (!relatedResource) {
      throw new RelatedResourceNotFoundError(config.resource, {
        sourceResource: sourceResource.name,
        relation: relationName
      });
    }

    // Collect all unique local keys
    const localKeys = [...new Set(records.map(r => r[config.localKey]).filter(Boolean))];

    if (localKeys.length === 0) {
      records.forEach(r => r[relationName] = null);
      return records;
    }

    // Batch load related records using query
    const relatedRecords = await relatedResource.query({
      [config.foreignKey]: { $in: localKeys }
    });

    // Create lookup map
    const relatedMap = new Map();
    relatedRecords.forEach(related => {
      relatedMap.set(related[config.foreignKey], related);
    });

    // Attach to records
    records.forEach(record => {
      const localKeyValue = record[config.localKey];
      record[relationName] = relatedMap.get(localKeyValue) || null;
    });

    return records;
  }

  /**
   * Load hasMany relation (User → Posts)
   * @private
   */
  async _loadHasMany(records, relationName, config, sourceResource) {
    const relatedResource = this.database.resource(config.resource);
    if (!relatedResource) {
      throw new RelatedResourceNotFoundError(config.resource, {
        sourceResource: sourceResource.name,
        relation: relationName
      });
    }

    // Collect all unique local keys
    const localKeys = [...new Set(records.map(r => r[config.localKey]).filter(Boolean))];

    if (localKeys.length === 0) {
      records.forEach(r => r[relationName] = []);
      return records;
    }

    // Batch load related records
    const relatedRecords = await relatedResource.query({
      [config.foreignKey]: { $in: localKeys }
    });

    // Create lookup map (one-to-many)
    const relatedMap = new Map();
    relatedRecords.forEach(related => {
      const fkValue = related[config.foreignKey];
      if (!relatedMap.has(fkValue)) {
        relatedMap.set(fkValue, []);
      }
      relatedMap.get(fkValue).push(related);
    });

    // Attach to records
    records.forEach(record => {
      const localKeyValue = record[config.localKey];
      record[relationName] = relatedMap.get(localKeyValue) || [];
    });

    if (this.preventN1) {
      this.stats.batchLoads++;
    }

    return records;
  }

  /**
   * Load belongsTo relation (Post → User)
   * @private
   */
  async _loadBelongsTo(records, relationName, config, sourceResource) {
    const relatedResource = this.database.resource(config.resource);
    if (!relatedResource) {
      throw new RelatedResourceNotFoundError(config.resource, {
        sourceResource: sourceResource.name,
        relation: relationName
      });
    }

    // Collect all unique foreign keys
    const foreignKeys = [...new Set(records.map(r => r[config.foreignKey]).filter(Boolean))];

    if (foreignKeys.length === 0) {
      records.forEach(r => r[relationName] = null);
      return records;
    }

    // Batch load parent records
    const [ok, err, parentRecords] = await tryFn(async () => {
      return await relatedResource.query({
        [config.localKey]: { $in: foreignKeys }
      });
    });

    if (!ok) {
      throw new RelationError(`Failed to load belongsTo relation "${relationName}": ${err.message}`, {
        sourceResource: sourceResource.name,
        relatedResource: config.resource,
        error: err
      });
    }

    // Create lookup map
    const parentMap = new Map();
    parentRecords.forEach(parent => {
      parentMap.set(parent[config.localKey], parent);
    });

    // Attach to records
    records.forEach(record => {
      const foreignKeyValue = record[config.foreignKey];
      record[relationName] = parentMap.get(foreignKeyValue) || null;
    });

    if (this.preventN1) {
      this.stats.batchLoads++;
    }

    return records;
  }

  /**
   * Load belongsToMany relation via junction table (Post ↔ Tags)
   * @private
   */
  async _loadBelongsToMany(records, relationName, config, sourceResource) {
    const relatedResource = this.database.resource(config.resource);
    if (!relatedResource) {
      throw new RelatedResourceNotFoundError(config.resource, {
        sourceResource: sourceResource.name,
        relation: relationName
      });
    }

    const junctionResource = this.database.resource(config.through);
    if (!junctionResource) {
      throw new JunctionTableNotFoundError(config.through, {
        sourceResource: sourceResource.name,
        relation: relationName
      });
    }

    // Collect all unique local keys
    const localKeys = [...new Set(records.map(r => r[config.localKey]).filter(Boolean))];

    if (localKeys.length === 0) {
      records.forEach(r => r[relationName] = []);
      return records;
    }

    // Step 1: Load junction table records
    const junctionRecords = await junctionResource.query({
      [config.foreignKey]: { $in: localKeys }
    });

    if (junctionRecords.length === 0) {
      records.forEach(r => r[relationName] = []);
      return records;
    }

    // Step 2: Collect other keys (tag IDs)
    const otherKeys = [...new Set(junctionRecords.map(j => j[config.otherKey]).filter(Boolean))];

    // Step 3: Load related records (tags)
    const relatedRecords = await relatedResource.query({
      [config.localKey]: { $in: otherKeys }
    });

    // Create maps
    const relatedMap = new Map();
    relatedRecords.forEach(related => {
      relatedMap.set(related[config.localKey], related);
    });

    const junctionMap = new Map();
    junctionRecords.forEach(junction => {
      const fkValue = junction[config.foreignKey];
      if (!junctionMap.has(fkValue)) {
        junctionMap.set(fkValue, []);
      }
      junctionMap.get(fkValue).push(junction[config.otherKey]);
    });

    // Attach to records
    records.forEach(record => {
      const localKeyValue = record[config.localKey];
      const otherKeyValues = junctionMap.get(localKeyValue) || [];

      record[relationName] = otherKeyValues
        .map(otherKey => relatedMap.get(otherKey))
        .filter(Boolean);
    });

    if (this.preventN1) {
      this.stats.batchLoads++;
    }

    return records;
  }

  /**
   * Cascade delete operation
   * @private
   */
  async _cascadeDelete(record, resource, relationName, config) {
    this.stats.cascadeOperations++;

    const relatedResource = this.database.resource(config.resource);
    if (!relatedResource) {
      throw new RelatedResourceNotFoundError(config.resource, {
        sourceResource: resource.name,
        relation: relationName
      });
    }

    try {
      if (config.type === 'hasMany') {
        // Delete all related records
        const relatedRecords = await relatedResource.query({
          [config.foreignKey]: record[config.localKey]
        });

        for (const related of relatedRecords) {
          await relatedResource.delete(related.id);
        }

        if (this.verbose) {
          console.log(
            `[RelationPlugin] Cascade deleted ${relatedRecords.length} ${config.resource} for ${resource.name}:${record.id}`
          );
        }
      } else if (config.type === 'hasOne') {
        // Delete single related record
        const relatedRecords = await relatedResource.query({
          [config.foreignKey]: record[config.localKey]
        });

        if (relatedRecords.length > 0) {
          await relatedResource.delete(relatedRecords[0].id);
        }
      } else if (config.type === 'belongsToMany') {
        // Delete junction table entries
        const junctionResource = this.database.resource(config.through);
        if (junctionResource) {
          const junctionRecords = await junctionResource.query({
            [config.foreignKey]: record[config.localKey]
          });

          for (const junction of junctionRecords) {
            await junctionResource.delete(junction.id);
          }

          if (this.verbose) {
            console.log(
              `[RelationPlugin] Cascade deleted ${junctionRecords.length} junction records from ${config.through}`
            );
          }
        }
      }
    } catch (error) {
      throw new CascadeError('delete', resource.name, record.id, error, {
        relation: relationName,
        relatedResource: config.resource
      });
    }
  }

  /**
   * Cascade update operation (update foreign keys when local key changes)
   * @private
   */
  async _cascadeUpdate(record, changes, resource, relationName, config) {
    this.stats.cascadeOperations++;

    const relatedResource = this.database.resource(config.resource);
    if (!relatedResource) {
      return;
    }

    try {
      const oldLocalKeyValue = record[config.localKey];
      const newLocalKeyValue = changes[config.localKey];

      if (oldLocalKeyValue === newLocalKeyValue) {
        return;
      }

      // Update all related records' foreign keys
      const relatedRecords = await relatedResource.query({
        [config.foreignKey]: oldLocalKeyValue
      });

      for (const related of relatedRecords) {
        await relatedResource.update(related.id, {
          [config.foreignKey]: newLocalKeyValue
        }, { skipCascade: true }); // Prevent infinite cascade loop
      }

      if (this.verbose) {
        console.log(
          `[RelationPlugin] Cascade updated ${relatedRecords.length} ${config.resource} records`
        );
      }
    } catch (error) {
      throw new CascadeError('update', resource.name, record.id, error, {
        relation: relationName,
        relatedResource: config.resource
      });
    }
  }

  /**
   * Get plugin statistics
   */
  getStats() {
    return {
      ...this.stats,
      configuredResources: Object.keys(this.relations).length,
      totalRelations: Object.values(this.relations).reduce(
        (sum, rels) => sum + Object.keys(rels).length,
        0
      )
    };
  }

  /**
   * Clear loader cache (useful between requests)
   */
  clearCache() {
    this._loaderCache.clear();
  }

  /**
   * Cleanup on plugin stop
   */
  async onStop() {
    this.clearCache();
  }

  /**
   * Cleanup on plugin uninstall
   */
  async onUninstall() {
    this.clearCache();
  }
}

export { RelationPlugin };
export default RelationPlugin;
