/* istanbul ignore file */
import { join } from 'path';
import { nanoid } from 'nanoid';

import {
  SQSClient, 
  CreateQueueCommand, 
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

import Client from '../src/client.class.js';
import Database from '../src/database.class.js';
import { isString } from 'lodash-es';


const s3Prefix = (testName) => join('s3db', 'tests', new Date().toISOString().substring(0, 10), testName + '-' + Date.now() + '-' + nanoid(4));
const sqsName = (testName) => ['s3db', 'tests', new Date().toISOString().substring(0, 10), testName + '-' + Date.now() + '-' + nanoid(4)].join('-').replace('-','_')

export function createClientForTest(testName, options = {}) {
  if (!options.connectionString) {
    options.connectionString = process.env.BUCKET_CONNECTION_STRING + `/${s3Prefix(testName)}`;
  }

  return new Client(options);
};

export function createDatabaseForTest(testName, options = {}) {
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

  return sqsClient;
}

export async function createSqsQueueForTest(testName, options = {}) {
  const sqsClient = createSqsClientForTest(testName, options);
  
  const command = new CreateQueueCommand({
    Attributes: {
      DelaySeconds: "0",
    },
    ...options,
    QueueName: sqsName(testName),
  });

  const response = await sqsClient.send(command);
  const queueUrl = response.QueueUrl.replace(/https?:\/\/[^/]+/, 'http://localhost:4566');
  
  return queueUrl
}
