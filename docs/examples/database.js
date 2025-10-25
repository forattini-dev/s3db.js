import dotenv from 'dotenv';
dotenv.config({ debug: false, silent: true });

import { join } from 'path';
import S3db from '../../src/index.js';

const createPrefix = () => join('s3db', 'examples', new Date().toISOString().substring(0, 10), 'example-' + Date.now());

let database;

const setupDatabase = async (options = {}) => {
  // Create database with real connection using test prefix
  database = new S3db({
    verbose: true,
    connectionString: process.env.BUCKET_CONNECTION_STRING + `/${createPrefix()}`,
    plugins: options.plugins || []
  });

  await database.connect();
  return database;
};

export { setupDatabase, database };
