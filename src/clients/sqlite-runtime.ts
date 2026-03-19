import { createRequire } from 'module';
import type { DatabaseSync as NodeSqliteDatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);

type SqliteModuleLike = {
  DatabaseSync: new (path: string) => NodeSqliteDatabaseSync;
};

let cachedModule: SqliteModuleLike | null | undefined;
let cachedError: Error | null | undefined;

function loadNodeSqliteModule(): SqliteModuleLike | null {
  if (cachedModule !== undefined) {
    return cachedModule;
  }

  try {
    cachedModule = require('node:sqlite') as SqliteModuleLike;
    cachedError = null;
  } catch (error) {
    cachedModule = null;
    cachedError = error instanceof Error ? error : new Error(String(error));
  }

  return cachedModule;
}

export function isNodeSqliteAvailable(): boolean {
  return loadNodeSqliteModule() !== null;
}

export function getNodeSqliteAvailabilityError(): Error | null {
  loadNodeSqliteModule();
  return cachedError || null;
}

export function getNodeSqliteDatabaseSync(): SqliteModuleLike['DatabaseSync'] {
  const sqliteModule = loadNodeSqliteModule();
  if (!sqliteModule) {
    const reason = cachedError?.message || 'node:sqlite is not available in this Node.js runtime';
    throw new Error(reason);
  }

  return sqliteModule.DatabaseSync;
}
