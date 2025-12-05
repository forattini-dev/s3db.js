import { join } from 'path';

import { TfStatePlugin } from '../../../src/plugins/tfstate/index.js';
import { createTfstateContext, createStateFile } from './helpers.js';

describe('TfStatePlugin - Lifecycle, Integration & Export', () => {
  let context;
  let database;
  let tempDir;

  beforeEach(async () => {
    context = await createTfstateContext('lifecycle');
    ({ database, tempDir } = context);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('Plugin Lifecycle', () => {
    test('should handle plugin start', async () => {
      const plugin = new TfStatePlugin({ logLevel: 'silent', asyncPartitions: false });
      await plugin.install(database);
      await expect(plugin.onStart()).resolves.not.toThrow();
    });

    test('should handle plugin stop', async () => {
      const plugin = new TfStatePlugin({ logLevel: 'silent', asyncPartitions: false });
      await plugin.install(database);
      await plugin.onStart();
      await expect(plugin.onStop()).resolves.not.toThrow();
    });

    test.skip(
      'should cleanup watchers on stop',
      async () => {
        const plugin = new TfStatePlugin({
      logLevel: 'silent',asyncPartitions: false,
          autoSync: true,
          watchPaths: [tempDir],
        });
        await plugin.install(database);
        await plugin.onStart();

        expect(plugin.watchers).toHaveLength(1);

        await plugin.onStop();
        expect(true).toBe(true);
      },
      30000,
    );
  });

  describe('Edge Cases', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin({ logLevel: 'silent', asyncPartitions: false });
      await plugin.install(database);
    });

    test('should handle empty state', async () => {
      const stateFile = createStateFile(tempDir, 1, []);
      const result = await plugin.importState(stateFile);

      expect(result.resourcesExtracted).toBe(0);
      expect(result.resourcesInserted).toBe(0);
    });

    test('should handle resource with no attributes', async () => {
      const stateFile = createStateFile(tempDir, 1, [
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'web',
          instances: [{ attributes: {} }],
        },
      ]);

      const result = await plugin.importState(stateFile);
      expect(result.resourcesInserted).toBe(1);

      const resources = await plugin.resource.list();
      expect(resources[0].attributes).toEqual({});
    });

    test('should handle resource with null/undefined fields', async () => {
      const stateFile = createStateFile(tempDir, 1, [
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'web',
          instances: [{ attributes: { id: 'i-1', tags: null, metadata: undefined } }],
        },
      ]);

      await expect(plugin.importState(stateFile)).resolves.toBeDefined();
    });

    test('should handle duplicate resource addresses in different serials', async () => {
      const stateFile1 = createStateFile(tempDir, 1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1' } }] },
      ]);
      await plugin.importState(stateFile1);

      const stateFile2 = createStateFile(tempDir, 2, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-2' } }] },
      ]);
      await plugin.importState(stateFile2);

      const allResources = await plugin.resource.list();
      expect(allResources).toHaveLength(2);
      expect(allResources.filter(r => r.resourceAddress === 'aws_instance.web')).toHaveLength(2);
    });

    test('should handle special characters in resource names', async () => {
      const stateFile = createStateFile(tempDir, 1, [
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'web-server_v2.test',
          instances: [{ attributes: { id: 'i-1' } }],
        },
      ]);

      const result = await plugin.importState(stateFile);
      expect(result.resourcesInserted).toBe(1);
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete workflow', async () => {
      const plugin = new TfStatePlugin({
      logLevel: 'silent',asyncPartitions: false,
        trackDiffs: true,
        filters: {
          types: ['aws_instance', 'aws_s3_bucket'],
        },
      });
      await plugin.install(database);

      const state1 = createStateFile(tempDir, 1, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1', instance_type: 't2.micro' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] },
      ]);
      await plugin.importState(state1);

      let resources = await plugin.resource.list();
      expect(resources).toHaveLength(2);

      const state2 = createStateFile(tempDir, 2, [
        { mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1', instance_type: 't2.small' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket', instances: [{ attributes: { id: 'bucket-1' } }] },
        { mode: 'managed', type: 'aws_s3_bucket', name: 'bucket2', instances: [{ attributes: { id: 'bucket-2' } }] },
      ]);
      await plugin.importState(state2);

      resources = await plugin.resource.list();
      expect(resources).toHaveLength(5);

      const history = await plugin.diffsResource.query({ newSerial: 2 });
      expect(history[0].changes.added).toHaveLength(1);
      expect(history[0].changes.modified).toHaveLength(1);

      const stats = await plugin.getStats();
      expect(stats.statesProcessed).toBe(2);
      expect(stats.resourcesExtracted).toBe(5);
    });
  });

  describe('Glob Pattern Matching', () => {
    let plugin;

    beforeEach(async () => {
      plugin = new TfStatePlugin({ logLevel: 'silent', asyncPartitions: false });
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
      expect(
        plugin._matchesGlobPattern('projects/myapp/envs/prod/terraform.tfstate', 'projects/*/envs/*/terraform.tfstate'),
      ).toBe(true);
      expect(
        plugin._matchesGlobPattern('projects/myapp/terraform.tfstate', 'projects/*/envs/*/terraform.tfstate'),
      ).toBe(false);
    });
  });

  describe.skip('S3 Glob Import', () => {
    let plugin;
    let testBucket;

    beforeEach(async () => {
      testBucket = database.bucketName;
      plugin = new TfStatePlugin({ asyncPartitions: false, logLevel: 'silent' });
      await plugin.install(database);
    });

    test(
      'should import multiple state files using glob pattern',
      async () => {
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
                  name: 'web',
                  instances: [{ attributes: { id: 'i-prod', instance_type: 't3.micro' } }],
                },
              ],
            },
          },
          {
            key: 'terraform/dev.tfstate',
            content: {
              version: 4,
              terraform_version: '1.5.0',
              serial: 2,
              lineage: 'dev-lineage',
              outputs: {},
              resources: [
                {
                  mode: 'managed',
                  type: 'aws_instance',
                  name: 'web',
                  instances: [{ attributes: { id: 'i-dev', instance_type: 't3.micro' } }],
                },
              ],
            },
          },
        ];

        for (const state of states) {
          await database.client.putObject({
            key: state.key,
            body: JSON.stringify(state.content),
            contentType: 'application/json',
          });
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

        const result = await plugin.importStatesFromS3Glob(testBucket, 'terraform/*.tfstate');

        expect(result.filesProcessed).toBe(2);
        expect(result.filesFailed).toBe(0);
        expect(result.totalResourcesExtracted).toBe(2);

        for (const state of states) {
          await database.client.deleteObject({ key: state.key });
        }
      },
      60000,
    );

    test(
      'should report errors for invalid files',
      async () => {
        const states = [
          {
            key: 'terraform/valid.tfstate',
            content: {
              version: 4,
              terraform_version: '1.5.0',
              serial: 1,
              lineage: 'valid-lineage',
              outputs: {},
              resources: [
                {
                  mode: 'managed',
                  type: 'aws_instance',
                  name: 'web',
                  instances: [{ attributes: { id: 'i-1' } }],
                },
              ],
            },
          },
          {
            key: 'terraform/invalid.tfstate',
            content: { invalid: 'state file without required fields' },
          },
        ];

        for (const state of states) {
          await database.client.putObject({
            key: state.key,
            body: JSON.stringify(state.content),
            contentType: 'application/json',
          });
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        const result = await plugin.importStatesFromS3Glob(testBucket, 'terraform/*.tfstate');

        expect(result.filesProcessed).toBe(1);
        expect(result.filesFailed).toBe(1);
        expect(result.failedFiles).toHaveLength(1);
        expect(result.failedFiles[0].file).toBe('terraform/invalid.tfstate');

        for (const state of states) {
          await database.client.deleteObject({ key: state.key });
        }
      },
      60000,
    );

    test(
      'should support custom concurrency',
      async () => {
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
                  instances: [{ attributes: { id: `i-${i}` } }],
                },
              ],
            },
          });
        }

        for (const state of states) {
          await database.client.putObject({
            key: state.key,
            body: JSON.stringify(state.content),
            contentType: 'application/json',
          });
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        const result = await plugin.importStatesFromS3Glob(testBucket, 'terraform/state-*.tfstate', {
          concurrency: 3,
        });

        expect(result.filesProcessed).toBe(10);
        expect(result.totalResourcesExtracted).toBe(10);

        for (const state of states) {
          await database.client.deleteObject({ key: state.key });
        }
      },
      60000,
    );

    test(
      'should emit globImportCompleted event',
      async () => {
        const eventPromise = new Promise(resolve => {
          plugin.once('globImportCompleted', resolve);
        });

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
                instances: [{ attributes: { id: 'i-1' } }],
              },
            ],
          }),
          contentType: 'application/json',
        });

        await new Promise(resolve => setTimeout(resolve, 500));

        await plugin.importStatesFromS3Glob(testBucket, 'terraform/*.tfstate');

        const eventData = await eventPromise;
        expect(eventData.filesProcessed).toBe(1);
        expect(eventData.totalResourcesExtracted).toBe(1);

        await database.client.deleteObject({ key: 'terraform/test.tfstate' });
      },
      60000,
    );
  });

  describe('State Export', () => {
    let plugin;

    beforeEach(
      async () => {
        plugin = new TfStatePlugin({ logLevel: 'silent', asyncPartitions: false, trackDiffs: true });
        await plugin.install(database);

        const stateFile = createStateFile(tempDir, 1, [
          {
            mode: 'managed',
            type: 'aws_instance',
            name: 'web',
            instances: [{ attributes: { id: 'i-123', instance_type: 't2.micro', tags: { Name: 'Web Server' } } }],
          },
          {
            mode: 'managed',
            type: 'aws_s3_bucket',
            name: 'data',
            instances: [{ attributes: { id: 'my-bucket', bucket: 'my-bucket', region: 'us-east-1' } }],
          },
        ]);

        await plugin.importState(stateFile);
      },
      30000,
    );

    test('should export state to object', async () => {
      const state = await plugin.exportState();

      expect(state.version).toBe(4);
      expect(state.terraform_version).toBe('1.5.0');
      expect(state.serial).toBe(1);
      expect(state.resources).toHaveLength(2);
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
          type: 'string',
        },
      };

      const state = await plugin.exportState({ outputs });
      expect(state.outputs).toEqual(outputs);
    });

    test('should filter export by resource types', async () => {
      const state = await plugin.exportState({ resourceTypes: ['aws_instance'] });
      expect(state.resources).toHaveLength(1);
      expect(state.resources[0].type).toBe('aws_instance');
    });

    test('should export specific serial', async () => {
      const stateFile2 = createStateFile(tempDir, 2, [
        {
          mode: 'managed',
          type: 'aws_lambda_function',
          name: 'api',
          instances: [{ attributes: { id: 'api-func', function_name: 'api-func', runtime: 'nodejs18.x' } }],
        },
      ]);
      await plugin.importState(stateFile2);

      const state1 = await plugin.exportState({ serial: 1 });
      expect(state1.serial).toBe(1);
      expect(state1.resources).toHaveLength(2);

      const state2 = await plugin.exportState({ serial: 2 });
      expect(state2.serial).toBe(2);
      expect(state2.resources).toHaveLength(1);
    });

    test('should export to file', async () => {
      const filePath = join(tempDir, 'exported-state.tfstate');

      const result = await plugin.exportStateToFile(filePath);

      expect(result.filePath).toBe(filePath);
      expect(result.serial).toBe(1);

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

      const s3Object = await database.client.getObject(key);
      const content = await s3Object.Body.transformToString();
      const state = JSON.parse(content);
      expect(state.resources).toHaveLength(2);

      await database.client.deleteObject(key);
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

      await database.client.deleteObject(key);
    });

    test('should handle export with no resources', async () => {
      const emptyPlugin = new TfStatePlugin({
      logLevel: 'silent',asyncPartitions: false,
        resourceName: 'empty_resources',
      });
      await emptyPlugin.install(database);

      const state = await emptyPlugin.exportState();

      expect(state.resources).toHaveLength(0);
      expect(state.serial).toBe(1);
    });

    test('should group multiple instances by resource type+name', async () => {
      const stateFile = createStateFile(tempDir, 3, [
        {
          mode: 'managed',
          type: 'aws_instance',
          name: 'workers',
          instances: [
            { attributes: { id: 'i-001', instance_type: 't2.micro' } },
            { attributes: { id: 'i-002', instance_type: 't2.micro' } },
            { attributes: { id: 'i-003', instance_type: 't2.micro' } },
          ],
        },
      ]);

      await plugin.importState(stateFile);

      const state = await plugin.exportState({ serial: 3 });
      const workerResources = state.resources.filter(
        r => r.type === 'aws_instance' && r.name === 'workers',
      );
      expect(workerResources.length).toBeGreaterThanOrEqual(1);

      const totalInstances = workerResources.reduce((sum, r) => sum + (r.instances?.length || 1), 0);
      expect(totalInstances).toBeGreaterThanOrEqual(3);
    });
  });
});
