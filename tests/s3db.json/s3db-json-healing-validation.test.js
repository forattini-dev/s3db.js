import { Database } from '../../src/database.class.js';
import { createDatabaseForTest } from '../config.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const assetsPath = join(__dirname, 'assets');

describe('S3DB JSON Healing Validation Tests', () => {
  let database;

  beforeEach(async () => {
    database = await createDatabaseForTest('suite=s3db-json/healing-validation', {
      versioningEnabled: true,
      logLevel: 'silent',
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

  describe('Verified Self-Healing Cases', () => {
    test('heals invalid JSON syntax automatically', async () => {
      const invalidJson = '{ "version": "1", "s3dbVersion": "8.0.2", "resources": { "test":';
      
      await database.client.putObject({
        key: 's3db.json',
        body: invalidJson,
        contentType: 'application/json'
      });

      // Should connect successfully after healing
      await database.connect();
      
      expect(database.savedMetadata).toBeDefined();
      expect(database.savedMetadata.version).toBe("1");
      expect(database.savedMetadata.s3dbVersion).toBe("latest");
    });

    test('heals empty file by creating blank structure', async () => {
      await database.client.putObject({
        key: 's3db.json',
        body: '',
        contentType: 'application/json'
      });

      // Should connect successfully after healing
      await database.connect();
      
      expect(database.savedMetadata).toBeDefined();
      expect(database.savedMetadata.version).toBe("1");
      expect(database.savedMetadata.resources).toEqual({});
    });

    test('heals non-JSON content by creating blank structure', async () => {
      await database.client.putObject({
        key: 's3db.json',
        body: 'This is not JSON at all!',
        contentType: 'application/json'
      });

      // Should connect successfully after healing
      await database.connect();
      
      expect(database.savedMetadata).toBeDefined();
      expect(database.savedMetadata.version).toBe("1");
      expect(database.savedMetadata.resources).toEqual({});
    });

    test('heals missing version field', async () => {
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
      
      expect(database.savedMetadata.version).toBe("1");
      expect(database.savedMetadata.s3dbVersion).toBe("8.0.2");
    });

    test('heals missing s3dbVersion field', async () => {
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
      
      expect(database.savedMetadata.version).toBe("1");
      expect(database.savedMetadata.s3dbVersion).toBeDefined();
    });

    test('heals missing resources field', async () => {
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
      
      expect(database.savedMetadata.resources).toEqual({});
    });

    test('heals resource with missing currentVersion', async () => {
      const assetContent = readFileSync(join(assetsPath, 'current-version-does-not-exists.json'), 'utf8');
      
      await database.client.putObject({
        key: 's3db.json',
        body: assetContent,
        contentType: 'application/json'
      });

      await database.connect();
      
      // The resource should be healed - currentVersion should be set to v0 since v1 doesn't exist
      expect(database.savedMetadata.resources.invitations).toBeDefined();
      expect(database.savedMetadata.resources.invitations.currentVersion).toBe('v0');
    });

    test('heals null hooks by filtering them out', async () => {
      const assetContent = readFileSync(join(assetsPath, 'hooks-null.json'), 'utf8');
      
      await database.client.putObject({
        key: 's3db.json',
        body: assetContent,
        contentType: 'application/json'
      });

      await database.connect();
      
      // Should work without throwing, hooks should be cleaned
      expect(database.resources.invitations).toBeDefined();
      const hooks = database.savedMetadata.resources.invitations.versions.v0.hooks;
      expect(hooks.beforeInsert).toEqual([]); // null values should be filtered out
    });

    test('heals invalid data types', async () => {
      const invalidTypes = {
        version: 123, // should be string
        s3dbVersion: true, // should be string
        resources: [] // should be object
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(invalidTypes),
        contentType: 'application/json'
      });

      await database.connect();
      
      expect(database.savedMetadata.version).toBe("123");
      expect(typeof database.savedMetadata.s3dbVersion).toBe("string");
      expect(database.savedMetadata.resources).toEqual({});
    });

    test('heals resource with missing versions object', async () => {
      const missingVersionsObj = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: {
          "test": {
            currentVersion: "v1",
            partitions: {}
          }
        }
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(missingVersionsObj),
        contentType: 'application/json'
      });

      await database.connect();
      
      // Resource should be removed since it has no valid versions
      expect(database.savedMetadata.resources.test).toBeUndefined();
    });

    test('heals hooks with undefined values', async () => {
      const undefinedHooks = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: {
          "test": {
            currentVersion: "v1",
            partitions: {},
            versions: {
              "v1": {
                hash: "sha256:test",
                attributes: { name: "string" },
                behavior: "user-managed",
                hooks: {
                  beforeInsert: [undefined, null, "", 0, false, "valid_hook"]
                }
              }
            }
          }
        }
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(undefinedHooks),
        contentType: 'application/json'
      });

      await database.connect();
      
      // Should connect successfully and clean hooks
      expect(database.resources.test).toBeDefined();
      const hooks = database.savedMetadata.resources.test.versions.v1.hooks;
      expect(hooks.beforeInsert).toEqual([0, false, "valid_hook"]); // null and undefined filtered out
    });
  });

  describe('Complex Healing Scenarios', () => {
    test('handles deeply nested corruption with partial recovery', async () => {
      const partiallyCorrupt = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: {
          "valid": {
            currentVersion: "v1",
            versions: {
              "v1": {
                hash: "sha256:test",
                attributes: { name: "string" }
              }
            }
          },
          "invalid_no_versions": {
            currentVersion: "v1"
            // missing versions
          },
          "invalid_bad_version": {
            currentVersion: "v999",
            versions: {
              "v1": {
                hash: "sha256:test",
                attributes: { name: "string" }
              }
            }
          },
          "invalid_no_attributes": {
            currentVersion: "v1",
            versions: {
              "v1": {
                hash: "sha256:test"
                // missing attributes
              }
            }
          }
        }
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(partiallyCorrupt),
        contentType: 'application/json'
      });

      await database.connect();
      
      // Only valid resource should survive
      expect(database.resources.valid).toBeDefined();
      expect(database.resources.invalid_no_versions).toBeUndefined();
      
      // Resource with bad version should be healed to use v0
      expect(database.resources.invalid_bad_version).toBeDefined();
      expect(database.savedMetadata.resources.invalid_bad_version.currentVersion).toBe("v1");
      
      // Resource without attributes should be removed
      expect(database.resources.invalid_no_attributes).toBeUndefined();
    });

    test('adds missing lastUpdated field during healing', async () => {
      const noLastUpdated = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: {}
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(noLastUpdated),
        contentType: 'application/json'
      });

      await database.connect();
      
      expect(database.savedMetadata.lastUpdated).toBeDefined();
      expect(() => new Date(database.savedMetadata.lastUpdated).toISOString()).not.toThrow();
    });

    test('emits metadataHealed event for healed files', async () => {
      const healingPromise = new Promise((resolve) => {
        database.once('db:metadata-healed', resolve);
      });

      const corruptedJson = '{ "version": "1", "resources": { "test": "invalid" }';
      
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
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    test('handles extremely malformed JSON gracefully', async () => {
      const extremelyBad = '{{{[[["""invalid""":::}}}';
      
      await database.client.putObject({
        key: 's3db.json',
        body: extremelyBad,
        contentType: 'application/json'
      });

      await database.connect();
      
      // Should fall back to blank structure
      expect(database.savedMetadata.version).toBe("1");
      expect(database.savedMetadata.resources).toEqual({});
    });

    test('handles mixed valid and invalid resources', async () => {
      const mixed = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: {
          "valid1": {
            currentVersion: "v1",
            versions: {
              "v1": {
                hash: "sha256:test1",
                attributes: { name: "string" }
              }
            }
          },
          "invalid": {
            currentVersion: "v1",
            versions: {}
          },
          "valid2": {
            currentVersion: "v1",
            versions: {
              "v1": {
                hash: "sha256:test2",
                attributes: { email: "string" }
              }
            }
          }
        }
      };
      
      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(mixed),
        contentType: 'application/json'
      });

      await database.connect();
      
      expect(database.resources.valid1).toBeDefined();
      expect(database.resources.valid2).toBeDefined();
      expect(database.resources.invalid).toBeUndefined();
    });
  });
}); 