/**
 * Example 44: Orphaned Partitions Recovery
 *
 * Demonstrates how to handle situations where partitions reference fields
 * that no longer exist in the resource schema. This can happen when:
 * 1. A partition is created for a specific field
 * 2. The field is later removed from the schema
 * 3. The partition becomes "orphaned" and can block operations
 *
 * This example shows:
 * - How to detect orphaned partitions
 * - Dry-run mode to preview what would be removed
 * - Actually removing orphaned partitions
 * - How to use strictValidation to prevent issues
 */

import s3db from '../src/index.js';

(async () => {
  console.log('\n🔧 Orphaned Partitions Recovery Example\n');

  const db = new s3db.Database({
    bucketName: 'my-s3db-orphaned-partitions',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    region: 'us-east-1',
    endpoint: 'http://localhost:4566',
    forcePathStyle: true,
    autoCreateBucket: true
  });

  await db.connect();

  // ========================================================================
  // Scenario 1: Normal operation - no orphaned partitions
  // ========================================================================

  console.log('📋 Scenario 1: Normal Resource with Healthy Partitions\n');

  const users = await db.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      email: 'string|required',
      region: 'string|required',
      department: 'string|required'
    },
    options: {
      timestamps: true,
      partitions: {
        byRegion: {
          fields: { region: 'string' }
        },
        byDepartment: {
          fields: { department: 'string' }
        }
      }
    }
  });

  console.log('✅ Resource created with 2 partitions: byRegion, byDepartment');

  // Check for orphaned partitions (should find none)
  let orphaned = users.findOrphanedPartitions();
  console.log('Orphaned partitions found:', Object.keys(orphaned).length);
  console.log('');

  // ========================================================================
  // Scenario 2: Field removed - partition becomes orphaned
  // ========================================================================

  console.log('📋 Scenario 2: Removing a Field Used by a Partition\n');

  console.log('⚠️  Removing "region" field from schema (used by byRegion partition)...');

  // This creates an orphaned partition situation
  users.updateAttributes({
    id: 'string|required',
    name: 'string|required',
    email: 'string|required',
    department: 'string|required'
    // region removed - byRegion partition is now orphaned!
  });

  console.log('✅ Schema updated (region field removed)');
  console.log('');

  // ========================================================================
  // Scenario 3: Detecting orphaned partitions
  // ========================================================================

  console.log('📋 Scenario 3: Detecting Orphaned Partitions\n');

  orphaned = users.findOrphanedPartitions();

  console.log(`Found ${Object.keys(orphaned).length} orphaned partition(s):`);
  for (const [partitionName, details] of Object.entries(orphaned)) {
    console.log(`\n  Partition: ${partitionName}`);
    console.log(`  Missing fields: ${details.missingFields.join(', ')}`);
    console.log(`  All fields in partition: ${details.allFields.join(', ')}`);
  }
  console.log('');

  // ========================================================================
  // Scenario 4: Dry run - preview what would be removed
  // ========================================================================

  console.log('📋 Scenario 4: Dry Run Mode (Preview)\n');

  const toRemove = users.removeOrphanedPartitions({ dryRun: true });

  console.log('Dry run - would remove these partitions:');
  for (const [partitionName, details] of Object.entries(toRemove)) {
    console.log(`  - ${partitionName} (missing: ${details.missingFields.join(', ')})`);
  }

  // Verify partition still exists after dry run
  console.log(`\nbyRegion partition still exists: ${users.config.partitions.byRegion !== undefined}`);
  console.log('');

  // ========================================================================
  // Scenario 5: Actually removing orphaned partitions
  // ========================================================================

  console.log('📋 Scenario 5: Removing Orphaned Partitions\n');

  // Listen for removal event
  users.on('orphanedPartitionsRemoved', (data) => {
    console.log('Event fired: orphanedPartitionsRemoved');
    console.log(`  Resource: ${data.resourceName}`);
    console.log(`  Removed: ${data.removed.join(', ')}`);
  });

  const removed = users.removeOrphanedPartitions();

  console.log('\n✅ Removed partitions:', Object.keys(removed).join(', '));
  console.log(`byRegion partition still exists: ${users.config.partitions.byRegion !== undefined}`);
  console.log(`byDepartment partition still exists: ${users.config.partitions.byDepartment !== undefined}`);
  console.log('');

  // ========================================================================
  // Scenario 6: Saving changes to S3
  // ========================================================================

  console.log('📋 Scenario 6: Persisting Changes\n');

  console.log('💾 Uploading updated metadata to S3...');
  await db.uploadMetadataFile();
  console.log('✅ Metadata file updated in S3');
  console.log('');

  // ========================================================================
  // Scenario 7: strictValidation prevents orphaned partitions
  // ========================================================================

  console.log('📋 Scenario 7: Using strictValidation to Prevent Issues\n');

  // Create a new resource with strictValidation enabled (default)
  console.log('Creating resource with strictValidation: true (default)...');

  try {
    await db.createResource({
      name: 'products',
      attributes: {
        id: 'string|required',
        name: 'string|required'
        // category field missing!
      },
      options: {
        strictValidation: true, // This is the default
        partitions: {
          byCategory: {
            fields: { category: 'string' } // References non-existent field!
          }
        }
      }
    });
    console.log('❌ Should have thrown error!');
  } catch (error) {
    console.log('✅ Caught expected error:');
    console.log(`   ${error.message}`);
  }

  console.log('');

  // ========================================================================
  // Scenario 8: Disabling strictValidation for recovery
  // ========================================================================

  console.log('📋 Scenario 8: Recovery with strictValidation Disabled\n');

  console.log('Creating resource with strictValidation: false...');

  const products = await db.createResource({
    name: 'products_recovery',
    attributes: {
      id: 'string|required',
      name: 'string|required'
    },
    options: {
      strictValidation: false, // Allows orphaned partitions temporarily
      partitions: {
        byCategory: {
          fields: { category: 'string' }
        }
      }
    }
  });

  console.log('✅ Resource created (strictValidation disabled)');

  // Clean up orphaned partitions
  const productsRemoved = products.removeOrphanedPartitions();
  console.log(`Removed ${Object.keys(productsRemoved).length} orphaned partition(s)`);

  // Re-enable strict validation
  products.strictValidation = true;
  console.log('✅ Re-enabled strictValidation');
  console.log('');

  // ========================================================================
  // Scenario 9: Best practice - check before removing fields
  // ========================================================================

  console.log('📋 Scenario 9: Best Practice - Check Before Removing Fields\n');

  const orders = await db.createResource({
    name: 'orders',
    attributes: {
      id: 'string|required',
      amount: 'number|required',
      status: 'string|required',
      region: 'string|required'
    },
    options: {
      partitions: {
        byStatus: {
          fields: { status: 'string' }
        },
        byRegion: {
          fields: { region: 'string' }
        }
      }
    }
  });

  console.log('Want to remove "status" field...');

  // Check which partitions use this field
  const partitionsUsingStatus = Object.entries(orders.config.partitions || {})
    .filter(([name, def]) => def.fields && 'status' in def.fields)
    .map(([name]) => name);

  console.log(`Partitions using "status": ${partitionsUsingStatus.join(', ')}`);

  if (partitionsUsingStatus.length > 0) {
    console.log('⚠️  Warning: Removing "status" would orphan these partitions!');
    console.log('');
    console.log('Options:');
    console.log('  1. Remove the partitions first:');
    for (const name of partitionsUsingStatus) {
      console.log(`     delete orders.config.partitions.${name};`);
    }
    console.log('  2. Re-design partitions to not use this field');
    console.log('  3. Keep the field');
  }

  console.log('');

  // ========================================================================
  // Summary
  // ========================================================================

  console.log('📊 Summary\n');
  console.log('Key Points:');
  console.log('==========');
  console.log('✅ findOrphanedPartitions() - Detect orphaned partitions');
  console.log('✅ removeOrphanedPartitions() - Remove them (supports dryRun)');
  console.log('✅ strictValidation - Prevents creation of orphaned partitions (default: true)');
  console.log('✅ Always upload metadata after removing partitions');
  console.log('✅ Check partition usage before removing fields');
  console.log('');

  console.log('Common Recovery Workflow:');
  console.log('========================');
  console.log('1. Load resource with strictValidation: false');
  console.log('2. Detect orphaned partitions with findOrphanedPartitions()');
  console.log('3. Preview removal with removeOrphanedPartitions({ dryRun: true })');
  console.log('4. Remove with removeOrphanedPartitions()');
  console.log('5. Upload metadata with database.uploadMetadataFile()');
  console.log('6. Re-enable strictValidation');
  console.log('');

  await db.disconnect();
  console.log('✅ Example completed successfully!');
})();
