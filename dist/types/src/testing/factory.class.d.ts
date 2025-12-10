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
type AfterCreateCallback = (created: Record<string, unknown>, context: {
    database: Database;
}) => Record<string, unknown> | Promise<Record<string, unknown> | void> | void;
interface FactoryOptions {
    [key: string]: unknown;
}
interface BuildOptions {
    traits?: string[];
}
interface CreateOptions extends BuildOptions {
    database?: Database;
}
export declare class Factory {
    private static _sequences;
    private static _factories;
    private static _database;
    resourceName: string;
    definition: DefinitionObject | DefinitionFunction;
    options: FactoryOptions;
    traits: Map<string, TraitDefinition>;
    afterCreateCallbacks: AfterCreateCallback[];
    beforeCreateCallbacks: BeforeCreateCallback[];
    static define(resourceName: string, definition: DefinitionObject | DefinitionFunction, options?: FactoryOptions): Factory;
    static setDatabase(database: Database): void;
    static get(resourceName: string): Factory | undefined;
    static resetSequences(): void;
    static reset(): void;
    constructor(resourceName: string, definition: DefinitionObject | DefinitionFunction, options?: FactoryOptions);
    sequence(name?: string): number;
    trait(name: string, attributes: TraitDefinition): this;
    afterCreate(callback: AfterCreateCallback): this;
    beforeCreate(callback: BeforeCreateCallback): this;
    build(overrides?: Record<string, unknown>, options?: BuildOptions): Promise<Record<string, unknown>>;
    create(overrides?: Record<string, unknown>, options?: CreateOptions): Promise<Record<string, unknown>>;
    createMany(count: number, overrides?: Record<string, unknown>, options?: CreateOptions): Promise<Record<string, unknown>[]>;
    buildMany(count: number, overrides?: Record<string, unknown>, options?: BuildOptions): Promise<Record<string, unknown>[]>;
    createWithTraits(traits: string | string[], overrides?: Record<string, unknown>, options?: CreateOptions): Promise<Record<string, unknown>>;
    buildWithTraits(traits: string | string[], overrides?: Record<string, unknown>, options?: BuildOptions): Promise<Record<string, unknown>>;
}
export default Factory;
//# sourceMappingURL=factory.class.d.ts.map