import { Database } from './src/database.class.js';
import { MemoryClient } from './src/clients/memory-client.class.js';

const client = new MemoryClient();
const db = new Database({ client, passphrase: 'test', bcryptRounds: 10 });
await db.connect();

const users = await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    email: 'string|required',
    password: 'secret|required'
  }
});

console.log('Inserting user WITHOUT id...');
try {
  const user = await users.insert({ email: 'test@example.com', password: 'Password123!' });
  console.log('✅ SUCCESS! User inserted:', user.id);
} catch (err) {
  console.log('❌ FAILED:', err.message);
}

await db.disconnect();
