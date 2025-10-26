/**
 * Example 78: API Plugin - JWT Authentication (Driver-Based)
 *
 * Demonstrates:
 * - Driver-based authentication system with JWT
 * - Configurable resource for auth management
 * - Custom username/password fields
 * - /auth/register and /auth/login endpoints
 * - Protected vs public resources
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';

async function main() {
  console.log('Example 78: JWT Authentication with Driver-Based Auth\n');

  // 1. Create database
  const db = new Database({
    connection: 'memory://',
    verbose: false
  });

  await db.connect();
  console.log('✅ Connected to database');

  // 2. Create users resource (can be named anything)
  const users = await db.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      email: 'string|required|email',
      password: 'secret|required', // Automatically encrypted
      name: 'string|optional',
      role: 'string|optional',
      active: 'boolean|default:true'
    },
    behavior: 'body-overflow',
    timestamps: true
  });
  console.log('✅ Created users resource');

  // 3. Create cars resource (protected API)
  const cars = await db.createResource({
    name: 'cars',
    attributes: {
      id: 'string|required',
      make: 'string|required',
      model: 'string|required',
      year: 'number|required',
      color: 'string|optional',
      price: 'number|optional'
    },
    behavior: 'body-overflow',
    timestamps: true
  });
  console.log('✅ Created cars resource');

  // 4. Configure API Plugin with JWT driver
  const apiPlugin = new ApiPlugin({
    port: 3100,
    verbose: true,

    // JWT Authentication driver
    auth: {
      driver: 'jwt', // Choose JWT driver
      resource: 'users', // Resource that manages authentication
      usernameField: 'email', // Field for username (default: 'email')
      passwordField: 'password', // Field for password (default: 'password')
      config: {
        jwtSecret: 'my-super-secret-jwt-key-256-bits', // Required for JWT
        jwtExpiresIn: '7d', // Token expiration (default: 7d)
        allowRegistration: true // Enable /auth/register (default: true)
      }
    },

    // Resource configuration
    resources: {
      cars: {
        auth: true, // Require authentication for cars
        methods: ['GET', 'POST', 'PUT', 'DELETE']
      },
      users: {
        auth: false, // Public read access for users list
        methods: ['GET']
      }
    },

    docs: {
      enabled: true,
      ui: 'redoc'
    }
  });

  await db.usePlugin(apiPlugin);
  console.log('✅ API Plugin installed with JWT authentication');
  console.log('\n📡 Server running on http://localhost:3100');
  console.log('📚 API Docs: http://localhost:3100/docs');

  // 5. Demo - Using the API
  console.log('\n--- API Usage Demo ---\n');

  // Register a new user
  console.log('1️⃣ Registering new user...');
  const registerResponse = await fetch('http://localhost:3100/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'john@example.com',
      password: 'SecurePass123!',
      name: 'John Doe',
      role: 'admin'
    })
  });

  const registerData = await registerResponse.json();
  console.log('✅ User registered:', registerData.data.email);
  console.log('🔑 JWT Token:', registerData.data.token.substring(0, 30) + '...');

  const token = registerData.data.token;

  // Login to get fresh token
  console.log('\n2️⃣ Logging in...');
  const loginResponse = await fetch('http://localhost:3100/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'john@example.com',
      password: 'SecurePass123!'
    })
  });

  const loginData = await loginResponse.json();
  console.log('✅ Login successful');
  console.log('🔑 New JWT Token:', loginData.data.token.substring(0, 30) + '...');

  const newToken = loginData.data.token;

  // Try accessing protected resource without auth (should fail)
  console.log('\n3️⃣ Attempting to access protected /cars without auth...');
  const unauthorizedResponse = await fetch('http://localhost:3100/cars');
  const unauthorizedData = await unauthorizedResponse.json();
  console.log('❌ Unauthorized:', unauthorizedData.error.message);

  // Access protected resource with valid token
  console.log('\n4️⃣ Creating car with valid JWT token...');
  const createCarResponse = await fetch('http://localhost:3100/cars', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${newToken}`
    },
    body: JSON.stringify({
      make: 'Tesla',
      model: 'Model 3',
      year: 2024,
      color: 'Blue',
      price: 45000
    })
  });

  const carData = await createCarResponse.json();
  console.log('✅ Car created:', carData.data.make, carData.data.model);

  // List cars with auth
  console.log('\n5️⃣ Listing cars with valid JWT token...');
  const listCarsResponse = await fetch('http://localhost:3100/cars', {
    headers: {
      'Authorization': `Bearer ${newToken}`
    }
  });

  const carsData = await listCarsResponse.json();
  console.log(`✅ Found ${carsData.data.length} car(s)`);
  carsData.data.forEach(car => {
    console.log(`   - ${car.year} ${car.make} ${car.model} (${car.color})`);
  });

  // Access public resource (no auth needed)
  console.log('\n6️⃣ Accessing public /users endpoint (no auth)...');
  const usersResponse = await fetch('http://localhost:3100/users');
  const usersData = await usersResponse.json();
  console.log(`✅ Found ${usersData.data.length} user(s) (public access)`);

  // Cleanup
  console.log('\n🧹 Cleaning up...');
  await apiPlugin.stop();
  await db.disconnect();
  console.log('✅ Done!');
}

main().catch(console.error);
