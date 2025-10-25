/* istanbul ignore file */
import fs from 'fs/promises';
import path, { join } from 'path';
import { isString } from 'lodash-es';

import {
  SQSClient, 
  CreateQueueCommand, 
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

import { S3Client } from '#src/clients/s3-client.class.js';
import Database from '#src/database.class.js';
import { idGenerator } from '#src/concerns/id.js';
import { MemoryClient } from '#src/clients/memory-client.class.js';


export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Global counter to ensure unique S3 prefixes even when tests run in same millisecond (CI environments)
let prefixCounter = 0;

const s3Prefix = (testName = idGenerator(5)) => join('day=' + new Date().toISOString().substring(0, 10), testName + '-' + Date.now() + '-' + (++prefixCounter) + '-' + idGenerator(4));
const sqsName = (testName = idGenerator(5)) => ['day_' + new Date().toISOString().substring(0, 10), testName + '-' + Date.now() + '-' + (++prefixCounter) + '-' + idGenerator(4)].join('-').replace(/-/g,'_')

export function createClientForTest(testName, options = {}) {
  if (!options.connectionString) {
    options.connectionString = process.env.BUCKET_CONNECTION_STRING + `/${s3Prefix(testName)}`;
  }

  return new S3Client(options);
};

export function createDatabaseForTest(testName, options = {}) {
  if (!isString(testName)) {
    throw new Error('testName must be a string');
  }

  const params = {
    connectionString: process.env.BUCKET_CONNECTION_STRING + `/${s3Prefix(testName)}`,
    ...options,
  }

  const database = new Database(params);
  return database;
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

  // Criar o diretório se não existir
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

  const memoryClient = new MemoryClient({
    bucket: `test-${testName}`,
    keyPrefix: s3Prefix(testName),
    enforceLimits: options.enforceLimits || false,
    persistPath: options.persistPath,
    verbose: options.verbose || false
  });

  const database = new Database({
    client: memoryClient,
    ...options
  });

  return database;
}
