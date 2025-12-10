/**
 * Test Fixtures - Reusable test data and configurations
 *
 * Fixtures provide consistent, predictable test data that can be
 * reused across multiple tests without side effects.
 */

import { idGenerator } from '#src/concerns/id.js';

// ============================================
// User Fixtures
// ============================================

export const users = {
  john: {
    id: 'user-john',
    name: 'John Doe',
    email: 'john@example.com',
    age: 30,
    active: true
  },
  jane: {
    id: 'user-jane',
    name: 'Jane Smith',
    email: 'jane@example.com',
    age: 25,
    active: true
  },
  inactive: {
    id: 'user-inactive',
    name: 'Inactive User',
    email: 'inactive@example.com',
    age: 40,
    active: false
  },
  admin: {
    id: 'user-admin',
    name: 'Admin User',
    email: 'admin@example.com',
    age: 35,
    active: true,
    role: 'admin'
  }
};

export const userList = Object.values(users);

// ============================================
// Product Fixtures
// ============================================

export const products = {
  laptop: {
    id: 'prod-laptop',
    name: 'Laptop Pro',
    category: 'electronics',
    price: 1299.99,
    status: 'active',
    stock: 50
  },
  phone: {
    id: 'prod-phone',
    name: 'Smartphone X',
    category: 'electronics',
    price: 799.99,
    status: 'active',
    stock: 100
  },
  tshirt: {
    id: 'prod-tshirt',
    name: 'Cotton T-Shirt',
    category: 'clothing',
    price: 29.99,
    status: 'active',
    stock: 200
  },
  book: {
    id: 'prod-book',
    name: 'Programming Guide',
    category: 'books',
    price: 49.99,
    status: 'active',
    stock: 75
  },
  discontinued: {
    id: 'prod-discontinued',
    name: 'Old Product',
    category: 'electronics',
    price: 99.99,
    status: 'discontinued',
    stock: 0
  }
};

export const productList = Object.values(products);

export const productsByCategory = {
  electronics: [products.laptop, products.phone, products.discontinued],
  clothing: [products.tshirt],
  books: [products.book]
};

// ============================================
// Order Fixtures
// ============================================

export const orders = {
  pending: {
    id: 'order-pending',
    customerId: 'user-john',
    items: [
      { productId: 'prod-laptop', quantity: 1, price: 1299.99 }
    ],
    total: 1299.99,
    status: 'pending',
    shippingAddress: {
      street: '123 Main St',
      city: 'New York',
      zipCode: '10001'
    },
    createdAt: new Date('2024-01-15T10:00:00Z')
  },
  completed: {
    id: 'order-completed',
    customerId: 'user-jane',
    items: [
      { productId: 'prod-phone', quantity: 1, price: 799.99 },
      { productId: 'prod-tshirt', quantity: 2, price: 59.98 }
    ],
    total: 859.97,
    status: 'completed',
    shippingAddress: {
      street: '456 Oak Ave',
      city: 'Los Angeles',
      zipCode: '90001'
    },
    createdAt: new Date('2024-01-10T14:30:00Z'),
    completedAt: new Date('2024-01-12T09:00:00Z')
  },
  cancelled: {
    id: 'order-cancelled',
    customerId: 'user-john',
    items: [
      { productId: 'prod-book', quantity: 3, price: 149.97 }
    ],
    total: 149.97,
    status: 'cancelled',
    shippingAddress: {
      street: '123 Main St',
      city: 'New York',
      zipCode: '10001'
    },
    createdAt: new Date('2024-01-08T16:00:00Z'),
    cancelledAt: new Date('2024-01-09T10:00:00Z')
  }
};

export const orderList = Object.values(orders);

// ============================================
// Configuration Fixtures
// ============================================

export const configs = {
  /**
   * Minimal database config
   */
  minimalDb: {
    logLevel: 'silent'
  },

  /**
   * Development database config
   */
  devDb: {
    logLevel: 'debug',
    strictValidation: true
  },

  /**
   * Production-like database config
   */
  prodDb: {
    logLevel: 'warn',
    strictValidation: true,
    parallelism: 10
  },

  /**
   * High-performance config
   */
  highPerformance: {
    logLevel: 'silent',
    parallelism: 20,
    clientOptions: {
      concurrency: 20,
      retries: 5
    }
  }
};

// ============================================
// API Request/Response Fixtures
// ============================================

export const apiRequests = {
  createUser: {
    method: 'POST',
    path: '/users',
    body: {
      name: 'New User',
      email: 'new@example.com',
      age: 28
    }
  },
  updateUser: {
    method: 'PUT',
    path: '/users/user-john',
    body: {
      name: 'John Updated',
      age: 31
    }
  },
  patchUser: {
    method: 'PATCH',
    path: '/users/user-john',
    body: {
      age: 32
    }
  },
  queryUsers: {
    method: 'GET',
    path: '/users',
    query: {
      active: 'true',
      limit: '10'
    }
  }
};

export const apiResponses = {
  success: {
    status: 200,
    body: { success: true }
  },
  created: {
    status: 201,
    body: { id: 'new-id', success: true }
  },
  notFound: {
    status: 404,
    body: { error: 'Not found' }
  },
  unauthorized: {
    status: 401,
    body: { error: 'Unauthorized' }
  },
  validationError: {
    status: 400,
    body: { error: 'Validation failed', fields: ['email'] }
  }
};

