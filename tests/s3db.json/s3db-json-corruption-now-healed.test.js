import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { createDatabaseForTest } from '../config.js';

describe('S3DB JSON Corruption - Now Successfully Healed', () => {
  let database;

  beforeEach(async () => {
    database = await createDatabaseForTest('suite=s3db-json/corruption-healed', {
      versioningEnabled: true,
      verbose: false,
      persistHooks: true
    });
  });

  afterEach(async () => {
    if (database?.client) {
      try {
        await database.client.deleteObject({ key: 's3db.json' });
      } catch (error) {
        // Ignore errors if file doesn't exist
      }
    }
  });

  describe('Malformed JSON Files - Now Healed', () => {
    test('should heal invalid JSON syntax successfully', async () => {
      const invalidJson = '{ "version": "1", "s3dbVersion": "8.0.2", "resources": { "test":';
      
      await database.client.putObject({
        key: 's3db.json',
        body: invalidJson,
        contentType: 'application/json'
      });
      
      await database.connect();
      expect(database.savedMetadata).toBeDefined();
      expect(database.savedMetadata.version).toBe("1");
    });

    test('should heal empty file successfully', async () => {
      await database.client.putObject({
        key: 's3db.json',
        body: '',
        contentType: 'application/json'
      });
      
      await database.connect();
      expect(database.savedMetadata).toBeDefined();
      expect(database.savedMetadata.version).toBe("1");
      expect(database.savedMetadata.resources).toEqual({});
    });

    test('should heal non-JSON content successfully', async () => {
      await database.client.putObject({
        key: 's3db.json',
        body: 'This is not JSON at all!',
        contentType: 'application/json'
      });
      
      await database.connect();
      expect(database.savedMetadata).toBeDefined();
      expect(database.savedMetadata.version).toBe("1");
      expect(database.savedMetadata.resources).toEqual({});
    });
  });

  describe('Missing Structure Elements - Now Healed', () => {
    test('should heal missing version field successfully', async () => {
      const missingVersion = {
        s3dbVersion: "8.0.2",
        resources: {}
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(missingVersion),
        contentType: 'application/json'
      });
      
      await database.connect();
      expect(database.savedMetadata).toBeDefined();
      expect(database.savedMetadata.version).toBe("1");
      expect(database.savedMetadata.s3dbVersion).toBe("8.0.2");
    });

    test('should heal missing s3dbVersion field successfully', async () => {
      const missingS3dbVersion = {
        version: "1",
        resources: {}
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(missingS3dbVersion),
        contentType: 'application/json'
      });
      
      await database.connect();
      expect(database.savedMetadata).toBeDefined();
      expect(database.savedMetadata.version).toBe("1");
      expect(typeof database.savedMetadata.s3dbVersion).toBe("string");
    });

    test('should heal missing resources field successfully', async () => {
      const missingResources = {
        version: "1",
        s3dbVersion: "8.0.2"
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(missingResources),
        contentType: 'application/json'
      });
      
      await database.connect();
      expect(database.savedMetadata).toBeDefined();
      expect(database.savedMetadata.resources).toEqual({});
    });
  });

  describe('Invalid Data Types - Now Healed', () => {
    test('should heal version as number successfully', async () => {
      const invalidVersion = {
        version: 123,
        s3dbVersion: "8.0.2",
        resources: {}
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(invalidVersion),
        contentType: 'application/json'
      });
      
      await database.connect();
      expect(database.savedMetadata).toBeDefined();
      expect(database.savedMetadata.version).toBe("123");
      expect(typeof database.savedMetadata.version).toBe("string");
    });

    test('should heal resources as array successfully', async () => {
      const invalidResources = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: []
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(invalidResources),
        contentType: 'application/json'
      });
      
      await database.connect();
      expect(database.savedMetadata).toBeDefined();
      expect(database.savedMetadata.resources).toEqual({});
    });
  });

  describe('Resource Issues - Now Healed', () => {
    test('should heal null hooks successfully', async () => {
      const nullHooks = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: {
          "test": {
            currentVersion: "v1",
            versions: {
              "v1": {
                hash: "sha256:test",
                attributes: { name: "string" },
                hooks: {
                  beforeInsert: [null, undefined, ""]
                }
              }
            }
          }
        }
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(nullHooks),
        contentType: 'application/json'
      });
      
      await database.connect();
      expect(database.savedMetadata).toBeDefined();
      expect(database.resources.test).toBeDefined();
      // null, undefined, and empty strings should be filtered out
      const hooks = database.savedMetadata.resources.test.versions.v0.hooks;
      expect(hooks.beforeInsert).toEqual([]);
    });
  });

  describe('Cases That Still Fail (As Expected)', () => {
    test('should still fail on deeply nested invalid structures', async () => {
      const deeplyInvalid = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: {
          "test": {
            currentVersion: "v1",
            versions: {
              "v1": {
                hash: "sha256:test",
                attributes: { 
                  name: "string",
                  deep: "too_deep" // This causes validator error
                }
              }
            }
          }
        }
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(deeplyInvalid),
        contentType: 'application/json'
      });
      
      await expect(database.connect()).rejects.toThrow();
    });
  });
});