/**
 * Example 46: Replicator Schema Sync
 *
 * Demonstrates how to use automatic schema synchronization with SQL replicators.
 * The schema sync feature automatically creates and updates database tables based
 * on S3DB resource definitions.
 *
 * Features demonstrated:
 * - Auto-create tables from resource schema
 * - Auto-add missing columns (ALTER strategy)
 * - Drop and recreate tables (DROP-CREATE strategy)
 * - Validate-only mode (throws error on mismatch)
 * - Different onMismatch behaviors (error, warn, ignore)
 */

import Database from '../../src/database.class.js';
import { ReplicatorPlugin } from '../../src/plugins/replicator.plugin.js';

async function example() {
  console.log('🔄 Replicator Schema Sync Example\n');

  // Create S3DB database
  const db = new Database({
    bucketName: 's3db-schema-sync-example',
    region: 'us-east-1',
    endpoint: 'http://localhost:4566', // LocalStack
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test'
    }
  });

  await db.initialize();

  // Create a resource with specific schema
  const users = await db.createResource({
    name: 'users',
    attributes: {
      email: 'string|required|maxlength:255',
      name: 'string|required|maxlength:100',
      age: 'number',
      active: 'boolean',
      metadata: 'json',
      createdAt: 'datetime'
    },
    options: {
      timestamps: true
    }
  });

  console.log('✅ Created S3DB resource "users"\n');

  // ========================================
  // Example 1: Auto-create table with ALTER strategy
  // ========================================
  console.log('📘 Example 1: Auto-create table (ALTER strategy)');
  console.log('─'.repeat(60));

  const replicator1 = new ReplicatorPlugin({
    replicators: [{
      driver: 'postgres',
      config: {
        connectionString: 'postgresql://user:password@localhost:5432/testdb',
        schemaSync: {
          enabled: true,
          strategy: 'alter',           // Incrementally alter table
          onMismatch: 'error',          // Throw error if schema doesn't match
          autoCreateTable: true,        // Create table if missing
          autoCreateColumns: true       // Add missing columns
        }
      },
      resources: {
        users: 'users_table'            // Replicate 'users' to 'users_table'
      }
    }]
  });

  try {
    await db.usePlugin(replicator1);
    console.log('✅ Table "users_table" created automatically');
    console.log('   Columns: id, email, name, age, active, metadata, created_at, updated_at\n');
  } catch (err) {
    console.log(`❌ Error: ${err.message}\n`);
  }

  // ========================================
  // Example 2: Add columns to existing table
  // ========================================
  console.log('📘 Example 2: Add columns to existing table');
  console.log('─'.repeat(60));

  // Update resource schema (add new field)
  await users.updateAttributes({
    email: 'string|required|maxlength:255',
    name: 'string|required|maxlength:100',
    age: 'number',
    active: 'boolean',
    metadata: 'json',
    phoneNumber: 'string|maxlength:20',  // NEW FIELD
    createdAt: 'datetime'
  });

  console.log('✅ Added "phoneNumber" field to resource schema');

  // Reinitialize replicator to trigger schema sync
  const replicator2 = new ReplicatorPlugin({
    replicators: [{
      driver: 'postgres',
      config: {
        connectionString: 'postgresql://user:password@localhost:5432/testdb',
        schemaSync: {
          enabled: true,
          strategy: 'alter',
          autoCreateColumns: true
        }
      },
      resources: {
        users: 'users_table'
      }
    }]
  });

  await db.usePlugin(replicator2);
  console.log('✅ Added "phoneNumber" column to existing table\n');

  // ========================================
  // Example 3: DROP-CREATE strategy (dangerous!)
  // ========================================
  console.log('📘 Example 3: DROP-CREATE strategy');
  console.log('─'.repeat(60));
  console.log('⚠️  WARNING: This will DROP the entire table and recreate it!');

  const replicator3 = new ReplicatorPlugin({
    replicators: [{
      driver: 'postgres',
      config: {
        connectionString: 'postgresql://user:password@localhost:5432/testdb',
        schemaSync: {
          enabled: true,
          strategy: 'drop-create',      // Drop and recreate table
          onMismatch: 'warn'             // Just warn, don't fail
        },
        verbose: true
      },
      resources: {
        users: 'users_table'
      }
    }]
  });

  await db.usePlugin(replicator3);
  console.log('✅ Table dropped and recreated with current schema\n');

  // ========================================
  // Example 4: VALIDATE-ONLY mode
  // ========================================
  console.log('📘 Example 4: VALIDATE-ONLY mode');
  console.log('─'.repeat(60));

  const replicator4 = new ReplicatorPlugin({
    replicators: [{
      driver: 'postgres',
      config: {
        connectionString: 'postgresql://user:password@localhost:5432/testdb',
        schemaSync: {
          enabled: true,
          strategy: 'validate-only',    // Don't modify, just validate
          onMismatch: 'error'            // Error if schema doesn't match
        }
      },
      resources: {
        users: 'users_table'
      }
    }]
  });

  try {
    await db.usePlugin(replicator4);
    console.log('✅ Schema validation passed\n');
  } catch (err) {
    console.log(`❌ Schema mismatch detected: ${err.message}\n`);
  }

  // ========================================
  // Example 5: BigQuery with schema sync (PRINCIPAL!)
  // ========================================
  console.log('📘 Example 5: BigQuery schema sync (Main Driver)');
  console.log('─'.repeat(60));

  const bigqueryReplicator = new ReplicatorPlugin({
    replicators: [{
      driver: 'bigquery',
      config: {
        projectId: 'my-gcp-project',
        datasetId: 'analytics',
        credentials: {}, // Service account credentials
        schemaSync: {
          enabled: true,
          strategy: 'alter',
          autoCreateTable: true,
          autoCreateColumns: true
        }
      },
      resources: {
        users: 'users_table'
      }
    }]
  });

  try {
    await db.usePlugin(bigqueryReplicator);
    console.log('✅ BigQuery table created/synced successfully');
    console.log('   Schema format: BigQuery native (STRING, INT64, FLOAT64, JSON, etc)\n');
  } catch (err) {
    console.log(`❌ Error: ${err.message}\n`);
  }

  // ========================================
  // Example 6: MySQL with schema sync
  // ========================================
  console.log('📘 Example 6: MySQL/MariaDB schema sync');
  console.log('─'.repeat(60));

  const mysqlReplicator = new ReplicatorPlugin({
    replicators: [{
      driver: 'mysql',
      config: {
        host: 'localhost',
        port: 3306,
        database: 'analytics',
        user: 'replicator',
        password: 'secret',
        schemaSync: {
          enabled: true,
          strategy: 'alter',
          autoCreateTable: true,
          autoCreateColumns: true
        }
      },
      resources: {
        users: 'users_table'
      }
    }]
  });

  try {
    await db.usePlugin(mysqlReplicator);
    console.log('✅ MySQL table created/synced successfully\n');
  } catch (err) {
    console.log(`❌ Error: ${err.message}\n`);
  }

  // ========================================
  // Example 6: Multiple strategies with onMismatch behaviors
  // ========================================
  console.log('📘 Example 6: onMismatch behaviors');
  console.log('─'.repeat(60));

  // ERROR: Throws error and stops
  console.log('onMismatch: error - Throws error on schema mismatch');

  // WARN: Logs warning but continues
  console.log('onMismatch: warn  - Logs warning but continues');

  // IGNORE: Silently ignores mismatch
  console.log('onMismatch: ignore - Silently ignores mismatch\n');

  // ========================================
  // Example 7: Listen to schema sync events
  // ========================================
  console.log('📘 Example 7: Schema sync events');
  console.log('─'.repeat(60));

  const replicator7 = new ReplicatorPlugin({
    replicators: [{
      driver: 'postgres',
      config: {
        connectionString: 'postgresql://user:password@localhost:5432/testdb',
        schemaSync: {
          enabled: true,
          strategy: 'alter'
        }
      },
      resources: {
        users: 'users_table'
      }
    }]
  });

  // Listen to events
  replicator7.replicators[0].on('table_created', (event) => {
    console.log(`✅ Table created: ${event.tableName}`);
    console.log(`   Attributes: ${event.attributes.join(', ')}`);
  });

  replicator7.replicators[0].on('table_altered', (event) => {
    console.log(`✅ Table altered: ${event.tableName}`);
    console.log(`   Added ${event.addedColumns} column(s)`);
  });

  replicator7.replicators[0].on('table_recreated', (event) => {
    console.log(`⚠️  Table recreated: ${event.tableName}`);
    console.log(`   Attributes: ${event.attributes.join(', ')}`);
  });

  replicator7.replicators[0].on('schema_sync_completed', (event) => {
    console.log(`✅ Schema sync completed for resources: ${event.resources.join(', ')}`);
  });

  await db.usePlugin(replicator7);
  console.log();

  // ========================================
  // Type mapping reference
  // ========================================
  console.log('📋 Type Mapping Reference');
  console.log('─'.repeat(80));
  console.log('S3DB Type        → PostgreSQL      → MySQL/MariaDB   → BigQuery');
  console.log('─'.repeat(80));
  console.log('string           → TEXT            → TEXT            → STRING');
  console.log('string|max:255   → VARCHAR(255)    → VARCHAR(255)    → STRING');
  console.log('number           → DOUBLE          → DOUBLE          → FLOAT64 / INT64');
  console.log('boolean          → BOOLEAN         → TINYINT(1)      → BOOL');
  console.log('object/json      → JSONB           → JSON            → JSON');
  console.log('array            → JSONB           → JSON            → JSON');
  console.log('embedding:1536   → JSONB           → JSON            → JSON');
  console.log('ip4              → INET            → VARCHAR(15)     → STRING');
  console.log('ip6              → INET            → VARCHAR(45)     → STRING');
  console.log('secret           → TEXT            → TEXT            → STRING');
  console.log('uuid             → UUID            → CHAR(36)        → STRING');
  console.log('date             → DATE            → DATE            → DATE');
  console.log('datetime         → TIMESTAMPTZ     → DATETIME        → TIMESTAMP');
  console.log();

  console.log('✅ Example completed!\n');
}

// Run example
example().catch(console.error);
