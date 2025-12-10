export interface StorageData {
    [key: string]: string | null;
}
export interface IndexedDBStoreInfo {
    name: string;
    recordCount?: number;
    keyPath?: string | string[] | null;
    autoIncrement?: boolean;
    indexes?: string[];
    error?: string;
}
export interface IndexedDBInfo {
    name: string;
    version: number;
    stores: IndexedDBStoreInfo[];
}
export interface IndexedDBResult {
    databases: IndexedDBInfo[];
    present: boolean;
    error?: string;
}
export interface StorageResult {
    present: boolean;
    itemCount: number;
    data: StorageData;
}
export interface AllStorageResult {
    localStorage: StorageResult;
    sessionStorage: StorageResult;
    indexedDB: IndexedDBResult;
    timestamp: number;
    summary: {
        totalStorageTypes: number;
        totalItems: number;
    };
}
interface Page {
    evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
}
interface Logger {
    error(message: string, ...args: unknown[]): void;
}
export declare function captureLocalStorage(page: Page, logger?: Logger): Promise<StorageData>;
export declare function captureSessionStorage(page: Page, logger?: Logger): Promise<StorageData>;
export declare function captureIndexedDB(page: Page, logger?: Logger): Promise<IndexedDBResult>;
export declare function captureAllStorage(page: Page, logger?: Logger): Promise<AllStorageResult>;
export {};
//# sourceMappingURL=storage-manager.d.ts.map