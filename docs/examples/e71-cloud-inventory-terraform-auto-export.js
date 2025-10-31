/**
 * e71-cloud-inventory-terraform-auto-export.js
 *
 * Cloud Inventory with Automatic Terraform Export
 *
 * This example demonstrates the "continuous IaC sync" workflow:
 * 1. Configure plugin with terraform auto-export
 * 2. Run discovery (manual or scheduled)
 * 3. Terraform state automatically exported after each sync
 * 4. Use exported state with Terraform/OpenTofu
 *
 * Use Cases:
 * - Continuous infrastructure-as-code synchronization
 * - Auto-generate Terraform state on schedule (hourly, daily)
 * - Maintain always-up-to-date IaC state files
 * - GitOps workflows with automatic commits
 */

import { Database } from '../../src/index.js';
import { CloudInventoryPlugin } from '../../src/plugins/cloud-inventory.plugin.js';

async function main() {
  console.log('🚀 Cloud Inventory → Automatic Terraform Export Example\n');

  // 1. Initialize Database
  const db = new Database({
    client: 'memory',
    bucketName: 'cloud-inventory-auto-export-demo'
  });

  // 2. Configure Cloud Inventory Plugin with Auto-Export
  const cloudInventory = new CloudInventoryPlugin({
    clouds: [
      {
        id: 'aws-production',
        driver: 'aws-mock',
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
                tags: {
                  Name: 'web-server-1',
                  Environment: 'production'
                }
              },
              tags: { Name: 'web-server-1', Environment: 'production' }
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
                versioning: { Status: 'Enabled' }
              },
              tags: { Environment: 'production' }
            }
          ]
        }
      },
      {
        id: 'gcp-staging',
        driver: 'gcp-mock',
        credentials: {},
        config: {
          projectId: 'my-gcp-project',
          region: 'us-central1',
          sampleResources: [
            {
              resourceId: 'staging-vm-1',
              region: 'us-central1',
              service: 'compute',
              resourceType: 'gcp.compute.instance',
              name: 'staging-vm-1',
              configuration: {
                id: 'staging-vm-1',
                name: 'staging-vm-1',
                machineType: 'e2-medium',
                status: 'RUNNING'
              },
              labels: { environment: 'staging' }
            }
          ]
        }
      }
    ],
    discovery: {
      runOnInstall: true
    },
    // 🔥 Terraform Auto-Export Configuration
    terraform: {
      enabled: true,
      autoExport: true, // Export after each discovery
      output: './terraform-auto-export.tfstate',
      outputType: 'file', // 'file', 's3', or 'custom'
      filters: {
        providers: [], // Empty = all providers
        resourceTypes: [], // Empty = all resource types
        cloudId: null // null = all clouds
      },
      terraformVersion: '1.6.0',
      serial: 1
    },
    verbose: true
  });

  // 3. Install plugin and discover resources
  await db.use(cloudInventory);
  console.log('✅ Cloud Inventory Plugin installed\n');

  // Wait for discovery to complete
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n' + '='.repeat(80));
  console.log('📊 Discovery & Auto-Export Results');
  console.log('='.repeat(80) + '\n');

  const snapshots = await cloudInventory._resourceHandles.snapshots.list();
  console.log(`Total resources discovered: ${snapshots.length}`);
  snapshots.forEach(s => {
    console.log(`   - ${s.resourceType}: ${s.name} (${s.resourceId})`);
  });

  console.log('\n✅ Terraform state automatically exported to: ./terraform-auto-export.tfstate\n');

  // 4. Example: S3 Output
  console.log('='.repeat(80));
  console.log('📤 Alternative: S3 Auto-Export Configuration');
  console.log('='.repeat(80) + '\n');

  console.log('Configure plugin with S3 output:\n');
  console.log(`const plugin = new CloudInventoryPlugin({
  clouds: [...],
  terraform: {
    enabled: true,
    autoExport: true,
    output: 's3://my-terraform-bucket/states/production.tfstate',
    outputType: 's3',
    filters: {
      providers: ['aws'] // Only AWS resources
    }
  }
});\n`);

  // 5. Example: Custom Function
  console.log('='.repeat(80));
  console.log('⚙️  Alternative: Custom Export Function');
  console.log('='.repeat(80) + '\n');

  console.log('Configure plugin with custom export logic:\n');
  console.log(`const plugin = new CloudInventoryPlugin({
  clouds: [...],
  terraform: {
    enabled: true,
    autoExport: true,
    output: async (stateData) => {
      // Custom export logic
      console.log('Exporting', stateData.stats);

      // Option 1: Send to webhook
      await fetch('https://api.example.com/terraform-state', {
        method: 'POST',
        body: JSON.stringify(stateData.state)
      });

      // Option 2: Commit to Git
      await fs.writeFile('./terraform.tfstate', JSON.stringify(stateData.state, null, 2));
      await exec('git add terraform.tfstate && git commit -m "Update Terraform state" && git push');

      // Option 3: Upload to multiple locations
      await Promise.all([
        uploadToS3(stateData.state),
        uploadToGCS(stateData.state),
        sendToSlack({ text: 'Terraform state updated!' })
      ]);

      return { success: true, timestamp: new Date() };
    },
    outputType: 'custom'
  }
});\n`);

  // 6. Example: Scheduled Auto-Export
  console.log('='.repeat(80));
  console.log('⏰ Alternative: Scheduled Auto-Export');
  console.log('='.repeat(80) + '\n');

  console.log('Configure plugin with scheduled discovery + auto-export:\n');
  console.log(`const plugin = new CloudInventoryPlugin({
  clouds: [
    {
      id: 'aws-prod',
      driver: 'aws',
      credentials: {...},
      scheduled: {
        enabled: true,
        cron: '0 * * * *', // Every hour
        timezone: 'UTC'
      }
    }
  ],
  terraform: {
    enabled: true,
    autoExport: true,
    output: 's3://terraform-states/hourly-sync.tfstate',
    outputType: 's3',
    filters: {
      providers: ['aws'],
      cloudId: null // Export after each cloud sync
    }
  }
});

// Now Terraform state exports automatically every hour!
await plugin.install(database);\n`);

  console.log('='.repeat(80));
  console.log('🎯 Use Cases for Auto-Export');
  console.log('='.repeat(80) + '\n');

  console.log('1. **Continuous IaC Sync**: Keep Terraform state always up-to-date');
  console.log('   - Schedule: Hourly or daily discovery');
  console.log('   - Output: S3 bucket for Terraform remote state');
  console.log('   - Result: Infrastructure changes auto-reflected in Terraform\n');

  console.log('2. **GitOps Workflow**: Auto-commit state changes');
  console.log('   - Custom function: Write to file + git commit + push');
  console.log('   - Result: Infrastructure changes tracked in Git\n');

  console.log('3. **Multi-Environment Sync**: Separate exports per cloud');
  console.log('   - Filter by cloudId: Export production separately from staging');
  console.log('   - Output: Different S3 keys per environment');
  console.log('   - Result: Isolated Terraform state per environment\n');

  console.log('4. **Compliance Auditing**: Continuous state snapshots');
  console.log('   - Schedule: Daily exports');
  console.log('   - Custom function: Upload to compliance system');
  console.log('   - Result: Historical infrastructure state for audits\n');

  console.log('='.repeat(80));
  console.log('🔧 Next Steps');
  console.log('='.repeat(80) + '\n');

  console.log('1. Configure auto-export in your plugin:');
  console.log('   ```javascript');
  console.log('   terraform: {');
  console.log('     enabled: true,');
  console.log('     autoExport: true,');
  console.log('     output: \'./terraform.tfstate\',');
  console.log('     outputType: \'file\'');
  console.log('   }');
  console.log('   ```\n');

  console.log('2. Set up scheduled discovery:');
  console.log('   ```javascript');
  console.log('   scheduled: {');
  console.log('     enabled: true,');
  console.log('     cron: \'0 */6 * * *\', // Every 6 hours');
  console.log('     timezone: \'UTC\'');
  console.log('   }');
  console.log('   ```\n');

  console.log('3. Use exported state with Terraform:');
  console.log('   ```bash');
  console.log('   terraform plan   # Uses auto-exported state');
  console.log('   terraform apply  # Apply changes if needed');
  console.log('   ```\n');

  console.log('✅ Example complete!');
  console.log('\n📚 Learn more:');
  console.log('   - Auto-export docs: docs/plugins/cloud-inventory.md#auto-export');
  console.log('   - Manual export: docs/examples/e70-cloud-inventory-terraform-export.js');
  console.log('   - Terraform docs: https://www.terraform.io/docs/cli/state/index.html');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
