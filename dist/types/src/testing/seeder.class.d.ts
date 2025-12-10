import { Logger } from '../concerns/logger.js';
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
export declare class Seeder {
    database: Database;
    options: SeederOptions;
    logLevel: string;
    logger: Logger;
    constructor(database: Database, options?: SeederOptions);
    private log;
    seed(specs: Record<string, number>): Promise<Record<string, Record<string, unknown>[]>>;
    call<T>(callback: (database: Database) => Promise<T>): Promise<T>;
    truncate(resourceNames: string[]): Promise<void>;
    truncateAll(): Promise<void>;
    run(seeders: SeederCallback[]): Promise<unknown[]>;
    seedAndReturn(specs: Record<string, number>): Promise<Record<string, Record<string, unknown>[]>>;
    reset(): Promise<void>;
}
export default Seeder;
//# sourceMappingURL=seeder.class.d.ts.map