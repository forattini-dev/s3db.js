/**
 * Example 48: Prometheus Metrics Export
 *
 * Demonstrates Prometheus metrics integration with MetricsPlugin:
 * - Integrated mode (with API Plugin on same port)
 * - Standalone mode (separate metrics server)
 * - Exported metrics format
 * - Testing metrics endpoints
 */

import { Database, tryFn } from '../../src/index.js';
import { MetricsPlugin } from '../../src/plugins/metrics.plugin.js';
import { APIPlugin } from '../../src/plugins/api/index.js';

// ============================================================================
// PART 1: Integrated Mode (API Plugin + MetricsPlugin)
// ============================================================================

console.log('\n🔥 PART 1: Integrated Mode (API Plugin + MetricsPlugin)\n');

const database1 = new Database({
  bucketName: 'test-metrics-integrated',
  region: 'us-east-1',
  endpoint: 'http://localhost:4566'
});

// Create MetricsPlugin (will auto-detect API Plugin and integrate)
const metricsPlugin1 = new MetricsPlugin({
  prometheus: {
    enabled: true,
    mode: 'auto', // Auto-detects API Plugin and uses integrated mode
    path: '/metrics'
  }
});

// Create API Plugin
const apiPlugin1 = new APIPlugin({
  port: 3000,
  resources: {
    users: {
      methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
  }
});

database1.usePlugin(metricsPlugin1);
database1.usePlugin(apiPlugin1);

// Create users resource
const users1 = await database1.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|email',
    age: 'number'
  }
});

console.log('✅ Database initialized with API Plugin + MetricsPlugin');
console.log(`📊 Metrics available at: http://localhost:3000/metrics`);
console.log(`🌐 API available at: http://localhost:3000/v1/users`);

// Generate some operations to create metrics
console.log('\n📝 Generating operations to create metrics...\n');

const operations = [];
for (let i = 0; i < 10; i++) {
  operations.push(
    users1.insert({
      name: `User ${i}`,
      email: `user${i}@example.com`,
      age: 20 + i
    })
  );
}

// Execute all inserts in parallel
await Promise.all(operations);
console.log('✅ Inserted 10 users');

// Perform some queries
await users1.list({ limit: 5 });
await users1.query({ age: 25 });
await users1.count();

console.log('✅ Performed queries and count operations');

// Wait for API server to be ready
await new Promise(resolve => setTimeout(resolve, 1000));

// Fetch metrics from integrated endpoint
console.log('\n📊 Fetching metrics from integrated endpoint...\n');
const [ok1, err1, response1] = await tryFn(async () => {
  const res = await fetch('http://localhost:3000/metrics');
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.text();
});

if (ok1) {
  console.log('✅ Metrics endpoint response:\n');
  console.log(response1);
} else {
  console.error('❌ Failed to fetch metrics:', err1.message);
}

// Test health endpoints
console.log('\n🏥 Testing health endpoints...\n');

const [ok2, err2, health] = await tryFn(async () => {
  const res = await fetch('http://localhost:3000/health');
  return res.json();
});

if (ok2) {
  console.log('✅ Generic health check:', JSON.stringify(health, null, 2));
}

const [ok3, err3, live] = await tryFn(async () => {
  const res = await fetch('http://localhost:3000/health/live');
  return res.json();
});

if (ok3) {
  console.log('✅ Liveness probe:', JSON.stringify(live, null, 2));
}

const [ok4, err4, ready] = await tryFn(async () => {
  const res = await fetch('http://localhost:3000/health/ready');
  return res.json();
});

if (ok4) {
  console.log('✅ Readiness probe:', JSON.stringify(ready, null, 2));
}

// Clean up
await apiPlugin1.stop();
console.log('\n✅ API Plugin stopped\n');

// ============================================================================
// PART 2: Standalone Mode (MetricsPlugin only)
// ============================================================================

console.log('\n🔥 PART 2: Standalone Mode (MetricsPlugin only)\n');

const database2 = new Database({
  bucketName: 'test-metrics-standalone',
  region: 'us-east-1',
  endpoint: 'http://localhost:4566'
});

// Create MetricsPlugin in standalone mode (separate HTTP server)
const metricsPlugin2 = new MetricsPlugin({
  prometheus: {
    enabled: true,
    mode: 'standalone', // Explicitly use standalone mode
    port: 9090,
    path: '/metrics'
  }
});

database2.usePlugin(metricsPlugin2);

// Create products resource
const products = await database2.createResource({
  name: 'products',
  attributes: {
    name: 'string|required',
    price: 'number',
    category: 'string'
  }
});

console.log('✅ Database initialized with standalone MetricsPlugin');
console.log(`📊 Metrics available at: http://localhost:9090/metrics`);

// Generate some operations
console.log('\n📝 Generating operations...\n');

const productOperations = [];
for (let i = 0; i < 15; i++) {
  productOperations.push(
    products.insert({
      name: `Product ${i}`,
      price: 10 + i,
      category: i % 2 === 0 ? 'Electronics' : 'Books'
    })
  );
}

await Promise.all(productOperations);
console.log('✅ Inserted 15 products');

// Perform some queries
await products.query({ category: 'Electronics' });
await products.list({ limit: 10 });
await products.count();

console.log('✅ Performed queries and count operations');

// Wait for metrics server to be ready
await new Promise(resolve => setTimeout(resolve, 1000));

// Fetch metrics from standalone endpoint
console.log('\n📊 Fetching metrics from standalone endpoint...\n');
const [ok5, err5, response2] = await tryFn(async () => {
  const res = await fetch('http://localhost:9090/metrics');
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.text();
});

