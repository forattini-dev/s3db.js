import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { writeFileSync } from 'fs';
import { join } from 'path';

import {
  InvalidStateFileError,
  StateFileNotFoundError,
  UnsupportedStateVersionError,
} from '../../../src/plugins/tfstate/errors.js';
import { TfStatePlugin } from '../../../src/plugins/tfstate/index.js';
import { createTfstateContext, createStateFile } from './helpers.js';

describe('TfStatePlugin - State Parsing & Resource Extraction', () => {
  let context;
  let database;
  let tempDir;

  beforeEach(async () => {
    context = await createTfstateContext('parsing');
    ({ database, tempDir } = context);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('State File Parsing', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin({ asyncPartitions: false });
      await plugin.install(database);
    });

    test('should parse valid state file v4', async () => {
      const stateFile = createStateFile(tempDir, 1, [
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
              },
            },
          ],
        },
      ]);

      const result = await plugin.importState(stateFile);
      expect(result).toBeDefined();
      expect(result.serial).toBe(1);
      expect(result.resourcesExtracted).toBe(1);
      expect(result.resourcesInserted).toBe(1);
    });

    test('should parse valid state file v3', async () => {
      const stateFile = createStateFile(
        tempDir,
        1,
        [
          {
            mode: 'managed',
            type: 'aws_s3_bucket',
            name: 'app_bucket',
            instances: [{ attributes: { id: 'my-bucket', bucket: 'my-bucket' } }],
          },
        ],
        { version: 3 },
      );

      const result = await plugin.importState(stateFile);
      expect(result.serial).toBe(1);
      expect(result.resourcesExtracted).toBe(1);
    });

    test('should throw error for non-existent file', async () => {
      await expect(plugin.importState('/non/existent/file.tfstate')).rejects.toThrow(
        StateFileNotFoundError,
      );
    });

    test('should throw error for invalid JSON', async () => {
      const invalidFile = join(tempDir, 'invalid.tfstate');
      writeFileSync(invalidFile, 'not valid json {');

      await expect(plugin.importState(invalidFile)).rejects.toThrow(InvalidStateFileError);
    });

    test('should throw error for unsupported version', async () => {
      const stateFile = createStateFile(tempDir, 1, [], { version: 5 });

      await expect(plugin.importState(stateFile)).rejects.toThrow(UnsupportedStateVersionError);
    });

    test('should throw error for missing required fields', async () => {
      const invalidFile = join(tempDir, 'missing-version.tfstate');
      writeFileSync(
        invalidFile,
        JSON.stringify({
          serial: 1,
          lineage: 'abc-123',
        }),
      );

      await expect(plugin.importState(invalidFile)).rejects.toThrow(InvalidStateFileError);
    });

    test('should parse state with multiple resources', async () => {
      const stateFile = createStateFile(tempDir, 1, [
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'web',
          instances: [{ attributes: { id: 'i-1', instance_type: 't2.micro' } }],
        },
        {
          mode: 'managed',
          type: 'aws_s3_bucket',
          name: 'bucket',
          instances: [{ attributes: { id: 'bucket-1', bucket: 'bucket-1' } }],
        },
        {
          mode: 'managed',
          type: 'aws_dynamodb_table',
          name: 'table',
          instances: [{ attributes: { id: 'table-1', name: 'table-1' } }],
        },
      ]);

      const result = await plugin.importState(stateFile);
      expect(result.resourcesExtracted).toBe(3);
      expect(result.resourcesInserted).toBe(3);
    });

    test('should parse state with multiple instances per resource', async () => {
      const stateFile = createStateFile(tempDir, 1, [
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'web',
          instances: [
            { attributes: { id: 'i-1', instance_type: 't2.micro' } },
            { attributes: { id: 'i-2', instance_type: 't2.small' } },
            { attributes: { id: 'i-3', instance_type: 't2.medium' } },
          ],
        },
      ]);

      const result = await plugin.importState(stateFile);
      expect(result.resourcesExtracted).toBe(3);
    });
  });

  describe('Resource Extraction', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin({ asyncPartitions: false });
      await plugin.install(database);
    });

    test('should extract resource with all fields', async () => {
      const stateFile = createStateFile(tempDir, 1, [
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
                  Environment: 'production',
                },
              },
              dependencies: ['aws_vpc.main'],
            },
          ],
        },
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
      const stateFile = createStateFile(tempDir, 1, [
        {
          mode: 'managed',
          type: 'aws_s3_bucket',
          name: 'app_bucket',
          instances: [{ attributes: { id: 'bucket-1' } }],
        },
      ]);

      await plugin.importState(stateFile);

      const resources = await plugin.resource.list();
      expect(resources[0].resourceAddress).toBe('aws_s3_bucket.app_bucket');
    });

    test('should handle data sources', async () => {
      const stateFile = createStateFile(tempDir, 1, [
        {
          mode: 'data',
          type: 'aws_ami',
          name: 'ubuntu',
          instances: [{ attributes: { id: 'ami-123', name: 'ubuntu' } }],
        },
      ]);

      await plugin.importState(stateFile);

      const resources = await plugin.resource.list();
      expect(resources[0].mode).toBe('data');
      expect(resources[0].resourceAddress).toBe('data.aws_ami.ubuntu');
    });

    test('should store state serial and version', async () => {
      const stateFile = createStateFile(
        tempDir,
        5,
        [
          {
            mode: 'managed',
            type: 'aws_instance',
            name: 'web',
            instances: [{ attributes: { id: 'i-1' } }],
          },
        ],
        { version: 4 },
      );

      await plugin.importState(stateFile);

      const resources = await plugin.resource.list();
      expect(resources[0].stateSerial).toBe(5);
    });
  });

  describe('Resource Filtering', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin({
        asyncPartitions: false,
        filters: {
          types: ['aws_instance', 'aws_s3_bucket'],
          exclude: ['data.*', '.*_test'],
        },
      });
      await plugin.install(database);
    });

    test('should filter by allowed types', async () => {
      const stateFile = createStateFile(tempDir, 1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] },
        {
          mode: 'managed',
          type: 'aws_dynamodb_table',
          name: 'table',
          instances: [{ attributes: { id: 'table-1' } }],
        },
      ]);

      const result = await plugin.importState(stateFile);
      expect(result.resourcesExtracted).toBe(3);
      expect(result.resourcesInserted).toBe(2);

      const resources = await plugin.resource.list();
      expect(resources).toHaveLength(2);
      expect(resources.find(r => r.resourceType === 'aws_instance')).toBeDefined();
      expect(resources.find(r => r.resourceType === 'aws_s3_bucket')).toBeDefined();
      expect(resources.find(r => r.resourceType === 'aws_dynamodb_table')).toBeUndefined();
    });

    test('should exclude data sources', async () => {
      const stateFile = createStateFile(tempDir, 1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'data', type: 'aws_ami', name: 'ubuntu', instances: [{ attributes: { id: 'ami-1' } }] },
      ]);

      const result = await plugin.importState(stateFile);
      expect(result.resourcesInserted).toBe(1);

      const resources = await plugin.resource.list();
      expect(resources).toHaveLength(1);
      expect(resources[0].mode).toBe('managed');
    });

    test('should exclude by name pattern', async () => {
      const stateFile = createStateFile(tempDir, 1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
        { mode: 'managed', type: 'aws_instance', name: 'web_test', instances: [{ attributes: { id: 'i-2' } }] },
      ]);

      const result = await plugin.importState(stateFile);
      expect(result.resourcesInserted).toBe(1);
    });

    test('should allow all resources when no filters', async () => {
      const noFilterPlugin = new TfStatePlugin({ asyncPartitions: false });
      await noFilterPlugin.install(database);

      const stateFile = createStateFile(tempDir, 1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
        {
          mode: 'managed',
          type: 'aws_dynamodb_table',
          name: 'table',
          instances: [{ attributes: { id: 'table-1' } }],
        },
        { mode: 'data', type: 'aws_ami', name: 'ubuntu', instances: [{ attributes: { id: 'ami-1' } }] },
      ]);

      const result = await noFilterPlugin.importState(stateFile);
      expect(result.resourcesInserted).toBe(3);
    });
  });
});
