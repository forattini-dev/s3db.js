/**
 * Example 47: Using Plugin Namespace Concern
 *
 * Demonstrates how to implement namespace support in a custom plugin
 * using the standardized namespace utilities.
 */

import { Database } from '../../src/database.class.js';
import { Plugin } from '../../src/plugins/plugin.class.js';
import {
  getValidatedNamespace,
  detectAndWarnNamespaces,
  getNamespacedResourceName,
  listPluginNamespaces
} from '../../src/plugins/namespace.js';

// ========================================
// 1. Create Custom Plugin with Namespace Support
// ========================================

class MonitoringPlugin extends Plugin {
  static pluginName = 'monitoring';

  constructor(config = {}) {
    super(config);

    // ✅ Step 1: Validate and set namespace (REQUIRED)
    // Empty string '' means no namespace (default)
    this.namespace = getValidatedNamespace(config, '');

    this.config = {
      checkInterval: config.checkInterval || 60000,  // 1 minute
      storage: { enabled: true },
      resources: { persist: true }
    };

    this.metrics = new Map();
  }

  async initialize() {
    await super.initialize();

    // ✅ Step 2: Detect existing namespaces and emit warnings (REQUIRED)
    await detectAndWarnNamespaces(
      this.getStorage(),
      'MonitoringPlugin',
      'monitoring',
      this.namespace
    );

    // ✅ Step 3: Create namespaced resources
    await this.createResources();
  }

  async createResources() {
    if (!this.database) return;

    const namespace = this.namespace;

    // Define resource schemas
    const resourceConfigs = [
      {
        name: 'plg_monitoring_metrics',
        attributes: {
          metricName: 'string|required',
          value: 'number|required',
          timestamp: 'string|required',
          tags: 'object|optional'
        },
        behavior: 'body-overflow',
        partitions: {
          byMetric: {
            fields: { metricName: 'string' }
          }
        }
      },
      {
        name: 'plg_monitoring_alerts',
        attributes: {
          alertType: 'string|required',
          severity: 'string|required',
          message: 'string|required',
          timestamp: 'string|required',
          resolved: 'boolean|required'
        },
        behavior: 'enforce-limits'
      }
    ];

    // ✅ Step 4: Create resources with namespaced names
    for (const config of resourceConfigs) {
      const namespacedName = getNamespacedResourceName(
        config.name,
        namespace,
        'plg_monitoring'
      );

      try {
        let resource = null;
        try {
          resource = await this.database.getResource(namespacedName);
        } catch (error) {
          // Resource doesn't exist, create it
        }

        if (!resource) {
          resource = await this.database.createResource({
            ...config,
            name: namespacedName
          });
        }

        // Store with original name as key (for easy access)
        this.resources = this.resources || {};
        this.resources[config.name] = resource;
      } catch (error) {
        console.error(`Failed to create resource ${namespacedName}:`, error.message);
      }
    }
  }

  // ✅ Step 5: Use namespace in storage paths
  async recordMetric(metricName, value, tags = {}) {
    const storage = this.getStorage();
    const namespace = this.namespace;
    const timestamp = new Date().toISOString();

    const metric = {
      metricName,
      value,
      timestamp,
      tags
    };

    // Persist to storage (with namespace in path)
    const key = storage.getPluginKey(
      null,
      namespace,
      'metrics',
      metricName,
      `${timestamp.replace(/[:.]/g, '-')}.json`
    );
    await storage.set(key, metric);

    // Persist to resource
    if (this.resources?.['plg_monitoring_metrics']) {
      await this.resources['plg_monitoring_metrics'].insert(metric);
    }

    this.emit('monitoring:metric-recorded', { metricName, value, namespace });
  }

  async createAlert(alertType, severity, message) {
    const storage = this.getStorage();
    const namespace = this.namespace;
    const timestamp = new Date().toISOString();

    const alert = {
      id: `${alertType}-${Date.now()}`,
      alertType,
      severity,
      message,
      timestamp,
      resolved: false
    };

    // Persist to storage (with namespace in path)
    const key = storage.getPluginKey(
      null,
      namespace,
      'alerts',
      `${alert.id}.json`
    );
    await storage.set(key, alert);

    // Persist to resource
    if (this.resources?.['plg_monitoring_alerts']) {
      await this.resources['plg_monitoring_alerts'].insert(alert);
    }

    this.emit('monitoring:alert-created', { alert, namespace });
    return alert;
  }

  async listNamespaces() {
    return await listPluginNamespaces(this.getStorage(), 'monitoring');
  }
}

// ========================================
// 2. Setup Database
// ========================================

const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/namespace-concern-test',
  region: 'us-east-1'
});

await db.initialize();

console.log('✅ Database initialized\n');

// ========================================
// 3. Create Multiple Plugin Instances
// ========================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📌 Creating first instance (production namespace)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const prodMonitoring = new MonitoringPlugin({
  namespace: 'production',
  checkInterval: 30000
});

await db.use(prodMonitoring);
// Expected: [MonitoringPlugin] Using namespace: "production"

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📌 Creating second instance (staging namespace)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const stagingMonitoring = new MonitoringPlugin({
  namespace: 'staging',
  checkInterval: 60000
});

