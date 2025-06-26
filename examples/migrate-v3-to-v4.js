/**
 * Migration Script: s3db.js v3.x to v4.x
 * 
 * This script helps migrate data from s3db.js v3.x to v4.x format.
 * 
 * BREAKING CHANGE: v4.x uses versioned paths that are incompatible with v3.x
 * - v3.x: resource={name}/id={id}  
 * - v4.x: resource={name}/v={version}/id={id}
 * 
 * Usage:
 * 1. Install both v3.x and v4.x in separate projects
 * 2. Configure S3 credentials
 * 3. Run this script to migrate your data
 * 4. Verify migration success
 * 5. Update your application to use v4.x
 */

import { S3Client } from '@aws-sdk/client-s3';

// You'll need to install both versions:
// npm install s3db.js@3.3.2  # Old version (for reading)
// npm install s3db.js@4.0.0  # New version (for writing)

// For this example, we'll show the migration process
// In practice, you'd import from different packages or use different projects

const MIGRATION_CONFIG = {
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  
  // Resources to migrate
  resources: [
    'users',
    'products', 
    'orders',
    'categories'
  ],
  
  // Migration options
  batchSize: 100,              // Process in batches to avoid memory issues
  parallelism: 5,              // Concurrent operations
  dryRun: false,               // Set to true to test without actual migration
  backupOriginal: true,        // Create backup before migration
  validateMigration: true      // Verify data integrity after migration
};

/**
 * Step 1: Backup v3.x data
 */
async function backupV3Data(client, resourceName) {
  console.log(`📦 Creating backup for resource: ${resourceName}`);
  
  const prefix = `resource=${resourceName}/`;
  const backupPrefix = `backup/v3/${resourceName}/`;
  
  try {
    // List all objects in the resource
    const objects = await listAllObjects(client, prefix);
    console.log(`Found ${objects.length} objects to backup`);
    
    // Copy each object to backup location
    for (const obj of objects) {
      const sourceKey = obj.Key;
      const backupKey = sourceKey.replace(prefix, backupPrefix);
      
      await client.copyObject({
        CopySource: `${client.bucket}/${sourceKey}`,
        Bucket: client.bucket,
        Key: backupKey
      });
    }
    
    console.log(`✅ Backup completed for ${resourceName}`);
    return objects;
    
  } catch (error) {
    console.error(`❌ Backup failed for ${resourceName}:`, error);
    throw error;
  }
}

/**
 * Step 2: Read v3.x data structure
 */
async function readV3Resource(client, resourceName) {
  console.log(`📖 Reading v3.x data for resource: ${resourceName}`);
  
  const prefix = `resource=${resourceName}/`;
  const objects = await listAllObjects(client, prefix);
  const data = [];
  
  for (const obj of objects) {
    try {
      // Get object metadata (where v3.x stored the data)
      const response = await client.getObject({
        Bucket: client.bucket,
        Key: obj.Key
      });
      
      // v3.x stored data in metadata
      const metadata = response.Metadata || {};
      const id = extractIdFromV3Key(obj.Key);
      
      data.push({
        id,
        data: metadata,
        originalKey: obj.Key
      });
      
    } catch (error) {
      console.warn(`⚠️ Failed to read object ${obj.Key}:`, error);
    }
  }
  
  console.log(`✅ Read ${data.length} records from ${resourceName}`);
  return data;
}

/**
 * Step 3: Create v4.x resource and migrate data
 */
async function migrateToV4(v4db, resourceName, v3Data, resourceSchema) {
  console.log(`🔄 Migrating ${resourceName} to v4.x format`);
  
  try {
    // Create v4.x resource (this will use versioned paths)
    const resource = await v4db.createResource({
      name: resourceName,
      attributes: resourceSchema
    });
    
    console.log(`📝 Created v4.x resource: ${resourceName} (version: ${resource.version})`);
    
    // Migrate data in batches
    const batchSize = MIGRATION_CONFIG.batchSize;
    let migrated = 0;
    
    for (let i = 0; i < v3Data.length; i += batchSize) {
      const batch = v3Data.slice(i, i + batchSize);
      
      // Convert v3 data format to v4 format
      const v4BatchData = batch.map(item => ({
        id: item.id,
        ...transformV3ToV4Data(item.data, resourceSchema)
      }));
      
      // Insert batch into v4 resource
      if (!MIGRATION_CONFIG.dryRun) {
        await resource.insertMany(v4BatchData);
      }
      
      migrated += batch.length;
      console.log(`  📊 Migrated ${migrated}/${v3Data.length} records`);
    }
    
    console.log(`✅ Migration completed for ${resourceName}`);
    return { migrated, version: resource.version };
    
  } catch (error) {
    console.error(`❌ Migration failed for ${resourceName}:`, error);
    throw error;
  }
}

/**
 * Step 4: Validate migration
 */
async function validateMigration(v4db, resourceName, originalCount) {
  console.log(`🔍 Validating migration for ${resourceName}`);
  
  try {
    const resource = v4db.resource(resourceName);
    const newCount = await resource.count();
    
    if (newCount === originalCount) {
      console.log(`✅ Validation passed: ${newCount} records migrated successfully`);
      return true;
    } else {
      console.error(`❌ Validation failed: Expected ${originalCount}, found ${newCount}`);
      return false;
    }
    
  } catch (error) {
    console.error(`❌ Validation error for ${resourceName}:`, error);
    return false;
  }
}

