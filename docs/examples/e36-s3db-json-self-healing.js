import { setupDatabase, teardownDatabase } from './database.js';

async function demonstrateSelfHealing() {
  console.log('='.repeat(60));
  console.log('S3DB JSON Self-Healing System Demonstration');
  console.log('='.repeat(60));
  
  const s3db = await setupDatabase();

  // Enable verbose logging to see healing operations
  s3db.verbose = true;

  // Listen for healing events
  s3db.on('metadataHealed', (data) => {
    console.log('\n🔧 SELF-HEALING PERFORMED:');
    data.healingLog.forEach(log => console.log(`   ✓ ${log}`));
    console.log('');
  });

  console.log('\n1. Testing JSON Syntax Recovery');
  console.log('-'.repeat(40));

  // Simulate corrupted JSON with trailing comma
  const corruptedJson1 = `{
    "version": "1",
    "s3dbVersion": "8.0.2",
    "resources": {
      "users": {
        "currentVersion": "v1",
        "versions": {
          "v1": {
            "hash": "sha256:abc123",
            "attributes": { "name": "string" },
          }
        }
      },
    }
  }`;

  console.log('📝 Corrupted JSON (trailing commas):');
  console.log(corruptedJson1.substring(0, 200) + '...');

  await s3db.client.putObject({
    key: 's3db.json',
    body: corruptedJson1,
    contentType: 'application/json'
  });

  // This should heal automatically
  await s3db.connect();
  console.log('✅ Connection successful! JSON was automatically healed.');
  
  console.log('\n2. Testing Incomplete JSON Recovery');
  console.log('-'.repeat(40));

  // Simulate incomplete JSON (missing closing braces)
  const incompleteJson = `{
    "version": "1",
    "s3dbVersion": "8.0.2",
    "resources": {
      "products": {
        "currentVersion": "v1",
        "versions": {
          "v1": {
            "hash": "sha256:def456",
            "attributes": { "name": "string", "price": "number"`;

  console.log('📝 Incomplete JSON (missing closing braces):');
  console.log(incompleteJson);

  await s3db.client.putObject({
    key: 's3db.json',
    body: incompleteJson,
    contentType: 'application/json'
  });

  await s3db.connect();
  console.log('✅ Connection successful! Incomplete JSON was automatically completed and healed.');

  console.log('\n3. Testing Structural Healing');
  console.log('-'.repeat(40));

  // Simulate missing required fields
  const missingFields = {
    resources: {
      "orders": {
        // Missing currentVersion
        versions: {
          "v1": {
            hash: "sha256:ghi789",
            attributes: { status: "string" }
          },
          "v1": {
            hash: "sha256:jkl012",
            attributes: { status: "string", total: "number" }
          }
        }
      }
    }
    // Missing version, s3dbVersion, lastUpdated
  };

  console.log('📝 Missing fields (version, s3dbVersion, currentVersion):');
  console.log(JSON.stringify(missingFields, null, 2));

  await s3db.client.putObject({
    key: 's3db.json',
    body: JSON.stringify(missingFields),
    contentType: 'application/json'
  });

  await s3db.connect();
  console.log('✅ Connection successful! Missing fields were automatically added.');

  console.log('\n4. Testing Version Reference Healing');
  console.log('-'.repeat(40));

  // Simulate invalid version reference
  const invalidVersion = {
    version: "1",
    s3dbVersion: "8.0.2",
    resources: {
      "inventory": {
        currentVersion: "v999", // Non-existent version
        versions: {
          "v1": {
            hash: "sha256:mno345",
            attributes: { item: "string", quantity: "number" }
          },
          "v1": {
            hash: "sha256:pqr678",
            attributes: { item: "string", quantity: "number", location: "string" }
          }
        }
      }
    }
  };

  console.log('📝 Invalid version reference (v999 does not exist):');
  console.log(JSON.stringify(invalidVersion, null, 2));

  await s3db.client.putObject({
    key: 's3db.json',
    body: JSON.stringify(invalidVersion),
    contentType: 'application/json'
  });

  await s3db.connect();
  console.log('✅ Connection successful! Invalid version reference was corrected to available version.');

  console.log('\n5. Testing Hook Cleanup');
  console.log('-'.repeat(40));

  // Simulate corrupted hooks
  const corruptedHooks = {
    version: "1",
    s3dbVersion: "8.0.2",
    resources: {
      "notifications": {
        currentVersion: "v1",
        versions: {
          "v1": {
            hash: "sha256:stu901",
            attributes: { message: "string", sent: "boolean" },
            hooks: {
              beforeInsert: [null, undefined, "validHook", null, "", false, 0],
              afterUpdate: "not_an_array",
              beforeDelete: {
                invalid: "object"
              }
            }
          }
        }
      }
    }
  };

  console.log('📝 Corrupted hooks (null values, wrong types):');
  console.log(JSON.stringify(corruptedHooks, null, 2));

  await s3db.client.putObject({
    key: 's3db.json',
    body: JSON.stringify(corruptedHooks),
    contentType: 'application/json'
  });

  await s3db.connect();
  console.log('✅ Connection successful! Corrupted hooks were cleaned up.');

  console.log('\n6. Testing Panic Mode (Complete Corruption)');
  console.log('-'.repeat(40));

  // Simulate completely corrupted content
  const totallyCorrupted = '{[}]{{invalid"""json:::syntax:::error';

  console.log('📝 Completely corrupted content:');
  console.log(totallyCorrupted);

  await s3db.client.putObject({
    key: 's3db.json',
    body: totallyCorrupted,
    contentType: 'application/json'
  });

  await s3db.connect();
  console.log('✅ Connection successful! Corrupted file was backed up and replaced with blank structure.');

  // Check for backup files
  const objects = await s3db.client.listObjects();
  const backups = objects.filter(obj => obj.Key.includes('corrupted') && obj.Key.includes('backup'));
  if (backups.length > 0) {
    console.log(`📦 Backup file created: ${backups[0].Key}`);
  }

  console.log('\n7. Final Metadata State');
  console.log('-'.repeat(40));

  console.log('📋 Current metadata structure:');
  console.table([
    { Field: 'version', Value: s3db.savedMetadata.version },
    { Field: 's3dbVersion', Value: s3db.savedMetadata.s3dbVersion },
    { Field: 'lastUpdated', Value: s3db.savedMetadata.lastUpdated },
    { Field: 'resources', Value: `${Object.keys(s3db.savedMetadata.resources || {}).length} resources` }
  ]);

  if (Object.keys(s3db.savedMetadata.resources || {}).length > 0) {
    console.log('\n📊 Resources in metadata:');
    const resourceTable = [];
    for (const [name, resource] of Object.entries(s3db.savedMetadata.resources)) {
      resourceTable.push({
        Name: name,
        CurrentVersion: resource.currentVersion,
        Versions: Object.keys(resource.versions || {}).join(', '),
        Partitions: Object.keys(resource.partitions || {}).length
      });
    }
    console.table(resourceTable);
  }

  console.log('\n8. Performance and Statistics');
  console.log('-'.repeat(40));

  console.log('📈 Self-healing system benefits:');
  console.log('   ✓ Automatic recovery from JSON syntax errors');
  console.log('   ✓ Structural validation and repair');
  console.log('   ✓ Version reference correction');
  console.log('   ✓ Hook cleanup and validation');
  console.log('   ✓ Automatic backup creation');
  console.log('   ✓ Zero downtime operation');
  console.log('   ✓ Detailed logging and monitoring');

  console.log('\n💡 Best Practices:');
  console.log('   • Enable verbose logging in production');
  console.log('   • Monitor metadataHealed events');
  console.log('   • Implement additional backup strategies');
  console.log('   • Test healing scenarios in staging');

  await teardownDatabase();

  console.log('\n' + '='.repeat(60));
  console.log('Self-Healing Demonstration Complete!');
  console.log('='.repeat(60));
}

// Run the demonstration
demonstrateSelfHealing().catch(console.error); 