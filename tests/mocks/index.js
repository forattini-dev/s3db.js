/**
 * Test Mocks - Central export for all mock utilities
 *
 * Usage:
 *   import { createMockDatabase, schemas, dataGenerators } from '#tests/mocks';
 *
 * Or individual imports:
 *   import { MockClient } from '#tests/mocks/mock-client.class.js';
 *   import { createDatabaseWithResource } from '#tests/mocks/factories.js';
 */

// Mock Client
export { MockClient, default as MockClientClass } from './mock-client.class.js';

// Factories
export {
  createMockClient,
  createMockDatabase,
  createConnectedMockDatabase,
  createDatabaseWithResource,
  createSchemaFromTemplate,
  schemas,
  dataGenerators,
  generateMany,
  cleanupMockDatabases
} from './factories.js';

// Fixtures
export * from './fixtures.js';

// Spies and assertion helpers
export * from './spies.js';
