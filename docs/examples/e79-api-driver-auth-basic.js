/**
 * Example 79: API Plugin - Basic Authentication (Driver-Based)
 *
 * Demonstrates:
 * - Driver-based authentication system with HTTP Basic Auth
 * - Configurable resource for auth management
 * - Custom username/password fields
 * - Credentials sent in every request via Authorization header
 * - Protected vs public resources
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';

async function main() {
  console.log('Example 79: Basic Authentication with Driver-Based Auth\n');

  // 1. Create database
  const db = new Database({
    connection: 'memory://',
    verbose: false
  });

  await db.connect();
  console.log('✅ Connected to database');

  // 2. Create accounts resource (custom name for auth)
  const accounts = await db.createResource({
    name: 'accounts',
    attributes: {
      id: 'string|required',
      username: 'string|required', // Custom username field
      secret: 'secret|required', // Custom password field
      fullName: 'string|optional',
      department: 'string|optional',
      active: 'boolean|default:true'
    },
    behavior: 'body-overflow',
    timestamps: true
  });
  console.log('✅ Created accounts resource');

  // 3. Create products resource (protected API)
  const products = await db.createResource({
    name: 'products',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      category: 'string|required',
      price: 'number|required',
      stock: 'number|optional',
      description: 'string|optional'
    },
    behavior: 'body-overflow',
    timestamps: true
  });
  console.log('✅ Created products resource');

  // 4. Configure API Plugin with Basic Auth driver
  const apiPlugin = new ApiPlugin({
    port: 3101,
    verbose: true,

    // Basic Authentication driver (driver-level field configuration)
    auth: {
      driver: {
        driver: 'basic', // Choose Basic Auth driver
        config: {
          realm: 'Product Management API', // Custom auth realm
          passphrase: 'encryption-key', // For password encryption
          usernameField: 'username', // 🎯 Custom username field (at driver level)
          passwordField: 'secret' // 🎯 Custom password field (at driver level)
        }
      },
      resource: 'accounts' // Resource that manages authentication
    },

    // Resource configuration
    resources: {
      products: {
        auth: true, // Require authentication for products
        methods: ['GET', 'POST', 'PUT', 'DELETE']
      },
      accounts: {
        auth: false, // Public read access for accounts list
        methods: ['GET']
      }
    },

    docs: {
      enabled: true,
      ui: 'redoc'
    }
  });

  await db.usePlugin(apiPlugin);
  console.log('✅ API Plugin installed with Basic authentication');
  console.log('\n📡 Server running on http://localhost:3101');
  console.log('📚 API Docs: http://localhost:3101/docs');

  // 5. Demo - Using the API
  console.log('\n--- API Usage Demo ---\n');

  // Register a new account
  console.log('1️⃣ Registering new account...');
  const registerResponse = await fetch('http://localhost:3101/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'alice',
      secret: 'AliceSecure123!',
      fullName: 'Alice Johnson',
      department: 'Engineering'
    })
  });

  const registerData = await registerResponse.json();
  console.log('✅ Account registered:', registerData.data.username);
  console.log('👤 Full name:', registerData.data.fullName);

  // Create Basic Auth header
  const credentials = Buffer.from('alice:AliceSecure123!').toString('base64');
  const authHeader = `Basic ${credentials}`;
  console.log('🔑 Basic Auth header created:', authHeader.substring(0, 30) + '...');

  // Try accessing protected resource without auth (should fail)
  console.log('\n2️⃣ Attempting to access protected /products without auth...');
  const unauthorizedResponse = await fetch('http://localhost:3101/products');
  const unauthorizedData = await unauthorizedResponse.json();
  console.log('❌ Unauthorized:', unauthorizedData.error.message);
  console.log('   Response includes WWW-Authenticate header for Basic realm');

  // Try with wrong credentials (should fail)
  console.log('\n3️⃣ Attempting with wrong credentials...');
  const wrongCredentials = Buffer.from('alice:WrongPassword').toString('base64');
  const wrongResponse = await fetch('http://localhost:3101/products', {
    headers: {
      'Authorization': `Basic ${wrongCredentials}`
    }
  });
  const wrongData = await wrongResponse.json();
  console.log('❌ Invalid credentials:', wrongData.error.message);

  // Access protected resource with valid credentials
  console.log('\n4️⃣ Creating product with valid Basic Auth...');
  const createProductResponse = await fetch('http://localhost:3101/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    },
    body: JSON.stringify({
      name: 'Laptop',
      category: 'Electronics',
      price: 1299.99,
      stock: 50,
      description: 'High-performance laptop for professionals'
    })
  });

  const productData = await createProductResponse.json();
  console.log('✅ Product created:', productData.data.name);
  console.log('   Category:', productData.data.category);
  console.log('   Price: $' + productData.data.price);

  // List products with auth
  console.log('\n5️⃣ Listing products with valid Basic Auth...');
  const listProductsResponse = await fetch('http://localhost:3101/products', {
    headers: {
      'Authorization': authHeader
    }
  });

  const productsData = await listProductsResponse.json();
  console.log(`✅ Found ${productsData.data.length} product(s)`);
  productsData.data.forEach(product => {
    console.log(`   - ${product.name} (${product.category}) - $${product.price}`);
  });

  // Update product with auth
  console.log('\n6️⃣ Updating product stock...');
  const productId = productData.data.id;
  const updateResponse = await fetch(`http://localhost:3101/products/${productId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    },
    body: JSON.stringify({
      stock: 45 // Sold 5 units
    })
  });

  const updatedProduct = await updateResponse.json();
  console.log('✅ Stock updated:', updatedProduct.data.stock, 'units remaining');

  // Access public resource (no auth needed)
  console.log('\n7️⃣ Accessing public /accounts endpoint (no auth)...');
  const accountsResponse = await fetch('http://localhost:3101/accounts');
  const accountsData = await accountsResponse.json();
  console.log(`✅ Found ${accountsData.data.length} account(s) (public access)`);
  accountsData.data.forEach(acc => {
    console.log(`   - ${acc.username} (${acc.fullName || 'N/A'})`);
  });

  // Create another account for demo
  console.log('\n8️⃣ Registering second account...');
  const register2Response = await fetch('http://localhost:3101/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'bob',
      secret: 'BobSecure456!',
      fullName: 'Bob Smith',
      department: 'Sales'
    })
  });

  const register2Data = await register2Response.json();
  console.log('✅ Account registered:', register2Data.data.username);

  // Access with new user's credentials
  const bobCredentials = Buffer.from('bob:BobSecure456!').toString('base64');
  const bobAuthHeader = `Basic ${bobCredentials}`;

  const bobProductsResponse = await fetch('http://localhost:3101/products', {
    headers: {
      'Authorization': bobAuthHeader
    }
  });

  const bobProducts = await bobProductsResponse.json();
  console.log(`✅ Bob can also access products: ${bobProducts.data.length} product(s)`);

  // Cleanup
  console.log('\n🧹 Cleaning up...');
  await apiPlugin.stop();
  await db.disconnect();
  console.log('✅ Done!');
}

main().catch(console.error);
