/**
 * TfState Plugin - Advanced Monitoring with Drivers
 *
 * Demonstrates the new driver-based architecture for the TfState plugin with:
 * - S3 and Filesystem drivers
 * - Connection string parsing
 * - Glob pattern selector for state files
 * - Cron-based monitoring
 * - Diff lookback and timeline features
 * - Manual monitoring triggers
 *
 * NEW FEATURES (v10.0):
 * - Driver system (S3, filesystem)
 * - Connection string support (s3://key:secret@bucket/prefix?region=us-east-1)
 * - Glob pattern matching (double-star slash star dot tfstate)
 * - Cron-based monitoring (star-slash-5 for every 5 minutes)
 * - Diff lookback support (last N diffs)
 * - Timeline and comparison features
 */

import { Database } from '../../src/database.class.js';
import { TfStatePlugin } from '../../src/plugins/tfstate/index.js';

// ===================================
// EXAMPLE 1: S3 Driver with Monitoring
// ===================================
async function example1_s3DriverWithMonitoring() {
  console.log('\n=== Example 1: S3 Driver with Cron Monitoring ===\n');

  const database = new Database({
    bucketName: 's3db-tfstate-demo',
    region: 'us-east-1'
  });

  await database.connect();

  // NEW: Driver-based configuration with S3
  const tfStatePlugin = new TfStatePlugin({
    driver: 's3',
    config: {
      // Connection string format: s3://accessKey:secretKey@bucket/prefix?region=us-east-1
      connectionString: 's3://AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY@terraform-states/production?region=us-east-1',
      // Glob pattern to select state files
      selector: '**/*.tfstate'
    },
    resources: {
      stateFiles: 'tfstate_files',
      resources: 'tfstate_resources',
      diffs: 'tfstate_diffs'
    },
    monitor: {
      enabled: true,
      cron: '*/5 * * * *' // Check every 5 minutes
    },
    diffs: {
      enabled: true,
      lookback: 20 // Keep history of last 20 diffs
    },
    verbose: true
  });

  await database.usePlugin(tfStatePlugin);

  console.log('Plugin installed with S3 driver');
  console.log('Monitoring enabled: checking every 5 minutes');
  console.log('Selector pattern: **/*.tfstate');

  // Get plugin statistics
  const stats = tfStatePlugin.getStats();
  console.log('\nPlugin Statistics:', stats);

  // Listen to monitoring events
  tfStatePlugin.on('monitoringCompleted', (result) => {
    console.log('\n[MONITORING] Completed:', {
      totalFiles: result.totalFiles,
      newFiles: result.newFiles,
      changedFiles: result.changedFiles,
      duration: `${result.duration}ms`
    });
  });

  tfStatePlugin.on('stateFileProcessed', (event) => {
    console.log(`[PROCESSED] ${event.path}: ${event.resourcesExtracted} resources extracted`);
  });

  tfStatePlugin.on('processingError', (event) => {
    console.error(`[ERROR] Failed to process ${event.path}: ${event.error}`);
  });

  // Trigger initial monitoring check manually
  console.log('\nTriggering manual monitoring check...');
  const monitoringResult = await tfStatePlugin.triggerMonitoring();
  console.log('Manual monitoring result:', monitoringResult);

  // Keep running for 1 minute to see cron in action
  console.log('\nMonitoring will run automatically every 5 minutes...');
  console.log('Press Ctrl+C to stop');

  await new Promise(resolve => setTimeout(resolve, 60000));

  await database.disconnect();
}

// ===================================
// EXAMPLE 2: Filesystem Driver for Local Development
// ===================================
async function example2_filesystemDriver() {
  console.log('\n=== Example 2: Filesystem Driver for Local Development ===\n');

  const database = new Database({
    bucketName: 's3db-tfstate-local',
    region: 'us-east-1'
  });

  await database.connect();

  // NEW: Filesystem driver for local state files
  const tfStatePlugin = new TfStatePlugin({
    driver: 'filesystem',
    config: {
      basePath: './terraform-states', // Local directory
      selector: '**/*.tfstate' // Find all .tfstate files recursively
    },
    resources: {
      stateFiles: 'local_tfstate_files',
      resources: 'local_tfstate_resources',
      diffs: 'local_tfstate_diffs'
    },
    monitor: {
      enabled: true,
      cron: '*/1 * * * *' // Check every minute for local dev
    },
    diffs: {
      enabled: true,
      lookback: 10
    },
    verbose: true
  });

  await database.usePlugin(tfStatePlugin);

  console.log('Plugin installed with Filesystem driver');
  console.log('Watching directory: ./terraform-states');
  console.log('Monitoring: every minute');

  // Trigger manual check
  const result = await tfStatePlugin.triggerMonitoring();
  console.log('\nMonitoring result:', result);

  await database.disconnect();
}

