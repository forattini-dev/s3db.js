/**
 * Example: Plugin Dependency Validation
 *
 * Demonstrates how to validate plugin dependencies at runtime.
 * This ensures that optional plugin dependencies are installed before use,
 * keeping the core s3db.js package lightweight while maintaining plugin reliability.
 *
 * Dependencies kept as peerDependencies (optional):
 * - pg: PostgreSQL client
 * - @google-cloud/bigquery: Google BigQuery SDK
 * - @aws-sdk/client-sqs: AWS SQS SDK
 * - amqplib: RabbitMQ client
 */

import {
  requirePluginDependency,
  checkPluginDependencies,
  getPluginDependencyReport,
  PLUGIN_DEPENDENCIES
} from '../../src/plugins/concerns/plugin-dependencies.js';

// ============================================================================
// Example 1: Validate Single Plugin Dependency
// ============================================================================

async function example1_validateSinglePlugin() {
  console.log('\n📦 Example 1: Validate Single Plugin Dependency\n');

  try {
    // This will throw an error if 'pg' is not installed
    await requirePluginDependency('postgresql-replicator');
    console.log('✅ PostgreSQL Replicator dependencies are satisfied!');
  } catch (error) {
    console.error('❌ Dependency validation failed:');
    console.error(error.message);
    // Error message includes:
    // - Missing packages
    // - Required versions
    // - Install commands
  }
}

// ============================================================================
// Example 2: Check Dependencies Without Throwing
// ============================================================================

async function example2_checkWithoutThrowing() {
  console.log('\n🔍 Example 2: Check Dependencies Without Throwing\n');

  const result = await requirePluginDependency('bigquery-replicator', {
    throwOnError: false  // Don't throw, just return validation result
  });

  console.log('Valid:', result.isValid);
  console.log('Missing:', result.missing);
  console.log('Incompatible:', result.incompatible);
  console.log('\nMessages:');
  result.messages.forEach(msg => console.log(msg));
}

// ============================================================================
// Example 3: Check Multiple Plugins at Once
// ============================================================================

async function example3_checkMultiplePlugins() {
  console.log('\n📋 Example 3: Check Multiple Plugins at Once\n');

  const pluginsToCheck = [
    'postgresql-replicator',
    'bigquery-replicator',
    'sqs-replicator',
    'sqs-consumer',
    'rabbitmq-consumer'
  ];

  const results = await checkPluginDependencies(pluginsToCheck);

  for (const [pluginId, result] of results.entries()) {
    const pluginDef = PLUGIN_DEPENDENCIES[pluginId];
    const status = result.isValid ? '✅' : '❌';
    console.log(`${status} ${pluginDef.name}`);

    if (!result.isValid) {
      console.log(`   Missing: ${result.missing.join(', ')}`);
      console.log(`   Incompatible: ${result.incompatible.join(', ')}`);
    }
  }
}

// ============================================================================
// Example 4: Get Comprehensive Dependency Report
// ============================================================================

async function example4_getDependencyReport() {
  console.log('\n📊 Example 4: Get Comprehensive Dependency Report\n');

  const report = await getPluginDependencyReport();
  console.log(report);
}

// ============================================================================
// Example 5: Skip Version Checking (Just Check Installation)
// ============================================================================

async function example5_skipVersionCheck() {
  console.log('\n⏭️  Example 5: Skip Version Checking\n');

  const result = await requirePluginDependency('postgresql-replicator', {
    throwOnError: false,
    checkVersions: false  // Only check if package is installed, ignore version
  });

  console.log('Plugin installed:', result.isValid || result.missing.length === 0);
  result.messages.forEach(msg => console.log(msg));
}

// ============================================================================
// Example 6: Conditional Plugin Loading Based on Dependencies
// ============================================================================

async function example6_conditionalPluginLoading() {
  console.log('\n🔀 Example 6: Conditional Plugin Loading\n');

  // Check what plugins are available
  const availablePlugins = [];

  for (const pluginId of Object.keys(PLUGIN_DEPENDENCIES)) {
    const result = await requirePluginDependency(pluginId, { throwOnError: false });

    if (result.isValid) {
      availablePlugins.push(pluginId);
      console.log(`✅ ${PLUGIN_DEPENDENCIES[pluginId].name} is available`);
    } else {
      console.log(`⏭️  Skipping ${PLUGIN_DEPENDENCIES[pluginId].name} (dependencies not installed)`);
    }
  }

  console.log('\nAvailable plugins:', availablePlugins);

  // In production code, you would only load/initialize available plugins
  // Example:
  // if (availablePlugins.includes('postgresql-replicator')) {
  //   const PostgresReplicator = await import('./plugins/replicators/postgres-replicator.class.js');
  //   // ... initialize plugin
  // }
}

// ============================================================================
// Example 7: Integration with Plugin Initialization
// ============================================================================

async function example7_pluginInitialization() {
  console.log('\n🔧 Example 7: Integration with Plugin Initialization\n');

  class CustomReplicator {
    async initialize() {
      console.log('Initializing CustomReplicator...');

      // Validate dependencies before proceeding
      try {
        await requirePluginDependency('postgresql-replicator');
        console.log('✅ Dependencies validated');

        // Continue with initialization
        console.log('✅ Plugin initialized successfully');
      } catch (error) {
        console.error('❌ Failed to initialize plugin:');
        console.error(error.message);
        throw error;
      }
    }
  }

  const replicator = new CustomReplicator();
  try {
    await replicator.initialize();
  } catch (error) {
    console.log('\nPlugin initialization failed due to missing dependencies');
  }
}

// ============================================================================
// Example 8: List All Plugin Dependencies
// ============================================================================

function example8_listAllDependencies() {
  console.log('\n📚 Example 8: List All Plugin Dependencies\n');

  for (const [pluginId, pluginDef] of Object.entries(PLUGIN_DEPENDENCIES)) {
    console.log(`\n${pluginDef.name} (${pluginId})`);
    console.log('─'.repeat(50));

    for (const [pkgName, pkgInfo] of Object.entries(pluginDef.dependencies)) {
      console.log(`  📦 ${pkgName}`);
      console.log(`     Version: ${pkgInfo.version}`);
      console.log(`     Install: ${pkgInfo.installCommand}`);
      console.log(`     Description: ${pkgInfo.description}`);
    }
  }
}

// ============================================================================
// Run Examples
// ============================================================================

async function runAllExamples() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║         S3DB.JS - Plugin Dependency Validation Examples       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  try {
    await example1_validateSinglePlugin();
    await example2_checkWithoutThrowing();
    await example3_checkMultiplePlugins();
    await example4_getDependencyReport();
    await example5_skipVersionCheck();
    await example6_conditionalPluginLoading();
    await example7_pluginInitialization();
    example8_listAllDependencies();

    console.log('\n✅ All examples completed!\n');
  } catch (error) {
    console.error('\n❌ Example failed:', error.message);
  }
}

// Run examples if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

export {
  example1_validateSinglePlugin,
  example2_checkWithoutThrowing,
  example3_checkMultiplePlugins,
  example4_getDependencyReport,
  example5_skipVersionCheck,
  example6_conditionalPluginLoading,
  example7_pluginInitialization,
  example8_listAllDependencies
};
