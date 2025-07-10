import Client from '../src/client.class.js';
import dotenv from 'dotenv';
dotenv.config();

const [,, key] = process.argv;
if (!key) {
  console.error('Usage: node examples/debug-delete.js <key>');
  process.exit(1);
}

const connectionString = process.env.BUCKET_CONNECTION_STRING
  .replace('USER', process.env.MINIO_USER)
  .replace('PASSWORD', process.env.MINIO_PASSWORD);

const client = new Client({ connectionString });

(async () => {
  try {
    const existsBefore = await client.exists(key);
    console.log(`[DEBUG] Key exists before delete:`, existsBefore);
    const result = await client.deleteObjects([key]);
    const existsAfter = await client.exists(key);
    console.log(`[DEBUG] Key exists after delete:`, existsAfter);
    console.log(`[DEBUG] Delete result:`, result);
  } catch (err) {
    console.error('[ERROR]', err);
    process.exit(2);
  }
})(); 