// ===================================
// EXAMPLE 3: Diff Lookback and Timeline
// ===================================
async function example3_diffLookbackAndTimeline() {
  console.log('\n=== Example 3: Diff Lookback and Timeline Features ===\n');

  const database = new Database({
    bucketName: 's3db-tfstate-demo',
    region: 'us-east-1'
  });

  await database.connect();

  const tfStatePlugin = new TfStatePlugin({
    driver: 's3',
    config: {
      connectionString: process.env.TFSTATE_S3_CONNECTION,
      selector: 'production/**/*.tfstate'
    },
    resources: {
      stateFiles: 'prod_state_files',
      resources: 'prod_resources',
      diffs: 'prod_diffs'
    },
    diffs: {
      enabled: true,
      lookback: 50 // Keep last 50 diffs for deep historical analysis
    },
    verbose: true
  });

  await database.usePlugin(tfStatePlugin);

  const stateFilePath = 'production/us-east-1/main.tfstate';

  // Get last 10 diffs (summary only, no details)
  console.log('\n--- Last 10 Diffs (Summary) ---');
  const recentDiffs = await tfStatePlugin.getDiffsWithLookback(stateFilePath, {
    lookback: 10,
    includeDetails: false
  });

  recentDiffs.forEach(diff => {
    console.log(`Serial ${diff.oldSerial} → ${diff.newSerial}:`, {
      added: diff.summary.addedCount,
      modified: diff.summary.modifiedCount,
      deleted: diff.summary.deletedCount,
      calculatedAt: new Date(diff.calculatedAt).toISOString()
    });
  });

  // Get detailed diff for specific comparison
  console.log('\n--- Detailed Diff with Changes ---');
  const detailedDiffs = await tfStatePlugin.getDiffsWithLookback(stateFilePath, {
    lookback: 1,
    includeDetails: true
  });

  if (detailedDiffs.length > 0) {
    const latestDiff = detailedDiffs[0];
    console.log(`\nLatest Diff (${latestDiff.oldSerial} → ${latestDiff.newSerial}):`);
    console.log('Added resources:', latestDiff.changes.added);
    console.log('Modified resources:', latestDiff.changes.modified);
    console.log('Deleted resources:', latestDiff.changes.deleted);
  }

  // Get diff timeline for visualization
  console.log('\n--- Diff Timeline (Last 20 Changes) ---');
  const timeline = await tfStatePlugin.getDiffTimeline(stateFilePath, {
    lookback: 20
  });

  console.log('Timeline Summary:');
  console.log(`  Total Diffs: ${timeline.totalDiffs}`);
  console.log(`  Serial Range: ${timeline.summary.serialRange.oldest} → ${timeline.summary.serialRange.newest}`);
  console.log(`  Time Range: ${new Date(timeline.summary.timeRange.first).toISOString()} → ${new Date(timeline.summary.timeRange.last).toISOString()}`);
  console.log(`  Cumulative Changes:`);
  console.log(`    Total Added: ${timeline.summary.totalAdded}`);
  console.log(`    Total Modified: ${timeline.summary.totalModified}`);
  console.log(`    Total Deleted: ${timeline.summary.totalDeleted}`);

  // Timeline progression (oldest to newest)
  console.log('\n  Change Progression:');
  timeline.diffs.slice(0, 5).forEach((diff, index) => {
    console.log(`    ${index + 1}. Serial ${diff.oldSerial} → ${diff.newSerial}: +${diff.summary.addedCount} ~${diff.summary.modifiedCount} -${diff.summary.deletedCount}`);
  });

  // Compare specific states
  console.log('\n--- Compare Specific States ---');
  const comparison = await tfStatePlugin.compareStates(stateFilePath, 10, 15);
  console.log(`Comparing serial 10 vs 15:`);
  console.log(`  Added: ${comparison.added.length}`);
  console.log(`  Modified: ${comparison.modified.length}`);
  console.log(`  Deleted: ${comparison.deleted.length}`);

  await database.disconnect();
}

