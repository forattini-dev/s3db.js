import { createDatabaseForTest } from './database.js';

async function middlewareExample() {
  console.log('🧩 Middleware Example: Authentication & Audit');
  console.log('===============================================\n');

  // Create database and resource
  const database = createDatabaseForTest('middleware-demo');
  await database.connect();

  const orders = await database.createResource({
    name: 'orders',
    attributes: {
      id: 'string|required',
      customerId: 'string|required',
      amount: 'number|required',
      status: 'string|required'
    }
  });

  // 1. Authentication middleware - runs on all operations
  ['insert', 'update', 'delete', 'get'].forEach(method => {
    orders.useMiddleware(method, async (ctx, next) => {
      // Extract user from the last argument if it's an options object
      const lastArg = ctx.args[ctx.args.length - 1];
      const user = lastArg?.user;
      
      if (!user || !user.userId) {
        throw new Error(`🔒 Authentication required for ${method} operation`);
      }
      
      console.log(`🔑 User authenticated: ${user.userId} (${user.role})`);
      
      // Add user info to context for other middlewares
      ctx.authenticatedUser = user;
      
      return await next();
    });
  });

  // 2. Audit logging middleware - tracks all changes
  ['insert', 'update', 'delete'].forEach(method => {
    orders.useMiddleware(method, async (ctx, next) => {
      const startTime = Date.now();
      const user = ctx.authenticatedUser;
      
      console.log(`📊 [AUDIT] Starting ${method.toUpperCase()} operation...`);
      
      try {
        const result = await next();
        
        const auditLog = {
          resource: 'orders',
          userId: user.userId,
          method,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          success: true,
          recordId: result.id || ctx.args[0]
        };
        
        console.log(`✅ [AUDIT] ${method.toUpperCase()} succeeded:`, auditLog);
        
        return result;
      } catch (error) {
        const auditLog = {
          resource: 'orders',
          userId: user.userId,
          method,
          error: error.message,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          success: false
        };
        
        console.log(`❌ [AUDIT] ${method.toUpperCase()} failed:`, auditLog);
        
        throw error;
      }
    });
  });

  // 3. Permission middleware for sensitive operations
  orders.useMiddleware('delete', async (ctx, next) => {
    const user = ctx.authenticatedUser;
    
    if (user.role !== 'admin') {
      throw new Error('🛡️ Only admins can delete orders');
    }
    
    console.log(`🛡️ Admin permission granted for delete operation`);
    
    return await next();
  });

  // 4. Data transformation middleware
  orders.useMiddleware('insert', async (ctx, next) => {
    // Automatically add created timestamp and normalize data
    if (ctx.args[0]) {
      ctx.args[0].createdAt = new Date().toISOString();
      ctx.args[0].status = ctx.args[0].status?.toLowerCase() || 'pending';
      
      console.log(`🔄 Data transformed: added timestamp and normalized status`);
    }
    
    return await next();
  });

  console.log('\n🚀 Testing middleware functionality...\n');

  try {
    // Test 1: Successful insert with customer user
    console.log('Test 1: Insert order as customer');
    console.log('=====================================');
    
    const order1 = await orders.insert(
      { 
        id: 'order-001',
        customerId: 'cust-123', 
        amount: 99.99, 
        status: 'PENDING' // Will be normalized to lowercase
      },
      { user: { userId: 'user-456', role: 'customer' } }
    );
    
    console.log('📦 Order created:', order1);
    console.log('');

    // Test 2: Try to delete as customer (should fail)
    console.log('Test 2: Try to delete as customer (should fail)');
    console.log('==================================================');
    
    try {
      await orders.delete('order-001', { 
        user: { userId: 'user-456', role: 'customer' } 
      });
    } catch (error) {
      console.log('Expected error:', error.message);
    }
    console.log('');

    // Test 3: Delete as admin (should succeed)
    console.log('Test 3: Delete as admin (should succeed)');
    console.log('==========================================');
    
    await orders.delete('order-001', { 
      user: { userId: 'admin-789', role: 'admin' } 
    });
    
    console.log('🗑️ Order deleted successfully');
    console.log('');

    // Test 4: Unauthenticated request (should fail)
    console.log('Test 4: Unauthenticated request (should fail)');
    console.log('===============================================');
    
    try {
      await orders.insert({ 
        id: 'order-002',
        customerId: 'cust-124', 
        amount: 149.99, 
        status: 'pending' 
      });
    } catch (error) {
      console.log('Expected error:', error.message);
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  } finally {
    await database.disconnect();
  }

  console.log('\n✨ Middleware example completed!');
  console.log('\nKey Takeaways:');
  console.log('- Middlewares run in registration order');
  console.log('- Authentication middleware runs first for security');
  console.log('- Audit middleware tracks all operations with timing');
  console.log('- Permission middleware can block unauthorized actions');
  console.log('- Data transformation middleware can modify inputs');
  console.log('- Multiple middlewares can be chained for complex logic');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  middlewareExample().catch(console.error);
}

export default middlewareExample; 