import { ValidationError } from '../errors.js';
export class Factory {
    static _sequences = new Map();
    static _factories = new Map();
    static _database = null;
    resourceName;
    definition;
    options;
    traits = new Map();
    afterCreateCallbacks = [];
    beforeCreateCallbacks = [];
    static define(resourceName, definition, options = {}) {
        const factory = new Factory(resourceName, definition, options);
        Factory._factories.set(resourceName, factory);
        return factory;
    }
    static setDatabase(database) {
        Factory._database = database;
    }
    static get(resourceName) {
        return Factory._factories.get(resourceName);
    }
    static resetSequences() {
        Factory._sequences.clear();
    }
    static reset() {
        Factory._sequences.clear();
        Factory._factories.clear();
        Factory._database = null;
    }
    constructor(resourceName, definition, options = {}) {
        this.resourceName = resourceName;
        this.definition = definition;
        this.options = options;
    }
    sequence(name = this.resourceName) {
        const current = Factory._sequences.get(name) || 0;
        const next = current + 1;
        Factory._sequences.set(name, next);
        return next;
    }
    trait(name, attributes) {
        this.traits.set(name, attributes);
        return this;
    }
    afterCreate(callback) {
        this.afterCreateCallbacks.push(callback);
        return this;
    }
    beforeCreate(callback) {
        this.beforeCreateCallbacks.push(callback);
        return this;
    }
    async build(overrides = {}, options = {}) {
        const { traits = [] } = options;
        const seq = this.sequence();
        let attributes = typeof this.definition === 'function'
            ? await this.definition({ seq, factory: this })
            : { ...this.definition };
        for (const traitName of traits) {
            const trait = this.traits.get(traitName);
            if (!trait) {
                throw new ValidationError(`Trait '${traitName}' not found in factory '${this.resourceName}'`, {
                    field: 'trait',
                    value: traitName,
                    resourceName: this.resourceName,
                    retriable: false,
                    suggestion: `Define the trait with Factory.define('${this.resourceName}').trait('${traitName}', ...) before using it.`
                });
            }
            const traitAttrs = typeof trait === 'function'
                ? await trait({ seq, factory: this })
                : trait;
            attributes = { ...attributes, ...traitAttrs };
        }
        attributes = { ...attributes, ...overrides };
        for (const [key, value] of Object.entries(attributes)) {
            if (typeof value === 'function') {
                attributes[key] = await value({ seq, factory: this });
            }
        }
        return attributes;
    }
    async create(overrides = {}, options = {}) {
        const { database = Factory._database } = options;
        if (!database) {
            throw new ValidationError('Database not set for factory', {
                field: 'database',
                retriable: false,
                suggestion: 'Call Factory.setDatabase(db) globally or pass { database } when invoking create().'
            });
        }
        let attributes = await this.build(overrides, options);
        for (const callback of this.beforeCreateCallbacks) {
            const result = await callback(attributes);
            if (result)
                attributes = result;
        }
        const resource = database.resources[this.resourceName];
        if (!resource) {
            throw new ValidationError(`Resource '${this.resourceName}' not found in database`, {
                field: 'resourceName',
                value: this.resourceName,
                retriable: false,
                suggestion: `Ensure the resource is created in the database before using Factory '${this.resourceName}'.`
            });
        }
        let created = await resource.insert(attributes);
        for (const callback of this.afterCreateCallbacks) {
            const result = await callback(created, { database });
            if (result)
                created = result;
        }
        return created;
    }
    async createMany(count, overrides = {}, options = {}) {
        const resources = [];
        for (let i = 0; i < count; i++) {
            const resource = await this.create(overrides, options);
            resources.push(resource);
        }
        return resources;
    }
    async buildMany(count, overrides = {}, options = {}) {
        const resources = [];
        for (let i = 0; i < count; i++) {
            const resource = await this.build(overrides, options);
            resources.push(resource);
        }
        return resources;
    }
    async createWithTraits(traits, overrides = {}, options = {}) {
        const traitArray = Array.isArray(traits) ? traits : [traits];
        return this.create(overrides, { ...options, traits: traitArray });
    }
    async buildWithTraits(traits, overrides = {}, options = {}) {
        const traitArray = Array.isArray(traits) ? traits : [traits];
        return this.build(overrides, { ...options, traits: traitArray });
    }
}
export default Factory;
//# sourceMappingURL=factory.class.js.map