// ===================================
// EXAMPLE 4: Production Setup with All Features
// ===================================
async function example4_productionSetup() {
  console.log('\n=== Example 4: Production Setup ===\n');

  const database = new Database({
    bucketName: 's3db-production',
    region: 'us-east-1'
  });

  await database.connect();

  // Production configuration with all best practices
  const tfStatePlugin = new TfStatePlugin({
    driver: 's3',
    config: {
      // Use environment variable for security
      connectionString: process.env.TFSTATE_CONNECTION_STRING,
      // Match only production state files in specific environments
      selector: 'environments/{production,staging}/**/*.tfstate'
    },
    resources: {
      stateFiles: 'infrastructure_state_files',
      resources: 'infrastructure_resources',
      diffs: 'infrastructure_changes'
    },
    monitor: {
      enabled: true,
      cron: '*/10 * * * *' // Every 10 minutes for production
    },
    diffs: {
      enabled: true,
      lookback: 100 // Keep last 100 diffs for audit trail
    },
    filters: {
      // Only track specific resource types
      types: [
        'aws_instance',
        'aws_s3_bucket',
        'aws_rds_instance',
        'aws_lambda_function',
        'aws_ecs_service'
      ]
    },
    verbose: false // Disable verbose logging in production
  });

  await database.usePlugin(tfStatePlugin);

  console.log('Production TfState monitoring active');

  // Setup comprehensive monitoring
  tfStatePlugin.on('monitoringCompleted', async (result) => {
    console.log(`[MONITOR] Checked ${result.totalFiles} files, found ${result.newFiles} new, ${result.changedFiles} changed`);

    // Send alert if major changes detected
    if (result.changedFiles > 5) {
      console.warn(`⚠️  Alert: ${result.changedFiles} state files changed!`);
      // Here you could send to Slack, PagerDuty, etc.
    }
  });

  tfStatePlugin.on('stateFileProcessed', (event) => {
    // Log to audit system
    console.log(`[AUDIT] State processed: ${event.path}, serial ${event.serial}, ${event.resourcesExtracted} resources`);
  });

  tfStatePlugin.on('processingError', (error) => {
    // Send to error tracking (e.g., Sentry)
    console.error(`[ERROR] State processing failed:`, error);
  });

  // Dashboard/reporting query examples
  const statsResource = await database.getResource('infrastructure_state_files');

  // Get all state files
  const allStateFiles = await statsResource.list({ limit: 100 });
  console.log(`\nTotal state files tracked: ${allStateFiles.length}`);

  // Find recently updated states
  const recentlyUpdated = await statsResource.query({
    lastImportedAt: { $gte: Date.now() - 86400000 } // Last 24 hours
  });
  console.log(`State files updated in last 24h: ${recentlyUpdated.length}`);

  // Get resources by type
  const infraResource = await database.getResource('infrastructure_resources');
  const ec2Instances = await infraResource.query({
    resourceType: 'aws_instance'
  });
  console.log(`Total EC2 instances tracked: ${ec2Instances.length}`);

  // Analyze changes over time
  const diffsResource = await database.getResource('infrastructure_changes');
  const recentChanges = await diffsResource.query({
    calculatedAt: { $gte: Date.now() - 604800000 } // Last 7 days
  });

  let totalAdded = 0;
  let totalDeleted = 0;
  recentChanges.forEach(diff => {
    totalAdded += diff.summary.addedCount || 0;
    totalDeleted += diff.summary.deletedCount || 0;
  });

  console.log(`\nInfrastructure Changes (Last 7 Days):`);
  console.log(`  Resources Added: ${totalAdded}`);
  console.log(`  Resources Deleted: ${totalDeleted}`);
  console.log(`  Net Change: ${totalAdded - totalDeleted > 0 ? '+' : ''}${totalAdded - totalDeleted}`);

  await database.disconnect();
}

// ===================================
// EXAMPLE 5: Migration from Legacy Config
// ===================================
async function example5_legacyConfigStillWorks() {
  console.log('\n=== Example 5: Legacy Configuration (Backward Compatible) ===\n');

  const database = new Database({
    bucketName: 's3db-legacy',
    region: 'us-east-1'
  });

  await database.connect();

  // OLD: Legacy configuration still works for backward compatibility
  const legacyPlugin = new TfStatePlugin({
    resourceName: 'terraform_resources',
    stateFilesName: 'terraform_state_files',
    diffsName: 'terraform_diffs',
    trackDiffs: true,
    verbose: true
  });

  await database.usePlugin(legacyPlugin);

  console.log('Legacy plugin configuration works!');

  // Legacy methods still available
  await legacyPlugin.importState('./local-state.tfstate');

  await database.disconnect();
}

// ===================================
// RUN EXAMPLES
// ===================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  TfState Plugin - Advanced Monitoring Examples            ║');
  console.log('║  New Features: Drivers, Monitoring, Diff Lookback          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    // Choose which example to run
    const exampleNumber = process.argv[2] || '1';

    switch (exampleNumber) {
      case '1':
        await example1_s3DriverWithMonitoring();
        break;
      case '2':
        await example2_filesystemDriver();
        break;
      case '3':
        await example3_diffLookbackAndTimeline();
        break;
      case '4':
        await example4_productionSetup();
        break;
      case '5':
        await example5_legacyConfigStillWorks();
        break;
      case 'all':
        await example2_filesystemDriver();
        await example3_diffLookbackAndTimeline();
        await example5_legacyConfigStillWorks();
        break;
      default:
        console.log('\nUsage: node e48-tfstate-advanced-monitoring.js [1|2|3|4|5|all]');
        console.log('\nExamples:');
        console.log('  1 - S3 Driver with Cron Monitoring');
        console.log('  2 - Filesystem Driver for Local Development');
        console.log('  3 - Diff Lookback and Timeline Features');
        console.log('  4 - Production Setup with All Features');
        console.log('  5 - Legacy Configuration (Backward Compatible)');
        console.log('  all - Run examples 2, 3, 5 (safe for local testing)');
    }

    console.log('\n✅ Example completed successfully!');
  } catch (error) {
    console.error('\n❌ Example failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  example1_s3DriverWithMonitoring,
  example2_filesystemDriver,
  example3_diffLookbackAndTimeline,
  example4_productionSetup,
  example5_legacyConfigStillWorks
};
