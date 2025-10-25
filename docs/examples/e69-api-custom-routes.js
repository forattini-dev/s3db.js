/**
 * Example 69: API Plugin - Custom Routes
 *
 * Demonstrates how to add custom routes to resources in the API Plugin,
 * inspired by Moleculer.js patterns.
 *
 * Custom routes are defined in the `api` field of the resource configuration
 * and receive the full Hono context.
 *
 * Requirements:
 * - pnpm add hono @hono/node-server @hono/swagger-ui
 *
 * Run: node docs/examples/e69-api-custom-routes.js
 * Then test:
 *   curl http://localhost:3000/v1/products/healthcheck
 *   curl http://localhost:3000/v1/products/stats
 *   curl -X POST http://localhost:3000/v1/products/bulk -H "Content-Type: application/json" -d '[{"name":"Product 1","price":100},{"name":"Product 2","price":200}]'
 */

import { Database, ApiPlugin } from '../../src/index.js';

console.log('='.repeat(60));
console.log('Example 69: API Plugin - Custom Routes');
console.log('='.repeat(60));

// Create in-memory database
const db = new Database({
  client: 'memory',
  verbose: false
});

// Create products resource with custom API routes
const products = await db.createResource({
  name: 'products',
  attributes: {
    name: 'string|required',
    price: 'number|required',
    category: 'string|optional',
    inStock: 'boolean|default:true'
  },
  timestamps: true,

  // Custom API routes (inspired by Moleculer.js)
  api: {
    // Simple healthcheck route
    'GET /healthcheck': async (c) => {
      return {
        status: 'ok',
        resource: 'products',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      };
    },

    // Get statistics about products
    'GET /stats': async (c, { resource }) => {
      const allProducts = await resource.list();

      const stats = {
        total: allProducts.length,
        inStock: allProducts.filter(p => p.inStock).length,
        outOfStock: allProducts.filter(p => !p.inStock).length,
        averagePrice: allProducts.length > 0
          ? allProducts.reduce((sum, p) => sum + p.price, 0) / allProducts.length
          : 0,
        categories: [...new Set(allProducts.map(p => p.category).filter(Boolean))],
        timestamp: new Date().toISOString()
      };

      return stats;
    },

    // Bulk insert products
    'async POST /bulk': async (c, { resource }) => {
      const products = await c.req.json();

      if (!Array.isArray(products)) {
        return c.json({
          success: false,
          error: {
            message: 'Request body must be an array of products',
            code: 'INVALID_BODY'
          }
        }, 400);
      }

      const results = [];
      for (const product of products) {
        try {
          const created = await resource.insert(product);
          results.push({ success: true, id: created.id, name: created.name });
        } catch (error) {
          results.push({ success: false, error: error.message, name: product.name });
        }
      }

      const successCount = results.filter(r => r.success).length;

      return {
        message: `Bulk insert completed: ${successCount}/${products.length} succeeded`,
        results,
        timestamp: new Date().toISOString()
      };
    },

    // Search products by name
    'GET /search': async (c, { resource }) => {
      const query = c.req.query('q') || '';
      const minPrice = parseFloat(c.req.query('minPrice') || 0);
      const maxPrice = parseFloat(c.req.query('maxPrice') || Infinity);

      if (!query) {
        return c.json({
          success: false,
          error: {
            message: 'Query parameter "q" is required',
            code: 'MISSING_QUERY'
          }
        }, 400);
      }

      const allProducts = await resource.list();

      const results = allProducts.filter(p => {
        const matchesName = p.name.toLowerCase().includes(query.toLowerCase());
        const matchesPrice = p.price >= minPrice && p.price <= maxPrice;
        return matchesName && matchesPrice;
      });

      return {
        query,
        filters: { minPrice, maxPrice },
        results,
        count: results.length
      };
    },

    // Update stock status
    'PATCH /:id/stock': async (c, { resource }) => {
      const id = c.req.param('id');
      const { inStock } = await c.req.json();

      if (typeof inStock !== 'boolean') {
        return c.json({
          success: false,
          error: {
            message: 'Field "inStock" must be a boolean',
            code: 'INVALID_FIELD'
          }
        }, 400);
      }

      const product = await resource.get(id);
      if (!product) {
        return c.json({
          success: false,
          error: {
            message: `Product ${id} not found`,
            code: 'NOT_FOUND'
          }
        }, 404);
      }

      const updated = await resource.update(id, { inStock });

      return {
        message: `Stock status updated for ${updated.name}`,
        product: updated
      };
    },

    // Get products by category
    'GET /by-category/:category': async (c, { resource }) => {
      const category = c.req.param('category');

      const allProducts = await resource.list();
      const filtered = allProducts.filter(p => p.category === category);

      return {
        category,
        products: filtered,
        count: filtered.length
      };
    },

    // Price range endpoint
    'GET /price-range': async (c, { resource }) => {
      const allProducts = await resource.list();

      if (allProducts.length === 0) {
        return {
          min: 0,
          max: 0,
          avg: 0,
          count: 0
        };
      }

      const prices = allProducts.map(p => p.price);

      return {
        min: Math.min(...prices),
        max: Math.max(...prices),
        avg: prices.reduce((sum, p) => sum + p, 0) / prices.length,
        median: prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)],
        count: prices.length
      };
    }
  }
});

