import { Factory } from './factory.class.js';
import { ValidationError } from '../errors.js';
import { createLogger, Logger, LogLevel } from '../concerns/logger.js';

interface Resource {
  listIds(): Promise<string[]>;
  deleteMany(ids: string[]): Promise<unknown>;
}

interface Database {
  resources: Record<string, Resource>;
}

interface SeederOptions {
  logLevel?: string;
  logger?: Logger;
}

type SeederCallback = (database: Database) => Promise<unknown>;

export class Seeder {
  database: Database;
  options: SeederOptions;
  logLevel: string;
  logger: Logger;

  constructor(database: Database, options: SeederOptions = {}) {
    this.database = database;
    this.options = options;
    this.logLevel = options.logLevel || 'info';

    if (options.logger) {
      this.logger = options.logger;
    } else {
      const logLevel = this.logLevel as LogLevel;
      this.logger = createLogger({ name: 'Seeder', level: logLevel });
    }
  }

  private log(message: string): void {
    this.logger.debug(message);
  }

  async seed(specs: Record<string, number>): Promise<Record<string, Record<string, unknown>[]>> {
    const created: Record<string, Record<string, unknown>[]> = {};

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

      created[resourceName] = await factory.createMany(count, {}, { database: this.database as any });

      this.log(`Created ${count} ${resourceName}`);
    }

    return created;
  }

  async call<T>(callback: (database: Database) => Promise<T>): Promise<T> {
    this.log('Running custom seeder...');
    const result = await callback(this.database);
    this.log('Custom seeder completed');
    return result;
  }

  async truncate(resourceNames: string[]): Promise<void> {
    for (const resourceName of resourceNames) {
      this.log(`Truncating ${resourceName}...`);

      const resource = this.database.resources[resourceName];
      if (!resource) {
        this.log(`Resource '${resourceName}' not found, skipping`);
        continue;
      }

      const ids = await resource.listIds();

      if (ids.length > 0) {
        await resource.deleteMany(ids);
        this.log(`Deleted ${ids.length} ${resourceName}`);
      } else {
        this.log(`${resourceName} already empty`);
      }
    }
  }

  async truncateAll(): Promise<void> {
    const resourceNames = Object.keys(this.database.resources);
    await this.truncate(resourceNames);
  }

  async run(seeders: SeederCallback[]): Promise<unknown[]> {
    const results: unknown[] = [];

    for (const seederFn of seeders) {
      this.log(`Running seeder ${seederFn.name || 'anonymous'}...`);
      const result = await seederFn(this.database);
      results.push(result);
      this.log(`Completed ${seederFn.name || 'anonymous'}`);
    }

    return results;
  }

  async seedAndReturn(specs: Record<string, number>): Promise<Record<string, Record<string, unknown>[]>> {
    return await this.seed(specs);
  }

  async reset(): Promise<void> {
    this.log('Resetting database...');
    await this.truncateAll();
    Factory.resetSequences();
    this.log('Database reset complete');
  }
}

export default Seeder;
