import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import { TfStatePlugin } from '../../../src/plugins/tfstate/index.js';
import { createTfstateContext, createStateFile } from './helpers.js';

describe('TfStatePlugin - Diff Tracking, Queries, and Statistics', () => {
  let context;
  let database;
  let tempDir;

  beforeEach(async () => {
    context = await createTfstateContext('diffs');
    ({ database, tempDir } = context);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('Diff Tracking', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin({ logLevel: 'silent', asyncPartitions: false, trackDiffs: true });
      await plugin.install(database);
    });

    test('should not create diff for first state', async () => {
      const stateFile = createStateFile(tempDir, 1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
      ]);

      const result = await plugin.importState(stateFile);
      expect(result.diff).toBeDefined();
      expect(result.diff.isFirst).toBe(true);

      const diffs = await plugin.diffsResource.list();
      expect(diffs).toHaveLength(0);
    });

    test('should detect added resources', async () => {
      const filename = 'terraform.tfstate';

      const stateFile1 = createStateFile(
        tempDir,
        1,
        [{ mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] }],
        { fileName: filename },
      );
      await plugin.importState(stateFile1);

      const stateFile2 = createStateFile(
        tempDir,
        2,
        [
          { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
          { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] },
        ],
        { fileName: filename },
      );
      await plugin.importState(stateFile2);

      const history = await plugin.diffsResource.query({ newSerial: 2 });
      expect(history).toHaveLength(1);
      expect(history[0].changes.added).toHaveLength(1);
      expect(history[0].changes.added[0].address).toBe('aws_s3_bucket.bucket');
      expect(history[0].changes.added[0].type).toBe('aws_s3_bucket');
    });

    test('should detect deleted resources', async () => {
      const filename = 'terraform.tfstate';

      const stateFile1 = createStateFile(
        tempDir,
        1,
        [
          { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
          { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] },
        ],
        { fileName: filename },
      );
      await plugin.importState(stateFile1);

      const stateFile2 = createStateFile(
        tempDir,
        2,
        [{ mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] }],
        { fileName: filename },
      );
      await plugin.importState(stateFile2);

      const history = await plugin.diffsResource.query({ newSerial: 2 });
      expect(history[0].changes.deleted).toHaveLength(1);
      expect(history[0].changes.deleted[0].address).toBe('aws_s3_bucket.bucket');
    });

    test('should detect modified resources', async () => {
      const filename = 'terraform.tfstate';

      const stateFile1 = createStateFile(
        tempDir,
        1,
        [
          {
            mode: 'managed',
            type: 'aws_instance',
            name: 'web',
            instances: [{ attributes: { id: 'i-1', instance_type: 't2.micro' } }],
          },
        ],
        { fileName: filename },
      );
      await plugin.importState(stateFile1);

      const stateFile2 = createStateFile(
        tempDir,
        2,
        [
          {
            mode: 'managed',
            type: 'aws_instance',
            name: 'web',
            instances: [{ attributes: { id: 'i-1', instance_type: 't2.small' } }],
          },
        ],
        { fileName: filename },
      );
      await plugin.importState(stateFile2);

      const history = await plugin.diffsResource.query({ newSerial: 2 });
      expect(history[0].changes.modified).toHaveLength(1);
      expect(history[0].changes.modified[0].address).toBe('aws_instance.web');
      expect(history[0].changes.modified[0].changes).toHaveLength(1);
      expect(history[0].changes.modified[0].changes[0].field).toBe('instance_type');
      expect(history[0].changes.modified[0].changes[0].oldValue).toBe('t2.micro');
      expect(history[0].changes.modified[0].changes[0].newValue).toBe('t2.small');
    });

    test('should detect complex changes', async () => {
      const filename = 'terraform.tfstate';

      const stateFile1 = createStateFile(
        tempDir,
        1,
        [
          {
            mode: 'managed',
            type: 'aws_instance',
            name: 'web',
            instances: [{ attributes: { id: 'i-1', instance_type: 't2.micro' } }],
          },
          { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] },
          { mode: 'managed', type: 'aws_dynamodb_table', name: 'table', instances: [{ attributes: { id: 'table-1' } }] },
        ],
        { fileName: filename },
      );
      await plugin.importState(stateFile1);

      const stateFile2 = createStateFile(
        tempDir,
        2,
        [
          {
            mode: 'managed',
            type: 'aws_instance',
            name: 'web',
            instances: [{ attributes: { id: 'i-1', instance_type: 't2.small' } }],
          },
          { mode: 'managed', type: 'aws_dynamodb_table', name: 'table', instances: [{ attributes: { id: 'table-1' } }] },
          { mode: 'managed', type: 'aws_db_instance', name: 'db', instances: [{ attributes: { id: 'db-1' } }] },
        ],
        { fileName: filename },
      );
      await plugin.importState(stateFile2);

      const history = await plugin.diffsResource.query({ newSerial: 2 });
      const changes = history[0].changes;
      expect(changes.added).toHaveLength(1);
      expect(changes.added[0].address).toBe('aws_db_instance.db');
      expect(changes.modified).toHaveLength(1);
      expect(changes.modified[0].address).toBe('aws_instance.web');
      expect(changes.deleted).toHaveLength(1);
      expect(changes.deleted[0].address).toBe('aws_s3_bucket.bucket');
    });

    test('should not track diffs when disabled', async () => {
      const noDiffPlugin = new TfStatePlugin({ logLevel: 'silent', asyncPartitions: false, trackDiffs: false });
      await noDiffPlugin.install(database);

      const stateFile = createStateFile(tempDir, 1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
      ]);

      const result = await noDiffPlugin.importState(stateFile);
      expect(result.diff).toBeNull();
      expect(noDiffPlugin.diffsResource).toBeFalsy();
    });
  });

  describe('Query Operations', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin({ logLevel: 'silent', asyncPartitions: false });
      await plugin.install(database);
    });

    test('should query resources by type', async () => {
      const stateFile = createStateFile(tempDir, 1, [
        { mode: 'managed', type: 'aws_instance', name: 'web1', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'managed', type: 'aws_instance', name: 'web2', instances: [{ attributes: { id: 'i-2' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] },
      ]);
      await plugin.importState(stateFile);

      const instances = await plugin.resource.query({ resourceType: 'aws_instance' });
      expect(instances).toHaveLength(2);
      expect(instances.every(r => r.resourceType === 'aws_instance')).toBe(true);
    });

    test('should query resources by serial', async () => {
      const stateFile1 = createStateFile(tempDir, 1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
      ]);
      await plugin.importState(stateFile1);

      const stateFile2 = createStateFile(tempDir, 2, [
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] },
      ]);
      await plugin.importState(stateFile2);

      const serial1Resources = await plugin.resource.query({ stateSerial: 1 });
      const serial2Resources = await plugin.resource.query({ stateSerial: 2 });

      expect(serial1Resources).toHaveLength(1);
      expect(serial1Resources[0].resourceType).toBe('aws_instance');
      expect(serial2Resources).toHaveLength(1);
      expect(serial2Resources[0].resourceType).toBe('aws_s3_bucket');
    });

    test('should query resources by attributes', async () => {
      const stateFile = createStateFile(tempDir, 1, [
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'web1',
          instances: [{ attributes: { id: 'i-1', instance_type: 't2.micro' } }],
        },
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'web2',
          instances: [{ attributes: { id: 'i-2', instance_type: 't2.small' } }],
        },
      ]);
      await plugin.importState(stateFile);

      const allInstances = await plugin.resource.listPartition({
        partition: 'byType',
        partitionValues: { resourceType: 'aws_instance' },
      });

      const microInstances = allInstances.filter(
        r => r.attributes && r.attributes.instance_type === 't2.micro',
      );

      expect(microInstances).toHaveLength(1);
      expect(microInstances[0].attributes.instance_type).toBe('t2.micro');
    });

    test('should use partition for type queries', async () => {
      const stateFile = createStateFile(tempDir, 1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] },
      ]);
      await plugin.importState(stateFile);

      const instances = await plugin.resource.listPartition({
        partition: 'byType',
        partitionValues: { resourceType: 'aws_instance' },
      });

      expect(instances).toHaveLength(1);
      expect(instances[0].resourceType).toBe('aws_instance');
    });

    test('should count resources by state serial', async () => {
      const stateFile = createStateFile(tempDir, 1, [
        { mode: 'managed', type: 'aws_instance', name: 'web1', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'managed', type: 'aws_instance', name: 'web2', instances: [{ attributes: { id: 'i-2' } }] },
      ]);
      await plugin.importState(stateFile);

      const count = await plugin.resource.count({ stateSerial: 1 });
      expect(count).toBe(2);
    });
  });

  describe('Statistics', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin({ logLevel: 'silent', asyncPartitions: false });
      await plugin.install(database);
    });

    test('should initialize statistics', async () => {
      const stats = await plugin.getStats();
      expect(stats).toBeDefined();
      expect(stats.statesProcessed).toBe(0);
      expect(stats.resourcesExtracted).toBe(0);
      expect(stats.resourcesInserted).toBe(0);
      expect(stats.totalStates).toBe(0);
      expect(stats.totalResources).toBe(0);
    });

    test('should track processed states', async () => {
      const stateFile1 = createStateFile(tempDir, 1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
      ]);
      await plugin.importState(stateFile1);

      const stateFile2 = createStateFile(tempDir, 2, [
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] },
      ]);
      await plugin.importState(stateFile2);

      const stats = await plugin.getStats();
      expect(stats.statesProcessed).toBe(2);
      expect(stats.totalStates).toBe(2);
      expect(stats.latestSerial).toBe(2);
    });

    test('should track extracted resources', async () => {
      const stateFile = createStateFile(tempDir, 1, [
        { mode: 'managed', type: 'aws_instance', name: 'web1', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'managed', type: 'aws_instance', name: 'web2', instances: [{ attributes: { id: 'i-2' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] },
      ]);
      await plugin.importState(stateFile);

      const stats = await plugin.getStats();
      expect(stats.resourcesExtracted).toBe(3);
      expect(stats.resourcesInserted).toBe(3);
      expect(stats.totalResources).toBe(3);
    });

    test('should track filtered resources separately', async () => {
      const filterPlugin = new TfStatePlugin({
      logLevel: 'silent',asyncPartitions: false,
        filters: { types: ['aws_instance'] },
      });
      await filterPlugin.install(database);

      const stateFile = createStateFile(tempDir, 1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] },
      ]);
      await filterPlugin.importState(stateFile);

      const stats = await filterPlugin.getStats();
      expect(stats.resourcesExtracted).toBe(2);
      expect(stats.resourcesInserted).toBe(1);
      expect(stats.totalResources).toBe(1);
    });
  });

  describe('State History', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin({ logLevel: 'silent', asyncPartitions: false, trackDiffs: true });
      await plugin.install(database);
    });

    test('should save state metadata', async () => {
      const stateFile = createStateFile(
        tempDir,
        1,
        [{ mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] }],
        { terraformVersion: '1.5.0', lineage: 'test-lineage-123' },
      );

      await plugin.importState(stateFile);

      const states = await plugin.stateFilesResource.list();
      expect(states).toHaveLength(1);
      expect(states[0].serial).toBe(1);
      expect(states[0].terraformVersion).toBe('1.5.0');
      expect(states[0].lineage).toBe('test-lineage-123');
      expect(states[0].stateVersion).toBe(4);
      expect(states[0].resourceCount).toBe(1);
    });

    test('should save checksum', async () => {
      const stateFile = createStateFile(tempDir, 1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
      ]);

      await plugin.importState(stateFile);

      const states = await plugin.stateFilesResource.list();
      expect(states[0].sha256Hash).toBeDefined();
      expect(typeof states[0].sha256Hash).toBe('string');
    });

    test('should maintain chronological order', async () => {
      for (let i = 1; i <= 5; i++) {
        const stateFile = createStateFile(tempDir, i, [
          { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: `i-${i}` } }] },
        ]);
        await plugin.importState(stateFile);
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const states = await plugin.stateFilesResource.list();
      expect(states).toHaveLength(5);
      const sortedStates = states.sort((a, b) => a.serial - b.serial);
      expect(sortedStates.map(s => s.serial)).toEqual([1, 2, 3, 4, 5]);
    });
  });
});
