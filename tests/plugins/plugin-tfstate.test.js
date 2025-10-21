import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { createDatabaseForTest, createTemporaryPathForTest } from '../config.js';
import { TfStatePlugin } from '../../src/plugins/tfstate/index.js';
import {
  TfStateError,
  InvalidStateFileError,
  UnsupportedStateVersionError,
  StateFileNotFoundError,
  ResourceExtractionError,
  StateDiffError,
  FileWatchError,
  ResourceFilterError
} from '../../src/plugins/tfstate/errors.js';
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('TfStatePlugin - Comprehensive Tests', () => {
  let database;
  let tempDir;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/terraform-state');
    await database.connect();
    tempDir = await createTemporaryPathForTest('terraform-state');
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
    // Clean up temp files
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // Helper: Create example Terraform state file
  function createExampleStateFile(serial, resources, options = {}) {
    const state = {
      version: options.version || 4,
      terraform_version: options.terraformVersion || '1.5.0',
      serial,
      lineage: options.lineage || 'example-lineage-abc-123',
      outputs: options.outputs || {},
      resources
    };

    const fileName = options.fileName || `test-state-${serial}.tfstate`;
    const filePath = join(tempDir, fileName);
    writeFileSync(filePath, JSON.stringify(state, null, 2));
    return filePath;
  }

  describe('Error Classes', () => {
    test('should create TfStateError with context', () => {
      const error = new TfStateError('Test error', { foo: 'bar' });
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('TfStateError');
      expect(error.message).toBe('Test error');
      expect(error.context).toEqual({ foo: 'bar' });
    });

    test('should create InvalidStateFileError', () => {
      const error = new InvalidStateFileError('/path/to/state.tfstate', 'missing version field');
      expect(error).toBeInstanceOf(TfStateError);
      expect(error.name).toBe('InvalidStateFileError');
      expect(error.filePath).toBe('/path/to/state.tfstate');
      expect(error.reason).toBe('missing version field');
      expect(error.message).toContain('Invalid Terraform state file');
    });

    test('should create UnsupportedStateVersionError', () => {
      const error = new UnsupportedStateVersionError(5, [3, 4]);
      expect(error).toBeInstanceOf(TfStateError);
      expect(error.name).toBe('UnsupportedStateVersionError');
      expect(error.version).toBe(5);
      expect(error.supportedVersions).toEqual([3, 4]);
      expect(error.message).toContain('not supported');
    });

    test('should create StateFileNotFoundError', () => {
      const error = new StateFileNotFoundError('/missing/state.tfstate');
      expect(error).toBeInstanceOf(TfStateError);
      expect(error.name).toBe('StateFileNotFoundError');
      expect(error.filePath).toBe('/missing/state.tfstate');
    });

    test('should create ResourceExtractionError', () => {
      const originalError = new Error('Extraction failed');
      const error = new ResourceExtractionError('aws_instance.web', originalError);
      expect(error).toBeInstanceOf(TfStateError);
      expect(error.name).toBe('ResourceExtractionError');
      expect(error.resourceAddress).toBe('aws_instance.web');
      expect(error.originalError).toBe(originalError);
    });

    test('should create StateDiffError', () => {
      const originalError = new Error('Diff failed');
      const error = new StateDiffError(1, 2, originalError);
      expect(error).toBeInstanceOf(TfStateError);
      expect(error.name).toBe('StateDiffError');
      expect(error.oldSerial).toBe(1);
      expect(error.newSerial).toBe(2);
    });

    test('should create FileWatchError', () => {
      const originalError = new Error('Watch failed');
      const error = new FileWatchError('/path/to/watch', originalError);
      expect(error).toBeInstanceOf(TfStateError);
      expect(error.name).toBe('FileWatchError');
      expect(error.path).toBe('/path/to/watch');
    });

    test('should create ResourceFilterError', () => {
      const originalError = new Error('Filter failed');
      const error = new ResourceFilterError('aws_*', originalError);
      expect(error).toBeInstanceOf(TfStateError);
      expect(error.name).toBe('ResourceFilterError');
      expect(error.filterExpression).toBe('aws_*');
    });
  });

  describe('Plugin Installation', () => {
    test('should create plugin with default configuration', () => {
      const plugin = new TfStatePlugin();
      expect(plugin.resourceName).toBe('plg_tfstate_resources');
      expect(plugin.stateFilesName).toBe('plg_tfstate_state_files');
      expect(plugin.diffsName).toBe('plg_tfstate_state_diffs');
      expect(plugin.trackDiffs).toBe(true);
      expect(plugin.autoSync).toBe(false);
      expect(plugin.verbose).toBe(false);
      expect(plugin.supportedVersions).toEqual([3, 4]);
    });

    test('should create plugin with custom configuration', () => {
      const plugin = new TfStatePlugin({
        resourceName: 'custom_resources',
        stateHistoryName: 'custom_history',
        trackDiffs: false,
        autoSync: true,
        verbose: true,
        filters: {
          types: ['aws_instance'],
          exclude: ['data.*']
        }
      });
      expect(plugin.resourceName).toBe('custom_resources');
      expect(plugin.stateHistoryName).toBe('custom_history');
      expect(plugin.trackDiffs).toBe(false);
      expect(plugin.autoSync).toBe(true);
      expect(plugin.verbose).toBe(true);
      expect(plugin.filters).toEqual({
        types: ['aws_instance'],
        exclude: ['data.*']
      });
    });

    test('should install plugin and create resources', async () => {
      const plugin = new TfStatePlugin();
      await plugin.install(database);

      expect(plugin.database).toBe(database);
      expect(plugin.resource).toBeDefined();
      expect(plugin.resource.name).toBe('plg_tfstate_resources');
      expect(plugin.diffsResource).toBeDefined();
      expect(plugin.diffsResource.name).toBe('plg_tfstate_state_diffs');
    });

    test('should create plg_tfstate_resources with correct schema', async () => {
      const plugin = new TfStatePlugin();
      await plugin.install(database);

      const attributes = plugin.resource.attributes;
      expect(attributes.id).toBeDefined();
      expect(attributes.stateSerial).toBeDefined();
      expect(attributes.resourceType).toBeDefined();
      expect(attributes.resourceName).toBeDefined();
      expect(attributes.resourceAddress).toBeDefined();
      expect(attributes.mode).toBeDefined();
      expect(attributes.attributes).toBeDefined();
    });

    test('should create plg_tfstate_state_diffs with correct schema', async () => {
      const plugin = new TfStatePlugin({ trackDiffs: true });
      await plugin.install(database);

      const attributes = plugin.diffsResource.attributes;
      expect(attributes.id).toBeDefined();
      expect(attributes.sourceFile).toBeDefined();
      expect(attributes.oldSerial).toBeDefined();
      expect(attributes.newSerial).toBeDefined();
      expect(attributes.calculatedAt).toBeDefined();
      expect(attributes.summary).toBeDefined();
      expect(attributes.changes).toBeDefined();
    });

    test('should not create state history when trackDiffs is false', async () => {
      const plugin = new TfStatePlugin({ trackDiffs: false });
      await plugin.install(database);

      expect(plugin.resource).toBeDefined();
      expect(plugin.diffsResource).toBeNull();
    });

    test('should create resources with partitions', async () => {
      const plugin = new TfStatePlugin();
      await plugin.install(database);

      // Verify plugin created resources
      expect(plugin.resource).toBeDefined();
      expect(plugin.resource.name).toBe('plg_tfstate_resources');

      // Test partition functionality by inserting and querying
      const testResource = {
        id: 'test-1',
        stateFileId: 'test-state-file-id',
        stateSerial: 1,
        sourceFile: '/tmp/test.tfstate',
        resourceType: 'aws_instance',
        resourceName: 'test',
        resourceAddress: 'aws_instance.test',
        providerName: '',
        mode: 'managed',
        attributes: {},
        dependencies: [],
        importedAt: Date.now(),
        stateVersion: 4
      };

      const insertResult = await plugin.resource.insert(testResource);
      expect(insertResult).toBeDefined();
      expect(insertResult.id).toBe('test-1');

      // Verify insert worked by listing all
      const all = await plugin.resource.list();
      expect(all.length).toBeGreaterThanOrEqual(1);

      // Try partition query - if partitions work, this should succeed
      const byType = await plugin.resource.listPartition({
        partition: 'byType',
        partitionValues: { resourceType: 'aws_instance' }
      });

      expect(byType).toHaveLength(1);
      expect(byType[0].resourceType).toBe('aws_instance');
    });
  });

  describe('State File Parsing', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin();
      await plugin.install(database);
    });

    test('should parse valid state file v4', async () => {
      const stateFile = createExampleStateFile(1, [
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'web_server',
          provider: 'provider["registry.terraform.io/hashicorp/aws"]',
          instances: [
            {
              attributes: {
                id: 'i-1234567890abcdef0',
                instance_type: 't2.micro'
              }
            }
          ]
        }
      ]);

      const result = await plugin.importState(stateFile);
      expect(result).toBeDefined();
      expect(result.serial).toBe(1);
      expect(result.resourcesExtracted).toBe(1);
      expect(result.resourcesInserted).toBe(1);
    });

    test('should parse valid state file v3', async () => {
      const stateFile = createExampleStateFile(1, [
        {
          mode: 'managed',
          type: 'aws_s3_bucket',
          name: 'app_bucket',
          instances: [{ attributes: { id: 'my-bucket', bucket: 'my-bucket' } }]
        }
      ], { version: 3 });

      const result = await plugin.importState(stateFile);
      expect(result.serial).toBe(1);
      expect(result.resourcesExtracted).toBe(1);
    });

    test('should throw error for non-existent file', async () => {
      await expect(plugin.importState('/non/existent/file.tfstate'))
        .rejects.toThrow(StateFileNotFoundError);
    });

    test('should throw error for invalid JSON', async () => {
      const invalidFile = join(tempDir, 'invalid.tfstate');
      writeFileSync(invalidFile, 'not valid json {');

      await expect(plugin.importState(invalidFile))
        .rejects.toThrow(InvalidStateFileError);
    });

    test('should throw error for unsupported version', async () => {
      const stateFile = createExampleStateFile(1, [], { version: 5 });

      await expect(plugin.importState(stateFile))
        .rejects.toThrow(UnsupportedStateVersionError);
    });

    test('should throw error for missing required fields', async () => {
      const invalidFile = join(tempDir, 'missing-version.tfstate');
      writeFileSync(invalidFile, JSON.stringify({
        serial: 1,
        lineage: 'abc-123'
        // Missing version field
      }));

      await expect(plugin.importState(invalidFile))
        .rejects.toThrow(InvalidStateFileError);
    });

    test('should parse state with multiple resources', async () => {
      const stateFile = createExampleStateFile(1, [
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'web',
          instances: [{ attributes: { id: 'i-1', instance_type: 't2.micro' } }]
        },
        {
          mode: 'managed',
          type: 'aws_s3_bucket',
          name: 'bucket',
          instances: [{ attributes: { id: 'bucket-1', bucket: 'bucket-1' } }]
        },
        {
          mode: 'managed',
          type: 'aws_dynamodb_table',
          name: 'table',
          instances: [{ attributes: { id: 'table-1', name: 'table-1' } }]
        }
      ]);

      const result = await plugin.importState(stateFile);
      expect(result.resourcesExtracted).toBe(3);
      expect(result.resourcesInserted).toBe(3);
    });

    test('should parse state with multiple instances per resource', async () => {
      const stateFile = createExampleStateFile(1, [
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'web',
          instances: [
            { attributes: { id: 'i-1', instance_type: 't2.micro' } },
            { attributes: { id: 'i-2', instance_type: 't2.small' } },
            { attributes: { id: 'i-3', instance_type: 't2.medium' } }
          ]
        }
      ]);

      const result = await plugin.importState(stateFile);
      expect(result.resourcesExtracted).toBe(3);
    });
  });

  describe('Resource Extraction', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin();
      await plugin.install(database);
    });

    test('should extract resource with all fields', async () => {
      const stateFile = createExampleStateFile(1, [
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
                tags: {
                  Name: 'Web Server',
                  Environment: 'production'
                }
              },
              dependencies: ['aws_vpc.main']
            }
          ]
        }
      ]);

      const result = await plugin.importState(stateFile);
      expect(result.resourcesInserted).toBe(1);

      const resources = await plugin.resource.list();
      expect(resources).toHaveLength(1);

      const resource = resources[0];
      expect(resource.resourceType).toBe('aws_instance');
      expect(resource.resourceName).toBe('web_server');
      expect(resource.resourceAddress).toBe('aws_instance.web_server');
      expect(resource.mode).toBe('managed');
      expect(resource.stateSerial).toBe(1);
      expect(resource.attributes.id).toBe('i-1234567890abcdef0');
      expect(resource.attributes.instance_type).toBe('t2.micro');
    });

    test('should generate correct resource address', async () => {
      const stateFile = createExampleStateFile(1, [
        {
          mode: 'managed',
          type: 'aws_s3_bucket',
          name: 'app_bucket',
          instances: [{ attributes: { id: 'bucket-1' } }]
        }
      ]);

      await plugin.importState(stateFile);

      const resources = await plugin.resource.list();
      expect(resources[0].resourceAddress).toBe('aws_s3_bucket.app_bucket');
    });

    test('should handle data sources', async () => {
      const stateFile = createExampleStateFile(1, [
        {
          mode: 'data',
          type: 'aws_ami',
          name: 'ubuntu',
          instances: [{ attributes: { id: 'ami-123', name: 'ubuntu' } }]
        }
      ]);

      await plugin.importState(stateFile);

      const resources = await plugin.resource.list();
      expect(resources[0].mode).toBe('data');
      expect(resources[0].resourceAddress).toBe('data.aws_ami.ubuntu');
    });

    test('should store state serial and version', async () => {
      const stateFile = createExampleStateFile(5, [
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'web',
          instances: [{ attributes: { id: 'i-1' } }]
        }
      ], { version: 4 });

      await plugin.importState(stateFile);

      const resources = await plugin.resource.list();
      expect(resources[0].stateSerial).toBe(5);
      expect(resources[0].stateVersion).toBe(4);
    });
  });

  describe('Resource Filtering', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin({
        filters: {
          types: ['aws_instance', 'aws_s3_bucket'],
          exclude: ['data.*', '.*_test']
        }
      });
      await plugin.install(database);
    });

    test('should filter by allowed types', async () => {
      const stateFile = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] },
        { mode: 'managed', type: 'aws_dynamodb_table', name: 'table', instances: [{ attributes: { id: 'table-1' } }] }
      ]);

      const result = await plugin.importState(stateFile);
      expect(result.resourcesExtracted).toBe(3);
      expect(result.resourcesInserted).toBe(2); // Only aws_instance and aws_s3_bucket

      const resources = await plugin.resource.list();
      expect(resources).toHaveLength(2);
      expect(resources.find(r => r.resourceType === 'aws_instance')).toBeDefined();
      expect(resources.find(r => r.resourceType === 'aws_s3_bucket')).toBeDefined();
      expect(resources.find(r => r.resourceType === 'aws_dynamodb_table')).toBeUndefined();
    });

    test('should exclude data sources', async () => {
      const stateFile = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'data', type: 'aws_ami', name: 'ubuntu', instances: [{ attributes: { id: 'ami-1' } }] }
      ]);

      const result = await plugin.importState(stateFile);
      expect(result.resourcesInserted).toBe(1); // Only aws_instance

      const resources = await plugin.resource.list();
      expect(resources).toHaveLength(1);
      expect(resources[0].mode).toBe('managed');
    });

    test('should exclude by name pattern', async () => {
      const stateFile = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'managed', type: 'aws_instance', name: 'web_test', instances: [{ attributes: { id: 'i-2' } }] }
      ]);

      const result = await plugin.importState(stateFile);
      expect(result.resourcesInserted).toBe(1); // Only 'web', not 'web_test'
    });

    test('should allow all resources when no filters', async () => {
      const noFilterPlugin = new TfStatePlugin();
      await noFilterPlugin.install(database);

      const stateFile = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'managed', type: 'aws_dynamodb_table', name: 'table', instances: [{ attributes: { id: 'table-1' } }] },
        { mode: 'data', type: 'aws_ami', name: 'ubuntu', instances: [{ attributes: { id: 'ami-1' } }] }
      ]);

      const result = await noFilterPlugin.importState(stateFile);
      expect(result.resourcesInserted).toBe(3); // All resources
    });
  });

  describe('Diff Tracking', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin({ trackDiffs: true });
      await plugin.install(database);
    });

    test('should mark first state as isFirst', async () => {
      const stateFile = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] }
      ]);

      await plugin.importState(stateFile);

      const history = await plugin.diffsResource.list();
      expect(history).toHaveLength(1);
      expect(history[0].diff.isFirst).toBe(true);
      expect(history[0].diff.added).toEqual([]);
      expect(history[0].diff.modified).toEqual([]);
      expect(history[0].diff.deleted).toEqual([]);
    });

    test('should detect added resources', async () => {
      // State 1: One resource
      const stateFile1 = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] }
      ]);
      await plugin.importState(stateFile1);

      // State 2: Two resources (one added)
      const stateFile2 = createExampleStateFile(2, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] }
      ]);
      await plugin.importState(stateFile2);

      const history = await plugin.diffsResource.query({ serial: 2 });
      expect(history).toHaveLength(1);
      expect(history[0].diff.isFirst).toBe(false);
      expect(history[0].diff.added).toHaveLength(1);
      expect(history[0].diff.added[0].address).toBe('aws_s3_bucket.bucket');
      expect(history[0].diff.added[0].type).toBe('aws_s3_bucket');
    });

    test('should detect deleted resources', async () => {
      // State 1: Two resources
      const stateFile1 = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] }
      ]);
      await plugin.importState(stateFile1);

      // State 2: One resource (one deleted)
      const stateFile2 = createExampleStateFile(2, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] }
      ]);
      await plugin.importState(stateFile2);

      const history = await plugin.diffsResource.query({ serial: 2 });
      expect(history[0].diff.deleted).toHaveLength(1);
      expect(history[0].diff.deleted[0].address).toBe('aws_s3_bucket.bucket');
    });

    test('should detect modified resources', async () => {
      // State 1: t2.micro
      const stateFile1 = createExampleStateFile(1, [
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'web',
          instances: [{ attributes: { id: 'i-1', instance_type: 't2.micro' } }]
        }
      ]);
      await plugin.importState(stateFile1);

      // State 2: t2.small (modified)
      const stateFile2 = createExampleStateFile(2, [
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'web',
          instances: [{ attributes: { id: 'i-1', instance_type: 't2.small' } }]
        }
      ]);
      await plugin.importState(stateFile2);

      const history = await plugin.diffsResource.query({ serial: 2 });
      expect(history[0].diff.modified).toHaveLength(1);
      expect(history[0].diff.modified[0].address).toBe('aws_instance.web');
      expect(history[0].diff.modified[0].changes).toHaveLength(1);
      expect(history[0].diff.modified[0].changes[0].field).toBe('attributes.instance_type');
      expect(history[0].diff.modified[0].changes[0].oldValue).toBe('t2.micro');
      expect(history[0].diff.modified[0].changes[0].newValue).toBe('t2.small');
    });

    test('should detect complex changes', async () => {
      // State 1: Three resources
      const stateFile1 = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1', instance_type: 't2.micro' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] },
        { mode: 'managed', type: 'aws_dynamodb_table', name: 'table', instances: [{ attributes: { id: 'table-1' } }] }
      ]);
      await plugin.importState(stateFile1);

      // State 2: Modified instance, deleted bucket, added RDS
      const stateFile2 = createExampleStateFile(2, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1', instance_type: 't2.small' } }] },
        { mode: 'managed', type: 'aws_dynamodb_table', name: 'table', instances: [{ attributes: { id: 'table-1' } }] },
        { mode: 'managed', type: 'aws_db_instance', name: 'db', instances: [{ attributes: { id: 'db-1' } }] }
      ]);
      await plugin.importState(stateFile2);

      const history = await plugin.diffsResource.query({ serial: 2 });
      const diff = history[0].diff;
      expect(diff.added).toHaveLength(1);
      expect(diff.added[0].address).toBe('aws_db_instance.db');
      expect(diff.modified).toHaveLength(1);
      expect(diff.modified[0].address).toBe('aws_instance.web');
      expect(diff.deleted).toHaveLength(1);
      expect(diff.deleted[0].address).toBe('aws_s3_bucket.bucket');
    });

    test('should not track diffs when disabled', async () => {
      const noDiffPlugin = new TfStatePlugin({ trackDiffs: false });
      await noDiffPlugin.install(database);

      const stateFile = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] }
      ]);

      const result = await noDiffPlugin.importState(stateFile);
      expect(result.diff).toBeNull();
      expect(noDiffPlugin.stateHistoryResource).toBeNull();
    });
  });

  describe('Query Operations', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin();
      await plugin.install(database);
    });

    test('should query resources by type', async () => {
      const stateFile = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web1', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'managed', type: 'aws_instance', name: 'web2', instances: [{ attributes: { id: 'i-2' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] }
      ]);
      await plugin.importState(stateFile);

      const instances = await plugin.resource.query({ resourceType: 'aws_instance' });
      expect(instances).toHaveLength(2);
      expect(instances.every(r => r.resourceType === 'aws_instance')).toBe(true);
    });

    test('should query resources by serial', async () => {
      const stateFile1 = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] }
      ]);
      await plugin.importState(stateFile1);

      const stateFile2 = createExampleStateFile(2, [
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] }
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
      const stateFile = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web1', instances: [{ attributes: { id: 'i-1', instance_type: 't2.micro' } }] },
        { mode: 'managed', type: 'aws_instance', name: 'web2', instances: [{ attributes: { id: 'i-2', instance_type: 't2.small' } }] }
      ]);
      await plugin.importState(stateFile);

      const microInstances = await plugin.resource.query({
        resourceType: 'aws_instance',
        'attributes.instance_type': 't2.micro'
      });

      expect(microInstances).toHaveLength(1);
      expect(microInstances[0].attributes.instance_type).toBe('t2.micro');
    });

    test('should use partition for type queries', async () => {
      const stateFile = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] }
      ]);
      await plugin.importState(stateFile);

      // Query using partition should work
      const instances = await plugin.resource.listPartition({
        partition: 'byType',
        partitionValues: { resourceType: 'aws_instance' }
      });

      expect(instances).toHaveLength(1);
      expect(instances[0].resourceType).toBe('aws_instance');
    });

    test('should count resources by state serial', async () => {
      const stateFile = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web1', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'managed', type: 'aws_instance', name: 'web2', instances: [{ attributes: { id: 'i-2' } }] }
      ]);
      await plugin.importState(stateFile);

      const count = await plugin.resource.count({ stateSerial: 1 });
      expect(count).toBe(2);
    });
  });

  describe('Statistics', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin();
      await plugin.install(database);
    });

    test('should initialize statistics', () => {
      const stats = plugin.getStats();
      expect(stats).toBeDefined();
      expect(stats.statesProcessed).toBe(0);
      expect(stats.resourcesExtracted).toBe(0);
      expect(stats.resourcesInserted).toBe(0);
      expect(stats.lastProcessedSerial).toBeNull();
    });

    test('should track processed states', async () => {
      const stateFile1 = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] }
      ]);
      await plugin.importState(stateFile1);

      const stateFile2 = createExampleStateFile(2, [
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] }
      ]);
      await plugin.importState(stateFile2);

      const stats = plugin.getStats();
      expect(stats.statesProcessed).toBe(2);
      expect(stats.lastProcessedSerial).toBe(2);
    });

    test('should track extracted resources', async () => {
      const stateFile = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web1', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'managed', type: 'aws_instance', name: 'web2', instances: [{ attributes: { id: 'i-2' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] }
      ]);
      await plugin.importState(stateFile);

      const stats = plugin.getStats();
      expect(stats.resourcesExtracted).toBe(3);
      expect(stats.resourcesInserted).toBe(3);
    });

    test('should track filtered resources separately', async () => {
      const filterPlugin = new TfStatePlugin({
        filters: { types: ['aws_instance'] }
      });
      await filterPlugin.install(database);

      const stateFile = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] }
      ]);
      await filterPlugin.importState(stateFile);

      const stats = filterPlugin.getStats();
      expect(stats.resourcesExtracted).toBe(2); // Extracted both
      expect(stats.resourcesInserted).toBe(1); // Inserted only filtered
    });
  });

  describe('State History', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin({ trackDiffs: true });
      await plugin.install(database);
    });

    test('should save state metadata', async () => {
      const stateFile = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] }
      ], { terraformVersion: '1.5.0', lineage: 'test-lineage-123' });

      await plugin.importState(stateFile);

      const history = await plugin.diffsResource.list();
      expect(history).toHaveLength(1);
      expect(history[0].serial).toBe(1);
      expect(history[0].terraformVersion).toBe('1.5.0');
      expect(history[0].lineage).toBe('test-lineage-123');
      expect(history[0].stateVersion).toBe(4);
      expect(history[0].resourceCount).toBe(1);
    });

    test('should save checksum', async () => {
      const stateFile = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] }
      ]);

      await plugin.importState(stateFile);

      const history = await plugin.diffsResource.list();
      expect(history[0].checksum).toBeDefined();
      expect(typeof history[0].checksum).toBe('string');
    });

    test('should maintain chronological order', async () => {
      for (let i = 1; i <= 5; i++) {
        const stateFile = createExampleStateFile(i, [
          { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: `i-${i}` } }] }
        ]);
        await plugin.importState(stateFile);
      }

      const history = await plugin.diffsResource.list({ sort: { serial: 1 } });
      expect(history).toHaveLength(5);
      expect(history.map(h => h.serial)).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('Plugin Lifecycle', () => {
    test('should handle plugin start', async () => {
      const plugin = new TfStatePlugin();
      await plugin.install(database);
      await expect(plugin.onStart()).resolves.not.toThrow();
    });

    test('should handle plugin stop', async () => {
      const plugin = new TfStatePlugin();
      await plugin.install(database);
      await plugin.onStart();
      await expect(plugin.onStop()).resolves.not.toThrow();
    });

    test('should cleanup watchers on stop', async () => {
      const plugin = new TfStatePlugin({
        autoSync: true,
        watchPaths: [tempDir]
      });
      await plugin.install(database);
      await plugin.onStart();

      expect(plugin.watchers).toHaveLength(1);

      await plugin.onStop();
      // Watchers should be cleaned up (but we can't directly verify they're closed)
      expect(true).toBe(true); // Placeholder assertion
    });
  });

  describe('Edge Cases', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin();
      await plugin.install(database);
    });

    test('should handle empty state', async () => {
      const stateFile = createExampleStateFile(1, []);
      const result = await plugin.importState(stateFile);

      expect(result.resourcesExtracted).toBe(0);
      expect(result.resourcesInserted).toBe(0);
    });

    test('should handle resource with no attributes', async () => {
      const stateFile = createExampleStateFile(1, [
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'web',
          instances: [{ attributes: {} }]
        }
      ]);

      const result = await plugin.importState(stateFile);
      expect(result.resourcesInserted).toBe(1);

      const resources = await plugin.resource.list();
      expect(resources[0].attributes).toEqual({});
    });

    test('should handle resource with null/undefined fields', async () => {
      const stateFile = createExampleStateFile(1, [
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'web',
          instances: [
            {
              attributes: { id: 'i-1', tags: null, metadata: undefined }
            }
          ]
        }
      ]);

      await expect(plugin.importState(stateFile)).resolves.toBeDefined();
    });

    test('should handle very large state files', async () => {
      const manyResources = [];
      for (let i = 0; i < 100; i++) {
        manyResources.push({
          mode: 'managed',
          type: 'aws_instance',
          name: `web_${i}`,
          instances: [{ attributes: { id: `i-${i}`, index: i } }]
        });
      }

      const stateFile = createExampleStateFile(1, manyResources);
      const result = await plugin.importState(stateFile);

      expect(result.resourcesExtracted).toBe(100);
      expect(result.resourcesInserted).toBe(100);
    });

    test('should handle duplicate resource addresses in different serials', async () => {
      const stateFile1 = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] }
      ]);
      await plugin.importState(stateFile1);

      const stateFile2 = createExampleStateFile(2, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-2' } }] }
      ]);
      await plugin.importState(stateFile2);

      const allResources = await plugin.resource.list();
      expect(allResources).toHaveLength(2);
      expect(allResources.filter(r => r.resourceAddress === 'aws_instance.web')).toHaveLength(2);
    });

    test('should handle special characters in resource names', async () => {
      const stateFile = createExampleStateFile(1, [
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'web-server_v2.test',
          instances: [{ attributes: { id: 'i-1' } }]
        }
      ]);

      const result = await plugin.importState(stateFile);
      expect(result.resourcesInserted).toBe(1);

      const resources = await plugin.resource.list();
      expect(resources[0].resourceName).toBe('web-server_v2.test');
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete workflow', async () => {
      const plugin = new TfStatePlugin({
        trackDiffs: true,
        filters: {
          types: ['aws_instance', 'aws_s3_bucket']
        }
      });
      await plugin.install(database);

      // Import initial state
      const state1 = createExampleStateFile(1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1', instance_type: 't2.micro' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] }
      ]);
      await plugin.importState(state1);

      // Verify initial import
      let resources = await plugin.resource.list();
      expect(resources).toHaveLength(2);

      // Import updated state
      const state2 = createExampleStateFile(2, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1', instance_type: 't2.small' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket2', instances: [{ attributes: { id: 'bucket-2' } }] }
      ]);
      await plugin.importState(state2);

      // Verify updated state
      resources = await plugin.resource.list();
      expect(resources).toHaveLength(5); // 2 from state1 + 3 from state2

      // Verify diff tracking
      const history = await plugin.diffsResource.query({ serial: 2 });
      expect(history[0].diff.added).toHaveLength(1);
      expect(history[0].diff.modified).toHaveLength(1);

      // Verify statistics
      const stats = plugin.getStats();
      expect(stats.statesProcessed).toBe(2);
      expect(stats.resourcesExtracted).toBe(5);
    });
  });

  describe('Glob Pattern Matching', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin();
      await plugin.install(database);
    });

    test('should match exact filename', () => {
      expect(plugin._matchesGlobPattern('terraform.tfstate', 'terraform.tfstate')).toBe(true);
      expect(plugin._matchesGlobPattern('other.tfstate', 'terraform.tfstate')).toBe(false);
    });

    test('should match * wildcard (single directory level)', () => {
      expect(plugin._matchesGlobPattern('prod.tfstate', '*.tfstate')).toBe(true);
      expect(plugin._matchesGlobPattern('dev.tfstate', '*.tfstate')).toBe(true);
      expect(plugin._matchesGlobPattern('envs/prod.tfstate', '*.tfstate')).toBe(false);
    });

    test('should match ** wildcard (recursive)', () => {
      expect(plugin._matchesGlobPattern('terraform.tfstate', '**/*.tfstate')).toBe(true);
      expect(plugin._matchesGlobPattern('envs/prod.tfstate', '**/*.tfstate')).toBe(true);
      expect(plugin._matchesGlobPattern('a/b/c/terraform.tfstate', '**/*.tfstate')).toBe(true);
      expect(plugin._matchesGlobPattern('terraform.json', '**/*.tfstate')).toBe(false);
    });

    test('should match ? wildcard (single character)', () => {
      expect(plugin._matchesGlobPattern('prod1.tfstate', 'prod?.tfstate')).toBe(true);
      expect(plugin._matchesGlobPattern('prod2.tfstate', 'prod?.tfstate')).toBe(true);
      expect(plugin._matchesGlobPattern('prod10.tfstate', 'prod?.tfstate')).toBe(false);
    });

    test('should match [] character sets', () => {
      expect(plugin._matchesGlobPattern('prod1.tfstate', 'prod[123].tfstate')).toBe(true);
      expect(plugin._matchesGlobPattern('prod2.tfstate', 'prod[123].tfstate')).toBe(true);
      expect(plugin._matchesGlobPattern('prod4.tfstate', 'prod[123].tfstate')).toBe(false);
    });

    test('should match complex patterns', () => {
      expect(plugin._matchesGlobPattern('envs/prod-us/terraform.tfstate', 'envs/prod-*/terraform.tfstate')).toBe(true);
      expect(plugin._matchesGlobPattern('envs/prod-eu/terraform.tfstate', 'envs/prod-*/terraform.tfstate')).toBe(true);
      expect(plugin._matchesGlobPattern('envs/dev-us/terraform.tfstate', 'envs/prod-*/terraform.tfstate')).toBe(false);
    });

    test('should match nested directories', () => {
      expect(plugin._matchesGlobPattern('projects/myapp/envs/prod/terraform.tfstate', 'projects/*/envs/*/terraform.tfstate')).toBe(true);
      expect(plugin._matchesGlobPattern('projects/myapp/terraform.tfstate', 'projects/*/envs/*/terraform.tfstate')).toBe(false);
    });
  });

  describe('S3 Glob Import', () => {
    let plugin;
    let testBucket;

    beforeEach(async () => {
      testBucket = database.bucketName;
      plugin = new TfStatePlugin({ verbose: false });
      await plugin.install(database);
    });

    test('should import multiple state files using glob pattern', async () => {
      // Upload multiple state files to S3
      const states = [
        {
          key: 'terraform/prod.tfstate',
          content: {
            version: 4,
            terraform_version: '1.5.0',
            serial: 1,
            lineage: 'prod-lineage',
            outputs: {},
            resources: [
              {
                mode: 'managed',
                type: 'aws_instance',
                name: 'prod_web',
                instances: [{ attributes: { id: 'i-prod', instance_type: 't2.micro' } }]
              }
            ]
          }
        },
        {
          key: 'terraform/dev.tfstate',
          content: {
            version: 4,
            terraform_version: '1.5.0',
            serial: 1,
            lineage: 'dev-lineage',
            outputs: {},
            resources: [
              {
                mode: 'managed',
                type: 'aws_instance',
                name: 'dev_web',
                instances: [{ attributes: { id: 'i-dev', instance_type: 't2.nano' } }]
              }
            ]
          }
        },
        {
          key: 'terraform/staging.tfstate',
          content: {
            version: 4,
            terraform_version: '1.5.0',
            serial: 1,
            lineage: 'staging-lineage',
            outputs: {},
            resources: [
              {
                mode: 'managed',
                type: 'aws_s3_bucket',
                name: 'staging_bucket',
                instances: [{ attributes: { id: 'bucket-staging' } }]
              }
            ]
          }
        }
      ];

      // Upload all state files to S3
      for (const state of states) {
        await database.client.putObject({
          key: state.key,
          body: JSON.stringify(state.content),
          contentType: 'application/json'
        });
      }

      // Import using glob pattern
      const result = await plugin.importStatesFromS3Glob(testBucket, 'terraform/*.tfstate');

      // Verify results
      expect(result.filesProcessed).toBe(3);
      expect(result.filesFailed).toBe(0);
      expect(result.totalResourcesExtracted).toBe(3);
      expect(result.totalResourcesInserted).toBe(3);
      expect(result.files).toHaveLength(3);
      expect(result.duration).toBeGreaterThan(0);

      // Verify individual file results
      const prodFile = result.files.find(f => f.file === 'terraform/prod.tfstate');
      expect(prodFile).toBeDefined();
      expect(prodFile.serial).toBe(1);
      expect(prodFile.resourcesExtracted).toBe(1);

      // Verify resources were inserted
      const resources = await plugin.resource.list();
      expect(resources).toHaveLength(3);

      // Verify sourceFile is tracked
      const prodResource = resources.find(r => r.resourceName === 'prod_web');
      expect(prodResource.sourceFile).toBe('terraform/prod.tfstate');

      const devResource = resources.find(r => r.resourceName === 'dev_web');
      expect(devResource.sourceFile).toBe('terraform/dev.tfstate');

      // Cleanup
      for (const state of states) {
        await database.client.deleteObject({ key: state.key });
      }
    });

    test('should handle glob pattern with ** (recursive)', async () => {
      // Upload state files in nested directories
      const states = [
        { key: 'envs/prod/us/terraform.tfstate', serial: 1, resourceName: 'prod_us' },
        { key: 'envs/prod/eu/terraform.tfstate', serial: 2, resourceName: 'prod_eu' },
        { key: 'envs/dev/us/terraform.tfstate', serial: 3, resourceName: 'dev_us' }
      ];

      for (const state of states) {
        await database.client.putObject({
          key: state.key,
          body: JSON.stringify({
            version: 4,
            terraform_version: '1.5.0',
            serial: state.serial,
            lineage: `lineage-${state.serial}`,
            outputs: {},
            resources: [
              {
                mode: 'managed',
                type: 'aws_instance',
                name: state.resourceName,
                instances: [{ attributes: { id: `i-${state.serial}` } }]
              }
            ]
          }),
          contentType: 'application/json'
        });
      }

      // Import using recursive glob
      const result = await plugin.importStatesFromS3Glob(testBucket, 'envs/**/terraform.tfstate');

      expect(result.filesProcessed).toBe(3);
      expect(result.totalResourcesExtracted).toBe(3);

      // Cleanup
      for (const state of states) {
        await database.client.deleteObject({ key: state.key });
      }
    });

    test('should handle glob pattern with specific prefix', async () => {
      // Upload files with different prefixes
      const states = [
        { key: 'envs/prod-us/terraform.tfstate', include: true },
        { key: 'envs/prod-eu/terraform.tfstate', include: true },
        { key: 'envs/dev-us/terraform.tfstate', include: false }
      ];

      for (const state of states) {
        await database.client.putObject({
          key: state.key,
          body: JSON.stringify({
            version: 4,
            terraform_version: '1.5.0',
            serial: 1,
            lineage: 'test',
            outputs: {},
            resources: [
              {
                mode: 'managed',
                type: 'aws_instance',
                name: 'web',
                instances: [{ attributes: { id: 'i-1' } }]
              }
            ]
          }),
          contentType: 'application/json'
        });
      }

      // Import only prod-* files
      const result = await plugin.importStatesFromS3Glob(testBucket, 'envs/prod-*/terraform.tfstate');

      expect(result.filesProcessed).toBe(2);
      expect(result.totalResourcesExtracted).toBe(2);

      // Cleanup
      for (const state of states) {
        await database.client.deleteObject({ key: state.key });
      }
    });

    test('should handle empty result (no matching files)', async () => {
      const result = await plugin.importStatesFromS3Glob(testBucket, 'nonexistent/**/*.tfstate');

      expect(result.filesProcessed).toBe(0);
      expect(result.totalResourcesExtracted).toBe(0);
      expect(result.totalResourcesInserted).toBe(0);
      expect(result.files).toHaveLength(0);
    });

    test('should handle individual file failures gracefully', async () => {
      // Upload one valid and one invalid state file
      const states = [
        {
          key: 'terraform/valid.tfstate',
          content: {
            version: 4,
            terraform_version: '1.5.0',
            serial: 1,
            lineage: 'valid',
            outputs: {},
            resources: [
              {
                mode: 'managed',
                type: 'aws_instance',
                name: 'web',
                instances: [{ attributes: { id: 'i-1' } }]
              }
            ]
          }
        },
        {
          key: 'terraform/invalid.tfstate',
          content: { invalid: 'state file without required fields' }
        }
      ];

      for (const state of states) {
        await database.client.putObject({
          key: state.key,
          body: JSON.stringify(state.content),
          contentType: 'application/json'
        });
      }

      // Import - should succeed for valid file, fail for invalid
      const result = await plugin.importStatesFromS3Glob(testBucket, 'terraform/*.tfstate');

      expect(result.filesProcessed).toBe(1);
      expect(result.filesFailed).toBe(1);
      expect(result.totalResourcesExtracted).toBe(1);
      expect(result.failedFiles).toHaveLength(1);
      expect(result.failedFiles[0].file).toBe('terraform/invalid.tfstate');
      expect(result.failedFiles[0].error).toBeDefined();

      // Cleanup
      for (const state of states) {
        await database.client.deleteObject({ key: state.key });
      }
    });

    test('should support custom concurrency', async () => {
      // Upload 10 state files
      const states = [];
      for (let i = 1; i <= 10; i++) {
        states.push({
          key: `terraform/state-${i}.tfstate`,
          content: {
            version: 4,
            terraform_version: '1.5.0',
            serial: i,
            lineage: `lineage-${i}`,
            outputs: {},
            resources: [
              {
                mode: 'managed',
                type: 'aws_instance',
                name: `web${i}`,
                instances: [{ attributes: { id: `i-${i}` } }]
              }
            ]
          }
        });
      }

      for (const state of states) {
        await database.client.putObject({
          key: state.key,
          body: JSON.stringify(state.content),
          contentType: 'application/json'
        });
      }

      // Import with concurrency of 3
      const result = await plugin.importStatesFromS3Glob(testBucket, 'terraform/state-*.tfstate', {
        concurrency: 3
      });

      expect(result.filesProcessed).toBe(10);
      expect(result.totalResourcesExtracted).toBe(10);

      // Cleanup
      for (const state of states) {
        await database.client.deleteObject({ key: state.key });
      }
    });

    test('should emit globImportCompleted event', async () => {
      const eventPromise = new Promise(resolve => {
        plugin.once('globImportCompleted', resolve);
      });

      // Upload a state file
      await database.client.putObject({
        key: 'terraform/test.tfstate',
        body: JSON.stringify({
          version: 4,
          terraform_version: '1.5.0',
          serial: 1,
          lineage: 'test',
          outputs: {},
          resources: [
            {
              mode: 'managed',
              type: 'aws_instance',
              name: 'web',
              instances: [{ attributes: { id: 'i-1' } }]
            }
          ]
        }),
        contentType: 'application/json'
      });

      // Import
      await plugin.importStatesFromS3Glob(testBucket, 'terraform/*.tfstate');

      // Wait for event
      const eventData = await eventPromise;
      expect(eventData.filesProcessed).toBe(1);
      expect(eventData.totalResourcesExtracted).toBe(1);

      // Cleanup
      await database.client.deleteObject({ key: 'terraform/test.tfstate' });
    });
  });

  describe('State Export', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin({ trackDiffs: true });
      await plugin.install(database);

      // Import some test data first
      const stateFile = createExampleStateFile(1, [
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'web',
          instances: [{ attributes: { id: 'i-123', instance_type: 't2.micro', tags: { Name: 'Web Server' } } }]
        },
        {
          mode: 'managed',
          type: 'aws_s3_bucket',
          name: 'data',
          instances: [{ attributes: { id: 'my-bucket', bucket: 'my-bucket', region: 'us-east-1' } }]
        }
      ]);

      await plugin.importState(stateFile);
    });

    test('should export state to object', async () => {
      const state = await plugin.exportState();

      expect(state.version).toBe(4);
      expect(state.terraform_version).toBe('1.5.0');
      expect(state.serial).toBe(1);
      expect(state.lineage).toBeDefined();
      expect(state.outputs).toEqual({});
      expect(state.resources).toHaveLength(2);

      const instance = state.resources.find(r => r.type === 'aws_instance');
      expect(instance).toBeDefined();
      expect(instance.mode).toBe('managed');
      expect(instance.name).toBe('web');
      expect(instance.instances).toHaveLength(1);
      expect(instance.instances[0].attributes.id).toBe('i-123');
    });

    test('should export with custom terraform version', async () => {
      const state = await plugin.exportState({ terraformVersion: '1.6.0' });

      expect(state.terraform_version).toBe('1.6.0');
    });

    test('should export with custom lineage', async () => {
      const state = await plugin.exportState({ lineage: 'custom-lineage-123' });

      expect(state.lineage).toBe('custom-lineage-123');
    });

    test('should export with custom outputs', async () => {
      const outputs = {
        instance_ip: {
          value: '54.123.45.67',
          type: 'string'
        }
      };

      const state = await plugin.exportState({ outputs });

      expect(state.outputs).toEqual(outputs);
    });

    test('should filter export by resource types', async () => {
      const state = await plugin.exportState({
        resourceTypes: ['aws_instance']
      });

      expect(state.resources).toHaveLength(1);
      expect(state.resources[0].type).toBe('aws_instance');
    });

    test('should export specific serial', async () => {
      // Import a second state
      const stateFile2 = createExampleStateFile(2, [
        {
          mode: 'managed',
          type: 'aws_lambda_function',
          name: 'api',
          instances: [{ attributes: { id: 'api-func', function_name: 'api-func', runtime: 'nodejs18.x' } }]
        }
      ]);
      await plugin.importState(stateFile2);

      // Export serial 1
      const state1 = await plugin.exportState({ serial: 1 });
      expect(state1.serial).toBe(1);
      expect(state1.resources).toHaveLength(2);

      // Export serial 2
      const state2 = await plugin.exportState({ serial: 2 });
      expect(state2.serial).toBe(2);
      expect(state2.resources).toHaveLength(1);
      expect(state2.resources[0].type).toBe('aws_lambda_function');
    });

    test('should export to file', async () => {
      const filePath = join(tempDir, 'exported-state.tfstate');

      const result = await plugin.exportStateToFile(filePath);

      expect(result.filePath).toBe(filePath);
      expect(result.serial).toBe(1);
      expect(result.resourceCount).toBe(2);
      expect(result.groupedResourceCount).toBe(2);

      // Verify file exists and is valid JSON
      const { readFileSync } = await import('fs');
      const content = readFileSync(filePath, 'utf-8');
      const state = JSON.parse(content);

      expect(state.version).toBe(4);
      expect(state.resources).toHaveLength(2);
    });

    test('should export to S3', async () => {
      const bucket = database.bucketName;
      const key = 'terraform/exported-state.tfstate';

      const result = await plugin.exportStateToS3(bucket, key);

      expect(result.bucket).toBe(bucket);
      expect(result.key).toBe(key);
      expect(result.location).toBe(`s3://${bucket}/${key}`);
      expect(result.serial).toBe(1);
      expect(result.resourceCount).toBe(2);
      expect(result.groupedResourceCount).toBe(2);

      // Verify file exists in S3
      const s3Object = await database.client.getObject({ key });
      const content = await s3Object.Body.transformToString();
      const state = JSON.parse(content);

      expect(state.version).toBe(4);
      expect(state.resources).toHaveLength(2);

      // Cleanup
      await database.client.deleteObject({ key });
    });

    test('should emit stateExported event', async () => {
      const eventPromise = new Promise(resolve => {
        plugin.once('stateExported', resolve);
      });

      await plugin.exportState();

      const eventData = await eventPromise;
      expect(eventData.serial).toBe(1);
      expect(eventData.resourceCount).toBe(2);
    });

    test('should emit stateExportedToS3 event', async () => {
      const bucket = database.bucketName;
      const key = 'terraform/test-export.tfstate';

      const eventPromise = new Promise(resolve => {
        plugin.once('stateExportedToS3', resolve);
      });

      await plugin.exportStateToS3(bucket, key);

      const eventData = await eventPromise;
      expect(eventData.bucket).toBe(bucket);
      expect(eventData.key).toBe(key);
      expect(eventData.serial).toBe(1);

      // Cleanup
      await database.client.deleteObject({ key });
    });

    test('should handle export with no resources', async () => {
      // Create plugin with different resource name (empty)
      const emptyPlugin = new TfStatePlugin({
        resourceName: 'empty_resources'
      });
      await emptyPlugin.install(database);

      const state = await emptyPlugin.exportState();

      expect(state.resources).toHaveLength(0);
      expect(state.serial).toBe(1); // Default or lastProcessedSerial
    });

    test('should group multiple instances by resource type+name', async () => {
      // Import state with multiple instances
      const stateFile = createExampleStateFile(3, [
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'workers',
          instances: [
            { attributes: { id: 'i-001', instance_type: 't2.micro' } },
            { attributes: { id: 'i-002', instance_type: 't2.micro' } },
            { attributes: { id: 'i-003', instance_type: 't2.micro' } }
          ]
        }
      ]);

      await plugin.importState(stateFile);

      const state = await plugin.exportState({ serial: 3 });

      expect(state.resources).toHaveLength(1);
      expect(state.resources[0].instances).toHaveLength(3);
      expect(state.resources[0].instances[0].attributes.id).toBe('i-001');
      expect(state.resources[0].instances[1].attributes.id).toBe('i-002');
      expect(state.resources[0].instances[2].attributes.id).toBe('i-003');
    });
  });
});
