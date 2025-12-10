import { Plugin } from './plugin.class.js';
interface Resource {
    name: string;
    insert: (...args: unknown[]) => Promise<Record<string, unknown>>;
    _insert?: (...args: unknown[]) => Promise<Record<string, unknown>>;
    insertMany?: (data: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>;
    _insertMany?: (data: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>;
    update: (id: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
    _update?: (id: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
    delete: (id: string) => Promise<void>;
    _delete?: (id: string) => Promise<void>;
    deleteMany?: (ids: string[]) => Promise<void>;
    _deleteMany?: (ids: string[]) => Promise<void>;
    get: (id: string) => Promise<IndexRecord | null>;
    getAll: () => Promise<IndexRecord[]>;
    getMany: (ids: string[]) => Promise<Record<string, unknown>[]>;
    query: (filter: Record<string, unknown>) => Promise<IndexRecord[]>;
}
interface IndexRecord {
    id: string;
    resourceName: string;
    fieldName: string;
    word: string;
    recordIds: string[];
    count: number;
    lastUpdated?: string;
}
export interface FullTextPluginOptions {
    resourceNames?: {
        index?: string;
    };
    indexResource?: string;
    minWordLength?: number;
    maxResults?: number;
    fields?: string[] | Record<string, string[]>;
    logLevel?: string;
    [key: string]: unknown;
}
interface FullTextConfig {
    minWordLength: number;
    maxResults: number;
    fields?: string[] | Record<string, string[]>;
    logLevel?: string;
}
interface IndexData {
    recordIds: string[];
    count: number;
}
export interface SearchOptions {
    fields?: string[] | null;
    limit?: number;
    offset?: number;
    exactMatch?: boolean;
}
export interface SearchResult {
    recordId: string;
    score: number;
}
export interface SearchRecord extends Record<string, unknown> {
    id: string;
    _searchScore: number;
}
interface FieldStats {
    words: number;
    totalOccurrences: number;
}
interface ResourceStats {
    fields: Record<string, FieldStats>;
    totalRecords: Set<string> | number;
    totalWords: number;
}
export interface IndexStats {
    totalIndexes: number;
    resources: Record<string, ResourceStats>;
    totalWords: number;
}
export interface RebuildOptions {
    timeout?: number;
}
export declare class FullTextPlugin extends Plugin {
    namespace: string;
    logLevel: string;
    indexResource: Resource | null;
    indexResourceName: string;
    config: FullTextConfig;
    indexes: Map<string, IndexData>;
    dirtyIndexes: Set<string>;
    deletedIndexes: Set<string>;
    private _indexResourceDescriptor;
    constructor(options?: FullTextPluginOptions);
    private _resolveIndexResourceName;
    onNamespaceChanged(): void;
    onInstall(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    isInternalResource(name: string): boolean;
    loadIndexes(): Promise<void>;
    saveIndexes(): Promise<void>;
    installDatabaseHooks(): void;
    removeDatabaseHooks(): void;
    installIndexingHooks(): void;
    installResourceHooks(resource: Resource): void;
    indexRecord(resourceName: string, recordId: string, data: Record<string, unknown>): Promise<void>;
    removeRecordFromIndex(resourceName: string, recordId: string): Promise<void>;
    getFieldValue(data: Record<string, unknown>, fieldPath: string): unknown;
    tokenize(text: unknown): string[];
    getIndexedFields(resourceName: string): string[];
    search(resourceName: string, query: string, options?: SearchOptions): Promise<SearchResult[]>;
    searchRecords(resourceName: string, query: string, options?: SearchOptions): Promise<SearchRecord[]>;
    rebuildIndex(resourceName: string): Promise<void>;
    getIndexStats(): Promise<IndexStats>;
    rebuildAllIndexes(options?: RebuildOptions): Promise<void>;
    private _rebuildAllIndexesInternal;
    clearIndex(resourceName: string): Promise<void>;
    clearAllIndexes(): Promise<void>;
}
export {};
//# sourceMappingURL=fulltext.plugin.d.ts.map