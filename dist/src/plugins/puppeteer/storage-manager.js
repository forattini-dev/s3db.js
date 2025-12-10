export async function captureLocalStorage(page, logger) {
    try {
        return await page.evaluate(() => {
            const data = {};
            if (typeof window !== 'undefined' && window.localStorage) {
                for (let i = 0; i < window.localStorage.length; i++) {
                    const key = window.localStorage.key(i);
                    if (key) {
                        try {
                            data[key] = window.localStorage.getItem(key);
                        }
                        catch {
                            // Ignore access errors
                        }
                    }
                }
            }
            return data;
        });
    }
    catch (error) {
        const err = error;
        if (logger) {
            logger.error('[StorageManager] Error capturing localStorage:', err.message);
        }
        return {};
    }
}
export async function captureSessionStorage(page, logger) {
    try {
        return await page.evaluate(() => {
            const data = {};
            if (typeof window !== 'undefined' && window.sessionStorage) {
                for (let i = 0; i < window.sessionStorage.length; i++) {
                    const key = window.sessionStorage.key(i);
                    if (key) {
                        try {
                            data[key] = window.sessionStorage.getItem(key);
                        }
                        catch {
                            // Ignore access errors
                        }
                    }
                }
            }
            return data;
        });
    }
    catch (error) {
        const err = error;
        if (logger) {
            logger.error('[StorageManager] Error capturing sessionStorage:', err.message);
        }
        return {};
    }
}
export async function captureIndexedDB(page, logger) {
    try {
        return await page.evaluate(async () => {
            const result = {
                databases: [],
                present: false
            };
            if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
                return result;
            }
            // Common database names to check
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
                'sync',
                'db',
                'appDb',
                'main'
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
                                const storeDetails = [];
                                let storesProcessed = 0;
                                stores.forEach((storeName) => {
                                    try {
                                        const transaction = db.transaction([storeName], 'readonly');
                                        const store = transaction.objectStore(storeName);
                                        const countRequest = store.count();
                                        countRequest.onsuccess = () => {
                                            storeDetails.push({
                                                name: storeName,
                                                recordCount: countRequest.result,
                                                keyPath: store.keyPath,
                                                autoIncrement: store.autoIncrement,
                                                indexes: Array.from(store.indexNames)
                                            });
                                            storesProcessed++;
                                            if (storesProcessed === stores.length) {
                                                result.databases.push({
                                                    name: dbName,
                                                    version: db.version,
                                                    stores: storeDetails
                                                });
                                                result.present = true;
                                            }
                                        };
                                    }
                                    catch (e) {
                                        const err = e;
                                        storeDetails.push({
                                            name: storeName,
                                            error: err.message
                                        });
                                        storesProcessed++;
                                        if (storesProcessed === stores.length) {
                                            result.databases.push({
                                                name: dbName,
                                                version: db.version,
                                                stores: storeDetails
                                            });
                                            result.present = true;
                                        }
                                    }
                                });
                            }
                            db.close();
                            resolve();
                        };
                    });
                }
                catch {
                    // Database might not exist
                }
            }
            return result;
        });
    }
    catch (error) {
        const err = error;
        if (logger) {
            logger.error('[StorageManager] Error capturing IndexedDB:', err.message);
        }
        return {
            databases: [],
            present: false,
            error: err.message
        };
    }
}
export async function captureAllStorage(page, logger) {
    const [localStorage, sessionStorage, indexedDB] = await Promise.all([
        captureLocalStorage(page, logger),
        captureSessionStorage(page, logger),
        captureIndexedDB(page, logger)
    ]);
    return {
        localStorage: {
            present: Object.keys(localStorage).length > 0,
            itemCount: Object.keys(localStorage).length,
            data: localStorage
        },
        sessionStorage: {
            present: Object.keys(sessionStorage).length > 0,
            itemCount: Object.keys(sessionStorage).length,
            data: sessionStorage
        },
        indexedDB,
        timestamp: Date.now(),
        summary: {
            totalStorageTypes: (Object.keys(localStorage).length > 0 ? 1 : 0) + (Object.keys(sessionStorage).length > 0 ? 1 : 0) + (indexedDB.present ? 1 : 0),
            totalItems: Object.keys(localStorage).length + Object.keys(sessionStorage).length
        }
    };
}
//# sourceMappingURL=storage-manager.js.map