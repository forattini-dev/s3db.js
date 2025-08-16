#!/usr/bin/env node

/**
 * Plugins Integration Example
 * 
 * This example demonstrates how to use the plugins:
 * - StateMachinePlugin: Order processing workflow
 * - BackupPlugin: Automated database backups
 * - SchedulerPlugin: Scheduled maintenance tasks
 */

import { S3db } from '../src/index.js';
import { 
  StateMachinePlugin, 
  BackupPlugin, 
  SchedulerPlugin 
} from '../src/plugins/index.js';

async function main() {
  // Initialize S3DB with plugins
  const database = new S3db({
    connectionString: 's3://test:test@test-bucket/enterprise-demo'
  });

  // === STATE MACHINE PLUGIN ===
  const stateMachine = new StateMachinePlugin({
    stateMachines: {
      order_processing: {
        initialState: 'pending',
        states: {
          pending: {
            on: {
              CONFIRM: 'confirmed',
              CANCEL: 'cancelled'
            },
            meta: { color: 'yellow', description: 'Awaiting payment' }
          },
          confirmed: {
            on: {
              PREPARE: 'preparing',
              CANCEL: 'cancelled'
            },
            entry: 'onConfirmed',
            exit: 'onLeftConfirmed'
          },
          preparing: {
            on: {
              SHIP: 'shipped',
              CANCEL: 'cancelled'
            },
            guards: {
              SHIP: 'canShip'
            }
          },
          shipped: {
            on: {
              DELIVER: 'delivered',
              RETURN: 'returned'
            }
          },
          delivered: { type: 'final' },
          cancelled: { type: 'final' },
          returned: { type: 'final' }
        }
      }
    },
    
    actions: {
      onConfirmed: async (context, event, machine) => {
        console.log(`✅ Order ${context.id} confirmed! Processing payment...`);
        
        // Decrease inventory
        await machine.database.resource('inventory').update(context.productId, {
          quantity: { $decrement: context.quantity }
        });
        
        // Send notification (simulated)
        console.log(`📧 Confirmation email sent to ${context.customerEmail}`);
        
        return { action: 'confirmed', timestamp: new Date().toISOString() };
      },
      
      onLeftConfirmed: async (context, event, machine) => {
        console.log(`👋 Left confirmed state for order ${context.id}`);
      }
    },
    
    guards: {
      canShip: async (context, event, machine) => {
        const inventory = await machine.database.resource('inventory').get(context.productId);
        const canShip = inventory && inventory.quantity >= context.quantity;
        console.log(`📦 Can ship order ${context.id}? ${canShip ? 'Yes' : 'No'}`);
        return canShip;
      }
    },
    
    verbose: true
  });

  // === BACKUP PLUGIN ===
  const backup = new BackupPlugin({
    destinations: [
      {
        type: 'filesystem',
        path: './backups/{date}/',
        compression: 'gzip'
      }
    ],
    
    retention: {
      daily: 7,
      weekly: 4,
      monthly: 12
    },
    
    include: ['orders', 'inventory', 'users'], // Only backup these resources
    exclude: ['temp_*'],                       // Exclude temporary resources
    
    onBackupStart: (type) => console.log(`🔄 Starting ${type} backup...`),
    onBackupComplete: (type, stats) => {
      console.log(`✅ ${type} backup completed:`, {
        size: `${Math.round(stats.size / 1024)}KB`,
        duration: `${stats.duration}ms`,
        destinations: stats.destinations
      });
    },
    
    verbose: true
  });

  // === SCHEDULER PLUGIN ===
  const scheduler = new SchedulerPlugin({
    timezone: 'America/Sao_Paulo',
    
    jobs: {
      // Daily cleanup at 3 AM
      cleanup_expired: {
        schedule: '0 3 * * *',
        description: 'Clean up expired sessions and temporary data',
        action: async (database, context) => {
          console.log('🧹 Running daily cleanup...');
          
          // Clean expired sessions
          const expired = await database.resource('sessions').list({
            where: { expiresAt: { $lt: new Date() } }
          });
          
          for (const session of expired) {
            await database.resource('sessions').delete(session.id);
          }
          
          console.log(`🗑️ Cleaned up ${expired.length} expired sessions`);
          return { deleted: expired.length };
        }
      },
      
      // Weekly backup every Sunday at 2 AM
      weekly_backup: {
        schedule: '0 2 * * SUN',
        description: 'Weekly full backup',
        action: async (database, context, schedulerPlugin) => {
          console.log('💾 Starting weekly backup...');
          
          // Get backup plugin from database plugins
          const backupPlugin = database.plugins.find(p => p.constructor.name === 'BackupPlugin');
          if (backupPlugin) {
            const result = await backupPlugin.backup('full');
            console.log('📦 Weekly backup completed:', result.id);
            return result;
          }
          
          throw new Error('BackupPlugin not found');
        }
      },
      
      // Order metrics every hour
      order_metrics: {
        schedule: '0 * * * *',
        description: 'Calculate hourly order metrics',
        action: async (database, context) => {
          const now = new Date();
          const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
          
          // Count orders in the last hour
          const recentOrders = await database.resource('orders').list({
            where: { 
              createdAt: { 
                $gte: hourAgo.toISOString(),
                $lt: now.toISOString() 
              } 
            }
          });
          
          const metrics = {
            hour: hourAgo.toISOString().slice(0, 13), // YYYY-MM-DDTHH
            orderCount: recentOrders.length,
            totalValue: recentOrders.reduce((sum, order) => sum + (order.value || 0), 0),
            avgValue: recentOrders.length > 0 ? 
              recentOrders.reduce((sum, order) => sum + (order.value || 0), 0) / recentOrders.length : 0
          };
          
          await database.resource('hourly_metrics').insert({
            id: `metrics_${metrics.hour}`,
            ...metrics,
            createdAt: now.toISOString()
          });
          
          console.log('📊 Hourly metrics calculated:', metrics);
          return metrics;
        }
      }
    },
    
    onJobStart: (jobName) => console.log(`🚀 Starting job: ${jobName}`),
    onJobComplete: (jobName, result, duration) => {
      console.log(`✅ Job ${jobName} completed in ${duration}ms`);
    },
    onJobError: (jobName, error) => {
      console.error(`❌ Job ${jobName} failed:`, error.message);
    },
    
    verbose: true
  });

  // Install plugins
  database.use(stateMachine);
  database.use(backup);
  database.use(scheduler);

  // Connect to database
  await database.connect();

  // === CREATE RESOURCES ===
  console.log('📝 Creating database resources...');

  // Orders resource
  await database.createResource({
    name: 'orders',
    attributes: {
      id: 'string|required',
      customerId: 'string|required',
      customerEmail: 'string|required|email',
      productId: 'string|required',
      quantity: 'number|required|min:1',
      value: 'number|required|min:0',
      status: 'string',
      createdAt: 'string|required'
    },
    behavior: 'body-overflow',
    timestamps: true
  });

  // Inventory resource
  await database.createResource({
    name: 'inventory',
    attributes: {
      id: 'string|required',
      productName: 'string|required',
      quantity: 'number|required|min:0',
      price: 'number|required|min:0'
    }
  });

  // Users resource
  await database.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      email: 'string|required|email'
    }
  });

  // Sessions resource (for cleanup demo)
  await database.createResource({
    name: 'sessions',
    attributes: {
      id: 'string|required',
      userId: 'string|required',
      expiresAt: 'string|required'
    }
  });

  // Hourly metrics resource
  await database.createResource({
    name: 'hourly_metrics',
    attributes: {
      id: 'string|required',
      hour: 'string|required',
      orderCount: 'number|required',
      totalValue: 'number|required',
      avgValue: 'number|required',
      createdAt: 'string|required'
    }
  });

  // === SEED DATA ===
  console.log('🌱 Seeding initial data...');

  // Add inventory
  await database.resource('inventory').insert({
    id: 'prod1',
    productName: 'Laptop',
    quantity: 10,
    price: 999.99
  });

  await database.resource('inventory').insert({
    id: 'prod2',
    productName: 'Mouse',
    quantity: 50,
    price: 29.99
  });

  // Add users
  await database.resource('users').insert({
    id: 'user1',
    name: 'João Silva',
    email: 'joao@example.com'
  });

  // Add expired session for cleanup demo
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await database.resource('sessions').insert({
    id: 'session1',
    userId: 'user1',
    expiresAt: yesterday.toISOString()
  });

  // === DEMONSTRATE STATE MACHINE ===
  console.log('\n🔄 === STATE MACHINE DEMO ===');

  // Create a new order
  const order = await database.resource('orders').insert({
    id: 'order123',
    customerId: 'user1',
    customerEmail: 'joao@example.com',
    productId: 'prod1',
    quantity: 2,
    value: 1999.98,
    status: 'pending',
    createdAt: new Date().toISOString()
  });

  console.log('📦 Created order:', order.id);

  // Initialize state machine for this order
  await stateMachine.initializeEntity('order_processing', order.id, order);
  console.log('🏁 Order state machine initialized');

  // Get current state
  let currentState = await stateMachine.getState('order_processing', order.id);
  console.log('📊 Current state:', currentState);

  // Confirm the order (triggers payment processing)
  console.log('\n💳 Confirming order...');
  await stateMachine.send('order_processing', order.id, 'CONFIRM', {
    paymentId: 'pay_123',
    ...order
  });

  currentState = await stateMachine.getState('order_processing', order.id);
  console.log('📊 State after confirmation:', currentState);

  // Prepare for shipping
  console.log('\n📦 Preparing order for shipping...');
  await stateMachine.send('order_processing', order.id, 'PREPARE');

  // Try to ship (should work as we have inventory)
  console.log('\n🚚 Shipping order...');
  await stateMachine.send('order_processing', order.id, 'SHIP');

  currentState = await stateMachine.getState('order_processing', order.id);
  console.log('📊 Final state:', currentState);

  // Get transition history
  const history = await stateMachine.getTransitionHistory('order_processing', order.id);
  console.log('\n📜 Transition history:');
  history.forEach(h => {
    console.log(`  ${h.from} → ${h.to} (${h.event}) at ${h.timestamp}`);
  });

  // === DEMONSTRATE BACKUP ===
  console.log('\n💾 === BACKUP DEMO ===');

  // Perform a manual backup
  const backupResult = await backup.backup('full');
  console.log('✅ Manual backup completed:', backupResult.id);

  // List available backups
  const backups = await backup.listBackups();
  console.log('📋 Available backups:', backups.length);

  // === DEMONSTRATE SCHEDULER ===
  console.log('\n⏰ === SCHEDULER DEMO ===');

  // Get job status
  const allJobs = scheduler.getAllJobsStatus();
  console.log('📊 Scheduled jobs:');
  allJobs.forEach(job => {
    console.log(`  - ${job.name}: ${job.enabled ? 'enabled' : 'disabled'} (next: ${job.nextRun})`);
  });

  // Manually run the cleanup job for demo
  console.log('\n🧹 Running cleanup job manually...');
  await scheduler.runJob('cleanup_expired');

  // Manually run metrics calculation
  console.log('\n📊 Running metrics calculation...');
  await scheduler.runJob('order_metrics');

  // === INTEGRATION EXAMPLE ===
  console.log('\n🔗 === INTEGRATION DEMO ===');

  // Create another order and show how all plugins work together
  const order2 = await database.resource('orders').insert({
    id: 'order456',
    customerId: 'user1',
    customerEmail: 'joao@example.com',
    productId: 'prod2',
    quantity: 3,
    value: 89.97,
    status: 'pending',
    createdAt: new Date().toISOString()
  });

  // Initialize state machine
  await stateMachine.initializeEntity('order_processing', order2.id, order2);

  // Process through states quickly
  await stateMachine.send('order_processing', order2.id, 'CONFIRM', order2);
  await stateMachine.send('order_processing', order2.id, 'PREPARE');
  await stateMachine.send('order_processing', order2.id, 'SHIP');
  await stateMachine.send('order_processing', order2.id, 'DELIVER');

  console.log('🎉 Order 2 processed through complete workflow!');

  // Show final inventory
  const finalInventory = await database.resource('inventory').list();
  console.log('\n📦 Final inventory:');
  finalInventory.forEach(item => {
    console.log(`  ${item.productName}: ${item.quantity} units @ $${item.price}`);
  });

  console.log('\n✅ Plugins demo completed!');
  console.log('\n🔍 Key features demonstrated:');
  console.log('  - State machine workflow with guards and actions');
  console.log('  - Automated backups with retention policies');
  console.log('  - Scheduled jobs for maintenance and metrics');
  console.log('  - Seamless integration between all plugins');

  // Cleanup
  await database.disconnect();
}

// Run the example
main().catch(console.error);