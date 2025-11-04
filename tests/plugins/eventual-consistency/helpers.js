import { createDatabaseForTest } from '../../config.js';

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function createContext(suffix = 'coverage') {
  const database = createDatabaseForTest(`eventual-consistency-${suffix}-${Date.now()}`);
  await database.connect();

  return {
    database,
    async cleanup() {
      if (database?.connected) {
        await database.disconnect();
      }
    }
  };
}
