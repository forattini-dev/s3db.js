let logger = null;
export function setLogger(l) {
    logger = l;
}
export async function extractLocalStorage(page) {
    try {
        const storageData = await page.evaluate(() => {
            const data = {};
            if (typeof window !== 'undefined' && window.localStorage) {
                for (let i = 0; i < window.localStorage.length; i++) {
                    const key = window.localStorage.key(i);
                    if (key) {
                        try {
                            const value = window.localStorage.getItem(key);
                            data[key] = value;
                        }
                        catch (e) {
                            data[key] = `[Error reading value: ${e.message}]`;
                        }
                    }
                }
            }
            return {
                data,
                count: Object.keys(data).length,
                size: JSON.stringify(data).length
            };
        });
        const parsed = {};
        for (const [key, value] of Object.entries(storageData.data)) {
            try {
                parsed[key] = value ? JSON.parse(value) : value;
            }
            catch {
                parsed[key] = value;
            }
        }
        return {
            present: storageData.count > 0,
            count: storageData.count,
            size: storageData.size,
            items: storageData.data,
            parsedItems: parsed
        };
    }
    catch (error) {
        logger?.error('[StorageAnalyzer] Error extracting localStorage:', error);
        return {
            present: false,
            count: 0,
            size: 0,
            items: {},
            parsedItems: {},
            error: error.message
        };
    }
}
export async function extractSessionStorage(page) {
    try {
        const storageData = await page.evaluate(() => {
            const data = {};
            if (typeof window !== 'undefined' && window.sessionStorage) {
                for (let i = 0; i < window.sessionStorage.length; i++) {
                    const key = window.sessionStorage.key(i);
                    if (key) {
                        try {
                            const value = window.sessionStorage.getItem(key);
                            data[key] = value;
                        }
                        catch (e) {
                            data[key] = `[Error reading value: ${e.message}]`;
                        }
                    }
                }
            }
            return {
                data,
                count: Object.keys(data).length,
                size: JSON.stringify(data).length
            };
        });
        const parsed = {};
        for (const [key, value] of Object.entries(storageData.data)) {
            try {
                parsed[key] = value ? JSON.parse(value) : value;
            }
            catch {
                parsed[key] = value;
            }
        }
        return {
            present: storageData.count > 0,
            count: storageData.count,
            size: storageData.size,
            items: storageData.data,
            parsedItems: parsed
        };
    }
    catch (error) {
        logger?.error('[StorageAnalyzer] Error extracting sessionStorage:', error);
        return {
            present: false,
            count: 0,
            size: 0,
            items: {},
            parsedItems: {},
            error: error.message
        };
    }
}
export async function extractIndexedDB(page) {
    try {
        const idbData = await page.evaluate(async () => {
            const result = {
                present: false,
                databases: [],
                totalSize: 0,
                totalRecords: 0,
                error: undefined
            };
            if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
                return result;
            }
            try {
                const dbs = [];
                const commonDbNames = [
                    'firebase',
                    'firebaseLocalStorageDb',
                    'google-analytics',
                    'drift',
                    'intercom',
                    'segment',
                    'hotjar',
                    '_default',
                    'localStorage',
                    'sessionStorage',
                    'auth',
                    'cache',
                    'offline',
                    'sync'
                ];
                for (const dbName of commonDbNames) {
                    try {
                        const request = window.indexedDB.open(dbName);
                        await new Promise((resolve, reject) => {
                            request.onerror = () => reject(request.error);
                            request.onsuccess = () => {
                                const db = request.result;
                                const stores = Array.from(db.objectStoreNames);
                                if (stores.length > 0) {
                                    dbs.push({
                                        name: dbName,
                                        version: db.version,
                                        stores: stores
                                    });
                                }
                                db.close();
                                resolve();
                            };
                        });
                    }
                    catch {
                        // Database might not exist or isn't accessible
                    }
                }
                result.present = dbs.length > 0;
                result.databases = dbs;
                return result;
            }
            catch (e) {
                result.error = e.message;
                return result;
            }
        });
        let detailedData = [];
        if (idbData.databases && idbData.databases.length > 0) {
            detailedData = await page.evaluate(async (dbNames) => {
                const detail = [];
                for (const dbInfo of dbNames) {
                    const dbName = dbInfo.name;
                    try {
                        const request = window.indexedDB.open(dbName);
                        await new Promise((resolve, reject) => {
                            request.onerror = () => reject(request.error);
                            request.onsuccess = () => {
                                const db = request.result;
                                const dbDetail = {
                                    name: dbName,
                                    version: db.version,
                                    stores: []
                                };
                                for (let i = 0; i < db.objectStoreNames.length; i++) {
                                    const storeName = db.objectStoreNames[i];
                                    if (!storeName)
                                        continue;
                                    try {
                                        const transaction = db.transaction([storeName], 'readonly');
                                        const store = transaction.objectStore(storeName);
                                        const countRequest = store.count();
                                        countRequest.onsuccess = () => {
                                            dbDetail.stores.push({
                                                name: storeName,
                                                recordCount: countRequest.result,
                                                keyPath: store.keyPath,
                                                autoIncrement: store.autoIncrement,
                                                indexes: Array.from(store.indexNames)
                                            });
                                        };
                                    }
                                    catch (e) {
                                        dbDetail.stores.push({
                                            name: storeName,
                                            error: e.message
                                        });
                                    }
                                }
                                detail.push(dbDetail);
                                db.close();
                                resolve();
                            };
                        });
                    }
                    catch {
                        // Skip if can't open
                    }
                }
                return detail;
            }, idbData.databases);
        }
        return {
            present: idbData.present,
            databaseCount: idbData.databases.length,
            databases: idbData.databases,
            detailedData,
            totalSize: idbData.totalSize,
            totalRecords: idbData.totalRecords,
            error: idbData.error
        };
    }
    catch (error) {
        logger?.error('[StorageAnalyzer] Error extracting IndexedDB:', error);
        return {
            present: false,
            databaseCount: 0,
            databases: [],
            detailedData: [],
            totalSize: 0,
            totalRecords: 0,
            error: error.message
        };
    }
}
export async function analyzeAllStorage(page) {
    const [localStorage, sessionStorage, indexedDB] = await Promise.all([
        extractLocalStorage(page),
        extractSessionStorage(page),
        extractIndexedDB(page)
    ]);
    return {
        localStorage,
        sessionStorage,
        indexedDB,
        summary: {
            totalStorageMechanisms: (localStorage.present ? 1 : 0) + (sessionStorage.present ? 1 : 0) + (indexedDB.present ? 1 : 0),
            totalSize: (localStorage.size || 0) + (sessionStorage.size || 0),
            localStorageItems: localStorage.count,
            sessionStorageItems: sessionStorage.count,
            indexedDBDatabases: indexedDB.databaseCount
        }
    };
}
//# sourceMappingURL=storage-analyzer.js.map