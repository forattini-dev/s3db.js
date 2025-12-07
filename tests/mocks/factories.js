/**
 * Test Factories - Quick creation of test objects
 *
 * Use these factories to create test instances without
 * the overhead of real storage or complex configuration.
 */

import Database from '#src/database.class.js';
import { MockClient } from './mock-client.class.js';
import { CronManager } from '#src/concerns/cron-manager.js';
import { ProcessManager } from '#src/concerns/process-manager.js';
import { idGenerator } from '#src/concerns/id.js';

// Shared managers (prevents signal handler leaks)
const sharedProcessManager = new ProcessManager({ logLevel: 'silent', exitOnSignal: false });
const sharedCronManager = new CronManager({ disabled: true, logLevel: 'silent' });

/**
 * Create a mock client for testing
 */
export function createMockClient(options = {}) {
  return new MockClient({
    bucket: options.bucket || `test-${idGenerator(6)}`,
    keyPrefix: options.keyPrefix || '',
    logLevel: options.logLevel || 'silent',
    ...options
  });
}

/**
 * Create a database with mock client (ultra-fast, no I/O)
 *
 * @param {string} name - Test name for identification
 * @param {object} options - Additional options
 * @returns {Database} Database instance with MockClient
 */
export function createMockDatabase(name = 'test', options = {}) {
  const client = options.client || createMockClient({
    bucket: options.bucket || `test-${name}-${idGenerator(6)}`,
    keyPrefix: options.keyPrefix || `test/${name}`,
    ...options.clientOptions
  });

  const db = new Database({
    client,
    logLevel: 'silent',
    processManager: sharedProcessManager,
    cronManager: sharedCronManager,
    ...options,
    loggerOptions: {
      level: 'silent',
      ...(options.loggerOptions || {})
    }
  });

  // Auto-cleanup tracking
  if (typeof global !== 'undefined') {
    global._mockDatabases = global._mockDatabases || new Set();
    global._mockDatabases.add(db);

    const originalDisconnect = db.disconnect.bind(db);
    db.disconnect = async function() {
      try {
        await originalDisconnect();
        client.destroy();
      } finally {
        global._mockDatabases?.delete(db);
      }
    };
  }

  return db;
}

/**
 * Create a connected database with mock client
 *
 * @param {string} name - Test name
 * @param {object} options - Options
 * @returns {Promise<Database>} Connected database
 */
export async function createConnectedMockDatabase(name = 'test', options = {}) {
  const db = createMockDatabase(name, options);
  await db.connect();
  return db;
}

/**
 * Create a database with a resource already set up
 *
 * @param {string} name - Test name
 * @param {object} resourceConfig - Resource configuration
 * @param {object} options - Database options
 * @returns {Promise<{database: Database, resource: Resource}>}
 */
export async function createDatabaseWithResource(name, resourceConfig, options = {}) {
  const db = await createConnectedMockDatabase(name, options);

  const resource = await db.createResource({
    name: resourceConfig.name || 'test-resource',
    attributes: resourceConfig.attributes || { name: 'string' },
    ...resourceConfig
  });

  return { database: db, resource };
}

// ============================================
// Schema Factories
// ============================================

/**
 * Common schema patterns for quick testing
 */
