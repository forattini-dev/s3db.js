import { createDatabaseForTest } from '#tests/config.js';

describe('Resource key segment validation', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('resource-key-segment-validation');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.disconnect) {
      await database.disconnect();
    }
  });

  test('rejects resource names with unsafe characters', async () => {
    await expect(database.createResource({
      name: 'users/bad',
      attributes: { id: 'string|optional' }
    })).rejects.toThrow(/URL-friendly/);
  });

  test('rejects partition names with unsafe characters', async () => {
    await expect(database.createResource({
      name: 'users',
      attributes: {
        id: 'string|optional',
        region: 'string|required'
      },
      partitions: {
        'by/Region': {
          fields: { region: 'string' }
        }
      }
    })).rejects.toThrow(/Partition name/);
  });

  test('rejects partition field names with unsafe characters', async () => {
    await expect(database.createResource({
      name: 'users',
      attributes: {
        id: 'string|optional',
        region: 'string|required'
      },
      partitions: {
        byRegion: {
          fields: { 're=gion': 'string' }
        }
      }
    })).rejects.toThrow(/Partition field/);
  });

  test('getFromPartition rejects unsafe ids and partition values', async () => {
    const resource = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|optional',
        region: 'string|required'
      },
      partitions: {
        byRegion: {
          fields: { region: 'string' }
        }
      }
    });

    await resource.insert({
      id: 'user-1',
      region: 'US'
    });

    await expect(resource.getFromPartition({
      id: 'user/1',
      partitionName: 'byRegion',
      partitionValues: { region: 'US' }
    })).rejects.toMatchObject({
      name: 'ValidationError',
      statusCode: 400,
      constraint: 'url-safe'
    });

    await expect(resource.getFromPartition({
      id: 'user-1',
      partitionName: 'byRegion',
      partitionValues: { region: 'US/CA' }
    })).rejects.toMatchObject({
      name: 'ValidationError',
      statusCode: 400,
      constraint: 'url-safe'
    });
  });
});
