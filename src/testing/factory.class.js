/**
 * Factory - Test Data Factory Pattern for s3db.js
 *
 * Simplifies test data creation with:
 * - Automatic field generation
 * - Sequence support
 * - Relationships
 * - Traits/states
 * - Batch creation
 *
 * @example
 * const UserFactory = Factory.define('users', {
 *   email: ({ seq }) => `user${seq}@example.com`,
 *   name: 'Test User',
 *   isActive: true
 * });
 *
 * const user = await UserFactory.create();
 * const users = await UserFactory.createMany(10);
 */

export class Factory {
  /**
   * Global sequence counter
   * @private
   */
  static _sequences = new Map();

  /**
   * Registered factories
   * @private
   */
  static _factories = new Map();

  /**
   * Database instance (set globally)
   * @private
   */
  static _database = null;

  /**
   * Create a new factory definition
   * @param {string} resourceName - Resource name
   * @param {Object|Function} definition - Field definitions or function
   * @param {Object} options - Factory options
   * @returns {Factory} Factory instance
   */
  static define(resourceName, definition, options = {}) {
    const factory = new Factory(resourceName, definition, options);
    Factory._factories.set(resourceName, factory);
    return factory;
  }

  /**
   * Set global database instance
   * @param {Database} database - s3db.js Database instance
   */
  static setDatabase(database) {
    Factory._database = database;
  }

  /**
   * Get factory by resource name
   * @param {string} resourceName - Resource name
   * @returns {Factory} Factory instance
   */
  static get(resourceName) {
    return Factory._factories.get(resourceName);
  }

  /**
   * Reset all sequences
   */
  static resetSequences() {
    Factory._sequences.clear();
  }

  /**
   * Reset all factories
   */
  static reset() {
    Factory._sequences.clear();
    Factory._factories.clear();
    Factory._database = null;
  }

  /**
   * Constructor
   * @param {string} resourceName - Resource name
   * @param {Object|Function} definition - Field definitions
   * @param {Object} options - Factory options
   */
  constructor(resourceName, definition, options = {}) {
    this.resourceName = resourceName;
    this.definition = definition;
    this.options = options;
    this.traits = new Map();
    this.afterCreateCallbacks = [];
    this.beforeCreateCallbacks = [];
  }

  /**
   * Get next sequence number
   * @param {string} name - Sequence name (default: factory name)
   * @returns {number} Next sequence number
   */
  sequence(name = this.resourceName) {
    const current = Factory._sequences.get(name) || 0;
    const next = current + 1;
    Factory._sequences.set(name, next);
    return next;
  }

  /**
   * Define a trait (state variation)
   * @param {string} name - Trait name
   * @param {Object|Function} attributes - Trait attributes
   * @returns {Factory} This factory (for chaining)
   */
  trait(name, attributes) {
    this.traits.set(name, attributes);
    return this;
  }

  /**
   * Register after create callback
   * @param {Function} callback - Callback function
   * @returns {Factory} This factory (for chaining)
   */
  afterCreate(callback) {
    this.afterCreateCallbacks.push(callback);
    return this;
  }

  /**
   * Register before create callback
   * @param {Function} callback - Callback function
   * @returns {Factory} This factory (for chaining)
   */
  beforeCreate(callback) {
    this.beforeCreateCallbacks.push(callback);
    return this;
  }

  /**
   * Build attributes without creating in database
   * @param {Object} overrides - Override attributes
   * @param {Object} options - Build options
   * @returns {Promise<Object>} Built attributes
   */
  async build(overrides = {}, options = {}) {
    const { traits = [] } = options;
    const seq = this.sequence();

    // Base attributes
    let attributes = typeof this.definition === 'function'
      ? await this.definition({ seq, factory: this })
      : { ...this.definition };

    // Apply traits
    for (const traitName of traits) {
      const trait = this.traits.get(traitName);
      if (!trait) {
        throw new Error(`Trait '${traitName}' not found in factory '${this.resourceName}'`);
      }

      const traitAttrs = typeof trait === 'function'
        ? await trait({ seq, factory: this })
        : trait;

      attributes = { ...attributes, ...traitAttrs };
    }

    // Apply overrides
    attributes = { ...attributes, ...overrides };

    // Resolve functions
    for (const [key, value] of Object.entries(attributes)) {
      if (typeof value === 'function') {
        attributes[key] = await value({ seq, factory: this });
      }
    }

    return attributes;
  }

  /**
   * Create resource in database
   * @param {Object} overrides - Override attributes
   * @param {Object} options - Create options
   * @returns {Promise<Object>} Created resource
   */
  async create(overrides = {}, options = {}) {
    const { database = Factory._database } = options;

    if (!database) {
      throw new Error('Database not set. Use Factory.setDatabase(db) or pass database option');
    }

    // Build attributes
    let attributes = await this.build(overrides, options);

    // Before create callbacks
    for (const callback of this.beforeCreateCallbacks) {
      attributes = await callback(attributes) || attributes;
    }

    // Get resource
    const resource = database.resources[this.resourceName];
    if (!resource) {
      throw new Error(`Resource '${this.resourceName}' not found in database`);
    }

    // Create in database
    let created = await resource.insert(attributes);

    // After create callbacks
    for (const callback of this.afterCreateCallbacks) {
      created = await callback(created, { database }) || created;
    }

    return created;
  }

  /**
   * Create multiple resources
   * @param {number} count - Number of resources to create
   * @param {Object} overrides - Override attributes
   * @param {Object} options - Create options
   * @returns {Promise<Object[]>} Created resources
   */
  async createMany(count, overrides = {}, options = {}) {
    const resources = [];

    for (let i = 0; i < count; i++) {
      const resource = await this.create(overrides, options);
      resources.push(resource);
    }

    return resources;
  }

  /**
   * Build multiple resources without creating
   * @param {number} count - Number of resources to build
   * @param {Object} overrides - Override attributes
   * @param {Object} options - Build options
   * @returns {Promise<Object[]>} Built resources
   */
  async buildMany(count, overrides = {}, options = {}) {
    const resources = [];

    for (let i = 0; i < count; i++) {
      const resource = await this.build(overrides, options);
      resources.push(resource);
    }

    return resources;
  }

  /**
   * Create with specific traits
   * @param {string|string[]} traits - Trait name(s)
   * @param {Object} overrides - Override attributes
   * @param {Object} options - Create options
   * @returns {Promise<Object>} Created resource
   */
  async createWithTraits(traits, overrides = {}, options = {}) {
    const traitArray = Array.isArray(traits) ? traits : [traits];
    return this.create(overrides, { ...options, traits: traitArray });
  }

  /**
   * Build with specific traits
   * @param {string|string[]} traits - Trait name(s)
   * @param {Object} overrides - Override attributes
   * @param {Object} options - Build options
   * @returns {Promise<Object>} Built resource
   */
  async buildWithTraits(traits, overrides = {}, options = {}) {
    const traitArray = Array.isArray(traits) ? traits : [traits];
    return this.build(overrides, { ...options, traits: traitArray });
  }
}

export default Factory;
