/**
 * Example: Terraform/OpenTofu State Tracking with TfStatePlugin
 *
 * **Note**: This plugin works with both Terraform and OpenTofu state files.
 * OpenTofu (https://opentofu.org) is an open-source fork of Terraform.
 *
 * Demonstrates how to:
 * 1. Import Terraform/OpenTofu state files into s3db
 * 2. Import state from remote S3 buckets (Terraform remote state backend)
 * 3. Bulk import multiple state files using glob patterns (*, **, ?, [])
 * 4. Track source file for each imported resource
 * 5. Track infrastructure changes over time
 * 6. Query resources by type, attributes, and source file
 * 7. Calculate diffs between state versions
 * 8. Monitor infrastructure with auto-sync
 * 9. Export resources back to Terraform state format (bidirectional conversion)
 * 10. Round-trip conversion: Terraform → s3db → Terraform
 */

import { Database, TfStatePlugin } from '../../src/index.js';
import { writeFileSync } from 'fs';

// Helper: Create example Terraform state file
function createExampleStateFile(serial, resources) {
  const state = {
    version: 4,
    terraform_version: '1.5.0',
    serial,
    lineage: 'example-lineage-abc-123',
    outputs: {},
    resources
  };

  const filePath = `./example-terraform-${serial}.tfstate`;
  writeFileSync(filePath, JSON.stringify(state, null, 2));
  return filePath;
}

