import { ImporterPlugin } from './src/plugins/importer/index.js';
import { createDatabaseForTest } from './tests/config.js';
import fs from 'fs';

const database = createDatabaseForTest('test-debug');
await database.connect();

const resource = await database.createResource({
  name: 'test_users',
  attributes: {
    id: 'string|required',
    name: 'string|required',
    age: 'number|optional'
  }
});

const testFile = '/tmp/test-custom.json';
const testData = [{ id: 'u1', name: 'Alice', birthYear: 1994 }];
fs.writeFileSync(testFile, JSON.stringify(testData));

const plugin = new ImporterPlugin({
  resource: 'test_users',
  format: 'json',
  transforms: {
    age: (value, record) => {
      console.log('Transform - value:', value, 'record.birthYear:', record.birthYear);
      const result = new Date().getFullYear() - record.birthYear;
      console.log('Transform result:', result);
      return result;
    }
  },
  mapping: {
    birthYear: 'age'
  }
});

await database.usePlugin(plugin);

try {
  const result = await plugin.import(testFile);
  console.log('Result:', JSON.stringify(result, null, 2));

  const all = await resource.list();
  console.log('Records in DB:', all.length);
} catch (error) {
  console.log('Error:', error.message);
  console.log('Stack:', error.stack);
}

await database.disconnect();
fs.unlinkSync(testFile);
