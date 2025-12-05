/* istanbul ignore file */
import fs from 'fs/promises';
import os from 'os';
import path, { join } from 'path';
import { isString } from 'lodash-es';

import {
  SQSClient,
  CreateQueueCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

import Database from '#src/database.class.js';
import { idGenerator } from '#src/concerns/id.js';
import { CronManager } from '#src/concerns/cron-manager.js';
import { ProcessManager } from '#src/concerns/process-manager.js';
import { S3Client } from '#src/clients/s3-client.class.js';
import { MemoryClient } from '#src/clients/memory-client.class.js';
import { FileSystemClient } from '#src/clients/filesystem-client.class.js';

// Default to filesystem client to avoid memory pressure during tests
const useFilesystemClient = (() => {
  const rawValue = String(process.env.TEST_USE_FILESYSTEM_CLIENT ?? 'true').toLowerCase();
  return !['false', '0', 'off', 'no'].includes(rawValue);
})();

// Legacy flag for backward compatibility
const forceMemoryClients = (() => {
  const rawValue = String(process.env.TEST_FORCE_MEMORY_CLIENT ?? 'false').toLowerCase();
  return !['false', '0', 'off', 'no'].includes(rawValue);
})();

// Base temp directory for filesystem tests (cross-platform using os.tmpdir())
// Each test run gets a unique directory to avoid conflicts between parallel tests
const testRunId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
const testTempBaseDir = path.join(os.tmpdir(), 's3db-tests', testRunId);


export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Increase max listeners to prevent warnings in tests with multiple databases
process.setMaxListeners(50);

// Shared ProcessManager and CronManager for all tests (prevents signal handler leak)
const testProcessManager = new ProcessManager({ logLevel: 'silent', exitOnSignal: false });
const testCronManager = new CronManager({ disabled: true, logLevel: 'silent' });

// Global counter to ensure unique S3 prefixes even when tests run in same millisecond (CI environments)
let prefixCounter = 0;

const s3Prefix = (testName = idGenerator(5)) => join('day=' + new Date().toISOString().substring(0, 10), testName + '-' + Date.now() + '-' + (++prefixCounter) + '-' + idGenerator(4));
const sqsName = (testName = idGenerator(5)) => ['day_' + new Date().toISOString().substring(0, 10), testName + '-' + Date.now() + '-' + (++prefixCounter) + '-' + idGenerator(4)].join('-').replace(/-/g,'_')

export function createClientForTest(testName, options = {}) {
  const {
    forceMemoryClient,
    ...restOptions
  } = options;

  const shouldUseMemory = (forceMemoryClient ?? forceMemoryClients) === true;
  const finalOptions = { ...restOptions };

  if (!finalOptions.connectionString) {
    if (shouldUseMemory) {
      const memoryBase = `memory://${s3Prefix(testName)}`;
      finalOptions.connectionString = `${memoryBase}/${s3Prefix(testName)}`;
    } else {
      const baseConnection = process.env.BUCKET_CONNECTION_STRING || `memory://${s3Prefix(testName)}`;
      finalOptions.connectionString = baseConnection + `/${s3Prefix(testName)}`;
    }
  }

  // Detect protocol and create appropriate client
  if (finalOptions.connectionString.startsWith('memory://')) {
    // Extract bucket and path from memory:// URL
    const url = new URL(finalOptions.connectionString);
    const bucket = url.hostname || 'bucket';
    const keyPrefix = url.pathname.substring(1); // Remove leading /

    return new MemoryClient({
      bucket,
      keyPrefix,
      verbose: finalOptions.verbose || false
    });
  }

  return new S3Client(finalOptions);
}

/**
 * Create a filesystem-based Database for testing
 * Uses local filesystem instead of memory to avoid OOM issues
 *
 * @param {string} testName - Unique test identifier
 * @param {object} options - Additional Database options
 * @returns {Database} Database instance using FileSystemClient
 */
export function createFilesystemDatabaseForTest(testName, options = {}) {
  if (!isString(testName)) {
    throw new Error('testName must be a string');
  }

  // Create unique path for this test to avoid collisions
  const uniqueId = `${testName}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const testBasePath = path.join(testTempBaseDir, uniqueId);

  const filesystemClient = new FileSystemClient({
    basePath: testBasePath,
    bucket: 'test',
    keyPrefix: s3Prefix(testName),
    enforceLimits: options.enforceLimits || false,
    logLevel: 'silent'
  });

  const params = {
    client: filesystemClient,
    logLevel: 'silent',
    ...options,
    loggerOptions: {
      level: 'error',
      ...(options.loggerOptions || {}),
    },
  };

  if (!params.processManager) {
    params.processManager = testProcessManager;
  }

  if (!params.cronManager) {
    params.cronManager = testCronManager;
  }

  const database = new Database(params);

  // Track for cleanup
  if (typeof global !== 'undefined') {
    global._testDatabases = global._testDatabases || new Set();
    global._testDatabases.add(database);

    const originalDisconnect = database.disconnect.bind(database);
    database.disconnect = async function() {
      try {
        await originalDisconnect();
        // Cleanup temp directory after disconnect
        await fs.rm(testBasePath, { recursive: true, force: true }).catch(() => {});
      } finally {
        global._testDatabases?.delete(database);
      }
    };
  }

  return database;
}

export function createDatabaseForTest(testName, options = {}) {
  if (!isString(testName)) {
    throw new Error('testName must be a string');
  }

  const {
    forceMemoryClient,
    forceFilesystemClient,
    ...restOptions
  } = options;

  // Priority: explicit option > env var > default (filesystem)
  const shouldUseMemory = forceMemoryClient === true || (forceMemoryClients && forceFilesystemClient !== true);
  const shouldUseFilesystem = forceFilesystemClient === true || (useFilesystemClient && !shouldUseMemory);

  // Use filesystem client by default (low memory usage)
  if (
    shouldUseFilesystem &&
    !restOptions.client &&
    !restOptions.connectionString &&
    !restOptions.bucket
  ) {
    return createFilesystemDatabaseForTest(testName, restOptions);
  }

  // Use memory client if explicitly requested
  if (
    shouldUseMemory &&
    !restOptions.client &&
    !restOptions.connectionString &&
    !restOptions.bucket
  ) {
    return createMemoryDatabaseForTest(testName, restOptions);
  }

  const baseConnection = process.env.BUCKET_CONNECTION_STRING || `memory://${s3Prefix(testName)}`;
  const params = {
    connectionString: baseConnection + `/${s3Prefix(testName)}`,
    logLevel: 'silent',  // Ensure no initialization logs in tests
    ...restOptions,
    // Merge loggerOptions with defaults (restOptions takes precedence for explicit overrides)
    loggerOptions: {
      level: 'error',  // Suppress info/debug logs in tests
      ...(restOptions.loggerOptions || {}),
    },
  }

  // Use shared managers to prevent signal handler leaks in tests
  if (!params.processManager) {
    params.processManager = testProcessManager;
  }
  if (!params.cronManager) {
    params.cronManager = testCronManager;
  }

  const database = new Database(params);

  // Track database for cleanup on process exit (prevents resource leaks in tests)
  if (typeof global !== 'undefined') {
    global._testDatabases = global._testDatabases || new Set();
    global._testDatabases.add(database);

    // Auto-cleanup on disconnect
    const originalDisconnect = database.disconnect.bind(database);
    database.disconnect = async function() {
      try {
        await originalDisconnect();
      } finally {
        global._testDatabases?.delete(database);
      }
    };
  }

  return database;
}

// Emergency cleanup function for leaked databases
export async function cleanupAllTestDatabases() {
  if (typeof global !== 'undefined' && global._testDatabases) {
    const databases = Array.from(global._testDatabases);
    await Promise.allSettled(databases.map(db => {
      if (db && typeof db.disconnect === 'function') {
        return db.disconnect().catch(() => {});
      }
    }));
    global._testDatabases.clear();
  }
}

export function createSqsClientForTest(testName, options = {}) {
  const sqsClient = new SQSClient({
    region: "us-east-1",
    endpoint: "http://localhost:4566",
    credentials: {
      accessKeyId: "test",
      secretAccessKey: "test",
    },
  });

  sqsClient.quickSend = async function quickSend (queueUrl, msg) {
    const response = await sqsClient.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: !isString(msg) ? JSON.stringify(msg) : msg
    }));
    return response;
  }

  sqsClient.quickGet = async function quickGet(queueUrl, n = 1) {
    const { ReceiveMessageCommand } = await import('@aws-sdk/client-sqs');
    const response = await sqsClient.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: n,
      WaitTimeSeconds: 2
    }));
    return response;
  }

  sqsClient.quickCount = async function quickCount(queueUrl) {
    const { GetQueueAttributesCommand } = await import('@aws-sdk/client-sqs');
    const response = await sqsClient.send(new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages']
    }));
    return Number(response.Attributes.ApproximateNumberOfMessages || 0);
  }

  return sqsClient;
}

