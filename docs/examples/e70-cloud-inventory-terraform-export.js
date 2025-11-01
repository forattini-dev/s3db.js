/**
 * e70-cloud-inventory-terraform-export.js
 *
 * Export Cloud Inventory to Terraform/OpenTofu State
 *
 * This example demonstrates the "Brownfield to IaC" workflow:
 * 1. Discover existing cloud resources (not managed by Terraform)
 * 2. Export to .tfstate format
 * 3. Import into Terraform/OpenTofu for IaC management
 *
 * Use Cases:
 * - Migrate existing infrastructure to Terraform management
 * - Generate Terraform state for disaster recovery
 * - Create IaC baselines for compliance/audit
 * - Multi-cloud infrastructure-as-code workflows
 */

import { Database } from '../../src/index.js';
import { CloudInventoryPlugin } from '../../src/plugins/cloud-inventory.plugin.js';
import {
  registerCloudDriver,
  BaseCloudDriver
} from '../../src/plugins/cloud-inventory/index.js';

class FixtureAwsDriver extends BaseCloudDriver {
  async listResources() {
    return Array.isArray(this.config.sampleResources) ? this.config.sampleResources : [];
  }
}

async function main() {
  console.log('🚀 Cloud Inventory → Terraform State Export Example\n');

  // 1. Initialize Database
  const db = new Database({
    client: 'memory',
    bucketName: 'cloud-inventory-export-demo'
  });

  // 2. Register a lightweight fixture driver for local experimentation.
  //    Production installs should use `driver: "aws"` with real credentials.
  registerCloudDriver('fixture-aws', (options = {}) => new FixtureAwsDriver(options));

  // 3. Configure Cloud Inventory Plugin with the fixture driver
  const cloudInventory = new CloudInventoryPlugin({
    clouds: [
      {
        id: 'aws-production',
        driver: 'fixture-aws',
        credentials: {},
        config: {
          accountId: '123456789012',
          region: 'us-east-1',
          sampleResources: [
            {
              resourceId: 'i-1234567890abcdef0',
              region: 'us-east-1',
              service: 'ec2',
              resourceType: 'aws.ec2.instance',
              name: 'web-server-1',
              configuration: {
                instanceId: 'i-1234567890abcdef0',
                instanceType: 't3.medium',
                state: 'running',
                privateIpAddress: '10.0.1.10',
                publicIpAddress: '54.123.45.67',
                subnetId: 'subnet-abc123',
                vpcId: 'vpc-xyz789',
                tags: {
                  Name: 'web-server-1',
                  Environment: 'production',
                  Team: 'backend'
                }
              },
              tags: {
                Name: 'web-server-1',
                Environment: 'production'
              }
            },
            {
              resourceId: 'my-app-bucket',
              region: 'us-east-1',
              service: 's3',
              resourceType: 'aws.s3.bucket',
              name: 'my-app-bucket',
              configuration: {
                bucketName: 'my-app-bucket',
                region: 'us-east-1',
                versioning: { Status: 'Enabled' },
                encryption: {
                  Rules: [{
                    ApplyServerSideEncryptionByDefault: {
                      SSEAlgorithm: 'AES256'
                    }
                  }]
                },
                tags: [
                  { Key: 'Environment', Value: 'production' },
                  { Key: 'Application', Value: 'my-app' }
                ]
              },
              tags: {
                Environment: 'production',
                Application: 'my-app'
              }
            },
            {
              resourceId: 'prod-postgres',
              region: 'us-east-1',
              service: 'rds',
              resourceType: 'aws.rds.instance',
              name: 'prod-postgres',
              configuration: {
                dbInstanceIdentifier: 'prod-postgres',
                dbInstanceClass: 'db.t3.medium',
                engine: 'postgres',
                engineVersion: '15.3',
                masterUsername: 'admin',
                allocatedStorage: 100,
                storageType: 'gp3',
                multiAZ: true,
                publiclyAccessible: false,
                tags: [
                  { Key: 'Environment', Value: 'production' },
                  { Key: 'Application', Value: 'my-app' }
                ]
              },
              tags: {
                Environment: 'production',
                Application: 'my-app'
              }
            }
          ]
        }
      }
    ],
    discovery: {
      runOnInstall: true
    },
    verbose: true
  });

  // 4. Install plugin and discover resources
  await db.use(cloudInventory);
  console.log('✅ Cloud Inventory Plugin installed\n');

  // Wait for discovery to complete
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📊 Discovery Results:');
  const snapshots = await cloudInventory._resourceHandles.snapshots.list();
  console.log(`   Total resources discovered: ${snapshots.length}`);
  snapshots.forEach(s => {
    console.log(`   - ${s.resourceType}: ${s.name} (${s.resourceId})`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('📤 Exporting to Terraform State Format');
  console.log('='.repeat(80) + '\n');

  // 4. Export ALL resources to Terraform state
  console.log('1️⃣  Export ALL discovered resources:');
  const allResult = await cloudInventory.exportToTerraformState();
  console.log(`   ✅ Converted: ${allResult.stats.converted} resources`);
  console.log(`   ⏭️  Skipped: ${allResult.stats.skipped} resources`);
  if (allResult.stats.skippedTypes.length > 0) {
    console.log(`   ⚠️  Unmapped types: ${allResult.stats.skippedTypes.join(', ')}`);
  }
  console.log(`   📦 Terraform resources: ${allResult.state.resources.length}\n`);

  // Show sample of exported Terraform resource
  if (allResult.state.resources.length > 0) {
    const sample = allResult.state.resources[0];
    console.log('   Sample Terraform resource:');
    console.log(JSON.stringify(sample, null, 2).split('\n').map(l => '   ' + l).join('\n'));
    console.log();
  }

  // 5. Export AWS resources only
  console.log('2️⃣  Export AWS resources only:');
  const awsResult = await cloudInventory.exportToTerraformState({
    providers: ['aws']
  });
  console.log(`   ✅ AWS resources exported: ${awsResult.stats.converted}\n`);

  // 6. Export specific resource types
  console.log('3️⃣  Export only EC2 instances and RDS databases:');
  const specificResult = await cloudInventory.exportToTerraformState({
    resourceTypes: ['aws.ec2.instance', 'aws.rds.instance']
  });
  console.log(`   ✅ Filtered resources exported: ${specificResult.stats.converted}\n`);

  // 7. Export to file
  console.log('4️⃣  Export to local file:');
  const fileResult = await cloudInventory.exportToTerraformStateFile(
    './terraform-discovered.tfstate',
    { providers: ['aws'] }
  );
  console.log(`   ✅ File created: ${fileResult.filePath}`);
  console.log(`   📊 Resources: ${fileResult.stats.converted}\n`);

  // 8. Export with custom Terraform version and serial
  console.log('5️⃣  Export with custom options:');
  const customResult = await cloudInventory.exportToTerraformState({
    terraformVersion: '1.6.0',
    serial: 42,
    lineage: 'custom-lineage-uuid-12345',
    outputs: {
      web_server_ip: {
        value: '54.123.45.67',
        type: 'string'
      }
    }
  });
  console.log(`   ✅ Terraform version: ${customResult.state.terraform_version}`);
  console.log(`   ✅ Serial: ${customResult.state.serial}`);
  console.log(`   ✅ Lineage: ${customResult.state.lineage}\n`);

  console.log('\n' + '='.repeat(80));
  console.log('🎯 Next Steps: Import into Terraform/OpenTofu');
  console.log('='.repeat(80) + '\n');

  console.log('Option 1: Use generated state file directly');
  console.log('```bash');
  console.log('cp terraform-discovered.tfstate terraform.tfstate');
  console.log('terraform plan  # Terraform will recognize existing resources');
  console.log('```\n');

  console.log('Option 2: Import individual resources');
  console.log('```bash');
  console.log('terraform import aws_instance.resource_i_1234567890abcdef0 i-1234567890abcdef0');
  console.log('terraform import aws_s3_bucket.resource_my_app_bucket my-app-bucket');
  console.log('terraform import aws_db_instance.resource_prod_postgres prod-postgres');
  console.log('```\n');

  console.log('Option 3: Generate Terraform configuration from state');
  console.log('```bash');
  console.log('terraform show -json terraform-discovered.tfstate > state.json');
  console.log('# Use tools like "terraformer" or write custom script');
  console.log('```\n');

  console.log('✅ Example complete!');
  console.log('\n📚 Learn more:');
  console.log('   - Terraform import: https://www.terraform.io/docs/cli/import/index.html');
  console.log('   - OpenTofu: https://opentofu.org/');
  console.log('   - Cloud Inventory Plugin: docs/plugins/cloud-inventory.md');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
