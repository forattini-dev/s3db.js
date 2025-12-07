import { URL } from 'url';

import { createDatabaseForTest } from '#tests/config.js';
import ConnectionString from '#src/connection-string.class.js';

import {
  S3Client as AwsS3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

const REQUIRED_ENV_VARS = ['S3_COMPAT_ACCESS_KEY', 'S3_COMPAT_SECRET_KEY', 'S3_COMPAT_ENDPOINT'];
const OPTIONAL_ENV_VARS = {
  bucket: 'S3_COMPAT_BUCKET',
  region: 'S3_COMPAT_REGION',
  forcePathStyle: 'S3_COMPAT_FORCE_PATH_STYLE',
};

const DEFAULTS = {
  bucket: 's3db',
  region: 'us-east-1',
  forcePathStyle: 'true',
};

const isTruthy = value => value === true || value === 'true' || value === '1';

const createAwsClient = (connection) => {
  const options = {
    region: connection.region || DEFAULTS.region,
    endpoint: connection.endpoint,
    forcePathStyle: connection.forcePathStyle === undefined
      ? true
      : isTruthy(connection.forcePathStyle),
  };

  if (connection.accessKeyId && connection.secretAccessKey) {
    options.credentials = {
      accessKeyId: connection.accessKeyId,
      secretAccessKey: connection.secretAccessKey,
    };
  }

  return new AwsS3Client(options);
};

const resolveConnectionString = (overrides = {}) => {
  if (overrides.connectionString) {
    return overrides.connectionString;
  }

  if (process.env.S3_COMPAT_CONNECTION_STRING) {
    return process.env.S3_COMPAT_CONNECTION_STRING;
  }

  const config = { ...DEFAULTS, ...overrides };

  if (config.accessKeyId && !config.accessKey) {
    config.accessKey = config.accessKeyId;
  }
  if (config.secretAccessKey && !config.secretKey) {
    config.secretKey = config.secretAccessKey;
  }

  for (const envVar of REQUIRED_ENV_VARS) {
    if (!config[envVarToKey(envVar)]) {
      const envValue = process.env[envVar];
      if (envValue) {
        config[envVarToKey(envVar)] = envValue;
      }
    }
  }

  for (const [key, envVar] of Object.entries(OPTIONAL_ENV_VARS)) {
    if (config[key] === undefined && process.env[envVar] !== undefined) {
      config[key] = process.env[envVar];
    }
  }

  const missing = REQUIRED_ENV_VARS
    .map(envVarToKey)
    .filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(
      'Missing S3-compatible configuration values: ' +
      missing.join(', ') +
      '. Provide S3_COMPAT_CONNECTION_STRING or the individual environment variables.'
    );
  }

  const url = new URL(config.endpoint);
  url.username = encodeURIComponent(config.accessKey);
  url.password = encodeURIComponent(config.secretKey);
  url.pathname = `/${encodeURIComponent(config.bucket || DEFAULTS.bucket)}`;
  if (config.region) {
    url.searchParams.set('region', config.region);
  }
  if (config.forcePathStyle !== undefined) {
    url.searchParams.set('forcePathStyle', isTruthy(config.forcePathStyle) ? 'true' : 'false');
  }

  return url.toString();
};

const envVarToKey = (envVar) => {
  switch (envVar) {
    case 'S3_COMPAT_ACCESS_KEY':
      return 'accessKey';
    case 'S3_COMPAT_SECRET_KEY':
      return 'secretKey';
    case 'S3_COMPAT_ENDPOINT':
      return 'endpoint';
    default:
      return envVar.toLowerCase();
  }
};

const ensureBucketExists = async (connectionString) => {
  const connection = new ConnectionString(connectionString);

  const client = createAwsClient(connection);

  try {
    await client.send(new HeadBucketCommand({ Bucket: connection.bucket }));
  } catch (error) {
    const notFound = error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404;
    const noSuchBucket = error?.name === 'NoSuchBucket';

    if (!notFound && !noSuchBucket) {
      throw error;
    }

    const params = { Bucket: connection.bucket };
    if (connection.region && connection.region !== 'us-east-1') {
      params.CreateBucketConfiguration = {
        LocationConstraint: connection.region,
      };
    }

    await client.send(new CreateBucketCommand(params));
  } finally {
    client.destroy?.();
  }
};

const purgePrefix = async (connectionString) => {
  const connection = new ConnectionString(connectionString);
  const prefix = connection.keyPrefix;

  if (!prefix) {
    return;
  }

  const client = createAwsClient(connection);

  try {
    let continuationToken;
    do {
      const response = await client.send(new ListObjectsV2Command({
        Bucket: connection.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }));

      const objects = response.Contents || [];
      if (objects.length > 0) {
        const deleteRequest = {
          Bucket: connection.bucket,
          Delete: {
            Objects: objects.map(({ Key }) => ({ Key })),
            Quiet: true,
          },
        };
        await client.send(new DeleteObjectsCommand(deleteRequest));
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
  } finally {
    client.destroy?.();
  }
};

const wrapDisconnectWithCleanup = (database) => {
  if (!database || typeof database.disconnect !== 'function') {
    return;
  }

  const connectionString = database.connectionString;
  const needsCleanup = connectionString && /^(https?|s3):/.test(connectionString);
  if (!needsCleanup) {
    return;
  }

  const originalDisconnect = database.disconnect.bind(database);
  let cleaned = false;

  database.disconnect = async (...args) => {
    try {
      return await originalDisconnect(...args);
    } finally {
      if (!cleaned) {
        cleaned = true;
        try {
          await purgePrefix(connectionString);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn('[S3-Compatible Harness] Failed to purge prefix:', error);
        }
      }
    }
  };
};

export const createS3CompatibleDatabase = async (testName, options = {}) => {
  const requireS3 = options.requireS3 === true || process.env.S3_COMPAT_REQUIRED === 'true';
  let baseConnectionString;
  let fallbackToMemory = false;

  try {
    baseConnectionString = resolveConnectionString(options);
  } catch (error) {
    if (requireS3) {
      throw error;
    }
    fallbackToMemory = true;
    if (process.env.JEST_WORKER_ID !== undefined) {
      console.warn('[S3-Compatible Harness] Falling back to memory:// for test:', testName, '-', error.message);
    }
  }

  const databaseOptions = options.databaseOptions ?? options.database ?? {};

  if (fallbackToMemory) {
    const database = await createDatabaseForTest(testName, databaseOptions);
    Object.defineProperty(database, '__s3CompatFallback', {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    return database;
  }

  await ensureBucketExists(baseConnectionString);

  const previous = process.env.BUCKET_CONNECTION_STRING;
  process.env.BUCKET_CONNECTION_STRING = baseConnectionString;

  try {
    const database = await createDatabaseForTest(testName, databaseOptions);
    wrapDisconnectWithCleanup(database);
    return database;
  } finally {
    if (previous === undefined) {
      delete process.env.BUCKET_CONNECTION_STRING;
    } else {
      process.env.BUCKET_CONNECTION_STRING = previous;
    }
  }
};

export const ensureS3CompatibleEnvironment = async (overrides = {}) => {
  const connectionString = resolveConnectionString(overrides);
  await ensureBucketExists(connectionString);
  return connectionString;
};

export const cleanupS3Prefix = purgePrefix;

export default {
  createS3CompatibleDatabase,
  ensureS3CompatibleEnvironment,
  cleanupS3Prefix,
};