export async function createSqsQueueForTest(testName, options = {}) {
  const sqsClient = createSqsClientForTest(testName, options);

  const command = new CreateQueueCommand({
    Attributes: {
      DelaySeconds: "0",
      ReceiveMessageWaitTimeSeconds: "0",
    },
    ...options,
    QueueName: sqsName(testName),
  });

  const response = await sqsClient.send(command);
  const queueUrl = response.QueueUrl.replace(/https?:\/\/[^/]+/, 'http://localhost:4566');

  await new Promise(resolve => setTimeout(resolve, 500));

  return queueUrl;
}

export async function createTemporaryPathForTest (prefix = 's3db-test') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const uniqueId = `${timestamp}-${random}`;
  const tempPath = path.join('/tmp', `${prefix}-${uniqueId}`);

  // Create the directory if it does not exist yet
  await fs.mkdir(tempPath, { recursive: true });

  return tempPath;
}

/**
 * Create a memory-based Database for ultra-fast testing
 * No S3, LocalStack, or Docker required!
 *
 * @param {string} testName - Unique test identifier
 * @param {object} options - Additional Database options
 * @param {boolean} options.enforceLimits - Enforce S3 limits (2KB metadata)
 * @param {string} options.persistPath - Optional path to persist snapshots
 * @returns {Database} Database instance using MemoryClient
 */
