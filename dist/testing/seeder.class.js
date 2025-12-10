import { Factory } from './factory.class.js';
import { ValidationError } from '../errors.js';
import { createLogger } from '../concerns/logger.js';
export class Seeder {
    database;
    options;
    logLevel;
    logger;
    constructor(database, options = {}) {
        this.database = database;
        this.options = options;
        this.logLevel = options.logLevel || 'info';
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
            const logLevel = this.logLevel;
            this.logger = createLogger({ name: 'Seeder', level: logLevel });
        }
    }
    log(message) {
        this.logger.debug(message);
    }
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
            this.log(`Created ${count} ${resourceName}`);
        }
        return created;
    }
    async call(callback) {
        this.log('Running custom seeder...');
        const result = await callback(this.database);
        this.log('Custom seeder completed');
        return result;
    }
    async truncate(resourceNames) {
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
            }
            else {
                this.log(`${resourceName} already empty`);
            }
        }
    }
    async truncateAll() {
        const resourceNames = Object.keys(this.database.resources);
        await this.truncate(resourceNames);
    }
    async run(seeders) {
        const results = [];
        for (const seederFn of seeders) {
            this.log(`Running seeder ${seederFn.name || 'anonymous'}...`);
            const result = await seederFn(this.database);
            results.push(result);
            this.log(`Completed ${seederFn.name || 'anonymous'}`);
        }
        return results;
    }
    async seedAndReturn(specs) {
        return await this.seed(specs);
    }
    async reset() {
        this.log('Resetting database...');
        await this.truncateAll();
        Factory.resetSequences();
        this.log('Database reset complete');
    }
}
export default Seeder;
//# sourceMappingURL=seeder.class.js.map