console.log('\n📦 Products resource created with custom API routes');

// Insert some sample data
const sampleProducts = [
  { name: 'Laptop', price: 1200, category: 'Electronics', inStock: true },
  { name: 'Mouse', price: 25, category: 'Electronics', inStock: true },
  { name: 'Keyboard', price: 75, category: 'Electronics', inStock: false },
  { name: 'Monitor', price: 350, category: 'Electronics', inStock: true },
  { name: 'Desk Chair', price: 250, category: 'Furniture', inStock: true },
  { name: 'Standing Desk', price: 600, category: 'Furniture', inStock: false },
  { name: 'Notebook', price: 5, category: 'Stationery', inStock: true },
  { name: 'Pen Set', price: 15, category: 'Stationery', inStock: true }
];

for (const product of sampleProducts) {
  await products.insert(product);
}

console.log(`✅ Inserted ${sampleProducts.length} sample products`);

// Install and start API Plugin
const apiPlugin = new ApiPlugin({
  port: 3000,
  host: '0.0.0.0',
  verbose: true,
  docs: { enabled: true, ui: 'redoc' },
  cors: { enabled: true },
  logging: { enabled: true },
  resources: {
    products: {
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      auth: false // No auth for this example
    }
  }
});

await db.install(apiPlugin);
await db.start();

console.log('\n✅ API Server started!');
console.log('='.repeat(60));
console.log('\n📚 Available Custom Routes:');
console.log('   GET  http://localhost:3000/v1/products/healthcheck');
console.log('   GET  http://localhost:3000/v1/products/stats');
console.log('   POST http://localhost:3000/v1/products/bulk');
console.log('   GET  http://localhost:3000/v1/products/search?q=laptop&minPrice=100&maxPrice=2000');
console.log('   PATCH http://localhost:3000/v1/products/:id/stock');
console.log('   GET  http://localhost:3000/v1/products/by-category/:category');
console.log('   GET  http://localhost:3000/v1/products/price-range');
console.log('\n📚 Standard CRUD Routes:');
console.log('   GET    http://localhost:3000/v1/products (list all)');
console.log('   GET    http://localhost:3000/v1/products/:id (get one)');
console.log('   POST   http://localhost:3000/v1/products (create)');
console.log('   PUT    http://localhost:3000/v1/products/:id (update)');
console.log('   DELETE http://localhost:3000/v1/products/:id (delete)');
console.log('\n📖 API Documentation:');
console.log('   http://localhost:3000/docs');
console.log('\n🔍 Test Commands:');
console.log('\n   # Healthcheck');
console.log('   curl http://localhost:3000/v1/products/healthcheck');
console.log('\n   # Get statistics');
console.log('   curl http://localhost:3000/v1/products/stats');
console.log('\n   # Search products');
console.log('   curl "http://localhost:3000/v1/products/search?q=laptop"');
console.log('\n   # Get by category');
console.log('   curl http://localhost:3000/v1/products/by-category/Electronics');
console.log('\n   # Price range');
console.log('   curl http://localhost:3000/v1/products/price-range');
console.log('\n   # Bulk insert');
console.log('   curl -X POST http://localhost:3000/v1/products/bulk \\');
console.log('     -H "Content-Type: application/json" \\');
console.log('     -d \'[{"name":"Product 1","price":100,"category":"Test"}]\'');
console.log('\n   # Update stock status');
console.log('   curl -X PATCH http://localhost:3000/v1/products/PRODUCT_ID/stock \\');
console.log('     -H "Content-Type: application/json" \\');
console.log('     -d \'{"inStock":false}\'');
console.log('\n='.repeat(60));
console.log('\nℹ️  Press Ctrl+C to stop the server\n');

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down...');
  await db.stop();
  console.log('✅ Server stopped');
  process.exit(0);
});
