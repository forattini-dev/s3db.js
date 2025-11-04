import { afterAll, afterEach, beforeAll, beforeEach } from '@jest/globals';
import { rm } from 'node:fs/promises';

import { createDatabaseForTest, createTemporaryPathForTest } from '../../config.js';
import { CachePlugin } from '../../../src/plugins/cache.plugin.js';

function createDefaultMemoryResourceConfig() {
  return {
    name: 'users',
    asyncPartitions: false,
    attributes: {
      name: 'string|required',
      email: 'string|required',
      department: 'string|required',
      region: 'string|required',
      status: 'string|required'
    },
    partitions: {
      byDepartment: { fields: { department: 'string' } },
      byRegion: { fields: { region: 'string' } }
    }
  };
}

function createDefaultPartitionAwareResourceConfig() {
  return {
    name: 'users',
    attributes: {
      name: 'string|required',
      email: 'string|required',
      region: 'string|required',
      department: 'string|required'
    },
    partitions: {
      byRegion: { fields: { region: 'string' } },
      byDepartment: { fields: { department: 'string' } }
    }
  };
}

const DEFAULT_MEMORY_USERS = [
  { name: 'Alice', email: 'alice@example.com', department: 'Engineering', region: 'US', status: 'active' },
  { name: 'Bob', email: 'bob@example.com', department: 'Sales', region: 'US', status: 'active' },
  { name: 'Charlie', email: 'charlie@example.com', department: 'Engineering', region: 'EU', status: 'inactive' }
];

const DEFAULT_PARTITION_USERS = [
  { name: 'Alice', email: 'alice@example.com', region: 'US', department: 'Engineering' },
  { name: 'Bob', email: 'bob@example.com', region: 'US', department: 'Sales' },
  { name: 'Charlie', email: 'charlie@example.com', region: 'EU', department: 'Engineering' }
];

function normaliseResourceConfig(baseConfig, overrides = null) {
  if (!overrides) {
    return baseConfig;
  }

  if (typeof overrides === 'function') {
    return normaliseResourceConfig(baseConfig, overrides(baseConfig));
  }

  return { ...baseConfig, ...overrides };
}

function normalisePluginConfig(baseConfig, overrides = null) {
  if (!overrides) {
    return baseConfig;
  }

  if (typeof overrides === 'function') {
    return normalisePluginConfig(baseConfig, overrides(baseConfig));
  }

  return { ...baseConfig, ...overrides };
}

export function setupMemoryCacheSuite(options = {}) {
  const context = {
    db: null,
    cachePlugin: null,
    resource: null,
    defaultUsers: options.defaultUsers || DEFAULT_MEMORY_USERS,
    getResourceConfig: () => normaliseResourceConfig(createDefaultMemoryResourceConfig(), options.resourceConfig),
    getPluginConfig: () => normalisePluginConfig({
      driver: 'memory',
      ttl: 60000,
      maxSize: 100,
      ...(options.pluginOptions || {})
    }, null)
  };

  beforeEach(async () => {
    context.db = createDatabaseForTest(options.databaseName || 'suite=plugins/cache-memory');
    await context.db.connect();

    context.cachePlugin = new CachePlugin(context.getPluginConfig());
    await context.cachePlugin.install(context.db);

    if (options.createResource !== false) {
      context.resource = await context.db.createResource(context.getResourceConfig());
    } else {
      context.resource = null;
    }
  });

  afterEach(async () => {
    if (context.cachePlugin?.clearAllCache) {
      await context.cachePlugin.clearAllCache().catch(() => {});
    }
    if (context.db) {
      await context.db.disconnect();
    }
    context.db = null;
    context.cachePlugin = null;
    context.resource = null;
  });

  context.seedUsers = async (records = context.defaultUsers) => {
    if (!context.resource) {
      throw new Error('Cannot seed users without a resource. Set createResource to true or create one manually.');
    }

    return context.resource.insertMany(records);
  };

  return context;
}

export function setupPartitionAwareCacheSuite(options = {}) {
  const context = {
    db: null,
    cachePlugin: null,
    resource: null,
    directory: null,
    defaultUsers: options.defaultUsers || DEFAULT_PARTITION_USERS,
    getResourceConfig: () => normaliseResourceConfig(createDefaultPartitionAwareResourceConfig(), options.resourceConfig),
    pluginOptions: options.pluginOptions || {},
    shouldCleanupDirectory: false
  };

  beforeAll(async () => {
    if (options.directory) {
      context.directory = options.directory;
      context.shouldCleanupDirectory = false;
      return;
    }

    context.directory = await createTemporaryPathForTest('cache-partition-aware');
    context.shouldCleanupDirectory = true;
  });

  afterAll(async () => {
    if (context.shouldCleanupDirectory && context.directory) {
      await rm(context.directory, { recursive: true, force: true }).catch(() => {});
    }
  });

  beforeEach(async () => {
    context.db = createDatabaseForTest(options.databaseName || 'suite=plugins/cache-partition-aware');
    await context.db.connect();

    const baseConfig = {
      driver: 'filesystem',
      partitionAware: true,
      partitionStrategy: 'hierarchical',
      trackUsage: true,
      config: {
        directory: context.directory,
        enableStats: true
      },
      ...context.pluginOptions
    };

    baseConfig.config = {
      directory: context.directory,
      enableStats: true,
      ...(context.pluginOptions.config || {})
    };

    context.cachePlugin = new CachePlugin(baseConfig);
    await context.cachePlugin.install(context.db);

    if (options.createResource !== false) {
      context.resource = await context.db.createResource(context.getResourceConfig());
    } else {
      context.resource = null;
    }
  });

  afterEach(async () => {
    if (context.cachePlugin?.clearAllCache) {
      await context.cachePlugin.clearAllCache().catch(() => {});
    }
    if (context.db) {
      await context.db.disconnect();
    }
    context.db = null;
    context.cachePlugin = null;
    context.resource = null;
  });

  context.seedUsers = async (records = context.defaultUsers) => {
    if (!context.resource) {
      throw new Error('Cannot seed users without a resource. Set createResource to true or create one manually.');
    }

    const inserted = await context.resource.insertMany(records);
    await new Promise(resolve => setTimeout(resolve, 50));
    return inserted;
  };

  return context;
}