async function main() {
  console.log('========================================');
  console.log('Terraform State Tracking Example');
  console.log('========================================\n');

  // Create database
  const database = new Database({
    connectionString: process.env.BUCKET_CONNECTION_STRING || 's3://minioadmin:minioadmin@localhost:9000/s3db-terraform'
  });

  // Configure TfStatePlugin
  const terraformPlugin = new TfStatePlugin({
    resourceName: 'terraform_resources',
    stateHistoryName: 'terraform_state_history',
    trackDiffs: true,
    verbose: true,
    filters: {
      // Only track specific resource types
      types: ['aws_instance', 'aws_s3_bucket', 'aws_dynamodb_table'],
      // Exclude data sources
      exclude: ['data.*']
    }
  });

  // Install plugin
  await database.usePlugin(terraformPlugin);

  console.log('\n✅ TfStatePlugin installed\n');

  // ========================================
  // 1. Create Initial Terraform State
  // ========================================
  console.log('📝 Creating initial Terraform state (serial 1)...\n');

  const stateFile1 = createExampleStateFile(1, [
    {
      mode: 'managed',
      type: 'aws_instance',
      name: 'web_server',
      provider: 'provider["registry.terraform.io/hashicorp/aws"]',
      instances: [
        {
          attributes: {
            id: 'i-1234567890abcdef0',
            instance_type: 't2.micro',
            ami: 'ami-0c55b159cbfafe1f0',
            availability_zone: 'us-east-1a',
            public_ip: '54.123.45.67',
            tags: {
              Name: 'Web Server',
              Environment: 'production'
            }
          }
        }
      ]
    },
    {
      mode: 'managed',
      type: 'aws_s3_bucket',
      name: 'app_bucket',
      provider: 'provider["registry.terraform.io/hashicorp/aws"]',
      instances: [
        {
          attributes: {
            id: 'my-app-bucket-2024',
            bucket: 'my-app-bucket-2024',
            region: 'us-east-1',
            versioning: { enabled: true }
          }
        }
      ]
    }
  ]);

  const result1 = await terraformPlugin.importState(stateFile1);

  console.log('Import Result:', {
    serial: result1.serial,
    resourcesExtracted: result1.resourcesExtracted,
    resourcesInserted: result1.resourcesInserted,
    duration: `${result1.duration}ms`
  });

  // ========================================
  // 2. Query Terraform Resources
  // ========================================
  console.log('\n📊 Querying Terraform resources...\n');

  const resources = terraformPlugin.resource;

  // Get all resources from latest state
  const allResources = await resources.list({ limit: 100 });
  console.log(`Total resources: ${allResources.length}\n`);

  // Query by resource type
  const ec2Instances = await resources.query({ resourceType: 'aws_instance' });
  console.log('EC2 Instances:');
  ec2Instances.forEach(instance => {
    console.log(`  - ${instance.resourceAddress}:`, {
      instanceType: instance.attributes.instance_type,
      ami: instance.attributes.ami,
      publicIp: instance.attributes.public_ip
    });
  });

  // Query S3 buckets
  const s3Buckets = await resources.query({ resourceType: 'aws_s3_bucket' });
  console.log('\nS3 Buckets:');
  s3Buckets.forEach(bucket => {
    console.log(`  - ${bucket.resourceAddress}:`, {
      bucketName: bucket.attributes.bucket,
      region: bucket.attributes.region,
      versioning: bucket.attributes.versioning?.enabled
    });
  });

  // ========================================
  // 3. Create Updated State (Serial 2)
  // ========================================
  console.log('\n📝 Creating updated Terraform state (serial 2)...\n');
  console.log('Changes:');
  console.log('  - Modified EC2 instance type: t2.micro → t2.small');
  console.log('  - Added new DynamoDB table');
  console.log('  - Deleted S3 bucket\n');

  const stateFile2 = createExampleStateFile(2, [
    {
      mode: 'managed',
      type: 'aws_instance',
      name: 'web_server',
      provider: 'provider["registry.terraform.io/hashicorp/aws"]',
      instances: [
        {
          attributes: {
            id: 'i-1234567890abcdef0',
            instance_type: 't2.small', // CHANGED
            ami: 'ami-0c55b159cbfafe1f0',
            availability_zone: 'us-east-1a',
            public_ip: '54.123.45.67',
            tags: {
              Name: 'Web Server',
              Environment: 'production'
            }
          }
        }
      ]
    },
    // S3 bucket removed
    {
      mode: 'managed',
      type: 'aws_dynamodb_table',
      name: 'app_table', // ADDED
      provider: 'provider["registry.terraform.io/hashicorp/aws"]',
      instances: [
        {
          attributes: {
            id: 'app-table',
            name: 'app-table',
            billing_mode: 'PAY_PER_REQUEST',
            hash_key: 'id'
          }
        }
      ]
    }
  ]);

  const result2 = await terraformPlugin.importState(stateFile2);

  console.log('Import Result:', {
    serial: result2.serial,
    resourcesExtracted: result2.resourcesExtracted,
    resourcesInserted: result2.resourcesInserted,
    diff: result2.diff,
    duration: `${result2.duration}ms`
  });

  // ========================================
  // 4. Analyze State History and Diffs
  // ========================================
  console.log('\n📈 Analyzing state history...\n');

  const stateHistory = terraformPlugin.stateHistoryResource;
  const allStates = await stateHistory.list({ sort: { serial: 1 } });

  console.log('State History:');
  allStates.forEach(state => {
    console.log(`\nSerial ${state.serial}:`);
    console.log(`  - Terraform Version: ${state.terraformVersion}`);
    console.log(`  - Resource Count: ${state.resourceCount}`);
    console.log(`  - Imported At: ${new Date(state.importedAt).toISOString()}`);

    if (state.diff && !state.diff.isFirst) {
      console.log('  - Changes:');
      if (state.diff.added.length > 0) {
        console.log(`    Added: ${state.diff.added.map(r => r.address).join(', ')}`);
      }
      if (state.diff.modified.length > 0) {
        console.log(`    Modified: ${state.diff.modified.map(r => r.address).join(', ')}`);
        state.diff.modified.forEach(mod => {
          console.log(`      Changes in ${mod.address}:`);
          mod.changes.forEach(change => {
            console.log(`        - ${change.field}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`);
          });
        });
      }
      if (state.diff.deleted.length > 0) {
        console.log(`    Deleted: ${state.diff.deleted.map(r => r.address).join(', ')}`);
      }
    }
  });

  // ========================================
  // 5. Query Resources by State Serial
  // ========================================
  console.log('\n🔍 Comparing resources across states...\n');

  const resourcesSerial1 = await resources.query({ stateSerial: 1 });
  const resourcesSerial2 = await resources.query({ stateSerial: 2 });

  console.log(`Resources in Serial 1: ${resourcesSerial1.length}`);
  resourcesSerial1.forEach(r => console.log(`  - ${r.resourceAddress} (${r.resourceType})`));

  console.log(`\nResources in Serial 2: ${resourcesSerial2.length}`);
  resourcesSerial2.forEach(r => console.log(`  - ${r.resourceAddress} (${r.resourceType})`));

  // ========================================
  // 6. Plugin Statistics
  // ========================================
  console.log('\n📊 Plugin Statistics:\n');

  const stats = terraformPlugin.getStats();
  console.log(stats);

  // ========================================
  // 7. Advanced Queries
  // ========================================
  console.log('\n🔎 Advanced Queries:\n');

  // Find all EC2 instances of type t2.small
  const t2SmallInstances = await resources.query({
    resourceType: 'aws_instance',
    'attributes.instance_type': 't2.small'
  });
  console.log(`EC2 instances with type t2.small: ${t2SmallInstances.length}`);

  // Find resources in specific availability zone
  const usEast1aResources = await resources.query({
    'attributes.availability_zone': 'us-east-1a'
  });
  console.log(`Resources in us-east-1a: ${usEast1aResources.length}`);

  // Find all managed resources (exclude data sources)
  const managedResources = await resources.query({ mode: 'managed' });
  console.log(`Managed resources: ${managedResources.length}`);

  // ========================================
  // 8. Import Multiple States Using Glob Patterns
  // ========================================
  console.log('\n🔍 Importing Multiple State Files with Glob Patterns...\n');
  console.log('This demonstrates bulk importing from multiple state files in S3.\n');

  try {
    // Upload multiple state files to S3 in different environments
    const envStates = [
      {
        key: 'terraform/envs/prod/terraform.tfstate',
        serial: 10,
        resources: [
          {
            mode: 'managed',
            type: 'aws_instance',
            name: 'prod_web',
            instances: [{
              attributes: {
                id: 'i-prod-web',
                instance_type: 't3.large',
                availability_zone: 'us-east-1a',
                tags: { Environment: 'production', Service: 'web' }
              }
            }]
          }
        ]
      },
      {
        key: 'terraform/envs/staging/terraform.tfstate',
        serial: 8,
        resources: [
          {
            mode: 'managed',
            type: 'aws_instance',
            name: 'staging_web',
            instances: [{
              attributes: {
                id: 'i-staging-web',
                instance_type: 't3.medium',
                availability_zone: 'us-east-1b',
                tags: { Environment: 'staging', Service: 'web' }
              }
            }]
          }
        ]
      },
      {
        key: 'terraform/envs/dev/terraform.tfstate',
        serial: 5,
        resources: [
          {
            mode: 'managed',
            type: 'aws_instance',
            name: 'dev_web',
            instances: [{
              attributes: {
                id: 'i-dev-web',
                instance_type: 't3.small',
                availability_zone: 'us-east-1c',
                tags: { Environment: 'dev', Service: 'web' }
              }
            }]
          }
        ]
      }
    ];

    const remoteBucket = process.env.BUCKET_CONNECTION_STRING?.match(/\/\/.*@.*\/(.*)/)?.[1] || 's3db-terraform';

    // Upload all state files
    for (const envState of envStates) {
      const stateContent = JSON.stringify({
        version: 4,
        terraform_version: '1.5.0',
        serial: envState.serial,
        lineage: `${envState.key}-lineage`,
        outputs: {},
        resources: envState.resources
      });

      await database.client.putObject({
        Bucket: remoteBucket,
        Key: envState.key,
        Body: stateContent,
        ContentType: 'application/json'
      });
    }

    console.log(`✅ Uploaded ${envStates.length} state files to S3\n`);

    // Example 1: Import all .tfstate files recursively
    console.log('Example 1: Import all .tfstate files recursively');
    const globResult1 = await terraformPlugin.importStatesFromS3Glob(remoteBucket, 'terraform/**/*.tfstate');

    console.log('Glob Import Result:', {
      pattern: 'terraform/**/*.tfstate',
      filesProcessed: globResult1.filesProcessed,
      filesFailed: globResult1.filesFailed,
      totalResourcesExtracted: globResult1.totalResourcesExtracted,
      totalResourcesInserted: globResult1.totalResourcesInserted,
      duration: `${globResult1.duration}ms`
    });

    console.log('\nProcessed Files:');
    globResult1.files.forEach(file => {
      console.log(`  - ${file.file}: serial ${file.serial}, ${file.resourcesExtracted} resources`);
    });

    // Example 2: Import specific environment pattern
    console.log('\n\nExample 2: Import only production and staging environments');

    // First, let's query resources imported so far
    const allResources = await resources.list({ limit: 100 });
    console.log(`\nTotal resources in database: ${allResources.length}`);

    // Query by environment using sourceFile pattern
    const prodResources = allResources.filter(r => r.sourceFile?.includes('/prod/'));
    const stagingResources = allResources.filter(r => r.sourceFile?.includes('/staging/'));

    console.log(`Production resources: ${prodResources.length}`);
    console.log(`Staging resources: ${stagingResources.length}`);

    prodResources.forEach(resource => {
      console.log(`  - ${resource.resourceAddress} from ${resource.sourceFile}`);
    });

    // Example 3: Query resources by sourceFile
    console.log('\n\nExample 3: Query resources from specific state file');
    const devStateResources = await resources.query({
      sourceFile: 'terraform/envs/dev/terraform.tfstate'
    });

    console.log(`Resources from dev state: ${devStateResources.length}`);
    devStateResources.forEach(resource => {
      console.log(`  - ${resource.resourceAddress}:`, {
        instanceType: resource.attributes.instance_type,
        az: resource.attributes.availability_zone,
        sourceFile: resource.sourceFile
      });
    });

    // Example 4: Import with custom concurrency
    console.log('\n\nExample 4: Import with custom concurrency settings');
    const globResult2 = await terraformPlugin.importStatesFromS3Glob(
      remoteBucket,
      'terraform/envs/*/terraform.tfstate',
      { concurrency: 2 }  // Process 2 files at a time
    );

    console.log('Concurrent Import Result:', {
      pattern: 'terraform/envs/*/terraform.tfstate',
      filesProcessed: globResult2.filesProcessed,
      concurrency: 2
    });

    console.log('\n✅ Glob import examples completed!\n');

    // Cleanup
    for (const envState of envStates) {
      await database.client.deleteObject({
        Bucket: remoteBucket,
        Key: envState.key
      });
    }
  } catch (error) {
    console.log('⚠️  Glob import example skipped (requires valid S3 credentials)');
    console.log('   Error:', error.message);
  }

  // ========================================
  // 9. Import from Remote S3 State (Single File)
  // ========================================
  console.log('\n☁️  Importing from Remote S3 State...\n');
  console.log('This demonstrates reading Terraform/OpenTofu remote state from S3.\n');

  try {
    // Example: Import state from S3 remote backend
    // This would work with a real Terraform S3 backend configuration:
    // terraform {
    //   backend "s3" {
    //     bucket = "my-tfstate"
    //     key    = "prod/terraform.tfstate"
    //     region = "us-east-1"
    //   }
    // }

    // For this example, we'll upload one of our test states to S3 first
    const testStateContent = JSON.stringify({
      version: 4,
      terraform_version: '1.5.0',
      serial: 3,
      lineage: 'remote-example-lineage',
      outputs: {},
      resources: [
        {
          mode: 'managed',
          type: 'aws_lambda_function',
          name: 'api',
          instances: [{
            attributes: {
              id: 'api-lambda',
              function_name: 'api-lambda',
              runtime: 'nodejs18.x',
              handler: 'index.handler'
            }
          }]
        }
      ]
    });

    // Upload test state to S3 (simulating remote state)
    const remoteBucket = process.env.BUCKET_CONNECTION_STRING?.match(/\/\/.*@.*\/(.*)/)?.[1] || 's3db-terraform';
    const remoteKey = 'terraform/prod/terraform.tfstate';

    await database.client.putObject({
      Bucket: remoteBucket,
      Key: remoteKey,
      Body: testStateContent,
      ContentType: 'application/json'
    });

    console.log(`✅ Uploaded test state to s3://${remoteBucket}/${remoteKey}\n`);

    // Import from remote S3 state
    const remoteResult = await terraformPlugin.importStateFromS3(remoteBucket, remoteKey);

    console.log('Remote State Import Result:', {
      source: remoteResult.source,
      serial: remoteResult.serial,
      resourcesExtracted: remoteResult.resourcesExtracted,
      resourcesInserted: remoteResult.resourcesInserted,
      duration: `${remoteResult.duration}ms`
    });

    // Query the newly imported resource
    const lambdaFunctions = await resources.query({ resourceType: 'aws_lambda_function' });
    console.log('\nLambda Functions from Remote State:');
    lambdaFunctions.forEach(fn => {
      console.log(`  - ${fn.resourceAddress}:`, {
        runtime: fn.attributes.runtime,
        handler: fn.attributes.handler
      });
    });

    console.log('\n✅ Remote S3 state import successful!\n');

    // Cleanup remote state example
    await database.client.deleteObject({
      Bucket: remoteBucket,
      Key: remoteKey
    });
  } catch (error) {
    console.log('⚠️  Remote S3 example skipped (requires valid S3 credentials)');
    console.log('   Error:', error.message);
  }

  // ========================================
  // 10. Cleanup Example Files
  // ========================================
  console.log('\n🧹 Cleaning up example files...\n');

  const { unlinkSync } = await import('fs');
  try {
    unlinkSync(stateFile1);
    unlinkSync(stateFile2);
    console.log('✅ Example state files deleted\n');
  } catch (error) {
    console.error('Error deleting files:', error.message);
  }

  // ========================================
  // 11. Export Resources Back to Terraform State
  // ========================================
  console.log('\n📤 Exporting Resources Back to Terraform State...\n');
  console.log('This demonstrates converting s3db resources back to Terraform state files.\n');

  // Example 1: Export latest state
  console.log('Example 1: Export latest state to object');
  const exportedState = await terraformPlugin.exportState();

  console.log('Exported State:', {
    version: exportedState.version,
    terraformVersion: exportedState.terraform_version,
    serial: exportedState.serial,
    lineage: exportedState.lineage,
    resourceCount: exportedState.resources.length
  });

  console.log('\nExported Resources:');
  exportedState.resources.forEach(resource => {
    console.log(`  - ${resource.mode}.${resource.type}.${resource.name}`);
    console.log(`    Instances: ${resource.instances.length}`);
  });

  // Example 2: Export specific serial to file
  console.log('\n\nExample 2: Export specific serial to file');
  const exportFilePath = './exported-tfstate.tfstate';

  const fileResult = await terraformPlugin.exportStateToFile(exportFilePath, {
    serial: 2,
    terraformVersion: '1.6.0',
    lineage: 's3db-demo-export'
  });

  console.log('File Export Result:', fileResult);

  // Example 3: Export with resource type filter
  console.log('\n\nExample 3: Export only EC2 instances');
  const instancesOnly = await terraformPlugin.exportState({
    resourceTypes: ['aws_instance']
  });

  console.log('Filtered Export:', {
    resourceTypes: instancesOnly.resources.map(r => r.type),
    resourceCount: instancesOnly.resources.length
  });

  // Example 4: Export to S3
  console.log('\n\nExample 4: Export back to S3 remote state');
  const exportBucket = process.env.BUCKET_CONNECTION_STRING?.match(/\/\/.*@.*\/(.*)/)?.[1] || 's3db-terraform';
  const exportKey = 'terraform/exports/my-infrastructure.tfstate';

  try {
    const s3Result = await terraformPlugin.exportStateToS3(exportBucket, exportKey, {
      terraformVersion: '1.6.0',
      lineage: 'production-infrastructure',
      outputs: {
        vpc_id: {
          value: 'vpc-123456',
          type: 'string',
          description: 'Main VPC ID'
        },
        instance_count: {
          value: exportedState.resources.filter(r => r.type === 'aws_instance').length,
          type: 'number'
        }
      }
    });

    console.log('S3 Export Result:', {
      location: s3Result.location,
      serial: s3Result.serial,
      resourceCount: s3Result.resourceCount
    });

    // Verify we can import it back
    console.log('\n\nExample 5: Round-trip test - import the exported state');
    const reimportResult = await terraformPlugin.importStateFromS3(exportBucket, exportKey);

    console.log('Reimport Result:', {
      serial: reimportResult.serial,
      resourcesExtracted: reimportResult.resourcesExtracted,
      resourcesInserted: reimportResult.resourcesInserted
    });

    console.log('\n✅ Round-trip successful! Exported and re-imported state.\n');

    // Cleanup exported files
    await database.client.deleteObject({ Bucket: exportBucket, Key: exportKey });
  } catch (error) {
    console.log('⚠️  S3 export example skipped (requires valid S3 credentials)');
    console.log('   Error:', error.message);
  }

  // Cleanup local export file
  try {
    const { unlinkSync } = await import('fs');
    unlinkSync(exportFilePath);
    console.log('✅ Cleaned up exported state file\n');
  } catch (error) {
    // File might not exist
  }

  // Disconnect
  await database.disconnect();

  console.log('========================================');
  console.log('Example Complete!');
  console.log('========================================');

  console.log('\n💡 Key Takeaways:');
  console.log('  ✓ Compatible with both Terraform and OpenTofu state files');
  console.log('  ✓ Import state files from local filesystem or remote S3 buckets');
  console.log('  ✓ Bulk import multiple state files using glob patterns (*, **, ?, [])');
  console.log('  ✓ Export resources back to Terraform state format (bidirectional conversion)');
  console.log('  ✓ Track source file for each resource with sourceFile field');
  console.log('  ✓ Track infrastructure changes over time with diff tracking');
  console.log('  ✓ Query resources by type, attributes, state serial, and source file');
  console.log('  ✓ Analyze state history to understand infrastructure evolution');
  console.log('  ✓ Use filters to focus on specific resource types');
  console.log('  ✓ Enable auto-sync to automatically track state changes');
  console.log('  ✓ Works with Terraform S3 remote state backend out-of-the-box');
  console.log('  ✓ Configurable concurrency for bulk imports');
  console.log('  ✓ Round-trip conversion: import → s3db → export → Terraform\n');
}

// Run example
main().catch(console.error);
