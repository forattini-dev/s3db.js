/**
 * Seeder - Database Seeding for Tests
 *
 * Provides utilities for seeding test databases with factories.
 *
 * @example
 * const seeder = new Seeder(database);
 *
 * await seeder.seed({
 *   users: 10,
 *   posts: 50,
 *   comments: 100
 * });
 *
 * await seeder.truncate(['users', 'posts']);
 */

import { Factory } from './factory.class.js';
import { ValidationError } from '../errors.js';

export class Seeder {
  /**
   * Constructor
   * @param {Database} database - s3db.js Database instance
   * @param {Object} options - Seeder options
   */
  constructor(database, options = {}) {
    this.database = database;
    this.options = options;
    // Default to false; only log when explicitly enabled
    this.verbose = Boolean(options.verbose);
  }

  /**
   * Log message (if verbose)
   * @param {string} message - Message to log
   * @private
   */
  log(message) {
    if (this.verbose) {
      console.log(`[Seeder] ${message}`);
    }
  }

  /**
   * Seed resources using factories
   * @param {Object} specs - Seed specifications { resourceName: count }
   * @returns {Promise<Object>} Created resources by resource name
   *
   * @example
   * const created = await seeder.seed({
   *   users: 10,
   *   posts: 50
   * });
   */
  async seed(specs) {
    const created = {};

    for (const [resourceName, count] of Object.entries(specs)) {
      this.log(`Seeding ${count} ${resourceName}...`);

      const factory = Factory.get(resourceName);
      if (!factory) {
        throw new ValidationError(`Factory for '${resourceName}' not found`, {
          field: 'resourceName',
          value: resourceName,
          retriable: false,
          suggestion: `Register a factory with Factory.define('${resourceName}', ...) before seeding.`
        });
      }

      created[resourceName] = await factory.createMany(count, {}, { database: this.database });

      this.log(`✅ Created ${count} ${resourceName}`);
    }

    return created;
  }

  /**
   * Seed with custom callback
   * @param {Function} callback - Seeding callback
   * @returns {Promise<any>} Result of callback
   *
   * @example
   * await seeder.call(async (db) => {
   *   const user = await UserFactory.create();
   *   const posts = await PostFactory.createMany(5, { userId: user.id });
   *   return { user, posts };
   * });
   */
  async call(callback) {
    this.log('Running custom seeder...');
    const result = await callback(this.database);
    this.log('✅ Custom seeder completed');
    return result;
  }

  /**
   * Truncate resources (delete all data)
   * @param {string[]} resourceNames - Resource names to truncate
   * @returns {Promise<void>}
   *
   * @example
   * await seeder.truncate(['users', 'posts']);
   */
  async truncate(resourceNames) {
    for (const resourceName of resourceNames) {
      this.log(`Truncating ${resourceName}...`);

      const resource = this.database.resources[resourceName];
      if (!resource) {
        this.log(`⚠️  Resource '${resourceName}' not found, skipping`);
        continue;
      }

      // List all IDs
      const ids = await resource.listIds();

      // Delete all
      if (ids.length > 0) {
        await resource.deleteMany(ids);
        this.log(`✅ Deleted ${ids.length} ${resourceName}`);
      } else {
        this.log(`✅ ${resourceName} already empty`);
      }
    }
  }

  /**
   * Truncate all resources
   * @returns {Promise<void>}
   */
  async truncateAll() {
    const resourceNames = Object.keys(this.database.resources);
    await this.truncate(resourceNames);
  }

  /**
   * Run multiple seeders in order
   * @param {Function[]} seeders - Array of seeder functions
   * @returns {Promise<Object[]>} Results of each seeder
   *
   * @example
   * await seeder.run([
   *   async (db) => await UserFactory.createMany(10),
   *   async (db) => await PostFactory.createMany(50)
   * ]);
   */
  async run(seeders) {
    const results = [];

    for (const seederFn of seeders) {
      this.log(`Running seeder ${seederFn.name || 'anonymous'}...`);
      const result = await seederFn(this.database);
      results.push(result);
      this.log(`✅ Completed ${seederFn.name || 'anonymous'}`);
    }

    return results;
  }

  /**
   * Seed and return specific resources
   * @param {Object} specs - Seed specifications
   * @returns {Promise<Object>} Created resources
   *
   * @example
   * const { users, posts } = await seeder.seedAndReturn({
   *   users: 5,
   *   posts: 10
   * });
   */
  async seedAndReturn(specs) {
    return await this.seed(specs);
  }

  /**
   * Reset database (truncate all and reset sequences)
   * @returns {Promise<void>}
   */
  async reset() {
    this.log('Resetting database...');
    await this.truncateAll();
    Factory.resetSequences();
    this.log('✅ Database reset complete');
  }
}

export default Seeder;
