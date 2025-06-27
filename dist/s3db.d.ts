declare module 's3db.js' {
  export interface S3dbConfig {
    connectionString?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucket?: string;
    prefix?: string;
    encryption?: boolean;
    compression?: boolean;
    cache?: boolean;
    cacheTTL?: number;
    maxConcurrency?: number;
    retryAttempts?: number;
    retryDelay?: number;
  }

  export interface ResourceConfig {
    name: string;
    schema?: any;
    encryption?: boolean;
    compression?: boolean;
    cache?: boolean;
    cacheTTL?: number;
    maxSize?: number;
    partitions?: string[];
    behaviors?: string[];
  }

  export interface QueryOptions {
    limit?: number;
    offset?: number;
    sort?: string;
    order?: 'asc' | 'desc';
    filter?: any;
    select?: string[];
  }

  export interface InsertOptions {
    encryption?: boolean;
    compression?: boolean;
    cache?: boolean;
    cacheTTL?: number;
  }

  export interface UpdateOptions extends InsertOptions {
    upsert?: boolean;
  }

  export interface DeleteOptions {
    cascade?: boolean;
  }

  export class S3db {
    constructor(config?: S3dbConfig);
    
    // Connection methods
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    
    // Resource methods
    resource(name: string, config?: ResourceConfig): Resource;
    getResource(name: string): Resource;
    listResources(): Promise<string[]>;
    deleteResource(name: string, options?: DeleteOptions): Promise<void>;
    
    // Utility methods
    getVersion(): string;
    getConfig(): S3dbConfig;
  }

  export class Resource {
    constructor(database: S3db, name: string, config?: ResourceConfig);
    
    // CRUD operations
    insert(data: any, options?: InsertOptions): Promise<any>;
    insertMany(data: any[], options?: InsertOptions): Promise<any[]>;
    find(query?: any, options?: QueryOptions): Promise<any[]>;
    findOne(query?: any, options?: QueryOptions): Promise<any | null>;
    update(query: any, data: any, options?: UpdateOptions): Promise<number>;
    delete(query: any, options?: DeleteOptions): Promise<number>;
    
    // Stream operations
    createReadStream(query?: any, options?: QueryOptions): NodeJS.ReadableStream;
    createWriteStream(options?: InsertOptions): NodeJS.WritableStream;
    
    // Schema operations
    getSchema(): any;
    setSchema(schema: any): void;
    validate(data: any): boolean;
    
    // Partition operations
    getPartitions(): string[];
    setPartitions(partitions: string[]): void;
    
    // Behavior operations
    getBehaviors(): string[];
    setBehaviors(behaviors: string[]): void;
    
    // Utility methods
    getName(): string;
    getConfig(): ResourceConfig;
  }

  export class ConnectionString {
    constructor(connectionString: string);
    parse(): S3dbConfig;
    toString(): string;
  }

  export class Validator {
    constructor(schema?: any);
    validate(data: any): boolean;
    getErrors(): string[];
  }

  // Error classes
  export class S3dbError extends Error {
    constructor(message: string, code?: string);
  }

  export class ValidationError extends S3dbError {
    constructor(message: string, errors?: string[]);
  }

  export class ConnectionError extends S3dbError {
    constructor(message: string);
  }

  // Default export
  export default S3db;
}