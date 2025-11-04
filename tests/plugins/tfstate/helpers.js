import { rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import { createDatabaseForTest, createTemporaryPathForTest } from '../../config.js';
import { MemoryClient } from '../../../src/clients/memory-client.class.js';
import { TfStatePlugin } from '../../../src/plugins/tfstate/index.js';

export async function createTfstateContext(suffix = 'default') {
  MemoryClient.clearAllStorage();

  const database = createDatabaseForTest(`suite=plugins/terraform-state-${suffix}`);
  await database.connect();
  const tempDir = await createTemporaryPathForTest(`terraform-state-${suffix}`);

  return {
    database,
    tempDir,
    async cleanup() {
      await database.disconnect();
      MemoryClient.clearAllStorage();
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup failures
      }
    }
  };
}

export function createStateFile(tempDir, serial, resources, options = {}) {
  const state = {
    version: options.version ?? 4,
    terraform_version: options.terraformVersion ?? '1.5.0',
    serial,
    lineage: options.lineage ?? 'example-lineage-abc-123',
    outputs: options.outputs ?? {},
    resources,
  };

  const fileName = options.fileName ?? `test-state-${serial}.tfstate`;
  const filePath = join(tempDir, fileName);
  writeFileSync(filePath, JSON.stringify(state, null, 2));
  return filePath;
}

export function createPlugin(options = {}) {
  return new TfStatePlugin(options);
}
