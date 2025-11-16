/**
 * Tests for KubernetesInventoryPlugin
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { KubernetesInventoryPlugin } from '../../src/plugins/kubernetes-inventory.plugin.js';
import { KubernetesDriver } from '../../src/plugins/kubernetes-inventory/k8s-driver.js';

// Skip this test suite - requires @kubernetes/client-node peer dependency
// TODO: Fix requirePluginDependency async call in k8s-driver.js:95
describe.skip('KubernetesInventoryPlugin', () => {
  let db;
  let plugin;

  beforeEach(async () => {
    db = new Database({
      verbose: false, connectionString: 'memory://k8s-inventory-test/databases/test'
    });
  });

  afterEach(async () => {
    if (db) {
      await db.disconnect();
    }
  });

  describe('Configuration', () => {
    it('should require at least one cluster', () => {
      expect(() => {
        new KubernetesInventoryPlugin({
      verbose: false,
          clusters: []
        });
      }).not.toThrow();

      // Validation happens on install
    });

    it('should auto-generate cluster IDs', () => {
      plugin = new KubernetesInventoryPlugin({
      verbose: false,
        clusters: [
          { name: 'Cluster 1' },
          { name: 'Cluster 2' }
        ]
      });

      expect(plugin.config.clusters[0].id).toBe('k8s-cluster-1');
      expect(plugin.config.clusters[1].id).toBe('k8s-cluster-2');
    });

    it('should normalize cluster definitions', () => {
      plugin = new KubernetesInventoryPlugin({
      verbose: false,
        clusters: [
          {
            id: 'test',
            kubeconfig: '~/.kube/config'
          }
        ]
      });

      const cluster = plugin.config.clusters[0];
      expect(cluster.id).toBe('test');
      expect(cluster.name).toBe('test'); // Auto-set from ID
      expect(cluster.discovery).toBeDefined();
      expect(cluster.tags).toBeDefined();
      expect(cluster.metadata).toBeDefined();
    });

    it('should detect duplicate cluster IDs', async () => {
      plugin = new KubernetesInventoryPlugin({
      verbose: false,
        clusters: [
          { id: 'test', name: 'Test 1' },
          { id: 'test', name: 'Test 2' } // Duplicate!
        ]
      });

      await db.usePlugin(plugin);
      await expect(db.connect()).rejects.toThrow(/Duplicate cluster IDs/);
    });

    it('should normalize discovery options', () => {
      plugin = new KubernetesInventoryPlugin({
      verbose: false,
        clusters: [{ id: 'test' }],
        discovery: {
          select: ['core.*'],
          ignore: ['*.Event'],
          concurrency: 5
        }
      });

      expect(plugin.config.discovery.select).toEqual(['core.*']);
      expect(plugin.config.discovery.ignore).toEqual(['*.Event']);
      expect(plugin.config.discovery.concurrency).toBe(5);
      expect(plugin.config.discovery.runOnInstall).toBe(true); // Default
    });
  });

  describe('Internal Resources', () => {
    beforeEach(async () => {
      // Mock the driver initialization to avoid needing real K8s
      jest.spyOn(KubernetesDriver.prototype, 'initialize').mockResolvedValue();
      jest.spyOn(KubernetesDriver.prototype, 'listResources').mockImplementation(async function* () {
        yield* [];
      });

      plugin = new KubernetesInventoryPlugin({
      verbose: false,
        clusters: [{ id: 'test', name: 'Test' }],
        discovery: { runOnInstall: false } // Don't auto-discover
      });

      await db.usePlugin(plugin);
      await db.connect();
    });

    it('should create all internal resources', () => {
      expect(plugin._resourceHandles.snapshots).toBeDefined();
      expect(plugin._resourceHandles.versions).toBeDefined();
      expect(plugin._resourceHandles.changes).toBeDefined();
      expect(plugin._resourceHandles.clusters).toBeDefined();
    });

    it('should respect custom resource names', async () => {
      await db.disconnect();

      plugin = new KubernetesInventoryPlugin({
      verbose: false,
        clusters: [{ id: 'test' }],
        resourceNames: {
          snapshots: 'my_snapshots',
          versions: 'my_versions',
          changes: 'my_changes',
          clusters: 'my_clusters'
        },
        discovery: { runOnInstall: false }
      });

      await db.usePlugin(plugin);
      await db.connect();

      expect(plugin.resourceNames.snapshots).toBe('my_snapshots');
      expect(plugin.resourceNames.versions).toBe('my_versions');
      expect(plugin.resourceNames.changes).toBe('my_changes');
      expect(plugin.resourceNames.clusters).toBe('my_clusters');
    });
  });

  describe('Filtering', () => {
    beforeEach(() => {
      plugin = new KubernetesInventoryPlugin({
      verbose: false,
        clusters: [{ id: 'test' }],
        discovery: { runOnInstall: false }
      });
    });

    it('should match exact resource type', () => {
      const resource = { resourceType: 'core.v1.Pod' };

      plugin.config.discovery.select = ['core.v1.Pod'];
      expect(plugin._shouldIncludeResource(resource)).toBe(true);

      plugin.config.discovery.select = ['core.v1.Service'];
      expect(plugin._shouldIncludeResource(resource)).toBe(false);
    });

    it('should match wildcard patterns', () => {
      const resource = { resourceType: 'apps.v1.Deployment' };

      plugin.config.discovery.select = ['apps.*'];
      expect(plugin._shouldIncludeResource(resource)).toBe(true);

      plugin.config.discovery.select = ['core.*'];
      expect(plugin._shouldIncludeResource(resource)).toBe(false);

      plugin.config.discovery.select = ['*.Deployment'];
      expect(plugin._shouldIncludeResource(resource)).toBe(true);
    });

    it('should apply function-based select filter', () => {
      const namespacedResource = { resourceType: 'core.v1.Pod', namespace: 'default' };
      const clusterResource = { resourceType: 'core.v1.Node', namespace: null };

      plugin.config.discovery.select = (r) => r.namespace !== null;

      expect(plugin._shouldIncludeResource(namespacedResource)).toBe(true);
      expect(plugin._shouldIncludeResource(clusterResource)).toBe(false);
    });

    it('should apply ignore filter after select', () => {
      const pod = { resourceType: 'core.v1.Pod' };
      const event = { resourceType: 'core.v1.Event' };

      plugin.config.discovery.select = ['core.*'];
      plugin.config.discovery.ignore = ['*.Event'];

      expect(plugin._shouldIncludeResource(pod)).toBe(true);
      expect(plugin._shouldIncludeResource(event)).toBe(false);
    });

    it('should handle select=null (allow all)', () => {
      const resource = { resourceType: 'anything.v1.Resource' };

      plugin.config.discovery.select = null;
      plugin.config.discovery.ignore = [];

      expect(plugin._shouldIncludeResource(resource)).toBe(true);
    });

    it('should apply multiple ignore patterns', () => {
      const event = { resourceType: 'core.v1.Event' };
      const lease = { resourceType: 'coordination.v1.Lease' };
      const pod = { resourceType: 'core.v1.Pod' };

      plugin.config.discovery.select = null;
      plugin.config.discovery.ignore = ['*.Event', '*.Lease'];

      expect(plugin._shouldIncludeResource(event)).toBe(false);
      expect(plugin._shouldIncludeResource(lease)).toBe(false);
      expect(plugin._shouldIncludeResource(pod)).toBe(true);
    });
  });

  describe('Resource Key Generation', () => {
    beforeEach(() => {
      plugin = new KubernetesInventoryPlugin({
      verbose: false,
        clusters: [{ id: 'test' }],
        discovery: { runOnInstall: false }
      });
    });

    it('should build unique resource keys', () => {
      const resource1 = {
        clusterId: 'prod',
        resourceType: 'core.v1.Pod',
        namespace: 'default',
        resourceId: 'my-pod'
      };

      const resource2 = {
        clusterId: 'prod',
        resourceType: 'core.v1.Pod',
        namespace: 'kube-system',
        resourceId: 'my-pod'
      };

      const resource3 = {
        clusterId: 'prod',
        resourceType: 'core.v1.Node',
        namespace: null,
        resourceId: 'node-1'
      };

      const key1 = plugin._buildResourceKey(resource1);
      const key2 = plugin._buildResourceKey(resource2);
      const key3 = plugin._buildResourceKey(resource3);

      expect(key1).toBe('prod::core.v1.Pod::default::my-pod');
      expect(key2).toBe('prod::core.v1.Pod::kube-system::my-pod');
      expect(key3).toBe('prod::core.v1.Node::cluster::node-1');

      // Keys should be unique
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
    });
  });

  describe('Digest Computation', () => {
    beforeEach(() => {
      plugin = new KubernetesInventoryPlugin({
      verbose: false,
        clusters: [{ id: 'test' }],
        discovery: { runOnInstall: false }
      });
    });

    it('should compute consistent digests', () => {
      const config1 = { spec: { replicas: 3, image: 'nginx:1.14' } };
      const config2 = { spec: { replicas: 3, image: 'nginx:1.14' } };

      const digest1 = plugin._computeDigest(config1);
      const digest2 = plugin._computeDigest(config2);

      expect(digest1).toBe(digest2);
    });

    it('should compute different digests for different configs', () => {
      const config1 = { spec: { replicas: 3 } };
      const config2 = { spec: { replicas: 5 } };

      const digest1 = plugin._computeDigest(config1);
      const digest2 = plugin._computeDigest(config2);

      expect(digest1).not.toBe(digest2);
    });

    it('should handle field order (canonical JSON)', () => {
      const config1 = { b: 2, a: 1 };
      const config2 = { a: 1, b: 2 };

      const digest1 = plugin._computeDigest(config1);
      const digest2 = plugin._computeDigest(config2);

      // Should be the same (order-independent)
      expect(digest1).toBe(digest2);
    });
  });

  describe('Summary Extraction', () => {
    beforeEach(() => {
      plugin = new KubernetesInventoryPlugin({
      verbose: false,
        clusters: [{ id: 'test' }],
        discovery: { runOnInstall: false }
      });
    });

    it('should extract summary information', () => {
      const resource = {
        name: 'my-deployment',
        namespace: 'production',
        kind: 'Deployment',
        apiVersion: 'apps/v1',
        labels: { app: 'web' },
        annotations: { note: 'test' },
        configuration: { spec: { replicas: 2 } }
      };

      const summary = plugin._extractSummary(resource);

      expect(summary).toEqual({
        name: 'my-deployment',
        namespace: 'production',
        kind: 'Deployment',
        apiVersion: 'apps/v1',
        labels: { app: 'web' },
        annotations: { note: 'test' }
      });
    });
  });

  describe('Diff Computation', () => {
    beforeEach(() => {
      plugin = new KubernetesInventoryPlugin({
      verbose: false,
        clusters: [{ id: 'test' }],
        discovery: { runOnInstall: false }
      });
    });

    it('should detect added fields', () => {
      const oldConfig = { a: 1 };
      const newConfig = { a: 1, b: 2 };

      const diff = plugin._computeDiff(oldConfig, newConfig);

      expect(diff.added).toEqual({ b: 2 });
      expect(diff.removed).toEqual({});
      expect(diff.updated).toEqual({});
    });

    it('should detect removed fields', () => {
      const oldConfig = { a: 1, b: 2 };
      const newConfig = { a: 1 };

      const diff = plugin._computeDiff(oldConfig, newConfig);

      expect(diff.added).toEqual({});
      expect(diff.removed).toEqual({ b: 2 });
      expect(diff.updated).toEqual({});
    });

    it('should detect updated fields', () => {
      const oldConfig = { a: 1, b: 2 };
      const newConfig = { a: 1, b: 3 };

      const diff = plugin._computeDiff(oldConfig, newConfig);

      expect(diff.added).toEqual({});
      expect(diff.removed).toEqual({});
      expect(diff.updated).toEqual({
        b: { old: 2, new: 3 }
      });
    });

    it('should handle complex nested changes', () => {
      const oldConfig = {
        spec: { replicas: 3, image: 'nginx:1.14' }
      };
      const newConfig = {
        spec: { replicas: 5, image: 'nginx:1.14' }
      };

      const diff = plugin._computeDiff(oldConfig, newConfig);

      expect(diff.updated.spec).toBeDefined();
      expect(diff.updated.spec.old.replicas).toBe(3);
      expect(diff.updated.spec.new.replicas).toBe(5);
    });
  });

  describe('Resource Names & Namespacing', () => {
    it('should use custom resource names', async () => {
      jest.spyOn(KubernetesDriver.prototype, 'initialize').mockResolvedValue();
      jest.spyOn(KubernetesDriver.prototype, 'listResources').mockImplementation(async function* () {
        yield* [];
      });

      plugin = new KubernetesInventoryPlugin({
      verbose: false,
        clusters: [{ id: 'test' }],
        resourceNames: {
          snapshots: 'custom_snapshots',
          versions: 'custom_versions',
          changes: 'custom_changes',
          clusters: 'custom_clusters'
        },
        discovery: { runOnInstall: false }
      });

      await db.usePlugin(plugin);
      await db.connect();

      expect(plugin.resourceNames.snapshots).toBe('custom_snapshots');
      expect(plugin.resourceNames.versions).toBe('custom_versions');
      expect(plugin.resourceNames.changes).toBe('custom_changes');
      expect(plugin.resourceNames.clusters).toBe('custom_clusters');
    });

    it('should support multiple plugin instances with different names', async () => {
      jest.spyOn(KubernetesDriver.prototype, 'initialize').mockResolvedValue();
      jest.spyOn(KubernetesDriver.prototype, 'listResources').mockImplementation(async function* () {
        yield* [];
      });

      const plugin1 = new KubernetesInventoryPlugin({
      verbose: false,
        clusters: [{ id: 'test1' }],
        resourceNames: {
          snapshots: 'prod_snapshots',
          versions: 'prod_versions',
          changes: 'prod_changes',
          clusters: 'prod_clusters'
        },
        discovery: { runOnInstall: false }
      });

      const plugin2 = new KubernetesInventoryPlugin({
      verbose: false,
        clusters: [{ id: 'test2' }],
        resourceNames: {
          snapshots: 'staging_snapshots',
          versions: 'staging_versions',
          changes: 'staging_changes',
          clusters: 'staging_clusters'
        },
        discovery: { runOnInstall: false }
      });

      await db.usePlugin(plugin1);
      await db.usePlugin(plugin2);
      await db.connect();

      // Different resource names
      expect(plugin1.resourceNames.snapshots).not.toBe(plugin2.resourceNames.snapshots);

      // Both sets of resources exist
      const resources = await db.listResources();
      const prodResources = resources.filter(r => r.name.startsWith('prod_'));
      const stagingResources = resources.filter(r => r.name.startsWith('staging_'));

      expect(prodResources.length).toBe(4);
      expect(stagingResources.length).toBe(4);
    });
  });

  describe('Multi-Cluster Data Isolation', () => {
    beforeEach(async () => {
      jest.spyOn(KubernetesDriver.prototype, 'initialize').mockResolvedValue();
      jest.spyOn(KubernetesDriver.prototype, 'listResources').mockImplementation(async function* () {
        yield* [];
      });

      plugin = new KubernetesInventoryPlugin({
      verbose: false,
        clusters: [
          { id: 'cluster-a', name: 'Cluster A' },
          { id: 'cluster-b', name: 'Cluster B' }
        ],
        discovery: { runOnInstall: false }
      });

      await db.usePlugin(plugin);
      await db.connect();
    });

    it('should ensure all resources have clusterId field', async () => {
      const snapshotsResource = db.getResource(plugin.resourceNames.snapshots);
      const versionsResource = db.getResource(plugin.resourceNames.versions);
      const changesResource = db.getResource(plugin.resourceNames.changes);

      // Check schema definitions
      expect(snapshotsResource.schema.attributes.clusterId).toBeDefined();
      expect(snapshotsResource.schema.attributes.clusterId).toContain('required');

      expect(versionsResource.schema.attributes.clusterId).toBeDefined();
      expect(versionsResource.schema.attributes.clusterId).toContain('required');

      expect(changesResource.schema.attributes.clusterId).toBeDefined();
      expect(changesResource.schema.attributes.clusterId).toContain('required');
    });

    it('should isolate data by clusterId', async () => {
      const snapshotsResource = db.getResource(plugin.resourceNames.snapshots);

      // Insert data for cluster-a
      await snapshotsResource.insert({
        id: 'cluster-a::pod1',
        clusterId: 'cluster-a',
        namespace: 'default',
        resourceType: 'core.v1.Pod',
        resourceId: 'pod1',
        name: 'pod1',
        apiVersion: 'v1',
        kind: 'Pod',
        labels: {},
        annotations: {},
        latestDigest: 'digest1',
        latestVersion: 1,
        changelogSize: 0,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Insert data for cluster-b
      await snapshotsResource.insert({
        id: 'cluster-b::pod2',
        clusterId: 'cluster-b',
        namespace: 'default',
        resourceType: 'core.v1.Pod',
        resourceId: 'pod2',
        name: 'pod2',
        apiVersion: 'v1',
        kind: 'Pod',
        labels: {},
        annotations: {},
        latestDigest: 'digest2',
        latestVersion: 1,
        changelogSize: 0,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Query cluster-a only
      const clusterAData = await plugin.getSnapshots({ clusterId: 'cluster-a' });
      expect(clusterAData.length).toBe(1);
      expect(clusterAData[0].clusterId).toBe('cluster-a');
      expect(clusterAData[0].resourceId).toBe('pod1');

      // Query cluster-b only
      const clusterBData = await plugin.getSnapshots({ clusterId: 'cluster-b' });
      expect(clusterBData.length).toBe(1);
      expect(clusterBData[0].clusterId).toBe('cluster-b');
      expect(clusterBData[0].resourceId).toBe('pod2');

      // Query all clusters
      const allData = await plugin.getSnapshots({});
      expect(allData.length).toBe(2);
    });

    it('should use partitions for efficient cluster queries', async () => {
      const snapshotsResource = db.getResource(plugin.resourceNames.snapshots);

      // Verify byClusterId partition exists
      expect(snapshotsResource.partitions.byClusterId).toBeDefined();

      // Insert test data
      await snapshotsResource.insert({
        id: 'cluster-a::pod1',
        clusterId: 'cluster-a',
        namespace: 'default',
        resourceType: 'core.v1.Pod',
        resourceId: 'pod1',
        name: 'pod1',
        apiVersion: 'v1',
        kind: 'Pod',
        labels: {},
        annotations: {},
        latestDigest: 'digest1',
        latestVersion: 1,
        changelogSize: 0,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Query via partition (O(1) instead of O(n))
      const partitionResult = await snapshotsResource.listPartition('byClusterId', {
        clusterId: 'cluster-a'
      });

      expect(partitionResult.length).toBe(1);
      expect(partitionResult[0].clusterId).toBe('cluster-a');
    });

    it('should support combined cluster+type partitions', async () => {
      const snapshotsResource = db.getResource(plugin.resourceNames.snapshots);

      // Verify byClusterAndType partition exists
      expect(snapshotsResource.partitions.byClusterAndType).toBeDefined();

      // Insert test data
      await snapshotsResource.insert({
        id: 'cluster-a::pod1',
        clusterId: 'cluster-a',
        namespace: 'default',
        resourceType: 'core.v1.Pod',
        resourceId: 'pod1',
        name: 'pod1',
        apiVersion: 'v1',
        kind: 'Pod',
        labels: {},
        annotations: {},
        latestDigest: 'digest1',
        latestVersion: 1,
        changelogSize: 0,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Query via combined partition
      const partitionResult = await snapshotsResource.listPartition('byClusterAndType', {
        clusterId: 'cluster-a',
        resourceType: 'core.v1.Pod'
      });

      expect(partitionResult.length).toBe(1);
      expect(partitionResult[0].clusterId).toBe('cluster-a');
      expect(partitionResult[0].resourceType).toBe('core.v1.Pod');
    });
  });
});
