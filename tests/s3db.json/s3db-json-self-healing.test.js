import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseForTest } from '../config.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const assetsPath = join(__dirname, 'assets');

describe('S3DB JSON Self-Healing Tests', () => {
  let database;

  beforeEach(async () => {
    database = await createDatabaseForTest('suite=s3db-json/self-healing-' + Date.now() + '-' + Math.random(), {
      versioningEnabled: true,
      logLevel: 'silent',
      persistHooks: true
    });
  });

  afterEach(async () => {
    if (database?.client) {
      try {
        if (database.bucket) {
          MemoryClient.clearBucketStorage(database.bucket);
        }
        await database.disconnect();
      } catch (error) {
        // ignore
      }
    }
  });

  describe('Existing Self-Healing Mechanisms', () => {
    test('should heal missing resources field', async () => {
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
      expect(Object.keys(database.resources)).toHaveLength(0);
    });

    test('should heal missing version field with automatic defaults', async () => {
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

      expect(database.savedMetadata.s3dbVersion).toBe("8.0.2");
      expect(database.savedMetadata.resources).toEqual({});
    });

    test('should heal missing currentVersion with v0 fallback', async () => {
      const assetContent = readFileSync(join(assetsPath, 'current-version-does-not-exists.json'), 'utf8');

      await database.client.putObject({
        key: 's3db.json',
        body: assetContent,
        contentType: 'application/json'
      });

      await database.connect();

      // Resource should be healed - currentVersion should be changed to v0
      expect(Object.keys(database.resources)).toHaveLength(1);
      expect(database.resources.invitations).toBeDefined();
      expect(database.savedMetadata.resources.invitations.currentVersion).toBe('v0');
    });

    test('should heal null hooks by filtering them out', async () => {
      const assetContent = readFileSync(join(assetsPath, 'hooks-null.json'), 'utf8');

      await database.client.putObject({
        key: 's3db.json',
        body: assetContent,
        contentType: 'application/json'
      });

      await database.connect();

      expect(database.resources.invitations).toBeDefined();
      const hooks = database.resources.invitations.hooks;
      expect(hooks.beforeInsert).toEqual([]);
    });

    test('should apply default values for missing configuration', async () => {
      const minimalResource = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: {
          "minimal": {
            currentVersion: "v1",
            versions: {
              "v1": {
                hash: "sha256:test",
                attributes: { name: "string" }
              }
            }
          }
        }
      };

      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(minimalResource),
        contentType: 'application/json'
      });

      await database.connect();

      const resource = database.resources.minimal;
      expect(resource).toBeDefined();
      expect(resource.behavior).toBe('user-managed');
      expect(resource.config.paranoid).toBe(true);
      expect(resource.config.allNestedObjectsOptional).toBe(true);
      expect(resource.config.autoDecrypt).toBe(true);
      expect(resource.config.timestamps).toBe(false);
    });

    test('should handle empty partitions gracefully', async () => {
      const emptyPartitions = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: {
          "test": {
            currentVersion: "v1",
            versions: {
              "v1": {
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
        body: JSON.stringify(emptyPartitions),
        contentType: 'application/json'
      });

      await database.connect();

      const resource = database.resources.test;
      expect(resource).toBeDefined();
      // Resources automatically get default partitions (byVersion, etc.)
      expect(resource.config.partitions).toBeDefined();
      expect(typeof resource.config.partitions).toBe('object');
    });
  });

  describe('Cases That Are Now Successfully Healed', () => {
    test('should heal malformed JSON successfully', async () => {
      const malformedJson = '{ "version": "1", "s3dbVersion": "8.0.2", "resources": { "test":';

      await database.client.putObject({
        key: 's3db.json',
        body: malformedJson,
        contentType: 'application/json'
      });

      await database.connect();
      expect(database.savedMetadata).toBeDefined();
      expect(database.savedMetadata.version).toBe("1");
    });

    test('should heal completely empty file successfully', async () => {
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

  describe('Advanced Healing Scenarios', () => {
    test('should handle mixed valid and invalid version references', async () => {
      const mixedVersions = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: {
          "valid": {
            currentVersion: "v1",
            versions: {
              "v1": {
                hash: "sha256:test1",
                attributes: { name: "string" },
                behavior: "user-managed"
              }
            }
          },
          "invalid_version": {
            currentVersion: "v999",
            versions: {
              "v1": {
                hash: "sha256:test2",
                attributes: { name: "string" },
                behavior: "user-managed"
              }
            }
          },
          "no_versions": {
            currentVersion: "v1",
            versions: {}
          }
        }
      };

      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(mixedVersions),
        contentType: 'application/json'
      });

      await database.connect();

      expect(database.resources.valid).toBeDefined();
      // invalid_version should be healed - currentVersion changed from v999 to v1 (first available version)
      expect(database.resources.invalid_version).toBeDefined();
      expect(database.savedMetadata.resources.invalid_version.currentVersion).toBe('v1');
      // no_versions should be removed since it has no valid versions
      expect(database.resources.no_versions).toBeUndefined();
    });

    test('should handle resources with missing required fields', async () => {
      const missingFields = {
        version: "1",
        s3dbVersion: "8.0.2",
        resources: {
          "no_hash": {
            currentVersion: "v1",
            versions: {
              "v1": {
                attributes: { name: "string" },
                behavior: "user-managed"
              }
            }
          },
          "no_attributes": {
            currentVersion: "v1",
            versions: {
              "v1": {
                hash: "sha256:test",
                behavior: "user-managed"
              }
            }
          }
        }
      };

      await database.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(missingFields),
        contentType: 'application/json'
      });

      await database.connect();

      // no_hash should be kept - hash is not a required field
      expect(database.resources.no_hash).toBeDefined();
      // no_attributes should be removed - attributes is required
      expect(database.resources.no_attributes).toBeUndefined();
    });
  });
});