export interface StorageResult {
    present: boolean;
    count: number;
    size: number;
    items: Record<string, string | null>;
    parsedItems: Record<string, unknown>;
    error?: string;
}
export interface IndexedDBStore {
    name: string;
    recordCount?: number;
    keyPath?: string | null;
    autoIncrement?: boolean;
    indexes?: string[];
    error?: string;
}
export interface IndexedDBInfo {
    name: string;
    version: number;
    stores: string[] | IndexedDBStore[];
}
export interface IndexedDBResult {
    present: boolean;
    databaseCount: number;
    databases: IndexedDBInfo[];
    detailedData: IndexedDBInfo[];
    totalSize: number;
    totalRecords: number;
    error?: string;
}
export interface AllStorageResult {
    localStorage: StorageResult;
    sessionStorage: StorageResult;
    indexedDB: IndexedDBResult;
    summary: {
        totalStorageMechanisms: number;
        totalSize: number;
        localStorageItems: number;
        sessionStorageItems: number;
        indexedDBDatabases: number;
    };
}
interface Page {
    evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
    evaluate<T, A>(fn: (arg: A) => T | Promise<T>, arg: A): Promise<T>;
}
interface Logger {
    error(message: string, ...args: unknown[]): void;
}
export declare function setLogger(l: Logger): void;
export declare function extractLocalStorage(page: Page): Promise<StorageResult>;
export declare function extractSessionStorage(page: Page): Promise<StorageResult>;
export declare function extractIndexedDB(page: Page): Promise<IndexedDBResult>;
export declare function analyzeAllStorage(page: Page): Promise<AllStorageResult>;
export {};
//# sourceMappingURL=storage-analyzer.d.ts.map