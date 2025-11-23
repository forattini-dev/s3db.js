/**
 * Example 51: Incremental IDs
 *
 * This example demonstrates how to use auto-incrementing IDs with s3db.js.
 * Supports standard mode (lock per ID) and fast mode (batch reservation).
 */

import { Database } from '../../src/database.class.js';

async function main() {
  // Connect to database
  const database = new Database({
    connectionString: 'memory://example-bucket/incremental-demo',
    logLevel: 'info'
  });
  await database.connect();

  console.log('\n=== Example 51: Incremental IDs ===\n');

  // ============================================================================
  // BASIC INCREMENTAL IDs
  // ============================================================================

  console.log('--- Basic Incremental IDs ---');

  const users = await database.createResource({
    name: 'users',
    attributes: { name: 'string', email: 'string' },
    idGenerator: 'incremental' // IDs: 1, 2, 3, ...
  });

  const user1 = await users.insert({ name: 'Alice', email: 'alice@example.com' });
  const user2 = await users.insert({ name: 'Bob', email: 'bob@example.com' });
  const user3 = await users.insert({ name: 'Carol', email: 'carol@example.com' });

  console.log('User 1 ID:', user1.id); // "1"
  console.log('User 2 ID:', user2.id); // "2"
  console.log('User 3 ID:', user3.id); // "3"

  // ============================================================================
  // CUSTOM START VALUE
  // ============================================================================

  console.log('\n--- Custom Start Value ---');

  const orders = await database.createResource({
    name: 'orders',
    attributes: { product: 'string', quantity: 'number' },
    idGenerator: 'incremental:1000' // IDs: 1000, 1001, 1002, ...
  });

  const order1 = await orders.insert({ product: 'Widget', quantity: 5 });
  const order2 = await orders.insert({ product: 'Gadget', quantity: 3 });

  console.log('Order 1 ID:', order1.id); // "1000"
  console.log('Order 2 ID:', order2.id); // "1001"

  // ============================================================================
  // CUSTOM INCREMENT STEP
  // ============================================================================

  console.log('\n--- Custom Increment Step ---');

  const batches = await database.createResource({
    name: 'batches',
    attributes: { name: 'string' },
    idGenerator: { type: 'incremental', start: 100, increment: 10 }
  });

  const batch1 = await batches.insert({ name: 'Batch A' });
  const batch2 = await batches.insert({ name: 'Batch B' });
  const batch3 = await batches.insert({ name: 'Batch C' });

  console.log('Batch IDs:', batch1.id, batch2.id, batch3.id); // "100", "110", "120"

  // ============================================================================
  // PREFIXED IDs (Order Numbers, Invoice Numbers, etc.)
  // ============================================================================

  console.log('\n--- Prefixed IDs ---');

  const invoices = await database.createResource({
    name: 'invoices',
    attributes: { amount: 'number', customer: 'string' },
    idGenerator: 'incremental:INV-0001' // IDs: INV-0001, INV-0002, ...
  });

  const invoice1 = await invoices.insert({ amount: 100.00, customer: 'Acme Corp' });
  const invoice2 = await invoices.insert({ amount: 250.50, customer: 'Globex Inc' });

  console.log('Invoice 1 ID:', invoice1.id); // "INV-0001"
  console.log('Invoice 2 ID:', invoice2.id); // "INV-0002"

  // Start from higher number
  const tickets = await database.createResource({
    name: 'tickets',
    attributes: { title: 'string', status: 'string' },
    idGenerator: 'incremental:TKT-1000' // IDs: TKT-1000, TKT-1001, ...
  });

  const ticket1 = await tickets.insert({ title: 'Bug fix', status: 'open' });
  console.log('Ticket ID:', ticket1.id); // "TKT-1000"

  // ============================================================================
  // FAST MODE (High-Throughput)
  // ============================================================================

  console.log('\n--- Fast Mode (Batch Reservation) ---');

  const events = await database.createResource({
    name: 'events',
    attributes: { type: 'string', timestamp: 'string' },
    idGenerator: 'incremental:fast' // Reserves batches of 100 IDs
  });

  // Fast mode: first insert reserves a batch, subsequent inserts use local cache
  console.log('Inserting 5 events in fast mode...');
  const eventIds = [];
  for (let i = 0; i < 5; i++) {
    const event = await events.insert({
      type: 'click',
      timestamp: new Date().toISOString()
    });
    eventIds.push(event.id);
  }
  console.log('Event IDs:', eventIds); // ["1", "2", "3", "4", "5"]

  // Check batch status
  const status = events.getBatchStatus();
  console.log('Batch status:', status);
  // { start: 1, end: 101, current: 6, remaining: 95, reservedAt: ... }

  // ============================================================================
  // FAST MODE WITH CUSTOM BATCH SIZE
  // ============================================================================

  console.log('\n--- Fast Mode with Custom Batch Size ---');

  const logs = await database.createResource({
    name: 'logs',
    attributes: { message: 'string', level: 'string' },
    idGenerator: { type: 'incremental', mode: 'fast', batchSize: 500 }
  });

  // Reserve a batch explicitly
  const batch = await logs.reserveIdBatch(1000);
  console.log('Reserved batch:', batch);
  // { start: 1, end: 1001, current: 1, reservedAt: ... }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  console.log('\n--- Utility Methods ---');

  // Get next sequence value (without incrementing)
  const nextUserId = await users.getSequenceValue();
  console.log('Next user ID will be:', nextUserId); // 4

  // List all sequences for a resource
  const sequences = await users.listSequences();
  console.log('User sequences:', sequences);

  // Reset sequence (use with caution!)
  await users.resetSequence('id', 100);
  const userAfterReset = await users.insert({ name: 'Dave', email: 'dave@example.com' });
  console.log('User after reset ID:', userAfterReset.id); // "100"

  // ============================================================================
  // MANUAL ID OVERRIDE
  // ============================================================================

  console.log('\n--- Manual ID Override ---');

  // You can still provide your own ID
  const customUser = await users.insert({
    id: 'admin-user',
    name: 'Admin',
    email: 'admin@example.com'
  });
  console.log('Custom ID:', customUser.id); // "admin-user"

  // Sequence continues unaffected
  const nextUser = await users.insert({ name: 'Eve', email: 'eve@example.com' });
  console.log('Next auto ID:', nextUser.id); // "101" (continues from reset)

  // ============================================================================
  // SEQUENCE ISOLATION
  // ============================================================================

  console.log('\n--- Sequence Isolation ---');

  // Each resource has its own independent sequence
  const products = await database.createResource({
    name: 'products',
    attributes: { name: 'string' },
    idGenerator: 'incremental'
  });

  const categories = await database.createResource({
    name: 'categories',
    attributes: { name: 'string' },
    idGenerator: 'incremental'
  });

  const prod1 = await products.insert({ name: 'Laptop' });
  const cat1 = await categories.insert({ name: 'Electronics' });

  console.log('Product ID:', prod1.id);   // "1"
  console.log('Category ID:', cat1.id);   // "1" (independent sequence)

  // ============================================================================
  // CLEANUP
  // ============================================================================

  await database.disconnect();
  console.log('\n=== Example Complete ===\n');
}

main().catch(console.error);