if (ok5) {
  console.log('✅ Standalone metrics endpoint response:\n');
  console.log(response2);

  // Parse and display some key metrics
  console.log('\n📈 Key Metrics:\n');
  const lines = response2.split('\n');
  const operationsTotal = lines.find(l => l.startsWith('s3db_operations_total{operation="insert",resource="products"}'));
  const uptime = lines.find(l => l.startsWith('s3db_uptime_seconds'));
  const resourcesTotal = lines.find(l => l.startsWith('s3db_resources_total'));

  if (operationsTotal) console.log(`  Insert operations: ${operationsTotal.split(' ')[1]}`);
  if (uptime) console.log(`  Uptime: ${uptime.split(' ')[1]}s`);
  if (resourcesTotal) console.log(`  Resources tracked: ${resourcesTotal.split(' ')[1]}`);
} else {
  console.error('❌ Failed to fetch metrics:', err5.message);
}

// Get metrics programmatically
console.log('\n📊 Programmatic metrics access:\n');
const metricsText = await metricsPlugin2.getPrometheusMetrics();
console.log('✅ Got metrics via getPrometheusMetrics()');

// Display summary statistics
const summary = metricsPlugin2.getSummary();
console.log('\n📊 Summary Statistics:\n');
console.log(JSON.stringify(summary, null, 2));

// Clean up
await metricsPlugin2.stop();
console.log('\n✅ MetricsPlugin stopped\n');

// ============================================================================
// PART 3: Custom Prometheus Configuration
// ============================================================================

console.log('\n🔥 PART 3: Custom Prometheus Configuration\n');

const database3 = new Database({
  bucketName: 'test-metrics-custom',
  region: 'us-east-1',
  endpoint: 'http://localhost:4566'
});

// Create MetricsPlugin with custom configuration
const metricsPlugin3 = new MetricsPlugin({
  trackOperations: ['insert', 'update', 'delete'], // Only track write operations
  trackResources: true,
  trackLatency: true,
  prometheus: {
    enabled: true,
    mode: 'standalone',
    port: 9091,
    path: '/custom-metrics',
    includeResourceLabels: true // Include detailed resource labels
  }
});

database3.usePlugin(metricsPlugin3);

const orders = await database3.createResource({
  name: 'orders',
  attributes: {
    orderId: 'string|required',
    amount: 'number',
    status: 'string'
  }
});

console.log('✅ Database initialized with custom MetricsPlugin configuration');
console.log(`📊 Custom metrics available at: http://localhost:9091/custom-metrics`);

// Generate operations
console.log('\n📝 Generating operations...\n');

for (let i = 0; i < 5; i++) {
  const record = await orders.insert({
    orderId: `ORD-${i}`,
    amount: 100 + i * 10,
    status: 'pending'
  });

  // Update some orders
  if (i % 2 === 0) {
    await orders.update(record.id, { status: 'completed' });
  }
}

console.log('✅ Inserted 5 orders and updated 3');

// Wait for server
await new Promise(resolve => setTimeout(resolve, 1000));

// Fetch custom metrics
console.log('\n📊 Fetching custom metrics...\n');
const [ok6, err6, response3] = await tryFn(async () => {
  const res = await fetch('http://localhost:9091/custom-metrics');
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.text();
});

if (ok6) {
  console.log('✅ Custom metrics endpoint response:\n');

  // Show only operation-related metrics (not all)
  const lines = response3.split('\n');
  const operationLines = lines.filter(l =>
    l.includes('s3db_operations_total') ||
    l.includes('s3db_operation_duration') ||
    (l.startsWith('#') && (l.includes('operations') || l.includes('duration')))
  );

  console.log(operationLines.join('\n'));
} else {
  console.error('❌ Failed to fetch custom metrics:', err6.message);
}

// Clean up
await metricsPlugin3.stop();
console.log('\n✅ Custom MetricsPlugin stopped\n');

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('📊 PROMETHEUS METRICS INTEGRATION SUMMARY');
console.log('='.repeat(80) + '\n');

console.log('✅ Demonstrated Features:');
console.log('   1. Integrated mode (API Plugin + MetricsPlugin on same port)');
console.log('   2. Standalone mode (separate metrics server)');
console.log('   3. Custom configuration (port, path, tracked operations)');
console.log('   4. Programmatic metrics access (getPrometheusMetrics())');
console.log('   5. Health check endpoints integration');
console.log('   6. Prometheus text-based exposition format');
console.log('');
console.log('📊 Exported Metrics:');
console.log('   - s3db_operations_total (counter)');
console.log('   - s3db_operation_duration_seconds (gauge)');
console.log('   - s3db_operation_errors_total (counter)');
console.log('   - s3db_uptime_seconds (gauge)');
console.log('   - s3db_resources_total (gauge)');
console.log('   - s3db_info (gauge)');
console.log('');
console.log('🔧 Kubernetes Integration:');
console.log('   - Use integrated mode for simplicity (same port as API)');
console.log('   - Use standalone mode for security/compliance requirements');
console.log('   - Configure ServiceMonitor or scrape configs');
console.log('   - Health probes: /health, /health/live, /health/ready');
console.log('');
console.log('📝 Next Steps:');
console.log('   - Configure Prometheus scrape targets');
console.log('   - Create Grafana dashboards');
console.log('   - Set up alerting rules');
console.log('   - Monitor performance in production');
console.log('');
console.log('='.repeat(80) + '\n');
