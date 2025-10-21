/**
 * Example 47 - API Plugin Basic Usage
 *
 * Demonstrates how to expose s3db.js resources as REST API endpoints
 * using the API Plugin with automatic versioning and validation.
 *
 * Prerequisites:
 * ```bash
 * pnpm add hono @hono/node-server @hono/swagger-ui
 * ```
 *
 * Features demonstrated:
 * - Automatic REST endpoint generation for resources
 * - Versioned API paths (e.g., /v1/cars, /v1/cars)
 * - CORS support
 * - Request logging
 * - Response compression
 * - Schema validation
 * - Rate limiting
 *
 * Endpoints created:
 * - GET     /v1/cars           → List all cars (with optional filtering via query params)
 * - GET     /v1/cars/:id       → Get car by ID
 * - POST    /v1/cars           → Create new car
 * - PUT     /v1/cars/:id       → Update car (full)
 * - PATCH   /v1/cars/:id       → Update car (partial)
 * - DELETE  /v1/cars/:id       → Delete car
 * - HEAD    /v1/cars           → Get statistics (count, version, schema fields in headers)
 * - OPTIONS /v1/cars           → Get resource metadata (schema, endpoints, allowed methods)
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api.plugin.js';

async function main() {
  console.log('🚀 API Plugin Example - Basic Usage\n');

  // Initialize database
  const database = new Database({
    bucket: 'api-plugin-example',
    useFakeS3: true
  });

  await database.connect();

  // Create cars resource
  console.log('Creating cars resource...');
  const cars = await database.createResource({
    name: 'cars',
    attributes: {
      id: 'string|required',
      brand: 'string|required|minlength:2',
      model: 'string|required',
      year: 'number|required|min:1900|max:2025',
      price: 'number|required|min:0',
      color: 'string|optional',
      inStock: 'boolean|default:true',
      features: 'array|items:string|optional'
    },
    behavior: 'body-overflow',
    timestamps: true
  });

  console.log('✅ Cars resource created\n');

  // Add API Plugin
  console.log('Starting API server...');
  const apiPlugin = new ApiPlugin({
    port: 3000,
    host: '0.0.0.0',
    verbose: true,

    // API Documentation
    docs: {
      enabled: true,
      title: 's3db.js Cars API',
      version: '1.0.0',
      description: 'Example REST API for managing cars inventory'
    },

    // Enable production features
    cors: {
      enabled: true,
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
    },

    rateLimit: {
      enabled: true,
      windowMs: 60000,      // 1 minute
      maxRequests: 100      // 100 requests per minute
    },

    logging: {
      enabled: true,
      format: ':method :path :status :response-time ms'
    },

    compression: {
      enabled: true,
      threshold: 1024       // Compress responses > 1KB
    },

    validation: {
      enabled: true,
      validateOnInsert: true,
      validateOnUpdate: true
    },

    // Configure resources
    resources: {
      cars: {
        auth: false,        // Public access (no authentication)
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
      }
    }
  });

  await database.usePlugin(apiPlugin);

  console.log('\n✅ API server running on http://localhost:3000');
  console.log('\n📋 Available endpoints:');
  console.log('  GET     http://localhost:3000/v1/cars');
  console.log('  GET     http://localhost:3000/v1/cars/:id');
  console.log('  POST    http://localhost:3000/v1/cars');
  console.log('  PUT     http://localhost:3000/v1/cars/:id');
  console.log('  PATCH   http://localhost:3000/v1/cars/:id');
  console.log('  DELETE  http://localhost:3000/v1/cars/:id');
  console.log('  HEAD    http://localhost:3000/v1/cars');
  console.log('  OPTIONS http://localhost:3000/v1/cars');
  console.log('\n🏥 Health Check endpoints (Kubernetes):');
  console.log('  GET     http://localhost:3000/health        - Generic health');
  console.log('  GET     http://localhost:3000/health/live   - Liveness probe');
  console.log('  GET     http://localhost:3000/health/ready  - Readiness probe');
  console.log('\n📚 Interactive API Documentation:');
  console.log('  http://localhost:3000/docs           - API Documentation (Redoc)');
  console.log('  http://localhost:3000/openapi.json   - OpenAPI spec');

  // Add some sample data
  console.log('\n📝 Adding sample data...');
  await cars.insert({
    id: 'car-1',
    brand: 'Toyota',
    model: 'Corolla',
    year: 2023,
    price: 25000,
    color: 'white',
    inStock: true,
    features: ['bluetooth', 'backup camera', 'cruise control']
  });

  await cars.insert({
    id: 'car-2',
    brand: 'Honda',
    model: 'Civic',
    year: 2024,
    price: 28000,
    color: 'blue',
    inStock: true,
    features: ['sunroof', 'leather seats', 'navigation']
  });

  await cars.insert({
    id: 'car-3',
    brand: 'Tesla',
    model: 'Model 3',
    year: 2024,
    price: 45000,
    color: 'black',
    inStock: false,
    features: ['autopilot', 'electric', 'premium audio']
  });

  console.log('✅ Sample data added (3 cars)\n');

  // Test API calls using fetch (simulating HTTP requests)
  console.log('🧪 Testing API endpoints...\n');

  try {
    // Test 1: List all cars
    console.log('1️⃣ GET /v1/cars');
    const listResponse = await fetch('http://localhost:3000/v1/cars');
    const listData = await listResponse.json();
    console.log(`   Status: ${listResponse.status}`);
    console.log(`   Found: ${listData.data.length} cars`);
    console.log(`   Total: ${listData.pagination.total}\n`);

    // Test 2: Get single car
    console.log('2️⃣ GET /v1/cars/car-1');
    const getResponse = await fetch('http://localhost:3000/v1/cars/car-1');
    const getData = await getResponse.json();
    console.log(`   Status: ${getResponse.status}`);
    console.log(`   Car: ${getData.data.brand} ${getData.data.model}\n`);

    // Test 3: Create new car
    console.log('3️⃣ POST /v1/cars');
    const createResponse = await fetch('http://localhost:3000/v1/cars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'car-4',
        brand: 'Ford',
        model: 'Mustang',
        year: 2024,
        price: 55000,
        color: 'red',
        features: ['v8 engine', 'performance package']
      })
    });
    const createData = await createResponse.json();
    console.log(`   Status: ${createResponse.status}`);
    console.log(`   Created: ${createData.data.id}\n`);

    // Test 4: Update car (partial)
    console.log('4️⃣ PATCH /v1/cars/car-1');
    const updateResponse = await fetch('http://localhost:3000/v1/cars/car-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price: 24000,
        inStock: false
      })
    });
    const updateData = await updateResponse.json();
    console.log(`   Status: ${updateResponse.status}`);
    console.log(`   Updated price: $${updateData.data.price}\n`);

    // Test 5: Filter cars via query string
    console.log('5️⃣ GET /v1/cars?inStock=true (filtering via query string)');
    const filterResponse = await fetch('http://localhost:3000/v1/cars?inStock=true');
    const filterData = await filterResponse.json();
    console.log(`   Status: ${filterResponse.status}`);
    console.log(`   In stock: ${filterData.data.length} cars\n`);

    // Test 6: Get statistics with HEAD
    console.log('6️⃣ HEAD /v1/cars (get statistics)');
    const headResponse = await fetch('http://localhost:3000/v1/cars', {
      method: 'HEAD'
    });
    console.log(`   Status: ${headResponse.status}`);
    console.log(`   X-Total-Count: ${headResponse.headers.get('X-Total-Count')}`);
    console.log(`   X-Resource-Version: ${headResponse.headers.get('X-Resource-Version')}`);
    console.log(`   X-Schema-Fields: ${headResponse.headers.get('X-Schema-Fields')}\n`);

    // Test 7: Get metadata with OPTIONS
    console.log('7️⃣ OPTIONS /v1/cars (get resource metadata)');
    const optionsResponse = await fetch('http://localhost:3000/v1/cars', {
      method: 'OPTIONS'
    });
    const optionsData = await optionsResponse.json();
    console.log(`   Status: ${optionsResponse.status}`);
    console.log(`   Resource: ${optionsData.resource}`);
    console.log(`   Version: ${optionsData.version}`);
    console.log(`   Total records: ${optionsData.totalRecords}`);
    console.log(`   Allowed methods: ${optionsData.allowedMethods.join(', ')}`);
    console.log(`   Schema fields: ${optionsData.schema.length}\n`);

    // Test 8: Validation error
    console.log('8️⃣ POST /v1/cars (invalid data)');
    const errorResponse = await fetch('http://localhost:3000/v1/cars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'car-5',
        brand: 'X',  // Too short (min:2)
        year: 1800   // Too old (min:1900)
      })
    });
    const errorData = await errorResponse.json();
    console.log(`   Status: ${errorResponse.status}`);
    console.log(`   Errors: ${errorData.error.details.errors.length}`);
    errorData.error.details.errors.forEach(err => {
      console.log(`   - ${err.field}: ${err.message}`);
    });
    console.log('');

    // Test 9: Health checks (Kubernetes probes)
    console.log('9️⃣ Health Check Endpoints:');

    // Liveness probe
    const liveResponse = await fetch('http://localhost:3000/health/live');
    const liveData = await liveResponse.json();
    console.log(`   /health/live: ${liveResponse.status} - ${liveData.data.status}`);

    // Readiness probe
    const readyResponse = await fetch('http://localhost:3000/health/ready');
    const readyData = await readyResponse.json();
    console.log(`   /health/ready: ${readyResponse.status} - ${readyData.data.status}`);
    console.log(`   Database connected: ${readyData.data.database.connected}`);
    console.log(`   Resources loaded: ${readyData.data.database.resources}`);

    // Generic health
    const healthResponse = await fetch('http://localhost:3000/health');
    const healthData = await healthResponse.json();
    console.log(`   /health: ${healthResponse.status} - ${healthData.data.status}`);
    console.log(`   Uptime: ${Math.floor(healthData.data.uptime)}s\n`);

  } catch (err) {
    console.error('Error testing API:', err.message);
  }

  console.log('\n✅ All tests completed!');
  console.log('\n💡 Try these commands in another terminal:');
  console.log('   curl http://localhost:3000/v1/cars');
  console.log('   curl http://localhost:3000/v1/cars/car-1');
  console.log('   curl http://localhost:3000/health/live');
  console.log('   curl http://localhost:3000/health/ready');
  console.log('   curl -I http://localhost:3000/v1/cars  # HEAD request');
  console.log('\n📖 Or open these URLs in your browser:');
  console.log('   http://localhost:3000/       - API info');
  console.log('   http://localhost:3000/docs   - Interactive docs (Swagger UI)');
  console.log('\n☸️  Kubernetes Health Probes:');
  console.log('   http://localhost:3000/health/live   - Liveness (restarts pod if fails)');
  console.log('   http://localhost:3000/health/ready  - Readiness (removes from LB if fails)');

  console.log('\n⏸️  Server is running. Press Ctrl+C to stop.');

  // Keep process alive
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Stopping server...');
    await apiPlugin.stop();
    await database.disconnect();
    console.log('✅ Server stopped');
    process.exit(0);
  });
}

main().catch(console.error);