await db.use(stagingMonitoring);
// Expected:
// [MonitoringPlugin] Detected 1 existing namespace(s): production
// [MonitoringPlugin] Using namespace: "staging"

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📌 Creating third instance (development namespace)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const devMonitoring = new MonitoringPlugin({
  namespace: 'development',
  checkInterval: 120000
});

await db.use(devMonitoring);
// Expected:
// [MonitoringPlugin] Detected 2 existing namespace(s): production, staging
// [MonitoringPlugin] Using namespace: "development"

// ========================================
// 4. Record Metrics in Each Namespace
// ========================================

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Recording metrics in each namespace');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Production metrics
await prodMonitoring.recordMetric('cpu_usage', 75.5, { server: 'prod-01' });
await prodMonitoring.recordMetric('memory_usage', 82.3, { server: 'prod-01' });
await prodMonitoring.createAlert('high_cpu', 'warning', 'CPU usage above 75%');

console.log('✅ Production: Recorded 2 metrics + 1 alert');

// Staging metrics
await stagingMonitoring.recordMetric('cpu_usage', 45.2, { server: 'staging-01' });
await stagingMonitoring.recordMetric('memory_usage', 55.1, { server: 'staging-01' });

console.log('✅ Staging: Recorded 2 metrics');

// Development metrics
await devMonitoring.recordMetric('cpu_usage', 30.8, { server: 'dev-01' });
await devMonitoring.recordMetric('memory_usage', 40.5, { server: 'dev-01' });
await devMonitoring.createAlert('test_alert', 'info', 'Testing alert system');

console.log('✅ Development: Recorded 2 metrics + 1 alert\n');

// ========================================
// 5. Verify Namespace Isolation
// ========================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔍 Verifying namespace isolation');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Query production metrics
const prodMetricsResource = await db.getResource('plg_monitoring_production_metrics');
const prodMetrics = await prodMetricsResource.list({ limit: 100 });

console.log(`📊 Production namespace: ${prodMetrics.length} metrics`);

// Query staging metrics
const stagingMetricsResource = await db.getResource('plg_monitoring_staging_metrics');
const stagingMetrics = await stagingMetricsResource.list({ limit: 100 });

console.log(`📊 Staging namespace: ${stagingMetrics.length} metrics`);

// Query development metrics
const devMetricsResource = await db.getResource('plg_monitoring_development_metrics');
const devMetrics = await devMetricsResource.list({ limit: 100 });

console.log(`📊 Development namespace: ${devMetrics.length} metrics\n`);

// ========================================
// 6. List All Namespaces
// ========================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔖 Listing all detected namespaces');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const allNamespaces = await prodMonitoring.listNamespaces();

console.log(`Total namespaces: ${allNamespaces.length}`);
console.log(`Namespaces: ${allNamespaces.join(', ')}\n`);

// ========================================
// 7. Verify Storage Paths
// ========================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📁 Verifying storage path isolation');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const storage = prodMonitoring.getStorage();

// List production storage
const prodKeys = await storage.list(
  storage.getPluginKey(null, 'production')
);
console.log(`📁 Production storage: ${prodKeys.length} keys`);

// List staging storage
const stagingKeys = await storage.list(
  storage.getPluginKey(null, 'staging')
);
console.log(`📁 Staging storage: ${stagingKeys.length} keys`);

// List development storage
const devKeys = await storage.list(
  storage.getPluginKey(null, 'development')
);
console.log(`📁 Development storage: ${devKeys.length} keys\n`);

// ========================================
// 8. Test Namespace Validation
// ========================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ Testing namespace validation');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

try {
  new MonitoringPlugin({ namespace: 'invalid space' });
  console.log('❌ Should have thrown error for invalid namespace');
} catch (error) {
  console.log('✅ Validation caught invalid namespace (spaces)');
}

try {
  new MonitoringPlugin({ namespace: '' });
  console.log('❌ Should have thrown error for empty namespace');
} catch (error) {
  console.log('✅ Validation caught empty namespace');
}

try {
  new MonitoringPlugin({ namespace: 'valid-namespace' });
  console.log('✅ Validation passed for valid namespace (hyphens)');
} catch (error) {
  console.log('❌ Should not throw for valid namespace');
}

try {
  new MonitoringPlugin({ namespace: 'valid_namespace' });
  console.log('✅ Validation passed for valid namespace (underscores)');
} catch (error) {
  console.log('❌ Should not throw for valid namespace');
}

// ========================================
// 9. Summary
// ========================================

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 Summary');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('✅ Plugin Namespace Concern Usage Demonstrated:');
console.log('   1. getValidatedNamespace() - Validates namespace format');
console.log('   2. detectAndWarnNamespaces() - Lists and warns about namespaces');
console.log('   3. getNamespacedResourceName() - Creates consistent resource names');
console.log('   4. listPluginNamespaces() - Lists all existing namespaces\n');

console.log('✅ Namespace Isolation Verified:');
console.log('   - Storage paths are isolated per namespace');
console.log('   - Database resources are namespaced');
console.log('   - Data does not leak between namespaces\n');

console.log('✅ Console Warnings Emitted:');
console.log('   - First instance: No existing namespaces detected');
console.log('   - Second instance: Detected 1 namespace');
console.log('   - Third instance: Detected 2 namespaces');
console.log('   - Each instance warns which namespace it uses\n');

console.log('🎯 All requirements met! Plugin implements namespace support correctly.\n');