// ============================================
// Error Fixtures
// ============================================

export const errors = {
  notFound: Object.assign(new Error('NoSuchKey'), {
    name: 'NoSuchKey',
    $metadata: { httpStatusCode: 404 }
  }),
  preconditionFailed: Object.assign(new Error('PreconditionFailed'), {
    name: 'PreconditionFailed',
    $metadata: { httpStatusCode: 412 }
  }),
  accessDenied: Object.assign(new Error('AccessDenied'), {
    name: 'AccessDenied',
    $metadata: { httpStatusCode: 403 }
  }),
  throttling: Object.assign(new Error('Throttling'), {
    name: 'Throttling',
    $metadata: { httpStatusCode: 429 }
  }),
  internalError: Object.assign(new Error('InternalError'), {
    name: 'InternalError',
    $metadata: { httpStatusCode: 500 }
  })
};

// ============================================
// Embedding/Vector Fixtures
// ============================================

export const embeddings = {
  /**
   * 128-dimensional embedding (common for small models)
   */
  dim128: {
    zeros: new Array(128).fill(0),
    ones: new Array(128).fill(1),
    random: () => Array.from({ length: 128 }, () => Math.random() * 2 - 1),
    normalized: () => {
      const vec = Array.from({ length: 128 }, () => Math.random() * 2 - 1);
      const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
      return vec.map(v => v / mag);
    }
  },

  /**
   * 384-dimensional embedding (sentence-transformers)
   */
  dim384: {
    zeros: new Array(384).fill(0),
    random: () => Array.from({ length: 384 }, () => Math.random() * 2 - 1)
  },

  /**
   * 1536-dimensional embedding (OpenAI ada-002)
   */
  dim1536: {
    zeros: new Array(1536).fill(0),
    random: () => Array.from({ length: 1536 }, () => Math.random() * 2 - 1)
  }
};

// ============================================
// Partition Test Fixtures
// ============================================

export const partitionTestData = {
  /**
   * Data designed to test partition behavior
   */
  multiRegion: [
    { id: 'item-1', region: 'us-east', status: 'active' },
    { id: 'item-2', region: 'us-east', status: 'inactive' },
    { id: 'item-3', region: 'us-west', status: 'active' },
    { id: 'item-4', region: 'eu-west', status: 'active' },
    { id: 'item-5', region: 'eu-west', status: 'inactive' }
  ],

  /**
   * Data for testing partition updates
   */
  statusTransitions: [
    { id: 'doc-1', status: 'draft', title: 'Document 1' },
    { id: 'doc-2', status: 'review', title: 'Document 2' },
    { id: 'doc-3', status: 'published', title: 'Document 3' }
  ]
};

// ============================================
// Large Dataset Generators
// ============================================

/**
 * Generate a large dataset for performance testing
 * Note: Use sparingly - generates data in memory
 */
export function generateLargeDataset(type, count) {
  const generators = {
    users: (i) => ({
      id: `user-${i}`,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      age: 18 + (i % 60),
      active: i % 10 !== 0
    }),
    products: (i) => ({
      id: `prod-${i}`,
      name: `Product ${i}`,
      category: ['electronics', 'clothing', 'food', 'books'][i % 4],
      price: Math.round((10 + Math.random() * 990) * 100) / 100,
      status: i % 20 === 0 ? 'discontinued' : 'active'
    }),
    logs: (i) => ({
      id: `log-${i}`,
      level: ['info', 'warn', 'error', 'debug'][i % 4],
      message: `Log message ${i}`,
      timestamp: new Date(Date.now() - i * 1000)
    })
  };

  const generator = generators[type];
  if (!generator) {
    throw new Error(`Unknown dataset type: ${type}. Available: ${Object.keys(generators).join(', ')}`);
  }

  return Array.from({ length: count }, (_, i) => generator(i));
}

// ============================================
// Test Context Helpers
// ============================================

/**
 * Create a unique test context with isolated fixtures
 */
export function createTestContext(prefix = 'test') {
  const contextId = `${prefix}-${idGenerator(6)}`;

  return {
    id: contextId,

    // Generate unique IDs within this context
    uniqueId: (name = '') => `${contextId}-${name}-${idGenerator(4)}`,

    // Clone a fixture with unique IDs
    cloneWithUniqueIds: (fixture) => {
      const clone = JSON.parse(JSON.stringify(fixture));
      if (clone.id) {
        clone.id = `${contextId}-${clone.id}`;
      }
      return clone;
    },

    // Clone multiple fixtures
    cloneListWithUniqueIds: (fixtures) => {
      return fixtures.map(f => {
        const clone = JSON.parse(JSON.stringify(f));
        if (clone.id) {
          clone.id = `${contextId}-${clone.id}`;
        }
        return clone;
      });
    }
  };
}

export default {
  users,
  userList,
  products,
  productList,
  productsByCategory,
  orders,
  orderList,
  configs,
  apiRequests,
  apiResponses,
  errors,
  embeddings,
  partitionTestData,
  generateLargeDataset,
  createTestContext
};
