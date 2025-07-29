import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { createDatabaseForTest } from '../config.js';

describe('S3DB JSON Advanced Self-Healing Tests', () => {
  let database;
  const testConnectionString = 'http://127.0.0.1:9000/bucket=s3db-advanced-healing-tests/region=us-east-1/accessKey=AKIAIOSFODNN7EXAMPLE/secretKey=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY/';

  beforeEach(async () => {
    database = await createDatabaseForTest({
      connectionString: testConnectionString,
      options: {
        versioningEnabled: true,
        verbose: true
      }
    });
  });

  afterEach(async () => {
    if (database?.client) {
      try {
        // Clean up all files
        const objects = await database.client.listObjects();
        if (objects && objects.Contents && objects.Contents.length > 0) {
          for (const obj of objects.Contents) {
            try {
              await database.client.deleteObject({ key: obj.Key });
            } catch (error) {
              // Ignore errors
            }
          }
        }
      } catch (error) {
        // Ignore errors
      }
    }
  });

  describe('JSON Recovery', () => {
    test('should heal malformed JSON with trailing comma', async () => {
      const malformedJson = `{
        "version": "1",
        "s3dbVersion": "8.0.2",
        "resources": {
          "test": {
            "currentVersion": "v0",
            "versions": {
              "v0": {
                "hash": "sha256:test",
                "attributes": { "name": "string" },
              }
            }
          },
        }
      }`;
      
      await database.client.putObject({
        key: 's3db.json',
        body: malformedJson,
        contentType: 'application/json'
      });

      await database.connect();
      
      expect(database.savedMetadata).toBeDefined();
      expect(database.savedMetadata.version).toBe("1");
      expect(database.savedMetadata.resources).toBeDefined();
    });

    test('should heal incomplete JSON by adding missing braces', async () => {
      const incompleteJson = `{
        "version": "1",
        "s3dbVersion": "8.0.2",
        "resources": {
          "test": {
            "currentVersion": "v0",
            "versions": {
              "v0": {
                "hash": "sha256:test",
                "attributes": { "name": "string" }`;
      
      await database.client.putObject({
        key: 's3db.json',
        body: incompleteJson,
        contentType: 'application/json'
      });

      await database.connect();
      
      expect(database.savedMetadata).toBeDefined();
      expect(database.savedMetadata.version).toBe("1");
    });

    test('should create backup when JSON is completely corrupted', async () => {
      const corruptedJson = 'completely invalid json {[}]{[';
      
      await database.client.putObject({
        key: 's3db.json',
        body: corruptedJson,
        contentType: 'application/json'
      });

      await database.connect();
      
      // Should create backup and use blank metadata
      expect(database.savedMetadata).toBeDefined();
      expect(database.savedMetadata.version).toBe("1");
      expect(database.savedMetadata.resources).toEqual({});
      
      // Check if backup was created
      const objects = await database.client.listObjects();
      const backupFiles = (objects.Contents || []).filter(obj => obj.Key.includes('corrupted') && obj.Key.includes('backup'));
      expect(backupFiles.length).toBeGreaterThan(0);
    });
  });

  describe('Structure Healing', () => {
    test('should heal missing required fields', async () => {
      const incompleteMetadata = {
        resources: {
          "test": {
            currentVersion: "v0",
            versions: {
              "v0": {
                hash: "sha256:test",
                attributes: { name: "string" }
              }
            }
          }
        }
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(incompleteMetadata),
        contentType: 'application/json'
      });

      await database.connect();
      
      expect(database.savedMetadata.version).toBe("1");
      expect(database.savedMetadata.s3dbVersion).toBeDefined();
      expect(database.savedMetadata.lastUpdated).toBeDefined();
    });

    test('should heal invalid resources field', async () => {
      const invalidResources = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: [] // Should be object, not array
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(invalidResources),
        contentType: 'application/json'
      });

      await database.connect();
      
      expect(database.savedMetadata.resources).toEqual({});
    });

    test('should heal resource with missing currentVersion', async () => {
      const missingCurrentVersion = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: {
          "test": {
            versions: {
              "v0": {
                hash: "sha256:test",
                attributes: { name: "string" }
              }
            }
          }
        }
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(missingCurrentVersion),
        contentType: 'application/json'
      });

      await database.connect();
      
      expect(database.savedMetadata.resources.test).toBeDefined();
      expect(database.savedMetadata.resources.test.currentVersion).toBe("v0");
    });

    test('should heal resource with non-existent currentVersion', async () => {
      const nonExistentVersion = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: {
          "test": {
            currentVersion: "v999", // doesn't exist
            versions: {
              "v0": {
                hash: "sha256:test",
                attributes: { name: "string" }
              },
              "v1": {
                hash: "sha256:test2",
                attributes: { name: "string", age: "number" }
              }
            }
          }
        }
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(nonExistentVersion),
        contentType: 'application/json'
      });

      await database.connect();
      
      expect(database.savedMetadata.resources.test).toBeDefined();
      // Should fall back to first available version
      expect(['v0', 'v1']).toContain(database.savedMetadata.resources.test.currentVersion);
    });

    test('should remove resource with no valid versions', async () => {
      const noValidVersions = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: {
          "invalid": {
            currentVersion: "v0",
            versions: {} // empty versions
          },
          "valid": {
            currentVersion: "v0",
            versions: {
              "v0": {
                hash: "sha256:test",
                attributes: { name: "string" }
              }
            }
          }
        }
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(noValidVersions),
        contentType: 'application/json'
      });

      await database.connect();
      
      expect(database.savedMetadata.resources.invalid).toBeUndefined();
      expect(database.savedMetadata.resources.valid).toBeDefined();
    });

    test('should remove resource with missing attributes', async () => {
      const missingAttributes = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: {
          "invalid": {
            currentVersion: "v0",
            versions: {
              "v0": {
                hash: "sha256:test"
                // missing attributes
              }
            }
          },
          "valid": {
            currentVersion: "v0",
            versions: {
              "v0": {
                hash: "sha256:test",
                attributes: { name: "string" }
              }
            }
          }
        }
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(missingAttributes),
        contentType: 'application/json'
      });

      await database.connect();
      
      expect(database.savedMetadata.resources.invalid).toBeUndefined();
      expect(database.savedMetadata.resources.valid).toBeDefined();
    });
  });

  describe('Hooks Healing', () => {
    test('should clean up null and undefined hooks', async () => {
      const invalidHooks = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: {
          "test": {
            currentVersion: "v0",
            versions: {
              "v0": {
                hash: "sha256:test",
                attributes: { name: "string" },
                hooks: {
                  beforeInsert: [null, undefined, "valid_hook", null],
                  afterInsert: [undefined, null]
                }
              }
            }
          }
        }
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(invalidHooks),
        contentType: 'application/json'
      });

      await database.connect();
      
      const hooks = database.savedMetadata.resources.test.versions.v0.hooks;
      expect(hooks.beforeInsert).toEqual(["valid_hook"]);
      expect(hooks.afterInsert).toEqual([]);
    });

    test('should remove non-array hooks', async () => {
      const invalidHooksStructure = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: {
          "test": {
            currentVersion: "v0",
            versions: {
              "v0": {
                hash: "sha256:test",
                attributes: { name: "string" },
                hooks: {
                  beforeInsert: "not_an_array",
                  afterInsert: { invalid: "object" },
                  beforeUpdate: ["valid_array"]
                }
              }
            }
          }
        }
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(invalidHooksStructure),
        contentType: 'application/json'
      });

      await database.connect();
      
      const hooks = database.savedMetadata.resources.test.versions.v0.hooks;
      expect(hooks.beforeInsert).toBeUndefined();
      expect(hooks.afterInsert).toBeUndefined();
      expect(hooks.beforeUpdate).toEqual(["valid_array"]);
    });

    test('should heal completely invalid hooks structure', async () => {
      const invalidHooksStructure = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: {
          "test": {
            currentVersion: "v0",
            versions: {
              "v0": {
                hash: "sha256:test",
                attributes: { name: "string" },
                hooks: "completely_invalid"
              }
            }
          }
        }
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(invalidHooksStructure),
        contentType: 'application/json'
      });

      await database.connect();
      
      const hooks = database.savedMetadata.resources.test.versions.v0.hooks;
      expect(hooks).toEqual({});
    });
  });

  describe('Events and Logging', () => {
    test('should emit metadataHealed event when healing occurs', async () => {
      const healingPromise = new Promise((resolve) => {
        database.once('metadataHealed', (data) => {
          resolve(data);
        });
      });

      const corruptedJson = `{
        "version": "1",
        "s3dbVersion": "8.0.2",
        "resources": {
          "test": {
            "currentVersion": "v0",
            "versions": {
              "v0": {
                "hash": "sha256:test",
                "attributes": { "name": "string" },
              }
            }
          },
        }
      }`;
      
      await database.client.putObject({
        key: 's3db.json',
        body: corruptedJson,
        contentType: 'application/json'
      });

      await database.connect();
      
      const healingData = await healingPromise;
      expect(healingData).toBeDefined();
      expect(healingData.healingLog).toBeDefined();
      expect(healingData.healingLog.length).toBeGreaterThan(0);
      expect(healingData.metadata).toBeDefined();
    });

    test('should not trigger healing for valid metadata', async () => {
      const validMetadata = {
        version: "1",
        s3dbVersion: "8.0.2",
        lastUpdated: new Date().toISOString(),
        resources: {
          "test": {
            currentVersion: "v0",
            partitions: {},
            versions: {
              "v0": {
                hash: "sha256:test",
                attributes: { name: "string" },
                behavior: "user-managed"
              }
            }
          }
        }
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(validMetadata, null, 2),
        contentType: 'application/json'
      });

      let healingEventFired = false;
      database.once('metadataHealed', () => {
        healingEventFired = true;
      });

      await database.connect();
      
      expect(healingEventFired).toBe(false);
      expect(database.savedMetadata).toEqual(validMetadata);
    });
  });
}); 