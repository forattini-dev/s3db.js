import dotenv from 'dotenv';
dotenv.config({ debug: false, silent: true });

import S3db from '../src/index.js';
import { CostsPlugin } from '../src/plugins/costs.plugin.js';

const ENV = {
  CONNECTION_STRING: process.env.BUCKET_CONNECTION_STRING || 's3://s3db-test',
  PASSPRHASE: process.env.PASSPHRASE || 'test-passphrase',
  PARALLELISM: parseInt(process.env.PARALLELISM) || 10
};

export { ENV, S3db, CostsPlugin }; 