export function createMemoryDatabaseForTest(testName, options = {}) {
  if (!isString(testName)) {
    throw new Error('testName must be a string');
  }

  // Ensure bucket is unique per test instance to avoid OOM from shared storage
  const uniqueBucket = `test-${testName}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const memoryClient = new MemoryClient({
    bucket: uniqueBucket,
    keyPrefix: s3Prefix(testName),
    enforceLimits: options.enforceLimits || false,
    persistPath: options.persistPath,
    verbose: options.verbose || false
  });

  const params = {
    client: memoryClient,
    logLevel: 'silent',  // Ensure no initialization logs in tests
    ...options,
    // Merge loggerOptions with defaults (options takes precedence for explicit overrides)
    loggerOptions: {
      level: 'error',  // Suppress info/debug logs in tests
      ...(options.loggerOptions || {}),
    },
  };

  if (!params.processManager) {
    params.processManager = testProcessManager;
  }

  if (!params.cronManager) {
    params.cronManager = testCronManager;
  }

  const database = new Database(params);

  if (typeof global !== 'undefined') {
    global._testDatabases = global._testDatabases || new Set();
    global._testDatabases.add(database);

    const originalDisconnect = database.disconnect.bind(database);
    database.disconnect = async function() {
      try {
        await originalDisconnect();
      } finally {
        global._testDatabases?.delete(database);
      }
    };
  }

  return database;
}
