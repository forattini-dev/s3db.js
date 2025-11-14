/**
 * Storage Analyzer - localStorage, sessionStorage, and IndexedDB extraction
 *
 * Extracts and analyzes browser storage mechanisms to understand
 * application state and data persistence.
 */

/**
 * Extract localStorage data
 *
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<Object>} localStorage analysis results
 */
export async function extractLocalStorage(page) {
  try {
    const storageData = await page.evaluate(() => {
      const data = {}
      if (typeof window !== 'undefined' && window.localStorage) {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i)
          try {
            const value = window.localStorage.getItem(key)
            data[key] = value
          } catch (e) {
            data[key] = `[Error reading value: ${e.message}]`
          }
        }
      }
      return {
        data,
        count: Object.keys(data).length,
        size: JSON.stringify(data).length
      }
    })

    // Try to parse JSON values for better analysis
    const parsed = {}
    for (const [key, value] of Object.entries(storageData.data)) {
      try {
        parsed[key] = JSON.parse(value)
      } catch {
        parsed[key] = value
      }
    }

    return {
      present: storageData.count > 0,
      count: storageData.count,
      size: storageData.size,
      items: storageData.data,
      parsedItems: parsed
    }
  } catch (error) {
    console.error('[StorageAnalyzer] Error extracting localStorage:', error)
    return {
      present: false,
      count: 0,
      size: 0,
      items: {},
      parsedItems: {},
      error: error.message
    }
  }
}

/**
 * Extract sessionStorage data
 *
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<Object>} sessionStorage analysis results
 */
export async function extractSessionStorage(page) {
  try {
    const storageData = await page.evaluate(() => {
      const data = {}
      if (typeof window !== 'undefined' && window.sessionStorage) {
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const key = window.sessionStorage.key(i)
          try {
            const value = window.sessionStorage.getItem(key)
            data[key] = value
          } catch (e) {
            data[key] = `[Error reading value: ${e.message}]`
          }
        }
      }
      return {
        data,
        count: Object.keys(data).length,
        size: JSON.stringify(data).length
      }
    })

    // Try to parse JSON values
    const parsed = {}
    for (const [key, value] of Object.entries(storageData.data)) {
      try {
        parsed[key] = JSON.parse(value)
      } catch {
        parsed[key] = value
      }
    }

    return {
      present: storageData.count > 0,
      count: storageData.count,
      size: storageData.size,
      items: storageData.data,
      parsedItems: parsed
    }
  } catch (error) {
    console.error('[StorageAnalyzer] Error extracting sessionStorage:', error)
    return {
      present: false,
      count: 0,
      size: 0,
      items: {},
      parsedItems: {},
      error: error.message
    }
  }
}

/**
 * Extract IndexedDB data
 *
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<Object>} IndexedDB analysis results
 */
export async function extractIndexedDB(page) {
  try {
    const idbData = await page.evaluate(async () => {
      const result = {
        present: false,
        databases: [],
        totalSize: 0,
        totalRecords: 0
      }

      if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
        return result
      }

      try {
        // Get list of databases (this is a best-effort approach as there's no direct API)
        // We'll try to analyze what we can detect
        const dbs = []

        // Common database names that might exist
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
        ]

        // Try to get info about databases (limited by browser restrictions)
        for (const dbName of commonDbNames) {
          try {
            const request = window.indexedDB.open(dbName)
            await new Promise((resolve, reject) => {
              request.onerror = () => reject(request.error)
              request.onsuccess = () => {
                const db = request.result
                const stores = Array.from(db.objectStoreNames)
                if (stores.length > 0) {
                  dbs.push({
                    name: dbName,
                    version: db.version,
                    stores: stores
                  })
                }
                db.close()
                resolve()
              }
            })
          } catch (e) {
            // Database might not exist or isn't accessible
          }
        }

        result.present = dbs.length > 0
        result.databases = dbs
        return result
      } catch (e) {
        result.error = e.message
        return result
      }
    })

    // Get more detailed info about detected databases
    let detailedData = []
    if (idbData.databases && idbData.databases.length > 0) {
      detailedData = await page.evaluate(async (dbNames) => {
        const detail = []

        for (const dbInfo of dbNames) {
          const dbName = dbInfo.name
          try {
            const request = window.indexedDB.open(dbName)
            await new Promise((resolve, reject) => {
              request.onerror = () => reject(request.error)
              request.onsuccess = () => {
                const db = request.result
                const dbDetail = {
                  name: dbName,
                  version: db.version,
                  stores: []
                }

                for (let i = 0; i < db.objectStoreNames.length; i++) {
                  const storeName = db.objectStoreNames[i]
                  try {
                    const transaction = db.transaction([storeName], 'readonly')
                    const store = transaction.objectStore(storeName)
                    const countRequest = store.count()

                    countRequest.onsuccess = () => {
                      dbDetail.stores.push({
                        name: storeName,
                        recordCount: countRequest.result,
                        keyPath: store.keyPath || null,
                        autoIncrement: store.autoIncrement,
                        indexes: Array.from(store.indexNames)
                      })
                    }
                  } catch (e) {
                    dbDetail.stores.push({
                      name: storeName,
                      error: e.message
                    })
                  }
                }

                detail.push(dbDetail)
                db.close()
                resolve()
              }
            })
          } catch (e) {
            // Skip if can't open
          }
        }

        return detail
      }, idbData.databases)
    }

    return {
      present: idbData.present,
      databaseCount: idbData.databases.length,
      databases: idbData.databases,
      detailedData,
      totalSize: idbData.totalSize,
      totalRecords: idbData.totalRecords,
      error: idbData.error
    }
  } catch (error) {
    console.error('[StorageAnalyzer] Error extracting IndexedDB:', error)
    return {
      present: false,
      databaseCount: 0,
      databases: [],
      detailedData: [],
      totalSize: 0,
      totalRecords: 0,
      error: error.message
    }
  }
}

/**
 * Analyze all storage mechanisms combined
 *
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<Object>} Combined storage analysis
 */
export async function analyzeAllStorage(page) {
  const [localStorage, sessionStorage, indexedDB] = await Promise.all([
    extractLocalStorage(page),
    extractSessionStorage(page),
    extractIndexedDB(page)
  ])

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
  }
}
