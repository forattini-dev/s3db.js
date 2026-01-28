/**
 * Test to verify if partition indices bug still exists
 * Bug description: partition indices return fewer results than actually exist
 *
 * This test replicates the scenario from the env-vars service where
 * partitions were disabled due to suspected index sync issues.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { createDatabaseForTest } from '#tests/config.js';

describe('Partition Bug Verification - Index Sync Issues', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=partition-bug-verification');
    await database.connect();
  });

  test('Partition indices should return all matching records', async () => {
    // Create resource with same partition structure as env-vars service
    const resource = await database.createResource({
      name: 'env_vars',
      asyncPartitions: false, // Use sync mode for predictability
      attributes: {
        id: 'string|optional',
        project: 'string|required',
        service: 'string|optional',
        environment: 'string|required',
        key: 'string|required',
        value: 'string|required'
      },
      partitions: {
        byProjectServiceEnv: {
          fields: {
            project: 'string',
            service: 'string',
            environment: 'string'
          }
        },
        byProjectEnv: {
          fields: {
            project: 'string',
            environment: 'string'
          }
        },
        byProject: {
          fields: {
            project: 'string'
          }
        },
        byEnvironment: {
          fields: {
            environment: 'string'
          }
        }
      }
    });

    // Insert multiple records with same partition values
    const testData = [
      { project: 'proj1', service: 'svc1', environment: 'dev', key: 'KEY1', value: 'val1' },
      { project: 'proj1', service: 'svc1', environment: 'dev', key: 'KEY2', value: 'val2' },
      { project: 'proj1', service: 'svc1', environment: 'dev', key: 'KEY3', value: 'val3' },
      { project: 'proj1', service: 'svc1', environment: 'dev', key: 'KEY4', value: 'val4' },
      { project: 'proj1', service: 'svc1', environment: 'dev', key: 'KEY5', value: 'val5' },
      { project: 'proj1', service: 'svc2', environment: 'dev', key: 'KEY6', value: 'val6' },
      { project: 'proj1', service: 'svc2', environment: 'dev', key: 'KEY7', value: 'val7' },
      { project: 'proj1', environment: 'prd', key: 'KEY8', value: 'val8' },
      { project: 'proj2', environment: 'dev', key: 'KEY9', value: 'val9' },
    ];

    for (const data of testData) {
      await resource.insert(data);
    }

    // Wait for partition indices to be created
    await new Promise(resolve => setTimeout(resolve, 100));

    // Test 1: byProjectServiceEnv partition
    const ids1 = await resource.listIds({
      partition: 'byProjectServiceEnv',
      partitionValues: { project: 'proj1', service: 'svc1', environment: 'dev' }
    });
    expect(ids1.length).toBe(5);

    // Test 2: byProjectEnv partition
    const ids2 = await resource.listIds({
      partition: 'byProjectEnv',
      partitionValues: { project: 'proj1', environment: 'dev' }
    });
    expect(ids2.length).toBe(7);

    // Test 3: byProject partition
    const ids3 = await resource.listIds({
      partition: 'byProject',
      partitionValues: { project: 'proj1' }
    });
    expect(ids3.length).toBe(8);

    // Test 4: byEnvironment partition
    const ids4 = await resource.listIds({
      partition: 'byEnvironment',
      partitionValues: { environment: 'dev' }
    });
    expect(ids4.length).toBe(8); // All except KEY8 (prd)

    // Test 5: Compare partition query with manual filter
    const allDocs = await resource.list();
    const manualFilter = allDocs.filter(d =>
      d.project === 'proj1' && d.service === 'svc1' && d.environment === 'dev'
    );
    expect(manualFilter.length).toBe(ids1.length);
  });

  test('asyncPartitions=true should also return all records', async () => {
    // Test with async mode to ensure it also works
    const resource = await database.createResource({
      name: 'env_vars_async',
      asyncPartitions: true, // Async mode
      attributes: {
        id: 'string|optional',
        project: 'string|required',
        service: 'string|optional',
        environment: 'string|required',
        key: 'string|required',
        value: 'string|required'
      },
      partitions: {
        byProjectServiceEnv: {
          fields: {
            project: 'string',
            service: 'string',
            environment: 'string'
          }
        }
      }
    });

    const testData = [
      { project: 'proj1', service: 'svc1', environment: 'dev', key: 'KEY1', value: 'val1' },
      { project: 'proj1', service: 'svc1', environment: 'dev', key: 'KEY2', value: 'val2' },
      { project: 'proj1', service: 'svc1', environment: 'dev', key: 'KEY3', value: 'val3' },
    ];

    for (const data of testData) {
      await resource.insert(data);
    }

    // Wait longer for async partition indices
    await new Promise(resolve => setTimeout(resolve, 300));

    const ids = await resource.listIds({
      partition: 'byProjectServiceEnv',
      partitionValues: { project: 'proj1', service: 'svc1', environment: 'dev' }
    });

    expect(ids.length).toBe(3);
  });
});
