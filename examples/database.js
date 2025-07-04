import dotenv from 'dotenv';
import { join } from 'path';
import S3db from '../src/index.js';

dotenv.config({ debug: false, silent: true });

const createPrefix = () => join('s3db', 'examples', new Date().toISOString().substring(0, 10), 'example-' + Date.now());

let database;

const setupDatabase = async () => {
  // Create database with real connection using test prefix
  database = new S3db({
    verbose: true,
    bucket: process.env.BUCKET_NAME || 's3db-test',
    accessKeyId: process.env.MINIO_USER || process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.MINIO_PASSWORD || process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.MINIO_ENDPOINT || process.env.AWS_ENDPOINT,
    forcePathStyle: true,
    prefix: createPrefix()
  });

  await database.connect();
  return database;
};

const teardownDatabase = async () => {
  if (database) {
    await database.disconnect();
  }
};

export { setupDatabase, teardownDatabase, database }; 