/**
 * Example 80: API Plugin - Custom Routes (moleculer-js style)
 *
 * Demonstrates:
 * - Plugin-level custom routes (mounted at root)
 * - Resource-level custom routes (nested under resource path)
 * - Route key format: 'METHOD /path'
 * - Context access (database, resource, plugins)
 * - Integration with standard CRUD endpoints
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';

async function main() {
  console.log('Example 80: Custom Routes (Plugin + Resource Level)\n');

  // 1. Create database
  const db = new Database({
    connection: 'memory://',
    verbose: false
  });

  await db.connect();
  console.log('✅ Connected to database');

  // 2. Create users resource
  const users = await db.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      username: 'string|required',
      email: 'string|required|email',
      status: 'string|optional',
      loginCount: 'number|default:0',
      lastLoginAt: 'string|optional'
    },
    behavior: 'body-overflow',
    timestamps: true
  });
  console.log('✅ Created users resource');

  // 3. Create events resource
  const events = await db.createResource({
    name: 'events',
    attributes: {
      id: 'string|required',
      type: 'string|required',
      userId: 'string|optional',
      action: 'string|required',
      metadata: 'object|optional',
      timestamp: 'string|required'
    },
    behavior: 'body-overflow',
    timestamps: true
  });
  console.log('✅ Created events resource');

  // 4. Configure API Plugin with custom routes
  const apiPlugin = new ApiPlugin({
    port: 3102,
    verbose: true,

    // Plugin-level custom routes (mounted at root)
    routes: {
      // Health check endpoint
      'GET /health': async (c, ctx) => {
        const { database } = ctx;

        return c.json({
          success: true,
          data: {
            status: 'healthy',
            uptime: process.uptime(),
            resources: Object.keys(database.resources).length,
            timestamp: new Date().toISOString()
          }
        });
      },

      // Webhook endpoint
      'POST /webhook': async (c, ctx) => {
        const payload = await c.req.json();
        const { database } = ctx;

        // Log webhook to events
        await database.resources.events.insert({
          type: 'webhook',
          action: payload.action || 'unknown',
          metadata: payload,
          timestamp: new Date().toISOString()
        });

        return c.json({
          success: true,
          data: {
            message: 'Webhook received',
            eventId: payload.id
          }
        });
      },

      // Batch insert endpoint
      'POST /batch/users': async (c, ctx) => {
        const users = await c.req.json();
        const { database } = ctx;

        const inserted = [];
        for (const userData of users) {
          const user = await database.resources.users.insert(userData);
          inserted.push(user);
        }

        return c.json({
          success: true,
          data: {
            count: inserted.length,
            users: inserted
          }
        });
      },

      // Stats endpoint
      'GET /stats': async (c, ctx) => {
        const { database } = ctx;

        const userCount = (await database.resources.users.list()).length;
        const eventCount = (await database.resources.events.list()).length;

        return c.json({
          success: true,
          data: {
            users: userCount,
            events: eventCount,
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
          }
        });
      }
    },

    // Resource configuration with custom routes
    resources: {
      users: {
        auth: false,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],

        // Resource-level custom routes (nested under /users)
        routes: {
          // Activate user
          'POST /:id/activate': async (c, ctx) => {
            const userId = c.req.param('id');
            const { resource, database } = ctx;

            await resource.update(userId, {
              status: 'active',
              updatedAt: new Date().toISOString()
            });

            // Log event
            await database.resources.events.insert({
              type: 'user_action',
              userId,
              action: 'activate',
              timestamp: new Date().toISOString()
            });

            return c.json({
              success: true,
              data: {
                message: `User ${userId} activated`,
                userId
              }
            });
          },

          // Deactivate user
          'POST /:id/deactivate': async (c, ctx) => {
            const userId = c.req.param('id');
            const { resource, database } = ctx;

            await resource.update(userId, {
              status: 'inactive',
              updatedAt: new Date().toISOString()
            });

            // Log event
            await database.resources.events.insert({
              type: 'user_action',
              userId,
              action: 'deactivate',
              timestamp: new Date().toISOString()
            });

            return c.json({
              success: true,
              data: {
                message: `User ${userId} deactivated`,
                userId
              }
            });
          },

          // Simulate login (increment counter)
          'POST /:id/login': async (c, ctx) => {
            const userId = c.req.param('id');
            const { resource, database } = ctx;

            const user = await resource.get(userId);

            await resource.update(userId, {
              loginCount: (user.loginCount || 0) + 1,
              lastLoginAt: new Date().toISOString()
            });

            // Log event
            await database.resources.events.insert({
              type: 'user_action',
              userId,
              action: 'login',
              timestamp: new Date().toISOString()
            });

            return c.json({
              success: true,
              data: {
                message: 'Login recorded',
                loginCount: user.loginCount + 1
              }
            });
          },

          // Get user stats
          'GET /:id/stats': async (c, ctx) => {
            const userId = c.req.param('id');
            const { resource, database } = ctx;

            const user = await resource.get(userId);
            const userEvents = await database.resources.events.query({ userId });

            return c.json({
              success: true,
              data: {
                userId,
                username: user.username,
                loginCount: user.loginCount || 0,
                lastLoginAt: user.lastLoginAt || null,
                totalEvents: userEvents.length,
                status: user.status || 'unknown'
              }
            });
          }
        }
      },

      events: {
        auth: false,
        methods: ['GET'] // Read-only for events
      }
    },

    docs: {
      enabled: true,
      ui: 'redoc'
    }
  });

  await db.usePlugin(apiPlugin);
  console.log('✅ API Plugin installed with custom routes');
  console.log('\n📡 Server running on http://localhost:3102');
  console.log('📚 API Docs: http://localhost:3102/docs');

  // 5. Demo - Using the API
  console.log('\n--- API Usage Demo ---\n');

  // Test plugin-level health endpoint
  console.log('1️⃣ Testing plugin-level /health endpoint...');
  const healthResponse = await fetch('http://localhost:3102/health');
  const healthData = await healthResponse.json();
  console.log('✅ Health check:', healthData.data.status);
  console.log('   Resources:', healthData.data.resources);

  // Create a user (standard CRUD)
  console.log('\n2️⃣ Creating user via standard POST /users...');
  const createUserResponse = await fetch('http://localhost:3102/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'alice',
      email: 'alice@example.com',
      status: 'pending'
    })
  });

  const userData = await createUserResponse.json();
  const userId = userData.data.id;
  console.log('✅ User created:', userData.data.username);
  console.log('   Status:', userData.data.status);

  // Use custom route to activate user
  console.log('\n3️⃣ Activating user via custom POST /users/:id/activate...');
  const activateResponse = await fetch(`http://localhost:3102/users/${userId}/activate`, {
    method: 'POST'
  });

  const activateData = await activateResponse.json();
  console.log('✅ User activated:', activateData.data.message);

  // Simulate login via custom route
  console.log('\n4️⃣ Simulating login via custom POST /users/:id/login...');
  const loginResponse = await fetch(`http://localhost:3102/users/${userId}/login`, {
    method: 'POST'
  });

  const loginData = await loginResponse.json();
  console.log('✅ Login recorded:', loginData.data.message);
  console.log('   Login count:', loginData.data.loginCount);

  // Login again
  console.log('\n5️⃣ Logging in again...');
  const login2Response = await fetch(`http://localhost:3102/users/${userId}/login`, {
    method: 'POST'
  });
  const login2Data = await login2Response.json();
  console.log('✅ Login recorded:', login2Data.data.loginCount, 'total logins');

  // Get user stats via custom route
  console.log('\n6️⃣ Getting user stats via custom GET /users/:id/stats...');
  const statsResponse = await fetch(`http://localhost:3102/users/${userId}/stats`);
  const statsData = await statsResponse.json();
  console.log('✅ User stats:');
  console.log('   Username:', statsData.data.username);
  console.log('   Login count:', statsData.data.loginCount);
  console.log('   Status:', statsData.data.status);
  console.log('   Total events:', statsData.data.totalEvents);

  // Batch insert via plugin-level route
  console.log('\n7️⃣ Batch inserting users via custom POST /batch/users...');
  const batchResponse = await fetch('http://localhost:3102/batch/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([
      { username: 'bob', email: 'bob@example.com' },
      { username: 'charlie', email: 'charlie@example.com' }
    ])
  });

  const batchData = await batchResponse.json();
  console.log('✅ Batch insert:', batchData.data.count, 'users created');

  // Get global stats
  console.log('\n8️⃣ Getting global stats via custom GET /stats...');
  const globalStatsResponse = await fetch('http://localhost:3102/stats');
  const globalStatsData = await globalStatsResponse.json();
  console.log('✅ Global stats:');
  console.log('   Total users:', globalStatsData.data.users);
  console.log('   Total events:', globalStatsData.data.events);

  // Trigger webhook
  console.log('\n9️⃣ Triggering webhook via custom POST /webhook...');
  const webhookResponse = await fetch('http://localhost:3102/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'webhook-123',
      action: 'payment_received',
      amount: 99.99
    })
  });

  const webhookData = await webhookResponse.json();
  console.log('✅ Webhook received:', webhookData.data.message);

  // List events
  console.log('\n🔟 Listing all events via standard GET /events...');
  const eventsResponse = await fetch('http://localhost:3102/events');
  const eventsData = await eventsResponse.json();
  console.log(`✅ Found ${eventsData.data.length} events:`);
  eventsData.data.forEach((event, i) => {
    console.log(`   ${i + 1}. ${event.type} - ${event.action} (${event.userId || 'system'})`);
  });

  // Cleanup
  console.log('\n🧹 Cleaning up...');
  await apiPlugin.stop();
  await db.disconnect();
  console.log('✅ Done!');
}

main().catch(console.error);
