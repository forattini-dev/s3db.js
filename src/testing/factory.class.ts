import { ValidationError } from '../errors.js';

interface Resource {
  insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
}

interface Database {
  resources: Record<string, Resource>;
}

interface FactoryContext {
  seq: number;
  factory: Factory;
}

type FieldGenerator = (context: FactoryContext) => unknown | Promise<unknown>;
type DefinitionObject = Record<string, unknown | FieldGenerator>;
type DefinitionFunction = (context: FactoryContext) => DefinitionObject | Promise<DefinitionObject>;
type TraitDefinition = DefinitionObject | ((context: FactoryContext) => DefinitionObject | Promise<DefinitionObject>);
type BeforeCreateCallback = (attributes: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown> | void> | void;
type AfterCreateCallback = (created: Record<string, unknown>, context: { database: Database }) => Record<string, unknown> | Promise<Record<string, unknown> | void> | void;

interface FactoryOptions {
  [key: string]: unknown;
}

interface BuildOptions {
  traits?: string[];
}

interface CreateOptions extends BuildOptions {
  database?: Database;
}

export class Factory {
  private static _sequences: Map<string, number> = new Map();
  private static _factories: Map<string, Factory> = new Map();
  private static _database: Database | null = null;

  resourceName: string;
  definition: DefinitionObject | DefinitionFunction;
  options: FactoryOptions;
  traits: Map<string, TraitDefinition> = new Map();
  afterCreateCallbacks: AfterCreateCallback[] = [];
  beforeCreateCallbacks: BeforeCreateCallback[] = [];

  static define(resourceName: string, definition: DefinitionObject | DefinitionFunction, options: FactoryOptions = {}): Factory {
    const factory = new Factory(resourceName, definition, options);
    Factory._factories.set(resourceName, factory);
    return factory;
  }

  static setDatabase(database: Database): void {
    Factory._database = database;
  }

  static get(resourceName: string): Factory | undefined {
    return Factory._factories.get(resourceName);
  }

  static resetSequences(): void {
    Factory._sequences.clear();
  }

  static reset(): void {
    Factory._sequences.clear();
    Factory._factories.clear();
    Factory._database = null;
  }

  constructor(resourceName: string, definition: DefinitionObject | DefinitionFunction, options: FactoryOptions = {}) {
    this.resourceName = resourceName;
    this.definition = definition;
    this.options = options;
  }

  sequence(name: string = this.resourceName): number {
    const current = Factory._sequences.get(name) || 0;
    const next = current + 1;
    Factory._sequences.set(name, next);
    return next;
  }

  trait(name: string, attributes: TraitDefinition): this {
    this.traits.set(name, attributes);
    return this;
  }

  afterCreate(callback: AfterCreateCallback): this {
    this.afterCreateCallbacks.push(callback);
    return this;
  }

  beforeCreate(callback: BeforeCreateCallback): this {
    this.beforeCreateCallbacks.push(callback);
    return this;
  }

  async build(overrides: Record<string, unknown> = {}, options: BuildOptions = {}): Promise<Record<string, unknown>> {
    const { traits = [] } = options;
    const seq = this.sequence();

    let attributes: Record<string, unknown> = typeof this.definition === 'function'
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
        attributes[key] = await (value as FieldGenerator)({ seq, factory: this });
      }
    }

    return attributes;
  }

  async create(overrides: Record<string, unknown> = {}, options: CreateOptions = {}): Promise<Record<string, unknown>> {
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
      if (result) attributes = result;
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
      if (result) created = result;
    }

    return created;
  }

  async createMany(count: number, overrides: Record<string, unknown> = {}, options: CreateOptions = {}): Promise<Record<string, unknown>[]> {
    const resources: Record<string, unknown>[] = [];

    for (let i = 0; i < count; i++) {
      const resource = await this.create(overrides, options);
      resources.push(resource);
    }

    return resources;
  }

  async buildMany(count: number, overrides: Record<string, unknown> = {}, options: BuildOptions = {}): Promise<Record<string, unknown>[]> {
    const resources: Record<string, unknown>[] = [];

    for (let i = 0; i < count; i++) {
      const resource = await this.build(overrides, options);
      resources.push(resource);
    }

    return resources;
  }

  async createWithTraits(traits: string | string[], overrides: Record<string, unknown> = {}, options: CreateOptions = {}): Promise<Record<string, unknown>> {
    const traitArray = Array.isArray(traits) ? traits : [traits];
    return this.create(overrides, { ...options, traits: traitArray });
  }

  async buildWithTraits(traits: string | string[], overrides: Record<string, unknown> = {}, options: BuildOptions = {}): Promise<Record<string, unknown>> {
    const traitArray = Array.isArray(traits) ? traits : [traits];
    return this.build(overrides, { ...options, traits: traitArray });
  }
}

export default Factory;