export const schemas = {
  /**
   * Simple user schema
   */
  user: {
    name: 'users',
    attributes: {
      name: 'string|required',
      email: 'email|required',
      age: 'number|optional',
      active: 'boolean|default:true'
    }
  },

  /**
   * User with timestamps
   */
  userWithTimestamps: {
    name: 'users',
    attributes: {
      name: 'string|required',
      email: 'email|required',
      age: 'number|optional',
      active: 'boolean|default:true'
    },
    timestamps: true
  },

  /**
   * Product with partitions
   */
  productWithPartitions: {
    name: 'products',
    attributes: {
      name: 'string|required',
      category: 'string|required',
      price: 'number|required',
      status: 'string|default:active'
    },
    partitions: {
      byCategory: { fields: { category: 'string' } },
      byStatus: { fields: { status: 'string' } }
    }
  },

  /**
   * Order with multiple field types
   */
  order: {
    name: 'orders',
    attributes: {
      customerId: 'string|required',
      items: 'array|items:object',
      total: 'number|required',
      status: 'string|default:pending',
      shippingAddress: {
        street: 'string',
        city: 'string',
        zipCode: 'string'
      },
      createdAt: 'date'
    },
    timestamps: true
  },

  /**
   * Document with secrets
   */
  documentWithSecrets: {
    name: 'documents',
    attributes: {
      title: 'string|required',
      content: 'string',
      apiKey: 'secret|optional',
      password: 'secret|optional'
    }
  },

  /**
   * Item with embeddings (vector)
   */
  itemWithEmbedding: {
    name: 'items',
    attributes: {
      title: 'string|required',
      description: 'string',
      embedding: 'embedding:128'
    }
  },

  /**
   * Log entry (append-only pattern)
   */
  logEntry: {
    name: 'logs',
    attributes: {
      level: 'string|required',
      message: 'string|required',
      metadata: 'object|optional',
      timestamp: 'date|required'
    },
    behavior: 'body-only'
  },

  /**
   * Cache entry with TTL fields
   */
  cacheEntry: {
    name: 'cache',
    attributes: {
      key: 'string|required',
      value: 'any',
      expiresAt: 'date|required'
    }
  },

  /**
   * Minimal schema for quick tests
   */
  minimal: {
    name: 'items',
    attributes: {
      value: 'string'
    }
  }
};

/**
 * Create a resource config from a template
 */
export function createSchemaFromTemplate(template, overrides = {}) {
  const base = schemas[template];
  if (!base) {
    throw new Error(`Unknown schema template: ${template}. Available: ${Object.keys(schemas).join(', ')}`);
  }

  return {
    ...base,
    ...overrides,
    attributes: {
      ...base.attributes,
      ...(overrides.attributes || {})
    }
  };
}

// ============================================
// Data Factories
// ============================================

/**
 * Generate test data based on schema type
 */
export const dataGenerators = {
  user: (overrides = {}) => ({
    name: `User ${idGenerator(4)}`,
    email: `user-${idGenerator(6)}@test.com`,
    age: Math.floor(Math.random() * 50) + 18,
    active: true,
    ...overrides
  }),

  product: (overrides = {}) => ({
    name: `Product ${idGenerator(4)}`,
    category: ['electronics', 'clothing', 'food', 'books'][Math.floor(Math.random() * 4)],
    price: Math.floor(Math.random() * 10000) / 100,
    status: 'active',
    ...overrides
  }),

  order: (overrides = {}) => ({
    customerId: idGenerator(10),
    items: [
      { productId: idGenerator(8), quantity: Math.floor(Math.random() * 5) + 1 }
    ],
    total: Math.floor(Math.random() * 100000) / 100,
    status: 'pending',
    shippingAddress: {
      street: `${Math.floor(Math.random() * 9999)} Test St`,
      city: 'Test City',
      zipCode: String(Math.floor(Math.random() * 90000) + 10000)
    },
    createdAt: new Date(),
    ...overrides
  }),

  logEntry: (overrides = {}) => ({
    level: ['info', 'warn', 'error', 'debug'][Math.floor(Math.random() * 4)],
    message: `Log message ${idGenerator(8)}`,
    metadata: { requestId: idGenerator(12) },
    timestamp: new Date(),
    ...overrides
  })
};

/**
 * Generate multiple records
 */
export function generateMany(generator, count, overridesPerItem = {}) {
  return Array.from({ length: count }, (_, i) => {
    const itemOverrides = typeof overridesPerItem === 'function'
      ? overridesPerItem(i)
      : overridesPerItem;
    return generator(itemOverrides);
  });
}

// ============================================
// Cleanup Utilities
// ============================================

/**
 * Cleanup all mock databases created in tests
 */
export async function cleanupMockDatabases() {
  if (typeof global !== 'undefined' && global._mockDatabases) {
    const databases = Array.from(global._mockDatabases);
    await Promise.allSettled(databases.map(db => {
      if (db && typeof db.disconnect === 'function') {
        return db.disconnect().catch(() => {});
      }
    }));
    global._mockDatabases.clear();
  }
}

export default {
  createMockClient,
  createMockDatabase,
  createConnectedMockDatabase,
  createDatabaseWithResource,
  createSchemaFromTemplate,
  schemas,
  dataGenerators,
  generateMany,
  cleanupMockDatabases
};
