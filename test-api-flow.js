/**
 * Minimal reproduction test for API registration + login flow
 */

import { Database } from './src/database.class.js';
import { ApiPlugin } from './src/plugins/api/index.js';
import { MemoryClient } from './src/clients/memory-client.class.js';

console.log('=== API FLOW DEBUG TEST ===\n');

const port = 33033;
const client = new MemoryClient();
const db = new Database({ client, passphrase: 'test-pass', bcryptRounds: 10 });
await db.connect();

// Create users resource with password field (bcrypt)
await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    email: 'string|required|email',
    password: 'password|required',
    role: 'string|optional'
  },
  behavior: 'body-overflow'
});

const apiPlugin = new ApiPlugin({
  port,
  verbose: false,
  auth: {
    driver: 'jwt',
    resource: 'users',
    usernameField: 'email',
    passwordField: 'password',
    config: {
      jwtSecret: 'test-secret',
      jwtExpiresIn: '1h',
      allowRegistration: true
    }
  },
  resources: {
    users: {
      auth: false,
      methods: ['GET']
    }
  }
});

await db.usePlugin(apiPlugin);

// Wait for server to start
await new Promise(resolve => setTimeout(resolve, 1000));

console.log('1. Registering user...');
const registerResponse = await fetch(`http://localhost:${port}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'SecurePass123!',
    role: 'admin'
  })
});

const registerData = await registerResponse.json();
console.log('   Status:', registerResponse.status);
console.log('   Response:', JSON.stringify(registerData, null, 2));

if (registerResponse.ok) {
  console.log('\n2. Checking stored password in database...');
  const usersResource = db.getResource('users');
  const users = await usersResource.query({ email: 'test@example.com' });
  if (users && users.length > 0) {
    const storedPassword = users[0].password;
    console.log('   Stored password:', storedPassword);
    console.log('   Length:', storedPassword.length);
    console.log('   Starts with $?', storedPassword.startsWith('$'));
    console.log('   Includes colon?', storedPassword.includes(':'));
    console.log('   Is 53 chars?', storedPassword.length === 53);
  }

  console.log('\n3. Attempting login...');
  const loginResponse = await fetch(`http://localhost:${port}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'SecurePass123!'
    })
  });

  const loginData = await loginResponse.json();
  console.log('   Status:', loginResponse.status);
  console.log('   Response:', JSON.stringify(loginData, null, 2));

  if (loginResponse.ok && loginData.data && loginData.data.token) {
    console.log('\n✅ SUCCESS! Login worked.');
  } else {
    console.log('\n❌ FAILED! Login did not work.');
  }
} else {
  console.log('\n❌ Registration failed, cannot proceed to login test.');
}

await apiPlugin.stop();
await db.disconnect();

console.log('\n=== TEST COMPLETE ===');
process.exit(0);