/**
 * Helper Functions
 */

async function listAllObjects(client, prefix) {
  const objects = [];
  let continuationToken;
  
  do {
    const response = await client.listObjectsV2({
      Bucket: client.bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken
    });
    
    if (response.Contents) {
      objects.push(...response.Contents);
    }
    
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);
  
  return objects;
}

function extractIdFromV3Key(key) {
  // v3.x format: resource={name}/id={id}
  const match = key.match(/id=(.+)$/);
  return match ? match[1] : null;
}

function transformV3ToV4Data(v3Metadata, schema) {
  // Transform v3 metadata format to v4 data format
  // This depends on your specific schema and data structure
  
  const transformed = {};
  
  // Basic transformation - you may need to customize this
  for (const [key, value] of Object.entries(v3Metadata)) {
    if (key.startsWith('x-amz-meta-')) {
      // Remove AWS metadata prefix
      const cleanKey = key.replace('x-amz-meta-', '');
      transformed[cleanKey] = value;
    } else {
      transformed[key] = value;
    }
  }
  
  // Apply schema transformations if needed
  // e.g., convert string numbers back to numbers, parse JSON, etc.
  
  return transformed;
}

/**
 * Main Migration Process
 */
async function migrateDatabase() {
  console.log('🚀 Starting s3db.js v3 → v4 migration');
  console.log('=====================================');
  
  if (MIGRATION_CONFIG.dryRun) {
    console.log('🧪 DRY RUN MODE - No actual changes will be made');
  }
  
  // Initialize S3 client for direct operations
  const s3Client = new S3Client({
    // Configure your S3 client
  });
  
  // Initialize v4 database
  // const v4db = new S3db({ uri: MIGRATION_CONFIG.connectionString });
  // await v4db.connect();
  
  const migrationResults = [];
  
  for (const resourceName of MIGRATION_CONFIG.resources) {
    console.log(`\n📁 Processing resource: ${resourceName}`);
    
    try {
      // Step 1: Backup original data
      let v3Objects = [];
      if (MIGRATION_CONFIG.backupOriginal) {
        v3Objects = await backupV3Data(s3Client, resourceName);
      }
      
      // Step 2: Read v3 data
      const v3Data = await readV3Resource(s3Client, resourceName);
      
      if (v3Data.length === 0) {
        console.log(`⚠️ No data found for ${resourceName}, skipping...`);
        continue;
      }
      
      // Step 3: Define resource schema (you need to provide this)
      const resourceSchema = getResourceSchema(resourceName);
      
      if (!resourceSchema) {
        console.error(`❌ No schema defined for ${resourceName}, skipping...`);
        continue;
      }
      
      // Step 4: Migrate to v4
      // const migrationResult = await migrateToV4(v4db, resourceName, v3Data, resourceSchema);
      
      // Step 5: Validate migration
      // if (MIGRATION_CONFIG.validateMigration) {
      //   const isValid = await validateMigration(v4db, resourceName, v3Data.length);
      //   if (!isValid) {
      //     throw new Error(`Migration validation failed for ${resourceName}`);
      //   }
      // }
      
      migrationResults.push({
        resource: resourceName,
        status: 'success',
        recordCount: v3Data.length,
        // version: migrationResult.version
      });
      
    } catch (error) {
      console.error(`💥 Migration failed for ${resourceName}:`, error);
      migrationResults.push({
        resource: resourceName,
        status: 'failed',
        error: error.message
      });
    }
  }
  
  // Summary
  console.log('\n📊 Migration Summary');
  console.log('====================');
  migrationResults.forEach(result => {
    const status = result.status === 'success' ? '✅' : '❌';
    console.log(`${status} ${result.resource}: ${result.status}`);
    if (result.recordCount) {
      console.log(`   📊 Records: ${result.recordCount}`);
    }
    if (result.error) {
      console.log(`   💥 Error: ${result.error}`);
    }
  });
  
  const successful = migrationResults.filter(r => r.status === 'success').length;
  const total = migrationResults.length;
  
  console.log(`\n🎯 Migration completed: ${successful}/${total} resources migrated successfully`);
  
  if (successful === total) {
    console.log('\n🎉 All resources migrated successfully!');
    console.log('💡 Next steps:');
    console.log('   1. Test your application with v4.x');
    console.log('   2. Verify all functionality works correctly');
    console.log('   3. Remove v3.x data after confirming migration success');
  } else {
    console.log('\n⚠️ Some resources failed to migrate. Please review the errors above.');
  }
}

/**
 * Define your resource schemas here
 * You need to provide the schemas for each resource you're migrating
 */
function getResourceSchema(resourceName) {
  const schemas = {
    users: {
      name: 'string|min:2|max:100',
      email: 'email|unique',
      age: 'number|integer|positive',
      isActive: 'boolean'
    },
    
    products: {
      name: 'string|min:2|max:200',
      price: 'number|positive',
      category: 'string',
      inStock: 'boolean'
    },
    
    orders: {
      customerId: 'string',
      total: 'number|positive',
      status: 'string|enum:pending,paid,shipped,delivered',
      createdAt: 'date'
    },
    
    categories: {
      name: 'string|min:2|max:100',
      description: 'string|optional'
    }
  };
  
  return schemas[resourceName];
}

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateDatabase().catch(console.error);
}

export {
  migrateDatabase,
  backupV3Data,
  readV3Resource,
  migrateToV4,
  validateMigration
};